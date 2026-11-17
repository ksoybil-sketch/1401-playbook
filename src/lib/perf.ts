import { ACTIVITY_LOG, record } from '../demo/log';
import { USE_EMULATOR } from '../api/firebase';

/**
 * Süre ölçümü: bir akışın (sınav başlatma, teslim) her adımı kaç
 * milisaniye sürdü.
 *
 *   const sw = stopwatch('Sınav başlatma', { modül: mod.id });
 *   await a(); sw.lap('açık denemeler');
 *   ...
 *   sw.done();
 *
 * İki yere gider:
 *   - Demo ve emülatör paketinde demo kaydına "ölçüm" satırı (eskiden tek yol).
 *   - Yayında Firebase Performance Monitoring'e özel iz (custom trace).
 *
 * Performance Monitoring Spark planında ücretsizdir ve Firestore okuma/yazma
 * kotasına dokunmaz. Kişi kimliği göndermez: yalnızca süre, ekran yolu, cihaz
 * ve ağ türü. Veri, uygulamanın bütün verisini zaten işleyen Google'a gider —
 * yeni bir tarafa aktarım değil. Buna karşın Google Analytics kişi bazında
 * davranış profili kurduğu için ayrıca değerlendirilmelidir
 * (bkz. docs/KULLANIM-ONERILER.md).
 *
 * Hız bütçesi (aşan sürüm yayınlanmaz): bkz. docs/HIZ-BUTCESI.md.
 */

/* ------------------------------------------------------------------ */
/* Firebase Performance Monitoring                                     */
/* ------------------------------------------------------------------ */

/** Yayında ve demoda açık; geliştirmede ve emülatörde kapalı. */
const PERF_ON = !USE_EMULATOR && !import.meta.env.DEV && typeof window !== 'undefined';

type PerfMod = typeof import('firebase/performance');
let perfReady: Promise<{ mod: PerfMod; perf: ReturnType<PerfMod['getPerformance']> } | null> | null = null;

/**
 * main.tsx'te bir kez. Ayrı parça olarak yüklenir (dynamic import): ilk
 * açılışta ana paketi büyütmez. Hata olursa sessizce vazgeçer — ölçüm
 * uygulamayı asla düşürmemeli.
 */
export function installPerf(): void {
  if (!PERF_ON || perfReady) return;
  perfReady = Promise.all([import('firebase/performance'), import('../api/firebase')])
    .then(([mod, fb]) => ({ mod, perf: mod.getPerformance(fb.app) }))
    .catch(() => null);
}

/** "Sınav başlatma" → "sinav-baslatma" (iz adı ASCII ve kısa olmalı). */
const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' } as Record<string, string>;
const slug = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-z0-9 ]/g, (c) => TR[c] || '')
  .trim().replace(/\s+/g, '-').slice(0, 32) || 'olcum';

/** Değerleri Performance Monitoring'in kabul ettiği biçime indirir. */
function özellikler(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined || typeof v === 'object') continue;
    const ad = slug(k).replace(/-/g, '_').slice(0, 40);
    if (!ad) continue;
    out[ad] = String(v).slice(0, 100);
    if (Object.keys(out).length >= 5) break; // iz başına en çok 5 özellik
  }
  return out;
}

/** Ölçülen süreyi özel iz olarak gönderir. Başarısız olursa yok sayar. */
function gönder(label: string, totalMs: number, bitişMs: number, data: Record<string, unknown>, adımlar: Record<string, number>) {
  if (!PERF_ON) return;
  if (!perfReady) installPerf();
  void perfReady?.then((p) => {
    if (!p) return;
    try {
      const t = p.mod.trace(p.perf, slug(label));
      const metrics: Record<string, number> = {};
      for (const [k, v] of Object.entries(adımlar)) {
        const ad = slug(k).replace(/-/g, '_').slice(0, 40);
        if (ad && Number.isFinite(v)) metrics[ad] = Math.round(v);
      }
      t.record(Math.round(bitişMs - totalMs), Math.round(totalMs), { attributes: özellikler(data), metrics });
    } catch { /* ölçüm uygulamayı etkilemesin */ }
  });
}

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
      gönder(label, total, Date.now(), { ...notes, ...extra }, steps);
      return total;
    }
  };
}

/** Tek bir ölçüm satırı (açılış süresi gibi). */
export function measure(label: string, ms: number, data: Record<string, unknown> = {}) {
  if (ACTIVITY_LOG) record(null, 'ölçüm', { label, op: `${Math.round(ms)} ms`, data: { toplam: Math.round(ms), ...data } });
  gönder(label, Math.round(ms), Date.now(), data, {});
}
