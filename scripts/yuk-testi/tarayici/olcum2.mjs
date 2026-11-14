/**
 * Telefon (390×844) sınav akışı: giriş ekranında 65 sn bekleyip Başla (hazırlık
 * süresi dolar mı), cevaplarken bağlantı kesilir, teslim, bağlantı gelir;
 * soruları tamamen silinmiş modülde yarım sınava devam.
 */
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
const require = createRequire('/Users/kutays/Desktop/Projects/1401 Playbook/tanitim/video/package.json');
const { chromium } = require('playwright');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const adb = getFirestore();
const BASE = 'http://127.0.0.1:5199';
const OUT = decodeURIComponent(new URL('../out/', import.meta.url).pathname);
const H = JSON.parse(readFileSync(OUT + 'hesaplar.json', 'utf8'));
const R = { adimlar: [], hatalar: [], olaylar: [] };
const log = (...a) => console.log(...a);
const browser = await chromium.launch();
const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'tr-TR', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36' });
await c.addInitScript(() => { window.__lt = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch { /* yok */ } });
const page = await c.newPage();
page.on('pageerror', (e) => R.hatalar.push({ kind: 'pageerror', msg: e.message.slice(0, 300), hash: page.url().split('#')[1] }));
page.on('console', (m) => { if (m.type() === 'error') R.hatalar.push({ kind: 'console.error', msg: m.text().slice(0, 300), hash: page.url().split('#')[1] }); });
const fs = () => page.evaluate(() => ({ r: window.__fs?.r || 0, w: window.__fs?.w || 0, lt: window.__lt || [] }));
const text = () => page.evaluate(() => document.body.innerText);
async function settle(quiet = 900, max = 45000) {
  const t0 = Date.now(); let last = -1; let since = Date.now();
  while (Date.now() - t0 < max) {
    const s = await page.evaluate(() => ({ r: window.__fs?.r || 0, spin: document.querySelectorAll('.animate-spin').length })).catch(() => ({ r: -2, spin: 1 }));
    if (s.r !== last || s.spin) { last = s.r; since = Date.now(); } else if (Date.now() - since >= quiet) break;
    await page.waitForTimeout(100);
  }
  return since - t0;
}
const step = async (name, fn) => { const a = await fs(); const t = Date.now(); try { await fn(); } catch (e) { R.hatalar.push({ kind: 'adım', msg: `${name}: ${e.message.slice(0, 200)}` }); } const b = await fs(); const row = { adim: name, ms: Date.now() - t, okuma: b.r - a.r, yazma: b.w - a.w, uzunGorev200: b.lt.slice(a.lt.length).filter((d) => d >= 200), uzunGorev50: b.lt.slice(a.lt.length).filter((d) => d >= 50).length }; R.adimlar.push(row); log(JSON.stringify(row)); };

const store = H.phones.find((p) => p.storeId === 'pendik');
await adb.doc('pairingCodes/552401').set({ uid: store.uid, email: store.email, password: store.password, storeId: store.storeId, storeName: store.storeName, expiresAt: Date.now() + 1800000 });
const bar = H.baristas.find((b) => b.storeId === 'pendik' && b.pin && b.role === 'barista');
const mods = (await adb.collection('modules').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
let mod = null;
for (const m of mods.sort((a, b) => a.order - b.order)) {
  const q = await adb.collection('questions').where('moduleId', '==', m.id).limit(1).get();
  const at = (await adb.collection('attempts').where('baristaId', '==', bar.id).where('moduleId', '==', m.id).get()).size;
  if (!q.empty && at < 2 && !m.prerequisiteId) { mod = m; break; }
}
log('barista', bar.id, 'modül', mod.id);
await page.goto(BASE + '/#/');
await settle(800);
await step('eşleştirme kodu → mağaza ekranı', async () => { await page.keyboard.type('552401', { delay: 60 }); await page.waitForFunction(() => /Kim çalışıyor/i.test(document.body.innerText), null, { timeout: 30000 }); await settle(900); });
await page.screenshot({ path: `${OUT}ss/t2-magaza.png` });
await step('barista seç + PIN → ana sayfa', async () => { await page.getByText(bar.name).first().click(); await page.waitForTimeout(400); await page.keyboard.type(bar.pin, { delay: 80 }); await page.waitForFunction(() => !/Kim çalışıyor/.test(document.body.innerText), null, { timeout: 40000 }); await settle(1200, 60000); });
await page.screenshot({ path: `${OUT}ss/t2-ana.png` });
await step('sınav giriş ekranı', async () => { await page.evaluate((h) => (location.hash = h), `/sinav/${mod.id}`); await settle(900); });
await step('65 sn giriş ekranında bekle', async () => { await page.waitForTimeout(65000); });
await step('Başla → ilk soru (hazırlık süresi dolmuş)', async () => { await page.getByRole('button', { name: /Başla|devam et/ }).click(); await page.locator('h2').first().waitFor({ timeout: 30000 }); await settle(600); });
let n = 0;
await step('soruları cevapla (5. sorudan sonra çevrimdışı)', async () => {
  for (let i = 0; i < 40; i++) {
    await page.locator('button.text-left').first().click();
    await page.waitForTimeout(700);
    n++;
    if (i === 4) { await c.setOffline(true); R.olaylar.push({ ne: 'çevrimdışı', soru: i + 1 }); }
    if (await page.getByRole('button', { name: 'Sınavı bitir' }).count()) break;
    await page.getByRole('button', { name: /Sonraki/ }).click();
  }
});
const tsub = Date.now();
await step('çevrimdışı: Sınavı bitir (8 sn bekle)', async () => { page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Sınavı bitir' }).click(); await page.waitForTimeout(8000); });
R.olaylar.push({ ne: 'çevrimdışı teslimden 8 sn sonra ekran', metin: (await text()).slice(0, 400) });
await page.screenshot({ path: `${OUT}ss/t2-cevrimdisi-teslim.png` });
await step('bağlantı gelir → sonuç', async () => { await c.setOffline(false); await page.waitForFunction(() => /puan/i.test(document.body.innerText) && !/Puanlanıyor/.test(document.body.innerText), null, { timeout: 90000 }); await settle(800); });
R.olaylar.push({ ne: 'bağlantı geldikten sonra', msTeslimdenBuyana: Date.now() - tsub, metin: (await text()).slice(0, 500) });
await page.screenshot({ path: `${OUT}ss/t2-sonuc.png` });
const at = (await adb.collection('attempts').where('baristaId', '==', bar.id).where('moduleId', '==', mod.id).get()).docs.map((d) => d.data()).sort((a, b) => b.startedAt - a.startedAt)[0];
R.olaylar.push({ ne: 'kayıt', submittedAt: !!at?.submittedAt, score: at?.score, cevapSayisi: Object.keys(at?.answers || {}).length, cevaplanan: n });

// Ders tamamla çevrimdışı
const lesson = (await adb.collection('lessons').where('moduleId', '==', mod.id).get()).docs[0];
await step('çevrimdışı ders tamamla', async () => {
  await page.evaluate((h) => (location.hash = h), `/ders/${lesson.id}`); await settle(600);
  await c.setOffline(true);
  await page.getByRole('button', { name: /Tamamladım|Sonraki ders|Sınava geç|Modüle dön/ }).first().click();
  await page.waitForTimeout(1500);
  R.olaylar.push({ ne: 'çevrimdışı ders tamamla', metin: (await text()).slice(0, 200) });
  await c.setOffline(false); await page.waitForTimeout(3000);
});
const p = (await adb.doc(`progress/${bar.id}`).get()).data();
R.olaylar.push({ ne: 'çevrimdışı tamamlanan ders sunucuda', var: !!p.lessons?.[lesson.id] });

// Soruları tamamen silinmiş modülde yarım sınava devam
const emptyMod = [];
for (const m of mods) if ((await adb.collection('questions').where('moduleId', '==', m.id).limit(1).get()).empty) emptyMod.push(m.id);
if (emptyMod.length) {
  const mid = emptyMod[0];
  const ids = [`${mid}-silinmis-1`, `${mid}-silinmis-2`, `${mid}-silinmis-3`];
  await adb.collection('attempts').doc().set({ baristaId: bar.id, baristaName: bar.name, storeId: bar.storeId, moduleId: mid, moduleTitle: mid, passScore: 80, lessonId: null, startedAt: Date.now() - 60000, deadline: Date.now() + 600000, total: 3, questionIds: ids, orders: Object.fromEntries(ids.map((i) => [i, [0, 1, 2, 3]])), answers: {}, submittedAt: null });
  await step('sorusu silinmiş modülde "Kaldığım yerden devam et"', async () => {
    await page.evaluate((h) => (location.hash = h), `/sinav/${mid}`); await settle(800);
    await page.getByRole('button', { name: /devam et|Başla/ }).click(); await page.waitForTimeout(3000);
  });
  const t = await text();
  R.olaylar.push({ ne: 'sorusuz yarım sınava devam', modul: mid, cokme: /Bir şeyler ters gitti/.test(t), metin: t.slice(0, 300) });
  await page.screenshot({ path: `${OUT}ss/t2-sorusuz-devam.png` });
}
const errs = await adb.collection('hatalar').get();
R.hatalarKoleksiyonu = errs.docs.map((d) => ({ kind: d.get('kind'), message: d.get('message'), path: d.get('path'), role: d.get('role') }));
await browser.close();
writeFileSync(OUT + 'tarayici2.json', JSON.stringify(R, null, 1));
log('bitti2', R.hatalar.length);
process.exit(0);
