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
  collection, doc, documentId, getDoc, getDocs, query, updateDoc, where, addDoc, writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { stopwatch } from '../lib/perf';
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

/**
 * Hız: sınavı başlatmak için gereken okumalar.
 *
 * Eskiden "Başla"ya basınca yedi okuma art arda yapılıyordu (açık denemeler
 * iki kez, ilerleme, son hafta, soru havuzu, geçmiş denemeler, sonra kayıt).
 * Yavaş bağlantıda her biri ayrı bir gidiş-dönüş demekti. Şimdi:
 *  - okumalar dörde indi ve aynı anda yapılır (Promise.all);
 *  - sınav ekranı açılır açılmaz başlar, barista "Başla"ya basana kadar
 *    çoğu zaman bitmiş olur; "Başla" yalnızca denemeyi kaydeder.
 * Hazırlık en çok PREP_TTL_MS kadar kullanılır; sonra yeniden okunur.
 */
interface ExamPrep {
  /** Baristanın tüm açık (teslim edilmemiş) denemeleri — tüm modüller. */
  open: Attempt[];
  /** Bu modüldeki tüm denemeleri: haftalık hak ve daha önce görülen sorular. */
  moduleAttempts: Attempt[];
  /** Sınavın soru havuzu (iptal edilenler dahil; seçimde ayıklanır). */
  pool: Question[];
  poolFromCache: boolean;
  progress: Progress | null;
}

const PREP_TTL_MS = 60_000;
let prep: { key: string; at: number; p: Promise<ExamPrep> } | null = null;
const prepKey = (baristaId: string, moduleId: string, lessonId: string | null) => `${baristaId}|${moduleId}|${lessonId || ''}`;
const prepFresh = (key: string) => !!prep && prep.key === key && Date.now() - prep.at < PREP_TTL_MS;
const tick = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const openAttemptsQuery = (baristaId: string) => query(
  collection(db, 'attempts'),
  where('baristaId', '==', baristaId),
  where('submittedAt', '==', null)
);
const asAttempt = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) } as Attempt);

export function prepareExam(mod: Module, baristaId: string, lessonId?: string | null): Promise<ExamPrep> {
  const quiz = lessonId || null;
  const key = prepKey(baristaId, mod.id, quiz);
  if (prepFresh(key)) return prep!.p;
  const sw = stopwatch('Sınav hazırlığı', { modül: mod.id, mini: !!quiz });
  const t0 = tick();
  // Her okumanın bitiş anı (başlangıçtan ms): hangisi en geç geldi?
  const timed = <T>(name: string, p: Promise<T>) => p.then((v) => { sw.note(name, Math.round(tick() - t0)); return v; });
  const p = Promise.all([
    timed('açık denemeler', getDocs(openAttemptsQuery(baristaId))),
    timed('modül denemeleri', getDocs(query(collection(db, 'attempts'), where('baristaId', '==', baristaId), where('moduleId', '==', mod.id)))),
    timed('soru havuzu', getDocs(quiz
      ? query(collection(db, 'questions'), where('moduleId', '==', mod.id), where('lessonId', '==', quiz))
      : query(collection(db, 'questions'), where('moduleId', '==', mod.id)))),
    !quiz && mod.prerequisiteId ? timed('ilerleme', getDoc(doc(db, 'progress', baristaId))) : Promise.resolve(null)
  ]).then(([openSnap, modSnap, qSnap, pSnap]) => {
    sw.done({ soru: qSnap.size, önbellekten: qSnap.metadata.fromCache });
    return {
      open: openSnap.docs.map(asAttempt),
      moduleAttempts: modSnap.docs.map(asAttempt),
      pool: qSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Question)),
      poolFromCache: qSnap.metadata.fromCache,
      progress: pSnap ? ((pSnap.data() as Progress | undefined) ?? null) : null
    };
  });
  const entry = { key, at: Date.now(), p };
  prep = entry;
  p.catch(() => { if (prep === entry) prep = null; });
  return p;
}

/** Bu modülde süresi dolmamış, açık deneme. */
export function activeAttemptIn(open: Attempt[], moduleId: string, lessonId?: string | null): Attempt | null {
  const now = Date.now();
  return open.find((a) => a.moduleId === moduleId && (a.lessonId || null) === (lessonId || null) && !!a.deadline && a.deadline > now) || null;
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

const OFFLINE_MSG = 'Sınava girmek için internet bağlantısı gerekiyor. Bağlantı gelince yeniden dene.';

export async function startExam(mod: Module, who: { baristaId: string; storeId: string; name: string }, lesson?: Lesson | null): Promise<ExamSession> {
  // Sınav sunucuda puanlanır ve soru seçimi geçmişe bakar: internetsiz
  // başlatılırsa önbellekteki boş soru listesi "soru yok" gibi görünüyordu.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AppError(OFFLINE_MSG);
  const quiz = lesson?.id || null;
  const sw = stopwatch('Sınav başlatma', { modül: mod.id, mini: !!quiz });
  const ready = prepFresh(prepKey(who.baristaId, mod.id, quiz));
  const data = await prepareExam(mod, who.baristaId, quiz);
  sw.lap(ready ? 'hazırlık (önceden başlamıştı)' : 'hazırlık');
  // Bundan sonra denemeler değişiyor; bir sonraki sınav yeniden okusun.
  prep = null;

  // Süresi geçmiş açık denemeler arka planda kapatılır: haftalık hakka
  // zaten sayılıyorlar, beklemeye gerek yok.
  const now = Date.now();
  const expired = data.open.filter((a) => (a.deadline && a.orders ? a.deadline <= now : now - a.startedAt > LEGACY_GRACE_MS));
  if (expired.length) void closeAttempts(expired);

  // Bu modülde devam eden bir deneme varsa yeni hak harcatmadan ona dön.
  const active = activeAttemptIn(data.open, mod.id, quiz);
  if (active) {
    const s = await resumeExam(active, data.pool);
    sw.lap('devam');
    sw.done({ devam: true });
    return s;
  }

  if (!quiz && mod.prerequisiteId && !data.progress?.modules?.[mod.prerequisiteId]) {
    throw new AppError('Bu sınav kilitli. Önce önceki modülü geçmelisin.');
  }
  const since = now - 7 * DAY_MS;
  const recent = data.moduleAttempts.filter((a) => a.startedAt >= since && !a.voided && (a.lessonId || null) === quiz);
  if (recent.length >= EXAMS_PER_WEEK) {
    const oldest = Math.min(...recent.map((a) => a.startedAt));
    throw new AppError('weekly-limit', 'weekly-limit', { nextAt: oldest + 7 * DAY_MS });
  }
  // İptal edilen (Soru havuzundan kaldırılan) sorular sınava gelmez.
  const pool = data.pool.filter((q) => !q.disabled);
  if (!data.pool.length && data.poolFromCache) throw new AppError(OFFLINE_MSG);
  if (!pool.length) throw new AppError(quiz ? 'Bu reçetenin mini sınavı yok.' : 'Bu modülde henüz soru yok.');

  const missed = new Set<string>();
  recent.forEach((a) => (a.mistakes || []).forEach((m) => missed.add(m.questionId)));
  // Bu modülde daha önce görülen sorular (tüm zamanlar).
  const seenAt = new Map<string, number>();
  data.moduleAttempts.forEach((a) => {
    (a.questionIds || []).forEach((id) => seenAt.set(id, Math.max(seenAt.get(id) || 0, a.startedAt)));
    (a.mistakes || []).forEach((m) => seenAt.set(m.questionId, Math.max(seenAt.get(m.questionId) || 0, a.startedAt)));
  });

  const size = quiz ? pool.length : Math.min(mod.examSize || 10, pool.length);
  const passScore = quiz ? QUIZ_PASS : mod.passScore;
  const picked = pickQuestions(pool, size, missed, seenAt);

  const orders: Record<string, number[]> = {};
  picked.forEach((q) => {
    const idx = q.options.map((_, i) => i);
    orders[q.id] = q.type === 'truefalse' ? idx : shuffle(idx);
  });
  sw.lap('soru seçimi');

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
  sw.lap('deneme kaydı');
  sw.done({ soru: picked.length });

  const qs = new Map(picked.map((q) => [q.id, q]));
  return {
    attemptId: ref.id, passScore, deadline, resumed: false, answers: {},
    questions: toExamQuestions(picked.map((q) => q.id), orders, qs)
  };
}

/** Yarım kalan deneme; sorular eldeki havuzdan, eksikler bankadan. */
async function resumeExam(a: Attempt, known: Question[] = []): Promise<ExamSession> {
  const ids = a.questionIds || [];
  const want = new Set(ids);
  const qs = new Map(known.filter((q) => want.has(q.id)).map((q) => [q.id, q]));
  const missing = ids.filter((id) => !qs.has(id));
  if (missing.length) (await loadQuestions(missing)).forEach((q, id) => qs.set(id, q));
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
 *
 * Hız: sınav ekranı soru kimliklerini ve baristayı bildiğinde (hint) deneme,
 * sorular ve ilerleme aynı anda okunur; puan ve ilerleme tek bir toplu
 * yazımla (writeBatch) kaydedilir. Eskiden dört-beş gidiş-dönüş art arda
 * yapılıyordu (okuma, okuma, yazma, işlem içinde okuma + yazma).
 */
export async function submitExam(
  attemptId: string,
  answers?: Record<string, number>,
  opts: { timedOut?: boolean; questionIds?: string[]; baristaId?: string } = {}
): Promise<ExamResult> {
  const sw = stopwatch('Sınav teslimi', { süreDoldu: !!opts.timedOut });
  const t0 = tick();
  const timed = <T>(name: string, p: Promise<T>) => p.then((v) => { sw.note(name, Math.round(tick() - t0)); return v; });
  const [aSnap, hinted, hintedProgress] = await Promise.all([
    timed('deneme', getDoc(doc(db, 'attempts', attemptId))),
    opts.questionIds?.length ? timed('sorular', loadQuestions(opts.questionIds)) : Promise.resolve(null),
    opts.baristaId ? timed('ilerleme', getDoc(doc(db, 'progress', opts.baristaId))) : Promise.resolve(null)
  ]);
  sw.lap('okuma');
  if (!aSnap.exists()) throw new AppError('Sınav kaydı bulunamadı.');
  const a = { id: aSnap.id, ...aSnap.data() } as Attempt;
  if (a.submittedAt) {
    sw.done({ zatenTeslim: true });
    return {
      score: a.score ?? 0, correct: a.correct ?? 0, total: a.total, passed: !!a.passed,
      passScore: a.passScore ?? 80, mistakes: a.mistakes || [], timedOut: !!a.timedOut
    };
  }
  const ids = a.questionIds || [];
  const qs = hinted ?? new Map<string, Question>();
  const missing = ids.filter((id) => !qs.has(id));
  if (missing.length) {
    (await loadQuestions(missing)).forEach((q, id) => qs.set(id, q));
    sw.lap('eksik sorular');
  }
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

  const batch = writeBatch(db);
  batch.update(doc(db, 'attempts', attemptId), { submittedAt: now, correct, score, passed, mistakes, answers: given, timedOut });
  if (passed) {
    // Mini sınav modül geçişi sayılmaz; ayrı alanda tutulur.
    const pRef = doc(db, 'progress', a.baristaId);
    const field = a.lessonId ? 'quizzes' : 'modules';
    const key = a.lessonId || a.moduleId;
    const pSnap = hintedProgress && a.baristaId === opts.baristaId ? hintedProgress : await getDoc(pRef);
    const prev = ((pSnap.data() as Progress | undefined)?.[field] as Progress['modules'] | undefined)?.[key];
    // Daha yüksek bir puan zaten varsa düşürülmez.
    if (!prev || prev.score < score) batch.update(pRef, { [`${field}.${key}`]: { score, passedAt: prev?.passedAt || now }, updatedAt: now });
  }
  await batch.commit();
  sw.lap('kayıt');
  sw.done({ soru: total, geçti: passed });
  return { score, correct, total, passed, passScore, mistakes, timedOut };
}

/** Süresi geçmiş denemeleri kapatır (bkz. finalizeExpired). */
async function closeAttempts(list: Attempt[]): Promise<number> {
  const now = Date.now();
  let closed = 0;
  for (const a of list) {
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

/**
 * Süresi geçmiş açık denemeleri, o ana kadarki cevaplarla kapatır.
 * Barista oturum açtığında ve sınav başlatılırken çalışır.
 *
 * Eski sürümden kalan (soru sırası kaydedilmemiş) açık denemeler
 * puanlanamaz; bunlar "geçersiz" işaretlenir ve haftalık haktan düşmez —
 * baristanın suçu olmayan bir hata yüzünden hak kaybetmemesi için.
 */
export async function finalizeExpired(baristaId: string): Promise<number> {
  const snap = await getDocs(openAttemptsQuery(baristaId)).catch(() => null);
  if (!snap) return 0;
  return closeAttempts(snap.docs.map(asAttempt));
}
