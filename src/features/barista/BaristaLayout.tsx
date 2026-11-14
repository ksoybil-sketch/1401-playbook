import { useBaristaTheme } from './Themes';
import React, { useEffect } from 'react';
import { HUE, type Hue } from '../../ui/palette';
import { BARISTA_ROLE_LABEL, isManager } from '../../lib/roles';
import { useStoreRequests, hasNewReply } from './RequestsPage';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../../store/session';
import { Icon, type IconName } from '../../ui/Icon';
import { Avatar } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { useBaristaSession, useMyBulletins } from './useBaristaData';
import { finalizeExpired } from '../../api/exam';
import { useIdleLogout } from '../../lib/idleLogout';

/** Ortak telefonda unutulan oturum başkası adına sınav çözülmesine yol açmasın. */
const IDLE_LOGOUT_MS = 10 * 60 * 1000;

export const BaristaLayout: React.FC = () => {
  const s = useBaristaSession();
  // Baristanın eğitimle açtığı tema (Ben → Temalar).
  useBaristaTheme();
  const logout = useSession((x) => x.logout);
  const { pathname } = useLocation();
  const { unread } = useMyBulletins();
  const { items: requests } = useStoreRequests(isManager(s.role));
  const replies = requests.filter(hasNewReply).length;
  useIdleLogout(IDLE_LOGOUT_MS);

  // Yarıda kalıp süresi dolmuş denemeler, oturum açılır açılmaz o ana kadarki
  // cevaplarla puanlanır; hiçbir deneme havada kalmaz.
  useEffect(() => { finalizeExpired(s.baristaId).catch(() => {}); }, [s.baristaId]);

  // Yeni ekran her zaman en üstten açılır (önceki sayfanın kaydırması kalmasın).
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // Ders ve sınav ekranları odaklı çalışır: alt menü gizlenir.
  const focused = pathname.startsWith('/ders/') || pathname.startsWith('/sinav/');

  // Reçeteler, Akademi'den ayrı bir sekme: servis sırasında aranan şey
  // müfredatın neresinde durduğu değil, içeceğin kendisi.
  //
  // Beş sekme sınırdır (telefonda 375px'de her biri ~70px). Mağaza
  // ve vardiya müdürünün "Ekibim" ve "Talepler" ekranları bu yüzden "Ben"
  // sekmesinin içinden açılır.
  // Her sekmenin rengi ana sayfadaki kutusuyla aynı: barista "turuncu =
  // reçete" diye öğrenir, ekranlar arasında kaybolmaz.
  const nav: { to: string; label: string; icon: IconName; badge?: number; hue: Hue; also?: string[] }[] = [
    { to: '/', label: 'Bugün', icon: 'home', hue: 'sand' },
    { to: '/receteler', label: 'Reçeteler', icon: 'coffee', hue: 'amber', also: ['/recete/'] },
    { to: '/akademi', label: 'Akademi', icon: 'cap', hue: 'sky', also: ['/modul/'] },
    { to: '/bulten', label: 'Bülten', icon: 'bell', badge: unread, hue: 'mint' },
    { to: '/sonuclarim', label: 'Ben', icon: 'user', badge: replies, hue: 'violet', also: ['/ekip', '/talepler'] }
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Üst bar sabit değil, sayfayla birlikte kayar: telefonda ekranın
          önemli bir kısmını kaplıyordu. Sabit olan alttaki menü. Çentik/durum
          çubuğu altına içerik kaymasın diye yalnızca o şerit örtülür. */}
      <div aria-hidden className="fixed top-0 inset-x-0 z-50 h-[env(safe-area-inset-top)] bg-espresso" />
      <header className="relative z-40 bg-espresso border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="h-14 flex items-center gap-3 px-4 max-w-[560px] mx-auto">
          <Avatar name={s.name} size={32} />
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[14px] font-semibold truncate">{s.name}</div>
            <div className="text-[11px] text-fg-3 truncate">{s.storeName}{s.role !== 'barista' ? ` · ${BARISTA_ROLE_LABEL[s.role]}` : ''}</div>
          </div>
          {/* Ders ve sınavda çıkış yok: sınavın kendi "Kapat"ı onay ister,
              buradaki tek dokunuşla oturum kapanıyor, süre işlemeye devam ediyordu. */}
          {!focused && (
            <button onClick={logout} className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`}>
              <Icon name="logout" size={14} /> Çıkış
            </button>
          )}
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
                  `flex-1 flex flex-col items-center justify-center gap-1 h-14 transition-colors ${isActive || n.also?.some((p) => pathname.startsWith(p)) ? HUE[n.hue].text : 'text-fg-3'}`
                }
              >
                {({ isActive: exact }) => {
                  const isActive = exact || !!n.also?.some((p) => pathname.startsWith(p));
                  return (
                  <>
                    <span className="relative">
                      <Icon name={n.icon} size={21} strokeWidth={isActive ? 1.9 : 1.5} />
                      {!!n.badge && n.badge > 0 && (
                        <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-crema text-espresso text-[10px] font-bold flex items-center justify-center tnum">
                          {n.badge > 9 ? '9+' : n.badge}
                        </span>
                      )}
                    </span>
                    <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{n.label}</span>
                  </>
                  );
                }}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
};
