// Rol × işlem matrisi: her satır gerçek istemci kütüphanesiyle kurallara karşı denenir.
import { readFileSync, writeFileSync } from 'node:fs';
import { client, attempt, adb, createUserWithEmailAndPassword, signInWithEmailAndPassword } from './lib.mjs';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, writeBatch, runTransaction, arrayUnion, deleteField } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';
const A = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url)));
const now = Date.now();
const rows = [];
const C = {};
const as = async (k) => (C[k] ??= await client(A[k].email, A[k].password));
/**
 * kabul: beklenenden farklı sonucun BİLEREK kabul edildiği durum (bilinen
 * Spark sınırı, kullanıcı kararı bekleyen K-6/K-7, başka dosya sahibine
 * devredilen iz). Bu satırlar "~~" ile ayrı sayılır; gizlenmez.
 */
async function t(role, what, expect, fn, note = '', kabul = '') {
  const r = await attempt(fn);
  const got = r.ok ? 'izin' : 'red';
  const match = expect === got;
  const row = { role, what, expect, got, ok: match || !!kabul, kabul: match ? '' : kabul, code: r.code || '', note: typeof r.value === 'string' ? r.value : note, ms: r.ms };
  rows.push(row);
  console.log(`${match ? '  ' : kabul ? '~~' : '!!'} [${role}] ${what}: beklenen=${expect} gerçek=${got}${r.code ? ' (' + r.code + ')' : ''}${row.note ? ' — ' + row.note : ''}${row.kabul ? ' [kabul: ' + kabul + ']' : ''}`);
  return r;
}
const SPARK = 'bilinen Spark sınırı (puanlama telefonda)';
/** Hata kaydı kimliği: <uid>_<YYYYAAGG UTC>_<sıra> (errorLog.ts ile aynı). */
const gun = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
const hataId = (uid, n, ms) => `${uid}_${gun(ms)}_${n}`;
const DATA_IMG = 'data:image/jpeg;base64,' + 'A'.repeat(400);
const big = (kb) => 'x'.repeat(kb * 1024);

// ---------------- Barista (S1, bA)
{
  const { db } = await as('bA');
  await t('barista', 'başkasının denemesini oku (attempts/bB_…)', 'red', () => getDoc(doc(db, 'attempts/bB_mK_sinav_1')));
  await t('barista', 'başkasının denemelerini sorgula (baristaId==bB)', 'red', () => getDocs(query(collection(db, 'attempts'), where('baristaId', '==', 'bB'))));
  await t('barista', 'aynı mağazadaki baristanın ilerlemesini oku (progress/bB)', 'izin', () => getDoc(doc(db, 'progress/bB')), 'tasarım: inStore');
  await t('barista', 'başka şubenin ilerlemesini oku (progress/bC)', 'red', () => getDoc(doc(db, 'progress/bC')));
  await t('barista', 'başkasının ilerlemesine yaz (progress/bB.modules)', 'red', () => updateDoc(doc(db, 'progress/bB'), { 'modules.mK': { score: 0, passedAt: now } }));
  await t('barista', 'kendi ilerlemesine modül geçti yaz (progress/bA.modules.mK=100)', 'red', () => updateDoc(doc(db, 'progress/bA'), { 'modules.mK': { score: 100, passedAt: now }, 'modules.mO': { score: 100, passedAt: now } }), 'bilinen Spark sınırı', SPARK);
  await t('barista', 'ilerlemede storeId değiştir', 'red', () => updateDoc(doc(db, 'progress/bA'), { storeId: 'S2' }));
  await t('barista', 'teslim edilmiş gibi 100 puanlı deneme OLUŞTUR (score/passed oluşturmada)', 'red', () => setDoc(doc(db, 'attempts/bA_mK_sinav_1'), { baristaId: 'bA', storeId: 'S1', moduleId: 'mK', moduleTitle: 'Espresso', lessonId: null, startedAt: now, deadline: now + 9e5, total: 10, questionIds: [], answers: {}, submittedAt: null, score: 100, passed: true, correct: 10 }));
  // Meşru açılış (exam.ts startExam ile aynı alanlar) — sonraki iki satır buna dayanır.
  const acik = { baristaId: 'bA', baristaName: 'Ayşe Barista', storeId: 'S1', moduleId: 'mK', moduleTitle: 'Espresso', passScore: 80, lessonId: null, startedAt: now, deadline: now + 9e5, total: 10, questionIds: ['qK1'], orders: {}, answers: {}, submittedAt: null };
  await t('barista', 'MEŞRU: kendi ad alanında sınav aç (attempts/bA_mK_sinav_1)', 'izin', () => setDoc(doc(db, 'attempts/bA_mK_sinav_1'), acik));
  await t('barista', 'MEŞRU: açık denemeye cevap kaydet', 'izin', () => updateDoc(doc(db, 'attempts/bA_mK_sinav_1'), { answers: { qK1: 2 } }));
  await t('barista', 'açık denemeyi 100/geçti olarak teslim et', 'red', () => updateDoc(doc(db, 'attempts/bA_mK_sinav_1'), { submittedAt: now, score: 100, passed: true, correct: 10, total: 10, mistakes: [] }), 'bilinen Spark sınırı', SPARK);
  await t('barista', 'teslim edilmiş denemeyi değiştir', 'red', () => updateDoc(doc(db, 'attempts/bA_mK_sinav_1'), { score: 0 }));
  await t('barista', 'deneme kimliğini başka baristaya yaz (baristaId=bB)', 'red', () => setDoc(doc(db, 'attempts/bA_x_1'), { baristaId: 'bB', storeId: 'S1', submittedAt: null }));
  await t('barista', 'başka baristanın belirlenimci kimliğini kap (attempts/bB_mK_sinav_2, baristaId=bA)', 'red', () => setDoc(doc(db, 'attempts/bB_mK_sinav_2'), { baristaId: 'bA', storeId: 'S2', moduleId: 'mK', lessonId: null, startedAt: now, deadline: now + 9e5, submittedAt: null }));
  await t('barista', 'başka şube storeId ile deneme oluştur (storeId=S2)', 'red', () => setDoc(doc(db, 'attempts/bA_mO_sinav_1'), { baristaId: 'bA', storeId: 'S2', moduleId: 'mO', lessonId: null, startedAt: now, deadline: now + 9e5, submittedAt: null, answers: {} }));
  await t('barista', 'MEŞRU: kendi şubesiyle ikinci modülde sınav aç (attempts/bA_mO_sinav_3)', 'izin', () => setDoc(doc(db, 'attempts/bA_mO_sinav_3'), { ...acik, moduleId: 'mO' }));
  // exam.ts de açık denemeyi voided:true kapatır (soru kalmadı / eski biçim) — kural ayırt edemez.
  await t('barista', 'haftalık hakkı atlat: açık denemeyi voided:true kapat', 'red', () => updateDoc(doc(db, 'attempts/bA_mO_sinav_3'), { submittedAt: now, voided: true }), '', SPARK + '; exam.ts aynı yazımı meşru olarak yapar');
  await t('barista', 'haftalık hakkı atlat: geçmiş tarihli startedAt ile deneme', 'red', () => setDoc(doc(db, 'attempts/bA_mO_sinav_2'), { baristaId: 'bA', storeId: 'S1', moduleId: 'mO', lessonId: null, startedAt: now - 30 * 864e5, deadline: now + 9e5, submittedAt: null, answers: {} }), '', SPARK + '; progress zaten barista yazımında');
  await t('barista', 'denemeyi sil (hak sıfırlama)', 'red', () => deleteDoc(doc(db, 'attempts/bA_mK_sinav_1')));
  await t('barista', 'kendine önlük rozeti ver (baristas/bA.apronBadge)', 'red', () => updateDoc(doc(db, 'baristas/bA'), { apronBadge: true, apronBadgeAt: now }));
  await t('barista', 'kendi badgeOverrides', 'red', () => updateDoc(doc(db, 'baristas/bA'), { badgeOverrides: { tumu: true } }));
  await t('barista', 'kendi adını değiştir (baristas/bA.name)', 'red', () => updateDoc(doc(db, 'baristas/bA'), { name: '=HYPERLINK("http://x")' }));
  await t('barista', 'pinPending alanını değiştir', 'izin', () => updateDoc(doc(db, 'baristas/bA'), { pinPending: false }), 'tasarım');
  await t('barista', 'rozet ayarlarına yaz (config/badges)', 'red', () => setDoc(doc(db, 'config/badges'), { rules: [] }));
  await t('barista', 'kendi users rolünü lead yap', 'red', () => updateDoc(doc(db, `users/${A.bA.uid}`), { role: 'lead' }));
  await t('barista', 'kendi users storeId değiştir', 'red', () => updateDoc(doc(db, `users/${A.bA.uid}`), { storeId: 'S2' }));
  await t('barista', 'kendi users.label (büyük metin) yaz', 'red', () => updateDoc(doc(db, `users/${A.bA.uid}`), { label: big(200) }), 'sınır 80 karakter');
  await t('barista', 'MEŞRU: kendi users.label kısa / lastSeenAt', 'izin', () => updateDoc(doc(db, `users/${A.bA.uid}`), { label: 'Android telefon', lastSeenAt: now }));
  await t('barista', 'kendi users.paired alanına metin yaz', 'red', () => updateDoc(doc(db, `users/${A.bA.uid}`), { paired: big(10) }));
  await t('barista', 'cevap anahtarı: modülün tüm soruları (questions where moduleId)', 'izin', async () => { const s = await getDocs(query(collection(db, 'questions'), where('moduleId', '==', 'mK'))); return `${s.size} soru, answer alanı: ${s.docs[0].data().answer !== undefined}`; }, 'bilinen Spark sınırı');
  await t('barista', 'cevap anahtarı: TÜM soru bankası (filtresiz)', 'izin', async () => { const s = await getDocs(collection(db, 'questions')); return `${s.size} soru tek sorguda`; }, 'bilinen');
  await t('barista', 'talepleri oku (barista rolü)', 'red', () => getDocs(query(collection(db, 'requests'), where('storeId', '==', 'S1'))));
  await t('barista', 'başka şubenin baristalarını listele', 'red', () => getDocs(query(collection(db, 'baristas'), where('storeId', '==', 'S2'))));
  await t('barista', 'başka şubenin görevleri', 'red', () => getDocs(query(collection(db, 'assignments'), where('storeId', '==', 'S2'))));
  await t('barista', 'config/ai oku', 'red', () => getDoc(doc(db, 'config/ai')));
  await t('barista', 'config/permissions oku', 'red', () => getDoc(doc(db, 'config/permissions')));
  await t('barista', 'geliştiricinin users belgesi', 'red', () => getDoc(doc(db, `users/${A.dev.uid}`)));
  // Belge herkese açık (ilk kurulum ekranı bakar) ama içinde kimlik olmamalı: uid varsa "izin" (sızıntı).
  await t('barista', 'config/bootstrap içinden geliştirici uid oku', 'red', async () => { const s = await getDoc(doc(db, 'config/bootstrap')); if (!s.data()?.uid) throw Object.assign(new Error('uid yok'), { code: 'uid-yok' }); return `uid=${s.data().uid === A.dev.uid ? 'GELİŞTİRİCİ uid' : s.data().uid}`; }, 'belge {at}');
  await t('barista', 'başka şubenin davet kodunu oku (invites/<S2 kodu>)', 'red', async () => { const s = await getDoc(doc(db, `invites/${A.inviteCode}`)); return `storeId=${s.data().storeId}, email=${s.data().email}`; });
  await t('barista', 'geri bildirim: 900 KB ek alanla', 'red', () => addDoc(collection(db, 'feedback'), { by: A.bA.uid, status: 'yeni', text: 'merhaba', byName: 'Direktör', role: 'director', imageUrl: 'https://saldirgan.example/piksel.png', ek: big(900) }));
  await t('barista', 'hata kaydı: 900 KB extra alanla, sahte byName/role', 'red', () => addDoc(collection(db, 'hatalar'), { by: A.bA.uid, message: 'x', stack: 'y', extra: big(900), byName: 'Direktör', role: 'director', createdAt: now }));
  await t('barista', 'bülten yaz', 'red', () => addDoc(collection(db, 'bulletins'), { title: 'x', createdBy: 'x' }));
  await t('barista', 'kendi görevini oluştur', 'red', () => addDoc(collection(db, 'assignments'), { storeId: 'S1', createdBy: A.bA.uid, baristaId: 'bA', kind: 'module', targetId: 'mK' }));
  await t('barista', 'davet sil (kendi mağazası olmayan)', 'red', () => deleteDoc(doc(db, `invites/${A.inviteCode}`)));
}
// ---------------- Kimlik kapma: belirlenimci deneme kimliği dolu → kurban sınava başlayamaz
{
  const { db } = await as('bB');
  // startExam'in yaptığının aynısı: işlem içinde tx.get(attempts/bB_mK_sinav_2)
  await t('barista (kurban bB)', 'kapılmış kimlikle sınav başlat (runTransaction tx.get bB_mK_sinav_2)', 'izin', () => runTransaction(db, async (tx) => { const s = await tx.get(doc(db, 'attempts/bB_mK_sinav_2')); if (!s.exists()) tx.set(s.ref, { baristaId: 'bB', storeId: 'S1', moduleId: 'mK', submittedAt: null }); }), 'kurbanın meşru işlemi');
}
// ---------------- Mağaza müdürü (lead S1)
{
  const { db } = await as('bL1');
  await t('lead', 'başka şubenin talebini oku (requests/reqS2)', 'red', () => getDoc(doc(db, 'requests/reqS2')));
  await t('lead', 'başka şubenin taleplerini sorgula', 'red', () => getDocs(query(collection(db, 'requests'), where('storeId', '==', 'S2'))));
  await t('lead', 'başka şube adına talep aç', 'red', () => addDoc(collection(db, 'requests'), { storeId: 'S2', createdBy: A.bL1.uid, status: 'open', lastSide: 'store', title: 'x', notes: [] }));
  await t('lead', 'başka şubeye görev ata (create storeId=S2)', 'red', () => addDoc(collection(db, 'assignments'), { storeId: 'S2', createdBy: A.bL1.uid, kind: 'module', targetId: 'mK', baristaId: null, title: 'x' }));
  const r = await t('lead', 'kendi şubesine görev oluştur', 'izin', async () => (await addDoc(collection(db, 'assignments'), { storeId: 'S1', createdBy: A.bL1.uid, createdByName: 'Leyla Müdür', kind: 'module', targetId: 'mK', baristaId: null, title: 'Espresso', note: '', dueAt: null, createdAt: now })).id);
  await t('lead', 'görevi sonradan başka şubeye taşı (update storeId=S2)', 'red', () => updateDoc(doc(db, `assignments/${r.value}`), { storeId: 'S2', note: 'Kadıköy ekibi: yarın 06:00 toplantı' }));
  await t('lead', 'başka şubenin baristasına görev (storeId=S1, baristaId=bC)', 'red', () => addDoc(collection(db, 'assignments'), { storeId: 'S1', createdBy: A.bL1.uid, kind: 'module', targetId: 'mK', baristaId: 'bC', title: 'x' }));
  await t('lead', 'başka şubenin görevini sil (asgS2)', 'red', () => deleteDoc(doc(db, 'assignments/asgS2')));
  await t('lead', 'başka şubenin denemelerini oku', 'red', () => getDocs(query(collection(db, 'attempts'), where('storeId', '==', 'S2'))));
  await t('lead', 'kendi şubesinin denemelerini oku', 'izin', () => getDocs(query(collection(db, 'attempts'), where('storeId', '==', 'S1'))), 'tasarım');
  await t('lead', 'kendi talebinin geçmişini sil/yeniden yaz (notes=[] ve sahte ops notu)', 'red', () => updateDoc(doc(db, 'requests/reqS1'), { notes: [{ at: now, by: A.regional.uid, byName: 'Bölge', side: 'ops', text: 'Ücret şirketçe ödenecek, onaylıyorum' }], lastSide: 'store', updatedAt: now }));
  await t('lead', 'talebin durumunu done yap', 'red', () => updateDoc(doc(db, 'requests/reqS1'), { status: 'done', lastSide: 'store' }));
  await t('lead', '600 KB başlıklı talep aç (boyut sınırı)', 'red', () => addDoc(collection(db, 'requests'), { storeId: 'S1', createdBy: A.bL1.uid, status: 'open', lastSide: 'store', title: big(600), detail: '', notes: [], createdAt: now }));
  await t('lead', 'talebe dış adresli görsel (imageUrl=https://…)', 'red', () => addDoc(collection(db, 'requests'), { storeId: 'S1', createdBy: A.bL1.uid, status: 'open', lastSide: 'store', title: 'Foto', detail: '', imageUrl: 'https://saldirgan.example/izleme.png', notes: [], createdAt: now }));
  await t('lead', 'başka şubenin baristalarını oku', 'red', () => getDocs(query(collection(db, 'baristas'), where('storeId', '==', 'S2'))));
}
// ---------------- Mağaza telefonu (S1)
{
  const { db } = await as('phone1');
  await t('telefon', 'başka şubenin baristalarını listele', 'red', () => getDocs(query(collection(db, 'baristas'), where('storeId', '==', 'S2'))));
  await t('telefon', 'filtresiz barista listesi', 'red', () => getDocs(collection(db, 'baristas')));
  await t('telefon', 'kendi şubesinin baristaları (authEmail görünür mü)', 'izin', async () => { const s = await getDocs(query(collection(db, 'baristas'), where('storeId', '==', 'S1'))); return `${s.size} barista; authEmail=${s.docs[0].data().authEmail}`; }, 'tasarım');
  await t('telefon', 'başka şubenin davet kodunu oku', 'red', async () => { const s = await getDoc(doc(db, `invites/${A.inviteCode}`)); return `storeId=${s.data().storeId}`; });
  await t('telefon', 'başka şubenin davetini sil', 'red', () => deleteDoc(doc(db, `invites/${A.inviteCode}`)));
  await t('telefon', 'denemeleri oku', 'red', () => getDocs(query(collection(db, 'attempts'), where('storeId', '==', 'S1'))));
  await t('telefon', 'soru bankası (cevap anahtarı)', 'izin', async () => `${(await getDocs(collection(db, 'questions'))).size} soru`, 'bilinen');
  await t('telefon', 'talepleri oku', 'red', () => getDocs(query(collection(db, 'requests'), where('storeId', '==', 'S1'))));
  await t('telefon', 'kendini lead yap', 'red', () => updateDoc(doc(db, `users/${A.phone1.uid}`), { role: 'lead' }));
}
// ---------------- Kahve Operasyonu (ops)
{
  const { db } = await as('ops');
  await t('ops', 'kendi rolünü director yap', 'red', () => updateDoc(doc(db, `users/${A.ops.uid}`), { role: 'director' }));
  await t('ops', 'kendi rolünü opsmanager yap', 'red', () => updateDoc(doc(db, `users/${A.ops.uid}`), { role: 'opsmanager' }));
  await t('ops', 'Yetkiler belgesine yaz', 'red', () => setDoc(doc(db, 'config/permissions'), { roles: { ops: { icerikYayin: true } } }, { merge: true }));
  await t('ops', 'yapay zekâ anahtarını oku (config/ai)', 'red', async () => `apiKey=${(await getDoc(doc(db, 'config/ai'))).data().apiKey.slice(0, 14)}…`, '15.11 kararı: yalnız direktör');
  await t('ops', 'yapay zekâ anahtarını değiştir', 'red', () => setDoc(doc(db, 'config/ai'), { apiKey: 'sk-ant-benim' }));
  await t('ops', 'geliştiricinin users belgesi', 'red', () => getDoc(doc(db, `users/${A.dev.uid}`)));
  await t('ops', 'filtresiz users listesi', 'red', () => getDocs(collection(db, 'users')));
  await t('ops', 'users where role==developer', 'red', () => getDocs(query(collection(db, 'users'), where('role', '==', 'developer'))));
  await t('ops', 'Yetkiler kaydında geliştirici satırları (log.dev)', 'red', async () => { const l = (await getDoc(doc(db, 'config/permissions'))).data().log; const n = l.filter((x) => x.dev).length; if (!n) throw Object.assign(new Error('yok'), { code: 'iz-yok' }); return `${n} geliştirici satırı okunabildi`; }, 'iz', 'devredildi: PermissionsPage.tsx geliştirici değişikliğinde satır yazmasın');
  await t('ops', 'talepteki geliştirici notu (by=uid)', 'red', async () => { const n = (await getDoc(doc(db, 'requests/reqS1'))).data().notes; const d = n.find((x) => x.by === A.dev.uid); if (!d) throw Object.assign(new Error('yok'), { code: 'iz-yok' }); return `geliştirici uid'li not: "${d.text}"`; }, 'iz', 'devredildi: requests.ts geliştirici notunda by boş yazılsın');
  await t('ops', 'başkasının önerisini onayla (status=approved)', 'red', () => updateDoc(doc(db, 'proposals/pOps2'), { status: 'approved' }));
  await t('ops', 'ders yaz (yayın yetkisi yok)', 'red', () => updateDoc(doc(db, 'lessons/lK'), { title: 'x' }));
  await t('ops', 'hata kayıtlarını oku', 'red', () => getDocs(collection(db, 'hatalar')));
  await t('ops', 'geri bildirimleri oku', 'red', () => getDocs(collection(db, 'feedback')));
  await t('ops', 'önerinin sahibi (createdBy) olarak başkası adına öneri', 'red', () => addDoc(collection(db, 'proposals'), { createdBy: A.ops2.uid, status: 'pending', ops: [] }));
  await t('ops', 'barista oluştur', 'red', () => setDoc(doc(db, 'baristas/hack'), { storeId: 'S1' }));
}
// ---------------- Bölge müdürü (regional)
{
  const { db } = await as('regional');
  await t('regional', 'kendi rolünü director yap', 'red', () => updateDoc(doc(db, `users/${A.regional.uid}`), { role: 'director' }));
  await t('regional', 'Yetkiler belgesine yaz', 'red', () => setDoc(doc(db, 'config/permissions'), { roles: {} }, { merge: true }));
  await t('regional', 'yapay zekâ anahtarını oku', 'red', () => getDoc(doc(db, 'config/ai')), '15.11 kararı: yalnız direktör');
  await t('regional', 'geliştiricinin users belgesi', 'red', () => getDoc(doc(db, `users/${A.dev.uid}`)));
  await t('regional', 'bir ops hesabını store rolüne çevir', 'red', () => updateDoc(doc(db, `users/${A.ops.uid}`), { role: 'store' }));
  // Yeni auth hesabı (istemci kaydı) + ops rolü
  const o = await (await import('./lib.mjs')).client();
  const cr = await createUserWithEmailAndPassword(o.auth, `regyeni-${now}@ornek.test`, 'regyeni-123');
  await t('regional', 'yeni hesabı ops rolüyle oluştur', 'red', () => setDoc(doc(db, `users/${cr.user.uid}`), { role: 'ops', active: true }));
  await t('regional', 'yeni hesabı başka şubeye lead yap (store rolü)', 'izin', () => setDoc(doc(db, `users/${cr.user.uid}`), { role: 'lead', storeId: 'S2', baristaId: 'bL2', active: true }), 'tasarım (barista yönetimi)');
  await t('regional', 'davet kodlarını listele', 'izin', () => getDocs(query(collection(db, 'invites'), where('baristaId', '==', 'bN'))), 'tasarım');
  await o.close();
}
// ---------------- Operasyon müdürü (alan sınırı: kahve dışı)
{
  const { db } = await as('opsmanager');
  await t('opsmanager', 'kahve modülüne doğrudan yaz (trackId aynı)', 'red', () => updateDoc(doc(db, 'modules/mK'), { title: 'x' }));
  await t('opsmanager', 'kahve dersine doğrudan yaz (moduleId aynı)', 'red', () => updateDoc(doc(db, 'lessons/lK'), { title: 'x' }));
  await t('opsmanager', 'kahve dersini kendi modülüne TAŞIYARAK değiştir (moduleId=mO)', 'red', () => updateDoc(doc(db, 'lessons/lK'), { moduleId: 'mO', title: 'Öğütme (ele geçirildi)', blocks: [] }));
  await t('opsmanager', 'kahve modülünü kendi yoluna taşı (trackId=oryantasyon)', 'red', () => updateDoc(doc(db, 'modules/mK'), { trackId: 'oryantasyon', title: 'Espresso (taşındı)' }));
  await t('opsmanager', 'kahve sorusunu kendi modülüne taşı ve cevabı değiştir', 'red', () => updateDoc(doc(db, 'questions/qK2'), { moduleId: 'mO', answer: 0 }));
  await t('opsmanager', 'Yetkiler belgesine yaz', 'red', () => setDoc(doc(db, 'config/permissions'), { domains: { opsmanager: null } }, { merge: true }));
  await t('opsmanager', 'eğitim yolu oluştur', 'red', () => setDoc(doc(db, 'tracks/yeni'), { title: 'x' }));
}
// ---------------- Direktör
{
  const { db } = await as('director');
  await t('director', 'kendini admin yap', 'red', () => updateDoc(doc(db, `users/${A.director.uid}`), { role: 'admin' }));
  await t('director', 'developer rolünde hesap oluştur', 'red', () => setDoc(doc(db, 'users/yeniDev'), { role: 'developer', active: true }));
  await t('director', 'geliştiricinin belgesi', 'red', () => getDoc(doc(db, `users/${A.dev.uid}`)));
  await t('director', 'geliştiriciyi pasifleştir', 'red', () => updateDoc(doc(db, `users/${A.dev.uid}`), { active: false }));
  await t('director', 'yapay zekâ anahtarını yaz', 'red', () => setDoc(doc(db, 'config/ai'), { apiKey: 'sk-ant-x' }));
  await t('director', 'hata kayıtlarını oku', 'red', () => getDocs(collection(db, 'hatalar')));
  await t('director', 'config/bootstrap sil', 'red', () => deleteDoc(doc(db, 'config/bootstrap')));
  await t('director', 'Yetkiler: kurula içerik yayını ver (roles.board.icerikYayin)', 'izin', () => setDoc(doc(db, 'config/permissions'), { roles: { board: { icerikYayin: true } } }, { merge: true }), 'tasarım ama "kurul salt okunur" kuralı ayarla delinir');
  await t('director', '1 MiB\'a yakın ders (950 KB blok)', 'izin', () => updateDoc(doc(db, 'lessons/lK'), { blocks: [{ type: 'image', url: 'data:image/png;base64,' + big(950) }] }), 'boyut sınırı yalnız Firestore 1 MiB');
}
// kurul artık yayın yetkili mi?
{
  const { db } = await as('board');
  await t('board', '(direktör izni sonrası) ders yaz', 'red', () => updateDoc(doc(db, 'lessons/lK'), { title: 'Kurul yazdı' }), 'perm() rolü sınırlamıyor');
  await adb.doc('config/permissions').update({ roles: {} });
  await t('board', 'öneri oluştur', 'red', () => addDoc(collection(db, 'proposals'), { createdBy: A.board.uid, status: 'pending', ops: [] }));
  await t('board', 'görev ata', 'red', () => addDoc(collection(db, 'assignments'), { storeId: 'S1', createdBy: A.board.uid }));
  await t('board', 'bülten yaz', 'red', () => addDoc(collection(db, 'bulletins'), { createdBy: A.board.uid }));
  await t('board', 'talep durumunu değiştir', 'red', () => updateDoc(doc(db, 'requests/reqS1'), { status: 'done' }));
  await t('board', 'ders yaz', 'red', () => updateDoc(doc(db, 'lessons/lK'), { title: 'x' }));
  await t('board', 'Yetkiler belgesi', 'red', () => setDoc(doc(db, 'config/permissions'), { roles: {} }));
  await t('board', 'barista düzenle', 'red', () => updateDoc(doc(db, 'baristas/bA'), { name: 'x' }));
  await t('board', 'geri bildirim gönder', 'izin', () => addDoc(collection(db, 'feedback'), { by: A.board.uid, status: 'yeni', text: 'kurul geri bildirimi' }), 'her oturuma açık');
  await t('board', 'kendi users.label yaz', 'izin', () => updateDoc(doc(db, `users/${A.board.uid}`), { label: 'x' }), 'zararsız');
  await t('board', 'yanıtlanmış soruda direktörün yanıtını sil/değiştir (messages yeniden yaz)', 'red', () => updateDoc(doc(db, 'boardQuestions/bq1'), { messages: [{ at: now - 2000, by: A.board.uid, byName: 'Kurul Üyesi', side: 'board', text: 'Ciro neden düştü?' }, { at: now - 1000, by: A.director.uid, byName: 'Direktör', side: 'ops', text: 'Bilmiyorum, ilgilenmiyorum.' }], status: 'open', lastSide: 'board', updatedAt: now }));
  await t('board', 'yapay zekâ anahtarı', 'red', () => getDoc(doc(db, 'config/ai')));
  await t('board', 'users listesi (rol süzgeçsiz)', 'red', () => getDocs(collection(db, 'users')));
  await t('board', 'MEŞRU: hata kaydı yaz (belirlenimci kimlik)', 'izin', () => setDoc(doc(db, 'hatalar', hataId(A.board.uid, 0)), { by: A.board.uid, message: 'x', stack: 'y' }), 'her oturuma açık');
  await t('board', 'hata kaydı rastgele kimlikle (addDoc)', 'red', () => addDoc(collection(db, 'hatalar'), { by: A.board.uid, message: 'x', stack: 'y' }), 'günlük sınır kimlikte');
}
// ---------------- Pasif / kenar durumlar
{
  const ex = await as('exops');
  await t('pasif ops', 'içerik oku', 'red', () => getDocs(collection(ex.db, 'lessons')));
  await t('pasif ops', 'kendi belgesini aktif yap', 'red', () => updateDoc(doc(ex.db, `users/${A.exops.uid}`), { active: true }));
  await t('pasif ops', 'hata kaydı yaz (spam)', 'red', () => addDoc(collection(ex.db, 'hatalar'), { by: A.exops.uid, message: 'x', stack: 'y', extra: big(500) }), 'signedIn() yeterli');
  await t('pasif ops', 'config/ai (eski önbellek yoksa)', 'red', () => getDoc(doc(ex.db, 'config/ai')));
  const sa = await as('strActive');
  await t('active:"true" (metin)', 'içerik oku', 'red', () => getDocs(collection(sa.db, 'lessons')));
  const old = await as('bAold');
  await t('eski PIN hesabı', 'Auth girişi', 'izin', async () => 'giriş yapıldı', 'Auth hesabı yaşıyor');
  await t('eski PIN hesabı', 'soru bankası', 'red', () => getDocs(collection(old.db, 'questions')));
  await t('eski PIN hesabı', 'ilerlemeye yaz', 'red', () => updateDoc(doc(old.db, 'progress/bA'), { 'modules.mK': { score: 100 } }));
  const rv = await as('phoneRevoked');
  await t('kaldırılmış telefon', 'baristaları listele', 'red', () => getDocs(query(collection(rv.db, 'baristas'), where('storeId', '==', 'S1'))));
  await t('kaldırılmış telefon', 'davet kodu oku', 'red', () => getDoc(doc(rv.db, `invites/${A.inviteCode}`)));
  const px = await as('bX');
  await t('pasif barista', 'soru bankası', 'red', () => getDocs(collection(px.db, 'questions')));
  await t('pasif barista', 'geri bildirim', 'red', () => addDoc(collection(px.db, 'feedback'), { by: A.bX.uid, status: 'yeni', text: 'x' }));
}
// ---------------- Dışarıdan biri: istemci kaydı (belgesiz Auth hesabı) ve oturumsuz
{
  const o = await (await import('./lib.mjs')).client();
  await t('oturumsuz', 'MEŞRU: config/bootstrap var mı (ilk kurulum ekranı)', 'izin', async () => `alanlar=${Object.keys((await getDoc(doc(o.db, 'config/bootstrap'))).data()).join(',')}`);
  await t('oturumsuz', 'config/bootstrap içinden geliştirici uid oku', 'red', async () => { const d = (await getDoc(doc(o.db, 'config/bootstrap'))).data(); if (!d?.uid) throw Object.assign(new Error('uid yok'), { code: 'uid-yok' }); return 'uid okundu'; });
  await t('oturumsuz', 'geçerli eşleştirme kodunu oku (düz metin şifre)', 'red', async () => { const p = (await getDoc(doc(o.db, `pairingCodes/${A.pairCode}`))).data(); return `email=${p.email}, password=${p.password.slice(0, 6)}…`; }, 'bilinen; kodu bilen herkes', 'K-6 kararı: kod 6 hane/30 dk kalır, telefon kodla oturumsuz okur (eşleştirme akışı)');
  await t('oturumsuz', 'olmayan eşleştirme kodunu oku (resource==null)', 'red', () => getDoc(doc(o.db, 'pairingCodes/000001')), 'kahin kapalı (K-6)');
  const reg = await t('dışarıdan', 'istemciden yeni Auth hesabı aç (apiKey paketten)', 'izin', () => createUserWithEmailAndPassword(o.auth, `yabanci-${now}@saldirgan.test`, 'yabanci-123'), 'Spark: kayıt kapatılamaz');
  await t('belgesiz hesap', 'kendini admin yarat (users/{uid}.role=admin)', 'red', () => setDoc(doc(o.db, `users/${o.auth.currentUser.uid}`), { role: 'admin', active: true }), 'bootstrap var');
  await t('belgesiz hesap', 'config/bootstrap oluştur/üzerine yaz', 'red', () => setDoc(doc(o.db, 'config/bootstrap'), { uid: o.auth.currentUser.uid }));
  await t('belgesiz hesap', 'config/bootstrap {at} ile üzerine yaz', 'red', () => setDoc(doc(o.db, 'config/bootstrap'), { at: now }));
  await t('belgesiz hesap', 'hata kaydı yaz (900 KB, sahte kimlik)', 'red', () => addDoc(collection(o.db, 'hatalar'), { by: o.auth.currentUser.uid, message: 'Kritik: veritabanı silindi', stack: 's', extra: big(900), byName: 'Direktör', role: 'director', storeName: 'Moda' }), 'signedIn() yeterli');
  await t('belgesiz hesap', 'davet oku', 'red', () => getDoc(doc(o.db, `invites/${A.inviteCode}`)));
  await t('belgesiz hesap', 'soru bankası', 'red', () => getDocs(collection(o.db, 'questions')));
  await t('belgesiz hesap', 'demoLog yaz (config/demo yok)', 'red', () => addDoc(collection(o.db, 'demoLog'), { uid: o.auth.currentUser.uid, detail: 'x' }));
  await o.close();
}
// ---------------- Düzeltme sonrası: meşru akışlar hâlâ açık mı, yeni sınırlar tutuyor mu
{
  // Hata kaydı (K-5): günlük belirlenimci kimlik
  const { db } = await as('bA');
  await t('barista', 'MEŞRU: hata kaydı (bugünün 0. sırası)', 'izin', () => setDoc(doc(db, 'hatalar', hataId(A.bA.uid, 0)), { kind: 'hata', message: 'x', stack: 'y', path: '/', version: '1.1.1', bundle: 'b', device: 'Android', by: A.bA.uid, byName: 'Ayşe', role: 'barista', storeName: 'Moda', createdAt: now }));
  await t('barista', 'hata kaydı: aynı kimliğe ikinci kez (üzerine yaz)', 'red', () => setDoc(doc(db, 'hatalar', hataId(A.bA.uid, 0)), { by: A.bA.uid, message: 'y', stack: 'z' }));
  await t('barista', 'hata kaydı: 20. sıra (sınır 0..19)', 'red', () => setDoc(doc(db, 'hatalar', hataId(A.bA.uid, 20)), { by: A.bA.uid, message: 'y', stack: 'z' }));
  await t('barista', 'hata kaydı: 5 gün önceki gün (başka günün kotası)', 'red', () => setDoc(doc(db, 'hatalar', hataId(A.bA.uid, 1, now - 5 * 864e5)), { by: A.bA.uid, message: 'y', stack: 'z' }));
  await t('barista', 'hata kaydı: başkasının uid önekiyle', 'red', () => setDoc(doc(db, 'hatalar', hataId(A.bB.uid, 1)), { by: A.bA.uid, message: 'y', stack: 'z' }));
  await t('barista', 'MEŞRU: hata kaydı 19. sıra', 'izin', () => setDoc(doc(db, 'hatalar', hataId(A.bA.uid, 19)), { by: A.bA.uid, message: 'y', stack: 'z' }));
  // Geri bildirim
  const fb = { kind: 'hata', text: 'Ekran dondu', path: '/akademi', version: '1.1.1 · x', device: 'telefon · 390×844', by: A.bA.uid, byName: 'Ayşe', role: 'barista', storeName: 'Moda', status: 'yeni', createdAt: now };
  await t('barista', 'MEŞRU: geri bildirim + yüklenen görsel (data URL) + ders bağlamı', 'izin', () => addDoc(collection(db, 'feedback'), { ...fb, imageUrl: DATA_IMG, lessonId: 'lK', lessonTitle: 'Öğütme', questionId: 'qK1', questionPrompt: 'Soru 1?' }));
  await t('barista', 'geri bildirim: dış adresli görsel', 'red', () => addDoc(collection(db, 'feedback'), { ...fb, imageUrl: 'https://saldirgan.example/p.png' }));
  await t('barista', 'geri bildirim: data:text/html görsel', 'red', () => addDoc(collection(db, 'feedback'), { ...fb, imageUrl: 'data:text/html;base64,PHNjcmlwdD4=' }));
  // Sınav: kimlik ad alanı ve şube (K-10)
  await t('barista', 'MEŞRU: sınav başlat işlemi (runTransaction, kendi kimliği)', 'izin', () => runTransaction(db, async (tx) => { const r = doc(db, 'attempts/bA_mK_sinav_9'); const s = await tx.get(r); if (!s.exists()) tx.set(r, { baristaId: 'bA', baristaName: 'Ayşe', storeId: 'S1', moduleId: 'mK', moduleTitle: 'Espresso', passScore: 80, lessonId: null, startedAt: now, deadline: now + 9e5, total: 1, questionIds: ['qK1'], orders: {}, answers: {}, submittedAt: null }); }));
  await t('barista', 'MEŞRU: denemeyi teslim et (puanla kapat)', 'izin', () => updateDoc(doc(db, 'attempts/bA_mK_sinav_9'), { submittedAt: now, correct: 1, score: 100, passed: true, mistakes: [], timedOut: false, total: 1 }));
}
{
  const { db } = await as('bB');
  // Kurban, saldırganın kapamadığı kimlikle sınav başlatabiliyor (K-10 öncesi bA bu kimlikleri kapıyordu)
  await t('barista (kurban bB)', 'MEŞRU: kendi kimliğiyle sınav başlat (bB_mO_sinav_1)', 'izin', () => runTransaction(db, async (tx) => { const r = doc(db, 'attempts/bB_mO_sinav_1'); const s = await tx.get(r); if (s.exists()) throw new Error('kimlik dolu'); tx.set(r, { baristaId: 'bB', baristaName: 'Burak', storeId: 'S1', moduleId: 'mO', moduleTitle: 'İlk Gün', passScore: 80, lessonId: null, startedAt: now, deadline: now + 9e5, total: 1, questionIds: ['qK151'], orders: {}, answers: {}, submittedAt: null }); }));
}
{
  // Talepler (K-4, K-5): meşru açma, mağaza notu ekleme, operasyon yanıtı
  const { db } = await as('bL1');
  const base = { storeId: 'S1', storeName: 'Moda', category: 'ariza', priority: 'normal', title: 'Değirmen sesi', detail: 'Öğütürken ses yapıyor', status: 'open', notes: [], createdAt: now, createdBy: A.bL1.uid, createdByName: 'Leyla Müdür', updatedAt: now, lastSide: 'store', closedAt: null };
  const r = await t('lead', 'MEŞRU: talep aç (yüklenen fotoğrafla)', 'izin', async () => (await addDoc(collection(db, 'requests'), { ...base, imageUrl: DATA_IMG, equipment: 'Kahve değirmeni' })).id);
  await t('lead', 'talep: notlarla birlikte aç (geçmişi hazır yaz)', 'red', () => addDoc(collection(db, 'requests'), { ...base, notes: [{ at: now, by: A.regional.uid, byName: 'Bölge', side: 'ops', text: 'Onaylandı' }] }));
  await t('lead', 'talep: 6000 karakter ayrıntı', 'red', () => addDoc(collection(db, 'requests'), { ...base, detail: 'x'.repeat(6000) }));
  const id = r.value;
  const n1 = { at: now, by: A.bL1.uid, byName: 'Leyla Müdür', side: 'store', text: 'Fotoğraf ekledim' };
  await t('lead', 'MEŞRU: kendi talebine mağaza notu ekle (arrayUnion)', 'izin', () => updateDoc(doc(db, 'requests', id), { notes: arrayUnion(n1), updatedAt: now, lastSide: 'store' }));
  await t('lead', 'MEŞRU: eski notlu talebe (reqS1) mağaza notu ekle', 'izin', () => updateDoc(doc(db, 'requests/reqS1'), { notes: arrayUnion({ ...n1, at: now + 1 }), updatedAt: now, lastSide: 'store' }));
  await t('lead', 'talebe side=ops not ekle (sahte operasyon yanıtı)', 'red', () => updateDoc(doc(db, 'requests', id), { notes: arrayUnion({ at: now + 2, by: A.bL1.uid, byName: 'Bölge', side: 'ops', text: 'Onaylıyorum' }), lastSide: 'store' }));
  await t('lead', 'talebe başkası (by=regional) adına not ekle', 'red', () => updateDoc(doc(db, 'requests', id), { notes: arrayUnion({ at: now + 3, by: A.regional.uid, byName: 'Bölge', side: 'store', text: 'x' }), lastSide: 'store' }));
  await t('lead', 'talebe status alanlı not ekle (sahte "çözüldü")', 'red', () => updateDoc(doc(db, 'requests', id), { notes: arrayUnion({ at: now + 4, by: A.bL1.uid, byName: 'Leyla', side: 'store', text: 'x', status: 'done' }), lastSide: 'store' }));
  await t('lead', 'talebe iki not birden ekle', 'red', () => updateDoc(doc(db, 'requests', id), { notes: arrayUnion({ ...n1, at: now + 5 }, { ...n1, at: now + 6 }), lastSide: 'store' }));
  await t('lead', 'talebe 4000 karakter not', 'red', () => updateDoc(doc(db, 'requests', id), { notes: arrayUnion({ ...n1, at: now + 7, text: 'x'.repeat(4000) }), lastSide: 'store' }));
  // Görevler (K-4)
  await t('lead', 'MEŞRU: kendi şubesinin baristasına görev', 'izin', () => addDoc(collection(db, 'assignments'), { storeId: 'S1', createdBy: A.bL1.uid, createdByName: 'Leyla Müdür', kind: 'module', targetId: 'mK', baristaId: 'bA', title: 'Espresso', note: '', dueAt: null, createdAt: now }));
  const g = await addDoc(collection(db, 'assignments'), { storeId: 'S1', createdBy: A.bL1.uid, createdByName: 'Leyla Müdür', kind: 'module', targetId: 'mK', baristaId: null, title: 'Espresso', note: '', dueAt: null, createdAt: now });
  await t('lead', 'MEŞRU: kendi görevinin notunu değiştir (şube aynı)', 'izin', () => updateDoc(g, { note: 'Cumaya kadar' }));
  await t('lead', 'kendi görevini başka şubenin baristasına çevir', 'red', () => updateDoc(g, { baristaId: 'bC' }));
  await t('lead', 'MEŞRU: kendi görevini sil', 'izin', () => deleteDoc(g));
  globalThis.__reqId = id;
}
{
  const { db } = await as('regional');
  const id = globalThis.__reqId;
  await t('regional', 'MEŞRU: talebe operasyon yanıtı + durum (arrayUnion)', 'izin', () => updateDoc(doc(db, 'requests', id), { notes: arrayUnion({ at: now + 10, by: A.regional.uid, byName: 'Bölge', side: 'ops', text: 'Servis yarın', status: 'in_progress' }), status: 'in_progress', updatedAt: now + 10, lastSide: 'ops', closedAt: null, waitReason: 'servis' }));
  await t('regional', 'MEŞRU: yeni davet kodu için çakışma denetimi (olmayan kod)', 'izin', () => getDoc(doc(db, 'invites/000999')));
  await t('regional', 'MEŞRU: başka şubenin daveti (barista yönetimi)', 'izin', () => getDoc(doc(db, `invites/${A.inviteCode}`)));
  await t('regional', 'MEŞRU: eşleştirme kodu çakışma denetimi (olmayan kod)', 'izin', () => getDoc(doc(db, 'pairingCodes/000777')));
  await t('regional', 'yapay zekâ anahtarı (K-7 daraltma)', 'red', () => getDoc(doc(db, 'config/ai')));
  await t('regional', 'MEŞRU: görev ata (tüm mağazalar)', 'izin', () => addDoc(collection(db, 'assignments'), { storeId: 'S2', createdBy: A.regional.uid, createdByName: 'Bölge', kind: 'module', targetId: 'mK', baristaId: null, title: 'Espresso', note: '', dueAt: null, createdAt: now }));
  await t('regional', 'görevi başka şubenin baristasına ata (storeId=S1, bC)', 'red', () => addDoc(collection(db, 'assignments'), { storeId: 'S1', createdBy: A.regional.uid, createdByName: 'Bölge', kind: 'module', targetId: 'mK', baristaId: 'bC', title: 'x', createdAt: now }));
}
{
  // Davet: telefon kendi şubesinin davetini okur (redeemInvite), başkasınınkini değil (K-2)
  const { db } = await as('phone1');
  await t('telefon', 'MEŞRU: kendi şubesinin davetini oku', 'izin', () => getDoc(doc(db, `invites/${A.inviteS1}`)));
  await t('telefon', 'olmayan davet kodunu oku (kahin)', 'red', () => getDoc(doc(db, 'invites/000999')));
  await t('telefon', 'MEŞRU: kendi users.label/paired/lastSeenAt', 'izin', () => updateDoc(doc(db, `users/${A.phone1.uid}`), { paired: true, label: 'Android telefon', lastSeenAt: now }));
}
{
  // Kurul soruları: yazışma yalnızca sona eklenir
  const b = await as('board');
  const q = await t('board', 'MEŞRU: kurul sorusu sor', 'izin', async () => (await addDoc(collection(b.db, 'boardQuestions'), { topic: { kind: 'general', id: null, title: 'Genel' }, to: 'director', messages: [{ at: now, by: A.board.uid, byName: 'Kurul Üyesi', side: 'board', text: 'Nasıl gidiyor?' }], status: 'open', lastSide: 'board', createdAt: now, createdBy: A.board.uid, createdByName: 'Kurul Üyesi', updatedAt: now })).id);
  await t('board', 'kurul sorusu: başkası adına mesajla aç', 'red', () => addDoc(collection(b.db, 'boardQuestions'), { topic: { kind: 'general', id: null, title: 'Genel' }, to: 'director', messages: [{ at: now, by: A.director.uid, byName: 'Direktör', side: 'ops', text: 'x' }], status: 'open', lastSide: 'board', createdAt: now, createdBy: A.board.uid, createdByName: 'Kurul Üyesi', updatedAt: now }));
  const d = await as('director');
  await t('director', 'MEŞRU: kurul sorusunu yanıtla (arrayUnion)', 'izin', () => updateDoc(doc(d.db, 'boardQuestions', q.value), { messages: arrayUnion({ at: now + 1, by: A.director.uid, byName: 'Direktör', side: 'ops', text: 'İyi.' }), status: 'answered', lastSide: 'ops', updatedAt: now + 1 }));
  await t('board', 'MEŞRU: ek soru yaz (arrayUnion)', 'izin', () => updateDoc(doc(b.db, 'boardQuestions', q.value), { messages: arrayUnion({ at: now + 2, by: A.board.uid, byName: 'Kurul Üyesi', side: 'board', text: 'Ayrıntı?' }), status: 'open', lastSide: 'board', updatedAt: now + 2 }));
  await t('board', 'MEŞRU: soruyu kapat', 'izin', () => updateDoc(doc(b.db, 'boardQuestions', q.value), { status: 'closed', lastSide: 'board', updatedAt: now + 3 }));
  // K-8: kurul kurul.* dışında yetki alamaz; kurul.* yetkisi hâlâ çalışır
  await adb.doc('config/permissions').update({ roles: { board: { icerikYayin: true, bultenYayin: true, gorevAtama: true, kurulYanit: true } } });
  await t('board', '(direktör içerik/bülten/görev/yanıt yetkisi verdi) bülten yaz', 'red', () => addDoc(collection(b.db, 'bulletins'), { title: 'Kurul', body: 'x', createdBy: A.board.uid }));
  await t('board', '(yetki verildi) görev ata', 'red', () => addDoc(collection(b.db, 'assignments'), { storeId: 'S1', createdBy: A.board.uid, kind: 'module', targetId: 'mK', baristaId: null }));
  await t('board', '(kurulYanit verildi) kendi sorusunu ops olarak yanıtla', 'red', () => updateDoc(doc(b.db, 'boardQuestions', q.value), { messages: arrayUnion({ at: now + 4, by: A.board.uid, byName: 'Kurul', side: 'ops', text: 'x' }), status: 'answered', lastSide: 'ops', updatedAt: now + 4 }));
  await adb.doc('config/permissions').update({ roles: { board: { 'kurul.sorular': false } } });
  await t('board', '(kurul.sorular kapatıldı) soru sor', 'red', () => addDoc(collection(b.db, 'boardQuestions'), { topic: { kind: 'general', id: null, title: 'Genel' }, to: 'director', messages: [{ at: now, by: A.board.uid, byName: 'Kurul Üyesi', side: 'board', text: 'x' }], status: 'open', lastSide: 'board', createdAt: now, createdBy: A.board.uid, createdByName: 'Kurul Üyesi', updatedAt: now }));
  await adb.doc('config/permissions').update({ roles: {} });
}
{
  // İçerik: meşru yayın, görsel kısıtı, eski kayıt, alan sınırı, öneri
  const { db } = await as('director');
  await t('director', 'MEŞRU: yapay zekâ anahtarını oku', 'izin', () => getDoc(doc(db, 'config/ai')));
  await t('director', 'MEŞRU: bülten + yüklenen görsel', 'izin', () => setDoc(doc(db, 'bulletins/blYeni'), { kind: 'duyuru', title: 'Yeni', body: '**Merhaba**', storeIds: null, imageUrl: DATA_IMG, published: true, pinned: false, createdAt: now, createdBy: A.director.uid, createdByName: 'Direktör', updatedAt: now }));
  await t('director', 'bülten: dış adresli görsel', 'red', () => setDoc(doc(db, 'bulletins/blDis'), { title: 'Dış', body: 'x', imageUrl: 'https://izleme.example/p.gif', createdBy: A.director.uid }));
  await t('director', 'MEŞRU: dış görselli ESKİ bülteni yayından kaldır (görsel değişmiyor)', 'izin', () => updateDoc(doc(db, 'bulletins/blEski'), { published: false, updatedAt: now }));
  await t('director', 'MEŞRU: soru düzelt (imageUrl boş)', 'izin', () => updateDoc(doc(db, 'questions/qK1'), { prompt: 'Soru 1 (düzeltildi)?', imageUrl: '', updatedAt: now }));
  await t('director', 'soruya dış adresli görsel', 'red', () => updateDoc(doc(db, 'questions/qK2'), { imageUrl: 'http://izleme.example/p.gif' }));
  await t('director', 'ders başlığı 400 karakter', 'red', () => updateDoc(doc(db, 'lessons/lK'), { title: 'x'.repeat(400) }));
  await t('director', 'MEŞRU: ders düzenle', 'izin', () => updateDoc(doc(db, 'lessons/lK'), { title: 'Öğütme', blocks: [{ type: 'text', text: 'Öğütme derecesi…' }], updatedAt: now }));
  await t('director', 'MEŞRU: soru düzenleme önerisini onayla (proposals update)', 'izin', () => updateDoc(doc(db, 'proposals/pOps2'), { status: 'approved', reviewedAt: now, reviewedBy: A.director.uid, reviewedByName: 'Direktör', editedOnReview: false }));
}
{
  const { db } = await as('opsmanager');
  await t('opsmanager', 'yapay zekâ anahtarı (K-7 daraltma)', 'red', () => getDoc(doc(db, 'config/ai')));
  await t('opsmanager', 'MEŞRU: kendi alanındaki (oryantasyon) modülü düzenle', 'izin', () => updateDoc(doc(db, 'modules/mO'), { title: 'İlk Gün', updatedAt: now }));
  await t('opsmanager', 'MEŞRU: kendi alanında ders oluştur', 'izin', () => setDoc(doc(db, 'lessons/lO'), { title: 'Hoş geldin', moduleId: 'mO', order: 1, published: true, blocks: [], updatedAt: now }));
  await t('opsmanager', 'kendi alanındaki dersi kahve modülüne taşı', 'red', () => updateDoc(doc(db, 'lessons/lO'), { moduleId: 'mK' }));
}
{
  const { db } = await as('ops');
  await t('ops', 'MEŞRU: içerik önerisi gönder', 'izin', () => addDoc(collection(db, 'proposals'), { kind: 'lesson', title: 'Öğütme düzeltmesi', summary: 'Ders düzenlendi', ops: [{ op: 'update', col: 'lessons', id: 'lK', data: { title: 'Öğütme' } }], status: 'pending', createdAt: now, createdBy: A.ops.uid, createdByName: 'Ops Üyesi', baseUpdatedAt: {} }));
  // Kural düzeyinde ops listesi denetlenemiyor (bkz. firestore.rules proposals); kapı changes.ts (zincir.mjs A).
  await t('ops', 'öneri içine config/permissions işlemi gizle (kural düzeyi)', 'red', () => addDoc(collection(db, 'proposals'), { kind: 'lesson', title: 'x', summary: 'x', ops: [{ op: 'set', col: 'config', id: 'permissions', data: {} }], status: 'pending', createdAt: now, createdBy: A.ops.uid, createdByName: 'Ops' }), '', 'kural dilinde ops listesi denetlenemiyor (1000 ifade sınırı); changes.ts beyaz listesi ve DiffSheet yayınlamayı engelliyor — zincir.mjs A');
  await t('ops', 'öneri başlığı 1000 karakter', 'red', () => addDoc(collection(db, 'proposals'), { kind: 'lesson', title: 'x'.repeat(1000), summary: '', ops: [], status: 'pending', createdBy: A.ops.uid }));
}
{
  // İlk kurulum (K-3): belge yokken bir kez, kimliksiz; sonra kapalı
  const saved = (await adb.doc('config/bootstrap').get()).data();
  await adb.doc('config/bootstrap').delete();
  const { client: yeni } = await import('./lib.mjs');
  const k1 = await yeni();
  const c1 = await createUserWithEmailAndPassword(k1.auth, `kurulum-${now}@ornek.test`, 'kurulum-123');
  await t('ilk kurulum', 'bootstrap belgesine uid yaz', 'red', async () => { const b = writeBatch(k1.db); b.set(doc(k1.db, 'users', c1.user.uid), { role: 'admin', name: 'Kurucu', email: 'k@ornek.test', active: true, createdAt: now }); b.set(doc(k1.db, 'config/bootstrap'), { uid: c1.user.uid, at: now }); await b.commit(); });
  await t('ilk kurulum', 'bootstrap işaretini admin olmadan yaz', 'red', () => setDoc(doc(k1.db, 'config/bootstrap'), { at: now }));
  await t('ilk kurulum', 'MEŞRU: ilk admin + bootstrap {at} (backend.bootstrapAdmin ile aynı)', 'izin', async () => { const b = writeBatch(k1.db); b.set(doc(k1.db, 'users', c1.user.uid), { role: 'admin', name: 'Kurucu', email: 'k@ornek.test', active: true, createdAt: now }); b.set(doc(k1.db, 'config/bootstrap'), { at: now }); await b.commit(); });
  const k2 = await yeni();
  const c2 = await createUserWithEmailAndPassword(k2.auth, `kurulum2-${now}@ornek.test`, 'kurulum-123');
  await t('ilk kurulum', 'kurulumdan sonra ikinci hesap kendini admin yapar', 'red', async () => { const b = writeBatch(k2.db); b.set(doc(k2.db, 'users', c2.user.uid), { role: 'admin', active: true }); b.set(doc(k2.db, 'config/bootstrap'), { at: now }); await b.commit(); });
  await t('ilk kurulum', 'MEŞRU: kurulum belgesi kimliksiz', 'izin', async () => { const d = (await adb.doc('config/bootstrap').get()).data(); if (Object.keys(d).join() !== 'at') throw new Error('alanlar: ' + Object.keys(d)); return 'yalnızca at'; });
  await adb.doc(`users/${c1.user.uid}`).delete();
  await adb.doc('config/bootstrap').set(saved);
  await k1.close(); await k2.close();
}
writeFileSync(new URL('./out/matris.json', import.meta.url), JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => !r.ok);
const kabul = rows.filter((r) => r.kabul);
console.log(`\n${rows.length} deneme, beklenenden farklı: ${bad.length}; bilerek kabul edilen (~~): ${kabul.length}`);
for (const c of Object.values(C)) await c.close();
process.exit(0);
