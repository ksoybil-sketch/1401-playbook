/**
 * Haftalık sınav hakkı ve önkoşul denetimi (18.11.2026 değişikliği).
 *
 *   node --experimental-transform-types --no-warnings --import ./lib/kayit.mjs sinav-hakki.mjs
 *
 * Emülatör + tohum gerekir (zsh scripts/yuk-testi/sifirla.sh).
 * Uygulamanın gerçek modülleriyle çalışır (api/exam.ts, api/backend.ts).
 *
 * Beklenen:
 *   1. Hak BÜTÜN modüllerde ortak: 3 farklı modülde deneme açan barista
 *      dördüncüsünde 'weekly-limit' alır.
 *   2. Geçilemeyen deneme de hakkı harcar (teslim edilip kalınsa bile).
 *   3. Önkoşulu geçilmemiş modül kilitli.
 *   4. Mini sınavın kendi hakkı var: modül hakkı dolsa da açılır.
 */
import { readFileSync } from 'node:fs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const H = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url), 'utf8'));
const CUR = JSON.parse(readFileSync(new URL('../../src/generated/curriculum.json', import.meta.url), 'utf8'));

const SONUC = [];
const kontrol = (ad, beklenen, gercek) => {
  const ok = beklenen === gercek;
  SONUC.push({ ad, ok });
  console.log(`${ok ? 'GEÇTİ' : 'KALDI'} | ${ad} | beklenen=${beklenen} gerçek=${gercek}`);
};

const tag = 'hak';
const fb = await import(`./lib/istemci-firebase.mjs?c=${tag}`);
const fs = await import(`./lib/sayac.mjs?c=${tag}`);
const m = (p) => import(`../../src/${p}?c=${tag}`);
const exam = await m('api/exam.ts');
const backend = (await m('api/backend.ts')).backend;
const content = (await m('store/content.ts')).useContent;

// Panel/uygulama içerik deposu: isLocked ve moduleHidden buna bakar.
content.setState({ tracks: CUR.tracks, modules: CUR.modules, lessons: CUR.lessons });

/** PIN'i olan ilk barista. */
const b = H.baristas.find((x) => x.pin && !x.pinPending) || H.baristas[0];
await backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin);
const who = { baristaId: b.id, storeId: b.storeId, name: b.name };
console.log(`Barista: ${b.name} (${b.id})\n`);

// Bu haftanın denemelerini temizle: tohum geçmişi hakkı peşinen doldurmasın.
// Barista kendi denemesini silemez (kural); temizliği yönetici (Admin SDK) yapar.
const { collection, getDocs, query, where } = fs;
const hafta = exam.weekWindow().from;
const { initializeApp, getApps } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: 'demo-playbook' });
const adb = getFirestore();
{
  const snap = await adb.collection('attempts').where('baristaId', '==', b.id).get();
  let n = 0;
  for (const d of snap.docs) if ((d.data().startedAt || 0) >= hafta) { await d.ref.delete(); n++; }
  console.log(`Bu haftadan ${n} eski deneme temizlendi.`);
}
/** Tohum geçmişinde geçilmiş modüller: kilit testi için geçilmemiş bir zincir lazım. */
const gecilen = new Set(Object.keys((await adb.doc(`progress/${b.id}`).get()).data()?.modules || {}));

const acik = CUR.modules.filter((x) => !x.prerequisiteId && x.published !== false);
console.log(`Önkoşulsuz (açık) modül: ${acik.length} · kilitli: ${CUR.modules.length - acik.length}\n`);
kontrol('her eğitim yolunun ilk modülü açık', CUR.tracks.length, acik.length);

/** startExam sonucunu 'ok' ya da hata koduna indirger. */
const dene = async (mod, ders = null) => {
  // Üçüncü parametre ders NESNESİ (exam.ts: quiz = lesson?.id || null).
  try { await exam.startExam(mod, who, ders); return 'ok'; }
  catch (e) { return e?.message === 'weekly-limit' ? 'weekly-limit' : (e?.message || 'hata'); }
};
/** Açık denemeyi kalarak kapatır: hak harcanmış sayılmalı. */
const kalarakTeslim = async (modId) => {
  const open = await getDocs(query(collection(fb.db, 'attempts'), where('baristaId', '==', b.id), where('moduleId', '==', modId)));
  const d = open.docs.find((x) => !x.data().submittedAt);
  if (!d) return;
  const a = d.data();
  await exam.submitExam(d.id, {}, { questionIds: a.questionIds || [], baristaId: b.id });
};

// Önkoşul: önkoşulu HENÜZ GEÇİLMEMİŞ bir modül kilitli olmalı.
// (Hak harcanmadan önce denenir; yoksa weekly-limit kilidi gölgeler.)
const kilitli = CUR.modules.find((x) => x.prerequisiteId && !gecilen.has(x.prerequisiteId));
if (kilitli) {
  const r2 = await dene(kilitli);
  kontrol(`önkoşullu modül kilitli (${kilitli.title})`, true, /kilitli/i.test(r2));
} else {
  console.log('ATLANDI | kilit testi: bu baristanın bütün önkoşulları geçilmiş');
}

// 1-3. Üç ayrı modülde deneme
for (let i = 0; i < 3; i++) {
  const r = await dene(acik[i]);
  kontrol(`${i + 1}. deneme (${acik[i].title})`, 'ok', r);
  await kalarakTeslim(acik[i].id); // kalarak kapat: hak geri gelmemeli
}
// 4. Dördüncü modül: hak bitmiş olmalı
kontrol('4. deneme başka modülde (hak dolu)', 'weekly-limit', await dene(acik[3]));
// Aynı modülde yeniden deneme de olmamalı
kontrol('aynı modülde 4. deneme (hak dolu)', 'weekly-limit', await dene(acik[0]));

// Mini sınav modül hakkına BAĞLI OLMAMALI: açılamasa bile sebebi
// 'weekly-limit' olmamalı (çoğu derste mini sınav havuzu yoktur).
const dersli = CUR.lessons.find((l) => l.moduleId === acik[0].id);
const r3 = dersli ? await dene(acik[0], dersli) : 'ders yok';
kontrol(`mini sınav modül hakkından etkilenmiyor (${r3})`, true, r3 !== 'weekly-limit');

const kaldi = SONUC.filter((x) => !x.ok).length;
console.log(`\n${SONUC.length} denetim · geçti ${SONUC.length - kaldi} · kaldı ${kaldi}`);
process.exit(kaldi ? 1 : 0);
