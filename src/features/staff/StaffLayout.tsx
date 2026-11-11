import React, { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../../store/session';
import { Icon, type IconName } from '../../ui/Icon';
import { Avatar } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { useStaffData } from './staffData';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Genel bakış', icon: 'grid' },
  { to: '/magazalar', label: 'Mağazalar', icon: 'store' },
  { to: '/baristalar', label: 'Baristalar', icon: 'users' },
  { to: '/gorevler', label: 'Görevler', icon: 'flag' },
  { to: '/bulten', label: 'Bülten', icon: 'bell' },
  // Yol adı /icerik kalıyor: değiştirmek panelde kayıtlı bağlantıları ve
  // ders editörüne dönüş adreslerini kırardı. Görünen ad "Akademi".
  { to: '/icerik', label: 'Akademi', icon: 'layers' }
];

export function useStaffSession() {
  const s = useSession((x) => x.session);
  if (s.kind !== 'staff') throw new Error('Yönetici oturumu yok');
  return s;
}

export const StaffLayout: React.FC = () => {
  const s = useStaffSession();
  const logout = useSession((x) => x.logout);
  const subscribe = useStaffData((x) => x.subscribe);
  useEffect(() => subscribe(), [subscribe]);

  return (
    <div className="min-h-[100dvh] md:flex">
      {/* Masaüstü yan menü */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-line bg-bean/60 sticky top-0 h-[100dvh]">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-line">
          <img src="/icons/logo.svg" alt="" className="w-7 h-7 opacity-90" />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">1401 Campus</div>
            <div className="text-[11px] text-fg-3">Kahve Operasyonu</div>
          </div>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 h-10 px-3 rounded-lg text-[14px] font-medium transition-colors ${isActive ? 'bg-panel-3 text-crema' : 'text-fg-2 hover:bg-panel-2 hover:text-crema'}`
              }
            >
              <Icon name={n.icon} size={18} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-line flex items-center gap-2.5">
          <Avatar name={s.name} size={32} />
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[13px] font-medium truncate">{s.name}</div>
            <div className="text-[11px] text-fg-3 truncate">{s.email}</div>
          </div>
          <button onClick={logout} className={t.iconBtn} aria-label="Çıkış" title="Çıkış"><Icon name="logout" size={15} /></button>
        </div>
      </aside>

      {/* Mobil üst bar */}
      <header className="md:hidden sticky top-0 z-40 bg-espresso/85 backdrop-blur-xl border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="h-14 flex items-center gap-3 px-4">
          <img src="/icons/logo.svg" alt="" className="w-7 h-7 opacity-90" />
          <div className="flex-1 leading-tight">
            <div className="text-[14px] font-semibold">Kahve Operasyonu</div>
            <div className="text-[11px] text-fg-3 truncate">{s.name}</div>
          </div>
          <button onClick={logout} className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`}><Icon name="logout" size={14} /> Çıkış</button>
        </div>
      </header>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>

      {/* Mobil alt menü */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bean/92 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch px-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-1 h-14 ${isActive ? 'text-crema' : 'text-fg-3'}`}>
              {({ isActive }) => (
                <>
                  <Icon name={n.icon} size={20} strokeWidth={isActive ? 1.9 : 1.5} />
                  <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{n.label.split(' ')[0]}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};
