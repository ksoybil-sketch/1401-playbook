import React, { useEffect } from 'react';
import { create } from 'zustand';
import * as t from '../../ui/tokens';

/**
 * Kahve Operasyonu paneli için renk temaları.
 *
 *   espresso  varsayılan koyu tema (baristalarla aynı)
 *   latte     bej, açık tema — gün ışığında ve uzun okumalarda rahat
 *   cekirdek  yeşil tonlarında koyu tema
 *
 * Tailwind'in @theme değişkenleri (--color-*) <html data-theme="…">
 * üzerinde ezilir (bkz. styles.css). Seçim bu cihazda saklanır; barista
 * ekranları her zaman Espresso'dur.
 */
export type StaffTheme = 'espresso' | 'latte' | 'cekirdek';

export const THEMES: { id: StaffTheme; label: string; hint: string; swatch: [string, string, string] }[] = [
  { id: 'espresso', label: 'Espresso', hint: 'Koyu', swatch: ['#100E0D', '#1E1A18', '#F2EDE7'] },
  { id: 'latte', label: 'Latte', hint: 'Bej, açık', swatch: ['#F5EEE4', '#E6D8C6', '#2B211A'] },
  { id: 'cekirdek', label: 'Çekirdek', hint: 'Yeşil', swatch: ['#0D1410', '#1A261E', '#E9F0E8'] }
];

const KEY = 'campus.staffTheme';

function read(): StaffTheme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'latte' || v === 'cekirdek' || v === 'espresso') return v;
  } catch { /* gizli sekme vb. */ }
  return 'espresso';
}

export const useThemeStore = create<{ theme: StaffTheme; set: (t: StaffTheme) => void }>((set) => ({
  theme: read(),
  set: (theme) => {
    try { localStorage.setItem(KEY, theme); } catch { /* yok say */ }
    set({ theme });
  }
}));

/** Panel açıkken temayı <html>'e uygular, çıkınca Espresso'ya döner. */
export function useStaffTheme() {
  const theme = useThemeStore((x) => x.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'espresso') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = THEMES.find((x) => x.id === theme)!.swatch[0];
    meta?.setAttribute('content', bg);
    return () => {
      root.removeAttribute('data-theme');
      meta?.setAttribute('content', THEMES[0].swatch[0]);
    };
  }, [theme]);
}

export const ThemePicker: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const theme = useThemeStore((x) => x.theme);
  const set = useThemeStore((x) => x.set);
  return React.createElement('div', { className: 'flex flex-col gap-1.5' },
    !compact && React.createElement('span', { className: t.label }, 'Tema'),
    React.createElement('div', { className: `flex gap-1.5 ${compact ? '' : 'flex-wrap'}`, role: 'radiogroup', 'aria-label': 'Tema' },
      THEMES.map((th) => React.createElement('button', {
        key: th.id,
        role: 'radio',
        'aria-checked': theme === th.id,
        title: `${th.label} · ${th.hint}`,
        onClick: () => set(th.id),
        className: `flex items-center gap-2 rounded-lg border transition-colors ${compact ? 'flex-1 flex-col justify-center gap-1 py-1.5 px-0.5' : 'h-10 px-3'} ${theme === th.id ? 'border-crema bg-panel-3' : 'border-line hover:bg-panel-2'}`
      },
        React.createElement('span', {
          className: 'w-4 h-4 rounded-full shrink-0 border border-line-2',
          style: { background: `linear-gradient(135deg, ${th.swatch[0]} 50%, ${th.swatch[1]} 50%)` }
        }),
        React.createElement('span', { className: `${compact ? 'text-[11px]' : 'text-[13px]'} font-medium` }, th.label)
      ))
    )
  );
};
