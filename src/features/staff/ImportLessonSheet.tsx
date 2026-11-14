import React, { useEffect, useMemo, useRef, useState } from 'react';
import { commitChange, lastProposalId, newId, resultText } from '../../api/changes';
import { errorText } from '../../api/backend';
import { useContent } from '../../store/content';
import { readSheet } from '../../lib/sheet';
import { blocksToQuestions, rowsToLesson, TEMPLATE_CSV, type DraftQuestion, type ImportResult, type LessonDraft } from '../../lib/importLesson';
import { getAiKeyStatus, type AiKeyStatus } from '../../lib/aiKey';
import { ocrPagesToLesson, type OcrPage } from '../../lib/ocrLayout';
import { blocksToLessons, pdfLinesToLessons } from '../../lib/pdfLesson';
import { LessonBlocks } from '../academy/LessonBlocks';
import { Icon } from '../../ui/Icon';
import { Sheet, Spinner, ErrorText, toast, sendOrQueue, QUEUED_TEXT } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { IS_ANDROID_APP } from '../../lib/backButton';

/**
 * Excel / CSV / PDF / görsel dosyasından ders taslakları ve soru önerileri
 * oluşturur. PDF'in türü fark etmez: metinli PDF doğrudan okunur, taranmış
 * sayfalar OCR'dan geçer; yapay zekâ anahtarı tanımlıysa dosya Claude'a
 * gider ve İngilizce kaynaktan da Türkçe ders + çeşitli sorular çıkar.
 *
 *  1. Dosya seçilir ya da kutuya sürüklenip bırakılır.
 *  2. PDF 20 sayfadan uzunsa önce hangi sayfaların okunacağı sorulur.
 *  3. Uzun kaynak, bölümlerinden mevcut modüllerdeki gibi 1-4 dakikalık
 *     derslere bölünür (src/lib/pdfLesson.ts). Hangilerinin ekleneceği
 *     işaretlenir; her biri **baristada nasıl görüneceğiyle** önizlenir.
 *  4. Dersler **taslak** olarak kaydedilir. İçe aktarma tahmin içerir, bu
 *     yüzden hiçbir dosya doğrudan yayına çıkmaz.
 */

const ACCEPT = '.xlsx,.xls,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf';
const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|heic)$/i.test(f.name);
const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
/** Bu sayıdan uzun PDF'te sayfa aralığı sorulur; bir seferde en fazla RANGE_MAX sayfa okunur. */
const ASK_RANGE_OVER = 20;
const RANGE_MAX = 40;

const AI_OFF: Record<Exclude<AiKeyStatus['reason'], 'ok'>, string> = {
  none: 'Yapay zekâ anahtarı tanımlı değil. Uygulama geliştiricisi Akademi → "Yapay zekâ" düğmesinden anahtarı girince PDF ve görseller Claude ile okunur.',
  denied: 'Yapay zekâ bu hesabın rolünde kapalı.',
  offline: 'Yapay zekâ anahtarı okunamadı (bağlantı sorunu). Sayfayı yenileyip tekrar dene.'
};

/** Taranmış sayfaları (OCR) derslere çevirir; ders adı için dosya adı tercih edilir. */
function ocrLessons(pages: OcrPage[], fileTitle: string): { lessons: LessonDraft[]; warning: string } {
  const o = ocrPagesToLesson(pages);
  const title = fileTitle.split(/\s+/).length >= 2 ? fileTitle : o.title || fileTitle;
  return {
    lessons: blocksToLessons(o.blocks, title),
    warning: o.blocks.length
      ? `${pages.length} sayfa görüntüydü, yazı OCR ile okundu: yazım hatalarına ve başlıklara bak.`
      : 'Görüntüden okunabilir metin çıkmadı. Daha net bir tarama dene.'
  };
}

export const ImportLessonSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  /** Modül editöründen açıldığında sabit; İçerik sayfasından açıldığında seçilir. */
  fixedModuleId?: string;
  /** proposalId: dersler onaya gönderildiyse önerinin kimliği; count: eklenen ders sayısı. */
  onCreated: (lessonId: string, proposalId: string | null | undefined, info: { count: number; moduleId: string }) => void;
}> = ({ open, onClose, fixedModuleId, onCreated }) => {
  const { tracks, modules, lessons } = useContent();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [pickedModule, setPickedModule] = useState('');
  const [progress, setProgress] = useState('');
  const [ai, setAi] = useState<AiKeyStatus | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [pickedLessons, setPickedLessons] = useState<Set<number>>(new Set());
  const [pickedQ, setPickedQ] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** Uzun PDF: sayfa aralığı bekleniyor. */
  const [pending, setPending] = useState<{ file: File; pages: number } | null>(null);
  const [range, setRange] = useState({ from: 1, to: ASK_RANGE_OVER });
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Okuma (yapay zekâ, OCR) dakikalar sürebiliyor ve iptal yolu yoktu: pencere
   * kapanmıyordu. Kapatınca bu sayaç artar, yarım kalan okumanın sonucu yok sayılır.
   */
  const token = useRef(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) getAiKeyStatus().then(setAi); }, [open]);
  const aiKey = ai?.reason === 'ok' ? ai.key : null;

  const moduleId = fixedModuleId || pickedModule;

  /** Modüller, panelde göründükleri sırayla: yol → modül. */
  const options = useMemo(
    () => tracks.flatMap((tr) => modules.filter((m) => m.trackId === tr.id).map((m) => ({ id: m.id, label: `${tr.title} · ${m.title}` }))),
    [tracks, modules]
  );

  const moduleLessons = useMemo(() => lessons.filter((l) => l.moduleId === moduleId), [lessons, moduleId]);
  const nextOrder = moduleLessons.length ? Math.max(...moduleLessons.map((l) => l.order)) + 1 : 1;

  const reset = () => {
    setResult(null); setError(null); setFileName(''); setPickedLessons(new Set()); setPickedQ(new Set()); setPreview(0); setPending(null);
  };

  const run = async (file: File, pdfRange: { from: number; to: number } | null, total: number) => {
    const my = ++token.current;
    const live = () => my === token.current;
    setBusy(true);
    setError(null);
    setResult(null);
    setPending(null);
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const moduleTitle = modules.find((m) => m.id === moduleId)?.title;
    const finish = (r: ImportResult) => {
      if (!live()) return;
      if (!r.questions) {
        r.questions = r.lessons.flatMap((l, i): DraftQuestion[] => blocksToQuestions(l.blocks, l.title).map((q) => ({ ...q, lesson: i })));
        r.source = 'rules';
      }
      if (!r.lessons.length) { setError('Dosyadan ders çıkarılamadı.' + (r.warnings.length ? ' ' + r.warnings.join(' ') : '')); return; }
      setResult(r);
      setPickedLessons(new Set(r.lessons.map((_, i) => i)));
      setPickedQ(new Set(r.questions.map((_, i) => i)));
      setPreview(0);
    };
    try {
      if ((isPdf(file) || isImage(file)) && aiKey && useAi) {
        const { lessonFromFileWithAI } = await import('../../lib/aiLesson');
        finish(await lessonFromFileWithAI(file, aiKey, {
          moduleTitle,
          existingTitles: moduleLessons.map((l) => l.title),
          pages: pdfRange ? { ...pdfRange, total } : undefined
        }, setProgress));
      } else if (isPdf(file)) {
        const { extractPdf } = await import('../../lib/pdfText');
        const read = await extractPdf(file, pdfRange, setProgress);
        const text = read.lines.length ? pdfLinesToLessons(read.lines, read.to - read.from + 1, base) : { lessons: [], warnings: [] };
        const warnings = [...text.warnings];
        let all = text.lessons;
        if (read.ocrPages.length) {
          const o = ocrLessons(read.ocrPages, base);
          all = [...all, ...o.lessons.map((l) => ({ ...l, pages: read.ocrPageNos.length === 1 ? `${read.ocrPageNos[0]}` : `${read.ocrPageNos[0]}-${read.ocrPageNos[read.ocrPageNos.length - 1]}` }))];
          warnings.push(o.warning);
        }
        if (read.from > 1 || read.to < read.pages) warnings.unshift(`PDF ${read.pages} sayfa; ${read.from}-${read.to}. sayfalar okundu.`);
        if (ai && ai.reason !== 'ok') warnings.push(`${AI_OFF[ai.reason]} Bu yüzden dersler kaynağın dilinde kaldı, sorular yalnızca metindeki ölçü ve adımlardan üretildi.`);
        finish({ lessons: all, warnings });
      } else if (isImage(file)) {
        const { ocrPage } = await import('../../lib/pdfText');
        const o = ocrLessons([await ocrPage(file, setProgress)], base);
        finish({ lessons: o.lessons, warnings: [o.warning] });
      } else {
        const rows = await readSheet(file);
        finish(rowsToLesson(rows, base));
      }
    } catch (e) {
      if (live()) setError(e instanceof Error ? e.message : errorText(e));
    } finally {
      if (live()) { setBusy(false); setProgress(''); }
    }
  };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);
    if (isPdf(file)) {
      setBusy(true);
      setProgress('PDF açılıyor…');
      try {
        const { pdfPageCount } = await import('../../lib/pdfText');
        const pages = await pdfPageCount(file);
        if (pages > ASK_RANGE_OVER) {
          setRange({ from: 1, to: ASK_RANGE_OVER });
          setPending({ file, pages });
          return;
        }
        await run(file, null, pages);
      } catch (e) {
        setError(e instanceof Error ? e.message : errorText(e));
      } finally {
        setBusy(false);
        setProgress('');
      }
      return;
    }
    await run(file, null, 0);
  };

  // Sürükle-bırak: pencere açıkken dosya nereye bırakılırsa bırakılsın
  // tarayıcı onu yeni sekmede açmasın; bırakılan dosya okunur.
  const canDrop = open && !busy && !result && !pending;
  useEffect(() => {
    if (!open) return;
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = canDrop ? 'copy' : 'none';
      setDragging(canDrop);
    };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f && canDrop) handleFile(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
    // handleFile her çizimde yeni; bağımlılık canDrop yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canDrop, moduleId, aiKey, useAi]);

  const chosenLessons = result ? result.lessons.map((l, i) => ({ l, i })).filter(({ i }) => pickedLessons.has(i)) : [];
  const visibleQ = result?.questions?.map((q, i) => ({ q, i })).filter(({ q }) => q.lesson === undefined || pickedLessons.has(q.lesson)) || [];
  const chosenQ = visibleQ.filter(({ i }) => pickedQ.has(i));

  const save = async () => {
    if (!result || !chosenLessons.length) return;
    if (!moduleId) { setError('Derslerin ekleneceği modülü seç.'); return; }
    setBusy(true);
    try {
      const ids = chosenLessons.map(() => newId('lessons'));
      const lessonOps = chosenLessons.map(({ l }, k) => ({
        op: 'set' as const, col: 'lessons' as const, id: ids[k], data: {
          moduleId,
          title: l.title,
          order: nextOrder + k,
          durationMin: l.durationMin,
          blocks: l.blocks,
          // İçe aktarılan ders taslak gelir: önce gözden geçirilsin.
          published: false,
          // kaynak 'panel': "Müfredatı güncelle" dosyadan eklenen dersi silmesin.
          kaynak: 'panel'
        }
      }));
      // Seçilen sorular modülün soru bankasına aynı değişiklikle girer;
      // onaya gidiyorsa dersler ve sorular tek öneri olarak gider.
      const qOps = chosenQ.map(({ q }) => ({
        op: 'set' as const, col: 'questions' as const, id: newId('questions'),
        data: { moduleId, type: q.type, prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation, kind: q.kind, imageUrl: '', kaynak: 'panel' }
      }));
      const n = chosenLessons.length;
      const title = n > 1 ? `${chosenLessons[0].l.title} ve ${n - 1} ders daha` : chosenLessons[0].l.title;
      setSaving(true);
      let r: 'applied' | 'proposed' | null = null;
      const q = await sendOrQueue(commitChange([...lessonOps, ...qOps], {
        kind: 'lesson', title,
        summary: `Dosyadan ${n} ders${qOps.length ? ` + ${qOps.length} soru` : ''} · ${fileName}`
      }).then((x) => { r = x; }));
      if (q === 'queued') {
        // Çevrimdışı: yazım kuyrukta, pencere kapanabilir.
        toast(QUEUED_TEXT, 'positive');
        reset();
        onClose();
        return;
      }
      toast(resultText(r!, n > 1 ? `${n} ders taslak olarak oluşturuldu.` : 'Ders taslak olarak oluşturuldu.'), 'positive');
      onCreated(ids[0], r === 'proposed' ? lastProposalId : null, { count: n, moduleId });
      reset();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    // Excel'in Türkçe sürümü UTF-8'i BOM olmadan yanlış okuyor.
    const blob = new Blob(['﻿' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ders-sablonu.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  const span = range.to - range.from + 1;
  const rangeOk = pending && range.from >= 1 && range.to <= pending.pages && span >= 1 && span <= RANGE_MAX;
  const shown = result?.lessons[preview];

  return (
    <Sheet
      open
      title="Dosyadan ders ekle"
      onClose={saving ? () => {} : () => { token.current++; setBusy(false); setProgress(''); reset(); onClose(); }}
      footer={
        <div className="flex gap-2 w-full">
          {/* APK'da dosya indirme çalışmıyor; şablon yalnızca tarayıcıda. */}
          {!IS_ANDROID_APP && !result && !pending && (
            <button onClick={downloadTemplate} className={`${t.btn} ${t.btnGhost} ${t.btnLg}`}>
              <Icon name="download" size={15} /> Şablon
            </button>
          )}
          {(result || pending) && (
            <button onClick={reset} disabled={busy} className={`${t.btn} ${t.btnSecondary} ${t.btnLg}`}>Başka dosya</button>
          )}
          {pending ? (
            <button onClick={() => run(pending.file, range, pending.pages)} disabled={busy || !rangeOk} className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1`}>
              {busy ? <Spinner size={16} /> : `${span > 0 ? span : 0} sayfayı oku`}
            </button>
          ) : (
            <button
              onClick={save}
              disabled={busy || !result || !chosenLessons.length || !moduleId}
              className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1`}
            >
              {busy ? <Spinner size={16} /> : `Taslak olarak ekle${result ? ` · ${chosenLessons.length} ders` : ''}${chosenQ.length ? ` · ${chosenQ.length} soru` : ''}`}
            </button>
          )}
        </div>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      {!fixedModuleId && (
        <div className={t.field}>
          <span className={t.label}>Hangi modüle eklensin</span>
          <select
            className={t.input}
            value={pickedModule}
            onChange={(e) => { setPickedModule(e.target.value); setError(null); }}
          >
            <option value="">Modül seç…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <span className="text-[11px] text-fg-3">
            Dersler bu modülün sonuna, taslak olarak eklenir.
          </span>
        </div>
      )}

      {!result && !pending && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={`${t.emptyState} w-full transition-colors cursor-pointer border-2 border-dashed ${dragging ? 'border-crema bg-panel-2' : 'border-line hover:bg-panel-2'}`}
        >
          {busy ? <Spinner size={22} /> : <Icon name="upload" size={22} className={dragging ? 'text-crema' : 'text-fg-3'} />}
          <span className="text-[14px] font-medium">
            {busy ? (progress || 'Okunuyor…') : dragging ? 'Bırak, okuyayım' : IS_ANDROID_APP ? 'Dosya seç' : 'Dosya seç ya da buraya sürükle'}
          </span>
          <span className={t.emptyText}>
            PDF (metinli ya da taranmış), fotoğraf / ekran görüntüsü, Excel ya da CSV.{IS_ANDROID_APP ? '' : ' Excel şablonu için aşağıdaki "Şablon" düğmesini kullan.'}
          </span>
        </button>
      )}

      {pending && (
        <div className="flex flex-col gap-3 p-4 rounded-xl border border-line bg-panel">
          <div className="text-[14px]"><strong>{fileName}</strong> {pending.pages} sayfa. Hangi sayfalar okunsun?</div>
          <div className="flex items-center gap-2">
            <label className={`${t.field} flex-1`}>
              <span className={t.label}>İlk sayfa</span>
              <input className={t.input} type="number" inputMode="numeric" min={1} max={pending.pages} value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: Number(e.target.value) || 1 }))} />
            </label>
            <label className={`${t.field} flex-1`}>
              <span className={t.label}>Son sayfa</span>
              <input className={t.input} type="number" inputMode="numeric" min={1} max={pending.pages} value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: Number(e.target.value) || 1 }))} />
            </label>
          </div>
          <span className={`text-[12px] ${rangeOk ? 'text-fg-3' : 'text-caution'}`}>
            {span > RANGE_MAX ? `Bir seferde en fazla ${RANGE_MAX} sayfa okunur; kalanını ayrıca yükleyebilirsin.`
              : !rangeOk ? `1 ile ${pending.pages} arasında bir aralık yaz.`
                : 'Kapak ve içindekiler sayfalarını dışarıda bırakmak sonucu iyileştirir. Uzun bölümler birkaç derse bölünür.'}
          </span>
        </div>
      )}

      {!result && !pending && ai && (
        aiKey ? (
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-line bg-panel text-[13px] cursor-pointer">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="mt-0.5" />
            <span>
              <strong>Yapay zekâ ile oku</strong> <span className="text-fg-3">(PDF ve görseller)</span><br />
              <span className="text-fg-3">Dosya Claude'a gönderilir: İngilizce kaynaktan da Türkçe dersler ve farklı türde sınav soruları hazırlanır. Kapalıysa metin ve OCR ile kural tabanlı okunur.</span>
            </span>
          </label>
        ) : (
          <p className="text-[12px] text-fg-3 leading-relaxed">
            {AI_OFF[ai.reason as Exclude<AiKeyStatus['reason'], 'ok'>]} Şimdilik PDF metinden, taranmış sayfalar ve fotoğraflar tarayıcıda OCR ile okunur: ders kaynağın dilinde kalır, sorular daha basit çıkar.
          </p>
        )
      )}

      {result && (
        <div className="flex flex-col gap-4">
          {result.warnings.length > 0 && (
            <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-caution-bg border border-caution-line">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-caution">
                Gözden geçir · {result.warnings.length}
              </span>
              {result.warnings.map((w, i) => (
                <span key={i} className="text-[12.5px] text-fg-2 leading-relaxed">{w}</span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className={t.label}>
              Dersler · {chosenLessons.length}/{result.lessons.length}
              <span className="text-fg-3 font-normal"> — {fileName}; istemediklerinin işaretini kaldır, önizlemek için dokun</span>
            </span>
            <div className={`${t.listGroup} max-h-[34vh] overflow-y-auto`}>
              {result.lessons.map((l, i) => (
                <div key={i} className={`${t.listRowStatic} gap-2.5 ${preview === i ? 'bg-panel-2' : ''}`}>
                  <input type="checkbox" aria-label={`${l.title} eklensin`} checked={pickedLessons.has(i)}
                    onChange={() => { const n = new Set(pickedLessons); if (n.has(i)) n.delete(i); else n.add(i); setPickedLessons(n); }} />
                  <button className="flex-1 min-w-0 text-left" onClick={() => setPreview(i)}>
                    <span className={`block text-[13.5px] font-medium truncate ${pickedLessons.has(i) ? '' : 'text-fg-3 line-through'}`}>{l.title}</span>
                    <span className="block text-[11.5px] text-fg-3 tnum">
                      {l.pages ? `s. ${l.pages} · ` : ''}{l.durationMin} dk · {l.blocks.length} blok
                    </span>
                  </button>
                  <Icon name="chevronRight" size={14} className={preview === i ? 'text-crema' : t.rowChevron} />
                </div>
              ))}
            </div>
          </div>

          {shown && (
            <div className="flex flex-col gap-2">
              <span className={t.label}>Baristada böyle görünecek{result.lessons.length > 1 ? ` · ${preview + 1}. ders` : ''}</span>
              <div className="rounded-xl border border-line bg-espresso p-4 max-h-[50vh] overflow-y-auto">
                <h1 className="text-[20px] font-bold mb-1">{shown.title}</h1>
                <div className="text-[12px] text-fg-3 mb-4">{shown.durationMin} dk</div>
                <LessonBlocks blocks={shown.blocks} />
              </div>
            </div>
          )}

          {visibleQ.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className={t.label}>
                Soru bankasına eklenecek sorular · {chosenQ.length}/{visibleQ.length}
                <span className="text-fg-3 font-normal"> — {result.source === 'ai' ? 'yapay zekâ önerisi' : 'metinden otomatik'}; istemediklerinin işaretini kaldır</span>
              </span>
              <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto">
                {visibleQ.map(({ q, i }) => (
                  <label key={i} className={`flex items-start gap-2.5 p-3 rounded-xl border text-[13px] cursor-pointer ${pickedQ.has(i) ? 'border-line-2 bg-panel-2' : 'border-line bg-panel opacity-60'}`}>
                    <input type="checkbox" className="mt-0.5" checked={pickedQ.has(i)}
                      onChange={() => { const n = new Set(pickedQ); if (n.has(i)) n.delete(i); else n.add(i); setPickedQ(n); }} />
                    <span className="min-w-0">
                      <span className="block font-medium leading-snug">{q.prompt}</span>
                      <span className="block text-positive mt-1">✓ {q.options[q.answer]}</span>
                      <span className="block text-fg-3 mt-0.5">{q.options.filter((_, j) => j !== q.answer).join(' · ')}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};
