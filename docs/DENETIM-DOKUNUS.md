# Dokunuş sayımı denetimi

**Hiçbir şey uygulanmadı.** Bu dosya yalnızca sayım ve öneri; kullanıcı onaylamadan
koda, akışa ya da uygulamanın davranışına dokunulmayacak. Uygulama çalıştırılmadı,
sayım doğrudan bileşenlerden okundu (her satırda `dosya:satır`).

## Sayım kuralı

- **Dokunuş** = parmağın bir kez bir öğeye basması. Otomatik yönlendirmeler (PIN tamamlanınca
  giriş, ders bitince sonraki ders) 0 sayılır.
- **Yazma** dokunuş sayılmaz, ayrı belirtilir — ama alana ilk dokunuş sayılır.
- **Kaydırma** sayılmaz; gerekli olduğu yerde not düşüldü.
- `<select>` = 2 dokunuş (açmak + seçmek). Yerel seçici telefonda ayrıca onay isteyebilir.
- **Ekran geçişi** = adres değişimi ya da tam ekran görünüm değişimi. Alt pencere (`Sheet`)
  ayrı sayıldı: "+1 pencere".
- Sınav uzunluğu için varsayılan **10 soru** alındı (`ContentPages.tsx:390`; müfredatta
  modüller 10–15 arası, `scripts/content.mjs:259,640`).

---

## 1. Mağaza telefonu: aç → kendini seç → PIN → Akademi'de ders aç → dersi bitir

| # | Adım | Ekran | Yer | Dokunuş |
|---|---|---|---|---|
| 1 | Uygulama açılır, "Kim çalışıyor?" | StoreHome | `src/features/device/DeviceScreens.tsx:171` | 0 |
| 2 | Kendi adına / avatarına dokun | StoreHome | `DeviceScreens.tsx:225` (müdür satırı), `:242` (barista ızgarası) | 1 |
| 3 | 4 haneli PIN | PIN görünümü | `PinPad.tsx:76-82`, otomatik gönderim `PinPad.tsx:37-41` | 4 |
| 4 | "Bugün" açılır | HomePage | `HomePages.tsx:58` | 0 |
| 5 | Akademi sekmesi | Akademi | `BaristaLayout.tsx:50` | 1 |
| 6 | Eğitim yolu seç | TracksPage | `Academy.tsx:40` | 1 |
| 7 | Modül seç | TrackPage | `Academy.tsx:97` | 1 |
| 8 | Ders seç | ModulePage | `Academy.tsx:179` | 1 |
| 9 | "Tamamladım, sonraki ders" | LessonPage | `Academy.tsx:310` | 1 |

**Toplam: 10 dokunuş · 7 ekran.**

- **Gereksiz görünen:** Akademi → yol → modül → ders zinciri üç ara ekran. Bugün sayfasındaki
  **"Kaldığın ders"** kutusu (`HomePages.tsx:154`, hedefi `nextLesson`, `lib/progress.ts:85`) bu
  üçünü atlıyor: **7 dokunuş · 4 ekran**. Yani kısa yol kodda var ama Akademi sekmesi onu
  kullanmıyor; barista sekmeye alışmışsa her gün 3 fazla dokunuş yapıyor.
- Bugün sayfasındaki "Eğitim yolların" kartları (`HomePages.tsx:211`) doğrudan yola gidiyor —
  TracksPage'i atlar (−1).
- **İnebileceği yer: 7 dokunuş.** Tek yayında yol varsa Akademi sekmesi doğrudan o yolun
  modüllerine açılabilir (−1); "Kaldığın ders" Akademi'nin de en üstüne konabilir.
- ⚠️ **PIN adımı (4 dokunuş) kısaltılamaz:** telefon ortak, oturum başkası adına sınav
  çözülmesini engelliyor (`BaristaLayout.tsx:15-16`, 10 dk hareketsizlik çıkışı). "Son giren
  kişiyi hatırla" türü bir kısayol bu korumayı delerdi.

---

## 2. Barista: bir reçeteye bak (PIN'siz) — **en sık yapılan iş**

| # | Adım | Ekran | Yer | Dokunuş |
|---|---|---|---|---|
| 1 | Giriş ekranındaki "Reçeteler" kutusu | StoreHome | `DeviceScreens.tsx:184` → `/receteler?focus=1` | 1 |
| 2 | Listeden içeceğe dokun | RecipesPage | `RecipesPage.tsx:36` (satır), `:192` ("Son baktıkların" çipi) | 1 |

**Toplam: 2 dokunuş · 2 ekran.** (Giriş yapmış barista için de aynı: sekme 1 + satır 1,
`BaristaLayout.tsx:49`.)

- **Zaten en kısa yol** ve PIN'siz: mağaza oturumu reçete rotalarını PIN'siz açıyor
  (`App.tsx:124-128`, `RecipesPage.tsx:316` StoreRecipesLayout). Bu doğru kurulmuş.
- **Pürüz:** `?focus=1` arama kutusuna odaklanıyor (`RecipesPage.tsx:92-99`), yani klavye
  açılıyor. Klavye "Son baktıkların" şeridini ve kategori çiplerini kapatıyor; aramak
  istemeyen barista önce klavyeyi kapatmak için bir dokunuş harcıyor → gerçekte **3 dokunuş**.
- **İnebileceği yer: 1 dokunuş.** Giriş ekranına "Son baktıkların" ilk üç çipi konabilir
  (veri zaten telefonda, `RecipesPage.tsx:65-71`); ya da `focus=1` yalnızca arama simgesine
  dokunulduğunda verilir, kutunun kendisine dokunulduğunda liste açık gelir.

---

## 3. Barista: modül sınavına gir → teslim et

| # | Adım | Ekran | Yer | Dokunuş |
|---|---|---|---|---|
| 1 | Akademi sekmesi | Akademi | `BaristaLayout.tsx:50` | 1 |
| 2 | Yol seç | TracksPage | `Academy.tsx:40` | 1 |
| 3 | Modül seç | TrackPage | `Academy.tsx:97` | 1 |
| 4 | "Sınava başla" | ModulePage | `Academy.tsx:208-214` | 1 |
| 5 | Giriş ekranı: "Başla" | ExamPage intro | `ExamPage.tsx:244` | 1 |
| 6 | 10 soru × şık | ExamPage run | `ExamPage.tsx:381` | 10 |
| 7 | 9 × "Sonraki" | ExamPage run | `ExamPage.tsx:413` | 9 |
| 8 | "Sınavı bitir" | ExamPage run | `ExamPage.tsx:400-411` | 1 |
| 9 | Sonuç: "Modüle dön" | ExamPage result | `ExamPage.tsx:323` | 1 |

**Toplam: 26 dokunuş · 6 ekran** (10 soruda; 15 soruda **36 dokunuş**).
Bugün sayfasındaki "Sınava hazırsın" kutusundan girilirse (`HomePages.tsx:145`) 1–4 adımları
tek dokunuşa iniyor: **23 dokunuş**.

- **Gereksiz görünen:** sınav başına iki kez "başla" (modül sayfasında + giriş ekranında).
  ⚠️ **Ama ikinci adımın gerekçesi var:** o ekran soru sayısı, süre ve geçme notunu gösteriyor
  ve "Başla" haftalık deneme hakkını harcıyor (`api/exam.ts:348`, `EXAMS_PER_WEEK`). Yanlışlıkla
  bir hakkın yanması geri alınamaz; bu onay adımını kaldırmayı önermiyorum.
- **En büyük yük, soru başına ikinci dokunuş.** Şık seçince otomatik sonraki soruya geçilirse
  10 soruluk sınavda **−9**, 15 soruluk sınavda **−14** dokunuş.
  ⚠️ Bu bir **davranış değişikliği**: cevabı değiştirmek isteyen barista "Önceki" ile dönmek
  zorunda kalır, yanlış dokunuşun maliyeti artar. Uygulanmadan önce sorulması gereken bir şey.
- **İnebileceği yer: 10 soruda 14 dokunuş** (Bugün kısayolu + otomatik ilerleme).

---

## 4. Barista: bülteni oku

| # | Adım | Ekran | Yer | Dokunuş |
|---|---|---|---|---|
| 1 | Bülten sekmesi (rozette okunmamış sayısı) | BulletinsPage | `BaristaLayout.tsx:51` | 1 |
| 2 | Okunmamış bülten **kendiliğinden açık** gelir ve okundu işaretlenir | — | `BulletinsPage.tsx:24` (`useState(!read)`), `:28-30` | 0 |

**Toplam: 1 dokunuş · 1 ekran.** Bugün sayfasındaki bülten kutusundan da 1 dokunuş
(`HomePages.tsx:158`).

- **Zaten en kısa hali.** Okunmuş bülteni yeniden açmak 1 ek dokunuş (`BulletinsPage.tsx:34`) —
  doğru, çünkü kapalı liste daha okunur.
- Tek not: birden çok okunmamış bülten varsa hepsi aynı anda açık geliyor, sayfa uzuyor
  (kaydırma artıyor, dokunuş artmıyor).

---

## 5. Barista (müdür): PIN sıfırlama talebi aç — Ekibim'den

| # | Adım | Ekran | Yer | Dokunuş |
|---|---|---|---|---|
| 1 | "Ben" sekmesi | ResultsPage | `BaristaLayout.tsx:52` | 1 |
| 2 | "Ekibim" satırı | TeamPage | `HomePages.tsx:283` | 1 |
| 3 | Baristanın satırı | MemberSheet (+1 pencere) | `HomePages.tsx:417` | 1 |
| 4 | "PIN sıfırlama iste" (pencerenin en altı, kaydırma gerekir) | — | `HomePages.tsx:614` | 1 |
| 5 | `confirm()` → Tamam | — | `HomePages.tsx:528` | 1 |

**Toplam: 5 dokunuş · 3 ekran + 1 pencere.**

- **Gereksiz görünen:** "Ben → Ekibim" ara adımı. Nedeni kodda yazılı: alt menüde beş sekme
  sınırı var, müdürün Ekibim ve Talepler ekranları bu yüzden "Ben"in içine kondu
  (`BaristaLayout.tsx:41-46`). Bugün sayfasının en altındaki "Tüm bölümler" ızgarasında da var
  (`HomePages.tsx:230-233`) ama oraya ulaşmak uzun bir kaydırma.
- **Öneri:** müdür rolünde "Ben" sekmesi "Ekibim" olabilir (kendi sonuçları Ekibim'in içinden),
  ya da Bugün sayfasının üstünde müdüre özel bir "Ekibim" kutusu durabilir → **4 dokunuş**.
- ⚠️ **`confirm()` adımı kalsın:** bu dokunuş Kahve Operasyonu'na gerçek bir talep açıyor,
  Bölge Müdürü yeni davet kodu üretiyor ve baristanın eski PIN'i iptal oluyor
  (`HomePages.tsx:528-541`). Yanlışlıkla açılması birinin işe başlamasını geciktirir.
- **İnebileceği yer: 4 dokunuş.**

---

## 6. Mağaza müdürü: yeni talep aç

| # | Adım | Ekran | Yer | Dokunuş |
|---|---|---|---|---|
| 1 | "Ben" sekmesi | ResultsPage | `BaristaLayout.tsx:52` | 1 |
| 2 | "Talepler" satırı | RequestsPage | `HomePages.tsx:290` | 1 |
| 3 | "Yeni" | +1 pencere | `barista/RequestsPage.tsx:54` | 1 |
| 4 | Konu: 5 kart, **varsayılan "Arıza"** | — | `RequestsPage.tsx:106`, kartlar `:147-156` | 0 (başka konu 1) |
| 5 | Ekipman `<select>` — arızada **zorunlu** | — | `:159-167`, doğrulama `:120` | 2 |
| 6 | Başlık alanına dokun + yaz — **zorunlu** (≥3 karakter) | — | `:168-172`, doğrulama `:119` | 1 |
| 7 | Ayrıntı — isteğe bağlı | — | `:173-178` | 0 |
| 8 | Fotoğraf — isteğe bağlı | — | `:179-182` | 0 |
| 9 | Öncelik — **varsayılan Normal** | — | `:183-189` | 0 (acil 1) |
| 10 | "Gönder" | — | `:143` | 1 |

**Toplam: 7 dokunuş + başlık yazımı · 2 ekran + 1 pencere.** (Acil + farklı konu seçilirse 9.)

**Form alanları: 6.** Zorunlu olan **2** (başlık; arızada ekipman). Gerçekten gerekli olan da
bu ikisi + konu — kalanı (ayrıntı, fotoğraf, öncelik) boş gidebiliyor.

- **Gereksiz görünen:** `<select>` ile ekipman seçimi (2 dokunuş) oysa konu kartları çip olarak
  çizilmiş; ekipman da çip ızgarası olsa **−1**. 11 ekipman var (`api/requests.ts:23`), ızgaraya
  sığar.
- **Öneri:** ekipman seçilince başlık otomatik önerilsin ("Espresso makinesi — "); yazma yükü
  düşer, "başlık ≥3 karakter" hatasına düşen kullanıcı azalır.
- Not: operasyonun en çok ihtiyaç duyduğu alan (Ayrıntı: ne zaman başladı, misafiri etkiliyor
  mu) isteğe bağlı. Burada kısaltmak değil, tersi gerekebilir — sayım bunu gösteriyor.
- **İnebileceği yer: 5 dokunuş** (Ekibim/Talepler kısayolu + çip ekipman).

---

## 7. Bölge müdürü: panelden yeni barista ekle → davet kodu ver

| # | Adım | Ekran | Yer | Dokunuş |
|---|---|---|---|---|
| 1 | "Baristalar" (masaüstü yan menü / telefonda alt menü) | BaristasPage | `StaffLayout.tsx:169`, `:233` | 1 |
| 2 | "Barista" düğmesi | +1 pencere | `StaffPages.tsx:1053` | 1 |
| 3 | Ad soyad — `autoFocus`, dokunuş gerekmez, yazılır | — | `StaffPages.tsx:958` | 0 |
| 4 | Mağaza `<select>` — süzgeç seçiliyse hiç çıkmaz | — | `:959-966`, hazır geçiş `:1133` | 2 (ya da 0) |
| 5 | İşe başlama tarihi — **varsayılan bugün** | — | `:967-970` | 0 |
| 6 | Telefon — isteğe bağlı | — | `:971` | 0 |
| 7 | Rol — **varsayılan Barista** | — | `:972-980` | 0 |
| 8 | "Ekle ve kod oluştur" | +1 pencere (CodeSheet) | `:957` | 1 |
| 9 | "Kopyala" | — | `:67-69` | 1 |
| 10 | "Tamam" | — | `:59` | 1 |

**Toplam: 7 dokunuş + ad yazımı · 1 ekran + 2 pencere.** Mağaza süzgeci zaten seçiliyse
**5 dokunuş**. Mağaza sayfasından girilirse (`/magazalar` → mağaza → "Barista ekle",
`StaffPages.tsx:830`) mağaza alanı hiç çıkmaz ama önce 2 dokunuşla o sayfaya gidilir — başa baş.

- **Gereksiz görünen:** kod penceresinde "Kopyala" ve "Tamam" ayrı. Tek düğme ("Kopyala ve
  kapat") **−1**. ⚠️ Pano her yerde çalışmıyor (`StaffPages.tsx:40-55`: izin yoksa kod seçilebilir
  bir kutuda gösteriliyor) — birleşik düğme bu düşüşü bozmamalı, kopyalama başarısızsa pencere
  kapanmamalı.
- **Öneri:** telefon girildiyse pencerede doğrudan WhatsApp/SMS bağlantısı olsun; kodu iletmek
  şu an uygulamayı bırakıp başka uygulamada aramayı gerektiriyor (sayıma girmeyen ama en uzun
  adım bu).
- **İnebileceği yer: 4 dokunuş** (süzgeç seçili + birleşik kopyala/kapat).

---

## 8. Direktör: bülten yayınla

| # | Adım | Ekran | Yer | Dokunuş |
|---|---|---|---|---|
| 1 | "Bülten" (masaüstü yan menü) | BulletinPage | `StaffLayout.tsx:86` | 1 |
| 2 | "Yeni bülten" | +1 pencere | `BulletinPages.tsx:82` | 1 |
| 3 | Tür — **varsayılan Duyuru** | — | `:198`, çipler `:330-335` | 0 |
| 4 | Başlığa dokun + yaz — **zorunlu** (≥3) | — | `:352`, doğrulama `:220` | 1 |
| 5 | Metne dokun + yaz — **zorunlu** (liderlik dışı) | — | `:358`, doğrulama `:221` | 1 |
| 6 | Kimler görecek — **varsayılan tüm mağazalar** | — | `:436-449` | 0 |
| 7 | "Yayınla" | — | `:320-322` | 1 |

**Toplam: 5 dokunuş · 1 ekran + 1 pencere.** Telefonda Bülten ana sekmelerde değil:
"Diğer" → "Bülten" (`StaffLayout.tsx:247`, `:257`) → **6 dokunuş**.

- Önizleme kendiliğinden çiziliyor (`BulletinPages.tsx:466-489`), ayrı bir "önizle" dokunuşu yok —
  doğru.
- Liderlik tablosu seçilirse her satır için "Satır" + iki alan (`:381-396`): 10 kişilik sıralama
  ~11 dokunuş + 20 yazma. Buraya bir "panodan yapıştır / satır satır ayır" girişi gelse en
  büyük kazanç orada olur, ama bu akış sorulan on işin dışında.
- ⚠️ **Yayın yetkisi yoksa düğme "Onaya gönder" oluyor** (`:321`, `canPublishNow` `api/changes.ts`).
  Bu onay akışı denetim için; direktörde zaten tek dokunuş.
- **İnebileceği yer: 5 (masaüstü, bugünkü hali) / 5 (telefonda, Bülten'i ana sekmeye alarak).**

---

## 9. Direktör: bir talebi yanıtla ve durumunu değiştir

| # | Adım | Ekran | Yer | Dokunuş |
|---|---|---|---|---|
| 1 | "Talepler" | RequestsPage | `StaffLayout.tsx:80` (telefonda ana sekme) | 1 |
| 2 | Talep kartı | +1 pencere | `staff/RequestsPage.tsx:133` | 1 |
| 3 | Yanıt kutusuna dokun + yaz | — | `shared/Requests.tsx:194` | 1 |
| 4 | Durum düğmesi (ör. "Çözüldü") — **yanıtı da gönderir** | — | `Requests.tsx:205-209`, `addNote(text, status)` `:128` | 1 |

**Toplam: 4 dokunuş · 1 ekran + 1 pencere.**

- **İyi kurulmuş:** durum düğmesi metni de gönderiyor, ayrı "Gönder" gerekmiyor. Yalnız yanıt
  yazılacaksa "Gönder" (`:215`) — yine 4 dokunuş.
- **Reddetme 8 dokunuş:** "Reddet" (önce `rejecting` moduna geçer, `:121`) + neden `<select>` (2)
  + metin (1) + "Reddi gönder" (1).
  ⚠️ **Bu iki aşama bilinçli:** red nedeni ve mağazaya açıklama zorunlu (`Requests.tsx:120-124`),
  istatistik ekranı bu nedenlerden besleniyor (`RequestStatsPage.tsx`). Kısaltmayın.
- İsteğe bağlı "Şu an neyi bekliyor?" `<select>` (`:170-179`) 2 dokunuş daha; yalnızca istatistik
  için, zorunlu değil.
- **Pürüz:** açık talepte 4 durum düğmesi yan yana çiziliyor (`NEXT.open`, `Requests.tsx:77`);
  telefonda alt alta sarıyor ve "Reddet" ile "Çözüldü" komşu. En sık kullanılan ikisini öne
  almak dokunuş kazandırmaz ama yanlış dokunuşu azaltır.
- **İnebileceği yer: 3 dokunuş** — liste kartında "İşleme al" kısayolu. ⚠️ Ama durum değişimi
  yazışmaya kayıt düşüyor; kart üzerinden tek dokunuşla durum değiştirmek yanlışlıkla kayıt
  oluşturur. Önermeden önce düşünülmeli.

---

## 10. Geliştirici: panelden yedek al

| # | Adım | Ekran | Yer | Dokunuş |
|---|---|---|---|---|
| 1 | Yan menünün altında "Yedek al" | — | `StaffLayout.tsx:187` | 1 |
| 2 | İndirme kendiliğinden başlar | — | `lib/backup.ts:50-56` | 0 |

**Toplam: 1 dokunuş · 0 ekran geçişi.** Telefonda: "Diğer" → "Yedek al"
(`StaffLayout.tsx:276-279`) → **2 dokunuş**.

- **Zaten en kısa hali**; 7 günden eski yedekte düğmenin altında hatırlatma da var
  (`StaffLayout.tsx:190`).
- **Ters yönde bir not:** onay yok, tek dokunuş bütün koleksiyonları okuyor
  (`backup.ts:10-11, 31-44` — kayıt sayısı kadar okuma). Yanlış dokunuş kota harcıyor. Burada
  kısaltma değil, "kaç kayıt okunacak" diyen bir onay düşünülebilir — karar kullanıcının.

---

## Özet tablo

| İş | Bugün | Ekran | Gereksiz adım | İnebileceği |
|---|---|---|---|---|
| 1. Giriş + ders bitirme | 10 | 7 | Akademi → yol → modül zinciri | 7 |
| 2. Reçeteye bakmak | 2 (klavye yüzünden 3) | 2 | `focus=1` klavyesi listeyi kapatıyor | 1 |
| 3. Sınav (10 soru) | 26 (Bugün'den 23) | 6 | soru başına "Sonraki" | 14 |
| 4. Bülten okumak | 1 | 1 | — | 1 |
| 5. PIN sıfırlama talebi | 5 | 3 + pencere | "Ben → Ekibim" ara adımı | 4 |
| 6. Yeni talep (müdür) | 7 | 2 + pencere | ekipman `<select>` | 5 |
| 7. Barista ekle + kod | 7 (süzgeçliyse 5) | 1 + 2 pencere | "Kopyala" + "Tamam" ayrı | 4 |
| 8. Bülten yayınlamak | 5 (telefonda 6) | 1 + pencere | telefonda "Diğer" ara adımı | 5 |
| 9. Talebi yanıtla + durum | 4 (red 8) | 1 + pencere | — (red akışı gerekçeli) | 3–4 |
| 10. Yedek al | 1 (telefonda 2) | 0 | — | 1 |

**En uzun akış, farkla sınav:** 10 soruluk bir modül sınavı 26 dokunuş; 15 soruluk olanlar 36.
Diğer dokuz işin toplamı 42 dokunuş.

---

## En çok kazanç getirecek beş değişiklik

1. **Sınavda şık seçince otomatik sonraki soruya geçmek** — 10 soruda **−9**, 15 soruda **−14**
   dokunuş. Tek bir değişiklikle öteki dokuz işin toplamı kadar yük kalkıyor.
   ⚠️ Davranış değişikliği: cevabı değiştirmek "Önceki"ye dönmeyi gerektirir, yanlış dokunuşun
   maliyeti artar. Kısa bir gecikme (≈300 ms) ve "Önceki"nin yerinde kalması şart; uygulanmadan
   önce karar kullanıcının.
2. **Giriş ekranına "son baktığın reçeteler" ve klavyeyi açmamak** — her bakışta **−1, pürüzle
   birlikte −2** dokunuş. Tek tek küçük ama günde en çok tekrarlanan iş bu; veri zaten telefonda
   duruyor (`RecipesPage.tsx:65-71`), yeni bir okuma gerekmiyor.
3. **Müdürlerde Ekibim ve Talepler'i doğrudan erişilebilir yapmak** — PIN talebi 5 → 4, yeni
   talep 7 → 6; müdürün her ekip/talep ziyaretinde **−1** dokunuş. Beş sekme sınırını delmemek
   için: müdür rolünde "Ben" sekmesini "Ekibim" yapmak (kendi sonuçları içeride).
4. **Talep formunda ekipmanı çip ızgarası yapmak + başlığı ekipmandan önermek** — **−1 dokunuş**
   ve başlık yazımının çoğu. Formu kısaltmıyor, dolduruluşunu kısaltıyor; "başlık ≥3 karakter"
   hatasına düşmeyi de azaltır.
5. **Davet kodu penceresinde "Kopyala" ile "Tamam"ı birleştirmek** — **−1 dokunuş**, her yeni
   baristada. ⚠️ Pano izni yoksa pencere kapanmamalı (`StaffPages.tsx:40-55`).

**Kısaltılması önerilmeyenler** (gerekçesi var, sayımda uzun görünseler de):
PIN'in 4 hanesi ve ortak telefondaki kişi seçimi; sınav giriş ekranındaki "Başla"
(haftalık hak harcıyor); PIN sıfırlama `confirm()`'i; talep reddinde neden + açıklama zorunluluğu;
yayın yetkisi olmayanda "Onaya gönder" akışı.
