import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent } from '../../store/content';
import { useStaffData } from '../staff/staffData';
import { useStaffSession } from '../staff/StaffLayout';
import { useBadgeConfig } from '../../store/badgeConfig';
import { useQueryLive } from '../../hooks/useFirestore';
import { badgeReport, fromBarista, TITLE_IDS } from '../../lib/badges';
import { assignmentDone, EMPTY_PROGRESS, isOverdue, overallPercent } from '../../lib/progress';
import { closedOf, fmtDur, requestStats } from '../../lib/requestStats';
import {
  attention, downloadCsv, modulePerformance, periodOf, PERIODS, previousOf, scorecard, summary, weekly,
  type BoardCtx, type Period, type PeriodId, type ScoreRow
} from '../../lib/boardStats';
import { catOf, isClosed, reasonLabel, STATUS } from '../../api/requests';
import { RequestSummary, RequestThread } from '../shared/Requests';
import { AskSheet } from './BoardQuestions';
import { Avatar, Badge, Empty, Page, PageTitle, ProgressBar, Section, Sheet, Stat, fmtDate, fmtDateTime } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';
import { BARISTA_ROLE_LABEL } from '../../lib/roles';
import type { Bulletin, BoardTopic, StoreRequest } from '../../../shared/types';

/* ------------------------------------------------------------------ */
/* Ortak                                                               */
/* ------------------------------------------------------------------ */

function useBoardCtx(): BoardCtx {
  const { stores, modules, lessons } = useContent();
  const { baristas, progress, attempts, assignments, requests, proposals } = useStaffData();
  return { stores, modules, lessons, baristas, progress, attempts, assignments, requests, proposals };
}

/** Dönem adres çubuğunda (?donem=90) tutulur: sayfalar arasında aynı kalır. */
function usePeriod(): [Period, (id: PeriodId) => void] {
  const [params, setParams] = useSearchParams();
  const id = (params.get('donem') || '30') as PeriodId;
  const set = (next: PeriodId) => {
    const p = new URLSearchParams(params);
    if (next === '30') p.delete('donem'); else p.set('donem', next);
    setParams(p, { replace: true });
  };
  return [periodOf(PERIODS.some((x) => x.id === id) ? id : '30'), set];
}

const PeriodPicker: React.FC<{ value: Period; onChange: (id: PeriodId) => void }> = ({ value, onChange }) => (
  <div className={`${t.segment} ${t.scrollX} max-w-full print:hidden`}>
    {PERIODS.map((p) => (
      <button key={p.id} onClick={() => onChange(p.id)}
        className={`${t.segmentItem} whitespace-nowrap ${value.id === p.id ? t.segmentItemOn : t.segmentItemOff}`}>{p.label}</button>
    ))}
  </div>
);

/** "Sor" düğmesi: konuyu Kahve Operasyonu'na soru olarak açar. */
const AskBtn: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Sor' }) => (
  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
    className={`${t.btn} ${t.btnSecondary} ${t.btnSm} shrink-0 print:hidden`} title="Kahve Operasyonu'na bu konuyu sor">
    <Icon name="message" size={13} /> {label}
  </button>
);

function useAsk() {
  const me = useStaffSession();
  const [topic, setTopic] = useState<BoardTopic | null>(null);
  const sheet = <AskSheet topic={topic} me={{ uid: me.uid, name: me.name }} onClose={() => setTopic(null)} />;
  return { ask: setTopic, sheet };
}

const pctText = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `%${v}`);

/** Önceki döneme göre değişim: "▲ 6 puan" gibi. */
function delta(now: number | null, prev: number | null, unit = 'puan', lowerIsBetter = false): string | undefined {
  if (now === null || prev === null) return undefined;
  const d = Math.round(now - prev);
  if (!d) return 'önceki dönemle aynı';
  const good = lowerIsBetter ? d < 0 : d > 0;
  return `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} ${unit} ${good ? '(iyileşti)' : '(geriledi)'}`;
}

/* ------------------------------------------------------------------ */
/* Haftalık grafik — tek eksen, ince çubuklar, üzerine gelince ayrıntı */
/* ------------------------------------------------------------------ */

interface BarSeries { label: string; className: string; values: number[] }

const WeekBars: React.FC<{ weeks: number[]; series: BarSeries[]; tip: (i: number) => string; caption: string }> = ({ weeks, series, tip, caption }) => {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, Hh = 150, pad = { l: 26, r: 6, t: 8, b: 20 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const slot = (W - pad.l - pad.r) / weeks.length;
  const gap = 2;
  const barW = Math.max(3, Math.min(14, (slot - 8 - gap * (series.length - 1)) / series.length));
  const y = (v: number) => pad.t + (Hh - pad.t - pad.b) * (1 - v / top);
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto" role="img" aria-label={caption}>
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y(i * step)} y2={y(i * step)} className="stroke-line" strokeWidth={1} />
              <text x={pad.l - 6} y={y(i * step) + 3.5} textAnchor="end" className="fill-fg-4 text-[9px] tnum">{i * step}</text>
            </g>
          ))}
          {weeks.map((w, i) => {
            const x0 = pad.l + i * slot + (slot - (barW * series.length + gap * (series.length - 1))) / 2;
            return (
              <g key={w} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* Geniş tıklama alanı: çubuktan büyük. */}
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={Hh - pad.t - pad.b} className={hover === i ? 'fill-panel-2' : 'fill-transparent'} />
                {series.map((s, si) => {
                  const v = s.values[i];
                  const h = Math.max(v ? 2 : 0, Hh - pad.b - y(v));
                  return <rect key={si} x={x0 + si * (barW + gap)} y={Hh - pad.b - h} width={barW} height={h} rx={Math.min(3, barW / 2)} className={s.className} />;
                })}
                {(i % 2 === weeks.length % 2 || weeks.length <= 8) && (
                  <text x={pad.l + i * slot + slot / 2} y={Hh - 6} textAnchor="middle" className="fill-fg-4 text-[9px]">
                    {new Date(w).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 rounded-lg border border-line-2 bg-panel-3 px-2.5 py-1.5 text-[12px] whitespace-nowrap pointer-events-none shadow-lg">
            {tip(hover)}
          </div>
        )}
      </div>
      {series.length > 1 && (
        <figcaption className="flex gap-4 text-[12px] text-fg-3">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5"><svg width="10" height="10"><rect width="10" height="10" rx="2" className={s.className} /></svg>{s.label}</span>
          ))}
        </figcaption>
      )}
    </figure>
  );
};

/* ------------------------------------------------------------------ */
/* Gidişat                                                              */
/* ------------------------------------------------------------------ */

export const BoardOverviewPage: React.FC = () => {
  const ctx = useBoardCtx();
  const { tracks } = useContent();
  const badgeConfig = useBadgeConfig((x) => x.config);
  const [period, setPeriod] = usePeriod();
  const { ask, sheet } = useAsk();
  const s = useMemo(() => summary(ctx, period), [ctx, period]);
  const prev = useMemo(() => summary(ctx, previousOf(period)), [ctx, period]);
  const att = useMemo(() => attention(ctx), [ctx]);
  const weeks = useMemo(() => weekly(ctx, 12), [ctx]);
  const mods = useMemo(() => modulePerformance(ctx, period).filter((m) => m.exams >= 2).slice(0, 5), [ctx, period]);

  // Yetkinlik dağılımı: her aktif barista şartını sağladığı en yüksek seviyede.
  const levels = useMemo(() => {
    const active = ctx.baristas.filter((b) => b.active);
    const reports = active.map((b) => badgeReport({
      tracks, modules: ctx.modules, lessons: ctx.lessons, progress: ctx.progress[b.id] || EMPTY_PROGRESS,
      attempts: ctx.attempts.filter((a) => a.baristaId === b.id && a.submittedAt && !a.voided),
      assignments: ctx.assignments.filter((a) => a.storeId === b.storeId && (!a.baristaId || a.baristaId === b.id)),
      config: badgeConfig, ...fromBarista(b)
    }));
    const label = (id: string) => reports[0]?.titles.find((x) => x.id === id)?.label || id;
    return [
      { id: 'none', label: 'Henüz seviye yok', n: reports.filter((r) => !r.qualified).length },
      ...TITLE_IDS.map((id) => ({ id, label: label(id), n: reports.filter((r) => r.qualified?.id === id).length }))
    ];
  }, [ctx, tracks, badgeConfig]);
  const totalLevels = levels.reduce((x, l) => x + l.n, 0);

  const sentence = [
    `${s.exams} sınav${s.passRate !== null ? ` (%${s.passRate} geçti)` : ''}`,
    `${s.requestsSolved} talep çözüldü${s.medianResolve !== null ? ` (ortanca ${fmtDur(s.medianResolve)})` : ''}`,
    s.joined || s.left ? `${s.joined} barista katıldı, ${s.left} ayrıldı` : null,
    s.published ? `${s.published} içerik / bülten yayınlandı` : null
  ].filter(Boolean).join(' · ');

  return (
    <Page wide>
      <PageTitle title="Gidişat" subtitle="Zincirin eğitim, sınav ve operasyon durumu. Kartlar önceki eşit dönemle karşılaştırılır." />
      <PeriodPicker value={period} onChange={setPeriod} />

      <div className={`${t.card} p-4 flex flex-col gap-1`}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{period.label}</span>
        <p className="text-[15px] leading-relaxed">{sentence || 'Bu dönemde kayıt yok.'}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Aktif barista" value={s.activeBaristas} icon="users" to="/magazalar"
          hint={`${s.stores} mağaza${s.joined || s.left ? ` · +${s.joined} / −${s.left}` : ''}`} />
        <Stat label="Eğitim ilerlemesi" value={`%${s.avgProgress}`} icon="target" tone="positive" to="/magazalar" hint="Aktif baristaların ortalaması" />
        <Stat label="Sınav başarısı" value={pctText(s.passRate)} icon="clipboard" tone="accent"
          hint={delta(s.passRate, prev.passRate) || `${s.exams} sınav`} />
        <Stat label="Talep çözüm süresi" value={fmtDur(s.medianResolve)} icon="wrench" tone={s.urgentNow ? 'negative' : 'neutral'} to="/isler"
          hint={`${s.openNow} açık${s.urgentNow ? ` · ${s.urgentNow} acil` : ''} · ortanca`} />
        <Stat label="Sınava giren" value={s.examTakers} icon="cap" hint={s.avgScore !== null ? `Ortalama puan %${s.avgScore}` : 'Henüz yok'} />
        <Stat label="Onay bekleyen içerik" value={s.pendingProposals} icon="stamp" tone={s.pendingProposals ? 'caution' : 'neutral'} to="/isler?sekme=onay" />
        <Stat label="Gecikmiş eğitim görevi" value={s.overdueTasks} icon="flag" tone={s.overdueTasks ? 'negative' : 'neutral'} to="/isler?sekme=gorev" />
        <Stat label="Ayrılma oranı" value={pctText(s.turnover)} icon="logout" hint={`${s.left} ayrılan · dönem başı ekibe göre`} />
      </div>

      <Section label={`Dikkat gerektirenler${att.length ? ` · ${att.length}` : ''}`}>
        {att.length === 0 ? <Empty icon="check" text="Şu an aksayan bir iş görünmüyor." /> : (
          <div className={t.listGroup}>
            {att.slice(0, 10).map((a, i) => (
              <Link key={i} to={a.to} className={t.listRow}>
                <span className={t.iconChip(a.tone)}><Icon name="alert" size={15} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium leading-snug">{a.text}</div>
                  <div className="text-[12px] text-fg-3">{a.detail}</div>
                </div>
                <AskBtn onClick={() => ask(a.topic)} />
              </Link>
            ))}
          </div>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section label="Haftalık sınavlar (12 hafta)">
          <div className={`${t.card} p-4`}>
            <WeekBars weeks={weeks.map((w) => w.from)} caption="Haftalık sınav sayısı"
              series={[{ label: 'Sınav', className: 'fill-crema', values: weeks.map((w) => w.exams) }]}
              tip={(i) => `${fmtDate(weeks[i].from)} haftası · ${weeks[i].exams} sınav${weeks[i].exams ? ` · %${Math.round((weeks[i].passed / weeks[i].exams) * 100)} geçti` : ''}`} />
          </div>
        </Section>
        <Section label="Haftalık talepler (12 hafta)">
          <div className={`${t.card} p-4`}>
            <WeekBars weeks={weeks.map((w) => w.from)} caption="Haftalık açılan ve çözülen talepler"
              series={[
                { label: 'Açılan', className: 'fill-fg-3', values: weeks.map((w) => w.opened) },
                { label: 'Çözülen', className: 'fill-crema', values: weeks.map((w) => w.solved) }
              ]}
              tip={(i) => `${fmtDate(weeks[i].from)} haftası · ${weeks[i].opened} açıldı · ${weeks[i].solved} çözüldü`} />
          </div>
        </Section>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section label="Yetkinlik dağılımı (önlük rozeti seviyeleri)">
          <div className={`${t.card} p-4 flex flex-col gap-3`}>
            {levels.map((l) => (
              <div key={l.id} className="flex items-center gap-3">
                <span className="w-36 text-[13px] text-fg-2 truncate">{l.label}</span>
                <ProgressBar value={totalLevels ? (l.n / totalLevels) * 100 : 0} tone={l.id === 'none' ? 'neutral' : 'positive'} className="flex-1" />
                <span className="w-8 text-right text-[13px] tnum">{l.n}</span>
              </div>
            ))}
            <p className="text-[12px] text-fg-3 leading-relaxed">Baristanın şartlarını sağladığı en yüksek seviye. Specialist ve üstü kadro, yeni mağaza açılışlarında ekip kurma kapasitesini gösterir.</p>
          </div>
        </Section>
        <Section label="En çok zorlanılan eğitimler">
          {mods.length === 0 ? <Empty icon="clipboard" text="Bu dönemde yeterli sınav yok." /> : (
            <div className={t.listGroup}>
              {mods.map((m) => (
                <div key={m.id} className={t.listRowStatic}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate">{m.title}</div>
                    <div className="text-[12px] text-fg-3">{m.exams} sınav · ortalama %{m.avgScore}</div>
                  </div>
                  <Badge tone={m.passRate < 60 ? 'negative' : m.passRate < 80 ? 'caution' : 'positive'}>%{m.passRate} geçti</Badge>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
      {sheet}
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Mağazalar — karne                                                    */
/* ------------------------------------------------------------------ */

type SortKey = 'name' | 'progress' | 'passRate' | 'openRequests' | 'medianResolve' | 'overdueTasks';

export const BoardStoresPage: React.FC = () => {
  const ctx = useBoardCtx();
  const [period, setPeriod] = usePeriod();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'progress', dir: -1 });
  const { ask, sheet } = useAsk();
  const rows = useMemo(() => scorecard(ctx, period), [ctx, period]);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    if (sort.key === 'name') return a.store.name.localeCompare(b.store.name, 'tr') * sort.dir;
    const va = a[sort.key] ?? -1, vb = b[sort.key] ?? -1;
    return ((va as number) - (vb as number)) * sort.dir;
  }), [rows, sort]);
  const openId = params.get('magaza');
  const current = rows.find((r) => r.store.id === openId) || null;
  const openStore = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('magaza', id); else p.delete('magaza');
    setParams(p, { replace: true });
  };

  const cols: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Mağaza' }, { key: 'progress', label: 'İlerleme' }, { key: 'passRate', label: 'Sınav başarısı' },
    { key: 'openRequests', label: 'Açık talep' }, { key: 'medianResolve', label: 'Çözüm süresi' }, { key: 'overdueTasks', label: 'Gecikmiş görev' }
  ];
  const grid = 'grid grid-cols-[1.5fr_1.3fr_1fr_0.8fr_0.9fr_0.8fr] gap-3';

  return (
    <Page wide>
      <PageTitle title="Mağazalar" subtitle="Mağaza karnesi: eğitim, sınav ve talep göstergeleri yan yana. Başlığa dokununca sıralanır." />
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="overflow-x-auto">
        <div className={`${t.listGroup} min-w-[680px]`}>
          <div className={`${grid} px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-3`}>
            {cols.map((c) => (
              <button key={c.key} className="text-left flex items-center gap-1 hover:text-crema"
                onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === 'name' ? 1 : -1 }))}>
                {c.label}{sort.key === c.key && <Icon name={sort.dir === 1 ? 'arrowUp' : 'arrowDown'} size={11} />}
              </button>
            ))}
          </div>
          {sorted.map((r) => (
            <button key={r.store.id} onClick={() => openStore(r.store.id)} className={`${grid} px-4 py-3 items-center text-left hover:bg-panel-2 transition-colors`}>
              <span className="min-w-0"><span className="block text-[14px] font-medium truncate">{r.store.name}</span><span className="text-[12px] text-fg-3">{r.baristas} barista</span></span>
              <span className="flex items-center gap-2"><ProgressBar value={r.progress || 0} className="flex-1" /><span className="text-[12px] tnum w-9 text-right">{pctText(r.progress)}</span></span>
              <span className="text-[13px] tnum">{pctText(r.passRate)}<span className="text-fg-3"> · {r.exams}</span></span>
              <span>{r.openRequests ? <Badge tone={r.urgentOpen ? 'negative' : 'caution'}>{r.openRequests}{r.urgentOpen ? ` · ${r.urgentOpen} acil` : ''}</Badge> : <span className="text-[13px] text-fg-3">—</span>}</span>
              <span className="text-[13px] tnum text-fg-2">{fmtDur(r.medianResolve)}</span>
              <span>{r.overdueTasks ? <Badge tone="negative">{r.overdueTasks}</Badge> : <span className="text-[13px] text-fg-3">—</span>}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-[12px] text-fg-3">Sınav başarısı ve çözüm süresi seçili döneme göredir (yanındaki sayı sınav adedi); ilerleme ve açık talepler bugünün durumudur.</p>

      <Sheet open={!!current} title={current?.store.name || ''} onClose={() => openStore(null)}>
        {current && <StoreDetail row={current} period={period} onAsk={() => ask({ kind: 'store', id: current.store.id, title: current.store.name })} />}
      </Sheet>
      {sheet}
    </Page>
  );
};

const StoreDetail: React.FC<{ row: ScoreRow; period: Period; onAsk: () => void }> = ({ row, period, onAsk }) => {
  const ctx = useBoardCtx();
  const team = ctx.baristas.filter((b) => b.active && b.storeId === row.store.id)
    .map((b) => ({ b, pct: overallPercent(ctx.modules, ctx.lessons, ctx.progress[b.id] || EMPTY_PROGRESS) }))
    .sort((a, b) => b.pct - a.pct);
  const open = ctx.requests.filter((r) => r.storeId === row.store.id && !closedOf(r));
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {[['İlerleme', pctText(row.progress)], ['Sınav başarısı', pctText(row.passRate)], ['Çözüm süresi', fmtDur(row.medianResolve)]].map(([l, v]) => (
          <div key={l} className={`${t.panel} p-3 flex flex-col gap-0.5`}><span className="text-[11px] text-fg-3">{l}</span><span className="text-[17px] font-semibold tnum">{v}</span></div>
        ))}
      </div>
      <p className="text-[12px] text-fg-3 -mt-1">{period.label} · {row.exams} sınav · {row.requests} talep açıldı{row.joined || row.left ? ` · +${row.joined} / −${row.left} barista` : ''}</p>
      <Section label={`Ekip · ${team.length}`}>
        <div className={t.listGroup}>
          {team.map(({ b, pct }) => (
            <div key={b.id} className={t.listRowStatic}>
              <Avatar name={b.name} size={28} />
              <div className="flex-1 min-w-0"><div className="text-[13.5px] font-medium truncate">{b.name}</div><div className="text-[12px] text-fg-3">{BARISTA_ROLE_LABEL[b.role]}{b.pinPending ? ' · davet bekliyor' : ''}</div></div>
              <ProgressBar value={pct} className="w-20" /><span className="text-[12px] tnum w-9 text-right">%{pct}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section label={`Açık talepler · ${open.length}`}>
        {open.length === 0 ? <Empty icon="check" text="Açık talep yok." /> : (
          <div className={t.listGroup}>
            {open.map((r) => (
              <Link key={r.id} to={`/isler?talep=${r.id}`} className={t.listRow}>
                <Badge tone={r.priority === 'urgent' ? 'negative' : 'caution'}>{STATUS[r.status].label}</Badge>
                <span className="flex-1 min-w-0 text-[13.5px] truncate">{r.title}</span>
                <span className="text-[11px] text-fg-3">{fmtDate(r.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd} self-start`} onClick={onAsk}><Icon name="message" size={14} /> Bu mağazayı sor</button>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Süren işler                                                          */
/* ------------------------------------------------------------------ */

type WorkTab = 'talep' | 'onay' | 'gorev' | 'duyuru' | 'kapanan';
const BULLETIN_KIND = { duyuru: 'Duyuru', kampanya: 'Kampanya', liderlik: 'Liderlik' } as const;
const PROPOSAL_KIND = { lesson: 'Ders', module: 'Modül', track: 'Eğitim yolu', question: 'Soru', bulletin: 'Bülten', order: 'Sıralama', product: 'Yeni ürün' } as const;

export const BoardWorkPage: React.FC = () => {
  const me = useStaffSession();
  const ctx = useBoardCtx();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('sekme') || 'talep') as WorkTab;
  const setTab = (x: WorkTab) => setParams(x === 'talep' ? {} : { sekme: x }, { replace: true });
  const { ask, sheet } = useAsk();
  const { data: bulletins } = useQueryLive<Bulletin>(query(collection(db, 'bulletins'), orderBy('createdAt', 'desc'), limit(30)), 'board-bulletins');
  const now = Date.now();

  const open = ctx.requests.filter((r) => !closedOf(r))
    .sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1) || a.createdAt - b.createdAt);
  const closed = ctx.requests.filter((r) => closedOf(r) && (r.closedAt || r.updatedAt) > now - 14 * 86400000)
    .sort((a, b) => (b.closedAt || b.updatedAt) - (a.closedAt || a.updatedAt));
  const pending = ctx.proposals.filter((p) => p.status === 'pending');
  const approvalReqs = open.filter((r) => r.status === 'approval');
  const tasks = useMemo(() => ctx.assignments.map((a) => {
    const team = ctx.baristas.filter((b) => b.active && b.storeId === a.storeId && (!a.baristaId || a.baristaId === b.id));
    const done = team.filter((b) => assignmentDone(a, ctx.progress[b.id])).length;
    const overdue = team.filter((b) => isOverdue(a, assignmentDone(a, ctx.progress[b.id]))).length;
    return { a, team: team.length, done, overdue };
  }).filter((x) => x.team > 0 && x.done < x.team)
    .sort((x, y) => y.overdue - x.overdue || (x.a.dueAt || Infinity) - (y.a.dueAt || Infinity)), [ctx]);
  const live = bulletins.filter((b) => b.published && (!b.expiresAt || b.expiresAt > now));

  const talepId = params.get('talep');
  const current = ctx.requests.find((r) => r.id === talepId) || null;
  const openReq = (r: StoreRequest | null) => {
    const p = new URLSearchParams(params);
    if (r) p.set('talep', r.id); else p.delete('talep');
    setParams(p, { replace: true });
  };
  const storeName = (id: string) => ctx.stores.find((s) => s.id === id)?.name || '';

  const TABS: { id: WorkTab; label: string; n: number }[] = [
    { id: 'talep', label: 'Açık talepler', n: open.length },
    { id: 'onay', label: 'Onay bekleyenler', n: pending.length + approvalReqs.length },
    { id: 'gorev', label: 'Eğitim görevleri', n: tasks.length },
    { id: 'duyuru', label: 'Yayındaki bültenler', n: live.length },
    { id: 'kapanan', label: 'Son kapananlar', n: closed.length }
  ];

  const ReqRow: React.FC<{ r: StoreRequest }> = ({ r }) => {
    const last = [...r.notes].reverse().find((n) => n.text);
    return (
      <div className={`${t.cardInteractive} p-4 flex gap-3 items-start`} onClick={() => openReq(r)} role="button" tabIndex={0}>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <RequestSummary r={r} showStore />
          {last && <div className="text-[12.5px] text-fg-2 leading-relaxed line-clamp-2"><b className="font-medium">{last.byName}:</b> {last.text}</div>}
          {!isClosed(r.status) && (
            <div className="text-[11.5px] text-fg-3">
              {Math.max(1, Math.round((now - r.createdAt) / 86400000))} gündür açık{r.waitReason ? ` · bekleyen: ${reasonLabel(r.waitReason)}` : ''}
            </div>
          )}
        </div>
        <AskBtn onClick={() => ask({ kind: 'request', id: r.id, title: `${r.storeName}: ${r.title}` })} />
      </div>
    );
  };

  return (
    <Page wide>
      <PageTitle title="Süren işler" subtitle="Operasyonda şu an devam edenler. Burada hiçbir şey değiştirilmez; bir konuyu merak ederseniz yanındaki “Sor” ile Kahve Operasyonu'na sorabilirsiniz." />
      <div className={`${t.scrollX} -mx-1 px-1`}>
        <div className="flex gap-2">
          {TABS.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)} className={`${t.chip} whitespace-nowrap ${tab === x.id ? t.chipOn : t.chipOff}`}>{x.label} · {x.n}</button>
          ))}
        </div>
      </div>

      {tab === 'talep' && (open.length === 0 ? <Empty icon="inbox" text="Açık talep yok." /> : (
        <div className="flex flex-col gap-2">{open.map((r) => <ReqRow key={r.id} r={r} />)}</div>
      ))}

      {tab === 'kapanan' && (closed.length === 0 ? <Empty icon="inbox" text="Son 14 günde kapanan talep yok." /> : (
        <div className="flex flex-col gap-2">{closed.map((r) => <ReqRow key={r.id} r={r} />)}</div>
      ))}

      {tab === 'onay' && (
        <>
          <Section label={`Direktör onayındaki servis talepleri · ${approvalReqs.length}`}>
            {approvalReqs.length === 0 ? <Empty icon="shield" text="Onay bekleyen servis talebi yok." /> : (
              <div className="flex flex-col gap-2">{approvalReqs.map((r) => <ReqRow key={r.id} r={r} />)}</div>
            )}
          </Section>
          <Section label={`Yayın onayı bekleyen içerik ve bültenler · ${pending.length}`}>
            {pending.length === 0 ? <Empty icon="stamp" text="Onay bekleyen içerik yok." /> : (
              <div className={t.listGroup}>
                {pending.map((p) => (
                  <div key={p.id} className={t.listRowStatic}>
                    <span className={t.iconChip('caution')}><Icon name="stamp" size={15} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium leading-snug">{PROPOSAL_KIND[p.kind] || 'Öneri'}: {p.title}</div>
                      <div className="text-[12px] text-fg-3">{p.createdByName} · {p.summary} · {Math.max(0, Math.round((now - p.createdAt) / 86400000))} gündür bekliyor</div>
                    </div>
                    <AskBtn onClick={() => ask({ kind: 'proposal', id: p.id, title: `${PROPOSAL_KIND[p.kind] || 'Öneri'}: ${p.title}` })} />
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      {tab === 'gorev' && (tasks.length === 0 ? <Empty icon="flag" text="Süren eğitim görevi yok." /> : (
        <div className={t.listGroup}>
          {tasks.map(({ a, team, done, overdue }) => (
            <div key={a.id} className={t.listRowStatic}>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium leading-snug">{a.title}</div>
                <div className="text-[12px] text-fg-3">{storeName(a.storeId)} · {a.createdByName}{a.dueAt ? ` · son gün ${fmtDate(a.dueAt)}` : ''}</div>
                <div className="flex items-center gap-2 mt-1.5"><ProgressBar value={(done / team) * 100} className="flex-1 max-w-48" /><span className="text-[12px] tnum text-fg-2">{done}/{team} tamamladı</span></div>
              </div>
              {overdue > 0 && <Badge tone="negative">{overdue} gecikmiş</Badge>}
              <AskBtn onClick={() => ask({ kind: 'assignment', id: a.id, title: `${storeName(a.storeId)}: ${a.title}` })} />
            </div>
          ))}
        </div>
      ))}

      {tab === 'duyuru' && (live.length === 0 ? <Empty icon="bell" text="Yayında bülten yok." /> : (
        <div className="flex flex-col gap-2">
          {live.map((b) => (
            <div key={b.id} className={`${t.card} p-4 flex flex-col gap-1.5`}>
              <div className="flex items-center gap-2"><Badge>{BULLETIN_KIND[b.kind] || 'Bülten'}</Badge><span className="text-[11px] text-fg-3 ml-auto">{fmtDate(b.createdAt)} · {b.createdByName}</span></div>
              <div className="text-[15px] font-semibold">{b.title}</div>
              <p className="text-[13px] text-fg-2 leading-relaxed whitespace-pre-wrap line-clamp-4">{b.body.replace(/\*\*/g, '')}</p>
              <div className="text-[11.5px] text-fg-3">{b.storeIds?.length ? b.storeIds.map(storeName).join(', ') : 'Tüm mağazalar'}{b.expiresAt ? ` · ${fmtDate(b.expiresAt)} tarihine kadar` : ''}</div>
            </div>
          ))}
        </div>
      ))}

      <Sheet open={!!current} title={current ? `${current.storeName} · ${STATUS[current.status].label}` : ''} onClose={() => openReq(null)}>
        {current && (
          <>
            <RequestSummary r={current} showStore />
            <RequestThread r={current} side="ops" me={{ uid: me.uid, name: me.name }} readOnly />
            <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd} self-start`}
              onClick={() => ask({ kind: 'request', id: current.id, title: `${current.storeName}: ${current.title}` })}>
              <Icon name="message" size={14} /> Bu talebi sor
            </button>
          </>
        )}
      </Sheet>
      {sheet}
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Raporlar                                                             */
/* ------------------------------------------------------------------ */

const fileDate = () => new Date().toISOString().slice(0, 10);

export const BoardReportsPage: React.FC = () => {
  const ctx = useBoardCtx();
  const [period, setPeriod] = usePeriod();
  const storeName = (id: string) => ctx.stores.find((s) => s.id === id)?.name || '';
  const inP = (x?: number | null) => !!x && x >= period.from && x <= period.to;
  const slug = `${period.id}-${fileDate()}`;

  const csv = {
    karne: () => downloadCsv(`magaza-karnesi-${slug}`, [
      ['Mağaza', 'Barista', 'İlerleme %', 'Sınav', 'Geçme %', 'Ort. puan %', 'Açılan talep', 'Açık talep', 'Acil açık', 'Ortanca çözüm (saat)', 'Gecikmiş görev', 'Katılan', 'Ayrılan'],
      ...scorecard(ctx, period).map((r) => [r.store.name, r.baristas, r.progress, r.exams, r.passRate, r.avgScore, r.requests, r.openRequests, r.urgentOpen,
        r.medianResolve !== null ? Math.round(r.medianResolve / 3600000) : null, r.overdueTasks, r.joined, r.left])
    ]),
    barista: () => downloadCsv(`barista-egitim-${slug}`, [
      ['Barista', 'Mağaza', 'Rol', 'Durum', 'İlerleme %', 'Geçilen modül', 'Dönemde sınav', 'Dönemde geçti', 'İşe başlama (kayıt)'],
      ...ctx.baristas.map((b) => {
        const p = ctx.progress[b.id] || EMPTY_PROGRESS;
        const ex = ctx.attempts.filter((a) => a.baristaId === b.id && a.submittedAt && !a.voided && inP(a.submittedAt));
        return [b.name, storeName(b.storeId), BARISTA_ROLE_LABEL[b.role], b.active ? 'Aktif' : 'Ayrıldı', overallPercent(ctx.modules, ctx.lessons, p),
          Object.keys(p.modules || {}).length, ex.length, ex.filter((a) => a.passed).length, fmtDate(b.createdAt)];
      })
    ]),
    talep: () => downloadCsv(`talepler-${slug}`, [
      ['Açılış', 'Mağaza', 'Tür', 'Öncelik', 'Başlık', 'Durum', 'Bekleme nedeni', 'Kapanış', 'Süre (saat)', 'Açan'],
      ...ctx.requests.filter((r) => inP(r.createdAt) || !closedOf(r)).sort((a, b) => a.createdAt - b.createdAt).map((r) => [
        fmtDateTime(r.createdAt), r.storeName, catOf(r.category).label, r.priority === 'urgent' ? 'Acil' : 'Normal', r.title, STATUS[r.status].label,
        r.waitReason ? reasonLabel(r.waitReason) : '', r.closedAt ? fmtDateTime(r.closedAt) : '',
        Math.round(((r.closedAt || Date.now()) - r.createdAt) / 3600000), r.createdByName])
    ]),
    sinav: () => downloadCsv(`sinavlar-${slug}`, [
      ['Tarih', 'Barista', 'Mağaza', 'Modül', 'Tür', 'Puan %', 'Sonuç', 'Doğru', 'Soru'],
      ...ctx.attempts.filter((a) => a.submittedAt && !a.voided && inP(a.submittedAt)).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0)).map((a) => [
        fmtDateTime(a.submittedAt), a.baristaName, storeName(a.storeId), a.moduleTitle, a.lessonId ? 'Mini sınav' : 'Modül sınavı', a.score, a.passed ? 'Geçti' : 'Kaldı', a.correct, a.total])
    ])
  };

  const Item: React.FC<{ icon: 'download' | 'store' | 'users' | 'wrench' | 'clipboard'; title: string; text: string; onClick: () => void }> = ({ icon, title, text, onClick }) => (
    <button onClick={onClick} className={`${t.cardInteractive} p-4 text-left flex items-start gap-3`}>
      <span className={t.iconChip('neutral')}><Icon name={icon} size={16} /></span>
      <span className="flex-1 min-w-0"><span className="block text-[14px] font-semibold">{title}</span><span className="block text-[12.5px] text-fg-3 leading-relaxed mt-0.5">{text}</span></span>
      <Icon name="download" size={16} className="text-fg-3 mt-1" />
    </button>
  );

  return (
    <Page wide>
      <PageTitle title="Raporlar" subtitle="Seçtiğiniz dönem için yönetim raporu ve Excel'de açılan tablolar." />
      <PeriodPicker value={period} onChange={setPeriod} />
      <Link to={`/rapor${period.id !== '30' ? `?donem=${period.id}` : ''}`} className={`${t.cardInteractive} p-5 flex items-center gap-4`}>
        <span className={t.iconChip('accent')}><Icon name="chart" size={18} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] font-semibold">Yönetim raporu · {period.label}</span>
          <span className="block text-[13px] text-fg-3 leading-relaxed mt-0.5">Özet göstergeler, mağaza karnesi, talep süreleri, eğitim başarısı ve ekip hareketi tek sayfada. Yazdırılabilir, PDF olarak kaydedilebilir.</span>
        </span>
        <Icon name="chevronRight" size={18} className="text-fg-3" />
      </Link>
      <Section label="Excel tabloları (CSV)">
        <div className="grid sm:grid-cols-2 gap-3">
          <Item icon="store" title="Mağaza karnesi" text="Her mağaza için ilerleme, sınav başarısı, talepler, gecikmiş görevler, ekip hareketi." onClick={csv.karne} />
          <Item icon="users" title="Barista eğitim durumu" text="Her baristanın ilerlemesi, geçtiği modüller ve dönemdeki sınavları." onClick={csv.barista} />
          <Item icon="wrench" title="Talepler" text="Dönemde açılan ve hâlâ açık olan talepler, durumları ve süreleri." onClick={csv.talep} />
          <Item icon="clipboard" title="Sınav sonuçları" text="Dönemdeki bütün sınavlar: barista, modül, puan, sonuç." onClick={csv.sinav} />
        </div>
      </Section>
    </Page>
  );
};

/** Yazdırılabilir yönetim raporu. Tarayıcının "Yazdır → PDF olarak kaydet"i ile dosyaya dönüşür. */
export const BoardPrintReport: React.FC = () => {
  const ctx = useBoardCtx();
  const me = useStaffSession();
  const [period] = usePeriod();
  const s = useMemo(() => summary(ctx, period), [ctx, period]);
  const prev = useMemo(() => summary(ctx, previousOf(period)), [ctx, period]);
  const card = useMemo(() => scorecard(ctx, period), [ctx, period]);
  const mods = useMemo(() => modulePerformance(ctx, period), [ctx, period]);
  const rq = useMemo(() => requestStats(ctx.requests.filter((r) => r.createdAt <= period.to), period.from), [ctx, period]);
  const att = useMemo(() => attention(ctx), [ctx]);

  const Kpi: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
    <div className="border border-line rounded-lg p-3"><div className="text-[11px] text-fg-3">{label}</div><div className="text-[20px] font-bold tnum">{value}</div>{note && <div className="text-[11px] text-fg-3">{note}</div>}</div>
  );
  const th = 'text-left font-semibold text-fg-3 text-[11px] uppercase tracking-[0.04em] py-1.5 pr-3 border-b border-line';
  const td = 'py-1.5 pr-3 border-b border-line text-[12.5px] tnum';

  return (
    <div className="print-report max-w-[860px] mx-auto px-5 py-6 flex flex-col gap-6">
      <div className="flex items-center gap-2 print:hidden">
        <Link to={`/raporlar${period.id !== '30' ? `?donem=${period.id}` : ''}`} className={`${t.btn} ${t.btnGhost} ${t.btnSm}`}><Icon name="chevronLeft" size={14} /> Raporlar</Link>
        <button onClick={() => window.print()} className={`${t.btn} ${t.btnPrimary} ${t.btnMd} ml-auto`}><Icon name="download" size={14} /> Yazdır / PDF kaydet</button>
      </div>
      <header className="flex flex-col gap-1 border-b border-line pb-4">
        <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-fg-3">1401 Coffee · Yönetim Kurulu</div>
        <h1 className="text-[24px] font-bold">Kahve Operasyonu raporu · {period.label}</h1>
        <div className="text-[12px] text-fg-3">{fmtDate(period.from)} – {fmtDate(period.to)} · Hazırlanma: {fmtDateTime(Date.now())} · {me.name}</div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Özet</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="Aktif barista / mağaza" value={`${s.activeBaristas} / ${s.stores}`} note={`+${s.joined} katılan · −${s.left} ayrılan`} />
          <Kpi label="Eğitim ilerlemesi" value={`%${s.avgProgress}`} note="aktif baristaların ortalaması" />
          <Kpi label="Sınav başarısı" value={pctText(s.passRate)} note={`${s.exams} sınav${prev.passRate !== null ? ` · önceki %${prev.passRate}` : ''}`} />
          <Kpi label="Talep çözüm (ortanca)" value={fmtDur(s.medianResolve)} note={`${s.requestsSolved} çözüldü · ${s.openNow} açık`} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Mağaza karnesi</h2>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>Mağaza</th><th className={th}>Barista</th><th className={th}>İlerleme</th><th className={th}>Sınav</th><th className={th}>Geçme</th><th className={th}>Açık talep</th><th className={th}>Çözüm</th><th className={th}>Gecikmiş görev</th></tr></thead>
          <tbody>
            {card.map((r) => (
              <tr key={r.store.id}><td className={`${td} font-medium`}>{r.store.name}</td><td className={td}>{r.baristas}</td><td className={td}>{pctText(r.progress)}</td><td className={td}>{r.exams}</td><td className={td}>{pctText(r.passRate)}</td><td className={td}>{r.openRequests}{r.urgentOpen ? ` (${r.urgentOpen} acil)` : ''}</td><td className={td}>{fmtDur(r.medianResolve)}</td><td className={td}>{r.overdueTasks || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Talepler</h2>
        <p className="text-[13px] leading-relaxed">
          Dönemde {rq.total} talep açıldı: {rq.done} çözüldü, {rq.rejected} reddedildi, {rq.open} hâlâ açık ({rq.urgent} acil).
          İlk yanıt ortancası {fmtDur(rq.medianFirst)}, çözüm ortancası {fmtDur(rq.medianResolve)}.
          {rq.within72 !== null ? ` Çözülenlerin %${Math.round(rq.within72 * 100)}'i 3 gün içinde kapandı.` : ''}
        </p>
        {rq.waits.length > 0 && (
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>Ne bekletti</th><th className={th}>Talep</th><th className={th}>Toplam bekleme</th></tr></thead>
            <tbody>{rq.waits.slice(0, 6).map((w) => <tr key={w.key}><td className={td}>{w.key === 'yok' ? 'Neden girilmemiş' : reasonLabel(w.key)}</td><td className={td}>{w.requests}</td><td className={td}>{fmtDur(w.ms)}</td></tr>)}</tbody>
          </table>
        )}
        {rq.repeats.length > 0 && <p className="text-[12.5px] text-fg-2">Tekrarlayan arızalar: {rq.repeats.slice(0, 5).map(([k, n]) => `${k} (${n} kez)`).join(', ')}.</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Eğitim başarısı (modül sınavları)</h2>
        {mods.length === 0 ? <p className="text-[13px] text-fg-3">Dönemde modül sınavı yok.</p> : (
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>Modül</th><th className={th}>Sınav</th><th className={th}>Geçme</th><th className={th}>Ortalama puan</th></tr></thead>
            <tbody>{mods.map((m) => <tr key={m.id}><td className={td}>{m.title}</td><td className={td}>{m.exams}</td><td className={td}>%{m.passRate}</td><td className={td}>%{m.avgScore}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Ekip ve içerik</h2>
        <p className="text-[13px] leading-relaxed">
          {s.joined} yeni barista katıldı, {s.left} barista ayrıldı{s.turnover !== null ? ` (ayrılma oranı %${s.turnover})` : ''}.
          Dönemde {s.published} içerik / bülten yayınlandı; {s.pendingProposals} öneri onay bekliyor. Gecikmiş eğitim görevi: {s.overdueTasks}.
        </p>
      </section>

      {att.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Dikkat gerektirenler (rapor anı)</h2>
          <ul className="list-disc pl-5 text-[13px] leading-relaxed">{att.slice(0, 12).map((a, i) => <li key={i}>{a.text} — {a.detail}</li>)}</ul>
        </section>
      )}
      <footer className="text-[11px] text-fg-3 border-t border-line pt-3">1401 Campus verisinden otomatik hazırlanmıştır. Sınav başarısı, talep süreleri ve ekip hareketi seçili döneme; ilerleme ve açık işler rapor anına göredir.</footer>
    </div>
  );
};
