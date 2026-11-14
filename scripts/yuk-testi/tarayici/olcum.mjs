/**
 * Tarayıcı ölçümü (Playwright, en çok 4 bağlam): panel ekranlarının açılış
 * süresi, okuma/yazma sayısı, uzun görevler, konsol hataları; telefon
 * görünümünde barista akışı; yetki kapatılırken açık ekran; çevrimdışı sınav.
 * Önce: vite (tarayici/vite.config.mjs, port 5199) ve emülatör açık olmalı.
 */
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const require = createRequire('/Users/kutays/Desktop/Projects/1401 Playbook/tanitim/video/package.json');
const { chromium } = require('playwright');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const adb = getFirestore();

const BASE = 'http://127.0.0.1:5199';
const OUT = decodeURIComponent(new URL('../out/', import.meta.url).pathname);
mkdirSync(OUT + 'ss', { recursive: true });
const H = JSON.parse(readFileSync(OUT + 'hesaplar.json', 'utf8'));
const R = { ekranlar: [], hatalar: [], olaylar: [], metinler: {} };
const log = (...a) => console.log(...a);

const browser = await chromium.launch();
const INIT = () => {
  window.__lt = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push({ d: Math.round(e.duration), h: location.hash }))).observe({ type: 'longtask', buffered: true }); } catch { /* yok */ }
};
async function ctx(name, opts = {}) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'tr-TR', ...opts });
  await c.addInitScript(INIT);
  const page = await c.newPage();
  page.on('pageerror', (e) => R.hatalar.push({ who: name, kind: 'pageerror', msg: e.message.slice(0, 300), hash: page.url().split('#')[1] }));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') R.hatalar.push({ who: name, kind: 'console.' + m.type(), msg: m.text().slice(0, 300), hash: page.url().split('#')[1] }); });
  return { c, page, name };
}
const fsState = (page) => page.evaluate(() => ({ r: window.__fs?.r || 0, w: window.__fs?.w || 0, d: window.__fs?.d || 0, lt: (window.__lt || []).length, active: window.__fs?.active || 0 }));
async function settle(page, quiet = 900, max = 45000) {
  const t0 = Date.now(); let last = -1; let since = Date.now();
  while (Date.now() - t0 < max) {
    const s = await page.evaluate(() => ({ r: window.__fs?.r || 0, spin: document.querySelectorAll('.animate-spin').length })).catch(() => ({ r: -2, spin: 1 }));
    if (s.r !== last || s.spin) { last = s.r; since = Date.now(); }
    else if (Date.now() - since >= quiet) break;
    await page.waitForTimeout(100);
  }
  return Math.max(0, since - t0);
}
async function screen(x, hash, label) {
  const { page } = x;
  await page.evaluate((l) => (window.__fsLabel = l), label);
  const a = await fsState(page);
  const t = Date.now();
  await page.evaluate((h) => (location.hash = h), hash);
  const ms = await settle(page);
  const b = await fsState(page);
  const lts = await page.evaluate((n) => (window.__lt || []).slice(n).map((e) => e.d), a.lt);
  const row = { who: x.name, ekran: label, hash, ms, okuma: b.r - a.r, yazma: b.w - a.w, silme: b.d - a.d, uzunGorev: lts.filter((d) => d >= 50).length, uzunGorev200: lts.filter((d) => d >= 200), dinleyiciAktif: b.active };
  R.ekranlar.push(row);
  log(JSON.stringify(row));
  await page.screenshot({ path: `${OUT}ss/${x.name}-${label.replace(/[^\wçğıöşüÇĞİÖŞÜ]+/g, '_')}.png` }).catch(() => {});
  return row;
}
async function staffLogin(x, email, password) {
  const { page } = x;
  await page.goto(BASE + '/#/yonetici-girisi');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  const t = Date.now();
  await page.evaluate(() => (window.__fsLabel = 'giriş + ana ekran'));
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.waitForURL((u) => !u.hash.includes('yonetici-girisi'), { timeout: 60000 });
  const ms = await settle(page, 1200, 60000);
  const s = await fsState(page);
  const lts = await page.evaluate(() => (window.__lt || []).map((e) => e.d));
  const row = { who: x.name, ekran: 'giriş + ana ekran (soğuk)', ms: Date.now() - t, settleMs: ms, okuma: s.r, yazma: s.w, uzunGorev: lts.filter((d) => d >= 50).length, uzunGorev200: lts.filter((d) => d >= 200), dinleyiciAktif: s.active };
  R.ekranlar.push(row);
  log(JSON.stringify(row));
  await page.screenshot({ path: `${OUT}ss/${x.name}-ana.png`, fullPage: true }).catch(() => {});
}
const text = (page) => page.evaluate(() => document.body.innerText);

// ---------------------------------------------------------------- Direktör paneli
const dir = await ctx('direktor');
await staffLogin(dir, 'cenkgirginol@1401coffee.com', 'yuk-testi-1401');
R.metinler.genelBakis = await text(dir.page);
for (const [h, l] of [['/baristalar', 'Baristalar'], ['/baristalar?gorunum=tablo', 'Baristalar tablo'], ['/soru-havuzu', 'Soru havuzu'], ['/magazalar', 'Mağazalar'],
  ['/magazalar/moda-cadde', 'Mağaza ayrıntı'], ['/gorevler', 'Görevler'], ['/talepler', 'Talepler'], ['/talepler/istatistik', 'Talep istatistik'], ['/onaylar', 'Onaylar'], ['/bulten', 'Bülten'], ['/icerik', 'Akademi'], ['/rozetler', 'Rozetler'], ['/kurul-sorulari', 'Kurul soruları'], ['/', 'Genel bakış (sıcak)']]) {
  try { await screen(dir, h, l); } catch (e) { R.hatalar.push({ who: 'direktor', kind: 'adım', msg: `${l}: ${e.message.slice(0, 200)}` }); }
  if (l === 'Baristalar') R.metinler.baristalar = await text(dir.page);
  if (l === 'Soru havuzu') R.metinler.soruHavuzu = (await text(dir.page)).slice(0, 4000);
  if (l === 'Görevler') R.metinler.gorevler = (await text(dir.page)).slice(0, 4000);
  if (l === 'Mağazalar') R.metinler.magazalar = (await text(dir.page)).slice(0, 6000);
}
// Arama: Türkçe karakterler
async function searchCount(x, hash, term) {
  await x.page.evaluate((h) => (location.hash = h), hash);
  await settle(x.page, 500);
  const inp = x.page.locator('input[type=search], input[placeholder*="Ara"], input[placeholder*="ara"]').first();
  await inp.fill(term);
  await x.page.waitForTimeout(600);
  const t = await text(x.page);
  return t;
}
R.arama = {};
for (const term of ['ilgaz', 'Ilgaz', 'ışıl', 'ISIL', 'cagla', 'Çağla', 'şükrü', 'SUKRU', 'İsmail', 'ismail']) {
  try { const t = await searchCount(dir, '/baristalar', term); R.arama['barista:' + term] = /Barista bulunamadı|sonuç yok|Kimse yok/i.test(t) ? 0 : (t.match(new RegExp(term.slice(0, 3), 'gi')) || []).length; R.metinler['arama-' + term] = t.slice(0, 1500); } catch (e) { R.arama['barista:' + term] = 'hata: ' + e.message.slice(0, 80); }
}
for (const term of ['espresso', 'ESPRESSO', 'süt', 'SÜT', 'sut', 'İçecek', 'içecek', 'ICECEK']) {
  try { const t = await searchCount(dir, '/soru-havuzu', term); const m = t.match(/(\d+)\s*soru/); R.arama['soru:' + term] = m ? +m[1] : t.slice(0, 200); } catch (e) { R.arama['soru:' + term] = 'hata: ' + e.message.slice(0, 80); }
}
log('arama', JSON.stringify(R.arama));

// ---------------------------------------------------------------- Kurul
const brd = await ctx('kurul');
await staffLogin(brd, 'ogunturanli@1401coffee.com', 'yuk-testi-1401');
R.metinler.kurulGidisat = await text(brd.page);
for (const [h, l] of [['/magazalar', 'Kurul mağazalar'], ['/isler', 'Kurul süren işler'], ['/raporlar', 'Kurul raporlar'], ['/sorular', 'Kurul sorular']]) {
  try { await screen(brd, h, l); } catch (e) { R.hatalar.push({ who: 'kurul', kind: 'adım', msg: `${l}: ${e.message.slice(0, 200)}` }); }
  if (l === 'Kurul mağazalar') R.metinler.kurulMagazalar = (await text(brd.page)).slice(0, 6000);
  if (l === 'Kurul raporlar') R.metinler.kurulRaporlar = (await text(brd.page)).slice(0, 6000);
}
await brd.c.close();

// ---------------------------------------------------------------- Yetki kapatılırken açık ekran (ops)
const opsS = H.staff.find((s) => s.role === 'ops');
const ops = await ctx('ops');
await staffLogin(ops, opsS.email, opsS.password);
await screen(ops, '/gorevler', 'ops Görevler');
// Görev atama penceresini aç
const assignBtn = ops.page.getByRole('button', { name: /Görev ata/ }).first();
let sheetOpen = false;
try { await assignBtn.click({ timeout: 5000 }); sheetOpen = true; } catch { /* yok */ }
await ops.page.waitForTimeout(800);
await ops.page.screenshot({ path: `${OUT}ss/ops-gorev-sheet.png` });
// 1) İşlem yetkisi kapanır (gorevAtama), pencere açıkken kaydet
await adb.doc('config/permissions').set({ roles: { ops: { gorevAtama: false } }, updatedAt: Date.now() }, { merge: true });
await ops.page.waitForTimeout(1500);
const t1 = await text(ops.page);
R.olaylar.push({ ne: 'gorevAtama kapandı, pencere açık', pencereAcik: sheetOpen, ekranMetni: t1.slice(0, 1200) });
// 2) Ekran yetkisi kapanır (ekran.gorevler)
await adb.doc('config/permissions').set({ roles: { ops: { 'ekran.gorevler': false } }, updatedAt: Date.now() }, { merge: true });
await ops.page.waitForTimeout(2000);
R.olaylar.push({ ne: 'ekran.gorevler kapandı', url: ops.page.url(), metin: (await text(ops.page)).slice(0, 400) });
await ops.page.screenshot({ path: `${OUT}ss/ops-yetki-kapandi.png` });
await adb.doc('config/permissions').set({ roles: { ops: { 'ekran.gorevler': true, gorevAtama: true } }, updatedAt: Date.now() }, { merge: true });
await ops.c.close();

// ---------------------------------------------------------------- Telefon: barista akışı (390×844)
const store = H.phones.find((p) => p.storeId === 'moda-cadde');
await adb.doc('pairingCodes/551401').set({ uid: store.uid, email: store.email, password: store.password, storeId: store.storeId, storeName: store.storeName, expiresAt: Date.now() + 1800000 });
const ph = await ctx('telefon', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36' });
await ph.page.goto(BASE + '/#/');
await settle(ph.page, 800);
await ph.page.evaluate(() => (window.__fsLabel = 'eşleştirme + mağaza ekranı'));
let tp = Date.now();
await ph.page.keyboard.type('551401', { delay: 60 });
await ph.page.waitForFunction(() => /Kim çalışıyor|Kim/i.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
let ms = await settle(ph.page, 900);
let s = await fsState(ph.page);
R.ekranlar.push({ who: 'telefon', ekran: 'eşleştirme + mağaza ekranı', ms: Date.now() - tp, okuma: s.r, yazma: s.w });
await ph.page.screenshot({ path: `${OUT}ss/telefon-magaza.png` });
const bar = H.baristas.find((b) => b.storeId === 'moda-cadde' && b.pin && b.role === 'barista');
const s0 = await fsState(ph.page);
await ph.page.evaluate(() => (window.__fsLabel = 'barista girişi + ana sayfa'));
await ph.page.getByText(bar.name, { exact: false }).first().click();
await ph.page.waitForTimeout(400);
tp = Date.now();
await ph.page.keyboard.type(bar.pin, { delay: 80 });
await ph.page.waitForFunction(() => !/Kim çalışıyor/.test(document.body.innerText) && document.querySelectorAll('nav, [role=navigation]').length > 0, null, { timeout: 40000 }).catch(() => {});
ms = await settle(ph.page, 1200, 60000);
s = await fsState(ph.page);
let lts = await ph.page.evaluate((n) => (window.__lt || []).slice(n).map((e) => e.d), s0.lt);
R.ekranlar.push({ who: 'telefon', ekran: 'barista girişi + ana sayfa', ms: Date.now() - tp, okuma: s.r - s0.r, yazma: s.w - s0.w, uzunGorev: lts.filter((d) => d >= 50).length, uzunGorev200: lts.filter((d) => d >= 200) });
await ph.page.screenshot({ path: `${OUT}ss/telefon-ana.png` });
R.metinler.baristaAna = await text(ph.page);
for (const [h, l] of [['/akademi', 'Akademi (tel)'], ['/receteler', 'Reçeteler (tel)'], ['/bulten', 'Bülten (tel)'], ['/sonuclarim', 'Sonuçlarım (tel)']]) {
  try { await screen(ph, h, l); } catch (e) { R.hatalar.push({ who: 'telefon', kind: 'adım', msg: `${l}: ${e.message.slice(0, 200)}` }); }
}
// Ders aç + tamamla
const cur = JSON.parse(readFileSync(new URL('../../../src/generated/curriculum.json', import.meta.url), 'utf8'));
const lesson = cur.lessons.find((l) => l.moduleId === 'hos-geldin');
await screen(ph, `/ders/${lesson.id}`, 'Ders (tel)');
try { await ph.page.getByRole('button', { name: /Tamamladım|Sonraki ders|Modüle dön/ }).first().click({ timeout: 5000 }); await settle(ph.page, 600); } catch (e) { R.hatalar.push({ who: 'telefon', kind: 'adım', msg: 'ders tamamla: ' + e.message.slice(0, 120) }); }
// Sınav: modül seç (önkoşulsuz)
const mod = cur.modules.find((m) => !m.prerequisiteId && m.id !== 'hos-geldin') || cur.modules[0];
await screen(ph, `/sinav/${mod.id}`, 'Sınav giriş (tel)');
const b0 = await fsState(ph.page);
tp = Date.now();
await ph.page.evaluate(() => (window.__fsLabel = 'sınav başlat'));
try {
  await ph.page.getByRole('button', { name: /Başla|devam et/ }).click({ timeout: 8000 });
  await ph.page.locator('h2').first().waitFor({ timeout: 30000 });
  const b1 = await fsState(ph.page);
  R.ekranlar.push({ who: 'telefon', ekran: 'Sınav başlat (Başla → ilk soru)', ms: Date.now() - tp, okuma: b1.r - b0.r, yazma: b1.w - b0.w });
  // Cevapla; 5. sorudan sonra çevrimdışı
  let i = 0; let offlineAt = null;
  while (i < 30) {
    await ph.page.locator('button.text-left').first().click();
    await ph.page.waitForTimeout(650);
    const last = await ph.page.getByRole('button', { name: 'Sınavı bitir' }).count();
    if (i === 4) { await ph.c.setOffline(true); offlineAt = i; await ph.page.evaluate(() => window.dispatchEvent(new Event('offline'))); }
    if (last) break;
    await ph.page.getByRole('button', { name: /Sonraki/ }).click();
    i++;
  }
  const w0 = await fsState(ph.page);
  ph.page.once('dialog', (d) => d.accept());
  const tsub = Date.now();
  await ph.page.getByRole('button', { name: 'Sınavı bitir' }).click();
  await ph.page.waitForTimeout(8000);
  const offTxt = await text(ph.page);
  await ph.page.screenshot({ path: `${OUT}ss/telefon-cevrimdisi-teslim.png` });
  R.olaylar.push({ ne: 'çevrimdışı teslim (8 sn sonra ekran)', metin: offTxt.slice(0, 500), offlineAt });
  await ph.c.setOffline(false);
  await ph.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await ph.page.waitForFunction(() => /puan|Geçtin|Kaldın|Sonuç/i.test(document.body.innerText) && !/Puanlanıyor/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  const w1 = await fsState(ph.page);
  R.olaylar.push({ ne: 'bağlantı geri geldi', msTeslimdenBuyana: Date.now() - tsub, metin: (await text(ph.page)).slice(0, 500), yazma: w1.w - w0.w, okuma: w1.r - w0.r });
  await ph.page.screenshot({ path: `${OUT}ss/telefon-sonuc.png` });
} catch (e) { R.hatalar.push({ who: 'telefon', kind: 'adım', msg: 'sınav: ' + e.message.slice(0, 200) }); }
const sAll = await fsState(ph.page);
R.telefonToplam = sAll;
// Soruları müfredattan tamamen silinmiş modülde yarım sınava devam (acilis-kapanis: odak.mjs T3 sildi)
try {
  const left = (await adb.collection('questions').where('moduleId', '==', 'acilis-kapanis').get()).size;
  const ref = adb.collection('attempts').doc();
  const ids = ['acilis-kapanis-064446f0bf', 'acilis-kapanis-7d0d74881e', 'acilis-kapanis-0b60431825'];
  await ref.set({ baristaId: bar.id, baristaName: bar.name, storeId: bar.storeId, moduleId: 'acilis-kapanis', moduleTitle: 'Açılış', passScore: 80, lessonId: null, startedAt: Date.now() - 60000, deadline: Date.now() + 600000, total: 3, questionIds: ids, orders: Object.fromEntries(ids.map((i) => [i, [0, 1, 2, 3]])), answers: {}, submittedAt: null });
  await screen(ph, '/sinav/acilis-kapanis', 'Sınav (soruları silinmiş modül)');
  await ph.page.getByRole('button', { name: /devam et|Başla/ }).click({ timeout: 8000 });
  await ph.page.waitForTimeout(3000);
  const t = await text(ph.page);
  await ph.page.screenshot({ path: `${OUT}ss/telefon-sorusuz-devam.png` });
  R.olaylar.push({ ne: 'soruları silinmiş modülde yarım sınava devam', kalanSoru: left, cokme: /Bir şeyler ters gitti/.test(t), metin: t.slice(0, 300) });
} catch (e) { R.hatalar.push({ who: 'telefon', kind: 'adım', msg: 'sorusuz devam: ' + e.message.slice(0, 200) }); }
await ph.c.close();

// Hatalar koleksiyonu
const errs = await adb.collection('hatalar').get();
R.hatalarKoleksiyonu = errs.docs.map((d) => ({ kind: d.get('kind'), message: d.get('message'), path: d.get('path'), role: d.get('role') }));
await dir.c.close();
await browser.close();
writeFileSync(OUT + 'tarayici.json', JSON.stringify(R, null, 1));
log('bitti; hata', R.hatalar.length);
process.exit(0);
