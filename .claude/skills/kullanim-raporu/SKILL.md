---
name: kullanim-raporu
description: 1401 Campus canlı kullanım raporunu çıkarır ve Türkçe özetler — hangi mağaza ve kişi uygulamayı kullanıyor, hangi ekranlar işliyor, nerede takılıyorlar, hangi saatlerde. "durum nedir?", "durum ne?", "kullanım nasıl?", "uygulama kullanılıyor mu?", "kimse giriyor mu?", "mağazalar ne yapıyor?" gibi sorulduğunda kullan. Yayın durumu (hangi kod nerede yayında) sorulursa bu değil, `npm run durum` kullanılır.
---

# 1401 Campus kullanım raporu

Amaç: kullanıcı "durum nedir?" dediğinde canlı kullanımı derleyip **kısa bir
Türkçe özet** vermek. Rapor `scripts/kullanim.mjs` tarafından çıkarılır; sen
raporu okuyup yorumlarsın.

## Hangi durum sorulduğunu ayırt et

- "durum nedir?", "kullanım nasıl?", "kimse kullanıyor mu?" → **bu skill**.
- "yayın durumu", "canlıda hangi sürüm var?", "her şey yerinde mi?" → `npm run durum`
  (ayrı komut, giriş istemez, sen çalıştırabilirsin).
- Tereddüt edersen bir cümleyle sor; ikisini birlikte çalıştırma.

## Adımlar

### 1. Bugünün raporu var mı?

```bash
ls -t kullanim-raporlari/ 2>/dev/null | head -3
```

Bugünün tarihli canlı raporu varsa (`<bugün>-canlı.md`) **yeniden çalıştırma**;
onu oku ve özetle. Kullanıcı "yeniden çıkar" ya da "güncelle" derse çalıştır.

### 2. Betiği kullanıcının terminal sekmesinde başlat

Komut canlı veriyi okumak için geliştirici girişi ister. **Şifreyi asla sen
girmezsin ve istemezsin.** `mcp__terminal__run_in_terminal` ile kullanıcının
terminal sekmesinde başlat; e-posta ve şifreyi kendisi yazar:

```bash
npm run kullanim -- --gun 7
```

- `cwd`: `/Users/kutays/Desktop/Projects/1401 Playbook` (mutlak yol).
- Node PATH'te olmayabilir: gerekirse `export PATH="$HOME/.local/node/bin:$PATH"` ekle.
- Kullanıcı başka bir dönem isterse `--gun 1` ya da `--gun 30`.
- Sekmeyi açtıktan sonra kullanıcıya tek satırla "terminal sekmesinde e-posta ve
  şifre bekliyor" de ve bitmesini bekle (`mcp__terminal__read_terminal`).
- Giriş başarısızsa aynı komutu tekrar başlat; şifreyi sorma, tahmin etme.

### 3. Raporu oku ve özetle

Betik `kullanim-raporlari/<tarih>-canlı.md` dosyasına yazar ve yolu basar. Oku,
sonra **8-12 satırlık** bir Türkçe özet ver. Sırası:

1. **Tek cümle hüküm:** uygulama tutuyor mu, tutmuyor mu.
2. **Kullanım sıklığı:** kaç mağazadan kaç kişi, PIN'lilerin yüzde kaçı.
3. **Ne yapıyorlar:** en çok hangi ekran/özellik (ders, sınav, talep, bülten).
4. **Nerede takılıyorlar:** hatalar, geri bildirimler, PIN sıfırlama,
   kullanılmayan davet kodları, bağlanmamış telefonlar — en can sıkıcı 2-3 tanesi.
5. **Saatler:** en yoğun saat aralığı, mesai dışı iz varsa söyle.
6. **Hiç kullanmayanlar:** sessiz mağaza ve kişi sayısı, adlarıyla (en çok 5).
   Raporda "uygulamayı açtı ama hiçbir şey yapmadı" satırı varsa mutlaka söyle:
   bu, giriş sonrası ekranın yol göstermediği anlamına gelir.
7. **Sadeleştirme:** raporun sonundaki "Bu hafta neyi sadeleştir" listesinden
   en değerli iki maddeyi aktar (terk oranı, ölü özellik, düzeltme oranı,
   tekrar eden iş, ders–sınav kaybı, ilk kullanım gecikmesi).
8. **Bir sonraki adım önerisi:** en çok bir ya da iki tane.

Özette ham tabloları tekrarlama; dosyayı okumak isteyene yolunu ver.

## Kurallar

- **Rapor yorumlanır, veri değiştirilmez.** Betik hiçbir şeye yazmaz; sen de yazma.
- **Sınav başarısı bu raporun konusu değil.** Soru "uygulama kullanılıyor mu,
  nerede zorlanıyorlar" sorusudur; puan ortalaması isteyen ayrıca sorar.
- **Geliştirici (Kutay) hiçbir sayıma girmez** — betik onu dışlar, sen de özette anma.
- Rapor dosyaları git'e girmez (`.gitignore`), mağaza ve kişi adları içerir;
  dışarıya gönderme.
- Giriş saatleri ve ekran gezinmesi canlıda kaydedilmiyor. Kullanıcı bunları
  sorarsa [docs/KULLANIM-VERISI.md](../../../docs/KULLANIM-VERISI.md) tablosunu
  göster; "giriş saati" diye raporun etkinlik saatlerini sunma, farkı söyle.
- Demoda deneme: `npm run kullanim -- --demo` (şifre sormaz, sen çalıştırabilirsin).
  Demo verisi uydurmadır; canlıyla karıştırma.
- Giriş istemeyen iki ek kip (sen çalıştırabilirsin, veritabanına bakmazlar):
  `npm run kullanim -- --trend` (eski raporlardan gidişat) ve
  `npm run kullanim -- --yedek-farki <eski.json> <yeni.json>` (iki yedek arası
  değişim — geriye dönük geçmiş).
- Rapordaki "Ekran kullanımı (mağaza sayacı)" bölümü boşsa sebebi yazılıdır
  (kural ya da sürüm dağıtılmamış). Kullanıcıya "ekran kullanımı bilinmiyor"
  derken bunu söyle, veri yok sanma.
- "Son girişler" iki kaynaktan gelir: `clock` belgeleri ve Firebase Auth.
  Auth kısmı `serviceAccountKey.json` varsa okunur; yoksa rapor nasıl
  alınacağını yazar.
- Hız şikâyeti varsa `docs/HIZ-BUTCESI.md` hedeflerine ve Performance
  Monitoring bağlantısına yönlendir.
