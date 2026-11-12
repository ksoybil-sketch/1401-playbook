import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '../store/session';
import { STAFF_ROLE_LABEL } from '../lib/roles';
import { record, setActor } from './log';

/** Ekran yollarının okunur adları (ilk eşleşen kazanır). */
const PAGES: [RegExp, string][] = [
  [/^\/$/, 'Ana ekran'],
  [/^\/receteler$/, 'Reçeteler'], [/^\/recete\//, 'Reçete'],
  [/^\/bulten$/, 'Bülten'], [/^\/akademi$/, 'Akademi'], [/^\/akademi\//, 'Eğitim yolu'],
  [/^\/modul\//, 'Modül'], [/^\/ders\//, 'Ders'], [/^\/sinav\//, 'Sınav'],
  [/^\/sonuclarim$/, 'Ben / sonuçlarım'], [/^\/ekip$/, 'Ekibim'], [/^\/talepler/, 'Talepler'],
  [/^\/magazalar$/, 'Mağazalar'], [/^\/magazalar\//, 'Mağaza'], [/^\/baristalar$/, 'Baristalar'], [/^\/baristalar\//, 'Barista'],
  [/^\/gorevler$/, 'Görevler'], [/^\/onaylar$/, 'Onaylar / öneriler'], [/^\/rozetler$/, 'Rozetler'],
  [/^\/icerik$/, 'Akademi düzenleme'], [/^\/icerik\/modul\//, 'Modül düzenleme'], [/^\/icerik\/ders\//, 'Ders düzenleme'],
  [/^\/yonetici-girisi$/, 'Yönetici girişi'], [/^\/davet$/, 'Davet'], [/^\/demo-kaydi$/, 'Demo kaydı']
];
const pageName = (p: string) => PAGES.find(([r]) => r.test(p))?.[1] || p;

const BARISTA_ROLE: Record<string, string> = { barista: 'Barista', lead: 'Mağaza müdürü', shift: 'Vardiya sorumlusu' };

/**
 * Demo kaydının "kim" ve "hangi ekran" yarısı. Yazımları firestore-shim
 * kaydeder; bu bileşen oturumu ve ekran değişimlerini işler.
 */
export const DemoTracker: React.FC = () => {
  const session = useSession((s) => s.session);
  const { pathname, search } = useLocation();
  const actorKey = useRef('');
  const lastPage = useRef('');

  useEffect(() => {
    let key = '';
    if (session.kind === 'staff') {
      setActor({ uid: session.uid, who: session.name, role: STAFF_ROLE_LABEL[session.role] || session.role });
      key = 'staff:' + session.uid;
    } else if (session.kind === 'barista') {
      setActor({ uid: session.uid, who: `${session.name} (${session.storeName})`, role: BARISTA_ROLE[session.role] || session.role });
      key = 'barista:' + session.baristaId;
    } else if (session.kind === 'store') {
      setActor({ uid: session.uid, who: `${session.storeName} telefonu`, role: 'Mağaza telefonu' });
      key = 'store:' + session.uid;
    } else if (session.kind === 'loading') {
      return;
    }
    if (key && key !== actorKey.current) {
      record(null, 'oturum', { op: 'giriş' });
      lastPage.current = '';
    }
    if (!key && actorKey.current) setActor(null);
    actorKey.current = key;
  }, [session]);

  useEffect(() => {
    const at = pathname + search;
    if (!actorKey.current || at === lastPage.current) return;
    lastPage.current = at;
    // Mağaza telefonunda yalnızca reçeteler ve girişler ayrı ekran; geri
    // kalan her yol (çıkıştan kalan adres dahil) baristaların listesidir.
    const label = session.kind === 'store' && !/^\/(receteler|recete\/|yonetici-girisi|davet)/.test(pathname)
      ? 'Barista seçimi' : pageName(pathname);
    record(null, 'sayfa', { path: at, label });
  }, [pathname, search, session]);

  return null;
};
