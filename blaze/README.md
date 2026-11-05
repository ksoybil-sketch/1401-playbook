# Blaze sürümü (kullanılmıyor — ileride geçiş için saklanıyor)

Bu klasördeki kod **şu an derlenmiyor ve dağıtılmıyor**. Uygulama bugün
Firebase'in ücretsiz **Spark** planıyla çalışıyor (bkz. kök dizindeki
`src/api/backend.ts` ve `firestore.rules`). Buradaki dosyalar, ileride
**Blaze**'e (kullandıkça öde) geçildiğinde sunucu tarafını geri getirmek
için referans olarak duruyor.

## İçindekiler

- `functions/` — Cloud Functions: PIN kontrolü, telefon eşleştirme, barista
  davet kodu, sınav puanlama. Aktif projede yok.
- `firestore.rules` — custom claim tabanlı (sunucunun `auth.token.role`
  olarak yazdığı) güvenlik kuralları.
- `storage.rules` — ders fotoğraf/video yükleme kuralları (Storage).
- `client-calls.ts` — eski `src/api/calls.ts`: bu fonksiyonları çağıran
  istemci kodu.

## Spark ile Blaze arasındaki fark

| | Spark (şimdi) | Blaze (bu klasör) |
|---|---|---|
| Hesaplar | Her telefon/barista kendi Firebase Auth hesabı; PIN → şifre | Tek "sahte" uid + custom claim, PIN sunucuda hash'li |
| Sınav puanlama | Telefonda (cevap anahtarı telefona iner) | Cloud Functions'ta (cevap anahtarı hiç inmez) |
| Sınav sonucu yazma | Barista kendi `progress` belgesini yazar | Sunucu yazar (barista taklit edemez) |
| Fotoğraf | Küçültülüp Firestore'a (data URL) gömülü | Firebase Storage |
| Video | Yalnızca dış bağlantı (YouTube) | Dış bağlantı ya da Storage yüklemesi |
| Aylık maliyet | 0 TL (Spark kotası yeterli) | Muhtemelen 0 TL (Blaze'de de aynı kotalar ücretsiz) ama kart gerekir |

## Geçiş adımları (ileride)

1. Projeyi Blaze'e yükselt (Firebase konsolu → Kullanım ve faturalandırma).
2. `functions/` klasörünü köke taşı, `firebase.json`'a `functions` bloğunu
   geri ekle, `firebase deploy --only functions`.
3. `firestore.rules` ve `storage.rules`'ı köke taşıyıp deploy et.
4. `src/api/calls.ts` olarak `client-calls.ts`'i geri getir; `backend.ts`
   kullanan ekranları (`DeviceScreens`, `StaffPages`, `ExamPage`,
   `session.ts`) tekrar `api.*` çağrılarına bağla.
5. **Veri taşıma:** Spark'taki `users/{uid}` + `baristas/{id}.uid/authEmail`
   modelinden Blaze'in custom-claim modeline geçişte mevcut hesapların PIN'i
   kaybolur — tüm baristalar için "PIN sıfırla" çalıştırmak gerekir (tek
   seferlik, kabul edilebilir bir kesinti).
