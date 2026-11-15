// Zorlu senaryo Bölüm 1 — ortak yardımcılar (yalnızca yerel emülatör).
import { createRequire } from 'module';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
const require = createRequire('/Users/kutays/Desktop/Projects/1401 Playbook/tanitim/video/package.json');
export const { chromium } = require('playwright');
export const BASE = 'http://localhost:5173';
import { fileURLToPath } from 'url';
export const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(join(OUT, 'shots'), { recursive: true });
export const EK = JSON.parse(readFileSync(join(OUT, 'ek-hesaplar.json'), 'utf8'));

export const STAFF = {
  developer: ['k.soybil@1401coffee.com', '192535'],
  director: ['cenkgirginol@1401coffee.com', '192535'],
  opsmanager: ['semihdizdar@1401coffee.com', '351925'],
  regional: ['ugurcangurbuz@1401coffee.com', '351925'],
  ops: ['kahveops@1401coffee.com', '351925'],
  board: ['ogunturanli@1401coffee.com', '351925']
};
// Barista rolleri: [cihaz, ad, pin]
export const BAR = {
  lead: ['modaDevice', 'Ayşe Demir', '1925'],
  shift: ['modaDevice', 'Zeynep Arslan', '1925'],
  barista: ['modaDevice', 'Mehmet Kaya', '1925'],
  lead40: ['kalDevice', 'Ayşe Kaya', '1925'] // kb-01 (adı aşağıda düzeltilir)
};

export const SIZES = {
  s360: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  s390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  s768: { viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  s1280: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  yatay: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
};

export async function newCtx(browser, size, { theme, device } = {}) {
  const ctx = await browser.newContext({ ...SIZES[size], locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  await ctx.addInitScript(([theme, device]) => {
    try {
      if (theme) localStorage.setItem('campus.staffTheme', theme);
      if (device && !localStorage.getItem('CapacitorStorage.playbook.device.v2')) localStorage.setItem('CapacitorStorage.playbook.device.v2', JSON.stringify(device));
      // Tanıtım/ipucu pencereleri gibi tek seferlik şeyler ölçümü bozmasın diye dokunulmaz.
    } catch {}
    window.__mut = 0;
    new MutationObserver((l) => { window.__mut += l.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  }, [theme || null, device || null]);
  return ctx;
}

export function watch(page, sink) {
  page.on('pageerror', (e) => sink.push({ t: 'pageerror', msg: e.message.slice(0, 300), url: page.url() }));
  page.on('console', (m) => { if (m.type() === 'error') sink.push({ t: 'console', msg: m.text().slice(0, 300), url: page.url() }); });
  page.on('dialog', async (d) => { sink.push({ t: 'dialog', kind: d.type(), msg: d.message().slice(0, 200), url: page.url() }); page.__lastDialog = d.message(); await d.dismiss().catch(() => {}); });
  page.__req = 0;
  page.on('request', (r) => { const u = r.url(); if (r.method() !== 'GET' || /\/(Write|Listen)\/channel.*TYPE=terminate/.test(u)) page.__req++; });
}

/** Uygulama yüklenene kadar bekle (yükleme simgesi gidip düğmeler gelene kadar, en çok 30 sn). */
export async function ready(page, ms = 30000) {
  await page.waitForFunction(() => {
    const n = document.querySelectorAll('button,a[href],input').length;
    const spin = [...document.querySelectorAll('[class*=animate-spin]')].filter((e) => e.getBoundingClientRect().width > 0).length;
    return n > 0 && spin === 0;
  }, null, { timeout: ms, polling: 300 }).catch(() => {});
}

export async function staffLogin(page, role) {
  const [email, pw] = STAFF[role];
  await page.goto(BASE + '/#/yonetici-girisi');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(pw);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.waitForURL((u) => !u.hash.includes('yonetici-girisi'), { timeout: 30000 });
  await ready(page, 45000);
  await page.waitForTimeout(800);
}

export async function baristaLogin(page, name, pin) {
  await page.goto(BASE + '/#/');
  await page.getByText('Kim çalışıyor?').waitFor({ timeout: 45000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.waitForTimeout(500);
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
  await page.waitForTimeout(1500);
  await ready(page, 45000);
  await page.waitForTimeout(800);
}

/** Sayfa ölçümleri — tek evaluate içinde. */
export async function measure(page, { mobile }) {
  return page.evaluate(({ mobile }) => {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const desc = (el) => {
      const txt = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : ''} "${txt}"`;
    };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
    };
    const inHScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
      }
      return false;
    };
    const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=radio],[role=switch],[role=checkbox],summary,[tabindex]:not([tabindex="-1"])';
    const all = [...document.querySelectorAll(SEL)].filter(visible);
    const res = { hscroll: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth - vw : 0, offscreen: [], covered: [], small: [], cut: [], wide: [] };
    // Ekranı yatayda taşıran öğeler (hscroll'un kaynağı)
    if (res.hscroll) {
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 2 && r.width > 0 && !inHScroller(el)) {
          // en içteki taşan
          if (![...el.children].some((c) => c.getBoundingClientRect().right > vw + 2)) res.wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} → ${Math.round(r.right)}px "${(el.innerText || '').slice(0, 40)}"`);
        }
        if (res.wide.length > 8) break;
      }
    }
    const sy = window.scrollY;
    for (const el of all) {
      const r0 = el.getBoundingClientRect();
      if ((r0.right > vw + 1 || r0.left < -1) && !inHScroller(el)) res.offscreen.push(desc(el) + ` [${Math.round(r0.left)}..${Math.round(r0.right)}]`);
      if (mobile && (r0.width < 44 || r0.height < 44) && el.tagName !== 'INPUT' || (mobile && el.tagName === 'INPUT' && r0.height < 40 && !['checkbox', 'radio', 'range'].includes(el.type))) {
        // Paragraf içindeki metin bağlantıları hariç
        if (!(el.tagName === 'A' && getComputedStyle(el).display === 'inline')) res.small.push(`${desc(el)} ${Math.round(r0.width)}×${Math.round(r0.height)}`);
      }
    }
    // Örtülme: her öğeyi ortala, merkezindeki en üst öğe kendisi mi?
    const dialogs = [...document.querySelectorAll('[role=dialog]')];
    for (const el of all.slice(0, 250)) {
      if (dialogs.length && !dialogs.some((d) => d.contains(el))) continue;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
      if (r.bottom < 0 || r.top > vh) continue;
      const top = document.elementFromPoint(x, y);
      if (top && top !== el && !el.contains(top) && !top.contains(el) && !(el.tagName === 'INPUT' && top.tagName === 'LABEL' && top.contains(el))) {
        // label for=?
        if (top.closest('label') && top.closest('label').control === el) continue;
        const cs = getComputedStyle(top.closest('[class*=fixed],[class*=sticky]') || top);
        res.covered.push(`${desc(el)} ← ${top.tagName.toLowerCase()}.${String(top.className).slice(0, 60)} (${cs.position})`);
      }
    }
    window.scrollTo(0, sy);
    // Kesilen metin
    for (const el of document.body.querySelectorAll('*')) {
      if (!el.childNodes.length || el.children.length > 2) continue;
      const txt = (el.innerText || '').trim();
      if (!txt || !visible(el)) continue;
      const cs = getComputedStyle(el);
      const clipX = (cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1;
      const clipY = cs.webkitLineClamp !== 'none' && cs.webkitLineClamp && el.scrollHeight > el.clientHeight + 2;
      if (clipX || clipY) res.cut.push(`${el.tagName.toLowerCase()} "${txt.slice(0, 70)}" ${clipX ? el.clientWidth + '/' + el.scrollWidth + 'px' : 'satır'}`);
      if (res.cut.length > 40) break;
    }
    return res;
  }, { mobile });
}

/** Karşıtlık: görünür yazıların renk/zemin oranı (WCAG). */
export async function contrast(page) {
  return page.evaluate(() => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const bgOf = (el) => {
      const layers = [];
      for (let p = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // degrade: ölçülmez
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      const root = parse(getComputedStyle(document.body).backgroundColor);
      if (root && root.a > 0.99) bg = root;
      for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
      return bg;
    };
    const out = [];
    const seen = new Set();
    for (const el of document.body.querySelectorAll('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.3) continue;
      if (el.closest('[aria-disabled=true],:disabled')) continue;
      const fg = parse(cs.color); const bg = bgOf(el);
      if (!fg || !bg) continue;
      const f = blend(fg, bg);
      const L1 = lum(f), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize); const bold = +cs.fontWeight >= 600;
      const need = size >= 24 || (size >= 18.6 && bold) ? 3 : 4.5;
      if (ratio < need) {
        const txt = el.innerText.trim().slice(0, 40);
        const k = txt + cs.color;
        if (seen.has(k)) continue; seen.add(k);
        out.push({ txt, ratio: +ratio.toFixed(2), need, color: cs.color, size, cls: String(el.className).slice(0, 70) });
      }
    }
    return out.sort((a, b) => a.ratio - b.ratio).slice(0, 25);
  });
}

export const shotPath = (name) => join(OUT, 'shots', name.replace(/[^a-z0-9ğüşıöçİĞÜŞÖÇ_.-]+/gi, '_') + '.png');
