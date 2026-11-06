/**
 * 1401Coffee_2026_N.html içindeki `recipesData` dizisini çıkarıp
 * scripts/source/recipes-2026.json olarak kaydeder (tek seferlik dönüştürme).
 *
 *   node scripts/extract-2026.mjs "<html dosyasının yolu>"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(process.argv[2], 'utf8');

const start = html.indexOf('const recipesData = [');
if (start < 0) throw new Error('recipesData bulunamadı');
const open = html.indexOf('[', start);

// Dizinin kapanış köşeli parantezini, string içindekileri atlayarak bul.
let depth = 0, i = open, inStr = null, out = -1;
for (; i < html.length; i++) {
  const c = html[i];
  if (inStr) {
    if (c === '\\') i++;
    else if (c === inStr) inStr = null;
    continue;
  }
  if (c === '"' || c === "'" || c === '`') inStr = c;
  else if (c === '[') depth++;
  else if (c === ']') { depth--; if (depth === 0) { out = i; break; } }
}
if (out < 0) throw new Error('Dizinin sonu bulunamadı');

const data = eval(html.slice(open, out + 1)); // yalnızca yerel, güvenilen dosya
writeFileSync(join(here, 'source/recipes-2026.json'), JSON.stringify(data, null, 1), 'utf8');

const cats = {};
data.forEach((r) => { cats[r.cat] = (cats[r.cat] || 0) + 1; });
console.log(`${data.length} reçete çıkarıldı`);
Object.entries(cats).forEach(([c, n]) => console.log(`  ${c}: ${n}`));
