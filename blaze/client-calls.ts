import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { BaristaRole, ExamQuestion, AttemptReviewItem } from '../../shared/types';

/** Cloud Function çağrısı; hata mesajı Türkçe olarak sunucudan gelir. */
function call<I, O>(name: string) {
  const fn = httpsCallable<I, O>(functions, name);
  return async (data: I): Promise<O> => (await fn(data)).data;
}

export interface DeviceCreds { deviceId: string; deviceSecret: string }
type TokenOut = { token: string };
type BaristaOut = TokenOut & { barista: { id: string; name: string; role: BaristaRole } };
type InviteOut = { code: string; expiresAt: number };

export const api = {
  // Cihaz
  pairDevice: call<{ code: string; label: string }, DeviceCreds & TokenOut & { storeId: string; storeName: string }>('pairDevice'),
  deviceSignIn: call<DeviceCreds, TokenOut & { storeId: string; storeName: string }>('deviceSignIn'),
  baristaSignIn: call<DeviceCreds & { baristaId: string; pin: string }, BaristaOut>('baristaSignIn'),
  redeemInvite: call<DeviceCreds & { code: string; pin: string }, BaristaOut>('redeemInvite'),

  // Yönetici
  createPairingCode: call<{ storeId: string }, InviteOut>('createPairingCode'),
  revokeDevice: call<{ deviceId: string }, { ok: true }>('revokeDevice'),
  createBarista: call<{ name: string; storeId: string; role: BaristaRole; phone?: string }, InviteOut & { baristaId: string }>('createBarista'),
  resetBaristaPin: call<{ baristaId: string }, InviteOut>('resetBaristaPin'),
  setBaristaActive: call<{ baristaId: string; active: boolean }, { ok: true } & Partial<InviteOut>>('setBaristaActive'),
  updateBarista: call<{ baristaId: string; name?: string; storeId?: string; role?: BaristaRole; phone?: string }, { ok: true }>('updateBarista'),

  // Sınav
  startExam: call<{ moduleId: string }, { attemptId: string; passScore: number; questions: ExamQuestion[] }>('startExam'),
  submitExam: call<{ attemptId: string; answers: Record<string, number> }, {
    score: number; correct: number; total: number; passed: boolean; passScore: number; mistakes: AttemptReviewItem[];
  }>('submitExam')
};

/** Firebase hata nesnesinden kullanıcıya gösterilecek mesaj. */
export function errorText(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === 'functions/unavailable' || err?.code === 'unavailable' || err?.message?.includes('network')) {
    return 'İnternet bağlantısı yok. Bağlantıyı kontrol edip tekrar dene.';
  }
  if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found') {
    return 'E-posta veya şifre hatalı.';
  }
  if (err?.code === 'auth/too-many-requests') return 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.';
  // SDK bazı sürümlerde mesajın sonuna HTTP durum kodunu ekliyor: "... [403]"
  return (err?.message || 'Beklenmeyen bir hata oluştu.').replace(/\s*\[\d{3}\]$/, '');
}
