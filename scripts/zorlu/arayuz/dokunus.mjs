// Geçiş 4: beklenmedik dokunuşlar — tarayıcı geri/ileri, açık pencere, sınav, çıkış sonrası geri.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { chromium, BASE, OUT, EK, newCtx, watch, staffLogin, baristaLogin, shotPath } from './lib.mjs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const db = getFirestore();
const res = [];
const log = (r) => { res.push(r); console.log(JSON.stringify(r).slice(0, 400)); };
const hash = (p) => new URL(p.url()).hash;
const dialogs = (errs) => errs.filter((e) => e.t === 'dialog').map((e) => e.msg.slice(0, 80));
const browser = await chromium.launch();
async function T(name, fn) { try { await fn(); } catch (e) { log({ test: name, error: String(e.message || e).slice(0, 300) }); } }

// --- Panel (direktör, 390)
{
  const ctx = await newCtx(browser, 's390');
  const p = await ctx.newPage(); const errs = []; watch(p, errs);
  await staffLogin(p, 'director');
  await T('diger-ayni-sayfa', async () => {
    await p.goto(BASE + '/#/magazalar'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Diğer' }).click(); await p.waitForTimeout(500);
    await p.getByRole('dialog').getByRole('link', { name: /Mağazalar/ }).click(); await p.waitForTimeout(800);
    await p.screenshot({ path: shotPath('dok-diger-ayni-sayfa') });
    log({ test: 'diger-ayni-sayfa', dialogHalaAcik: await p.getByRole('dialog').count(), url: hash(p) });
    await p.keyboard.press('Escape');
  });
  await T('ders-editor-geri', async () => {
    await p.goto(BASE + '/#/icerik'); await p.waitForTimeout(1200);
    await p.goto(BASE + '/#/icerik/ders/hikayemiz'); await p.waitForTimeout(2500);
    const ta = p.locator('textarea').first();
    await ta.fill((await ta.inputValue()) + ' DEĞİŞİKLİK');
    await p.waitForTimeout(400);
    const n0 = errs.length;
    await p.goBack(); await p.waitForTimeout(1500);
    log({ test: 'ders-editor-tarayici-geri', url: hash(p), uyarilar: dialogs(errs.slice(n0)) });
    await p.screenshot({ path: shotPath('dok-ders-editor-geri') });
    await p.goForward(); await p.waitForTimeout(1500);
    const still = await p.locator('textarea').first().inputValue().catch(() => '');
    log({ test: 'ders-editor-ileri', url: hash(p), degisiklikDuruyor: still.includes('DEĞİŞİKLİK') });
  });
  await T('ders-editor-menu', async () => {
    await p.goto(BASE + '/#/icerik/ders/hikayemiz'); await p.waitForTimeout(2500);
    const ta = p.locator('textarea').first();
    await ta.fill((await ta.inputValue()) + ' DEĞİŞİKLİK2');
    const n0 = errs.length;
    await p.getByRole('link', { name: /Genel/ }).first().click(); await p.waitForTimeout(800);
    log({ test: 'ders-editor-altmenu', url: hash(p), uyarilar: dialogs(errs.slice(n0)) });
  });
  await T('yetkiler-hizli-iki', async () => {
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.goto(BASE + '/#/yetkiler'); await p.waitForTimeout(3000);
    const n0 = errs.length;
    const a = p.getByRole('button', { name: 'Operasyon Müdürü: Yeni ürün' });
    const b = p.getByRole('button', { name: 'Operasyon Müdürü: E-posta bildirimleri' });
    const before = [await a.getAttribute('aria-pressed'), await b.getAttribute('aria-pressed')];
    await a.click(); await b.click();
    await p.waitForTimeout(6000);
    const after = [await a.getAttribute('aria-pressed'), await b.getAttribute('aria-pressed')];
    const cfg = (await db.doc('config/permissions').get()).data() || {};
    await p.screenshot({ path: shotPath('dok-yetkiler-hizli') });
    log({ test: 'yetkiler-hizli-iki', before, after, cfgRoles: cfg.roles, log: (cfg.log || []).map((l) => l.text), konsol: errs.slice(n0).map((e) => e.msg.slice(0, 120)), toast: await p.locator('div.fixed.inset-x-0.bottom-24').innerText({ timeout: 500 }).catch(() => null) });
    await db.doc('config/permissions').delete();
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(1500);
  });
  await T('panel-cikis-geri', async () => {
    await p.goto(BASE + '/#/baristalar'); await p.waitForTimeout(1200);
    await p.getByRole('button', { name: /Çıkış/ }).first().click(); await p.waitForTimeout(2500);
    const u1 = hash(p);
    await p.goBack(); await p.waitForTimeout(2000);
    await p.screenshot({ path: shotPath('dok-panel-cikis-geri') });
    log({ test: 'panel-cikis-sonra-geri', cikistanSonra: u1, geriSonra: hash(p), metin: (await p.locator('body').innerText()).slice(0, 100) });
  });
  await ctx.close();
}

// --- Mağaza müdürü (web, 390)
{
  const ctx = await newCtx(browser, 's390', { device: EK.modaDevice });
  const p = await ctx.newPage(); const errs = []; watch(p, errs);
  await baristaLogin(p, 'Ayşe Demir', '1925');
  await T('pencere-acikken-geri', async () => {
    await p.goto(BASE + '/#/'); await p.waitForTimeout(800);
    await p.goto(BASE + '/#/talepler'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Yeni', exact: true }).click(); await p.waitForTimeout(400);
    await p.getByRole('dialog').locator('input').first().fill('yazdığım metin');
    const n0 = errs.length;
    await p.goBack(); await p.waitForTimeout(1200);
    log({ test: 'yeni-talep-tarayici-geri', url: hash(p), dialogAcik: await p.getByRole('dialog').count(), uyarilar: dialogs(errs.slice(n0)) });
    await p.goForward(); await p.waitForTimeout(1200);
    log({ test: 'yeni-talep-ileri', url: hash(p), dialogAcik: await p.getByRole('dialog').count() });
  });
  await T('cikis-sonra-geri', async () => {
    await p.goto(BASE + '/#/ekip'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /Çıkış/ }).first().click(); await p.waitForTimeout(3000);
    const u1 = hash(p); const body1 = (await p.locator('body').innerText()).slice(0, 60);
    await p.goBack(); await p.waitForTimeout(2000);
    await p.screenshot({ path: shotPath('dok-barista-cikis-geri') });
    log({ test: 'barista-cikis-sonra-geri', cikistanSonra: u1, body1, geriSonra: hash(p), metin: (await p.locator('body').innerText()).slice(0, 100) });
    await p.goForward(); await p.waitForTimeout(1500);
    log({ test: 'barista-cikis-sonra-ileri', url: hash(p), metin: (await p.locator('body').innerText()).slice(0, 100) });
  });
  await ctx.close();
}

// --- Barista: sınav (web, 390)
{
  const ctx = await newCtx(browser, 's390', { device: EK.modaDevice });
  const p = await ctx.newPage(); const errs = []; watch(p, errs);
  await baristaLogin(p, 'Mehmet Kaya', '1925');
  const mid = 'siparis-ve-satis';
  await T('sinav-cift-basla', async () => {
    await p.goto(BASE + '/#/modul/' + mid); await p.waitForTimeout(1200);
    await p.goto(BASE + '/#/sinav/' + mid); await p.waitForTimeout(2500);
    const before = (await db.collection('attempts').where('baristaId', '==', 'demo-mehmet').where('moduleId', '==', mid).get()).size;
    const b = p.getByRole('button', { name: /Başla|devam/ }).first();
    log({ test: 'sinav-basla-durum', enabled: await b.isEnabled().catch(() => false) });
    await b.click({ clickCount: 3 }).catch(() => {});
    await p.waitForTimeout(4000);
    const after = (await db.collection('attempts').where('baristaId', '==', 'demo-mehmet').where('moduleId', '==', mid).get()).size;
    await p.screenshot({ path: shotPath('dok-sinav-run') });
    log({ test: 'sinav-uclu-basla', denemeOnce: before, denemeSonra: after });
  });
  await T('sinav-tarayici-geri', async () => {
    const opt = p.locator('main button, [role=radio]').nth(2);
    await opt.click().catch(() => {});
    const n0 = errs.length;
    await p.goBack(); await p.waitForTimeout(1500);
    await p.screenshot({ path: shotPath('dok-sinav-geri') });
    log({ test: 'sinav-tarayici-geri', url: hash(p), uyarilar: dialogs(errs.slice(n0)), metin: (await p.locator('body').innerText()).slice(0, 120) });
    await p.goForward(); await p.waitForTimeout(2500);
    await p.screenshot({ path: shotPath('dok-sinav-ileri') });
    log({ test: 'sinav-tarayici-ileri', url: hash(p), metin: (await p.locator('body').innerText()).slice(0, 160) });
  });
  await T('sinav-f5', async () => {
    const b = p.getByRole('button', { name: /Başla|devam/ }).first();
    if (await b.count()) { await b.click(); await p.waitForTimeout(3000); }
    const n0 = errs.length;
    await p.reload(); await p.waitForTimeout(5000);
    await p.screenshot({ path: shotPath('dok-sinav-f5') });
    log({ test: 'sinav-f5', url: hash(p), uyarilar: dialogs(errs.slice(n0)), metin: (await p.locator('body').innerText()).slice(0, 160) });
  });
  await T('sinav-kapat-x', async () => {
    const b = p.getByRole('button', { name: /Başla|devam/ }).first();
    if (await b.count()) { await b.click(); await p.waitForTimeout(3000); }
    const n0 = errs.length;
    await p.getByRole('button', { name: /Kapat|Çık/ }).first().click().catch(() => {});
    await p.waitForTimeout(1000);
    log({ test: 'sinav-x', url: hash(p), uyarilar: dialogs(errs.slice(n0)) });
  });
  log({ test: 'hatalar', errs: errs.filter((e) => e.t !== 'dialog').slice(0, 10) });
  await ctx.close();
}
writeFileSync(join(OUT, 'dokunus.json'), JSON.stringify(res, null, 1));
await browser.close();
process.exit(0);
