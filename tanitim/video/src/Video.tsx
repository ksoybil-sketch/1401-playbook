import React from 'react';
import { AbsoluteFill, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { CHAPTERS, CHAPTER_LEAD, HUES, INTRO, OUTRO, chapterLength, type Chapter } from './script';
import { Phone, SCREEN_H } from './Phone';

const BG = '#100E0D';
const INK = '#F2EDE7';
const DIM = '#A9A19A';
const FONT = 'Inter, -apple-system, sans-serif';

/** Uygulamanın kendi logosu (keçi), krem renge boyanmış. */
const Logo: React.FC<{ size: number; color?: string }> = ({ size, color = INK }) => (
  <div style={{
    width: size * 0.785, height: size, background: color,
    WebkitMaskImage: `url(${staticFile('logo.svg')})`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
    maskImage: `url(${staticFile('logo.svg')})`, maskSize: 'contain', maskRepeat: 'no-repeat'
  }} />
);

/** Satır satır, alttan maskeyle gelen başlık. */
const Lines: React.FC<{ text: string; size: number; start: number; color?: string; weight?: number }> = ({ text, size, start, color = INK, weight = 800 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {text.split('\n').map((line, i) => {
        const p = spring({ frame: frame - start - i * 4, fps, config: { damping: 200, stiffness: 140 } });
        return (
          <div key={i} style={{ overflow: 'hidden', paddingBottom: size * 0.06 }}>
            <div style={{
              fontSize: size, fontWeight: weight, color, letterSpacing: -size * 0.035, lineHeight: 1.02,
              transform: `translateY(${interpolate(p, [0, 1], [size * 1.1, 0])}px)`
            }}>{line}</div>
          </div>
        );
      })}
    </div>
  );
};

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const out = interpolate(frame, [INTRO - 10, INTRO], [1, 0], { extrapolateLeft: 'clamp' });
  return (
    <AbsoluteFill style={{ background: BG, justifyContent: 'center', alignItems: 'center', opacity: out }}>
      <div style={{ transform: `scale(${interpolate(logo, [0, 1], [0.6, 1])})`, opacity: logo }}><Logo size={190} /></div>
      <div style={{ height: 56 }} />
      <Lines text="1401 Campus" size={128} start={8} />
      <div style={{ height: 26 }} />
      <Lines text="Reçete · eğitim · sınav · talep" size={44} start={18} color={DIM} weight={500} />
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items: [string, string, string][] = [
    ['Reçeteler', 'Giriş ekranından, PIN’siz', HUES.amber],
    ['Bugün', 'Sınavın, dersin, duyurun', HUES.sand],
    ['Akademi', 'Dersler ve sınavlar', HUES.sky],
    ['Ben', 'Rozetin ve başarımların', HUES.violet],
    ['Talepler', 'Müdürler için: Ben → Talepler', HUES.rose]
  ];
  return (
    <AbsoluteFill style={{ background: BG, padding: '170px 96px', fontFamily: FONT }}>
      <Lines text={'Neyi nerede\nbulursun?'} size={104} start={0} />
      <div style={{ height: 70 }} />
      {items.map(([a, b, c], i) => {
        const p = spring({ frame: frame - 14 - i * 5, fps, config: { damping: 200 } });
        return (
          <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 30, padding: '30px 0', borderTop: '2px solid #2A2522', opacity: p, transform: `translateX(${interpolate(p, [0, 1], [60, 0])}px)` }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: c }} />
            <div style={{ fontSize: 54, fontWeight: 800, color: INK, width: 330, letterSpacing: -1.5 }}>{a}</div>
            <div style={{ fontSize: 36, color: DIM }}>{b}</div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 96, bottom: 120, display: 'flex', alignItems: 'center', gap: 22, opacity: spring({ frame: frame - 45, fps, config: { damping: 200 } }) }}>
        <Logo size={70} />
        <div style={{ fontSize: 40, fontWeight: 700, color: INK }}>1401 Campus</div>
      </div>
    </AbsoluteFill>
  );
};

/** Bir bölüm: üstte etiket + başlık + "nerede", altta telefonda vuruşlar. */
const ChapterView: React.FC<{ c: Chapter; index: number }> = ({ c, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hue = HUES[c.hue];
  const len = chapterLength(c);
  const bar = spring({ frame, fps, config: { damping: 200, stiffness: 90 } });
  const phoneIn = spring({ frame: frame - CHAPTER_LEAD + 12, fps, config: { damping: 22, stiffness: 110 } });
  const exit = interpolate(frame, [len - 8, len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });

  // Hangi vuruştayız?
  let t = frame - CHAPTER_LEAD;
  let bi = 0;
  while (bi < c.beats.length - 1 && t >= c.beats[bi].dur) { t -= c.beats[bi].dur; bi++; }
  const beat = c.beats[bi];
  const beatStart = CHAPTER_LEAD + c.beats.slice(0, bi).reduce((s, b) => s + b.dur, 0);
  const capIn = spring({ frame: frame - beatStart - 4, fps, config: { damping: 200 } });
  const screenSwap = bi > 0 && c.beats[bi - 1].screen !== beat.screen ? interpolate(frame - beatStart, [0, 8], [0, 1], { extrapolateRight: 'clamp' }) : 1;

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, transform: `translateY(${-exit * 80}px)`, opacity: 1 - exit }}>
      {/* Bölüm rengi: sol kenarda dolan şerit */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 16, height: `${bar * 100}%`, background: hue }} />
      <div style={{ position: 'absolute', left: 84, top: 120, right: 84 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: bar }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: '#140F0B', background: hue, padding: '6px 16px', borderRadius: 10, letterSpacing: 1 }}>{String(index + 1).padStart(2, '0')}</span>
          <span style={{ fontSize: 34, fontWeight: 700, color: hue, letterSpacing: 2, textTransform: 'uppercase' }}>{c.tag}</span>
        </div>
        <div style={{ height: 26 }} />
        <Lines text={c.title} size={88} start={4} />
        <div style={{ height: 18 }} />
        <div style={{ fontSize: 32, color: DIM, opacity: bar, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: hue, fontWeight: 700 }}>Nerede:</span> {c.where}
        </div>
      </div>

      {frame >= CHAPTER_LEAD - 12 && (
        <div style={{
          position: 'absolute', left: '50%', top: 540, transform: `translate(-50%, ${interpolate(phoneIn, [0, 1], [260, 0])}px)`,
          opacity: phoneIn
        }}>
          <div style={{ opacity: screenSwap }}>
            <Sequence from={beatStart} layout="none" key={bi}>
              <Phone beat={beat} hue={hue} />
            </Sequence>
          </div>
        </div>
      )}

      {/* Alt yazı: telefonun alt kenarına binen kısa cümle */}
      {frame >= CHAPTER_LEAD && (
        <div style={{
          position: 'absolute', left: 70, right: 70, top: 540 + SCREEN_H - 130, display: 'flex', justifyContent: 'center',
          opacity: capIn, transform: `translateY(${interpolate(capIn, [0, 1], [24, 0])}px)`
        }}>
          <div style={{
            background: 'rgba(16,14,13,0.94)', border: `2px solid ${hue}`, color: INK, fontSize: 40, fontWeight: 650,
            padding: '22px 34px', borderRadius: 22, textAlign: 'center', lineHeight: 1.25, boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
          }}>{beat.caption}</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export const Tanitim: React.FC = () => {
  let at = INTRO;
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT }}>
      <Sequence durationInFrames={INTRO}><Intro /></Sequence>
      {CHAPTERS.map((c, i) => {
        const from = at;
        at += chapterLength(c);
        return <Sequence key={c.id} from={from} durationInFrames={chapterLength(c)}><ChapterView c={c} index={i} /></Sequence>;
      })}
      <Sequence from={at} durationInFrames={OUTRO}><Outro /></Sequence>
    </AbsoluteFill>
  );
};
