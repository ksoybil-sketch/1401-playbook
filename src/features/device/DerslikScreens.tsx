import React, { useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { backend, errorText } from '../../api/backend';
import { useQueryLive } from '../../hooks/useFirestore';
import { setDerslikModu, useSession } from '../../store/session';
import { Avatar, ErrorText, Spinner, FullLoader } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';
import { PinPad } from './PinPad';
import { Brand, Shell } from './DeviceScreens';
import type { Barista } from '../../../shared/types';

/**
 * Evden ders çalışma girişi (derslikKodlari).
 *
 * Üç adım: mağaza kodu → adını seç → PIN. Kendi ekranı var (#/derslik):
 * baristanın evde göreceği yerde "mağaza telefonunu bağla" açıklaması ya da
 * Kahve Operasyonu girişi düğmesi olmaz — kodunu girer, PIN'ini girer,
 * derslerini görür. Ana ekran (mağaza telefonunun ekranı) derslik kodunu
 * yine kabul eder; oradan bu ekrana bir bağlantı da var.
 *
 * Girişten sonra yalnızca Akademi ve Reçeteler açılır — sınav, bülten,
 * ekip ve talepler mağaza telefonunda kalır.
 *
 * Mağaza kodunu müdür dağıtır, panelden yenilenir. Kod tek başına kimsenin
 * dersine erişim vermez: yalnızca "hangi mağaza" sorusunu yanıtlar, ders
 * okumak için barista kendi PIN'iyle girer.
 */

/* ------------------------------------------------------------------ */
/* 1. Mağaza kodu (#/derslik)                                          */
/* ------------------------------------------------------------------ */

export const DerslikCodeScreen: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errKey, setErrKey] = useState(0);

  const submit = async (code: string) => {
    setBusy(true); setError(null);
    try {
      await backend.studySignIn(code);
      setDerslikModu(true);
      // Oturum çözümlemesi session.ts'te; ekran kendiliğinden isim listesine geçer.
    } catch (e) {
      setDerslikModu(false);
      setError(errorText(e));
      setErrKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Brand sub="Evde ders çalış" />
      <div className="flex flex-col items-center gap-2 text-center max-w-[320px]">
        <h1 className="text-[17px] font-semibold">Mağazanın kodunu gir</h1>
        <p className="text-[13px] text-fg-3 leading-relaxed">
          Kodu mağaza müdüründen alırsın. Sonra adını seçip kendi PIN'ini gireceksin.
        </p>
      </div>
      <PinPad length={6} masked={false} onComplete={submit} busy={busy} errorKey={errKey} />
      <div className="h-5">{busy && <Spinner />}</div>
      <div className="w-full max-w-[340px]"><ErrorText>{error}</ErrorText></div>
      <p className="text-[12px] text-fg-4 text-center max-w-[300px] leading-relaxed">
        Burada dersler ve reçeteler var. Sınavlar mağaza telefonunda verilir.
      </p>
    </Shell>
  );
};

/* ------------------------------------------------------------------ */
/* 2. Adını seç + 3. PIN                                               */
/* ------------------------------------------------------------------ */

export const DerslikPickScreen: React.FC<{ storeId: string; storeName: string }> = ({ storeId, storeName }) => {
  const logout = useSession((x) => x.logout);
  const { data: baristas, loading } = useQueryLive<Barista>(
    query(collection(db, 'baristas'), where('storeId', '==', storeId), where('active', '==', true)),
    `derslik-baristas-${storeId}`
  );
  const [picked, setPicked] = useState<Barista | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errKey, setErrKey] = useState(0);

  // Çıkışta ana ekrana (mağaza telefonu ekranı) değil, derslik koduna dön.
  const cikis = async () => { setDerslikModu(false); await logout(); location.hash = '#/derslik'; };

  const submit = async (value: string) => {
    if (!picked) return;
    setBusy(true); setError(null);
    try {
      await backend.baristaSignIn(picked, value);
      // session.ts barista oturumunu derslik işaretiyle açar.
    } catch (e) {
      setError(errorText(e));
      setErrKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <FullLoader text="Ekip yükleniyor" />;

  if (picked) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10 gap-5 max-w-[420px] mx-auto">
        <Avatar name={picked.name} size={44} />
        <div className="text-center">
          <div className="text-[16px] font-semibold">{picked.name}</div>
          <p className="text-[13px] text-fg-3 mt-1">PIN'ini gir</p>
        </div>
        <PinPad length={4} onComplete={submit} busy={busy} errorKey={errKey} />
        <div className="h-5">{busy && <Spinner />}</div>
        <div className="w-full max-w-[340px]"><ErrorText>{error}</ErrorText></div>
        <button className={`${t.btn} ${t.btnGhost} ${t.btnMd}`} onClick={() => { setPicked(null); setError(null); }}>
          Başka kişi
        </button>
      </div>
    );
  }

  const pinli = baristas.filter((b) => !b.pinPending);
  return (
    <div className="min-h-[100dvh] flex flex-col px-5 py-8 gap-5 max-w-[480px] mx-auto">
      <div className="text-center">
        <Icon name="cap" size={24} className="mx-auto text-crema" />
        <h1 className="text-[17px] font-semibold mt-2">{storeName}</h1>
        <p className="text-[13px] text-fg-3 mt-1">Adını seç, sonra PIN'ini gir.</p>
      </div>
      {pinli.length === 0 && (
        <p className={t.emptyText}>
          Bu mağazada henüz PIN'i olan barista yok. Mağaza telefonundan davet kodunla PIN belirle, sonra buradan girebilirsin.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {pinli.map((b) => (
          <button key={b.id} onClick={() => setPicked(b)} className={`${t.cardInteractive} p-3 flex items-center gap-3 text-left`}>
            <Avatar name={b.name} size={34} />
            <span className="text-[14px] font-semibold">{b.name}</span>
            <Icon name="chevronRight" size={16} className="ml-auto text-fg-3" />
          </button>
        ))}
      </div>
      <button className={`${t.btn} ${t.btnGhost} ${t.btnMd} self-center`} onClick={cikis}>
        <Icon name="logout" size={16} /> Başka mağaza
      </button>
    </div>
  );
};
