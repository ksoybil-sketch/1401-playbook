import React, { useEffect, useState } from 'react';
import type { Bulletin, BulletinKind } from '../../../shared/types';
import { useBaristaSession, useMyBulletins, useMyProgress, markBulletinRead } from './useBaristaData';
import { RichText } from '../academy/LessonBlocks';
import { PeopleList } from '../staff/BulletinPages';
import { Icon, type IconName } from '../../ui/Icon';
import { Page, PageTitle, Empty, Badge, fmtDate } from '../../ui/kit';
import * as t from '../../ui/tokens';

/**
 * Bülten — Kahve Operasyonu'nun duyuruları.
 *
 * Ders değil: sınavı, ilerlemesi yok. Okunmamış olanlar üstte vurgulanır,
 * açıldığında okundu işaretlenir; sekme rozeti bu sayıyı gösterir.
 */

const KIND: Record<BulletinKind, { label: string; icon: IconName; tone: t.Tone }> = {
  duyuru: { label: 'Duyuru', icon: 'bell', tone: 'accent' },
  kampanya: { label: 'Kampanya', icon: 'flash', tone: 'caution' },
  liderlik: { label: 'Liderlik', icon: 'award', tone: 'positive' }
};

const Card: React.FC<{ b: Bulletin; read: boolean; onOpen: () => void }> = ({ b, read, onOpen }) => {
  const [open, setOpen] = useState(!read);
  const k = KIND[b.kind] ?? KIND.duyuru;

  // Okunmamış bülten açık gelir; görüldüğü an okundu sayılır.
  useEffect(() => {
    if (open && !read) onOpen();
  }, [open, read, onOpen]);

  return (
    <div className={`${t.card} overflow-hidden ${read ? '' : 'border-l-2 border-l-crema'}`}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-panel-2 transition-colors">
        <span className={`${t.iconChip(k.tone)} mt-0.5`}><Icon name={k.icon} size={16} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-3">{k.label}</span>
            {b.pinned && <Badge>Sabit</Badge>}
            {!read && <Badge tone="caution">Yeni</Badge>}
          </div>
          <div className="text-[15px] font-semibold leading-snug mt-1">{b.title}</div>
          <div className="text-[12px] text-fg-3 mt-0.5">
            {fmtDate(b.createdAt)} · {b.createdByName}
            {b.expiresAt ? ` · ${fmtDate(b.expiresAt)} tarihine kadar` : ''}
          </div>
        </div>
        <Icon name={open ? 'arrowUp' : 'arrowDown'} size={15} className="text-fg-3 mt-1 shrink-0" />
      </button>

      {open && (
        <div className="border-t border-line px-4 py-4 flex flex-col gap-3">
          {b.imageUrl && (
            <img
              src={b.imageUrl}
              alt=""
              className="w-full max-h-72 object-contain rounded-xl border border-line bg-panel"
              loading="lazy"
            />
          )}
          {b.body && <RichText text={b.body} />}
          {b.people && b.people.length > 0 && <PeopleList people={b.people} />}
          {b.rows && b.rows.length > 0 && b.board !== 'terfi' && (
            <div className={t.listGroup}>
              {b.rows.map((r, i) => (
                <div key={i} className={`${t.listRowStatic} justify-between`}>
                  <span className="flex items-center gap-2.5 min-w-0">
                    {b.kind === 'liderlik' && (
                      <span className="w-5 text-[12px] font-semibold text-fg-3 tnum shrink-0">{i + 1}.</span>
                    )}
                    <span className="text-[14px] text-fg-2 truncate">{r.label}</span>
                  </span>
                  <span className="text-[14px] font-semibold tnum shrink-0">{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const BulletinsPage: React.FC = () => {
  const s = useBaristaSession();
  const { progress } = useMyProgress();
  const { items, unread, loading } = useMyBulletins();

  return (
    <Page>
      <PageTitle
        title="Bülten"
        subtitle={unread > 0 ? `${unread} okunmamış duyuru` : 'Kahve Operasyonu duyuruları'}
      />
      {loading ? null : items.length === 0 ? (
        <Empty icon="bell" text="Şimdilik duyuru yok. Yeni bir şey olduğunda burada görünecek." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((b) => (
            <Card
              key={b.id}
              b={b}
              read={!!progress.bulletins?.[b.id]}
              onOpen={() => markBulletinRead(s.baristaId, b.id, !!progress.bulletins?.[b.id])}
            />
          ))}
        </div>
      )}
    </Page>
  );
};
