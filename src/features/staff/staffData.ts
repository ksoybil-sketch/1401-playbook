import { create } from 'zustand';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../api/firebase';
import type { Assignment, Attempt, Barista, Progress } from '../../../shared/types';

/**
 * Yönetici paneli verisi. Zincir ölçeğinde (onlarca mağaza, yüzlerce
 * barista) tamamını canlı dinlemek ucuz ve basit; büyürse sayfalamaya geçilir.
 */
interface StaffData {
  baristas: Barista[];
  progress: Record<string, Progress>;
  attempts: Attempt[];
  assignments: Assignment[];
  subscribe: () => () => void;
}

export const useStaffData = create<StaffData>((set) => ({
  baristas: [],
  progress: {},
  attempts: [],
  assignments: [],
  subscribe: () => {
    const unsubs = [
      onSnapshot(collection(db, 'baristas'), (s) =>
        set({ baristas: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Barista).sort((a, b) => a.name.localeCompare(b.name, 'tr')) })),
      onSnapshot(collection(db, 'progress'), (s) => {
        const map: Record<string, Progress> = {};
        s.docs.forEach((d) => (map[d.id] = d.data() as Progress));
        set({ progress: map });
      }),
      onSnapshot(query(collection(db, 'attempts'), orderBy('startedAt', 'desc'), limit(300)), (s) =>
        set({ attempts: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Attempt) })),
      onSnapshot(collection(db, 'assignments'), (s) =>
        set({ assignments: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Assignment).sort((a, b) => b.createdAt - a.createdAt) }))
    ];
    return () => unsubs.forEach((u) => u());
  }
}));
