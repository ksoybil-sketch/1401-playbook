import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent } from '../../store/content';
import { useBadgeConfig } from '../../store/badgeConfig';
import { useDocLive } from '../../hooks/useFirestore';
import { resolveThemeRules, themeStatuses, type BaristaThemeId, type ThemeStatus } from '../../lib/baristaThemes';
import { useBaristaSession, useMyProgress } from './useBaristaData';
import { Icon } from '../../ui/Icon';
import { Section, toast } from '../../ui/kit';
import type { Barista } from '../../../shared/types';

/** Baristanın temaları: hangileri açık, hangisi seçili. */
export function useMyThemes() {
  const s = useBaristaSession();
  const { progress } = useMyProgress();
  const config = useBadgeConfig((x) => x.config);
  const { data: me } = useDocLive<Barista>(`baristas/${s.baristaId}`);
  const statuses = useMemo(() => themeStatuses(resolveThemeRules(config?.themes), progress, me?.apronBadge), [config, progress, me]);
  const chosen = (progress?.theme as BaristaThemeId | undefined) || 'espresso';
  // Seçili tema artık açık değilse (kural değiştiyse) Espresso'ya düşer.
  const active = statuses.find((x) => x.def.id === chosen && x.unlocked)?.def.id || 'espresso';
  return { statuses, active, baristaId: s.baristaId };
}

/** Barista ekranlarında seçili temayı <html>'e uygular; çıkınca Espresso. */
export function useBaristaTheme() {
  const { active } = useMyThemes();
  useEffect(() => {
    const root = document.documentElement;
    if (active === 'espresso') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', active);
    return () => root.removeAttribute('data-theme');
  }, [active]);
}

const seenKey = (id: string) => `campus.temaGoruldu.${id}`;
function readSeen(id: string): string[] {
  try { return JSON.parse(localStorage.getItem(seenKey(id)) || '[]'); } catch { return []; }
}

/** Bugün ekranında: yeni açılan tema haberi (görülene kadar). */
export const NewThemeBanner: React.FC = () => {
  const { statuses, baristaId } = useMyThemes();
  const [seen] = useState(() => readSeen(baristaId));
  const fresh = statuses.filter((x) => x.unlocked && x.def.id !== 'espresso' && !seen.includes(x.def.id));
  if (!fresh.length) return null;
  const th = fresh[0].def;
  return (
    <Link to="/sonuclarim#temalar" className="rounded-2xl p-4 flex items-center gap-3.5 border border-line"
      style={{ background: `linear-gradient(135deg, ${th.swatch[1]}, ${th.swatch[0]})` }}>
      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: th.swatch[2], color: th.swatch[0] }}>
        <Icon name="palette" size={20} />
      </span>
      <span className="flex-1 min-w-0" style={{ color: th.id === 'gunisigi' ? '#2E2112' : '#F7F2EC' }}>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] opacity-80">Yeni tema açıldı</span>
        <span className="block text-[16px] font-bold">{th.label}{fresh.length > 1 ? ` ve ${fresh.length - 1} tema daha` : ''}</span>
        <span className="block text-[12px] opacity-75">Ben sekmesinden seçebilirsin</span>
      </span>
      <Icon name="chevronRight" size={16} />
    </Link>
  );
};

/** "Ben" sekmesinde temalar: açık olanlar seçilir, kilitliler ne gerektiğini söyler. */
export const ThemesSection: React.FC = () => {
  const { statuses, active, baristaId } = useMyThemes();
  const { modules } = useContent();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Bu bölüm görüldü: açılan temalar artık "yeni" sayılmaz.
    try { localStorage.setItem(seenKey(baristaId), JSON.stringify(statuses.filter((x) => x.unlocked).map((x) => x.def.id))); } catch { /* yok say */ }
  }, [statuses, baristaId]);

  const choose = async (id: BaristaThemeId) => {
    setBusy(id);
    try {
      await updateDoc(doc(db, 'progress', baristaId), { theme: id, updatedAt: Date.now() });
    } catch {
      toast('Tema kaydedilemedi.', 'negative');
    } finally {
      setBusy(null);
    }
  };

  const need = (st: ThemeStatus) => {
    const r = st.rule;
    if (!r) return '';
    if (r.apron && !r.modules.length) return `${r.apron === 'pro' ? 'Pro' : r.apron.charAt(0).toUpperCase() + r.apron.slice(1)} önlük rozeti`;
    const names = r.modules.map((m) => modules.find((x) => x.id === m)?.title || m);
    return names.length > 1
      ? `Şu sınavların hepsini %${r.minScore} ve üstüyle geç: ${names.join(', ')}`
      : `${names[0]} sınavını %${r.minScore} ve üstüyle geç`;
  };

  const opened = statuses.filter((x) => x.unlocked).length;
  return (
    <div id="temalar" className="scroll-mt-20">
      <Section label={`Temalar · ${opened}/${statuses.length}`}>
        <div className="grid grid-cols-2 gap-2.5">
          {statuses.map((st) => {
            const th = st.def;
            const on = active === th.id;
            return (
              <button key={th.id} disabled={!st.unlocked || on || !!busy} onClick={() => choose(th.id)}
                className={`rounded-2xl border p-3 text-left flex flex-col gap-2 transition-colors ${on ? 'border-crema' : 'border-line'} ${st.unlocked ? '' : 'opacity-80'}`}
                style={{ background: `linear-gradient(160deg, ${th.swatch[1]}, ${th.swatch[0]})` }}>
                <div className="flex items-center gap-1.5">
                  {th.swatch.map((c, i) => <span key={i} className="w-4 h-4 rounded-full border border-white/20" style={{ background: c }} />)}
                  <span className="ml-auto">
                    {on ? <span style={{ color: th.swatch[2] }}><Icon name="check" size={15} /></span>
                      : !st.unlocked ? <span className="opacity-70" style={{ color: th.id === 'gunisigi' ? '#2E2112' : '#F7F2EC' }}><Icon name="lock" size={14} /></span> : null}
                  </span>
                </div>
                <div style={{ color: th.id === 'gunisigi' ? '#2E2112' : '#F7F2EC' }}>
                  <div className="text-[14px] font-bold">{th.label}</div>
                  <div className="text-[11.5px] opacity-75 leading-snug mt-0.5">
                    {on ? 'Kullanılıyor' : st.unlocked ? 'Dokun, kullan' : need(st)}
                  </div>
                  {!st.unlocked && st.scores.length > 0 && (
                    <div className="text-[11px] opacity-70 mt-1 tnum">
                      {st.scores.map((x) => (x.best === null ? 'henüz geçilmedi' : `şu an %${x.best}`)).join(' · ')}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
};
