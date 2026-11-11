import type { Assignment, Attempt, Lesson, Module, Progress, Track } from '../../shared/types';
import type { IconName } from '../ui/Icon';
import { assignmentDone, assignmentDoneAt, isOverdue } from './progress';

/**
 * Başarımlar ve önlük rozetleri.
 *
 * Adlandırma: kitapçıktaki Rookie / Specialist / Senior / Pro, önlüğe
 * isimlikle birlikte takılan fiziksel ROZETTİR (kodda "title"). Onlara
 * giden yoldaki 18 aşamalı ödül uygulamada BAŞARIM diye geçer (kodda
 * "badge"); "rozet" kelimesi yalnızca önlükteki için kullanılır.
 *
 * İşletme kitapçığı: "Uygulama içindeki eğitim kurları ve o kurların
 * sınavlarından her aşamada geçtikten sonra o seviyenin bitirme rozetini
 * almaya hak kazanacak belirli rozet sayılarına göre belirlenecek olan
 * Rookie, Specialist, Senior ve Pro rozetleri ile personel içi unvan
 * kazanımı alacaktır. Rozetler 1401 önlüklerinde isimlikleri ile takılı
 * olarak durmak zorundadır."
 *
 * Bu yüzden rozet "modülü geçtin" demek değildir. Her rozet birden çok
 * koşul ister (not eşiği, ilk denemede geçmek, süre, istikrar, kıdem…).
 * Unvan ise rozet SAYISI + o seviyenin zorunlu bitirme rozeti + not
 * ortalaması + kıdem ile belirlenir.
 *
 * Hiçbir şey veritabanına yazılmaz: rozetler ilerleme, sınav geçmişi ve
 * görevlerden her açılışta yeniden hesaplanır. Böylece kural değişirse
 * herkes için aynı anda değişir ve el ile "rozet verme" diye bir açık
 * kapı olmaz.
 */

export interface BadgeContext {
  tracks: Track[];
  modules: Module[];
  lessons: Lesson[];
  progress: Progress;
  /** Bu baristanın tamamlanmış (puanlanmış, iptal edilmemiş) denemeleri. */
  attempts: Attempt[];
  assignments: Assignment[];
  /** İşe başlama (YYYY-AA-GG) */
  startedAt?: string;
  createdAt?: number;
  now?: number;
}

export interface BadgeStatus {
  earned: boolean;
  /** İlerleme: [şu an, hedef] — kazanılmamış rozette "ne kadar kaldı". */
  progress: [number, number];
}

export type BadgeGroup = 'seviye' | 'ustalik' | 'basari' | 'kidem';

export interface BadgeDef {
  id: string;
  title: string;
  /** Kazanma koşulu — baristanın göreceği metin. */
  rule: string;
  icon: IconName;
  group: BadgeGroup;
  check: (c: Derived) => BadgeStatus;
}

export const GROUP_LABEL: Record<BadgeGroup, string> = {
  seviye: 'Seviye bitirme',
  ustalik: 'Ustalık',
  basari: 'Başarı',
  kidem: 'Kıdem'
};

/* ------------------------------------------------------------------ */
/* Türetilmiş veri                                                     */
/* ------------------------------------------------------------------ */

interface Derived extends BadgeContext {
  now: number;
  done: Attempt[];
  best: (moduleId: string) => number | null;
  passed: (moduleId: string, min?: number) => boolean;
  trackModules: (trackId: string) => Module[];
  days: number;
}

const DAY = 86400000;

function derive(c: BadgeContext): Derived {
  const now = c.now ?? Date.now();
  const done = c.attempts.filter((a) => a.submittedAt && !a.voided).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
  const best = (id: string) => {
    const scores = done.filter((a) => a.moduleId === id && a.passed).map((a) => a.score || 0);
    const p = c.progress.modules?.[id]?.score;
    if (p !== undefined) scores.push(p);
    return scores.length ? Math.max(...scores) : null;
  };
  const start = c.startedAt ? new Date(c.startedAt).getTime() : c.createdAt || now;
  return {
    ...c, now, done, best,
    passed: (id, min = 0) => (best(id) ?? -1) >= min && !!c.progress.modules?.[id],
    trackModules: (tid) => c.modules.filter((m) => m.trackId === tid && m.published),
    days: Math.max(0, Math.floor((now - start) / DAY))
  };
}

const status = (n: number, of: number): BadgeStatus => ({ earned: n >= of, progress: [Math.min(n, of), of] });
const all = (...xs: BadgeStatus[]): BadgeStatus => {
  const n = xs.reduce((s, x) => s + x.progress[0], 0);
  const of = xs.reduce((s, x) => s + x.progress[1], 0);
  return { earned: xs.every((x) => x.earned), progress: [n, of] };
};

/** Yoldaki tüm modülleri geç, yol ortalaması ≥ avg. */
function trackDone(d: Derived, trackId: string, avg: number): BadgeStatus {
  const mods = d.trackModules(trackId);
  if (!mods.length) return status(0, 1);
  const passed = mods.filter((m) => d.passed(m.id));
  const mean = passed.length ? passed.reduce((s, m) => s + (d.best(m.id) || 0), 0) / passed.length : 0;
  return all(status(passed.length, mods.length), status(passed.length === mods.length && mean >= avg ? 1 : 0, 1));
}

/** Modüllerin hepsini en az `min` ile geç. */
function modulesAt(d: Derived, ids: string[], min: number): BadgeStatus {
  const present = ids.filter((id) => d.modules.some((m) => m.id === id));
  if (!present.length) return status(0, 1);
  return status(present.filter((id) => d.passed(id, min)).length, present.length);
}

function lessonsOf(d: Derived, moduleId: string) {
  return d.lessons.filter((l) => l.moduleId === moduleId && l.published);
}

/* ------------------------------------------------------------------ */
/* Katalog                                                             */
/* ------------------------------------------------------------------ */

export const BADGES: BadgeDef[] = [
  // --- Seviye bitirme: her eğitim yolunun sonu ------------------------
  {
    id: 'seviye-oryantasyon', title: 'Oryantasyon', group: 'seviye', icon: 'flag',
    rule: 'Oryantasyonun tüm derslerini bitir ve sınavını en az %80 ile geç.',
    check: (d) => {
      const ls = lessonsOf(d, 'hos-geldin');
      return all(status(ls.filter((l) => d.progress.lessons?.[l.id]).length, Math.max(ls.length, 1)), modulesAt(d, ['hos-geldin'], 80));
    }
  },
  {
    id: 'seviye-misafir', title: 'Misafir Deneyimi', group: 'seviye', icon: 'users',
    rule: 'Misafir Deneyimi yolundaki tüm sınavları geç; yol ortalaman en az %85 olsun.',
    check: (d) => trackDone(d, 'misafir-deneyimi', 85)
  },
  {
    id: 'seviye-icecek', title: 'İçecek Standartları', group: 'seviye', icon: 'coffee',
    rule: 'İçecek Standartları yolundaki altı sınavın hepsini geç; yol ortalaman en az %85 olsun.',
    check: (d) => trackDone(d, 'icecek-standartlari', 85)
  },
  {
    id: 'seviye-isletme', title: 'İşletme Standartları', group: 'seviye', icon: 'store',
    rule: 'Açılış-kapanış, ürün kabul ve şube düzeni sınavlarını geç; yol ortalaman en az %85 olsun.',
    check: (d) => trackDone(d, 'isletme-standartlari', 85)
  },

  // --- Ustalık: belirli alanlarda yüksek not --------------------------
  {
    id: 'usta-espresso', title: 'Espresso Ustası', group: 'ustalik', icon: 'coffee',
    rule: 'İtalyan Klasikler ve Sıcak Kahveler sınavlarının ikisini de en az %90 ile geç.',
    check: (d) => modulesAt(d, ['italyan-klasikler', 'sicak-kahveler'], 90)
  },
  {
    id: 'usta-demleme', title: 'Demleme Ustası', group: 'ustalik', icon: 'clock',
    rule: 'Demleme ve Türk Kahveleri\'nin tüm derslerini bitir, sınavını en az %90 ile geç.',
    check: (d) => {
      const ls = lessonsOf(d, 'demleme-turk');
      return all(status(ls.filter((l) => d.progress.lessons?.[l.id]).length, Math.max(ls.length, 1)), modulesAt(d, ['demleme-turk'], 90));
    }
  },
  {
    id: 'usta-soguk', title: 'Soğuk Bar', group: 'ustalik', icon: 'snowflake',
    rule: 'Soğuk Kahveler ve Soğuk İçecekler sınavlarını en az %85 ile geç.',
    check: (d) => modulesAt(d, ['soguk-kahveler', 'soguk-icecekler'], 85)
  },
  {
    id: 'usta-misafir', title: 'Misafir Sever', group: 'ustalik', icon: 'award',
    rule: 'Karşılama ve Memnuniyet-Şikayet sınavlarının ikisini de en az %90 ile geç.',
    check: (d) => modulesAt(d, ['misafir-karsilama', 'memnuniyet-sikayet'], 90)
  },

  // --- Başarı: nasıl geçtiğin -----------------------------------------
  {
    id: 'tam-puan', title: 'Tam Puan', group: 'basari', icon: 'target',
    rule: 'Üç farklı modülün sınavından %100 al.',
    check: (d) => status(new Set(d.done.filter((a) => a.score === 100).map((a) => a.moduleId)).size, 3)
  },
  {
    id: 'ilk-seferde', title: 'İlk Seferde', group: 'basari', icon: 'flash',
    rule: 'Beş farklı modülün sınavını ilk denemende geç.',
    check: (d) => {
      const first = new Map<string, Attempt>();
      d.done.forEach((a) => { if (!first.has(a.moduleId)) first.set(a.moduleId, a); });
      return status([...first.values()].filter((a) => a.passed).length, 5);
    }
  },
  {
    id: 'azim', title: 'Azim', group: 'basari', icon: 'refresh',
    rule: 'Bir sınavdan en az iki kez kalıp sonra en az %85 ile geç.',
    check: (d) => {
      // Adımlar: 1. kalış, 2. kalış, ardından %85+ ile geçiş.
      let bestStep = 0;
      const byMod = new Map<string, Attempt[]>();
      d.done.forEach((a) => byMod.set(a.moduleId, [...(byMod.get(a.moduleId) || []), a]));
      for (const list of byMod.values()) {
        let fails = 0;
        for (const a of list) {
          if (!a.passed) fails++;
          else if (fails >= 2 && (a.score || 0) >= 85) { bestStep = 3; break; }
        }
        bestStep = Math.max(bestStep, Math.min(fails, 2));
      }
      return status(bestStep, 3);
    }
  },
  {
    id: 'hizli-dogru', title: 'Hızlı ve Doğru', group: 'basari', icon: 'clock',
    rule: 'En az 10 soruluk bir sınavı %95 ve üstü puanla, sürenin yarısından kısa sürede bitir.',
    check: (d) => status(d.done.some((a) => a.total >= 10 && (a.score || 0) >= 95
      && a.submittedAt! - a.startedAt <= a.total * 90000 * 0.5) ? 1 : 0, 1)
  },
  {
    id: 'seri', title: 'Seri', group: 'basari', icon: 'medal',
    rule: 'Arka arkaya dört sınavı kalmadan, her birinde en az %90 alarak geç.',
    check: (d) => {
      let run = 0, max = 0;
      for (const a of d.done) { run = a.passed && (a.score || 0) >= 90 ? run + 1 : 0; max = Math.max(max, run); }
      return status(max, 4);
    }
  },
  {
    id: 'kitap-kurdu', title: 'Kitap Kurdu', group: 'basari', icon: 'book',
    rule: 'Akademideki yayındaki tüm dersleri bitir.',
    check: (d) => {
      const pub = new Set(d.modules.filter((m) => m.published).map((m) => m.id));
      const ls = d.lessons.filter((l) => l.published && pub.has(l.moduleId));
      return status(ls.filter((l) => d.progress.lessons?.[l.id]).length, Math.max(ls.length, 1));
    }
  },
  {
    id: 'istikrar', title: 'İstikrar', group: 'basari', icon: 'calendar',
    rule: 'Son altı haftanın en az dördünde ders bitir ya da sınava gir.',
    check: (d) => {
      const weeks = new Set<number>();
      const from = d.now - 42 * DAY;
      const mark = (t: number) => { if (t >= from) weeks.add(Math.floor((d.now - t) / (7 * DAY))); };
      Object.values(d.progress.lessons || {}).forEach(mark);
      d.done.forEach((a) => mark(a.submittedAt!));
      return status(weeks.size, 4);
    }
  },
  {
    id: 'gorev-adami', title: 'Sözünün Eri', group: 'basari', icon: 'clipboard',
    rule: 'Sana atanan beş görevi son tarihinden önce bitir; gecikmiş görevin olmasın.',
    check: (d) => {
      const onTime = d.assignments.filter((a) => {
        const at = assignmentDoneAt(a, d.progress);
        return at && (!a.dueAt || at <= a.dueAt);
      }).length;
      const late = d.assignments.some((a) => isOverdue(a, assignmentDone(a, d.progress)));
      return { earned: onTime >= 5 && !late, progress: [Math.min(onTime, 5), 5] };
    }
  },

  // --- Kıdem: zaman + birikim -----------------------------------------
  {
    id: 'kidem-6ay', title: 'Altı Ay', group: 'kidem', icon: 'calendar',
    rule: '1401\'de altı ayını doldur ve en az altı modül geç.',
    check: (d) => all(status(Math.min(d.days, 180), 180), status(Object.keys(d.progress.modules || {}).length, 6))
  },
  {
    id: 'kidem-1yil', title: 'Bir Yıl', group: 'kidem', icon: 'award',
    rule: '1401\'de bir yılını doldur ve yayındaki tüm modülleri geçmiş ol.',
    check: (d) => {
      const pub = d.modules.filter((m) => m.published);
      return all(status(Math.min(d.days, 365), 365), status(pub.filter((m) => d.passed(m.id)).length, Math.max(pub.length, 1)));
    }
  }
];

/* ------------------------------------------------------------------ */
/* Unvanlar                                                            */
/* ------------------------------------------------------------------ */

export type TitleId = 'rookie' | 'specialist' | 'senior' | 'pro';

export interface TitleDef {
  id: TitleId;
  label: string;
  /** Kaç rozet gerekir. */
  badges: number;
  /** Mutlaka sahip olunması gereken rozetler. */
  required: string[];
  /** Geçilen modüllerin en iyi not ortalaması. */
  avg: number;
  /** Kıdem (gün). */
  days: number;
}

export const TITLES: TitleDef[] = [
  { id: 'rookie', label: 'Rookie', badges: 2, required: ['seviye-oryantasyon'], avg: 0, days: 0 },
  { id: 'specialist', label: 'Specialist', badges: 6, required: ['seviye-oryantasyon', 'seviye-misafir'], avg: 85, days: 30 },
  { id: 'senior', label: 'Senior', badges: 10, required: ['seviye-misafir', 'seviye-icecek', 'seviye-isletme'], avg: 88, days: 120 },
  { id: 'pro', label: 'Pro', badges: 14, required: ['seviye-icecek', 'seviye-isletme', 'tam-puan', 'hizli-dogru', 'kidem-6ay'], avg: 92, days: 365 }
];

export interface Requirement { label: string; met: boolean; detail?: string }

export interface BadgeReport {
  badges: (BadgeDef & BadgeStatus)[];
  earned: number;
  avg: number;
  days: number;
  /** Şu anki unvan (yoksa null — henüz Rookie bile değil). */
  title: TitleDef | null;
  /** Bir sonraki unvan ve eksikler. */
  next: { title: TitleDef; reqs: Requirement[] } | null;
}

function requirements(t: TitleDef, have: Set<string>, earned: number, avg: number, days: number): Requirement[] {
  const name = (id: string) => BADGES.find((b) => b.id === id)?.title || id;
  return [
    { label: `${t.badges} başarım`, met: earned >= t.badges, detail: `${earned}/${t.badges}` },
    ...t.required.map((id) => ({ label: `${name(id)} başarımı`, met: have.has(id) })),
    ...(t.avg ? [{ label: `Not ortalaması %${t.avg}`, met: avg >= t.avg, detail: `%${avg}` }] : []),
    ...(t.days ? [{ label: `${t.days >= 365 ? `${Math.round(t.days / 365)} yıl` : `${t.days} gün`} kıdem`, met: days >= t.days, detail: `${days} gün` }] : [])
  ];
}

export function badgeReport(ctx: BadgeContext): BadgeReport {
  const d = derive(ctx);
  const badges = BADGES.map((b) => ({ ...b, ...b.check(d) }));
  const have = new Set(badges.filter((b) => b.earned).map((b) => b.id));
  const passedIds = Object.keys(ctx.progress.modules || {});
  const avg = passedIds.length ? Math.round(passedIds.reduce((s, id) => s + (d.best(id) || 0), 0) / passedIds.length) : 0;
  let title: TitleDef | null = null;
  let next: BadgeReport['next'] = null;
  for (const t of TITLES) {
    const reqs = requirements(t, have, have.size, avg, d.days);
    if (reqs.every((r) => r.met)) title = t;
    else { next = { title: t, reqs }; break; }
  }
  return { badges, earned: have.size, avg, days: d.days, title, next };
}
