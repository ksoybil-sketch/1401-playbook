import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, deleteDoc, doc, limit, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useQueryLive } from '../../hooks/useFirestore';
import { useStaffSession } from './StaffLayout';
import { moduleInDomain, useAllow, useDomain } from '../../lib/permissions';
import { useContent } from '../../store/content';
import { FEEDBACK_KINDS, FeedbackSheet } from '../shared/Feedback';
import { Page, PageTitle, Section, Empty, Badge, fmtDateTime, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';
import type { Feedback, FeedbackStatus } from '../../../shared/types';
import { APP_VERSION } from '../../lib/version';

/**
 * Geri bildirimler. Herkes buradan gönderir; geliştirici, Kahve Operasyon
 * Direktörü ve Bölge Müdürü gelenleri görür ve durumunu işaretler (bkz. firestore.rules).
 */
const STATUS: Record<FeedbackStatus, { label: string; tone: 'caution' | 'neutral' | 'positive' }> = {
  yeni: { label: 'Yeni', tone: 'caution' },
  inceleniyor: { label: 'İnceleniyor', tone: 'neutral' },
  cozuldu: { label: 'Çözüldü', tone: 'positive' }
};

export const FeedbackPage: React.FC = () => {
  const me = useStaffSession();
  // Görenler Yetkiler ayarından ("Geri bildirim" ekranı). Alanı sınırlı rol
  // (Operasyon Müdürü) alanı dışındaki derslerin içerik bildirimlerini görmez.
  const allow = useAllow();
  const canRead = allow(me.role, 'ekran.geriBildirim');
  const domain = useDomain(me.role);
  const { modules, lessons } = useContent();
  const inDomain = (f: Feedback) => !domain || !f.lessonId || moduleInDomain(domain, modules.find((m) => m.id === lessons.find((l) => l.id === f.lessonId)?.moduleId));
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<FeedbackStatus | 'hepsi' | 'hatalar'>('yeni');
  // Sürüm ve otomatik hata kaydı yalnızca uygulama geliştiricisine görünür.
  const dev = me.role === 'developer' || me.role === 'admin';
  const { data, loading } = useQueryLive<Feedback>(canRead ? query(collection(db, 'feedback'), orderBy('createdAt', 'desc')) : null, 'feedback');
  const list = data.filter((f) => inDomain(f) && (tab === 'hepsi' || f.status === tab));
  const errors = useQueryLive<AppError>(dev ? query(collection(db, 'hatalar'), orderBy('createdAt', 'desc'), limit(200)) : null, 'hatalar');

  const setStatus = async (f: Feedback, status: FeedbackStatus) => {
    try { await updateDoc(doc(db, 'feedback', f.id), { status, updatedAt: Date.now() }); }
    catch { toast('Güncellenemedi.', 'negative'); }
  };

  return (
    <Page wide>
      <PageTitle title="Geri bildirim"
        subtitle={canRead ? 'Uygulamanın içinden gelen hata, içerik ve öneri bildirimleri.' : 'Bir sorun mu var, önerin mi var? Doğrudan geliştirici ekibe ulaşır.'}
        action={<button onClick={() => setSending(true)} className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`}><Icon name="plus" size={15} /> Gönder</button>} />

      {canRead && (
        <>
          <div className={t.segment}>
            {(['yeni', 'inceleniyor', 'cozuldu', 'hepsi'] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={`${t.segmentItem} ${tab === k ? t.segmentItemOn : t.segmentItemOff}`}>
                {k === 'hepsi' ? 'Hepsi' : STATUS[k].label} · {k === 'hepsi' ? data.length : data.filter((f) => f.status === k).length}
              </button>
            ))}
            {dev && (
              <button onClick={() => setTab('hatalar')} className={`${t.segmentItem} ${tab === 'hatalar' ? t.segmentItemOn : t.segmentItemOff}`}>
                Hatalar · {errors.data.length}
              </button>
            )}
          </div>
          {dev && <p className="text-[12px] text-fg-3">Açık olan sürüm: {APP_VERSION}</p>}
          {tab === 'hatalar' ? <ErrorList list={errors.data} loading={errors.loading} /> : (
          <Section>
            {loading ? null : list.length === 0 ? <Empty icon="message" text="Bu durumda geri bildirim yok." /> : (
              <div className="flex flex-col gap-2">
                {list.map((f) => {
                  const k = FEEDBACK_KINDS.find((x) => x.id === f.kind) || FEEDBACK_KINDS[0];
                  return (
                    <div key={f.id} className={`${t.card} ${t.cardPad} flex flex-col gap-2`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-3">{k.label}</span>
                        <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge>
                        <span className="text-[12px] text-fg-3 ml-auto">{fmtDateTime(f.createdAt)}</span>
                      </div>
                      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{f.text}</p>
                      {f.questionId && (
                        <Link to={`/soru-havuzu?soru=${f.questionId}`} className="text-[13px] rounded-lg bg-panel-2 px-3 py-2 hover:bg-panel-3">
                          Soru: {f.questionPrompt} <span className="text-fg-3">· Soru havuzunda aç →</span>
                        </Link>
                      )}
                      {f.imageUrl && <img src={f.imageUrl} alt="" className="max-h-64 self-start rounded-lg border border-line" loading="lazy" />}
                      <div className="text-[12px] text-fg-3">
                        {f.byName}{f.storeName ? ` · ${f.storeName}` : ''} · ekran {f.path}{f.lessonTitle ? ` · ${f.lessonTitle}` : ''} · {f.device}{dev ? ` · ${f.version}` : ''}
                      </div>
                      <div className="flex gap-2">
                        {(['inceleniyor', 'cozuldu'] as const).filter((s) => s !== f.status).map((s) => (
                          <button key={s} onClick={() => setStatus(f, s)} className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`}>{STATUS[s].label} olarak işaretle</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
          )}
        </>
      )}
      <FeedbackSheet open={sending} onClose={() => setSending(false)} />
    </Page>
  );
};

/** Otomatik hata kaydı (src/lib/errorLog.ts) — yalnızca geliştirici. */
interface AppError {
  id: string; kind: 'cokme' | 'hata'; message: string; stack: string; extra?: string;
  path: string; version: string; bundle: string; device: string; byName: string; role: string; storeName?: string; createdAt: number;
}

const ErrorList: React.FC<{ list: AppError[]; loading: boolean }> = ({ list, loading }) => {
  const [open, setOpen] = useState<string | null>(null);
  const remove = async (e: AppError) => {
    try { await deleteDoc(doc(db, 'hatalar', e.id)); } catch { toast('Silinemedi.', 'negative'); }
  };
  if (loading) return null;
  if (!list.length) return <Empty icon="check" text="Kayıtlı hata yok." />;
  return (
    <Section>
      <div className="flex flex-col gap-2">
        {list.map((e) => (
          <div key={e.id} className={`${t.card} ${t.cardPad} flex flex-col gap-2`}>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={e.kind === 'cokme' ? 'negative' : 'caution'}>{e.kind === 'cokme' ? 'Ekran çöktü' : 'Hata'}</Badge>
              <span className="text-[12px] text-fg-3 ml-auto">{fmtDateTime(e.createdAt)}</span>
            </div>
            <p className="text-[14px] font-medium break-words">{e.message}</p>
            <div className="text-[12px] text-fg-3">
              {e.byName || 'bilinmiyor'}{e.storeName ? ` · ${e.storeName}` : ''} · {e.role} · ekran {e.path} · {e.device} · {e.version}
            </div>
            {open === e.id && <pre className="text-[11px] text-fg-2 bg-panel-2 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap">{e.stack}{e.extra ? `\n—\n${e.extra}` : ''}</pre>}
            <div className="flex gap-2">
              <button onClick={() => setOpen(open === e.id ? null : e.id)} className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`}>{open === e.id ? 'Ayrıntıyı gizle' : 'Ayrıntı'}</button>
              <button onClick={() => remove(e)} className={`${t.btn} ${t.btnGhost} ${t.btnSm}`}>Ele alındı, sil</button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};
