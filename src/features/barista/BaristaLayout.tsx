import React, { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../../store/session';
import { Icon, type IconName } from '../../ui/Icon';
import { Avatar } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { useBaristaSession } from './useBaristaData';

/** Ortak telefonda unutulan oturum başkası adına sınav çözülmesine yol açmasın. */
const IDLE_LOGOUT_MS = 10 * 60 * 1000;

function useIdleLogout() {
  const logout = useSession((s) => s.logout);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => logout(), IDLE_LOGOUT_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [logout]);
}

export const BaristaLayout: React.FC = () => {
  const s = useBaristaSession();
  const logout = useSession((x) => x.logout);
  const { pathname } = useLocation();
  useIdleLogout();

  // Ders ve sınav ekranları odaklı çalışır: alt menü gizlenir.
  const focused = pathname.startsWith('/ders/') || pathname.startsWith('/sinav/');

  // Reçeteler, Akademi'den ayrı bir sekme: servis sırasında aranan şey
  // müfredatın neresinde durduğu değil, içeceğin kendisi.
  const nav: { to: string; label: string; icon: IconName }[] = [
    { to: '/', label: 'Bugün', icon: 'home' },
    { to: '/receteler', label: 'Reçeteler', icon: 'coffee' },
    { to: '/akademi', label: 'Akademi', icon: 'cap' },
    { to: '/sonuclarim', label: 'Sonuçlarım', icon: 'award' },
    ...(s.role === 'lead' ? [{ to: '/ekip', label: 'Ekibim', icon: 'users' as IconName }] : [])
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-40 bg-espresso/85 backdrop-blur-xl border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="h-14 flex items-center gap-3 px-4 max-w-[560px] mx-auto">
          <Avatar name={s.name} size={32} />
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[14px] font-semibold truncate">{s.name}</div>
            <div className="text-[11px] text-fg-3 truncate">{s.storeName}{s.role === 'lead' ? ' · Mağaza sorumlusu' : ''}</div>
          </div>
          <button onClick={logout} className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`}>
            <Icon name="logout" size={14} /> Çıkış
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {!focused && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-bean/92 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-stretch max-w-[560px] mx-auto px-2">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center justify-center gap-1 h-14 transition-colors ${isActive ? 'text-crema' : 'text-fg-3'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon name={n.icon} size={21} strokeWidth={isActive ? 1.9 : 1.5} />
                    <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{n.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
};
