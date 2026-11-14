/** Madde 9 (kural): mağaza müdürü kapanmış (çözüldü/reddedildi) talebe yazamaz; açık talebe yazabilir. */
import { readFileSync, writeFileSync } from 'node:fs';
import { client, dene } from './lib/istemci.mjs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const adb = getFirestore();
const H = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url), 'utf8'));
const lead = H.baristas.find((b) => b.role === 'lead' && b.pin && b.storeId === 'cubuklu');
const c = await client('kt'); await c.backend.baristaSignIn({ id: lead.id, authEmail: lead.email }, lead.pin);
const rq = await c.m('api/requests.ts');
const out = {};
for (const st of ['done', 'rejected', 'in_progress']) {
  const ref = await adb.collection('requests').add({ storeId: lead.storeId, storeName: 'x', category: 'diger', priority: 'normal', title: `kural ${st}`, detail: '', status: st, notes: [], createdAt: Date.now(), createdBy: c.uid(), createdByName: lead.name, updatedAt: Date.now(), lastSide: 'ops', closedAt: null });
  const r = { id: ref.id, ...(await ref.get()).data() };
  out[st] = await dene(rq.addNote(r, { side: 'store', by: { uid: c.uid(), name: lead.name }, text: 'mağaza yazdı' }));
}
console.log(JSON.stringify(out));
writeFileSync(new URL('./out/kapali-talep.json', import.meta.url), JSON.stringify(out));
process.exit(0);
