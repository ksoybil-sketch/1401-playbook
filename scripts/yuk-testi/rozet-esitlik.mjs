/** Madde 19: panelin (barista ayrıntısı + önlük listesi: bütün geçmiş) ve baristanın kendi ekranının (son 300 deneme) rozet raporu aynı mı? */
import { writeFileSync } from 'node:fs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-playbook' });
const db = getFirestore();
const B = await import('../../src/lib/badges.ts?c=rozet');
const all = async (c) => (await db.collection(c).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const [baristas, progressL, attempts, assignments, tracks, modules, lessons] = await Promise.all(['baristas', 'progress', 'attempts', 'assignments', 'tracks', 'modules', 'lessons'].map(all));
const cfg = (await db.doc('config/badges').get()).data() || null;
const P = Object.fromEntries(progressL.map((p) => [p.id, p]));
const EMPTY = { lessons: {}, modules: {} };
const diff = [];
let n = 0;
for (const b of baristas.filter((x) => x.active)) {
  n++;
  const mineAll = attempts.filter((a) => a.baristaId === b.id);
  const panelA = mineAll.filter((a) => a.submittedAt && !a.voided);
  const own300 = [...mineAll].sort((x, y) => y.startedAt - x.startedAt).slice(0, 300).filter((a) => a.submittedAt && !a.voided);
  const tasks = assignments.filter((a) => a.storeId === b.storeId && (!a.baristaId || a.baristaId === b.id));
  const base = { tracks, modules, lessons, progress: P[b.id] || EMPTY, assignments: tasks, config: cfg, ...B.fromBarista(b) };
  const r1 = B.badgeReport({ ...base, attempts: panelA });
  const r2 = B.badgeReport({ ...base, attempts: own300 });
  const e1 = r1.badges.filter((x) => x.earned).map((x) => x.id).join(','), e2 = r2.badges.filter((x) => x.earned).map((x) => x.id).join(',');
  if (e1 !== e2 || (r1.qualified?.id || null) !== (r2.qualified?.id || null) || r1.avg !== r2.avg) diff.push({ b: b.id, e1, e2, q1: r1.qualified?.id, q2: r2.qualified?.id });
}
const out = { barista: n, farkli: diff.length, ornek: diff.slice(0, 5), kazanilanToplam: null };
console.log(JSON.stringify(out));
writeFileSync(new URL('./out/rozet-esitlik.json', import.meta.url), JSON.stringify(out, null, 1));
process.exit(0);
