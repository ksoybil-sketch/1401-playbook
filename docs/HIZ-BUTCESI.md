# Hız bütçesi

Yavaş ekran, terk edilen ekrandır. Bu dosya hedefleri ve nereden ölçüldüğünü
tutar. **Bütçeyi aşan sürüm yayınlanmaz.**

## Hedefler

| Ne | Bütçe | Nereden ölçülür |
|---|---|---|
| Ekran açılışı (oturum hazır) | < 1 sn | `Açılış: oturum hazır` izi |
| Eğitim içeriğinin gelmesi | < 1,5 sn | `İçerik hazır` izi |
| Sınav başlatma | < 2 sn | `Sınav başlatma` izi |
| Sınav teslimi | < 2 sn | `Sınav teslimi` izi |
| Yoğun anda sınav başlatma (en yavaş %5) | < 5 sn | `scripts/yuk-testi/` |
| Liste kaydırma | takılmasız | elle, telefonda |

Bilinen son ölçüm (yük testi, 12 şube + 76 barista aynı anda):
sınav başlatma **4,5 sn**, teslim **3,4 sn** (en yavaş %5). Günlük kullanımda
bunun çok altında olması beklenir; gerçek sayılar artık Performance
Monitoring'de birikiyor.

## Nereden okunur

**Firebase Performance Monitoring** (Spark planında ücretsiz, Firestore
kotasına dokunmaz):
https://console.firebase.google.com/project/playbook-1401/performance

Kendiliğinden gelen: ekran yüklenme süresi, ağ isteklerinin süresi ve hata
oranı, cihaz ve ağ türüne göre dağılım.

Özel izler (`src/lib/perf.ts`): yukarıdaki tablodaki dört iz. Ölçüm noktaları
zaten vardı (`src/api/exam.ts` içindeki `stopwatch` çağrıları, demo kaydı
için); 17.11.2026'da aynı çağrılar Performance Monitoring'e de bağlandı — yeni
ölçüm noktası eklenmedi.

Her izin yanında adımlar ayrı ölçü (metric) olarak gider: sınav başlatmada
saat ölçümü, açık denemelerin okunması, soru havuzunun hazırlanması.

## Kişisel veri

Performance Monitoring kişi kimliği göndermez: süre, ekran yolu, cihaz ve ağ
türü. Veri, uygulamanın bütün verisini zaten işleyen Google'a gider — yeni bir
tarafa aktarım değil. Google Analytics ise kişi bazında davranış profili
kurduğu için ayrı değerlendirilir ve şimdilik eklenmedi
(bkz. [KULLANIM-ONERILER.md](KULLANIM-ONERILER.md)).

Geliştirmede ve emülatörde kapalı (`import.meta.env.DEV`, `USE_EMULATOR`).

## Sürüm öncesi kontrol

1. `npm run kullanim` raporundaki "Yarım kalan sınavlar" bölümüne bak: terk
   oranı ve süre aşımı yükseldiyse hız şüphelisi.
2. Performance Monitoring'de dört izin medyanı ve 95. yüzdeliği bütçenin
   içinde mi?
3. Büyük bir değişiklikten sonra `scripts/yuk-testi/` yeniden koşturulur ve
   yukarıdaki "bilinen son ölçüm" satırı güncellenir.
