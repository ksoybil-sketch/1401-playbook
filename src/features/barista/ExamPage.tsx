import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppError, backend, errorText } from '../../api/backend';
import { useContent } from '../../store/content';
import { useBaristaSession } from './useBaristaData';
import { Icon } from '../../ui/Icon';
import { Page, ProgressBar, Ring, Spinner, ErrorText, fmtDateTime } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { AttemptReviewItem, ExamQuestion } from '../../../shared/types';

type Phase =
  | { k: 'intro' }
  | { k: 'loading' }
  | { k: 'run'; attemptId: string; passScore: number; questions: ExamQuestion[] }
  | { k: 'sending' }
  | { k: 'result'; score: number; correct: number; total: number; passed: boolean; passScore: number; mistakes: AttemptReviewItem[] };

export const ExamPage: React.FC = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const s = useBaristaSession();
  const mod = useContent((x) => x.modules.find((m) => m.id === moduleId));
  const [phase, setPhase] = useState<Phase>({ k: 'intro' });
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  // Sınav sırasında yanlışlıkla geri tuşuna basılırsa uyar.
  useEffect(() => {
    if (phase.k !== 'run') return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [phase.k]);

  if (!mod) return <Page><p className="text-fg-3">Modül bulunamadı.</p></Page>;

  const start = async () => {
    setError(null);
    setPhase({ k: 'loading' });
    try {
      const res = await backend.startExam(mod, { baristaId: s.baristaId, storeId: s.storeId, name: s.name });
      setAnswers({});
      setIdx(0);
      setPhase({ k: 'run', ...res });
    } catch (e) {
      let msg = errorText(e);
      if (e instanceof AppError && e.code === 'weekly-limit') {
        const nextAt = (e.data as { nextAt: number } | undefined)?.nextAt;
        msg = `Bu haftaki 3 sınav hakkını kullandın.${nextAt ? ` Yeni hakkın ${fmtDateTime(nextAt)} tarihinde açılacak.` : ''}`;
      }
      setError(msg);
      setPhase({ k: 'intro' });
    }
  };

  const submit = async (attemptId: string) => {
    setPhase({ k: 'sending' });
    try {
      const res = await backend.submitExam(attemptId, answers, { baristaId: s.baristaId, storeId: s.storeId });
      setPhase({ k: 'result', ...res });
    } catch (e) {
      setError(errorText(e));
      setPhase({ k: 'intro' });
    }
  };

  if (phase.k === 'intro' || phase.k === 'loading') {
    return (
      <Page>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/modul/${mod.id}`)} className={t.iconBtn} aria-label="Kapat"><Icon name="close" size={16} /></button>
          <span className="text-[13px] text-fg-3">Modül sınavı</span>
        </div>
        <div className="flex flex-col items-center text-center gap-4 pt-6">
          <span className={`${t.iconChip('accent')} w-14 h-14 rounded-2xl`}><Icon name="clipboard" size={26} /></span>
          <h1 className="text-[22px] font-bold">{mod.title}</h1>
          <div className={`${t.listGroup} w-full text-left`}>
            {[
              ['Soru sayısı', `${mod.examSize}`],
              ['Geçme notu', `%${mod.passScore}`],
              ['Haftalık hak', '3 deneme'],
              ['Süre', 'Sınırsız — acele etme']
            ].map(([a, b]) => (
              <div key={a} className={`${t.listRowStatic} justify-between`}>
                <span className="text-[14px] text-fg-2">{a}</span>
                <span className="text-[14px] font-semibold">{b}</span>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-fg-3 leading-relaxed max-w-[340px]">
            Sınavı başlattığında bir hakkın kullanılır. Sorular her denemede karışık gelir; daha önce yanlış yaptığın sorular tekrar sorulabilir.
          </p>
          <div className="w-full"><ErrorText>{error}</ErrorText></div>
          <button onClick={start} disabled={phase.k === 'loading'} className={`${t.btn} ${t.btnPrimary} ${t.btnLg} w-full`}>
            {phase.k === 'loading' ? <Spinner size={16} /> : 'Başla'}
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
        </div>

        {phase.mistakes.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className={t.sectionLabel}>Yanlışların · {phase.mistakes.length}</span>
            {phase.mistakes.map((m) => <MistakeCard key={m.questionId} m={m} />)}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button onClick={() => navigate(`/modul/${mod.id}`, { replace: true })} className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`}>Modüle dön</button>
        </div>
      </Page>
    );
  }

  // Sınav çözülüyor
  const q = phase.questions[idx];
  const picked = answers[q.id];
  const isLast = idx === phase.questions.length - 1;
  const answeredCount = Object.keys(answers).length;

  return (
    <Page>
      <div className="flex items-center gap-3">
        <button
          onClick={() => confirm('Sınavdan çıkarsan bu deneme hakkından düşer. Çıkmak istiyor musun?') && navigate(`/modul/${mod.id}`)}
          className={t.iconBtn}
          aria-label="Sınavdan çık"
        >
          <Icon name="close" size={16} />
        </button>
        <ProgressBar value={((idx + 1) / phase.questions.length) * 100} tone="accent" className="flex-1" />
        <span className="text-[12px] text-fg-3 tnum">{idx + 1}/{phase.questions.length}</span>
      </div>

      <div className="flex flex-col gap-5 pt-2">
        <h2 className="text-[19px] font-semibold leading-snug">{q.prompt}</h2>
        {q.imageUrl && <img src={q.imageUrl} alt="" className="w-full rounded-xl border border-line" />}
        <div className="flex flex-col gap-2.5">
          {q.options.map((o, i) => (
            <button
              key={i}
              onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
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
  </div>
);
