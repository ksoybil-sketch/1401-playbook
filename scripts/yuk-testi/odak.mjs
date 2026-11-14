/**
 * Düşük yükte, tekrarlanabilir odak testleri (YALNIZCA emülatör), düzeltmelerden sonraki API ile
 * (prepareExam yok; startExam(mod, who, lesson?, { resume })):
 *  T1 iki cihaz aynı anda Başla            T2 açık sınavdaki soru iptal → teslim (doğru/yanlış)
 *  T3 açık sınavın modülündeki TÜM sorular silinir → devam: voided, hak düşmez
 *  T4 bazı sorular silinir → devam, total tutarlı   T5 süre dolunca teslim + okuma sayıları
 *  T7 aynı içerikle yeniden yazım                    T8 yetki değişikliğinin ulaşma süresi
 *  T9  (madde 5)  teslim edilmiş sınavlarda soru iptali: kimsenin puanı düşmez
 *  T10 (madde 13) Müfredatı güncelle panel içeriğini korur, ikinci çalıştırma değişiklik yok
 *  T11 (madde 15) icerikYayin açık + oneriOnay kapalı
 *  T12 (madde 14) eski öneri / eşzamanlı ders ve bülten kaydı
 *  T13 (madde 16) geliştirici iz bırakmıyor (markSeen, yanıt, bülten, soru iptali, kod, kurul yanıtı)
 *  T14 (madde 25, 21) mini sınav rozetleri; geçersiz görevler, Sözünün Eri
 *   node --experimental-transform-types --no-warnings --import ./lib/kayit.mjs odak.mjs
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = {};
const WEEK = 7 * 86400000;
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const run = (k) => !only || only.has(k);
const log = (k, v) => { R[k] = v; console.log(k, JSON.stringify(v)); };

const client = async (tag) => mkClient(tag);
const mods = (await adb.collection('modules').get()).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order);
const used = new Set();
async function freeModule(bid, exclude = []) {
  const p = (await adb.doc(`progress/${bid}`).get()).data() || {};
  const at = (await adb.collection('attempts').where('baristaId', '==', bid).get()).docs.map((d) => d.data());
  for (const m of mods) {
    if (!m.published || exclude.includes(m.id) || (m.prerequisiteId && !p.modules?.[m.prerequisiteId])) continue;
    if (at.some((a) => a.moduleId === m.id && !a.submittedAt)) continue;
    const n = at.filter((a) => a.moduleId === m.id && !a.voided && !a.lessonId && a.startedAt > Date.now() - WEEK).length;
    const q = await adb.collection('questions').where('moduleId', '==', m.id).limit(1).get();
    if (n < 2 && !q.empty) return m;
  }
  return null;
}
async function signIn(c, b) { await c.backend.baristaSignIn({ id: b.id, authEmail: b.email }, b.pin); }
const usable = H.baristas.filter((b) => b.pin);
const pickB = (i) => { let k = i; while (used.has(usable[k].id)) k++; used.add(usable[k].id); return usable[k]; };
const who = (b) => ({ baristaId: b.id, storeId: b.storeId, name: b.name });
const qData = async (id) => (await adb.doc(`questions/${id}`).get()).data();
async function answerAll(attemptId, session, correct = true, wrongIds = []) {
  const a = (await adb.doc(`attempts/${attemptId}`).get()).data();
  const out = {};
  for (const q of session.questions) {
    const real = await qData(q.id); const r = a.orders[q.id].indexOf(real.answer);
    out[q.id] = correct && !wrongIds.includes(q.id) ? r : (r + 1) % a.orders[q.id].length;
  }
  return out;
}
const staffS = (role, i = 0) => H.staff.filter((x) => x.role === role)[i];
async function staffC(role, i = 0, tag) {
  const s = staffS(role, i);
  const c = await client(tag || `st-${role}-${i}-${Math.random().toString(36).slice(2, 6)}`);
  await c.signIn(s.email, s.password);
  await c.asStaff(s);
  (await c.m('store/content.ts')).useContent.setState({ tracks: CUR.tracks, modules: (await adb.collection('modules').get()).docs.map((d) => ({ id: d.id, ...d.data() })), lessons: (await adb.collection('lessons').get()).docs.map((d) => ({ id: d.id, ...d.data() })) });
  c.s = s;
  return c;
}

// ---- T1
if (run('T1')) {
  const b = pickB(2);
  const m = await freeModule(b.id);
  const c1 = await client('t1a'); const c2 = await client('t1b');
  await signIn(c1, b); await signIn(c2, b);
  const [s1, s2] = await Promise.all([c1.exam.startExam(m, who(b), null), c2.exam.startExam(m, who(b), null)]);
  const open = (await adb.collection('attempts').where('baristaId', '==', b.id).where('moduleId', '==', m.id).where('submittedAt', '==', null).get()).size;
  const ans1 = await answerAll(s1.attemptId, s1, true);
  const r1 = await c1.exam.submitExam(s1.attemptId, ans1, { questionIds: s1.questions.map((q) => q.id), baristaId: b.id });
  const r2 = await c2.exam.submitExam(s2.attemptId, undefined, { questionIds: s2.questions.map((q) => q.id), baristaId: b.id }).catch((e) => ({ hata: e.message }));
  const wk = (await adb.collection('attempts').where('baristaId', '==', b.id).where('moduleId', '==', m.id).get()).docs.filter((d) => d.get('startedAt') > Date.now() - WEEK && !d.get('voided')).length;
  log('T1', { barista: b.id, modul: m.id, ayniDeneme: s1.attemptId === s2.attemptId, acikDenemeSayisi: open, puanlar: [r1.score, r2.score ?? r2.hata], haftalikKullanilan: wk });
}

// ---- T2: açık sınavda iptal; biri soruyu doğru, biri yanlış yapmış
if (run('T2')) {
  const dir = await staffC('director', 0, 't2dir');
  const rg = await dir.m('api/regrade.ts');
  const out = [];
  for (const [i, wrong] of [[6, false], [7, true]]) {
    const b = pickB(i);
    const m = await freeModule(b.id);
    const c = await client(`t2-${i}`); await signIn(c, b);
    const s = await c.exam.startExam(m, who(b), null);
    const dq = s.questions[0].id;
    const ans = await answerAll(s.attemptId, s, true, wrong ? [dq] : []);
    const rr = await rg.disableAndRegrade({ id: dq, ...(await qData(dq)) }, 'test', { name: 'Cenk' });
    const mid = (await adb.doc(`attempts/${s.attemptId}`).get()).data();
    const res = await c.exam.submitExam(s.attemptId, ans, { questionIds: s.questions.map((q) => q.id), baristaId: b.id });
    const a = (await adb.doc(`attempts/${s.attemptId}`).get()).data();
    out.push({ iptalSoruyu: wrong ? 'yanlış' : 'doğru', n: s.questions.length, regrade: rr, acikDenemeyeNot: mid.voidedQuestions || null, kayit: { score: a.score, correct: a.correct, total: a.total, voidedQuestions: a.voidedQuestions || null, yanlislardaIptal: (a.mistakes || []).some((x) => x.questionId === dq) }, ekran: { score: res.score, correct: res.correct, total: res.total } });
  }
  log('T2', out);
}

// ---- T3/T4: müfredat güncellemesi sırasında açık sınavlar
if (run('T3')) {
  const bA = pickB(10); const bB = pickB(14);
  const mA = await freeModule(bA.id);
  const mB = await freeModule(bB.id, [mA.id]);
  const cA = await client('t3a'); await signIn(cA, bA);
  const cB = await client('t3b'); await signIn(cB, bB);
  const sA = await cA.exam.startExam(mA, who(bA), null);
  const sB = await cB.exam.startExam(mB, who(bB), null);
  const ansA = await answerAll(sA.attemptId, sA, true);
  const ansB = await answerAll(sB.attemptId, sB, true);
  for (const [id, x] of [[sA.attemptId, ansA], [sB.attemptId, ansB]]) await adb.doc(`attempts/${id}`).update({ answers: x });
  const weekBefore = (await adb.collection('attempts').where('baristaId', '==', bA.id).where('moduleId', '==', mA.id).get()).docs.filter((d) => !d.get('voided') && d.get('startedAt') > Date.now() - WEEK).length;
  const existing = (await adb.collection('questions').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const dropB = new Set(sB.questions.slice(0, 4).map((q) => q.id));
  const file = { ...CUR, questions: existing.filter((q) => q.moduleId !== mA.id && !dropB.has(q.id)) };
  const d = await staffC('director', 0, 't3dir');
  const pc = await d.m('api/publishCurriculum.ts');
  const r0 = { ...globalThis.__SAYAC.get('t3dir') };
  const plan = await pc.planCurriculum(file);
  const r1 = { ...globalThis.__SAYAC.get('t3dir') };
  const pr = await pc.publishCurriculum(file, undefined, plan);
  const r2 = { ...globalThis.__SAYAC.get('t3dir') };
  // A: başka cihazdan devam (ekran açık denemeyi biliyor: resume)
  const cA2 = await client('t3a2'); await signIn(cA2, bA);
  let resumeA; try { resumeA = await cA2.exam.startExam(mA, who(bA), null, { resume: true }); } catch (e) { resumeA = { hata: e.message, code: e.code }; }
  const aA = (await adb.doc(`attempts/${sA.attemptId}`).get()).data();
  const weekAfter = (await adb.collection('attempts').where('baristaId', '==', bA.id).where('moduleId', '==', mA.id).get()).docs.filter((x) => !x.get('voided') && x.get('startedAt') > Date.now() - WEEK).length;
  // Aynı cihaz (soruları bellekte) teslim etmeye çalışırsa:
  let subA; try { subA = await cA.exam.submitExam(sA.attemptId, ansA, { questionIds: sA.questions.map((q) => q.id), baristaId: bA.id }); } catch (e) { subA = { hata: e.message, code: e.code }; }
  // B: yeni cihazdan devam
  const cB2 = await client('t3b2'); await signIn(cB2, bB);
  const resumeB = await cB2.exam.startExam(mB, who(bB), null, { resume: true });
  const resB = await cB2.exam.submitExam(sB.attemptId, ansB, { questionIds: resumeB.questions.map((q) => q.id), baristaId: bB.id });
  const aB = (await adb.doc(`attempts/${sB.attemptId}`).get()).data();
  log('T3', { modul: mA.id, sorulan: sA.questions.length, devam: resumeA.hata ? resumeA : { soru: resumeA.questions?.length }, kayit: { voided: !!aA.voided, submittedAt: !!aA.submittedAt, score: aA.score ?? null }, haftalikOnce: weekBefore, haftalikSonra: weekAfter, ayniCihazTeslim: subA.hata ? subA : { score: subA.score }, plan: plan.counts, pr, okuma: { plan: r1.r - r0.r, yayin: r2.r - r1.r, yazma: r2.w - r1.w, silme: r2.d - r1.d } });
  log('T4', { modul: mB.id, sorulan: sB.questions.length, silinen: dropB.size, devamEdinceSoru: resumeB.questions.length, teslim: { score: resB.score, correct: resB.correct, total: resB.total }, kayit: { score: aB.score, correct: aB.correct, total: aB.total } });
}

// ---- T5: tek kullanıcı süreleri ve okuma; süre dolunca teslim
if (run('T5')) {
  const b = pickB(20);
  const m = await freeModule(b.id);
  const c = await client('t5'); await signIn(c, b);
  const S = () => ({ ...(globalThis.__SAYAC.get('t5') || { r: 0, w: 0 }) });
  const r0 = S();
  const t1 = Date.now(); const s = await c.exam.startExam(m, who(b), null); const tStart = Date.now() - t1; const r1 = S();
  const pool = (await adb.collection('questions').where('moduleId', '==', m.id).get()).size;
  const ans = await answerAll(s.attemptId, s, true);
  let tSave = 0;
  for (const id of Object.keys(ans).slice(0, 5)) { const t = Date.now(); await c.exam.saveAnswers(s.attemptId, { [id]: ans[id] }); tSave += Date.now() - t; }
  await adb.doc(`attempts/${s.attemptId}`).update({ deadline: Date.now() - 1000 });
  const r15 = S();
  const t2 = Date.now();
  let res, err = null;
  try { res = await c.exam.submitExam(s.attemptId, Object.fromEntries(Object.entries(ans).slice(0, 5)), { timedOut: true, questionIds: s.questions.map((q) => q.id), baristaId: b.id }); } catch (e) { err = e.message; }
  const tSub = Date.now() - t2; const r2 = S();
  // Devam (resume: ekran açık denemeyi biliyor) okuma sayısı
  const b2 = pickB(21); const m2 = await freeModule(b2.id);
  const c2 = await client('t5b'); await signIn(c2, b2);
  await c2.exam.startExam(m2, who(b2), null);
  const c3 = await client('t5c'); await signIn(c3, b2);
  const q0 = { ...(globalThis.__SAYAC.get('t5c') || { r: 0 }) };
  await c3.exam.startExam(m2, who(b2), null, { resume: true });
  const q1 = { ...globalThis.__SAYAC.get('t5c') };
  log('T5', { modul: m.id, havuz: pool, soru: s.questions.length, sure: { startMs: tStart, saveOrtMs: Math.round(tSave / 5), submitMs: tSub }, okuma: { baslat: r1.r - r0.r, teslim: r2.r - r15.r, devamResume: q1.r - q0.r }, yazma: r2.w, sonuc: res ? { score: res.score, timedOut: res.timedOut, total: res.total } : err });
}

// ---- T7
if (run('T7')) {
  const c = await client('t7'); const b = pickB(25); await signIn(c, b);
  let n = 0; const u = c.fs.onSnapshot(c.fs.collection(c.fb.db, 'tracks'), (s) => { n += s.docChanges().length; });
  await sleep(1500); const base = n;
  const tr = (await adb.collection('tracks').get()).docs;
  const bt = adb.batch(); tr.forEach((d) => bt.set(d.ref, d.data())); await bt.commit();
  await sleep(1500);
  u();
  log('T7', { ilk: base, ayniIcerikYazimiSonrasiDegisiklik: n - base });
}
// ---- T8
if (run('T8')) {
  const opsS = staffS('ops');
  const c = await client('t8'); await c.signIn(opsS.email, opsS.password);
  const pe = await c.m('lib/permissions.ts');
  pe.usePermStore.getState().subscribe();
  await sleep(1500);
  const before = pe.allowed('ops', 'gorevAtama');
  const t = Date.now();
  await adb.doc('config/permissions').set({ roles: { ops: { gorevAtama: false } } }, { merge: true });
  while (pe.allowed('ops', 'gorevAtama') && Date.now() - t < 10000) await sleep(5);
  log('T8', { once: before, ulasmaMs: Date.now() - t, sonra: pe.allowed('ops', 'gorevAtama') });
  await adb.doc('config/permissions').set({ roles: { ops: { gorevAtama: true } } }, { merge: true });
}

// ---- T9: teslim edilmiş sınavlarda soru iptali (madde 5)
if (run('T9')) {
  const m = mods.find((x) => x.id === 'sicak-kahveler') || mods[2];
  const qs = (await adb.collection('questions').where('moduleId', '==', m.id).get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((q) => !q.disabled).slice(0, 10);
  const X = qs[0].id;
  // Senaryolar: [ad, X'i nasıl yaptı, doğru sayısı (10 üzerinden), passScore]
  const cases = [['dogru-sinirda-gecti', 'right', 8, 80], ['dogru-kaldi', 'right', 6, 80], ['yanlis-kaldi', 'wrong', 7, 80], ['bos-kaldi-gecer', 'blank', 7, 75], ['yanlis-gecti', 'wrong', 9, 80], ['yanlis-tam-sinir', 'wrong', 8, 80]];
  const ids = [];
  const t0 = Date.now() - 3600000;
  for (const [k, [name, how, nCorrect, ps]] of cases.entries()) {
    const b = pickB(30 + k);
    const answers = {}; const orders = {}; const mistakes = [];
    let correct = 0;
    // X ilk soru; geri kalan 9 sorudan doğru sayısı tamamlanır.
    const rightOthers = how === 'right' ? nCorrect - 1 : nCorrect;
    qs.forEach((q, i) => {
      orders[q.id] = q.options.map((_, j) => j);
      let ok;
      if (q.id === X) ok = how === 'right';
      else ok = i <= rightOthers;
      if (q.id === X && how === 'blank') { mistakes.push({ questionId: q.id, prompt: q.prompt, options: q.options, given: null, answer: q.answer, explanation: '' }); return; }
      answers[q.id] = ok ? q.answer : (q.answer + 1) % q.options.length;
      if (ok) correct++; else mistakes.push({ questionId: q.id, prompt: q.prompt, options: q.options, given: answers[q.id], answer: q.answer, explanation: '' });
    });
    const score = Math.round((correct / 10) * 100);
    const passed = score >= ps;
    const ref = adb.collection('attempts').doc();
    await ref.set({ baristaId: b.id, baristaName: b.name, storeId: b.storeId, moduleId: m.id, moduleTitle: m.title, passScore: ps, lessonId: null, startedAt: t0, deadline: t0 + 900000, total: 10, questionIds: qs.map((q) => q.id), orders, answers, submittedAt: t0 + 600000, correct, score, passed, mistakes, timedOut: false });
    const prog = (await adb.doc(`progress/${b.id}`).get()).data() || {};
    if (passed) await adb.doc(`progress/${b.id}`).set({ modules: { ...(prog.modules || {}), [m.id]: { score, passedAt: t0 + 600000 } } }, { merge: true });
    else if (prog.modules?.[m.id]) { const mm = { ...prog.modules }; delete mm[m.id]; await adb.doc(`progress/${b.id}`).update({ modules: mm }); }
    ids.push({ name, id: ref.id, b: b.id, once: { correct, total: 10, score, passed } });
  }
  const dir = await staffC('director', 0, 't9dir');
  const rg = await dir.m('api/regrade.ts');
  const rr = await rg.disableAndRegrade({ id: X, ...(await qData(X)) }, 'Cevap anahtarı hatalı', { name: 'Cenk Girginol' });
  const rows = [];
  for (const x of ids) {
    const a = (await adb.doc(`attempts/${x.id}`).get()).data();
    const p = (await adb.doc(`progress/${x.b}`).get()).data();
    rows.push({ senaryo: x.name, once: `${x.once.correct}/${x.once.total}=${x.once.score} ${x.once.passed ? 'geçti' : 'kaldı'}`, sonra: `${a.correct}/${a.total}=${a.score} ${a.passed ? 'geçti' : 'kaldı'}`, puanDustu: a.score < x.once.score, gectiKaldi: x.once.passed && !a.passed, progress: p.modules?.[m.id]?.score ?? null, progressTutarli: a.passed ? (p.modules?.[m.id]?.score ?? -1) >= a.score : !p.modules?.[m.id], voidedQuestions: a.voidedQuestions });
  }
  // İkinci kez iptal (aynı soru) bir şey değiştirmemeli
  const rr2 = await rg.disableAndRegrade({ id: X, ...(await qData(X)) }, 'tekrar', { name: 'Cenk Girginol' });
  log('T9', { soru: X, regrade: rr, tekrar: rr2, rows });
}

// ---- T10: Müfredatı güncelle (madde 13)
if (run('T10')) {
  const dir = await staffC('director', 0, 't10dir');
  const ch = await dir.m('api/changes.ts');
  const pc = await dir.m('api/publishCurriculum.ts');
  const newId = (col) => ch.newId(col);
  const L = CUR.lessons; const modX = 'sicak-kahveler';
  // Panel yolları (uygulamanın yazdığı veriyle aynı; commitChange ile)
  const trackId = newId('tracks'), moduleId = newId('modules'), lessonAdd = newId('lessons'), lessonImp = newId('lessons'), qImp = newId('questions'), qNew = newId('questions');
  await ch.commitChange([{ op: 'set', col: 'tracks', id: trackId, data: { title: 'Panel yolu', description: '', icon: 'flag', published: true, order: 9, kaynak: 'panel' } }], { kind: 'track', title: 'x', summary: 'x' });
  await ch.commitChange([{ op: 'set', col: 'modules', id: moduleId, data: { trackId, title: 'Panel modülü', description: '', examSize: 5, passScore: 80, published: true, order: 1, questionCount: 0, kaynak: 'panel' } }], { kind: 'module', title: 'x', summary: 'x' });
  await ch.commitChange([{ op: 'set', col: 'lessons', id: lessonAdd, data: { moduleId: modX, title: 'Ders ekle ile', order: 99, durationMin: 3, blocks: [{ type: 'text', text: '' }], published: false, kaynak: 'panel' } }], { kind: 'lesson', title: 'x', summary: 'x' });
  await ch.commitChange([
    { op: 'set', col: 'lessons', id: lessonImp, data: { moduleId: modX, title: 'Dosyadan ders', order: 100, durationMin: 2, blocks: [{ type: 'text', text: 'pdf' }], published: false, kaynak: 'panel' } },
    { op: 'set', col: 'questions', id: qImp, data: { moduleId: modX, type: 'single', prompt: 'Dosyadan soru?', options: ['a', 'b', 'c'], answer: 0, explanation: '', kind: 'kavram', imageUrl: '', kaynak: 'panel' } }
  ], { kind: 'lesson', title: 'x', summary: 'x' });
  await ch.commitChange([{ op: 'set', col: 'questions', id: qNew, data: { moduleId: modX, type: 'single', prompt: 'Soru penceresi?', options: ['a', 'b'], answer: 1, explanation: '', kaynak: 'panel' } }], { kind: 'question', title: 'x', summary: 'x' });
  // İşaretsiz eski panel belgeleri (20 karakterlik otomatik kimlik)
  const oldL = adb.collection('lessons').doc(); const oldQ = adb.collection('questions').doc(); const oldM = adb.collection('modules').doc();
  await oldL.set({ moduleId: modX, title: 'Eski panel dersi (işaretsiz)', order: 101, durationMin: 2, blocks: [], published: true });
  await oldQ.set({ moduleId: modX, type: 'single', prompt: 'Eski panel sorusu', options: ['a', 'b'], answer: 0 });
  await oldM.set({ trackId: 'oryantasyon', title: 'Eski panel modülü', published: false, order: 50 });
  // El emeği: yayından kaldırılan ders, düzeltilmiş bardak, iptal edilen soru, düzeltilmiş soru
  const unpub = L.find((l) => l.moduleId === 'italyan-klasikler');
  await adb.doc(`lessons/${unpub.id}`).update({ published: false });
  const cupL = L.find((l) => (l.blocks || []).some((x) => x.type === 'cup'));
  const blocks = (await adb.doc(`lessons/${cupL.id}`).get()).data().blocks.map((x) => (x.type === 'cup' && !x.edited ? { ...x, edited: true, note: 'panel düzeltmesi' } : x));
  await adb.doc(`lessons/${cupL.id}`).update({ blocks });
  const disQ = CUR.questions.find((q) => q.moduleId === 'demleme-turk');
  await adb.doc(`questions/${disQ.id}`).update({ disabled: true, disabledReason: 'test', disabledAt: Date.now() });
  const edQ = CUR.questions.find((q) => q.moduleId === 'demleme-turk' && q.id !== disQ.id);
  await adb.doc(`questions/${edQ.id}`).update({ prompt: 'PANELDE DÜZELTİLDİ', edited: true });
  // Dosya: gerçek müfredat, tek bir ders başlığı değişmiş (yazılacak bir şey olsun)
  const file = JSON.parse(JSON.stringify(CUR));
  const chg = file.lessons.find((l) => l.moduleId === 'hos-geldin');
  chg.title = chg.title + ' (yeni sezon)';
  const p1 = await pc.planCurriculum(file);
  const r1 = await pc.publishCurriculum(file, undefined, p1);
  const ex = async (col, id) => (await adb.doc(`${col}/${id}`).get()).exists;
  const korundu = {
    panelYolu: await ex('tracks', trackId), panelModulu: await ex('modules', moduleId), dersEkle: await ex('lessons', lessonAdd),
    dosyadanDers: await ex('lessons', lessonImp), dosyadanSoru: await ex('questions', qImp), soruPenceresi: await ex('questions', qNew),
    eskiIsaretsizDers: await ex('lessons', oldL.id), eskiIsaretsizSoru: await ex('questions', oldQ.id), eskiIsaretsizModul: await ex('modules', oldM.id)
  };
  const elEmegi = {
    publishedFalse: (await adb.doc(`lessons/${unpub.id}`).get()).get('published') === false,
    cupEdited: (await adb.doc(`lessons/${cupL.id}`).get()).get('blocks').some((x) => x.type === 'cup' && x.edited && x.note === 'panel düzeltmesi'),
    soruIptali: (await adb.doc(`questions/${disQ.id}`).get()).get('disabled') === true,
    duzeltilmisSoru: (await adb.doc(`questions/${edQ.id}`).get()).get('prompt') === 'PANELDE DÜZELTİLDİ',
    degisenDersYazildi: (await adb.doc(`lessons/${chg.id}`).get()).get('title') === chg.title
  };
  const p2 = await pc.planCurriculum(file);
  log('T10', { plan1: { counts: p1.counts, totalWrites: p1.totalWrites, removedTitles: p1.removedTitles }, yayin1: r1, korundu, elEmegi, plan2: { totalWrites: p2.totalWrites, dugme: p2.totalWrites === 0 ? 'Değişiklik yok' : 'Uygula', counts: p2.counts } });
}

// ---- T11: icerikYayin açık + oneriOnay kapalı (madde 15)
if (run('T11')) {
  await adb.doc('config/permissions').set({ roles: { regional: { icerikYayin: true, oneriOnay: false } } }, { merge: true });
  const ops = await staffC('ops', 0, 't11ops');
  const reg = await staffC('regional', 0, 't11reg');
  const pe = await reg.m('lib/permissions.ts'); pe.usePermStore.getState().subscribe(); await sleep(1200);
  const chO = await ops.m('api/changes.ts'); const chR = await reg.m('api/changes.ts');
  const les = CUR.lessons.find((l) => l.moduleId === 'misafir-karsilama');
  const before = (await adb.doc(`lessons/${les.id}`).get()).data();
  const r = await chO.commitChange([{ op: 'update', col: 'lessons', id: les.id, data: { title: 'OPS ÖNERİSİ T11' } }], { kind: 'lesson', title: 'T11', summary: 'x' });
  const pid = chO.lastProposalId;
  const p = { id: pid, ...(await adb.doc(`proposals/${pid}`).get()).data() };
  let hata = null;
  try { await chR.commitChange(p.ops, { kind: p.kind, title: p.title, summary: p.summary }, pid); } catch (e) { hata = e.message; }
  let hata2 = null;
  try { await chR.approveProposal(p); } catch (e) { hata2 = e.message; }
  const after = (await adb.doc(`lessons/${les.id}`).get()).data();
  const pa = (await adb.doc(`proposals/${pid}`).get()).data();
  log('T11', { oneri: r, onaylaYayinla: hata, oldugGibiYayinla: hata2, dersDegisti: after.title !== before.title, oneriDurum: pa.status });
  await adb.doc('config/permissions').set({ roles: { regional: { icerikYayin: false, oneriOnay: false } } }, { merge: true });
}

// ---- T12: eski öneri + eşzamanlı ders/bülten (madde 14)
if (run('T12')) {
  const ops = await staffC('ops', 0, 't12ops');
  const dir = await staffC('director', 0, 't12dir');
  const om = await staffC('opsmanager', 0, 't12om');
  const chO = await ops.m('api/changes.ts'); const chD = await dir.m('api/changes.ts'); const chM = await om.m('api/changes.ts');
  const les = CUR.lessons.filter((l) => l.moduleId === 'hos-geldin')[1];
  const cur = { id: les.id, ...(await adb.doc(`lessons/${les.id}`).get()).data() };
  const { id: _i, ...rest } = cur;
  await chO.commitChange([{ op: 'set', col: 'lessons', id: les.id, data: { ...rest, title: 'OPS ÖNERİSİ (eski)' } }], { kind: 'lesson', title: 'T12', summary: 'x' }, null, { base: { [chO.versionKey('lessons', les.id)]: chO.verOf(cur) } });
  const pid = chO.lastProposalId;
  // Ders başkasınca düzeltilir
  await sleep(5);
  await chD.commitChange([{ op: 'update', col: 'lessons', id: les.id, data: { summary: 'Direktör düzeltti' } }], { kind: 'lesson', title: 'x', summary: 'x' });
  const p = { id: pid, ...(await adb.doc(`proposals/${pid}`).get()).data() };
  let stale = null; try { await chD.approveProposal(p); } catch (e) { stale = { tip: e.name, mesaj: e.message }; }
  const stillDirector = (await adb.doc(`lessons/${les.id}`).get()).get('summary') === 'Direktör düzeltti';
  const listed = await chD.proposalStale(p);
  // Eşzamanlı editör: direktör dersi açar (base), op. müdürü kaydeder, direktör kaydeder
  const les2 = CUR.lessons.filter((l) => l.moduleId === 'hos-geldin')[2];
  const d0 = { id: les2.id, ...(await adb.doc(`lessons/${les2.id}`).get()).data() };
  const baseD = { [chD.versionKey('lessons', les2.id)]: chD.verOf(d0) };
  const d1 = { id: les2.id, ...(await adb.doc(`lessons/${les2.id}`).get()).data() };
  const baseM = { [chM.versionKey('lessons', les2.id)]: chM.verOf(d1) };
  const { id: _x, ...r2 } = d1;
  const om1 = await chM.commitChange([{ op: 'set', col: 'lessons', id: les2.id, data: { ...r2, title: 'OPS MÜDÜRÜ düzenledi' } }], { kind: 'lesson', title: 'x', summary: 'x' }, null, { base: baseM });
  await sleep(5);
  let dStale = null; try { await chD.commitChange([{ op: 'set', col: 'lessons', id: les2.id, data: { ...r2, title: 'DİREKTÖR düzenledi' } }], { kind: 'lesson', title: 'x', summary: 'x' }, null, { base: baseD }); } catch (e) { dStale = { tip: e.name, mesaj: e.message }; }
  const titleNow = (await adb.doc(`lessons/${les2.id}`).get()).get('title');
  // Gerçekten aynı anda (ms farkla) iki kayıt: denetim işlem içinde değil
  const les3 = CUR.lessons.filter((l) => l.moduleId === 'hos-geldin')[3];
  const e0 = { id: les3.id, ...(await adb.doc(`lessons/${les3.id}`).get()).data() };
  const { id: _y, ...r3 } = e0;
  const base3D = { [chD.versionKey('lessons', les3.id)]: chD.verOf(e0) };
  const base3M = { [chM.versionKey('lessons', les3.id)]: chM.verOf(e0) };
  const both = await Promise.allSettled([
    chD.commitChange([{ op: 'set', col: 'lessons', id: les3.id, data: { ...r3, title: 'D aynı anda', blocks: [...r3.blocks, { type: 'text', text: 'Direktör paragrafı' }] } }], { kind: 'lesson', title: 'x', summary: 'x' }, null, { base: base3D }),
    chM.commitChange([{ op: 'set', col: 'lessons', id: les3.id, data: { ...r3, title: 'M aynı anda' } }], { kind: 'lesson', title: 'x', summary: 'x' }, null, { base: base3M })
  ]);
  const e1 = (await adb.doc(`lessons/${les3.id}`).get()).data();
  // Bülten
  const bid = 't12-bulten';
  await chD.commitChange([{ op: 'set', col: 'bulletins', id: bid, data: { kind: 'duyuru', title: 'Bülten v1', body: 'x', storeIds: null, rows: [], people: [], expiresAt: null, published: true, pinned: false, createdAt: Date.now(), createdBy: dir.s.uid, createdByName: 'Cenk' } }], { kind: 'bulletin', title: 'x', summary: 'x' });
  const b0 = { id: bid, ...(await adb.doc(`bulletins/${bid}`).get()).data() };
  const bBase = { [chD.versionKey('bulletins', bid)]: chD.verOf(b0) };
  await chM.commitChange([{ op: 'update', col: 'bulletins', id: bid, data: { title: 'Bülten (op. müdürü)' } }], { kind: 'bulletin', title: 'x', summary: 'x' }, null, { base: bBase });
  let bStale = null; try { await chD.commitChange([{ op: 'update', col: 'bulletins', id: bid, data: { title: 'Bülten (direktör)' } }], { kind: 'bulletin', title: 'x', summary: 'x' }, null, { base: bBase }); } catch (e) { bStale = { tip: e.name, mesaj: e.message }; }
  log('T12', { eskiOneri: { uyari: stale, direktorDuzeltmesiKorundu: stillDirector, listede: listed }, esZamanliEditor: { om: om1, direktor: dStale, sonBaslik: titleNow }, gercektenAyniAnda: { sonuc: both.map((x) => x.status === 'fulfilled' ? x.value : x.reason?.name), sonBaslik: e1.title, direktorParagrafi: e1.blocks.some((x) => x.text === 'Direktör paragrafı') }, bulten: { direktor: bStale, sonBaslik: (await adb.doc(`bulletins/${bid}`).get()).get('title') } });
}

// ---- T13: geliştirici iz bırakmıyor (madde 16, node tarafı)
if (run('T13')) {
  const dev = await staffC('developer', 0, 't13dev');
  const lead = H.baristas.find((b) => b.role === 'lead' && b.pin);
  const lc = await client('t13lead'); await signIn(lc, lead);
  const rqL = await lc.m('api/requests.ts');
  const rid = await rqL.createRequest({ storeId: lead.storeId, storeName: lead.storeId, category: 'ariza', priority: 'normal', title: 'Geliştirici testi', detail: 'x', by: { uid: lc.uid(), name: lead.name } });
  const rq = await dev.m('api/requests.ts');
  const r0 = { id: rid, ...(await adb.doc(`requests/${rid}`).get()).data() };
  await rq.markSeen(r0, { uid: dev.s.uid, name: dev.s.name });
  const afterSeen = (await adb.doc(`requests/${rid}`).get()).data();
  await rq.addNote(afterSeen && { id: rid, ...afterSeen }, { side: 'ops', by: { uid: dev.s.uid, name: dev.s.name }, text: 'Geliştirici yanıtı', status: 'in_progress' });
  const afterNote = (await adb.doc(`requests/${rid}`).get()).data();
  const ch = await dev.m('api/changes.ts');
  const roles = await dev.m('lib/roles.ts');
  const author = roles.authorName('developer', dev.s.name);
  await ch.commitChange([{ op: 'set', col: 'bulletins', id: 't13-bulten', data: { kind: 'duyuru', title: 'Dev bülteni', body: 'x', storeIds: null, rows: [], people: [], expiresAt: null, published: true, pinned: false, createdAt: Date.now(), createdBy: dev.s.uid, createdByName: author } }], { kind: 'bulletin', title: 'x', summary: 'x' });
  const rg = await dev.m('api/regrade.ts');
  const q = CUR.questions.find((x) => x.moduleId === 'sube-duzeni');
  await rg.disableAndRegrade({ ...q }, 'dev testi', { name: dev.s.name });
  const pc = await dev.backend.createBarista({ name: 'Dev Ekledi', storeId: 'pendik', role: 'barista', createdByName: author });
  const bq = (await adb.collection('boardQuestions').limit(1).get()).docs[0];
  let bqName = 'kurul sorusu yok';
  if (bq) { const bd = await dev.m('api/board.ts'); await bd.replyBoardQuestion({ id: bq.id, ...bq.data() }, 'ops', 'dev yanıt', { uid: dev.s.uid, name: dev.s.name }); bqName = (await adb.doc(`boardQuestions/${bq.id}`).get()).get('messages').slice(-1)[0].byName; }
  // Öneri onayı (reviewedByName) ve görev (createdByName)
  const ops = await staffC('ops', 0, 't13ops');
  const chO = await ops.m('api/changes.ts');
  await chO.commitChange([{ op: 'update', col: 'lessons', id: CUR.lessons[5].id, data: { summary: 'ops önerisi t13' } }], { kind: 'lesson', title: 't13', summary: 'x' });
  const pid = chO.lastProposalId;
  await ch.approveProposal({ id: pid, ...(await adb.doc(`proposals/${pid}`).get()).data() }, true);
  const name = dev.s.name;
  const hits = JSON.stringify([afterNote, (await adb.doc('bulletins/t13-bulten').get()).data(), (await adb.doc(`questions/${q.id}`).get()).data(), (await adb.doc(`baristas/${pc.baristaId}`).get()).data(), (await adb.doc(`proposals/${pid}`).get()).data()]).includes(name);
  log('T13', { gorulduYazildi: afterSeen.status !== 'open' || (afterSeen.notes || []).length > 0, yanitByName: afterNote.notes.slice(-1)[0].byName, bultenCreatedByName: (await adb.doc('bulletins/t13-bulten').get()).get('createdByName'), disabledByName: (await adb.doc(`questions/${q.id}`).get()).get('disabledByName'), codeIssuedByName: (await adb.doc(`baristas/${pc.baristaId}`).get()).get('codeIssuedByName'), kurulYanitByName: bqName, reviewedByName: (await adb.doc(`proposals/${pid}`).get()).get('reviewedByName'), adKayitlardaGeciyor: hits });
}

// ---- T14: mini sınav rozetleri (A2) + geçersiz görevler (A15) — uygulamanın saf işlevleriyle
if (run('T14')) {
  const B = await import('../../src/lib/badges.ts?c=t14');
  const TV = await import('../../src/lib/taskValidity.ts?c=t14');
  const now = Date.now();
  const modules = CUR.modules, lessons = CUR.lessons, tracks = CUR.tracks;
  const four = ['italyan-klasikler', 'sicak-kahveler', 'aromali-latteler', 'demleme-turk'];
  const base = (mid, i) => ({ id: `a${i}`, baristaId: 'x', storeId: 's', moduleId: mid, lessonId: null, passScore: 80, startedAt: now - (10 - i) * 86400000, submittedAt: now - (10 - i) * 86400000 + 60000, total: 10, correct: 8, score: 80, passed: true, questionIds: [], answers: {} });
  const atts = four.map(base);
  const progress = { baristaId: 'x', storeId: 's', lessons: {}, modules: Object.fromEntries(four.map((m) => [m, { score: 80, passedAt: now - 5 * 86400000 }])), updatedAt: now };
  const minis = four.map((m, i) => ({ ...base(m, 20 + i), id: `q${i}`, lessonId: lessons.find((l) => l.moduleId === m).id, total: 3, correct: 3, score: 100, passScore: 67, startedAt: now - 3600000 * (4 - i), submittedAt: now - 3600000 * (4 - i) + 30000 }));
  const ctx = { tracks, modules, lessons, progress, assignments: [], startedAt: '2025-01-01', now };
  const r1 = B.badgeReport({ ...ctx, attempts: atts });
  const r2 = B.badgeReport({ ...ctx, attempts: [...atts, ...minis] });
  const pick = (r) => { const o = {}; for (const id of ['usta-espresso', 'tam-puan', 'seri', 'ilk-seferde']) { const x = (r.badges || r.items || []).find?.((b) => b.id === id || b.def?.id === id); o[id] = x ? (x.earned ?? x.status?.earned) : '?'; } o.avg = r.avg ?? r.average ?? r.avgScore; return o; };
  // Görev geçerliliği
  const bar = [{ id: 'b1', storeId: 's1', active: true }, { id: 'b2', storeId: 's2', active: false }];
  const g = (o) => ({ id: 'g', kind: 'lesson', targetId: lessons[0].id, storeId: 's1', baristaId: null, dueAt: now - 86400000, createdAt: now - 2 * 86400000, title: 'x', ...o });
  const tv = {
    bosMagaza: TV.taskInvalidReason(g({ storeId: 's9' }), { modules, lessons, tracks, baristas: bar }),
    ayrilanBarista: TV.taskInvalidReason(g({ storeId: 's2', baristaId: 'b2' }), { modules, lessons, tracks, baristas: bar }),
    tasinanBarista: TV.taskInvalidReason(g({ storeId: 's2', baristaId: 'b1' }), { modules, lessons, tracks, baristas: bar }),
    silinmisDers: TV.taskInvalidReason(g({ targetId: 'yok-boyle-ders' }), { modules, lessons, tracks, baristas: bar }),
    silinmisModul: TV.taskInvalidReason(g({ kind: 'module', targetId: 'yok-modul' }), { modules, lessons, tracks, baristas: bar }),
    gecerli: TV.taskInvalidReason(g({}), { modules, lessons, tracks, baristas: bar })
  };
  // Sözünün Eri: 5 zamanında görev + silinmiş derse bağlı gecikmiş görev
  const lessonDone = Object.fromEntries(lessons.slice(0, 5).map((l) => [l.id, now - 3 * 86400000]));
  const tasks = lessons.slice(0, 5).map((l, i) => g({ id: `t${i}`, targetId: l.id, dueAt: now - 86400000, createdAt: now - 5 * 86400000 }));
  const sozCtx = { ...ctx, progress: { ...progress, lessons: lessonDone }, attempts: atts, startedAt: '2025-01-01' };
  const soz = (asg) => { const r = B.badgeReport({ ...sozCtx, assignments: asg }); const x = (r.badges || r.items || []).find?.((b) => b.id === 'gorev-adami' || b.def?.id === 'gorev-adami'); return x ? (x.earned ?? x.status?.earned) : '?'; };
  log('T14', { miniOncesi: pick(r1), miniSonrasi: pick(r2), raporAnahtarlari: Object.keys(r1), gorevGecerlilik: tv, sozununEri: { bes: soz(tasks), besArtiSilinmisDersGecikmis: soz([...tasks, g({ id: 'tx', targetId: 'silinmis-ders', dueAt: now - 86400000, createdAt: now - 4 * 86400000 })]), besArtiGecerliGecikmis: soz([...tasks, g({ id: 'ty', targetId: lessons[7].id, dueAt: now - 86400000, createdAt: now - 4 * 86400000 })]) } });
}

writeFileSync(new URL(`./out/odak${only ? '-' + [...only].join('_') : ''}.json`, import.meta.url), JSON.stringify(R, null, 1));
process.exit(0);
