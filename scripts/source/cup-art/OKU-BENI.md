# Elle hazırlanmış bardak çizimleri

Bu klasöre bir `.svg` dosyası koyduğunda, o reçetenin bardak şeması
otomatik çizilmek yerine senin çiziminle gösterilir. Dosya adı dersin
kimliği olmalı:

```
r-caff-latte-8-oz-12-oz.svg
r-iced-latte-16-oz.svg
```

Kimliği bilmiyorsan aktarıcı betik söyler (aşağıya bak). Klasör boşsa
hiçbir şey değişmez — şemalar reçete verisinden üretilmeye devam eder,
yani çizimler parça parça da eklenebilir.

## Toplu aktarma

Çizimlerin hepsi tek bir HTML dosyasındaysa:

```bash
node scripts/import-cup-art.mjs ~/Downloads/cizimler.html          # önce dener, yazmaz
node scripts/import-cup-art.mjs ~/Downloads/cizimler.html --yaz    # yazar
npm run curriculum
```

Betik her `<svg>` için hangi reçeteye ait olduğunu bulmaya çalışır:
önce `data-recipe` özniteliği, sonra `id`, sonra çizimden hemen önceki
başlık metni. Eşleşmeyenleri ve çizimi gelmeyen reçeteleri raporlar.

Eşleşmeyen bir çizim varsa en kesin çözüm, HTML'de o etikete reçete
adını yazmak:

```html
<svg data-recipe="Caffè Latte" viewBox="0 0 150 215"> … </svg>
```

## Çizimden beklenenler

- **SVG olmalı.** Fotoğraf değil: şema koyu zeminde durur, ölçeklenir ve
  ders belgesine gömüldüğü için küçük kalmalıdır (tercihen 20 KB altı).
- **Yazı koymayın.** Malzeme adları ve ölçüler çizimin yanındaki listede
  zaten var; çizime de yazılınca ikisi çakışıyor.
- **Koyu zeminde okunmalı.** Arka plan `#100E0D`; saf siyah çizgiler
  kaybolur.
- Çizim `<img>` içinde gösterilir, yani içindeki betik ve dış bağlantı
  çalışmaz — bu bilinçli bir güvenlik kararıdır, panelden içerik giren
  bir hesabın uygulamaya kod sokmasını engeller.
