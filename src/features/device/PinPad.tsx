import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../ui/Icon';

/**
 * Sayısal tuş takımı — PIN ve 6 haneli kodlar için. Fiziksel klavye de
 * çalışır (web panelinde test ederken).
 */
export const PinPad: React.FC<{
  length: number;
  onComplete: (value: string) => void;
  busy?: boolean;
  /** Değiştiğinde girilen değer temizlenir ve sallanma animasyonu oynar. */
  errorKey?: number;
  masked?: boolean;
}> = ({ length, onComplete, busy, errorKey, masked = true }) => {
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!errorKey) return;
    setValue('');
    setShake(true);
    const t = setTimeout(() => setShake(false), 450);
    return () => clearTimeout(t);
  }, [errorKey]);

  const press = (d: string) => {
    if (busy) return;
    setValue((v) => (v.length >= length ? v : v + d));
  };

  // Tamamlanınca bir kez bildir. (State güncelleyicisinin içinde yan etki
  // yapılmaz — React StrictMode güncelleyiciyi iki kez çalıştırır ve PIN
  // iki kez gönderilip iki deneme hakkı yanardı.)
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  useEffect(() => {
    if (value.length !== length) return;
    const t = setTimeout(() => completeRef.current(value), 80);
    return () => clearTimeout(t);
  }, [value, length]);
  const back = () => !busy && setValue((v) => v.slice(0, -1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Tamamlandıktan sonra (başarılı ya da busy bitti) yeniden girişe izin ver.
  useEffect(() => {
    if (!busy && value.length === length) {
      const t = setTimeout(() => setValue(''), 600);
      return () => clearTimeout(t);
    }
  }, [busy, value.length, length]);

  return (
    <div className="flex flex-col items-center gap-7">
      <div className={`flex gap-3 ${shake ? 'animate-[shake_0.45s_ease-in-out]' : ''}`}>
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length;
          return masked ? (
            <span key={i} className={`w-3.5 h-3.5 rounded-full border transition-colors ${filled ? 'bg-crema border-crema' : 'border-line-2'}`} />
          ) : (
            <span key={i} className={`w-10 h-12 rounded-lg border flex items-center justify-center text-[22px] font-semibold tnum ${filled ? 'border-line-2 bg-panel-2' : 'border-line bg-panel'}`}>
              {value[i] || ''}
            </span>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)}>{d}</Key>
        ))}
        <span />
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={back} aria-label="Sil" subtle><Icon name="backspace" size={22} /></Key>
      </div>
    </div>
  );
};

const Key: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { subtle?: boolean }> = ({ subtle, children, ...rest }) => (
  <button
    {...rest}
    className={`w-[74px] h-[74px] rounded-full text-[26px] font-medium tnum flex items-center justify-center select-none transition-colors active:bg-panel-3 ${
      subtle ? 'text-fg-2' : 'bg-panel border border-line hover:bg-panel-2'
    }`}
  >
    {children}
  </button>
);
