import React from 'react';
import { Composition, continueRender, delayRender, staticFile } from 'remotion';
import { Tanitim } from './Video';
import { Yonetim } from './Yonetim';
import { D_TOTAL } from './senaryo-yonetim';
import { FPS, TOTAL } from './script';
import { Rehber, sure } from './rehber/Rehber';
import { BARISTA, MUDUR } from './rehber/senaryo';
import { Kurul, kurulZaman } from './kurul/Kurul';

// Türkçe büyük harf: text-transform uppercase "i"yi "İ" yapsın (IÇIN değil İÇİN).
document.documentElement.lang = 'tr';

// Uygulamanın kendi yazı tipi (Inter, gömülü) — video da aynı harflerle konuşsun.
const handle = delayRender('Inter yükleniyor');
Promise.all([
  new FontFace('Inter', `url(${staticFile('fonts/inter-latin.woff2')}) format('woff2')`, { weight: '100 900', unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }).load(),
  new FontFace('Inter', `url(${staticFile('fonts/inter-latin-ext.woff2')}) format('woff2')`, { weight: '100 900', unicodeRange: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+2C60-2C7F, U+A720-A7FF' }).load()
]).then((faces) => { faces.forEach((f) => document.fonts.add(f)); continueRender(handle); });

export const Root: React.FC = () => (
  // 0,75 hız: ilk sürüm 1x'ti; izleyince 0,75x daha rahat okunuyordu.
  <>
    <Composition id="Tanitim" component={Tanitim} durationInFrames={Math.round(TOTAL / 0.75)} fps={FPS} width={1080} height={1920} defaultProps={{ speed: 0.75 }} />
    {/* Uğur Bey ve Cenk Bey için: masaüstü ekranları, yatay. */}
    <Composition id="Yonetim" component={Yonetim} durationInFrames={Math.round(D_TOTAL / 0.75)} fps={FPS} width={1920} height={1080} defaultProps={{ speed: 0.75 }} />
    {/* Kullanım rehberleri: seslendirmeli, dikey (telefonda izlenir). */}
    <Composition id="RehberBarista" component={Rehber} durationInFrames={sure(BARISTA)} fps={FPS} width={1080} height={1920} defaultProps={{ kim: 'barista' as const }} />
    <Composition id="RehberMudur" component={Rehber} durationInFrames={sure(MUDUR)} fps={FPS} width={1080} height={1920} defaultProps={{ kim: 'mudur' as const }} />
    {/* Yönetim kurulu: neden, neyi çözer, ne kazandırır (yatay, seslendirmeli). */}
    <Composition id="Kurul" component={Kurul} durationInFrames={kurulZaman().toplam} fps={FPS} width={1920} height={1080} />
  </>
);
