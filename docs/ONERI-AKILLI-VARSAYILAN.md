# Öneri: akıllı varsayılanlar (onay bekliyor)

**Hiçbiri uygulanmadı.** Her biri kullanıcının gördüğü akışı değiştirir, o
yüzden önce öneri olarak duruyor.

Fikir basit: bir formda en sık seçilen seçenek **önceden seçili** gelirse her
doldurma bir dokunuş kısalır. Hangi seçeneğin en sık seçildiği bugünkü veride
var — `npm run kullanim` raporunun "Ölü özellik avı" bölümü talep
kategorilerinin, bülten türlerinin ve acil işaretinin dağılımını yazıyor.

İlgili: [DENETIM-DOKUNUS.md](DENETIM-DOKUNUS.md) (hangi iş kaç dokunuş),
[KULLANIM-ONERILER.md](KULLANIM-ONERILER.md).

## Nerede varsayılan var, ne yapılabilir

| Yer | Bugünkü varsayılan | Öneri |
|---|---|---|
| Barista talep formu, kategori<br>`src/features/barista/RequestsPage.tsx:106` | sabit `'ariza'` | 17.11.2026'da liste üçe indi (arıza, servis, ekipman); üç seçenekte varsayılanı veriden türetmenin kazancı küçüldü. `'ariza'` kalabilir. |
| Barista talep formu, öncelik<br>`RequestsPage.tsx:107` | sabit `'normal'` | Doğru varsayılan; **değiştirmeyin.** Rapor "her talep acil işaretlenmiş" derse sorun varsayılanda değil, ayrımın anlamındadır. |
| Panel talep listesi, kategori süzgeci<br>`src/features/staff/RequestsPage.tsx:44` | `''` (hepsi) | Doğru; süzgeç boş başlamalı. |
| Görev atama, tür<br>`src/features/shared/AssignSheet.tsx:31` | sabit `'module'` | En çok açılan görev türü. Rapordaki `assignments` dağılımına bakılır. |
| Yeni ürün, bülten türü<br>`src/features/staff/NewProductPage.tsx:62` | sabit `'kampanya'` | Yeni ürün akışında `'kampanya'` zaten doğru; dokunulmasın. |
| Reçete arama<br>`src/features/barista/RecipesPage.tsx` | boş, klavye açılır | **En değerli madde:** "son baktığın reçeteler" çipleri. Veri telefonda zaten var; klavye hiç açılmadan tek dokunuşla reçeteye gidilir. Mağaza sayacı dolunca en çok bakılan reçeteler de çip olabilir. |
| Sınav modülü seçimi | kullanıcı seçer | Baristanın **sırada bekleyen** modülü önce gelsin (önkoşulu geçilmiş, henüz geçilmemiş ilk modül). |
| Mağaza seçimi (panel) | kullanıcı seçer | Bölge müdürünün alanındaki tek mağaza varsa önceden seçili gelsin. |

## Hangi kategorinin "en sık" olduğunu nereden alacağız

İki yol var, ikincisi önerilir:

1. **Koda gömmek:** raporu okuyup varsayılanı elle değiştirmek. Basit ama her
   mevsim değişir ve unutulur.
2. **Mağazanın kendi geçmişinden okumak:** talep formu açılırken o mağazanın
   son taleplerine bakılır (zaten okunuyor — `requests` listesi mağaza
   oturumunda açık). En çok geçen kategori varsayılan olur. Ek okuma
   gerektirmez, mevsimle kendiliğinden güncellenir.

İkincisi aynı zamanda daha dürüst: kodda bir mağazanın alışkanlığını bütün
zincire dayatmayız.

## Dikkat

- **Varsayılan, zorlama değildir.** Önceden seçili seçenek görünür ve tek
  dokunuşla değiştirilebilir olmalı; gizli bir ön seçim yanlış kayda yol açar.
- **Öncelik ve red nedeni gibi alanlarda varsayılan olmasın.** "Acil" ya da
  "gereksiz" gibi sonuç doğuran seçimler bilinçli yapılmalı.
- Talep reddinde neden + açıklama zorunluluğu, PIN'in dört hanesi, sınav
  başlatma onayı ve kişi seçimi **kısaltılmamalı** — gerekçeleri
  [DENETIM-DOKUNUS.md](DENETIM-DOKUNUS.md) içinde.

## Sıra önerisi

1. Reçete çipleri (en sık iş, en büyük kazanç, davranış riski düşük).
2. Talep kategorisinin mağaza geçmişinden gelmesi.
3. Sınavda sırada bekleyen modülün önce gelmesi.
4. Görev türü varsayılanı.
