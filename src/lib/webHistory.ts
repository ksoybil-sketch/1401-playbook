import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { IS_ANDROID_APP, backFloorIdx, popBypass } from './backButton';
import { pendingLeaveText } from './unsaved';

/**
 * Tarayıcının geri/ileri düğmesi (yalnızca web; APK'da Android geri tuşu
 * lib/backButton'da).
 *
 *  1. Açık pencere (Sheet): pencere açılınca geçmişe aynı adresle bir kayıt
 *     eklenir. Geri düğmesi önce pencereyi kapatır, sayfa yerinde kalır
 *     (eskiden sayfa kapanıyor, pencerede yazılan uyarısız gidiyordu).
 *     Pencere başka yoldan (X, Esc, Kaydet) kapanınca o kayıt geri alınır.
 *  2. Çıkış tabanı: çıkıştan sonra geri düğmesi önceki kişinin adreslerine
 *     gitmez, taban kayda geri itilir (sıra damgası: campusSeq).
 *  3. Kaydedilmemiş değişiklik (lib/unsaved): geri/ileri önce sorar; vazgeçilirse
 *     adres eski yerine döner, ekran hiç değişmez.
 *
 * Olay react-router'dan önce yakalanır (capture + router'dan önce kurulum) ve
 * gerekirse router'a hiç ulaştırılmaz.
 */
const ON = !IS_ANDROID_APP && typeof window !== 'undefined';
const DEPTH = 'campusSheet';
/**
 * Her geçmiş kaydına artan bir sıra damgası (sekme boyunca, yenilemede de
 * sürer). Router'ın idx'i adres çubuğundan ya da bağlantıyla açılan
 * kayıtlarda yok; çıkış tabanı ve geri/ileri yönü bununla bulunur.
 */
const SEQ = 'campusSeq';
const SEQ_KEY = 'campusSeqNext';
let seqMem = 0;
function nextSeq(): number {
  let n = seqMem;
  try { n = Math.max(n, Number(sessionStorage.getItem(SEQ_KEY)) || 0); } catch { /* yok say */ }
  seqMem = n + 1;
  try { sessionStorage.setItem(SEQ_KEY, String(seqMem)); } catch { /* yok say */ }
  return seqMem;
}

interface SheetEntry { close: () => void }
const sheets: SheetEntry[] = [];

/** Router'ın şu an gösterdiği adres ve geçmiş sırası. */
let shownHash = '';
let shownSeq: number | null = null;

/** Kendi history.go çağrılarımızın üreteceği popstate sayısı (yok sayılır). */
let ignore = 0;
let ignoreTimer: ReturnType<typeof setTimeout> | undefined;
let syncTimer: ReturnType<typeof setTimeout> | undefined;

const state = () => ((window.history.state as Record<string, unknown> | null) || {});
const depthOf = () => { const d = state()[DEPTH]; return typeof d === 'number' ? d : 0; };
const seqOf = () => { const i = state()[SEQ]; return typeof i === 'number' ? i : null; };
/** Damgasız kayda damga basar (router'ın kaydı ya da adres çubuğundan açılan). */
function stamp() {
  if (seqOf() === null) window.history.replaceState({ ...state(), [SEQ]: nextSeq() }, '');
}

function go(delta: number) {
  if (!delta) return;
  ignore++;
  clearTimeout(ignoreTimer);
  // go() bir olay üretmezse (geçmişin ucu) sayaç takılı kalmasın.
  ignoreTimer = setTimeout(() => { ignore = 0; scheduleSync(); }, 1500);
  window.history.go(delta);
}

/** Geçmişteki pencere kayıtlarını açık pencere sayısına eşitler. */
function sync() {
  syncTimer = undefined;
  if (ignore) return;
  const want = sheets.length;
  const cur = depthOf();
  if (cur > want) { go(want - cur); return; }
  for (let d = cur + 1; d <= want; d++) window.history.pushState({ ...state(), [DEPTH]: d }, '');
}

function scheduleSync() {
  if (!syncTimer) syncTimer = setTimeout(sync, 0);
}

function onPop(e: PopStateEvent) {
  if (popBypass.on) return;
  if (ignore > 0) {
    ignore--;
    e.stopImmediatePropagation();
    // Geri alınan kaydın adresi router'ın gösterdiğinden farklıysa (pencere
    // adres parametresiyle açılmıştı) adresi ekrandakiyle eşitle.
    if (location.hash !== shownHash && shownHash) window.history.replaceState(window.history.state, '', shownHash);
    if (!ignore) { clearTimeout(ignoreTimer); scheduleSync(); }
    return;
  }
  const depth = depthOf();
  if (sheets.length > depth) {
    // Geri: üstteki pencere(ler) kapanır. Adres aynıysa sayfa hiç değişmez.
    if (location.hash === shownHash) e.stopImmediatePropagation();
    sheets.slice(depth).reverse().forEach((s) => s.close());
    scheduleSync();
    return;
  }
  if (depth > sheets.length) {
    // Kapanmış pencerenin kaydı (ileri düğmesi ya da artık kayıt): atlanır.
    scheduleSync();
    if (location.hash === shownHash) { e.stopImmediatePropagation(); return; }
  }
  if (location.hash === shownHash) return;
  const seq = seqOf();
  const floor = backFloorIdx();
  if (floor !== null && (seq === null || seq < floor)) {
    // Çıkıştan önceki kayıt: bir ileri itilir; taban kayda varana kadar tekrarlar
    // (her adımda router'a ulaşmaz, ekran değişmez).
    e.stopImmediatePropagation();
    window.history.go(1);
    return;
  }
  const text = pendingLeaveText();
  if (text) {
    e.stopImmediatePropagation();
    if (confirm(text)) {
      popBypass.on = true;
      try { window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state })); } finally { popBypass.on = false; }
    } else {
      // Vazgeçti: adres eski yerine (çoğunlukla bir ileri).
      const back = seq === null || shownSeq === null || seq < shownSeq;
      go(back ? 1 : -1);
    }
  }
}

let installed = false;
/** main.tsx'te router'dan önce çağrılır (dinleyici sırası önemli). */
export function installWebHistory() {
  if (!ON || installed) return;
  installed = true;
  shownHash = location.hash;
  window.addEventListener('popstate', onPop, true);
  // Router adresi değiştirirken (replace) pencere kaydının işareti silinmesin:
  // kurul ekranında pencere ?magaza= ile açılıyor, içinden talep açılınca
  // adres replace ile değişiyor.
  const replace = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    const cur = state();
    if (data && typeof data === 'object') {
      const o = data as Record<string, unknown>;
      if (typeof cur[DEPTH] === 'number' && !(DEPTH in o)) data = { ...o, [DEPTH]: cur[DEPTH] };
      if (typeof cur[SEQ] === 'number' && !(SEQ in o)) data = { ...(data as object), [SEQ]: cur[SEQ] };
    }
    replace(data, unused, url);
  };
  stamp();
  shownSeq = seqOf();
}

/** App'te bir kez: router'ın gösterdiği adresi izler. */
export function useWebHistoryTracker() {
  const loc = useLocation();
  useLayoutEffect(() => {
    if (!ON) return;
    stamp();
    shownHash = location.hash;
    shownSeq = seqOf();
  }, [loc.key, loc.pathname, loc.search]);
}

/** Sheet açıkken çağrılır; dönen işlev pencere kapanınca çağrılır. */
export function registerSheet(close: () => void): () => void {
  if (!ON) return () => {};
  const entry: SheetEntry = { close };
  sheets.push(entry);
  scheduleSync();
  return () => {
    const i = sheets.indexOf(entry);
    if (i >= 0) sheets.splice(i, 1);
    scheduleSync();
  };
}
