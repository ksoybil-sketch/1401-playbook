/**
 * Simülasyondan sonra: emülatördeki gerçek veriden "doğru" sayıları hesaplar
 * ve uygulamanın kendi hesap işlevleriyle (src/lib/progress.ts) panelin
 * göreceği sayılarla karşılaştırır; sınav puanlarını yeniden doğrular.
 *   node --experimental-transform-types --no-warnings --import ./lib/kayit.mjs dogrula.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const db = getFirestore();
const P = await import('../../src/lib/progress.ts?c=dogrula');
const TV = await import('../../src/lib/taskValidity.ts?c=dogrula');
const out = {};
const all = async (c) => (await db.collection(c).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const [baristas, progressL, attempts, assignments, stores, modules, lessons, questions, hatalar, requests, bq, props] = await Promise.all(
  ['baristas', 'progress', 'attempts', 'assignments', 'stores', 'modules', 'lessons', 'questions', 'hatalar', 'requests', 'boardQuestions', 'proposals'].map(all));
const progress = Object.fromEntries(progressL.map((p) => [p.id, p]));
const Q = new Map(questions.map((q) => [q.id, q]));
const WEEK = 7 * 86400000;
const now = Date.now();
const EMPTY = P.EMPTY_PROGRESS;
out.sayilar = { baristas: baristas.length, attempts: attempts.length, assignments: assignments.length, requests: requests.length, boardQuestions: bq.length, proposals: props.length, questions: questions.length, hatalar: hatalar.length };

// ---- Panel sayıları: gerçek (tüm sınavlar) vs uygulamanın gördüğü (son 300)
const active = baristas.filter((b) => b.active);
const sorted = [...attempts].sort((a, b) => b.startedAt - a.startedAt);
const top300 = sorted.slice(0, 300);
function panel(atts) {
  // Uygulamanın tanımı (StaffPages OverviewPage): submittedAt >= bugünden 6 gün önceki günün başı, iptal ve mini sınav hariç.
  const d0 = new Date(now - 6 * 86400000); const from7 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
  const week = atts.filter((a) => a.submittedAt && a.submittedAt >= from7 && !a.voided && !a.lessonId);
  const avgScore = week.length ? Math.round(week.reduce((s, a) => s + (a.score || 0), 0) / week.length) : null;
  const missed = new Map();
  atts.filter((a) => a.startedAt > now - 30 * 86400000).forEach((a) => (a.mistakes || []).forEach((m) => missed.set(m.questionId, (missed.get(m.questionId) || 0) + 1)));
  const topMissed = [...missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const perStore = Object.fromEntries(stores.filter((s) => s.active).map((s) => {
    const wk = week.filter((a) => a.storeId === s.id);
    return [s.name, { sinav7g: wk.length, gecti: wk.length ? Math.round((wk.filter((a) => a.passed).length / wk.length) * 100) : null }];
  }));
  return { haftaSinav: week.length, ortPuan: avgScore, topMissed, perStore };
}
const tracks = (await db.collection('tracks').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const avgProgress = active.length ? Math.round(active.reduce((s, b) => s + P.overallPercent(modules, lessons, progress[b.id] || EMPTY, tracks), 0) / active.length) : 0;
let overdue = 0;
let invalidTasks = 0;
for (const a of assignments) {
  if (TV.taskInvalidReason(a, { modules, lessons, tracks, baristas })) { invalidTasks++; continue; }
  const targets = TV.taskTargets(a, baristas);
  for (const b of targets) if (P.isOverdue(a, P.assignmentDone(a, progress[b.id]))) overdue++;
}
const activeStoreIds = new Set(stores.filter((s) => s.active).map((s) => s.id));
out.panel = { aktifBaristaAktifMagaza: active.filter((b) => activeStoreIds.has(b.storeId)).length, aktifBarista: active.length, ortIlerleme: avgProgress, gecikmisGorev: overdue, gecersizGorev: invalidTasks, gercek: panel(attempts), uygulama300: panel(top300) };
out.panel.oldestIn300 = top300.length ? new Date(top300[top300.length - 1].startedAt).toISOString() : null;

// ---- Sınav bütünlüğü
const sub = attempts.filter((a) => a.submittedAt && !a.voided);
const open = attempts.filter((a) => !a.submittedAt);
const rescore = [];
for (const a of sub) {
  if (a.gecmis) continue;
  const ids = (a.questionIds || []).filter((id) => !(a.voidedQuestions || []).includes(id));
  let correct = 0; let total = 0;
  for (const id of ids) {
    const q = Q.get(id);
    if (!q) continue;
    total++;
    const order = a.orders?.[id] || q.options.map((_, i) => i);
    const shown = a.answers?.[id];
    const pick = Number.isInteger(shown) && order[shown] !== undefined ? order[shown] : null;
    if (pick === q.answer) correct++;
  }
  const score = total ? Math.round((correct / total) * 100) : 0;
  const containsDisabled = ids.some((id) => Q.get(id)?.disabled);
  if (score !== a.score || total !== a.total) rescore.push({ id: a.id, baristaId: a.baristaId, moduleId: a.moduleId, stored: { score: a.score, correct: a.correct, total: a.total }, now: { score, correct, total }, containsDisabled, regraded: !!a.regradedAt, missingQ: (a.questionIds || []).filter((id) => !Q.has(id)).length });
}
out.puanFarki = { n: rescore.length, ornek: rescore.slice(0, 12) };
out.devreDisiSoruIcerenTeslimler = sub.filter((a) => !a.gecmis && (a.questionIds || []).some((id) => Q.get(id)?.disabled && !(a.voidedQuestions || []).includes(id))).map((a) => ({ id: a.id, submittedAt: a.submittedAt, score: a.score, regradedAt: a.regradedAt || null }));
out.acikDenemeler = open.map((a) => ({ id: a.id, baristaId: a.baristaId, moduleId: a.moduleId, deadline: a.deadline, gecmisMi: a.deadline < now }));
out.sifirSoruluDenemeler = sub.filter((a) => a.total === 0).map((a) => ({ id: a.id, moduleId: a.moduleId, score: a.score, passed: a.passed, timedOut: a.timedOut }));
out.eksikSoruluDenemeler = sub.filter((a) => !a.gecmis && (a.questionIds || []).length > a.total && !(a.voidedQuestions || []).length).map((a) => ({ id: a.id, moduleId: a.moduleId, sorulan: a.questionIds.length, total: a.total, score: a.score }));
// Aynı barista + modülde 10 sn içinde iki deneme (iki cihaz)
const dup = [];
const byBM = new Map();
attempts.forEach((a) => { const k = `${a.baristaId}|${a.moduleId}|${a.lessonId || ''}`; (byBM.get(k) ?? byBM.set(k, []).get(k)).push(a); });
for (const [k, xs] of byBM) { xs.sort((a, b) => a.startedAt - b.startedAt); for (let i = 1; i < xs.length; i++) if (xs[i].startedAt - xs[i - 1].startedAt < 10000) dup.push({ k, a: xs[i - 1].id, b: xs[i].id, dt: xs[i].startedAt - xs[i - 1].startedAt, s1: xs[i - 1].score, s2: xs[i].score }); }
out.ikizDenemeler = dup;
// Haftalık hak aşımı (canlı: 3)
const over = [];
for (const [k, xs] of byBM) { const wk = xs.filter((a) => a.startedAt >= now - WEEK && !a.voided && !a.lessonId); if (wk.length > 3) over.push({ k, n: wk.length }); }
out.haftalikHakAsimi = over;

// ---- Yeniden puanlama doğrulaması
if (existsSync(new URL('./out/regrade-oncesi.json', import.meta.url))) {
  const before = JSON.parse(readFileSync(new URL('./out/regrade-oncesi.json', import.meta.url), 'utf8'));
  const res = { qid: before.qid, inceleme: 0, puanDustu: 0, gectiKaldi: 0, kaldiGecti: 0, progressTutarsiz: [], ornek: [] };
  for (const [id, b] of before.attempts) {
    if (!b.submittedAt || b.voided) continue;
    const a = attempts.find((x) => x.id === id);
    if (!a?.regradedAt) continue;
    res.inceleme++;
    if (a.score < b.score) res.puanDustu++;
    if (b.passed && !a.passed) {
      res.gectiKaldi++;
      const pm = progress[a.baristaId]?.[a.lessonId ? 'quizzes' : 'modules']?.[a.lessonId || a.moduleId];
      const otherPass = attempts.some((x) => x.id !== a.id && x.baristaId === a.baristaId && x.moduleId === a.moduleId && x.passed && x.submittedAt);
      if (pm && !otherPass) res.progressTutarsiz.push({ attempt: id, baristaId: a.baristaId, moduleId: a.moduleId, onceki: b.score, sonra: a.score, passScore: a.passScore, progressScore: pm.score });
    }
    if (!b.passed && a.passed) res.kaldiGecti++;
    if (res.ornek.length < 8 && a.score !== b.score) res.ornek.push({ id, once: `${b.correct}/${b.total}=${b.score}`, sonra: `${a.correct}/${a.total}=${a.score}`, gecti: `${b.passed}→${a.passed}`, yanlisti: (b.mistakes || []).some((m) => m.questionId === before.qid) });
  }
  out.yenidenPuanlama = res;
}
// ---- Tutarlılık: progress.modules ↔ geçilen denemeler
const prog = [];
for (const b of baristas) {
  const p = progress[b.id]; if (!p) { prog.push({ baristaId: b.id, sorun: 'progress yok' }); continue; }
  for (const [mid, r] of Object.entries(p.modules || {})) {
    const best = Math.max(-1, ...attempts.filter((a) => a.baristaId === b.id && a.moduleId === mid && !a.lessonId && a.submittedAt && a.passed).map((a) => a.score));
    if (best < 0) prog.push({ baristaId: b.id, moduleId: mid, sorun: 'modül geçilmiş görünüyor ama geçen deneme yok', progressScore: r.score });
    else if (best !== r.score) prog.push({ baristaId: b.id, moduleId: mid, sorun: 'progress puanı en iyi denemeden farklı', progressScore: r.score, best });
  }
  for (const a of attempts.filter((x) => x.baristaId === b.id && x.passed && x.submittedAt && !x.lessonId)) if (!p.modules?.[a.moduleId]) prog.push({ baristaId: b.id, moduleId: a.moduleId, sorun: 'geçen deneme var, progress yok', attempt: a.id });
}
out.progressTutarsizlik = { n: prog.length, ornek: prog.slice(0, 15), turler: prog.reduce((m, x) => ((m[x.sorun] = (m[x.sorun] || 0) + 1), m), {}) };
out.hatalarKoleksiyonu = hatalar.map((h) => ({ kind: h.kind, message: h.message, path: h.path, role: h.role }));
// ---- Belge boyutları (bant genişliği)
const size = (x) => Buffer.byteLength(JSON.stringify(x));
out.boyut = {
  attemptOrtKB: +(attempts.reduce((s, a) => s + size(a), 0) / attempts.length / 1024).toFixed(2),
  lessonsToplamKB: Math.round(lessons.reduce((s, l) => s + size(l), 0) / 1024),
  progressOrtKB: +(progressL.reduce((s, p) => s + size(p), 0) / progressL.length / 1024).toFixed(2),
  questionsToplamKB: Math.round(questions.reduce((s, q) => s + size(q), 0) / 1024)
};
writeFileSync(new URL('./out/dogrulama.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ sayilar: out.sayilar, panel: { ...out.panel, gercek: { ...out.panel.gercek, perStore: undefined }, uygulama300: { ...out.panel.uygulama300, perStore: undefined } }, puanFarki: out.puanFarki.n, acik: out.acikDenemeler.length, ikiz: dup.length, rp: out.yenidenPuanlama && { ...out.yenidenPuanlama, ornek: undefined }, prog: out.progressTutarsizlik.turler, boyut: out.boyut }, null, 1));
process.exit(0);
