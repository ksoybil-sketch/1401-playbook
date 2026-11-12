import { createContext, useContext } from 'react';
import { useCurrentFrame } from 'remotion';

/**
 * Oynatma hızı. Sahneler "taban kare" ile yazılır (30 fps'te 1x);
 * 0.75 hızda her şey 4/3 uzar. Video sonradan yavaşlatılmaz (kare
 * tekrarı takılma yapardı): zaman burada ölçeklenir, her kare yeniden
 * çizilir, hareket akıcı kalır.
 */
export const SpeedCtx = createContext(1);
export const useSpeed = () => useContext(SpeedCtx);
/** Taban zaman cinsinden geçerli kare (ondalıklı olabilir). */
export const useT = () => useCurrentFrame() * useContext(SpeedCtx);
/** Taban kareyi gerçek kareye çevirir. */
export const real = (base: number, speed: number) => Math.round(base / speed);
