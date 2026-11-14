import { useEffect, useRef } from 'react';
import { useBackHandler } from './backButton';

/**
 * Kaydedilmemiş değişiklik koruması.
 *
 * Ders editöründe ya da Yeni ürün formunda uzun bir düzenleme, geri okuna,
 * Android geri tuşuna ya da menüye dokununca uyarısız gidiyordu. Bir ekran
 * useUnsavedGuard(dirty) ile kaydolur; ayrılmadan önce confirmLeave() sorar:
 *  - sekme/pencere kapanırken tarayıcının kendi uyarısı (beforeunload);
 *  - Android geri tuşu;
 *  - PageTitle'daki geri oku ve panel menüsü (confirmLeave'i çağırırlar).
 * Programla yapılan geçişler (kaydettikten sonra yönlendirme) sorulmaz.
 */
const guards = new Set<{ current: boolean }>();
export const LEAVE_TEXT = 'Kaydedilmemiş değişiklikler var. Çıkarsan silinecek. Çıkılsın mı?';

/** Kaydedilmemiş bir şey varsa sorar; çıkılabilirse true. */
export function confirmLeave(): boolean {
  for (const g of guards) if (g.current) return confirm(LEAVE_TEXT);
  return true;
}

export function useUnsavedGuard(dirty: boolean) {
  const ref = useRef(dirty);
  ref.current = dirty;
  useEffect(() => {
    const entry = ref;
    guards.add(entry);
    const onUnload = (e: BeforeUnloadEvent) => { if (entry.current) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      guards.delete(entry);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);
  // Geri tuşu: vazgeçerse geri tuşu "kullanılmış" sayılır (ekranda kalır).
  useBackHandler(dirty, () => !confirm(LEAVE_TEXT));
}
