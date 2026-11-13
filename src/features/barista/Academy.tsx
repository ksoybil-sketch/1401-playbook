import React, { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent, publishedOnly } from '../../store/content';
import { moduleState, trackPercent } from '../../lib/progress';
import { Icon, type IconName } from '../../ui/Icon';
import { Page, PageTitle, Section, ProgressBar, Ring, Empty, Badge, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { HUE, trackHue } from '../../ui/palette';
import { LessonBlocks } from '../academy/LessonBlocks';
import { useBaristaSession, useMyAttempts, useMyProgress } from './useBaristaData';
import { EXAMS_PER_WEEK } from '../../api/exam';

/* ------------------------------------------------------------------ */
/* Eğitim yolları                                                      */
/* ------------------------------------------------------------------ */

export const TracksPage: React.FC = () => {
  const { tracks, modules, lessons } = useContent();
  const { progress } = useMyProgress();
  const list = publishedOnly(tracks);

  return (
    <Page>
      <PageTitle title="Akademi" />
      {list.length === 0 ? (
        <Empty icon="cap" text="Henüz yayınlanmış eğitim yok." />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((tr, i) => {
            const pct = trackPercent(tr, modules, lessons, progress);
            const mods = publishedOnly(modules).filter((m) => m.trackId === tr.id);
            const hue = HUE[trackHue(tr.id, i)];
            return (
              <Link key={tr.id} to={`/akademi/${tr.id}`} className={`tile rounded-2xl border p-4 flex items-center gap-4 active:scale-[0.99] transition-transform ${hue.tile}`}>
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${hue.chip}`}><Icon name={(tr.icon as IconName) || 'book'} size={20} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold">{tr.title}</div>
                  <div className="flex items-center gap-2 mt-2.5">
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden flex-1"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: hue.hex }} /></div>
                    <span className="text-[11px] text-fg-3 tnum w-16 text-right">{mods.length} modül</span>
                  </div>
                </div>
                <Ring value={pct} size={46} color={hue.hex} />
              </Link>
            );
          })}
        </div>
      )}
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Bir yolun modülleri                                                 */
/* ------------------------------------------------------------------ */

export const TrackPage: React.FC = () => {
  const { trackId } = useParams();
  const { tracks, modules, lessons } = useContent();
  const { progress } = useMyProgress();
  const track = tracks.find((x) => x.id === trackId);
  const mods = publishedOnly(modules).filter((m) => m.trackId === trackId);

  if (!track) return <Page><PageTitle title="Bulunamadı" back="/akademi" /></Page>;

  return (
    <Page>
      <PageTitle title={track.title} subtitle={track.description} back="/akademi" />
      <div className={t.listGroup}>
        {mods.map((m, i) => {
          const st = moduleState(m, lessons, progress);
          const content = (
            <>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0 border tnum ${
                st.passed ? 'bg-positive-bg border-positive-line text-positive' : st.locked ? 'bg-panel border-line text-fg-4' : 'bg-panel-3 border-line-2'
              }`}>
                {st.passed ? <Icon name="check" size={15} strokeWidth={2.2} /> : st.locked ? <Icon name="lock" size={14} /> : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-[14px] font-semibold ${st.locked ? 'text-fg-3' : ''}`}>{m.title}</div>
                <div className="text-[12px] text-fg-3 mt-0.5">
                  {st.locked ? 'Önceki modülü geçince açılır' : `${st.lessonsDone}/${st.lessons.length} ders${st.passed ? ` · Sınav %${st.score}` : ''}`}
                </div>
              </div>
              {!st.locked && <Icon name="chevronRight" size={16} className={t.rowChevron} />}
            </>
          );
          return st.locked ? (
            <div key={m.id} className={`${t.listRowStatic} opacity-70`}>{content}</div>
          ) : (
            <Link key={m.id} to={`/modul/${m.id}`} className={t.listRow}>{content}</Link>
          );
        })}
      </div>
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Modül: dersler + sınav                                              */
/* ------------------------------------------------------------------ */

export const ModulePage: React.FC = () => {
  const { moduleId } = useParams();
  const { modules, lessons } = useContent();
  const { progress } = useMyProgress();
  const { items: attempts } = useMyAttempts(50);
  const mod = modules.find((m) => m.id === moduleId);

  const weekAttempts = useMemo(() => attempts.filter((a) => a.moduleId === moduleId && !a.voided && a.startedAt > Date.now() - 7 * 86400000), [attempts, moduleId]);
  const myModuleAttempts = attempts.filter((a) => a.moduleId === moduleId && a.submittedAt && !a.voided);

  if (!mod) return <Page><PageTitle title="Bulunamadı" back="/akademi" /></Page>;
  const st = moduleState(mod, lessons, progress);
  const left = Math.max(0, EXAMS_PER_WEEK - weekAttempts.length);

  return (
    <Page>
      <PageTitle title={mod.title} subtitle={mod.description} back={`/akademi/${mod.trackId}`} />

      <Section label={`Dersler · ${st.lessonsDone}/${st.lessons.length}`}>
        {st.lessons.length === 0 ? (
          <Empty icon="book" text="Bu modülde henüz ders yok." />
        ) : (
          <div className={t.listGroup}>
            {st.lessons.map((l) => {
              const done = !!progress.lessons?.[l.id];
              return (
                <Link key={l.id} to={`/ders/${l.id}`} className={t.listRow}>
                  <span className={t.iconChip(done ? 'positive' : 'neutral')}>
                    <Icon name={done ? 'check' : 'play'} size={done ? 16 : 13} strokeWidth={done ? 2 : 1.5} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium">{l.title}</div>
                    <div className="text-[12px] text-fg-3">{l.durationMin} dk</div>
                  </div>
                  <Icon name="chevronRight" size={16} className={t.rowChevron} />
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      <Section label="Modül sınavı">
        <div className={`${t.card} p-4 flex flex-col gap-4`}>
          <div className="flex items-start gap-3">
            <span className={t.iconChip(st.passed ? 'positive' : 'accent')}><Icon name={st.passed ? 'award' : 'clipboard'} size={16} /></span>
            <div className="flex-1">
              <div className="text-[14px] font-semibold">{st.passed ? `Geçtin · %${st.score}` : 'Sınava hazır mısın?'}</div>
              <div className="text-[12px] text-fg-3 mt-0.5 leading-relaxed">
                {mod.examSize} soru · Geçme notu %{mod.passScore} · Bu hafta {left}/{EXAMS_PER_WEEK} deneme hakkın kaldı
              </div>
            </div>
          </div>
          <Link
            to={left > 0 ? `/sinav/${mod.id}` : '#'}
            onClick={(e) => left === 0 && e.preventDefault()}
            className={`${t.btn} ${st.passed ? t.btnSecondary : t.btnPrimary} ${t.btnLg} ${left === 0 ? 'opacity-40 pointer-events-none' : ''}`}
          >
            {st.passed ? 'Puanını yükselt' : 'Sınava başla'}
          </Link>
          {myModuleAttempts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {myModuleAttempts.slice(0, 6).map((a) => (
                <Badge key={a.id} tone={a.passed ? 'positive' : 'negative'}>%{a.score}</Badge>
              ))}
            </div>
          )}
        </div>
      </Section>
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Ders okuma                                                          */
/* ------------------------------------------------------------------ */

export const LessonPage: React.FC = () => {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const s = useBaristaSession();
  const { modules, lessons } = useContent();
  const { progress } = useMyProgress();
  const lesson = lessons.find((l) => l.id === lessonId);

  if (!lesson) return <Page><PageTitle title="Ders bulunamadı" back="/akademi" /></Page>;
  const mod = modules.find((m) => m.id === lesson.moduleId);
  const siblings = lessons.filter((l) => l.moduleId === lesson.moduleId && l.published);
  const idx = siblings.findIndex((l) => l.id === lesson.id);
  const next = siblings[idx + 1];
  const done = !!progress.lessons?.[lesson.id];

  const complete = async () => {
    if (!done) {
      // Çevrimdışıyken de çalışır: Firestore yazmayı kuyruğa alır.
      updateDoc(doc(db, 'progress', s.baristaId), { [`lessons.${lesson.id}`]: Date.now(), updatedAt: Date.now() })
        .catch(() => toast('İlerleme kaydedilemedi.', 'negative'));
      toast('Ders tamamlandı', 'positive');
    }
    navigate(next ? `/ders/${next.id}` : `/modul/${lesson.moduleId}`, { replace: true });
  };

  return (
    <Page>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/modul/${lesson.moduleId}`)} className={t.iconBtn} aria-label="Kapat"><Icon name="close" size={16} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-fg-3 truncate">{mod?.title}</div>
          <ProgressBar value={((idx + 1) / siblings.length) * 100} tone="accent" className="mt-1.5" />
        </div>
        <span className="text-[12px] text-fg-3 tnum">{idx + 1}/{siblings.length}</span>
      </div>

      <div>
        <h1 className="text-[24px] font-bold leading-tight">{lesson.title}</h1>
        <div className="flex items-center gap-1.5 text-[12px] text-fg-3 mt-2">
          <Icon name="clock" size={13} /> {lesson.durationMin} dk okuma
          {done && <><span>·</span><span className="text-positive">Tamamlandı</span></>}
        </div>
      </div>

      <LessonBlocks blocks={lesson.blocks || []} />

      <div className="fixed bottom-0 inset-x-0 z-30 bg-bean/95 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-[560px] mx-auto px-4 py-3">
          <button onClick={complete} className={`${t.btn} ${t.btnPrimary} ${t.btnLg} w-full`}>
            {done ? (next ? 'Sonraki ders' : 'Modüle dön') : next ? 'Tamamladım, sonraki ders' : 'Tamamladım'}
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>
    </Page>
  );
};
