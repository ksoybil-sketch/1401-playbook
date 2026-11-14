import type { LessonBlock } from '../../shared/types';

/**
 * Metinli PDF'i, mevcut modüllerdeki gibi kısa derslere çevirir.
 *
 * Eski yol PDF'i satır satır okuyup tek derse döküyordu: 73 sayfalık bir
 * kitapçık 375 bloklu tek ders oluyor, satır kırılmaları ayrı paragraf ya
 * da ayrı adım sayılıyor, Türkçe harfler kopuk çıkıyordu ("a ş ağıdaki").
 * Burada sayfa yeniden kurulur:
 *
 *  1. Her sayfada tekrar eden üst/alt bilgi, sayfa numarası, içindekiler
 *     satırları ve kapak atılır.
 *  2. Yazı boyutundan gövde metni bulunur; büyük ve BÜYÜK HARFLİ satırlar
 *     bölüm, numaralı kısa satırlar ve "A." / "Etiket:" satırları alt başlık.
 *  3. Satır kırılmaları birleştirilir (heceleme tireleri dahil); "*", "•",
 *     "-" ile başlayan satırlar madde, "1." ile başlayan cümleler adım olur.
 *  4. Bloklar ders biçimine sokulur: "Not/İpucu" → ipucu kutusu,
 *     "Dikkat/Önemli" → uyarı kutusu, art arda "Etiket: değer" satırları →
 *     ölçü tablosu, uzun paragraflar 3 cümlelik parçalara bölünür.
 *  5. Her bölüm bir ders olur; çok uzun bölümler alt başlıklardan bölünür,
 *     çok kısalar bir öncekine eklenir. Hedef 1-4 dakikalık dersler.
 */

export interface PdfLine {
  text: string;
  /** Yazı boyutu (pt). */
  size: number;
  /** 1 tabanlı sayfa numarası. */
  page: number;
  /** Sayfanın üstünden uzaklık (pt). */
  y: number;
  x: number;
}

export interface LessonDraft {
  title: string;
  durationMin: number;
  blocks: LessonBlock[];
  /** Hangi sayfalardan geldiği ("3-4"); önizlemede gösterilir. */
  pages?: string;
}

/** Ders içi blok + bölüm sınırı işareti (yalnızca bu dosyada). */
type Draft = LessonBlock | { type: 'section'; text: string; page: number };

const WPM = 180;
const LETTERS = /[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]/g;
const letters = (s: string) => (s.match(LETTERS) || []).length;
const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-zçğıöşü]/g, '');
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function blockWords(b: LessonBlock): number {
  switch (b.type) {
    case 'heading': case 'text': case 'tip': case 'warning': return words(b.text);
    case 'steps': return b.items.reduce((n, x) => n + words(x), 0);
    case 'spec': return b.rows.reduce((n, r) => n + words(r.label) + words(r.value), 0);
    case 'check': return words(b.prompt) + b.options.reduce((n, o) => n + words(o), 0);
    default: return 20; // görsel, video, bardak: kısa bir bakış
  }
}
export const lessonMinutes = (blocks: LessonBlock[]) => Math.max(1, Math.round(blocks.reduce((n, b) => n + blockWords(b), 0) / WPM));

/** "İ Ş L E T M E" → "İŞLETME"; noktalama önündeki boşluklar. */
export function fixSpacing(s: string): string {
  return s
    // Bazı PDF'lerin yazı tipi "ğ"yi "š" olarak kodluyor (Türkçede š yok).
    .replace(/š/g, 'ğ').replace(/Š/g, 'Ğ')
    .replace(/(^|\s)((?:\S )+\S)(?=\s|$)/g, (m, pre: string, run: string) =>
      run.split(' ').every((c) => c.length === 1) && run.length >= 5 ? pre + run.replace(/ /g, '') : m)
    .replace(/\s+([,.;:!?)%])/g, '$1')
    .replace(/([(“"‘])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** "ŞUBE AÇILIŞ PROSEDÜRLERİ" → "Şube açılış prosedürleri" (mevcut derslerdeki gibi). */
export function sentenceCase(s: string): string {
  const up = s.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  // Çoğu büyük harfse ("İDARİ YETKİLER (imza…)") de cümle düzenine çevir.
  const upper = up.replace(/[^A-ZÇĞİÖŞÜ]/g, '').length;
  if (!up) return s;
  if (upper < up.length * 0.6) {
    // Yalnızca baştaki BÜYÜK HARFLİ kelimeleri çevir: "İDARİ YETKİLER (imza…)" → "İdari yetkiler (imza…)".
    return s.replace(/^((?:[A-ZÇĞİÖŞÜ]{2,}[\s,/&-]+)+[A-ZÇĞİÖŞÜ]{2,})(?=\s|$|[(:])/, (m) => {
      const low = m.toLocaleLowerCase('tr');
      return low.charAt(0).toLocaleUpperCase('tr') + low.slice(1);
    });
  }
  const low = s.toLocaleLowerCase('tr');
  return low.charAt(0).toLocaleUpperCase('tr') + low.slice(1);
}

const BULLET = /^(?:[*•●▪◦○■□➢➤►✓✔]|[-–—](?=\s))\s*/;
const NUMBERED = /^(\d{1,2})[.)]\s*(?=[^\d\s.)])/;
const LETTERED = /^[A-HÇ][.)]\s*(?=\S)/;
const ENDS_SENTENCE = /[.!?…]["”’)]?$/;

/** "Not: …" → ipucu, "Dikkat: …" → uyarı; baştaki etiketi kalın yapar. */
const TIP = /^(not|ipucu|öneri|püf noktası|altın kural|hatırlatma|bilgi)\s*[:\-–]\s*/i;
const WARN = /^(dikkat|uyarı|önemli|asla|yasak|kesinlikle)\s*[:!\-–]\s*/i;
function boldLead(s: string): string {
  if (s.startsWith('**')) return s;
  const m = s.match(/^([^:.!?]{2,34}):\s+(\S.*)$/);
  return m && words(m[1]) <= 5 ? `**${m[1].trim()}:** ${m[2]}` : s;
}

/** Bir paragrafı telefonda okunacak parçalara böler (en fazla 3 cümle). */
function chunk(text: string): string[] {
  // Cümle sonu: nokta + boşluk + büyük harf. "(Görsel 1. 1)" ya da "1.2." bölünmez.
  const sentences = text.split(/(?<=[.!?…]["”’)]?)\s+(?=[A-ZÇĞİÖŞÜ“"])/).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  let cur: string[] = [];
  for (const s of sentences) {
    cur.push(s);
    if (cur.length >= 3 || cur.join(' ').length > 380) { out.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) {
    // Tek kısa cümle kalırsa öncekine ekle.
    if (out.length && cur.join(' ').length < 90) out[out.length - 1] += ' ' + cur.join(' ');
    else out.push(cur.join(' '));
  }
  return out;
}

interface Item { kind: 'para' | 'bullet' | 'num' | 'heading' | 'section'; text: string; page: number; size: number; y: number }

/** Satırları paragraf, madde, adım ve başlıklara toplar. */
function toItems(lines: PdfLine[], body: number): Item[] {
  const items: Item[] = [];
  let cur: Item | null = null;
  const push = (it: Item) => { items.push(it); cur = it.kind === 'heading' || it.kind === 'section' ? null : it; };

  lines.forEach((l, idx) => {
    const t = l.text;
    const next = lines[idx + 1];
    // Bir sonraki satır küçük harfle sürüyorsa bu satır başlık değil, yarım kalmış cümle.
    const runsOn = !!next && next.page === l.page && next.y - l.y > 0 && next.y - l.y <= l.size * 1.9 && /^[a-zçğıöşü(]/.test(next.text);
    const big = l.size >= body * 1.06;
    const caps = letters(t) >= 5 && t === t.toLocaleUpperCase('tr') && /[A-ZÇĞİÖŞÜ]/.test(t);
    const short = t.length <= 80 && !ENDS_SENTENCE.test(t) && !/[,;]$/.test(t) && !runsOn;
    const num = t.match(NUMBERED);

    // Bölüm: büyük ya da gövde boyutunda BÜYÜK HARFLİ kısa satır.
    if (short && !num && letters(t) >= 4 && ((big && caps) || l.size >= body * 1.4 || (caps && l.size >= body * 0.95 && words(t) >= 2 && t.length <= 60))) {
      // Arka arkaya gelen iki bölüm satırı tek başlıktır ("ŞUBE AÇILIŞ" / "PROSEDÜRLERİ").
      const prev = items[items.length - 1];
      if (prev && prev.kind === 'section' && prev.page === l.page && l.y - prev.y < l.size * 2.2) { prev.text += ' ' + t; prev.y = l.y; return; }
      push({ kind: 'section', text: t, page: l.page, size: l.size, y: l.y });
      return;
    }
    // Alt başlık: büyük kısa satır, "1. Kısa başlık", "A. Kısa başlık", "Etiket:" tek başına.
    if (short && letters(t) >= 3 && (big || (num && words(t) <= 8) || (LETTERED.test(t) && words(t) <= 8) || (/:$/.test(t) && words(t) <= 5 && t.length <= 40))) {
      push({ kind: 'heading', text: t.replace(NUMBERED, '').replace(LETTERED, '').replace(/\s*:$/, '').trim(), page: l.page, size: l.size, y: l.y });
      return;
    }
    if (BULLET.test(t)) { push({ kind: 'bullet', text: t.replace(BULLET, ''), page: l.page, size: l.size, y: l.y }); return; }
    if (num) { push({ kind: 'num', text: t.replace(NUMBERED, ''), page: l.page, size: l.size, y: l.y }); return; }

    // Devam satırı mı, yeni paragraf mı?
    const c = cur as Item | null;
    const samePageGap = c && c.page === l.page ? l.y - c.y : null;
    const continues = c && (
      (samePageGap !== null && samePageGap > 0 && samePageGap <= l.size * 1.9) ||
      // Sayfa sonunda yarım kalan cümle bir sonraki sayfada sürer.
      (c.page !== l.page && !ENDS_SENTENCE.test(c.text) && /^[a-zçğıöşü(]/.test(t))
    );
    if (c && continues) {
      c.text = /[a-zçğıöşü]-$/.test(c.text) && /^[a-zçğıöşü]/.test(t) ? c.text.slice(0, -1) + t : `${c.text} ${t}`;
      c.y = l.y; c.page = l.page;
    } else {
      push({ kind: 'para', text: t, page: l.page, size: l.size, y: l.y });
    }
  });
  return items;
}

/** Paragraf ve maddeleri ders bloklarına çevirir. */
function toDrafts(items: Item[]): Draft[] {
  const out: Draft[] = [];
  const repeats = new Map<string, number>();
  for (const it of items) if (it.kind === 'section') repeats.set(norm(it.text), (repeats.get(norm(it.text)) || 0) + 1);
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    if (it.kind === 'section' || it.kind === 'heading') {
      // "1.2.4. Başlık" → "Başlık"; ders adında bölüm numarası gereksiz.
      const text = sentenceCase(fixSpacing(it.text).replace(/^\d+(?:\.\d+)*\.?\s+(?=\S)/, ''));
      // Belgede birden çok kez geçen bölüm adı ("BİLGİ KUTUSU", "ARAŞTIRINIZ") bölüm değil, ara başlıktır.
      out.push(it.kind === 'section' && (repeats.get(norm(it.text)) || 0) < 2 ? { type: 'section', text, page: it.page } : { type: 'heading', text });
      i++; continue;
    }
    if (it.kind === 'num') {
      const steps: string[] = [];
      while (i < items.length && items[i].kind === 'num') steps.push(fixSpacing(items[i++].text));
      out.push(steps.length >= 2 ? { type: 'steps', items: steps } : { type: 'text', text: boldLead(steps[0]) });
      continue;
    }
    if (it.kind === 'bullet') {
      const list: string[] = [];
      while (i < items.length && items[i].kind === 'bullet') list.push(fixSpacing(items[i++].text));
      // Uzun listeyi 6 maddelik parçalara böl; telefonda tek blok ekranı doldurmasın.
      for (let k = 0; k < list.length; k += 6) {
        const part = list.slice(k, k + 6).map((x) => `- ${boldLead(x)}`);
        out.push({ type: 'text', text: part.join('\n') });
      }
      continue;
    }
    // Art arda kısa "Etiket: değer" paragrafları → ölçü tablosu.
    const spec: { label: string; value: string }[] = [];
    let j = i;
    while (j < items.length && items[j].kind === 'para') {
      const m = fixSpacing(items[j].text).match(/^([^:]{2,32}):\s*(.{1,48})$/);
      if (!m || ENDS_SENTENCE.test(m[2]) && words(m[2]) > 4) break;
      spec.push({ label: m[1].trim(), value: m[2].trim() });
      j++;
    }
    if (spec.length >= 2) { out.push({ type: 'spec', rows: spec }); i = j; continue; }

    const text = fixSpacing(it.text);
    i++;
    if (letters(text) < 3) continue;
    if (TIP.test(text)) { out.push({ type: 'tip', text: boldLead(text) }); continue; }
    if (WARN.test(text)) { out.push({ type: 'warning', text: boldLead(text) }); continue; }
    for (const c of chunk(text)) out.push({ type: 'text', text: boldLead(c) });
  }
  return out;
}

/** Bloklardan dersler: bölümlerden kes, uzunları alt başlıktan böl, kısaları birleştir. */
export function draftsToLessons(drafts: Draft[], fallbackTitle: string, lastPage = 1): LessonDraft[] {
  interface Sec { title: string; blocks: LessonBlock[]; from: number; to: number }
  const secs: Sec[] = [];
  let cur: Sec | null = null;
  let page = 1;
  for (const d of drafts) {
    if (d.type === 'section') {
      page = d.page;
      cur = { title: d.text, blocks: [], from: page, to: page };
      secs.push(cur);
      continue;
    }
    if (!cur) { cur = { title: '', blocks: [], from: page, to: page }; secs.push(cur); }
    cur.blocks.push(d);
  }
  // Bölüm, bir sonraki bölümün başladığı sayfaya kadar sürer.
  secs.forEach((s, k) => { s.to = Math.max(s.from, secs[k + 1]?.from ?? lastPage); });

  const wordsOf = (bs: LessonBlock[]) => bs.reduce((n, b) => n + blockWords(b), 0);
  const out: LessonDraft[] = [];
  const add = (title: string, blocks: LessonBlock[], s: Sec) => {
    // Ders bir başlıkla başlıyorsa ve o başlık dersin adıysa tekrar etme.
    while (blocks[0]?.type === 'heading' && blocks[0].text === title) blocks = blocks.slice(1);
    if (!blocks.length) return;
    out.push({ title, blocks, durationMin: lessonMinutes(blocks), pages: s.from === s.to ? `${s.from}` : `${s.from}-${s.to}` });
  };

  for (const s of secs) {
    const total = wordsOf(s.blocks);
    const title = s.title || (out.length ? `${out[out.length - 1].title} (devam)` : 'Giriş');
    if (total <= 720) { add(title, s.blocks, s); continue; }
    // Uzun bölüm: alt başlıklarda ~450 kelimede bir kes.
    const parts: LessonBlock[][] = [];
    let part: LessonBlock[] = [];
    for (const b of s.blocks) {
      const n = wordsOf(part);
      // Yeni bir form/kart (ölçü tablosuyla başlayan kısım) ya da alt başlık: uygun kesme yeri.
      if ((b.type === 'heading' && n >= 300) || (b.type === 'spec' && n >= 150) || n >= 650) { parts.push(part); part = []; }
      part.push(b);
    }
    if (part.length) {
      if (parts.length && wordsOf(part) < 120) parts[parts.length - 1].push(...part);
      else parts.push(part);
    }
    parts.forEach((p, k) => {
      const first = p[0];
      const sub = first?.type === 'heading' ? first.text
        : first?.type === 'spec' && first.rows[0].value.length <= 40 ? sentenceCase(first.rows[0].value) : null;
      add(parts.length === 1 ? title : sub ? `${title}: ${sub}` : `${title} (${k + 1}/${parts.length})`, first?.type === 'heading' ? p.slice(1) : p, s);
    });
  }

  // Çok kısa dersleri (≤ 60 kelime) bir öncekine ekle.
  const merged: LessonDraft[] = [];
  for (const l of out) {
    const prev = merged[merged.length - 1];
    if (prev && wordsOf(l.blocks) <= 60 && wordsOf(prev.blocks) < 650) {
      prev.blocks.push({ type: 'heading', text: l.title }, ...l.blocks);
      prev.durationMin = lessonMinutes(prev.blocks);
      prev.pages = `${prev.pages?.split('-')[0]}-${l.pages?.split('-').pop()}`;
    } else merged.push(l);
  }
  if (merged.length === 1 && (merged[0].title === 'Giriş' || !merged[0].title)) merged[0].title = fallbackTitle;
  return merged;
}

/** Sayfaların çoğunda tekrar eden satırlar (logo, alt bilgi), sayfa numaraları, içindekiler. */
function dropNoise(lines: PdfLine[], pageCount: number): { lines: PdfLine[]; dropped: number } {
  // İlk 18 harf: aynı alt bilginin küçük yazım farkları (Perakendecilik/Parakendecilik) tek sayılsın.
  const key = (t: string) => norm(t.replace(/\d+/g, '')).slice(0, 18);
  const pagesWith = new Map<string, Set<number>>();
  for (const l of lines) {
    const k = key(l.text);
    if (k.length < 4) continue;
    (pagesWith.get(k) || pagesWith.set(k, new Set()).get(k)!).add(l.page);
  }
  const limit = Math.max(3, Math.ceil(pageCount * 0.4));
  const kept = lines.filter((l) => {
    const t = l.text;
    if (/^(?:sayfa\s*)?\d{1,3}(?:\s*\/\s*\d{1,3})?$/i.test(t)) return false; // sayfa numarası
    if (/\.{4,}\s*\d{1,3}$|…{2,}\s*\d{1,3}$/.test(t)) return false; // içindekiler
    if (pageCount >= 3 && (pagesWith.get(key(t))?.size || 0) >= limit) return false;
    return true;
  });
  return { lines: kept, dropped: lines.length - kept.length };
}

export interface PdfLessonResult { lessons: LessonDraft[]; warnings: string[] }

export function pdfLinesToLessons(all: PdfLine[], pageCount: number, fallbackTitle: string): PdfLessonResult {
  const warnings: string[] = [];
  const { lines } = dropNoise(all.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text), pageCount);
  if (!lines.length) return { lessons: [], warnings: ['PDF\'te okunabilir metin çıkmadı.'] };

  // Gövde yazı boyutu: en çok harfin yazıldığı boyut.
  const bySize = new Map<number, number>();
  for (const l of lines) { const s = Math.round(l.size * 2) / 2; bySize.set(s, (bySize.get(s) || 0) + l.text.length); }
  const bodySize = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 11;

  // Kapak: ilk sayfada gövde boyutunda çok az yazı varsa (büyük başlık + künye) atla.
  const firstPage = lines[0].page;
  const firstWords = lines.filter((l) => l.page === firstPage && l.size >= bodySize * 0.95).reduce((n, l) => n + words(l.text), 0);
  const body = lines.filter((l) => l.page !== firstPage || firstWords >= 40);
  if (body.length < lines.length) warnings.push(`${firstPage}. sayfa kapak sayıldı ve atlandı.`);

  const drafts = toDrafts(toItems(body, bodySize));
  const lessons = draftsToLessons(drafts, fallbackTitle, body[body.length - 1].page);
  if (lessons.length > 1) warnings.push(`PDF ${lessons.length} derse bölündü: bölüm başlıklarından kesildi. İstemediklerinin işaretini kaldır.`);
  warnings.push('Başlık, madde ve kutu ayrımı otomatik yapıldı: yayınlamadan önce dersleri gözden geçir.');
  return { lessons, warnings };
}

/** OCR ile okunan (taranmış) sayfaların blokları için aynı bölme: başlıklardan ders. */
export function blocksToLessons(blocks: LessonBlock[], title: string): LessonDraft[] {
  const total = blocks.reduce((n, b) => n + blockWords(b), 0);
  const headings = blocks.filter((b) => b.type === 'heading').length;
  if (total <= 720 || headings < 2) return blocks.length ? [{ title, blocks, durationMin: lessonMinutes(blocks) }] : [];
  const drafts: Draft[] = blocks.map((b) => (b.type === 'heading' ? { type: 'section', text: b.text, page: 1 } : b));
  return draftsToLessons(drafts, title).map((l) => ({ ...l, pages: undefined }));
}
