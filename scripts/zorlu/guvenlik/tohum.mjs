// Saldırı denemeleri için küçük ama gerçekçi bir veri seti (yalnızca kendi emülatörümüz).
import { adb, aauth } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const D = 'hesap.playbook1401.app';
const now = Date.now();
const acc = {};
async function user(key, email, password, doc) {
  const u = await aauth.createUser({ email, password }).catch(async (e) => {
    if (e.code === 'auth/email-already-exists') return aauth.getUserByEmail(email); throw e; });
  await aauth.updateUser(u.uid, { password });
  acc[key] = { uid: u.uid, email, password };
  if (doc) await adb.doc(`users/${u.uid}`).set({ ...doc, createdAt: now });
  return u.uid;
}
const staff = (r, name) => ({ role: r, name, email: `${r}@ornek.test`, active: true });
await user('dev', 'dev@ornek.test', 'gelistirici-123', staff('developer', 'Geliştirici'));
await user('director', 'director@ornek.test', 'direktor-123', staff('director', 'Direktör'));
await user('opsmanager', 'opsmanager@ornek.test', 'opsmud-123', staff('opsmanager', 'Ops Müdürü'));
await user('regional', 'regional@ornek.test', 'bolge-123', staff('regional', 'Bölge'));
await user('ops', 'ops@ornek.test', 'ops-12345', staff('ops', 'Ops Üyesi'));
await user('ops2', 'ops2@ornek.test', 'ops2-12345', staff('ops', 'Ops İki'));
await user('board', 'board@ornek.test', 'kurul-123', staff('board', 'Kurul Üyesi'));
await user('exops', 'exops@ornek.test', 'exops-123', { ...staff('ops', 'Ayrılan Ops'), active: false });
await user('strActive', 'stractive@ornek.test', 'str-12345', { ...staff('ops', 'String Aktif'), active: 'true' });
await user('nodoc', 'nodoc@ornek.test', 'nodoc-123', null);

// Mağazalar
for (const [id, name] of [['S1', 'Moda'], ['S2', 'Kadıköy']]) await adb.doc(`stores/${id}`).set({ name, active: true, createdAt: now });
// Telefonlar
await user('phone1', `tel-S1-aaaaaa@${D}`, 'telefon1-sifre-uzun-rastgele-xx', { role: 'store', storeId: 'S1', active: true, paired: true, label: 'Mağaza telefonu', lastSeenAt: null });
await user('phone2', `tel-S2-bbbbbb@${D}`, 'telefon2-sifre-uzun-rastgele-yy', { role: 'store', storeId: 'S2', active: true, paired: true, label: 'Mağaza telefonu', lastSeenAt: null });
await user('phoneRevoked', `tel-S1-cccccc@${D}`, 'telefon3-sifre-uzun-rastgele-zz', { role: 'store', storeId: 'S1', active: false, paired: true, label: 'Eski telefon', revokedAt: now });

// Baristalar
const B = [
  ['bA', 'S1', 'barista', 'Ayşe Barista', '4826'],
  ['bB', 'S1', 'barista', 'Burak Barista', '7391'],
  ['bL1', 'S1', 'lead', 'Leyla Müdür', '5502'],
  ['bL2', 'S2', 'lead', 'Kerem Müdür', '6613'],
  ['bC', 'S2', 'barista', 'Cem Barista', '8204'],
  ['bX', 'S1', 'barista', 'Pasif Barista', '1357']
];
for (const [id, storeId, role, name, pin] of B) {
  const email = `b-${id.toLowerCase()}-1@${D}`;
  const uid = await user(id, email, `pb-${id}-${pin}`, { role, baristaId: id, storeId, active: id !== 'bX' });
  acc[id].pin = pin; acc[id].baristaId = id; acc[id].storeId = storeId;
  await adb.doc(`baristas/${id}`).set({ name, storeId, role, phone: '0555 000 00 00', active: id !== 'bX', pinPending: false, uid, authEmail: email, accountSeq: 1, startedAt: '2026-01-01', createdAt: now });
  await adb.doc(`progress/${id}`).set({ baristaId: id, storeId, lessons: {}, modules: {}, updatedAt: now });
}
// Eski PIN hesabı: bA'nın PIN'i sıfırlanmış gibi (seq 1 pasif, seq 2 etkin)
await user('bAold', `b-ba-0@${D}`, 'pb-bA-1111', { role: 'barista', baristaId: 'bA', storeId: 'S1', active: false });

// Davet: S2'deki yeni barista bN (hesap davet şifresiyle açılmış, PIN bekliyor)
const inviteCode = '483920';
await user('bN', `b-bn-1@${D}`, `davet-${inviteCode}-1401`, { role: 'barista', baristaId: 'bN', storeId: 'S2', active: true });
await adb.doc(`baristas/bN`).set({ name: 'Nur Yeni', storeId: 'S2', role: 'barista', active: true, pinPending: true, uid: acc.bN.uid, authEmail: acc.bN.email, accountSeq: 1, startedAt: '2026-11-15', createdAt: now, inviteExpiresAt: now + 7 * 864e5 });
await adb.doc(`progress/bN`).set({ baristaId: 'bN', storeId: 'S2', lessons: {}, modules: {}, updatedAt: now });
await adb.doc(`invites/${inviteCode}`).set({ baristaId: 'bN', uid: acc.bN.uid, email: acc.bN.email, storeId: 'S2', expiresAt: now + 7 * 864e5 });
acc.inviteCode = inviteCode;
// S1'in kendi daveti (telefonun kendi şubesinin davetini okuyabildiğini görmek için)
const inviteS1 = '615243';
await adb.doc(`invites/${inviteS1}`).set({ baristaId: 'bY', uid: 'bY-uid-yok', email: `b-by-1@${D}`, storeId: 'S1', expiresAt: now + 7 * 864e5 });
acc.inviteS1 = inviteS1;
// Eşleştirme kodu: S2 için yeni telefon (düz metin şifre taşır — gerçek biçim)
const pairCode = '730158';
await user('phoneNew', `tel-S2-dddddd@${D}`, 'yeni-telefon-sifresi-28karakterxx', { role: 'store', storeId: 'S2', active: true, paired: false, label: 'Mağaza telefonu', lastSeenAt: null });
await adb.doc(`pairingCodes/${pairCode}`).set({ uid: acc.phoneNew.uid, email: acc.phoneNew.email, password: acc.phoneNew.password, storeId: 'S2', storeName: 'Kadıköy', expiresAt: now + 30 * 60000 });
acc.pairCode = pairCode;

// Yapılandırma
// Yeni biçim (K-3 düzeltmesi): kimlik yok, yalnızca "kurulum yapıldı" zamanı.
// Canlı ve demoda eski belgede `uid` alanı hâlâ duruyor; elle silinmeli.
await adb.doc('config/bootstrap').set({ at: now - 90 * 864e5 });
await adb.doc('config/ai').set({ apiKey: 'sk-ant-api03-SAHTE-TEST-ANAHTARI', updatedAt: now, updatedBy: '' });
await adb.doc('config/permissions').set({ roles: {}, domains: {}, updatedAt: now, updatedByName: '', log: [
  { at: now - 864e5, byName: '', text: 'Kahve Operasyonu: Görev ata kapatıldı', dev: true },
  { at: now - 3600e3, byName: 'Direktör', text: 'Bölge: Talepleri yanıtla açıldı' }] });
await adb.doc('config/badges').set({ rules: [], updatedAt: now });

// İçerik
await adb.doc('tracks/kahve').set({ title: 'Kahve', order: 1, published: true });
await adb.doc('tracks/oryantasyon').set({ title: 'Oryantasyon', order: 2, published: true });
await adb.doc('modules/mK').set({ title: 'Espresso Temelleri', trackId: 'kahve', order: 1, published: true, passScore: 80, examSize: 10 });
await adb.doc('modules/mO').set({ title: 'İlk Gün', trackId: 'oryantasyon', order: 1, published: true, passScore: 80, examSize: 10 });
await adb.doc('lessons/lK').set({ title: 'Öğütme', moduleId: 'mK', order: 1, published: true, blocks: [{ type: 'text', text: 'Öğütme derecesi…' }] });
let batch = adb.batch();
for (let i = 1; i <= 200; i++) {
  batch.set(adb.doc(`questions/qK${i}`), { moduleId: i <= 150 ? 'mK' : 'mO', lessonId: null, type: 'single', prompt: `Soru ${i}?`, options: ['A', 'B', 'C', 'D'], answer: i % 4, explanation: 'Açıklama' });
}
await batch.commit();

// Sonuçlar
await adb.doc('attempts/bB_mK_sinav_1').set({ baristaId: 'bB', baristaName: 'Burak Barista', storeId: 'S1', moduleId: 'mK', moduleTitle: 'Espresso Temelleri', passScore: 80, lessonId: null, startedAt: now - 3600e3, deadline: now - 3000e3, total: 10, questionIds: ['qK1'], orders: {}, answers: {}, submittedAt: now - 3100e3, correct: 4, score: 40, passed: false, mistakes: [] });
await adb.doc('attempts/bC_mK_sinav_1').set({ baristaId: 'bC', baristaName: 'Cem Barista', storeId: 'S2', moduleId: 'mK', moduleTitle: 'Espresso Temelleri', passScore: 80, lessonId: null, startedAt: now - 3600e3, deadline: now - 3000e3, total: 10, questionIds: ['qK1'], orders: {}, answers: {}, submittedAt: now - 3100e3, correct: 9, score: 90, passed: true, mistakes: [] });
// Talepler
const note = (side, by, byName, text) => ({ at: now - 1000, by, byName, side, text });
await adb.doc('requests/reqS1').set({ storeId: 'S1', storeName: 'Moda', category: 'ekipman', priority: 'normal', title: 'Değirmen arızalı', detail: 'x', status: 'progress', notes: [note('store', acc.bL1.uid, 'Leyla Müdür', 'Değirmen çalışmıyor'), note('ops', acc.regional.uid, 'Bölge', 'Servis yarın geliyor, ücret mağaza bütçesinden'), note('ops', acc.dev.uid, '', 'Kayıt düzeltildi')], createdAt: now - 864e5, createdBy: acc.bL1.uid, createdByName: 'Leyla Müdür', updatedAt: now, lastSide: 'ops', closedAt: null });
await adb.doc('requests/reqS2').set({ storeId: 'S2', storeName: 'Kadıköy', category: 'personel', priority: 'normal', title: 'Gizli personel talebi', detail: 'Cem işten çıkarılacak', status: 'open', notes: [], createdAt: now, createdBy: acc.bL2.uid, createdByName: 'Kerem Müdür', updatedAt: now, lastSide: 'store', closedAt: null });
// Görevler
await adb.doc('assignments/asgS2').set({ kind: 'module', targetId: 'mK', title: 'Espresso', note: '', baristaId: null, dueAt: null, createdAt: now, createdBy: acc.ops.uid, createdByName: 'Ops Üyesi', storeId: 'S2' });
// Öneri (ops2'nin)
await adb.doc('proposals/pOps2').set({ kind: 'lesson', title: 'Öğütme düzeltmesi', summary: '', ops: [{ op: 'update', col: 'lessons', id: 'lK', data: { title: 'Öğütme (yeni)' } }], status: 'pending', createdAt: now, createdBy: acc.ops2.uid, createdByName: 'Ops İki' });
// Kurul sorusu (yanıtlanmış)
await adb.doc('boardQuestions/bq1').set({ topic: { kind: 'genel', id: null, title: 'Genel' }, to: 'director', status: 'answered', lastSide: 'ops', createdBy: acc.board.uid, createdByName: 'Kurul Üyesi', createdAt: now, updatedAt: now, messages: [{ at: now - 2000, by: acc.board.uid, byName: 'Kurul Üyesi', side: 'board', text: 'Ciro neden düştü?' }, { at: now - 1000, by: acc.director.uid, byName: 'Direktör', side: 'ops', text: 'Moda şubesinde 2 hafta tadilat vardı.' }] });
// Eski kayıt: dış adresli görselli bülten (yeni kural yalnızca görsel DEĞİŞİRSE denetler).
await adb.doc('bulletins/blEski').set({ title: 'Eski duyuru', body: 'x', storeIds: null, imageUrl: 'https://eski.example/a.png', createdBy: acc.director.uid, createdAt: now, published: true });
await adb.doc('bulletins/bl1').set({ title: 'Duyuru', body: 'Merhaba', storeIds: ['S1'], createdBy: acc.director.uid, createdAt: now, published: true });
writeFileSync(new URL('./out/hesaplar.json', import.meta.url), JSON.stringify(acc, null, 1));
console.log('tohum tamam', Object.keys(acc).length, 'hesap');
process.exit(0);
