// 4.1 Rozetin geçerlilik süresi dolarken: gerçek badges.ts modülü tarayıcıda (vite) çağrılır.
import { chromium, BASE, save } from './lib.mjs';
const browser = await chromium.launch();
const page = await (await browser.newContext({ timezoneId: 'Europe/Istanbul' })).newPage();
await page.goto(BASE + '/#/yonetici-girisi');
const res = await page.evaluate(async () => {
  const B = await import('/src/lib/badges.ts');
  const DAY = 86400000, now = Date.now();
  const granted = { 'seviye-oryantasyon': { at: now, byName: 't' }, 'seviye-misafir': { at: now, byName: 't' } };
  for (const id of B.BADGES.map((b) => b.id).slice(0, 8)) granted[id] = { at: now, byName: 't' };
  const base = { tracks: [], modules: [], lessons: [], progress: { modules: {}, lessons: {} }, attempts: [], assignments: [], startedAt: '2025-01-01', now };
  const run = (titles, delivered, ago, extra = {}) => {
    const r = B.badgeReport({ ...base, ...extra, config: { titles }, overrides: { granted }, delivered, deliveredAt: now - ago * DAY });
    return { title: r.title?.id || null, pending: r.pendingTitle?.id || null, qualified: r.qualified?.id || null, expired: r.expired };
  };
  const ap = { mode: 'approval', validDays: 30 };
  return {
    rookie_onayli_30g_29gun: run({ rookie: ap }, 'rookie', 29),
    rookie_onayli_30g_31gun: run({ rookie: ap }, 'rookie', 31),
    rookie_otomatik_30g_31gun: run({ rookie: { mode: 'auto', validDays: 30 } }, 'rookie', 31),
    spec_onayli_dolmus_rookie_otomatik: run({ specialist: ap }, 'specialist', 31, { startedAt: '2025-01-01' }),
    gecerlilik_0dan_30a_cekilince_400gun_once_teslim: run({ rookie: ap }, 'rookie', 400),
    kidem_utc_parse: (() => { const d = B.badgeReport({ ...base, startedAt: '2026-10-16', now: new Date(2026, 10, 15, 1, 0).getTime() }).days; const d2 = B.badgeReport({ ...base, startedAt: '2026-10-16', now: new Date(2026, 10, 15, 4, 0).getTime() }).days; return { saat0100: d, saat0400: d2 }; })()
  };
});
console.log(JSON.stringify(res, null, 1));
save('rozet.json', res);
await browser.close();
