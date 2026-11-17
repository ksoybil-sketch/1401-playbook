# Ekran denetimi — yüzey, metin, tek elle kullanım

17.11.2026 · Yalnızca okuma yapıldı, hiçbir dosya değiştirilmedi. Bütün öneriler
"şöyle olabilir" düzeyinde; hiçbiri uygulanmadı.

Kapsam: `src/features/` altındaki 38 `.tsx` dosyası (device, barista, staff, board, shared,
academy), `src/ui/` tasarım sistemi, `src/api/` ve `src/lib/` içindeki kullanıcıya görünen
metinler.

**Sayım yöntemi.** Tablolardaki sayılar *kaynakta ayrı yazılmış denetim* sayısıdır: liste
satırı gibi `.map()` içinde çizilen bir düğme 1 sayılır, ekranda 30 kez çıksa bile. Satır
sayısıyla büyüyen ekranlarda "ekranda tipik" sütunu, gerçek veriyle (18 rozet, 7 tema,
~8 reçete kategorisi, 5–10 mağaza) kabaca kaç dokunulabilir öğe çıktığını söyler. Gömülü
bileşenler (PinPad, AssignSheet, TitleCard, BadgeGrid, RequestThread, MediaInput) kullanan
ekrana eklenmiştir.

---

## Yüzey sayımı

### Telefon ekranları (src/features/device, src/features/barista)

| Ekran | Dosya | Düğme / bağlantı | Form alanı | Filtre / sekme | Ekranda tipik |
|---|---|---|---|---|---|
| Mağaza telefonu giriş (Kim çalışıyor?) | `device/DeviceScreens.tsx:84-318` (+ `PinPad.tsx`) | 18 + PinPad 12 tuş | 0 | 0 | **~35** (müdür satırları + barista ızgarası) |
| Ben / Sonuçlarım | `barista/HomePages.tsx:269-325` (+ `shared/Badges.tsx`, `barista/Themes.tsx:68`, `ChangePin.tsx:18`, `shared/Feedback.tsx:102`) | 7 | 0 | 0 | **~35** (18 rozet + 7 tema + sınav geçmişi) |
| Sınav | `barista/ExamPage.tsx:39-421` | 25 (dört aşamaya dağılmış) | 0 | 0 | 7 (tek soruda: X, 4 şık, Önceki, Sonraki) |
| Bugün (ana sayfa) | `barista/HomePages.tsx:58-244` (+ `Themes.tsx:45`) | 8 | 0 | 0 | **~22** (hero, arama, 4 kutu, 3 görev, 4 yol, 6 bölüm) |
| Ekibim | `barista/HomePages.tsx:349-507` (+ `shared/AssignSheet.tsx`) | 13 | 5 | 3 | **~20** (barista satırları + görev satırları + sil düğmeleri) |
| Talepler (mağaza müdürü) | `barista/RequestsPage.tsx:39-193` (+ `shared/Requests.tsx:89`, `staff/MediaInput.tsx`) | 13 | 6 | 6 (4 konu kutusu + 2 öncelik) | ~18 |
| Reçeteler | `barista/RecipesPage.tsx:73-222` | 6 | 1 (arama) | 3 + kategori çipleri | **~20** (8 kategori çipi + 5 "son baktıkların" + satırlar) |
| Ders | `barista/Academy.tsx:232-318` (+ `academy/LessonBlocks.tsx`) | 6 | 0 | 0 | 6 + ders içi "Kendini dene" şıkları |
| Reçete ayrıntısı | `barista/RecipesPage.tsx:228-304` | 5 | 0 | 0 | 5 |
| Modül | `barista/Academy.tsx:138-226` | 4 | 0 | 0 | ~10 (ders satırları) |
| Yönetici girişi | `device/DeviceScreens.tsx:408-477` | 4 | 2 | 0 | 4 |
| Mağaza pasif / Bağlantı yok | `device/DeviceScreens.tsx:554-599` | 2–3 | 0 | 0 | 3 |
| İlk kurulum | `device/DeviceScreens.tsx:483-544` | 2 | 3 | 0 | 2 |
| Telefon bağla | `device/DeviceScreens.tsx:39-78` (+ PinPad) | 2 + 12 tuş | 0 | 0 | 14 |
| Davet kodu / PIN belirle | `device/DeviceScreens.tsx:324-402` (+ PinPad) | 1 + 12 tuş | 0 | 0 | 13 |
| Bülten | `barista/BulletinsPage.tsx:84-114` | 1 (kart başına) | 0 | 0 | ~8 |
| Akademi / Eğitim yolu | `barista/Academy.tsx:23-103` | 1 (satır başına) | 0 | 0 | ~6 |
| PIN değiştir (pencere) | `barista/ChangePin.tsx:72-82` (+ PinPad) | 1 + 12 tuş | 0 | 0 | 13 |
| Reçeteler — PIN'siz başlık | `barista/RecipesPage.tsx:316-333` | 2 | 0 | 0 | 2 |

Telefonda kalabalık dengesi iyi: alt menü beş sekmede tutulmuş
(`barista/BaristaLayout.tsx:47-53`) ve bunun nedeni kodda yazılı. Sorun sekme sayısında
değil, **tek bir ekranda biriken satır sayısında**: "Ben" ve "Kim çalışıyor?" ekranları
tek bir kaydırmada 35 dokunulabilir öğeye çıkıyor.

### Panel ekranları (src/features/staff, src/features/board)

| Ekran | Dosya | Düğme / bağlantı | Form alanı | Filtre / sekme | Not |
|---|---|---|---|---|---|
| Akademi (içerik) | `staff/ContentPages.tsx:87-193` | 16 (6'sı ikon düğmesi) | 0 | 0 | Her yol ve modül satırında 3–4 ikon düğmesi daha |
| Ders editörü | `staff/ContentPages.tsx:627-789` (+ `BlockEditor` 796-956) | 26 | 18 | 0 | Blok başına 3 ikon düğmesi + 9 "blok ekle" düğmesi |
| Bülten yaz / düzenle | `staff/BulletinPages.tsx:180-497` | 19 | 9 | 9 | Panelin en kalabalık tek penceresi |
| Yeni ürün | `staff/NewProductPage.tsx:46-288` | 6 | **15** | 6 | 6 bölümlü tek sayfa form |
| Kahve Operasyonu ekibi (Genel bakış içinde) | `staff/StaffPages.tsx:390-531` | 15 | 5 | 0 | Satır başına rol seçicisi + "Kaldır" |
| Panel kabuğu (menü) | `staff/StaffLayout.tsx:45-287` | 15 | 0 | 0 | 14 menü satırı + "Diğer" penceresi |
| Bekleyen onaylar | `staff/ApprovalsPage.tsx:45-231` | 20 | 1 | 6 | Öneri başına 4 düğme |
| Soru havuzu | `staff/QuestionPoolPage.tsx:28-259` | 15 | 3 | 3 + 5 süzgeç | |
| Barista ayrıntısı | `staff/StaffPages.tsx:1139-1300` (+ `EditBaristaSheet`, `AssignSheet`, `BadgeOverridesSheet`, `BadgeGrid`) | 32 | 12 | 3 | Rozet ızgarası 18 düğme daha |
| Yönetim Kurulu kabuğu | `board/BoardLayout.tsx:26-152` | 12 | 0 | 0 | |
| Baristalar | `staff/StaffPages.tsx:1010-1137` (+ `AddBaristaSheet`) | 12 | 8 | 6 | Modül tablosu yatay kayar |
| Modül editörü | `staff/ContentPages.tsx:432-534` (+ `QuestionSheet`) | 21 | 3 | 6 | |
| Rozet ayarları | `staff/BadgeSettingsPage.tsx:25-252` | 8 | 8 | 8 | |
| Talepler (operasyon) | `staff/RequestsPage.tsx:22-157` (+ `RequestThread`) | 14 | 3 | **10** (4 sayı kartı + 3 sekme + 3 seçim) | |
| Görevler | `staff/StaffPages.tsx:1366-1498` (+ `AssignSheet`) | 13 | 4 | 7 | |
| Dosyadan ders | `staff/ImportLessonSheet.tsx:57-484` | 10 | 7 | 0 | |
| Kurul soruları | `board/BoardQuestions.tsx:58-302` | 16 | 4 | 9 | |
| Kurul genel bakış | `board/BoardPages.tsx:293-508` | 4 | 0 | 3 | 8 sayı kartı |
| Mağaza ayrıntısı | `staff/StaffPages.tsx:777-883` (+ `AddBaristaSheet`, `CodeSheet`) | 19 | 7 | 3 | |
| Yetkiler | `staff/PermissionsPage.tsx:35-196` | 4 | 0 | 2 | Rol × yetki ızgarası onay kutularıyla büyüyor |
| Geri bildirim | `staff/FeedbackPage.tsx:26-155` | 13 | 0 | 6 | |
| Genel bakış | `staff/StaffPages.tsx:220-382` (+ `WaitingStrip`, `MissedSheet`, `PendingCodes`) | 12 | 0 | 3 | 4 sayı kartı + 6 "seni bekleyenler" kartı |
| Talep istatistiği | `staff/RequestStatsPage.tsx:28-179` | 2 | 0 | 3 | 4 sayı kartı |
| Kurul raporları / yazdırma | `board/BoardPages.tsx:802-1013` | 5 | 0 | 0 | |
| E-posta bildirimleri | `staff/NotificationsPage.tsx:21-132` | 2 | 3 | 0 | Kişi × olay onay kutuları |
| Şifre değiştir | `staff/ChangePasswordSheet.tsx:12-77` | 5 | 3 | 0 | |

### En kalabalık on ekran

| # | Ekran | Toplam denetim | Neden |
|---|---|---|---|
| 1 | Barista ayrıntısı (panel) | ~47 + 18 rozet | 4 ana düğme, 4 sayı kartı, 3 pencere, rozet ızgarası, modül listesi, görev listesi, sınav geçmişi aynı sayfada |
| 2 | Ders editörü | ~44 | Blok başına 3 ikon düğmesi, 9 "blok ekle", sağda ayar kartı |
| 3 | Bülten yaz / düzenle | ~37 | Tür, kapsam, kişi listesi, sıralama satırları, tarih, fotoğraf tek pencerede |
| 4 | **Ben / Sonuçlarım (telefon)** | ~35 | 18 rozet + 7 tema + sınav geçmişi + PIN + geri bildirim tek kaydırmada |
| 5 | **Kim çalışıyor? (telefon)** | ~35 | Müdür satırları + barista ızgarası + PinPad + cihaz menüsü |
| 6 | Modül editörü | ~30 | İki sekme, soru listesi, soru penceresi |
| 7 | Mağaza ayrıntısı | ~29 | Barista listesi + telefon listesi + iki pencere + kod penceresi |
| 8 | Bekleyen onaylar | ~27 | Öneri başına 4 düğme + fark penceresi + 4 ayrı editör penceresi |
| 9 | Talepler (operasyon) | ~27 | 10 süzgeç yüzeyi + yazışma penceresindeki 6 durum düğmesi |
| 10 | **Bugün (telefon)** | ~22 | Hero, arama, 4 renkli kutu, görevler, yollar, 6 bölüm kutusu — çoğu aynı yere giden ikinci yol |

Telefon tarafında en ağır sorun **4, 5 ve 10**: "Bugün" ekranındaki 6 kutuluk "Tüm
bölümler" ızgarası (`barista/HomePages.tsx:223-241`) alt menüdeki beş sekmenin ve
yukarıdaki dört renkli kutunun üçüncü kopyası; aynı hedefe üç ayrı yol var.

---

## Metin sadeleştirme

Genel durum iyi: metinler Türkçe, "siz" yerine "sen" dili tutarlı, yönetmelik dili
yalnızca kod yorumlarında (kitapçık alıntısı, `barista/RequestsPage.tsx:18-19`) geçiyor,
ekranda değil. Aşağıdakiler kalan pürüzler.

### A. Ne yapılacağını söylemeyen hata mesajları (en önemli grup)

Bunların hepsi `errorText()` üzerinden **her ekranda** çıkabiliyor — barista telefonunda da.

| Dosya:satır | Mevcut metin | Önerilen |
|---|---|---|
| `src/api/backend.ts:534` | "Beklenmeyen bir hata oluştu. Tekrar dene." | "Kaydedilemedi. Birkaç saniye sonra yeniden dene; sürerse Ben → 'Bir sorun mu var?' ile bildir." |
| `src/api/backend.ts:535` | "Beklenmeyen bir hata oluştu." | Aynı öneri; tek başına hiçbir yol göstermiyor. |
| `src/api/backend.ts:532` | "Kayıt bulunamadı." | "Bu kayıt silinmiş görünüyor. Sayfayı yenile; listede yoksa yeniden oluştur." |
| `src/api/backend.ts:533` | "Kayıt kaydedilemedi: içerik geçersiz ya da çok büyük." | "Kaydedilemedi: metin ya da fotoğraf çok büyük. Fotoğrafı çıkarıp ya da metni kısaltıp yeniden dene." |
| `src/api/backend.ts:531` | "İşlem başka bir değişiklikle çakıştı. Tekrar dene." | "Aynı kaydı başka biri de değiştirdi. Sayfayı yenile, son hâline bakıp yeniden kaydet." |
| `src/api/backend.ts:527` | "Bu işlem için yetkin yok." | "Bunu yapma yetkin yok. Gerekiyorsa Kahve Operasyon Direktörü'nden Yetkiler ekranından açmasını iste." |
| `src/api/backend.ts:529` | "Bu kayıt zaten var. Sayfayı yenileyip tekrar bak." | Yeterince yol gösteriyor; "Aynı ad zaten kullanılıyor; başka bir ad yaz." daha somut olabilir. |
| `src/api/backend.ts:530` | "Günlük kullanım sınırına ulaşıldı. Biraz sonra tekrar dene." | "Günlük kullanım sınırı doldu. Yarın sabah yeniden açılır; acil bir iş varsa Kahve Operasyonu'na haber ver." |
| `src/api/backend.ts:524` | "E-posta ile giriş Firebase konsolunda henüz açılmamış." | Kullanıcıya Firebase anlatılmamalı: "Giriş yöntemi henüz açılmamış. Uygulamayı kuran kişiye haber ver." |
| `src/api/backend.ts:108` | "Kod üretilemedi, tekrar dene." | "Kod oluşturulamadı. Bağlantını kontrol edip 'Telefon bağla'ya yeniden dokun." |
| `src/api/exam.ts:426` | "Sınav başlatılamadı. Tekrar dene." | "Sınav başlatılamadı. Bağlantını kontrol edip 'Başla'ya yeniden dokun; sürerse müdürüne söyle." |
| `src/api/exam.ts:560` | "Sınav kaydı bulunamadı." | "Bu sınav kaydı yok. Modüle dönüp sınavı yeniden başlat." |
| `src/features/barista/Academy.tsx:267` | "İlerleme kaydedilemedi." | "Ders tamamlandı işaretlenemedi. Bağlantı gelince dersi yeniden 'Tamamladım' ile bitir." |
| `src/features/barista/Themes.tsx:84` | "Tema kaydedilemedi." | "Tema değiştirilemedi. Bağlantını kontrol edip temaya yeniden dokun." |
| `src/features/staff/NotificationsPage.tsx:57` | "Kaydedilemedi." | "Kaydedilemedi. Sayfayı yenileyip işareti yeniden koy." |
| `src/features/staff/FeedbackPage.tsx:49` | "Güncellenemedi." | "Durum değiştirilemedi. Sayfayı yenileyip yeniden dene." |
| `src/features/staff/ContentPages.tsx:547` | "Soru metni boş." | "Soruyu yaz." (diğer doğrulamalar emir kipinde: "Başlık yaz.", "Mağaza seç.") |
| `src/lib/errorLog.ts:87` | "Bilinmeyen hata" | Yalnızca kayda yazılıyor, ekrana çıkmıyor — dokunulmasına gerek yok. |

Tek kelimelik durum etiketleri (`Geçersiz`, `Reddedildi`, `Bulunamadı`) genelde yanında
bir açıklamayla çıkıyor — ör. `taskValidity.ts:22-26`'daki üç açıklama ve
`staff/StaffPages.tsx:452`'deki "Geçersiz: …" satırı. Üç yerde yalnız kalıyorlar:

- `barista/Academy.tsx:70` ve `:152` — başlık "Bulunamadı", sayfada başka hiçbir şey yok.
  Öneri: "Bu eğitim bulunamadı" + "Akademi'ye dön" düğmesi (ExamPage:155-163'te zaten
  böyle yapılmış, örnek orada).
- `barista/Academy.tsx:241` — "Ders bulunamadı", dönüş düğmesi yok (yalnız `back` oku var).
- `barista/RecipesPage.tsx:244` — "Reçete bulunamadı". Öneri: "Bu reçete kaldırılmış.
  Reçeteler listesine dön."

### B. 15 kelimeden uzun cümleler

Çoğu uzunluğunu hak ediyor (çevrimdışı durumu, sınav hakkı, PIN sıfırlama gibi gerçekten
anlatılması gereken şeyler). Kısaltılabilecek olanlar:

| Dosya:satır | Uzunluk | Mevcut | Önerilen |
|---|---|---|---|
| `src/lib/unsaved.ts:119` | 20 kelime | "Başka bir sekmede kaydedilmemiş değişiklik var. Çıkış yaparsan oturum bütün sekmelerde kapanır ve o değişiklikler silinir. Yine de çıkılsın mı?" | "Başka bir sekmede kaydedilmemiş değişiklik var; çıkış onu da siler. Çıkılsın mı?" |
| `src/lib/readOnly.ts:7` | 15 kelime, iki kez "bağlantı gelince" | "Çevrimdışı moddasın: bu işlem bağlantı gelince açılır. Bağlantı gelince uygulama seni kendiliğinden tam girişe geçirir." | "Bağlantı yok: bu işlem bağlantı gelince kendiliğinden açılır." |
| `src/features/staff/BulletinPages.tsx:260` | 24 kelime | "Bu bülten sen düzenlerken başka biri tarafından kaydedildi. Kaydedersen onun değişiklikleri gider.\n\nYine de kaydedilsin mi? (Vazgeçersen pencereyi kapatıp bülteni yeniden açarak son hâlini görebilirsin.)" | "Bu bülteni sen yazarken başkası da kaydetti. Kaydedersen onun yazdıkları gider. Kaydedilsin mi?" — parantezli kısım pencerede küçük not olarak kalabilir. |
| `src/features/staff/ContentPages.tsx:699` | 23 kelime | Aynı kalıp, ders için | Aynı öneri; iki metin tek yardımcıdan gelebilir. |
| `src/api/backend.ts:358` | 20 kelime | "Davet kodu geçersiz, süresi dolmuş ya da başka bir mağaza için. Kodu kontrol et ya da yöneticinden yeni kod iste." | "Kod geçersiz ya da süresi dolmuş. Kodu yeniden gir; olmazsa müdüründen yeni kod iste." |
| `src/api/backend.ts:498` | 18 kelime | "Bu e-posta ile zaten bir hesap var. Bir hesabın tek rolü olur: kişi ekipteyse rolünü Ekip ekranından değiştir." | "Bu e-posta zaten kayıtlı. Rolünü Genel bakış → Kahve Operasyonu ekibi'nden değiştir." |
| `src/api/changes.ts:103` | 17 kelime | "Bu öneride uygulamanın tanımadığı bir değişiklik var (içerik dışı bir kayda yazım). Güvenlik nedeniyle yayınlanamaz; öneriyi reddet." | "Bu öneri yayınlanamaz: içerik dışına yazım içeriyor. Reddet ve geliştiriciye bildir." |
| `src/features/board/BoardPages.tsx:715` | 19 kelime | "Operasyonda şu an devam edenler. Burada hiçbir şey değiştirilmez; bir konuyu merak ederseniz yanındaki “Sor” ile Kahve Operasyonu'na sorabilirsiniz." | "Operasyonda süren işler. Değiştirilemez; merak ettiğinizi “Sor” ile sorabilirsiniz." |
| `src/features/staff/ApprovalsPage.tsx:105` | 19 kelime | "Bölge müdürü ve ekibin yaptığı içerik ve bülten değişiklikleri. Olduğu gibi yayınla, düzeltip yayınla ya da notla geri gönder." | "Ekibin içerik ve bülten değişiklikleri. Yayınla, düzeltip yayınla ya da notla geri gönder." |
| `src/features/staff/RequestsPage.tsx:86` | 15 kelime | "Mağaza ve vardiya müdürlerinin arıza, servis, malzeme ve personel talepleri. Sözlü talep geçersiz: kayıt burada." | "Mağazaların arıza, servis, malzeme ve personel talepleri. Sözlü talep sayılmaz." |
| `src/features/shared/Badges.tsx:81-85` | 48 kelime, tek paragraf | Rozet kuralları açıklaması | Üç kısa cümleye bölünebilir; barista telefonunda tek blok olarak okunuyor. |
| `src/features/staff/ContentPages.tsx:276-282` | 66 kelime, dört vurgulu parça | "Müfredatı güncelle" açıklaması | Madde listesine dönebilir: "Korunur: … / Üzerine yazılır: … / Silinir: …" |

### C. Gereksiz İngilizce / teknik terim

| Dosya:satır | Terim | Not |
|---|---|---|
| `staff/ContentPages.tsx:996` | "dosyalar **OCR** ve kurallarla okunuyor" | Yalnızca geliştirici görüyor (`manageAi`), ama "yazı tanıma" denebilir. |
| `staff/ContentPages.tsx:987, 993` | "Anthropic **API anahtarı**", "**Console**'da" | Aynı ekran, aynı rol. "Anthropic hesabındaki yönetim sayfasında" gibi. |
| `staff/ContentPages.tsx:935` | "hazır çizim (**SVG kaynağı**)" | Direktör de görüyor. "Hazır çizim kodu" yeterli olabilir. |
| `staff/ContentPages.tsx:762, 804, 339` | "**blok**" (ders yapı taşı) | Panelde yerleşmiş bir terim; "bölüm" daha Türkçe ama alışkanlığı bozar — dokunmamak da savunulabilir. |
| `staff/ContentPages.tsx:495` | "Excel · **CSV** · PDF" | Dosya uzantıları; kalabilir. |
| `board/BoardPages.tsx:882` | "Excel tabloları (**CSV**)" | Kurul üyesi için "Excel'de açılan tablolar" yeterli olabilir. |
| `shared/Feedback.tsx:31` | cihaz bilgisi `"telefon · 390×844"` | Kayda yazılıyor, ekranda görünmüyor — sorun değil. |

Baristanın gördüğü hiçbir metinde gereksiz İngilizce bulunmadı; tek istisna rozet
adları (Rookie / Specialist / Senior / Pro, `lib/badges.ts`) ki bunlar şirketin
fiziksel önlük rozetlerinin adı — bilinçli.

---

## Tek elle kullanım

Yalnızca `src/features/device` ve `src/features/barista` incelendi. Ölçüler
`src/ui/tokens.ts`'teki sınıflardan hesaplandı (Tailwind v4: `h-11` = 44 px,
`h-9` = 36 px, `h-8` = 32 px, `w-7` = 28 px).

### Tasarım sistemi zaten ne yapıyor

`src/ui/tokens.ts:82-99` dokunma payını düşünmüş: `touchY` (`:82`) dokunmatik ekranda
düğmenin üstüne ve altına görünmez 6 px ekliyor, `btnSm` (`:86`, 32 px) ve `chip`
(`:116-117`, 32 px) bu payla 44 px'e çıkıyor; `btnMd` (`:85`, 36 px) 4 px payla 44;
`btnLg` (`:84`) zaten 44; `iconBtn` (`:89`) telefonda 40 px + 2 px pay = 44; `listRow`
(`:45`) `min-h-13` (52 px). Yani **temel 44 pt kuralı sistemde var.**
Bulgular bu sistemin dışına çıkan yerlerde.

### 1. 44×44'ün altında kalan dokunma hedefleri

| Dosya:satır | Öğe | Ölçü | Durum |
|---|---|---|---|
| `barista/RecipesPage.tsx:145-151` | "Aramayı temizle" (×) | **28×28 px**, ikon 14, dokunma payı yok | Serviste en çok kullanılan ekranda, arama kutusunun içinde. Eldivenli parmak yanına, kutunun kendisine basıyor. Öneri: `w-11 h-11` (44) ya da `iconBtn`'e benzer görünmez pay; ikon 14'te kalabilir. |
| `staff/MediaInput.tsx:49-55` | "Görseli kaldır" (×) | **28×28 px**, ikon 14 | Telefonda iki yerde çıkıyor: Yeni talep → Fotoğraf ve Geri bildirim → Ekran görüntüsü. Fotoğrafın köşesinde duruyor; yanlış basınca çekilen fotoğraf gider. Öneri: 44×44 ve "Fotoğrafı kaldır" diye bir metin düğmesi fotoğrafın altında. |
| `barista/RecipesPage.tsx:188` | "Temizle" (Son baktıkların) | `px-2 py-1` + 12 px metin ≈ **26 px yüksek** | Hemen altındaki çip şeridinin 6 px üstünde. Öneri: `min-h-11` + biraz daha yatay dolgu. |
| `shared/Feedback.tsx:135` | "Bu soruda hata var" | Dolgu yok, 12 px metin ≈ **16 px yüksek** | Sınav sonucundaki her yanlış kartının altında. Pratikte basılamıyor. Öneri: `py-2.5 -my-2.5` ya da `btnSm`. |
| `shared/Feedback.tsx:124` | "Bu reçetede bir yanlış mı var?" | `py-2` ≈ **32 px** | Reçete sayfasının altında. Öneri: `py-3` (44). |
| `ui/tokens.ts:110-111` → `barista/RequestsPage.tsx:186-187` | Öncelik seçimi: "Normal" / "Acil — misafiri etkiliyor" | `segmentItem` = **h-9 (36 px)**, görünmez pay **yok** | `segmentItem` tasarım sistemindeki tek 44'ün altı kalan sınıf; `btnSm`/`chip` gibi `touchY` almamış. Telefonda "Acil" seçimi 36 px. Öneri: `pointer-coarse` payı buraya da eklenebilir (tek satır, bütün segmentleri düzeltir). |
| `shared/AssignSheet.tsx:156-161` | "Modül sınavı" / "Tek ders" | Aynı `segmentItem`, 36 px | Ekibim → Görev penceresinde. |
| `ui/tokens.ts:116-117` → `barista/RecipesPage.tsx:200-208` | Kategori çipleri | 32 px görünür, payla 44 | Hedef yeterli ama **görsel** olarak 32 px; eldivenli kullanıcı nereye bastığını göremiyor. Öneri: reçete ekranındaki çipler `h-10`/`h-11` olabilir (zaten "Son baktıkların" çipleri `h-9` ile büyütülmüş, 192. satır). |
| `barista/HomePages.tsx:459-462` | "Görevi sil" (Ekibim) | `iconBtn` 40+2 = 44, ikon 14 | Ölçü kuralı sağlıyor; sorun yeri (aşağıda, 3. başlık). |

### 2. Baş parmak erişimi: en çok kullanılan şey en yukarıda

- **Reçete arama.** Ayakta, tek elle, servis sırasında en çok yapılan iş. Arama kutusu
  `barista/RecipesPage.tsx:132-143`'te sayfanın **en üstünde**; ana sayfadaki kısayol da
  üstte (`barista/HomePages.tsx:137-140`, hero kartının altında). 6.1" bir telefonda
  her ikisi de baş parmağın rahat erişemediği bölgede; barista ya telefonu kavrayışını
  değiştiriyor ya iki el kullanıyor. Öneri: Reçeteler ekranında arama kutusu altta
  sabit bir şerit olabilir (sınav ve ders ekranlarında aynı kalıp zaten var:
  `ExamPage.tsx:395`, `Academy.tsx:296`), ya da ana sayfadaki arama kutusu alt menünün
  hemen üstünde duran bir şeride taşınabilir.
- **İyi olan taraf.** Ders ve sınavda ilerletme düğmeleri alt sabit şeritte
  (`barista/Academy.tsx:296-315`, `barista/ExamPage.tsx:395-418`); alt menü sabit
  (`BaristaLayout.tsx:93`); PinPad tuşları 74×74 ve ekranın alt yarısında
  (`device/PinPad.tsx:90`). Bunlar doğru.
- **Üstte duran ve sık basılan diğerleri:** "Yeni" talep (`barista/RequestsPage.tsx:54`),
  "Görev" ata (`barista/HomePages.tsx:401`), reçete/ders/sınav ekranlarındaki sol üst
  Geri ve Kapat düğmeleri (`RecipesPage.tsx:254`, `Academy.tsx:278`, `ExamPage.tsx:212`,
  `:354`). Sol üst köşe sağ elle tutan biri için en zor nokta. Android'de donanım geri
  tuşu bu işi görüyor (`lib/backButton.ts` kullanımları), ama reçetede geri dönmek için
  tek yol o köşe. Öneri: reçete ayrıntısında alt şeritte "Reçetelere dön" olabilir.
- **"Ben" ekranı 35 öğeyle tek kaydırma.** Rozetler (18), temalar (7), sınav geçmişi,
  PIN, geri bildirim art arda; en altta duran "Bir sorun mu var?" satırına ulaşmak için
  uzun kaydırma gerekiyor (`barista/HomePages.tsx:300-322`).

### 3. Onay ile iptalin yan yana olması

- `src/ui/kit.tsx:262` — bütün alt pencerelerin alt şeridi `flex flex-wrap gap-2
  justify-end`: **onay ve vazgeç düğmeleri arasında 8 px** var. Telefonda bu
  Ekibim → Görev ata penceresinde geçerli: "Vazgeç" ve "Ata" 8 px arayla, ikisi de 36 px
  yüksek (`shared/AssignSheet.tsx:149-154`). Öneri: telefonda alt şerit iki düğmeyi alt
  alta (birincil üstte, tam genişlik) koyabilir ya da aradaki boşluk 16 px'e çıkabilir.
- `device/DeviceScreens.tsx:265-274` — Cihaz menüsünde "Kahve Operasyonu girişi"
  (ikincil, tam genişlik, 44 px) ile **"Mağaza bağlantısını kaldır"** (yıkıcı, tam
  genişlik, 44 px) arasında yalnızca pencerenin `gap-4`'ü (16 px) var. Yanlış basmanın
  bedeli büyük. Bu akış zaten müdür PIN'i + ayrıca `confirm()` ile korunuyor
  (`:277`, `:301`), yani sonuç felaket değil; ama düğmenin yeri yine de riskli.
  Öneri: yıkıcı düğme pencerenin en altına, bir ayırıcı çizginin altına alınabilir.
- `barista/ExamPage.tsx:397-416` — alt şeritte "Önceki soru" (ikon, ikincil) ile
  "Sonraki" / **"Sınavı bitir"** 8 px arayla. Daha önemlisi: son soruda birincil düğme
  "Sonraki" ile **tam aynı yerde** "Sınavı bitir"e dönüşüyor. Hızlı hızlı "Sonraki"ye
  basan barista sınavı farkında olmadan teslim edebilir — boş soru yoksa hiçbir onay
  sorulmuyor (onay yalnızca `blank > 0` iken, `:405`). Öneri: son soruda bitirme düğmesi
  her hâlde onay sorabilir ("Sınav teslim edilsin mi? Sonra düzeltilemez"), ya da düğme
  rengi/yeri değişebilir.

### 4. Kaydırırken yanlışlıkla basılabilecekler

- **Tema seçimi onaysız.** `barista/Themes.tsx:104-131` — "Ben" ekranındaki tema
  ızgarası iki sütun, her kart büyük bir düğme ve dokunulduğu an tema sunucuya yazılıyor
  (`:78-88`), onay da geri alma da yok. Uzun "Ben" sayfasını kaydırırken parmağın
  takılması uygulamanın bütün renklerini değiştiriyor. Öneri: seçim onayı değil ama
  seçildikten sonra "Espresso'ya dön" gibi tek dokunuşluk bir geri alma, ya da kartın
  içinde küçük bir "Kullan" düğmesi.
- **Görev silme listenin içinde.** `barista/HomePages.tsx:459-462` — Ekibim → Görevler
  listesinde satır sonundaki çöp kutusu; liste 30 satıra kadar uzuyor
  (`:441`, `useShowMore(30)`). `confirm()` koruması var (`:460`), yani kayıp yok.
  Öneri: silme satırın içinde değil, göreve dokununca açılan bir pencerede olabilir.
- **Sınav şıkları tam genişlikte.** `barista/ExamPage.tsx:376-391` — uzun soruda sayfa
  kayarken şıkka basmak kolay. Seçim değiştirilebildiği için zarar sınırlı; ama seçimin
  anında yazıldığını (`choose` → `saveAnswers`) düşünürsek yine not edilmeli.
- **Yatay çip şeridi dikey kaydırmanın içinde.** `barista/RecipesPage.tsx:190-209` —
  kategori ve "son baktıkların" şeritleri yatay kayıyor, sayfa dikey. Kodda şeridin
  dokunma payının kesilmemesi için `py-1.5 -my-1.5` eklenmiş (199. satırdaki yorum),
  yani sorun fark edilmiş; kalan risk dikey kaydırma hareketinin yatay şeritte çip
  seçimine dönüşmesi.
- **Bülten kartı başlığı.** `barista/BulletinsPage.tsx:34` — kartın tamamı aç/kapa
  düğmesi; yanlış basmak yalnızca kartı açıyor, zararsız.

### 5. Küçük notlar

- `barista/BaristaLayout.tsx:72` — "Çıkış" düğmesi sağ üstte, `btnSm` (32 px + pay).
  Ortak telefonda bilinçli olarak zor erişilen yerde; ders ve sınavda gizleniyor
  (`:71`). Doğru karar.
- `barista/HomePages.tsx:176` — "Tümü" bağlantısına `min-h-11 -my-3` verilmiş; küçük
  metin bağlantılarının nasıl düzeltileceğinin örneği zaten burada. Yukarıdaki
  `Feedback.tsx:135` ve `RecipesPage.tsx:188` aynı kalıpla düzelebilir.
- `device/PinPad.tsx:67` — PIN noktaları 14×14 px ama bunlar gösterge, dokunma hedefi
  değil; sorun yok.

---

## En çok kazanç getirecek on değişiklik

Sırayı "barista telefonunda, ayakta, tek elle" ölçütüne göre kurdum.

1. **`segmentItem`'a dokunma payı eklemek** — `src/ui/tokens.ts:110-111`. Tek satırlık
   değişiklik (`btnSm`'deki `touchY` kalıbı), telefondaki bütün segment seçimlerini
   (talep önceliği, görev türü) 36 px'ten 44 px'e çıkarır.
2. **Reçete aramasını baş parmak bölgesine almak** — `barista/RecipesPage.tsx:132-143`.
   Serviste en çok kullanılan denetim şu an ekranın en tepesinde; alt sabit şerit kalıbı
   uygulamada zaten var (`ExamPage.tsx:395`).
3. **"Aramayı temizle" ve "Görseli kaldır" düğmelerini 44×44 yapmak** —
   `barista/RecipesPage.tsx:145-151`, `staff/MediaInput.tsx:49-55`. İkisi de 28×28,
   ikisi de yanlış basıldığında iş kaybettiriyor.
4. **`errorText()`'teki altı belirsiz mesaja "şimdi ne yap" eklemek** —
   `src/api/backend.ts:527-535`. Tek dosyada altı satır; uygulamanın her yerindeki
   çıkmaz sokakları kapatır.
5. **Son soruda "Sınavı bitir"i ayırmak** — `barista/ExamPage.tsx:400-411`. Şu an
   "Sonraki" ile aynı yerde ve bütün sorular doluysa onay sormuyor; hızlı dokunan
   barista sınavı erken teslim edebilir.
6. **Tema seçimine geri alma** — `barista/Themes.tsx:104-131`. Kaydırırken yanlış
   basılan tema kalıcı ve onaysız.
7. **"Bu soruda hata var" / "Bu reçetede bir yanlış mı var?" bağlantılarını
   dokunulabilir yapmak** — `shared/Feedback.tsx:124`, `:135`. 16 ve 32 px; geri bildirim
   yolunun en ucundaki iki düğme pratikte basılamıyor.
8. **Pencere alt şeridinde onay/vazgeç arasını açmak** — `src/ui/kit.tsx:262`. 8 px →
   16 px, ya da telefonda alt alta. Bütün pencereleri birden düzeltir.
9. **"Ben" ekranını bölmek** — `barista/HomePages.tsx:300-322`. 35 dokunulabilir öğe tek
   kaydırmada; rozetler ve temalar kendi alt sayfalarına ya da katlanır bölümlere
   alınabilir.
10. **"Bugün" ekranındaki üçüncü gezinme kopyasını kaldırmak** —
    `barista/HomePages.tsx:223-241`. Altı kutuluk "Tüm bölümler" ızgarası, alt menü ve
    renkli kutularla aynı yerlere gidiyor; kaldırılması ekranı kısaltır ve kaydırma
    sırasındaki yanlış dokunma yüzeyini azaltır.

Bunların hiçbiri uygulanmadı; hangisiyle başlanacağına karar verince tek tek
yapılabilir.
