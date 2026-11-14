import React, { useState } from 'react';
import { AppError, backend, errorText, weakPin } from '../../api/backend';
import { PinPad } from '../device/PinPad';
import { useBaristaSession } from './useBaristaData';
import { Icon } from '../../ui/Icon';
import { Sheet, Spinner, ErrorText, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';

/**
 * "Ben" sekmesi: PIN değiştir. Eski PIN → yeni PIN → yeni PIN tekrar.
 * Eski PIN istenir ki telefonda açık kalan bir oturumdan başkası PIN'i
 * değiştiremesin. PIN unutulduysa bu ekran değil, yönetici sıfırlaması.
 */
export const ChangePinRow: React.FC = () => {
  const s = useBaristaSession();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'old' | 'new' | 'again'>('old');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errKey, setErrKey] = useState(0);

  const close = () => { if (busy) return; setOpen(false); setStep('old'); setOldPin(''); setNewPin(''); setError(null); };
  const fail = (msg: string, back: typeof step) => { setError(msg); setErrKey((k) => k + 1); setStep(back); };

  const onComplete = async (v: string) => {
    setError(null);
    if (step === 'old') { setOldPin(v); setStep('new'); return; }
    if (step === 'new') {
      if (v === oldPin) return fail('Yeni PIN eskisiyle aynı olamaz.', 'new');
      if (weakPin(v)) return fail('Bu PIN çok kolay tahmin edilir, başka bir PIN seç.', 'new');
      setNewPin(v); setStep('again'); return;
    }
    if (v !== newPin) return fail('PIN\'ler eşleşmedi, yeni PIN\'i yeniden belirle.', 'new');
    setBusy(true);
    try {
      await backend.changeOwnPin(s.baristaId, oldPin, newPin);
      toast('PIN değişti. Bir sonraki girişte yeni PIN\'ini kullan.', 'positive');
      setBusy(false);
      close();
    } catch (e) {
      setBusy(false);
      fail(errorText(e), e instanceof AppError && e.code === 'old-pin' ? 'old' : 'new');
    }
  };

  const titles = {
    old: ['Şu anki PIN\'in', 'Önce kimliğini doğrula'],
    new: ['Yeni PIN', 'Kimseyle paylaşma; 1111, 1234 gibi PIN\'ler olmaz'],
    again: ['Yeni PIN tekrar', 'Doğrulamak için aynı PIN\'i gir']
  }[step];

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${t.cardInteractive} p-3.5 flex items-center gap-3 text-left`}>
        <span className={t.iconChip('neutral')}><Icon name="key" size={16} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold">PIN'ini değiştir</span>
          <span className="block text-[12px] text-fg-3">Eski PIN'ini bilmen gerekir. Unuttuysan müdürüne söyle.</span>
        </span>
        <Icon name="chevronRight" size={16} className={t.rowChevron} />
      </button>
      <Sheet open={open} title="PIN değiştir" onClose={close}>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="text-center">
            <div className="text-[16px] font-semibold">{titles[0]}</div>
            <div className="text-[12.5px] text-fg-3 mt-1">{titles[1]}</div>
          </div>
          <PinPad key={step} length={4} onComplete={onComplete} busy={busy} errorKey={errKey} />
          <div className="h-5">{busy && <Spinner />}</div>
          <div className="w-full"><ErrorText>{error}</ErrorText></div>
        </div>
      </Sheet>
    </>
  );
};
