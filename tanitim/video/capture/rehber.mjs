/**
 * Kullanım rehberi videoları (barista + mağaza müdürü) için gerçek ekranlar.
 * Çıktı: public/rehber/<ad>.png ve public/rehber/rehber.json (öğe konumları).
 *
 * Önkoşul: emülatör, dev:emu (:5174) ve temiz başlangıç:
 *   node capture/reset-emu.mjs && node capture/rehber.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { FS, OWNER, phone, ensurePairing, recorder, digit, typePin } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:5174';
const { shot, save } = recorder(join(here, '..', 'public', 'rehber'), 'rehber.json');

await ensurePairing();
const browser = await chromium.launch();
const ctx = await browser.newContext(phone);
const page = await ctx.newPage();
const main = page.locator('main');
const link = (href) => page.locator(`a[href="#${href}"]`).first();
const nav = (label) => page.locator('nav').last().locator('a').filter({ hasText: label });
async function go(path, wait = 1200) { await page.goto(BASE + '/#' + path); await page.waitForTimeout(wait); }
async function loginAs(name) {
  await page.getByText('Kim çalışıyor?').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.getByText("PIN'ini gir").waitFor();
}
async function logout() {
  await page.getByRole('button', { name: /Çıkış/ }).click();
  await page.waitForTimeout(1500);
  // Çıkıştan sonra adres (ör. /davet) mağaza ekranında başka sayfa açabilir.
  await page.goto(BASE + '/#/');
  await page.getByText('Kim çalışıyor?').waitFor({ timeout: 20000 }).catch(async (e) => {
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-kutays-Desktop-Projects-1401-Playbook/66ac3e12-15be-4b55-85d0-8f705d5b0210/scratchpad/hata.png' });
    throw e;
  });
  await page.waitForTimeout(600);
}

/* --------------------------- Mağaza telefonu --------------------------- */
await go('/', 1500);
await page.getByText('Mağaza telefonunu bağla').waitFor();
await shot(page, 'eslestir', { tuslar: digit(page, '5').locator('xpath=../..'), baslik: page.getByText('Mağaza telefonunu bağla') });
await typePin(page, '140114');
await page.getByText('Kim çalışıyor?').waitFor({ timeout: 20000 });
await page.waitForTimeout(1000);
await shot(page, 'lobi', {
  receteler: page.getByRole('button', { name: /Reçeteler/ }),
  mudurler: page.getByText('Müdürler', { exact: true }).locator('xpath=..'),
  baristalar: page.getByText('Baristalar', { exact: true }).locator('xpath=..'),
  mehmet: page.getByRole('button', { name: /Mehmet Kaya/ }),
  ayse: page.getByRole('button', { name: /Ayşe Demir/ }),
  yeni: page.getByRole('button', { name: /Yeni misin/ }),
  ayar: page.getByRole('button', { name: 'Cihaz ayarları' })
});

// Cihaz menüsü (müdür videosu)
await page.getByRole('button', { name: 'Cihaz ayarları' }).click();
await page.waitForTimeout(600);
await shot(page, 'cihaz', {
  pano: page.locator('[role=dialog]'),
  operasyon: page.getByRole('button', { name: /Kahve Operasyonu girişi/ }),
  kaldir: page.getByRole('button', { name: /bağlantısını kaldır/ })
});
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

/* --------------------------- İlk giriş (davet) --------------------------- */
await page.getByRole('button', { name: /Yeni misin/ }).click();
await page.getByText('Davet kodunu gir').waitFor();
await shot(page, 'davet-kod', { baslik: page.getByText('Davet kodunu gir'), tuslar: digit(page, '5').locator('xpath=../..') });
await typePin(page, '246810');
await page.getByText('PIN belirle').waitFor();
await shot(page, 'davet-pin', { baslik: page.getByText('PIN belirle').locator('xpath=..'), tuslar: digit(page, '5').locator('xpath=../..') });
await typePin(page, '2580');
await page.getByText("PIN'i tekrar gir").waitFor();
await shot(page, 'davet-tekrar', { baslik: page.getByText("PIN'i tekrar gir") });
await typePin(page, '2580');
await page.getByRole('button', { name: /Çıkış/ }).waitFor({ timeout: 20000 });
await page.waitForTimeout(1800);
await shot(page, 'ilk-bugun', { cikis: page.getByRole('button', { name: /Çıkış/ }), ad: page.locator('header') });
await logout();

/* --------------------------- Barista: Mehmet --------------------------- */
await loginAs('Mehmet Kaya');
await shot(page, 'pin', { ad: page.getByText('Mehmet Kaya').first(), tuslar: digit(page, '5').locator('xpath=../..'), baska: page.getByRole('button', { name: /Başka barista/ }) });
await typePin(page, '1925');
await page.getByRole('button', { name: /Çıkış/ }).waitFor({ timeout: 20000 });
await page.waitForTimeout(1800);

await shot(page, 'menu', {
  cikis: page.getByRole('button', { name: /Çıkış/ }),
  ust: page.locator('header'),
  alt: page.locator('nav').last(),
  'n-bugun': nav('Bugün'), 'n-recete': nav('Reçeteler'), 'n-akademi': nav('Akademi'), 'n-bulten': nav('Bülten'), 'n-ben': nav('Ben')
});
const tile = (label) => main.locator('a').filter({ hasText: label });
await shot(page, 'bugun', {
  kahraman: link('/sonuclarim'),
  recete: tile('Reçeteler').filter({ hasText: 'içecek' }),
  sinav: main.locator('a[href*="/sinav/"], a[href*="/modul/"]').first(),
  ders: tile('Kaldığın ders'),
  bulten: link('/bulten'),
  gorevler: page.getByText(/^Görevlerin/).locator('xpath=ancestor::section[1]'),
  basarim: page.getByText(/Başarımların/),
  yollar: page.getByText('Eğitim yolların'),
  bolumler: page.getByText('Tüm bölümler')
}, { fullPage: true });

// Reçeteler
await nav('Reçeteler').click();
await page.waitForTimeout(1200);
await page.locator('input').first().blur().catch(() => {});
await shot(page, 'receteler', {
  arama: page.locator('input').first(),
  kategoriler: page.getByRole('button', { name: 'Hepsi' }).locator('xpath=..'),
  ilk: main.getByRole('link').first()
});
await page.locator('input').first().fill('latte');
await page.waitForTimeout(700);
const latte = main.getByRole('link').filter({ hasText: /^Caffè Latte/ }).first();
await shot(page, 'receteler-ara', { arama: page.locator('input').first(), sonuc: latte });
await latte.click();
await page.waitForURL(/recete\//);
await page.waitForTimeout(1200);
// Bardak şeması: ana alandaki büyük svg'lerin (8 oz / 12 oz bardaklar) ortak kutusu.
await page.evaluate(() => {
  const r = [...document.querySelectorAll('main svg')].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 60);
  if (!r.length) return;
  const x = Math.min(...r.map((b) => b.left)), y = Math.min(...r.map((b) => b.top));
  const d = document.createElement('div');
  d.id = 'cap-bardak';
  Object.assign(d.style, { position: 'absolute', left: x + 'px', top: (y + scrollY) + 'px', width: (Math.max(...r.map((b) => b.right)) - x) + 'px', height: (Math.max(...r.map((b) => b.bottom)) - y) + 'px', pointerEvents: 'none' });
  document.body.appendChild(d);
});
await shot(page, 'recete', {
  foto: main.locator('img').first(),
  bardak: page.locator('#cap-bardak'),
  olcu: page.getByText(/8 OZ/i).first(),
  adimlar: page.getByText('Hazırlanışı')
}, { fullPage: true });

// Akademi
await nav('Akademi').click();
await page.waitForTimeout(1200);
const yol = main.locator('a').filter({ hasText: 'İçecek Standartları' }).first();
await shot(page, 'akademi', { ilk: main.locator('a').first(), icecek: yol });
await yol.click();
await page.waitForTimeout(1200);
await shot(page, 'yol', { ilk: main.locator('a[href*="/modul/"]').first(), sicak: main.locator('a[href="#/modul/sicak-kahveler"]') }, { fullPage: true });
await go('/modul/sicak-kahveler');
await shot(page, 'modul', {
  ilerleme: main.locator('div').filter({ hasText: /ders/ }).first(),
  dersler: page.getByText(/Dersler ·/),
  ilkders: main.locator('a[href*="/ders/"]').first(),
  sinav: page.getByText(/Sınava hazır mısın|Sınav|Geçtin/).last()
}, { fullPage: true });

// Ders: kaldığı yer
await go('/');
await tile('Kaldığın ders').first().click();
await page.waitForURL(/ders\//);
await page.waitForTimeout(1500);
await shot(page, 'ders', {
  baslik: main.locator('h1').first(),
  tamam: page.getByRole('button', { name: /Tamamladım|Sonraki ders/ })
}, { fullPage: true });
await page.getByRole('button', { name: /Tamamladım/ }).first().click().catch(() => {});
await page.waitForTimeout(1500);
await shot(page, 'ders-sonra', { baslik: main.locator('h1').first() });

// Sınav: doğru cevaplar emülatörden okunur, biri bilerek yanlış bırakılır.
await go('/sinav/hos-geldin');
await page.getByRole('button', { name: /Başla|Kaldığım yerden/ }).waitFor();
await shot(page, 'sinav-giris', {
  bilgi: main.locator('div').filter({ hasText: /^Soru sayısı/ }).first().locator('xpath=..'),
  basla: page.getByRole('button', { name: /Başla|Kaldığım yerden/ })
});
await page.getByRole('button', { name: /Başla|Kaldığım yerden/ }).click();
await page.getByRole('button', { name: /Sonraki|Sınavı bitir/ }).waitFor({ timeout: 20000 });
const q = await fetch(`${FS}:runQuery`, {
  method: 'POST', headers: OWNER,
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'attempts' }], where: { fieldFilter: { field: { fieldPath: 'baristaId' }, op: 'EQUAL', value: { stringValue: 'demo-mehmet' } } } } })
}).then((r) => r.json());
const open = q.map((x) => x.document).filter(Boolean).find((d) => d.fields.submittedAt?.nullValue !== undefined);
const ids = open.fields.questionIds.arrayValue.values.map((v) => v.stringValue);
const orders = open.fields.orders.mapValue.fields;
const correct = [];
for (const id of ids) {
  const qd = await fetch(`${FS}/questions/${id}`, { headers: OWNER }).then((r) => r.json());
  const ans = Number(qd.fields.answer.integerValue);
  correct.push((orders[id].arrayValue.values || []).map((v) => Number(v.integerValue)).indexOf(ans));
}
const options = () => main.locator('button').filter({ has: page.locator('span.rounded-full') });
for (let i = 0; i < ids.length; i++) {
  if (i === 0) await shot(page, 'sinav-soru', {
    sayac: page.getByText(new RegExp(`1\\s*/\\s*${ids.length}`)).first(),
    soru: main.locator('h2, p.text-\\[17px\\], p.text-\\[18px\\]').first(),
    secenekler: options().first().locator('xpath=..'),
    sure: page.getByText(/\d+:\d\d/).first()
  });
  const pick = i === 2 ? (correct[i] + 1) % 2 : correct[i];
  await options().nth(pick).click();
  if (i === 0) await shot(page, 'sinav-secili', { secenek: options().nth(pick), ilerle: page.getByRole('button', { name: /Sonraki/ }) });
  if (i < ids.length - 1) await page.getByRole('button', { name: /Sonraki/ }).click();
  else {
    await shot(page, 'sinav-bitir', { bitir: page.getByRole('button', { name: 'Sınavı bitir' }) });
    await page.getByRole('button', { name: 'Sınavı bitir' }).click();
  }
}
await page.getByText(/Geçtin|Kaldın|Tebrikler|%/).first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
await shot(page, 'sinav-sonuc', {
  puan: main.locator('div').filter({ hasText: /%\d+/ }).first(),
  yanlis: page.getByText(/Yanlış|yanlış/).first()
}, { fullPage: true });

// Ben (sınav sonucunda alt menü gizli; adresle gidilir)
await go('/sonuclarim', 1500);
await shot(page, 'ben', {
  rozet: page.getByText('Önlük rozeti').locator('xpath=..'),
  sonraki: page.getByText(/için|Sıradaki/).first(),
  basarimlar: page.getByText(/^Başarımlar ·/),
  sonuclar: page.getByText(/Sınav sonuçların|Sınavların|Son sınavlar/).first()
}, { fullPage: true });

// Bülten
await nav('Bülten').click();
await page.waitForTimeout(1200);
await shot(page, 'bulten', { ilk: main.locator('button').first(), rozet: nav('Bülten') });
await main.locator('button').first().click();
await page.waitForTimeout(900);
await shot(page, 'bulten-acik', { ilk: main.locator('button').first() });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await logout();

/* --------------------------- Mağaza müdürü: Ayşe --------------------------- */
await loginAs('Ayşe Demir');
await typePin(page, '1925');
await page.getByRole('button', { name: /Çıkış/ }).waitFor({ timeout: 20000 });
await page.waitForTimeout(1800);
await shot(page, 'm-bugun', { ust: page.locator('header'), rol: page.locator('header').getByText(/Mağaza müdürü/) });
await nav('Ben').click();
await page.waitForTimeout(1500);
await shot(page, 'm-ben', { ekip: link('/ekip'), talepler: link('/talepler') }, { fullPage: true });

// Ekibim + görev
await go('/ekip', 1500);
await shot(page, 'ekip', {
  gorev: page.getByRole('button', { name: /Görev/ }).first(),
  liste: page.getByText(/^Baristalar ·/).locator('xpath=ancestor::section[1]'),
  sinavlar: page.getByText('Son sınavlar').locator('xpath=ancestor::section[1]')
}, { fullPage: true });
await page.getByRole('button', { name: /Görev/ }).first().click();
await page.waitForTimeout(800);
const dlg = page.locator('[role=dialog]').last();
await shot(page, 'gorev-ata', {
  pano: dlg,
  tur: dlg.getByRole('button', { name: /Modül sınavı/ }).locator('xpath=..'),
  modul: dlg.locator('select').nth(0),
  kime: dlg.locator('select').last(),
  tarih: dlg.locator('input[type=date]'),
  not: dlg.locator('input, textarea').last()
});
const selects = dlg.locator('select');
await selects.nth(0).selectOption({ label: 'Sıcak Kahveler' }).catch(() => {});
const kimeOpts = await selects.last().locator('option').allTextContents();
const mehmetOpt = kimeOpts.find((o) => o.includes('Mehmet'));
if (mehmetOpt) await selects.last().selectOption({ label: mehmetOpt }).catch(() => {});
await dlg.locator('input:not([type=date]), textarea').last().fill('Cuma akşamına kadar lütfen.').catch(() => {});
await page.waitForTimeout(500);
await shot(page, 'gorev-dolu', { pano: dlg, ata: dlg.getByRole('button', { name: 'Ata', exact: true }) });
await dlg.getByRole('button', { name: 'Ata', exact: true }).click();
await page.waitForTimeout(1500);

// Talepler
await go('/talepler', 1500);
await shot(page, 'talepler', {
  yeni: page.getByRole('button', { name: 'Yeni', exact: true }),
  acik: page.getByText(/^Açık ·/),
  ilk: main.locator('button').filter({ hasText: 'kaçırıyor' }).first()
});
await main.locator('button').filter({ hasText: 'kaçırıyor' }).first().click();
await page.waitForTimeout(1000);
await shot(page, 'talep-detay', { pano: page.locator('[role=dialog]').last(), yanit: page.locator('[role=dialog] textarea, [role=dialog] input').last() });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Yeni', exact: true }).click();
await page.waitForTimeout(800);
const nd = page.locator('[role=dialog]').last();
await shot(page, 'talep-yeni', {
  pano: nd,
  konu: nd.getByText('Konu').locator('xpath=..'),
  ariza: nd.getByRole('button', { name: /Arıza/ })
});
await nd.getByRole('button', { name: /Arıza/ }).click().catch(() => {});
await page.waitForTimeout(300);
// Arızada ekipman zorunlu.
const eq = nd.locator('select').first();
const eqOpts = await eq.locator('option').allTextContents();
const grinder = eqOpts.find((o) => /Değirmen/i.test(o)) || eqOpts[1];
if (grinder) await eq.selectOption({ label: grinder }).catch(() => {});
await nd.locator('input[placeholder*="Değirmen"]').fill('Değirmen öğütmüyor, motor sesi geliyor').catch(() => {});
await nd.locator('textarea').first().fill('Sabah açılışta fark ettik. Fişini çekip taktık, düzelmedi. Yedek değirmenle devam ediyoruz.').catch(() => {});
await nd.getByRole('button', { name: /Acil/ }).click().catch(() => {});
await page.waitForTimeout(400);
// Ayrıntı ve öncelik aşağıda: pencerenin içi kaydırılır.
await nd.getByRole('button', { name: /Acil/ }).scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(500);
await shot(page, 'talep-dolu', {
  pano: nd,
  baslik: nd.locator('input[placeholder*="Değirmen"]'),
  ekipman: nd.locator('select').first(),
  foto: nd.getByText(/Fotoğraf/).first().locator('xpath=..'),
  acil: nd.getByRole('button', { name: /Acil/ }),
  gonder: nd.getByRole('button', { name: 'Gönder' })
});
await nd.getByRole('button', { name: 'Gönder' }).click();
await page.waitForTimeout(1800);
await shot(page, 'talepler-sonra', { ilk: main.locator('button').filter({ hasText: 'Değirmen' }).first() });

save();
await browser.close();
console.log('Bitti.');
