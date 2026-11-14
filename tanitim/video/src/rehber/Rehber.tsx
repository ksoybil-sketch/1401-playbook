import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { Phone, SCREEN_H, type Meta } from '../Phone';
import type { Beat } from '../script';
import meta from '../../public/rehber/rehber.json';
import sesler from '../../public/rehber-ses/sesler.json';
import { bolumSesi, BARISTA, MUDUR, type Adim, type Rehber as RehberT } from './senaryo';

const M = meta as unknown as Meta;
const SES = sesler as unknown as Record<string, { file: string; sec: number }>;
const BG = '#100E0D';
const INK = '#F2EDE7';
const DIM = '#A9A19A';
const LINE = '#2A2522';
const FONT = 'Inter, -apple-system, sans-serif';
export const FPS = 30;

/* ------------------------------------------------------------------ */
/* Zamanlama: her parça seslendirmesi kadar sürer                       */
/* ------------------------------------------------------------------ */

const ses = (text: string) => {
  const s = SES[text];
  if (!s) throw new Error(`Seslendirme yok, önce: node capture/ses.mjs\n"${text}"`);
  return s;
};
const ONCE = 8;                       // ses başlamadan önceki kare
const frames = (sec: number, pad: number, min: number) => Math.max(min, Math.ceil((sec + pad) * FPS) + ONCE);

type Parca =
  | { tur: 'giris'; from: number; dur: number; file: string }
  | { tur: 'kapanis'; from: number; dur: number; file: string }
  | { tur: 'kart'; from: number; dur: number; file: string; bolum: number }
  | { tur: 'adim'; from: number; dur: number; file: string; bolum: number; adim: number; beat: Beat; ilkEkran: boolean };

/** Kaydırma hedefi: öğe ekranın üçte birine gelecek şekilde. */
function hedef(a: Adim): number | null {
  if (a.kaydir === undefined) return null;
  if (typeof a.kaydir === 'number') return a.kaydir;
  const b = M[a.ekran]?.boxes[a.kaydir];
  return b ? Math.max(0, b.y - 220) : null;
}

export function zamanla(r: RehberT): { parcalar: Parca[]; toplam: number } {
  const p: Parca[] = [];
  let at = 0;
  const g = ses(r.giris.metin);
  p.push({ tur: 'giris', from: at, dur: frames(g.sec, 1.4, 150), file: g.file });
  at += p[p.length - 1].dur;
  r.bolumler.forEach((b, bi) => {
    const k = ses(bolumSesi(bi, b));
    p.push({ tur: 'kart', from: at, dur: frames(k.sec, 0.9, 72), file: k.file, bolum: bi });
    at += p[p.length - 1].dur;
    let onceki: { ekran: string; scroll: number } | null = null;
    b.adimlar.forEach((a, ai) => {
      const s = ses(a.ses || a.metin);
      const dur = frames(s.sec, 0.8, 75);
      const ayni = onceki?.ekran === a.ekran;
      const bas = ayni ? onceki!.scroll : 0;
      const son = hedef(a) ?? bas;
      const beat: Beat = {
        screen: a.ekran, dur, caption: '',
        scroll: [bas, son], focus: a.odak, zoom: a.yakin, tap: a.dokun,
        mark: a.isaret?.map((x) => ({ box: x.kutu, label: x.etiket }))
      };
      p.push({ tur: 'adim', from: at, dur, file: s.file, bolum: bi, adim: ai, beat, ilkEkran: !ayni });
      onceki = { ekran: a.ekran, scroll: son };
      at += dur;
    });
  });
  const c = ses(r.kapanis.metin);
  p.push({ tur: 'kapanis', from: at, dur: frames(c.sec, 2.2, 180), file: c.file });
  at += p[p.length - 1].dur;
  return { parcalar: p, toplam: at };
}

/* ------------------------------------------------------------------ */
/* Parçalar                                                             */
/* ------------------------------------------------------------------ */

const Logo: React.FC<{ size: number; color?: string }> = ({ size, color = INK }) => (
  <div style={{
    width: size * 0.785, height: size, background: color,
    WebkitMaskImage: `url(${staticFile('logo.svg')})`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
    maskImage: `url(${staticFile('logo.svg')})`, maskSize: 'contain', maskRepeat: 'no-repeat'
  }} />
);

const useIn = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 120 } });
};

const Giris: React.FC<{ r: RehberT; dur: number }> = ({ r, dur }) => {
  const frame = useCurrentFrame();
  const a = useIn(0), b = useIn(8), c = useIn(16);
  const out = interpolate(frame, [dur - 10, dur], [1, 0], { extrapolateLeft: 'clamp' });
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, padding: '0 96px', justifyContent: 'center', opacity: out }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}><Logo size={150} /></div>
      <div style={{ height: 60 }} />
      <div style={{ opacity: b, transform: `translateY(${(1 - b) * 30}px)`, fontSize: 104, fontWeight: 800, color: INK, letterSpacing: -3.5, lineHeight: 1.04, whiteSpace: 'pre-line' }}>{r.giris.baslik}</div>
      <div style={{ height: 36 }} />
      <div style={{ opacity: c, display: 'flex', alignItems: 'center', gap: 18 }}>
        <span style={{ width: 16, height: 16, borderRadius: 5, background: r.renk }} />
        <span style={{ fontSize: 44, fontWeight: 600, color: r.renk }}>{r.giris.alt}</span>
      </div>
      <Altyazi text={r.giris.metin} renk={r.renk} top={1560} />
    </AbsoluteFill>
  );
};

const Kart: React.FC<{ r: RehberT; bolum: number; dur: number }> = ({ r, bolum, dur }) => {
  const frame = useCurrentFrame();
  const a = useIn(0), b = useIn(6);
  const out = interpolate(frame, [dur - 8, dur], [1, 0], { extrapolateLeft: 'clamp' });
  const bl = r.bolumler[bolum];
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, padding: '0 96px', justifyContent: 'center', opacity: out }}>
      <div style={{ fontSize: 34, fontWeight: 700, color: DIM, letterSpacing: 2, textTransform: 'uppercase', opacity: a }}>
        Bölüm {bolum + 1} / {r.bolumler.length}
      </div>
      <div style={{ height: 20 }} />
      <div style={{ fontSize: 220, fontWeight: 800, color: r.renk, lineHeight: 0.95, letterSpacing: -8, opacity: a, transform: `translateY(${(1 - a) * 40}px)` }}>
        {String(bolum + 1).padStart(2, '0')}
      </div>
      <div style={{ height: 30 }} />
      <div style={{ fontSize: 92, fontWeight: 800, color: INK, lineHeight: 1.05, letterSpacing: -3, opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>{bl.baslik}</div>
      <div style={{ height: 40 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: b }}>
        {bl.adimlar.length > 0 && <div style={{ fontSize: 32, color: DIM }}>{bl.adimlar.length} adım</div>}
      </div>
    </AbsoluteFill>
  );
};

const Kapanis: React.FC<{ r: RehberT }> = ({ r }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, padding: '220px 96px' }}>
      <div style={{ fontSize: 110, fontWeight: 800, color: INK, letterSpacing: -3.5, opacity: useIn(0) }}>{r.kapanis.baslik}</div>
      <div style={{ height: 60 }} />
      {r.kapanis.maddeler.map((m, i) => {
        const p = spring({ frame: frame - 12 - i * 18, fps, config: { damping: 200 } });
        return (
          <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 30, padding: '34px 0', borderTop: `2px solid ${LINE}`, opacity: p, transform: `translateX(${(1 - p) * 50}px)` }}>
            <span style={{ width: 64, height: 64, borderRadius: 18, background: r.renk, color: '#140F0B', fontSize: 34, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <span style={{ fontSize: 50, fontWeight: 700, color: INK, letterSpacing: -1 }}>{m}</span>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 96, bottom: 130, display: 'flex', alignItems: 'center', gap: 22, opacity: useIn(70) }}>
        <Logo size={70} />
        <div style={{ fontSize: 40, fontWeight: 700, color: INK }}>1401 Campus</div>
      </div>
    </AbsoluteFill>
  );
};

/** Seslendirmenin yazısı. Ses başlarken belirir. */
const Altyazi: React.FC<{ text: string; renk: string; top: number }> = ({ text, renk, top }) => {
  const p = useIn(ONCE - 4);
  return (
    <div style={{ position: 'absolute', left: 56, right: 56, top, display: 'flex', justifyContent: 'center', opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
      <div style={{
        background: 'rgba(24,20,18,0.96)', borderLeft: `8px solid ${renk}`, color: INK, fontSize: 40, fontWeight: 600,
        padding: '24px 34px', borderRadius: 20, lineHeight: 1.32, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', width: '100%'
      }}>{text}</div>
    </div>
  );
};

const PHONE_TOP = 236;

/** Bir adım: üstte bölüm, ortada telefon, altta altyazı. */
const AdimView: React.FC<{ r: RehberT; p: Extract<Parca, { tur: 'adim' }> }> = ({ r, p }) => {
  const frame = useCurrentFrame();
  const a = r.bolumler[p.bolum].adimlar[p.adim];
  const fade = p.ilkEkran ? interpolate(frame, [0, 9], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }) : 1;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: '50%', top: PHONE_TOP, transform: `translateX(-50%) scale(${interpolate(fade, [0, 1], [0.97, 1])})`, opacity: fade }}>
        <Phone beat={p.beat} hue={r.renk} metaMap={M} />
      </div>
      <Altyazi text={a.metin} renk={r.renk} top={PHONE_TOP + SCREEN_H + 28 + 22} />
    </AbsoluteFill>
  );
};

/** Üst şerit: rehber adı, bölüm adı ve adım noktaları. */
const Ust: React.FC<{ r: RehberT; bolum: number; adim: number; ilerleme: number }> = ({ r, bolum, adim, ilerleme }) => {
  const bl = r.bolumler[bolum];
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: 0, height: 8, width: `${ilerleme * 100}%`, background: r.renk }} />
      <div style={{ position: 'absolute', left: 64, right: 64, top: 50, display: 'flex', alignItems: 'center', gap: 18, fontFamily: FONT }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: '#140F0B', background: r.renk, padding: '5px 14px', borderRadius: 10 }}>{String(bolum + 1).padStart(2, '0')}</span>
        <span style={{ fontSize: 44, fontWeight: 800, color: INK, letterSpacing: -1.2, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bl.baslik}</span>
      </div>
      <div style={{ position: 'absolute', left: 64, top: 128, display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT }}>
        {bl.adimlar.map((_, i) => (
          <span key={i} style={{ width: i === adim ? 40 : 14, height: 14, borderRadius: 7, background: i <= adim ? r.renk : LINE, opacity: i < adim ? 0.55 : 1 }} />
        ))}
        <span style={{ marginLeft: 12, fontSize: 28, color: DIM }}>Adım {adim + 1} / {bl.adimlar.length}</span>
      </div>
      <div style={{ position: 'absolute', right: 64, top: 128, fontSize: 28, color: DIM, fontFamily: FONT }}>{r.ad}</div>
    </>
  );
};

export const Rehber: React.FC<{ kim: 'barista' | 'mudur' }> = ({ kim }) => {
  const r = kim === 'barista' ? BARISTA : MUDUR;
  const frame = useCurrentFrame();
  const { parcalar, toplam } = zamanla(r);
  const simdi = parcalar.find((p) => frame >= p.from && frame < p.from + p.dur);
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      {parcalar.map((p, i) => (
        <Sequence key={i} from={p.from} durationInFrames={p.dur}>
          {p.tur === 'giris' && <Giris r={r} dur={p.dur} />}
          {p.tur === 'kart' && <Kart r={r} bolum={p.bolum} dur={p.dur} />}
          {p.tur === 'kapanis' && <Kapanis r={r} />}
          {p.tur === 'adim' && <AdimView r={r} p={p} />}
          <Sequence from={ONCE} layout="none"><Audio src={staticFile(p.file)} /></Sequence>
        </Sequence>
      ))}
      {simdi?.tur === 'adim' && <Ust r={r} bolum={simdi.bolum} adim={simdi.adim} ilerleme={frame / toplam} />}
    </AbsoluteFill>
  );
};

export const sure = (r: RehberT) => zamanla(r).toplam;
