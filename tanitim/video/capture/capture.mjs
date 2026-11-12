/**
 * Tanıtım videosu için gerçek uygulama ekranlarını çeker.
 *
 * Yerel emülatöre bağlı geliştirme sunucusuna (npm run dev:emu, :5174)
 * telefon boyutunda (390×844, 3x) bağlanır, mağaza telefonu ve Kahve
 * Operasyonu akışlarını gezer. Her ekran için:
 *   public/ekranlar/<ad>.png         ekran görüntüsü
 *   public/ekranlar/meta.json        ekrandaki önemli öğelerin konumları
 * Videodaki dokunma halkaları ve yakınlaştırmalar bu konumlardan çizilir —
 * tahmin edilmiş koordinat yok.
 *
 * Önkoşul: emülatör + seed:emu (test hesapları, eşleştirme kodu 140114).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'ekranlar');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:5174';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-playbook/databases/(default)/documents';
const meta = {};

/**
 * Emülatörde eşleştirme kodu tek kullanımlık: her çalıştırmada seed'deki
 * test telefonu için (tel-moda-cadde-1) kodu yeniden yazar.
 */
async function ensurePairing() {
  const res = await fetch(`${FS}:runQuery`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'EQUAL', value: { stringValue: 'store' } } } } })
  }).then((r) => r.json());
  const dev = res.map((x) => x.document).filter(Boolean).find((d) => d.fields.storeId?.stringValue === 'moda-cadde' && d.fields.active?.booleanValue);
  if (!dev) throw new Error('Test mağaza telefonu bulunamadı — önce npm run seed:emu');
  const uid = dev.name.split('/').pop();
  const body = { fields: {
    uid: { stringValue: uid }, email: { stringValue: 'tel-moda-cadde-1@hesap.playbook1401.app' },
    password: { stringValue: 'test-cihaz-sifresi' }, storeId: { stringValue: 'moda-cadde' },
    storeName: { stringValue: 'Moda Cadde' }, expiresAt: { integerValue: String(Date.now() + 86400000) }
  } };
  await fetch(`${FS}/pairingCodes/140114`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
await ensurePairing();

const browser = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'tr-TR', colorScheme: 'dark' };

async function boxOf(locator) {
  const b = await locator.first().boundingBox().catch(() => null);
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
}

/** Ekranı ve verilen öğelerin konumlarını kaydeder. fullPage: tüm sayfa (kaydırma sahneleri için). */
async function shot(page, name, boxes = {}, { fullPage = false } = {}) {
  await page.waitForTimeout(700);
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  const out = { file: `ekranlar/${name}.png`, fullPage, boxes: {} };
  for (const [k, loc] of Object.entries(boxes)) {
    const b = await boxOf(loc);
    if (b) {
      // Tam sayfada kaydırma payı eklenir: konum sayfanın başına göre.
      const sy = fullPage ? await page.evaluate(() => window.scrollY) : 0;
      out.boxes[k] = { ...b, y: b.y + sy };
    } else console.warn(`  ! ${name}: "${k}" bulunamadı`);
  }
  if (fullPage) {
    // Sabit üst bar ve alt menü tam sayfa görüntüde sayfanın ortasında
    // kalıyordu. Önce telefon görünümünü (sabitler doğru yerde) ayrı çek,
    // sonra sabitleri gizleyip tam sayfayı çek; video ikisini birleştirir.
    await page.screenshot({ path: join(OUT, `${name}-vp.png`) });
    out.vp = `ekranlar/${name}-vp.png`;
    out.chrome = await page.evaluate(() => {
      const top = document.querySelector('header')?.getBoundingClientRect().height || 0;
      const fixed = [...document.querySelectorAll('nav, div')].filter((e) => getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().bottom >= window.innerHeight - 1 && e.getBoundingClientRect().height < 200);
      const bottom = Math.max(0, ...fixed.map((e) => e.getBoundingClientRect().height));
      return { top: Math.round(top), bottom: Math.round(bottom) };
    });
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.id = '__cap';
      s.textContent = 'header{visibility:hidden!important}';
      document.head.appendChild(s);
      document.querySelectorAll('nav, div').forEach((e) => {
        if (getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().bottom >= window.innerHeight - 1 && e.getBoundingClientRect().height < 200) e.setAttribute('data-cap-hidden', e.style.visibility || ''), (e.style.visibility = 'hidden');
      });
    });
  }
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
  if (fullPage) await page.evaluate(() => {
    document.getElementById('__cap')?.remove();
    document.querySelectorAll('[data-cap-hidden]').forEach((e) => { e.style.visibility = e.getAttribute('data-cap-hidden'); e.removeAttribute('data-cap-hidden'); });
  });
  const size = await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
  out.size = fullPage ? size : { w: 390, h: 844 };
  meta[name] = out;
  console.log(`✓ ${name}`);
}

const digit = (page, d) => page.getByRole('button', { name: d, exact: true });
async function typePin(page, code) { for (const d of code) await digit(page, d).click(); }

/* ------------------------------------------------------------------ */
/* Mağaza telefonu                                                     */
/* ------------------------------------------------------------------ */
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(BASE + '/#/');
  await page.getByText('Mağaza telefonunu bağla').waitFor();
  await typePin(page, '140114');
  await page.getByText('Kim çalışıyor?').waitFor({ timeout: 20000 });

  await shot(page, 'lobi', {
    receteler: page.getByRole('button', { name: /Reçeteler/ }),
    // Başlık + listesi birlikte (başlığın üst öğesi).
    mudurler: page.getByText('Müdürler', { exact: true }).locator('xpath=..'),
    ayse: page.getByRole('button', { name: /Ayşe Demir/ }),
    baristalar: page.getByText('Baristalar', { exact: true }).locator('xpath=..')
  });

  // PIN'siz reçeteler
  await page.getByRole('button', { name: /Reçeteler/ }).click();
  await page.waitForURL(/receteler/);
  await page.waitForTimeout(800);
  await page.locator('input').first().blur();
  await shot(page, 'receteler', {
    arama: page.locator('input').first(),
    kategoriler: page.getByRole('button', { name: 'Hepsi' }),
    ilk: page.getByRole('link').filter({ hasText: 'Ristretto' })
  });
  await page.locator('input').first().fill('ube');
  await shot(page, 'receteler-ara', {
    arama: page.locator('input').first(),
    sonuc: page.getByRole('link').filter({ hasText: 'Ube Latte' })
  });
  await page.getByRole('link').filter({ hasText: 'Ube Latte' }).first().click();
  await page.waitForURL(/recete\//);
  await shot(page, 'recete', {
    foto: page.locator('main img').first(),
    bardak: page.locator('main svg').first(),
    olcu: page.getByText('8 OZ').first(),
    adimlar: page.getByText('Hazırlanışı')
  }, { fullPage: true });

  // Barista girişi
  await page.getByRole('button', { name: /Giriş/ }).click();
  await page.getByText('Kim çalışıyor?').waitFor();
  await page.getByRole('button', { name: /Ayşe Demir/ }).click();
  await page.getByText("PIN'ini gir").waitFor();
  await shot(page, 'pin', { tus: digit(page, '5') });
  await typePin(page, '1925');
  await page.getByText(/Günaydın|İyi günler|İyi akşamlar/).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);

  const tile = (label) => page.locator('a').filter({ hasText: label });
  await shot(page, 'bugun', {
    kahraman: page.locator('a[href="#/sonuclarim"]').first(),
    arama: page.locator('a[href="#/receteler?focus=1"]'),
    recete: tile('Reçeteler').filter({ hasText: 'içecek' }),
    sinav: page.locator('a[href*="/sinav/"], a[href*="/modul/"]').first(),
    ders: tile('Kaldığın ders'),
    bulten: page.locator('a[href="#/bulten"]').first(),
    basarim: page.getByText(/Başarımların/),
    yollar: page.getByText('Eğitim yolların'),
    bolumler: page.getByText('Tüm bölümler'),
    menu: page.locator('nav').last()
  }, { fullPage: true });

  // Akademi
  await page.goto(BASE + '/#/akademi');
  await shot(page, 'akademi', { icecek: page.locator('a').filter({ hasText: 'İçecek Standartları' }) });
  await page.goto(BASE + '/#/modul/sicak-kahveler');
  await shot(page, 'modul', {
    dersler: page.getByText(/Dersler ·/),
    sinav: page.getByText(/Sınava hazır mısın|Geçtin/)
  }, { fullPage: true });

  // Ders (kaldığı yer)
  await page.goto(BASE + '/#/');
  await page.waitForTimeout(800);
  await tile('Kaldığın ders').first().click();
  await page.waitForURL(/ders\//);
  await shot(page, 'ders', { tamam: page.getByRole('button', { name: /Tamamladım|Sonraki ders/ }) });

  // Sınav: doğru cevaplar emülatörden okunur ki sonuç ekranı gerçek akışla gelsin.
  await page.goto(BASE + '/#/sinav/hos-geldin');
  await page.getByRole('button', { name: /Başla|Kaldığım yerden/ }).waitFor();
  await shot(page, 'sinav-giris', { basla: page.getByRole('button', { name: /Başla|Kaldığım yerden/ }) });
  await page.getByRole('button', { name: /Başla|Kaldığım yerden/ }).click();
  await page.getByRole('button', { name: /Sonraki|Sınavı bitir/ }).waitFor({ timeout: 20000 });
  const q = await fetch(`${FS}:runQuery`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'attempts' }], where: { fieldFilter: { field: { fieldPath: 'baristaId' }, op: 'EQUAL', value: { stringValue: 'demo-ayse' } } } } })
  }).then((r) => r.json());
  const open = q.map((x) => x.document).filter(Boolean).find((d) => d.fields.submittedAt?.nullValue !== undefined);
  const ids = open.fields.questionIds.arrayValue.values.map((v) => v.stringValue);
  const orders = open.fields.orders.mapValue.fields;
  const correct = [];
  for (const id of ids) {
    const qd = await fetch(`${FS}/questions/${id}`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json());
    const ans = Number(qd.fields.answer.integerValue);
    const ord = (orders[id].arrayValue.values || []).map((v) => Number(v.integerValue));
    correct.push(ord.indexOf(ans));
  }
  const optionButtons = () => page.locator('main button').filter({ has: page.locator('span.rounded-full') });
  for (let i = 0; i < ids.length; i++) {
    // Bir soruyu yanlış bırak: sonuç ekranında "yanlışların" kısmı da görünsün.
    const pick = i === 2 ? (correct[i] + 1) % 2 : correct[i];
    await optionButtons().nth(pick).click();
    if (i === 1) await shot(page, 'sinav-soru', { sure: page.locator('main .h-1, main [style*="width"]').first(), secenek: optionButtons().nth(pick), ilerle: page.getByRole('button', { name: /Sonraki/ }) });
    if (i < ids.length - 1) await page.getByRole('button', { name: /Sonraki/ }).click();
    else await page.getByRole('button', { name: 'Sınavı bitir' }).click();
  }
  await page.getByText(/Geçtin|Kaldın|Tebrikler|%/).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await shot(page, 'sinav-sonuc', {}, { fullPage: true });

  // Ben: rozet ve başarımlar
  await page.goto(BASE + '/#/sonuclarim');
  await page.waitForTimeout(1200);
  await shot(page, 'ben', {
    rozet: page.getByText('Önlük rozeti'),
    basarimlar: page.getByText(/^Başarımlar ·/),
    ekip: page.locator('a[href="#/ekip"]'),
    talepler: page.locator('a[href="#/talepler"]')
  }, { fullPage: true });

  await page.goto(BASE + '/#/bulten');
  await shot(page, 'bulten', { ilk: page.locator('main button').first() });

  await page.goto(BASE + '/#/ekip');
  await page.waitForTimeout(1000);
  await shot(page, 'ekip', { gorev: page.getByRole('button', { name: /Görev/ }) });

  await page.goto(BASE + '/#/talepler');
  await page.waitForTimeout(800);
  await shot(page, 'talepler', { yeni: page.getByRole('button', { name: 'Yeni', exact: true }), ilk: page.locator('main button').nth(1) });
  await page.getByRole('button', { name: 'Yeni', exact: true }).click();
  await page.waitForTimeout(600);
  await shot(page, 'talep-yeni', { ariza: page.getByRole('button', { name: /Arıza/ }), acil: page.getByRole('button', { name: /Acil/ }) });
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* Kahve Operasyonu (Cenk Bey)                                         */
/* ------------------------------------------------------------------ */
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(BASE + '/#/yonetici-girisi');
  await page.locator('input[type=email]').fill('cenkgirginol@1401coffee.com');
  await page.locator('input[type=password]').fill('192535');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.getByText('Aktif barista').waitFor({ timeout: 20000 });
  await page.waitForTimeout(2000);
  await shot(page, 'panel-genel', {
    kartlar: page.getByText('Aktif barista'),
    magazalar: page.getByText('Mağazalar', { exact: true }).last(),
    menu: page.locator('nav').last()
  }, { fullPage: true });

  await page.goto(BASE + '/#/talepler');
  await page.waitForTimeout(1200);
  await shot(page, 'panel-talepler', { acil: page.getByText('Acil', { exact: true }).first(), onay: page.getByText('Onay bekleyen servis') });

  await page.goto(BASE + '/#/onaylar');
  await page.waitForTimeout(1200);
  await shot(page, 'panel-onaylar', {
    yayinla: page.getByRole('button', { name: /Olduğu gibi yayınla/ }),
    duzelt: page.getByRole('button', { name: /Düzelt ve yayınla/ })
  });

  await page.goto(BASE + '/#/rozetler');
  await page.waitForTimeout(1500);
  await shot(page, 'panel-rozetler', { teslim: page.getByRole('button', { name: /Teslim edildi/ }) }, { fullPage: true });

  await page.goto(BASE + '/#/bulten');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /barista okudu/ }).first().click();
  await page.waitForTimeout(600);
  await shot(page, 'panel-bulten', { okuyan: page.getByText(/Okumayanlar/) });
  await ctx.close();
}

writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
await browser.close();
console.log('Bitti:', Object.keys(meta).length, 'ekran');
