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
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updatePassword, sendPasswordResetEmail,
  EmailAuthProvider, reauthenticateWithCredential
} from 'firebase/auth';
import {
  arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch
} from 'firebase/firestore';
import { auth, db, secondaryAuth } from './firebase';
import type { Barista, BaristaRole, StaffRole } from '../../shared/types';
import { authorName, isDevRole, STAFF_ROLE_LABEL, visibleStaffRoles } from '../lib/roles';
import { localDay } from '../lib/day';
import { serverNow, syncServerClock } from '../lib/serverTime';
// Döngüsel içe aktarım (session.ts de bu dosyayı içe aktarır): useSession
// yalnızca işlevlerin içinde, çalışma anında okunur; modül yüklenirken değil.
import { useSession } from '../store/session';

/* ------------------------------------------------------------------ */
/* Sabitler ve yardımcılar                                             */
/* ------------------------------------------------------------------ */

/** Hesaplar için sentetik e-posta alanı — bu adreslere hiç e-posta gönderilmez. */
const ACCOUNT_DOMAIN = 'hesap.playbook1401.app';
const INVITE_TTL_MS = 7 * 86400000;
const PAIRING_TTL_MS = 30 * 60000;

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
export class AppError extends Error {
  constructor(message: string, public code?: string, public data?: unknown) { super(message); }
}

/**
 * Kayda yazılacak yazar adı: oturumdaki kişi uygulama geliştiricisiyse boş
 * (bkz. roles.ts authorName). Çağıran yalnızca adı veriyor; rol oturumdan okunur.
 */
function signedName(name?: string): string {
  const s = useSession.getState().session;
  return authorName(s.kind === 'staff' ? s.role : undefined, name);
}

/** Firestore/Auth hatası ağ kaynaklı mı (sunucuya ulaşılamadı)? */
export function isNetworkError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === 'unavailable' || err?.code === 'deadline-exceeded'
    || err?.code === 'auth/network-request-failed' || err?.code === 'auth/timeout'
    || /offline|network/i.test(err?.message || '');
}
const NETWORK_MSG = 'İnternet bağlantısı yok. Bağlantıyı kontrol edip tekrar dene.';

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

/**
 * [Yönetici] Telefon için yeni hesap + 30 dk geçerli eşleştirme kodu.
 *
 * Kodun ömrü SUNUCU saatiyle yazılır (kural expiresAt'i request.time + 30 dk
 * ile denetler): yöneticinin bilgisayar saati 3 saat geriyse kod doğduğu anda
 * geçersiz, ileriyse günlerce geçerliydi (H2).
 *
 * replaces: bu kod bir telefonun YERİNE (uygulama verisi silindi, telefon
 * değişti). O telefonların hesabı aynı yazımda pasifleşir; eskiden yeni kod
 * yeni hesap açıyor, eskisi mağazada "telefon" olarak aktif kalıyordu (H16).
 */
async function createPairingCode(storeId: string, storeName: string, opts: { replaces?: string[] } = {}): Promise<{ code: string; expiresAt: number }> {
  const email = `tel-${storeId}-${randomToken(6)}@${ACCOUNT_DOMAIN}`;
  const password = randomToken(28);
  const [uid] = await Promise.all([createAccount(email, password), syncServerClock()]);
  const code = await uniqueCode('pairingCodes');
  const now = serverNow();
  const expiresAt = now + PAIRING_TTL_MS;
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), { role: 'store', storeId, active: true, paired: false, label: 'Mağaza telefonu', createdAt: now, lastSeenAt: null });
  batch.set(doc(db, 'pairingCodes', code), { uid, email, password, storeId, storeName, expiresAt });
  (opts.replaces || []).forEach((old) => batch.update(doc(db, 'users', old), { active: false, revokedAt: now, replacedBy: uid }));
  await batch.commit();
  return { code, expiresAt };
}

/** [Telefon] Kodu kullanır, telefonu mağaza hesabıyla oturum açtırır. */
async function pairDevice(code: string, label: string): Promise<DeviceCreds> {
  // Ağ hatası "kod geçersiz" diye gösterilmesin: barista boşuna yeni kod istiyordu.
  let p: Record<string, any> | undefined;
  try {
    p = (await getDoc(doc(db, 'pairingCodes', code))).data();
  } catch (e) {
    if (isNetworkError(e)) throw new AppError(NETWORK_MSG, 'unavailable');
    p = undefined;
  }
  // Süre kuralda sunucu saatiyle denetlenir (süresi dolmuş kod okunamaz); telefonun
  // saati yanlışsa geçerli kod "süresi dolmuş" sayılmasın diye burada yeniden bakılmaz.
  if (!p) throw new AppError('Kod geçersiz ya da süresi dolmuş.');
  await signInWithEmailAndPassword(auth, p.email, p.password);
  const creds: DeviceCreds = { uid: p.uid, email: p.email, password: p.password, storeId: p.storeId, storeName: p.storeName };
  // Oturum açıldıktan sonrası telefonun eşleşmesini engellememeli (beklenmez):
  // buradaki bir ağ hatası eskiden kimliğin hiç kaydedilmemesine yol açıyordu
  // (telefon ilk barista çıkışında "eşleşmemiş" ekrana düşüyordu). Yazımlar
  // kuyruğa girer; "paired" yazılamazsa sonraki her girişte deviceSignIn yazar.
  updateDoc(doc(db, 'users', p.uid), { paired: true, label, lastSeenAt: Date.now() }).catch(() => {});
  // Canlıda kod tek kullanımlıktır: kullanıldığı anda silinir.
  // Demoda sabit kod (140114) ekranda yazılıdır ve birden fazla kişi kendi
  // tarayıcısında denemek ister; silinirse ilk denemeden sonra demo kilitlenir.
  // Silinemezse 30 dakikada kendiliğinden geçersizleşir.
  if (!DEMO) deleteDoc(doc(db, 'pairingCodes', code)).catch(() => {});
  return creds;
}

async function deviceSignIn(d: DeviceCreds): Promise<void> {
  await signInWithEmailAndPassword(auth, d.email, d.password);
  updateDoc(doc(db, 'users', d.uid), { lastSeenAt: Date.now(), paired: true }).catch(() => {});
}

/**
 * [Yönetici] Telefonun bağlantısını kaldırır: hesap pasifleşir. Kurallar
 * (firestore.rules isActive) pasif hesabın bütün okuma ve yazmalarını
 * reddeder; telefondaki uygulama da kendi users belgesini dinlediği için
 * açık oturumu kapatıp eşleşmeyi siler (bkz. store/session.ts).
 */
async function revokeDevice(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { active: false, revokedAt: Date.now() });
}

/* ------------------------------------------------------------------ */
/* Barista hesapları                                                   */
/* ------------------------------------------------------------------ */

/** Barista için yeni Auth hesabı + davet kodu hazırlar (batch'e yazar). */
async function prepareAccount(baristaId: string, seq: number, storeId: string) {
  const [code] = await Promise.all([uniqueCode('invites'), syncServerClock()]);
  const email = `b-${baristaId.toLowerCase()}-${seq}@${ACCOUNT_DOMAIN}`;
  const uid = await createAccount(email, invitePassword(code));
  // Sunucu saatiyle (kural: request.time + 7 gün ± 5 dk; H2).
  const expiresAt = serverNow() + INVITE_TTL_MS;
  return { code, email, uid, expiresAt, invite: { baristaId, uid, email, storeId, expiresAt } };
}

async function deleteInvites(baristaId: string, batch: ReturnType<typeof writeBatch>) {
  const old = await getDocs(query(collection(db, 'invites'), where('baristaId', '==', baristaId)));
  old.forEach((d) => batch.delete(d.ref));
}

/** İşe başlama tarihi (YYYY-AA-GG): kıdem rozetleri buna bakar. Yoksa bugün (yerel gün). */
const validDay = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= localDay() ? d : null);

async function createBarista(input: { name: string; storeId: string; role: BaristaRole; phone?: string; startedAt?: string; createdByName?: string }) {
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
    startedAt: validDay(input.startedAt) || localDay(), createdAt: now,
    inviteExpiresAt: acc.expiresAt, codeIssuedByName: signedName(input.createdByName)
  });
  batch.set(doc(db, 'users', acc.uid), { role: input.role, baristaId: ref.id, storeId: input.storeId, active: true, createdAt: now });
  batch.set(doc(db, 'progress', ref.id), { baristaId: ref.id, storeId: input.storeId, lessons: {}, modules: {}, updatedAt: now });
  batch.set(doc(db, 'invites', acc.code), acc.invite);
  await batch.commit();
  return { baristaId: ref.id, code: acc.code, expiresAt: acc.expiresAt };
}

/**
 * PIN sıfırlama: yeni hesap + yeni davet; eski hesap pasifleşir (eski PIN artık işe yaramaz).
 *
 * Yeniden etkinleştirmede (b.active false) çıkarılma kaydı silinmez (H26):
 * deactivatedAt yerinde kalır, `history`e "dönüş" eklenir. Kurul ve panel
 * "ayrılan" sayısını yalnızca pasif baristalardan hesapladığı için dönen kişi
 * ayrılmış sayılmaz; çıkış/dönüş izi kayıtta durur.
 */
async function resetBaristaPin(b: Barista, issuedBy?: string) {
  const seq = (b.accountSeq || 1) + 1;
  const acc = await prepareAccount(b.id, seq, b.storeId);
  const batch = writeBatch(db);
  await deleteInvites(b.id, batch);
  const now = Date.now();
  if (b.uid) batch.update(doc(db, 'users', b.uid), { active: false });
  batch.set(doc(db, 'users', acc.uid), { role: b.role, baristaId: b.id, storeId: b.storeId, active: true, createdAt: now });
  batch.update(doc(db, 'baristas', b.id), {
    uid: acc.uid, authEmail: acc.email, accountSeq: seq, pinPending: true, active: true, inviteExpiresAt: acc.expiresAt,
    ...(issuedBy !== undefined ? { codeIssuedByName: signedName(issuedBy) } : {}),
    ...(b.active === false ? { history: arrayUnion({ kind: 'donus', at: now, byName: signedName(issuedBy) }) } : {})
  });
  batch.set(doc(db, 'invites', acc.code), acc.invite);
  await batch.commit();
  // Ekibim'den açılan "PIN sıfırlama" talebi: kod hazır (H20). Kod kullanılınca
  // talep kendiliğinden kapanır (redeemInvite). Talep yazılamazsa sıfırlama bozulmaz.
  void markPinRequests(b, issuedBy).catch(() => {});
  return { code: acc.code, expiresAt: acc.expiresAt };
}

/** "<ad> için PIN sıfırlama" başlıklı talebin adı (HomePages askPin ile aynı). */
export const pinRequestTitle = (name: string) => `${name} için PIN sıfırlama`;

/** [Yönetici] Baristanın açık PIN sıfırlama talepleri: "yeni kod verildi" notu, kişiye bağlanır. */
async function markPinRequests(b: Barista, issuedBy?: string) {
  const snap = await getDocs(query(collection(db, 'requests'), where('storeId', '==', b.storeId), where('category', '==', 'personel')));
  const open = snap.docs.filter((d) => {
    const r = d.data();
    return !['done', 'rejected'].includes(r.status) && (r.subjectBaristaId === b.id || r.title === pinRequestTitle(b.name));
  });
  if (!open.length) return;
  const s = useSession.getState().session;
  const dev = s.kind === 'staff' && isDevRole(s.role);
  const now = Date.now();
  const batch = writeBatch(db);
  open.forEach((d) => batch.update(d.ref, {
    subjectBaristaId: b.id, status: 'in_progress', closedAt: null, updatedAt: now, lastSide: 'ops',
    notes: arrayUnion({ at: now, by: dev || s.kind !== 'staff' ? '' : s.uid, byName: signedName(issuedBy), side: 'ops', status: 'in_progress',
      text: `Yeni davet kodu verildi. ${b.name} kodu kullanınca talep kendiliğinden kapanır.` })
  }));
  await batch.commit();
}

async function setBaristaActive(b: Barista, active: boolean, issuedBy?: string): Promise<{ code?: string; expiresAt?: number }> {
  if (active) return resetBaristaPin(b, issuedBy);
  const batch = writeBatch(db);
  await deleteInvites(b.id, batch);
  const now = Date.now();
  batch.update(doc(db, 'baristas', b.id), { active: false, deactivatedAt: now, history: arrayUnion({ kind: 'cikis', at: now, byName: signedName(issuedBy) }) });
  if (b.uid) batch.update(doc(db, 'users', b.uid), { active: false });
  await batch.commit();
  return {};
}

async function updateBarista(b: Barista, patch: { name?: string; storeId?: string; role?: BaristaRole; phone?: string; startedAt?: string }) {
  const batch = writeBatch(db);
  const p: Record<string, unknown> = {};
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.phone !== undefined) p.phone = patch.phone.trim();
  if (patch.role !== undefined) p.role = patch.role;
  if (patch.storeId !== undefined) p.storeId = patch.storeId;
  if (patch.startedAt !== undefined) {
    const d = validDay(patch.startedAt);
    if (!d) throw new AppError('İşe başlama tarihi geçerli değil (bugünden ileri olamaz).');
    p.startedAt = d;
  }
  batch.update(doc(db, 'baristas', b.id), p);
  if (b.uid && (patch.role || patch.storeId)) {
    batch.update(doc(db, 'users', b.uid), { ...(patch.role ? { role: patch.role } : {}), ...(patch.storeId ? { storeId: patch.storeId } : {}) });
  }
  if (patch.storeId) batch.update(doc(db, 'progress', b.id), { storeId: patch.storeId });
  // Bekleyen davet kodu da yeni mağazaya taşınır: redeemInvite mağazayı
  // denetlediği için eski mağaza kimliğiyle kalan kod yeni mağazada çalışmıyordu.
  if (patch.storeId && patch.storeId !== b.storeId) {
    const inv = await getDocs(query(collection(db, 'invites'), where('baristaId', '==', b.id)));
    inv.forEach((d) => batch.update(d.ref, { storeId: patch.storeId }));
  }
  await batch.commit();
}

/**
 * [Telefon] Bir müdürün PIN'ini, telefondaki oturumu değiştirmeden doğrular
 * (ikinci, bellekte yaşayan Firebase örneğiyle). Mağaza bağlantısını kaldırmak
 * gibi ortak cihazdaki geri dönüşü zor işler için.
 */
async function verifyPin(b: Barista, pin: string): Promise<void> {
  const a = secondaryAuth();
  try {
    await signInWithEmailAndPassword(a, b.authEmail, pinPassword(b.id, pin));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/too-many-requests') throw new AppError('Çok fazla hatalı deneme. Birkaç dakika sonra tekrar dene.');
    if (code === 'auth/network-request-failed') throw new AppError('İnternet bağlantısı yok.');
    throw new AppError('PIN hatalı.');
  } finally {
    await a.signOut().catch(() => {});
  }
}

/** [Telefon] Barista PIN ile giriş. */
async function baristaSignIn(b: Barista, pin: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, b.authEmail, pinPassword(b.id, pin));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/too-many-requests') throw new AppError('Çok fazla hatalı deneme. Birkaç dakika sonra tekrar dene ya da yöneticinden PIN sıfırlamasını iste.');
    if (code === 'auth/network-request-failed') throw new AppError('İnternet bağlantısı yok.', 'unavailable');
    throw new AppError('PIN hatalı.');
  }
}

/** 1111, 1234 gibi kolay tahmin edilen PIN'ler. */
export const weakPin = (pin: string) => /^(\d)\1{3}$/.test(pin) || ['1234', '4321', '0123', '9876'].includes(pin);

const INVITE_BAD = 'Davet kodu geçersiz, süresi dolmuş ya da başka bir mağaza için. Kodu kontrol et ya da yöneticinden yeni kod iste.';

/**
 * [Telefon] Davet kodunu PIN sorulmadan önce doğrular (H19): yanlış kod
 * eskiden PIN iki kez girildikten sonra söyleniyordu. Kural var olmayan,
 * süresi dolmuş ya da başka şubenin kodunu okutmaz; hepsi aynı mesajı alır.
 */
async function checkInvite(code: string, storeId: string): Promise<Record<string, any>> {
  let inv: Record<string, any> | undefined;
  try {
    inv = (await getDoc(doc(db, 'invites', code))).data();
  } catch (e) {
    if (isNetworkError(e)) throw new AppError(NETWORK_MSG, 'unavailable');
    inv = undefined;
  }
  // Kurallar başka şubenin davetini mağaza oturumuna hiç okutmaz (güvenlik
  // raporu K-2) ve süresi dolanı da okutmaz (sunucu saatiyle): ikisi de buraya
  // "kod yok" olarak düşer. Kodun var olup olmadığı ayırt edilemez; mesaj üç
  // durumu birlikte söyler.
  if (!inv) throw new AppError(INVITE_BAD, 'bad-code');
  if (inv.storeId !== storeId) throw new AppError('Bu davet başka bir mağaza için. Kendi mağazanın telefonunu kullan.', 'bad-code');
  return inv;
}

/** [Telefon] Davet kodu + yeni PIN. Oturum barista olarak açık kalır. */
async function redeemInvite(code: string, pin: string, storeId: string): Promise<void> {
  if (weakPin(pin)) {
    throw new AppError('Bu PIN çok kolay tahmin edilir, başka bir PIN seç.', 'weak-pin');
  }
  const inv = await checkInvite(code, storeId);
  await signInWithEmailAndPassword(auth, inv.email, invitePassword(code));
  await updatePassword(auth.currentUser!, pinPassword(inv.baristaId, pin));
  await updateDoc(doc(db, 'baristas', inv.baristaId), { pinPending: false });
  await deleteDoc(doc(db, 'invites', code));
  // Bu kişi için açılmış PIN sıfırlama talebi kod kullanılınca kapanır (H20).
  void closeOwnPinRequests(inv.baristaId).catch((e) => console.warn('[pin talebi]', e));
}

/** [Barista] Kendisi için açılmış, kodu verilmiş PIN sıfırlama taleplerini "çözüldü" yapar. */
async function closeOwnPinRequests(baristaId: string) {
  const snap = await getDocs(query(collection(db, 'requests'), where('subjectBaristaId', '==', baristaId)));
  const b = (await getDoc(doc(db, 'baristas', baristaId)).catch(() => null))?.data();
  const uid = auth.currentUser?.uid || '';
  const now = Date.now();
  for (const d of snap.docs) {
    const r = d.data();
    if (r.category !== 'personel' || ['done', 'rejected'].includes(r.status)) continue;
    await updateDoc(d.ref, {
      status: 'done', closedAt: now, updatedAt: now, lastSide: 'store', waitReason: null,
      notes: arrayUnion({ at: now, by: uid, byName: b?.name || '', side: 'store', status: 'done', text: 'Yeni davet koduyla giriş yapıldı; PIN belirlendi.' })
    }).catch((e) => console.warn('[pin talebi güncelle]', e));
  }
}

/**
 * [Telefon] Barista kendi PIN'ini değiştirir: önce eski PIN'le kimliğini
 * doğrular (başkası telefonda açık kalan oturumdan PIN'i değiştiremesin).
 */
async function changeOwnPin(baristaId: string, oldPin: string, newPin: string): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email) throw new AppError('Oturum bulunamadı. Çıkış yapıp yeniden gir.');
  if (oldPin === newPin) throw new AppError('Yeni PIN eskisiyle aynı olamaz.', 'weak-pin');
  if (weakPin(newPin)) throw new AppError('Bu PIN çok kolay tahmin edilir, başka bir PIN seç.', 'weak-pin');
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pinPassword(baristaId, oldPin)));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/too-many-requests') throw new AppError('Çok fazla hatalı deneme. Birkaç dakika sonra tekrar dene.', 'old-pin');
    if (code === 'auth/network-request-failed') throw new AppError('İnternet bağlantısı yok.', 'old-pin');
    throw new AppError('Eski PIN hatalı.', 'old-pin');
  }
  await updatePassword(user, pinPassword(baristaId, newPin));
}

/* ------------------------------------------------------------------ */
/* Yöneticiler                                                         */
/* ------------------------------------------------------------------ */

/**
 * İlk kurulum: hiç yönetici yoksa ilk hesabı uygulama geliştiricisi olarak açar.
 * config/bootstrap herkese açık bir "kurulum yapıldı" işaretidir; içine kimlik
 * yazılmaz (eskiden geliştiricinin uid'i duruyordu, güvenlik raporu K-3).
 * Kurallar işareti yalnızca aynı toplu yazımda kendini geliştirici yapan hesaba,
 * belge yokken bir kez yazdırır.
 */
async function bootstrapAdmin(name: string, email: string, password: string): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', cred.user.uid), { role: 'developer', name: name.trim(), email: email.trim(), active: true, createdAt: Date.now() });
  batch.set(doc(db, 'config', 'bootstrap'), { at: Date.now() });
  await batch.commit();
}

async function needsBootstrap(): Promise<boolean> {
  const snap = await getDoc(doc(db, 'config', 'bootstrap')).catch(() => null);
  return snap ? !snap.exists() : false;
}

/**
 * [Kahve Operasyon Direktörü] Ekibe yeni kişi; şifresini e-postadaki bağlantıyla
 * kendisi belirler. Hangi rolü verebileceğini kurallar ve roles.ts sınırlar.
 */
async function createStaff(name: string, email: string, role: StaffRole = 'regional'): Promise<void> {
  let uid: string;
  try {
    uid = await createAccount(email.trim(), randomToken(24));
  } catch (e) {
    // Bir hesabın tek rolü var (H27): aynı e-postayla ikinci hesap açılamaz.
    // Kişi ekipte görünüyorsa rolüyle birlikte söylenir; geliştirici hiç görünmez.
    if ((e as { code?: string }).code === 'auth/email-already-in-use') {
      const found = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim()), where('role', 'in', visibleStaffRoles((() => { const s = useSession.getState().session; return s.kind === 'staff' ? s.role : undefined; })())))).catch(() => null);
      const role0 = found?.docs[0]?.data().role as StaffRole | undefined;
      throw new AppError(role0
        ? `Bu kişi zaten ${STAFF_ROLE_LABEL[role0] || role0} olarak kayıtlı. Bir hesabın tek rolü olur; rolünü Ekip ekranından değiştirebilirsin.`
        : 'Bu e-posta ile zaten bir hesap var. Bir hesabın tek rolü olur: kişi ekipteyse rolünü Ekip ekranından değiştir.', 'email-already-in-use');
    }
    throw e;
  }
  await setDoc(doc(db, 'users', uid), { role, name: name.trim(), email: email.trim(), active: true, createdAt: Date.now() });
  auth.languageCode = 'tr';
  await sendPasswordResetEmail(auth, email.trim());
}

export const backend = {
  createPairingCode, pairDevice, deviceSignIn, revokeDevice,
  createBarista, resetBaristaPin, setBaristaActive, updateBarista, baristaSignIn, verifyPin, checkInvite, redeemInvite, changeOwnPin,
  bootstrapAdmin, needsBootstrap, createStaff
};

/** Kullanıcıya gösterilecek hata mesajı. */
export function errorText(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (e instanceof AppError) return e.message;
  if (isNetworkError(e)) return NETWORK_MSG;
  if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found') return 'E-posta veya şifre hatalı.';
  if (err?.code === 'auth/email-already-in-use') return 'Bu e-posta ile zaten bir hesap var.';
  if (err?.code === 'auth/weak-password') return 'Şifre en az 6 karakter olmalı.';
  if (err?.code === 'auth/invalid-email') return 'E-posta adresi geçersiz.';
  if (err?.code === 'auth/too-many-requests') return 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.';
  if (err?.code === 'auth/operation-not-allowed') return 'E-posta ile giriş Firebase konsolunda henüz açılmamış.';
  if (err?.code === 'auth/user-disabled') return 'Bu hesap kapatılmış.';
  if (err?.code === 'auth/internal-error') return 'Giriş şu an yapılamadı. Biraz sonra tekrar dene.';
  if (err?.code === 'permission-denied') return 'Bu işlem için yetkin yok.';
  // Firestore'un ham İngilizce mesajları ekrana çıkmasın.
  if (err?.code === 'resource-exhausted') return 'Günlük kullanım sınırına ulaşıldı. Biraz sonra tekrar dene.';
  if (err?.code === 'already-exists') return 'Bu kayıt zaten var. Sayfayı yenileyip tekrar bak.';
  if (err?.code === 'aborted' || err?.code === 'failed-precondition') return 'İşlem başka bir değişiklikle çakıştı. Tekrar dene.';
  if (err?.code === 'not-found') return 'Kayıt bulunamadı.';
  if (err?.code === 'invalid-argument') return 'Kayıt kaydedilemedi: içerik geçersiz ya da çok büyük.';
  if (err?.code === 'internal' || err?.code === 'unknown' || err?.code === 'cancelled') return 'Beklenmeyen bir hata oluştu. Tekrar dene.';
  return err?.message || 'Beklenmeyen bir hata oluştu.';
}
