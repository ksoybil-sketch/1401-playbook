/**
 * 1401 Campus — e-posta bildirimleri (Firebase Cloud Functions).
 *
 * DURUM: Kurulu ama yayında DEĞİL. Cloud Functions, Firebase'in ücretli
 * planını (Blaze) gerektirir. Plan açılınca:
 *   firebase functions:secrets:set SMTP_URL    (ör. smtps://kullanici:sifre@smtp-relay.brevo.com:465)
 *   firebase deploy --only functions --project playbook-1401
 * Ayrıntı: functions/README.md
 *
 * Kim hangi e-postayı alır: Firestore config/notifications (panelde
 * "Bildirimler" ekranı). Belge yoksa rollerden varsayılan dağılım kurulur
 * (aşağıda DEFAULTS). Gönderilen her e-posta mailLog koleksiyonuna yazılır.
 *
 * Emülatörde ya da SMTP_URL tanımlı değilken e-posta GÖNDERİLMEZ; yalnızca
 * mailLog'a "gonderilmedi (deneme)" olarak yazılır. Böylece kurallar
 * gerçek kimseye e-posta gitmeden denenebilir.
 */
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, send, sendTo, recipients, esc, app, CAT, fmt, opts, TZ } from './ortak.js';
import { gunlukOzetGonder, haftalikRaporGonder } from './ozet.js';

/* ------------------------------------------------------------------ */
/* Talepler                                                             */
/* ------------------------------------------------------------------ */

export const talepAcildi = onDocumentCreated({ document: 'requests/{id}', ...opts }, async (e) => {
  const r = e.data?.data();
  if (!r) return;
  const urgent = r.priority === 'urgent';
  const body = {
    title: `${urgent ? 'ACİL · ' : ''}${r.storeName}: ${r.title}`,
    lines: [`<b>${esc(CAT[r.category] || r.category)}</b>${r.equipment ? ` · ${esc(r.equipment)}` : ''} · ${esc(r.createdByName)} · ${fmt(r.createdAt)}`, esc(r.detail || '')],
    button: { label: 'Talebi aç', url: app('/talepler') }
  };
  // Acil talep: "acil" olayını seçenler; diğerleri yalnızca "yeni talep"le alır (bir kişiye bir e-posta).
  if (urgent) await send('talep_acil', `Acil talep · ${r.storeName}`, body, { ref: `requests/${e.params.id}` });
  const already = urgent ? new Set((await recipients('talep_acil')).map((p) => p.email)) : new Set();
  const to = (await recipients('talep_yeni')).filter((p) => !already.has(p.email));
  if (to.length) await sendTo(to, 'talep_yeni', `Yeni talep · ${r.storeName}`, body, { ref: `requests/${e.params.id}` });
});


export const talepDegisti = onDocumentUpdated({ document: 'requests/{id}', ...opts }, async (e) => {
  const before = e.data?.before.data();
  const r = e.data?.after.data();
  if (!before || !r) return;
  const ref = { ref: `requests/${e.params.id}` };
  const added = (r.notes || []).slice((before.notes || []).length);
  const storeReply = added.find((n) => n.side === 'store' && n.text);
  if (storeReply) {
    await send('talep_yanit', `Mağazadan yanıt · ${r.storeName}`, {
      title: `${r.storeName}: ${r.title}`,
      lines: [`<b>${esc(storeReply.byName)}</b> yazdı:`, esc(storeReply.text)],
      button: { label: 'Yanıtla', url: app('/talepler') }
    }, ref);
  }
  if (before.status !== r.status && r.status === 'approval') {
    await send('talep_onay', `Servis onayı bekliyor · ${r.storeName}`, {
      title: `Onayınız bekleniyor: ${r.title}`,
      lines: [`${esc(r.storeName)} · ${esc(CAT[r.category] || '')}${r.equipment ? ` · ${esc(r.equipment)}` : ''}`, 'Bölge Müdürü yetkili servis için onayınızı istiyor.'],
      button: { label: 'Onaylar', url: app('/talepler?durum=onay') }
    }, ref);
  }
  if (before.status === 'approval' && r.status !== 'approval') {
    const ok = r.status !== 'rejected';
    await send('talep_karar', `Servis ${ok ? 'onaylandı' : 'reddedildi'} · ${r.storeName}`, {
      title: `${r.title}: servis ${ok ? 'onaylandı' : 'reddedildi'}`,
      lines: [`${esc(r.storeName)}`],
      button: { label: 'Talebi aç', url: app('/talepler') }
    }, ref);
  }
});

/* ------------------------------------------------------------------ */
/* Öneriler (onay akışı) ve geri bildirim                               */
/* ------------------------------------------------------------------ */

const KIND = { lesson: 'Ders', module: 'Modül', track: 'Eğitim yolu', question: 'Soru', bulletin: 'Bülten', order: 'Sıralama', product: 'Yeni ürün' };

export const oneriGeldi = onDocumentCreated({ document: 'proposals/{id}', ...opts }, async (e) => {
  const p = e.data?.data();
  if (!p || p.status !== 'pending') return;
  await send('oneri_yeni', `Onay bekleyen ${KIND[p.kind] || 'öneri'}: ${p.title}`, {
    title: `${KIND[p.kind] || 'Öneri'}: ${p.title}`,
    lines: [`${esc(p.createdByName)} · ${esc(p.summary || '')}`, 'Yayına girmesi için onayınız gerekiyor.'],
    button: { label: 'Bekleyen onaylar', url: app('/onaylar') }
  }, { ref: `proposals/${e.params.id}` });
});

export const oneriKarar = onDocumentUpdated({ document: 'proposals/{id}', ...opts }, async (e) => {
  const before = e.data?.before.data();
  const p = e.data?.after.data();
  if (!before || !p || before.status === p.status || !['approved', 'rejected'].includes(p.status)) return;
  // Yalnızca öneriyi yapan kişiye (o kişi bu olayı seçtiyse).
  const owner = (await recipients('oneri_karar')).filter((r) => r.uid === p.createdBy || !r.uid);
  if (!owner.length) return;
  await sendTo(owner, 'oneri_karar', `${p.title}: ${p.status === 'approved' ? 'yayınlandı' : 'geri gönderildi'}`, {
    title: `${KIND[p.kind] || 'Öneri'} ${p.status === 'approved' ? 'yayınlandı' : 'geri gönderildi'}: ${p.title}`,
    lines: [p.reviewNote ? `Not: ${esc(p.reviewNote)}` : '', `${esc(p.reviewedByName || '')}`].filter(Boolean),
    button: { label: 'Önerilerim', url: app('/onaylar') }
  }, { ref: `proposals/${e.params.id}` });
});

export const geriBildirim = onDocumentCreated({ document: 'feedback/{id}', ...opts }, async (e) => {
  const f = e.data?.data();
  if (!f) return;
  const kind = { hata: 'Hata', icerik: 'İçerik hatası', oneri: 'Öneri' }[f.kind] || 'Geri bildirim';
  await send('geri_bildirim', `${kind} · ${f.byName}`, {
    title: `${kind}: ${String(f.text).slice(0, 80)}`,
    lines: [esc(f.text), `${esc(f.byName)}${f.storeName ? ` · ${esc(f.storeName)}` : ''} · ekran ${esc(f.path)}${f.lessonTitle ? ` · ${esc(f.lessonTitle)}` : ''} · ${esc(f.device)} · ${esc(f.version)}`],
    button: { label: 'Geri bildirimler', url: app('/geri-bildirim') }
  }, { ref: `feedback/${e.params.id}` });
});

/* ------------------------------------------------------------------ */
/* Zamanlanmış: günlük özet (her sabah 08:30) ve haftalık rapor (pazartesi 09:00) */
/* ------------------------------------------------------------------ */

export const gunlukOzet = onSchedule({ schedule: '30 8 * * *', timeZone: TZ, ...opts }, gunlukOzetGonder);
export const haftalikRapor = onSchedule({ schedule: '0 9 * * 1', timeZone: TZ, ...opts }, haftalikRaporGonder);
