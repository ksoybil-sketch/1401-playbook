// 4.5b Çevrimdışı birikenler çıkıştan sonra ne oluyor + 4.6 bekleyen yazım varken uygulama verisi silinir.
import { chromium, save, txt, ready, EK } from './lib.mjs';
import { db } from './admin.mjs';
const { FieldValue } = await import('firebase-admin/firestore');
const SKIP = !!process.env.SKIP_A;
const P = 'http://localhost:5180';
const res = {};
const pad = async (page, d) => { for (const c of d) await page.getByRole('button', { name: c, exact: true }).click(); };
const login = async (page, name) => { await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 }); await page.waitForTimeout(600); await page.getByRole('button', { name: new RegExp(name) }).first().click(); await pad(page, '1925'); await page.getByText('Çıkış').first().waitFor({ timeout: 30000 }); await ready(page); await page.waitForTimeout(1500); };
const lessonOf = async (b, l) => (await db.doc('progress/' + b).get()).data()?.lessons?.[l] || null;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(P + '/#/');
await page.evaluate((d) => localStorage.setItem('CapacitorStorage.playbook.device.v2', JSON.stringify(d)), EK.modaDevice);
await page.reload(); await page.waitForTimeout(2500); await page.reload();
if (!SKIP) {
await login(page, 'Ayşe Demir');
await db.doc('progress/demo-ayse').update({ 'lessons.hikayemiz': null });
await page.goto(P + '/#/ders/hikayemiz'); await ready(page); await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.getByRole('button', { name: /Tamamladım/ }).first().click(); await page.waitForTimeout(1200);
await page.goto(P + '/#/talepler'); await page.waitForTimeout(2000);
try {
  await page.getByRole('button', { name: /^Yeni( talep)?$/ }).first().click(); await page.waitForTimeout(600);
  await page.locator('[role=dialog] select').first().selectOption({ index: 1 });
  await page.locator('[role=dialog] input').first().fill('Çevrimdışı talep 2');
  await page.locator('[role=dialog] textarea').first().fill('İnternetsiz.');
  await page.getByRole('button', { name: 'Gönder' }).click(); await page.waitForTimeout(5000);
  res.talepEkrani = (await txt(page)).match(/(bağlantı[^\n]*|kuyru[^\n]*|iletildi[^\n]*)/i)?.[0] || 'mesaj yok';
} catch (e) { res.talepEkrani = 'hata ' + e.message.slice(0, 80); }
await page.getByRole('button', { name: 'Çıkış' }).first().click(); await page.waitForTimeout(5000);
await ctx.setOffline(false);
const retry = page.getByRole('button', { name: /Tekrar dene/ });
if (await retry.count()) await retry.first().click();
await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 }); await page.waitForTimeout(10000);
res.cikistanSonra_sunucu = { ders: !!(await lessonOf('demo-ayse', 'hikayemiz')), talep: (await db.collection('requests').where('title', '==', 'Çevrimdışı talep 2').get()).size };
// başka barista girer çıkar (sıra boşalır mı?)
await login(page, 'Zeynep Arslan'); await page.getByRole('button', { name: 'Çıkış' }).first().click(); await page.waitForTimeout(4000);
res.baskaBaristaSonra_sunucu = { ders: !!(await lessonOf('demo-ayse', 'hikayemiz')), talep: (await db.collection('requests').where('title', '==', 'Çevrimdışı talep 2').get()).size };
await login(page, 'Ayşe Demir'); await page.waitForTimeout(8000);
res.ayseTekrarGirince_sunucu = { ders: !!(await lessonOf('demo-ayse', 'hikayemiz')), talep: (await db.collection('requests').where('title', '==', 'Çevrimdışı talep 2').get()).size };
await page.getByRole('button', { name: 'Çıkış' }).first().click(); await page.waitForTimeout(3000);
console.log(JSON.stringify(res));
}
// 4.6 — Mehmet çevrimdışı ders tamamlar; telefonun uygulama verisi silinir
await login(page, 'Mehmet Kaya');
await db.doc('progress/demo-mehmet').update({ 'lessons.hikayemiz': FieldValue.delete() }); await page.waitForTimeout(1500);
await page.goto(P + '/#/ders/hikayemiz'); await ready(page); await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.getByRole('button', { name: /Tamamladım/ }).first().click(); await page.waitForTimeout(1200);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Storage.clearDataForOrigin', { origin: P, storageTypes: 'all' });
await ctx.setOffline(false);
await page.reload(); await page.waitForTimeout(7000);
res.veriSilinince_ekran = (await txt(page)).split('\n').slice(0, 5).join(' | ');
res.veriSilinince_ders = !!(await lessonOf('demo-mehmet', 'hikayemiz'));
const phones = (await db.collection('users').where('storeId', '==', 'moda-cadde').where('role', '==', 'store').get()).docs.map((d) => d.data()).filter((u) => u.active);
res.modaAktifTelefonHesabi = phones.length;
console.log(JSON.stringify(res, null, 1));
save('cevrimdisi2.json', res);
await browser.close();
process.exit(0);
