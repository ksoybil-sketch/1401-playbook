import { doc, increment, setDoc } from 'firebase/firestore';
import { db } from '../api/firebase';
import { ekranKodu, receteKimligi } from './ekranlar';

/**
 * Kullanım sayacı: hangi ekranlar açılıyor, hangi reçeteye bakılıyor,
 * uygulama günde kaç kez ve hangi saatlerde açılıyor?
 *
 * Neden gerekli: canlıda yalnızca *başarılar* yazılıyor (ders tamamlandı,
 * sınav geçildi). Yarı yolda bırakılan her şey ve hiç kayıt üretmeyen
 * ekranlar (Reçete, Bugün, Ekibim, Sonuçlarım) görünmüyor. Bkz.
 * docs/KULLANIM-VERISI.md ve docs/KULLANIM-ONERILER.md.
 *
 * ## Kişiye bağlı DEĞİL
 *
 * Kayıt mağaza başına tutulur: `kullanim/{storeId}_{YYYYAAGG}`. Belge günü
 * **UTC**'dir (kural `request.time` ile doğruluyor), `saatler` ise Türkiye
 * saatine göre yazılır. Yani gün sınırı Türkiye'de 03:00'tedir: gece 01:00'de
 * yapılan iş önceki günün belgesine düşer. Raporda böyle okunur. İçinde uid,
 * ad ya da barista kimliği yok. Böylece KVKK açısından kişisel veri
 * işlenmez; "mağaza düzeyinde toplu kullanım istatistiği"dir. Kişi bazında
 * aktiflik zaten `progress` ve `attempts` kayıtlarından görülüyor.
 *
 * Kişi bazına geçmek için İKİ yer birlikte değişir:
 *   1. buradaki KISI_BAZLI sabiti,
 *   2. firestore.rules `match /kullanim/{id}` (belge kimliği kuralı).
 * İkisi de KVKK aydınlatma metni onaylanmadan açılmamalı
 * (docs/KVKK-AYDINLATMA-TASLAK.md).
 *
 * ## Yalnızca mağaza oturumları
 *
 * Mağaza telefonu ve barista oturumlarında çalışır; yönetici panelinde
 * çalışmaz. Uygulama geliştiricisi bir mağaza oturumu açmadığı için
 * kendiliğinden hiçbir iz bırakmaz.
 *
 * ## Spark kotası
 *
 * Yazım anında olmaz: sayaçlar bellekte birikir, uygulama arka plana
 * geçerken ya da kapanırken gönderilir; iki gönderim arası en az
 * ARA_EN_AZ, günde en çok GUNDE_EN_COK gönderim. Böylece ekran gezinmesi
 * yazma üretmez. Bugün (≈95 cihaz) günde en çok ~570, 50 mağazada ~2.400
 * yazma — Spark sınırı 20.000/gün.
 *
 * ## Kayıp olabilir, olsun
 *
 * Bu bir sayaçtır, muhasebe değil. İki yerde veri kaybı beklenir ve kabul
 * edilir:
 *   - `pagehide` (sekme/uygulama kapanıyor): tarayıcı sayfayı yıkarken
 *     eşzamansız yazım çoğu zaman tamamlanmaz. Son paket kaybolur.
 *   - Arka plandaki sekme: tarayıcı zamanlayıcıları ve ağı kısıtlar; yazım
 *     gecikir ya da düşer.
 * Asıl yol `visibilitychange`'tir: uygulama arka plana geçerken sayfa hâlâ
 * canlıdır ve yazım tamamlanır. Kaybedilen en fazla son ARA_EN_AZ'lık
 * gezinmedir. Bunu telafi etmek için yeniden deneme kuyruğu KURULMADI:
 * bekleyen yazım bırakmak çevrimdışı davranışını bozar (bkz. serverTime.ts
 * aynı gerekçe) ve kota harcar.
 */

/** Kişi bazlı kayıt kapalı: KVKK aydınlatma metni onayı bekliyor. */
const KISI_BAZLI = false;

const ARA_EN_AZ = 15 * 60_000;
/**
 * İlk gönderim hemen yapılmaz: açılışın ilk dakikası birikir, yoksa yalnızca
 * "uygulama açıldı" yazan boşa bir yazım günlük altı gönderimden birini yer ve
 * geri kalan gezinme 15 dakika bekler.
 */
const ILK_ARA = 60_000;
const GUNDE_EN_COK = 6;
/** firestore.rules sınırları: anahtar sayıları aşılmaz. */
const EKRAN_EN_COK = 20;
const RECETE_EN_COK = 40;

type Sayac = Record<string, number>;
interface Birikim { acilis: number; saatler: Sayac; ekran: Sayac; recete: Sayac }

const bos = (): Birikim => ({ acilis: 0, saatler: {}, ekran: {}, recete: {} });
let biriken = bos();
let kimlik: { storeId: string; uid: string } | null = null;
let sonGonderim = 0;
let zamanlayici: ReturnType<typeof setTimeout> | null = null;
let kuruldu = false;

/** YYYYAAGG, UTC — kural request.time ile aynı günü hesaplar. */
const utcGun = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
/** Saat anahtarı Türkiye saatiyle ("08"): rapor da bu saate göre okunur. */
const saatAnahtari = () => {
  try {
    return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false })
      .format(new Date()).slice(0, 2);
  } catch { return String(new Date().getUTCHours()).padStart(2, '0'); }
};

const sayacKey = (gun: string) => `kullanim-gonderim:${gun}`;
function gonderimSayisi(gun: string): number {
  try { return Number(localStorage.getItem(sayacKey(gun))) || 0; } catch { return 0; }
}
function gonderimArtir(gun: string, n: number) {
  try { localStorage.setItem(sayacKey(gun), String(n)); } catch { /* gizli pencere: yalnız bellekte */ }
}
let bellekGonderim = 0;
let bellekGun = '';

const doluMu = (b: Birikim) => b.acilis > 0 || Object.keys(b.ekran).length > 0 || Object.keys(b.recete).length > 0;
const artir = (s: Sayac, k: string, enCok: number) => {
  if (!(k in s) && Object.keys(s).length >= enCok) return;
  s[k] = (s[k] || 0) + 1;
};

/** Oturum açıldığında: hangi mağaza, hangi hesap. Yönetici için çağrılmaz. */
export function kullanimBasla(storeId: string, uid: string): void {
  if (!storeId || !uid) return;
  const yeni = !kimlik || kimlik.storeId !== storeId;
  kimlik = { storeId, uid };
  if (yeni) {
    biriken.acilis++;
    artir(biriken.saatler, saatAnahtari(), 24);
  }
  if (!kuruldu) {
    kuruldu = true;
    // Arka plana geçerken ve kapanırken gönder (sekme kapanışı da dahil).
    // visibilitychange document'te tetiklenir; pagehide sekme kapanışını yakalar.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void gonder(true); });
    window.addEventListener('pagehide', () => { void gonder(true); });
  }
  planla();
}

/** Ekran değişimi. Yol react-router'ın pathname'i. */
export function kullanimEkran(pathname: string): void {
  if (!kimlik) return;
  artir(biriken.ekran, ekranKodu(pathname), EKRAN_EN_COK);
  const r = receteKimligi(pathname);
  // Firestore alan adı güvenli olsun (nokta, köşeli parantez vb. olmasın).
  const temiz = r ? r.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60) : '';
  if (temiz) artir(biriken.recete, temiz, RECETE_EN_COK);
  planla();
}

/** Oturum kapanınca biriken son parçayı gönder ve dur. */
export function kullanimBitti(): void {
  void gonder(true);
  kimlik = null;
  if (zamanlayici) { clearTimeout(zamanlayici); zamanlayici = null; }
}

function planla() {
  if (zamanlayici || !doluMu(biriken)) return;
  const bekle = sonGonderim === 0 ? ILK_ARA : Math.max(1000, ARA_EN_AZ - (Date.now() - sonGonderim));
  zamanlayici = setTimeout(() => { zamanlayici = null; void gonder(); }, bekle);
}

/** zorla: arka plana geçiş ve çıkışta bekletmeyi atlar (günlük sınır yine geçerli). */
async function gonder(zorla = false): Promise<void> {
  if (!kimlik || !doluMu(biriken)) return;
  const now = Date.now();
  if (!zorla && sonGonderim !== 0 && now - sonGonderim < ARA_EN_AZ) { planla(); return; }
  const gun = utcGun();
  // Gün dönerse (uygulama açık kaldıysa) günlük sayaç yeniden başlar.
  if (bellekGun !== gun) { bellekGun = gun; bellekGonderim = 0; }
  const kac = Math.max(gonderimSayisi(gun), bellekGonderim);
  if (kac >= GUNDE_EN_COK) return; // günlük sınır: kalan birikim gönderilmez
  const paket = biriken;
  biriken = bos();
  sonGonderim = now;
  bellekGonderim = kac + 1;
  gonderimArtir(gun, kac + 1);
  const id = `${KISI_BAZLI ? kimlik.uid : kimlik.storeId}_${gun}`;
  const data: Record<string, unknown> = { day: gun, storeId: kimlik.storeId, updatedAt: now };
  if (KISI_BAZLI) data.uid = kimlik.uid;
  if (paket.acilis) data.acilis = increment(paket.acilis);
  for (const [alan, s] of [['saatler', paket.saatler], ['ekran', paket.ekran], ['recete', paket.recete]] as const) {
    const girdiler = Object.entries(s);
    if (girdiler.length) data[alan] = Object.fromEntries(girdiler.map(([k, v]) => [k, increment(v)]));
  }
  try {
    await setDoc(doc(db, 'kullanim', id), data, { merge: true });
  } catch {
    // Yetki ya da ağ hatası: sayaç kaybolur, uygulama etkilenmez. Yeniden
    // denenmez; kuyrukta bekleyen yazım bırakmamak için bilinçli.
  }
}
