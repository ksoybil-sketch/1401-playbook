import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '../../store/session';
import { kullanimBasla, kullanimBitti, kullanimEkran } from '../../lib/kullanimKaydi';

/**
 * Kullanım sayacının "ne zaman" yarısı: oturum açılışını ve ekran
 * değişimlerini src/lib/kullanimKaydi.ts'e bildirir. Hiçbir şey çizmez.
 *
 * Yalnızca mağaza telefonu ve barista oturumlarında çalışır; yönetici
 * panelinde ve oturum yokken hiçbir şey yazmaz. Kayıt mağaza başınadır,
 * kişiye bağlı değildir — ayrıntı kullanimKaydi.ts başındaki açıklamada.
 */
export const KullanimSayaci: React.FC = () => {
  const session = useSession((s) => s.session);
  const { pathname } = useLocation();
  const acik = useRef(false);

  useEffect(() => {
    if (session.kind === 'store' || session.kind === 'barista') {
      acik.current = true;
      kullanimBasla(session.storeId, session.uid);
    } else if (acik.current && session.kind !== 'loading') {
      // Çıkış ya da bağlantı kopması: biriken son parçayı gönder.
      acik.current = false;
      kullanimBitti();
    }
  }, [session]);

  useEffect(() => {
    if (acik.current) kullanimEkran(pathname);
  }, [pathname, session]);

  return null;
};
