// Geçiş 5: şüpheli bulguları görünür alan ekran görüntüsüyle elle doğrulamak için.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { chromium, BASE, OUT, EK, newCtx, watch, staffLogin, baristaLogin, contrast, shotPath } from './lib.mjs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const db = getFirestore();
const res = [];
const log = (r) => { res.push(r); console.log(JSON.stringify(r).slice(0, 600)); };
const browser = await chromium.launch();
async function T(name, fn) { try { await fn(); } catch (e) { log({ test: name, error: String(e.message || e).slice(0, 300) }); } }
const vshot = (p, n) => p.screenshot({ path: shotPath('v-' + n) });
const only = process.argv[2];
const want = (k) => !only || only.split(',').includes(k);

if (want('kenar')) await T('kenar-cubugu', async () => {
  for (const [w, h] of [[844, 390], [1280, 720], [1280, 800], [1024, 600]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await staffLogin(p, 'developer');
    const r = await p.evaluate(() => {
      const links = [...document.querySelectorAll('aside nav a')];
      const nav = document.querySelector('aside nav');
      return { n: links.length, h: links.map((a) => Math.round(a.getBoundingClientRect().height)), navScroll: nav ? [nav.scrollHeight, nav.clientHeight] : null };
    });
    await vshot(p, `kenar-${w}x${h}`);
    log({ test: 'kenar-cubugu', size: `${w}x${h}`, linkYukseklik: [...new Set(r.h)], n: r.n, navScroll: r.navScroll });
    await ctx.close();
  }
});

if (want('icerik')) await T('icerik-360', async () => {
  const ctx = await newCtx(browser, 's360');
  const p = await ctx.newPage();
  await staffLogin(p, 'director');
  await p.goto(BASE + '/#/icerik'); await p.waitForTimeout(2500);
  const unnamed = await p.evaluate(() => [...document.querySelectorAll('button,a')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && !(b.getAttribute('aria-label') || b.innerText.trim() || b.title); }).slice(0, 6).map((b) => ({ html: b.outerHTML.slice(0, 220), title: b.title })));
  log({ test: 'icerik-adsiz-dugme', unnamed });
  await p.locator('text=İtalyan Klasikler').first().scrollIntoViewIfNeeded();
  await vshot(p, 'icerik-360');
  await p.goto(BASE + '/#/talepler/istatistik'); await p.waitForTimeout(2500);
  await p.locator('text=Yönetici onayı bekleniyor').first().scrollIntoViewIfNeeded().catch(() => {});
  await vshot(p, 'istatistik-360');
  await p.goto(BASE + '/#/yetkiler'); await p.waitForTimeout(2500);
  await vshot(p, 'yetkiler-360');
  await p.goto(BASE + '/#/baristalar/kb-02'); await p.waitForTimeout(2500);
  await vshot(p, 'barista-uzun-ad-360');
  await p.goto(BASE + '/#/gorevler'); await p.waitForTimeout(3000);
  const g = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, rows: document.querySelectorAll('main li, main [class*=listRow], main a[href*="baristalar"]').length }));
  log({ test: 'gorevler-300', sayfaYuksekligi: g.h, satir: g.rows });
  await vshot(p, 'gorevler-360');
  await p.goto(BASE + '/#/baristalar/demo-mehmet'); await p.waitForTimeout(3000);
  log({ test: 'mehmet-detay-300', sayfaYuksekligi: await p.evaluate(() => document.documentElement.scrollHeight) });
  // Espresso karşıtlığı
  const out = {};
  for (const r of ['/', '/baristalar', '/talepler', '/soru-havuzu']) { await p.goto(BASE + '/#' + r); await p.waitForTimeout(2000); out[r] = (await contrast(p)).slice(0, 5).map((c) => `${c.ratio} ${c.color} "${c.txt}"`); }
  log({ test: 'espresso-karsitlik', out });
  await ctx.close();
});

if (want('gunisigi')) await T('gunisigi', async () => {
  await db.doc('progress/demo-ayse').set({ modules: { 'acilis-kapanis': { score: 95, passedAt: Date.now() - 86400000 } }, theme: 'gunisigi' }, { merge: true });
  const ctx = await newCtx(browser, 's390', { device: EK.modaDevice });
  const p = await ctx.newPage();
  await baristaLogin(p, 'Ayşe Demir', '1925');
  await p.waitForTimeout(2000);
  log({ test: 'gunisigi-tema', dataTheme: await p.evaluate(() => document.documentElement.getAttribute('data-theme')) });
  for (const r of ['/', '/akademi', '/receteler', '/sonuclarim']) {
    await p.goto(BASE + '/#' + r); await p.waitForTimeout(2000);
    await vshot(p, 'gunisigi' + r.replace(/\//g, '_'));
    const c = await contrast(p);
    log({ test: 'gunisigi-karsitlik', r, kotu: c.filter((x) => x.ratio < 3).map((x) => `${x.ratio} ${x.color} "${x.txt}"`) });
  }
  await ctx.close();
  await db.doc('progress/demo-ayse').update({ theme: FieldValue.delete() });
});

if (want('kalabalik')) await T('kalabalik', async () => {
  const ctx = await newCtx(browser, 's360', { device: EK.kalDevice });
  const p = await ctx.newPage();
  await p.goto(BASE + '/#/'); await p.waitForTimeout(3500);
  await p.locator('text=Muhammed').first().scrollIntoViewIfNeeded();
  await vshot(p, 'kalabalik-kim-calisiyor');
  await p.locator('text=Şebnem').first().scrollIntoViewIfNeeded();
  await vshot(p, 'kalabalik-emoji');
  await p.locator('text=Muhammed').first().click(); await p.waitForTimeout(800);
  await vshot(p, 'kalabalik-pin-uzun-ad');
  await ctx.close();
  const c2 = await newCtx(browser, 's360', { device: EK.bosDevice });
  const q = await c2.newPage();
  await q.goto(BASE + '/#/'); await q.waitForTimeout(3500);
  await vshot(q, 'bos-sube-telefon');
  await c2.close();
});

if (want('mehmet')) await T('mehmet-300', async () => {
  const ctx = await newCtx(browser, 's390', { device: EK.modaDevice });
  const p = await ctx.newPage(); const errs = []; watch(p, errs);
  const t0 = Date.now();
  await baristaLogin(p, 'Mehmet Kaya', '1925');
  const h = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, txt: (document.body.innerText.match(/GÖREVLERİN[^\n]*/i) || [''])[0] }));
  await p.locator('text=/GÖREVLERİN/i').first().scrollIntoViewIfNeeded().catch(() => {});
  await vshot(p, 'mehmet-300-gorev');
  log({ test: 'mehmet-ana-sayfa', ms: Date.now() - t0, sayfaYuksekligi: h.h, baslik: h.txt, errs: errs.slice(0, 3) });
  await ctx.close();
  const c2 = await newCtx(browser, 's390', { device: EK.modaDevice });
  const q = await c2.newPage();
  await baristaLogin(q, 'Ayşe Demir', '1925');
  await q.goto(BASE + '/#/ekip'); await q.waitForTimeout(3000);
  const e = await q.evaluate(() => ({ h: document.documentElement.scrollHeight, label: (document.body.innerText.match(/GÖREVLER · [^\n]*/i) || [''])[0] }));
  log({ test: 'ekip-300', sayfaYuksekligi: e.h, label: e.label });
  await c2.close();
});

writeFileSync(join(OUT, `dogrula-${only || 'hepsi'}.json`), JSON.stringify(res, null, 1));
await browser.close();
process.exit(0);
