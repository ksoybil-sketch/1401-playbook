/**
 * Tablo dosyalarını satır dizisine çevirir: .xlsx, .csv, .tsv
 *
 * Neden kütüphane yok: .xlsx aslında içinde XML bulunan bir zip dosyası ve
 * tarayıcı ikisini de kendi başına açabiliyor — zip'i `DecompressionStream`
 * ile, XML'i `DOMParser` ile. Hazır bir paket eklemek, telefona inen pakete
 * yüzlerce kilobayt ve kendi güvenlik geçmişini de taşırdı; oysa bize
 * yalnızca hücrelerin metni gerekiyor.
 *
 * Desteklenmeyen (ve gerekmeyen) şeyler: formüller (hesaplanmış değer
 * okunur), biçimlendirme, birden çok sayfa (ilk sayfa alınır), tarih
 * biçimleri (sayı olarak gelir).
 */

export type SheetRow = string[];

/* ------------------------------------------------------------------ */
/* Zip                                                                 */
/* ------------------------------------------------------------------ */

interface ZipEntry { name: string; method: number; offset: number; compressedSize: number }

function readZipDirectory(buf: ArrayBuffer): ZipEntry[] {
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // "End of central directory" imzasını sondan ara (yorum alanı 64 KB'a kadar).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Dosya bir Excel (.xlsx) dosyası değil.');

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, offset, compressedSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readZipEntry(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  const dv = new DataView(buf);
  if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error('Excel dosyası bozuk görünüyor.');
  const nameLen = dv.getUint16(e.offset + 26, true);
  const extraLen = dv.getUint16(e.offset + 28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  const raw = new Uint8Array(buf, start, e.compressedSize);

  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new Error('Excel dosyası beklenmedik bir sıkıştırma kullanıyor.');

  // .xlsx içindeki dosyalar ham deflate ile sıkıştırılır (zlib başlığı yok).
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/* ------------------------------------------------------------------ */
/* Sayfa XML'i                                                         */
/* ------------------------------------------------------------------ */

/** "BC" → 54. Hücrenin hangi sütunda olduğunu harf kodundan çıkarır. */
function colIndex(ref: string): number {
  const m = ref.match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheetXml(sheetXml: string, shared: string[]): SheetRow[] {
  const doc = new DOMParser().parseFromString(sheetXml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Excel sayfası okunamadı.');

  const rows: SheetRow[] = [];
  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r') || '';
      const type = c.getAttribute('t');
      let text = '';
      if (type === 's') {
        const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        text = shared[Number(v)] ?? '';
      } else if (type === 'inlineStr') {
        text = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('');
      } else {
        text = c.getElementsByTagName('v')[0]?.textContent ?? '';
      }
      const idx = ref ? colIndex(ref) : cells.length;
      while (cells.length < idx) cells.push('');
      cells[idx] = text.trim();
    }
    rows.push(cells);
  }
  return rows;
}

function parseSharedStrings(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t'))
      .filter((t) => t.parentElement?.tagName !== 'rPh')
      .map((t) => t.textContent ?? '')
      .join('')
      .trim()
  );
}

/* ------------------------------------------------------------------ */
/* Ayırıcılı metin                                                     */
/* ------------------------------------------------------------------ */

/**
 * Ayırıcıyı ilk satırdan tahmin eder. Türkçe Excel noktalı virgül yazar,
 * İngilizce olan virgül — ikisi de gelebilir.
 */
function detectDelimiter(text: string): string {
  const head = text.split('\n', 1)[0] ?? '';
  const count = (ch: string) => head.split(ch).length - 1;
  const best = (['\t', ';', ','] as const)
    .map((ch) => ({ ch, n: count(ch) }))
    .sort((a, b) => b.n - a.n)[0];
  return best && best.n > 0 ? best.ch : ',';
}

/** Tırnak içindeki ayırıcıyı ve "" kaçışını doğru ele alan CSV/TSV okuyucu. */
export function parseDelimited(text: string, delimiter?: string): SheetRow[] {
  const d = delimiter ?? detectDelimiter(text);
  const rows: SheetRow[] = [];
  let cell = '';
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === d) { row.push(cell.trim()); cell = ''; continue; }
    if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; continue; }
    if (ch === '\r') continue;
    cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

/* ------------------------------------------------------------------ */

export async function readSheet(file: File): Promise<SheetRow[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return parseDelimited(await file.text());
  }

  if (name.endsWith('.xls')) {
    throw new Error('Eski .xls biçimi okunamıyor. Excel\'de "Farklı kaydet" ile .xlsx ya da .csv seç.');
  }

  if (!name.endsWith('.xlsx')) {
    throw new Error('Desteklenen tablo biçimleri: .xlsx, .csv, .tsv');
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Bu tarayıcı .xlsx açamıyor. Dosyayı .csv olarak kaydedip tekrar dene.');
  }

  const buf = await file.arrayBuffer();
  const entries = readZipDirectory(buf);

  const sharedEntry = entries.find((e) => e.name === 'xl/sharedStrings.xml');
  const shared = sharedEntry ? parseSharedStrings(await readZipEntry(buf, sharedEntry)) : [];

  // İlk sayfa: sheet1.xml, yoksa worksheets altındaki ilk dosya.
  const sheetEntry =
    entries.find((e) => e.name === 'xl/worksheets/sheet1.xml') ||
    entries.filter((e) => e.name.startsWith('xl/worksheets/') && e.name.endsWith('.xml'))
      .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!sheetEntry) throw new Error('Excel dosyasında sayfa bulunamadı.');

  const rows = parseSheetXml(await readZipEntry(buf, sheetEntry), shared);
  return rows.filter((r) => r.some((c) => c !== ''));
}
