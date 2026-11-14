/**
 * Tek komutla durum: canlıda, demoda, GitHub'da ve bu bilgisayarda hangi kod var,
 * hepsi aynı mı?
 *
 *   npm run durum
 *
 * Her yayın /surum.json yazar (vite.config.ts): sürüm, git commit'i, derleme
 * zamanı, müfredat sürümü. Bu komut o dosyaları okur, git ile karşılaştırır.
 * Hiçbir şeye yazmaz, giriş istemez.
 */
import { execSync } from 'node:child_process';

const SITES = [
  { label: 'Canlı', url: 'https://1401-campus.web.app' },
  { label: 'Canlı (eski adres)', url: 'https://playbook-1401.web.app' },
  { label: 'Demo', url: 'https://playbook-demo-1401.web.app' }
];
// Uygulamaya giren dosyalar: bunlar dışındaki değişiklikler (belgeler, tanıtım
// videosu, satır sonu farkları) yayını etkilemez.
const APP_PATHS = 'src public shared index.html package.json firestore.rules firestore.indexes.json firebase.json vite.config.ts scripts/source';

const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const tree = (rev) => sh(`git rev-parse ${rev}^{tree}`);
const fmt = (iso) => iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '?';
const ok = (b, yes, no) => console.log(b ? `  ✓ ${yes}` : `  ✗ ${no}`);

sh('git fetch -q origin');
const live = [];
for (const s of SITES) {
  const r = await fetch(`${s.url}/surum.json`, { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  live.push({ ...s, info: r && typeof r === 'object' && r.commit ? r : null });
}

const head = sh('git rev-parse --short HEAD');
const master = sh('git rev-parse --short origin/master');
// Satır sonu farkları (Windows'tan gelen dosyalar) sayılmaz.
const dirty = (sh(`git diff --ignore-cr-at-eol --name-only HEAD -- ${APP_PATHS}`) + sh(`git ls-files --others --exclude-standard -- ${APP_PATHS}`)).trim();

console.log(`\n1401 Campus · durum (${fmt(new Date().toISOString())})\n`);
for (const s of live) {
  const i = s.info;
  console.log(`  ${s.label.padEnd(20)} ${i ? `${i.version} · ${i.commit} · ${fmt(i.built)} · müfredat ${i.curriculum || '?'}` : 'sürüm bilgisi yok (bu özellikten önceki bir yayın)'}`);
}
console.log(`  ${'GitHub master'.padEnd(20)} ${master}`);
console.log(`  ${'Bu bilgisayar'.padEnd(20)} ${head}${dirty ? ' + kaydedilmemiş değişiklik' : ''}\n`);

const [canli, eski, demo] = live.map((s) => s.info);
const clean = (i) => i && !String(i.commit).endsWith('+');
const sameCode = (a, b) => a && b && tree(a.commit.replace('+', '')) === tree(b.commit.replace('+', ''));

ok(canli && eski && canli.commit === eski.commit && canli.built === eski.built,
  'İki canlı adres aynı yayını gösteriyor.', 'İki canlı adres farklı yayında. Canlıya yeniden dağıt (YAYIN-GUNU.md §2).');
ok(sameCode(canli, demo) && clean(canli) && clean(demo),
  'Canlı ve demo aynı kodda.', 'Canlı ve demo farklı kodda ya da biri kaydedilmemiş değişiklikle derlenmiş.');
ok(canli && tree(canli.commit.replace('+', '')) === tree('origin/master'),
  "Canlıdaki kod GitHub'daki master ile aynı.", "Canlıdaki kod master'dan farklı: master'ı birleştir ya da canlıyı master'dan dağıt.");
const pending = canli ? sh(`git log --oneline ${canli.commit.replace('+', '')}..HEAD -- ${APP_PATHS}`) : '';
ok(!dirty && !pending,
  'Bu bilgisayarda yayına girmemiş değişiklik yok.',
  `Bu bilgisayarda yayına girmemiş değişiklik var:${pending ? '\n      ' + pending.split('\n').join('\n      ') : ''}${dirty ? '\n      (commit edilmemiş dosyalar: git status)' : ''}`);
console.log('\nİçerik (dersler, sorular) kodla gelir. Canlı veritabanına "Akademi → Müfredatı güncelle" ile yüklenir;');
console.log('o pencere "değişiklik yok" diyorsa canlıdaki içerik bu sürümle aynıdır.\n');
