import React from 'react';
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useVideoConfig, Easing } from 'remotion';
import meta from '../public/ekranlar/yonetim.json';
import { HUES } from './script';
import { DCHAPTERS, D_INTRO, D_LEAD, D_OUTRO, PEOPLE, dChapterLength, type DBeat, type DChapter } from './senaryo-yonetim';
import { SpeedCtx, real, useSpeed, useT } from './time';

type Box = { x: number; y: number; w: number; h: number };
const M = meta as unknown as Record<string, { file: string; boxes: Record<string, Box> }>;

const BG = '#100E0D';
const INK = '#F2EDE7';
const DIM = '#A9A19A';
const FONT = 'Inter, -apple-system, sans-serif';
const VW = 1920, VH = 1080;
/** Masaüstü ekranı (1440×900) → video: tam genişlik. */
const BW = 1440, BH = 900, S = VW / BW;
/** Üstte kişi ve bölüm şeridi; ekran görüntüsü bunun altında başlar. */
const TOP = 96;
const AREA_H = VH - TOP;

const Logo: React.FC<{ size: number }> = ({ size }) => (
  <div style={{
    width: size * 0.785, height: size, background: INK,
    WebkitMaskImage: `url(${staticFile('logo.svg')})`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat'
  }} />
);

const Rise: React.FC<{ start: number; children: React.ReactNode; dy?: number }> = ({ start, children, dy = 60 }) => {
  const f = useT();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - start, fps, config: { damping: 200, stiffness: 130 } });
  return <div style={{ overflow: 'hidden' }}><div style={{ transform: `translateY(${interpolate(p, [0, 1], [dy, 0])}px)`, opacity: p }}>{children}</div></div>;
};

/**
 * Masaüstü ekranı tam kadrajda. Kamera önce tüm ekranı gösterir, sonra
 * odak öğesine (meta kutusu) yaklaşır. Çerçeve, etiket ve dokunuş gerçek
 * konumlardan.
 */
const DesktopShot: React.FC<{ beat: DBeat; hue: string }> = ({ beat, hue }) => {
  const f = useT();
  const { fps } = useVideoConfig();
  const m = M[beat.screen];
  if (!m) throw new Error(`Ekran yok: ${beat.screen}`);
  const box = beat.focus ? m.boxes[beat.focus] : undefined;
  const zTarget = box ? beat.zoom || 1.5 : 1.04;
  const p = box ? spring({ frame: f - 14, fps, config: { damping: 200, mass: 1.1 } }) : interpolate(f, [0, beat.dur], [0, 1], { extrapolateRight: 'clamp' });
  const z = interpolate(p, [0, 1], [1, zTarget]);
  // Görünen bölge (taban piksel): 1440/z × 810/z, odağın ortasında, ekran içinde.
  const vw = BW / z, vh = (AREA_H / S) / z;
  const cx = box ? box.x + box.w / 2 : BW / 2;
  // Odak biraz yukarıda durur: alttaki alt yazıya yer kalsın.
  const cy = box ? box.y + box.h / 2 + 110 / z : (AREA_H / S) / 2;
  const tx0 = Math.min(BW - vw, Math.max(0, cx - vw / 2));
  const ty0 = Math.min(BH - vh, Math.max(0, cy - vh / 2));
  // Yaklaşırken bölge de yumuşakça kayar.
  const left = interpolate(p, [0, 1], [0, tx0]);
  const top = interpolate(p, [0, 1], [0, ty0]);
  const k = S * z;
  const R = (b: Box) => ({ left: (b.x - left) * k, top: (b.y - top) * k, width: b.w * k, height: b.h * k });

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: BG, top: TOP, height: AREA_H }}>
      <Img src={staticFile(m.file)} style={{ position: 'absolute', left: -left * k, top: -top * k, width: BW * k, height: BH * k }} />
      {(beat.mark || []).map((mk, i, arr) => {
        const b = m.boxes[mk.box];
        if (!b) return null;
        const seq = arr.length > 2;
        const slot = (beat.dur - 20) / arr.length;
        const start = seq ? 16 + i * slot : 20 + i * 12;
        const pin = spring({ frame: f - start, fps, config: { damping: 18, stiffness: 160 } });
        const pout = seq && i < arr.length - 1 ? spring({ frame: f - start - slot + 4, fps, config: { damping: 200 } }) : 0;
        const o = Math.max(0, pin - pout);
        const r = R(b);
        return (
          <React.Fragment key={mk.box}>
            <div style={{ position: 'absolute', left: r.left - 10, top: r.top - 10, width: r.width + 20, height: r.height + 20, border: `5px solid ${hue}`, borderRadius: 16, opacity: o, transform: `scale(${interpolate(o, [0, 1], [1.06, 1])})` }} />
            <div style={{
              position: 'absolute', left: Math.max(20, Math.min(r.left, VW - 520)), top: r.top > 80 ? r.top - 62 : r.top + r.height + 18,
              opacity: o, background: hue, color: '#140F0B', fontWeight: 750, fontSize: 32, padding: '7px 18px', borderRadius: 12, whiteSpace: 'nowrap'
            }}>{mk.label}</div>
          </React.Fragment>
        );
      })}
      {beat.tap && m.boxes[beat.tap] && (() => {
        const r = R(m.boxes[beat.tap]);
        const t = f - (beat.dur - 24);
        if (t < -10) return null;
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const press = interpolate(t, [-10, 0, 6, 14], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const ring = interpolate(t, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <>
            <div style={{ position: 'absolute', left: x - 30, top: y - 30, width: 60, height: 60, borderRadius: 99, background: 'rgba(255,255,255,0.85)', opacity: press * 0.85 }} />
            <div style={{ position: 'absolute', left: x - 30, top: y - 30, width: 60, height: 60, borderRadius: 99, border: `5px solid ${hue}`, opacity: 1 - ring, transform: `scale(${1 + ring * 1.8})` }} />
          </>
        );
      })()}
    </AbsoluteFill>
  );
};

const PersonChip: React.FC<{ who: DChapter['who']; big?: boolean }> = ({ who, big }) => {
  const p = PEOPLE[who];
  const c = HUES[p.hue];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: big ? 20 : 14 }}>
      <div style={{ width: big ? 64 : 44, height: big ? 64 : 44, borderRadius: 99, background: c, color: '#140F0B', fontWeight: 800, fontSize: big ? 26 : 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}
      </div>
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: big ? 36 : 24, fontWeight: 750, color: INK }}>{p.name}</div>
        <div style={{ fontSize: big ? 26 : 18, fontWeight: 600, color: c, letterSpacing: 1, textTransform: 'uppercase' }}>{p.role}</div>
      </div>
    </div>
  );
};

const ChapterView: React.FC<{ c: DChapter; index: number }> = ({ c, index }) => {
  const f = useT();
  const speed = useSpeed();
  const { fps } = useVideoConfig();
  const hue = HUES[c.hue];
  const len = dChapterLength(c);
  let t = f - D_LEAD;
  let bi = 0;
  while (bi < c.beats.length - 1 && t >= c.beats[bi].dur) { t -= c.beats[bi].dur; bi++; }
  const beat = c.beats[bi];
  const beatStart = D_LEAD + c.beats.slice(0, bi).reduce((s, b) => s + b.dur, 0);
  const shotIn = interpolate(f, [D_LEAD - 8, D_LEAD + 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const swap = bi > 0 ? interpolate(f - beatStart, [0, 7], [0.4, 1], { extrapolateRight: 'clamp' }) : 1;
  const capIn = spring({ frame: f - beatStart - 6, fps, config: { damping: 200 } });
  const exit = interpolate(f, [len - 8, len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const leadOut = interpolate(f, [D_LEAD - 10, D_LEAD], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, opacity: 1 - exit }}>
      {f >= D_LEAD - 8 && (
        <AbsoluteFill style={{ opacity: shotIn * swap }}>
          <Sequence from={real(beatStart, speed)} layout="none" key={bi}>
            <DesktopShot beat={beat} hue={hue} />
          </Sequence>
        </AbsoluteFill>
      )}
      {/* Başlık kartı: bölüm başında tam ekran, sonra sol üste küçülür */}
      {f < D_LEAD && (
        <AbsoluteFill style={{ background: BG, padding: '0 150px', justifyContent: 'center', opacity: leadOut }}>
          <Rise start={0}><PersonChip who={c.who} big /></Rise>
          <div style={{ height: 40 }} />
          <Rise start={4} dy={110}>
            <div style={{ fontSize: 120, fontWeight: 850, color: INK, letterSpacing: -4, lineHeight: 1 }}>
              <span style={{ color: hue }}>{String(index + 1).padStart(2, '0')} </span>{c.title}
            </div>
          </Rise>
          <div style={{ height: 26 }} />
          <Rise start={9}><div style={{ fontSize: 36, color: DIM }}><span style={{ color: hue, fontWeight: 700 }}>Nerede:</span> {c.where}</div></Rise>
        </AbsoluteFill>
      )}
      {f >= D_LEAD && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: TOP, background: BG, borderBottom: `3px solid ${hue}`, display: 'flex', alignItems: 'center', gap: 26, padding: '0 40px' }}>
            <PersonChip who={c.who} />
            <div style={{ width: 2, height: 44, background: '#2A2522' }} />
            <div style={{ fontSize: 32, fontWeight: 750, color: INK }}>{c.title}</div>
            <div style={{ marginLeft: 'auto', fontSize: 26, color: DIM }}><span style={{ color: hue, fontWeight: 700 }}>Nerede:</span> {c.where}</div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260, background: 'linear-gradient(to top, rgba(16,14,13,0.95), rgba(16,14,13,0))' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 60, display: 'flex', justifyContent: 'center', opacity: capIn, transform: `translateY(${interpolate(capIn, [0, 1], [26, 0])}px)` }}>
            <div style={{ background: 'rgba(16,14,13,0.96)', border: `3px solid ${hue}`, color: INK, fontSize: 46, fontWeight: 680, padding: '22px 40px', borderRadius: 22, maxWidth: 1500, textAlign: 'center', lineHeight: 1.25 }}>
              {beat.caption}
            </div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

const Intro: React.FC = () => {
  const f = useT();
  const out = interpolate(f, [D_INTRO - 10, D_INTRO], [1, 0], { extrapolateLeft: 'clamp' });
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, padding: '0 150px', justifyContent: 'center', opacity: out }}>
      <Rise start={0}><div style={{ display: 'flex', alignItems: 'center', gap: 26 }}><Logo size={90} /><div style={{ fontSize: 40, fontWeight: 700, color: DIM }}>1401 Campus</div></div></Rise>
      <div style={{ height: 40 }} />
      <Rise start={5} dy={120}><div style={{ fontSize: 132, fontWeight: 850, color: INK, letterSpacing: -5, lineHeight: 1 }}>Kahve Operasyonu</div></Rise>
      <div style={{ height: 30 }} />
      <Rise start={12}><div style={{ fontSize: 50, color: INK, fontWeight: 500 }}>
        <span style={{ color: HUES.sky, fontWeight: 750 }}>Uğur Bey</span> yürütür. <span style={{ color: HUES.amber, fontWeight: 750 }}>Cenk Bey</span> onaylar.
      </div></Rise>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const f = useT();
  const { fps } = useVideoConfig();
  const cols: [DChapter['who'], string[]][] = [
    ['ugur', ['Barista ekler, davet ve telefon kodu verir', 'Talepleri yanıtlar, servisi onaya gönderir', 'Görev atar', 'İçerik ve bülten önerir']],
    ['cenk', ['Önerileri yayınlar, düzeltir ya da geri gönderir', 'Servis taleplerini onaylar', 'Rozet ve başarım kurallarını belirler', 'Bülten yayınlar, ekibi yönetir']]
  ];
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, padding: '110px 150px' }}>
      <Rise start={0} dy={90}><div style={{ fontSize: 96, fontWeight: 850, color: INK, letterSpacing: -3 }}>Kim ne yapar?</div></Rise>
      <div style={{ height: 70 }} />
      <div style={{ display: 'flex', gap: 90 }}>
        {cols.map(([who, items], ci) => (
          <div key={who} style={{ flex: 1 }}>
            <Rise start={8 + ci * 6}><PersonChip who={who} big /></Rise>
            <div style={{ height: 30 }} />
            {items.map((it, i) => {
              const p = spring({ frame: f - 16 - ci * 6 - i * 5, fps, config: { damping: 200 } });
              return (
                <div key={it} style={{ fontSize: 38, color: INK, padding: '20px 0', borderTop: '2px solid #2A2522', opacity: p, transform: `translateX(${interpolate(p, [0, 1], [40, 0])}px)` }}>{it}</div>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const Yonetim: React.FC<{ speed: number }> = ({ speed }) => {
  let at = D_INTRO;
  return (
    <SpeedCtx.Provider value={speed}>
      <AbsoluteFill style={{ background: BG }}>
        <Sequence durationInFrames={real(D_INTRO, speed)}><Intro /></Sequence>
        {DCHAPTERS.map((c, i) => {
          const from = at;
          at += dChapterLength(c);
          return <Sequence key={c.id} from={real(from, speed)} durationInFrames={real(dChapterLength(c), speed)}><ChapterView c={c} index={i} /></Sequence>;
        })}
        <Sequence from={real(at, speed)} durationInFrames={real(D_OUTRO, speed)}><Outro /></Sequence>
      </AbsoluteFill>
    </SpeedCtx.Provider>
  );
};
