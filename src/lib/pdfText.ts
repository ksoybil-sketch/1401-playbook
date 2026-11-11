/**
 * PDF'den metin çıkarır.
 *
 * pdfjs ağır bir kütüphane (paket içinde en büyük parça), bu yüzden yalnızca
 * Kahve Operasyonu bir PDF seçtiğinde `import()` ile indirilir — baristanın
 * telefonuna inen pakete hiç girmez.
 *
 * Taranmış (fotoğraf) PDF'lerde metin katmanı yoktur; böyle bir dosyadan
 * boş sonuç döner ve çağıran bunu kullanıcıya söyler. OCR yapılmıyor.
 */

/** Satır kırılmalarını y koordinatından çıkarır — pdfjs metni parça parça verir. */
interface Piece { str: string; x: number; y: number }

export async function extractPdfText(file: File, maxPages = 20): Promise<{ text: string; pages: number }> {
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

  for (let p = 1; p <= pageCount; p++) {
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

    out.push(ordered.join('\n'));
    page.cleanup();
  }

  const pages = doc.numPages;
  await task.destroy();
  return { text: out.join('\n'), pages };
}
