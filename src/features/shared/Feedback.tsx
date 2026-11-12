import React, { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { errorText } from '../../api/backend';
import { useSession } from '../../store/session';
import { MediaInput } from '../staff/MediaInput';
import { Icon } from '../../ui/Icon';
import { Sheet, Spinner, ErrorText, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { FeedbackKind } from '../../../shared/types';

/**
 * "Bir sorun var / Önerim var" — uygulamanın her yerinden iki dokunuşla
 * geri bildirim. Hangi ekranda, hangi sürümde, kimden geldiği kendiliğinden
 * eklenir; kullanıcı yalnızca ne olduğunu yazar.
 */
export const FEEDBACK_KINDS: { id: FeedbackKind; label: string; hint: string; icon: 'alert' | 'book' | 'flash' }[] = [
  { id: 'hata', label: 'Bir şey çalışmıyor', hint: 'Ekran açılmıyor, düğme çalışmıyor…', icon: 'alert' },
  { id: 'icerik', label: 'İçerikte yanlış var', hint: 'Reçete ölçüsü, ders ya da soru hatalı', icon: 'book' },
  { id: 'oneri', label: 'Önerim var', hint: 'Şöyle olsa daha kolay olurdu…', icon: 'flash' }
];

function context() {
  const bundle = [...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src).find((s) => /assets\/index-/.test(s));
  return {
    path: location.hash.replace(/^#/, '') || '/',
    version: bundle ? bundle.split('/').pop()!.replace(/\.js$/, '') : 'dev',
    device: `${/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'telefon' : 'bilgisayar'} · ${window.innerWidth}×${window.innerHeight}`
  };
}

export const FeedbackSheet: React.FC<{ open: boolean; onClose: () => void; preset?: FeedbackKind; lessonId?: string; lessonTitle?: string }> = ({ open, onClose, preset, lessonId, lessonTitle }) => {
  const session = useSession((s) => s.session);
  const [kind, setKind] = useState<FeedbackKind>(preset || 'hata');
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const who = session.kind === 'staff' ? { uid: session.uid, name: session.name, role: session.role, store: '' }
    : session.kind === 'barista' ? { uid: session.uid, name: session.name, role: session.role, store: session.storeName }
      : session.kind === 'store' ? { uid: session.uid, name: `${session.storeName} telefonu`, role: 'store', store: session.storeName }
        : null;

  const send = async () => {
    if (!who) return;
    if (text.trim().length < 5) return setError('Kısaca ne olduğunu yaz.');
    setBusy(true);
    setError(null);
    try {
      await addDoc(collection(db, 'feedback'), {
        kind, text: text.trim().slice(0, 2000), ...(image ? { imageUrl: image } : {}),
        ...(lessonId ? { lessonId, lessonTitle: lessonTitle || '' } : {}),
        ...context(),
        by: who.uid, byName: who.name, role: who.role, storeName: who.store,
        status: 'yeni', createdAt: Date.now()
      });
      toast('Teşekkürler, iletildi.');
      setText(''); setImage('');
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title="Geri bildirim" onClose={busy ? () => {} : onClose}
      footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1`} disabled={busy} onClick={send}>{busy ? <Spinner size={16} /> : 'Gönder'}</button>}>
      <div className="flex flex-col gap-2">
        {FEEDBACK_KINDS.map((k) => (
          <button key={k.id} onClick={() => setKind(k.id)}
            className={`rounded-xl border p-3 text-left flex items-center gap-3 ${kind === k.id ? 'border-crema bg-panel-2' : 'border-line bg-panel'}`}>
            <Icon name={k.icon} size={16} className={kind === k.id ? 'text-crema' : 'text-fg-3'} />
            <span className="flex-1"><span className="block text-[14px] font-semibold">{k.label}</span><span className="block text-[12px] text-fg-3">{k.hint}</span></span>
          </button>
        ))}
      </div>
      {lessonTitle && <p className="text-[13px] text-fg-2">Konu: <b>{lessonTitle}</b></p>}
      <textarea className={`${t.textarea} min-h-28`} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={kind === 'icerik' ? '12 oz\'da süt 270 ml yazıyor, kitapçıkta 250 ml…' : kind === 'oneri' ? 'Şöyle olsa daha kolay olurdu…' : 'Ne yapıyordun, ne oldu?'} />
      <div className={t.field}><span className={t.label}>Ekran görüntüsü (isteğe bağlı)</span>
        <MediaInput url={image} kind="image" onChange={setImage} placeholder="Fotoğraf ya da ekran görüntüsü" /></div>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};

/** Listede bir satır: "Bir sorun mu var? Önerin mi var?" */
export const FeedbackRow: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={`${t.cardInteractive} p-3.5 flex items-center gap-3 text-left ${className}`}>
        <span className={t.iconChip('neutral')}><Icon name="message" size={16} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold">Bir sorun mu var? Önerin mi var?</span>
          <span className="block text-[12px] text-fg-3">Uygulamayı geliştiren ekibe doğrudan ulaşır</span>
        </span>
        <Icon name="chevronRight" size={16} className={t.rowChevron} />
      </button>
      <FeedbackSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
};

/** Reçete sayfasının altında küçük bağlantı: içerik hatası bildirimi. */
export const ReportContentLink: React.FC<{ lessonId: string; lessonTitle: string }> = ({ lessonId, lessonTitle }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="self-center text-[12.5px] text-fg-3 underline underline-offset-2 py-2">Bu reçetede bir yanlış mı var?</button>
      <FeedbackSheet open={open} onClose={() => setOpen(false)} preset="icerik" lessonId={lessonId} lessonTitle={lessonTitle} />
    </>
  );
};
