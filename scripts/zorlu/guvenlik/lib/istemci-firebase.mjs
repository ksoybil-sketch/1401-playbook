/** src/api/firebase.ts yerine: istemci başına ayrı, emülatöre bağlı Firebase örneği. */
import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const C = new URL(import.meta.url).searchParams.get('c') || '0';
const config = { apiKey: 'demo-key', projectId: 'demo-guvenlik', authDomain: 'demo-playbook.firebaseapp.com', appId: 'demo' };
export const USE_EMULATOR = true;
export const FS_TRANSPORT = 'auto';
export const IS_NATIVE = false;
export const app = initializeApp(config, `c-${C}`);
export const auth = initializeAuth(app, { persistence: inMemoryPersistence });
connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
export const db = initializeFirestore(app, {});
connectFirestoreEmulator(db, '127.0.0.1', 8180);
let secondary = null;
export function secondaryAuth() {
  if (!secondary) {
    const a = initializeApp(config, `c-${C}-ikinci`);
    secondary = initializeAuth(a, { persistence: inMemoryPersistence });
    connectAuthEmulator(secondary, 'http://127.0.0.1:9199', { disableWarnings: true });
  }
  return secondary;
}
