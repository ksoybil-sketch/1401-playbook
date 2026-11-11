import { addDoc, collection, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { useSession } from '../store/session';
import { can } from '../lib/roles';
import type { ChangeOp, Proposal, ProposalKind } from '../../shared/types';

/**
 * İçerik ve bülten yazımının tek kapısı.
 *
 * Kahve Operasyon Müdürü (ve geliştirici) doğrudan yayınlar. Bölge müdürü
 * ve operasyon ekibinin değişikliği yayına girmez; proposals/{id} olarak
 * "Bekleyen onaylar" listesine düşer. Müdür onu olduğu gibi yayınlayabilir
 * ya da editörde açıp düzeltip yayınlayabilir — ikisi de bu fonksiyondan
 * geçer (proposalId verilir).
 *
 * Editörler belge yazmak için doğrudan setDoc/updateDoc çağırmaz; aksi
 * hâlde onay akışının dışından yayına giden bir yol açılmış olur.
 */

export interface ChangeMeta {
  kind: ProposalKind;
  /** Listede görünen ad: ders başlığı, bülten başlığı… */
  title: string;
  /** "Ders düzenlendi", "Yeni soru", "Silme" gibi. */
  summary: string;
}

export type ChangeResult = 'applied' | 'proposed';

function staff() {
  const s = useSession.getState().session;
  if (s.kind !== 'staff') throw new Error('Kahve Operasyonu oturumu yok.');
  return s;
}

/** Yayınlama yetkisi var mı (Cenk Bey ve geliştirici). */
export function canPublishNow(): boolean {
  const s = useSession.getState().session;
  return s.kind === 'staff' && can(s.role, 'publish');
}

/** Firestore `undefined` kabul etmez; öneride saklanan veriyi temizler. */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export async function applyOps(ops: ChangeOp[]): Promise<void> {
  const batch = writeBatch(db);
  for (const o of ops) {
    const ref = doc(db, o.col, o.id);
    if (o.op === 'delete') batch.delete(ref);
    else if (o.op === 'update') batch.update(ref, o.data || {});
    else batch.set(ref, o.data || {});
  }
  await batch.commit();
}

/** Yeni belge için kimlik (yazmadan). */
export const newId = (col: ChangeOp['col']) => doc(collection(db, col)).id;

export async function commitChange(ops: ChangeOp[], meta: ChangeMeta, proposalId?: string | null): Promise<ChangeResult> {
  const s = staff();
  const data = clean(ops);
  if (can(s.role, 'publish')) {
    await applyOps(data);
    if (proposalId) {
      const before = await getDoc(doc(db, 'proposals', proposalId));
      const original = JSON.stringify(before.data()?.ops || []);
      await updateDoc(doc(db, 'proposals', proposalId), {
        status: 'approved', reviewedAt: Date.now(), reviewedBy: s.uid, reviewedByName: s.name,
        editedOnReview: original !== JSON.stringify(data), ops: data
      });
    }
    return 'applied';
  }
  if (proposalId) {
    // Kendi bekleyen önerisini düzenliyor.
    await updateDoc(doc(db, 'proposals', proposalId), { ops: data, title: meta.title, summary: meta.summary, updatedAt: Date.now() });
    return 'proposed';
  }
  const p: Omit<Proposal, 'id'> = {
    kind: meta.kind, title: meta.title, summary: meta.summary, ops: data, status: 'pending',
    createdAt: Date.now(), createdBy: s.uid, createdByName: s.name
  };
  const r = await addDoc(collection(db, 'proposals'), p);
  lastProposalId = r.id;
  return 'proposed';
}

/** Son oluşturulan önerinin kimliği — editör, öneri üzerinde düzenlemeye devam edebilsin. */
export let lastProposalId: string | null = null;

/** Olduğu gibi yayınla. */
export async function approveProposal(p: Proposal): Promise<void> {
  await commitChange(p.ops, { kind: p.kind, title: p.title, summary: p.summary }, p.id);
}

export async function rejectProposal(p: Proposal, note: string): Promise<void> {
  const s = staff();
  await updateDoc(doc(db, 'proposals', p.id), {
    status: 'rejected', reviewedAt: Date.now(), reviewedBy: s.uid, reviewedByName: s.name, reviewNote: note.trim()
  });
}

export async function withdrawProposal(p: Proposal): Promise<void> {
  await updateDoc(doc(db, 'proposals', p.id), { status: 'withdrawn', updatedAt: Date.now() });
}

/** Kullanıcıya gösterilecek sonuç metni. */
export const resultText = (r: ChangeResult, applied = 'Kaydedildi') =>
  r === 'applied' ? applied : 'Onaya gönderildi — Kahve Operasyon Müdürü yayınlayınca görünür';
