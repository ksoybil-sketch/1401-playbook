// 3.4 Direktör aynı gün birini çıkarır, sonra yeniden etkinleştirir: hesap, ilerleme, rozet, görev, telefon oturumu.
import { chromium, BASE, save, txt, staffLogin, phoneCtx, baristaLogin } from './lib.mjs';
import { db } from './admin.mjs';
const res = {};
const browser = await chromium.launch();
const B = 'demo-burak';
await db.doc('baristas/' + B).update({ apronBadge: 'rookie', apronBadgeAt: Date.now() - 86400000 });
const before = { b: (await db.doc('baristas/' + B).get()).data(), p: (await db.doc('progress/' + B).get()).data(), att: (await db.collection('attempts').where('baristaId', '==', B).get()).size };
const { EK } = await import('./lib.mjs');
const { device } = await import('./admin.mjs');
const devC = await device('cubuklu', 'Çubuklu');
// Burak telefonda açık
const ph = await phoneCtx(browser, { device: devC });
const pp = await ph.newPage();
await baristaLogin(pp, 'Burak Çetin', '1925');
const st = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
const sp = await st.newPage();
await staffLogin(sp, 'regional');
const b0 = { id: B, ...before.b };
res.cikar = await sp.evaluate(async (b) => { const { backend } = await import('/src/api/backend.ts'); await backend.setBaristaActive(b, false, 'Test'); return 'ok'; }, b0);
await pp.waitForTimeout(4000);
res.telefonCikarilinca = (await txt(pp)).split('\n').slice(0, 3).join(' | ');
const b1 = { id: B, ...(await db.doc('baristas/' + B).get()).data() };
res.geriAl = await sp.evaluate(async (b) => { const { backend } = await import('/src/api/backend.ts'); const r = await backend.setBaristaActive(b, true, 'Test'); return { kod: !!r.code }; }, b1);
const after = { b: (await db.doc('baristas/' + B).get()).data(), p: (await db.doc('progress/' + B).get()).data(), att: (await db.collection('attempts').where('baristaId', '==', B).get()).size };
res.karsilastir = {
  aktif: after.b.active, pinPending: after.b.pinPending, hesapDegisti: before.b.uid !== after.b.uid,
  ilerlemeModulSayisi: [Object.keys(before.p?.modules || {}).length, Object.keys(after.p?.modules || {}).length],
  denemeSayisi: [before.att, after.att], onlukRozeti: [before.b.apronBadge, after.b.apronBadge],
  baslamaTarihi: [before.b.startedAt, after.b.startedAt], createdAt: before.b.createdAt === after.b.createdAt, deactivatedAt: after.b.deactivatedAt ?? null
};
await pp.goto(BASE + '/#/'); await pp.waitForTimeout(2500);
res.telefonListede = (await txt(pp)).includes('Burak Çetin');
console.log(JSON.stringify(res, null, 1)); save('cikar-geri.json', res);
await browser.close(); process.exit(0);
