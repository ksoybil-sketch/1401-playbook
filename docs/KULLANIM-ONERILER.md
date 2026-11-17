# Kullanım: neler yapabiliriz

## 17.11.2026: 1., 2. ve 3. grup yapıldı

Kullanıcı 1, 2 ve 3. grubu onayladı; 4. grup gereksiz bulundu (uygulamada geri
bildirim tuşu var), 5. grup (Blaze) sonraya bırakıldı.

**Yapıldı ve doğrulandı:**

| İş | Nerede | Durum |
|---|---|---|
| Saat belgesini okumak | `firestore.rules` → `match /clock` | ✓ kural testi geçti (235 denetim, 0 kaldı) |
| Yarım kalan sınavlar | `scripts/kullanim.mjs` | ✓ demoda çalıştı |
| Ölü özellik avı | `scripts/kullanim.mjs` | ✓ demoda çalıştı |
| Düzeltme oranı | `scripts/kullanim.mjs` | ✓ demoda çalıştı |
| Tekrar eden iş | `scripts/kullanim.mjs` | ✓ demoda çalıştı |
| Ders–sınav kaybı | `scripts/kullanim.mjs` | ✓ demoda çalıştı |
| İlk kullanım gecikmesi | `scripts/kullanim.mjs` | ✓ demoda çalıştı |
| Yedekler arası fark | `npm run kullanim -- --yedek-farki` | ✓ çalıştı |
| Rapor arşivinden gidişat | `npm run kullanim -- --trend` | ✓ çalıştı |
| Auth'un son giriş kaydı | `scripts/kullanim.mjs` | ✓ kod hazır, `serviceAccountKey.json` bekliyor |
| Hız ölçümü | `src/lib/perf.ts`, [HIZ-BUTCESI.md](HIZ-BUTCESI.md) | ✓ mevcut ölçüm noktaları bağlandı |
| Mağaza sayacı | `src/lib/kullanimKaydi.ts` + kural | ✓ emülatörde uçtan uca yazdı; dağıtım bekliyor |
| Dokunuş sayımı | [DENETIM-DOKUNUS.md](DENETIM-DOKUNUS.md) | ✓ rapor çıktı |
| Yüzey/metin/tek el denetimi | [DENETIM-EKRANLAR.md](DENETIM-EKRANLAR.md) | ✓ rapor çıktı |
| Akıllı varsayılanlar | [ONERI-AKILLI-VARSAYILAN.md](ONERI-AKILLI-VARSAYILAN.md) | ✓ öneri çıktı, uygulanmadı |

**Demoya dağıtıldı (17.11.2026).** Kurallar ve yeni sürüm
https://playbook-demo-1401.web.app adresinde.

**Canlıya alındı: 17.11.2026 (sürüm 1.5.0, commit f41a178).** Önce "iki hafta
veri toplasın" denmişti; aynı gün talep kapsamı değişikliğiyle birlikte canlıya
çıkıldı. Artık **her şey canlıda veri topluyor** — aşağıdaki "ne birikir"
tablosunun son iki satırı da dahil.

### Bu iki haftada ne birikir, ne birikmez

Canlıya hiçbir şey dağıtılmadığı için fark önemli:

| Veri | Birikir mi? | Neden |
|---|---|---|
| Ders tamamlama, sınav, talep, görev, bülten, geri bildirim, hata | **Evet** | Zaten yazılıyor |
| Yarım kalan sınav, süre aşımı | **Evet** | `attempts` alanları |
| Ölü özellik avı, düzeltme oranı, tekrar eden iş, ders–sınav kaybı, ilk kullanım gecikmesi | **Evet** | Hepsi var olan kayıtlardan |
| `clock` — her hesabın son etkinliği | **Yazılıyor, okunamıyor** | Yazım zaten vardı; okuma kuralı canlıya gitmedi |
| Firebase Auth son giriş zamanı | **Evet** | Auth tarafında; yalnızca `serviceAccountKey.json` gerekiyor, dağıtım gerekmiyor |
| **Ekran ve reçete kullanımı (mağaza sayacı)** | **Evet** (17.11'den beri) | 1.5.0 ile canlıya çıktı |
| **Hız ölçümü (Performance Monitoring)** | **Evet** (17.11'den beri) | Aynı sürümle |

`clock` için not: belge yalnızca **son** anı tutuyor, geçmiş biriktirmiyor.
Geçmiş, raporu düzenli çalıştırdıkça `kullanim-raporlari/` klasöründe birikir.

### İki haftada yapılacak

Dağıtım gerektirmeyen, bugün işleyen tek iş:

```bash
npm run kullanim -- --gun 7
```

Haftada bir (ya da Claude'a "durum nedir?" diyerek). Her rapor
`kullanim-raporlari/` klasöründe birikir; sonunda `npm run kullanim -- --trend`
gidişatı çıkarır. `npm run yedek` haftalık alınırsa
`npm run kullanim -- --yedek-farki` iki hafta arasındaki değişimi de verir.

**Bilinen sınır:** sayaç yazımı sekme kapanırken (`pagehide`) ve arka plandaki
sekmede tamamlanmayabilir — tarayıcı sayfayı yıkarken eşzamansız yazımı
kesiyor. Asıl yol `visibilitychange` (uygulama arka plana geçerken sayfa hâlâ
canlı) ve orada çalışıyor. En fazla son 15 dakikalık gezinme kaybolur; bu bir
sayaç olduğu için kabul edildi, yeniden deneme kuyruğu kurulmadı (bekleyen
yazım çevrimdışı davranışını bozar ve kota harcar).

**Demoda doğrulama (17.11.2026):** saat belgesi okunuyor (rapor 0 → 4 hesabın
son girişi). Sayaç gerçek demo sitesinde yazdı: iki reçete gezildi,
`kullanim/moda-cadde_<gün>` belgesine `ana:1, receteler:2, recete:2` ve iki
reçete adı düştü — içinde uid ya da ad yok. Ayrıca
`scripts/yuk-testi/sayac-iki-yazim.mjs`: ardışık dört yazım biçimi
(açılış+ekran, yalnızca ekran+reçete, hepsi, tek ekran) emülatörde dördü de
geçti — kural hiçbirini reddetmiyor.

**Doğrulama (17.11.2026, yerel emülatör):** kural testi 235 denetim, 0 kaldı
(sayaç için 27 yeni denetim: başka mağazaya yazma, dünün belgesi, kişi bazlı
kimlik, fazladan alan, ad yazma, şişirilmiş sayaç, 41 anahtar — hepsi
reddedildi; geliştirici okur, direktör okumaz). Sayaç uçtan uca da denendi:
telefon bağlandı, iki reçete gezildi, `kullanim/moda-cadde_<gün>` belgesi
`acilis`, `saatler`, `ekran` ve `recete` ile yazıldı — içinde uid ya da ad yok.

**Bilinçli olarak yapılmayanlar:**

- **Google Analytics:** yurt dışına veri aktarımı ve açık rıza gerektiriyor,
  KVKK metni hukukçuda. Mağaza sayacı aynı bilgiyi yurt dışına veri
  göndermeden veriyor. Aşağıdaki 2. grupta açıklaması duruyor.
- **Kişi sayacı:** kod hazır ama `KISI_BAZLI` sabiti **kapalı** ve kural kişi
  bazlı kimliği reddediyor. KVKK aydınlatma metni onaylanmadan açılmaz.
- **Saat belgesine gün eklemek:** sınav süresi yolunu bozma riski var ve kişi
  sayacı aynı geçmişi verecek. Atlandı.
- **Herkese son görülme:** gereksiz — saat belgesi aynı şeyi bedava veriyor.
- **Akıllı varsayılanlar:** [ONERI-AKILLI-VARSAYILAN.md](ONERI-AKILLI-VARSAYILAN.md)
  — nerede varsayılan var, hangisi değişmeli, hangisi değişmemeli. Uygulanmadı.
- **Metin değişiklikleri, yüzey azaltma, tek el düzeltmeleri:** öneri listesi
  olarak [DENETIM-EKRANLAR.md](DENETIM-EKRANLAR.md) içinde; dokunuş
  kısaltmaları [DENETIM-DOKUNUS.md](DENETIM-DOKUNUS.md) içinde. Hiçbiri
  uygulanmadı, kullanıcı onayı bekliyor.
- **Çevrimdışı testi:** ✓ koşturuldu (17.11.2026, 10 adım, 8 geçti; iki başarısız
  adım tasarım gereği — PIN ile yeni giriş ve sınava başlama ağ ister). Sonuç
  [MIMARI.md](MIMARI.md) Kalite bölümünde.

---

Aşağıdaki liste olduğu gibi duruyor: neyin neden seçildiğini ve yapılmayanların
gerekçesini anlatıyor.

Elimizde bugün ne olduğu: [KULLANIM-VERISI.md](KULLANIM-VERISI.md).
Raporu çıkaran komut: `npm run kullanim`.

İki soru var ve karıştırmamak gerekiyor:

- **Kullanılıyor mu?** Kim açıyor, hangi mağaza sessiz, hangi saatte.
- **Nerede zor?** Nerede vazgeçiliyor, hangi ekran gereksiz, kaç adım sürüyor.

Aşağıdaki işler **gerektirdiği şeye göre** gruplanmış. Her birinin bir adı var;
kod ya da numara yok, adıyla anılır.

---

## 1. Hiçbir şey gerektirmeyenler — bugün yapılabilir

Yeni veri toplanmaz, uygulama değişmez, KVKK'ya dokunulmaz.

| Ad | Ne verir | İş |
|---|---|---|
| **Saat belgesini okumak** | Her hesabın son etkinliği | 15 dk |
| **Yarım kalan sınavlar** | Hangi sınav bitirilemiyor | 1 sa |
| **Ölü özellik avı** | Neyi silebiliriz | 1 sa |
| **Düzeltme oranı** | Hangi form ilk seferde dolmuyor | 1 sa |
| **Tekrar eden iş** | Neyi iki kez yapmak zorunda kalıyorlar | 1 sa |
| **Ders–sınav kaybı** | Sınava giriş bulunamıyor mu | 1 sa |
| **İlk kullanım gecikmesi** | İşe alım ile ilk açılış arası | 1 sa |
| **Yedekler arası fark** | Geriye dönük haftalık geçmiş | 1 sa |
| **Rapor arşivinden gidişat** | Haftalık trend | 1 sa |
| **Dokunuş sayımı** | Sık işler kaç adım sürüyor | yarım gün |
| **Yüzey sayımı** | En kalabalık ekranlar | yarım gün |
| **Metin sadeleştirme** | Anlaşılmayan mesajlar | yarım gün |
| **Tek elle kullanım denetimi** | Ayakta, tek elle kullanılabiliyor mu | yarım gün |
| **Çevrimdışı testi yeniden** | Wi-Fi kötüyse ne oluyor | 2 sa |
| **Akıllı varsayılanlar** | Her biri bir dokunuş siler | 2 sa |

### Saat belgesini okumak — en büyük kazanç, en küçük iş

`src/lib/serverTime.ts` sınav ve kod sürelerini doğru ölçmek için sunucu saatini
`clock/{uid}` belgesine yazıp geri okuyor. Bu **her oturum açılışında bir kez**,
sonra etkin kullanımda 30 dakikada bir oluyor. Çağrı `src/store/session.ts`
içinde, **rol ayrımından önce**: barista, yönetici, mağaza telefonu, hepsi.

Yani **her hesabın son etkinlik anı 16 Kasım'dan beri canlıda birikiyor** —
`users.lastSeenAt`'in aksine yalnızca telefonlarda değil, herkeste. Yazma
maliyeti de zaten ödeniyor. Tek engel kural: geliştirici başkasının belgesini
okuyamıyor. Gereken tek satır:

```
match /clock/{uid} {
  allow get, list: if isAdmin();          // eklenecek
  allow get: if signedIn() && request.auth.uid == uid;
```

Sonra rapor "son giriş" sütununu gerçek veriyle doldurur ve her gün çalıştıkça
geçmiş kendiliğinden birikir. Yapılacaklar: kural satırı,
`scripts/yuk-testi/kurallar.mjs`'e iki denetim, `scripts/yedek.mjs` listesine
`clock`, rapora sütun. Giriş *sayısı* vermez, son etkinliği verir.

### Yarım kalan sınavlar

`attempts` içinde `startedAt` var, `submittedAt` yok → sınav başladı, bitmedi.
`timedOut` → süre yetmedi. İkisi de bugün yazılıyor, hiçbir yerde
gösterilmiyor. Terk oranı = teslim edilmeyen / başlayan; hedef %5 altı. Modül
bazında bakılırsa hangi sınavın tasarımı bozuk belli olur.

### Ölü özellik avı — sadeleştirmenin en doğrudan yolu

Sadeleşme eklemekle değil **silmekle** olur. Bir özelliğin kullanılmadığı,
ürettiği kayıt sayısından belli:

| Özellik | Kanıtı | 30 günde 0 ise |
|---|---|---|
| Onay akışı | `proposals` | Bölge müdürü içerik düzenlemiyor |
| Yönetim Kurulu soruları | `boardQuestions` | Kurul ekranı kullanılmıyor |
| Mini sınav (Yeni ürün) | `progress.quizzes` | Akışın yarısı boşa işliyor |
| Görev atama | `assignments` | Müdürler görev açmıyor |
| Bülten | `bulletins` + `progress.bulletins` | Yazılmıyor mu, okunmuyor mu |
| Rozet istisnaları | `baristas.badgeOverrides` | Ayar ekranı gereksiz |
| Talep kategorileri | `requests.category` dağılımı | Kullanılmayan kategori kalkar |
| Acil işareti | `requests.priority` | Herkes acil diyorsa ayrım anlamsız |

Rapor bunu listelerse her ay bir özelliği kaldırma kararı verilebilir.

### Düzeltme oranı

Bir kayıt oluşturulduktan **dakikalar içinde** güncellendiyse ilk seferde doğru
girilememiş demektir: alan yanlış sırada, etiket anlaşılmıyor, varsayılan kötü.
`createdAt` ve `updatedAt`'i olan her şeyde ölçülür (`requests`, `bulletins`,
`lessons`, `modules`, `proposals`). Ölçü: 5 dakika içinde güncellenen kayıt
oranı. Yüksekse o formu sadeleştir.

### Tekrar eden iş

- Aynı modülde üst üste başarısız deneme → içerik anlatmıyor.
- PIN sıfırlama sayısı → PIN'i hatırlamak zor.
- Aynı başlıkla açılan talepler → o iş için hazır bir akış gerekiyor.
- `baristas.accountSeq > 1` → eşleştirme ilk seferde tutmamış.

### Ders–sınav kaybı

`progress.lessons` dersi bitirenleri, `attempts` sınava girenleri gösteriyor.
Arasındaki fark: dersi bitirdi, sınava hiç girmedi. Yığılma varsa sınava giriş
ekranda bulunamıyor (ya da haftalık hak engelliyor).

### İlk kullanım gecikmesi

`baristas.createdAt` → kaydın açılışı, `progress` ilk ders → ilk gerçek
kullanım. Aradaki gün sayısı işe alım ile uygulamayı ilk açma arasındaki
gecikme. Uzunsa kod dağıtımı ya da PIN adımı tıkanıyor.

### Yedekler arası fark

`npm run yedek` haftada bir bütün veritabanını indiriyor; ilki 16.11.2026'da
alındı. İki dosya arasındaki fark = o haftanın etkinliği. Hiç okuma harcamaz,
**geriye dönük geçmiş** verir: `npm run kullanim -- --yedek-farki <eski> <yeni>`.

### Rapor arşivinden gidişat

`kullanim-raporlari/` birikince trend çıkar. Raporun başına makine okunur bir
özet satırı yazılırsa `--trend` ile 4 haftalık grafik çizilir.

### Dokunuş sayımı — ilk 60 saniye denetimi

Sık yapılan her işin kaç dokunuş ve kaç ekran sürdüğünü koddan sayıp tabloya
dök, sonra kısaltmayı dene:

- Barista: telefonu aç → kendini seç → PIN → bir ders bitir.
- Barista: **bir reçeteye bak** (en sık iş, PIN'siz) — bu en kısa yol olmalı.
- Mağaza müdürü: talep aç — kaç alan var, kaçı gerçekten gerekli?
- Bölge müdürü: barista ekle → kod ver.
- Direktör: bülten yayınla.

Çıktı: her iş için "bugün N dokunuş → M olabilir" listesi.

### Yüzey sayımı

Her ekranda kaç düğme, alan, filtre, sekme var? En kalabalık beş ekranı çıkar,
ölü özellik avının sonucuyla birleştir: kullanılmayanı kaldır, az kullanılanı
ikinci plana al. Kaldırma önerileri önce liste olarak sunulur.

### Metin sadeleştirme

Uzun cümle, yönetmelik dili, "işlem başarısız" gibi boş hata mesajı avı. Her
mesaj **ne yapılacağını** söylüyor mu? Çıktı: değiştirilecek metin listesi.

### Tek elle kullanım denetimi

Barista telefonu ayakta, tek elle, bazen eldivenli kullanıyor. Dokunma hedefleri
en az 44×44 pt mi, sık düğmeler baş parmağın erişeceği alt bölgede mi,
onay/iptal yanlışlıkla basılacak kadar yan yana mı.

### Çevrimdışı testi yeniden

`scripts/cevrimdisi-test.mjs` var ama son sürümle koşturulmadı. Mağaza Wi-Fi'si
kötüyse ne olduğunu bilmek "uygulama çalışmıyor" şikâyetlerinin çoğunu açıklar.
Yavaş ağ benzetimi de eklenebilir.

### Akıllı varsayılanlar

En sık seçilen seçenek önceden seçili olsun: talep kategorisi, bülten türü,
sınav modülü, mağaza seçimi. Hangisi olduğu bugünkü veride var.

---

## 2. Küçük bir hazırlık isteyenler

| Ad | Ne verir | Gereken |
|---|---|---|
| **Auth'un son giriş kaydı** | Gerçek giriş zamanı, her hesap | Servis hesabı anahtarı |
| **Hız ölçümü** | Yavaş ekranlar | Tek satır kurulum |
| **Google Analytics** | Giriş saatleri, ekranlar, cihaz | GA4 akışı + KVKK maddesi |

### Auth'un son giriş kaydı

Firebase Auth her hesapta `createdAt`, `lastSignInTime` ve `lastRefreshTime`
tutuyor. Bu veri Firestore'da değil, **kotadan sayılmıyor** ve uygulamada
hiçbir değişiklik gerektirmiyor. `firebase-admin` paketi projede zaten kurulu.

Gereken: Firebase konsolundan bir servis hesabı anahtarı indirip
`serviceAccountKey.json` olarak koymak (`.gitignore`'da zaten var; şifre ya da
sudo gerekmez, anahtarı yalnızca sen indirirsin). Yine yalnızca *son* girişi
verir ama rapor her gün çalışırsa birikir, ve "saat belgesi"nden farklı olarak
giriş dediği şey gerçekten giriştir.

### Hız ölçümü

Firebase Performance Monitoring Spark'ta ücretsiz, tek satır, kişi tutmaz.
Ekran yüklenme süreleri ve ağ istekleri. Yük testi bir kez ölçtü (sınav
başlatma 4,5 sn), gündelik ölçüm ve hedef yok. Bütçe önerisi: ekran açılışı
< 1 sn, sınav başlatma < 2 sn; bütçeyi aşan sürüm yayınlanmaz.

### Google Analytics

Spark'ta ücretsiz, Firestore kotasına dokunmaz; giriş saatleri, oturum süresi,
ekran görüntülemeleri, cihaz. Projede şu an Analytics **hiç yok**, konsoldan
GA4 akışı bağlanması gerekir. Üç pürüz:

1. **KVKK — yurt dışına aktarım.** Veri Google sunucularına gider; aydınlatma
   metnine madde, muhtemelen açık rıza gerekir. En riskli seçenek.
2. **Kişi bazında okunamaz.** Döküm BigQuery ister, o da Blaze. "Ayşe bugün
   girdi mi" sorusunu yanıtlamaz.
3. Uygulama hash yönlendirme kullandığı için her ekranda elle olay yazmak gerekir.

Kişisel veri taşımayan alternatifi Cloudflare Web Analytics (ücretsiz,
çerezsiz); yalnızca "hangi adres kaç kez açıldı" verir, KVKK yükü çok hafif.

---

## 3. Veritabanına yazma ekleyenler

Spark sınırı günde 20.000 yazma. Hepsi uygulamanın davranışını değiştirir,
onay gerektirir.

| Ad | Ne verir | Yazma/gün (bugün → 50 mağaza) | KVKK |
|---|---|---|---|
| **Saat belgesine gün eklemek** | Giriş geçmişi | 0 (aynı yazım) | Hafif |
| **Herkese son görülme** | Son giriş | ~100 → ~400 | Hafif |
| **Mağaza sayacı** ← önerilen | Ekranlar, saatler, reçete — kişisiz | ~48 → ~200 | **En temiz** |
| **Kişi sayacı** | Hepsi, kişiye bağlı | ~380 → ~1.600 | Ayrı madde ister |

### Saat belgesine gün eklemek

`clock/{uid}` yerine `clock/{uid}_{YYYYAAGG}`: yazma sayısı **aynı kalır** (gün
içinde aynı belge güncellenir), ama günler birikir → giriş geçmişi. "Saat
belgesini okumak"ın tek eksiğini kapatır.

**Riski yüksek:** bu yol sınav son teslim süresinin ve kod ömrünün dayandığı
saat ölçümü (zorlu senaryo H1, H2). Kural, `kurallar.mjs`'teki 198 denetim ve
`scripts/zorlu/` senaryoları birlikte gözden geçirilmeli. Sınav sürerken
yapılacak iş değil.

### Herkese son görülme

`users.lastSeenAt` bugün yalnızca mağaza telefonunda yazılıyor; aynı satır
barista ve yönetici oturumuna da eklenebilir. **"Saat belgesini okumak"
yapılırsa buna gerek yok** — aynı şeyi bedava veriyor.

### Mağaza sayacı — önerilen yol

```
kullanim/{storeId}_{YYYYAAGG}
  storeId, day
  acilis: 42
  saatler: { "08": 5, "14": 12, "19": 3 }
  ekran: { recete: 61, bugun: 18, akademi: 9, ekibim: 3 }
  recete: { "r-latte": 14, "r-americano": 7 }
```

Kişi yok, uid yok. "Reçete en çok kullanılan ekran mı", "sabah mı akşam mı
açılıyor", "hangi içeceğe bakılıyor" sorularını yanıtlar. Kayıt bellekte
birikir, günde en çok 4 kez gönderilir (arka plana geçerken, oturum
kapanırken, 30 dakikada bir değişiklik varsa) — ekran gezinmesi yazma üretmez.

Kişi bazında aktiflik zaten `progress` ve `attempts`'ten geliyor; bu ikisi
birleşince kişi sayacının verdiği bilginin neredeyse tamamı, kişisel veri
eklemeden elde edilir. KVKK: kişiye bağlı olmadığı için ayrı rıza maddesi
gerekmez, "mağaza düzeyinde toplu istatistik" olarak anılması yeter.

Bu sayaç aynı zamanda **terk noktalarını** ölçmenin tek yolu. Bugün yalnızca
*başarılar* yazılıyor — ders *tamamlandı*, sınav *geçildi*; yarı yolda
bırakılan her şey görünmez:

```
telefon eşleşti → barista seçildi → PIN girildi → Akademi açıldı →
ders açıldı → ders bitirildi → sınav başladı → sınav teslim edildi
   ↑ sadece buradan sonrası ölçülüyor
```

"Ders açıldı ama bitirilmedi" oranı hangi dersin çok uzun olduğunu, "PIN
girildi ama hiçbir ekran açılmadı" oranı girişten sonra ne yapacağını
bilmediğini söyler.

### Kişi sayacı

Mağaza sayacının kişi bazlı hâli (`kullanim/{uid}_{YYYYAAGG}`): "Ayşe
uygulamayı açtı ama hiçbir şey yapmadı" sorusunu da yanıtlar. Rolü `developer`
olan oturumda kayıt kapalı; okuyan yalnızca geliştirici.

**KVKK:** bu kişiye bağlı kullanım verisidir ve işin yürümesi için değil ölçüm
için tutulur. `KVKK-AYDINLATMA-TASLAK.md` metnine açık madde girmesi gerekir:
hangi veri, ne amaçla, ne kadar süre (öneri **90 gün**). Hukukçu onayı ve ilk
girişte "Okudum" ekranı gelmeden açılmamalı. Saklama süresi için elle temizlik
komutu gerekir (Spark'ta zamanlanmış iş yok). Kişi bazlı veri yalnızca
geliştiricide kalmalı, panelde müdüre ya da direktöre gösterilmemeli.

---

## 4. Veriden değil insandan öğrenmek

- **Uygulama içi tek soruluk anket.** Haftada bir çıkan kart: "Bu hafta
  uygulamayı kullandın mı? Nerede zorlandın?" Yanıt mevcut `feedback`
  koleksiyonuna düşer; yeni koleksiyon ve yeni KVKK maddesi gerekmez.
  Sayaçların söylemediği tek şeyi söyler: **neden** kullanmıyorlar. (2 sa)
- **Mağaza müdürüne haftalık özet kartı.** Bekleyen önerilerde zaten var.
  Çift işe yarar: müdür durumu görür, "bu rakam yanlış" derse geri bildirim
  gelir. (yarım gün)
- **Saha turu ve telefon.** 12 mağaza az. İlk haftalarda en doğru veri:
  telefon nerede duruyor, şarjda mı, barista uygulamaya ne zaman vakit buluyor.

---

## 5. Blaze gerektirenler

Kurul kararı beklenen Blaze geçişi (~2 $/ay) şunları açar: **BigQuery dışa
aktarımı** (SQL'le gerçek analitik), **Cloud Functions** (Auth tetikleyicisiyle
giriş kaydı, zamanlanmış toplama ve 90 günlük temizlik, sunucu tarafı
puanlama), **Cloud Logging** (hangi adres ne zaman açıldı, istemci koduna hiç
dokunmadan). `blaze/README.md` içindeki kod bu geçiş için saklanıyor.

---

## Panelde zaten olanlar

Bunlar listede yok, çünkü duruyorlar:

| Var olan | Nerede |
|---|---|
| Soru bazında hata oranı, hangi şıkkın seçildiği | Soru havuzu → "yanlış" filtresi |
| En çok yanlış yapılan 6 soru | Panel → Genel bakış |
| Modül geçme oranı, ortalama puan | Yönetim Kurulu |
| Mağaza karnesi, dönem karşılaştırması, haftalık akış | Yönetim Kurulu |
| Aksayan işler (acil talep, 7 günü geçen, geride kalan mağaza) | Yönetim Kurulu |
| Talep ilk yanıt süresi, bekleme nedeni, medyan çözüm | Talep istatistikleri |
| Yoğun an ölçümleri | `scripts/yuk-testi/` |

Ortak yönleri: hepsi **işi ve içeriği** ölçüyor. Hiçbiri uygulamanın kendi
kullanılabilirliğini ölçmüyor — bu listenin varlık sebebi o.

---

## Önerilen sıra

1. **Bu hafta (yarım gün).** Saat belgesini okumak + yarım kalan sınavlar +
   ölü özellik avı + düzeltme oranı + tekrar eden iş + ders–sınav kaybı +
   ilk kullanım gecikmesi. Hepsi 1. gruptan: yeni veri yok, KVKK yok. Rapor
   ilk kez "neyi sadeleştir" diyebilir hâle gelir.
2. **Anahtarı indirince (1 saat).** Auth'un son giriş kaydı.
3. **Sonra (yarım gün, kod okuma).** Dokunuş sayımı + yüzey sayımı. Çıktı bir
   kaldırma/kısaltma listesi; hiçbiri onay almadan uygulanmaz.
4. **Üçüncü tur.** Metin sadeleştirme, tek elle kullanım denetimi, çevrimdışı
   testin yeniden koşturulması, hız ölçümü, akıllı varsayılanlar.
5. **KVKK metni onaylanınca.** Mağaza sayacı (terk noktaları buradan çıkar) ve
   uygulama içi anket. Kişi sayacı gerçekten gerekiyorsa en sonda.
6. **Blaze kararından sonra.** BigQuery ve Cloud Functions.

## Döngü

Tek seferlik iş değil. Haftalık raporun sonunda **"bu hafta neyi sadeleştir"**
listesi; ayda bir ya da iki madde uygulanır, biri **silme** olur. Başarı ölçüsü
uygulamanın büyümesi değil **küçülmesi**: ekran sayısı, akıştaki adım sayısı,
formdaki alan sayısı azalıyor mu?
