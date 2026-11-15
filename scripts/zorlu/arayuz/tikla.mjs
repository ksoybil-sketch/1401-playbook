// Geçiş 2: her etkileşimli öğeye bas; ölü düğme, takılan pencere, çıkış yolları.
// Kullanım: node tikla.mjs <boyut> <rol> [<rol> ...]
import { writeFileSync } from 'fs';
import { join } from 'path';
import { ready, chromium, BASE, OUT, EK, newCtx, watch, staffLogin, baristaLogin, shotPath } from './lib.mjs';

const STAFF_ROUTES = ['/', '/magazalar', '/magazalar/moda-cadde', '/magazalar/bos-sube', '/baristalar', '/baristalar/demo-mehmet',
  '/gorevler', '/talepler', '/talepler/istatistik', '/onaylar', '/rozetler', '/bulten', '/icerik', '/icerik/modul/sicak-kahveler',
  '/icerik/ders/hikayemiz', '/yeni-urun', '/geri-bildirim', '/soru-havuzu', '/kurul-sorulari', '/bildirimler'];
const R = {
  developer: ['staff', STAFF_ROUTES], director: ['staff', STAFF_ROUTES], opsmanager: ['staff', STAFF_ROUTES], regional: ['staff', STAFF_ROUTES], ops: ['staff', STAFF_ROUTES],
  board: ['staff', ['/', '/magazalar', '/isler', '/sorular', '/raporlar']],
  lead: ['bar', ['/', '/receteler', '/recete/r-espresso-cortado', '/bulten', '/akademi', '/akademi/oryantasyon', '/modul/hos-geldin', '/ders/hikayemiz', '/sonuclarim', '/ekip', '/talepler'], 'modaDevice', 'Ayşe Demir'],
  shift: ['bar', ['/', '/sonuclarim', '/ekip', '/talepler'], 'modaDevice', 'Zeynep Arslan'],
  barista: ['bar', ['/', '/receteler', '/akademi', '/modul/sicak-kahveler', '/sonuclarim', '/bulten'], 'modaDevice', 'Mehmet Kaya'],
  store: ['store', ['/', '/receteler', '/recete/r-espresso-cortado', '/davet'], 'modaDevice'],
  unpaired: ['none', ['/', '/yonetici-girisi', '/kurulum']]
};
// Veri bozacak ya da oturumu kapatacak düğmeler ilk geçişte atlanır (elle denenir).
const SKIP = /Çıkış|^Sil|Sil$|Kaldır|Pasif|Sıfırla|Bağlantı|İşten|Çıkar|Arşiv|İptal et|Reddet|Onayla|Yayınla|Yayından|Müfredatı güncelle|Espresso|Latte|Çekirdek|Hibiskus|Gün Işığı|Matcha|Köz|Gece|Altın|Varsayılana dön|Teslim|Gönder|Kaydet/;

const size = process.argv[2];
const roles = process.argv.slice(3);
const browser = await chromium.launch();

const enumerate = (page) => page.evaluate(() => {
  document.querySelectorAll('[data-zk]').forEach((e) => e.removeAttribute('data-zk'));
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const els = [...document.querySelectorAll('a[href],button,[role=button],[role=tab],[role=radio],[role=switch],[role=checkbox],summary')].filter(visible);
  const dlg = document.querySelector('[role=dialog]');
  const counts = {};
  return els.filter((el) => !dlg || dlg.contains(el)).map((el, i) => {
    el.setAttribute('data-zk', String(i));
    const txt = (el.getAttribute('aria-label') || el.innerText || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const d = `${el.tagName.toLowerCase()}${el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : ''} "${txt}"`;
    counts[d] = (counts[d] || 0) + 1;
    const sig = el.tagName + '|' + String(el.className).slice(0, 120);
    return { i, d, key: d + '#' + counts[d], sig, nav: !!el.closest('nav,aside,header'), href: el.getAttribute('href'), disabled: el.disabled || el.getAttribute('aria-disabled') === 'true' };
  });
});
const snap = (page) => page.evaluate(() => {
  const h = (s) => { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x; };
  const st = [...document.querySelectorAll('[aria-pressed],[aria-checked],[aria-expanded],[aria-selected],input,select,textarea,details')].map((e) => (e.getAttribute('aria-pressed') || '') + (e.getAttribute('aria-checked') || '') + (e.getAttribute('aria-expanded') || '') + (e.getAttribute('aria-selected') || '') + (e.value || '') + (e.open ? 'o' : '')).join('|');
  return { url: location.hash, n: document.querySelectorAll('*').length, txt: h(document.body.innerText), st: h(st), dlg: document.querySelectorAll('[role=dialog]').length, sy: Math.round(window.scrollY), cls: h([...document.querySelectorAll('[class]')].slice(0, 3000).map((e) => e.className).join('')) };
});
const same = (a, b) => a.url === b.url && a.n === b.n && a.txt === b.txt && a.st === b.st && a.dlg === b.dlg && a.sy === b.sy && a.cls === b.cls;

for (const role of roles) {
  const [kind, routes, dev, name] = R[role];
  const ctx = await newCtx(browser, size, { device: dev ? EK[dev] : null });
  let page = await ctx.newPage();
  const errs = []; watch(page, errs);
  let downloads = 0; page.on('download', () => downloads++);
  let popups = 0; page.on('popup', (p) => { popups++; p.close().catch(() => {}); });
  if (kind === 'staff') await staffLogin(page, role);
  else if (kind === 'bar') await baristaLogin(page, name, '1925');
  else { await page.goto(BASE + '/#/'); await page.waitForTimeout(800); await ready(page, 30000); }
  const loginHash = new URL(page.url()).hash;
  const out = [];
  const seenNav = new Set();
  const dialogsTried = new Set();
  const go = async (route) => { await page.goto(BASE + '/#' + route); await page.waitForTimeout(500); await ready(page, 20000); await page.waitForTimeout(500); };
  for (const route of routes) {
    await go(route);
    const landed = new URL(page.url()).hash.slice(1) || '/';
    if (landed !== route) { out.push({ role, route, t: 'erişilemez', landed }); continue; }
    let items = await enumerate(page);
    const perSig = {};
    const todo = [];
    for (const it of items) {
      if (it.nav) { if (seenNav.has(it.key)) continue; seenNav.add(it.key); }
      perSig[it.sig] = (perSig[it.sig] || 0) + 1;
      if (perSig[it.sig] > 3) continue;
      if (SKIP.test(it.d)) { out.push({ role, route, t: 'atlandı', el: it.d }); continue; }
      if (it.href && (it.href === '#' + route || it.href === route)) continue; // aynı sayfaya bağlantı
      todo.push(it);
    }
    for (const it of todo.slice(0, 40)) {
      // sayfayı hazırla
      const cur = new URL(page.url()).hash.slice(1) || '/';
      const dl = await page.locator('[role=dialog]').count();
      if (cur !== route || dl) { await go(route); }
      items = await enumerate(page);
      const tgt = items.find((x) => x.key === it.key);
      if (!tgt) { out.push({ role, route, t: 'kayboldu', el: it.d }); continue; }
      if (tgt.disabled) { out.push({ role, route, t: 'pasif', el: it.d }); continue; }
      const before = await snap(page);
      const req0 = page.__req, dlg0 = errs.filter((e) => e.t === 'dialog').length, d0 = downloads, p0 = popups;
      let clickErr = null;
      try { await page.locator(`[data-zk="${tgt.i}"]`).click({ timeout: 2500 }); }
      catch (e) { clickErr = String(e.message).split('\n').find((l) => /intercept|outside|not visible|Timeout/.test(l)) || String(e.message).slice(0, 160); }
      await page.waitForTimeout(800);
      if (page.isClosed()) { page = await ctx.newPage(); watch(page, errs); await go(route); continue; }
      const after = await snap(page);
      const changed = !same(before, after) || page.__req > req0 || errs.filter((e) => e.t === 'dialog').length > dlg0 || downloads > d0 || popups > p0;
      const rec = { role, size, route, el: it.d, changed, clickErr, opened: after.dlg > before.dlg, nav: after.url !== before.url ? after.url : undefined, req: page.__req - req0 };
      if (!changed || clickErr) {
        rec.shot = shotPath(`tik-${role}-${size}-${route.replace(/\//g, '_')}-${it.key.replace(/[^a-z0-9]/gi, '').slice(0, 30)}`);
        await page.screenshot({ path: rec.shot }).catch(() => {});
      }
      // Açılan pencere: çıkış yolları
      if (rec.opened) {
        const title = await page.locator('[role=dialog]').first().getAttribute('aria-label').catch(() => '?');
        rec.dialog = title;
        if (!dialogsTried.has(title)) {
          dialogsTried.add(title);
          const exits = {};
          const reopen = async () => {
            if (await page.locator('[role=dialog]').count()) return true;
            if ((new URL(page.url()).hash.slice(1) || '/') !== route) await go(route);
            const its = await enumerate(page);
            const t2 = its.find((x) => x.key === it.key);
            if (!t2) return false;
            await page.locator(`[data-zk="${t2.i}"]`).click({ timeout: 2500 }).catch(() => {});
            await page.waitForTimeout(600);
            return (await page.locator('[role=dialog]').count()) > 0;
          };
          const closed = async () => (await page.locator('[role=dialog]').count()) === 0;
          // Esc
          await page.keyboard.press('Escape'); await page.waitForTimeout(400); exits.esc = await closed();
          if (await reopen()) { await page.getByRole('button', { name: 'Kapat' }).last().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(400); exits.x = await closed(); }
          if (await reopen()) { await page.mouse.click(5, 5); await page.waitForTimeout(400); exits.outside = await closed(); }
          if (await reopen()) {
            const u0 = page.url(); await page.goBack().catch(() => {}); await page.waitForTimeout(700);
            exits.back = await closed(); exits.backLeftPage = page.url() !== u0; exits.backUrl = new URL(page.url()).hash;
            if (exits.backUrl === '' || exits.backUrl === loginHash && route !== '/') {}
          }
          rec.exits = exits;
          // pencere içi öğeler: ölü düğme taraması (bir kez)
          if (await reopen()) {
            const inner = (await enumerate(page)).filter((x) => !SKIP.test(x.d) && !/Kapat/.test(x.d)).slice(0, 15);
            rec.inner = [];
            for (const ii of inner) {
              if (!(await page.locator('[role=dialog]').count())) { if (!(await reopen())) break; await enumerate(page); }
              const its = await enumerate(page); const t3 = its.find((x) => x.key === ii.key);
              if (!t3 || t3.disabled) { rec.inner.push({ el: ii.d, t: t3 ? 'pasif' : 'yok' }); continue; }
              const b2 = await snap(page); const r2 = page.__req, dd = errs.filter((e) => e.t === 'dialog').length;
              let ce = null;
              try { await page.locator(`[data-zk="${t3.i}"]`).click({ timeout: 2000 }); } catch (e) { ce = String(e.message).split('\n').find((l) => /intercept|outside|not visible|Timeout/.test(l)) || String(e.message).slice(0, 120); }
              await page.waitForTimeout(600);
              const a2 = await snap(page);
              const ch = !same(b2, a2) || page.__req > r2 || errs.filter((e) => e.t === 'dialog').length > dd;
              const ir = { el: ii.d, changed: ch, clickErr: ce };
              if (!ch || ce) { ir.shot = shotPath(`tikic-${role}-${size}-${title}-${ii.key.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`); await page.screenshot({ path: ir.shot }).catch(() => {}); }
              rec.inner.push(ir);
            }
          }
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
      out.push(rec);
    }
    console.log(role, size, route, todo.length);
  }
  out.push({ role, size, t: 'hatalar', errs });
  writeFileSync(join(OUT, `tik-${role}-${size}.json`), JSON.stringify(out, null, 1));
  await ctx.close();
}
await browser.close();
