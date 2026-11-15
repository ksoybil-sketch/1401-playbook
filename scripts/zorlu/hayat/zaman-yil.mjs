// 4.1 Yıl dönümü: kurulun "Bu yıl" dönemi, "Bu ay" ve önceki dönem karşılaştırması 1 Ocak 00:30'da.
import { chromium, BASE, ready, save, txt, staffLogin } from './lib.mjs';
import { db, ist } from './admin.mjs';
const mk = async (id, b, mod, at, score) => db.doc('attempts/' + id).set({ baristaId: b, baristaName: b, storeId: 'moda-cadde', moduleId: mod, moduleTitle: mod, passScore: 80, lessonId: null,
  startedAt: at - 600000, deadline: at + 600000, submittedAt: at, total: 10, correct: score / 10, score, passed: score >= 80, mistakes: [], answers: {}, questionIds: [], orders: {} });
for (let i = 0; i < 6; i++) await mk(`yil-eski-${i}`, 'demo-mehmet', 'sicak-kahveler', ist('2026-12-31T22:00') + i * 60000, 90);
for (let i = 0; i < 2; i++) await mk(`yil-yeni-${i}`, 'demo-zeynep', 'sicak-kahveler', ist('2027-01-01T00:10') + i * 60000, 40);
const res = {};
const browser = await chromium.launch();
for (const [label, tz, at, q] of [['IST_1Oca_0030_yil', 'Europe/Istanbul', ist('2027-01-01T00:30'), 'yil'], ['IST_1Oca_0030_ay', 'Europe/Istanbul', ist('2027-01-01T00:30'), 'ay'], ['UTC_ayni_an_yil', 'UTC', ist('2027-01-01T00:30'), 'yil']]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: tz, isMobile: true, hasTouch: true });
  await ctx.clock.install({ time: at });
  const page = await ctx.newPage();
  await staffLogin(page, 'board');
  await page.goto(BASE + `/#/?donem=${q}`); await ready(page, 60000); await page.waitForTimeout(3500);
  const t = await txt(page);
  const lines = t.split('\n').filter((l) => /sınav|önceki|başarı|puan|Bu yıl|Bu ay|Ocak|Aralık/i.test(l)).slice(0, 14);
  res[label] = { clock: new Date(at).toISOString(), tz, lines };
  console.log(label, JSON.stringify(lines));
  await ctx.close();
}
await browser.close();
for (const id of [0, 1, 2, 3, 4, 5].map((i) => `yil-eski-${i}`).concat(['yil-yeni-0', 'yil-yeni-1'])) await db.doc('attempts/' + id).delete();
save('zaman-yil.json', res);
process.exit(0);
