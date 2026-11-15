// Zorlu senaryo Bölüm 3-4 — ortak yönetici (Admin SDK) yardımcıları. YALNIZCA yerel emülatör.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp, getApps } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { getAuth } = await import('firebase-admin/auth');
if (!getApps().length) initializeApp({ projectId: 'demo-playbook' });
export const db = getFirestore();
export const auth = getAuth();
export const DAY = 86400000;
/** İstanbul saatiyle (UTC+3) "YYYY-AA-GGTSS:DD" → ms */
export const ist = (s) => Date.parse(s + ':00+03:00');
const DOMAIN = 'hesap.playbook1401.app';
/** Bir mağaza için eşleşmiş telefon hesabı (yoksa açar). */
export async function device(storeId, storeName) {
  const email = `tel-${storeId}-hayat@${DOMAIN}`, password = 'test-cihaz-' + storeId;
  let u; try { u = await auth.getUserByEmail(email); } catch { u = await auth.createUser({ email, password }); }
  await db.doc(`users/${u.uid}`).set({ role: 'store', storeId, active: true, paired: true, label: 'Mağaza telefonu', createdAt: Date.now(), lastSeenAt: Date.now() });
  return { uid: u.uid, email, password, storeId, storeName };
}
export async function task(id, storeId, kind, targetId, title, dueAt, baristaId = null) {
  await db.doc('assignments/' + id).set({ kind, targetId, title, storeId, baristaId, dueAt, createdAt: Date.now() - 3 * DAY, createdBy: 'test', createdByName: 'Test' });
}
