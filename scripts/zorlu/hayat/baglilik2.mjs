// 4.4 (sonra) Kayıtların bağlılığı — düzeltmelerden sonra: pasif mağaza kapalı, taşınan baristanın sınavı yeni şubede,
// yayından kalkan yolun açık sınavı geçersiz (süre gerçek sunucu saatiyle geçirilir), aynı e-posta mesajı.
// Kaynak: baglilik.mjs. mağaza pasif, açık sınavla taşınan barista, yayından kalkan yol, aynı e-posta iki rolde.
import { chromium, baristaLogin, BASE, ready, save, txt, grab, phoneCtx, answerN, startExamUI, staffLogin } from './lib.mjs';
import { db, DAY, device, task } from './admin.mjs';
const res = {};
const browser = await chromium.launch();
const finishExam = async (page) => {
  const n = +(await page.locator('span.tnum').first().innerText()).split('/')[1];
  const cur = +(await page.locator('span.tnum').first().innerText()).split('/')[0];
  for (let i = cur; i <= n; i++) {
    await page.locator('div.flex.flex-col.gap-2\\.5 > button').first().click(); await page.waitForTimeout(150);
    const nx = page.getByRole('button', { name: /Sonraki/ }); if (await nx.count()) { await nx.click(); await page.waitForTimeout(150); }
  }
  page.once('dialog', (d) => d.accept().catch(() => {}));
  await page.getByRole('button', { name: 'Sınavı bitir' }).click(); await page.waitForTimeout(4500);
};
const devB = await device('bagdat', 'Bağdat Caddesi'), devP = await device('pendik', 'Pendik'), devC = await device('cubuklu', 'Çubuklu');
for (const b of ['demo-nisa', 'demo-sude', 'demo-mehmet']) for (const d of (await db.collection('attempts').where('baristaId', '==', b).get()).docs) if (!d.data().submittedAt) await d.ref.delete();

// B1 — Mağaza pasifleştirilir
if (!process.env.SKIP_B1) {
await task('hayat-bagdat-gecikmis', 'bagdat', 'module', 'hos-geldin', 'Hoş geldin modülü', Date.now() - DAY);
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage(); page.on('dialog', (d) => d.accept());
  await staffLogin(page, 'regional');
  await page.goto(BASE + '/#/magazalar/bagdat'); await ready(page); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Pasifleştir' }).click(); await page.waitForTimeout(1500);
  res.B1_store_active = (await db.doc('stores/bagdat').get()).data().active;
  const bar = (await db.collection('baristas').where('storeId', '==', 'bagdat').get()).docs.map((d) => `${d.id}:${d.data().active}`);
  const ph = (await db.doc('users/' + devB.uid).get()).data().active;
  res.B1_sonrasi = { baristalar: bar, telefon_aktif: ph };
  await ctx.close();
}
{
  const ctx = await phoneCtx(browser, { device: devB });
  const page = await ctx.newPage();
  await page.goto(BASE + '/#/'); await ready(page); await page.waitForTimeout(3000);
  res.B1_telefon_ekran = (await txt(page)).split('\n').slice(0, 6).join(' | ');
  res.B1_kim_calisiyor_var = (await txt(page)).includes('Kim çalışıyor?');
  // Kurallar: pasif mağazanın telefonu ders okuyabiliyor mu, Nisa giriş yapıp sınav açabiliyor mu?
  res.B1_kural = await page.evaluate(async () => {
    const fs = await import('/node_modules/.vite/deps/firebase_firestore.js').catch(() => null);
    const { db, auth } = await import('/src/api/firebase.ts');
    const { getDocs, collection, getDocFromServer, doc } = fs || await import('firebase/firestore');
    const out = { uid: auth.currentUser?.uid || null };
    try { await getDocs(collection(db, 'modules')).then((s) => { if (s.metadata.fromCache) throw new Error('önbellek'); }); out.icerik = 'izin'; } catch (e) { out.icerik = 'red:' + (e.code || e.message); }
    try { await getDocFromServer(doc(db, 'stores', 'bagdat')); out.kendiMagaza = 'izin'; } catch (e) { out.kendiMagaza = 'red:' + (e.code || e.message); }
    return out;
  }).catch((e) => 'evaluate: ' + e.message.slice(0, 120));
  await ctx.close();
}
{
  // Aynı anda açık bir barista oturumu: mağaza pasifleşince oturum kapanır mı (canlı izleme)?
  await db.doc('stores/bagdat').update({ active: true });
  const ctx = await phoneCtx(browser, { device: devB });
  const page = await ctx.newPage();
  await baristaLogin(page, 'Nisa Güneş', '1925');
  res.B1_once_acik = (await txt(page)).includes('Nisa');
  await db.doc('stores/bagdat').update({ active: false });
  await page.waitForTimeout(5000);
  res.B1_canli_kapandi = (await txt(page)).split('\n').slice(0, 4).join(' | ');
  await db.doc('stores/bagdat').update({ active: true });
  await page.waitForTimeout(5000);
  res.B1_yeniden_acilinca = (await txt(page)).includes('Kim çalışıyor?') ? 'Kim çalışıyor?' : (await txt(page)).split('\n').slice(0, 3).join(' | ');
  await db.doc('stores/bagdat').update({ active: false });
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await staffLogin(page, 'director');
  await page.waitForTimeout(3000);
  const t = await txt(page);
  res.B1_genel_bakis = t.split('\n').filter((l) => /Bağdat|gecikmiş|Son 7 günde sınav|Gecik/i.test(l)).slice(0, 8);
  await page.goto(BASE + '/#/gorevler'); await ready(page); await page.waitForTimeout(2000);
  res.B1_gorevler_bagdat = (await txt(page)).split('\n').filter((l) => /Bağdat|Hoş geldin modülü/.test(l)).slice(0, 5);
  await page.goto(BASE + '/#/baristalar'); await ready(page); await page.waitForTimeout(1500);
  res.B1_baristalar = (await txt(page)).split('\n').filter((l) => /Nisa|Emir/.test(l)).slice(0, 4);
  await ctx.close();
}
await db.doc('stores/bagdat').update({ active: true });
await db.doc('assignments/hayat-bagdat-gecikmis').delete();
save('baglilik2-b1.json', res);
}

// B2 — Barista açık sınavla başka şubeye taşınır (Sude: Pendik → Çubuklu)
{
  let ctx = await phoneCtx(browser, { device: devP });
  let page = await ctx.newPage();
  await baristaLogin(page, 'Sude Korkmaz', '1925');
  await startExamUI(page, BASE, 'urun-kabul-depo'); await answerN(page, 3); await page.waitForTimeout(2500);
  await ctx.close();
  const st = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
  const sp = await st.newPage();
  await staffLogin(sp, 'regional');
  const sd = { id: 'demo-sude', ...(await db.doc('baristas/demo-sude').get()).data() };
  res.B2_tasima = await sp.evaluate(async (b) => {
    const { backend } = await import('/src/api/backend.ts');
    try { await backend.updateBarista(b, { storeId: 'cubuklu' }); return 'ok'; } catch (e) { return 'hata: ' + e.message; }
  }, sd).catch((e) => 'evaluate hata: ' + e.message.slice(0, 200));
  save('baglilik2.json', res);
  await st.close();
  ctx = await phoneCtx(browser, { device: devC });
  page = await ctx.newPage();
  await baristaLogin(page, 'Sude Korkmaz', '1925');
  await page.goto(BASE + '/#/sinav/urun-kabul-depo'); await ready(page); await page.waitForTimeout(1500);
  res.B2_yeni_subede = await grab(page, /Yarım kalan sınavın var[^\n]*/);
  await startExamUI(page, BASE, 'urun-kabul-depo'); await finishExam(page);
  const a = (await db.collection('attempts').where('baristaId', '==', 'demo-sude').where('moduleId', '==', 'urun-kabul-depo').get()).docs.map((d) => d.data()).sort((x, y) => y.startedAt - x.startedAt)[0];
  res.B2_deneme = { storeId: a.storeId, submitted: !!a.submittedAt, score: a.score };
  await ctx.close();
}

// B3 — Eğitim yolu yayından kalkar; açık sınav ve açık görev varken
await task('hayat-yol-gorev', 'moda-cadde', 'module', 'soguk-kahveler', 'Soğuk kahveler modülü', Date.now() + 2 * DAY, 'demo-mehmet');
{
  let ctx = await phoneCtx(browser, {});
  let page = await ctx.newPage();
  await baristaLogin(page, 'Mehmet Kaya', '1925');
  await startExamUI(page, BASE, 'soguk-kahveler'); await answerN(page, 3); await page.waitForTimeout(2500);
  await ctx.close();
  await db.doc('tracks/icecek-standartlari').update({ published: false });
  ctx = await phoneCtx(browser, {});
  page = await ctx.newPage();
  await baristaLogin(page, 'Mehmet Kaya', '1925');
  res.B3_ana_sayfa = (await txt(page)).split('\n').filter((l) => /Soğuk|görev|Görev/.test(l)).slice(0, 5);
  await page.goto(BASE + '/#/sinav/soguk-kahveler'); await ready(page); await page.waitForTimeout(1500);
  res.B3_sinav_ekrani = (await txt(page)).split('\n').slice(0, 6).join(' | ');
  await ctx.close();
  // süre doldu: sunucu saati gerçek zaman olduğu için son teslim veritabanında geçmişe çekilir
  {
    const q = await db.collection('attempts').where('baristaId', '==', 'demo-mehmet').where('moduleId', '==', 'soguk-kahveler').get();
    for (const d of q.docs) if (!d.data().submittedAt) await d.ref.update({ deadline: Date.now() - 60000, startedAt: Date.now() - 30 * 60000 });
  }
  ctx = await phoneCtx(browser, {});
  page = await ctx.newPage();
  await baristaLogin(page, 'Mehmet Kaya', '1925'); await page.waitForTimeout(4000);
  const a = (await db.collection('attempts').where('baristaId', '==', 'demo-mehmet').where('moduleId', '==', 'soguk-kahveler').get()).docs.map((d) => d.data()).sort((x, y) => y.startedAt - x.startedAt)[0];
  res.B3_deneme = { submitted: !!a.submittedAt, timedOut: a.timedOut, score: a.score, passed: a.passed, voided: !!a.voided };
  await ctx.close();
  await db.doc('tracks/icecek-standartlari').update({ published: true });
  await db.doc('assignments/hayat-yol-gorev').delete();
}

// B4 — Aynı e-posta iki rolde (kurul üyesi Kahve Operasyonu'na da eklenmek isteniyor)
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await staffLogin(page, 'director');
  res.B4 = await page.evaluate(async () => {
    const { backend, errorText } = await import('/src/api/backend.ts');
    try { await backend.createStaff('Ogün (ops)', 'ogunturanli@1401coffee.com', 'ops'); return 'eklendi'; } catch (e) { return errorText(e); }
  });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(res, null, 1));
save('baglilik2.json', res);
process.exit(0);
