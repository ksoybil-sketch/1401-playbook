/**
 * İlerleme sıfırlama: baristaların ders tamamlamaları ve sınav geçmişi.
 *
 * Yeni APK gerekmez — ilerleme telefonda değil Firestore'da durur
 * (progress/{baristaId} + attempts/{id}). Uygulama bu kayıtları canlı
 * dinlediği için sıfırlama saniyeler içinde açık telefonlara da yansır.
 *
 *   node scripts/ilerleme-sifirla.mjs --canli                  ne değişecek (YAZMAZ)
 *   node scripts/ilerleme-sifirla.mjs --canli --uygula         sıfırla
 *   node scripts/ilerleme-sifirla.mjs --demo                   demo projesi
 *
 * Seçenekler:
 *   --kapsam hepsi|ders|sinav   ne sıfırlanacak (varsayılan: hepsi)
 *                                 ders  → progress.lessons
 *                                 sinav → progress.modules + quizzes, attempts silinir
 *   --sube <storeId>            yalnızca o şube
 *   --barista <baristaId,...>   yalnızca o barista(lar)
 *   --atla <baristaId,...>      bu baristalara dokunma (ör. kendi test hesabın)
 *   --acik-koru                 o anda süren sınavı silme (barista kesilmesin)
 *
 * Korunanlar: barista hesapları, PIN'ler, okunan bültenler (progress.bulletins),
 * seçilen tema, görevler, talepler, müfredat, kullanım sayaçları.
 *
 * Sınav geçmişi silinince o haftanın sınav hakkı da yenilenir (hak attempts
 * kayıtlarından sayılır, bkz. src/api/exam.ts). Geçmiş kayıttır: --uygula
 * önce etkilenen her şeyi yedekler/<tarih>-sifirlama-<ortam>.json dosyasına yazar.
 *
 * Giriş: uygulama geliştiricisi hesabı (rol 'developer'). Şifre hiçbir yerde
 * tutulmaz, komut sorar ve ekranda görünmez.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const DEMO = has('--demo');
const APPLY = has('--uygula');
if (!DEMO && !has('--canli')) { console.error('Hedef: --canli ya da --demo'); process.exit(1); }

const KAPSAM = (val('--kapsam') || 'hepsi').toLowerCase();
if (!['hepsi', 'ders', 'sinav'].includes(KAPSAM)) { console.error('--kapsam: hepsi, ders ya da sinav'); process.exit(1); }
const DERS = KAPSAM === 'hepsi' || KAPSAM === 'ders';
const SINAV = KAPSAM === 'hepsi' || KAPSAM === 'sinav';
const onlyStore = val('--sube') || null;
const onlyBaristas = (val('--barista') || '').split(',').map((s) => s.trim()).filter(Boolean);
const skipBaristas = (val('--atla') || '').split(',').map((s) => s.trim()).filter(Boolean);
/** Şu an süresi dolmamış, teslim edilmemiş deneme silinmesin: kimse sınavın ortasında kesilmesin. */
const ACIK_KORU = has('--acik-koru');

const env = {};
for (const l of readFileSync(DEMO ? '.env.demo' : '.env.production', 'utf8').split('\n')) { const m = l.match(/^([\w.]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const projectId = env.VITE_FB_PROJECT_ID;
if (projectId !== (DEMO ? 'playbook-demo-1401' : 'playbook-1401')) { console.error('Beklenmeyen proje:', projectId); process.exit(1); }

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

let email, password;
if (DEMO) {
  email = env.VITE_DEMO_EMAIL;
  password = readFileSync('scripts/seed.mjs', 'utf8').match(/staff:\s*\{\s*email:\s*'[^']+',\s*password:\s*'([^']+)'/)[1];
} else {
  email = await ask('Geliştirici e-postası: ');
  password = await ask('Şifre (görünmez): ', true);
}

const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.VITE_FB_API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
}).then((x) => x.json());
if (!auth.idToken) { console.error('Giriş başarısız:', auth.error?.message || auth); process.exit(1); }

const FS_URL = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const H = { Authorization: `Bearer ${auth.idToken}`, 'Content-Type': 'application/json' };

const me = await fetch(`${FS_URL}/users/${auth.localId}`, { headers: H }).then((x) => x.json());
const myRole = me.fields?.role?.stringValue;
if (myRole !== 'developer') { console.error(`Bu hesabın rolü "${myRole || 'yok'}"; sıfırlama için geliştirici hesabı gerekiyor.`); process.exit(1); }
console.log(`Hedef: ${DEMO ? 'DEMO' : 'CANLI'} (${projectId}) · giriş: ${me.fields?.name?.stringValue || email}\n`);

async function listAll(coll) {
  const out = []; let token;
  do {
    const u = new URL(`${FS_URL}/${coll}`);
    u.searchParams.set('pageSize', '300');
    if (token) u.searchParams.set('pageToken', token);
    const r = await fetch(u, { headers: H }).then((x) => x.json());
    if (r.error) { console.error(`${coll} okunamadı:`, r.error.message); process.exit(1); }
    for (const d of r.documents || []) out.push({ id: d.name.split('/').pop(), name: d.name, fields: d.fields || {} });
    token = r.nextPageToken;
  } while (token);
  return out;
}

const S = (f, k) => f[k]?.stringValue ?? null;
const N = (f, k) => (f[k]?.integerValue != null ? Number(f[k].integerValue) : f[k]?.doubleValue != null ? Number(f[k].doubleValue) : null);
const MAP = (f, k) => Object.keys(f[k]?.mapValue?.fields || {});

const [progress, baristas, stores, attempts] = await Promise.all([
  listAll('progress'), listAll('baristas'), listAll('stores'), SINAV ? listAll('attempts') : Promise.resolve([])
]);
const storeName = new Map(stores.map((s) => [s.id, S(s.fields, 'name') || s.id]));
const baristaById = new Map(baristas.map((b) => [b.id, b]));

function inScope(baristaId, storeId) {
  if (skipBaristas.includes(baristaId)) return false;
  if (onlyBaristas.length) return onlyBaristas.includes(baristaId);
  if (onlyStore) return storeId === onlyStore;
  return true;
}

const hedefProgress = progress.filter((p) => inScope(p.id, S(p.fields, 'storeId')));
const hedefAttempts = attempts.filter((a) => inScope(S(a.fields, 'baristaId'), S(a.fields, 'storeId')));
const teslimEdilmemis = (a) => a.fields.submittedAt == null || a.fields.submittedAt?.nullValue !== undefined;
const simdi = Date.now();
/** Teslim edilmemiş VE süresi dolmamış: biri gerçekten sınavda. */
const canliAttempts = hedefAttempts.filter((a) => teslimEdilmemis(a) && (N(a.fields, 'deadline') ?? 0) > simdi);
const silinecekAttempts = ACIK_KORU ? hedefAttempts.filter((a) => !canliAttempts.includes(a)) : hedefAttempts;

const satirlar = [];
for (const p of hedefProgress) {
  const f = p.fields;
  const b = baristaById.get(p.id);
  const ad = b ? S(b.fields, 'name') || p.id : `${p.id} (barista kaydı yok)`;
  const sube = storeName.get(S(f, 'storeId')) || S(f, 'storeId') || '—';
  const dersSayi = MAP(f, 'lessons').length;
  const modulSayi = MAP(f, 'modules').length;
  const quizSayi = MAP(f, 'quizzes').length;
  const deneme = silinecekAttempts.filter((a) => S(a.fields, 'baristaId') === p.id).length;
  if ((DERS && dersSayi) || (SINAV && (modulSayi || quizSayi || deneme))) {
    satirlar.push({ id: p.id, ad, sube, dersSayi, modulSayi, quizSayi, deneme });
  }
}
// İlerlemesi hiç olmayan ama denemesi olan barista (progress belgesi yoksa)
const progressli = new Set(hedefProgress.map((p) => p.id));
const yetim = SINAV ? [...new Set(silinecekAttempts.map((a) => S(a.fields, 'baristaId')).filter((id) => id && !progressli.has(id)))] : [];

console.log(`Kapsam: ${KAPSAM}${onlyStore ? ` · şube ${storeName.get(onlyStore) || onlyStore}` : ''}${onlyBaristas.length ? ` · barista ${onlyBaristas.join(', ')}` : ''}${skipBaristas.length ? ` · atlanan ${skipBaristas.join(', ')}` : ''}`);
console.log(`Veritabanı: ${baristas.length} barista · ${progress.length} ilerleme kaydı · ${attempts.length} sınav denemesi\n`);

if (!satirlar.length && !yetim.length) { console.log('Sıfırlanacak bir şey yok.'); process.exit(0); }

console.log('Etkilenecekler:');
for (const r of satirlar) {
  const parcalar = [];
  if (DERS) parcalar.push(`${r.dersSayi} ders`);
  if (SINAV) parcalar.push(`${r.modulSayi} modül`, `${r.quizSayi} mini sınav`, `${r.deneme} deneme`);
  console.log(`  ${r.ad} · ${r.sube} → ${parcalar.join(' · ')}   [${r.id}]`);
}
for (const id of yetim) console.log(`  ${baristaById.get(id) ? S(baristaById.get(id).fields, 'name') : id} → ilerleme kaydı yok, ${silinecekAttempts.filter((a) => S(a.fields, 'baristaId') === id).length} deneme silinecek`);

const toplamDers = satirlar.reduce((t, r) => t + r.dersSayi, 0);
const toplamModul = satirlar.reduce((t, r) => t + r.modulSayi, 0);
const toplamQuiz = satirlar.reduce((t, r) => t + r.quizSayi, 0);
console.log(`\nToplam: ${satirlar.length} barista${DERS ? ` · ${toplamDers} ders tamamlaması` : ''}${SINAV ? ` · ${toplamModul} geçilen modül · ${toplamQuiz} mini sınav · ${silinecekAttempts.length} deneme kaydı` : ''}`);
if (SINAV && canliAttempts.length) {
  const saat = (ms) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  console.log(`\n⚠ ${canliAttempts.length} sınav ŞU AN SÜRÜYOR:`);
  for (const a of canliAttempts) {
    const bid = S(a.fields, 'baristaId');
    const b = baristaById.get(bid);
    const kalan = Math.max(0, Math.round(((N(a.fields, 'deadline') ?? 0) - simdi) / 60000));
    console.log(`    ${b ? S(b.fields, 'name') : bid} · ${S(a.fields, 'moduleId')} · ${saat(N(a.fields, 'startedAt') ?? simdi)}'de başladı · ${kalan} dk kaldı`);
  }
  console.log(ACIK_KORU
    ? '    --acik-koru verildi: bu deneme(ler) silinmeyecek, barista sınavına devam eder.'
    : '    Bunlar silinirse barista sınavın ortasında kesilir. Beklemek ya da --acik-koru eklemek daha iyi.');
}
if (SINAV) console.log('Sınav geçmişi silinince bu haftanın sınav hakkı da yenilenir.');
if (DERS) console.log('Önkoşullu modüller yeniden kilitlenir; rozetler ve ilerleme yüzdeleri sıfırdan başlar.');
console.log('Dokunulmayanlar: barista hesapları ve PIN\'ler, okunan bültenler, tema, görevler, talepler, müfredat, kullanım sayaçları.');

if (!APPLY) { console.log('\nHiçbir şey yazılmadı. Uygulamak için aynı komutu --uygula ile çalıştır.'); process.exit(0); }

// --- Yedek ---------------------------------------------------------------
if (!existsSync('yedekler')) mkdirSync('yedekler');
// Dosya adında saat da var: aynı gün ikinci bir sıfırlama ilkinin yedeğini ezmesin.
const gun = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const saatDk = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', '');
const yedekYol = `yedekler/${gun}-${saatDk}-sifirlama-${DEMO ? 'demo' : 'canli'}.json`;
// Biçim yedek.mjs ile aynı: gerektiğinde geri yüklenebilir —
//   npm run yedek -- --geri-yukle <dosya> --koleksiyon progress --uygula
const sade = (d) => ({ name: d.name, fields: d.fields });
writeFileSync(yedekYol, JSON.stringify({
  project: projectId, takenAt: Date.now(), by: email, kapsam: KAPSAM,
  collections: {
    progress: hedefProgress.filter((p) => satirlar.some((r) => r.id === p.id)).map(sade),
    attempts: silinecekAttempts.map(sade)
  }
}, null, 2));
console.log(`\nYedek: ${yedekYol} (geri yükleme: npm run yedek -- --geri-yukle ${yedekYol} --koleksiyon progress --uygula)`);

// --- Uygula --------------------------------------------------------------
const now = Date.now();
let pOk = 0, pHata = 0, aOk = 0, aHata = 0;
for (const r of satirlar) {
  const alanlar = {}; const mask = [];
  if (DERS) { alanlar.lessons = { mapValue: { fields: {} } }; mask.push('lessons'); }
  if (SINAV) {
    alanlar.modules = { mapValue: { fields: {} } }; mask.push('modules');
    alanlar.quizzes = { mapValue: { fields: {} } }; mask.push('quizzes');
  }
  alanlar.updatedAt = { integerValue: String(now) }; mask.push('updatedAt');
  const u = `${FS_URL}/progress/${r.id}?${mask.map((m) => `updateMask.fieldPaths=${m}`).join('&')}`;
  const res = await fetch(u, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: alanlar }) }).then((x) => x.json());
  if (res.error) { console.error(`  ✗ ${r.ad}: ${res.error.message}`); pHata++; } else pOk++;
}
if (SINAV) {
  for (const a of silinecekAttempts) {
    const res = await fetch(`${FS_URL}/attempts/${a.id}`, { method: 'DELETE', headers: H });
    if (!res.ok) { console.error(`  ✗ deneme ${a.id}: ${(await res.json()).error?.message || res.status}`); aHata++; } else aOk++;
  }
}
console.log(`\n✓ ${pOk} ilerleme kaydı sıfırlandı${pHata ? ` · ${pHata} hata` : ''}${SINAV ? ` · ${aOk} deneme silindi${aHata ? ` · ${aHata} hata` : ''}` : ''}`);
console.log('Açık telefonlar birkaç saniye içinde yeni hâli görür; yeni APK gerekmez.');
