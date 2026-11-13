/** Ortak: veritabanı, alıcılar, e-posta şablonu ve gönderim. */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret, defineString } from 'firebase-functions/params';
import nodemailer from 'nodemailer';

initializeApp();
export const db = getFirestore();
setGlobalOptions({ region: 'europe-west1', maxInstances: 3, memory: '256MiB' });

export const SMTP_URL = defineSecret('SMTP_URL');
export const MAIL_FROM = defineString('MAIL_FROM', { default: '1401 Campus <bildirim@1401coffee.com>' });
export const APP_URL = defineString('APP_URL', { default: 'https://playbook-1401.web.app' });
export const TZ = 'Europe/Istanbul';
export const H = 3600000;

/* ------------------------------------------------------------------ */
/* Kim, hangi olayda                                                    */
/* ------------------------------------------------------------------ */

/** Olaylar — panelde de aynı liste (src/lib/notifications.ts). */
export const EVENTS = [
  'talep_yeni', 'talep_acil', 'talep_yanit', 'talep_onay', 'talep_karar', 'talep_geciken',
  'oneri_yeni', 'oneri_karar', 'geri_bildirim', 'gunluk_ozet', 'haftalik_rapor',
  'kurul_soru', 'kurul_yanit'
];

/** Rol → varsayılan olaylar (config/notifications yoksa). */
const DEFAULTS = {
  developer: ['geri_bildirim', 'haftalik_rapor'],
  director: ['talep_acil', 'talep_onay', 'oneri_yeni', 'kurul_soru', 'gunluk_ozet', 'haftalik_rapor'],
  regional: ['talep_yeni', 'talep_acil', 'talep_yanit', 'talep_karar', 'talep_geciken', 'oneri_karar', 'kurul_soru', 'gunluk_ozet'],
  board: ['kurul_yanit', 'haftalik_rapor']
};

export async function recipients(event) {
  const snap = await db.doc('config/notifications').get();
  let people = snap.exists ? snap.get('people') || [] : null;
  if (!people) {
    const users = await db.collection('users').where('role', 'in', Object.keys(DEFAULTS)).get();
    people = users.docs.filter((d) => d.get('active') !== false && d.get('email')).map((d) => ({
      uid: d.id, name: d.get('name') || d.get('email'), email: d.get('email'), role: d.get('role'), events: DEFAULTS[d.get('role')] || []
    }));
  }
  return people.filter((p) => p.email && p.active !== false && (p.events || []).includes(event));
}

/* ------------------------------------------------------------------ */
/* Gönderim                                                             */
/* ------------------------------------------------------------------ */

export let transport = null;
/** Demo projesinde ve emülatörde gerçek e-posta gitmez (örnek veri sıfırlanınca herkese e-posta yağmasın). */
export const DRY = !!process.env.FUNCTIONS_EMULATOR || process.env.GCLOUD_PROJECT === 'playbook-demo-1401';
export function mailer() {
  if (DRY) return null;
  const url = process.env.SMTP_URL || SMTP_URL.value();
  if (!url) return null;
  transport ||= nodemailer.createTransport(url);
  return transport;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Sade, her e-posta istemcisinde düzgün görünen şablon. */
export function html({ title, lines = [], table, button }) {
  const rows = table?.length
    ? `<table style="border-collapse:collapse;width:100%;margin:14px 0;font-size:14px">${table.map((r, i) =>
      `<tr style="${i === 0 ? 'font-weight:600;color:#6b625b' : ''}">${r.map((c, j) => `<td style="padding:7px 8px;border-bottom:1px solid #eee;${j ? 'text-align:right' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
    : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1c1714">
  <div style="font-size:12px;letter-spacing:2px;color:#b07a45;font-weight:700;text-transform:uppercase">1401 Campus</div>
  <h1 style="font-size:20px;margin:6px 0 12px">${esc(title)}</h1>
  ${lines.map((l) => `<p style="font-size:14px;line-height:1.55;margin:6px 0">${l}</p>`).join('')}
  ${rows}
  ${button ? `<p style="margin:18px 0"><a href="${esc(button.url)}" style="background:#1c1714;color:#f2ede7;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">${esc(button.label)}</a></p>` : ''}
  <p style="font-size:12px;color:#8a817a;margin-top:22px">Bu e-postayı 1401 Campus bildirim ayarlarınız nedeniyle aldınız. Ayarlar: Kahve Operasyonu → Bildirimler.</p>
</div>`;
}

export async function send(event, subject, body, extra = {}) {
  const to = await recipients(event);
  if (!to.length) return;
  const m = mailer();
  for (const p of to) {
    const log = { event, subject, to: p.email, toName: p.name || '', at: Date.now(), ...extra };
    if (!m) {
      await db.collection('mailLog').add({ ...log, status: 'gonderilmedi (deneme)' });
      console.log(`[e-posta deneme] ${event} → ${p.email}: ${subject}`);
      continue;
    }
    try {
      await m.sendMail({ from: MAIL_FROM.value(), to: p.email, subject: `1401 Campus · ${subject}`, html: html(body) });
      await db.collection('mailLog').add({ ...log, status: 'gonderildi' });
    } catch (e) {
      await db.collection('mailLog').add({ ...log, status: 'hata', error: String(e?.message || e).slice(0, 300) });
    }
  }
}

export const app = (path) => `${APP_URL.value()}/#${path}`;
export const CAT = { ariza: 'Arıza', servis: 'Teknik servis', malzeme: 'Malzeme / ekipman', personel: 'Personel', diger: 'Diğer' };
export const fmt = (ms) => new Date(ms).toLocaleString('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
export const dur = (ms) => { const h = ms / H; return h < 24 ? `${Math.max(1, Math.round(h))} saat` : `${Math.round(h / 24)} gün`; };
export const opts = { secrets: [SMTP_URL] };


export async function sendTo(people, event, subject, body, extra) {
  const m = mailer();
  for (const p of people) {
    const log = { event, subject, to: p.email, toName: p.name || '', at: Date.now(), ...extra };
    if (!m) { await db.collection('mailLog').add({ ...log, status: 'gonderilmedi (deneme)' }); continue; }
    try {
      await m.sendMail({ from: MAIL_FROM.value(), to: p.email, subject: `1401 Campus · ${subject}`, html: html(body) });
      await db.collection('mailLog').add({ ...log, status: 'gonderildi' });
    } catch (err) {
      await db.collection('mailLog').add({ ...log, status: 'hata', error: String(err?.message || err).slice(0, 300) });
    }
  }
}
