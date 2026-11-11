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

    if (b.mode === 'katman' && esp >= 0 && sut >= 0) {
      if (b.vessel !== 'cold' && esp > sut) fail(`sıcak içecekte espresso sütün üstünde (${esp} > ${sut})`);
      if (b.vessel === 'cold' && esp < sut) fail(`buzlu içecekte espresso sütün altında (${esp} < ${sut})`);
    }
    if (sos !== Infinity && sos !== 0) fail(`sos dipte değil (sıra ${sos})`);

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
