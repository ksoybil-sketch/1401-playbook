import React, { useMemo, useState } from 'react';
import { badgeReport, GROUP_LABEL, TITLE_RANK, type BadgeContext, type BadgeGroup, type BadgeReport, type TitleId } from '../../lib/badges';
import { Icon } from '../../ui/Icon';
import { ProgressBar, Sheet, fmtDate } from '../../ui/kit';
import * as t from '../../ui/tokens';

/** Unvan rengi: kademe yükseldikçe sıcaklaşır. */
const TITLE_TONE: Record<TitleId, string> = {
  rookie: 'bg-panel-3 text-crema border-line-2',
  specialist: 'bg-accent-bg text-accent border-accent-line',
  senior: 'bg-positive-bg text-positive border-positive-line',
  pro: 'bg-caution-bg text-caution border-caution-line'
};

export function useBadgeReport(ctx: BadgeContext): BadgeReport {
  // Bağımlılıklar nesne olarak her render'da değişir; hesap ucuz.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => badgeReport(ctx), [ctx.progress, ctx.attempts, ctx.assignments, ctx.modules, ctx.lessons, ctx.startedAt]);
}

export const TitleChip: React.FC<{ report: BadgeReport; size?: 'sm' | 'md' }> = ({ report, size = 'sm' }) =>
  report.title ? (
    <span className={`inline-flex items-center gap-1 rounded-full border font-semibold ${TITLE_TONE[report.title.id]} ${size === 'sm' ? 'h-5 px-2 text-[10.5px]' : 'h-6 px-2.5 text-[12px]'}`}>
      <Icon name="medal" size={size === 'sm' ? 11 : 13} /> {report.title.label}
    </span>
  ) : null;

/** Unvan, bir sonraki unvana kalanlar. */
export const TitleCard: React.FC<{ report: BadgeReport; self?: boolean }> = ({ report, self }) => {
  const [open, setOpen] = useState(false);
  const { title, next } = report;
  const ladder = report.titles.map((x) => ({ ...x, reached: !!title && TITLE_RANK[title.id] >= TITLE_RANK[x.id] }));
  return (
    <div className={`${t.card} p-4 flex flex-col gap-3`}>
      <div className="flex items-center gap-3">
        <span className={`w-12 h-12 rounded-full border flex items-center justify-center shrink-0 ${title ? TITLE_TONE[title.id] : 'bg-panel border-line text-fg-3'}`}>
          <Icon name="medal" size={22} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">Önlük rozeti</div>
          <div className="text-[18px] font-bold leading-tight">{title ? title.label : 'Henüz rozet yok'}</div>
          <div className="text-[12px] text-fg-3">{report.earned} başarım · not ortalaması {report.avg} puan · {report.days} gün</div>
        </div>
        <button className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} onClick={() => setOpen(true)}><Icon name="info" size={14} /> Kurallar</button>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {ladder.map((x) => (
          <div key={x.id} className="flex flex-col gap-1">
            <div className={`h-1.5 rounded-full ${x.reached ? 'bg-crema' : 'bg-panel-3'}`} />
            <span className={`text-[10.5px] ${x.reached ? 'text-crema font-semibold' : 'text-fg-3'}`}>{x.label}</span>
          </div>
        ))}
      </div>

      {next && (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className={t.label}>{self ? 'Sıradaki' : 'Bir sonraki'}: {next.title.label}</span>
          {next.reqs.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[13px]">
              <Icon name={r.met ? 'check' : 'minus'} size={14} className={r.met ? 'text-positive' : 'text-fg-4'} strokeWidth={2} />
              <span className={r.met ? 'text-fg-2' : 'text-crema'}>{r.label}</span>
              {r.detail && <span className="text-fg-3 tnum ml-auto">{r.detail}</span>}
            </div>
          ))}
        </div>
      )}
      {report.pendingTitle && (
        <div className="text-[13px] text-caution">{report.pendingTitle.label} rozetini hak ettin — Kahve Operasyonu’nun onayı / teslimi bekleniyor.</div>
      )}
      {report.expired && <div className="text-[13px] text-caution">Önlükteki rozetinin süresi doldu; şartları artık sağlamadığın için yeniden değerlendirilecek.</div>}
      {report.expiresSoon && (
        <div className="text-[13px] text-caution">
          Önlükteki rozetinin süresi {fmtDate(report.expiresSoon)} tarihinde doluyor. Şartlarını şu an sağlamıyorsun; o güne kadar sağlarsan rozetin kendiliğinden yenilenir.
        </div>
      )}
      {report.capped && <div className="text-[13px] text-negative">{report.titles.find((x) => x.id === report.capped!.from)?.label} rozeti geri alındı: {report.capped.reason}</div>}
      {!next && title?.id === 'pro' && <div className="text-[13px] text-positive">En üst rozet. Önlükteki Pro rozeti senin.</div>}

      <Sheet open={open} title="Rozetler nasıl kazanılır" onClose={() => setOpen(false)}>
        <p className="text-[13px] text-fg-2 leading-relaxed">
          Önlüğe isimliğinle birlikte takılan Rookie, Specialist, Senior ve Pro rozetleri, uygulamada
          topladığın başarımlarla kazanılır: belirli sayıda başarım, o seviyenin zorunlu başarımları,
          not ortalaması ve kıdem. Başarımlar sınav geçmişinden otomatik hesaplanır; kimse elle veremez.
          Yeni rozetini hak ettiğinde Kahve Operasyonu önlük rozetini teslim eder.
        </p>
        {report.titles.map((x) => (
          <div key={x.id} className={`${t.card} p-3 flex flex-col gap-1`}>
            <span className={`self-start inline-flex items-center gap-1 rounded-full border h-6 px-2.5 text-[12px] font-semibold ${TITLE_TONE[x.id]}`}><Icon name="medal" size={13} /> {x.label}</span>
            <span className="text-[13px] text-fg-2">
              {x.badges} başarım · zorunlu: {x.required.map((id) => report.badges.find((b) => b.id === id)?.title).filter(Boolean).join(', ') || '—'}
              {x.avg ? ` · ortalama ${x.avg} puan` : ''}{x.days ? ` · ${x.days >= 365 ? '1 yıl' : `${x.days} gün`} kıdem` : ''}
              {x.validDays ? ` · ${x.validDays} gün geçerli (şartları sağladıkça kendiliğinden yenilenir)` : ''}{x.mode === 'approval' ? ' · Kahve Operasyonu onayıyla' : ''}
            </span>
          </div>
        ))}
      </Sheet>
    </div>
  );
};

export const BadgeGrid: React.FC<{ report: BadgeReport }> = ({ report }) => {
  const [focus, setFocus] = useState<string | null>(null);
  const groups: BadgeGroup[] = ['seviye', 'ustalik', 'basari', 'kidem'];
  const b = report.badges.find((x) => x.id === focus);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <span className={t.label}>{GROUP_LABEL[g]}</span>
          <div className="grid grid-cols-3 min-[420px]:grid-cols-4 gap-2">
            {report.badges.filter((x) => x.group === g).map((x) => (
              <button key={x.id} onClick={() => setFocus(x.id)}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center transition-colors ${x.earned ? 'bg-positive-bg border-positive-line' : 'bg-panel border-line hover:bg-panel-2'}`}>
                <span className={`medal w-10 h-10 rounded-full flex items-center justify-center ${x.earned ? 'earned bg-positive text-espresso' : 'bg-panel-3 text-fg-4'}`}>
                  <Icon name={x.earned ? x.icon : 'lock'} size={18} strokeWidth={x.earned ? 1.9 : 1.5} />
                </span>
                <span className={`text-[11.5px] font-semibold leading-tight ${x.earned ? '' : 'text-fg-3'}`}>{x.title}</span>
                {!x.earned && <ProgressBar value={Math.round((x.progress[0] / x.progress[1]) * 100)} className="w-full" />}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Sheet open={!!b} title={b?.title || ''} onClose={() => setFocus(null)}>
        {b && (
          <>
            <div className="flex items-center gap-3">
              <span className={`medal w-12 h-12 rounded-full flex items-center justify-center ${b.earned ? 'earned bg-positive text-espresso' : 'bg-panel-3 text-fg-3'}`}><Icon name={b.icon} size={22} /></span>
              <div>
                <div className="text-[12px] text-fg-3">{GROUP_LABEL[b.group]}</div>
                <div className={`text-[14px] font-semibold ${b.earned ? 'text-positive' : b.revoked ? 'text-negative' : ''}`}>
                  {b.revoked ? 'Geri alındı' : b.granted ? 'Kahve Operasyonu verdi' : b.earned ? 'Kazanıldı' : 'Henüz kazanılmadı'}
                </div>
                {(b.revoked || b.granted) && <div className="text-[12px] text-fg-3">{(b.revoked || b.granted)!.reason}{(b.revoked || b.granted)!.byName ? ` · ${(b.revoked || b.granted)!.byName}` : ''}</div>}
              </div>
            </div>
            <p className="text-[14px] leading-relaxed">{b.rule}</p>
            {!b.earned && (
              <div className="flex items-center gap-2">
                <ProgressBar value={Math.round((b.progress[0] / b.progress[1]) * 100)} className="flex-1" />
                <span className="text-[12px] text-fg-3 tnum">%{Math.round((b.progress[0] / b.progress[1]) * 100)}</span>
              </div>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
};
