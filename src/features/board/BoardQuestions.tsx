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
import { useStaffData } from '../staff/staffData';
import { forBoard } from '../../lib/boardStats';
import { closedOf } from '../../lib/requestStats';
import { catOf, STATUS } from '../../api/requests';
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
  q.to === 'all' || q.to === 'both' || role === 'developer' || role === 'admin' || q.to === role;

export const STATUS_LABEL: Record<BoardQuestion['status'], { label: string; tone: 'caution' | 'positive' | 'neutral' }> = {
  open: { label: 'Yanıt bekliyor', tone: 'caution' },
  answered: { label: 'Yanıtlandı', tone: 'positive' },
  closed: { label: 'Kapandı', tone: 'neutral' }
};

interface Person { id: string; name: string; role: StaffRole; active: boolean }
export interface OpsPeople { director: string; opsmanager: string; regional: string }

/** Kahve Operasyon Direktörü ve Bölge Müdürü'nün adları (kurul bu ikisini listeleyebilir). */
export function useOpsPeople(): OpsPeople {
  const { data } = useQueryLive<Person>(query(collection(db, 'users'), where('role', 'in', ['director', 'opsmanager', 'regional'])), 'board-ops-people');
  const nameOf = (r: 'director' | 'opsmanager' | 'regional') => data.filter((p) => p.active && p.role === r).map((p) => p.name).join(', ');
  return { director: nameOf('director'), opsmanager: nameOf('opsmanager'), regional: nameOf('regional') };
}

/**
 * Kurul üyesinin soru sorma penceresi. Bir konunun yanındaki "Sor"dan
 * açılınca konu sabittir; "Yeni soru"dan açılınca (konu başlığı boş) kurul
 * açık taleplerden birini seçer ya da kendi konusunu yazar.
 */
export const AskSheet: React.FC<{ topic: BoardTopic | null; me: { uid: string; name: string }; onClose: () => void; onSent?: () => void }> = ({ topic, me, onClose, onSent }) => {
  const people = useOpsPeople();
  const requests = useStaffData((x) => x.requests);
  const open = useMemo(() => requests.filter((r) => forBoard(r) && !closedOf(r))
    .sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1) || a.createdAt - b.createdAt), [requests]);
  const picking = !!topic && topic.kind === 'general' && !topic.title;
  const [picked, setPicked] = useState<string>('');      // talep id ya da 'diger'
  const [own, setOwn] = useState('');
  const [to, setTo] = useState<BoardQuestion['to']>('director');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(''); setOwn(''); setPicked(''); setError(null); setTo(topic?.kind === 'request' ? 'regional' : 'director'); }, [topic]);

  const chosen: BoardTopic | null = !topic ? null : !picking ? topic
    : picked === 'diger' ? { kind: 'general', title: own.trim() }
      : (() => { const r = open.find((x) => x.id === picked); return r ? { kind: 'request', id: r.id, title: `${r.storeName}: ${r.title}` } : null; })();

  const send = async () => {
    if (!chosen || !chosen.title) return setError(picking && picked === 'diger' ? 'Konuyu kısaca yaz.' : 'Bir konu seç.');
    if (text.trim().length < 3) return setError('Sorunuzu yazın.');
    setBusy(true);
    try {
      await askBoardQuestion({ topic: chosen, to, text, by: me });
      toast('Soru iletildi. Yanıt gelince "Sorularım"da görünür.', 'positive');
      onSent?.();
      onClose();
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };

  const options: { id: BoardQuestion['to']; label: string; who: string }[] = [
    { id: 'director', label: TO_LABEL.director, who: people.director },
    { id: 'opsmanager', label: TO_LABEL.opsmanager, who: people.opsmanager },
    { id: 'regional', label: TO_LABEL.regional, who: people.regional },
    { id: 'all', label: 'Hepsine', who: 'Hepsine' }
  ];
  const choice = (on: boolean) => `w-full text-left rounded-xl border px-4 py-3 transition-colors ${on ? 'border-crema bg-panel-3 ring-1 ring-crema/40' : 'border-line bg-panel hover:bg-panel-2'}`;

  return (
    <Sheet open={!!topic} title={picking ? 'Yeni soru' : 'Bu konuyu sor'} onClose={onClose}
      footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`} onClick={send} disabled={busy}>{busy ? <Spinner size={16} /> : <><Icon name="send" size={16} /> Gönder</>}</button>}>
      {topic && !picking && (
        <div className={`${t.panel} px-4 py-3`}>
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-3">{TOPIC_LABEL[topic.kind]}</div>
          <div className="text-[16px] font-semibold leading-snug mt-0.5">{topic.title}</div>
        </div>
      )}
      {picking && (
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold text-fg-2">Hangi konu?</span>
          <div className="flex flex-col gap-2 max-h-[38vh] overflow-y-auto pr-1">
            {open.map((r) => (
              <button key={r.id} type="button" onClick={() => setPicked(r.id)} className={choice(picked === r.id)}>
                <div className="flex items-center gap-2 text-[12.5px] text-fg-3">
                  <span className="font-semibold uppercase tracking-[0.05em]">{catOf(r.category).label}</span>
                  {r.priority === 'urgent' && <Badge tone="negative">Acil</Badge>}
                  <span className="ml-auto">{STATUS[r.status].label}</span>
                </div>
                <div className="text-[15px] font-semibold leading-snug mt-1">{r.storeName}: {r.title}</div>
              </button>
            ))}
            <button type="button" onClick={() => setPicked('diger')} className={choice(picked === 'diger')}>
              <div className="text-[15px] font-semibold flex items-center gap-2"><Icon name="plus" size={15} /> Başka bir konu</div>
              <div className="text-[13px] text-fg-3 mt-0.5">Talepler dışında merak ettiğiniz bir şey</div>
            </button>
          </div>
          {picked === 'diger' && (
            <input className={`${t.input} h-11 text-[15px]`} value={own} onChange={(e) => setOwn(e.target.value)} autoFocus
              placeholder="Konu: ör. Pendik'in eğitim ilerlemesi" />
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold text-fg-2">Kime?</span>
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => (
            <button key={o.id} type="button" onClick={() => setTo(o.id)} className={choice(to === o.id)}>
              <div className="text-[15px] font-semibold leading-snug">{o.who || o.label}</div>
              <div className="text-[12.5px] text-fg-3 mt-0.5 leading-snug">{o.id === 'all' ? 'Direktör, Operasyon Müdürü ve Bölge Müdürü' : o.label}</div>
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold text-fg-2">Sorunuz</span>
        <textarea className={`${t.textarea} text-[15px] min-h-28`} value={text} onChange={(e) => setText(e.target.value)} autoFocus={!picking}
          placeholder="Bu konu ne oldu? Ne zaman çözülür? Neye ihtiyaç var?" />
      </label>
      <p className="text-[13px] text-fg-3 leading-relaxed">Soru, yazışmasıyla birlikte kayıt olarak kalır; kurulun diğer üyeleri de görür.</p>
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
              <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-left">{m.text}</div>
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
    <button onClick={onOpen} className={`${t.cardInteractive} p-5 text-left flex flex-col gap-2`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={STATUS_LABEL[q.status].tone}>{STATUS_LABEL[q.status].label}</Badge>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3">{TOPIC_LABEL[q.topic.kind]}</span>
        {waiting && <span className="w-2 h-2 rounded-full bg-crema" aria-label="yeni" />}
        <span className="ml-auto text-[11px] text-fg-3">{fmtDateTime(q.updatedAt)}</span>
      </div>
      <div className="text-[17px] font-semibold leading-snug">{q.topic.title}</div>
      <div className="text-[14px] text-fg-2 leading-relaxed line-clamp-2"><b className="font-medium text-crema">{last.byName}:</b> {last.text}</div>
      <div className="text-[13px] text-fg-3">{q.createdByName} sordu · {TO_LABEL[q.to]} · {q.messages.length} mesaj</div>
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
          <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setAsking({ kind: 'general', title: '' })}>
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
