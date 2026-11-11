import { create } from 'zustand';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../api/firebase';
import type { Assignment, Attempt, Barista, Progress, Proposal, StoreRequest } from '../../../shared/types';

/**
 * Yönetici paneli verisi. Zincir ölçeğinde (onlarca mağaza, yüzlerce
 * barista) tamamını canlı dinlemek ucuz ve basit; büyürse sayfalamaya geçilir.
 */
interface StaffData {
  baristas: Barista[];
  progress: Record<string, Progress>;
  attempts: Attempt[];
  assignments: Assignment[];
  /** Son 200 öneri (bekleyen + geçmiş). */
  proposals: Proposal[];
  /** Mağaza talepleri (son 300). */
  requests: StoreRequest[];
  subscribe: () => () => void;
}

export const useStaffData = create<StaffData>((set) => ({
  baristas: [],
  progress: {},
  attempts: [],
  assignments: [],
  proposals: [],
  requests: [],
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
        set({ assignments: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Assignment).sort((a, b) => b.createdAt - a.createdAt) })),
      onSnapshot(query(collection(db, 'proposals'), orderBy('createdAt', 'desc'), limit(200)), (s) =>
        set({ proposals: s.docs.map((d) => ({ id: d.id, ...d.data() }) as Proposal) }),
        () => set({ proposals: [] })),
      onSnapshot(query(collection(db, 'requests'), orderBy('updatedAt', 'desc'), limit(300)), (s) =>
        set({ requests: s.docs.map((d) => ({ id: d.id, ...d.data() }) as StoreRequest) }),
        () => set({ requests: [] }))
    ];
    return () => unsubs.forEach((u) => u());
  }
}));
