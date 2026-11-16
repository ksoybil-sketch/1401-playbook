import React, { useEffect, useState } from 'react';
import { useSession } from '../../store/session';
import { backend, errorText } from '../../api/backend';
import { ErrorText, Sheet, Spinner, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';

/**
 * Panel ve Yönetim Kurulu: "Şifremi değiştir". E-postaya dayanmaz; mevcut
 * şifre + yeni şifre (iki kez). Bkz. backend.changeOwnPassword.
 */
export const ChangePasswordSheet: React.FC<{ open: boolean; onClose: () => void; forced?: boolean }> = ({ open, onClose, forced }) => {
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
      await backend.changeOwnPassword(current, next, forced);
      toast(forced ? 'Şifren belirlendi. Hoş geldin!' : 'Şifren değişti. Bir sonraki girişte yeni şifreni kullan.', 'positive');
      // Zorunlu ekranda onClose çıkış demek; başarıda ekranı oturum bayrağı kaldırır.
      if (!forced) onClose();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} title={forced ? 'Kendi şifreni belirle' : 'Şifremi değiştir'} onClose={onClose} dirty={!forced && !busy && !!(current || next || again)}
      footer={<button className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`} onClick={() => save()} disabled={busy}>
        {busy ? <Spinner size={16} /> : <><Icon name="key" size={16} /> Şifreyi değiştir</>}</button>}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <label className={t.field}>
          <span className={t.label}>{forced ? 'Sana verilen geçici şifre' : 'Mevcut şifre'}</span>
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
      {forced && <p className="text-[13px] text-fg-2 leading-relaxed">Hesabın geçici bir şifreyle açıldı. Devam etmeden önce yalnızca senin bildiğin bir şifre belirle.</p>}
      <p className="text-[12.5px] text-fg-3 leading-relaxed">
        En az 8 karakter. Başka cihazlarda açık kalan oturumların en geç bir saat içinde kapanır.
        Cihazın çalındıysa Kahve Operasyon Direktörü'nden erişimini hemen kaldırmasını iste.
      </p>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
};

/** Geçici şifreyle açılan hesabın ilk girişi: şifre değişmeden panel açılmaz. */
export const ForcedPasswordScreen: React.FC = () => {
  const logout = useSession((x) => x.logout);
  return (
    <div className="min-h-[100dvh] bg-espresso flex flex-col items-center justify-center gap-4 p-6">
      <img src="/icons/logo.svg" alt="" className="w-10 h-10 opacity-90 logo-mark" />
      <div className="text-[15px] font-semibold">1401 Campus</div>
      <button onClick={() => void logout()} className={`${t.btn} ${t.btnGhost} ${t.btnSm}`}><Icon name="logout" size={14} /> Çıkış</button>
      {/* Kapatma (×) bu ekranda çıkış yapar. */}
      <ChangePasswordSheet open forced onClose={() => void logout()} />
    </div>
  );
};
