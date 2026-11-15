// 4.5 Uzun çevrimdışılık (2 gün) ve 4.6 uygulama verisi silinmiş telefon — üretim paketi (5180, SW açık).
import { chromium, save, txt, ready, EK } from './lib.mjs';
import { db, DAY } from './admin.mjs';
const S = '/private/tmp/claude-501/-Users-kutays-Desktop-Projects-1401-Playbook/3b587317-47ad-4c62-b2ce-6ae7edec1428/scratchpad';
const P = 'http://localhost:5180';
await fetch(`${P}/__deploy?dir=${S}/buildA`);
const res = {};
const pad = async (page, d) => { for (const c of d) await page.getByRole('button', { name: c, exact: true }).click(); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', isMobile: true, hasTouch: true });
await ctx.addInitScript((d) => { try { if (!localStorage.getItem('CapacitorStorage.playbook.device.v2')) localStorage.setItem('CapacitorStorage.playbook.device.v2', JSON.stringify(d)); } catch {} }, EK.modaDevice);
const t0 = Date.now();
await ctx.clock.install({ time: t0 });
const page = await ctx.newPage();
await page.goto(P + '/#/'); await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 });
await page.waitForTimeout(2000); await page.reload(); await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 });
res.swKontrol = await page.evaluate(() => !!navigator.serviceWorker.controller);
await page.getByRole('button', { name: /Ayşe Demir/ }).first().click(); await pad(page, '1925');
await page.getByText('Çıkış').first().waitFor({ timeout: 30000 }); await ready(page); await page.waitForTimeout(1500);
// ders sayfasını çevrimiçiyken bir kez aç (önbellek)
await page.goto(P + '/#/ders/hikayemiz'); await ready(page); await page.waitForTimeout(1500);
const lessonsBefore = (await db.doc('progress/demo-ayse').get()).data()?.lessons || {};
await db.doc('progress/demo-ayse').update({ 'lessons.hikayemiz': null }).catch(() => {});
await page.waitForTimeout(1500);
await ctx.setOffline(true);
// 1) ders tamamla
await page.getByRole('button', { name: /Tamamladım/ }).first().click().catch(() => {}); await page.waitForTimeout(1500);
res.ders = (await txt(page)).match(/Ders tamamlandı|kaydedilemedi[^\n]*/)?.[0] || null;
// 2) sınav başlat
await page.goto(P + '/#/sinav/acilis-kapanis'); await page.waitForTimeout(2500);
const bas = page.getByRole('button', { name: /^(Başla|Kaldığım yerden devam et)$/ });
if (await bas.count()) { await bas.click(); await page.waitForTimeout(15000); }
res.sinav = (await txt(page)).split('\n').filter((l) => /bağlant|internet|çevrimdışı|başlatılamadı|Kalan süre/i.test(l)).slice(0, 3);
// 3) talep aç
try {
await page.goto(P + '/#/talepler'); await page.waitForTimeout(2000);
await page.getByRole('button', { name: /Yeni talep/ }).click(); await page.waitForTimeout(600);
const sel = page.locator('[role=dialog] select');
if (await sel.count()) await sel.selectOption({ index: 1 });
await page.locator('[role=dialog] input').first().fill('Çevrimdışı talep — buz makinesi');
await page.locator('[role=dialog] textarea').first().fill('İki gün internetsiz kaldık.');
await page.getByRole('button', { name: 'Gönder' }).click(); await page.waitForTimeout(6000);
res.talep = (await txt(page)).match(/(bağlantı gelince[^\n]*|kuyru[^\n]*|iletildi[^\n]*|İnternet[^\n]*)/i)?.[0] || ((await page.locator('[role=dialog]').count()) ? 'pencere açık kaldı' : 'pencere kapandı, mesaj yok');
} catch (e) { res.talep = 'adım başarısız; ekran: ' + (await txt(page).catch(() => '')).slice(0, 250).replace(/\n/g, ' | '); }
// 4) uygulama kapanıp açılıyor (çevrimdışı)
await page.reload().catch(() => {}); await page.waitForTimeout(6000);
res.yenidenAcilis = (await txt(page).catch(() => '')).split('\n').slice(0, 4).join(' | ');
// 5) çıkış (çevrimdışı) ve başka barista girmeye çalışır
const cik = page.getByRole('button', { name: 'Çıkış' });
if (await cik.count()) { await cik.first().click(); await page.waitForTimeout(5000); }
res.cikis = (await txt(page).catch(() => '')).split('\n').slice(0, 4).join(' | ');
// 6) iki gün sonra bağlantı gelir
await ctx.clock.setSystemTime(t0 + 2 * DAY);
await ctx.setOffline(false);
const retry = page.getByRole('button', { name: /Tekrar dene|Yeniden dene/ });
await page.waitForTimeout(3000); if (await retry.count()) await retry.first().click();
await page.waitForTimeout(12000);
res.baglantiSonrasi = (await txt(page).catch(() => '')).split('\n').slice(0, 4).join(' | ');
const pr = (await db.doc('progress/demo-ayse').get()).data()?.lessons || {};
res.sunucu_ders = pr.hikayemiz ? `yazıldı (istemci zamanı - şimdi: ${Math.round((pr.hikayemiz - Date.now()) / 3600000)} sa)` : 'yok';
const rq = (await db.collection('requests').where('title', '==', 'Çevrimdışı talep — buz makinesi').get()).docs.map((d) => d.data());
res.sunucu_talep = rq.map((r) => `${r.status} createdAt-şimdi=${Math.round((r.createdAt - Date.now()) / 3600000)} sa`);
console.log(JSON.stringify(res, null, 1));
save('cevrimdisi.json', res);
// 7) bekleyen yazım varken uygulama verisi silinir
await page.goto(P + '/#/'); await page.waitForTimeout(3000);
const cdp = await ctx.newCDPSession(page);
const storeUsersBefore = (await db.collection('users').where('storeId', '==', 'moda-cadde').where('role', '==', 'store').get()).docs.filter((d) => d.data().active).length;
await cdp.send('Storage.clearDataForOrigin', { origin: P, storageTypes: 'all' });
await page.reload(); await page.waitForTimeout(6000);
res.veriSilindi = (await txt(page)).split('\n').slice(0, 4).join(' | ');
res.aktifMagazaTelefonuSayisi = storeUsersBefore;
console.log('veri silindi:', res.veriSilindi, '| moda aktif telefon hesabı:', storeUsersBefore);
save('cevrimdisi.json', res);
await browser.close();
process.exit(0);
