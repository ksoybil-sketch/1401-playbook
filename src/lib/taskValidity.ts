import type { Assignment, Lesson, Module, Track } from '../../shared/types';
import { isModuleVisible } from './progress';

/**
 * Geçersiz görev — hiç tamamlanamayacak görev (14.11.2026 kullanıcı kararı).
 *
 * Görev ancak hedefindeki herkes bitirince tamamlanmış sayılıyordu; şu
 * durumlarda sonsuza kadar "Açık · 0/0" kalıyor, gecikmiş sayılıyor ve
 * baristanın "Sözünün Eri" başarımını kalıcı olarak kilitliyordu:
 *  - hedefi kalmamış: mağazada aktif barista yok (Yeni ürün bütün aktif
 *    mağazalara görev açıyor) ya da kişiye özel görevin sahibi ayrıldı /
 *    başka mağazaya taşındı;
 *  - bağlı içerik yok: ders ya da modül silinmiş veya baristaya görünmüyor
 *    (yayından kaldırılmış, yolu kapatılmış).
 *
 * Geçersiz görev gecikmiş sayılmaz, sayaçlara ve başarımlara girmez.
 * Barista ana sayfası, Ekibim, panel Görevler ekranı ve badges.ts aynı
 * kararı buradan alır.
 */
export type TaskInvalidReason = 'icerik-yok' | 'hedef-yok';

export const TASK_INVALID_LABEL: Record<TaskInvalidReason, string> = {
  'icerik-yok': 'Bağlı ders ya da modül artık yok',
  'hedef-yok': 'Görevi yapacak barista kalmadı'
};

/** Görev hedefi olabilecek kişi (Barista belgesinin gereken alanları). */
export interface TaskTargetLike { id: string; storeId: string; active?: boolean }

export interface TaskValidityContext {
  modules: Module[];
  lessons: Lesson[];
  /** Verilirse yolu yayında olmayan modüller de "görünmüyor" sayılır. */
  tracks?: Track[] | null;
  /**
   * Verilirse hedef denetimi de yapılır (bkz. taskTargets). Verilmezse
   * (ör. baristanın kendi ekranı: kendisi zaten hedef) yalnızca içerik denetlenir.
   */
  baristas?: TaskTargetLike[] | null;
}

/** Görevin bağlı olduğu ders/modül var ve baristaya görünüyor mu? */
export function taskContentOk(a: Assignment, ctx: Pick<TaskValidityContext, 'modules' | 'lessons' | 'tracks'>): boolean {
  if (a.kind === 'module') {
    const m = ctx.modules.find((x) => x.id === a.targetId);
    return !!m && isModuleVisible(m, ctx.tracks);
  }
  // lesson / quiz: hedef bir ders (mini sınavda reçete).
  const l = ctx.lessons.find((x) => x.id === a.targetId);
  if (!l || !l.published) return false;
  const m = ctx.modules.find((x) => x.id === l.moduleId);
  // Mini sınav reçeteler ekranından açılır; orada yalnızca modülün yayında olması aranıyor.
  return !!m && (a.kind === 'quiz' ? !!m.published : isModuleVisible(m, ctx.tracks));
}

/** Görevin bugünkü hedefleri: mağazanın aktif baristaları (kişiye özelse yalnızca o kişi, hâlâ o mağazadaysa). */
export function taskTargets<T extends TaskTargetLike>(a: Assignment, baristas: T[]): T[] {
  return baristas.filter((b) => b.active !== false && b.storeId === a.storeId && (!a.baristaId || a.baristaId === b.id));
}

/** Görev geçersizse nedeni, geçerliyse null. */
export function taskInvalidReason(a: Assignment, ctx: TaskValidityContext): TaskInvalidReason | null {
  if (!taskContentOk(a, ctx)) return 'icerik-yok';
  if (ctx.baristas && taskTargets(a, ctx.baristas).length === 0) return 'hedef-yok';
  return null;
}

export const isTaskValid = (a: Assignment, ctx: TaskValidityContext): boolean => taskInvalidReason(a, ctx) === null;
