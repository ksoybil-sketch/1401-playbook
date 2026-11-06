/**
 * Tek seferlik: demo baristalarının PIN'ini (dolayısıyla Auth şifresini)
 * yenisiyle değiştirir.
 *
 *   node scripts/demo-pin-migrate.mjs
 *
 * Neden gerekli: barista hesabının şifresi PIN'den türetiliyor
 * (pb-<baristaId>-<pin>). PIN değişince hesabın şifresi de değişmeli, yoksa
 * seed betiği o hesaba bir daha giremez. Admin SDK anahtarı olmadığı için
 * her hesap kendi oturumuyla şifresini değiştirir.
 */
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env.demo')) {
  for (const line of readFileSync('.env.demo', 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const apiKey = process.env.VITE_FB_API_KEY;
if (process.env.VITE_FB_PROJECT_ID !== 'playbook-demo-1401') {
  console.error('Bu betik yalnızca demo projesinde çalışır.');
  process.exit(1);
}

const DOMAIN = 'hesap.playbook1401.app';
const pw = (id, pin) => `pb-${id}-${pin}`;
const YENI_PIN = '1925';

/** Değişimden önceki PIN'ler. */
const ESKI = {
  'demo-ayse': '2580', 'demo-mehmet': '1470', 'demo-zeynep': '3690',
  'demo-can': '2468', 'demo-burak': '9512', 'demo-elif': '1357',
  'demo-sude': '7531', 'demo-emir': '8520', 'demo-nisa': '4826'
};

const post = (path, body) =>
  fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${path}?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then((r) => r.json());

for (const [id, eski] of Object.entries(ESKI)) {
  const email = `b-${id}-1@${DOMAIN}`;
  let r = await post('signInWithPassword', { email, password: pw(id, YENI_PIN), returnSecureToken: true });
  if (r.idToken) { console.log(`${id}: zaten yeni PIN`); continue; }

  r = await post('signInWithPassword', { email, password: pw(id, eski), returnSecureToken: true });
  if (!r.idToken) { console.log(`${id}: ATLANDI (${r.error?.message || 'giriş yok'})`); continue; }

  const up = await post('update', { idToken: r.idToken, password: pw(id, YENI_PIN), returnSecureToken: true });
  console.log(up.localId ? `${id}: PIN güncellendi` : `${id}: HATA ${JSON.stringify(up.error)}`);
}
console.log('Bitti.');
