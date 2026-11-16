import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { serverNow } from '../lib/serverTime';
import type { Lesson, LessonBlock, Module, Question, Track } from '../../shared/types';
import { loadChunk } from '../lib/chunk';

/**
 * Müfredatı panelden Firestore'a yazar.
 *
 * Neden burada: Spark planında Cloud Functions yok, yani içerik yüklemek için
 * ya servis hesabı anahtarı ya da bir yönetici şifresi gereken bir betik
 * gerekiyordu. Oysa yönetici panele zaten giriş yapmış durumda ve
 * firestore.rules onun rolünü (geliştirici ya da direktör) doğruluyor — yazmayı doğrudan onun
 * oturumuyla yapmak hem daha basit hem daha güvenli (şifre hiçbir yere
 * kopyalanmıyor, anahtar dosyası tutulmuyor).
 *
 * Yöneticinin panelden yaptığı el emeği korunur: soruya eklenen fotoğraf
 * (imageUrl) ve yayın durumu (published) üzerine yazılmaz.
 */

export interface CurriculumFile {
  version: string;
  season: string;
  tracks: Track[];
  modules: Module[];
  lessons: Lesson[];
  questions: Question[];
}

const COLLECTIONS = ['tracks', 'modules', 'lessons', 'questions'] as const;
type Col = (typeof COLLECTIONS)[number];

export interface PublishPlan {
  version: string;
  season: string;
  /**
   * Koleksiyon başına: yeni, değişen (yazılacak), aynı kalan (yazılmaz) ve
   * silinecek belge sayıları; panelde eklenip korunan içerik (kept).
   */
  counts: Record<Col, { add: number; update: number; same: number; remove: number; kept: number }>;
  /** Menüden çıktığı için silinecek derslerin/modüllerin başlıkları — onay ekranında gösterilir. */
  removedTitles: string[];
  /** Silinecek soru sayısı (onay ekranında ayrıca yazılır). */
  removedQuestions: number;
  totalWrites: number;
}

/** Firestore tek seferde en çok 500 işlem alır; güvenli pay bırakıyoruz. */
const BATCH_LIMIT = 400;

type Existing = Record<Col, Map<string, Record<string, unknown>>>;

async function readExisting(): Promise<Existing> {
  const out = {} as Existing;
  for (const col of COLLECTIONS) {
    const snap = await getDocs(collection(db, col));
    out[col] = new Map(snap.docs.map((d) => [d.id, d.data()]));
  }
  return out;
}

/**
 * Panelde oluşturulmuş içerik kitapçık dosyasında yoktur; müfredat
 * güncellemesi onu "eski" sayıp silmemeli.
 *  - Yeni ürün, Soru penceresi, Dosyadan ders, Ders ekle, panelde açılan
 *    modül/yol `kaynak: 'panel'` yazar.
 *  - Bu işaretten önce panelde eklenenler işaretsizdir; onları Firestore'un
 *    otomatik kimlik biçiminden tanırız (20 harf/rakam). Müfredat dosyasındaki
 *    kimlikler okunur adlardır ("espresso-temelleri-…", "hikayemiz"): bu
 *    biçime hiç uymaz (14.11.2026'da 1.448 kimlikle denetlendi).
 */
const AUTO_ID = /^[A-Za-z0-9]{20}$/;
const isPanel = (id: string, d: Record<string, unknown> | undefined) => d?.kaynak === 'panel' || AUTO_ID.test(id);

const itemsOf = (file: CurriculumFile, col: Col): Array<{ id: string }> =>
  (col === 'tracks' ? file.tracks : col === 'modules' ? file.modules : col === 'lessons' ? file.lessons : file.questions) as Array<{ id: string }>;

/** Anahtar sırasından bağımsız derin eşitlik (Firestore alanları sırasız döner). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => same(x, bb[i]));
  }
  const ao = a as Record<string, unknown>, bo = b as Record<string, unknown>;
  const ka = Object.keys(ao).filter((k) => ao[k] !== undefined), kb = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => k in bo && same(ao[k], bo[k]));
}

/** Panelden yapılan el emeğini koruyarak dosyadaki belgenin yazılacak hâli. */
function merged(col: Col, item: Record<string, unknown> & { id: string }, prev: Record<string, unknown> | undefined): Record<string, unknown> {
  const { id: _id, ...rest } = item;
  const data: Record<string, unknown> = { ...rest };
  if (!prev) return data;
  // Panelden yapılan düzenlemeler ezilmesin.
  if (typeof prev.published === 'boolean') data.published = prev.published;
  if (col === 'questions' && typeof prev.imageUrl === 'string' && prev.imageUrl) data.imageUrl = prev.imageUrl;
  // Soru havuzunda düzeltilen soru (edited) olduğu gibi kalır; iptal
  // edilen sorunun iptali (disabled) korunur.
  if (col === 'questions' && prev.edited) Object.assign(data, prev);
  if (col === 'questions' && prev.disabled) {
    for (const k of ['disabled', 'disabledReason', 'disabledByName', 'disabledAt']) data[k] = prev[k];
  }
  // Elle düzeltilmiş bardak şeması korunur. Reçete dosyasındaki
  // gramaj yanlışsa Kahve Operasyonu panelden düzeltiyor; bu düzeltme
  // bir sonraki sezon güncellemesinde sessizce geri alınmamalı.
  // Düzeltmeyi geri almak için editörde malzemeleri silip dersi
  // kaydetmek yeterli: `edited` işareti bloğun kendisinde duruyor.
  if (col === 'lessons' && Array.isArray(prev.blocks) && Array.isArray(data.blocks)) {
    const kept = (prev.blocks as LessonBlock[]).filter(
      (x): x is Extract<LessonBlock, { type: 'cup' }> => !!x && x.type === 'cup' && !!x.edited
    );
    if (kept.length) {
      let n = 0;
      data.blocks = (data.blocks as LessonBlock[]).map((x) =>
        x.type === 'cup' && kept[n] ? kept[n++] : x
      );
    }
  }
  // Sürüm alanı karşılaştırmaya girmez; yazılırsa yenisi işlenir.
  delete data.updatedAt;
  return data;
}

interface Work {
  writes: Record<Col, Array<{ id: string; data: Record<string, unknown> }>>;
  deletes: Record<Col, string[]>;
  plan: PublishPlan;
}

/**
 * Ne yazılacağını hesaplar: yalnızca yeni ya da gerçekten değişen belgeler
 * yazılır (eskiden her güncellemede ~1.450 belge baştan yazılıyordu).
 */
function buildWork(file: CurriculumFile, existing: Existing): Work {
  const writes = {} as Work['writes'];
  const deletes = {} as Work['deletes'];
  const counts = {} as PublishPlan['counts'];
  const removedTitles: string[] = [];
  let removedQuestions = 0;
  let totalWrites = 0;

  for (const col of COLLECTIONS) {
    const items = itemsOf(file, col) as Array<Record<string, unknown> & { id: string }>;
    const incoming = new Set(items.map((i) => i.id));
    writes[col] = [];
    let add = 0, update = 0, unchanged = 0;
    for (const item of items) {
      const prev = existing[col].get(item.id);
      const data = merged(col, item, prev);
      if (!prev) add++;
      else {
        const { updatedAt: _u, ...prevCmp } = prev;
        if (same(data, prevCmp)) { unchanged++; continue; }
        update++;
      }
      writes[col].push({ id: item.id, data });
    }
    const notInFile = [...existing[col].keys()].filter((id) => !incoming.has(id));
    const kept = notInFile.filter((id) => isPanel(id, existing[col].get(id)));
    deletes[col] = notInFile.filter((id) => !isPanel(id, existing[col].get(id)));
    counts[col] = { add, update, same: unchanged, remove: deletes[col].length, kept: kept.length };
    totalWrites += writes[col].length + deletes[col].length;
    if (col === 'questions') removedQuestions = deletes[col].length;
    if (col === 'lessons' || col === 'modules') {
      for (const id of deletes[col]) {
        const title = existing[col].get(id)?.title;
        removedTitles.push(typeof title === 'string' ? title : id);
      }
    }
  }
  return { writes, deletes, plan: { version: file.version, season: file.season, counts, removedTitles, removedQuestions, totalWrites } };
}

/**
 * Planın okuduğu veri, yayında yeniden okunmasın diye (kota: her güncelleme
 * ~1.450 okuma daha ediyordu) kısa süre saklanır. Daha eskiyse yeniden okunur.
 */
const PLAN_FRESH_MS = 10 * 60 * 1000;
const planCache = new WeakMap<PublishPlan, { existing: Existing; at: number }>();

/** Yazmadan önce ne olacağını hesaplar — onay ekranı bunu gösterir. */
export async function planCurriculum(file: CurriculumFile): Promise<PublishPlan> {
  const existing = await readExisting();
  const { plan } = buildWork(file, existing);
  planCache.set(plan, { existing, at: Date.now() });
  return plan;
}

export interface PublishProgress {
  done: number;
  total: number;
  label: string;
}

/**
 * Müfredatı yazar ve menüden çıkmış içeriği siler. `plan` verilirse (onay
 * ekranından) onun okuduğu veri kullanılır.
 */
export async function publishCurriculum(
  file: CurriculumFile,
  onProgress?: (p: PublishProgress) => void,
  plan?: PublishPlan | null
): Promise<{ written: number; removed: number }> {
  const cached = plan ? planCache.get(plan) : undefined;
  const existing = cached && Date.now() - cached.at < PLAN_FRESH_MS ? cached.existing : await readExisting();
  const work = buildWork(file, existing);

  let written = 0;
  let removed = 0;
  const total = Math.max(1, work.plan.totalWrites);
  const labels: Record<Col, string> = {
    tracks: 'Eğitim yolları', modules: 'Modüller', lessons: 'Dersler', questions: 'Sorular'
  };
  const now = serverNow(); // updatedAt sunucu saatiyle: telefonlar dersleri bu alana göre fark olarak alır (store/content.ts)

  for (const col of COLLECTIONS) {
    const list = work.writes[col];
    for (let i = 0; i < list.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const w of list.slice(i, i + BATCH_LIMIT)) batch.set(doc(db, col, w.id), { ...w.data, updatedAt: now });
      await batch.commit();
      written += Math.min(BATCH_LIMIT, list.length - i);
      onProgress?.({ done: written + removed, total, label: labels[col] });
    }

    const stale = work.deletes[col];
    for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const id of stale.slice(i, i + BATCH_LIMIT)) batch.delete(doc(db, col, id));
      await batch.commit();
      removed += Math.min(BATCH_LIMIT, stale.length - i);
      onProgress?.({ done: written + removed, total, label: `${labels[col]} (temizlik)` });
    }
  }
  if (plan) planCache.delete(plan);

  return { written, removed };
}

/** Gömülü müfredat dosyasını yalnızca gerektiğinde indirir (ayrı paket parçası). */
export async function loadCurriculumFile(): Promise<CurriculumFile> {
  const mod = await loadChunk(() => import('../generated/curriculum.json'));
  return (mod.default ?? mod) as unknown as CurriculumFile;
}
