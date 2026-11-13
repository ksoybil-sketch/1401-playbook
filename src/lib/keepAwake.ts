import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

/**
 * Reçete açıkken ekran kararmasın: barista ölçüye bakarken telefon
 * kilitlenmesin. Sayfadan çıkınca normale döner.
 *
 * Android uygulamasında (APK) Capacitor eklentisi, tarayıcıda Screen Wake
 * Lock API kullanılır. Tarayıcı izin vermezse (eski iOS vb.) sessizce
 * geçilir; ekran her zamanki gibi davranır.
 */
export function useKeepAwake(active = true) {
  useEffect(() => {
    if (!active) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if (Capacitor.isNativePlatform()) { await KeepAwake.keepAwake(); return; }
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (!wl || document.visibilityState !== 'visible') return;
        const l = await wl.request('screen');
        if (cancelled) l.release().catch(() => {}); else lock = l;
      } catch { /* desteklenmiyor ya da izin yok */ }
    };
    // Sekme arka plana gidince tarayıcı kilidi bırakır; geri gelince yeniden iste.
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };

    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (Capacitor.isNativePlatform()) KeepAwake.allowSleep().catch(() => {});
      lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
