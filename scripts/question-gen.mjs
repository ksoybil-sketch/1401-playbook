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
    if (out.length >= 4) break;
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

/**
 * Tarifteki not / kural satırları adım değildir ("Önemli Kural: …", "ASLA …",
 * "Tıpkı Latte'deki gibi…", "Cortado Espresso / Süt Oranı = 1:1"). Sıra ve
 * "ilk adım" sorularında şık olurlarsa anlam karmaşası yaratıyorlar.
 */
export const isNote = (s) => /^(önemli|not\b|kural|asla|tıpkı|dikkat|ipucu)|oranı\s*=|=\s*\d|\bASLA\b/i.test(String(s).trim());

export function stepOrderQuestion(name, steps, flip) {
  const clean = steps.map(strip).filter((s) => s.length > 8 && !isNote(s));
  if (clean.length < 3) return null;
  const a = 0;
  const b = clean.length - 1;
  const [x, y] = flip ? [clean[b], clean[a]] : [clean[a], clean[b]];
  return TF(
    `${name} hazırlanırken “${short(x, 160)}” adımı, “${short(y, 160)}” adımından önce gelir.`,
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

/* ------------------------------------------------------------------ */
/* Ek türler — tekrar hissini kırmak için (Kasım 2026)                 */
/* ------------------------------------------------------------------ */
/*
 * Sorun: reçete modüllerinde her içecek aynı 6–7 kalıptan geçiyordu
 * ("hangi porsiyonda", "nasıl servis edilir"…), cevapların çoğu da
 * aynıydı (lattelerin hepsi 8 oz / 12 oz). Aşağıdaki türler iki içeceği
 * karşılaştırır, bardak sırasını ve büyük bardağa ölçeklemeyi sorar —
 * ezberden çok anlamayı ölçer.
 */

const lc = (s) => String(s).toLocaleLowerCase('tr').trim();

/** "A'da olup B'de olmayan malzeme" — benzer iki içeceği ayırt etme. */
export function differenceQuestion(a, b, nameOf) {
  const inB = new Set(b.ing.map((i) => lc(i.name)));
  const inA = new Set(a.ing.map((i) => lc(i.name)));
  const only = a.ing.filter((i) => !inB.has(lc(i.name)) && !BASIC.test(i.name));
  if (!only.length) return null;
  const shared = a.ing.filter((i) => inB.has(lc(i.name))).map((i) => i.name);
  const onlyB = b.ing.filter((i) => !inA.has(lc(i.name))).map((i) => i.name);
  const wrong = [...new Set([...shared, ...onlyB])].filter((x) => lc(x) !== lc(only[0].name)).slice(0, 3);
  if (wrong.length < 3) return null;
  const A = nameOf(a), B = nameOf(b);
  return Q(
    // İçecek adlarına ek getirmeden (Americano'yu/Latte'yi…) soruluyor.
    `${A} ve ${B} karşılaştırması: yalnızca ${A} reçetesinde bulunan malzeme hangisi?`,
    only[0].name, wrong,
    `Benzer içecekleri ayıran şey tek bir malzemedir; siparişte karışmasın. ${A}: ${a.ing.map((i) => i.name).join(', ')}. ${B}: ${b.ing.map((i) => i.name).join(', ')}.`,
    'fark'
  );
}

/** Bardağa ilk giren malzeme — katman sırası. */
export function firstLayerQuestion(name, cup) {
  if (!cup || cup.mode !== 'katman') return null;
  const layers = [...cup.layers].filter((l) => l.order < 900).sort((x, y) => x.order - y.order);
  if (layers.length < 3) return null;
  const first = layers[0].name;
  const wrong = layers.slice(1).map((l) => l.name).slice(0, 3);
  if (wrong.length < 2) return null;
  return Q(
    `${name} hazırlanırken bardağa ilk giren hangisi?`,
    first, wrong,
    `Sıra katmanı ve tadı belirler. ${name}: ${layers.map((l) => l.name).join(' → ')}.`,
    'katman'
  );
}

/** Küçük bardaktan büyüğe ölçek — iki boy da reçetede yazılı. */
export function scaleQuestion(name, cup, nth = 0) {
  if (!cup || cup.sizes?.length < 2) return null;
  const l = cup.layers.filter((x) => x.fill === 'ml' && x.small && x.large && x.small !== x.large)[nth];
  if (!l) return null;
  const [s, b] = cup.sizes;
  const fmt = (n) => `${n} ml`;
  const wrong = [...new Set([l.small, Math.round(l.large * 1.25 / 10) * 10, Math.round(l.large * 0.8 / 10) * 10, l.small * 2])]
    .filter((v) => v !== l.large).slice(0, 3).map(fmt);
  if (wrong.length < 3) return null;
  return Q(
    `${name} ${s.oz ? `${s.oz} oz` : 'küçük'} bardakta ${fmt(l.small)} ${lc(l.name)} alır. ${b.oz ? `${b.oz} oz` : 'büyük'} bardakta kaç ml?`,
    fmt(l.large), wrong,
    `Büyük boy, küçüğün iki katı değildir; ölçüler reçetede ayrı ayrı yazılıdır. ${name} ${lc(l.name)}: ${l.text}.`,
    'olcek'
  );
}

/** Doğru/yanlış: bu içecekte şu malzeme var mı? */
export function ingredientTF(recipe, name, foreign, flip) {
  const own = recipe.ing.filter((i) => !BASIC.test(i.name));
  if (!own.length || !foreign) return null;
  const item = flip ? foreign : own[0].name;
  return TF(
    `${name} reçetesinde ${lc(item)} bulunur.`,
    !flip,
    `${name}: ${recipe.ing.map((i) => `${i.name} ${i.amt}`).join(', ')}.`,
    'malzeme'
  );
}

/** Ölçüden içeceği bulmak: "Hangisinde 30 ml karamel sos var?" */
export function amountToDrinkQuestion(recipe, name, moduleRecipes, nameOf, nth = 0) {
  const distinct = recipe.ing.filter((i) => !BASIC.test(i.name) && /\d/.test(i.amt));
  for (const ing of seeded(distinct, name + 'amt').slice(nth)) {
    const key = lc(ing.name), amt = ing.amt.trim();
    const clash = moduleRecipes.some((r) => r !== recipe && r.ing.some((i) => lc(i.name) === key && i.amt.trim() === amt));
    if (clash) continue;
    const others = moduleRecipes.filter((r) => r !== recipe && r.ing.some((i) => lc(i.name) === key)).map(nameOf);
    const pad = moduleRecipes.filter((r) => r !== recipe).map(nameOf);
    const wrong = seeded([...new Set([...others, ...pad])], key + amt).slice(0, 3);
    if (wrong.length < 3) continue;
    return Q(
      // Çift ölçü ("15 / 20 ml") küçük / büyük bardak içindir; soru bunu söyler.
      `Hangi içeceğin reçetesinde ${amt} ${lc(ing.name)} vardır?${/\d\s*\/\s*\d/.test(amt) ? ' (küçük / büyük bardak)' : ''}`,
      name, wrong,
      `${name}: ${recipe.ing.map((i) => `${i.name} ${i.amt}`).join(', ')}.`,
      'eslestir'
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Ders tablolarından ve prosedürlerden — tüm satırlar                 */
/* ------------------------------------------------------------------ */

/**
 * Standart tablosunun her satırından üç soru biçimi:
 *   ileri  "X için doğru olan hangisi?"     (değer seçilir)
 *   ters   "‘…’ hangi başlığa aittir?"       (başlık seçilir)
 *   D/Y    satır doğru ya da başka satırın değeriyle karıştırılmış
 * Önceden tablo başına yalnızca iki ileri soru üretiliyordu.
 */
export function specAllQuestions(lesson) {
  const out = [];
  for (const b of lesson.blocks || []) {
    if (b.type !== 'spec' || b.rows.length < 4) continue;
    const rows = b.rows.map((r) => ({ label: strip(r.label), value: strip(r.value) }))
      .filter((r) => r.value.length >= 4 && r.label.length >= 2);
    if (new Set(rows.map((r) => r.value)).size < 4) continue;
    // Aynı başlık birden çok satırda geçiyorsa (ör. "Doğru" / "Yanlış" örnek
    // tabloları) "hangisine aittir" sorusunun tek doğru cevabı olmaz.
    const labelN = new Map();
    rows.forEach((r) => labelN.set(r.label, (labelN.get(r.label) || 0) + 1));
    rows.forEach((r, i) => {
      const unique = labelN.get(r.label) === 1;
      const others = rows.filter((x) => x.value !== r.value);
      const wrongV = unique ? seeded(others.map((x) => x.value), r.label + 'v').slice(0, 3) : [];
      const wrongL = unique ? seeded([...new Set(others.map((x) => x.label))].filter((l) => l !== r.label), r.label + 'l').slice(0, 3) : [];
      if (wrongV.length === 3) out.push(Q(`${lesson.title}: “${r.label}” için doğru olan hangisi?`, r.value, wrongV, `${lesson.title} — ${r.label}: ${r.value}.`, 'kavram'));
      if (wrongL.length === 3 && r.value.length <= 140) out.push(Q(`${lesson.title}: “${r.value}” hangisine aittir?`, r.label, wrongL, `${r.label}: ${r.value}.`, 'kavram'));
      const swap = others[(i * 7 + 3) % others.length];
      if (swap) {
        const isTrue = i % 2 === 0;
        out.push(TF(`${lesson.title}: ${r.label} — ${isTrue ? r.value : swap.value}`, isTrue,
          `Doğrusu: ${r.label} — ${r.value}.`, 'kural'));
      }
    });
  }
  return out;
}

/** Prosedür adımlarından "bu adımdan sonra ne gelir?" */
export function nextStepQuestions(lesson) {
  const out = [];
  for (const b of lesson.blocks || []) {
    if (b.type !== 'steps' || b.items.length < 4) continue;
    const items = b.items.map(strip).filter((s) => s.length > 8 && !isNote(s));
    // Adımlar "Başlık: açıklama" biçimindeyse (açılış/kapanış prosedürü) şık olarak
    // başlık kullanılır: yüzlerce karakterlik şık okunmaz. Değilse şık tam yazılır
    // ("…" ile kesilen şık okunamıyor).
    const labelOf = (x) => { const m = x.match(/^([^:]{2,40}):\s/); return m ? m[1] : null; };
    const labeled = items.every((x) => labelOf(x)) && new Set(items.map(labelOf)).size === items.length;
    const opt = (x) => (labeled ? labelOf(x) : x);
    for (let i = 0; i < items.length - 1 && out.length < 3; i += 2) {
      const wrong = seeded(items.filter((_, j) => j !== i + 1 && j !== i), lesson.id + i).slice(0, 3).map(opt);
      if (wrong.length < 3) continue;
      out.push(Q(`${lesson.title}: “${labeled ? labelOf(items[i]) : short(items[i], 160)}” adımından sonra ne gelir?`, opt(items[i + 1]), wrong,
        `Sıra: ${items.map((x) => (labeled ? labelOf(x) : short(x, 50))).join(' → ')}`, 'adim'));
    }
  }
  return out;
}

/** Reçete adımları: "A adımından sonra ne gelir?" (en fazla iki). */
export function recipeNextStep(name, steps) {
  const items = steps.map(strip).filter((s) => s.length > 8 && !isNote(s));
  if (items.length < 4) return [];
  const out = [];
  for (const i of [1, items.length - 3]) {
    if (i < 0 || i + 1 >= items.length || out.some((q) => q._i === i)) continue;
    const wrong = seeded(items.filter((_, j) => j !== i && j !== i + 1), name + i).slice(0, 3);
    if (wrong.length < 3) continue;
    const q = Q(`${name} hazırlanırken “${short(items[i], 160)}” adımından sonra ne gelir?`, items[i + 1], wrong,
      `Sıra tadın kendisidir. ${name}: ${items.map((x) => short(x, 45)).join(' → ')}`, 'adim');
    out.push(q);
  }
  return out;
}
