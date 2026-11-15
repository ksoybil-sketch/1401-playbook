// 3.6 Klavye ve ekran okuyucu: adsız öğe, etiketsiz alan, alt'sız görsel, sekme sırası, odak görünürlüğü, PIN klavyeyle, pencere odağı.
import { chromium, BASE, save, ready, txt, staffLogin, EK, startExamUI } from './lib.mjs';
const res = {};
const browser = await chromium.launch();
const audit = (page) => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const name = (el) => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText) || el.innerText || el.getAttribute('title') || el.querySelector('img[alt]')?.alt || '').trim();
  const d = (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`.slice(0, 70);
  const out = { lang: document.documentElement.lang || null, adsizDugme: [], etiketsizAlan: [], altsizGorsel: 0, pozitifTabindex: 0, tiklanabilirDiv: [] };
  for (const el of document.querySelectorAll('button,a[href],[role=button],[role=tab],[role=switch]')) if (vis(el) && !name(el)) out.adsizDugme.push(d(el));
  for (const el of document.querySelectorAll('input:not([type=hidden]),select,textarea')) {
    if (!vis(el) && el.type !== 'file') continue;
    const lab = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label');
    if (!lab) out.etiketsizAlan.push(`${el.tagName.toLowerCase()}[${el.type || ''}] ph="${(el.placeholder || '').slice(0, 30)}"`);
  }
  out.altsizGorsel = [...document.querySelectorAll('img')].filter((i) => vis(i) && !i.hasAttribute('alt')).length;
  out.pozitifTabindex = [...document.querySelectorAll('[tabindex]')].filter((e) => +e.getAttribute('tabindex') > 0).length;
  for (const el of document.querySelectorAll('div,span,li')) { if (el.onclick || el.getAttribute('onClick')) out.tiklanabilirDiv.push(d(el)); }
  out.adsizDugme = [...new Set(out.adsizDugme)].slice(0, 8); out.etiketsizAlan = out.etiketsizAlan.slice(0, 8);
  return out;
});
// Sekme ile ilk 30 öğe: odak görünür mü, sıra görsel sırayla uyumlu mu
async function tabWalk(page, n = 30) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  const steps = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
      return { t: (el.getAttribute('aria-label') || el.innerText || el.value || el.tagName).trim().slice(0, 24), ring, y: Math.round(r.top + scrollY), x: Math.round(r.left), hidden: r.width === 0 || r.height === 0 };
    });
    if (!s) { steps.push(null); continue; }
    steps.push(s);
  }
  const real = steps.filter(Boolean);
  return { odakli: real.length, halkasiz: real.filter((s) => !s.ring).map((s) => s.t).slice(0, 10), gorunmezeOdak: real.filter((s) => s.hidden).length, geriSicrama: real.filter((s, i) => i && s.y < real[i - 1].y - 40).length };
}
// Mağaza telefonu: barista seçme ve PIN
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR' });
  await ctx.addInitScript((d) => { try { if (!localStorage.getItem('CapacitorStorage.playbook.device.v2')) localStorage.setItem('CapacitorStorage.playbook.device.v2', JSON.stringify(d)); } catch {} }, EK.modaDevice);
  const page = await ctx.newPage();
  await page.goto(BASE + '/#/'); await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 }); await page.waitForTimeout(800);
  res.telefon = { ...(await audit(page)), sekme: await tabWalk(page, 15) };
  // Klavyeyle barista seç ve PIN'i klavyeden yaz
  await page.getByRole('button', { name: /Mehmet Kaya/ }).first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  res.pinEkrani = await audit(page);
  res.pinEkrani_aktifOge = await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.innerText || document.activeElement?.tagName || '').slice(0, 30));
  await page.keyboard.type('1925'); await page.waitForTimeout(3000);
  res.pinKlavyeyle_girisOldu = (await txt(page)).includes('Çıkış');
  if (!res.pinKlavyeyle_girisOldu) { for (const c of '1925') await page.getByRole('button', { name: c, exact: true }).click(); await page.getByText('Çıkış').first().waitFor({ timeout: 30000 }); }
  await ready(page); await page.waitForTimeout(1000);
  res.baristaAna = { ...(await audit(page)), sekme: await tabWalk(page, 30) };
  // Sınav: seçili şık ekran okuyucuya bildiriliyor mu
  await startExamUI(page, BASE, 'acilis-kapanis');
  const opt = page.locator('div.flex.flex-col.gap-2\\.5 > button').first();
  await opt.click(); await page.waitForTimeout(300);
  res.sinav = { ...(await audit(page)), seciliSikAria: await opt.evaluate((b) => ({ pressed: b.getAttribute('aria-pressed'), checked: b.getAttribute('aria-checked'), role: b.getAttribute('role'), grupRol: b.parentElement.getAttribute('role') })), sureCanliBolge: await page.evaluate(() => !!document.querySelector('[aria-live],[role=timer],[role=status]')) };
  await ctx.close();
}
// Panel ve pencere (Sheet) odağı
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await staffLogin(page, 'director');
  res.panelGenel = { ...(await audit(page)), sekme: await tabWalk(page, 30) };
  await page.goto(BASE + '/#/baristalar'); await ready(page); await page.waitForTimeout(1200);
  res.panelBaristalar = await audit(page);
  await page.goto(BASE + '/#/talepler'); await ready(page); await page.waitForTimeout(1200);
  res.panelTalepler = await audit(page);
  // ilk açılabilir pencere: "Barista ekle" ya da benzeri
  await page.goto(BASE + '/#/baristalar'); await ready(page); await page.waitForTimeout(800);
  const add = page.getByRole('button', { name: /Barista ekle|Yeni barista|Ekle/ }).first();
  if (await add.count()) {
    await add.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    res.pencere = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return { var: !!d, ariaModal: d?.getAttribute('aria-modal'), adi: d?.getAttribute('aria-labelledby') || d?.getAttribute('aria-label') || null, odakIcinde: !!d && d.contains(document.activeElement) }; });
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    res.pencere.tab25SonraIcinde = await page.evaluate(() => !!document.querySelector('[role=dialog]')?.contains(document.activeElement));
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    res.pencere.escKapatti = !(await page.locator('[role=dialog]').count());
    res.pencere.odakGeriDondu = await page.evaluate(() => (document.activeElement?.innerText || document.activeElement?.tagName || '').slice(0, 30));
  }
  await ctx.close();
}
// Kurul (telefon)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await staffLogin(page, 'board');
  res.kurul = await audit(page);
  res.kurul_grafik = await page.evaluate(() => [...document.querySelectorAll('svg')].filter((s) => s.getBoundingClientRect().width > 100).map((s) => ({ role: s.getAttribute('role'), label: s.getAttribute('aria-label'), title: !!s.querySelector('title') })).slice(0, 4));
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
save('erisim.json', res);
await browser.close();
process.exit(0);
