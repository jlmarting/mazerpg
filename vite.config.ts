import { defineConfig } from 'vite';

export default defineConfig({
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
