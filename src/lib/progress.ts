import type { Assignment, Lesson, Module, Progress, Track } from '../../shared/types';

export const EMPTY_PROGRESS: Progress = { baristaId: '', storeId: '', lessons: {}, modules: {}, updatedAt: 0 };

/**
 * Baristaya görünen modül: modül yayında VE eğitim yolu yayında. Yol
 * kapatılınca (ya da silinince) modülleri yerinde kalıyor; yalnızca
 * m.published'a bakan hesaplar (genel yüzde, Kitap Kurdu, Bir Yıl) o
 * modülleri saymaya devam edip %100'ü ulaşılamaz kılıyordu.
 * `tracks` verilmezse yalnızca modülün kendi yayın durumuna bakılır.
 */
export function isModuleVisible(m: Module, tracks?: Track[] | null): boolean {
  return !!m.published && (!tracks || tracks.some((t) => t.id === m.trackId && t.published));
}
export const visibleModules = (modules: Module[], tracks?: Track[] | null): Module[] =>
  modules.filter((m) => isModuleVisible(m, tracks));

/** Kilit hesabı için bağlam: modül listesi (ve yollar) verilirse önkoşulun varlığı/görünürlüğü denetlenir. */
export interface LockScope { modules?: Module[] | null; tracks?: Track[] | null }

/**
 * Modül kilitli mi? Önkoşul modülü silinmiş ya da baristaya görünmüyorsa
 * kilit yok sayılır: yoksa sonraki modül sonsuza kadar kilitli kalıyordu.
 * `scope.modules` verilmezse (eski çağrılar) eski davranış: önkoşul geçilmediyse kilitli.
 */
export function isLocked(mod: Module, progress: Progress, scope?: LockScope): boolean {
  const pre = mod.prerequisiteId;
  if (!pre || pre === mod.id || progress.modules?.[pre]) return false;
  if (scope?.modules?.length) {
    const p = scope.modules.find((m) => m.id === pre);
    if (!p || !isModuleVisible(p, scope.tracks)) return false;
  }
  return true;
}

export interface ModuleState {
  lessons: Lesson[];
  lessonsDone: number;
  passed: boolean;
  score: number | null;
  locked: boolean;
  /** 0–100: derslerin %70'i + sınav %30 */
  percent: number;
}

export function moduleState(mod: Module, allLessons: Lesson[], progress: Progress, scope?: LockScope): ModuleState {
  const lessons = allLessons.filter((l) => l.moduleId === mod.id && l.published);
  const lessonsDone = lessons.filter((l) => progress.lessons?.[l.id]).length;
  const result = progress.modules?.[mod.id];
  const passed = !!result;
  const locked = isLocked(mod, progress, scope);
  const percent = passed ? 100 : lessons.length ? Math.round((lessonsDone / lessons.length) * 70) : 0;
  return { lessons, lessonsDone, passed, score: result?.score ?? null, locked, percent };
}

export function trackPercent(track: Track, modules: Module[], lessons: Lesson[], progress: Progress): number {
  const mods = modules.filter((m) => m.trackId === track.id && m.published);
  if (!mods.length) return 0;
  return Math.round(mods.reduce((sum, m) => sum + moduleState(m, lessons, progress).percent, 0) / mods.length);
}

/**
 * Baristaya görünen bütün modüller üzerinden genel ilerleme.
 * `tracks` verilirse yolu yayında olmayan modüller sayılmaz (verilmeli).
 */
export function overallPercent(modules: Module[], lessons: Lesson[], progress: Progress, tracks?: Track[] | null): number {
  const mods = visibleModules(modules, tracks);
  if (!mods.length) return 0;
  return Math.round(mods.reduce((sum, m) => sum + moduleState(m, lessons, progress).percent, 0) / mods.length);
}

export function assignmentDone(a: Assignment, progress: Progress | null | undefined): boolean {
  if (!progress) return false;
  return a.kind === 'lesson' ? !!progress.lessons?.[a.targetId] : a.kind === 'quiz' ? !!progress.quizzes?.[a.targetId] : !!progress.modules?.[a.targetId];
}

export function assignmentDoneAt(a: Assignment, progress: Progress | null | undefined): number | null {
  if (!progress) return null;
  return a.kind === 'lesson' ? progress.lessons?.[a.targetId] ?? null
    : a.kind === 'quiz' ? progress.quizzes?.[a.targetId]?.passedAt ?? null
      : progress.modules?.[a.targetId]?.passedAt ?? null;
}

/** Ders sonrası önerilecek bir sonraki ders: ilk tamamlanmamış, kilitsiz modülün ilk tamamlanmamış dersi. */
export function nextLesson(tracks: Track[], modules: Module[], lessons: Lesson[], progress: Progress): { lesson: Lesson; module: Module } | null {
  for (const tr of tracks.filter((x) => x.published)) {
    for (const m of modules.filter((x) => x.trackId === tr.id && x.published)) {
      const st = moduleState(m, lessons, progress, { modules, tracks });
      if (st.locked || st.passed) continue;
      const l = st.lessons.find((x) => !progress.lessons?.[x.id]);
      if (l) return { lesson: l, module: m };
    }
  }
  return null;
}

export function isOverdue(a: Assignment, done: boolean): boolean {
  return !done && !!a.dueAt && a.dueAt < Date.now();
}
