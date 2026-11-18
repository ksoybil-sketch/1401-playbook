import { create } from 'zustand';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, onSnapshot, waitForPendingWrites } from 'firebase/firestore';
import { auth, db } from '../api/firebase';
import { AppError, backend, isNetworkError } from '../api/backend';
import { clearOfflinePins, rememberPin, verifyOfflinePin } from '../lib/offlineLogin';
import { syncServerClock } from '../lib/serverTime';
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
 *   closed   → mağaza pasif: telefon ve baristalar giriş yapamaz (H7)
 *
 * Çevrimdışı (H3, H17):
 *  - store.offline: bağlantı yok; mağaza ekranı önbellekten çalışır.
 *  - store.held: çıkış yapan baristanın gönderilmemiş işleri var ya da
 *    telefonun hesabına geçilemedi. Oturum (Firebase Auth) O BARİSTADA
 *    kalır, ekran mağaza ekranıdır; bağlantı gelince bekleyen yazımlar o
 *    kişinin adıyla gönderilir, sonra telefonun hesabına geçilir. Eskiden
 *    hesap hemen değişiyor, işler o kişi bu telefona yeniden girene kadar
 *    gitmiyordu.
 *  - barista.offline: çevrimdışı PIN girişi (lib/offlineLogin); salt okunur.
 */
/**
 * Evden ders çalışma kipi. Derslik kodundan girildiğinde işaretlenir;
 * barista kendi PIN'iyle girdikten sonra da sürsün diye tarayıcıda tutulur
 * (mağaza telefonundaki normal giriş bu işareti taşımaz). Çıkışta silinir.
 */
const DERSLIK_KEY = 'derslik.modu';
export const derslikModu = (): boolean => {
  try { return localStorage.getItem(DERSLIK_KEY) === '1'; } catch { return false; }
};
export const setDerslikModu = (on: boolean) => {
  try { on ? localStorage.setItem(DERSLIK_KEY, '1') : localStorage.removeItem(DERSLIK_KEY); } catch { /* gizli pencere */ }
};

export type Session =
  | { kind: 'loading' }
  | { kind: 'unpaired' }
  | { kind: 'offline' }
  | { kind: 'closed'; storeName: string }
  | { kind: 'store'; uid: string; storeId: string; storeName: string; offline?: boolean; held?: string }
  | { kind: 'barista'; uid: string; storeId: string; storeName: string; baristaId: string; name: string; role: BaristaRole; offline?: boolean;
      /** Evden ders çalışma girişi: yalnızca dersler ve reçeteler açılır (bkz. App.tsx). */
      derslik?: boolean }
  /** Derslik kodu girildi, barista henüz seçilmedi: yalnızca mağazanın listesi okunur. */
  | { kind: 'derslik'; uid: string; storeId: string; storeName: string }
  | { kind: 'staff'; uid: string; name: string; email: string; role: StaffRole; mustChangePassword?: boolean };

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
const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Bekleyen yazımlar ms içinde sunucuya gitti mi (bağlantı yoksa false). */
async function pendingFlushed(ms: number): Promise<boolean> {
  return Promise.race([waitForPendingWrites(db).then(() => true, () => false), sleep(ms).then(() => false)]);
}

/**
 * Çıkışta bekletilen hesap (bkz. Session store.held). Uygulama bu arada
 * kapanıp açılsa da o kişinin oturumu geri açılmasın, işleri gitsin diye
 * cihazda tutulur. İçinde yalnızca uid ve ad var.
 */
const HOLD_KEY = 'playbook.logoutHold.v1';
interface Hold { uid: string; name: string; at: number }
function readHold(): Hold | null {
  try { const v = JSON.parse(localStorage.getItem(HOLD_KEY) || 'null'); return v && typeof v.uid === 'string' ? v : null; } catch { return null; }
}
function writeHold(h: Hold | null) {
  try { if (h) localStorage.setItem(HOLD_KEY, JSON.stringify(h)); else localStorage.removeItem(HOLD_KEY); } catch { /* yok say */ }
}

/** Çevrimdışı girişteki barista ve PIN'i: yalnızca bellekte, bağlantı gelince gerçek giriş için. */
let offlineLogin: { barista: Barista; pin: string } | null = null;

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
function notify(text: string, tone: 'negative' | 'neutral' | 'positive' = 'negative') {
  import('../ui/kit').then((m) => m.toast(text, tone)).catch(() => {});
}

export const useSession = create<SessionState>((set, get) => {
  const storeSession = (device: StoredDevice, extra: { offline?: boolean; held?: string } = {}): Session => {
    const cur = get().session;
    const name = cur.kind === 'store' || cur.kind === 'barista' ? cur.storeName : device.storeName;
    return { kind: 'store', uid: device.uid, storeId: device.storeId, storeName: name || 'Mağaza', ...extra };
  };

  async function enterStoreMode(device: StoredDevice) {
    try {
      await backend.deviceSignIn(device);
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (BAD_CREDENTIAL.includes(code)) {
        // Hesap silinmiş / şifre geçersiz — telefon yeniden eşleştirilmeli.
        await clearDevice();
        clearOfflinePins();
        set({ device: null, session: { kind: 'unpaired' } });
      } else if (isNetworkError(e) || !isOnline()) {
        // Bağlantı yok: mağaza ekranı önbellekten açılır (reçeteler, çevrimdışı
        // PIN girişi; H17). Bağlantı gelince telefonun hesabıyla yeniden girilir.
        // Eskiden "Sunucuya ulaşılamadı" ekranında kimse bir şey yapamıyordu.
        set({ session: storeSession(device, { offline: true }) });
        startReconnect();
      } else {
        // "Çok fazla deneme", Firebase iç hatası…: eşleşme silinmez, "Bağlantı
        // yok" ekranından yeniden denenir.
        set({ session: { kind: 'offline' } });
      }
    }
  }

  /* --- Yeniden bağlanma (bekletilen çıkış, çevrimdışı giriş) -------------- */
  let reconnectTimer: ReturnType<typeof setInterval> | null = null;
  let reconnecting = false;
  function startReconnect() {
    if (reconnectTimer || typeof window === 'undefined') return;
    reconnectTimer = setInterval(() => void tryReconnect(), 15_000);
    window.addEventListener('online', onOnline);
  }
  function stopReconnect() {
    if (reconnectTimer) clearInterval(reconnectTimer);
    reconnectTimer = null;
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
  }
  const onOnline = () => { setTimeout(() => void tryReconnect(), 500); };

  async function tryReconnect() {
    if (reconnecting || !isOnline()) return;
    reconnecting = true;
    try {
      const s = get().session;
      const device = get().device;
      const hold = readHold();
      const holding = !!hold && auth.currentUser?.uid === hold.uid;
      // Önce bekletilen kişinin işleri, onun adıyla gitsin.
      if (holding && !(await pendingFlushed(8000))) return;
      if (s.kind === 'barista' && s.offline && offlineLogin) {
        const { barista, pin } = offlineLogin;
        try {
          await backend.baristaSignIn(barista, pin);
          offlineLogin = null;
          writeHold(null);
          stopReconnect();
          notify('Bağlantı geldi; tam girişe geçildi.', 'positive');
        } catch (e) {
          if (isNetworkError(e)) return;
          offlineLogin = null;
          if (device) set({ session: storeSession(device, { held: holding ? hold!.name : undefined }) });
          notify('Bağlantı geldi. PIN\'inle yeniden giriş yap.');
        }
        return;
      }
      if (device && (holding || (s.kind === 'store' && s.offline))) {
        try {
          await backend.deviceSignIn(device);
          writeHold(null);
          stopReconnect();
          // Hesap değiştiyse onAuthStateChanged telefonun hesabını çözer (store
          // oturumu). Oturumsuz çevrimdışı açılıştan gelindiyse de aynı.
        } catch { /* sonra yine denenir */ }
        return;
      }
      if (!holding) { writeHold(null); stopReconnect(); }
    } finally {
      reconnecting = false;
    }
  }

  /* --- Mağazanın açık/pasif durumu (H7) ----------------------------------- */
  let stopStoreWatch: (() => void) | null = null;
  function watchStore(storeId: string, uid: string) {
    stopStoreWatch?.();
    stopStoreWatch = onSnapshot(doc(db, 'stores', storeId), (snap) => {
      if (snap.metadata.fromCache || auth.currentUser?.uid !== uid) return;
      if (snap.data()?.active === false) {
        stopStoreWatch?.();
        stopStoreWatch = null;
        void closeStore(storeId, snap.data()?.name || 'Mağaza');
      }
    }, () => { /* oturum değişirken izin hatası: yok say */ });
  }
  /** Mağaza pasif: barista açıksa telefonun hesabına dön, ekran "mağaza pasif". */
  async function closeStore(storeId: string, name: string) {
    const device = get().device;
    const cur = auth.currentUser;
    if (device && cur && cur.uid !== device.uid) {
      try { await backend.deviceSignIn(device); } catch { await signOut(auth).catch(() => {}); }
    }
    set({ session: { kind: 'closed', storeName: name } });
    watchReopen(storeId);
  }
  /** Pasif mağaza yeniden açılınca telefon kendiliğinden mağaza ekranına döner. */
  function watchReopen(storeId: string) {
    stopStoreWatch?.();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    stopStoreWatch = onSnapshot(doc(db, 'stores', storeId), (snap) => {
      if (snap.metadata.fromCache || auth.currentUser?.uid !== uid || get().session.kind !== 'closed') return;
      if (snap.exists() && snap.data()?.active !== false) {
        stopStoreWatch?.();
        stopStoreWatch = null;
        void get().retry();
      }
    }, () => {});
  }
  /** Mağaza belgesi: pasifse null değil, false döner. */
  async function storeIsOpen(storeId: string): Promise<{ open: boolean; name: string }> {
    const snap = await getDoc(doc(db, 'stores', storeId)).catch(() => null);
    return { open: snap?.data()?.active !== false, name: snap?.data()?.name || 'Mağaza' };
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
        return;
      }
      // Geçici şifre değiştirilince zorunlu ekran kalkar (başka sekmede de).
      const cur = get().session;
      if (cur.kind === 'staff' && cur.uid === uid && !!cur.mustChangePassword !== (snap.data()?.mustChangePassword === true)) {
        set({ session: { ...cur, mustChangePassword: snap.data()?.mustChangePassword === true || undefined } });
      }
    }, () => { /* oturum kapanırken izin hatası: yok say */ });
  }

  async function resolveUser(user: User) {
    // Çıkışta bekletilen hesap: o kişinin oturumu geri açılmaz, mağaza ekranı (H3).
    const hold = readHold();
    const device = get().device;
    if (hold && device && hold.uid === user.uid && user.uid !== device.uid) {
      set({ session: storeSession(device, { held: hold.name, offline: !isOnline() }) });
      startReconnect();
      void tryReconnect();
      return;
    }
    if (hold && hold.uid !== user.uid) writeHold(null);
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
    // Sunucu saati (sınav ve kod süreleri; arka planda, beklenmez).
    void syncServerClock();

    if (STAFF_ROLES.includes(profile.role as StaffRole)) {
      set({ session: { kind: 'staff', uid: user.uid, role: profile.role as StaffRole, name: profile.name || user.email || 'Yönetici', email: user.email || '', mustChangePassword: profile.mustChangePassword === true || undefined } });
      return;
    }
    if (profile.role === 'store') {
      // Mağaza adı her zaman Firestore'dan okunur (önbellekteki device.storeName ile
      // yarışa girmemek için — telefon eşleştirildikten hemen sonra iki ayrı
      // oturum çözümlemesi aynı anda tetiklenebilir).
      const st = await storeIsOpen(profile.storeId!);
      if (!st.open) { set({ session: { kind: 'closed', storeName: st.name } }); watchReopen(profile.storeId!); return; }
      watchStore(profile.storeId!, user.uid);
      set({ session: { kind: 'store', uid: user.uid, storeId: profile.storeId!, storeName: st.name, offline: !isOnline() || undefined } });
      if (!isOnline()) startReconnect();
      return;
    }
    if (profile.role === 'derslik') {
      const st = await storeIsOpen(profile.storeId!);
      if (!st.open) { set({ session: { kind: 'closed', storeName: st.name } }); watchReopen(profile.storeId!); return; }
      set({ session: { kind: 'derslik', uid: user.uid, storeId: profile.storeId!, storeName: st.name } });
      return;
    }
    if (BARISTA_ROLES.includes(profile.role as BaristaRole)) {
      const [b, st] = await Promise.all([
        getDoc(doc(db, 'baristas', profile.baristaId!)).catch(() => null),
        storeIsOpen(profile.storeId!)
      ]);
      if (!st.open) { await closeStore(profile.storeId!, st.name); return; }
      watchStore(profile.storeId!, user.uid);
      const name = st.name;
      set({
        session: {
          kind: 'barista', uid: user.uid, storeId: profile.storeId!, storeName: name,
          baristaId: profile.baristaId!, role: profile.role as BaristaRole, name: b?.data()?.name || 'Barista',
          derslik: derslikModu() || undefined
        }
      });
      return;
    }
    await signOut(auth);
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
        stopStoreWatch?.();
        stopStoreWatch = null;
        const device = get().device;
        if (device) {
          set({ session: { kind: 'loading' } });
          await enterStoreMode(device);
        } else {
          set({ session: { kind: 'unpaired' } });
        }
      });
      return () => { unsub(); stopWatch?.(); stopWatch = null; stopStoreWatch?.(); stopStoreWatch = null; stopReconnect(); };
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

    /**
     * PIN girişi. Bağlantı yoksa (H17) bu telefonda daha önce girmiş barista
     * için yerel PIN özetiyle salt okunur çevrimdışı oturum açılır.
     */
    baristaLogin: async (barista, pin) => {
      const device = get().device;
      // Bekletilen çıkış: önceki kişinin işleri onun adıyla gitsin, sonra hesap değişsin.
      const hold = readHold();
      if (hold && auth.currentUser?.uid === hold.uid) await pendingFlushed(4000);
      try {
        await backend.baristaSignIn(barista, pin);
        writeHold(null);
        offlineLogin = null;
        // Sonraki çevrimdışı giriş için PIN özeti (yalnızca eşleşmiş mağaza telefonunda).
        if (device && barista.storeId === device.storeId) void rememberPin(barista, pin, device.password).catch(() => {});
      } catch (e) {
        if (!device || !isNetworkError(e)) throw e;
        const r = await verifyOfflinePin(barista, pin, device.password);
        if (r === 'none') throw new AppError('İnternet bağlantısı yok. Bu telefonda daha önce internetle giriş yapmadığın için çevrimdışı giriş açılamıyor.');
        if (r === 'wrong') throw new AppError('PIN hatalı.');
        if (typeof r === 'object') throw new AppError(`Çok fazla hatalı deneme. ${Math.ceil((r.lockedUntil - Date.now()) / 60000)} dakika sonra tekrar dene.`);
        offlineLogin = { barista, pin };
        const cur = get().session;
        set({
          session: {
            kind: 'barista', uid: device.uid, storeId: device.storeId, storeName: cur.kind === 'store' ? cur.storeName : device.storeName,
            baristaId: barista.id, name: barista.name, role: barista.role, offline: true
          }
        });
        startReconnect();
      }
    },

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
      const s = get().session;
      // Geri tuşu bir önceki kişinin ekranlarına dönmesin.
      resetBackHistory();
      // Çevrimdışı girişten çıkış: hesap zaten değişmedi, mağaza ekranına dön.
      if (s.kind === 'barista' && s.offline && device) {
        offlineLogin = null;
        const hold = readHold();
        set({ session: storeSession(device, { offline: !isOnline() || undefined, held: hold && auth.currentUser?.uid === hold.uid ? hold.name : undefined }) });
        return;
      }
      const cur = auth.currentUser;
      if (device && cur && cur.uid !== device.uid) {
        // Barista çıkışı (H3): bekleyen yazımlar (çevrimdışı tamamlanan ders,
        // talep…) o kişinin hesabıyla gitmeli. Gitmediyse ya da telefonun
        // hesabına geçilemiyorsa oturum o kişide bekletilir, ekran mağaza ekranı olur.
        const barista = s.kind === 'barista';
        const flushed = await pendingFlushed(barista ? 3000 : 1500);
        if (flushed || !barista) {
          try { await backend.deviceSignIn(device); return; } catch (e) {
            if (!barista || !isNetworkError(e)) { await signOut(auth); return; }
          }
        }
        writeHold({ uid: cur.uid, name: s.kind === 'barista' ? s.name : '', at: Date.now() });
        stopWatch?.(); stopWatch = null;
        stopStoreWatch?.(); stopStoreWatch = null;
        set({ session: storeSession(device, { offline: !isOnline() || undefined, held: s.kind === 'barista' ? s.name : '' }) });
        notify(flushed
          ? 'Bağlantı yok: mağaza ekranına geçildi. Bağlantı gelince telefon kendiliğinden bağlanır.'
          : 'Gönderilmemiş işlerin var. Bağlantı gelince bu telefondan kendiliğinden gönderilecek; uygulamayı silme.', 'neutral');
        startReconnect();
        return;
      }
      await signOut(auth);
    },

    unpair: async () => {
      await clearDevice();
      clearOfflinePins();
      writeHold(null);
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
