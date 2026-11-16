/**
 * Kaldırılan roller ('admin' = "Tam yetkili", 'ops' = "Kahve Operasyonu")
 * için tek seferlik düzeltme (sürüm 1.3.0).
 *
 *   node scripts/rol-duzelt.mjs --demo     (geliştiricinin demo hesabıyla)
 *   node scripts/rol-duzelt.mjs --canli    (e-posta ve şifreni sorar; şifre görünmez)
 *
 * Ne yapar:
 *   - Giriş yapan hesabın rolü 'admin' ise 'developer' yapar. İlk kurulum
 *     ekranı eskiden ilk hesabı 'admin' açıyordu; demo içerik betiği de her
 *     çalışmada geliştiriciyi 'admin'e çeviriyordu.
 *   - 'ops' ya da 'admin' rolünde başka hesap varsa adını ve rolünü yazar,
 *     hiçbir şeyi değiştirmez (yeni rolü Direktör Ekip ekranından seçer).
 *
 * Yeni kurallar dağıtılmadan ÖNCE çalıştırılmalı: yeni kurallarda 'admin'
 * rolü hiçbir şey okuyamaz, kendi rolünü de değiştiremez.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const args = new Set(process.argv.slice(2));
const DEMO = args.has('--demo');
if (!DEMO && !args.has('--canli')) { console.error('Hedef: --demo ya da --canli'); process.exit(1); }

const env = {};
for (const l of readFileSync(DEMO ? '.env.demo' : '.env.production', 'utf8').split('\n')) { const m = l.match(/^([\w.]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const projectId = env.VITE_FB_PROJECT_ID;
if (projectId !== (DEMO ? 'playbook-demo-1401' : 'playbook-1401')) { console.error('Beklenmeyen proje:', projectId); process.exit(1); }

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}

let email, password;
if (DEMO) {
  email = env.VITE_DEMO_EMAIL;
  // Demo geliştirici şifresi seed.mjs'teki TEST.staff satırında (yalnızca demo).
  password = readFileSync('scripts/seed.mjs', 'utf8').match(/staff:\s*\{\s*email:\s*'[^']+',\s*password:\s*'([^']+)'/)[1];
} else {
  email = await ask('Geliştirici e-postası: ');
  password = await ask('Şifre (görünmez): ', true);
}

const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.VITE_FB_API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
}).then((x) => x.json());
if (!auth.idToken) { console.error('Giriş başarısız:', auth.error?.message || auth); process.exit(1); }

const FS = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const H = { Authorization: `Bearer ${auth.idToken}`, 'Content-Type': 'application/json' };

const me = await fetch(`${FS}/users/${auth.localId}`, { headers: H }).then((x) => x.json());
const myRole = me.fields?.role?.stringValue;
console.log(`Hesabın: ${me.fields?.name?.stringValue || email} · rol: ${myRole}`);

// Kaldırılan rollerde kim var (yalnızca okunur).
const q = await fetch(`${FS}:runQuery`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'IN', value: { arrayValue: { values: [{ stringValue: 'ops' }, { stringValue: 'admin' }] } } } } } })
}).then((x) => x.json());
const others = (Array.isArray(q) ? q : []).filter((d) => d.document && !d.document.name.endsWith(`/${auth.localId}`));
if (!Array.isArray(q)) console.log('Liste okunamadı:', q.error?.message || q);
else if (!others.length) console.log('Başka "Tam yetkili" ya da "Kahve Operasyonu" hesabı yok.');
else for (const d of others) {
  const f = d.document.fields;
  console.log(`  Yeni rol seçilmeli: ${f.name?.stringValue || '(adsız)'} · ${f.role.stringValue} · ${f.active?.booleanValue === false ? 'pasif' : 'etkin'}`);
}

if (myRole === 'admin') {
  const r = await fetch(`${FS}/users/${auth.localId}?updateMask.fieldPaths=role`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ fields: { role: { stringValue: 'developer' } } })
  }).then((x) => x.json());
  if (r.error) { console.error('Rol değişmedi:', r.error.message); process.exit(1); }
  console.log('✓ Rolün "Uygulama geliştiricisi" yapıldı.');
} else if (myRole === 'developer') {
  console.log('✓ Rolün zaten "Uygulama geliştiricisi".');
} else {
  console.log('Bu hesap geliştirici değil; değişiklik yapılmadı.');
}
