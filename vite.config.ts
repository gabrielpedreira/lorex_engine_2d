import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pacote = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// base './' para o Electron conseguir abrir dist/*.html via file://
export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_VERSAO': JSON.stringify(pacote.version) },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        editor: resolve(import.meta.dirname, 'index.html'),
        splash: resolve(import.meta.dirname, 'splash.html'),
      },
    },
  },
});
