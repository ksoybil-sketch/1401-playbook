import { collection, doc, getDoc, getDocs, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Attempt, Progress, Question } from '../../shared/types';

/**
 * Hatalı soruyu iptal et ve geçmiş sınavları yeniden puanla.
 *
 * Soru `disabled` işaretlenir (sınavlara artık gelmez). O soruyu içeren her
 * tamamlanmış sınavda soru hesaptan çıkarılır: toplam bir azalır, soru
 * doğru cevaplandıysa doğru sayısı da bir azalır, yanlışlardan silinir.
 * Puan yeniden hesaplanır; sınav artık geçme notunu aşıyorsa baristanın
 * modül (ya da mini sınav) sonucu da güncellenir. Puanı düşen olmaz:
 * hatalı soruyu yanlış yapan kazanır, doğru yapan aynı oranı korur.
 */
export interface RegradeResult { attempts: number; changed: number; nowPassed: number }

export async function disableAndRegrade(q: Question, reason: string, by: { name: string }): Promise<RegradeResult> {
  const now = Date.now();
  await updateDoc(doc(db, 'questions', q.id), { disabled: true, disabledReason: reason, disabledByName: by.name, disabledAt: now });

  const snap = await getDocs(query(collection(db, 'attempts'), where('questionIds', 'array-contains', q.id)));
  let changed = 0, nowPassed = 0;
  for (const d of snap.docs) {
    const a = { id: d.id, ...d.data() } as Attempt;
    if (!a.submittedAt || a.voided || (a.voidedQuestions || []).includes(q.id)) continue;
    const wasWrong = (a.mistakes || []).some((m) => m.questionId === q.id);
    const total = Math.max(0, a.total - 1);
    const correct = Math.max(0, (a.correct || 0) - (wasWrong ? 0 : 1));
    const score = total ? Math.round((correct / total) * 100) : 0;
    const passed = score >= (a.passScore ?? 80);
    await updateDoc(doc(db, 'attempts', a.id), {
      total, correct, score, passed,
      mistakes: (a.mistakes || []).filter((m) => m.questionId !== q.id),
      voidedQuestions: [...(a.voidedQuestions || []), q.id],
      regradedAt: now,
      regradeNote: `“${q.prompt.slice(0, 80)}” sorusu iptal edildi: ${reason}`
    });
    changed++;
    if (passed && !a.passed) nowPassed++;
    // Geçme sonucu: modül sınavı → progress.modules, mini sınav → progress.quizzes.
    if (passed) {
      const field = a.lessonId ? 'quizzes' : 'modules';
      const key = a.lessonId || a.moduleId;
      const pRef = doc(db, 'progress', a.baristaId);
      await runTransaction(db, async (tx) => {
        const p = await tx.get(pRef);
        if (!p.exists()) return;
        const prev = ((p.data() as Progress)[field] as Progress['modules'] | undefined)?.[key];
        if (!prev || prev.score < score) tx.update(pRef, { [`${field}.${key}`]: { score, passedAt: prev?.passedAt || a.submittedAt }, updatedAt: now });
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
