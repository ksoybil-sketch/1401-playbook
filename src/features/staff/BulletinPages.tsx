import React, { useMemo, useState } from 'react';
import { collection, deleteDoc, doc, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { errorText } from '../../api/backend';
import { useQueryLive } from '../../hooks/useFirestore';
import { useContent } from '../../store/content';
import { useStaffData } from './staffData';
import { useStaffSession } from './StaffLayout';
import { RichText } from '../academy/LessonBlocks';
import { Icon, type IconName } from '../../ui/Icon';
import { Page, PageTitle, Section, Sheet, Empty, Badge, ErrorText, toast, fmtDate } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { Bulletin, BulletinKind } from '../../../shared/types';

/**
 * Bülten yönetimi.
 *
 * Ders değil, duyuru: sınavı ve ilerlemesi yok, bu yüzden müfredattan
 * tamamen ayrı durur ve "Müfredatı güncelle" onu silmez.
 */

const KINDS: { value: BulletinKind; label: string; icon: IconName; tone: t.Tone; hint: string }[] = [
  { value: 'duyuru', label: 'Duyuru', icon: 'bell', tone: 'accent', hint: 'Genel bilgilendirme' },
  { value: 'kampanya', label: 'Kampanya', icon: 'flash', tone: 'caution', hint: 'Yeni indirim ya da ürün' },
  { value: 'liderlik', label: 'Liderlik', icon: 'award', tone: 'positive', hint: 'Sıralama tablosu' }
];

const kindOf = (k: BulletinKind) => KINDS.find((x) => x.value === k) ?? KINDS[0];

type Draft = Partial<Bulletin> & { rows?: { label: string; value: string }[] };

export const BulletinPage: React.FC = () => {
  const s = useStaffSession();
  const { stores } = useContent();
  const progress = useStaffData((x) => x.progress);
  const baristas = useStaffData((x) => x.baristas);
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data: bulletins, loading } = useQueryLive<Bulletin>(
    query(collection(db, 'bulletins'), orderBy('createdAt', 'desc')),
    'staff-bulletins'
  );

  /** Bülteni kaç aktif barista açtı — yayının karşılığı var mı, onu gösterir. */
  const readCount = useMemo(() => {
    const map: Record<string, number> = {};
    const active = new Set(baristas.filter((b) => b.active).map((b) => b.id));
    for (const [id, p] of Object.entries(progress)) {
      if (!active.has(id)) continue;
      for (const bid of Object.keys(p.bulletins || {})) map[bid] = (map[bid] || 0) + 1;
    }
    return map;
  }, [progress, baristas]);

  const audience = (b: Bulletin) =>
    !b.storeIds?.length
      ? 'Tüm mağazalar'
      : b.storeIds.map((id) => stores.find((x) => x.id === id)?.name || id).join(', ');

  const activeCount = baristas.filter((b) => b.active).length;

  return (
    <Page wide>
      <PageTitle
        title="Bülten"
        subtitle="Duyuru, kampanya ve liderlik tabloları. Tüm baristalara ve mağaza sorumlularına görünür."
        action={
          <button onClick={() => setDraft({ kind: 'duyuru', title: '', body: '', published: true })}
                  className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`}>
            <Icon name="plus" size={15} /> Yeni bülten
          </button>
        }
      />

      <Section label={`Bültenler${bulletins.length ? ` · ${bulletins.length}` : ''}`}>
        {loading ? null : bulletins.length === 0 ? (
          <Empty icon="bell" text="Henüz bülten yok. İlk duyurunu yayınla." />
        ) : (
          <div className="flex flex-col gap-2.5">
            {bulletins.map((b) => {
              const k = kindOf(b.kind);
              const expired = !!b.expiresAt && b.expiresAt < Date.now();
              const read = readCount[b.id] || 0;
              return (
                <div key={b.id} className={`${t.card} p-4 flex items-start gap-3`}>
                  <span className={`${t.iconChip(k.tone)} mt-0.5`}><Icon name={k.icon} size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-semibold leading-snug">{b.title}</span>
                      {!b.published && <Badge>Taslak</Badge>}
                      {b.pinned && <Badge tone="caution">Sabit</Badge>}
                      {expired && <Badge tone="neutral">Süresi doldu</Badge>}
                    </div>
                    <div className="text-[12px] text-fg-3 mt-1">
                      {k.label} · {audience(b)} · {fmtDate(b.createdAt)} · {b.createdByName}
                    </div>
                    {b.published && (
                      <div className="text-[12px] text-fg-2 mt-1.5 tnum">
                        {read}/{activeCount} barista okudu
                      </div>
                    )}
                  </div>
                  <button className={t.iconBtn} onClick={() => setDraft(b)} aria-label="Düzenle">
                    <Icon name="edit" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <BulletinSheet
        value={draft}
        onClose={() => setDraft(null)}
        author={{ uid: s.uid, name: s.name }}
        stores={stores.map((x) => ({ id: x.id, name: x.name }))}
      />
    </Page>
  );
};

/* ------------------------------------------------------------------ */

const BulletinSheet: React.FC<{
  value: Draft | null;
  onClose: () => void;
  author: { uid: string; name: string };
  stores: { id: string; name: string }[];
}> = ({ value, onClose, author, stores }) => {
  const [d, setD] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  // Sheet her açılışta taslağı tazeler.
  React.useEffect(() => {
    if (value) {
      setD({ kind: 'duyuru', title: '', body: '', published: true, ...value });
      setError(null);
      setKey((k) => k + 1);
    }
  }, [value]);

  if (!value) return null;
  const editing = !!value.id;
  const isBoard = d.kind === 'liderlik';
  const rows = d.rows ?? [];

  const setRow = (i: number, patch: Partial<{ label: string; value: string }>) =>
    setD({ ...d, rows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const save = async (publish: boolean) => {
    const title = (d.title || '').trim();
    if (title.length < 3) { setError('Başlık gir.'); return; }
    if (!isBoard && !(d.body || '').trim()) { setError('Metin gir.'); return; }
    const clean = rows.filter((r) => r.label.trim() || r.value.trim());
    if (isBoard && clean.length === 0) { setError('Liderlik bülteni için en az bir satır gir.'); return; }

    setBusy(true);
    setError(null);
    try {
      const id = value.id || doc(collection(db, 'bulletins')).id;
      const payload: Omit<Bulletin, 'id'> = {
        kind: (d.kind as BulletinKind) || 'duyuru',
        title,
        body: (d.body || '').trim(),
        storeIds: d.storeIds?.length ? d.storeIds : null,
        rows: isBoard ? clean : [],
        expiresAt: d.expiresAt ?? null,
        published: publish,
        pinned: !!d.pinned,
        createdAt: value.createdAt ?? Date.now(),
        createdBy: value.createdBy ?? author.uid,
        createdByName: value.createdByName ?? author.name
      };
      await setDoc(doc(db, 'bulletins', id), payload);
      toast(publish ? 'Bülten yayınlandı.' : 'Taslak kaydedildi.', 'positive');
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    if (!value.id) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'bulletins', value.id), { published: false });
      toast('Bülten yayından kaldırıldı.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!value.id) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'bulletins', value.id));
      toast('Bülten silindi.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title={editing ? 'Bülteni düzenle' : 'Yeni bülten'}
      onClose={busy ? () => {} : onClose}
      footer={
        <div className="flex gap-2">
          {editing && d.published && (
            <button disabled={busy} onClick={unpublish} className={`${t.btn} ${t.btnSecondary} ${t.btnLg}`}>Yayından kaldır</button>
          )}
          {editing && (
            <button disabled={busy} onClick={remove} className={`${t.btn} ${t.btnDanger} ${t.btnLg}`} aria-label="Sil">
              <Icon name="trash" size={15} />
            </button>
          )}
          <button disabled={busy} onClick={() => save(false)} className={`${t.btn} ${t.btnSecondary} ${t.btnLg}`}>Taslak</button>
          <button disabled={busy} onClick={() => save(true)} className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1`}>Yayınla</button>
        </div>
      }
    >
      <div className="flex flex-col gap-4" key={key}>
        <div className={t.field}>
          <span className={t.label}>Tür</span>
          <div className={t.scrollX}>
            {KINDS.map((k) => (
              <button key={k.value} onClick={() => setD({ ...d, kind: k.value })}
                      className={`${t.chip} ${d.kind === k.value ? t.chipOn : t.chipOff}`}>
                {k.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-fg-3">{kindOf((d.kind as BulletinKind) || 'duyuru').hint}</span>
        </div>

        <div className={t.field}>
          <span className={t.label}>Başlık</span>
          <input className={t.input} value={d.title || ''} onChange={(e) => setD({ ...d, title: e.target.value })}
                 placeholder={isBoard ? 'Ekim ayında en çok Black Latte satanlar' : 'Yeni kampanya: Chestnut Latte'} />
        </div>

        <div className={t.field}>
          <span className={t.label}>Metin{isBoard ? ' (isteğe bağlı)' : ''}</span>
          <textarea className={`${t.textarea} min-h-28`} value={d.body || ''}
                    onChange={(e) => setD({ ...d, body: e.target.value })}
                    placeholder="**kalın** yazmak için iki yıldız; madde için satıra &quot;- &quot; ile başla." />
        </div>

        {isBoard && (
          <div className={t.field}>
            <span className={t.label}>Sıralama</span>
            <div className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-[12px] text-fg-3 tnum w-5">{i + 1}.</span>
                  <input className={t.input} value={r.label} placeholder="Ayşe Demir · Moda Cadde"
                         onChange={(e) => setRow(i, { label: e.target.value })} />
                  <input className={`${t.input} max-w-28`} value={r.value} placeholder="42 adet"
                         onChange={(e) => setRow(i, { value: e.target.value })} />
                  <button className={t.iconBtn} onClick={() => setD({ ...d, rows: rows.filter((_, j) => j !== i) })}>
                    <Icon name="minus" size={13} />
                  </button>
                </div>
              ))}
              <button className={`${t.btn} ${t.btnGhost} ${t.btnSm} self-start`}
                      onClick={() => setD({ ...d, rows: [...rows, { label: '', value: '' }] })}>
                <Icon name="plus" size={13} /> Satır
              </button>
            </div>
          </div>
        )}

        <div className={t.field}>
          <span className={t.label}>Kimler görecek</span>
          <div className={t.scrollX}>
            <button onClick={() => setD({ ...d, storeIds: null })}
                    className={`${t.chip} ${!d.storeIds?.length ? t.chipOn : t.chipOff}`}>
              Tüm mağazalar
            </button>
            {stores.map((st) => {
              const on = !!d.storeIds?.includes(st.id);
              return (
                <button key={st.id}
                        onClick={() => setD({ ...d, storeIds: on ? (d.storeIds || []).filter((x) => x !== st.id) : [...(d.storeIds || []), st.id] })}
                        className={`${t.chip} ${on ? t.chipOn : t.chipOff}`}>
                  {st.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-[13px] text-fg-2 cursor-pointer">
            <input type="checkbox" checked={!!d.pinned} onChange={(e) => setD({ ...d, pinned: e.target.checked })} />
            Üstte sabitle
          </label>
          <label className="flex items-center gap-2 text-[13px] text-fg-2">
            Bitiş
            <input type="date" className={`${t.input} max-w-40 h-9`}
                   value={d.expiresAt ? new Date(d.expiresAt).toISOString().slice(0, 10) : ''}
                   onChange={(e) => setD({ ...d, expiresAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).getTime() : null })} />
          </label>
        </div>

        {(d.title || d.body) && (
          <div className={t.field}>
            <span className={t.label}>Baristada böyle görünecek</span>
            <div className={`${t.card} p-4 flex flex-col gap-2`}>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-3">
                {kindOf((d.kind as BulletinKind) || 'duyuru').label}
              </div>
              <div className="text-[15px] font-semibold leading-snug">{d.title || 'Başlık'}</div>
              {d.body && <RichText text={d.body} />}
              {isBoard && rows.length > 0 && (
                <div className={t.listGroup}>
                  {rows.filter((r) => r.label || r.value).map((r, i) => (
                    <div key={i} className={`${t.listRowStatic} justify-between`}>
                      <span className="text-[14px] text-fg-2">{i + 1}. {r.label}</span>
                      <span className="text-[14px] font-semibold tnum">{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <ErrorText>{error}</ErrorText>
      </div>
    </Sheet>
  );
};
