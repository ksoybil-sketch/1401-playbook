import React, { useState } from 'react';
import { collection, doc, orderBy, query } from 'firebase/firestore';
import { commitChange, canPublishNow, resultText } from '../../api/changes';
import { db } from '../../api/firebase';
import { errorText } from '../../api/backend';
import { useQueryLive } from '../../hooks/useFirestore';
import { useContent } from '../../store/content';
import { useStaffData } from './staffData';
import { useStaffSession } from './StaffLayout';
import { RichText } from '../academy/LessonBlocks';
import { MediaInput } from './MediaInput';
import { Icon, type IconName } from '../../ui/Icon';
import { Page, PageTitle, Section, Sheet, Empty, Badge, ErrorText, toast, fmtDate, Avatar } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { Barista, Bulletin, BulletinKind } from '../../../shared/types';

/**
 * Bülten yönetimi.
 *
 * Ders değil, duyuru: sınavı ve ilerlemesi yok, bu yüzden müfredattan
 * tamamen ayrı durur ve "Müfredatı güncelle" onu silmez.
 */

const KINDS: { value: BulletinKind; label: string; icon: IconName; tone: t.Tone; hint: string }[] = [
  { value: 'duyuru', label: 'Duyuru', icon: 'bell', tone: 'accent', hint: 'Genel bilgilendirme' },
  { value: 'kampanya', label: 'Kampanya', icon: 'flash', tone: 'caution', hint: 'Yeni indirim ya da ürün' },
  { value: 'liderlik', label: 'Liderlik', icon: 'award', tone: 'positive', hint: 'Satış sıralaması ya da terfi / başarı duyurusu' }
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

  const [openReaders, setOpenReaders] = useState<string | null>(null);

  /**
   * Bültenin hedef kitlesi (seçili mağazaların aktif baristaları) ve
   * içlerinden kimin ne zaman okuduğu. Sayı tek başına "kim okumadı"
   * sorusunu cevaplamıyordu; liste mağaza müdürünü aramak için gerekli.
   */
  const readersOf = (b: Bulletin) => {
    const audienceList = baristas.filter((x) => x.active && (!b.storeIds?.length || b.storeIds.includes(x.storeId)));
    const read: { b: Barista; at: number }[] = [];
    const unread: Barista[] = [];
    for (const x of audienceList) {
      const at = progress[x.id]?.bulletins?.[b.id];
      if (at) read.push({ b: x, at }); else unread.push(x);
    }
    read.sort((a, c) => c.at - a.at);
    return { read, unread, total: audienceList.length };
  };
  const storeName = (id: string) => stores.find((x) => x.id === id)?.name || '';

  const audience = (b: Bulletin) =>
    !b.storeIds?.length
      ? 'Tüm mağazalar'
      : b.storeIds.map((id) => stores.find((x) => x.id === id)?.name || id).join(', ');


  return (
    <Page wide>
      <PageTitle
        title="Bülten"
        subtitle="Duyuru, kampanya ve liderlik tabloları. Tüm baristalara, vardiya ve mağaza müdürlerine görünür."
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
              const r = readersOf(b);
              const showReaders = openReaders === b.id;
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
                      <button onClick={() => setOpenReaders(showReaders ? null : b.id)}
                              className="text-[12px] text-fg-2 mt-1.5 tnum inline-flex items-center gap-1.5 hover:text-crema">
                        <Icon name="users" size={13} />
                        {r.read.length}/{r.total} barista okudu
                        <Icon name={showReaders ? 'arrowUp' : 'arrowDown'} size={12} />
                      </button>
                    )}
                    {showReaders && (
                      <div className="grid sm:grid-cols-2 gap-3 mt-3">
                        <div>
                          <div className={`${t.label} mb-1.5`}>Okuyanlar · {r.read.length}</div>
                          {r.read.length === 0 ? <div className="text-[12px] text-fg-3">Henüz kimse açmadı.</div> : (
                            <div className="flex flex-col gap-1">
                              {r.read.map(({ b: x, at }) => (
                                <div key={x.id} className="flex items-center gap-2 text-[12.5px]">
                                  <Avatar name={x.name} size={20} />
                                  <span className="truncate flex-1">{x.name} <span className="text-fg-3">· {storeName(x.storeId)}</span></span>
                                  <span className="text-fg-3 tnum shrink-0">{fmtDate(at)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className={`${t.label} mb-1.5`}>Okumayanlar · {r.unread.length}</div>
                          {r.unread.length === 0 ? <div className="text-[12px] text-positive">Herkes okudu.</div> : (
                            <div className="flex flex-col gap-1">
                              {r.unread.map((x) => (
                                <div key={x.id} className="flex items-center gap-2 text-[12.5px] text-fg-2">
                                  <Avatar name={x.name} size={20} />
                                  <span className="truncate">{x.name} <span className="text-fg-3">· {storeName(x.storeId)}</span></span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
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
        baristas={baristas.filter((x) => x.active)}
      />
    </Page>
  );
};

/* ------------------------------------------------------------------ */

export const BulletinSheet: React.FC<{
  value: Draft | null;
  onClose: () => void;
  author: { uid: string; name: string };
  stores: { id: string; name: string }[];
  baristas: Barista[];
  /** Onay bekleyen bir öneriden açıldıysa: kaydetmek onu yayınlar/günceller. */
  proposalId?: string | null;
}> = ({ value, onClose, author, stores, baristas, proposalId }) => {
  const publisher = canPublishNow({ op: 'set', col: 'bulletins', id: '' });
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
  const isLeader = d.kind === 'liderlik';
  const board = d.board || 'satis';
  const isBoard = isLeader && board === 'satis';
  const isPromo = isLeader && board === 'terfi';
  const rows = d.rows ?? [];
  const people = d.people ?? [];
  const setPerson = (i: number, patch: Partial<NonNullable<Draft['people']>[number]>) =>
    setD({ ...d, people: people.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const setRow = (i: number, patch: Partial<{ label: string; value: string }>) =>
    setD({ ...d, rows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const save = async (publish: boolean) => {
    const title = (d.title || '').trim();
    if (title.length < 3) { setError('Başlık gir.'); return; }
    if (!isLeader && !(d.body || '').trim()) { setError('Metin gir.'); return; }
    const clean = rows.filter((r) => r.label.trim() || r.value.trim());
    if (isBoard && clean.length === 0) { setError('Sıralama için en az bir satır gir.'); return; }
    const cleanPeople = people.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim(), note: p.note.trim() }));
    if (isPromo && cleanPeople.length === 0) { setError('Terfi / başarı duyurusu için en az bir kişi seç.'); return; }

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
        ...(isLeader ? { board } : {}),
        people: isPromo ? cleanPeople : [],
        // Firestore `undefined` kabul etmiyor; alan ya dolu yazılır ya hiç
        // yazılmaz. setDoc belgeyi baştan yazdığı için yazılmaması = silinmesi.
        ...(d.imageUrl ? { imageUrl: d.imageUrl } : {}),
        expiresAt: d.expiresAt ?? null,
        published: publish,
        pinned: !!d.pinned,
        createdAt: value.createdAt ?? Date.now(),
        createdBy: value.createdBy ?? author.uid,
        createdByName: value.createdByName ?? author.name
      };
      const r = await commitChange([{ op: 'set', col: 'bulletins', id, data: payload as unknown as Record<string, unknown> }],
        { kind: 'bulletin', title, summary: `${editing ? 'Bülten düzenlendi' : 'Yeni bülten'} · ${kindOf(payload.kind).label}${publish ? '' : ' (taslak)'}` }, proposalId);
      toast(resultText(r, publish ? 'Bülten yayınlandı.' : 'Taslak kaydedildi.'), 'positive');
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
      const r = await commitChange([{ op: 'update', col: 'bulletins', id: value.id, data: { published: false } }],
        { kind: 'bulletin', title: value.title || 'Bülten', summary: 'Yayından kaldırma' });
      toast(resultText(r, 'Bülten yayından kaldırıldı.'));
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!value.id) return;
    if (!confirm(`"${value.title || 'Bülten'}" silinsin mi? Bu geri alınamaz.`)) return;
    setBusy(true);
    try {
      const r = await commitChange([{ op: 'delete', col: 'bulletins', id: value.id }],
        { kind: 'bulletin', title: value.title || 'Bülten', summary: 'Bülten silme' });
      toast(resultText(r, 'Bülten silindi.'));
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      dirty={!busy && ((d.title || '') !== (value.title || '') || (d.body || '') !== (value.body || ''))}
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
          <button disabled={busy} onClick={() => save(true)} className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1`}>
            {publisher ? (proposalId ? 'Onayla ve yayınla' : 'Yayınla') : 'Onaya gönder'}
          </button>
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
          {!publisher && (
            <span className="text-[11px] text-caution">Bülten Kahve Operasyon Direktörü onayladıktan sonra yayına girer.</span>
          )}
        </div>

        {isLeader && (
          <div className={t.segment}>
            <button className={`${t.segmentItem} ${board === 'satis' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setD({ ...d, board: 'satis' })}>Satış sıralaması</button>
            <button className={`${t.segmentItem} ${board === 'terfi' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setD({ ...d, board: 'terfi' })}>Terfi · tebrik</button>
          </div>
        )}

        <div className={t.field}>
          <span className={t.label}>Başlık</span>
          <input className={t.input} value={d.title || ''} onChange={(e) => setD({ ...d, title: e.target.value })}
                 placeholder={isBoard ? 'Ekim ayında en çok Black Latte satanlar' : isPromo ? 'Kasım terfileri' : 'Yeni kampanya: Chestnut Latte'} />
        </div>

        <div className={t.field}>
          <span className={t.label}>Metin{isLeader ? ' (isteğe bağlı)' : ''}</span>
          <textarea className={`${t.textarea} min-h-28`} value={d.body || ''}
                    onChange={(e) => setD({ ...d, body: e.target.value })}
                    placeholder="**kalın** yazmak için iki yıldız; madde için satıra &quot;- &quot; ile başla." />
        </div>

        <div className={t.field}>
          <span className={t.label}>Görsel (isteğe bağlı)</span>
          <MediaInput
            url={d.imageUrl || ''}
            kind="image"
            onChange={(url) => setD({ ...d, imageUrl: url || undefined })}
            placeholder="Görsel bağlantısı ya da dosyadan yükle"
          />
          <span className="text-[11px] text-fg-3">
            Yüklenen fotoğraf küçültülüp bültene gömülür; ayrı bir dosya deposu gerekmez.
          </span>
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

        {isPromo && (
          <div className={t.field}>
            <span className={t.label}>Kişiler</span>
            <div className="flex flex-col gap-2">
              {people.map((p, i) => (
                <div key={i} className={`${t.card} p-2.5 flex flex-col gap-2`}>
                  <div className="flex gap-2 items-center">
                    <select className={t.input} value={p.baristaId || ''}
                            onChange={(e) => {
                              const x = baristas.find((y) => y.id === e.target.value);
                              setPerson(i, x ? { baristaId: x.id, name: x.name, storeName: stores.find((st) => st.id === x.storeId)?.name || '' } : { baristaId: null });
                            }}>
                      <option value="">Listeden seç ya da adı yaz</option>
                      {baristas.map((x) => <option key={x.id} value={x.id}>{x.name} · {stores.find((st) => st.id === x.storeId)?.name || ''}</option>)}
                    </select>
                    <button className={t.iconBtn} onClick={() => setD({ ...d, people: people.filter((_, j) => j !== i) })}><Icon name="minus" size={13} /></button>
                  </div>
                  {!p.baristaId && (
                    <input className={t.input} value={p.name} placeholder="Ad Soyad" onChange={(e) => setPerson(i, { name: e.target.value })} />
                  )}
                  <input className={t.input} value={p.note} placeholder="Vardiya müdürlüğüne terfi etti · Ayın baristası · 1 yıl"
                         onChange={(e) => setPerson(i, { note: e.target.value })} />
                </div>
              ))}
              <button className={`${t.btn} ${t.btnGhost} ${t.btnSm} self-start`}
                      onClick={() => setD({ ...d, people: [...people, { baristaId: null, name: '', note: '' }] })}>
                <Icon name="plus" size={13} /> Kişi
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
              {d.imageUrl && <img src={d.imageUrl} alt="" className="w-full max-h-52 object-contain rounded-lg border border-line bg-panel" />}
              {d.body && <RichText text={d.body} />}
              {isPromo && people.length > 0 && <PeopleList people={people.filter((p) => p.name)} />}
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

/** Terfi / tebrik edilen kişiler — barista ekranıyla aynı görünüm. */
export const PeopleList: React.FC<{ people: NonNullable<Bulletin['people']> }> = ({ people }) => (
  <div className="flex flex-col gap-2">
    {people.map((p, i) => (
      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-positive-bg border border-positive-line">
        <Avatar name={p.name} size={36} />
        <div className="min-w-0 leading-tight">
          <div className="text-[14px] font-semibold">{p.name}{p.storeName ? <span className="text-fg-3 font-normal"> · {p.storeName}</span> : null}</div>
          {p.note && <div className="text-[13px] text-fg-2 mt-0.5">{p.note}</div>}
        </div>
        <Icon name="award" size={18} className="text-positive ml-auto shrink-0" />
      </div>
    ))}
  </div>
);
