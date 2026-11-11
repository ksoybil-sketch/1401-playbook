import React, { useMemo, useState } from 'react';
import { useContent } from '../../store/content';
import { CATEGORIES, isClosed, markSeen, STATUS } from '../../api/requests';
import { can } from '../../lib/roles';
import { useStaffData } from './staffData';
import { useStaffSession } from './StaffLayout';
import { RequestSummary, RequestThread } from '../shared/Requests';
import { Page, PageTitle, Section, Sheet, Empty, Stat } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { RequestCategory, StoreRequest } from '../../../shared/types';

/**
 * Mağaza talepleri — Kahve Operasyonu tarafı.
 *
 * Bölge Müdürü talepleri görür, işleme alır, yanıtlar; yetkili servis
 * gerekiyorsa "Müdür onayına gönder" der, Kahve Operasyon Müdürü onaylar.
 * Operasyon ekibinin diğer üyeleri listeyi görür, değiştirmez.
 */
export const RequestsPage: React.FC = () => {
  const me = useStaffSession();
  const handle = can(me.role, 'handleRequests');
  const approver = can(me.role, 'approve');
  const requests = useStaffData((x) => x.requests);
  const { stores } = useContent();
  const [tab, setTab] = useState<'open' | 'approval' | 'closed'>('open');
  const [store, setStore] = useState('');
  const [cat, setCat] = useState<RequestCategory | ''>('');
  const [openId, setOpenId] = useState<string | null>(null);

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
  const list = lists[tab];
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
        subtitle="Mağaza ve vardiya müdürlerinin arıza, servis, malzeme ve personel talepleri. Sözlü talep geçersiz: kayıt burada." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Açık talep" value={lists.open.length + lists.approval.length} icon="inbox" tone={lists.open.length ? 'caution' : 'neutral'} />
        <Stat label="Acil" value={requests.filter((r) => r.priority === 'urgent' && !isClosed(r.status)).length} icon="alert" tone="negative" />
        <Stat label="Onay bekleyen servis" value={lists.approval.length} icon="shield" tone="accent" />
        <Stat label="7 günde çözülen" value={doneWeek.length} hint={avgHours !== null ? `Ortalama ${avgHours} saat` : undefined} icon="check" tone="positive" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className={t.segment}>
          <button className={`${t.segmentItem} ${tab === 'open' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('open')}>Açık · {lists.open.length}</button>
          <button className={`${t.segmentItem} ${tab === 'approval' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('approval')}>Onayda · {lists.approval.length}</button>
          <button className={`${t.segmentItem} ${tab === 'closed' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('closed')}>Kapanan · {lists.closed.length}</button>
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
          <Empty icon="inbox" text={tab === 'open' ? 'Açık talep yok.' : tab === 'approval' ? 'Onay bekleyen servis talebi yok.' : 'Kapanan talep yok.'} />
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
