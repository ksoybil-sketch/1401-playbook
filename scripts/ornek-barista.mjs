/**
 * Her şeyi tamamlamış örnek barista: Gürsel Aksel (Moda Cadde, PIN 1925).
 * Bütün dersler bitmiş, bütün modüller %100, 18 başarımın hepsi, Pro önlük
 * rozeti teslim edilmiş, bütün temalar açık. Uygulamanın "en dolu" hâlini
 * görmek ve denemek için.
 *
 *   node scripts/ornek-barista.mjs --emulator
 *   node scripts/ornek-barista.mjs --demo        (yalnızca playbook-demo-1401)
 *
 * Yeniden çalıştırmak güvenli: aynı kayıtların üzerine yazar. Dersler ve
 * modüller hedef veritabanından okunur; panelde eklenen yeni ürünler ve
 * mini sınavları da tamamlanmış sayılır.
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

const B = { id: 'demo-gursel', name: 'Gürsel Aksel', storeId: 'moda-cadde', role: 'barista', pin: '1925', startedAt: '2025-06-02' };
const email = `b-${B.id}-1@hesap.playbook1401.app`;
const password = `pb-${B.id}-${B.pin}`;               // src/api/backend.ts pinPassword ile aynı
const DAY = 86400000, now = Date.now();

// --- Kimlik: emülatörde sahip, demoda geliştirici hesabı --------------------
let token = 'owner';
if (!EMU) {
  const seed = readFileSync('scripts/seed.mjs', 'utf8');
  const pw = seed.match(/staff:\s*\{\s*email:\s*'[^']+',\s*password:\s*'([^']+)'/)[1];
  const r = await post(`${IDT}/accounts:signInWithPassword?key=${KEY}`, { email: env.VITE_DEMO_EMAIL, password: pw, returnSecureToken: true });
  if (!r.idToken) throw new Error('Geliştirici girişi olmadı: ' + JSON.stringify(r.error));
  token = r.idToken;
}

async function post(url, body, auth) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) }).then((x) => x.json());
}
const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
};
const unval = (v) => v.stringValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue ?? v.booleanValue ?? (v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, unval(x)])) : v.arrayValue ? (v.arrayValue.values || []).map(unval) : null));
async function list(col) {
  const out = []; let page = '';
  do {
    const r = await fetch(`${FS}/${col}?pageSize=300${page ? `&pageToken=${page}` : ''}`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json());
    (r.documents || []).forEach((d) => out.push({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, unval(x)])) }));
    page = r.nextPageToken || '';
  } while (page);
  return out;
}
async function commit(writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const res = await fetch(`${FS.replace('/documents', '/documents:commit')}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: writes.slice(i, i + 400) }) });
    if (!res.ok) throw new Error(`Yazılamadı: ${res.status} ${await res.text()}`);
  }
}
const set = (path, data) => ({ update: { name: `projects/${projectId}/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, val(v)])) } });

// --- Hesap ------------------------------------------------------------------
let acc = await post(`${IDT}/accounts:signUp?key=${KEY}`, { email, password, returnSecureToken: true });
if (!acc.localId) acc = await post(`${IDT}/accounts:signInWithPassword?key=${KEY}`, { email, password, returnSecureToken: true });
if (!acc.localId) throw new Error(`Barista hesabı açılamadı (${email}): ${JSON.stringify(acc.error)}. PIN değiştirildiyse eski PIN ile girilemez.`);
const uid = acc.localId;

// --- İçerik -------------------------------------------------------------------
const modules = (await list('modules')).filter((m) => m.published !== false);
const pubMods = new Set(modules.map((m) => m.id));
const lessons = (await list('lessons')).filter((l) => l.published !== false && pubMods.has(l.moduleId));
const assignments = (await list('assignments')).filter((a) => a.storeId === B.storeId && (!a.baristaId || a.baristaId === B.id));

// Ders tamamlamaları son 6 haftaya yayılır (İstikrar başarımı).
const lessonDone = Object.fromEntries(lessons.map((l, i) => [l.id, now - (40 - (i % 40)) * DAY + i * 60000]));
const order = [...modules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// Sınav geçmişi (kronolojik): önce her modül ilk seferde (çoğu %100),
// biri hızlı bitirilmiş; sonra bir modülde iki kez kalıp yeniden geçiş (Azim).
const attempts = [];
let t = now - 38 * DAY;
order.forEach((m, i) => {
  const total = m.examSize || 10;
  const score = i % 4 === 3 ? 95 : 100;
  const fast = i === 1;                                     // Hızlı ve Doğru
  const start = t;
  attempts.push({ m, total, score, passed: true, startedAt: start, submittedAt: start + (fast ? total * 30000 : total * 70000) });
  t += 2 * DAY + 3600000;
});
const azim = order[order.length - 1];
for (const score of [60, 70]) { attempts.push({ m: azim, total: azim.examSize || 10, score, passed: false, startedAt: t, submittedAt: t + 600000 }); t += DAY; }
attempts.push({ m: azim, total: azim.examSize || 10, score: 100, passed: true, startedAt: t, submittedAt: t + 500000 });

const best = Object.fromEntries(order.map((m) => [m.id, { score: 100, passedAt: attempts.find((a) => a.m.id === m.id && a.passed).submittedAt }]));
const quizzes = Object.fromEntries(lessons.filter((l) => l.quiz).map((l) => [l.id, { score: 100, passedAt: now - 2 * DAY }]));

const writes = [
  set(`users/${uid}`, { role: B.role, baristaId: B.id, storeId: B.storeId, active: true, createdAt: now }),
  set(`baristas/${B.id}`, {
    name: B.name, storeId: B.storeId, role: B.role, phone: '', active: true, uid, authEmail: email, accountSeq: 1, pinPending: false,
    startedAt: B.startedAt, createdAt: new Date(B.startedAt).getTime(),
    apronBadge: 'pro', apronBadgeAt: now - 5 * DAY, apronBadgeByName: 'Cenk Girginol'
  }),
  set(`progress/${B.id}`, { baristaId: B.id, storeId: B.storeId, lessons: lessonDone, modules: best, quizzes, bulletins: {}, updatedAt: now }),
  ...attempts.map((a, i) => set(`attempts/${B.id}-${String(i).padStart(2, '0')}`, {
    baristaId: B.id, baristaName: B.name, storeId: B.storeId, moduleId: a.m.id, moduleTitle: a.m.title,
    startedAt: a.startedAt, submittedAt: a.submittedAt, deadline: a.startedAt + a.total * 90000,
    total: a.total, correct: Math.round(a.total * a.score / 100), score: a.score, passed: a.passed, passScore: a.m.passScore || 80,
    mistakes: [], questionIds: [], answers: {}, timedOut: false
  })),
  // Sözünün Eri: kendisine atanmış, zamanında bitirdiği 5 görev.
  ...order.slice(0, 5).map((m, i) => set(`assignments/${B.id}-gorev-${i}`, {
    kind: 'module', targetId: m.id, title: `${m.title} sınavını geç`, note: 'Örnek görev', storeId: B.storeId, baristaId: B.id,
    dueAt: best[m.id].passedAt + 3 * DAY, createdAt: best[m.id].passedAt - 3 * DAY, createdBy: 'ornek', createdByName: 'Uğur Can Gürbüz'
  }))
];
await commit(writes);

const lateRisk = assignments.filter((a) => a.dueAt && a.dueAt < now && a.kind === 'lesson' && !lessonDone[a.targetId]).length;
console.log(`${B.name} hazır (${EMU ? 'emülatör' : 'demo'}): ${lessons.length} ders, ${order.length} modül, ${attempts.length} sınav, ${Object.keys(quizzes).length} mini sınav, Pro rozet.`);
console.log(`Giriş: Moda Cadde telefonu → ${B.name} → PIN ${B.pin}${lateRisk ? ` · uyarı: ${lateRisk} gecikmiş görev` : ''}`);
