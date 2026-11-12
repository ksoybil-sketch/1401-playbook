/**
 * Demo kaydını okunur bir rapora çevirir: kim girdi, hangi ekranlara baktı,
 * ne değiştirdi. Kayıtları uygulama (src/demo/log.ts) yazar.
 *
 *   npm run demo:kayit                    (bugün)
 *   npm run demo:kayit -- --gun 2026-11-12
 *   npm run demo:kayit -- --gun 7          (son 7 gün)
 *   node scripts/demo-log.mjs --emulator   (yerel emülatör)
 *
 * Rapor demo-kayitlari/<tarih>.md dosyasına yazılır (git'e girmez) ve
 * özeti ekrana basılır. Okumak için uygulama geliştiricisi hesabıyla
 * girilir; şifre scripts/seed.mjs'teki test hesabından alınır.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const argVal = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const EMULATOR = argv.includes('--emulator');

if (!EMULATOR && existsSync('.env.demo')) {
  for (const line of readFileSync('.env.demo', 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const projectId = EMULATOR ? 'demo-playbook' : process.env.VITE_FB_PROJECT_ID;
if (!EMULATOR && projectId !== 'playbook-demo-1401') {
  console.error('Demo kaydı yalnızca playbook-demo-1401 projesinden okunur.');
  process.exit(1);
}
const base = EMULATOR
  ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// Tarih aralığı
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const gun = argVal('--gun');
let from, to, name;
if (gun && /^\d+$/.test(gun)) {
  from = startOfDay(Date.now()) - (Number(gun) - 1) * 86400000; to = Date.now() + 1; name = `son-${gun}-gun`;
} else {
  const day = gun ? new Date(gun + 'T00:00:00') : new Date();
  from = startOfDay(day); to = from + 86400000; name = new Date(from).toLocaleDateString('sv-SE');
}

// Kimlik
let token = 'owner';
if (!EMULATOR) {
  const seed = readFileSync('scripts/seed.mjs', 'utf8');
  const email = argVal('--email') || process.env.VITE_DEMO_EMAIL;
  const password = argVal('--password') || seed.match(/staff:\s*\{\s*email:\s*'[^']+',\s*password:\s*'([^']+)'/)?.[1];
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.VITE_FB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  }).then((x) => x.json());
  if (!r.idToken) { console.error('Giriş başarısız:', r.error?.message || r); process.exit(1); }
  token = r.idToken;
}

const unwrap = (v) => {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  return null;
};

const res = await fetch(`${base}:runQuery`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: 'demoLog' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(from) } } },
        { fieldFilter: { field: { fieldPath: 'at' }, op: 'LESS_THAN', value: { integerValue: String(to) } } }
      ] } },
      orderBy: [{ field: { fieldPath: 'at' }, direction: 'ASCENDING' }],
      limit: 10000
    }
  })
});
if (!res.ok) { console.error('Okunamadı:', res.status, await res.text()); process.exit(1); }
const rows = (await res.json()).filter((x) => x.document).map((x) =>
  Object.fromEntries(Object.entries(x.document.fields).map(([k, v]) => [k, unwrap(v)])));

const hhmm = (ms) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const day = (ms) => new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });

// Kişi kişi
const people = new Map();
for (const r of rows) {
  const p = people.get(r.who) || { who: r.who, role: r.role, rows: [], devices: new Set(), tabs: new Set() };
  p.rows.push(r); p.devices.add(r.device); p.tabs.add(r.sid);
  people.set(r.who, p);
}

const out = [];
out.push(`# Demo kaydı — ${gun && /^\d+$/.test(gun) ? `son ${gun} gün` : day(from)}`, '');
if (!rows.length) out.push('Bu aralıkta kimse demoyu kullanmamış.');
out.push(`${people.size} kişi/hesap · ${rows.filter((r) => r.kind === 'sayfa').length} ekran açılışı · ${rows.filter((r) => r.kind === 'değişiklik').length} değişiklik`, '');

for (const p of people.values()) {
  const views = p.rows.filter((r) => r.kind === 'sayfa');
  const changes = p.rows.filter((r) => r.kind === 'değişiklik');
  const first = p.rows[0].at, last = p.rows[p.rows.length - 1].at;
  out.push(`## ${p.who} — ${p.role}`, '');
  out.push(`${hhmm(first)}–${hhmm(last)} · ${[...p.devices].join(', ')} · ${p.tabs.size} ayrı oturum · ${views.length} ekran · ${changes.length} değişiklik`, '');
  // En çok açılan ekranlar
  const count = {};
  for (const v of views) count[v.label] = (count[v.label] || 0) + 1;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1]);
  if (top.length) out.push('**Baktığı ekranlar:** ' + top.map(([l, n]) => (n > 1 ? `${l} (${n})` : l)).join(', '), '');
  if (changes.length) {
    out.push('**Yaptığı değişiklikler:**', '');
    for (const c of changes) {
      let d = c.detail || '';
      if (d.length > 400) d = d.slice(0, 400) + '…';
      out.push(`- ${hhmm(c.at)} · **${c.label} · ${c.op}** \`${c.path}\`${d ? `\n  \`${d.replace(/`/g, "'")}\`` : ''}`);
    }
    out.push('');
  }
  out.push('<details><summary>Adım adım</summary>', '');
  for (const r of p.rows) {
    const what = r.kind === 'oturum' ? `Giriş (${r.device})` : r.kind === 'sayfa' ? `→ ${r.label}` : `✎ ${r.label} · ${r.op} (${r.path})`;
    out.push(`- ${hhmm(r.at)} ${what}`);
  }
  out.push('', '</details>', '');
}

mkdirSync('demo-kayitlari', { recursive: true });
const file = `demo-kayitlari/${EMULATOR ? 'emulator-' : ''}${name}.md`;
writeFileSync(file, out.join('\n'));
console.log(out.join('\n').replace(/<details>[\s\S]*?<\/details>\n?/g, '').replace(/\n{3,}/g, '\n\n'));
console.log(`\nAyrıntılı rapor: ${file}`);
