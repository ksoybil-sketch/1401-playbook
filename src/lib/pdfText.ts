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

export type ReadProgress = (msg: string) => void;

let workerPromise: Promise<import('tesseract.js').Worker> | null = null;
/** Tek OCR işçisi; ilk kullanımda dil verisi (~10 MB) indirilir ve önbelleğe alınır. */
async function ocrWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker(['tur', 'eng']));
  }
  return workerPromise;
}

/** Görüntüden (fotoğraf, ekran görüntüsü, taranmış sayfa) metin okur. */
export async function ocrImage(image: Blob | HTMLCanvasElement, onProgress?: ReadProgress): Promise<string> {
  onProgress?.('Görüntüdeki yazı okunuyor (OCR)…');
  const w = await ocrWorker();
  const { data } = await w.recognize(image);
  return data.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Satır kırılmalarını y koordinatından çıkarır — pdfjs metni parça parça verir. */
interface Piece { str: string; x: number; y: number }

export async function extractPdfText(file: File, maxPages = 20, onProgress?: ReadProgress): Promise<{ text: string; pages: number; ocrPages: number }> {
  const pdfjs = await import('pdfjs-dist');
  // Worker, ana paketten ayrı bir dosya; vite URL'i derleme sırasında çözer.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  // Belleği yükleme görevi üzerinden bırakıyoruz: belge nesnesinin kendi
  // destroy'u pdfjs 6'da yok.
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const out: string[] = [];
  let ocrPages = 0;

  for (let p = 1; p <= pageCount; p++) {
    onProgress?.(`Sayfa ${p}/${pageCount} okunuyor…`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const pieces: Piece[] = content.items
      .map((it) => {
        const item = it as { str?: string; transform?: number[] };
        if (typeof item.str !== 'string' || !item.transform) return null;
        return { str: item.str, x: item.transform[4], y: item.transform[5] };
      })
      .filter((x): x is Piece => !!x && x.str.trim() !== '');

    // Aynı satırdakileri y'ye göre grupla (küçük sapmalar tolere edilir),
    // satır içinde x'e göre sırala.
    const lines = new Map<number, Piece[]>();
    for (const piece of pieces) {
      const key = Math.round(piece.y / 3);
      const arr = lines.get(key);
      if (arr) arr.push(piece);
      else lines.set(key, [piece]);
    }

    const ordered = [...lines.entries()]
      .sort((a, b) => b[0] - a[0]) // sayfa üstten alta
      .map(([, arr]) => arr.sort((a, b) => a.x - b.x).map((x) => x.str).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    let pageText = ordered.join('\n');
    // Metin katmanı yok ya da çok az (taranmış sayfa, fotoğraf, afiş):
    // sayfayı 2x çözünürlükte çizip OCR'a ver.
    if (pageText.replace(/\s/g, '').length < 40) {
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      onProgress?.(`Sayfa ${p}/${pageCount} taranmış — yazı okunuyor (OCR)…`);
      const ocr = await ocrImage(canvas);
      if (ocr.replace(/\s/g, '').length > pageText.replace(/\s/g, '').length) {
        pageText = ocr;
        ocrPages++;
      }
    }
    out.push(pageText);
    page.cleanup();
  }

  const pages = doc.numPages;
  await task.destroy();
  return { text: out.join('\n'), pages, ocrPages };
}
