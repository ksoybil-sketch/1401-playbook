# Kullanım verisi: hangi soru bugünkü veriyle yanıtlanıyor?

1401 Campus canlıda (`playbook-1401`) kullanım hakkındaki bilginin çoğunu işin
kendisi için yazılan kayıtlardan çıkarır. 17.11.2026'da iki kaynak eklendi:
`clock` (her hesabın son etkinliği, zaten yazılıyordu) ve `kullanim` (mağaza
düzeyinde ekran sayacı). Kullanım
hakkındaki her şey, işin kendisi için yazılan kayıtlardan çıkarılıyor. Bu belge
neyin ölçülebildiğini, neyin ölçülemediğini ve neyin yeni kayıt istediğini sayar.

Raporu çıkaran komut: `npm run kullanim` (bkz. [CANLI.md](../CANLI.md)).
Demoda ayrıca `demoLog` koleksiyonu var (`src/demo/log.ts`), **canlı pakette bu
dosya hiç yer almaz** — canlıda ekran gezinmesi kaydedilmez.

## Bugün yanıtlanabilenler

| Soru | Kaynak | Alan | Ne kadar iyi |
|---|---|---|---|
| Mağaza telefonu uygulamayı en son ne zaman açtı? | `users` (role `store`) | `lastSeenAt` | **Yalnızca son açılış.** Geçmiş yok, sayı yok |
| Telefon eşleşti mi, kod kullanıldı mı? | `users` (role `store`) | `paired`, `active` | Tam |
| Kim hangi dersi ne zaman bitirdi? | `progress/{baristaId}` | `lessons` (dersId → ms) | **Tam geçmiş**, zaman damgalı |
| Kim hangi modülü ne zaman geçti? | `progress` | `modules` (modülId → `passedAt`) | Tam; yalnız en iyi sonuç |
| Mini sınav (yeni ürün) geçildi mi? | `progress` | `quizzes` | Tam |
| Bülteni kim ne zaman okudu? | `progress` | `bulletins` (bültenId → ms) | Tam |
| Sınava kim, ne zaman girdi, ne aldı? | `attempts` | `startedAt`, `submittedAt`, `score`, `timedOut` | **Tam geçmiş**, her deneme ayrı belge |
| Barista ne zamandır kayıtlı, PIN'i var mı? | `baristas` | `pinPending`, `inviteExpiresAt`, `createdAt`, `history` | Tam |
| Davet kodu kullanılmamış mı, süresi geçmiş mi? | `baristas` + `invites` | `pinPending`, `expiresAt` | Tam |
| PIN sıfırlama kaç kez istendi? | `requests` | `category='personel'`, `subjectBaristaId` | Tam |
| Mağaza hangi talebi ne zaman açtı, kaç gün bekledi? | `requests` | `createdAt`, `notes[].at`, `status`, `waitReason` | **Tam**, her not zaman damgalı |
| Panelden kim görev/bülten/öneri yazdı? | `assignments`, `bulletins`, `proposals` | `createdAt`, `createdByName` | Tam |
| Ekran çöktü mü, hangi hatayla? | `hatalar` | `message`, `stack`, `path`, `device`, `createdAt` | Tam (kişi başına günde en çok 20 kayıt) |
| Kullanıcı ne şikâyet etti? | `feedback` | `kind`, `text`, `path`, `status` | Tam |
| Etkinlik hangi saatlerde yoğun? | yukarıdaki bütün zaman damgaları | — | **Dolaylı.** Giriş değil, *iş* saatleri |
| **Her hesap en son ne zaman etkin oldu?** | `clock/{uid}` | `at` | Tam — her rolde (17.11.2026'da açıldı) |
| **Gerçek son giriş zamanı** | Firebase Auth | `lastSignInTime`, `lastRefreshTime` | Yalnızca sonuncu; `serviceAccountKey.json` gerekir |
| **Hangi ekranlar açılıyor, hangi reçeteye bakılıyor, uygulama kaç kez ve hangi saatte açılıyor?** | `kullanim/{storeId}_{gün}` | `acilis`, `saatler`, `ekran`, `recete` | **Mağaza düzeyinde** (kişiye bağlı değil); kural ve yeni sürüm dağıtılınca dolar |

## Bugün yanıtlanamayanlar — yeni kayıt ister

| Soru | Neden yanıtlanamıyor | Ne gerekir |
|---|---|---|
| **Giriş geçmişi** (kaç kez, hangi günlerde girdi) | `clock` ve Auth yalnızca *son* anı tutar; her raporda o günün fotoğrafı birikir ama geçmiş geriye dönük yoktur | Kişi bazlı günlük sayaç (KVKK onayı bekliyor) |
| **Kim** uygulamayı açtı ama hiçbir şey yapmadı | Mağaza sayacı kişiye bağlı değil; `clock` "açtı" der ama kaç kez demez | Kişi bazlı günlük sayaç (KVKK onayı bekliyor) |
| Ders ne kadar okundu, nerede bırakıldı | Sayaç ders ekranının açıldığını söyler, ne kadar okunduğunu söylemez | Ders içinde ilerleme ölçümü |
| PIN yanlış girildi mi, kaç kez | Başarısız giriş hiçbir yere yazılmaz | Firebase Auth olayları (Blaze) |
| Uygulama mı tarayıcı mı kullanılıyor | Yalnızca hata kaydında (`device`) var, yani hata olunca | Sayaca cihaz alanı eklemek |
| Yönetici panelinde hangi ekranlar kullanılıyor | Sayaç yalnızca mağaza oturumlarında çalışır | Sayacı panele de açmak |

Bu boşlukları kapatmanın yolları — çoğu bugünkü veriyle, yeni kayıt olmadan:
[KULLANIM-ONERILER.md](KULLANIM-ONERILER.md).

## Sınırlar

- **Geliştirici sayılmaz.** `users.role == 'developer'` olan hesap bütün sayımların
  dışında ([geliştirici görünmez](../README.md) kuralı).
- **Spark planı:** günde 50.000 okuma, 20.000 yazma. `npm run kullanim` bir
  çalıştırmada birkaç yüz belge okur; raporun sonunda gerçek sayı yazılır.
- **`clock` ve `kullanim` 17.11.2026'da eklendi.** `clock` zaten yazılıyordu, yalnızca
  okuma kuralı açıldı (yeni veri toplanmadı). `kullanim` yeni bir sayaçtır ama
  mağaza düzeyinde ve kişiye bağlı değildir. Kişi bazlı kayıt bilinçli olarak
  kapalı: `src/lib/kullanimKaydi.ts` içindeki `KISI_BAZLI` sabiti ve
  `firestore.rules` birlikte değişmeli, ikisi de KVKK metni onaylanmadan açılmamalı.
- **Sunucu kodu yok.** Toplama (aggregation) ve zamanlanmış iş yazılamaz; sayaç
  tutulacaksa istemci yazar, kurallar sınırlar.
- **KVKK.** Kişi bazında kullanım kaydı tutulacaksa aydınlatma metninde yer
  almalı: [KVKK-AYDINLATMA-TASLAK.md](KVKK-AYDINLATMA-TASLAK.md) (hukukçu onayı
  bekliyor). Bugünkü raporda kullanılan veriler zaten işin yürümesi için tutulan
  kayıtlar; yeni bir olay kaydı ayrı bir açıklama gerektirir.
