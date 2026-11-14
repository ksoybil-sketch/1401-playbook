/**
 * Yerel gün (telefonun saat dilimine göre) — "YYYY-AA-GG".
 *
 * `new Date().toISOString().slice(0, 10)` UTC gününü verir: Türkiye'de gece
 * 00:00–03:00 arasında bir önceki günü döndürüyordu (işe başlama tarihine
 * "bugün" seçilemiyor, varsayılan dün oluyordu). Tarih kutuları (<input
 * type="date">) ve "bugünden ileri olamaz" kontrolleri bunu kullanmalı.
 */
export function localDay(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

/** "YYYY-AA-GG" → o yerel günün başlangıcı (ms). Geçersizse null. */
export function localDayStart(day: string | undefined | null): number | null {
  const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(t) ? t : null;
}
