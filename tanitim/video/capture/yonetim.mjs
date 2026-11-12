/**
 * Yönetim videosu için Kahve Operasyonu ekranları — masaüstü (1440×900, 2x).
 *
 * Akış gerçek iş sırasıyla ilerler ve emülatöre gerçekten yazar:
 *   Uğur Bey (Bölge Müdürü): barista ekler → davet kodu; telefon bağlar →
 *   eşleştirme kodu; talebi yanıtlar ve servisi onaya gönderir; görev atar;
 *   dersi düzenler → onaya gönderir.
 *   Cenk Bey (Kahve Operasyon Müdürü): o öneriyi görür, ne değiştiğine bakar,
 *   yayınlar; servisi onaylar; rozet ayarları; barista bazında geri alma;
 *   terfi bülteni; ekip yönetimi; dosyadan ders.
 *
 * Çıktı: public/ekranlar/y-*.png ve public/ekranlar/yonetim.json (öğe konumları).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'ekranlar');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5174';
const W = 1440, H = 900;
const meta = {};

const browser = await chromium.launch();
const desk = { viewport: { width: W, height: H }, deviceScaleFactor: 2, locale: 'tr-TR', colorScheme: 'dark' };

async function boxOf(locator) {
  const b = await locator.first().boundingBox().catch(() => null);
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
}
async function shot(page, name, boxes = {}) {
  await page.waitForTimeout(800);
  const out = { file: `ekranlar/${name}.png`, fullPage: false, size: { w: W, h: H }, boxes: {} };
  for (const [k, loc] of Object.entries(boxes)) {
    const b = await boxOf(loc);
    if (b) out.boxes[k] = b; else console.warn(`  ! ${name}: "${k}" bulunamadı`);
  }
  // Açık pencere varsa onun kutusu da kaydedilir: kamera küçük bir yazıya
  // değil, pencerenin kendisine yaklaşır.
  const dlg = page.locator('[role=dialog]');
  if (await dlg.count()) { const b = await boxOf(dlg.last()); if (b) out.boxes.pano = b; }
  for (const [k, b] of Object.entries(out.boxes)) {
    if (b.y < 0 || b.y + b.h > H) { console.warn(`  ! ${name}: "${k}" ekran dışında, atlandı`); delete out.boxes[k]; }
  }
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  meta[name] = out;
  console.log(`✓ ${name}`);
}
async function login(email, password) {
  const ctx = await browser.newContext(desk);
  const page = await ctx.newPage();
  await page.goto(BASE + '/#/yonetici-girisi');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.getByText('Aktif barista').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const sheet = (page) => page.locator('[role=dialog], .fixed.inset-0').last();

/* ------------------------------------------------------------------ */
/* Uğur Bey — Bölge Müdürü                                             */
/* ------------------------------------------------------------------ */
{
  const { ctx, page } = await login('ugurcangurbuz@1401coffee.com', '351925');
  await shot(page, 'y-u-genel', { menu: page.locator('aside nav'), kod: page.getByText(/Kod bekleyenler/) });

  // Barista ekle → davet kodu
  await page.goto(BASE + '/#/magazalar/moda-cadde');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /Barista ekle/ }).click();
  await page.locator('input').first().fill('Ece Yalçın');
  await page.getByRole('button', { name: 'Barista', exact: true }).click().catch(() => {});
  await shot(page, 'y-u-barista-ekle', { ad: page.locator('input').first(), ekle: page.getByRole('button', { name: /Ekle ve kod oluştur/ }) });
  await page.getByRole('button', { name: /Ekle ve kod oluştur/ }).click();
  await page.getByText(/için davet kodu/).waitFor({ timeout: 20000 });
  await shot(page, 'y-u-davet-kodu', { kod: page.getByText(/için davet kodu/), kopyala: page.getByRole('button', { name: /Kopyala/ }) });
  await page.getByRole('button', { name: 'Tamam' }).click();

  // Mağaza telefonu bağla
  await page.getByRole('button', { name: /Telefon bağla/ }).click();
  await page.getByText('Telefon eşleştirme kodu').waitFor({ timeout: 20000 });
  await shot(page, 'y-u-telefon-kodu', { kod: page.getByText('Telefon eşleştirme kodu') });
  await page.getByRole('button', { name: 'Tamam' }).click();

  // Talep: yanıtla, işleme al; servis talebini müdür onayına gönder
  await page.goto(BASE + '/#/talepler');
  await page.waitForTimeout(1200);
  await shot(page, 'y-u-talepler', { kartlar: page.getByText('Açık talep'), liste: page.locator('main button').filter({ hasText: /Matcha|ube/ }).first() });
  await page.locator('main button').filter({ hasText: /Matcha|ube/ }).first().click();
  await page.waitForTimeout(800);
  await page.locator('textarea').last().fill('Sevkiyat yarın sabah 09:00’da şubede. Hafta sonuna yeter.');
  await shot(page, 'y-u-talep-yanit', { yanit: page.locator('textarea').last(), isleme: page.getByRole('button', { name: 'İşleme al' }), onay: page.getByRole('button', { name: 'Müdür onayına gönder' }) });
  await page.getByRole('button', { name: 'İşleme al' }).click();
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await page.goto(BASE + '/#/talepler');
  await page.waitForTimeout(800);
  const espresso = page.locator('main button').filter({ hasText: /su kaçırıyor/ }).first();
  if (await espresso.count()) {
    await espresso.click();
    await page.waitForTimeout(600);
    await page.locator('textarea').last().fill('Conta değişimi için yetkili servis teklifi: 2.400 ₺. Onayınıza sunuyorum.');
    await page.getByRole('button', { name: 'Müdür onayına gönder' }).click();
    await page.waitForTimeout(1000);
    await shot(page, 'y-u-onaya-gonder', { durum: page.getByText(/Müdür onayında/).first() });
    await page.keyboard.press('Escape');
  }

  // Görev ata
  await page.goto(BASE + '/#/gorevler');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Görev ata/ }).first().click();
  await page.waitForTimeout(800);
  await shot(page, 'y-u-gorev', { form: page.getByText('Görev ata').last() });
  await page.keyboard.press('Escape');

  // Ders düzenle → onaya gönder
  await page.goto(BASE + '/#/icerik/ders/r-caff-latte-8-oz-12-oz');
  await page.waitForTimeout(1500);
  const title = page.locator('input').filter({ hasNot: page.locator('[type=checkbox]') }).first();
  await page.getByText('Ders başlığı').locator('xpath=..').locator('input').fill('Caffè Latte (8 oz / 12 oz) — 2026');
  await shot(page, 'y-u-ders-duzenle', { kaydet: page.getByRole('button', { name: /Onaya gönder/ }) });
  await page.getByRole('button', { name: /Onaya gönder/ }).click();
  await page.getByText(/onay bekliyor/).waitFor({ timeout: 20000 });
  await shot(page, 'y-u-ders-onayda', { not: page.getByText(/onay bekliyor/).first() });
  void title;

  await page.goto(BASE + '/#/onaylar');
  await page.waitForTimeout(1000);
  await shot(page, 'y-u-onerilerim', { ilk: page.locator('main .flex.flex-col.gap-2\\.5 > div').first() });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* Cenk Bey — Kahve Operasyon Müdürü                                    */
/* ------------------------------------------------------------------ */
{
  const { ctx, page } = await login('cenkgirginol@1401coffee.com', '192535');
  await shot(page, 'y-c-genel', { menu: page.locator('aside nav'), kartlar: page.getByText('Aktif barista'), onaylar: page.locator('aside a[href="#/onaylar"]') });

  await page.goto(BASE + '/#/onaylar');
  await page.waitForTimeout(1200);
  await shot(page, 'y-c-onaylar', {
    ders: page.locator('main div').filter({ hasText: /^DERS/ }).first(),
    nedegisiyor: page.getByRole('button', { name: /Ne değişiyor/ }).first(),
    yayinla: page.getByRole('button', { name: /Olduğu gibi yayınla/ }).first(),
    duzelt: page.getByRole('button', { name: /Düzelt ve yayınla/ }).first()
  });
  // Uğur Bey'in ders önerisi (bülten önerisi seed'den geliyor, o kalsın).
  const card = page.locator('main div.p-4').filter({ hasText: 'Caffè Latte' }).first();
  await card.getByRole('button', { name: /Ne değişiyor/ }).click();
  await page.waitForTimeout(1200);
  await shot(page, 'y-c-ne-degisiyor', { fark: page.locator('[role=dialog] div').filter({ hasText: /^Değişecek/ }).first() });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await card.getByRole('button', { name: /Olduğu gibi yayınla/ }).click();
  await page.waitForTimeout(1500);
  await shot(page, 'y-c-yayinlandi', { gecmis: page.getByRole('button', { name: /Geçmiş/ }) });

  // Servisi onayla
  await page.goto(BASE + '/#/talepler?durum=onay');
  await page.waitForTimeout(1200);
  await shot(page, 'y-c-talep-onay', { kart: page.getByText('Onay bekleyen servis') });
  await page.locator('main button').filter({ hasText: /su kaçırıyor|Değirmen/ }).first().click();
  await page.waitForTimeout(800);
  await shot(page, 'y-c-servis-onayla', { onayla: page.getByRole('button', { name: /Servisi onayla/ }) });
  await page.keyboard.press('Escape');

  // Rozet ayarları
  await page.goto(BASE + '/#/rozetler');
  await page.waitForTimeout(1500);
  await shot(page, 'y-c-rozetler', { teslim: page.getByRole('button', { name: /Teslim edildi/ }).first() });
  await page.getByText('Önlük rozetleri — nasıl kazanılır').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(600);
  await shot(page, 'y-c-rozet-kurallari', { mod: page.getByRole('button', { name: 'Onayla / teslimle' }).first(), gecerlilik: page.getByText('Geçerlilik (0 = süresiz)').first() });
  await page.getByText(/Başarımlar — Başarı/).scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot(page, 'y-c-basarim-ayar', { pencere: page.getByText('Yalnızca son').first() });

  // Barista bazında
  await page.goto(BASE + '/#/baristalar/demo-ayse');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Rozet ve başarımları düzenle/ }).click();
  await page.waitForTimeout(800);
  await page.locator('input[placeholder^="Denetimde"]').fill('Barda uygulamalı latte art onayı');
  await shot(page, 'y-c-barista-istisna', { geri: page.getByRole('button', { name: 'Rozeti geri al' }), ver: page.getByRole('button', { name: 'Elle ver' }).first() });
  await page.keyboard.press('Escape');

  // Terfi bülteni + okuyanlar
  await page.goto(BASE + '/#/bulten');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /barista okudu/ }).first().click();
  await page.waitForTimeout(600);
  await shot(page, 'y-c-bulten-okuyan', { okuyan: page.getByText(/Okumayanlar/) });
  await page.getByRole('button', { name: /Yeni bülten/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Liderlik', exact: true }).click();
  await page.getByRole('button', { name: 'Terfi · tebrik' }).click();
  await page.locator('input').first().fill('Kasım terfileri');
  await page.getByRole('button', { name: /Kişi/ }).click();
  await page.locator('select').first().selectOption({ label: /Zeynep Arslan/ }).catch(async () => {
    const opt = await page.locator('select').first().locator('option').filter({ hasText: 'Zeynep' }).first().getAttribute('value');
    await page.locator('select').first().selectOption(opt);
  });
  await page.locator('input[placeholder^="Vardiya müdürlüğüne"]').first().fill('Vardiya müdürlüğüne terfi etti');
  await page.waitForTimeout(500);
  await shot(page, 'y-c-terfi', { kisi: page.getByText('Kişiler').first(), onizleme: page.getByText('Baristada böyle görünecek') });
  await page.keyboard.press('Escape');

  // Ekip yönetimi
  await page.goto(BASE + '/#/');
  await page.waitForTimeout(1200);
  await page.getByText(/Kahve Operasyonu ekibi/).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /^Ekle$/ }).click().catch(async () => page.locator('button').filter({ hasText: 'Ekle' }).last().click());
  await page.waitForTimeout(700);
  await shot(page, 'y-c-ekip', { roller: page.getByText('Bölge Müdürü').last() });
  await page.keyboard.press('Escape');

  // Akademi: dosyadan ders
  await page.goto(BASE + '/#/icerik');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Dosyadan ders/ }).click();
  await page.waitForTimeout(800);
  await shot(page, 'y-c-dosyadan-ders', { sec: page.getByText('Dosya seç') });
  await page.keyboard.press('Escape');

  await page.goto(BASE + '/#/gorevler');
  await page.waitForTimeout(1000);
  await shot(page, 'y-c-gorevler', { atayan: page.locator('select').nth(1) });
  await ctx.close();
}

writeFileSync(join(OUT, 'yonetim.json'), JSON.stringify(meta, null, 2));
await browser.close();
console.log('Bitti:', Object.keys(meta).length, 'ekran');
