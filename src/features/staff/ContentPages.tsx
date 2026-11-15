import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent } from '../../store/content';
import { useDocLive, useQueryLive } from '../../hooks/useFirestore';
import { commitChange, canPublishNow, lastProposalId, newId, resultText, StaleError, versionKey, verOf } from '../../api/changes';
import { errorText } from '../../api/backend';
import { allowed, domainOf } from '../../lib/permissions';
import { useQuestionCounts } from './staffData';
import { useStaffSession } from './StaffLayout';
import { authorName, can } from '../../lib/roles';
import { getAiKey, setAiKey } from '../../lib/aiKey';
import { Icon, type IconName } from '../../ui/Icon';
import { Page, PageTitle, Section, Empty, Badge, Sheet, ErrorText, Spinner, toast, sendOrQueue, QUEUED_TEXT, MAX } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { ImportLessonSheet } from './ImportLessonSheet';
import { MediaInput } from './MediaInput';
import { TONE as CUP_TONE, TONE_LABELS as CUP_TONES } from '../academy/CupDiagram';
import { parseAmount } from '../../../shared/recipeAmount';
import { LessonBlocks } from '../academy/LessonBlocks';
import { loadCurriculumFile, planCurriculum, publishCurriculum, type PublishPlan, type PublishProgress } from '../../api/publishCurriculum';
import type { CupLayer, Lesson, LessonBlock, Module, Proposal, Question, Track } from '../../../shared/types';
import { useUnsavedGuard } from '../../lib/unsaved';

const TRACK_ICONS: IconName[] = ['coffee', 'book', 'users', 'store', 'shield', 'package', 'cap', 'award', 'clipboard', 'flag'];

/** Listedeki iki öğenin sırasını değiştirir (yetkisi yoksa öneri olarak). */
async function swapOrder(col: 'tracks' | 'modules' | 'lessons', a: { id: string; order: number; title: string }, b: { id: string; order: number; title: string }) {
  try {
    const r = await commitChange([
      { op: 'update', col, id: a.id, data: { order: b.order } },
      { op: 'update', col, id: b.id, data: { order: a.order } }
    ], { kind: 'order', title: `${a.title} ↔ ${b.title}`, summary: 'Sıralama değişikliği' });
    if (r === 'proposed') toast(resultText(r));
  } catch (e) {
    // Hata yutuluyordu: yetki hatası ne ekranda ne kayıtta görünüyordu.
    toast(errorText(e), 'negative');
  }
}

/**
 * Sıralama okları: bir yazım sürerken listenin bütün okları kilitli. Çift
 * dokunma iki aynı öneri oluşturuyordu; yayın yetkisi olanda da art arda iki
 * dokunuş eski sıra değerleriyle yazabilirdi. Bağlantı yoksa kilit en geç
 * birkaç saniyede açılır (yazım kuyrukta kalır).
 */
function useSwap() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const swap = async (...args: Parameters<typeof swapOrder>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try { await sendOrQueue(swapOrder(...args)); } finally { lock.current = false; setBusy(false); }
  };
  return { busy, swap };
}

const ICON_LABEL: Partial<Record<IconName, string>> = {
  coffee: 'Kahve', book: 'Kitap', users: 'Kişiler', store: 'Mağaza', shield: 'Kalkan',
  package: 'Paket', cap: 'Kep', award: 'Ödül', clipboard: 'Pano', flag: 'Bayrak'
};

/**
 * Pencere kaydı: yazım kuyruğa alındıysa (çevrimdışı) pencere yine kapanır.
 * Hata olursa kullanıcıya Türkçe söylenir, pencere açık kalır.
 */
async function saveChange(run: () => Promise<'applied' | 'proposed'>, okText: string, onDone: () => void, onError?: (msg: string) => void) {
  try {
    let result: 'applied' | 'proposed' | null = null;
    const q = await sendOrQueue(run().then((r) => { result = r; }));
    toast(q === 'queued' ? QUEUED_TEXT : resultText(result!, okText), 'positive');
    onDone();
  } catch (e) {
    const msg = errorText(e);
    if (onError) onError(msg); else toast(msg, 'negative');
  }
}

const PublishBadge: React.FC<{ on: boolean }> = ({ on }) => <Badge tone={on ? 'positive' : 'neutral'}>{on ? 'Yayında' : 'Taslak'}</Badge>;

/* ------------------------------------------------------------------ */
/* İçerik: yollar ve modüller                                          */
/* ------------------------------------------------------------------ */

export const ContentPage: React.FC = () => {
  const navigate = useNavigate();
  const me = useStaffSession();
  const { tracks, modules, lessons } = useContent();
  // Soru sayısı modül belgesindeki sayaçtan değil bankadan (toplama sorgusu,
  // modül başına 1 okuma): soru eklenip silinince sayaç güncellenmiyordu.
  const qCounts = useQuestionCounts(modules.map((m) => m.id));
  const [editTrack, setEditTrack] = useState<Partial<Track> | null>(null);
  const [editModule, setEditModule] = useState<Partial<Module> | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const { busy: swapping, swap } = useSwap();

  return (
    <Page wide>
      <PageTitle title="Akademi" subtitle="Eğitim yolları, modüller, dersler ve soru bankası."
        action={
          <div className="flex gap-2 flex-wrap justify-end">
            {/* Toplu müfredat yüklemesi yüzlerce belgeyi birden değiştirir;
                öneri olarak taşınamayacak kadar büyük, yalnızca müdür yapar. */}
            {/* Yetki baştan denetlenir: içerik yayınlama yetkisi kapalıysa ya da
                alanı sınırlıysa toplu yazım yarıda reddedilip müfredatı yarım bırakıyordu. */}
            {can(me.role, 'publishCurriculum') && allowed(me.role, 'icerikYayin') && !domainOf(me.role) && (
              <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setSyncOpen(true)}>
                <Icon name="refresh" size={15} /> Müfredatı güncelle
              </button>
            )}
            {/* Anahtarı uygulamayı geliştiren kişi yönetir; Kahve Operasyonu
                yalnızca sonucunu (dosyadan Türkçe ders) kullanır. */}
            {can(me.role, 'manageAi') && (
              <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setAiOpen(true)}>
                <Icon name="flash" size={15} /> Yapay zekâ
              </button>
            )}
            {/* Tek ders eklemek için modülün içine girmek gerekiyordu; en çok
                kullanılan yol burası olduğu için düğme de burada duruyor. */}
            <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setImporting(true)}>
              <Icon name="upload" size={15} /> Dosyadan ders
            </button>
            <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setEditTrack({})}><Icon name="plus" size={15} /> Eğitim yolu</button>
          </div>
        } />

      <CurriculumSyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} />
      <AiKeySheet open={aiOpen} onClose={() => setAiOpen(false)} by={authorName(me.role, me.name)} />
      <ImportLessonSheet
        open={importing}
        onClose={() => setImporting(false)}
        onCreated={(id, pid, { count, moduleId }) => {
          setImporting(false);
          // Birden çok ders eklendiyse modülde hepsi görünsün; tek dersse doğrudan editörüne git.
          navigate(pid ? `/icerik/ders/${id}?oneri=${pid}` : count > 1 ? `/icerik/modul/${moduleId}` : `/icerik/ders/${id}`);
        }}
      />

      {tracks.length === 0 && <Empty icon="layers" text="Henüz eğitim yolu yok." />}

      {tracks.map((tr, ti) => {
        const mods = modules.filter((m) => m.trackId === tr.id);
        return (
          <Section key={tr.id}
            label={tr.title}
            action={
              <div className="flex gap-1.5 items-center">
                <PublishBadge on={tr.published} />
                <button className={t.iconBtn} disabled={swapping || ti === 0} onClick={() => swap('tracks', tr, tracks[ti - 1])} title="Yukarı" aria-label={`${tr.title}: yukarı taşı`}><Icon name="arrowUp" size={14} /></button>
                <button className={t.iconBtn} disabled={swapping || ti === tracks.length - 1} onClick={() => swap('tracks', tr, tracks[ti + 1])} title="Aşağı" aria-label={`${tr.title}: aşağı taşı`}><Icon name="arrowDown" size={14} /></button>
                <button className={t.iconBtn} onClick={() => setEditTrack(tr)} title="Düzenle" aria-label={`${tr.title}: düzenle`}><Icon name="edit" size={14} /></button>
              </div>
            }>
            <div className={t.listGroup}>
              {mods.map((m, mi) => (
                // Telefonda modül adı tam satırı alır, rozet ve oklar alt satıra iner
                // (360-390 px'te ad 1-2 harfe iniyordu).
                <div key={m.id} className={`${t.listRow} cursor-default flex-wrap gap-y-2`}>
                  <Link to={`/icerik/modul/${m.id}`} className="flex-1 min-w-[min(100%,14rem)] flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-panel-3 border border-line text-[12px] font-semibold flex items-center justify-center tnum shrink-0">{mi + 1}</span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium line-clamp-2 break-words">{m.title}</div>
                      <div className="text-[12px] text-fg-3">
                        {lessons.filter((l) => l.moduleId === m.id).length} ders · {qCounts.data?.[m.id] ?? m.questionCount ?? 0} soru · geçme notu {m.passScore}
                        {m.prerequisiteId ? ' · Kilitli' : ''}
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    <PublishBadge on={m.published} />
                    <button className={t.iconBtn} disabled={swapping || mi === 0} onClick={() => swap('modules', m, mods[mi - 1])} aria-label={`${m.title}: yukarı taşı`}><Icon name="arrowUp" size={14} /></button>
                    <button className={t.iconBtn} disabled={swapping || mi === mods.length - 1} onClick={() => swap('modules', m, mods[mi + 1])} aria-label={`${m.title}: aşağı taşı`}><Icon name="arrowDown" size={14} /></button>
                    <Link to={`/icerik/modul/${m.id}`} className={t.iconBtn} aria-label={`${m.title}: aç`}><Icon name="chevronRight" size={14} /></Link>
                  </div>
                </div>
              ))}
              <button className={`${t.listRow} text-fg-2`} onClick={() => setEditModule({ trackId: tr.id })}>
                <Icon name="plus" size={16} /> <span className="text-[13px] font-medium">Modül ekle</span>
              </button>
            </div>
          </Section>
        );
      })}

      <TrackSheet value={editTrack} onClose={() => setEditTrack(null)} nextOrder={tracks.length ? Math.max(...tracks.map((x) => x.order)) + 1 : 1} />
      <ModuleSheet value={editModule} onClose={() => setEditModule(null)} />
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Müfredat güncelleme: uygulamaya gömülü müfredatı Firestore'a yazar   */
/* ------------------------------------------------------------------ */

const COL_LABELS: Record<string, string> = {
  tracks: 'Eğitim yolu', modules: 'Modül', lessons: 'Ders', questions: 'Soru'
};

const CurriculumSyncSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [plan, setPlan] = useState<PublishPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) { if (!applying) { setPlan(null); setErr(''); setProgress(null); } return; }
    if (applying) return;
    let alive = true;
    setBusy(true);
    (async () => {
      try {
        const file = await loadCurriculumFile();
        const p = await planCurriculum(file);
        if (alive) setPlan(p);
      } catch (e) {
        if (alive) setErr(errorText(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const apply = async () => {
    setApplying(true);
    setBusy(true);
    setErr('');
    try {
      const file = await loadCurriculumFile();
      // Planın okuduğu veri yeniden okunmaz; yalnızca değişen belgeler yazılır.
      const res = await publishCurriculum(file, setProgress, plan);
      toast(`Müfredat güncellendi: ${res.written} belge yazıldı, ${res.removed} belge silindi`, 'positive');
      onClose();
      setPlan(null);
    } catch (e) {
      setErr(errorText(e));
      toast('Müfredat güncellemesi yarıda kaldı. Pencereyi yeniden açıp tekrar uygula.', 'negative');
    } finally {
      setBusy(false);
      setApplying(false);
      setProgress(null);
    }
  };

  /**
   * Hesaplanırken kapatılabilir (okuma iptal olur). Yazarken de kapatılabilir:
   * güncelleme arka planda sürer, bitince bildirim çıkar (çevrimdışıyken
   * pencere sonsuza kadar açık kalıyordu).
   */
  const close = () => {
    if (applying && !confirm('Güncelleme arka planda sürecek; bu sekmeyi kapatma. Bitince bildirim çıkar. Pencere kapansın mı?')) return;
    onClose();
  };

  const pct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0;
  const removeOf = (c: keyof PublishPlan['counts']) => plan?.counts[c].remove || 0;
  const totalRemove = plan ? Object.values(plan.counts).reduce((s, c) => s + c.remove, 0) : 0;
  const kept = plan ? Object.values(plan.counts).reduce((s, c) => s + c.kept, 0) : 0;

  return (
    <Sheet open={open} title="Müfredatı güncelle" onClose={close}
      footer={
        <>
          <button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={close}>{applying ? 'Kapat' : 'Vazgeç'}</button>
          <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={apply} disabled={busy || !plan || plan.totalWrites === 0}>
            {applying ? 'Yükleniyor…' : plan && plan.totalWrites === 0 ? 'Değişiklik yok' : 'Uygula'}
          </button>
        </>
      }>
      <p className="text-[13px] text-fg-2 leading-relaxed">
        Uygulamanın içindeki hazır müfredatı veritabanına yazar. Yalnızca değişen belgeler yazılır;
        müfredat dosyasından çıkmış dersler, modüller ve sorular silinir. <strong className="text-crema">Panelde eklediğin
        içerik korunur</strong> (Dosyadan ders, Ders ekle, Yeni ürün, yeni soru, yeni modül ve yol). Soru fotoğrafları,
        yayın/taslak durumları ve <strong className="text-crema">elle düzelttiğin reçete ölçüleri</strong> de korunur,
        ancak <strong className="text-crema">müfredattan gelen ders metinlerinde elle yaptığın değişiklikler üzerine yazılır</strong>.
      </p>

      {busy && !progress && <div className="flex justify-center py-4"><Spinner /></div>}

      {progress && (
        <div className={t.field}>
          <div className="flex justify-between text-[12px] text-fg-2">
            <span>{progress.label}</span><span className="tnum">%{pct}</span>
          </div>
          <div className="h-1.5 rounded-full bg-panel-3 overflow-hidden">
            <div className="h-full bg-crema transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {plan && !progress && (
        <>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{plan.season} sezonu</Badge>
            <span className="text-[12px] text-fg-3 tnum">{plan.version}</span>
          </div>

          <div className={t.listGroup}>
            {Object.entries(plan.counts).map(([col, c]) => (
              <div key={col} className={`${t.listRow} cursor-default`}>
                <div className="flex-1 text-[13px] font-medium">{COL_LABELS[col] || col}</div>
                <div className="flex gap-1.5 flex-wrap justify-end">
                  {c.add > 0 && <Badge tone="positive">+{c.add} yeni</Badge>}
                  {c.update > 0 && <Badge tone="neutral">{c.update} değişecek</Badge>}
                  {c.remove > 0 && <Badge tone="negative">−{c.remove} silinecek</Badge>}
                  {c.add + c.update + c.remove === 0 && <span className="text-[12px] text-fg-3">değişiklik yok</span>}
                </div>
              </div>
            ))}
          </div>

          {totalRemove > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-negative-line bg-negative-bg p-3">
              <span className="text-[13px] font-semibold text-negative">
                Silinecek: {[removeOf('tracks') && `${removeOf('tracks')} eğitim yolu`, removeOf('modules') && `${removeOf('modules')} modül`,
                  removeOf('lessons') && `${removeOf('lessons')} ders`, plan.removedQuestions && `${plan.removedQuestions} soru`].filter(Boolean).join(', ')}
              </span>
              {plan.removedTitles.length > 0 && <div className="text-[12px] text-fg-2 leading-relaxed">{plan.removedTitles.join(' · ')}</div>}
              <span className="text-[11.5px] text-fg-3">Silinen derse bağlı görevler "Geçersiz" olur.</span>
            </div>
          )}
          {kept > 0 && <p className="text-[12px] text-fg-3">Panelde eklenen {kept} kayıt dosyada yok; korunacak.</p>}
        </>
      )}

      <ErrorText>{err}</ErrorText>
    </Sheet>
  );
};

export const TrackSheet: React.FC<{ value: Partial<Track> | null; onClose: () => void; nextOrder: number; proposalId?: string | null }> = ({ value, onClose, nextOrder, proposalId }) => {
  const [f, setF] = useState<Partial<Track>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(value ? { icon: 'book', published: false, ...value } : {}); setError(null); }, [value]);
  const save = async () => {
    // Başlıksız kayıt hiçbir şey söylemeden duruyordu.
    if (!f.title?.trim()) return setError('Başlık yaz.');
    const data = { title: f.title.trim(), description: f.description?.trim() || '', icon: f.icon || 'book', published: !!f.published };
    setBusy(true);
    // kaynak 'panel': panelde açılan yol "Müfredatı güncelle"de silinmez.
    await saveChange(() => commitChange(
      [f.id ? { op: 'update', col: 'tracks', id: f.id, data } : { op: 'set', col: 'tracks', id: newId('tracks'), data: { ...data, order: f.order ?? nextOrder, kaynak: 'panel' } }],
      { kind: 'track', title: data.title, summary: f.id ? 'Eğitim yolu düzenlendi' : 'Yeni eğitim yolu' }, proposalId), 'Kaydedildi', onClose, setError);
    setBusy(false);
  };
  const remove = async () => {
    if (!f.id || !confirm('Eğitim yolu silinsin mi? İçindeki modüller silinmez ama baristalara görünmez olur.')) return;
    setBusy(true);
    await saveChange(() => commitChange([{ op: 'delete', col: 'tracks', id: f.id! }], { kind: 'track', title: f.title || 'Eğitim yolu', summary: 'Silme' }, proposalId), 'Silindi', onClose, setError);
    setBusy(false);
  };
  return (
    <Sheet open={!!value} title={f.id ? 'Eğitim yolunu düzenle' : 'Yeni eğitim yolu'} onClose={onClose}
      footer={<>{f.id && <button className={`${t.btn} ${t.btnDanger} ${t.btnMd} mr-auto`} disabled={busy} onClick={remove}>Sil</button>}<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} disabled={busy} onClick={save}>{busy ? <Spinner size={14} /> : 'Kaydet'}</button></>}>
      <label className={t.field}><span className={t.label}>Başlık</span><input className={t.input} value={f.title || ''} maxLength={MAX.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label className={t.field}><span className={t.label}>Açıklama</span><textarea className={t.textarea} value={f.description || ''} maxLength={MAX.text} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <div className={t.field}><span className={t.label}>İkon</span>
        <div className="flex flex-wrap gap-2">
          {TRACK_ICONS.map((ic) => (
            <button key={ic} onClick={() => setF({ ...f, icon: ic })} aria-label={`İkon: ${ICON_LABEL[ic] || ic}`} aria-pressed={f.icon === ic} className={`w-10 h-10 rounded-lg border flex items-center justify-center ${f.icon === ic ? 'border-crema bg-panel-3' : 'border-line bg-panel'}`}><Icon name={ic} size={18} /></button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={!!f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Baristalara yayınla</label>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};

export const ModuleSheet: React.FC<{ value: Partial<Module> | null; onClose: () => void; proposalId?: string | null }> = ({ value, onClose, proposalId }) => {
  const { modules, tracks } = useContent();
  const [f, setF] = useState<Partial<Module>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(value ? { passScore: 80, examSize: 10, published: false, prerequisiteId: null, ...value } : {}); setError(null); }, [value]);
  const siblings = modules.filter((m) => m.id !== f.id);
  const save = async () => {
    if (!f.title?.trim()) return setError('Başlık yaz.');
    if (!f.trackId) return setError('Eğitim yolu seç.');
    const data = {
      title: f.title.trim(), description: f.description?.trim() || '', trackId: f.trackId,
      passScore: Math.min(100, Math.max(1, Number(f.passScore) || 80)),
      examSize: Math.min(50, Math.max(1, Number(f.examSize) || 10)),
      prerequisiteId: f.prerequisiteId || null, published: !!f.published
    };
    const inTrack = modules.filter((m) => m.trackId === f.trackId);
    setBusy(true);
    // kaynak 'panel': panelde açılan modül "Müfredatı güncelle"de silinmez.
    await saveChange(() => commitChange(
      [f.id ? { op: 'update', col: 'modules', id: f.id, data }
        : { op: 'set', col: 'modules', id: newId('modules'), data: { ...data, order: f.order ?? (inTrack.length ? Math.max(...inTrack.map((m) => m.order)) + 1 : 1), questionCount: 0, kaynak: 'panel' } }],
      { kind: 'module', title: data.title, summary: f.id ? 'Modül ayarları değişti' : 'Yeni modül' }, proposalId), 'Kaydedildi', onClose, setError);
    setBusy(false);
  };
  return (
    <Sheet open={!!value} title={f.id ? 'Modül ayarları' : 'Yeni modül'} onClose={onClose}
      footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} disabled={busy} onClick={save}>{busy ? <Spinner size={14} /> : 'Kaydet'}</button>}>
      <label className={t.field}><span className={t.label}>Başlık</span><input className={t.input} value={f.title || ''} maxLength={MAX.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label className={t.field}><span className={t.label}>Açıklama</span><textarea className={t.textarea} value={f.description || ''} maxLength={MAX.text} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label className={t.field}><span className={t.label}>Eğitim yolu</span>
        <select className={t.input} value={f.trackId || ''} onChange={(e) => setF({ ...f, trackId: e.target.value })}>
          {tracks.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={t.field}><span className={t.label}>Geçme notu (100 üzerinden)</span><input type="number" className={t.input} value={f.passScore ?? 80} onChange={(e) => setF({ ...f, passScore: Number(e.target.value) })} /></label>
        <label className={t.field}><span className={t.label}>Sınavdaki soru sayısı</span><input type="number" className={t.input} value={f.examSize ?? 10} onChange={(e) => setF({ ...f, examSize: Number(e.target.value) })} /></label>
      </div>
      <label className={t.field}><span className={t.label}>Önce geçilmesi gereken modül</span>
        <select className={t.input} value={f.prerequisiteId || ''} onChange={(e) => setF({ ...f, prerequisiteId: e.target.value || null })}>
          <option value="">Yok — her zaman açık</option>
          {siblings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={!!f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Baristalara yayınla</label>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ */
/* Modül editörü: dersler + soru bankası                               */
/* ------------------------------------------------------------------ */

export const ModuleEditorPage: React.FC = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { modules, lessons, tracks } = useContent();
  const mod = modules.find((m) => m.id === moduleId);
  const { data: questions } = useQueryLive<Question>(moduleId ? query(collection(db, 'questions'), where('moduleId', '==', moduleId)) : null, `q-${moduleId}`);
  const [moduleParams] = useSearchParams();
  const [tab, setTab] = useState<'lessons' | 'questions'>(moduleParams.get('sekme') === 'sorular' ? 'questions' : 'lessons');
  const [editModule, setEditModule] = useState<Partial<Module> | null>(null);
  const [editQ, setEditQ] = useState<Partial<Question> | null>(null);
  const [importing, setImporting] = useState(false);
  const { busy: swapping, swap } = useSwap();

  if (!mod) return <Page wide><PageTitle title="Modül bulunamadı" back="/icerik" /></Page>;
  const ls = lessons.filter((l) => l.moduleId === mod.id);

  const addLesson = async () => {
    const id = newId('lessons');
    try {
      // kaynak 'panel': panelde eklenen ders "Müfredatı güncelle"de silinmez.
      const r = await commitChange([{ op: 'set', col: 'lessons', id, data: {
        moduleId: mod.id, title: 'Yeni ders', order: ls.length ? Math.max(...ls.map((l) => l.order)) + 1 : 1,
        durationMin: 3, blocks: [{ type: 'text', text: '' }], published: false, kaynak: 'panel'
      } }], { kind: 'lesson', title: 'Yeni ders', summary: `Yeni ders · ${mod.title}` });
      navigate(r === 'applied' ? `/icerik/ders/${id}` : `/icerik/ders/${id}?oneri=${lastProposalId}`);
    } catch (e) { toast(errorText(e), 'negative'); }
  };

  return (
    <Page wide>
      <PageTitle title={mod.title} subtitle={`${tracks.find((x) => x.id === mod.trackId)?.title || ''} · geçme notu ${mod.passScore} · sınavda ${mod.examSize} soru`} back="/icerik"
        action={<button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setEditModule(mod)}><Icon name="sliders" size={15} /> Ayarlar</button>} />

      <div className="flex items-center gap-2">
        <div className={t.segment}>
          <button className={`${t.segmentItem} ${tab === 'lessons' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('lessons')}>Dersler · {ls.length}</button>
          <button className={`${t.segmentItem} ${tab === 'questions' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setTab('questions')}>Soru bankası · {questions.length}</button>
        </div>
        <PublishBadge on={mod.published} />
      </div>

      {tab === 'lessons' ? (
        <div className={t.listGroup}>
          {ls.map((l, i) => (
            <div key={l.id} className={`${t.listRow} cursor-default flex-wrap gap-y-2`}>
              <Link to={`/icerik/ders/${l.id}`} className="flex-1 min-w-[min(100%,14rem)] flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-panel-3 border border-line text-[12px] font-semibold flex items-center justify-center tnum shrink-0">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-[14px] font-medium line-clamp-2 break-words">{l.title}</div>
                  <div className="text-[12px] text-fg-3">{l.blocks?.length || 0} blok · {l.durationMin} dk</div>
                </div>
              </Link>
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                <PublishBadge on={l.published} />
                <button className={t.iconBtn} disabled={swapping || i === 0} onClick={() => swap('lessons', l, ls[i - 1])} aria-label={`${l.title}: yukarı taşı`}><Icon name="arrowUp" size={14} /></button>
                <button className={t.iconBtn} disabled={swapping || i === ls.length - 1} onClick={() => swap('lessons', l, ls[i + 1])} aria-label={`${l.title}: aşağı taşı`}><Icon name="arrowDown" size={14} /></button>
              </div>
            </div>
          ))}
          <button className={`${t.listRow} text-fg-2`} onClick={addLesson}><Icon name="plus" size={16} /> <span className="text-[13px] font-medium">Ders ekle</span></button>
          <button className={`${t.listRow} text-fg-2`} onClick={() => setImporting(true)}>
            <Icon name="upload" size={16} />
            <span className="text-[13px] font-medium">Dosyadan ders ekle</span>
            <span className="text-[12px] text-fg-3 ml-auto">Excel · CSV · PDF</span>
          </button>
        </div>
      ) : (
        <>
          {questions.length < mod.examSize && (
            <div className="flex gap-3 p-4 rounded-xl bg-caution-bg border border-caution-line text-[13px]">
              <Icon name="alert" size={18} className="text-caution" />
              <span>Sınavda {mod.examSize} soru sorulacak ama bankada {questions.length} soru var. Tekrarlarda aynı soruların gelmemesi için en az {mod.examSize * 2} soru önerilir.</span>
            </div>
          )}
          <div className={t.listGroup}>
            {questions.map((q, i) => (
              <button key={q.id} className={`${t.listRow} items-start`} onClick={() => setEditQ(q)}>
                <span className="text-[12px] text-fg-3 tnum w-6 pt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium leading-snug">{q.prompt}</div>
                  <div className="text-[12px] text-positive mt-1">✓ {q.options[q.answer]}</div>
                </div>
                <Icon name="edit" size={14} className="text-fg-3 mt-1" />
              </button>
            ))}
            <button className={`${t.listRow} text-fg-2`} onClick={() => setEditQ({ moduleId: mod.id, type: 'single', options: ['', '', '', ''], answer: 0 })}>
              <Icon name="plus" size={16} /> <span className="text-[13px] font-medium">Soru ekle</span>
            </button>
          </div>
        </>
      )}

      <ModuleSheet value={editModule} onClose={() => setEditModule(null)} />
      <QuestionSheet value={editQ} onClose={() => setEditQ(null)} />
      <ImportLessonSheet
        open={importing}
        onClose={() => setImporting(false)}
        fixedModuleId={mod.id}
        onCreated={(id, proposalId, { count }) => { setImporting(false); if (proposalId) navigate(`/icerik/ders/${id}?oneri=${proposalId}`); else if (count === 1) navigate(`/icerik/ders/${id}`); }}
      />
    </Page>
  );
};

export const QuestionSheet: React.FC<{ value: Partial<Question> | null; onClose: () => void; proposalId?: string | null }> = ({ value, onClose, proposalId }) => {
  const [f, setF] = useState<Partial<Question>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(value || {}); setError(null); }, [value]);
  const opts = f.options || [];
  const setType = (type: Question['type']) =>
    setF({ ...f, type, options: type === 'truefalse' ? ['Doğru', 'Yanlış'] : opts.length >= 3 ? opts : ['', '', '', ''], answer: 0 });

  const save = async () => {
    const options = opts.map((o) => o.trim()).filter(Boolean);
    if (!f.prompt?.trim()) return setError('Soru metni boş.');
    if (options.length < 2) return setError('En az iki seçenek gerekli.');
    const answerText = opts[f.answer ?? 0]?.trim();
    const answer = options.indexOf(answerText);
    if (answer < 0) return setError('Doğru cevap boş bir seçenek olamaz.');
    // edited: müfredat güncellemesi bu düzeltmeyi ezmez. kaynak 'panel': panelde
    // eklenen yeni soru güncellemede silinmez.
    const data = { moduleId: f.moduleId!, type: f.type || 'single', prompt: f.prompt.trim(), options, answer, explanation: f.explanation?.trim() || '', imageUrl: f.imageUrl || '', ...(f.kind ? { kind: f.kind } : {}),
      ...(f.lessonId ? { lessonId: f.lessonId } : {}), ...(f.id ? { edited: true } : { kaynak: 'panel' }) };
    setBusy(true);
    await saveChange(() => commitChange(
      [f.id ? { op: 'update', col: 'questions', id: f.id, data } : { op: 'set', col: 'questions', id: newId('questions'), data }],
      { kind: 'question', title: data.prompt.slice(0, 90), summary: f.id ? 'Soru düzenlendi' : 'Yeni soru' }, proposalId), 'Soru kaydedildi', onClose, setError);
    setBusy(false);
  };
  const remove = async () => {
    if (!f.id || !confirm('Soru silinsin mi?')) return;
    setBusy(true);
    // moduleId: silmenin yetki alanı denetimi için (silmede belgeye yazılmaz).
    await saveChange(() => commitChange([{ op: 'delete', col: 'questions', id: f.id!, data: { moduleId: f.moduleId } }], { kind: 'question', title: (f.prompt || '').slice(0, 90), summary: 'Soru silme' }, proposalId), 'Silindi', onClose, setError);
    setBusy(false);
  };

  return (
    <Sheet open={!!value} title={f.id ? 'Soruyu düzenle' : 'Yeni soru'} onClose={onClose}
      footer={<>{f.id && <button className={`${t.btn} ${t.btnDanger} ${t.btnMd} mr-auto`} disabled={busy} onClick={remove}>Sil</button>}<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} disabled={busy} onClick={save}>{busy ? <Spinner size={14} /> : 'Kaydet'}</button></>}>
      <div className={t.segment}>
        <button className={`${t.segmentItem} ${f.type !== 'truefalse' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setType('single')}>Çoktan seçmeli</button>
        <button className={`${t.segmentItem} ${f.type === 'truefalse' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setType('truefalse')}>Doğru / Yanlış</button>
      </div>
      <label className={t.field}><span className={t.label}>Soru</span><textarea className={t.textarea} value={f.prompt || ''} onChange={(e) => setF({ ...f, prompt: e.target.value })} /></label>
      <div className={t.field}>
        <span className={t.label}>Seçenekler — doğru olanı işaretle</span>
        {opts.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <button onClick={() => setF({ ...f, answer: i })} aria-label={`Doğru cevap: ${String.fromCharCode(65 + i)}`} aria-pressed={f.answer === i} className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${f.answer === i ? 'bg-positive-bg border-positive-line text-positive' : 'border-line text-fg-4'}`}>
              <Icon name="check" size={14} strokeWidth={2.2} />
            </button>
            <input className={t.input} value={o} disabled={f.type === 'truefalse'} onChange={(e) => { const n = [...opts]; n[i] = e.target.value; setF({ ...f, options: n }); }} placeholder={`Seçenek ${String.fromCharCode(65 + i)}`} />
            {f.type !== 'truefalse' && opts.length > 2 && (
              <button className={t.iconBtn} aria-label="Seçeneği sil" onClick={() => { const n = opts.filter((_, j) => j !== i); setF({ ...f, options: n, answer: Math.min(f.answer ?? 0, n.length - 1) }); }}><Icon name="minus" size={14} /></button>
            )}
          </div>
        ))}
        {f.type !== 'truefalse' && opts.length < 6 && (
          <button className={`${t.btn} ${t.btnGhost} ${t.btnSm} self-start`} onClick={() => setF({ ...f, options: [...opts, ''] })}><Icon name="plus" size={14} /> Seçenek</button>
        )}
      </div>
      <label className={t.field}><span className={t.label}>Açıklama (yanlış yapınca gösterilir)</span><textarea className={t.textarea} value={f.explanation || ''} onChange={(e) => setF({ ...f, explanation: e.target.value })} /></label>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ */
/* Ders editörü                                                        */
/* ------------------------------------------------------------------ */

const BLOCK_TYPES: { type: LessonBlock['type']; label: string; icon: IconName }[] = [
  { type: 'heading', label: 'Başlık', icon: 'list' },
  { type: 'text', label: 'Metin', icon: 'book' },
  { type: 'image', label: 'Fotoğraf', icon: 'image' },
  { type: 'video', label: 'Video', icon: 'video' },
  { type: 'steps', label: 'Adımlar', icon: 'list' },
  { type: 'spec', label: 'Standart tablosu', icon: 'sliders' },
  { type: 'tip', label: 'İpucu', icon: 'info' },
  { type: 'warning', label: 'Uyarı', icon: 'alert' },
  { type: 'check', label: 'Alıştırma sorusu', icon: 'target' }
];

function emptyBlock(type: LessonBlock['type']): LessonBlock {
  switch (type) {
    case 'image': case 'video': return { type, url: '', caption: '' };
    case 'steps': return { type, items: [''] };
    case 'spec': return { type, rows: [{ label: '', value: '' }] };
    case 'check': return { type, prompt: '', options: ['', ''], answer: 0, explanation: '' };
    default: return { type, text: '' } as LessonBlock;
  }
}

export const LessonEditorPage: React.FC = () => {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const me = useStaffSession();
  const [params, setParams] = useSearchParams();
  const proposalId = params.get('oneri');
  const { data: proposal, loading: pLoading } = useDocLive<Proposal>(proposalId ? `proposals/${proposalId}` : null);
  const { lessons, modules } = useContent();
  const published = lessons.find((l) => l.id === lessonId);
  // Öneriden açıldıysa ders, önerideki hâliyle düzenlenir (yeni dersse
  // yayında hiç yoktur).
  const lesson = useMemo<Lesson | undefined>(() => {
    const op = proposal?.ops.find((o) => o.col === 'lessons' && o.id === lessonId && o.op !== 'delete');
    if (op) return { ...(published || {}), ...(op.data || {}), id: lessonId! } as Lesson;
    return published;
  }, [proposal, published, lessonId]);
  const [draft, setDraft] = useState<Lesson | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Kaydedilmemiş düzenleme geri okuna/geri tuşuna/menüye dokununca uyarısız gidiyordu.
  useUnsavedGuard(dirty && !saving);

  // Açılıştaki sürüm: kaydederken ders o andan beri değiştiyse (başkası kaydetti,
  // müfredat güncellendi) sessizce ezilmez (B17).
  const [base, setBase] = useState<number | null>(null);
  useEffect(() => {
    if (lesson && !dirty) { setDraft(lesson); setBase(verOf(published as unknown as Record<string, unknown> | undefined)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, dirty]);
  if (proposalId && pLoading) return <Page wide><Spinner /></Page>;
  if (!lesson || !draft) return <Page wide><PageTitle title="Ders bulunamadı" back="/icerik" /></Page>;
  const mod = modules.find((m) => m.id === lesson.moduleId);
  const publisher = canPublishNow({ op: 'set', col: 'lessons', id: lesson.id, data: { moduleId: lesson.moduleId } });
  // Başkasının önerisini yalnızca "Önerileri onayla" yetkisi olan yayınlar
  // (içerik yetkisi açık, onay yetkisi kapalı olan kişide ders yayınlanıp
  // öneri "bekliyor" kalıyordu).
  const approver = allowed(me.role, 'oneriOnay');
  const ownProposal = !!proposal && proposal.createdBy === me.uid;
  // Bekleyen öneri üzerinde: müdür onaylayarak, öneri sahibi güncelleyerek çalışır.
  const livePid = proposal && proposal.status === 'pending' && ((publisher && approver) || ownProposal) ? proposal.id : null;
  const saveLabel = publisher ? (livePid ? (ownProposal ? 'Yayınla' : 'Onayla ve yayınla') : 'Kaydet') : livePid ? 'Öneriyi güncelle' : 'Onaya gönder';
  const remoteChanged = dirty && !!published && base !== null && verOf(published as unknown as Record<string, unknown>) !== base;

  const patch = (p: Partial<Lesson>) => { setDraft({ ...draft, ...p }); setDirty(true); };
  const setBlock = (i: number, b: LessonBlock) => patch({ blocks: draft.blocks.map((x, j) => (j === i ? b : x)) });
  const move = (i: number, d: -1 | 1) => {
    const n = [...draft.blocks];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    patch({ blocks: n });
  };

  const save = async (force = false) => {
    setSaving(true);
    const { id, ...rest } = draft;
    const data = { ...rest, title: rest.title.trim() || 'Adsız ders', durationMin: Number(rest.durationMin) || 1 };
    try {
      // Öneri dersle birlikte soru da taşıyorsa onları koru, yalnızca dersi değiştir.
      const mine = { op: 'set' as const, col: 'lessons' as const, id, data };
      const others = livePid && proposal ? proposal.ops.filter((o) => !(o.col === 'lessons' && o.id === id)) : [];
      const r = await commitChange([mine, ...others],
        { kind: 'lesson', title: data.title, summary: `${published ? 'Ders düzenlendi' : 'Yeni ders'} · ${mod?.title || ''}` }, livePid,
        { base: { [versionKey('lessons', id)]: base }, force });
      setDirty(false);
      toast(resultText(r, 'Ders kaydedildi'), 'positive');
      if (r === 'proposed' && !livePid && lastProposalId) setParams({ oneri: lastProposalId }, { replace: true });
      if (r === 'applied' && proposalId) navigate(`/icerik/ders/${id}`, { replace: true });
    } catch (e) {
      if (e instanceof StaleError) {
        setSaving(false);
        const text = proposal && livePid && !ownProposal
          ? 'Bu ders öneriden sonra değişti. Öneriyi yayınlarsan sonraki değişiklikler gider. Farkı "Bekleyen onaylar → Ne değişiyor"da görebilirsin.\n\nYine de yayınlansın mı?'
          : 'Bu ders sen düzenlerken başka biri tarafından kaydedildi. Kaydedersen onun değişiklikleri gider.\n\nYine de kaydedilsin mi? (Vazgeçersen "Son hâlini yükle" ile güncel hâli açabilirsin.)';
        if (confirm(text)) return save(true);
        return;
      }
      toast(errorText(e), 'negative');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(publisher ? 'Ders silinsin mi?' : 'Dersin silinmesi onaya gönderilsin mi?')) return;
    try {
      const r = await commitChange([{ op: 'delete', col: 'lessons', id: draft.id }], { kind: 'lesson', title: draft.title, summary: 'Ders silme' });
      toast(resultText(r, 'Ders silindi'));
      navigate(`/icerik/modul/${lesson.moduleId}`);
    } catch (e) { toast(errorText(e), 'negative'); }
  };

  return (
    <Page wide>
      <PageTitle title={draft.title || 'Ders'} subtitle={mod?.title} back={`/icerik/modul/${lesson.moduleId}`}
        action={
          <div className="flex gap-2">
            <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setPreview(!preview)}><Icon name={preview ? 'edit' : 'phone'} size={15} /> {preview ? 'Düzenle' : 'Önizle'}</button>
            <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => save()} disabled={(!dirty && !(publisher && livePid)) || saving}>{saving ? <Spinner size={14} /> : dirty || (publisher && livePid) ? saveLabel : 'Kaydedildi'}</button>
          </div>
        } />

      {remoteChanged && (
        <div className="flex flex-wrap gap-3 p-4 rounded-xl border text-[13px] bg-caution-bg border-caution-line items-center">
          <Icon name="alert" size={18} className="text-caution shrink-0" />
          <span className="leading-relaxed flex-1 min-w-[200px]">Bu ders sen düzenlerken başka biri tarafından kaydedildi. Kaydedersen onun değişiklikleri gider.</span>
          <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => confirm('Yaptığın değişiklikler silinip dersin son hâli açılsın mı?') && setDirty(false)}>Son hâlini yükle</button>
        </div>
      )}

      {proposal && (
        <div className={`flex gap-3 p-4 rounded-xl border text-[13px] ${proposal.status === 'pending' ? 'bg-caution-bg border-caution-line' : 'bg-panel border-line'}`}>
          <Icon name="clipboard" size={18} className="text-caution shrink-0" />
          <span className="leading-relaxed">
            {proposal.status === 'pending'
              ? livePid && publisher && !ownProposal
                ? <>{proposal.createdByName ? <><strong>{proposal.createdByName}</strong> bu dersi öneriyor.</> : 'Bu ders için bir öneri var.'} İstediğin yeri düzeltip “Onayla ve yayınla” de; baristalar yalnızca yayınlanan hâlini görür.</>
                : <>Bu ders onay bekliyor. Yetkili yönetici yayınlayana kadar baristalar eski hâlini görür.</>
              : proposal.status === 'approved' ? <>Bu öneri {proposal.reviewedByName ? `${proposal.reviewedByName} tarafından ` : ''}yayınlandı.</>
              : proposal.status === 'rejected' ? <>Bu öneri reddedildi{proposal.reviewNote ? `: “${proposal.reviewNote}”` : '.'} Düzenleyip yeniden gönderebilirsin.</>
              : <>Bu öneri geri çekildi.</>}
          </span>
        </div>
      )}

      {preview ? (
        <div className="max-w-[420px] w-full mx-auto rounded-[28px] border border-line-2 bg-espresso p-5 flex flex-col gap-5">
          <h1 className="text-[24px] font-bold leading-tight">{draft.title}</h1>
          <LessonBlocks blocks={draft.blocks} />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_240px] gap-5 items-start">
          <div className="flex flex-col gap-3">
            {draft.blocks.map((b, i) => (
              <div key={i} className={`${t.card} p-3 flex flex-col gap-2.5`}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-3 flex-1">{BLOCK_TYPES.find((x) => x.type === b.type)?.label}</span>
                  <button className={t.iconBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Bloğu yukarı taşı"><Icon name="arrowUp" size={13} /></button>
                  <button className={t.iconBtn} disabled={i === draft.blocks.length - 1} onClick={() => move(i, 1)} aria-label="Bloğu aşağı taşı"><Icon name="arrowDown" size={13} /></button>
                  <button className={t.iconBtn} aria-label="Bloğu sil" onClick={() => confirm('Bu blok silinsin mi?') && patch({ blocks: draft.blocks.filter((_, j) => j !== i) })}><Icon name="trash" size={13} /></button>
                </div>
                <BlockEditor block={b} onChange={(nb) => setBlock(i, nb)} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              {BLOCK_TYPES.map((bt) => (
                <button key={bt.type} className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} onClick={() => patch({ blocks: [...draft.blocks, emptyBlock(bt.type)] })}>
                  <Icon name={bt.icon} size={13} /> {bt.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`${t.card} p-4 flex flex-col gap-3 lg:sticky lg:top-4`}>
            <label className={t.field}><span className={t.label}>Ders başlığı</span><input className={t.input} value={draft.title} maxLength={MAX.title} onChange={(e) => patch({ title: e.target.value })} /></label>
            <label className={t.field}><span className={t.label}>Süre (dk)</span><input type="number" className={t.input} value={draft.durationMin} onChange={(e) => patch({ durationMin: Number(e.target.value) })} /></label>
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={draft.published} onChange={(e) => patch({ published: e.target.checked })} /> Yayında</label>
            <button className={`${t.btn} ${t.btnDanger} ${t.btnSm}`} onClick={remove}>Dersi sil</button>
          </div>
        </div>
      )}
    </Page>
  );
};

/**
 * Storage yok (Spark planı): görseller küçültülüp doğrudan ders belgesine
 * gömülür. Video için bu mümkün değil — yalnızca dış bağlantı (YouTube vb.)
 * eklenebilir.
 */
export const BlockEditor: React.FC<{ block: LessonBlock; onChange: (b: LessonBlock) => void }> = ({ block: b, onChange }) => {
  switch (b.type) {
    case 'heading':
      return <input className={t.input} value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} placeholder="Bölüm başlığı" />;
    case 'text': case 'tip': case 'warning':
      return (
        <>
          <textarea className={`${t.textarea} min-h-28`} value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} />
          {b.type === 'text' && <span className="text-[11px] text-fg-3">**kalın** yazmak için iki yıldız; madde için satıra "- " ile başla.</span>}
        </>
      );
    case 'image': case 'video':
      return (
        <>
          <MediaInput url={b.url} kind={b.type} onChange={(url) => onChange({ ...b, url })} />
          <input className={t.input} value={b.caption || ''} onChange={(e) => onChange({ ...b, caption: e.target.value })} placeholder="Alt yazı (isteğe bağlı)" />
        </>
      );
    case 'steps':
      return (
        <div className="flex flex-col gap-2">
          {b.items.map((it, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-[12px] text-fg-3 tnum w-5">{i + 1}.</span>
              <input className={t.input} value={it} onChange={(e) => onChange({ ...b, items: b.items.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button className={t.iconBtn} aria-label="Maddeyi sil" onClick={() => onChange({ ...b, items: b.items.filter((_, j) => j !== i) })}><Icon name="minus" size={13} /></button>
            </div>
          ))}
          <button className={`${t.btn} ${t.btnGhost} ${t.btnSm} self-start`} onClick={() => onChange({ ...b, items: [...b.items, ''] })}><Icon name="plus" size={13} /> Adım</button>
        </div>
      );
    case 'spec':
      return (
        <div className="flex flex-col gap-2">
          {b.rows.map((r, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input className={t.input} value={r.label} placeholder="Ör. Espresso" onChange={(e) => onChange({ ...b, rows: b.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <input className={t.input} value={r.value} placeholder="Ör. 2 shot (36 ml)" onChange={(e) => onChange({ ...b, rows: b.rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
              <button className={t.iconBtn} aria-label="Satırı sil" onClick={() => onChange({ ...b, rows: b.rows.filter((_, j) => j !== i) })}><Icon name="minus" size={13} /></button>
            </div>
          ))}
          <button className={`${t.btn} ${t.btnGhost} ${t.btnSm} self-start`} onClick={() => onChange({ ...b, rows: [...b.rows, { label: '', value: '' }] })}><Icon name="plus" size={13} /> Satır</button>
        </div>
      );
    case 'cup': {
      // Ölçüler reçete dosyasından üretiliyor ama burada düzeltilebiliyor.
      // Bir satıra dokunulduğu anda blok `edited` işaretleniyor ve
      // "Müfredatı güncelle" onu bir daha ezmiyor (bkz. publishCurriculum).
      const setLayer = (i: number, patch: Partial<CupLayer>) =>
        onChange({ ...b, edited: true, layers: b.layers.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

      /** Ölçü metni değişince ml değerleri de yeniden çözülür; şema oranı buna bağlı. */
      const setAmount = (i: number, text: string) => {
        const p = parseAmount(text);
        setLayer(i, {
          text,
          fill: p.fill,
          small: p.small ?? null,
          large: p.large ?? null
        });
      };

      const bodyMax = Math.max(0, ...b.layers.filter((l) => l.order < 900).map((l) => l.order));

      return (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-2">
            {b.layers.map((l, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: CUP_TONE[l.tone] || '#8C9BAE' }} />
                <input
                  className={t.input}
                  value={l.name}
                  placeholder="Malzeme"
                  onChange={(e) => setLayer(i, { name: e.target.value })}
                />
                <input
                  className={`${t.input} max-w-36 tnum`}
                  value={l.text}
                  placeholder="200/270 ml"
                  onChange={(e) => setAmount(i, e.target.value)}
                />
                <select
                  className={`${t.input} max-w-28`}
                  value={l.tone}
                  onChange={(e) => setLayer(i, { tone: e.target.value as CupLayer['tone'] })}
                >
                  {CUP_TONES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
                <button
                  className={t.iconBtn}
                  aria-label="Malzemeyi çıkar"
                  onClick={() => onChange({ ...b, edited: true, layers: b.layers.filter((_, j) => j !== i) })}
                >
                  <Icon name="minus" size={13} />
                </button>
              </div>
            ))}
            <button
              className={`${t.btn} ${t.btnGhost} ${t.btnSm} self-start`}
              onClick={() =>
                onChange({
                  ...b,
                  edited: true,
                  layers: [...b.layers, { name: '', tone: 'diger', order: bodyMax + 1, small: null, large: null, text: '', fill: 'bilinmiyor' }]
                })
              }
            >
              <Icon name="plus" size={13} /> Malzeme
            </button>
          </div>

          {b.dose && (
            <div className="flex gap-2 items-center">
              <span className="w-2.5 h-2.5 rounded-[3px] shrink-0 border border-dashed border-line-2" />
              <input
                className={t.input}
                value={b.dose.name}
                onChange={(e) => onChange({ ...b, edited: true, dose: { ...b.dose!, name: e.target.value } })}
              />
              <input
                className={`${t.input} max-w-36 tnum`}
                value={b.dose.text}
                onChange={(e) => onChange({ ...b, edited: true, dose: { ...b.dose!, text: e.target.value } })}
              />
              <span className="text-[11px] text-fg-3 w-28">bardağa girmez</span>
            </div>
          )}

          <span className="text-[11px] text-fg-3 leading-relaxed">
            {b.mode === 'karisim' ? 'Blenderda karışır' : b.vessel === 'cold' ? 'Buzlu — katmanlı' : 'Sıcak — katmanlı'}
            {' · '}Sıra, listedeki sırayla aynı: üstteki satır bardağın üstünde durur.
            {b.edited && ' · Bu ölçüler elle düzenlendi; müfredat güncellemesi artık bu dersi ezmeyecek.'}
          </span>

          <textarea
            className={`${t.textarea} min-h-20 font-mono text-[12px]`}
            value={b.art || ''}
            onChange={(e) => onChange({ ...b, art: e.target.value || undefined })}
            placeholder="İsteğe bağlı: hazır çizim (SVG kaynağı). Boş bırakılırsa şema otomatik çizilir."
          />
        </div>
      );
    }
    case 'check':
      return (
        <div className="flex flex-col gap-2">
          <input className={t.input} value={b.prompt} onChange={(e) => onChange({ ...b, prompt: e.target.value })} placeholder="Soru" />
          {b.options.map((o, i) => (
            <div key={i} className="flex gap-2 items-center">
              <button onClick={() => onChange({ ...b, answer: i })} className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${b.answer === i ? 'bg-positive-bg border-positive-line text-positive' : 'border-line text-fg-4'}`}><Icon name="check" size={13} strokeWidth={2.2} /></button>
              <input className={t.input} value={o} onChange={(e) => onChange({ ...b, options: b.options.map((x, j) => (j === i ? e.target.value : x)) })} />
              {b.options.length > 2 && <button className={t.iconBtn} aria-label="Seçeneği sil" onClick={() => onChange({ ...b, options: b.options.filter((_, j) => j !== i), answer: 0 })}><Icon name="minus" size={13} /></button>}
            </div>
          ))}
          <button className={`${t.btn} ${t.btnGhost} ${t.btnSm} self-start`} onClick={() => onChange({ ...b, options: [...b.options, ''] })}><Icon name="plus" size={13} /> Seçenek</button>
          <input className={t.input} value={b.explanation || ''} onChange={(e) => onChange({ ...b, explanation: e.target.value })} placeholder="Açıklama" />
        </div>
      );
  }
};

/* ------------------------------------------------------------------ */
/* Yapay zekâ anahtarı (dosyadan ders üretimi)                         */
/* ------------------------------------------------------------------ */

const AiKeySheet: React.FC<{ open: boolean; onClose: () => void; by: string }> = ({ open, onClose, by }) => {
  const [has, setHas] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setKey(''); setErr(null);
    getAiKey().then((k) => setHas(!!k)).catch(() => setHas(false));
  }, [open]);
  const save = async (value: string) => {
    if (value && !value.trim().startsWith('sk-ant-')) { setErr('Anthropic anahtarı "sk-ant-" ile başlar.'); return; }
    try {
      await setAiKey(value, by);
      toast(value ? 'Anahtar kaydedildi' : 'Anahtar kaldırıldı', 'positive');
      onClose();
    } catch (e) { setErr(errorText(e)); }
  };
  return (
    <Sheet open={open} title="Yapay zekâ ile ders üretimi" onClose={onClose}
      footer={<>
        {has && <button className={`${t.btn} ${t.btnDanger} ${t.btnMd} mr-auto`} onClick={() => save('')}>Anahtarı kaldır</button>}
        <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} disabled={!key.trim()} onClick={() => save(key)}>Kaydet</button>
      </>}>
      <p className="text-[13px] text-fg-2 leading-relaxed">
        "Dosyadan ders" bir PDF ya da görseli Claude'a gönderip Türkçe ders ve farklı türde sınav soruları hazırlar
        (taranmış sayfalar ve İngilizce kaynaklar dahil). Bunun için bir Anthropic API anahtarı gerekir.
      </p>
      <div className="flex gap-3 p-3.5 rounded-xl bg-caution-bg border border-caution-line text-[12.5px] leading-relaxed">
        <Icon name="alert" size={16} className="text-caution mt-0.5" />
        <span>
          Uygulamanın sunucusu olmadığı için çağrı tarayıcıdan yapılır: anahtar yalnızca Kahve Operasyon Direktörü'nün
          tarayıcısına iner (diğer roller ve baristalar göremez). Console'da yalnızca bu iş için ayrı bir anahtar açıp <strong>aylık harcama sınırı</strong> koy.
        </span>
      </div>
      <div className="text-[13px]">Durum: {has === null ? '…' : has ? <span className="text-positive">Anahtar tanımlı</span> : <span className="text-fg-3">Tanımlı değil — dosyalar OCR ve kurallarla okunuyor</span>}</div>
      <label className={t.field}>
        <span className={t.label}>{has ? 'Yeni anahtar' : 'Anahtar'}</span>
        <input className={t.input} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" />
      </label>
      <ErrorText>{err}</ErrorText>
    </Sheet>
  );
};
