/**
 * Son 6 günün geçmişini emülatöre yazar (yayından sonraki ilk hafta gibi):
 * PIN'li her barista günde ~1 sınav, ~2 ders. Puan, yanlışlar ve ilerleme
 * uygulamanın submitExam mantığıyla aynı biçimde hesaplanır.
 */
import { readFileSync } from 'node:fs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-guvenlik' });
const db = getFirestore();
const H = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url), 'utf8'));
const cur = JSON.parse(readFileSync(new URL('../../../../src/generated/curriculum.json', import.meta.url), 'utf8'));
let seed = 77;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const DAY = 86400000;
const qByMod = new Map();
cur.questions.forEach((q) => (qByMod.get(q.moduleId) ?? qByMod.set(q.moduleId, []).get(q.moduleId)).push(q));
const lessonsByMod = new Map();
cur.lessons.filter((l) => l.published !== false).sort((a, b) => a.order - b.order).forEach((l) => (lessonsByMod.get(l.moduleId) ?? lessonsByMod.set(l.moduleId, []).get(l.moduleId)).push(l));
const mods = cur.modules.filter((m) => m.published);
const startable = (prog, m) => !m.prerequisiteId || prog.modules[m.prerequisiteId];

let writes = 0;
let batch = db.batch();
let inBatch = 0;
const put = async (ref, data, merge) => {
  merge ? batch.set(ref, data, { merge: true }) : batch.set(ref, data);
  inBatch++; writes++;
  if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
};
let attempts = 0;
for (const b of H.baristas.filter((x) => x.pin)) {
  const prog = { lessons: {}, modules: {} };
  for (let d = 6; d >= 1; d--) {
    const dayStart = Date.now() - d * DAY + 9 * 3600000 * rnd();
    // ~2 ders
    const avail = mods.filter((m) => startable(prog, m));
    const m = avail[Math.floor(rnd() * Math.min(avail.length, 4))];
    const todo = (lessonsByMod.get(m.id) || []).filter((l) => !prog.lessons[l.id]).slice(0, 2);
    todo.forEach((l, i) => (prog.lessons[l.id] = Math.round(dayStart + i * 300000)));
    if (rnd() < 0.15) continue; // bugün sınav yok
    const pool = (qByMod.get(m.id) || []).filter((q) => !q.disabled);
    if (!pool.length) continue;
    const size = Math.min(m.examSize || 10, pool.length);
    const picked = [...pool].sort(() => rnd() - 0.5).slice(0, size);
    const startedAt = Math.round(dayStart + 900000);
    const answers = {};
    const orders = {};
    let correct = 0;
    const mistakes = [];
    for (const q of picked) {
      orders[q.id] = q.options.map((_, i) => i);
      const right = rnd() < b.skill;
      const pick = right ? q.answer : (q.answer + 1 + Math.floor(rnd() * (q.options.length - 1))) % q.options.length;
      answers[q.id] = pick;
      if (pick === q.answer) correct++;
      else mistakes.push({ questionId: q.id, prompt: q.prompt, options: q.options, given: pick, answer: q.answer, explanation: q.explanation || '' });
    }
    const score = Math.round((correct / picked.length) * 100);
    const passed = score >= m.passScore;
    const submittedAt = startedAt + picked.length * 40000;
    await put(db.collection('attempts').doc(), {
      baristaId: b.id, baristaName: b.name, storeId: b.storeId, moduleId: m.id, moduleTitle: m.title, passScore: m.passScore,
      lessonId: null, startedAt, deadline: startedAt + picked.length * 90000, total: picked.length,
      questionIds: picked.map((q) => q.id), orders, answers, submittedAt, correct, score, passed, mistakes, timedOut: false, gecmis: true
    });
    attempts++;
    if (passed && (!prog.modules[m.id] || prog.modules[m.id].score < score)) prog.modules[m.id] = { score, passedAt: prog.modules[m.id]?.passedAt || submittedAt };
  }
  await put(db.doc(`progress/${b.id}`), { lessons: prog.lessons, modules: prog.modules, updatedAt: Date.now() - DAY }, true);
}
await batch.commit();
console.log('geçmiş sınav', attempts, 'yazım', writes);
process.exit(0);
