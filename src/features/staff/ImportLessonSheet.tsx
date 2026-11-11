import React, { useMemo, useRef, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { errorText } from '../../api/backend';
import { useContent } from '../../store/content';
import { readSheet } from '../../lib/sheet';
import { rowsToLesson, textToLesson, TEMPLATE_CSV, type ImportResult } from '../../lib/importLesson';
import { LessonBlocks } from '../academy/LessonBlocks';
import { Icon } from '../../ui/Icon';
import { Sheet, Spinner, ErrorText, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';

/**
 * Excel / CSV / PDF dosyasından ders taslağı oluşturur.
 *
 * İki şey önemli:
 *  1. Kaydetmeden önce **baristada nasıl görüneceği** gösterilir. Panelde
 *     blok blok yazarken bunu kestirmek zordu; asıl şikâyet buydu.
 *  2. Ders **taslak** olarak kaydedilir. İçe aktarma tahmin içerir, bu
 *     yüzden hiçbir dosya doğrudan yayına çıkmaz.
 */

const ACCEPT = '.xlsx,.csv,.tsv,.txt,.pdf';

export const ImportLessonSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  /** Modül editöründen açıldığında sabit; İçerik sayfasından açıldığında seçilir. */
  fixedModuleId?: string;
  onCreated: (lessonId: string) => void;
}> = ({ open, onClose, fixedModuleId, onCreated }) => {
  const { tracks, modules, lessons } = useContent();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [pickedModule, setPickedModule] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  const reset = () => { setResult(null); setError(null); setFileName(''); };

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    try {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const { extractPdfText } = await import('../../lib/pdfText');
        const { text, pages } = await extractPdfText(file);
        const r = textToLesson(text, base);
        if (pages > 20) r.warnings.push(`PDF ${pages} sayfa; ilk 20 sayfa okundu.`);
        setResult(r);
      } else {
        const rows = await readSheet(file);
        setResult(rowsToLesson(rows, base));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result || !result.blocks.length) return;
    if (!moduleId) { setError('Dersin ekleneceği modülü seç.'); return; }
    setBusy(true);
    try {
      const r = await addDoc(collection(db, 'lessons'), {
        moduleId,
        title: result.title,
        order: nextOrder,
        durationMin: result.durationMin,
        blocks: result.blocks,
        // İçe aktarılan ders taslak gelir: önce gözden geçirilsin.
        published: false
      });
      toast('Ders taslak olarak oluşturuldu.', 'positive');
      onCreated(r.id);
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
            {busy ? <Spinner size={16} /> : 'Taslak olarak ekle'}
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
          <span className="text-[14px] font-medium">{busy ? 'Okunuyor…' : 'Dosya seç'}</span>
          <span className={t.emptyText}>
            Excel (.xlsx), CSV ya da PDF. Excel şablonu için aşağıdaki "Şablon" düğmesini kullan.
          </span>
        </button>
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
