import { create } from 'zustand';

/**
 * Uygulama geliştiricisinin "Kurul ekranı" görünümü: panelden geçince
 * Yönetim Kurulu'nun gördüğü ekranlar açılır (App.tsx). Yalnızca bu sekmede
 * hatırlanır; sayfa yenilense de görünüm korunur, yeni sekme panelle açılır.
 * Kurul adına soru sorulamaz (kurallar yalnızca kurula izin verir).
 */
const KEY = 'kurul-gorunumu';
const read = (): boolean => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

export const useBoardView = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({
  on: read(),
  set: (on) => {
    try { if (on) sessionStorage.setItem(KEY, '1'); else sessionStorage.removeItem(KEY); } catch { /* özel pencere */ }
    set({ on });
  }
}));
