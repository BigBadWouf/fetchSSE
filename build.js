const fs = require('fs');
const path = require('path');

// Assure-toi que le dossier dist existe
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Lire le fichier source
const sourceCode = fs.readFileSync('src/index.js', 'utf8');

// Version ES Modules (juste copier)
fs.writeFileSync('dist/index.esm.js', sourceCode);

// Version CommonJS (remplacer export par module.exports)
const cjsCode = sourceCode.replace(
  'export { fetchSSE };',
  'module.exports = { fetchSSE };'
);
fs.writeFileSync('dist/index.js', cjsCode);

console.log('✅ Build completed!');