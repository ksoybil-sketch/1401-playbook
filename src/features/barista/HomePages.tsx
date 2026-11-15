import { FeedbackRow } from '../shared/Feedback';
import { NewThemeBanner, ThemesSection } from './Themes';
import { ChangePinRow } from './ChangePin';
import React, { useMemo, useState } from 'react';
import { TitleCard, BadgeGrid, TitleChip } from '../shared/Badges';
import { badgeReport, fromBarista } from '../../lib/badges';
import { useBadgeConfig } from '../../store/badgeConfig';
import { BARISTA_ROLE_LABEL, isManager } from '../../lib/roles';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent } from '../../store/content';
import { useQueryLive } from '../../hooks/useFirestore';
import { assignmentDone, assignmentDoneAt, isOverdue, nextLesson, overallPercent, moduleState, visibleModules, EMPTY_PROGRESS } from '../../lib/progress';
import { isTaskValid, taskInvalidReason, TASK_INVALID_LABEL } from '../../lib/taskValidity';
import { Icon, type IconName } from '../../ui/Icon';
import { HUE, trackHue, type Hue } from '../../ui/palette';
import { RECIPE_TRACK_ID } from '../../lib/search';
import { Page, PageTitle, Section, Ring, Empty, Badge, Avatar, ProgressBar, relDays, fmtDateTime, fmtDate, Spinner, Sheet, toast, useShowMore } from '../../ui/kit';
import { createRequest, isClosed } from '../../api/requests';
import { errorText } from '../../api/backend';
import { useStoreRequests } from './RequestsPage';
import * as t from '../../ui/tokens';
import { useBaristaSession, useMyAssignments, useMyBadgeReport, useMyBulletins, useMyProgress } from './useBaristaData';
import { MistakeCard } from './ExamPage';
import { useExamSize } from './useExamSize';
import { AssignSheet } from '../shared/AssignSheet';
import type { Assignment, Attempt, Barista, Progress } from '../../../shared/types';

/* ------------------------------------------------------------------ */
/* Bugün                                                               */
/* ------------------------------------------------------------------ */

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

/** Ana sayfadaki renkli hızlı erişim kutusu. */
const Tile: React.FC<{ to: string; hue: Hue; icon: IconName; label: string; title: string; hint?: string; badge?: number }> = ({ to, hue, icon, label, title, hint, badge }) => (
  <Link to={to} className={`tile relative rounded-2xl border p-3.5 flex flex-col gap-2.5 min-h-[124px] active:scale-[0.98] transition-transform ${HUE[hue].tile}`}>
    <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${HUE[hue].chip}`}><Icon name={icon} size={18} strokeWidth={1.9} /></span>
    {!!badge && badge > 0 && (
      <span className="absolute top-3 right-3 min-w-5 h-5 px-1.5 rounded-full bg-crema text-espresso text-[11px] font-bold flex items-center justify-center tnum">{badge > 9 ? '9+' : badge}</span>
    )}
    <div className="mt-auto min-w-0">
      <div className={`text-[10.5px] font-semibold uppercase tracking-[0.06em] ${HUE[hue].text}`}>{label}</div>
      <div className="text-[14px] font-semibold leading-snug line-clamp-2">{title}</div>
      {hint && <div className="text-[11.5px] text-fg-3 mt-0.5 truncate">{hint}</div>}
    </div>
  </Link>
);

export const HomePage: React.FC = () => {
  const s = useBaristaSession();
  const { tracks, modules, lessons } = useContent();
  const { progress } = useMyProgress();
  const { items: assignments } = useMyAssignments();
  const { items: bulletins, unread: unreadBulletins } = useMyBulletins();
  const { report } = useMyBadgeReport();
  const pct = overallPercent(modules, lessons, progress, tracks);
  const next = nextLesson(tracks, modules, lessons, progress);
  const scope = { modules, tracks };
  // Son tarihe göre: gecikenler ve yaklaşanlar önce, tarihsizler sonda.
  // Geçersiz görevler (bağlı ders/modül silinmiş ya da görünmüyor) listede
  // yer almaz: bitirilemezler, gecikmiş de sayılmazlar (bkz. lib/taskValidity.ts).
  const open = assignments.filter((a) => !assignmentDone(a, progress) && isTaskValid(a, { modules, lessons, tracks }))
    .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
  const [allTasks, setAllTasks] = useState(false);
  // "Tüm dersler bitti" yalnızca gerçekten bittiyse: kilitli modüller
  // varken yeni barista müfredatın çoğu önündeyken bunu görüyordu.
  const lockedLeft = useMemo(() => visibleModules(modules, tracks).some((m) => moduleState(m, lessons, progress, { modules, tracks }).locked), [modules, tracks, lessons, progress]);
  const latestBulletin = bulletins.find((b) => !progress.bulletins?.[b.id]) || bulletins[0];
  // Baristaya görünen modüller: modül ve yolu yayında.
  const pubModules = visibleModules(modules, tracks);
  const recipeCount = lessons.filter((l) => l.published && pubModules.some((m) => m.id === l.moduleId && m.trackId === RECIPE_TRACK_ID)).length;

  // Girmesi gereken sınav: önce atanmış olanlar, sonra dersleri biten modül,
  // yoksa üzerinde çalıştığı modül (kaç ders kaldığıyla).
  const exam = useMemo(() => {
    const states = pubModules.map((m) => ({ mod: m, st: moduleState(m, lessons, progress, scope) })).filter((x) => !x.st.locked && !x.st.passed);
    const assigned = open.filter((a) => a.kind === 'module').map((a) => states.find((x) => x.mod.id === a.targetId)).filter(Boolean) as typeof states;
    const ready = states.filter((x) => x.st.lessons.length > 0 && x.st.lessonsDone === x.st.lessons.length);
    const pick = assigned.find((x) => x.st.lessonsDone === x.st.lessons.length) || ready[0] || assigned[0]
      || (next ? states.find((x) => x.mod.id === next.module.id) : undefined);
    if (!pick) return null;
    const left = pick.st.lessons.length - pick.st.lessonsDone;
    return { ...pick, ready: left === 0, left, assigned: assigned.includes(pick), readyCount: ready.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubModules, lessons, progress, open, next]);
  // Hazır sınavın gerçek soru sayısı (bkz. useExamSize).
  const examSize = useExamSize(exam?.ready ? exam.mod : null);

  // En yakın iki rozet: kazanılmamışlar içinde ilerlemesi en yüksek olanlar.
  const nearest = report.badges.filter((b) => !b.earned)
    .sort((a, b) => b.progress[0] / b.progress[1] - a.progress[0] / a.progress[1]).slice(0, 2);
  const earned = report.badges.filter((b) => b.earned);
  const toNext = report.next ? Math.max(0, report.next.title.badges - report.earned) : 0;
  const nextPct = report.next ? Math.round((report.next.reqs.filter((r) => r.met).length / report.next.reqs.length) * 100) : 100;

  return (
    <Page>
      {/* Kahraman kart: kim olduğun, unvanın, nereye gittiğin. */}
      <Link to="/sonuclarim" className="hero rounded-3xl p-4 border border-[#D9A066]/25 bg-linear-to-br from-[#D9A066]/20 via-roast to-bean flex flex-col gap-3.5 active:scale-[0.99] transition-transform">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-fg-2">{greeting()},</div>
            <h1 className="text-[26px] font-bold leading-tight truncate">{s.name.split(' ')[0]}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              {report.title ? <TitleChip report={report} size="md" /> : <span className="text-[12px] text-fg-3">İlk rozetin: Rookie</span>}
              <span className="text-[12px] text-fg-3">{report.earned} başarım</span>
            </div>
          </div>
          <Ring value={pct} size={76} stroke={7} color={HUE.amber.hex} />
        </div>
        {report.next && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-fg-2">Sıradaki rozet: <strong className="text-crema">{report.next.title.label}</strong></span>
              <span className="text-fg-3">{toNext > 0 ? `${toNext} başarım kaldı` : 'Başarım sayısı tamam'}</span>
            </div>
            <div className="h-2 rounded-full bg-panel-3 overflow-hidden">
              <div className="h-full rounded-full bg-linear-to-r from-[#D9A066] to-[#E07A6E] transition-[width] duration-700" style={{ width: `${nextPct}%` }} />
            </div>
          </div>
        )}
      </Link>

      {/* Eğitimle yeni bir tema açıldıysa haber ver (Ben → Temalar). */}
      <NewThemeBanner />

      {/* Servis sırasında en çok ihtiyaç duyulan şey. */}
      <Link to="/receteler?focus=1" className="h-12 rounded-2xl border border-line-2 bg-panel-2 flex items-center gap-3 px-4 text-fg-3 active:bg-panel-3">
        <Icon name="search" size={18} />
        <span className="text-[15px]">İçecek ya da malzeme ara</span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Tile to="/receteler" hue="amber" icon="coffee" label="Reçeteler" title={`${recipeCount} içecek`} />
        {exam ? (
          <Tile to={exam.ready ? `/sinav/${exam.mod.id}` : `/modul/${exam.mod.id}`} hue="rose" icon="clipboard"
            label={exam.ready ? 'Sınava hazırsın' : exam.assigned ? 'Atanan sınav' : 'Sıradaki sınav'}
            title={exam.mod.title}
            hint={exam.ready ? (examSize.empty ? 'Bu modülde şu an soru yok' : `${examSize.size} soru · ${Math.ceil(examSize.size * 1.5)} dk`) : `Önce ${exam.left} ders`}
            badge={exam.readyCount > 1 ? exam.readyCount : undefined} />
        ) : (
          <Tile to="/sonuclarim" hue="rose" icon="medal" label="Sınavlar" title="Bekleyen sınavın yok" />
        )}
        {next ? (
          <Tile to={`/ders/${next.lesson.id}`} hue="sky" icon="play" label="Kaldığın ders" title={next.lesson.title} hint={`${next.module.title} · ${next.lesson.durationMin} dk`} />
        ) : (
          <Tile to="/akademi" hue="sky" icon="cap" label="Akademi" title={lockedLeft ? 'Açık dersler bitti' : 'Tüm dersler bitti'} hint={lockedLeft ? 'Sıradakiler sınavı geçince açılır' : undefined} />
        )}
        <Tile to="/bulten" hue="mint" icon="bell" label={unreadBulletins ? 'Yeni duyuru' : 'Bülten'} title={latestBulletin?.title || 'Duyuru yok'}
          hint={unreadBulletins ? `${unreadBulletins} okunmamış` : 'Hepsini okudun'} badge={unreadBulletins} />
      </div>

      {open.length > 0 && (
        <Section label={`Görevlerin · ${open.length}`}>
          <div className={t.listGroup}>
            {(allTasks ? open : open.slice(0, 3)).map((a) => <AssignmentRow key={a.id} a={a} progress={progress} />)}
            {/* Başlık "Görevlerin · 5" deyip yalnızca 3'ünü gösteriyordu; kalanlar hiçbir yerde yoktu. */}
            {open.length > 3 && (
              <button onClick={() => setAllTasks((v) => !v)} className={`${t.listRow} justify-center text-[13px] text-fg-2`}>
                {allTasks ? 'Daha az göster' : `+${open.length - 3} görev daha`}
              </button>
            )}
          </div>
        </Section>
      )}

      <Section label={`Başarımların · ${earned.length}/${report.badges.length}`} action={<Link to="/sonuclarim" className="text-[12px] text-fg-2 inline-flex items-center min-h-11 -my-3 px-2 -mx-2">Tümü</Link>}>
        <Link to="/sonuclarim" className={`${t.card} p-3.5 flex flex-col gap-3`}>
          {earned.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
              {earned.map((b) => (
                <span key={b.id} className="flex flex-col items-center gap-1 w-16 shrink-0">
                  <span className="medal earned w-11 h-11 rounded-full flex items-center justify-center bg-linear-to-br from-[#E8B47E] to-[#C0794A] text-[#1A120C]"><Icon name={b.icon} size={19} strokeWidth={1.9} /></span>
                  <span className="text-[10.5px] text-center leading-tight text-fg-2 line-clamp-2">{b.title}</span>
                </span>
              ))}
            </div>
          ) : (
            // Rozet kuralları Rozetler ekranından değişebiliyor: sabit metin
            // ("Oryantasyon'u bitirince") yanlış kalabiliyordu.
            <div className="text-[13px] text-fg-2">{nearest.length ? 'Henüz başarımın yok. En yakın olanlar aşağıda.' : 'Ders bitirip sınav geçtikçe başarımların burada görünür.'}</div>
          )}
          {nearest.map((b) => (
            <div key={b.id} className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full flex items-center justify-center bg-panel-3 text-fg-3 shrink-0"><Icon name={b.icon} size={15} /></span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[12.5px]"><span className="font-medium">{b.title}</span><span className="text-fg-3 tnum">%{Math.round((b.progress[0] / b.progress[1]) * 100)}</span></div>
                <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(b.progress[0] / b.progress[1]) * 100}%`, background: HUE.violet.hex }} /></div>
              </div>
            </div>
          ))}
        </Link>
      </Section>

      <Section label="Eğitim yolların">
        <div className="flex flex-col gap-2">
          {tracks.filter((x) => x.published).map((tr, i) => {
            const mods = pubModules.filter((m) => m.trackId === tr.id);
            const done = mods.filter((m) => moduleState(m, lessons, progress).passed).length;
            const hue = HUE[trackHue(tr.id, i)];
            return (
              <Link key={tr.id} to={`/akademi/${tr.id}`} className={`${t.cardInteractive} p-3 flex items-center gap-3`}>
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${hue.chip}`}><Icon name={(tr.icon as IconName) || 'book'} size={17} /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-[13.5px]"><span className="font-semibold truncate">{tr.title}</span><span className="text-fg-3 tnum shrink-0 ml-2">{done}/{mods.length}</span></div>
                  <div className="h-1.5 rounded-full bg-white/10 mt-1.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${mods.length ? (done / mods.length) * 100 : 0}%`, background: hue.hex }} /></div>
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section label="Tüm bölümler">
        <div className="grid grid-cols-3 gap-2">
          {[
            { to: '/receteler', icon: 'coffee' as IconName, label: 'Reçeteler', hue: 'amber' as Hue },
            { to: '/akademi', icon: 'cap' as IconName, label: 'Akademi', hue: 'sky' as Hue },
            { to: '/bulten', icon: 'bell' as IconName, label: 'Bülten', hue: 'mint' as Hue },
            { to: '/sonuclarim', icon: 'medal' as IconName, label: 'Rozet ve başarımlar', hue: 'violet' as Hue },
            ...(isManager(s.role) ? [
              { to: '/ekip', icon: 'users' as IconName, label: 'Ekibim', hue: 'rose' as Hue },
              { to: '/talepler', icon: 'wrench' as IconName, label: 'Talepler', hue: 'sand' as Hue }
            ] : [])
          ].map((x) => (
            <Link key={x.to} to={x.to} className={`${t.cardInteractive} p-3 flex flex-col items-center gap-2 text-center`}>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${HUE[x.hue].chip}`}><Icon name={x.icon} size={18} /></span>
              <span className="text-[12px] font-medium leading-tight">{x.label}</span>
            </Link>
          ))}
        </div>
      </Section>
    </Page>
  );
};

const AssignmentRow: React.FC<{ a: Assignment; progress: Progress }> = ({ a, progress }) => {
  const done = assignmentDone(a, progress);
  const overdue = isOverdue(a, done);
  // Mini sınav görevi reçeteye gider; sınav düğmesi orada.
  const to = a.kind === 'lesson' ? `/ders/${a.targetId}` : a.kind === 'quiz' ? `/recete/${a.targetId}` : `/modul/${a.targetId}`;
  return (
    <Link to={to} className={t.listRow}>
      <span className={t.iconChip(overdue ? 'negative' : 'caution')}><Icon name={a.kind === 'lesson' ? 'book' : 'clipboard'} size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium leading-snug">{a.title}</div>
        <div className="text-[12px] text-fg-3 mt-0.5 truncate">
          {[a.createdByName, a.note].filter(Boolean).join(' · ')}
        </div>
      </div>
      {a.dueAt && <Badge tone={overdue ? 'negative' : 'neutral'}>{overdue ? 'Gecikti' : relDays(a.dueAt)}</Badge>}
    </Link>
  );
};

/* ------------------------------------------------------------------ */
/* Sonuçlarım                                                          */
/* ------------------------------------------------------------------ */

export const ResultsPage: React.FC = () => {
  const s = useBaristaSession();
  // Rozetler tüm sınav geçmişinden hesaplanır (bkz. src/lib/badges.ts).
  const { report, attempts: submitted, loading } = useMyBadgeReport();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Page>
      <PageTitle title={s.name.split(' ')[0]} subtitle={`${s.storeName}${s.role !== 'barista' ? ` · ${BARISTA_ROLE_LABEL[s.role]}` : ''}`} />

      {/* Alt menüde beş sekmeden fazlası sığmıyor; mağaza ve vardiya
          müdürünün ekip ve talep ekranları buradan açılıyor. */}
      {isManager(s.role) && (
        <div className={t.listGroup}>
          <Link to="/ekip" className={t.listRow}>
            <span className={t.iconChip('accent')}><Icon name="users" size={16} /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium">Ekibim</div>
            </div>
            <Icon name="chevronRight" size={16} className={t.rowChevron} />
          </Link>
          <Link to="/talepler" className={t.listRow}>
            <span className={t.iconChip('caution')}><Icon name="wrench" size={16} /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium">Talepler</div>
            </div>
            <Icon name="chevronRight" size={16} className={t.rowChevron} />
          </Link>
        </div>
      )}

      <TitleCard report={report} self />

      <Section label={`Başarımlar · ${report.earned}/${report.badges.length}`}>
        <BadgeGrid report={report} />
      </Section>

      <Section label="Sınav geçmişi">
        {loading ? <div className="flex justify-center py-8"><Spinner /></div> : submitted.length === 0 ? (
          <Empty icon="clipboard" text="Henüz sınava girmedin." />
        ) : (
          <div className="flex flex-col gap-2">
            {submitted.map((a) => (
              <AttemptRow key={a.id} a={a} open={open === a.id} onToggle={() => setOpen(open === a.id ? null : a.id)} />
            ))}
          </div>
        )}
      </Section>

      <ThemesSection />

      <ChangePinRow />

      <FeedbackRow />
    </Page>
  );
};

export const AttemptRow: React.FC<{ a: Attempt; open: boolean; onToggle: () => void; showName?: boolean }> = ({ a, open, onToggle, showName }) => (
  <div className={`${t.card} overflow-hidden`}>
    <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-panel-2 transition-colors">
      <Badge tone={a.passed ? 'positive' : 'negative'}>{a.score ?? '–'} puan</Badge>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium truncate">{showName ? `${a.baristaName} · ` : ''}{a.moduleTitle}</div>
        <div className="text-[12px] text-fg-3">{fmtDateTime(a.submittedAt)} · {a.correct}/{a.total} doğru{a.regradedAt ? ' · hatalı soru iptal edildi, yeniden puanlandı' : ''}</div>
      </div>
      {(a.mistakes?.length || 0) > 0 && <Icon name={open ? 'arrowUp' : 'arrowDown'} size={15} className="text-fg-3" />}
    </button>
    {open && (a.mistakes?.length || 0) > 0 && (
      <div className="border-t border-line p-3 flex flex-col gap-2 bg-panel">
        {a.mistakes!.map((m) => <MistakeCard key={m.questionId} m={m} />)}
      </div>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/* Ekibim (mağaza / vardiya müdürü)                                   */
/* ------------------------------------------------------------------ */

export const TeamPage: React.FC = () => {
  const s = useBaristaSession();
  const { modules, lessons } = useContent();
  const [assignOpen, setAssignOpen] = useState(false);
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);

  const { data: baristas } = useQueryLive<Barista>(
    query(collection(db, 'baristas'), where('storeId', '==', s.storeId), where('active', '==', true)),
    `team-b-${s.storeId}`
  );
  const { data: progressList } = useQueryLive<Progress & { id: string }>(
    query(collection(db, 'progress'), where('storeId', '==', s.storeId)),
    `team-p-${s.storeId}`
  );
  // Unvanlar tüm geçmişten hesaplanır; listede yalnızca son 20 sınav gösterilir.
  const { data: attempts } = useQueryLive<Attempt>(
    query(collection(db, 'attempts'), where('storeId', '==', s.storeId), orderBy('startedAt', 'desc'), limit(400)),
    `team-a-${s.storeId}`
  );
  const { tracks } = useContent();
  const badgeConfig = useBadgeConfig((x) => x.config);
  const { data: assignments } = useQueryLive<Assignment>(
    query(collection(db, 'assignments'), where('storeId', '==', s.storeId)),
    `team-asg-${s.storeId}`
  );

  const progressOf = (id: string) => progressList.find((p) => p.id === id);
  const sorted = [...baristas].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const [member, setMember] = useState<string | null>(null);
  const memberB = baristas.find((b) => b.id === member) || null;

  // Mağazanın görevleri: açıklar son tarihe göre (gecikenler üstte), bitenler sonda.
  // Geçersiz görev (hedefi kalmamış ya da bağlı içeriği silinmiş) açık ya da
  // gecikmiş sayılmaz; kapananlarla birlikte "Geçersiz" etiketiyle durur.
  const taskRows = assignments.map((a) => {
    const targets = baristas.filter((b) => !a.baristaId || a.baristaId === b.id);
    const done = targets.filter((b) => assignmentDone(a, progressOf(b.id)));
    const invalid = taskInvalidReason(a, { modules, lessons, tracks, baristas });
    return { a, targets, done, invalid, complete: !invalid && targets.length > 0 && done.length === targets.length };
  }).sort((x, y) => Number(x.complete || !!x.invalid) - Number(y.complete || !!y.invalid) || (x.a.dueAt ?? Infinity) - (y.a.dueAt ?? Infinity) || y.a.createdAt - x.a.createdAt);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  // Uzun görev listesi parça parça (300 görevde Ekibim 22.000 px oluyordu).
  const taskPage = useShowMore(30, showDoneTasks);
  const openTaskRows = taskRows.filter((r) => !r.complete && !r.invalid);
  const doneTaskRows = taskRows.filter((r) => r.complete || r.invalid);
  const validTask = (a: Assignment) => isTaskValid(a, { modules, lessons, tracks });

  return (
    <Page>
      <PageTitle
        title="Ekibim"
        subtitle={s.storeName}
        action={<button onClick={() => setAssignOpen(true)} className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`}><Icon name="plus" size={15} /> Görev</button>}
      />

      <Section label={`Baristalar · ${sorted.length}`}>
        <div className={t.listGroup}>
          {sorted.map((b) => {
            const p = progressOf(b.id);
            const pct = p ? overallPercent(modules, lessons, p, tracks) : 0;
            const mine = assignments.filter((a) => (!a.baristaId || a.baristaId === b.id) && validTask(a));
            const openTasks = mine.filter((a) => !assignmentDone(a, p)).length;
            const overdue = mine.filter((a) => isOverdue(a, assignmentDone(a, p))).length;
            const report = badgeReport({
              tracks, modules, lessons, progress: p || { baristaId: b.id, storeId: b.storeId, lessons: {}, modules: {}, updatedAt: 0 },
              attempts: attempts.filter((a) => a.baristaId === b.id && a.submittedAt && !a.voided), assignments: mine, config: badgeConfig, ...fromBarista(b)
            });
            return (
              <button key={b.id} onClick={() => setMember(b.id)} className={`${t.listRow} text-left`}>
                <Avatar name={b.name} size={36} dim={b.pinPending} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium truncate flex items-center gap-1.5">{b.name} <TitleChip report={report} /> <span className="text-[11px] text-fg-3 font-normal">{report.earned} başarım</span></div>
                  <ProgressBar value={pct} className="mt-1.5 max-w-[180px]" />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[12px] font-semibold tnum">%{pct}</span>
                  {overdue > 0 ? <Badge tone="negative">{overdue} gecikmiş</Badge> : openTasks > 0 ? <Badge>{openTasks} görev</Badge> : null}
                </div>
                <Icon name="chevronRight" size={16} className={t.rowChevron} />
              </button>
            );
          })}
        </div>
      </Section>

      {/* Atanan görevler: kim bitirdi, kim bekliyor. Müdür kendi atadığını silebilir. */}
      <Section label={`Görevler · ${openTaskRows.length} açık`}>
        {taskRows.length === 0 ? (
          <Empty icon="flag" text="Mağazaya atanmış görev yok. Sağ üstteki “Görev” ile atayabilirsin." />
        ) : (
          <div className={t.listGroup}>
            {openTaskRows.length === 0 && <div className={`${t.listRowStatic} text-[13px] text-fg-3`}>Açık görev yok, hepsi tamamlandı.</div>}
            {[...openTaskRows, ...(showDoneTasks ? doneTaskRows : [])].slice(0, taskPage.limit).map(({ a, targets, done, complete, invalid }) => {
              const late = !complete && !invalid && !!a.dueAt && a.dueAt < Date.now();
              const waiting = targets.filter((b) => !done.includes(b));
              return (
                <div key={a.id} className={`${t.listRowStatic} ${complete || invalid ? 'opacity-60' : ''}`}>
                  <span className={t.iconChip(complete ? 'positive' : invalid ? 'neutral' : late ? 'negative' : 'caution')}><Icon name={complete ? 'check' : invalid ? 'close' : a.kind === 'lesson' ? 'book' : 'clipboard'} size={15} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium leading-snug">{a.title}</div>
                    <div className="text-[12px] text-fg-3 mt-0.5">
                      {a.baristaId ? (baristas.find((b) => b.id === a.baristaId)?.name || '—') : 'Tüm mağaza'} · {done.length}/{targets.length} bitirdi {a.createdBy === s.uid ? ' · Atayan: sen' : a.createdByName ? ` · Atayan: ${a.createdByName}` : ''}
                    </div>
                    {invalid && <div className="text-[11.5px] text-fg-3 mt-0.5">Geçersiz: {TASK_INVALID_LABEL[invalid]}</div>}
                    {!complete && !invalid && targets.length > 1 && waiting.length > 0 && (
                      <div className="text-[11.5px] text-fg-3 mt-0.5">Bekleyen: {waiting.map((b) => b.name.split(' ')[0]).join(', ')}</div>
                    )}
                  </div>
                  {invalid ? <Badge>Geçersiz</Badge> : !complete && a.dueAt && <Badge tone={late ? 'negative' : 'neutral'}>{late ? 'Gecikti' : relDays(a.dueAt)}</Badge>}
                  {a.createdBy === s.uid && (
                    <button className={t.iconBtn} aria-label="Görevi sil" onClick={async () => {
                      if (!confirm(`“${a.title}” görevi silinsin mi?`)) return;
                      try { await deleteDoc(doc(db, 'assignments', a.id)); toast('Görev silindi'); } catch (e) { toast(errorText(e), 'negative'); }
                    }}><Icon name="trash" size={14} /></button>
                  )}
                </div>
              );
            })}
            {openTaskRows.length + (showDoneTasks ? doneTaskRows.length : 0) > taskPage.limit && (
              <button onClick={taskPage.more} className={`${t.listRow} justify-center text-[13px] text-fg-2`}>
                Daha fazla göster · {openTaskRows.length + (showDoneTasks ? doneTaskRows.length : 0) - taskPage.limit} kaldı
              </button>
            )}
            {doneTaskRows.length > 0 && (
              <button onClick={() => setShowDoneTasks((v) => !v)} className={`${t.listRow} justify-center text-[13px] text-fg-2`}>
                {showDoneTasks ? 'Kapananları gizle' : `Tamamlanan ve geçersizleri göster · ${doneTaskRows.length}`}
              </button>
            )}
          </div>
        )}
      </Section>

      <Section label="Son sınavlar">
        {attempts.filter((a) => a.submittedAt && !a.voided).length === 0 ? (
          <Empty icon="clipboard" text="Ekipte henüz sınav sonucu yok." />
        ) : (
          <div className="flex flex-col gap-2">
            {attempts.filter((a) => a.submittedAt && !a.voided).slice(0, 20).map((a) => (
              <AttemptRow key={a.id} a={a} showName open={openAttempt === a.id} onToggle={() => setOpenAttempt(openAttempt === a.id ? null : a.id)} />
            ))}
          </div>
        )}
      </Section>

      <AssignSheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        creator={{ uid: s.uid, name: s.name }}
        fixedStoreId={s.storeId}
        baristas={baristas}
        progressOf={progressOf}
      />

      <MemberSheet b={memberB} onClose={() => setMember(null)} progress={memberB ? progressOf(memberB.id) : undefined}
        attempts={memberB ? attempts.filter((a) => a.baristaId === memberB.id && a.submittedAt && !a.voided) : []}
        tasks={memberB ? assignments.filter((a) => (!a.baristaId || a.baristaId === memberB.id) && validTask(a)) : []} />
    </Page>
  );
};

/**
 * Ekibim → bir barista: hangi modülde, hangi görevde, son sınavları.
 * Panelin barista sayfasının sadeleştirilmiş, salt okunur hali. PIN'i
 * Bölge Müdürü sıfırlar; mağaza müdürü buradan hazır bir talep gönderir.
 */
const MemberSheet: React.FC<{ b: Barista | null; onClose: () => void; progress?: Progress; attempts: Attempt[]; tasks: Assignment[] }> = ({ b, onClose, progress, attempts, tasks }) => {
  const s = useBaristaSession();
  const { tracks, modules, lessons } = useContent();
  const { items: requests } = useStoreRequests(true);
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = progress || { ...EMPTY_PROGRESS, baristaId: b?.id || '', storeId: s.storeId };
  const mods = tracks.filter((x) => x.published).flatMap((tr) => modules.filter((m) => m.trackId === tr.id && m.published));
  const scope = { modules, tracks };
  const pinTitle = b ? `${b.name} için PIN sıfırlama` : '';
  const pinOpen = requests.find((r) => r.category === 'personel' && r.title === pinTitle && !isClosed(r.status));

  const askPin = async () => {
    if (!b) return;
    if (!confirm(`${b.name} için PIN sıfırlama talebi Kahve Operasyonu'na gönderilsin mi?\n\nBölge Müdürü yeni davet kodu verir; eski PIN geçersiz olur.`)) return;
    setBusy(true);
    try {
      await createRequest({
        storeId: s.storeId, storeName: s.storeName, category: 'personel', priority: 'normal', title: pinTitle,
        detail: `${b.name} PIN'ini unuttu. Yeni davet kodu gerekiyor.`, by: { uid: s.uid, name: s.name }
      });
      toast('Talep gönderildi. Yanıtı Ben → Talepler\'de görürsün.', 'positive');
    } catch (e) {
      toast(errorText(e), 'negative');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!b} title={b?.name || ''} onClose={onClose}>
      {b && (
        <>
          <div className="flex items-center gap-3">
            <Avatar name={b.name} size={44} dim={b.pinPending} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-fg-2">{BARISTA_ROLE_LABEL[b.role]} · %{overallPercent(modules, lessons, p, tracks)} ilerleme</div>
              {b.pinPending && <div className="text-[12px] text-caution mt-0.5">Davet kodunu henüz kullanmadı</div>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={t.sectionLabel}>Modüller</span>
            <div className={t.listGroup}>
              {mods.map((m) => {
                const st = moduleState(m, lessons, p, scope);
                return (
                  <div key={m.id} className={t.listRowStatic}>
                    <span className={t.iconChip(st.passed ? 'positive' : st.lessonsDone ? 'caution' : 'neutral')}>
                      <Icon name={st.passed ? 'check' : st.locked ? 'lock' : 'book'} size={14} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{m.title}</div>
                      <div className="text-[11.5px] text-fg-3">
                        {st.passed ? `Geçti · ${st.score} puan` : st.locked ? 'Kilitli: önceki modül geçilmedi' : `${st.lessonsDone}/${st.lessons.length} ders`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={t.sectionLabel}>Görevler</span>
            {tasks.length === 0 ? <div className="text-[13px] text-fg-3">Atanmış görev yok.</div> : (
              <div className={t.listGroup}>
                {[...tasks].sort((x, y) => Number(assignmentDone(x, p)) - Number(assignmentDone(y, p)) || (x.dueAt ?? Infinity) - (y.dueAt ?? Infinity)).map((a) => {
                  const done = assignmentDone(a, p);
                  const late = isOverdue(a, done);
                  return (
                    <div key={a.id} className={`${t.listRowStatic} ${done ? 'opacity-60' : ''}`}>
                      <span className={t.iconChip(done ? 'positive' : late ? 'negative' : 'caution')}><Icon name={done ? 'check' : 'flag'} size={14} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium">{a.title}</div>
                        <div className="text-[11.5px] text-fg-3">{done ? `Tamamlandı ${fmtDate(assignmentDoneAt(a, p))}` : a.dueAt ? `Son tarih ${fmtDate(a.dueAt)}` : 'Süresiz'}</div>
                      </div>
                      {late && <Badge tone="negative">Gecikti</Badge>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={t.sectionLabel}>Son sınavlar</span>
            {attempts.length === 0 ? <div className="text-[13px] text-fg-3">Henüz sınava girmedi.</div> : (
              <div className="flex flex-col gap-2">
                {attempts.slice(0, 5).map((a) => <AttemptRow key={a.id} a={a} open={openAttempt === a.id} onToggle={() => setOpenAttempt(openAttempt === a.id ? null : a.id)} />)}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-line pt-3">
            {pinOpen ? (
              <p className="text-[12.5px] text-fg-3 leading-relaxed">PIN sıfırlama talebi açık ({fmtDateTime(pinOpen.createdAt)}). Yanıtı Ben → Talepler'de.</p>
            ) : (
              <>
                <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd} self-start`} onClick={askPin} disabled={busy}>
                  {busy ? <Spinner size={14} /> : <Icon name="key" size={15} />} PIN sıfırlama iste
                </button>
                <span className="text-[11.5px] text-fg-3">PIN'ini unuttuysa: Kahve Operasyonu'na hazır bir talep gider, Bölge Müdürü yeni davet kodu verir.</span>
              </>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
};
