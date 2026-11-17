/**
 * Kullanım sayacının iki ardışık yazımını emülatörde dener ve hatayı yazar.
 * Canlıda (demo) ikinci yazım sessizce reddediliyordu; sebebini bulmak için.
 *
 *   node --no-warnings scripts/yuk-testi/sayac-iki-yazim.mjs
 *
 * Emülatör açık olmalı (auth 9099, firestore 8080). Hiçbir şeye bağlı değil:
 * kendi hesabını açar, kendi mağazasını kullanır.
 */
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const { initializeApp: adminInit } = await import('firebase-admin/app');
const { getFirestore: adminDb } = await import('firebase-admin/firestore');
const { getAuth: adminAuth } = await import('firebase-admin/auth');
adminInit({ projectId: 'demo-playbook' });

const STORE = 'sayac-test-magaza';
const email = `sayac-${Date.now()}@ornek.test`;
const password = 'sayac-deneme-1401';
const u = await adminAuth().createUser({ email, password });
await adminDb().doc(`users/${u.uid}`).set({ role: 'store', storeId: STORE, active: true, paired: true, createdAt: Date.now() });
await adminDb().doc(`stores/${STORE}`).set({ name: 'Sayaç Testi', city: 'İstanbul', active: true, createdAt: Date.now() });

const { initializeApp } = await import('firebase/app');
const { getAuth, signInWithEmailAndPassword, connectAuthEmulator } = await import('firebase/auth');
const fs = await import('firebase/firestore');
const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-playbook', authDomain: 'demo-playbook.firebaseapp.com', appId: 'demo' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = fs.initializeFirestore(app, {});
fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
await signInWithEmailAndPassword(auth, email, password);

const gun = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const id = `${STORE}_${gun}`;
const yaz = async (ad, data) => {
  try {
    await fs.setDoc(fs.doc(db, 'kullanim', id), { day: gun, storeId: STORE, updatedAt: Date.now(), ...data }, { merge: true });
    console.log(`GEÇTİ  | ${ad}`);
  } catch (e) {
    console.log(`KALDI  | ${ad} → ${e.code || ''} ${e.message}`);
  }
};

// 1. Açılış paketi (demoda geçen yazım).
await yaz('1. açılış + ekran', { acilis: fs.increment(1), saatler: { '09': fs.increment(1) }, ekran: { ana: fs.increment(1) } });
// 2. Yalnızca gezinme (demoda reddedilen yazım).
await yaz('2. yalnızca ekran + reçete', { ekran: { receteler: fs.increment(2), recete: fs.increment(1) }, recete: { 'r-espresso': fs.increment(1) } });
// 3. Aynısı, acilis da gönderilirse.
await yaz('3. ekran + reçete + acilis', { acilis: fs.increment(1), ekran: { ekip: fs.increment(1) }, recete: { 'r-latte': fs.increment(1) } });
// 4. saatler olmadan, acilis olmadan, yalnızca tek ekran.
await yaz('4. yalnızca tek ekran', { ekran: { bulten: fs.increment(1) } });

const son = await adminDb().doc(`kullanim/${id}`).get();
console.log('\nbelge:', JSON.stringify(son.data()));

await adminDb().doc(`users/${u.uid}`).delete();
await adminDb().doc(`stores/${STORE}`).delete();
await adminDb().doc(`kullanim/${id}`).delete();
await adminAuth().deleteUser(u.uid);
process.exit(0);
