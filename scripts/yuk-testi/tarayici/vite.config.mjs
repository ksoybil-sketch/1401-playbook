// Yük testi için vite yapılandırması: uygulama aynı, yalnızca 'firebase/firestore'
// okuma/yazma sayan bir katmandan geçer (sayac-shim.js). Proje vite.config.ts'ine dokunulmaz.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
export default defineConfig({
  root,
  envDir: root,
  cacheDir: fileURLToPath(new URL('../out/vite-cache', import.meta.url)),
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify('yuk-testi'), __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  resolve: { alias: [{ find: /^firebase\/firestore$/, replacement: fileURLToPath(new URL('./sayac-shim.js', import.meta.url)) }] },
  server: { port: 5199, strictPort: true, host: '127.0.0.1' }
});
