import React, { useMemo, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent, publishedOnly } from '../../store/content';
import { Sheet, ErrorText, Spinner, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { Assignment, AssignmentKind, Barista } from '../../../shared/types';

/**
 * Görev atama formu — hem Kahve Operasyonu (tüm mağazalar) hem mağaza
 * sorumlusu (sadece kendi mağazası) kullanır.
 */
export const AssignSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  creator: { uid: string; name: string };
  /** Sabit mağaza (mağaza sorumlusu). Boşsa mağaza seçilir. */
  fixedStoreId?: string;
  baristas: Barista[];
  preset?: { baristaId?: string; storeId?: string };
}> = ({ open, onClose, creator, fixedStoreId, baristas, preset }) => {
  const { stores, tracks, modules, lessons } = useContent();
  const [kind, setKind] = useState<AssignmentKind>('module');
  const [targetId, setTargetId] = useState('');
  const [storeId, setStoreId] = useState(fixedStoreId || preset?.storeId || '');
  const [baristaId, setBaristaId] = useState(preset?.baristaId || '');
  const [due, setDue] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveStore = fixedStoreId || storeId;
  const storeBaristas = baristas.filter((b) => b.storeId === effectiveStore && b.active);

  const options = useMemo(() => {
    const pubMods = publishedOnly(modules);
    return publishedOnly(tracks).map((tr) => ({
      track: tr,
      items: kind === 'module'
        ? pubMods.filter((m) => m.trackId === tr.id).map((m) => ({ id: m.id, title: m.title }))
        : pubMods.filter((m) => m.trackId === tr.id).flatMap((m) =>
            publishedOnly(lessons).filter((l) => l.moduleId === m.id).map((l) => ({ id: l.id, title: `${m.title} › ${l.title}` }))
          )
    }));
  }, [kind, tracks, modules, lessons]);

  const title = useMemo(() => {
    if (kind === 'module') {
      const m = modules.find((x) => x.id === targetId);
      return m ? `${m.title} sınavını geç` : '';
    }
    const l = lessons.find((x) => x.id === targetId);
    return l ? `${l.title} dersini tamamla` : '';
  }, [kind, targetId, modules, lessons]);

  const save = async () => {
    setError(null);
    if (!effectiveStore) return setError('Mağaza seç.');
    if (!targetId) return setError(kind === 'module' ? 'Modül seç.' : 'Ders seç.');
    setBusy(true);
    try {
      const a: Omit<Assignment, 'id'> = {
        kind,
        targetId,
        title,
        note: note.trim(),
        storeId: effectiveStore,
        baristaId: baristaId || null,
        dueAt: due ? new Date(`${due}T23:59:00`).getTime() : null,
        createdAt: Date.now(),
        createdBy: creator.uid,
        createdByName: creator.name
      };
      await addDoc(collection(db, 'assignments'), a);
      toast('Görev atandı', 'positive');
      setTargetId('');
      setNote('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="Görev ata"
      onClose={onClose}
      footer={
        <>
          <button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={onClose}>Vazgeç</button>
          <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save} disabled={busy}>{busy ? <Spinner size={14} /> : 'Ata'}</button>
        </>
      }
    >
      <div className={t.segment}>
        {(['module', 'lesson'] as const).map((k) => (
          <button key={k} onClick={() => { setKind(k); setTargetId(''); }} className={`${t.segmentItem} ${kind === k ? t.segmentItemOn : t.segmentItemOff}`}>
            {k === 'module' ? 'Modül sınavı' : 'Tek ders'}
          </button>
        ))}
      </div>

      <label className={t.field}>
        <span className={t.label}>{kind === 'module' ? 'Modül' : 'Ders'}</span>
        <select className={t.input} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Seç…</option>
          {options.map((g) => (
            <optgroup key={g.track.id} label={g.track.title}>
              {g.items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      {!fixedStoreId && (
        <label className={t.field}>
          <span className={t.label}>Mağaza</span>
          <select className={t.input} value={storeId} onChange={(e) => { setStoreId(e.target.value); setBaristaId(''); }}>
            <option value="">Seç…</option>
            {stores.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      <label className={t.field}>
        <span className={t.label}>Kime</span>
        <select className={t.input} value={baristaId} onChange={(e) => setBaristaId(e.target.value)} disabled={!effectiveStore}>
          <option value="">Mağazadaki herkes</option>
          {storeBaristas.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>

      <label className={t.field}>
        <span className={t.label}>Son tarih</span>
        <input type="date" className={t.input} value={due} onChange={(e) => setDue(e.target.value)} />
      </label>

      <label className={t.field}>
        <span className={t.label}>Not (isteğe bağlı)</span>
        <input className={t.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ör. Yeni menü öncesi tekrar" maxLength={140} />
      </label>

      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};
