// 4.1 (sonra) Haftalık hak takvim haftası mı? Sunucu saati gerçek zaman olduğundan
// (uygulama artık telefon saatine bakmıyor) denemeler gerçek zamana göre yerleştirilir:
//  A) 20 deneme GEÇEN takvim haftasının son saatinde (Pazar 23:55, kayan 7 günün içinde) → hak açık olmalı.
//  B) 20 deneme BU haftanın Pazartesi 00:05'inde → hak dolu, "Pazartesi (gelecek) yenilenir".
//  Telefon UTC'de ve saati 2 gün ileri olsa da aynı metin.
import { chromium, baristaLogin, EK, BASE, ready, save, grab } from './lib.mjs';
import { db } from './admin.mjs';
const MOD = 'acilis-kapanis', B = 'demo-zeynep';
const H = 3600000, DAY = 24 * H;
const istNow = new Date(Date.now() + 3 * H);
const monday = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - ((istNow.getUTCDay() + 6) % 7) * DAY - 3 * H;
async function put(base) {
  for (const d of (await db.collection('attempts').where('baristaId', '==', B).get()).docs) await d.ref.delete();
  for (let i = 0; i < 20; i++) {
    const s = base + i * 10000;
    await db.doc(`attempts/${B}_${MOD}_sinav_${i + 1}`).set({ baristaId: B, baristaName: 'Zeynep Arslan', storeId: 'moda-cadde', moduleId: MOD, moduleTitle: 'Açılış', passScore: 80, lessonId: null,
      startedAt: s, deadline: s + 18 * 60000, submittedAt: s + 60000, total: 12, correct: 6, score: 50, passed: false, mistakes: [], answers: {}, questionIds: [], orders: {} });
  }
}
const res = { pazartesi: new Date(monday).toISOString() };
const browser = await chromium.launch();
for (const [label, base, tz, skew] of [
  ['A_gecen_hafta_pazar_2355', monday - 5 * 60000 - 200000, 'Europe/Istanbul', 0],
  ['B_bu_hafta_pzt_0005', monday + 5 * 60000, 'Europe/Istanbul', 0],
  ['B_UTC_saat_2gun_ileri', monday + 5 * 60000, 'UTC', 2 * DAY]
]) {
  await put(base);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: tz });
  await ctx.addInitScript((dev) => { try { localStorage.setItem('CapacitorStorage.playbook.device.v2', JSON.stringify(dev)); } catch {} }, EK.modaDevice);
  if (skew) await ctx.clock.install({ time: Date.now() + skew });
  const page = await ctx.newPage();
  await baristaLogin(page, 'Zeynep Arslan', '1925');
  await page.goto(BASE + `/#/modul/${MOD}`); await ready(page); await page.waitForTimeout(2000);
  res[label] = await grab(page, /(Bu hafta[^\n]*)/);
  console.log(label, res[label]);
  await ctx.close();
}
await browser.close();
for (const d of (await db.collection('attempts').where('baristaId', '==', B).get()).docs) await d.ref.delete();
save('zaman-hafta2.json', res);
process.exit(0);
