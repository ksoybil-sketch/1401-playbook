// Ortak yardımcılar: kendi emülatörümüz (8180/9199), demo-guvenlik projesi.
export const FS_PORT = 8180, AUTH_PORT = 9199, HOST = '127.0.0.1', PROJECT = 'demo-guvenlik';
process.env.FIRESTORE_EMULATOR_HOST = `${HOST}:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `${HOST}:${AUTH_PORT}`;
import { initializeApp as adminInit, getApps } from 'firebase-admin/app';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { getAuth as adminAuthF } from 'firebase-admin/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, memoryLocalCache, terminate } from 'firebase/firestore';

if (!getApps().length) adminInit({ projectId: PROJECT });
export const adb = adminFs();
export const aauth = adminAuthF();

const cfg = { apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com`, appId: 'demo' };
let n = 0;
/** Ayrı bir istemci (kendi Auth + Firestore örneği). email verilirse oturum açar. */
export async function client(email, password) {
  const app = initializeApp(cfg, `c${++n}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:${AUTH_PORT}`, { disableWarnings: true });
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, HOST, FS_PORT);
  if (email) await signInWithEmailAndPassword(auth, email, password);
  return { app, auth, db, close: async () => { await terminate(db).catch(() => {}); await deleteApp(app).catch(() => {}); } };
}
export { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut };

/** Bir işlemi dener: { ok, code, ms, value } */
export async function attempt(fn) {
  const t = performance.now();
  try { const value = await fn(); return { ok: true, ms: Math.round(performance.now() - t), value }; }
  catch (e) { return { ok: false, code: e.code || e.message, ms: Math.round(performance.now() - t) }; }
}
