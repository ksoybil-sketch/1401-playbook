/**
 * Çevrimdışı barista girişi (zorlu senaryo H17, 15.11.2026 kullanıcı kararı).
 *
 * Mağazada Wi-Fi gidince kimse giriş yapamıyordu: Firebase Auth hesap
 * değiştirmek için sunucuya ulaşmak zorunda. Artık bu telefonda daha önce
 * internetle giriş yapmış barista, bağlantı yokken PIN'iyle SALT OKUNUR
 * girebilir (dersler, reçeteler, kendi ilerlemesi — cihazdaki önbellekten).
 * Oturum mağaza hesabında kalır; sınav, ders tamamlama, talep ve diğer
 * yazma işleri kapalıdır. Bağlantı gelince uygulama aynı PIN'le (yalnızca
 * bellekte tutulur) gerçek girişe geçer.
 *
 * Güvenlik:
 *  - Saklanan PIN değil, tuzlu PBKDF2-SHA256 özetidir (150.000 tur). Tuz her
 *    giriş için rastgele; anahtar malzemesine telefonun kendi eşleştirme
 *    şifresi de katılır (özet başka telefonda ya da yeniden eşleşmeden sonra
 *    işe yaramaz).
 *  - Yalnızca bu cihazda (localStorage), yalnızca eşleşmiş mağaza telefonunda,
 *    yalnızca o mağazanın baristaları için tutulur; 30 gün internetle giriş
 *    yapılmazsa silinir. PIN sıfırlanınca (hesap e-postası değişir) ya da
 *    barista listeden çıkınca, bağlantı varken silinir.
 *  - Art arda 5 yanlış PIN o barista için çevrimdışı girişi 5 dakika kilitler
 *    (sonra her yanlışta süre ikiye katlanır).
 *  - Çevrimdışı oturum hiçbir sunucu yetkisi vermez: kurallar mağaza
 *    hesabıyla değerlendirilir (barista adına hiçbir şey yazılamaz).
 */
import type { Barista } from '../../shared/types';

const KEY = 'playbook.offlinePin.v1';
const LOCK_KEY = 'playbook.offlinePinLock.v1';
const ITER = 150_000;
const MAX_AGE_MS = 30 * 86400000;

interface Entry { s: string; h: string; e: string; st: string; at: number }
type Store = Record<string, Entry>;

function ls(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
function read<T>(key: string): T {
  try { return JSON.parse(ls()?.getItem(key) || '{}') as T; } catch { return {} as T; }
}
function write(key: string, v: unknown) {
  try { ls()?.setItem(key, JSON.stringify(v)); } catch { /* dolu / kapalı: çevrimdışı giriş olmaz */ }
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function digest(pin: string, salt: Uint8Array, pepper: string, baristaId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(`${baristaId}:${pin}:${pepper}`), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITER }, key, 256);
  return b64(new Uint8Array(bits));
}

const usable = () => typeof crypto !== 'undefined' && !!crypto.subtle && !!ls();

/** Başarılı (internetli) girişten sonra: bu baristanın PIN özetini bu telefona yaz. */
export async function rememberPin(b: Pick<Barista, 'id' | 'authEmail' | 'storeId'>, pin: string, pepper: string): Promise<void> {
  if (!usable()) return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await digest(pin, salt, pepper, b.id);
  const all = read<Store>(KEY);
  all[b.id] = { s: b64(salt), h, e: b.authEmail, st: b.storeId, at: Date.now() };
  write(KEY, all);
  const locks = read<Record<string, unknown>>(LOCK_KEY);
  if (locks[b.id]) { delete locks[b.id]; write(LOCK_KEY, locks); }
}

/** Bu barista için bu telefonda çevrimdışı giriş var mı. */
export function hasOfflinePin(b: Pick<Barista, 'id' | 'authEmail' | 'storeId'>): boolean {
  const e = read<Store>(KEY)[b.id];
  return !!e && e.e === b.authEmail && e.st === b.storeId && Date.now() - e.at < MAX_AGE_MS;
}

export type OfflineCheck = 'ok' | 'wrong' | 'none' | { lockedUntil: number };

/** PIN'i yerel özetle doğrular. */
export async function verifyOfflinePin(b: Pick<Barista, 'id' | 'authEmail' | 'storeId'>, pin: string, pepper: string): Promise<OfflineCheck> {
  if (!usable() || !hasOfflinePin(b)) return 'none';
  const locks = read<Record<string, { n: number; until: number }>>(LOCK_KEY);
  const lock = locks[b.id];
  if (lock && lock.until > Date.now()) return { lockedUntil: lock.until };
  const e = read<Store>(KEY)[b.id];
  const h = await digest(pin, unb64(e.s), pepper, b.id);
  if (h === e.h) {
    if (lock) { delete locks[b.id]; write(LOCK_KEY, locks); }
    return 'ok';
  }
  const n = (lock?.n || 0) + 1;
  locks[b.id] = { n, until: n >= 5 ? Date.now() + 5 * 60_000 * 2 ** (n - 5) : 0 };
  write(LOCK_KEY, locks);
  return n >= 5 ? { lockedUntil: locks[b.id].until } : 'wrong';
}

/**
 * Bağlantı varken mağazanın güncel barista listesiyle temizlik: listede
 * olmayan (pasif, başka mağaza), PIN'i sıfırlanmış (hesap e-postası değişmiş)
 * ya da 30 günü geçmiş kayıtlar silinir.
 */
export function pruneOfflinePins(storeId: string, active: Pick<Barista, 'id' | 'authEmail'>[]) {
  const all = read<Store>(KEY);
  let changed = false;
  for (const [id, e] of Object.entries(all)) {
    const b = active.find((x) => x.id === id);
    const stale = Date.now() - e.at > MAX_AGE_MS;
    if (stale || (e.st === storeId && (!b || b.authEmail !== e.e)) || (e.st !== storeId)) { delete all[id]; changed = true; }
  }
  if (changed) write(KEY, all);
}

/** Bütün çevrimdışı giriş kayıtlarını siler (eşleşme kaldırılınca). */
export function clearOfflinePins() {
  try { ls()?.removeItem(KEY); ls()?.removeItem(LOCK_KEY); } catch { /* yok say */ }
}
