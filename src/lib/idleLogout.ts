import { useEffect, useRef } from 'react';
import { useSession } from '../store/session';

/**
 * Hareketsiz kalan oturumu kapatır. Ortak cihazda (mağaza telefonu)
 * unutulan oturum başkasına açık kalmasın: barista ekranında başkası adına
 * sınav, yönetici ekranında PIN sıfırlama, barista pasifleştirme…
 *
 * enabled false ise çalışmaz (ör. yöneticinin kendi telefonu/bilgisayarı).
 */
export function useIdleLogout(ms: number, enabled = true) {
  const logout = useSession((s) => s.logout);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!enabled) return;
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => logout(), ms);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [logout, ms, enabled]);
}
