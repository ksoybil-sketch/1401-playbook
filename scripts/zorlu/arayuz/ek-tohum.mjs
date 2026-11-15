/**
 * Zorlu senaryo Bölüm 1 — seed'de olmayan uç durumlar. YALNIZCA yerel emülatör.
 *  - Kahve Operasyonu (ops) hesabı
 *  - hiç verisi olmayan yepyeni şube (uzun adlı)
 *  - 40 baristalı şube + eşleşmiş telefon
 *  - 300 görevli barista (Mehmet Kaya, Moda Cadde)
 *  - 0 sorulu modül (tek dersli)
 *  - uzun / emojili adlı barista
 * Çıktı: out/ek-hesaplar.json
 */
import { writeFileSync } from 'node:fs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { getAuth } = await import('firebase-admin/auth');
initializeApp({ projectId: 'demo-playbook' });
const db = getFirestore();
const auth = getAuth();
const DOMAIN = 'hesap.playbook1401.app';
const pinPassword = (id, pin) => `pb-${id}-${pin}`;
const now = Date.now();
const ensure = async (email, password, displayName) => {
  try { return await auth.getUserByEmail(email); } catch { return auth.createUser({ email, password, displayName }); }
};
const out = {};

// Ops
const ops = await ensure('kahveops@1401coffee.com', '351925', 'Kahve Ops Deneme');
await db.doc(`users/${ops.uid}`).set({ role: 'ops', name: 'Kahve Ops Deneme', email: 'kahveops@1401coffee.com', active: true, createdAt: now });
out.ops = { email: 'kahveops@1401coffee.com', password: '351925' };

// Boş şube
await db.doc('stores/bos-sube').set({ name: 'Kadıköy Rıhtım Şehir Hatları İskelesi Karşısı Yeni Şube', city: 'İstanbul', active: true, createdAt: now });
const bosDev = await ensure(`tel-bos-sube-1@${DOMAIN}`, 'test-cihaz-bos', 'Boş telefon');
await db.doc(`users/${bosDev.uid}`).set({ role: 'store', storeId: 'bos-sube', active: true, paired: true, label: 'Mağaza telefonu', createdAt: now, lastSeenAt: now });
out.bosDevice = { uid: bosDev.uid, email: `tel-bos-sube-1@${DOMAIN}`, password: 'test-cihaz-bos', storeId: 'bos-sube', storeName: 'Kadıköy Rıhtım Şehir Hatları İskelesi Karşısı Yeni Şube' };

// 40 baristalı şube
await db.doc('stores/kalabalik').set({ name: 'Kalabalık Şube', city: 'İstanbul', active: true, createdAt: now });
const FIRST = ['Ayşe', 'Mehmet', 'Zeynep', 'Çağla', 'Gökhan', 'İrem', 'Şule', 'Ömer', 'Ülkü', 'Ilgaz', 'Öykü', 'Yiğit', 'Damla', 'Berk'];
const LAST = ['Demir', 'Kaya', 'Arslan', 'Öztürk', 'Çelik', 'Doğan', 'Kılıç', 'Şimşek', 'Güneş'];
for (let i = 1; i <= 40; i++) {
  const id = `kb-${String(i).padStart(2, '0')}`;
  const role = i === 1 ? 'lead' : i <= 3 ? 'shift' : 'barista';
  let name = `${FIRST[i % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`;
  if (i === 2) name = 'Muhammed Mustafa Abdurrahmanoğulları Karaosmanoğlu';
  if (i === 4) name = 'Şebnem ☕️ Ölçer 🎉';
  const email = `b-${id}-1@${DOMAIN}`;
  const acc = await ensure(email, pinPassword(id, '1925'), name);
  await db.doc(`users/${acc.uid}`).set({ role, baristaId: id, storeId: 'kalabalik', active: true, createdAt: now });
  await db.doc(`baristas/${id}`).set({ name, storeId: 'kalabalik', role, phone: '', active: true, uid: acc.uid, authEmail: email, accountSeq: 1, pinPending: false, startedAt: '2026-09-01', createdAt: now });
  await db.doc(`progress/${id}`).set({ baristaId: id, storeId: 'kalabalik', lessons: {}, modules: {}, updatedAt: now });
}
const kDev = await ensure(`tel-kalabalik-1@${DOMAIN}`, 'test-cihaz-kal', 'Kalabalık telefon');
await db.doc(`users/${kDev.uid}`).set({ role: 'store', storeId: 'kalabalik', active: true, paired: true, label: 'Mağaza telefonu', createdAt: now, lastSeenAt: now });
out.kalDevice = { uid: kDev.uid, email: `tel-kalabalik-1@${DOMAIN}`, password: 'test-cihaz-kal', storeId: 'kalabalik', storeName: 'Kalabalık Şube' };

// Moda Cadde telefonu (seed'deki) — eşleştirme kodu tüketilmesin diye kimlik doğrudan
const modaPair = (await db.doc('pairingCodes/140114').get()).data();
out.modaDevice = { uid: modaPair.uid, email: modaPair.email, password: modaPair.password, storeId: 'moda-cadde', storeName: 'Moda Cadde' };
await db.doc(`users/${modaPair.uid}`).update({ paired: true, lastSeenAt: now });

// 0 sorulu modül
await db.doc('modules/bos-modul').set({ trackId: 'oryantasyon', title: 'Sorusu olmayan modül', description: 'Zorlu senaryo: 0 soru', order: 99, passScore: 80, examSize: 10, prerequisiteId: null, published: true, questionCount: 0 });
await db.doc('lessons/bos-modul-ders').set({ moduleId: 'bos-modul', title: 'Tek ders', order: 1, durationMin: 1, blocks: [{ type: 'text', text: 'Deneme.' }] });

// 300 görevli barista: Mehmet Kaya (demo-mehmet)
const director = await auth.getUserByEmail('cenkgirginol@1401coffee.com');
const lessons = (await db.collection('lessons').limit(80).get()).docs.map((d) => ({ id: d.id, title: d.data().title }));
for (let i = 0; i < 300; i += 300) {
  const b = db.batch();
  for (let k = 0; k < 300; k++) {
    const l = lessons[k % lessons.length];
    b.set(db.doc(`assignments/z300-${String(k).padStart(3, '0')}`), {
      kind: 'lesson', targetId: l.id, title: `${l.title} (#${k})`, note: k % 7 === 0 ? 'Uzun not '.repeat(30) : '', storeId: 'moda-cadde', baristaId: 'demo-mehmet',
      dueAt: now + ((k % 21) - 7) * 86400000, createdAt: now - k * 60000, createdBy: director.uid, createdByName: 'Cenk Girginol'
    });
  }
  await b.commit();
}
writeFileSync(new URL('./out/ek-hesaplar.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('tamam', Object.keys(out));
process.exit(0);
