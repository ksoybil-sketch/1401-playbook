import { create } from 'zustand';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../api/firebase';
import { backend } from '../api/backend';
import { loadDevice, saveDevice, clearDevice, type StoredDevice } from '../api/device';
import type { Barista, BaristaRole, Profile, StaffRole } from '../../shared/types';
import { STAFF_ROLES, BARISTA_ROLES } from '../lib/roles';

/**
 * Oturum durumu — uygulamanın hangi ekran setini göstereceğini belirler.
 *
 *   unpaired → telefon henüz bir mağazaya bağlı değil (ya da bilgisayardan web paneli)
 *   store    → mağaza telefonu, barista seçme ekranı
 *   barista  → PIN ile giriş yapmış barista / mağaza sorumlusu
 *   staff    → Kahve Operasyonu yöneticisi
 *   offline  → cihaz kayıtlı ama sunucuya ulaşılamadı
 */
export type Session =
  | { kind: 'loading' }
  | { kind: 'unpaired' }
  | { kind: 'offline' }
  | { kind: 'store'; uid: string; storeId: string; storeName: string }
  | { kind: 'barista'; uid: string; storeId: string; storeName: string; baristaId: string; name: string; role: BaristaRole }
  | { kind: 'staff'; uid: string; name: string; email: string; role: StaffRole };

interface SessionState {
  session: Session;
  device: StoredDevice | null;
  boot: () => () => void;
  pair: (code: string) => Promise<void>;
  baristaLogin: (barista: Barista, pin: string) => Promise<void>;
  redeemInvite: (code: string, pin: string) => Promise<void>;
  staffLogin: (email: string, password: string) => Promise<void>;
  staffResetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  unpair: () => Promise<void>;
  retry: () => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Profil belgesini okur; hesap yeni açıldıysa (yazma henüz bitmediyse) kısa süre bekler. */
async function readProfile(uid: string): Promise<Profile | null> {
  for (let i = 0; i < 6; i++) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) return { id: snap.id, ...snap.data() } as Profile;
    } catch {
      /* izin yok ya da çevrimdışı — tekrar dene */
    }
    await sleep(400);
  }
  return null;
}

export const useSession = create<SessionState>((set, get) => {
  async function enterStoreMode(device: StoredDevice) {
    try {
      await backend.deviceSignIn(device);
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (code === 'auth/network-request-failed') {
        set({ session: { kind: 'offline' } });
      } else {
        // Hesap silinmiş / şifre geçersiz — telefon yeniden eşleştirilmeli.
        await clearDevice();
        set({ device: null, session: { kind: 'unpaired' } });
      }
    }
  }

  async function resolveUser(user: User) {
    const profile = await readProfile(user.uid);
    const device = get().device;

    if (!profile || !profile.active) {
      // Pasifleştirilmiş hesap. Bu telefonun kendi hesabıysa bağlantı kaldırılmıştır.
      if (device && device.uid === user.uid) {
        await clearDevice();
        set({ device: null });
      }
      await signOut(auth);
      return;
    }

    if (STAFF_ROLES.includes(profile.role as StaffRole)) {
      set({ session: { kind: 'staff', uid: user.uid, role: profile.role as StaffRole, name: profile.name || user.email || 'Yönetici', email: user.email || '' } });
      return;
    }
    if (profile.role === 'store') {
      // Mağaza adı her zaman Firestore'dan okunur (önbellekteki device.storeName ile
      // yarışa girmemek için — telefon eşleştirildikten hemen sonra iki ayrı
      // oturum çözümlemesi aynı anda tetiklenebilir).
      const name = await storeName(profile.storeId!);
      set({ session: { kind: 'store', uid: user.uid, storeId: profile.storeId!, storeName: name } });
      return;
    }
    if (BARISTA_ROLES.includes(profile.role as BaristaRole)) {
      const [b, name] = await Promise.all([
        getDoc(doc(db, 'baristas', profile.baristaId!)).catch(() => null),
        storeName(profile.storeId!)
      ]);
      set({
        session: {
          kind: 'barista', uid: user.uid, storeId: profile.storeId!, storeName: name,
          baristaId: profile.baristaId!, role: profile.role as BaristaRole, name: b?.data()?.name || 'Barista'
        }
      });
      return;
    }
    await signOut(auth);
  }

  async function storeName(storeId: string): Promise<string> {
    const snap = await getDoc(doc(db, 'stores', storeId)).catch(() => null);
    return snap?.data()?.name || 'Mağaza';
  }

  return {
    session: { kind: 'loading' },
    device: null,

    boot: () => {
      let started = false;
      return onAuthStateChanged(auth, async (user) => {
        if (!started) {
          started = true;
          set({ device: await loadDevice() });
        }
        if (user) {
          set({ session: { kind: 'loading' } });
          await resolveUser(user);
          return;
        }
        const device = get().device;
        if (device) {
          set({ session: { kind: 'loading' } });
          await enterStoreMode(device);
        } else {
          set({ session: { kind: 'unpaired' } });
        }
      });
    },

    pair: async (code) => {
      const label = navigator.userAgent.includes('Android') ? 'Android telefon' : 'Tarayıcı';
      const device = await backend.pairDevice(code, label);
      await saveDevice(device);
      set({ device });
      // backend.pairDevice() içinde oturum zaten açıldı; onAuthStateChanged
      // bunu yakalayıp resolveUser'ı kendi çağırır — burada tekrar
      // çağırmak iki eşzamanlı çözümleme arasında yarışa yol açardı.
    },

    baristaLogin: (barista, pin) => backend.baristaSignIn(barista, pin),

    redeemInvite: async (code, pin) => {
      const s = get().session;
      if (s.kind !== 'store') throw new Error('Bu telefon bir mağazaya bağlı değil.');
      await backend.redeemInvite(code, pin, s.storeId);
    },

    staffLogin: async (email, password) => {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },

    staffResetPassword: async (email) => {
      auth.languageCode = 'tr';
      await sendPasswordResetEmail(auth, email.trim());
    },

    /** Barista ya da yönetici çıkışı. Telefon kayıtlıysa mağaza moduna döner. */
    logout: async () => {
      await signOut(auth);
    },

    unpair: async () => {
      await clearDevice();
      set({ device: null });
      await signOut(auth);
      set({ session: { kind: 'unpaired' } });
    },

    retry: async () => {
      const device = get().device;
      if (device) {
        set({ session: { kind: 'loading' } });
        await enterStoreMode(device);
      }
    }
  };
});
