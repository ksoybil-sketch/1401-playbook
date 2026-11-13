/**
 * Sınav akışı.
 *
 * Eski sürümde cevap anahtarı yalnızca bellekte (bir Map içinde) tutuluyordu.
 * Uygulama kapanınca — mağaza telefonunda arka plandaki uygulamanın Android
 * tarafından öldürülmesi sıradan bir olay — anahtar gidiyor, deneme hiç
 * puanlanamıyor ama haftalık hakkı yiyordu; raporlarda görünmüyor, yalnızca
 * admin silebiliyordu.
 *
 * Şimdi denemenin kendisi her şeyi taşıyor: hangi sorular soruldu
 * (questionIds), şıklar hangi sırayla gösterildi (orders), şimdiye kadar ne
 * işaretlendi (answers) ve son teslim anı (deadline). Böylece:
 *  - uygulama kapanıp açılsa da, başka telefondan da sınava devam edilir;
 *  - süre dolmuşsa deneme, o ana kadarki cevaplarla otomatik puanlanır;
 *  - hiçbir deneme "havada" kalmaz, hepsi raporda görünür.
 *
 * Süre: soru başına 1,5 dakika (SECONDS_PER_QUESTION).
 */
import {
  collection, doc, documentId, getDoc, getDocs, query, runTransaction, updateDoc, where, addDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { AppError } from './backend';
import type { Attempt, AttemptReviewItem, ExamQuestion, Lesson, Module, Progress, Question } from '../../shared/types';
import { MAX_EXAMS_PER_WEEK } from '../../shared/types';

export const SECONDS_PER_QUESTION = 90;
const DAY_MS = 86400000;
/** Süre bilgisi olmayan eski denemeler bu kadar bekledikten sonra kapatılır. */
const LEGACY_GRACE_MS = 2 * 60 * 60 * 1000;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Soru seçimi: tür dengeli.
 *
 * Soruların türü var (ölçü, porsiyon, adım, malzeme, teknik, kavram…).
 * Rastgele seçimde havuzun büyük kısmı ölçü sorusu olduğu için sınav da
 * ölçü sorusuna boğuluyordu. Türler ayrı kümelere ayrılıp sırayla birer
 * soru çekiliyor: 9 soruluk sınavda 5 tür varsa her türden 1-2 soru gelir.
 *
 * Daha önce yanlış yapılan sorular öne alınır ama sınavın en çok üçte birini
 * kaplar — sınırsız bırakılırsa barista konuyu değil o soruları öğrenir.
 */
/**
 * seenAt: soru → baristanın o soruyu en son gördüğü an. Görmediği sorular
 * önce gelir; hepsini gördüyse en uzun süredir görmedikleri. Yalnızca
 * rastgele seçmek, art arda girilen sınavlarda aynı soruları getiriyordu.
 */
export function pickQuestions<T extends { id: string; kind?: string; prompt?: string }>(
  pool: T[], size: number, missed: Set<string>, seenAt: Map<string, number> = new Map()
): T[] {
  // Aynı metinli iki soru (farklı kayıtlar) aynı sınava girmesin.
  const keyOf = (q: T) => (q.prompt || q.id).toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  const usedKeys = new Set<string>();
  const fromMissed = Math.min(Math.floor(size / 3), pool.filter((q) => missed.has(q.id)).length);
  const missedPick: T[] = [];
  for (const q of shuffle(pool.filter((x) => missed.has(x.id)))) {
    if (missedPick.length >= fromMissed) break;
    if (usedKeys.has(keyOf(q))) continue;
    usedKeys.add(keyOf(q));
    missedPick.push(q);
  }
  const taken = new Set(missedPick.map((q) => q.id));

  // İki geçiş: önce görülmemiş sorular türler arasında dengeli dağıtılır;
  // onlar bitince görülmüşler, en uzun süredir görülmeyenden başlayarak.
  const want = size - missedPick.length;
  const fresh: T[] = [];
  const roundRobin = (items: T[]) => {
    const groups = new Map<string, T[]>();
    for (const q of items) (groups.get(q.kind || 'genel') ?? groups.set(q.kind || 'genel', []).get(q.kind || 'genel')!).push(q);
    const order = shuffle([...groups.keys()]);
    while (fresh.length < want && order.some((k) => groups.get(k)!.length)) {
      for (const k of order) {
        const g = groups.get(k)!;
        while (g.length && usedKeys.has(keyOf(g[0]))) g.shift();
        if (g.length && fresh.length < want) { const q = g.shift()!; usedKeys.add(keyOf(q)); fresh.push(q); }
      }
    }
  };
  const rest = shuffle(pool.filter((x) => !taken.has(x.id)));
  roundRobin(rest.filter((q) => !seenAt.has(q.id)));
  // Karıştırılmış sıra korunur (sort kararlı); yalnız görülme zamanına göre dizilir.
  roundRobin(rest.filter((q) => seenAt.has(q.id)).sort((x, y) => seenAt.get(x.id)! - seenAt.get(y.id)!));
  return shuffle([...missedPick, ...fresh]);
}

async function loadQuestions(ids: string[]): Promise<Map<string, Question>> {
  const out = new Map<string, Question>();
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, 'questions'), where(documentId(), 'in', chunk)));
    snap.docs.forEach((d) => out.set(d.id, { id: d.id, ...d.data() } as Question));
  }
  return out;
}

function toExamQuestions(ids: string[], orders: Record<string, number[]>, qs: Map<string, Question>): ExamQuestion[] {
  return ids
    .filter((id) => qs.has(id))
    .map((id) => {
      const q = qs.get(id)!;
      const order = orders[id] || q.options.map((_, i) => i);
      return { id, type: q.type, prompt: q.prompt, imageUrl: q.imageUrl || undefined, options: order.map((i) => q.options[i]) };
    });
}

export interface ExamSession {
  attemptId: string;
  passScore: number;
  questions: ExamQuestion[];
  answers: Record<string, number>;
  deadline: number;
  resumed: boolean;
}

/** Bu modülde süresi dolmamış, açık bir deneme var mı? */
export async function findActiveAttempt(baristaId: string, moduleId?: string, lessonId?: string | null): Promise<Attempt | null> {
  const snap = await getDocs(query(
    collection(db, 'attempts'),
    where('baristaId', '==', baristaId),
    where('submittedAt', '==', null)
  ));
  const now = Date.now();
  const open = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Attempt))
    .filter((a) => (!moduleId || (a.moduleId === moduleId && (a.lessonId || null) === (lessonId || null))) && a.deadline && a.deadline > now);
  return open[0] || null;
}

/**
 * Haftalık deneme hakkı — MODÜL BAŞINA. Önceden tüm sınavlar toplam 3
 * hakkı paylaşıyordu: üç farklı modülün sınavına giren barista dördüncü
 * modülü bir hafta bekliyordu. Demo ve emülatörde sınav denemek serbest.
 */
const TEST_ENV = import.meta.env.VITE_DEMO === 'true' || import.meta.env.MODE === 'emulator';
export const EXAMS_PER_WEEK = TEST_ENV ? 20 : MAX_EXAMS_PER_WEEK;

/** Mini sınav (Yeni ürün akışı): 3 sorudan 2'si. */
export const QUIZ_PASS = 67;

export async function startExam(mod: Module, who: { baristaId: string; storeId: string; name: string }, lesson?: Lesson | null): Promise<ExamSession> {
  // Önce süresi geçmiş açık denemeleri kapat; sonra bu modülde devam eden
  // bir deneme varsa yeni hak harcatmadan ona geri dön.
  // Sınav sunucuda puanlanır ve soru seçimi geçmişe bakar: internetsiz
  // başlatılırsa önbellekteki boş soru listesi "soru yok" gibi görünüyordu.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AppError('Sınava girmek için internet bağlantısı gerekiyor. Bağlantı gelince yeniden dene.');
  }
  await finalizeExpired(who.baristaId);
  const quiz = lesson?.id || null;
  const active = await findActiveAttempt(who.baristaId, mod.id, quiz);
  if (active) return resumeExam(active);

  const pSnap = await getDoc(doc(db, 'progress', who.baristaId));
  const progress = (pSnap.data() as Progress | undefined) || { modules: {} as Progress['modules'] };
  if (!quiz && mod.prerequisiteId && !progress.modules?.[mod.prerequisiteId]) {
    throw new AppError('Bu sınav kilitli. Önce önceki modülü geçmelisin.');
  }
  const since = Date.now() - 7 * DAY_MS;
  const recentSnap = await getDocs(query(collection(db, 'attempts'), where('baristaId', '==', who.baristaId), where('startedAt', '>=', since)));
  const recent = recentSnap.docs.map((d) => d.data() as Attempt).filter((a) => !a.voided && a.moduleId === mod.id && (a.lessonId || null) === quiz);
  if (recent.length >= EXAMS_PER_WEEK) {
    const oldest = Math.min(...recent.map((a) => a.startedAt));
    throw new AppError('weekly-limit', 'weekly-limit', { nextAt: oldest + 7 * DAY_MS });
  }
  const qSnap = await getDocs(quiz
    ? query(collection(db, 'questions'), where('moduleId', '==', mod.id), where('lessonId', '==', quiz))
    : query(collection(db, 'questions'), where('moduleId', '==', mod.id)));
  if (qSnap.empty && qSnap.metadata.fromCache) throw new AppError('Sınava girmek için internet bağlantısı gerekiyor. Bağlantı gelince yeniden dene.');
  if (qSnap.empty) throw new AppError(quiz ? 'Bu reçetenin mini sınavı yok.' : 'Bu modülde henüz soru yok.');

  const missed = new Set<string>();
  recent.forEach((a) => (a.mistakes || []).forEach((m) => missed.add(m.questionId)));

  // Bu modülde daha önce görülen sorular (tüm zamanlar).
  const seenAt = new Map<string, number>();
  const pastSnap = await getDocs(query(collection(db, 'attempts'), where('baristaId', '==', who.baristaId), where('moduleId', '==', mod.id))).catch(() => null);
  pastSnap?.docs.forEach((d) => {
    const a = d.data() as Attempt;
    (a.questionIds || []).forEach((id) => seenAt.set(id, Math.max(seenAt.get(id) || 0, a.startedAt)));
    (a.mistakes || []).forEach((m) => seenAt.set(m.questionId, Math.max(seenAt.get(m.questionId) || 0, a.startedAt)));
  });

  // İptal edilen (Soru havuzundan kaldırılan) sorular sınava gelmez.
  const pool = qSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Question)).filter((q) => !q.disabled);
  const size = quiz ? pool.length : Math.min(mod.examSize || 10, pool.length);
  const passScore = quiz ? QUIZ_PASS : mod.passScore;
  const picked = pickQuestions(pool, size, missed, seenAt);

  const orders: Record<string, number[]> = {};
  picked.forEach((q) => {
    const idx = q.options.map((_, i) => i);
    orders[q.id] = q.type === 'truefalse' ? idx : shuffle(idx);
  });

  const startedAt = Date.now();
  const deadline = startedAt + picked.length * SECONDS_PER_QUESTION * 1000;
  const ref = await addDoc(collection(db, 'attempts'), {
    baristaId: who.baristaId, baristaName: who.name, storeId: who.storeId,
    moduleId: mod.id, moduleTitle: quiz ? `${lesson!.title} · mini sınav` : mod.title, passScore, lessonId: quiz,
    startedAt, deadline, total: picked.length,
    questionIds: picked.map((q) => q.id), orders, answers: {},
    // Kural "submittedAt == null" ile bitmemiş denemeyi ayırt eder.
    submittedAt: null
  });

  const qs = new Map(picked.map((q) => [q.id, q]));
  return {
    attemptId: ref.id, passScore, deadline, resumed: false, answers: {},
    questions: toExamQuestions(picked.map((q) => q.id), orders, qs)
  };
}

async function resumeExam(a: Attempt): Promise<ExamSession> {
  const ids = a.questionIds || [];
  const qs = await loadQuestions(ids);
  return {
    attemptId: a.id, passScore: a.passScore ?? 80, deadline: a.deadline!, resumed: true,
    answers: a.answers || {}, questions: toExamQuestions(ids, a.orders || {}, qs)
  };
}

/** Her işaretlemede çağrılır: cevaplar denemeye yazılır, uygulama kapanırsa kaybolmaz. */
export async function saveAnswers(attemptId: string, answers: Record<string, number>): Promise<void> {
  await updateDoc(doc(db, 'attempts', attemptId), { answers }).catch(() => {});
}

export interface ExamResult {
  score: number; correct: number; total: number; passed: boolean; passScore: number;
  mistakes: AttemptReviewItem[]; timedOut: boolean;
}

/**
 * Denemeyi puanlar. Cevap anahtarı denemeden ve soru bankasından yeniden
 * kurulur; bellekte hiçbir şeye ihtiyaç yok.
 */
export async function submitExam(attemptId: string, answers?: Record<string, number>, opts: { timedOut?: boolean } = {}): Promise<ExamResult> {
  const aSnap = await getDoc(doc(db, 'attempts', attemptId));
  if (!aSnap.exists()) throw new AppError('Sınav kaydı bulunamadı.');
  const a = { id: aSnap.id, ...aSnap.data() } as Attempt;
  if (a.submittedAt) {
    return {
      score: a.score ?? 0, correct: a.correct ?? 0, total: a.total, passed: !!a.passed,
      passScore: a.passScore ?? 80, mistakes: a.mistakes || [], timedOut: !!a.timedOut
    };
  }
  const ids = a.questionIds || [];
  const qs = await loadQuestions(ids);
  const given = answers ?? a.answers ?? {};
  const orders = a.orders || {};

  let correct = 0;
  const mistakes: AttemptReviewItem[] = [];
  for (const id of ids) {
    const q = qs.get(id);
    if (!q) continue; // soru bankadan silinmişse sayılmaz
    const order = orders[id] || q.options.map((_, i) => i);
    const shown = given[id];
    const pick = Number.isInteger(shown) && order[shown] !== undefined ? order[shown] : null;
    if (pick === q.answer) correct++;
    else mistakes.push({ questionId: id, prompt: q.prompt, options: q.options, given: pick, answer: q.answer, explanation: q.explanation || '' });
  }
  const total = ids.filter((id) => qs.has(id)).length;
  const passScore = a.passScore ?? 80;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const passed = score >= passScore;
  const now = Date.now();
  const timedOut = !!opts.timedOut;

  await updateDoc(doc(db, 'attempts', attemptId), {
    submittedAt: now, correct, score, passed, mistakes, answers: given, timedOut
  });

  if (passed) {
    const pRef = doc(db, 'progress', a.baristaId);
    // Mini sınav modül geçişi sayılmaz; ayrı alanda tutulur.
    const field = a.lessonId ? 'quizzes' : 'modules';
    const key = a.lessonId || a.moduleId;
    await runTransaction(db, async (tx) => {
      const p = await tx.get(pRef);
      const prev = ((p.data() as Progress | undefined)?.[field] as Progress['modules'] | undefined)?.[key];
      if (!prev || prev.score < score) {
        tx.update(pRef, { [`${field}.${key}`]: { score, passedAt: prev?.passedAt || now }, updatedAt: now });
      }
    });
  }
  return { score, correct, total, passed, passScore, mistakes, timedOut };
}

/**
 * Süresi geçmiş açık denemeleri, o ana kadarki cevaplarla kapatır.
 * Barista oturum açtığında ve sınav ekranı açıldığında çalışır.
 *
 * Eski sürümden kalan (soru sırası kaydedilmemiş) açık denemeler
 * puanlanamaz; bunlar "geçersiz" işaretlenir ve haftalık haktan düşmez —
 * baristanın suçu olmayan bir hata yüzünden hak kaybetmemesi için.
 */
export async function finalizeExpired(baristaId: string): Promise<number> {
  const snap = await getDocs(query(
    collection(db, 'attempts'),
    where('baristaId', '==', baristaId),
    where('submittedAt', '==', null)
  )).catch(() => null);
  if (!snap) return 0;
  const now = Date.now();
  let closed = 0;
  for (const d of snap.docs) {
    const a = { id: d.id, ...d.data() } as Attempt;
    if (a.deadline && a.orders) {
      if (a.deadline <= now) {
        await submitExam(a.id, undefined, { timedOut: true }).catch(() => {});
        closed++;
      }
    } else if (now - a.startedAt > LEGACY_GRACE_MS) {
      await updateDoc(doc(db, 'attempts', a.id), { submittedAt: now, voided: true }).catch(() => {});
      closed++;
    }
  }
  return closed;
}
