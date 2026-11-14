# 1401 Campus: yayın günü kontrol listesi

> **Yayın 14.11.2026'da yapıldı.** Güncel durum ve günlük kullanım için tek sayfa: [CANLI.md](CANLI.md). Canlı adres artık **https://1401-campus.web.app**; eski `playbook-1401.web.app` de aynı yayını açar. Bu dosya yayının nasıl yapıldığının kaydıdır.

Yayın: **16.11.2026 Pazartesi**. Canlı site: `playbook-1401.web.app`, bugün 7 Kasım sürümünde. Demo: `playbook-demo-1401.web.app`.

Bu listedeki her adımı **sen** başlatırsın. Canlıya dağıtım ve canlı içerik yükleme geri alınması zahmetli işlerdir; Claude bunları sen açıkça istemeden yapmaz.

Komutlar proje klasöründe çalışır: `cd ~/Desktop/Projects/1401\ Playbook`

## Durum: 14.11.2026 Cumartesi akşamı

Yayın, kullanıcının isteğiyle iki gün önce yapıldı. Aşağıdaki adımların çoğu **bitti**:

- [x] Soru bankasına 40 soru eklendi (toplam 1334). PR #5 `master`'a birleştirildi; `master` = canlıdaki kod.
- [x] Tip denetimi ve derleme temiz.
- [x] Demo güncellendi: site, kurallar ve müfredat.
- [x] Canlıya dağıtıldı (site, kurallar, indeksler). Sürüm **1.0.0 · 14.11 17:41**, sekme başlığı "1401 Campus".
- [x] Canlıda Müfredatı güncelle çalıştırıldı: 4 yol, 14 modül, 96 ders, 1334 soru. Eski kimlikli 311 soru silindi; silinen ders yok.
- [x] Yetkiler canlıda varsayılan. Demodaki iki elle değişiklik de varsayılan değerinde; ikisi aynı.
- [x] Canlı duman testi (panel): geri bildirim gönderildi, panelde göründü, Çözüldü yapıldı. Talepler, Görevler, Onaylar ve Mağazalar açılıyor.
- [x] Firebase konsolu: iki projenin adı "1401 Campus" / "1401 Campus Demo". Canlı uygulamanın takma adı "1401 Campus Web". E-posta şablon dili iki projede Türkçe.

**Kalanlar:**
- [ ] **E-posta şablon metni:** Firebase bu projede şablon düzenlemeyi kapatmış ("Email template updates are currently unavailable for this project"). Gönderen adı ve konu değiştirilemiyor. E-postadaki `%APP_NAME%` artık proje adından geliyor; bir şifre sıfırlama isteyip gelen e-postaya bak.
- [ ] **Yapay zekâ anahtarı:** Akademi → Yapay zekâ. Anahtarı yalnızca sen girersin.
- [ ] **Mağazalar ve ekip:** canlıda yalnızca Moda Cadde, 1 barista ve 1 yönetici (sen) var. Diğer mağazalar, Kahve Operasyonu hesapları ve barista davet kodları gerçek listeyle girilmeli.
- [ ] **APK bağlantısı:** Spark planı APK'yı sitede barındırmıyor. Herkese açık bir indirme yeri gerekiyor; seçenekler bölüm 5'te.
- [ ] **Telefonla son kontrol:** gerçek mağaza telefonunda eşleştirme, barista PIN girişi, ders, sınav, PIN'siz reçete. Barista PIN'ini Claude girmez.
- [ ] **iPhone:** `npm run iphone` için telefonun kabloyla bağlı olması gerekiyor.

---

## 0. Bir gün önce (Pazar)

- [ ] **Firebase konsolundaki adlar** (bkz. bölüm 6). İki projede de yap; e-postaların yayın sabahı doğru adla gitmesi için.
- [ ] **Hangi kod yayına çıkacak?** Bütün iş `yetki-talepler-rozetler` dalında ve PR #5 açık. Önerilen yol: PR #5'i `master`'a birleştir, yayını `master`'dan yap. Böylece "canlıda ne var" sorusunun cevabı her zaman `master` olur.
- [ ] **Demoda son tur:** `npm run deploy:demo` ile demoyu güncelle ve aşağıdaki "duman testi"ni demoda bir kez yap.
- [ ] **Yapay zekâ anahtarı:** Anthropic Console'da bu iş için ayrı bir anahtar aç ve **aylık harcama sınırı** koy. Anahtarı yayından sonra canlıda gireceksin (adım 3). Demoda da denemek istersen demoda da gir. Bugün "yapay zekâ desteği kapalı" uyarısının nedeni buydu: demoda anahtar hiç girilmemiş.

## 1. Kodu hazırla (Pazartesi sabah)

- [ ] Çalışma ağacı temiz mi: `git status`. `android/gradlew.bat` ve `scripts/source/aos-recipes.json` yalnızca satır sonu farkı; onları commit etme.
- [ ] Tip denetimi ve derleme:

```bash
npm run typecheck
```

```bash
npm run build
```

`npm run build` önce müfredatı üretir ve denetler (`npm run curriculum`), sonra `.env.production` ile `www/` klasörüne derler. Hata verirse dur, dağıtma.

## 2. Canlıya dağıt

- [ ] Firebase hesabı bu Mac'te bağlı değil, önce giriş yap. Tarayıcı açılır, Google hesabınla girersin:

```bash
firebase login
```

- [ ] Dağıt: site, Firestore kuralları ve indeksler. Spark planında sunucu fonksiyonu yok.

```bash
firebase deploy --only hosting,firestore --project playbook-1401
```

Bu sürümle kurallara gelenler:
- `hatalar` koleksiyonu (otomatik hata kaydı);
- "Kahve Operasyonu" rolünün yapay zekâ anahtarını okuyabilmesi.

## 3. İçerik ve ayarlar (canlı panel)

- [ ] `playbook-1401.web.app` → geliştirici hesabıyla gir.
- [ ] **Geri bildirim** ekranında "Açık olan sürüm: 1.0.0 · 16.11 …" yazmalı. Bu yazı yeni sürümün yayında olduğunu kanıtlar. Satırı yalnızca geliştirici görür.
- [ ] **Akademi → Müfredatı güncelle.** Derlenen paketteki müfredatı (dersler, reçeteler, soru bankası) canlı veritabanına yükler. Planı gösterir, onaylayınca yazar. Komut satırından aynı iş için: `node scripts/seed.mjs --production --content-only --email <yönetici e-postası> --password <şifre>`.
- [ ] **Akademi → Yapay zekâ** → anahtarı gir. "Dosyadan ders" PDF'leri Claude ile okusun diye.
- [ ] **Yetkiler** ekranında rollerin göreceği ekranlar demodakiyle aynı mı, bir bak.
- [ ] Mağazalar, Kahve Operasyonu hesapları ve davet kodları canlıda hazır mı: Mağazalar ve Baristalar ekranları.

## 4. Duman testi (canlıda, 10 dakika)

- [ ] Sekme başlığı ve ana ekran **1401 Campus** yazıyor.
- [ ] Mağaza telefonu eşleşiyor, "Kim çalışıyor?" listesi geliyor.
- [ ] Bir barista PIN'iyle giriyor, bir ders açıyor, bir sınava başlıyor.
- [ ] Reçeteler PIN'siz açılıyor.
- [ ] **Geri bildirim** gönder (deneme), panelde görünsün, "Çözüldü" diye işaretle.
- [ ] Panelde Talepler, Görevler ve Onaylar açılıyor.
- [ ] Şifre sıfırlama e-postası kendi adresine "1401 Campus" adıyla geliyor (bölüm 6'dan sonra).

Bir şey bozuksa **geri al**: Firebase konsolu → Hosting → Sürüm geçmişi (Release history) → önceki sürüm → "Geri al" (Rollback). Kurallar ayrı geri alınır: `git` ile önceki `firestore.rules` → `firebase deploy --only firestore --project playbook-1401`.

## 5. Telefonlar

**Android: APK 1.1** (`apk/1401-campus-1.1.apk`)
- Canlı adresi açar. Kod ve içerik siteden geldiği için bu yayın için **yeniden derlemek gerekmez**.
- [ ] APK'yı mağaza telefonuna aktar (Drive, USB ya da mesaj). "Bilinmeyen kaynaklardan yüklemeye izin ver"i aç ve kur.
- [ ] Telefonda 1.0 ("1401 Playbook") kuruluysa 1.1 onun üstüne kurulur; kurulmazsa önce eskisini kaldır.
- [ ] Uygulamayı aç, mağaza eşleştirme kodunu gir, bir barista girişi dene.
- **İndirme bağlantısı.** Kurulum sayfası hazır: `playbook-1401.web.app/indir/`. Sayfadaki "Uygulamayı indir" düğmesi APK'nın herkese açık adresine gitmeli; Spark planı APK'yı sitede barındırmıyor (`Executable files are forbidden`). Yollar:
  - **GitHub:** herkese açık ayrı bir depo (ör. `1401-campus-indir`), APK bir sürüm (release) eki olarak. Sabit bağlantı: `…/releases/latest/download/1401-campus.apk`.
  - **Google Drive:** APK'yı yükle, "Bağlantıya sahip olan herkes" diye paylaş.
  - Ardından `public/indir/index.html` içindeki düğmenin `href`'ini bu adresle değiştir ve canlıya dağıt.
- Yeniden derlemek gerekirse `npm run apk` kullan. Demo adresini açan test APK'sı için: `SUNUCU=demo npm run apk`.

**iPhone** (kabloyla, ücretsiz Apple hesabı)
- [ ] iPhone'u Mac'e bağla, kilidini aç, "Bu bilgisayara güven"i onayla:

```bash
npm run iphone
```

- Varsayılan canlı adrestir. Demo için: `SUNUCU=demo npm run iphone`.
- Ücretsiz hesapta imza **7 gün** geçerli. Uygulama açılmaz olunca aynı komutu yeniden çalıştır. İçerik güncellemeleri için yeniden kurmak gerekmez.

## 6. Firebase konsolu: "1401 Campus" adı (iki projede)

Kimlikler değişmez ve değişemez: `playbook-1401`, `playbook-demo-1401`, `*.web.app` adresleri, `com.coffee1401.playbook`. Değişen yalnızca görünen adlar. Kodda, `public/`'te, Android ve iOS'ta ad zaten "1401 Campus".

`console.firebase.google.com` → önce **playbook-1401**, sonra **playbook-demo-1401**:

1. **⚙ Proje ayarları → Genel**
   - **Proje adı** (Project name): `1401 Campus`. Demoda karışmasın diye `1401 Campus Demo`.
   - **Herkese açık ad** (Public-facing name): `1401 Campus`. Kullanıcıya giden e-postalarda `%APP_NAME%` bu addır; "şifre sıfırlama" e-postasının asıl düzeltmesi burası.
   - **Destek e-postası**: şirket adresi.
2. **Authentication → Şablonlar** (Templates)
   - Şablon dili: **Türkçe**.
   - **Şifre sıfırlama**: Gönderen adı `1401 Campus`. Konu, örneğin: `1401 Campus şifreni sıfırla`. Metinde `%APP_NAME%` kalabilir, Herkese açık ad'dan dolar.
   - Aynısını **E-posta adresi doğrulama** ve **E-posta adresi değişikliği** şablonlarında yap.
   - "İşlem URL'si"ne (Action URL) dokunma.
3. Kontrol: kendi adresine şifre sıfırlama iste. Gönderen ve konu "1401 Campus" olmalı.

İstersen Proje ayarları → Uygulamalarınız altındaki web uygulamasının takma adını da "1401 Campus" yap. Kullanıcı görmez, yalnızca konsolda düzen içindir.

## 7. Yayından sonra: hata ve öneri süreci

**Nereden toplanıyor**
- **Otomatik hata kaydı.** Çöken ekranlar ve yakalanmamış hatalar `hatalar` koleksiyonuna düşer. Panelde Geri bildirim → **Hatalar** sekmesinden yalnızca geliştirici görür. Kullanıcı çöken ekranda "Bir şeyler ters gitti" yazısını, "Yeniden yükle" ve "Bildir" düğmelerini görür.
- **Geri bildirim.** Herkes uygulamanın içinden "Bir şey çalışmıyor", "İçerikte yanlış var" ya da "Önerim var" diye yazar. Sınav sonucundaki "Bu soruda hata var" ve reçetedeki "Bu reçetede bir yanlış mı var?" de buraya düşer.

**Rapor**

```bash
npm run geri-bildirim -- --gun 1
```

Komut geliştirici e-postasını ve şifreni sorar (şifre ekranda görünmez). Canlıdaki son 1 günün geri bildirimlerini ve hatalarını `geri-bildirimler/<tarih>-canlı.md` dosyasına yazar. Bu klasör git'e girmez.
- İlk hafta **her gün**, sonra haftada bir.
- Demo için: `npm run geri-bildirim -- --demo`.

**Düzeltme akışı**
1. Raporu bir Claude oturumuna ver: "geri-bildirimler/…md'deki açık hataları düzelt".
2. Ayırım şöyle:
   - **Hata:** kodda düzelt.
   - **İçerik yanlışı:** panelde dersi ya da soruyu düzelt; kod gerekmez.
   - **Öneri:** önce öneri listesi olarak sana gelir, onaylarsan yapılır.
3. Düzeltme ayrı küçük bir dalda yapılır. Önce **demoya** gider (`npm run deploy:demo`); orada doğrula.
4. Sonra canlıya gider (adım 1-2). Her canlı yayında `package.json` sürümünü bir artır (1.0.0 → 1.0.1); hangi kaydın hangi sürümde geldiği panelde görünür.
5. Panelde bildirimi **Çözüldü** diye işaretle, nota "1.0.1'de düzeltildi" yaz. Raporun "çözülenler" bölümü bundan oluşur.
6. Ele alınan otomatik hata kayıtlarını Hatalar sekmesinde "Ele alındı, sil" ile temizle.
