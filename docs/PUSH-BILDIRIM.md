# Push bildirim (bülten ve talepler) — ne gerekiyor

**Soru:** Bültenler ve talepler için telefona düşen bildirim (push) ekleyebilir miyiz?
**Kısa cevap:** Evet, teknik engel yok. Ama üç kapı var: **Blaze planı**, **yeni bir APK**
ve **iPhone tarafı**. Üçü de karar gerektiriyor; kod yazmaktan önce bunlar.

Durum: 22.11.2026. Bu belge yalnızca neyin gerektiğini anlatır, hiçbir kod değişmedi.

---

## 1. Bugün elimizde ne var

| | Durum |
|---|---|
| Uygulama içi bildirim | **Var.** Bülten sekmesinde okunmamış sayısı, "Seni bekleyenler" şeridi. Yalnızca uygulama açıkken. |
| E-posta bildirimleri | **Kod hazır, yayında değil.** `functions/index.js` — talep, onay, geri bildirim, günlük özet. Blaze bekliyor (bkz. [functions/README.md](../functions/README.md)). |
| Push altyapısı | **Yok.** Ne web tarafında FCM kurulumu, ne APK'da push eklentisi, ne de cihaz jetonu saklayan bir koleksiyon. |

Önemli: **Push'u gönderen taraf sunucudur.** Gönderme anahtarı telefona ya da tarayıcıya
konamaz (konursa herkes herkese bildirim atabilir). Bu yüzden push, e-posta bildirimleriyle
aynı kapıdan geçer: Cloud Functions, yani **Blaze planı**. İkisi aynı anda açılır.

## 2. Üç ayrı cihaz, üç ayrı yol

| Cihaz | Çalışır mı | Ne gerekir |
|---|---|---|
| **Panel** (bilgisayarda Chrome/Edge) — Kahve Operasyonu | Evet | Web push: VAPID anahtarı + `firebase-messaging-sw.js`. Kullanıcı bir kez "İzin ver" der. Tarayıcı kapalıysa da gelir, bilgisayar açıksa. |
| **Mağaza telefonu** (APK) | Evet, **ama yeni APK ile** | Android WebView'da web push **yok**. `@capacitor/push-notifications` eklentisi + Firebase'de Android uygulaması kaydı + `google-services.json` + APK 1.2 → 1.3 ve her mağaza telefonuna yeniden kurulum. Android 13+ ayrıca "bildirim izni" sorar. |
| **iPhone** | Şu an hayır | Capacitor'ın iOS yapısında push, Apple'ın **ücretli geliştirici programını** (yılda 99 $) ister; şimdiki ücretsiz hesapla açılamıyor. Ücretsiz yol: Safari'de siteyi açıp **"Ana Ekrana Ekle"** demek — iOS 16.4+ bu kurulu sayfaya web push verir. Yani iPhone'da push, APK'nın değil ana ekrana eklemenin peşinde. |

Baristanın evde kendi telefonundan (derslik) girdiği durum, tarayıcı yoluna girer:
Android Chrome'da web push çalışır, iPhone'da yine "Ana Ekrana Ekle" gerekir.

## 3. Yapılacak işler

**A. Hesap ve plan (sende)**
1. Firebase → playbook-1401 → **Blaze**'e geç (kart tanımlama; beklenen fatura 0 TL, bkz. functions/README).
2. Firebase konsolu → Cloud Messaging → **Web Push sertifikası (VAPID)** üret.
3. APK için: Firebase'e **Android uygulaması** ekle (`com.coffee1401.playbook`), `google-services.json` dosyasını indir.
4. iPhone'da push isteniyorsa: ya Apple Developer Program (99 $/yıl), ya da "Ana Ekrana Ekle" yolunu kabul et.

**B. Kod (bende, yaklaşık yarım–bir günlük iş)**
1. **Jeton saklama:** `pushTokens/{jeton}` → uid, rol, mağaza, cihaz adı, son görülme. Çıkışta ve geçersiz jetonda silinir; kurallara yazma/okuma sınırı eklenir.
2. **İzin isteme:** uygulamada "Bildirimlere izin ver" adımı — ilk açılışta değil, bülten ya da talep ekranında bir kez sorulur (hemen sorulan izin reddediliyor).
3. **Web tarafı:** `firebase/messaging`, `public/firebase-messaging-sw.js` (var olan `sw.js`'ten ayrı dosya olmak zorunda).
4. **APK tarafı:** `@capacitor/push-notifications`, `google-services.json`, yeni sürüm, `npm run apk`, telefonlara dağıtım.
5. **Gönderen:** `functions/index.js` içine, e-posta tetikleyicilerinin yanına push gönderimi. Olay adları aynı kalır (`talep_yeni`, `talep_acil`, `talep_yanit`, `oneri_yeni`…), bülten için bir olay eklenir (`bulten_yayin`).
6. **Bildirimler ekranı:** her kişi için "e-posta / push / ikisi" seçimi (bugün yalnızca e-posta var).
7. **Günlük:** gönderilen her push `mailLog`'un yanındaki kayda yazılır; gitmediği görülebilsin.

## 4. Kime ne gitsin (öneri)

| Olay | Kime | Nereye |
|---|---|---|
| Yeni bülten yayınlandı | Hedeflenen mağazaların telefonları | Mağaza telefonu (APK) |
| Acil talep açıldı | Direktör, Operasyon Müdürü, Bölge Müdürü | Panel + telefon |
| Talebe yanıt geldi | Talebi açan mağaza | Mağaza telefonu |
| Servis talebi onaya düştü | Direktör | Panel |
| Uygulamadan geri bildirim | Geliştirici | Panel |

Gece sessizliği: 22:00–08:00 arasında bülten bildirimi ertesi sabaha bırakılır
(acil talep hariç). Mağaza telefonu ortak cihaz olduğu için bildirim metninde
kişi adı geçmez — "Yeni bülten: Kasım kampanyası" yeter.

## 5. Maliyet

| Kalem | Tutar |
|---|---|
| FCM (bildirim gönderimi) | Ücretsiz, sınırsıza yakın |
| Cloud Functions | Ayda 2 milyon çağrı ücretsiz; bizim kullanım birkaç bin → 0 TL |
| Blaze planı | Kart tanımlama şart, fatura beklentisi 0 TL |
| Apple Developer Program | Yalnızca iPhone'da gerçek push istenirse 99 $/yıl |

## 6. KVKK notu

Push jetonu bir **cihaz tanımlayıcısıdır** ve kişiye bağlanır. Aydınlatma metnine
(bkz. [KVKK-AYDINLATMA-TASLAK.md](KVKK-AYDINLATMA-TASLAK.md)) "bildirim gönderebilmek için
cihaz tanımlayıcısı işlenir" satırı eklenmeli; izin uygulamada ayrıca sorulduğu için
rıza zaten alınmış olur. Çıkışta jeton silinir.

## 7. Karar sırası

1. **Blaze açılsın mı?** Açılırsa hazır duran e-posta bildirimleri de aynı gün yayına girer — push'tan bağımsız bir kazanç.
2. **Yeni APK dağıtmaya değer mi?** Mağaza telefonlarına tek tek kurulum gerekir. Değmezse: panel push'u (bilgisayar) tek başına da kurulabilir, mağaza tarafı uygulama içi rozetle kalır.
3. **iPhone'da push şart mı?** Şart değilse "Ana Ekrana Ekle" yolu yazılır, 99 $ harcanmaz.

Üçüne de "evet" denirse sıra: Blaze → web push (panel) → APK 1.3 → bülten/talep tetikleyicileri.
