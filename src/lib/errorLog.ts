import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../api/firebase';
import { useSession } from '../store/session';
import { APP_VERSION, bundleName } from './version';

/**
 * Otomatik hata kaydı (yayın sonrası hata düzeltme süreci).
 *
 * Canlıda bir ekran çökerse ya da bir işlem yakalanmamış bir hatayla
 * biterse kullanıcı çoğu zaman bildirmez; biz de görmeyiz. Burada bu
 * hatalar `hatalar` koleksiyonuna düşer: ne oldu, hangi ekranda, hangi
 * sürümde, kimde. Yalnızca uygulama geliştiricisi okur (firestore.rules).
 *
 * Sınırlar: aynı hata bir oturumda bir kez yazılır, oturum başına en fazla
 * 10 kayıt. Oturum açılmamışsa (eşleştirme ekranı) yazılmaz: kural
 * gereği, böylece dışarıdan kayıt doldurulamaz. Bilinen zararsız uyarılar
 * (ResizeObserver, ağ kesintisi) atlanır.
 *
 * Günlük üst sınır kuralda (güvenlik raporu K-5): belge kimliği
 * `<uid>_<YYYYAAGG>_<0..19>` (gün UTC). Kayıt değiştirilemediği için bir
 * hesap bir günde en fazla 20 kayıt bırakabilir; istemci sınırını atlayan
 * biri de kotayı tüketemez. Hangi sıranın kullanıldığı bu cihazda tutulur;
 * başka cihazda/oturumda dolmuş bir sıraya denk gelinirse sonraki denenir.
 */

const MAX_PER_SESSION = 10;
/** firestore.rules hatalar: kimlik sonundaki sıra 0..19. */
const MAX_PER_DAY = 20;
const seen = new Set<string>();
let written = 0;

/** YYYYAAGG, UTC (kural request.time ile aynı günü hesaplar). */
const utcDay = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
const slotKey = (uid: string, day: string) => `hata-sira:${uid}:${day}`;
function readSlot(uid: string, day: string): number {
  try { return Number(localStorage.getItem(slotKey(uid, day))) || 0; } catch { return 0; }
}
function saveSlot(uid: string, day: string, n: number) {
  try { localStorage.setItem(slotKey(uid, day), String(n)); } catch { /* gizli pencere: yalnız bellekte */ }
}
/** Bellekteki sıra (localStorage yoksa da aynı oturumda ilerler). */
const memSlot = new Map<string, number>();

/**
 * Kaydı sıradaki boş kimliğe yazar. Dolu kimliğe yazım kuralca reddedilir
 * (güncelleme yasak); o zaman bir sonraki sıra denenir, en fazla 3 kez.
 */
async function writeWithSlot(uid: string, data: Record<string, unknown>): Promise<void> {
  const day = utcDay();
  const k = slotKey(uid, day);
  let n = Math.max(readSlot(uid, day), memSlot.get(k) || 0);
  for (let tries = 0; tries < 3 && n < MAX_PER_DAY; tries++, n++) {
    memSlot.set(k, n + 1);
    saveSlot(uid, day, n + 1);
    try {
      await setDoc(doc(db, 'hatalar', `${uid}_${day}_${n}`), data);
      return;
    } catch (e) {
      // Ağ hatasında yazım kuyrukta bekler, yeniden denenmez; yalnız yetki reddinde (dolu sıra) sonraki sıra.
      if ((e as { code?: string })?.code !== 'permission-denied') return;
    }
  }
}

const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch$/i,
  /NetworkError/i,
  /Load failed$/i,
  /client is offline/i,
  /AbortError/i,
  /permission-denied|Missing or insufficient permissions/i // yetki hataları ekranda zaten yazıyor
];

export type ErrorKind = 'cokme' | 'hata';

function device() {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : 'diğer';
  const app = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ? 'uygulama' : 'tarayıcı';
  return `${os} · ${app} · ${window.innerWidth}×${window.innerHeight}`;
}

export function reportError(err: unknown, kind: ErrorKind = 'hata', extra?: string): void {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err)?.slice(0, 300) || 'Bilinmeyen hata');
    const message = (e.message || e.name || 'Hata').slice(0, 500);
    if (IGNORE.some((r) => r.test(message))) return;
    const stack = (e.stack || '').split('\n').slice(0, 12).join('\n').slice(0, 2000);
    const path = location.hash.replace(/^#/, '') || '/';
    const key = `${message}|${stack.split('\n')[1] || ''}`;
    if (seen.has(key) || written >= MAX_PER_SESSION) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    seen.add(key);
    written++;
    const s = useSession.getState().session;
    const who = s.kind === 'staff' ? { name: s.name, role: s.role, store: '' }
      : s.kind === 'barista' ? { name: s.name, role: s.role, store: s.storeName }
        : s.kind === 'store' ? { name: `${s.storeName} telefonu`, role: 'store', store: s.storeName }
          : { name: '', role: '', store: '' };
    writeWithSlot(uid, {
      kind, message, stack, ...(extra ? { extra: extra.slice(0, 1000) } : {}),
      path: path.slice(0, 200), version: String(APP_VERSION).slice(0, 100), bundle: String(bundleName()).slice(0, 100), device: device().slice(0, 120),
      by: uid, byName: (who.name || '').slice(0, 120), role: (who.role || '').slice(0, 30), storeName: (who.store || '').slice(0, 120),
      createdAt: Date.now()
    }).catch(() => { /* kayıt da yazılamadıysa yapacak bir şey yok */ });
  } catch { /* hata kaydı asla uygulamayı düşürmemeli */ }
}

/** main.tsx'te bir kez: pencere düzeyindeki yakalanmamış hatalar. */
export function installErrorLog(): void {
  if (import.meta.env.DEV && import.meta.env.MODE !== 'emulator') return;
  window.addEventListener('error', (ev) => reportError(ev.error || ev.message, 'hata'));
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, 'hata'));
}
