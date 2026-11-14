import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { errorText } from '../../api/backend';
import { TITLE_IDS, type BadgeOverrides, type BadgeReport, type TitleId } from '../../lib/badges';
import { Icon } from '../../ui/Icon';
import { Badge, ErrorText, Sheet, Spinner, toast, fmtDate } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { Barista } from '../../../shared/types';

/**
 * Bir baristanın rozet ve başarım istisnaları — Kahve Operasyon Direktörü.
 *
 *   Rozeti geri al  : seçilen seviye ve üstü, kaldırılana (ya da bitiş
 *                     tarihine) kadar verilmez; önlükteki rozet de o
 *                     seviyedense listede "önlükten al" olarak görünür.
 *   Başarımı geri al: kazanılmış olsa da sayılmaz.
 *   Başarımı ver    : şartı uygulamada ölçülemeyen durumlar için (ör. barda
 *                     uygulamalı değerlendirme).
 * Her işlem gerekçesiyle, yapanın adıyla ve tarihiyle saklanır; geri alınabilir.
 */
export const BadgeOverridesSheet: React.FC<{ open: boolean; onClose: () => void; b: Barista; report: BadgeReport; byName: string }> = ({ open, onClose, b, report, byName }) => {
  const ov: BadgeOverrides = b.badgeOverrides || {};
  const [reason, setReason] = useState('');
  const [capFrom, setCapFrom] = useState<TitleId>(report.qualified?.id || b.apronBadge || 'rookie');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const write = async (key: string, next: BadgeOverrides, msg: string) => {
    setBusy(key);
    setError(null);
    try {
      await updateDoc(doc(db, 'baristas', b.id), { badgeOverrides: JSON.parse(JSON.stringify(next)) });
      toast(msg, 'positive');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const mark = () => ({ at: Date.now(), byName, reason: reason.trim() });
  const needReason = () => { if (reason.trim().length < 3) { setError('Gerekçe yaz: barista ve ekip neden olduğunu görecek.'); return false; } return true; };
  const without = (rec: Record<string, unknown> | undefined, id: string) => {
    const n = { ...(rec || {}) }; delete n[id]; return n as Record<string, { at: number; byName: string; reason: string }>;
  };
  const label = (id: TitleId) => report.titles.find((x) => x.id === id)?.label || id;

  return (
    <Sheet open={open} title={`${b.name} · rozet ve başarımlar`} onClose={onClose}>
      <label className={t.field}>
        <span className={t.label}>Gerekçe (her işlem için)</span>
        <input className={t.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Denetimde ölçü hatası · Barda uygulamalı onay…" />
      </label>
      <ErrorText>{error}</ErrorText>

      <div className={`${t.card} p-3.5 flex flex-col gap-3`}>
        <div className="flex items-center gap-2">
          <Icon name="medal" size={16} className="text-caution" />
          <span className="text-[14px] font-semibold flex-1">Önlük rozeti</span>
          <span className="text-[12px] text-fg-3">
            Hak ettiği: {report.qualified?.label || 'yok'} · önlükte: {b.apronBadge ? label(b.apronBadge) : 'yok'}
          </span>
        </div>
        {ov.titleCap ? (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-negative-bg border border-negative-line">
            <div className="flex-1 text-[13px] leading-relaxed">
              <b>{label(ov.titleCap.from)}</b> ve üstü geri alındı: {ov.titleCap.reason}
              <div className="text-[12px] text-fg-3">{ov.titleCap.byName} · {fmtDate(ov.titleCap.at)}{ov.titleCap.until ? ` · ${fmtDate(ov.titleCap.until)} tarihine kadar` : ' · süresiz'}</div>
            </div>
            <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} disabled={!!busy}
              onClick={() => write('cap', { ...ov, titleCap: null }, 'Rozet kısıtı kaldırıldı')}>
              {busy === 'cap' ? <Spinner size={13} /> : 'Kaldır'}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[12px] text-fg-3">Geri alınacak seviye (ve üstü)
              <select className={`${t.input} h-9 w-auto text-[14px]`} value={capFrom} onChange={(e) => setCapFrom(e.target.value as TitleId)}>
                {TITLE_IDS.map((id) => <option key={id} value={id}>{label(id)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-fg-3">Bitiş (boş = süresiz)
              <input type="date" className={`${t.input} h-9 w-auto text-[14px]`} value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
            <button className={`${t.btn} ${t.btnDanger} ${t.btnSm}`} disabled={!!busy}
              onClick={() => needReason() && write('cap', {
                ...ov, titleCap: { ...mark(), from: capFrom, until: until ? new Date(`${until}T23:59:59`).getTime() : null }
              }, `${label(capFrom)} rozeti geri alındı`)}>
              {busy === 'cap' ? <Spinner size={13} /> : 'Rozeti geri al'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={t.label}>Başarımlar</span>
        <div className={t.listGroup}>
          {report.badges.map((x) => (
            <div key={x.id} className={`${t.listRowStatic} flex-wrap`}>
              <span className={t.iconChip(x.earned ? 'positive' : x.revoked ? 'negative' : 'neutral')}><Icon name={x.icon} size={14} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium flex items-center gap-2 flex-wrap">
                  {x.title}
                  {x.revoked && <Badge tone="negative">Geri alındı</Badge>}
                  {x.granted && <Badge tone="positive">Elle verildi</Badge>}
                  {!x.revoked && !x.granted && x.earned && <Badge tone="positive">Kazandı</Badge>}
                </div>
                {(x.revoked || x.granted) && <div className="text-[11.5px] text-fg-3">{(x.revoked || x.granted)!.reason} · {(x.revoked || x.granted)!.byName}</div>}
              </div>
              {x.revoked ? (
                <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} disabled={!!busy}
                  onClick={() => write(x.id, { ...ov, revoked: without(ov.revoked, x.id) }, 'Geri alma iptal edildi')}>Geri almayı iptal et</button>
              ) : x.granted ? (
                <button className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`} disabled={!!busy}
                  onClick={() => write(x.id, { ...ov, granted: without(ov.granted, x.id) }, 'Elle verme iptal edildi')}>Vermeyi iptal et</button>
              ) : x.earned ? (
                <button className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} disabled={!!busy}
                  onClick={() => needReason() && write(x.id, { ...ov, revoked: { ...(ov.revoked || {}), [x.id]: mark() } }, `${x.title} geri alındı`)}>Geri al</button>
              ) : (
                <button className={`${t.btn} ${t.btnGhost} ${t.btnSm}`} disabled={!!busy}
                  onClick={() => needReason() && write(x.id, { ...ov, granted: { ...(ov.granted || {}), [x.id]: mark() } }, `${x.title} verildi`)}>Elle ver</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
};
