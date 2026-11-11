import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useContent } from '../../store/content';
import { useQueryLive } from '../../hooks/useFirestore';
import { Icon, type IconName } from '../../ui/Icon';
import { Page, PageTitle, Section, Empty, Badge, Sheet, ErrorText, Spinner, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { ImportLessonSheet } from './ImportLessonSheet';
import { LessonBlocks } from '../academy/LessonBlocks';
import { compressImage } from '../../lib/media';
import { loadCurriculumFile, planCurriculum, publishCurriculum, type PublishPlan, type PublishProgress } from '../../api/publishCurriculum';
import type { Lesson, LessonBlock, Module, Question, Track } from '../../../shared/types';

const TRACK_ICONS: IconName[] = ['coffee', 'book', 'users', 'store', 'shield', 'package', 'cap', 'award', 'clipboard', 'flag'];

/** Listedeki iki öğenin sırasını değiştirir. */
async function swapOrder(col: string, a: { id: string; order: number }, b: { id: string; order: number }) {
  const batch = writeBatch(db);
  batch.update(doc(db, col, a.id), { order: b.order });
  batch.update(doc(db, col, b.id), { order: a.order });
  await batch.commit();
}

const PublishBadge: React.FC<{ on: boolean }> = ({ on }) => <Badge tone={on ? 'positive' : 'neutral'}>{on ? 'Yayında' : 'Taslak'}</Badge>;

/* ------------------------------------------------------------------ */
/* İçerik: yollar ve modüller                                          */
/* ------------------------------------------------------------------ */

export const ContentPage: React.FC = () => {
  const navigate = useNavigate();
  const { tracks, modules, lessons } = useContent();
  const [editTrack, setEditTrack] = useState<Partial<Track> | null>(null);
  const [editModule, setEditModule] = useState<Partial<Module> | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  return (
    <Page wide>
      <PageTitle title="İçerik" subtitle="Eğitim yolları, modüller, dersler ve soru bankası."
        action={
          <div className="flex gap-2 flex-wrap justify-end">
            <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setSyncOpen(true)}>
              <Icon name="refresh" size={15} /> Müfredatı güncelle
            </button>
            {/* Tek ders eklemek için modülün içine girmek gerekiyordu; en çok
                kullanılan yol burası olduğu için düğme de burada duruyor. */}
            <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setImporting(true)}>
              <Icon name="upload" size={15} /> Dosyadan ders
            </button>
            <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={() => setEditTrack({})}><Icon name="plus" size={15} /> Eğitim yolu</button>
          </div>
        } />

      <CurriculumSyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} />
      <ImportLessonSheet
        open={importing}
        onClose={() => setImporting(false)}
        onCreated={(id) => { setImporting(false); navigate(`/icerik/ders/${id}`); }}
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
                <button className={t.iconBtn} disabled={ti === 0} onClick={() => swapOrder('tracks', tr, tracks[ti - 1])} title="Yukarı"><Icon name="arrowUp" size={14} /></button>
                <button className={t.iconBtn} disabled={ti === tracks.length - 1} onClick={() => swapOrder('tracks', tr, tracks[ti + 1])} title="Aşağı"><Icon name="arrowDown" size={14} /></button>
                <button className={t.iconBtn} onClick={() => setEditTrack(tr)} title="Düzenle"><Icon name="edit" size={14} /></button>
              </div>
            }>
            <div className={t.listGroup}>
              {mods.map((m, mi) => (
                <div key={m.id} className={`${t.listRow} cursor-default`}>
                  <Link to={`/icerik/modul/${m.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-panel-3 border border-line text-[12px] font-semibold flex items-center justify-center tnum shrink-0">{mi + 1}</span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium truncate">{m.title}</div>
                      <div className="text-[12px] text-fg-3">
                        {lessons.filter((l) => l.moduleId === m.id).length} ders · {m.questionCount ?? 0} soru · %{m.passScore} geçme
                        {m.prerequisiteId ? ' · Kilitli' : ''}
                      </div>
                    </div>
                  </Link>
                  <PublishBadge on={m.published} />
                  <button className={t.iconBtn} disabled={mi === 0} onClick={() => swapOrder('modules', m, mods[mi - 1])}><Icon name="arrowUp" size={14} /></button>
                  <button className={t.iconBtn} disabled={mi === mods.length - 1} onClick={() => swapOrder('modules', m, mods[mi + 1])}><Icon name="arrowDown" size={14} /></button>
                  <Link to={`/icerik/modul/${m.id}`} className={t.iconBtn}><Icon name="chevronRight" size={14} /></Link>
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
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) { setPlan(null); setErr(''); setProgress(null); return; }
    let alive = true;
    setBusy(true);
    (async () => {
      try {
        const file = await loadCurriculumFile();
        const p = await planCurriculum(file);
        if (alive) setPlan(p);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Müfredat okunamadı.');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [open]);

  const apply = async () => {
    setBusy(true);
    setErr('');
    try {
      const file = await loadCurriculumFile();
      const res = await publishCurriculum(file, setProgress);
      toast(`${res.written} belge yazıldı, ${res.removed} belge silindi`, 'positive');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Yükleme başarısız.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0;
  const totalRemove = plan ? Object.values(plan.counts).reduce((s, c) => s + c.remove, 0) : 0;

  return (
    <Sheet open={open} title="Müfredatı güncelle" onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={onClose} disabled={busy}>Vazgeç</button>
          <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={apply} disabled={busy || !plan}>
            {busy && progress ? 'Yükleniyor…' : 'Uygula'}
          </button>
        </>
      }>
      <p className="text-[13px] text-fg-2 leading-relaxed">
        Uygulamanın içindeki hazır müfredatı veritabanına yazar. Menüden çıkmış dersler ve
        sorular silinir. Panelden eklediğin soru fotoğrafları ve yayın/taslak durumları korunur,
        ancak <strong className="text-crema">ders metinlerinde elle yaptığın değişiklikler üzerine yazılır</strong>.
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
                <div className="flex gap-1.5">
                  {c.add > 0 && <Badge tone="positive">+{c.add} yeni</Badge>}
                  {c.update > 0 && <Badge tone="neutral">{c.update} güncellenecek</Badge>}
                  {c.remove > 0 && <Badge tone="negative">−{c.remove} silinecek</Badge>}
                  {c.add + c.update + c.remove === 0 && <span className="text-[12px] text-fg-3">değişiklik yok</span>}
                </div>
              </div>
            ))}
          </div>

          {totalRemove > 0 && plan.removedTitles.length > 0 && (
            <div className={t.field}>
              <span className={t.label}>Silinecek ders ve modüller</span>
              <div className="text-[12px] text-fg-3 leading-relaxed">{plan.removedTitles.join(' · ')}</div>
            </div>
          )}
        </>
      )}

      <ErrorText>{err}</ErrorText>
    </Sheet>
  );
};

const TrackSheet: React.FC<{ value: Partial<Track> | null; onClose: () => void; nextOrder: number }> = ({ value, onClose, nextOrder }) => {
  const [f, setF] = useState<Partial<Track>>({});
  useEffect(() => setF(value ? { icon: 'book', published: false, ...value } : {}), [value]);
  const save = async () => {
    if (!f.title?.trim()) return;
    const data = { title: f.title.trim(), description: f.description?.trim() || '', icon: f.icon || 'book', published: !!f.published };
    if (f.id) await updateDoc(doc(db, 'tracks', f.id), data);
    else await addDoc(collection(db, 'tracks'), { ...data, order: nextOrder });
    toast('Kaydedildi', 'positive');
    onClose();
  };
  const remove = async () => {
    if (!f.id || !confirm('Eğitim yolu silinsin mi? İçindeki modüller silinmez ama baristalara görünmez olur.')) return;
    await deleteDoc(doc(db, 'tracks', f.id));
    onClose();
  };
  return (
    <Sheet open={!!value} title={f.id ? 'Eğitim yolunu düzenle' : 'Yeni eğitim yolu'} onClose={onClose}
      footer={<>{f.id && <button className={`${t.btn} ${t.btnDanger} ${t.btnMd} mr-auto`} onClick={remove}>Sil</button>}<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save}>Kaydet</button></>}>
      <label className={t.field}><span className={t.label}>Başlık</span><input className={t.input} value={f.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label className={t.field}><span className={t.label}>Açıklama</span><textarea className={t.textarea} value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <div className={t.field}><span className={t.label}>İkon</span>
        <div className="flex flex-wrap gap-2">
          {TRACK_ICONS.map((ic) => (
            <button key={ic} onClick={() => setF({ ...f, icon: ic })} className={`w-10 h-10 rounded-lg border flex items-center justify-center ${f.icon === ic ? 'border-crema bg-panel-3' : 'border-line bg-panel'}`}><Icon name={ic} size={18} /></button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={!!f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Baristalara yayınla</label>
    </Sheet>
  );
};

const ModuleSheet: React.FC<{ value: Partial<Module> | null; onClose: () => void }> = ({ value, onClose }) => {
  const { modules, tracks } = useContent();
  const [f, setF] = useState<Partial<Module>>({});
  useEffect(() => setF(value ? { passScore: 80, examSize: 10, published: false, prerequisiteId: null, ...value } : {}), [value]);
  const siblings = modules.filter((m) => m.id !== f.id);
  const save = async () => {
    if (!f.title?.trim() || !f.trackId) return;
    const data = {
      title: f.title.trim(), description: f.description?.trim() || '', trackId: f.trackId,
      passScore: Math.min(100, Math.max(1, Number(f.passScore) || 80)),
      examSize: Math.min(50, Math.max(1, Number(f.examSize) || 10)),
      prerequisiteId: f.prerequisiteId || null, published: !!f.published
    };
    if (f.id) await updateDoc(doc(db, 'modules', f.id), data);
    else {
      const inTrack = modules.filter((m) => m.trackId === f.trackId);
      await addDoc(collection(db, 'modules'), { ...data, order: inTrack.length ? Math.max(...inTrack.map((m) => m.order)) + 1 : 1, questionCount: 0 });
    }
    toast('Kaydedildi', 'positive');
    onClose();
  };
  return (
    <Sheet open={!!value} title={f.id ? 'Modül ayarları' : 'Yeni modül'} onClose={onClose}
      footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save}>Kaydet</button>}>
      <label className={t.field}><span className={t.label}>Başlık</span><input className={t.input} value={f.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label className={t.field}><span className={t.label}>Açıklama</span><textarea className={t.textarea} value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label className={t.field}><span className={t.label}>Eğitim yolu</span>
        <select className={t.input} value={f.trackId || ''} onChange={(e) => setF({ ...f, trackId: e.target.value })}>
          {tracks.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={t.field}><span className={t.label}>Geçme notu (%)</span><input type="number" className={t.input} value={f.passScore ?? 80} onChange={(e) => setF({ ...f, passScore: Number(e.target.value) })} /></label>
        <label className={t.field}><span className={t.label}>Sınavdaki soru sayısı</span><input type="number" className={t.input} value={f.examSize ?? 10} onChange={(e) => setF({ ...f, examSize: Number(e.target.value) })} /></label>
      </div>
      <label className={t.field}><span className={t.label}>Önce geçilmesi gereken modül</span>
        <select className={t.input} value={f.prerequisiteId || ''} onChange={(e) => setF({ ...f, prerequisiteId: e.target.value || null })}>
          <option value="">Yok — her zaman açık</option>
          {siblings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={!!f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Baristalara yayınla</label>
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
  const [tab, setTab] = useState<'lessons' | 'questions'>('lessons');
  const [editModule, setEditModule] = useState<Partial<Module> | null>(null);
  const [editQ, setEditQ] = useState<Partial<Question> | null>(null);
  const [importing, setImporting] = useState(false);

  if (!mod) return <Page wide><PageTitle title="Modül bulunamadı" back="/icerik" /></Page>;
  const ls = lessons.filter((l) => l.moduleId === mod.id);

  const addLesson = async () => {
    const r = await addDoc(collection(db, 'lessons'), {
      moduleId: mod.id, title: 'Yeni ders', order: ls.length ? Math.max(...ls.map((l) => l.order)) + 1 : 1,
      durationMin: 3, blocks: [{ type: 'text', text: '' }], published: false
    });
    navigate(`/icerik/ders/${r.id}`);
  };

  return (
    <Page wide>
      <PageTitle title={mod.title} subtitle={`${tracks.find((x) => x.id === mod.trackId)?.title || ''} · %${mod.passScore} geçme · sınavda ${mod.examSize} soru`} back="/icerik"
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
            <div key={l.id} className={`${t.listRow} cursor-default`}>
              <Link to={`/icerik/ders/${l.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-panel-3 border border-line text-[12px] font-semibold flex items-center justify-center tnum shrink-0">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-[14px] font-medium truncate">{l.title}</div>
                  <div className="text-[12px] text-fg-3">{l.blocks?.length || 0} blok · {l.durationMin} dk</div>
                </div>
              </Link>
              <PublishBadge on={l.published} />
              <button className={t.iconBtn} disabled={i === 0} onClick={() => swapOrder('lessons', l, ls[i - 1])}><Icon name="arrowUp" size={14} /></button>
              <button className={t.iconBtn} disabled={i === ls.length - 1} onClick={() => swapOrder('lessons', l, ls[i + 1])}><Icon name="arrowDown" size={14} /></button>
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
        onCreated={(id) => { setImporting(false); navigate(`/icerik/ders/${id}`); }}
      />
    </Page>
  );
};

const QuestionSheet: React.FC<{ value: Partial<Question> | null; onClose: () => void }> = ({ value, onClose }) => {
  const [f, setF] = useState<Partial<Question>>({});
  const [error, setError] = useState<string | null>(null);
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
    const data = { moduleId: f.moduleId!, type: f.type || 'single', prompt: f.prompt.trim(), options, answer, explanation: f.explanation?.trim() || '', imageUrl: f.imageUrl || '' };
    if (f.id) await updateDoc(doc(db, 'questions', f.id), data);
    else await addDoc(collection(db, 'questions'), data);
    toast('Soru kaydedildi', 'positive');
    onClose();
  };
  const remove = async () => {
    if (f.id && confirm('Soru silinsin mi?')) { await deleteDoc(doc(db, 'questions', f.id)); onClose(); }
  };

  return (
    <Sheet open={!!value} title={f.id ? 'Soruyu düzenle' : 'Yeni soru'} onClose={onClose}
      footer={<>{f.id && <button className={`${t.btn} ${t.btnDanger} ${t.btnMd} mr-auto`} onClick={remove}>Sil</button>}<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save}>Kaydet</button></>}>
      <div className={t.segment}>
        <button className={`${t.segmentItem} ${f.type !== 'truefalse' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setType('single')}>Çoktan seçmeli</button>
        <button className={`${t.segmentItem} ${f.type === 'truefalse' ? t.segmentItemOn : t.segmentItemOff}`} onClick={() => setType('truefalse')}>Doğru / Yanlış</button>
      </div>
      <label className={t.field}><span className={t.label}>Soru</span><textarea className={t.textarea} value={f.prompt || ''} onChange={(e) => setF({ ...f, prompt: e.target.value })} /></label>
      <div className={t.field}>
        <span className={t.label}>Seçenekler — doğru olanı işaretle</span>
        {opts.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <button onClick={() => setF({ ...f, answer: i })} className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${f.answer === i ? 'bg-positive-bg border-positive-line text-positive' : 'border-line text-fg-4'}`}>
              <Icon name="check" size={14} strokeWidth={2.2} />
            </button>
            <input className={t.input} value={o} disabled={f.type === 'truefalse'} onChange={(e) => { const n = [...opts]; n[i] = e.target.value; setF({ ...f, options: n }); }} placeholder={`Seçenek ${String.fromCharCode(65 + i)}`} />
            {f.type !== 'truefalse' && opts.length > 2 && (
              <button className={t.iconBtn} onClick={() => { const n = opts.filter((_, j) => j !== i); setF({ ...f, options: n, answer: Math.min(f.answer ?? 0, n.length - 1) }); }}><Icon name="minus" size={14} /></button>
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
  const { lessons, modules } = useContent();
  const lesson = lessons.find((l) => l.id === lessonId);
  const [draft, setDraft] = useState<Lesson | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (lesson && !dirty) setDraft(lesson); }, [lesson, dirty]);
  if (!lesson || !draft) return <Page wide><PageTitle title="Ders bulunamadı" back="/icerik" /></Page>;
  const mod = modules.find((m) => m.id === lesson.moduleId);

  const patch = (p: Partial<Lesson>) => { setDraft({ ...draft, ...p }); setDirty(true); };
  const setBlock = (i: number, b: LessonBlock) => patch({ blocks: draft.blocks.map((x, j) => (j === i ? b : x)) });
  const move = (i: number, d: -1 | 1) => {
    const n = [...draft.blocks];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    patch({ blocks: n });
  };

  const save = async () => {
    setSaving(true);
    const { id, ...rest } = draft;
    await updateDoc(doc(db, 'lessons', id), { ...rest, title: rest.title.trim() || 'Adsız ders', durationMin: Number(rest.durationMin) || 1 });
    setSaving(false);
    setDirty(false);
    toast('Ders kaydedildi', 'positive');
  };

  const remove = async () => {
    if (!confirm('Ders silinsin mi?')) return;
    await deleteDoc(doc(db, 'lessons', draft.id));
    navigate(`/icerik/modul/${lesson.moduleId}`);
  };

  return (
    <Page wide>
      <PageTitle title={draft.title || 'Ders'} subtitle={mod?.title} back={`/icerik/modul/${lesson.moduleId}`}
        action={
          <div className="flex gap-2">
            <button className={`${t.btn} ${t.btnSecondary} ${t.btnMd}`} onClick={() => setPreview(!preview)}><Icon name={preview ? 'edit' : 'phone'} size={15} /> {preview ? 'Düzenle' : 'Önizle'}</button>
            <button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} onClick={save} disabled={!dirty || saving}>{saving ? <Spinner size={14} /> : dirty ? 'Kaydet' : 'Kaydedildi'}</button>
          </div>
        } />

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
                  <button className={t.iconBtn} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrowUp" size={13} /></button>
                  <button className={t.iconBtn} disabled={i === draft.blocks.length - 1} onClick={() => move(i, 1)}><Icon name="arrowDown" size={13} /></button>
                  <button className={t.iconBtn} onClick={() => patch({ blocks: draft.blocks.filter((_, j) => j !== i) })}><Icon name="trash" size={13} /></button>
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
            <label className={t.field}><span className={t.label}>Ders başlığı</span><input className={t.input} value={draft.title} onChange={(e) => patch({ title: e.target.value })} /></label>
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
const MediaInput: React.FC<{ url: string; kind: 'image' | 'video'; onChange: (url: string) => void }> = ({ url, kind, onChange }) => {
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      onChange(await compressImage(file));
    } catch (e) {
      toast((e as Error).message, 'negative');
    }
    setBusy(false);
  };
  if (kind === 'video') {
    return <input className={t.input} value={url} onChange={(e) => onChange(e.target.value)} placeholder="YouTube bağlantısı (dosya yüklenemez)" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {url && <img src={url} alt="" className="max-h-48 rounded-lg border border-line self-start" />}
      <div className="flex gap-2">
        <input className={t.input} value={url.startsWith('data:') ? '' : url} onChange={(e) => onChange(e.target.value)} placeholder="Görsel bağlantısı ya da dosya yükle" />
        <label className={`${t.btn} ${t.btnSecondary} ${t.btnLg} cursor-pointer`}>
          {busy ? <Spinner size={14} /> : <Icon name="upload" size={15} />}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
    </div>
  );
};

const BlockEditor: React.FC<{ block: LessonBlock; onChange: (b: LessonBlock) => void }> = ({ block: b, onChange }) => {
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
              <button className={t.iconBtn} onClick={() => onChange({ ...b, items: b.items.filter((_, j) => j !== i) })}><Icon name="minus" size={13} /></button>
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
              <button className={t.iconBtn} onClick={() => onChange({ ...b, rows: b.rows.filter((_, j) => j !== i) })}><Icon name="minus" size={13} /></button>
            </div>
          ))}
          <button className={`${t.btn} ${t.btnGhost} ${t.btnSm} self-start`} onClick={() => onChange({ ...b, rows: [...b.rows, { label: '', value: '' }] })}><Icon name="plus" size={13} /> Satır</button>
        </div>
      );
    case 'cup':
      // Şema reçete verisinden üretiliyor (scripts/recipe-cup.mjs); katmanlar
      // burada elle düzenlenmez — düzenlenirse "Müfredatı güncelle" ezer.
      // Panelden değiştirilebilen tek şey, otomatik şemanın yerine geçecek
      // hazır çizim.
      return (
        <div className="flex flex-col gap-2">
          <div className={t.listGroup}>
            {b.layers.map((l, i) => (
              <div key={i} className={`${t.listRowStatic} justify-between`}>
                <span className="text-[13px] text-fg-2">{l.name}</span>
                <span className="text-[13px] font-semibold tnum">{l.text}</span>
              </div>
            ))}
          </div>
          <span className="text-[11px] text-fg-3">
            {b.mode === 'karisim' ? 'Blenderda karışır' : b.vessel === 'cold' ? 'Buzlu — katmanlı' : 'Sıcak — katmanlı'}
            {' · '}Ölçüler reçete dosyasından gelir, buradan değiştirilmez.
          </span>
          <textarea
            className={`${t.textarea} min-h-20 font-mono text-[12px]`}
            value={b.art || ''}
            onChange={(e) => onChange({ ...b, art: e.target.value || undefined })}
            placeholder="İsteğe bağlı: hazır çizim (SVG kaynağı). Boş bırakılırsa şema otomatik çizilir."
          />
        </div>
      );
    case 'check':
      return (
        <div className="flex flex-col gap-2">
          <input className={t.input} value={b.prompt} onChange={(e) => onChange({ ...b, prompt: e.target.value })} placeholder="Soru" />
          {b.options.map((o, i) => (
            <div key={i} className="flex gap-2 items-center">
              <button onClick={() => onChange({ ...b, answer: i })} className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${b.answer === i ? 'bg-positive-bg border-positive-line text-positive' : 'border-line text-fg-4'}`}><Icon name="check" size={13} strokeWidth={2.2} /></button>
              <input className={t.input} value={o} onChange={(e) => onChange({ ...b, options: b.options.map((x, j) => (j === i ? e.target.value : x)) })} />
              {b.options.length > 2 && <button className={t.iconBtn} onClick={() => onChange({ ...b, options: b.options.filter((_, j) => j !== i), answer: 0 })}><Icon name="minus" size={13} /></button>}
            </div>
          ))}
          <button className={`${t.btn} ${t.btnGhost} ${t.btnSm} self-start`} onClick={() => onChange({ ...b, options: [...b.options, ''] })}><Icon name="plus" size={13} /> Seçenek</button>
          <input className={t.input} value={b.explanation || ''} onChange={(e) => onChange({ ...b, explanation: e.target.value })} placeholder="Açıklama" />
        </div>
      );
  }
};
