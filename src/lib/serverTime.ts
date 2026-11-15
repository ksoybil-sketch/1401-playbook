/**
 * Sunucu saati (zorlu senaryo H1, H2).
 *
 * Sınavın başlangıcı, son teslimi ve teslim anı; telefon eşleştirme ve davet
 * kodlarının ömrü eskiden cihazın saatinden yazılıyordu. Saati 2 gün ileri
 * telefonda sınav 48 saat açık kalıyor, 3 saat geri telefonda doğduğu anda
 * "süre doldu" sayılıyor, saat geri alınınca süresi geçmiş sınav "geçti"
 * diye teslim edilebiliyordu. Artık kurallar bu zamanları `request.time` ile
 * denetler (firestore.rules attempts, pairingCodes, invites); istemci de
 * yazdığı ve gösterdiği zamanı sunucu saatine göre düzeltir.
 *
 * Ölçüm: kendi clock/{uid} belgesine bir işlem (transaction) içinde
 * serverTimestamp() yazılıp sunucudan geri okunur (1 yazım + 2 okuma).
 * İşlem çevrimdışıyken kuyruğa girmez, hata verir (bekleyen yazım
 * bırakmaz). Bir oturumda bir kez, sonra 30 dakikada bir ya da saatin
 * değiştiği fark edilince yeniden ölçülür.
 *
 * Saat değişimi: duvar saati (Date.now) ile tekdüze saat (performance.now)
 * arasındaki fark ölçümden bu yana 1 dakikadan çok değiştiyse (saat elle
 * değiştirildi ya da cihaz uyudu) tekdüze saat kullanılır ve yeniden ölçülür.
 */
import { doc, getDocFromServer, runTransaction, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { auth, db } from '../api/firebase';

interface Base { server: number; wall: number; mono: number }
let base: Base | null = null;
let stale = false;
let inflight: Promise<void> | null = null;
const REFRESH_MS = 30 * 60_000;
const JUMP_MS = 60_000;
const mono = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Şu anki sunucu saati tahmini (ms). Ölçüm yoksa cihaz saati. */
export function serverNow(): number {
  if (!base) return Date.now();
  const byWall = Date.now() + (base.server - base.wall);
  const byMono = base.server + (mono() - base.mono);
  if (Math.abs(byWall - byMono) > JUMP_MS) {
    stale = true;
    return Math.round(byMono);
  }
  return Math.round(byWall);
}

/** Cihaz saati sunucudan ne kadar farklı (ms; + ileri). Ölçülmediyse null. */
export function clockSkew(): number | null {
  return base ? Date.now() - serverNow() : null;
}

/**
 * Sunucu saatini ölçer (oturum açıkken). force: süresi dolmamış olsa da.
 * Hata ya da zaman aşımında sessizce vazgeçer; serverNow cihaz saatine düşer.
 */
export function syncServerClock(force = false, maxAgeMs = REFRESH_MS): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return Promise.resolve();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
  if (!force && base && !stale && mono() - base.mono < maxAgeMs) return Promise.resolve();
  if (inflight) return inflight;
  const run = (async () => {
    const ref = doc(db, 'clock', uid);
    const t0 = mono();
    const w0 = Date.now();
    await runTransaction(db, async (tx) => {
      await tx.get(ref);
      tx.set(ref, { at: serverTimestamp() });
    });
    const t1 = mono();
    const snap = await getDocFromServer(ref);
    const at = (snap.get('at') as Timestamp | null)?.toMillis?.();
    if (!at || auth.currentUser?.uid !== uid) return;
    // Sunucu zamanı yazımın gidiş-dönüşünün ortasında atandı sayılır.
    const mid = (t0 + t1) / 2;
    base = { server: at, mono: mid, wall: w0 + (mid - t0) };
    stale = false;
  })().catch(() => { /* ağ, yetki: cihaz saati kullanılır */ });
  inflight = Promise.race([run, new Promise<void>((res) => setTimeout(res, 6000))])
    .finally(() => { inflight = null; });
  return inflight;
}
