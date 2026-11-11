/**
 * Ek soru üreteçleri — ölçü sorusu dışındaki türler.
 *
 * Sorun: reçete modüllerinde soruların çoğu "X'in ölçüsü nedir?" biçimindeydi.
 * Demleme ve Türk Kahveleri sınavında neredeyse her soru gramajdı. Burada
 * aynı reçete verisinden farklı beceri ölçen sorular üretiliyor:
 *
 *   teknik   — hazırlanıştaki süre, sıcaklık, miktar ("2–2,5 dakika pişirilir")
 *   servis   — sıcak/buzlu/blender, hangi bardak
 *   malzeme  — hangi içecekte bu malzeme var
 *   adim     — adımların sırası (doğru/yanlış)
 *   kavram   — ders tablolarından eşleştirme
 *   durum    — derslerdeki "kendini dene" vakaları
 *
 * Sınav seçimi türler arasında dengelendiği için (bkz. src/api/exam.ts),
 * havuzda tür çeşitliliği doğrudan sınav çeşitliliğine dönüşür.
 */

const tr = (s) => String(s).toLocaleLowerCase('tr');
const cap = (s) => String(s).replace(/^./, (c) => c.toLocaleUpperCase('tr'));
const short = (s, n = 70) => (s.length > n ? s.slice(0, n - 2).replace(/[\s,;.]+$/, '') + '…' : s);
const strip = (s) => String(s).replace(/\*\*/g, '');

/** Basit ve deterministik karıştırma: aynı müfredat her derlemede aynı soruları üretsin. */
function seeded(arr, seed) {
  const a = [...arr];
  let x = 0;
  for (const ch of String(seed)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) >>> 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const Q = (prompt, correct, wrong, explanation, kind) =>
  ({ type: 'single', prompt, options: [correct, ...wrong], answer: 0, explanation, kind });
const TF = (prompt, isTrue, explanation, kind) =>
  ({ type: 'truefalse', prompt, options: ['Doğru', 'Yanlış'], answer: isTrue ? 0 : 1, explanation, kind });

/* ------------------------------------------------------------------ */
/* teknik: hazırlanıştaki sayılar                                      */
/* ------------------------------------------------------------------ */

const UNIT = /(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*(°C|°|dakika|dk\b|saniye|sn\b|saat|ml|litre|lt\b|gr\b|küp|adet|damla)/i;

function numVariants(token) {
  const m = token.match(/^(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(.*)$/);
  if (!m) return [];
  const a = parseFloat(m[1].replace(',', '.'));
  const b = m[2] ? parseFloat(m[2].replace(',', '.')) : null;
  const unit = m[3];
  const fmt = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10).replace('.', ','));
  const shift = (k) => (b === null ? `${fmt(a * k)} ${unit}` : `${fmt(a * k)} - ${fmt(b * k)} ${unit}`);
  const out = new Set();
  for (const k of [0.5, 2, 1.5, 3, 0.75]) {
    const v = shift(k).trim();
    if (v.replace(/\s/g, '') !== token.replace(/\s/g, '') && !/^0\b/.test(v)) out.add(v);
  }
  return [...out].slice(0, 3);
}

export function techniqueQuestions(name, steps) {
  const out = [];
  for (const raw of steps) {
    const s = strip(raw);
    if (s.length > 190) continue;
    const m = s.match(UNIT);
    if (!m) continue;
    const token = m[0].trim();
    const wrong = numVariants(token);
    if (wrong.length < 3) continue;
    const blanked = s.replace(m[0], '_____');
    out.push(Q(
      `${name} hazırlanırken boşluğa ne gelir? “${blanked}”`,
      token, wrong,
      `Süre, sıcaklık ve miktar reçetenin parçasıdır; göz kararı değiştiğinde tat da değişir. Doğrusu: “${s}”`,
      'teknik'
    ));
    if (out.length >= 2) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* servis: nasıl ve hangi bardakta                                     */
/* ------------------------------------------------------------------ */

function serviceLabel(cup, cupText) {
  if (!cup) return null;
  const where = cupText ? `${cupText}` : cup.vessel === 'demi' ? 'fincanda' : '';
  if (cup.mode === 'karisim') return `Blenderda karıştırılarak${where ? ', ' + where : ''}`;
  if (cup.vessel === 'cold') return `Buzlu${where ? ', ' + where : ''}`;
  if (cup.vessel === 'demi') return 'Sıcak, küçük fincanda';
  return `Sıcak${where ? ', ' + where : ''}`;
}

/**
 * İki şık aynı anda doğru sayılabilir mi? "8 oz / 12 oz" ile "12 oz" ya da
 * "Sıcak, 8 oz / 12 oz" ile "Sıcak, 12 oz" gibi — biri ötekinin bir parçasını
 * taşıyorsa çeldirici olarak kullanılmaz.
 */
export function overlaps(a, b) {
  const head = (s) => (String(s).includes(',') ? tr(s).split(',')[0].trim() : '');
  const sizes = (s) => new Set(tr(s).replace(/^[^,]*,/, (m) => (String(s).includes(',') ? '' : m))
    .split('/').map((x) => x.trim()).filter(Boolean));
  if (head(a) !== head(b)) return false;
  const A = sizes(a);
  return [...sizes(b)].some((x) => A.has(x));
}

export function serviceQuestion(name, cup, cupText, allLabels) {
  const label = serviceLabel(cup, cupText);
  if (!label) return null;
  const wrong = seeded(allLabels.filter((l) => l !== label && !overlaps(l, label)), name).slice(0, 3);
  if (wrong.length < 3) return null;
  return Q(
    `${name} nasıl servis edilir?`,
    label, wrong,
    `Servis biçimi reçetenin parçasıdır: bardak boyu oranı, sıcaklık ve katman da misafirin gördüğü ilk şeyi belirler. ${name}: ${tr(label)}.`,
    'servis'
  );
}
export { serviceLabel };

/* ------------------------------------------------------------------ */
/* malzeme: hangi içecekte var                                         */
/* ------------------------------------------------------------------ */

const BASIC = /espresso|süt|^su$|buz|öğüt|kahve$|shot/i;

export function ingredientToDrinkQuestion(recipe, name, moduleRecipes, nameOf) {
  const distinct = recipe.ing.filter((i) => !BASIC.test(i.name));
  if (!distinct.length) return null;
  const ing = seeded(distinct, name)[0];
  const key = tr(ing.name);
  const others = moduleRecipes
    .filter((r) => r !== recipe && !r.ing.some((i) => tr(i.name) === key))
    .map(nameOf);
  const wrong = seeded([...new Set(others)], key).slice(0, 3);
  if (wrong.length < 3) return null;
  return Q(
    `Aşağıdaki içeceklerden hangisinin reçetesinde ${tr(ing.name)} vardır?`,
    name, wrong,
    `Malzemeyi içeceğe bağlamak, siparişi alırken misafirin sorusunu cevaplamanın da yoludur. ${name}: ${recipe.ing.map((i) => `${i.name} ${i.amt}`).join(', ')}.`,
    'malzeme'
  );
}

/* ------------------------------------------------------------------ */
/* adim: sıra (doğru/yanlış)                                           */
/* ------------------------------------------------------------------ */

export function stepOrderQuestion(name, steps, flip) {
  const clean = steps.map(strip).filter((s) => s.length > 8);
  if (clean.length < 3) return null;
  const a = 0;
  const b = clean.length - 1;
  const [x, y] = flip ? [clean[b], clean[a]] : [clean[a], clean[b]];
  return TF(
    `${name} hazırlanırken “${short(x, 60)}” adımı, “${short(y, 60)}” adımından önce gelir.`,
    !flip,
    `Sıra tadın kendisidir. ${name}: ${clean.map((s) => short(s, 50)).join(' → ')}`,
    'adim'
  );
}

/* ------------------------------------------------------------------ */
/* Ders içeriğinden: tablolar ve vakalar (tüm modüller)                */
/* ------------------------------------------------------------------ */

/**
 * Derslerdeki standart tablolarından eşleştirme soruları. Tablo en az dört
 * satırlıysa ve değerler birbirinden ayırt edilebiliyorsa üretilir; aksi
 * hâlde şıklar birbirine benzer ve soru tahmine döner.
 */
export function lessonDerivedQuestions(lesson) {
  const out = [];
  for (const b of lesson.blocks || []) {
    if (b.type === 'check') {
      const options = b.options.map(strip);
      out.push({
        type: 'single', prompt: strip(b.prompt), options, answer: b.answer,
        explanation: strip(b.explanation || ''), kind: 'durum'
      });
    }
    if (b.type === 'spec' && b.rows.length >= 4) {
      const rows = b.rows
        .map((r) => ({ label: strip(r.label), value: strip(r.value) }))
        .filter((r) => r.value.length >= 4 && r.label.length >= 2);
      const values = new Set(rows.map((r) => r.value));
      if (values.size < 4) continue;
      for (const r of seeded(rows, lesson.id).slice(0, 2)) {
        const wrong = seeded(rows.filter((x) => x.value !== r.value).map((x) => x.value), r.label).slice(0, 3);
        if (wrong.length < 3) continue;
        out.push(Q(
          `${lesson.title}: “${r.label}” için doğru olan hangisi?`,
          r.value, wrong,
          `${lesson.title} — ${r.label}: ${r.value}.`,
          'kavram'
        ));
      }
    }
  }
  return out;
}

export { cap };
