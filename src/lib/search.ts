import type { Lesson, Module, Track } from '../../shared/types';

/**
 * Ders ve reçete araması.
 *
 * Servis sırasındaki barista "Mont Blanc nasıl yapılıyordu" diye bakar;
 * müfredat ağacında gezinmez. Arama bu yüzden ders adının yanı sıra
 * MALZEME adlarını da kapsar: "badem" yazınca Caramel Almond Frappe
 * çıkar, çünkü reçetede Badem Şurubu var.
 */

const FOLD: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
  â: 'a', î: 'i', û: 'u', à: 'a', á: 'a', è: 'e', é: 'e', ê: 'e'
};

/**
 * Türkçe duyarlı sadeleştirme. Önce 'tr' yerel ayarıyla küçültülür
 * (I→ı, İ→i doğru çalışsın), sonra aksanlar düşürülür — böylece
 * "cafe latte" yazan biri "Caffè Latte"yi bulur.
 */
export const norm = (s: string): string =>
  s.toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîûàáèéê]/g, (c) => FOLD[c] ?? c)
    .replace(/[^a-z0-9]+/g, ' ')
    // Tekrar eden harfler teke iner: "caffè latte" ve "cafe latte" aynı
    // dizeye düşsün. İki taraf da aynı işlemden geçtiği için eşleşme tutarlı.
    .replace(/(.)\1+/g, '$1')
    .trim();

export interface LessonHit {
  lesson: Lesson;
  module: Module;
  track: Track;
  /** İçecek Standartları yolundaki dersler reçetedir. */
  isRecipe: boolean;
  /** Eşleşmenin malzemeden geldiği durumda gösterilecek metin. */
  matchedIngredient?: string;
}

interface Indexed extends LessonHit {
  nTitle: string;
  nModule: string;
  nIngredients: { raw: string; n: string }[];
}

export const RECIPE_TRACK_ID = 'icecek-standartlari';

function ingredientsOf(lesson: Lesson): string[] {
  const out: string[] = [];
  for (const b of lesson.blocks) {
    if (b.type === 'cup') {
      b.layers.forEach((l) => out.push(l.name));
      if (b.dose) out.push(b.dose.name);
    } else if (b.type === 'spec') {
      b.rows.forEach((r) => out.push(r.label));
    }
  }
  return [...new Set(out)];
}

export function buildIndex(tracks: Track[], modules: Module[], lessons: Lesson[]): Indexed[] {
  const mById = new Map(modules.map((m) => [m.id, m]));
  const tById = new Map(tracks.map((t) => [t.id, t]));
  const out: Indexed[] = [];

  for (const lesson of lessons) {
    if (!lesson.published) continue;
    const module = mById.get(lesson.moduleId);
    if (!module || !module.published) continue;
    const track = tById.get(module.trackId);
    if (!track || !track.published) continue;

    out.push({
      lesson,
      module,
      track,
      isRecipe: track.id === RECIPE_TRACK_ID,
      nTitle: norm(lesson.title),
      nModule: norm(module.title),
      nIngredients: ingredientsOf(lesson).map((raw) => ({ raw, n: norm(raw) }))
    });
  }
  return out;
}

/**
 * Her kelime bir yerde geçmeli (VE araması). Sıralama: ders adının
 * başında geçen önce, sonra ders adının içinde, en sonra malzemede.
 */
export function searchLessons(index: Indexed[], query: string, limit = 40): LessonHit[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const words = q.split(' ').filter(Boolean);

  const scored: { hit: LessonHit; score: number }[] = [];

  for (const item of index) {
    let score = 0;
    let matchedIngredient: string | undefined;
    let ok = true;

    // Kelime başından eşleşme: "ube" yazınca "Ube Latte" gelsin, "Şube
    // açılış prosedürü" gelmesin (ş→s sadeleştirmesiyle "sube" içinde
    // "ube" geçiyordu).
    const at = (text: string, w: string) => text.startsWith(w) || text.includes(' ' + w);
    for (const w of words) {
      if (item.nTitle.startsWith(w)) score += 100;
      else if (at(item.nTitle, w)) score += 60;
      else if (at(item.nModule, w)) score += 20;
      else {
        const ing = item.nIngredients.find((x) => at(x.n, w));
        if (ing) {
          score += 12;
          matchedIngredient ??= ing.raw;
        } else {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    if (item.isRecipe) score += 5; // servis sırasında aranan çoğunlukla reçete
    score -= item.lesson.title.length * 0.05; // kısa ve tam eşleşme önde
    scored.push({ hit: { ...item, matchedIngredient }, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.hit);
}
