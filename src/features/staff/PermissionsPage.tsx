import React, { useMemo, useState } from 'react';
import { collection, deleteField, doc, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../api/firebase';
import { errorText } from '../../api/backend';
import { useContent } from '../../store/content';
import { useQueryLive } from '../../hooks/useFirestore';
import {
  allowedIn, DEFAULT_DOMAINS, DEFAULTS, domainIn, EDITABLE_ROLES, PERMS, usePermStore,
  type Perm, type PermConfig, type PermDef
} from '../../lib/permissions';
import { STAFF_ROLE_LABEL, visibleStaffRoles, isDevRole } from '../../lib/roles';
import { useStaffSession } from './StaffLayout';
import { Badge, Empty, Page, PageTitle, Section, fmtDateTime, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import * as t from '../../ui/tokens';
import type { StaffRole } from '../../../shared/types';

/**
 * Yetkiler — Kahve Operasyon Direktörü her birimin neyi görüp neyi
 * değiştirebildiğini yan yana görür; bir hücreye dokunarak açar/kapatır.
 * Ayar config/permissions'a yazılır; menü, sayfalar ve Firestore kuralları
 * oradan okur. Uygulama geliştiricisi (Kutay Soybil) ayardan etkilenmez.
 */

type Role = (typeof EDITABLE_ROLES)[number];
interface Person { id: string; name: string; role: StaffRole; active: boolean }

const SHORT: Record<Role, string> = {
  director: 'Direktör', opsmanager: 'Operasyon Md.', regional: 'Bölge Md.', ops: 'Operasyon ekibi', board: 'Yönetim Kurulu'
};

/** Hücre bu rol için anlamlı mı: kurul yalnız kendi ekranları, diğerleri yalnız panel. */
const applies = (role: Role, p: PermDef) => (role === 'board') === (p.group === 'Yönetim Kurulu ekranları');

export const PermissionsPage: React.FC = () => {
  const me = useStaffSession();
  const cfg = usePermStore((s) => s.config);
  const { tracks } = useContent();
  const { data: people } = useQueryLive<Person>(query(collection(db, 'users'), where('role', 'in', visibleStaffRoles(me.role))), 'perm-people');
  const [busy, setBusy] = useState<string | null>(null);
  const ref = doc(db, 'config', 'permissions');

  const names = (r: Role) => people.filter((p) => p.active && p.role === r).map((p) => p.name);
  const changed = (r: Role, p: Perm) => typeof cfg.roles?.[r]?.[p] === 'boolean' && cfg.roles![r]![p] !== (DEFAULTS[r] || []).includes(p);
  const changedCount = (r: Role) => PERMS.filter((p) => applies(r, p) && changed(r, p.id)).length;

  const logLine = (text: string): PermConfig['log'] =>
    [...(cfg.log || []), { at: Date.now(), byName: me.name, text, ...(isDevRole(me.role) ? { dev: true } : {}) }].slice(-60);
  // Geliştiricinin yaptığı değişiklikler yalnızca ona görünür.
  const dev = isDevRole(me.role);
  const log = (cfg.log || []).filter((l) => dev || !l.dev);

  const toggle = async (r: Role, p: PermDef) => {
    const next = !allowedIn(cfg, r, p.id);
    if (r === 'director' && !next && !confirm(`Kahve Operasyon Direktörü için "${p.label}" kapatılsın mı? Bu sizin de yetkinizi kapatır.`)) return;
    setBusy(`${r}:${p.id}`);
    try {
      await setDoc(ref, {
        roles: { [r]: { [p.id]: next } },
        updatedAt: Date.now(), updatedByName: me.name,
        log: logLine(`${STAFF_ROLE_LABEL[r]} · ${p.label}: ${next ? 'açıldı' : 'kapatıldı'}`)
      }, { merge: true });
    } catch (e) { toast(errorText(e), 'negative'); }
    setBusy(null);
  };

  const reset = async (r: Role) => {
    if (!confirm(`${STAFF_ROLE_LABEL[r]} için bütün yetkiler varsayılana dönsün mü?`)) return;
    try {
      await setDoc(ref, { updatedAt: Date.now() }, { merge: true });
      await updateDoc(ref, { [`roles.${r}`]: deleteField(), [`domains.${r}`]: deleteField(), log: logLine(`${STAFF_ROLE_LABEL[r]}: varsayılana döndü`) });
      toast('Varsayılana döndü', 'positive');
    } catch (e) { toast(errorText(e), 'negative'); }
  };

  const setDomain = async (r: Role, list: string[] | null) => {
    try {
      await setDoc(ref, {
        domains: { [r]: list }, updatedAt: Date.now(), updatedByName: me.name,
        log: logLine(`${STAFF_ROLE_LABEL[r]} · içerik alanı: ${list ? list.map((id) => tracks.find((x) => x.id === id)?.title || id).join(', ') || 'hiçbiri' : 'her yer'}`)
      }, { merge: true });
    } catch (e) { toast(errorText(e), 'negative'); }
  };

  const groups = useMemo(() => [...new Set(PERMS.map((p) => p.group))], []);
  const domainRoles = EDITABLE_ROLES.filter((r) => r !== 'board' && PERMS.some((p) => p.domain && allowedIn(cfg, r, p.id)));

  return (
    <Page wide>
      <PageTitle title="Yetkiler"
        subtitle={`Her birimin neyi görüp neyi değiştirebildiği yan yana. Bir hücreye dokunarak açıp kapatırsınız: kapanan ekran menüden kalkar, kapanan işlem yapılamaz (sunucu da reddeder). ${dev ? 'Uygulama geliştiricisi bu ayardan etkilenmez; ekibe kişi ekleme ve bu ekran direktörde sabittir.' : 'Ekibe kişi ekleme ve bu ekran sizde sabittir.'}`} />

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[760px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-espresso text-left align-bottom pb-3 pr-3 w-[34%]" />
              {EDITABLE_ROLES.map((r) => (
                <th key={r} className="align-bottom pb-3 px-1 text-center">
                  <div className="text-[13px] font-semibold text-crema leading-tight">{SHORT[r]}</div>
                  <div className="text-[11px] text-fg-3 font-normal leading-snug mt-0.5 min-h-[2.4em]">{names(r).join(', ') || '—'}</div>
                  {changedCount(r) > 0 && (
                    <button onClick={() => reset(r)} className="text-[11px] text-caution underline underline-offset-2 mt-1">{changedCount(r)} değişiklik · sıfırla</button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr><td colSpan={EDITABLE_ROLES.length + 1} className="pt-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{g}</td></tr>
              {PERMS.filter((p) => p.group === g).map((p) => (
                <tr key={p.id} className="group">
                  <td className="sticky left-0 z-10 bg-espresso border-t border-line py-2.5 pr-3">
                    <div className="text-[14px] font-medium leading-snug">{p.label}</div>
                    <div className="text-[12px] text-fg-3 leading-snug">{p.hint}{p.domain ? ' · alan sınırına tabi' : ''}</div>
                  </td>
                  {EDITABLE_ROLES.map((r) => {
                    if (!applies(r, p)) return <td key={r} className="border-t border-line text-center text-fg-4 text-[13px]">—</td>;
                    const on = allowedIn(cfg, r, p.id);
                    const ch = changed(r, p.id);
                    return (
                      <td key={r} className="border-t border-line text-center py-2">
                        <button onClick={() => toggle(r, p)} disabled={busy === `${r}:${p.id}`}
                          aria-pressed={on} aria-label={`${STAFF_ROLE_LABEL[r]}: ${p.label}`}
                          title={ch ? 'Varsayılandan farklı' : 'Varsayılan'}
                          className={`relative inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-colors ${on ? 'bg-positive-bg border-positive-line text-positive' : 'bg-panel border-line text-fg-4 hover:text-fg-3'} ${ch ? 'ring-2 ring-caution/60' : ''}`}>
                          <Icon name={on ? 'check' : 'minus'} size={17} strokeWidth={on ? 2.2 : 1.6} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="text-[12.5px] text-fg-3 leading-relaxed -mt-2">
        <span className="inline-block w-3 h-3 rounded border border-positive-line bg-positive-bg align-[-2px]" /> açık ·{' '}
        <span className="inline-block w-3 h-3 rounded border border-line bg-panel align-[-2px]" /> kapalı ·{' '}
        <span className="inline-block w-3 h-3 rounded ring-2 ring-caution/60 align-[-2px]" /> varsayılandan farklı
      </p>

      <Section label="İçerik alanları">
        <div className="flex flex-col gap-3">
          {domainRoles.map((r) => {
            const dom = domainIn(cfg, r);
            return (
              <div key={r} className={`${t.card} p-4 flex flex-col gap-2.5`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-semibold">{STAFF_ROLE_LABEL[r]}</span>
                  <span className="text-[13px] text-fg-3">{names(r).join(', ')}</span>
                  {cfg.domains?.[r] !== undefined && JSON.stringify(cfg.domains[r]) !== JSON.stringify(DEFAULT_DOMAINS[r] ?? null) && <Badge tone="caution">Değiştirildi</Badge>}
                </div>
                <p className="text-[12.5px] text-fg-3 leading-relaxed">İçerik yayınlama, öneri onaylama, soru düzeltme ve görev atama bu eğitim yollarıyla sınırlıdır; dışındaki değişiklikler onaya gider.</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setDomain(r, null)} className={`${t.chip} h-9 px-3.5 text-[13px] ${!dom ? t.chipOn : t.chipOff}`}>Her yer</button>
                  {tracks.map((tr) => {
                    const on = !!dom && dom.includes(tr.id);
                    return (
                      <button key={tr.id} onClick={() => setDomain(r, on ? (dom || []).filter((x) => x !== tr.id) : [...(dom || []), tr.id])}
                        className={`${t.chip} h-9 px-3.5 text-[13px] ${on ? t.chipOn : t.chipOff}`}>
                        {on && <Icon name="check" size={13} />} {tr.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section label="Son değişiklikler">
        {!log.length ? <Empty icon="key" text="Henüz değişiklik yok; herkes varsayılan yetkilerle çalışıyor." /> : (
          <div className={t.listGroup}>
            {[...log].reverse().slice(0, 20).map((l, i) => (
              <div key={i} className={t.listRowStatic}>
                <Icon name="key" size={14} className="text-fg-3" />
                <span className="flex-1 min-w-0 text-[13.5px]">{l.text}</span>
                <span className="text-[12px] text-fg-3 whitespace-nowrap">{l.byName} · {fmtDateTime(l.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
};
