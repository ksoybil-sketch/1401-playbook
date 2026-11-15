import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { catOf, reasonLabel } from '../../api/requests';
import { fmtDur, requestStats, waitSegments } from '../../lib/requestStats';
import { dayStart, loadRequestsSince, useFetched, useStaffData } from './staffData';
import { Page, PageTitle, Section, Stat, Empty, fmtDate } from '../../ui/kit';
import * as t from '../../ui/tokens';

/**
 * Talep istatistikleri: operasyonda nerede aksıyoruz?
 * Yanıt ve çözülme süreleri, açık taleplerin yaşı, bekleten nedenler,
 * mağaza ve tür kırılımı, tekrar eden arızalar.
 */
const RANGES = [
  { id: 30, label: 'Son 30 gün' },
  { id: 90, label: 'Son 90 gün' },
  { id: 365, label: 'Son 1 yıl' }
] as const;

const pct = (x: number | null) => (x === null ? '—' : `%${Math.round(x * 100)}`);

const Bar: React.FC<{ value: number; max: number; tone?: string }> = ({ value, max, tone = 'bg-crema' }) => (
  <div className="h-2 rounded-full bg-panel-3 overflow-hidden flex-1 min-w-16">
    <div className={`h-full rounded-full ${tone}`} style={{ width: `${max ? Math.max(3, (value / max) * 100) : 0}%` }} />
  </div>
);

export const RequestStatsPage: React.FC = () => {
  const live = useStaffData((x) => x.requests);
  const [days, setDays] = useState<number>(90);
  // Seçilen aralığın talepleri tek seferlik okunur (panel yalnızca açık ve son
  // güncellenen talepleri canlı dinliyor); açık talepler canlı listeden eklenir.
  const from = dayStart(Date.now() - days * 86400000);
  const ranged = useFetched(`requests:${from}`, () => loadRequestsSince(from));
  const requests = useMemo(() => {
    const m = new Map((ranged.data || []).map((r) => [r.id, r]));
    live.forEach((r) => m.set(r.id, r));
    return [...m.values()];
  }, [ranged.data, live]);
  const s = useMemo(() => requestStats(requests, Date.now() - days * 86400000), [requests, days]);
  const byStore = s.group((r) => r.storeId, (k) => requests.find((r) => r.storeId === k)?.storeName || k);
  const byCat = s.group((r) => r.category, (k) => catOf(k as never).label);
  const byEq = s.group((r) => (r.category === 'ariza' ? r.equipment || 'Belirtilmemiş' : undefined), (k) => k);
  const maxWait = Math.max(0, ...s.waits.map((w) => w.ms));

  return (
    <Page wide>
      <PageTitle title="Talep istatistikleri" back="/talepler"
        subtitle="Talepler ne kadar sürede yanıtlanıp çözülüyor, açık kalanlar neyi bekliyor." />

      <div className={t.segment}>
        {RANGES.map((r) => (
          <button key={r.id} onClick={() => setDays(r.id)} className={`${t.segmentItem} ${days === r.id ? t.segmentItemOn : t.segmentItemOff}`}>{r.label}</button>
        ))}
      </div>

      {ranged.loading && !ranged.data ? <Empty icon="inbox" text="Yükleniyor…" /> : s.total === 0 ? <Empty icon="inbox" text="Bu aralıkta talep yok." /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Talep" value={s.total} hint={`${s.done} çözüldü · ${s.rejected} red · ${s.open} açık`} icon="inbox" />
            <Stat label="İlk yanıt (medyan)" value={fmtDur(s.medianFirst)} hint={s.noResponse ? `${s.noResponse} talep hiç yanıtlanmadı` : 'Hepsi yanıtlandı'} icon="message" tone={s.noResponse ? 'caution' : 'neutral'} />
            <Stat label="Çözülme (medyan)" value={fmtDur(s.medianResolve)} hint={`Ortalama ${fmtDur(s.avgResolve)}`} icon="check" tone="positive" />
            <Stat label="3 günde çözülen" value={pct(s.within72)} hint={`24 saatte ${pct(s.within24)}`} icon="clock" />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Section label="Açık talepler ne kadar bekliyor">
              <div className={`${t.card} ${t.cardPad} flex flex-col gap-3`}>
                {([['1 günden az', s.aging.d1, 'bg-positive'], ['1–3 gün', s.aging.d3, 'bg-crema'], ['3–7 gün', s.aging.d7, 'bg-caution'], ['7 günden fazla', s.aging.more, 'bg-negative']] as const).map(([l, n, tone]) => (
                  <div key={l} className="flex items-center gap-3 text-[13px]">
                    <span className="w-28 text-fg-2">{l}</span>
                    <Bar value={n} max={Math.max(1, s.open)} tone={tone} />
                    <span className="w-8 text-right tnum font-semibold">{n}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section label="Neyi beklerken zaman kaybediyoruz">
              <div className={`${t.card} ${t.cardPad} flex flex-col gap-3`}>
                {s.waits.length === 0 ? <p className="text-[13px] text-fg-3">Henüz bekleme nedeni girilmedi. Talebi işleme alırken "Şu an neyi bekliyor?" seçilir.</p> : s.waits.map((w) => (
                  // Telefonda etiket üst satırda tam görünür (360 px'te kesiliyordu); süre ve sayı tek satır.
                  <div key={w.key} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                    <span className="basis-full sm:basis-auto sm:w-44 sm:shrink-0 text-fg-2 sm:truncate">{w.key === 'yok' ? 'Neden girilmemiş' : reasonLabel(w.key)}</span>
                    <Bar value={w.ms} max={maxWait} tone={w.key === 'yok' ? 'bg-fg-3' : 'bg-caution'} />
                    <span className="shrink-0 sm:w-24 text-right tnum whitespace-nowrap">{fmtDur(w.ms)}</span>
                    <span className="shrink-0 sm:w-14 text-right text-fg-3 tnum whitespace-nowrap">{w.requests} talep</span>
                  </div>
                ))}
                <p className="text-[12px] text-fg-3">Toplam bekleme süresi. Onaydaki talepler, neden seçilmediyse "Direktör onayı" sayılır.</p>
              </div>
            </Section>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Table title="Mağazalara göre" rows={byStore} />
            <Table title="Türe göre" rows={byCat} />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Table title="Arızalanan ekipman" rows={byEq} />
            <Section label="Tekrar eden arızalar">
              <div className={`${t.card} ${t.cardPad} flex flex-col gap-2`}>
                {s.repeats.length === 0 ? <p className="text-[13px] text-fg-3">Aynı mağazada aynı ekipman için tekrarlayan arıza yok.</p> : s.repeats.map(([k, n]) => (
                  <div key={k} className="flex items-center justify-between text-[13px]">
                    <span className="text-fg-2">{k}</span>
                    <span className="font-semibold text-negative tnum">{n} kez</span>
                  </div>
                ))}
                {s.rejects.length > 0 && (
                  <div className="border-t border-line pt-3 mt-1 flex flex-col gap-1.5">
                    <span className={t.sectionLabel}>Red nedenleri</span>
                    {s.rejects.map(([k, n]) => (
                      <div key={k} className="flex justify-between text-[13px]"><span className="text-fg-2">{k === 'yok' ? 'Belirtilmemiş' : reasonLabel(k)}</span><span className="tnum">{n}</span></div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          </div>

          <Section label="En uzun bekleyen açık talepler">
            {s.oldestOpen.length === 0 ? <Empty icon="check" text="Açık talep yok." /> : (
              <div className={t.listGroup}>
                {s.oldestOpen.map((r) => {
                  const w = waitSegments(r);
                  return (
                    <Link key={r.id} to="/talepler" className={`${t.listRow} text-[13px]`}>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate">{r.title}</span>
                        <span className="block text-fg-3 text-[12px]">{r.storeName} · {catOf(r.category).label} · {fmtDate(r.createdAt)}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block font-semibold tnum">{fmtDur(Date.now() - r.createdAt)}</span>
                        <span className="block text-[12px] text-fg-3">{r.waitReason ? reasonLabel(r.waitReason) : Object.keys(w).length ? '' : 'Yanıt bekliyor'}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      )}
    </Page>
  );
};

const Table: React.FC<{ title: string; rows: ReturnType<ReturnType<typeof requestStats>['group']> }> = ({ title, rows }) => (
  <Section label={title}>
    {rows.length === 0 ? <Empty icon="inbox" text="Kayıt yok." /> : (
      <div className={`${t.card} overflow-hidden`}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-fg-3 text-[11px] uppercase tracking-[0.05em]">
              <th className="text-left font-medium px-4 py-2.5"></th>
              <th className="text-right font-medium px-2">Talep</th>
              <th className="text-right font-medium px-2">Açık</th>
              <th className="text-right font-medium px-2">Acil</th>
              <th className="text-right font-medium px-4">Çözülme</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="px-4 py-2.5 text-fg-2">{r.label}</td>
                <td className="text-right px-2 tnum font-semibold">{r.total}</td>
                <td className={`text-right px-2 tnum ${r.open ? 'text-caution' : 'text-fg-3'}`}>{r.open}</td>
                <td className={`text-right px-2 tnum ${r.urgent ? 'text-negative' : 'text-fg-3'}`}>{r.urgent}</td>
                <td className="text-right px-4 tnum">{fmtDur(r.medianResolve)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Section>
);
