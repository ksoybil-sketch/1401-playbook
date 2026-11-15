// Geçiş 3: formlara uç değerler, çift/üçlü tıklama, Firestore'da sayım.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { chromium, BASE, OUT, EK, newCtx, watch, staffLogin, baristaLogin, measure, shotPath } from './lib.mjs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const db = getFirestore();
const count = async (col, field, val) => (await db.collection(col).where(field, '==', val).get()).size;

const LONG = 'Şğüıöç İĞÜÖÇ ' + 'ŞalgamÇayıÖğütücü'.repeat(30); // ~500
const L500 = LONG.slice(0, 500);
const tag = () => 'ZK' + Date.now().toString(36);
const res = [];
const log = (r) => { res.push(r); console.log(JSON.stringify(r).slice(0, 300)); };
const browser = await chromium.launch();
const toastText = (p) => p.locator('div.fixed.inset-x-0.bottom-24').innerText({ timeout: 1500 }).catch(() => null);

async function T(name, fn) { try { await fn(); } catch (e) { log({ test: name, error: String(e.message || e).slice(0, 300) }); } }

// ---------- Direktör, 390 ----------
{
  const ctx = await newCtx(browser, 's390');
  const p = await ctx.newPage(); const errs = []; watch(p, errs);
  await staffLogin(p, 'director');

  await T('magaza-bos-ad', async () => {
    await p.goto(BASE + '/#/magazalar'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Mağaza', exact: true }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Ekle', exact: true }).click();
    await p.waitForTimeout(300);
    log({ test: 'magaza-bos-ad', toast: await toastText(p), shot: shotPath('form-magaza-bos') });
    await p.screenshot({ path: shotPath('form-magaza-bos') });
  });
  await T('magaza-uzun-cift', async () => {
    const name = 'ZKmagaza ' + L500.slice(0, 480);
    await p.getByRole('dialog').locator('input').first().fill(name);
    await p.getByRole('dialog').locator('input').nth(1).fill('İzmir 🌊☕');
    await p.getByRole('dialog').getByRole('button', { name: 'Ekle', exact: true }).dblclick();
    await p.waitForTimeout(2500);
    const n = await count('stores', 'name', name.trim());
    await p.screenshot({ path: shotPath('form-magaza-uzun'), fullPage: false });
    const m = await measure(p, { mobile: true });
    log({ test: 'magaza-uzun-cift', kayit: n, hscroll: m.hscroll, wide: m.wide.slice(0, 3), offscreen: m.offscreen.slice(0, 3) });
    // ayrıntı sayfası
    const id = (await db.collection('stores').where('name', '==', name.trim()).get()).docs[0]?.id;
    if (id) {
      await p.goto(BASE + '/#/magazalar/' + id); await p.waitForTimeout(2000);
      const m2 = await measure(p, { mobile: true });
      await p.screenshot({ path: shotPath('form-magaza-uzun-detay') });
      log({ test: 'magaza-uzun-detay', id, hscroll: m2.hscroll, wide: m2.wide.slice(0, 3), offscreen: m2.offscreen.slice(0, 5), covered: m2.covered.slice(0, 5) });
      res.longStore = id;
    }
  });

  await T('barista-uzun-cift', async () => {
    await p.goto(BASE + '/#/baristalar'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Barista', exact: true }).click();
    const dlg = p.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Ekle ve kod oluştur' }).click(); await p.waitForTimeout(500);
    const emptyErr = await dlg.innerText();
    const name = 'ZKbar Çağrı 🎉☕ ' + L500.slice(0, 470);
    await dlg.locator('input').first().fill(name);
    await dlg.locator('select').selectOption({ label: 'Kalabalık Şube' });
    await dlg.getByRole('button', { name: 'Ekle ve kod oluştur' }).dblclick();
    await p.waitForTimeout(4000);
    const n = await count('baristas', 'name', name.trim());
    await p.screenshot({ path: shotPath('form-barista-uzun-kod') });
    log({ test: 'barista-uzun-cift', kayit: n, bosHata: /Ad soyad gir/.test(emptyErr) });
  });

  await T('ekip-ekle-cift', async () => {
    await p.goto(BASE + '/#/'); await p.waitForTimeout(2500);
    await p.getByRole('button', { name: 'Ekle', exact: true }).first().click();
    const dlg = p.getByRole('dialog');
    const em = `zk${Date.now()}@1401coffee.com`;
    await dlg.locator('input').first().fill('ZKekip ' + L500.slice(0, 300));
    await dlg.locator('input[type=email]').fill(em);
    await dlg.getByRole('button', { name: 'Ekle', exact: true }).dblclick();
    await p.waitForTimeout(4000);
    const n = await count('users', 'email', em);
    await p.screenshot({ path: shotPath('form-ekip-ekle') });
    const m = await measure(p, { mobile: true });
    log({ test: 'ekip-ekle-cift', kayit: n, dlgText: (await dlg.innerText().catch(() => '')).slice(0, 200), hscroll: m.hscroll, wide: m.wide.slice(0, 3) });
  });

  await T('talep-yanit-cift', async () => {
    await p.goto(BASE + '/#/talepler'); await p.waitForTimeout(1500);
    await p.getByText('Matcha ve ube tozu').first().click(); await p.waitForTimeout(800);
    const dlg = p.getByRole('dialog');
    const before = ((await db.doc('requests/req-3').get()).data().notes || []).length;
    const txt = 'ZKyanit ' + L500.slice(0, 480);
    await dlg.locator('textarea').fill(txt);
    await dlg.getByRole('button', { name: 'Gönder' }).dblclick();
    await p.waitForTimeout(2500);
    const after = ((await db.doc('requests/req-3').get()).data().notes || []).length;
    await p.screenshot({ path: shotPath('form-talep-yanit') });
    log({ test: 'talep-yanit-cift', notlarOnce: before, notlarSonra: after });
    await p.keyboard.press('Escape');
  });

  await T('gorev-ata-cift', async () => {
    await p.goto(BASE + '/#/gorevler'); await p.waitForTimeout(2000);
    await p.getByRole('button', { name: 'Görev ata' }).click(); await p.waitForTimeout(500);
    const dlg = p.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Ata', exact: true }).click(); await p.waitForTimeout(500);
    const emptyMsg = (await dlg.innerText()).slice(-200);
    const sels = dlg.locator('select');
    const nSel = await sels.count();
    for (let i = 0; i < nSel; i++) { const opts = await sels.nth(i).locator('option').allTextContents(); if (opts.length > 1) await sels.nth(i).selectOption({ index: 1 }); }
    const note = 'ZKnot ' + tag();
    await dlg.locator('input:not([type=date])').last().fill(note + ' ' + L500);
    const val = await dlg.locator('input:not([type=date])').last().inputValue();
    await p.screenshot({ path: shotPath('form-gorev-ata-dolu') });
    await dlg.getByRole('button', { name: 'Ata', exact: true }).click({ clickCount: 3 });
    await p.waitForTimeout(3000);
    const snap = await db.collection('assignments').where('note', '==', val).get();
    log({ test: 'gorev-ata-uclu', kayit: snap.size, notUzunluk: val.length, bosMesaj: emptyMsg });
  });

  await T('bulten-cift', async () => {
    await p.goto(BASE + '/#/bulten'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /Yeni bülten/ }).click(); await p.waitForTimeout(600);
    const dlg = p.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Yayınla', exact: true }).click(); await p.waitForTimeout(500);
    const emptyMsg = (await dlg.innerText()).slice(-160);
    const title = 'ZKbulten ' + tag() + ' ' + L500.slice(0, 200) + ' 🎉';
    await dlg.locator('input').first().fill(title);
    const ta = dlg.locator('textarea').first();
    if (await ta.count()) await ta.fill('**Kalın** <script>alert(1)</script> [bağlantı](javascript:alert(1)) ' + L500);
    await p.screenshot({ path: shotPath('form-bulten-dolu') });
    await dlg.getByRole('button', { name: 'Yayınla', exact: true }).dblclick();
    await p.waitForTimeout(3000);
    const n = await count('bulletins', 'title', title.trim());
    const n2 = await count('bulletins', 'title', title);
    await p.screenshot({ path: shotPath('form-bulten-sonra') });
    log({ test: 'bulten-cift', kayit: Math.max(n, n2), bosMesaj: emptyMsg });
  });

  log({ test: 'direktor-hatalar', errs: errs.filter((e) => e.t !== 'dialog').slice(0, 10), dialogs: errs.filter((e) => e.t === 'dialog') });
  await ctx.close();
}

// ---------- Mağaza müdürü, 360 ----------
{
  const ctx = await newCtx(browser, 's360', { device: EK.modaDevice });
  const p = await ctx.newPage(); const errs = []; watch(p, errs);
  await baristaLogin(p, 'Ayşe Demir', '1925');
  const title = 'ZKtalep ' + tag() + ' ' + L500.slice(0, 470) + ' 🎉';
  await T('talep-ac-cift', async () => {
    await p.goto(BASE + '/#/talepler'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Yeni', exact: true }).click(); await p.waitForTimeout(500);
    const dlg = p.getByRole('dialog');
    await dlg.getByRole('button', { name: /Malzeme/ }).click();
    await dlg.locator('input').first().fill(title);
    await dlg.locator('textarea').fill('Ayrıntı 😀 ' + L500);
    await dlg.getByRole('button', { name: 'Gönder' }).dblclick();
    await p.waitForTimeout(3000);
    log({ test: 'talep-ac-cift', kayit: await count('requests', 'title', title.trim()) + await count('requests', 'title', title) });
    const m = await measure(p, { mobile: true });
    await p.screenshot({ path: shotPath('form-talep-liste-uzun'), fullPage: true });
    log({ test: 'talep-liste-uzun', hscroll: m.hscroll, wide: m.wide.slice(0, 3), offscreen: m.offscreen.slice(0, 4) });
    await p.getByText(title.slice(0, 20)).first().click(); await p.waitForTimeout(800);
    const m2 = await measure(p, { mobile: true });
    await p.screenshot({ path: shotPath('form-talep-detay-uzun') });
    log({ test: 'talep-detay-uzun', hscroll: m2.hscroll, wide: m2.wide.slice(0, 3), offscreen: m2.offscreen.slice(0, 4), covered: m2.covered.slice(0, 4) });
    await p.keyboard.press('Escape');
  });
  await T('talep-f5', async () => {
    await p.goto(BASE + '/#/talepler'); await p.waitForTimeout(1200);
    await p.getByRole('button', { name: 'Yeni', exact: true }).click(); await p.waitForTimeout(400);
    await p.getByRole('dialog').locator('input').first().fill('F5 öncesi yazı');
    await p.reload(); await p.waitForTimeout(4000);
    log({ test: 'talep-f5', url: p.url(), dialog: await p.getByRole('dialog').count(), body: (await p.locator('body').innerText()).slice(0, 120) });
  });
  await T('talep-kayitta-sayfa-degistir', async () => {
    await p.goto(BASE + '/#/talepler'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Yeni', exact: true }).click(); await p.waitForTimeout(400);
    const dlg = p.getByRole('dialog');
    await dlg.getByRole('button', { name: /Malzeme/ }).click();
    const t2 = 'ZKnav ' + tag();
    await dlg.locator('input').first().fill(t2);
    await dlg.getByRole('button', { name: 'Gönder' }).click();
    await p.goto(BASE + '/#/akademi');
    await p.waitForTimeout(3000);
    log({ test: 'talep-kayitta-sayfa-degistir', kayit: await count('requests', 'title', t2), toast: await toastText(p), errs: errs.filter((e) => e.t !== 'dialog').slice(-3) });
  });
  await T('geri-bildirim-uzun', async () => {
    await p.goto(BASE + '/#/sonuclarim'); await p.waitForTimeout(1500);
    const btn = p.getByRole('button', { name: /Geri bildirim|Hata bildir|öneri/i }).first();
    if (!(await btn.count())) { log({ test: 'geri-bildirim', not: 'düğme bulunamadı' }); return; }
    await btn.click(); await p.waitForTimeout(500);
    const dlg = p.getByRole('dialog');
    const txt = 'ZKgb ' + tag() + ' ' + 'ç'.repeat(2600);
    await dlg.locator('textarea').fill(txt);
    await dlg.getByRole('button', { name: 'Gönder' }).dblclick(); await p.waitForTimeout(3000);
    const snap = await db.collection('feedback').orderBy('createdAt', 'desc').limit(5).get();
    const mine = snap.docs.filter((d) => (d.data().text || '').startsWith(txt.slice(0, 15)));
    log({ test: 'geri-bildirim-2600', kayit: mine.length, kaydedilenUzunluk: mine[0]?.data().text.length, toast: await toastText(p) });
  });
  log({ test: 'mudur-hatalar', errs: errs.filter((e) => e.t !== 'dialog').slice(0, 10), dialogs: errs.filter((e) => e.t === 'dialog') });
  await ctx.close();
}

// ---------- Bölge müdürü: sıralama oku (öneriye düşer), çift tık ----------
{
  const ctx = await newCtx(browser, 's1280');
  const p = await ctx.newPage(); const errs = []; watch(p, errs);
  await staffLogin(p, 'regional');
  await T('siralama-cift-oneri', async () => {
    const before = (await db.collection('proposals').get()).size;
    await p.goto(BASE + '/#/icerik'); await p.waitForTimeout(2500);
    // İtalyan Klasikler satırındaki aşağı oku (2. buton)
    const row = p.locator('div', { has: p.locator('a[href="#/icerik/modul/italyan-klasikler"]') }).last();
    await row.locator('button').nth(1).dblclick();
    await p.waitForTimeout(3000);
    const after = (await db.collection('proposals').get()).size;
    log({ test: 'siralama-cift-oneri', oneriOnce: before, oneriSonra: after, toast: await toastText(p) });
  });
  await ctx.close();
}

// ---------- Kurul, 390 ----------
{
  const ctx = await newCtx(browser, 's390');
  const p = await ctx.newPage(); const errs = []; watch(p, errs);
  await staffLogin(p, 'board');
  await T('kurul-soru-cift', async () => {
    await p.goto(BASE + '/#/sorular'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /Yeni soru/ }).first().click(); await p.waitForTimeout(500);
    const dlg = p.getByRole('dialog');
    const opts = dlg.getByRole('button');
    await p.screenshot({ path: shotPath('form-kurul-soru-bos') });
    const diger = dlg.getByText(/Başka bir konu|Diğer/).first();
    if (await diger.count()) await diger.click();
    const inputs = dlg.locator('input');
    if (await inputs.count()) await inputs.first().fill('ZKkonu ' + L500.slice(0, 200));
    const txt = 'ZKkurul ' + tag() + ' ' + L500;
    await dlg.locator('textarea').fill(txt);
    await dlg.getByRole('button', { name: 'Gönder' }).dblclick(); await p.waitForTimeout(3000);
    const snap = await db.collection('boardQuestions').get().catch(() => null);
    let n = 0; snap?.docs.forEach((d) => { const x = d.data(); if (JSON.stringify(x).includes(txt.slice(0, 20))) n++; });
    await p.screenshot({ path: shotPath('form-kurul-soru-sonra'), fullPage: true });
    const m = await measure(p, { mobile: true });
    log({ test: 'kurul-soru-cift', kayit: n, hscroll: m.hscroll, wide: m.wide.slice(0, 3), dlg: await dlg.count() });
  });
  log({ test: 'kurul-hatalar', errs: errs.filter((e) => e.t !== 'dialog').slice(0, 10) });
  await ctx.close();
}

writeFileSync(join(OUT, 'formlar.json'), JSON.stringify(res, null, 1));
await browser.close();
process.exit(0);
