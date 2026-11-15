import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { commitChange, canPublishOps, newId, resultText } from '../../api/changes';
import { errorText } from '../../api/backend';
import { useContent } from '../../store/content';
import { RECIPE_TRACK_ID } from '../../lib/search';
import { draftQuiz, type QuizDraft } from '../../lib/productQuiz';
import { useStaffSession } from './StaffLayout';
import { BlockEditor } from './ContentPages';
import { MediaInput } from './MediaInput';
import { Icon } from '../../ui/Icon';
import { Page, PageTitle, Section, ErrorText, Spinner, toast, MAX } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { BulletinKind, ChangeOp, LessonBlock } from '../../../shared/types';
import { useUnsavedGuard } from '../../lib/unsaved';
import { allowed } from '../../lib/permissions';
import { authorName } from '../../lib/roles';
import { localDay } from '../../lib/day';
import { useStaffData } from './staffData';

/**
 * Yeni ürün akışı: menüye yeni bir içecek girince tek ekranda
 *   1. reçete (Reçeteler'de ve Akademi'de görünür),
 *   2. 3 soruluk mini sınav (reçeteden üretilir, düzeltilebilir),
 *   3. bülten duyurusu,
 *   4. bütün mağazalara "mini sınavı geç" görevi.
 * Kahve Operasyon Direktörü tek tuşla yayınlar; Bölge Müdürü yaparsa hepsi
 * tek bir öneri olarak onaya düşer.
 */

type Cup = Extract<LessonBlock, { type: 'cup' }>;

const slug = (s: string) => s.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'urun';
const dayInput = (ms: number) => localDay(ms);
const endOfDay = (v: string) => (v ? new Date(`${v}T23:59:00`).getTime() : null);

const emptyCup = (): Cup => ({
  type: 'cup', mode: 'katman', vessel: 'hot', sizes: [{ oz: 8, ml: 240 }, { oz: 12, ml: 360 }],
  layers: [
    { name: '', tone: 'espresso', order: 0, small: null, large: null, text: '', fill: 'bilinmiyor' },
    { name: '', tone: 'sut', order: 1, small: null, large: null, text: '', fill: 'bilinmiyor' }
  ]
});

export const NewProductPage: React.FC = () => {
  const me = useStaffSession();
  const navigate = useNavigate();
  const { modules, lessons, stores } = useContent();
  const recipeModules = modules.filter((m) => m.trackId === RECIPE_TRACK_ID).sort((a, b) => a.order - b.order);
  const baristas = useStaffData((x) => x.baristas);

  const [name, setName] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [photo, setPhoto] = useState('');
  const [cup, setCup] = useState<Cup>(emptyCup);
  const [stepsText, setStepsText] = useState('');
  const [tip, setTip] = useState('');
  const [quiz, setQuiz] = useState<QuizDraft[]>([]);
  const [quizTouched, setQuizTouched] = useState(false);
  const [withBulletin, setWithBulletin] = useState(true);
  const [bKind, setBKind] = useState<BulletinKind>('kampanya');
  const [bTitle, setBTitle] = useState('');
  const [bBody, setBBody] = useState('');
  const [bTouched, setBTouched] = useState(false);
  const [bUntil, setBUntil] = useState('');
  const [withTask, setWithTask] = useState(true);
  const [due, setDue] = useState(dayInput(Date.now() + 7 * 86400000));
  const [taskNote, setTaskNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uzun form: yarıda kalan reçete geri okuna/geri tuşuna/menüye dokununca gidiyordu.
  // Bülten metni boş formda bile kendiliğinden dolduğu için sayılmaz; yalnızca elle
  // değiştirildiyse (bTouched) kayıp sayılır. Yoksa boş formdan çıkılamıyordu.
  // Kategori ve bardak ölçüleri de sayılır (yalnızca ölçü girilip çıkılınca uyarı yoktu).
  const cupTouched = cup.layers.some((l) => l.name.trim() || l.text.trim());
  useUnsavedGuard(!busy && !!(name.trim() || moduleId || cupTouched || photo || stepsText.trim() || tip.trim() || bTouched || taskNote.trim() || quizTouched));

  const mod = recipeModules.find((m) => m.id === moduleId);
  const steps = stepsText.split('\n').map((s) => s.replace(/^\s*(\d+[.)]|-)\s*/, '').trim()).filter(Boolean);
  const activeStores = stores.filter((s) => s.active !== false);
  // Aktif baristası olmayan mağazaya görev açılmaz: hiç tamamlanamaz, "Geçersiz" kalırdı.
  const taskStores = activeStores.filter((s) => baristas.some((b) => b.active && b.storeId === s.id));
  // Yayınla mı, onaya mı: reçetenin yanında bülten ve görev yetkisine de bakılır
  // (bülten ya da görev yetkisi kapalıyken düğme "Yayınla" deyip iş öneriye düşüyordu).
  const publishNow = canPublishOps([
    { op: 'set', col: 'lessons', id: '_', data: { moduleId: mod?.id || recipeModules[0]?.id } },
    ...(withBulletin ? [{ op: 'set' as const, col: 'bulletins' as const, id: '_' }] : []),
    ...(withTask && taskStores.length ? [{ op: 'set' as const, col: 'assignments' as const, id: '_' }] : [])
  ]);

  // Kategori seçilince bardak boyları ve sıcak/soğuk aynı kategorideki bir reçeteden gelir.
  useEffect(() => {
    if (!moduleId) return;
    const ref = lessons.find((l) => l.moduleId === moduleId && l.blocks?.some((b) => b.type === 'cup'))?.blocks.find((b) => b.type === 'cup') as Cup | undefined;
    if (ref) setCup((c) => ({ ...c, vessel: ref.vessel, mode: ref.mode, sizes: ref.sizes }));
  }, [moduleId, lessons]);

  // Mini sınav ve bülten metni, elle değiştirilmedikçe reçeteyle birlikte güncellenir.
  const auto = useMemo(() => draftQuiz(name, cup.layers, steps), [name, cup.layers, stepsText]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!quizTouched) setQuiz(auto); }, [auto, quizTouched]);
  const dueText = due ? new Date(`${due}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : '';
  useEffect(() => {
    if (bTouched) return;
    const n = name.trim() || 'Yeni ürün';
    setBTitle(`Yeni ürün: ${n}`);
    setBBody([
      `**${n}** menümüzde.`,
      mod ? `- Reçete: Reçeteler → ${mod.title} → ${n}` : '- Reçete: Reçeteler bölümünde',
      withTask ? `- ${dueText ? `${dueText} tarihine kadar` : 'Bu hafta'} reçeteyi oku ve **3 soruluk mini sınavı** geç.` : '- Reçeteyi oku, ölçüleri ezberle.'
    ].join('\n'));
  }, [name, mod, withTask, dueText, bTouched]);

  const setQ = (i: number, patch: Partial<QuizDraft>) => { setQuizTouched(true); setQuiz((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q))); };

  const save = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Ürünün adını yaz.');
    if (!mod) return setError('Kategori seç (Reçeteler\'de hangi başlık altında görünecek).');
    if (!cup.layers.some((l) => l.name.trim() && l.text.trim())) return setError('En az bir malzemeyi ölçüsüyle gir.');
    if (!steps.length) return setError('Hazırlanış adımlarını yaz (her satır bir adım).');
    if (quiz.some((q) => !q.prompt.trim() || q.options.some((o) => !o.trim()))) return setError('Mini sınavda boş soru ya da şık var.');
    // Tek şıklı ya da apaçık soru sınava girmesin: çoktan seçmelide en az 3 farklı şık.
    const tr = (x: string) => x.trim().toLocaleLowerCase('tr');
    if (quiz.some((q) => q.type !== 'truefalse' && new Set(q.options.map(tr)).size < 3)) return setError('Mini sınavdaki her çoktan seçmeli soruda en az 3 farklı şık olmalı.');
    if (quiz.some((q) => new Set(q.options.map(tr)).size !== q.options.length)) return setError('Mini sınavda aynı şık iki kez yazılmış.');
    if (withTask && due && due < localDay()) return setError('Görevin son tarihi geçmiş bir gün olamaz.');
    if (withTask && !taskStores.length) return setError('Görev atanacak mağaza yok: aktif baristası olan mağaza bulunamadı.');

    const now = Date.now();
    const lessonId = `r-${slug(name)}-${now.toString(36)}`;
    const order = Math.max(0, ...lessons.filter((l) => l.moduleId === mod.id).map((l) => l.order)) + 1;
    const blocks: LessonBlock[] = [
      ...(photo ? [{ type: 'image', url: photo, caption: `Doğru sunum: ${name.trim()}` } as LessonBlock] : []),
      { ...cup, layers: cup.layers.filter((l) => l.name.trim()), edited: true },
      { type: 'heading', text: 'Hazırlanışı' },
      { type: 'steps', items: steps },
      ...(tip.trim() ? [{ type: 'tip', text: tip.trim() } as LessonBlock] : []),
      { type: 'tip', text: 'Ürünü teslim etmeden önce standarda ve sunuma uygunluğunu **gözle kontrol et**. Standart dışı ürün misafire sunulmaz.' }
    ];
    const by = { createdAt: now, createdBy: me.uid, createdByName: authorName(me.role, me.name) };
    const ops: ChangeOp[] = [
      // kaynak: 'panel' → "Müfredatı güncelle" bu reçeteyi ve sorularını silmez.
      { op: 'set', col: 'lessons', id: lessonId, data: { moduleId: mod.id, title: name.trim(), order, durationMin: 2, blocks, published: true, quiz: quiz.length, kaynak: 'panel' } },
      ...quiz.map((q) => ({ op: 'set' as const, col: 'questions' as const, id: newId('questions'), data: { moduleId: mod.id, lessonId, imageUrl: '', kaynak: 'panel', ...q } })),
      { op: 'update', col: 'modules', id: mod.id, data: { questionCount: (mod.questionCount || 0) + quiz.length } }
    ];
    if (withBulletin) {
      ops.push({ op: 'set', col: 'bulletins', id: newId('bulletins'), data: {
        kind: bKind, title: bTitle.trim(), body: bBody.trim(), storeIds: null, ...(photo ? { imageUrl: photo } : {}),
        expiresAt: endOfDay(bUntil), published: true, pinned: false, ...by
      } });
    }
    if (withTask) {
      for (const s of taskStores) {
        ops.push({ op: 'set', col: 'assignments', id: newId('assignments'), data: {
          kind: 'quiz', targetId: lessonId, title: `${name.trim()} mini sınavı`, note: taskNote.trim() || 'Yeni ürün: reçeteyi oku, mini sınavı geç.',
          storeId: s.id, baristaId: null, dueAt: endOfDay(due), ...by
        } });
      }
    }

    setBusy(true);
    try {
      const res = await commitChange(ops, { kind: 'product', title: name.trim(), summary: `Yeni ürün: reçete, ${quiz.length} soruluk mini sınav${withBulletin ? ', bülten' : ''}${withTask ? `, ${taskStores.length} mağazaya görev` : ''}` });
      toast(res === 'applied' ? `${name.trim()} yayında.` : resultText(res));
      navigate(res === 'applied' ? `/icerik/ders/${lessonId}` : '/onaylar');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageTitle title="Yeni ürün" back={allowed(me.role, 'ekran.akademi') ? '/icerik' : true}
        subtitle="Reçete, mini sınav, bülten ve görev tek seferde. Yayınlayınca baristalar hemen görür." />

      <Section label="1 · Ürün">
        <div className={`${t.card} ${t.cardPad} flex flex-col gap-3`}>
          <label className={t.field}><span className={t.label}>Ürün adı</span>
            <input className={t.input} value={name} maxLength={MAX.name} onChange={(e) => setName(e.target.value)} placeholder="Ör. Chestnut Latte" /></label>
          <label className={t.field}><span className={t.label}>Kategori</span>
            <select className={t.input} value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
              <option value="">Seç…</option>
              {recipeModules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select></label>
          <div className={t.field}><span className={t.label}>Fotoğraf (isteğe bağlı)</span>
            <MediaInput url={photo} kind="image" onChange={setPhoto} placeholder="Doğru sunumun fotoğrafı" /></div>
        </div>
      </Section>

      <Section label="2 · Ölçüler">
        <div className={`${t.card} ${t.cardPad} flex flex-col gap-3`}>
          <div className="flex gap-2 flex-wrap">
            <div className={t.segment}>
              {(['hot', 'cold'] as const).map((v) => <button key={v} onClick={() => setCup({ ...cup, vessel: v })} className={`${t.segmentItem} ${cup.vessel === v ? t.segmentItemOn : t.segmentItemOff}`}>{v === 'hot' ? 'Sıcak' : 'Soğuk'}</button>)}
            </div>
            <div className={t.segment}>
              {(['katman', 'karisim'] as const).map((v) => <button key={v} onClick={() => setCup({ ...cup, mode: v })} className={`${t.segmentItem} ${cup.mode === v ? t.segmentItemOn : t.segmentItemOff}`}>{v === 'katman' ? 'Katmanlı' : 'Blender'}</button>)}
            </div>
          </div>
          <BlockEditor block={cup} onChange={(b) => setCup(b as Cup)} />
          <span className="text-[12px] text-fg-3">Ölçüyü küçük / büyük bardak için yaz: "20 / 40 ml". Üstteki satır bardağın üstünde durur.</span>
        </div>
      </Section>

      <Section label="3 · Hazırlanış">
        <div className={`${t.card} ${t.cardPad} flex flex-col gap-3`}>
          <textarea className={`${t.textarea} min-h-32`} value={stepsText} onChange={(e) => setStepsText(e.target.value)}
            placeholder={'Her satır bir adım:\nEspresso (12 oz) hazırlayın.\nSütü 65°C\'ye kadar ısıtın.\nBardağa dökün ve latte art yapın.'} />
          <input className={t.input} value={tip} onChange={(e) => setTip(e.target.value)} placeholder="İsteğe bağlı ipucu: Üzerine tarçın serpilir." />
        </div>
      </Section>

      <Section label="4 · Mini sınav" action={quizTouched ? <button className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} onClick={() => setQuizTouched(false)}><Icon name="refresh" size={13} /> Reçeteden yeniden üret</button> : undefined}>
        <div className="flex flex-col gap-2">
          {quiz.map((q, i) => (
            <div key={i} className={`${t.card} ${t.cardPad} flex flex-col gap-2`}>
              <textarea className={`${t.textarea} min-h-14`} value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} />
              {q.options.map((o, j) => (
                <div key={j} className="flex items-center gap-2">
                  <input type="radio" checked={q.answer === j} onChange={() => setQ(i, { answer: j })} aria-label="Doğru şık" />
                  <input className={`${t.input} ${q.answer === j ? 'border-positive' : ''}`} value={o} disabled={q.type === 'truefalse'}
                    onChange={(e) => setQ(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} />
                </div>
              ))}
            </div>
          ))}
          <span className="text-[12px] text-fg-3">Sorular reçeteden üretildi; düzeltebilirsin. Doğru şık işaretli olan. Geçme notu 3'te 2. Sorular modül sınavına da eklenir.</span>
        </div>
      </Section>

      <Section label="5 · Bülten">
        <div className={`${t.card} ${t.cardPad} flex flex-col gap-3`}>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={withBulletin} onChange={(e) => setWithBulletin(e.target.checked)} /> Bütün mağazalara duyur</label>
          {withBulletin && (
            <>
              <select className={t.input} value={bKind} onChange={(e) => setBKind(e.target.value as BulletinKind)}>
                <option value="kampanya">Kampanya</option><option value="duyuru">Duyuru</option>
              </select>
              <input className={t.input} value={bTitle} maxLength={MAX.title} onChange={(e) => { setBTouched(true); setBTitle(e.target.value); }} />
              <textarea className={`${t.textarea} min-h-28`} value={bBody} maxLength={MAX.long} onChange={(e) => { setBTouched(true); setBBody(e.target.value); }} />
              <label className={t.field}><span className={t.label}>Kampanya bitişi (isteğe bağlı)</span>
                <input type="date" className={t.input} value={bUntil} onChange={(e) => setBUntil(e.target.value)} /></label>
            </>
          )}
        </div>
      </Section>

      <Section label="6 · Görev">
        <div className={`${t.card} ${t.cardPad} flex flex-col gap-3`}>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={withTask} onChange={(e) => setWithTask(e.target.checked)} /> Bütün mağazalara "mini sınavı geç" görevi ({taskStores.length} mağaza)</label>
          {withTask && taskStores.length < activeStores.length && (
            <span className="text-[12px] text-fg-3">Aktif baristası olmayan {activeStores.length - taskStores.length} mağazaya görev açılmaz.</span>
          )}
          {withTask && (
            <>
              <label className={t.field}><span className={t.label}>Son tarih</span>
                <input type="date" className={t.input} value={due} min={localDay()} onChange={(e) => setDue(e.target.value)} /></label>
              <input className={t.input} value={taskNote} onChange={(e) => setTaskNote(e.target.value)} placeholder="Not (isteğe bağlı): Hafta sonu yoğunluğundan önce." />
            </>
          )}
        </div>
      </Section>

      <ErrorText>{error}</ErrorText>
      {/* Eylem çubuğu ekranın altına sabit, opak ve tam genişlikte. Eskiden
          formun içinde yarı saydam "sticky" bir karttı: alanların üstünde
          yüzüyor, kaydırınca arkasından form görünüyordu. Boşluk, son alanın
          çubuğun altında kalmaması için. */}
      <div className="h-20 md:h-12" aria-hidden />
      <div className="fixed inset-x-0 md:left-60 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-30 bg-bean/95 backdrop-blur-xl border-t border-line">
       <div className="mx-auto w-full max-w-[560px] px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0 text-[13px] text-fg-2">
          1 reçete · {quiz.length} soru{withBulletin ? ' · 1 bülten' : ''}{withTask ? ` · ${taskStores.length} görev` : ''}
          {!publishNow && <div className="text-[12px] text-fg-3">Kahve Operasyon Direktörü onaylayınca yayına girer.</div>}
          {/* Hata sayfanın en altında kalıyordu; düğmeye formun ortasında basan görmüyordu. */}
          {error && <div className="text-[12px] text-negative mt-1">{error}</div>}
        </div>
        <button className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`} disabled={busy} onClick={save}>
          {busy ? <Spinner size={16} /> : publishNow ? 'Yayınla' : 'Onaya gönder'}
        </button>
       </div>
      </div>
    </Page>
  );
};
