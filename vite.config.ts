import { defineConfig } from 'vite';
import { version } from './package.json';

// Versión de juego inyectada en build (badge del lobby + log de arranque).
export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(version),
  },
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
