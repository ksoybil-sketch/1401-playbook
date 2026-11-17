/**
 * Canlı kullanım raporu: 1401 Campus gerçekten kullanılıyor mu, kim
 * kullanıyor, nerede takılıyor, neyi sadeleştirebiliriz?
 *
 *   npm run kullanim                     canlı, son 7 gün (e-posta ve şifre sorar)
 *   npm run kullanim -- --gun 1          son 1 gün
 *   npm run kullanim -- --gun 30         son 30 gün
 *   npm run kullanim -- --demo           demo projesi (şifre sormaz)
 *   node scripts/kullanim.mjs --emulator yerel emülatör
 *
 * Giriş istemeyen iki ek kip (yerel dosyaları okur, veritabanına bakmaz):
 *   npm run kullanim -- --trend                       eski raporlardan gidişat
 *   npm run kullanim -- --yedek-farki <eski> <yeni>   iki yedek arasındaki değişim
 *
 * `npm run durum` ile karıştırma: o, hangi kodun nerede yayında olduğunu
 * söyler. Bu komut veritabanındaki kullanım izlerini okur.
 *
 * Rapor kullanim-raporlari/<tarih>-<ortam>.md dosyasına yazılır (git'e girmez).
 * Hiçbir şeye yazmaz. Okumak için uygulama geliştiricisi hesabıyla girilir;
 * canlıda şifre hiçbir dosyada tutulmaz, komut sorar (ekranda görünmez).
 *
 * Uygulama geliştiricisi hiçbir sayıma girmez (users.role == 'developer').
 *
 * Elimizdeki veri: docs/KULLANIM-VERISI.md · Öneriler: docs/KULLANIM-ONERILER.md
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const EMULATOR = has('--emulator');
const DEMO = has('--demo');
const days = Math.max(1, Number(val('--gun') || 7));
/** Ölü özellik avı ve tekrar eden iş kısa dönemde yanıltır: en az 30 gün. */
const GENIS_GUN = Math.max(30, days);
const now = Date.now();
const from = now - days * 86400000;
const fromGenis = now - GENIS_GUN * 86400000;
const target = EMULATOR ? 'yerel emülatör' : DEMO ? 'demo' : 'canlı';
const RAPOR_DIR = 'kullanim-raporlari';

const tz = { timeZone: 'Europe/Istanbul' };
const dayOf = (ms) => new Intl.DateTimeFormat('sv-SE', { ...tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const hourOf = (ms) => Number(new Intl.DateTimeFormat('tr-TR', { ...tz, hour: '2-digit', hour12: false }).format(new Date(ms)).slice(0, 2));
const when = (ms) => (ms ? new Date(ms).toLocaleString('tr-TR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const ago = (ms) => {
  if (!ms) return 'hiç';
  const h = Math.floor((now - ms) / 3600000);
  return h < 1 ? 'az önce' : h < 24 ? `${h} sa önce` : `${Math.floor(h / 24)} gün önce`;
};
const gun = (ms) => Math.floor(ms / 86400000);
const one = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const bar = (n, max, w = 24) => '█'.repeat(Math.max(n > 0 ? 1 : 0, Math.round((n / (max || 1)) * w))).padEnd(w, '·');
const medyan = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

/* ================= Kip: iki yedek arasındaki fark ================= */

if (has('--yedek-farki')) {
  const i = argv.indexOf('--yedek-farki');
  const [eskiF, yeniF] = [argv[i + 1], argv[i + 2]];
  if (!eskiF || !yeniF) { console.error('Kullanım: npm run kullanim -- --yedek-farki <eski.json> <yeni.json>'); process.exit(1); }
  const oku = (f) => { if (!existsSync(f)) { console.error(`Dosya yok: ${f}`); process.exit(1); } return JSON.parse(readFileSync(f, 'utf8')); };
  const [A, B] = [oku(eskiF), oku(yeniF)];
  if (A.project !== B.project) { console.error(`İki yedek ayrı projeden (${A.project} / ${B.project}). Durdu.`); process.exit(1); }
  const say = (y, col) => (y.collections[col] || []).length;
  const alan = (d, k) => { const v = d.fields?.[k]; return v ? Number(v.integerValue ?? v.doubleValue ?? 0) : 0; };
  const ilerleme = (y) => (y.collections.progress || []).reduce((n, d) => n + Object.keys(d.fields?.lessons?.mapValue?.fields || {}).length, 0);
  const gecme = (y) => (y.collections.progress || []).reduce((n, d) => n + Object.keys(d.fields?.modules?.mapValue?.fields || {}).length, 0);
  const okuma = (y) => (y.collections.progress || []).reduce((n, d) => n + Object.keys(d.fields?.bulletins?.mapValue?.fields || {}).length, 0);
  const COLS = [['stores', 'Mağaza'], ['baristas', 'Barista'], ['attempts', 'Sınav denemesi'], ['requests', 'Talep'],
    ['assignments', 'Görev'], ['bulletins', 'Bülten'], ['proposals', 'Öneri'], ['feedback', 'Geri bildirim'], ['hatalar', 'Hata kaydı']];
  const out = [`# Yedek farkı · ${A.project}`, '', `${A.takenAt?.slice(0, 10)} → ${B.takenAt?.slice(0, 10)}`, '',
    '| Ne | Önce | Sonra | Değişim |', '|---|---|---|---|'];
  for (const [col, ad] of COLS) { const a = say(A, col), b = say(B, col); out.push(`| ${ad} | ${a} | ${b} | ${b - a >= 0 ? '+' : ''}${b - a} |`); }
  const pairs = [['Tamamlanan ders', ilerleme], ['Geçilen modül', gecme], ['Okunan bülten', okuma]];
  for (const [ad, f] of pairs) { const a = f(A), b = f(B); out.push(`| ${ad} | ${a} | ${b} | ${b - a >= 0 ? '+' : ''}${b - a} |`); }
  out.push('');
  const aktif = (y) => (y.collections.users || []).filter((d) => d.fields?.lastSeenAt?.integerValue).length;
  out.push(`Son görülme kaydı olan telefon: ${aktif(A)} → ${aktif(B)}`, '');
  out.push('Bu fark yedekler arasındaki dönemin etkinliğidir; hiçbir okuma harcanmadı.', '');
  mkdirSync(RAPOR_DIR, { recursive: true });
  const f = `${RAPOR_DIR}/${dayOf(now)}-yedek-farki.md`;
  writeFileSync(f, out.join('\n') + '\n');
  console.log(out.filter((l) => l.startsWith('|') || l.startsWith('Son')).join('\n'));
  console.log(`\nRapor: ${f}\n`);
  process.exit(0);
}

/* ================= Kip: gidişat (eski raporlardan) ================= */

if (has('--trend')) {
  if (!existsSync(RAPOR_DIR)) { console.error(`${RAPOR_DIR}/ klasörü yok; önce bir rapor çıkar.`); process.exit(1); }
  const satirlar = readdirSync(RAPOR_DIR).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const first = readFileSync(`${RAPOR_DIR}/${f}`, 'utf8').split('\n')[0];
    const m = first.match(/^<!-- ozet (.*) -->$/);
    if (!m) return null;
    try { return { dosya: f, ...JSON.parse(m[1]) }; } catch { return null; }
  }).filter((x) => x && x.ortam === (DEMO ? 'demo' : EMULATOR ? 'yerel emülatör' : 'canlı'));
  if (!satirlar.length) { console.error('Gidişat için yeterli rapor yok (özet satırı taşıyan rapor bulunamadı).'); process.exit(1); }
  console.log(`\n1401 Campus · gidişat · ${satirlar.length} rapor\n`);
  console.log(`  ${'Tarih'.padEnd(12)}${'Gün'.padStart(4)}${'İz'.padStart(7)}${'Kişi'.padStart(6)}${'Mağaza'.padStart(8)}${'Terk%'.padStart(7)}${'Hata'.padStart(6)}`);
  for (const s of satirlar) {
    console.log(`  ${String(s.tarih).padEnd(12)}${String(s.gun).padStart(4)}${String(s.iz).padStart(7)}${String(s.kisi).padStart(6)}${String(s.magaza).padStart(8)}${String(s.terkOrani ?? '-').padStart(7)}${String(s.hata).padStart(6)}`);
  }
  const ilk = satirlar[0], son = satirlar[satirlar.length - 1];
  if (satirlar.length > 1 && ilk.gun === son.gun) {
    console.log(`\n  Aynı dönem uzunluğunda (${son.gun} gün): iz ${ilk.iz} → ${son.iz}, iz bırakan kişi ${ilk.kisi} → ${son.kisi}.`);
  } else if (satirlar.length > 1) {
    console.log('\n  Not: raporlar farklı dönem uzunluklarında; karşılaştırmak için aynı --gun ile çıkar.');
  }
  console.log('');
  process.exit(0);
}

/* ================= Ortam ve giriş ================= */

const env = {};
const envFile = DEMO ? '.env.demo' : '.env.production';
if (!EMULATOR && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const projectId = EMULATOR ? 'demo-playbook' : env.VITE_FB_PROJECT_ID;
if (!EMULATOR && projectId !== (DEMO ? 'playbook-demo-1401' : 'playbook-1401')) {
  console.error('Beklenmeyen proje:', projectId); process.exit(1);
}
const FS = EMULATOR
  ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

function ask(question, hidden = false) {
  if (hidden && process.stdin.isTTY) {
    return new Promise((resolve) => {
      process.stdout.write(question);
      const stdin = process.stdin; let buf = '';
      stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
      const onData = (ch) => {
        for (const c of ch) {
          if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); resolve(buf.trim()); return; }
          if (c === '\u0003') { process.stdout.write('\n'); process.exit(1); }
          if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1); else buf += c;
        }
      };
      stdin.on('data', onData);
    });
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
  });
}

let token = 'owner';
if (!EMULATOR) {
  let email, password;
  if (DEMO) {
    email = env.VITE_DEMO_EMAIL;
    password = readFileSync('scripts/seed.mjs', 'utf8').match(/staff:\s*\{\s*email:\s*'[^']+',\s*password:\s*'([^']+)'/)[1];
  } else {
    email = val('--email') || await ask('Geliştirici e-postası: ');
    password = await ask('Şifre (görünmez): ', true);
  }
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.VITE_FB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  }).then((x) => x.json());
  if (!r.idToken) { console.error('Giriş başarısız:', r.error?.message || r); process.exit(1); }
  token = r.idToken;
}
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

/* ================= Okuma ================= */

let reads = 0;

function unwrap(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, unwrap(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(unwrap);
  return null;
}
const shape = (d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, unwrap(v)])) });

async function listAll(col) {
  const out = []; let page = '';
  do {
    const r = await fetch(`${FS}/${col}?pageSize=300${page ? `&pageToken=${page}` : ''}`, { headers: H }).then((x) => x.json());
    if (r.error) { console.error(`${col} okunamadı: ${r.error.message}`); return out; }
    out.push(...(r.documents || []).map(shape));
    page = r.nextPageToken || '';
  } while (page);
  reads += out.length;
  return out;
}

async function since(col, field, fromMs) {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: col }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(fromMs) } } },
        orderBy: [{ field: { fieldPath: field }, direction: 'DESCENDING' }],
        limit: 8000
      }
    })
  });
  if (!r.ok) { console.error(`${col} okunamadı: ${r.status} ${(await r.text()).slice(0, 200)}`); return []; }
  const out = (await r.json()).filter((x) => x.document).map((x) => shape(x.document));
  reads += out.length;
  return out;
}

/** Metin alanı üzerinden dönem sorgusu (kullanim.day = YYYYAAGG). */
async function sinceStr(col, field, value) {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: col }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: value } } },
        orderBy: [{ field: { fieldPath: field }, direction: 'DESCENDING' }],
        limit: 5000
      }
    })
  });
  if (!r.ok) { console.error(`${col} okunamadı: ${r.status} ${(await r.text()).slice(0, 200)}`); return []; }
  const out = (await r.json()).filter((x) => x.document).map((x) => shape(x.document));
  reads += out.length;
  return out;
}

const [users, stores, baristas, progress, invites, requests, bulletins, clock] = await Promise.all(
  ['users', 'stores', 'baristas', 'progress', 'invites', 'requests', 'bulletins', 'clock'].map(listAll));
const [sinavGenis, gorevGenis, feedback, errors, onerilerGenis] = await Promise.all([
  since('attempts', 'startedAt', fromGenis), since('assignments', 'createdAt', fromGenis),
  since('feedback', 'createdAt', fromGenis), since('hatalar', 'createdAt', fromGenis),
  since('proposals', 'createdAt', fromGenis)]);
/** Mağaza sayacı (src/lib/kullanimKaydi.ts). Kural açılmadıysa boş döner. */
const sayacGenis = await sinceStr('kullanim', 'day', dayOf(fromGenis).replace(/-/g, ''));

/** Müfredat yerelden okunur: ders ve modül adları için tek okuma bile harcanmaz. */
let CUR = { tracks: [], modules: [], lessons: [] };
const curFile = 'src/generated/curriculum.json';
if (existsSync(curFile)) CUR = JSON.parse(readFileSync(curFile, 'utf8'));
const dersAdi = (id) => CUR.lessons.find((l) => l.id === id)?.title || id;
const dersModulu = (id) => CUR.lessons.find((l) => l.id === id)?.moduleId || null;
const modulAdi = (id) => CUR.modules.find((m) => m.id === id)?.title || id;
const modulDersleri = (mid) => CUR.lessons.filter((l) => l.moduleId === mid && l.published !== false);

/* ================= Geliştirici sayılmaz ================= */

const devUids = new Set(users.filter((u) => u.role === 'developer').map((u) => u.id));
const notDev = (x) => !devUids.has(x.by || x.createdBy || x.uid || '') && x.role !== 'developer';

/* ================= Dönem süzgeçleri ================= */

const inP = (ms) => typeof ms === 'number' && ms >= from;
const attempts = sinavGenis.filter((a) => inP(a.startedAt));
const assignments = gorevGenis.filter((a) => inP(a.createdAt));
const proposals = onerilerGenis.filter((p) => inP(p.createdAt));
const storeName = (id) => stores.find((s) => s.id === id)?.name || id || '—';
const sonEtkinlik = new Map(clock.map((c) => [c.id, c.at]).filter(([, at]) => typeof at === 'number'));
const gunDizgesi = (ms) => dayOf(ms).replace(/-/g, '');
const sayac = sayacGenis.filter((k) => k.day >= gunDizgesi(from));
const sayacTopla = (alan) => {
  const m = new Map();
  for (const k of sayac) for (const [key, n] of Object.entries(k[alan] || {})) m.set(key, (m.get(key) || 0) + (Number(n) || 0));
  return m;
};
const sayacAcilis = sayac.reduce((n, k) => n + (Number(k.acilis) || 0), 0);
const sayacEkran = sayacTopla('ekran');
const sayacRecete = sayacTopla('recete');
const sayacSaat = sayacTopla('saatler');

/* ================= Auth'un kendi giriş kaydı (varsa) ================= */
/*
 * Firebase Auth her hesapta lastSignInTime ve lastRefreshTime tutuyor. Bu veri
 * Firestore'da değil: okunması günlük okuma kotasından SAYILMAZ. Yalnızca bir
 * servis hesabı anahtarı gerekir (Firebase konsolu → Proje ayarları → Servis
 * hesapları → "Yeni özel anahtar oluştur"); dosya serviceAccountKey.json
 * olarak projenin köküne konur ve .gitignore'da olduğu için depoya girmez.
 * Anahtar yoksa rapor eksiksiz çıkar, bu bölüm atlanır.
 */
const KEY_FILE = 'serviceAccountKey.json';
const authGiris = new Map();
let authNot = '';
if (EMULATOR) {
  authNot = 'Emülatörde Auth kaydı okunmadı.';
} else if (!existsSync(KEY_FILE)) {
  authNot = `\`${KEY_FILE}\` yok: gerçek giriş zamanları okunmadı. Firebase konsolu → Proje ayarları → Servis hesapları → "Yeni özel anahtar oluştur" ile indirip projenin köküne koy (depoya girmez, kotadan da sayılmaz).`;
} else {
  try {
    const sa = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
    if (sa.project_id !== projectId) {
      authNot = `${KEY_FILE} ${sa.project_id} projesine ait, hedef ${projectId}. Atlandı.`;
    } else {
      const { initializeApp, cert } = await import('firebase-admin/app');
      const { getAuth } = await import('firebase-admin/auth');
      initializeApp({ credential: cert(sa), projectId });
      const auth = getAuth();
      let pageToken;
      do {
        const r = await auth.listUsers(1000, pageToken);
        for (const u of r.users) {
          const t = Date.parse(u.metadata?.lastSignInTime || '') || 0;
          const ref = Date.parse(u.metadata?.lastRefreshTime || '') || 0;
          authGiris.set(u.uid, { giris: t, yenileme: ref, kurulus: Date.parse(u.metadata?.creationTime || '') || 0, kapali: u.disabled === true });
        }
        pageToken = r.pageToken;
      } while (pageToken);
      authNot = `${authGiris.size} hesabın Auth kaydı okundu (Firestore kotasından sayılmaz).`;
    }
  } catch (e) {
    authNot = `Auth kaydı okunamadı: ${e.message}`;
  }
}
/** Bir hesabın bilinen en son izi: Auth girişi, token yenilemesi ya da saat belgesi. */
const sonGiris = (uid) => {
  const a = authGiris.get(uid);
  return Math.max(a?.giris || 0, a?.yenileme || 0, sonEtkinlik.get(uid) || 0);
};

/* ================= Olay listesi ================= */

const events = [];
const push = (at, kind, who, storeId) => { if (typeof at === 'number' && at > 0) events.push({ at, kind, who, storeId }); };
for (const p of progress) {
  const bid = p.baristaId || p.id;
  const b = baristas.find((x) => x.id === bid);
  const sid = p.storeId || b?.storeId;
  for (const t of Object.values(p.lessons || {})) push(t, 'ders', bid, sid);
  for (const m of Object.values(p.modules || {})) push(m?.passedAt, 'modül geçme', bid, sid);
  for (const q of Object.values(p.quizzes || {})) push(q?.passedAt, 'mini sınav geçme', bid, sid);
  for (const t of Object.values(p.bulletins || {})) push(t, 'bülten okuma', bid, sid);
}
for (const a of sinavGenis) {
  push(a.startedAt, a.lessonId ? 'mini sınav' : 'modül sınavı', a.baristaId, a.storeId);
  if (a.submittedAt) push(a.submittedAt, 'sınav teslimi', a.baristaId, a.storeId);
}
for (const r of requests) {
  push(r.createdAt, 'talep açma', r.createdBy, r.storeId);
  for (const n of r.notes || []) if (n?.side === 'store') push(n.at, 'talep yanıtı (mağaza)', n.by, r.storeId);
}
for (const f of feedback.filter(notDev)) push(f.createdAt, 'geri bildirim', f.by, null);
const periodEvents = events.filter((e) => inP(e.at));

function activity(bid) {
  const mine = events.filter((e) => e.who === bid);
  const p = mine.filter((e) => inP(e.at));
  return { total: p.length, last: mine.reduce((m, e) => Math.max(m, e.at), 0), kinds: p.map((e) => e.kind) };
}

/* ================= Sadeleştirme ölçüleri ================= */

/** 1. Yarım kalan sınav: başladı, teslim yok, süresi de geçmiş. */
const bitmeyen = attempts.filter((a) => !a.submittedAt && !a.voided
  && (a.deadline ? now > a.deadline : now - a.startedAt > 3 * 3600000));
const teslimEdilen = attempts.filter((a) => a.submittedAt && !a.voided);
const sureAsan = teslimEdilen.filter((a) => a.timedOut);
const baslayan = attempts.filter((a) => !a.voided).length;
const terkOrani = pct(bitmeyen.length, baslayan);
const bitmeyenModul = new Map();
for (const a of bitmeyen) bitmeyenModul.set(a.moduleTitle || modulAdi(a.moduleId), (bitmeyenModul.get(a.moduleTitle || modulAdi(a.moduleId)) || 0) + 1);
const sureAsanModul = new Map();
for (const a of sureAsan) sureAsanModul.set(a.moduleTitle || modulAdi(a.moduleId), (sureAsanModul.get(a.moduleTitle || modulAdi(a.moduleId)) || 0) + 1);
const sinavSuresi = teslimEdilen.filter((a) => a.submittedAt > a.startedAt).map((a) => a.submittedAt - a.startedAt);

/** 2. Ölü özellik avı: geniş dönemde (>=30 gün) hiç kayıt üretmemiş özellikler. */
const quizSayisi = progress.reduce((n, p) => n + Object.keys(p.quizzes || {}).length, 0);
const bultenOkuma = progress.reduce((n, p) => n + Object.values(p.bulletins || {}).filter((t) => t >= fromGenis).length, 0);
const rozetIstisna = baristas.filter((b) => b.badgeOverrides && Object.keys(b.badgeOverrides).length).length;
const talepKategori = new Map();
for (const r of requests.filter((r) => r.createdAt >= fromGenis)) talepKategori.set(r.category, (talepKategori.get(r.category) || 0) + 1);
const acilTalep = requests.filter((r) => r.createdAt >= fromGenis && r.priority === 'urgent').length;
const genisTalep = requests.filter((r) => r.createdAt >= fromGenis).length;
const bultenBicim = new Map();
for (const b of bulletins.filter((b) => b.createdAt >= fromGenis)) bultenBicim.set(b.board || b.kind, (bultenBicim.get(b.board || b.kind) || 0) + 1);
const ozellikler = [
  { ad: 'Onay akışı (öneri → direktör)', n: onerilerGenis.filter(notDev).length, kanit: 'proposals', oneri: 'Bölge müdürü içerik düzenlemiyor; onay akışı ekranlardan kaldırılabilir.' },
  { ad: 'Görev atama', n: gorevGenis.filter(notDev).length, kanit: 'assignments', oneri: 'Müdürler görev açmıyor; Görevler ekranı sadeleştirilebilir.' },
  { ad: 'Bülten yayını', n: bulletins.filter((b) => b.createdAt >= fromGenis).filter(notDev).length, kanit: 'bulletins', oneri: 'Bülten hiç yazılmıyor.' },
  { ad: 'Bülten okuma', n: bultenOkuma, kanit: 'progress.bulletins', oneri: 'Bülten yazılıyor ama okunmuyor: bildirim mi eksik, ekran mı bulunamıyor?' },
  { ad: 'Mini sınav (Yeni ürün)', n: quizSayisi, kanit: 'progress.quizzes', oneri: 'Yeni ürün akışının mini sınav kısmı boşa işliyor.' },
  { ad: 'Rozet/başarım istisnası', n: rozetIstisna, kanit: 'baristas.badgeOverrides', oneri: 'İstisna ekranı hiç kullanılmamış; gizlenebilir.' },
  { ad: 'Acil işareti', n: acilTalep, kanit: "requests.priority='urgent'", oneri: genisTalep && acilTalep === genisTalep ? 'Her talep acil işaretlenmiş: ayrım anlamını yitirmiş.' : 'Acil işareti hiç kullanılmamış.' },
  { ad: 'Geri bildirim tuşu', n: feedback.filter(notDev).length, kanit: 'feedback', oneri: 'Kimse geri bildirim göndermiyor: tuş bulunamıyor olabilir.' }
];
const oluOzellikler = ozellikler.filter((o) => o.n === 0);
// Yalnızca mağazanın SEÇEBİLDİĞİ kategoriler (src/api/requests.ts
// MAGAZA_KATEGORILERI). 'personel' uygulamanın kendi açtığı PIN taleplerinde,
// 'diger' eski kayıtlarda kullanılıyor; onları "çıkar" diye işaretlemek yanlış olur.
const SECILEBILIR = ['ariza', 'servis', 'malzeme'];
const kullanilmayanKategori = SECILEBILIR.filter((c) => !talepKategori.get(c));

/** 3. Düzeltme oranı: kayıt açıldıktan 5 dk içinde kendi sahibi tarafından değişti mi? */
const BES_DK = 5 * 60000;
const kendiDuzeltti = requests.filter((r) => r.createdAt >= fromGenis
  && (r.notes || []).some((n) => n?.side === 'store' && n.by === r.createdBy && n.at - r.createdAt < BES_DK));
const bultenDuzeltti = bulletins.filter((b) => b.createdAt >= fromGenis && b.updatedAt && b.updatedAt - b.createdAt < BES_DK);
const oneriDuzeltti = onerilerGenis.filter((p) => p.updatedAt && p.updatedAt - p.createdAt < BES_DK);
const duzeltmeSatirlari = [
  { ad: 'Talep formu', toplam: genisTalep, n: kendiDuzeltti.length, not: 'mağaza kendi talebine 5 dk içinde ek bilgi yazdı' },
  { ad: 'Bülten', toplam: bulletins.filter((b) => b.createdAt >= fromGenis).length, n: bultenDuzeltti.length, not: 'yayınlandıktan 5 dk içinde düzeltildi' },
  { ad: 'Öneri', toplam: onerilerGenis.length, n: oneriDuzeltti.length, not: 'gönderildikten 5 dk içinde düzeltildi' }
].filter((x) => x.toplam > 0);

/** 4. Tekrar eden iş. */
const sinavTekrar = new Map();
for (const a of sinavGenis.filter((x) => !x.voided)) {
  const k = `${a.baristaId}|${a.moduleId}`;
  const g = sinavTekrar.get(k) || { baristaId: a.baristaId, ad: a.baristaName, modul: a.moduleTitle || modulAdi(a.moduleId), n: 0, gecti: false };
  g.n++; if (a.passed) g.gecti = true;
  sinavTekrar.set(k, g);
}
const zorlananlar = [...sinavTekrar.values()].filter((g) => g.n >= 3 && !g.gecti).sort((a, b) => b.n - a.n);
const pinTalepleri = requests.filter((r) => r.category === 'personel' && (r.subjectBaristaId || /PIN sıfırlama/i.test(r.title || '')));
const pinAcik = pinTalepleri.filter((r) => !['done', 'rejected'].includes(r.status));
const ikinciHesap = baristas.filter((b) => (b.accountSeq || 1) > 1);
const basligaGore = new Map();
const basligiSadelestir = (t) => one(t).toLocaleLowerCase('tr').replace(/[^a-zçğıöşü ]/g, '').split(' ').filter(Boolean).slice(0, 4).join(' ');
for (const r of requests.filter((r) => r.createdAt >= fromGenis && !pinTalepleri.includes(r))) {
  const k = basligiSadelestir(r.title);
  if (!k) continue;
  basligaGore.set(k, [...(basligaGore.get(k) || []), r]);
}
const benzerTalepler = [...basligaGore.entries()].filter(([, xs]) => xs.length >= 2).sort((a, b) => b[1].length - a[1].length);
const soruBildirimi = new Map();
for (const f of feedback.filter((f) => f.questionId).filter(notDev)) soruBildirimi.set(f.questionId, [...(soruBildirimi.get(f.questionId) || []), f]);
const cokBildirilenSoru = [...soruBildirimi.entries()].filter(([, xs]) => xs.length >= 2);

/** 5. Ders–sınav kaybı: modülün bütün dersleri bitti, sınava hiç girilmedi. */
const sinavaGirenler = new Set(sinavGenis.map((a) => `${a.baristaId}|${a.moduleId}`));
const dersSinavKaybi = [];
for (const m of CUR.modules.filter((m) => m.published !== false)) {
  const dersler = modulDersleri(m.id).map((l) => l.id);
  if (!dersler.length) continue;
  const bekleyen = [];
  for (const p of progress) {
    const bid = p.baristaId || p.id;
    const b = baristas.find((x) => x.id === bid);
    if (!b || b.active === false) continue;
    const bitti = dersler.filter((id) => (p.lessons || {})[id]).length;
    // Modülü geçmiş olmak (progress.modules, tüm zamanlar) sınava girdiğinin kanıtı:
    // sinavGenis yalnızca son GENIS_GUN günü kapsıyor.
    const gecti = Boolean((p.modules || {})[m.id]);
    if (bitti === dersler.length && !gecti && !sinavaGirenler.has(`${bid}|${m.id}`)) bekleyen.push(b.name);
  }
  if (bekleyen.length) dersSinavKaybi.push({ modul: m.title, n: bekleyen.length, kim: bekleyen });
}
dersSinavKaybi.sort((a, b) => b.n - a.n);

/** 6. İlk kullanım gecikmesi: kayıt açılışı → ilk gerçek kullanım. */
const ilkKullanim = (bid) => {
  const p = progress.find((x) => (x.baristaId || x.id) === bid);
  const ts = [...Object.values(p?.lessons || {}), ...Object.values(p?.bulletins || {}),
    ...sinavGenis.filter((a) => a.baristaId === bid).map((a) => a.startedAt)].filter((t) => typeof t === 'number');
  return ts.length ? Math.min(...ts) : null;
};
const gecikmeler = [];
const hicAcmayan = [];
for (const b of baristas.filter((b) => b.active !== false && !b.pinPending)) {
  const ilk = ilkKullanim(b.id);
  if (ilk && b.createdAt) gecikmeler.push({ ad: b.name, magaza: storeName(b.storeId), g: Math.max(0, gun(ilk - b.createdAt)) });
  else if (!ilk) hicAcmayan.push({ ad: b.name, magaza: storeName(b.storeId), g: b.createdAt ? gun(now - b.createdAt) : null });
}
const gecikmeMedyan = medyan(gecikmeler.map((x) => x.g));

/* ================= Rapor ================= */

const out = [];
const L = (...xs) => out.push(...xs);

const activeStores = stores.filter((s) => s.active !== false);
const activeBaristas = baristas.filter((b) => b.active !== false);
const pinli = activeBaristas.filter((b) => !b.pinPending);
const pinBekleyen = activeBaristas.filter((b) => b.pinPending);
const storePhones = users.filter((u) => u.role === 'store');
const pairedPhones = storePhones.filter((u) => u.active !== false && u.paired === true);
const seenStoreIds = new Set(periodEvents.map((e) => e.storeId).filter(Boolean));
const seenBaristaIds = new Set(periodEvents.map((e) => e.who).filter((w) => baristas.some((b) => b.id === w)));
const errs = errors.filter(notDev).filter((e) => inP(e.createdAt));
const fb = feedback.filter(notDev).filter((f) => inP(f.createdAt));
const openFb = feedback.filter(notDev).filter((f) => f.status !== 'cozuldu');

// Makine okunur özet (--trend bunu okur).
const ozet = {
  tarih: dayOf(now), ortam: target, gun: days, iz: periodEvents.length,
  kisi: seenBaristaIds.size, magaza: seenStoreIds.size, pinli: pinli.length,
  sinav: attempts.length, terkOrani, hata: errs.length, acikGeriBildirim: openFb.length
};
L(`<!-- ozet ${JSON.stringify(ozet)} -->`);
L(`# 1401 Campus · kullanım raporu · ${target}`, '');
L(`Son ${days} gün (${dayOf(from)} → ${dayOf(now)}) · çıkarıldı ${new Date().toLocaleString('tr-TR', tz)} · proje \`${projectId}\``, '');
L('> Giriş saatleri ve ekran gezinmesi canlıda kaydedilmiyor. "Son etkinlik" sütunu', '> `clock/{uid}` belgesinden gelir (her oturum açılışında yazılır, 30 dk hassasiyet).', '> Saat dağılımı *etkinlik* saatleridir. Ayrıntı: `docs/KULLANIM-VERISI.md`.', '');
if (!CUR.lessons.length) L('> ⚠️ `src/generated/curriculum.json` yok: ders ve modül adları yerine kimlikler yazıldı. `npm run curriculum` çalıştır.', '');

/* --- Özet --- */
L('## Özet', '');
L(`- **Mağaza:** ${activeStores.length} aktif · dönemde iz bırakan **${seenStoreIds.size}** (%${pct(seenStoreIds.size, activeStores.length)})`);
L(`- **Telefon:** ${pairedPhones.length}/${storePhones.filter((u) => u.active !== false).length} eşleşmiş`);
L(`- **Barista:** ${activeBaristas.length} aktif · PIN'i olan ${pinli.length} · dönemde iz bırakan **${seenBaristaIds.size}** (%${pct(seenBaristaIds.size, pinli.length || 1)} PIN'lilerin)`);
L(`- **Dönemdeki iz:** ${periodEvents.length} olay · günlük ortalama ${Math.round(periodEvents.length / days)}`);
L(`- **Sınav:** ${attempts.length} deneme · ${teslimEdilen.length} teslim · ${bitmeyen.length} yarım kaldı (**terk %${terkOrani}**) · ${sureAsan.length} süre aştı`);
L(`- **Talep:** ${requests.filter((r) => inP(r.createdAt)).length} yeni · ${requests.filter((r) => !['done', 'rejected'].includes(r.status)).length} açık (tüm zamanlar)`);
L(`- **Zorluk:** ${errs.length} otomatik hata kaydı · ${fb.length} geri bildirim · ${pinAcik.length} açık PIN talebi`, '');

/* --- Mağaza --- */
L('## Mağaza bazında kullanım', '');
L('| Mağaza | Telefon son etkinlik | Barista (PIN) | Dönem izi | Ders | Sınav | Talep | Son iz |');
L('|---|---|---|---|---|---|---|---|');
const storeRows = activeStores.map((s) => {
  const mine = periodEvents.filter((e) => e.storeId === s.id);
  const bs = activeBaristas.filter((b) => b.storeId === s.id);
  const phones = storePhones.filter((u) => u.storeId === s.id && u.active !== false);
  const phone = phones.reduce((m, u) => Math.max(m, sonGiris(u.id), u.lastSeenAt || 0), 0);
  const unpaired = phones.filter((u) => u.paired !== true).length;
  return {
    s, n: mine.length, phone, unpaired, phones: phones.length,
    bs: bs.length, pin: bs.filter((b) => !b.pinPending).length,
    ders: mine.filter((e) => e.kind === 'ders').length,
    sinav: mine.filter((e) => e.kind.includes('sınav')).length,
    talep: mine.filter((e) => e.kind.startsWith('talep')).length,
    last: mine.reduce((m, e) => Math.max(m, e.at), 0)
  };
}).sort((a, b) => b.n - a.n);
for (const r of storeRows) {
  L(`| ${r.s.name} | ${r.phone ? ago(r.phone) : (r.phones ? '**hiç eşleşmedi**' : '—')} | ${r.bs} (${r.pin}) | ${r.n} | ${r.ders} | ${r.sinav} | ${r.talep} | ${ago(r.last)} |`);
}
L('');
const silent = storeRows.filter((r) => r.n === 0);
if (silent.length) L(`**Dönemde hiç iz bırakmayan ${silent.length} mağaza:** ${silent.map((r) => r.s.name).join(', ')}`, '');

/* --- Kişi --- */
L('## Kişi bazında kullanım', '');
const rows = activeBaristas.map((b) => ({ b, giris: sonGiris(b.uid), ...activity(b.id) })).sort((a, c) => c.total - a.total || c.last - a.last);
const used = rows.filter((r) => r.total > 0);
L(`Dönemde iz bırakan ${used.length} kişi, hiç iz bırakmayan ${rows.length - used.length} kişi.`, '');
if (used.length) {
  L('| Kişi | Mağaza | İz | Ders | Sınav | Son iş | Son giriş |');
  L('|---|---|---|---|---|---|---|');
  for (const r of used.slice(0, 25)) {
    L(`| ${r.b.name} | ${storeName(r.b.storeId)} | ${r.total} | ${r.kinds.filter((k) => k === 'ders').length} | ${r.kinds.filter((k) => k.includes('sınav')).length} | ${ago(r.last)} | ${ago(r.giris)} |`);
  }
  if (used.length > 25) L(`| … +${used.length - 25} kişi | | | | | | |`);
  L('');
}
const never = rows.filter((r) => r.total === 0 && !r.b.pinPending);
if (never.length) {
  L(`### PIN'i var ama dönemde hiç iş yapmayan · ${never.length} kişi`, '');
  const acanlar = never.filter((r) => r.giris && inP(r.giris));
  if (acanlar.length) L(`**Uygulamayı açtı ama hiçbir şey yapmadı (${acanlar.length} kişi):** ${acanlar.map((r) => `${r.b.name} (${ago(r.giris)})`).join(', ')}`, '', 'Bu, "açtı ve ne yapacağını bulamadı" demektir — giriş sonrası ekrana bakılmalı.', '');
  const byStore = new Map();
  for (const r of never.filter((r) => !acanlar.includes(r))) {
    const k = storeName(r.b.storeId);
    byStore.set(k, [...(byStore.get(k) || []), `${r.b.name}${r.giris ? ` (son giriş ${ago(r.giris)})` : r.last ? ` (son iş ${ago(r.last)})` : ' (hiç iz yok)'}`]);
  }
  for (const [s, names] of [...byStore].sort((a, b) => b[1].length - a[1].length)) L(`- **${s}** (${names.length}): ${names.join(', ')}`);
  L('');
}

/* --- Kullanılış biçimleri --- */
L('## Hangi ekranlar, hangi özellikler', '');
const kinds = new Map();
for (const e of periodEvents) kinds.set(e.kind, (kinds.get(e.kind) || 0) + 1);
const maxKind = Math.max(1, ...kinds.values());
L('```');
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) L(`${k.padEnd(22)} ${String(n).padStart(5)}  ${bar(n, maxKind)}`);
L('```', '');
L('**Kahve Operasyonu tarafı (panel):**', '');
for (const [k, n] of [
  ['Görev açma', assignments.filter(notDev).length],
  ['Bülten yayını', bulletins.filter((b) => inP(b.createdAt)).filter(notDev).length],
  ['Öneri/onay', proposals.filter(notDev).length],
  ['Talep yanıtı', requests.reduce((n, r) => n + (r.notes || []).filter((x) => x?.side === 'ops' && inP(x.at) && !devUids.has(x.by)).length, 0)]
]) L(`- ${k}: ${n}`);
L('');
const topLessons = new Map();
for (const p of progress) for (const [lid, t] of Object.entries(p.lessons || {})) if (inP(t)) topLessons.set(lid, (topLessons.get(lid) || 0) + 1);
if (topLessons.size) L('**En çok tamamlanan dersler:** ' + [...topLessons].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, n]) => `${dersAdi(l)} (${n})`).join(', '), '');
const examByModule = new Map();
for (const a of attempts) if (!a.lessonId) examByModule.set(a.moduleTitle || modulAdi(a.moduleId), (examByModule.get(a.moduleTitle || modulAdi(a.moduleId)) || 0) + 1);
if (examByModule.size) L('**En çok girilen modül sınavları:** ' + [...examByModule].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m, n]) => `${m} (${n})`).join(', '), '');
const readBulletins = bulletins.filter((b) => b.published).map((b) => ({ b, n: progress.filter((p) => inP((p.bulletins || {})[b.id])).length })).filter((x) => x.n);
if (readBulletins.length) L('**Okunan bültenler:** ' + readBulletins.sort((a, b) => b.n - a.n).slice(0, 6).map((x) => `${one(x.b.title)} (${x.n} kişi)`).join(', '), '');
L('');
L('### Ekran kullanımı (mağaza sayacı)', '');
if (!sayac.length) {
  L('Sayaç kaydı yok. Üç sebep olabilir: kural henüz dağıtılmadı (`firestore.rules` → `match /kullanim`),', 'yeni sürüm henüz yayınlanmadı, ya da dönemde hiçbir mağaza oturumu açılmadı.', '');
  L('Bu bölüm dolmadan şu ekranların kullanımı görünmez: Reçete, Bugün, Ekibim, Sonuçlarım, arama.', '');
} else {
  const EKRAN_ADI = { ana: 'Bugün / ana ekran', receteler: 'Reçete listesi', recete: 'Reçete', bulten: 'Bülten', akademi: 'Akademi', yol: 'Eğitim yolu', modul: 'Modül', ders: 'Ders', sinav: 'Sınav', sonuclarim: 'Sonuçlarım', ekip: 'Ekibim', talepler: 'Talepler', 'barista-secimi': 'Barista seçimi', davet: 'Davet', 'yonetici-girisi': 'Yönetici girişi', panel: 'Panel', diger: 'Diğer' };
  L(`${sayac.length} mağaza-gün kaydı · uygulama **${sayacAcilis}** kez açıldı. Kayıt mağaza başınadır, kişiye bağlı değildir.`, '');
  if (sayacEkran.size) {
    const mx = Math.max(1, ...sayacEkran.values());
    L('```');
    for (const [k, n] of [...sayacEkran].sort((a, b) => b[1] - a[1])) L(`${(EKRAN_ADI[k] || k).padEnd(22)} ${String(n).padStart(6)}  ${bar(n, mx)}`);
    L('```', '');
  }
  if (sayacRecete.size) L('**En çok bakılan reçeteler:** ' + [...sayacRecete].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([r, n]) => `${r} (${n})`).join(', '), '');
  if (sayacSaat.size) {
    const mx = Math.max(1, ...sayacSaat.values());
    L('Uygulama açılış saatleri (mağaza sayacından, Türkiye saati):', '', '```');
    for (const [h, n] of [...sayacSaat].sort()) L(`${h}:00  ${String(n).padStart(4)}  ${bar(n, mx, 30)}`);
    L('```', '');
  }
  // Terk noktaları: ekran açılışı ile tamamlanan iş arasındaki fark.
  const dersAcilis = sayacEkran.get('ders') || 0;
  const dersBitti = periodEvents.filter((e) => e.kind === 'ders').length;
  const sinavEkran = sayacEkran.get('sinav') || 0;
  L('**Terk noktaları** (ekran açılışı → tamamlanan iş):', '');
  if (dersAcilis) L(`- Ders ekranı ${dersAcilis} kez açıldı, ${dersBitti} ders tamamlandı → **%${pct(dersBitti, dersAcilis)}** tamamlandı.${pct(dersBitti, dersAcilis) < 50 ? ' Dersler yarı yolda bırakılıyor: çok mu uzun?' : ''}`);
  if (sinavEkran) L(`- Sınav ekranı ${sinavEkran} kez açıldı, ${attempts.length} deneme başladı.`);
  if (sayacAcilis) L(`- Uygulama ${sayacAcilis} kez açıldı, ${periodEvents.length} iz bırakıldı → açılış başına ${(periodEvents.length / sayacAcilis).toFixed(1)} iş.`);
  L('', '_Not: ekran açılışı sayısıdır, ayrı ders sayısı değil — aynı dersi iki kez açan iki kez sayılır._',
    '_Sayaç belgesinin günü UTC\'dir (gün sınırı Türkiye\'de 03:00); saat dağılımı Türkiye saatine göredir._', '');
  const recetePay = pct((sayacEkran.get('recete') || 0) + (sayacEkran.get('receteler') || 0), [...sayacEkran.values()].reduce((a, b) => a + b, 0));
  if (recetePay >= 30) L(`> Ekran açılışlarının **%${recetePay}'i** reçete: en sık iş bu. Reçeteye giden yol en kısa yol olmalı (bkz. docs/DENETIM-DOKUNUS.md).`, '');
}

/* --- Sadeleştirme bulguları --- */
L('## Sadeleştirme bulguları', '');
L(`Ölü özellik avı ve tekrar eden iş son **${GENIS_GUN} gün** üzerinden; geri kalanı dönemden.`, '');

L(`### Yarım kalan sınavlar · terk %${terkOrani}`, '');
L(`${baslayan} deneme başladı, ${teslimEdilen.length} teslim edildi, **${bitmeyen.length}** yarım kaldı; ${sureAsan.length} tanesi süre dolduğu için otomatik puanlandı.`);
if (sinavSuresi.length) L(`Teslim süresi medyanı ${Math.round(medyan(sinavSuresi) / 60000)} dk (en uzun ${Math.round(Math.max(...sinavSuresi) / 60000)} dk).`);
L('');
if (bitmeyenModul.size) { L('Yarım kalanlar modül bazında:', ''); for (const [m, n] of [...bitmeyenModul].sort((a, b) => b[1] - a[1])) L(`- ${m}: ${n}`); L(''); }
if (sureAsanModul.size) { L('Süre aşımı modül bazında (sınav süresi soru sayısı × 1,5 dk):', ''); for (const [m, n] of [...sureAsanModul].sort((a, b) => b[1] - a[1])) L(`- ${m}: ${n}`); L(''); }
if (terkOrani > 10) L(`> Terk oranı %10'un üstünde. Soru sayısı, süre ya da ekranın sınavdan çıkmayı kolaylaştırması gözden geçirilmeli.`, '');

L('### Ölü özellik avı', '');
L(`Son ${GENIS_GUN} günde hiç kayıt üretmemiş özellikler — kaldırma ya da gizleme adayları:`, '');
if (oluOzellikler.length) for (const o of oluOzellikler) L(`- **${o.ad}** (\`${o.kanit}\`): ${o.oneri}`);
else L('Listedeki her özellik en az bir kez kullanılmış.');
L('');
L('Kullanılanlar:', '');
for (const o of ozellikler.filter((o) => o.n > 0).sort((a, b) => b.n - a.n)) L(`- ${o.ad}: ${o.n}`);
L('');
if (kullanilmayanKategori.length) L(`**Hiç seçilmeyen talep kategorisi:** ${kullanilmayanKategori.join(', ')} — mağazanın seçebildiği üç konudan biri hiç kullanılmamış, listeden çıkarılabilir.`, '');
if (genisTalep && acilTalep === genisTalep) L('**Her talep acil işaretlenmiş** — ayrım anlamını yitirmiş.', '');
if (bultenBicim.size) L('Bülten türleri: ' + [...bultenBicim].map(([k, n]) => `${k} ${n}`).join(' · '), '');
L('_Not: Yönetim Kurulu soruları (`boardQuestions`) bu raporda okunmuyor; kurul ekranının kullanımı panelden bakılmalı._', '');

L('### Düzeltme oranı', '');
L('Bir kayıt açıldıktan 5 dakika içinde sahibi tarafından değiştiyse, form ilk seferde doğru doldurulamamış demektir.', '');
if (duzeltmeSatirlari.length) {
  L('| Form | Kayıt | 5 dk içinde düzeltilen | Oran |', '|---|---|---|---|');
  for (const d of duzeltmeSatirlari) L(`| ${d.ad} | ${d.toplam} | ${d.n} | **%${pct(d.n, d.toplam)}** |`);
  L('');
  for (const d of duzeltmeSatirlari.filter((x) => pct(x.n, x.toplam) >= 20)) L(`> ${d.ad}: ${d.not} — bu formu sadeleştir.`);
  L('');
} else L('Ölçülecek kayıt yok.', '');

L('### Tekrar eden iş', '');
let tekrarVar = false;
if (zorlananlar.length) {
  tekrarVar = true;
  L(`**Aynı modülde 3+ kez başarısız (${zorlananlar.length} kişi-modül):** içerik anlatmıyor ya da soru havuzu dengesiz.`, '');
  for (const z of zorlananlar.slice(0, 10)) L(`- ${z.ad} · ${z.modul} · ${z.n} deneme, hâlâ geçemedi`);
  L('');
}
if (pinTalepleri.length) {
  tekrarVar = true;
  L(`**PIN sıfırlama:** ${pinTalepleri.length} talep (${pinAcik.length} açık) / ${pinli.length} PIN'li kişi.`);
  if (pinTalepleri.length >= Math.max(3, pinli.length * 0.1)) L('> Oran yüksek: PIN\'i hatırlamak zor. Hatırlatma ya da daha kolay bir sıfırlama yolu düşünülmeli.');
  L('');
}
if (ikinciHesap.length) {
  tekrarVar = true;
  L(`**Kodu ikinci kez verilenler (${ikinciHesap.length} kişi):** ${ikinciHesap.slice(0, 10).map((b) => `${b.name} (${b.accountSeq}. hesap)`).join(', ')} — eşleştirme ilk seferde tutmamış.`, '');
}
if (benzerTalepler.length) {
  tekrarVar = true;
  L('**Aynı başlıkla açılan talepler:** bu işler için talep yerine hazır bir akış gerekiyor olabilir.', '');
  for (const [k, xs] of benzerTalepler.slice(0, 8)) L(`- "${k}…" · ${xs.length} kez · ${[...new Set(xs.map((r) => r.storeName || storeName(r.storeId)))].join(', ')}`);
  L('');
}
if (cokBildirilenSoru.length) {
  tekrarVar = true;
  L(`**Birden çok kez "bu soruda hata var" denen sorular:** ${cokBildirilenSoru.length} soru — panelde Soru havuzu → "bildirilen".`, '');
}
if (!tekrarVar) L('Tekrar eden iş işareti yok.', '');

L('### Ders–sınav kaybı', '');
L('Modülün bütün derslerini bitirdi, sınava hiç girmedi. Yığılma varsa sınava giriş ekranda bulunamıyor (ya da önkoşul/haftalık hak engelliyor).', '');
L(`_Son ${GENIS_GUN} günün denemeleri ve tüm zamanların geçilmiş modülleri üzerinden; ${GENIS_GUN} günden eski **başarısız** denemeler görünmez._`, '');
if (dersSinavKaybi.length) {
  for (const d of dersSinavKaybi.slice(0, 10)) L(`- **${d.modul}**: ${d.n} kişi (${d.kim.slice(0, 6).join(', ')}${d.kim.length > 6 ? ', …' : ''})`);
  L('');
} else L('Dersleri bitiren herkes sınava girmiş.', '');

L('### İlk kullanım gecikmesi', '');
if (gecikmeMedyan !== null) {
  L(`Kayıt açılışı ile ilk gerçek kullanım arasında medyan **${gecikmeMedyan} gün** (${gecikmeler.length} kişi üzerinden).`, '');
  const yavas = gecikmeler.filter((x) => x.g >= 3).sort((a, b) => b.g - a.g);
  if (yavas.length) L(`3 günden uzun süren ${yavas.length} kişi: ${yavas.slice(0, 10).map((x) => `${x.ad} (${x.g} gün, ${x.magaza})`).join(', ')}`, '');
} else L('Ölçülecek veri yok (henüz kimse ilk kullanımı yapmamış ya da kayıt tarihi yok).', '');
if (hicAcmayan.length) {
  L(`**PIN'i var, hiç kullanmamış ${hicAcmayan.length} kişi:** ${hicAcmayan.slice(0, 12).map((x) => `${x.ad} (${x.g !== null ? `${x.g} gündür kayıtlı` : 'tarih yok'}, ${x.magaza})`).join(', ')}`, '');
}

/* --- Zorluklar --- */
L('## Uygulamayla ilgili zorluklar', '');
const groups = new Map();
for (const e of errs) {
  const key = `${e.message}|${String(e.stack || '').split('\n')[1] || ''}`;
  const g = groups.get(key) || { ...e, count: 0, people: new Set(), paths: new Set(), stores: new Set(), last: 0 };
  g.count++; g.people.add(e.byName || '?'); g.paths.add(e.path); if (e.storeName) g.stores.add(e.storeName);
  g.last = Math.max(g.last, e.createdAt);
  groups.set(key, g);
}
const errGroups = [...groups.values()].sort((a, b) => (b.kind === 'cokme') - (a.kind === 'cokme') || b.count - a.count);
L(`### Otomatik hata kaydı · ${errs.length} kayıt, ${errGroups.length} farklı`, '');
if (!errGroups.length) L('Hata kaydı yok.', '');
errGroups.slice(0, 10).forEach((g, i) => {
  L(`${i + 1}. ${g.kind === 'cokme' ? '**[Ekran çöktü]** ' : ''}${one(g.message).slice(0, 140)}`);
  L(`   · ${g.count} kez · ${g.people.size} kişi${g.stores.size ? ` · ${[...g.stores].slice(0, 4).join(', ')}` : ''} · ekran ${[...g.paths].slice(0, 3).join(', ')} · son ${when(g.last)}`);
});
if (errGroups.length) L('', 'Yığın izleri ve düzeltme için: `npm run geri-bildirim`.', '');

L(`### Geri bildirim · dönemde ${fb.length}, açık ${openFb.length}`, '');
if (!openFb.length) L('Açık geri bildirim yok.', '');
for (const f of openFb.slice(0, 15)) {
  const K = { hata: 'Çalışmıyor', icerik: 'İçerik yanlış', oneri: 'Öneri' }[f.kind] || f.kind;
  L(`- **${K}** · ${f.byName || '?'} (${f.role || '?'}${f.storeName ? `, ${f.storeName}` : ''}) · ${when(f.createdAt)} · ekran ${f.path}`);
  L(`  > ${one(f.text).slice(0, 220)}`);
}
L('');

L(`### Kullanılmayan davet kodu · ${pinBekleyen.length} kişi PIN belirlemedi`, '');
const suresiGecen = pinBekleyen.filter((b) => b.inviteExpiresAt && b.inviteExpiresAt < now);
if (pinBekleyen.length) {
  L(`${suresiGecen.length} kodun süresi geçti.`, '');
  const byStore = new Map();
  for (const b of pinBekleyen) {
    const k = storeName(b.storeId);
    byStore.set(k, [...(byStore.get(k) || []), `${b.name}${b.inviteExpiresAt ? (b.inviteExpiresAt < now ? ' (süresi geçti)' : ` (${Math.ceil((b.inviteExpiresAt - now) / 86400000)} gün kaldı)`) : ' (kod verilmemiş)'}`]);
  }
  for (const [s, names] of [...byStore].sort((a, b) => b[1].length - a[1].length)) L(`- **${s}** (${names.length}): ${names.join(', ')}`);
} else L('Herkes PIN belirledi.');
const eskiDavet = invites.filter((i) => i.expiresAt && i.expiresAt < now);
if (eskiDavet.length) L('', `\`invites\` koleksiyonunda süresi geçmiş ${eskiDavet.length} kod duruyor (temizlik gerekebilir).`);
L('');

const unpairedPhones = storePhones.filter((u) => u.active !== false && u.paired !== true);
const telefonsuz = activeStores.filter((s) => !storePhones.some((u) => u.storeId === s.id && u.active !== false));
L(`### Mağaza telefonu · ${pairedPhones.length} eşleşmiş, ${unpairedPhones.length} kodu kullanılmamış, ${telefonsuz.length} mağazaya hiç kod verilmemiş`, '');
if (unpairedPhones.length) L(`- Kod verildi, telefon bağlanmadı: ${unpairedPhones.map((u) => storeName(u.storeId)).join(', ')}`);
if (telefonsuz.length) L(`- Hiç telefon hesabı yok: ${telefonsuz.map((s) => s.name).join(', ')}`);
const durgun = storePhones.filter((u) => u.active !== false && u.paired === true
  && (() => { const t = Math.max(sonGiris(u.id), u.lastSeenAt || 0); return !t || now - t > 3 * 86400000; })());
if (durgun.length) L(`- 3 günden uzun süredir açılmadı: ${durgun.map((u) => `${storeName(u.storeId)} (${ago(Math.max(sonGiris(u.id), u.lastSeenAt || 0))})`).join(', ')}`);
if (!unpairedPhones.length && !telefonsuz.length && !durgun.length) L('Bütün telefonlar bağlı ve son günlerde açıldı.');
L('');

const openReqs = requests.filter((r) => !['done', 'rejected'].includes(r.status) && !pinTalepleri.includes(r));
L(`### Açık mağaza talepleri · ${openReqs.length}`, '');
const byCat = new Map();
for (const r of openReqs) byCat.set(r.category, (byCat.get(r.category) || 0) + 1);
if (byCat.size) L([...byCat].map(([c, n]) => `${c}: ${n}`).join(' · '), '');
for (const r of openReqs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(0, 10)) {
  L(`- ${one(r.title).slice(0, 90)} · ${r.storeName || storeName(r.storeId)} · ${r.priority === 'urgent' ? '**acil** · ' : ''}${gun(now - r.createdAt)} gün açık · ${r.status}${r.waitReason ? ` (bekliyor: ${r.waitReason})` : ''}`);
}
if (!openReqs.length) L('Açık talep yok.');
L('');

/* --- Saatler --- */
L('## Etkinlik saatleri', '');
L('Gerçek giriş saati kaydedilmiyor; aşağıdaki dağılım dönemdeki izlerin saatidir (Türkiye saati).', '');
const hours = new Array(24).fill(0);
for (const e of periodEvents) hours[hourOf(e.at)]++;
const maxHour = Math.max(1, ...hours);
L('```');
for (let h = 0; h < 24; h++) if (hours[h] || (h >= 6 && h <= 23)) L(`${String(h).padStart(2, '0')}:00  ${String(hours[h]).padStart(4)}  ${bar(hours[h], maxHour, 30)}`);
L('```', '');
const busiest = periodEvents.length ? hours.indexOf(maxHour) : -1;
const busiestLabel = busiest < 0 ? 'iz yok' : `${String(busiest).padStart(2, '0')}:00`;
if (busiest >= 0) L(`En yoğun saat **${busiestLabel}–${String(busiest + 1).padStart(2, '0')}:00**. Mesai dışı (00:00–06:00) ${hours.slice(0, 6).reduce((a, b) => a + b, 0)} iz.`, '');
const byDay = new Map();
for (const e of periodEvents) byDay.set(dayOf(e.at), (byDay.get(dayOf(e.at)) || 0) + 1);
if (byDay.size) {
  L('**Gün gün:**', '', '```');
  const maxDay = Math.max(1, ...byDay.values());
  for (const [d, n] of [...byDay].sort()) L(`${d}  ${String(n).padStart(4)}  ${bar(n, maxDay, 30)}`);
  L('```', '');
}
const bilinenUid = new Set([...sonEtkinlik.keys(), ...authGiris.keys()]);
const girisSatirlari = [...bilinenUid].map((uid) => {
  if (devUids.has(uid)) return null;
  const at = sonGiris(uid);
  if (!at) return null;
  const u = users.find((x) => x.id === uid);
  const b = baristas.find((x) => x.uid === uid);
  if (!u && !b) return null; // artık kullanılmayan eski hesap (PIN sıfırlaması)
  const ad = b ? `${b.name} (${storeName(b.storeId)})` : u?.role === 'store' ? `${storeName(u.storeId)} telefonu` : u?.name || u?.role || uid.slice(0, 6);
  const kaynak = authGiris.get(uid)?.giris ? 'Auth' : 'saat';
  return { ad, at, kaynak, rol: u?.role || b?.role || '?' };
}).filter(Boolean).sort((a, b) => b.at - a.at);
L(`**Son girişler** · ${girisSatirlari.length} hesap`, '');
L(authNot, '');
if (girisSatirlari.length) for (const g of girisSatirlari.slice(0, 25)) L(`- ${g.ad} · ${when(g.at)} (${ago(g.at)}) · ${g.kaynak}`);
else L('Kayıt yok. İki kaynak var: `clock` belgeleri (kural `firestore.rules` içinde geliştiriciye açılmalı) ve Auth kaydı (servis hesabı anahtarı gerekir).');
L('');
const hicGirmeyen = activeBaristas.filter((b) => !b.pinPending && !sonGiris(b.uid));
if (hicGirmeyen.length && (authGiris.size || sonEtkinlik.size)) {
  L(`**PIN'i var, hiç giriş kaydı yok (${hicGirmeyen.length} kişi):** ${hicGirmeyen.slice(0, 12).map((b) => `${b.name} (${storeName(b.storeId)})`).join(', ')}`, '');
}
if (girisSatirlari.length) {
  const girisSaat = new Array(24).fill(0);
  for (const g of girisSatirlari) girisSaat[hourOf(g.at)]++;
  const mx = Math.max(1, ...girisSaat);
  L('Son girişlerin saat dağılımı (her hesabın yalnızca son girişi):', '', '```');
  for (let h = 0; h < 24; h++) if (girisSaat[h]) L(`${String(h).padStart(2, '0')}:00  ${String(girisSaat[h]).padStart(4)}  ${bar(girisSaat[h], mx, 30)}`);
  L('```', '');
}

/* --- Yapılacaklar --- */
L('## Bu hafta neyi sadeleştir', '');
const yap = [];
if (terkOrani > 10) yap.push(`Sınav terk oranı %${terkOrani}: ${[...bitmeyenModul].sort((a, b) => b[1] - a[1])[0]?.[0] || 'en çok yarım kalan modül'} sınavının soru sayısını ya da süresini gözden geçir.`);
if (sureAsan.length && pct(sureAsan.length, teslimEdilen.length) > 10) yap.push(`Teslimlerin %${pct(sureAsan.length, teslimEdilen.length)}'i süre dolduğu için puanlandı: süre soru başına 1,5 dk, artırılmalı mı?`);
for (const o of oluOzellikler) yap.push(`${o.ad} ${GENIS_GUN} günde hiç kullanılmadı: ${o.oneri}`);
if (kullanilmayanKategori.length) yap.push(`Talep formunda hiç seçilmeyen ${kullanilmayanKategori.length} konu var (${kullanilmayanKategori.join(', ')}): çıkarılabilir mi?`);
for (const d of duzeltmeSatirlari.filter((x) => pct(x.n, x.toplam) >= 20)) yap.push(`${d.ad}: kayıtların %${pct(d.n, d.toplam)}'i 5 dk içinde düzeltilmiş — alanları ve etiketleri sadeleştir.`);
if (zorlananlar.length >= 3) yap.push(`${zorlananlar.length} kişi-modül 3+ denemede geçemedi: ${zorlananlar[0].modul} içeriğini ve soru havuzunu gözden geçir.`);
if (pinTalepleri.length >= Math.max(3, pinli.length * 0.1)) yap.push(`${pinTalepleri.length} PIN sıfırlama: PIN'i hatırlatmanın ya da sıfırlamayı mağazada çözmenin yolunu düşün.`);
if (benzerTalepler.length) yap.push(`"${benzerTalepler[0][0]}…" ${benzerTalepler[0][1].length} kez talep olarak açıldı: bu iş için hazır bir akış ekle.`);
if (dersSinavKaybi.length) yap.push(`${dersSinavKaybi[0].modul}: ${dersSinavKaybi[0].n} kişi dersleri bitirip sınava girmedi — sınava giriş ekranda görünür mü?`);
if (gecikmeMedyan !== null && gecikmeMedyan >= 3) yap.push(`İlk kullanım medyan ${gecikmeMedyan} gün: kod dağıtımı ya da PIN belirleme adımı kısaltılmalı.`);
if (hicAcmayan.length) yap.push(`${hicAcmayan.length} kişinin PIN'i var ama uygulamayı hiç kullanmamış: mağaza müdürüne sorulmalı.`);
if (unpairedPhones.length) yap.push(`${unpairedPhones.length} mağaza telefonu kod aldı ama bağlanmadı: eşleştirme ekranı takılıyor olabilir.`);
if (silent.length) yap.push(`${silent.length} mağaza dönemde hiç iz bırakmadı (${silent.slice(0, 4).map((r) => r.s.name).join(', ')}${silent.length > 4 ? ', …' : ''}).`);
if (errGroups.length) yap.push(`${errGroups.length} farklı hata kaydı: \`npm run geri-bildirim\` ile düzeltmeye geç.`);
if (yap.length) yap.forEach((y, i) => L(`${i + 1}. ${y}`));
else L('Bu dönemde sadeleştirme işareti çıkmadı.');
L('', 'Ayda bir ya da iki maddeyi uygula; biri **silme** olsun. Ölçü uygulamanın büyümesi değil küçülmesi.', '');

/* --- Maliyet --- */
L('## Okuma maliyeti', '');
L(`Bu rapor **${reads} belge okudu** — Spark'ın günlük 50.000 okuma sınırının %${(reads / 500).toFixed(1)}'i.`);
L(`Müfredat (ders ve modül adları) yerel \`${curFile}\` dosyasından okundu: 0 okuma.`);
L(`Auth giriş kayıtları Firestore dışıdır: ${authGiris.size} hesap, 0 okuma.`);
L(`Mağaza sayacı ${sayacGenis.length} belge (mağaza × gün); yazma tarafı cihaz başına günde en çok 6.`);
L(`Ölü özellik avı ve tekrar eden iş ${GENIS_GUN} günlük pencere ister; \`--gun\` bundan küçükse pencere yine 30 gündür.`, '');
L('Günlük kotayı gör: https://console.firebase.google.com/project/' + projectId + '/firestore/usage', '');

/* ================= Yazım ================= */

mkdirSync(RAPOR_DIR, { recursive: true });
const file = `${RAPOR_DIR}/${dayOf(now)}-${target.replace(/\s+/g, '-')}.md`;
writeFileSync(file, out.join('\n') + '\n');

console.log(`\n${target} · son ${days} gün`);
console.log(`  Mağaza    ${activeStores.length} aktif, ${seenStoreIds.size} iz bıraktı`);
console.log(`  Barista   ${pinli.length} PIN'li, ${seenBaristaIds.size} iz bıraktı, ${pinBekleyen.length} PIN beklemede`);
console.log(`  Etkinlik  ${periodEvents.length} iz · en yoğun ${busiestLabel} · ${girisSatirlari.length} hesabın son girişi okundu`);
console.log(`  Sınav     ${baslayan} deneme, terk %${terkOrani}, süre aşımı ${sureAsan.length}`);
console.log(`  Zorluk    ${errGroups.length} farklı hata, ${openFb.length} açık geri bildirim, ${pinAcik.length} açık PIN talebi, ${openReqs.length} açık talep`);
console.log(`  Sayaç     ${sayac.length} mağaza-gün, ${sayacAcilis} açılış, ${sayacEkran.size} ekran kodu`);
console.log(`  Sadeleştir ${yap.length} madde · ölü özellik ${oluOzellikler.length}`);
console.log(`  Okuma     ${reads} belge (günlük sınırın %${(reads / 500).toFixed(1)}'i)`);
console.log(`\nRapor: ${file}\n`);
