import type { CupFill } from './types';

/**
 * Reçete ölçüsünü ("200/270 ml", "Silme Bardak", "1 Tatlı Kaşığı") çözer.
 *
 * Burada duruyor çünkü iki taraf da aynı sonucu üretmek zorunda:
 *  - `scripts/recipe-cup.mjs`, müfredatı derlerken
 *  - panel, Kahve Operasyonu bir gramajı elle değiştirdiğinde
 *
 * İkisi ayrı ayrı yazılsaydı, elle düzeltilen bir ölçü şemada başka,
 * listede başka görünürdü.
 */
export interface ParsedAmount {
  fill: CupFill;
  /** Küçük/büyük bardak için ml. Hacimsiz ölçüde yok. */
  small?: number;
  large?: number;
  unit?: string;
  /** Ölçünün yazıldığı hâli. */
  text: string;
}

export function parseAmount(raw: string): ParsedAmount {
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
    const num = (x: string) => parseFloat(String(x).replace(',', '.'));
    const unit = m[3].toLowerCase();
    let a = num(m[1]);
    let b = m[2] ? num(m[2]) : null;
    if (unit === 'lt') { a *= 1000; if (b) b *= 1000; }
    if (unit === 'oz') { a *= 30; if (b) b *= 30; }
    const isMl = unit === 'ml' || unit === 'lt' || unit === 'oz';
    return {
      fill: isMl ? 'ml' : 'adet',
      small: a,
      large: b ?? a,
      unit: isMl ? 'ml' : unit,
      text: s
    };
  }
  return { fill: 'bilinmiyor', text: s };
}
