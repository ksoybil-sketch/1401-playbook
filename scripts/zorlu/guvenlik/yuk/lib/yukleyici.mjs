/**
 * Node yükleme kancası: uygulamanın gerçek src/ modüllerini (exam.ts,
 * backend.ts, regrade.ts …) node'da, İSTEMCİ BAŞINA AYRI kopya olarak çalıştırır.
 *
 *  - "?c=<id>" soneki göreli içe aktarmalara taşınır: her istemcinin kendi
 *    modül grafiği (kendi db / auth örneği) olur.
 *  - src/api/firebase.ts → lib/istemci-firebase.mjs (adlandırılmış app, emülatör)
 *  - 'firebase/firestore' (src içinden) → lib/sayac.mjs (okuma/yazma sayacı)
 *  - .ts dosyalarında import.meta.env sabit bir nesneyle değiştirilir.
 *
 * Kullanım: node --experimental-transform-types --import ./lib/kayit.mjs betik.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SRC = pathToFileURL(path.join(ROOT, 'src')).href;
const SHARED = pathToFileURL(path.join(ROOT, 'shared')).href;
const FB = pathToFileURL(path.join(HERE, 'istemci-firebase.mjs')).href;
const SAYAC = pathToFileURL(path.join(HERE, 'sayac.mjs')).href;

const ENV = JSON.stringify({ MODE: process.env.YUK_MODE || 'production', VITE_USE_EMULATOR: 'true', VITE_ACTIVITY_LOG: 'false', VITE_DEMO: 'false', DEV: true, PROD: false });

const tagOf = (u) => { try { return new URL(u).searchParams.get('c'); } catch { return null; } };
const withTag = (u, c) => { const x = new URL(u); x.searchParams.set('c', c); return x.href; };
const isApp = (u) => u && (u.startsWith(SRC) || u.startsWith(SHARED));

export async function resolve(spec, ctx, next) {
  const c = tagOf(ctx.parentURL || '');
  if (c && isApp(ctx.parentURL)) {
    if (spec === 'firebase/firestore') return { url: withTag(SAYAC, c), shortCircuit: true };
    if (spec.startsWith('.')) {
      const base = new URL(spec, ctx.parentURL);
      base.search = '';
      let p = fileURLToPath(base);
      const cands = [p, p + '.ts', p + '.tsx', p + '/index.ts'];
      const fs = await import('node:fs');
      const hit = cands.find((x) => fs.existsSync(x) && fs.statSync(x).isFile());
      if (!hit) return next(spec, ctx);
      const href = pathToFileURL(hit).href;
      if (href.endsWith('/src/api/firebase.ts')) return { url: withTag(FB, c), shortCircuit: true };
      return { url: withTag(href, c), shortCircuit: true, ...(hit.endsWith('.json') ? { importAttributes: { type: 'json' } } : {}) };
    }
  }
  return next(spec, ctx);
}

export async function load(url, ctx, next) {
  if (isApp(url) && /\.tsx?(\?|$)/.test(url)) {
    const file = fileURLToPath(url.split('?')[0]);
    let src = await readFile(file, 'utf8');
    src = src.replace(/import\.meta\.env/g, `(${ENV})`);
    return { format: 'module-typescript', source: src, shortCircuit: true };
  }
  return next(url, ctx);
}
