/**
 * 'firebase/firestore' yerine geçen sayaç: istemci başına faturalanacak
 * okuma / yazma / silme sayısını tutar (Firestore faturalama kuralına göre):
 *  - getDoc: 1 okuma (önbellekten değilse)
 *  - getDocs: dönen belge sayısı (boşsa 1)
 *  - onSnapshot: sunucudan gelen her anlık görüntüde eklenen/değişen belge
 *    sayısı (ilk görüntü boşsa 1). Kaldırılan belge ücretsiz.
 *  - set/update/add: 1 yazma; delete: 1 silme; toplu yazım / işlem içi aynı.
 * Güvenlik kurallarındaki get()/exists() okumaları burada sayılmaz (ayrı hesaplanır).
 */
import * as real from 'firebase/firestore';
export * from 'firebase/firestore';

const C = new URL(import.meta.url).searchParams.get('c') || '0';
const S = (globalThis.__SAYAC ||= new Map());
const etiket = () => (globalThis.__ETIKET && globalThis.__ETIKET[C]) || 'diğer';
function kayit() {
  if (!S.has(C)) S.set(C, { r: 0, w: 0, d: 0, by: {} });
  return S.get(C);
}
function add(kind, n, where) {
  if (!n) return;
  const k = kayit();
  k[kind] += n;
  const key = `${etiket()} | ${where}`;
  const b = (k.by[key] ||= { r: 0, w: 0, d: 0 });
  b[kind] += n;
}
function whereOf(x) {
  if (typeof x?.path === 'string') return x.path.split('/').length % 2 === 0 ? x.path.split('/')[0] + '/{id}' : x.path;
  const q = x?._query;
  const base = q?.collectionGroup || q?.path?.canonicalString?.() || '?';
  return q?.filters?.length || q?.limit ? `${base}(sorgu)` : base;
}
export const getDoc = (ref) => real.getDoc(ref).then((s) => { if (!s.metadata.fromCache) add('r', 1, whereOf(ref)); return s; });
export const getDocs = (q) => real.getDocs(q).then((s) => { if (!s.metadata.fromCache) add('r', Math.max(1, s.size), whereOf(q)); return s; });
export const getDocFromServer = (ref) => real.getDocFromServer(ref).then((s) => { add('r', 1, whereOf(ref)); return s; });
export const getDocsFromServer = (q) => real.getDocsFromServer(q).then((s) => { add('r', Math.max(1, s.size), whereOf(q)); return s; });

// Toplama sorguları: 1000 belge başına 1 okuma (en az 1).
const aggReads = (n) => Math.max(1, Math.ceil(n / 1000));
export const getCountFromServer = (q) => real.getCountFromServer(q).then((s) => { add('r', aggReads(s.data().count), whereOf(q) + '[sayım]'); return s; });
export const getAggregateFromServer = (q, spec) => real.getAggregateFromServer(q, spec).then((s) => { const d = s.data(); const n = Number.isInteger(d.n) ? d.n : Number.isInteger(d.count) ? d.count : (Object.values(d).find((v) => Number.isInteger(v)) ?? 0); /* sayım alanı (toplam değil) */ add('r', aggReads(n), whereOf(q) + '[toplama]'); return s; });
export function onSnapshot(target, ...args) {
  let i = 0;
  if (args[0] && typeof args[0] === 'object' && !('next' in args[0]) && typeof args[0] !== 'function') i = 1;
  const w = whereOf(target);
  let first = true;
  const isQuery = !(typeof target?.path === 'string' && target.path.split('/').length % 2 === 0);
  const count = (s) => {
    if (s.metadata.fromCache) return;
    if (isQuery) {
      const n = s.docChanges().filter((c) => c.type !== 'removed').length;
      add('r', first && n === 0 ? 1 : n, w);
    } else add('r', 1, w);
    first = false;
  };
  const a = [...args];
  if (typeof a[i] === 'function') { const f = a[i]; a[i] = (s) => { count(s); f(s); }; }
  else if (a[i] && typeof a[i] === 'object') { const o = a[i]; a[i] = { ...o, next: (s) => { count(s); o.next?.(s); } }; }
  return real.onSnapshot(target, ...a);
}
export const setDoc = (ref, ...a) => real.setDoc(ref, ...a).then((r) => { add('w', 1, whereOf(ref)); return r; });
export const updateDoc = (ref, ...a) => real.updateDoc(ref, ...a).then((r) => { add('w', 1, whereOf(ref)); return r; });
export const addDoc = (col, ...a) => real.addDoc(col, ...a).then((r) => { add('w', 1, whereOf(col)); return r; });
export const deleteDoc = (ref) => real.deleteDoc(ref).then((r) => { add('d', 1, whereOf(ref)); return r; });
export function writeBatch(db) {
  const b = real.writeBatch(db);
  const ops = [];
  for (const k of ['set', 'update', 'delete']) {
    const o = b[k].bind(b);
    b[k] = (ref, ...a) => { ops.push([k === 'delete' ? 'd' : 'w', whereOf(ref)]); o(ref, ...a); return b; };
  }
  const commit = b.commit.bind(b);
  b.commit = () => commit().then((r) => { ops.forEach(([k, w]) => add(k, 1, w)); return r; });
  return b;
}
export function runTransaction(db, fn, opts) {
  let ops = [];
  return real.runTransaction(db, (tx) => {
    ops = [];
    const p = new Proxy(tx, {
      get(t, prop) {
        const v = t[prop];
        if (typeof v !== 'function') return v;
        if (prop === 'get') return (ref) => { ops.push(['r', whereOf(ref)]); return v.call(t, ref); };
        if (prop === 'set' || prop === 'update' || prop === 'delete') return (ref, ...a) => { ops.push([prop === 'delete' ? 'd' : 'w', whereOf(ref)]); v.call(t, ref, ...a); return p; };
        return v.bind(t);
      }
    });
    return fn(p);
  }, opts).then((r) => { ops.forEach(([k, w]) => add(k, 1, w)); return r; });
}
