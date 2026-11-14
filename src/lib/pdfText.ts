/**
 * PDF'den metin çıkarır.
 *
 * pdfjs ağır bir kütüphane (paket içinde en büyük parça), bu yüzden yalnızca
 * Kahve Operasyonu bir PDF seçtiğinde `import()` ile indirilir — baristanın
 * telefonuna inen pakete hiç girmez.
 *
 * Taranmış (fotoğraf) PDF'lerde metin katmanı yoktur. Metni olmayan
 * sayfalar görüntüye çevrilip tarayıcıda OCR ile okunur (tesseract.js,
 * Türkçe + İngilizce). OCR modeli de yalnızca gerektiğinde indirilir.
 */

import type { OcrPage } from './ocrLayout';

export type ReadProgress = (msg: string) => void;

let workerPromise: Promise<import('tesseract.js').Worker> | null = null;
/** Tek OCR işçisi; ilk kullanımda dil verisi (~10 MB) indirilir ve önbelleğe alınır. */
async function ocrWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker(['tur', 'eng']));
  }
  return workerPromise;
}

/**
 * Görüntüden (fotoğraf, ekran görüntüsü, taranmış sayfa) kelime düzeyinde
 * metin okur: her kelimenin konumu ve güveni ile. Düz metne çevirmek
 * sütunları karıştırıyordu; sayfa düzeni src/lib/ocrLayout.ts'te kurulur.
 */
export async function ocrPage(image: Blob | HTMLCanvasElement, onProgress?: ReadProgress): Promise<OcrPage> {
  onProgress?.('Görüntüdeki yazı okunuyor (OCR)…');
  const w = await ocrWorker();
  const { data } = await w.recognize(image, {}, { blocks: true });
  const lines: OcrPage['lines'] = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) {
    lines.push({ words: l.words.map((x) => ({ text: x.text, conf: x.confidence, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 })) });
  }
  let width = 0, height = 0;
  if (image instanceof HTMLCanvasElement) { width = image.width; height = image.height; }
  else { const bmp = await createImageBitmap(image); width = bmp.width; height = bmp.height; bmp.close(); }
  return { width, height, lines };
}

import type { PdfLine } from './pdfLesson';

async function loadPdf(file: File) {
  const pdfjs = await import('pdfjs-dist');
  // Worker, ana paketten ayrı bir dosya; vite URL'i derleme sırasında çözer.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  // Belleği yükleme görevi üzerinden bırakıyoruz: belge nesnesinin kendi
  // destroy'u pdfjs 6'da yok.
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  return { task, doc: await task.promise };
}

/** Sayfa aralığı sorusu için: yalnızca sayfa sayısı. */
export async function pdfPageCount(file: File): Promise<number> {
  const { task, doc } = await loadPdf(file);
  const n = doc.numPages;
  await task.destroy();
  return n;
}

interface Piece { str: string; x: number; y: number; w: number; size: number }

/**
 * Bir sayfanın metin parçalarını satırlara toplar.
 *
 * pdfjs metni parça parça verir; bazı PDF'lerde Türkçe harfler ("ş", "ğ")
 * ayrı parça olarak gelir. Parçalar arasına körü körüne boşluk koymak
 * "a ş ağıdaki" üretiyordu: boşluk yalnızca parçalar arasında gerçekten
 * aralık varsa konur. Aynı satır, yazı boyutunun yarısı kadar dikey sapmayla
 * aranır (aksanlı harfler biraz yukarıda durabilir).
 */
export function pageLines(pieces: Piece[], pageNo: number, height: number): PdfLine[] {
  pieces.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; size: number; items: Piece[] }[] = [];
  for (const p of pieces) {
    const row = rows.find((r) => Math.abs(r.y - p.y) <= Math.max(r.size, p.size) * 0.45);
    if (row) { row.items.push(p); row.size = Math.max(row.size, p.size); }
    else rows.push({ y: p.y, size: p.size, items: [p] });
  }
  rows.sort((a, b) => b.y - a.y);
  const out: PdfLine[] = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    // Çok büyük yatay boşluk = ayrı sütun; satırı orada böl.
    let text = '';
    let end: number | null = null;
    let x0 = r.items[0].x;
    // Harf aralıklı başlık ("İ Ş L E T M E  K İ T A P Ç I Ğ I"): her harf ayrı
    // parça. Boşluğu harf arasındaki olağan aralıktan belirgin büyük yerlere koy.
    const letters = r.items.filter((it) => it.str.trim().length === 1);
    let spaceGap = r.size * 0.18;
    if (r.items.length >= 5 && letters.length >= r.items.length * 0.7) {
      const gaps = r.items.slice(1).map((it, k) => it.x - (r.items[k].x + r.items[k].w)).filter((g) => g > 0).sort((a, b) => a - b);
      if (gaps.length) spaceGap = Math.max(spaceGap, gaps[Math.floor(gaps.length / 2)] * 1.8);
    }
    const flush = () => { const tt = text.replace(/\s+/g, ' ').trim(); if (tt) out.push({ text: tt, size: Math.round(r.size * 10) / 10, page: pageNo, y: Math.round(height - r.y), x: Math.round(x0) }); };
    for (const it of r.items) {
      if (end !== null) {
        const gap = it.x - end;
        if (gap > r.size * 4) { flush(); text = ''; x0 = it.x; }
        else if (gap > spaceGap && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
      }
      text += it.str;
      end = it.x + it.w;
    }
    flush();
  }
  return out;
}

export interface PdfRead {
  lines: PdfLine[];
  /** Toplam sayfa sayısı. */
  pages: number;
  /** Okunan aralık (1 tabanlı, dahil). */
  from: number;
  to: number;
  /** Metin katmanı olmadığı için OCR'dan geçen sayfalar. */
  ocrPages: OcrPage[];
  ocrPageNos: number[];
}

export async function extractPdf(file: File, range: { from: number; to: number } | null, onProgress?: ReadProgress): Promise<PdfRead> {
  const { task, doc } = await loadPdf(file);
  const from = Math.max(1, Math.min(range?.from ?? 1, doc.numPages));
  const to = Math.max(from, Math.min(range?.to ?? doc.numPages, doc.numPages));
  const lines: PdfLine[] = [];
  const ocrPages: OcrPage[] = [];
  const ocrPageNos: number[] = [];

  for (let p = from; p <= to; p++) {
    onProgress?.(`Sayfa ${p - from + 1}/${to - from + 1} okunuyor…`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const height = page.view[3] - page.view[1];

    const pieces: Piece[] = [];
    for (const it of content.items) {
      const item = it as { str?: string; transform?: number[]; width?: number; height?: number };
      if (typeof item.str !== 'string' || !item.transform || item.str === '') continue;
      const [a, b, c, d, x, y] = item.transform;
      const size = Math.hypot(c, d) || Math.hypot(a, b) || item.height || 10;
      pieces.push({ str: item.str, x, y, w: item.width || 0, size });
    }
    const pl = pageLines(pieces.filter((x) => x.str.trim() || x.w > 0), p, height);

    // Metin katmanı yok ya da çok az (taranmış sayfa, sunumdan dönüştürülmüş
    // görsel, afiş): sayfayı ~2400 px genişlikte çizip OCR'a ver.
    if (pl.map((l) => l.text).join('').replace(/\s/g, '').length < 40) {
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2400 / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      onProgress?.(`Sayfa ${p - from + 1}/${to - from + 1} görüntü — yazı okunuyor (OCR)…`);
      ocrPages.push(await ocrPage(canvas));
      ocrPageNos.push(p);
    } else {
      lines.push(...pl);
    }
    page.cleanup();
  }

  const pages = doc.numPages;
  await task.destroy();
  return { lines, pages, from, to, ocrPages, ocrPageNos };
}
