# E-posta bildirimleri (Cloud Functions)

**Durum:** Kod hazır ve emülatörde denendi; **yayında değil.** Cloud Functions
Firebase'in ücretli planını (Blaze, "kullandıkça öde") gerektiriyor.

## Ne gönderir

Kim hangi e-postayı alır: panelde **Kahve Operasyonu → Bildirimler**
(Firestore `config/notifications`). Ayar yoksa rollere göre varsayılan:

| Olay | Ne zaman | Kutay | Cenk Bey | Uğur Bey |
|---|---|:-:|:-:|:-:|
| Yeni talep açıldı | anında | | | ✓ |
| Acil talep açıldı | anında | | ✓ | ✓ |
| Mağaza talebe yanıt yazdı | anında | | | ✓ |
| Servis talebi direktör onayına geldi | anında | | ✓ | |
| Servis talebi onaylandı / reddedildi | anında | | | ✓ |
| 3 günü geçen açık talepler | her sabah 08:30 | | | ✓ |
| Onay bekleyen içerik / bülten / yeni ürün | anında | | ✓ | |
| Önerim yayınlandı / geri gönderildi | anında | | | ✓ |
| Günlük özet | her sabah 08:30 | | ✓ | ✓ |
| Haftalık rapor | pazartesi 09:00 | ✓ | ✓ | |
| Uygulamadan geri bildirim | anında | ✓ | | |

Her gönderim `mailLog`'a yazılır ve Bildirimler ekranının altında görünür.
Emülatörde ve demo projesinde (`playbook-demo-1401`) e-posta **gitmez**;
yalnızca "deneme" olarak kaydedilir.

## Maliyet (tahmin, Kasım 2026)

Bu ölçekte (4–10 şube) beklenen aylık maliyet **0 TL**: kullanım Google'ın
ücretsiz kotalarının çok altında kalıyor. Ücretli plan yine de **kredi kartı
tanımlamayı** gerektiriyor.

| Kalem | Ücretsiz kota | Bizim tahmini kullanım | Aşılırsa |
|---|---|---|---|
| Cloud Functions çağrısı | ayda 2 milyon | birkaç bin | milyon başına ~0,40 $ |
| Functions işlem süresi | 400.000 GB-sn, 200.000 CPU-sn | çok küçük | kullanım kadar |
| Zamanlanmış görev (Cloud Scheduler) | hesap başına 3 iş | 2 iş | iş başına ~0,10 $/ay |
| Fonksiyon paketinin saklanması (Artifact Registry) | ~0,5 GB | ~0,1–0,3 GB | GB başına ~0,10 $/ay |
| Firestore (okuma/yazma) | Spark ile aynı günlük kota | aynı | kullanım kadar |
| E-posta gönderici (Brevo ücretsiz) | günde 300 e-posta | günde ~10–30 | ücretli plan |

Öneri: Google Cloud'da **aylık 5 $'lık bütçe uyarısı** kurulsun; beklenmedik bir
kullanımda e-posta ile haber verir.

Gönderici seçenekleri:
- **Brevo (ücretsiz, günde 300):** hesap açılır, gönderen adresi doğrulanır,
  SMTP anahtarı alınır. Ücretsiz planda e-postaların altında Brevo logosu çıkar.
- **Şirketin Google Workspace hesabı** (1401coffee.com Workspace ise): ayrı
  servis gerekmez; bir hesap için "uygulama şifresi" oluşturulur.

## Yayına alma (karar verilince)

1. Firebase konsolu → playbook-1401 → Kullanım ve faturalandırma → **Blaze**.
2. Gönderici: Brevo ya da Workspace uygulama şifresiyle bir SMTP adresi:
   `smtps://KULLANICI:SIFRE@smtp-relay.brevo.com:465`
3. Gizli değer olarak kaydet (şifre koda ya da depoya girmez):
   `firebase functions:secrets:set SMTP_URL --project playbook-1401`
4. Gerekirse gönderen adı: `functions/.env.playbook-1401` → `MAIL_FROM=1401 Campus <bildirim@1401coffee.com>`
5. `firebase deploy --only functions --project playbook-1401`
6. Panel → Bildirimler: e-posta adreslerini kontrol et, kaydet. Bir test talebi
   açıp "Son e-postalar"da **Gönderildi** göründüğünü doğrula.

## Yerelde deneme

```bash
npm run emulators            # kök dizinde; functions emülatörü de açılır
node functions/deneme-ozet.mjs   # günlük özet + haftalık rapor (emülatörde zamanlayıcı yok)
```
