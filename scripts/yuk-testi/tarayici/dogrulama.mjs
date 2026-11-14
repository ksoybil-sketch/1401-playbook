/**
 * Düzeltme doğrulaması — tarayıcı (Playwright, en çok 4 bağlam). Simülasyon ve dogrula.mjs'ten SONRA.
 * Bölümler: node dogrulama.mjs [panel,kurul,telefon,cevrimdisi,gelistirici,yetki,gorev] (boş = hepsi)
 * Önce: vite (tarayici/vite.config.mjs, 5199) ve emülatör açık.
 */
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
const require = createRequire('/Users/kutays/Desktop/Projects/1401 Playbook/tanitim/video/package.json');
const { chromium } = require('playwright');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const adb = getFirestore();

const BASE = 'http://127.0.0.1:5199';
const OUT = decodeURIComponent(new URL('../out/', import.meta.url).pathname);
mkdirSync(OUT + 'ss2', { recursive: true });
const H = JSON.parse(readFileSync(OUT + 'hesaplar.json', 'utf8'));
const CUR = JSON.parse(readFileSync(new URL('../../../src/generated/curriculum.json', import.meta.url), 'utf8'));
const SECT = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const on = (k) => !SECT || SECT.has(k);
const RFILE = OUT + 'tarayici-dogrulama.json';
const R = existsSync(RFILE) && SECT ? JSON.parse(readFileSync(RFILE, 'utf8')) : { ekranlar: [], hatalar: [], madde: {} };
const M = (n, k, v) => { (R.madde[n] ||= {})[k] = v; console.log(`[${n}] ${k}:`, JSON.stringify(v).slice(0, 400)); };
const save = () => writeFileSync(RFILE, JSON.stringify(R, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const staff = (role, i = 0) => H.staff.filter((s) => s.role === role)[i];

const browser = await chromium.launch();
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36' };
async function ctx(name, opts = {}) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'tr-TR', ...opts });
  const page = await c.newPage();
  page.on('pageerror', (e) => R.hatalar.push({ who: name, kind: 'pageerror', msg: e.message.slice(0, 300), hash: page.url().split('#')[1] }));
  page.on('console', (m) => { if (m.type() === 'error') R.hatalar.push({ who: name, kind: 'console.error', msg: m.text().slice(0, 300), hash: page.url().split('#')[1] }); });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  return { c, page, name };
}
const fs = (page) => page.evaluate(() => ({ r: window.__fs?.r || 0, w: window.__fs?.w || 0, d: window.__fs?.d || 0, by: window.__fs?.by || {} }));
const text = (page) => page.evaluate(() => document.body.innerText);
async function settle(page, quiet = 900, max = 45000) {
  const t0 = Date.now(); let last = -1; let since = Date.now();
  while (Date.now() - t0 < max) {
    const s = await page.evaluate(() => ({ r: window.__fs?.r || 0, spin: document.querySelectorAll('.animate-spin').length })).catch(() => ({ r: -2, spin: 1 }));
    if (s.r !== last || s.spin) { last = s.r; since = Date.now(); } else if (Date.now() - since >= quiet) break;
    await page.waitForTimeout(100);
  }
  return Math.max(0, since - t0);
}
const sumBy = (a, b, pred) => Object.entries(b.by).filter(([k]) => pred(k)).reduce((s, [k, v]) => s + v.r - (a.by[k]?.r || 0), 0);
async function screen(x, hash, label) {
  const a = await fs(x.page); const t = Date.now();
  await x.page.evaluate((h) => (location.hash = h), hash);
  await settle(x.page);
  const b = await fs(x.page);
  const row = { who: x.name, ekran: label, ms: Date.now() - t, okuma: b.r - a.r, yazma: b.w - a.w };
  R.ekranlar.push(row); console.log(JSON.stringify(row));
  await x.page.screenshot({ path: `${OUT}ss2/${x.name}-${label.replace(/[^\wçğıöşüÇĞİÖŞÜ]+/g, '_')}.png` }).catch(() => {});
  return row;
}
async function staffLogin(x, s) {
  await x.page.goto(BASE + '/#/yonetici-girisi');
  await x.page.locator('input[type=email]').fill(s.email);
  await x.page.locator('input[type=password]').fill(s.password);
  const t = Date.now();
  await x.page.getByRole('button', { name: 'Giriş yap' }).click();
  await x.page.waitForURL((u) => !u.hash.includes('yonetici-girisi'), { timeout: 60000 });
  await settle(x.page, 1500, 60000);
  const st = await fs(x.page);
  const row = { who: x.name, ekran: 'giriş + ana ekran (soğuk)', ms: Date.now() - t, okuma: st.r, yazma: st.w };
  R.ekranlar.push(row); console.log(JSON.stringify(row));
  return row;
}
let codeN = 610000;
async function pairPhone(x, ph) {
  const code = String(codeN++);
  await adb.doc(`pairingCodes/${code}`).set({ uid: ph.uid, email: ph.email, password: ph.password, storeId: ph.storeId, storeName: ph.storeName, expiresAt: Date.now() + 1800000 });
  await adb.doc(`users/${ph.uid}`).update({ active: true });
  await x.page.goto(BASE + '/#/');
  await settle(x.page, 800);
  const a = await fs(x.page); const t = Date.now();
  await x.page.keyboard.type(code, { delay: 50 });
  await x.page.waitForFunction(() => /Kim çalışıyor/i.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  await settle(x.page, 900);
  const b = await fs(x.page);
  return { ms: Date.now() - t, okuma: b.r - a.r, dersOkuma: sumBy(a, b, (k) => k.includes('lessons')) };
}
async function baristaLogin(x, b) {
  if (!/Kim çalışıyor/.test(await text(x.page))) { await x.page.evaluate(() => (location.hash = '/')); await x.page.waitForTimeout(500); if (await x.page.getByRole('button', { name: /Çıkış/ }).count()) { await x.page.getByRole('button', { name: /Çıkış/ }).first().click(); await x.page.waitForFunction(() => /Kim çalışıyor/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {}); await settle(x.page, 600); } }
  const a = await fs(x.page);
  await x.page.getByText(b.name, { exact: false }).first().click();
  await x.page.waitForTimeout(400);
  const t = Date.now();
  await x.page.keyboard.type(b.pin, { delay: 70 });
  await x.page.waitForFunction(() => !/Kim çalışıyor/.test(document.body.innerText) && /Çıkış/.test(document.body.innerText), null, { timeout: 40000 }).catch(() => {});
  await settle(x.page, 1200, 60000);
  const c = await fs(x.page);
  return { ms: Date.now() - t, okuma: c.r - a.r, dersOkuma: sumBy(a, c, (k) => k.includes('lessons')) };
}
async function baristaLogout(x) {
  const a = await fs(x.page);
  await x.page.evaluate(() => (location.hash = '/'));
  await x.page.waitForTimeout(300);
  await x.page.getByRole('button', { name: /Çıkış/ }).first().click();
  await x.page.waitForFunction(() => /Kim çalışıyor/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  await settle(x.page, 900);
  const b = await fs(x.page);
  return { okuma: b.r - a.r, dersOkuma: sumBy(a, b, (k) => k.includes('lessons')) };
}
const pinB = (storeId, role = 'barista', skip = []) => H.baristas.find((b) => b.storeId === storeId && b.pin && b.role === role && !skip.includes(b.id) && !['yb-30', 'yb-45'].includes(b.id));
async function activeOk(b) { const d = (await adb.doc(`baristas/${b.id}`).get()).data(); return d?.active && !d.pinPending && d.authEmail === b.email; }

// =============================================================== PANEL (17, 24, ölçüm)
if (on('panel')) {
  const dir = await ctx('direktor');
  await staffLogin(dir, staff('director'));
  const ana = await text(dir.page);
  const m7 = ana.match(/Son 7 günde sınav\s*\n?\s*(\d+)/);
  const dg = JSON.parse(readFileSync(OUT + 'dogrulama.json', 'utf8'));
  M(17, 'Genel bakış metni (ilk 600)', ana.slice(0, 600));
  M(17, 'Son 7 günde sınav: panel / gerçek', { panel: m7 ? +m7[1] : null, gercek: dg.panel.gercek.haftaSinav });
  const ab = ana.match(/Aktif barista\s*\n?\s*(\d+)/); const op = ana.match(/Ortalama ilerleme\s*\n?\s*%(\d+)/); const gk = ana.match(/Gecikmiş görev\s*\n?\s*(\d+)/);
  M(17, 'Aktif barista / ortalama ilerleme / gecikmiş görev: panel vs gerçek', { panel: { aktif: ab && +ab[1], ilerleme: op && +op[1], gecikmis: gk && +gk[1] }, gercek: { aktif: dg.panel.aktifBaristaAktifMagaza, ilerleme: dg.panel.ortIlerleme, gecikmis: dg.panel.gecikmisGorev } });
  for (const [h, l] of [['/baristalar', 'Baristalar'], ['/soru-havuzu', 'Soru havuzu (modül)'], ['/magazalar', 'Mağazalar'], ['/gorevler', 'Görevler'], ['/talepler', 'Talepler'], ['/onaylar', 'Onaylar'], ['/bulten', 'Bülten'], ['/icerik', 'Akademi'], ['/rozetler', 'Rozetler'], ['/', 'Genel bakış (sıcak)']]) {
    try { await screen(dir, h, l); } catch (e) { R.hatalar.push({ who: 'direktor', kind: 'adım', msg: `${l}: ${e.message.slice(0, 200)}` }); }
  }
  // 24: soru havuzu modül seçimi, Bütün modüller, arama
  try {
    await dir.page.evaluate(() => (location.hash = '/soru-havuzu')); await settle(dir.page);
    const sel = dir.page.locator('select').first();
    const a0 = await fs(dir.page);
    await sel.selectOption('sicak-kahveler'); await settle(dir.page);
    const a1 = await fs(dir.page);
    const sub1 = (await text(dir.page)).match(/Sıcak[^\n]*· (\d+) soru/);
    await sel.selectOption('*'); await settle(dir.page, 1200, 60000);
    const a2 = await fs(dir.page);
    const sub2 = (await text(dir.page)).match(/Bütün modüller · (\d+) soru/);
    const inp = dir.page.locator('input[placeholder="Soru ya da şıkta ara"]');
    const res = {};
    for (const term of ['süt', 'sut', 'SÜT', 'içecek', 'icecek', 'ICECEK']) { await inp.fill(term); await dir.page.waitForTimeout(700); res[term] = (await dir.page.locator('main').innerText().catch(() => text(dir.page))).length; }
    await inp.fill('');
    M(24, 'soru havuzu: modül değişimi okuma / Bütün modüller okuma', { modulSecimiOkuma: a1.r - a0.r, modulSoru: sub1 && +sub1[1], butunModullerOkuma: a2.r - a1.r, butunSoru: sub2 && +sub2[1] });
    M(24, 'arama sonuç metni uzunluğu (aynı olmalı: süt=sut=SÜT, içecek=icecek=ICECEK)', res);
    await dir.page.locator('select').first().selectOption('hos-geldin');
  } catch (e) { M(24, 'soru havuzu hata', e.message.slice(0, 200)); }
  try {
    const res = {};
    for (const term of ['Çağla', 'cagla', 'CAGLA', 'Işıl', 'isil', 'ilgaz', 'Ilgaz', 'sukru']) {
      await dir.page.evaluate(() => (location.hash = '/baristalar')); await settle(dir.page, 500);
      const inp = dir.page.locator('input[type=search], input[placeholder*="Ara"], input[placeholder*="ara"]').first();
      await inp.fill(term); await dir.page.waitForTimeout(600);
      const t = await text(dir.page);
      res[term] = /bulunamadı/i.test(t) ? 0 : (t.match(/Çağla|Işıl|Ilgaz|Şükrü/g) || []).length;
    }
    M(24, 'barista araması (eşleşen ad sayısı)', res);
  } catch (e) { M(24, 'barista arama hata', e.message.slice(0, 200)); }
  // 19: bir baristanın ayrıntısı (rozet metni)
  try {
    const b = pinB('pendik');
    await screen(dir, `/baristalar/${b.id}`, 'Barista ayrıntısı');
    const t = await text(dir.page);
    M(19, 'panel barista ayrıntısı başarım', { barista: b.id, basarim: (t.match(/(\d+)\s*\/\s*(\d+)\s*başarım|(\d+) başarım/) || [])[0] || null });
  } catch (e) { M(19, 'barista ayrıntısı hata', e.message.slice(0, 200)); }
  await dir.c.close(); save();
}

// =============================================================== KURUL (18, ölçüm)
if (on('kurul')) {
  const brd = await ctx('kurul');
  await staffLogin(brd, staff('board'));
  const g = await text(brd.page);
  M(18, 'Gidişat: önceki dönem ve 12 hafta', { onceki: (g.match(/[^\n]*önceki[^\n]*/gi) || []).slice(0, 4), haftalik: /haftalık sınavlar \(12 hafta\)/i.test(g), grafikCubuk: await brd.page.locator('svg rect, [title*="haftası"]').count(), ozet: (g.match(/Baristalar \d+ sınava[^\n]*/) || [])[0] || null });
  const per = {};
  for (const lab of ['Son 90 gün', 'Bu ay', 'Geçen ay', 'Bu yıl', 'Son 30 gün']) {
    try {
      const a = await fs(brd.page);
      await brd.page.getByRole('button', { name: lab }).first().click();
      await settle(brd.page, 900);
      const b = await fs(brd.page);
      const t = await text(brd.page);
      per[lab] = { okuma: b.r - a.r, url: brd.page.url().split('#')[1], sinav: (t.match(/(\d+) sınav/) || [])[1] || null, onceki: /önceki/.test(t) };
    } catch (e) { per[lab] = 'hata: ' + e.message.slice(0, 100); }
  }
  M(18, 'dönem değiştirme', per);
  for (const [h, l] of [['/magazalar', 'Kurul mağazalar'], ['/isler', 'Kurul süren işler'], ['/raporlar', 'Kurul raporlar'], ['/sorular', 'Kurul sorular']]) {
    try { await screen(brd, h, l); } catch (e) { R.hatalar.push({ who: 'kurul', kind: 'adım', msg: `${l}: ${e.message.slice(0, 200)}` }); }
  }
  M(16, 'kurul ekranlarında geliştirici adı/e-postası', /Kutay|soybil/i.test(await text(brd.page)));
  await brd.c.close(); save();
}

// =============================================================== TELEFON (3, 8, 12, 2-UI, 9)
const PH = (k) => on('telefon') || on(k);
if (['telefon', 'sinav', 'talep', 'oturum', 'bulten', 'icerik'].some(on)) {
  const ph = H.phones.find((p) => p.storeId === 'moda-cadde');
  const x = await ctx('telefon', PHONE);
  const pr = await pairPhone(x, ph);
  M(3, 'eşleştirme + mağaza ekranı (soğuk)', pr);
  const b1 = pinB('moda-cadde'); const b2 = pinB('moda-cadde', 'barista', [b1.id]);
  const b3 = pinB('moda-cadde', 'shift') || pinB('moda-cadde', 'barista', [b1.id, b2.id]);
  if (PH('icerik')) {
  const l1 = await baristaLogin(x, b1);
  const o1 = await baristaLogout(x);
  const l2 = await baristaLogin(x, b2);
  const o2 = await baristaLogout(x);
  M(3, 'barista girişi/çıkışı: okuma ve ders okuması', { giris1: l1, cikis1: o1, giris2: l2, cikis2: o2 });
  }

  if (PH('sinav')) {
  // 8: sınav — havuz Başla'da, cevap kaydı seyrek, gizlenince yazım; panel açıkken okuma artmıyor
  const dir = await ctx('direktor-acik');
  await staffLogin(dir, staff('director'));
  await x.page.evaluate(() => (location.hash = '/'));
  await baristaLogin(x, b3);
  try {
    const mine = (await adb.collection('attempts').where('baristaId', '==', b3.id).get()).docs.map((d) => d.data());
    const prog = (await adb.doc(`progress/${b3.id}`).get()).data() || {};
    const hasQ = new Set((await adb.collection('questions').select('moduleId').get()).docs.map((d) => d.get('moduleId')));
    const mod = CUR.modules.find((m) => m.published && hasQ.has(m.id) && (!m.prerequisiteId || prog.modules?.[m.prerequisiteId]) && mine.filter((a) => a.moduleId === m.id && a.startedAt > Date.now() - 7 * 86400000 && !a.voided).length < 2 && !mine.some((a) => a.moduleId === m.id && !a.submittedAt));
    const e0 = await fs(x.page);
    await x.page.evaluate((h) => (location.hash = h), `/sinav/${mod.id}`); await settle(x.page);
    const e1 = await fs(x.page);
    await x.page.getByRole('button', { name: /Başla|devam et/ }).click({ timeout: 8000 });
    await x.page.waitForTimeout(2500);
    await x.page.screenshot({ path: `${OUT}ss2/telefon-sinav-basla.png` });
    await x.page.locator('button.text-left').first().waitFor({ timeout: 30000 });
    await settle(x.page, 600);
    const e2 = await fs(x.page);
    const d0 = await fs(dir.page);
    const writesAt = [];
    let attemptId = null;
    for (let i = 0; i < 30; i++) {
      await x.page.locator('button.text-left').first().click();
      await x.page.waitForTimeout(500);
      const w = await fs(x.page);
      writesAt.push(sumBy({ by: {} }, { by: Object.fromEntries(Object.entries(w.by).map(([k, v]) => [k, { r: v.w }])) }, (k) => k.includes('attempts')));
      if (i === 4) {
        // 5 cevap: 3'te bir yazım → 1 yazım beklenir; şimdi sayfa gizlenir → bekleyen 2 cevap yazılır
        attemptId = (await adb.collection('attempts').where('baristaId', '==', b3.id).where('submittedAt', '==', null).get()).docs[0]?.id;
        const before = Object.keys((await adb.doc(`attempts/${attemptId}`).get()).get('answers') || {}).length;
        await x.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
        await sleep(1200);
        const after = Object.keys((await adb.doc(`attempts/${attemptId}`).get()).get('answers') || {}).length;
        await x.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
        M(8, '5 cevaptan sonra: sunucudaki cevap sayısı gizlenmeden önce / sonra', { once: before, sonra: after });
      }
      if (await x.page.getByRole('button', { name: 'Sınavı bitir' }).count()) break;
      await x.page.getByRole('button', { name: /Sonraki/ }).click();
    }
    const d1 = await fs(dir.page);
    M(8, 'cevaplama boyunca deneme yazımları (kümülatif)', writesAt);
    M(8, 'barista cevaplarken açık panelin okuması (attempts)', { toplam: d1.r - d0.r, attempts: sumBy(d0, d1, (k) => k.includes('attempts')) });
    M(9.5, 'sınav ekranı açılış okuması / Başla okuması', { ekranAcilis: e1.r - e0.r, basla: e2.r - e1.r, havuz: (await adb.collection('questions').where('moduleId', '==', mod.id).get()).size });
    // 7: teslimde ağ kesik
    await x.c.setOffline(true);
    await x.page.getByRole('button', { name: 'Sınavı bitir' }).click();
    const t0 = Date.now();
    await x.page.waitForFunction(() => /Bağlantı yok/.test(document.body.innerText) && /Tamam, çık/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    const waited = Date.now() - t0;
    const tx = await text(x.page);
    await x.page.screenshot({ path: `${OUT}ss2/telefon-cevrimdisi-teslim.png` });
    M(7, 'çevrimdışı teslim: mesaj ve çıkış düğmesi', { saniye: Math.round(waited / 100) / 10, mesaj: /Bağlantı yok/.test(tx), dugme: /Tamam, çık/.test(tx) });
    await x.page.getByRole('button', { name: 'Tamam, çık' }).click().catch(() => {});
    await sleep(800);
    await x.c.setOffline(false);
    let sub = null;
    for (let k = 0; k < 40 && !sub; k++) { await sleep(500); sub = (await adb.doc(`attempts/${attemptId}`).get()).get('submittedAt') || null; }
    const ad = (await adb.doc(`attempts/${attemptId}`).get()).data();
    M(7, 'bağlantı gelince sonuç kaydı', { submittedAt: !!sub, score: ad.score, total: ad.total, cevap: Object.keys(ad.answers || {}).length });
  } catch (e) { M(8, 'sınav akışı hata', e.message.slice(0, 300)); }
  await settle(x.page, 800);
  await baristaLogout(x).catch(() => {});
  await dir.c.close();
  }

  if (PH('bulten')) {
  // 12: bülten soğuk açılış (yeni bağlam = boş önbellek)
  try {
    const bl = (await adb.collection('bulletins').where('published', '==', true).get()).docs.filter((d) => !d.get('storeIds')?.length || d.get('storeIds').includes('moda-cadde'));
    const bb = pinB('moda-cadde', 'barista', [b1.id, b2.id]) || b1;
    const old = Date.now() - 3 * 86400000;
    const readMap = Object.fromEntries(bl.slice(0, Math.max(1, bl.length - 1)).map((d, i) => [d.id, old + i]));
    await adb.doc(`progress/${bb.id}`).set({ bulletins: readMap }, { merge: true });
    const y = await ctx('telefon-soguk', PHONE);
    await pairPhone(y, ph);
    await y.page.getByText(bb.name, { exact: false }).first().click(); await y.page.waitForTimeout(300);
    await y.page.keyboard.type(bb.pin, { delay: 60 });
    await y.page.waitForFunction(() => /Çıkış/.test(document.body.innerText), null, { timeout: 40000 }).catch(() => {});
    await y.page.evaluate(() => (location.hash = '/bulten'));
    await settle(y.page, 1200);
    const after = (await adb.doc(`progress/${bb.id}`).get()).get('bulletins') || {};
    const changed = Object.keys(readMap).filter((k) => after[k] !== readMap[k]);
    const ytxt = await text(y.page);
    const openRead = bl.filter((d) => readMap[d.id] && d.get('body') && d.get('body').length > 20 && ytxt.includes(d.get('body').slice(0, 40)));
    M(12, 'soğuk açılış: okunmuşların okundu tarihi değişti mi / açık gelen okunmuş', { bulten: bl.length, okunmus: Object.keys(readMap).length, tarihiDegisen: changed.length, acikGelenOkunmus: openRead.map((d) => d.get('title')) });
    await y.page.screenshot({ path: `${OUT}ss2/telefon-bulten-soguk.png` });
    await y.c.close();
  } catch (e) { M(12, 'bülten hata', e.message.slice(0, 300)); }
  }

  if (PH('talep')) {
  // 9: kapalı talep + Yeni talep (çevrimiçi ve çevrimdışı) — mağaza müdürü
  try {
    const lead = pinB('moda-cadde', 'lead');
    const done = await adb.collection('requests').add({ storeId: 'moda-cadde', storeName: 'Moda Cadde', category: 'ariza', priority: 'normal', title: 'KAPALI TALEP TESTİ', detail: 'x', status: 'done', notes: [], createdAt: Date.now() - 86400000, createdBy: 'x', createdByName: lead.name, updatedAt: Date.now() - 3600000, lastSide: 'ops', closedAt: Date.now() - 3600000 });
    await baristaLogin(x, lead);
    await x.page.evaluate(() => (location.hash = '/talepler')); await settle(x.page);
    // "Kapanan" sekmesi varsa geç
    await x.page.getByRole('button', { name: /Kapanan/ }).first().click({ timeout: 3000 }).catch(() => {});
    await x.page.getByText('KAPALI TALEP TESTİ').first().click({ timeout: 8000 });
    await x.page.waitForTimeout(800);
    const tt = await text(x.page);
    const ta = await x.page.locator('textarea[placeholder="Ek bilgi yaz…"]').count();
    M(9, 'kapalı talep ekranı', { kapandiMesaji: /Bu talep kapandı/.test(tt), yaziKutusu: ta });
    await x.page.evaluate(() => (location.hash = '/')); await x.page.waitForTimeout(600);
    await x.page.evaluate(() => (location.hash = '/talepler')); await settle(x.page, 500);
    await x.page.screenshot({ path: `${OUT}ss2/telefon-talepler.png` });
    const newReq = async (title) => {
      await x.page.getByRole('button', { name: /^\s*Yeni( talep)?\s*$/ }).first().click();
      await x.page.waitForTimeout(500);
      await x.page.locator('select').first().selectOption({ index: 1 });
      await x.page.locator('input[placeholder="Değirmen öğütmüyor, motor sesi var"]').fill(title);
      await x.page.locator('textarea').first().fill('test');
    };
    await newReq('ÇEVRİMİÇİ TALEP');
    await x.page.getByRole('button', { name: 'Gönder' }).click();
    await x.page.waitForTimeout(2000);
    const onl = await text(x.page);
    M(9, 'Yeni talep (çevrimiçi)', { kapandi: !(await x.page.locator('input[placeholder="Değirmen öğütmüyor, motor sesi var"]').count()), kayit: !(await adb.collection('requests').where('title', '==', 'ÇEVRİMİÇİ TALEP').get()).empty, toast: /iletildi/.test(onl) });
    await newReq('ÇEVRİMDIŞI TALEP');
    await x.c.setOffline(true);
    await x.page.getByRole('button', { name: 'Gönder' }).click();
    await x.page.waitForTimeout(2500);
    const off = await text(x.page);
    const closed = !(await x.page.locator('input[placeholder="Değirmen öğütmüyor, motor sesi var"]').count());
    await x.c.setOffline(false);
    let ok = false; for (let k = 0; k < 30 && !ok; k++) { await sleep(500); ok = !(await adb.collection('requests').where('title', '==', 'ÇEVRİMDIŞI TALEP').get()).empty; }
    M(9, 'Yeni talep (çevrimdışı)', { mesaj: /bağlantı gelince gönderilecek/.test(off), kapandi: closed, baglantiGelinceKayit: ok });
    // 20 (barista tarafı): geri bildirim çevrimdışı
    await x.page.evaluate(() => (location.hash = '/sonuclarim')); await settle(x.page, 500);
    await x.page.getByText('Bir sorun mu var? Önerin mi var?').first().click();
    await x.page.waitForTimeout(400);
    await x.page.locator('textarea').first().fill('ÇEVRİMDIŞI GERİ BİLDİRİM testi');
    await x.c.setOffline(true);
    await x.page.getByRole('button', { name: 'Gönder' }).click();
    await x.page.waitForTimeout(2500);
    const ft = await text(x.page);
    const fclosed = !(await x.page.getByText('Ne yapıyordun, ne oldu?').count()) && !(await x.page.locator('textarea').count());
    await x.c.setOffline(false);
    let fok = false; for (let k = 0; k < 30 && !fok; k++) { await sleep(500); fok = !(await adb.collection('feedback').where('text', '==', 'ÇEVRİMDIŞI GERİ BİLDİRİM testi').get()).empty; }
    M(20, 'geri bildirim çevrimdışı (barista)', { mesaj: /bağlantı gelince gönderilecek/.test(ft), kapandi: fclosed, baglantiGelinceKayit: fok });
    M(16, 'mağaza müdürü ekranlarında geliştirici adı', /Kutay|soybil/i.test(await text(x.page)));
    await baristaLogout(x);
    void done;
  } catch (e) { M(9, 'talep akışı hata', e.message.slice(0, 300)); }
  }

  if (PH('oturum')) {
  // 2 (UI): açık oturumda pasifleştirme / PIN sıfırlama / telefon bağlantısını kaldırma
  try {
    const bp = pinB('moda-cadde', 'barista', [b1.id, b2.id, b3.id]) || b2;
    await baristaLogin(x, bp);
    const uid = (await adb.collection('users').where('baristaId', '==', bp.id).where('active', '==', true).get()).docs[0].id;
    await adb.doc(`users/${uid}`).update({ active: false });
    await adb.doc(`baristas/${bp.id}`).update({ active: false });
    let seen = ''; const t0 = Date.now();
    for (let k = 0; k < 40; k++) { await sleep(250); const t = await text(x.page); if (/Erişimin kaldırıldı/.test(t)) seen = t; if (/Kim çalışıyor/.test(t)) break; }
    const t1 = await text(x.page);
    M(2, 'pasifleştirilen barista (açık oturum)', { bildirim: /Erişimin kaldırıldı/.test(seen + t1), magazaEkraninaDondu: /Kim çalışıyor/.test(t1), ms: Date.now() - t0 });
    await adb.doc(`users/${uid}`).update({ active: true }); await adb.doc(`baristas/${bp.id}`).update({ active: true });
    // Telefon bağlantısı kaldırılır
    const t2 = Date.now();
    await adb.doc(`users/${ph.uid}`).update({ active: false, revokedAt: Date.now() });
    let s2 = '';
    for (let k = 0; k < 40; k++) { await sleep(250); const t = await text(x.page); if (/bağlantısı kaldırıldı/.test(t)) s2 = t; if (!/Kim çalışıyor/.test(t) && /kod|Kod/.test(t) && !/Erişim/.test(t)) break; }
    const t3 = await text(x.page);
    const dev = await x.page.evaluate(() => { try { return localStorage.getItem('CapacitorStorage.playbook.device.v2'); } catch { return 'err'; } });
    M(2, 'bağlantısı kaldırılan telefon (açık oturum)', { bildirim: /bağlantısı kaldırıldı/.test(s2 + t3), eslesmeEkrani: !/Kim çalışıyor/.test(t3), cihazKaydiSilindi: dev === null, ms: Date.now() - t2, ekran: t3.slice(0, 160) });
    await adb.doc(`users/${ph.uid}`).update({ active: true });
  } catch (e) { M(2, 'UI akışı hata', e.message.slice(0, 300)); M(2, 'ekran', (await text(x.page)).slice(0, 400)); await x.page.screenshot({ path: `${OUT}ss2/telefon-oturum-hata.png` }); }
  }
  await x.c.close(); save();
}

// =============================================================== EŞLEŞTİRME/DAVET AĞ HATASI (11), PIN sıfırlama UI, ekip üyesi kaldırma UI
if (on('cevrimdisi')) {
  try {
    const x = await ctx('telefon-agsiz', PHONE);
    await x.page.goto(BASE + '/#/'); await settle(x.page, 800);
    await x.c.setOffline(true);
    await x.page.keyboard.type('123456', { delay: 50 });
    await x.page.waitForFunction(() => /bağlantı|geçersiz/i.test(document.body.innerText), null, { timeout: 25000 }).catch(() => {});
    const t = await text(x.page);
    M(11, 'eşleştirme çevrimdışı', { internetYok: /İnternet bağlantısı yok/.test(t), kodGecersiz: /geçersiz/i.test(t), ekran: t.slice(0, 200) });
    await x.c.setOffline(false);
    // Davet ekranı
    const ph = H.phones.find((p) => p.storeId === 'pendik');
    await pairPhone(x, ph);
    await x.page.evaluate(() => (location.hash = '/davet')); await settle(x.page, 600);
    await x.c.setOffline(true);
    await x.page.keyboard.type('654321', { delay: 50 }); await x.page.waitForTimeout(300);
    await x.page.keyboard.type('5831', { delay: 50 }); await x.page.waitForTimeout(300);
    await x.page.keyboard.type('5831', { delay: 50 });
    await x.page.waitForFunction(() => /bağlantı|geçersiz/i.test(document.body.innerText), null, { timeout: 25000 }).catch(() => {});
    const t2 = await text(x.page);
    M(11, 'davet çevrimdışı', { internetYok: /İnternet bağlantısı yok/.test(t2), kodGecersiz: /geçersiz/i.test(t2), ekran: t2.slice(0, 200) });
    await x.c.setOffline(false);
    // PIN sıfırlanan baristanın telefonda açık oturumu
    const b = pinB('pendik');
    await x.page.evaluate(() => (location.hash = '/')); await settle(x.page, 600);
    await baristaLogin(x, b);
    const uid = (await adb.collection('users').where('baristaId', '==', b.id).where('active', '==', true).get()).docs[0].id;
    await adb.doc(`users/${uid}`).update({ active: false }); // PIN sıfırlamanın eski hesaba etkisi
    let seen = '';
    for (let k = 0; k < 40; k++) { await sleep(250); const t = await text(x.page); if (/Erişimin kaldırıldı/.test(t)) seen = t; if (/Kim çalışıyor/.test(t)) break; }
    M(2, 'PIN sıfırlanan barista (eski hesap, açık oturum)', { bildirim: /Erişimin kaldırıldı/.test(seen + (await text(x.page))), magazaEkraninaDondu: /Kim çalışıyor/.test(await text(x.page)) });
    await adb.doc(`users/${uid}`).update({ active: true });
    await x.c.close();
  } catch (e) { M(11, 'hata', e.message.slice(0, 300)); }
  try {
    const x = await ctx('bolge2');
    const s = staff('regional', 1);
    await staffLogin(x, s);
    await adb.doc(`users/${s.uid}`).update({ active: false });
    let seen = '';
    for (let k = 0; k < 40; k++) { await sleep(250); const t = await text(x.page); if (/Erişimin kaldırıldı/.test(t)) seen = t; if (/Giriş yap|E-posta/.test(t) && !/Genel bakış/.test(t)) break; }
    const t = await text(x.page);
    M(2, 'ekipten kaldırılan yönetici (açık oturum)', { bildirim: /Erişimin kaldırıldı/.test(seen + t), cikti: !/Genel bakış/.test(t), ekran: t.slice(0, 160) });
    await adb.doc(`users/${s.uid}`).update({ active: true });
    await x.c.close();
  } catch (e) { M(2, 'yönetici UI hata', e.message.slice(0, 300)); }
  save();
}

// =============================================================== GELİŞTİRİCİ (16), 20 (panel), 23
if (on('gelistirici')) {
  try {
    const lead = pinB('kadikoy-iskele', 'lead') || H.baristas.find((b) => b.role === 'lead' && b.pin);
    const rid = (await adb.collection('requests').add({ storeId: lead.storeId, storeName: lead.storeId, category: 'diger', priority: 'normal', title: 'GELİŞTİRİCİ AÇACAK', detail: 'x', status: 'open', notes: [], createdAt: Date.now(), createdBy: 'x', createdByName: lead.name, updatedAt: Date.now(), lastSide: 'store', closedAt: null })).id;
    const dev = await ctx('gelistirici');
    await staffLogin(dev, staff('developer'));
    await dev.page.evaluate(() => (location.hash = '/talepler')); await settle(dev.page);
    await dev.page.getByText('GELİŞTİRİCİ AÇACAK').first().click({ timeout: 8000 });
    await sleep(2000);
    const r = (await adb.doc(`requests/${rid}`).get()).data();
    M(16, 'geliştirici talebi açtı', { status: r.status, not: (r.notes || []).length });
    await dev.c.close();
    const dir = await ctx('direktor-gizlilik');
    await staffLogin(dir, staff('director'));
    const out = {};
    for (const h of ['/', '/yetkiler', '/bildirimler', '/talepler', '/bulten', '/gorevler', '/onaylar', '/soru-havuzu', '/geri-bildirim']) {
      await dir.page.evaluate((x) => (location.hash = x), h); await settle(dir.page, 700);
      out[h] = /Kutay|soybil/i.test(await text(dir.page));
    }
    // Kaldırılanlar listesi + yeniden etkinleştir (22)
    await dir.page.evaluate(() => (location.hash = '/')); await settle(dir.page);
    M(16, 'direktör ekranlarında geliştirici adı/e-postası görünüyor mu', out);
    // 23: ops rolünde talep yanıt kutusu
    await dir.c.close();
    const ops = await ctx('ops');
    await staffLogin(ops, staff('ops'));
    await ops.page.evaluate(() => (location.hash = '/talepler')); await settle(ops.page);
    await ops.page.getByText('GELİŞTİRİCİ AÇACAK').first().click({ timeout: 8000 }).catch(() => {});
    await ops.page.waitForTimeout(800);
    await ops.page.screenshot({ path: `${OUT}ss2/ops-talep.png` });
    M(23, 'ops: talep yanıt kutusu sayısı', { textarea: await ops.page.locator('textarea').count(), talepAcik: /Talebi açan|Mağaza|GELİŞTİRİCİ AÇACAK/.test(await text(ops.page)) });
    await ops.c.close();
  } catch (e) { M(16, 'hata', e.message.slice(0, 300)); }
  save();
}

// =============================================================== YETKİ (22, 23 kurulYanit)
if (on('yetki')) {
  try {
    const dir = await ctx('direktor-yetki');
    await staffLogin(dir, staff('director'));
    // 22a: kaldırılan ekip üyesi → Kaldırılanlar → Yeniden etkinleştir
    const s = staff('ops', 2);
    await adb.doc(`users/${s.uid}`).update({ active: false });
    await dir.page.evaluate(() => (location.hash = '/')); await settle(dir.page);
    await dir.page.getByRole('button', { name: /Kaldırılanlar/ }).first().click({ timeout: 8000 });
    await dir.page.waitForTimeout(500);
    await dir.page.getByRole('button', { name: 'Yeniden etkinleştir' }).first().click({ timeout: 8000 });
    await sleep(1500);
    M(22, 'Yeniden etkinleştir', { active: (await adb.doc(`users/${s.uid}`).get()).get('active') });
    // 22b: Yetkiler'de hızlı art arda iki değişiklik
    await dir.page.evaluate(() => (location.hash = '/yetkiler')); await settle(dir.page);
    const before = ((await adb.doc('config/permissions').get()).get('log') || []).length;
    const sw = dir.page.locator('button[aria-pressed][aria-label^="Kahve Operasyonu:"], button[aria-pressed][aria-label*="Kahve Operasyonu ekibi"]');
    const n = await sw.count();
    let clicked = 0;
    if (n < 2) M(22, 'anahtar etiketleri', await dir.page.locator('button[aria-pressed]').evaluateAll((xs) => xs.slice(0, 8).map((x) => x.getAttribute('aria-label'))));
    const sw2 = n >= 2 ? sw : dir.page.locator('button[aria-pressed]');
    const n2 = await sw2.count();
    await Promise.all([sw2.nth(n2 - 1).click(), sw2.nth(n2 - 2).click()]); clicked = 2;
    await sleep(2500);
    const after = ((await adb.doc('config/permissions').get()).get('log') || []).length;
    const log = ((await adb.doc('config/permissions').get()).get('log') || []).slice(-2).map((l) => l.text);
    M(22, 'iki hızlı değişiklik → günlük satırı', { anahtar: n, tiklanan: clicked, onceki: before, sonraki: after, eklenen: after - before, sonIki: log });
    await sw2.nth(n2 - 1).click(); await sleep(800); await sw2.nth(n2 - 2).click(); await sleep(800);
    // 23b: kurulYanit kapalı → direktör kurul sorusunda yanıt kutusu
    const bq = (await adb.collection('boardQuestions').limit(1).get()).docs[0];
    await adb.doc('config/permissions').set({ roles: { director: { kurulYanit: false } } }, { merge: true });
    await sleep(800);
    await dir.page.evaluate(() => (location.hash = '/kurul-sorulari')); await settle(dir.page);
    await dir.page.getByRole('button', { name: /^Hepsi/ }).first().click().catch(() => {});
    await dir.page.waitForTimeout(400);
    if (bq) await dir.page.getByText(bq.get('topic')?.title || 'Pendik').first().click({ timeout: 5000 }).catch(() => {});
    await dir.page.waitForTimeout(800);
    const ta = await dir.page.locator('textarea').count();
    const yetkiYokMetni = /yanıtlama yetkin yok/.test(await text(dir.page));
    await adb.doc('config/permissions').set({ roles: { director: { kurulYanit: true } } }, { merge: true });
    await sleep(800);
    const ta2 = await dir.page.locator('textarea').count();
    M(23, 'kurulYanit kapalı/açık: yanıt kutusu', { kapali: ta, acik: ta2, kapaliyken_metin: yetkiYokMetni, soruVar: !!bq });
    // 26: relDays — uygulamanın kendi işlevi
    const rd = await dir.page.evaluate(async () => {
      const m = await import('/src/ui/kit.tsx');
      const d = new Date(); const at = (h, mm = 0, off = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + off, h, mm).getTime();
      const due = (off) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + off, 23, 59).getTime();
      return { bugun0800: m.relDays(due(0), at(8)), bugun1100: m.relDays(due(0), at(11)), bugun2330: m.relDays(due(0), at(23, 30)), yarin0900: m.relDays(due(1), at(9)), dun: m.relDays(due(-1), at(8)), ucGun: m.relDays(due(3), at(8)) };
    });
    M(26, 'relDays', rd);
    await dir.c.close();
  } catch (e) { M(22, 'hata', e.message.slice(0, 300)); }
  save();
}

// =============================================================== GÖREVLER (21) + 20 panel çevrimdışı bülten/soru
if (on('gorev')) {
  try {
    const now = Date.now();
    const dirS = staff('director');
    const emptyStore = 'bos-magaza';
    await adb.doc(`stores/${emptyStore}`).set({ name: 'Boş Mağaza', city: 'İstanbul', active: true, createdAt: now });
    const gone = H.baristas.find((b) => b.id === 'yb-30');
    const base = { note: '', dueAt: now - 86400000, createdAt: now - 2 * 86400000, createdBy: dirS.uid, createdByName: 'Cenk' };
    await adb.doc('assignments/g-bos').set({ ...base, kind: 'module', targetId: 'hos-geldin', title: 'GÖREV boş mağaza', storeId: emptyStore, baristaId: null });
    await adb.doc('assignments/g-ayrilan').set({ ...base, kind: 'module', targetId: 'hos-geldin', title: 'GÖREV ayrılan barista', storeId: gone.storeId, baristaId: gone.id });
    await adb.doc('assignments/g-silinmis').set({ ...base, kind: 'lesson', targetId: 'silinmis-ders-xyz', title: 'GÖREV silinmiş ders', storeId: 'pendik', baristaId: null });
    const dir = await ctx('direktor-gorev');
    await staffLogin(dir, staff('director'));
    await dir.page.evaluate(() => (location.hash = '/gorevler')); await settle(dir.page);
    const t = await text(dir.page);
    M(21, 'Görevler ekranı', { gecersizBolumu: /(Geçersiz|GEÇERSİZ) · \d+/.test(t), gecersizSayi: (t.match(/(?:Geçersiz|GEÇERSİZ) · (\d+)/) || [])[1] || null, gecersizRozet: (t.match(/Geçersiz/g) || []).length, ucuDaListede: ['GÖREV boş mağaza', 'GÖREV ayrılan barista', 'GÖREV silinmiş ders'].map((x) => t.includes(x)) });
    await dir.page.evaluate(() => (location.hash = '/')); await settle(dir.page);
    const ana = await text(dir.page);
    M(21, 'Genel bakış gecikmiş görev (geçersizler sayılmamalı)', (ana.match(/Gecikmiş görev\s*\n?\s*(\d+)/) || [])[1] || null);
    // Yeni ürün boş mağazaya görev açmıyor: kod yolu (taskStores) — form doldurulmadan; mağaza listesinde boş mağaza var
    // 20: panel çevrimdışı bülten
    await dir.page.evaluate(() => (location.hash = '/bulten')); await settle(dir.page);
    await dir.page.getByRole('button', { name: /Yeni bülten|Yeni/ }).first().click({ timeout: 5000 });
    await dir.page.waitForTimeout(600);
    const titleInp = dir.page.locator('input').filter({ hasNot: dir.page.locator('[type=search]') });
    await dir.page.locator('input[placeholder*="Başlık"], input').nth(0).fill('ÇEVRİMDIŞI BÜLTEN');
    await dir.page.locator('textarea').first().fill('Çevrimdışı bülten gövdesi');
    void titleInp;
    await dir.c.setOffline(true);
    await dir.page.getByRole('button', { name: /^Yayınla$|Kaydet|Yayınla/ }).last().click({ timeout: 5000 });
    await dir.page.waitForTimeout(3000);
    const bt = await text(dir.page);
    await dir.page.screenshot({ path: `${OUT}ss2/panel-cevrimdisi-bulten.png` });
    await dir.c.setOffline(false);
    let ok = false; for (let k = 0; k < 30 && !ok; k++) { await sleep(500); ok = !(await adb.collection('bulletins').where('title', '==', 'ÇEVRİMDIŞI BÜLTEN').get()).empty; }
    M(20, 'panel bülten çevrimdışı', { mesaj: /bağlantı gelince gönderilecek/.test(bt), baglantiGelinceKayit: ok, ekran: bt.slice(0, 200) });
    await dir.c.close();
  } catch (e) { M(21, 'hata', e.message.slice(0, 300)); }
  save();
}

// =============================================================== KOTA (K1, K2, K3, B9, A27)
if (on('kota')) {
  const dir = await ctx('kota-direktor');
  const g = await staffLogin(dir, staff('director'));
  const ana = await text(dir.page);
  const m7 = ana.match(/Son 7 günde sınav\s*\n?\s*(\d+)/);
  const from7 = (() => { const d = new Date(Date.now() - 6 * 86400000); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })();
  const real7 = (await adb.collection('attempts').where('submittedAt', '>=', from7).get()).docs.filter((d) => !d.get('voided') && !d.get('lessonId')).length;
  const a0 = await fs(dir.page);
  await dir.page.getByRole('button', { name: 'Soruları göster' }).click();
  await settle(dir.page);
  const a1 = await fs(dir.page);
  const yanlis = /Doğru:/.test(await text(dir.page));
  await dir.page.screenshot({ path: `${OUT}ss2/kota-genel-bakis.png` }).catch(() => {});
  M('K2', 'Genel bakış', { girisOkuma: g.okuma, son7: m7 ? +m7[1] : null, gercek: real7, yanlislarDugmeOkuma: a1.r - a0.r, yanlislarListesi: yanlis });
  const r = await screen(dir, '/rozetler', 'Rozetler (kota)');
  const b0 = await fs(dir.page);
  const hasBtn = await dir.page.getByRole('button', { name: /Önlük durumunu hesapla/ }).count();
  if (hasBtn) await dir.page.getByRole('button', { name: /Önlük durumunu hesapla/ }).click();
  await settle(dir.page, 1200, 60000);
  const b1 = await fs(dir.page);
  const rt = await text(dir.page);
  await dir.page.screenshot({ path: `${OUT}ss2/kota-rozetler.png` }).catch(() => {});
  M('K1', 'Rozetler', { acilisOkuma: r.okuma, dugme: !!hasBtn, hesaplaOkuma: b1.r - b0.r, liste: /Teslim edildi|Önlükten al|teslim bekliyor/.test(rt) || /önlükte/.test(rt) });
  await dir.c.close();

  const brd = await ctx('kota-kurul');
  const gk = await staffLogin(brd, staff('board'));
  const per = {};
  for (const lab of ['Son 90 gün', 'Bu ay', 'Geçen ay', 'Bu yıl', 'Son 30 gün']) {
    const a = await fs(brd.page);
    await brd.page.getByRole('button', { name: lab }).first().click();
    await settle(brd.page, 900);
    const b = await fs(brd.page);
    const t = await text(brd.page);
    per[lab] = { okuma: b.r - a.r, ozet: (t.match(/Baristalar \d+ sınava[^\n]*/) || [])[0] || (t.match(/Bu dönemde sınav yapılmadı/) || [])[0] || null };
  }
  const st = await screen(brd, '/magazalar', 'Kurul mağazalar (kota)');
  const is = await screen(brd, '/isler', 'Kurul süren işler (kota)');
  await brd.page.screenshot({ path: `${OUT}ss2/kota-kurul.png` }).catch(() => {});
  M('K3', 'Kurul', { girisOkuma: gk.okuma, donem: per, magazalarOkuma: st.okuma, islerOkuma: is.okuma });
  await brd.c.close();

  // B9 + A27: aynı telefonda iki barista aynı modülün sınavına girer (havuz önbellekten)
  const ph = H.phones.find((p) => p.storeId === 'pendik');
  const x = await ctx('kota-telefon', PHONE);
  await pairPhone(x, ph);
  const bs = H.baristas.filter((b) => b.storeId === 'pendik' && b.pin && !['yb-30', 'yb-45'].includes(b.id));
  const hasQ = new Set((await adb.collection('questions').select('moduleId').get()).docs.map((d) => d.get('moduleId')));
  const okFor = async (b, m) => {
    const mine = (await adb.collection('attempts').where('baristaId', '==', b.id).get()).docs.map((d) => d.data());
    const prog = (await adb.doc(`progress/${b.id}`).get()).data() || {};
    return (!m.prerequisiteId || prog.modules?.[m.prerequisiteId]) && mine.filter((a) => a.moduleId === m.id && a.startedAt > Date.now() - 7 * 86400000 && !a.voided).length < 2 && !mine.some((a) => a.moduleId === m.id && !a.submittedAt);
  };
  let mod = null; const two = [];
  for (const m of CUR.modules.filter((m) => m.published && hasQ.has(m.id))) {
    const ok = []; for (const b of bs) if (await okFor(b, m)) ok.push(b);
    if (ok.length >= 2) { mod = m; two.push(ok[0], ok[1]); break; }
  }
  const runs = [];
  for (const b of two) {
    await baristaLogin(x, b);
    const e0 = await fs(x.page);
    await x.page.evaluate((h) => (location.hash = h), `/sinav/${mod.id}`); await settle(x.page);
    const intro = await text(x.page);
    const e1 = await fs(x.page);
    await x.page.getByRole('button', { name: /Başla|devam et/ }).click({ timeout: 8000 });
    await x.page.locator('button.text-left').first().waitFor({ timeout: 30000 });
    await settle(x.page, 600);
    const e2 = await fs(x.page);
    const shown = (await text(x.page)).match(/(\d+)\s*\/\s*(\d+)/);
    runs.push({ barista: b.id, girisSoruSayisi: (intro.match(/Soru sayısı\s*\n?\s*(\S+)/) || [])[1] || null, ekranOkuma: e1.r - e0.r, baslaOkuma: e2.r - e1.r, sinavdaSoru: shown ? +shown[2] : null, havuzKalemi: sumBy(e1, e2, (k) => k.includes('questions')) });
    await x.page.evaluate(() => (location.hash = '/'));
    await x.page.waitForTimeout(600);
    await baristaLogout(x).catch(() => {});
  }
  const active = (await adb.collection('questions').where('moduleId', '==', mod.id).get()).docs.filter((d) => !d.get('disabled')).length;
  M('B9', 'aynı telefonda iki barista aynı modül', { modul: mod.id, examSize: mod.examSize, etkinSoru: active, runs });
  // A27: sorusu kalmayan modül: giriş ekranı
  const zm = CUR.modules.find((m) => m.published && m.id !== mod.id && !m.prerequisiteId);
  const zq = (await adb.collection('questions').where('moduleId', '==', zm.id).get()).docs;
  const zb = adb.batch(); zq.forEach((d) => zb.update(d.ref, { disabled: true })); await zb.commit();
  await baristaLogin(x, bs[bs.length - 1]);
  await x.page.evaluate((h) => (location.hash = h), `/sinav/${zm.id}`); await settle(x.page, 1200);
  const zt = await text(x.page);
  await x.page.screenshot({ path: `${OUT}ss2/kota-sorusuz-modul.png` }).catch(() => {});
  const startDisabled = await x.page.getByRole('button', { name: /^Başla$/ }).isDisabled().catch(() => null);
  await x.page.evaluate((h) => (location.hash = h), `/modul/${zm.id}`); await settle(x.page, 900);
  const mt = await text(x.page);
  const zb2 = adb.batch(); zq.forEach((d) => zb2.update(d.ref, { disabled: d.get('disabled') ?? false })); await zb2.commit();
  M('A27', 'sorusuz modül', { modul: zm.id, girisMesaj: /Bu modülde şu an soru yok/.test(zt), soruSayisi: (zt.match(/Soru sayısı\s*\n?\s*(\S+)/) || [])[1] || null, baslaKapali: startDisabled, modulSayfasi: /Bu modülde şu an soru yok/.test(mt) });
  await x.c.close();
  save();
}

R.hatalarKoleksiyonu = (await adb.collection('hatalar').get()).docs.map((d) => ({ kind: d.get('kind'), message: d.get('message'), path: d.get('path'), role: d.get('role') }));
save();
await browser.close();
console.log('bitti; sayfa/konsol hatası', R.hatalar.length);
process.exit(0);
