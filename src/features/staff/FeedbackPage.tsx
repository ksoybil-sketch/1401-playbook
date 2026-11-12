import React, { useState } from 'react';
import { collection, doc, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useQueryLive } from '../../hooks/useFirestore';
import { can } from '../../lib/roles';
import { useStaffSession } from './StaffLayout';
import { FEEDBACK_KINDS, FeedbackSheet } from '../shared/Feedback';
import { Page, PageTitle, Section, Empty, Badge, fmtDateTime, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';
import type { Feedback, FeedbackStatus } from '../../../shared/types';

/**
 * Geri bildirimler. Herkes buradan gönderir; geliştirici ve Kahve Operasyon
 * Direktörü gelenleri görür ve durumunu işaretler (bkz. firestore.rules).
 */
const STATUS: Record<FeedbackStatus, { label: string; tone: 'caution' | 'neutral' | 'positive' }> = {
  yeni: { label: 'Yeni', tone: 'caution' },
  inceleniyor: { label: 'İnceleniyor', tone: 'neutral' },
  cozuldu: { label: 'Çözüldü', tone: 'positive' }
};

export const FeedbackPage: React.FC = () => {
  const me = useStaffSession();
  const canRead = can(me.role, 'approve') || me.role === 'developer' || me.role === 'admin';
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<FeedbackStatus | 'hepsi'>('yeni');
  const { data, loading } = useQueryLive<Feedback>(canRead ? query(collection(db, 'feedback'), orderBy('createdAt', 'desc')) : null, 'feedback');
  const list = data.filter((f) => tab === 'hepsi' || f.status === tab);

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
          </div>
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
                      {f.imageUrl && <img src={f.imageUrl} alt="" className="max-h-64 self-start rounded-lg border border-line" loading="lazy" />}
                      <div className="text-[12px] text-fg-3">
                        {f.byName}{f.storeName ? ` · ${f.storeName}` : ''} · ekran {f.path}{f.lessonTitle ? ` · ${f.lessonTitle}` : ''} · {f.device} · {f.version}
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
        </>
      )}
      <FeedbackSheet open={sending} onClose={() => setSending(false)} />
    </Page>
  );
};
