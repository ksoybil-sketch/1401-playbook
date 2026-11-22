/**
 * Hareketsizlik süresinin cihazda duran sayacı.
 *
 * useIdleLogout'un zamanlayıcısı yalnızca uygulama önde ve sayfa ayakta
 * olduğu sürece işler:
 *  - başka bir uygulamaya geçilince (gelen bir WhatsApp mesajı) Android
 *    WebView ve tarayıcı zamanlayıcıları kısar ya da dondurur;
 *  - telefon belleği daralınca sayfa atılır, geri dönüldüğünde baştan kurulur
 *    ve sayaç sıfırdan başlar. Firebase oturumu cihazda saklı olduğu için
 *    ekran da o kişinin oturumuyla açılır.
 *
 * Mağaza telefonu ortak olduğundan yarım saat sonra dönen kişi öncekinin
 * oturumunu açık buluyordu. Bu yüzden sürenin biteceği an cihaza yazılır;
 * oturum her çözümlenişinde (store/session.ts) duvar saatiyle karşılaştırılır
 * ve dolmuşsa oturum geri açılmaz.
 *
 * Kayıt yalnızca süre işleyen oturumlarda (ortak cihaz) tutulur: evde ders
 * çalışma ve yöneticinin kendi bilgisayarı bu dosyaya hiç yazmaz.
 */
const KEY = 'playbook.idleDeadline.v1';

/** Her dokunuşta yazmamak için: kayıtlı an en çok bu kadar geride kalabilir. */
const WRITE_STEP = 15_000;

/** Sürenin biteceği anı kaydeder (dokunma, kaydırma, tuş…). */
export function setIdleDeadline(at: number): void {
  try {
    const cur = Number(localStorage.getItem(KEY)) || 0;
    if (Math.abs(at - cur) < WRITE_STEP) return;
    localStorage.setItem(KEY, String(at));
  } catch { /* gizli pencere: kayıt tutulamaz, ekrandaki sayaç yine çalışır */ }
}

/** Oturum kapandı / açıldı: kayıt silinir (sonraki girişe sarkmasın). */
export function clearIdleDeadline(): void {
  try { localStorage.removeItem(KEY); } catch { /* yok say */ }
}

/** Kayıtlı bir süre var ve dolmuş mu? Kayıt yoksa false. */
export function idleExpired(): boolean {
  try {
    const at = Number(localStorage.getItem(KEY)) || 0;
    return at > 0 && Date.now() > at;
  } catch { return false; }
}
