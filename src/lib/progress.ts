import type { Assignment, Lesson, Module, Progress, Track } from '../../shared/types';

export const EMPTY_PROGRESS: Progress = { baristaId: '', storeId: '', lessons: {}, modules: {}, updatedAt: 0 };

export interface ModuleState {
  lessons: Lesson[];
  lessonsDone: number;
  passed: boolean;
  score: number | null;
  locked: boolean;
  /** 0–100: derslerin %70'i + sınav %30 */
  percent: number;
}

export function moduleState(mod: Module, allLessons: Lesson[], progress: Progress): ModuleState {
  const lessons = allLessons.filter((l) => l.moduleId === mod.id && l.published);
  const lessonsDone = lessons.filter((l) => progress.lessons?.[l.id]).length;
  const result = progress.modules?.[mod.id];
  const passed = !!result;
  const locked = !!mod.prerequisiteId && !progress.modules?.[mod.prerequisiteId];
  const percent = passed ? 100 : lessons.length ? Math.round((lessonsDone / lessons.length) * 70) : 0;
  return { lessons, lessonsDone, passed, score: result?.score ?? null, locked, percent };
}

export function trackPercent(track: Track, modules: Module[], lessons: Lesson[], progress: Progress): number {
  const mods = modules.filter((m) => m.trackId === track.id && m.published);
  if (!mods.length) return 0;
  return Math.round(mods.reduce((sum, m) => sum + moduleState(m, lessons, progress).percent, 0) / mods.length);
}

/** Tüm yayındaki modüller üzerinden genel ilerleme. */
export function overallPercent(modules: Module[], lessons: Lesson[], progress: Progress): number {
  const mods = modules.filter((m) => m.published);
  if (!mods.length) return 0;
  return Math.round(mods.reduce((sum, m) => sum + moduleState(m, lessons, progress).percent, 0) / mods.length);
}

export function assignmentDone(a: Assignment, progress: Progress | null | undefined): boolean {
  if (!progress) return false;
  return a.kind === 'lesson' ? !!progress.lessons?.[a.targetId] : !!progress.modules?.[a.targetId];
}

export function assignmentDoneAt(a: Assignment, progress: Progress | null | undefined): number | null {
  if (!progress) return null;
  return a.kind === 'lesson' ? progress.lessons?.[a.targetId] ?? null : progress.modules?.[a.targetId]?.passedAt ?? null;
}

/** Ders sonrası önerilecek bir sonraki ders: ilk tamamlanmamış, kilitsiz modülün ilk tamamlanmamış dersi. */
export function nextLesson(tracks: Track[], modules: Module[], lessons: Lesson[], progress: Progress): { lesson: Lesson; module: Module } | null {
  for (const tr of tracks.filter((x) => x.published)) {
    for (const m of modules.filter((x) => x.trackId === tr.id && x.published)) {
      const st = moduleState(m, lessons, progress);
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
