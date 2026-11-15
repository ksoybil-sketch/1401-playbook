// Çıkıştan sonra aynı sekmede yönetici girişine dönüş (adres ve düğme).
import { chromium, BASE, txt, staffLogin, save } from './lib.mjs';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
const p = await ctx.newPage();
await staffLogin(p, 'director');
await p.getByRole('button', { name: /Çıkış/ }).first().click(); await p.waitForTimeout(3000);
const r = { afterLogout: new URL(p.url()).hash };
await p.goto(BASE + '/#/yonetici-girisi'); await p.waitForTimeout(2500);
r.gotoHash = new URL(p.url()).hash; r.emailInput = await p.locator('input[type=email]').count();
await p.getByRole('button', { name: /Kahve Operasyonu g/ }).first().click().catch(() => {}); await p.waitForTimeout(2000);
r.afterButton = new URL(p.url()).hash; r.emailInput2 = await p.locator('input[type=email]').count();
await p.reload(); await p.waitForTimeout(3000); r.afterReload = new URL(p.url()).hash; r.emailInput3 = await p.locator('input[type=email]').count();
console.log(JSON.stringify(r)); save('cikis-giris.json', r);
await browser.close();
