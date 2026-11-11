import type { LessonBlock, QuestionKind, QuestionType } from '../../shared/types';
import type { SheetRow } from './sheet';

/**
 * Tablo satırlarını ve düz metni ders bloklarına çevirir.
 *
 * Amaç, dosyayı dersin yerine koymak değil — ilk taslağı çıkarmak. Çıkan
 * blokları Kahve Operasyonu editörde görüp düzeltiyor, "baristada böyle
 * görünecek" önizlemesiyle de karşılaştırıyor. Bu yüzden ayrıştırıcı
 * tahmin yürüttüğü her yerde uyarı bırakır; sessizce yanlış ders üretmez.
 */

/** Dosyadan çıkarılan soru — modülün soru bankasına eklenecek taslak. */
export interface DraftQuestion {
  type: QuestionType;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  kind: QuestionKind;
}

export interface ImportResult {
  title: string;
  durationMin: number;
  blocks: LessonBlock[];
  warnings: string[];
  /** Soru bankasına önerilen sorular (kullanıcı seçer). */
  questions?: DraftQuestion[];
  /** Nasıl üretildi: yapay zekâ mı, kural tabanlı mı. */
  source?: 'ai' | 'rules';
}

const norm = (s: string) =>
  (s || '').toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '')
    .trim();

/** İlk sütundaki tip sözcüğü → blok. Eş anlamlılar kabul edilir. */
const TYPES: Record<string, string> = {
  ders: 'ders', dersadi: 'ders', baslikders: 'ders',
  sure: 'sure', dakika: 'sure',
  bolum: 'heading', baslik: 'heading', altbaslik: 'heading',
  metin: 'text', paragraf: 'text', aciklama: 'text',
  adim: 'steps', adimlar: 'steps', sira: 'steps',
  ipucu: 'tip', not: 'tip', oneri: 'tip',
  uyari: 'warning', dikkat: 'warning',
  olcu: 'spec', standart: 'spec', malzeme: 'spec', recete: 'spec',
  soru: 'check', alistirma: 'check',
  gorsel: 'image', fotograf: 'image', resim: 'image',
  video: 'video'
};

const HEADERS = new Set(['tip', 'tur', 'icerik', 'deger', 'ek', 'aciklama2', 'cevap', 'dogru', 'secenekler', 'siklar']);

/** "A;B;C" ya da "A|B|C" → ["A","B","C"] */
const splitOptions = (s: string) =>
  (s || '').split(/[;|]/).map((x) => x.trim()).filter(Boolean);

export function rowsToLesson(rows: SheetRow[], fallbackTitle: string): ImportResult {
  const warnings: string[] = [];
  const blocks: LessonBlock[] = [];
  let title = '';
  let durationMin = 2;

  // Başlık satırı: ilk satırın ilk iki hücresi tip/içerik gibi sözcüklerse atla.
  let start = 0;
  if (rows.length && rows[0].slice(0, 3).filter(Boolean).every((c) => HEADERS.has(norm(c)))) start = 1;

  // Ardışık "adım" ve "ölçü" satırları tek blokta toplanır.
  let steps: string[] = [];
  let spec: { label: string; value: string }[] = [];
  const flush = () => {
    if (steps.length) { blocks.push({ type: 'steps', items: steps }); steps = []; }
    if (spec.length) { blocks.push({ type: 'spec', rows: spec }); spec = []; }
  };

  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 1;
    const a = (r[0] || '').trim();
    const b = (r[1] || '').trim();
    const c = (r[2] || '').trim();
    const d = (r[3] || '').trim();
    const kind = TYPES[norm(a)];

    if (!kind) {
      // Tip sütunu yoksa biçimden tahmin et: iki hücre = ölçü satırı, tek hücre = metin.
      if (a && b) { spec.push({ label: a, value: b }); continue; }
      if (a) { flush(); blocks.push({ type: 'text', text: a }); continue; }
      continue;
    }

    if (kind !== 'steps' && kind !== 'spec') flush();

    switch (kind) {
      case 'ders':
        title = b || title;
        break;
      case 'sure': {
        const n = parseInt(b, 10);
        if (Number.isFinite(n) && n > 0) durationMin = n;
        else warnings.push(`${line}. satır: süre sayı değil ("${b}"), 2 dakika varsayıldı.`);
        break;
      }
      case 'heading':
        if (b) blocks.push({ type: 'heading', text: b });
        break;
      case 'text':
        if (b) blocks.push({ type: 'text', text: b });
        break;
      case 'tip':
        if (b) blocks.push({ type: 'tip', text: b });
        break;
      case 'warning':
        if (b) blocks.push({ type: 'warning', text: b });
        break;
      case 'steps':
        if (b) steps.push(b);
        break;
      case 'spec':
        if (b) spec.push({ label: b, value: c });
        break;
      case 'image':
      case 'video':
        if (!b) break;
        if (!/^https?:\/\//i.test(b)) {
          warnings.push(`${line}. satır: ${kind === 'image' ? 'görsel' : 'video'} atlandı — dosya yolu değil, bağlantı (https://…) gerekiyor.`);
          break;
        }
        blocks.push(kind === 'image' ? { type: 'image', url: b, caption: c } : { type: 'video', url: b, caption: c });
        break;
      case 'check': {
        const options = splitOptions(c);
        if (!b || options.length < 2) {
          warnings.push(`${line}. satır: soru atlandı — en az iki şık gerekiyor (şıkları ";" ile ayır).`);
          break;
        }
        const answer = parseInt(d, 10);
        if (!Number.isFinite(answer) || answer < 1 || answer > options.length) {
          warnings.push(`${line}. satır: doğru şık belirtilmemiş, ilk şık doğru sayıldı.`);
        }
        blocks.push({
          type: 'check',
          prompt: b,
          options,
          answer: Number.isFinite(answer) && answer >= 1 && answer <= options.length ? answer - 1 : 0,
          explanation: (r[4] || '').trim()
        });
        break;
      }
    }
  }
  flush();

  if (!title) {
    title = fallbackTitle;
    warnings.push('Ders adı bulunamadı; dosya adı kullanıldı. İlk sütuna "Ders" yazan bir satır eklersen oradan okunur.');
  }
  if (!blocks.length) warnings.push('Dosyadan hiçbir içerik çıkarılamadı.');

  return { title, durationMin, blocks, warnings };
}

/* ------------------------------------------------------------------ */
/* Düz metin (PDF)                                                     */
/* ------------------------------------------------------------------ */

/**
 * PDF'den çıkan metni kaba bloklara böler: kısa ve sonu noktasız satırlar
 * başlık, "1." / "-" ile başlayanlar adım, kalanı paragraf sayılır.
 * Kesin değil — bu yüzden sonuç her zaman uyarıyla gelir.
 */
export function textToLesson(text: string, fallbackTitle: string): ImportResult {
  const warnings = [
    'PDF metinden çıkarıldı: başlık ve adım ayrımı tahminidir. Yayınlamadan önce blokları gözden geçir.'
  ];
  const blocks: LessonBlock[] = [];
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1);

  let title = '';
  let steps: string[] = [];
  let para: string[] = [];

  const flushSteps = () => { if (steps.length) { blocks.push({ type: 'steps', items: steps }); steps = []; } };
  const flushPara = () => {
    if (para.length) { blocks.push({ type: 'text', text: para.join(' ') }); para = []; }
  };

  for (const line of lines) {
    const stepMatch = line.match(/^(?:\d{1,2}[.)]\s*|[-•*]\s+)(.*)$/);
    if (stepMatch && stepMatch[1].length > 2) {
      flushPara();
      steps.push(stepMatch[1].trim());
      continue;
    }
    const isHeading = line.length <= 60 && !/[.!?:,;]$/.test(line) && line.split(' ').length <= 8;
    if (isHeading) {
      flushSteps();
      flushPara();
      if (!title) { title = line; continue; }
      blocks.push({ type: 'heading', text: line });
      continue;
    }
    flushSteps();
    para.push(line);
  }
  flushSteps();
  flushPara();

  if (!title) {
    title = fallbackTitle;
    warnings.push('Ders adı bulunamadı; dosya adı kullanıldı.');
  }
  if (!blocks.length) {
    warnings.push('Dosyadan okunabilir metin çıkmadı. Görüntü çok bulanık olabilir; daha net bir tarama dene ya da yapay zekâ ile oku.');
  }
  return { title, durationMin: 2, blocks, warnings };
}

/* ------------------------------------------------------------------ */

/** Örnek şablon — "Şablon indir" düğmesi bunu CSV olarak verir. */
export const TEMPLATE_CSV = [
  'Tip;İçerik;Ek;Doğru',
  'Ders;Cold Brew Hazırlığı;;',
  'Süre;3;;',
  'Bölüm;Ölçüler;;',
  'Ölçü;Öğütülmüş Kahve;100 gr;',
  'Ölçü;Soğuk Su;1000 ml;',
  'Bölüm;Hazırlanışı;;',
  'Adım;Kahveyi iri çekimde öğüt.;;',
  'Adım;Soğuk suyla karıştır, 12 saat buzdolabında beklet.;;',
  'Adım;Süzüp şişele, üzerine tarih yaz.;;',
  'İpucu;Demleme süresi 12 saati geçerse acılaşır.;;',
  'Uyarı;Şişede 48 saatten fazla bekleyen ürün servis edilmez.;;',
  // Şıklar "|" ile ayrılır: ";" zaten sütun ayırıcısı olduğu için şık ayracı olamaz.
  'Soru;Cold brew kaç saat demlenir?;6 saat|12 saat|24 saat;2'
].join('\n');

/* ------------------------------------------------------------------ */
/* Kural tabanlı soru üretimi (yapay zekâ anahtarı yoksa)              */
/* ------------------------------------------------------------------ */

const UNIT = /(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*(°C|°|dakika|dk\b|saniye|sn\b|saat|ml|litre|gr\b|gram|g\b|oz\b|%|cm|derece|bar\b)/i;

function variants(token: string): string[] {
  const m = token.match(/^(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(.*)$/);
  if (!m) return [];
  const a = parseFloat(m[1].replace(',', '.'));
  const b = m[2] ? parseFloat(m[2].replace(',', '.')) : null;
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10).replace('.', ','));
  const out = new Set<string>();
  for (const k of [0.5, 2, 1.5, 0.75, 3]) {
    const v = (b === null ? `${fmt(a * k)} ${m[3]}` : `${fmt(a * k)} - ${fmt(b * k)} ${m[3]}`).trim();
    if (v.replace(/\s/g, '') !== token.replace(/\s/g, '') && !/^0\b/.test(v)) out.add(v);
  }
  return [...out].slice(0, 3);
}

/**
 * Metinden basit sorular: sayı/ölçü içeren cümlelerde boşluk doldurma,
 * adım listelerinden sıra soruları. Anlam çıkarmaz — yapay zekâ anahtarı
 * tanımlıysa onun ürettiği sorular tercih edilir.
 */
export function blocksToQuestions(blocks: LessonBlock[], title: string): DraftQuestion[] {
  const out: DraftQuestion[] = [];
  const sentences = blocks.flatMap((b) =>
    b.type === 'text' || b.type === 'tip' || b.type === 'warning' ? b.text.split(/(?<=[.!?])\s+/)
      : b.type === 'steps' ? b.items : []);
  for (const raw of sentences) {
    const s = raw.trim();
    if (s.length < 20 || s.length > 220) continue;
    const m = s.match(UNIT);
    if (!m) continue;
    const token = m[0].trim();
    const wrong = variants(token);
    if (wrong.length < 3) continue;
    out.push({
      type: 'single', prompt: `${title}: boşluğa ne gelir? “${s.replace(m[0], '_____')}”`,
      options: [token, ...wrong], answer: 0, explanation: `Doğrusu: “${s}”`, kind: 'teknik'
    });
    if (out.length >= 8) break;
  }
  const steps = blocks.find((b) => b.type === 'steps');
  if (steps && steps.type === 'steps' && steps.items.length >= 3) {
    const [x, y] = [steps.items[0], steps.items[steps.items.length - 1]];
    out.push({
      type: 'truefalse', prompt: `${title}: “${y.slice(0, 70)}” adımı, “${x.slice(0, 70)}” adımından önce gelir.`,
      options: ['Doğru', 'Yanlış'], answer: 1, explanation: `Sıra: ${steps.items.join(' → ')}`, kind: 'adim'
    });
  }
  for (const b of blocks) {
    if (b.type === 'check') out.push({ type: 'single', prompt: b.prompt, options: b.options, answer: b.answer, explanation: b.explanation || '', kind: 'durum' });
  }
  return out;
}
