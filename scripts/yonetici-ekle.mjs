/**
 * Kahve Operasyonu ekibine tek bir yönetici ekler (canlı ya da demo).
 *
 *   npm run yonetici-ekle -- --email cenkgirginol@1401coffee.com --ad "Cenk Girginol" --rol director
 *   npm run yonetici-ekle -- --demo --email ... --ad ... --rol opsmanager
 *
 * Normal yol panel: Genel bakış → Kahve Operasyonu ekibi → Ekle. Orada
 * uygulama geçici şifreyi kendisi üretir. Bu betik, geçici şifrenin önceden
 * kararlaştırıldığı durumlar için var.
 *
 * Şifreler komut satırına YAZILMAZ: ikisi de sorulur ve ekranda görünmez
 * (kabuk geçmişine düşmesin). Betik önce ne yapacağını yazar, onay ister.
 *
 * Açılan hesap ilk girişte şifresini değiştirmek zorundadır
 * (users/{uid}.mustChangePassword = true → App.tsx zorunlu şifre ekranı).
 */
import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const DEMO = has('--demo');

const ROLLER = {
  director: 'Kahve Operasyon Direktörü',
  opsmanager: 'Operasyon Müdürü',
  regional: 'Bölge Müdürü',
  marketing: 'Pazarlama & Kreatif',
  board: 'Yönetim Kurulu üyesi'
};

const email = (val('--email') || '').trim().toLowerCase();
const ad = (val('--ad') || '').trim();
const rol = (val('--rol') || '').trim();
if (!email || !ad || !rol) {
  console.error('Kullanım: npm run yonetici-ekle -- --email <e-posta> --ad "<Ad Soyad>" --rol <director|opsmanager|regional|marketing|board> [--demo]');
  process.exit(1);
}
if (!ROLLER[rol]) {
  console.error(`Bilinmeyen rol: ${rol}. Seçenekler: ${Object.keys(ROLLER).join(', ')}.`);
  console.error('Not: uygulama geliştiricisi (developer) bu yolla eklenmez.');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('E-posta geçersiz görünüyor:', email); process.exit(1); }

const envFile = DEMO ? '.env.demo' : '.env.production';
if (!existsSync(envFile)) { console.error(`${envFile} yok.`); process.exit(1); }
const env = {};
for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const projectId = env.VITE_FB_PROJECT_ID;
const beklenen = DEMO ? 'playbook-demo-1401' : 'playbook-1401';
if (projectId !== beklenen) { console.error(`Beklenmeyen proje: ${projectId} (beklenen ${beklenen}).`); process.exit(1); }

const FS = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const IDT = `https://identitytoolkit.googleapis.com/v1`;
const KEY = env.VITE_FB_API_KEY;

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

/* ---------------- Ne yapılacak ---------------- */

console.log(`\nHedef    : ${DEMO ? 'DEMO' : 'CANLI'} (${projectId})`);
console.log(`Eklenecek: ${ad} <${email}>`);
console.log(`Rol      : ${ROLLER[rol]}`);
console.log('Şifre    : geçici; kişi ilk girişte kendisi değiştirecek.\n');
if ((await ask('Devam edilsin mi? (evet/hayır): ')).toLowerCase() !== 'evet') { console.log('Vazgeçildi, hiçbir şey yazılmadı.'); process.exit(0); }

/* ---------------- Geliştirici girişi ---------------- */

// Demoda geliştirici girişi sabittir (scripts/seed.mjs içindeki deneme hesabı),
// diğer betiklerdeki gibi sorulmaz. Canlıda her zaman sorulur.
let devEmail, devPass;
if (DEMO) {
  devEmail = env.VITE_DEMO_EMAIL;
  devPass = readFileSync('scripts/seed.mjs', 'utf8').match(/staff:\s*\{\s*email:\s*'[^']+',\s*password:\s*'([^']+)'/)[1];
  console.log(`\nDemo geliştirici hesabıyla giriliyor: ${devEmail}`);
} else {
  devEmail = val('--gelistirici') || await ask('\nGeliştirici e-postası: ');
  devPass = await ask('Geliştirici şifresi (görünmez): ', true);
}
const dev = await fetch(`${IDT}/accounts:signInWithPassword?key=${KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: devEmail, password: devPass, returnSecureToken: true })
}).then((x) => x.json());
if (!dev.idToken) { console.error('Giriş başarısız:', dev.error?.message || dev); process.exit(1); }
const H = { Authorization: `Bearer ${dev.idToken}`, 'Content-Type': 'application/json' };

/* ---------------- Yeni hesabın geçici şifresi ---------------- */

let temp;
if (DEMO && val('--gecici')) {
  temp = val('--gecici'); // yalnızca demoda, betiği denemek için
} else {
  temp = await ask(`\n${ad} için geçici şifre (görünmez, en az 6 hane): `, true);
  const temp2 = await ask('Aynı şifreyi bir kez daha (görünmez): ', true);
  if (temp !== temp2) { console.error('İki şifre aynı değil. Hiçbir şey yazılmadı.'); process.exit(1); }
}
if (temp.length < 6) { console.error('Şifre en az 6 karakter olmalı (Firebase kuralı).'); process.exit(1); }

/* ---------------- Hesap ---------------- */

const yeni = await fetch(`${IDT}/accounts:signUp?key=${KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: temp, returnSecureToken: false })
}).then((x) => x.json());
if (!yeni.localId) {
  const kod = yeni.error?.message || '';
  if (kod.startsWith('EMAIL_EXISTS')) {
    console.error(`\nBu e-postayla zaten bir hesap var: ${email}`);
    console.error('Bir hesabın tek rolü olur. Kişi ekipteyse rolünü panelden (Ekip ekranı) değiştir;');
    console.error('şifresini unuttuysa giriş ekranındaki "Şifremi unuttum" kullanılır.');
  } else {
    console.error('\nHesap açılamadı:', kod || yeni);
  }
  process.exit(1);
}
const uid = yeni.localId;

/* ---------------- Rol belgesi ---------------- */

const alanlar = {
  role: { stringValue: rol },
  name: { stringValue: ad },
  email: { stringValue: email },
  active: { booleanValue: true },
  mustChangePassword: { booleanValue: true },
  createdAt: { integerValue: String(Date.now()) }
};
const yaz = await fetch(`${FS}/users/${uid}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: alanlar }) })
  .then((x) => x.json());
if (yaz.error) {
  console.error('\nRol belgesi yazılamadı:', yaz.error.message);
  console.error(`Auth hesabı açıldı ama rolü yok (uid ${uid}): bu hâliyle giriş yapamaz.`);
  console.error('Panelden aynı e-postayla eklemeyi dene ya da bu uid için rolü elle yaz.');
  process.exit(1);
}

/* ---------------- Doğrulama ---------------- */

const kontrol = await fetch(`${FS}/users/${uid}`, { headers: H }).then((x) => x.json());
const f = kontrol.fields || {};
console.log('\n✓ Hesap açıldı ve rolü yazıldı.');
console.log(`  ${f.name?.stringValue} <${f.email?.stringValue}>`);
console.log(`  Rol: ${ROLLER[f.role?.stringValue] || f.role?.stringValue}`);
console.log(`  İlk girişte şifre değiştirme zorunlu: ${f.mustChangePassword?.booleanValue === true ? 'evet' : 'HAYIR (beklenmedik)'}`);
console.log(`\nGiriş adresi: ${DEMO ? 'https://playbook-demo-1401.web.app' : 'https://1401-campus.web.app'}/#/yonetici-girisi`);
console.log('Geçici şifreyi kişiye kendin ilet (uygulama e-posta göndermez).');
console.log('İlk girişte kendi şifresini belirlemeden panele geçemez.\n');
