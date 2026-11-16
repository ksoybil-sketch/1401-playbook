import React, { useEffect, useMemo, useState } from 'react';
import { badgeReport, fromBarista, resolveConfig } from '../../lib/badges';
import { useBadgeConfig } from '../../store/badgeConfig';
import { TitleCard, BadgeGrid, TitleChip } from '../shared/Badges';
import { BadgeOverridesSheet } from './BadgeOverridesSheet';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, getDoc, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { backend, errorText } from '../../api/backend';
import { useContent } from '../../store/content';
import { useQueryLive } from '../../hooks/useFirestore';
import { assignmentDone, assignmentDoneAt, isOverdue, overallPercent, moduleState, visibleModules } from '../../lib/progress';
import { taskInvalidReason, taskTargets, TASK_INVALID_LABEL, type TaskValidityContext } from '../../lib/taskValidity';
import { localDay } from '../../lib/day';
import { norm } from '../../lib/search';
import { Icon } from '../../ui/Icon';
import { Page, PageTitle, Section, Stat, Empty, Badge, Avatar, ProgressBar, Sheet, ErrorText, Spinner, toast, fmtDate, fmtDateTime, relDays, useShowMore, ShowMore, MAX } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { AssignSheet } from '../shared/AssignSheet';
import { AttemptRow } from '../barista/HomePages';
import { askedTo, useBoardQuestions } from '../board/BoardQuestions';
import {
  useStaffData, useExamsSince, useFetched, useBaristaAttempts, useStoreAssignments, useHistory, useHistoryIfLoaded,
  loadBaristaAttempts, loadStoreAssignments, loadOlderAssignments, invalidate, loadOverviewExams, dayStart, isFetched, examsSinceKey,
  type OverviewExams
} from './staffData';
import { isClosed } from '../../api/requests';
import { useStaffSession } from './StaffLayout';
import type { Assignment, Attempt, Barista, BaristaRole, Progress, Question, StaffRole } from '../../../shared/types';
import { allowed, domainOf } from '../../lib/permissions';
import { can, assignableRoles, authorName, visibleStaffRoles, STAFF_ROLE_LABEL, BARISTA_ROLE_LABEL, BARISTA_ROLES } from '../../lib/roles';

const EMPTY: Progress = { baristaId: '', storeId: '', lessons: {}, modules: {}, updatedAt: 0 };

/* ------------------------------------------------------------------ */
/* Davet kodu gösterimi                                                */
/* ------------------------------------------------------------------ */

export const CodeSheet: React.FC<{ code: { code: string; expiresAt: number; title: string; hint: string } | null; onClose: () => void }> = ({ code, onClose }) => {
  // Pano izni yoksa (http, bazı WebView'ler) kopyalama hata veriyor ama
  // "Kopyalandı" deniyordu: hata yakalanır, kod seçili bir kutuda gösterilir.
  const [copyFailed, setCopyFailed] = useState(false);
  const boxRef = React.useRef<HTMLInputElement>(null);
  useEffect(() => { setCopyFailed(false); }, [code?.code]);
  useEffect(() => { if (copyFailed) boxRef.current?.select(); }, [copyFailed]);
  const copy = async () => {
    if (!code) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('pano yok');
      await navigator.clipboard.writeText(code.code);
      toast('Kopyalandı', 'positive');
    } catch {
      setCopyFailed(true);
      toast('Kopyalanamadı. Kodu seçip kendin kopyala.', 'negative');
    }
  };
  return (
  <Sheet open={!!code} title={code?.title || ''} onClose={onClose}
    footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={onClose}>Tamam</button>}>
    {code && (
      <>
        <div className="flex items-center justify-center gap-2 py-4">
          {code.code.split('').map((d, i) => (
            <span key={i} className="w-11 h-14 rounded-lg border border-line-2 bg-panel-2 flex items-center justify-center text-[28px] font-bold tnum">{d}</span>
          ))}
        </div>
        <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd} self-center`} onClick={copy}>
          <Icon name="copy" size={14} /> Kopyala
        </button>
        {copyFailed && (
          <label className={t.field}>
            <span className={t.label}>Kodu seçip kopyala</span>
            <input ref={boxRef} readOnly value={code.code} onFocus={(e) => e.currentTarget.select()} className={`${t.input} text-center tnum font-semibold tracking-[0.2em]`} />
          </label>
        )}
        <p className="text-[13px] text-fg-2 leading-relaxed">{code.hint}</p>
        <p className="text-[12px] text-fg-3">Geçerlilik: {fmtDateTime(code.expiresAt)}. Kod tek kullanımlıktır.</p>
      </>
    )}
  </Sheet>
  );
};

const inviteHint = (name: string) =>
  `${name}, mağaza telefonunda "Yeni misin?" seçeneğine dokunup bu kodu girecek ve kendi 4 haneli PIN'ini belirleyecek. Kodu WhatsApp veya SMS ile kendisine iletebilirsin.`;

/* ------------------------------------------------------------------ */
/* Genel bakış                                                         */
/* ------------------------------------------------------------------ */

interface MissedQuestion {
  questionId: string; prompt: string; options: string[]; answerIndex: number; answer: string;
  module: string; moduleId: string; n: number;
  who: { baristaId: string; name: string; storeId: string; at: number; given: number | null }[];
}

/** Yanlış yapılan bir soru: hangi şık kaç kez seçildi, kim seçti. */
const MissedSheet: React.FC<{ q: MissedQuestion | null; onClose: () => void; storeName: (id: string) => string; days: number }> = ({ q, onClose, storeName, days }) => {
  const me = useStaffSession();
  const seesBaristas = allowed(me.role, 'ekran.baristalar');
  const seesPool = allowed(me.role, 'ekran.soruHavuzu');
  const counts = new Map<number | null, number>();
  q?.who.forEach((w) => counts.set(w.given, (counts.get(w.given) || 0) + 1));
  const max = Math.max(1, ...counts.values());
  const label = (i: number | null) => (i === null || i === undefined ? 'Boş bıraktı' : q!.options[i] ?? '—');
  return (
    <Sheet open={!!q} title="Yanlış yapılan soru" onClose={onClose}>
      {q && (
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-[12px] text-fg-3">{q.module} · son {days} gün · {q.n} yanlış</div>
            <p className="text-[15px] font-semibold leading-snug mt-1">{q.prompt}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            {q.options.map((o, i) => {
              const n = counts.get(i) || 0;
              const right = i === q.answerIndex;
              return (
                <div key={i} className={`rounded-lg border px-3 py-2 ${right ? 'border-positive-line bg-positive-bg' : n ? 'border-negative-line bg-negative-bg' : 'border-line'}`}>
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="flex-1">{o}</span>
                    {right ? <Badge tone="positive">Doğru</Badge> : n ? <span className="tnum font-semibold text-negative">{n} kişi</span> : null}
                  </div>
                  {!right && n > 0 && <div className="h-1.5 rounded-full bg-negative/60 mt-1.5" style={{ width: `${(n / max) * 100}%` }} />}
                </div>
              );
            })}
            {counts.get(null) ? <div className="text-[12.5px] text-fg-3 px-1">{counts.get(null)} kişi boş bıraktı</div> : null}
          </div>
          <div>
            <div className={t.sectionLabel}>Kim yanlış yaptı</div>
            <div className={`${t.listGroup} mt-1.5`}>
              {[...q.who].sort((a, b) => b.at - a.at).map((w, i) => (
                <Link key={i} to={seesBaristas ? `/baristalar/${w.baristaId}` : '#'} onClick={(e) => !seesBaristas && e.preventDefault()} className={`${t.listRow} text-[13px]`}>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{w.name}</span>
                    <span className="block text-[12px] text-fg-3 truncate">{storeName(w.storeId)} · {fmtDateTime(w.at)}</span>
                  </span>
                  <span className="text-[12px] text-negative text-right max-w-[50%] truncate">{label(w.given)}</span>
                </Link>
              ))}
            </div>
          </div>
{seesPool && (
          <Link to={`/soru-havuzu?soru=${q.questionId}&modul=${q.moduleId}`} className={`${t.btn} ${t.btnSecondary} ${t.btnMd} self-start`}>
            <Icon name="edit" size={14} /> Soru havuzunda aç: düzelt ya da iptal et
          </Link>
          )}
        </div>
      )}
    </Sheet>
  );
};

/**
 * Seni bekleyenler: yöneticinin o gün yapması gereken işler tek şeritte.
 * Yalnızca rolün açabildiği ve sıfırdan büyük olanlar çıkar; hepsi sıfırsa
 * şerit görünmez. Her kart ilgili ekrana, süzülmüş olarak gider.
 */
const WaitingStrip: React.FC = () => {
  const me = useStaffSession();
  const ok = (p: Parameters<typeof allowed>[1]) => allowed(me.role, p);
  const { requests, proposals, baristas } = useStaffData();
  const board = useBoardQuestions(ok('ekran.kurulSorulari') && ok('kurulYanit'));
  const items: { key: string; n: number; text: string; hint?: string; icon: Parameters<typeof Icon>[0]['name']; tone: 'caution' | 'negative' | 'accent'; to?: string; onClick?: () => void }[] = [];

  if (ok('ekran.talepler') && ok('talepYanit')) {
    const waiting = requests.filter((r) => r.lastSide === 'store' && !isClosed(r.status));
    const urgent = waiting.filter((r) => r.priority === 'urgent' && !isClosed(r.status)).length;
    items.push({ key: 'talep', n: waiting.length, text: `${waiting.length} talep yanıt bekliyor`, hint: urgent ? `${urgent} acil` : undefined, icon: 'wrench', tone: urgent ? 'negative' : 'caution', to: '/talepler' });
  }
  if (ok('ekran.talepler') && ok('servisOnay')) {
    const n = requests.filter((r) => r.status === 'approval').length;
    items.push({ key: 'onay', n, text: `${n} servis onayın bekleniyor`, icon: 'shield', tone: 'accent', to: '/talepler?durum=onay' });
  }
  if (ok('ekran.onaylar')) {
    if (ok('oneriOnay')) {
      const n = proposals.filter((p) => p.status === 'pending').length;
      items.push({ key: 'oneri', n, text: `${n} öneri onay bekliyor`, icon: 'stamp', tone: 'accent', to: '/onaylar' });
    } else {
      const n = proposals.filter((p) => p.createdBy === me.uid && p.status === 'rejected' && (p.reviewedAt || 0) > Date.now() - 7 * 86400000).length;
      items.push({ key: 'oneri', n, text: `${n} önerin geri gönderildi`, icon: 'stamp', tone: 'caution', to: '/onaylar' });
    }
  }
  if (ok('ekran.kurulSorulari') && ok('kurulYanit')) {
    const n = board.data.filter((q) => q.status === 'open' && askedTo(q, me.role)).length;
    items.push({ key: 'kurul', n, text: `${n} kurul sorusu yanıt bekliyor`, icon: 'award', tone: 'accent', to: '/kurul-sorulari' });
  }
  if (ok('baristaYonetim')) {
    const pending = baristas.filter((b) => b.active && b.pinPending);
    const expired = pending.filter((b) => !!b.inviteExpiresAt && b.inviteExpiresAt < Date.now()).length;
    items.push({ key: 'kod', n: pending.length, text: `${pending.length} barista davet kodunu kullanmadı`, hint: expired ? `${expired} kodun süresi doldu` : undefined, icon: 'key', tone: expired ? 'negative' : 'caution',
      onClick: () => document.getElementById('kod-bekleyenler')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) });
  }

  const shown = items.filter((x) => x.n > 0);
  if (!shown.length) return null;
  const cls = `${t.cardInteractive} px-3.5 py-3 flex items-center gap-3 text-left`;
  return (
    <Section label="Seni bekleyenler">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {shown.map((x) => {
          const body = (
            <>
              <span className={t.iconChip(x.tone)}><Icon name={x.icon} size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold leading-snug">{x.text}</span>
                {x.hint && <span className="block text-[12px] text-fg-3">{x.hint}</span>}
              </span>
              <Icon name="chevronRight" size={16} className={t.rowChevron} />
            </>
          );
          return x.to ? <Link key={x.key} to={x.to} className={cls}>{body}</Link> : <button key={x.key} type="button" onClick={x.onClick} className={cls}>{body}</button>;
        })}
      </div>
    </Section>
  );
};

export const OverviewPage: React.FC = () => {
  const { stores, modules, lessons, tracks } = useContent();
  // Kısayollar yalnızca rolün açabildiği ekranlara gider (kapalı ekrana giden
  // kart sessizce ana sayfaya atıyor, "bozuk" izlenimi veriyordu).
  const me = useStaffSession();
  const can = (p: Parameters<typeof allowed>[1]) => allowed(me.role, p);
  const { baristas, progress, attempts: recent, assignments } = useStaffData();
  const activeStores = stores.filter((s) => s.active);
  // Pasif mağazanın baristası "aktif barista" sayılmaz (ipucundaki mağaza sayısı da yalnızca aktifleri sayıyor).
  const active = baristas.filter((b) => b.active && activeStores.some((s) => s.id === b.storeId));
  // Son 7 günün sınavları: kesin (eskiden son 300 denemeden hesaplanıyordu;
  // yoğun haftada 416 sınav 299 görünüyordu). Sayı, ortalama ve mağaza
  // satırları toplama sorgusuyla (~27 okuma; eskiden haftanın bütün sınav
  // belgeleri, ~450). Mini sınavlar (Yeni ürün, 3 soru) modül sınavı sayılmaz, ayrıca yazılır.
  const weekFrom = dayStart(Date.now() - 6 * 86400000);
  const storeIds = activeStores.map((s) => s.id);
  const week = useFetched<OverviewExams>(storeIds.length ? `ov-exams:${weekFrom}:${storeIds.join(',')}` : null, () => loadOverviewExams(weekFrom, storeIds));
  const weekCount = week.data?.total.exams ?? 0;
  const weekMini = week.data?.mini ?? 0;
  const avgScore = week.data?.total.avgScore ?? null;
  const avgProgress = active.length ? Math.round(active.reduce((s, b) => s + overallPercent(modules, lessons, progress[b.id] || EMPTY, tracks), 0) / active.length) : 0;

  // Geçersiz görevler (hedef kalmadı / bağlı içerik silindi) gecikmiş sayılmaz.
  const vctx: TaskValidityContext = { modules, lessons, tracks, baristas, stores };
  const validTasks = useMemo(() => assignments.filter((a) => !taskInvalidReason(a, vctx)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignments, modules, lessons, tracks, baristas]);
  const overdueCount = useMemo(() => {
    let n = 0;
    for (const a of validTasks) for (const b of taskTargets(a, baristas)) if (isOverdue(a, assignmentDone(a, progress[b.id]))) n++;
    return n;
  }, [validTasks, baristas, progress]);

  // En çok yanlış yapılan sorular — eğitim içeriğinde neyin anlaşılmadığını gösterir.
  // Sınav belgelerini ister (aralığın bütün sınavları): istek üzerine okunur,
  // bu oturumda bir kez açıldıysa açık kalır.
  const [missDays, setMissDays] = useState<7 | 30>(7);
  const [wantMissed, setWantMissed] = useState(() => isFetched(examsSinceKey(7)));
  const missSrc = useExamsSince(missDays, wantMissed);
  const candidates = useMemo(() => {
    const map = new Map<string, MissedQuestion>();
    (missSrc.data || []).filter((a) => !a.voided).forEach((a) =>
      (a.mistakes || []).filter((m) => !(a.voidedQuestions || []).includes(m.questionId)).forEach((m) => {
        const cur = map.get(m.questionId) || { questionId: m.questionId, prompt: m.prompt, options: m.options, answerIndex: m.answer, module: a.moduleTitle, moduleId: a.moduleId, n: 0, answer: m.options[m.answer], who: [] };
        cur.n++;
        cur.who.push({ baristaId: a.baristaId, name: a.baristaName, storeId: a.storeId, at: a.submittedAt || a.startedAt, given: m.given });
        map.set(m.questionId, cur);
      }));
    return [...map.values()].sort((a, b) => b.n - a.n).slice(0, 12);
  }, [missSrc.data]);
  // İptal edilen ya da bankadan silinen sorular listede kalmasın: düzeltilecek soru yok.
  const ids = candidates.map((c) => c.questionId);
  const qState = useFetched<Record<string, boolean>>(ids.length ? `qok:${ids.join(',')}` : null, async () =>
    Object.fromEntries(await Promise.all(ids.map(async (id) => {
      const snap = await getDoc(doc(db, 'questions', id)).catch(() => null);
      return [id, !snap || (snap.exists() && !(snap.data() as Question).disabled)] as const;
    }))));
  const missed = candidates.filter((c) => !qState.data || qState.data[c.questionId] !== false).slice(0, 6);
  const [openQ, setOpenQ] = useState<MissedQuestion | null>(null);
  const done = recent.filter((a) => a.submittedAt && !a.voided);

  return (
    <Page wide>
      <PageTitle title="Genel bakış" subtitle="Tüm mağazaların eğitim durumu." />

      <WaitingStrip />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Aktif barista" value={active.length} hint={`${activeStores.length} mağaza`} icon="users" to={can('ekran.baristalar') ? '/baristalar' : undefined} />
        <Stat label="Ortalama ilerleme" value={`%${avgProgress}`} icon="target" tone="positive" to={can('ekran.baristalar') ? '/baristalar?gorunum=tablo' : undefined} />
        <Stat label="Son 7 günde sınav" value={week.loading && !week.data ? '…' : weekCount}
          hint={week.error ? week.error : `${avgScore !== null ? `Ortalama ${avgScore} puan` : 'Henüz yok'}${weekMini ? ` · +${weekMini} mini sınav` : ''}`}
          icon="clipboard" tone="accent" onClick={() => document.getElementById('son-sinavlar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <Stat label="Gecikmiş görev" value={overdueCount} icon="alert" tone={overdueCount ? 'negative' : 'neutral'} to={can('ekran.gorevler') ? '/gorevler?durum=geciken' : undefined} />
      </div>

      <Section label="Mağazalar">
        <div className="overflow-x-auto">
          <div className={`${t.listGroup} min-w-[560px]`}>
            <div className="grid grid-cols-[1.6fr_0.7fr_1.2fr_0.8fr_0.8fr] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-3">
              <span>Mağaza</span><span>Barista</span><span>İlerleme</span><span>Sınav (7g)</span><span>Gecikmiş</span>
            </div>
            {activeStores.map((s) => {
              const team = active.filter((b) => b.storeId === s.id);
              const pct = team.length ? Math.round(team.reduce((x, b) => x + overallPercent(modules, lessons, progress[b.id] || EMPTY, tracks), 0) / team.length) : null;
              const wk = week.data?.byStore[s.id];
              const passRate = wk?.exams ? Math.round((wk.passed / wk.exams) * 100) : null;
              let od = 0;
              validTasks.filter((a) => a.storeId === s.id).forEach((a) =>
                taskTargets(a, team).forEach((b) => { if (isOverdue(a, assignmentDone(a, progress[b.id]))) od++; }));
              return (
                <Link key={s.id} to={can('ekran.magazalar') ? `/magazalar/${s.id}` : '#'} onClick={(e) => !can('ekran.magazalar') && e.preventDefault()} className="grid grid-cols-[1.6fr_0.7fr_1.2fr_0.8fr_0.8fr] gap-3 px-4 py-3 items-center hover:bg-panel-2 transition-colors">
                  <span className="text-[14px] font-medium truncate">{s.name}</span>
                  <span className="text-[13px] tnum text-fg-2">{team.length}</span>
                  <span className="flex items-center gap-2"><ProgressBar value={pct ?? 0} className="flex-1" /><span className="text-[12px] tnum w-9 text-right">{pct === null ? '—' : `%${pct}`}</span></span>
                  <span className="text-[13px] tnum text-fg-2">{wk ? `${wk.exams}${passRate !== null ? ` · %${passRate} geçti` : ''}` : '…'}</span>
                  <span>{od ? <Badge tone="negative">{od}</Badge> : <span className="text-[13px] text-fg-3">—</span>}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section label={`En çok yanlış yapılan sorular (${missDays} gün)`}
          action={
            <div className={t.segment}>
              {([7, 30] as const).map((d) => (
                <button key={d} onClick={() => setMissDays(d)} className={`${t.segmentItem} ${missDays === d ? t.segmentItemOn : t.segmentItemOff}`}>{d} gün</button>
              ))}
            </div>
          }>
          {!wantMissed ? (
            <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd} self-start`} onClick={() => setWantMissed(true)}>
              <Icon name="target" size={14} /> Soruları göster
            </button>
          ) : missSrc.loading && !missSrc.data ? <div className="py-6 flex justify-center"><Spinner /></div>
            : missSrc.error ? <ErrorText>{missSrc.error}</ErrorText>
            : missed.length === 0 ? <Empty icon="target" text="Henüz yeterli sınav verisi yok." /> : (
            <div className={t.listGroup}>
              {missed.map((m, i) => (
                // Kim yanlış yaptı, hangi şıkkı işaretledi: pencerede açılır.
                // Soruyu düzeltmek için modülün soru bankasına oradan gidilir.
                <button key={i} onClick={() => setOpenQ(m)} className={`${t.listRow} items-start text-left`}>
                  <Badge tone="negative">{m.n}×</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium leading-snug">{m.prompt}</div>
                    <div className="text-[12px] text-fg-3 mt-1">{m.module} · Doğru: <span className="text-positive">{m.answer}</span></div>
                  </div>
                  <Icon name="chevronRight" size={16} className={t.rowChevron} />
                </button>
              ))}
            </div>
          )}
        </Section>
        <MissedSheet q={openQ} onClose={() => setOpenQ(null)} storeName={(id) => stores.find((s) => s.id === id)?.name || ''} days={missDays} />

        <div id="son-sinavlar" className="scroll-mt-20 flex flex-col">
        <Section label="Son sınavlar">
          {done.length === 0 ? <Empty icon="clipboard" text="Henüz sınav yok." /> : (
            <div className={t.listGroup}>
              {done.slice(0, 8).map((a) => (
                <Link key={a.id} to={can('ekran.baristalar') ? `/baristalar/${a.baristaId}` : '#'} onClick={(e) => !can('ekran.baristalar') && e.preventDefault()} className={t.listRow}>
                  <Badge tone={a.passed ? 'positive' : 'negative'}>{a.score} puan</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{a.baristaName}</div>
                    <div className="text-[12px] text-fg-3 truncate">{a.moduleTitle} · {stores.find((s) => s.id === a.storeId)?.name}</div>
                  </div>
                  <span className="text-[11px] text-fg-3">{fmtDateTime(a.submittedAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>
        </div>
      </div>

      <PendingCodesSection />
      <StaffTeamSection />
    </Page>
  );
};

interface StaffRow { id: string; name: string; email: string; role: StaffRole; active: boolean }

/**
 * Kahve Operasyonu ekibi. Kişi ekleyip çıkarmak ve rol vermek yalnızca
 * Kahve Operasyon Direktörü'nde (ve geliştiricide); diğerleri listeyi görür.
 */
const StaffTeamSection: React.FC = () => {
  const me = useStaffSession();
  const manage = can(me.role, 'manageTeam');
  const roles = assignableRoles(me.role);
  const { data: staff } = useQueryLive<StaffRow>(query(collection(db, 'users'), where('role', 'in', visibleStaffRoles(me.role))), 'staff-team');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('regional');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rank = (r: StaffRole) => ['board', 'developer', 'director', 'opsmanager', 'regional'].indexOf(r);

  const add = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Ad soyad gir.');
    if (!email.includes('@')) return setError('Geçerli bir e-posta gir.');
    const gone = staff.find((x) => !x.active && (x.email || '').toLowerCase() === email.trim().toLowerCase());
    if (gone) return setError(`${gone.name} daha önce kaldırılmış. "Kaldırılanlar" listesinden yeniden etkinleştir.`);
    setBusy(true);
    try {
      await backend.createStaff(name, email, role);
      toast(`${name.trim()} eklendi. Şifre belirleme bağlantısı e-postasına gönderildi.`, 'positive');
      setOpen(false);
      setName(''); setEmail('');
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };

  // Müdür yalnızca kendi verebildiği rollerdeki kişileri değiştirebilir.
  const editable = (s: StaffRow) => manage && s.id !== me.uid && roles.includes(s.role);
  // Kaldırılan kişi aynı e-postayla yeniden eklenemiyordu (hesap zaten var):
  // listede kalır, yeniden etkinleştirilebilir. Geliştirici bu listede de
  // başkalarına görünmez (sorgu rolü süzüyor).
  const removed = staff.filter((s) => !s.active).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const [showRemoved, setShowRemoved] = useState(false);
  const reactivate = async (s: StaffRow) => {
    if (!confirm(`${s.name} yeniden etkinleştirilsin mi? ${STAFF_ROLE_LABEL[s.role] || s.role} olarak panele yeniden girebilir.`)) return;
    try { await updateDoc(doc(db, 'users', s.id), { active: true }); toast(`${s.name} yeniden etkin`, 'positive'); }
    catch (err) { toast(errorText(err), 'negative'); }
  };

  return (
    <Section label={`Kahve Operasyonu ekibi · ${staff.filter((s) => s.active).length}`}
      action={manage ? <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => { setRole(roles.includes('regional') ? 'regional' : roles[0]); setOpen(true); }}><Icon name="plus" size={14} /> Ekle</button> : undefined}>
      <div className={t.listGroup}>
        {staff.filter((s) => s.active).sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name, 'tr')).map((s) => (
          <div key={s.id} className={`${t.listRowStatic} flex-wrap`}>
            <Avatar name={s.name} size={32} />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium truncate">{s.name}{s.id === me.uid ? ' (sen)' : ''}</div>
              <div className="text-[12px] text-fg-3 truncate">{s.email} · {STAFF_ROLE_LABEL[s.role] || s.role}</div>
            </div>
            {editable(s) && (
              <>
                <select className={`${t.input} h-8 w-auto text-[12px]`} value={s.role} aria-label={`${s.name} rolü`}
                  onChange={async (e) => {
                    // Seçim anında kaydediliyor; telefonda kaydırırken yanlışlıkla
                    // değişen seçim kişinin bütün panelini değiştiriyordu.
                    const to = e.target.value as typeof s.role;
                    if (!confirm(`${s.name}: ${STAFF_ROLE_LABEL[s.role] || s.role} → ${STAFF_ROLE_LABEL[to] || to}. Gördüğü ekranlar ve yetkileri değişir. Onaylıyor musun?`)) { e.target.value = s.role; return; }
                    try { await updateDoc(doc(db, 'users', s.id), { role: to }); toast('Rol güncellendi'); }
                    catch (err) { toast(errorText(err), 'negative'); }
                  }}>
                  {roles.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>)}
                </select>
                <button className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} onClick={async () => {
                  if (!confirm(`${s.name} için erişim kaldırılsın mı?`)) return;
                  try { await updateDoc(doc(db, 'users', s.id), { active: false }); toast('Erişim kaldırıldı'); }
                  catch (err) { toast(errorText(err), 'negative'); }
                }}>Kaldır</button>
              </>
            )}
          </div>
        ))}
      </div>
      {removed.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button className="self-start text-[12.5px] text-fg-3 inline-flex items-center gap-1.5 hover:text-crema" onClick={() => setShowRemoved(!showRemoved)}>
            <Icon name={showRemoved ? 'arrowUp' : 'arrowDown'} size={12} /> Kaldırılanlar · {removed.length}
          </button>
          {showRemoved && (
            <div className={t.listGroup}>
              {removed.map((s) => (
                <div key={s.id} className={`${t.listRowStatic} flex-wrap`}>
                  <Avatar name={s.name} size={32} dim />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate text-fg-2">{s.name}</div>
                    <div className="text-[12px] text-fg-3 truncate">{s.email} · {STAFF_ROLE_LABEL[s.role] || s.role} · erişimi kaldırıldı</div>
                  </div>
                  {editable(s) && <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => reactivate(s)}>Yeniden etkinleştir</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Sheet open={open} title="Kahve Operasyonu ekibine ekle" onClose={() => setOpen(false)} dirty={!busy && !!(name.trim() || email.trim())}
        footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={add} disabled={busy}>{busy ? <Spinner size={14} /> : 'Ekle'}</button>}>
        <label className={t.field}><span className={t.label}>Ad soyad</span><input className={t.input} value={name} maxLength={MAX.name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className={t.field}><span className={t.label}>E-posta</span><input className={t.input} type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} /></label>
        <div className={t.field}>
          <span className={t.label}>Rol</span>
          <div className="flex flex-col gap-1.5">
            {roles.map((r) => (
              <label key={r} className="flex items-start gap-2 text-[13px] cursor-pointer">
                <input type="radio" checked={role === r} onChange={() => setRole(r)} className="mt-0.5" />
                <span><strong>{STAFF_ROLE_LABEL[r]}</strong> <span className="text-fg-3">— {ROLE_HINT[r]}</span></span>
              </label>
            ))}
          </div>
        </div>
        <p className="text-[12px] text-fg-3 leading-relaxed">Şifresini kendisi belirleyecek: e-postasına bir bağlantı gönderilir.</p>
        <ErrorText>{error}</ErrorText>
      </Sheet>
    </Section>
  );
};

const ROLE_HINT: Record<StaffRole, string> = {
  developer: 'her şeyi görür ve yapar',
  director: 'yayınlar, onaylar, ekibi yönetir',
  opsmanager: 'kahve dışı eğitimleri yayınlar, talepleri yanıtlar ve servis onaylar, bülten yayınlar',
  regional: 'barista ve mağaza kodlarını yönetir; içerik ve bülten önerileri onaya düşer',
  board: 'gidişatı, raporları ve süren işleri okur; hiçbir şeyi değiştirmez, soru sorar'
};

/**
 * Önlük rozetleri. Kitapçık: Rookie / Specialist / Senior / Pro rozetleri
 * önlükte isimlikle birlikte takılır. Uygulama kimin hangi rozeti hak
 * ettiğini başarımlardan hesaplar; fiziksel rozet verilince buradan
 * "teslim edildi" işaretlenir, liste bir sonraki rozete kadar boşalır.
 */
const APRON_RANK = { rookie: 1, specialist: 2, senior: 3, pro: 4 } as const;

export const ApronBadgesSection: React.FC = () => {
  const me = useStaffSession();
  const { stores, tracks, modules, lessons } = useContent();
  const { baristas, progress } = useStaffData();
  const canMark = allowed(me.role, 'rozetAyar') || can(me.role, 'manageBaristas');
  const badgeConfig = useBadgeConfig((x) => x.config);
  // Önlük kararı kesik veriye dayanmasın: bütün sınav geçmişi ve bütün görevler
  // (eskiden zincirin son 300 sınavı; "önlükten al" haksız yere çıkabiliyordu).
  // Geçmiş zincirin bütün sınavları (zamanla büyür): ekran her açılışta okumaz,
  // "Önlük durumunu hesapla" ile okunur. Bu oturumda (Baristalar → Unvanları
  // göster, kurul yetkinlik dağılımı) okunduysa hemen hesaplanır.
  const loadedHistory = useHistoryIfLoaded();
  const [want, setWant] = useState(false);
  const history = useHistory(want || !!loadedHistory);
  const rows = useMemo(() => !history.data ? [] : baristas.filter((b) => b.active).map((b) => {
    const report = badgeReport({
      tracks, modules, lessons, progress: progress[b.id] || EMPTY,
      attempts: history.data!.attempts.filter((a) => a.baristaId === b.id && a.submittedAt && !a.voided),
      assignments: history.data!.assignments.filter((a) => a.storeId === b.storeId && (!a.baristaId || a.baristaId === b.id)),
      config: badgeConfig, ...fromBarista(b)
    });
    return { b, report };
  }), [baristas, tracks, modules, lessons, progress, history.data, badgeConfig]);
  // Teslim edilecekler: şartı sağladığı rozet önlüktekinden yüksek ya da
  // önlükteki rozetin geçerlilik süresi dolmuş ve hâlâ şartları sağlıyor.
  const due = rows.filter(({ b, report }) => report.qualified
    && (APRON_RANK[report.qualified.id] > (b.apronBadge ? APRON_RANK[b.apronBadge] : 0) || report.expired));
  // Önlükte olup artık hak edilmeyenler (süresi dolup şartı kaybeden ya da geri alınan).
  const lost = rows.filter(({ b, report }) => b.apronBadge
    && (!report.qualified || APRON_RANK[report.qualified.id] < APRON_RANK[b.apronBadge]));
  // Şartları tutmayan ve süresi 14 gün içinde dolacak olanlar (H12): panelde uyarı.
  const soon = lost.filter(({ report }) => !!report.expiresSoon).length;
  const counts = (['rookie', 'specialist', 'senior', 'pro'] as const).map((id) => ({ id, label: resolveConfig(badgeConfig).titles[id].label, n: baristas.filter((b) => b.active && (b.apronBadge || null) === id).length }));
  const storeName = (id: string) => stores.find((x) => x.id === id)?.name || '';
  /**
   * Önlüğe dokunan karar yazılmadan önce o baristanın güncel bütün geçmişiyle
   * yeniden hesaplanır (liste en çok 30 dakikalık önbellekten gelir).
   */
  const fresh = async (b: Barista) => {
    const [atts, tasks] = await Promise.all([loadBaristaAttempts(b.id), loadStoreAssignments(b.storeId)]);
    return badgeReport({
      tracks, modules, lessons, progress: progress[b.id] || EMPTY,
      attempts: atts.filter((a) => a.submittedAt && !a.voided),
      assignments: tasks.filter((a) => !a.baristaId || a.baristaId === b.id),
      config: badgeConfig, ...fromBarista(b)
    });
  };
  const markApron = async (b: Barista, expect: string | null, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    try {
      const r = await fresh(b);
      if ((r.qualified?.id || null) !== expect) {
        toast(`${b.name.split(' ')[0]}: güncel sınav geçmişine göre hak ettiği rozet ${r.qualified?.label || 'yok'}. Liste yenilendi, tekrar bak.`, 'negative');
        history.reload();
        return;
      }
      await updateDoc(doc(db, 'baristas', b.id), { apronBadge: expect, apronBadgeAt: Date.now(), apronBadgeByName: authorName(me.role, me.name) });
      toast(expect ? `${b.name.split(' ')[0]}: ${r.qualified!.label} rozeti teslim edildi` : 'Önlük rozeti güncellendi', 'positive');
    } catch (e) { toast(errorText(e), 'negative'); }
  };
  return (
    <Section label={`Önlük rozetleri${due.length ? ` · ${due.length} teslim bekliyor` : ''}`}>
      <div className="grid grid-cols-4 gap-2">
        {counts.map((c) => (
          <div key={c.id} className={`${t.card} p-3 flex flex-col items-center gap-0.5`}>
            <span className="text-[22px] font-bold tnum">{c.n}</span>
            <span className="text-[12px] text-fg-3">{c.label} · önlükte</span>
          </div>
        ))}
      </div>
      {!history.data && !history.error && (
        <div className="flex flex-col gap-1.5 items-start">
          <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} disabled={history.loading && want} onClick={() => setWant(true)}>
            {history.loading && want ? <Spinner size={14} /> : <Icon name="medal" size={14} />} Önlük durumunu hesapla
          </button>
          <span className="text-[12px] text-fg-3">Teslim bekleyenler ve önlükten alınacaklar bütün sınav geçmişinden hesaplanır.</span>
        </div>
      )}
      {history.error && <ErrorText>{history.error}</ErrorText>}
      {due.length > 0 && (
        <div className={t.listGroup}>
          {due.map(({ b, report }) => (
            <div key={b.id} className={`${t.listRowStatic} flex-wrap`}>
              <Avatar name={b.name} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate flex items-center gap-2">{b.name} <Badge tone="positive">{report.qualified!.label}</Badge>{report.expired && <Badge tone="caution">Süresi doldu</Badge>}</div>
                <div className="text-[12px] text-fg-3 truncate">
                  {storeName(b.storeId)} · {report.earned} başarım{b.apronBadge ? ` · önlükte şu an: ${report.titles.find((x) => x.id === b.apronBadge)?.label}` : ' · önlükte rozet yok'}
                </div>
              </div>
              {canMark && (
                <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => markApron(b, report.qualified!.id)}><Icon name="check" size={13} /> Teslim edildi</button>
              )}
            </div>
          ))}
        </div>
      )}
      {lost.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-caution">Önlükteki rozeti artık hak etmeyenler · {lost.length}{soon ? ` · ${soon} kişinin süresi 14 gün içinde doluyor` : ''}</span>
          <div className={t.listGroup}>
            {lost.map(({ b, report }) => (
              <div key={b.id} className={`${t.listRowStatic} flex-wrap`}>
                <Avatar name={b.name} size={32} dim />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium truncate">{b.name}</div>
                  <div className="text-[12px] text-fg-3 truncate">
                    Önlükte: {report.titles.find((x) => x.id === b.apronBadge)?.label} · şu an hak ettiği: {report.qualified?.label || 'yok'}
                    {report.capped ? ` · geri alındı: ${report.capped.reason}` : report.expired ? ' · süresi doldu' : report.expiresSoon ? ` · süresi ${fmtDate(report.expiresSoon)} tarihinde doluyor` : ''}
                  </div>
                </div>
                {canMark && (
                  <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => markApron(b, report.qualified?.id || null, `${b.name}: önlükteki rozet değişsin mi?`)}>Önlükten al</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
};

/**
 * Kod bekleyenler: davet kodunu henüz kullanmamış baristalar ve eşleşmemiş
 * mağaza telefonları. Kodları Bölge Müdürü verir; Kahve Operasyon Direktörü
 * buradan takip eder.
 */
export const PendingCodesSection: React.FC = () => {
  const { stores } = useContent();
  const { baristas } = useStaffData();
  const { data: phones } = useQueryLive<{ id: string; storeId: string; createdAt: number }>(
    query(collection(db, 'users'), where('role', '==', 'store'), where('paired', '==', false), where('active', '==', true)), 'pending-phones');
  const waiting = baristas.filter((b) => b.active && b.pinPending).sort((a, b) => (a.inviteExpiresAt || 0) - (b.inviteExpiresAt || 0));
  const storeName = (id: string) => stores.find((x) => x.id === id)?.name || '';
  if (!waiting.length && !phones.length) return null;
  return (
    <div id="kod-bekleyenler" className="scroll-mt-20 flex flex-col">
    <Section label={`Kod bekleyenler · ${waiting.length + phones.length}`}>
      <div className={t.listGroup}>
        {waiting.map((b) => {
          const expired = !!b.inviteExpiresAt && b.inviteExpiresAt < Date.now();
          return (
            <Link key={b.id} to={`/baristalar/${b.id}`} className={t.listRow}>
              <Avatar name={b.name} size={30} dim />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate">{b.name}</div>
                <div className="text-[12px] text-fg-3 truncate">
                  {storeName(b.storeId)} · {BARISTA_ROLE_LABEL[b.role]} · davet kodunu kullanmadı
                  {b.codeIssuedByName ? ` · kodu veren: ${b.codeIssuedByName}` : ''}
                </div>
              </div>
              {expired ? <Badge tone="negative">Kodun süresi doldu</Badge>
                : b.inviteExpiresAt ? <Badge tone="caution">Son gün {fmtDate(b.inviteExpiresAt)}</Badge> : <Badge tone="caution">Bekliyor</Badge>}
            </Link>
          );
        })}
        {phones.map((p) => (
          <Link key={p.id} to={`/magazalar/${p.storeId}`} className={t.listRow}>
            <span className={t.iconChip('caution')}><Icon name="phone" size={15} /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium truncate">{storeName(p.storeId)} · mağaza telefonu</div>
              <div className="text-[12px] text-fg-3">Eşleştirme kodu üretildi, telefon henüz bağlanmadı · {fmtDate(p.createdAt)}</div>
            </div>
          </Link>
        ))}
      </div>
    </Section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Mağazalar                                                           */
/* ------------------------------------------------------------------ */

export const StoresPage: React.FC = () => {
  const me = useStaffSession();
  const manage = can(me.role, 'manageBaristas');
  const { stores } = useContent();
  const { baristas } = useStaffData();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('İstanbul');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    // Kısa adda sessizce duruyor, hata olunca "Ekle" kalıcı kilitleniyordu.
    if (name.trim().length < 2) { toast('Mağaza adını yaz.', 'negative'); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, 'stores'), { name: name.trim(), city: city.trim(), active: true, createdAt: Date.now() });
      setOpen(false);
      setName('');
      toast('Mağaza eklendi', 'positive');
    } catch (e) {
      toast(errorText(e), 'negative');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page wide>
      <PageTitle title="Mağazalar" action={manage ? <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setOpen(true)}><Icon name="plus" size={15} /> Mağaza</button> : undefined} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stores.map((s) => (
          <Link key={s.id} to={`/magazalar/${s.id}`} className={`${t.cardInteractive} p-4 flex items-center gap-3 ${s.active ? '' : 'opacity-50'}`}>
            <span className={t.iconChip('neutral')}><Icon name="store" size={16} /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold truncate">{s.name}</div>
              <div className="text-[12px] text-fg-3">{s.city} · {baristas.filter((b) => b.storeId === s.id && b.active).length} barista</div>
            </div>
            <Icon name="chevronRight" size={16} className={t.rowChevron} />
          </Link>
        ))}
      </div>
      <Sheet open={open} title="Yeni mağaza" onClose={() => setOpen(false)} dirty={!busy && (!!name.trim() || city.trim() !== 'İstanbul')}
        footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={add} disabled={busy}>Ekle</button>}>
        <label className={t.field}><span className={t.label}>Mağaza adı</span><input className={t.input} value={name} maxLength={MAX.name} onChange={(e) => setName(e.target.value)} placeholder="Ör. Moda Cadde" /></label>
        <label className={t.field}><span className={t.label}>Şehir</span><input className={t.input} value={city} maxLength={40} onChange={(e) => setCity(e.target.value)} /></label>
      </Sheet>
    </Page>
  );
};

interface DeviceRow { id: string; label: string; createdAt: number; lastSeenAt: number | null; active: boolean; paired: boolean }

export const StoreDetailPage: React.FC = () => {
  const { storeId } = useParams();
  const me = useStaffSession();
  // Barista ekleme, telefon bağlama ve kodlar Bölge Müdürü'nde.
  const manage = can(me.role, 'manageBaristas');
  const { stores, modules, lessons, tracks } = useContent();
  const { baristas, progress } = useStaffData();
  const store = stores.find((s) => s.id === storeId);
  const { data: devices } = useQueryLive<DeviceRow>(
    storeId ? query(collection(db, 'users'), where('role', '==', 'store'), where('storeId', '==', storeId)) : null,
    `dev-${storeId}`
  );
  const [code, setCode] = useState<{ code: string; expiresAt: number; title: string; hint: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // "Telefon bağla": yeni (ek) telefon mu, yoksa verisi silinen / değişen bir telefonun yerine mi (H16).
  const [pairAsk, setPairAsk] = useState(false);
  const [replaces, setReplaces] = useState<string | null>(null);

  if (!store) return <Page wide><PageTitle title="Mağaza bulunamadı" back="/magazalar" /></Page>;
  const team = baristas.filter((b) => b.storeId === store.id);
  const activePhones = devices.filter((d) => d.active);

  const createCode = async (replace: string | null) => {
    setBusy(true);
    try {
      const r = await backend.createPairingCode(store.id, store.name, replace ? { replaces: [replace] } : {});
      setPairAsk(false);
      setCode({ ...r, title: 'Telefon eşleştirme kodu', hint: `Mağaza telefonunda 1401 Campus'u aç ve bu kodu gir. Telefon kalıcı olarak ${store.name} mağazasına bağlanır.${replace ? ' Eski telefonun bağlantısı kaldırıldı.' : ''}` });
    } catch (e) { toast(errorText(e), 'negative'); }
    setBusy(false);
  };
  const pairPhone = () => {
    if (!activePhones.length) { void createCode(null); return; }
    setReplaces(null);
    setPairAsk(true);
  };

  return (
    <Page wide>
      <PageTitle title={store.name} subtitle={store.city} back="/magazalar"
        action={manage ? (
          <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`}
            onClick={async () => {
              if (store.active && !confirm(`${store.name} pasifleştirilsin mi?\n\nMağaza listelerden ve raporlardan düşer. Mağaza telefonu ve bu mağazanın baristaları giriş yapamaz (PIN'siz reçeteler de kapanır); açık görevleri geçersiz sayılır. Yeniden aktifleştirince hepsi geri gelir.`)) return;
              try { await updateDoc(doc(db, 'stores', store.id), { active: !store.active }); toast(store.active ? 'Mağaza pasifleştirildi' : 'Mağaza aktif'); }
              catch (e) { toast(errorText(e), 'negative'); }
            }}>
            {store.active ? 'Pasifleştir' : 'Aktifleştir'}
          </button>
        ) : undefined} />

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 items-start">
        <Section label={`Baristalar · ${team.filter((b) => b.active).length}`} action={manage ? <button className={`${t.btn} ${t.btnPrimary} ${t.btnSm}`} onClick={() => setAddOpen(true)}><Icon name="plus" size={14} /> Barista ekle</button> : undefined}>
          {team.length === 0 ? <Empty icon="users" text="Bu mağazada henüz barista yok." /> : (
            <div className={t.listGroup}>
              {team.map((b) => <BaristaRow key={b.id} b={b} pct={overallPercent(modules, lessons, progress[b.id] || EMPTY, tracks)} />)}
            </div>
          )}
        </Section>

        <Section label="Mağaza telefonları" action={manage ? <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={pairPhone} disabled={busy}><Icon name="phone" size={14} /> Telefon bağla</button> : undefined}>
          {devices.filter((d) => d.active).length === 0 ? <Empty icon="phone" text="Bağlı telefon yok. 'Telefon bağla' ile kod oluştur." /> : (
            <div className={t.listGroup}>
              {devices.filter((d) => d.active).map((d) => (
                <div key={d.id} className={t.listRowStatic}>
                  <span className={t.iconChip('neutral')}><Icon name="phone" size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium">{d.paired ? d.label : `${d.label} (eşleştirme bekleniyor)`}</div>
                    <div className="text-[12px] text-fg-3">Bağlandı {fmtDate(d.createdAt)} · Son görülme {fmtDateTime(d.lastSeenAt)}</div>
                  </div>
                  {manage && <button className={`${t.btn} ${t.btnDanger} ${t.btnSm}`} onClick={async () => {
                    if (!confirm('Bu telefonun bağlantısı kaldırılsın mı? Telefonda kimse giriş yapamaz hale gelir.')) return;
                    try { await backend.revokeDevice(d.id); toast('Bağlantı kaldırıldı'); } catch (e) { toast(errorText(e), 'negative'); }
                  }}>Kaldır</button>}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <AddBaristaSheet open={addOpen} onClose={() => setAddOpen(false)} storeId={store.id} onCreated={setCode} />
      <CodeSheet code={code} onClose={() => setCode(null)} />
      <Sheet open={pairAsk} title="Telefon bağla" onClose={() => setPairAsk(false)}
        footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} disabled={busy} onClick={() => createCode(replaces)}>{busy ? <Spinner size={14} /> : null} Kod oluştur</button>}>
        <p className="text-[13px] text-fg-2 leading-relaxed">Bu mağazada bağlı telefon var. Yeni kod ek bir telefon için mi, yoksa uygulama verisi silinen ya da değişen bir telefonun yerine mi?</p>
        <div className={t.listGroup} role="radiogroup" aria-label="Kod kimin için">
          <label className={`${t.listRow} cursor-pointer`}>
            <input type="radio" name="pair-for" checked={replaces === null} onChange={() => setReplaces(null)} />
            <span className="flex-1 text-[14px]">Yeni, ek bir telefon</span>
          </label>
          {activePhones.map((d) => (
            <label key={d.id} className={`${t.listRow} cursor-pointer`}>
              <input type="radio" name="pair-for" checked={replaces === d.id} onChange={() => setReplaces(d.id)} />
              <span className="flex-1 min-w-0">
                <span className="block text-[14px]">Bu telefonun yerine: {d.label}</span>
                <span className="block text-[12px] text-fg-3">Son görülme {fmtDateTime(d.lastSeenAt)}</span>
              </span>
            </label>
          ))}
        </div>
        {replaces && <p className="text-[12px] text-caution">Seçilen telefonun bağlantısı kod oluşturulunca hemen kaldırılır; o telefonda kimse giriş yapamaz.</p>}
      </Sheet>
    </Page>
  );
};

/**
 * Listede bir baristanın unvanı. Kesik veriden hesaplanmaz: bütün sınav
 * geçmişi bu oturumda okunduysa (Rozetler ya da "Unvanları göster") hesaplanır,
 * okunmadıysa unvan gösterilmez. Kesin unvan barista ayrıntısında.
 */
function useStaffBadgeReport(b: Barista) {
  const { tracks, modules, lessons } = useContent();
  const badgeConfig = useBadgeConfig((x) => x.config);
  const { progress } = useStaffData();
  const history = useHistoryIfLoaded();
  return useMemo(() => !history ? null : badgeReport({
    tracks, modules, lessons, progress: progress[b.id] || EMPTY,
    attempts: history.attempts.filter((a) => a.baristaId === b.id && a.submittedAt && !a.voided),
    assignments: history.assignments.filter((a) => a.storeId === b.storeId && (!a.baristaId || a.baristaId === b.id)),
    config: badgeConfig, ...fromBarista(b)
  }), [tracks, modules, lessons, progress, history, b, badgeConfig]);
}

const BaristaRow: React.FC<{ b: Barista; pct: number; showStore?: string; lastAt?: number | null }> = ({ b, pct, showStore, lastAt }) => {
  const report = useStaffBadgeReport(b);
  // Son etkinlik: yalnızca listede (lastAt verildiyse), aktif ve PIN'i olan baristada.
  const days = lastAt ? Math.floor((Date.now() - lastAt) / 86400000) : null;
  const stale = lastAt === null || (days !== null && days >= STALE_DAYS);
  const lastText = lastAt === undefined || !b.active || b.pinPending ? null
    : lastAt === null ? 'Henüz etkinlik yok' : days === 0 ? 'Son etkinlik: bugün' : `Son etkinlik: ${days} gün önce`;
  return (
  <Link to={`/baristalar/${b.id}`} className={`${t.listRow} ${b.active ? '' : 'opacity-50'}`}>
    <Avatar name={b.name} size={36} dim={!b.active} />
    <div className="flex-1 min-w-0">
      <div className="text-[14px] font-medium truncate flex items-center gap-2">
        {b.name}
        {b.role !== 'barista' && <Badge>{BARISTA_ROLE_LABEL[b.role]}</Badge>}
        {report && <TitleChip report={report} />}
      </div>
      <div className="text-[12px] text-fg-3 truncate">
        {showStore ? `${showStore} · ` : ''}
        {!b.active ? 'Pasif' : b.pinPending ? 'Davet bekleniyor' : `İlerleme %${pct}`}
        {lastText && <> · <span className={stale ? 'text-caution' : ''}>{lastText}</span></>}
      </div>
    </div>
    {b.active && !b.pinPending && <ProgressBar value={pct} className="w-20 hidden sm:block" />}
    {b.active && b.pinPending && <Badge tone="caution">Davet</Badge>}
    <Icon name="chevronRight" size={16} className={t.rowChevron} />
  </Link>
  );
};

const AddBaristaSheet: React.FC<{ open: boolean; onClose: () => void; storeId?: string; onCreated: (c: { code: string; expiresAt: number; title: string; hint: string }) => void }> = ({ open, onClose, storeId: fixed, onCreated }) => {
  const me = useStaffSession();
  const { stores } = useContent();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [startedAt, setStartedAt] = useState(() => localDay());
  const [storeId, setStoreId] = useState(fixed || '');
  const [role, setRole] = useState<BaristaRole>('barista');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await backend.createBarista({ name, storeId: fixed || storeId, role, phone, startedAt, createdByName: authorName(me.role, me.name) });
      onClose();
      onCreated({ code: r.code, expiresAt: r.expiresAt, title: `${name.trim()} için davet kodu`, hint: inviteHint(name.trim().split(' ')[0]) });
      setName(''); setPhone(''); setRole('barista'); setStartedAt(localDay());
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };

  return (
    <Sheet open={open} title="Barista ekle" onClose={onClose} dirty={!busy && !!(name.trim() || phone.trim())}
      footer={<><button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={onClose}>Vazgeç</button><button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save} disabled={busy}>{busy ? <Spinner size={14} /> : 'Ekle ve kod oluştur'}</button></>}>
      <label className={t.field}><span className={t.label}>Ad soyad</span><input className={t.input} value={name} maxLength={MAX.name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      {!fixed && (
        <label className={t.field}><span className={t.label}>Mağaza</span>
          <select className={t.input} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Seç…</option>
            {stores.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <label className={t.field}><span className={t.label}>İşe başlama tarihi</span>
        <input className={t.input} type="date" value={startedAt} max={localDay()} onChange={(e) => setStartedAt(e.target.value)} />
        <span className="text-[11px] text-fg-3">1401'de çalışmaya başladığı gün. Kıdem rozetleri (6 ay, 1 yıl) ve Pro önlük rozeti buna göre hesaplanır.</span>
      </label>
      <label className={t.field}><span className={t.label}>Telefon (isteğe bağlı — kodu iletmek için)</span><input className={t.input} value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="05xx xxx xx xx" /></label>
      <div className={t.field}>
        <span className={t.label}>Rol</span>
        <div className={t.segment}>
          {BARISTA_ROLES.map((r) => (
            <button key={r} onClick={() => setRole(r)} className={`${t.segmentItem} ${role === r ? t.segmentItemOn : t.segmentItemOff}`}>{BARISTA_ROLE_LABEL[r]}</button>
          ))}
        </div>
        <span className="text-[11px] text-fg-3">Mağaza ve vardiya müdürü ekibinin ilerlemesini görür, kendi mağazasına görev atar ve Kahve Operasyonu'na talep açar. Giriş ekranında üstte görünürler.</span>
      </div>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ */
/* Baristalar                                                          */
/* ------------------------------------------------------------------ */

/**
 * Baristanın kendi yaptığı son iş: ders bitirme, sınav geçme, bülten okuma,
 * sınava girme. progress.updatedAt kullanılmaz; hesap açılınca ve yeniden
 * puanlamada da değişiyor.
 */
function lastActivity(p: Progress | undefined, attempts: { startedAt: number; submittedAt?: number }[]): number | null {
  const xs: number[] = [];
  if (p) {
    Object.values(p.lessons || {}).forEach((v) => xs.push(v));
    Object.values(p.modules || {}).forEach((v) => xs.push(v.passedAt));
    Object.values(p.bulletins || {}).forEach((v) => xs.push(v));
    Object.values(p.quizzes || {}).forEach((v) => xs.push(v.passedAt));
  }
  attempts.forEach((a) => xs.push(a.submittedAt || a.startedAt));
  const max = Math.max(0, ...xs.filter((x) => typeof x === 'number'));
  return max || null;
}

const STALE_DAYS = 14;

export const BaristasPage: React.FC = () => {
  const me = useStaffSession();
  const { stores, modules, lessons, tracks } = useContent();
  const { baristas, progress, attempts: recent } = useStaffData();
  // Unvanlar ve son etkinlik bütün sınav geçmişini ister (pahalı): istek üzerine okunur.
  const [wantTitles, setWantTitles] = useState(false);
  const loaded = useHistoryIfLoaded();
  const historyQ = useHistory(wantTitles);
  const attempts = loaded?.attempts || recent;
  // Süzgeçler adreste: bir baristaya girip dönünce liste aynı kalsın.
  const [params, setParams] = useSearchParams();
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };
  const storeFilter = params.get('magaza') || '';
  const setStoreFilter = (v: string) => setParam('magaza', v);
  const showInactive = params.get('pasif') === '1';
  const setShowInactive = (v: boolean) => setParam('pasif', v ? '1' : '');
  const view: 'list' | 'matrix' = params.get('gorunum') === 'tablo' ? 'matrix' : 'list';
  const setView = (v: 'list' | 'matrix') => setParam('gorunum', v === 'matrix' ? 'tablo' : '');
  const q = params.get('q') || '';
  const setQ = (v: string) => setParam('q', v);
  const sort = (params.get('sira') || 'ad') as 'ad' | 'ilerleme' | 'etkinlik';
  const [addOpen, setAddOpen] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: number; title: string; hint: string } | null>(null);

  const activity = useMemo(() => {
    const byB = new Map<string, Attempt[]>();
    attempts.forEach((a) => { const l = byB.get(a.baristaId) || []; l.push(a); byB.set(a.baristaId, l); });
    return new Map(baristas.map((b) => [b.id, lastActivity(progress[b.id], byB.get(b.id) || [])]));
  }, [baristas, progress, attempts]);
  const pctOf = (b: Barista) => overallPercent(modules, lessons, progress[b.id] || EMPTY, tracks);
  // Türkçe ve aksan katlamalı arama: "ilgaz" Ilgaz'ı, "cagla" Çağla'yı bulur.
  const nq = norm(q);
  const list = baristas.filter((b) => (showInactive || b.active) && (!storeFilter || b.storeId === storeFilter) && norm(b.name).includes(nq))
    .sort(sort === 'ilerleme' ? (a, b) => pctOf(a) - pctOf(b) || a.name.localeCompare(b.name, 'tr')
      // En uzun süredir hiçbir şey yapmayan üstte; hiç etkinliği olmayan en başta.
      : sort === 'etkinlik' ? (a, b) => (activity.get(a.id) || 0) - (activity.get(b.id) || 0) || a.name.localeCompare(b.name, 'tr')
        : (a, b) => a.name.localeCompare(b.name, 'tr'));
  const pubMods = tracks.filter((x) => x.published).flatMap((tr) => modules.filter((m) => m.trackId === tr.id && m.published));
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name || '—';
  // Etkinlik: tam geçmiş yoksa son 50 sınav + ilerleme kayıtları (dersler, modüller, bültenler).

  return (
    <Page wide>
      <PageTitle title="Baristalar" action={can(me.role, 'manageBaristas') ? <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setAddOpen(true)}><Icon name="plus" size={15} /> Barista</button> : undefined} />

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
          <input className={`${t.input} h-9 pl-9 text-[14px]`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="İsim ara" aria-label="İsimle ara" />
        </div>
        <select className={`${t.input} h-9 w-auto text-[14px]`} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} aria-label="Mağaza">
          <option value="">Tüm mağazalar</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className={t.segment}>
          <button className={`${t.segmentItem} ${view === 'list' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setView('list')}>Liste</button>
          <button className={`${t.segmentItem} ${view === 'matrix' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setView('matrix')}>Modül tablosu</button>
        </div>
        {view === 'list' && (
          <select className={`${t.input} h-9 w-auto text-[14px]`} value={sort} onChange={(e) => setParam('sira', e.target.value === 'ad' ? '' : e.target.value)} aria-label="Sıralama">
            <option value="ad">Sırala: ada göre</option>
            <option value="ilerleme">Sırala: ilerleme (en düşük üstte)</option>
            <option value="etkinlik">Sırala: son etkinlik (en eski üstte)</option>
          </select>
        )}
        <label className="flex items-center gap-2 text-[13px] text-fg-2 px-1">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Pasifler
        </label>
        {view === 'list' && !loaded && (
          <button className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} disabled={historyQ.loading && wantTitles} onClick={() => setWantTitles(true)}>
            {historyQ.loading && wantTitles ? <Spinner size={13} /> : <Icon name="medal" size={13} />} Unvanları göster
          </button>
        )}
      </div>
      {historyQ.error && <ErrorText>{historyQ.error}</ErrorText>}

      {list.length === 0 ? <Empty icon="users" text="Barista bulunamadı." /> : view === 'list' ? (
        <div className={t.listGroup}>
          {list.map((b) => <BaristaRow key={b.id} b={b} pct={pctOf(b)} showStore={storeName(b.storeId)} lastAt={activity.get(b.id) ?? null} />)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="text-[12px] border-collapse min-w-full">
            <thead>
              <tr className="bg-panel">
                <th className="sticky left-0 bg-bean text-left px-3 py-2.5 font-semibold text-fg-2 min-w-[160px] border-b border-line">Barista</th>
                {pubMods.map((m) => (
                  <th key={m.id} className="px-2 py-2.5 font-medium text-fg-3 border-b border-line min-w-[88px] max-w-[110px] align-bottom">
                    <span className="line-clamp-3 leading-tight">{m.title}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const p = progress[b.id] || EMPTY;
                return (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="sticky left-0 bg-bean px-3 py-2">
                      <Link to={`/baristalar/${b.id}`} className="font-medium hover:underline">{b.name}</Link>
                      <div className="text-[11px] text-fg-3">{storeName(b.storeId)}</div>
                    </td>
                    {pubMods.map((m) => {
                      const st = moduleState(m, lessons, p, { modules, tracks });
                      return (
                        <td key={m.id} className="px-2 py-2 text-center">
                          {st.passed ? (
                            <span className="inline-flex items-center justify-center min-w-11 h-6 px-1.5 rounded-md bg-positive-bg text-positive border border-positive-line font-semibold tnum">{st.score}</span>
                          ) : st.lessonsDone > 0 ? (
                            <span className="text-fg-2 tnum">{st.lessonsDone}/{st.lessons.length}</span>
                          ) : <span className="text-fg-4">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-fg-3">Modül tablosunda yeşil: sınav geçildi (puan). Sayı: tamamlanan ders / toplam ders.</p>

      <AddBaristaSheet open={addOpen} onClose={() => setAddOpen(false)} storeId={storeFilter || undefined} onCreated={setCode} />
      <CodeSheet code={code} onClose={() => setCode(null)} />
    </Page>
  );
};

export const BaristaDetailPage: React.FC = () => {
  const { baristaId } = useParams();
  const navigate = useNavigate();
  const s = useStaffSession();
  const { stores, tracks, modules, lessons } = useContent();
  const { baristas, progress } = useStaffData();
  const badgeConfig = useBadgeConfig((x) => x.config);
  const b = baristas.find((x) => x.id === baristaId);
  // Baristanın BÜTÜN sınav geçmişi ve mağazasının bütün görevleri kendi
  // sorgusuyla: rozet ve önlük kararı kesik veriye dayanmasın (eskiden zincirin
  // son 300 sınavından ve son görevlerden hesaplanıyordu).
  const own = useBaristaAttempts(b?.id || null);
  const storeTasks = useStoreAssignments(b?.storeId || null);
  const [code, setCode] = useState<{ code: string; expiresAt: number; title: string; hint: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [badgeEdit, setBadgeEdit] = useState(false);
  const taskPage = useShowMore(30);

  if (!b) return <Page wide><PageTitle title="Barista bulunamadı" back="/baristalar" /></Page>;
  const p = progress[b.id] || EMPTY;
  const pct = overallPercent(modules, lessons, p, tracks);
  const mine = (own.data || []).filter((a) => a.submittedAt && !a.voided);
  const tasks = (storeTasks.data || []).filter((a) => !a.baristaId || a.baristaId === b.id).sort((x, y) => y.createdAt - x.createdAt);
  const first = b.name.split(' ')[0];
  // Silinmiş/görünmeyen içerik sayılmaz ("Geçilen modül 15/14" görünüyordu).
  const visMods = visibleModules(modules, tracks);
  const passedVisible = visMods.filter((m) => p.modules?.[m.id]).length;
  const lessonsDone = lessons.filter((l) => p.lessons?.[l.id]).length;
  const vctx: TaskValidityContext = { modules, lessons, tracks, baristas, stores };
  const historyReady = !!own.data && !!storeTasks.data;

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast(errorText(e), 'negative'); } setBusy(false); };
  const manage = can(s.role, 'manageBaristas');
  const report = badgeReport({
    tracks, modules, lessons, progress: p, attempts: mine, assignments: tasks, config: badgeConfig, ...fromBarista(b)
  });

  return (
    <Page wide>
      <PageTitle title={b.name} subtitle={`${stores.find((x) => x.id === b.storeId)?.name || ''} · ${BARISTA_ROLE_LABEL[b.role]} · İşe başlama ${b.startedAt ? fmtDate(new Date(b.startedAt).getTime()) : fmtDate(b.createdAt)}`} back />

      <div className="flex flex-wrap gap-2">
        {b.active && allowed(s.role, 'gorevAtama') && <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setAssignOpen(true)}><Icon name="flag" size={15} /> Görev ata</button>}
        {manage && <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setEditOpen(true)}><Icon name="edit" size={15} /> Düzenle</button>}
        {manage && b.active && (
          <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} disabled={busy} onClick={() => run(async () => {
            if (!confirm(`${first} için PIN sıfırlansın mı? Mevcut PIN hemen geçersiz olur.`)) return;
            const r = await backend.resetBaristaPin(b, authorName(s.role, s.name));
            setCode({ ...r, title: `${first} için yeni davet kodu`, hint: inviteHint(first) });
          })}><Icon name="key" size={15} /> {b.pinPending ? 'Yeni davet kodu' : 'PIN sıfırla'}</button>
        )}
        {!manage ? null : b.active ? (
          <button className={`${t.btn} ${t.btnDanger} ${t.btnMd}`} disabled={busy} onClick={() => run(async () => {
            if (!confirm(`${b.name} işten ayrıldı olarak işaretlensin mi?\n\nPIN'i tüm telefonlarda hemen geçersiz olur. Sınav geçmişi raporlarda kalır; istersen sonra geri alabilirsin.`)) return;
            await backend.setBaristaActive(b, false);
            toast(`${first} pasifleştirildi`);
          })}>İşten ayrıldı</button>
        ) : (
          <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} disabled={busy} onClick={() => run(async () => {
            const r = await backend.setBaristaActive(b, true, authorName(s.role, s.name));
            if (r.code) setCode({ code: r.code, expiresAt: r.expiresAt!, title: `${first} için davet kodu`, hint: inviteHint(first) });
          })}>Yeniden aktifleştir</button>
        )}
      </div>

      {b.pinPending && b.active && (
        <div className="flex gap-3 p-4 rounded-xl bg-caution-bg border border-caution-line text-[13px] leading-relaxed">
          <Icon name="key" size={18} className="text-caution mt-0.5" />
          <span>
            {first} henüz davet kodunu kullanmadı{b.codeIssuedByName ? ` (kodu veren: ${b.codeIssuedByName}` : ''}{b.codeIssuedByName && b.inviteExpiresAt ? `, son gün ${fmtDate(b.inviteExpiresAt)})` : b.codeIssuedByName ? ')' : ''}.
            {manage ? ' Kodu kaybettiyse "Yeni davet kodu" ile yenisini oluştur.' : ' Yeni kodu Bölge Müdürü verir.'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Genel ilerleme" value={`%${pct}`} icon="target" tone="positive" onClick={() => document.getElementById('b-moduller')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <Stat label="Geçilen modül" value={`${passedVisible}/${visMods.length}`} icon="award" onClick={() => document.getElementById('b-moduller')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <Stat label="Tamamlanan ders" value={lessonsDone} icon="book" onClick={() => document.getElementById('b-moduller')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <Stat label="Sınav denemesi" value={own.data ? mine.length : '…'} hint={mine.length ? `Ortalama ${Math.round(mine.reduce((x, a) => x + (a.score || 0), 0) / mine.length)} puan` : undefined} icon="clipboard" onClick={() => document.getElementById('b-sinavlar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div id="b-moduller" className="scroll-mt-20 flex flex-col">
        <Section label="Modüller">
          <div className={t.listGroup}>
            {tracks.filter((x) => x.published).flatMap((tr) => modules.filter((m) => m.trackId === tr.id && m.published)).map((m) => {
              const st = moduleState(m, lessons, p, { modules, tracks });
              return (
                <div key={m.id} className={t.listRowStatic}>
                  <span className={t.iconChip(st.passed ? 'positive' : st.lessonsDone ? 'caution' : 'neutral')}>
                    <Icon name={st.passed ? 'check' : st.locked ? 'lock' : 'book'} size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{m.title}</div>
                    <div className="text-[11px] text-fg-3">{st.lessonsDone}/{st.lessons.length} ders{st.passed ? ` · Geçti, ${st.score} puan (${fmtDate(p.modules[m.id].passedAt)})` : ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
        </div>

        <div className="flex flex-col gap-5">
          {historyReady ? <TitleCard report={report} /> : own.error || storeTasks.error ? <ErrorText>{own.error || storeTasks.error}</ErrorText> : <div className="py-4 flex justify-center"><Spinner /></div>}
          {historyReady && allowed(s.role, 'rozetAyar') && (
            <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm} self-start`} onClick={() => setBadgeEdit(true)}>
              <Icon name="edit" size={13} /> Rozet ve başarımları düzenle
            </button>
          )}
          {historyReady && (
            <Section label={`Başarımlar · ${report.earned}/${report.badges.length}`}>
              <BadgeGrid report={report} />
            </Section>
          )}
          <Section label="Görevler">
            {!storeTasks.data ? <div className="py-4 flex justify-center"><Spinner /></div> : tasks.length === 0 ? <Empty icon="flag" text="Atanmış görev yok." /> : (
              <>
              <div className={t.listGroup}>
                {tasks.slice(0, taskPage.limit).map((a) => {
                  const done = assignmentDone(a, p);
                  const invalid = !done && taskInvalidReason(a, vctx);
                  return (
                    <div key={a.id} className={`${t.listRowStatic} ${invalid ? 'opacity-60' : ''}`}>
                      <span className={t.iconChip(done ? 'positive' : invalid ? 'neutral' : isOverdue(a, done) ? 'negative' : 'caution')}><Icon name={done ? 'check' : 'flag'} size={15} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium flex items-center gap-2">{a.title}{invalid && <Badge>Geçersiz</Badge>}</div>
                        <div className="text-[11px] text-fg-3">
                          {done ? `Tamamlandı ${fmtDate(assignmentDoneAt(a, p))}` : invalid ? TASK_INVALID_LABEL[invalid] : a.dueAt ? `Son tarih ${fmtDate(a.dueAt)}` : 'Süresiz'}{!a.baristaId ? ' · Mağaza geneli' : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <ShowMore shown={taskPage.limit} total={tasks.length} onMore={taskPage.more} />
              </>
            )}
          </Section>
          <div id="b-sinavlar" className="scroll-mt-20 flex flex-col">
          <Section label="Sınav geçmişi">
            {!own.data ? (own.error ? <ErrorText>{own.error}</ErrorText> : <div className="py-4 flex justify-center"><Spinner /></div>) : mine.length === 0 ? <Empty icon="clipboard" text="Henüz sınav yok." /> : (
              <div className="flex flex-col gap-2">
                {mine.map((a) => <AttemptRow key={a.id} a={a} open={openAttempt === a.id} onToggle={() => setOpenAttempt(openAttempt === a.id ? null : a.id)} />)}
              </div>
            )}
          </Section>
          </div>
        </div>
      </div>

      <EditBaristaSheet open={editOpen} onClose={() => setEditOpen(false)} b={b} />
      <BadgeOverridesSheet open={badgeEdit} onClose={() => setBadgeEdit(false)} b={b} report={report} byName={authorName(s.role, s.name)} />
      <AssignSheet open={assignOpen} onClose={() => { setAssignOpen(false); invalidate(`assign-store:${b.storeId}`); storeTasks.reload(); }} creator={{ uid: s.uid, name: authorName(s.role, s.name) }} domain={domainOf(s.role)} baristas={baristas} preset={{ baristaId: b.id, storeId: b.storeId }} progressOf={(id) => progress[id]} />
      <CodeSheet code={code} onClose={() => { setCode(null); if (!b.active) navigate('/baristalar'); }} />
    </Page>
  );
};

const EditBaristaSheet: React.FC<{ open: boolean; onClose: () => void; b: Barista }> = ({ open, onClose, b }) => {
  const { stores } = useContent();
  const [name, setName] = useState(b.name);
  const [storeId, setStoreId] = useState(b.storeId);
  const [role, setRole] = useState<BaristaRole>(b.role);
  const [phone, setPhone] = useState(b.phone || '');
  const [startedAt, setStartedAt] = useState(b.startedAt || localDay(b.createdAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Her açılışta güncel bilgiyle başla: vazgeçilen düzenleme bir sonraki
  // açılışta duruyor ve fark edilmeden kaydedilebiliyordu.
  const initialStart = b.startedAt || localDay(b.createdAt);
  // Pencerenin hangi barista için açıldığı: sayfa başka baristaya geçerse
  // (tarayıcı geri) Kaydet o baristanın kaydını ezmesin.
  const openedFor = React.useRef(b.id);
  useEffect(() => {
    if (!open) return;
    openedFor.current = b.id;
    setName(b.name); setStoreId(b.storeId); setRole(b.role); setPhone(b.phone || ''); setStartedAt(initialStart); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const dirty = name !== b.name || storeId !== b.storeId || role !== b.role || phone !== (b.phone || '') || startedAt !== initialStart;
  const save = async () => {
    if (openedFor.current !== b.id) { setError('Sayfa başka bir baristaya geçti. Pencereyi kapatıp yeniden aç.'); return; }
    setBusy(true); setError(null);
    try {
      await backend.updateBarista(b, { name, storeId, role, phone, ...(startedAt !== b.startedAt ? { startedAt } : {}) });
      toast('Kaydedildi', 'positive');
      onClose();
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} title="Baristayı düzenle" onClose={onClose} dirty={!busy && dirty}
      footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save} disabled={busy}>Kaydet</button>}>
      <label className={t.field}><span className={t.label}>Ad soyad</span><input className={t.input} value={name} maxLength={MAX.name} onChange={(e) => setName(e.target.value)} /></label>
      <label className={t.field}><span className={t.label}>Mağaza</span>
        <select className={t.input} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {storeId !== b.storeId && <span className="text-[11px] text-caution">Mağaza değişince barista yeni mağazanın telefonunda görünür.</span>}
      </label>
      <label className={t.field}><span className={t.label}>Telefon</span><input className={t.input} value={phone} maxLength={20} inputMode="tel" onChange={(e) => setPhone(e.target.value)} /></label>
      <label className={t.field}><span className={t.label}>İşe başlama tarihi</span>
        <input className={t.input} type="date" value={startedAt} max={localDay()} onChange={(e) => setStartedAt(e.target.value)} />
        <span className="text-[11px] text-fg-3">Kıdem rozetleri buna göre hesaplanır.</span>
      </label>
      <div className={t.field}>
        <span className={t.label}>Rol</span>
        <div className={t.segment}>
          {BARISTA_ROLES.map((r) => (
            <button key={r} onClick={() => setRole(r)} className={`${t.segmentItem} ${role === r ? t.segmentItemOn : t.segmentItemOff}`}>{BARISTA_ROLE_LABEL[r]}</button>
          ))}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ */
/* Görevler                                                            */
/* ------------------------------------------------------------------ */

export const TasksPage: React.FC = () => {
  const s = useStaffSession();
  const { stores, modules, lessons, tracks } = useContent();
  const { baristas, progress, assignments: recent, assignmentsFrom } = useStaffData();
  const [open, setOpen] = useState(false);
  const [storeFilter, setStoreFilter] = useState('');
  // Canlı dinlenen: son ASSIGN_DAYS günde açılanlar. Daha eskiler istek üzerine (kota).
  const [older, setOlder] = useState<Assignment[] | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const loadOlder = async () => {
    setOlderBusy(true);
    try { setOlder(await loadOlderAssignments(assignmentsFrom)); } catch (e) { toast(errorText(e), 'negative'); }
    setOlderBusy(false);
  };
  const assignments = useMemo(() => (older ? [...recent, ...older.filter((o) => !recent.some((r) => r.id === o.id))] : recent), [recent, older]);
  // Bölge müdürünün ve mağaza müdürlerinin atadığı görevler de burada;
  // Kahve Operasyon Direktörü kimin ne atadığını bu süzgeçle görür.
  // Adı boş yazılmış atayan (uygulama geliştiricisi) süzgeçte görünmez.
  const [byFilter, setByFilter] = useState('');
  const creators = [...new Map(assignments.filter((a) => a.createdByName).map((a) => [a.createdBy, a.createdByName])).entries()];
  const [params, setParams] = useSearchParams();
  const onlyOverdue = params.get('durum') === 'geciken';

  // Açık ve tamamlanan ayrı: liste zamanla bitmiş görevlerle doluyor,
  // gecikenler aşağıda kalıyordu.
  const tab: 'open' | 'done' = params.get('sekme') === 'tamamlanan' ? 'done' : 'open';
  const setTab = (x: 'open' | 'done') => setParams(x === 'done' ? { sekme: 'tamamlanan' } : {}, { replace: true });
  const vctx: TaskValidityContext = { modules, lessons, tracks, baristas, stores };
  const all = assignments.filter((a) => (!storeFilter || a.storeId === storeFilter) && (!byFilter || a.createdBy === byFilter)).map((a) => {
    const targets = taskTargets(a, baristas);
    const done = targets.filter((b) => assignmentDone(a, progress[b.id]));
    const complete = targets.length > 0 && done.length === targets.length;
    const doneAt = complete ? Math.max(...done.map((b) => assignmentDoneAt(a, progress[b.id]) || 0)) : 0;
    // Hiç tamamlanamayacak görev: hedef kalmadı ya da bağlı içerik silindi.
    const invalid = complete ? null : taskInvalidReason(a, vctx);
    return { a, targets, done, complete, doneAt, invalid };
  });
  const openAll = all.filter((r) => !r.complete && !r.invalid);
  const invalidAll = all.filter((r) => !r.complete && r.invalid);
  const doneAll = all.filter((r) => r.complete);
  // Açıklar son tarihe göre (gecikenler doğal olarak en üstte), tarihsizler sonda;
  // tamamlananlar bitiş tarihine göre, en yeni üstte.
  const rows = (tab === 'done'
    ? [...doneAll].sort((x, y) => y.doneAt - x.doneAt)
    : [...openAll].sort((x, y) => (x.a.dueAt ?? Infinity) - (y.a.dueAt ?? Infinity) || y.a.createdAt - x.a.createdAt)
  ).filter(({ a, complete }) => tab === 'done' || !onlyOverdue || (!complete && !!a.dueAt && a.dueAt < Date.now()));
  const shownInvalid = tab === 'open' && !onlyOverdue ? invalidAll : [];
  // Uzun liste parça parça çizilir (300 görevde sayfa 34.000 px oluyordu).
  const page = useShowMore(30, `${tab}|${storeFilter}|${byFilter}|${onlyOverdue}`);
  const pageInvalid = useShowMore(30, `${storeFilter}|${byFilter}`);

  const remove = async (a: Assignment) => {
    if (!confirm('Görev silinsin mi?')) return;
    try { await deleteDoc(doc(db, 'assignments', a.id)); setOlder((o) => o && o.filter((x) => x.id !== a.id)); toast('Görev silindi'); }
    catch (e) { toast(errorText(e), 'negative'); }
  };

  const Row: React.FC<{ r: (typeof all)[number] }> = ({ r: { a, targets, done, complete, doneAt, invalid } }) => {
    const overdue = !complete && !invalid && a.dueAt && a.dueAt < Date.now();
    const who = a.baristaId ? baristas.find((b) => b.id === a.baristaId)?.name || 'Ayrılan barista' : 'Tüm mağaza';
    return (
      <div className={`${t.listRowStatic} flex-wrap ${invalid ? 'opacity-60' : ''}`}>
        <span className={t.iconChip(complete ? 'positive' : invalid ? 'neutral' : overdue ? 'negative' : 'caution')}><Icon name={a.kind === 'lesson' ? 'book' : 'clipboard'} size={15} /></span>
        <div className="flex-1 min-w-[200px]">
          <div className="text-[14px] font-medium flex items-center gap-2 flex-wrap">{a.title}{invalid && <Badge>Geçersiz</Badge>}</div>
          <div className="text-[12px] text-fg-3">
            {stores.find((x) => x.id === a.storeId)?.name} · {who}{a.createdByName ? ` · Atayan: ${a.createdByName}` : ''}
            {complete ? ` · Tamamlandı ${fmtDate(doneAt)}` : invalid ? ` · ${TASK_INVALID_LABEL[invalid]}` : a.dueAt ? ` · ${overdue ? 'Gecikti' : relDays(a.dueAt)}` : ''}
          </div>
          {!invalid && targets.length > 1 && (
            <div className="text-[11px] text-fg-3 mt-1">
              Bekleyen: {targets.filter((b) => !done.includes(b)).map((b) => b.name.split(' ')[0]).join(', ') || '—'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!invalid && <div className="w-24"><ProgressBar value={targets.length ? (done.length / targets.length) * 100 : 0} /></div>}
          {!invalid && <span className="text-[12px] tnum w-10">{done.length}/{targets.length}</span>}
          {(a.createdBy === s.uid || can(s.role, 'manageTeam')) && (
            <button className={t.iconBtn} title="Sil" aria-label="Görevi sil" onClick={() => remove(a)}><Icon name="trash" size={14} /></button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Page wide>
      <PageTitle title="Görevler" subtitle="Atanan dersler ve sınavlar; tamamlanma otomatik izlenir."
        action={allowed(s.role, 'gorevAtama') ? <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setOpen(true)}><Icon name="plus" size={15} /> Görev ata</button> : undefined} />
      <div className="flex flex-wrap gap-2 items-center">
        <div className={t.segment}>
          <button className={`${t.segmentItem} ${tab === 'open' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('open')}>Açık · {openAll.length}</button>
          <button className={`${t.segmentItem} ${tab === 'done' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('done')}>Tamamlanan · {doneAll.length}</button>
        </div>
        <select className={`${t.input} h-9 w-auto text-[14px]`} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} aria-label="Mağaza">
          <option value="">Tüm mağazalar</option>
          {stores.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select className={`${t.input} h-9 w-auto text-[14px]`} value={byFilter} onChange={(e) => setByFilter(e.target.value)} aria-label="Atayan">
          <option value="">Atayan: herkes</option>
          {creators.map(([uid, name]) => <option key={uid} value={uid}>{uid === s.uid ? `${name} (sen)` : name}</option>)}
        </select>
        {tab === 'open' && (
          <button onClick={() => setParams(onlyOverdue ? {} : { durum: 'geciken' }, { replace: true })} className={`${t.chip} ${onlyOverdue ? t.chipOn : t.chipOff}`}>
            Yalnızca gecikenler {onlyOverdue && <Icon name="close" size={12} />}
          </button>
        )}
      </div>
      {rows.length === 0 && shownInvalid.length === 0 ? <Empty icon="flag" text={tab === 'done' ? 'Tamamlanan görev yok.' : onlyOverdue ? 'Gecikmiş görev yok.' : all.length ? 'Açık görev yok, hepsi tamamlandı.' : 'Henüz görev atanmadı.'} /> : (
        <>
          {rows.length > 0 && <div className={t.listGroup}>{rows.slice(0, page.limit).map((r) => <Row key={r.a.id} r={r} />)}</div>}
          <ShowMore shown={page.limit} total={rows.length} onMore={page.more} />
          {shownInvalid.length > 0 && (
            <Section label={`Geçersiz · ${shownInvalid.length}`}>
              <p className="text-[12px] text-fg-3 -mt-1">Hiç tamamlanamayacak görevler: gecikmiş sayılmaz. İstersen silebilirsin.</p>
              <div className={t.listGroup}>{shownInvalid.slice(0, pageInvalid.limit).map((r) => <Row key={r.a.id} r={r} />)}</div>
              <ShowMore shown={pageInvalid.limit} total={shownInvalid.length} onMore={pageInvalid.more} />
            </Section>
          )}
        </>
      )}
      <div className="flex items-center gap-2">
        {older === null ? (
          <button className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} disabled={olderBusy} onClick={loadOlder}>
            {olderBusy ? <Spinner size={13} /> : <Icon name="clock" size={13} />} {fmtDate(assignmentsFrom)} tarihinden önceki görevleri göster
          </button>
        ) : <span className="text-[12px] text-fg-3">Eski görevler de listede ({older.length}).</span>}
      </div>
      <AssignSheet open={open} onClose={() => setOpen(false)} creator={{ uid: s.uid, name: authorName(s.role, s.name) }} domain={domainOf(s.role)} baristas={baristas} progressOf={(id) => progress[id]} />
    </Page>
  );
};
