// Geçiş 8: kullanıcı kuralları — geliştirici görünmez mi, kapalı talebe yazılabiliyor mu.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { chromium, BASE, OUT, EK, newCtx, staffLogin, baristaLogin, ready, shotPath } from './lib.mjs';
const res = [];
const log = (r) => { res.push(r); console.log(JSON.stringify(r).slice(0, 600)); };
const browser = await chromium.launch();
const STAFF_R = ['/', '/magazalar', '/magazalar/moda-cadde', '/baristalar', '/gorevler', '/talepler', '/onaylar', '/bulten', '/icerik', '/geri-bildirim', '/kurul-sorulari', '/bildirimler', '/yetkiler', '/rozetler'];
const RX = /Kutay|Soybil|soybil|Uygulama geliştiricisi/;
for (const role of ['director', 'regional', 'board']) {
  const ctx = await newCtx(browser, 's1280');
  const p = await ctx.newPage();
  await staffLogin(p, role);
  const hits = [];
  for (const r of role === 'board' ? ['/', '/magazalar', '/isler', '/sorular', '/raporlar'] : STAFF_R) {
    await p.goto(BASE + '/#' + r); await p.waitForTimeout(500); await ready(p, 20000); await p.waitForTimeout(800);
    const txt = await p.locator('body').innerText();
    const m = txt.match(RX);
    if (m) hits.push(`${r}: …${txt.slice(Math.max(0, m.index - 60), m.index + 40).replace(/\n/g, ' ')}…`);
  }
  log({ test: 'gelistirici-gorunur-mu', role, hits });
  await ctx.close();
}
{
  const ctx = await newCtx(browser, 's390', { device: EK.modaDevice });
  const p = await ctx.newPage();
  await baristaLogin(p, 'Ayşe Demir', '1925');
  await p.goto(BASE + '/#/talepler'); await ready(p); await p.waitForTimeout(1000);
  const closed = p.getByText(/Kapananlar|Kapanan/).first();
  if (await closed.count()) { await closed.click().catch(() => {}); await p.waitForTimeout(600); }
  const req4 = p.getByText('Yeni barista için davet kodu').first();
  let r = { bulundu: await req4.count() };
  if (r.bulundu) {
    await req4.click(); await p.waitForTimeout(800);
    r = { ...r, textarea: await p.getByRole('dialog').locator('textarea').count(), metin: (await p.getByRole('dialog').innerText()).slice(-200) };
    await p.screenshot({ path: shotPath('v-kapali-talep') });
  }
  log({ test: 'kapali-talebe-yazma', ...r });
  await ctx.close();
}
writeFileSync(join(OUT, 'son.json'), JSON.stringify(res, null, 1));
await browser.close();
process.exit(0);
