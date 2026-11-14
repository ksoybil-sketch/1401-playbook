import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../api/firebase';

/**
 * Yapay zekâ anahtarı — config/ai. Ayrı dosyada: aiLesson.ts (SDK + zod)
 * yalnızca dosya okunurken indirilsin, panel açılışında değil.
 */
export async function getAiKey(): Promise<string | null> {
  const snap = await getDoc(doc(db, 'config', 'ai')).catch(() => null);
  const key = snap?.data()?.apiKey;
  return typeof key === 'string' && key.startsWith('sk-ant-') ? key : null;
}

/**
 * "Dosyadan ders" için: anahtar var mı, yoksa neden yok? Eskiden ikisi de
 * sessizce null dönüyordu ve ekranda yalnızca "yapay zekâ kapalı" yazıyordu.
 */
export type AiKeyStatus = { key: string; reason: 'ok' } | { key: null; reason: 'none' | 'denied' | 'offline' };

export async function getAiKeyStatus(): Promise<AiKeyStatus> {
  try {
    const snap = await getDoc(doc(db, 'config', 'ai'));
    const key = snap.data()?.apiKey;
    return typeof key === 'string' && key.startsWith('sk-ant-') ? { key, reason: 'ok' } : { key: null, reason: 'none' };
  } catch (e) {
    const code = (e as { code?: string })?.code || '';
    return { key: null, reason: /permission/.test(code) ? 'denied' : 'offline' };
  }
}

export async function setAiKey(apiKey: string, by: string): Promise<void> {
  await setDoc(doc(db, 'config', 'ai'), { apiKey: apiKey.trim(), updatedAt: Date.now(), updatedBy: by });
}

