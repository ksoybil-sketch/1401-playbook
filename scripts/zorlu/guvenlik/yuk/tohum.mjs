/**
 * Yük testi tohumu — YALNIZCA yerel emülatör (demo-guvenlik, 127.0.0.1).
 * 12 mağaza, 76 barista (5'i PIN'siz / davet bekliyor), 12 eşleşmiş telefon,
 * 10 kişilik ekip, tam müfredat (src/generated/curriculum.json).
 * Çıktı: scripts/yuk-testi/out/hesaplar.json (simülasyonun okuyacağı hesaplar).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { getAuth } = await import('firebase-admin/auth');
initializeApp({ projectId: 'demo-guvenlik' });
const db = getFirestore();
const auth = getAuth();

const DOMAIN = 'hesap.playbook1401.app';
const pinPassword = (id, pin) => `pb-${id}-${pin}`;
const invitePassword = (code) => `davet-${code}-1401`;
let seed = 1401;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const cur = JSON.parse(readFileSync(new URL('../../../../src/generated/curriculum.json', import.meta.url), 'utf8'));

async function writeAll(col, items) {
  for (let i = 0; i < items.length; i += 400) {
    const b = db.batch();
    items.slice(i, i + 400).forEach(({ id, ...rest }) => b.set(db.doc(`${col}/${id}`), rest));
    await b.commit();
  }
}
await writeAll('tracks', cur.tracks);
await writeAll('modules', cur.modules);
await writeAll('lessons', cur.lessons);
await writeAll('questions', cur.questions);
console.log('müfredat', cur.tracks.length, cur.modules.length, cur.lessons.length, cur.questions.length);

const STORE_NAMES = ['Moda Cadde', 'Çubuklu', 'Pendik', 'Bağdat Caddesi', 'Ataşehir Golf', 'Viaport Asia', 'Kadıköy İskele', 'Üsküdar Sahil', 'Şişli Merkez', 'Beşiktaş Çarşı', 'Göztepe Park', 'İzmir Alsancak'];
const slug = (s) => s.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stores = STORE_NAMES.map((name) => ({ id: slug(name), name, city: name.startsWith('İzmir') ? 'İzmir' : 'İstanbul', active: true, createdAt: Date.now() - 30 * 86400000 }));
await writeAll('stores', stores);

const FIRST = ['Ayşe', 'Mehmet', 'Zeynep', 'Deniz', 'Can', 'Burak', 'Elif', 'Sude', 'Emir', 'Nisa', 'Çağla', 'Gökhan', 'İrem', 'Şule', 'Ömer', 'Ülkü', 'Ilgaz', 'Öykü', 'Yiğit', 'Damla', 'Berk', 'Ece', 'Kaan', 'Melis', 'Onur', 'Pınar', 'Tuğçe', 'Umut', 'Selin', 'Arda', 'Buse', 'Cem', 'Defne', 'Efe', 'Fulya', 'Gizem', 'Hakan', 'Işıl'];
const LAST = ['Demir', 'Kaya', 'Arslan', 'Aydın', 'Yıldız', 'Çetin', 'Şahin', 'Korkmaz', 'Polat', 'Güneş', 'Öztürk', 'Çelik', 'Doğan', 'Kılıç', 'Aslan', 'Erdoğan', 'Koç', 'Kurt', 'Özdemir', 'Şimşek'];
const sizes = stores.map((_, i) => (i < 4 ? 7 : 6)); // 4×7 + 8×6 = 76
const baristas = [];
const users = [];
const progress = [];
const invites = [];
const accounts = { baristas: [], phones: [], staff: [] };
let n = 0;
const weak = (p) => /^(\d)\1{3}$/.test(p) || ['1234', '4321', '0123', '9876'].includes(p);
for (let si = 0; si < stores.length; si++) {
  const s = stores[si];
  const shifts = si % 2 === 0 ? 2 : 1;
  for (let k = 0; k < sizes[si]; k++) {
    n++;
    const id = `yb-${String(n).padStart(2, '0')}`;
    const role = k === 0 ? 'lead' : k <= shifts ? 'shift' : 'barista';
    const name = `${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`;
    // 5 kişi PIN'siz (davet kodu bekliyor): her biri farklı mağazada, rolü barista.
    const pending = role === 'barista' && [5, 18, 33, 51, 70].includes(n);
    let pin = null;
    while (!pin || weak(pin)) pin = String(Math.floor(rnd() * 10000)).padStart(4, '0');
    const email = `b-${id}-1@${DOMAIN}`;
    const code = pending ? String(300000 + n) : null;
    const password = pending ? invitePassword(code) : pinPassword(id, pin);
    const u = await auth.createUser({ email, password });
    const startedAt = new Date(Date.now() - Math.floor(rnd() * 900) * 86400000).toISOString().slice(0, 10);
    baristas.push({ id, name, storeId: s.id, role, phone: '', active: true, pinPending: pending, uid: u.uid, authEmail: email, accountSeq: 1, startedAt, createdAt: Date.now() - 20 * 86400000, inviteExpiresAt: pending ? Date.now() + 6 * 86400000 : null, codeIssuedByName: 'Uğur Can Gürbüz' });
    users.push({ id: u.uid, role, baristaId: id, storeId: s.id, active: true, createdAt: Date.now() - 20 * 86400000 });
    progress.push({ id, baristaId: id, storeId: s.id, lessons: {}, modules: {}, updatedAt: Date.now() - 20 * 86400000 });
    if (pending) invites.push({ id: code, baristaId: id, uid: u.uid, email, storeId: s.id, expiresAt: Date.now() + 6 * 86400000 });
    accounts.baristas.push({ id, name, storeId: s.id, role, uid: u.uid, email, pin: pending ? null : pin, invite: code, skill: 0.45 + rnd() * 0.5 });
  }
  // Mağaza telefonu (eşleşmiş).
  const pe = `tel-${s.id}-yuk@${DOMAIN}`;
  const pp = `telefon-${s.id}-sifre-1401`;
  const pu = await auth.createUser({ email: pe, password: pp });
  users.push({ id: pu.uid, role: 'store', storeId: s.id, active: true, paired: true, label: 'Android telefon', createdAt: Date.now() - 20 * 86400000, lastSeenAt: Date.now() - 3600000 });
  accounts.phones.push({ storeId: s.id, storeName: s.name, uid: pu.uid, email: pe, password: pp });
}
const STAFF = [
  ['k.soybil@1401coffee.com', 'Kutay Soybil', 'developer'],
  ['cenkgirginol@1401coffee.com', 'Cenk Girginol', 'director'],
  ['semihdizdar@1401coffee.com', 'Semih Dizdar', 'opsmanager'],
  ['ugurcangurbuz@1401coffee.com', 'Uğur Can Gürbüz', 'regional'],
  ['bolge2@1401coffee.com', 'Gülşen Ağaoğlu', 'regional'],
  ['ops1@1401coffee.com', 'Işıl Öncü', 'ops'],
  ['ops2@1401coffee.com', 'Çağrı Şen', 'ops'],
  ['ops3@1401coffee.com', 'Ümit İnce', 'ops'],
  ['ogunturanli@1401coffee.com', 'Ogün Turanlı', 'board'],
  ['bulentozgurkilic@1401coffee.com', 'Bülent Özgür Kılıç', 'board']
];
for (const [email, name, role] of STAFF) {
  const password = 'yuk-testi-1401';
  const u = await auth.createUser({ email, password, displayName: name });
  users.push({ id: u.uid, role, name, email, active: true, createdAt: Date.now() - 30 * 86400000 });
  accounts.staff.push({ email, password, name, role, uid: u.uid });
}
await writeAll('baristas', baristas);
await writeAll('users', users);
await writeAll('progress', progress);
await writeAll('invites', invites);
await db.doc('config/bootstrap').set({ uid: accounts.staff[0].uid, at: Date.now() });
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/hesaplar.json', import.meta.url), JSON.stringify(accounts, null, 1));
console.log('baristas', baristas.length, 'pinsiz', invites.length, 'telefon', accounts.phones.length, 'ekip', accounts.staff.length);
process.exit(0);
