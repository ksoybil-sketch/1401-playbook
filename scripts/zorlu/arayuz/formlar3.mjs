// Geçiş 3: formlara uç değerler, çift/üçlü tıklama, Firestore'da sayım.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { ready, chromium, BASE, OUT, EK, newCtx, watch, staffLogin, baristaLogin, measure, shotPath } from './lib.mjs';
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
  await staffLogin(p, 'regional');

  await T('magaza-bos-ad', async () => {
    await p.goto(BASE + '/#/magazalar'); await ready(p); await p.waitForTimeout(1500);
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
    await p.goto(BASE + '/#/baristalar'); await ready(p); await p.waitForTimeout(1500);
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

  await ctx.close();
}
writeFileSync(join(OUT, 'formlar3.json'), JSON.stringify(res, null, 1));
await browser.close();
process.exit(0);
