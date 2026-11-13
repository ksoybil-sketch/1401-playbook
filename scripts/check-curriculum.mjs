/**
 * Bardak şemalarını denetler — `npm run curriculum` sonunda otomatik koşar.
 *
 * Neden var: katman sırası hatası gözle yakalanmıyor. Şema "güzel" görünür
 * ama espresso yanlış yerde durur ve barista yanlış öğrenir. Bu betik bir
 * kez yazıldı diye sorun kapanmaz; sıralamaya dokunan her değişiklikte
 * tekrar koşar ve hatalıysa derlemeyi düşürür.
 *
 * Kurallar:
 *   1. Sıcak içecekte espresso sütün ALTINDA (önce dökülür, üstüne süt gelir).
 *   2. Buzlu içecekte espresso sütün ÜSTÜNDE (en son dökülür).
 *   3. Sos/şurup her zaman en dipte.
 *   4. Hacimli (ml) her katmanın sayısı dolu olmalı.
 *   5. Aynı sırada iki katman olamaz.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || join(here, '../src/generated/curriculum.json');
const data = JSON.parse(readFileSync(file, 'utf8'));

const problems = [];
let checked = 0;

for (const lesson of data.lessons) {
  for (const b of lesson.blocks || []) {
    if (b.type !== 'cup') continue;
    checked++;
    const fail = (msg) => problems.push(`${lesson.title}: ${msg}`);

    const body = b.layers.filter((l) => l.order < 900);
    const at = (tone) => {
      const l = body.find((x) => x.tone === tone);
      return l ? l.order : -1;
    };
    const esp = at('espresso'), sut = at('sut');
    const sos = Math.min(...['sos', 'cikolata'].map(at).filter((x) => x >= 0), Infinity);

    // Sırası tarifte açıkça yazılı içecekler (b.sira === 'tarif', bkz. recipe-cup.mjs SIRA)
    // genel kurala uymak zorunda değil: Americano'da espresso suyun üstünde gibi.
    const tarif = b.sira === 'tarif';
    if (b.mode === 'katman' && esp >= 0 && sut >= 0 && !tarif) {
      if (b.vessel !== 'cold' && esp > sut) fail(`sıcak içecekte espresso sütün üstünde (${esp} > ${sut})`);
      if (b.vessel === 'cold' && esp < sut) fail(`buzlu içecekte espresso sütün altında (${esp} < ${sut})`);
    }
    // Sos ya dipte durur ya da (buzlu içecekte) espressoyla karıştırılıp onun hemen altında üste dökülür.
    if (b.mode === 'katman' && !tarif && sos !== Infinity && sos !== 0) {
      const sosLayers = body.filter((x) => x.tone === 'sos' || x.tone === 'cikolata').map((x) => x.order);
      const kahveyle = esp >= 0 && sosLayers.every((o) => o < esp && body.every((x) => x.order <= o || x.order >= esp || x.tone === 'sos' || x.tone === 'cikolata'));
      if (!kahveyle) fail(`sos dipte değil (sıra ${sos})`);
    }

    for (const l of b.layers) {
      if (l.fill === 'ml' && !(l.small > 0 && l.large > 0)) fail(`"${l.name}" ml olarak işaretli ama ölçüsü yok`);
    }
    const orders = body.map((l) => l.order);
    if (new Set(orders).size !== orders.length) fail('iki katman aynı sırada');
  }
}

if (problems.length) {
  console.error(`\n✗ Bardak şeması denetimi: ${checked} şemada ${problems.length} sorun\n`);
  problems.forEach((p) => console.error('   ' + p));
  console.error('');
  process.exit(1);
}
console.log(`✓ Bardak şeması denetimi: ${checked} şemanın tamamı kurallara uyuyor`);

/* ------------------------------------------------------------------ */
/* Soru havuzu derinliği                                               */
/* ------------------------------------------------------------------ */

/**
 * Kopya, havuz darlığından doğar. İki sınavın ortak soru sayısı
 * ≈ sınav² ÷ banka olduğundan, sınav bankanın üçte birini geçmemeli
 * (bkz. examSizeFor, scripts/content.mjs). Sınav boyu en az 5 soru
 * olduğu için bankada en az 15 soru gerekir; altındaki modül, formül
 * ne yaparsa yapsın herkese benzer kâğıt dağıtır.
 */
const MIN_BANK = 15;
const bankProblems = [];
console.log('\nSoru havuzu:');
for (const m of data.modules) {
  const n = data.questions.filter((q) => q.moduleId === m.id).length;
  const ratio = n / m.examSize;
  const overlap = (m.examSize * m.examSize) / n;
  const mark = n < MIN_BANK ? '✗' : ratio < 3 ? '!' : '·';
  console.log(
    `  ${mark} ${m.title.padEnd(36).slice(0, 36)} banka ${String(n).padStart(3)}` +
    `  sınav ${String(m.examSize).padStart(2)}  oran ${ratio.toFixed(1)}x` +
    `  iki barista ortak ≈ ${overlap.toFixed(1)}/${m.examSize}`
  );
  if (n < MIN_BANK) bankProblems.push(`${m.title}: bankada ${n} soru var, en az ${MIN_BANK} gerekiyor`);
}

if (bankProblems.length) {
  console.error(`\n✗ Soru havuzu denetimi: ${bankProblems.length} modül yetersiz\n`);
  bankProblems.forEach((p) => console.error('   ' + p));
  console.error('');
  process.exit(1);
}
console.log('✓ Soru havuzu denetimi: her modülde yeterli soru var');

/* ------------------------------------------------------------------ */
/* Kimlik çakışması                                                    */
/* ------------------------------------------------------------------ */

/**
 * İki ders aynı kimliği taşıyamaz.
 *
 * Firestore'a yazarken kimlik belge adıdır: aynı kimlikli ikinci ders
 * birincisinin ÜZERİNE yazar ve ilk dersin içeriği sessizce kaybolur.
 * Derleme bunu fark etmez, panel de etmez — ancak ders açıldığında
 * yanlış içerik görülür. Bu yüzden burada durduruluyor.
 */
const dupes = [];
for (const [ad, liste] of [
  ['eğitim yolu', data.tracks],
  ['modül', data.modules],
  ['ders', data.lessons],
  ['soru', data.questions]
]) {
  const gorulen = new Set();
  for (const x of liste) {
    if (gorulen.has(x.id)) dupes.push(`${ad} kimliği iki kez kullanılmış: ${x.id}`);
    gorulen.add(x.id);
  }
}

if (dupes.length) {
  console.error(`\n✗ Kimlik denetimi: ${dupes.length} çakışma\n`);
  dupes.forEach((d) => console.error('   ' + d));
  console.error('');
  process.exit(1);
}
console.log('✓ Kimlik denetimi: çakışan kimlik yok');

/* ------------------------------------------------------------------ */
/* Soru türü çeşitliliği                                               */
/* ------------------------------------------------------------------ */

/**
 * Sınav türler arasında dengeli seçilir (src/api/exam.ts); ama havuzda tek
 * tür varsa dengelenecek bir şey kalmaz. Her modülde en az üç tür olmalı.
 * Örnek: Demleme ve Türk Kahveleri sınavı eskiden neredeyse tümüyle
 * gramaj sorusuydu.
 */
const kindProblems = [];
console.log('\nSoru türleri (bir sınavda her türden yaklaşık kaç soru gelir):');
for (const m of data.modules) {
  const qs = data.questions.filter((q) => q.moduleId === m.id);
  const groups = {};
  qs.forEach((q) => { groups[q.kind || 'yok'] = (groups[q.kind || 'yok'] || 0) + 1; });
  if (groups.yok) kindProblems.push(`${m.title}: ${groups.yok} sorunun türü yok`);
  const kinds = Object.keys(groups).filter((k) => k !== 'yok');
  if (kinds.length < 3) kindProblems.push(`${m.title}: yalnızca ${kinds.length} soru türü var (en az 3)`);
  // Sınavdaki tahmini dağılım: türlerden sırayla birer soru
  const left = { ...groups }; const take = {}; let n = 0;
  while (n < m.examSize && Object.values(left).some((v) => v > 0)) {
    for (const k of Object.keys(left)) if (left[k] > 0 && n < m.examSize) { left[k]--; take[k] = (take[k] || 0) + 1; n++; }
  }
  console.log(`  ${m.title.padEnd(36).slice(0, 36)} ${Object.entries(take).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
}
if (kindProblems.length) {
  console.error(`\n✗ Soru türü denetimi: ${kindProblems.length} sorun\n`);
  kindProblems.forEach((p) => console.error('   ' + p));
  process.exit(1);
}
console.log('✓ Soru türü denetimi: her modülde en az üç tür var');

/* ------------------------------------------------------------------ */
/* Şık denetimi                                                         */
/* ------------------------------------------------------------------ */

/**
 * Sahadan gelen şikâyetler (13.11.2026): "…" ile kesilen şık okunmuyor;
 * "40 ml" ile "40 ml (İsteğe Bağlı)" aynı anda şık; tarifteki not satırı
 * ("Önemli Kural: …") adım gibi şık; aynı şık iki kez. Hepsi burada yakalanır.
 */
const optProblems = [];
const numsOf = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) || []).join('|');
const NOTE = /^(önemli|not\b|kural|asla|tıpkı|dikkat|ipucu)|oranı\s*=|=\s*\d/i;
for (const q of data.questions) {
  const ans = q.options[q.answer];
  const tag = `${q.prompt.slice(0, 90)}`;
  if (q.options.some((o) => /…$/.test(o))) optProblems.push(`kesik şık: ${tag}`);
  if (new Set(q.options.map((o) => o.toLocaleLowerCase('tr').trim())).size < q.options.length) optProblems.push(`tekrarlanan şık: ${tag}`);
  if (q.kind === 'olcu' && numsOf(ans) && q.options.some((o, i) => i !== q.answer && numsOf(o) === numsOf(ans))) optProblems.push(`doğru cevapla aynı ölçüde yanlış şık: ${tag}`);
  if (q.kind === 'adim' && q.options.some((o) => NOTE.test(o.trim()))) optProblems.push(`not satırı adım şıkkı: ${tag}`);
  if (/ıcehot/.test(q.prompt + q.options.join(' '))) optProblems.push(`"Icehot" küçük harf hatası: ${tag}`);
}
if (optProblems.length) {
  console.error(`\n✗ Şık denetimi: ${optProblems.length} sorun\n`);
  optProblems.slice(0, 40).forEach((p) => console.error('   ' + p));
  process.exit(1);
}
console.log('✓ Şık denetimi: kesik, tekrarlanan, belirsiz şık yok');
