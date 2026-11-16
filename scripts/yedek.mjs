/**
 * Veritabanı yedeği. Spark planında Firebase otomatik yedek almaz; bu komut
 * geliştirici girişiyle bütün kayıtları bu bilgisayara tarihli bir dosyaya indirir.
 *
 *   npm run yedek                       canlı (e-posta ve şifre sorar, şifre görünmez)
 *   npm run yedek -- --demo             demo
 *
 * Geri yükleme (önce ne değişeceğini gösterir, --uygula olmadan yazmaz):
 *   npm run yedek -- --geri-yukle yedekler/2026-11-16-canli.json --koleksiyon baristas
 *   npm run yedek -- --geri-yukle <dosya> --koleksiyon baristas --belge demo-ayse --uygula
 *
 * Dosyalar yedekler/ klasörüne yazılır (git'e girmez). Belgeler Firestore'un
 * kendi biçiminde saklanır; geri yüklemede aynen yazılır. Yapay zekâ anahtarı
 * (config/ai) yedeğe alınmaz. Bir yedek, kayıt sayısı kadar okuma harcar
 * (bugün birkaç bin; günlük sınır 50.000).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const DEMO = has('--demo');

const COLLECTIONS = ['users', 'stores', 'baristas', 'progress', 'attempts', 'assignments', 'bulletins', 'requests',
  'proposals', 'boardQuestions', 'feedback', 'hatalar', 'mailLog', 'tracks', 'modules', 'lessons', 'questions'];
const CONFIG_DOCS = ['badges', 'permissions', 'notifications'];

const env = {};
for (const l of readFileSync(DEMO ? '.env.demo' : '.env.production', 'utf8').split('\n')) { const m = l.match(/^([\w.]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const projectId = env.VITE_FB_PROJECT_ID;
if (projectId !== (DEMO ? 'playbook-demo-1401' : 'playbook-1401')) { console.error('Beklenmeyen proje:', projectId); process.exit(1); }
const label = DEMO ? 'demo' : 'canli';

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

/* ---------------- Giriş ---------------- */
let email, password;
if (DEMO) {
  email = env.VITE_DEMO_EMAIL;
  password = readFileSync('scripts/seed.mjs', 'utf8').match(/staff:\s*\{\s*email:\s*'[^']+',\s*password:\s*'([^']+)'/)[1];
} else {
  email = val('--email') || await ask('Geliştirici e-postası: ');
  password = await ask('Şifre (görünmez): ', true);
}
const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.VITE_FB_API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
}).then((x) => x.json());
if (!auth.idToken) { console.error('Giriş başarısız:', auth.error?.message || auth); process.exit(1); }
const ROOT = `projects/${projectId}/databases/(default)/documents`;
const FS = `https://firestore.googleapis.com/v1/${ROOT}`;
const H = { Authorization: `Bearer ${auth.idToken}`, 'Content-Type': 'application/json' };

/* ---------------- Geri yükleme ---------------- */
/** Alan sırasından bağımsız karşılaştırma. */
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const eq = (a, b) => JSON.stringify(canon(a || {})) === JSON.stringify(canon(b || {}));
const restoreFile = val('--geri-yukle');
if (restoreFile) {
  const col = val('--koleksiyon');
  if (!col) { console.error('Hangi koleksiyon? --koleksiyon <ad>'); process.exit(1); }
  const backup = JSON.parse(readFileSync(restoreFile, 'utf8'));
  if (backup.project !== projectId) { console.error(`Bu yedek ${backup.project} projesinin; hedef ${projectId}. Durdu.`); process.exit(1); }
  const only = val('--belge');
  const docs = (backup.collections[col] || []).filter((d) => !only || d.name.endsWith(`/${col}/${only}`));
  if (!docs.length) { console.error('Yedekte bu koleksiyonda eşleşen belge yok.'); process.exit(1); }
  const apply = has('--uygula');
  let same = 0, changed = 0, missing = 0, ok = 0, fail = 0;
  for (const d of docs) {
    const path = d.name.slice(d.name.indexOf('/documents/') + '/documents/'.length);
    const now = await fetch(`${FS}/${path}`, { headers: H }).then((x) => x.json());
    const state = now.error ? 'yok' : eq(now.fields, d.fields) ? 'aynı' : 'farklı';
    if (state === 'aynı') { same++; continue; }
    state === 'yok' ? missing++ : changed++;
    console.log(`  ${state === 'yok' ? 'silinmiş' : 'değişmiş'}: ${path}`);
    if (!apply) continue;
    const r = await fetch(`${FS}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: d.fields }) }).then((x) => x.json());
    if (r.error) { fail++; console.log(`    yazılamadı: ${r.error.message}`); } else ok++;
  }
  console.log(`\n${col}: ${docs.length} belge · aynı ${same} · değişmiş ${changed} · silinmiş ${missing}`);
  console.log(apply ? `Geri yüklenen ${ok}, yazılamayan ${fail}.` : 'Hiçbir şey yazılmadı. Uygulamak için komutun sonuna --uygula ekle.');
  process.exit(fail ? 1 : 0);
}

/* ---------------- Yedek ---------------- */
async function listAll(col) {
  const out = []; let token = '';
  do {
    const r = await fetch(`${FS}/${col}?pageSize=300${token ? `&pageToken=${token}` : ''}`, { headers: H }).then((x) => x.json());
    if (r.error) throw new Error(`${col}: ${r.error.message}`);
    out.push(...(r.documents || []));
    token = r.nextPageToken || '';
  } while (token);
  return out;
}

const result = { project: projectId, takenAt: new Date().toISOString(), by: email, collections: {} };
let total = 0;
for (const col of COLLECTIONS) {
  try {
    const docs = await listAll(col);
    result.collections[col] = docs; total += docs.length;
    console.log(`  ${col.padEnd(16)} ${docs.length}`);
  } catch (e) { console.log(`  ${col.padEnd(16)} OKUNAMADI (${e.message})`); }
}
result.collections.config = [];
for (const id of CONFIG_DOCS) {
  const d = await fetch(`${FS}/config/${id}`, { headers: H }).then((x) => x.json());
  if (!d.error) { result.collections.config.push(d); total++; }
}
console.log(`  ${'config'.padEnd(16)} ${result.collections.config.length}`);

mkdirSync('yedekler', { recursive: true });
const day = new Date().toISOString().slice(0, 10);
let file = `yedekler/${day}-${label}.json`;
for (let i = 2; existsSync(file); i++) file = `yedekler/${day}-${label}-${i}.json`;
writeFileSync(file, JSON.stringify(result));
// Paneldeki "Yedek alma zamanı" hatırlatması için son yedek zamanı.
await fetch(`${FS}/config/backup`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { at: { integerValue: String(Date.now()) } } }) }).catch(() => {});
console.log(`\n✓ ${total} kayıt → ${file}`);
console.log('Dosyayı ara sıra OneDrive → "1401 Playbook Yedek" klasörüne de kopyala.');
