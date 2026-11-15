/*
 * 1401 Campus — çevrimdışı kabuk.
 *
 * Mağazada Wi-Fi giderse uygulama yine açılsın: sayfa ve derlenmiş dosyalar
 * (assets, ikonlar, yazı tipleri) ilk açılışta saklanır. Veri (reçeteler,
 * dersler) bu dosyanın işi değil; Firestore'un cihazdaki önbelleği taşır.
 *
 *  - Sayfa (index.html): önce ağ, olmazsa son saklanan.
 *  - /assets/*: adları içerikten üretildiği için değişmez; önce önbellek.
 *  - Başka sitelere (Firebase, Google) giden isteklere karışılmaz.
 */
// v2: v1 eksik parça için Hosting'in döndürdüğü index.html'i JS diye saklamış olabilir (H5).
const CACHE = 'campus-v2';

/**
 * Yanıt, istenen dosyanın türünde mi? Hosting eksik dosya için 200 ile
 * index.html döndürüyor (rewrite **); eskiden bu HTML /assets/x.js adıyla
 * önbelleğe yazılıyor, yeniden denemek de aynı bozuk yanıtı veriyordu.
 */
function typeOk(path, res) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) return false;
  if (/\.m?js$/.test(path)) return ct.includes('javascript');
  if (/\.css$/.test(path)) return ct.includes('css');
  return true;
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Sayfa: önce ağ (yeni sürüm hemen gelsin), çevrimdışıysa saklanan.
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !url.search) (await caches.open(CACHE)).put('/index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Değişmeyen dosyalar: önce önbellek, yoksa ağdan alıp sakla.
  if (/^\/(assets|icons|fonts)\//.test(url.pathname) || /\.(js|css|woff2?|svg|png|webp|jpg)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit && typeOk(url.pathname, hit)) return hit;
      if (hit) (await caches.open(CACHE)).delete(req);
      try {
        const res = await fetch(req);
        if (!typeOk(url.pathname, res)) {
          // Eksik parça: HTML'i JS diye verme (tarayıcı zaten çalıştıramaz), 404 dön;
          // uygulama "yeni sürüm var" deyip sayfayı yeniler (src/lib/chunk.ts).
          return new Response('', { status: 404, statusText: 'Not Found' });
        }
        if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })());
  }
});
