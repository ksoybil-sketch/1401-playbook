// 3.1 İlk gününde Deniz: yanlış davet kodu, ders yarıda, sınava girmeden çıkış, PIN unutma, ertesi gün devam.
import { chromium, baristaLogin, BASE, ready, save, txt, grab, phoneCtx } from './lib.mjs';
import { db, DAY } from './admin.mjs';
const res = { adim: [] };
const A = (k, v) => { res.adim.push([k, v]); console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };
const pad = async (page, digits) => { for (const d of digits) { await page.getByRole('button', { name: d, exact: true }).click(); await page.waitForTimeout(120); } };
const title = (page) => page.locator('h1').first().innerText().catch(() => '');
const browser = await chromium.launch();
// Deniz'i baştan al: davet kodu 246810 geçerli olsun
const inv = await db.doc('invites/246810').get();
A('davet var mı', inv.exists);
let ctx = await phoneCtx(browser, {});
let page = await ctx.newPage();
await page.goto(BASE + '/#/'); await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 }); await page.waitForTimeout(800);
A('listede Deniz', (await txt(page)).includes('Deniz Aydın'));
await page.getByText('Yeni misin?').click(); await page.waitForTimeout(800);
// yanlış kod
await pad(page, '111111'); A('kod sonrası başlık', await title(page));
await pad(page, '4826'); await pad(page, '4826'); await page.waitForTimeout(3000);
A('yanlış kod: başlık', await title(page)); A('yanlış kod: hata', await grab(page, /Davet kodu[^\n]*|İnternet[^\n]*/));
// zayıf PIN (doğru kodla)
await pad(page, '246810'); await pad(page, '1111'); await pad(page, '1111'); await page.waitForTimeout(2500);
A('zayıf PIN: başlık', await title(page)); A('zayıf PIN: hata', await grab(page, /Bu PIN[^\n]*/));
await pad(page, '4826'); await pad(page, '4826'); await page.waitForTimeout(6000); await ready(page);
A('davet sonrası', (await txt(page)).split('\n').slice(0, 5).join(' | '));
// ders yarıda: ilk "Kaldığın ders"
const lessonTile = page.getByText('Kaldığın ders').first();
let lessonUrl = null;
if (await lessonTile.count()) { await lessonTile.click(); await page.waitForTimeout(2000); lessonUrl = new URL(page.url()).hash; await page.mouse.wheel(0, 1500); await page.waitForTimeout(600); A('ders', { lessonUrl, scrollY: await page.evaluate(() => scrollY), h: await page.evaluate(() => document.body.scrollHeight) }); }
else A('ders', 'Kaldığın ders kutusu yok: ' + (await txt(page)).slice(0, 200));
// sınava girmeden çıkış
const before = (await db.collection('attempts').where('baristaId', '==', 'demo-yeni').get()).size;
await page.goto(BASE + '/#/sinav/hos-geldin'); await ready(page); await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Kapat' }).first().click(); await page.waitForTimeout(1200);
A('sınava girmeden çıkış: yeni deneme', (await db.collection('attempts').where('baristaId', '==', 'demo-yeni').get()).size - before);
A('çıkış sonrası adres', new URL(page.url()).hash);
await ctx.close();
// ertesi gün: PIN'i unuttu
ctx = await phoneCtx(browser, { at: Date.now() + DAY });
page = await ctx.newPage();
await page.goto(BASE + '/#/'); await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 }); await page.waitForTimeout(800);
await page.getByRole('button', { name: /Deniz Aydın/ }).first().click(); await page.waitForTimeout(500);
const errs = [];
for (const p of ['1234', '4862', '8426', '2648', '6482', '4268']) { await pad(page, p); await page.waitForTimeout(1800); errs.push(await grab(page, /PIN hatalı[^\n]*|Çok fazla[^\n]*|İnternet[^\n]*/)); }
A('6 yanlış PIN', errs);
await page.getByRole('button', { name: "PIN'imi unuttum" }).click(); await page.waitForTimeout(400);
A('PIN unuttum metni', await grab(page, /PIN'ini unuttuysan[^\n]*/));
await page.getByRole('button', { name: /Başka barista/ }).click(); await page.waitForTimeout(500);
// Mağaza müdürü Ayşe: Ekibim → Deniz → PIN sıfırlama iste
await page.getByRole('button', { name: /Ayşe Demir/ }).first().click(); await page.waitForTimeout(400);
await pad(page, '1925'); await page.waitForTimeout(2500); await ready(page);
await page.goto(BASE + '/#/ekip'); await ready(page); await page.waitForTimeout(1500);
await page.getByText('Deniz Aydın').first().click(); await page.waitForTimeout(1200);
page.once('dialog', (d) => d.accept());
const ask = page.getByRole('button', { name: /PIN sıfırlama iste/ });
A('PIN sıfırlama düğmesi', await ask.count());
if (await ask.count()) { await ask.click(); await page.waitForTimeout(2500); }
const rq = (await db.collection('requests').where('title', '==', 'Deniz Aydın için PIN sıfırlama').get()).docs.map((d) => d.data());
A('talep oluştu', rq.map((r) => `${r.status} ${r.category}`));
await ctx.close();
// Bölge Müdürü sıfırlar → yeni davet kodu → Deniz yeni PIN ile girer
const st = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
const sp = await st.newPage();
const { staffLogin } = await import('./lib.mjs');
await staffLogin(sp, 'regional');
const b = { id: 'demo-yeni', ...(await db.doc('baristas/demo-yeni').get()).data() };
const r = await sp.evaluate(async (b) => { const { backend } = await import('/src/api/backend.ts'); return backend.resetBaristaPin(b, 'Test'); }, b);
A('yeni kod', !!r.code);
await st.close();
ctx = await phoneCtx(browser, { at: Date.now() + DAY + 3600000 });
page = await ctx.newPage();
await page.goto(BASE + '/#/'); await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 }); await page.waitForTimeout(800);
A('sıfırlama sonrası listede Deniz', (await txt(page)).includes('Deniz Aydın'));
await page.getByText('Yeni misin?').click(); await page.waitForTimeout(600);
await pad(page, r.code); await pad(page, '5937'); await pad(page, '5937'); await page.waitForTimeout(6000); await ready(page);
A('yeniden giriş', (await txt(page)).split('\n').slice(0, 3).join(' | '));
const tile = page.getByText('Kaldığın ders').first();
if (await tile.count()) { await tile.click(); await page.waitForTimeout(2000); A('ertesi gün ders', { url: new URL(page.url()).hash, ayni: new URL(page.url()).hash === lessonUrl, scrollY: await page.evaluate(() => scrollY) }); }
await ctx.close();
await browser.close();
save('ilk-gun.json', res);
process.exit(0);
