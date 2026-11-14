# 1401 Campus: canlı sistem, tek sayfa

| | |
|---|---|
| **Canlı adres** | https://1401-campus.web.app (eski `playbook-1401.web.app` de aynı yayını açar) |
| **Kurulum yönergesi** | https://1401-campus.web.app/indir/ |
| **Android uygulaması** | `apk/1401-campus-1.1.apk`: mesajla gönder. Canlı adresi açar. |
| **iPhone** | Telefonu kabloyla bağla, `npm run iphone`. Ücretsiz Apple hesabında 7 günde bir yenilenir. |
| **Demo (deneme alanı)** | https://playbook-demo-1401.web.app |

## Her şey yerinde mi? Tek komut

```bash
npm run durum
```

Dört satırın hepsi ✓ ise canlı, demo, GitHub ve bu bilgisayar aynı koddadır.
Yayından sonra ya da içinin rahat etmesi gerektiğinde çalıştır.

## Neyin nerede durduğu

- **Kod ve içerik** (dersler, reçeteler, sorular, ekranlar, kurallar): GitHub'daki `master`. Demo ve canlı buradan dağıtılır. İkisi aynı kodu çalıştırır.
- **Kayıtlar** (mağazalar, baristalar, sınav sonuçları, bültenler, rozet ayarları): her ortamın kendi veritabanında. **Demoya girilen kayıt canlıya geçmez**, demo deneme alanıdır.
- Buradan iki kural çıkar:
  - Ders, reçete ya da soru değişecekse Claude'a söyle. Kodda değişir, iki ortama da aynı gider.
  - Gerçek mağaza, ekip, barista ya da bülten **yalnızca canlı panelde** girilir.

## Bir değişiklik canlıya nasıl çıkar

1. Claude'a ne istediğini söyle.
2. Değişiklik önce demoya gider. Orada dene.
3. "Canlıya al" de. Claude şu işleri yapar:
   - değişikliği `master`'a birleştirir;
   - canlıya dağıtır;
   - içerik değiştiyse canlı panelde **Akademi → Müfredatı güncelle**'yi çalıştırır.
4. `npm run durum` ile dört ✓'yi gör.

## Hata ve öneriler

- Uygulamadaki geri bildirimler ve otomatik hata kayıtları panelde **Geri bildirim** ekranında. Hatalar sekmesini yalnızca sen görürsün.
- Günlük ya da haftalık rapor için:

```bash
npm run geri-bildirim -- --gun 1
```

Raporu Claude'a ver: "bu raporun açık hatalarını düzelt".

## Açık kalanlar (14.11.2026)

- [ ] **Yapay zekâ anahtarı:** API masrafı için önce Yönetim Kurulu onayı alınacak. Onaydan sonra canlı panelde Akademi → Yapay zekâ; anahtarı yalnızca sen girersin. O zamana kadar "Dosyadan ders" yapay zekâsız okur.
- [ ] **Gerçek mağazalar ve ekip:** liste hazır olunca canlı panelden eklenecek. Şu an canlıda yalnızca Moda Cadde ve 1 barista var.
- [ ] **Telefonla son kontrol:** gerçek mağaza telefonunda eşleştirme, barista PIN'i, bir ders, bir sınav.
- [ ] **E-posta konusu ve gönderen adı:** Firebase bu projede şablon düzenlemeyi kapatmış; e-postalardaki ad proje adından ("1401 Campus") gelir.

Ayrıntılı tarihçe: [YAYIN-GUNU.md](YAYIN-GUNU.md).
