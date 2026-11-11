import React, { useId } from 'react';
import type { CupLayer, CupTone, LessonBlock } from '../../../shared/types';

/**
 * Bardak şeması.
 *
 * Çizim derse gömülü değil: `cup` bloğu yalnızca sırayı ve ölçüyü taşır
 * (bkz. scripts/recipe-cup.mjs), SVG burada üretilir. Böylece ders belgesi
 * küçük kalır ve çizim tek yerden değişir.
 *
 * Şema yalnızca YAPIYI anlatır — hangi malzeme nerede, hangi oranda.
 * Rakamlar çizimin üstünde değil, yanındaki listede durur; renk ikisini
 * birbirine bağlar. Rakamları çizime yazmak, bardağı okunmaz hâle getiriyordu.
 */

type CupBlock = Extract<LessonBlock, { type: 'cup' }>;

/**
 * Malzeme renkleri. Bunlar tema rengi değil, malzeme kimliğidir: espresso,
 * karamel şurubu ve çikolata sosu birbirine yakın üç kahverengidir ve
 * ayrışmadıklarında şema yanlış okunur.
 */
export const TONE: Record<CupTone, string> = {
  espresso: '#8A5226',
  sut: '#E6D9C5',
  kopuk: '#F4F0EA',
  buz: '#A8BDCE',
  su: '#7E93A6',
  sos: '#B4722C',
  cikolata: '#4E3322',
  toz: '#BE9263',
  matcha: '#7F9359',
  krema: '#F4F0EA',
  dekor: '#C09161',
  doz: '#8A7868',
  diger: '#8C9BAE'
};

/** Panelde malzeme rengi seçmek için okunur adlar. */
export const TONE_LABELS: { value: CupTone; label: string }[] = [
  { value: 'espresso', label: 'Espresso' },
  { value: 'sut', label: 'Süt' },
  { value: 'kopuk', label: 'Köpük' },
  { value: 'buz', label: 'Buz' },
  { value: 'su', label: 'Su' },
  { value: 'sos', label: 'Şurup/karamel' },
  { value: 'cikolata', label: 'Çikolata' },
  { value: 'toz', label: 'Toz' },
  { value: 'matcha', label: 'Matcha' },
  { value: 'krema', label: 'Krema' },
  { value: 'dekor', label: 'Dekor' },
  { value: 'diger', label: 'Diğer' }
];

/* ------------------------------------------------------------------ */
/* Geometri                                                            */
/* ------------------------------------------------------------------ */

const VB_W = 150;
const VB_H = 215;
const BASE_Y = 196;
const H_MAX = 166;

interface Box { top: number; bot: number; topHW: number; botHW: number; handle: boolean }

/**
 * Hacim arttıkça bardak büyür ama doğrusal değil — küp kök kullanılıyor,
 * yoksa ristretto fincanı 16 oz bardağın yanında görünmez oluyor.
 */
function cupBox(ml: number, vessel: CupBlock['vessel']): Box {
  const s = Math.max(0.4, Math.min(1, Math.cbrt(Math.max(ml, 20) / 480)));
  const geom = {
    hot: { topHW: 46, botHW: 36, handle: true },
    demi: { topHW: 34, botHW: 26, handle: true },
    cold: { topHW: 40, botHW: 29, handle: false }
  }[vessel];
  const w = (vessel === 'cold' ? 0.82 : 1) * (0.55 + 0.45 * s);
  return {
    top: BASE_Y - H_MAX * s,
    bot: BASE_Y,
    topHW: geom.topHW * w,
    botHW: geom.botHW * w,
    handle: geom.handle
  };
}

const hwAt = (b: Box, y: number) => b.topHW + (b.botHW - b.topHW) * ((y - b.top) / (b.bot - b.top));

const bandPoints = (b: Box, cx: number, y0: number, y1: number) => {
  const a = hwAt(b, y0);
  const c = hwAt(b, y1);
  return `${cx - a},${y0} ${cx + a},${y0} ${cx + c},${y1} ${cx - c},${y1}`;
};

/* ------------------------------------------------------------------ */
/* Tek bardak                                                          */
/* ------------------------------------------------------------------ */

const Cup: React.FC<{ block: CupBlock; sizeIdx: number; uid: string }> = ({ block, sizeIdx, uid }) => {
  const key = sizeIdx === 1 ? 'large' : 'small';
  const body = block.layers.filter((l) => l.order < 900);
  const vol = body.filter((l) => l.fill === 'ml').sort((a, b) => a.order - b.order);
  const total = vol.reduce((s, l) => s + (l[key] ?? 0), 0) || 60;
  const ice = body.find((l) => l.fill === 'silme');
  const tops = block.layers.filter((l) => l.order >= 900);
  const size = block.sizes[Math.min(sizeIdx, block.sizes.length - 1)];

  const box = cupBox(block.vessel === 'cold' && size ? size.ml : total, block.vessel);
  const CX = 68;
  // Az bir boşluk gerçekçi ama fazlası, parlak sütün üstünde koyu bir şerit
  // bırakıp sahte katman gibi okunuyor.
  const headroom = Math.min(5, (box.bot - box.top) * 0.03);
  const fillTop = box.top + headroom;
  const span = box.bot - fillTop;
  const aTop = hwAt(box, box.top);

  // Katmanlar alttan yukarı: dizi zaten artan sırada (0 = en altta),
  // olduğu gibi gezilir. Ters çevirmek sıralamayı bozar.
  const bands: React.ReactNode[] = [];
  if (block.mode === 'katman') {
    let y = box.bot;
    vol.forEach((l) => {
      const h = ((l[key] ?? 0) / total) * span;
      bands.push(
        <polygon key={`l${l.order}`} points={bandPoints(box, CX, y - h, y)} fill={TONE[l.tone]} fillOpacity={0.95} />
      );
      y -= h;
    });
  }

  const label = size ? (size.oz ? `${size.oz} oz` : `${size.ml} ml`) : block.vessel === 'demi' ? 'fincan' : '';

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full max-w-[135px] h-auto block min-w-0" role="img"
         aria-label={`Bardak şeması${label ? ` · ${label}` : ''}`}>
      <defs>
        <pattern id={`ice-${uid}`} width="9" height="9" patternTransform="rotate(38)" patternUnits="userSpaceOnUse">
          <rect width="9" height="9" fill={TONE.buz} fillOpacity={0.13} />
          <line x1="0" y1="0" x2="0" y2="9" stroke="#D6E6F2" strokeOpacity={0.26} strokeWidth={2.4} />
        </pattern>
        <pattern id={`mix-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1" fill={TONE.cikolata} fillOpacity={0.3} />
          <circle cx="4.5" cy="4.5" r="0.8" fill={TONE.krema} fillOpacity={0.18} />
        </pattern>
      </defs>

      {/* Bardağın boş kısmı BOŞ görünmeli. Koyu dolgu verilince her içecekte
          sıvının üstünde sahte bir katman gibi okunuyordu. */}
      <polygon points={bandPoints(box, CX, box.top, box.bot)} style={{ fill: 'var(--color-panel-3)', stroke: 'var(--color-line-2)' }}
               strokeWidth={1.4} />

      {box.handle && (() => {
        const my = (box.top + box.bot) / 2;
        const hx = CX + hwAt(box, my);
        return <path d={`M ${hx - 1} ${my - 15} q 19 3 19 16 q 0 13 -19 16`} fill="none"
                     style={{ stroke: 'var(--color-line-2)' }} strokeWidth={3.2} strokeLinecap="round" />;
      })()}

      {block.mode === 'karisim' ? (
        <>
          <polygon points={bandPoints(box, CX, fillTop, box.bot)} fill={TONE.toz} fillOpacity={0.82} />
          <polygon points={bandPoints(box, CX, fillTop, box.bot)} fill={`url(#mix-${uid})`} />
        </>
      ) : bands}

      {block.mode === 'katman' && block.foam && (() => {
        // Köpük sütle neredeyse aynı renk; aralarına saç teli bir çizgi
        // konmazsa cappuccino ile latte şemada ayırt edilemiyor.
        const fy = fillTop + Math.min(span * 0.22, 20);
        return (
          <>
            <polygon points={bandPoints(box, CX, fillTop, fy)} fill={TONE.kopuk} fillOpacity={0.97} />
            <line x1={CX - hwAt(box, fy)} y1={fy} x2={CX + hwAt(box, fy)} y2={fy}
                  stroke="rgba(0,0,0,0.22)" strokeWidth={1} />
          </>
        );
      })()}

      {ice && <polygon points={bandPoints(box, CX, fillTop, box.bot)} fill={`url(#ice-${uid})`} />}

      {tops.length > 0 && (
        <path d={`M ${CX - aTop} ${box.top} Q ${CX} ${box.top - Math.min(26, aTop * 0.62)} ${CX + aTop} ${box.top} Z`}
              fill={TONE[tops[0].tone]} fillOpacity={0.92} />
      )}

      <line x1={CX - aTop} y1={box.top} x2={CX + aTop} y2={box.top} style={{ stroke: 'var(--color-line-2)' }} strokeWidth={1.4} />

      {label && (
        <text x={CX} y={BASE_Y + 16} style={{ fill: 'var(--color-fg-2)' }} fontSize={11} fontWeight={600} textAnchor="middle">{label}</text>
      )}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* Ölçü listesi                                                        */
/* ------------------------------------------------------------------ */

const amountText = (l: CupLayer, key: 'small' | 'large') =>
  l.fill === 'ml' ? `${l[key]} ml` : l.text.toLocaleLowerCase('tr');

const Legend: React.FC<{ block: CupBlock }> = ({ block }) => {
  const two = block.sizes.length > 1;
  // Listede üstteki katman üstte görünsün: çizimin tersi sırada.
  const rows = [...block.layers].sort((a, b) => b.order - a.order);

  return (
    <div className="rounded-xl border border-line overflow-hidden bg-panel divide-y divide-line">
      {two && (
        <div className="grid grid-cols-[auto_1fr_58px_58px] gap-2.5 items-center px-3 pt-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-3">
          <span /><span />
          <span className="text-right">{block.sizes[0].oz ? `${block.sizes[0].oz} oz` : `${block.sizes[0].ml} ml`}</span>
          <span className="text-right">{block.sizes[1].oz ? `${block.sizes[1].oz} oz` : `${block.sizes[1].ml} ml`}</span>
        </div>
      )}
      {rows.map((l, i) => (
        <div key={i} className={`grid ${two ? 'grid-cols-[auto_1fr_58px_58px]' : 'grid-cols-[auto_1fr_auto]'} gap-2.5 items-center px-3 py-2.5`}>
          <span className="w-2.5 h-2.5 rounded-[3px] shrink-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                style={{ background: TONE[l.tone] }} />
          <span className="text-[13px] text-fg-2 min-w-0">{l.name}</span>
          <span className="text-[13px] font-semibold text-right tnum whitespace-nowrap">{amountText(l, 'small')}</span>
          {two && <span className="text-[13px] font-semibold text-right tnum whitespace-nowrap">{amountText(l, 'large')}</span>}
        </div>
      ))}
      {block.dose && (
        <div className={`grid ${two ? 'grid-cols-[auto_1fr_58px_58px]' : 'grid-cols-[auto_1fr_auto]'} gap-2.5 items-center px-3 py-2.5`}>
          <span className="w-2.5 h-2.5 rounded-[3px] shrink-0 border border-dashed border-line-2" />
          <span className="text-[13px] text-fg-2 min-w-0 flex flex-col leading-tight">
            {block.dose.name}
            <em className="not-italic text-[10.5px] text-fg-3">bardağa girmez</em>
          </span>
          <span className="text-[13px] text-fg-2 text-right tnum whitespace-nowrap">{block.dose.text}</span>
          {two && <span className="text-[13px] text-fg-2 text-right tnum whitespace-nowrap">{block.dose.text}</span>}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

export const CupDiagram: React.FC<{ block: CupBlock }> = ({ block }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const two = block.sizes.length > 1;

  return (
    <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:gap-4 sm:items-center">
      <div className="min-w-0">
        {block.art ? (
          // Dışarıdan gelen çizim <img> içinde gösterilir: <img> ile yüklenen
          // SVG betik çalıştıramaz ve dış kaynak çağıramaz. Panelden içerik
          // girebilen bir hesap, bu alan üzerinden uygulamaya kod sokamasın.
          <img
            src={block.art.startsWith('data:') ? block.art : `data:image/svg+xml;utf8,${encodeURIComponent(block.art)}`}
            alt="Bardak şeması"
            className="w-full max-w-[280px] mx-auto h-auto block"
            loading="lazy"
          />
        ) : (
          <div className="flex items-end justify-center gap-0.5">
            <Cup block={block} sizeIdx={0} uid={`${uid}a`} />
            {two && <Cup block={block} sizeIdx={1} uid={`${uid}b`} />}
          </div>
        )}
        {block.mode === 'karisim' && (
          <p className="text-[11.5px] text-fg-3 text-center mt-1">Katman yok — malzemeler blenderda karışır.</p>
        )}
      </div>
      <div className="min-w-0"><Legend block={block} /></div>
    </div>
  );
};
