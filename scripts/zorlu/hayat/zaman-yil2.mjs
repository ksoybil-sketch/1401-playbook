// 4.1 (sonra) "Geçen yıl" dönemi ve yılın ilk haftasındaki öneri (H11). 1 Ocak 2027 00:30, telefon UTC'de.
import { chromium, BASE, ready, save, txt, staffLogin } from './lib.mjs';
import { db, ist } from './admin.mjs';
const mk = async (id, b, at, score) => db.doc('attempts/' + id).set({ baristaId: b, baristaName: b, storeId: 'moda-cadde', moduleId: 'sicak-kahveler', moduleTitle: 'x', passScore: 80, lessonId: null,
  startedAt: at - 600000, deadline: at + 600000, submittedAt: at, total: 10, correct: score / 10, score, passed: score >= 80, mistakes: [], answers: {}, questionIds: [], orders: {} });
for (let i = 0; i < 6; i++) await mk(`yil2-eski-${i}`, 'demo-mehmet', ist('2026-12-31T22:00') + i * 60000, 90);
for (let i = 0; i < 2; i++) await mk(`yil2-yeni-${i}`, 'demo-zeynep', ist('2027-01-01T00:10') + i * 60000, 40);
const res = {};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'tr-TR', timezoneId: 'UTC' });
await ctx.clock.install({ time: ist('2027-01-01T00:30') });
const page = await ctx.newPage();
await staffLogin(page, 'board');
await page.goto(BASE + '/#/?donem=yil'); await ready(page, 60000); await page.waitForTimeout(3000);
res.yil_oneri = (await txt(page)).match(/Yıl yeni başladı[^\n]*/)?.[0] || null;
res.donemler = await page.locator('button').allInnerTexts().then((l) => l.filter((x) => /Son 30|Son 90|Bu ay|Geçen ay|Bu yıl|Geçen yıl/.test(x)));
await page.getByRole('button', { name: 'Geçen yıla bak' }).click().catch(() => {});
await page.waitForTimeout(3500);
res.gecen_yil_url = page.url();
res.gecen_yil = (await txt(page)).split('\n').filter((l) => /sınav|başarı|puan/i.test(l)).slice(0, 4);
await page.goto(BASE + '/#/raporlar?donem=gecen-yil'); await ready(page, 60000); await page.waitForTimeout(2000);
res.rapor = (await txt(page)).match(/Yönetim raporu · [^\n]*/)?.[0] || null;
await browser.close();
for (const id of [0, 1, 2, 3, 4, 5].map((i) => `yil2-eski-${i}`).concat(['yil2-yeni-0', 'yil2-yeni-1'])) await db.doc('attempts/' + id).delete();
console.log(JSON.stringify(res, null, 1));
save('zaman-yil2.json', res);
process.exit(0);
