import React, { useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { EQUIPMENT, MAGAZA_KATEGORI_LISTESI, TALEP_KAPSAM_UYARISI, createRequest, isClosed } from '../../api/requests';
import { errorText } from '../../api/backend';
import { useQueryLive } from '../../hooks/useFirestore';
import { useBaristaSession } from './useBaristaData';
import { RequestSummary, RequestThread } from '../shared/Requests';
import { MediaInput } from '../staff/MediaInput';
import { Icon } from '../../ui/Icon';
import { Page, PageTitle, Section, Sheet, Empty, ErrorText, Spinner, toast, sendOrQueue, QUEUED_TEXT, MAX, CharCount } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { RequestCategory, RequestPriority, StoreRequest } from '../../../shared/types';
import { blockedReadOnly } from '../../lib/readOnly';

/**
 * Talepler — mağaza / vardiya müdürünün Kahve Operasyonu'na açtığı işler.
 * Kitapçık: "Arızalı ekipmanın onarımı veya değişimi için talep oluşturulması
 * gerekmektedir. Bu talep Bölge Müdürü'ne raporlanır."
 */

const SEEN_KEY = (id: string) => `campus.req.seen.${id}`;
const seenAt = (id: string) => { try { return Number(localStorage.getItem(SEEN_KEY(id)) || 0); } catch { return 0; } };
const markRead = (id: string) => { try { localStorage.setItem(SEEN_KEY(id), String(Date.now())); } catch { /* yok say */ } };

/** Operasyon yanıt verdi ve mağaza henüz açmadı. */
export const hasNewReply = (r: StoreRequest) => r.lastSide === 'ops' && r.updatedAt > seenAt(r.id);

/** enabled=false: barista (müdür değil) — talepleri okuma yetkisi yok, sorgu açılmaz. */
export function useStoreRequests(enabled = true) {
  const s = useBaristaSession();
  const { data, loading } = useQueryLive<StoreRequest>(
    enabled ? query(collection(db, 'requests'), where('storeId', '==', s.storeId)) : null,
    `req-${s.storeId}-${enabled}`
  );
  return { items: [...data].sort((a, b) => b.updatedAt - a.updatedAt), loading };
}

export const RequestsPage: React.FC = () => {
  const s = useBaristaSession();
  const { items, loading } = useStoreRequests();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [, force] = useState(0);
  const open = items.filter((r) => !isClosed(r.status));
  const closed = items.filter((r) => isClosed(r.status));
  const current = items.find((r) => r.id === openId) || null;

  const show = (r: StoreRequest) => { setOpenId(r.id); markRead(r.id); force((x) => x + 1); };

  return (
    <Page>
      <PageTitle title="Talepler" back="/sonuclarim"
        action={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Yeni</button>} />

      <Section label={`Açık · ${open.length}`}>
        {loading ? <div className="flex justify-center py-8"><Spinner /></div> : open.length === 0 ? <Empty icon="inbox" text="Açık talebin yok." /> : (
          <div className="flex flex-col gap-2">
            {open.map((r) => (
              <button key={r.id} onClick={() => show(r)} className={`${t.cardInteractive} p-4 text-left flex`}>
                <RequestSummary r={r} unread={hasNewReply(r)} />
              </button>
            ))}
          </div>
        )}
      </Section>

      {closed.length > 0 && (
        <Section label={`Kapanan · ${closed.length}`}>
          <div className="flex flex-col gap-2">
            {closed.slice(0, 20).map((r) => (
              <button key={r.id} onClick={() => show(r)} className={`${t.cardInteractive} p-4 text-left flex opacity-80`}>
                <RequestSummary r={r} unread={hasNewReply(r)} />
              </button>
            ))}
          </div>
        </Section>
      )}

      <Sheet open={!!current} title={current?.title || ''} onClose={() => setOpenId(null)}>
        {current && (
          <>
            <RequestSummary r={current} />
            {/* Kapanmış talebe mağaza yazamaz (kural da reddeder): yazışma
                salt okunur, yeni konu için yeni talep açılır. */}
            <RequestThread r={current} side="store" me={{ uid: s.uid, name: s.name }} readOnly={isClosed(current.status)} />
            {isClosed(current.status) && (
              <div className="flex flex-col gap-2.5 border-t border-line pt-3">
                <p className="text-[13px] text-fg-2 leading-relaxed">Bu talep kapandı. Yeni bir konu için yeni talep aç.</p>
                <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd} self-start`} onClick={() => { setOpenId(null); setCreating(true); }}>
                  <Icon name="plus" size={15} /> Yeni talep
                </button>
              </div>
            )}
          </>
        )}
      </Sheet>

      <NewRequestSheet open={creating} onClose={() => setCreating(false)} />
    </Page>
  );
};

const NewRequestSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const s = useBaristaSession();
  const [category, setCategory] = useState<RequestCategory>('ariza');
  const [priority, setPriority] = useState<RequestPriority>('normal');
  const [equipment, setEquipment] = useState('');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setCategory('ariza'); setPriority('normal'); setEquipment(''); setTitle(''); setDetail(''); setImageUrl(''); setError(null); };

  const save = async () => {
    setError(null);
    if (title.trim().length < 3) return setError('Kısaca ne olduğunu yaz: "Espresso makinesi 2. grup su kaçırıyor".');
    if (category === 'ariza' && !equipment) return setError('Hangi ekipman arızalı?');
    if (blockedReadOnly()) return;
    setBusy(true);
    try {
      // Çevrimdışıyken yazım yerel kuyruğa alınır; pencere sonsuza kadar
      // "gönderiliyor"da kalmasın (bkz. kit.tsx sendOrQueue).
      const r = await sendOrQueue(createRequest({
        storeId: s.storeId, storeName: s.storeName, category, priority, title, detail,
        imageUrl: imageUrl || undefined, equipment: category === 'ariza' ? equipment : undefined,
        by: { uid: s.uid, name: s.name }
      }));
      toast(r === 'queued' ? QUEUED_TEXT : 'Talep Kahve Operasyonu\'na iletildi.', 'positive');
      reset();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title="Yeni talep" onClose={busy ? () => {} : onClose} dirty={!busy && !!(title.trim() || detail.trim() || imageUrl)}
      footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1`} onClick={save} disabled={busy}>{busy ? <Spinner size={16} /> : 'Gönder'}</button>}>
      <div className={t.field}>
        <span className={t.label}>Konu</span>
        <div className="grid grid-cols-2 gap-2">
          {MAGAZA_KATEGORI_LISTESI.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-colors ${category === c.id ? 'border-crema bg-panel-3' : 'border-line bg-panel'}`}>
              <Icon name={c.icon} size={16} className="mt-0.5 text-fg-2" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{c.label}</span>
                <span className="block text-[11px] text-fg-3 leading-snug">{c.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-snug text-fg-3">{TALEP_KAPSAM_UYARISI}</p>
      </div>
      {category === 'ariza' && (
        <label className={t.field}>
          <span className={t.label}>Ekipman</span>
          <select className={t.input} value={equipment} onChange={(e) => setEquipment(e.target.value)}>
            <option value="">Seç…</option>
            {EQUIPMENT.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
      )}
      <label className={t.field}>
        <span className={t.label}>Başlık</span>
        <input className={t.input} value={title} maxLength={MAX.title} onChange={(e) => setTitle(e.target.value)} placeholder="Değirmen öğütmüyor, motor sesi var" />
        <CharCount value={title} max={MAX.title} />
      </label>
      <label className={t.field}>
        <span className={t.label}>Ayrıntı</span>
        <textarea className={`${t.textarea} min-h-24`} value={detail} maxLength={MAX.text} onChange={(e) => setDetail(e.target.value)}
          placeholder="Ne zaman başladı, denediklerin, misafiri etkiliyor mu…" />
        <CharCount value={detail} max={MAX.text} />
      </label>
      <div className={t.field}>
        <span className={t.label}>Fotoğraf (isteğe bağlı)</span>
        <MediaInput url={imageUrl} kind="image" onChange={setImageUrl} placeholder="Fotoğraf çek ya da yükle" />
      </div>
      <div className={t.field}>
        <span className={t.label}>Öncelik</span>
        <div className={t.segment}>
          <button className={`${t.segmentItem} ${priority === 'normal' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setPriority('normal')}>Normal</button>
          <button className={`${t.segmentItem} ${priority === 'urgent' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setPriority('urgent')}>Acil — misafiri etkiliyor</button>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};
