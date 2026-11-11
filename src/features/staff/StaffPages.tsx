import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { backend, errorText } from '../../api/backend';
import { useContent } from '../../store/content';
import { useQueryLive } from '../../hooks/useFirestore';
import { assignmentDone, assignmentDoneAt, isOverdue, overallPercent, moduleState } from '../../lib/progress';
import { Icon } from '../../ui/Icon';
import { Page, PageTitle, Section, Stat, Empty, Badge, Avatar, ProgressBar, Sheet, ErrorText, Spinner, toast, fmtDate, fmtDateTime, relDays } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { AssignSheet } from '../shared/AssignSheet';
import { AttemptRow } from '../barista/HomePages';
import { useStaffData } from './staffData';
import { useStaffSession } from './StaffLayout';
import type { Barista, BaristaRole, Progress } from '../../../shared/types';

const WEEK = 7 * 86400000;
const EMPTY: Progress = { baristaId: '', storeId: '', lessons: {}, modules: {}, updatedAt: 0 };

/* ------------------------------------------------------------------ */
/* Davet kodu gösterimi                                                */
/* ------------------------------------------------------------------ */

export const CodeSheet: React.FC<{ code: { code: string; expiresAt: number; title: string; hint: string } | null; onClose: () => void }> = ({ code, onClose }) => (
  <Sheet open={!!code} title={code?.title || ''} onClose={onClose}
    footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={onClose}>Tamam</button>}>
    {code && (
      <>
        <div className="flex items-center justify-center gap-2 py-4">
          {code.code.split('').map((d, i) => (
            <span key={i} className="w-11 h-14 rounded-lg border border-line-2 bg-panel-2 flex items-center justify-center text-[28px] font-bold tnum">{d}</span>
          ))}
        </div>
        <button
          className={`${t.btn} ${t.btnSecondary} ${t.btnMd} self-center`}
          onClick={() => { navigator.clipboard?.writeText(code.code); toast('Kopyalandı'); }}
        >
          <Icon name="copy" size={14} /> Kopyala
        </button>
        <p className="text-[13px] text-fg-2 leading-relaxed">{code.hint}</p>
        <p className="text-[12px] text-fg-3">Geçerlilik: {fmtDateTime(code.expiresAt)}. Kod tek kullanımlıktır.</p>
      </>
    )}
  </Sheet>
);

const inviteHint = (name: string) =>
  `${name}, mağaza telefonunda "Yeni misin?" seçeneğine dokunup bu kodu girecek ve kendi 4 haneli PIN'ini belirleyecek. Kodu WhatsApp veya SMS ile kendisine iletebilirsin.`;

/* ------------------------------------------------------------------ */
/* Genel bakış                                                         */
/* ------------------------------------------------------------------ */

export const OverviewPage: React.FC = () => {
  const { stores, modules, lessons } = useContent();
  const { baristas, progress, attempts, assignments } = useStaffData();
  const active = baristas.filter((b) => b.active);
  const weekAttempts = attempts.filter((a) => a.submittedAt && a.startedAt > Date.now() - WEEK);
  const avgScore = weekAttempts.length ? Math.round(weekAttempts.reduce((s, a) => s + (a.score || 0), 0) / weekAttempts.length) : null;
  const avgProgress = active.length ? Math.round(active.reduce((s, b) => s + overallPercent(modules, lessons, progress[b.id] || EMPTY), 0) / active.length) : 0;

  const overdueCount = useMemo(() => {
    let n = 0;
    for (const a of assignments) {
      const targets = a.baristaId ? active.filter((b) => b.id === a.baristaId) : active.filter((b) => b.storeId === a.storeId);
      for (const b of targets) if (isOverdue(a, assignmentDone(a, progress[b.id]))) n++;
    }
    return n;
  }, [assignments, active, progress]);

  // En çok yanlış yapılan sorular — eğitim içeriğinde neyin anlaşılmadığını gösterir.
  const missed = useMemo(() => {
    const map = new Map<string, { prompt: string; module: string; n: number; answer: string }>();
    attempts.filter((a) => a.startedAt > Date.now() - 30 * 86400000).forEach((a) =>
      (a.mistakes || []).forEach((m) => {
        const cur = map.get(m.questionId) || { prompt: m.prompt, module: a.moduleTitle, n: 0, answer: m.options[m.answer] };
        cur.n++;
        map.set(m.questionId, cur);
      }));
    return [...map.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  }, [attempts]);

  return (
    <Page wide>
      <PageTitle title="Genel bakış" subtitle="Tüm mağazaların eğitim durumu." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Aktif barista" value={active.length} hint={`${stores.filter((s) => s.active).length} mağaza`} icon="users" />
        <Stat label="Ortalama ilerleme" value={`%${avgProgress}`} icon="target" tone="positive" />
        <Stat label="Bu hafta sınav" value={weekAttempts.length} hint={avgScore !== null ? `Ortalama %${avgScore}` : 'Henüz yok'} icon="clipboard" tone="accent" />
        <Stat label="Gecikmiş görev" value={overdueCount} icon="alert" tone={overdueCount ? 'negative' : 'neutral'} />
      </div>

      <Section label="Mağazalar">
        <div className="overflow-x-auto">
          <div className={`${t.listGroup} min-w-[560px]`}>
            <div className="grid grid-cols-[1.6fr_0.7fr_1.2fr_0.8fr_0.8fr] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-3">
              <span>Mağaza</span><span>Barista</span><span>İlerleme</span><span>Sınav (7g)</span><span>Gecikmiş</span>
            </div>
            {stores.filter((s) => s.active).map((s) => {
              const team = active.filter((b) => b.storeId === s.id);
              const pct = team.length ? Math.round(team.reduce((x, b) => x + overallPercent(modules, lessons, progress[b.id] || EMPTY), 0) / team.length) : 0;
              const wk = weekAttempts.filter((a) => a.storeId === s.id);
              const passRate = wk.length ? Math.round((wk.filter((a) => a.passed).length / wk.length) * 100) : null;
              let od = 0;
              assignments.filter((a) => a.storeId === s.id).forEach((a) =>
                team.filter((b) => !a.baristaId || a.baristaId === b.id).forEach((b) => { if (isOverdue(a, assignmentDone(a, progress[b.id]))) od++; }));
              return (
                <Link key={s.id} to={`/magazalar/${s.id}`} className="grid grid-cols-[1.6fr_0.7fr_1.2fr_0.8fr_0.8fr] gap-3 px-4 py-3 items-center hover:bg-panel-2 transition-colors">
                  <span className="text-[14px] font-medium truncate">{s.name}</span>
                  <span className="text-[13px] tnum text-fg-2">{team.length}</span>
                  <span className="flex items-center gap-2"><ProgressBar value={pct} className="flex-1" /><span className="text-[12px] tnum w-9 text-right">%{pct}</span></span>
                  <span className="text-[13px] tnum text-fg-2">{wk.length}{passRate !== null ? ` · %${passRate} geçti` : ''}</span>
                  <span>{od ? <Badge tone="negative">{od}</Badge> : <span className="text-[13px] text-fg-3">—</span>}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section label="En çok yanlış yapılan sorular (30 gün)">
          {missed.length === 0 ? <Empty icon="target" text="Henüz yeterli sınav verisi yok." /> : (
            <div className={t.listGroup}>
              {missed.map((m, i) => (
                <div key={i} className={`${t.listRowStatic} items-start`}>
                  <Badge tone="negative">{m.n}×</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium leading-snug">{m.prompt}</div>
                    <div className="text-[12px] text-fg-3 mt-1">{m.module} · Doğru: <span className="text-positive">{m.answer}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section label="Son sınavlar">
          {attempts.filter((a) => a.submittedAt).length === 0 ? <Empty icon="clipboard" text="Henüz sınav yok." /> : (
            <div className={t.listGroup}>
              {attempts.filter((a) => a.submittedAt).slice(0, 8).map((a) => (
                <Link key={a.id} to={`/baristalar/${a.baristaId}`} className={t.listRow}>
                  <Badge tone={a.passed ? 'positive' : 'negative'}>%{a.score}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{a.baristaName}</div>
                    <div className="text-[12px] text-fg-3 truncate">{a.moduleTitle} · {stores.find((s) => s.id === a.storeId)?.name}</div>
                  </div>
                  <span className="text-[11px] text-fg-3">{fmtDateTime(a.submittedAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>

      <StaffTeamSection />
    </Page>
  );
};

interface StaffRow { id: string; name: string; email: string; role: 'ops' | 'admin'; active: boolean }

const StaffTeamSection: React.FC = () => {
  const me = useStaffSession();
  const { data: staff } = useQueryLive<StaffRow>(query(collection(db, 'users'), where('role', 'in', ['ops', 'admin'])), 'staff-team');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Ad soyad gir.');
    if (!email.includes('@')) return setError('Geçerli bir e-posta gir.');
    setBusy(true);
    try {
      await backend.createStaff(name, email);
      toast(`${name.trim()} eklendi. Şifre belirleme bağlantısı e-postasına gönderildi.`, 'positive');
      setOpen(false);
      setName(''); setEmail('');
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };

  return (
    <Section label={`Kahve Operasyonu ekibi · ${staff.filter((s) => s.active).length}`} action={<button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => setOpen(true)}><Icon name="plus" size={14} /> Ekle</button>}>
      <div className={t.listGroup}>
        {staff.filter((s) => s.active).map((s) => (
          <div key={s.id} className={t.listRowStatic}>
            <Avatar name={s.name} size={32} />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium truncate">{s.name}{s.id === me.uid ? ' (sen)' : ''}</div>
              <div className="text-[12px] text-fg-3 truncate">{s.email} · {s.role === 'admin' ? 'Yönetici' : 'Operasyon'}</div>
            </div>
            {s.id !== me.uid && (
              <button className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} onClick={async () => {
                if (!confirm(`${s.name} için erişim kaldırılsın mı?`)) return;
                await updateDoc(doc(db, 'users', s.id), { active: false });
                toast('Erişim kaldırıldı');
              }}>Kaldır</button>
            )}
          </div>
        ))}
      </div>
      <Sheet open={open} title="Kahve Operasyonu hesabı ekle" onClose={() => setOpen(false)}
        footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={add} disabled={busy}>{busy ? <Spinner size={14} /> : 'Ekle'}</button>}>
        <label className={t.field}><span className={t.label}>Ad soyad</span><input className={t.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className={t.field}><span className={t.label}>E-posta</span><input className={t.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <p className="text-[12px] text-fg-3 leading-relaxed">Şifresini kendisi belirleyecek: e-postasına bir bağlantı gönderilir.</p>
        <ErrorText>{error}</ErrorText>
      </Sheet>
    </Section>
  );
};

/* ------------------------------------------------------------------ */
/* Mağazalar                                                           */
/* ------------------------------------------------------------------ */

export const StoresPage: React.FC = () => {
  const { stores } = useContent();
  const { baristas } = useStaffData();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('İstanbul');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (name.trim().length < 2) return;
    setBusy(true);
    await addDoc(collection(db, 'stores'), { name: name.trim(), city: city.trim(), active: true, createdAt: Date.now() });
    setBusy(false);
    setOpen(false);
    setName('');
    toast('Mağaza eklendi', 'positive');
  };

  return (
    <Page wide>
      <PageTitle title="Mağazalar" action={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setOpen(true)}><Icon name="plus" size={15} /> Mağaza</button>} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stores.map((s) => (
          <Link key={s.id} to={`/magazalar/${s.id}`} className={`${t.cardInteractive} p-4 flex items-center gap-3 ${s.active ? '' : 'opacity-50'}`}>
            <span className={t.iconChip('neutral')}><Icon name="store" size={16} /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold truncate">{s.name}</div>
              <div className="text-[12px] text-fg-3">{s.city} · {baristas.filter((b) => b.storeId === s.id && b.active).length} barista</div>
            </div>
            <Icon name="chevronRight" size={16} className={t.rowChevron} />
          </Link>
        ))}
      </div>
      <Sheet open={open} title="Yeni mağaza" onClose={() => setOpen(false)}
        footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={add} disabled={busy}>Ekle</button>}>
        <label className={t.field}><span className={t.label}>Mağaza adı</span><input className={t.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ör. Moda Cadde" /></label>
        <label className={t.field}><span className={t.label}>Şehir</span><input className={t.input} value={city} onChange={(e) => setCity(e.target.value)} /></label>
      </Sheet>
    </Page>
  );
};

interface DeviceRow { id: string; label: string; createdAt: number; lastSeenAt: number | null; active: boolean; paired: boolean }

export const StoreDetailPage: React.FC = () => {
  const { storeId } = useParams();
  const { stores, modules, lessons } = useContent();
  const { baristas, progress } = useStaffData();
  const store = stores.find((s) => s.id === storeId);
  const { data: devices } = useQueryLive<DeviceRow>(
    storeId ? query(collection(db, 'users'), where('role', '==', 'store'), where('storeId', '==', storeId)) : null,
    `dev-${storeId}`
  );
  const [code, setCode] = useState<{ code: string; expiresAt: number; title: string; hint: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!store) return <Page wide><PageTitle title="Mağaza bulunamadı" back="/magazalar" /></Page>;
  const team = baristas.filter((b) => b.storeId === store.id);

  const pairPhone = async () => {
    setBusy(true);
    try {
      const r = await backend.createPairingCode(store.id, store.name);
      setCode({ ...r, title: 'Telefon eşleştirme kodu', hint: `Mağaza telefonunda 1401 Campus'u aç ve bu kodu gir. Telefon kalıcı olarak ${store.name} mağazasına bağlanır.` });
    } catch (e) { toast(errorText(e), 'negative'); }
    setBusy(false);
  };

  return (
    <Page wide>
      <PageTitle title={store.name} subtitle={store.city} back="/magazalar"
        action={
          <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`}
            onClick={async () => { await updateDoc(doc(db, 'stores', store.id), { active: !store.active }); toast(store.active ? 'Mağaza pasifleştirildi' : 'Mağaza aktif'); }}>
            {store.active ? 'Pasifleştir' : 'Aktifleştir'}
          </button>
        } />

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 items-start">
        <Section label={`Baristalar · ${team.filter((b) => b.active).length}`} action={<button className={`${t.btn} ${t.btnPrimary} ${t.btnSm}`} onClick={() => setAddOpen(true)}><Icon name="plus" size={14} /> Barista ekle</button>}>
          {team.length === 0 ? <Empty icon="users" text="Bu mağazada henüz barista yok." /> : (
            <div className={t.listGroup}>
              {team.map((b) => <BaristaRow key={b.id} b={b} pct={overallPercent(modules, lessons, progress[b.id] || EMPTY)} />)}
            </div>
          )}
        </Section>

        <Section label="Mağaza telefonları" action={<button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={pairPhone} disabled={busy}><Icon name="phone" size={14} /> Telefon bağla</button>}>
          {devices.filter((d) => d.active).length === 0 ? <Empty icon="phone" text="Bağlı telefon yok. 'Telefon bağla' ile kod oluştur." /> : (
            <div className={t.listGroup}>
              {devices.filter((d) => d.active).map((d) => (
                <div key={d.id} className={t.listRowStatic}>
                  <span className={t.iconChip('neutral')}><Icon name="phone" size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium">{d.paired ? d.label : `${d.label} (eşleştirme bekleniyor)`}</div>
                    <div className="text-[12px] text-fg-3">Bağlandı {fmtDate(d.createdAt)} · Son görülme {fmtDateTime(d.lastSeenAt)}</div>
                  </div>
                  <button className={`${t.btn} ${t.btnDanger} ${t.btnSm}`} onClick={async () => {
                    if (!confirm('Bu telefonun bağlantısı kaldırılsın mı? Telefonda kimse giriş yapamaz hale gelir.')) return;
                    try { await backend.revokeDevice(d.id); toast('Bağlantı kaldırıldı'); } catch (e) { toast(errorText(e), 'negative'); }
                  }}>Kaldır</button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <AddBaristaSheet open={addOpen} onClose={() => setAddOpen(false)} storeId={store.id} onCreated={setCode} />
      <CodeSheet code={code} onClose={() => setCode(null)} />
    </Page>
  );
};

const BaristaRow: React.FC<{ b: Barista; pct: number; showStore?: string }> = ({ b, pct, showStore }) => (
  <Link to={`/baristalar/${b.id}`} className={`${t.listRow} ${b.active ? '' : 'opacity-50'}`}>
    <Avatar name={b.name} size={36} dim={!b.active} />
    <div className="flex-1 min-w-0">
      <div className="text-[14px] font-medium truncate flex items-center gap-2">
        {b.name}
        {b.role === 'lead' && <Badge>Sorumlu</Badge>}
      </div>
      <div className="text-[12px] text-fg-3 truncate">
        {showStore ? `${showStore} · ` : ''}
        {!b.active ? 'Pasif' : b.pinPending ? 'Davet bekleniyor' : `İlerleme %${pct}`}
      </div>
    </div>
    {b.active && !b.pinPending && <ProgressBar value={pct} className="w-20 hidden sm:block" />}
    {b.active && b.pinPending && <Badge tone="caution">Davet</Badge>}
    <Icon name="chevronRight" size={16} className={t.rowChevron} />
  </Link>
);

const AddBaristaSheet: React.FC<{ open: boolean; onClose: () => void; storeId?: string; onCreated: (c: { code: string; expiresAt: number; title: string; hint: string }) => void }> = ({ open, onClose, storeId: fixed, onCreated }) => {
  const { stores } = useContent();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [storeId, setStoreId] = useState(fixed || '');
  const [role, setRole] = useState<BaristaRole>('barista');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await backend.createBarista({ name, storeId: fixed || storeId, role, phone });
      onClose();
      onCreated({ code: r.code, expiresAt: r.expiresAt, title: `${name.trim()} için davet kodu`, hint: inviteHint(name.trim().split(' ')[0]) });
      setName(''); setPhone(''); setRole('barista');
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };

  return (
    <Sheet open={open} title="Barista ekle" onClose={onClose}
      footer={<><button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={onClose}>Vazgeç</button><button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save} disabled={busy}>{busy ? <Spinner size={14} /> : 'Ekle ve kod oluştur'}</button></>}>
      <label className={t.field}><span className={t.label}>Ad soyad</span><input className={t.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      {!fixed && (
        <label className={t.field}><span className={t.label}>Mağaza</span>
          <select className={t.input} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Seç…</option>
            {stores.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <label className={t.field}><span className={t.label}>Telefon (isteğe bağlı — kodu iletmek için)</span><input className={t.input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="05xx xxx xx xx" /></label>
      <div className={t.field}>
        <span className={t.label}>Rol</span>
        <div className={t.segment}>
          {(['barista', 'lead'] as const).map((r) => (
            <button key={r} onClick={() => setRole(r)} className={`${t.segmentItem} ${role === r ? t.segmentItemOn : t.segmentItemOff}`}>{r === 'lead' ? 'Mağaza sorumlusu' : 'Barista'}</button>
          ))}
        </div>
        <span className="text-[11px] text-fg-3">Mağaza sorumlusu ekibinin ilerlemesini görür ve kendi mağazasına görev atayabilir.</span>
      </div>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ */
/* Baristalar                                                          */
/* ------------------------------------------------------------------ */

export const BaristasPage: React.FC = () => {
  const { stores, modules, lessons, tracks } = useContent();
  const { baristas, progress } = useStaffData();
  const [storeFilter, setStoreFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [addOpen, setAddOpen] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: number; title: string; hint: string } | null>(null);
  const [q, setQ] = useState('');

  const list = baristas.filter((b) => (showInactive || b.active) && (!storeFilter || b.storeId === storeFilter) && b.name.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));
  const pubMods = tracks.filter((x) => x.published).flatMap((tr) => modules.filter((m) => m.trackId === tr.id && m.published));
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name || '—';

  return (
    <Page wide>
      <PageTitle title="Baristalar" action={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setAddOpen(true)}><Icon name="plus" size={15} /> Barista</button>} />

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
          <input className={`${t.input} h-9 pl-9 text-[14px]`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="İsim ara" />
        </div>
        <select className={`${t.input} h-9 w-auto text-[14px]`} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
          <option value="">Tüm mağazalar</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className={t.segment}>
          <button className={`${t.segmentItem} ${view === 'list' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setView('list')}>Liste</button>
          <button className={`${t.segmentItem} ${view === 'matrix' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setView('matrix')}>Modül tablosu</button>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-fg-2 px-1">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Pasifler
        </label>
      </div>

      {list.length === 0 ? <Empty icon="users" text="Barista bulunamadı." /> : view === 'list' ? (
        <div className={t.listGroup}>
          {list.map((b) => <BaristaRow key={b.id} b={b} pct={overallPercent(modules, lessons, progress[b.id] || EMPTY)} showStore={storeName(b.storeId)} />)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="text-[12px] border-collapse min-w-full">
            <thead>
              <tr className="bg-panel">
                <th className="sticky left-0 bg-bean text-left px-3 py-2.5 font-semibold text-fg-2 min-w-[160px] border-b border-line">Barista</th>
                {pubMods.map((m) => (
                  <th key={m.id} className="px-2 py-2.5 font-medium text-fg-3 border-b border-line min-w-[88px] max-w-[110px] align-bottom">
                    <span className="line-clamp-3 leading-tight">{m.title}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const p = progress[b.id] || EMPTY;
                return (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="sticky left-0 bg-bean px-3 py-2">
                      <Link to={`/baristalar/${b.id}`} className="font-medium hover:underline">{b.name}</Link>
                      <div className="text-[11px] text-fg-3">{storeName(b.storeId)}</div>
                    </td>
                    {pubMods.map((m) => {
                      const st = moduleState(m, lessons, p);
                      return (
                        <td key={m.id} className="px-2 py-2 text-center">
                          {st.passed ? (
                            <span className="inline-flex items-center justify-center min-w-11 h-6 px-1.5 rounded-md bg-positive-bg text-positive border border-positive-line font-semibold tnum">%{st.score}</span>
                          ) : st.lessonsDone > 0 ? (
                            <span className="text-fg-2 tnum">{st.lessonsDone}/{st.lessons.length}</span>
                          ) : <span className="text-fg-4">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-fg-3">Modül tablosunda yeşil: sınav geçildi (puan). Sayı: tamamlanan ders / toplam ders.</p>

      <AddBaristaSheet open={addOpen} onClose={() => setAddOpen(false)} storeId={storeFilter || undefined} onCreated={setCode} />
      <CodeSheet code={code} onClose={() => setCode(null)} />
    </Page>
  );
};

export const BaristaDetailPage: React.FC = () => {
  const { baristaId } = useParams();
  const navigate = useNavigate();
  const s = useStaffSession();
  const { stores, tracks, modules, lessons } = useContent();
  const { baristas, progress, attempts, assignments } = useStaffData();
  const b = baristas.find((x) => x.id === baristaId);
  const [code, setCode] = useState<{ code: string; expiresAt: number; title: string; hint: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!b) return <Page wide><PageTitle title="Barista bulunamadı" back="/baristalar" /></Page>;
  const p = progress[b.id] || EMPTY;
  const pct = overallPercent(modules, lessons, p);
  const mine = attempts.filter((a) => a.baristaId === b.id && a.submittedAt);
  const tasks = assignments.filter((a) => a.storeId === b.storeId && (!a.baristaId || a.baristaId === b.id));
  const first = b.name.split(' ')[0];

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { toast(errorText(e), 'negative'); } setBusy(false); };

  return (
    <Page wide>
      <PageTitle title={b.name} subtitle={`${stores.find((x) => x.id === b.storeId)?.name || ''} · ${b.role === 'lead' ? 'Mağaza sorumlusu' : 'Barista'} · Başlangıç ${b.startedAt || fmtDate(b.createdAt)}`} back />

      <div className="flex flex-wrap gap-2">
        {b.active && <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setAssignOpen(true)}><Icon name="flag" size={15} /> Görev ata</button>}
        <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setEditOpen(true)}><Icon name="edit" size={15} /> Düzenle</button>
        {b.active && (
          <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} disabled={busy} onClick={() => run(async () => {
            if (!confirm(`${first} için PIN sıfırlansın mı? Mevcut PIN hemen geçersiz olur.`)) return;
            const r = await backend.resetBaristaPin(b);
            setCode({ ...r, title: `${first} için yeni davet kodu`, hint: inviteHint(first) });
          })}><Icon name="key" size={15} /> {b.pinPending ? 'Yeni davet kodu' : 'PIN sıfırla'}</button>
        )}
        {b.active ? (
          <button className={`${t.btn} ${t.btnDanger} ${t.btnMd}`} disabled={busy} onClick={() => run(async () => {
            if (!confirm(`${b.name} işten ayrıldı olarak işaretlensin mi?\n\nPIN'i tüm telefonlarda hemen geçersiz olur. Sınav geçmişi raporlarda kalır; istersen sonra geri alabilirsin.`)) return;
            await backend.setBaristaActive(b, false);
            toast(`${first} pasifleştirildi`);
          })}>İşten ayrıldı</button>
        ) : (
          <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} disabled={busy} onClick={() => run(async () => {
            const r = await backend.setBaristaActive(b, true);
            if (r.code) setCode({ code: r.code, expiresAt: r.expiresAt!, title: `${first} için davet kodu`, hint: inviteHint(first) });
          })}>Yeniden aktifleştir</button>
        )}
      </div>

      {b.pinPending && b.active && (
        <div className="flex gap-3 p-4 rounded-xl bg-caution-bg border border-caution-line text-[13px] leading-relaxed">
          <Icon name="key" size={18} className="text-caution mt-0.5" />
          <span>{first} henüz davet kodunu kullanmadı. Kodu kaybettiyse "Yeni davet kodu" ile yenisini oluştur.</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Genel ilerleme" value={`%${pct}`} icon="target" tone="positive" />
        <Stat label="Geçilen modül" value={`${Object.keys(p.modules || {}).length}/${modules.filter((m) => m.published).length}`} icon="award" />
        <Stat label="Tamamlanan ders" value={Object.keys(p.lessons || {}).length} icon="book" />
        <Stat label="Sınav denemesi" value={mine.length} hint={mine.length ? `Ortalama %${Math.round(mine.reduce((x, a) => x + (a.score || 0), 0) / mine.length)}` : undefined} icon="clipboard" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <Section label="Modüller">
          <div className={t.listGroup}>
            {tracks.filter((x) => x.published).flatMap((tr) => modules.filter((m) => m.trackId === tr.id && m.published)).map((m) => {
              const st = moduleState(m, lessons, p);
              return (
                <div key={m.id} className={t.listRowStatic}>
                  <span className={t.iconChip(st.passed ? 'positive' : st.lessonsDone ? 'caution' : 'neutral')}>
                    <Icon name={st.passed ? 'check' : st.locked ? 'lock' : 'book'} size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{m.title}</div>
                    <div className="text-[11px] text-fg-3">{st.lessonsDone}/{st.lessons.length} ders{st.passed ? ` · Geçti %${st.score} (${fmtDate(p.modules[m.id].passedAt)})` : ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <div className="flex flex-col gap-5">
          <Section label="Görevler">
            {tasks.length === 0 ? <Empty icon="flag" text="Atanmış görev yok." /> : (
              <div className={t.listGroup}>
                {tasks.map((a) => {
                  const done = assignmentDone(a, p);
                  return (
                    <div key={a.id} className={t.listRowStatic}>
                      <span className={t.iconChip(done ? 'positive' : isOverdue(a, done) ? 'negative' : 'caution')}><Icon name={done ? 'check' : 'flag'} size={15} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium">{a.title}</div>
                        <div className="text-[11px] text-fg-3">
                          {done ? `Tamamlandı ${fmtDate(assignmentDoneAt(a, p))}` : a.dueAt ? `Son tarih ${fmtDate(a.dueAt)}` : 'Süresiz'}{!a.baristaId ? ' · Mağaza geneli' : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
          <Section label="Sınav geçmişi">
            {mine.length === 0 ? <Empty icon="clipboard" text="Henüz sınav yok." /> : (
              <div className="flex flex-col gap-2">
                {mine.map((a) => <AttemptRow key={a.id} a={a} open={openAttempt === a.id} onToggle={() => setOpenAttempt(openAttempt === a.id ? null : a.id)} />)}
              </div>
            )}
          </Section>
        </div>
      </div>

      <EditBaristaSheet open={editOpen} onClose={() => setEditOpen(false)} b={b} />
      <AssignSheet open={assignOpen} onClose={() => setAssignOpen(false)} creator={{ uid: s.uid, name: s.name }} baristas={baristas} preset={{ baristaId: b.id, storeId: b.storeId }} />
      <CodeSheet code={code} onClose={() => { setCode(null); if (!b.active) navigate('/baristalar'); }} />
    </Page>
  );
};

const EditBaristaSheet: React.FC<{ open: boolean; onClose: () => void; b: Barista }> = ({ open, onClose, b }) => {
  const { stores } = useContent();
  const [name, setName] = useState(b.name);
  const [storeId, setStoreId] = useState(b.storeId);
  const [role, setRole] = useState<BaristaRole>(b.role);
  const [phone, setPhone] = useState(b.phone || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await backend.updateBarista(b, { name, storeId, role, phone });
      toast('Kaydedildi', 'positive');
      onClose();
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} title="Baristayı düzenle" onClose={onClose}
      footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save} disabled={busy}>Kaydet</button>}>
      <label className={t.field}><span className={t.label}>Ad soyad</span><input className={t.input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className={t.field}><span className={t.label}>Mağaza</span>
        <select className={t.input} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {storeId !== b.storeId && <span className="text-[11px] text-caution">Mağaza değişince barista yeni mağazanın telefonunda görünür.</span>}
      </label>
      <label className={t.field}><span className={t.label}>Telefon</span><input className={t.input} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <div className={t.segment}>
        {(['barista', 'lead'] as const).map((r) => (
          <button key={r} onClick={() => setRole(r)} className={`${t.segmentItem} ${role === r ? t.segmentItemOn : t.segmentItemOff}`}>{r === 'lead' ? 'Mağaza sorumlusu' : 'Barista'}</button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ */
/* Görevler                                                            */
/* ------------------------------------------------------------------ */

export const TasksPage: React.FC = () => {
  const s = useStaffSession();
  const { stores } = useContent();
  const { baristas, progress, assignments } = useStaffData();
  const [open, setOpen] = useState(false);
  const [storeFilter, setStoreFilter] = useState('');

  const rows = assignments.filter((a) => !storeFilter || a.storeId === storeFilter).map((a) => {
    const targets = baristas.filter((b) => b.active && b.storeId === a.storeId && (!a.baristaId || a.baristaId === b.id));
    const done = targets.filter((b) => assignmentDone(a, progress[b.id]));
    return { a, targets, done };
  });

  return (
    <Page wide>
      <PageTitle title="Görevler" subtitle="Atanan dersler ve sınavlar; tamamlanma otomatik izlenir."
        action={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setOpen(true)}><Icon name="plus" size={15} /> Görev ata</button>} />
      <select className={`${t.input} h-9 w-auto text-[14px] self-start`} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
        <option value="">Tüm mağazalar</option>
        {stores.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {rows.length === 0 ? <Empty icon="flag" text="Henüz görev atanmadı." /> : (
        <div className={t.listGroup}>
          {rows.map(({ a, targets, done }) => {
            const complete = targets.length > 0 && done.length === targets.length;
            const overdue = !complete && a.dueAt && a.dueAt < Date.now();
            return (
              <div key={a.id} className={`${t.listRowStatic} flex-wrap`}>
                <span className={t.iconChip(complete ? 'positive' : overdue ? 'negative' : 'caution')}><Icon name={a.kind === 'lesson' ? 'book' : 'clipboard'} size={15} /></span>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[14px] font-medium">{a.title}</div>
                  <div className="text-[12px] text-fg-3">
                    {stores.find((x) => x.id === a.storeId)?.name} · {a.baristaId ? baristas.find((b) => b.id === a.baristaId)?.name : 'Tüm mağaza'} · {a.createdByName}
                    {a.dueAt ? ` · ${overdue ? 'Gecikti' : relDays(a.dueAt)}` : ''}
                  </div>
                  {targets.length > 1 && (
                    <div className="text-[11px] text-fg-3 mt-1">
                      Bekleyen: {targets.filter((b) => !done.includes(b)).map((b) => b.name.split(' ')[0]).join(', ') || '—'}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24"><ProgressBar value={targets.length ? (done.length / targets.length) * 100 : 0} /></div>
                  <span className="text-[12px] tnum w-10">{done.length}/{targets.length}</span>
                  <button className={t.iconBtn} title="Sil" onClick={async () => { if (confirm('Görev silinsin mi?')) await deleteDoc(doc(db, 'assignments', a.id)); }}><Icon name="trash" size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <AssignSheet open={open} onClose={() => setOpen(false)} creator={{ uid: s.uid, name: s.name }} baristas={baristas} />
    </Page>
  );
};
