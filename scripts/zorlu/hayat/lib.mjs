// Zorlu senaryo Bölüm 3-4 — tarayıcı yardımcıları (Bölüm 1'in lib.mjs'ini yeniden kullanır).
export * from '../arayuz/lib.mjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
export const HOUT = fileURLToPath(new URL('./out/', import.meta.url));
export const save = (name, data) => writeFileSync(HOUT + name, JSON.stringify(data, null, 1));
export const txt = (page) => page.evaluate(() => document.body.innerText.replace(/\s+\n/g, '\n'));
export const grab = async (page, re) => { const t = await txt(page); const m = t.match(re); return m ? m[0] : null; };

/** Mağaza telefonu bağlamı (eşleşmiş), isteğe bağlı saat ve saat dilimi. */
export async function phoneCtx(browser, { at, tz = 'Europe/Istanbul', device, viewport = { width: 390, height: 844 } } = {}) {
  const { EK } = await import('../arayuz/lib.mjs');
  const dev = device === null ? null : (device || EK.modaDevice);
  const ctx = await browser.newContext({ viewport, locale: 'tr-TR', timezoneId: tz, isMobile: true, hasTouch: true });
  if (dev) await ctx.addInitScript((d) => { try { if (!localStorage.getItem('CapacitorStorage.playbook.device.v2')) localStorage.setItem('CapacitorStorage.playbook.device.v2', JSON.stringify(d)); } catch {} }, dev);
  if (at) await ctx.clock.install({ time: at });
  return ctx;
}
/** Sınavda: n soruyu ilk şıkla cevapla. */
export async function answerN(page, n) {
  for (let i = 0; i < n; i++) {
    await page.locator('div.flex.flex-col.gap-2\\.5 > button').first().click();
    await page.waitForTimeout(250);
    const nx = page.getByRole('button', { name: /Sonraki/ });
    if (i < n - 1 && await nx.count()) await nx.click();
    await page.waitForTimeout(250);
  }
}
export async function startExamUI(page, base, mod) {
  await page.goto(base + `/#/sinav/${mod}`);
  await page.getByRole('button', { name: /^(Başla|Kaldığım yerden devam et)$/ }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^(Başla|Kaldığım yerden devam et)$/ }).click();
  await page.getByText('Kalan süre').waitFor({ timeout: 30000 });
}
