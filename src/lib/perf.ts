import { ACTIVITY_LOG, record } from '../demo/log';

/**
 * Süre ölçümü: bir akışın (sınav başlatma, teslim) her adımı kaç
 * milisaniye sürdü. Yalnızca demo ve emülatör paketinde demo kaydına
 * "ölçüm" satırı olarak düşer; canlı pakette hiçbir şey yazmaz.
 *
 *   const sw = stopwatch('Sınav başlatma', { modül: mod.id });
 *   await a(); sw.lap('açık denemeler');
 *   ...
 *   sw.done();
 */
export interface Stopwatch {
  lap(step: string): void;
  note(key: string, value: unknown): void;
  done(extra?: Record<string, unknown>): number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function stopwatch(label: string, info: Record<string, unknown> = {}): Stopwatch {
  const t0 = now();
  let last = t0;
  const steps: Record<string, number> = {};
  const notes: Record<string, unknown> = { ...info };
  return {
    lap(step) {
      const t = now();
      steps[step] = Math.round(t - last);
      last = t;
    },
    note(key, value) { notes[key] = value; },
    done(extra) {
      const total = Math.round(now() - t0);
      if (ACTIVITY_LOG) record(null, 'ölçüm', { label, op: `${total} ms`, data: { toplam: total, adımlar: steps, ...notes, ...extra } });
      return total;
    }
  };
}

/** Tek bir ölçüm satırı (açılış süresi gibi). */
export function measure(label: string, ms: number, data: Record<string, unknown> = {}) {
  if (ACTIVITY_LOG) record(null, 'ölçüm', { label, op: `${Math.round(ms)} ms`, data: { toplam: Math.round(ms), ...data } });
}
