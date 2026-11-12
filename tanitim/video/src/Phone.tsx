import React from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import meta from '../public/ekranlar/meta.json';
import type { Beat } from './script';

type Box = { x: number; y: number; w: number; h: number };
type Meta = Record<string, { file: string; fullPage: boolean; size: { w: number; h: number }; boxes: Record<string, Box>; vp?: string; chrome?: { top: number; bottom: number } }>;
const M = meta as unknown as Meta;

/** Ekran CSS genişliği (390) → videodaki telefon ekranı. */
export const SCREEN_W = 590;
export const SCREEN_H = Math.round(SCREEN_W * 844 / 390);
const K = SCREEN_W / 390;

/**
 * Gerçek uygulama ekranı, telefon çerçevesi içinde. Kaydırma, yakınlaşma,
 * işaretleme ve dokunma hepsi meta.json'daki gerçek konumlardan.
 */
export const Phone: React.FC<{ beat: Beat; hue: string }> = ({ beat, hue }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = M[beat.screen];
  if (!m) throw new Error(`Ekran yok: ${beat.screen}`);
  const ease = Easing.bezier(0.33, 0, 0.15, 1);

  // Kaydırma (tam sayfa ekranlarda).
  const maxScroll = Math.max(0, m.size.h - 844);
  const [s0, s1] = beat.scroll || [0, 0];
  const scroll = Math.min(maxScroll, interpolate(frame, [10, beat.dur - 12], [s0, s1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease }));

  // Yakınlaşma: öğenin ortası ekranın ortasına gelir.
  const box = beat.focus ? m.boxes[beat.focus] : undefined;
  // Odak yoksa çok hafif kamera kayması: ekran durağan bir resim gibi durmasın.
  const z = box ? interpolate(spring({ frame: frame - 8, fps, config: { damping: 200, mass: 0.9 } }), [0, 1], [1, beat.zoom || 1.3])
    : interpolate(frame, [0, beat.dur], [1, 1.03], { extrapolateRight: 'clamp' });
  const cx = box ? box.x + box.w / 2 : 195;
  const cy = box ? box.y + box.h / 2 - scroll : 422;
  // Ekran kenarından taşmasın diye merkez sınırlanır.
  const ox = Math.min(390 - 195 / z, Math.max(195 / z, cx));
  const oy = Math.min(844 - 422 / z, Math.max(422 / z, cy));
  const tx = interpolate(z, [1, beat.zoom || 1.3], [0, (195 - ox) * K], { extrapolateRight: 'clamp' }) * (box ? 1 : 0);
  const ty = interpolate(z, [1, beat.zoom || 1.3], [0, (422 - oy) * K], { extrapolateRight: 'clamp' }) * (box ? 1 : 0);

  const toScreen = (b: Box) => ({ left: b.x * K, top: (b.y - scroll) * K, width: b.w * K, height: b.h * K });

  return (
    <div style={{
      width: SCREEN_W + 28, height: SCREEN_H + 28, borderRadius: 74, padding: 14, background: '#0A0908',
      boxShadow: '0 0 0 2px #2A2522, 0 40px 120px rgba(0,0,0,0.55)', position: 'relative'
    }}>
      <div style={{ width: SCREEN_W, height: SCREEN_H, borderRadius: 60, overflow: 'hidden', position: 'relative', background: '#100E0D' }}>
        <div style={{ position: 'absolute', inset: 0, transform: `translate(${tx}px, ${ty}px) scale(${z})`, transformOrigin: '50% 50%' }}>
          <Img src={staticFile(m.file)} style={{ position: 'absolute', left: 0, top: -scroll * K, width: SCREEN_W, height: m.size.h * K }} />
          {/* Sabit üst bar ve alt menü kaydırılmaz: telefon görünümünden kesilip yerinde tutulur. */}
          {m.vp && m.chrome && m.chrome.top > 0 && (
            <div style={{ position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: m.chrome.top * K, overflow: 'hidden' }}>
              <Img src={staticFile(m.vp)} style={{ width: SCREEN_W, height: SCREEN_H }} />
            </div>
          )}
          {m.vp && m.chrome && m.chrome.bottom > 0 && (
            <div style={{ position: 'absolute', left: 0, bottom: 0, width: SCREEN_W, height: m.chrome.bottom * K, overflow: 'hidden' }}>
              <Img src={staticFile(m.vp)} style={{ position: 'absolute', left: 0, bottom: 0, width: SCREEN_W, height: SCREEN_H }} />
            </div>
          )}
          {(beat.mark || []).map((mk, i, arr) => {
            const b = m.boxes[mk.box];
            if (!b) return null;
            // İkiden fazla işaret: sırayla, biri gidince öbürü gelir (üst üste binmesin).
            const seq = arr.length > 2;
            const slot = (beat.dur - 16) / arr.length;
            const start = seq ? 10 + i * slot : 12 + i * 14;
            const pin = spring({ frame: frame - start, fps, config: { damping: 18, stiffness: 160 } });
            const pout = seq && i < arr.length - 1 ? spring({ frame: frame - start - slot + 4, fps, config: { damping: 200 } }) : 0;
            const p = Math.max(0, pin - pout);
            const r = toScreen(b);
            return (
              <React.Fragment key={mk.box}>
                <div style={{
                  position: 'absolute', left: r.left - 8, top: r.top - 8, width: r.width + 16, height: r.height + 16,
                  border: `5px solid ${hue}`, borderRadius: 22, opacity: p, transform: `scale(${interpolate(p, [0, 1], [1.08, 1])})`
                }} />
                <div style={{
                  position: 'absolute', left: Math.max(6, Math.min(r.left, SCREEN_W - 360)), top: r.top > 70 ? r.top - 58 : r.top + r.height + 14, opacity: p,
                  background: hue, color: '#140F0B', fontWeight: 700, fontSize: 30, padding: '6px 16px', borderRadius: 12,
                  transform: `translateY(${interpolate(p, [0, 1], [10, 0])}px)`, whiteSpace: 'nowrap'
                }}>{mk.label}</div>
              </React.Fragment>
            );
          })}
          {beat.tap && m.boxes[beat.tap] && <Tap r={toScreen(m.boxes[beat.tap])} at={beat.dur - 26} hue={hue} />}
        </div>
      </div>
    </div>
  );
};

/** Parmak dokunuşu: koyulaşan nokta + yayılan halka. */
const Tap: React.FC<{ r: { left: number; top: number; width: number; height: number }; at: number; hue: string }> = ({ r, at, hue }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -10) return null;
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const press = interpolate(t, [-10, 0, 6, 14], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ring = interpolate(t, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <div style={{ position: 'absolute', left: x - 36, top: y - 36, width: 72, height: 72, borderRadius: 999, background: 'rgba(255,255,255,0.85)', opacity: press * 0.85, transform: `scale(${interpolate(press, [0, 1], [1.4, 1])})` }} />
      <div style={{ position: 'absolute', left: x - 36, top: y - 36, width: 72, height: 72, borderRadius: 999, border: `5px solid ${hue}`, opacity: 1 - ring, transform: `scale(${1 + ring * 1.8})` }} />
    </>
  );
};
