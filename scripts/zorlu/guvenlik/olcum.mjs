// Küçük, sınırlı ölçümler (kendi emülatör): kod kahini, PIN kilidi, kota, bootstrap, dinleyici.
import { readFileSync } from 'node:fs';
import { setLogLevel } from 'firebase/app';
setLogLevel('silent');
import { client, adb, attempt } from './lib.mjs';
import { doc, getDoc, getDocs, collection, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
const A = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url)));
const log = (...x) => console.log(...x);

// 1) pairingCodes get() kahini: var olmayan kod OKUNABİLİR mi (resource==null) — tek tek, 5 örnek
{
  const x = await client();
  let okNull = 0, okReal = 0;
  for (const code of ['000001', '111111', '222222', '333333', '444444']) {
    const r = await attempt(() => getDoc(doc(x.db, 'pairingCodes', code)));
    if (r.ok) okNull++;
  }
  const real = await attempt(() => getDoc(doc(x.db, 'pairingCodes', A.pairCode)));
  log('1 pairingCodes get() oturumsuz: olmayan 5 kod →', okNull, '/5 izin (reddetmiyor); geçerli kod → şifre', real.ok ? 'OKUNUYOR' : 'red');
  log('  → kural "allow get: if resource==null || expiresAt>now": yanlış kod da reddedilmez, doğru/yanlış ayrımı yok; 6 hane = 1e6 uzay, hız sınırı YOK (istemci sayfa açmadan okur).');
  await x.close();
}

// 2) PIN kilidi: Auth'un kendi eşik eşiği kaç yanlış denemeden sonra (bounded, en çok 12)
{
  const x = await client();
  const email = A.bA.email;
  let n = 0, locked = false;
  for (; n < 12; n++) {
    const r = await attempt(() => x.auth.signInWithEmailAndPassword(x.fb.auth, email, `pb-bA-000${n}`));
    if (!r.ok && r.code === 'auth/too-many-requests') { locked = true; break; }
  }
  log(`2 PIN (Auth parola) kilidi: ${n} yanlış denemeden sonra ${locked ? 'auth/too-many-requests (emülatör eşiği)' : 'hâlâ kilitlenmedi'}`);
  log('  → Kilit Auth hesabı (e-posta) başına. Barista hesabı b-<id>-<seq>@…; saldırgan farklı baristaId denerse her biri ayrı hesap, ayrı sayaç. PIN 4 hane=1e4.');
  await x.close();
}

// 3) Hata kaydı / geri bildirim kota tüketme: bir baristanın yazabildiği belge sayısı sınırsız mı
{
  const x = await client(A.bA.email, A.bA.password);
  const t0 = performance.now();
  let w = 0;
  const batchN = 50;
  for (let i = 0; i < batchN; i++) {
    const r = await attempt(() => setDoc(doc(collection(x.db, 'hatalar')), { by: A.bA.uid, message: 'x'.repeat(480), stack: 'y'.repeat(1900), createdAt: Date.now() }));
    if (r.ok) w++; else break;
  }
  const ms = Math.round(performance.now() - t0);
  log(`3 hata kaydı: tek barista ${w}/${batchN} belge ${ms}ms'de yazdı (red yok). Kurallarda oran/sayı sınırı yok; Spark günlük 20.000 yazma kotası bir baristayla tüketilebilir (DoS/kota bitirme).`);
  await x.close();
}

// 4) config/bootstrap yeniden açılabilir mi: admin bile silemiyorsa yol kapalı
{
  const dir = await client(A.director.email, A.director.password);
  const del = await attempt(() => deleteDoc(doc(dir.db, 'config/bootstrap')));
  log('4 config/bootstrap silme (director):', del.ok ? 'İZİN — bootstrap yeniden açılabilir!' : 'red (update,delete:false) — yol kapalı');
  await dir.close();
  // admin rolü deneyelim (eski tam yetkili)
  const devc = await client(A.dev.email, A.dev.password);
  const del2 = await attempt(() => deleteDoc(doc(devc.db, 'config/bootstrap')));
  log('4b config/bootstrap silme (developer):', del2.ok ? 'İZİN!' : 'red — developer bile silemez (kural sabit)');
  await devc.close();
}

// 5) Ekipten çıkarılanın açık sekmesi: pasifleşince okuma anında kesiliyor mu
{
  const ex = await client(A.ops2.email, A.ops2.password);
  const before = await attempt(() => getDocs(collection(ex.db, 'lessons')));
  await adb.doc(`users/${A.ops2.uid}`).update({ active: false });
  await new Promise((r) => setTimeout(r, 400));
  const after = await attempt(() => getDocs(collection(ex.db, 'lessons')));
  log(`5 ekipten çıkarma: önce içerik okuma ${before.ok ? 'izin' : 'red'}, pasifleştirildikten sonra ${after.ok ? 'HÂLÂ izin' : 'red'} (jeton yenilenene kadar istemci okumaya devam eder mi?)`);
  await adb.doc(`users/${A.ops2.uid}`).update({ active: true });
  await ex.close();
}
process.exit(0);
