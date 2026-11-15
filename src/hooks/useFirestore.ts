import { useEffect, useState } from 'react';
import { onSnapshot, doc, type Query, type DocumentData } from 'firebase/firestore';
import { db } from '../api/firebase';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: string | null;
  /** Son anlık görüntü sunucudan mı geldi (cihaz önbelleği değil). */
  fromServer?: boolean;
}

/**
 * Bir Firestore sorgusuna canlı abone olur. `key` değiştiğinde yeniden
 * abone olur — sorgu nesnesi her render'da yeniden üretildiği için bağımlılık
 * olarak kullanılamaz. `q` null ise hiçbir şey dinlenmez.
 */
export function useQueryLive<T>(q: Query<DocumentData> | null, key: string): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: !!q, error: null });
  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), loading: false, error: null, fromServer: !snap.metadata.fromCache }),
      (err) => { console.error('[useQueryLive]', key, err); setState({ data: [], loading: false, error: err.message }); }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useDocLive<T>(path: string | null): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(db, path),
      (snap) => setState({ data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null, loading: false, error: null }),
      (err) => setState({ data: null, loading: false, error: err.message })
    );
  }, [path]);
  return state;
}
