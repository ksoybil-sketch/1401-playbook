import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Demo kaydı (src/demo/log.ts): yalnızca demo ve emülatör derlemelerinde
  // "firebase/firestore" yazımları kaydeden ince katmandan geçer. Canlı
  // pakette bu yönlendirme yoktur.
  const activityLog = env.VITE_ACTIVITY_LOG === 'true';
  return {
    plugins: [react(), tailwindcss()],
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
