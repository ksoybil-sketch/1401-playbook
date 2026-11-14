import { addDoc, collection } from 'firebase/firestore';
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
 */

const MAX_PER_SESSION = 10;
const seen = new Set<string>();
let written = 0;

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
    addDoc(collection(db, 'hatalar'), {
      kind, message, stack, ...(extra ? { extra: extra.slice(0, 1000) } : {}),
      path: path.slice(0, 200), version: APP_VERSION, bundle: bundleName(), device: device(),
      by: uid, byName: who.name, role: who.role, storeName: who.store,
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
