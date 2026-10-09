import { resolve } from 'path';
import { defineConfig } from 'vite';

// Content-Security-Policy for the built site (owner, 2026-10-09): scripts only from our own
// origin (no inline scripts: public/boot.js), so an injected script cannot run or read the
// sign-in token. The SAME string is set on Render in render.yaml headers; keep both in sync.
// Not used by the dev server (Vite's HMR needs inline scripts).
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: data:; connect-src 'self' https: wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export default defineConfig({
  root: '.',
  build: {
    // hashed build files get their own folder so the host can cache them for a year
    // (render.yaml headers); public/assets (logo images, video) keeps short caching
    assetsDir: 'static',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
    // the built site is checked under the production CSP (connect-src also allows the local API)
    headers: { 'Content-Security-Policy': CSP.replace("connect-src 'self'", "connect-src 'self' http://localhost:5000") },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
