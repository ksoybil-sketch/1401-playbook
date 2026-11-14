/**
 * Madde 2 (+4, 10, 11 node tarafı): etkin hesaplar işini yapabiliyor mu,
 * pasif/eski/kaldırılmış hesaplar reddediliyor mu? Uygulamanın gerçek
 * modülleri (backend.ts, exam.ts, requests.ts, changes.ts, board.ts) ile.
 * Tohum + geçmişten SONRA, simülasyondan ÖNCE çalıştırılır (kendi baristalarını kullanır).
 *   node --experimental-transform-types --no-warnings --import ./lib/kayit.mjs kurallar.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { client, dene } from './lib/istemci.mjs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { getAuth } = await import('firebase-admin/auth');
initializeApp({ projectId: 'demo-playbook' });
const adb = getFirestore();
const aauth = getAuth();
const H = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url), 'utf8'));
const CUR = JSON.parse(readFileSync(new URL('../../src/generated/curriculum.json', import.meta.url), 'utf8'));
const SONUC = [];
const kontrol = (grup, ad, beklenen, gercek, ek = {}) => {
  const ok = beklenen === gercek;
  SONUC.push({ grup, ad, beklenen, gercek, ok, ...ek });
  console.log(`${ok ? 'GEÇTİ' : 'KALDI'} | ${grup} | ${ad} | beklenen=${beklenen} gerçek=${gercek}`);
};
const staff = (role, i = 0) => H.staff.filter((s) => s.role === role)[i];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOD = CUR.modules.find((m) => m.id === 'hos-geldin') || CUR.modules.find((m) => !m.prerequisiteId);
const LESSON = CUR.lessons.find((l) => l.moduleId === MOD.id);

async function staffC(s) {
  const c = await client(`k-${s.role}-${s.uid.slice(0, 4)}`); await c.signIn(s.email, s.password); await c.asStaff(s);
  // Panelde içerik deposu dolu (App.tsx abone olur); alan denetimi (changes.ts) buna bakar.
  (await c.m('store/content.ts')).useContent.setState({ tracks: CUR.tracks, modules: CUR.modules, lessons: CUR.lessons });
  return c;
}
const F = (c) => c.fs;

/** Ortak okuma seti: içerik ve mağazalar (herkes, etkin). */
async function contentReads(c, grup, beklenen) {
  const { getDocs, getDoc, collection, doc } = F(c);
  kontrol(grup, 'içerik okuma (modules)', beklenen, await dene(getDocs(collection(c.db, 'modules'))));
  kontrol(grup, 'mağazalar okuma', beklenen, await dene(getDocs(collection(c.db, 'stores'))));
  kontrol(grup, 'config/badges okuma', beklenen, await dene(getDoc(doc(c.db, 'config', 'badges'))));
}
/** Uygulamanın sınav cevaplarını bulmak için: denemenin sırasından doğru şık. */
async function answersOf(attemptId, session, skill = 1) {
  const a = (await adb.doc(`attempts/${attemptId}`).get()).data();
  const out = {};
  session.questions.forEach((q, i) => {
    const real = CUR.questions.find((x) => x.id === q.id);
    const right = a.orders[q.id].indexOf(real.answer);
    out[q.id] = i < Math.round(session.questions.length * skill) ? right : (right + 1) % a.orders[q.id].length;
  });
  return out;
}

// ======================================================================
// A) ETKİN HESAPLAR — hiçbir rol yanlışlıkla kilitlenmemeli
// ======================================================================
const B = H.baristas;
const phone = H.phones[0];
{ // Mağaza telefonu
  const c = await client('k-store'); await c.signIn(phone.email, phone.password);
  const { getDocs, getDoc, updateDoc, collection, doc, query, where } = F(c);
  const g = 'store (telefon)';
  kontrol(g, 'kendi users belgesi', 'ok', await dene(getDoc(doc(c.db, 'users', c.uid()))));
  await contentReads(c, g, 'ok');
  kontrol(g, 'mağaza baristaları (StoreHome)', 'ok', await dene(getDocs(query(collection(c.db, 'baristas'), where('storeId', '==', phone.storeId), where('active', '==', true)))));
  kontrol(g, 'lastSeenAt yaz', 'ok', await dene(updateDoc(doc(c.db, 'users', c.uid()), { lastSeenAt: Date.now() })));
  kontrol(g, 'soru bankası okuma', 'ok', await dene(getDocs(query(collection(c.db, 'questions'), where('moduleId', '==', MOD.id)))));
  kontrol(g, 'bültenler okuma', 'ok', await dene(getDocs(collection(c.db, 'bulletins'))));
  kontrol(g, 'geri bildirim yaz', 'ok', await dene(F(c).addDoc(collection(c.db, 'feedback'), { by: c.uid(), status: 'yeni', text: 'telefondan deneme', createdAt: Date.now() })));
  kontrol(g, 'başka mağazanın baristaları (red beklenir)', 'red', await dene(getDocs(query(collection(c.db, 'baristas'), where('storeId', '==', H.phones[1].storeId)))));
}
for (const role of ['barista', 'lead', 'shift']) {
  const b = B.find((x) => x.role === role && x.pin && x.storeId === H.phones[2].storeId) || B.find((x) => x.role === role && x.pin);
  const c = await client(`k-${role}`);
  await c.backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin);
  const { getDocs, getDoc, updateDoc, collection, doc, query, where, orderBy, limit, addDoc } = F(c);
  const g = role;
  kontrol(g, 'PIN girişi + kendi users', 'ok', await dene(getDoc(doc(c.db, 'users', c.uid()))));
  await contentReads(c, g, 'ok');
  kontrol(g, 'kendi baristas belgesi', 'ok', await dene(getDoc(doc(c.db, 'baristas', b.id))));
  kontrol(g, 'kendi progress', 'ok', await dene(getDoc(doc(c.db, 'progress', b.id))));
  kontrol(g, 'ders tamamla (progress yaz)', 'ok', await dene(updateDoc(doc(c.db, 'progress', b.id), { [`lessons.${LESSON.id}`]: Date.now(), updatedAt: Date.now() })));
  kontrol(g, 'kendi denemeleri (300)', 'ok', await dene(getDocs(query(collection(c.db, 'attempts'), where('baristaId', '==', b.id), orderBy('startedAt', 'desc'), limit(300)))));
  kontrol(g, 'mağaza görevleri', 'ok', await dene(getDocs(query(collection(c.db, 'assignments'), where('storeId', '==', b.storeId)))));
  kontrol(g, 'bültenler (50)', 'ok', await dene(getDocs(query(collection(c.db, 'bulletins'), orderBy('createdAt', 'desc'), limit(50)))));
  // Sınav: başla → cevapla → teslim
  let st = 'ok';
  try {
    const s = await c.exam.startExam(MOD, { baristaId: b.id, storeId: b.storeId, name: b.name }, null);
    const ans = await answersOf(s.attemptId, s, 0.9);
    await c.exam.saveAnswers(s.attemptId, ans);
    const r = await c.exam.submitExam(s.attemptId, ans, { questionIds: s.questions.map((q) => q.id), baristaId: b.id });
    st = r && typeof r.score === 'number' ? 'ok' : 'sonuç yok';
  } catch (e) { st = `hata:${e.code || ''}:${e.message}`; }
  kontrol(g, 'sınav başla + teslim', 'ok', st);
  if (role !== 'barista') {
    kontrol(g, 'ekibim: mağaza denemeleri (400)', 'ok', await dene(getDocs(query(collection(c.db, 'attempts'), where('storeId', '==', b.storeId), orderBy('startedAt', 'desc'), limit(400)))));
    kontrol(g, 'ekibim: mağaza progress', 'ok', await dene(getDocs(query(collection(c.db, 'progress'), where('storeId', '==', b.storeId)))));
    const rq = await c.m('api/requests.ts');
    let rid = null;
    kontrol(g, 'talep aç', 'ok', await dene(rq.createRequest({ storeId: b.storeId, storeName: b.storeId, category: 'ariza', priority: 'normal', title: `${role} talebi`, detail: 'deneme', by: { uid: c.uid(), name: b.name } }).then((id) => (rid = id))));
    kontrol(g, 'mağaza talepleri oku', 'ok', await dene(getDocs(query(collection(c.db, 'requests'), where('storeId', '==', b.storeId)))));
    if (rid) {
      const req = { id: rid, ...(await adb.doc(`requests/${rid}`).get()).data() };
      kontrol(g, 'açık talebe yaz', 'ok', await dene(rq.addNote(req, { side: 'store', by: { uid: c.uid(), name: b.name }, text: 'ek bilgi' })));
    }
    kontrol(g, 'mağazaya görev aç', 'ok', await dene(addDoc(collection(c.db, 'assignments'), { kind: 'lesson', targetId: LESSON.id, title: 'x', note: '', storeId: b.storeId, baristaId: null, dueAt: Date.now() + 86400000, createdAt: Date.now(), createdBy: c.uid(), createdByName: b.name })));
  } else {
    kontrol(g, 'talep aç (red beklenir)', 'red', await dene(addDoc(collection(c.db, 'requests'), { storeId: b.storeId, createdBy: c.uid(), status: 'open', lastSide: 'store', title: 'x' })));
  }
  kontrol(g, 'geri bildirim yaz', 'ok', await dene(addDoc(collection(c.db, 'feedback'), { by: c.uid(), status: 'yeni', text: 'barista geri bildirim', createdAt: Date.now() })));
}
// Ekip rolleri
const staffRows = {};
for (const role of ['developer', 'director', 'opsmanager', 'regional', 'ops', 'board']) {
  const s = staff(role);
  const c = await staffC(s);
  staffRows[role] = c;
  const { getDocs, getDoc, collection, doc, query, where, orderBy, limit } = F(c);
  const g = role;
  kontrol(g, 'kendi users', 'ok', await dene(getDoc(doc(c.db, 'users', s.uid))));
  await contentReads(c, g, 'ok');
  kontrol(g, 'config/permissions', 'ok', await dene(getDoc(doc(c.db, 'config', 'permissions'))));
  kontrol(g, 'baristas (panel)', 'ok', await dene(getDocs(collection(c.db, 'baristas'))));
  kontrol(g, 'progress (panel)', 'ok', await dene(getDocs(collection(c.db, 'progress'))));
  kontrol(g, 'teslim edilmiş son 50 sınav', 'ok', await dene(getDocs(query(collection(c.db, 'attempts'), where('submittedAt', '>', 0), orderBy('submittedAt', 'desc'), limit(50)))));
  kontrol(g, 'açık talepler', 'ok', await dene(getDocs(query(collection(c.db, 'requests'), where('status', 'in', ['open', 'seen', 'in_progress', 'approval'])))));
  kontrol(g, 'bekleyen öneriler', 'ok', await dene(getDocs(query(collection(c.db, 'proposals'), where('status', '==', 'pending')))));
  kontrol(g, 'son 60 gün görevler', 'ok', await dene(getDocs(query(collection(c.db, 'assignments'), where('createdAt', '>=', Date.now() - 60 * 86400000)))));
  if (role !== 'board') {
    kontrol(g, 'soru bankası', 'ok', await dene(getDocs(query(collection(c.db, 'questions'), where('moduleId', '==', MOD.id)))));
    kontrol(g, 'config/notifications', 'ok', await dene(getDoc(doc(c.db, 'config', 'notifications'))));
  } else {
    kontrol(g, 'soru bankası (red beklenir)', 'red', await dene(getDocs(query(collection(c.db, 'questions'), where('moduleId', '==', MOD.id)))));
    kontrol(g, 'kurul: ekip listesi (direktör/bölge)', 'ok', await dene(getDocs(query(collection(c.db, 'users'), where('role', 'in', ['director', 'opsmanager', 'regional'])))));
  }
}
{ // Rol başına tipik yazımlar
  const dev = staffRows.developer, dir = staffRows.director, om = staffRows.opsmanager, reg = staffRows.regional, ops = staffRows.ops, brd = staffRows.board;
  const roles = await dir.m('lib/roles.ts');
  kontrol('director', 'ekip listesi (geliştirici hariç)', 'ok', await dene(F(dir).getDocs(F(dir).query(F(dir).collection(dir.db, 'users'), F(dir).where('role', 'in', roles.visibleStaffRoles('director'))))));
  kontrol('director', 'ekip listesi geliştirici dahil (red beklenir)', 'red', await dene(F(dir).getDocs(F(dir).query(F(dir).collection(dir.db, 'users'), F(dir).where('role', 'in', ['developer', 'director'])))));
  kontrol('director', 'geliştiricinin users belgesi (red beklenir)', 'red', await dene(F(dir).getDoc(F(dir).doc(dir.db, 'users', staff('developer').uid))));
  kontrol('developer', 'ekip listesi (hepsi)', 'ok', await dene(F(dev).getDocs(F(dev).query(F(dev).collection(dev.db, 'users'), F(dev).where('role', 'in', roles.visibleStaffRoles('developer'))))));
  kontrol('developer', 'hatalar koleksiyonu', 'ok', await dene(F(dev).getDocs(F(dev).collection(dev.db, 'hatalar'))));
  // İçerik yayını
  const chD = await dir.m('api/changes.ts');
  const L2 = CUR.lessons.find((l) => l.moduleId === MOD.id && l.id !== LESSON.id);
  kontrol('director', 'ders yayınla (commitChange)', 'ok', await dene(chD.commitChange([{ op: 'update', col: 'lessons', id: L2.id, data: { summary: 'direktör güncelledi' } }], { kind: 'lesson', title: 'x', summary: 'x' }).then((r) => { if (r !== 'applied') throw new Error(r); })));
  kontrol('director', 'yetki ayarı yaz', 'ok', await dene(F(dir).setDoc(F(dir).doc(dir.db, 'config', 'permissions'), { updatedAt: Date.now() }, { merge: true })));
  kontrol('director', 'bülten yayınla', 'ok', await dene(chD.commitChange([{ op: 'set', col: 'bulletins', id: 'k-bulten', data: { kind: 'duyuru', title: 'Kural testi', body: 'x', storeIds: null, rows: [], people: [], expiresAt: null, published: true, pinned: false, createdAt: Date.now(), createdBy: staff('director').uid, createdByName: 'Cenk' } }], { kind: 'bulletin', title: 'x', summary: 'x' }).then((r) => { if (r !== 'applied') throw new Error(r); })));
  const chO = await om.m('api/changes.ts');
  const omLesson = CUR.lessons.find((l) => CUR.modules.find((m) => m.id === l.moduleId)?.trackId === 'oryantasyon');
  kontrol('opsmanager', 'kendi alanında ders yayınla', 'ok', await dene(chO.commitChange([{ op: 'update', col: 'lessons', id: omLesson.id, data: { summary: 'om güncelledi' } }], { kind: 'lesson', title: 'x', summary: 'x' }).then((r) => { if (r !== 'applied') throw new Error(r); })));
  const chOps = await ops.m('api/changes.ts');
  kontrol('ops', 'öneri gönder', 'ok', await dene(chOps.commitChange([{ op: 'update', col: 'lessons', id: L2.id, data: { summary: 'ops önerisi' } }], { kind: 'lesson', title: 'ops önerisi', summary: 'x' }).then((r) => { if (r !== 'proposed') throw new Error(r); })));
  kontrol('ops', 'görev ata', 'ok', await dene(F(ops).addDoc(F(ops).collection(ops.db, 'assignments'), { kind: 'module', targetId: MOD.id, title: 'ops görevi', note: '', storeId: H.phones[3].storeId, baristaId: null, dueAt: Date.now() + 86400000, createdAt: Date.now(), createdBy: staff('ops').uid, createdByName: 'Işıl' })));
  kontrol('ops', 'talebe yanıt (red beklenir; varsayılan yetki yok)', 'red', await dene((async () => { const r = (await adb.collection('requests').limit(1).get()).docs[0]; const rq = await ops.m('api/requests.ts'); await rq.addNote({ id: r.id, ...r.data() }, { side: 'ops', by: { uid: staff('ops').uid, name: 'Işıl' }, text: 'ops yanıtı' }); })()));
  const rqO = await om.m('api/requests.ts');
  kontrol('opsmanager', 'talebe yanıt', 'ok', await dene((async () => { const r = (await adb.collection('requests').limit(1).get()).docs[0]; await rqO.addNote({ id: r.id, ...r.data() }, { side: 'ops', by: { uid: staff('opsmanager').uid, name: 'Semih' }, text: 'om yanıtı', status: 'in_progress' }); })()));
  // Bölge müdürü: barista ekle, davet, telefon kodu
  let created = null;
  kontrol('regional', 'barista ekle (createBarista)', 'ok', await dene(reg.backend.createBarista({ name: 'Kural Deneme', storeId: H.phones[4].storeId, role: 'barista', createdByName: 'Uğur' }).then((r) => (created = r))));
  kontrol('regional', 'telefon kodu üret', 'ok', await dene(reg.backend.createPairingCode(H.phones[4].storeId, H.phones[4].storeName).then((r) => (reg.pc = r))));
  // Kurul soru
  const bd = await brd.m('api/board.ts');
  kontrol('board', 'kurul sorusu sor', 'ok', await dene(bd.askBoardQuestion({ topic: { kind: 'store', id: 'pendik', title: 'Pendik' }, to: 'director', text: 'Kural testi sorusu', by: { uid: staff('board').uid, name: 'Ogün' } })));
  kontrol('board', 'barista ekle (red beklenir)', 'red', await dene(F(brd).setDoc(F(brd).doc(brd.db, 'baristas', 'kurul-dene'), { name: 'x', storeId: 'pendik' })));
  const bdD = await dir.m('api/board.ts');
  kontrol('director', 'kurul sorusunu yanıtla', 'ok', await dene((async () => { const q = (await adb.collection('boardQuestions').limit(1).get()).docs[0]; await bdD.replyBoardQuestion({ id: q.id, ...q.data() }, 'ops', 'yanıt', { uid: staff('director').uid, name: 'Cenk' }); })()));

  // ===== Davet kodu (redeemInvite) baştan sona + yeni telefon eşleştirme (pairDevice)
  {
    const ph = H.phones[4];
    const c = await client('k-davet'); await c.signIn(ph.email, ph.password);
    let r = 'ok';
    try {
      await c.backend.redeemInvite(created.code, '4826', ph.storeId);
      const b = (await adb.doc(`baristas/${created.baristaId}`).get()).data();
      const inv = await adb.doc(`invites/${created.code}`).get();
      if (b.pinPending !== false) r = 'pinPending hâlâ true';
      else if (inv.exists) r = 'davet silinmedi';
      // Yeni PIN ile giriş + okuma
      const c2 = await client('k-davet-pin');
      await c2.backend.baristaSignIn({ id: created.baristaId, authEmail: b.authEmail }, '4826');
      await F(c2).getDoc(F(c2).doc(c2.db, 'progress', created.baristaId));
      await F(c2).getDocs(F(c2).collection(c2.db, 'modules'));
    } catch (e) { r = `hata:${e.code || ''}:${e.message}`; }
    kontrol('regional→telefon', 'davet kodu kullanımı (redeemInvite) + yeni PIN ile giriş', 'ok', r);
  }
  {
    const c = await client('k-esle');
    let r = 'ok';
    try {
      const d = await c.backend.pairDevice(reg.pc.code, 'Android telefon');
      await sleep(800);
      const u = (await adb.doc(`users/${d.uid}`).get()).data();
      const code = await adb.doc(`pairingCodes/${reg.pc.code}`).get();
      if (!u.paired) r = 'paired yazılmadı';
      else if (code.exists) r = 'eşleştirme kodu silinmedi';
      await F(c).getDocs(F(c).query(F(c).collection(c.db, 'baristas'), F(c).where('storeId', '==', d.storeId), F(c).where('active', '==', true)));
      await F(c).getDocs(F(c).collection(c.db, 'lessons'));
      staffRows.yeniTelefon = { c, d };
    } catch (e) { r = `hata:${e.code || ''}:${e.message}`; }
    kontrol('regional→telefon', 'yeni telefon eşleştirme (pairDevice) + okuma', 'ok', r);
  }
  // Madde 11: ağ hatası (sunucuya ulaşılamayan Firestore): node'da emülatöre bağlanmayan ayrı istemci
  {
    const { initializeApp: ia } = await import('firebase/app');
    void ia;
  }

  // ===== Madde 10: barista mağaza değiştirince bekleyen davet yeni mağazada çalışıyor
  {
    let r = 'ok';
    try {
      const nb = await reg.backend.createBarista({ name: 'Taşınan Barista', storeId: H.phones[5].storeId, role: 'barista', createdByName: 'Uğur' });
      const bd0 = (await adb.doc(`baristas/${nb.baristaId}`).get()).data();
      await reg.backend.updateBarista({ id: nb.baristaId, ...bd0 }, { storeId: H.phones[6].storeId });
      const inv = (await adb.doc(`invites/${nb.code}`).get()).data();
      if (inv.storeId !== H.phones[6].storeId) r = `davet storeId=${inv.storeId}`;
      const c = await client('k-tasinan'); await c.signIn(H.phones[6].email, H.phones[6].password);
      await c.backend.redeemInvite(nb.code, '5937', H.phones[6].storeId);
      const c2 = await client('k-tasinan-pin');
      await c2.backend.baristaSignIn({ id: nb.baristaId, authEmail: bd0.authEmail }, '5937');
      await F(c2).getDoc(F(c2).doc(c2.db, 'progress', nb.baristaId));
      // Eski mağazanın telefonu bu daveti kullanamamalı (kod artık silindi; ayrıca kural kontrolü)
    } catch (e) { r = `hata:${e.code || ''}:${e.message}`; }
    kontrol('regional', 'mağaza değişince davet yeni mağazada çalışıyor (A12)', 'ok', r);
  }
  // pairingCodes/invites silme sınırları (B24)
  {
    const pc = await reg.backend.createPairingCode(H.phones[7].storeId, H.phones[7].storeName);
    const bb = B.find((x) => x.role === 'barista' && x.pin && x.storeId !== H.phones[8].storeId);
    const c = await client('k-silme'); await c.backend.baristaSignIn({ id: bb.id, authEmail: bb.email }, bb.pin);
    kontrol('barista', 'başkasının eşleştirme kodunu sil (red beklenir)', 'red', await dene(F(c).deleteDoc(F(c).doc(c.db, 'pairingCodes', pc.code))));
    const nb = await reg.backend.createBarista({ name: 'Davet Sil Deneme', storeId: H.phones[8].storeId, role: 'barista', createdByName: 'Uğur' });
    kontrol('barista', 'başka mağazanın davetini sil (red beklenir)', 'red', await dene(F(c).deleteDoc(F(c).doc(c.db, 'invites', nb.code))));
  }
}

// ======================================================================
// B) PASİF / ESKİ / KALDIRILMIŞ HESAPLAR — okuma ve yazma reddi
// ======================================================================
const reg = staffRows.regional;
async function deniedSet(c, g, extra = {}) {
  const { getDocs, getDoc, updateDoc, collection, doc, query, where, addDoc } = F(c);
  kontrol(g, 'kendi users belgesini okuyabilir (çıkış kararı için)', 'ok', await dene(getDoc(doc(c.db, 'users', c.uid()))));
  kontrol(g, 'içerik okuma (red)', 'red', await dene(getDocs(collection(c.db, 'lessons'))));
  kontrol(g, 'mağazalar okuma (red)', 'red', await dene(getDocs(collection(c.db, 'stores'))));
  kontrol(g, 'soru bankası / cevap anahtarı (red)', 'red', await dene(getDocs(query(collection(c.db, 'questions'), where('moduleId', '==', MOD.id)))));
  kontrol(g, 'bültenler (red)', 'red', await dene(getDocs(collection(c.db, 'bulletins'))));
  kontrol(g, 'geri bildirim yaz (red)', 'red', await dene(addDoc(collection(c.db, 'feedback'), { by: c.uid(), status: 'yeni', text: 'pasif' })));
  kontrol(g, 'lastSeenAt yaz (red)', 'red', await dene(updateDoc(doc(c.db, 'users', c.uid()), { lastSeenAt: Date.now() })));
  if (extra.storeId) kontrol(g, 'mağaza baristaları (red)', 'red', await dene(getDocs(query(collection(c.db, 'baristas'), where('storeId', '==', extra.storeId)))));
  if (extra.baristaId) {
    kontrol(g, 'progress yaz (red)', 'red', await dene(updateDoc(doc(c.db, 'progress', extra.baristaId), { [`lessons.pasif`]: Date.now(), updatedAt: Date.now() })));
    kontrol(g, 'kendi denemeleri (red)', 'red', await dene(getDocs(query(collection(c.db, 'attempts'), where('baristaId', '==', extra.baristaId)))));
  }
  if (extra.staff) {
    kontrol(g, 'panel: baristalar (red)', 'red', await dene(getDocs(collection(c.db, 'baristas'))));
    kontrol(g, 'panel: barista ekle (red)', 'red', await dene(c.backend.createBarista({ name: 'Pasif Ekledi', storeId: 'pendik', role: 'barista' })));
  }
}
{ // Pasif barista (açık oturum)
  const b = B.find((x) => x.role === 'barista' && x.pin && x.storeId === H.phones[9].storeId);
  const c = await client('k-pasif'); await c.backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin);
  await F(c).getDocs(F(c).collection(c.db, 'modules'));
  const bdoc = (await adb.doc(`baristas/${b.id}`).get()).data();
  await reg.backend.setBaristaActive({ id: b.id, ...bdoc }, false);
  await deniedSet(c, 'pasif barista (açık oturum)', { baristaId: b.id, storeId: b.storeId });
  // Yeniden giriş denemesi: Auth geçer, kurallar reddeder
  const c2 = await client('k-pasif-2'); await c2.backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin);
  kontrol('pasif barista (yeni giriş)', 'içerik okuma (red)', 'red', await dene(F(c2).getDocs(F(c2).collection(c2.db, 'lessons'))));
}
{ // PIN sıfırlama sonrası eski PIN
  const b = B.find((x) => x.role === 'shift' && x.pin && x.storeId === H.phones[10].storeId) || B.find((x) => x.role === 'shift' && x.pin && x.storeId !== H.phones[2].storeId);
  const bdoc = (await adb.doc(`baristas/${b.id}`).get()).data();
  const c = await client('k-eskipin'); await c.backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin);
  await reg.backend.resetBaristaPin({ id: b.id, ...bdoc }, 'Uğur');
  await deniedSet(c, 'eski PIN (açık oturum)', { baristaId: b.id, storeId: b.storeId });
  const c2 = await client('k-eskipin-2');
  let giris = 'ok';
  try { await c2.signIn(b.email, `pb-${b.id}-${b.pin}`); } catch (e) { giris = e.code; }
  kontrol('eski PIN (yeni giriş)', 'Auth girişi (eski hesap Auth\'ta duruyor)', 'ok', giris);
  if (giris === 'ok') {
    kontrol('eski PIN (yeni giriş)', 'progress yaz (red)', 'red', await dene(F(c2).updateDoc(F(c2).doc(c2.db, 'progress', b.id), { [`lessons.eski`]: Date.now(), updatedAt: Date.now() })));
    kontrol('eski PIN (yeni giriş)', 'soru bankası (red)', 'red', await dene(F(c2).getDocs(F(c2).query(F(c2).collection(c2.db, 'questions'), F(c2).where('moduleId', '==', MOD.id)))));
  }
}
{ // Bağlantısı kaldırılan telefon
  const ph = H.phones[11];
  const c = await client('k-revoke'); await c.signIn(ph.email, ph.password);
  await F(c).getDocs(F(c).collection(c.db, 'modules'));
  await reg.backend.revokeDevice(ph.uid);
  await deniedSet(c, 'bağlantısı kaldırılan telefon', { storeId: ph.storeId });
}
{ // Ekipten kaldırılan yönetici (bölge müdürü 2)
  const s = staff('regional', 1);
  const c = await staffC(s);
  await F(c).getDocs(F(c).collection(c.db, 'baristas'));
  const dir = staffRows.director;
  await F(dir).updateDoc(F(dir).doc(dir.db, 'users', s.uid), { active: false });
  await deniedSet(c, 'ekipten kaldırılan yönetici', { staff: true });
  // Madde 22: yeniden etkinleştirme
  kontrol('director', 'kaldırılan ekip üyesini yeniden etkinleştir', 'ok', await dene(F(dir).updateDoc(F(dir).doc(dir.db, 'users', s.uid), { active: true })));
  kontrol('ekipten kaldırılıp geri alınan yönetici', 'baristalar okuma', 'ok', await dene(F(c).getDocs(F(c).collection(c.db, 'baristas'))));
}
{ // active alanı OLMAYAN users belgesi (eski kayıt) — kilitlenir mi? (bilgi)
  const u = await aauth.createUser({ email: 'eski-kayit@1401coffee.com', password: 'yuk-testi-1401' });
  await adb.doc(`users/${u.uid}`).set({ role: 'ops', name: 'Eski Kayıt', email: 'eski-kayit@1401coffee.com', createdAt: Date.now() });
  const c = await client('k-aktifsiz'); await c.signIn('eski-kayit@1401coffee.com', 'yuk-testi-1401');
  kontrol('bilgi: active alanı yok', 'içerik okuma (kural gereği red)', 'red', await dene(F(c).getDocs(F(c).collection(c.db, 'modules'))));
}

// ======================================================================
// C) Madde 4: iki cihazdan aynı anda Başla → tek deneme, tek hak
// ======================================================================
{
  const b = B.find((x) => x.role === 'barista' && x.pin && x.storeId === H.phones[3].storeId);
  const c1 = await client('k-iki-1'); const c2 = await client('k-iki-2');
  await c1.backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin);
  await c2.backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin);
  // Son 7 günde hiç denemesi olmayan, önkoşulsuz bir modül (haftalık hak 3).
  const mine = (await adb.collection('attempts').where('baristaId', '==', b.id).get()).docs.map((d) => d.get('moduleId'));
  const mod = CUR.modules.find((m) => m.published && !m.prerequisiteId && !mine.includes(m.id));
  const before = (await adb.collection('attempts').where('baristaId', '==', b.id).where('moduleId', '==', mod.id).get()).size;
  const who = { baristaId: b.id, storeId: b.storeId, name: b.name };
  const tekrar = [];
  for (let k = 0; k < 3; k++) {
    await sleep(300);
    const [s1, s2] = await Promise.all([c1.exam.startExam(mod, who, null), c2.exam.startExam(mod, who, null)]);
    const a1 = await answersOf(s1.attemptId, s1, 1);
    const [r1, r2] = await Promise.allSettled([
      c1.exam.submitExam(s1.attemptId, a1, { questionIds: s1.questions.map((q) => q.id), baristaId: b.id }),
      c2.exam.submitExam(s2.attemptId, {}, { questionIds: s2.questions.map((q) => q.id), baristaId: b.id })
    ]);
    tekrar.push({ ayni: s1.attemptId === s2.attemptId, id1: s1.attemptId, id2: s2.attemptId, r1: r1.value?.score ?? r1.reason?.message, r2: r2.value?.score ?? r2.reason?.message });
  }
  const after = (await adb.collection('attempts').where('baristaId', '==', b.id).where('moduleId', '==', mod.id).get()).size;
  kontrol('madde 4', 'iki cihaz aynı anda Başla (3 tekrar): hep aynı deneme', true, tekrar.every((t) => t.ayni), { tekrar });
  kontrol('madde 4', '3 tekrarda açılan deneme sayısı', 3, after - before);
}

writeFileSync(new URL('./out/kurallar.json', import.meta.url), JSON.stringify(SONUC, null, 1));
const kalan = SONUC.filter((x) => !x.ok);
console.log(`\nTOPLAM ${SONUC.length} · geçti ${SONUC.length - kalan.length} · kaldı ${kalan.length}`);
kalan.forEach((x) => console.log('  KALDI:', x.grup, '|', x.ad, '|', x.gercek));
process.exit(0);
