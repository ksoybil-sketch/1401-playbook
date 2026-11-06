# 1401 Playbook

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
6. Android: `npx cap add android && npm run build && npx cap sync android`.

### Sezon güncellemesi (reçeteler değiştiğinde)

1. Yeni menü dosyasından reçeteleri çıkar: `node scripts/extract-2026.mjs "<menü html>"`.
2. `scripts/content.mjs` içindeki `CATEGORY_MODULES` eşlemesini gözden geçir (yeni kategori geldiyse).
3. `npm run curriculum` ile kontrol et, `npm run build && firebase deploy --only hosting` ile yayına al.
4. Panelden **İçerik → Müfredatı güncelle** → onay ekranındaki "silinecek" listesini oku → **Uygula**.

`node scripts/seed.mjs --production --content-only --refresh-token-file <dosya>` hâlâ çalışır ama
günlük kullanımda gerekmez; panel yolu tercih edilir.
