import type { ThemeRules } from './baristaThemes';
import type { Assignment, Attempt, Lesson, Module, Progress, Track } from '../../shared/types';
import type { IconName } from '../ui/Icon';
import { assignmentDone, assignmentDoneAt, isOverdue } from './progress';

/**
 * Başarımlar ve önlük rozetleri.
 *
 * Adlandırma: kitapçıktaki Rookie / Specialist / Senior / Pro, önlüğe
 * isimlikle birlikte takılan fiziksel ROZETTİR (kodda "title"). Onlara
 * giden yoldaki aşamalı ödül uygulamada BAŞARIM diye geçer (kodda
 * "badge"); "rozet" kelimesi yalnızca önlükteki için kullanılır.
 *
 * Kurallar kodda sabit değil: her başarımın eşikleri, süre penceresi ve
 * açık/kapalı durumu; her rozetin şartları, geçerlilik süresi ve veriliş
 * biçimi config/badges belgesinden okunur. Belgeyi Kahve Operasyon Direktörü
 * "Rozetler" ekranından düzenler; belge yoksa aşağıdaki varsayılanlar
 * geçerlidir. Barista bazındaki istisnalar (rozet geri alma, başarım geri
 * alma / elle verme) baristas/{id}.badgeOverrides alanındadır.
 *
 * Hiçbir sonuç veritabanına yazılmaz: rozetler ve başarımlar ilerleme,
 * sınav geçmişi ve görevlerden her açılışta yeniden hesaplanır.
 */

/* ------------------------------------------------------------------ */
/* Ayarlar                                                             */
/* ------------------------------------------------------------------ */

export type TitleId = 'rookie' | 'specialist' | 'senior' | 'pro';
export const TITLE_IDS: TitleId[] = ['rookie', 'specialist', 'senior', 'pro'];
export const TITLE_RANK: Record<TitleId, number> = { rookie: 1, specialist: 2, senior: 3, pro: 4 };

export interface BadgeSettings {
  enabled: boolean;
  /** Boşsa varsayılan ad. */
  title: string;
  /** Eşikler (başarıma göre: not, sayı, gün…). */
  params: Record<string, number>;
  /** Yalnızca son N günün sınav/ders verisi sayılır; 0 = tüm zamanlar. */
  windowDays: number;
}

export interface TitleSettings {
  label: string;
  /** Kaç başarım gerekir. */
  badges: number;
  /** Mutlaka sahip olunması gereken başarımlar. */
  required: string[];
  /** Geçilen modüllerin en iyi not ortalaması (0 = şart yok). */
  avg: number;
  /** Kıdem (gün). */
  days: number;
  /** Teslimden sonra kaç gün geçerli; 0 = süresiz. Süresi dolan rozet yeniden değerlendirilir. */
  validDays: number;
  /** auto: şartlar sağlanınca rozet barista ekranında görünür. approval: teslim/onay işaretlenene kadar "onay bekliyor". */
  mode: 'auto' | 'approval';
}

/** config/badges — Kahve Operasyon Direktörü'nün ayarları. Eksik alanlar varsayılandan gelir. */
export interface BadgeConfig {
  badges?: Record<string, Partial<BadgeSettings>>;
  titles?: Partial<Record<TitleId, Partial<TitleSettings>>>;
  /** Barista temalarının açılma kuralları (src/lib/baristaThemes.ts). */
  themes?: ThemeRules;
  updatedAt?: number;
  updatedByName?: string;
}

export interface OverrideMark { at: number; byName: string; reason: string }

/** baristas/{id}.badgeOverrides — barista bazında istisnalar. */
export interface BadgeOverrides {
  /** Geri alınan başarımlar: kazanılmış olsa da sayılmaz. */
  revoked?: Record<string, OverrideMark>;
  /** Elle verilen başarımlar (ör. barda uygulamalı değerlendirme). */
  granted?: Record<string, OverrideMark>;
  /** Geri alınan rozet: bu seviye ve üstü, kaldırılana (ya da `until`) kadar verilmez. */
  titleCap?: (OverrideMark & { from: TitleId; until?: number | null }) | null;
}

/* ------------------------------------------------------------------ */
/* Başarım tanımları                                                   */
/* ------------------------------------------------------------------ */

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
  /** Ayarlar (yoksa varsayılan). */
  config?: BadgeConfig | null;
  /** Barista bazında istisnalar. */
  overrides?: BadgeOverrides | null;
  /** Önlükte teslim edilmiş son rozet ve tarihi. */
  delivered?: TitleId | null;
  deliveredAt?: number | null;
}

export interface BadgeStatus {
  earned: boolean;
  /** İlerleme: [şu an, hedef] — kazanılmamış başarımda "ne kadar kaldı". */
  progress: [number, number];
}

export type BadgeGroup = 'seviye' | 'ustalik' | 'basari' | 'kidem';

export interface ParamDef { key: string; label: string; unit: string; def: number; min: number; max: number }

export interface BadgeDef {
  id: string;
  title: string;
  icon: IconName;
  group: BadgeGroup;
  params: ParamDef[];
  /** Kazanma koşulu — baristanın göreceği metin, güncel eşiklerle. */
  rule: (p: Record<string, number>) => string;
  check: (d: Derived, p: Record<string, number>) => BadgeStatus;
}

export const GROUP_LABEL: Record<BadgeGroup, string> = {
  seviye: 'Seviye bitirme',
  ustalik: 'Ustalık',
  basari: 'Başarı',
  kidem: 'Kıdem'
};

interface Derived extends BadgeContext {
  now: number;
  done: Attempt[];
  best: (moduleId: string) => number | null;
  passed: (moduleId: string, min?: number) => boolean;
  trackModules: (trackId: string) => Module[];
  days: number;
}

const DAY = 86400000;

/** windowDays > 0 ise yalnızca son N günün verisi. */
function derive(c: BadgeContext, windowDays = 0): Derived {
  const now = c.now ?? Date.now();
  const since = windowDays > 0 ? now - windowDays * DAY : 0;
  const done = c.attempts.filter((a) => a.submittedAt && !a.voided && a.submittedAt >= since)
    .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
  const progress: Progress = since
    ? {
        ...c.progress,
        lessons: Object.fromEntries(Object.entries(c.progress.lessons || {}).filter(([, t]) => t >= since)),
        modules: Object.fromEntries(Object.entries(c.progress.modules || {}).filter(([, r]) => r.passedAt >= since))
      }
    : c.progress;
  const best = (id: string) => {
    const scores = done.filter((a) => a.moduleId === id && a.passed).map((a) => a.score || 0);
    const p = progress.modules?.[id]?.score;
    if (p !== undefined) scores.push(p);
    return scores.length ? Math.max(...scores) : null;
  };
  const start = c.startedAt ? new Date(c.startedAt).getTime() : c.createdAt || now;
  return {
    ...c, progress, now, done, best,
    passed: (id, min = 0) => (best(id) ?? -1) >= min && !!progress.modules?.[id],
    trackModules: (tid) => c.modules.filter((m) => m.trackId === tid && m.published),
    days: Math.max(0, Math.floor((now - start) / DAY))
  };
}

const status = (n: number, of: number): BadgeStatus => ({ earned: n >= of, progress: [Math.min(n, of), Math.max(of, 1)] });
const all = (...xs: BadgeStatus[]): BadgeStatus => {
  const n = xs.reduce((s, x) => s + x.progress[0], 0);
  const of = xs.reduce((s, x) => s + x.progress[1], 0);
  return { earned: xs.every((x) => x.earned), progress: [n, of] };
};

function trackDone(d: Derived, trackId: string, avg: number): BadgeStatus {
  const mods = d.trackModules(trackId);
  if (!mods.length) return status(0, 1);
  const passed = mods.filter((m) => d.passed(m.id));
  const mean = passed.length ? passed.reduce((s, m) => s + (d.best(m.id) || 0), 0) / passed.length : 0;
  return all(status(passed.length, mods.length), status(passed.length === mods.length && mean >= avg ? 1 : 0, 1));
}

function modulesAt(d: Derived, ids: string[], min: number): BadgeStatus {
  const present = ids.filter((id) => d.modules.some((m) => m.id === id));
  if (!present.length) return status(0, 1);
  return status(present.filter((id) => d.passed(id, min)).length, present.length);
}

const lessonsOf = (d: Derived, moduleId: string) => d.lessons.filter((l) => l.moduleId === moduleId && l.published);
const lessonsDone = (d: Derived, moduleId: string) => {
  const ls = lessonsOf(d, moduleId);
  return status(ls.filter((l) => d.progress.lessons?.[l.id]).length, Math.max(ls.length, 1));
};

const P = (key: string, label: string, unit: string, def: number, min: number, max: number): ParamDef => ({ key, label, unit, def, min, max });
const NOT = (def: number) => P('min', 'En düşük not', '%', def, 50, 100);
const ORT = (def: number) => P('avg', 'Yol ortalaması', '%', def, 50, 100);

export const BADGES: BadgeDef[] = [
  // --- Seviye bitirme ---------------------------------------------------
  {
    id: 'seviye-oryantasyon', title: 'Oryantasyon', group: 'seviye', icon: 'flag', params: [NOT(80)],
    rule: (p) => `Oryantasyonun tüm derslerini bitir ve sınavını en az %${p.min} ile geç.`,
    check: (d, p) => all(lessonsDone(d, 'hos-geldin'), modulesAt(d, ['hos-geldin'], p.min))
  },
  {
    id: 'seviye-misafir', title: 'Misafir Deneyimi', group: 'seviye', icon: 'users', params: [ORT(85)],
    rule: (p) => `Misafir Deneyimi yolundaki tüm sınavları geç; yol ortalaman en az %${p.avg} olsun.`,
    check: (d, p) => trackDone(d, 'misafir-deneyimi', p.avg)
  },
  {
    id: 'seviye-icecek', title: 'İçecek Standartları', group: 'seviye', icon: 'coffee', params: [ORT(85)],
    rule: (p) => `İçecek Standartları yolundaki tüm sınavları geç; yol ortalaman en az %${p.avg} olsun.`,
    check: (d, p) => trackDone(d, 'icecek-standartlari', p.avg)
  },
  {
    id: 'seviye-isletme', title: 'İşletme Standartları', group: 'seviye', icon: 'store', params: [ORT(85)],
    rule: (p) => `İşletme Standartları yolundaki tüm sınavları geç; yol ortalaman en az %${p.avg} olsun.`,
    check: (d, p) => trackDone(d, 'isletme-standartlari', p.avg)
  },

  // --- Ustalık -----------------------------------------------------------
  {
    id: 'usta-espresso', title: 'Espresso Ustası', group: 'ustalik', icon: 'coffee', params: [NOT(90)],
    rule: (p) => `İtalyan Klasikler ve Sıcak Kahveler sınavlarının ikisini de en az %${p.min} ile geç.`,
    check: (d, p) => modulesAt(d, ['italyan-klasikler', 'sicak-kahveler'], p.min)
  },
  {
    id: 'usta-demleme', title: 'Demleme Ustası', group: 'ustalik', icon: 'clock', params: [NOT(90)],
    rule: (p) => `Demleme ve Türk Kahveleri'nin tüm derslerini bitir, sınavını en az %${p.min} ile geç.`,
    check: (d, p) => all(lessonsDone(d, 'demleme-turk'), modulesAt(d, ['demleme-turk'], p.min))
  },
  {
    id: 'usta-soguk', title: 'Soğuk Bar', group: 'ustalik', icon: 'snowflake', params: [NOT(85)],
    rule: (p) => `Soğuk Kahveler ve Soğuk İçecekler sınavlarını en az %${p.min} ile geç.`,
    check: (d, p) => modulesAt(d, ['soguk-kahveler', 'soguk-icecekler'], p.min)
  },
  {
    id: 'usta-misafir', title: 'Misafir Sever', group: 'ustalik', icon: 'award', params: [NOT(90)],
    rule: (p) => `Karşılama ve Memnuniyet-Şikayet sınavlarının ikisini de en az %${p.min} ile geç.`,
    check: (d, p) => modulesAt(d, ['misafir-karsilama', 'memnuniyet-sikayet'], p.min)
  },

  // --- Başarı -------------------------------------------------------------
  {
    id: 'tam-puan', title: 'Tam Puan', group: 'basari', icon: 'target', params: [P('count', 'Farklı modül', 'adet', 3, 1, 13)],
    rule: (p) => `${p.count} farklı modülün sınavından %100 al.`,
    check: (d, p) => status(new Set(d.done.filter((a) => a.score === 100).map((a) => a.moduleId)).size, p.count)
  },
  {
    id: 'ilk-seferde', title: 'İlk Seferde', group: 'basari', icon: 'flash', params: [P('count', 'Farklı modül', 'adet', 5, 1, 13)],
    rule: (p) => `${p.count} farklı modülün sınavını ilk denemende geç.`,
    check: (d, p) => {
      const first = new Map<string, Attempt>();
      d.done.forEach((a) => { if (!first.has(a.moduleId)) first.set(a.moduleId, a); });
      return status([...first.values()].filter((a) => a.passed).length, p.count);
    }
  },
  {
    id: 'azim', title: 'Azim', group: 'basari', icon: 'refresh', params: [P('fails', 'Kalış sayısı', 'kez', 2, 1, 5), NOT(85)],
    rule: (p) => `Bir sınavdan en az ${p.fails} kez kalıp sonra en az %${p.min} ile geç.`,
    check: (d, p) => {
      let step = 0;
      const byMod = new Map<string, Attempt[]>();
      d.done.forEach((a) => byMod.set(a.moduleId, [...(byMod.get(a.moduleId) || []), a]));
      for (const list of byMod.values()) {
        let fails = 0;
        for (const a of list) {
          if (!a.passed) fails++;
          else if (fails >= p.fails && (a.score || 0) >= p.min) { step = p.fails + 1; break; }
        }
        step = Math.max(step, Math.min(fails, p.fails));
      }
      return status(step, p.fails + 1);
    }
  },
  {
    id: 'hizli-dogru', title: 'Hızlı ve Doğru', group: 'basari', icon: 'clock',
    params: [P('questions', 'En az soru', 'soru', 10, 5, 30), NOT(95), P('timePct', 'Süre payı', '%', 50, 20, 90)],
    rule: (p) => `En az ${p.questions} soruluk bir sınavı %${p.min} ve üstü puanla, sürenin %${p.timePct}'inden kısa sürede bitir.`,
    check: (d, p) => status(d.done.some((a) => a.total >= p.questions && (a.score || 0) >= p.min
      && a.submittedAt! - a.startedAt <= a.total * 90000 * (p.timePct / 100)) ? 1 : 0, 1)
  },
  {
    id: 'seri', title: 'Seri', group: 'basari', icon: 'medal', params: [P('count', 'Arka arkaya sınav', 'sınav', 4, 2, 10), NOT(90)],
    rule: (p) => `Arka arkaya ${p.count} sınavı kalmadan, her birinde en az %${p.min} alarak geç.`,
    check: (d, p) => {
      let run = 0, max = 0;
      for (const a of d.done) { run = a.passed && (a.score || 0) >= p.min ? run + 1 : 0; max = Math.max(max, run); }
      return status(max, p.count);
    }
  },
  {
    id: 'kitap-kurdu', title: 'Kitap Kurdu', group: 'basari', icon: 'book', params: [P('pct', 'Biten ders oranı', '%', 100, 50, 100)],
    rule: (p) => p.pct >= 100 ? 'Akademideki yayındaki tüm dersleri bitir.' : `Akademideki derslerin en az %${p.pct}'ini bitir.`,
    check: (d, p) => {
      const pub = new Set(d.modules.filter((m) => m.published).map((m) => m.id));
      const ls = d.lessons.filter((l) => l.published && pub.has(l.moduleId));
      return status(ls.filter((l) => d.progress.lessons?.[l.id]).length, Math.max(1, Math.ceil(ls.length * p.pct / 100)));
    }
  },
  {
    id: 'istikrar', title: 'İstikrar', group: 'basari', icon: 'calendar',
    params: [P('weeks', 'Etkin hafta', 'hafta', 4, 1, 12), P('span', 'Bakılan dönem', 'hafta', 6, 2, 26)],
    rule: (p) => `Son ${p.span} haftanın en az ${p.weeks}'ünde ders bitir ya da sınava gir.`,
    check: (d, p) => {
      const weeks = new Set<number>();
      const from = d.now - p.span * 7 * DAY;
      const mark = (t: number) => { if (t >= from) weeks.add(Math.floor((d.now - t) / (7 * DAY))); };
      Object.values(d.progress.lessons || {}).forEach(mark);
      d.done.forEach((a) => mark(a.submittedAt!));
      return status(weeks.size, p.weeks);
    }
  },
  {
    id: 'gorev-adami', title: 'Sözünün Eri', group: 'basari', icon: 'clipboard', params: [P('count', 'Zamanında görev', 'görev', 5, 1, 30)],
    rule: (p) => `Sana atanan ${p.count} görevi son tarihinden önce bitir; gecikmiş görevin olmasın.`,
    check: (d, p) => {
      const onTime = d.assignments.filter((a) => {
        const at = assignmentDoneAt(a, d.progress);
        return at && (!a.dueAt || at <= a.dueAt);
      }).length;
      const late = d.assignments.some((a) => isOverdue(a, assignmentDone(a, d.progress)));
      return { earned: onTime >= p.count && !late, progress: [Math.min(onTime, p.count), p.count] };
    }
  },

  // --- Kıdem ----------------------------------------------------------------
  {
    id: 'kidem-6ay', title: 'Altı Ay', group: 'kidem', icon: 'calendar',
    params: [P('days', 'Kıdem', 'gün', 180, 30, 730), P('modules', 'Geçilen modül', 'modül', 6, 1, 13)],
    rule: (p) => `1401'de ${p.days} gününü doldur ve en az ${p.modules} modül geç.`,
    check: (d, p) => all(status(Math.min(d.days, p.days), p.days), status(Object.keys(d.progress.modules || {}).length, p.modules))
  },
  {
    id: 'kidem-1yil', title: 'Bir Yıl', group: 'kidem', icon: 'award', params: [P('days', 'Kıdem', 'gün', 365, 90, 1095)],
    rule: (p) => `1401'de ${p.days} gününü doldur ve yayındaki tüm modülleri geçmiş ol.`,
    check: (d, p) => {
      const pub = d.modules.filter((m) => m.published);
      return all(status(Math.min(d.days, p.days), p.days), status(pub.filter((m) => d.passed(m.id)).length, Math.max(pub.length, 1)));
    }
  }
];

/* ------------------------------------------------------------------ */
/* Rozetler (unvanlar)                                                 */
/* ------------------------------------------------------------------ */

export const DEFAULT_TITLES: Record<TitleId, TitleSettings> = {
  rookie: { label: 'Rookie', badges: 2, required: ['seviye-oryantasyon'], avg: 0, days: 0, validDays: 0, mode: 'auto' },
  specialist: { label: 'Specialist', badges: 6, required: ['seviye-oryantasyon', 'seviye-misafir'], avg: 85, days: 30, validDays: 0, mode: 'auto' },
  senior: { label: 'Senior', badges: 10, required: ['seviye-misafir', 'seviye-icecek', 'seviye-isletme'], avg: 88, days: 120, validDays: 0, mode: 'auto' },
  pro: { label: 'Pro', badges: 14, required: ['seviye-icecek', 'seviye-isletme', 'tam-puan', 'hizli-dogru', 'kidem-6ay'], avg: 92, days: 365, validDays: 0, mode: 'auto' }
};

export interface ResolvedConfig {
  badges: Record<string, BadgeSettings>;
  titles: Record<TitleId, TitleSettings>;
}

/** Ayar belgesini varsayılanlarla birleştirir; sınır dışı değerleri kırpar. */
export function resolveConfig(cfg?: BadgeConfig | null): ResolvedConfig {
  const badges: Record<string, BadgeSettings> = {};
  for (const b of BADGES) {
    const c = cfg?.badges?.[b.id] || {};
    const params: Record<string, number> = {};
    for (const p of b.params) {
      const v = Number(c.params?.[p.key]);
      params[p.key] = Number.isFinite(v) && c.params?.[p.key] !== undefined ? Math.min(p.max, Math.max(p.min, v)) : p.def;
    }
    badges[b.id] = {
      enabled: c.enabled !== false,
      title: (c.title || '').trim() || b.title,
      params,
      windowDays: Math.max(0, Number(c.windowDays) || 0)
    };
  }
  const titles = {} as Record<TitleId, TitleSettings>;
  for (const id of TITLE_IDS) {
    const d = DEFAULT_TITLES[id];
    const c = cfg?.titles?.[id] || {};
    titles[id] = {
      label: (c.label || '').trim() || d.label,
      badges: Math.max(0, c.badges ?? d.badges),
      required: (c.required ?? d.required).filter((r) => badges[r]?.enabled),
      avg: Math.min(100, Math.max(0, c.avg ?? d.avg)),
      days: Math.max(0, c.days ?? d.days),
      validDays: Math.max(0, c.validDays ?? d.validDays),
      mode: c.mode === 'approval' ? 'approval' : 'auto'
    };
  }
  return { badges, titles };
}

/** Geriye uyum: rozet tanımlarının liste hâli (Kurallar ekranı vb.). */
export interface TitleDef extends TitleSettings { id: TitleId }
export function titleList(cfg?: BadgeConfig | null): TitleDef[] {
  const r = resolveConfig(cfg);
  return TITLE_IDS.map((id) => ({ id, ...r.titles[id] }));
}
/** Varsayılan ayarlarla rozetler (ayar okunamazsa). */
export const TITLES: TitleDef[] = titleList(null);

export interface Requirement { label: string; met: boolean; detail?: string }

export type ReportBadge = Omit<BadgeDef, 'rule'> & BadgeStatus & {
  rule: string;
  /** Elle geri alındı / verildi. */
  revoked?: OverrideMark;
  granted?: OverrideMark;
};

export interface BadgeReport {
  badges: ReportBadge[];
  earned: number;
  avg: number;
  days: number;
  /** Baristanın şu anki rozeti (onaylı modda: teslim edilmiş olan). */
  title: TitleDef | null;
  /** Şartları sağlıyor ama onay/teslim bekliyor (onaylı mod). */
  pendingTitle: TitleDef | null;
  /** Şartları sağladığı en yüksek rozet (istisnalar uygulanmış). */
  qualified: TitleDef | null;
  /** Bir sonraki rozet ve eksikler. */
  next: { title: TitleDef; reqs: Requirement[] } | null;
  /** Teslim edilen rozetin geçerlilik süresi doldu. */
  expired: boolean;
  /** Rozet geri alındıysa: hangi seviyeden itibaren, neden. */
  capped: BadgeOverrides['titleCap'] | null;
  titles: TitleDef[];
}

function requirements(t: TitleDef, have: Set<string>, names: Record<string, string>, earned: number, avg: number, days: number): Requirement[] {
  return [
    { label: `${t.badges} başarım`, met: earned >= t.badges, detail: `${earned}/${t.badges}` },
    ...t.required.map((id) => ({ label: `${names[id] || id} başarımı`, met: have.has(id) })),
    ...(t.avg ? [{ label: `Not ortalaması %${t.avg}`, met: avg >= t.avg, detail: `%${avg}` }] : []),
    ...(t.days ? [{ label: `${t.days >= 365 ? `${Math.round(t.days / 365)} yıl` : `${t.days} gün`} kıdem`, met: days >= t.days, detail: `${days} gün` }] : [])
  ];
}

export function badgeReport(ctx: BadgeContext): BadgeReport {
  const cfg = resolveConfig(ctx.config);
  const now = ctx.now ?? Date.now();
  const cache = new Map<number, Derived>();
  const dFor = (w: number) => cache.get(w) ?? cache.set(w, derive(ctx, w)).get(w)!;
  const ov = ctx.overrides || {};

  const badges: ReportBadge[] = BADGES.filter((b) => cfg.badges[b.id].enabled).map((b) => {
    const s = cfg.badges[b.id];
    const st = b.check(dFor(s.windowDays), s.params);
    const revoked = ov.revoked?.[b.id];
    const granted = ov.granted?.[b.id];
    const earned = revoked ? false : granted ? true : st.earned;
    return {
      ...b, title: s.title, rule: b.rule(s.params) + (s.windowDays ? ` (son ${s.windowDays} gün)` : ''),
      earned, progress: earned ? [st.progress[1], st.progress[1]] : st.progress,
      ...(revoked ? { revoked } : {}), ...(granted && !revoked ? { granted } : {})
    };
  });
  const have = new Set(badges.filter((b) => b.earned).map((b) => b.id));
  const names = Object.fromEntries(badges.map((b) => [b.id, b.title]));
  const d0 = dFor(0);
  const passedIds = Object.keys(ctx.progress.modules || {});
  const avg = passedIds.length ? Math.round(passedIds.reduce((s, id) => s + (d0.best(id) || 0), 0) / passedIds.length) : 0;

  const titles = TITLE_IDS.map((id) => ({ id, ...cfg.titles[id] }));
  const cap = ov.titleCap && (!ov.titleCap.until || ov.titleCap.until > now) ? ov.titleCap : null;
  let qualified: TitleDef | null = null;
  let next: BadgeReport['next'] = null;
  for (const t of titles) {
    const reqs = requirements(t, have, names, have.size, avg, d0.days);
    if (cap && TITLE_RANK[t.id] >= TITLE_RANK[cap.from]) {
      next = { title: t, reqs: [{ label: `Rozet geri alındı: ${cap.reason}`, met: false, detail: cap.until ? `${new Date(cap.until).toLocaleDateString('tr-TR')}'e kadar` : undefined }, ...reqs] };
      break;
    }
    if (reqs.every((r) => r.met)) qualified = t;
    else { next = { title: t, reqs }; break; }
  }

  // Teslim edilen rozet ve geçerlilik süresi.
  const delivered = ctx.delivered ? titles.find((t) => t.id === ctx.delivered) || null : null;
  const deliveredLive = delivered && (!cap || TITLE_RANK[delivered.id] < TITLE_RANK[cap.from]) ? delivered : null;
  const expired = !!(deliveredLive && deliveredLive.validDays && ctx.deliveredAt && ctx.deliveredAt + deliveredLive.validDays * DAY < now);

  let title: TitleDef | null = qualified;
  let pendingTitle: TitleDef | null = null;
  if (qualified && qualified.mode === 'approval') {
    // Onaylı modda barista, teslim edilene kadar bir alt (teslim edilmiş) rozette görünür.
    const shown = deliveredLive && !expired && TITLE_RANK[deliveredLive.id] <= TITLE_RANK[qualified.id] ? deliveredLive : null;
    if (!shown || TITLE_RANK[shown.id] < TITLE_RANK[qualified.id]) pendingTitle = qualified;
    title = shown;
    // Alt seviyeler otomatik moddaysa onlar gösterilir.
    if (!title) {
      for (let i = TITLE_RANK[qualified.id] - 2; i >= 0; i--) if (titles[i].mode === 'auto') { title = titles[i]; break; }
    }
  }
  return { badges, earned: have.size, avg, days: d0.days, title, pendingTitle, qualified, next, expired, capped: cap, titles };
}

/** Barista belgesinden rozet hesabına giren alanlar (kıdem, istisnalar, teslim). */
export function fromBarista(b?: {
  startedAt?: string; createdAt?: number; badgeOverrides?: BadgeOverrides | null;
  apronBadge?: TitleId | null; apronBadgeAt?: number | null;
} | null): Pick<BadgeContext, 'startedAt' | 'createdAt' | 'overrides' | 'delivered' | 'deliveredAt'> {
  return {
    startedAt: b?.startedAt, createdAt: b?.createdAt, overrides: b?.badgeOverrides || null,
    delivered: b?.apronBadge || null, deliveredAt: b?.apronBadgeAt || null
  };
}
