// 4.1 (sonra) H12: süre dolmadan 14 gün önce uyarı (şartlar tutmuyorsa), tutuyorsa kendiliğinden yenileme.
import { chromium, BASE, save } from './lib.mjs';
const browser = await chromium.launch();
const page = await (await browser.newContext({ timezoneId: 'UTC' })).newPage();
await page.goto(BASE + '/#/yonetici-girisi');
const res = await page.evaluate(async () => {
  const B = await import('/src/lib/badges.ts');
  const DAY = 86400000, now = Date.now();
  const granted = {};
  for (const id of B.BADGES.map((b) => b.id).slice(0, 8)) granted[id] = { at: now, byName: 't' };
  const base = { tracks: [], modules: [], lessons: [], progress: { modules: {}, lessons: {} }, attempts: [], assignments: [], startedAt: '2025-01-01', now };
  const ap = { mode: 'approval', validDays: 30 };
  const run = (titles, delivered, ago) => {
    const r = B.badgeReport({ ...base, config: { titles }, overrides: { granted }, delivered, deliveredAt: now - ago * DAY });
    return { title: r.title?.id || null, qualified: r.qualified?.id || null, expired: r.expired, renewed: r.renewed,
      expiresSoon_gun: r.expiresSoon ? Math.round((r.expiresSoon - now) / DAY) : null, validUntil_gun: r.validUntil ? Math.round((r.validUntil - now) / DAY) : null };
  };
  return {
    tutuyor_31gun_yenilendi: run({ rookie: ap }, 'rookie', 31),
    tutmuyor_20gun_uyari: run({ specialist: ap }, 'specialist', 20),
    tutmuyor_10gun_uyari_yok: run({ specialist: ap }, 'specialist', 10),
    tutmuyor_31gun_doldu: run({ specialist: ap }, 'specialist', 31)
  };
});
console.log(JSON.stringify(res, null, 1));
save('rozet2.json', res);
await browser.close();
