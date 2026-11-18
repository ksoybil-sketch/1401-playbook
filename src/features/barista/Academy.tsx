import React, { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent, publishedOnly } from '../../store/content';
import { isModuleVisible, moduleState, trackPercent } from '../../lib/progress';
import { Icon, type IconName } from '../../ui/Icon';
import { Page, PageTitle, Section, ProgressBar, Ring, Empty, Badge, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { HUE, trackHue } from '../../ui/palette';
import { LessonBlocks } from '../academy/LessonBlocks';
import { useBaristaSession, useMyAttempts, useMyProgress } from './useBaristaData';
import { EXAMS_PER_WEEK, weekWindow } from '../../api/exam';
import { serverNow } from '../../lib/serverTime';
import { TZ } from '../../lib/day';
import type { Attempt, Module } from '../../../shared/types';
import { useExamSize } from './useExamSize';

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
          const st = moduleState(m, lessons, progress, { modules, tracks });
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
                  {st.locked ? 'Önceki modülü geçince açılır' : `${st.lessonsDone}/${st.lessons.length} ders${st.passed ? ` · Sınav ${st.score} puan` : ''}`}
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

/**
 * Haftalık sınav hakkı: **bütün modüller için ortak** (18.11.2026). Yalnızca
 * modül sınavları sayılır; reçete mini sınavlarının kendi hakkı var
 * (bkz. exam.ts → startExam). Geçilemeyen deneme de hakkı harcar.
 * Süresi dolmamış açık deneme varsa hak dolmuş olsa da "kaldığın yerden
 * devam" her zaman açık. Modül sayfası, ders sonu ve sınav sonucu aynı
 * hesabı kullanır.
 */
export function examSlots(attempts: Attempt[], moduleId: string) {
  // Takvim haftası (İstanbul, Pazartesi 00:00) ve sunucu saati; exam.ts ile aynı hesap (H10, H1).
  const now = serverNow();
  const w = weekWindow(now);
  // Modül süzgeci YOK: hak kişinindir, modülün değil.
  const week = attempts.filter((a) => !a.lessonId && !a.voided && a.startedAt >= w.from);
  const openAttempt = attempts.find((a) => a.moduleId === moduleId && !a.lessonId && !a.submittedAt && !!a.deadline && a.deadline > now);
  const left = Math.max(0, EXAMS_PER_WEEK - week.length);
  const nextSlotAt = left === 0 ? w.renewAt : null;
  return { left, nextSlotAt, openAttempt, canStart: left > 0 || !!openAttempt };
}

/** "Pazartesi (23 Kas)" — hakların yenilendiği gün, İstanbul takvimiyle. */
export function renewText(at: number): string {
  return `Pazartesi (${new Date(at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: TZ })})`;
}

/** Bu modülün sınavı geçilince açılan, aynı yoldaki sıradaki modül. */
export function nextModuleAfter(mod: Module, modules: Module[]): Module | undefined {
  const same = modules.filter((m) => m.published && m.trackId === mod.trackId && m.id !== mod.id);
  return same.find((m) => m.prerequisiteId === mod.id)
    || same.filter((m) => m.order > mod.order).sort((a, b) => a.order - b.order)[0];
}

export const ModulePage: React.FC = () => {
  const { moduleId } = useParams();
  const { tracks, modules, lessons } = useContent();
  const { progress } = useMyProgress();
  const { items: attempts } = useMyAttempts(50);
  const mod = modules.find((m) => m.id === moduleId);
  // Gerçekte sorulacak soru sayısı (bkz. useExamSize).
  const real = useExamSize(mod);

  const { left, nextSlotAt, openAttempt } = useMemo(() => examSlots(attempts, moduleId || ''), [attempts, moduleId]);
  // Yalnızca modül sınavları: aynı modüldeki reçetelerin mini sınavları
  // (lessonId dolu) puan rozetlerine karışıyordu.
  const myModuleAttempts = attempts.filter((a) => a.moduleId === moduleId && !a.lessonId && a.submittedAt && !a.voided);

  if (!mod) return <Page><PageTitle title="Bulunamadı" back="/akademi" /></Page>;
  // Yayından kalkmış modül adresle de açılmaz (H24).
  if (!isModuleVisible(mod, tracks)) return <Page><PageTitle title={mod.title} back="/akademi" /><Empty icon="book" text="Bu eğitim şu an yayında değil." /></Page>;
  const st = moduleState(mod, lessons, progress, { modules, tracks });
  const prereq = st.locked ? modules.find((m) => m.id === mod.prerequisiteId) : undefined;
  const canStart = !st.locked && (left > 0 || !!openAttempt);

  return (
    <Page>
      <PageTitle title={mod.title} subtitle={mod.description} back={`/akademi/${mod.trackId}`} />

      {/* Görevden ya da bağlantıyla gelen barista kilitli modülü de açabiliyor;
          sınavın neden açılmadığı en başta yazsın. */}
      {st.locked && (
        <div className="text-[13px] text-caution bg-caution-bg border border-caution-line rounded-lg px-3 py-2.5 leading-relaxed">
          Bu modülün sınavı kilitli. Önce {prereq ? <Link to={`/modul/${prereq.id}`} className="underline font-semibold">{prereq.title}</Link> : 'önceki modülü'} sınavını geçmelisin.
        </div>
      )}

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
              <div className="text-[14px] font-semibold">{st.passed ? `Geçtin · ${st.score} puan` : 'Sınava hazır mısın?'}</div>
              <div className="text-[12px] text-fg-3 mt-0.5 leading-relaxed">
                {real.empty ? 'Bu modülde şu an soru yok' : `${real.size} soru`} · Geçme notu {mod.passScore} · {left > 0
                  ? `Bu hafta ${left} sınav hakkın kaldı (bütün modüller için ortak)`
                  : `Bu haftaki ${EXAMS_PER_WEEK} sınav hakkın doldu${!openAttempt && nextSlotAt ? ` · hakların ${renewText(nextSlotAt)} yenilenir` : ''}`}
              </div>
            </div>
          </div>
          <Link
            to={canStart ? `/sinav/${mod.id}` : '#'}
            onClick={(e) => !canStart && e.preventDefault()}
            className={`${t.btn} ${st.passed ? t.btnSecondary : t.btnPrimary} ${t.btnLg} ${!canStart ? 'opacity-40 pointer-events-none' : ''}`}
          >
            {openAttempt ? 'Kaldığın yerden devam et' : st.passed ? 'Puanını yükselt' : 'Sınava başla'}
          </Link>
          {myModuleAttempts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {myModuleAttempts.slice(0, 6).map((a) => (
                <Badge key={a.id} tone={a.passed ? 'positive' : 'negative'}>{a.score} puan</Badge>
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
  const { tracks, modules, lessons } = useContent();
  const { progress } = useMyProgress();
  const { items: attempts } = useMyAttempts(50);
  const lesson = lessons.find((l) => l.id === lessonId);

  if (!lesson) return <Page><PageTitle title="Ders bulunamadı" back="/akademi" /></Page>;
  const mod = modules.find((m) => m.id === lesson.moduleId);
  if (!lesson.published || !mod || !isModuleVisible(mod, tracks)) {
    return <Page><PageTitle title={lesson.title} back="/akademi" /><Empty icon="book" text="Bu eğitim şu an yayında değil." /></Page>;
  }
  const siblings = lessons.filter((l) => l.moduleId === lesson.moduleId && l.published);
  const idx = siblings.findIndex((l) => l.id === lesson.id);
  const next = siblings[idx + 1];
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const done = !!progress.lessons?.[lesson.id];
  // Son ders: bu dersle bütün dersler bitiyor ve sınav açıksa (kilitli değil,
  // geçilmemiş, hak var) doğrudan sınavın giriş ekranına geçilir. Sınav yine
  // "Başla" ile başlar.
  const st = mod ? moduleState(mod, lessons, progress, { modules, tracks }) : null;
  const allDoneAfter = !!st && st.lessons.every((l) => l.id === lesson.id || !!progress.lessons?.[l.id]);
  const toExam = !next && !!mod && !!st && allDoneAfter && !st.locked && !st.passed && mod.examSize > 0
    && examSlots(attempts, mod.id).canStart;

  const complete = async () => {
    if (!done && s.offline) {
      // Çevrimdışı PIN girişi salt okunur (H17): ders bu oturumda kaydedilemez.
      toast('Çevrimdışı moddasın: ders tamamlama kaydedilmedi. Bağlantı gelince dersi yeniden "Tamamladım" ile bitir.', 'negative');
    } else if (!done) {
      // Çevrimdışıyken de çalışır: Firestore yazmayı kuyruğa alır. Çıkış
      // yapılsa da bu telefondan, bu kişinin adıyla gönderilir (session.ts logout, H3).
      updateDoc(doc(db, 'progress', s.baristaId), { [`lessons.${lesson.id}`]: Date.now(), updatedAt: Date.now() })
        .catch(() => toast('İlerleme kaydedilemedi.', 'negative'));
      toast(typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'Ders tamamlandı · bağlantı gelince bu telefondan gönderilecek'
        : 'Ders tamamlandı', 'positive');
    }
    navigate(next ? `/ders/${next.id}` : toExam ? `/sinav/${lesson.moduleId}` : `/modul/${lesson.moduleId}`, { replace: true });
  };

  return (
    <Page>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/modul/${lesson.moduleId}`, { replace: true })} className={t.iconBtn} aria-label="Kapat"><Icon name="close" size={16} /></button>
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
        <div className="max-w-[560px] mx-auto px-4 py-3 flex gap-2">
          {/* Önceki derse dönüş: eskiden yalnızca modül listesinden
              yapılabiliyordu. Geçmişe yeni kayıt eklemez (replace), geri
              tuşu yine modüle döner. */}
          {prev && (
            <button
              onClick={() => navigate(`/ders/${prev.id}`, { replace: true })}
              className={`${t.btn} ${t.btnSecondary} ${t.btnLg} shrink-0`}
              aria-label={`Önceki ders: ${prev.title}`}
            >
              <Icon name="chevronLeft" size={16} /> Önceki
            </button>
          )}
          <button onClick={complete} className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1 min-w-0`}>
            <span className="truncate">{next ? (done ? 'Sonraki ders' : 'Tamamladım, sonraki ders') : toExam ? (done ? 'Sınava geç' : 'Tamamladım, sınava geç') : done ? 'Modüle dön' : 'Tamamladım'}</span>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>
    </Page>
  );
};
