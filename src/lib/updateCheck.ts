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
const INTERVAL = 5 * 60 * 1000;

function currentBundle(): string | null {
  const src = [...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src).find((s) => /\/assets\/index-[^/]+\.js$/.test(s));
  return src ? src.split('/').pop()! : null;
}

function busy(): boolean {
  const h = location.hash;
  return h.includes('/sinav/') || h.includes('/icerik/') || !!document.querySelector('[role=dialog]');
}

export function watchForUpdates() {
  if (import.meta.env.DEV || !/^https?:$/.test(location.protocol)) return;
  if ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;
  const mine = currentBundle();
  if (!mine) return;
  let last = 0;
  const check = async () => {
    if (Date.now() - last < 60_000) return;
    last = Date.now();
    try {
      const html = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
      const live = html.match(/\/assets\/(index-[^"']+\.js)/)?.[1];
      if (live && live !== mine && !busy()) location.reload();
    } catch { /* çevrimdışı: sonra yine denenir */ }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, INTERVAL);
}
