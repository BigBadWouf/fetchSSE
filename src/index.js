const fetchSSE = (url, options = {}) => {
  const {
    method = 'GET',
    headers = {},
    body = null,
    credentials = 'include',
    mode = 'cors',
    retryDelay = 3000,
    maxRetries = Infinity,
    customRetryLogic = null,
    // Autres options fetch possibles
    cache = 'no-cache',
    redirect = 'follow',
    referrer,
    referrerPolicy,
    integrity,
    keepalive,
  } = options;

  let abortController = null;
  let reader = null;
  let isClosed = false;
  let retryTimeout = null;
  let retryCount = 0;
  let lastEventId = null;
  let currentRetryDelay = retryDelay; // Variable locale pour gérer les changements dynamiques

  const sse = {
    listeners: {},
    onmessage: null,
    onerror: null,
    onopen: null,
    readyState: 0, // 0: CONNECTING, 1: OPEN, 2: CLOSED

    addEventListener(event, callback) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
    },

    removeEventListener(event, callback) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        if (this.listeners[event].length === 0) delete this.listeners[event];
      }
    },

    dispatchEvent(event, data, eventId = null) {
      const eventObject = {
        type: event,
        data: data,
        lastEventId: eventId,
        origin: new URL(url).origin,
        target: this
      };

      const callbacks = this.listeners[event] || [];
      for (const cb of callbacks) cb(eventObject);

      // Dispatch vers les handlers natifs
      if (event === 'message' && typeof this.onmessage === 'function') {
        this.onmessage(eventObject);
      } else if (event === 'error' && typeof this.onerror === 'function') {
        this.onerror(eventObject);
      } else if (event === 'open' && typeof this.onopen === 'function') {
        this.onopen(eventObject);
      }
    },

    addJSONEventListener(event, callback) {
      this.addEventListener(event, (eventObject) => {
        try {
          const jsonData = JSON.parse(eventObject.data);
          callback({
            ...eventObject,
            data: jsonData
          });
        } catch (err) {
          console.warn(`Invalid JSON for event "${event}"`, eventObject.data, err);
        }
      });
    },

    close() {
      isClosed = true;
      this.readyState = 2; // CLOSED
      clearTimeout(retryTimeout);
      if (abortController) abortController.abort();
      if (reader) reader.cancel();
      this.listeners = {};
    },

    getLastEventId() {
      return lastEventId;
    },

    setLastEventId(id) {
      lastEventId = id;
    }
  };

  const buildFetchOptions = () => {
    const fetchHeaders = {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...headers // Les headers personnalisés écrasent les defaults
    };

    // Ajouter Last-Event-ID si disponible
    if (lastEventId !== null) {
      fetchHeaders['Last-Event-ID'] = lastEventId;
    }

    // Construire les options fetch en utilisant TOUTES les options passées
    const fetchOptions = {
      method,
      headers: fetchHeaders,
      credentials,
      mode,
      cache,
      redirect,
      signal: abortController.signal, // Notre signal écrase celui passé en option
    };

    // Ajouter les options optionnelles seulement si elles sont définies
    if (referrer !== undefined) fetchOptions.referrer = referrer;
    if (referrerPolicy !== undefined) fetchOptions.referrerPolicy = referrerPolicy;
    if (integrity !== undefined) fetchOptions.integrity = integrity;
    if (keepalive !== undefined) fetchOptions.keepalive = keepalive;

    // Ajouter le body pour les requêtes POST/PUT/PATCH
    if (body !== null && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      if (typeof body === 'object' && body !== null && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof ReadableStream)) {
        fetchOptions.body = JSON.stringify(body);
        // Ne pas écraser Content-Type s'il est déjà défini
        if (!fetchOptions.headers['Content-Type'] && !fetchOptions.headers['content-type']) {
          fetchOptions.headers['Content-Type'] = 'application/json';
        }
      } else {
        fetchOptions.body = body;
      }
    }

    return fetchOptions;
  };

  const parseSSEEvent = (eventData) => {
    const eventParts = eventData.split('\n');
    let eventName = 'message';
    let eventDataString = '';
    let eventId = null;
    let retry = null;

    eventParts.forEach(part => {
      const colonIndex = part.indexOf(':');
      if (colonIndex === -1) {
        // Ligne sans ':' - ignorer ou traiter comme commentaire
        return;
      }

      const key = part.slice(0, colonIndex).trim();
      const value = part.slice(colonIndex + 1).trim();

      switch (key) {
        case 'event':
          eventName = value;
          break;
        case 'data':
          eventDataString += (eventDataString ? '\n' : '') + value;
          break;
        case 'id':
          eventId = value;
          break;
        case 'retry':
          const retryValue = parseInt(value, 10);
          if (!isNaN(retryValue)) {
            retry = retryValue;
          }
          break;
      }
    });

    return { eventName, eventDataString, eventId, retry };
  };

  const shouldRetry = (error) => {
    if (customRetryLogic) {
      return customRetryLogic(error, retryCount);
    }
    
    // Logique de retry par défaut
    if (retryCount >= maxRetries) return false;
    
    // Ne pas retry sur certaines erreurs HTTP
    if (error.status && [400, 401, 403, 404, 410].includes(error.status)) {
      return false;
    }
    
    return true;
  };

  const connect = () => {
    sse.readyState = 0; // CONNECTING
    abortController = new AbortController();

    const fetchOptions = buildFetchOptions();

    fetch(url, fetchOptions)
      .then(response => {
        if (!response.ok) {
          const err = new Error(`HTTP ${response.status}: ${response.statusText}`);
          err.status = response.status;
          err.response = response;
          throw err;
        }

        // Vérifier que c'est bien du text/event-stream
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('text/event-stream')) {
          console.warn('Response is not text/event-stream:', contentType);
        }

        sse.readyState = 1; // OPEN
        retryCount = 0; // Reset retry count on successful connection
        
        console.info('SSE connection established');
        sse.dispatchEvent('open', null);

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        function read() {
          reader.read().then(({ done, value }) => {
            if (done) {
              if (!isClosed) scheduleReconnect();
              return;
            }

            buffer += decoder.decode(value, { stream: true });

            // Traiter les événements complets (séparés par double saut de ligne)
            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
              const eventData = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);

              if (eventData.trim()) {
                const { eventName, eventDataString, eventId, retry } = parseSSEEvent(eventData);

                // Mettre à jour lastEventId si fourni
                if (eventId !== null) {
                  lastEventId = eventId;
                }

                // Mettre à jour retryDelay si fourni par le serveur
                if (retry !== null) {
                  currentRetryDelay = retry;
                }

                // Dispatcher l'événement avec toutes les données
                if (eventDataString !== '') {
                  sse.dispatchEvent(eventName, eventDataString, eventId);
                }
              }

              boundary = buffer.indexOf('\n\n');
            }

            read(); // Continue reading
          }).catch(error => {
            if (!isClosed) {
              sse.dispatchEvent('error', error.message);
              scheduleReconnect();
            }
          });
        }

        read();
      })
      .catch(error => {
        if (!isClosed) {
          console.error('SSE connection error:', error);
          sse.dispatchEvent('error', error.message);
          scheduleReconnect();
        }
      });
  };

  const scheduleReconnect = () => {
    if (isClosed) return;

    clearTimeout(retryTimeout);
    
    // Créer un objet erreur pour la logique de retry
    const retryError = { retryCount, lastError: 'Connection lost' };
    
    if (!shouldRetry(retryError)) {
      console.warn('Max retries reached or retry not allowed');
      sse.close();
      return;
    }

    retryCount++;
    console.info(`Scheduling SSE reconnection (attempt ${retryCount}) in ${currentRetryDelay}ms`);
    
    retryTimeout = setTimeout(() => {
      if (!isClosed) {
        connect();
      }
    }, currentRetryDelay); // Utilise currentRetryDelay qui peut être modifié par le serveur
  };

  connect();

  return sse;
};

export { fetchSSE };
