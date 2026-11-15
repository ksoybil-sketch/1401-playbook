// 4.5c (sonra) H17: mağaza Wi-Fi'ı yokken çevrimdışı PIN girişi (üretim paketi, 5180, service worker açık).
import { chromium, save, txt, ready, EK } from './lib.mjs';
const P = 'http://localhost:5180';
const S = '/private/tmp/claude-501/-Users-kutays-Desktop-Projects-1401-Playbook/3b587317-47ad-4c62-b2ce-6ae7edec1428/scratchpad';
await fetch(`${P}/__deploy?dir=${S}/buildA`);
const res = {};
const pad = async (page, d) => { for (const c of d) await page.getByRole('button', { name: c, exact: true }).click(); };
const pick = async (page, name) => { await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 }); await page.waitForTimeout(600); await page.getByRole('button', { name: new RegExp(name) }).first().click(); await page.waitForTimeout(300); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(P + '/#/');
await page.evaluate((d) => localStorage.setItem('CapacitorStorage.playbook.device.v2', JSON.stringify(d)), EK.modaDevice);
await page.reload(); await page.waitForTimeout(2500); await page.reload();
// İnternetle giriş (PIN özeti cihaza yazılır), ders ve reçete önbelleğe girer
await pick(page, 'Ayşe Demir'); await pad(page, '1925'); await page.getByText('Çıkış').first().waitFor({ timeout: 30000 }); await ready(page); await page.waitForTimeout(2500);
await page.goto(P + '/#/ders/hikayemiz'); await ready(page); await page.waitForTimeout(1500);
await page.goto(P + '/#/'); await page.getByRole('button', { name: 'Çıkış' }).first().click(); await page.waitForTimeout(3000);
res.ozetVar = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('playbook.offlinePin.v1') || '{}')));
// Bağlantı gider
await ctx.setOffline(true);
await page.waitForTimeout(800);
res.magazaEkrani = (await txt(page)).match(/Bağlantı yok\.[^\n]*/)?.[0] || null;
await pick(page, 'Ayşe Demir'); await pad(page, '0000'); await page.waitForTimeout(3000);
res.yanlisPin = (await txt(page)).match(/PIN hatalı[^\n]*|Çok fazla[^\n]*|İnternet[^\n]*/)?.[0] || null;
await pad(page, '1925'); await page.waitForTimeout(3500);
res.cevrimdisiGiris = (await txt(page)).match(/Çevrimdışı mod[^\n]*/)?.[0] || (await txt(page)).slice(0, 200);
await page.goto(P + '/#/ders/hikayemiz'); await page.waitForTimeout(2000);
res.dersAcildi = (await txt(page)).includes('Hikayemiz') || (await txt(page)).slice(0, 120);
await page.getByRole('button', { name: /Tamamladım|Sonraki|Modüle dön/ }).first().click().catch(() => {}); await page.waitForTimeout(800);
res.dersTamamlama = (await txt(page)).match(/Çevrimdışı moddasın[^\n]*/)?.[0] || null;
await page.goto(P + '/#/sinav/hos-geldin'); await page.waitForTimeout(1500);
await page.getByRole('button', { name: /^Başla$/ }).click().catch(() => {}); await page.waitForTimeout(800);
res.sinav = (await txt(page)).match(/Çevrimdışı moddasın[^\n]*|internet bağlantısı[^\n]*/i)?.[0] || null;
await page.goto(P + '/#/receteler'); await page.waitForTimeout(1500);
res.receteler = (await txt(page)).split('\n').filter((l) => l.trim()).slice(0, 4).join(' | ');
// Daha önce bu telefonda girmemiş barista
await page.goto(P + '/#/'); await page.getByRole('button', { name: 'Çıkış' }).first().click(); await page.waitForTimeout(1200);
console.log(JSON.stringify(res)); await pick(page, 'Mehmet Kaya'); await pad(page, '1925'); await page.waitForTimeout(3000);
res.hicGirmemis = (await txt(page)).match(/İnternet bağlantısı yok[^\n]*/)?.[0] || null;
await page.getByRole('button', { name: /Başka barista/ }).click().catch(() => {}); await page.waitForTimeout(500);
// Ayşe yeniden çevrimdışı girer; bağlantı gelince tam girişe geçer
await pick(page, 'Ayşe Demir'); await pad(page, '1925'); await page.waitForTimeout(2500);
await ctx.setOffline(false);
await page.waitForTimeout(20000);
res.baglantiGelince = (await txt(page)).includes('Çevrimdışı mod') ? 'hâlâ çevrimdışı mod' : (await txt(page)).split('\n').slice(0, 3).join(' | ');
res.uid = await page.evaluate(async () => { try { const r = indexedDB; return !!r; } catch { return null; } });
await browser.close();
console.log(JSON.stringify(res, null, 1)); save('cevrimdisi3.json', res); process.exit(0);
