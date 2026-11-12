import { addDoc, collection, getFirestore, Timestamp, DocumentReference, type Firestore } from '@firebase/firestore';
import { getApp } from 'firebase/app';

/**
 * Demo kaydı: demoyu deneyenlerin hangi ekranlara girdiği ve ne değiştirdiği.
 *
 * Yalnızca VITE_ACTIVITY_LOG=true ile derlenen pakette (demo, emülatör)
 * çalışır; canlı pakette bu dosya hiç yer almaz. Kayıtlar Firestore'daki
 * demoLog koleksiyonuna gider ve yalnızca uygulama geliştiricisi okur
 * (firestore.rules). Okumak için: panelde "Demo kaydı" ya da
 * scripts/demo-log.mjs.
 */
export const ACTIVITY_LOG = import.meta.env.VITE_ACTIVITY_LOG === 'true';

export interface Actor { uid: string; who: string; role: string }
let actor: Actor | null = null;
export const setActor = (a: Actor | null) => { actor = a; };

/** Aynı hesapla giren iki kişiyi ayırmak için sekme başına kısa kimlik. */
const SID = (() => {
  try {
    const k = 'demo.sid';
    let v = sessionStorage.getItem(k);
    if (!v) { v = Math.random().toString(36).slice(2, 8); sessionStorage.setItem(k, v); }
    return v;
  } catch { return Math.random().toString(36).slice(2, 8); }
})();
const DEVICE = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'telefon' : 'bilgisayar';

export type Kind = 'oturum' | 'sayfa' | 'değişiklik';

/** Koleksiyon adlarının okunur karşılıkları. */
const COLLECTIONS: Record<string, string> = {
  lessons: 'Ders', modules: 'Modül', tracks: 'Eğitim yolu', questions: 'Soru', proposals: 'Öneri',
  requests: 'Talep', baristas: 'Barista', bulletins: 'Bülten', assignments: 'Görev', attempts: 'Sınav',
  progress: 'İlerleme', stores: 'Mağaza', users: 'Kullanıcı', invites: 'Davet', pairingCodes: 'Eşleştirme kodu',
  'config/badges': 'Rozet ve başarım ayarları', 'config/ai': 'Yapay zekâ anahtarı'
};
export function labelOf(path: string): string {
  const parts = path.split('/');
  return COLLECTIONS[parts.slice(0, 2).join('/')] || COLLECTIONS[parts[0]] || parts[0];
}

/** Firestore verisini okunur, kısa bir JSON'a çevirir. */
function clean(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v === 'string') return v.length > 240 ? v.slice(0, 240) + '…' : v;
  if (typeof v !== 'object') return v;
  if (v instanceof Timestamp) return new Date(v.toMillis()).toISOString();
  if (v instanceof DocumentReference) return v.path;
  const m = (v as { _methodName?: string })._methodName;
  if (m) return `«${m.replace('FieldValue.', '')}»`;
  if (depth > 3) return '…';
  if (Array.isArray(v)) return v.length > 12 ? [...v.slice(0, 12).map((x) => clean(x, depth + 1)), `… +${v.length - 12}`] : v.map((x) => clean(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = clean(x, depth + 1);
  return out;
}

/** Kayıt değeri olmayan gürültü: "son görülme" gibi otomatik yazımlar. */
function isNoise(path: string, data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data as object);
  return path.startsWith('users/') && keys.length > 0 && keys.every((k) => ['lastSeenAt', 'paired', 'label'].includes(k));
}

export function record(db: Firestore | null, kind: Kind, entry: { path?: string; op?: string; label?: string; data?: unknown }) {
  if (!ACTIVITY_LOG || !actor) return;
  const path = entry.path || '';
  if (path.startsWith('demoLog/')) return;
  if (kind === 'değişiklik' && isNoise(path, entry.data)) return;
  let detail = '';
  try { detail = entry.data === undefined ? '' : JSON.stringify(clean(entry.data)); } catch { detail = ''; }
  if (detail.length > 3500) detail = detail.slice(0, 3500) + '…';
  const doc = {
    at: Date.now(), uid: actor.uid, who: actor.who, role: actor.role, sid: SID, device: DEVICE,
    kind, path, op: entry.op || '', label: entry.label || (path ? labelOf(path) : ''), detail
  };
  try {
    addDoc(collection(db || getFirestore(getApp()), 'demoLog'), doc).catch(() => undefined);
  } catch { /* kayıt yazılamazsa uygulama etkilenmesin */ }
}
