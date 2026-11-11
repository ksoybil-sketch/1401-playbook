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

export async function setAiKey(apiKey: string, by: string): Promise<void> {
  await setDoc(doc(db, 'config', 'ai'), { apiKey: apiKey.trim(), updatedAt: Date.now(), updatedBy: by });
}

