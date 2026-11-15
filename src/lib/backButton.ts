import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * Android geri tuşu (yalnızca APK'da).
 *
 * Sırayla:
 *  1. Açık bir alt sayfa (Sheet) ya da büyütülmüş görsel varsa önce o kapanır.
 *  2. Sınav çözülürken çıkmadan önce onay istenir.
 *  3. Kök ekranda (ana ekran, barista seçimi, eşleştirme) uygulama kapanmaz,
 *     arka plana alınır — mağaza telefonunda uygulamayı yeniden açmak
 *     açılış süresi demekti.
 *  4. Diğer ekranlarda bir önceki ekrana dönülür.
 *
 * Çıkış yapınca geçmiş sıfırlanır (resetBackHistory): baristanın geri
 * tuşuyla bir önceki baristanın ekranlarına dönmesi olmaz.
 *
 * Ekranlar useBackHandler ile kendi işleyicilerini ekler; en son eklenen
 * önce sorulur. İşleyici true dönerse geri tuşu "kullanılmış" sayılır.
 */
type Handler = () => boolean;
const stack: { h: { current: Handler } }[] = [];

export const IS_NATIVE_APP = Capacitor.isNativePlatform();
export const IS_ANDROID_APP = IS_NATIVE_APP && Capacitor.getPlatform() === 'android';

/**
 * Çıkışta o anki geçmiş kaydı "taban" diye işaretlenir; geri tuşu bu
 * kayıttan geriye (önceki kişinin ekranlarına) gitmez. Sıra numarasına
 * (history.state.idx) dayanmıyor: adres react-router dışından
 * değiştiğinde o numara boş kalıyordu.
 */
const FLOOR = 'campusFloor';
const onFloor = () => !!(window.history.state as Record<string, unknown> | null)?.[FLOOR];

const currentPath = () => (location.hash.replace(/^#/, '').split('?')[0] || '/');
const isRoot = () => currentPath() === '/' || onFloor();

export function useBackHandler(active: boolean, handler: Handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active || !IS_ANDROID_APP) return;
    const entry = { h: ref };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/**
 * Web'de taban kaydın sıra damgası (history.state.campusSeq, bkz. lib/webHistory). Tarayıcının geri düğmesi bu
 * sıradan geriye gidince ileri itilir (bkz. lib/webHistory): çıkıştan sonra
 * geri düğmesi önceki kişinin adresine dönüyor, o adres bir sonraki girişe
 * taşınıyordu. Sekme yenilenince de bilinsin diye sessionStorage'da tutulur.
 */
const FLOOR_KEY = 'campusFloorIdx';
let floorIdx: number | null = null;
export function backFloorIdx(): number | null {
  if (floorIdx !== null) return floorIdx;
  try { const v = sessionStorage.getItem(FLOOR_KEY); floorIdx = v === null ? null : Number(v); } catch { /* yok say */ }
  return Number.isFinite(floorIdx) ? floorIdx : null;
}

/** Kendi gönderdiğimiz popstate olayı: web geçmiş bekçisi karışmasın. */
export const popBypass = { on: false };

/** Çıkışta çağrılır: adres köke döner, önceki ekranlara geri tuşuyla dönülmez. */
export function resetBackHistory() {
  try {
    const state = { ...((window.history.state as Record<string, unknown> | null) || {}), [FLOOR]: true };
    window.history.replaceState(state, '', '#/');
    // Sıra damgası (web): router'ın idx'i adres çubuğundan açılan kayıtlarda yok.
    const idx = (state as Record<string, unknown>).campusSeq;
    if (typeof idx === 'number') {
      floorIdx = idx;
      try { sessionStorage.setItem(FLOOR_KEY, String(idx)); } catch { /* yok say */ }
    }
    popBypass.on = true;
    try { window.dispatchEvent(new PopStateEvent('popstate', { state })); } finally { popBypass.on = false; }
  } catch { /* yok say */ }
}

let installed = false;
export function installBackButton() {
  if (!IS_ANDROID_APP || installed) return;
  installed = true;
  App.addListener('backButton', ({ canGoBack }) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].h.current()) return;
    }
    if (!canGoBack || isRoot()) {
      App.minimizeApp().catch(() => {});
      return;
    }
    window.history.back();
  }).catch(() => {});
}
