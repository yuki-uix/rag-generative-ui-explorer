import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { resolve } from 'node:path';

// A static project preview, sharing the exact app pages, components and data.
// It has no /api/ask or model runtime and does not replace the Worker application.
export default defineConfig({
  root: resolve(import.meta.dirname, 'review-preview'),
  base: process.env.REVIEW_BASE_PATH ?? '/',
  publicDir: resolve(import.meta.dirname, 'public'),
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { '@': resolve(import.meta.dirname) } },
  define: { 'import.meta.env.VITE_REVIEW_STATIC': JSON.stringify('true') },
  build: {
    outDir: resolve(import.meta.dirname, 'dist-review'),
    emptyOutDir: true,
  },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});
