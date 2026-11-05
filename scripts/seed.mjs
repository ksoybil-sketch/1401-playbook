/**
 * Emülatöre başlangıç verisi yükler: müfredat, örnek mağazalar, test
 * yöneticisi ve test baristaları.
 *
 *   npm run emulators          (ayrı terminalde)
 *   npm run seed:emu
 *
 * --dry-run : hiçbir şey yazmaz, müfredat istatistiğini ve örnek soruları basar.
 *
 * Gerçek projeye SADECE müfredat yüklenir (--production --content-only);
 * test hesapları ve PIN'ler yalnızca emülatör içindir.
 *
 * Spark (sunucusuz) model: her hesap bir Firebase Auth kullanıcısıdır,
 * şifre formülleri src/api/backend.ts ile birebir aynı olmalı.
 */
import { readFileSync, existsSync } from 'node:fs';
import { CURRICULUM } from './content.mjs';

// .env.production'ı elle yükle (ekstra bağımlılık eklememek için).
if (existsSync('.env.production')) {
  for (const line of readFileSync('.env.production', 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const ACCOUNT_DOMAIN = 'hesap.playbook1401.app';
const pinPassword = (baristaId, pin) => `pb-${baristaId}-${pin}`;
const invitePassword = (code) => `davet-${code}-1401`;

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');

/* Test hesapları — yalnızca yerel emülatör. */
export const TEST = {
  staff: { email: 'operasyon@1401.test', password: 'Playbook-Test-2026', name: 'Test Operasyon' },
  stores: [
    { id: 'moda-cadde', name: 'Moda Cadde', city: 'İstanbul' },
    { id: 'cubuklu', name: 'Çubuklu', city: 'İstanbul' },
    { id: 'pendik', name: 'Pendik', city: 'İstanbul' }
  ],
  baristas: [
    { id: 'demo-ayse', name: 'Ayşe Demir', storeId: 'moda-cadde', role: 'lead', pin: '2580' },
    { id: 'demo-mehmet', name: 'Mehmet Kaya', storeId: 'moda-cadde', role: 'barista', pin: '1470' },
    { id: 'demo-zeynep', name: 'Zeynep Arslan', storeId: 'moda-cadde', role: 'barista', pin: '3690' },
    { id: 'demo-can', name: 'Can Yıldız', storeId: 'cubuklu', role: 'barista', pin: '2468' },
    { id: 'demo-elif', name: 'Elif Şahin', storeId: 'pendik', role: 'barista', pin: '1357' },
    { id: 'demo-yeni', name: 'Deniz Aydın', storeId: 'moda-cadde', role: 'barista', pin: null }
  ],
  /** Telefonu bağlamak için sabit eşleştirme kodu (Moda Cadde). */
  pairingCode: '140114',
  /** Deniz (pin:null) için sabit davet kodu. */
  inviteCode: '246810'
};

function flatten() {
  const tracks = [], modules = [], lessons = [], questions = [];
  CURRICULUM.forEach((tr, ti) => {
    tracks.push({ id: tr.id, title: tr.title, description: tr.description, icon: tr.icon, order: ti + 1, published: true });
    tr.modules.forEach((m, mi) => {
      modules.push({
        id: m.id, trackId: tr.id, title: m.title, description: m.description, order: mi + 1,
        passScore: m.passScore, examSize: Math.min(m.examSize, m.questions.length),
        prerequisiteId: m.prerequisiteId || null, published: true, questionCount: m.questions.length
      });
      m.lessons.forEach((l, li) => lessons.push({
        id: l.id, moduleId: m.id, title: l.title, order: li + 1, durationMin: l.durationMin, blocks: l.blocks, published: true
      }));
      m.questions.forEach((q, qi) => {
        if (q.answer < 0) throw new Error(`Cevap bulunamadı: ${m.id} #${qi} ${q.prompt}`);
        questions.push({ id: `${m.id}-q${String(qi + 1).padStart(3, '0')}`, moduleId: m.id, imageUrl: '', ...q });
      });
    });
  });
  return { tracks, modules, lessons, questions };
}

const data = flatten();

if (DRY) {
  for (const m of data.modules) {
    const qs = data.questions.filter((q) => q.moduleId === m.id);
    console.log(`${m.trackId} › ${m.title}: ${data.lessons.filter((l) => l.moduleId === m.id).length} ders, ${qs.length} soru`);
  }
  const sample = data.questions.filter((q) => q.moduleId === 'soguk-kahveler').slice(0, 4);
  console.log(JSON.stringify(sample, null, 1));
  console.log(JSON.stringify(data.lessons.find((l) => l.moduleId === 'soguk-kahveler'), null, 1));
  process.exit(0);
}

const EMULATOR = args.has('--emulator');
const CONTENT_ONLY = args.has('--content-only');
if (EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
} else if (!args.has('--production')) {
  console.error('Hedef belirt: --emulator ya da --production --content-only');
  process.exit(1);
}
if (!EMULATOR && !CONTENT_ONLY) {
  console.error('Gerçek projeye test hesapları yüklenmez. --content-only ekle.');
  process.exit(1);
}

function argVal(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let writeAll, auth, db;

if (EMULATOR) {
  // Emülatörde kimlik sorunu yok (FIRESTORE_EMULATOR_HOST env'i Admin SDK'yı
  // otomatik yetkisiz/özel moda alır) — bu yüzden burada klasik Admin SDK kullanılır.
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  initializeApp({ projectId: 'demo-playbook' });
  db = getFirestore();
  auth = getAuth();
  writeAll = async (col, items) => {
    for (let i = 0; i < items.length; i += 400) {
      const batch = db.batch();
      items.slice(i, i + 400).forEach(({ id, ...rest }) => batch.set(db.doc(`${col}/${id}`), rest));
      await batch.commit();
    }
    console.log(`  ${col}: ${items.length}`);
  };
} else {
  // Gerçek projede servis hesabı anahtarı aramak yerine, zaten var olan bir
  // yönetici hesabının e-posta/şifresiyle REST API üzerinden yazılır —
  // firestore.rules zaten bu hesabın "admin" rolünü doğrular.
  const email = argVal('--email');
  const password = argVal('--password');
  const apiKey = process.env.VITE_FB_API_KEY;
  const projectId = process.env.VITE_FB_PROJECT_ID;
  if (!email || !password) {
    console.error('Gerçek projede --email <yönetici e-postası> --password <şifre> gerekli.');
    process.exit(1);
  }
  if (!apiKey || !projectId) {
    console.error('.env.production okunamadı — VITE_FB_API_KEY / VITE_FB_PROJECT_ID eksik.');
    process.exit(1);
  }
  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  }).then((r) => r.json());
  if (!signIn.idToken) throw new Error('Giriş başarısız: ' + JSON.stringify(signIn.error || signIn));
  const idToken = signIn.idToken;

  const toValue = (v) => {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, vv]) => [k, toValue(vv)])) } };
  };

  writeAll = async (col, items) => {
    for (let i = 0; i < items.length; i += 400) {
      const chunk = items.slice(i, i + 400);
      const writes = chunk.map(({ id, ...rest }) => ({
        update: {
          name: `projects/${projectId}/databases/(default)/documents/${col}/${id}`,
          fields: Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, toValue(v)]))
        }
      }));
      const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes })
      });
      if (!res.ok) throw new Error(`${col} yazılamadı: ${res.status} ${await res.text()}`);
    }
    console.log(`  ${col}: ${items.length}`);
  };
}

console.log('Müfredat yükleniyor…');
await writeAll('tracks', data.tracks);
await writeAll('modules', data.modules);
await writeAll('lessons', data.lessons);
await writeAll('questions', data.questions);

if (EMULATOR && !CONTENT_ONLY) {
  console.log('Test hesapları…');
  const now = Date.now();
  await writeAll('stores', TEST.stores.map((s) => ({ ...s, active: true, createdAt: now })));

  async function ensureUser(email, password, displayName) {
    try { return await auth.getUserByEmail(email); }
    catch { return auth.createUser({ email, password, displayName }); }
  }

  // --- Yönetici -------------------------------------------------------
  const staff = await ensureUser(TEST.staff.email, TEST.staff.password, TEST.staff.name);
  await db.doc(`users/${staff.uid}`).set({ role: 'admin', name: TEST.staff.name, email: TEST.staff.email, active: true, createdAt: now });
  await db.doc('config/bootstrap').set({ uid: staff.uid, at: now });

  // --- Baristalar: her birinin kendi Auth hesabı var -------------------
  const lessonIds = (mid) => data.lessons.filter((l) => l.moduleId === mid).map((l) => l.id);
  const progressFor = {
    'demo-ayse': { lessons: [...lessonIds('hos-geldin'), ...lessonIds('siparis-ve-satis'), ...lessonIds('sicak-kahveler').slice(0, 8)], modules: { 'hos-geldin': 90, 'siparis-ve-satis': 83 } },
    'demo-mehmet': { lessons: [...lessonIds('hos-geldin'), ...lessonIds('sicak-kahveler').slice(0, 3)], modules: { 'hos-geldin': 80 } },
    'demo-can': { lessons: lessonIds('hos-geldin').slice(0, 2), modules: {} }
  };

  for (const b of TEST.baristas) {
    const email = `b-${b.id}-1@${ACCOUNT_DOMAIN}`;
    const password = b.pin ? pinPassword(b.id, b.pin) : invitePassword(TEST.inviteCode);
    const account = await ensureUser(email, password, b.name);
    await db.doc(`users/${account.uid}`).set({ role: b.role, baristaId: b.id, storeId: b.storeId, active: true, createdAt: now });
    await db.doc(`baristas/${b.id}`).set({
      name: b.name, storeId: b.storeId, role: b.role, phone: '', active: true,
      uid: account.uid, authEmail: email, accountSeq: 1,
      pinPending: !b.pin, startedAt: '2026-10-01', createdAt: now
    });
    const p = progressFor[b.id] || { lessons: [], modules: {} };
    await db.doc(`progress/${b.id}`).set({
      baristaId: b.id, storeId: b.storeId,
      lessons: Object.fromEntries(p.lessons.map((id, i) => [id, now - (p.lessons.length - i) * 3600000])),
      modules: Object.fromEntries(Object.entries(p.modules).map(([mid, score]) => [mid, { score, passedAt: now - 86400000 * 3 }])),
      updatedAt: now
    });
    if (!b.pin) {
      await db.doc(`invites/${TEST.inviteCode}`).set({ baristaId: b.id, uid: account.uid, email, storeId: b.storeId, expiresAt: now + 30 * 86400000 });
    }
  }

  // --- Mağaza telefonu eşleştirme kodu ---------------------------------
  const deviceEmail = `tel-moda-cadde-1@${ACCOUNT_DOMAIN}`;
  const devicePassword = 'test-cihaz-sifresi';
  const device = await ensureUser(deviceEmail, devicePassword, 'Test telefon');
  await db.doc(`users/${device.uid}`).set({ role: 'store', storeId: 'moda-cadde', active: true, paired: false, label: 'Mağaza telefonu', createdAt: now, lastSeenAt: null });
  await db.doc(`pairingCodes/${TEST.pairingCode}`).set({ uid: device.uid, email: deviceEmail, password: devicePassword, storeId: 'moda-cadde', storeName: 'Moda Cadde', expiresAt: now + 30 * 86400000 });

  // --- Örnek görev -------------------------------------------------------
  await db.doc('assignments/demo-1').set({
    kind: 'module', targetId: 'sicak-kahveler', title: 'Sıcak Kahveler sınavını geç', note: 'Yeni menü öncesi',
    storeId: 'moda-cadde', baristaId: null, dueAt: now + 5 * 86400000, createdAt: now, createdBy: staff.uid, createdByName: TEST.staff.name
  });

  console.log(`
Hazır.
  Yönetici girişi : ${TEST.staff.email} / ${TEST.staff.password}
  Telefon eşleştirme kodu (Moda Cadde): ${TEST.pairingCode}
  Barista PIN'leri: ${TEST.baristas.filter((b) => b.pin).map((b) => `${b.name.split(' ')[0]} ${b.pin}`).join(', ')}
  Yeni barista davet kodu (Deniz): ${TEST.inviteCode}`);
}
process.exit(0);
