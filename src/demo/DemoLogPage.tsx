import React, { useMemo, useState } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../api/firebase';
import { useQueryLive } from '../hooks/useFirestore';
import { Page, PageTitle, Empty, Spinner } from '../ui/kit';
import * as t from '../ui/tokens';

interface Entry {
  id: string; at: number; uid: string; who: string; role: string; sid: string; device: string;
  kind: 'oturum' | 'sayfa' | 'değişiklik' | 'ölçüm'; path: string; op: string; label: string; detail: string;
}

const DAY = 86400000;
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const hms = (ms: number) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayName = (ms: number) => new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });

const RANGES = [
  { id: 'bugun', label: 'Bugün', from: () => startOfDay(Date.now()) },
  { id: 'dun', label: 'Dün', from: () => startOfDay(Date.now()) - DAY, to: () => startOfDay(Date.now()) },
  { id: 'hafta', label: 'Son 7 gün', from: () => startOfDay(Date.now()) - 6 * DAY }
] as const;

const OP_TONE: Record<string, string> = { ekle: 'text-positive', yaz: 'text-positive', güncelle: 'text-caution', sil: 'text-negative' };

/**
 * Demoyu deneyenlerin izi: kim girdi, hangi ekranlara baktı, ne değiştirdi.
 * Yalnızca demo ve emülatör paketinde, uygulama geliştiricisine görünür.
 */
export const DemoLogPage: React.FC = () => {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('bugun');
  const [person, setPerson] = useState<string>('');
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [onlyTimings, setOnlyTimings] = useState(false);
  const r = RANGES.find((x) => x.id === range)!;
  const from = r.from();

  const { data, loading, error } = useQueryLive<Entry>(
    query(collection(db, 'demoLog'), where('at', '>=', from), orderBy('at', 'desc'), limit(3000)),
    'demo-log-' + range
  );

  const rows = useMemo(() => {
    const to = 'to' in r ? r.to() : Infinity;
    return data.filter((e) => e.at < to);
  }, [data, r]);

  const people = useMemo(() => {
    const m = new Map<string, { who: string; role: string; views: number; changes: number; first: number; last: number }>();
    for (const e of rows) {
      const p = m.get(e.who) || { who: e.who, role: e.role, views: 0, changes: 0, first: e.at, last: e.at };
      if (e.kind === 'sayfa') p.views++;
      if (e.kind === 'değişiklik') p.changes++;
      p.first = Math.min(p.first, e.at); p.last = Math.max(p.last, e.at);
      m.set(e.who, p);
    }
    return [...m.values()].sort((a, b) => b.last - a.last);
  }, [rows]);

  const shown = rows.filter((e) => (!person || e.who === person) && (!onlyChanges || e.kind === 'değişiklik') && (!onlyTimings || e.kind === 'ölçüm'));
  const groups = useMemo(() => {
    const g: { day: number; items: Entry[] }[] = [];
    for (const e of shown) {
      const d = startOfDay(e.at);
      if (!g.length || g[g.length - 1].day !== d) g.push({ day: d, items: [] });
      g[g.length - 1].items.push(e);
    }
    return g;
  }, [shown]);

  return (
    <Page wide>
      <PageTitle title="Demo kaydı" subtitle="Demoyu deneyenler hangi ekranlara girdi, ne değiştirdi. Yalnızca sen görürsün." />

      <div className="flex flex-wrap items-center gap-2">
        <div className={t.segment}>
          {RANGES.map((x) => (
            <button key={x.id} onClick={() => setRange(x.id)} className={`${t.segmentItem} ${range === x.id ? t.segmentItemOn : t.segmentItemOff}`}>{x.label}</button>
          ))}
        </div>
        <button onClick={() => setOnlyChanges((v) => !v)} className={`${t.chip} ${onlyChanges ? t.chipOn : t.chipOff}`}>Yalnızca değişiklikler</button>
        <button onClick={() => setOnlyTimings((v) => !v)} className={`${t.chip} ${onlyTimings ? t.chipOn : t.chipOff}`}>Hız ölçümleri</button>
      </div>

      {loading ? <div className="py-10 flex justify-center"><Spinner /></div> : error ? (
        <Empty icon="info" text={`Kayıt okunamadı: ${error}`} />
      ) : rows.length === 0 ? (
        <Empty icon="info" text="Bu aralıkta kimse demoyu kullanmamış." />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <button key={p.who} onClick={() => setPerson(person === p.who ? '' : p.who)}
                className={`${t.cardInteractive} ${t.cardPad} text-left ${person === p.who ? 'border-crema!' : ''}`}>
                <div className={t.cardTitle}>{p.who}</div>
                <div className="text-[12px] text-fg-3">{p.role}</div>
                <div className="mt-2 text-[13px] text-fg-2 tnum">
                  {p.views} ekran · <span className={p.changes ? 'text-caution font-semibold' : ''}>{p.changes} değişiklik</span>
                </div>
                <div className="text-[12px] text-fg-3 tnum">{hhmm(p.first)} – {hhmm(p.last)}</div>
              </button>
            ))}
          </div>

          {groups.map((g) => (
            <section key={g.day} className="flex flex-col gap-1">
              <h2 className={t.sectionLabel}>{dayName(g.day)}</h2>
              <div className={t.listGroup}>
                {g.items.map((e) => <Row key={e.id} e={e} showWho={!person} />)}
              </div>
            </section>
          ))}
        </>
      )}
    </Page>
  );
};

const Row: React.FC<{ e: Entry; showWho: boolean }> = ({ e, showWho }) => {
  const [open, setOpen] = useState(false);
  const timing = e.kind === 'ölçüm';
  const change = e.kind === 'değişiklik' || timing;
  const ms = timing ? Number.parseInt(e.op, 10) : 0;
  const text = e.kind === 'oturum' ? `Giriş yaptı (${e.device})` : e.kind === 'sayfa' ? e.label : timing ? `⏱ ${e.label} · ${(ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn` : `${e.label} · ${e.op}`;
  return (
    <div className="px-4 py-2.5 flex flex-col gap-1">
      <button onClick={() => change && e.detail && setOpen((v) => !v)} className="flex items-baseline gap-3 text-left w-full">
        <span className={`text-[12px] text-fg-3 tnum shrink-0 ${timing ? 'w-16' : 'w-11'}`}>{timing ? hms(e.at) : hhmm(e.at)}</span>
        {showWho && <span className="text-[13px] text-fg-2 w-48 shrink-0 truncate">{e.who}</span>}
        <span className={`text-[13px] flex-1 min-w-0 ${timing ? `font-semibold ${ms >= 5000 ? 'text-negative' : ms >= 1500 ? 'text-caution' : 'text-positive'}` : change ? `font-semibold ${OP_TONE[e.op] || 'text-crema'}` : e.kind === 'oturum' ? 'text-crema' : 'text-fg-2'}`}>
          {text}
          {change && <span className="ml-2 font-normal text-fg-3 break-all">{e.path}</span>}
        </span>
        {change && e.detail && <span className="text-[12px] text-fg-3 shrink-0">{open ? 'Gizle' : 'Ayrıntı'}</span>}
      </button>
      {open && (
        <pre className="ml-14 text-[12px] leading-relaxed text-fg-2 bg-panel-2 rounded-lg p-3 whitespace-pre-wrap break-all">
          {pretty(e.detail)}
        </pre>
      )}
    </div>
  );
};

function pretty(s: string) {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
