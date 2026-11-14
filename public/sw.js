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
const CACHE = 'campus-v1';

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
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })());
  }
});
