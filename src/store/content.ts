import { create } from 'zustand';
import { collection, getCountFromServer, getDocs, getDocsFromCache, onSnapshot, query, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../api/firebase';
import type { Track, Module, Lesson, Store } from '../../shared/types';

/**
 * Eğitim içeriği (yollar, modüller, dersler) ve mağaza listesi küçük ve
 * herkesin okuduğu veriler — oturum açılınca bir kez abone olunur, tüm
 * ekranlar buradan okur. Firestore'un yerel önbelleği sayesinde internet
 * yokken de dersler açılır.
 *
 * Dersler (~100 belge, görseller içinde; ~1 MB) mağaza telefonunda "fark"
 * yöntemiyle tutulur (mode 'delta', zorlu senaryo H4): her barista girişi
 * Firestore'un izleme akışını yeni hesapla yeniden kuruyor, bütün derslerin
 * dinleyicisi de baştan gönderiliyordu (yavaş 3G'de giriş başına ~1 MB, 23 sn).
 * Şimdi:
 *  - dersler cihazın önbelleğinden okunur (0 okuma);
 *  - sunucudaki ders sayısı sayılır (1 okuma). Tutmazsa (ders eklendi/silindi,
 *    önbellek temizlendi) ya da son tam okumadan 24 saat geçtiyse bütün dersler
 *    bir kez sunucudan okunur;
 *  - canlı dinleyici yalnızca `updatedAt` son görülenden yeni dersleri izler
 *    (bütün içerik yazımları updatedAt işler: changes.ts, publishCurriculum.ts).
 *    Hesap değişip akış yeniden kurulunca yalnızca bu küçük sorgu yeniden gelir;
 *  - silinen ders: sayı 30 dakikada bir yeniden sayılır, tutmazsa tam okuma.
 * Panel (mode 'live') bütün dersleri canlı dinlemeye devam eder: düzenleme,
 * silme ve sıralama anında görünsün.
 */
interface ContentState {
  ready: boolean;
  tracks: Track[];
  modules: Module[];
  lessons: Lesson[];
  stores: Store[];
  subscribe: (mode?: 'live' | 'delta') => () => void;
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
const asLesson = (d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() }) as Lesson;

const FULL_KEY = 'playbook.lessonsFull.v1';
const FULL_TTL_MS = 24 * 60 * 60 * 1000;
const RECOUNT_MS = 30 * 60 * 1000;
function lastFull(): number {
  try { return Number(localStorage.getItem(FULL_KEY)) || 0; } catch { return 0; }
}
function markFull() {
  try { localStorage.setItem(FULL_KEY, String(Date.now())); } catch { /* yok say */ }
}

export const useContent = create<ContentState>((set) => ({
  ready: false,
  tracks: [],
  modules: [],
  lessons: [],
  stores: [],
  subscribe: (mode = 'live') => {
    const loaded = new Set<string>();
    const mark = (k: string) => {
      loaded.add(k);
      if (loaded.size === 4) set({ ready: true });
    };
    let stopped = false;
    const unsubs = [
      onSnapshot(collection(db, 'tracks'), (s) => {
        set({ tracks: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Track).sort(byOrder) });
        mark('t');
      }, () => mark('t')),
      onSnapshot(collection(db, 'modules'), (s) => {
        set({ modules: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Module).sort(byOrder) });
        mark('m');
      }, () => mark('m')),
      onSnapshot(collection(db, 'stores'), (s) => {
        set({ stores: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Store).sort((a, b) => a.name.localeCompare(b.name, 'tr')) });
        mark('s');
      }, () => mark('s'))
    ];

    if (mode === 'live') {
      unsubs.push(onSnapshot(collection(db, 'lessons'), (s) => {
        set({ lessons: s.docs.map(asLesson).sort(byOrder) });
        mark('l');
      }, () => mark('l')));
    } else {
      const byId = new Map<string, Lesson>();
      let cursor = 0;
      let stopDelta: (() => void) | null = null;
      const publish = () => set({ lessons: [...byId.values()].sort(byOrder) });
      const take = (list: Lesson[], replace: boolean) => {
        if (replace) byId.clear();
        for (const l of list) { byId.set(l.id, l); cursor = Math.max(cursor, typeof l.updatedAt === 'number' ? l.updatedAt : 0); }
        publish();
      };
      const listenDelta = () => {
        stopDelta?.();
        stopDelta = onSnapshot(query(collection(db, 'lessons'), where('updatedAt', '>', cursor)), (s) => {
          if (stopped) return;
          const changed = s.docChanges().filter((c) => c.type !== 'removed').map((c) => asLesson(c.doc));
          if (changed.length) take(changed, false);
        }, () => { /* oturum değişirken izin hatası: bir sonraki abonelikte yeniden kurulur */ });
      };
      const full = async () => {
        const snap = await getDocs(collection(db, 'lessons'));
        if (stopped) return;
        take(snap.docs.map(asLesson), true);
        if (!snap.metadata.fromCache) markFull();
      };
      /** Sunucudaki ders sayısı önbellektekiyle aynı mı (bağlantı yoksa null: bilinmiyor). */
      const countMatches = async () => {
        const n = await getCountFromServer(collection(db, 'lessons')).then((x) => x.data().count).catch(() => null);
        return n === null ? null : n === byId.size;
      };
      const recount = async () => {
        if (stopped) return;
        const ok = await countMatches();
        if (ok === false && !stopped) { await full().catch(() => {}); listenDelta(); }
      };
      (async () => {
        const cached = await getDocsFromCache(collection(db, 'lessons')).catch(() => null);
        if (stopped) return;
        if (cached && cached.size) { take(cached.docs.map(asLesson), true); mark('l'); }
        const stale = !cached?.size || Date.now() - lastFull() > FULL_TTL_MS;
        const ok = stale ? false : await countMatches();
        if (stopped) return;
        if (ok === false) await full().catch(() => {});
        mark('l');
        listenDelta();
      })();
      const timer = setInterval(() => void recount(), RECOUNT_MS);
      unsubs.push(() => { clearInterval(timer); stopDelta?.(); });
    }
    return () => {
      stopped = true;
      unsubs.forEach((u) => u());
      set({ ready: false, tracks: [], modules: [], lessons: [], stores: [] });
    };
  }
}));

/** Sadece yayındaki içerik (baristaya gösterilen). */
export function publishedOnly<T extends { published: boolean }>(items: T[]): T[] {
  return items.filter((i) => i.published);
}
