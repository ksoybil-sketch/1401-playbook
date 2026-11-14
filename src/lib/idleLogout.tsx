import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../store/session';
import * as t from '../ui/tokens';

/**
 * Hareketsiz kalan oturumu kapatır. Ortak cihazda (mağaza telefonu)
 * unutulan oturum başkasına açık kalmasın: barista ekranında başkası adına
 * sınav, yönetici ekranında PIN sıfırlama, barista pasifleştirme…
 *
 * - Kapanmadan WARN_MS önce "Hâlâ burada mısın?" şeridi çıkar; dokununca süre baştan.
 * - Video oynarken (ya da YouTube penceresine dokunulmuşken) süre işlemez:
 *   10 dakikayı aşan bir videoda barista uyarısız oturumdan düşüyordu.
 *   YouTube kendi çerçevesinde oynadığı için dokunuşlar sayfaya ulaşmaz;
 *   odak çerçevedeyse izleniyor kabul edilir.
 *
 * enabled false ise çalışmaz (ör. yöneticinin kendi telefonu/bilgisayarı).
 */
const WARN_MS = 30_000;

export function useIdleLogout(ms: number, enabled = true): { warnLeft: number | null; stay: () => void } {
  const logout = useSession((s) => s.logout);
  const deadline = useRef(0);
  const [warnLeft, setWarnLeft] = useState<number | null>(null);
  const reset = useRef(() => {});
  reset.current = () => { deadline.current = Date.now() + ms; setWarnLeft(null); };

  useEffect(() => {
    if (!enabled) { setWarnLeft(null); return; }
    const onActivity = () => reset.current();
    const watching = () =>
      [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended) ||
      document.activeElement?.tagName === 'IFRAME';
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    reset.current();
    const tick = setInterval(() => {
      if (watching()) { reset.current(); return; }
      const left = deadline.current - Date.now();
      if (left <= 0) { clearInterval(tick); logout(); return; }
      setWarnLeft(left <= WARN_MS ? Math.ceil(left / 1000) : null);
    }, 1000);
    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [logout, ms, enabled]);

  return { warnLeft, stay: () => reset.current() };
}

/** "Hâlâ burada mısın?" şeridi; useIdleLogout'un sonucuyla çizilir. */
export const IdleWarning: React.FC<{ left: number | null; onStay: () => void }> = ({ left, onStay }) =>
  left === null ? null : (
    <div className="fixed inset-x-0 bottom-20 z-[150] px-4 pointer-events-none" role="alert">
      <div className={`${t.card} max-w-[520px] mx-auto p-3 flex items-center gap-3 pointer-events-auto shadow-[0_8px_32px_rgba(0,0,0,0.6)]`}>
        <span className="flex-1 text-[13px] leading-snug">Hâlâ burada mısın? Oturum <b className="tnum">{left} sn</b> sonra kapanacak.</span>
        <button onClick={onStay} className={`${t.btn} ${t.btnPrimary} ${t.btnSm}`}>Devam et</button>
      </div>
    </div>
  );
