import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../../store/session';
import { Icon, type IconName } from '../../ui/Icon';
import { Avatar, Sheet } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { can, STAFF_ROLE_LABEL } from '../../lib/roles';
import { useStaffData } from './staffData';
import { ThemePicker, useStaffTheme } from './theme';
import { ACTIVITY_LOG } from '../../demo/log';

interface NavItem { to: string; label: string; short?: string; icon: IconName; badge?: number; primary?: boolean }

type StaffSession = Extract<ReturnType<typeof useSession.getState>['session'], { kind: 'staff' }>;
let lastStaff: StaffSession | null = null;

/**
 * Çıkış sırasında oturum "loading"e geçerken panelin açık bileşenleri bir
 * kez daha çizilebiliyor (App onları kaldırmadan önce). O an hata atmak
 * ekranı çökertiyordu; son bilinen oturumla çizilip sessizce kaldırılır.
 */
export function useStaffSession(): StaffSession {
  const s = useSession((x) => x.session);
  if (s.kind === 'staff') { lastStaff = s; return s; }
  if (lastStaff) return lastStaff;
  throw new Error('Yönetici oturumu yok');
}

export const StaffLayout: React.FC = () => {
  const s = useStaffSession();
  const logout = useSession((x) => x.logout);
  const subscribe = useStaffData((x) => x.subscribe);
  const proposals = useStaffData((x) => x.proposals);
  const requests = useStaffData((x) => x.requests);
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  useStaffTheme();
  useEffect(() => subscribe(), [subscribe]);
  useEffect(() => { setMore(false); window.scrollTo(0, 0); }, [pathname]);

  const approver = can(s.role, 'approve');
  const pendingCount = approver
    ? proposals.filter((p) => p.status === 'pending').length
    : proposals.filter((p) => p.createdBy === s.uid && p.status === 'rejected' && (p.reviewedAt || 0) > Date.now() - 7 * 86400000).length;
  // Yanıt bekleyen talepler: mağaza yazdı, operasyon henüz dönmedi.
  const openRequests = requests.filter((r) => r.status !== 'done' && r.status !== 'rejected' && r.lastSide === 'store').length;

  const NAV: NavItem[] = [
    { to: '/', label: 'Genel bakış', short: 'Genel', icon: 'grid', primary: true },
    { to: '/talepler', label: 'Talepler', icon: 'wrench', badge: openRequests, primary: true },
    { to: '/onaylar', label: approver ? 'Bekleyen onaylar' : 'Önerilerim', short: approver ? 'Onaylar' : 'Öneriler', icon: 'stamp', badge: pendingCount, primary: true },
    { to: '/baristalar', label: 'Baristalar', icon: 'users', primary: true },
    { to: '/magazalar', label: 'Mağazalar', icon: 'store' },
    { to: '/gorevler', label: 'Görevler', icon: 'flag' },
    { to: '/bulten', label: 'Bülten', icon: 'bell' },
    { to: '/rozetler', label: 'Rozetler', icon: 'medal' },
    // Yol adı /icerik kalıyor: değiştirmek panelde kayıtlı bağlantıları ve
    // ders editörüne dönüş adreslerini kırardı. Görünen ad "Akademi".
    { to: '/icerik', label: 'Akademi', icon: 'layers' },
    // Demo ve emülatör paketinde: demoyu deneyenlerin izi (yalnızca geliştirici).
    ...(ACTIVITY_LOG && can(s.role, 'manageAi') ? [{ to: '/demo-kaydi', label: 'Demo kaydı', icon: 'info' as IconName }] : [])
  ];
  const primary = NAV.filter((n) => n.primary);
  const rest = NAV.filter((n) => !n.primary);
  const restBadge = rest.reduce((x, n) => x + (n.badge || 0), 0);

  const Badge: React.FC<{ n?: number; dot?: boolean }> = ({ n, dot }) =>
    n ? (
      <span className={`${dot ? 'absolute -top-1 -right-2' : 'ml-auto'} min-w-4 h-4 px-1 rounded-full bg-crema text-espresso text-[10px] font-bold flex items-center justify-center tnum`}>
        {n > 9 ? '9+' : n}
      </span>
    ) : null;

  return (
    <div className="min-h-[100dvh] md:flex bg-espresso">
      {/* Masaüstü yan menü */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-line bg-bean/60 sticky top-0 h-[100dvh]">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-line">
          <img src="/icons/logo.svg" alt="" className="w-7 h-7 opacity-90 logo-mark" />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">1401 Campus</div>
            <div className="text-[11px] text-fg-3">Kahve Operasyonu</div>
          </div>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
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
              <Badge n={n.badge} />
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-2"><ThemePicker compact /></div>
        <div className="p-3 border-t border-line flex items-center gap-2.5">
          <Avatar name={s.name} size={32} />
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[13px] font-medium truncate">{s.name}</div>
            <div className="text-[11px] text-fg-3 truncate">{STAFF_ROLE_LABEL[s.role]}</div>
          </div>
          <button onClick={logout} className={t.iconBtn} aria-label="Çıkış" title="Çıkış"><Icon name="logout" size={15} /></button>
        </div>
      </aside>

      {/* Mobil üst bar */}
      <header className="md:hidden sticky top-0 z-40 bg-espresso/85 backdrop-blur-xl border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="h-14 flex items-center gap-3 px-4">
          <img src="/icons/logo.svg" alt="" className="w-7 h-7 opacity-90 logo-mark" />
          <div className="flex-1 leading-tight min-w-0">
            <div className="text-[14px] font-semibold">Kahve Operasyonu</div>
            <div className="text-[11px] text-fg-3 truncate">{s.name} · {STAFF_ROLE_LABEL[s.role]}</div>
          </div>
          <button onClick={logout} className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`}><Icon name="logout" size={14} /> Çıkış</button>
        </div>
      </header>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>

      {/* Mobil alt menü: dört ana sekme + "Diğer". Sekiz sekme 375px'e sığmıyor. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bean/92 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch px-1">
          {primary.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-1 h-14 ${isActive ? 'text-crema' : 'text-fg-3'}`}>
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <Icon name={n.icon} size={20} strokeWidth={isActive ? 1.9 : 1.5} />
                    <Badge n={n.badge} dot />
                  </span>
                  <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{n.short || n.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 h-14 ${rest.some((n) => pathname.startsWith(n.to)) ? 'text-crema' : 'text-fg-3'}`}>
            <span className="relative"><Icon name="list" size={20} /><Badge n={restBadge} dot /></span>
            <span className="text-[10px] font-medium">Diğer</span>
          </button>
        </div>
      </nav>

      <Sheet open={more} title="Menü" onClose={() => setMore(false)}>
        <div className={t.listGroup}>
          {rest.map((n) => (
            <NavLink key={n.to} to={n.to} className={t.listRow}>
              <span className={t.iconChip('neutral')}><Icon name={n.icon} size={16} /></span>
              <span className="text-[14px] font-medium flex-1">{n.label}</span>
              <Badge n={n.badge} />
              <Icon name="chevronRight" size={16} className={t.rowChevron} />
            </NavLink>
          ))}
        </div>
        <ThemePicker />
      </Sheet>
    </div>
  );
};
