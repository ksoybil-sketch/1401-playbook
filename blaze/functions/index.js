/**
 * 1401 Campus — Cloud Functions.
 *
 * Neden sunucu tarafı:
 *  - PIN'ler ve cihaz anahtarları telefona hiç inmez; sadece hash'leri
 *    Firestore'da, sadece burada okunan koleksiyonlarda durur.
 *  - Sınav cevap anahtarı (questions.answer) baristanın telefonuna inmez;
 *    puanlama burada yapılır. Böylece "cevaba bakıp sınav geçmek" mümkün değil.
 *  - Haftalık sınav hakkı ve modül kilidi istemcide değil burada uygulanır.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import crypto from 'node:crypto';

initializeApp();
const db = getFirestore();
const auth = getAuth();

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

const MAX_EXAMS_PER_WEEK = 3;
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAIRING_TTL_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const hashPin = (pin, salt) => crypto.scryptSync(pin, salt, 32).toString('hex');

/** 6 haneli, okunması/söylenmesi kolay sayısal kod. */
const numericCode = (len = 6) => {
  let s = '';
  for (let i = 0; i < len; i++) s += crypto.randomInt(0, 10).toString();
  return s;
};

const str = (v, field, { min = 1, max = 200 } = {}) => {
  if (typeof v !== 'string') throw new HttpsError('invalid-argument', `${field} eksik.`);
  const t = v.trim();
  if (t.length < min || t.length > max) throw new HttpsError('invalid-argument', `${field} geçersiz.`);
  return t;
};

const validPin = (pin) => {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    throw new HttpsError('invalid-argument', 'PIN 4 haneli olmalı.');
  }
  if (/^(\d)\1{3}$/.test(pin) || ['1234', '4321', '0123', '9876'].includes(pin)) {
    throw new HttpsError('invalid-argument', 'Bu PIN çok kolay tahmin edilir, başka bir PIN seç.');
  }
  return pin;
};

function requireStaff(request) {
  const role = request.auth?.token?.role;
  if (role !== 'ops' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Bu işlem için Kahve Operasyonu yetkisi gerekir.');
  }
  return request.auth;
}

function requireBarista(request) {
  const t = request.auth?.token;
  if (!t || (t.role !== 'barista' && t.role !== 'lead') || !t.baristaId) {
    throw new HttpsError('permission-denied', 'Önce barista olarak giriş yapmalısın.');
  }
  return t;
}

/** Cihaz kimliğini doğrular; cihaz kaydını döner. */
async function verifyDevice(deviceId, deviceSecret) {
  if (typeof deviceId !== 'string' || typeof deviceSecret !== 'string') {
    throw new HttpsError('unauthenticated', 'Cihaz bilgisi eksik.');
  }
  const snap = await db.doc(`devices/${deviceId}`).get();
  if (!snap.exists) throw new HttpsError('unauthenticated', 'Bu cihaz kayıtlı değil. Yeniden eşleştirin.');
  const d = snap.data();
  if (d.revoked) throw new HttpsError('unauthenticated', 'Bu cihazın bağlantısı kaldırıldı. Yeniden eşleştirin.');
  if (d.secretHash !== sha256(deviceSecret)) throw new HttpsError('unauthenticated', 'Cihaz anahtarı geçersiz.');
  const store = await db.doc(`stores/${d.storeId}`).get();
  if (!store.exists || store.data().active === false) {
    throw new HttpsError('failed-precondition', 'Mağaza aktif değil.');
  }
  return { id: snap.id, ...d, storeName: store.data().name };
}

async function storeToken(device) {
  await db.doc(`devices/${device.id}`).update({ lastSeenAt: Date.now() });
  return auth.createCustomToken(`d_${device.id}`, {
    role: 'store',
    storeId: device.storeId,
    deviceId: device.id
  });
}

async function baristaToken(barista, device) {
  return auth.createCustomToken(`b_${barista.id}`, {
    role: barista.role === 'lead' ? 'lead' : 'barista',
    storeId: barista.storeId,
    deviceId: device.id,
    baristaId: barista.id
  });
}

/** Yeni davet kodu üretir; baristanın eski davetlerini siler. */
async function issueInvite(baristaId) {
  const old = await db.collection('invites').where('baristaId', '==', baristaId).get();
  const batch = db.batch();
  old.forEach((d) => batch.delete(d.ref));
  let code;
  for (let i = 0; i < 5; i++) {
    code = numericCode(6);
    const exists = await db.doc(`invites/${sha256(code)}`).get();
    if (!exists.exists) break;
  }
  batch.set(db.doc(`invites/${sha256(code)}`), {
    baristaId,
    expiresAt: Date.now() + INVITE_TTL_MS
  });
  await batch.commit();
  return { code, expiresAt: Date.now() + INVITE_TTL_MS };
}

async function revokeUser(uid) {
  try {
    await auth.revokeRefreshTokens(uid);
  } catch (e) {
    // Kullanıcı hiç giriş yapmadıysa Auth kaydı yoktur — sorun değil.
    if (e?.code !== 'auth/user-not-found') throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Cihaz eşleştirme                                                    */
/* ------------------------------------------------------------------ */

/** [Yönetici] Mağaza için 30 dk geçerli telefon eşleştirme kodu üretir. */
export const createPairingCode = onCall(async (request) => {
  requireStaff(request);
  const storeId = str(request.data?.storeId, 'Mağaza');
  const store = await db.doc(`stores/${storeId}`).get();
  if (!store.exists) throw new HttpsError('not-found', 'Mağaza bulunamadı.');
  const code = numericCode(6);
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  await db.doc(`pairingCodes/${sha256(code)}`).set({ storeId, expiresAt, createdBy: request.auth.uid });
  return { code, expiresAt };
});

/** [Telefon] Eşleştirme kodu ile cihazı mağazaya bağlar. */
export const pairDevice = onCall(async (request) => {
  const code = str(request.data?.code, 'Kod', { min: 6, max: 6 });
  const label = typeof request.data?.label === 'string' ? request.data.label.slice(0, 60) : 'Mağaza telefonu';
  const ref = db.doc(`pairingCodes/${sha256(code)}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().expiresAt < Date.now()) {
    throw new HttpsError('not-found', 'Kod geçersiz ya da süresi dolmuş.');
  }
  const { storeId } = snap.data();
  const deviceSecret = crypto.randomBytes(32).toString('base64url');
  const deviceRef = db.collection('devices').doc();
  await deviceRef.set({
    storeId,
    label,
    secretHash: sha256(deviceSecret),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    revoked: false
  });
  await ref.delete();
  const device = await verifyDevice(deviceRef.id, deviceSecret);
  return {
    deviceId: deviceRef.id,
    deviceSecret,
    storeId,
    storeName: device.storeName,
    token: await storeToken(device)
  };
});

/** [Telefon] Kayıtlı cihazı mağaza moduna döndürür (barista çıkışı, uygulama açılışı). */
export const deviceSignIn = onCall(async (request) => {
  const device = await verifyDevice(request.data?.deviceId, request.data?.deviceSecret);
  return { storeId: device.storeId, storeName: device.storeName, token: await storeToken(device) };
});

/** [Yönetici] Telefonun bağlantısını kaldırır. */
export const revokeDevice = onCall(async (request) => {
  requireStaff(request);
  const deviceId = str(request.data?.deviceId, 'Cihaz');
  await db.doc(`devices/${deviceId}`).update({ revoked: true, revokedAt: Date.now() });
  await revokeUser(`d_${deviceId}`);
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/* Barista girişi                                                      */
/* ------------------------------------------------------------------ */

/** [Telefon] Barista PIN ile giriş. */
export const baristaSignIn = onCall(async (request) => {
  const device = await verifyDevice(request.data?.deviceId, request.data?.deviceSecret);
  const baristaId = str(request.data?.baristaId, 'Barista');
  const pin = request.data?.pin;
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw new HttpsError('invalid-argument', 'PIN 4 haneli olmalı.');

  const bSnap = await db.doc(`baristas/${baristaId}`).get();
  if (!bSnap.exists) throw new HttpsError('not-found', 'Barista bulunamadı.');
  const barista = { id: bSnap.id, ...bSnap.data() };
  if (!barista.active) throw new HttpsError('permission-denied', 'Bu profil pasif durumda.');
  if (barista.storeId !== device.storeId) throw new HttpsError('permission-denied', 'Bu barista bu mağazaya kayıtlı değil.');

  const secretRef = db.doc(`baristaSecrets/${baristaId}`);
  const result = await db.runTransaction(async (tx) => {
    const s = await tx.get(secretRef);
    if (!s.exists || !s.data().pinHash) return { error: 'no-pin' };
    const sec = s.data();
    const now = Date.now();
    if (sec.lockedUntil && sec.lockedUntil > now) {
      return { error: 'locked', minutes: Math.ceil((sec.lockedUntil - now) / 60000) };
    }
    if (hashPin(pin, sec.salt) !== sec.pinHash) {
      const fails = (sec.failedAttempts || 0) + 1;
      if (fails >= PIN_MAX_FAILS) {
        tx.update(secretRef, { failedAttempts: 0, lockedUntil: now + PIN_LOCK_MS });
        return { error: 'locked', minutes: PIN_LOCK_MS / 60000 };
      }
      tx.update(secretRef, { failedAttempts: fails });
      return { error: 'wrong', left: PIN_MAX_FAILS - fails };
    }
    tx.update(secretRef, { failedAttempts: 0, lockedUntil: null, lastLoginAt: now });
    return { ok: true };
  });

  if (result.error === 'no-pin') throw new HttpsError('failed-precondition', 'Henüz PIN belirlenmemiş. Davet kodunu kullan.');
  if (result.error === 'locked') throw new HttpsError('resource-exhausted', `Çok fazla hatalı deneme. ${result.minutes} dk sonra tekrar dene ya da yöneticinden PIN sıfırlamasını iste.`);
  if (result.error === 'wrong') throw new HttpsError('permission-denied', `PIN hatalı. ${result.left} deneme hakkın kaldı.`);

  return { token: await baristaToken(barista, device), barista: { id: barista.id, name: barista.name, role: barista.role } };
});

/** [Telefon] Yeni barista: davet kodu + kendi seçtiği PIN. */
export const redeemInvite = onCall(async (request) => {
  const device = await verifyDevice(request.data?.deviceId, request.data?.deviceSecret);
  const code = str(request.data?.code, 'Davet kodu', { min: 6, max: 6 });
  const pin = validPin(request.data?.pin);

  const inviteRef = db.doc(`invites/${sha256(code)}`);
  const inv = await inviteRef.get();
  if (!inv.exists || inv.data().expiresAt < Date.now()) {
    throw new HttpsError('not-found', 'Davet kodu geçersiz ya da süresi dolmuş. Yöneticinden yeni kod iste.');
  }
  const baristaId = inv.data().baristaId;
  const bSnap = await db.doc(`baristas/${baristaId}`).get();
  if (!bSnap.exists || !bSnap.data().active) throw new HttpsError('permission-denied', 'Bu profil aktif değil.');
  const barista = { id: bSnap.id, ...bSnap.data() };
  if (barista.storeId !== device.storeId) {
    throw new HttpsError('permission-denied', 'Bu davet başka bir mağaza için. Kendi mağazanın telefonunu kullan.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const batch = db.batch();
  batch.set(db.doc(`baristaSecrets/${baristaId}`), {
    salt,
    pinHash: hashPin(pin, salt),
    failedAttempts: 0,
    lockedUntil: null,
    pinSetAt: Date.now()
  });
  batch.update(db.doc(`baristas/${baristaId}`), { pinPending: false });
  batch.delete(inviteRef);
  await batch.commit();

  return { token: await baristaToken(barista, device), barista: { id: barista.id, name: barista.name, role: barista.role } };
});

/* ------------------------------------------------------------------ */
/* Barista yönetimi (Kahve Operasyonu)                                 */
/* ------------------------------------------------------------------ */

/** [Yönetici] Yeni barista ekler ve davet kodu döner. */
export const createBarista = onCall(async (request) => {
  requireStaff(request);
  const name = str(request.data?.name, 'Ad soyad', { min: 2, max: 80 });
  const storeId = str(request.data?.storeId, 'Mağaza');
  const role = request.data?.role === 'lead' ? 'lead' : 'barista';
  const phone = typeof request.data?.phone === 'string' ? request.data.phone.trim().slice(0, 20) : '';
  const store = await db.doc(`stores/${storeId}`).get();
  if (!store.exists) throw new HttpsError('not-found', 'Mağaza bulunamadı.');

  const ref = db.collection('baristas').doc();
  await ref.set({
    name,
    storeId,
    role,
    phone,
    active: true,
    pinPending: true,
    startedAt: new Date().toISOString().slice(0, 10),
    createdAt: Date.now()
  });
  await db.doc(`progress/${ref.id}`).set({ baristaId: ref.id, storeId, lessons: {}, modules: {}, updatedAt: Date.now() });
  const invite = await issueInvite(ref.id);
  return { baristaId: ref.id, ...invite };
});

/** [Yönetici] PIN'i sıfırlar; yeni davet kodu döner. */
export const resetBaristaPin = onCall(async (request) => {
  requireStaff(request);
  const baristaId = str(request.data?.baristaId, 'Barista');
  const b = await db.doc(`baristas/${baristaId}`).get();
  if (!b.exists) throw new HttpsError('not-found', 'Barista bulunamadı.');
  await db.doc(`baristaSecrets/${baristaId}`).delete();
  await db.doc(`baristas/${baristaId}`).update({ pinPending: true });
  await revokeUser(`b_${baristaId}`);
  return issueInvite(baristaId);
});

/** [Yönetici] İşten ayrılan baristayı pasifleştirir (geçmişi silinmez) ya da geri alır. */
export const setBaristaActive = onCall(async (request) => {
  requireStaff(request);
  const baristaId = str(request.data?.baristaId, 'Barista');
  const active = request.data?.active === true;
  const ref = db.doc(`baristas/${baristaId}`);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Barista bulunamadı.');
  if (active) {
    await ref.update({ active: true, deactivatedAt: FieldValue.delete(), pinPending: true });
    return { ok: true, ...(await issueInvite(baristaId)) };
  }
  await ref.update({ active: false, deactivatedAt: Date.now() });
  await db.doc(`baristaSecrets/${baristaId}`).delete();
  const invites = await db.collection('invites').where('baristaId', '==', baristaId).get();
  await Promise.all(invites.docs.map((d) => d.ref.delete()));
  await revokeUser(`b_${baristaId}`);
  return { ok: true };
});

/** [Yönetici] Ad, mağaza ve rol günceller. */
export const updateBarista = onCall(async (request) => {
  requireStaff(request);
  const baristaId = str(request.data?.baristaId, 'Barista');
  const patch = {};
  if (request.data?.name !== undefined) patch.name = str(request.data.name, 'Ad soyad', { min: 2, max: 80 });
  if (request.data?.role !== undefined) patch.role = request.data.role === 'lead' ? 'lead' : 'barista';
  if (request.data?.phone !== undefined) patch.phone = String(request.data.phone).trim().slice(0, 20);
  if (request.data?.storeId !== undefined) {
    const storeId = str(request.data.storeId, 'Mağaza');
    if (!(await db.doc(`stores/${storeId}`).get()).exists) throw new HttpsError('not-found', 'Mağaza bulunamadı.');
    patch.storeId = storeId;
  }
  await db.doc(`baristas/${baristaId}`).update(patch);
  if (patch.storeId) await db.doc(`progress/${baristaId}`).set({ storeId: patch.storeId }, { merge: true });
  if (patch.storeId || patch.role) await revokeUser(`b_${baristaId}`);
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/* Sınavlar                                                            */
/* ------------------------------------------------------------------ */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** [Barista] Sınavı başlatır: kilit ve haftalık hak kontrolü, soruları cevapsız döner. */
export const startExam = onCall(async (request) => {
  const t = requireBarista(request);
  const moduleId = str(request.data?.moduleId, 'Modül');

  const [modSnap, bSnap, progSnap] = await Promise.all([
    db.doc(`modules/${moduleId}`).get(),
    db.doc(`baristas/${t.baristaId}`).get(),
    db.doc(`progress/${t.baristaId}`).get()
  ]);
  if (!modSnap.exists || !modSnap.data().published) throw new HttpsError('not-found', 'Modül bulunamadı.');
  if (!bSnap.exists || !bSnap.data().active) throw new HttpsError('permission-denied', 'Profil aktif değil.');
  const mod = modSnap.data();
  const progress = progSnap.exists ? progSnap.data() : { modules: {} };

  if (mod.prerequisiteId && !progress.modules?.[mod.prerequisiteId]) {
    throw new HttpsError('failed-precondition', 'Bu sınav kilitli. Önce önceki modülü geçmelisin.');
  }

  const since = Date.now() - 7 * DAY_MS;
  const recent = await db.collection('attempts')
    .where('baristaId', '==', t.baristaId)
    .where('startedAt', '>=', since)
    .get();
  if (recent.size >= MAX_EXAMS_PER_WEEK) {
    const oldest = Math.min(...recent.docs.map((d) => d.data().startedAt));
    throw new HttpsError('resource-exhausted', JSON.stringify({ code: 'weekly-limit', nextAt: oldest + 7 * DAY_MS }));
  }

  const qSnap = await db.collection('questions').where('moduleId', '==', moduleId).get();
  if (qSnap.empty) throw new HttpsError('failed-precondition', 'Bu modülde henüz soru yok.');

  // Daha önce yanlış yaptığı sorular öne alınır (aralıklı tekrar).
  const missed = new Set();
  recent.docs.concat().forEach((d) => (d.data().mistakes || []).forEach((m) => missed.add(m.questionId)));
  const all = shuffle(qSnap.docs);
  const prioritized = [...all.filter((d) => missed.has(d.id)), ...all.filter((d) => !missed.has(d.id))];
  const picked = shuffle(prioritized.slice(0, Math.min(mod.examSize || 10, all.length)));

  // Seçenek sırası her denemede karıştırılır (Doğru/Yanlış hariç); hangi
  // gösterilen seçeneğin hangi asıl seçeneğe denk geldiği denemeye kaydedilir.
  const optionOrders = {};
  picked.forEach((d) => {
    const q = d.data();
    const idx = q.options.map((_, i) => i);
    optionOrders[d.id] = q.type === 'truefalse' ? idx : shuffle(idx);
  });

  const attemptRef = db.collection('attempts').doc();
  await attemptRef.set({
    baristaId: t.baristaId,
    baristaName: bSnap.data().name,
    storeId: bSnap.data().storeId,
    moduleId,
    moduleTitle: mod.title,
    startedAt: Date.now(),
    total: picked.length,
    questionIds: picked.map((d) => d.id),
    optionOrders
  });

  return {
    attemptId: attemptRef.id,
    passScore: mod.passScore,
    questions: picked.map((d) => {
      const q = d.data();
      return { id: d.id, type: q.type, prompt: q.prompt, imageUrl: q.imageUrl || null, options: optionOrders[d.id].map((i) => q.options[i]) };
    })
  };
});

/** [Barista] Cevapları puanlar, sonucu ve ilerlemeyi kaydeder. */
export const submitExam = onCall(async (request) => {
  const t = requireBarista(request);
  const attemptId = str(request.data?.attemptId, 'Sınav');
  const answers = request.data?.answers && typeof request.data.answers === 'object' ? request.data.answers : {};

  const ref = db.doc(`attempts/${attemptId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Sınav bulunamadı.');
  const attempt = snap.data();
  if (attempt.baristaId !== t.baristaId) throw new HttpsError('permission-denied', 'Bu sınav sana ait değil.');
  if (attempt.submittedAt) throw new HttpsError('failed-precondition', 'Bu sınav zaten gönderildi.');

  const modSnap = await db.doc(`modules/${attempt.moduleId}`).get();
  const passScore = modSnap.exists ? modSnap.data().passScore : 80;
  const qDocs = await db.getAll(...attempt.questionIds.map((id) => db.doc(`questions/${id}`)));

  let correct = 0;
  const mistakes = [];
  for (const d of qDocs) {
    if (!d.exists) continue;
    const q = d.data();
    const order = attempt.optionOrders?.[d.id] || q.options.map((_, i) => i);
    const shown = answers[d.id];
    const given = Number.isInteger(shown) && order[shown] !== undefined ? order[shown] : null;
    if (given === q.answer) {
      correct++;
    } else {
      mistakes.push({
        questionId: d.id,
        prompt: q.prompt,
        options: q.options,
        given,
        answer: q.answer,
        explanation: q.explanation || null
      });
    }
  }
  const total = attempt.questionIds.length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const passed = score >= passScore;
  const now = Date.now();

  await ref.update({ submittedAt: now, correct, score, passed, mistakes });

  if (passed) {
    const pRef = db.doc(`progress/${t.baristaId}`);
    await db.runTransaction(async (tx) => {
      const p = await tx.get(pRef);
      const prev = p.exists ? p.data().modules?.[attempt.moduleId] : null;
      if (!prev || prev.score < score) {
        tx.set(pRef, {
          baristaId: t.baristaId,
          storeId: attempt.storeId,
          modules: { [attempt.moduleId]: { score, passedAt: prev?.passedAt || now } },
          updatedAt: now
        }, { merge: true });
      }
    });
  }

  return { score, correct, total, passed, passScore, mistakes };
});

/* ------------------------------------------------------------------ */
/* Tetikleyiciler                                                      */
/* ------------------------------------------------------------------ */

/** Modüldeki soru sayısını güncel tutar (yönetici panelinde gösterilir). */
export const onQuestionWrite = onDocumentWritten('questions/{questionId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const ids = new Set([before?.moduleId, after?.moduleId].filter(Boolean));
  for (const moduleId of ids) {
    const count = (await db.collection('questions').where('moduleId', '==', moduleId).count().get()).data().count;
    const mRef = db.doc(`modules/${moduleId}`);
    if ((await mRef.get()).exists) await mRef.update({ questionCount: count });
  }
});
