import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useSession } from '../../store/session';
import { useDocLive, useQueryLive } from '../../hooks/useFirestore';
import { EMPTY_PROGRESS } from '../../lib/progress';
import type { Assignment, Attempt, Progress } from '../../../shared/types';

export function useBaristaSession() {
  const s = useSession((x) => x.session);
  if (s.kind !== 'barista') throw new Error('Barista oturumu yok');
  return s;
}

export function useMyProgress(): { progress: Progress; loading: boolean } {
  const s = useBaristaSession();
  const { data, loading } = useDocLive<Progress>(`progress/${s.baristaId}`);
  return { progress: data || { ...EMPTY_PROGRESS, baristaId: s.baristaId, storeId: s.storeId }, loading };
}

export function useMyAssignments(): { items: Assignment[]; loading: boolean } {
  const s = useBaristaSession();
  const { data, loading } = useQueryLive<Assignment>(
    query(collection(db, 'assignments'), where('storeId', '==', s.storeId)),
    `asg-${s.storeId}`
  );
  const items = data
    .filter((a) => !a.baristaId || a.baristaId === s.baristaId)
    .sort((a, b) => (a.dueAt || Infinity) - (b.dueAt || Infinity));
  return { items, loading };
}

export function useMyAttempts(max = 30): { items: Attempt[]; loading: boolean } {
  const s = useBaristaSession();
  const { data, loading } = useQueryLive<Attempt>(
    query(collection(db, 'attempts'), where('baristaId', '==', s.baristaId), orderBy('startedAt', 'desc'), limit(max)),
    `att-${s.baristaId}-${max}`
  );
  return { items: data, loading };
}
