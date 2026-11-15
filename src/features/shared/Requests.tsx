import React, { useEffect, useState } from 'react';
import { addNote, catOf, isClosed, reasonLabel, REJECT_REASONS, STATUS, WAIT_REASONS } from '../../api/requests';
import { errorText } from '../../api/backend';
import { Icon } from '../../ui/Icon';
import { Avatar, Badge, Spinner, toast, fmtDateTime, MAX, CharCount } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { RequestRejectReason, RequestStatus, RequestWaitReason, StoreRequest } from '../../../shared/types';
import { blockedReadOnly } from '../../lib/readOnly';

/**
 * Bir talebin kartı ve yazışması — mağaza ve Kahve Operasyonu aynı
 * bileşeni kullanır; yalnızca durum düğmeleri operasyon tarafında çıkar.
 */

const tone = (s: RequestStatus) => {
  const x = STATUS[s].tone;
  return x === 'accent' ? 'neutral' : x;
};

/** "3 saat", "2 gün": bekleme süresi, en büyük birimle. */
const span = (ms: number) => {
  const m = Math.max(1, Math.floor(ms / 60000));
  if (m < 60) return { n: m, unit: 'dakika', since: 'dakikadır' };
  const h = Math.floor(m / 60);
  if (h < 24) return { n: h, unit: 'saat', since: 'saattir' };
  const d = Math.floor(h / 24);
  return { n: d, unit: 'gün', since: 'gündür' };
};

/**
 * Talep ne kadar süredir kimi bekliyor. Mağaza son yazdıysa operasyonun
 * yanıtı bekleniyor: 24 saati geçince turuncu, 72 saati geçince kırmızı.
 */
export const WaitBadge: React.FC<{ r: StoreRequest }> = ({ r }) => {
  const ago = Date.now() - r.updatedAt;
  const x = span(ago);
  if (r.lastSide === 'store') {
    const tone = ago > 72 * 3600000 ? 'negative' : ago > 24 * 3600000 ? 'caution' : 'neutral';
    return <Badge tone={tone}>{x.n} {x.since} yanıt bekliyor</Badge>;
  }
  if (isClosed(r.status)) return null;
  return <Badge tone="neutral">Operasyon {x.n} {x.unit} önce yanıtladı</Badge>;
};

export const RequestSummary: React.FC<{ r: StoreRequest; showStore?: boolean; unread?: boolean }> = ({ r, showStore, unread }) => {
  const c = catOf(r.category);
  return (
    <div className="flex items-start gap-3 min-w-0 flex-1">
      <span className={`${t.iconChip(r.priority === 'urgent' && !isClosed(r.status) ? 'negative' : isClosed(r.status) ? 'neutral' : 'caution')} mt-0.5`}>
        <Icon name={c.icon} size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-3">{c.label}{r.equipment ? ` · ${r.equipment}` : ''}</span>
          <Badge tone={tone(r.status)}>{STATUS[r.status].label}</Badge>
          {r.priority === 'urgent' && !isClosed(r.status) && <Badge tone="negative">Acil</Badge>}
          {!isClosed(r.status) && r.waitReason && <Badge tone="neutral">{reasonLabel(r.waitReason)}</Badge>}
          {r.status === 'rejected' && r.rejectReason && <Badge tone="neutral">{reasonLabel(r.rejectReason)}</Badge>}
          {unread && <Badge tone="caution">Yeni yanıt</Badge>}
          <WaitBadge r={r} />
        </div>
        <div className="text-[15px] font-semibold leading-snug mt-1 break-words [overflow-wrap:anywhere]">{r.title}</div>
        <div className="text-[12px] text-fg-3 mt-0.5">
          {showStore ? `${r.storeName} · ` : ''}{r.createdByName ? `${r.createdByName} · ` : ''}{fmtDateTime(r.createdAt)}
          {r.notes.length ? ` · ${r.notes.filter((n) => n.text).length} mesaj` : ''}
        </div>
      </div>
    </div>
  );
};

/** Gönderilmemiş talep yanıtları (oturum boyunca, talep kimliğine göre). */
const replyDrafts = new Map<string, string>();

/** Durum geçişleri: operasyonun bir sonraki adımı. */
const NEXT: Record<RequestStatus, RequestStatus[]> = {
  open: ['in_progress', 'approval', 'done', 'rejected'],
  seen: ['in_progress', 'approval', 'done', 'rejected'],
  in_progress: ['approval', 'done', 'rejected'],
  approval: ['in_progress', 'done', 'rejected'],
  done: ['in_progress'],
  rejected: ['in_progress']
};
const ACTION: Record<RequestStatus, string> = {
  open: 'Yeniden aç', seen: 'Görüldü', in_progress: 'İşleme al', approval: 'Servis onayına gönder',
  done: 'Çözüldü', rejected: 'Reddet'
};

export const RequestThread: React.FC<{
  r: StoreRequest;
  side: 'ops' | 'store';
  me: { uid: string; name: string };
  /** Operasyon tarafında hangi durum geçişlerine izin var. */
  canChange?: boolean;
  /** Onay bekleyen talebi onaylayabilir mi (servis onayı yetkisi: Direktör, Operasyon Müdürü). */
  canApprove?: boolean;
  /** Yalnızca yazışmayı göster (Yönetim Kurulu): yanıt kutusu ve düğmeler yok. */
  readOnly?: boolean;
}> = ({ r, side, me, canChange, canApprove, readOnly }) => {
  // Yazılan yanıt pencere kapanınca gitmesin: talep başına taslak tutulur.
  const [text, setTextRaw] = useState(() => replyDrafts.get(r.id) || '');
  const setText = (v: string) => { setTextRaw(v); if (v) replyDrafts.set(r.id, v); else replyDrafts.delete(r.id); };
  useEffect(() => { setTextRaw(replyDrafts.get(r.id) || ''); }, [r.id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState<RequestRejectReason | ''>('');
  useEffect(() => { setRejecting(false); setRejectReason(''); }, [r.id]);

  /** Bekleme nedeni: yalnızca neden değişir, durum ve mağaza tarafı aynı kalır. */
  const setWait = async (reason: RequestWaitReason) => {
    if (blockedReadOnly()) return;
    setBusy('reason');
    try { await addNote(r, { side, by: me, text: '', reason }); }
    catch (e) { toast(errorText(e), 'negative'); }
    finally { setBusy(null); }
  };

  const send = async (status?: RequestStatus) => {
    if (!text.trim() && !status) return;
    if (status === 'rejected') {
      if (!rejecting) { setRejecting(true); return; }
      if (!rejectReason) { toast('Red nedenini seç.', 'negative'); return; }
      if (!text.trim()) { toast('Reddederken mağazaya kısaca açıkla.', 'negative'); return; }
    }
    if (blockedReadOnly()) return;
    setBusy(status || 'send');
    try {
      await addNote(r, { side, by: me, text, status, reason: status === 'rejected' ? rejectReason || null : undefined });
      setText('');
      setRejecting(false);
    } catch (e) {
      toast(errorText(e), 'negative');
    } finally {
      setBusy(null);
    }
  };

  const notes = r.notes.filter((n) => n.text || n.status);
  const closed = isClosed(r.status);
  // Yazabilir mi: kural operasyonda talepYanit ya da servisOnay ister (ör. Kahve
  // Operasyonu rolünde ikisi de yok: kutu görünüyor, gönderim reddediliyordu);
  // mağaza kapanmış talebe yazamaz (14.11.2026 kararı, kural da reddeder).
  const canWrite = !readOnly && (side === 'ops' ? !!(canChange || canApprove) : !closed);

  return (
    <div className="flex flex-col gap-3">
      {r.detail && <p className="text-[14px] text-fg-2 leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{r.detail}</p>}
      {r.imageUrl && <img src={r.imageUrl} alt="" className="w-full max-h-72 object-contain rounded-xl border border-line bg-panel" loading="lazy" />}

      {notes.length > 0 && (
        <div className="flex flex-col gap-2">
          {notes.map((n, i) => (
            n.text ? (
              <div key={i} className={`flex gap-2 ${n.side === side ? 'flex-row-reverse text-right' : ''}`}>
                {n.byName ? <Avatar name={n.byName} size={26} /> : <span className="w-[26px] shrink-0" />}
                <div className={`max-w-[80%] min-w-0 [overflow-wrap:anywhere] rounded-xl px-3 py-2 ${n.side === 'ops' ? 'bg-panel-3' : 'bg-panel'} border border-line`}>
                  <div className="text-[11px] text-fg-3">{n.byName ? `${n.byName} · ` : n.side === 'ops' ? 'Kahve Operasyonu · ' : ''}{fmtDateTime(n.at)}{n.status ? ` · ${STATUS[n.status].label}` : ''}{n.reason ? ` · ${reasonLabel(n.reason)}` : ''}</div>
                  <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-left">{n.text}</div>
                </div>
              </div>
            ) : (
              <div key={i} className="text-[11.5px] text-fg-3 text-center">
                {n.byName ? `${n.byName} · ` : ''}{n.status ? STATUS[n.status].label : 'Neden'}{n.reason ? `: ${reasonLabel(n.reason)}` : ''} · {fmtDateTime(n.at)}
              </div>
            )
          ))}
        </div>
      )}

      {!readOnly && side === 'ops' && canChange && !closed && (
        <label className="flex items-center gap-2 text-[13px] text-fg-2">
          <span className="shrink-0">Şu an neyi bekliyor?</span>
          <select className={`${t.input} h-9 text-[13px] flex-1`} value={r.waitReason || ''} disabled={!!busy}
            onChange={(e) => e.target.value && setWait(e.target.value as RequestWaitReason)}>
            <option value="">Seç (istatistik için)</option>
            {WAIT_REASONS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </label>
      )}
      {rejecting && (
        <label className="flex items-center gap-2 text-[13px] text-negative">
          <span className="shrink-0">Red nedeni</span>
          <select className={`${t.input} h-9 text-[13px] flex-1`} value={rejectReason} onChange={(e) => setRejectReason(e.target.value as RequestRejectReason)}>
            <option value="">Seç</option>
            {REJECT_REASONS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </label>
      )}

      {side === 'store' && closed && (
        <p className="text-[13px] text-fg-3 bg-panel border border-line rounded-lg px-3 py-2.5">Bu talep kapandı. Yeni bir konu için yeni talep aç.</p>
      )}
      {canWrite && <div className="flex flex-col gap-2">
        <textarea className={`${t.textarea} min-h-20`} value={text} maxLength={MAX.text} onChange={(e) => setText(e.target.value)}
          placeholder={side === 'ops' ? 'Mağazaya yanıt: servis yarın 10:00\'da geliyor…' : 'Ek bilgi yaz…'} />
        <CharCount value={text} max={MAX.text} />
        <div className="flex flex-wrap gap-2 justify-end">
          {/* Onay bekleyen talep: onay yetkisi olmayan yalnızca mesaj yazar
              (eskiden "İşleme al" ile onayı atlayabiliyordu). Onaylayıcıda
              "İşleme al" ile "Servisi onayla" aynı işi yapıyordu; tek düğme kaldı. */}
          {side === 'ops' && canChange && (r.status !== 'approval' || canApprove) && NEXT[r.status]
            .filter((st) => st !== 'approval' || !canApprove)
            .filter((st) => !(r.status === 'approval' && st === 'in_progress'))
            .map((st) => (
              <button key={st} disabled={!!busy} onClick={() => send(st)}
                className={`${t.btn} ${st === 'rejected' ? t.btnDanger : st === 'done' ? t.btnSecondary : t.btnSecondary} ${t.btnSm}`}>
                {busy === st ? <Spinner size={13} /> : st === 'rejected' && rejecting ? 'Reddi gönder' : ACTION[st]}
              </button>
            ))}
          {side === 'ops' && canApprove && r.status === 'approval' && (
            <button disabled={!!busy} onClick={() => send('in_progress')} className={`${t.btn} ${t.btnPrimary} ${t.btnSm}`}>
              {busy === 'in_progress' ? <Spinner size={13} /> : <><Icon name="check" size={13} /> Servisi onayla</>}
            </button>
          )}
          <button disabled={!!busy || !text.trim()} onClick={() => send()} className={`${t.btn} ${t.btnPrimary} ${t.btnSm}`}>
            {busy === 'send' ? <Spinner size={13} /> : <><Icon name="send" size={13} /> Gönder</>}
          </button>
        </div>
      </div>}
    </div>
  );
};
