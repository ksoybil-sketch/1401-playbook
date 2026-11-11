# 1401 Campus

1401 Coffee için barista eğitim, içecek ve işletme standartları, sınav ve görev uygulaması.
Mağaza telefonlarında (Android) baristalar, bilgisayardan web panelinde Kahve Operasyonu kullanır.
1401 AOS'tan bağımsızdır: ayrı kod, ayrı Firebase projesi. AOS'tan yalnızca reçeteler ve soru bankası bir kerelik kopyalandı (`scripts/source/`).

**Firebase'in ücretsiz Spark planıyla çalışır** — sunucu kodu (Cloud Functions) ve dosya
deposu (Storage) yok, kart bilgisi gerekmez. Blaze'e (kullandıkça öde) geçmek istersen
`blaze/README.md`'de hazır sunucu kodu ve geçiş adımları duruyor.

## Roller

| | Barista | Mağaza sorumlusu | Kahve Operasyonu |
|---|:-:|:-:|:-:|
| Ders, sınav, sonuçlarım | ✅ | ✅ | — |
| Ekibin ilerlemesi, mağazaya görev atama | — | ✅ | ✅ (tüm mağazalar) |
| Barista ekleme / PIN sıfırlama / işten ayrıldı | — | — | ✅ |
| Telefon eşleştirme, içerik ve soru editörü, yeni operasyon hesabı | — | — | ✅ |

## Kimlik modeli (sunucusuz)

Her hesap — mağaza telefonu, barista, Kahve Operasyonu — kendi **Firebase Authentication**
kullanıcısıdır; rolü `users/{uid}` belgesinde tutulur ve `firestore.rules` bunu zorlar.
Barista PIN'i, o hesabın Firebase şifresine dönüşür (`pb-{baristaId}-{pin}`); davet/eşleştirme
kodu da aynı şekilde geçici bir şifre tohumudur. Hesaplar, admin'in tarayıcısında **ikinci,
arka planda çalışan bir Firebase oturumuyla** (`secondaryAuth`, `src/api/firebase.ts`) açılır —
böylece yöneticinin kendi oturumu bozulmaz.

1. **Telefon bağlama:** Panel → Mağaza → "Telefon bağla" 6 haneli kod üretir (30 dk, tek kullanımlık).
2. **Yeni barista:** Panel → "Barista ekle" davet kodu üretir (7 gün). Barista telefonda "Yeni misin?" → kodu girer → kendi PIN'ini seçer.
3. **Günlük giriş:** Adına dokun + 4 haneli PIN. Hatalı denemeleri Firebase Auth'un kendi hız sınırlaması yavaşlatır.
4. **İşten ayrılan:** "İşten ayrıldı" → `users/{uid}.active=false`, o hesapla hiçbir yerde giriş yapılamaz; sınav geçmişi raporlarda kalır.
5. **PIN unutulursa:** "PIN sıfırla" → eski hesap pasifleşir, yeni hesap + yeni davet kodu açılır.

**Spark'ın bilinen kısıtları** (Blaze'e geçince kalkar — bkz. `blaze/README.md`):
- Sınav soru bankası (cevap anahtarı dahil) mağaza oturumlarına açıktır; puanlama telefonda yapılır, sunucuya hiç uğramaz.
- Sınav sonucu (`progress.modules`) doğrudan barista hesabınca yazılır — sunucu tarafı doğrulama yok.
- Telefon eşleştirme kodu, kullanılana kadar düz metin şifre taşır (30 dk ömürlü, tek kullanımlık).
- Ders fotoğrafları küçültülüp (≈150 KB hedef) doğrudan ders belgesine gömülür; video yalnızca dış bağlantı (YouTube vb.) olabilir, dosya yüklenemez.

## Geliştirme (yerel emülatör)

Gereken: Node 22+, Java 21, `firebase-tools`.

```bash
npm install
npm run emulators        # ayrı terminalde; Emulator UI: http://localhost:4000
npm run seed:emu         # müfredat + test hesapları
npm run dev:emu          # http://localhost:5173
```

Test hesapları `scripts/seed.mjs` içindeki `TEST` nesnesindedir (yalnızca emülatör).

## Yapı

```
shared/types.ts          Veri modeli (Firestore koleksiyonları)
src/api/backend.ts        Hesap açma, eşleştirme, PIN, davet, sınav başlat/puanla (sunucusuz)
src/api/firebase.ts       Firebase init + yönetici oturumunu bozmayan ikinci oturum (secondaryAuth)
src/lib/media.ts          Ders fotoğrafı sıkıştırma (Storage yerine Firestore'a gömülü)
firestore.rules           Rol bazlı erişim — kimlik users/{uid}.role'den okunur
scripts/content.mjs       Müfredat kaynağı (İşletme Manueli + Personel Eğitim Konuları + 2026 reçeteleri)
scripts/build-curriculum.mjs  Müfredatı src/generated/curriculum.json'a yazar (build adımı)
scripts/extract-2026.mjs  Sezon menüsü HTML'inden reçeteleri çıkarır (tek seferlik)
scripts/seed.mjs          Emülatöre / gerçek projeye yükleme
src/api/publishCurriculum.ts  Panelden "Müfredatı güncelle" — yöneticinin kendi oturumuyla yazar
src/features/device       Telefon eşleştirme, barista seçimi, PIN, davet, ilk kurulum
src/features/barista      Bugün, Akademi, ders, sınav, sonuçlar, ekibim
src/features/staff        Genel bakış, mağazalar, baristalar, görevler, içerik editörü
blaze/                    Sunucu kodu (Cloud Functions) ve eski kurallar — kullanılmıyor, Blaze geçişi için saklanıyor
```

## Yayına alma

1. Firebase projesi aç, Authentication'da **E-posta/Şifre** sağlayıcısını etkinleştir (konsoldan, CLI'dan yapılamıyor).
2. `.env.production` içine `VITE_FB_*` değerlerini yaz (`firebase apps:sdkconfig WEB <appId>` ile alınır).
3. `firebase deploy --only firestore,hosting` (rules, indexes, web paneli).
4. İlk yönetici hesabı: yayındaki adreste `#/kurulum` sayfasından (yalnızca hiç yönetici yokken çalışır) ya da `node scripts/seed.mjs --production --content-only` ile müfredat yükledikten sonra uygulamadaki "İlk kurulum" ekranından.
5. Müfredat: panele yönetici olarak gir → **İçerik → Müfredatı güncelle**. Uygulamanın içine gömülü müfredat (`src/generated/curriculum.json`) yöneticinin kendi oturumuyla yazılır; menüden çıkmış ders ve sorular silinir, panelden eklenen soru fotoğrafları ve yayın durumları korunur. Betik ya da servis hesabı anahtarı gerekmez.
6. Android: `npm run apk` → `android/app/build/outputs/apk/release/app-release.apk`.

### Android uygulaması

`capacitor.config.json` içinde `server.url` **canlı adresi** gösterir: APK paketlenmiş
HTML'i değil, `playbook-1401.web.app`'i yükler. Sonuç: `firebase deploy --only hosting`
ile yayınlanan her değişiklik, telefonlara yeni APK kurulmadan ulaşır. Yeni APK yalnızca
Capacitor eklentisi, uygulama ikonu/adı veya `server.url` değişirse gerekir.

Bedeli: uygulama açılışta internet ister. Dersler Firestore önbelleğinden çevrimdışı
açılıyordu; bu kurulumda kabuk da ağdan geldiği için şube wifi'si yoksa uygulama açılmaz.

**Önbellek başlıkları bu kurulumun parçasıdır** (`firebase.json` → `hosting.headers`):
`index.html` için `no-cache`, `/assets/**` için bir yıl `immutable`. Sebebi: eksik bir
dosya istendiğinde hosting 404 değil `index.html` döndürüyor (SPA rewrite'ı). Giriş
sayfası önbellekte kalırsa, deploy'dan sonra telefon artık var olmayan bir JS dosyasını
ister, cevap olarak HTML alır ve onu JavaScript sanıp çalıştırmaya çalışır — sonuç
sessiz boş ekran. `no-cache` bu zinciri kırar; dosya adları özet taşıdığı için
`/assets/**` uzun önbellekte güvenle durur. Bu başlıkları kaldırma.

### 20 şubeye kurulum

APK'yı her telefona tek tek kurmak gerekir (Play Store'a girilene kadar).
Telefonda "bilinmeyen kaynaklara izin ver" bir kez onaylanır.

Kurulum yönergesi sayfası hazır: `public/indir/index.html` → yayında `/indir/`.
İndirme düğmesinin hedefi dışarıdan verilir, çünkü **APK Firebase Hosting'de
barındırılamıyor**: Spark planı çalıştırılabilir dosyaları reddediyor
(`Executable files are forbidden on the Spark billing plan`). Bu yüzden
`firebase.json` → `hosting.ignore` içinde `**/*.apk` var; `public/` altına bir APK
düşse bile deploy kırılmasın. APK'yı paylaşmanın yolları: OneDrive/Drive paylaşım
linki (sayfadaki düğmeye bu adres yazılır), doğrudan WhatsApp ile göndermek, ya da
Blaze planına geçmek.

`npm run apk` çıktıyı `apk/1401-campus.apk` konumuna kopyalar (bu klasör
`.gitignore`'da).

Ücretsiz Spark planının sınırı günde 50.000 Firestore okuması. 20 şube ≈ 100 barista
için durum rahat: `src/api/firebase.ts` kalıcı yerel önbelleği (`persistentLocalCache`)
açıyor ve dersler `onSnapshot` ile dinlendiği için ilk kurulumdan sonra yalnızca
**değişen** belgeler okuma sayılır. Tek seferlik maliyet cihaz başına ≈420 belge
(93 ders + 311 soru + modül/izlek); 20 telefonun hepsi aynı gün kurulsa ≈8.400 okuma.
Sınıra yaklaştıran şey günlük kullanım değil, uygulama verisinin sık sık silinmesidir.

İmzalama: `android/keystore.properties` ve `android/1401-playbook.keystore` depoya
**girmez** (`.gitignore`). Bu iki dosya kaybolursa aynı uygulamanın güncellemesi
yayınlanamaz — telefonlardaki uygulamayı silip yeni bir paket adıyla baştan kurmak
gerekir. Yedek: **OneDrive → `1401 Playbook Yedek/android-imzalama`** (iki dosya +
`OKU-BENI.txt`). Yeni bir bilgisayarda bu iki dosyayı `android/` içine kopyalamak ve
`keystore.properties` içindeki `storeFile` yolunu düzeltmek yeterlidir.
Play Store'a geçilirse imzalamayı Google üstlenir ve bu anahtar yalnızca yükleme
anahtarı olarak kalır.

### Demo ortamı

Ayrı Firebase projesi (`playbook-demo-1401`), ayrı veri, canlıyla hiç teması yok.
Ayarlar `.env.demo` içinde; giriş bilgileri ekranda yazılıdır
(`src/features/device/DemoNotice.tsx`) ve bu dosya yalnızca `VITE_DEMO=true` ile
derlenen pakete girer.

```bash
npm run seed:demo        # demo verisini sıfırdan yazar
npm run deploy:demo      # demo derlemesi + deploy, sonra www'yu canlı derlemeye döndürür
```

`deploy:demo` sondaki `npm run build` adımıyla biter: **demo derlemesi `www/` içinde
bırakılmaz.** Bırakılsa, sonraki `firebase deploy --only hosting` demo yapılandırmasını
(demo Firebase projesi ve ekrandaki giriş bilgileri) canlıya gönderirdi. Bu zinciri
elle kurmaktan kaçın — demo derlemesini her zaman bu betikle al.

Demodaki eşleştirme kodu (`140114`) sabittir ve `pairDevice()` içinde **demoda
silinmez** (`if (!DEMO)`), çünkü ekranda yazılı bir kodu birden fazla kişi kendi
tarayıcısında dener. Canlıda kod tek kullanımlık kalır.

### Sezon güncellemesi (reçeteler değiştiğinde)

1. Yeni menü dosyasından reçeteleri çıkar: `node scripts/extract-2026.mjs "<menü html>"`.
2. `scripts/content.mjs` içindeki `CATEGORY_MODULES` eşlemesini gözden geçir (yeni kategori geldiyse).
3. `npm run curriculum` ile kontrol et, `npm run build && firebase deploy --only hosting` ile yayına al.
4. Panelden **İçerik → Müfredatı güncelle** → onay ekranındaki "silinecek" listesini oku → **Uygula**.

`node scripts/seed.mjs --production --content-only --refresh-token-file <dosya>` hâlâ çalışır ama
günlük kullanımda gerekmez; panel yolu tercih edilir.
