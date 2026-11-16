import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../store/session';
import { Icon, type IconName } from '../../ui/Icon';
import { Avatar, Sheet } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { isDevRole, STAFF_ROLE_LABEL } from '../../lib/roles';
import { useBoardView } from '../../lib/boardView';
import { useStaffData } from '../staff/staffData';
import { useStaffSession } from '../staff/StaffLayout';
import { ThemePicker, useStaffTheme } from '../staff/theme';
import { useBoardQuestions } from './BoardQuestions';
import { useAllow, type Perm } from '../../lib/permissions';
import { useIdleLogout, IdleWarning } from '../../lib/idleLogout';

/**
 * Yönetim Kurulu ekranı. Kahve Operasyonu girişinden girilir; panelin
 * verisini okur ama hiçbir şeyi değiştiremez (kurallar da izin vermez).
 * Beş bölüm: Gidişat, Mağazalar, Süren işler, Sorularım, Raporlar.
 */

interface NavItem { to: string; label: string; short?: string; icon: IconName; badge?: number }


export const BoardLayout: React.FC = () => {
  const s = useStaffSession();
  const logout = useSession((x) => x.logout);
  // Mağaza telefonundan giriş yapan yöneticinin oturumu 5 dk hareketsizlikte
  // kapanır (telefon mağaza moduna döner). Kendi cihazında çalışmaz.
  const sharedDevice = useSession((x) => !!x.device);
  const idle = useIdleLogout(5 * 60 * 1000, sharedDevice);
  const subscribe = useStaffData((x) => x.subscribe);
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  // Geliştiricinin kurul görünümü: panele dönüş düğmesi.
  const dev = isDevRole(s.role);
  const navigate = useNavigate();
  const setBoardView = useBoardView((x) => x.set);
  const toPanel = () => { setBoardView(false); navigate('/'); };
  useStaffTheme();
  // Panelle aynı küçük canlı veri (baristalar, ilerleme, açık talepler, bekleyen
  // öneriler). Dönem sınavları ve talepleri sayfada, seçilen dönem için tek
  // seferlik okunur (eskiden geçen yılın 1 Ocak'ından beri bütün sınavlar canlı
  // dinleniyordu: açılış başına binlerce okuma, her cevap işaretlemesi de okuma).
  useEffect(() => subscribe(), [subscribe]);
  useEffect(() => { setMore(false); window.scrollTo(0, 0); }, [pathname]);
  const { data: questions } = useBoardQuestions();
  // Yanıtı gelmiş, kurulun henüz kapatmadığı sorular.
  const answered = questions.filter((q) => q.status === 'answered').length;

  // Gidişat her zaman açık; diğerleri Kahve Operasyon Direktörü'nün Yetkiler ayarına bağlı.
  const allow = useAllow();
  const NAV = ([
    { to: '/', label: 'Gidişat', icon: 'chart' },
    { to: '/magazalar', label: 'Mağazalar', icon: 'store', perm: 'kurul.magazalar' },
    { to: '/isler', label: 'Süren işler', short: 'İşler', icon: 'list', perm: 'kurul.isler' },
    { to: '/sorular', label: 'Sorularım', short: 'Sorular', icon: 'message', badge: answered, perm: 'kurul.sorular' },
    { to: '/raporlar', label: 'Raporlar', icon: 'download', perm: 'kurul.raporlar' }
  ] as (NavItem & { perm?: Perm })[]).filter((n) => !n.perm || allow(s.role, n.perm));

  const Badge: React.FC<{ n?: number; dot?: boolean }> = ({ n, dot }) =>
    n ? (
      <span className={`${dot ? 'absolute -top-1 -right-2' : 'ml-auto'} min-w-4 h-4 px-1 rounded-full bg-crema text-espresso text-[10px] font-bold flex items-center justify-center tnum`}>
        {n > 9 ? '9+' : n}
      </span>
    ) : null;

  return (
    <div className="min-h-[100dvh] md:flex bg-espresso">
      <IdleWarning left={idle.warnLeft} onStay={idle.stay} />
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-line bg-bean/60 sticky top-0 h-[100dvh] print:hidden">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-line">
          <img src="/icons/logo.svg" alt="" className="w-7 h-7 opacity-90 logo-mark" />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">1401 Campus</div>
            <div className="text-[11px] text-fg-3">Yönetim Kurulu</div>
          </div>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `flex items-center gap-3 h-10 px-3 rounded-lg text-[14px] font-medium transition-colors ${isActive ? 'bg-panel-3 text-crema' : 'text-fg-2 hover:bg-panel-2 hover:text-crema'}`}>
              <Icon name={n.icon} size={18} /> {n.label}
              <Badge n={n.badge} />
            </NavLink>
          ))}
        </nav>
        {dev && (
          <div className="px-3 pb-2">
            <button onClick={toPanel} className={`${t.btn} ${t.btnSecondary} ${t.btnSm} w-full`}><Icon name="chevronLeft" size={14} /> Panele dön</button>
          </div>
        )}
        <div className="px-3 pb-2"><ThemePicker compact /></div>
        <div className="p-3 border-t border-line flex items-center gap-2.5">
          <Avatar name={s.name} size={32} />
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[13px] font-medium truncate">{s.name}</div>
            <div className="text-[11px] text-fg-3 leading-snug">{STAFF_ROLE_LABEL[s.role]}</div>
          </div>
          <button onClick={logout} className={t.iconBtn} aria-label="Çıkış" title="Çıkış"><Icon name="logout" size={15} /></button>
        </div>
      </aside>

      {/* Telefonda üst bar sayfayla kayar (yer kaplamasın); yalnızca durum çubuğu şeridi örtülü. */}
      <div aria-hidden className="md:hidden fixed top-0 inset-x-0 z-50 h-[env(safe-area-inset-top)] bg-espresso print:hidden" />
      <header className="md:hidden relative z-40 bg-espresso border-b border-line pt-[env(safe-area-inset-top)] print:hidden">
        <div className="h-14 flex items-center gap-3 px-4">
          <img src="/icons/logo.svg" alt="" className="w-7 h-7 opacity-90 logo-mark" />
          <div className="flex-1 leading-tight min-w-0">
            <div className="text-[14px] font-semibold">Yönetim Kurulu</div>
            <div className="text-[11px] text-fg-3 truncate">{s.name}</div>
          </div>
          {dev && <button onClick={toPanel} className={t.iconBtn} aria-label="Panele dön" title="Panele dön"><Icon name="chevronLeft" size={16} /></button>}
          <button onClick={() => setMore(true)} className={t.iconBtn} aria-label="Tema"><Icon name="palette" size={16} /></button>
          <button onClick={logout} className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`}><Icon name="logout" size={14} /> Çıkış</button>
        </div>
      </header>

      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Mobil alt menü: beş bölüm de sığıyor. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bean/92 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)] print:hidden">
        <div className="flex items-stretch px-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-1 h-14 ${isActive ? 'text-crema' : 'text-fg-3'}`}>
              {({ isActive }) => (
                <>
                  <span className="relative"><Icon name={n.icon} size={20} strokeWidth={isActive ? 1.9 : 1.5} /><Badge n={n.badge} dot /></span>
                  <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{n.short || n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <Sheet open={more} title="Görünüm" onClose={() => setMore(false)}>
        <ThemePicker />
      </Sheet>
    </div>
  );
};
