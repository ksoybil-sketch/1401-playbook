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

// Ortam dosyasını elle yükle (ekstra bağımlılık eklememek için).
const envFile = process.argv.includes('--demo') ? '.env.demo' : '.env.production';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
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
  /** Uygulama geliştiricisi — her şeyi görür, kurallardan muaf (bkz. src/lib/roles.ts). */
  staff: { email: 'k.soybil@1401coffee.com', password: '192535', name: 'Kutay Soybil', role: 'developer' },
  /** Yetki sıralamasına göre diğer Kahve Operasyonu hesapları. */
  staffExtra: [
    { email: 'cenkgirginol@1401coffee.com', password: '192535', name: 'Cenk Girginol', role: 'director' },
    { email: 'ugurcangurbuz@1401coffee.com', password: '351925', name: 'Uğur Can Gürbüz', role: 'regional' }
  ],
  stores: [
    { id: 'moda-cadde', name: 'Moda Cadde', city: 'İstanbul' },
    { id: 'cubuklu', name: 'Çubuklu', city: 'İstanbul' },
    { id: 'pendik', name: 'Pendik', city: 'İstanbul' },
    { id: 'bagdat', name: 'Bağdat Caddesi', city: 'İstanbul' }
  ],
  baristas: [
    { id: 'demo-ayse', name: 'Ayşe Demir', storeId: 'moda-cadde', role: 'lead', pin: '1925' },
    { id: 'demo-mehmet', name: 'Mehmet Kaya', storeId: 'moda-cadde', role: 'barista', pin: '1925' },
    { id: 'demo-zeynep', name: 'Zeynep Arslan', storeId: 'moda-cadde', role: 'shift', pin: '1925' },
    { id: 'demo-yeni', name: 'Deniz Aydın', storeId: 'moda-cadde', role: 'barista', pin: null },
    { id: 'demo-can', name: 'Can Yıldız', storeId: 'cubuklu', role: 'lead', pin: '1925' },
    { id: 'demo-burak', name: 'Burak Çetin', storeId: 'cubuklu', role: 'barista', pin: '1925' },
    { id: 'demo-elif', name: 'Elif Şahin', storeId: 'pendik', role: 'lead', pin: '1925' },
    { id: 'demo-sude', name: 'Sude Korkmaz', storeId: 'pendik', role: 'barista', pin: '1925' },
    { id: 'demo-emir', name: 'Emir Polat', storeId: 'bagdat', role: 'lead', pin: '1925' },
    { id: 'demo-nisa', name: 'Nisa Güneş', storeId: 'bagdat', role: 'barista', pin: '1925' }
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
/**
 * Demo modu: gerçek ama ayrı bir Firebase projesine (playbook-demo-1401)
 * örnek şube ağını da yazar. Canlı projede test hesabı açmak hâlâ yasak;
 * demo projesinde serbest, çünkü içindeki her şey örnektir.
 */
const DEMO = args.has('--demo');
if (EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
} else if (!args.has('--production') && !DEMO) {
  console.error('Hedef belirt: --emulator, --demo ya da --production --content-only');
  process.exit(1);
}
if (!EMULATOR && !DEMO && !CONTENT_ONLY) {
  console.error('Gerçek projeye test hesapları yüklenmez. --content-only ekle.');
  process.exit(1);
}
if (DEMO && process.env.VITE_FB_PROJECT_ID !== 'playbook-demo-1401') {
  // Demo verisi yanlışlıkla canlı projeye yazılmasın.
  console.error(`Demo modu yalnızca playbook-demo-1401 projesinde çalışır (şu an: ${process.env.VITE_FB_PROJECT_ID}).`);
  console.error('Doğru kullanım: npm run seed:demo');
  process.exit(1);
}

function argVal(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let writeAll, deleteStale, setDoc, addDoc, delDoc, ensureUser, signInAs, readQuestionFlags;

if (EMULATOR) {
  // Emülatörde kimlik sorunu yok (FIRESTORE_EMULATOR_HOST env'i Admin SDK'yı
  // otomatik yetkisiz/özel moda alır) — bu yüzden burada klasik Admin SDK kullanılır.
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  initializeApp({ projectId: 'demo-playbook' });
  const db = getFirestore();
  const auth = getAuth();
  setDoc = (path, value) => db.doc(path).set(value);
  addDoc = (col, value) => db.collection(col).add(value);
  delDoc = (path) => db.doc(path).delete();
  signInAs = async () => undefined;
  ensureUser = async (email, password, displayName) => {
    try { return await auth.getUserByEmail(email); }
    catch { return auth.createUser({ email, password, displayName }); }
  };
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
    // Panelde oluşturulan içerik (Yeni ürün akışı) müfredatta yok; silinmez.
    const stale = snap.docs.filter((d) => !keepIds.has(d.id) && d.get('kaynak') !== 'panel');
    for (let i = 0; i < stale.length; i += 400) {
      const batch = db.batch();
      stale.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    if (stale.length) console.log(`  ${col}: ${stale.length} eski kayıt silindi`);
  };
  readQuestionFlags = async () => {
    const snap = await db.collection('questions').get();
    return new Map(snap.docs.filter((d) => d.get('edited') || d.get('disabled')).map((d) => [d.id, d.data()]));
  };
} else {
  // Gerçek projede servis hesabı anahtarı aramak yerine, zaten var olan bir
  // yönetici hesabının e-posta/şifresiyle REST API üzerinden yazılır —
  // firestore.rules zaten bu hesabın "admin" rolünü doğrular.
  const email = argVal('--email') || (DEMO ? TEST.staff.email : undefined);
  const password = argVal('--password') || (DEMO ? TEST.staff.password : undefined);
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
  let idToken, adminUid;
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
    if (!signIn.idToken && DEMO) {
      // Demo projesi boşken yönetici hesabı henüz yok: kendini kaydeder.
      // firestore.rules ilk yöneticinin kendi users/{uid} belgesini yalnızca
      // config/bootstrap yokken yazmasına izin verir.
      const up = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      }).then((r) => r.json());
      if (!up.idToken) throw new Error('Demo yöneticisi açılamadı: ' + JSON.stringify(up.error || up));
      idToken = up.idToken;
      adminUid = up.localId;
      console.log('Demo yöneticisi oluşturuldu.');
    } else {
      if (!signIn.idToken) throw new Error('Giriş başarısız: ' + JSON.stringify(signIn.error || signIn));
      idToken = signIn.idToken;
      adminUid = signIn.localId;
    }
  }

  /** Bir hesabı açar; zaten varsa girer. Demo verisini kurmak için yeterli. */
  ensureUser = async (mail, pass, displayName) => {
    const body = JSON.stringify({ email: mail, password: pass, returnSecureToken: true });
    const head = { 'Content-Type': 'application/json' };
    let r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, { method: 'POST', headers: head, body }).then((x) => x.json());
    if (!r.localId) {
      r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, { method: 'POST', headers: head, body }).then((x) => x.json());
    }
    if (!r.localId) throw new Error(`Hesap açılamadı (${mail}): ` + JSON.stringify(r.error || r));
    if (displayName && r.idToken) {
      await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`, {
        method: 'POST', headers: head,
        body: JSON.stringify({ idToken: r.idToken, displayName, returnSecureToken: false })
      });
    }
    return { uid: r.localId };
  };

  const toValue = (v) => {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, vv]) => [k, toValue(vv)])) } };
  };

  const docName = (path) => `projects/${projectId}/databases/(default)/documents/${path}`;
  const commit = async (writes, what, asToken) => {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${asToken || idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes })
    });
    if (!res.ok) throw new Error(`${what} yazılamadı: ${res.status} ${await res.text()}`);
  };
  const fieldsOf = (value) => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toValue(v)]));
  setDoc = (path, value) => commit([{ update: { name: docName(path), fields: fieldsOf(value) } }], path);
  delDoc = (path) => commit([{ delete: docName(path) }], path);
  addDoc = (col, value, asToken) => {
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    return commit([{ update: { name: docName(`${col}/${id}`), fields: fieldsOf(value) } }], col, asToken);
  };

  /**
   * Başka bir hesap adına belirteç alır. Sınav denemesini yalnızca baristanın
   * kendisi yazabilir (firestore.rules) — demo geçmişini kurmak için kuralları
   * gevşetmek yerine her baristanın kendi oturumu kullanılır.
   */
  const tokenCache = new Map();
  signInAs = async (mail, pass) => {
    if (tokenCache.has(mail)) return tokenCache.get(mail);
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mail, password: pass, returnSecureToken: true })
    }).then((x) => x.json());
    if (!r.idToken) throw new Error(`Oturum açılamadı (${mail}): ` + JSON.stringify(r.error || r));
    tokenCache.set(mail, r.idToken);
    return r.idToken;
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
        + `?pageSize=300&mask.fieldPaths=kaynak${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
      if (!res.ok) throw new Error(`${col} listelenemedi: ${res.status} ${await res.text()}`);
      const body = await res.json();
      // Panelde oluşturulan içerik (Yeni ürün akışı) müfredatta yok; silinmez.
      (body.documents || []).forEach((d) => { if (d.fields?.kaynak?.stringValue !== 'panel') ids.push(d.name.split('/').pop()); });
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

  /** Soru havuzunda düzeltilen (edited) ya da iptal edilen (disabled) sorular. */
  readQuestionFlags = async () => {
    const out = new Map();
    let pageToken = '';
    do {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/questions?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const body = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } }).then((x) => x.json());
      for (const d of body.documents || []) {
        const f = d.fields || {};
        if (f.edited?.booleanValue || f.disabled?.booleanValue) {
          out.set(d.name.split('/').pop(), Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.stringValue ?? v.booleanValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue ?? (v.arrayValue ? (v.arrayValue.values || []).map((x) => x.stringValue) : null))])));
        }
      }
      pageToken = body.nextPageToken || '';
    } while (pageToken);
    return out;
  };

  if (DEMO && adminUid) {
    // Müfredat yazmak "admin" rolü ister; rol belgesi her şeyden önce yazılır.
    // İlk çalıştırmada kurallar bunu yalnızca config/bootstrap yokken kabul
    // eder, sonraki çalıştırmalarda hesap zaten admin olduğu için geçer.
    await setDoc(`users/${adminUid}`, {
      role: 'admin', name: TEST.staff.name, email: TEST.staff.email, active: true, createdAt: Date.now()
    });
    await setDoc('config/bootstrap', { uid: adminUid, at: Date.now() }).catch(() => {});
    console.log('Demo yöneticisi yetkilendirildi.');
  }
}

// Demo kaydını açar (src/demo/log.ts): firestore.rules demoLog'a yalnızca bu
// belge varken yazdırır. Canlı projede hiç yazılmaz.
if (DEMO || EMULATOR) await setDoc('config/demo', { enabled: true, at: Date.now() });

console.log('Müfredat yükleniyor…');
await writeAll('tracks', data.tracks);
await writeAll('modules', data.modules);
await writeAll('lessons', data.lessons);
// Soru havuzunda düzeltilen soru ezilmez; iptal edilen sorunun iptali korunur.
const flags = await readQuestionFlags();
await writeAll('questions', data.questions
  .filter((q) => !flags.get(q.id)?.edited)
  .map((q) => {
    const f = flags.get(q.id);
    return f?.disabled ? { ...q, disabled: true, disabledReason: f.disabledReason || '', disabledByName: f.disabledByName || '', disabledAt: f.disabledAt || 0 } : q;
  }));
if (flags.size) console.log(`  questions: ${[...flags.values()].filter((f) => f.edited).length} düzeltilmiş soru korundu, ${[...flags.values()].filter((f) => f.disabled).length} iptal korundu`);

// Menü/müfredat değiştiğinde eskisinden kalan belgeleri temizle.
console.log('Eski içerik temizleniyor…');
for (const [col, items] of [['tracks', data.tracks], ['modules', data.modules], ['lessons', data.lessons], ['questions', data.questions]]) {
  await deleteStale(col, new Set(items.map((i) => i.id)));
}

if ((EMULATOR || DEMO) && !CONTENT_ONLY) {
  // Demo yeniden kurulduğunda eski sınav denemeleri birikmesin: bu sayede
  // "npm run seed:demo" tam bir sıfırlama olur, ekip ne yaparsa yapsın.
  if (DEMO) {
    console.log('Önceki demo sınavları siliniyor…');
    await deleteStale('attempts', new Set());
    await deleteStale('requests', new Set());
    await deleteStale('proposals', new Set());
  }
  console.log('Test hesapları…');
  const now = Date.now();
  await writeAll('stores', TEST.stores.map((s) => ({ ...s, active: true, createdAt: now })));

  // --- Yöneticiler -----------------------------------------------------
  const staff = await ensureUser(TEST.staff.email, TEST.staff.password, TEST.staff.name);
  // Önce 'admin' (ilk kurulum kuralı bunu bekler), ardından asıl rolü.
  await setDoc(`users/${staff.uid}`, { role: 'admin', name: TEST.staff.name, email: TEST.staff.email, active: true, createdAt: now });
  await setDoc(`users/${staff.uid}`, { role: TEST.staff.role, name: TEST.staff.name, email: TEST.staff.email, active: true, createdAt: now });
  // Kurallar config/bootstrap'ın üzerine yazılmasına izin vermez; demo
  // yeniden kurulduğunda belge zaten yerindedir, hata yutulur.
  await setDoc('config/bootstrap', { uid: staff.uid, at: now }).catch(() => {});

  // Her yöneticinin kendi hesabı ve gerçek rolü var: Cenk Bey yayınlar ve
  // onaylar, Uğur Bey'in içerik/bülten değişiklikleri onaya düşer.
  const staffUid = {};
  for (const extra of TEST.staffExtra || []) {
    const acc = await ensureUser(extra.email, extra.password, extra.name);
    await setDoc(`users/${acc.uid}`, { role: extra.role, name: extra.name, email: extra.email, active: true, createdAt: now });
    staffUid[extra.role] = { uid: acc.uid, name: extra.name };
    console.log(`  yönetici: ${extra.email} (${extra.role})`);
  }

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

  const baristaUid = {};
  for (const b of TEST.baristas) {
    const email = `b-${b.id}-1@${ACCOUNT_DOMAIN}`;
    const password = b.pin ? pinPassword(b.id, b.pin) : invitePassword(TEST.inviteCode);
    const account = await ensureUser(email, password, b.name);
    baristaUid[b.id] = account.uid;
    await setDoc(`users/${account.uid}`, { role: b.role, baristaId: b.id, storeId: b.storeId, active: true, createdAt: now });
    await setDoc(`baristas/${b.id}`, {
      name: b.name, storeId: b.storeId, role: b.role, phone: '', active: true,
      uid: account.uid, authEmail: email, accountSeq: 1,
      pinPending: !b.pin, startedAt: '2026-10-01', createdAt: now,
      ...(b.pin ? {} : { inviteExpiresAt: now + 30 * 86400000, codeIssuedByName: 'Uğur Can Gürbüz' })
    });
    const p = progressFor[b.id] || { lessons: [], modules: {} };
    await setDoc(`progress/${b.id}`, {
      baristaId: b.id, storeId: b.storeId,
      lessons: Object.fromEntries(p.lessons.map((id, i) => [id, now - (p.lessons.length - i) * 3600000])),
      modules: Object.fromEntries(Object.entries(p.modules).map(([mid, score]) => [mid, { score, passedAt: now - 86400000 * 3 }])),
      updatedAt: now
    });
    if (!b.pin) {
      await delDoc(`invites/${TEST.inviteCode}`).catch(() => {});
      await setDoc(`invites/${TEST.inviteCode}`, { baristaId: b.id, uid: account.uid, email, storeId: b.storeId, expiresAt: now + 30 * 86400000 });
    }
  }

  // --- Mağaza telefonu eşleştirme kodu ---------------------------------
  const deviceEmail = `tel-moda-cadde-1@${ACCOUNT_DOMAIN}`;
  const devicePassword = 'test-cihaz-sifresi';
  const device = await ensureUser(deviceEmail, devicePassword, 'Test telefon');
  await setDoc(`users/${device.uid}`, { role: 'store', storeId: 'moda-cadde', active: true, paired: false, label: 'Mağaza telefonu', createdAt: now, lastSeenAt: null });
  await delDoc(`pairingCodes/${TEST.pairingCode}`).catch(() => {});
  await setDoc(`pairingCodes/${TEST.pairingCode}`, { uid: device.uid, email: deviceEmail, password: devicePassword, storeId: 'moda-cadde', storeName: 'Moda Cadde', expiresAt: now + 30 * 86400000 });

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
    // Geçmiş (teslim edilmiş) denemeyi barista hesabı açamaz — kurallar
    // açık deneme ister. Örnek geçmiş, geliştirici hesabıyla yazılır.
    await addDoc('attempts', {
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
    await setDoc(`assignments/${id}`, {
      kind, targetId, title, note, storeId, baristaId,
      dueAt: now + days * 86400000, createdAt: now - 86400000 * 4,
      createdBy: staff.uid, createdByName: TEST.staff.name
    });
  }

  // --- Mağaza talepleri ----------------------------------------------------
  const regional = staffUid.regional || { uid: staff.uid, name: TEST.staff.name };
  const director = staffUid.director || { uid: staff.uid, name: TEST.staff.name };
  const H = 3600000;
  const requests = [
    ['req-1', 'moda-cadde', 'Moda Cadde', 'demo-ayse', 'ariza', 'urgent', 'Espresso makinesi', '2. grup su kaçırıyor', 'Sabah açılışta fark ettik, shot süresi 18 saniyeye düştü. Grubu kapattık, tek grupla çalışıyoruz.', 'in_progress', 30,
      [['store', 'demo-ayse', 'Fotoğrafı da ekledim, conta gibi görünüyor.', null, 29], ['ops', 'regional', 'Yetkili servis yarın 10:00\'da geliyor. O zamana kadar 2. grubu kullanmayın.', 'in_progress', 26]]],
    ['req-2', 'cubuklu', 'Çubuklu', 'demo-can', 'servis', 'normal', '', 'Değirmen bıçak değişimi (6 ay doldu)', 'Periyodik bakım zamanı geldi; öğütme tutarlılığı düştü.', 'approval', 50,
      [['ops', 'regional', 'Servis teklifi alındı, Cenk Bey\'in onayına gönderdim.', 'approval', 20]]],
    ['req-3', 'pendik', 'Pendik', 'demo-elif', 'malzeme', 'normal', '', 'Matcha ve ube tozu bitmek üzere', 'Hafta sonuna yetmeyecek; ekstra sevkiyat rica ediyoruz.', 'open', 3, []],
    ['req-4', 'bagdat', 'Bağdat Caddesi', 'demo-emir', 'personel', 'normal', '', 'Yeni barista için davet kodu', 'Pazartesi başlayacak bir arkadaşımız var: Ece Yalçın.', 'done', 120,
      [['ops', 'regional', 'Ece Yalçın eklendi, kodu WhatsApp\'tan ilettim.', 'done', 100]]]
  ];
  for (const [id, storeId, storeName, by, category, priority, equipment, title, detail, status, hoursAgo, notes] of requests) {
    const who = TEST.baristas.find((b) => b.id === by);
    const noteDocs = notes.map(([side, w, text, st, h]) => {
      const p = side === 'store' ? { uid: baristaUid[w], name: TEST.baristas.find((b) => b.id === w).name } : (w === 'regional' ? regional : director);
      return { at: now - h * H, by: p.uid, byName: p.name, side, text, ...(st ? { status: st } : {}) };
    });
    const last = noteDocs[noteDocs.length - 1];
    await setDoc(`requests/${id}`, {
      storeId, storeName, category, priority, title, detail, ...(equipment ? { equipment } : {}),
      status, notes: noteDocs, createdAt: now - hoursAgo * H, createdBy: baristaUid[by], createdByName: who.name,
      updatedAt: last ? last.at : now - hoursAgo * H, lastSide: last ? last.side : 'store',
      closedAt: status === 'done' ? last.at : null
    });
  }

  // --- Onay bekleyen öneri (Bölge Müdürü → Kahve Operasyon Direktörü) ---------
  await setDoc('proposals/demo-oneri-1', {
    kind: 'bulletin', title: 'Kasım terfileri', summary: 'Yeni bülten · Liderlik',
    ops: [{ op: 'set', col: 'bulletins', id: 'demo-terfi-kasim', data: {
      kind: 'liderlik', board: 'terfi', title: 'Kasım terfileri',
      body: 'Emekleri için teşekkür ediyoruz. **Tebrikler!**', storeIds: null, rows: [],
      people: [
        { baristaId: 'demo-zeynep', name: 'Zeynep Arslan', storeName: 'Moda Cadde', note: 'Vardiya müdürlüğüne terfi etti' },
        { baristaId: 'demo-emir', name: 'Emir Polat', storeName: 'Bağdat Caddesi', note: 'Ayın mağaza müdürü — %100 sınav ortalaması' }
      ],
      expiresAt: null, published: true, pinned: false,
      createdAt: now - 2 * H, createdBy: regional.uid, createdByName: regional.name
    } }],
    status: 'pending', createdAt: now - 2 * H, createdBy: regional.uid, createdByName: regional.name
  });

  // Bölge müdürünün atadığı görev — Kahve Operasyon Direktörü "Atayan" süzgecinde görür.
  await setDoc('assignments/demo-6', {
    kind: 'module', targetId: 'demleme-turk', title: 'Demleme ve Türk Kahveleri', note: 'Yeni V60 standardı — hafta sonuna kadar.',
    storeId: 'cubuklu', baristaId: null, dueAt: now + 4 * 86400000, createdAt: now - 86400000,
    createdBy: regional.uid, createdByName: regional.name
  });

  console.log(`
Hazır.
  Yönetici girişi : ${TEST.staff.email} / ${TEST.staff.password}
  Telefon eşleştirme kodu (Moda Cadde): ${TEST.pairingCode}
  Barista PIN'leri: ${TEST.baristas.filter((b) => b.pin).map((b) => `${b.name.split(' ')[0]} ${b.pin}`).join(', ')}
  Yeni barista davet kodu (Deniz): ${TEST.inviteCode}`);
}
process.exit(0);
