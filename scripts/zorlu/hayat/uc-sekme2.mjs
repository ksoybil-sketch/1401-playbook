// 3.x (sonra) H14: bir sekmeden çıkış, öteki sekmedeki kaydedilmemiş işi soruyor mu? Vazgeç → oturum kalır; Tamam → çıkar.
import { chromium, BASE, ready, save, txt, staffLogin } from './lib.mjs';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
const p1 = await ctx.newPage();
await staffLogin(p1, 'director');
const p2 = await ctx.newPage();
await p2.goto(BASE + '/#/rozetler'); await ready(p2, 60000); await p2.waitForTimeout(1500);
await p2.locator('input[type=number]').first().fill('9');
const res = { dialoglar: [] };
let accept = false;
p1.on('dialog', (d) => { res.dialoglar.push(d.message()); (accept ? d.accept() : d.dismiss()).catch(() => {}); });
await p1.getByRole('button', { name: /Çıkış/ }).first().click(); await p1.waitForTimeout(2500);
res.vazgec_sonra = (await txt(p1)).includes('Genel bakış') ? 'oturum açık' : 'çıkıldı';
accept = true;
await p1.getByRole('button', { name: /Çıkış/ }).first().click(); await p1.waitForTimeout(3500);
res.tamam_sonra = (await txt(p1)).includes('Mağaza telefonunu bağla') ? 'çıkıldı' : 'oturum açık';
await browser.close();
console.log(JSON.stringify(res, null, 1)); save('uc-sekme2.json', res); process.exit(0);
