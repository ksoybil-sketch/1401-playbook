import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { Lesson, Module, Question, Track } from '../../shared/types';

/**
 * Müfredatı panelden Firestore'a yazar.
 *
 * Neden burada: Spark planında Cloud Functions yok, yani içerik yüklemek için
 * ya servis hesabı anahtarı ya da bir yönetici şifresi gereken bir betik
 * gerekiyordu. Oysa yönetici panele zaten giriş yapmış durumda ve
 * firestore.rules onun "admin" rolünü doğruluyor — yazmayı doğrudan onun
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
  /** Koleksiyon başına: yeni, güncellenen (zaten var) ve silinecek belge sayıları. */
  counts: Record<Col, { add: number; update: number; remove: number }>;
  /** Menüden çıktığı için silinecek derslerin/modüllerin başlıkları — onay ekranında gösterilir. */
  removedTitles: string[];
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

const itemsOf = (file: CurriculumFile, col: Col): Array<{ id: string }> =>
  (col === 'tracks' ? file.tracks : col === 'modules' ? file.modules : col === 'lessons' ? file.lessons : file.questions) as Array<{ id: string }>;

/** Yazmadan önce ne olacağını hesaplar — onay ekranı bunu gösterir. */
export async function planCurriculum(file: CurriculumFile): Promise<PublishPlan> {
  const existing = await readExisting();
  const counts = {} as PublishPlan['counts'];
  const removedTitles: string[] = [];
  let totalWrites = 0;

  for (const col of COLLECTIONS) {
    const items = itemsOf(file, col);
    const incoming = new Set(items.map((i) => i.id));
    let add = 0;
    for (const i of items) (existing[col].has(i.id) ? 0 : add++);
    const stale = [...existing[col].keys()].filter((id) => !incoming.has(id));
    counts[col] = { add, update: items.length - add, remove: stale.length };
    totalWrites += items.length + stale.length;

    if (col === 'lessons' || col === 'modules') {
      for (const id of stale) {
        const title = existing[col].get(id)?.title;
        removedTitles.push(typeof title === 'string' ? title : id);
      }
    }
  }

  return { version: file.version, season: file.season, counts, removedTitles, totalWrites };
}

export interface PublishProgress {
  done: number;
  total: number;
  label: string;
}

/** Müfredatı yazar ve menüden çıkmış içeriği siler. */
export async function publishCurriculum(
  file: CurriculumFile,
  onProgress?: (p: PublishProgress) => void
): Promise<{ written: number; removed: number }> {
  const existing = await readExisting();

  let written = 0;
  let removed = 0;
  let total = 0;
  for (const col of COLLECTIONS) total += itemsOf(file, col).length + existing[col].size;

  const labels: Record<Col, string> = {
    tracks: 'Eğitim yolları', modules: 'Modüller', lessons: 'Dersler', questions: 'Sorular'
  };

  for (const col of COLLECTIONS) {
    const items = itemsOf(file, col) as Array<Record<string, unknown> & { id: string }>;
    const incoming = new Set(items.map((i) => i.id));

    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const item of items.slice(i, i + BATCH_LIMIT)) {
        const { id, ...rest } = item;
        const prev = existing[col].get(id);
        const data: Record<string, unknown> = { ...rest };
        if (prev) {
          // Panelden yapılan düzenlemeler ezilmesin.
          if (typeof prev.published === 'boolean') data.published = prev.published;
          if (col === 'questions' && typeof prev.imageUrl === 'string' && prev.imageUrl) data.imageUrl = prev.imageUrl;
        }
        batch.set(doc(db, col, id), data);
      }
      await batch.commit();
      written += Math.min(BATCH_LIMIT, items.length - i);
      onProgress?.({ done: written + removed, total, label: labels[col] });
    }

    const stale = [...existing[col].keys()].filter((id) => !incoming.has(id));
    for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const id of stale.slice(i, i + BATCH_LIMIT)) batch.delete(doc(db, col, id));
      await batch.commit();
      removed += Math.min(BATCH_LIMIT, stale.length - i);
      onProgress?.({ done: written + removed, total, label: `${labels[col]} (temizlik)` });
    }
  }

  return { written, removed };
}

/** Gömülü müfredat dosyasını yalnızca gerektiğinde indirir (ayrı paket parçası). */
export async function loadCurriculumFile(): Promise<CurriculumFile> {
  const mod = await import('../generated/curriculum.json');
  return (mod.default ?? mod) as unknown as CurriculumFile;
}
