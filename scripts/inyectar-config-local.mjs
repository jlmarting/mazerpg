// Inyector local de config Firebase sobre dist/index.html (uso del mando, no commit).
// Lee el snippet de config fuera del repo, sustituye los marcadores __FIREBASE_*__
// que CI inyecta con los Secret, y sirve para probar multijugador Firebase en local.
// NUNCA imprime valores: solo nombres y conteo.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rutaConfig = process.argv[2] ?? resolve(raiz, '..', 'config.txt');
const rutaIndex = resolve(raiz, 'dist', 'index.html');

const crudo = readFileSync(rutaConfig, 'utf8');
const valores = {};
for (const linea of crudo.split('\n')) {
  const m = linea.match(/^\s*(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId)\s*:\s*['"]([^'"]*)['"]/);
  if (m) valores[m[1]] = m[2];
}
const faltan = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'].filter((k) => !valores[k]);
if (faltan.length > 0) {
  console.error(`Faltan campos en ${rutaConfig}: ${faltan.join(', ')} — nada sustituido.`);
  process.exit(1);
}

let html = readFileSync(rutaIndex, 'utf8');
const mapa = {
  __FIREBASE_API_KEY__: valores.apiKey,
  __FIREBASE_AUTH_DOMAIN__: valores.authDomain,
  __FIREBASE_PROJECT_ID__: valores.projectId,
  __FIREBASE_MESSAGING_SENDER_ID__: valores.messagingSenderId,
  __FIREBASE_APP_ID__: valores.appId,
};
let sustituidos = 0;
for (const [marcador, valor] of Object.entries(mapa)) {
  if (!html.includes(marcador)) continue;
  html = html.split(marcador).join(valor);
  sustituidos++;
}
if (html.includes('__FIREBASE_')) {
  console.error('Quedan marcadores sin sustituir — revisa config.txt.');
  process.exit(1);
}
writeFileSync(rutaIndex, html);
console.log(`OK: ${sustituidos}/5 marcadores sustituidos en dist/index.html (projectId: ${valores.projectId}). Valores no impresos.`);