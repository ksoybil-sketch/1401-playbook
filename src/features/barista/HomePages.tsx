import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent } from '../../store/content';
import { useQueryLive } from '../../hooks/useFirestore';
import { assignmentDone, isOverdue, nextLesson, overallPercent, moduleState } from '../../lib/progress';
import { Icon } from '../../ui/Icon';
import { Page, PageTitle, Section, Ring, Empty, Badge, Avatar, ProgressBar, relDays, fmtDate, fmtDateTime } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { useBaristaSession, useMyAssignments, useMyAttempts, useMyProgress } from './useBaristaData';
import { MistakeCard } from './ExamPage';
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

export const HomePage: React.FC = () => {
  const s = useBaristaSession();
  const { tracks, modules, lessons } = useContent();
  const { progress } = useMyProgress();
  const { items: assignments } = useMyAssignments();
  const pct = overallPercent(modules, lessons, progress);
  const next = nextLesson(tracks, modules, lessons, progress);
  const open = assignments.filter((a) => !assignmentDone(a, progress));
  const passedCount = Object.keys(progress.modules || {}).length;
  const publishedModules = modules.filter((m) => m.published).length;

  // Dersleri biten ama sınavı geçilmemiş modüller. Sınav bugüne kadar
  // yalnızca modülün içine girilince görünüyordu; barista "sıradaki ne"
  // diye bakarken sınavın hazır olduğunu göremiyordu.
  const examReady = modules
    .filter((m) => m.published)
    .map((m) => ({ mod: m, st: moduleState(m, lessons, progress) }))
    .filter((x) => !x.st.locked && !x.st.passed && x.st.lessons.length > 0 && x.st.lessonsDone === x.st.lessons.length);

  return (
    <Page>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="text-[13px] text-fg-3">{greeting()},</div>
          <h1 className="text-[24px] font-bold leading-tight">{s.name.split(' ')[0]}</h1>
          <div className="text-[12px] text-fg-3 mt-1.5">{passedCount}/{publishedModules} modül tamamlandı</div>
        </div>
        <Ring value={pct} size={72} />
      </div>

      {/* Servis sırasında en çok ihtiyaç duyulan şey, ana ekranın en üstünde. */}
      <Link
        to="/receteler?focus=1"
        className={`${t.input} flex items-center gap-2.5 text-fg-3 hover:border-line-2 hover:bg-panel-2`}
      >
        <Icon name="search" size={16} />
        <span className="text-[15px]">İçecek ya da malzeme ara</span>
      </Link>

      {examReady.length > 0 && (
        <Section label={`Sınava hazırsın · ${examReady.length}`}>
          <div className={t.listGroup}>
            {examReady.map(({ mod, st }) => (
              <Link key={mod.id} to={`/sinav/${mod.id}`} className={t.listRow}>
                <span className={t.iconChip('caution')}><Icon name="clipboard" size={16} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium truncate">{mod.title}</div>
                  <div className="text-[12px] text-fg-3 mt-0.5 tnum">
                    {st.lessons.length} ders tamam · {mod.examSize} soru · geçme %{mod.passScore}
                  </div>
                </div>
                <Icon name="chevronRight" size={16} className={t.rowChevron} />
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section label={`Görevlerin${open.length ? ` · ${open.length}` : ''}`}>
        {open.length === 0 ? (
          <Empty icon="check" text="Bekleyen görevin yok. Akademi'den kendi hızında devam edebilirsin." />
        ) : (
          <div className={t.listGroup}>
            {open.map((a) => <AssignmentRow key={a.id} a={a} progress={progress} />)}
          </div>
        )}
      </Section>

      {next && (
        <Section label="Kaldığın yerden devam et">
          <Link to={`/ders/${next.lesson.id}`} className={`${t.cardInteractive} p-4 flex items-center gap-4`}>
            <span className={`${t.iconChip('accent')} w-11 h-11 rounded-xl`}><Icon name="play" size={18} /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-fg-3 truncate">{next.module.title}</div>
              <div className="text-[15px] font-semibold truncate">{next.lesson.title}</div>
              <div className="text-[12px] text-fg-3 mt-0.5">{next.lesson.durationMin} dk</div>
            </div>
            <Icon name="chevronRight" size={16} className={t.rowChevron} />
          </Link>
        </Section>
      )}

      <Section label="Eğitim yolları">
        <div className="grid grid-cols-2 gap-3">
          {tracks.filter((x) => x.published).map((tr) => {
            const mods = modules.filter((m) => m.trackId === tr.id && m.published);
            const done = mods.filter((m) => moduleState(m, lessons, progress).passed).length;
            return (
              <Link key={tr.id} to={`/akademi/${tr.id}`} className={`${t.cardInteractive} p-3.5 flex flex-col gap-2.5`}>
                <span className="text-[13px] font-semibold leading-snug line-clamp-2 min-h-[2.4em]">{tr.title}</span>
                <ProgressBar value={mods.length ? (done / mods.length) * 100 : 0} />
                <span className="text-[11px] text-fg-3 tnum">{done}/{mods.length} modül</span>
              </Link>
            );
          })}
        </div>
      </Section>
    </Page>
  );
};

const AssignmentRow: React.FC<{ a: Assignment; progress: Progress }> = ({ a, progress }) => {
  const done = assignmentDone(a, progress);
  const overdue = isOverdue(a, done);
  const to = a.kind === 'lesson' ? `/ders/${a.targetId}` : `/modul/${a.targetId}`;
  return (
    <Link to={to} className={t.listRow}>
      <span className={t.iconChip(overdue ? 'negative' : 'caution')}><Icon name={a.kind === 'lesson' ? 'book' : 'clipboard'} size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium leading-snug">{a.title}</div>
        <div className="text-[12px] text-fg-3 mt-0.5 truncate">
          {a.createdByName}{a.note ? ` · ${a.note}` : ''}
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
  const { items: attempts, loading } = useMyAttempts(30);
  const { progress } = useMyProgress();
  const { modules } = useContent();
  const [open, setOpen] = useState<string | null>(null);
  const submitted = attempts.filter((a) => a.submittedAt);
  const passed = Object.entries(progress.modules || {});

  return (
    <Page>
      <PageTitle title="Sonuçlarım" subtitle="Geçtiğin modüller ve sınav geçmişin." />

      <Section label={`Rozetler · ${passed.length}`}>
        {passed.length === 0 ? (
          <Empty icon="award" text="İlk modül sınavını geçtiğinde rozetin burada görünecek." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {passed.map(([mid, r]) => (
              <div key={mid} className={`${t.card} p-3.5 flex items-center gap-3`}>
                <span className={t.iconChip('positive')}><Icon name="award" size={16} /></span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold leading-snug line-clamp-2">{modules.find((m) => m.id === mid)?.title || 'Modül'}</div>
                  <div className="text-[11px] text-fg-3 tnum">%{r.score} · {fmtDate(r.passedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section label="Sınav geçmişi">
        {loading ? null : submitted.length === 0 ? (
          <Empty icon="clipboard" text="Henüz sınava girmedin." />
        ) : (
          <div className="flex flex-col gap-2">
            {submitted.map((a) => (
              <AttemptRow key={a.id} a={a} open={open === a.id} onToggle={() => setOpen(open === a.id ? null : a.id)} />
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
};

export const AttemptRow: React.FC<{ a: Attempt; open: boolean; onToggle: () => void; showName?: boolean }> = ({ a, open, onToggle, showName }) => (
  <div className={`${t.card} overflow-hidden`}>
    <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-panel-2 transition-colors">
      <Badge tone={a.passed ? 'positive' : 'negative'}>%{a.score ?? '–'}</Badge>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium truncate">{showName ? `${a.baristaName} · ` : ''}{a.moduleTitle}</div>
        <div className="text-[12px] text-fg-3">{fmtDateTime(a.submittedAt)} · {a.correct}/{a.total} doğru</div>
      </div>
      {(a.mistakes?.length || 0) > 0 && <Icon name={open ? 'arrowUp' : 'arrowDown'} size={15} className="text-fg-3" />}
    </button>
    {open && (a.mistakes?.length || 0) > 0 && (
      <div className="border-t border-line p-3 flex flex-col gap-2 bg-black/10">
        {a.mistakes!.map((m) => <MistakeCard key={m.questionId} m={m} />)}
      </div>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/* Ekibim (mağaza sorumlusu)                                           */
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
  const { data: attempts } = useQueryLive<Attempt>(
    query(collection(db, 'attempts'), where('storeId', '==', s.storeId), orderBy('startedAt', 'desc'), limit(20)),
    `team-a-${s.storeId}`
  );
  const { data: assignments } = useQueryLive<Assignment>(
    query(collection(db, 'assignments'), where('storeId', '==', s.storeId)),
    `team-asg-${s.storeId}`
  );

  const progressOf = (id: string) => progressList.find((p) => p.id === id);
  const sorted = [...baristas].sort((a, b) => a.name.localeCompare(b.name, 'tr'));

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
            const pct = p ? overallPercent(modules, lessons, p) : 0;
            const mine = assignments.filter((a) => !a.baristaId || a.baristaId === b.id);
            const openTasks = mine.filter((a) => !assignmentDone(a, p)).length;
            const overdue = mine.filter((a) => isOverdue(a, assignmentDone(a, p))).length;
            return (
              <div key={b.id} className={t.listRowStatic}>
                <Avatar name={b.name} size={36} dim={b.pinPending} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium truncate">{b.name}</div>
                  <ProgressBar value={pct} className="mt-1.5 max-w-[180px]" />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[12px] font-semibold tnum">%{pct}</span>
                  {overdue > 0 ? <Badge tone="negative">{overdue} gecikmiş</Badge> : openTasks > 0 ? <Badge>{openTasks} görev</Badge> : null}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section label="Son sınavlar">
        {attempts.filter((a) => a.submittedAt).length === 0 ? (
          <Empty icon="clipboard" text="Ekipte henüz sınav sonucu yok." />
        ) : (
          <div className="flex flex-col gap-2">
            {attempts.filter((a) => a.submittedAt).map((a) => (
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
      />
    </Page>
  );
};
