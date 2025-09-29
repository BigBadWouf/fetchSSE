# fetchSSE

🚀 Une bibliothèque JavaScript moderne pour Server-Sent Events (SSE) avec reconnexion automatique et support avancé
## ✨ Fonctionnalités
- 🔄 Reconnexion automatique avec stratégie configurable
- 🆔 Gestion des Event IDs avec support Last-Event-ID
- 📡 Support POST/PUT pour authentification et données
- 🎯 API EventTarget compatible avec les standards web
- 📦 Auto-parsing JSON avec méthodes dédiées
- ⚙️ Configuration flexible avec toutes les options Fetch API
- 🛡️ Gestion d'erreurs robuste avec logique de retry personnalisable
- 📱 Léger et moderne - Pure JavaScript, zéro dépendance

## 🚀 Installation

```bash
npm install fetchsse
```

## 📖 Usage basique

```js
import { fetchSSE } from 'fetchsse';

const sse = fetchSSE('https://api.example.com/stream');

// Écouter les messages
sse.addEventListener('message', (event) => {
  console.log('Message reçu:', event.data);
});

// Écouter les événements personnalisés
sse.addEventListener('notification', (event) => {
  console.log('Notification:', event.data);
});

// Gestion des erreurs
sse.addEventListener('error', (event) => {
  console.error('Erreur SSE:', event.data);
});

// Fermer la connexion
// sse.close();
```

## ⚙️ Configuration avancée

```js
const sse = fetchSSE('https://api.example.com/stream', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token123',
    'X-Custom-Header': 'value'
  },
  body: {
    userId: '12345',
    filters: ['news', 'updates']
  },
  retryDelay: 5000,        // Délai entre les reconnexions
  maxRetries: 10,          // Nombre max de tentatives
  credentials: 'include',   // Cookies/auth
  customRetryLogic: (error, retryCount) => {
    // Logique de retry personnalisée
    return retryCount < 3 && !error.status === 401;
  }
});
```

## 🎯 API complète

Méthodes EventTarget standard

```js 
sse.addEventListener('event', callback);
sse.removeEventListener('event', callback);

// Ou handlers directs
sse.onmessage = (event) => { /* ... */ };
sse.onerror = (event) => { /* ... */ };
sse.onopen = (event) => { /* ... */ };

// Auto-parsing JSON
sse.addJSONEventListener('data', (event) => {
  console.log(event.data); // Objet JavaScript déjà parsé
});

// Gestion des Event IDs
const lastId = sse.getLastEventId();
sse.setLastEventId('custom-id-123');

// État de connexion
console.log(sse.readyState); // 0: CONNECTING, 1: OPEN, 2: CLOSED

// Fermeture propre
sse.close();
```

## 🔧 Options de configuration
| Option 	| Type 	| Défaut 	| Description
| --------- | ------ | -------- | ------------
| method 	| string 	| 'GET' 	| Méthode HTTP
| headers 	| object 	| {} 	| Headers personnalisés
| body 	| any 	| null 	| Corps de la requête (auto-sérialisé en JSON)
| retryDelay 	| number 	| 3000 	| Délai de reconnexion (ms)
| maxRetries 	| number 	| Infinity 	| Nombre max de tentatives
| credentials 	| string 	| 'include' 	| Gestion des cookies
| customRetryLogic 	| function 	| null 	| Logique de retry personnalisée

Toutes les options Fetch API sont supportées !

## 📡 Exemples d'usage

### Authentification avec POST

```js
const sse = fetchSSE('/api/secure-stream', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: {
    channels: ['user-notifications', 'system-alerts']
  }
});
```

### Chat en temps réel

```js
const chatSSE = fetchSSE('/api/chat/stream', {
  headers: { 'X-Chat-Room': 'general' }
});

chatSSE.addJSONEventListener('message', (event) => {
  const { user, text, timestamp } = event.data;
  addMessageToChat(user, text, timestamp);
});

chatSSE.addEventListener('user-joined', (event) => {
  showNotification(`${event.data} a rejoint le chat`);
});
```

### Retry personnalisé

```js
const sse = fetchSSE('/api/stream', {
  customRetryLogic: (error, retryCount) => {
    // Ne pas retry sur les erreurs 4xx
    if (error.status >= 400 && error.status < 500) {
      return false;
    }
    
    // Retry avec backoff exponentiel
    return retryCount < 5;
  }
});
``` 
### Gestion des Event IDs

```js
const sse = fetchSSE('/api/events');

sse.addEventListener('message', (event) => {
  // L'Event ID est automatiquement géré
  console.log('Event ID:', event.lastEventId);
  
  // Et envoyé automatiquement lors des reconnexions
  // via l'header Last-Event-ID
});
```

## 🔄 Reconnexion automatique

La bibliothèque gère automatiquement les reconnexions avec :

- ✅ Retry configurable avec maxRetries et retryDelay
- ✅ Event IDs persistants pour éviter les doublons
- ✅ Respect des directives serveur (retry field)
- ✅ Logique intelligente (pas de retry sur 4xx)
- ✅ Backoff personnalisable via customRetryLogic

## 🛡️ Gestion d'erreurs

```js
const sse = fetchSSE('/api/stream');

sse.addEventListener('error', (event) => {
  console.error('Erreur de connexion:', event.data);
});

// Les erreurs HTTP sont automatiquement gérées
// 4xx = pas de retry automatique
// 5xx = retry avec backoff
```

## 🌟 Pourquoi fetchSSE ?
| Fonctionnalité 	| EventSource natif 	| fetchSSE
| ----------------- | --------------------- | ---------
| Reconnexion auto 	| ✅ 	| ✅
| Event IDs 	| ✅ 	| ✅
| Requêtes POST 	| ❌ 	| ✅
| Headers custom 	| ❌ 	| ✅
| Body de requête 	| ❌ 	| ✅
| Retry configurable 	| ❌ 	| ✅
| Auto-parsing JSON 	| ❌ 	| ✅
| Toutes options Fetch 	| ❌ 	| ✅

## 📝 License

MIT

## 🤝 Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

### Made with ❤️ for modern web development