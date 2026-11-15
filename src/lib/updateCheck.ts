/**
 * Yeni sürüm kontrolü (web).
 *
 * Tarayıcıda açık kalan bir sekme, yeni sürüm yayınlansa da eski kodla
 * çalışmaya devam eder. Demo kaydı yayınlandığında, önceden açılmış
 * sekmeler bu yüzden hiçbir şey kaydetmedi. Burada sekme öne geldiğinde ve
 * beş dakikada bir yayındaki index.html'e bakılır; paket adı değişmişse
 * sayfa güvenli bir anda yenilenir.
 *
 * Güvenli an: sınavda, içerik düzenlerken ya da açık bir pencere (form)
 * varken yenilenmez; o durumda bir sonraki kontrole kalır. Mobil uygulama
 * (Capacitor) dosyaları cihazdan okuduğu için orada kontrol yapılmaz.
 */
import { pendingLeaveText } from './unsaved';
import { toast } from '../ui/kit';

const INTERVAL = 5 * 60 * 1000;

function currentBundle(): string | null {
  const src = [...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src).find((s) => /\/assets\/index-[^/]+\.js$/.test(s));
  return src ? src.split('/').pop()! : null;
}

/**
 * Yenilemek güvenli değil: sınav, içerik editörü, açık pencere ya da
 * kaydedilmemiş değişiklik koruması olan bir ekran (rozet ayarları, Yeni ürün…;
 * H6: eskiden yalnızca adrese bakılıyor, rozet ayarındaki taslak gidiyordu).
 */
function busy(): boolean {
  const h = location.hash;
  return h.includes('/sinav/') || h.includes('/icerik/') || !!document.querySelector('[role=dialog]') || pendingLeaveText() !== null;
}

export function watchForUpdates() {
  if (import.meta.env.DEV || !/^https?:$/.test(location.protocol)) return;
  if ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;
  const mine = currentBundle();
  if (!mine) return;
  let last = 0;
  let told = false;
  const check = async () => {
    if (Date.now() - last < 60_000) return;
    last = Date.now();
    try {
      const html = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
      const live = html.match(/\/assets\/(index-[^"']+\.js)/)?.[1];
      if (live && live !== mine) {
        if (!busy()) { location.reload(); return; }
        // Kaydedilmemiş iş var: yenilenmez, bir kez söylenir; sonraki kontrolde yeniden bakılır.
        if (!told) { told = true; toast('Yeni sürüm hazır. Kaydettikten sonra sayfa kendiliğinden yenilenecek.'); }
      }
    } catch { /* çevrimdışı: sonra yine denenir */ }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, INTERVAL);
}
