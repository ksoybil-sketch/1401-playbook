import { useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import type { Lesson, Module } from '../../../shared/types';

/**
 * Sınavda gerçekten sorulacak soru sayısı: min(examSize, etkin soru); mini
 * sınavda reçetenin etkin sorularının hepsi. Eskiden giriş ekranı, modül
 * sayfası ve ana sayfa modülün ayarındaki sayıyı (examSize, mini sınavda
 * lesson.quiz) gösteriyordu: sorusu kalmamış modülde "10 soru" yazıp
 * "Başla"da "Bu modülde henüz soru yok" deniyordu.
 *
 * Toplama sorgusu (modül başına 2 okuma: bütün sorular ve iptal edilenler),
 * cihazda 10 dakika saklanır. Okunamazsa (bağlantı yok) null: ekran eski
 * sayıyı (ayardaki) gösterir.
 */
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { n: number; at: number }>();
const inflight = new Map<string, Promise<number | null>>();

export async function activeQuestionCount(moduleId: string, lessonId: string | null): Promise<number | null> {
  const key = `${moduleId}:${lessonId || ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.n;
  const running = inflight.get(key);
  if (running) return running;
  const base = lessonId
    ? query(collection(db, 'questions'), where('moduleId', '==', moduleId), where('lessonId', '==', lessonId))
    : query(collection(db, 'questions'), where('moduleId', '==', moduleId));
  const p = Promise.all([getCountFromServer(base), getCountFromServer(query(base, where('disabled', '==', true)))])
    .then(([all, off]) => {
      const n = Math.max(0, all.data().count - off.data().count);
      cache.set(key, { n, at: Date.now() });
      return n;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Ayardaki sayı (yedek): modül sınavında examSize, mini sınavda reçetenin soru sayısı. */
export const configuredSize = (mod: Module, lesson?: Lesson | null) => (lesson ? lesson.quiz || 3 : mod.examSize || 10);

/**
 * { size, empty }: size sorulacak soru sayısı (henüz bilinmiyorsa ayardaki),
 * empty modülde/reçetede şu an hiç etkin soru yoksa true.
 */
export function useExamSize(mod: Module | null | undefined, lesson?: Lesson | null) {
  const moduleId = mod?.id || null;
  const lessonId = lesson?.id || null;
  const [n, setN] = useState<number | null>(() => {
    const hit = moduleId ? cache.get(`${moduleId}:${lessonId || ''}`) : undefined;
    return hit ? hit.n : null;
  });
  useEffect(() => {
    let alive = true;
    if (!moduleId) return;
    activeQuestionCount(moduleId, lessonId).then((x) => { if (alive) setN(x); });
    return () => { alive = false; };
  }, [moduleId, lessonId]);
  if (!mod) return { size: 0, empty: false, known: false };
  const conf = configuredSize(mod, lesson);
  if (n === null) return { size: conf, empty: false, known: false };
  return { size: lesson ? n : Math.min(mod.examSize || 10, n), empty: n === 0, known: true };
}
