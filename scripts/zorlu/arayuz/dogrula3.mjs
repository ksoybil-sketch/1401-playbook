// Geçiş 7: "Baristayı düzenle" açıkken tarayıcı geri → kaydet başka baristaya mı yazıyor?
import { writeFileSync } from 'fs';
import { join } from 'path';
import { chromium, BASE, OUT, newCtx, watch, staffLogin, ready, shotPath } from './lib.mjs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const db = getFirestore();
const res = [];
const log = (r) => { res.push(r); console.log(JSON.stringify(r).slice(0, 500)); };
const browser = await chromium.launch();
const ctx = await newCtx(browser, 's1280');
const p = await ctx.newPage(); const errs = []; watch(p, errs);
await staffLogin(p, 'regional');
try {
  const before = { mehmet: (await db.doc('baristas/demo-mehmet').get()).data().name, ayse: (await db.doc('baristas/demo-ayse').get()).data().name };
  await p.goto(BASE + '/#/baristalar/demo-mehmet'); await ready(p); await p.waitForTimeout(1500);
  await p.evaluate(() => { location.hash = '#/baristalar/demo-ayse'; }); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: 'Düzenle' }).first().click(); await p.waitForTimeout(800);
  const nameInDialog = await p.getByRole('dialog').locator('input').first().inputValue();
  await p.goBack(); await p.waitForTimeout(2500);
  const h = await p.locator('h1').first().innerText().catch(() => '');
  const open = await p.getByRole('dialog').count();
  const nameAfterBack = open ? await p.getByRole('dialog').locator('input').first().inputValue() : null;
  await p.screenshot({ path: shotPath('v-duzenle-geri') });
  let saved = null;
  if (open) {
    await p.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click(); await p.waitForTimeout(3000);
    saved = { mehmet: (await db.doc('baristas/demo-mehmet').get()).data().name, ayse: (await db.doc('baristas/demo-ayse').get()).data().name };
  }
  log({ test: 'duzenle-acikken-geri-kaydet', before, nameInDialog, sayfaBasligi: h, pencereAcik: open, nameAfterBack, saved });
} catch (e) { log({ error: String(e.message).slice(0, 300) }); }
writeFileSync(join(OUT, 'dogrula3.json'), JSON.stringify(res, null, 1));
await browser.close();
process.exit(0);
