/**
 * Takvim: bütün tarih ve "bugün" hesapları İSTANBUL saatine göre.
 *
 * İşletmenin tamamı İstanbul'da. Eskiden tarihler telefonun saat dilimine
 * göre hesaplanıyordu: saat dilimi UTC'de kalmış bir telefonda yeni sınav
 * hakkı "20:40" görünüyor, kurul 1 Ocak 00:30'da hâlâ "31 Aralık" yazıyor,
 * gece 00:00–03:00 arası kıdem bir gün eksik çıkıyordu (zorlu senaryo H28,
 * H13, H11, H10).
 *
 * Türkiye 2016'dan beri yıl boyu UTC+3 kullanıyor (yaz saati yok); hesaplar
 * bu sabit farkla yapılır, gösterim Intl'e `timeZone: 'Europe/Istanbul'`
 * verilerek. Saat dilimi verisi olmayan eski bir tarayıcıda da sonuç aynıdır.
 */
export const TZ = 'Europe/Istanbul';
const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86400000;

/** İstanbul saatiyle tarih parçaları. wd: 0 = Pazartesi … 6 = Pazar. */
export function istParts(ms: number = Date.now()) {
  const x = new Date(ms + OFFSET_MS);
  return {
    y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(),
    wd: (x.getUTCDay() + 6) % 7, h: x.getUTCHours(), min: x.getUTCMinutes()
  };
}

/** İstanbul saatiyle y-a-g 00:00 (ay 1–12; taşan değerler takvime göre kayar). */
export function istDate(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) - OFFSET_MS;
}

/**
 * İstanbul günü — "YYYY-AA-GG".
 *
 * `new Date().toISOString().slice(0, 10)` UTC gününü verir: gece
 * 00:00–03:00 arasında bir önceki günü döndürüyordu. Tarih kutuları
 * (<input type="date">) ve "bugünden ileri olamaz" kontrolleri bunu kullanır.
 */
export function localDay(d: Date | number = Date.now()): string {
  const { y, m, d: dd } = istParts(typeof d === 'number' ? d : d.getTime());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(dd)}`;
}

/** "YYYY-AA-GG" → o İstanbul gününün başlangıcı (ms). Geçersizse null. */
export function localDayStart(day: string | undefined | null): number | null {
  const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  if (!m) return null;
  const t = istDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

/** Bu anın İstanbul gününün başlangıcı. */
export function dayStartOf(ms: number = Date.now()): number {
  const { y, m, d } = istParts(ms);
  return istDate(y, m, d);
}

/** Bu anın haftasının Pazartesi 00:00'ı (İstanbul). */
export function mondayOf(ms: number = Date.now()): number {
  return dayStartOf(ms) - istParts(ms).wd * DAY_MS;
}

/** Ayın 1'i 00:00 (İstanbul); delta ay kaydırır (-1: geçen ay). */
export function monthStartOf(ms: number = Date.now(), delta = 0): number {
  const { y, m } = istParts(ms);
  return istDate(y, m + delta, 1);
}

/** Yılın 1 Ocak 00:00'ı (İstanbul); delta yıl kaydırır. */
export function yearStartOf(ms: number = Date.now(), delta = 0): number {
  return istDate(istParts(ms).y + delta, 1, 1);
}

/** Takvim günü farkı (İstanbul): 0 bugün, 1 yarın, -1 dün. */
export function dayDiff(ms: number, now: number = Date.now()): number {
  return Math.round((dayStartOf(ms) - dayStartOf(now)) / DAY_MS);
}
