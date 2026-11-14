/**
 * Kota düzeltmelerinin odak testleri (YALNIZCA emülatör, demo-playbook):
 *  Q1 (B9)  havuz önbelleği: ilk Başla sunucudan, ikinci Başla önbellekten + seçilenler doğrulanır;
 *           önbellek doluyken iptal edilen sorular sınava girmez, cevap anahtarı güncel.
 *  Q2 (K4)  aynı cihaz (sorular bellekte) teslim: bankadan silinen sorular hesap dışı;
 *           hepsi silinince deneme geçersiz, hak düşmez.
 *  Q3 (A27) gerçek soru sayısı = etkin soru (toplama sorgusu) ve sınavda sorulan sayı.
 *  Q4 (K2)  Genel bakış toplama sorguları = belgelerden hesap (sayı, ortalama, mini, mağaza).
 *  Q5 (K3)  Kurul dönem göstergeleri toplama = belgelerden hesap (30 gün, 90 gün, bu yıl, geçen ay).
 *  Q6 (K6)  aynı anda iki kayıt: biri yazılır, öbürü StaleError.
 *   node --experimental-transform-types --no-warnings --import ./lib/kayit.mjs kota-testi.mjs [Q1,Q2,…]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { client as mkClient } from './lib/istemci.mjs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const adb = getFirestore();
const H = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url), 'utf8'));
const CUR = JSON.parse(readFileSync(new URL('../../src/generated/curriculum.json', import.meta.url), 'utf8'));
const R = {};
const WEEK = 7 * 86400000;
const DAY = 86400000;
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const run = (k) => !only || only.has(k);
const log = (k, v) => { R[k] = v; console.log(k, JSON.stringify(v)); };

// Node'da localStorage yok: cihaz başına önbellek damgası için basit bir yerine koyma (bütün istemciler paylaşır).
if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, length: 0 };
}

const S = (tag) => ({ ...(globalThis.__SAYAC.get(tag) || { r: 0, w: 0, d: 0 }) });
const mods = (await adb.collection('modules').get()).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order);
const usedB = new Set();
const usable = H.baristas.filter((b) => b.pin);
const pickB = (i) => { let k = i; while (usedB.has(usable[k].id)) k++; usedB.add(usable[k].id); return usable[k]; };
const who = (b) => ({ baristaId: b.id, storeId: b.storeId, name: b.name });
async function signIn(c, b) { await c.backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin); }
async function freeModule(bid, exclude = []) {
  const p = (await adb.doc(`progress/${bid}`).get()).data() || {};
  const at = (await adb.collection('attempts').where('baristaId', '==', bid).get()).docs.map((d) => d.data());
  for (const m of mods) {
    if (!m.published || exclude.includes(m.id) || (m.prerequisiteId && !p.modules?.[m.prerequisiteId])) continue;
    if (at.some((a) => a.moduleId === m.id && !a.submittedAt)) continue;
    const n = at.filter((a) => a.moduleId === m.id && !a.voided && !a.lessonId && a.startedAt > Date.now() - WEEK).length;
    const q = await adb.collection('questions').where('moduleId', '==', m.id).limit(1).get();
    if (n === 0 && !q.empty) return m;
  }
  return null;
}
async function answers(attemptId, session, correct = true) {
  const a = (await adb.doc(`attempts/${attemptId}`).get()).data();
  const out = {};
  for (const q of session.questions) {
    const real = (await adb.doc(`questions/${q.id}`).get()).data();
    const r = a.orders[q.id].indexOf(real.answer);
    out[q.id] = correct ? r : (r + 1) % a.orders[q.id].length;
  }
  return out;
}
const staffS = (role, i = 0) => H.staff.filter((x) => x.role === role)[i];
async function staffC(role, tag) {
  const s = staffS(role);
  const c = await mkClient(tag);
  await c.signIn(s.email, s.password);
  await c.asStaff(s);
  (await c.m('store/content.ts')).useContent.setState({ tracks: CUR.tracks, modules: mods, lessons: (await adb.collection('lessons').get()).docs.map((d) => ({ id: d.id, ...d.data() })) });
  c.s = s;
  return c;
}
/** Bir modülün sorularını yedekler; testten sonra geri yazmak için. */
async function snapshotModule(mid) {
  return (await adb.collection('questions').where('moduleId', '==', mid).get()).docs.map((d) => ({ id: d.id, data: d.data() }));
}
async function restore(list, mid) {
  const now = (await adb.collection('questions').where('moduleId', '==', mid).get()).docs;
  const b = adb.batch();
  now.forEach((d) => b.delete(d.ref));
  list.forEach((x) => b.set(adb.doc(`questions/${x.id}`), x.data));
  await b.commit();
}

// ---- Q1: havuz önbelleği (B9)
if (run('Q1')) {
  const b1 = pickB(30); const b2 = pickB(31); const b3 = pickB(32);
  const m = await freeModule(b1.id);
  const backup = await snapshotModule(m.id);
  const c = await mkClient('q1');
  await signIn(c, b1);
  let r0 = S('q1');
  const s1 = await c.exam.startExam(m, who(b1), null);
  const first = S('q1').r - r0.r;
  await c.exam.submitExam(s1.attemptId, await answers(s1.attemptId, s1, true), { questionIds: s1.questions.map((q) => q.id), baristaId: b1.id });
  // Aynı cihazda başka barista (mağaza telefonu): havuz önbellekten
  await signIn(c, b2);
  r0 = S('q1');
  const s2 = await c.exam.startExam(m, who(b2), null);
  const second = S('q1').r - r0.r;
  const byKey = {};
  for (const [k, v] of Object.entries(globalThis.__SAYAC.get('q1').by)) byKey[k] = v.r;
  await c.exam.submitExam(s2.attemptId, await answers(s2.attemptId, s2, true), { questionIds: s2.questions.map((q) => q.id), baristaId: b2.id });
  // Önbellek doluyken modülün yarısından çoğu iptal edilir: iptal edilenlerden hiçbiri sınava gelmemeli.
  const all = backup.map((x) => x.id);
  const keep = new Set(all.slice(0, Math.max(m.examSize || 10, 12)));
  const bt = adb.batch();
  all.filter((id) => !keep.has(id)).forEach((id) => bt.update(adb.doc(`questions/${id}`), { disabled: true }));
  // Tutulanlardan birinin doğru cevabı değiştirilir: cevap anahtarı güncel mi?
  const changedId = [...keep][0];
  const cq = backup.find((x) => x.id === changedId).data;
  const newAnswer = (cq.answer + 1) % cq.options.length;
  bt.update(adb.doc(`questions/${changedId}`), { answer: newAnswer });
  await bt.commit();
  await signIn(c, b3);
  r0 = S('q1');
  const s3 = await c.exam.startExam(m, who(b3), null);
  const third = S('q1').r - r0.r;
  const disabledIn = s3.questions.filter((q) => !keep.has(q.id)).length;
  // Hepsini doğru (güncel anahtarla) cevapla: 100 puan beklenir
  const res3 = await c.exam.submitExam(s3.attemptId, await answers(s3.attemptId, s3, true), { questionIds: s3.questions.map((q) => q.id), baristaId: b3.id });
  await restore(backup, m.id);
  log('Q1', { modul: m.id, havuz: backup.length, okuma: { ilkBasla: first, ikinciBasla: second, iptalSonrasiBasla: third }, soru: [s1.questions.length, s2.questions.length, s3.questions.length], iptalEdilenSinavda: disabledIn, cevapDegisenSoruSoruldu: s3.questions.some((q) => q.id === changedId), puanGuncelAnahtarla: res3.score, kalem: Object.fromEntries(Object.entries(byKey).filter(([k]) => /questions/.test(k))) });
}

// ---- Q2: aynı cihaz teslimi, silinen sorular (K4)
if (run('Q2')) {
  const b = pickB(34); const bAll = pickB(35);
  const m = await freeModule(b.id);
  const backup = await snapshotModule(m.id);
  const c = await mkClient('q2'); await signIn(c, b);
  const s = await c.exam.startExam(m, who(b), null);
  const ans = await answers(s.attemptId, s, true);
  const drop = s.questions.slice(0, 3).map((q) => q.id);
  const bt = adb.batch(); drop.forEach((id) => bt.delete(adb.doc(`questions/${id}`))); await bt.commit();
  const r0 = S('q2');
  const res = await c.exam.submitExam(s.attemptId, ans, { questionIds: s.questions.map((q) => q.id), baristaId: b.id });
  const sub = S('q2').r - r0.r;
  const rec = (await adb.doc(`attempts/${s.attemptId}`).get()).data();
  await restore(backup, m.id);
  // Bütün soruları silinen modül, aynı cihaz
  const m2 = await freeModule(bAll.id, [m.id]);
  const backup2 = await snapshotModule(m2.id);
  const c2 = await mkClient('q2b'); await signIn(c2, bAll);
  const s2 = await c2.exam.startExam(m2, who(bAll), null);
  const ans2 = await answers(s2.attemptId, s2, true);
  const bt2 = adb.batch(); backup2.forEach((x) => bt2.delete(adb.doc(`questions/${x.id}`))); await bt2.commit();
  let res2; try { res2 = await c2.exam.submitExam(s2.attemptId, ans2, { questionIds: s2.questions.map((q) => q.id), baristaId: bAll.id }); } catch (e) { res2 = { hata: e.message, code: e.code }; }
  const rec2 = (await adb.doc(`attempts/${s2.attemptId}`).get()).data();
  const week = (await adb.collection('attempts').where('baristaId', '==', bAll.id).where('moduleId', '==', m2.id).get()).docs.filter((d) => !d.get('voided') && d.get('startedAt') > Date.now() - WEEK).length;
  await restore(backup2, m2.id);
  // Silme olmadan teslim okuması (normal yol)
  const b3 = pickB(36); const m3 = await freeModule(b3.id);
  const c3 = await mkClient('q2c'); await signIn(c3, b3);
  const s3 = await c3.exam.startExam(m3, who(b3), null);
  const a3 = await answers(s3.attemptId, s3, true);
  const r3 = S('q2c');
  await c3.exam.submitExam(s3.attemptId, a3, { questionIds: s3.questions.map((q) => q.id), baristaId: b3.id });
  log('Q2', {
    birkacSilindi: { sorulan: s.questions.length, silinen: drop.length, total: rec.total, correct: rec.correct, score: rec.score, sonuc: { total: res.total, score: res.score }, teslimOkuma: sub },
    hepsiSilindi: { sonuc: res2.hata ? res2 : { score: res2.score }, voided: !!rec2.voided, haftalikSayilan: week },
    normalTeslimOkuma: S('q2c').r - r3.r
  });
}

// ---- Q3: gerçek soru sayısı (A27)
if (run('Q3')) {
  const b = pickB(38);
  const c = await mkClient('q3'); await signIn(c, b);
  const ue = await c.m('features/barista/useExamSize.ts');
  const out = [];
  for (const m of mods.slice(0, 4)) {
    const qs = (await adb.collection('questions').where('moduleId', '==', m.id).get()).docs.map((d) => d.data());
    const active = qs.filter((q) => !q.disabled).length;
    const n = await ue.activeQuestionCount(m.id, null);
    out.push({ modul: m.id, examSize: m.examSize, etkin: active, sayim: n, gosterilen: Math.min(m.examSize, n) });
  }
  // Soruların hepsi iptal edilmiş modül: 0
  const m = mods[5];
  const backup = await snapshotModule(m.id);
  const bt = adb.batch(); backup.forEach((x) => bt.update(adb.doc(`questions/${x.id}`), { disabled: true })); await bt.commit();
  const c2 = await mkClient('q3b'); await signIn(c2, b);
  const ue2 = await c2.m('features/barista/useExamSize.ts');
  const zero = await ue2.activeQuestionCount(m.id, null);
  let start; try { await c2.exam.startExam(m, who(b), null); start = 'başladı'; } catch (e) { start = e.message; }
  await restore(backup, m.id);
  // Mini sınav: reçetenin soruları
  const quizLesson = (await adb.collection('lessons').get()).docs.map((d) => ({ id: d.id, ...d.data() })).find((l) => l.quiz);
  let mini = null;
  if (quizLesson) {
    const qn = (await adb.collection('questions').where('lessonId', '==', quizLesson.id).get()).docs.filter((d) => !d.get('disabled')).length;
    mini = { ders: quizLesson.id, ayardaki: quizLesson.quiz, etkin: qn, sayim: await ue.activeQuestionCount(quizLesson.moduleId, quizLesson.id) };
  }
  log('Q3', { moduller: out, hepsiIptal: { sayim: zero, basla: start }, mini, okuma: S('q3').r });
}

// ---- Q4: Genel bakış (K2)
const dayStart = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const allAttempts = async () => (await adb.collection('attempts').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const fromDocs = (xs) => ({ exams: xs.length, passed: xs.filter((a) => a.passed).length, avgScore: xs.length ? Math.round(xs.reduce((s, a) => s + (a.score || 0), 0) / xs.length) : null });
if (run('Q4')) {
  const d = await staffC('director', 'q4');
  const sd = await d.m('features/staff/staffData.ts');
  const stores = (await adb.collection('stores').get()).docs.map((x) => x.id);
  const from = dayStart(Date.now() - 6 * DAY);
  const r0 = S('q4');
  const ov = await sd.loadOverviewExams(from, stores);
  const reads = S('q4').r - r0.r;
  const at = (await allAttempts()).filter((a) => a.submittedAt && a.submittedAt >= from && !a.voided);
  const mod = at.filter((a) => !a.lessonId);
  const exp = { total: fromDocs(mod), mini: at.length - mod.length, byStore: Object.fromEntries(stores.map((s) => [s, fromDocs(mod.filter((a) => a.storeId === s))])) };
  const got = { total: { exams: ov.total.exams, passed: ov.total.passed, avgScore: ov.total.avgScore }, mini: ov.mini, byStore: Object.fromEntries(stores.map((s) => [s, { exams: ov.byStore[s].exams, passed: ov.byStore[s].passed, avgScore: ov.byStore[s].avgScore }])) };
  log('Q4', { esit: JSON.stringify(exp) === JSON.stringify(got), beklenen: exp.total, mini: [exp.mini, got.mini], gelen: got.total, okuma: reads, belgeSayisi: at.length, farkliMagaza: stores.filter((s) => JSON.stringify(exp.byStore[s]) !== JSON.stringify(got.byStore[s])) });
}

// ---- Q5: Kurul (K3)
if (run('Q5')) {
  const d = await staffC('board', 'q5');
  const sd = await d.m('features/staff/staffData.ts');
  const bs = await d.m('lib/boardStats.ts');
  const stores = (await adb.collection('stores').get()).docs.map((x) => ({ id: x.id, ...x.data() }));
  const baristas = (await adb.collection('baristas').get()).docs.map((x) => ({ id: x.id, ...x.data() }));
  const at = await allAttempts();
  const out = {};
  for (const pid of ['30', '90', 'yil', 'gecen-ay']) {
    const p = bs.periodOf(pid);
    const to = pid === 'gecen-ay' ? p.to : null;
    const ids = { stores: stores.filter((s) => s.active).map((s) => s.id), modules: mods.map((m) => m.id), baristas: sd.examBaristaIds(baristas, p.from) };
    const r0 = S('q5');
    const st = await sd.loadExamStats(p.from, to, ids);
    const reads = S('q5').r - r0.r;
    const ctxBase = { stores, baristas, progress: {}, assignments: [], requests: [], proposals: [], modules: mods, lessons: [], tracks: CUR.tracks };
    const withStats = { ...ctxBase, attempts: [], examStats: st };
    const withDocs = { ...ctxBase, attempts: at, examStats: null };
    const pick = (s) => ({ exams: s.exams, passRate: s.passRate, avgScore: s.avgScore, examTakers: s.examTakers });
    const a = pick(bs.summary(withStats, p)), b = pick(bs.summary(withDocs, p));
    const ca = bs.scorecard(withStats, p).map((r) => [r.store.id, r.exams, r.passRate, r.avgScore]);
    const cb = bs.scorecard(withDocs, p).map((r) => [r.store.id, r.exams, r.passRate, r.avgScore]);
    const ma = bs.modulePerformance(withStats, p), mb = bs.modulePerformance(withDocs, p);
    const ba = bs.bestBarista(withStats, p), bb = bs.bestBarista(withDocs, p);
    out[pid] = {
      ozet: JSON.stringify(a) === JSON.stringify(b) ? a : { toplama: a, belge: b },
      karneEsit: JSON.stringify(ca) === JSON.stringify(cb),
      modulEsit: JSON.stringify(ma) === JSON.stringify(mb),
      baristaEsit: (ba?.id || null) === (bb?.id || null) && (ba?.avgScore ?? null) === (bb?.avgScore ?? null) && (ba?.exams ?? null) === (bb?.exams ?? null),
      enIyi: ba && { id: ba.id, avg: ba.avgScore, n: ba.exams },
      yedekYol: !!st.docs,
      okuma: reads,
      donemBelgesi: at.filter((x) => x.submittedAt && x.submittedAt >= p.from && (!to || x.submittedAt <= to)).length
    };
  }
  log('Q5', out);
}

// ---- Q6: aynı anda iki kayıt (K6)
if (run('Q6')) {
  const dir = await staffC('director', 'q6d');
  const om = await staffC('opsmanager', 'q6m');
  const chD = await dir.m('api/changes.ts'); const chM = await om.m('api/changes.ts');
  const out = [];
  const tr = 'misafir-deneyimi';
  const pool = CUR.lessons.filter((l) => CUR.modules.some((m) => m.id === l.moduleId && m.trackId === tr && m.id !== 'hos-geldin'));
  for (const k of [0, 1, 2]) {
    const les = pool[k];
    const e0 = { id: les.id, ...(await adb.doc(`lessons/${les.id}`).get()).data() };
    const { id: _y, ...r3 } = e0;
    const base = { [chD.versionKey('lessons', les.id)]: chD.verOf(e0) };
    const both = await Promise.allSettled([
      chD.commitChange([{ op: 'set', col: 'lessons', id: les.id, data: { ...r3, title: `D aynı anda ${k}` } }], { kind: 'lesson', title: 'x', summary: 'x' }, null, { base }),
      chM.commitChange([{ op: 'set', col: 'lessons', id: les.id, data: { ...r3, title: `M aynı anda ${k}` } }], { kind: 'lesson', title: 'x', summary: 'x' }, null, { base })
    ]);
    out.push({ sonuc: both.map((x) => (x.status === 'fulfilled' ? x.value : x.reason?.name || String(x.reason))), sonBaslik: (await adb.doc(`lessons/${les.id}`).get()).get('title') });
    await adb.doc(`lessons/${les.id}`).set(r3);
  }
  // Tek kayıt (çakışma yok) hâlâ geçiyor mu; force ile üzerine yazma
  const les = pool[3];
  const e0 = { id: les.id, ...(await adb.doc(`lessons/${les.id}`).get()).data() };
  const { id: _z, ...r } = e0;
  const one = await chD.commitChange([{ op: 'update', col: 'lessons', id: les.id, data: { summary: 'tek kayıt' } }], { kind: 'lesson', title: 'x', summary: 'x' }, null, { base: { [chD.versionKey('lessons', les.id)]: chD.verOf(e0) } });
  let stale = null; try { await chD.commitChange([{ op: 'update', col: 'lessons', id: les.id, data: { summary: 'eski sürümle' } }], { kind: 'lesson', title: 'x', summary: 'x' }, null, { base: { [chD.versionKey('lessons', les.id)]: chD.verOf(e0) } }); } catch (e) { stale = e.name; }
  const forced = await chD.commitChange([{ op: 'update', col: 'lessons', id: les.id, data: { summary: 'zorla' } }], { kind: 'lesson', title: 'x', summary: 'x' }, null, { base: { [chD.versionKey('lessons', les.id)]: chD.verOf(e0) }, force: true });
  const fin = (await adb.doc(`lessons/${les.id}`).get()).get('summary');
  await adb.doc(`lessons/${les.id}`).set(r);
  log('Q6', { ayniAnda: out, tekKayit: one, eskiSurum: stale, zorla: forced, sonOzet: fin });
}

// ---- Q7: önbellek doluyken soru eklenir → sayı değişti, havuz hemen sunucudan (B9)
if (run('Q7')) {
  const b1 = pickB(55); const b2 = pickB(56); const b3 = pickB(57);
  const m = await freeModule(b1.id);
  const backup = await snapshotModule(m.id);
  const c = await mkClient('q7');
  await signIn(c, b1);
  const s1 = await c.exam.startExam(m, who(b1), null);
  await c.exam.submitExam(s1.attemptId, await answers(s1.attemptId, s1, true), { questionIds: s1.questions.map((q) => q.id), baristaId: b1.id });
  const tpl = backup[0].data;
  await adb.doc('questions/q7-yeni-soru').set({ ...tpl, prompt: 'Q7 yeni soru', disabled: false });
  await signIn(c, b2);
  let r0 = S('q7');
  const s2 = await c.exam.startExam(m, who(b2), null);
  const afterAdd = S('q7').r - r0.r;
  await c.exam.submitExam(s2.attemptId, await answers(s2.attemptId, s2, true), { questionIds: s2.questions.map((q) => q.id), baristaId: b2.id });
  await signIn(c, b3);
  r0 = S('q7');
  await c.exam.startExam(m, who(b3), null);
  const next = S('q7').r - r0.r;
  await restore(backup, m.id);
  log('Q7', { modul: m.id, havuz: backup.length + 1, okuma: { soruEklenince: afterAdd, sonraki: next } });
}

// ---- Q8: çevrimdışı sürüm denetimli kayıt: "kuyruğa alındı" ancak yazım kuyruğa girince (B-2)
if (run('Q8')) {
  const dir = await staffC('director', 'q8');
  const ch = await dir.m('api/changes.ts');
  const gate = await dir.m('lib/writeGate.ts');
  const les = CUR.lessons.filter((l) => l.moduleId === 'sicak-kahveler')[2];
  const e0 = { id: les.id, ...(await adb.doc(`lessons/${les.id}`).get()).data() };
  await dir.fs.disableNetwork(dir.db);
  const t0 = Date.now();
  let settled = null;
  const p = ch.commitChange([{ op: 'update', col: 'lessons', id: les.id, data: { summary: 'Q8 çevrimdışı' } }], { kind: 'lesson', title: 'x', summary: 'x' }, null, { base: { [ch.versionKey('lessons', les.id)]: ch.verOf(e0) } })
    .then((r) => { settled = r; }, (e) => { settled = 'hata:' + e.message; });
  await gate.whenPrepared();
  const gateMs = Date.now() - t0;
  const pendingAtGate = settled === null;
  await new Promise((r) => setTimeout(r, 500));
  await dir.fs.enableNetwork(dir.db);
  await p;
  const after = (await adb.doc(`lessons/${les.id}`).get()).get('summary');
  { const { id: _q, ...orig } = e0; await adb.doc(`lessons/${les.id}`).set(orig); }
  log('Q8', { kapiAcildiMs: gateMs, kapidaYazimBekliyor: pendingAtGate, sonuc: settled, sunucuda: after === 'Q8 çevrimdışı', toplamMs: Date.now() - t0 });
}

writeFileSync(new URL('./out/kota-testi.json', import.meta.url), JSON.stringify(R, null, 2));
process.exit(0);
