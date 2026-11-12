import { collection, query, where, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useSession } from '../../store/session';
import { useDocLive, useQueryLive } from '../../hooks/useFirestore';
import { EMPTY_PROGRESS } from '../../lib/progress';
import type { Assignment, Attempt, Barista, Bulletin, Progress } from '../../../shared/types';
import { useMemo } from 'react';
import { useContent } from '../../store/content';
import { badgeReport, type BadgeReport } from '../../lib/badges';

type BaristaSession = Extract<ReturnType<typeof useSession.getState>['session'], { kind: 'barista' }>;
let lastBarista: BaristaSession | null = null;

/** Çıkış anındaki son çizimde hata atmamak için son bilinen oturum (bkz. useStaffSession). */
export function useBaristaSession(): BaristaSession {
  const s = useSession((x) => x.session);
  if (s.kind === 'barista') { lastBarista = s; return s; }
  if (lastBarista) return lastBarista;
  throw new Error('Barista oturumu yok');
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

/** Bu mağazaya gelen, yayındaki ve süresi dolmamış bültenler. */
export function useMyBulletins(): { items: Bulletin[]; unread: number; loading: boolean } {
  const s = useBaristaSession();
  const { progress } = useMyProgress();
  // Yayın durumu ve mağaza hedefi burada süzülüyor: sorguya koymak
  // bileşik dizin gerektirirdi, bülten sayısı ise avuç içi kadar.
  const { data, loading } = useQueryLive<Bulletin>(
    query(collection(db, 'bulletins'), orderBy('createdAt', 'desc'), limit(50)),
    'bulletins'
  );
  const now = Date.now();
  const items = data
    .filter((b) => b.published)
    .filter((b) => !b.expiresAt || b.expiresAt > now)
    .filter((b) => !b.storeIds?.length || b.storeIds.includes(s.storeId))
    .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.createdAt - a.createdAt);
  const unread = items.filter((b) => !progress.bulletins?.[b.id]).length;
  return { items, unread, loading };
}

/** Bülteni okundu olarak işaretler; zaten okunduysa hiçbir şey yazmaz. */
export async function markBulletinRead(baristaId: string, bulletinId: string, already: boolean): Promise<void> {
  if (already) return;
  await updateDoc(doc(db, 'progress', baristaId), {
    [`bulletins.${bulletinId}`]: Date.now(),
    updatedAt: Date.now()
  }).catch(() => {});
}

export function useMyAttempts(max = 30): { items: Attempt[]; loading: boolean } {
  const s = useBaristaSession();
  const { data, loading } = useQueryLive<Attempt>(
    query(collection(db, 'attempts'), where('baristaId', '==', s.baristaId), orderBy('startedAt', 'desc'), limit(max)),
    `att-${s.baristaId}-${max}`
  );
  return { items: data, loading };
}

/**
 * Baristanın rozet ve unvan raporu — tüm sınav geçmişinden hesaplanır
 * (bkz. src/lib/badges.ts). Ana sayfa ve "Ben" aynı raporu kullanır.
 */
export function useMyBadgeReport(): { report: BadgeReport; attempts: Attempt[]; loading: boolean } {
  const s = useBaristaSession();
  const { tracks, modules, lessons } = useContent();
  const { progress } = useMyProgress();
  const { items: assignments } = useMyAssignments();
  const { items: all, loading } = useMyAttempts(300);
  const { data: me } = useDocLive<Barista>(`baristas/${s.baristaId}`);
  const attempts = useMemo(() => all.filter((a) => a.submittedAt && !a.voided), [all]);
  const report = useMemo(
    () => badgeReport({ tracks, modules, lessons, progress, attempts, assignments, startedAt: me?.startedAt, createdAt: me?.createdAt }),
    [tracks, modules, lessons, progress, attempts, assignments, me?.startedAt, me?.createdAt]
  );
  return { report, attempts, loading };
}
