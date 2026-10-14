import { defineConfig, type Plugin } from 'vite';
import { version } from './package.json';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));

/** Claves Firebase del fichero FUERA del repo (../config.txt) — nunca se commitan. */
function clavesFichero(): Record<string, string> | null {
  const ruta = resolve(raiz, '..', 'config.txt');
  if (!existsSync(ruta)) return null;
  const valores: Record<string, string> = {};
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^\s*(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId)\s*:\s*['"]([^'"]*)['"]/);
    if (m) valores[m[1]] = m[2];
  }
  return 'apiKey' in valores ? valores : null;
}

const claves = clavesFichero();
const MARCADORES: Record<string, string> = {
  apiKey: 'API_KEY',
  authDomain: 'AUTH_DOMAIN',
  projectId: 'PROJECT_ID',
  storageBucket: 'STORAGE_BUCKET',
  messagingSenderId: 'MESSAGING_SENDER_ID',
  appId: 'APP_ID',
};
/** Sustituye los marcadores Firebase también en dev (CI los inyecta vía Secret al desplegar). */
const firebaseKeysDev: Plugin = {
  name: 'firebase-keys-dev',
  transformIndexHtml(html) {
    if (!claves) { console.log('[vite] claves Firebase ausentes — placeholders sin sustituir'); return html; }
    for (const [campo, marcador] of Object.entries(MARCADORES)) {
      const valor = claves[campo];
      if (valor) html = html.split(`__FIREBASE_${marcador}__`).join(valor);
    }
    return html;
  },
};

// Versión de juego inyectada en build (badge del lobby + log de arranque).
export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(version),
  },
  plugins: [firebaseKeysDev],
  root: '.',
  // Rutas relativas: el mismo dist sirve en Firebase Hosting (raíz) y GitHub Pages (/mazerpg/)
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
        structor: './structor.html'
      }
    }
  }
});