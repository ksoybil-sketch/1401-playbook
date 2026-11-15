// 3.2 Yoğun öğlende paylaşılan telefon: hızlı giriş/çıkış, çıkışı unutan, sınavda çıkış/oturum kapanması.
import { chromium, BASE, ready, save, txt, phoneCtx, answerN, startExamUI, EK } from './lib.mjs';
import { db } from './admin.mjs';
const res = {};
const pad = async (page, digits) => { for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click(); };
const browser = await chromium.launch();
const ids = ["kb-04", "kb-05", "kb-06", "kb-07", "kb-08", "kb-09"];
const people = [];
for (const id of ids) people.push({ id, name: (await db.doc('baristas/' + id).get()).data().name });
for (const p of people) for (const d of (await db.collection('attempts').where('baristaId', '==', p.id).get()).docs) await d.ref.delete();
const ctx = await phoneCtx(browser, { device: EK.kalDevice });
const page = await ctx.newPage();
await page.goto(BASE + '/#/'); await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 });
// P1 — 6 kişi, 2 tur hızlı giriş/çıkış
res.P1 = [];
if (!process.env.SKIP_P1) for (let round = 0; round < 2; round++) for (const p of people) {
  await page.getByText('Kim çalışıyor?').waitFor({ timeout: 30000 });
  const t0 = Date.now();
  await page.getByRole('button', { name: new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  await pad(page, '1925');
  const seen = new Set();
  let ok = false;
  for (let i = 0; i < 200; i++) {
    const head = await page.evaluate(() => document.body.innerText.slice(0, 160)).catch(() => '');
    people.forEach((q) => { if (q.id !== p.id && head.includes(q.name)) seen.add(q.name); });
    if (head.includes(p.name) && head.includes('Çıkış')) { ok = true; break; }
    await page.waitForTimeout(50);
  }
  const ms = Date.now() - t0;
  await page.getByRole('button', { name: 'Çıkış' }).first().click();
  const t1 = Date.now();
  await page.getByText('Kim çalışıyor?').waitFor({ timeout: 30000 });
  res.P1.push({ who: p.name.slice(0, 14), girisMs: ms, cikisMs: Date.now() - t1, ok, baskasiGorundu: [...seen] });
}
console.log('P1', JSON.stringify(res.P1));
save('paylasilan-p1.json', res);
await ctx.close();
for (const id of ['demo-zeynep', 'demo-mehmet']) for (const d of (await db.collection('attempts').where('baristaId', '==', id).where('moduleId', '==', 'acilis-kapanis').get()).docs) await d.ref.delete();
const ctx2 = await phoneCtx(browser, { at: Date.now() });
const page2 = await ctx2.newPage();
await page2.goto(BASE + '/#/'); await page2.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 });
people.splice(0, 2, { id: 'demo-zeynep', name: 'Zeynep Arslan' }, { id: 'demo-mehmet', name: 'Mehmet Kaya' });

// P2 — sınavda 2 cevap verip hemen Çıkış (başkası sırada); cevaplar kaydedildi mi?
{
  const p = people[0];
  await page2.getByRole('button', { name: new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click(); await pad(page2, '1925');
  await page2.getByText('Çıkış').first().waitFor({ timeout: 30000 }); await ready(page2);
  try { await startExamUI(page2, BASE, 'acilis-kapanis'); } catch (e) { console.log('P2 ekran', (await txt(page2)).slice(0, 400)); throw e; }
  const headerExit = await page2.getByRole('button', { name: 'Çıkış' }).count();
  await answerN(page2, 2);
  let how;
  if (headerExit) { await page2.getByRole('button', { name: 'Çıkış' }).first().click(); how = 'üst çubuk Çıkış'; }
  else { await ctx2.clock.fastForward(10 * 60 * 1000 + 5000); how = 'hareketsizlik (10 dk)'; }
  await page2.getByText('Kim çalışıyor?').waitFor({ timeout: 30000 }); await page2.waitForTimeout(3000);
  const a = (await db.collection('attempts').where('baristaId', '==', p.id).get()).docs.map((d) => d.data()).find((x) => !x.submittedAt);
  res.P2 = { sinavdaUstCikisVar: headerExit > 0, cikisYolu: how, kaydedilenCevap: a ? Object.keys(a.answers || {}).length : null, verilenCevap: 2 };
  console.log('P2', JSON.stringify(res.P2));
}
// P3 — çıkışı unutan: 2. kişi telefonu aldığında ekranda ne var, sınava başlayabiliyor mu (kimlik sorulmadan)?
{
  const p = people[1];
  await page2.getByRole('button', { name: new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click(); await pad(page2, '1925');
  await page2.getByText('Çıkış').first().waitFor({ timeout: 30000 }); await ready(page2);
  // ... 3 dk sonra başka biri telefonu alır
  await page2.waitForTimeout(500);
  await page2.goto(BASE + '/#/sinav/acilis-kapanis'); await ready(page2); await page2.waitForTimeout(800);
  const askPin = (await txt(page2)).match(/PIN/i);
  await page2.getByRole('button', { name: /^Başla$/ }).click(); await page2.getByText('Kalan süre').waitFor({ timeout: 30000 });
  res.P3 = { kimlikSoruldu: !!askPin, sinavKimeAcildi: p.name, bosta_kapanma_dk: 10 };
  console.log('P3', JSON.stringify(res.P3));
}
await ctx2.close();
await browser.close();
save('paylasilan.json', res);
process.exit(0);
