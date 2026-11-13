import { addDoc, arrayUnion, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { BoardMessage, BoardQuestion, BoardTopic } from '../../shared/types';

/**
 * Yönetim Kurulu soruları: kurul üyesi bir konuyu (talep, öneri, mağaza,
 * görev…) ya da genel bir şeyi sorar; Kahve Operasyon Direktörü ya da
 * Bölge Müdürü yanıtlar. Yazışma tek belgede, mesaj listesi olarak durur.
 */

export const TO_LABEL: Record<BoardQuestion['to'], string> = {
  director: 'Kahve Operasyon Direktörü',
  opsmanager: 'Operasyon Müdürü',
  regional: 'Bölge Müdürü',
  all: 'Bütün yöneticiler',
  both: 'Bütün yöneticiler'
};

export const TOPIC_LABEL: Record<BoardTopic['kind'], string> = {
  request: 'Talep',
  proposal: 'Onay bekleyen',
  store: 'Mağaza',
  assignment: 'Görev',
  barista: 'Barista',
  report: 'Rapor',
  general: 'Genel'
};

/** Operasyon tarafında konunun açılacağı ekran. */
export function topicLink(t: BoardTopic): string | null {
  switch (t.kind) {
    case 'request': return t.id ? `/talepler?talep=${t.id}` : '/talepler';
    case 'proposal': return '/onaylar';
    case 'store': return t.id ? `/magazalar/${t.id}` : '/magazalar';
    case 'assignment': return '/gorevler';
    case 'barista': return t.id ? `/baristalar/${t.id}` : '/baristalar';
    default: return null;
  }
}

export async function askBoardQuestion(input: { topic: BoardTopic; to: BoardQuestion['to']; text: string; by: { uid: string; name: string } }) {
  const now = Date.now();
  const msg: BoardMessage = { at: now, by: input.by.uid, byName: input.by.name, side: 'board', text: input.text.trim() };
  const data: Omit<BoardQuestion, 'id'> = {
    topic: { kind: input.topic.kind, id: input.topic.id ?? null, title: input.topic.title.slice(0, 200) },
    to: input.to,
    messages: [msg],
    status: 'open',
    lastSide: 'board',
    createdAt: now,
    createdBy: input.by.uid,
    createdByName: input.by.name,
    updatedAt: now
  };
  return addDoc(collection(db, 'boardQuestions'), data);
}

/** Kurul ek soru yazar (soru yeniden açılır) ya da operasyon yanıtlar. */
export async function replyBoardQuestion(q: BoardQuestion, side: 'board' | 'ops', text: string, by: { uid: string; name: string }) {
  const now = Date.now();
  const msg: BoardMessage = { at: now, by: by.uid, byName: by.name, side, text: text.trim() };
  await updateDoc(doc(db, 'boardQuestions', q.id), {
    messages: arrayUnion(msg),
    status: side === 'ops' ? 'answered' : 'open',
    lastSide: side,
    updatedAt: now
  });
}

/** Kurul yanıttan memnun: soru kapanır. */
export async function closeBoardQuestion(q: BoardQuestion) {
  await updateDoc(doc(db, 'boardQuestions', q.id), { status: 'closed', lastSide: 'board', updatedAt: Date.now() });
}
