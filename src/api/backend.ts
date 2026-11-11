/**
 * 1401 Campus — Spark (ücretsiz plan) arka ucu.
 *
 * Sunucu kodu (Cloud Functions) olmadan çalışır:
 *  - Hesaplar yöneticinin tarayıcısında, ikinci bir Firebase örneğiyle açılır.
 *  - Her mağaza telefonu ve her barista ayrı bir Firebase Auth hesabıdır.
 *    Barista şifresi PIN'den türetilir; PIN'i Firebase Auth doğrular ve
 *    art arda hatalı denemeleri kendisi yavaşlatır/kilitler.
 *  - Yetkiler users/{uid} belgesinden okunur ve firestore.rules ile
 *    sunucuda zorlanır.
 *  - Sınav telefonda puanlanır (cevap anahtarı telefona iner). Blaze'e
 *    geçince bu kısım blaze/functions'taki sunucu puanlamasına taşınır.
 *
 * Arayüz, blaze/client-calls.ts ile aynı işlevleri sunar; Blaze'e geçişte
 * yalnızca bu dosya ve kurallar değişir.
 */
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updatePassword, sendPasswordResetEmail
} from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where, writeBatch, addDoc
} from 'firebase/firestore';
import { auth, db, secondaryAuth } from './firebase';
import type {
  AttemptReviewItem, Barista, BaristaRole, ExamQuestion, Module, Progress, Question
} from '../../shared/types';
import { MAX_EXAMS_PER_WEEK } from '../../shared/types';

/* ------------------------------------------------------------------ */
/* Sabitler ve yardımcılar                                             */
/* ------------------------------------------------------------------ */

/** Hesaplar için sentetik e-posta alanı — bu adreslere hiç e-posta gönderilmez. */
const ACCOUNT_DOMAIN = 'hesap.playbook1401.app';
const INVITE_TTL_MS = 7 * 86400000;
const PAIRING_TTL_MS = 30 * 60000;
const DAY_MS = 86400000;

/**
 * Demo ortamı (playbook-demo-1401). Yalnızca `.env.demo` ile derlenen pakette
 * true'dur; canlı pakette bu değer hiç tanımlı olmadığı için false kalır.
 */
const DEMO = import.meta.env.VITE_DEMO === 'true';

export const pinPassword = (baristaId: string, pin: string) => `pb-${baristaId}-${pin}`;
export const invitePassword = (code: string) => `davet-${code}-1401`;

function randomDigits(n: number): string {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => (x % 10).toString()).join('');
}
function randomToken(len = 32): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, len);
}
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

export class AppError extends Error {
  constructor(message: string, public code?: string, public data?: unknown) { super(message); }
}

/** Yöneticinin oturumunu etkilemeden yeni bir Auth hesabı açar, uid döner. */
async function createAccount(email: string, password: string): Promise<string> {
  const a = secondaryAuth();
  const cred = await createUserWithEmailAndPassword(a, email, password);
  await signOut(a);
  return cred.user.uid;
}

async function uniqueCode(col: 'invites' | 'pairingCodes'): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = randomDigits(6);
    if (!(await getDoc(doc(db, col, code))).exists()) return code;
  }
  throw new AppError('Kod üretilemedi, tekrar dene.');
}

/* ------------------------------------------------------------------ */
/* Mağaza telefonu                                                     */
/* ------------------------------------------------------------------ */

export interface DeviceCreds {
  uid: string;
  email: string;
  password: string;
  storeId: string;
  storeName: string;
}

/** [Yönetici] Telefon için yeni hesap + 30 dk geçerli eşleştirme kodu. */
async function createPairingCode(storeId: string, storeName: string): Promise<{ code: string; expiresAt: number }> {
  const email = `tel-${storeId}-${randomToken(6)}@${ACCOUNT_DOMAIN}`;
  const password = randomToken(28);
  const uid = await createAccount(email, password);
  const code = await uniqueCode('pairingCodes');
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), { role: 'store', storeId, active: true, paired: false, label: 'Mağaza telefonu', createdAt: Date.now(), lastSeenAt: null });
  batch.set(doc(db, 'pairingCodes', code), { uid, email, password, storeId, storeName, expiresAt });
  await batch.commit();
  return { code, expiresAt };
}

/** [Telefon] Kodu kullanır, telefonu mağaza hesabıyla oturum açtırır. */
async function pairDevice(code: string, label: string): Promise<DeviceCreds> {
  const snap = await getDoc(doc(db, 'pairingCodes', code)).catch(() => null);
  const p = snap?.data();
  if (!p || p.expiresAt < Date.now()) throw new AppError('Kod geçersiz ya da süresi dolmuş.');
  await signInWithEmailAndPassword(auth, p.email, p.password);
  await updateDoc(doc(db, 'users', p.uid), { paired: true, label, lastSeenAt: Date.now() });
  // Canlıda kod tek kullanımlıktır: kullanıldığı anda silinir.
  // Demoda sabit kod (140114) ekranda yazılıdır ve birden fazla kişi kendi
  // tarayıcısında denemek ister; silinirse ilk denemeden sonra demo kilitlenir.
  if (!DEMO) await deleteDoc(doc(db, 'pairingCodes', code));
  return { uid: p.uid, email: p.email, password: p.password, storeId: p.storeId, storeName: p.storeName };
}

async function deviceSignIn(d: DeviceCreds): Promise<void> {
  await signInWithEmailAndPassword(auth, d.email, d.password);
  updateDoc(doc(db, 'users', d.uid), { lastSeenAt: Date.now() }).catch(() => {});
}

/** [Yönetici] Telefonun bağlantısını kaldırır — hesap pasifleşir, kurallar her şeyi reddeder. */
async function revokeDevice(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { active: false, revokedAt: Date.now() });
}

/* ------------------------------------------------------------------ */
/* Barista hesapları                                                   */
/* ------------------------------------------------------------------ */

/** Barista için yeni Auth hesabı + davet kodu hazırlar (batch'e yazar). */
async function prepareAccount(baristaId: string, seq: number, storeId: string) {
  const code = await uniqueCode('invites');
  const email = `b-${baristaId.toLowerCase()}-${seq}@${ACCOUNT_DOMAIN}`;
  const uid = await createAccount(email, invitePassword(code));
  const expiresAt = Date.now() + INVITE_TTL_MS;
  return { code, email, uid, expiresAt, invite: { baristaId, uid, email, storeId, expiresAt } };
}

async function deleteInvites(baristaId: string, batch: ReturnType<typeof writeBatch>) {
  const old = await getDocs(query(collection(db, 'invites'), where('baristaId', '==', baristaId)));
  old.forEach((d) => batch.delete(d.ref));
}

async function createBarista(input: { name: string; storeId: string; role: BaristaRole; phone?: string }) {
  const name = input.name.trim();
  if (name.length < 2) throw new AppError('Ad soyad gir.');
  if (!input.storeId) throw new AppError('Mağaza seç.');
  const ref = doc(collection(db, 'baristas'));
  const acc = await prepareAccount(ref.id, 1, input.storeId);
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(ref, {
    name, storeId: input.storeId, role: input.role, phone: input.phone?.trim() || '',
    active: true, pinPending: true, uid: acc.uid, authEmail: acc.email, accountSeq: 1,
    startedAt: new Date().toISOString().slice(0, 10), createdAt: now
  });
  batch.set(doc(db, 'users', acc.uid), { role: input.role, baristaId: ref.id, storeId: input.storeId, active: true, createdAt: now });
  batch.set(doc(db, 'progress', ref.id), { baristaId: ref.id, storeId: input.storeId, lessons: {}, modules: {}, updatedAt: now });
  batch.set(doc(db, 'invites', acc.code), acc.invite);
  await batch.commit();
  return { baristaId: ref.id, code: acc.code, expiresAt: acc.expiresAt };
}

/** PIN sıfırlama: yeni hesap + yeni davet; eski hesap pasifleşir (eski PIN artık işe yaramaz). */
async function resetBaristaPin(b: Barista) {
  const seq = (b.accountSeq || 1) + 1;
  const acc = await prepareAccount(b.id, seq, b.storeId);
  const batch = writeBatch(db);
  await deleteInvites(b.id, batch);
  if (b.uid) batch.update(doc(db, 'users', b.uid), { active: false });
  batch.set(doc(db, 'users', acc.uid), { role: b.role, baristaId: b.id, storeId: b.storeId, active: true, createdAt: Date.now() });
  batch.update(doc(db, 'baristas', b.id), { uid: acc.uid, authEmail: acc.email, accountSeq: seq, pinPending: true, active: true, deactivatedAt: null });
  batch.set(doc(db, 'invites', acc.code), acc.invite);
  await batch.commit();
  return { code: acc.code, expiresAt: acc.expiresAt };
}

async function setBaristaActive(b: Barista, active: boolean): Promise<{ code?: string; expiresAt?: number }> {
  if (active) return resetBaristaPin(b);
  const batch = writeBatch(db);
  await deleteInvites(b.id, batch);
  batch.update(doc(db, 'baristas', b.id), { active: false, deactivatedAt: Date.now() });
  if (b.uid) batch.update(doc(db, 'users', b.uid), { active: false });
  await batch.commit();
  return {};
}

async function updateBarista(b: Barista, patch: { name?: string; storeId?: string; role?: BaristaRole; phone?: string }) {
  const batch = writeBatch(db);
  const p: Record<string, unknown> = {};
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.phone !== undefined) p.phone = patch.phone.trim();
  if (patch.role !== undefined) p.role = patch.role;
  if (patch.storeId !== undefined) p.storeId = patch.storeId;
  batch.update(doc(db, 'baristas', b.id), p);
  if (b.uid && (patch.role || patch.storeId)) {
    batch.update(doc(db, 'users', b.uid), { ...(patch.role ? { role: patch.role } : {}), ...(patch.storeId ? { storeId: patch.storeId } : {}) });
  }
  if (patch.storeId) batch.update(doc(db, 'progress', b.id), { storeId: patch.storeId });
  await batch.commit();
}

/** [Telefon] Barista PIN ile giriş. */
async function baristaSignIn(b: Barista, pin: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, b.authEmail, pinPassword(b.id, pin));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/too-many-requests') throw new AppError('Çok fazla hatalı deneme. Birkaç dakika sonra tekrar dene ya da yöneticinden PIN sıfırlamasını iste.');
    if (code === 'auth/network-request-failed') throw new AppError('İnternet bağlantısı yok.');
    throw new AppError('PIN hatalı.');
  }
}

/** [Telefon] Davet kodu + yeni PIN. Oturum barista olarak açık kalır. */
async function redeemInvite(code: string, pin: string, storeId: string): Promise<void> {
  if (/^(\d)\1{3}$/.test(pin) || ['1234', '4321', '0123', '9876'].includes(pin)) {
    throw new AppError('Bu PIN çok kolay tahmin edilir, başka bir PIN seç.', 'weak-pin');
  }
  const snap = await getDoc(doc(db, 'invites', code)).catch(() => null);
  const inv = snap?.data();
  if (!inv || inv.expiresAt < Date.now()) throw new AppError('Davet kodu geçersiz ya da süresi dolmuş. Yöneticinden yeni kod iste.');
  if (inv.storeId !== storeId) throw new AppError('Bu davet başka bir mağaza için. Kendi mağazanın telefonunu kullan.');
  await signInWithEmailAndPassword(auth, inv.email, invitePassword(code));
  await updatePassword(auth.currentUser!, pinPassword(inv.baristaId, pin));
  await updateDoc(doc(db, 'baristas', inv.baristaId), { pinPending: false });
  await deleteDoc(doc(db, 'invites', code));
}

/* ------------------------------------------------------------------ */
/* Yöneticiler                                                         */
/* ------------------------------------------------------------------ */

/** İlk kurulum: hiç yönetici yoksa ilk hesabı admin olarak açar. */
async function bootstrapAdmin(name: string, email: string, password: string): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', cred.user.uid), { role: 'admin', name: name.trim(), email: email.trim(), active: true, createdAt: Date.now() });
  batch.set(doc(db, 'config', 'bootstrap'), { uid: cred.user.uid, at: Date.now() });
  await batch.commit();
}

async function needsBootstrap(): Promise<boolean> {
  const snap = await getDoc(doc(db, 'config', 'bootstrap')).catch(() => null);
  return snap ? !snap.exists() : false;
}

/** [Admin] Yeni Kahve Operasyonu kullanıcısı; şifresini e-postadaki bağlantıyla kendisi belirler. */
async function createStaff(name: string, email: string): Promise<void> {
  const uid = await createAccount(email.trim(), randomToken(24));
  await setDoc(doc(db, 'users', uid), { role: 'ops', name: name.trim(), email: email.trim(), active: true, createdAt: Date.now() });
  auth.languageCode = 'tr';
  await sendPasswordResetEmail(auth, email.trim());
}

/* ------------------------------------------------------------------ */
/* Sınav (telefonda puanlanır)                                         */
/* ------------------------------------------------------------------ */

interface ExamKey { order: number[]; q: Question }
const examKeys = new Map<string, { moduleId: string; passScore: number; keys: Record<string, ExamKey> }>();

async function startExam(mod: Module, who: { baristaId: string; storeId: string; name: string }) {
  const pSnap = await getDoc(doc(db, 'progress', who.baristaId));
  const progress = (pSnap.data() as Progress | undefined) || { modules: {} as Progress['modules'] };
  if (mod.prerequisiteId && !progress.modules?.[mod.prerequisiteId]) {
    throw new AppError('Bu sınav kilitli. Önce önceki modülü geçmelisin.');
  }
  const since = Date.now() - 7 * DAY_MS;
  const recent = await getDocs(query(collection(db, 'attempts'), where('baristaId', '==', who.baristaId), where('startedAt', '>=', since)));
  if (recent.size >= MAX_EXAMS_PER_WEEK) {
    const oldest = Math.min(...recent.docs.map((d) => d.data().startedAt as number));
    throw new AppError('weekly-limit', 'weekly-limit', { nextAt: oldest + 7 * DAY_MS });
  }
  const qSnap = await getDocs(query(collection(db, 'questions'), where('moduleId', '==', mod.id)));
  if (qSnap.empty) throw new AppError('Bu modülde henüz soru yok.');

  const missed = new Set<string>();
  recent.docs.forEach((d) => ((d.data().mistakes || []) as AttemptReviewItem[]).forEach((m) => missed.add(m.questionId)));

  // Daha önce yanlış yapılan sorular öne alınır ama sınavın EN ÇOK ÜÇTE
  // BİRİNİ kaplar. Sınırsız bırakılırsa tekrar sınavı neredeyse aynı
  // sorulardan oluşuyor; barista konuyu değil o soruları öğreniyor.
  const size = Math.min(mod.examSize || 10, qSnap.size);
  const missedPool = shuffle(qSnap.docs.filter((d) => missed.has(d.id)));
  const freshPool = shuffle(qSnap.docs.filter((d) => !missed.has(d.id)));
  const fromMissed = Math.min(missedPool.length, Math.floor(size / 3));
  const picked = shuffle([
    ...missedPool.slice(0, fromMissed),
    ...freshPool.slice(0, size - fromMissed),
    // Havuz tekrar sorularla doluysa kalanı eski sorulardan tamamla.
    ...missedPool.slice(fromMissed)
  ].slice(0, size));

  const keys: Record<string, ExamKey> = {};
  const questions: ExamQuestion[] = picked.map((d) => {
    const q = { id: d.id, ...d.data() } as Question;
    const idx = q.options.map((_, i) => i);
    const order = q.type === 'truefalse' ? idx : shuffle(idx);
    keys[d.id] = { order, q };
    return { id: d.id, type: q.type, prompt: q.prompt, imageUrl: q.imageUrl || undefined, options: order.map((i) => q.options[i]) };
  });

  const ref = await addDoc(collection(db, 'attempts'), {
    baristaId: who.baristaId, baristaName: who.name, storeId: who.storeId,
    moduleId: mod.id, moduleTitle: mod.title, startedAt: Date.now(), total: picked.length,
    questionIds: picked.map((d) => d.id),
    // Güvenlik kuralı "submittedAt == null" ile henüz bitmemiş denemeyi ayırt
    // eder; alan hiç yoksa bu karşılaştırma hata verir, bu yüzden açıkça null.
    submittedAt: null
  });
  examKeys.set(ref.id, { moduleId: mod.id, passScore: mod.passScore, keys });
  return { attemptId: ref.id, passScore: mod.passScore, questions };
}

async function submitExam(attemptId: string, answers: Record<string, number>, who: { baristaId: string; storeId: string }) {
  const ex = examKeys.get(attemptId);
  if (!ex) throw new AppError('Sınav oturumu bulunamadı (uygulama yeniden açılmış olabilir). Sınavı yeniden başlat.');
  let correct = 0;
  const mistakes: AttemptReviewItem[] = [];
  for (const [qid, k] of Object.entries(ex.keys)) {
    const shown = answers[qid];
    const given = Number.isInteger(shown) && k.order[shown] !== undefined ? k.order[shown] : null;
    if (given === k.q.answer) correct++;
    else mistakes.push({ questionId: qid, prompt: k.q.prompt, options: k.q.options, given, answer: k.q.answer, explanation: k.q.explanation || '' });
  }
  const total = Object.keys(ex.keys).length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const passed = score >= ex.passScore;
  const now = Date.now();
  await updateDoc(doc(db, 'attempts', attemptId), { submittedAt: now, correct, score, passed, mistakes });
  if (passed) {
    const pRef = doc(db, 'progress', who.baristaId);
    await runTransaction(db, async (tx) => {
      const p = await tx.get(pRef);
      const prev = (p.data() as Progress | undefined)?.modules?.[ex.moduleId];
      if (!prev || prev.score < score) {
        tx.update(pRef, { [`modules.${ex.moduleId}`]: { score, passedAt: prev?.passedAt || now }, updatedAt: now });
      }
    });
  }
  examKeys.delete(attemptId);
  return { score, correct, total, passed, passScore: ex.passScore, mistakes };
}

export const backend = {
  createPairingCode, pairDevice, deviceSignIn, revokeDevice,
  createBarista, resetBaristaPin, setBaristaActive, updateBarista, baristaSignIn, redeemInvite,
  bootstrapAdmin, needsBootstrap, createStaff,
  startExam, submitExam
};

/** Kullanıcıya gösterilecek hata mesajı. */
export function errorText(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === 'unavailable' || err?.code === 'auth/network-request-failed' || err?.message?.includes('network')) {
    return 'İnternet bağlantısı yok. Bağlantıyı kontrol edip tekrar dene.';
  }
  if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found') return 'E-posta veya şifre hatalı.';
  if (err?.code === 'auth/email-already-in-use') return 'Bu e-posta ile zaten bir hesap var.';
  if (err?.code === 'auth/weak-password') return 'Şifre en az 6 karakter olmalı.';
  if (err?.code === 'auth/invalid-email') return 'E-posta adresi geçersiz.';
  if (err?.code === 'auth/too-many-requests') return 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.';
  if (err?.code === 'auth/operation-not-allowed') return 'E-posta ile giriş Firebase konsolunda henüz açılmamış.';
  if (err?.code === 'permission-denied') return 'Bu işlem için yetkin yok.';
  return err?.message || 'Beklenmeyen bir hata oluştu.';
}
