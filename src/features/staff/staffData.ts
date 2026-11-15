import { useEffect } from 'react';
import { create } from 'zustand';
import {
  collection, count, getAggregateFromServer, getCountFromServer, getDocs, limit, onSnapshot, orderBy, query, sum, where,
  type DocumentData, type Query, type QueryFieldFilterConstraint
} from 'firebase/firestore';
import { db } from '../../api/firebase';
import { dayStartOf } from '../../lib/day';
import type { Assignment, Attempt, Barista, Progress, Proposal, StoreRequest } from '../../../shared/types';
import { DELETED_MODULES, type ExamAgg, type ExamStats } from '../../lib/boardStats';
export type { ExamAgg, ExamStats } from '../../lib/boardStats';

/**
 * Yönetici paneli (ve Yönetim Kurulu) verisi.
 *
 * Kota (Spark: günde 50.000 okuma): canlı dinleme yalnızca küçük ve gerçekten
 * canlı gereken kümelerde. Eskiden panel her açılışta son 300 sınavı (yarım
 * kalanlar dahil, her cevap işaretlemesi her açık panele okuma olarak
 * yansıyordu), bütün görevleri, 300 talebi, 200 öneriyi dinliyordu; sayılar
 * da bu kesik veriden hesaplandığı için yanlıştı ("Bu hafta sınav" 299,
 * gerçek 416).
 *
 * Canlı (küçük):
 *   baristas, progress      — zincir ölçeğinde (onlarca mağaza) küçük
 *   attempts                — yalnızca TESLİM EDİLMİŞ son 50 sınav (yarım deneme dinlenmez)
 *   assignments             — son ASSIGN_DAYS günde açılan görevler (eskiler istek üzerine)
 *   proposals               — bekleyen önerilerin hepsi + son 50
 *   requests                — açık taleplerin hepsi + son güncellenen N (daha fazlası istek üzerine)
 * Tek seferlik (önbellekli): bkz. useFetched / load* yardımcıları.
 */

const OPEN_REQUEST: StoreRequest['status'][] = ['open', 'seen', 'in_progress', 'approval'];
/** Görevler: bu kadar günden eski olanlar canlı dinlenmez. */
export const ASSIGN_DAYS = 60;
const DAY = 86400000;

interface StaffData {
  baristas: Barista[];
  progress: Record<string, Progress>;
  /** Son 50 teslim edilmiş sınav (canlı). Sayılar için useWeekExams / loadExamsSince. */
  attempts: Attempt[];
  /** Son ASSIGN_DAYS günde açılan görevler (canlı). */
  assignments: Assignment[];
  /** Canlı görev penceresinin başlangıcı. */
  assignmentsFrom: number;
  /** Bekleyen önerilerin hepsi + son 50 öneri. */
  proposals: Proposal[];
  /** Açık taleplerin hepsi + son güncellenen requestLimit talep. */
  requests: StoreRequest[];
  requestLimit: number;
  /** Daha eski talepleri de getir (Kapanan sekmesi). */
  moreRequests: () => void;
  /** Bir dinleyici yetki ya da bağlantı yüzünden düştüyse. */
  error: string | null;
  subscribe: () => () => void;
}

/** İki listeyi kimliğe göre birleştirir (sonraki öncekini ezer). */
function mergeById<T extends { id: string }>(...lists: T[][]): T[] {
  const m = new Map<string, T>();
  lists.forEach((l) => l.forEach((x) => m.set(x.id, x)));
  return [...m.values()];
}

const docs = <T,>(s: { docs: { id: string; data: () => DocumentData }[] }) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as T);

export const useStaffData = create<StaffData>((set, get) => {
  let resub: ((n: number) => void) | null = null;
  return {
    baristas: [],
    progress: {},
    attempts: [],
    assignments: [],
    assignmentsFrom: 0,
    proposals: [],
    requests: [],
    requestLimit: 100,
    error: null,
    moreRequests: () => { const n = get().requestLimit + 200; set({ requestLimit: n }); resub?.(n); },
    subscribe: () => {
      const fail = (what: string) => (e: Error) => {
        console.error('[staffData]', what, e);
        set({ error: e.message.includes('permission') ? 'Bazı veriler okunamadı: bu rolün yetkisi yok.' : 'Bazı veriler okunamadı: bağlantını kontrol et.' });
      };
      const from = Date.now() - ASSIGN_DAYS * DAY;
      set({ assignmentsFrom: from, error: null });
      let pendingProps: Proposal[] = [], recentProps: Proposal[] = [];
      let openReqs: StoreRequest[] = [], recentReqs: StoreRequest[] = [];
      const byUpdated = (a: StoreRequest, b: StoreRequest) => b.updatedAt - a.updatedAt;
      const unsubs = [
        onSnapshot(collection(db, 'baristas'), (s) =>
          set({ baristas: docs<Barista>(s).sort((a, b) => a.name.localeCompare(b.name, 'tr')) }), fail('baristas')),
        onSnapshot(collection(db, 'progress'), (s) => {
          const map: Record<string, Progress> = {};
          s.docs.forEach((d) => (map[d.id] = d.data() as Progress));
          set({ progress: map });
        }, fail('progress')),
        // Yalnızca teslim edilmiş sınavlar: yarım denemenin her cevap kaydı panele okuma olarak yansımaz.
        onSnapshot(query(collection(db, 'attempts'), where('submittedAt', '>', 0), orderBy('submittedAt', 'desc'), limit(50)), (s) =>
          set({ attempts: docs<Attempt>(s) }), fail('attempts')),
        onSnapshot(query(collection(db, 'assignments'), where('createdAt', '>=', from)), (s) =>
          set({ assignments: docs<Assignment>(s).sort((a, b) => b.createdAt - a.createdAt) }), fail('assignments')),
        onSnapshot(query(collection(db, 'proposals'), where('status', '==', 'pending')), (s) => {
          pendingProps = docs<Proposal>(s);
          set({ proposals: mergeById(recentProps, pendingProps).sort((a, b) => b.createdAt - a.createdAt) });
        }, () => set({ proposals: [] })),
        onSnapshot(query(collection(db, 'proposals'), orderBy('createdAt', 'desc'), limit(50)), (s) => {
          recentProps = docs<Proposal>(s);
          set({ proposals: mergeById(recentProps, pendingProps).sort((a, b) => b.createdAt - a.createdAt) });
        }, () => set({ proposals: [] })),
        onSnapshot(query(collection(db, 'requests'), where('status', 'in', OPEN_REQUEST)), (s) => {
          openReqs = docs<StoreRequest>(s);
          set({ requests: mergeById(recentReqs, openReqs).sort(byUpdated) });
        }, () => set({ requests: [] }))
      ];
      // Son güncellenen talepler (kapananlar dahil); "Daha eski" ile limit büyür.
      let recentUnsub = () => {};
      const subRecent = (n: number) => {
        recentUnsub();
        recentUnsub = onSnapshot(query(collection(db, 'requests'), orderBy('updatedAt', 'desc'), limit(n)), (s) => {
          recentReqs = docs<StoreRequest>(s);
          set({ requests: mergeById(recentReqs, openReqs).sort(byUpdated) });
        }, () => set({ requests: openReqs }));
      };
      subRecent(get().requestLimit);
      resub = subRecent;
      return () => { unsubs.forEach((u) => u()); recentUnsub(); resub = null; };
    }
  };
});

/* ------------------------------------------------------------------ */
/* Tek seferlik okumalar (oturum içinde önbellekli)                     */
/* ------------------------------------------------------------------ */

interface Fetched { data: unknown; at: number; loading: boolean; error: string | null }
const useFetchStore = create<{ m: Record<string, Fetched> }>(() => ({ m: {} }));
const inflight = new Map<string, Promise<unknown>>();

/**
 * Bir sorguyu bir kez okur, sonucu `ttlMs` boyunca saklar (sayfalar arasında
 * gidip gelince yeniden okunmaz). Aynı anahtar için tek istek gider.
 */
export function fetchOnce<T>(key: string, loader: () => Promise<T>, ttlMs = 10 * 60 * 1000, force = false): Promise<T> {
  const cur = useFetchStore.getState().m[key];
  if (!force && cur && !cur.loading && !cur.error && Date.now() - cur.at < ttlMs) return Promise.resolve(cur.data as T);
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const put = (x: Partial<Fetched>) => useFetchStore.setState((s) => ({ m: { ...s.m, [key]: { ...(s.m[key] || { data: undefined, at: 0, loading: false, error: null }), ...x } } }));
  put({ loading: true, error: null });
  const p = loader().then(
    (data) => { put({ data, at: Date.now(), loading: false }); return data; },
    (e: Error) => { put({ loading: false, error: e.message.includes('permission') ? 'Bu veriyi okuma yetkin yok.' : 'Veri okunamadı. Bağlantını kontrol et.' }); throw e; }
  ).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** fetchOnce'ın bileşen hâli. key null ise hiçbir şey okunmaz. */
export function useFetched<T>(key: string | null, loader: () => Promise<T>, ttlMs = 10 * 60 * 1000) {
  const entry = useFetchStore((s) => (key ? s.m[key] : undefined));
  useEffect(() => {
    if (key) fetchOnce(key, loader, ttlMs).catch(() => {});
    // loader her çizimde yeni; anahtar yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    data: (entry?.data as T | undefined) ?? null,
    loading: !!key && (!entry || entry.loading),
    error: entry?.error ?? null,
    reload: () => (key ? fetchOnce(key, loader, ttlMs, true).catch(() => {}) : undefined)
  };
}

/** Bu anahtar bu oturumda okunmuş mu (yeniden okumadan). */
export const isFetched = (key: string) => useFetchStore.getState().m[key]?.data !== undefined;

/** Bir anahtarın (ya da öneki tutanların) önbelleğini boşaltır: yazımdan sonra yeniden okunsun. */
export function invalidate(prefix: string) {
  useFetchStore.setState((s) => ({ m: Object.fromEntries(Object.entries(s.m).filter(([k]) => !k.startsWith(prefix))) }));
}

const read = async <T,>(q: Query<DocumentData>) => docs<T>(await getDocs(q));

/** Gün başına yuvarlanmış zaman: önbellek anahtarı gün içinde aynı kalsın. */
export const dayStart = (ms: number) => dayStartOf(ms);

/** `from`dan bu yana teslim edilmiş bütün sınavlar (tek seferlik). */
export const loadExamsSince = (from: number) =>
  read<Attempt>(query(collection(db, 'attempts'), where('submittedAt', '>=', from), orderBy('submittedAt', 'desc')));

/**
 * Son `days` günün teslim edilmiş sınavları (Genel bakış sayıları, en çok
 * yanlış yapılan sorular). Kesin sayı; canlı değil, 10 dakikada bir tazelenir.
 */
export const examsSinceKey = (days: number) => `exams:${dayStart(Date.now() - (days - 1) * DAY)}`;
export function useExamsSince(days: number, enabled = true) {
  const from = dayStart(Date.now() - (days - 1) * DAY);
  return useFetched<Attempt[]>(enabled ? examsSinceKey(days) : null, () => loadExamsSince(from));
}

/** Bir baristanın BÜTÜN denemeleri (barista ayrıntısı, rozet/önlük kararı). */
export const loadBaristaAttempts = (baristaId: string) =>
  read<Attempt>(query(collection(db, 'attempts'), where('baristaId', '==', baristaId), orderBy('startedAt', 'desc')));
export function useBaristaAttempts(baristaId: string | null) {
  return useFetched<Attempt[]>(baristaId ? `barista:${baristaId}` : null, () => loadBaristaAttempts(baristaId!), 5 * 60 * 1000);
}

/** Bir mağazanın bütün görevleri (rozet hesabı eski görevleri de ister). */
export const loadStoreAssignments = (storeId: string) =>
  read<Assignment>(query(collection(db, 'assignments'), where('storeId', '==', storeId)));
export function useStoreAssignments(storeId: string | null) {
  return useFetched<Assignment[]>(storeId ? `assign-store:${storeId}` : null, () => loadStoreAssignments(storeId!), 5 * 60 * 1000);
}

/** Bir modülün bütün denemeleri (Soru havuzu kullanım istatistiği). */
export function useModuleAttempts(moduleId: string | null) {
  return useFetched<Attempt[]>(moduleId ? `module:${moduleId}` : null,
    () => read<Attempt>(query(collection(db, 'attempts'), where('moduleId', '==', moduleId))));
}

/**
 * Bütün teslim edilmiş sınavlar ve bütün görevler: önlük rozeti listesi,
 * baristaların unvanları ve kurulun yetkinlik dağılımı bütün geçmişi ister.
 * Pahalı (zincirin bütün sınavları), bu yüzden yalnızca o ekranlarda ve
 * istek üzerine okunur; 30 dakika saklanır.
 */
export interface History { attempts: Attempt[]; assignments: Assignment[] }
export const HISTORY_KEY = 'history:all';
export const loadHistory = async (): Promise<History> => {
  const [attempts, assignments] = await Promise.all([
    read<Attempt>(query(collection(db, 'attempts'), where('submittedAt', '>', 0))),
    read<Assignment>(collection(db, 'assignments'))
  ]);
  return { attempts, assignments };
};
export function useHistory(enabled: boolean) {
  return useFetched<History>(enabled ? HISTORY_KEY : null, loadHistory, 30 * 60 * 1000);
}
/** Geçmiş daha önce (bu oturumda) okunduysa onu döndürür; okumaz. */
export function useHistoryIfLoaded(): History | null {
  return useFetchStore((s) => (s.m[HISTORY_KEY]?.data as History | undefined) ?? null);
}

/** `cutoff`tan önce açılmış görevler (Görevler → "Daha eskileri göster"). */
export const loadOlderAssignments = (cutoff: number) =>
  read<Assignment>(query(collection(db, 'assignments'), where('createdAt', '<', cutoff), orderBy('createdAt', 'desc'), limit(300)));

/** Talepler: belirli tarihten beri güncellenmiş olanlar (istatistik, kurul dönemi). */
export const loadRequestsSince = (from: number) =>
  read<StoreRequest>(query(collection(db, 'requests'), where('updatedAt', '>=', from)));

/** Öneriler: belirli tarihten beri sonuçlananlar (kurul: dönemde yayınlanan içerik). */
export const loadReviewedSince = (from: number) =>
  read<Proposal>(query(collection(db, 'proposals'), where('reviewedAt', '>=', from)));

/** Modül başına soru sayısı (toplama sorgusu: 1000 belge başına 1 okuma). */
export function useQuestionCounts(moduleIds: string[]) {
  const key = moduleIds.length ? `qcount:${moduleIds.join(',')}` : null;
  return useFetched<Record<string, number>>(key, async () => {
    const rows = await Promise.all(moduleIds.map(async (id) =>
      [id, (await getCountFromServer(query(collection(db, 'questions'), where('moduleId', '==', id)))).data().count] as const));
    return Object.fromEntries(rows);
  }, 5 * 60 * 1000);
}


const aggOf = (exams: number, passed: number, total: number): ExamAgg =>
  ({ exams, passed, sum: total, avgScore: exams ? Math.round(total / exams) : null });

/** Birkaç özetin toplamı. */
const mergeAgg = (xs: ExamAgg[]): ExamAgg => aggOf(xs.reduce((s, x) => s + x.exams, 0), xs.reduce((s, x) => s + x.passed, 0), xs.reduce((s, x) => s + x.sum, 0));

/** Belgelerden aynı özet (dizin yoksa yedek yol). İptal ve mini sınav hariç. */
export function aggOfDocs(list: Attempt[]): ExamAgg {
  const xs = list.filter((a) => a.submittedAt && !a.voided && !a.lessonId);
  return aggOf(xs.length, xs.filter((a) => a.passed).length, xs.reduce((s, a) => s + (a.score || 0), 0));
}

/**
 * Bir aralığın modül sınavı özeti TOPLAMA sorgusuyla (1000 belge başına 1
 * okuma). `extra`: ek eşitlik süzgeci (mağaza, modül, barista).
 *
 * İptal edilen denemeler sayılmaz: bu denemelerde `score` ve `passed` yok;
 * aynı sorguda count() ile sum('score') birlikte istenince Firestore yalnızca
 * bütün alanları taşıyan belgeleri sayar. Bileşik dizin ister (bkz.
 * firestore.indexes.json: attempts lessonId [+ storeId/moduleId/baristaId]
 * [+ passed] + submittedAt); dizin yoksa hata verir, çağıran belgelerden hesaplar.
 * to null: üst sınır yok (dönem bugüne kadar).
 */
async function examAggWhere(extra: QueryFieldFilterConstraint[], from: number, to: number | null, withPassed = true): Promise<ExamAgg> {
  const base = query(collection(db, 'attempts'), where('lessonId', '==', null), ...extra,
    where('submittedAt', '>=', from), ...(to !== null ? [where('submittedAt', '<=', to)] : []));
  const [a, p] = await Promise.all([
    getAggregateFromServer(base, { n: count(), s: sum('score') }),
    withPassed ? getCountFromServer(query(base, where('passed', '==', true))) : Promise.resolve(null)
  ]);
  return aggOf(a.data().n, p ? p.data().count : 0, a.data().s ?? 0);
}

/** Bir aralığın modül sınavı özeti (kurulun önceki dönemi ve 12 haftalık grafik). */
export const loadExamAgg = (from: number, to: number | null) => examAggWhere([], from, to);

/**
 * Genel bakış: son günlerin sınav sayısı, ortalaması, mini sınav sayısı ve
 * mağaza başına sayı/geçme. Toplama sorgularıyla (mağaza sayısı × 2 + 3
 * okuma); eskiden aralığın bütün sınav belgeleri okunuyordu (haftada ~450).
 */
export interface OverviewExams { total: ExamAgg; mini: number; byStore: Record<string, ExamAgg> }
export async function loadOverviewExams(from: number, storeIds: string[]): Promise<OverviewExams> {
  try {
    // Toplam = aktif mağaza satırlarının toplamı (H7): pasif mağazanın
    // sınavları satırlarda yokken toplamda sayılıyordu. Mini sınav sayısı tek
    // toplama sorgusuyla bütün mağazalardan (mağaza başına ayrı sorgu kotayı ikiye katlar).
    const [totalAll, all, ...stores] = await Promise.all([
      examAggWhere([], from, null, false),
      // Mini sınavlar dahil, iptaller hariç (sum('score') iptali dışarıda bırakır).
      getAggregateFromServer(query(collection(db, 'attempts'), where('submittedAt', '>=', from)), { n: count(), s: sum('score') }),
      ...storeIds.map((id) => examAggWhere([where('storeId', '==', id)], from, null))
    ]);
    const total = mergeAgg(stores);
    return { total, mini: Math.max(0, all.data().n - totalAll.exams), byStore: Object.fromEntries(storeIds.map((id, i) => [id, stores[i]])) };
  } catch (e) {
    console.warn('[genel bakış] toplama sorgusu olmadı (dizin?), belgelerden hesaplanıyor', e);
    const docs = (await loadExamsSince(from)).filter((a) => !a.voided);
    return {
      total: aggOfDocs(docs.filter((a) => storeIds.includes(a.storeId))),
      mini: docs.filter((a) => !!a.lessonId).length,
      byStore: Object.fromEntries(storeIds.map((id) => [id, aggOfDocs(docs.filter((a) => a.storeId === id))]))
    };
  }
}

/**
 * Kurul dönemi sınav göstergeleri (modül sınavları): toplam, mağaza, modül ve
 * barista başına özet. Toplama sorgularıyla ~(2 + 2×mağaza + 2×modül + barista)
 * okuma; eskiden dönemin bütün sınav belgeleri okunuyordu ("Bu yıl" aralıkta
 * ~25.000 okuma).
 *
 * Kesinlik denetimi: modül ve barista toplamları genel toplamla tutmuyorsa
 * (ör. dönemde sınavı olan bir modül sonradan silindi) kısa aralıkta (≤ 92 gün)
 * belgeler okunup her şey belgelerden hesaplanır; uzun aralıkta silinmiş
 * modüllerin farkı tek satırda gösterilir.
 */
const SMALL_RANGE_MS = 92 * DAY;

/** Dönemde sınava girmiş olabilecek baristalar: dönemden önce ayrıldığı bilinenler hariç. */
export const examBaristaIds = (list: Barista[], from: number) =>
  list.filter((b) => b.active || !b.deactivatedAt || b.deactivatedAt >= from).map((b) => b.id);

function statsFromDocs(from: number, to: number | null, list: Attempt[]): ExamStats {
  const xs = list.filter((a) => a.submittedAt && !a.voided && !a.lessonId && a.submittedAt >= from && (to === null || a.submittedAt <= to));
  const group = (key: (a: Attempt) => string) => {
    const m = new Map<string, Attempt[]>();
    xs.forEach((a) => m.set(key(a), [...(m.get(key(a)) || []), a]));
    return Object.fromEntries([...m.entries()].map(([k, v]) => [k, aggOfDocs(v)]));
  };
  return { from, to, total: aggOfDocs(xs), byStore: group((a) => a.storeId), byModule: group((a) => a.moduleId), byBarista: group((a) => a.baristaId), docs: xs };
}

export async function loadExamStats(from: number, to: number | null, ids: { stores: string[]; modules: string[]; baristas: string[] }): Promise<ExamStats> {
  const docsPath = async () => statsFromDocs(from, to, to === null ? await loadExamsSince(from)
    : await read<Attempt>(query(collection(db, 'attempts'), where('submittedAt', '>=', from), where('submittedAt', '<=', to))));
  let res: ExamAgg[];
  try {
    res = await Promise.all([
      examAggWhere([], from, to),
      ...ids.stores.map((id) => examAggWhere([where('storeId', '==', id)], from, to)),
      ...ids.modules.map((id) => examAggWhere([where('moduleId', '==', id)], from, to)),
      // Barista başına yalnızca sayı ve ortalama (dönemin baristası, sınava giren sayısı).
      ...ids.baristas.map((id) => examAggWhere([where('baristaId', '==', id)], from, to, false))
    ]);
  } catch (e) {
    console.warn('[kurul] toplama sorgusu olmadı (dizin?), belgelerden hesaplanıyor', e);
    return docsPath();
  }
  const [total, ...rest] = res;
  const take = <T,>(list: string[], off: number) => Object.fromEntries(list.map((id, i) => [id, rest[off + i]])) as Record<string, T>;
  const byStore = take<ExamAgg>(ids.stores, 0);
  const byModule = take<ExamAgg>(ids.modules, ids.stores.length);
  const byBarista = take<ExamAgg>(ids.baristas, ids.stores.length + ids.modules.length);
  const sumOf = (r: Record<string, ExamAgg>) => Object.values(r).reduce((a, x) => ({ n: a.n + x.exams, p: a.p + x.passed, s: a.s + x.sum }), { n: 0, p: 0, s: 0 });
  const m = sumOf(byModule);
  const b = sumOf(byBarista);
  const range = (to ?? Date.now()) - from;
  if ((m.n !== total.exams || b.n !== total.exams) && range <= SMALL_RANGE_MS) return docsPath();
  if (m.n < total.exams) byModule[DELETED_MODULES] = aggOf(total.exams - m.n, Math.max(0, total.passed - m.p), total.sum - m.s);
  return { from, to, total, byStore, byModule, byBarista };
}
