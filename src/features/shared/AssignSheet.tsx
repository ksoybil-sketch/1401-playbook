import React, { useMemo, useState } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent, publishedOnly } from '../../store/content';
import { Sheet, ErrorText, Spinner, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { Assignment, AssignmentKind, Barista, Progress } from '../../../shared/types';
import { moduleState, EMPTY_PROGRESS } from '../../lib/progress';
import { localDay, localDayStart } from '../../lib/day';
import { errorText } from '../../api/backend';

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
  /** Atayanın içerik alanı (izinli eğitim yolları); yoksa hepsi. */
  domain?: string[] | null;
  /** Baristaların ilerlemesi: "zaten geçti" ve önkoşul uyarısı için. */
  progressOf?: (baristaId: string) => Progress | undefined;
}> = ({ open, onClose, creator, fixedStoreId, baristas, preset, domain, progressOf }) => {
  const { stores, tracks, modules, lessons } = useContent();
  const [kind, setKind] = useState<AssignmentKind>('module');
  const [targetId, setTargetId] = useState('');
  const [storeId, setStoreId] = useState(fixedStoreId || preset?.storeId || '');
  const [baristaId, setBaristaId] = useState(preset?.baristaId || '');
  const [due, setDue] = useState(() => localDay(Date.now() + 7 * 86400000));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Panelde "Tüm aktif mağazalar": her mağaza için ayrı bir görev yazılır.
  const ALL = '__hepsi__';
  const allStores = !fixedStoreId && storeId === ALL;
  const effectiveStore = fixedStoreId || (allStores ? '' : storeId);
  const storeBaristas = baristas.filter((b) => b.storeId === effectiveStore && b.active);
  // Mağazanın `active` alanı her yerde aynı okunur (alan yoksa aktif).
  const activeStores = stores.filter((s) => s.active !== false);
  // "Tüm mağazalar": aktif baristası olmayan mağazaya görev açılmaz (hiç tamamlanamaz, geçersiz kalırdı).
  const staffedStores = activeStores.filter((s) => baristas.some((b) => b.active && b.storeId === s.id));

  // Kimler için: seçilen kişi, mağazadaki herkes ya da bütün zincir.
  const targets = allStores
    ? baristas.filter((b) => b.active && staffedStores.some((s) => s.id === b.storeId))
    : baristaId ? storeBaristas.filter((b) => b.id === baristaId) : storeBaristas;
  const info = useMemo(() => {
    if (!progressOf || !targetId || !targets.length) return null;
    const p = (b: Barista) => progressOf(b.id) || { ...EMPTY_PROGRESS, baristaId: b.id, storeId: b.storeId };
    const already = targets.filter((b) => kind === 'module' ? !!p(b).modules?.[targetId] : !!p(b).lessons?.[targetId]).length;
    let prereq: { title: string; missing: number } | null = null;
    if (kind === 'module') {
      const m = modules.find((x) => x.id === targetId);
      const pre = m?.prerequisiteId ? modules.find((x) => x.id === m.prerequisiteId) : undefined;
      if (m && pre) {
        const missing = targets.filter((b) => !p(b).modules?.[targetId] && moduleState(m, lessons, p(b), { modules, tracks }).locked).length;
        if (missing) prereq = { title: pre.title, missing };
      }
    }
    return { already, total: targets.length, prereq };
  }, [progressOf, targetId, targets, kind, modules, lessons, tracks]);

  const options = useMemo(() => {
    const pubMods = publishedOnly(modules);
    return publishedOnly(tracks).filter((tr) => !domain || domain.includes(tr.id)).map((tr) => ({
      track: tr,
      items: kind === 'module'
        ? pubMods.filter((m) => m.trackId === tr.id).map((m) => ({ id: m.id, title: m.title }))
        : pubMods.filter((m) => m.trackId === tr.id).flatMap((m) =>
            publishedOnly(lessons).filter((l) => l.moduleId === m.id).map((l) => ({ id: l.id, title: `${m.title} › ${l.title}` }))
          )
    }));
  }, [kind, tracks, modules, lessons, domain]);

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
    if (!effectiveStore && !allStores) return setError('Mağaza seç.');
    if (!targetId) return setError(kind === 'module' ? 'Modül seç.' : 'Ders seç.');
    // Geçmiş son tarih: görev doğduğu anda gecikmiş oluyordu.
    if (due && due < localDay()) return setError('Son tarih geçmiş bir gün olamaz.');
    if (!allStores && !storeBaristas.length) return setError('Bu mağazada aktif barista yok; görev tamamlanamaz.');
    if (allStores && !staffedStores.length) return setError('Aktif baristası olan mağaza yok.');
    setBusy(true);
    try {
      const base: Omit<Assignment, 'id' | 'storeId'> = {
        kind,
        targetId,
        title,
        note: note.trim(),
        baristaId: allStores ? null : baristaId || null,
        dueAt: due ? (localDayStart(due) ?? Date.now()) + (23 * 60 + 59) * 60000 : null,
        createdAt: Date.now(),
        createdBy: creator.uid,
        createdByName: creator.name
      };
      // Tek toplu yazım: ya hepsi atanır ya hiçbiri.
      const ids = allStores ? staffedStores.map((s) => s.id) : [effectiveStore];
      const batch = writeBatch(db);
      ids.forEach((sid) => batch.set(doc(collection(db, 'assignments')), { ...base, storeId: sid }));
      await batch.commit();
      toast(allStores ? `Görev ${ids.length} mağazaya atandı` : 'Görev atandı', 'positive');
      setTargetId('');
      setNote('');
      onClose();
    } catch (e) {
      // Ham İngilizce hata ("Missing or insufficient permissions") yerine Türkçe.
      setError(errorText(e));
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
            <option value={ALL}>Tüm aktif mağazalar ({staffedStores.length})</option>
            {activeStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      <label className={t.field}>
        <span className={t.label}>Kime</span>
        <select className={t.input} value={baristaId} onChange={(e) => setBaristaId(e.target.value)} disabled={!effectiveStore}>
          <option value="">{allStores ? 'Her mağazada herkes' : 'Mağazadaki herkes'}</option>
          {storeBaristas.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>

      {/* Boşa ya da yapılamayacak görev atanmasın. */}
      {info && (info.already > 0 || info.prereq) && (
        <div className="flex flex-col gap-1 text-[12.5px] leading-relaxed bg-panel border border-line rounded-lg px-3 py-2.5">
          {info.already > 0 && (
            <span className="text-fg-2">
              {info.already === info.total
                ? `${info.total === 1 ? 'Bu kişi' : `Seçilen ${info.total} kişinin hepsi`} bunu zaten ${kind === 'module' ? 'geçti' : 'tamamladı'}; görev hemen tamamlanmış sayılır.`
                : `${info.total} kişiden ${info.already} kişi zaten ${kind === 'module' ? 'geçti' : 'tamamladı'}; onlar için görev tamamlanmış sayılır.`}
            </span>
          )}
          {info.prereq && (
            <span className="text-caution">Önkoşul: {info.prereq.title}. Geçmemiş {info.prereq.missing} kişi önce onu yapmalı; sınav o zamana kadar kilitli.</span>
          )}
        </div>
      )}

      <label className={t.field}>
        <span className={t.label}>Son tarih</span>
        <input type="date" className={t.input} value={due} min={localDay()} onChange={(e) => setDue(e.target.value)} />
      </label>

      <label className={t.field}>
        <span className={t.label}>Not (isteğe bağlı)</span>
        <input className={t.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ör. Yeni menü öncesi tekrar" maxLength={140} />
      </label>

      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};
