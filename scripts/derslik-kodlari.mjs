/**
 * Her mağaza için "evde ders çalış" kodu üretir ve dağıtılacak listeyi yazar.
 *
 *   npm run derslik-kodlari              canlı (e-posta ve şifre sorar)
 *   npm run derslik-kodlari -- --demo    demo (şifre sormaz)
 *   npm run derslik-kodlari -- --yenile  var olan kodları da yeniler
 *
 * Varsayılan davranış: kodu olmayan mağazalara kod üretir, olanların
 * kodunu olduğu gibi listeler. Yeniden çalıştırmak güvenlidir.
 * --yenile her mağazaya YENİ kod verir; eski kodlar geçersizleşir.
 *
 * Panelde de aynı iş yapılabilir (mağaza sayfası → "Derslik kodu"); bu
 * betik 12 mağazayı tek seferde halletmek için.
 *
 * Kod ne işe yarar: barista kendi telefonunda 1401 Campus'u açar, bu kodu
 * girer, adını seçip PIN'ini girer ve YALNIZCA dersleri + reçeteleri görür.
 * Sınav, bülten, ekip ve talepler mağaza telefonunda kalır.
 *
 * Liste derslik-kodlari/<tarih>.md dosyasına yazılır (git'e girmez).
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const DEMO = has('--demo');
const YENILE = has('--yenile');

const envFile = DEMO ? '.env.demo' : '.env.production';
if (!existsSync(envFile)) { console.error(`${envFile} yok.`); process.exit(1); }
const env = {};
for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const projectId = env.VITE_FB_PROJECT_ID;
const beklenen = DEMO ? 'playbook-demo-1401' : 'playbook-1401';
if (projectId !== beklenen) { console.error(`Beklenmeyen proje: ${projectId}`); process.exit(1); }

const FS = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const IDT = 'https://identitytoolkit.googleapis.com/v1';
const KEY = env.VITE_FB_API_KEY;
/** src/api/backend.ts ACCOUNT_DOMAIN ile aynı olmalı. */
const ACCOUNT_DOMAIN = 'hesap.playbook1401.app';

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
const giris = await fetch(`${IDT}/accounts:signInWithPassword?key=${KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, returnSecureToken: true })
}).then((x) => x.json());
if (!giris.idToken) { console.error('Giriş başarısız:', giris.error?.message || giris); process.exit(1); }
const H = { Authorization: `Bearer ${giris.idToken}`, 'Content-Type': 'application/json' };

/* ---------------- Okuma ---------------- */

const unwrap = (v) => {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  return null;
};
const shape = (d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, unwrap(v)])) });
async function listAll(col) {
  const out = []; let page = '';
  do {
    const r = await fetch(`${FS}/${col}?pageSize=300${page ? `&pageToken=${page}` : ''}`, { headers: H }).then((x) => x.json());
    if (r.error) { console.error(`${col} okunamadı: ${r.error.message}`); process.exit(1); }
    out.push(...(r.documents || []).map(shape));
    page = r.nextPageToken || '';
  } while (page);
  return out;
}

const stores = (await listAll('stores')).filter((s) => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
const mevcut = await listAll('derslikKodlari');
if (!stores.length) { console.error('Aktif mağaza yok.'); process.exit(1); }

/* ---------------- Kod üretimi ---------------- */

const rastgele = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const jeton = (n) => Array.from({ length: n }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');

/** Eşleştirme ve derslik kodlarına karşı benzersiz (ikisi aynı kutuya giriliyor). */
async function benzersizKod(kullanilan) {
  for (let i = 0; i < 12; i++) {
    const kod = rastgele(6);
    if (kullanilan.has(kod)) continue;
    const esl = await fetch(`${FS}/pairingCodes/${kod}`, { headers: H }).then((x) => x.json());
    const der = await fetch(`${FS}/derslikKodlari/${kod}`, { headers: H }).then((x) => x.json());
    if (esl.error && der.error) { kullanilan.add(kod); return kod; }
  }
  throw new Error('Kod üretilemedi, tekrar dene.');
}

const kullanilan = new Set(mevcut.map((d) => d.id));
const sonuc = [];
let yeni = 0;

for (const store of stores) {
  const eskiler = mevcut.filter((d) => d.storeId === store.id);
  if (eskiler.length && !YENILE) {
    sonuc.push({ magaza: store.name, kod: eskiler[0].id, durum: 'vardı' });
    continue;
  }
  const kod = await benzersizKod(kullanilan);
  const hesapEposta = `derslik-${store.id}-${jeton(6)}@${ACCOUNT_DOMAIN}`;
  const hesapSifre = jeton(28);
  const hesap = await fetch(`${IDT}/accounts:signUp?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: hesapEposta, password: hesapSifre, returnSecureToken: false })
  }).then((x) => x.json());
  if (!hesap.localId) { console.error(`${store.name}: hesap açılamadı — ${hesap.error?.message || ''}`); continue; }
  const now = Date.now();
  const yaz = await fetch(`${FS}/users/${hesap.localId}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ fields: {
      role: { stringValue: 'derslik' }, storeId: { stringValue: store.id }, active: { booleanValue: true },
      label: { stringValue: 'Derslik girişi' }, createdAt: { integerValue: String(now) }
    } })
  }).then((x) => x.json());
  if (yaz.error) { console.error(`${store.name}: rol yazılamadı — ${yaz.error.message}`); continue; }
  const kodYaz = await fetch(`${FS}/derslikKodlari/${kod}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ fields: {
      code: { stringValue: kod }, storeId: { stringValue: store.id }, storeName: { stringValue: store.name },
      uid: { stringValue: hesap.localId }, email: { stringValue: hesapEposta }, password: { stringValue: hesapSifre },
      createdAt: { integerValue: String(now) }, createdByName: { stringValue: 'Uygulama geliştiricisi' }
    } })
  }).then((x) => x.json());
  if (kodYaz.error) { console.error(`${store.name}: kod yazılamadı — ${kodYaz.error.message}`); continue; }
  // Eski kod ve hesabı geçersiz.
  for (const eski of eskiler) {
    await fetch(`${FS}/derslikKodlari/${eski.id}`, { method: 'DELETE', headers: H }).catch(() => {});
    if (eski.uid) {
      await fetch(`${FS}/users/${eski.uid}?updateMask.fieldPaths=active`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ fields: { active: { booleanValue: false } } })
      }).catch(() => {});
    }
  }
  sonuc.push({ magaza: store.name, kod, durum: eskiler.length ? 'yenilendi' : 'yeni' });
  yeni++;
}

/* ---------------- Liste ---------------- */

const adres = DEMO ? 'https://playbook-demo-1401.web.app' : 'https://1401-campus.web.app';
const bugun = new Date().toLocaleDateString('sv-SE');
const out = [];
out.push(`# Evde ders çalışma kodları · ${DEMO ? 'demo' : 'canlı'}`, '');
out.push(`${bugun} · ${sonuc.length} mağaza`, '');
out.push('| Mağaza | Kod |', '|---|---|');
for (const r of sonuc) out.push(`| ${r.magaza} | **${r.kod}** |`);
out.push('', '## Ekibe iletilecek metin', '');
out.push('> Evde ders çalışmak için telefonundan şu adresi aç:', `> ${adres}`, '>',
  '> Mağazanın kodunu gir, listeden adını seç, PIN\'ini gir.',
  '> Dersleri ve reçeteleri görürsün. Sınavlar mağaza telefonunda.', '');
out.push('## Notlar', '');
out.push('- Kodun süresi yok; mağazanın kodu herkeste aynı.');
out.push('- Kod sızarsa panelden (mağaza sayfası → "Derslik kodu") ya da `npm run derslik-kodlari -- --yenile` ile yenilenir; eskisi anında geçersiz olur.');
out.push('- Kod tek başına kimsenin dersine erişim vermez: barista kendi PIN\'iyle girer.');
out.push('- Evde sınav olmaz; sınav yalnızca mağaza telefonunda verilir.');

mkdirSync('derslik-kodlari', { recursive: true });
const dosya = `derslik-kodlari/${bugun}-${DEMO ? 'demo' : 'canli'}.md`;
writeFileSync(dosya, out.join('\n') + '\n');

console.log('');
for (const r of sonuc) console.log(`  ${r.magaza.padEnd(28)} ${r.kod}  ${r.durum === 'vardı' ? '(zaten vardı)' : r.durum === 'yenilendi' ? '(yenilendi)' : ''}`);
console.log(`\n${sonuc.length} mağaza · ${yeni} kod üretildi.`);
console.log(`Liste: ${dosya}\n`);
