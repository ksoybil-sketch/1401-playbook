// 3.3 Tablette %150 yakınlaştırma (mağaza müdürü, yalnızca dokunma) ve 3.5 kurul üyesi telefondan.
import { chromium, BASE, save, txt, ready, staffLogin, EK, measure, HOUT } from './lib.mjs';
import { db } from './admin.mjs';
const res = {};
const browser = await chromium.launch();
// Tablet 768x1024 @%150 ≈ 512x683 CSS piksel, DPR 1.5
{
  const ctx = await browser.newContext({ viewport: { width: 512, height: 683 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  await ctx.addInitScript((d) => { try { if (!localStorage.getItem('CapacitorStorage.playbook.device.v2')) localStorage.setItem('CapacitorStorage.playbook.device.v2', JSON.stringify(d)); } catch {} }, EK.modaDevice);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/#/'); await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 }); await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Ayşe Demir/ }).first().tap();
  for (const c of '1925') await page.getByRole('button', { name: c, exact: true }).tap();
  await page.getByText('Çıkış').first().waitFor({ timeout: 30000 }); await ready(page); await page.waitForTimeout(1000);
  const m = async (k) => { const r = await measure(page, { mobile: true }); res['tablet_' + k] = { yatayTasma: r.hscroll, ekranDisi: r.offscreen.slice(0, 4), ortulen: r.covered.slice(0, 4), kucuk: r.small.length, kesik: r.cut.slice(0, 4) }; };
  await m('ana');
  await page.goto(BASE + '/#/ekip'); await ready(page); await page.waitForTimeout(1200); await m('ekip');
  // Görev ata (dokunarak)
  const before = (await db.collection('assignments').where('storeId', '==', 'moda-cadde').get()).size;
  await page.getByRole('button', { name: /^Görev$/ }).first().tap(); await page.waitForTimeout(800);
  await m('gorevAta');
  await page.locator('[role=dialog] select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Ata' }).tap(); await page.waitForTimeout(2500);
  res.tablet_gorevAtandi = (await db.collection('assignments').where('storeId', '==', 'moda-cadde').get()).size - before;
  // Talep + fotoğraf
  await page.goto(BASE + '/#/talepler'); await ready(page); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /^Yeni( talep)?$/ }).first().tap(); await page.waitForTimeout(700);
  await m('talepPenceresi');
  await page.locator('[role=dialog] select').first().selectOption({ index: 1 });
  await page.locator('[role=dialog] input:not([type=file])').first().fill('Tablet: buzdolabı ısınıyor');
  await page.locator('[role=dialog] textarea').first().fill('Fotoğraf ekte.');
  const fi = page.locator('[role=dialog] input[type=file]');
  res.tablet_dosyaAlani = await fi.count();
  if (await fi.count()) { await fi.first().setInputFiles(HOUT + 'foto.png'); await page.waitForTimeout(4000); }
  await m('talepFotoSonrasi');
  await page.getByRole('button', { name: 'Gönder' }).tap(); await page.waitForTimeout(4000);
  const rq = (await db.collection('requests').where('title', '==', 'Tablet: buzdolabı ısınıyor').get()).docs.map((d) => d.data());
  res.tablet_talep = rq.map((r) => ({ foto: r.imageUrl ? (r.imageUrl.startsWith('data:') ? `data URL ${Math.round(r.imageUrl.length / 1024)} KB` : r.imageUrl.slice(0, 40)) : null }));
  await ctx.close();
}
// Kurul üyesi telefondan
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', acceptDownloads: true });
  const page = await ctx.newPage();
  await staffLogin(page, 'board');
  const m = async (k) => { const r = await measure(page, { mobile: true }); res['kurul_' + k] = { yatayTasma: r.hscroll, ekranDisi: r.offscreen.slice(0, 4), ortulen: r.covered.slice(0, 3), kucuk: r.small.length, kesik: r.cut.slice(0, 3) }; };
  await page.goto(BASE + '/#/raporlar?donem=yil'); await ready(page, 60000); await page.waitForTimeout(2500); await m('raporlar');
  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.getByText('Mağaza karnesi').first().tap();
  const d = await dl;
  if (d) { const p = HOUT + 'karne.csv'; await d.saveAs(p); const { readFileSync } = await import('fs'); const c = readFileSync(p, 'utf8'); res.kurul_excel = { ad: d.suggestedFilename(), satir: c.split('\r\n').length, ayrac: c.includes(';') ? ';' : ',', bom: c.charCodeAt(0) === 0xfeff }; } else res.kurul_excel = 'indirme yok';
  // soru sor
  await page.goto(BASE + '/#/sorular'); await ready(page); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Yeni soru/ }).first().tap(); await page.waitForTimeout(700);
  const own = page.locator('[role=dialog] input'); if (await own.count()) await own.first().fill('Pendik neden geride?');
  await page.locator('[role=dialog] textarea').first().fill('Pendik sınav başarısı neden düşük?');
  await m('soruPenceresi');
  await page.getByRole('button', { name: /Gönder/ }).tap(); await page.waitForTimeout(3000);
  const q = (await db.collection('boardQuestions').orderBy('createdAt', 'desc').limit(1).get()).docs[0];
  res.kurul_soru = q ? { status: q.data().status, msg: q.data().messages.length } : null;
  if (q) {
    const { FieldValue } = await import('firebase-admin/firestore');
    await q.ref.update({ messages: FieldValue.arrayUnion({ at: Date.now(), by: 'ops', byName: 'Kahve Operasyonu', side: 'ops', text: 'Yeni müdür eğitimde.' }), status: 'answered', lastSide: 'ops', updatedAt: Date.now() });
    const t0 = Date.now();
    const ok = await page.getByText('Yeni müdür eğitimde.').first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    res.kurul_yanitCanliGeldi = ok ? `${Date.now() - t0} ms` : 'yenilemeden görünmedi';
    if (!ok) { const listed = (await txt(page)).match(/Yanıtlandı|yanıt/i)?.[0]; res.kurul_listedeIsaret = listed || null; }
  }
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
save('tablet-kurul.json', res);
await browser.close();
process.exit(0);
