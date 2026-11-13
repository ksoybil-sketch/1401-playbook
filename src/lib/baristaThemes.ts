import type { ApronBadge, Progress } from '../../shared/types';

/**
 * Barista temaları: eğitimde başarıyla açılan renk temaları.
 *
 * Espresso herkese açık. Diğerleri bir ya da birkaç modülün sınavını belirli
 * puanla geçince (ya da önlük rozetiyle) açılır; barista "Ben" sekmesinden
 * seçer, seçim progress/{baristaId}.theme'de durur (ortak mağaza telefonunda
 * her barista kendi temasını görür).
 *
 * Kurallar Kahve Operasyon Direktörü'nün ayarıdır: config/badges.themes
 * (Rozetler ekranı → Temalar). Belge yoksa aşağıdaki varsayılanlar geçerli.
 * Renkler src/styles.css'te [data-theme="…"] altında.
 */
export type BaristaThemeId = 'espresso' | 'hibiskus' | 'gunisigi' | 'matcha' | 'kor' | 'gece' | 'altin';

export interface ThemeRule {
  enabled: boolean;
  /** Bu modüllerin hepsinin sınavı… */
  modules: string[];
  /** …en az bu puanla geçilmiş olmalı. */
  minScore: number;
  /** Ya da (modül yerine) bu önlük rozeti teslim edilmiş olmalı. */
  apron?: ApronBadge | null;
}

export interface ThemeDef {
  id: BaristaThemeId;
  label: string;
  hint: string;
  /** Arka plan, kart, vurgu. */
  swatch: [string, string, string];
  rule: ThemeRule | null;
}

export const BARISTA_THEMES: ThemeDef[] = [
  { id: 'espresso', label: 'Espresso', hint: 'Herkese açık, varsayılan koyu tema', swatch: ['#100E0D', '#1E1A18', '#F2EDE7'], rule: null },
  { id: 'hibiskus', label: 'Hibiskus', hint: 'Kırmızı ve mürdüm tonları', swatch: ['#170C12', '#2A1520', '#D07A9B'],
    rule: { enabled: true, modules: ['soguk-icecekler'], minScore: 90 } },
  { id: 'gunisigi', label: 'Gün Işığı', hint: 'Sıcak, açık tema; güneşli bar için', swatch: ['#FFF8EC', '#F5E4C6', '#C27A14'],
    rule: { enabled: true, modules: ['acilis-kapanis'], minScore: 90 } },
  { id: 'matcha', label: 'Matcha', hint: 'Taze yeşil tonları', swatch: ['#0E140C', '#1B2617', '#A8C66C'],
    rule: { enabled: true, modules: ['soguk-kahveler'], minScore: 90 } },
  { id: 'kor', label: 'Köz', hint: 'Türk kahvesi: koyu kahve ve gül altını', swatch: ['#1A0D07', '#3A2014', '#D9A47C'],
    rule: { enabled: true, modules: ['demleme-turk'], minScore: 90 } },
  { id: 'gece', label: 'Gece Mavisi', hint: 'Sakin lacivert', swatch: ['#0B0F18', '#161E2D', '#7FA3E0'],
    rule: { enabled: true, modules: ['misafir-karsilama', 'siparis-ve-satis', 'memnuniyet-sikayet'], minScore: 90 } },
  { id: 'altin', label: 'Altın', hint: 'Pro baristalara özel: şampanya altını, cam yüzeyler', swatch: ['#080705', '#2A2210', '#E9C46A'],
    rule: { enabled: true, modules: [], minScore: 0, apron: 'pro' } }
];

const APRON_ORDER: ApronBadge[] = ['rookie', 'specialist', 'senior', 'pro'];

export type ThemeRules = Partial<Record<BaristaThemeId, Partial<ThemeRule>>>;

/** Ayarı varsayılanla birleştirir. */
export function resolveThemeRules(cfg?: ThemeRules | null): Record<BaristaThemeId, ThemeRule | null> {
  const out = {} as Record<BaristaThemeId, ThemeRule | null>;
  for (const t of BARISTA_THEMES) {
    if (!t.rule) { out[t.id] = null; continue; }
    const c = cfg?.[t.id] || {};
    out[t.id] = {
      enabled: c.enabled !== undefined ? !!c.enabled : t.rule.enabled,
      modules: Array.isArray(c.modules) ? c.modules : t.rule.modules,
      minScore: Math.min(100, Math.max(0, Number(c.minScore ?? t.rule.minScore) || 0)),
      apron: c.apron !== undefined ? c.apron : t.rule.apron ?? null
    };
  }
  return out;
}

export interface ThemeStatus {
  def: ThemeDef;
  unlocked: boolean;
  /** Kilitliyse: modül başına en iyi puan (geçilmemişse null). */
  scores: { moduleId: string; best: number | null }[];
  rule: ThemeRule | null;
}

export function themeStatuses(rules: Record<BaristaThemeId, ThemeRule | null>, progress: Progress | null | undefined, apron?: ApronBadge | null): ThemeStatus[] {
  return BARISTA_THEMES.filter((t) => t.id === 'espresso' || rules[t.id]?.enabled).map((def) => {
    const rule = rules[def.id];
    if (!rule) return { def, unlocked: true, scores: [], rule };
    const scores = rule.modules.map((m) => ({ moduleId: m, best: progress?.modules?.[m]?.score ?? null }));
    const byModules = rule.modules.length > 0 && scores.every((s) => s.best !== null && s.best >= rule.minScore);
    const byApron = !!rule.apron && !!apron && APRON_ORDER.indexOf(apron) >= APRON_ORDER.indexOf(rule.apron);
    return { def, unlocked: byModules || byApron, scores, rule };
  });
}
