/**
 * Toplu barista ekleme. Panelin "Barista ekle" düğmesinin (src/api/backend.ts
 * createBarista) yazdığı kayıtların aynısını, bir listedeki herkes için yazar:
 * baristas, users, progress, invites (+ Firebase Auth hesabı, davet şifresiyle).
 *
 *   node scripts/toplu-barista.mjs <liste.json>                 canlı, KURU DENEME (yazmaz)
 *   node scripts/toplu-barista.mjs <liste.json> --uygula        canlıya yazar
 *   node scripts/toplu-barista.mjs <liste.json> --demo [--uygula]
 *   … --kod-yenile                      kayıtlı ama davetinin süresi dolmuş kişilere yeni kod verir
 *   … --magaza-ac                       listede olup sistemde olmayan mağazaları da açar
 *                                       (ad olduğu gibi, şehir "sehir" alanından, yoksa İstanbul)
 *
 * Liste (JSON dizi), kişi başına:
 *   { "ad": "Ayşe Yılmaz", "magaza": "Moda Cadde" | "<storeId>", "rol": "barista"|"shift"|"lead", "baslama": "2026-11-20" }
 * Telefon, kimlik no gibi başka alanlar okunmaz ve yazılmaz.
 *
 * - Mağaza, ada (büyük/küçük harf ve Türkçe karakter farkı gözetmeden) ya da
 *   kimliğe göre eşleşir. Eşleşmeyen, pasif mağazadaki ya da aynı mağazada
 *   aynı adla zaten kayıtlı kişi atlanır ve raporda gösterilir.
 * - Yeniden çalıştırmak güvenli: kayıtlı olanlar atlanır, bekleyen davet
 *   kodları listeye yine yazılır (yarıda kalan bir çalıştırma sürdürülebilir).
 * - Başlama tarihi yoksa ya da ileri bir günse panel gibi bugünü yazar (raporda işaretli).
 * - Canlıya yazmadan önce bugün alınmış bir yedek ister (npm run yedek).
 * - Kod veren adı panelle aynı kurala uyar: geliştirici iz bırakmaz (boş yazılır).
 *
 * Mağaza telefonu kodları (7 gün, tek kullanım; bağlı telefonu olan mağaza atlanır):
 *   node scripts/toplu-barista.mjs --telefon-kodu [--demo] [--magaza <ad>] [--uygula --cikti <dosya>]
 *
 * Sonuç, listenin yanına <liste>-sonuc.txt (mağaza mağaza ad, görev, kod;
 * WhatsApp'a yapıştırmaya hazır) ve <liste>-sonuc.json olarak yazılır.
 * Firebase, bir IP'den saatte en fazla ~100 yeni hesaba izin verir; sınıra
 * takılırsa betik durur, bir saat sonra aynı komut kaldığı yerden sürdürür.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { webcrypto as crypto } from 'node:crypto';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const DEMO = has('--demo');
const APPLY = has('--uygula');
const PHONES = has('--telefon-kodu');
const listFile = argv.find((a, i) => !a.startsWith('--') && !['--email', '--cikti', '--magaza'].includes(argv[i - 1]));
if (!listFile && !PHONES) { console.error('Kullanım: node scripts/toplu-barista.mjs <liste.json> [--demo] [--uygula]'); process.exit(1); }

const env = {};
for (const l of readFileSync(DEMO ? '.env.demo' : '.env.production', 'utf8').split('\n')) { const m = l.match(/^([\w.]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const projectId = env.VITE_FB_PROJECT_ID;
if (projectId !== (DEMO ? 'playbook-demo-1401' : 'playbook-1401')) { console.error('Beklenmeyen proje:', projectId); process.exit(1); }

/* ---------------- Uygulamayla aynı sabitler (src/api/backend.ts) ---------------- */
const ACCOUNT_DOMAIN = 'hesap.playbook1401.app';
const INVITE_TTL_MS = 7 * 86400000;
const invitePassword = (code) => `davet-${code}-1401`;
const ROLE_LABEL = { lead: 'Mağaza müdürü', shift: 'Vardiya müdürü', barista: 'Barista' };   // src/lib/roles.ts
const localDay = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const randomDigits = (n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => String(x % 10)).join('');
const autoId = () => { const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; return Array.from(crypto.getRandomValues(new Uint32Array(20)), (x) => abc[x % abc.length]).join(''); };
const norm = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c])
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* ---------------- Liste ---------------- */
const rows = PHONES ? [] : JSON.parse(readFileSync(listFile, 'utf8'));
if (!PHONES && (!Array.isArray(rows) || !rows.length)) { console.error('Liste boş ya da dizi değil.'); process.exit(1); }

/* ---------------- Canlıda yedek şartı ---------------- */
if (APPLY && !DEMO) {
  const today = localDay();
  const fresh = (() => { try { return readdirSync('yedekler').filter((f) => f.startsWith(`${today}-canli`)).some((f) => Date.now() - statSync(`yedekler/${f}`).mtimeMs < 6 * 3600000); } catch { return false; } })();
  if (!fresh) { console.error('Canlıya yazmadan önce yedek al: npm run yedek  (son 6 saatte alınmış canlı yedeği bulunamadı)'); process.exit(1); }
}

/* ---------------- Giriş (scripts/yedek.mjs ile aynı) ---------------- */
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
let email, password;
if (DEMO) {
  email = env.VITE_DEMO_EMAIL;
  password = readFileSync('scripts/seed.mjs', 'utf8').match(/staff:\s*\{\s*email:\s*'[^']+',\s*password:\s*'([^']+)'/)[1];
} else {
  email = val('--email') || await ask('Geliştirici e-postası: ');
  password = await ask('Şifre (görünmez): ', true);
}
const IDT = 'https://identitytoolkit.googleapis.com/v1';
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const auth = await post(`${IDT}/accounts:signInWithPassword?key=${env.VITE_FB_API_KEY}`, { email, password, returnSecureToken: true }).then((x) => x.json());
if (!auth.idToken) { console.error('Giriş başarısız:', auth.error?.message || auth); process.exit(1); }
const ROOT = `projects/${projectId}/databases/(default)/documents`;
const FS = `https://firestore.googleapis.com/v1/${ROOT}`;
const H = { Authorization: `Bearer ${auth.idToken}`, 'Content-Type': 'application/json' };

const enc = (v) => {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (v && typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { nullValue: null };
};
const dec = (v) => v.stringValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue ?? v.doubleValue ?? null);
const plain = (d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, dec(x)])) });
async function listAll(col) {
  const out = []; let token = '';
  do {
    const r = await fetch(`${FS}/${col}?pageSize=300${token ? `&pageToken=${token}` : ''}`, { headers: H }).then((x) => x.json());
    if (r.error) throw new Error(`${col}: ${r.error.message}`);
    out.push(...(r.documents || []).map(plain)); token = r.nextPageToken || '';
  } while (token);
  return out;
}

/* ---------------- Kim olarak yazıyoruz: kod veren adı ---------------- */
const meDoc = await fetch(`${FS}/users/${auth.localId}`, { headers: H }).then((x) => x.json());
const me = meDoc.fields ? plain(meDoc) : {};
if (!['developer', 'director', 'opsmanager', 'regional'].includes(me.role)) { console.error('Bu hesap ekip hesabı değil.'); process.exit(1); }
const issuedByName = me.role === 'developer' ? '' : (me.name || '');      // roles.ts authorName

/* ---------------- Saat denetimi (kural: davet ömrü sunucu saatiyle 7 gün ± 5 dk) ---------------- */
{
  const r = await fetch(`${FS}/stores?pageSize=1`, { headers: H });
  const skew = Math.abs(Date.parse(r.headers.get('date')) - Date.now());
  if (skew > 120000) { console.error(`Bilgisayar saati sunucudan ${Math.round(skew / 1000)} sn farklı; saati düzeltip yeniden dene.`); process.exit(1); }
}

/* ---------------- Mağaza telefonu kodları (--telefon-kodu) ----------------
 * Panelin "Telefon bağla" düğmesiyle aynı kayıt (backend.ts createPairingCode):
 * mağaza hesabı + users (role store, eşleşmemiş) + pairingCodes (7 gün, tek kullanım).
 * Bağlı (eşleşmiş, aktif) telefonu olan mağaza atlanır. Liste --cikti dosyasına yazılır. */
if (PHONES) {
  const PAIRING_TTL_MS = 7 * 86400000;
  const randomToken = (len = 32) => Array.from(crypto.getRandomValues(new Uint8Array(len)), (x) => x.toString(36).padStart(2, '0')).join('').slice(0, len);
  const out = val('--cikti');
  if (APPLY && !out) { console.error('Kodların yazılacağı dosya: --cikti <dosya>'); process.exit(1); }
  const only = val('--magaza');
  const stores = (await listAll('stores')).filter((s) => s.active !== false && (!only || norm(s.name) === norm(only) || s.id === only)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const phones = (await listAll('users')).filter((u) => u.role === 'store' && u.active !== false && u.paired === true);
  const lines = []; let fail = 0;
  for (const st of stores) {
    if (phones.some((u) => u.storeId === st.id)) { console.log(`  BAĞLI TELEFON VAR  ${st.name} (atlandı)`); continue; }
    if (!APPLY) { console.log(`  kod üretilecek     ${st.name}`); continue; }
    try {
      let code;
      for (let i = 0; i < 8 && !code; i++) { const c = randomDigits(6); if ((await fetch(`${FS}/pairingCodes/${c}`, { headers: H })).status === 404) code = c; }
      if (!code) throw new Error('kod üretilemedi');
      const email = `tel-${st.id}-${randomToken(6)}@${ACCOUNT_DOMAIN}`, password = randomToken(28);
      const su = await post(`${IDT}/accounts:signUp?key=${env.VITE_FB_API_KEY}`, { email, password, returnSecureToken: false }).then((x) => x.json());
      if (!su.localId) throw new Error(`hesap açılamadı: ${su.error?.message}`);
      const now = Date.now(), expiresAt = now + PAIRING_TTL_MS;
      const doc = (path, data) => ({ update: { name: `${ROOT}/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, x]) => [k, enc(x)])) }, currentDocument: { exists: false } });
      const c = await post(`https://firestore.googleapis.com/v1/${ROOT}:commit`, { writes: [
        doc(`users/${su.localId}`, { role: 'store', storeId: st.id, active: true, paired: false, label: 'Mağaza telefonu', createdAt: now, lastSeenAt: null }),
        doc(`pairingCodes/${code}`, { uid: su.localId, email, password, storeId: st.id, storeName: st.name, expiresAt })
      ] }, H).then((x) => x.json());
      if (c.error) throw new Error(`kayıt yazılamadı: ${c.error.message}`);
      lines.push(`${st.name}\t${code}\t${localDay(expiresAt)}`);
      console.log(`  ✓ ${st.name} · ${code}`);
    } catch (e) { fail++; console.log(`  ✗ ${st.name} · ${e.message}`); }
  }
  if (APPLY) { writeFileSync(out, lines.join('\n') + '\n'); console.log(`\n${fail ? `⚠ ${fail} mağaza için kod üretilemedi.\n` : '✓ Bitti.\n'}Kodlar: ${out}`); }
  else console.log('\nHiçbir şey yazılmadı (kuru deneme). Yazmak için: --uygula --cikti <dosya>');
  process.exit(fail ? 1 : 0);
}

/* ---------------- Eşleştirme ---------------- */
const stores = await listAll('stores');
const baristas = await listAll('baristas');
const invites = await listAll('invites');
const storeById = new Map(stores.map((s) => [s.id, s]));
const storeByName = new Map();
for (const s of stores) for (const k of [s.id, s.name]) { const n = norm(k); if (n) storeByName.set(n, [...(storeByName.get(n) || []), s]); }
const today = localDay();

const NEW_STORES = has('--magaza-ac');
const newStores = new Map();
const plan = [], skipped = [], seen = new Set();
rows.forEach((r, i) => {
  const line = `${i + 1}. ${r.ad || '(adsız)'}`;
  const name = String(r.ad || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) return skipped.push({ ...r, neden: 'ad yok' });
  const cands = storeById.has(r.magaza) ? [storeById.get(r.magaza)] : [...new Set(storeByName.get(norm(r.magaza)) || [])];
  if (cands.length > 1) return skipped.push({ ...r, neden: 'mağaza adı birden çok mağazaya uyuyor' });
  if (!cands.length && !NEW_STORES) return skipped.push({ ...r, neden: 'mağaza bulunamadı (açmak için --magaza-ac)' });
  if (!cands.length) {
    // Panelin "Mağaza ekle"siyle aynı kayıt (StaffPages.tsx): ad, şehir, aktif.
    const n = norm(r.magaza);
    if (!newStores.has(n)) newStores.set(n, { id: null, isNew: true, name: String(r.magaza).trim().replace(/\s+/g, ' '), city: String(r.sehir || 'İstanbul').trim() });
    cands.push(newStores.get(n));
  }
  const store = cands[0];
  if (store.active === false) return skipped.push({ ...r, neden: 'mağaza pasif' });
  if (!ROLE_LABEL[r.rol]) return skipped.push({ ...r, neden: `rol tanımsız (${r.rol})` });
  const key = `${store.id}|${norm(name)}`;
  if (seen.has(key)) return skipped.push({ ...r, neden: 'listede iki kez' });
  seen.add(key);
  const okDay = typeof r.baslama === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.baslama) && r.baslama <= today;
  const startedAt = okDay ? r.baslama : today;
  const exists = baristas.find((b) => b.storeId === store.id && norm(b.name) === norm(name) && b.active !== false);
  const elsewhere = !exists && baristas.find((b) => norm(b.name) === norm(name) && b.active !== false);
  plan.push({ line, name, store, role: r.rol, startedAt, dateNote: okDay ? '' : (r.baslama ? `başlama ${r.baslama} → bugün` : 'başlama yok → bugün'), exists, elsewhere });
});

console.log(`\n${DEMO ? 'DEMO' : 'CANLI'} · ${projectId} · ${rows.length} satır\n`);
for (const s of newStores.values()) console.log(`  YENİ MAĞAZA  ${s.name} (${s.city})`);
for (const p of plan) {
  const tag = p.exists ? 'ZATEN VAR' : 'eklenecek';
  console.log(`  ${tag.padEnd(10)} ${p.store.name.padEnd(18)} ${ROLE_LABEL[p.role].padEnd(15)} ${p.startedAt}  ${p.name}${p.dateNote ? `  (${p.dateNote})` : ''}${p.elsewhere ? `  ⚠ aynı ad ${storeById.get(p.elsewhere.storeId)?.name || p.elsewhere.storeId} mağazasında da var` : ''}`);
}
for (const s of skipped) console.log(`  ATLANDI    ${s.ad || '(adsız)'} · ${s.magaza || '-'} · ${s.neden}`);
const todo = plan.filter((p) => !p.exists);
console.log(`\nYeni mağaza ${newStores.size} · eklenecek ${todo.length} · zaten kayıtlı ${plan.length - todo.length} · atlanan ${skipped.length}`);

/* ---------------- Yazma ---------------- */
let failed = 0;
if (APPLY) {
  for (const s of newStores.values()) {
    const id = autoId();
    const c = await post(`https://firestore.googleapis.com/v1/${ROOT}:commit`, { writes: [{ update: { name: `${ROOT}/stores/${id}`, fields: { name: enc(s.name), city: enc(s.city), active: enc(true), createdAt: enc(Date.now()) } }, currentDocument: { exists: false } }] }, H).then((x) => x.json());
    if (c.error) { console.error(`Mağaza açılamadı (${s.name}): ${c.error.message}`); process.exit(1); }
    s.id = id; console.log(`  ✓ mağaza açıldı: ${s.name}`);
  }
  const takenCodes = new Set(invites.map((v) => v.id));
  async function uniqueCode() {
    for (let i = 0; i < 8; i++) {
      const code = randomDigits(6);
      if (takenCodes.has(code)) continue;
      const r = await fetch(`${FS}/invites/${code}`, { headers: H });
      if (r.status === 404) { takenCodes.add(code); return code; }
    }
    throw new Error('Kod üretilemedi');
  }
  for (const p of todo) {
    try {
      const id = autoId();
      const code = await uniqueCode();
      const authEmail = `b-${id.toLowerCase()}-1@${ACCOUNT_DOMAIN}`;
      const su = await post(`${IDT}/accounts:signUp?key=${env.VITE_FB_API_KEY}`, { email: authEmail, password: invitePassword(code), returnSecureToken: false }).then((x) => x.json());
      if (!su.localId) {
        const msg = su.error?.message || JSON.stringify(su);
        if (/TOO_MANY|QUOTA/i.test(msg)) { console.log(`\n⏸ Firebase saatlik hesap sınırı (${msg}). Bir saat sonra aynı komutu yeniden çalıştır; kaldığı yerden sürer.`); failed += todo.length - todo.indexOf(p); break; }
        throw new Error(`hesap açılamadı: ${msg}`);
      }
      const uid = su.localId, now = Date.now(), expiresAt = now + INVITE_TTL_MS;
      const doc = (path, data) => ({ update: { name: `${ROOT}/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, x]) => [k, enc(x)])) }, currentDocument: { exists: false } });
      const writes = [
        doc(`baristas/${id}`, {
          name: p.name, storeId: p.store.id, role: p.role, phone: '',
          active: true, pinPending: true, uid, authEmail, accountSeq: 1,
          startedAt: p.startedAt, createdAt: now, inviteExpiresAt: expiresAt, codeIssuedByName: issuedByName
        }),
        doc(`users/${uid}`, { role: p.role, baristaId: id, storeId: p.store.id, active: true, createdAt: now }),
        doc(`progress/${id}`, { baristaId: id, storeId: p.store.id, lessons: {}, modules: {}, updatedAt: now }),
        doc(`invites/${code}`, { baristaId: id, uid, email: authEmail, storeId: p.store.id, expiresAt })
      ];
      const c = await post(`https://firestore.googleapis.com/v1/${ROOT}:commit`, { writes }, H).then((x) => x.json());
      if (c.error) throw new Error(`kayıt yazılamadı: ${c.error.message}`);
      p.created = { id, code, expiresAt };
      console.log(`  ✓ ${p.store.name} · ${p.name} · ${code}`);
    } catch (e) { failed++; p.error = e.message; console.log(`  ✗ ${p.store.name} · ${p.name} · ${e.message}`); }
  }
}

/* ---------------- Süresi dolmuş davete yeni kod (--kod-yenile) ----------------
 * Paneldeki "Yeni kod" (backend.ts resetBaristaPin) ile aynı: yeni hesap + davet,
 * eski hesap pasif, eski davetler silinir. Yalnızca kodunu hiç kullanmamış
 * (pinPending) ve davetinin süresi dolmuş, kayıtlı kişilere. */
const inviteByBarista = new Map(invites.map((v) => [v.baristaId, v]));
if (APPLY && has('--kod-yenile')) {
  for (const p of plan) {
    const b = p.exists;
    if (!b || !b.pinPending) continue;
    const v = inviteByBarista.get(b.id);
    if (v && v.expiresAt > Date.now()) continue;
    try {
      const seq = (Number(b.accountSeq) || 1) + 1;
      let code;
      for (let i = 0; i < 8 && !code; i++) { const c = randomDigits(6); if ((await fetch(`${FS}/invites/${c}`, { headers: H })).status === 404) code = c; }
      if (!code) throw new Error('kod üretilemedi');
      const authEmail = `b-${b.id.toLowerCase()}-${seq}@${ACCOUNT_DOMAIN}`;
      const su = await post(`${IDT}/accounts:signUp?key=${env.VITE_FB_API_KEY}`, { email: authEmail, password: invitePassword(code), returnSecureToken: false }).then((x) => x.json());
      if (!su.localId) throw new Error(`hesap açılamadı: ${su.error?.message}`);
      const uid = su.localId, now = Date.now(), expiresAt = now + INVITE_TTL_MS;
      const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, enc(x)]));
      const patch = { uid, authEmail, accountSeq: seq, pinPending: true, active: true, inviteExpiresAt: expiresAt, codeIssuedByName: issuedByName };
      const writes = [
        ...invites.filter((x) => x.baristaId === b.id).map((x) => ({ delete: `${ROOT}/invites/${x.id}` })),
        ...(b.uid ? [{ update: { name: `${ROOT}/users/${b.uid}`, fields: fields({ active: false }) }, updateMask: { fieldPaths: ['active'] } }] : []),
        { update: { name: `${ROOT}/users/${uid}`, fields: fields({ role: b.role, baristaId: b.id, storeId: b.storeId, active: true, createdAt: now }) }, currentDocument: { exists: false } },
        { update: { name: `${ROOT}/baristas/${b.id}`, fields: fields(patch) }, updateMask: { fieldPaths: Object.keys(patch) }, currentDocument: { exists: true } },
        { update: { name: `${ROOT}/invites/${code}`, fields: fields({ baristaId: b.id, uid, email: authEmail, storeId: b.storeId, expiresAt }) }, currentDocument: { exists: false } }
      ];
      const c = await post(`https://firestore.googleapis.com/v1/${ROOT}:commit`, { writes }, H).then((x) => x.json());
      if (c.error) throw new Error(`kayıt yazılamadı: ${c.error.message}`);
      inviteByBarista.set(b.id, { id: code, baristaId: b.id, expiresAt });
      console.log(`  ✓ yeni kod: ${p.store.name} · ${p.name} · ${code}`);
    } catch (e) { failed++; console.log(`  ✗ yeni kod: ${p.store.name} · ${p.name} · ${e.message}`); }
  }
}

/* ---------------- Sonuç listesi (yalnızca davet kodu olanlar) ---------------- */
const out = [];
for (const p of plan) {
  let code, exp;
  if (p.created) ({ code, expiresAt: exp } = p.created);
  else if (p.exists && p.exists.pinPending) { const v = inviteByBarista.get(p.exists.id); if (v && v.expiresAt > Date.now()) { code = v.id; exp = v.expiresAt; } else p.expired = true; }
  out.push({ magaza: p.store.name, ad: p.name, gorev: ROLE_LABEL[p.role], rol: p.role, baslama: p.startedAt, kod: code || null, sonGun: exp ? localDay(exp) : null,
    durum: p.created ? 'eklendi' : p.exists ? (p.expired ? 'zaten kayıtlı, KODUN SÜRESİ DOLMUŞ: panelden yeni kod ver' : p.exists.pinPending ? 'zaten kayıtlı, kodu bekliyor' : 'zaten kayıtlı, giriş yapmış') : p.error ? `hata: ${p.error}` : 'eklenmedi (kuru deneme)' });
}
const base = listFile.replace(/\.json$/, '');
for (const o of out) if (/SÜRESİ/.test(o.durum)) console.log(`  ⚠ ${o.magaza} · ${o.ad}: ${o.durum}`);
writeFileSync(`${base}-sonuc.json`, JSON.stringify({ proje: projectId, uygulandi: APPLY, kisiler: out, atlananlar: skipped }, null, 2));
if (APPLY) {
  const byStore = new Map();
  for (const o of out.filter((x) => x.kod)) byStore.set(o.magaza, [...(byStore.get(o.magaza) || []), o]);
  const order = { lead: 0, shift: 1, barista: 2 };
  let txt = '';
  for (const [store, list] of [...byStore].sort((a, b) => a[0].localeCompare(b[0], 'tr'))) {
    list.sort((a, b) => order[a.rol] - order[b.rol] || a.ad.localeCompare(b.ad, 'tr'));
    const last = list.map((x) => x.sonGun).sort()[0];
    txt += `*${store}* — 1401 Campus davet kodları\n`;
    list.forEach((x, i) => { txt += `${i + 1}. ${x.ad} — ${x.gorev} — ${x.kod}\n`; });
    txt += `Mağaza telefonunda "Yeni misin?" → kodu gir → 4 haneli PIN belirle. Kodlar ${last.split('-').reverse().join('.')} tarihine kadar geçerli.\n\n`;
  }
  writeFileSync(`${base}-sonuc.txt`, txt.trim() + '\n');
  console.log(`\n${failed ? `⚠ ${failed} kişi eklenemedi; aynı komutu yeniden çalıştır.\n` : '✓ Bitti.\n'}Mağaza listeleri: ${base}-sonuc.txt`);
} else {
  console.log(`\nHiçbir şey yazılmadı (kuru deneme). Rapor: ${base}-sonuc.json\nYazmak için komutun sonuna --uygula ekle.`);
}
process.exit(failed ? 1 : 0);
