import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { errorText } from '../../api/backend';
import { askBoardQuestion, closeBoardQuestion, replyBoardQuestion, TO_LABEL, TOPIC_LABEL, topicLink } from '../../api/board';
import { useQueryLive } from '../../hooks/useFirestore';
import { Avatar, Badge, Empty, ErrorText, Page, PageTitle, Section, Sheet, Spinner, toast, fmtDateTime } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';
import type { BoardQuestion, BoardTopic, StaffRole } from '../../../shared/types';

/**
 * Yönetim Kurulu soruları — iki taraf aynı bileşeni kullanır:
 *   board: kurul üyesi sorar, ek soru yazar, "Tamam, kapat" der
 *   ops:   Kahve Operasyon Direktörü / Bölge Müdürü yanıtlar
 */

export function useBoardQuestions(enabled = true) {
  return useQueryLive<BoardQuestion>(
    enabled ? query(collection(db, 'boardQuestions'), orderBy('updatedAt', 'desc'), limit(300)) : null,
    enabled ? 'board-questions' : 'board-questions-off'
  );
}

/** Soru bana mı soruldu (operasyon tarafı rozet ve süzgeç için). */
export const askedTo = (q: BoardQuestion, role: StaffRole) =>
  q.to === 'both' || role === 'developer' || role === 'admin' || q.to === role;

export const STATUS_LABEL: Record<BoardQuestion['status'], { label: string; tone: 'caution' | 'positive' | 'neutral' }> = {
  open: { label: 'Yanıt bekliyor', tone: 'caution' },
  answered: { label: 'Yanıtlandı', tone: 'positive' },
  closed: { label: 'Kapandı', tone: 'neutral' }
};

interface Person { id: string; name: string; role: StaffRole; active: boolean }

/** Kurul üyesinin soru sorma penceresi. Konu, açıldığı ekrandan gelir. */
export const AskSheet: React.FC<{ topic: BoardTopic | null; me: { uid: string; name: string }; onClose: () => void; onSent?: () => void }> = ({ topic, me, onClose, onSent }) => {
  const { data: people } = useQueryLive<Person>(query(collection(db, 'users'), where('role', 'in', ['director', 'regional'])), 'board-ask-people');
  const nameOf = (r: 'director' | 'regional') => people.filter((p) => p.active && p.role === r).map((p) => p.name).join(', ');
  const [to, setTo] = useState<BoardQuestion['to']>('director');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(''); setError(null); setTo(topic?.kind === 'request' ? 'regional' : 'director'); }, [topic]);

  const send = async () => {
    if (!topic) return;
    if (text.trim().length < 3) return setError('Sorunu yaz.');
    setBusy(true);
    try {
      await askBoardQuestion({ topic, to, text, by: me });
      toast('Soru iletildi. Yanıt gelince "Sorularım"da görünür.', 'positive');
      onSent?.();
      onClose();
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };

  const options: { id: BoardQuestion['to']; label: string; who: string }[] = [
    { id: 'director', label: TO_LABEL.director, who: nameOf('director') },
    { id: 'regional', label: TO_LABEL.regional, who: nameOf('regional') },
    { id: 'both', label: 'İkisine birden', who: [nameOf('director'), nameOf('regional')].filter(Boolean).join(' ve ') }
  ];

  return (
    <Sheet open={!!topic} title="Bu konuyu sor" onClose={onClose}
      footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={send} disabled={busy}>{busy ? <Spinner size={14} /> : <><Icon name="send" size={14} /> Gönder</>}</button>}>
      {topic && (
        <div className={`${t.panel} px-3.5 py-3`}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">{TOPIC_LABEL[topic.kind]}</div>
          <div className="text-[14px] font-medium leading-snug mt-0.5">{topic.title}</div>
        </div>
      )}
      <div className={t.field}>
        <span className={t.label}>Kime</span>
        <div className="flex flex-col gap-1.5">
          {options.map((o) => (
            <label key={o.id} className="flex items-start gap-2 text-[13px] cursor-pointer">
              <input type="radio" checked={to === o.id} onChange={() => setTo(o.id)} className="mt-0.5" />
              <span><strong>{o.label}</strong>{o.who && <span className="text-fg-3"> · {o.who}</span>}</span>
            </label>
          ))}
        </div>
      </div>
      <label className={t.field}>
        <span className={t.label}>Sorun</span>
        <textarea className={t.textarea} value={text} onChange={(e) => setText(e.target.value)} autoFocus
          placeholder="Bu konu ne oldu? Ne zaman çözülür? Neye ihtiyaç var?" />
      </label>
      <p className="text-[12px] text-fg-3 leading-relaxed">Soru, yazışmasıyla birlikte kayıt olarak kalır; kurulun diğer üyeleri de görür.</p>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};

/** Yazışma ve yanıt kutusu. */
export const QuestionThread: React.FC<{ q: BoardQuestion; side: 'board' | 'ops'; me: { uid: string; name: string } }> = ({ q, side, me }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setText(''), [q.id]);
  const link = side === 'ops' ? topicLink(q.topic) : null;

  const reply = async () => {
    if (!text.trim()) return;
    setBusy('send');
    try { await replyBoardQuestion(q, side, text, me); setText(''); }
    catch (e) { toast(errorText(e), 'negative'); }
    setBusy(null);
  };
  const close = async () => {
    setBusy('close');
    try { await closeBoardQuestion(q); toast('Soru kapatıldı'); }
    catch (e) { toast(errorText(e), 'negative'); }
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={`${t.panel} px-3.5 py-3 flex items-start gap-3`}>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">{TOPIC_LABEL[q.topic.kind]} · {TO_LABEL[q.to]}</div>
          <div className="text-[14px] font-medium leading-snug mt-0.5">{q.topic.title}</div>
        </div>
        {link && <Link to={link} className={`${t.btn} ${t.btnSecondary} ${t.btnSm} shrink-0`}>Konuyu aç</Link>}
      </div>
      <div className="flex flex-col gap-2">
        {q.messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.side === side ? 'flex-row-reverse text-right' : ''}`}>
            <Avatar name={m.byName} size={26} />
            <div className={`max-w-[85%] rounded-xl px-3 py-2 border border-line ${m.side === 'ops' ? 'bg-panel-3' : 'bg-panel'}`}>
              <div className="text-[11px] text-fg-3">{m.byName} · {fmtDateTime(m.at)}</div>
              <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-left">{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <textarea className={`${t.textarea} min-h-20`} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={side === 'ops' ? 'Kurula yanıt: durum, sonraki adım, tarih…' : q.status === 'closed' ? 'Soru kapandı. Yeniden sormak için yaz…' : 'Ek soru ya da not yaz…'} />
      <div className="flex flex-wrap gap-2 justify-end">
        {side === 'board' && q.status === 'answered' && (
          <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} disabled={!!busy} onClick={close}>
            {busy === 'close' ? <Spinner size={13} /> : <><Icon name="check" size={13} /> Tamam, kapat</>}
          </button>
        )}
        <button className={`${t.btn} ${t.btnPrimary} ${t.btnSm}`} disabled={!!busy || !text.trim()} onClick={reply}>
          {busy === 'send' ? <Spinner size={13} /> : <><Icon name="send" size={13} /> {side === 'ops' ? 'Yanıtla' : 'Gönder'}</>}
        </button>
      </div>
    </div>
  );
};

const Row: React.FC<{ q: BoardQuestion; side: 'board' | 'ops'; onOpen: () => void }> = ({ q, side, onOpen }) => {
  const last = q.messages[q.messages.length - 1];
  const waiting = side === 'ops' ? q.status === 'open' : q.status === 'answered';
  return (
    <button onClick={onOpen} className={`${t.cardInteractive} p-4 text-left flex flex-col gap-1.5`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={STATUS_LABEL[q.status].tone}>{STATUS_LABEL[q.status].label}</Badge>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">{TOPIC_LABEL[q.topic.kind]}</span>
        {waiting && <span className="w-2 h-2 rounded-full bg-crema" aria-label="yeni" />}
        <span className="ml-auto text-[11px] text-fg-3">{fmtDateTime(q.updatedAt)}</span>
      </div>
      <div className="text-[14px] font-medium leading-snug">{q.topic.title}</div>
      <div className="text-[12.5px] text-fg-2 leading-relaxed line-clamp-2"><b className="font-medium">{last.byName}:</b> {last.text}</div>
      <div className="text-[11.5px] text-fg-3">{q.createdByName} sordu · {TO_LABEL[q.to]} · {q.messages.length} mesaj</div>
    </button>
  );
};

/** Soru listesi sayfası: kurulda "Sorularım", operasyonda "Kurul soruları". */
export const BoardQuestionsPage: React.FC<{ side: 'board' | 'ops'; me: { uid: string; name: string; role: StaffRole } }> = ({ side, me }) => {
  const { data, loading } = useBoardQuestions();
  const [params, setParams] = useSearchParams();
  const openId = params.get('soru');
  const [tab, setTab] = useState<'waiting' | 'all' | 'closed'>('waiting');
  const [mine, setMine] = useState(side === 'ops');
  const [asking, setAsking] = useState<BoardTopic | null>(null);

  const scoped = useMemo(() => (side === 'ops' && mine ? data.filter((q) => askedTo(q, me.role)) : data), [data, side, mine, me.role]);
  const waiting = scoped.filter((q) => (side === 'ops' ? q.status === 'open' : q.status !== 'closed'));
  const list = tab === 'waiting' ? waiting : tab === 'closed' ? scoped.filter((q) => q.status === 'closed') : scoped;
  const current = data.find((q) => q.id === openId) || null;
  const open = (id: string | null) => setParams(id ? { soru: id } : {}, { replace: true });

  return (
    <Page wide>
      <PageTitle
        title={side === 'board' ? 'Sorularım' : 'Kurul soruları'}
        subtitle={side === 'board'
          ? 'Kahve Operasyonu\'na sorduğunuz konular ve yanıtları. Kurulun bütün üyeleri bütün soruları görür.'
          : 'Yönetim Kurulu\'nun "bu konu ne oldu?" soruları. Yanıtınız kurulun bütün üyelerine görünür.'}
        action={side === 'board' ? (
          <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setAsking({ kind: 'general', title: 'Genel soru' })}>
            <Icon name="plus" size={15} /> Yeni soru
          </button>
        ) : undefined} />

      <div className="flex flex-wrap gap-2 items-center">
        <div className={t.segment}>
          <button className={`${t.segmentItem} ${tab === 'waiting' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('waiting')}>
            {side === 'ops' ? 'Yanıt bekleyen' : 'Açık'} · {waiting.length}
          </button>
          <button className={`${t.segmentItem} ${tab === 'all' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('all')}>Hepsi · {scoped.length}</button>
          <button className={`${t.segmentItem} ${tab === 'closed' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('closed')}>Kapanan</button>
        </div>
        {side === 'ops' && me.role !== 'developer' && me.role !== 'admin' && (
          <label className="flex items-center gap-2 text-[13px] text-fg-2 cursor-pointer">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Yalnızca bana sorulanlar
          </label>
        )}
      </div>

      <Section>
        {loading ? <div className="py-10 flex justify-center"><Spinner /></div>
          : list.length === 0 ? (
            <Empty icon="message" text={side === 'board'
              ? 'Henüz soru yok. Süren işlerde ya da gidişatta bir konunun yanındaki "Sor" düğmesiyle sorabilirsiniz.'
              : tab === 'waiting' ? 'Yanıt bekleyen kurul sorusu yok.' : 'Kurul sorusu yok.'} />
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((q) => <Row key={q.id} q={q} side={side} onOpen={() => open(q.id)} />)}
            </div>
          )}
      </Section>

      <Sheet open={!!current} title={current ? STATUS_LABEL[current.status].label : ''} onClose={() => open(null)}>
        {current && <QuestionThread q={current} side={side} me={me} />}
      </Sheet>
      {side === 'board' && <AskSheet topic={asking} me={me} onClose={() => setAsking(null)} />}
    </Page>
  );
};
