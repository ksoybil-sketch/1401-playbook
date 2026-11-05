import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../api/firebase';
import type { Track, Module, Lesson, Store } from '../../shared/types';

/**
 * Eğitim içeriği (yollar, modüller, dersler) ve mağaza listesi küçük ve
 * herkesin okuduğu veriler — oturum açılınca bir kez abone olunur, tüm
 * ekranlar buradan okur. Firestore'un yerel önbelleği sayesinde internet
 * yokken de dersler açılır.
 */
interface ContentState {
  ready: boolean;
  tracks: Track[];
  modules: Module[];
  lessons: Lesson[];
  stores: Store[];
  subscribe: () => () => void;
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export const useContent = create<ContentState>((set) => ({
  ready: false,
  tracks: [],
  modules: [],
  lessons: [],
  stores: [],
  subscribe: () => {
    const loaded = new Set<string>();
    const mark = (k: string) => {
      loaded.add(k);
      if (loaded.size === 4) set({ ready: true });
    };
    const unsubs = [
      onSnapshot(collection(db, 'tracks'), (s) => {
        set({ tracks: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Track).sort(byOrder) });
        mark('t');
      }, () => mark('t')),
      onSnapshot(collection(db, 'modules'), (s) => {
        set({ modules: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Module).sort(byOrder) });
        mark('m');
      }, () => mark('m')),
      onSnapshot(collection(db, 'lessons'), (s) => {
        set({ lessons: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Lesson).sort(byOrder) });
        mark('l');
      }, () => mark('l')),
      onSnapshot(collection(db, 'stores'), (s) => {
        set({ stores: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Store).sort((a, b) => a.name.localeCompare(b.name, 'tr')) });
        mark('s');
      }, () => mark('s'))
    ];
    return () => {
      unsubs.forEach((u) => u());
      set({ ready: false, tracks: [], modules: [], lessons: [], stores: [] });
    };
  }
}));

/** Sadece yayındaki içerik (baristaya gösterilen). */
export function publishedOnly<T extends { published: boolean }>(items: T[]): T[] {
  return items.filter((i) => i.published);
}
