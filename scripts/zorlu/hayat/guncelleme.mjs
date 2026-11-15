// 4.3 Güncelleme anı: üretim paketi (5180), sınav sürerken ve kaydedilmemiş düzenlemede yeni sürüm.
import { chromium, save, txt, phoneCtx, answerN, startExamUI, ready, STAFF } from './lib.mjs';
const S = '/private/tmp/claude-501/-Users-kutays-Desktop-Projects-1401-Playbook/3b587317-47ad-4c62-b2ce-6ae7edec1428/scratchpad';
const P = 'http://localhost:5180';
const deploy = (d) => fetch(`${P}/__deploy?dir=${S}/${d}`).then((r) => r.text());
const res = { log: [] };
const L = (...a) => { res.log.push(a.join(' ')); console.log(...a); };
const browser = await chromium.launch();
await deploy('buildA');
async function bLogin(page, name, pin) {
  await page.goto(P + '/#/'); await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 }); await page.waitForTimeout(800);
  await page.getByRole('button', { name: new RegExp(name) }).first().click(); await page.waitForTimeout(500);
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
  await page.waitForTimeout(1500); await ready(page, 45000);
}
async function sLogin(page, role) {
  const [email, pw] = STAFF[role];
  await page.goto(P + '/#/yonetici-girisi');
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(pw);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.waitForURL((u) => !u.hash.includes('yonetici-girisi'), { timeout: 30000 }); await ready(page, 45000); await page.waitForTimeout(800);
}
const vis = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
// U1 — sınav sürerken yeni sürüm
{
  const ctx = await phoneCtx(browser, {});
  const page = await ctx.newPage();
  let loads = 0; page.on('load', () => loads++);
  await bLogin(page, 'Mehmet Kaya', '1925');
  await page.waitForTimeout(1500);
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration()));
  await startExamUI(page, P, 'demleme-turk');
  await answerN(page, 2);
  const l0 = loads;
  L('U1 deploy', await deploy('buildB'));
  await vis(page); await page.waitForTimeout(3000);
  L('U1 sınavda yenilendi mi:', loads > l0, 'sw:', sw, 'hash:', new URL(page.url()).hash);
  // kalan soruları cevapla ve bitir
  L('U1 ekran:', (await txt(page)).slice(0, 300).replace(/\n/g, ' | '));
  const n = +(await page.locator('span.tnum').first().innerText()).split('/')[1];
  await page.getByRole('button', { name: /Sonraki/ }).click(); await page.waitForTimeout(200);
  await answerN(page, n - 2);
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Sınavı bitir' }).click();
  await page.waitForTimeout(5000);
  const t = await txt(page);
  L('U1 teslim sonrası:', (t.match(/(\d+ puan|Geçtin|Kaldın|Tebrik[^\n]*|Bir şeyler ters gitti)/) || [''])[0]);
  res.U1 = { swRegistered: sw, reloadedDuringExam: loads > l0, result: (t.match(/(\d+ puan|Geçtin|Kaldın|Bir şeyler ters gitti)/) || [''])[0] };
  await ctx.close();
}
// U2 — eski sekmede Müfredatı güncelle (tembel parça yeni sürümde yok) ; U3 — kaydedilmemiş rozet ayarı
{
  await deploy('buildA');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  const dialogs = []; page.on('dialog', async (d) => { dialogs.push(d.type() + ': ' + d.message().slice(0, 80)); await d.dismiss().catch(() => {}); });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 160))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  let loads = 0; page.on('load', () => loads++);
  await sLogin(page, 'director');
  await page.goto(P + '/#/icerik'); await ready(page); await page.waitForTimeout(1500);
  L('U2 deploy', await deploy('buildB'));
  await page.getByRole('button', { name: /Müfredatı güncelle/ }).first().click();
  await page.waitForTimeout(4000);
  const dlg = await page.locator('[role=dialog]').innerText().catch(() => '');
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys(); const out = [];
    for (const k of keys) for (const r of await (await caches.open(k)).keys()) if (/curriculum/.test(r.url)) { const m = await caches.match(r); out.push({ url: r.url.split('/').pop(), type: m.headers.get('content-type') }); }
    return out;
  });
  res.U2 = { dialog: dlg.replace(/\s+/g, ' ').slice(0, 300), crashScreen: (await txt(page)).includes('Bir şeyler ters gitti'), reloaded: loads > 1, swCache: cached, errs: errs.slice(0, 4) };
  L('U2', JSON.stringify(res.U2));
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // U3 — rozet ayarlarında kaydedilmemiş değişiklik + sürüm kontrolü (60 sn sınırı geçsin)
  await page.goto(P + '/#/rozetler'); await ready(page); await page.waitForTimeout(1500);
  const inp = page.locator('input[type=number]').first();
  await inp.click(); await inp.fill('7'); await page.waitForTimeout(500);
  const l0 = loads; dialogs.length = 0;
  await page.waitForTimeout(62000);
  await vis(page); await page.waitForTimeout(4000);
  res.U3 = { reloaded: loads > l0, dialogs: [...dialogs], stillDirtyValue: await inp.inputValue().catch(() => null), hash: new URL(page.url()).hash };
  L('U3', JSON.stringify(res.U3));
  await ctx.close();
}
await browser.close();
save('guncelleme.json', res);
process.exit(0);
