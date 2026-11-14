import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { useQueryLive } from '../../hooks/useFirestore';
import { STAFF_ROLES, STAFF_ROLE_LABEL } from '../../lib/roles';
import { NOTIFY_DEFAULTS, NOTIFY_EVENTS, type NotifyEvent, type NotifyPerson } from '../../lib/notifications';
import { useStaffSession } from './StaffLayout';
import { Page, PageTitle, Section, Spinner, toast, fmtDateTime, Badge } from '../../ui/kit';
import * as t from '../../ui/tokens';
import type { StaffRole } from '../../../shared/types';

/**
 * Bildirimler: kim hangi olayda e-posta alır. config/notifications'a yazılır;
 * gönderimi sunucu yapar (functions/index.js). Sunucu tarafı Firebase'in
 * ücretli planında çalışır; o açılana kadar ayarlar kaydedilir ama e-posta
 * gitmez — "Son e-postalar" bölümü bunu da gösterir.
 */
interface StaffRow { id: string; name?: string; email?: string; role: StaffRole; active?: boolean }
interface MailRow { id: string; event: string; subject: string; to: string; toName?: string; at: number; status: string; error?: string }

export const NotificationsPage: React.FC = () => {
  const me = useStaffSession();
  const { data: staff } = useQueryLive<StaffRow>(query(collection(db, 'users'), where('role', 'in', STAFF_ROLES)), 'notify-staff');
  const { data: mails } = useQueryLive<MailRow>(query(collection(db, 'mailLog'), orderBy('at', 'desc'), limit(30)), 'mail-log');
  const [people, setPeople] = useState<NotifyPerson[] | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [busy, setBusy] = useState(false);

  // Kayıtlı ayar yoksa: Kahve Operasyonu hesaplarından, rolüne göre varsayılan.
  useEffect(() => {
    if (people || !staff.length) return;
    getDoc(doc(db, 'config', 'notifications')).then((s) => {
      const stored = (s.data()?.people as NotifyPerson[] | undefined) || null;
      const fromStaff: NotifyPerson[] = staff.filter((u) => u.active !== false && NOTIFY_DEFAULTS[u.role]).map((u) => ({
        uid: u.id, name: u.name || u.email || '', email: u.email || '', role: u.role, active: true, events: NOTIFY_DEFAULTS[u.role]
      }));
      const merged = stored ? [...stored, ...fromStaff.filter((f) => !stored.some((p) => p.uid === f.uid))] : fromStaff;
      setPeople(merged);
      setSaved(JSON.stringify(merged));
    }).catch(() => setPeople([]));
  }, [staff, people]);

  const dirty = people && JSON.stringify(people) !== saved;
  const toggle = (i: number, e: NotifyEvent) => setPeople((ps) => ps!.map((p, j) => (j === i ? { ...p, events: p.events.includes(e) ? p.events.filter((x) => x !== e) : [...p.events, e] } : p)));
  const setField = (i: number, patch: Partial<NotifyPerson>) => setPeople((ps) => ps!.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const save = async () => {
    if (!people) return;
    setBusy(true);
    try {
      await setDoc(doc(db, 'config', 'notifications'), { people, updatedAt: Date.now(), updatedBy: me.uid, updatedByName: me.name });
      setSaved(JSON.stringify(people));
      toast('Bildirim ayarları kaydedildi.');
    } catch {
      toast('Kaydedilemedi.', 'negative');
    } finally {
      setBusy(false);
    }
  };

  const groups = useMemo(() => [...new Set(NOTIFY_EVENTS.map((e) => e.group))], []);
  const anySent = mails.some((m) => m.status === 'gonderildi');

  return (
    <Page wide>
      <PageTitle title="Bildirimler" subtitle="Kim hangi durumda e-posta alır. Kutucuğu işaretle, kaydet."
        action={<button className={`${t.btn} ${t.btnPrimary} ${t.btnMd}`} disabled={!dirty || busy} onClick={save}>{busy ? <Spinner size={14} /> : 'Kaydet'}</button>} />

      {!anySent && (
        <div className="rounded-xl border border-caution-line bg-caution-bg px-4 py-3 text-[13px] text-fg-2 leading-relaxed">
          <b className="text-caution">E-posta gönderimi henüz açık değil.</b> Ayarlar kaydedilir; e-postaları Firebase'in ücretli planındaki
          sunucu tarafı gönderir. Plan açılıp gönderici bağlandığında bu ayarlarla çalışmaya başlar.
        </div>
      )}

      {!people ? <div className="py-10 flex justify-center"><Spinner /></div> : (
        <div className={`${t.card} overflow-x-auto`}>
          <table className="w-full text-[13px] min-w-[640px]">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-medium text-fg-3 px-4 py-3 w-[42%]">Olay</th>
                {people.map((p, i) => (
                  <th key={p.uid || i} className="px-2 py-3 text-center align-bottom">
                    <div className="font-semibold text-[13px]">{p.name}</div>
                    <div className="text-[11px] text-fg-3 font-normal">{p.role ? STAFF_ROLE_LABEL[p.role as StaffRole] : ''}</div>
                    <input className={`${t.input} h-8 text-[12px] mt-1.5 text-center`} value={p.email} onChange={(e) => setField(i, { email: e.target.value.trim() })} placeholder="e-posta" />
                    <label className="flex items-center justify-center gap-1.5 text-[11px] text-fg-3 font-normal mt-1">
                      <input type="checkbox" checked={p.active !== false} onChange={(e) => setField(i, { active: e.target.checked })} /> E-posta alsın
                    </label>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <React.Fragment key={g}>
                  <tr><td colSpan={people.length + 1} className={`${t.sectionLabel} px-4 pt-4 pb-1`}>{g}</td></tr>
                  {NOTIFY_EVENTS.filter((e) => e.group === g).map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <td className="px-4 py-2.5"><div>{e.label}</div><div className="text-[11.5px] text-fg-3">{e.when}</div></td>
                      {people.map((p, i) => (
                        <td key={p.uid || i} className="text-center px-2">
                          <input type="checkbox" className="w-4 h-4" disabled={p.active === false} checked={p.events.includes(e.id)} onChange={() => toggle(i, e.id)} aria-label={`${p.name}: ${e.label}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Section label="Son e-postalar">
        {mails.length === 0 ? <p className="text-[13px] text-fg-3">Henüz e-posta yok.</p> : (
          <div className={t.listGroup}>
            {mails.map((m) => (
              <div key={m.id} className={`${t.listRowStatic} text-[13px]`}>
                <span className="flex-1 min-w-0"><span className="block truncate font-medium">{m.subject}</span><span className="block text-[12px] text-fg-3 truncate">{m.toName || m.to} · {m.to}{m.error ? ` · ${m.error}` : ''}</span></span>
                <Badge tone={m.status === 'gonderildi' ? 'positive' : m.status === 'hata' ? 'negative' : 'neutral'}>{m.status === 'gonderildi' ? 'Gönderildi' : m.status === 'hata' ? 'Hata' : 'Deneme'}</Badge>
                <span className="text-[12px] text-fg-3 w-28 text-right">{fmtDateTime(m.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
};
