/**
 * Çevrimdışı çalışma testi: mağazada Wi-Fi giderse ne çalışır, ne çalışmaz?
 *
 *   1. npm run emulators   2. npm run seed:emu
 *   3. npx vite build --mode emulator --outDir /tmp/www-emu
 *   4. npx vite preview --outDir /tmp/www-emu --port 4180
 *   5. node scripts/cevrimdisi-test.mjs  [ekran görüntüsü klasörü]
 *
 * Telefon boyutunda bir tarayıcı açar, internet varken mağaza telefonunu
 * bağlar ve bir barista girişi yapar, sonra interneti keser ve sayfayı
 * yeniden yükleyerek her adımı dener. Sonuç tablo olarak yazılır.
 */
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { join } from 'path';
const require = createRequire(new URL('../tanitim/video/package.json', import.meta.url));
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:4180';
const OUT = process.argv[2] || '/tmp/cevrimdisi';
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (step, pass, note = '') => { results.push({ step, pass, note }); console.log(`${pass ? '✓' : '✗'} ${step}${note ? ` — ${note}` : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR', serviceWorkers: 'allow' });
const page = await ctx.newPage();
const shot = (n) => page.screenshot({ path: join(OUT, `${n}.png`) });
const digit = (d) => page.getByRole('button', { name: d, exact: true });
const pin = async (code) => { for (const d of code) await digit(d).click(); };
const visible = (loc, ms = 8000) => loc.first().waitFor({ timeout: ms }).then(() => true).catch(() => false);

// --- İnternet varken: kurulum ---
await page.goto(BASE + '/#/');
await page.getByText('Mağaza telefonunu bağla').waitFor({ timeout: 30000 });
await pin('140114');
await page.getByText('Kim çalışıyor?').waitFor({ timeout: 30000 });
await page.evaluate(() => navigator.serviceWorker?.ready);
await page.getByRole('button', { name: /Reçeteler/ }).click();
await page.waitForURL(/receteler/);
await page.waitForTimeout(2500);
await page.goto(BASE + '/#/');
await page.getByText('Kim çalışıyor?').waitFor();
// Sayfayı bir kez yenile: service worker artık sayfayı kontrol eder ve dosyaları saklar.
await page.reload();
await page.getByText('Kim çalışıyor?').waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
ok('Service worker kuruldu', await page.evaluate(() => !!navigator.serviceWorker?.controller));

// --- İnternet yok: mağaza telefonu ---
await ctx.setOffline(true);
await page.reload().catch(() => {});
ok('İnternetsiz: uygulama açılıyor', await visible(page.getByText(/Kim çalışıyor\?|Sunucuya ulaşılamadı/), 20000));
ok('İnternetsiz: "Kim çalışıyor?" ekranı', await visible(page.getByText('Kim çalışıyor?'), 5000), await page.getByText('Sunucuya ulaşılamadı').isVisible().catch(() => false) ? '"Sunucuya ulaşılamadı" ekranı çıktı' : '');
await shot('1-lobi');

await page.goto(BASE + '/#/receteler').catch(() => {});
const listOk = await visible(page.getByRole('link').filter({ hasText: 'Caffè Latte' }), 15000);
ok('İnternetsiz: reçete listesi', listOk);
await shot('2-receteler');
if (listOk) {
  await page.getByRole('link').filter({ hasText: 'Caffè Latte' }).first().click();
  ok('İnternetsiz: reçete ayrıntısı (ölçüler)', await visible(page.getByText(/8 OZ/i), 10000));
  await shot('3-recete');
}

await page.goto(BASE + '/#/').catch(() => {});
if (await visible(page.getByText('Kim çalışıyor?'), 10000)) {
  await page.getByRole('button', { name: /Mehmet Kaya/ }).click();
  await page.getByText("PIN'ini gir").waitFor();
  await pin('1925');
  const err = await visible(page.locator('text=/bağlan|internet|ulaşıl|çevrimdışı|offline/i'), 15000);
  const inside = await page.getByRole('button', { name: /Çıkış/ }).isVisible().catch(() => false);
  ok('İnternetsiz: barista PIN ile giriş', inside, inside ? '' : err ? 'anlaşılır hata mesajı gösteriyor' : 'giriş olmadı, mesaj belirsiz');
  await shot('4-pin');
}

// --- İnternet varken barista girişi, sonra internet gider ---
await ctx.setOffline(false);
await page.goto(BASE + '/#/');
await page.reload();
await page.getByText('Kim çalışıyor?').waitFor({ timeout: 30000 });
if (!(await page.getByRole('button', { name: /Çıkış/ }).isVisible().catch(() => false))) {
  await page.getByRole('button', { name: /Mehmet Kaya/ }).click();
  await page.getByText("PIN'ini gir").waitFor();
  await pin('1925');
}
await page.getByRole('button', { name: /Çıkış/ }).waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);
await page.goto(BASE + '/#/akademi');
await page.waitForTimeout(2500);
await ctx.setOffline(true);
await page.reload().catch(() => {});
ok('İnternetsiz: barista oturumu yeniden açılınca sürüyor', await visible(page.getByRole('button', { name: /Çıkış/ }), 20000));
await shot('5-barista');
await page.goto(BASE + '/#/modul/sicak-kahveler').catch(() => {});
const lessonLink = page.locator('a[href*="/ders/"]').first();
const hasLessons = await visible(lessonLink, 15000);
ok('İnternetsiz: ders listesi', hasLessons);
if (hasLessons) {
  await lessonLink.click();
  ok('İnternetsiz: ders içeriği', await visible(page.getByRole('button', { name: /Tamamladım|Sonraki ders/ }), 15000));
  await shot('6-ders');
}
await page.goto(BASE + '/#/sinav/hos-geldin').catch(() => {});
if (await visible(page.getByRole('button', { name: /Başla|Kaldığım yerden/ }), 15000)) {
  await page.getByRole('button', { name: /Başla|Kaldığım yerden/ }).click();
  const started = await visible(page.getByRole('button', { name: /Sonraki|Sınavı bitir/ }), 15000);
  ok('İnternetsiz: sınava başlama', started, started ? '' : 'beklenen: sınav sunucu gerektirir');
  await shot('7-sinav');
}

await browser.close();
const fail = results.filter((r) => !r.pass).length;
console.log(`\n${results.length} adım, ${results.length - fail} geçti, ${fail} kaldı. Ekranlar: ${OUT}`);
