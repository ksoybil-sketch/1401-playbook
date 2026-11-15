// 4.6 Panelde aynı anda üç sekme: çıkış, hesap değişimi, site verisinin silinmesi.
import { chromium, BASE, save, txt, ready, staffLogin, STAFF } from './lib.mjs';
const res = {};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
const errs = [[], [], []];
const p1 = await ctx.newPage();
await staffLogin(p1, 'director');
const p2 = await ctx.newPage(), p3 = await ctx.newPage();
[p1, p2, p3].forEach((p, i) => { p.on('pageerror', (e) => errs[i].push(e.message.slice(0, 150))); p.on('console', (m) => { if (m.type() === 'error') errs[i].push(m.text().slice(0, 150)); }); p.on('dialog', (d) => d.dismiss().catch(() => {})); });
const t = Date.now();
await Promise.all([p2.goto(BASE + '/#/rozetler'), p3.goto(BASE + '/#/icerik')]);
await Promise.all([ready(p2, 60000), ready(p3, 60000)]);
res.acilis_ms = Date.now() - t;
const head = async (p) => (await txt(p).catch(() => '')).split('\n').slice(0, 3).join(' | ');
res.ac = { p1: await head(p1), p2: await head(p2), p3: await head(p3) };
// sekme 2'de kaydedilmemiş değişiklik
await p2.locator('input[type=number]').first().fill('9');
// sekme 1'den çıkış
const out = p1.getByRole('button', { name: /Çıkış/ });
if (await out.count()) await out.first().click(); else await p1.evaluate(async () => { const { useSession } = await import('/src/store/session.ts'); await useSession.getState().logout(); });
await p1.waitForTimeout(4000);
res.cikis = { p1: new URL(p1.url()).hash + ' ' + await head(p1), p2: new URL(p2.url()).hash + ' ' + await head(p2), p3: new URL(p3.url()).hash + ' ' + await head(p3) };
console.log('cikis', JSON.stringify(res.cikis), JSON.stringify(res.ac), res.acilis_ms);
// sekme 1'de başka hesapla (Bölge Müdürü) giriş
try { await staffLogin(p1, 'regional'); } catch (e) { console.log('p1 giriş ekranı:', (await txt(p1)).slice(0, 200)); }
await p2.waitForTimeout(3000);
res.baskaHesap = { p2: new URL(p2.url()).hash + ' ' + await head(p2), p3: new URL(p3.url()).hash + ' ' + await head(p3) };
// site verisi silinir (3 sekme açık)
const cdp = await ctx.newCDPSession(p1);
await cdp.send('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'all' });
await p1.waitForTimeout(6000);
res.veriSilindi = { p1: await head(p1), p2: await head(p2), p3: await head(p3) };
// silindikten sonra sekme 3'te gezinme çalışıyor mu?
await p3.goto(BASE + '/#/magazalar').catch(() => {}); await p3.waitForTimeout(5000);
res.veriSilindiSonraGezinme = await head(p3);
res.hatalar = errs.map((e) => [...new Set(e)].slice(0, 4));
console.log(JSON.stringify(res, null, 1));
save('uc-sekme.json', res);
await browser.close();
process.exit(0);
