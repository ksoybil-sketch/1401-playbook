// 4.1 Haftalık sınav hakkı: Pazar 23:59 → Pazartesi 00:01 (İstanbul) ve telefon UTC'de.
import { chromium, newCtx, baristaLogin, BAR, EK, BASE, ready, save, grab } from './lib.mjs';
import { db, ist, DAY } from './admin.mjs';
const MOD = 'acilis-kapanis', B = 'demo-zeynep';
// Hafta içine yayılmış 20 deneme (emülatörde hak 20): son 20'si Pazar 15.11 23:50-23:59.
const old = await db.collection('attempts').where('baristaId', '==', B).get();
for (const d of old.docs) await d.ref.delete();
const base = ist('2026-11-15T23:40');
for (let i = 0; i < 20; i++) {
  const s = base + i * 30000;
  await db.doc(`attempts/${B}_${MOD}_sinav_${i + 1}`).set({ baristaId: B, baristaName: 'Zeynep Arslan', storeId: 'moda-cadde', moduleId: MOD, moduleTitle: 'Açılış', passScore: 80, lessonId: null,
    startedAt: s, deadline: s + 18 * 60000, submittedAt: s + 60000, total: 12, correct: 6, score: 50, passed: false, mistakes: [], answers: {}, questionIds: [], orders: {} });
}
const res = {};
const browser = await chromium.launch();
for (const [label, tz, at] of [['IST_pzt_0001', 'Europe/Istanbul', ist('2026-11-16T00:01')], ['UTC_ayni_an', 'UTC', ist('2026-11-16T00:01')], ['IST_pzt_2345', 'Europe/Istanbul', ist('2026-11-16T23:45')], ['IST_pzt_2342_bir_once', 'Europe/Istanbul', ist('2026-11-22T23:39')]]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: tz });
  await ctx.addInitScript((dev) => { try { localStorage.setItem('CapacitorStorage.playbook.device.v2', JSON.stringify(dev)); } catch {} }, EK.modaDevice);
  await ctx.clock.install({ time: at });
  const page = await ctx.newPage();
  await baristaLogin(page, 'Zeynep Arslan', '1925');
  await page.goto(BASE + `/#/modul/${MOD}`); await ready(page); await page.waitForTimeout(1500);
  const slot = await grab(page, /(Bu hafta[^\n]*|Haftalık[^\n]*)/);
  await page.goto(BASE + `/#/sinav/${MOD}`); await ready(page); await page.waitForTimeout(1200);
  const btn = page.getByRole('button', { name: /Başla|Sınava başla/ }).first();
  let startMsg = null;
  if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(2500); startMsg = await grab(page, /(haftalık[^\n]*|Soru 1[^\n]*|1 \/ \d+[^\n]*)/i); }
  res[label] = { clock: new Date(at).toISOString(), tz, slot, startMsg, url: page.url() };
  console.log(label, JSON.stringify(res[label]));
  await ctx.close();
}
await browser.close();
// açılan deneme varsa temizle (sonraki adımlara karışmasın)
const after = await db.collection('attempts').where('baristaId', '==', B).get();
res.after = after.size;
save('zaman-hafta.json', res);
process.exit(0);
