// Pencere (Sheet) klavye davranışı: odak içeri giriyor mu, tuzak, Esc, odak geri dönüşü.
import { chromium, BASE, save, ready, staffLogin } from './lib.mjs';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
const page = await ctx.newPage();
await staffLogin(page, 'regional');
await page.goto(BASE + '/#/gorevler'); await ready(page); await page.waitForTimeout(1000);
const btns = await page.getByRole('button').allInnerTexts();
const pick = btns.find((b) => /Görev ata|Yeni görev|Görev ekle/.test(b));
const res = { aday: pick || btns.slice(0, 12) };
if (pick) {
  const b = page.getByRole('button', { name: pick.trim() }).first();
  await b.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  res.pencere = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return { var: !!d, ariaModal: d?.getAttribute('aria-modal'), adi: d?.getAttribute('aria-labelledby') || d?.getAttribute('aria-label') || null, odakIcinde: !!d && d.contains(document.activeElement), aktif: (document.activeElement?.innerText || document.activeElement?.tagName || '').slice(0, 30) }; });
  for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
  res.pencere.tab30SonraIcinde = await page.evaluate(() => !!document.querySelector('[role=dialog]')?.contains(document.activeElement));
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  res.pencere.escKapatti = !(await page.locator('[role=dialog]').count());
  res.pencere.odakSonra = await page.evaluate(() => (document.activeElement?.innerText || document.activeElement?.tagName || '').slice(0, 30));
}
console.log(JSON.stringify(res)); save('erisim-pencere.json', res);
await browser.close();
