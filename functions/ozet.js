/**
 * Zamanlanmış e-postalar: günlük özet ve haftalık rapor. index.js her
 * sabah / her pazartesi çağırır; scripts/deneme-ozet.mjs emülatörde
 * doğrudan çalıştırır (emülatörde zamanlayıcı yok).
 */
import { db, send, sendTo, recipients, catGroups, esc, app, dur, H, TZ } from './ortak.js';

/* ------------------------------------------------------------------ */
/* Zamanlanmış: günlük özet ve haftalık rapor                           */
/* ------------------------------------------------------------------ */

async function openRequests() {
  const snap = await db.collection('requests').where('status', 'in', ['open', 'seen', 'in_progress', 'approval']).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function gunlukOzetGonder() {
  const now = Date.now();
  const open = await openRequests();
  const late = open.filter((r) => now - r.createdAt > 72 * H).sort((a, b) => a.createdAt - b.createdAt);
  const pending = (await db.collection('proposals').where('status', '==', 'pending').get()).size;
  const yesterday = now - 24 * H;
  const attempts = (await db.collection('attempts').where('submittedAt', '>=', yesterday).get()).docs.map((d) => d.data());

  if (late.length) {
    // Konu sınırlı birim (Pazarlama & Kreatif) yalnızca kendi konularındaki
    // gecikenleri görür: alıcılar kapsamına göre gruplanır, her gruba kendi
    // listesi gider (hiç gecikeni olmayan gruba e-posta gitmez).
    for (const g of await catGroups(await recipients('talep_geciken'))) {
      const mine = g.cats ? late.filter((r) => g.cats.includes(r.category)) : late;
      if (!mine.length) continue;
      await sendTo(g.people, 'talep_geciken', `${mine.length} talep 3 günü geçti`, {
        title: `${mine.length} açık talep 3 günden uzun süredir bekliyor`,
        table: [['Talep', 'Bekliyor'], ...mine.slice(0, 15).map((r) => [`${r.storeName} · ${r.title}`, dur(now - r.createdAt)])],
        button: { label: 'Talepler', url: app('/talepler') }
      });
    }
  }
  await send('gunluk_ozet', `Günlük özet · ${new Date().toLocaleDateString('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long' })}`, {
    title: 'Günlük özet',
    table: [
      ['', ''],
      ['Açık talep', String(open.length)],
      ['Acil açık talep', String(open.filter((r) => r.priority === 'urgent').length)],
      ['Direktör onayında servis', String(open.filter((r) => r.status === 'approval').length)],
      ['3 günü geçen talep', String(late.length)],
      ['Onay bekleyen öneri', String(pending)],
      ['Dün girilen sınav', `${attempts.length} (${attempts.filter((a) => a.passed).length} geçti)`]
    ],
    button: { label: 'Genel bakış', url: app('/') }
  });
}

export async function haftalikRaporGonder() {
  const now = Date.now();
  const from = now - 7 * 24 * H;
  const reqs = (await db.collection('requests').where('createdAt', '>=', from).get()).docs.map((d) => d.data());
  const done = reqs.filter((r) => r.status === 'done' && r.closedAt);
  const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const attempts = (await db.collection('attempts').where('submittedAt', '>=', from).get()).docs.map((d) => d.data());
  const byStore = new Map();
  attempts.forEach((a) => { const s = byStore.get(a.storeId) || { n: 0, pass: 0 }; s.n++; if (a.passed) s.pass++; byStore.set(a.storeId, s); });
  const stores = Object.fromEntries((await db.collection('stores').get()).docs.map((d) => [d.id, d.get('name')]));
  await send('haftalik_rapor', 'Haftalık rapor', {
    title: 'Geçen haftanın özeti',
    lines: [`<b>Talepler:</b> ${reqs.length} açıldı, ${done.length} çözüldü, çözülme süresi (medyan) ${med(done.map((r) => r.closedAt - r.createdAt)) ? dur(med(done.map((r) => r.closedAt - r.createdAt))) : '—'}.`,
      `<b>Sınavlar:</b> ${attempts.length} deneme, ${attempts.filter((a) => a.passed).length} geçti.`],
    table: [['Mağaza', 'Sınav · geçen'], ...[...byStore.entries()].map(([id, s]) => [stores[id] || id, `${s.n} · ${s.pass}`])],
    button: { label: 'Talep istatistikleri', url: app('/talepler/istatistik') }
  });
}
