// 4.2 Telefon saati yanlış: 2 gün ileri, 3 saat geri. Sınav süresi, hak penceresi, eşleştirme kodu.
import { chromium, baristaLogin, BASE, ready, save, grab, txt, phoneCtx, answerN, startExamUI, staffLogin } from './lib.mjs';
import { db, DAY } from './admin.mjs';
const H = 3600000;
const res = {};
const browser = await chromium.launch();
const clean = async (b) => { for (const d of (await db.collection('attempts').where('baristaId', '==', b).get()).docs) if (!d.data().submittedAt) await d.ref.delete(); };
await clean('demo-mehmet'); await clean('demo-ayse');

// A) Mehmet: telefon 2 gün ileri, sınav başlar, 3 soru cevaplar, uygulamayı kapatır.
{
  const ctx = await phoneCtx(browser, { at: Date.now() + 2 * DAY });
  const page = await ctx.newPage();
  await baristaLogin(page, 'Mehmet Kaya', '1925');
  await startExamUI(page, BASE, 'sube-duzeni');
  await answerN(page, 3); await page.waitForTimeout(2500);
  await ctx.close();
  const a = (await db.collection('attempts').where('baristaId', '==', 'demo-mehmet').where('moduleId', '==', 'sube-duzeni').get()).docs.map((d) => d.data()).find((x) => !x.submittedAt);
  res.A_ileri = { startedAt_minus_real_h: +((a.startedAt - Date.now()) / H).toFixed(2), deadline_minus_real_h: +((a.deadline - Date.now()) / H).toFixed(2), answers: Object.keys(a.answers || {}).length };
}
// B) Aynı barista, doğru saatli başka telefon (ya da saat düzeltildi): modül ve sınav ekranı.
{
  const ctx = await phoneCtx(browser, {});
  const page = await ctx.newPage();
  await baristaLogin(page, 'Mehmet Kaya', '1925');
  await page.goto(BASE + '/#/modul/sube-duzeni'); await ready(page); await page.waitForTimeout(1200);
  res.B_dogru_saat_modul = await grab(page, /(Bu hafta[^\n]*|Haftalık[^\n]*)/);
  await page.goto(BASE + '/#/sinav/sube-duzeni'); await ready(page); await page.waitForTimeout(1500);
  res.B_dogru_saat_sinav = await grab(page, /Yarım kalan sınavın var[^\n]*/);
  await ctx.close();
}
// C) Ayşe: telefon 3 saat geri, sınav başlar, 3 cevap; sonra doğru saatli cihazda açar.
{
  const ctx = await phoneCtx(browser, { at: Date.now() - 3 * H });
  const page = await ctx.newPage();
  await baristaLogin(page, 'Ayşe Demir', '1925');
  await startExamUI(page, BASE, 'urun-kabul-depo');
  await answerN(page, 3); await page.waitForTimeout(2500);
  res.C_geri_ekranda = await grab(page, /Kalan süre\n?[^\n]*/);
  await ctx.close();
  const q = await db.collection('attempts').where('baristaId', '==', 'demo-ayse').where('moduleId', '==', 'urun-kabul-depo').get();
  const a = q.docs.map((d) => ({ id: d.id, ...d.data() })).find((x) => !x.submittedAt);
  res.C_geri = { id: a.id, deadline_minus_real_min: Math.round((a.deadline - Date.now()) / 60000) };
  const ctx2 = await phoneCtx(browser, {});
  const p2 = await ctx2.newPage();
  await baristaLogin(p2, 'Ayşe Demir', '1925');
  await p2.waitForTimeout(4000);
  const after = (await db.doc('attempts/' + a.id).get()).data();
  res.C_dogru_cihazda = { submitted: !!after.submittedAt, timedOut: after.timedOut, score: after.score, passed: after.passed, voided: !!after.voided, total: after.total };
  await ctx2.close();
}
// D) Süre sunucuda denetlenmiyor: süresi 30 dk önce dolmuş açık deneme; telefon saati 1 saat geri → devam + teslim.
{
  const now = Date.now();
  const src = (await db.collection('questions').where('moduleId', '==', 'misafir-karsilama').limit(10).get()).docs;
  const ids = src.map((d) => d.id);
  const orders = Object.fromEntries(src.map((d) => [d.id, d.data().options.map((_, i) => i)]));
  const id = 'demo-zeynep_misafir-karsilama_sinav_99';
  await db.doc('attempts/' + id).set({ baristaId: 'demo-zeynep', baristaName: 'Zeynep Arslan', storeId: 'moda-cadde', moduleId: 'misafir-karsilama', moduleTitle: 'Karşılama', passScore: 80, lessonId: null,
    startedAt: now - 45 * 60000, deadline: now - 30 * 60000, total: ids.length, questionIds: ids, orders, answers: {}, submittedAt: null });
  const ctx = await phoneCtx(browser, { at: now - H });
  const page = await ctx.newPage();
  await baristaLogin(page, 'Zeynep Arslan', '1925');
  await page.goto(BASE + '/#/sinav/misafir-karsilama'); await ready(page); await page.waitForTimeout(1500);
  res.D_intro = await grab(page, /Yarım kalan sınavın var[^\n]*/);
  // doğru cevapları işaretle (kopya senaryosu: süre geçmiş, saat geri)
  const ans = Object.fromEntries(src.map((d) => [d.id, d.data().answer]));
  await startExamUI(page, BASE, 'misafir-karsilama');
  for (let i = 0; i < ids.length; i++) {
    const prompt = (await page.locator('h2').first().innerText()).trim();
    const qd = src.find((d) => d.data().prompt.trim() === prompt);
    await page.locator('div.flex.flex-col.gap-2\\.5 > button').nth(qd ? ans[qd.id] : 0).click();
    await page.waitForTimeout(150);
    const nx = page.getByRole('button', { name: /Sonraki/ });
    if (await nx.count()) await nx.click(); else break;
    await page.waitForTimeout(150);
  }
  await page.getByRole('button', { name: 'Sınavı bitir' }).click();
  await page.waitForTimeout(4000);
  const d = (await db.doc('attempts/' + id).get()).data();
  res.D_sonuc = { submitted: !!d.submittedAt, score: d.score, passed: d.passed, timedOut: d.timedOut, submittedAfterDeadline_min: d.submittedAt ? Math.round((Date.now() - d.deadline) / 60000) : null, clientSubmittedAt_vs_real_min: d.submittedAt ? Math.round((d.submittedAt - Date.now()) / 60000) : null };
  await ctx.close();
}
// E) Yönetici bilgisayarının saati 3 saat geri: telefon eşleştirme kodu üretilir, telefon kodu girer.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  await ctx.clock.install({ time: Date.now() - 3 * H });
  const page = await ctx.newPage();
  await staffLogin(page, 'regional');
  await page.goto(BASE + '/#/magazalar/pendik'); await ready(page); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Telefon bağla/ }).click();
  await page.waitForTimeout(2500);
  const code = (await txt(page)).match(/\b(\d{6})\b/)?.[1] || (await page.locator('[role=dialog]').innerText()).replace(/\s/g, '').match(/\d{6}/)?.[0];
  await ctx.close();
  const pc = (await db.doc('pairingCodes/' + code).get()).data();
  res.E_kod = { code, expiresAt_minus_real_min: Math.round((pc.expiresAt - Date.now()) / 60000) };
  const ph = await phoneCtx(browser, { device: null });
  const p = await ph.newPage();
  await p.goto(BASE + '/#/'); await ready(p); await p.waitForTimeout(1500);
  for (const c of code) await p.getByRole('button', { name: c, exact: true }).click();
  await p.waitForTimeout(3500);
  res.E_telefon = (await grab(p, /(Kod geçersiz[^\n]*|Kim çalışıyor\?)/)) || (await txt(p)).slice(0, 200);
  await ph.close();
}
await browser.close();
console.log(JSON.stringify(res, null, 1));
save('zaman-saat.json', res);
process.exit(0);
