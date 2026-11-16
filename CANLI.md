# 1401 Campus: canlı sistem, tek sayfa

| | |
|---|---|
| **Canlı adres** | https://1401-campus.web.app (eski `playbook-1401.web.app` de aynı yayını açar) |
| **Kurulum yönergesi** | https://1401-campus.web.app/indir/ |
| **Android uygulaması** | `apk/1401-campus-1.2.apk`: mesajla gönder. Canlı adresi açar. Herkese açık son sürüm: github.com/ksoybil-sketch/1401-campus-indir (releases/latest). |
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

## Ekibe yeni yönetici eklemek

Panel → Genel bakış → Kahve Operasyonu ekibi → **Ekle**. Uygulama geçici bir şifre üretir ve e-posta göndermez.
Çıkan pencerede adres, e-posta ve geçici şifre bir kez gösterilir: **Kopyala** deyip kişiye WhatsApp'tan ilet.
Kişi ilk girişte kendi şifresini belirlemeden panele geçemez. Herkes şifresini sonra panelde anahtar simgesinden değiştirebilir.

## Yedek

Spark planında otomatik yedek yok. **Haftada bir** al: panelde sol altta **Yedek al** (yalnızca geliştiricide görünür) dosyayı İndirilenler klasörüne indirir. Aynısı komutla da alınır (şifreni sorar, şifre ekranda görünmez):

```bash
npm run yedek
```

Dosya `yedekler/` klasörüne tarihli yazılır. Ayda bir OneDrive → `1401 Playbook Yedek` klasörüne kopyala.
Bir kayıt bozulursa Claude'a "şu kaydı yedekten geri getir" de: önce neyin değişeceğini gösterir, onayla yazar.

## Hata ve öneriler

- Uygulamadaki geri bildirimler ve otomatik hata kayıtları panelde **Geri bildirim** ekranında. Hatalar sekmesini yalnızca sen görürsün.
- Günlük ya da haftalık rapor için:

```bash
npm run geri-bildirim -- --gun 1
```

Raporu Claude'a ver: "bu raporun açık hatalarını düzelt".

## İlk hafta (16-23.11.2026)

- [ ] Her gün `npm run geri-bildirim -- --gun 1` raporunu Claude'a ver.
- [ ] Günlük okuma kotasına bak (`npm run durum` çıktısının sonundaki bağlantı). 50.000'in yarısını geçerse Claude'a söyle.
- [ ] Haftanın sonunda ilk `npm run yedek`.

## Açık kalanlar (16.11.2026)

- [ ] **Beyaz liste:** Şirket postası Firebase'in e-postalarını düşürüyor. Bilgi işlem / barındırma firmasından `noreply@playbook-1401.firebaseapp.com` adresini beyaz listeye almasını iste. Sonra kendi şirket adresinle giriş ekranında "Şifremi unuttum" de; e-posta gelirse işaretle. O zamana kadar "Şifremi unuttum" şirket adreslerinde çalışmayabilir; şifresini unutan yönetici olursa Claude'a söyle.

- [ ] **Yapay zekâ anahtarı:** API masrafı için önce Yönetim Kurulu onayı alınacak. Onaydan sonra canlı panelde Akademi → Yapay zekâ; anahtarı yalnızca sen girersin. O zamana kadar "Dosyadan ders" yapay zekâsız okur.
- [ ] **Gerçek mağazalar ve ekip:** liste hazır olunca canlı panelden eklenecek. Şu an canlıda yalnızca Moda Cadde ve 1 barista var.
- [ ] **Telefonla son kontrol:** gerçek mağaza telefonunda eşleştirme, barista PIN'i, bir ders, bir sınav.
- [ ] **E-posta konusu ve gönderen adı:** Firebase bu projede şablon düzenlemeyi kapatmış; e-postalardaki ad proje adından ("1401 Campus") gelir.

Ayrıntılı tarihçe: [YAYIN-GUNU.md](docs/YAYIN-GUNU.md).
