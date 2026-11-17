import { defineConfig } from 'vite';

// base './' para o Electron conseguir abrir dist/index.html via file://
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
