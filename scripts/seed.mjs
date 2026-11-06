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
import { CURRICULUM, flattenCurriculum } from './content.mjs';

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
  staff: { email: 'operasyon@1401.test', password: 'Playbook-Test-2026', name: 'Cenk Girginol' },
  stores: [
    { id: 'moda-cadde', name: 'Moda Cadde', city: 'İstanbul' },
    { id: 'cubuklu', name: 'Çubuklu', city: 'İstanbul' },
    { id: 'pendik', name: 'Pendik', city: 'İstanbul' },
    { id: 'bagdat', name: 'Bağdat Caddesi', city: 'İstanbul' }
  ],
  baristas: [
    { id: 'demo-ayse', name: 'Ayşe Demir', storeId: 'moda-cadde', role: 'lead', pin: '2580' },
    { id: 'demo-mehmet', name: 'Mehmet Kaya', storeId: 'moda-cadde', role: 'barista', pin: '1470' },
    { id: 'demo-zeynep', name: 'Zeynep Arslan', storeId: 'moda-cadde', role: 'barista', pin: '3690' },
    { id: 'demo-yeni', name: 'Deniz Aydın', storeId: 'moda-cadde', role: 'barista', pin: null },
    { id: 'demo-can', name: 'Can Yıldız', storeId: 'cubuklu', role: 'lead', pin: '2468' },
    { id: 'demo-burak', name: 'Burak Çetin', storeId: 'cubuklu', role: 'barista', pin: '9512' },
    { id: 'demo-elif', name: 'Elif Şahin', storeId: 'pendik', role: 'lead', pin: '1357' },
    { id: 'demo-sude', name: 'Sude Korkmaz', storeId: 'pendik', role: 'barista', pin: '7531' },
    { id: 'demo-emir', name: 'Emir Polat', storeId: 'bagdat', role: 'lead', pin: '8520' },
    { id: 'demo-nisa', name: 'Nisa Güneş', storeId: 'bagdat', role: 'barista', pin: '4826' }
  ],
  /** Telefonu bağlamak için sabit eşleştirme kodu (Moda Cadde). */
  pairingCode: '140114',
  /** Deniz (pin:null) için sabit davet kodu. */
  inviteCode: '246810'
};

const data = flattenCurriculum(CURRICULUM);

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

let writeAll, deleteStale, auth, db;

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
  deleteStale = async (col, keepIds) => {
    const snap = await db.collection(col).get();
    const stale = snap.docs.filter((d) => !keepIds.has(d.id));
    for (let i = 0; i < stale.length; i += 400) {
      const batch = db.batch();
      stale.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    if (stale.length) console.log(`  ${col}: ${stale.length} eski kayıt silindi`);
  };
} else {
  // Gerçek projede servis hesabı anahtarı aramak yerine, zaten var olan bir
  // yönetici hesabının e-posta/şifresiyle REST API üzerinden yazılır —
  // firestore.rules zaten bu hesabın "admin" rolünü doğrular.
  const email = argVal('--email');
  const password = argVal('--password');
  // Şifreyi hiç paylaşmadan çalıştırmak için: panelde açık oturumun yenileme
  // belirteci bir dosyaya konur, buradan kısa ömürlü bir idToken üretilir.
  const tokenFile = argVal('--refresh-token-file');
  const apiKey = process.env.VITE_FB_API_KEY;
  const projectId = process.env.VITE_FB_PROJECT_ID;
  if (!tokenFile && (!email || !password)) {
    console.error('Gerçek projede --email <yönetici e-postası> --password <şifre>');
    console.error('veya --refresh-token-file <dosya> gerekli.');
    process.exit(1);
  }
  if (!apiKey || !projectId) {
    console.error('.env.production okunamadı — VITE_FB_API_KEY / VITE_FB_PROJECT_ID eksik.');
    process.exit(1);
  }
  let idToken;
  if (tokenFile) {
    const refreshToken = readFileSync(tokenFile, 'utf8').trim();
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    }).then((r) => r.json());
    if (!res.id_token) throw new Error('Oturum belirteci yenilenemedi: ' + JSON.stringify(res.error || res));
    idToken = res.id_token;
    console.log('Açık panel oturumu kullanıldı (şifre kullanılmadı).');
  } else {
    const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }).then((r) => r.json());
    if (!signIn.idToken) throw new Error('Giriş başarısız: ' + JSON.stringify(signIn.error || signIn));
    idToken = signIn.idToken;
  }

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

  /** Müfredatta artık yer almayan belgeleri siler (menü değişince eski reçeteler kalmasın). */
  deleteStale = async (col, keepIds) => {
    const ids = [];
    let pageToken = '';
    do {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${col}`
        + `?pageSize=300&mask.fieldPaths=__name__${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
      if (!res.ok) throw new Error(`${col} listelenemedi: ${res.status} ${await res.text()}`);
      const body = await res.json();
      (body.documents || []).forEach((d) => ids.push(d.name.split('/').pop()));
      pageToken = body.nextPageToken || '';
    } while (pageToken);

    const stale = ids.filter((id) => !keepIds.has(id));
    for (let i = 0; i < stale.length; i += 400) {
      const writes = stale.slice(i, i + 400).map((id) => ({
        delete: `projects/${projectId}/databases/(default)/documents/${col}/${id}`
      }));
      const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes })
      });
      if (!res.ok) throw new Error(`${col} silinemedi: ${res.status} ${await res.text()}`);
    }
    if (stale.length) console.log(`  ${col}: ${stale.length} eski kayıt silindi`);
  };
}

console.log('Müfredat yükleniyor…');
await writeAll('tracks', data.tracks);
await writeAll('modules', data.modules);
await writeAll('lessons', data.lessons);
await writeAll('questions', data.questions);

// Menü/müfredat değiştiğinde eskisinden kalan belgeleri temizle.
console.log('Eski içerik temizleniyor…');
for (const [col, items] of [['tracks', data.tracks], ['modules', data.modules], ['lessons', data.lessons], ['questions', data.questions]]) {
  await deleteStale(col, new Set(items.map((i) => i.id)));
}

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
    'demo-ayse': { lessons: [...lessonIds('hos-geldin'), ...lessonIds('misafir-karsilama'), ...lessonIds('siparis-ve-satis'), ...lessonIds('italyan-klasikler'), ...lessonIds('sicak-kahveler').slice(0, 12)], modules: { 'hos-geldin': 90, 'misafir-karsilama': 90, 'siparis-ve-satis': 83, 'italyan-klasikler': 88 } },
    'demo-mehmet': { lessons: [...lessonIds('hos-geldin'), ...lessonIds('misafir-karsilama'), ...lessonIds('italyan-klasikler'), ...lessonIds('sicak-kahveler').slice(0, 5)], modules: { 'hos-geldin': 80, 'misafir-karsilama': 80, 'italyan-klasikler': 90 } },
    'demo-zeynep': { lessons: [...lessonIds('hos-geldin'), ...lessonIds('misafir-karsilama').slice(0, 2)], modules: { 'hos-geldin': 100 } },
    'demo-can': { lessons: [...lessonIds('hos-geldin'), ...lessonIds('misafir-karsilama'), ...lessonIds('siparis-ve-satis'), ...lessonIds('italyan-klasikler'), ...lessonIds('sicak-kahveler'), ...lessonIds('demleme-turk').slice(0, 4)], modules: { 'hos-geldin': 100, 'misafir-karsilama': 90, 'siparis-ve-satis': 92, 'italyan-klasikler': 100, 'sicak-kahveler': 86 } },
    'demo-burak': { lessons: [...lessonIds('hos-geldin'), ...lessonIds('italyan-klasikler').slice(0, 2)], modules: { 'hos-geldin': 80 } },
    'demo-elif': { lessons: [...lessonIds('hos-geldin'), ...lessonIds('misafir-karsilama'), ...lessonIds('italyan-klasikler')], modules: { 'hos-geldin': 90, 'misafir-karsilama': 80, 'italyan-klasikler': 88 } },
    'demo-sude': { lessons: lessonIds('hos-geldin').slice(0, 3), modules: {} },
    'demo-emir': { lessons: [...lessonIds('hos-geldin'), ...lessonIds('misafir-karsilama'), ...lessonIds('siparis-ve-satis'), ...lessonIds('italyan-klasikler'), ...lessonIds('sicak-kahveler').slice(0, 8)], modules: { 'hos-geldin': 100, 'misafir-karsilama': 100, 'siparis-ve-satis': 83, 'italyan-klasikler': 100 } },
    'demo-nisa': { lessons: [...lessonIds('hos-geldin'), ...lessonIds('misafir-karsilama').slice(0, 3)], modules: { 'hos-geldin': 80 } }
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

  // --- Sınav geçmişi -----------------------------------------------------
  // Panelin raporları (haftalık sınav sayısı, en çok yanlış yapılan sorular)
  // ancak geçmiş denemelerle anlam kazanır; demoda son 30 gün doldurulur.
  const nameOf = Object.fromEntries(TEST.baristas.map((b) => [b.id, b.name]));
  const storeOf = Object.fromEntries(TEST.baristas.map((b) => [b.id, b.storeId]));
  const moduleTitle = Object.fromEntries(data.modules.map((m) => [m.id, m.title]));
  const qOf = (mid) => data.questions.filter((q) => q.moduleId === mid);

  /** Belirli soruları yanlış yapılmış gibi kaydeder — rapor gerçekçi olsun. */
  const mistakeItems = (mid, indexes) => qOf(mid).filter((_, i) => indexes.includes(i)).map((q) => ({
    questionId: q.id, prompt: q.prompt, options: q.options,
    given: (q.answer + 1) % q.options.length, answer: q.answer, explanation: q.explanation || ''
  }));

  const attempts = [
    ['demo-ayse', 'hos-geldin', 1, 90, true, [3]],
    ['demo-ayse', 'misafir-karsilama', 3, 90, true, [6]],
    ['demo-ayse', 'siparis-ve-satis', 6, 83, true, [2, 9]],
    ['demo-ayse', 'italyan-klasikler', 12, 88, true, [1]],
    ['demo-mehmet', 'hos-geldin', 2, 80, true, [3, 7]],
    ['demo-mehmet', 'italyan-klasikler', 4, 90, true, [1]],
    ['demo-mehmet', 'siparis-ve-satis', 9, 58, false, [2, 4, 9, 11, 14]],
    ['demo-zeynep', 'hos-geldin', 5, 100, true, []],
    ['demo-zeynep', 'misafir-karsilama', 1, 60, false, [0, 6, 7, 9]],
    ['demo-can', 'sicak-kahveler', 2, 86, true, [5, 18]],
    ['demo-can', 'italyan-klasikler', 8, 100, true, []],
    ['demo-can', 'siparis-ve-satis', 14, 92, true, [2]],
    ['demo-burak', 'hos-geldin', 6, 80, true, [3, 7]],
    ['demo-burak', 'italyan-klasikler', 2, 62, false, [1, 3, 5]],
    ['demo-elif', 'misafir-karsilama', 4, 80, true, [6, 9]],
    ['demo-elif', 'italyan-klasikler', 11, 88, true, [1]],
    ['demo-sude', 'hos-geldin', 3, 70, false, [1, 3, 7]],
    ['demo-emir', 'misafir-karsilama', 1, 100, true, []],
    ['demo-emir', 'siparis-ve-satis', 5, 83, true, [2, 9]],
    ['demo-emir', 'italyan-klasikler', 16, 100, true, []],
    ['demo-nisa', 'hos-geldin', 7, 80, true, [3]],
    ['demo-nisa', 'misafir-karsilama', 2, 50, false, [0, 6, 7, 9, 10]]
  ];
  for (const [bid, mid, daysAgo, score, passed, wrong] of attempts) {
    const mod = data.modules.find((m) => m.id === mid);
    const total = mod ? mod.examSize : 10;
    const at = now - daysAgo * 86400000;
    await db.collection('attempts').add({
      baristaId: bid, baristaName: nameOf[bid], storeId: storeOf[bid],
      moduleId: mid, moduleTitle: moduleTitle[mid] || mid,
      startedAt: at, submittedAt: at + 7 * 60000,
      total, correct: Math.round((score / 100) * total), score, passed,
      mistakes: mistakeItems(mid, wrong)
    });
  }

  // --- Görevler ----------------------------------------------------------
  const assignments = [
    ['demo-1', 'module', 'sicak-kahveler', 'Sıcak Kahveler sınavını geç', '2026 menüsü yayında — herkes bu hafta tamamlasın.', 'moda-cadde', null, 5],
    ['demo-2', 'module', 'misafir-karsilama', 'Karşılama ve 1401 İmzası', 'Yeni modül; hafta sonu yoğunluğu öncesi bitsin.', 'cubuklu', null, 3],
    ['demo-3', 'lesson', 'ozel-urun-saklama', 'Özel ürünlerin saklama standartları', 'Son denetimde soğuk zincir bulgusu çıktı.', 'pendik', 'demo-sude', -2],
    ['demo-4', 'module', 'urun-kabul-depo', 'Ürün Kabul, Depo ve Teşhir', '', 'bagdat', null, 9],
    ['demo-5', 'lesson', 'rol-oyunlari', 'Rol oyunu: üç zor senaryo', 'Vardiya başında ekipçe canlandırın.', 'moda-cadde', 'demo-zeynep', -1]
  ];
  for (const [id, kind, targetId, title, note, storeId, baristaId, days] of assignments) {
    await db.doc(`assignments/${id}`).set({
      kind, targetId, title, note, storeId, baristaId,
      dueAt: now + days * 86400000, createdAt: now - 86400000 * 4,
      createdBy: staff.uid, createdByName: TEST.staff.name
    });
  }

  console.log(`
Hazır.
  Yönetici girişi : ${TEST.staff.email} / ${TEST.staff.password}
  Telefon eşleştirme kodu (Moda Cadde): ${TEST.pairingCode}
  Barista PIN'leri: ${TEST.baristas.filter((b) => b.pin).map((b) => `${b.name.split(' ')[0]} ${b.pin}`).join(', ')}
  Yeni barista davet kodu (Deniz): ${TEST.inviteCode}`);
}
process.exit(0);
