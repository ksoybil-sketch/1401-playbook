import { create } from 'zustand';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../api/firebase';
import type { BadgeConfig } from '../lib/badges';

/**
 * config/badges — rozet ve başarım ayarları. Tüm oturumlar okur (barista
 * kendi ilerlemesini aynı kurallarla görsün), yalnızca Kahve Operasyon
 * Müdürü yazar. Belge yoksa lib/badges.ts'deki varsayılanlar geçerli.
 */
export const useBadgeConfig = create<{ config: BadgeConfig | null; subscribe: () => () => void }>((set) => ({
  config: null,
  subscribe: () => onSnapshot(doc(db, 'config', 'badges'),
    (s) => set({ config: s.exists() ? (s.data() as BadgeConfig) : null }),
    () => set({ config: null }))
}));

export async function saveBadgeConfig(config: BadgeConfig, byName: string): Promise<void> {
  // Firestore undefined kabul etmez.
  const clean = JSON.parse(JSON.stringify(config));
  await setDoc(doc(db, 'config', 'badges'), { ...clean, updatedAt: Date.now(), updatedByName: byName });
}
