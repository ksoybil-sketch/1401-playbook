import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../store/session';
import { clearIdleDeadline, setIdleDeadline } from './idleClock';
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
 * - Süre cihaza da yazılır (lib/idleClock): uygulama arka plana alınıp
 *   zamanlayıcı donsa ya da sayfa bellekten atılıp yeniden kurulsa da süre
 *   işlemiş sayılır. Uygulama öne geldiği an bakılır; sayfa yeniden
 *   kuruluyorsa oturum hiç açılmaz (store/session.ts).
 *
 * enabled false ise çalışmaz (ör. yöneticinin kendi telefonu/bilgisayarı).
 */
const WARN_MS = 30_000;

export function useIdleLogout(ms: number, enabled = true): { warnLeft: number | null; stay: () => void } {
  const logout = useSession((s) => s.logout);
  const deadline = useRef(0);
  const [warnLeft, setWarnLeft] = useState<number | null>(null);
  const reset = useRef(() => {});
  reset.current = () => { deadline.current = Date.now() + ms; setIdleDeadline(deadline.current); setWarnLeft(null); };

  useEffect(() => {
    if (!enabled) { clearIdleDeadline(); setWarnLeft(null); return; }
    const onActivity = () => reset.current();
    const watching = () =>
      [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended) ||
      document.activeElement?.tagName === 'IFRAME';
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    reset.current();
    /** Süre doldu mu: dolduysa oturumu kapatır ve false döner. */
    const check = () => {
      if (watching()) { reset.current(); return true; }
      const left = deadline.current - Date.now();
      if (left <= 0) { clearIdleDeadline(); logout(); return false; }
      setWarnLeft(left <= WARN_MS ? Math.ceil(left / 1000) : null);
      return true;
    };
    const tick = setInterval(() => { if (!check()) clearInterval(tick); }, 1000);
    // Uygulama öne geldiği an bakılır: arka planda zamanlayıcı dondurulmuş
    // olabilir, bir sonraki saniyeyi beklemeden karar verilir.
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
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
