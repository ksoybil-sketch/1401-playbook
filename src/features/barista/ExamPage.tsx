import { ReportQuestionLink } from '../shared/Feedback';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppError, errorText } from '../../api/backend';
import {
  activeAttemptIn, saveAnswers, startExam, submitExam, SECONDS_PER_QUESTION, type ExamResult, EXAMS_PER_WEEK, QUIZ_PASS } from '../../api/exam';
import { useContent } from '../../store/content';
import { useBaristaSession, useMyAttempts, useMyProgress } from './useBaristaData';
import { examSlots, nextModuleAfter, renewText } from './Academy';
import { useExamSize } from './useExamSize';
import { isModuleVisible, moduleState } from '../../lib/progress';
import { clockSkew, serverNow } from '../../lib/serverTime';
import { blockedReadOnly } from '../../lib/readOnly';
import { Icon } from '../../ui/Icon';
import { useBackHandler } from '../../lib/backButton';
import { useBrowserBackConfirm } from '../../lib/unsaved';
import { Page, ProgressBar, Ring, Spinner, ErrorText } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { AttemptReviewItem, ExamQuestion } from '../../../shared/types';

type Phase =
  | { k: 'intro' }
  | { k: 'loading' }
  | { k: 'run'; attemptId: string; passScore: number; questions: ExamQuestion[]; deadline: number }
  | { k: 'sending' }
  | { k: 'result' } & ExamResult;

/** Teslim bu kadar sürede bitmezse bağlantı yok sayılır, barista ekrandan çıkabilir. */
const SLOW_SUBMIT_MS = 12_000;
/** Cevaplar her işaretlemede değil, en çok bu kadar cevap ya da süre biriktikçe yazılır. */
const SAVE_EVERY_ANSWERS = 3;
const SAVE_EVERY_MS = 15_000;

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const ExamPage: React.FC = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const s = useBaristaSession();
  const mod = useContent((x) => x.modules.find((m) => m.id === moduleId));
  // ?ders=<lessonId>: yeni ürünün mini sınavı (yalnızca o reçetenin soruları).
  const [params] = useSearchParams();
  const lesson = useContent((x) => x.lessons.find((l) => l.id === params.get('ders'))) || null;
  // Sonuç ekranı için: sıradaki modül ve kalan haftalık hak.
  const allModules = useContent((x) => x.modules);
  const allLessons = useContent((x) => x.lessons);
  const allTracks = useContent((x) => x.tracks);
  const { progress } = useMyProgress();
  const { items: myAttempts } = useMyAttempts(50);
  const back = lesson ? `/recete/${lesson.id}` : `/modul/${moduleId}`;
  const [phase, setPhase] = useState<Phase>({ k: 'intro' });
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  // Geri sayım sunucu saatiyle (H1): telefonun saati yanlış olsa da süre doğru.
  const [now, setNow] = useState(serverNow());
  const [slow, setSlow] = useState(false);
  const submitting = useRef(false);

  // Bu modülde süresi dolmamış açık deneme var mı? Baristanın kendi denemeler
  // dinleyicisinden (ek okuma yok). Varsa "Başla" yerine "Devam et". Soru
  // havuzu artık ekran açılınca değil, "Başla"da okunur (kota).
  const resumable = mod ? activeAttemptIn(myAttempts, mod.id, lesson?.id) : null;
  // Gerçekte sorulacak soru sayısı: min(examSize, etkin soru) (toplama sorgusu, 2 okuma).
  const real = useExamSize(mod, lesson);

  // Cevap kaydı: her işaretleme denemeye yazılırsa açık her panel/kurul
  // ekranına bir okuma olarak yansıyor. Cevaplar biriktirilip birkaç cevapta
  // bir ya da en geç SAVE_EVERY_MS'de bir yazılır; ekran gizlenirken/kapanırken
  // ve sınavdan çıkarken hemen yazılır. Teslim zaten bütün cevapları taşır.
  const pending = useRef<{ attemptId: string; answers: Record<string, number>; count: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushAnswers = useCallback(() => {
    clearTimeout(saveTimer.current);
    const p = pending.current;
    pending.current = null;
    if (p) void saveAnswers(p.attemptId, p.answers);
  }, []);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushAnswers(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushAnswers);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flushAnswers);
      flushAnswers();
    };
  }, [flushAnswers]);

  // Geri sayım
  useEffect(() => {
    if (phase.k !== 'run') return;
    const id = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(id);
  }, [phase.k]);

  const submit = useCallback(async (attemptId: string, timedOut = false, questionIds?: string[]) => {
    if (submitting.current) return;
    submitting.current = true;
    // Teslim bütün cevapları yazar; bekleyen ara kayda gerek yok.
    clearTimeout(saveTimer.current);
    pending.current = null;
    setPhase({ k: 'sending' });
    try {
      // Çevrimdışıyken toplu yazım bağlantı gelene kadar bitmez; ekran
      // SLOW_SUBMIT_MS sonra "bağlantı gelince puanlanacak" der ve çıkışa izin
      // verir. Bu söz arka planda tutulur: bağlantı gelince yazım tamamlanır.
      const res = await submitExam(attemptId, answers, { timedOut, questionIds, baristaId: s.baristaId });
      setPhase({ k: 'result', ...res });
    } catch (e) {
      setError(errorText(e));
      setPhase({ k: 'intro' });
    } finally {
      submitting.current = false;
    }
  }, [answers, s.baristaId]);

  // "Puanlanıyor…" sonsuza kadar sürmesin.
  useEffect(() => {
    setSlow(false);
    if (phase.k !== 'sending') return;
    const id = setTimeout(() => setSlow(true), SLOW_SUBMIT_MS);
    return () => clearTimeout(id);
  }, [phase.k]);

  // Süre dolunca o ana kadarki cevaplarla otomatik teslim.
  useEffect(() => {
    if (phase.k === 'run' && now >= phase.deadline) submit(phase.attemptId, true, phase.questions.map((x) => x.id));
  }, [now, phase, submit]);

  // Android geri tuşu: sınav çözülürken çıkmadan önce onay iste. Teslim
  // sürerken (bağlantı yoksa) de çalışır: teslim arka planda sürer.
  const EXIT_CONFIRM = 'Sınavdan çıkarsan süre işlemeye devam eder. Süre içinde dönüp kaldığın yerden devam edebilirsin. Çıkılsın mı?';
  useBackHandler(phase.k === 'run' || phase.k === 'sending' || phase.k === 'loading', () => {
    if (phase.k === 'run') { if (confirm(EXIT_CONFIRM)) navigate(back, { replace: true }); }
    else navigate(back, { replace: true });
    return true;
  });
  // Web'de tarayıcının geri düğmesi de aynı onayı sorar (eskiden onaysız çıkılıyordu).
  useBrowserBackConfirm(phase.k === 'run', EXIT_CONFIRM);

  // Sınav sırasında yanlışlıkla geri tuşuna basılırsa uyar.
  useEffect(() => {
    if (phase.k !== 'run') return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [phase.k]);

  if (!mod) return <Page><p className="text-fg-3">Modül bulunamadı.</p></Page>;
  // Yayından kalkmış (ya da yolu kapanmış) modülün sınavı adresle de açılmaz (H24).
  if ((phase.k === 'intro' || phase.k === 'loading') && !isModuleVisible(mod, allTracks)) {
    return (
      <Page>
        <div className="flex flex-col items-center gap-3 pt-24 text-center">
          <p className="text-[14px] text-fg-2 leading-relaxed max-w-[300px]">Bu eğitim şu an yayında değil.</p>
          <button onClick={() => navigate('/akademi', { replace: true })} className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`}>Akademi'ye dön</button>
        </div>
      </Page>
    );
  }

  // Yarım kalan denemede o denemenin soru sayısı; yoksa havuzdaki gerçek sayı.
  const size = resumable?.total || real.size;
  const empty = real.empty && !resumable;
  const minutes = Math.ceil((size * SECONDS_PER_QUESTION) / 60);

  const start = async () => {
    if (blockedReadOnly('Çevrimdışı moddasın: sınav için internet bağlantısı gerekiyor. Bağlantı gelince yeniden dene.')) return;
    setError(null);
    setPhase({ k: 'loading' });
    try {
      const res = await startExam(mod, { baristaId: s.baristaId, storeId: s.storeId, name: s.name }, lesson, { resume: !!resumable });
      setAnswers(res.answers);
      // Devam edilen denemede ilk boş soruya git.
      const firstBlank = res.questions.findIndex((q) => res.answers[q.id] === undefined);
      setIdx(firstBlank < 0 ? 0 : firstBlank);
      setNow(serverNow());
      setPhase({ k: 'run', attemptId: res.attemptId, passScore: res.passScore, questions: res.questions, deadline: res.deadline });
    } catch (e) {
      let msg = errorText(e);
      if (e instanceof AppError && e.code === 'weekly-limit') {
        const nextAt = (e.data as { nextAt: number } | undefined)?.nextAt;
        msg = `Bu sınav için bu haftaki ${EXAMS_PER_WEEK} deneme hakkını kullandın.${nextAt ? ` Hakların ${renewText(nextAt)} yenilenir.` : ''}`;
      }
      setError(msg);
      setPhase({ k: 'intro' });
    }
  };

  const choose = (attemptId: string, qid: string, i: number) => {
    const next = { ...answers, [qid]: i };
    setAnswers(next);
    // Cevaplar biriktirilerek yazılır (bkz. flushAnswers); uygulama kapanırsa kaybolmaz.
    const had = pending.current;
    pending.current = { attemptId, answers: next, count: (had?.count || 0) + 1 };
    if (pending.current.count >= SAVE_EVERY_ANSWERS) flushAnswers();
    else if (!had) saveTimer.current = setTimeout(flushAnswers, SAVE_EVERY_MS);
  };

  if (phase.k === 'intro' || phase.k === 'loading') {
    const left = resumable?.deadline ? resumable.deadline - serverNow() : 0;
    // Telefonun saati 2 dakikadan çok farklıysa söylenir; süre yine sunucu saatiyle işler.
    const skew = clockSkew();
    const skewMin = skew !== null && Math.abs(skew) > 120_000 ? Math.round(skew / 60000) : 0;
    return (
      <Page>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(back, { replace: true })} className={t.iconBtn} aria-label="Kapat"><Icon name="close" size={16} /></button>
          <span className="text-[13px] text-fg-3">{lesson ? 'Mini sınav' : 'Modül sınavı'}</span>
        </div>
        <div className="flex flex-col items-center text-center gap-4 pt-6">
          <span className={`${t.iconChip('accent')} w-14 h-14 rounded-2xl`}><Icon name="clipboard" size={26} /></span>
          <h1 className="text-[22px] font-bold">{lesson ? lesson.title : mod.title}</h1>
          <div className={`${t.listGroup} w-full text-left`}>
            {[
              ['Soru sayısı', empty ? '—' : `${size}`],
              ['Süre', empty ? '—' : `${minutes} dakika`],
              ['Geçme notu', `${lesson ? QUIZ_PASS : mod.passScore} puan`]
            ].map(([a, b]) => (
              <div key={a} className={`${t.listRowStatic} justify-between`}>
                <span className="text-[14px] text-fg-2">{a}</span>
                <span className="text-[14px] font-semibold">{b}</span>
              </div>
            ))}
          </div>
          {resumable && left > 0 ? (
            <p className="text-[13px] text-caution bg-caution-bg border border-caution-line rounded-lg px-3 py-2.5 leading-relaxed w-full text-left">
              Yarım kalan sınavın var · kalan süre <b className="tnum">{fmtClock(left)}</b>
            </p>
          ) : null}
          {empty && (
            <p className="text-[13px] text-fg-2 bg-panel-2 border border-line rounded-lg px-3 py-2.5 leading-relaxed w-full text-left">Bu modülde şu an soru yok.</p>
          )}
          {skewMin !== 0 && (
            <p className="text-[12px] text-fg-3 leading-relaxed w-full text-left">
              Telefonunun saati {Math.abs(skewMin)} dakika {skewMin > 0 ? 'ileri' : 'geri'}. Sınav süresi sunucu saatine göre işler; saati "otomatik" yapman iyi olur.
            </p>
          )}
          <div className="w-full"><ErrorText>{error}</ErrorText></div>
          <button onClick={start} disabled={phase.k === 'loading' || empty} className={`${t.btn} ${t.btnPrimary} ${t.btnLg} w-full`}>
            {phase.k === 'loading' ? <Spinner size={16} /> : resumable && left > 0 ? 'Kaldığım yerden devam et' : 'Başla'}
          </button>
        </div>
      </Page>
    );
  }

  if (phase.k === 'sending') {
    return (
      <Page>
        <div className="flex flex-col items-center gap-3 pt-24 text-center">
          <Spinner size={26} />
          {slow ? (
            <>
              <span className="text-[15px] font-semibold">Bağlantı yok</span>
              <p className="text-[13px] text-fg-2 leading-relaxed max-w-[300px]">
                Cevapların telefonda kayıtlı; bağlantı gelince puanlanacak. Sonucunu Ben → Sınav geçmişi'nde görürsün.
              </p>
              <button onClick={() => navigate(back, { replace: true })} className={`${t.btn} ${t.btnSecondary} ${t.btnLg} mt-2`}>
                Tamam, çık
              </button>
            </>
          ) : (
            <span className="text-[13px] text-fg-3">Puanlanıyor…</span>
          )}
        </div>
      </Page>
    );
  }

  if (phase.k === 'result') {
    return (
      <Page>
        <div className="flex flex-col items-center text-center gap-3 pt-6">
          <Ring value={phase.score} size={110} label={`${phase.score}`} />
          <h1 className="text-[22px] font-bold mt-2">{phase.passed ? 'Tebrikler, geçtin!' : 'Bu sefer olmadı'}</h1>
          <p className="text-[13px] text-fg-3">
            {phase.score} puan · {phase.correct}/{phase.total} doğru · Geçme notu {phase.passScore}
          </p>
          {phase.timedOut && (
            <p className="text-[12px] text-caution">Süre doldu; sınav o ana kadarki cevaplarınla puanlandı.</p>
          )}
        </div>

        {phase.mistakes.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className={t.sectionLabel}>Yanlışların · {phase.mistakes.length}</span>
            {phase.mistakes.map((m) => <MistakeCard key={m.questionId} m={m} />)}
          </div>
        )}

        {/* Şimdi ne yapmalı: geçene açılan modül, kalana kalan hak ve tekrar. */}
        {(() => {
          if (lesson) return (
            <div className="flex flex-col gap-2">
              <button onClick={() => navigate(back, { replace: true })} className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`}>Reçeteye dön</button>
            </div>
          );
          const nextMod = phase.passed ? nextModuleAfter(mod, allModules) : undefined;
          const nextOpen = nextMod && !moduleState(nextMod, allLessons, { ...progress, modules: { ...progress.modules, [mod.id]: { score: phase.score, passedAt: serverNow() } } }, { modules: allModules, tracks: allTracks }).locked ? nextMod : undefined;
          const slots = examSlots(myAttempts, mod.id);
          return (
            <div className="flex flex-col gap-2">
              {!phase.passed && (
                <p className="text-[13px] text-fg-2 text-center leading-relaxed">
                  {slots.left > 0
                    ? `Bu hafta ${slots.left} hakkın kaldı. Dersleri gözden geçirip yeniden dene.`
                    : `Bu haftaki ${EXAMS_PER_WEEK} hakkın doldu${slots.nextSlotAt ? ` · hakların ${renewText(slots.nextSlotAt)} yenilenir` : ''}.`}
                </p>
              )}
              {nextOpen ? (
                <>
                  <button onClick={() => navigate(`/modul/${nextOpen.id}`, { replace: true })} className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`}>
                    <span className="truncate">Sıradaki modül: {nextOpen.title}</span> <Icon name="chevronRight" size={16} />
                  </button>
                  <button onClick={() => navigate(back, { replace: true })} className={`${t.btn} ${t.btnSecondary} ${t.btnLg}`}>Modüle dön</button>
                </>
              ) : (
                <button onClick={() => navigate(back, { replace: true })} className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`}>{phase.passed ? 'Modüle dön' : 'Dersleri tekrar et'}</button>
              )}
            </div>
          );
        })()}
      </Page>
    );
  }

  // Sınav çözülüyor. Soru listesi boş gelemez (exam.ts resumeExam denemeyi
  // kapatır) ama yine de korunur: eskiden boş listede ekran çöküyordu.
  const q = phase.questions[Math.min(idx, phase.questions.length - 1)];
  if (!q) {
    return (
      <Page>
        <div className="flex flex-col items-center gap-3 pt-24 text-center">
          <p className="text-[14px] text-fg-2 leading-relaxed max-w-[300px]">Bu sınavın soruları güncellendi. Yeniden başlayabilirsin.</p>
          <button onClick={() => navigate(back, { replace: true })} className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`}>Geri dön</button>
        </div>
      </Page>
    );
  }
  const picked = answers[q.id];
  const isLast = idx === phase.questions.length - 1;
  const answeredCount = phase.questions.filter((x) => answers[x.id] !== undefined).length;
  const left = phase.deadline - now;
  const total = phase.questions.length * SECONDS_PER_QUESTION * 1000;

  return (
    <Page>
      <div className="flex items-center gap-3">
        <button
          onClick={() => confirm(EXIT_CONFIRM) && navigate(back, { replace: true })}
          className={t.iconBtn}
          aria-label="Sınavdan çık"
        >
          <Icon name="close" size={16} />
        </button>
        <ProgressBar value={((idx + 1) / phase.questions.length) * 100} tone="accent" className="flex-1" />
        <span className="text-[12px] text-fg-3 tnum">{idx + 1}/{phase.questions.length}</span>
      </div>

      <div role="timer" aria-label={`Kalan süre ${fmtClock(left)}`} className={`flex items-center justify-between rounded-lg px-3 py-2 border ${left < 60000 ? 'bg-negative-bg border-negative-line text-negative' : left < total * 0.25 ? 'bg-caution-bg border-caution-line text-caution' : 'bg-panel border-line text-fg-2'}`}>
        <span className="flex items-center gap-2 text-[12px] font-medium"><Icon name="clock" size={14} /> Kalan süre{left < 60000 ? ' · 1 dakikadan az' : ''}</span>
        <span className="text-[15px] font-bold tnum" aria-hidden>{fmtClock(left)}</span>
      </div>
      {/* Ekran okuyucu (H22): süre her saniye okunmaz; 1 dakika ve 10 saniye kala bir kez söylenir. */}
      <span className="sr-only" aria-live="polite">{left <= 10_000 ? 'Son 10 saniye.' : left <= 60_000 ? 'Son 1 dakika.' : ''}</span>

      <div className="flex flex-col gap-5 pt-1">
        <h2 className="text-[19px] font-semibold leading-snug">{q.prompt}</h2>
        {q.imageUrl && <img src={q.imageUrl} alt="" className="w-full rounded-xl border border-line" />}
        <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Şıklar">
          {q.options.map((o, i) => (
            <button
              key={i}
              role="radio"
              aria-checked={picked === i}
              onClick={() => choose(phase.attemptId, q.id, i)}
              className={`text-left px-4 py-3.5 rounded-xl border text-[15px] leading-snug transition-colors flex items-center gap-3 ${
                picked === i ? 'border-crema bg-panel-3' : 'border-line bg-panel hover:bg-panel-2'
              }`}
            >
              <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-[12px] font-semibold shrink-0 ${picked === i ? 'bg-crema text-espresso border-crema' : 'border-line-2 text-fg-3'}`}>
                {String.fromCharCode(65 + i)}
              </span>
              <span>{o}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-30 bg-bean/95 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-[560px] mx-auto px-4 py-3 flex gap-2">
          <button disabled={idx === 0} onClick={() => setIdx((i) => i - 1)} className={`${t.btn} ${t.btnSecondary} ${t.btnLg}`} aria-label="Önceki soru">
            <Icon name="chevronLeft" size={16} />
          </button>
          {isLast ? (
            <button
              disabled={picked === undefined}
              onClick={() => {
                const blank = phase.questions.length - answeredCount;
                if (blank > 0 && !confirm(`${blank} soru boş. Yine de gönderilsin mi?`)) return;
                submit(phase.attemptId, false, phase.questions.map((x) => x.id));
              }}
              className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1`}
            >
              Sınavı bitir
            </button>
          ) : (
            <button disabled={picked === undefined} onClick={() => setIdx((i) => i + 1)} className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1`}>
              Sonraki <Icon name="chevronRight" size={16} />
            </button>
          )}
        </div>
      </div>
    </Page>
  );
};

export const MistakeCard: React.FC<{ m: AttemptReviewItem }> = ({ m }) => (
  <div className={`${t.card} p-4 flex flex-col gap-2.5`}>
    <div className="text-[14px] font-semibold leading-snug">{m.prompt}</div>
    <div className="flex flex-col gap-1.5 text-[13px]">
      <div className="flex gap-2 text-negative">
        <Icon name="close" size={15} className="mt-0.5" />
        <span>{m.given === null ? 'Boş bırakıldı' : m.options[m.given]}</span>
      </div>
      <div className="flex gap-2 text-positive">
        <Icon name="check" size={15} className="mt-0.5" />
        <span>{m.options[m.answer]}</span>
      </div>
    </div>
    {m.explanation && <p className="text-[12px] text-fg-3 leading-relaxed border-t border-line pt-2.5">{m.explanation}</p>}
    {/* Hatalı soru: doğrudan Soru havuzuna bildirim olarak düşer. */}
    <ReportQuestionLink questionId={m.questionId} prompt={m.prompt} />
  </div>
);
