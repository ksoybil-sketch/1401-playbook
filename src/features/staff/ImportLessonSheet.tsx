import React, { useEffect, useMemo, useRef, useState } from 'react';
import { commitChange, lastProposalId, newId, resultText } from '../../api/changes';
import { errorText } from '../../api/backend';
import { useContent } from '../../store/content';
import { readSheet } from '../../lib/sheet';
import { blocksToQuestions, rowsToLesson, textToLesson, TEMPLATE_CSV, type ImportResult } from '../../lib/importLesson';
import { getAiKey } from '../../lib/aiKey';
import { ocrPagesToLesson, type OcrPage } from '../../lib/ocrLayout';

const emptyResult = (title: string): ImportResult => ({ title, durationMin: 1, blocks: [], warnings: [] });

/**
 * Görüntü sayfalarını (OCR) derse ekler. Ders adı için dosya adı tercih
 * edilir: tasarımlı kapaklarda en büyük yazı çoğu zaman bir slogan.
 */
function withOcr(r: ImportResult, pages: OcrPage[], fileTitle: string): ImportResult {
  if (!pages.length) return r;
  const o = ocrPagesToLesson(pages);
  const blocks = [...r.blocks, ...o.blocks];
  const words = o.words + r.blocks.reduce((n, b) => n + ('text' in b ? b.text.split(/\s+/).length : 0), 0);
  const title = fileTitle.split(/\s+/).length >= 2 ? fileTitle : o.title || r.title;
  return {
    ...r,
    title,
    blocks,
    durationMin: Math.max(1, Math.round(words / 180)),
    warnings: [
      ...r.warnings.filter((w) => !/Ders adı bulunamadı|metin çıkmadı/i.test(w)),
      `${pages.length} sayfa görüntüydü, yazı OCR ile okundu: yazım hatalarına ve başlıklara bak.`,
      ...(blocks.length ? [] : ['Görüntüden okunabilir metin çıkmadı. Daha net bir tarama dene.'])
    ]
  };
}
import { LessonBlocks } from '../academy/LessonBlocks';
import { Icon } from '../../ui/Icon';
import { Sheet, Spinner, ErrorText, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';

/**
 * Excel / CSV / PDF / görsel dosyasından ders taslağı ve soru önerileri
 * oluşturur. PDF'in türü fark etmez: metinli PDF doğrudan okunur, taranmış
 * sayfalar OCR'dan geçer; yapay zekâ anahtarı tanımlıysa dosya Claude'a
 * gider ve İngilizce kaynaktan da Türkçe ders + çeşitli sorular çıkar.
 *
 * İki şey önemli:
 *  1. Kaydetmeden önce **baristada nasıl görüneceği** gösterilir. Panelde
 *     blok blok yazarken bunu kestirmek zordu; asıl şikâyet buydu.
 *  2. Ders **taslak** olarak kaydedilir. İçe aktarma tahmin içerir, bu
 *     yüzden hiçbir dosya doğrudan yayına çıkmaz.
 */

const ACCEPT = '.xlsx,.xls,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf';
const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|heic)$/i.test(f.name);
const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

export const ImportLessonSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  /** Modül editöründen açıldığında sabit; İçerik sayfasından açıldığında seçilir. */
  fixedModuleId?: string;
  /** proposalId: ders onaya gönderildiyse önerinin kimliği. */
  onCreated: (lessonId: string, proposalId?: string | null) => void;
}> = ({ open, onClose, fixedModuleId, onCreated }) => {
  const { tracks, modules, lessons } = useContent();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [pickedModule, setPickedModule] = useState('');
  const [progress, setProgress] = useState('');
  const [aiKey, setAiKey] = useState<string | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Anahtar yalnızca müdür/bölge müdürü/geliştirici için okunur; diğerlerinde null.
  useEffect(() => { if (open) getAiKey().then(setAiKey).catch(() => setAiKey(null)); }, [open]);

  const moduleId = fixedModuleId || pickedModule;

  /** Modüller, panelde göründükleri sırayla: yol → modül. */
  const options = useMemo(
    () =>
      tracks
        .flatMap((tr) =>
          modules
            .filter((m) => m.trackId === tr.id)
            .map((m) => ({ id: m.id, label: `${tr.title} · ${m.title}` }))
        ),
    [tracks, modules]
  );

  const nextOrder = useMemo(() => {
    const ls = lessons.filter((l) => l.moduleId === moduleId);
    return ls.length ? Math.max(...ls.map((l) => l.order)) + 1 : 1;
  }, [lessons, moduleId]);

  const reset = () => { setResult(null); setError(null); setFileName(''); setPicked(new Set()); };

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const moduleTitle = modules.find((m) => m.id === moduleId)?.title;
    const finish = (r: ImportResult) => {
      if (!r.questions) { r.questions = blocksToQuestions(r.blocks, r.title); r.source = 'rules'; }
      setResult(r);
      setPicked(new Set(r.questions.map((_, i) => i)));
    };
    try {
      if ((isPdf(file) || isImage(file)) && aiKey && useAi) {
        const { lessonFromFileWithAI } = await import('../../lib/aiLesson');
        finish(await lessonFromFileWithAI(file, aiKey, { moduleTitle }, setProgress));
      } else if (isPdf(file)) {
        const { extractPdfText } = await import('../../lib/pdfText');
        const { text, pages, ocrPages } = await extractPdfText(file, 20, setProgress);
        const r = withOcr(text.trim() ? textToLesson(text, base) : emptyResult(base), ocrPages, base);
        if (pages > 20) r.warnings.push(`PDF ${pages} sayfa; ilk 20 sayfa okundu.`);
        if (!aiKey) r.warnings.push('Yapay zekâ desteği kapalı: ders kaynağın dilinde kalır, sorular yalnızca metindeki sayılardan üretilir.');
        finish(r);
      } else if (isImage(file)) {
        const { ocrPage } = await import('../../lib/pdfText');
        finish(withOcr(emptyResult(base), [await ocrPage(file, setProgress)], base));
      } else {
        const rows = await readSheet(file);
        finish(rowsToLesson(rows, base));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : errorText(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const save = async () => {
    if (!result || !result.blocks.length) return;
    if (!moduleId) { setError('Dersin ekleneceği modülü seç.'); return; }
    setBusy(true);
    try {
      const id = newId('lessons');
      // Seçilen sorular modülün soru bankasına aynı değişiklikle girer;
      // onaya gidiyorsa ders ve sorular tek öneri olarak gider.
      const qOps = (result.questions || []).filter((_, i) => picked.has(i)).map((q) => ({
        op: 'set' as const, col: 'questions' as const, id: newId('questions'),
        data: { moduleId, type: q.type, prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation, kind: q.kind, imageUrl: '' }
      }));
      const r = await commitChange([{ op: 'set', col: 'lessons', id, data: {
        moduleId,
        title: result.title,
        order: nextOrder,
        durationMin: result.durationMin,
        blocks: result.blocks,
        // İçe aktarılan ders taslak gelir: önce gözden geçirilsin.
        published: false
      } }, ...qOps], { kind: 'lesson', title: result.title, summary: `Dosyadan ders${qOps.length ? ` + ${qOps.length} soru` : ''} · ${fileName}` });
      toast(resultText(r, 'Ders taslak olarak oluşturuldu.'), 'positive');
      onCreated(id, r === 'proposed' ? lastProposalId : null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
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

  return (
    <Sheet
      open
      title="Dosyadan ders ekle"
      onClose={busy ? () => {} : () => { reset(); onClose(); }}
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={downloadTemplate} className={`${t.btn} ${t.btnGhost} ${t.btnLg}`}>
            <Icon name="download" size={15} /> Şablon
          </button>
          {result && (
            <button onClick={reset} disabled={busy} className={`${t.btn} ${t.btnSecondary} ${t.btnLg}`}>Başka dosya</button>
          )}
          <button
            onClick={save}
            disabled={busy || !result || !result.blocks.length || !moduleId}
            className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1`}
          >
            {busy ? <Spinner size={16} /> : `Taslak olarak ekle${picked.size ? ` · ${picked.size} soru` : ''}`}
          </button>
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
            Ders bu modülün sonuna, taslak olarak eklenir.
          </span>
        </div>
      )}

      {!result && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={`${t.emptyState} w-full hover:bg-panel-2 transition-colors cursor-pointer`}
        >
          {busy ? <Spinner size={22} /> : <Icon name="upload" size={22} className="text-fg-3" />}
          <span className="text-[14px] font-medium">{busy ? (progress || 'Okunuyor…') : 'Dosya seç'}</span>
          <span className={t.emptyText}>
            PDF (metinli ya da taranmış), fotoğraf / ekran görüntüsü, Excel ya da CSV. Excel şablonu için aşağıdaki "Şablon" düğmesini kullan.
          </span>
        </button>
      )}

      {!result && (
        aiKey ? (
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-line bg-panel text-[13px] cursor-pointer">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="mt-0.5" />
            <span>
              <strong>Yapay zekâ ile oku</strong> <span className="text-fg-3">(PDF ve görseller)</span><br />
              <span className="text-fg-3">Dosya Claude'a gönderilir: İngilizce kaynaktan da Türkçe ders ve farklı türde sınav soruları hazırlanır. Kapalıysa metin ve OCR ile kural tabanlı okunur.</span>
            </span>
          </label>
        ) : (
          <p className="text-[12px] text-fg-3 leading-relaxed">
            Taranmış sayfalar ve fotoğraflar tarayıcıda OCR ile okunur (ilk kullanımda dil verisi iner). Yapay zekâ desteği açık değil: ders kaynağın dilinde kalır, sorular daha basit çıkar.
          </p>
        )
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <div className={`${t.listGroup}`}>
            <div className={`${t.listRowStatic} justify-between`}>
              <span className="text-[13px] text-fg-2">Dosya</span>
              <span className="text-[13px] font-medium truncate max-w-[60%]">{fileName}</span>
            </div>
            <div className={`${t.listRowStatic} justify-between`}>
              <span className="text-[13px] text-fg-2">Ders adı</span>
              <span className="text-[13px] font-medium truncate max-w-[60%]">{result.title}</span>
            </div>
            <div className={`${t.listRowStatic} justify-between`}>
              <span className="text-[13px] text-fg-2">Çıkarılan blok</span>
              <span className="text-[13px] font-medium tnum">{result.blocks.length} · {result.durationMin} dk</span>
            </div>
          </div>

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

          {(result.questions?.length || 0) > 0 && (
            <div className="flex flex-col gap-2">
              <span className={t.label}>
                Soru bankasına eklenecek sorular · {picked.size}/{result.questions!.length}
                <span className="text-fg-3 font-normal"> — {result.source === 'ai' ? 'yapay zekâ önerisi' : 'metinden otomatik'}; istemediklerinin işaretini kaldır</span>
              </span>
              <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto">
                {result.questions!.map((q, i) => (
                  <label key={i} className={`flex items-start gap-2.5 p-3 rounded-xl border text-[13px] cursor-pointer ${picked.has(i) ? 'border-line-2 bg-panel-2' : 'border-line bg-panel opacity-60'}`}>
                    <input type="checkbox" className="mt-0.5" checked={picked.has(i)}
                      onChange={() => { const n = new Set(picked); if (n.has(i)) n.delete(i); else n.add(i); setPicked(n); }} />
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

          <div className="flex flex-col gap-2">
            <span className={t.label}>Baristada böyle görünecek</span>
            <div className="rounded-xl border border-line bg-espresso p-4 max-h-[50vh] overflow-y-auto">
              <h1 className="text-[20px] font-bold mb-1">{result.title}</h1>
              <div className="text-[12px] text-fg-3 mb-4">{result.durationMin} dk</div>
              {result.blocks.length ? (
                <LessonBlocks blocks={result.blocks} />
              ) : (
                <span className="text-[13px] text-fg-3">Gösterilecek içerik çıkmadı.</span>
              )}
            </div>
          </div>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};
