/**
 * Yoğun gün simülasyonu — YALNIZCA yerel emülatör.
 * Uygulamanın gerçek modülleri (src/api/*.ts) istemci başına ayrı kopya
 * olarak çalışır (bkz. lib/yukleyici.mjs); her istemcinin okuma/yazma sayısı
 * lib/sayac.mjs ile tutulur.
 *
 *   node --experimental-transform-types --no-warnings --import ./lib/kayit.mjs simulasyon.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp: adminInit } = await import('firebase-admin/app');
const { getFirestore: adminFs } = await import('firebase-admin/firestore');
adminInit({ projectId: 'demo-playbook' });
const adb = adminFs();

const H = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url), 'utf8'));
const CUR = JSON.parse(readFileSync(new URL('../../src/generated/curriculum.json', import.meta.url), 'utf8'));
const QMAP = new Map(CUR.questions.map((q) => [q.id, q]));
const T0 = Date.now();
const el = () => ((Date.now() - T0) / 1000).toFixed(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seed = 9;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const jitter = (a, b) => a + Math.floor(rnd() * (b - a));

const ETIKET = (globalThis.__ETIKET = {});
const HATALAR = [];
const OLAY = [];
const SURE = {};
const olay = (who, what, extra = {}) => { OLAY.push({ t: +el(), who, what, ...extra }); };
const hata = (who, where, e) => { HATALAR.push({ t: +el(), who, where, code: e?.code || null, message: String(e?.message || e).slice(0, 300) }); };
const sure = (name, ms) => (SURE[name] ||= []).push(ms);
async function timed(name, p) { const t = Date.now(); try { return await p; } finally { sure(name, Date.now() - t); } }

/* ------------------------------------------------------------------ */
async function client(tag) {
  const fb = await import(`./lib/istemci-firebase.mjs?c=${tag}`);
  const fs = await import(`./lib/sayac.mjs?c=${tag}`);
  const auth = await import('firebase/auth');
  const m = (p) => import(`../../src/${p}?c=${tag}`);
  const c = { tag, fb, fs, auth, m, unsubs: [] };
  c.exam = await m('api/exam.ts');
  c.backend = (await m('api/backend.ts')).backend;
  c.listen = (label, target) => {
    const u = fs.onSnapshot(target, () => {}, (e) => hata(tag, `dinleyici ${label}`, e));
    c.unsubs.push(u);
    return u;
  };
  c.stopAll = () => { c.unsubs.forEach((u) => u()); c.unsubs = []; };
  c.label = (x) => (ETIKET[tag] = x);
  return c;
}

/** App.tsx + içerik/rozet: her oturumda açılan ortak dinleyiciler. */
function commonListeners(c) {
  const { collection, doc } = c.fs; const db = c.fb.db;
  for (const col of ['tracks', 'modules', 'lessons', 'stores']) c.listen(col, collection(db, col));
  c.listen('config/badges', doc(db, 'config', 'badges'));
}
/** Barista oturumu: BaristaLayout + HomePage (useBaristaData.ts). */
function baristaListeners(c, b) {
  const { collection, doc, query, where, orderBy, limit } = c.fs; const db = c.fb.db;
  commonListeners(c);
  c.listen('progress/me', doc(db, 'progress', b.id));
  c.listen('assignments(mağaza)', query(collection(db, 'assignments'), where('storeId', '==', b.storeId)));
  c.listen('bulletins(50)', query(collection(db, 'bulletins'), orderBy('createdAt', 'desc'), limit(50)));
  c.listen('attempts(ben,300)', query(collection(db, 'attempts'), where('baristaId', '==', b.id), orderBy('startedAt', 'desc'), limit(300)));
  c.listen('baristas/me', doc(db, 'baristas', b.id));
  if (b.role !== 'barista') c.listen('requests(mağaza)', query(collection(db, 'requests'), where('storeId', '==', b.storeId)));
}
/** StaffLayout (staffData.ts) + Genel bakış ekranının kendi sorguları. */
function staffListeners(c, s) {
  const { collection, doc, query, where, orderBy, limit } = c.fs; const db = c.fb.db;
  commonListeners(c);
  c.listen('config/permissions', doc(db, 'config', 'permissions'));
  if (s.role === 'board') {
    c.listen('attempts(since)', query(collection(db, 'attempts'), where('startedAt', '>=', new Date(new Date().getFullYear() - 1, 0, 1).getTime()), orderBy('startedAt', 'desc')));
    c.listen('requests(1000)', query(collection(db, 'requests'), orderBy('updatedAt', 'desc'), limit(1000)));
  } else {
    c.listen('attempts(300)', query(collection(db, 'attempts'), orderBy('startedAt', 'desc'), limit(300)));
    c.listen('requests(300)', query(collection(db, 'requests'), orderBy('updatedAt', 'desc'), limit(300)));
  }
  c.listen('baristas', collection(db, 'baristas'));
  c.listen('progress', collection(db, 'progress'));
  c.listen('assignments', collection(db, 'assignments'));
  c.listen('proposals(200)', query(collection(db, 'proposals'), orderBy('createdAt', 'desc'), limit(200)));
  c.listen('boardQuestions(300)', query(collection(db, 'boardQuestions'), orderBy('updatedAt', 'desc'), limit(300)));
  if (s.role !== 'board') {
    c.listen('users(pending-phones)', query(collection(db, 'users'), where('role', '==', 'store'), where('paired', '==', false), where('active', '==', true)));
    c.listen('users(staff-team)', query(collection(db, 'users'), where('role', 'in', ['director', 'opsmanager', 'regional', 'ops', 'board'])));
  }
}

/* ------------------------------------------------------------------ */
const modules = CUR.modules.filter((m) => m.published).sort((a, b) => a.order - b.order);
const tracks = CUR.tracks.sort((a, b) => a.order - b.order);
const lessonsOf = (mid) => CUR.lessons.filter((l) => l.moduleId === mid && l.published !== false).sort((a, b) => a.order - b.order);

async function liveProgress(bid) { return (await adb.doc(`progress/${bid}`).get()).data() || { lessons: {}, modules: {} }; }
async function chooseModule(b) {
  const p = await liveProgress(b.id);
  const ok = modules.filter((m) => !m.prerequisiteId || p.modules?.[m.prerequisiteId]);
  const notPassed = ok.filter((m) => !p.modules?.[m.id]);
  const pool = notPassed.length ? notPassed : ok;
  return pool[Math.floor(rnd() * Math.min(pool.length, 3))];
}

/** Sınavda bir soruyu cevapla: doğru şıkkı denemenin kayıtlı sırasından bulur. */
async function answersFor(attemptId, session, skill, howMany) {
  const a = (await adb.doc(`attempts/${attemptId}`).get()).data();
  const out = {};
  for (const q of session.questions.slice(0, howMany ?? session.questions.length)) {
    const real = QMAP.get(q.id) || (await adb.doc(`questions/${q.id}`).get()).data();
    const order = a.orders[q.id];
    const right = order.indexOf(real.answer);
    out[q.id] = rnd() < skill ? right : (right + 1 + Math.floor(rnd() * (order.length - 1))) % order.length;
  }
  return out;
}

const SONUC = [];
const shared = { inExam: new Map(), deactivateTarget: null, mod0Exams: [], dropModule: null, zeroModule: null };

async function examRun(c, b, mode, mod) {
  const who = { baristaId: b.id, storeId: b.storeId, name: b.name };
  const rec = { baristaId: b.id, mode, moduleId: mod.id };
  const { collection, query, where, orderBy, limit } = c.fs; const db = c.fb.db;
  c.label('sınav ekranı');
  // ExamPage (düzeltmeden sonra): ana sayfayla AYNI attempts(300) dinleyicisi (ayrı hedef yok);
  // ekran açılınca soru havuzu OKUNMAZ, havuz yalnızca "Başla"da okunur.
  const u = () => {};
  await sleep(jitter(500, 2500));
  c.label('sınav başlat');
  let s;
  try { s = await timed('startExam', c.exam.startExam(mod, who, null)); }
  catch (e) { rec.startError = e.message === 'weekly-limit' ? 'weekly-limit' : e.message; if (rec.startError !== 'weekly-limit') hata(b.id, 'startExam', e); SONUC.push(rec); u(); return rec; }
  rec.attemptId = s.attemptId; rec.resumed = s.resumed; rec.nQ = s.questions.length;
  shared.inExam.set(b.id, { attemptId: s.attemptId, moduleId: mod.id });
  if (mod.id === shared.dropModule || mod.id === shared.zeroModule) shared.mod0Exams.push(s.attemptId);
  const all = await answersFor(s.attemptId, s, b.skill);
  const ids = s.questions.map((q) => q.id);
  const answers = { ...s.answers };
  const stopAt = mode === 'yarim' ? 3 : mode === 'sure' ? 4 : ids.length;
  c.label('sınav cevap');
  // Cevaplar 3 cevapta bir (ExamPage SAVE_EVERY_ANSWERS) ve ekrandan çıkarken yazılır.
  let pendingN = 0;
  for (const id of ids.slice(0, stopAt)) {
    await sleep(jitter(600, 2200));
    answers[id] = all[id];
    if (++pendingN >= 3) { pendingN = 0; await timed('saveAnswers', c.exam.saveAnswers(s.attemptId, { ...answers })); }
  }
  if (pendingN && mode === 'yarim') await timed('saveAnswers', c.exam.saveAnswers(s.attemptId, { ...answers })); // sayfa gizlenirken
  if (mode === 'yarim') { rec.left = true; SONUC.push(rec); u(); return rec; }
  if (mode === 'sure') {
    // Süre dolmuş gibi: son teslim anı geçmişe alınır, ekran otomatik teslim eder.
    await adb.doc(`attempts/${s.attemptId}`).update({ deadline: Date.now() - 1000 });
  }
  if (mode === 'hold') { // regrade/curriculum testleri için: teslimi bekletir
    await shared.release;
  }
  c.label('sınav teslim');
  try {
    rec.result = await timed('submitExam', c.exam.submitExam(s.attemptId, answers, { timedOut: mode === 'sure', questionIds: ids, baristaId: b.id }));
  } catch (e) { rec.submitError = e.message; hata(b.id, 'submitExam', e); }
  shared.inExam.delete(b.id);
  SONUC.push(rec);
  u();
  return rec;
}

async function baristaDay(b, mode) {
  await sleep(jitter(0, 40000));
  const c = await client(b.id);
  try {
    c.label('giriş');
    if (b.invite) {
      // Davet kodu: telefon mağaza hesabıyla açıkken kullanılır.
      const ph = H.phones.find((p) => p.storeId === b.storeId);
      await c.auth.signInWithEmailAndPassword(c.fb.auth, ph.email, ph.password);
      let pin = null; while (!pin || /^(\d)\1{3}$/.test(pin) || ['1234', '4321', '0123', '9876'].includes(pin)) pin = String(jitter(0, 9999)).padStart(4, '0');
      await timed('redeemInvite', c.backend.redeemInvite(b.invite, pin, b.storeId));
      b.pin = pin; b.invite = null;
      olay(b.id, 'davet kodu kullanıldı');
    } else {
      await timed('baristaSignIn', c.backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin));
    }
    // session.ts resolveUser: users/{uid}, baristas/{id}, stores/{id}
    const { doc, getDoc, updateDoc } = c.fs; const db = c.fb.db;
    await getDoc(doc(db, 'users', c.fb.auth.currentUser.uid));
    await Promise.all([getDoc(doc(db, 'baristas', b.id)), getDoc(doc(db, 'stores', b.storeId))]);
    c.label('ana sayfa');
    baristaListeners(c, b);
    await c.exam.finalizeExpired(b.id);
    await sleep(jitter(1000, 4000));
    const mod = await chooseModule(b);
    // ~2 ders
    c.label('ders');
    const p0 = await liveProgress(b.id);
    for (const l of lessonsOf(mod.id).filter((l) => !p0.lessons?.[l.id]).slice(0, 2)) {
      await sleep(jitter(1500, 4000));
      await timed('dersTamamla', updateDoc(doc(db, 'progress', b.id), { [`lessons.${l.id}`]: Date.now(), updatedAt: Date.now() })).catch((e) => hata(b.id, 'ders tamamla', e));
    }
    // bülten okundu
    c.label('bülten');
    const bl = await adb.collection('bulletins').where('published', '==', true).get();
    for (const d of bl.docs) await updateDoc(doc(db, 'progress', b.id), { [`bulletins.${d.id}`]: Date.now(), updatedAt: Date.now() }).catch((e) => hata(b.id, 'bülten okundu', e));
    if (mode === 'ikiCihaz') {
      const c2 = await client(`${b.id}-2`);
      await c2.backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin);
      c2.label('ana sayfa'); baristaListeners(c2, b);
      const [r1, r2] = await Promise.all([examRun(c, b, 'normal', mod), examRun(c2, b, 'normal', mod)]);
      olay(b.id, 'iki cihaz', { a1: r1.attemptId, a2: r2.attemptId, ayniDeneme: r1.attemptId === r2.attemptId, s1: r1.result?.score, s2: r2.result?.score });
      c2.stopAll(); await c2.auth.signOut(c2.fb.auth);
    } else {
      await examRun(c, b, mode, mod);
    }
    if (b.role === 'lead' && rnd() < 0.7) {
      c.label('talep');
      const rq = await c.m('api/requests.ts');
      const longTitle = b.storeId === 'cubuklu' ? 'Espresso makinesi grup başlığı sızdırıyor '.repeat(8).trim() : 'Değirmen ayarı kaçıyor';
      await timed('createRequest', rq.createRequest({ storeId: b.storeId, storeName: b.storeId, category: 'ariza', priority: rnd() < 0.3 ? 'urgent' : 'normal', title: longTitle, detail: 'Sabah açılışta fark edildi. Şçğıöü İĞÜŞÖÇ.', by: { uid: c.fb.auth.currentUser.uid, name: b.name } }))
        .then((id) => olay(b.id, 'talep açıldı', { id })).catch((e) => hata(b.id, 'createRequest', e));
    }
    if (b.role !== 'barista') {
      // Ekibim ekranı (TeamPage): 10 sn açık kalır.
      c.label('ekibim');
      const { collection, query, where, orderBy, limit } = c.fs;
      const us = [
        c.listen('team baristas', query(collection(db, 'baristas'), where('storeId', '==', b.storeId), where('active', '==', true))),
        c.listen('team progress', query(collection(db, 'progress'), where('storeId', '==', b.storeId))),
        c.listen('team attempts(400)', query(collection(db, 'attempts'), where('storeId', '==', b.storeId), orderBy('startedAt', 'desc'), limit(400)))
      ];
      await sleep(10000);
      us.forEach((u) => u());
    }
  } catch (e) { hata(b.id, 'barista günü', e); }
  c.label('açık (bekliyor)');
  return c;
}

/* ------------------------------------------------------------------ */
async function staffClient(s) {
  const c = await client(`st-${s.role}-${s.uid.slice(0, 5)}`);
  await c.auth.signInWithEmailAndPassword(c.fb.auth, s.email, s.password);
  const se = await c.m('store/session.ts');
  se.useSession.setState({ session: { kind: 'staff', uid: s.uid, name: s.name, email: s.email, role: s.role } });
  const pe = await c.m('lib/permissions.ts');
  c.permUnsub = pe.usePermStore.getState().subscribe();
  const ct = await c.m('store/content.ts');
  c.contentUnsub = ct.useContent.getState().subscribe(); // modules/lessons (changes.ts alan kontrolü) — sayaca girer
  c.label('panel açılış');
  await c.fs.getDoc(c.fs.doc(c.fb.db, 'users', s.uid));
  const { collection, doc, query, where, orderBy, limit } = c.fs; const db = c.fb.db;
  c.listen('config/badges', doc(db, 'config', 'badges'));
  // Düzeltmeden sonraki panel verisi: uygulamanın kendi staffData.ts'i (canlı küçük kümeler).
  const sd = await c.m('features/staff/staffData.ts');
  c.sdUnsub = sd.useStaffData.getState().subscribe();
  c.listen('boardQuestions(300)', query(collection(db, 'boardQuestions'), orderBy('updatedAt', 'desc'), limit(300)));
  if (s.role === 'board') {
    // Gidişat (son 30 gün): dönem sınavları + talepler + öneriler tek seferlik, 13 toplama sorgusu.
    const DAY = 86400000; const now = Date.now();
    const p30 = sd.dayStart(now - 29 * DAY);
    const d = new Date(now); const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
    const from = sd.dayStart(Math.min(p30 - 30 * DAY, monday - 11 * 7 * DAY));
    await Promise.all([sd.loadExamsSince(p30), sd.loadRequestsSince(from), sd.loadReviewedSince(from),
      sd.loadExamAgg(p30 - 30 * DAY, p30 - 1), ...Array.from({ length: 12 }, (_, i) => monday - (11 - i) * 7 * DAY).map((w) => sd.loadExamAgg(w, w + 7 * DAY - 1))]).catch((e) => hata(s.role, 'kurul açılış', e));
  } else {
    // Genel bakış: son 7 günün teslim edilmiş sınavları (tek seferlik).
    await sd.loadExamsSince(sd.dayStart(Date.now() - 6 * 86400000)).catch((e) => hata(s.role, 'genel bakış', e));
    c.listen('users(pending-phones)', query(collection(db, 'users'), where('role', '==', 'store'), where('paired', '==', false), where('active', '==', true)));
    c.listen('users(staff-team)', query(collection(db, 'users'), where('role', 'in', ['director', 'opsmanager', 'regional', 'ops', 'board'])));
  }
  await sleep(3000);
  c.label('panel (canlı)');
  c.s = s; c.se = se;
  return c;
}
const staffBy = (role, i = 0) => H.staff.filter((s) => s.role === role)[i];

async function assignAll(c, s, mod, dueDaysFromNow) {
  const { writeBatch, doc, collection } = c.fs; const db = c.fb.db;
  const stores = (await adb.collection('stores').get()).docs.filter((d) => d.get('active')).map((d) => d.id);
  const base = { kind: 'module', targetId: mod.id, title: `${mod.title} sınavını geç`, note: '', baristaId: null, dueAt: Date.now() + dueDaysFromNow * 86400000, createdAt: Date.now(), createdBy: s.uid, createdByName: s.name };
  const batch = writeBatch(db);
  stores.forEach((sid) => batch.set(doc(collection(db, 'assignments')), { ...base, storeId: sid }));
  await batch.commit();
  return stores.length;
}

/* ------------------------------------------------------------------ */
async function main() {
  // Panel kullanıcıları gün boyu açık.
  const director = await staffClient(staffBy('director'));
  const opsm = await staffClient(staffBy('opsmanager'));
  const reg1 = await staffClient(staffBy('regional', 0));
  const reg2 = await staffClient(staffBy('regional', 1));
  const ops = [await staffClient(staffBy('ops', 0)), await staffClient(staffBy('ops', 1)), await staffClient(staffBy('ops', 2))];
  const board = [await staffClient(staffBy('board', 0)), await staffClient(staffBy('board', 1))];
  const staffAll = [director, opsm, reg1, reg2, ...ops, ...board];
  const snapshotCounts = (label) => { const S = globalThis.__SAYAC; const o = {}; for (const [k, v] of S) o[k] = { r: v.r, w: v.w, d: v.d }; return { label, t: +el(), o }; };
  const SNAP = [snapshotCounts('panel açıldı')];
  olay('sistem', 'panel istemcileri açık', { n: staffAll.length });

  // Mağaza telefonları (StoreHome): 12 telefon.
  const phones = [];
  for (const p of H.phones) {
    const c = await client(`tel-${p.storeId}`);
    await c.auth.signInWithEmailAndPassword(c.fb.auth, p.email, p.password);
    c.label('telefon açılış');
    await c.fs.getDoc(c.fs.doc(c.fb.db, 'users', c.fb.auth.currentUser.uid));
    await c.fs.getDoc(c.fs.doc(c.fb.db, 'stores', p.storeId));
    commonListeners(c);
    const { collection, query, where } = c.fs;
    c.listen('StoreHome baristas', query(collection(c.fb.db, 'baristas'), where('storeId', '==', p.storeId), where('active', '==', true)));
    c.p = p;
    phones.push(c);
  }
  SNAP.push(snapshotCounts('telefonlar açıldı'));

  // Kip dağılımı
  const bs = H.baristas.map((b) => ({ ...b }));
  const modes = bs.map((b, i) => (i % 20 === 3 ? 'ikiCihaz' : i % 7 === 2 ? 'yarim' : i % 10 === 6 ? 'sure' : 'normal'));
  // Kontrollü senaryolar için: "hold" kipindeki baristalar sınavı bitirip teslimi bekletir
  let release; shared.release = new Promise((r) => (release = r));
  [10, 22, 40, 61].forEach((i) => (modes[i] = 'hold'));
  shared.deactivateTarget = bs[29].id; modes[29] = 'normal';

  const baristaP = bs.map((b, i) => baristaDay(b, modes[i]));

  // --- Ekip eylemleri, baristalar çalışırken ---
  const staffActs = (async () => {
    await sleep(15000);
    // KO tüm mağazalara görev atar: biri bugün gecikmiş (dün bitti), biri haftaya.
    ops[0].label('görev atama');
    try { const n = await timed('görevAta(12 mağaza)', assignAll(ops[0], ops[0].s ?? staffBy('ops', 0), modules[0], -1)); olay('ops1', 'görev atandı (gecikmiş)', { n }); } catch (e) { hata('ops1', 'görev atama', e); }
    try { const n = await assignAll(ops[1], staffBy('ops', 1), modules[1], 7); olay('ops2', 'görev atandı (haftaya)', { n }); } catch (e) { hata('ops2', 'görev atama', e); }

    // Direktör bülten yayınlar; KO bülten önerir.
    const chD = await director.m('api/changes.ts');
    director.label('bülten yayın');
    const bid = 'yuk-bulten-1';
    await timed('bültenYayın', chD.commitChange([{ op: 'set', col: 'bulletins', id: bid, data: { kind: 'duyuru', title: 'Kış menüsü başladı — Şöyle bir şey: ığüşöç', body: 'Uzun metin '.repeat(400), storeIds: null, rows: [], people: [], expiresAt: null, published: true, pinned: true, createdAt: Date.now(), createdBy: staffBy('director').uid, createdByName: 'Cenk Girginol' } }], { kind: 'bulletin', title: 'Kış menüsü', summary: 'Yeni bülten' }))
      .then((r) => olay('director', 'bülten', { r })).catch((e) => hata('director', 'bülten yayın', e));
    const chO = await ops[1].m('api/changes.ts');
    ops[1].label('bülten öneri');
    await chO.commitChange([{ op: 'set', col: 'bulletins', id: 'yuk-bulten-2', data: { kind: 'kampanya', title: 'Hafta sonu kampanyası', body: 'Öneri', storeIds: ['moda-cadde', 'pendik'], rows: [], people: [], expiresAt: null, published: true, pinned: false, createdAt: Date.now(), createdBy: staffBy('ops', 1).uid, createdByName: 'Çağrı Şen' } }], { kind: 'bulletin', title: 'Hafta sonu kampanyası', summary: 'Yeni bülten' })
      .then((r) => olay('ops2', 'bülten önerisi', { r })).catch((e) => hata('ops2', 'bülten önerisi', e));

    await sleep(10000);
    // Bölge müdürü: barista ekler, çıkarır, PIN sıfırlar, telefon eşleştirir.
    reg1.label('barista yönetimi');
    const created = [];
    for (const [name, sid] of [['Şükrü Çağlayan Öztürkoğlu', 'moda-cadde'], ['A'.repeat(180), 'pendik'], ['İsmail Ğİ', 'kadikoy-iskele']]) {
      try { const r = await timed('createBarista', reg1.backend.createBarista({ name, storeId: sid, role: 'barista', createdByName: 'Uğur Can Gürbüz' })); created.push(r); olay('reg1', 'barista eklendi', { name: name.slice(0, 30), id: r.baristaId }); }
      catch (e) { hata('reg1', 'createBarista', e); }
    }
    shared.created = created;
    // Sınav ortasındaki baristayı pasifleştir
    const target = bs.find((x) => x.id === shared.deactivateTarget);
    const bdoc = (await adb.doc(`baristas/${target.id}`).get()).data();
    try { await timed('setBaristaActive(false)', reg1.backend.setBaristaActive({ id: target.id, ...bdoc }, false)); olay('reg1', 'barista pasifleştirildi', { id: target.id, sinavda: shared.inExam.has(target.id) }); }
    catch (e) { hata('reg1', 'pasifleştir', e); }
    // PIN sıfırla (bir barista, eski PIN ile tekrar girmeyi deneyeceğiz)
    const rb = bs[44];
    const rbdoc = (await adb.doc(`baristas/${rb.id}`).get()).data();
    try { const r = await timed('resetBaristaPin', reg2.backend.resetBaristaPin({ id: rb.id, ...rbdoc }, 'Gülşen Ağaoğlu')); olay('reg2', 'PIN sıfırlandı', { id: rb.id, code: r.code }); shared.resetB = { ...rb, oldEmail: rbdoc.authEmail }; }
    catch (e) { hata('reg2', 'resetBaristaPin', e); }
    // Telefon eşleştir
    try {
      const r = await timed('createPairingCode', reg1.backend.createPairingCode('atasehir-golf', 'Ataşehir Golf'));
      const np = await client('tel-yeni');
      const d = await timed('pairDevice', np.backend.pairDevice(r.code, 'Android telefon'));
      olay('reg1', 'telefon eşleşti', { storeId: d.storeId });
      shared.newPhone = { c: np, d };
    } catch (e) { hata('reg1', 'telefon eşleştir', e); }

    await sleep(5000);
    // Direktör: ops'un görev atama yetkisini kapatır; o anda ops3 görev atar.
    director.label('yetki değiştir');
    const { setDoc, doc } = director.fs;
    await timed('yetkiKapat', setDoc(doc(director.fb.db, 'config', 'permissions'), { roles: { ops: { gorevAtama: false } }, updatedAt: Date.now(), updatedByName: 'Cenk Girginol', log: [{ at: Date.now(), byName: 'Cenk Girginol', text: 'Kahve Operasyonu · Görev ata: kapatıldı' }] }, { merge: true }));
    olay('director', 'ops gorevAtama kapatıldı');
    ops[2].label('görev atama (yetki kapalı)');
    const pe = await ops[2].m('lib/permissions.ts');
    const t = Date.now();
    olay('ops3', 'yetki istemcide kapalı mı', { allowed: pe.allowed('ops', 'gorevAtama'), ms: Date.now() - t });
    try { await assignAll(ops[2], staffBy('ops', 2), modules[2], 3); olay('ops3', 'yetki kapalıyken görev atandı (BEKLENMİYOR)'); }
    catch (e) { olay('ops3', 'yetki kapalı → görev reddedildi', { code: e.code, message: e.message }); }
    // Yetki geri açılır
    await setDoc(doc(director.fb.db, 'config', 'permissions'), { roles: { ops: { gorevAtama: true } }, updatedAt: Date.now() }, { merge: true });

    // Kurul soru sorar, direktör yanıtlar.
    for (const [i, bc] of board.entries()) {
      bc.label('kurul soru');
      const bd = await bc.m('api/board.ts');
      await timed('kurulSoru', bd.askBoardQuestion({ topic: { kind: 'store', id: 'pendik', title: 'Pendik karnesi' }, to: i ? 'all' : 'director', text: 'Pendik neden geride? Çğışöü', by: { uid: bc.s.uid, name: bc.s.name } }))
        .then((r) => olay(bc.s.name, 'kurul sorusu', { id: r.id })).catch((e) => hata(bc.s.name, 'kurul sorusu', e));
    }
    await sleep(3000);
    const bqs = await adb.collection('boardQuestions').get();
    const bdD = await director.m('api/board.ts');
    director.label('kurul yanıt');
    for (const q of bqs.docs) await bdD.replyBoardQuestion({ id: q.id, ...q.data() }, 'ops', 'Yeni ekip, eğitimde.', { uid: staffBy('director').uid, name: 'Cenk Girginol' }).catch((e) => hata('director', 'kurul yanıt', e));

    // Talepleri yanıtla (operasyon müdürü)
    opsm.label('talep yanıt');
    const rqO = await opsm.m('api/requests.ts');
    const reqs = await adb.collection('requests').get();
    for (const r of reqs.docs) {
      const req = { id: r.id, ...r.data() };
      await rqO.markSeen(req, { uid: staffBy('opsmanager').uid, name: 'Semih Dizdar' }).catch((e) => hata('opsm', 'markSeen', e));
      await rqO.addNote({ ...req, status: 'seen' }, { side: 'ops', by: { uid: staffBy('opsmanager').uid, name: 'Semih Dizdar' }, text: 'Servis yönlendirildi', status: 'in_progress' }).catch((e) => hata('opsm', 'addNote', e));
    }
    olay('opsm', 'talepler yanıtlandı', { n: reqs.size });

    // Önerileri onayla
    director.label('öneri onay');
    const props = await adb.collection('proposals').where('status', '==', 'pending').get();
    for (const p of props.docs) await chD.approveProposal({ id: p.id, ...p.data() }).then(() => olay('director', 'öneri onaylandı', { id: p.id })).catch((e) => hata('director', 'öneri onay', e));

    // Aynı dersi aynı anda iki kişi düzenler (direktör + operasyon müdürü; oryantasyon dersi).
    const les = CUR.lessons.find((l) => l.moduleId === 'hos-geldin');
    const chM = await opsm.m('api/changes.ts');
    const { id: lid, ...lrest } = les;
    const [r1, r2] = await Promise.allSettled([
      chD.commitChange([{ op: 'set', col: 'lessons', id: lid, data: { ...lrest, title: 'DİREKTÖR düzenledi', blocks: [...lrest.blocks, { type: 'text', text: 'Direktörün eklediği paragraf' }] } }], { kind: 'lesson', title: 'x', summary: 'x' }),
      chM.commitChange([{ op: 'set', col: 'lessons', id: lid, data: { ...lrest, title: 'OPS MÜDÜRÜ düzenledi' } }], { kind: 'lesson', title: 'x', summary: 'x' })
    ]);
    const after = (await adb.doc(`lessons/${lid}`).get()).data();
    olay('sistem', 'aynı ders iki kişi', { r1: r1.status === 'fulfilled' ? r1.value : r1.reason?.message, r2: r2.status === 'fulfilled' ? r2.value : r2.reason?.message, sonBaslik: after.title, direktorParagrafiKaldiMi: after.blocks.some((x) => x.text === 'Direktörün eklediği paragraf') });
  })();

  // --- Sınavlar sürerken: soru iptali (yeniden puanlama) ve müfredat güncellemesi ---
  const contentActs = (async () => {
    await sleep(70000);
    // "hold" baristaları teslim etmeden bekliyor: en çok görülen soruyu bul.
    const att = await adb.collection('attempts').get();
    const freq = new Map();
    att.docs.forEach((d) => (d.get('questionIds') || []).forEach((q) => freq.set(q, (freq.get(q) || 0) + 1)));
    // Açık (teslim edilmemiş) bir denemede de bulunan, en sık soru
    const openQs = new Set(att.docs.filter((d) => d.get('submittedAt') == null).flatMap((d) => d.get('questionIds') || []));
    const qid = [...freq.entries()].filter(([q]) => openQs.has(q)).sort((a, b) => b[1] - a[1])[0]?.[0];
    const before = new Map(att.docs.map((d) => [d.id, d.data()]));
    writeFileSync(new URL('./out/regrade-oncesi.json', import.meta.url), JSON.stringify({ qid, attempts: [...before.entries()].filter(([, a]) => (a.questionIds || []).includes(qid)) }, null, 0));
    const rg = await director.m('api/regrade.ts');
    director.label('soru iptal');
    const q = { id: qid, ...(await adb.doc(`questions/${qid}`).get()).data() };
    try { const r = await timed('disableAndRegrade', rg.disableAndRegrade(q, 'Cevap anahtarı hatalı', { name: 'Cenk Girginol' })); olay('director', 'soru iptal + yeniden puanlama', { qid, ...r }); }
    catch (e) { hata('director', 'disableAndRegrade', e); }

    await sleep(5000);
    // Müfredatı güncelle: aktif sınavların modülünden 6 soru sil + bir modülün tüm sorularını sil.
    const open = (await adb.collection('attempts').where('submittedAt', '==', null).get()).docs.map((d) => d.data());
    const byMod = new Map(); open.forEach((a) => byMod.set(a.moduleId, (byMod.get(a.moduleId) || 0) + 1));
    const ranked = [...byMod.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
    const dropM = ranked[0];
    const zeroM = ranked[1] || modules.find((m) => m.id !== dropM).id;
    shared.dropModule = dropM; shared.zeroModule = zeroM;
    const inOpen = new Set(open.filter((a) => a.moduleId === dropM).flatMap((a) => a.questionIds));
    const dropIds = new Set([...inOpen].slice(0, 6));
    const file = JSON.parse(JSON.stringify(CUR));
    file.questions = file.questions.filter((x) => !dropIds.has(x.id) && x.moduleId !== zeroM);
    file.version = file.version + '-yuk';
    writeFileSync(new URL('./out/mufredat-guncelleme.json', import.meta.url), JSON.stringify({ dropM, zeroM, dropIds: [...dropIds], openOnDrop: open.filter((a) => a.moduleId === dropM).length, openOnZero: open.filter((a) => a.moduleId === zeroM).length }));
    const pc = await director.m('api/publishCurriculum.ts');
    director.label('müfredat güncelle (plan)');
    const plan = await timed('planCurriculum', pc.planCurriculum(file));
    director.label('müfredat güncelle (yaz)');
    const pr = await timed('publishCurriculum', pc.publishCurriculum(file)).catch((e) => (hata('director', 'publishCurriculum', e), null));
    olay('director', 'müfredat güncellendi', { plan: plan.counts, totalWrites: plan.totalWrites, pr, dropM, zeroM, disabledKorundu: (await adb.doc(`questions/${qid}`).get()).get('disabled') });
    await sleep(3000);
    release(); // bekletilen teslimler
  })();

  await Promise.all([staffActs, contentActs]);
  const clients = await Promise.all(baristaP);
  SNAP.push(snapshotCounts('baristalar bitti'));

  // Yarım bırakılanlar: süre "geçer", barista yeniden girer → finalizeExpired kapatır.
  const half = SONUC.filter((r) => r.left && r.attemptId);
  for (const r of half) await adb.doc(`attempts/${r.attemptId}`).update({ deadline: Date.now() - 1000 });
  for (const r of half) {
    const c = clients.find((x) => x.tag === r.baristaId);
    c.label('yeniden giriş');
    const n = await c.exam.finalizeExpired(r.baristaId).catch((e) => (hata(r.baristaId, 'finalizeExpired', e), -1));
    olay(r.baristaId, 'yarım sınav kapandı', { n });
  }

  // Pasifleştirilen barista: hâlâ yazabiliyor mu?
  const deac = clients.find((x) => x.tag === shared.deactivateTarget);
  try {
    const { doc, updateDoc, getDocs, collection, query, where } = deac.fs;
    await updateDoc(doc(deac.fb.db, 'progress', shared.deactivateTarget), { [`lessons.pasif-deneme`]: Date.now(), updatedAt: Date.now() });
    const qs = await getDocs(query(collection(deac.fb.db, 'questions'), where('moduleId', '==', modules[3].id)));
    olay('güvenlik', 'pasif barista hâlâ yazıp okuyabiliyor', { yazdi: true, soruOkudu: qs.size });
  } catch (e) { olay('güvenlik', 'pasif barista reddedildi', { code: e.code }); }
  // PIN'i sıfırlanan baristanın ESKİ hesabı (eski PIN) hâlâ giriş yapıp yazabiliyor mu?
  if (shared.resetB) {
    const old = await client('eski-pin');
    try {
      await old.auth.signInWithEmailAndPassword(old.fb.auth, shared.resetB.oldEmail, `pb-${shared.resetB.id}-${shared.resetB.pin}`);
      await old.fs.updateDoc(old.fs.doc(old.fb.db, 'progress', shared.resetB.id), { [`lessons.eski-pin-deneme`]: Date.now(), updatedAt: Date.now() });
      olay('güvenlik', 'eski PIN ile giriş + yazma BAŞARILI');
    } catch (e) { olay('güvenlik', 'eski PIN reddedildi', { code: e.code }); }
  }
  // Bağlantısı kaldırılan (revoke) telefon hâlâ cevap anahtarını okuyabiliyor mu?
  const ph = phones[5];
  try {
    const u = (await adb.collection('users').where('role', '==', 'store').where('storeId', '==', ph.p.storeId).get()).docs[0];
    await reg1.backend.revokeDevice(u.id);
    await sleep(500);
    const { getDocs, collection, query, where } = ph.fs;
    const qs = await getDocs(query(collection(ph.fb.db, 'questions'), where('moduleId', '==', modules[0].id)));
    const bsn = await getDocs(query(collection(ph.fb.db, 'baristas'), where('storeId', '==', ph.p.storeId)));
    olay('güvenlik', 'bağlantısı kaldırılan telefon hâlâ okuyabiliyor', { soru: qs.size, barista: bsn.size, cevapAnahtariVar: qs.docs[0]?.get('answer') !== undefined });
  } catch (e) { olay('güvenlik', 'kaldırılan telefon reddedildi', { code: e.code }); }

  // Herkese bir 0 soru kalan modül sınavı denemesi
  const zc = clients.find((x) => x.tag === bs[0].id);
  try { await zc.exam.startExam(modules.find((m) => m.id === shared.zeroModule), { baristaId: bs[0].id, storeId: bs[0].storeId, name: bs[0].name }, null); olay('sınır', '0 sorulu modülde sınav başladı (BEKLENMİYOR)'); }
  catch (e) { olay('sınır', '0 sorulu modül sınavı', { message: e.message }); }

  await sleep(4000);
  SNAP.push(snapshotCounts('son'));

  // Sayaç dökümü
  const S = globalThis.__SAYAC;
  const per = {};
  for (const [k, v] of S) per[k] = v;
  writeFileSync(new URL('./out/sayac.json', import.meta.url), JSON.stringify({ per, SNAP }, null, 0));
  writeFileSync(new URL('./out/sonuc.json', import.meta.url), JSON.stringify({ SONUC, OLAY, HATALAR, SURE, modes, sureToplam: +el() }, null, 1));
  console.log('bitti', el(), 's · hata', HATALAR.length, '· olay', OLAY.length);
  // kapat
  for (const c of [...clients, ...staffAll, ...phones]) { c.stopAll?.(); c.sdUnsub?.(); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
