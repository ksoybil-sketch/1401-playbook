// Geçiş 6: barista sayfaları arasında geçişte "Görev ata" penceresinin hedefi.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { chromium, BASE, OUT, newCtx, watch, staffLogin, ready, shotPath } from './lib.mjs';
const res = [];
const log = (r) => { res.push(r); console.log(JSON.stringify(r).slice(0, 500)); };
const browser = await chromium.launch();
const ctx = await newCtx(browser, 's1280');
const p = await ctx.newPage(); const errs = []; watch(p, errs);
await staffLogin(p, 'director');
const kime = async () => p.getByRole('dialog').locator('label', { hasText: 'Kime' }).locator('select').evaluate((s) => s.options[s.selectedIndex]?.text);
try {
  // 1) Uygulama içi geçiş (aynı rota, farklı parametre)
  await p.goto(BASE + '/#/baristalar/demo-mehmet'); await ready(p); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Görev ata' }).first().click(); await p.waitForTimeout(600);
  const k1 = await kime();
  await p.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click(); await p.waitForTimeout(400);
  await p.evaluate(() => { location.hash = '#/baristalar/demo-ayse'; }); await p.waitForTimeout(2000);
  const h1 = await p.locator('h1').first().innerText();
  await p.getByRole('button', { name: 'Görev ata' }).first().click(); await p.waitForTimeout(600);
  const k2 = await kime();
  await p.screenshot({ path: shotPath('v-gorev-ata-eski-hedef') });
  log({ test: 'gorev-ata-hedef-gecis', mehmetSayfasinda: k1, sayfaBasligi: h1, ayseSayfasindaKime: k2 });
  await p.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click(); await p.waitForTimeout(400);
  // 2) Pencere açıkken tarayıcı geri
  await p.getByRole('button', { name: 'Görev ata' }).first().click(); await p.waitForTimeout(600);
  await p.goBack(); await p.waitForTimeout(2000);
  const h2 = await p.locator('h1').first().innerText().catch(() => '');
  const open = await p.getByRole('dialog').count();
  const k3 = open ? await kime() : null;
  await p.screenshot({ path: shotPath('v-gorev-ata-geri') });
  log({ test: 'gorev-ata-acikken-geri', url: new URL(p.url()).hash, sayfaBasligi: h2, pencereAcik: open, kime: k3 });
} catch (e) { log({ error: String(e.message).slice(0, 300) }); }
writeFileSync(join(OUT, 'dogrula2.json'), JSON.stringify(res, null, 1));
await browser.close();
process.exit(0);
