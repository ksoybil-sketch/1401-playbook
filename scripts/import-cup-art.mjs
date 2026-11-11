/**
 * Elle hazırlanmış bardak çizimlerini tek bir HTML dosyasından alıp
 * `source/cup-art/<dersId>.svg` olarak yerleştirir.
 *
 *   node scripts/import-cup-art.mjs <dosya.html>
 *   node scripts/import-cup-art.mjs <dosya.html> --yaz    # gerçekten yazar
 *
 * Varsayılan olarak hiçbir şey yazmaz, yalnızca neyin nereye gideceğini
 * raporlar — yanlış eşleşen bir çizim, çizimsiz reçeteden daha kötüdür.
 *
 * Eşleştirme sırası:
 *   1. <svg data-recipe="Caffè Latte"> ya da sarmalayıcıda aynı öznitelik
 *   2. <svg id="..."> / sarmalayıcı id'si doğrudan ders kimliğiyse
 *   3. SVG'den hemen önce gelen en yakın başlık metni (h1–h4, figcaption)
 *
 * Eşleşmeyenler yazılmaz; rapor hangi reçeteye ait olabileceğini söyler.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { recipeLessonId, slug } from './recipe-cup.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const srcFile = process.argv[2];
const WRITE = process.argv.includes('--yaz');

if (!srcFile) {
  console.error('Kullanım: node scripts/import-cup-art.mjs <dosya.html> [--yaz]');
  process.exit(1);
}

const RECIPES = JSON.parse(readFileSync(join(here, 'source/recipes-2026.json'), 'utf8'));
const html = readFileSync(srcFile, 'utf8');
const outDir = join(here, 'source/cup-art');

/* ---- reçete adı → ders kimliği sözlüğü ---- */
const byKey = new Map();
const norm = (s) => slug(String(s).replace(/\([^)]*\)/g, ' '));
for (const r of RECIPES) {
  const id = recipeLessonId(r.name);
  byKey.set(norm(r.name), id);          // parantezsiz ad
  byKey.set(slug(r.name), id);          // tam ad
}

function lookup(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (!t) return null;
  if (byKey.has(slug(t))) return byKey.get(slug(t));
  if (byKey.has(norm(t))) return byKey.get(norm(t));
  // "r-..." biçiminde doğrudan ders kimliği verilmişse
  if (/^r-[a-z0-9-]+$/.test(t) && RECIPES.some((r) => recipeLessonId(r.name) === t)) return t;
  // kısmi eşleşme: tek bir adayla eşleşiyorsa kabul et
  const n = norm(t);
  if (n.length < 4) return null;
  const hits = [...new Set([...byKey.entries()].filter(([k]) => k.includes(n) || n.includes(k)).map(([, v]) => v))];
  return hits.length === 1 ? hits[0] : null;
}

/* ---- HTML'den svg'leri ve çevresindeki metni çıkar ---- */
const found = [];
const re = /<svg\b[\s\S]*?<\/svg>/gi;
let m;
while ((m = re.exec(html)) !== null) {
  const svg = m[0];
  const before = html.slice(Math.max(0, m.index - 1200), m.index);

  const attr = (src, name) => {
    const a = src.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
    return a ? a[1] : null;
  };

  // 1) öznitelik — svg'nin kendisinde ya da hemen öncesindeki sarmalayıcıda
  let keyText = attr(svg, 'data-recipe') || attr(svg, 'data-lesson') || attr(svg, 'id');
  if (!keyText) {
    const wrap = before.match(/<[a-z]+[^>]*\sdata-(?:recipe|lesson)\s*=\s*"([^"]*)"[^>]*>\s*$/i);
    if (wrap) keyText = wrap[1];
  }
  // 2) en yakın başlık
  if (!keyText) {
    const heads = [...before.matchAll(/<(h[1-4]|figcaption|caption)[^>]*>([\s\S]*?)<\/\1>/gi)];
    if (heads.length) keyText = heads[heads.length - 1][2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // 3) aria-label / title
  if (!keyText) keyText = attr(svg, 'aria-label') || (svg.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];

  found.push({ svg, keyText: keyText || '', id: lookup(keyText), bytes: svg.length });
}

/* ---- rapor ---- */
const matched = found.filter((f) => f.id);
const unmatched = found.filter((f) => !f.id);
const seen = new Map();
matched.forEach((f) => seen.set(f.id, (seen.get(f.id) || 0) + 1));
const dupes = [...seen.entries()].filter(([, n]) => n > 1);

console.log(`${basename(srcFile)} içinde ${found.length} çizim bulundu.`);
console.log(`  eşleşen: ${matched.length}  ·  eşleşmeyen: ${unmatched.length}`);
if (dupes.length) {
  console.log('\n⚠ aynı derse birden çok çizim eşleşti — İLKİ yazılır, kalanı atlanır.');
  console.log('   (Küçük ve büyük bardak ayrı ayrı çizildiyse ikisini tek SVG içinde birleştirin.)');
  dupes.forEach(([id, n]) => console.log(`   ${id} × ${n}`));
}
if (unmatched.length) {
  console.log('\n⚠ eşleşmeyenler — svg etiketine data-recipe="Reçete Adı" ekleyince çözülür:');
  unmatched.forEach((f, i) => console.log(`   #${i + 1} (${(f.bytes / 1024).toFixed(1)} KB) yakınındaki metin: "${(f.keyText || '—').slice(0, 60)}"`));
}

const covered = new Set(matched.map((f) => f.id));
const missing = RECIPES.map((r) => ({ id: recipeLessonId(r.name), name: r.name })).filter((r) => !covered.has(r.id));
if (missing.length) {
  console.log(`\nÇizimi gelmeyen ${missing.length} reçete (otomatik şema kullanmaya devam eder):`);
  missing.slice(0, 12).forEach((r) => console.log(`   ${r.name}`));
  if (missing.length > 12) console.log(`   … ve ${missing.length - 12} tane daha`);
}

if (!WRITE) {
  console.log('\nHiçbir dosya yazılmadı. Yazmak için: --yaz');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
let written = 0;
const done = new Set();
for (const f of matched) {
  if (done.has(f.id)) continue; // çift eşleşmede ilki geçerli
  done.add(f.id);
  writeFileSync(join(outDir, `${f.id}.svg`), f.svg, 'utf8');
  written++;
}
console.log(`\n${written} çizim ${existsSync(outDir) ? 'source/cup-art/' : outDir} içine yazıldı.`);
console.log('Şimdi: npm run curriculum');
