/**
 * Yayın sonrası hata düzeltme süreci: canlıdaki geri bildirimleri ve
 * otomatik hata kayıtlarını okunur bir rapora çevirir.
 *
 *   npm run geri-bildirim                 (canlı, son 7 gün)
 *   npm run geri-bildirim -- --gun 1      (son 1 gün)
 *   npm run geri-bildirim -- --demo       (demo projesi)
 *   node scripts/geri-bildirim.mjs --emulator
 *
 * Rapor geri-bildirimler/<tarih>.md dosyasına yazılır (git'e girmez).
 * Bir Claude oturumu bu dosyayı okuyup düzeltmeye geçebilir.
 *
 * Okumak için uygulama geliştiricisi hesabıyla girilir. Canlıda şifre
 * hiçbir dosyada tutulmaz: komut sorar, sen yazarsın (ekranda görünmez).
 * E-posta --email ile verilebilir; verilmezse sorulur.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const argv = process.argv.slice(2);
const argVal = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const EMULATOR = argv.includes('--emulator');
const DEMO = argv.includes('--demo');

const envFile = DEMO ? '.env.demo' : '.env.production';
if (!EMULATOR && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const projectId = EMULATOR ? 'demo-playbook' : process.env.VITE_FB_PROJECT_ID;
const base = EMULATOR
  ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const days = Number(argVal('--gun') || 7);
const from = Date.now() - days * 86400000;

/* ---------------- Kimlik ---------------- */

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Yazılanı ekrana basma.
      rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    }
    rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}

let token = 'owner';
if (!EMULATOR) {
  const email = argVal('--email') || await ask('Geliştirici e-postası: ');
  const password = await ask('Şifre (görünmez): ', true);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.VITE_FB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  }).then((x) => x.json());
  if (!r.idToken) { console.error('Giriş başarısız:', r.error?.message || r); process.exit(1); }
  token = r.idToken;
}

/* ---------------- Okuma ---------------- */

const unwrap = (v) => {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  return null;
};

async function since(collectionId) {
  const res = await fetch(`${base}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(from) } } },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: 2000
      }
    })
  });
  if (!res.ok) { console.error(`${collectionId} okunamadı:`, res.status, (await res.text()).slice(0, 300)); process.exit(1); }
  return (await res.json()).filter((x) => x.document).map((x) => ({
    id: x.document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(x.document.fields).map(([k, v]) => [k, unwrap(v)]))
  }));
}

const feedback = await since('feedback');
const errors = await since('hatalar');

/* ---------------- Rapor ---------------- */

const when = (ms) => new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const KIND = { hata: 'Bir şey çalışmıyor', icerik: 'İçerikte yanlış', oneri: 'Öneri' };
const STATUS = { yeni: 'Yeni', inceleniyor: 'İnceleniyor', cozuldu: 'Çözüldü' };
const one = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const out = [];
const target = EMULATOR ? 'yerel emülatör' : DEMO ? 'demo' : 'canlı';
out.push(`# Geri bildirim ve hata raporu · ${target}`, '');
out.push(`Son ${days} gün · ${new Date().toLocaleString('tr-TR')} · proje \`${projectId}\``, '');

const open = feedback.filter((f) => f.status !== 'cozuldu');
out.push('## Özet', '');
out.push(`- Geri bildirim: ${feedback.length} (açık ${open.length}: ${['hata', 'icerik', 'oneri'].map((k) => `${KIND[k]} ${open.filter((f) => f.kind === k).length}`).join(', ')})`);

// Aynı hata birçok kişide çıkar: mesaj + ilk yığın satırına göre grupla.
const groups = new Map();
for (const e of errors) {
  const key = `${e.message}|${String(e.stack || '').split('\n')[1] || ''}`;
  const g = groups.get(key) || { ...e, count: 0, people: new Set(), paths: new Set(), versions: new Set(), devices: new Set(), last: 0 };
  g.count++; g.people.add(e.byName || '?'); g.paths.add(e.path); g.versions.add(e.version); g.devices.add(e.device);
  g.last = Math.max(g.last, e.createdAt);
  groups.set(key, g);
}
const errGroups = [...groups.values()].sort((a, b) => (b.kind === 'cokme') - (a.kind === 'cokme') || b.count - a.count);
out.push(`- Otomatik hata kaydı: ${errors.length} kayıt, ${errGroups.length} farklı hata (çökme ${errGroups.filter((g) => g.kind === 'cokme').length})`, '');

out.push('## Hatalar (otomatik kayıt)', '');
if (!errGroups.length) out.push('Kayıt yok.', '');
errGroups.forEach((g, i) => {
  out.push(`### H${i + 1}. ${g.kind === 'cokme' ? '[Ekran çöktü] ' : ''}${one(g.message).slice(0, 160)}`);
  out.push(`- ${g.count} kez · ${g.people.size} kişi (${[...g.people].slice(0, 5).join(', ')}) · son ${when(g.last)}`);
  out.push(`- Ekran: ${[...g.paths].slice(0, 5).join(', ')}`);
  out.push(`- Sürüm: ${[...g.versions].join(', ')} · Cihaz: ${[...g.devices].slice(0, 3).join(', ')}`);
  out.push('', '```', String(g.stack || '').split('\n').slice(0, 8).join('\n'), ...(g.extra ? ['—', String(g.extra).split('\n').slice(0, 6).join('\n')] : []), '```', '');
});

for (const k of ['hata', 'icerik', 'oneri']) {
  const list = open.filter((f) => f.kind === k);
  out.push(`## ${KIND[k]} · ${list.length} açık`, '');
  if (!list.length) out.push('Açık bildirim yok.', '');
  list.forEach((f, i) => {
    const tag = k === 'hata' ? 'B' : k === 'icerik' ? 'I' : 'O';
    out.push(`### ${tag}${i + 1}. ${one(f.text).slice(0, 120)}`);
    out.push(`- ${STATUS[f.status] || f.status} · ${when(f.createdAt)} · ${f.byName || '?'} (${f.role || '?'})${f.storeName ? ` · ${f.storeName}` : ''}`);
    out.push(`- Ekran: ${f.path}${f.lessonTitle ? ` · ders: ${f.lessonTitle}` : ''}${f.questionPrompt ? ` · soru: ${one(f.questionPrompt).slice(0, 120)}` : ''}`);
    out.push(`- Cihaz: ${f.device} · Sürüm: ${f.version}${f.imageUrl ? ' · ekran görüntüsü var (panelde)' : ''}`);
    if (f.note) out.push(`- Not: ${one(f.note)}`);
    out.push(`- Kimlik: \`feedback/${f.id}\``);
    if (one(f.text).length > 120) out.push('', `> ${one(f.text)}`);
    out.push('');
  });
}

const solved = feedback.filter((f) => f.status === 'cozuldu');
if (solved.length) {
  out.push(`## Bu dönemde çözülenler · ${solved.length}`, '');
  for (const f of solved) out.push(`- ${KIND[f.kind] || f.kind}: ${one(f.text).slice(0, 100)}${f.note ? ` → ${one(f.note)}` : ''}`);
  out.push('');
}

mkdirSync('geri-bildirimler', { recursive: true });
const file = `geri-bildirimler/${new Date().toLocaleDateString('sv-SE')}-${target.replace(/\s+/g, '-')}.md`;
writeFileSync(file, out.join('\n'));
console.log(`${target}: ${feedback.length} geri bildirim (${open.length} açık), ${errors.length} hata kaydı (${errGroups.length} farklı).`);
console.log(`Rapor: ${file}`);
