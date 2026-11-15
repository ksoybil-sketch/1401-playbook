// 3.7 Düşük donanım: 4x yavaş işlemci + yavaş 3G (400 ms, ~400 kbit/s), üretim paketi, soğuk önbellek.
import { chromium, save, ready, EK, STAFF } from './lib.mjs';
const P = 'http://localhost:5180';
const res = {};
const browser = await chromium.launch();
async function throttled(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.vp || { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', isMobile: !opts.vp, hasTouch: !opts.vp, serviceWorkers: 'block' });
  if (opts.device) await ctx.addInitScript((d) => { try { if (!localStorage.getItem('CapacitorStorage.playbook.device.v2')) localStorage.setItem('CapacitorStorage.playbook.device.v2', JSON.stringify(d)); } catch {} }, opts.device);
  await ctx.addInitScript(() => { window.__lt = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch {} });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 50000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0; page.on('response', async (r) => { const l = +(r.headers()['content-length'] || 0); bytes += l; });
  return { ctx, page, kb: () => Math.round(bytes / 1024) };
}
const lt = async (page) => page.evaluate(() => { const a = window.__lt; window.__lt = []; return { adet: a.length, enUzun: Math.max(0, ...a), toplam: a.reduce((x, y) => x + y, 0) }; });
const pad = async (page, d) => { for (const c of d) await page.getByRole('button', { name: c, exact: true }).click(); };
// Mağaza telefonu: ilk açılış → barista girişi → Akademi → sınav
{
  const { ctx, page } = await throttled({ device: EK.modaDevice });
  let t = Date.now();
  await page.goto(P + '/#/', { timeout: 120000 }); await page.getByText('Kim çalışıyor?').waitFor({ timeout: 180000 });
  res.telefon_ilkAcilis_ms = Date.now() - t; res.telefon_ilkAcilis_longtask = await lt(page);
  t = Date.now();
  await page.getByRole('button', { name: /Mehmet Kaya/ }).first().click(); await pad(page, '1925');
  await page.getByText('Çıkış').first().waitFor({ timeout: 180000 }); await ready(page, 180000);
  res.barista_giris_ms = Date.now() - t; res.barista_giris_longtask = await lt(page);
  t = Date.now();
  await page.getByRole('link', { name: /Akademi/ }).first().click().catch(async () => page.goto(P + '/#/akademi'));
  await page.waitForURL(/akademi/); await ready(page, 120000);
  res.akademi_ms = Date.now() - t; res.akademi_longtask = await lt(page);
  t = Date.now();
  await page.goto(P + '/#/sinav/acilis-kapanis'); const b = page.getByRole('button', { name: /^(Başla|Kaldığım yerden devam et)$/ });
  await b.waitFor({ timeout: 120000 }); res.sinavEkrani_ms = Date.now() - t;
  t = Date.now(); await b.click(); await page.getByText('Kalan süre').waitFor({ timeout: 180000 });
  res.sinavBasla_ms = Date.now() - t; res.sinav_longtask = await lt(page);
  // soru geçişi tepkisi
  t = Date.now(); await page.locator('div.flex.flex-col.gap-2\\.5 > button').first().click(); await page.getByRole('button', { name: /Sonraki/ }).click(); await page.waitForTimeout(50);
  res.soruGecisi_ms = Date.now() - t;
  await ctx.close();
}
// Panel: yönetici girişi → Genel bakış
{
  const { ctx, page, kb } = await throttled({ vp: { width: 1280, height: 800 } });
  let t = Date.now();
  await page.goto(P + '/#/yonetici-girisi', { timeout: 120000 }); await page.locator('input[type=email]').waitFor({ timeout: 180000 });
  res.panel_girisEkrani_ms = Date.now() - t;
  const [email, pw] = STAFF.director;
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(pw);
  t = Date.now();
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.waitForURL((u) => !u.hash.includes('yonetici-girisi'), { timeout: 180000 }); await ready(page, 180000);
  await page.getByText('Son 7 günde sınav').waitFor({ timeout: 180000 }).catch(() => {});
  res.panel_genelBakis_ms = Date.now() - t; res.panel_longtask = await lt(page); res.panel_indirilen_kb = kb();
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
save('yavas.json', res);
await browser.close();
process.exit(0);
