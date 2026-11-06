import React, { useState } from 'react';
import type { LessonBlock } from '../../../shared/types';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';

/** **kalın** ve satır başı "- " madde işaretlerini destekleyen küçük metin biçimleyici. */
export const RichText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`u${out.length}`} className="flex flex-col gap-1.5 pl-1">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2.5"><span className="mt-[9px] w-1 h-1 rounded-full bg-fg-3 shrink-0" /><span>{inline(b)}</span></li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };
  lines.forEach((ln) => {
    const m = ln.match(/^\s*[-•]\s+(.*)$/);
    if (m) bullets.push(m[1]);
    else {
      flush();
      if (ln.trim()) out.push(<p key={`p${out.length}`}>{inline(ln)}</p>);
    }
  });
  flush();
  return <div className="flex flex-col gap-2.5 text-[15px] leading-[1.65] text-crema/90">{out}</div>;
};

function inline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i} className="text-crema font-semibold">{p.slice(2, -2)}</b> : p));
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const CheckBlock: React.FC<{ block: Extract<LessonBlock, { type: 'check' }> }> = ({ block }) => {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  return (
    <div className={`${t.card} p-4 flex flex-col gap-3`}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">
        <Icon name="target" size={14} /> Kendini dene
      </div>
      <div className="text-[15px] font-semibold leading-snug">{block.prompt}</div>
      <div className="flex flex-col gap-2">
        {block.options.map((o, i) => {
          const isAnswer = i === block.answer;
          const state = !answered ? 'idle' : isAnswer ? 'right' : i === picked ? 'wrong' : 'dim';
          const cls = {
            idle: 'border-line bg-panel hover:bg-panel-2',
            right: 'border-positive-line bg-positive-bg text-positive',
            wrong: 'border-negative-line bg-negative-bg text-negative',
            dim: 'border-line bg-panel opacity-50'
          }[state];
          return (
            <button key={i} disabled={answered} onClick={() => setPicked(i)} className={`text-left px-3.5 py-3 rounded-lg border text-[14px] transition-colors ${cls}`}>
              {o}
            </button>
          );
        })}
      </div>
      {answered && (
        <p className="text-[13px] text-fg-2 leading-relaxed">
          {picked === block.answer ? 'Doğru! ' : 'Doğru cevap işaretlendi. '}
          {block.explanation}
        </p>
      )}
    </div>
  );
};

export const LessonBlocks: React.FC<{ blocks: LessonBlock[] }> = ({ blocks }) => (
  <div className="flex flex-col gap-5">
    {blocks.map((b, i) => {
      switch (b.type) {
        case 'heading':
          return <h2 key={i} className="text-[18px] font-bold mt-2">{b.text}</h2>;
        case 'text':
          return <RichText key={i} text={b.text} />;
        case 'image':
          return (
            <figure key={i} className="flex flex-col gap-2">
              {/* Ürün fotoğrafları saydam ve farklı oranlarda; germek yerine
                  ortala ve yüksekliği sınırla, küçük görseller bulanıklaşmasın. */}
              <img src={b.url} alt={b.caption || ''} className="w-full max-h-80 object-contain mx-auto rounded-xl border border-line bg-panel" loading="lazy" />
              {b.caption && <figcaption className="text-[12px] text-fg-3 text-center">{b.caption}</figcaption>}
            </figure>
          );
        case 'video': {
          const yt = youtubeId(b.url);
          return (
            <figure key={i} className="flex flex-col gap-2">
              {yt ? (
                <div className="aspect-video rounded-xl overflow-hidden border border-line bg-black">
                  <iframe className="w-full h-full" src={`https://www.youtube-nocookie.com/embed/${yt}`} title={b.caption || 'Video'} allow="encrypted-media; picture-in-picture" allowFullScreen />
                </div>
              ) : (
                <video src={b.url} controls playsInline preload="metadata" className="w-full rounded-xl border border-line bg-black" />
              )}
              {b.caption && <figcaption className="text-[12px] text-fg-3 text-center">{b.caption}</figcaption>}
            </figure>
          );
        }
        case 'tip':
          return (
            <div key={i} className="flex gap-3 p-4 rounded-xl bg-accent-bg border border-accent-line">
              <Icon name="info" size={18} className="text-accent mt-0.5" />
              <div className="text-[14px] leading-relaxed"><RichText text={b.text} /></div>
            </div>
          );
        case 'warning':
          return (
            <div key={i} className="flex gap-3 p-4 rounded-xl bg-caution-bg border border-caution-line">
              <Icon name="alert" size={18} className="text-caution mt-0.5" />
              <div className="text-[14px] leading-relaxed"><RichText text={b.text} /></div>
            </div>
          );
        case 'steps':
          return (
            <ol key={i} className="flex flex-col gap-3">
              {b.items.map((s, j) => (
                <li key={j} className="flex gap-3">
                  <span className="w-7 h-7 rounded-full bg-panel-3 border border-line text-[13px] font-semibold flex items-center justify-center shrink-0 tnum">{j + 1}</span>
                  <span className="text-[15px] leading-[1.6] pt-0.5">{inline(s)}</span>
                </li>
              ))}
            </ol>
          );
        case 'spec':
          return (
            <div key={i} className={t.listGroup}>
              {b.rows.map((r, j) => (
                <div key={j} className={`${t.listRowStatic} justify-between`}>
                  <span className="text-[14px] text-fg-2">{r.label}</span>
                  <span className="text-[14px] font-semibold text-right tnum">{r.value}</span>
                </div>
              ))}
            </div>
          );
        case 'check':
          return <CheckBlock key={i} block={b} />;
        default:
          return null;
      }
    })}
  </div>
);
