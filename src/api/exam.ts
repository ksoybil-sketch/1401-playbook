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
 *
 * Okuma kotası (Spark: 50.000/gün): soru havuzu yalnızca "Başla"da okunur
 * (eskiden sınav ekranı açılır açılmaz, 60 sn sonra yeniden okunuyordu);
 * seçilen sorular bellekte tutulur, teslimde yeniden okunmaz (bkz. asked).
 */
import {
  collection, doc, documentId, getDoc, getDocFromServer, getDocs, getDocsFromServer, query, runTransaction, updateDoc, where, writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { stopwatch } from '../lib/perf';
import { AppError } from './backend';
import { useContent } from '../store/content';
import { EMPTY_PROGRESS, isLocked } from '../lib/progress';
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

/**
 * Bu oturumda sorulan soruların cevap anahtarıyla bellekteki kopyası
 * (deneme → soru → soru). Teslimde sorular yeniden okunmaz; uygulama
 * kapanıp açıldıysa (bellek boş) bankadan okunur.
 */
const asked = new Map<string, Map<string, Question>>();

export interface ExamSession {
  attemptId: string;
  passScore: number;
  questions: ExamQuestion[];
  answers: Record<string, number>;
  deadline: number;
  resumed: boolean;
}

const openAttemptsQuery = (baristaId: string) => query(
  collection(db, 'attempts'),
  where('baristaId', '==', baristaId),
  where('submittedAt', '==', null)
);
const asAttempt = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) } as Attempt);
const tick = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Bu modülde süresi dolmamış, açık deneme. */
export function activeAttemptIn(open: Attempt[], moduleId: string, lessonId?: string | null): Attempt | null {
  const now = Date.now();
  return open.find((a) => !a.submittedAt && a.moduleId === moduleId && (a.lessonId || null) === (lessonId || null) && !!a.deadline && a.deadline > now) || null;
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
const VOIDED_MSG = 'Bu sınavın soruları güncellendi; sınav geçersiz sayıldı ve hakkından düşmedi. Yeniden başlayabilirsin.';

/**
 * Sınavı başlatır ya da bu modülde açık deneme varsa ona devam eder.
 *
 * opts.resume: sınav ekranı (baristanın kendi denemeler dinleyicisinden)
 * açık deneme olduğunu biliyor; soru havuzu okunmaz, yalnızca o denemenin
 * soruları okunur.
 *
 * İki cihazdan aynı anda "Başla": deneme kimliği belirlenimcidir
 * (barista_modül_ders_sıra) ve bir işlem (transaction) içinde "yoksa
 * oluştur" ile yazılır. İkinci cihaz aynı kimliği dolu bulur ve o denemeye
 * bağlanır; eskiden iki ayrı deneme açılıp iki hak yeniyordu.
 */
export async function startExam(
  mod: Module, who: { baristaId: string; storeId: string; name: string }, lesson?: Lesson | null, opts: { resume?: boolean } = {}
): Promise<ExamSession> {
  // Sınav sunucuda puanlanır ve soru seçimi geçmişe bakar: internetsiz
  // başlatılırsa önbellekteki boş soru listesi "soru yok" gibi görünüyordu.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AppError(OFFLINE_MSG);
  const quiz = lesson?.id || null;
  const sw = stopwatch('Sınav başlatma', { modül: mod.id, mini: !!quiz });
  const t0 = tick();
  const timed = <T>(name: string, p: Promise<T>) => p.then((v) => { sw.note(name, Math.round(tick() - t0)); return v; });
  const poolQuery = () => getDocs(quiz
    ? query(collection(db, 'questions'), where('moduleId', '==', mod.id), where('lessonId', '==', quiz))
    : query(collection(db, 'questions'), where('moduleId', '==', mod.id)));

  // Okumalar aynı anda yapılır (yavaş bağlantıda her biri ayrı bir gidiş-dönüş).
  const [openSnap, modSnap, pSnap, firstPool] = await Promise.all([
    timed('açık denemeler', getDocs(openAttemptsQuery(who.baristaId))),
    timed('modül denemeleri', getDocs(query(collection(db, 'attempts'), where('baristaId', '==', who.baristaId), where('moduleId', '==', mod.id)))),
    !quiz && mod.prerequisiteId ? timed('ilerleme', getDoc(doc(db, 'progress', who.baristaId))) : Promise.resolve(null),
    opts.resume ? Promise.resolve(null) : timed('soru havuzu', poolQuery())
  ]);
  sw.lap('okuma');
  const open = openSnap.docs.map(asAttempt);
  const moduleAttempts = modSnap.docs.map(asAttempt);

  // Süresi geçmiş açık denemeler arka planda kapatılır: haftalık hakka
  // zaten sayılıyorlar, beklemeye gerek yok.
  const now = Date.now();
  const expired = open.filter((a) => (a.deadline && a.orders ? a.deadline <= now : now - a.startedAt > LEGACY_GRACE_MS));
  if (expired.length) void closeAttempts(expired);

  // Bu modülde devam eden bir deneme varsa yeni hak harcatmadan ona dön.
  const active = activeAttemptIn(open, mod.id, quiz);
  if (active) {
    const s = await resumeExam(active, firstPool ? firstPool.docs.map((d) => ({ id: d.id, ...d.data() } as Question)) : []);
    sw.done({ devam: true });
    return s;
  }

  // Önkoşul modülü silinmiş ya da baristaya görünmüyorsa kilit yok sayılır
  // (bkz. progress.ts isLocked); modül sayfası da aynı kararı verir.
  const content = useContent.getState();
  const progress = { ...EMPTY_PROGRESS, ...((pSnap?.data() as Progress | undefined) ?? {}) };
  if (!quiz && isLocked(mod, progress, { modules: content.modules, tracks: content.tracks })) {
    throw new AppError('Bu sınav kilitli. Önce önceki modülü geçmelisin.');
  }
  const since = now - 7 * DAY_MS;
  const recent = moduleAttempts.filter((a) => a.startedAt >= since && !a.voided && (a.lessonId || null) === quiz);
  if (recent.length >= EXAMS_PER_WEEK) {
    const oldest = Math.min(...recent.map((a) => a.startedAt));
    throw new AppError('weekly-limit', 'weekly-limit', { nextAt: oldest + 7 * DAY_MS });
  }
  // Ekran açık deneme bekliyordu ama yokmuş (bu arada teslim edildi): havuzu şimdi oku.
  const qSnap = firstPool ?? await timed('soru havuzu', poolQuery());
  const all = qSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Question));
  // İptal edilen (Soru havuzundan kaldırılan) sorular sınava gelmez.
  const pool = all.filter((q) => !q.disabled);
  if (!all.length && qSnap.metadata.fromCache) throw new AppError(OFFLINE_MSG);
  if (!pool.length) throw new AppError(quiz ? 'Bu reçetenin mini sınavı yok.' : 'Bu modülde henüz soru yok.');

  const missed = new Set<string>();
  recent.forEach((a) => (a.mistakes || []).forEach((m) => missed.add(m.questionId)));
  // Bu modülde daha önce görülen sorular (tüm zamanlar).
  const seenAt = new Map<string, number>();
  moduleAttempts.forEach((a) => {
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
  const data = {
    baristaId: who.baristaId, baristaName: who.name, storeId: who.storeId,
    moduleId: mod.id, moduleTitle: quiz ? `${lesson!.title} · mini sınav` : mod.title, passScore, lessonId: quiz,
    startedAt, deadline, total: picked.length,
    questionIds: picked.map((q) => q.id), orders, answers: {},
    // Kural "submittedAt == null" ile bitmemiş denemeyi ayırt eder.
    submittedAt: null
  };
  const base = `${who.baristaId}_${mod.id}_${quiz || 'sinav'}`;
  const firstSeq = moduleAttempts.filter((a) => (a.lessonId || null) === quiz).length + 1;
  let outcome: { created: string } | { resume: Attempt };
  try {
    outcome = await runTransaction(db, async (tx) => {
      // Sıra numarası eski (önbellekten) olabilir: dolu ve kapanmış kimlikler atlanır.
      for (let n = firstSeq; n < firstSeq + 15; n++) {
        const ref = doc(db, 'attempts', `${base}_${n}`);
        const snap = await tx.get(ref);
        if (!snap.exists()) { tx.set(ref, data); return { created: ref.id }; }
        const other = asAttempt(snap);
        if (activeAttemptIn([other], mod.id, quiz)) return { resume: other };
      }
      throw new AppError('Sınav başlatılamadı. Tekrar dene.');
    });
  } catch (e) {
    // Bağlantı koptu ya da onay yolda kayboldu: deneme sunucuda açılmış
    // olabilir. Açık deneme varsa ona devam edilir (yeni hak yemez).
    const fresh = await getDocsFromServer(openAttemptsQuery(who.baristaId)).catch(() => null);
    const again = fresh ? activeAttemptIn(fresh.docs.map(asAttempt), mod.id, quiz) : null;
    if (!again) throw e;
    outcome = { resume: again };
  }
  if ('resume' in outcome) {
    const s = await resumeExam(outcome.resume, all);
    sw.done({ devam: true, ikinciCihaz: true });
    return s;
  }
  sw.lap('deneme kaydı');
  sw.done({ soru: picked.length });

  const qs = new Map(picked.map((q) => [q.id, q]));
  asked.set(outcome.created, qs);
  return {
    attemptId: outcome.created, passScore, deadline, resumed: false, answers: {},
    questions: toExamQuestions(picked.map((q) => q.id), orders, qs)
  };
}

/**
 * Yarım kalan deneme; sorular eldeki havuzdan, eksikler bankadan.
 * Bu arada iptal edilen sorular gösterilmez (teslimde kurala göre puanlanır).
 * Hiç soru kalmadıysa (müfredat güncellemesi bütün soruları sildi / hepsi
 * iptal) deneme hak yemeden kapatılır; eskiden ekran çöküyor, teslim
 * edilirse 0 puanla "kaldı" yazılıyordu.
 */
async function resumeExam(a: Attempt, known: Question[] = []): Promise<ExamSession> {
  const ids = a.questionIds || [];
  const want = new Set(ids);
  const qs = new Map(known.filter((q) => want.has(q.id)).map((q) => [q.id, q]));
  const missing = ids.filter((id) => !qs.has(id));
  if (missing.length) (await loadQuestions(missing)).forEach((q, id) => qs.set(id, q));
  asked.set(a.id, qs);
  const voided = new Set(a.voidedQuestions || []);
  const shown = ids.filter((id) => qs.has(id) && !qs.get(id)!.disabled && !voided.has(id));
  if (!shown.length) {
    await updateDoc(doc(db, 'attempts', a.id), { submittedAt: Date.now(), voided: true }).catch(() => {});
    asked.delete(a.id);
    throw new AppError(VOIDED_MSG, 'exam-voided');
  }
  return {
    attemptId: a.id, passScore: a.passScore ?? 80, deadline: a.deadline!, resumed: true,
    answers: a.answers || {}, questions: toExamQuestions(shown, a.orders || {}, qs)
  };
}

/**
 * Cevaplar denemeye yazılır; uygulama kapanırsa kaybolmaz. Sınav ekranı
 * bunu her işaretlemede değil, birkaç cevapta bir ve ekrandan çıkarken
 * çağırır (her yazım açık panellere okuma olarak yansıyor).
 */
export async function saveAnswers(attemptId: string, answers: Record<string, number>): Promise<void> {
  await updateDoc(doc(db, 'attempts', attemptId), { answers }).catch(() => {});
}

export interface ExamResult {
  score: number; correct: number; total: number; passed: boolean; passScore: number;
  mistakes: AttemptReviewItem[]; timedOut: boolean;
}

const resultOf = (a: Attempt): ExamResult => ({
  score: a.score ?? 0, correct: a.correct ?? 0, total: a.total, passed: !!a.passed,
  passScore: a.passScore ?? 80, mistakes: a.mistakes || [], timedOut: !!a.timedOut
});

/**
 * Denemeyi puanlar. Cevap anahtarı bu oturumda sorulan sorulardan (asked)
 * ya da — uygulama kapanıp açıldıysa — soru bankasından kurulur.
 *
 * İptal edilen sorular (Soru havuzunda iptal; deneme açıkken iptal edildiyse
 * voidedQuestions'ta) yeniden puanlamayla aynı kurala uyar: doğru
 * cevaplandıysa doğru sayılır, yanlış/boşsa hesaptan çıkar — kimsenin puanı
 * iptal yüzünden düşmez (bkz. regrade.ts). Bankadan silinen sorular hesaba
 * girmez. `total` puanlanan soru sayısıyla yazılır (eskiden "6/10 doğru ·
 * 100 puan" gibi tutarsız kayıt kalıyordu). Puanlanacak soru kalmadıysa
 * deneme hak yemeden geçersiz sayılır.
 *
 * Puan ve ilerleme tek bir toplu yazımla (writeBatch) kaydedilir.
 */
export async function submitExam(
  attemptId: string,
  answers?: Record<string, number>,
  opts: { timedOut?: boolean; questionIds?: string[]; baristaId?: string } = {}
): Promise<ExamResult> {
  const sw = stopwatch('Sınav teslimi', { süreDoldu: !!opts.timedOut });
  const t0 = tick();
  const timed = <T>(name: string, p: Promise<T>) => p.then((v) => { sw.note(name, Math.round(tick() - t0)); return v; });
  const aRef = doc(db, 'attempts', attemptId);
  const inMemory = asked.get(attemptId);
  const [aSnap, hinted, hintedProgress] = await Promise.all([
    timed('deneme', getDoc(aRef)),
    !inMemory && opts.questionIds?.length ? timed('sorular', loadQuestions(opts.questionIds)) : Promise.resolve(null),
    opts.baristaId ? timed('ilerleme', getDoc(doc(db, 'progress', opts.baristaId))) : Promise.resolve(null)
  ]);
  sw.lap('okuma');
  if (!aSnap.exists()) throw new AppError('Sınav kaydı bulunamadı.');
  const a = { id: aSnap.id, ...aSnap.data() } as Attempt;
  if (a.submittedAt) {
    sw.done({ zatenTeslim: true });
    asked.delete(attemptId);
    if (a.voided) throw new AppError(VOIDED_MSG, 'exam-voided');
    return resultOf(a);
  }
  const ids = a.questionIds || [];
  const qs = new Map(inMemory ?? hinted ?? []);
  const missing = ids.filter((id) => !qs.has(id));
  if (missing.length) {
    (await loadQuestions(missing)).forEach((q, id) => qs.set(id, q));
    sw.lap('eksik sorular');
  }
  const given = answers ?? a.answers ?? {};
  const orders = a.orders || {};
  const voided = new Set(a.voidedQuestions || []);
  qs.forEach((q, id) => { if (q.disabled) voided.add(id); });

  let correct = 0;
  let total = 0;
  const mistakes: AttemptReviewItem[] = [];
  for (const id of ids) {
    const q = qs.get(id);
    if (!q) continue; // soru bankadan silinmişse sayılmaz
    const order = orders[id] || q.options.map((_, i) => i);
    const shown = given[id];
    const pick = Number.isInteger(shown) && order[shown] !== undefined ? order[shown] : null;
    const right = pick === q.answer;
    if (voided.has(id) && !right) continue; // iptal: yanlış/boşsa hesap dışı
    total++;
    if (right) correct++;
    else mistakes.push({ questionId: id, prompt: q.prompt, options: q.options, given: pick, answer: q.answer, explanation: q.explanation || '' });
  }
  const voidedQuestions = ids.filter((id) => voided.has(id));
  const passScore = a.passScore ?? 80;
  const now = Date.now();
  const timedOut = !!opts.timedOut;

  const batch = writeBatch(db);
  if (!total) {
    // Puanlanacak soru kalmadı: hak yemeden kapat.
    batch.update(aRef, { submittedAt: now, voided: true, answers: given, timedOut, ...(voidedQuestions.length ? { voidedQuestions } : {}) });
    await commitOrRecover(batch, aRef);
    asked.delete(attemptId);
    sw.done({ geçersiz: true });
    throw new AppError(VOIDED_MSG, 'exam-voided');
  }
  const score = Math.round((correct / total) * 100);
  const passed = score >= passScore;
  batch.update(aRef, {
    submittedAt: now, correct, total, score, passed, mistakes, answers: given, timedOut,
    ...(voidedQuestions.length ? { voidedQuestions } : {})
  });
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
  const stored = await commitOrRecover(batch, aRef);
  asked.delete(attemptId);
  sw.lap('kayıt');
  sw.done({ soru: total, geçti: passed });
  if (stored) {
    if (stored.voided) throw new AppError(VOIDED_MSG, 'exam-voided');
    return resultOf(stored);
  }
  return { score, correct, total, passed, passScore, mistakes, timedOut };
}

/**
 * Toplu yazımı gönderir. Hata olursa denemeyi sunucudan yeniden okur: yazım
 * sunucuda işlenip onayı yolda kaybolduysa SDK yeniden dener ve kural
 * ("zaten teslim edildi") reddeder — ekranda "yetkin yok" görünüyor, barista
 * yeniden başlayıp bir hak daha yakıyordu. Teslim edilmişse kayıtlı deneme
 * döner (null: yazım başarılı).
 */
async function commitOrRecover(batch: ReturnType<typeof writeBatch>, aRef: ReturnType<typeof doc>): Promise<Attempt | null> {
  try {
    await batch.commit();
    return null;
  } catch (e) {
    const fresh = await getDocFromServer(aRef).catch(() => null);
    const f = fresh?.exists() ? ({ id: fresh.id, ...fresh.data() } as Attempt) : null;
    if (f?.submittedAt) return f;
    throw e;
  }
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
