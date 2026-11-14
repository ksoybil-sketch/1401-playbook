import type { LessonBlock } from '../../shared/types';

/**
 * Taranmış / görüntü PDF'lerde OCR çıktısını derse çevirir.
 *
 * Sorun: tasarımlı sayfalarda (sunumdan dönüştürülmüş rehberler, afişler)
 * Tesseract bütün sayfayı tek blok sanıyor; bir satır sol karttan sağdaki
 * fotoğrafa uzanıyor, ikonlar "©" ya da "@" diye okunuyor, fotoğraflar
 * anlamsız harf yığınına dönüyor. Burada kelime düzeyindeki çıktı
 * (konum, yükseklik, güven) kullanılarak sayfa yeniden kuruluyor:
 *
 *  1. Güveni düşük ve harf içermeyen kelimeler atılır.
 *  2. Satırlar büyük yatay boşluklardan bölünür (sütun ayrımı).
 *  3. Parçalar sütunlara atanır; okuma sırası sütun sütun, yukarıdan aşağı.
 *  4. Ortalamadan belirgin büyük yazı başlık olur.
 *  5. Her sayfada tekrarlanan satırlar (logo, alt bilgi) silinir.
 *  6. Satır başındaki ikon kalıntıları temizlenir; ikonla başlayan satır
 *     madde işaretli liste olur.
 */

export interface OcrWord { text: string; conf: number; x0: number; y0: number; x1: number; y1: number }
export interface OcrLine { words: OcrWord[] }
export interface OcrPage { width: number; height: number; lines: OcrLine[] }

interface Seg { text: string; x0: number; y0: number; x1: number; y1: number; h: number; page: number; bullet: boolean }

const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]/g;
const letters = (s: string) => (s.match(LETTER) || []).length;

/** İkon, onay işareti, kart kenarı kalıntıları. */
const ICON_TOKEN = /^(?:[©®@°•●○◎◉✓✔☑■□▪▫*~|\\/<>=+\-–—_^`'"“”‘’.,:;()[\]{}]+|\[\+\]|[A-ZÇĞİÖŞÜ]{2,3}|[oOQ0eéxX×✗✘])$/;
/** Satır sonunda fotoğraf kenarından taşan kısa parça. */
const TRAIL_JUNK = /^(?:[^A-Za-zÇĞİÖŞÜçğıöşü]+|.{1,2}|[A-ZÇĞİÖŞÜ][a-zçğıöşü]?)$/;

function cleanWords(words: OcrWord[]): OcrWord[] {
  return words.filter((w) => {
    const t = w.text.trim();
    if (!t) return false;
    const l = letters(t);
    if (w.conf < 35) return false;
    if (w.conf < 60 && l < 2) return false;
    if (l === 0 && !/\d/.test(t)) return false; // yalnızca işaret
    return true;
  });
}

/** Kısa kelimelerden ibaret parça ("Ami", "SAT", "oo oo", "rE Ç-") — fotoğraf/ikon gürültüsü. */
function isNoise(text: string): boolean {
  const ws = text.split(/\s+/).map((w) => (w.match(LETTER) || []).join(''));
  if (ws.every((w) => w.length <= 3)) return true;
  // "rE", "JL" gibi karışık büyük/küçük harf → OCR çöpü.
  const odd = ws.filter((w) => /[a-zçğıöşü][A-ZÇĞİÖŞÜ]/.test(w)).length;
  return odd > 0 && odd >= ws.length / 2;
}

function splitLine(line: OcrLine, page: number, pageWidth: number): Seg[] {
  // İkonlar düşük harfli/güvenli olduğu için temizlikte kaybolur; madde
  // işaretini kaybetmemek için önce bölüp satır başını inceliyoruz.
  const words = line.words.filter((w) => w.text.trim() && w.conf >= 20).sort((a, b) => a.x0 - b.x0);
  if (!words.length) return [];
  const hs = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const h = hs[Math.floor(hs.length / 2)] || 20;
  // Kelime arası normalde ~0.4 satır yüksekliği; 2,2 katını aşan boşluk sütun sınırı.
  const gapLimit = Math.max(h * 2.2, pageWidth * 0.025);
  const groups: OcrWord[][] = [[words[0]]];
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    if (words[i].x0 - prev.x1 > gapLimit) groups.push([words[i]]);
    else groups[groups.length - 1].push(words[i]);
  }
  const out: Seg[] = [];
  for (const raw of groups) {
    let bullet = false;
    let lead = 0;
    while (lead < raw.length - 1 && !/^\d+[.)]?$/.test(raw[lead].text.trim()) && (ICON_TOKEN.test(raw[lead].text.trim()) || (letters(raw[lead].text) === 0 && !/\d/.test(raw[lead].text))) && letters(raw[lead + 1].text) >= 2) {
      lead++;
      bullet = true;
    }
    const g = cleanWords(raw.slice(lead));
    if (!g.length) continue;
    let tokens = g.map((w) => w.text.trim());
    // Satır başındaki ikon kalıntıları ("©", "[+]", "ELİ", "@") → madde işareti.
    while (tokens.length > 1 && ICON_TOKEN.test(tokens[0]) && letters(tokens[1]) >= 2) {
      tokens = tokens.slice(1);
      bullet = true;
    }
    // Sondaki çöp: fotoğraf kenarından taşan 1–3 harflik parçalar.
    while (tokens.length > 2 && TRAIL_JUNK.test(tokens[tokens.length - 1])) {
      tokens = tokens.slice(0, -1);
    }
    const text = tokens.join(' ').replace(/\s+/g, ' ').trim();
    const l = letters(text);
    if (l < 3 || l / text.replace(/\s/g, '').length < 0.6 || isNoise(text)) continue;
    const gh = g.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
    out.push({
      text, bullet, page,
      x0: Math.min(...g.map((w) => w.x0)), x1: Math.max(...g.map((w) => w.x1)),
      y0: Math.min(...g.map((w) => w.y0)), y1: Math.max(...g.map((w) => w.y1)),
      h: gh[Math.floor(gh.length / 2)]
    });
  }
  return out;
}

/** Bir sayfanın parçalarını sütunlara ayırıp okuma sırasına koyar. */
function orderPage(segs: Seg[], width: number): Seg[] {
  if (segs.length < 2) return segs;
  // Sütun başlangıçları: geniş parçaların sol kenarları, birbirine %8'den uzaksa ayrı sütun.
  const starts = segs.filter((s) => s.x1 - s.x0 > width * 0.12).map((s) => s.x0).sort((a, b) => a - b);
  const cols: number[] = [];
  for (const x of starts) if (!cols.length || x - cols[cols.length - 1] > width * 0.08) cols.push(x);
  const colOf = (s: Seg) => {
    let c = 0;
    for (let i = 0; i < cols.length; i++) if (s.x0 >= cols[i] - width * 0.02) c = i;
    return c;
  };
  // Sayfa boyu başlık (tam genişlik ya da çok büyük yazı) önce gelir.
  return [...segs].sort((a, b) => {
    const ca = colOf(a), cb = colOf(b);
    return ca - cb || a.y0 - b.y0 || a.x0 - b.x0;
  });
}

const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '');

export interface OcrLessonResult { title: string | null; blocks: LessonBlock[]; words: number }

export function ocrPagesToLesson(pages: OcrPage[]): OcrLessonResult {
  const perPage = pages.map((p, i) => p.lines.flatMap((l) => splitLine(l, i, p.width)));

  // Her sayfada tekrar eden satırlar (logo, alt bilgi, sayfa başlığı şeridi).
  if (pages.length >= 3) {
    const count = new Map<string, number>();
    perPage.forEach((segs) => new Set(segs.map((s) => norm(s.text))).forEach((k) => count.set(k, (count.get(k) || 0) + 1)));
    const limit = Math.max(3, Math.ceil(pages.length * 0.5));
    perPage.forEach((segs, i) => { perPage[i] = segs.filter((s) => (count.get(norm(s.text)) || 0) < limit); });
  }

  const ordered = perPage.flatMap((segs, i) => orderPage(segs, pages[i].width));
  const heights = ordered.map((s) => s.h).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 20;
  const isHeading = (s: Seg) => s.h >= median * 1.3 && s.text.length <= 80 && !/[.!?,;]["”’']?$/.test(s.text) && !/^[a-zçğıöşü"“]/.test(s.text);

  // Başlık: ilk sayfadaki en büyük yazı (yeterince harf içeriyorsa).
  const first = perPage[0] || [];
  const big = [...first].sort((a, b) => b.h - a.h).find((s) => letters(s.text) >= 6);
  const title = big ? big.text : null;

  const blocks: LessonBlock[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  let last: Seg | null = null;
  const flush = () => {
    if (para.length) {
      const text = para.join(' ').replace(/\s+/g, ' ').trim();
      if (/^(altın kural|ipucu|not|püf noktası)\s*:/i.test(text)) blocks.push({ type: 'tip', text: boldLead(text) });
      else if (/^(dikkat|uyarı|asla)\s*[:!]/i.test(text)) blocks.push({ type: 'warning', text: boldLead(text) });
      else blocks.push({ type: 'text', text: boldLead(text) });
    }
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length) blocks.push({ type: 'text', text: bullets.map((b) => `- ${boldLead(b)}`).join('\n') });
    bullets = [];
  };

  for (const s of ordered) {
    if (s.text === title && s.page === 0 && blocks.length === 0) { last = s; continue; }
    const newPage = last && last.page !== s.page;
    const gapBig = last && (s.y0 - last.y1 > last.h * 1.1 || s.y0 < last.y0 || Math.abs(s.x0 - last.x0) > s.h * 3);
    if (isHeading(s)) {
      flush(); flushBullets();
      blocks.push({ type: 'heading', text: s.text });
    } else if (s.bullet) {
      flush();
      bullets.push(s.text);
    } else if (bullets.length && last && !gapBig && !newPage) {
      // Madde işaretli satırın devamı.
      bullets[bullets.length - 1] += ' ' + s.text;
    } else {
      flushBullets();
      if (gapBig || newPage) flush();
      para.push(s.text);
    }
    last = s;
  }
  flush(); flushBullets();

  // Arka arkaya iki başlık kaldıysa (boş bölüm), ilkini at.
  const cleaned = blocks.filter((b, i) => !(b.type === 'heading' && blocks[i + 1]?.type === 'heading' && b.text.length < 4));
  const words = cleaned.reduce((n, b) => n + ('text' in b ? b.text.split(/\s+/).length : 0), 0);
  return { title, blocks: cleaned, words };
}

/** "Tanım: Ana ürünle…" → "**Tanım:** Ana ürünle…" */
function boldLead(t: string): string {
  const m = t.match(/^([^:.!?]{2,32}):\s+(.+)$/);
  return m ? `**${m[1]}:** ${m[2]}` : t;
}
