// Geçiş 1: rol × rota × boyut × tema ölçümleri + ekran görüntüsü.
// Kullanım: node gezgin.mjs <rol> [<rol> ...]
import { writeFileSync } from 'fs';
import { join } from 'path';
import { ready, chromium, BASE, OUT, EK, STAFF, newCtx, watch, staffLogin, baristaLogin, measure, contrast, shotPath } from './lib.mjs';

const STAFF_ROUTES = ['/', '/magazalar', '/magazalar/moda-cadde', '/magazalar/bos-sube', '/magazalar/kalabalik', '/baristalar', '/baristalar/demo-mehmet', '/baristalar/kb-02',
  '/gorevler', '/talepler', '/talepler/istatistik', '/onaylar', '/rozetler', '/bulten', '/icerik', '/icerik/modul/sicak-kahveler', '/icerik/modul/bos-modul',
  '/icerik/ders/hikayemiz', '/icerik/ders/r-espresso-cortado', '/yeni-urun', '/geri-bildirim', '/soru-havuzu', '/kurul-sorulari', '/bildirimler', '/yetkiler', '/demo-kaydi'];
const BOARD_ROUTES = ['/', '/magazalar', '/isler', '/sorular', '/raporlar', '/rapor'];
const BAR_ROUTES = ['/', '/receteler', '/recete/r-espresso-cortado', '/bulten', '/akademi', '/akademi/oryantasyon', '/modul/hos-geldin', '/modul/bos-modul', '/modul/sicak-kahveler',
  '/ders/hikayemiz', '/sinav/bos-modul', '/sonuclarim', '/ekip', '/talepler'];
const STORE_ROUTES = ['/', '/receteler', '/recete/r-espresso-cortado', '/davet', '/yonetici-girisi'];
const UNPAIRED_ROUTES = ['/', '/yonetici-girisi', '/kurulum'];

const ROLES = {
  developer: { kind: 'staff', routes: STAFF_ROUTES }, director: { kind: 'staff', routes: STAFF_ROUTES }, opsmanager: { kind: 'staff', routes: STAFF_ROUTES },
  regional: { kind: 'staff', routes: STAFF_ROUTES }, ops: { kind: 'staff', routes: STAFF_ROUTES }, board: { kind: 'staff', routes: BOARD_ROUTES },
  lead: { kind: 'bar', dev: 'modaDevice', name: 'Ayşe Demir', routes: BAR_ROUTES },
  shift: { kind: 'bar', dev: 'modaDevice', name: 'Zeynep Arslan', routes: BAR_ROUTES },
  barista: { kind: 'bar', dev: 'modaDevice', name: 'Mehmet Kaya', routes: BAR_ROUTES },
  lead40: { kind: 'bar', dev: 'kalDevice', name: 'Mehmet Doğan', routes: ['/', '/ekip', '/talepler', '/sonuclarim'] },
  barBos: { kind: 'bar', dev: 'kalDevice', name: 'Şebnem', routes: ['/', '/bulten', '/sonuclarim', '/akademi'] },
  store: { kind: 'store', dev: 'modaDevice', routes: STORE_ROUTES },
  store40: { kind: 'store', dev: 'kalDevice', routes: ['/'] },
  storeBos: { kind: 'store', dev: 'bosDevice', routes: ['/', '/receteler'] },
  unpaired: { kind: 'none', routes: UNPAIRED_ROUTES }
};

const COMBOS = [
  ['s360', 'espresso', true], ['s390', 'espresso', true], ['s768', 'espresso', true], ['s1280', 'espresso', true], ['yatay', 'espresso', true],
  ['s390', 'latte', false], ['s1280', 'latte', false], ['s390', 'cekirdek', false], ['s1280', 'cekirdek', false]
];

const browser = await chromium.launch();
for (const role of process.argv.slice(2)) {
  const R = ROLES[role];
  const results = [];
  const errors = [];
  const combos = R.kind === 'staff' ? COMBOS : COMBOS.slice(0, 5).concat([['s390', 'gunisigi', false]]);
  for (const [size, theme, layout] of combos) {
    const ctx = await newCtx(browser, size, { theme: R.kind === 'staff' ? theme : null, device: R.dev ? EK[R.dev] : null });
    const page = await ctx.newPage();
    const errs = [];
    watch(page, errs);
    try {
      if (R.kind === 'staff') await staffLogin(page, role);
      else if (R.kind === 'bar') await baristaLogin(page, R.name, '1925');
      else { await page.goto(BASE + '/#/'); await page.waitForTimeout(800); await ready(page, 30000); }
    } catch (e) {
      results.push({ role, size, theme, route: 'LOGIN', error: String(e).slice(0, 200) });
      await page.screenshot({ path: shotPath(`${role}-${size}-${theme}-LOGIN`) }).catch(() => {});
      await ctx.close(); continue;
    }
    for (const route of R.routes) {
      errs.length = 0;
      await page.goto(BASE + '/#' + route);
      await page.waitForTimeout(600); await ready(page, 20000); await page.waitForTimeout(900);
      if (theme === 'gunisigi') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'gunisigi'));
      const finalRoute = new URL(page.url()).hash.slice(1) || '/';
      const name = `${role}-${size}-${theme}-${route.replace(/\//g, '_') || 'root'}`;
      const rec = { role, size, theme, route, finalRoute, shot: shotPath(name) };
      try {
        if (layout) Object.assign(rec, await measure(page, { mobile: size !== 's1280' && size !== 's768' }));
        else rec.contrast = await contrast(page);
      } catch (e) { rec.error = String(e).slice(0, 200); }
      await page.screenshot({ path: rec.shot, fullPage: true }).catch(() => {});
      rec.errs = [...errs];
      results.push(rec);
    }
    errors.push(...errs);
    await ctx.close();
    console.log(role, size, theme, 'tamam');
  }
  writeFileSync(join(OUT, `olcum-${role}.json`), JSON.stringify(results, null, 1));
}
await browser.close();
