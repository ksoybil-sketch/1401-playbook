/**
 * Ekran çekimi yardımcıları (rehber videosu). Telefon görünümünde ekranı ve
 * önemli öğelerin gerçek konumlarını kaydeder; video dokunma halkalarını ve
 * çerçeveleri bu konumlardan çizer.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export const FS = 'http://127.0.0.1:8080/v1/projects/demo-playbook/databases/(default)/documents';
export const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
export const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'tr-TR', colorScheme: 'dark' };

export async function boxOf(locator) {
  const b = await locator.first().boundingBox({ timeout: 3000 }).catch(() => null);
  if (!b) return null;
  // Sabit (fixed/sticky) öğe: sayfa kaydırılınca yerinde kalır; video bunu bilmeli.
  const fixed = await locator.first().evaluate((el) => {
    for (let e = el; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; }
    return false;
  }).catch(() => false);
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), ...(fixed ? { fixed: true } : {}) };
}

/** Emülatörde eşleştirme kodu tek kullanımlık: Moda Cadde telefonu için yeniden yazar. */
export async function ensurePairing() {
  const res = await fetch(`${FS}:runQuery`, {
    method: 'POST', headers: OWNER,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'EQUAL', value: { stringValue: 'store' } } } } })
  }).then((r) => r.json());
  const dev = res.map((x) => x.document).filter(Boolean).find((d) => d.fields.storeId?.stringValue === 'moda-cadde' && d.fields.active?.booleanValue);
  if (!dev) throw new Error('Test mağaza telefonu bulunamadı — önce npm run seed:emu');
  const body = { fields: {
    uid: { stringValue: dev.name.split('/').pop() }, email: { stringValue: 'tel-moda-cadde-1@hesap.playbook1401.app' },
    password: { stringValue: 'test-cihaz-sifresi' }, storeId: { stringValue: 'moda-cadde' },
    storeName: { stringValue: 'Moda Cadde' }, expiresAt: { integerValue: String(Date.now() + 86400000) }
  } };
  await fetch(`${FS}/pairingCodes/140114`, { method: 'PATCH', headers: OWNER, body: JSON.stringify(body) });
}

export function recorder(outDir, metaName) {
  mkdirSync(outDir, { recursive: true });
  const meta = {};
  const rel = outDir.split('/public/')[1];

  /** Ekranı ve öğe konumlarını kaydeder. fullPage: tüm sayfa (kaydırma sahneleri). */
  async function shot(page, name, boxes = {}, { fullPage = false } = {}) {
    await page.waitForTimeout(800);
    if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
    const out = { file: `${rel}/${name}.png`, fullPage, boxes: {} };
    for (const [k, loc] of Object.entries(boxes)) {
      const b = await boxOf(loc);
      if (b && (fullPage || (b.y < 844 && b.y + b.h > 0))) out.boxes[k] = b;
      else console.warn(`  ! ${name}: "${k}" ${b ? 'ekran dışında' : 'bulunamadı'}`);
    }
    if (fullPage) {
      // Sabit üst bar ve alt menü: önce telefon görünümü (vp) çekilir, sonra
      // sabitler gizlenip tam sayfa çekilir; video ikisini birleştirir.
      await page.screenshot({ path: join(outDir, `${name}-vp.png`) });
      out.vp = `${rel}/${name}-vp.png`;
      out.chrome = await page.evaluate(() => {
        const top = document.querySelector('header')?.getBoundingClientRect().height || 0;
        const fixed = [...document.querySelectorAll('nav, div')].filter((e) => getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().bottom >= window.innerHeight - 1 && e.getBoundingClientRect().height < 200);
        return { top: Math.round(top), bottom: Math.round(Math.max(0, ...fixed.map((e) => e.getBoundingClientRect().height))) };
      });
      await page.evaluate(() => {
        const s = document.createElement('style');
        s.id = '__cap'; s.textContent = 'header{visibility:hidden!important}';
        document.head.appendChild(s);
        document.querySelectorAll('nav, div').forEach((e) => {
          if (getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().bottom >= window.innerHeight - 1 && e.getBoundingClientRect().height < 200) { e.setAttribute('data-cap-hidden', e.style.visibility || ''); e.style.visibility = 'hidden'; }
        });
      });
    }
    await page.screenshot({ path: join(outDir, `${name}.png`), fullPage });
    if (fullPage) await page.evaluate(() => {
      document.getElementById('__cap')?.remove();
      document.querySelectorAll('[data-cap-hidden]').forEach((e) => { e.style.visibility = e.getAttribute('data-cap-hidden'); e.removeAttribute('data-cap-hidden'); });
    });
    const size = await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
    out.size = fullPage ? size : { w: 390, h: 844 };
    meta[name] = out;
    console.log(`✓ ${name}`);
  }
  const save = () => writeFileSync(join(outDir, metaName), JSON.stringify(meta, null, 2));
  return { shot, save, meta };
}

export const digit = (page, d) => page.getByRole('button', { name: d, exact: true });
export async function typePin(page, code) { for (const d of code) { await digit(page, d).click(); await page.waitForTimeout(60); } }
