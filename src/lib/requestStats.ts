import type { RequestRejectReason, RequestWaitReason, StoreRequest } from '../../shared/types';

/**
 * Talep istatistikleri: ne kadar sürede yanıtlandı, ne kadar sürede
 * çözüldü, açık kalanlar neyi bekliyor. Her şey talebin kendi zaman
 * çizelgesinden (notes) hesaplanır; ayrıca bir kayıt tutulmaz.
 */

const WAIT_IDS = new Set<string>(['parca', 'servis', 'onay', 'butce', 'tedarikci', 'magaza', 'diger']);
const H = 3600000;

export const closedOf = (r: StoreRequest) => r.status === 'done' || r.status === 'rejected';

/** İlk operasyon tepkisi: yazılı yanıt ya da "görüldü" dışındaki durum değişikliği. */
export function firstResponseAt(r: StoreRequest): number | null {
  const n = [...r.notes].sort((a, b) => a.at - b.at).find((x) => x.side === 'ops' && (x.text || (x.status && x.status !== 'seen')));
  return n ? n.at : null;
}

/** Talebin hangi nedeni ne kadar beklediği (ms). Onay durumu, neden seçilmemişse "onay" sayılır. */
export function waitSegments(r: StoreRequest, now = Date.now()): Partial<Record<RequestWaitReason | 'yok', number>> {
  const out: Partial<Record<RequestWaitReason | 'yok', number>> = {};
  const notes = [...r.notes].sort((a, b) => a.at - b.at);
  let cur = null as RequestWaitReason | 'yok' | null;
  let since = 0;
  let status = 'open';
  const close = (at: number) => { if (cur && at > since) out[cur] = (out[cur] || 0) + (at - since); };
  for (const n of notes) {
    let next: RequestWaitReason | 'yok' | null = cur;
    if (n.status) status = n.status;
    if (n.reason && WAIT_IDS.has(n.reason)) next = n.reason as RequestWaitReason;
    else if (n.status === 'approval') next = 'onay';
    else if (n.status === 'in_progress' && !cur) next = 'yok';
    if (status === 'done' || status === 'rejected') next = null;
    if (next !== cur) { close(n.at); cur = next; since = n.at; }
  }
  if (cur) close(closedOf(r) ? (r.closedAt || now) : now);
  return out;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface GroupRow { key: string; label: string; total: number; open: number; urgent: number; medianResolve: number | null; }

export function requestStats(all: StoreRequest[], from: number, now = Date.now()) {
  const rs = all.filter((r) => r.createdAt >= from);
  const done = rs.filter((r) => r.status === 'done');
  const rejected = rs.filter((r) => r.status === 'rejected');
  const open = rs.filter((r) => !closedOf(r));
  const resolve = done.map((r) => (r.closedAt || r.updatedAt) - r.createdAt);
  const firsts = rs.map((r) => { const f = firstResponseAt(r); return f ? f - r.createdAt : null; }).filter((x): x is number => x !== null);
  const noResponse = rs.filter((r) => !closedOf(r) && !firstResponseAt(r));

  const group = (keyOf: (r: StoreRequest) => string | undefined, labelOf: (k: string) => string): GroupRow[] => {
    const m = new Map<string, StoreRequest[]>();
    rs.forEach((r) => { const k = keyOf(r); if (k) m.set(k, [...(m.get(k) || []), r]); });
    return [...m.entries()].map(([k, list]) => ({
      key: k, label: labelOf(k), total: list.length, open: list.filter((r) => !closedOf(r)).length,
      urgent: list.filter((r) => r.priority === 'urgent').length,
      medianResolve: median(list.filter((r) => r.status === 'done').map((r) => (r.closedAt || r.updatedAt) - r.createdAt))
    })).sort((a, b) => b.total - a.total);
  };

  // Hangi neden toplamda ne kadar bekletti.
  const waits = new Map<string, { ms: number; requests: number }>();
  rs.forEach((r) => Object.entries(waitSegments(r, now)).forEach(([k, ms]) => {
    const w = waits.get(k) || { ms: 0, requests: 0 };
    waits.set(k, { ms: w.ms + (ms || 0), requests: w.requests + 1 });
  }));

  // Aynı mağazada aynı ekipman tekrar tekrar arızalanıyor mu.
  const repeat = new Map<string, number>();
  rs.filter((r) => r.category === 'ariza' && r.equipment).forEach((r) => {
    const k = `${r.storeName} · ${r.equipment}`;
    repeat.set(k, (repeat.get(k) || 0) + 1);
  });

  const rejects = new Map<RequestRejectReason | 'yok', number>();
  rejected.forEach((r) => rejects.set(r.rejectReason || 'yok', (rejects.get(r.rejectReason || 'yok') || 0) + 1));

  const age = (r: StoreRequest) => now - r.createdAt;
  return {
    total: rs.length, done: done.length, rejected: rejected.length, open: open.length,
    urgent: rs.filter((r) => r.priority === 'urgent').length,
    medianResolve: median(resolve), avgResolve: avg(resolve),
    within24: resolve.length ? resolve.filter((x) => x <= 24 * H).length / resolve.length : null,
    within72: resolve.length ? resolve.filter((x) => x <= 72 * H).length / resolve.length : null,
    medianFirst: median(firsts), noResponse: noResponse.length,
    aging: {
      d1: open.filter((r) => age(r) < 24 * H).length,
      d3: open.filter((r) => age(r) >= 24 * H && age(r) < 72 * H).length,
      d7: open.filter((r) => age(r) >= 72 * H && age(r) < 168 * H).length,
      more: open.filter((r) => age(r) >= 168 * H).length
    },
    oldestOpen: [...open].sort((a, b) => a.createdAt - b.createdAt).slice(0, 8),
    waits: [...waits.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.ms - a.ms),
    repeats: [...repeat.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]),
    rejects: [...rejects.entries()].sort((a, b) => b[1] - a[1]),
    group
  };
}

/** 90 dk → "1,5 sa"; 50 sa → "2 gün 2 sa". */
export function fmtDur(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  const h = ms / H;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} dk`;
  if (h < 24) return `${h < 10 ? h.toFixed(1).replace('.', ',') : Math.round(h)} sa`;
  const d = Math.floor(h / 24), rh = Math.round(h - d * 24);
  return rh ? `${d} gün ${rh} sa` : `${d} gün`;
}
