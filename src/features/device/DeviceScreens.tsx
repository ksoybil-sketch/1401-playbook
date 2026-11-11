import React, { useState } from 'react';
import { BARISTA_ROLE_LABEL } from '../../lib/roles';
import { useNavigate } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { db, USE_EMULATOR } from '../../api/firebase';
import { backend, errorText } from '../../api/backend';
import { useSession } from '../../store/session';
import { useQueryLive } from '../../hooks/useFirestore';
import { Icon } from '../../ui/Icon';
import { Avatar, ErrorText, Spinner, Sheet } from '../../ui/kit';
import * as t from '../../ui/tokens';
import { PinPad } from './PinPad';
import { DemoStaffNotice, DemoPairNotice, DemoPinHint } from './DemoNotice';
import type { Barista } from '../../../shared/types';

const Brand: React.FC<{ sub?: string }> = ({ sub }) => (
  <div className="flex flex-col items-center gap-3 text-center">
    <img src="/icons/logo.svg" alt="" className="w-14 h-14 opacity-90" />
    <div>
      <div className="text-[20px] font-bold">1401 Campus</div>
      {sub && <div className="text-[13px] text-fg-3 mt-1">{sub}</div>}
    </div>
  </div>
);

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] gap-8 animate-[fadeIn_0.2s_ease-out]">
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/* Telefon henüz bağlı değil                                           */
/* ------------------------------------------------------------------ */

export const PairScreen: React.FC = () => {
  const pair = useSession((s) => s.pair);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errKey, setErrKey] = useState(0);

  const submit = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      await pair(code);
    } catch (e) {
      setError(errorText(e));
      setErrKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Brand sub="Barista eğitim ve standartlar" />
      <DemoPairNotice />
      <div className="flex flex-col items-center gap-2 text-center max-w-[320px]">
        <h1 className="text-[17px] font-semibold">Mağaza telefonunu bağla</h1>
        <p className="text-[13px] text-fg-3 leading-relaxed">
          Kahve Operasyonu panelinde mağazanın sayfasından <b className="text-fg-2">"Telefon bağla"</b> ile aldığın 6 haneli kodu gir.
        </p>
      </div>
      <PinPad length={6} masked={false} onComplete={submit} busy={busy} errorKey={errKey} />
      <div className="h-5">{busy && <Spinner />}</div>
      <div className="w-full max-w-[340px]"><ErrorText>{error}</ErrorText></div>
      <button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={() => navigate('/yonetici-girisi')}>
        <Icon name="shield" size={16} /> Kahve Operasyonu girişi
      </button>
      {USE_EMULATOR && <span className="text-[11px] text-caution">Geliştirme modu — yerel emülatör</span>}
    </Shell>
  );
};

/* ------------------------------------------------------------------ */
/* Mağaza modu: barista seçimi + PIN                                   */
/* ------------------------------------------------------------------ */

export const StoreHome: React.FC = () => {
  const session = useSession((s) => s.session);
  const baristaLogin = useSession((s) => s.baristaLogin);
  const unpair = useSession((s) => s.unpair);
  const navigate = useNavigate();
  const storeId = session.kind === 'store' ? session.storeId : '';
  const storeName = session.kind === 'store' ? session.storeName : '';

  const { data: baristas, loading } = useQueryLive<Barista>(
    storeId ? query(collection(db, 'baristas'), where('storeId', '==', storeId), where('active', '==', true)) : null,
    `baristas-${storeId}`
  );
  const ready = baristas.filter((b) => !b.pinPending).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  // Mağaza müdürü ve vardiya müdürleri üstte, ayrı bir satırda; baristalar
  // altında yan yana. Önceden hepsi aynı ızgaradaydı ve müdür kalabalıkta
  // kayboluyordu.
  const rank = (b: Barista) => (b.role === 'lead' ? 0 : b.role === 'shift' ? 1 : 2);
  const managers = ready.filter((b) => b.role !== 'barista').sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'tr'));
  const crew = ready.filter((b) => b.role === 'barista');

  const [selected, setSelected] = useState<Barista | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errKey, setErrKey] = useState(0);
  const [menu, setMenu] = useState(false);

  const submit = async (pin: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await baristaLogin(selected, pin);
    } catch (e) {
      setError(errorText(e));
      setErrKey((k) => k + 1);
      setBusy(false);
    }
  };

  if (selected) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3">
          <Avatar name={selected.name} size={64} />
          <div className="text-[18px] font-semibold">{selected.name}</div>
          <div className="text-[13px] text-fg-3">PIN'ini gir</div>
        </div>
        <PinPad length={4} onComplete={submit} busy={busy} errorKey={errKey} />
        <div className="h-5">{busy && <Spinner />}</div>
        <div className="w-full max-w-[340px]"><ErrorText>{error}</ErrorText></div>
        <button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={() => { setSelected(null); setError(null); }}>
          <Icon name="chevronLeft" size={16} /> Başka barista
        </button>
      </Shell>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col pt-[env(safe-area-inset-top)] animate-[fadeIn_0.2s_ease-out]">
      <div className="mx-auto w-full max-w-[560px] px-5 pt-8 pb-10 flex flex-col gap-7">
        <div className="flex items-center gap-3">
          <img src="/icons/logo.svg" alt="" className="w-10 h-10 opacity-90" />
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold leading-tight">{storeName}</div>
            <div className="text-[12px] text-fg-3">1401 Campus</div>
          </div>
          <button className={t.iconBtn} onClick={() => setMenu(true)} aria-label="Cihaz ayarları"><Icon name="sliders" size={16} /></button>
        </div>

        {/* Ölçüye bakmak için PIN gerekmez. */}
        <button onClick={() => navigate('/receteler?focus=1')}
          className="rounded-2xl border border-[#D9A066]/30 bg-linear-to-br from-[#D9A066]/25 to-[#D9A066]/[0.06] p-4 flex items-center gap-3.5 text-left active:scale-[0.99] transition-transform">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-[#D9A066] text-[#1A120C] shrink-0"><Icon name="coffee" size={20} strokeWidth={1.9} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-[16px] font-semibold">Reçeteler</span>
            <span className="block text-[12px] text-fg-2">PIN girmeden ölçü, bardak ve hazırlanışa bak</span>
          </span>
          <Icon name="search" size={18} className="text-[#E8B47E]" />
        </button>

        <div>
          <h1 className="text-[22px] font-bold">Kim çalışıyor?</h1>
          <p className="text-[13px] text-fg-3 mt-1">Adına dokun ve PIN'ini gir.</p>
        </div>

        <DemoPinHint />

        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : ready.length === 0 ? (
          <div className={t.emptyState}>
            <Icon name="users" size={22} className="text-fg-3" />
            <p className={t.emptyText}>Bu mağazada henüz PIN'i olan barista yok. Yeni başladıysan davet kodunla giriş yap.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {managers.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className={t.label}>Müdürler</span>
                <div className={t.listGroup}>
                  {managers.map((b) => (
                    <button key={b.id} onClick={() => setSelected(b)} className={t.listRow}>
                      <Avatar name={b.name} size={44} />
                      <span className="flex-1 min-w-0 text-left">
                        <span className="block text-[15px] font-semibold truncate">{b.name}</span>
                        <span className="block text-[12px] text-fg-3">{BARISTA_ROLE_LABEL[b.role]}</span>
                      </span>
                      <Icon name="chevronRight" size={16} className={t.rowChevron} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {crew.length > 0 && (
              <div className="flex flex-col gap-3">
                {managers.length > 0 && <span className={t.label}>Baristalar</span>}
                <div className="grid grid-cols-3 min-[420px]:grid-cols-4 gap-x-3 gap-y-5">
                  {crew.map((b) => (
                    <button key={b.id} onClick={() => setSelected(b)} className="flex flex-col items-center gap-2 active:opacity-70">
                      <Avatar name={b.name} size={60} />
                      <span className="text-[12px] font-medium text-center leading-tight line-clamp-2">{b.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <button onClick={() => navigate('/davet')} className={`${t.cardInteractive} p-4 flex items-center gap-3 text-left`}>
          <span className={t.iconChip('accent')}><Icon name="key" size={16} /></span>
          <span className="flex-1">
            <span className="block text-[14px] font-semibold">Yeni misin?</span>
            <span className="block text-[12px] text-fg-3">Yöneticinin verdiği davet koduyla PIN'ini belirle</span>
          </span>
          <Icon name="chevronRight" size={16} className={t.rowChevron} />
        </button>
      </div>

      <Sheet open={menu} title="Cihaz" onClose={() => setMenu(false)}>
        <p className="text-[13px] text-fg-2 leading-relaxed">Bu telefon <b>{storeName}</b> mağazasına bağlı.</p>
        <button className={`${t.btn} ${t.btnSecondary} ${t.btnLg}`} onClick={() => { setMenu(false); navigate('/yonetici-girisi'); }}>
          <Icon name="shield" size={16} /> Kahve Operasyonu girişi
        </button>
        <button
          className={`${t.btn} ${t.btnDanger} ${t.btnLg}`}
          onClick={async () => {
            if (confirm('Telefonun mağaza bağlantısı kaldırılsın mı? Yeniden bağlamak için yeni bir eşleştirme kodu gerekir.')) {
              setMenu(false);
              await unpair();
            }
          }}
        >
          Mağaza bağlantısını kaldır
        </button>
      </Sheet>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Davet kodu ile ilk giriş                                            */
/* ------------------------------------------------------------------ */

export const InviteScreen: React.FC = () => {
  const redeem = useSession((s) => s.redeemInvite);
  const navigate = useNavigate();
  const [step, setStep] = useState<'code' | 'pin' | 'confirm'>('code');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errKey, setErrKey] = useState(0);

  const fail = (msg: string, back?: 'code' | 'pin') => {
    setError(msg);
    setErrKey((k) => k + 1);
    if (back) setStep(back);
  };

  const finish = async (confirmPin: string) => {
    if (confirmPin !== pin) return fail('PIN\'ler eşleşmedi, yeniden belirle.', 'pin');
    setBusy(true);
    setError(null);
    try {
      await redeem(code, pin);
    } catch (e) {
      const msg = errorText(e);
      fail(msg, msg.toLowerCase().includes('pin') ? 'pin' : 'code');
      setBusy(false);
    }
  };

  const titles = {
    code: ['Davet kodunu gir', 'Yöneticinin sana verdiği 6 haneli kod'],
    pin: ['PIN belirle', 'Her girişte kullanacağın 4 haneli şifre. Kimseyle paylaşma.'],
    confirm: ['PIN\'i tekrar gir', 'Doğrulamak için aynı PIN\'i gir']
  }[step];

  return (
    <Shell>
      <Brand />
      <div className="flex flex-col items-center gap-1.5 text-center max-w-[300px]">
        <h1 className="text-[17px] font-semibold">{titles[0]}</h1>
        <p className="text-[13px] text-fg-3 leading-relaxed">{titles[1]}</p>
      </div>
      <PinPad
        key={step}
        length={step === 'code' ? 6 : 4}
        masked={step !== 'code'}
        busy={busy}
        errorKey={errKey}
        onComplete={(v) => {
          setError(null);
          if (step === 'code') { setCode(v); setStep('pin'); }
          else if (step === 'pin') {
            if (/^(\d)\1{3}$/.test(v) || ['1234', '4321', '0123', '9876'].includes(v)) return fail('Bu PIN çok kolay tahmin edilir, başka bir PIN seç.');
            setPin(v); setStep('confirm');
          } else finish(v);
        }}
      />
      <div className="h-5">{busy && <Spinner />}</div>
      <div className="w-full max-w-[340px]"><ErrorText>{error}</ErrorText></div>
      <button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={() => navigate('/')}>
        <Icon name="chevronLeft" size={16} /> Vazgeç
      </button>
    </Shell>
  );
};

/* ------------------------------------------------------------------ */
/* Yönetici girişi (e-posta + şifre)                                   */
/* ------------------------------------------------------------------ */

export const StaffLogin: React.FC = () => {
  const staffLogin = useSession((s) => s.staffLogin);
  const staffResetPassword = useSession((s) => s.staffResetPassword);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reset = async () => {
    setError(null);
    setInfo(null);
    if (!email.includes('@')) return setError('Önce e-posta adresini yaz.');
    try {
      await staffResetPassword(email);
      setInfo(`${email.trim()} adresine şifre belirleme bağlantısı gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et.`);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await staffLogin(email, password);
      navigate('/');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Brand sub="Kahve Operasyonu paneli" />
      <DemoStaffNotice />
      <form onSubmit={submit} className="w-full max-w-[360px] flex flex-col gap-4">
        <label className={t.field}>
          <span className={t.label}>E-posta</span>
          <input className={t.input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={t.field}>
          <span className={t.label}>Şifre</span>
          <input className={t.input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <ErrorText>{error}</ErrorText>
        {info && <p className="text-[13px] text-positive bg-positive-bg border border-positive-line rounded-lg px-3 py-2.5 leading-relaxed">{info}</p>}
        <button className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`} disabled={busy}>
          {busy ? <Spinner size={16} /> : 'Giriş yap'}
        </button>
        <button type="button" className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} onClick={reset}>
          Şifremi unuttum / ilk şifremi belirle
        </button>
        <button type="button" className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={() => navigate('/kurulum')}>
          İlk kurulum: operasyon hesabı aç
        </button>
        <button type="button" className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={() => navigate('/')}>
          <Icon name="chevronLeft" size={16} /> Geri
        </button>
      </form>
    </Shell>
  );
};

/* ------------------------------------------------------------------ */
/* İlk kurulum: ilk Kahve Operasyonu hesabı                            */
/* ------------------------------------------------------------------ */

export const BootstrapScreen: React.FC = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    backend.needsBootstrap().then((v) => { setAllowed(v); setChecking(false); });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError('Şifre en az 6 karakter olmalı.');
    setBusy(true);
    setError(null);
    try {
      await backend.bootstrapAdmin(name, email, password);
      navigate('/');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  if (checking) return <FullLoaderShell />;

  if (!allowed) {
    return (
      <Shell>
        <Brand />
        <div className="flex flex-col items-center gap-2 text-center max-w-[300px]">
          <Icon name="shield" size={24} className="text-fg-3" />
          <h1 className="text-[17px] font-semibold">Kurulum zaten yapılmış</h1>
          <p className="text-[13px] text-fg-3 leading-relaxed">Bir Kahve Operasyonu hesabı zaten var. Giriş ekranından "Şifremi unuttum" ile şifreni belirleyebilirsin.</p>
        </div>
        <button className={`${t.btn} ${t.btnSecondary} ${t.btnLg}`} onClick={() => navigate('/yonetici-girisi')}>Giriş ekranına dön</button>
      </Shell>
    );
  }

  return (
    <Shell>
      <Brand sub="İlk kurulum" />
      <div className="flex flex-col items-center gap-1.5 text-center max-w-[320px]">
        <h1 className="text-[17px] font-semibold">İlk operasyon hesabını aç</h1>
        <p className="text-[13px] text-fg-3 leading-relaxed">Bu, yalnızca hiç yönetici hesabı yokken bir kez yapılır. Bu adımdan sonra yeni yöneticiler panelden eklenir.</p>
      </div>
      <form onSubmit={submit} className="w-full max-w-[360px] flex flex-col gap-4">
        <label className={t.field}><span className={t.label}>Ad soyad</span><input className={t.input} value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className={t.field}><span className={t.label}>E-posta</span><input className={t.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className={t.field}><span className={t.label}>Şifre</span><input className={t.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></label>
        <ErrorText>{error}</ErrorText>
        <button className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`} disabled={busy}>{busy ? <Spinner size={16} /> : 'Hesabı oluştur ve giriş yap'}</button>
        <button type="button" className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={() => navigate('/')}><Icon name="chevronLeft" size={16} /> Vazgeç</button>
      </form>
    </Shell>
  );
};

const FullLoaderShell: React.FC = () => (
  <Shell><Spinner size={24} /></Shell>
);

/* ------------------------------------------------------------------ */
/* Bağlantı yok                                                        */
/* ------------------------------------------------------------------ */

export const OfflineScreen: React.FC = () => {
  const retry = useSession((s) => s.retry);
  return (
    <Shell>
      <Brand />
      <div className="flex flex-col items-center gap-2 text-center max-w-[300px]">
        <Icon name="alert" size={24} className="text-caution" />
        <h1 className="text-[17px] font-semibold">Sunucuya ulaşılamadı</h1>
        <p className="text-[13px] text-fg-3 leading-relaxed">Telefonun internet bağlantısını kontrol et. Mağaza bağlantın silinmedi.</p>
      </div>
      <button className={`${t.btn} ${t.btnPrimary} ${t.btnLg}`} onClick={retry}>
        <Icon name="refresh" size={16} /> Tekrar dene
      </button>
    </Shell>
  );
};
