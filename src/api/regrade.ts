import { arrayUnion, collection, doc, getDoc, getDocs, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { useSession } from '../store/session';
import { authorName } from '../lib/roles';
import type { Attempt, Progress, Question } from '../../shared/types';

/**
 * Hatalı soruyu iptal et ve geçmiş sınavları yeniden puanla.
 *
 * Soru `disabled` işaretlenir (sınavlara artık gelmez). Kural: soru
 * iptalinde kimsenin puanı düşmez, geçen kalmaz.
 *  - Soruyu yanlış yapan / boş bırakan: soru hesaptan çıkar (toplam bir
 *    azalır, yanlışlardan silinir) — puanı yükselir, geçme notunu aşarsa
 *    baristanın modül (ya da mini sınav) sonucu da yazılır.
 *  - Soruyu doğru yapan: hiçbir şey değişmez (soru doğru sayılmaya devam
 *    eder). Eski hesap doğruyu da paydadan düşüyordu: 8/10 = 80 (geçti) →
 *    7/9 = 78 (kaldı) oluyor, ilerleme kaydı "geçti" diye kalıyordu.
 * Bu, "yeni puan = max(eski, soru çıkarılmış puan)" ile aynı sonuçtur ve
 * doğru/toplam sayıları puanla tutarlı kalır.
 *
 * Teslim edilmemiş (açık) denemelere yalnızca "bu soru iptal" notu düşülür
 * (voidedQuestions); barista teslim edince aynı kural uygulanır (exam.ts).
 */
export interface RegradeResult { attempts: number; changed: number; nowPassed: number }

/** İptal edilen sorunun bir denemeye etkisi (saf; teslimde de aynı kural). */
export function regradeOne(a: Pick<Attempt, 'total' | 'correct' | 'score' | 'passed' | 'passScore' | 'mistakes'>, questionId: string) {
  const wasWrong = (a.mistakes || []).some((m) => m.questionId === questionId);
  if (!wasWrong || a.total <= 1) {
    // Doğru yapan (ya da tek soruluk sınav): puan aynen kalır.
    return { changed: false, total: a.total, correct: a.correct || 0, score: a.score ?? 0, passed: !!a.passed, mistakes: a.mistakes || [] };
  }
  const total = a.total - 1;
  const correct = Math.min(total, a.correct || 0);
  const recomputed = Math.round((correct / total) * 100);
  const score = Math.max(a.score ?? 0, recomputed);
  const passed = !!a.passed || score >= (a.passScore ?? 80);
  return { changed: true, total, correct, score, passed, mistakes: (a.mistakes || []).filter((m) => m.questionId !== questionId) };
}

export async function disableAndRegrade(q: Question, reason: string, by: { name: string; role?: string }): Promise<RegradeResult> {
  const now = Date.now();
  const s = useSession.getState().session;
  const role = by.role ?? (s.kind === 'staff' ? s.role : undefined);
  await updateDoc(doc(db, 'questions', q.id), { disabled: true, disabledReason: reason, disabledByName: authorName(role, by.name), disabledAt: now });

  const snap = await getDocs(query(collection(db, 'attempts'), where('questionIds', 'array-contains', q.id)));
  let changed = 0, nowPassed = 0;
  for (const d of snap.docs) {
    const a = { id: d.id, ...d.data() } as Attempt;
    if (a.voided || (a.voidedQuestions || []).includes(q.id)) continue;
    if (!a.submittedAt) {
      // Açık deneme: teslimde bu soru iptal kuralıyla puanlanır.
      await updateDoc(doc(db, 'attempts', a.id), { voidedQuestions: arrayUnion(q.id) }).catch(() => {});
      continue;
    }
    const r = regradeOne(a, q.id);
    if (!r.changed) {
      // Doğru yapan: puan değişmez; yalnızca işlendi diye işaretlenir.
      await updateDoc(doc(db, 'attempts', a.id), { voidedQuestions: [...(a.voidedQuestions || []), q.id] });
      continue;
    }
    await updateDoc(doc(db, 'attempts', a.id), {
      total: r.total, correct: r.correct, score: r.score, passed: r.passed,
      mistakes: r.mistakes,
      voidedQuestions: [...(a.voidedQuestions || []), q.id],
      regradedAt: now,
      regradeNote: `“${q.prompt.slice(0, 80)}” sorusu iptal edildi: ${reason}`
    });
    changed++;
    if (r.passed && !a.passed) nowPassed++;
    // Geçme sonucu: modül sınavı → progress.modules, mini sınav → progress.quizzes.
    // Puan hiç düşmediği için ilerleme kaydı yalnızca yükselir.
    if (r.passed) {
      const field = a.lessonId ? 'quizzes' : 'modules';
      const key = a.lessonId || a.moduleId;
      const pRef = doc(db, 'progress', a.baristaId);
      await runTransaction(db, async (tx) => {
        const p = await tx.get(pRef);
        if (!p.exists()) return;
        const prev = ((p.data() as Progress)[field] as Progress['modules'] | undefined)?.[key];
        if (!prev || prev.score < r.score) tx.update(pRef, { [`${field}.${key}`]: { score: r.score, passedAt: prev?.passedAt || a.submittedAt }, updatedAt: now });
      });
    }
  }
  return { attempts: snap.size, changed, nowPassed };
}

/** İptali kaldır: soru yeniden sınavlara gelir (geçmiş puanlar değişmez). */
export async function enableQuestion(id: string) {
  await updateDoc(doc(db, 'questions', id), { disabled: false });
}

export async function loadQuestion(id: string): Promise<Question | null> {
  const s = await getDoc(doc(db, 'questions', id));
  return s.exists() ? ({ id: s.id, ...s.data() } as Question) : null;
}
