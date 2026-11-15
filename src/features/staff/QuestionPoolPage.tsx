import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useQueryLive } from '../../hooks/useFirestore';
import { useContent } from '../../store/content';
import { disableAndRegrade, enableQuestion } from '../../api/regrade';
import { errorText } from '../../api/backend';
import { useHistory, useModuleAttempts } from './staffData';
import { norm } from '../../lib/search';
import { useStaffSession } from './StaffLayout';
import { moduleInDomain, useAllow, useDomain } from '../../lib/permissions';
import { QuestionSheet } from './ContentPages';
import { Page, PageTitle, Section, Sheet, Empty, Badge, Spinner, toast, fmtDateTime } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';
import type { Feedback, Question } from '../../../shared/types';

/**
 * Soru havuzu: bütün sınav soruları tek yerde.
 * Kahve Operasyon Direktörü soruyu görür, düzeltir; hatalı soruyu iptal
 * edince o soruyla girilmiş sınavlar soru çıkarılarak yeniden puanlanır.
 * Kim kaç kez gördü, ne oranda yanlış yaptı, hangi yanlış şıkkı seçti ve
 * soruyla ilgili geri bildirimler de burada.
 */
type Filter = 'hepsi' | 'yanlis' | 'bildirilen' | 'iptal' | 'duzeltilen';

export const QuestionPoolPage: React.FC = () => {
  const me = useStaffSession();
  const allow = useAllow();
  // Düzeltme/iptal: "Soruları düzelt" yetkisi. Alanı sınırlı rol (Operasyon Müdürü) yalnızca kendi yollarını görür.
  const director = allow(me.role, 'soruDuzelt');
  const domain = useDomain(me.role);
  const { modules: allModules } = useContent();
  const modules = useMemo(() => allModules.filter((m) => moduleInDomain(domain, m)), [allModules, domain]);
  const [params, setParams] = useSearchParams();
  const openId = params.get('soru');
  // Kota: bütün havuz (~1.400 soru) her açılışta canlı okunuyordu. Artık bir
  // modül seçili açılır (son seçilen hatırlanır); "Bütün modüller" istek üzerine.
  const [mod, setModRaw] = useState<string>(() => {
    const fromUrl = params.get('modul');
    if (fromUrl) return fromUrl;
    try { const v = localStorage.getItem('soruHavuzu.modul'); if (v !== null) return v; } catch { /* yok */ }
    return '';
  });
  const setMod = (v: string) => { setModRaw(v); try { localStorage.setItem('soruHavuzu.modul', v); } catch { /* yok */ } };
  const sortedMods = useMemo(() => [...modules].sort((a, b) => a.order - b.order), [modules]);
  // Seçim yoksa ya da hatırlanan modül artık yoksa / alan dışındaysa ilk modül.
  useEffect(() => {
    if (!sortedMods.length || mod === '*') return;
    if (!mod || !sortedMods.some((m) => m.id === mod)) setModRaw(sortedMods[0].id);
  }, [sortedMods, mod]);
  // Bağlantıyla gelen soru başka modüldeyse o modüle geç.
  useEffect(() => {
    if (!openId || params.get('modul')) return;
    getDoc(doc(db, 'questions', openId)).then((sn) => { const m = sn.exists() ? (sn.data() as Question).moduleId : null; if (m) setModRaw(m); }).catch(() => {});
  }, [openId, params]);
  const all = mod === '*';
  const { data: allQuestions, loading } = useQueryLive<Question>(
    !mod ? null : all ? query(collection(db, 'questions')) : query(collection(db, 'questions'), where('moduleId', '==', mod)), `question-pool-${mod}`);
  const questions = useMemo(() => (domain ? allQuestions.filter((q) => modules.some((m) => m.id === q.moduleId)) : allQuestions), [allQuestions, modules, domain]);
  // Geri bildirimler: son 300 (eskiden hepsi canlı).
  const { data: feedback } = useQueryLive<Feedback>(allow(me.role, 'ekran.geriBildirim') ? query(collection(db, 'feedback'), orderBy('createdAt', 'desc'), limit(300)) : null, 'pool-feedback');
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<Filter>('hepsi');

  // Kullanım: kaç kez soruldu, kaç kez yanlış, hangi şık seçildi. Seçili modülün
  // BÜTÜN sınavlarından (eskiden zincirin son 300 sınavından).
  const modAttempts = useModuleAttempts(mod && !all ? mod : null);
  const history = useHistory(all);
  const attempts = (all ? history.data?.attempts : modAttempts.data) || [];
  const usage = useMemo(() => {
    const m = new Map<string, { asked: number; wrong: number; picks: Map<number | null, number> }>();
    for (const a of attempts) {
      if (!a.submittedAt || a.voided) continue;
      for (const id of a.questionIds || []) {
        const u = m.get(id) || { asked: 0, wrong: 0, picks: new Map() };
        u.asked++;
        m.set(id, u);
      }
      for (const x of a.mistakes || []) {
        const u = m.get(x.questionId) || { asked: 1, wrong: 0, picks: new Map() };
        u.wrong++;
        u.picks.set(x.given, (u.picks.get(x.given) || 0) + 1);
        m.set(x.questionId, u);
      }
    }
    return m;
  }, [attempts]);
  const reports = useMemo(() => {
    const m = new Map<string, Feedback[]>();
    feedback.filter((f) => f.questionId).forEach((f) => m.set(f.questionId!, [...(m.get(f.questionId!) || []), f]));
    return m;
  }, [feedback]);

  // Türkçe ve aksan katlamalı arama ("sut" → "süt", "ICECEK" → "içecek").
  const list = useMemo(() => {
    const nt = norm(text);
    let xs = questions.filter((q) => (all || q.moduleId === mod) && (!nt || norm(q.prompt + ' ' + q.options.join(' ')).includes(nt)));
    if (filter === 'iptal') xs = xs.filter((q) => q.disabled);
    if (filter === 'duzeltilen') xs = xs.filter((q) => q.edited);
    if (filter === 'bildirilen') xs = xs.filter((q) => reports.has(q.id));
    if (filter === 'yanlis') xs = xs.filter((q) => (usage.get(q.id)?.wrong || 0) > 0)
      .sort((a, b) => (usage.get(b.id)!.wrong / Math.max(1, usage.get(b.id)!.asked)) - (usage.get(a.id)!.wrong / Math.max(1, usage.get(a.id)!.asked)));
    return xs.slice(0, 200);
  }, [questions, mod, all, text, filter, usage, reports]);

  const current = questions.find((q) => q.id === openId) || null;
  const open = (id: string | null) => setParams(id ? { soru: id } : {}, { replace: true });
  const usageLoading = all ? history.loading : modAttempts.loading;
  const modTitle = (id: string) => modules.find((m) => m.id === id)?.title || id;

  return (
    <Page wide>
      <PageTitle title="Soru havuzu" subtitle={`${all ? 'Bütün modüller' : modTitle(mod)} · ${questions.length} soru · ${questions.filter((q) => q.disabled).length} iptal · ${questions.filter((q) => q.edited).length} düzeltilmiş`} />

      <div className="flex flex-wrap gap-2 items-center">
        <input className={`${t.input} h-9 w-64 text-[14px]`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Soru ya da şıkta ara" />
        <select className={`${t.input} h-9 w-auto text-[14px]`} value={mod} onChange={(e) => setMod(e.target.value)} aria-label="Modül">
          {sortedMods.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          <option value="*">Bütün modüller</option>
        </select>
        <div className={t.segment}>
          {([['hepsi', 'Hepsi'], ['yanlis', 'En çok yanlış'], ['bildirilen', `Bildirilen · ${reports.size}`], ['iptal', 'İptal'], ['duzeltilen', 'Düzeltilen']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`${t.segmentItem} ${filter === k ? t.segmentItemOn : t.segmentItemOff}`}>{l}</button>
          ))}
        </div>
      </div>

      <Section>
        {loading || !mod ? <div className="py-10 flex justify-center"><Spinner /></div> : list.length === 0 ? <Empty icon="target" text="Bu süzgece uyan soru yok." /> : (
          <div className={t.listGroup}>
            {list.map((q) => {
              const u = usage.get(q.id);
              const r = reports.get(q.id)?.length || 0;
              return (
                <button key={q.id} onClick={() => open(q.id)} className={`${t.listRow} items-start text-left ${q.disabled ? 'opacity-60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13.5px] font-medium leading-snug ${q.disabled ? 'line-through' : ''}`}>{q.prompt}</div>
                    <div className="text-[12px] text-fg-3 mt-1">{modTitle(q.moduleId)} · Doğru: <span className="text-positive">{q.options[q.answer]}</span></div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {usageLoading ? <span className="text-[12px] text-fg-4">…</span> : u ? <span className="text-[12px] tnum text-fg-2">{u.asked} kez · <span className={u.wrong ? 'text-negative' : ''}>%{Math.round((u.wrong / Math.max(1, u.asked)) * 100)} yanlış</span></span> : <span className="text-[12px] text-fg-4">henüz sorulmadı</span>}
                    <span className="flex gap-1">
                      {q.disabled && <Badge tone="negative">İptal</Badge>}
                      {q.edited && <Badge tone="positive">Düzeltildi</Badge>}
                      {r > 0 && <Badge tone="caution">{r} bildirim</Badge>}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {list.length === 200 && <p className="text-[12px] text-fg-3 mt-2">İlk 200 soru gösteriliyor; aramayı ya da modülü daraltın.</p>}
      </Section>

      <QuestionDetail q={current} onClose={() => open(null)} usage={current ? usage.get(current.id) : undefined}
        reports={current ? reports.get(current.id) || [] : []} director={director} meName={me.name} meRole={me.role} modTitle={modTitle} />
    </Page>
  );
};

const QuestionDetail: React.FC<{
  q: Question | null; onClose: () => void; director: boolean; meName: string; meRole: string; modTitle: (id: string) => string;
  usage?: { asked: number; wrong: number; picks: Map<number | null, number> }; reports: Feedback[];
}> = ({ q, onClose, usage, reports, director, meName, meRole, modTitle }) => {
  const [editing, setEditing] = useState<Partial<Question> | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCancelling(false); setReason(''); }, [q?.id]);

  const cancel = async () => {
    if (!q) return;
    if (reason.trim().length < 3) { toast('İptal nedenini kısaca yaz.', 'negative'); return; }
    setBusy(true);
    try {
      const r = await disableAndRegrade(q, reason.trim(), { name: meName, role: meRole });
      toast(`Soru iptal edildi. ${r.changed ? `${r.changed} sınavın puanı yükseldi` : 'Hiçbir sınavın puanı değişmedi'}${r.nowPassed ? `, ${r.nowPassed} sınav artık geçti` : ''}.`, 'positive');
      setCancelling(false);
    } catch (e) {
      toast(errorText(e), 'negative');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={!!q && !editing} title="Soru" onClose={onClose}>
        {q && (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-[12px] text-fg-3">{modTitle(q.moduleId)}{q.kind ? ` · ${q.kind}` : ''}</div>
              <p className="text-[15px] font-semibold leading-snug mt-1">{q.prompt}</p>
              {q.disabled && <p className="text-[12.5px] text-negative mt-1.5">İptal edildi: {q.disabledReason}{q.disabledByName ? ` · ${q.disabledByName}` : ''} · {fmtDateTime(q.disabledAt)}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              {q.options.map((o, i) => {
                const n = usage?.picks.get(i) || 0;
                return (
                  <div key={i} className={`rounded-lg border px-3 py-2 text-[13px] flex items-center gap-2 ${i === q.answer ? 'border-positive-line bg-positive-bg' : n ? 'border-negative-line bg-negative-bg' : 'border-line'}`}>
                    <span className="flex-1">{o}</span>
                    {i === q.answer ? <Badge tone="positive">Doğru</Badge> : n ? <span className="text-negative font-semibold tnum">{n} kişi seçti</span> : null}
                  </div>
                );
              })}
            </div>
            {q.explanation && <p className="text-[12.5px] text-fg-2 leading-relaxed">Açıklama: {q.explanation}</p>}
            <div className="text-[12.5px] text-fg-3">
              {usage ? `${usage.asked} kez soruldu · ${usage.wrong} yanlış` : 'Henüz sorulmadı'} (tüm zamanlar)
            </div>

            {reports.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className={t.sectionLabel}>Bildirimler · {reports.length}</span>
                {reports.map((f) => (
                  <div key={f.id} className="rounded-lg bg-panel-2 px-3 py-2 text-[13px]">
                    <div>{f.text}</div>
                    <div className="text-[11.5px] text-fg-3 mt-0.5">{[f.byName, f.storeName, fmtDateTime(f.createdAt)].filter(Boolean).join(' · ')}</div>
                  </div>
                ))}
              </div>
            )}

            {director ? (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <div className="flex flex-wrap gap-2">
                  <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setEditing(q)}><Icon name="edit" size={14} /> Düzelt</button>
                  {q.disabled
                    ? <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => enableQuestion(q.id).then(() => toast('Soru yeniden sınavlarda.'), (e) => toast(errorText(e), 'negative'))}>İptali kaldır</button>
                    : <button className={`${t.btn} ${t.btnDanger} ${t.btnMd}`} onClick={() => setCancelling(true)}>İptal et ve sınavları yeniden puanla</button>}
                </div>
                {cancelling && (
                  <div className="flex flex-col gap-2 rounded-xl border border-negative-line bg-negative-bg p-3">
                    <p className="text-[12.5px] text-fg-2 leading-relaxed">Soru sınavlara artık gelmez. Bu soruyla girilmiş sınavlar yeniden puanlanır: soruyu doğru yapanın puanı değişmez, yanlış ya da boş bırakanın puanı yükselir; sınırda kalanlar geçebilir.</p>
                    <input className={t.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Neden? Ör. 8 oz / 12 oz belirtilmemiş" />
                    <div className="flex gap-2 justify-end">
                      <button className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} onClick={() => setCancelling(false)}>Vazgeç</button>
                      <button className={`${t.btn} ${t.btnDanger} ${t.btnSm}`} disabled={busy} onClick={cancel}>{busy ? <Spinner size={13} /> : 'İptal et ve puanla'}</button>
                    </div>
                  </div>
                )}
                <Link to={`/icerik/modul/${q.moduleId}?sekme=sorular`} className="text-[12.5px] text-fg-3 underline underline-offset-2 self-start">Modülün soru bankasında aç</Link>
              </div>
            ) : (
              <div className="border-t border-line pt-3 flex gap-2">
                <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setEditing(q)}><Icon name="edit" size={14} /> Düzeltme öner</button>
                <span className="text-[12px] text-fg-3 self-center">Düzeltme Kahve Operasyon Direktörü onaylayınca yayına girer.</span>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <QuestionSheet value={editing} onClose={() => setEditing(null)} />
    </>
  );
};
