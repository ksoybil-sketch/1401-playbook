import { collection, doc, getDoc, runTransaction, setDoc, updateDoc, writeBatch, type DocumentReference, type Transaction, type WriteBatch } from 'firebase/firestore';
import { db } from './firebase';
import { beginPrepare } from '../lib/writeGate';
import { useSession } from '../store/session';
import { useContent } from '../store/content';
import { allowed, domainOf } from '../lib/permissions';
import { authorName } from '../lib/roles';
import type { ChangeOp, Proposal, ProposalKind, StaffRole } from '../../shared/types';

/**
 * İçerik ve bülten yazımının tek kapısı.
 *
 * Kahve Operasyon Direktörü (ve geliştirici) doğrudan yayınlar. Bölge müdürü
 * ve operasyon ekibinin değişikliği yayına girmez; proposals/{id} olarak
 * "Bekleyen onaylar" listesine düşer. Müdür onu olduğu gibi yayınlayabilir
 * ya da editörde açıp düzeltip yayınlayabilir — ikisi de bu fonksiyondan
 * geçer (proposalId verilir).
 *
 * Editörler belge yazmak için doğrudan setDoc/updateDoc çağırmaz; aksi
 * hâlde onay akışının dışından yayına giden bir yol açılmış olur.
 */

export interface ChangeMeta {
  kind: ProposalKind;
  /** Listede görünen ad: ders başlığı, bülten başlığı… */
  title: string;
  /** "Ders düzenlendi", "Yeni soru", "Silme" gibi. */
  summary: string;
}

export type ChangeResult = 'applied' | 'proposed';

function staff() {
  const s = useSession.getState().session;
  if (s.kind !== 'staff') throw new Error('Kahve Operasyonu oturumu yok.');
  return s;
}
/** Kayda yazılan ad: uygulama geliştiricisi iz bırakmaz (boş). */
const nameOf = (s: ReturnType<typeof staff>) => authorName(s.role, s.name);

/* ------------------------------------------------------------------ */
/* Sürüm denetimi: eski öneri / eşzamanlı düzenleme                      */
/* ------------------------------------------------------------------ */

/**
 * İçerik ve bülten belgelerine her yazımda `updatedAt` işlenir. Bir editör
 * belgeyi açtığı andaki updatedAt'i (ya da öneri oluşturulduğu andakini)
 * saklar; kaydederken belge sunucuda o andan beri değiştiyse sessizce
 * ezilmez, StaleError atılır. Ekran kullanıcıya sorar, isterse force ile
 * yeniden dener.
 *   - A20: "Olduğu gibi yayınla" öneriden sonra yapılan düzeltmeyi eziyordu.
 *   - B17: aynı dersi/bülteni iki kişi düzenleyince sonraki öncekini siliyordu.
 */
const VERSIONED = new Set<ChangeOp['col']>(['lessons', 'modules', 'tracks', 'questions', 'bulletins']);

/* ------------------------------------------------------------------ */
/* İzinli işlemler: beyaz liste (güvenlik raporu K-1)                   */
/* ------------------------------------------------------------------ */

/**
 * Öneri ve onay yoluyla yazılabilen koleksiyonlar. Liste dışı her şey
 * reddedilir (varsayılan: reddet). Öneri belgesindeki `ops` istemciden
 * geldiği için tipine güvenilmez: bir ekip üyesi masum görünen bir ders
 * önerisine `config/permissions` ya da `users/<kendisi>` yazımı gizleyip
 * direktörün "Yayınla"sıyla kendi yetkisini yükseltebiliyordu. Yazım
 * onaylayanın yetkisiyle yürüdüğü için kurallar bunu ayırt edemez; asıl
 * kapı burası (bkz. firestore.rules proposals açıklaması).
 *   - Görev (assignments) yalnızca "Yeni ürün" akışında, yeni belge olarak.
 */
export const CHANGE_COLLECTIONS: readonly ChangeOp['col'][] = ['lessons', 'modules', 'tracks', 'questions', 'bulletins', 'assignments'];
const COLS = new Set<string>(CHANGE_COLLECTIONS);
const OPS = new Set<string>(['set', 'update', 'delete']);

/** İşlem tanınıyor mu: izinli koleksiyon, bilinen işlem, düz kimlik ve veri. */
export function isKnownOp(o: unknown): o is ChangeOp {
  if (!o || typeof o !== 'object') return false;
  const x = o as Record<string, unknown>;
  if (typeof x.col !== 'string' || !COLS.has(x.col)) return false;
  if (typeof x.op !== 'string' || !OPS.has(x.op)) return false;
  // Kimlik tek bir belge adı olmalı: "/" alt koleksiyona, "."/".." başka yola kaçar.
  if (typeof x.id !== 'string' || !x.id || x.id.length > 200 || x.id.includes('/') || x.id === '.' || x.id === '..' || /^__.*__$/.test(x.id)) return false;
  if (x.data !== undefined && (x.data === null || typeof x.data !== 'object' || Array.isArray(x.data))) return false;
  // Görev yalnızca yeni ürün akışında oluşturulur; öneriyle görev silinmez/değiştirilmez.
  if (x.col === 'assignments' && x.op !== 'set') return false;
  // Güncellemede "a.b" biçimli alan yolu başka belgeye yazamaz ama iç alanlara
  // dokunur; içerik editörleri bunu kullanmıyor, kabul edilmez.
  if (x.op === 'update' && x.data && Object.keys(x.data).some((k) => k.includes('.'))) return false;
  return true;
}

/** Tanınmayan işlemler (boşsa hepsi tanınıyor). */
export function unknownOps(ops: unknown): unknown[] {
  return Array.isArray(ops) ? ops.filter((o) => !isKnownOp(o)) : [ops];
}

/** Hepsi tanınıyor mu (liste değilse hayır). */
export const allKnownOps = (ops: unknown): ops is ChangeOp[] => Array.isArray(ops) && ops.every(isKnownOp);

/** Tanınmayan işlem içeren öneri yayınlanamaz, öneri olarak da kaydedilemez. */
export class UnknownOpError extends Error {
  constructor() {
    super('Bu öneride uygulamanın tanımadığı bir değişiklik var (içerik dışı bir kayda yazım). Güvenlik nedeniyle yayınlanamaz; öneriyi reddet.');
    this.name = 'UnknownOpError';
  }
}
function assertKnown(ops: unknown): asserts ops is ChangeOp[] {
  if (!allKnownOps(ops)) throw new UnknownOpError();
}

/** Sürüm haritasının anahtarı. */
export const versionKey = (col: string, id: string) => `${col}:${id}`;
/** Belgenin sürümü: updatedAt (yoksa 0); belge yoksa null. */
export const verOf = (d: Record<string, unknown> | null | undefined): number | null =>
  d ? (typeof d.updatedAt === 'number' ? d.updatedAt : 0) : null;
export type Versions = Record<string, number | null>;

export class StaleError extends Error {
  constructor(public titles: string[]) {
    super(`Bu kayıt sen açtıktan sonra değişti${titles.length ? `: ${titles.join(', ')}` : ''}. Kaydedersen sonraki değişiklikler gider.`);
    this.name = 'StaleError';
  }
}

/** Sürüm denetlenen belgelerin şu anki sürümleri (sunucudan). */
async function currentVersions(ops: ChangeOp[]): Promise<Record<string, { v: number | null; title: string }>> {
  const keys = [...new Map(ops.filter((o) => VERSIONED.has(o.col)).map((o) => [versionKey(o.col, o.id), o])).values()];
  const rows = await Promise.all(keys.map(async (o) => {
    // Çevrimdışıyken (önbellekte de yoksa) okunamaz: o belge denetlenmez,
    // yazım yine kuyruğa alınır.
    const snap = await getDoc(doc(db, o.col, o.id)).catch(() => null);
    if (!snap) return null;
    const d = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    const title = String(d?.title || d?.prompt || o.data?.title || o.data?.prompt || '').slice(0, 60);
    return [versionKey(o.col, o.id), { v: verOf(d), title }] as const;
  }));
  return Object.fromEntries(rows.filter((r): r is NonNullable<typeof r> => !!r));
}

/** base'deki sürümlerden farklı olanların başlıkları (boşsa her şey güncel). */
async function staleTitles(ops: ChangeOp[], base: Versions): Promise<string[]> {
  const relevant = ops.filter((o) => VERSIONED.has(o.col) && versionKey(o.col, o.id) in base);
  if (!relevant.length) return [];
  const cur = await currentVersions(relevant);
  return Object.entries(cur).filter(([k, x]) => base[k] !== x.v).map(([, x]) => x.title || 'kayıt');
}

/** Öneri oluşturulurken hedef belgelerin sürümü (sonradan değişti mi diye bakılır). */
async function baseVersions(ops: ChangeOp[], known?: Versions): Promise<Versions> {
  const missing = ops.filter((o) => VERSIONED.has(o.col) && !(known && versionKey(o.col, o.id) in known));
  const cur = missing.length ? await currentVersions(missing) : {};
  return { ...Object.fromEntries(Object.entries(cur).map(([k, x]) => [k, x.v])), ...(known || {}) };
}

/**
 * Bu değişikliği doğrudan yayınlayabilir mi? Yetki ayarına (Yetkiler ekranı)
 * ve rolün alanına bakar: Operasyon Müdürü kahve dışı yollarda yayınlar,
 * kahve içeriğini öneri olarak gönderir. Kurallar (firestore.rules) aynısını
 * sunucu tarafında da denetler.
 */
function opAllowed(role: StaffRole, o: ChangeOp, all: ChangeOp[]): boolean {
  // Varsayılan reddet: tanınmayan koleksiyon/işlem asla "yayınlanabilir içerik" sayılmaz.
  if (!isKnownOp(o)) return false;
  if (o.col === 'assignments') return allowed(role, 'gorevAtama');
  if (o.col === 'bulletins') return allowed(role, 'bultenYayin');
  const may = allowed(role, 'icerikYayin') || (o.col === 'questions' && allowed(role, 'soruDuzelt'));
  if (!may) return false;
  const dom = domainOf(role);
  if (!dom) return true;
  if (o.col === 'tracks') return false;
  const { modules, lessons } = useContent.getState();
  const d = (o.data || {}) as Record<string, unknown>;
  const trackOfModule = (mid?: unknown) => {
    if (typeof mid !== 'string') return undefined;
    return modules.find((m) => m.id === mid)?.trackId
      ?? (all.find((x) => x.col === 'modules' && x.id === mid)?.data?.trackId as string | undefined);
  };
  const track = o.col === 'modules'
    ? ((d.trackId as string) || modules.find((m) => m.id === o.id)?.trackId)
    : trackOfModule(d.moduleId ?? (o.col === 'lessons' ? lessons.find((l) => l.id === o.id)?.moduleId : undefined));
  return !!track && dom.includes(track);
}

export function canPublishOps(ops: ChangeOp[]): boolean {
  const s = useSession.getState().session;
  return s.kind === 'staff' && allKnownOps(ops) && ops.length > 0 && ops.every((o) => opAllowed(s.role, o, ops));
}

/** Yayınlama yetkisi var mı. Hedef verilirse (ör. bir ders) alan sınırına da bakar. */
export function canPublishNow(target?: ChangeOp): boolean {
  const s = useSession.getState().session;
  if (s.kind !== 'staff') return false;
  return target ? opAllowed(s.role, target, [target]) : allowed(s.role, 'icerikYayin');
}

/** Firestore `undefined` kabul etmez; öneride saklanan veriyi temizler. */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** İşlemleri bir toplu yazıma ya da işleme (transaction) ekler. */
interface Writer {
  set(ref: DocumentReference, data: Record<string, unknown>): unknown;
  update(ref: DocumentReference, data: Record<string, unknown>): unknown;
  delete(ref: DocumentReference): unknown;
}
function writeOps(wb: WriteBatch | Transaction, ops: ChangeOp[], now: number) {
  // Son kapı: yazımdan hemen önce bir kez daha (çağıran unutsa da).
  assertKnown(ops);
  const w = wb as unknown as Writer;
  for (const o of ops) {
    const ref = doc(db, o.col, o.id);
    // Sürüm: içerik ve bülten belgesi her yazımda updatedAt alır (bkz. StaleError).
    const data = VERSIONED.has(o.col) ? { ...(o.data || {}), updatedAt: now } : (o.data || {});
    if (o.op === 'delete') w.delete(ref);
    else if (o.op === 'update') w.update(ref, data);
    else w.set(ref, data);
  }
}

export async function applyOps(ops: ChangeOp[]): Promise<void> {
  const batch = writeBatch(db);
  writeOps(batch, ops, Date.now());
  await batch.commit();
}

/** İşlem (transaction) bu sürede bitmezse bağlantı yok sayılır, toplu yazımla kuyruğa alınır. */
const TX_TIMEOUT_MS = 10_000;
const isNetworkError = (e: unknown) => {
  const code = (e as { code?: string })?.code || '';
  return code === 'unavailable' || code === 'deadline-exceeded' || code === 'timeout';
};

/**
 * Sürüm denetimli yazım (K6). Denetim ve yazım aynı işlemde (runTransaction):
 * belge açılıştan beri değiştiyse StaleError. Eskiden denetim okuması ile
 * yazım ayrıydı; milisaniye farkla gelen iki kayıtta ikisi de geçiyor,
 * sonuncu sessizce kazanıyordu. İşlemde ikinci kayıt çakışır, Firestore
 * işlemi yeniden dener, yeniden okuyunca belge değişmiş olur → StaleError.
 *
 * İşlem çevrimdışı çalışmaz: bağlantı yoksa (ya da işlem bağlantı yüzünden
 * olmazsa) eski yol: önbellekten denetim + toplu yazım (kuyruğa alınır).
 * `extra`: aynı yazıma eklenecek öneri güncellemesi (öneri ve içerik birlikte
 * yazılır; eskiden içerik yazımı onaylanmadan öneri güncellenmiyordu, çevrimdışı
 * onayda öneri "bekliyor" kalıyordu). `queued`: yazım gönderilince (yerel
 * kuyruğa girince) çağrılır (bkz. lib/writeGate).
 */
async function applyChecked(ops: ChangeOp[], base: Versions | null, extra: { ref: DocumentReference; data: Record<string, unknown> } | null, queued: () => void): Promise<void> {
  const relevant = base ? [...new Map(ops.filter((o) => VERSIONED.has(o.col) && versionKey(o.col, o.id) in base).map((o) => [versionKey(o.col, o.id), o])).values()] : [];
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (relevant.length && online && ops.length < 450) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        runTransaction(db, async (tx) => {
          const snaps = await Promise.all(relevant.map((o) => tx.get(doc(db, o.col, o.id))));
          const stale = snaps.map((snap, i) => {
            const o = relevant[i];
            const d = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
            return base![versionKey(o.col, o.id)] !== verOf(d)
              ? String(d?.title || d?.prompt || o.data?.title || o.data?.prompt || '').slice(0, 60) || 'kayıt' : null;
          }).filter((x): x is string => !!x);
          if (stale.length) throw new StaleError(stale);
          writeOps(tx, ops, Date.now());
          if (extra) tx.update(extra.ref, extra.data);
        }),
        new Promise<never>((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), TX_TIMEOUT_MS); })
      ]);
      queued();
      return;
    } catch (e) {
      if (e instanceof StaleError || !isNetworkError(e)) throw e;
      // Bağlantı yok: aşağıdaki yoldan kuyruğa alınır.
    } finally {
      clearTimeout(timer);
    }
  }
  if (relevant.length) {
    const stale = await staleTitles(ops, base!);
    if (stale.length) throw new StaleError(stale);
  }
  const batch = writeBatch(db);
  writeOps(batch, ops, Date.now());
  if (extra) batch.update(extra.ref, extra.data);
  const p = batch.commit();
  queued();
  await p;
}

/** Yeni belge için kimlik (yazmadan). */
export const newId = (col: ChangeOp['col']) => doc(collection(db, col)).id;

/** Öneri belgesi + oluşturulduğu andaki hedef sürümleri. */
export type ProposalDoc = Proposal & { baseUpdatedAt?: Versions };

export interface CommitOptions {
  /**
   * Editörün belgeyi açtığı andaki sürümler (versionKey → updatedAt). Verilirse
   * kaydetmeden önce sunucudaki hâliyle karşılaştırılır.
   */
  base?: Versions;
  /** Sürüm farkına rağmen kaydet (kullanıcı "üzerine yaz" dedi). */
  force?: boolean;
}

export async function commitChange(ops: ChangeOp[], meta: ChangeMeta, proposalId?: string | null, opts: CommitOptions = {}): Promise<ChangeResult> {
  // Yazım öncesi okumalar bitip yazım kuyruğa girene kadar "kuyruğa alındı" denmez (B-2).
  const queued = beginPrepare();
  try {
    return await commitChangeInner(ops, meta, proposalId, opts, queued);
  } finally {
    queued();
  }
}

async function commitChangeInner(ops: ChangeOp[], meta: ChangeMeta, proposalId: string | null | undefined, opts: CommitOptions, queued: () => void): Promise<ChangeResult> {
  const s = staff();
  // Ne yayınlanır ne de öneri olarak kaydedilir: önce tanınıyor mu.
  assertKnown(ops);
  const data = clean(ops);
  // Öneri üzerinde çalışılıyorsa önce öneriyi oku: kimin, hangi sürüme göre yapıldığı.
  const proposal = proposalId
    ? (await getDoc(doc(db, 'proposals', proposalId)).catch(() => null))?.data() as ProposalDoc | undefined
    : undefined;
  if (canPublishOps(data)) {
    if (proposalId && !proposal) throw new Error('Öneri okunamadı. İnternet bağlantını kontrol edip yeniden dene.');
    const own = !!proposal && proposal.createdBy === s.uid;
    // Ayar uyuşmazlığı: içeriği yayınlayabilen ama önerileri onaylayamayan
    // biri başkasının önerisini "onaylayıp yayınlarsa" içerik yayına girip
    // öneri "bekliyor" kalıyordu (kural öneri güncellemesini reddediyor).
    if (proposal && !own && !allowed(s.role, 'oneriOnay')) {
      throw new Error('Önerileri onaylama yetkin yok. Bu öneriyi yetkili yönetici yayınlar.');
    }
    // Önerinin sürümü önceliklidir: onaylayan editörü sonradan açmış olsa
    // da öneriden sonraki değişiklik ezilmesin.
    const base = opts.force ? null : { ...(opts.base || {}), ...(proposal?.baseUpdatedAt || {}) };
    // Görev (yeni ürün akışı) onaylanınca yayınlayanın adına yazılır:
    // kurallar görevi yalnızca atayanın kendi kimliğiyle yazmasına izin verir.
    const applied = data.map((o) => (o.col === 'assignments' && o.op === 'set'
      ? { ...o, data: { ...o.data, createdBy: s.uid, createdByName: nameOf(s) } } : o));
    let extra: { ref: DocumentReference; data: Record<string, unknown> } | null = null;
    if (proposalId && proposal) {
      const ref = doc(db, 'proposals', proposalId);
      if (own && !allowed(s.role, 'oneriOnay')) {
        // Kendi önerisini (sonradan yetki aldığı için) doğrudan yayınladı: öneri geri çekilmiş sayılır.
        extra = { ref, data: { status: 'withdrawn', updatedAt: Date.now() } };
      } else {
        const original = JSON.stringify(proposal.ops || []);
        extra = { ref, data: {
          status: 'approved', reviewedAt: Date.now(), reviewedBy: s.uid, reviewedByName: nameOf(s),
          editedOnReview: original !== JSON.stringify(data), ops: data
        } };
      }
    }
    await applyChecked(applied, base, extra, queued);
    return 'applied';
  }
  if (proposalId) {
    // Kendi bekleyen önerisini düzenliyor (önerinin ilk sürüm bilgisi korunur).
    const w = updateDoc(doc(db, 'proposals', proposalId), { ops: data, title: meta.title, summary: meta.summary, updatedAt: Date.now() });
    queued();
    await w;
    return 'proposed';
  }
  const p: Omit<ProposalDoc, 'id'> = {
    kind: meta.kind, title: meta.title, summary: meta.summary, ops: data, status: 'pending',
    createdAt: Date.now(), createdBy: s.uid, createdByName: nameOf(s),
    // Onaylayan, hedef belge bu andan sonra değiştiyse uyarılır (A20).
    baseUpdatedAt: await baseVersions(data, opts.base)
  };
  const ref = doc(collection(db, 'proposals'));
  // Kimlik önceden alınır: çevrimdışıyken de "son öneri" bilinsin.
  lastProposalId = ref.id;
  const w = setDoc(ref, p);
  queued();
  await w;
  return 'proposed';
}

/** Son oluşturulan önerinin kimliği — editör, öneri üzerinde düzenlemeye devam edebilsin. */
export let lastProposalId: string | null = null;

/**
 * Olduğu gibi yayınla. Onaylayanın alanı dışındaysa yayınlanmaz. Hedef belge
 * öneriden sonra değiştiyse StaleError atar; force ile yine de yayınlanır.
 */
export async function approveProposal(p: Proposal, force = false): Promise<void> {
  assertKnown(p.ops);
  if (!canPublishOps(p.ops)) throw new Error('Bu öneri senin yetki alanının dışında; Kahve Operasyon Direktörü onaylayabilir.');
  await commitChange(p.ops, { kind: p.kind, title: p.title, summary: p.summary }, p.id, { force });
}

/** Önerinin hedef belgelerinden öneriden sonra değişenlerin başlıkları (boşsa güncel). */
export async function proposalStale(p: ProposalDoc): Promise<string[]> {
  return p.baseUpdatedAt && allKnownOps(p.ops) ? staleTitles(p.ops, p.baseUpdatedAt) : [];
}

export async function rejectProposal(p: Proposal, note: string): Promise<void> {
  const s = staff();
  await updateDoc(doc(db, 'proposals', p.id), {
    status: 'rejected', reviewedAt: Date.now(), reviewedBy: s.uid, reviewedByName: nameOf(s), reviewNote: note.trim()
  });
}

export async function withdrawProposal(p: Proposal): Promise<void> {
  await updateDoc(doc(db, 'proposals', p.id), { status: 'withdrawn', updatedAt: Date.now() });
}

/** Kullanıcıya gösterilecek sonuç metni. */
export const resultText = (r: ChangeResult, applied = 'Kaydedildi') =>
  r === 'applied' ? applied : 'Onaya gönderildi — yetkili yönetici yayınlayınca görünür';
