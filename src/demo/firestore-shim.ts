/**
 * Demo kaydı için "firebase/firestore"un yerine geçen ince katman.
 *
 * vite.config.ts yalnızca VITE_ACTIVITY_LOG=true olan derlemelerde (demo,
 * emülatör) "firebase/firestore" içe aktarımını bu dosyaya yönlendirir.
 * Uygulama kodu hiç değişmez: her şey olduğu gibi gerçek Firestore'dan
 * gelir, yalnızca yazma işlevleri başarıyla bittikten sonra demoLog'a bir
 * satır düşer. Canlı pakette bu dosya yoktur.
 */
import * as real from '@firebase/firestore';
import { record } from './log';

/** Bu kadar uzun süren okumalar demo kaydına "ölçüm" olarak düşer. */
const SLOW_MS = 1000;
const tick = () => performance.now();
function whereOf(x: unknown): string {
  const r = x as { path?: string; _query?: { path?: { canonicalString?: () => string }; collectionGroup?: string | null; filters?: unknown[] } };
  if (typeof r?.path === 'string') return r.path;
  const q = r?._query;
  const base = q?.collectionGroup || q?.path?.canonicalString?.() || '?';
  return q?.filters?.length ? `${base} (${q.filters.length} koşul)` : base;
}
function slow(kind: string, target: unknown, ms: number, extra: Record<string, unknown> = {}) {
  if (ms < SLOW_MS) return;
  const at = whereOf(target);
  if (at.startsWith('demoLog')) return;
  record(null, 'ölçüm', { label: `Yavaş ${kind}`, op: `${Math.round(ms)} ms`, path: at, data: { toplam: Math.round(ms), ...extra } });
}

export const getDoc = ((ref: Ref) => {
  const t = tick();
  return real.getDoc(ref as never).then((s) => { slow('okuma', ref, tick() - t, { önbellekten: s.metadata.fromCache }); return s; });
}) as typeof real.getDoc;

export const getDocs = ((q: unknown) => {
  const t = tick();
  return real.getDocs(q as never).then((s) => { slow('sorgu', q, tick() - t, { belge: s.size, önbellekten: s.metadata.fromCache }); return s; });
}) as typeof real.getDocs;

export * from '@firebase/firestore';

type Ref = { path: string; firestore: real.Firestore };
type Op = { op: string; path: string; data?: unknown };

/** updateDoc(ref, 'alan', değer, 'alan2', değer2) biçimini nesneye çevirir. */
function fieldsOf(args: unknown[]): unknown {
  const [first, ...rest] = args;
  if (typeof first !== 'string' && !(first instanceof real.FieldPath)) return first;
  const out: Record<string, unknown> = {};
  const all = [first, ...rest];
  for (let i = 0; i + 1 < all.length; i += 2) out[String(all[i])] = all[i + 1];
  return out;
}

const opName = (op: string, merge?: boolean) => (op === 'set' ? (merge ? 'güncelle' : 'yaz') : op === 'update' ? 'güncelle' : op === 'delete' ? 'sil' : 'ekle');

function logOps(db: real.Firestore, ops: Op[], t0?: number) {
  for (const o of ops) record(db, 'değişiklik', { path: o.path, op: o.op, data: o.data });
  if (t0 !== undefined && ops.length) slow('yazma', { path: ops[0].path }, tick() - t0, { işlem: ops.length });
}

export const setDoc = ((ref: Ref, data: unknown, options?: real.SetOptions) => {
  const t = tick();
  const p = options ? real.setDoc(ref as never, data as never, options) : real.setDoc(ref as never, data as never);
  return p.then((r) => { logOps(ref.firestore, [{ op: opName('set', !!options), path: ref.path, data }], t); return r; });
}) as typeof real.setDoc;

export const updateDoc = ((ref: Ref, ...args: unknown[]) => {
  const t = tick();
  const p = (real.updateDoc as (...a: unknown[]) => Promise<void>)(ref, ...args);
  return p.then((r) => { logOps(ref.firestore, [{ op: 'güncelle', path: ref.path, data: fieldsOf(args) }], t); return r; });
}) as typeof real.updateDoc;

export const addDoc = ((col: Ref, data: unknown) => {
  const t = tick();
  return real.addDoc(col as never, data as never).then((r) => {
    logOps(col.firestore, [{ op: 'ekle', path: r.path, data }], t);
    return r;
  });
}) as typeof real.addDoc;

export const deleteDoc = ((ref: Ref) =>
  real.deleteDoc(ref as never).then((r) => { logOps(ref.firestore, [{ op: 'sil', path: ref.path }]); return r; })) as typeof real.deleteDoc;

/** Toplu yazım: işlemler biriktirilir, commit başarılı olunca kaydedilir. */
export const writeBatch = ((db: real.Firestore) => {
  const b = real.writeBatch(db);
  const ops: Op[] = [];
  const wrap = <K extends 'set' | 'update' | 'delete'>(k: K) => {
    const orig = (b[k] as (...a: unknown[]) => unknown).bind(b);
    (b as unknown as Record<string, unknown>)[k] = (ref: Ref, ...args: unknown[]) => {
      ops.push({ op: k === 'set' ? opName('set', !!args[1]) : opName(k), path: ref.path, data: k === 'delete' ? undefined : k === 'update' ? fieldsOf(args) : args[0] });
      orig(ref, ...args);
      return b;
    };
  };
  wrap('set'); wrap('update'); wrap('delete');
  const commit = b.commit.bind(b);
  b.commit = () => { const t = tick(); return commit().then((r) => { logOps(db, ops, t); return r; }); };
  return b;
}) as typeof real.writeBatch;

/** İşlem (transaction): yeniden denemede baştan sayılır, başarıda kaydedilir. */
export const runTransaction = (<T>(db: real.Firestore, fn: (tx: real.Transaction) => Promise<T>, options?: real.TransactionOptions) => {
  let ops: Op[] = [];
  const wrapped = (tx: real.Transaction) => {
    ops = [];
    const proxy = new Proxy(tx, {
      get(target, prop) {
        const v = (target as unknown as Record<string | symbol, unknown>)[prop];
        if (typeof v !== 'function') return v;
        if (prop === 'set' || prop === 'update' || prop === 'delete') {
          return (ref: Ref, ...args: unknown[]) => {
            ops.push({ op: prop === 'set' ? opName('set', !!args[1]) : opName(prop), path: ref.path, data: prop === 'delete' ? undefined : prop === 'update' ? fieldsOf(args) : args[0] });
            (v as (...a: unknown[]) => unknown).call(target, ref, ...args);
            return proxy;
          };
        }
        return (v as (...a: unknown[]) => unknown).bind(target);
      }
    });
    return fn(proxy);
  };
  return real.runTransaction(db, wrapped, options).then((r) => { logOps(db, ops); return r; });
}) as typeof real.runTransaction;
