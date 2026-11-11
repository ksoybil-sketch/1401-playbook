/**
 * Reçete ölçülerini "bardak şeması" verisine çevirir.
 *
 * Neden veri üretiyoruz da çizim üretmiyoruz: şema, dersin içine SVG olarak
 * gömülmez; `cup` bloğu yalnızca sayıları ve sırayı taşır, çizimi uygulama
 * (src/features/academy/CupDiagram.tsx) yapar. Böylece ders belgesi küçük
 * kalır, tema değişince çizim de değişir ve aynı veri hem telefonda hem
 * panelde aynı şekilde yorumlanır.
 *
 * Kaynak alanlar: scripts/source/recipes-2026.json → { name, cat, ing[], tech }
 */

/* ------------------------------------------------------------------ */
/* Ders kimliği — içerik üreticisi ve çizim aktarıcısı aynı kimliği    */
/* üretmek zorunda, bu yüzden tek yerde duruyor.                       */
/* ------------------------------------------------------------------ */

export const slug = (s) =>
  s.toLocaleLowerCase('tr')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const recipeLessonId = (name) => `r-${slug(name)}`;

/* ------------------------------------------------------------------ */
/* Bardak boyu — ürün adının parantezinden                            */
/* ------------------------------------------------------------------ */

const OZ_ML = { 8: 240, 12: 360, 16: 480, 20: 600 };

export function parseSizes(fullName) {
  const m = fullName.match(/\(([^)]*)\)\s*$/);
  if (!m) return [];
  for (const part of m[1].split(/\s*-\s*/)) {
    const oz = [...part.matchAll(/(\d+)\s*oz/gi)].map((x) => +x[1]);
    if (oz.length) return oz.map((o) => ({ oz: o, ml: OZ_ML[o] || o * 30 }));
    const ml = [...part.matchAll(/(\d+)\s*ml/gi)].map((x) => +x[1]);
    if (ml.length) return ml.map((v) => ({ oz: null, ml: v }));
    if (/\b(tek|duble)\b/i.test(part)) return [{ oz: null, ml: /duble/i.test(part) ? 60 : 30 }];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Malzeme sınıflandırma                                               */
/* ------------------------------------------------------------------ */

/**
 * role: 'dose'  → bardağa hiç girmez (öğütülmüş kahve; espressoyu o üretir)
 *       'layer' → bardakta yer kaplar
 *       'top'   → bardağın ağzının üstünde (krema, garnitür)
 * stack: bardaktaki fiziksel sıra için taban değer; sıcak/buzlu farkını
 *        stackOrder() uygular.
 */
const KINDS = [
  { re: /öğüt|çekilmiş kahve/i,                                   kind: 'doz',      role: 'dose',  tone: 'doz' },
  { re: /çikolata sos|chocolate sauce|çikolata şurubu|drop çikolata/i, kind: 'sos',  role: 'layer', tone: 'cikolata' },
  { re: /şurup|şurubu|\bsos\b|sauce|karamel|lotus|toffee/i,       kind: 'sos',      role: 'layer', tone: 'sos' },
  { re: /espresso|ristretto|shot|portafiltre/i,                   kind: 'espresso', role: 'layer', tone: 'espresso' },
  { re: /filtre|demlen|batch|cold drip/i,                         kind: 'espresso', role: 'layer', tone: 'espresso' },
  { re: /buz/i,                                                   kind: 'buz',      role: 'layer', tone: 'buz' },
  { re: /köpük/i,                                                 kind: 'kopuk',    role: 'layer', tone: 'kopuk' },
  { re: /süt/i,                                                   kind: 'sut',      role: 'layer', tone: 'sut' },
  { re: /^su\b|\bsu$|soda|maden/i,                                kind: 'su',       role: 'layer', tone: 'su' },
  { re: /matcha/i,                                                kind: 'toz',      role: 'layer', tone: 'matcha' },
  { re: /frappe tozu|toz|kakao|tarçın|pudra/i,                    kind: 'toz',      role: 'layer', tone: 'toz' },
  { re: /krema|whip/i,                                            kind: 'krema',    role: 'top',   tone: 'krema' },
  { re: /dekor|serpme|garnit|fıstık|antep|şeker/i,                kind: 'dekor',    role: 'top',   tone: 'dekor' }
];

export function classify(name) {
  for (const k of KINDS) if (k.re.test(name)) return k;
  return { kind: 'diger', role: 'layer', tone: 'diger' };
}

/* ------------------------------------------------------------------ */
/* Ölçü ayrıştırma                                                     */
/* ------------------------------------------------------------------ */

/**
 * Dönen `fill`:
 *   ml        → hacimli, oranlı bant çizilir (small/large dolu)
 *   silme     → kabı ağzına kadar doldurur (buz); oran değil, tarama deseni
 *   dekor     → üstte, hacimsiz
 *   adet      → "3 Top", "2 Dilim" gibi sayılabilir; hacimsiz
 *   opsiyonel → "Misafir Tercihine Göre"
 *   otomatik  → "Otomatik Dozaj" (makine ölçüyor)
 *   bilinmiyor→ ayrıştırılamadı; çizime girmez, listede ham hâliyle durur
 */
export function parseAmount(raw) {
  const s = (raw || '').trim();
  if (!s) return { fill: 'bilinmiyor', text: s };
  if (/^silme\b/i.test(s)) return { fill: 'silme', text: s };
  if (/bombe|dekor|garni[sş]|süsleme/i.test(s)) return { fill: 'dekor', text: s };
  if (/misafir tercih/i.test(s)) return { fill: 'opsiyonel', text: s };
  if (/otomatik doz/i.test(s)) return { fill: 'otomatik', text: s };
  if (/ölç/i.test(s)) return { fill: 'adet', text: s };
  if (/\d+\s*(tatlı kaşığı|çay kaşığı|yemek kaşığı|kaşığı|top|dilim|yaprak|dal|damla|adet|saşe|parça)/i.test(s)) {
    return { fill: 'adet', text: s };
  }
  // "200/270 ml" (küçük/büyük bardak), "20 ml", "18 gr", "1,5 lt"
  const m = s.match(/^([\d.,]+)\s*(?:\/\s*([\d.,]+))?\s*(ml|gr|g|lt|adet|shot|oz)\b/i);
  if (m) {
    const num = (x) => parseFloat(String(x).replace(',', '.'));
    const unit = m[3].toLowerCase();
    let a = num(m[1]);
    let b = m[2] ? num(m[2]) : null;
    if (unit === 'lt') { a *= 1000; if (b) b *= 1000; }
    if (unit === 'oz') { a *= 30; if (b) b *= 30; }
    const ml = unit === 'ml' || unit === 'lt' || unit === 'oz';
    return { fill: ml ? 'ml' : 'adet', small: a, large: b ?? a, unit: ml ? 'ml' : unit, text: s };
  }
  return { fill: 'bilinmiyor', text: s };
}

/* ------------------------------------------------------------------ */
/* İçecek tipi ve katman sırası                                        */
/* ------------------------------------------------------------------ */

export function drinkKind(recipe, items) {
  const tech = (recipe.tech || '').toLocaleLowerCase('tr');
  const hasIce = items.some((i) => i.kind === 'buz');
  const cold = hasIce || /soğuk|iced|frappe/i.test(`${recipe.cat} ${recipe.name}`);
  if (/blender/.test(tech)) return { mode: 'karisim', cold: true, vessel: 'cold' };
  const ml = items
    .filter((i) => i.role === 'layer' && i.amount.fill === 'ml')
    .reduce((s, i) => s + i.amount.small, 0);
  if (!cold && ml > 0 && ml <= 70) return { mode: 'katman', cold: false, vessel: 'demi' };
  return { mode: 'katman', cold, vessel: cold ? 'cold' : 'hot' };
}

/**
 * Bardaktaki gerçek sıra — reçetenin yazılış sırası DEĞİL.
 *
 * Sıcak içecekte espresso dipte durur, süt üstüne dökülür. Buzlu içecekte
 * espresso en son ve en üste dökülür; reçetenin kendi metni bunu söylüyor:
 * "Bardağı silme buz doldurun. 220 ml soğuk sütü ekleyin ve en üste espresso
 * shot'ı dökerek servis edin." Sos/şurup her iki durumda da dipte kalır.
 *
 * Dönen dizi ARTAN sıradadır: index 0 = en altta. Çizim de alttan yukarı
 * ilerlediği için bu dizi olduğu gibi gezilir — ters çevrilmez.
 */
export function stackOrder(layers, cold) {
  const rank = (i) => {
    if (i.kind === 'sos') return 0;        // ağır, dipte kalır
    if (i.kind === 'buz') return 1;        // bardağa ilk giren; hacim kaplamaz ama altta başlar
    if (i.kind === 'espresso') return cold ? 3 : 1;
    if (i.kind === 'kopuk') return 4;
    return 2;                               // süt, su, toz
  };
  return [...layers].sort((a, b) => rank(a) - rank(b));
}

/** Köpük malzeme listesinde yoksa teknik metninden okunur (cappuccino). */
function foamNote(recipe) {
  const t = recipe.tech || '';
  if (/iki parmak/i.test(t)) return 'iki parmak köpük';
  if (/köpür|kadifemsi/i.test(t)) return 'ince köpük';
  return null;
}

/* ------------------------------------------------------------------ */
/* cup bloğu                                                           */
/* ------------------------------------------------------------------ */

/** Dışarıdan gelen hazır çizimler: recipeId → SVG kaynağı. */
let ART = {};
export function setCupArt(map) { ART = map || {}; }

export function cupBlock(recipe, recipeId) {
  const items = (recipe.ing || []).map((i) => {
    const k = classify(i.name);
    return { name: i.name, ...k, amount: parseAmount(i.amt) };
  });
  const dk = drinkKind(recipe, items);
  const sizes = parseSizes(recipe.name);
  const dose = items.find((i) => i.role === 'dose');
  const tops = items.filter((i) => i.role === 'top');
  const rawLayers = items.filter((i) => i.role === 'layer');
  const ordered = stackOrder(rawLayers, dk.cold);

  const layer = (i, order) => ({
    name: i.name,
    tone: i.tone,
    order,
    small: i.amount.fill === 'ml' ? i.amount.small : null,
    large: i.amount.fill === 'ml' ? i.amount.large : null,
    text: i.amount.text,
    fill: i.amount.fill
  });

  const layers = [
    ...ordered.map((i, n) => layer(i, n)),
    ...tops.map((i, n) => ({ ...layer(i, 900 + n), fill: 'dekor' }))
  ];

  const block = { type: 'cup', mode: dk.mode, vessel: dk.vessel, sizes, layers };
  if (dose) block.dose = { name: dose.name, text: dose.amount.text };
  const foam = !dk.cold && foamNote(recipe);
  if (foam) block.foam = foam;
  if (ART[recipeId]) block.art = ART[recipeId];
  return block;
}

/** Şema çizilebiliyor mu — hiç hacimli malzeme yoksa blok üretilmez. */
export function isDrawable(block) {
  return block.layers.some((l) => l.fill === 'ml');
}

/* ------------------------------------------------------------------ */
/* Hazırlanış adımları                                                 */
/* ------------------------------------------------------------------ */

/** "20 ml." gibi sayı+birim sonundaki nokta cümle sonu değildir. */
const ABBR = /(\b\d+[.,]\d+|\b\d+\s*(?:ml|gr|g|lt|oz|sn|dk|°C)|\boz|\bNo)\.$/i;

export function splitSentences(tech) {
  const out = [];
  for (const line of (tech || '').split('\n')) {
    let buf = '';
    for (const part of line.split(/(?<=[.!?])\s+/)) {
      buf += (buf ? ' ' : '') + part.trim();
      if (ABBR.test(buf)) continue;
      if (buf.length > 2) out.push(buf.trim());
      buf = '';
    }
    if (buf.trim().length > 2) out.push(buf.trim());
  }
  return out;
}

/**
 * Hazırlanışı gerçek adımlara böler.
 *
 * İki düzeltme yapar:
 *  1. Reçete espressoyu hiç anlatmıyorsa (frappe'lerde olduğu gibi) ilk adım
 *     olarak espresso hazırlamayı ekler — 18 gr kahve 40 ml shot'a dönüşmeden
 *     blendera girecek bir şey yok.
 *  2. "Tüm malzemeleri blendera koyun" gibi malzemeleri tek kalemde geçen
 *     adımı, malzeme malzeme açar. Reçetenin kendi porsiyonlama notu zaten
 *     bunu söylüyor; adım hâline getirilmezse barista sırayı bilemiyor.
 */
export function buildSteps(recipe, block) {
  const sentences = splitSentences(recipe.tech);
  const steps = [];
  const notes = [];

  const shot = block.layers.find((l) => l.tone === 'espresso');
  const techMentionsShot = /espresso|ristretto|shot|portafiltre/i.test(recipe.tech || '');
  if (block.dose && shot && !techMentionsShot) {
    steps.push(`**${block.dose.text}** öğütülmüş kahveyle **${shot.text}** espresso hazırlayın.`);
  }

  for (const s of sentences) {
    if (/^porsiyonlama/i.test(s)) {
      // "Porsiyonlama:" ve "Porsiyonlama İpucu:" — Türkçe büyük İ (U+0130)
      // `i` bayrağıyla ASCII i'ye katlanmadığı için tek tek yazılamaz;
      // başlıktan sonraki ilk iki nokta üst üsteye kadarını atıyoruz.
      notes.push(s.replace(/^porsiyonlama(\s+\S+)?\s*:\s*/i, '').replace(/^porsiyonlama\s*/i, ''));
      continue;
    }
    if (/tüm malzeme|hepsini|bütün malzeme/i.test(s)) {
      const ice = block.layers.find((l) => l.fill === 'silme');
      if (ice) steps.push('Bardağı **silme buzla** doldurun — porsiyon ölçünüz bu.');
      block.layers
        .filter((l) => l.fill === 'ml')
        .sort((a, b) => a.order - b.order)
        .forEach((l) => steps.push(`**${l.text}** ${l.name.toLocaleLowerCase('tr')} ekleyin.`));
      steps.push(s.replace(/^tüm malzemeleri?\s*/i, 'Hepsini ').replace(/blendera koyup/i, 'blendera alıp'));
      continue;
    }
    steps.push(s);
  }
  return { steps, notes };
}
