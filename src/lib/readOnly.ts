import { useSession } from '../store/session';
import { toast } from '../ui/kit';

/** Çevrimdışı PIN girişiyle açılan, salt okunur barista oturumu mu (H17). */
export const isReadOnly = () => { const s = useSession.getState().session; return s.kind === 'barista' && !!s.offline; };

export const READ_ONLY_TEXT = 'Çevrimdışı moddasın: bu işlem bağlantı gelince açılır. Bağlantı gelince uygulama seni kendiliğinden tam girişe geçirir.';

/**
 * Yazma işinden önce: salt okunur oturumda uyarır ve true döner (işlem yapılmasın).
 * Çevrimdışı oturum mağaza hesabıyla çalıştığı için yazım zaten kurallarca
 * reddedilirdi; burada sessizce kaybolmasın diye önceden söylenir.
 */
export function blockedReadOnly(text = READ_ONLY_TEXT): boolean {
  if (!isReadOnly()) return false;
  toast(text, 'negative');
  return true;
}
