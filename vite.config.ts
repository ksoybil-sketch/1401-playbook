import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

/** Sürüm etiketi (src/lib/version.ts): package.json sürümü + derleme zamanı. */
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Demo kaydı (src/demo/log.ts): yalnızca demo ve emülatör derlemelerinde
  // "firebase/firestore" yazımları kaydeden ince katmandan geçer. Canlı
  // pakette bu yönlendirme yoktur.
  const activityLog = env.VITE_ACTIVITY_LOG === 'true';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(pkgVersion),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString())
    },
    resolve: {
      alias: activityLog
        ? [{ find: /^firebase\/firestore$/, replacement: fileURLToPath(new URL('./src/demo/firestore-shim.ts', import.meta.url)) }]
        : []
    },
    build: {
      outDir: 'www',
      emptyOutDir: true
    }
  };
});
