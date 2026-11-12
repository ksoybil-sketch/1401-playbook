import { addDoc, arrayUnion, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { RequestCategory, RequestNote, RequestPriority, RequestRejectReason, RequestStatus, RequestWaitReason, StoreRequest } from '../../shared/types';
import type { IconName } from '../ui/Icon';

/**
 * Mağaza talepleri — işletme kitapçığı, "Arıza Bildirimi" ve "Yazışma
 * Prosedürleri": arıza ve ihtiyaçlar uygulamada talep olarak açılır,
 * Bölge Müdürü'ne düşer, yetkili servis Operasyon Müdürü onayıyla çağrılır.
 * "Sözlü talepler geçersiz sayılır" — kayıt burada tutulur.
 */

export const CATEGORIES: { id: RequestCategory; label: string; icon: IconName; hint: string }[] = [
  { id: 'ariza', label: 'Arıza', icon: 'wrench', hint: 'Kahve makinesi, değirmen, fırın, yazıcı, yazılım' },
  { id: 'servis', label: 'Teknik servis', icon: 'shield', hint: 'Yetkili servis çağrısı, periyodik bakım' },
  { id: 'malzeme', label: 'Malzeme / ekipman', icon: 'package', hint: 'Eksik ekipman, sarf, ekstra sevkiyat' },
  { id: 'personel', label: 'Personel', icon: 'users', hint: 'Yeni barista, PIN, eğitim, vardiya' },
  { id: 'diger', label: 'Diğer', icon: 'message', hint: 'Başka bir konu' }
];

export const EQUIPMENT = ['Espresso makinesi', 'Kahve değirmeni', 'Filtre kahve makinesi', 'Fırın', 'Blender', 'Buzdolabı / dondurucu', 'Buz makinesi', 'Su arıtma', 'Yazıcı', 'Kerzzpos / yazılım', 'Diğer'];

export const STATUS: Record<RequestStatus, { label: string; tone: 'neutral' | 'positive' | 'caution' | 'negative' | 'accent' }> = {
  open: { label: 'Yeni', tone: 'caution' },
  seen: { label: 'Görüldü', tone: 'accent' },
  in_progress: { label: 'İşlemde', tone: 'accent' },
  approval: { label: 'Direktör onayında', tone: 'caution' },
  done: { label: 'Çözüldü', tone: 'positive' },
  rejected: { label: 'Reddedildi', tone: 'negative' }
};

export const isClosed = (s: RequestStatus) => s === 'done' || s === 'rejected';

/** Talep neden bekliyor: istatistikte aksayan yeri gösterir. */
export const WAIT_REASONS: { id: RequestWaitReason; label: string }[] = [
  { id: 'parca', label: 'Parça / malzeme bekleniyor' },
  { id: 'servis', label: 'Servis randevusu bekleniyor' },
  { id: 'onay', label: 'Direktör onayı bekleniyor' },
  { id: 'butce', label: 'Bütçe / fiyat teklifi bekleniyor' },
  { id: 'tedarikci', label: 'Tedarikçi bekleniyor' },
  { id: 'magaza', label: 'Mağazadan bilgi bekleniyor' },
  { id: 'diger', label: 'Diğer' }
];
export const REJECT_REASONS: { id: RequestRejectReason; label: string }[] = [
  { id: 'kapsam', label: 'Kapsam dışı' },
  { id: 'tekrar', label: 'Aynı konuda açık talep var' },
  { id: 'gereksiz', label: 'Gerek görülmedi' },
  { id: 'magaza_cozdu', label: 'Mağaza kendi çözdü' },
  { id: 'diger', label: 'Diğer' }
];
export const reasonLabel = (id?: string | null) =>
  [...WAIT_REASONS, ...REJECT_REASONS].find((r) => r.id === id)?.label || '';
export const catOf = (c: RequestCategory) => CATEGORIES.find((x) => x.id === c) ?? CATEGORIES[4];

export async function createRequest(input: {
  storeId: string; storeName: string; category: RequestCategory; priority: RequestPriority;
  title: string; detail: string; imageUrl?: string; equipment?: string;
  by: { uid: string; name: string };
}): Promise<string> {
  const now = Date.now();
  const data: Omit<StoreRequest, 'id'> = {
    storeId: input.storeId, storeName: input.storeName, category: input.category, priority: input.priority,
    title: input.title.trim(), detail: input.detail.trim(),
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    ...(input.equipment ? { equipment: input.equipment } : {}),
    status: 'open', notes: [], createdAt: now, createdBy: input.by.uid, createdByName: input.by.name,
    updatedAt: now, lastSide: 'store', closedAt: null
  };
  const r = await addDoc(collection(db, 'requests'), data);
  return r.id;
}

/** Yanıt ve/veya durum değişikliği. Her değişiklik iz bırakır (notes). */
export async function addNote(req: StoreRequest, note: {
  side: 'ops' | 'store'; by: { uid: string; name: string }; text: string; status?: RequestStatus;
  reason?: RequestWaitReason | RequestRejectReason | null;
}) {
  const statusChange = note.status && note.status !== req.status ? note.status : undefined;
  const n: RequestNote = {
    at: Date.now(), by: note.by.uid, byName: note.by.name, side: note.side, text: note.text.trim(),
    ...(statusChange ? { status: statusChange } : {}),
    ...(note.reason ? { reason: note.reason } : {})
  };
  // Yalnızca neden değişikliği (metin yok, durum aynı): mağaza tarafına
  // "yeni yanıt" gibi görünmesin.
  const reasonOnly = !n.text && !statusChange;
  const patch: Record<string, unknown> = { notes: arrayUnion(n), updatedAt: n.at, ...(reasonOnly ? {} : { lastSide: note.side }) };
  if (note.side === 'ops' && statusChange) {
    patch.status = statusChange;
    patch.closedAt = isClosed(statusChange) ? n.at : null;
  }
  if (note.side === 'ops') {
    const st = statusChange || req.status;
    if (st === 'rejected') { patch.rejectReason = (note.reason as RequestRejectReason) || null; patch.waitReason = null; }
    else if (isClosed(st)) patch.waitReason = null;
    else if (note.reason) patch.waitReason = note.reason;
    else if (statusChange === 'approval') patch.waitReason = 'onay';
  }
  await updateDoc(doc(db, 'requests', req.id), patch);
}

/** Operasyon talebi açtığında yeni talep "Görüldü"ye geçer — mağaza bunu görür. */
export async function markSeen(req: StoreRequest, by: { uid: string; name: string }) {
  if (req.status !== 'open') return;
  await updateDoc(doc(db, 'requests', req.id), {
    status: 'seen', updatedAt: Date.now(),
    notes: arrayUnion({ at: Date.now(), by: by.uid, byName: by.name, side: 'ops', text: '', status: 'seen' } as RequestNote)
  });
}
