import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useContent } from '../../store/content';
import { CATEGORIES, isClosed, markSeen, STATUS } from '../../api/requests';
import { can } from '../../lib/roles';
import { useStaffData } from './staffData';
import { useStaffSession } from './StaffLayout';
import { RequestSummary, RequestThread } from '../shared/Requests';
import { Page, PageTitle, Section, Sheet, Empty, Stat } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { Icon } from '../../ui/Icon';
import type { RequestCategory, StoreRequest } from '../../../shared/types';

/**
 * Mağaza talepleri — Kahve Operasyonu tarafı.
 *
 * Bölge Müdürü talepleri görür, işleme alır, yanıtlar; yetkili servis
 * gerekiyorsa "Direktör onayına gönder" der, Kahve Operasyon Direktörü onaylar.
 * Operasyon ekibinin diğer üyeleri listeyi görür, değiştirmez.
 */
export const RequestsPage: React.FC = () => {
  const me = useStaffSession();
  const handle = can(me.role, 'handleRequests');
  const approver = can(me.role, 'approve');
  const requests = useStaffData((x) => x.requests);
  const { stores } = useContent();
  // Kartlar listeyi süzer; adres çubuğunda da tutulur (?durum=acil) ki
  // Genel bakış'tan ya da paylaşılan bağlantıdan aynı görünüm açılsın.
  const [params, setParams] = useSearchParams();
  const focus = (params.get('durum') || '') as '' | 'acik' | 'acil' | 'onay' | 'cozulen';
  const [tab, setTab] = useState<'open' | 'approval' | 'closed'>(focus === 'onay' ? 'approval' : focus === 'cozulen' ? 'closed' : 'open');
  const listRef = useRef<HTMLDivElement>(null);
  const pick = (f: typeof focus) => {
    const next = focus === f ? '' : f;
    setParams(next ? { durum: next } : {}, { replace: true });
    setTab(next === 'onay' ? 'approval' : next === 'cozulen' ? 'closed' : 'open');
    if (next) setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  useEffect(() => { if (focus) setTab(focus === 'onay' ? 'approval' : focus === 'cozulen' ? 'closed' : 'open'); }, [focus]);
  const [store, setStore] = useState('');
  const [cat, setCat] = useState<RequestCategory | ''>('');
  const [openId, setOpenId] = useState<string | null>(params.get('talep'));

  const filtered = requests.filter((r) => (!store || r.storeId === store) && (!cat || r.category === cat));
  const lists = useMemo(() => {
    // Açıklar: acil olanlar ve mağazanın son yazdıkları üstte.
    const open = filtered.filter((r) => !isClosed(r.status) && r.status !== 'approval')
      .sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1) || b.updatedAt - a.updatedAt);
    return {
      open,
      approval: filtered.filter((r) => r.status === 'approval'),
      closed: filtered.filter((r) => isClosed(r.status))
    };
  }, [filtered]);
  const week0 = Date.now() - 7 * 86400000;
  const list = lists[tab].filter((r) =>
    focus === 'acil' ? r.priority === 'urgent'
      : focus === 'cozulen' ? r.status === 'done' && (r.closedAt || 0) > week0
        : true);
  const current = requests.find((r) => r.id === openId) || null;

  const open = (r: StoreRequest) => {
    setOpenId(r.id);
    if (handle && r.status === 'open') markSeen(r, { uid: me.uid, name: me.name }).catch(() => {});
  };

  const week = Date.now() - 7 * 86400000;
  const doneWeek = requests.filter((r) => r.status === 'done' && (r.closedAt || 0) > week);
  const avgHours = doneWeek.length
    ? Math.round(doneWeek.reduce((s, r) => s + ((r.closedAt || r.updatedAt) - r.createdAt), 0) / doneWeek.length / 3600000)
    : null;

  return (
    <Page wide>
      <PageTitle title="Talepler"
        subtitle="Mağaza ve vardiya müdürlerinin arıza, servis, malzeme ve personel talepleri. Sözlü talep geçersiz: kayıt burada."
        action={<Link to="/talepler/istatistik" className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`}><Icon name="chart" size={15} /> İstatistik</Link>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Açık talep" value={lists.open.length} icon="inbox" tone={lists.open.length ? 'caution' : 'neutral'}
          onClick={() => pick('acik')} active={focus === 'acik'} />
        <Stat label="Acil" value={lists.open.filter((r) => r.priority === 'urgent').length} icon="alert" tone="negative"
          onClick={() => pick('acil')} active={focus === 'acil'} />
        <Stat label="Onay bekleyen servis" value={lists.approval.length} icon="shield" tone="accent"
          onClick={() => pick('onay')} active={focus === 'onay'} />
        <Stat label="7 günde çözülen" value={doneWeek.length} hint={avgHours !== null ? `Ortalama ${avgHours} saat` : undefined} icon="check" tone="positive"
          onClick={() => pick('cozulen')} active={focus === 'cozulen'} />
      </div>

      <div ref={listRef} className="flex flex-wrap gap-2 items-center scroll-mt-20">
        {(focus === 'acil' || focus === 'cozulen') && (
          <button onClick={() => pick(focus)} className={`${t.chip} ${t.chipOn}`}>
            {focus === 'acil' ? 'Yalnızca acil' : 'Son 7 günde çözülen'} <Icon name="close" size={12} />
          </button>
        )}
        <div className={t.segment}>
          <button className={`${t.segmentItem} ${tab === 'open' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => { setTab('open'); if (focus) setParams({}, { replace: true }); }}>Açık · {lists.open.length}</button>
          <button className={`${t.segmentItem} ${tab === 'approval' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => { setTab('approval'); if (focus) setParams({}, { replace: true }); }}>Onayda · {lists.approval.length}</button>
          <button className={`${t.segmentItem} ${tab === 'closed' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => { setTab('closed'); if (focus) setParams({}, { replace: true }); }}>Kapanan · {lists.closed.length}</button>
        </div>
        <select className={`${t.input} h-9 w-auto text-[14px]`} value={store} onChange={(e) => setStore(e.target.value)}>
          <option value="">Tüm mağazalar</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={`${t.input} h-9 w-auto text-[14px]`} value={cat} onChange={(e) => setCat(e.target.value as RequestCategory | '')}>
          <option value="">Tüm türler</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      <Section>
        {list.length === 0 ? (
          <Empty icon="inbox" text={focus === 'acil' ? 'Acil talep yok.' : focus === 'cozulen' ? 'Son 7 günde çözülen talep yok.' : tab === 'open' ? 'Açık talep yok.' : tab === 'approval' ? 'Onay bekleyen servis talebi yok.' : 'Kapanan talep yok.'} />
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((r) => (
              <button key={r.id} onClick={() => open(r)} className={`${t.cardInteractive} p-4 text-left flex`}>
                <RequestSummary r={r} showStore unread={!isClosed(r.status) && r.lastSide === 'store'} />
              </button>
            ))}
          </div>
        )}
      </Section>

      <Sheet open={!!current} title={current ? `${current.storeName} · ${STATUS[current.status].label}` : ''} onClose={() => setOpenId(null)}>
        {current && (
          <>
            <RequestSummary r={current} showStore />
            <RequestThread r={current} side="ops" me={{ uid: me.uid, name: me.name }} canChange={handle} canApprove={approver} />
          </>
        )}
      </Sheet>
    </Page>
  );
};
