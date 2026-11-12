import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { approveProposal, rejectProposal, withdrawProposal } from '../../api/changes';
import { errorText } from '../../api/backend';
import { useContent } from '../../store/content';
import { can } from '../../lib/roles';
import { useStaffData } from './staffData';
import { useStaffSession } from './StaffLayout';
import { BulletinSheet } from './BulletinPages';
import { ModuleSheet, QuestionSheet, TrackSheet } from './ContentPages';
import { LessonBlocks } from '../academy/LessonBlocks';
import { Icon, type IconName } from '../../ui/Icon';
import { Page, PageTitle, Section, Sheet, Empty, Badge, ErrorText, Spinner, toast, fmtDateTime } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { Bulletin, ChangeOp, Lesson, Module, Proposal, ProposalKind, Question, Track } from '../../../shared/types';

/**
 * Bekleyen onaylar.
 *
 * Bölge müdürü ve operasyon ekibinin içerik/bülten değişiklikleri buraya
 * düşer. Kahve Operasyon Direktörü her birini olduğu gibi yayınlar, açıp
 * düzelterek yayınlar ya da bir notla reddeder. Öneriyi yapan kişi aynı
 * sayfada kendi önerilerinin durumunu görür.
 */

const KIND: Record<ProposalKind, { label: string; icon: IconName }> = {
  lesson: { label: 'Ders', icon: 'book' },
  module: { label: 'Modül', icon: 'layers' },
  track: { label: 'Eğitim yolu', icon: 'flag' },
  question: { label: 'Soru', icon: 'target' },
  bulletin: { label: 'Bülten', icon: 'bell' },
  order: { label: 'Sıralama', icon: 'list' }
};

const STATUS: Record<Proposal['status'], { label: string; tone: 'neutral' | 'positive' | 'caution' | 'negative' }> = {
  pending: { label: 'Onay bekliyor', tone: 'caution' },
  approved: { label: 'Yayınlandı', tone: 'positive' },
  rejected: { label: 'Reddedildi', tone: 'negative' },
  withdrawn: { label: 'Geri çekildi', tone: 'neutral' }
};

export const ApprovalsPage: React.FC = () => {
  const me = useStaffSession();
  const approver = can(me.role, 'approve');
  const proposals = useStaffData((x) => x.proposals);
  const baristas = useStaffData((x) => x.baristas);
  const { stores } = useContent();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [detail, setDetail] = useState<Proposal | null>(null);
  const [rejecting, setRejecting] = useState<Proposal | null>(null);
  const [editing, setEditing] = useState<{ p: Proposal; op: ChangeOp } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Onaylayan herkesinkini, diğerleri yalnızca kendi önerilerini görür.
  const mine = approver ? proposals : proposals.filter((p) => p.createdBy === me.uid);
  const pending = mine.filter((p) => p.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const history = mine.filter((p) => p.status !== 'pending');
  const list = tab === 'pending' ? pending : history;

  const publish = async (p: Proposal) => {
    setBusy(p.id);
    try {
      await approveProposal(p);
      toast('Yayınlandı', 'positive');
      setDetail(null);
    } catch (e) {
      toast(errorText(e), 'negative');
    } finally {
      setBusy(null);
    }
  };

  /** Öneriyi kendi editöründe aç: ders ayrı sayfada, diğerleri sayfa üstünde. */
  const edit = (p: Proposal) => {
    const op = p.ops.find((o) => o.col === 'lessons' && o.op !== 'delete') || p.ops.find((o) => o.op !== 'delete');
    if (!op) return;
    setDetail(null);
    if (op.col === 'lessons') navigate(`/icerik/ders/${op.id}?oneri=${p.id}`);
    else setEditing({ p, op });
  };
  // Ders önerisi (dosyadan gelen sorularıyla birlikte olabilir) ders
  // editöründe açılır; diğerleri tek belgelik değişiklikse kendi formunda.
  const editable = (p: Proposal) =>
    p.kind === 'lesson' ? p.ops.some((o) => o.col === 'lessons' && o.op !== 'delete')
      : p.kind !== 'order' && p.ops.length === 1 && p.ops[0].op !== 'delete';

  return (
    <Page wide>
      <PageTitle
        title={approver ? 'Bekleyen onaylar' : 'Önerilerim'}
        subtitle={approver
          ? 'Bölge müdürü ve ekibin yaptığı içerik ve bülten değişiklikleri. Olduğu gibi yayınla, düzeltip yayınla ya da notla geri gönder.'
          : 'İçerik ve bülten değişikliklerin Kahve Operasyon Direktörü onaylayınca yayına girer.'}
      />

      <div className={t.segment}>
        <button className={`${t.segmentItem} ${tab === 'pending' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('pending')}>Bekleyen · {pending.length}</button>
        <button className={`${t.segmentItem} ${tab === 'history' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('history')}>Geçmiş · {history.length}</button>
      </div>

      <Section>
        {list.length === 0 ? (
          <Empty icon="stamp" text={tab === 'pending' ? 'Onay bekleyen değişiklik yok.' : 'Henüz sonuçlanan öneri yok.'} />
        ) : (
          <div className="flex flex-col gap-2.5">
            {list.map((p) => {
              const k = KIND[p.kind] ?? KIND.lesson;
              const st = STATUS[p.status];
              return (
                <div key={p.id} className={`${t.card} p-4 flex flex-col gap-3`}>
                  <div className="flex items-start gap-3">
                    <span className={`${t.iconChip(p.status === 'pending' ? 'caution' : 'neutral')} mt-0.5`}><Icon name={k.icon} size={16} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-3">{k.label}</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {p.editedOnReview && <Badge>Düzeltilerek yayınlandı</Badge>}
                      </div>
                      <div className="text-[15px] font-semibold leading-snug mt-1 break-words">{p.title}</div>
                      <div className="text-[12px] text-fg-3 mt-0.5">
                        {p.summary} · {p.createdByName} · {fmtDateTime(p.createdAt)}
                        {p.reviewedAt ? ` · ${p.reviewedByName}, ${fmtDateTime(p.reviewedAt)}` : ''}
                      </div>
                      {p.reviewNote && <div className="text-[13px] text-fg-2 mt-1.5">Not: “{p.reviewNote}”</div>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => setDetail(p)}><Icon name="search" size={13} /> Ne değişiyor</button>
                    {p.status === 'pending' && approver && (
                      <>
                        {editable(p) && <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => edit(p)}><Icon name="edit" size={13} /> Düzelt ve yayınla</button>}
                        <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => setRejecting(p)}>Reddet</button>
                        <button className={`${t.btn} ${t.btnPrimary} ${t.btnSm} ml-auto`} disabled={busy === p.id} onClick={() => publish(p)}>
                          {busy === p.id ? <Spinner size={13} /> : <><Icon name="check" size={13} /> Olduğu gibi yayınla</>}
                        </button>
                      </>
                    )}
                    {p.status === 'pending' && !approver && p.createdBy === me.uid && (
                      <>
                        {editable(p) && <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => edit(p)}><Icon name="edit" size={13} /> Düzenle</button>}
                        <button className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} onClick={async () => { await withdrawProposal(p); toast('Öneri geri çekildi'); }}>Geri çek</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <DiffSheet p={detail} onClose={() => setDetail(null)} onPublish={approver ? publish : undefined} busy={!!detail && busy === detail.id} />
      <RejectSheet p={rejecting} onClose={() => setRejecting(null)} />

      {/* Düzeltme: önerideki veri ilgili editörde açılır; kaydetmek onu yayınlar. */}
      {editing?.op.col === 'bulletins' && (
        <BulletinSheet
          value={{ id: editing.op.id, ...(editing.op.data as Partial<Bulletin>) }}
          onClose={() => setEditing(null)}
          author={{ uid: me.uid, name: me.name }}
          stores={stores.map((x) => ({ id: x.id, name: x.name }))}
          baristas={baristas.filter((x) => x.active)}
          proposalId={editing.p.id}
        />
      )}
      <QuestionSheet
        value={editing?.op.col === 'questions' ? ({ ...(editing.op.data as Partial<Question>), id: editing.op.op === 'update' ? editing.op.id : undefined }) : null}
        onClose={() => setEditing(null)}
        proposalId={editing?.p.id}
      />
      <TrackSheet
        value={editing?.op.col === 'tracks' ? ({ ...(editing.op.data as Partial<Track>), id: editing.op.op === 'update' ? editing.op.id : undefined }) : null}
        onClose={() => setEditing(null)}
        nextOrder={Number((editing?.op.data as Partial<Track> | undefined)?.order) || 99}
        proposalId={editing?.p.id}
      />
      <ModuleSheet
        value={editing?.op.col === 'modules' ? ({ ...(editing.op.data as Partial<Module>), id: editing.op.op === 'update' ? editing.op.id : undefined }) : null}
        onClose={() => setEditing(null)}
        proposalId={editing?.p.id}
      />
    </Page>
  );
};

/* ------------------------------------------------------------------ */

const FIELD: Record<string, string> = {
  title: 'Başlık', description: 'Açıklama', body: 'Metin', published: 'Yayında', order: 'Sıra', blocks: 'Ders içeriği',
  durationMin: 'Süre (dk)', passScore: 'Geçme notu', examSize: 'Sınavdaki soru', prerequisiteId: 'Önkoşul',
  prompt: 'Soru', options: 'Seçenekler', answer: 'Doğru cevap', explanation: 'Açıklama', imageUrl: 'Görsel',
  storeIds: 'Mağazalar', rows: 'Sıralama', people: 'Kişiler', pinned: 'Sabit', expiresAt: 'Bitiş', kind: 'Tür', icon: 'İkon'
};
const SKIP = new Set(['createdAt', 'createdBy', 'createdByName', 'moduleId', 'trackId', 'questionCount', 'board', 'type']);

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
  if (typeof v === 'string') return v.startsWith('data:') ? '[görsel]' : v.length > 160 ? v.slice(0, 158) + '…' : v;
  if (Array.isArray(v)) return `${v.length} öğe`;
  return JSON.stringify(v).slice(0, 160);
}

const DiffSheet: React.FC<{ p: Proposal | null; onClose: () => void; onPublish?: (p: Proposal) => void; busy: boolean }> = ({ p, onClose, onPublish, busy }) => {
  const [current, setCurrent] = useState<Record<string, Record<string, unknown> | null>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!p) return;
    let alive = true;
    setLoading(true);
    Promise.all(p.ops.map(async (o) => {
      const snap = await getDoc(doc(db, o.col, o.id)).catch(() => null);
      return [`${o.col}/${o.id}`, snap?.exists() ? (snap.data() as Record<string, unknown>) : null] as const;
    })).then((rows) => { if (alive) { setCurrent(Object.fromEntries(rows)); setLoading(false); } });
    return () => { alive = false; };
  }, [p]);

  const lessonPreview = useMemo(() => {
    const op = p?.ops.find((o) => o.col === 'lessons' && o.op === 'set');
    return op ? (op.data as unknown as Lesson) : null;
  }, [p]);

  if (!p) return null;
  return (
    <Sheet open title="Ne değişiyor" onClose={onClose}
      footer={onPublish && p.status === 'pending' ? (
        <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} disabled={busy} onClick={() => onPublish(p)}>{busy ? <Spinner size={14} /> : 'Olduğu gibi yayınla'}</button>
      ) : undefined}>
      {loading ? <Spinner /> : p.ops.map((o, i) => {
        const before = current[`${o.col}/${o.id}`];
        const changes: { k: string; a: unknown; b: unknown }[] = [];
        if (o.op !== 'delete') {
          for (const [k, v] of Object.entries(o.data || {})) {
            if (SKIP.has(k)) continue;
            const old = before?.[k];
            if (JSON.stringify(old ?? null) !== JSON.stringify(v ?? null)) changes.push({ k, a: old, b: v });
          }
        }
        return (
          <div key={i} className={`${t.card} p-3 flex flex-col gap-2`}>
            <div className="text-[12px] text-fg-3">
              {o.op === 'delete' ? 'Silinecek' : before ? 'Değişecek' : 'Yeni eklenecek'} · {String((o.data?.title as string) || (before?.title as string) || (o.data?.prompt as string) || o.id).slice(0, 80)}
            </div>
            {o.op === 'delete' && <div className="text-[13px] text-negative">Bu kayıt yayından ve veritabanından kaldırılacak.</div>}
            {changes.length === 0 && o.op !== 'delete' && <div className="text-[13px] text-fg-3">Görünür bir değişiklik yok.</div>}
            {changes.map((c) => (
              <div key={c.k} className="text-[13px] leading-relaxed">
                <span className="text-fg-3">{FIELD[c.k] || c.k}: </span>
                {c.k === 'blocks' && Array.isArray(c.a) && Array.isArray(c.b)
                  ? <span>{blockDiff(c.a as unknown[], c.b as unknown[])}</span>
                  : <>{before && <><span className="line-through text-fg-3">{show(c.a)}</span> → </>}<span className="text-crema">{show(c.b)}</span></>}
              </div>
            ))}
          </div>
        );
      })}
      {lessonPreview && (
        <div className="flex flex-col gap-2">
          <span className={t.label}>Önerilen hâli baristada böyle görünecek</span>
          <div className="rounded-xl border border-line bg-espresso p-4 max-h-[50vh] overflow-y-auto">
            <h1 className="text-[20px] font-bold mb-3">{lessonPreview.title}</h1>
            <LessonBlocks blocks={lessonPreview.blocks || []} />
          </div>
        </div>
      )}
    </Sheet>
  );
};

/** Ders bloklarında kaç blok eklendi, çıktı, değişti. */
function blockDiff(a: unknown[], b: unknown[]): string {
  const sa = a.map((x) => JSON.stringify(x));
  const sb = b.map((x) => JSON.stringify(x));
  const added = sb.filter((x) => !sa.includes(x)).length;
  const removed = sa.filter((x) => !sb.includes(x)).length;
  const parts = [];
  if (added) parts.push(`${added} blok yeni/değişti`);
  if (removed && removed !== added) parts.push(`${removed} blok çıkarıldı`);
  return `${a.length} → ${b.length} blok${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

const RejectSheet: React.FC<{ p: Proposal | null; onClose: () => void }> = ({ p, onClose }) => {
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setNote(''); setErr(null); }, [p]);
  if (!p) return null;
  return (
    <Sheet open title="Öneriyi reddet" onClose={onClose}
      footer={<button className={`${t.btn} ${t.btnDanger} ${t.btnMd}`} onClick={async () => {
        if (note.trim().length < 3) { setErr('Öneriyi yapan kişi neyi düzelteceğini bilsin: kısa bir not yaz.'); return; }
        try { await rejectProposal(p, note); toast('Öneri geri gönderildi'); onClose(); } catch (e) { setErr(errorText(e)); }
      }}>Reddet</button>}>
      <div className="text-[14px] font-medium">{p.title}</div>
      <label className={t.field}>
        <span className={t.label}>Not ({p.createdByName} görecek)</span>
        <textarea className={t.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ölçü 18 gr olmalı; görseli yenile." />
      </label>
      <ErrorText>{err}</ErrorText>
    </Sheet>
  );
};
