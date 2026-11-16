import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../store/session';
import { Icon, type IconName } from '../../ui/Icon';
import { Avatar, Sheet, Spinner, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { can, isDevRole, STAFF_ROLE_LABEL } from '../../lib/roles';
import { useBoardView } from '../../lib/boardView';
import { useAllow, type Perm } from '../../lib/permissions';
import { askedTo, useBoardQuestions } from '../board/BoardQuestions';
import { isClosed } from '../../api/requests';
import { useStaffData } from './staffData';
import { ChangePasswordSheet } from './ChangePasswordSheet';
import { ThemePicker, useStaffTheme } from './theme';
import { ACTIVITY_LOG } from '../../demo/log';
import { useIdleLogout, IdleWarning } from '../../lib/idleLogout';
import { confirmLeave, otherTabsDirty, OTHER_TABS_TEXT } from '../../lib/unsaved';

interface NavItem { to: string; label: string; short?: string; icon: IconName; badge?: number; primary?: boolean; perm?: Perm }

/** Yetkiye bağlı ekranların adresleri (yetkisi kaldırılınca bildirim için). */
const ALL_PERM_PATHS: { to: string; perm: Perm }[] = [
  { to: '/talepler', perm: 'ekran.talepler' }, { to: '/onaylar', perm: 'ekran.onaylar' }, { to: '/baristalar', perm: 'ekran.baristalar' },
  { to: '/kurul-sorulari', perm: 'ekran.kurulSorulari' }, { to: '/magazalar', perm: 'ekran.magazalar' }, { to: '/gorevler', perm: 'ekran.gorevler' },
  { to: '/bulten', perm: 'ekran.bulten' }, { to: '/rozetler', perm: 'ekran.rozetler' }, { to: '/yeni-urun', perm: 'ekran.yeniUrun' },
  { to: '/icerik', perm: 'ekran.akademi' }, { to: '/soru-havuzu', perm: 'ekran.soruHavuzu' }, { to: '/geri-bildirim', perm: 'ekran.geriBildirim' },
  { to: '/bildirimler', perm: 'ekran.bildirimler' }
];

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
  // Mağaza telefonundan giriş yapan yöneticinin oturumu 5 dk hareketsizlikte
  // kapanır (telefon mağaza moduna döner). Kendi cihazında çalışmaz.
  const sharedDevice = useSession((x) => !!x.device);
  const idle = useIdleLogout(5 * 60 * 1000, sharedDevice);
  const subscribe = useStaffData((x) => x.subscribe);
  const proposals = useStaffData((x) => x.proposals);
  const requests = useStaffData((x) => x.requests);
  const dataError = useStaffData((x) => x.error);
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const [pw, setPw] = useState(false);
  useStaffTheme();
  useEffect(() => subscribe(), [subscribe]);
  useEffect(() => { setMore(false); window.scrollTo(0, 0); }, [pathname]);

  const allow = useAllow();
  const approver = allow(s.role, 'oneriOnay');
  const pendingCount = approver
    ? proposals.filter((p) => p.status === 'pending').length
    : proposals.filter((p) => p.createdBy === s.uid && p.status === 'rejected' && (p.reviewedAt || 0) > Date.now() - 7 * 86400000).length;
  // Yanıt bekleyen talepler: mağaza yazdı, operasyon henüz dönmedi.
  // Yönetim Kurulu'nun bana sorduğu, yanıt bekleyen sorular.
  const board = useBoardQuestions(allow(s.role, 'ekran.kurulSorulari'));
  const boardWaiting = board.data.filter((q) => q.status === 'open' && askedTo(q, s.role)).length;
  // Yalnızca açık talepler: mağaza kapanmış talebe artık yazamıyor (14.11.2026
  // kararı). Eskiden kapalı talebe yazılan mesaj rozeti artırıyor ama Açık
  // listesinde görünmüyordu; sayı ile liste aynı olsun.
  const openRequests = requests.filter((r) => r.lastSide === 'store' && !isClosed(r.status)).length;

  // Her menü satırı Yetkiler ayarına bağlı (perm). Kapalı olan görünmez.
  const NAV: NavItem[] = ([
    { to: '/', label: 'Genel bakış', short: 'Genel', icon: 'grid', primary: true },
    { to: '/talepler', label: 'Talepler', icon: 'wrench', badge: openRequests, primary: true, perm: 'ekran.talepler' },
    { to: '/onaylar', label: approver ? 'Bekleyen onaylar' : 'Önerilerim', short: approver ? 'Onaylar' : 'Öneriler', icon: 'stamp', badge: pendingCount, primary: true, perm: 'ekran.onaylar' },
    { to: '/baristalar', label: 'Baristalar', icon: 'users', primary: true, perm: 'ekran.baristalar' },
    { to: '/kurul-sorulari', label: 'Kurul soruları', icon: 'award', badge: boardWaiting, perm: 'ekran.kurulSorulari' },
    { to: '/magazalar', label: 'Mağazalar', icon: 'store', perm: 'ekran.magazalar' },
    { to: '/gorevler', label: 'Görevler', icon: 'flag', perm: 'ekran.gorevler' },
    { to: '/bulten', label: 'Bülten', icon: 'bell', perm: 'ekran.bulten' },
    { to: '/rozetler', label: 'Rozetler', icon: 'medal', perm: 'ekran.rozetler' },
    // Yol adı /icerik kalıyor: değiştirmek panelde kayıtlı bağlantıları ve
    // ders editörüne dönüş adreslerini kırardı. Görünen ad "Akademi".
    // Yeni ürün: reçete + mini sınav + bülten + görev tek seferde.
    { to: '/yeni-urun', label: 'Yeni ürün', icon: 'coffee', perm: 'ekran.yeniUrun' },
    { to: '/icerik', label: 'Akademi', icon: 'layers', perm: 'ekran.akademi' },
    // Bütün sınav soruları: düzelt, iptal et, sınavları yeniden puanla.
    { to: '/soru-havuzu', label: 'Soru havuzu', icon: 'target', perm: 'ekran.soruHavuzu' },
    { to: '/geri-bildirim', label: 'Geri bildirim', icon: 'message', perm: 'ekran.geriBildirim' },
    // Yetkiler ekranındaki adıyla aynı; Bülten'le aynı zil simgesi karışıyordu.
    { to: '/bildirimler', label: 'E-posta bildirimleri', icon: 'send', perm: 'ekran.bildirimler' },
    // Yetkiler: kim neyi görür/değiştirir. Kahve Operasyon Direktörü ve geliştirici (sabit).
    ...(can(s.role, 'manageTeam') ? [{ to: '/yetkiler', label: 'Yetkiler', icon: 'key' as IconName }] : []),
    // Demo ve emülatör paketinde: demoyu deneyenlerin izi (yalnızca geliştirici).
    ...(ACTIVITY_LOG && can(s.role, 'manageAi') ? [{ to: '/demo-kaydi', label: 'Demo kaydı', icon: 'info' as IconName }] : [])
  ] as NavItem[]).filter((n) => !n.perm || allow(s.role, n.perm));
  const primary = NAV.filter((n) => n.primary);

  // Açık ekranın yetkisi kapatılınca uygulama Genel bakış'a atıyor; neden
  // atıldığı söylenmiyordu.
  const lastPath = useRef(pathname);
  useEffect(() => {
    const prev = lastPath.current;
    lastPath.current = pathname;
    if (pathname !== '/' || prev === '/') return;
    const item = ALL_PERM_PATHS.find((x) => prev.startsWith(x.to));
    if (item && !allow(s.role, item.perm)) toast('Bu ekranın yetkisi kaldırıldı.', 'negative');
  }, [pathname, allow, s.role]);
  const doLogout = async () => {
    if (!confirmLeave()) return;
    // Oturum sekmeler arasında ortak: öteki sekmelerdeki taslak da gider (H14).
    if (await otherTabsDirty() && !confirm(OTHER_TABS_TEXT)) return;
    void logout();
  };
  // Geliştirici: Yönetim Kurulu'nun gördüğü ekranlara geçer (src/lib/boardView.ts).
  const navigate = useNavigate();
  const setBoardView = useBoardView((x) => x.set);
  const toBoard = () => { if (!confirmLeave()) return; setBoardView(true); navigate('/'); };
  // Geliştirici: bütün kayıtların yedeği bilgisayara iner (src/lib/backup.ts).
  const [backingUp, setBackingUp] = useState<string | null>(null);
  const backup = async () => {
    setBackingUp('Hazırlanıyor…');
    try {
      const { downloadBackup } = await import('../../lib/backup');
      const r = await downloadBackup((x) => setBackingUp(x));
      toast(`Yedek indirildi: ${r.total} kayıt (${r.file})`, 'positive');
    } catch (e) { toast(`Yedek alınamadı: ${(e as Error).message}`, 'negative'); }
    setBackingUp(null);
  };
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
      <IdleWarning left={idle.warnLeft} onStay={idle.stay} />
      {/* Masaüstü yan menü */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-line bg-bean/60 sticky top-0 h-[100dvh]">
        <div className="shrink-0 flex items-center gap-2.5 px-5 h-16 border-b border-line">
          <img src="/icons/logo.svg" alt="" className="w-7 h-7 opacity-90 logo-mark" />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">1401 Campus</div>
            <div className="text-[11px] text-fg-3">Kahve Operasyonu</div>
          </div>
        </div>
        {/* Kısa ekranda (dizüstü, yatay telefon) satırlar ezilmesin: menü kayar. */}
        <nav className="flex-1 min-h-0 p-3 flex flex-col gap-0.5 overflow-y-auto overscroll-contain">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }}
              end={n.to === '/'}
              className={({ isActive }) =>
                `shrink-0 flex items-center gap-3 h-10 px-3 rounded-lg text-[14px] font-medium transition-colors ${isActive ? 'bg-panel-3 text-crema' : 'text-fg-2 hover:bg-panel-2 hover:text-crema'}`
              }
            >
              <Icon name={n.icon} size={18} /> {n.label}
              <Badge n={n.badge} />
            </NavLink>
          ))}
        </nav>
        {isDevRole(s.role) && (
          <div className="shrink-0 px-3 pb-2">
            <button onClick={toBoard} className={`${t.btn} ${t.btnSecondary} ${t.btnSm} w-full`}><Icon name="award" size={14} /> Kurul ekranı</button>
            <button onClick={backup} disabled={!!backingUp} className={`${t.btn} ${t.btnSecondary} ${t.btnSm} w-full mt-1.5`}>
              {backingUp ? <><Spinner size={13} /> {backingUp}</> : <><Icon name="download" size={14} /> Yedek al</>}
            </button>
          </div>
        )}
        <div className="shrink-0 px-3 pb-2"><ThemePicker compact /></div>
        <div className="shrink-0 p-3 border-t border-line flex items-center gap-2.5">
          <Avatar name={s.name} size={32} />
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[13px] font-medium truncate">{s.name}</div>
            {/* Uzun unvan ("Kahve Operasyon Direktörü") kesilmesin: iki satıra iner. */}
            <div className="text-[11px] text-fg-3 leading-snug">{STAFF_ROLE_LABEL[s.role]}</div>
          </div>
          <button onClick={() => setPw(true)} className={t.iconBtn} aria-label="Şifremi değiştir" title="Şifremi değiştir"><Icon name="key" size={15} /></button>
          <button onClick={doLogout} className={t.iconBtn} aria-label="Çıkış" title="Çıkış"><Icon name="logout" size={15} /></button>
        </div>
      </aside>

      {/* Mobil üst bar */}
      {/* Telefonda üst bar sayfayla kayar (yer kaplamasın); yalnızca durum çubuğu şeridi örtülü. */}
      <div aria-hidden className="md:hidden fixed top-0 inset-x-0 z-50 h-[env(safe-area-inset-top)] bg-espresso" />
      <header className="md:hidden relative z-40 bg-espresso border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="h-14 flex items-center gap-3 px-4">
          <img src="/icons/logo.svg" alt="" className="w-7 h-7 opacity-90 logo-mark" />
          <div className="flex-1 leading-tight min-w-0">
            <div className="text-[14px] font-semibold">Kahve Operasyonu</div>
            <div className="text-[11px] text-fg-3 truncate">{s.name} · {STAFF_ROLE_LABEL[s.role]}</div>
          </div>
          {isDevRole(s.role) && <button onClick={toBoard} className={t.iconBtn} aria-label="Kurul ekranı" title="Kurul ekranı"><Icon name="award" size={16} /></button>}
          <button onClick={doLogout} className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`}><Icon name="logout" size={14} /> Çıkış</button>
        </div>
      </header>

      <main className="flex-1 min-w-0">
        {dataError && (
          <div className="mx-4 mt-4 flex gap-2 items-start text-[13px] text-caution bg-caution-bg border border-caution-line rounded-lg px-3 py-2.5">
            <Icon name="alert" size={16} className="mt-0.5" /><span>{dataError}</span>
          </div>
        )}
        <Outlet />
      </main>

      {/* Mobil alt menü: dört ana sekme + "Diğer". Sekiz sekme 375px'e sığmıyor. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bean/92 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch px-1">
          {primary.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }}
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
            <NavLink key={n.to} to={n.to} className={t.listRow} onClick={(e) => {
              if (!confirmLeave()) { e.preventDefault(); return; }
              // Bulunulan ekrana dokununca menü kapanır (eskiden açık kalıyordu).
              if (pathname === n.to) e.preventDefault();
              setMore(false);
            }}>
              <span className={t.iconChip('neutral')}><Icon name={n.icon} size={16} /></span>
              <span className="text-[14px] font-medium flex-1">{n.label}</span>
              <Badge n={n.badge} />
              <Icon name="chevronRight" size={16} className={t.rowChevron} />
            </NavLink>
          ))}
          <button type="button" className={`${t.listRow} w-full text-left`} onClick={() => { setMore(false); setPw(true); }}>
            <span className={t.iconChip('neutral')}><Icon name="key" size={16} /></span>
            <span className="text-[14px] font-medium flex-1">Şifremi değiştir</span>
            <Icon name="chevronRight" size={16} className={t.rowChevron} />
          </button>
          {isDevRole(s.role) && (
            <button type="button" className={`${t.listRow} w-full text-left`} disabled={!!backingUp} onClick={() => { void backup(); }}>
              <span className={t.iconChip('neutral')}>{backingUp ? <Spinner size={14} /> : <Icon name="download" size={16} />}</span>
              <span className="text-[14px] font-medium flex-1">{backingUp || 'Yedek al'}</span>
            </button>
          )}
        </div>
        <ThemePicker />
      </Sheet>
      <ChangePasswordSheet open={pw} onClose={() => setPw(false)} />
    </div>
  );
};
