import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/** Sürüm etiketi (src/lib/version.ts): package.json sürümü + derleme zamanı. */
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

/** Derlenen kodun git kimliği; çalışma ağacında commit edilmemiş değişiklik varsa "+" eklenir. */
function gitCommit(): string {
  try {
    const id = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    // Yalnızca uygulamaya giren dosyalar sayılır (bkz. scripts/durum.mjs).
    // Satır sonu farkları (Windows'tan gelen dosyalar) sayılmaz.
    const paths = 'src public shared index.html package.json firestore.rules vite.config.ts scripts/source';
    const dirty = (execSync(`git diff --ignore-cr-at-eol --name-only HEAD -- ${paths}`, { encoding: 'utf8' })
      + execSync(`git ls-files --others --exclude-standard -- ${paths}`, { encoding: 'utf8' })).trim();
    return dirty ? `${id}+` : id;
  } catch { return 'bilinmiyor'; }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Demo kaydı (src/demo/log.ts): yalnızca demo ve emülatör derlemelerinde
  // "firebase/firestore" yazımları kaydeden ince katmandan geçer. Canlı
  // pakette bu yönlendirme yoktur.
  const activityLog = env.VITE_ACTIVITY_LOG === 'true';
  return {
    plugins: [react(), tailwindcss(), {
      // Yayındaki sürümü dışarıdan okumak için: /surum.json (npm run durum).
      name: 'surum-json',
      apply: 'build',
      generateBundle() {
        let curriculum = '';
        try { curriculum = JSON.parse(readFileSync(new URL('./src/generated/curriculum.json', import.meta.url), 'utf8')).version; } catch { /* yok */ }
        this.emitFile({ type: 'asset', fileName: 'surum.json', source: JSON.stringify({
          version: pkgVersion, commit: gitCommit(), built: new Date().toISOString(), mode, curriculum
        }, null, 2) + '\n' });
      }
    }],
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
