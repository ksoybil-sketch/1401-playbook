import React, { useEffect, useMemo, useState } from 'react';
import { BADGES, DEFAULT_TITLES, GROUP_LABEL, TITLE_IDS, resolveConfig, type BadgeConfig, type BadgeGroup, type ResolvedConfig, type TitleId } from '../../lib/badges';
import { saveBadgeConfig, useBadgeConfig } from '../../store/badgeConfig';
import { errorText } from '../../api/backend';
import { useStaffSession } from './StaffLayout';
import { allowed } from '../../lib/permissions';
import { authorName } from '../../lib/roles';
import { useUnsavedGuard } from '../../lib/unsaved';
import { ApronBadgesSection } from './StaffPages';
import { Icon } from '../../ui/Icon';
import { useContent } from '../../store/content';
import { BARISTA_THEMES, resolveThemeRules, type BaristaThemeId, type ThemeRule } from '../../lib/baristaThemes';
import { Page, PageTitle, Section, Spinner, toast, fmtDateTime } from '../../ui/kit';
import * as t from '../../ui/tokens';

/**
 * Rozet ve başarım ayarları — Kahve Operasyon Direktörü'nün ekranı.
 *
 * Rozetler (Rookie → Pro): kaç başarım, hangi başarımlar zorunlu, not
 * ortalaması, kıdem, teslimden sonra kaç gün geçerli ve nasıl verileceği
 * (otomatik ya da onayla). Başarımlar: açık/kapalı, adı, eşikleri ve
 * yalnızca son N günün sayılması. Değişiklik kaydedilince tüm baristalarda
 * anında yeniden hesaplanır. Diğer roller ekranı görür, değiştiremez.
 */
export const BadgeSettingsPage: React.FC = () => {
  const me = useStaffSession();
  const editable = allowed(me.role, 'rozetAyar');
  const stored = useBadgeConfig((x) => x.config);
  const [draft, setDraft] = useState<ResolvedConfig>(() => resolveConfig(stored));
  const [themes, setThemes] = useState(() => resolveThemeRules(stored?.themes));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  // Kaydedilmemiş taslak: geri tuşu, menü ve sayfa yenilemesi (web'deki otomatik
  // sürüm yenilemesi dahil) önce sorar; eskiden uyarısız siliniyordu.
  useUnsavedGuard(dirty && !busy);
  useEffect(() => { if (!dirty) { setDraft(resolveConfig(stored)); setThemes(resolveThemeRules(stored?.themes)); } }, [stored, dirty]);
  const setTheme = (id: BaristaThemeId, patch: Partial<ThemeRule>) => {
    setThemes({ ...themes, [id]: { ...themes[id]!, ...patch } });
    setDirty(true);
  };

  const badgeTitles = useMemo(() => Object.fromEntries(BADGES.map((b) => [b.id, draft.badges[b.id].title])), [draft]);
  const enabledIds = BADGES.filter((b) => draft.badges[b.id].enabled).map((b) => b.id);

  const setTitle = (id: TitleId, patch: Partial<ResolvedConfig['titles'][TitleId]>) => {
    setDraft({ ...draft, titles: { ...draft.titles, [id]: { ...draft.titles[id], ...patch } } });
    setDirty(true);
  };
  const setBadge = (id: string, patch: Partial<ResolvedConfig['badges'][string]>) => {
    setDraft({ ...draft, badges: { ...draft.badges, [id]: { ...draft.badges[id], ...patch } } });
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const out: BadgeConfig = { badges: draft.badges, titles: draft.titles, themes: Object.fromEntries(Object.entries(themes).filter(([, v]) => v)) as BadgeConfig['themes'] };
      await saveBadgeConfig(out, authorName(me.role, me.name));
      setDirty(false);
      toast('Rozet ve başarım ayarları kaydedildi; herkes için yeniden hesaplandı', 'positive');
    } catch (e) {
      toast(errorText(e), 'negative');
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    if (!confirm('Tüm rozet ve başarım ayarları varsayılana dönsün mü? (Kaydet’e basana kadar uygulanmaz.)')) return;
    setDraft(resolveConfig(null));
    setThemes(resolveThemeRules(null));
    setDirty(true);
  };

  const num = (v: number, on: (n: number) => void, min = 0, max = 9999, suffix?: string) => (
    <span className="inline-flex items-center gap-1.5">
      <input type="number" className={`${t.input} h-9 w-20 text-[14px] tnum`} value={v} min={min} max={max} disabled={!editable}
        onChange={(e) => on(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} />
      {suffix && <span className="text-[12px] text-fg-3">{suffix}</span>}
    </span>
  );

  return (
    <Page wide>
      <PageTitle title="Rozetler ve başarımlar"
        subtitle={stored?.updatedAt ? `Son değişiklik: ${stored.updatedByName ? `${stored.updatedByName} · ` : ''}${fmtDateTime(stored.updatedAt)}` : 'Varsayılan ayarlar kullanılıyor'}
        action={editable ? (
          <div className="flex gap-2">
            <button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={reset} disabled={busy}>Varsayılana dön</button>
            <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save} disabled={!dirty || busy}>{busy ? <Spinner size={14} /> : dirty ? 'Kaydet' : 'Kaydedildi'}</button>
          </div>
        ) : undefined} />

      {!editable && (
        <div className="flex gap-2 p-3 rounded-xl bg-panel border border-line text-[13px] text-fg-2">
          <Icon name="lock" size={15} className="mt-0.5" /> Bu ayarları yalnızca Kahve Operasyon Direktörü değiştirebilir.
        </div>
      )}

      <ApronBadgesSection />

      <Section label="Önlük rozetleri — nasıl kazanılır">
        <div className="grid lg:grid-cols-2 gap-3">
          {TITLE_IDS.map((id) => {
            const x = draft.titles[id];
            return (
              <div key={id} className={`${t.card} p-4 flex flex-col gap-3`}>
                <div className="flex items-center gap-2">
                  <Icon name="medal" size={18} className="text-caution" />
                  <input className={`${t.input} h-9 text-[15px] font-semibold flex-1`} value={x.label} disabled={!editable}
                    onChange={(e) => setTitle(id, { label: e.target.value })} placeholder={DEFAULT_TITLES[id].label} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                  <label className="flex flex-col gap-1"><span className="text-fg-3">Başarım sayısı</span>{num(x.badges, (n) => setTitle(id, { badges: n }), 0, 30)}</label>
                  <label className="flex flex-col gap-1"><span className="text-fg-3">Not ortalaması</span>{num(x.avg, (n) => setTitle(id, { avg: n }), 0, 100, '%')}</label>
                  <label className="flex flex-col gap-1"><span className="text-fg-3">Kıdem</span>{num(x.days, (n) => setTitle(id, { days: n }), 0, 3650, 'gün')}</label>
                  <label className="flex flex-col gap-1"><span className="text-fg-3">Geçerlilik (0 = süresiz; şartlar sağlandıkça kendiliğinden yenilenir)</span>{num(x.validDays, (n) => setTitle(id, { validDays: n }), 0, 3650, 'gün')}</label>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] text-fg-3">Nasıl verilir</span>
                  <div className={t.segment}>
                    <button disabled={!editable} className={`${t.segmentItem} ${x.mode === 'auto' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTitle(id, { mode: 'auto' })}>Otomatik</button>
                    <button disabled={!editable} className={`${t.segmentItem} ${x.mode === 'approval' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTitle(id, { mode: 'approval' })}>Onayla / teslimle</button>
                  </div>
                  <span className="text-[11.5px] text-fg-3">
                    {x.mode === 'auto' ? 'Şartlar sağlanınca baristanın ekranında hemen görünür.' : 'Şartlar sağlanınca “onay bekliyor” görünür; teslim edildi işaretlenince verilir.'}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] text-fg-3">Zorunlu başarımlar</span>
                  <div className="flex flex-wrap gap-1.5">
                    {enabledIds.map((bid) => {
                      const on = x.required.includes(bid);
                      return (
                        <button key={bid} disabled={!editable} onClick={() => setTitle(id, { required: on ? x.required.filter((r) => r !== bid) : [...x.required, bid] })}
                          className={`${t.chip} ${on ? t.chipOn : t.chipOff}`}>{badgeTitles[bid]}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {(['seviye', 'ustalik', 'basari', 'kidem'] as BadgeGroup[]).map((g) => (
        <Section key={g} label={`Başarımlar — ${GROUP_LABEL[g]}`}>
          <div className={t.listGroup}>
            {BADGES.filter((b) => b.group === g).map((b) => {
              const s = draft.badges[b.id];
              return (
                <div key={b.id} className={`${t.listRowStatic} flex-col items-stretch gap-2.5 ${s.enabled ? '' : 'opacity-60'}`}>
                  <div className="flex items-center gap-3">
                    <span className={t.iconChip(s.enabled ? 'positive' : 'neutral')}><Icon name={b.icon} size={15} /></span>
                    <input className={`${t.input} h-9 text-[14px] font-medium flex-1 min-w-0`} value={s.title} disabled={!editable}
                      onChange={(e) => setBadge(b.id, { title: e.target.value })} placeholder={b.title} />
                    <label className="flex items-center gap-2 text-[13px] shrink-0">
                      <input type="checkbox" checked={s.enabled} disabled={!editable} onChange={(e) => setBadge(b.id, { enabled: e.target.checked })} /> Açık
                    </label>
                  </div>
                  <div className="text-[12.5px] text-fg-2 leading-relaxed">{b.rule(s.params)}{s.windowDays ? ` (son ${s.windowDays} gün)` : ''}</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px]">
                    {b.params.map((p) => (
                      <label key={p.key} className="flex items-center gap-2">
                        <span className="text-fg-3">{p.label}</span>
                        {num(s.params[p.key], (n) => setBadge(b.id, { params: { ...s.params, [p.key]: n } }), p.min, p.max, p.unit)}
                      </label>
                    ))}
                    <label className="flex items-center gap-2">
                      <span className="text-fg-3">Yalnızca son</span>
                      {num(s.windowDays, (n) => setBadge(b.id, { windowDays: n }), 0, 3650, 'gün (0 = tüm zamanlar)')}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ))}

      <ThemesSettings themes={themes} setTheme={setTheme} editable={editable} />
    </Page>
  );
};

/**
 * Barista temaları: hangi tema hangi başarıyla açılır. Barista "Ben"
 * sekmesinde açtığı temaları seçer (src/lib/baristaThemes.ts).
 */
const ThemesSettings: React.FC<{
  themes: ReturnType<typeof resolveThemeRules>;
  setTheme: (id: BaristaThemeId, patch: Partial<ThemeRule>) => void;
  editable: boolean;
}> = ({ themes, setTheme, editable }) => {
  const { modules } = useContent();
  const sorted = [...modules].sort((a, b) => a.order - b.order);
  return (
    <Section label="Barista temaları — nasıl açılır">
      <p className="text-[13px] text-fg-3 -mt-1 mb-1">Espresso herkese açık. Diğer temalar aşağıdaki başarıyla açılır; barista Ben sekmesinden seçer.</p>
      <div className="grid lg:grid-cols-2 gap-3">
        {BARISTA_THEMES.filter((th) => th.rule).map((th) => {
          const r = themes[th.id]!;
          return (
            <div key={th.id} className={`${t.card} ${t.cardPad} flex flex-col gap-3 ${r.enabled ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl border border-line shrink-0" style={{ background: `linear-gradient(135deg, ${th.swatch[0]} 45%, ${th.swatch[2]} 45%)` }} />
                <div className="flex-1 min-w-0">
                  <div className={t.cardTitle}>{th.label}</div>
                  <div className="text-[12px] text-fg-3">{th.hint}</div>
                </div>
                <label className="flex items-center gap-1.5 text-[12px] text-fg-2">
                  <input type="checkbox" checked={r.enabled} disabled={!editable} onChange={(e) => setTheme(th.id, { enabled: e.target.checked })} /> Açık
                </label>
              </div>
              <div className="flex flex-col gap-2 text-[13px]">
                <span className="text-fg-3">Şu modül sınav{r.modules.length > 1 ? 'larının hepsini' : 'ını'}:</span>
                <div className="flex flex-wrap gap-1.5">
                  {r.modules.map((m) => (
                    <span key={m} className={`${t.chip} ${t.chipOff} gap-1`}>
                      {modules.find((x) => x.id === m)?.title || m}
                      {editable && <button onClick={() => setTheme(th.id, { modules: r.modules.filter((x) => x !== m) })} aria-label="Çıkar"><Icon name="close" size={11} /></button>}
                    </span>
                  ))}
                  {editable && (
                    <select aria-label="Modül ekle" className={`${t.input} h-8 w-auto text-[12.5px]`} value="" onChange={(e) => e.target.value && setTheme(th.id, { modules: [...r.modules, e.target.value] })}>
                      <option value="">+ Modül ekle</option>
                      {sorted.filter((m) => !r.modules.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                    </select>
                  )}
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-fg-3">en az</span>
                  <input type="number" className={`${t.input} h-9 w-20 text-[14px] tnum`} min={0} max={100} value={r.minScore} disabled={!editable}
                    onChange={(e) => setTheme(th.id, { minScore: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
                  <span className="text-fg-3">puanla geçen açar</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-fg-3">ya da önlük rozeti</span>
                  <select className={`${t.input} h-9 w-auto text-[13px]`} value={r.apron || ''} disabled={!editable}
                    onChange={(e) => setTheme(th.id, { apron: (e.target.value || null) as ThemeRule['apron'] })}>
                    <option value="">—</option><option value="specialist">Specialist ve üstü</option><option value="senior">Senior ve üstü</option><option value="pro">Pro</option>
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
};
