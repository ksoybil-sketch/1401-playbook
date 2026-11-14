/**
 * Sonradan eklenen yönetici hesaplarını açar: Operasyon Müdürü (Semih Dizdar)
 * ve Yönetim Kurulu üyeleri. Demo verisini sıfırlamadan yalnızca bu
 * hesapları ekler; yeniden çalıştırmak güvenlidir (hesap varsa rolünü ve
 * adını günceller).
 *
 *   node scripts/yonetici-hesaplari.mjs --emulator
 *   node scripts/yonetici-hesaplari.mjs --demo        (yalnızca playbook-demo-1401)
 *
 * Canlı sistemde bu betik kullanılmaz: kişileri Kahve Operasyon Direktörü
 * ya da uygulama geliştiricisi panelden (Genel bakış → Kahve Operasyonu
 * ekibi → Ekle) gerçek e-postalarıyla ekler; şifrelerini e-postayla belirlerler.
 */
import { readFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const EMU = args.has('--emulator');
if (!EMU && !args.has('--demo')) { console.error('Hedef: --emulator ya da --demo'); process.exit(1); }

const env = {};
if (!EMU) for (const l of readFileSync('.env.demo', 'utf8').split('\n')) { const m = l.match(/^([\w.]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const projectId = EMU ? 'demo-playbook' : env.VITE_FB_PROJECT_ID;
if (!EMU && projectId !== 'playbook-demo-1401') { console.error('Yalnızca demo projesinde çalışır.'); process.exit(1); }
const FS = EMU ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents` : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const IDT = EMU ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1' : 'https://identitytoolkit.googleapis.com/v1';
const KEY = EMU ? 'emu' : env.VITE_FB_API_KEY;

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());

// Yazan: emülatörde sahip, demoda geliştirici hesabı (kurallar kurul rolünü yalnızca ona verdirir).
let token = 'owner';
if (!EMU) {
  // Geliştirici şifresi seed.mjs'teki TEST.staff satırından okunur (seed.mjs içe aktarılmaz: çalışırdı).
  const pw = readFileSync('scripts/seed.mjs', 'utf8').match(/staff:\s*\{\s*email:\s*'[^']+',\s*password:\s*'([^']+)'/)[1];
  const r = await post(`${IDT}/accounts:signInWithPassword?key=${KEY}`, { email: env.VITE_DEMO_EMAIL, password: pw, returnSecureToken: true });
  if (!r.idToken) throw new Error('Geliştirici girişi olmadı: ' + JSON.stringify(r.error));
  token = r.idToken;
}

// seed.mjs TEST.staffExtra ile aynı (emülatör kurulumu oradan açar).
const board = [
  { email: 'semihdizdar@1401coffee.com', password: '351925', name: 'Semih Dizdar', role: 'opsmanager' },
  { email: 'ogunturanli@1401coffee.com', password: '351925', name: 'Ogün Turanlı', role: 'board' },
  { email: 'bulentozgurkilic@1401coffee.com', password: '351925', name: 'Bülent Özgür Kılıç', role: 'board' },
  { email: 'alpbasar@1401coffee.com', password: '351925', name: 'R. Alp Başar', role: 'board' }
];
const now = Date.now();
for (const m of board) {
  let acc = await post(`${IDT}/accounts:signUp?key=${KEY}`, { email: m.email, password: m.password, returnSecureToken: true });
  if (!acc.localId) acc = await post(`${IDT}/accounts:signInWithPassword?key=${KEY}`, { email: m.email, password: m.password, returnSecureToken: true });
  if (!acc.localId) throw new Error(`${m.email} açılamadı: ${JSON.stringify(acc.error)}`);
  const fields = { role: { stringValue: m.role }, name: { stringValue: m.name }, email: { stringValue: m.email }, active: { booleanValue: true }, createdAt: { integerValue: String(now) } };
  const res = await fetch(`${FS}/users/${acc.localId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`${m.email} rolü yazılamadı: ${res.status} ${await res.text()}`);
  console.log(`  ${m.role}: ${m.name} · ${m.email}`);
}
console.log('Hazır.');
