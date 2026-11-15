import { useEffect, useRef } from 'react';
import { useBackHandler } from './backButton';

/**
 * Kaydedilmemiş değişiklik koruması.
 *
 * Ders editöründe ya da Yeni ürün formunda uzun bir düzenleme, geri okuna,
 * Android geri tuşuna ya da menüye dokununca uyarısız gidiyordu. Bir ekran
 * useUnsavedGuard(dirty) ile kaydolur; ayrılmadan önce confirmLeave() sorar:
 *  - sekme/pencere kapanırken tarayıcının kendi uyarısı (beforeunload);
 *  - Android geri tuşu;
 *  - tarayıcının geri/ileri düğmesi (web; bkz. lib/webHistory);
 *  - PageTitle'daki geri oku ve panel menüsü (confirmLeave'i çağırırlar).
 * Programla yapılan geçişler (kaydettikten sonra yönlendirme) sorulmaz.
 */
interface Guard { current: boolean; text: string; menu: boolean }
const guards = new Set<Guard>();
export const LEAVE_TEXT = 'Kaydedilmemiş değişiklikler var. Çıkarsan silinecek. Çıkılsın mı?';

/**
 * confirmLeave() "evet" dedikten hemen sonra gelen geri olayı (PageTitle'daki
 * geri oku navigate(-1) yapar) ikinci kez sormasın.
 */
let approvedAt = 0;

/** Kaydedilmemiş bir şey varsa sorar; çıkılabilirse true. */
export function confirmLeave(): boolean {
  for (const g of guards) {
    if (g.current && g.menu) {
      if (!confirm(g.text)) return false;
      approvedAt = Date.now();
      return true;
    }
  }
  return true;
}

/** Web geri/ileri düğmesi için: sorulacak metin (koruma yoksa null). */
export function pendingLeaveText(): string | null {
  if (Date.now() - approvedAt < 1500) return null;
  for (const g of guards) if (g.current) return g.text;
  return null;
}

function useGuardEntry(active: boolean, text: string, menu: boolean) {
  const ref = useRef<Guard>({ current: active, text, menu });
  ref.current.current = active;
  ref.current.text = text;
  useEffect(() => {
    const entry = ref.current;
    guards.add(entry);
    return () => { guards.delete(entry); };
  }, []);
  return ref.current;
}

export function useUnsavedGuard(dirty: boolean) {
  const entry = useGuardEntry(dirty, LEAVE_TEXT, true);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (entry.current) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [entry]);
  // Geri tuşu: vazgeçerse geri tuşu "kullanılmış" sayılır (ekranda kalır).
  useBackHandler(dirty, () => !confirm(LEAVE_TEXT));
}

/**
 * Yalnızca tarayıcının geri/ileri düğmesi için onay (web). Sınav gibi kendi
 * Android geri tuşu ve beforeunload işleyicisi olan ekranlar kullanır.
 */
export function useBrowserBackConfirm(active: boolean, text: string) {
  useGuardEntry(active, text, false);
}

/* ------------------------------------------------------------------ */
/* Sekmeler arası (H14)                                                 */
/* ------------------------------------------------------------------ */

/**
 * Oturum bütün sekmelerde ortak: bir sekmeden çıkış, öteki sekmelerdeki
 * kaydedilmemiş işi uyarısız siliyordu (ör. Rozetler'de değiştirilmiş bir
 * değer). Çıkıştan önce öteki sekmelere BroadcastChannel ile sorulur; içinde
 * kaydedilmemiş değişiklik ya da yazılmış ama gönderilmemiş bir pencere olan
 * sekme "evet" der.
 */
const dirtySheets = new Set<object>();
/** Alt sayfa (Sheet) yazılmış ama gönderilmemiş bir şey taşıyor (bkz. kit.tsx Sheet). */
export function useDirtySheet(active: boolean) {
  const token = useRef({});
  useEffect(() => {
    const t = token.current;
    if (active) dirtySheets.add(t); else dirtySheets.delete(t);
    return () => { dirtySheets.delete(t); };
  }, [active]);
}
const localDirty = () => dirtySheets.size > 0 || [...guards].some((g) => g.current);

const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('campus-unsaved') : null;
const replies = new Map<string, (dirty: boolean) => void>();
if (channel) {
  channel.onmessage = (e: MessageEvent) => {
    const m = e.data as { t?: string; id?: string; dirty?: boolean };
    if (m?.t === 'ask' && m.id) channel.postMessage({ t: 'reply', id: m.id, dirty: localDirty() });
    else if (m?.t === 'reply' && m.id) replies.get(m.id)?.(!!m.dirty);
  };
}

/** Öteki sekmelerden kaçında kaydedilmemiş iş var (ms içinde yanıt verenler). */
export function otherTabsDirty(ms = 400): Promise<number> {
  if (!channel) return Promise.resolve(0);
  const id = Math.random().toString(36).slice(2);
  let n = 0;
  replies.set(id, (d) => { if (d) n++; });
  channel.postMessage({ t: 'ask', id });
  return new Promise((res) => setTimeout(() => { replies.delete(id); res(n); }, ms));
}

export const OTHER_TABS_TEXT = 'Başka bir sekmede kaydedilmemiş değişiklik var. Çıkış yaparsan oturum bütün sekmelerde kapanır ve o değişiklikler silinir. Yine de çıkılsın mı?';
