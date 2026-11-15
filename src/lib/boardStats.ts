import type { Assignment, Attempt, Barista, Lesson, Module, Progress, Proposal, Store, StoreRequest, Track } from '../../shared/types';

/** Modül sınavı özeti (mini sınavlar hariç): sayı, geçen, ortalama puan (sum: puanların toplamı). */
export interface ExamAgg { exams: number; passed: number; avgScore: number | null; sum: number }

/** Kurul dönemi sınav göstergeleri (bkz. staffData loadExamStats). */
export interface ExamStats {
  from: number;
  to: number | null;
  total: ExamAgg;
  byStore: Record<string, ExamAgg>;
  byModule: Record<string, ExamAgg>;
  byBarista: Record<string, ExamAgg>;
  /** Yedek yoldan (belgelerden) hesaplandıysa o belgeler. */
  docs?: Attempt[];
}
/** Dönemde sınavı olup sonradan silinen modüllerin toplamı (uzun dönemde). */
export const DELETED_MODULES = '__silinmis__';
import { TZ, istParts, mondayOf, monthStartOf, yearStartOf } from './day';
import { assignmentDone, EMPTY_PROGRESS, isOverdue, overallPercent } from './progress';
import { closedOf } from './requestStats';
import { taskInvalidReason, taskTargets } from './taskValidity';

/**
 * Yönetim Kurulu göstergeleri. Hepsi panelin zaten okuduğu veriden
 * hesaplanır; ayrıca bir kayıt tutulmaz. Dönem karşılaştırması için her
 * gösterge bir önceki eşit uzunluktaki dönemle de hesaplanabilir.
 */

const DAY = 86400000;

export type PeriodId = '30' | '90' | 'ay' | 'gecen-ay' | 'yil' | 'gecen-yil';
export interface Period { id: PeriodId; from: number; to: number; label: string }

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: '30', label: 'Son 30 gün' },
  { id: '90', label: 'Son 90 gün' },
  { id: 'ay', label: 'Bu ay' },
  { id: 'gecen-ay', label: 'Geçen ay' },
  { id: 'yil', label: 'Bu yıl' },
  // 1 Ocak'tan sonra geçen yılın yıllık raporu (karne, Excel) başka hiçbir dönemle alınamıyordu (H11).
  { id: 'gecen-yil', label: 'Geçen yıl' }
];

/** Dönem sınırları İstanbul takvimiyle (bkz. lib/day): telefonun saat dilimi sonucu değiştirmez. */
export function periodOf(id: PeriodId, now = Date.now()): Period {
  const label = PERIODS.find((p) => p.id === id)?.label || '';
  switch (id) {
    case '90': return { id, from: now - 90 * DAY, to: now, label };
    case 'ay': return { id, from: monthStartOf(now), to: now, label };
    case 'gecen-ay': {
      const from = monthStartOf(now, -1);
      const to = monthStartOf(now) - 1;
      return { id, from, to, label: new Date(from).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric', timeZone: TZ }) };
    }
    case 'yil': return { id, from: yearStartOf(now), to: now, label };
    case 'gecen-yil': {
      const from = yearStartOf(now, -1);
      return { id, from, to: yearStartOf(now) - 1, label: `${istParts(from).y} yılı` };
    }
    default: return { id: '30', from: now - 30 * DAY, to: now, label };
  }
}

/**
 * Yıl ya da ay yeni başladı (ilk 7 gün): "Bu yıl"/"Bu ay" birkaç günlük veriyi
 * dönem özeti gibi gösteriyor; ekran geçen döneme bakmayı önerir.
 */
export function periodJustStarted(p: Period, now = Date.now()): PeriodId | null {
  if (p.id === 'yil' && now - p.from < 7 * DAY) return 'gecen-yil';
  if (p.id === 'ay' && now - p.from < 7 * DAY) return 'gecen-ay';
  return null;
}

/** Aynı uzunlukta bir önceki dönem (karşılaştırma için). */
export const previousOf = (p: Period): Period => ({ ...p, from: p.from - (p.to - p.from), to: p.from - 1, label: 'önceki dönem' });

export interface BoardCtx {
  stores: Store[];
  baristas: Barista[];
  progress: Record<string, Progress>;
  attempts: Attempt[];
  assignments: Assignment[];
  requests: StoreRequest[];
  proposals: Proposal[];
  modules: Module[];
  lessons: Lesson[];
  tracks: Track[];
  /**
   * Dönemin sınav göstergeleri (toplama sorgusu). Varsa ve dönem tutuyorsa
   * sınav sayıları bundan gelir; `attempts` boş olabilir (belgeler okunmadı).
   */
  examStats?: ExamStats | null;
}

const inP = (t: number | undefined | null, p: Period) => !!t && t >= p.from && t <= p.to;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
/** Kurul ekranında süreler ortalama olarak gösterilir (ortanca değil). */
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/** Dönemdeki modül sınavları. Mini sınavlar (Yeni ürün, 3 soru) sayılmaz: başarı oranını ve puanı şişiriyordu. */
const exams = (c: BoardCtx, p: Period) => c.attempts.filter((a) => a.submittedAt && !a.voided && !a.lessonId && inP(a.submittedAt, p));
/** Toplama sonucu bu dönemin mi (başlangıç bir günden az farklı). */
const statsFor = (c: BoardCtx, p: Period): ExamStats | null =>
  c.examStats && Math.abs(c.examStats.from - p.from) < DAY ? c.examStats : null;
const fromAgg = (a: ExamAgg | undefined) => ({
  exams: a?.exams ?? 0,
  passRate: a ? pct(a.passed, a.exams) : null,
  avgScore: a?.avgScore ?? null
});

/** Gecikmiş görev sayısı: geçersiz görevler (hedef kalmadı / içerik silindi) sayılmaz. */
function overdueOf(c: BoardCtx, list: Assignment[], team?: Barista[]): number {
  let n = 0;
  for (const a of list) {
    if (taskInvalidReason(a, { modules: c.modules, lessons: c.lessons, tracks: c.tracks, baristas: c.baristas, stores: c.stores })) continue;
    for (const b of taskTargets(a, team || c.baristas)) if (isOverdue(a, assignmentDone(a, c.progress[b.id]))) n++;
  }
  return n;
}

/** Barista o tarihte ekipte miydi (işe giriş ≤ t, ayrılış yok ya da > t). */
const activeAt = (b: Barista, t: number) => b.createdAt <= t && (b.active || (b.deactivatedAt || 0) > t);

export function summary(c: BoardCtx, p: Period) {
  const active = c.baristas.filter((b) => b.active);
  const ex = exams(c, p);
  const opened = c.requests.filter((r) => inP(r.createdAt, p));
  const solved = c.requests.filter((r) => r.status === 'done' && inP(r.closedAt || r.updatedAt, p));
  const open = c.requests.filter((r) => !closedOf(r));
  const joined = c.baristas.filter((b) => inP(b.createdAt, p));
  const left = c.baristas.filter((b) => !b.active && inP(b.deactivatedAt, p));
  // Ayrılma oranı: dönemde ayrılan / dönem başındaki ekip.
  const headStart = c.baristas.filter((b) => activeAt(b, p.from)).length;
  const overdue = overdueOf(c, c.assignments);
  const st = statsFor(c, p);
  const exam = st ? { ...fromAgg(st.total), examTakers: Object.values(st.byBarista).filter((x) => x.exams > 0).length } : {
    exams: ex.length,
    passRate: pct(ex.filter((a) => a.passed).length, ex.length),
    avgScore: ex.length ? Math.round(ex.reduce((s, a) => s + (a.score || 0), 0) / ex.length) : null,
    examTakers: new Set(ex.map((a) => a.baristaId)).size
  };
  return {
    activeBaristas: active.length,
    stores: c.stores.filter((s) => s.active).length,
    avgProgress: active.length ? Math.round(active.reduce((s, b) => s + overallPercent(c.modules, c.lessons, c.progress[b.id] || EMPTY_PROGRESS, c.tracks), 0) / active.length) : 0,
    ...exam,
    requestsOpened: opened.length,
    requestsSolved: solved.length,
    avgResolve: mean(solved.map((r) => (r.closedAt || r.updatedAt) - r.createdAt)),
    openNow: open.length,
    urgentNow: open.filter((r) => r.priority === 'urgent').length,
    approvalNow: open.filter((r) => r.status === 'approval').length,
    joined: joined.length,
    left: left.length,
    turnover: pct(left.length, headStart),
    pendingProposals: c.proposals.filter((x) => x.status === 'pending').length,
    published: c.proposals.filter((x) => x.status === 'approved' && inP(x.reviewedAt, p)).length,
    overdueTasks: overdue
  };
}
export type Summary = ReturnType<typeof summary>;

/** Mağaza karnesi: her mağaza için dönem göstergeleri. */
export function scorecard(c: BoardCtx, p: Period) {
  const ex = exams(c, p);
  const st = statsFor(c, p);
  return c.stores.filter((s) => s.active).map((s) => {
    const team = c.baristas.filter((b) => b.active && b.storeId === s.id);
    const progress = team.length ? Math.round(team.reduce((x, b) => x + overallPercent(c.modules, c.lessons, c.progress[b.id] || EMPTY_PROGRESS, c.tracks), 0) / team.length) : null;
    const se = st ? [] : ex.filter((a) => a.storeId === s.id);
    const exam = st ? fromAgg(st.byStore[s.id]) : {
      exams: se.length,
      passRate: pct(se.filter((a) => a.passed).length, se.length),
      avgScore: se.length ? Math.round(se.reduce((x, a) => x + (a.score || 0), 0) / se.length) : null
    };
    const reqs = c.requests.filter((r) => r.storeId === s.id);
    const solved = reqs.filter((r) => r.status === 'done' && inP(r.closedAt || r.updatedAt, p));
    const overdue = overdueOf(c, c.assignments.filter((a) => a.storeId === s.id), team);
    return {
      store: s,
      baristas: team.length,
      progress,
      ...exam,
      requests: reqs.filter((r) => inP(r.createdAt, p)).length,
      openRequests: reqs.filter((r) => !closedOf(r)).length,
      urgentOpen: reqs.filter((r) => !closedOf(r) && r.priority === 'urgent').length,
      avgResolve: mean(solved.map((r) => (r.closedAt || r.updatedAt) - r.createdAt)),
      overdueTasks: overdue,
      joined: c.baristas.filter((b) => b.storeId === s.id && inP(b.createdAt, p)).length,
      left: c.baristas.filter((b) => b.storeId === s.id && !b.active && inP(b.deactivatedAt, p)).length
    };
  });
}
export type ScoreRow = ReturnType<typeof scorecard>[number];

/** Dönemin mağazası: en yüksek ortalama sınav puanı (en az 3 sınav; yoksa en az 1). */
export function bestStore(rows: ScoreRow[]): ScoreRow | null {
  const pick = (min: number) => rows.filter((r) => r.exams >= min && r.avgScore !== null)
    .sort((a, b) => (b.avgScore as number) - (a.avgScore as number) || (b.passRate || 0) - (a.passRate || 0))[0] || null;
  return pick(3) || pick(1);
}

/** Dönemin baristası: en yüksek ortalama puan (en az 2 sınav), eşitlikte daha çok sınav. */
export function bestBarista(c: BoardCtx, p: Period) {
  const st = statsFor(c, p);
  if (st) {
    // Toplama sonucundan: ad ve mağaza baristanın kaydından (son sınavındaki ile aynı).
    const rows = c.baristas.filter((b) => b.active && (st.byBarista[b.id]?.exams || 0) >= 2).map((b) => ({
      id: b.id, name: b.name, storeId: b.storeId, exams: st.byBarista[b.id].exams, avgScore: st.byBarista[b.id].avgScore as number
    }));
    return rows.sort((a, b) => b.avgScore - a.avgScore || b.exams - a.exams)[0] || null;
  }
  const m = new Map<string, Attempt[]>();
  exams(c, p).forEach((a) => m.set(a.baristaId, [...(m.get(a.baristaId) || []), a]));
  const rows = [...m.entries()].map(([id, list]) => ({
    id, name: list[0].baristaName, storeId: list[0].storeId, exams: list.length,
    avgScore: Math.round(list.reduce((x, a) => x + (a.score || 0), 0) / list.length)
  })).filter((r) => c.baristas.some((b) => b.id === r.id && b.active));
  return rows.filter((r) => r.exams >= 2).sort((a, b) => b.avgScore - a.avgScore || b.exams - a.exams)[0] || null;
}

/** Modül bazında sınav başarısı: hangi eğitimde zorlanılıyor. */
export function modulePerformance(c: BoardCtx, p: Period) {
  const st = statsFor(c, p);
  if (st) {
    return Object.entries(st.byModule).filter(([, a]) => a.exams > 0).map(([id, a]) => ({
      id,
      title: id === DELETED_MODULES ? 'Silinmiş modüller' : c.modules.find((x) => x.id === id)?.title || id,
      exams: a.exams,
      passRate: pct(a.passed, a.exams) ?? 0,
      avgScore: a.avgScore ?? 0
    })).sort((a, b) => a.passRate - b.passRate || b.exams - a.exams);
  }
  const ex = exams(c, p);
  const m = new Map<string, Attempt[]>();
  ex.forEach((a) => m.set(a.moduleId, [...(m.get(a.moduleId) || []), a]));
  return [...m.entries()].map(([id, list]) => ({
    id,
    title: c.modules.find((x) => x.id === id)?.title || list[0].moduleTitle,
    exams: list.length,
    passRate: pct(list.filter((a) => a.passed).length, list.length) ?? 0,
    avgScore: Math.round(list.reduce((x, a) => x + (a.score || 0), 0) / list.length)
  })).sort((a, b) => a.passRate - b.passRate || b.exams - a.exams);
}

/** Son N hafta: sınav ve talep akışı (pazartesi başlangıçlı). */
export function weekly(c: BoardCtx, weeks = 12, now = Date.now()) {
  const monday = mondayOf(now);
  return Array.from({ length: weeks }, (_, i) => {
    const from = monday - (weeks - 1 - i) * 7 * DAY;
    const p: Period = { id: '30', from, to: from + 7 * DAY - 1, label: '' };
    const ex = exams(c, p);
    return {
      from,
      exams: ex.length,
      passed: ex.filter((a) => a.passed).length,
      opened: c.requests.filter((r) => inP(r.createdAt, p)).length,
      solved: c.requests.filter((r) => r.status === 'done' && inP(r.closedAt || r.updatedAt, p)).length
    };
  });
}

export interface AttentionItem {
  tone: 'negative' | 'caution';
  text: string;
  detail: string;
  /** Kurul ekranında açılacak yer. */
  to: string;
  topic: { kind: 'request' | 'proposal' | 'store' | 'assignment'; id?: string; title: string };
}

/** Kurulun bilmesi gereken, şu an aksayan işler. */
export function attention(c: BoardCtx, now = Date.now()): AttentionItem[] {
  const out: AttentionItem[] = [];
  const open = c.requests.filter((r) => !closedOf(r));
  open.filter((r) => r.priority === 'urgent').forEach((r) => out.push({
    tone: 'negative', text: `Acil talep açık: ${r.title}`, detail: `${r.storeName} · ${Math.max(1, Math.round((now - r.createdAt) / 3600000))} saattir`,
    to: `/isler?talep=${r.id}`, topic: { kind: 'request', id: r.id, title: `${r.storeName}: ${r.title}` }
  }));
  open.filter((r) => r.priority !== 'urgent' && now - r.createdAt > 7 * DAY).forEach((r) => out.push({
    tone: 'caution', text: `7 günü geçen talep: ${r.title}`, detail: `${r.storeName} · ${Math.round((now - r.createdAt) / DAY)} gündür açık`,
    to: `/isler?talep=${r.id}`, topic: { kind: 'request', id: r.id, title: `${r.storeName}: ${r.title}` }
  }));
  c.proposals.filter((x) => x.status === 'pending' && now - x.createdAt > 3 * DAY).forEach((x) => out.push({
    tone: 'caution', text: `Onay bekliyor: ${x.title}`, detail: `${x.createdByName ? `${x.createdByName} · ` : ''}${Math.round((now - x.createdAt) / DAY)} gündür`,
    to: '/isler?sekme=onay', topic: { kind: 'proposal', id: x.id, title: x.title }
  }));
  const card = scorecard(c, periodOf('30', now));
  const avg = card.filter((r) => r.progress !== null);
  const mean = avg.length ? avg.reduce((s, r) => s + (r.progress || 0), 0) / avg.length : 0;
  card.filter((r) => r.progress !== null && r.baristas > 0 && (r.progress as number) < mean - 15).forEach((r) => out.push({
    tone: 'caution', text: `${r.store.name}: eğitim ilerlemesi geride`, detail: `%${r.progress} · zincir ortalaması %${Math.round(mean)}`,
    to: `/magazalar?magaza=${r.store.id}`, topic: { kind: 'store', id: r.store.id, title: r.store.name }
  }));
  card.filter((r) => r.overdueTasks >= 3).forEach((r) => out.push({
    tone: 'caution', text: `${r.store.name}: ${r.overdueTasks} gecikmiş görev`, detail: 'Süresi geçmiş, tamamlanmamış eğitim görevleri',
    to: `/magazalar?magaza=${r.store.id}`, topic: { kind: 'store', id: r.store.id, title: r.store.name }
  }));
  return out;
}

/* ------------------------------------------------------------------ */
/* CSV (Excel'de Türkçe karakterler ve ; ayracıyla düzgün açılır)       */
/* ------------------------------------------------------------------ */

export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    // Mağazanın yazdığı başlık =, +, -, @ ile başlıyorsa Excel onu formül olarak
    // çalıştırır (CSV formül enjeksiyonu): metnin önüne ' konur. Sayılar dokunulmaz.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.csv') ? name : `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Kurulun göreceği talepler: personel talepleri (barista daveti, PIN,
 * vardiya) günlük operasyon işidir, kurul ekranına girmez.
 */
export const forBoard = (r: StoreRequest) => r.category !== 'personel';

/** Saate göre selam ve hitap: "İyi akşamlar, Ogün Bey". Baş harf (R.) atlanır. */
export function greeting(name: string, now = new Date()): string {
  const h = istParts(now.getTime()).h;
  const hello = h >= 5 && h < 11 ? 'Günaydın' : h >= 11 && h < 17 ? 'İyi günler' : h >= 17 && h < 22 ? 'İyi akşamlar' : 'İyi geceler';
  const first = name.split(/\s+/).find((w) => w && !w.endsWith('.')) || name;
  return `${hello}, ${first} Bey`;
}
