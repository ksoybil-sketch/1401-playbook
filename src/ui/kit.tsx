import React, { useEffect } from 'react';
import { create } from 'zustand';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import * as t from './tokens';
import { useBackHandler } from '../lib/backButton';

/* ------------------------------------------------------------------ */
/* Sayfa iskeleti                                                      */
/* ------------------------------------------------------------------ */

export const Page: React.FC<{ children: React.ReactNode; wide?: boolean; className?: string }> = ({ children, wide, className = '' }) => (
  <div className={`mx-auto w-full ${wide ? 'max-w-[1100px]' : 'max-w-[560px]'} px-4 pt-4 pb-28 flex flex-col gap-5 animate-[fadeSlideIn_0.2s_ease-out] ${className}`}>
    {children}
  </div>
);

export const PageTitle: React.FC<{ title: string; subtitle?: string; back?: boolean | string; action?: React.ReactNode }> = ({ title, subtitle, back, action }) => {
  const navigate = useNavigate();
  return (
    <div className="flex items-start gap-3">
      {back && (
        <button
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          className={`${t.iconBtn} mt-0.5`}
          aria-label="Geri"
        >
          <Icon name="chevronLeft" size={18} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className={t.screenTitle}>{title}</h1>
        {subtitle && <p className="text-[13px] text-fg-3 mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

export const Section: React.FC<{ label?: string; action?: React.ReactNode; children: React.ReactNode }> = ({ label, action, children }) => (
  <section className="flex flex-col gap-2">
    {(label || action) && (
      <div className="flex items-center justify-between gap-2">
        {label && <span className={t.sectionLabel}>{label}</span>}
        {action}
      </div>
    )}
    {children}
  </section>
);

/* ------------------------------------------------------------------ */
/* Küçük parçalar                                                      */
/* ------------------------------------------------------------------ */

export const Spinner: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <span className={t.spinner} style={{ width: size, height: size }} />
);

export const FullLoader: React.FC<{ text?: string }> = ({ text }) => (
  <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3">
    <Spinner size={26} />
    {text && <span className="text-[13px] text-fg-3">{text}</span>}
  </div>
);

export const Empty: React.FC<{ icon?: IconName; text: string; action?: React.ReactNode }> = ({ icon = 'info', text, action }) => (
  <div className={t.emptyState}>
    <Icon name={icon} size={22} className="text-fg-3" />
    <p className={t.emptyText}>{text}</p>
    {action}
  </div>
);

export const ProgressBar: React.FC<{ value: number; tone?: t.Tone; className?: string }> = ({ value, tone = 'positive', className = '' }) => {
  const color = { neutral: 'bg-fg-2', accent: 'bg-accent', positive: 'bg-positive', caution: 'bg-caution', negative: 'bg-negative' }[tone];
  return (
    <div className={`h-1.5 rounded-full bg-panel-3 overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
};

export const Ring: React.FC<{ value: number; size?: number; label?: string; color?: string; stroke?: number }> = ({ value, size = 56, label, color = '#6F9E7C', stroke = 5 }) => {
  const r = (size - stroke - 1) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tnum">{label ?? `${Math.round(v)}%`}</span>
    </div>
  );
};

export const Avatar: React.FC<{ name: string; size?: number; dim?: boolean }> = ({ name, size = 40, dim }) => {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase('tr')).join('');
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border border-line font-semibold shrink-0 ${dim ? 'bg-panel text-fg-3' : 'bg-panel-3 text-crema'}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || '?'}
    </span>
  );
};

export const Badge: React.FC<{ tone?: 'neutral' | 'positive' | 'caution' | 'negative'; children: React.ReactNode }> = ({ tone = 'neutral', children }) => {
  const cls = { neutral: t.badgeNeutral, positive: t.badgePositive, caution: t.badgeCaution, negative: t.badgeNegative }[tone];
  return <span className={`${t.badge} ${cls}`}>{children}</span>;
};

/**
 * Sayı kartı. `to` verilirse ilgili sayfaya gider, `onClick` verilirse
 * (ör. listeyi süzer) düğme olur; `active` seçili süzgeci gösterir.
 */
export const Stat: React.FC<{
  label: string; value: React.ReactNode; hint?: string; icon?: IconName; tone?: t.Tone;
  to?: string; onClick?: () => void; active?: boolean;
}> = ({ label, value, hint, icon, tone = 'neutral', to, onClick, active }) => {
  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon && <span className={t.iconChip(tone)}><Icon name={icon} size={16} /></span>}
        <span className="text-[12px] text-fg-3 font-medium flex-1">{label}</span>
        {(to || onClick) && <Icon name="chevronRight" size={14} className="text-fg-4" />}
      </div>
      <span className="text-[24px] font-bold tnum leading-none">{value}</span>
      {hint && <span className="text-[11px] text-fg-3">{hint}</span>}
    </>
  );
  const cls = `${to || onClick ? t.cardInteractive : t.card} p-4 flex flex-col gap-2 text-left ${active ? 'ring-2 ring-crema/60 border-line-2' : ''}`;
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} aria-pressed={active} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
};

export const ErrorText: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  children ? (
    <div className="flex gap-2 items-start text-[13px] text-negative bg-negative-bg border border-negative-line rounded-lg px-3 py-2.5 leading-relaxed">
      <Icon name="alert" size={16} className="mt-0.5" />
      <span>{children}</span>
    </div>
  ) : null;

/* ------------------------------------------------------------------ */
/* Alttan açılan sayfa (modal)                                         */
/* ------------------------------------------------------------------ */

export const Sheet: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({ open, title, onClose, children, footer }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  // Android geri tuşu önce alt sayfayı kapatır.
  useBackHandler(open, () => { onClose(); return true; });
  if (!open) return null;
  return (
    <div className={t.modalOverlay} onClick={onClose}>
      <div className={t.modalPanel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className={t.modalGrabber} />
        <div className={t.modalHeader}>
          <h2 className={t.modalTitle}>{title}</h2>
          <button className={t.iconBtn} onClick={onClose} aria-label="Kapat"><Icon name="close" size={16} /></button>
        </div>
        <div className={`${t.modalBody} flex flex-col gap-4`}>{children}</div>
        {footer && <div className="shrink-0 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-line flex flex-wrap gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Bildirim (toast)                                                    */
/* ------------------------------------------------------------------ */

interface ToastState { text: string | null; tone: 'neutral' | 'positive' | 'negative'; show: (text: string, tone?: ToastState['tone']) => void }
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const useToast = create<ToastState>((set) => ({
  text: null,
  tone: 'neutral',
  show: (text, tone = 'neutral') => {
    clearTimeout(toastTimer);
    set({ text, tone });
    toastTimer = setTimeout(() => set({ text: null }), 2800);
  }
}));
export const toast = (text: string, tone?: ToastState['tone']) => useToast.getState().show(text, tone);

export const ToastHost: React.FC = () => {
  const { text, tone } = useToast();
  if (!text) return null;
  const color = tone === 'positive' ? 'border-positive-line text-positive' : tone === 'negative' ? 'border-negative-line text-negative' : 'border-line-2 text-crema';
  return (
    <div className="fixed inset-x-0 bottom-24 z-[400] flex justify-center px-4 pointer-events-none">
      <div className={`bg-bean border ${color} rounded-xl px-4 py-3 text-[13px] font-medium shadow-[0_8px_32px_rgba(0,0,0,0.6)] animate-[fadeSlideIn_0.2s_ease-out] max-w-[420px]`}>
        {text}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

export const fmtDate = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function relDays(ms: number): string {
  const d = Math.round((ms - Date.now()) / 86400000);
  if (d === 0) return 'bugün';
  if (d === 1) return 'yarın';
  if (d === -1) return 'dün';
  return d > 0 ? `${d} gün sonra` : `${-d} gün önce`;
}
