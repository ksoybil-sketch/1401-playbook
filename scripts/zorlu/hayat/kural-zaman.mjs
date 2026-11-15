// Bölüm 3-4 düzeltmelerinin kuralları (H1, H2, H7, H8, H20, saat ölçümü): guvenlik emülatöründe (8180/9199),
// guvenlik/tohum.mjs hesaplarıyla. matris.mjs'ten SONRA çalıştırılır (yeniden tohumlar).
import { readFileSync, writeFileSync } from 'node:fs';
import { client, attempt, adb } from '../guvenlik/lib.mjs';
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, arrayUnion, serverTimestamp, addDoc } from 'firebase/firestore';
const A = JSON.parse(readFileSync(new URL('../guvenlik/out/hesaplar.json', import.meta.url)));
const rows = [];
const C = {};
const as = async (k) => (C[k] ??= await client(A[k].email, A[k].password));
async function t(role, what, expect, fn) {
  const r = await attempt(fn);
  const got = r.ok ? 'izin' : 'red';
  rows.push({ role, what, expect, got, ok: got === expect, code: r.code || '' });
  console.log(`${got === expect ? '  ' : '!!'} [${role}] ${what}: beklenen=${expect} gerçek=${got}${r.code ? ' (' + r.code + ')' : ''}`);
}
const H = 3600000, M = 60000;
const att = (id, extra = {}) => { const now = Date.now(); return { baristaId: 'bA', baristaName: 'Ayşe', storeId: 'S1', moduleId: 'mK', moduleTitle: 'x', passScore: 80, lessonId: null, startedAt: now, deadline: now + 10 * 90000, total: 10, questionIds: ['q1'], orders: {}, answers: {}, submittedAt: null, ...extra }; };
// ---- H1: deneme açılışı sunucu saatiyle
{
  const { db } = await as('bA');
  const now = Date.now();
  await t('barista', 'H1 sınav aç: startedAt 2 gün ileri', 'red', () => setDoc(doc(db, 'attempts/bA_kz_sinav_1'), att(1, { moduleId: 'kz', startedAt: now + 48 * H, deadline: now + 48 * H + 9e5 })));
  await t('barista', 'H1 sınav aç: startedAt 3 saat geri', 'red', () => setDoc(doc(db, 'attempts/bA_kz_sinav_2'), att(2, { moduleId: 'kz', startedAt: now - 3 * H, deadline: now - 3 * H + 9e5 })));
  await t('barista', 'H1 sınav aç: süre 48 saat (deadline ≠ soru × 90 sn)', 'red', () => setDoc(doc(db, 'attempts/bA_kz_sinav_3'), att(3, { moduleId: 'kz', deadline: now + 48 * H })));
  await t('barista', 'MEŞRU H1: sunucu saatiyle sınav aç', 'izin', () => setDoc(doc(db, 'attempts/bA_kz_sinav_4'), att(4, { moduleId: 'kz' })));
  await t('barista', 'MEŞRU H1: süre içinde cevap kaydet', 'izin', () => updateDoc(doc(db, 'attempts/bA_kz_sinav_4'), { answers: { q1: 1 } }));
  await t('barista', 'H1 teslim: submittedAt 1 saat ileri', 'red', () => updateDoc(doc(db, 'attempts/bA_kz_sinav_4'), { submittedAt: Date.now() + H, score: 0, passed: false, correct: 0, mistakes: [], timedOut: false }));
  await t('barista', 'H1 teslim: submittedAt başlangıçtan önce', 'red', () => updateDoc(doc(db, 'attempts/bA_kz_sinav_4'), { submittedAt: now - H, score: 0, passed: false, correct: 0, mistakes: [], timedOut: false }));
  await t('barista', 'MEŞRU H1: süre içinde teslim', 'izin', () => updateDoc(doc(db, 'attempts/bA_kz_sinav_4'), { submittedAt: Date.now(), score: 0, passed: false, correct: 0, mistakes: [], timedOut: false, answers: { q1: 1 } }));
  // Süresi 30 dk önce dolmuş açık deneme (yönetici yazar)
  const old = Date.now();
  await adb.doc('attempts/bA_kz_sinav_5').set(att(5, { moduleId: 'kz', startedAt: old - 45 * M, deadline: old - 30 * M, answers: { q1: 0 } }));
  await t('barista', 'H1 süresi geçmiş denemeye cevap yaz (saat geri alındı)', 'red', () => updateDoc(doc(db, 'attempts/bA_kz_sinav_5'), { answers: { q1: 2 } }));
  await t('barista', 'H1 süresi geçmiş denemeyi yeni cevaplarla "geçti" teslim et', 'red', () => updateDoc(doc(db, 'attempts/bA_kz_sinav_5'), { submittedAt: old - 31 * M, answers: { q1: 2 }, score: 100, passed: true, correct: 1, mistakes: [], timedOut: false }));
  await t('barista', 'H1 süresi geçmiş denemeyi aynı cevaplarla timedOut:false kapat', 'red', () => updateDoc(doc(db, 'attempts/bA_kz_sinav_5'), { submittedAt: old - 30 * M, answers: { q1: 0 }, score: 0, passed: false, correct: 0, mistakes: [], timedOut: false }));
  await t('barista', 'MEŞRU H1: süresi geçmiş denemeyi kayıtlı cevaplarla "süre doldu" kapat', 'izin', () => updateDoc(doc(db, 'attempts/bA_kz_sinav_5'), { submittedAt: old - 30 * M, answers: { q1: 0 }, score: 0, passed: false, correct: 0, mistakes: [], timedOut: true }));
  // H8: taşınan barista (deneme eski şubede açık kaldı)
  await adb.doc('attempts/bA_kz_sinav_6').set(att(6, { moduleId: 'kz', storeId: 'S2' }));
  await t('barista', 'H8 teslimde başka (üçüncü) şubeye yaz', 'red', () => updateDoc(doc(db, 'attempts/bA_kz_sinav_6'), { storeId: 'S9' }));
  await t('barista', 'MEŞRU H8: teslimde güncel şubesine yaz', 'izin', () => updateDoc(doc(db, 'attempts/bA_kz_sinav_6'), { storeId: 'S1', submittedAt: Date.now(), score: 0, passed: false, correct: 0, mistakes: [], timedOut: false }));
  // Saat ölçümü
  await t('barista', 'MEŞRU saat: clock/kendi = serverTimestamp', 'izin', () => setDoc(doc(db, `clock/${A.bA.uid}`), { at: serverTimestamp() }));
  await t('barista', 'MEŞRU saat: clock/kendi oku', 'izin', () => getDoc(doc(db, `clock/${A.bA.uid}`)));
  await t('barista', 'saat: clock/kendi = elle sayı', 'red', () => setDoc(doc(db, `clock/${A.bA.uid}`), { at: 123 }));
  await t('barista', 'saat: başkasının clock belgesine yaz', 'red', () => setDoc(doc(db, `clock/${A.bB.uid}`), { at: serverTimestamp() }));
  await t('barista', 'saat: başkasının clock belgesini oku', 'red', () => getDoc(doc(db, `clock/${A.bB.uid}`)));
}
// ---- H2: kod ömrü sunucu saatiyle
{
  const { db } = await as('regional');
  const now = Date.now();
  const pc = (exp) => ({ uid: 'x', email: 'x@y', password: 'p', storeId: 'S1', storeName: 'Moda', expiresAt: exp });
  await t('regional', 'MEŞRU H2: eşleştirme kodu (30 dk)', 'izin', () => setDoc(doc(db, 'pairingCodes/900001'), pc(now + 30 * M)));
  await t('regional', 'H2 eşleştirme kodu 3 saat ileri saatle (3,5 sa ömür)', 'red', () => setDoc(doc(db, 'pairingCodes/900002'), pc(now + 3 * H + 30 * M)));
  await t('regional', 'H2 eşleştirme kodu 3 saat geri saatle (doğarken ölü)', 'red', () => setDoc(doc(db, 'pairingCodes/900003'), pc(now - 150 * M)));
  const inv = (exp) => ({ baristaId: 'bZ', uid: 'x', email: 'x@y', storeId: 'S1', expiresAt: exp });
  await t('regional', 'MEŞRU H2: davet (7 gün)', 'izin', () => setDoc(doc(db, 'invites/900011'), inv(now + 7 * 24 * H)));
  await t('regional', 'H2 davet 30 gün', 'red', () => setDoc(doc(db, 'invites/900012'), inv(now + 30 * 24 * H)));
  await adb.doc('invites/900013').set(inv(now - M));
}
{
  const { db } = await as('phone1');
  await t('telefon', 'MEŞRU H2: kendi şubesinin geçerli davetini oku', 'izin', () => getDoc(doc(db, 'invites/900011')));
  await t('telefon', 'H2 süresi dolmuş daveti oku', 'red', () => getDoc(doc(db, 'invites/900013')));
}
// ---- H20: kişiye bağlı PIN sıfırlama talebi
{
  const r = await adb.collection('requests').add({ storeId: 'S1', storeName: 'Moda', category: 'personel', priority: 'normal', title: 'Ayşe Barista için PIN sıfırlama', detail: 'x', status: 'in_progress', notes: [], createdAt: Date.now(), createdBy: A.bL1.uid, createdByName: 'Leyla', updatedAt: Date.now(), lastSide: 'ops', closedAt: null, subjectBaristaId: 'bA' });
  const close = (c, by, extra = {}) => updateDoc(doc(c.db, 'requests', r.id), { status: 'done', closedAt: Date.now(), updatedAt: Date.now(), lastSide: 'store', waitReason: null, notes: arrayUnion({ at: Date.now(), by, byName: 'x', side: 'store', status: 'done', text: 'PIN belirlendi' }), ...extra });
  const bB = await as('bB');
  await t('barista', 'H20 başkasının PIN talebini kapat', 'red', () => close(bB, A.bB.uid));
  await t('barista', 'H20 başkasının PIN talebini oku', 'red', () => getDoc(doc(bB.db, 'requests', r.id)));
  const bA = await as('bA');
  await t('barista', 'H20 kendi PIN talebinin başlığını değiştir', 'red', () => close(bA, A.bA.uid, { title: 'x' }));
  await t('barista', 'MEŞRU H20: kendi PIN talebini sorgula', 'izin', () => getDocs(query(collection(bA.db, 'requests'), where('subjectBaristaId', '==', 'bA'))));
  await t('barista', 'MEŞRU H20: kod kullanınca kendi PIN talebini kapat', 'izin', () => close(bA, A.bA.uid));
}
// ---- H7: pasif mağaza tamamen kapalı
await adb.doc('stores/S1').update({ active: false });
{
  const p = await as('phone1');
  await t('telefon', 'H7 pasif mağaza: içerik oku', 'red', () => getDocs(collection(p.db, 'modules')));
  await t('telefon', 'H7 pasif mağaza: baristaları listele', 'red', () => getDocs(query(collection(p.db, 'baristas'), where('storeId', '==', 'S1'), where('active', '==', true))));
  await t('telefon', 'MEŞRU H7: kendi mağaza belgesini oku (pasif ekranı)', 'izin', () => getDoc(doc(p.db, 'stores/S1')));
  await t('telefon', 'MEŞRU H7: kendi users belgesini oku', 'izin', () => getDoc(doc(p.db, `users/${A.phone1.uid}`)));
  const b = await as('bA');
  await t('barista', 'H7 pasif mağaza: sınav aç', 'red', () => setDoc(doc(b.db, 'attempts/bA_kz2_sinav_1'), att(7, { moduleId: 'kz2' })));
  await t('barista', 'H7 pasif mağaza: ilerleme oku', 'red', () => getDoc(doc(b.db, 'progress/bA')));
  const s2 = await as('phone2');
  await t('telefon (S2)', 'MEŞRU H7: aktif mağaza içerik okur', 'izin', () => getDocs(collection(s2.db, 'modules')));
  const reg = await as('regional');
  await t('regional', 'MEŞRU H7: mağazayı yeniden aktifleştir', 'izin', () => updateDoc(doc(reg.db, 'stores/S1'), { active: true }));
  await t('telefon', 'MEŞRU H7: yeniden açılan mağaza içerik okur', 'izin', () => getDocs(collection(p.db, 'modules')));
}
for (const c of Object.values(C)) await c.close();
const bad = rows.filter((r) => !r.ok);
writeFileSync(new URL('./out/kural-zaman.json', import.meta.url), JSON.stringify(rows, null, 1));
console.log(`\nTOPLAM ${rows.length} · beklenen ${rows.length - bad.length} · beklenmeyen ${bad.length}`);
process.exit(0);
