import { ReportQuestionLink } from '../shared/Feedback';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppError, errorText } from '../../api/backend';
import {
  findActiveAttempt, saveAnswers, startExam, submitExam, SECONDS_PER_QUESTION, type ExamResult, EXAMS_PER_WEEK, QUIZ_PASS } from '../../api/exam';
import { useContent } from '../../store/content';
import { useBaristaSession } from './useBaristaData';
import { Icon } from '../../ui/Icon';
import { Page, ProgressBar, Ring, Spinner, ErrorText, fmtDateTime } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { AttemptReviewItem, ExamQuestion } from '../../../shared/types';

type Phase =
  | { k: 'intro' }
  | { k: 'loading' }
  | { k: 'run'; attemptId: string; passScore: number; questions: ExamQuestion[]; deadline: number }
  | { k: 'sending' }
  | { k: 'result' } & ExamResult;

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
  const back = lesson ? `/recete/${lesson.id}` : `/modul/${moduleId}`;
  const [phase, setPhase] = useState<Phase>({ k: 'intro' });
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [resumable, setResumable] = useState<{ deadline: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const submitting = useRef(false);

  // Bu modülde süresi dolmamış açık deneme var mı? Varsa "Başla" yerine "Devam et".
  useEffect(() => {
    if (!mod) return;
    findActiveAttempt(s.baristaId, mod.id, lesson?.id).then((a) => setResumable(a?.deadline ? { deadline: a.deadline } : null)).catch(() => {});
  }, [s.baristaId, mod, lesson]);

  // Geri sayım
  useEffect(() => {
    if (phase.k !== 'run') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase.k]);

  const submit = useCallback(async (attemptId: string, timedOut = false) => {
    if (submitting.current) return;
    submitting.current = true;
    clearTimeout(saveTimer.current);
    setPhase({ k: 'sending' });
    try {
      const res = await submitExam(attemptId, answers, { timedOut });
      setPhase({ k: 'result', ...res });
    } catch (e) {
      setError(errorText(e));
      setPhase({ k: 'intro' });
    } finally {
      submitting.current = false;
    }
  }, [answers]);

  // Süre dolunca o ana kadarki cevaplarla otomatik teslim.
  useEffect(() => {
    if (phase.k === 'run' && now >= phase.deadline) submit(phase.attemptId, true);
  }, [now, phase, submit]);

  // Sınav sırasında yanlışlıkla geri tuşuna basılırsa uyar.
  useEffect(() => {
    if (phase.k !== 'run') return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [phase.k]);

  if (!mod) return <Page><p className="text-fg-3">Modül bulunamadı.</p></Page>;

  const size = lesson ? lesson.quiz || 3 : mod.examSize;
  const minutes = Math.ceil((size * SECONDS_PER_QUESTION) / 60);

  const start = async () => {
    setError(null);
    setPhase({ k: 'loading' });
    try {
      const res = await startExam(mod, { baristaId: s.baristaId, storeId: s.storeId, name: s.name }, lesson);
      setAnswers(res.answers);
      // Devam edilen denemede ilk boş soruya git.
      const firstBlank = res.questions.findIndex((q) => res.answers[q.id] === undefined);
      setIdx(firstBlank < 0 ? 0 : firstBlank);
      setNow(Date.now());
      setPhase({ k: 'run', attemptId: res.attemptId, passScore: res.passScore, questions: res.questions, deadline: res.deadline });
    } catch (e) {
      let msg = errorText(e);
      if (e instanceof AppError && e.code === 'weekly-limit') {
        const nextAt = (e.data as { nextAt: number } | undefined)?.nextAt;
        msg = `Bu sınav için haftalık ${EXAMS_PER_WEEK} deneme hakkını kullandın.${nextAt ? ` Yeni hakkın ${fmtDateTime(nextAt)} tarihinde açılacak.` : ''}`;
      }
      setError(msg);
      setPhase({ k: 'intro' });
    }
  };

  const choose = (attemptId: string, qid: string, i: number) => {
    const next = { ...answers, [qid]: i };
    setAnswers(next);
    // Her işaretleme denemeye yazılır; uygulama kapanırsa kaybolmaz.
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveAnswers(attemptId, next), 500);
  };

  if (phase.k === 'intro' || phase.k === 'loading') {
    const left = resumable ? resumable.deadline - Date.now() : 0;
    return (
      <Page>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(back)} className={t.iconBtn} aria-label="Kapat"><Icon name="close" size={16} /></button>
          <span className="text-[13px] text-fg-3">{lesson ? 'Mini sınav' : 'Modül sınavı'}</span>
        </div>
        <div className="flex flex-col items-center text-center gap-4 pt-6">
          <span className={`${t.iconChip('accent')} w-14 h-14 rounded-2xl`}><Icon name="clipboard" size={26} /></span>
          <h1 className="text-[22px] font-bold">{lesson ? lesson.title : mod.title}</h1>
          <div className={`${t.listGroup} w-full text-left`}>
            {[
              ['Soru sayısı', `${size}`],
              ['Süre', `${minutes} dakika`],
              ['Geçme notu', `%${lesson ? QUIZ_PASS : mod.passScore}`]
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
          <div className="w-full"><ErrorText>{error}</ErrorText></div>
          <button onClick={start} disabled={phase.k === 'loading'} className={`${t.btn} ${t.btnPrimary} ${t.btnLg} w-full`}>
            {phase.k === 'loading' ? <Spinner size={16} /> : resumable && left > 0 ? 'Kaldığım yerden devam et' : 'Başla'}
          </button>
        </div>
      </Page>
    );
  }

  if (phase.k === 'sending') {
    return <Page><div className="flex flex-col items-center gap-3 pt-24"><Spinner size={26} /><span className="text-[13px] text-fg-3">Puanlanıyor…</span></div></Page>;
  }

  if (phase.k === 'result') {
    return (
      <Page>
        <div className="flex flex-col items-center text-center gap-3 pt-6">
          <Ring value={phase.score} size={110} label={`%${phase.score}`} />
          <h1 className="text-[22px] font-bold mt-2">{phase.passed ? 'Tebrikler, geçtin!' : 'Bu sefer olmadı'}</h1>
          <p className="text-[13px] text-fg-3">
            {phase.correct}/{phase.total} doğru · Geçme notu %{phase.passScore}
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

        <div className="flex flex-col gap-2">
          <button onClick={() => navigate(back, { replace: true })} className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`}>{lesson ? 'Reçeteye dön' : 'Modüle dön'}</button>
        </div>
      </Page>
    );
  }

  // Sınav çözülüyor
  const q = phase.questions[idx];
  const picked = answers[q.id];
  const isLast = idx === phase.questions.length - 1;
  const answeredCount = phase.questions.filter((x) => answers[x.id] !== undefined).length;
  const left = phase.deadline - now;
  const total = phase.questions.length * SECONDS_PER_QUESTION * 1000;

  return (
    <Page>
      <div className="flex items-center gap-3">
        <button
          onClick={() => confirm('Sınavdan çıkarsan süre işlemeye devam eder. Süre içinde dönüp kaldığın yerden devam edebilirsin. Çıkılsın mı?') && navigate(back)}
          className={t.iconBtn}
          aria-label="Sınavdan çık"
        >
          <Icon name="close" size={16} />
        </button>
        <ProgressBar value={((idx + 1) / phase.questions.length) * 100} tone="accent" className="flex-1" />
        <span className="text-[12px] text-fg-3 tnum">{idx + 1}/{phase.questions.length}</span>
      </div>

      <div className={`flex items-center justify-between rounded-lg px-3 py-2 border ${left < 60000 ? 'bg-negative-bg border-negative-line text-negative' : left < total * 0.25 ? 'bg-caution-bg border-caution-line text-caution' : 'bg-panel border-line text-fg-2'}`}>
        <span className="flex items-center gap-2 text-[12px] font-medium"><Icon name="clock" size={14} /> Kalan süre</span>
        <span className="text-[15px] font-bold tnum">{fmtClock(left)}</span>
      </div>

      <div className="flex flex-col gap-5 pt-1">
        <h2 className="text-[19px] font-semibold leading-snug">{q.prompt}</h2>
        {q.imageUrl && <img src={q.imageUrl} alt="" className="w-full rounded-xl border border-line" />}
        <div className="flex flex-col gap-2.5">
          {q.options.map((o, i) => (
            <button
              key={i}
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
          <button disabled={idx === 0} onClick={() => setIdx((i) => i - 1)} className={`${t.btn} ${t.btnSecondary} ${t.btnLg}`}>
            <Icon name="chevronLeft" size={16} />
          </button>
          {isLast ? (
            <button
              disabled={picked === undefined}
              onClick={() => {
                const blank = phase.questions.length - answeredCount;
                if (blank > 0 && !confirm(`${blank} soru boş. Yine de gönderilsin mi?`)) return;
                submit(phase.attemptId);
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
