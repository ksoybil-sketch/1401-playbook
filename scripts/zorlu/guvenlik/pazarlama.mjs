/**
 * Pazarlama & Kreatif rolünün sınırı — CANLI kurallara karşı (firestore.rules).
 *
 * Bu dosya kendi verisini kurar; başka tohuma bağlı değil. Kök firebase.json
 * ile çalışır, yani kurallar yayına giden firestore.rules dosyasından okunur.
 * Proje kimliği ayrı (demo-pazarlama): `npm run emulators`in kayıtlı örnek
 * verisine (.emulator-data) dokunmaz.
 *
 * Çalıştırma (iki terminal ya da arka plan):
 *   firebase emulators:start --project demo-pazarlama --only firestore,auth
 *   node scripts/zorlu/guvenlik/pazarlama.mjs
 *
 * Beklenen: bütün satırlar GEÇTİ. Bir satır KALDI ise kurallar ile
 * src/lib/permissions.ts (DEFAULTS, DEFAULT_CATS) ayrışmış demektir.
 */
const HOST = '127.0.0.1', FS_PORT = 8080, AUTH_PORT = 9099, PROJECT = 'demo-pazarlama';
process.env.FIRESTORE_EMULATOR_HOST = `${HOST}:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `${HOST}:${AUTH_PORT}`;

import { initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator, memoryLocalCache,
  addDoc, arrayUnion, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where
} from 'firebase/firestore';

adminInit({ projectId: PROJECT });
const adb = adminFs();
const aauth = adminAuth();
const now = Date.now();

/* ---------------------------------------------------------------- */
/* Veri: iki yönetici, bir mağaza müdürü, iki talep (tabela + arıza) */
/* ---------------------------------------------------------------- */
const accounts = {};
async function user(key, email, password, profile) {
  const u = await aauth.createUser({ email, password }).catch(async (e) => {
    if (e.code === 'auth/email-already-exists') return aauth.getUserByEmail(email);
    throw e;
  });
  await aauth.updateUser(u.uid, { password });
  accounts[key] = { uid: u.uid, email, password };
  if (profile) await adb.doc(`users/${u.uid}`).set({ ...profile, createdAt: now });
  return u.uid;
}

await user('marketing', 'pazarlama@ornek.test', 'pazarlama-123',
  { role: 'marketing', name: 'Pazarlama', email: 'pazarlama@ornek.test', active: true });
await user('regional', 'bolge@ornek.test', 'bolge-12345',
  { role: 'regional', name: 'Bölge', email: 'bolge@ornek.test', active: true });
await user('lead', 'mudur@ornek.test', 'mudur-12345',
  { role: 'lead', name: 'Mağaza Müdürü', storeId: 'S1', baristaId: 'bL', active: true });

await adb.doc('stores/S1').set({ name: 'Moda', active: true, createdAt: now });
await adb.doc('baristas/bL').set({ name: 'Mağaza Müdürü', storeId: 'S1', role: 'lead', active: true, createdAt: now });
await adb.doc('tracks/t1').set({ title: 'Kahve', order: 1, published: true });
await adb.doc('modules/m1').set({ trackId: 't1', title: 'Espresso', order: 1, passScore: 70, examSize: 10, published: true });
await adb.doc('lessons/l1').set({ moduleId: 'm1', title: 'Öğütme', order: 1, durationMin: 3, blocks: [], published: true });
await adb.doc('questions/q1').set({ moduleId: 'm1', prompt: 'Soru?', options: ['a', 'b'], answer: 0, type: 'single' });
await adb.doc('bulletins/b1').set({ kind: 'duyuru', title: 'Duyuru', body: 'x', published: true, createdAt: now });

const req = (id, category, title) => adb.doc(`requests/${id}`).set({
  storeId: 'S1', storeName: 'Moda', category, priority: 'normal', title, detail: 'x',
  status: 'open', notes: [], createdAt: now, createdBy: accounts.lead.uid, createdByName: 'Mağaza Müdürü',
  updatedAt: now, lastSide: 'store', closedAt: null
});
await req('rTabela', 'tabela', 'Işıklı tabela yanmıyor');
await req('rPano', 'pano', 'Menü panosu hasarlı');
await req('rAriza', 'ariza', 'Değirmen arızalı');

/* ---------------------------------------------------------------- */
/* İstemciler ve deneme yardımcısı                                  */
/* ---------------------------------------------------------------- */
const cfg = { apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com`, appId: 'demo' };
let n = 0;
const clients = {};
async function as(key) {
  if (clients[key]) return clients[key];
  const app = initializeApp(cfg, `c${++n}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:${AUTH_PORT}`, { disableWarnings: true });
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, HOST, FS_PORT);
  await signInWithEmailAndPassword(auth, accounts[key].email, accounts[key].password);
  clients[key] = db;
  return db;
}

const rows = [];
async function t(role, what, expect, fn) {
  let got = 'izin', code = '';
  try { await fn(); } catch (e) { got = 'red'; code = e.code || String(e.message || e); }
  const ok = got === expect;
  rows.push({ role, what, expect, got, ok });
  console.log(`${ok ? 'GEÇTİ' : 'KALDI'} | [${role}] ${what} | beklenen=${expect} gerçek=${got}${code ? ` (${code})` : ''}`);
}
const note = (text, status) => ({
  at: Date.now(), by: accounts.marketing.uid, byName: 'Pazarlama', side: 'ops', text, ...(status ? { status } : {})
});

/* ---------------------------------------------------------------- */
/* Pazarlama & Kreatif: okur                                        */
/* ---------------------------------------------------------------- */
{
  const db = await as('marketing');
  await t('marketing', 'bülteni oku', 'izin', () => getDoc(doc(db, 'bulletins/b1')));
  await t('marketing', 'talepleri listele', 'izin', () => getDocs(collection(db, 'requests')));
  await t('marketing', 'akademiyi oku (ders)', 'izin', () => getDoc(doc(db, 'lessons/l1')));
  await t('marketing', 'soru bankasını oku', 'izin', () => getDoc(doc(db, 'questions/q1')));
  await t('marketing', 'ekip listesini oku', 'izin', () =>
    getDocs(query(collection(db, 'users'), where('role', 'in', ['director', 'opsmanager', 'regional', 'marketing', 'board']))));
  await t('marketing', 'yetki ayarını oku', 'izin', () => getDoc(doc(db, 'config/permissions')));

  // Kendi konuları: yanıtlar ve kapatır.
  await t('marketing', 'tabela talebini işleme al', 'izin', () => updateDoc(doc(db, 'requests/rTabela'),
    { status: 'in_progress', updatedAt: Date.now(), lastSide: 'ops', notes: arrayUnion(note('Servis çağırdık', 'in_progress')) }));
  await t('marketing', 'pano talebini çözüldü yap', 'izin', () => updateDoc(doc(db, 'requests/rPano'),
    { status: 'done', closedAt: Date.now(), updatedAt: Date.now(), lastSide: 'ops', notes: arrayUnion(note('Pano değişti', 'done')) }));

  // Başka birimin konusu: dokunamaz.
  await t('marketing', 'ARIZA talebini işleme al', 'red', () => updateDoc(doc(db, 'requests/rAriza'),
    { status: 'in_progress', updatedAt: Date.now(), lastSide: 'ops', notes: arrayUnion(note('x', 'in_progress')) }));
  await t('marketing', 'ARIZA talebine yalnızca not yaz', 'red', () => updateDoc(doc(db, 'requests/rAriza'),
    { updatedAt: Date.now(), lastSide: 'ops', notes: arrayUnion(note('x')) }));
  await t('marketing', 'talebin konusunu kendine çevir (ariza→tabela)', 'red', () => updateDoc(doc(db, 'requests/rAriza'),
    { category: 'tabela', updatedAt: Date.now(), lastSide: 'ops', notes: arrayUnion(note('x')) }));
  await t('marketing', 'kendi talebinin konusunu değiştir (tabela→ariza)', 'red', () => updateDoc(doc(db, 'requests/rTabela'),
    { category: 'ariza', updatedAt: Date.now(), lastSide: 'ops', notes: arrayUnion(note('x')) }));

  // Akademi ve bülten: salt okunur (öneri bile açmaz).
  await t('marketing', 'derse yaz', 'red', () => updateDoc(doc(db, 'lessons/l1'), { title: 'Değişti' }));
  await t('marketing', 'modüle yaz', 'red', () => updateDoc(doc(db, 'modules/m1'), { title: 'Değişti' }));
  await t('marketing', 'soruya yaz', 'red', () => updateDoc(doc(db, 'questions/q1'), { prompt: 'Değişti' }));
  await t('marketing', 'bülten yayınla', 'red', () => addDoc(collection(db, 'bulletins'),
    { kind: 'duyuru', title: 'Pazarlama duyurusu', body: 'x', published: true, createdAt: Date.now() }));
  await t('marketing', 'öneri (proposal) aç', 'red', () => addDoc(collection(db, 'proposals'),
    { kind: 'lesson', title: 'x', summary: 'x', ops: [], status: 'pending', createdBy: accounts.marketing.uid, createdByName: 'Pazarlama', createdAt: Date.now() }));
  await t('marketing', 'görev ata', 'red', () => addDoc(collection(db, 'assignments'),
    { moduleId: 'm1', storeIds: ['S1'], createdAt: Date.now(), createdBy: accounts.marketing.uid }));

  // Yetki ve hesaplar: kendini yükseltemez, ekibe karışamaz.
  await t('marketing', 'kendi rolünü director yap', 'red', () => updateDoc(doc(db, `users/${accounts.marketing.uid}`), { role: 'director' }));
  await t('marketing', 'yetki ayarını değiştir', 'red', () => setDoc(doc(db, 'config/permissions'),
    { roles: { marketing: { icerikYayin: true } } }, { merge: true }));
  await t('marketing', 'barista hesabı aç', 'red', () => setDoc(doc(db, 'users/yeni-barista'),
    { role: 'barista', name: 'x', storeId: 'S1', baristaId: 'bX', active: true }));
  await t('marketing', 'barista belgesine yaz', 'red', () => updateDoc(doc(db, 'baristas/bL'), { name: 'Değişti' }));
}

/* ---------------------------------------------------------------- */
/* Bölge Müdürü: konu sınırı yok — yeni konular da onda açık         */
/* ---------------------------------------------------------------- */
{
  const db = await as('regional');
  await t('regional', 'tabela talebini yanıtla', 'izin', () => updateDoc(doc(db, 'requests/rTabela'),
    { updatedAt: Date.now(), lastSide: 'ops', notes: arrayUnion({ at: Date.now(), by: accounts.regional.uid, byName: 'Bölge', side: 'ops', text: 'Bakıyoruz' }) }));
  await t('regional', 'arıza talebini yanıtla', 'izin', () => updateDoc(doc(db, 'requests/rAriza'),
    { updatedAt: Date.now(), lastSide: 'ops', notes: arrayUnion({ at: Date.now(), by: accounts.regional.uid, byName: 'Bölge', side: 'ops', text: 'Servis geliyor' }) }));
}

/* ---------------------------------------------------------------- */
/* Mağaza müdürü: yeni konularda talep açabilir                      */
/* ---------------------------------------------------------------- */
{
  const db = await as('lead');
  // Yeni konu sınırı eklendi: mağaza tarafının kendi yazma yolu bozulmadı mı?
  await t('lead', 'kendi talebine not yaz (tabela)', 'izin', () => updateDoc(doc(db, 'requests/rTabela'), {
    updatedAt: Date.now(), lastSide: 'store',
    notes: arrayUnion({ at: Date.now(), by: accounts.lead.uid, byName: 'Mağaza Müdürü', side: 'store', text: 'Tabela hâlâ yanmıyor' })
  }));
  await t('lead', 'talebi kendi kapat (status=done)', 'red', () => updateDoc(doc(db, 'requests/rTabela'), {
    status: 'done', closedAt: Date.now(), updatedAt: Date.now(), lastSide: 'store'
  }));
  for (const c of ['tabela', 'pano', 'baski']) {
    await t('lead', `${c} talebi aç`, 'izin', () => addDoc(collection(db, 'requests'), {
      storeId: 'S1', storeName: 'Moda', category: c, priority: 'normal', title: `${c} talebi`, detail: 'x',
      status: 'open', notes: [], createdAt: Date.now(), createdBy: accounts.lead.uid, createdByName: 'Mağaza Müdürü',
      updatedAt: Date.now(), lastSide: 'store', closedAt: null
    }));
  }
}

const kaldi = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - kaldi.length}/${rows.length} geçti.`);
if (kaldi.length) {
  console.log('KALAN SATIRLAR:');
  kaldi.forEach((r) => console.log(` - [${r.role}] ${r.what}: beklenen=${r.expect} gerçek=${r.got}`));
}
process.exit(kaldi.length ? 1 : 0);
