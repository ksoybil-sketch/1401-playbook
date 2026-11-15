import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent } from '../../store/content';
import {
  aggOfDocs, dayStart, examBaristaIds, fetchOnce, loadExamAgg, loadExamStats, loadExamsSince, loadRequestsSince, loadReviewedSince, useFetched, useHistory, useStaffData,
  type ExamAgg, type ExamStats
} from '../staff/staffData';
import { useStaffSession } from '../staff/StaffLayout';
import { useBadgeConfig } from '../../store/badgeConfig';
import { useQueryLive } from '../../hooks/useFirestore';
import { badgeReport, fromBarista, TITLE_IDS } from '../../lib/badges';
import { assignmentDone, EMPTY_PROGRESS, isOverdue, overallPercent } from '../../lib/progress';
import { taskInvalidReason, taskTargets } from '../../lib/taskValidity';
import { localDay } from '../../lib/day';
import { closedOf, fmtDur, requestStats } from '../../lib/requestStats';
import {
  attention, bestBarista, bestStore, downloadCsv, forBoard, greeting, modulePerformance, periodOf, PERIODS, previousOf, scorecard, summary, weekly,
  type BoardCtx, type Period, type PeriodId, type ScoreRow
} from '../../lib/boardStats';
import { catOf, isClosed, reasonLabel, STATUS } from '../../api/requests';
import { RequestSummary, RequestThread } from '../shared/Requests';
import { AskSheet, useOpsPeople, type OpsPeople } from './BoardQuestions';
import { useAllow } from '../../lib/permissions';
import { Avatar, Badge, Empty, Page, PageTitle, ProgressBar, Section, Sheet, Stat, fmtDate, fmtDateTime } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';
import { BARISTA_ROLE_LABEL } from '../../lib/roles';
import type { Bulletin, BoardTopic, StoreRequest } from '../../../shared/types';
import { IS_ANDROID_APP } from '../../lib/backButton';
import { errorText } from '../../api/backend';

/* ------------------------------------------------------------------ */
/* Ortak                                                               */
/* ------------------------------------------------------------------ */

/**
 * Kurulun dönem verisi TEK SEFERLİK okunur (10 dakika saklanır). Sınav
 * göstergeleri (toplam, mağaza, modül, barista başına) toplama sorgusuyla
 * gelir (useBoardCtx exams: true); sınav belgeleri okunmaz (eskiden dönemin
 * bütün sınavları: "Bu yıl" aralıkta ~25.000 okuma). Belge gereken tek yer
 * Excel tabloları: düğmeye basınca okunur. Talepler ve sonuçlanan öneriler
 * önceki dönem ve 12 haftalık grafik aralığıyla (küçük koleksiyonlar).
 * Önceki dönemin ve haftaların sınav sayıları da toplama sorgusuyla gelir
 * (useExamTrend). Açık talepler ve bekleyen öneriler canlı listeden eklenir.
 */
const WEEKS = 12;
const DAY_MS = 86400000;
const mondayOf = (now = Date.now()) => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime(); };
function rangeFrom(period: Period): number {
  return dayStart(Math.min(previousOf(period).from, mondayOf() - (WEEKS - 1) * 7 * DAY_MS));
}
/** Dönemin üst sınırı: bugüne kadar süren dönemlerde yok (null). */
const periodTo = (p: Period) => (p.id === 'gecen-ay' ? p.to : null);
const statsKey = (p: Period) => `board-stats:${p.id}:${dayStart(p.from)}`;

function useBoardCtx(period: Period, opts: { exams?: boolean } = {}): BoardCtx & { loading: boolean; error: string | null } {
  const { stores, modules, lessons, tracks } = useContent();
  const { baristas, progress, assignments, requests: liveRequests, proposals: liveProposals } = useStaffData();
  const from = rangeFrom(period);
  // Yalnızca dönemde sınava girebilecek baristalar (dönemden önce ayrılanlar hariç).
  const ids = useMemo(() => ({
    stores: stores.filter((s) => s.active).map((s) => s.id),
    modules: modules.map((m) => m.id),
    baristas: examBaristaIds(baristas, period.from)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [stores, modules, baristas, dayStart(period.from)]);
  const ready = stores.length > 0 && baristas.length > 0;
  const ex = useFetched<ExamStats>(opts.exams && ready ? statsKey(period) : null,
    () => loadExamStats(period.from, periodTo(period), ids));
  const rq = useFetched(`board-requests:${from}`, () => loadRequestsSince(from));
  const pr = useFetched(`board-proposals:${from}`, () => loadReviewedSince(from));
  // Personel talepleri (davet kodu, PIN, vardiya) kurulun işi değil: hiçbir kurul ekranına girmez.
  const requests = useMemo(() => {
    const m = new Map((rq.data || []).map((r) => [r.id, r]));
    liveRequests.forEach((r) => m.set(r.id, r));
    return [...m.values()].filter(forBoard);
  }, [rq.data, liveRequests]);
  const proposals = useMemo(() => {
    const m = new Map((pr.data || []).map((p) => [p.id, p]));
    liveProposals.forEach((p) => m.set(p.id, p));
    return [...m.values()];
  }, [pr.data, liveProposals]);
  return {
    stores, modules, lessons, tracks, baristas, progress, attempts: ex.data?.docs || [], examStats: ex.data, assignments, requests, proposals,
    loading: !!opts.exams && !ex.data && !ex.error, error: ex.error || rq.error || pr.error
  };
}

/** Excel tabloları için dönemin sınav belgeleri (düğmeye basınca, 10 dakika saklanır). */
const loadPeriodExams = (p: Period) => fetchOnce(`board-exams:${p.id}:${dayStart(p.from)}`, () => loadExamsSince(dayStart(p.from)));

/**
 * Önceki dönemin ve son 12 haftanın sınav özeti (toplama sorgusu, ~25 okuma).
 * Bileşik dizin henüz yoksa aralığın belgeleri bir kez okunup hesaplanır.
 */
interface Trend { prev: ExamAgg; weeks: (ExamAgg & { from: number })[] }
function useExamTrend(period: Period) {
  const prevP = previousOf(period);
  const monday = mondayOf();
  const weeks = Array.from({ length: WEEKS }, (_, i) => monday - (WEEKS - 1 - i) * 7 * DAY_MS);
  return useFetched<Trend>(`board-trend:${dayStart(prevP.from)}:${dayStart(period.from)}:${monday}`, async () => {
    try {
      const [prev, ...ws] = await Promise.all([loadExamAgg(prevP.from, prevP.to), ...weeks.map((w) => loadExamAgg(w, w + 7 * DAY_MS - 1))]);
      return { prev, weeks: ws.map((x, i) => ({ ...x, from: weeks[i] })) };
    } catch (e) {
      console.warn('[kurul] toplama sorgusu olmadı (dizin?), belgelerden hesaplanıyor', e);
      const docs = (await loadExamsSince(Math.min(prevP.from, weeks[0]))).filter((a) => !a.voided && !a.lessonId);
      const agg = (f: number, t: number): ExamAgg => aggOfDocs(docs.filter((a) => (a.submittedAt || 0) >= f && (a.submittedAt || 0) <= t));
      return { prev: agg(prevP.from, prevP.to), weeks: weeks.map((w) => ({ ...agg(w, w + 7 * DAY_MS - 1), from: w })) };
    }
  });
}
/** summary()'nin sınav alanlarını toplama sonucuyla değiştirir (önceki dönem belgeleri okunmadı). */
const withExams = <T extends { exams: number; passRate: number | null; avgScore: number | null }>(s: T, a: ExamAgg | undefined): T =>
  a ? { ...s, exams: a.exams, passRate: a.exams ? Math.round((a.passed / a.exams) * 100) : null, avgScore: a.avgScore } : s;

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
const AskBtn: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Sor' }) => {
  // "Sorular" kurula kapatıldıysa (Yetkiler) soru düğmeleri de görünmez.
  const me = useStaffSession();
  const allow = useAllow();
  if (!allow(me.role, 'kurul.sorular')) return null;
  return (
  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
    className={`${t.btn} ${t.btnSecondary} ${t.btnMd} shrink-0 print:hidden`} title="Kahve Operasyonu'na bu konuyu sor">
    <Icon name="message" size={15} /> {label}
  </button>
  );
};

function useAsk() {
  const me = useStaffSession();
  const [topic, setTopic] = useState<BoardTopic | null>(null);
  const sheet = <AskSheet topic={topic} me={{ uid: me.uid, name: me.name }} onClose={() => setTopic(null)} />;
  return { ask: setTopic, sheet, asking: !!topic };
}

/**
 * Mağaza ve talep ayrıntısı, açıldığı sayfanın üstünde pencere olarak
 * açılır (?magaza= / ?talep=); kapatınca aynı sayfada kalınır. Mağaza
 * penceresinden bir talep açılırsa talep onun yerine açılır, kapanınca
 * mağazaya dönülür. Aynı anda tek pencere görünür: eskiden mağaza, talep ve
 * "Bu konuyu sor" üst üste biniyordu (asking: soru penceresi açık).
 */
function useDetailSheets(period: Period, ask: (t: BoardTopic) => void, asking = false) {
  const me = useStaffSession();
  const [params, setParams] = useSearchParams();
  // Sınav göstergeleri yalnızca mağaza penceresi açıkken (Gidişat ve Mağazalar zaten okumuştur).
  const ctx = useBoardCtx(period, { exams: !!params.get('magaza') });
  const set = (key: 'magaza' | 'talep', id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set(key, id); else p.delete(key);
    setParams(p, { replace: true });
  };
  const store = useMemo(() => scorecard(ctx, period).find((r) => r.store.id === params.get('magaza')) || null, [ctx, period, params]);
  const req = ctx.requests.find((r) => r.id === params.get('talep')) || null;
  const sheets = (
    <>
      <Sheet open={!!store && !req && !asking} title={store?.store.name || ''} onClose={() => set('magaza', null)}>
        {store && <StoreDetail row={store} period={period} onOpenReq={(id) => set('talep', id)} onAsk={() => ask({ kind: 'store', id: store.store.id, title: store.store.name })} />}
      </Sheet>
      <Sheet open={!!req && !asking} title={req ? `${req.storeName} · ${STATUS[req.status].label}` : ''} onClose={() => set('talep', null)}>
        {req && (
          <>
            <RequestSummary r={req} showStore />
            <RequestThread r={req} side="ops" me={{ uid: me.uid, name: me.name }} readOnly />
            <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd} self-start`}
              onClick={() => ask({ kind: 'request', id: req.id, title: `${req.storeName}: ${req.title}` })}>
              <Icon name="message" size={14} /> Bu talebi sor
            </button>
          </>
        )}
      </Sheet>
    </>
  );
  return { openStore: (id: string) => set('magaza', id), openReq: (id: string) => set('talep', id), sheets };
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
  const [period, setPeriod] = usePeriod();
  const ctx = useBoardCtx(period, { exams: true });
  // Kartlar yalnızca açık olan ekranlara gider (kapalı ekran sessizce ana sayfaya atıyordu).
  const allowFn = useAllow();
  const meB = useStaffSession();
  const go = (perm: Parameters<typeof allowFn>[1], to: string) => (allowFn(meB.role, perm) ? to : undefined);
  const { tracks } = useContent();
  const badgeConfig = useBadgeConfig((x) => x.config);
  const { ask, sheet, asking } = useAsk();
  const navigate = useNavigate();
  const trend = useExamTrend(period);
  const s = useMemo(() => summary(ctx, period), [ctx, period]);
  const prev = useMemo(() => withExams(summary(ctx, previousOf(period)), trend.data?.prev), [ctx, period, trend.data]);
  const att = useMemo(() => attention(ctx), [ctx]);
  const weeks = useMemo(() => weekly(ctx, WEEKS).map((w, i) => {
    const t = trend.data?.weeks[i];
    return t && t.from === w.from ? { ...w, exams: t.exams, passed: t.passed } : w;
  }), [ctx, trend.data]);
  const mods = useMemo(() => modulePerformance(ctx, period).filter((m) => m.exams >= 2).slice(0, 5), [ctx, period]);

  // Yetkinlik dağılımı: her aktif barista şartını sağladığı en yüksek seviyede.
  // Rozetler bütün sınav geçmişini ister (dönem verisi yetmez, kesik veriyle
  // yanlış çıkıyordu); geçmiş pahalı olduğu için istek üzerine okunur.
  const [wantLevels, setWantLevels] = useState(false);
  const history = useHistory(wantLevels);
  const levels = useMemo(() => {
    if (!history.data) return null;
    const h = history.data;
    const active = ctx.baristas.filter((b) => b.active);
    const reports = active.map((b) => badgeReport({
      tracks, modules: ctx.modules, lessons: ctx.lessons, progress: ctx.progress[b.id] || EMPTY_PROGRESS,
      attempts: h.attempts.filter((a) => a.baristaId === b.id && a.submittedAt && !a.voided),
      assignments: h.assignments.filter((a) => a.storeId === b.storeId && (!a.baristaId || a.baristaId === b.id)),
      config: badgeConfig, ...fromBarista(b)
    }));
    const label = (id: string) => reports[0]?.titles.find((x) => x.id === id)?.label || id;
    return [
      { id: 'none', label: 'Henüz seviye yok', n: reports.filter((r) => !r.qualified).length },
      ...TITLE_IDS.map((id) => ({ id, label: label(id), n: reports.filter((r) => r.qualified?.id === id).length }))
    ];
  }, [ctx, tracks, badgeConfig, history.data]);
  const totalLevels = levels ? levels.reduce((x, l) => x + l.n, 0) : 0;

  const me = useStaffSession();
  const { openStore, openReq, sheets } = useDetailSheets(period, ask, asking);
  const card = useMemo(() => scorecard(ctx, period), [ctx, period]);
  const best = useMemo(() => bestStore(card), [card]);
  const star = useMemo(() => bestBarista(ctx, period), [ctx, period]);
  const ranking = useMemo(() => card.filter((r) => r.avgScore !== null).sort((a, b) => (b.avgScore as number) - (a.avgScore as number)), [card]);
  const storeName = (id: string) => ctx.stores.find((x) => x.id === id)?.name || '';
  const scoreDelta = s.avgScore !== null && prev.avgScore !== null ? s.avgScore - prev.avgScore : null;

  // Dönem özeti: kısa, okunur cümleler; sayılar kalın.
  const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <b className="font-semibold text-crema">{children}</b>;
  const story: React.ReactNode[] = [];
  if (s.exams) story.push(<>Baristalar <B>{s.exams} sınava</B> girdi; başarı oranı <B>%{s.passRate}</B>{scoreDelta ? <>, ortalama puan önceki döneme göre <B>{scoreDelta > 0 ? `${scoreDelta} puan arttı` : `${-scoreDelta} puan düştü`}</B></> : null}.</>);
  else story.push(<>Bu dönemde sınav yapılmadı.</>);
  if (best) story.push(<>Dönemin öne çıkan mağazası <B>{best.store.name}</B>: ortalama sınav puanı {best.avgScore}.</>);
  story.push(s.requestsSolved
    ? <>Mağazalardan gelen <B>{s.requestsSolved} talep</B> ortalama <B>{fmtDur(s.avgResolve)}</B> içinde çözüldü; şu an <B>{s.openNow} açık talep</B> var{s.urgentNow ? <> ({s.urgentNow} acil)</> : null}.</>
    : <>Bu dönemde çözülen talep yok; şu an <B>{s.openNow} açık talep</B> var{s.urgentNow ? <> ({s.urgentNow} acil)</> : null}.</>);
  // Katılan sayılmaz: sistem ilk kurulunca bütün baristalar "yeni" görünür. Yalnızca ayrılan.
  if (s.left) story.push(<>Bu dönemde <B>{s.left} barista</B> ayrıldı{s.turnover !== null ? <> (ayrılma oranı %{s.turnover})</> : null}.</>);

  return (
    <Page wide>
      <div className={`${t.card} p-5 sm:p-6 flex flex-col gap-4`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[26px] sm:text-[30px] font-bold text-crema leading-tight">{greeting(me.name)}</h1>
          <span className="text-[14px] text-fg-3">{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-3">{period.label} · kısa özet</span>
          <ul className="flex flex-col gap-1.5">
            {story.map((x, i) => <li key={i} className="text-[16px] sm:text-[17px] leading-relaxed text-fg-2 flex gap-2.5"><span className="text-crema/60 mt-[0.6em] w-1.5 h-1.5 rounded-full bg-current shrink-0" /><span>{x}</span></li>)}
          </ul>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
        {ctx.loading && <span className="text-[13px] text-fg-3">Dönem verisi yükleniyor…</span>}
        {ctx.error && <span className="text-[13px] text-negative">{ctx.error}</span>}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className={`${t.card} p-5 flex flex-col gap-1`}>
          <span className="text-[13px] text-fg-3 font-medium">Zincir ortalama sınav puanı</span>
          <span className="text-[34px] font-bold tnum leading-none mt-1">{s.avgScore ?? '—'}{s.avgScore !== null && <span className="text-[16px] font-semibold text-fg-3 ml-1.5">puan</span>}</span>
          <span className="text-[13px] text-fg-3">{scoreDelta ? `${scoreDelta > 0 ? '▲' : '▼'} ${Math.abs(scoreDelta)} puan, önceki döneme göre` : `${s.exams} sınav · ${s.examTakers} barista`}</span>
        </div>
        <button type="button" onClick={() => best && openStore(best.store.id)} disabled={!best} className={`${t.cardInteractive} p-5 flex flex-col gap-1 text-left`}>
          <span className="text-[13px] text-fg-3 font-medium flex items-center gap-1.5"><Icon name="award" size={14} /> Dönemin mağazası</span>
          <span className="text-[24px] font-bold leading-tight mt-1">{best?.store.name || '—'}</span>
          <span className="text-[13px] text-fg-3">{best ? `Ortalama ${best.avgScore} puan · ${best.exams} sınav · %${best.passRate} geçti` : 'Henüz yeterli sınav yok'}</span>
        </button>
        <div className={`${t.card} p-5 flex flex-col gap-1`}>
          <span className="text-[13px] text-fg-3 font-medium flex items-center gap-1.5"><Icon name="medal" size={14} /> Dönemin baristası</span>
          <span className="text-[24px] font-bold leading-tight mt-1">{star?.name || '—'}</span>
          <span className="text-[13px] text-fg-3">{star ? `${storeName(star.storeId)} · ortalama ${star.avgScore} puan · ${star.exams} sınav` : 'En az iki sınava giren yok'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Aktif barista" value={s.activeBaristas} icon="users" to={go('kurul.magazalar', '/magazalar')}
          hint={`${s.stores} mağaza${s.left ? ` · ${s.left} ayrılan` : ''}`} />
        <Stat label="Eğitim ilerlemesi" value={`%${s.avgProgress}`} icon="target" tone="positive" to={go('kurul.magazalar', '/magazalar')} hint="Aktif baristaların ortalaması" />
        <Stat label="Sınav başarısı" value={pctText(s.passRate)} icon="clipboard" tone="accent"
          hint={delta(s.passRate, prev.passRate) || `${s.exams} sınav`} />
        <Stat label="Ortalama çözüm süresi" value={fmtDur(s.avgResolve)} icon="wrench" tone={s.urgentNow ? 'negative' : 'neutral'} to={go('kurul.isler', '/isler')}
          hint={`${s.openNow} açık talep${s.urgentNow ? ` · ${s.urgentNow} acil` : ''}`} />
        <Stat label="Onay bekleyen içerik" value={s.pendingProposals} icon="stamp" tone={s.pendingProposals ? 'caution' : 'neutral'} to={go('kurul.isler', '/isler?sekme=onay')} />
        <Stat label="Gecikmiş eğitim görevi" value={s.overdueTasks} icon="flag" tone={s.overdueTasks ? 'negative' : 'neutral'} to={go('kurul.isler', '/isler?sekme=gorev')} />
        <Stat label="Yayınlanan içerik" value={s.published} icon="layers" hint="Ders, ürün ve bülten" />
        <Stat label="Ayrılma oranı" value={pctText(s.turnover)} icon="logout" hint={`${s.left} ayrılan · dönem başı ekibe göre`} />
      </div>

      <Section label="Mağaza sıralaması · ortalama sınav puanı">
        {ranking.length === 0 ? <Empty icon="store" text="Bu dönemde sınav yok." /> : (
          <div className={t.listGroup}>
            {ranking.map((r, i) => (
              <button key={r.store.id} type="button" onClick={() => openStore(r.store.id)} className={`${t.listRow} min-h-14`}>
                <span className={`w-7 text-center text-[17px] font-bold tnum ${i === 0 ? 'text-crema' : 'text-fg-3'}`}>{i + 1}</span>
                <span className="w-36 sm:w-44 text-[15px] font-medium truncate">{r.store.name}</span>
                <ProgressBar value={r.avgScore || 0} className="flex-1" />
                <span className="w-12 text-right text-[15px] font-semibold tnum">{r.avgScore}</span>
                <span className="hidden sm:block w-40 text-right text-[13px] text-fg-3 tnum whitespace-nowrap">{r.exams} sınav · %{r.passRate} geçti</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section label={`Dikkat gerektirenler${att.length ? ` · ${att.length}` : ''}`}>
        {att.length === 0 ? <Empty icon="check" text="Şu an aksayan bir iş görünmüyor." /> : (
          <div className={t.listGroup}>
            {att.slice(0, 10).map((a, i) => (
              <div key={i} role="button" tabIndex={0} className={t.listRow}
                onClick={() => (a.topic.kind === 'request' && a.topic.id ? openReq(a.topic.id) : a.topic.kind === 'store' && a.topic.id ? openStore(a.topic.id) : navigate(a.to))}>
                <span className={t.iconChip(a.tone)}><Icon name="alert" size={15} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium leading-snug">{a.text}</div>
                  <div className="text-[13px] text-fg-3 mt-0.5">{a.detail}</div>
                </div>
                <AskBtn onClick={() => ask(a.topic)} />
              </div>
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
            {!levels && (
              history.error ? <span className="text-[13px] text-negative">{history.error}</span>
                : <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd} self-start`} disabled={history.loading && wantLevels} onClick={() => setWantLevels(true)}>
                  {history.loading && wantLevels ? 'Hesaplanıyor…' : 'Dağılımı göster'}
                </button>
            )}
            {levels?.map((l) => (
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
                    <div className="text-[12px] text-fg-3">{m.exams} sınav · ortalama {m.avgScore} puan</div>
                  </div>
                  <Badge tone={m.passRate < 60 ? 'negative' : m.passRate < 80 ? 'caution' : 'positive'}>%{m.passRate} geçti</Badge>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
      {sheets}
      {sheet}
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Mağazalar — karne                                                    */
/* ------------------------------------------------------------------ */

type SortKey = 'name' | 'progress' | 'passRate' | 'openRequests' | 'avgResolve' | 'overdueTasks';

export const BoardStoresPage: React.FC = () => {
  const [period, setPeriod] = usePeriod();
  const ctx = useBoardCtx(period, { exams: true });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'progress', dir: -1 });
  const { ask, sheet, asking } = useAsk();
  const rows = useMemo(() => scorecard(ctx, period), [ctx, period]);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    if (sort.key === 'name') return a.store.name.localeCompare(b.store.name, 'tr') * sort.dir;
    const va = a[sort.key] ?? -1, vb = b[sort.key] ?? -1;
    return ((va as number) - (vb as number)) * sort.dir;
  }), [rows, sort]);
  const { openStore, sheets } = useDetailSheets(period, ask, asking);

  const cols: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Mağaza' }, { key: 'progress', label: 'İlerleme' }, { key: 'passRate', label: 'Sınav başarısı' },
    { key: 'openRequests', label: 'Açık talep' }, { key: 'avgResolve', label: 'Çözüm süresi' }, { key: 'overdueTasks', label: 'Gecikmiş görev' }
  ];
  const grid = 'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] gap-3';

  return (
    <Page wide>
      <PageTitle title="Mağazalar" subtitle="Mağaza karnesi: eğitim, sınav ve talep göstergeleri yan yana. Başlığa dokununca sıralanır." />
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="overflow-x-auto">
        <div className={`${t.listGroup} min-w-[680px]`}>
          <div className={`${grid} px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-fg-3`}>
            {cols.map((c) => (
              <button key={c.key} className="text-left flex items-center gap-1 hover:text-crema"
                onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === 'name' ? 1 : -1 }))}>
                {c.label}{sort.key === c.key && <Icon name={sort.dir === 1 ? 'arrowUp' : 'arrowDown'} size={11} />}
              </button>
            ))}
          </div>
          {sorted.map((r) => (
            <button key={r.store.id} onClick={() => openStore(r.store.id)} className={`${grid} w-full px-4 py-3.5 items-center text-left hover:bg-panel-2 transition-colors`}>
              <span className="min-w-0"><span className="block text-[15px] font-semibold truncate">{r.store.name}</span><span className="text-[13px] text-fg-3">{r.baristas} barista</span></span>
              <span className="flex items-center gap-2 min-w-0"><ProgressBar value={r.progress || 0} className="flex-1" /><span className="text-[14px] tnum w-10 text-right">{pctText(r.progress)}</span></span>
              <span className="text-[15px] tnum">{pctText(r.passRate)}<span className="text-[13px] text-fg-3"> · {r.exams} sınav</span></span>
              <span>{r.openRequests ? <Badge tone={r.urgentOpen ? 'negative' : 'caution'}>{r.openRequests}{r.urgentOpen ? ` · ${r.urgentOpen} acil` : ''}</Badge> : <span className="text-[14px] text-fg-3">—</span>}</span>
              <span className="text-[15px] tnum text-fg-2">{fmtDur(r.avgResolve)}</span>
              <span>{r.overdueTasks ? <Badge tone="negative">{r.overdueTasks}</Badge> : <span className="text-[14px] text-fg-3">—</span>}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-[13px] text-fg-3">Sınav başarısı ve ortalama çözüm süresi seçili döneme göredir; ilerleme ve açık talepler bugünün durumudur.</p>

      {sheets}
      {sheet}
    </Page>
  );
};

const StoreDetail: React.FC<{ row: ScoreRow; period: Period; onAsk: () => void; onOpenReq: (id: string) => void }> = ({ row, period, onAsk, onOpenReq }) => {
  const ctx = useBoardCtx(period);
  const team = ctx.baristas.filter((b) => b.active && b.storeId === row.store.id)
    .map((b) => ({ b, pct: overallPercent(ctx.modules, ctx.lessons, ctx.progress[b.id] || EMPTY_PROGRESS, ctx.tracks) }))
    .sort((a, b) => b.pct - a.pct);
  const open = ctx.requests.filter((r) => r.storeId === row.store.id && !closedOf(r));
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {[['İlerleme', pctText(row.progress)], ['Sınav başarısı', pctText(row.passRate)], ['Çözüm süresi', fmtDur(row.avgResolve)]].map(([l, v]) => (
          <div key={l} className={`${t.panel} p-3 flex flex-col gap-0.5`}><span className="text-[11px] text-fg-3">{l}</span><span className="text-[17px] font-semibold tnum">{v}</span></div>
        ))}
      </div>
      <p className="text-[12px] text-fg-3 -mt-1">{period.label} · {row.exams} sınav · {row.requests} talep açıldı{row.left ? ` · ${row.left} barista ayrıldı` : ''}</p>
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
              <button key={r.id} type="button" onClick={() => onOpenReq(r.id)} className={t.listRow}>
                <Badge tone={r.priority === 'urgent' ? 'negative' : 'caution'}>{STATUS[r.status].label}</Badge>
                <span className="flex-1 min-w-0 text-[14.5px] text-left truncate">{r.title}</span>
                <span className="text-[12px] text-fg-3">{fmtDate(r.createdAt)}</span>
              </button>
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

/** Talepte kim ilgileniyor, kim onayladı / onayı kim bekliyor. */
function requestPeople(r: StoreRequest) {
  const notes = [...r.notes].sort((a, b) => a.at - b.at);
  // Yalnızca açıp bakmak ("Görüldü" notu) ilgilenmek sayılmaz; adı boş yazılmış
  // (uygulama geliştiricisi) notlar da kişi olarak gösterilmez.
  const ops = notes.filter((n) => n.side === 'ops' && n.byName && (n.text || (n.status && n.status !== 'seen')));
  let status = 'open', approver: string | null = null;
  for (const n of notes) {
    if (n.status && status === 'approval' && n.status !== 'approval' && n.status !== 'rejected' && n.byName) approver = n.byName;
    if (n.status) status = n.status;
  }
  // İlgilenen: operasyondan son yazan / durumu değiştiren; onaylayan dışındaki kişi öncelikli.
  const handler = [...ops].reverse().find((n) => n.byName !== approver)?.byName || ops[ops.length - 1]?.byName || null;
  return { handler, approver };
}

const BoardRequestCard: React.FC<{ r: StoreRequest; people: OpsPeople; onOpen: () => void; onAsk: () => void }> = ({ r, people, onOpen, onAsk }) => {
  const cat = catOf(r.category);
  const last = [...r.notes].reverse().find((n) => n.text);
  const { handler, approver } = requestPeople(r);
  const closed = isClosed(r.status);
  const age = closed ? `${fmtDur((r.closedAt || r.updatedAt) - r.createdAt)} içinde kapandı` : `${Math.max(1, Math.round((Date.now() - r.createdAt) / 86400000))} gündür açık`;
  const st = STATUS[r.status];
  const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex flex-col gap-0.5 min-w-0"><span className="text-[12px] text-fg-3">{label}</span><span className="text-[14.5px] font-medium truncate">{children}</span></div>
  );
  return (
    <div className={`${t.cardInteractive} p-5 flex flex-col sm:flex-row gap-4 items-start`} onClick={onOpen} role="button" tabIndex={0}>
      <div className="flex-1 min-w-0 flex flex-col gap-3 w-full">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[14px] font-semibold ${r.priority === 'urgent' ? 'bg-negative-bg text-negative' : 'bg-panel-3 text-crema'}`}>
            <Icon name={cat.icon} size={15} /> {cat.label}{r.equipment ? ` · ${r.equipment}` : ''}
          </span>
          {r.priority === 'urgent' && <Badge tone="negative">Acil</Badge>}
          <Badge tone={st.tone === 'accent' ? 'neutral' : st.tone}>{st.label}</Badge>
          <span className="text-[13px] text-fg-3 sm:ml-auto">{age}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-fg-2 flex items-center gap-1.5"><Icon name="store" size={15} /> {r.storeName}</span>
          <span className="text-[19px] font-semibold leading-snug">{r.title}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          <Fact label="Açan">{r.createdByName || '—'}</Fact>
          <Fact label="İlgilenen">{handler || <span className="text-caution">Henüz kimse</span>}</Fact>
          {r.status === 'approval'
            ? <Fact label="Onay bekliyor">{[people.director, people.opsmanager].filter(Boolean).join(' / ') || 'Yönetici onayı'}</Fact>
            : approver ? <Fact label="Onaylayan">{approver}</Fact> : null}
          {!closed && r.waitReason && <Fact label="Neyi bekliyor">{reasonLabel(r.waitReason)}</Fact>}
        </div>
        {last && (
          <div className="border-l-2 border-line-2 pl-3 text-[14px] text-fg-2 leading-relaxed line-clamp-2">
            {last.byName && <b className="font-medium text-crema">{last.byName}:</b>} {last.text}
          </div>
        )}
      </div>
      <AskBtn onClick={onAsk} />
    </div>
  );
};

type WorkTab = 'talep' | 'onay' | 'gorev' | 'duyuru' | 'kapanan';
const BULLETIN_KIND = { duyuru: 'Duyuru', kampanya: 'Kampanya', liderlik: 'Liderlik' } as const;
const PROPOSAL_KIND = { lesson: 'Ders', module: 'Modül', track: 'Eğitim yolu', question: 'Soru', bulletin: 'Bülten', order: 'Sıralama', product: 'Yeni ürün' } as const;

export const BoardWorkPage: React.FC = () => {
  const ctx = useBoardCtx(periodOf('30'));
  const [params, setParams] = useSearchParams();
  const tab = (params.get('sekme') || 'talep') as WorkTab;
  const setTab = (x: WorkTab) => setParams(x === 'talep' ? {} : { sekme: x }, { replace: true });
  const { ask, sheet, asking } = useAsk();
  const people = useOpsPeople();
  const { data: bulletins } = useQueryLive<Bulletin>(query(collection(db, 'bulletins'), orderBy('createdAt', 'desc'), limit(30)), 'board-bulletins');
  const now = Date.now();

  const open = ctx.requests.filter((r) => !closedOf(r))
    .sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1) || a.createdAt - b.createdAt);
  const closed = ctx.requests.filter((r) => closedOf(r) && (r.closedAt || r.updatedAt) > now - 14 * 86400000)
    .sort((a, b) => (b.closedAt || b.updatedAt) - (a.closedAt || a.updatedAt));
  const pending = ctx.proposals.filter((p) => p.status === 'pending');
  const approvalReqs = open.filter((r) => r.status === 'approval');
  const tasks = useMemo(() => ctx.assignments.filter((a) => !taskInvalidReason(a, { modules: ctx.modules, lessons: ctx.lessons, tracks: ctx.tracks, baristas: ctx.baristas })).map((a) => {
    const team = taskTargets(a, ctx.baristas);
    const done = team.filter((b) => assignmentDone(a, ctx.progress[b.id])).length;
    const overdue = team.filter((b) => isOverdue(a, assignmentDone(a, ctx.progress[b.id]))).length;
    return { a, team: team.length, done, overdue };
  }).filter((x) => x.team > 0 && x.done < x.team)
    .sort((x, y) => y.overdue - x.overdue || (x.a.dueAt || Infinity) - (y.a.dueAt || Infinity)), [ctx]);
  const live = bulletins.filter((b) => b.published && (!b.expiresAt || b.expiresAt > now));

  const { openReq, sheets } = useDetailSheets(periodOf('30'), ask, asking);
  const storeName = (id: string) => ctx.stores.find((s) => s.id === id)?.name || '';

  const TABS: { id: WorkTab; label: string; n: number }[] = [
    { id: 'talep', label: 'Açık talepler', n: open.length },
    { id: 'onay', label: 'Onay bekleyenler', n: pending.length + approvalReqs.length },
    { id: 'gorev', label: 'Eğitim görevleri', n: tasks.length },
    { id: 'duyuru', label: 'Yayındaki bültenler', n: live.length },
    { id: 'kapanan', label: 'Son kapananlar', n: closed.length }
  ];

  const ReqRow: React.FC<{ r: StoreRequest }> = ({ r }) => (
    <BoardRequestCard r={r} people={people} onOpen={() => openReq(r.id)} onAsk={() => ask({ kind: 'request', id: r.id, title: `${r.storeName}: ${r.title}` })} />
  );

  return (
    <Page wide>
      <PageTitle title="Süren işler" subtitle="Operasyonda şu an devam edenler. Burada hiçbir şey değiştirilmez; bir konuyu merak ederseniz yanındaki “Sor” ile Kahve Operasyonu'na sorabilirsiniz." />
      <div className={`${t.scrollX} -mx-1 px-1`}>
        <div className="flex gap-2">
          {TABS.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)} className={`${t.chip} h-10 px-4 text-[14px] whitespace-nowrap ${tab === x.id ? t.chipOn : t.chipOff}`}>{x.label} · {x.n}</button>
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
          <Section label={`Servis onayı bekleyen talepler · ${approvalReqs.length}`}>
            {approvalReqs.length === 0 ? <Empty icon="shield" text="Onay bekleyen servis talebi yok." /> : (
              <div className="flex flex-col gap-2">{approvalReqs.map((r) => <ReqRow key={r.id} r={r} />)}</div>
            )}
          </Section>
          <Section label={`Yayın onayı bekleyen içerik ve bültenler · ${pending.length}`}>
            {pending.length === 0 ? <Empty icon="stamp" text="Onay bekleyen içerik yok." /> : (
              <div className={t.listGroup}>
                {pending.map((p) => (
                  <div key={p.id} className={`${t.listRowStatic} py-4 items-start`}>
                    <span className={t.iconChip('caution')}><Icon name="stamp" size={16} /></span>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-caution">{PROPOSAL_KIND[p.kind] || 'Öneri'}</div>
                      <div className="text-[17px] font-semibold leading-snug">{p.title}</div>
                      <div className="text-[14px] text-fg-2">{p.summary}</div>
                      <div className="text-[13px] text-fg-3">{p.createdByName && <>Öneren: <b className="font-medium text-fg-2">{p.createdByName}</b> · </>}Onay bekliyor: <b className="font-medium text-fg-2">{[people.director, people.opsmanager].filter(Boolean).join(' / ') || 'yetkili yönetici'}</b> · {Math.round((now - p.createdAt) / 86400000) ? `${Math.round((now - p.createdAt) / 86400000)} gündür` : 'bugün geldi'}</div>
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
            <div key={a.id} className={`${t.listRowStatic} py-4`}>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="text-[15px] font-semibold text-fg-2 flex items-center gap-1.5"><Icon name="store" size={14} /> {storeName(a.storeId)}</div>
                <div className="text-[17px] font-semibold leading-snug">{a.title}</div>
                <div className="text-[13px] text-fg-3">{a.createdByName && <>Atayan: <b className="font-medium text-fg-2">{a.createdByName}</b></>}{a.dueAt ? `${a.createdByName ? ' · ' : ''}son gün ${fmtDate(a.dueAt)}` : ''}</div>
                <div className="flex items-center gap-2 mt-1"><ProgressBar value={(done / team) * 100} className="flex-1 max-w-56" /><span className="text-[14px] tnum text-fg-2">{done}/{team} barista tamamladı</span></div>
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
              <div className="flex items-center gap-2"><Badge>{BULLETIN_KIND[b.kind] || 'Bülten'}</Badge><span className="text-[11px] text-fg-3 ml-auto">{fmtDate(b.createdAt)}{b.createdByName ? ` · ${b.createdByName}` : ''}</span></div>
              <div className="text-[15px] font-semibold">{b.title}</div>
              <p className="text-[13px] text-fg-2 leading-relaxed whitespace-pre-wrap line-clamp-4">{b.body.replace(/\*\*/g, '')}</p>
              <div className="text-[11.5px] text-fg-3">{b.storeIds?.length ? b.storeIds.map(storeName).join(', ') : 'Tüm mağazalar'}{b.expiresAt ? ` · ${fmtDate(b.expiresAt)} tarihine kadar` : ''}</div>
            </div>
          ))}
        </div>
      ))}

      {sheets}
      {sheet}
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Raporlar                                                             */
/* ------------------------------------------------------------------ */

const fileDate = () => localDay();

export const BoardReportsPage: React.FC = () => {
  const [period, setPeriod] = usePeriod();
  const ctx = useBoardCtx(period);
  // Tablolar düğmeye basınca hazırlanır: karne toplama sorgusuyla, barista ve
  // sınav tabloları dönemin sınav belgeleriyle (ekran açılınca okunmaz).
  const [busy, setBusy] = useState<string | null>(null);
  const ids = () => ({
    stores: ctx.stores.filter((s) => s.active).map((s) => s.id),
    modules: ctx.modules.map((m) => m.id),
    baristas: examBaristaIds(ctx.baristas, period.from)
  });
  const run = (key: string, f: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(key);
    try { await f(); } catch (e) { alert(errorText(e)); } finally { setBusy(null); }
  };
  const storeName = (id: string) => ctx.stores.find((s) => s.id === id)?.name || '';
  const inP = (x?: number | null) => !!x && x >= period.from && x <= period.to;
  const slug = `${period.id}-${fileDate()}`;

  const csv = {
    karne: run('karne', async () => {
      const examStats = await fetchOnce(statsKey(period), () => loadExamStats(period.from, periodTo(period), ids()));
      downloadCsv(`magaza-karnesi-${slug}`, [
      ['Mağaza', 'Barista', 'İlerleme %', 'Sınav', 'Geçme %', 'Ort. puan', 'Açılan talep', 'Açık talep', 'Acil açık', 'Ortalama çözüm (saat)', 'Gecikmiş görev', 'Ayrılan'],
      ...scorecard({ ...ctx, examStats }, period).map((r) => [r.store.name, r.baristas, r.progress, r.exams, r.passRate, r.avgScore, r.requests, r.openRequests, r.urgentOpen,
        r.avgResolve !== null ? Math.round(r.avgResolve / 3600000) : null, r.overdueTasks, r.left])
      ]);
    }),
    barista: run('barista', async () => {
      const attempts = await loadPeriodExams(period);
      downloadCsv(`barista-egitim-${slug}`, [
      ['Barista', 'Mağaza', 'Rol', 'Durum', 'İlerleme %', 'Geçilen modül', 'Dönemde sınav', 'Dönemde geçti', 'İşe başlama'],
      ...ctx.baristas.map((b) => {
        const p = ctx.progress[b.id] || EMPTY_PROGRESS;
        const ex = attempts.filter((a) => a.baristaId === b.id && a.submittedAt && !a.voided && inP(a.submittedAt));
        return [b.name, storeName(b.storeId), BARISTA_ROLE_LABEL[b.role], b.active ? 'Aktif' : 'Ayrıldı', overallPercent(ctx.modules, ctx.lessons, p, ctx.tracks),
          Object.keys(p.modules || {}).length, ex.length, ex.filter((a) => a.passed).length, b.startedAt ? fmtDate(new Date(b.startedAt).getTime()) : fmtDate(b.createdAt)];
      })
      ]);
    }),
    talep: () => downloadCsv(`talepler-${slug}`, [
      ['Açılış', 'Mağaza', 'Tür', 'Öncelik', 'Başlık', 'Durum', 'Bekleme nedeni', 'Kapanış', 'Süre (saat)', 'Açan'],
      ...ctx.requests.filter((r) => inP(r.createdAt) || !closedOf(r)).sort((a, b) => a.createdAt - b.createdAt).map((r) => [
        fmtDateTime(r.createdAt), r.storeName, catOf(r.category).label, r.priority === 'urgent' ? 'Acil' : 'Normal', r.title, STATUS[r.status].label,
        r.waitReason ? reasonLabel(r.waitReason) : '', r.closedAt ? fmtDateTime(r.closedAt) : '',
        Math.round(((r.closedAt || Date.now()) - r.createdAt) / 3600000), r.createdByName || ''])
    ]),
    sinav: run('sinav', async () => {
      const attempts = await loadPeriodExams(period);
      downloadCsv(`sinavlar-${slug}`, [
      ['Tarih', 'Barista', 'Mağaza', 'Modül', 'Tür', 'Puan %', 'Sonuç', 'Doğru', 'Soru'],
      ...attempts.filter((a) => a.submittedAt && !a.voided && inP(a.submittedAt)).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0)).map((a) => [
        fmtDateTime(a.submittedAt), a.baristaName, storeName(a.storeId), a.moduleTitle, a.lessonId ? 'Mini sınav' : 'Modül sınavı', a.score, a.passed ? 'Geçti' : 'Kaldı', a.correct, a.total])
      ]);
    })
  };

  const Item: React.FC<{ icon: 'download' | 'store' | 'users' | 'wrench' | 'clipboard'; title: string; text: string; onClick: () => void; loading?: boolean }> = ({ icon, title, text, onClick, loading }) => (
    <button onClick={onClick} disabled={loading} className={`${t.cardInteractive} p-4 text-left flex items-start gap-3`}>
      <span className={t.iconChip('neutral')}><Icon name={icon} size={16} /></span>
      <span className="flex-1 min-w-0"><span className="block text-[14px] font-semibold">{title}</span><span className="block text-[12.5px] text-fg-3 leading-relaxed mt-0.5">{loading ? 'Hazırlanıyor…' : text}</span></span>
      <Icon name="download" size={16} className="text-fg-3 mt-1" />
    </button>
  );

  return (
    <Page wide>
      <PageTitle title="Raporlar" subtitle={IS_ANDROID_APP ? 'Seçtiğiniz dönem için yönetim raporu. Excel tabloları ve yazdırma bilgisayardaki panelde.' : "Seçtiğiniz dönem için yönetim raporu ve Excel'de açılan tablolar."} />
      <PeriodPicker value={period} onChange={setPeriod} />
      <Link to={`/rapor${period.id !== '30' ? `?donem=${period.id}` : ''}`} className={`${t.cardInteractive} p-5 flex items-center gap-4`}>
        <span className={t.iconChip('accent')}><Icon name="chart" size={18} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] font-semibold">Yönetim raporu · {period.label}</span>
          <span className="block text-[13px] text-fg-3 leading-relaxed mt-0.5">Özet göstergeler, mağaza karnesi, talep süreleri, eğitim başarısı ve ekip hareketi tek sayfada.{IS_ANDROID_APP ? '' : ' Yazdırılabilir, PDF olarak kaydedilebilir.'}</span>
        </span>
        <Icon name="chevronRight" size={18} className="text-fg-3" />
      </Link>
      {/* APK'da (Android WebView) dosya indirme ve yazdırma çalışmıyor; bu
          düğmeler yalnızca tarayıcıda görünür. */}
      {!IS_ANDROID_APP && <Section label="Excel tabloları (CSV)">
        <div className="grid sm:grid-cols-2 gap-3">
          <Item icon="store" title="Mağaza karnesi" text="Her mağaza için ilerleme, sınav başarısı, talepler, gecikmiş görevler, ekip hareketi." onClick={csv.karne} loading={busy === 'karne'} />
          <Item icon="users" title="Barista eğitim durumu" text="Her baristanın ilerlemesi, geçtiği modüller ve dönemdeki sınavları." onClick={csv.barista} loading={busy === 'barista'} />
          <Item icon="wrench" title="Talepler" text="Dönemde açılan ve hâlâ açık olan talepler, durumları ve süreleri." onClick={csv.talep} />
          <Item icon="clipboard" title="Sınav sonuçları" text="Dönemdeki bütün sınavlar: barista, modül, puan, sonuç." onClick={csv.sinav} loading={busy === 'sinav'} />
        </div>
      </Section>}
    </Page>
  );
};

/** Yazdırılabilir yönetim raporu. Tarayıcının "Yazdır → PDF olarak kaydet"i ile dosyaya dönüşür. */
export const BoardPrintReport: React.FC = () => {
  const [period] = usePeriod();
  const ctx = useBoardCtx(period, { exams: true });
  const me = useStaffSession();
  const trend = useExamTrend(period);
  const s = useMemo(() => summary(ctx, period), [ctx, period]);
  const prev = useMemo(() => withExams(summary(ctx, previousOf(period)), trend.data?.prev), [ctx, period, trend.data]);
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
        {!IS_ANDROID_APP && <button onClick={() => window.print()} className={`${t.btn} ${t.btnPrimary} ${t.btnMd} ml-auto`}><Icon name="download" size={14} /> Yazdır / PDF kaydet</button>}
      </div>
      <header className="flex flex-col gap-1 border-b border-line pb-4">
        <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-fg-3">1401 Coffee · Yönetim Kurulu</div>
        <h1 className="text-[24px] font-bold">Kahve Operasyonu raporu · {period.label}</h1>
        <div className="text-[12px] text-fg-3">{fmtDate(period.from)} – {fmtDate(period.to)} · Hazırlanma: {fmtDateTime(Date.now())} · {me.name}</div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Özet</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="Aktif barista / mağaza" value={`${s.activeBaristas} / ${s.stores}`} note={s.left ? `${s.left} ayrılan` : 'dönemde ayrılan yok'} />
          <Kpi label="Eğitim ilerlemesi" value={`%${s.avgProgress}`} note="aktif baristaların ortalaması" />
          <Kpi label="Sınav başarısı" value={pctText(s.passRate)} note={`${s.exams} sınav${prev.passRate !== null ? ` · önceki %${prev.passRate}` : ''}`} />
           <Kpi label="Ortalama talep çözüm süresi" value={fmtDur(s.avgResolve)} note={`${s.requestsSolved} çözüldü · ${s.openNow} açık`} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Mağaza karnesi</h2>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>Mağaza</th><th className={th}>Barista</th><th className={th}>İlerleme</th><th className={th}>Sınav</th><th className={th}>Geçme</th><th className={th}>Açık talep</th><th className={th}>Çözüm</th><th className={th}>Gecikmiş görev</th></tr></thead>
          <tbody>
            {card.map((r) => (
              <tr key={r.store.id}><td className={`${td} font-medium`}>{r.store.name}</td><td className={td}>{r.baristas}</td><td className={td}>{pctText(r.progress)}</td><td className={td}>{r.exams}</td><td className={td}>{pctText(r.passRate)}</td><td className={td}>{r.openRequests}{r.urgentOpen ? ` (${r.urgentOpen} acil)` : ''}</td><td className={td}>{fmtDur(r.avgResolve)}</td><td className={td}>{r.overdueTasks || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Talepler</h2>
        <p className="text-[13px] leading-relaxed">
          Dönemde {rq.total} talep açıldı: {rq.done} çözüldü, {rq.rejected} reddedildi, {rq.open} hâlâ açık ({rq.urgent} acil).
          Talepler ortalama {fmtDur(rq.avgResolve)} içinde çözüldü; ilk yanıt çoğunlukla {fmtDur(rq.medianFirst)} içinde verildi.
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
            <tbody>{mods.map((m) => <tr key={m.id}><td className={td}>{m.title}</td><td className={td}>{m.exams}</td><td className={td}>%{m.passRate}</td><td className={td}>{m.avgScore}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Ekip ve içerik</h2>
        <p className="text-[13px] leading-relaxed">
          {s.left ? `${s.left} barista ayrıldı${s.turnover !== null ? ` (ayrılma oranı %${s.turnover})` : ''}.` : 'Dönemde ayrılan barista yok.'}
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
