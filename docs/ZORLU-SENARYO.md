# 1401 Campus: zorlu senaryo

İlk yük testi (12 şube, 76 barista) şu sorulara cevap verdi: aynı anda çalışınca çöküyor mu, sayılar doğru mu, kota yetiyor mu. Bu senaryo bir adım öteye gidiyor. Uygulamayı **yanlış, alışılmadık ve kötü niyetli** kullanan insanlarla, **bozuk koşullarda** zorluyor. Aranan şeyler:

- **Ekran hataları:** taşan yazılar, üst üste binen çubuklar, kaybolan düğmeler.
- **İşe yaramayan düğmeler:** basınca hiçbir şey olmayan, sessizce başarısız olan, iki kez basınca iki kez yapan.
- **Alternatif kullanım biçimleri:** kimsenin "böyle kullanılır" demediği ama gerçekte olacak yollar.
- **Güvenlik açıkları:** bir rolün yapmaması gereken bir şeyi yapabilmesi, başkasının verisini görmesi.
- **Kullanım kolaylığı eksikleri:** işin yapılabildiği ama zor, yavaş ya da kafa karıştırıcı olduğu yerler.
- **Akla gelmeyen zorluklar:** zaman, takvim, cihaz, ağ, güncelleme anı, kayıtların birbirine bağlılığı.

Bütün denemeler **yerel emülatörde** yapılır; canlıya ve demoya dokunulmaz. Bulgular "açık hata" (düzeltilir) ve "davranış değişikliği" (kullanıcıya sorulur) diye ayrılır.

---

## Bölüm 1: Ekran ekran, rol rol (arayüz kaşifi)

Her rol için (geliştirici, direktör, operasyon müdürü, bölge müdürü, Kahve Operasyonu, kurul üyesi, mağaza müdürü, vardiya müdürü, barista, mağaza telefonu) **erişebildiği her ekran**:

1. **Dört ekran boyutu:** 360 px (küçük Android), 390 px (iPhone), 768 px (tablet), 1280 px (masaüstü). Ayrıca telefon yatay (844×390).
2. **Üç tema:** Espresso, Latte, Çekirdek.
3. **Her düğmeye, sekmeye, bağlantıya bas.** Açılan her pencerede kaydet, vazgeç, X, dışarı dokun ve geri tuşu denenir. Boş, çok uzun (500 karakter), emojili ve Türkçe karakterli değerler girilir.
4. **Otomatik ölçümler:**
   - yatay kaydırma;
   - ekran dışına taşan öğe;
   - sabit çubukların (alt menü, eylem çubuğu) bir giriş alanını örtmesi;
   - yazının kesilmesi;
   - 44 px'ten küçük dokunma alanı;
   - konsol hatası, sayfa hatası, `hatalar` koleksiyonuna düşen kayıt;
   - basıldığında ne ekranda ne ağda bir şey değiştirmeyen "ölü" düğme.
5. **Hızlı ve beklenmedik dokunuşlar:**
   - aynı düğmeye çift ve üçlü tıklama;
   - kayıt sürerken sayfa değiştirme;
   - pencere açıkken geri tuşu;
   - tarayıcının ileri/geri düğmeleri;
   - yenileme (F5) ortasında kalan form.
6. **Boş ve dolu uçlar:**
   - hiç verisi olmayan yepyeni bir şube;
   - 40 baristalı bir şube;
   - 300 görevli bir barista;
   - 0 sorulu modül;
   - hiç bülteni olmayan barista.

## Bölüm 2: Kötü niyetli ve meraklı kullanıcı (güvenlik)

Gerçek istemci kütüphanesiyle, kurallara karşı:

- **Barista:**
  - başkasının sınavını, cevaplarını, ilerlemesini okumaya ya da yazmaya çalışır;
  - kendi puanını 100 yapmaya, `passed` alanını değiştirmeye çalışır;
  - cevap anahtarını okuyup sınavı hep 100 bitirir (bilinen Spark sınırı; etkisi ölçülür);
  - haftalık hakkını sıfırlamaya, kendine rozet vermeye çalışır.
- **Mağaza müdürü:** başka şubenin talebini, ekibini, görevini görmeye ya da değiştirmeye çalışır; başka şubeye görev atamaya çalışır.
- **Mağaza telefonu:** başka şubenin baristalarını listeler; başka şubenin davet kodunu kullanır.
- **Kahve Operasyonu ve bölge müdürü:**
  - kendi rolünü yükseltmeye, Yetkiler belgesine yazmaya çalışır;
  - geliştiricinin kaydını okumaya çalışır;
  - yapay zekâ anahtarını alıp dışarı taşımayı dener. Bu anahtar kimlere açık, sızarsa zarar ne?
- **Kurul üyesi:** herhangi bir şeye yazmaya çalışır.
- **Kod tahmini:**
  - 6 haneli eşleştirme kodunu ve davet kodunu deneme yanılmayla bulmaya çalışır;
  - hız sınırı var mı, 30 dakikada kaç deneme mümkün?
- **İçerik yoluyla saldırı:**
  - ders, bülten, talep, geri bildirim, barista adı alanlarına HTML/JS, markdown bağlantısı, `javascript:` adresi, çok büyük görsel (1 MiB belge sınırı) koyar;
  - kurul Excel çıktısında formül çalıştırmayı dener.
- **Oturum:**
  - ekipten çıkarılan kişinin açık sekmesi;
  - PIN'i sıfırlanan baristanın eski PIN'i;
  - bağlantısı kaldırılan telefonun önbelleği.
- **Paketteki sırlar:** derlenmiş JavaScript'te anahtar, şifre, test hesabı ya da demo bilgisi var mı? Canlı paket demo hesaplarını içeriyor mu?

## Bölüm 3: Gerçek hayat (kişiler ve alışılmadık kullanım)

Kişiler ve günleri:

- **İlk gününde Deniz:**
  - davet kodunu yanlış girer;
  - PIN'ini unutur;
  - bir dersi yarıda bırakır;
  - sınava girmeden çıkar;
  - ertesi gün kaldığı yerden devam etmeye çalışır.
- **Yoğun öğle saatinde paylaşılan telefon:** 6 barista aynı telefonu 20 dakikada sırayla kullanır. Hızlı giriş/çıkış yapılır, biri çıkış yapmayı unutur, başkası onun yerine sınava başlar.
- **55 yaşında şube müdürü, tablette:**
  - büyük yazı tipi (tarayıcı yakınlaştırma %150);
  - yalnızca dokunarak ekibine görev atar;
  - talep açar ve fotoğraf ekler.
- **Ay sonunda direktör:**
  - 40 öneriyi onaylar;
  - üç dersi aynı anda iki sekmede düzenler;
  - Müfredatı güncelle'yi çalıştırır;
  - bir soruyu iptal eder;
  - rozet kurallarını değiştirir;
  - aynı gün birini işten çıkarır, birini yeniden etkinleştirir.
- **Kurul üyesi telefondan:** raporları açar, dönem değiştirir, Excel indirir, soru sorar, cevabı bekler.
- **Klavyeyle ve ekran okuyucuyla kullanım:**
  - sekme sırası mantıklı mı;
  - düğmelerin adı var mı;
  - görseller açıklanmış mı;
  - renk karşıtlığı yeterli mi (WCAG AA)?
- **Düşük donanım:** 4 kat yavaşlatılmış işlemci ve yavaş 3G ağ. Akademi, sınav ve panel ilk açılışta ne kadar sürüyor; donma var mı?

## Bölüm 4: Zaman, takvim ve bağlılık (akla gelmeyenler)

- **Takvim sınırları:**
  - Haftalık sınav hakkı Pazar 23:59 → Pazartesi 00:01 geçişinde, İstanbul saatiyle, telefon saati UTC'deyken nasıl davranıyor?
  - Yıl dönümü (31 Aralık → 1 Ocak): kurulun "Bu yıl" dönemi ve haftalık grafik ne gösteriyor?
  - Rozetin geçerlilik süresi dolarken ne oluyor?
- **Telefon saati yanlış:** 2 gün ileri ya da 3 saat geri. Sınav süresi, son tarih ve "bugün" hesapları ne oluyor?
- **Güncelleme anı:**
  - sınav sürerken yeni sürüm yayınlanır (eski JS parçası artık yok);
  - kaydedilmemiş ders düzenlemesi sırasında otomatik sürüm yenilemesi gelir.
- **Kayıtların bağlılığı:**
  - görevi olan modül silinir;
  - mağaza pasifleştirilir (baristaları, telefonu, görevleri ne olur?);
  - barista başka şubeye taşınırken açık sınavı vardır;
  - eğitim yolu yayından kalkar;
  - aynı e-posta iki rolde istenir.
- **Uzun çevrimdışılık:**
  - telefon 2 gün internetsiz kalır, bu arada sınav, ders ve talep birikir;
  - bağlantı gelince sıra ve çakışmalar ne olur?
- **Tarayıcı verisinin silinmesi:**
  - mağaza telefonunun uygulama verisi silinir;
  - panelde aynı anda üç sekme açıktır.

---

## Çıktı

Her bölüm kendi raporunu yazar: bulgu, önem, nasıl tekrarlanır, dosya:satır, ekran görüntüsü, önerilen düzeltme, tür (açık hata / davranış değişikliği). Raporlar birleştirilir. Açık hatalar düzeltilip emülatörde yeniden denenir. Davranış değişiklikleri kullanıcıya sorulur. Sonra demoya, oradan canlıya alınır.
