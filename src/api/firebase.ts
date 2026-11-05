import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, initializeAuth, inMemoryPersistence, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

/**
 * Geliştirmede (`npm run dev:emu`) her şey bilgisayardaki Firebase
 * emülatörüne gider. Yayında yapılandırma .env.production'dan okunur.
 *
 * Spark (ücretsiz) planı: yalnızca Authentication + Firestore + Hosting
 * kullanılır. Cloud Functions ve Storage yok — bkz. blaze/README.md.
 */
export const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === 'true';

const config = USE_EMULATOR
  ? { apiKey: 'demo-key', projectId: 'demo-playbook', authDomain: 'demo-playbook.firebaseapp.com', appId: 'demo' }
  : {
      apiKey: import.meta.env.VITE_FB_API_KEY,
      authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FB_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
      appId: import.meta.env.VITE_FB_APP_ID
    };

const EMU_HOST = import.meta.env.VITE_EMULATOR_HOST || location.hostname || 'localhost';

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

if (USE_EMULATOR) {
  connectAuthEmulator(auth, `http://${EMU_HOST}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMU_HOST, 8080);
}

/**
 * Yöneticinin oturumunu bozmadan başka bir hesap (mağaza telefonu,
 * barista, yeni yönetici) oluşturmak için ikinci, bellekte yaşayan bir
 * Firebase örneği. Sunucu (Admin SDK) olmadığı için hesaplar böyle açılır.
 */
let secondary: { app: FirebaseApp; auth: Auth } | null = null;
export function secondaryAuth(): Auth {
  if (!secondary) {
    const a = initializeApp(config, 'secondary');
    const au = initializeAuth(a, { persistence: inMemoryPersistence });
    if (USE_EMULATOR) connectAuthEmulator(au, `http://${EMU_HOST}:9099`, { disableWarnings: true });
    secondary = { app: a, auth: au };
  }
  return secondary.auth;
}
