import React, { useEffect, useMemo, useState } from 'react';
import { BADGES, DEFAULT_TITLES, GROUP_LABEL, TITLE_IDS, resolveConfig, type BadgeConfig, type BadgeGroup, type ResolvedConfig, type TitleId } from '../../lib/badges';
import { saveBadgeConfig, useBadgeConfig } from '../../store/badgeConfig';
import { can } from '../../lib/roles';
import { errorText } from '../../api/backend';
import { useStaffSession } from './StaffLayout';
import { ApronBadgesSection } from './StaffPages';
import { Icon } from '../../ui/Icon';
import { Page, PageTitle, Section, Spinner, toast, fmtDateTime } from '../../ui/kit';
import * as t from '../../ui/tokens';

/**
 * Rozet ve başarım ayarları — Kahve Operasyon Müdürü'nün ekranı.
 *
 * Rozetler (Rookie → Pro): kaç başarım, hangi başarımlar zorunlu, not
 * ortalaması, kıdem, teslimden sonra kaç gün geçerli ve nasıl verileceği
 * (otomatik ya da onayla). Başarımlar: açık/kapalı, adı, eşikleri ve
 * yalnızca son N günün sayılması. Değişiklik kaydedilince tüm baristalarda
 * anında yeniden hesaplanır. Diğer roller ekranı görür, değiştiremez.
 */
export const BadgeSettingsPage: React.FC = () => {
  const me = useStaffSession();
  const editable = can(me.role, 'approve');
  const stored = useBadgeConfig((x) => x.config);
  const [draft, setDraft] = useState<ResolvedConfig>(() => resolveConfig(stored));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!dirty) setDraft(resolveConfig(stored)); }, [stored, dirty]);

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
      const out: BadgeConfig = { badges: draft.badges, titles: draft.titles };
      await saveBadgeConfig(out, me.name);
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
        subtitle={stored?.updatedAt ? `Son değişiklik: ${stored.updatedByName || ''} · ${fmtDateTime(stored.updatedAt)}` : 'Varsayılan ayarlar kullanılıyor'}
        action={editable ? (
          <div className="flex gap-2">
            <button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={reset} disabled={busy}>Varsayılana dön</button>
            <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save} disabled={!dirty || busy}>{busy ? <Spinner size={14} /> : dirty ? 'Kaydet' : 'Kaydedildi'}</button>
          </div>
        ) : undefined} />

      {!editable && (
        <div className="flex gap-2 p-3 rounded-xl bg-panel border border-line text-[13px] text-fg-2">
          <Icon name="lock" size={15} className="mt-0.5" /> Bu ayarları yalnızca Kahve Operasyon Müdürü değiştirebilir.
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
                  <label className="flex flex-col gap-1"><span className="text-fg-3">Geçerlilik (0 = süresiz)</span>{num(x.validDays, (n) => setTitle(id, { validDays: n }), 0, 3650, 'gün')}</label>
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
    </Page>
  );
};
