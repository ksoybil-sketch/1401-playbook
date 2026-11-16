import React, { useEffect, useState } from 'react';
import { backend, errorText } from '../../api/backend';
import { ErrorText, Sheet, Spinner, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';

/**
 * Panel ve Yönetim Kurulu: "Şifremi değiştir". E-postaya dayanmaz; mevcut
 * şifre + yeni şifre (iki kez). Bkz. backend.changeOwnPassword.
 */
export const ChangePasswordSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setCurrent(''); setNext(''); setAgain(''); setError(null); } }, [open]);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!current || !next) { setError('Mevcut ve yeni şifreyi yaz.'); return; }
    if (next !== again) { setError('Yeni şifre iki kutuda aynı değil.'); return; }
    setBusy(true);
    try {
      await backend.changeOwnPassword(current, next);
      toast('Şifren değişti. Bir sonraki girişte yeni şifreni kullan.');
      onClose();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} title="Şifremi değiştir" onClose={onClose} dirty={!busy && !!(current || next || again)}
      footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`} onClick={() => save()} disabled={busy}>
        {busy ? <Spinner size={16} /> : <><Icon name="key" size={16} /> Şifreyi değiştir</>}</button>}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <label className={t.field}>
          <span className={t.label}>Mevcut şifre</span>
          <input className={t.input} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </label>
        <label className={t.field}>
          <span className={t.label}>Yeni şifre</span>
          <input className={t.input} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className={t.field}>
          <span className={t.label}>Yeni şifre (tekrar)</span>
          <input className={t.input} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        <button type="submit" hidden />
      </form>
      <p className="text-[12.5px] text-fg-3 leading-relaxed">
        En az 8 karakter. Başka cihazlarda açık kalan oturumların en geç bir saat içinde kapanır.
        Cihazın çalındıysa Kahve Operasyon Direktörü'nden erişimini hemen kaldırmasını iste.
      </p>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};
