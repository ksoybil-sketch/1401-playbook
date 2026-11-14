import { create } from 'zustand';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../api/firebase';
import { backend } from '../api/backend';
import { loadDevice, saveDevice, clearDevice, type StoredDevice } from '../api/device';
import type { Barista, BaristaRole, Profile, StaffRole } from '../../shared/types';
import { STAFF_ROLES, BARISTA_ROLES } from '../lib/roles';
import { resetBackHistory } from '../lib/backButton';

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
  /**
   * Oturumsuz bir aradan (çıkış, hesap değişimi sırasında boşluk) sonraki
   * her girişte artar. İçerik dinleyicileri (App.tsx) yalnızca bu değişince
   * yeniden kurulur: oturumsuz anda kurallar reddettiği için dinleyiciler
   * kapanmış olur. Barista girişi/çıkışı hesabı doğrudan değiştirdiği için
   * (arada oturumsuz an yok) 96 dersin dinleyicisi baştan kurulmaz.
   */
  authEpoch: number;
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

/**
 * Profil okumasının sonucu. "Pasif" ve "yok" yalnızca SUNUCUDAN doğrulanınca
 * döner: önbellekten gelen ya da okunamayan profil eskiden "pasif hesap"
 * sayılıyor, oturum kapanıyor ve mağaza telefonunun eşleşmesi siliniyordu
 * (zayıf bağlantıda "Failed to get document because the client is offline").
 */
type ProfileRead =
  | { kind: 'ok'; profile: Profile }
  | { kind: 'inactive' }
  | { kind: 'missing' }
  | { kind: 'error' };

/** Profil belgesini okur; hesap yeni açıldıysa (yazma henüz bitmediyse) kısa süre bekler. */
async function readProfile(uid: string): Promise<ProfileRead> {
  const ref = doc(db, 'users', uid);
  let sawCacheOnly = false;
  for (let i = 0; i < 6; i++) {
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const profile = { id: snap.id, ...snap.data() } as Profile;
        if (profile.active) return { kind: 'ok', profile };
        if (!snap.metadata.fromCache) return { kind: 'inactive' };
        sawCacheOnly = true;
      } else if (snap.metadata.fromCache) {
        sawCacheOnly = true;
      }
      // Sunucu "belge yok" dedi: hesap yeni açıldıysa yazma birazdan gelir.
    } catch {
      /* çevrimdışı ya da geçici hata — tekrar dene */
      sawCacheOnly = true;
    }
    await sleep(400);
  }
  // Son karar sunucudan: önbellekteki "pasif/yok" ile oturum kapatılmaz.
  try {
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return { kind: 'missing' };
    const profile = { id: snap.id, ...snap.data() } as Profile;
    return profile.active ? { kind: 'ok', profile } : { kind: 'inactive' };
  } catch {
    return sawCacheOnly ? { kind: 'error' } : { kind: 'missing' };
  }
}

/** Kimlik bilgisi gerçekten geçersiz (eşleşme silinmeli) mi? Ağ/zaman aşımı/iç hata değil. */
const BAD_CREDENTIAL = ['auth/invalid-credential', 'auth/user-not-found', 'auth/user-disabled', 'auth/wrong-password', 'auth/invalid-email'];

/** Kısa bildirim (ui/kit yalnızca gerektiğinde yüklenir; bu dosya node testlerinde de çalışır). */
function notify(text: string) {
  import('../ui/kit').then((m) => m.toast(text, 'negative')).catch(() => {});
}

export const useSession = create<SessionState>((set, get) => {
  async function enterStoreMode(device: StoredDevice) {
    try {
      await backend.deviceSignIn(device);
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (BAD_CREDENTIAL.includes(code)) {
        // Hesap silinmiş / şifre geçersiz — telefon yeniden eşleştirilmeli.
        await clearDevice();
        set({ device: null, session: { kind: 'unpaired' } });
      } else {
        // Ağ, zaman aşımı, "çok fazla deneme", Firebase iç hatası…: eşleşme
        // silinmez, "Bağlantı yok" ekranından yeniden denenir. Eskiden her
        // barista çıkışında küçük bir ağ aksaklığı telefonu kullanılamaz yapıyordu.
        set({ session: { kind: 'offline' } });
      }
    }
  }

  /** Hesap pasif ya da silinmiş (sunucudan doğrulandı): oturumu kapat. */
  async function dropAccount(uid: string) {
    const device = get().device;
    if (device && device.uid === uid) {
      // Bu telefonun kendi hesabı: bağlantısı kaldırılmış.
      await clearDevice();
      set({ device: null });
      notify('Bu telefonun mağaza bağlantısı kaldırıldı.');
    } else {
      notify('Erişimin kaldırıldı. Sorun olduğunu düşünüyorsan yöneticine danış.');
    }
    if (auth.currentUser?.uid === uid) await signOut(auth);
  }

  /**
   * Oturum açıkken kendi users/{uid} belgesini dinler: hesap pasifleşince
   * (ekipten kaldırma, telefon bağlantısını kaldırma, PIN sıfırlama, barista
   * pasifleştirme) açık oturum da nazikçe kapanır. Kurallar zaten her şeyi
   * reddeder; bu yalnızca ekranın boşa düşmemesi için.
   */
  let stopWatch: (() => void) | null = null;
  function watchProfile(uid: string) {
    stopWatch?.();
    stopWatch = onSnapshot(doc(db, 'users', uid), { includeMetadataChanges: false }, (snap) => {
      if (snap.metadata.fromCache || auth.currentUser?.uid !== uid) return;
      if (!snap.exists() || snap.data()?.active !== true) {
        stopWatch?.();
        stopWatch = null;
        void dropAccount(uid);
      }
    }, () => { /* oturum kapanırken izin hatası: yok say */ });
  }

  async function resolveUser(user: User) {
    const read = await readProfile(user.uid);
    if (auth.currentUser?.uid !== user.uid) return; // bu arada başka hesaba geçildi

    if (read.kind === 'inactive' || read.kind === 'missing') {
      await dropAccount(user.uid);
      return;
    }
    if (read.kind === 'error') {
      // Profil okunamadı (bağlantı yok): oturum ve eşleşme korunur, yeniden denenir.
      set({ session: { kind: 'offline' } });
      return;
    }
    const profile = read.profile;
    watchProfile(user.uid);

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
    authEpoch: 0,

    boot: () => {
      let started = false;
      let hadUser = false;
      const unsub = onAuthStateChanged(auth, async (user) => {
        // Oturumsuz bir aradan sonra ilk giriş: içerik dinleyicileri yeniden
        // kurulsun (bkz. authEpoch). Senkron hesaplanır: aşağıdaki await
        // sırasında gelen olaylar sırayı bozmasın.
        if (user && !hadUser) set({ authEpoch: get().authEpoch + 1 });
        hadUser = !!user;
        if (!started) {
          started = true;
          set({ device: await loadDevice() });
        }
        if ((user?.uid ?? null) !== (auth.currentUser?.uid ?? null)) return; // bu arada yeni olay geldi
        if (user) {
          set({ session: { kind: 'loading' } });
          await resolveUser(user);
          return;
        }
        stopWatch?.();
        stopWatch = null;
        const device = get().device;
        if (device) {
          set({ session: { kind: 'loading' } });
          await enterStoreMode(device);
        } else {
          set({ session: { kind: 'unpaired' } });
        }
      });
      return () => { unsub(); stopWatch?.(); stopWatch = null; };
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

    /**
     * Barista ya da yönetici çıkışı. Telefon kayıtlıysa mağaza moduna döner:
     * önce oturumu kapatmadan doğrudan telefonun hesabına geçilir. Arada
     * oturumsuz an olmadığı için içerik dinleyicileri (96 ders) kapanıp
     * yeniden okunmaz. Geçilemezse (ağ yok vb.) eski yol: çıkış + mağaza modu.
     */
    logout: async () => {
      const device = get().device;
      const cur = auth.currentUser;
      let switched = false;
      if (device && cur && cur.uid !== device.uid) {
        try { await backend.deviceSignIn(device); switched = true; } catch { /* aşağıda normal çıkış */ }
      }
      if (!switched) await signOut(auth);
      // Geri tuşu bir önceki kişinin ekranlarına dönmesin.
      resetBackHistory();
    },

    unpair: async () => {
      await clearDevice();
      set({ device: null });
      await signOut(auth);
      set({ session: { kind: 'unpaired' } });
      resetBackHistory();
    },

    retry: async () => {
      // Oturum açık ama profil okunamamıştı: aynı hesapla yeniden dene.
      const user = auth.currentUser;
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
    }
  };
});
