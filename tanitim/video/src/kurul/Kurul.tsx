import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { Phone, type Meta } from '../Phone';
import rehberMeta from '../../public/rehber/rehber.json';
import sesler from '../../public/rehber-ses/sesler.json';
import { KURUL, type Sahne } from './senaryo';

const M = rehberMeta as unknown as Meta;
const SES = sesler as unknown as Record<string, { file: string; sec: number }>;
const BG = '#100E0D';
const INK = '#F2EDE7';
const DIM = '#A9A19A';
const LINE = '#2A2522';
const AMBER = '#D9A066';
const FONT = 'Inter, -apple-system, sans-serif';
const FPS = 30;
const ONCE = 10;

function ses(s: Sahne) {
  const x = SES[s.ses || s.metin];
  if (!x) throw new Error('Seslendirme yok, önce: node capture/ses.mjs');
  return x;
}

export function kurulZaman() {
  let at = 0;
  const out = KURUL.map((s, i) => {
    const x = ses(s);
    const son = i === KURUL.length - 1;
    const dur = ONCE + Math.ceil((x.sec + (son ? 3 : 0.7)) * FPS);
    const r = { from: at, dur, file: x.file };
    at += dur;
    return r;
  });
  return { sahneler: out, toplam: at };
}

const useIn = (delay = 0, stiffness = 120) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200, stiffness } });
};

const Logo: React.FC<{ size: number }> = ({ size }) => (
  <div style={{
    width: size * 0.785, height: size, background: INK,
    WebkitMaskImage: `url(${staticFile('logo.svg')})`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
    maskImage: `url(${staticFile('logo.svg')})`, maskSize: 'contain', maskRepeat: 'no-repeat'
  }} />
);

/* ------------------------------------------------------------------ */

const Altyazi: React.FC<{ text: string }> = ({ text }) => {
  const p = useIn(ONCE - 4);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, display: 'flex', justifyContent: 'center', opacity: p * 0.96 }}>
      <div style={{ maxWidth: 1480, background: 'rgba(16,14,13,0.82)', color: '#D9D2CA', fontSize: 29, lineHeight: 1.38, padding: '12px 26px', borderRadius: 12, textAlign: 'center' }}>{text}</div>
    </div>
  );
};

const Sol: React.FC<{ s: Sahne }> = ({ s }) => {
  const a = useIn(0), b = useIn(6), c = useIn(16);
  return (
    <div style={{ position: 'absolute', left: 130, top: 0, bottom: 120, width: 640, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {s.ust && <div style={{ fontSize: 28, fontWeight: 700, color: AMBER, letterSpacing: 3, textTransform: 'uppercase', opacity: a }}>{s.ust}</div>}
      <div style={{ height: 22 }} />
      {s.baslik && (
        <div style={{ fontSize: 80, fontWeight: 800, color: INK, letterSpacing: -2.8, lineHeight: 1.04, whiteSpace: 'pre-line', opacity: b, transform: `translateY(${(1 - b) * 26}px)` }}>{s.baslik}</div>
      )}
      {s.rakamlar && (
        <div style={{ display: 'flex', gap: 54, marginTop: 56, opacity: c, transform: `translateY(${(1 - c) * 18}px)` }}>
          {s.rakamlar.map(([n, l]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 76, fontWeight: 800, color: AMBER, letterSpacing: -2.5, lineHeight: 1 }}>{n}</span>
              <span style={{ fontSize: 28, color: DIM }}>{l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PHONE_SCALE = 0.6;
const Telefon: React.FC<{ ekran: string; dur: number; kaydir?: [number, number] }> = ({ ekran, dur, kaydir }) => {
  const p = useIn(4, 90);
  return (
    <div style={{ position: 'absolute', left: 1360, top: 70, transformOrigin: 'top center', transform: `translateX(-50%) scale(${PHONE_SCALE}) translateY(${(1 - p) * 120}px)`, opacity: p }}>
      <Phone beat={{ screen: ekran, dur, caption: '', scroll: kaydir }} hue={AMBER} metaMap={M} />
    </div>
  );
};

const Masaustu: React.FC<{ ekran: string; dur: number; yakin?: number; merkez?: string }> = ({ ekran, dur, yakin = 1.06, merkez = '30% 20%' }) => {
  const frame = useCurrentFrame();
  const p = useIn(4, 90);
  const z = interpolate(frame, [0, dur], [1, yakin], { easing: Easing.inOut(Easing.quad) });
  const W = 1040, H = Math.round(W * 900 / 1440);
  return (
    <div style={{
      position: 'absolute', left: 790, top: 470 - H / 2 - 40, width: W, height: H, borderRadius: 18, overflow: 'hidden',
      boxShadow: `0 0 0 2px ${LINE}, 0 40px 120px rgba(0,0,0,0.6)`, opacity: p, transform: `translateX(${(1 - p) * 80}px)`
    }}>
      <Img src={staticFile(`ekranlar/${ekran}.png`)} style={{ width: W, height: H, transform: `scale(${z})`, transformOrigin: merkez }} />
    </div>
  );
};

const Sorular: React.FC<{ maddeler: string[]; dur: number }> = ({ maddeler, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ padding: '0 160px', justifyContent: 'center', paddingBottom: 110 }}>
      <div style={{ fontSize: 30, fontWeight: 700, color: AMBER, letterSpacing: 3, textTransform: 'uppercase', opacity: useIn(0) }}>Her şubede aynı kalite için</div>
      <div style={{ height: 40 }} />
      {maddeler.map((m, i) => {
        // Seslendirmede soruların okunduğu ana denk gelecek şekilde sırayla.
        const at = Math.round(ONCE + dur * (0.2 + i * 0.185));
        const q = spring({ frame: frame - at, fps, config: { damping: 200 } });
        return (
          <div key={m} style={{ display: 'flex', alignItems: 'baseline', gap: 34, padding: '22px 0', borderTop: `2px solid ${LINE}`, opacity: q, transform: `translateX(${(1 - q) * 40}px)` }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: AMBER, width: 40 }}>{i + 1}</span>
            <span style={{ fontSize: 54, fontWeight: 700, color: INK, letterSpacing: -1.4 }}>{m}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Donusum: React.FC<{ once: string; sonra: string; dur: number }> = ({ once, sonra, dur }) => {
  const frame = useCurrentFrame();
  const a = useIn(0);
  const at = Math.round(dur * 0.52);
  const b = useIn(at);
  const strike = interpolate(frame, [at - 14, at], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 110, gap: 50 }}>
      <div style={{ position: 'relative', fontSize: 78, fontWeight: 700, color: interpolate(strike, [0, 1], [0, 1]) > 0.5 ? '#6E6660' : DIM, opacity: a, letterSpacing: -2 }}>
        {once}
        <div style={{ position: 'absolute', left: 0, top: '54%', height: 6, width: `${strike * 100}%`, background: '#6E6660', borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 60, color: AMBER, opacity: b }}>↓</div>
      <div style={{ fontSize: 96, fontWeight: 800, color: INK, opacity: b, transform: `translateY(${(1 - b) * 24}px)`, letterSpacing: -3 }}>{sonra}</div>
    </AbsoluteFill>
  );
};

const Cihazlar: React.FC = () => {
  const p = useIn(10, 90);
  const box = (w: number, h: number, r: number) => ({ width: w, height: h, borderRadius: r, border: `5px solid ${INK}`, opacity: 0.9 });
  return (
    <div style={{ position: 'absolute', left: 900, top: 270, display: 'flex', alignItems: 'flex-end', gap: 60, opacity: p, transform: `translateY(${(1 - p) * 40}px)` }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div style={box(150, 300, 30)} /><span style={{ fontSize: 28, color: DIM }}>Telefon</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div style={box(260, 350, 26)} /><span style={{ fontSize: 28, color: DIM }}>Tablet</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={box(400, 260, 16)} />
          <div style={{ width: 470, height: 16, borderRadius: 8, background: INK, opacity: 0.9, marginTop: 6 }} />
        </div>
        <span style={{ fontSize: 28, color: DIM }}>Bilgisayar</span>
      </div>
    </div>
  );
};

const Kapanis: React.FC<{ hazir: string[]; adim: string[] }> = ({ hazir, adim }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sag = useIn(Math.round(5.2 * FPS));
  return (
    <AbsoluteFill style={{ padding: '0 160px', paddingBottom: 120, flexDirection: 'row', alignItems: 'center', gap: 140 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 96, fontWeight: 800, color: INK, letterSpacing: -3, opacity: useIn(0) }}>Hazır.</div>
        <div style={{ height: 36 }} />
        {hazir.map((h, i) => {
          const q = spring({ frame: frame - 14 - i * 22, fps, config: { damping: 200 } });
          return (
            <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '18px 0', opacity: q, transform: `translateX(${(1 - q) * 30}px)` }}>
              <span style={{ width: 46, height: 46, borderRadius: 12, background: '#2B3A2F', color: '#8FD1A3', fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
              <span style={{ fontSize: 46, fontWeight: 700, color: INK, letterSpacing: -1 }}>{h}</span>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, opacity: sag, transform: `translateY(${(1 - sag) * 24}px)` }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: AMBER, letterSpacing: 3, textTransform: 'uppercase' }}>Önerilen adım</div>
        <div style={{ height: 30 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          {adim.map((a, i) => (
            <React.Fragment key={a}>
              {i > 0 && <span style={{ fontSize: 40, color: AMBER, marginLeft: 30, lineHeight: 1 }}>↓</span>}
              <span style={{ fontSize: 46, fontWeight: 800, color: INK, border: `3px solid ${i === 0 ? AMBER : LINE}`, borderRadius: 20, padding: '18px 28px', letterSpacing: -1, whiteSpace: 'nowrap' }}>{a}</span>
            </React.Fragment>
          ))}
          <span style={{ fontSize: 28, color: DIM, marginTop: 14 }}>Geri bildirim geldikçe yeniden</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 160, top: 70, display: 'flex', alignItems: 'center', gap: 18, opacity: useIn(30) }}>
        <Logo size={56} />
        <span style={{ fontSize: 34, fontWeight: 700, color: INK }}>1401 Campus</span>
      </div>
    </AbsoluteFill>
  );
};

const Acilis: React.FC = () => {
  const a = useIn(0, 100), b = useIn(10), c = useIn(20);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 110 }}>
      <div style={{ opacity: a, transform: `scale(${interpolate(a, [0, 1], [0.8, 1])})` }}><Logo size={170} /></div>
      <div style={{ height: 44 }} />
      <div style={{ fontSize: 140, fontWeight: 800, color: INK, letterSpacing: -5, opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>1401 Campus</div>
      <div style={{ height: 18 }} />
      <div style={{ fontSize: 40, color: DIM, opacity: c }}>Eğitim · Reçete · Operasyon</div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */

const SahneView: React.FC<{ s: Sahne; dur: number }> = ({ s, dur }) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [dur - 9, dur], [1, 0], { extrapolateLeft: 'clamp' });
  const inn = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const g = s.gorsel;
  return (
    <AbsoluteFill style={{ opacity: Math.min(out, inn) }}>
      {g.tur === 'logo' && <Acilis />}
      {g.tur === 'sorular' && <Sorular maddeler={g.maddeler} dur={dur} />}
      {g.tur === 'donusum' && <Donusum once={g.once} sonra={g.sonra} dur={dur} />}
      {(g.tur === 'telefon' || g.tur === 'masaustu' || g.tur === 'cihazlar') && <Sol s={s} />}
      {g.tur === 'telefon' && <Telefon ekran={g.ekran} dur={dur} kaydir={g.kaydir} />}
      {g.tur === 'masaustu' && <Masaustu ekran={g.ekran} dur={dur} yakin={g.yakin} merkez={g.merkez} />}
      {g.tur === 'cihazlar' && <Cihazlar />}
      {g.tur === 'kapanis' && <Kapanis hazir={g.hazir} adim={g.adim} />}
      <Altyazi text={s.metin} />
    </AbsoluteFill>
  );
};

export const Kurul: React.FC = () => {
  const frame = useCurrentFrame();
  const { sahneler, toplam } = kurulZaman();
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      {KURUL.map((s, i) => (
        <Sequence key={i} from={sahneler[i].from} durationInFrames={sahneler[i].dur}>
          <SahneView s={s} dur={sahneler[i].dur} />
          <Sequence from={ONCE} layout="none"><Audio src={staticFile(sahneler[i].file)} /></Sequence>
        </Sequence>
      ))}
      <div style={{ position: 'absolute', left: 0, top: 0, height: 6, width: `${(frame / toplam) * 100}%`, background: AMBER, opacity: 0.85 }} />
    </AbsoluteFill>
  );
};
