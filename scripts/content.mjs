/**
 * 1401 Playbook — başlangıç müfredatı.
 *
 * Kaynaklar (hepsi 1401 Coffee'nin kendi materyalleri):
 *  - 1401 İşletme Manueli (İşletme Standartları Coffee Shop.pdf, 2025)
 *  - PERSONEL EĞİTİM KONULARI.docx
 *  - 1401 Yeni Menü Reçeteleri 2026 (67 reçete, 9 kategori)
 *  - 1401 AOS soru bankası (73 soru)
 *
 * Bu dosya yalnızca ilk yükleme içindir; sonrasında içerik uygulamadaki
 * İçerik editöründen yönetilir.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { QUESTION_BANKS } from './source/aos-questions.ts';

const here = dirname(fileURLToPath(import.meta.url));
/** 2026 yeni sezon menüsü — 1401Coffee_2026_N.html'den çıkarıldı (extract-2026.mjs). */
const RECIPES = JSON.parse(readFileSync(join(here, 'source/recipes-2026.json'), 'utf8'));

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const H = (text) => ({ type: 'heading', text });
const P = (text) => ({ type: 'text', text });
const TIP = (text) => ({ type: 'tip', text });
const WARN = (text) => ({ type: 'warning', text });
const STEPS = (...items) => ({ type: 'steps', items });
const SPEC = (rows) => ({ type: 'spec', rows: rows.map(([label, value]) => ({ label, value })) });
const CHECK = (prompt, options, answer, explanation) => ({ type: 'check', prompt, options, answer, explanation });
const IMG = (url, caption) => ({ type: 'image', url, caption });

/**
 * Ürün fotoğrafları.
 *
 * Spark planında Firebase Storage yok, bu yüzden görseller derse gömülü
 * data URL olarak taşınır (Firestore belge sınırı 1 MiB; en büyüğü 41 KB).
 * Kaynak dosyalar scripts/source/photos altında, saydam arka planlı WebP.
 */
const photoCache = new Map();
function photo(name) {
  if (!photoCache.has(name)) {
    const file = join(here, `source/photos/${name}.webp`);
    photoCache.set(name, `data:image/webp;base64,${readFileSync(file).toString('base64')}`);
  }
  return photoCache.get(name);
}

/**
 * Hangi reçete dersine hangi fotoğraf gider. Menü çekiminden gelen
 * dosyalarda üç birebir kopya vardı (americano=filtre kahve,
 * caramel macchiato=salted caramel, cortado=latte); her görsel yalnızca
 * gerçekten ait olduğu derste kullanılıyor — yanlış referans fotoğraf,
 * fotoğrafsız dersten daha kötüdür.
 */
const LESSON_PHOTOS = {
  'r-caff-americano-8-oz-12-oz': 'americano',
  'r-caff-latte-8-oz-12-oz': 'latte',
  'r-flat-white-8-oz-12-oz': 'flatwhite',
  'r-caff-mocha-8-oz-12-oz': 'mocha',
  'r-white-chocolate-mocha-8-oz-12-oz': 'whitemocha',
  'r-caramel-macchiato-8-oz-12-oz': 'caramelmacchiato',
  'r-toffee-nut-latte-8-oz-12-oz': 'toffeenut',
  'r-pumpkin-spice-latte-8-oz-12-oz': 'pumpkin',
  'r-gingerbread-latte-8-oz-12-oz': 'gingerbread',
  'r-chestnut-latte-kestaneli-8-oz-12-oz': 'kestaneli',
  'r-burnt-popcorn-latte-8-oz-12-oz': 'popcorn',
  'r-lotus-biscoff-latte-8-oz-12-oz': 'lotus',
  'r-spanish-latte-8-oz-12-oz': 'spanish',
  'r-matcha-latte-8-oz-12-oz': 'matcha',
  'r-cranberry-hibiscus-16-oz': 'cranberry',
  'r-chilly-passion-acili-carkifelek-16-oz': 'chillypassion',
  'r-kuzu-kulagi-mix-16-oz': 'kuzukulagi'
};

/** Soru: ilk seçenek doğru cevaptır (sınavda sunucu karıştırır). */
const Q = (prompt, correct, wrong, explanation) => ({ type: 'single', prompt, options: [correct, ...wrong], answer: 0, explanation });
const TF = (prompt, isTrue, explanation) => ({ type: 'truefalse', prompt, options: ['Doğru', 'Yanlış'], answer: isTrue ? 0 : 1, explanation });

/**
 * AOS soru bankasından gelen 73 sorunun hiçbirinde açıklama yoktu (AOS'un
 * kendi tipinde bu alan hiç tanımlı değildi). Her biri için, doğru cevabı
 * tekrar etmek yerine ALTINDAKİ İLKEYİ anlatan birer açıklama — araştırma
 * (Butler ve ark. 2013) açıklamalı geri bildirimin asıl faydasının aynı
 * soruyu ezberlemek değil, öğrenileni YENİ bir duruma aktarabilmek
 * olduğunu gösteriyor; bu yüzden her açıklama "neden" sorusuna cevap verir.
 */
const AOS_EXPLANATIONS = {
  'sales-1': 'Önerili satış, misafirin henüz fark etmediği bir ihtiyacı keşfetmesine yardım etmektir; agresif satış değildir. İki türü var: tamamlayıcı (yanına bir şey ekle) ve yükseltme (aynı üründen daha iyisi). Amaç her zaman misafire değer katmaktır, ciro bunun bir sonucudur.',
  'sales-2': 'Lattenin yanına cheesecake önermek, ana ürünle uyumlu İKİNCİ bir ürün eklemektir — bu tamamlayıcı satıştır (cross-sell). Yükseltme satışından farkı: ürün değişmiyor, yanına bir şey ekleniyor.',
  'sales-3': 'Double shot önerisi aynı ürünün (kahve) daha üst bir versiyonunu sunar — bu yükseltme satışıdır (up-sell). Cross-sell\'den farkı: misafir hâlâ aynı kategoride kalır, sadece daha iyisini alır.',
  'sales-4': '"Şefin önerisi" ya da "popüler seçim" gibi ifadeler misafire güven verir çünkü karar baskısı hissettirmez, bir tavsiye gibi gelir. Israrla tekrar önermek ya da misafiri dinlemeden siparişe eklemek tam tersi etki yapar, misafiri rahatsız eder.',
  'sales-5': 'Açık uçlu sorular ("Ne tür bir şey istersiniz?") misafirin gerçek ihtiyacını ortaya çıkarır; evet/hayır soruları ("Tatlı ister misiniz?") hızlı bir "hayır" almayı kolaylaştırır. Doğru soru, doğru öneriyi mümkün kılar.',
  'sales-6': 'Sadık bir misafir sadece kendisi tekrar gelmekle kalmaz, çevresine de tavsiye eder — bu bedava ve güvenilir bir pazarlamadır. Bir şubenin en güçlü büyüme kaynağı reklam değil, memnun misafirin ağzından çıkan sözdür.',
  'sales-7': 'Kapıdan giren HER misafire aynı sıcaklıkta "Hoş geldiniz" demek, günün yoğunluğundan ya da misafirin tanıdık olup olmamasından bağımsız bir standarttır — tutarlılık, misafirin her ziyarette aynı deneyimi bulacağını bilmesini sağlar.',
  'sales-8': 'Bir misafirin sabit tercihini ("şekersiz yulaf sütlü latte") hatırlamak ona özel olduğunu hissettirir — bu kişiselleştirilmiş hizmettir. Siparişi almak işin başlangıcı, misafiri TANIMAK sadakati kalıcı kılan şeydir.',
  'sales-9': 'Bar ve servis ekibi arasındaki iletişim ne kadar hızlıysa sipariş o kadar hızlı misafire ulaşır — servis hızı bireysel değil, takım performansıdır. Bir halkadaki gecikme tüm zinciri yavaşlatır.',
  'sales-10': '1401 İmzası; temiz fincan, doğru servis sıcaklığı ve lekesiz camlar gibi HER ziyarette aynı kalması gereken küçük ama kritik detaylardır. "En pahalı ürünü önermek" bunlardan biri değildir çünkü bu bir satış taktiğidir, bir kalite standardı değil.',
  'sales-11': 'Misafir bardağı eline almadan önce önce GÖRÜR — köpüğün kıvamı, tatmadan oluşan ilk izlenimi belirler. Lezzet doğru olsa bile kötü görünen bir sunum memnuniyeti baştan zedeler.',
  'sales-12': '"Her şey arzu ettiğiniz gibi mi?" nötr ve davetkârdır; misafiri suçlama ya da savunma pozisyonuna sokmaz. "Beğenmediniz mi?" gibi olumsuz çerçeveli sorular, misafiri rahatsız olmadığı hâlde bile tedirgin edebilir.',
  'sales-13': 'Yoğun saatte herkesin sadece kendi görevine odaklanması kuyruğu büyütür; takım mantığıyla birbirinin açığını kapatmak hızı korur. İyi bir ekip, kimin ne iş yaptığından önce misafirin beklemediğinden emin olur.',
  'sales-14': "1401'in barista rehberinde dört satış stratejisi tanımlanır: tamamlayıcı satış, yükseltme satışı, yeni ürün tanıtımı ve kampanya/bonus gücü. Her biri farklı bir anda, farklı bir amaçla kullanılır.",
  'sales-15': '"Bugün menüye yeni eklenen spesiyalimiz çok popüler!" merak uyandırır ve sosyal kanıt kullanır (başkaları da beğeniyor); baskıcı ifadeler ("almazsanız pişman olursunuz") misafiri rahatsız eder ve güven kaybettirir.',
  'sales-16': 'Gülümseme, dik duruş ve göz teması sözsüz bir "seni önemsiyorum" mesajıdır — misafir cümleleri duymadan önce bu sinyalleri alır ve ona göre güven duyar ya da duymaz.',
  'sales-17': 'Satış oranlarını takip etmenin amacı cezalandırmak değil, gelişimi görünür kılmaktır — başarıyı birlikte kutlamak ve düzenli geri bildirim vermek motivasyonu artırır; herkesin önünde eleştirmek tam tersi etki yapar.',
  'sales-18': 'Bir misafirin aceleci mi, sakin mi, üzgün mü olduğunu anlayıp ona göre yaklaşmak empati kurmaktır — aynı cümle, farklı ruh hâlindeki iki misafire farklı etki yapar.',

  'complaints-1': 'Şikayet yönetiminin sırası önemlidir: önce DİNLE (sözünü kesme), sonra EMPATİ kur, TEŞEKKÜR et (bildirdiği için), ÖZÜR dile, en son ÇÖZÜM sun. Sıra bozulursa — örneğin dinlemeden çözüm sunmak — misafir kendini duyulmamış hisseder.',
  'complaints-2': '"Sizi çok iyi anlıyorum" misafirin duygusunu onayladığını gösterir — bu empati adımıdır, henüz çözüm ya da özür değildir. Empati, misafire "yalnız değilsin, seni duyuyorum" der.',
  'complaints-3': 'Misafiri suçlamak ya da "bizde hata olmaz" demek savunmacı bir tavırdır ve şikayeti büyütür. Dinlemek, özür dilemek ve hızlı çözüm üretmek doğru tepkilerdir — bunların tam tersi yanlış olanı belirler.',
  'complaints-4': 'Kalite şikayetinde ürün SORGUSUZ geri alınır ve hemen yenisi hazırlanır — misafiri ikna etmeye çalışmak ya da onay beklemek güveni zedeler. Hız ve koşulsuzluk, misafire ciddiye alındığını gösterir.',
  'complaints-5': 'Demleme gerektirmeyen içecekler (soğuk hazırlananlar, hazır içecekler) en geç 2 dakikada hazır olmalıdır — bu standart, gecikme şikayetlerinde "ne kadar beklemesi gerekiyordu" sorusunun cevabıdır.',
  'complaints-6': 'Demleme gerektiren içecekler (espresso bazlı, filtre kahve) en geç 5 dakikada hazır olmalıdır. Bu süre aşılırsa, misafire bu gecikmeyi fark etmeden bekletildiği hissini vermemek için bilgilendirme ve özür önemlidir.',
  'complaints-7': 'Küçük çaplı bir şikayetin ÇÖZÜMÜNDEN bar personeli (barista) sorumludur — her şey için yöneticiyi beklemek gecikmeye ve misafirin daha da rahatsız olmasına yol açar. Barista kendi yetkisindeki sorunu kendi çözer.',
  'complaints-8': 'Şikayet büyümeye başladığında barista durumu derhal vardiyadaki yöneticiye iletir ve devreder — misafirle tartışmak ya da kendi başına söz vermek, karşılayamayacağı bir taahhüde girmesine yol açabilir.',
  'complaints-9': 'İndirim ve ikram yetkisi yalnızca Şube Yöneticileri ve Operasyon Müdürü\'ndedir — bu, kontrolsüz indirimlerin işletmeye maliyetini önler. Barista bu yetkiyi kullanamaz, durumu yöneticiye taşır.',
  'complaints-10': 'Öfkeli bir misafire sakin kalıp durumu tırmandırmadan yaklaşmak, aynı üslupla karşılık vermekten çok daha etkilidir — öfkeye öfkeyle karşılık vermek durumu daima kötüleştirir, asla düzeltmez.',
  'complaints-11': 'Çözüm sunulduktan 5 dakika sonra masaya uğrayıp "Yeni kahveniz nasıl oldu?" diye sormak, misafire gerçekten önemsendiğini gösterir — bu küçük jest bir şikayeti olumlu bir anıya çevirebilir.',
  'complaints-12': 'Yöneticiler maliyeti belirsiz taahhütlerde bulunmamalıdır ("biz karşılarız" gibi) — bu, işletmeyi önceden onaylanmamış bir maliyete sokabilir. Telafi her zaman makul ve ölçülü olmalıdır (kuru temizleme bedeli gibi).',
  'complaints-13': 'Ürün stokta yoksa özür dilenip alternatif önerilir — "o ürün hiç yok" deyip konuyu kapatmak misafiri çözümsüz bırakır, oysa doğru alternatif önerisi hayal kırıklığını fırsata çevirebilir.',
  'complaints-14': 'Şikayetler yazılı olarak kaydedilip ekibe raporlanmalıdır — sadece sözlü aktarım unutulur ve aynı hata tekrarlanır. Yazılı kayıt, şubenin aynı sorunu tekrar tekrar yaşamasını önler.',
  'complaints-15': 'Çözülen bir şikayet sonrası küçük bir ikram (kurabiye, çikolata) misafire "bu olay bizim için de önemliydi" mesajı verir — maliyeti düşük ama etkisi yüksek bir jesttir.',
  'complaints-16': 'Ekip arasında kriz senaryolarını canlandırmak (role-play), gerçek bir şikayet anında doğru tepkiyi otomatik hâle getirir — pratik yapılmış bir tepki, panikle verilen bir tepkiden çok daha hızlı ve doğrudur.',

  'logistics-1': "FIFO (First In, First Out) = ilk giren ürün ilk çıkar. Depoya önce giren ürün SKT'si daha yakın olduğu için önce kullanılmalıdır — aksi hâlde eski ürünler arkada unutulup son kullanma tarihini geçirir.",
  'logistics-2': 'Süt ve süt ürünleri 0-4°C arasında saklanır — bu aralığın dışına çıkmak hem lezzeti hem güvenliği riske atar; çok soğuk donmaya, yetersiz soğuk bozulmaya yol açar.',
  'logistics-3': 'Yırtık ya da sızdıran ambalajlı ürün teslim ALINMAZ — hasar, içeriğin kontamine ya da bozulmuş olabileceği anlamına gelir; "sonra düzeltiriz" riski göze alınmaz.',
  'logistics-4': "Kahve çekirdeği serin, kuru, güneş almayan, hava almayan valfli kapta saklanır — ışık ve nem çekirdeğin aromasını hızla bozar; valf, içeride oluşan gazın çıkmasına izin verirken dışarıdan hava almasını engeller.",
  'logistics-5': 'Gıda ürünleri ile temizlik kimyasalları KESİNLİKLE ayrı alanlarda tutulur — yan yana durmaları bile bulaşma riski taşır; bu gıda güvenliğinin en temel kurallarından biridir.',
  'logistics-6': "Açılan her şurup veya süt paketinin üzerine açılış tarihi yazılır — bu olmadan bir ürünün ne zaman açıldığını ve hâlâ güvenli olup olmadığını kimse bilemez.",
  'logistics-7': 'Bitkisel ve hayvansal sütler ayrı alanlarda saklanır — hem çapraz bulaşmayı (alerjen açısından) önler hem de birbirine karışmalarını engeller.',
  'logistics-8': 'Kuru gıdaların zeminle doğrudan teması KESİNLİKLE yasaktır, palet kullanılır — zemin nem ve kir taşır; palet ürünü hem nemden hem haşereden uzak tutar.',
  'logistics-9': 'Donuk ürünler +4°C dolaba alındıktan sonra 3 gün içinde tüketilmelidir — bu süre, ürünün tazeliğini kaybetmeden güvenle kullanılabileceği üst sınırdır.',
  'logistics-10': 'Hiçbir gıda ürünü ikinci kez dondurulamaz — çözülme sırasında üreyen bakteriler tekrar dondurmayla yok olmaz, sadece "uyur"; tekrar çözüldüğünde risk katlanarak artar.',
  'logistics-11': "Donuk ürün çözdürme işlemi yalnızca +5°C'deki buzdolabında yapılır — oda sıcaklığında ya da sıcak suda çözdürmek, ürünün dış yüzeyinin bakteri üremesi için tehlikeli bir sıcaklığa uzun süre maruz kalmasına yol açar.",
  'logistics-12': 'Depoda dökülen toz ya da sıvı ürün ANINDA temizlenir — bekletilen dökülme hem kayma riski hem haşere çekme riski taşır.',
  'logistics-13': 'Kritik seviyeye düşen malzeme ANINDA sipariş edilir — "bitene kadar beklemek" o ürünün olmadığı bir günü garantiler; proaktif sipariş stok-dışı kalmayı önler.',
  'logistics-14': 'Kullanılamaz hâle gelen hammaddeler fire sistemine İŞLENEREK kayıt altına alınır — kayıtsız atılan ürün, hem maliyet takibini hem tekrarlayan kayıpların fark edilmesini imkânsız kılar.',
  'logistics-15': 'Depoda kategori ayrımı (kahve, süt, kuru gıda, temizlik) kolay erişim, düzen ve hijyen sağlar — karışık bir depoda ürün bulmak zaman kaybettirir ve yanlış ürün kullanımına yol açabilir.',
  'logistics-16': 'Haftalık/günlük stok kontrolleri, eksik ürünleri ERKEN fark edip zamanında sipariş vermeyi sağlar — kontrol atlanırsa eksiklik ancak ürün tükendiğinde, yani çok geç fark edilir.',
  'logistics-17': 'Soğuk zincirin kırılması (ürünün gerekli sıcaklığın dışına çıkması) hem lezzet kaybına hem sağlık risklerine yol açar — bir kez kırılan soğuk zincir geri alınamaz, ürün güvenilirliğini kaybeder.',
  'logistics-18': "Tedarikçilerden akşam 17:30'dan sonra mal teslim alınmaz — bu kural, kontrolün (SKT, sıcaklık, ambalaj) günün yorgunluğunda eksik yapılmasını önler.",

  'operations-1': 'Göz seviyesi kuralı: en çok satan ve öne çıkarılmak istenen ürünler misafirin göz hizasına konur — insan gözü doğal olarak önce kendi boy hizasındaki rafı tarar, bu yüzden o raf en değerli reklam alanıdır.',
  'operations-2': 'Facing tekniği, ürünlerin etiketi dışa dönük ve raf dolu GÖRÜNECEK şekilde dizilmesidir — düzenli ve dolu bir raf, misafire "bu ürün taze ve popüler" mesajı verir.',
  'operations-3': "Dağınık bir vitrin veya eksik etiketli ürünler satışı %40'a kadar düşürebilir — görsel düzensizlik misafirin bilinçaltında \"ihmal edilmiş\" izlenimi bırakır, bu da güveni azaltır.",
  'operations-4': 'Şube alarm şifresini yalnızca yöneticiler bilir — bu, güvenliğin kaç kişiye emanet edildiğini sınırlı tutar; şifre çok kişiyle paylaşılırsa kontrolü kaybetmek kolaylaşır.',
  'operations-5': "Kruvasan çeşitleri 180°C'de 20 dakika pişirilir — bu standart sıcaklık/süre, her şubede aynı kıvam ve rengin çıkmasını garanti eder; farklı ayar farklı sonuç demektir.",
  'operations-6': 'Fırından çıkan kruvasan teşhire konmadan önce 4 dakika dinlendirilir — sıcak ürün doğrudan teşhire konursa buharı dolap içinde yoğunlaşıp hem ürünü hem komşu ürünleri nemlendirir.',
  'operations-7': "Soğuyan kruvasan serviste mikrodalgada 45 saniye, 200°C'de ısıtılır — bu kesin ölçü, ürünün ne yanmasını ne de soğuk kalmasını sağlar; standart olmadan herkes farklı süre dener.",
  'operations-8': 'Kapanışta buzdolapları, derin dondurucular ve soğuk oda ÇALIŞIR durumda bırakılır — kapatılırsa içindeki tüm stok birkaç saat içinde bozulur. Klima gibi gıda güvenliğiyle ilgisi olmayan ama çok enerji tüketen cihazlar kapatılır.',
  'operations-9': 'SKT\'si dolmuş ürün sisteme ZAYİ kaydı yapılarak çöpe atılır — kayıtsız atmak, o maliyetin nereye gittiğinin hiç görünmemesi, dolayısıyla tekrarlayan kaybın fark edilmemesi demektir.',
  'operations-10': 'Personelin günlük içecek hakkı 3 adettir: kahve, limonata ve çay — bu sınır hem personel memnuniyetini sağlar hem maliyetin kontrolsüz büyümesini önler.',
  'operations-11': 'KerzzPOS\'a herkes YALNIZCA kendi şifresiyle girer — ortak şifre kullanmak hangi işlemi kimin yaptığını belirsizleştirir; bu hem hesap verebilirliği hem hata takibini imkânsız kılar.',
  'operations-12': 'Mesai saatinde şube sınırları içinde şahsi telefon görüşmesi yapılamaz; zorunlu durumda izinle dışarıda yapılabilir — bu kural, misafirin barista ile değil telefonla ilgilenen bir personel görmesini önler.',
  'operations-13': 'İş kıyafetleriyle şube dışına çıkılmaz ve işe bu kıyafetle gelinmez — kıyafet markayı temsil eder; dışarıda görülmesi markanın kontrolsüz bir ortamda temsil edilmesi demektir.',
  'operations-14': 'Personel iş esnasında isimlik takmak zorundadır — isimlik, misafire kiminle konuştuğunu bilme ve kişisel bir bağ kurma imkânı verir.',
  'operations-15': 'Buz makinesi HER GECE temizlenir — buz su kaynaklı olduğu için bakteri üremesine en açık ekipmanlardan biridir; günlük temizlik bu riski sıfıra yakın tutar.',
  'operations-16': 'Espresso makinesinin süt köpürtme çubukları Pully Milk ile temizlenir — süt kalıntısı hem bakteri üretir hem bir sonraki içeceğe koku/tat bulaşmasına yol açar.',
  'operations-17': "Kahve öğütücüler haftada bir Pully Grind ile detaylı temizlenir — çekirdek yağı zamanla öğütücüde birikir ve eski kahvenin acı tadını yeni öğütülen kahveye karıştırır.",
  'operations-18': 'Limonata azaldığında kalan başka kaba aktarılır, makine temizlenmeden üzerine yenisi eklenmez — üzerine ekleme yapmak, eski ve yeni limonatanın karışıp ikisinin de tazeliğini bozmasına yol açar.',
  'operations-19': "Şube açılış-kapanış saatleri genel olarak 08:30-23:30'dur (lokasyona göre değişebilir) — bu saat bandı, misafirin hangi şubeye gittiğinde ne bulacağını bilmesini sağlayan bir tutarlılıktır.",
  'operations-20': 'Açılış tamamlandığında şube fotoğrafları "1401 Standartlar" WhatsApp grubuna gönderilir — bu, merkezin her şubenin açılışını uzaktan, günlük olarak görebildiği basit ama etkili bir denetim yöntemidir.',
  'operations-21': "Personel indirimi KerzzPOS satış fiyatı üzerinden %20'dir — bu oran yalnızca personelin kendisi ve birinci derece yakınları için geçerlidir, sabit ve herkese eşit uygulanan bir kuraldır."
};

const fromAos = (bank, ids) =>
  QUESTION_BANKS[bank]
    .filter((q) => !ids || ids.includes(Number(q.id.split('-')[1])))
    .map((q) => ({
      type: 'single', prompt: q.questionText, options: q.options, answer: q.options.indexOf(q.correctAnswer),
      explanation: AOS_EXPLANATIONS[q.id] || ''
    }));

/* ------------------------------------------------------------------ */
/* 1. Oryantasyon                                                      */
/* ------------------------------------------------------------------ */

const orientation = {
  id: 'oryantasyon', title: 'Oryantasyon', icon: 'flag',
  description: 'Aramıza hoş geldin. 1401 Coffee\'yi, ekip kurallarını ve senden beklentilerimizi tanı.',
  modules: [{
    id: 'hos-geldin', title: '1401\'e Hoş Geldin', passScore: 80, examSize: 10,
    description: 'Hikayemiz, kişisel bakım ve kıyafet, genel çalışma kuralları.',
    lessons: [
      {
        id: 'hikayemiz', title: 'Hikayemiz ve değerlerimiz', durationMin: 3,
        blocks: [
          P('Port Group, yeme-içme sektörüne **2015** yılında adım attı. Kahvedeki ilk markamız **1401 Coffee Shop**, Nisan 2023\'te Viaport Asia AVM ve Ataşehir Golf Kulübü şubeleriyle hizmete başladı. Ardından Pendik (2024), Moda ve Çubuklu (2025) şubeleri açıldı.'),
          H('Yola çıkış sloganımız'),
          SPEC([['Kahve', 'Nitelikli'], ['Yiyecek', 'Lezzetli'], ['Hizmet', 'Güler yüzlü']]),
          P('Misafirlerimiz için **konforlu ve samimi**, çalışma arkadaşlarımız için **keyifli ve dinamik** bir konsept hayal ettik ve hayata geçirdik.'),
          TIP('Biz kendimize **#teamgoat** diyoruz. Niteliklerin, güler yüzün, enerjin ve iş etiğinle takıma pozitif katkı sağlayacağına inanıyoruz.'),
          P('Şubelerdeki yöneticilerimiz her zaman yanında. Bir şeyi bilmiyorsan sormaktan çekinme — bu uygulama da öğrendiklerini pekiştirmen için var.')
        ]
      },
      {
        id: 'kisisel-bakim', title: 'Kişisel bakım ve kıyafet', durationMin: 4,
        blocks: [
          P('Logolu kıyafetimizi giydiğin anda markayı temsil edersin. Misafir seni gördüğünde 1401\'i görür.'),
          H('Kişisel bakım'),
          P('- Saçlar temiz, taranmış ve düzenli; sakal ve bıyık düzgünce kesilmiş olmalı.\n- İşe başlamadan önce duş alınmış olmalı.\n- Gün içinde gerekirse hazır bulundurulan deodorant kullanılmalı.\n- Aşırı makyaj yapılmamalı, dikkat çeken takı kullanılmamalı.'),
          H('Kıyafet'),
          P('- Merkezin sağladığı ve sana zimmetlenen iş kıyafetlerini giymek zorunludur.\n- Kıyafetler temiz ve ütülü olmalı.\n- Şubede temiz ve ütülü **yedek kıyafet** bulundurmalısın.\n- İş esnasında **isimlik takmak zorunludur**.'),
          WARN('İş kıyafetleriyle **şube dışına çıkılmaz** ve işe bu kıyafetlerle **gelinmez**. Kuralın ihlalinde uyarı, devamında disiplin prosedürü uygulanır.'),
          CHECK('Vardiyan bitti, yakındaki markete gitmen gerekiyor. Ne yaparsın?', ['Önce iş kıyafetimi değiştiririm', 'Önlüğü çıkarmam yeterli', 'Kısa süreliğine kıyafetle çıkabilirim'], 0, 'Logolu iş kıyafetiyle şube dışına çıkılmaz.')
        ]
      },
      {
        id: 'genel-talimatlar', title: 'Genel çalışma kuralları', durationMin: 4,
        blocks: [
          SPEC([
            ['Yemek molası', 'Belirlenen saatte, yöneticinin bilgisiyle'],
            ['Şahsi telefon', 'Şube içinde görüşme yapılmaz'],
            ['Sigara', 'Misafirin gördüğü ve kapalı alanlarda yasak'],
            ['KerzzPOS', 'Yalnızca kendi şifrenle'],
            ['İçecek hakkı', 'Günde 3 (kahve, limonata, çay)'],
            ['Personel indirimi', '%20 (sen ve 1. derece yakınların)']
          ]),
          P('**Telefon:** Mesai saatinde şube sınırları içinde şahsi görüşme yapılamaz. Zorunlu durumda Şube Müdürü veya yardımcısından izin alarak şube dışında görüşebilirsin.'),
          P('**İçecek hakkı:** Gün içinde içtiğin içecekler gün sonunda sistemde **"ödenmez"** olarak kapatılır.'),
          P('**Çalışma alanı** her zaman düzenli ve temiz tutulur. Kendi alanını temiz bırakmak ekip arkadaşına saygıdır.'),
          WARN('KerzzPOS\'a başkasının şifresiyle girmek yasaktır. Yaptığın her işlem senin adınla kayda geçmelidir.')
        ]
      },
      {
        id: 'personel-kurallari', title: 'Vardiya, izin ve devamsızlık', durationMin: 3,
        blocks: [
          P('Temel yükümlülüğün, **shift çizelgesinde yazan saatte iş başında olmaktır.**'),
          STEPS(
            'Shift yayınlandıktan sonraki değişiklikler **yazılı** olarak bildirilir; sözlü talepler geçersizdir.',
            'Hastaysan hastaneye gidip **rapor alır** ve raporu **aynı gün** yöneticine teslim edersin.',
            'Rapor gerektirmeyen izinler için yöneticinle **yüz yüze** konuşursun.',
            'Raporlu olduğun tarihten önce iş başı yapamazsın.'
          ),
          WARN('Mazeretsiz ve haber vermeden işe gelmemek tutanakla kayda geçer ve İş Kanunu\'nun ilgili maddesi uygulanır. Sahte rapor veya yalan beyan iş akdinin feshi sebebidir.'),
          P('Kapanış saatinden önce, özellikle içeride misafir varken **kapanış hazırlığına başlanmaz** (müziği kapatmak, ışıkları değiştirmek gibi).'),
          TIP('Bayram, yılbaşı, sevgililer günü ve konser günleri gibi yoğun günlerde tam kadro çalışılır; izin planını buna göre yap.')
        ]
      }
    ],
    questions: [
      ...fromAos('operations', [10, 11, 12, 13, 14, 21]),
      Q('1401 Coffee\'nin yola çıkış sloganı hangisidir?', 'Nitelikli kahve, lezzetli yiyecekler ve güler yüzlü hizmet', ['Hızlı servis, uygun fiyat', 'Her köşede bir 1401', 'Kahve sadece bir içecek değildir'], 'Sloganımız: nitelikli kahve, lezzetli yiyecekler, güler yüzlü hizmet.'),
      Q('Hastalandın ve işe gelemeyeceksin. Doğru adım hangisi?', 'Hastaneden rapor alıp aynı gün yöneticime teslim etmek', ['Ertesi gün mesajla haber vermek', 'Bir arkadaşıma vardiyamı devretmek', 'Raporu ay sonunda teslim etmek'], 'Rapor aynı gün yöneticiye teslim edilmelidir.'),
      Q('Shift çizelgesi yayınlandıktan sonra değişiklik nasıl yapılır?', 'Yazılı olarak bildirilerek', ['Ekip arkadaşıyla sözlü anlaşarak', 'Değişiklik yapılamaz', 'Sadece WhatsApp sesli mesajıyla'], 'Sözlü talepler geçersizdir; değişiklikler yazılı bildirilir.'),
      TF('İçeride misafir varken kapanış saatinden önce müziği kısıp ışıkları azaltmaya başlayabiliriz.', false, 'Misafir şubedeyken kapanış aktivitelerine başlanmaz.'),
      TF('İş kıyafetimle işe gelebilirim, yeter ki temiz olsun.', false, 'İşe iş kıyafetiyle gelinmez, şubede giyilir.'),
      Q('Personel indiriminden kimler faydalanabilir?', 'Personelin kendisi ve birinci derece yakınları', ['Tüm arkadaşları', 'Sadece personelin kendisi', 'Personelin getirdiği herkes'], 'Anne, baba, eş, çocuk ve kardeş birinci derece yakındır.')
    ]
  }]
};

/* ------------------------------------------------------------------ */
/* 2. İçecek Standartları — reçetelerden otomatik                      */
/* ------------------------------------------------------------------ */

/**
 * Modüller, 2026 menüsünün kendi kategori yapısını izler (bkz.
 * source/recipes-2026.json). Ders sırası menüdeki sırayla aynıdır —
 * alfabetik değil: menü, Ristretto → Espresso → Macchiato gibi
 * öğrenme sırasını zaten doğru kuruyor.
 */
const CATEGORY_MODULES = [
  { id: 'italyan-klasikler', title: 'İtalyan Klasikler', cats: ['İtalyan Klasikler'], description: 'Her espresso bazlı içeceğin temeli: ristretto, espresso, macchiato, cortado.' },
  { id: 'sicak-kahveler', title: 'Sıcak Kahveler', cats: ['Sıcak Kahveler'], description: 'Latte, cappuccino, mocha ve aromalı sıcak kahvelerin ölçü ve bardak standartları.' },
  { id: 'demleme-turk', title: 'Demleme ve Türk Kahveleri', cats: ['3. Nesil Demleme', 'Geleneksel Türk Kahveleri'], description: 'Batch brew, V60/Chemex, cold drip ve geleneksel Türk kahvelerimiz.' },
  { id: 'soguk-kahveler', title: 'Soğuk Kahveler, Frappe ve Matcha', cats: ['Soğuk Kahveler', 'Frappe & Matcha'], description: 'Buzlu kahveler, frappe ve matcha içeceklerinin porsiyonlama standartları.' },
  { id: 'sicak-icecekler', title: 'Sıcak İçecekler ve Kids Menu', cats: ['Sıcak İçecekler', 'Kids Menu'], description: 'Sıcak çikolata, chai, sahlep, matcha ve çocuk menüsü.' },
  { id: 'soguk-icecekler', title: 'Soğuk İçecekler', cats: ['Soğuk İçecekler'], description: 'Limonatalar, milkshake, mix içecekler ve affogato.' }
];

const slug = (s) => s.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * 2026 menüsünde bardak/porsiyon bilgisi ürün adının parantezinde:
 * "Chestnut Latte (Kestaneli - 8 oz / 12 oz)" → ad + alt başlık + porsiyon.
 */
function parseName(full) {
  const m = full.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (!m) return { title: full.trim(), cup: null };
  const base = m[1].trim();
  let cup = null, note = null;
  for (const part of m[2].split(/\s*-\s*/)) {
    if (/\b(oz|ml|tek|duble)\b/i.test(part)) cup = part.trim();
    else note = part.trim();
  }
  return { title: note ? `${base} (${note})` : base, cup };
}

function recipeLesson(r, order) {
  const { title, cup } = parseName(r.name);
  const steps = (r.tech || '').split('\n').map((s) => s.trim()).filter((s) => s.length > 2);
  const id = `r-${slug(r.name)}`;
  const pic = LESSON_PHOTOS[id];
  const blocks = [
    // Fotoğraf en üstte: barista önce hedefi görsün, sonra ölçüleri okusun.
    ...(pic ? [IMG(photo(pic), `Doğru sunum: ${title}`)] : []),
    SPEC([...(cup ? [['Porsiyon', cup]] : []), ...r.ing.map((i) => [i.name, i.amt])]),
    ...(steps.length ? [H('Hazırlanışı'), STEPS(...steps)] : []),
    TIP('Ürünü teslim etmeden önce standarda ve sunuma uygunluğunu **gözle kontrol et**. Standart dışı ürün misafire sunulmaz.')
  ];
  return { id, title, durationMin: 2, order, blocks, _recipe: r, _cup: cup, _title: title };
}

/**
 * Reçetelerden sınav soruları: malzeme ölçüsü ve porsiyon.
 * Açıklama, doğru cevabı tekrar etmek yerine önce ÖLÇÜNÜN NEDEN önemli
 * olduğunu söyler, sonra reçetenin tamamını hatırlatır.
 */
function recipeQuestions(lessons, allRecipes) {
  const out = [];
  const amountsByIngredient = new Map();
  allRecipes.forEach((r) => r.ing.forEach((i) => {
    const k = i.name.toLocaleLowerCase('tr').trim();
    if (!amountsByIngredient.has(k)) amountsByIngredient.set(k, new Set());
    amountsByIngredient.get(k).add(i.amt.trim());
  }));
  const allCups = [...new Set(allRecipes.map((r) => parseName(r.name).cup).filter(Boolean))];

  const numericVariants = (amount) => {
    const m = amount.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!m) return [];
    const n = parseFloat(m[1].replace(',', '.'));
    const unit = m[2];
    const step = n >= 100 ? 30 : n >= 20 ? 10 : n >= 5 ? 5 : 1;
    return [n - step, n + step, n + 2 * step, n - 2 * step].filter((x) => x > 0).map((x) => `${Math.round(x)} ${unit}`.trim());
  };

  const recipeLine = (r) => r.ing.map((i) => `${i.name} ${i.amt}`).join(', ');

  for (const l of lessons) {
    const r = l._recipe;
    const name = l._title;
    const measurable = r.ing.filter((i) => /\d/.test(i.amt));
    // En belirleyici iki malzeme: önce espresso/süt dışı olanlar (şurup, toz, sos), sonra ana malzemeler.
    const ranked = [...measurable].sort((a, b) => {
      const base = (x) => /espresso|süt|su$|buz|kahve/i.test(x.name) ? 1 : 0;
      return base(a) - base(b);
    }).slice(0, 2);
    for (const ing of ranked) {
      const pool = [...(amountsByIngredient.get(ing.name.toLocaleLowerCase('tr').trim()) || [])].filter((a) => a !== ing.amt.trim() && /\d/.test(a));
      const wrong = [...new Set([...pool, ...numericVariants(ing.amt)])].filter((a) => a.replace(/\s/g, '') !== ing.amt.replace(/\s/g, '')).slice(0, 3);
      if (wrong.length < 3) continue;
      out.push(Q(
        `${name} reçetesinde ${ing.name.toLocaleLowerCase('tr')} ölçüsü nedir?`,
        ing.amt.trim(), wrong,
        `Ölçü, 1401'in imzasıdır: aynı içecek her şubede, her baristada aynı tatta çıkmalı — fazlası da azı da misafirin tanıdığı lezzeti bozar. ${name}: ${recipeLine(r)}.`
      ));
    }
    if (l._cup) {
      const wrong = allCups.filter((c) => c !== l._cup).slice(0, 3);
      if (wrong.length === 3) out.push(Q(
        `${name} hangi porsiyonda servis edilir?`,
        l._cup, wrong,
        `Bardak boyu sadece sunum değil, oran meselesidir: aynı espresso farklı hacimde farklı yoğunlukta içilir. ${name} → ${l._cup}.`
      ));
    }
  }
  return out;
}

const drinks = {
  id: 'icecek-standartlari', title: 'İçecek Standartları', icon: 'coffee',
  description: '2026 menüsündeki her içeceğin ölçüsü, porsiyonu ve hazırlanışı. Misafire giden her bardak aynı olmalı.',
  modules: CATEGORY_MODULES.map((cm) => {
    const recipes = RECIPES.filter((r) => cm.cats.includes(r.cat));
    const lessons = recipes.map((r, i) => recipeLesson(r, i + 1));
    return {
      id: cm.id, title: cm.title, description: cm.description, passScore: 80, examSize: 15,
      lessons,
      questions: recipeQuestions(lessons, RECIPES)
    };
  })
};

/* ------------------------------------------------------------------ */
/* 3. Misafir Deneyimi                                                 */
/* ------------------------------------------------------------------ */

const guest = {
  id: 'misafir-deneyimi', title: 'Misafir Deneyimi', icon: 'users',
  description: 'Siparişi doğru almak, doğru ürünü önermek ve her misafiri memnun uğurlamak.',
  modules: [
    {
      id: 'misafir-karsilama', title: 'Karşılama, Sadakat ve 1401 İmzası', passScore: 80, examSize: 10,
      description: 'Misafir kapıdan girdiği andan uğurlandığı ana kadar: karşılama, kişiselleştirme ve ekip uyumu.',
      lessons: [
        {
          id: 'sadakat-4-etki', title: 'Sadakat neden her şeyden önemli?', durationMin: 2,
          blocks: [
            P('Bir şubenin cirosunu belirleyen şey yeni misafir sayısı değil, **geri dönen** misafir sayısıdır. Yeni misafir kazanmak reklam ister; geri dönen misafir ise sadece iyi bir deneyim ister.'),
            SPEC([
              ['Sadakat', 'Düzenli misafir şubenin kalbidir; 1 memnun misafir yanında dostlarını getirir.'],
              ['Marka imajı', 'Kahve dünyasındaki rekabet güleryüz ve mükemmel hizmetle kazanılır.'],
              ['Finansal etki', 'Tekrar eden ziyaretler cironun sürekliliğini sağlar.'],
              ['Deneyim çemberi', 'Kapıdan girdiği andan uğurlandığı ana kadar her an kusursuz olmalıdır.']
            ]),
            H('"Deneyim çemberi" ne demek?'),
            P('Misafirin aklında kalan şey ortalama deneyim değil, **en zayıf halkadır**. Kahve mükemmel olsa bile kirli bir masa, bekletilen bir sipariş ya da soğuk bir karşılama o ziyareti olumsuza çevirir. Bu yüzden zincirin tamamı senin sorumluluğundadır — sadece bardağın içi değil.'),
            CHECK('Kahve harika çıktı ama misafir masasını kirli buldu. Deneyim nasıl hatırlanır?', ['Olumsuz — misafir en zayıf halkayı hatırlar', 'Olumlu — kahve iyiyse gerisi önemsizdir', 'Nötr — ikisi birbirini dengeler'], 0, 'Deneyim çemberinde tek bir kopuk halka tüm ziyareti belirler.')
          ]
        },
        {
          id: 'karsilama-iletisim', title: 'Karşılama ve doğru iletişim', durationMin: 3,
          blocks: [
            STEPS(
              '**Sıcak karşılama:** Kapıdan giren HER misafire pozitif bir "Hoş geldiniz!" ile enerjiyi hissettir.',
              '**Aktif dinleme:** Siparişi dikkatle dinle; misafir kendini özel ve değerli hissetsin.',
              '**Empati kurma:** Kahvesini yanlış alan misafirin yerine kendini koy ve anında çözüm üret.'
            ),
            H('Neden "HER misafire"?'),
            P('Karşılama bir ruh hâli değil, bir **standarttır**. Yoğunluk, yorgunluk ya da misafirin tanıdık olup olmaması bunu değiştirmez. Misafirin her ziyarette aynı karşılamayı bulacağını bilmesi, markaya duyduğu güvenin temelidir.'),
            TIP('Kahve kültürü ipucu: Espresso ile Americano farkını rahatça anlatabilmelisin. Misafir bir şey sorduğunda tereddütsüz cevap vermek, sattığın üründen çok sana duyulan güveni artırır.'),
            CHECK('Çok yoğun bir saatte kapıdan misafir girdi, elin dolu. Ne yaparsın?', ['Göz teması kurup "Hoş geldiniz" derim, hemen ilgileneceğimi belli ederim', 'İşim bitene kadar görmezden gelirim', 'Sıraya girmesini işaret ederim'], 0, 'Karşılama ertelenmez; bir saniyelik göz teması bile misafirin beklediğini hissetmesini engeller.')
          ]
        },
        {
          id: 'kisisellestirilmis-hizmet', title: 'Kişiselleştirilmiş hizmet ve 1401 İmzası', durationMin: 3,
          blocks: [
            P('Siparişi almak işin başlangıcıdır; misafiri **tanımak** sadakati kalıcı kılan şeydir. Kişiselleştirme, misafire "burada bir numara değilim" hissini verir.'),
            SPEC([
              ['Tercihleri hatırla', 'Müdavimin "şekersiz yulaf sütlü latte" tercihini bilmek fark yaratır.'],
              ['İsimle hitap et', '"Ahmet Bey, bugün yine favori filtre kahvenizi mi hazırlayalım?"'],
              ['Özel gün jesti', 'Doğum günü veya özel anlarda minik tatlı ikramı yap.']
            ]),
            H('Hizmet standartları'),
            P('- **Hızlı ve doğru servis:** Siparişler standart sürede ve hatasız hazırlanır.\n- **Hijyen ve düzen:** Masa, sandalye, bar ve servis alanları her an tertemiz.\n- **Görsel sunum:** Misafir bardağı eline almadan önce **görür** — kahve köpüğünün kıvamı dahi ilk memnuniyeti belirler.'),
            IMG(photo('latteart'), 'Köpük parlak ve pürüzsüz, desen net: misafirin ilk gördüğü şey bu.'),
            TIP('**1401 İmzası:** Temiz fincan, doğru servis sıcaklığı, lekesiz camlar ve samimi bir güleryüz. Bunlar kampanya değil, her gün aynı kalması gereken standartlarımızdır.'),
            CHECK('Hangisi 1401 İmzası\'nın bir parçası DEĞİLDİR?', ['Misafire en pahalı ürünü önermek', 'Temiz fincan', 'Doğru servis sıcaklığı', 'Lekesiz camlar'], 0, '1401 İmzası bir kalite standardıdır, satış taktiği değil.')
          ]
        },
        {
          id: 'ekip-ici-koordinasyon', title: 'Ekip içi koordinasyon', durationMin: 2,
          blocks: [
            P('Servis hızı bireysel bir performans değil, **takım performansıdır**. Zincirdeki tek bir gecikme tüm akışı yavaşlatır.'),
            SPEC([
              ['Akıcı iletişim', 'Bar ve servis ekibi arasındaki seri iletişim servis hızını ikiye katlar.'],
              ['Yoğun anda destek', 'Sipariş kuyruğunda birbirinin açığını kapatan takım mantığı.'],
              ['İç atmosfer', 'Bar arkasındaki yüksek pozitif enerji doğrudan salona yansır.']
            ]),
            P('Yoğun saatte herkesin sadece kendi görevine bakması kuyruğu büyütür. İyi bir ekip, kimin ne iş yaptığından önce **misafirin beklemediğinden** emin olur.'),
            TIP('Misafirler bar arkasındaki havayı hisseder. Gergin bir ekip güleryüz taklidi yapsa bile salon bunu sezer; ekip içi uyum aslında misafire sunulan ilk üründür.')
          ]
        }
      ],
      questions: [
        Q('Misafir sadakatinin şube için en güçlü etkisi nedir?', 'Memnun misafir yanında yeni misafirler getirir', ['Sosyal medya reklam maliyetini sıfırlar', 'Ürün maliyetlerini düşürür', 'Personel sayısını azaltır'], 'Sadık misafir kendi gelmekle kalmaz, çevresine tavsiye eder — bu bedava ve güvenilir bir pazarlamadır. Bir şubenin en güçlü büyüme kaynağı reklam değil, memnun misafirin ağzından çıkan sözdür.'),
        Q('"Deneyim çemberi" ilkesi neyi anlatır?', 'Kapıdan girişten uğurlamaya kadar her anın kusursuz olması gerektiğini', ['Sadece içeceğin kalitesinin önemli olduğunu', 'Misafirin çember şeklinde oturtulmasını', 'Günün belirli saatlerinde hizmet kalitesinin artırılmasını'], 'Misafir ortalama bir deneyimi değil, en zayıf halkayı hatırlar. Kahve mükemmel olsa bile kirli bir masa o ziyareti olumsuza çevirir — bu yüzden zincirin tamamı senin sorumluluğundadır.'),
        Q('Kapıdan giren misafire karşılama ne zaman yapılır?', 'Yoğunluk ne olursa olsun her misafire, hemen', ['Sadece boş olduğunda', 'Sadece tanıdık müdavimlere', 'Sipariş vermeye yaklaştığında'], 'Karşılama bir ruh hâli değil standarttır. Misafirin her ziyarette aynı karşılamayı bulacağını bilmesi, markaya duyduğu güvenin temelidir.'),
        Q('Müdavim bir misafirin "şekersiz yulaf sütlü latte" tercihini hatırlamak neden önemlidir?', 'Misafire özel ve tanınan biri olduğunu hissettirir', ['Siparişi daha hızlı girmeyi sağlar', 'Stok takibini kolaylaştırır', 'Daha pahalı ürün satmayı kolaylaştırır'], 'Siparişi almak işin başlangıcıdır; misafiri tanımak sadakati kalıcı kılan şeydir. Kişiselleştirme misafire "burada bir numara değilim" hissini verir — hız bunun yan faydasıdır, amacı değil.'),
        Q('Aşağıdakilerden hangisi 1401 İmzası\'nın bir parçasıdır?', 'Temiz fincan ve doğru servis sıcaklığı', ['Her misafire kampanya anlatmak', 'En pahalı ürünü önermek', 'Siparişi mutlaka çift kontrol ettirmek'], '1401 İmzası; temiz fincan, doğru servis sıcaklığı, lekesiz camlar ve samimi güleryüz gibi HER ziyarette aynı kalması gereken kalite standartlarıdır — satış taktikleri değil.'),
        Q('Misafirin bir içecekle ilgili ilk izlenimi neyle oluşur?', 'Görsel sunumla — köpüğün kıvamı dahil', ['İlk yudumun sıcaklığıyla', 'Fiyatıyla', 'Hazırlanma süresiyle'], 'Misafir bardağı eline almadan önce GÖRÜR. Lezzet doğru olsa bile kötü görünen bir sunum memnuniyeti daha ilk saniyede zedeler.'),
        Q('Bar ve servis ekibi arasındaki hızlı iletişim neyi etkiler?', 'Servis hızını — zincirdeki tek gecikme tüm akışı yavaşlatır', ['Sadece bar personelinin iş yükünü', 'Sadece kasa kapanışını', 'Ürün maliyetini'], 'Servis hızı bireysel değil takım performansıdır. Bir halkadaki gecikme tüm zinciri yavaşlatır; bu yüzden iletişim hızı tek tek kişilerin hızından daha belirleyicidir.'),
        Q('Yoğun saatte sipariş kuyruğu büyüdü. Doğru yaklaşım nedir?', 'Takım mantığıyla birbirinin açığını kapatmak', ['Herkesin yalnızca kendi görevine odaklanması', 'Yöneticinin gelmesini beklemek', 'Sipariş almayı geçici olarak durdurmak'], 'Herkesin sadece kendi görevine bakması kuyruğu büyütür. İyi bir ekip, kimin ne iş yaptığından önce misafirin beklemediğinden emin olur.'),
        TF('Bar arkasındaki ekip atmosferi, misafirin salonda hissettiği havayı doğrudan etkiler.', true, 'Misafirler bar arkasındaki enerjiyi sezer. Gergin bir ekip güleryüz taklidi yapsa bile salon bunu hisseder; ekip içi uyum aslında misafire sunulan ilk üründür.'),
        TF('Çok yoğun olunan saatlerde karşılama atlanabilir, önemli olan siparişin hızlı çıkmasıdır.', false, 'Karşılama ertelenebilir bir nezaket değil, bir standarttır. Bir saniyelik göz teması bile misafirin beklediğini hissetmesini engeller; hız ise karşılamanın alternatifi değil tamamlayıcısıdır.'),
        TF('Misafirin adını bilmek ve kullanmak kişiselleştirilmiş hizmetin parçasıdır.', true, 'İsimle hitap, misafire tanındığını hissettiren en kısa yoldur; tercihini hatırlamak ve özel gün jestleriyle birlikte sadakati besleyen üç temel kişiselleştirme davranışından biridir.')
      ]
    },
    {
      id: 'siparis-ve-satis', title: 'Sipariş ve Önerili Satış', passScore: 80, examSize: 12,
      description: 'Sipariş alma ve teslim etme prosedürleri, önerili satış teknikleri.',
      lessons: [
        {
          id: 'siparis-alma', title: 'Sipariş alma prosedürü', durationMin: 4,
          blocks: [
            STEPS(
              'Kasa önüne gelen misafiri **dikkatle dinle** ve siparişi KerzzPOS\'a doğru gir.',
              'Özel istekleri (bol soslu, bol sütlü, yanında sıcak su vb.) **not al ve siparişe ekle**.',
              'Siparişle uyumlu bir ürünü **nazikçe öner**.',
              'Ödeme şekline göre tahsilatı yap, **adisyonu kapat**.'
            ),
            H('İletişim tarzına uyum sağla'),
            P('Misafirin konuşma hızına ve ses tonuna uygun cevap ver. Hızlı konuşan bir misafire yavaş cevap vermek onu sıkabilir; yavaş konuşan bir misafire hızlı cevap vermek anlamasını zorlaştırır.'),
            TIP('Menüdeki her ürünün içeriğini ve hazırlanışını bilmelisin. "Bunda ne var?" sorusuna tereddütsüz cevap vermek güven verir. İçecek Standartları eğitim yolu bunun için var.'),
            CHECK('Misafir "lattem bol köpüklü olsun" dedi. Ne yaparsın?', ['Not olarak siparişe eklerim', 'Barmene sözlü söylerim, sisteme girmem', 'Standart dışı olduğu için kabul etmem'], 0, 'Özel istekler mutlaka siparişe eklenir; bar ekibi oradan görür.')
          ]
        },
        {
          id: 'onerili-satis', title: 'Önerili satış teknikleri', durationMin: 5,
          blocks: [
            P('**Önerili satış**, ana ürünle uyumlu tamamlayıcı ürünlerin veya daha üst seviye seçeneklerin önerilmesidir. Amaç misafire daha iyi bir deneyim yaşatmak; bunun sonucunda satış da artar.'),
            SPEC([
              ['Tamamlayıcı satış', 'Ana ürünün yanına uygun ürün'],
              ['Yükseltme (up-sell)', 'Daha büyük boy / premium seçenek'],
              ['Yeni ürün tanıtımı', 'Menüye yeni eklenen ürüne dikkat çekmek'],
              ['Bonus gücü', 'Kampanyayı misafire hissettirmek']
            ]),
            H('Örnek cümleler'),
            P('- **Tamamlayıcı:** "Lattenizin yanında ev yapımı cheesecake\'imizi öneririm."\n- **Yükseltme:** "Kahvenizi double shot deneyebilirsiniz, daha yoğun bir lezzet oluyor."\n- **Yeni ürün:** "Bugün menüye yeni eklenen X çok popüler, denemek ister misiniz?"\n- **Bonus:** "Tatlı alana Türk kahvesi hediye kampanyamız var, bilginiz olsun."'),
            H('Nasıl önerilir?'),
            P('- Nazik, güven veren, **zorlayıcı olmayan** bir dil kullan.\n- "Şefin önerisi", "popüler seçim" gibi ifadelerle destekle.\n- Gülümse, göz teması kur; doğru zamanda öner.\n- Misafirin ruh haline göre yaklaş: acelesi olan misafire uzun anlatım yapma.'),
            CHECK('"Kahvenizi double shot yapalım mı? Gövdesi çok daha zengin olur." Bu hangi tekniktir?', ['Yükseltme satışı (up-sell)', 'Tamamlayıcı satış', 'Yeni ürün tanıtımı'], 0, 'Aynı ürünün daha üst seviyesini önermek yükseltme satışıdır.')
          ]
        },
        {
          id: 'siparis-teslim', title: 'Sipariş teslim etme', durationMin: 2,
          blocks: [
            STEPS(
              'Hazırlanan ürünü **standarda ve sunum kriterlerine** göre gözle kontrol et.',
              'Sıcak ürün **sıcak**, soğuk ürün **soğuk** sunulur.',
              'Tabak ve bardakta **çatlak, kırık ya da hasar** olmadığından emin ol.',
              'Çatal, bıçak ve kaşıkların **temiz ve lekesiz** olduğunu kontrol et.'
            ),
            WARN('Standart dışı ürün **kesinlikle** misafire sunulmaz. Yeniden hazırla.'),
            TIP('Sunumda küçük detaylar fark yaratır: temiz fincan, doğru sıcaklık, yanında su veya küçük bir çikolata.')
          ]
        }
      ],
      questions: [
        ...fromAos('sales'),
        Q('Misafir kasada hızlı hızlı konuşuyor. Nasıl cevap verirsin?', 'Onun temposuna uyarak net ve hızlı', ['Yavaş ve uzun açıklamalarla', 'Cevap vermeden siparişi girerim', 'Yavaşlaması için beklerim'], 'İletişim tarzına uyum sağlanır; hızlı konuşana yavaş cevap misafiri sıkar.'),
        Q('Standart dışı hazırlanmış bir ürün fark ettin. Ne yaparsın?', 'Misafire sunmam, yeniden hazırlarım', ['Misafir fark etmezse sunarım', 'İndirim yaparak sunarım', 'Sorumlusuna sorup sunarım'], 'Standart dışı ürün kesinlikle misafire sunulmaz.'),
        TF('Servis öncesinde bardak ve tabaklarda çatlak veya kırık olup olmadığı kontrol edilmelidir.', true, 'Hasarlı servis malzemesi kullanılmaz.')
      ]
    },
    {
      id: 'memnuniyet-sikayet', title: 'Memnuniyet ve Şikayet Yönetimi', passScore: 80, examSize: 12,
      description: 'Memnuniyeti kontrol etmek, şikayeti 5 adımda çözmek, doğru cümleleri kullanmak.',
      lessons: [
        {
          id: 'memnuniyet-kontrol', title: 'Memnuniyeti kontrol etmek', durationMin: 3,
          blocks: [
            P('Misafirin memnun olmadığını düşündüğünde sorunu anlamak için **pozitif bir üslupla** soru sor. Olumsuz ve ön yargılı ifadelerden kaçın.'),
            SPEC([['Yanlış', '"Beğenmediniz mi?" / "Problem mi var?"'], ['Doğru', '"Her şey arzu ettiğiniz gibi mi efendim?"'], ['Doğru', '"Sizin için daha iyi nasıl yardımcı olabiliriz?"']]),
            P('Memnuniyeti aktif olarak kontrol etmek seni **profesyonel, ilgili ve çözüm odaklı** gösterir; satışları da artırır.'),
            TIP('Çözümden sonra misafire tekrar yaklaş: "Size yardımcı olmak bizim için çok değerliydi. Şu an her şey yolunda mı efendim?"'),
            H('Küçük dokunuşlar'),
            P('- Düzenli misafirin tercihini hatırla ("şekersiz latte").\n- İsmini biliyorsan kullan.\n- Uzun süredir bekleyen masaya biri gidip bilgi versin; sorunu beklemeden çöz.')
          ]
        },
        {
          id: 'sikayet-5-adim', title: 'Şikayeti karşılamanın 5 adımı', durationMin: 4,
          blocks: [
            STEPS('**Dinle** — şikayeti sözünü kesmeden sonuna kadar dinle.', '**Empati kur** — misafirin duygusunu anladığını hissettir.', '**Teşekkür et** — bildirdiği için teşekkür et; yapıcı bir başlangıç olur.', '**Özür dile** — hatalı olmasan bile samimi bir özür dile.', '**Çözüm sun** — mağduriyeti hızlı ve etkili şekilde gider.'),
            H('Kaçınman gerekenler'),
            P('- Misafiri suçlamak veya alaycı konuşmak\n- Hatayı reddetmek, savunmaya geçmek\n- İlgisiz görünmek, çözüm sunmamak\n- "Hayır" demek — bunun yerine alternatif sun'),
            WARN('Küçük şikayetin çözümünden **bar personeli** sorumludur. Konu büyümeye başlarsa **hemen vardiyadaki yöneticiye** devret. Misafirle asla polemiğe girme.'),
            CHECK('Öfkeli bir misafir sesini yükseltiyor. İlk ne yaparsın?', ['Sakin kalır, sözünü kesmeden dinlerim', 'Haklı olduğumu açıklarım', 'Yöneticiyi çağırıp uzaklaşırım'], 0, 'İlk adım dinlemek; durum tırmanırsa yöneticiye devredilir.')
          ]
        },
        {
          id: 'sikayet-turleri', title: 'Şikayet türlerine göre ne söylenir?', durationMin: 5,
          blocks: [
            H('Kalite (beğenmeme, soğuk, tuzlu)'),
            P('"Sizi anlıyorum, bu kesinlikle kabul edilemez. Hemen yenisini hazırlayalım. Siparişinizin bize yakışan kalitede çıkması için bizzat takipçisi olacağım."\n- Ürün **sorgusuz sualsiz** geri alınır, yönetici bilgilendirilir.'),
            H('Serviste gecikme'),
            P('"Sizi anlıyorum, siparişiniz en geç 2 dakika (demleme gerektirmeyen) veya 5 dakika (demleme gerektiren) içinde hazırlanmalıydı. Beklediğiniz için özür dilerim."'),
            SPEC([['Demleme gerektirmeyen', 'En geç 2 dk'], ['Demleme gerektiren', 'En geç 5 dk']]),
            H('Sıcaklık / sunum / standart dışı'),
            P('"Sizi anlıyorum, bu kesinlikle kabul edilemez. Hemen yenisini hazırlayıp sunalım." Yönetici misafirle bizzat ilgilenir.'),
            H('Personel hakkında'),
            P('Personel şikayeti **sorgusuz** yöneticisine bildirir; misafirle yönetici konuşur.'),
            H('Ürün stokta yok'),
            P('"Talep ettiğiniz ürünü size hemen sunamadığımız için özür dilerim. Bunun yerine size bugünlük … öneriyorum."'),
            WARN('Yöneticiler ödeme almama, ikram, kuru temizleme gibi telafi yapabilir; ama **maliyeti belirsiz taahhüt** verilmez. Örneğin diş kırılması durumunda "biz karşılarız" denmez.')
          ]
        },
        {
          id: 'iptal-ikram-indirim', title: 'İptal, iade, ikram ve indirim', durationMin: 3,
          blocks: [
            P('**İptal/iade:** Mutlaka şube yöneticisi bilgilendirilir. Gün sonunda KerzzPOS\'tan alınan iptal-iade listesine her adisyonun **sebebi** ve **ürünün zayi olup olmadığı** ikinci soruya gerek bırakmayacak netlikte yazılır.'),
            P('**İkram:** Yetki yalnızca Operasyon Müdürü, Şube Müdürü ve Müdür Yardımcılarındadır. Sistemde mutlaka **İKRAM** olarak işlenir; indirim veya ödenmez adisyonla birleştirilmez.'),
            P('**İndirim:** Kime ve ne oranda indirim yapılacağını Operasyon Müdürü belirler ve yazılı bildirir. Personel indirimi %20\'dir.'),
            TIP('İptal ve iade sayısı şubenin hizmet kalitesinin önemli bir göstergesidir.')
          ]
        },
        {
          id: 'iletisim-kazalari', title: 'İletişim kazaları ve memnuniyet jestleri', durationMin: 3,
          blocks: [
            H('Asla yapılmaması gerekenler'),
            P('- **Misafiri suçlamak:** Tartışmaya girmek veya alaycı, savunmacı bir dil kullanmak.\n- **Hatayı reddetmek:** "Bizde hata olmaz" gibi sert ifadelerle savunmaya geçmek.\n- **İlgisiz görünmek:** Sorunu dinlememek ya da çözümsüz bırakıp uzaklaşmak.\n- **Negatif dil:** "Kuralımız böyle, yapamayız" demek — yerine her zaman bir alternatif sun.'),
            WARN('Bu dördü şikayeti çözmez, **büyütür**. Misafir çoğu zaman hatanın kendisine değil, hataya verilen tepkiye kızar.'),
            H('Memnuniyeti artıran jestler'),
            SPEC([
              ['Küçük ikram', 'Çözülen şikayetin yanında minik bir kurabiye veya çikolata.'],
              ['5 dakika takibi', 'Çözümü sunduktan 5 dakika sonra masaya uğrayıp "Yeni kahveniz nasıl oldu?" diye sor.'],
              ['Kayıt ve takip', 'Yaşananı ekiple paylaş ki aynı hata tekrarlanmasın.']
            ]),
            TIP('**Proaktif yaklaşım:** Siparişi geciken bir masayı misafir sormadan fark edip gidip bilgi vermek, şikayetin doğmasını baştan engeller. En iyi şikayet yönetimi, hiç şikayet oluşmamasıdır.'),
            CHECK('Yanlış çıkan kahveyi yenilediniz. Sırada ne var?', ['5 dakika sonra masaya uğrayıp sonucu sormak', 'Konuyu kapatıp bir daha açmamak', 'Misafir yeniden şikayet ederse ilgilenmek'], 0, 'Çözümü sunmak yarısıdır; çözümün işe yaradığını teyit etmek şikayeti memnuniyete çeviren adımdır.')
          ]
        },
        {
          id: 'rol-oyunlari', title: 'Rol oyunu: üç zor senaryo', durationMin: 4,
          blocks: [
            P('Kriz anında doğru cümleyi bulmak yetenek değil **tekrar** işidir. Ekipçe rol oyunu yapmak tepki hızını artırır. Aşağıdaki üç senaryoyu okuyup kendi cevabını seç, sonra vardiyada bir arkadaşınla canlandır.'),
            H('Senaryo 1 — Öfkeli misafir'),
            CHECK('Misafir sesini yükselterek "Yirmi dakikadır bekliyorum, rezalet!" diyor. İlk cümlen ne olur?', ['"Sizi çok iyi anlıyorum, beklediğiniz için özür dilerim — hemen ilgileniyorum."', '"Bugün çok yoğunuz, herkes bekliyor."', '"Siparişinizi ben almamıştım."'], 0, 'Önce empati ve özür; açıklama ve savunma misafiri daha da öfkelendirir. Gerekçe anlatmak sonra gelir, hiç gelmeyebilir de.'),
            H('Senaryo 2 — Olmayan ürün'),
            CHECK('Misafirin istediği tatlı bitmiş. Ne dersin?', ['"Bugün onu sunamadığımız için özür dilerim; yerine şunu öneririm, çok sevilen bir seçim."', '"O bitti."', '"Erken gelseydiniz kalmıştı."'], 0, 'Olumsuz cevap tek başına bırakılmaz; her "yok" bir alternatifle birlikte söylenir. Misafir ürünü değil, çözümsüzlüğü hatırlar.'),
            H('Senaryo 3 — Yanlış ürün'),
            CHECK('Misafir "Ben sütsüz istemiştim" diyor ama siparişte öyle bir not yok. Ne yaparsın?', ['Tartışmam, özür dileyip hemen yenisini hazırlarım', '"Sistemde öyle görünmüyor" diyerek siparişi gösteririm', 'Ücretini alıp yenisini yaparım'], 0, 'Kimin haklı olduğunu kanıtlamak misafiri kaybettirir. Hata bizde olmasa bile çözüm önce gelir; kaydı sonra ekiple değerlendirirsin.'),
            TIP('Her rol oyunu sonunda tek bir soru sor: "Misafir bu masadan arkadaşına anlatacak bir şeyle mi kalktı?"')
          ]
        }
      ],
      questions: [
        ...fromAos('complaints'),
        Q('Şikayet çözüldükten sonra masaya 5 dakika içinde uğramanın amacı nedir?', 'Çözümün gerçekten işe yaradığını teyit etmek', ['Hesabı kapatmaya davet etmek', 'Yeni ürün önerisi yapmak', 'Masayı erken boşaltmak'], 'Çözümü sunmak işin yarısıdır. Misafir yeni ürünü de beğenmediyse ve kimse sormadıysa, şikayet çözülmüş değil sadece susturulmuş olur — takip, memnuniyeti doğrulayan adımdır.'),
        Q('Misafir şikayet ettiğinde hangisi durumu büyüten bir davranıştır?', '"Bizde hata olmaz" diyerek savunmaya geçmek', ['Sözünü kesmeden dinlemek', 'Bildirdiği için teşekkür etmek', 'Alternatif bir çözüm sunmak'], 'Misafir çoğu zaman hatanın kendisine değil, hataya verilen tepkiye kızar. Hatayı reddetmek misafire "sen yanılıyorsun" demektir ve çözüm arayışını kavgaya dönüştürür.'),
        Q('"Kuralımız böyle, yapamayız" demek yerine ne yapılmalıdır?', 'Mümkün olan bir alternatif sunmak', ['Yöneticiyi çağırıp uzaklaşmak', 'Kuralı daha ayrıntılı anlatmak', 'Misafirden yazılı talep istemek'], 'Negatif dil kapıyı kapatır. Misafir çoğu zaman tam olarak istediği şeyi değil, kendisi için bir çaba gösterildiğini görmek ister; alternatif sunmak bu çabanın kanıtıdır.'),
        Q('Siparişi geciken bir masayı misafir sormadan bilgilendirmek ne sağlar?', 'Şikayetin hiç oluşmamasını — proaktif yaklaşım', ['Siparişin daha hızlı çıkmasını', 'Misafirin hesabı erken istemesini', 'Garson sayısının azaltılmasını'], 'En iyi şikayet yönetimi hiç şikayet oluşmamasıdır. Bekleyen misafir bilgilendirildiğinde bekleme süresi değişmez ama belirsizlik ortadan kalkar; misafiri asıl rahatsız eden belirsizliktir.'),
        TF('Ekip içinde kriz senaryolarıyla rol oyunu yapmak, gerçek durumda tepki hızını artırır.', true, 'Kriz anında doğru cümleyi bulmak yetenek değil tekrar işidir. Önceden prova edilmiş bir cevap, baskı altında düşünmek zorunda kalmadan ağızdan çıkar.'),
        TF('Yaşanan bir şikayeti ekiple paylaşmak gereksizdir; önemli olan o anda çözülmüş olmasıdır.', false, 'Paylaşılmayan hata tekrarlanır. Kayıt ve takip, tek bir misafirin yaşadığı sorunun diğerlerinin de başına gelmesini önleyen tek mekanizmadır.'),
        Q('Demleme gerektirmeyen bir sipariş en geç kaç dakikada hazırlanmalıdır?', '2 dakika', ['5 dakika', '10 dakika', '1 dakika'], 'Demleme gerektirmeyen 2 dk, demleme gerektiren 5 dk.'),
        Q('Hangisi memnuniyeti kontrol etmek için doğru bir sorudur?', '"Her şey arzu ettiğiniz gibi mi efendim?"', ['"Beğenmediniz mi?"', '"Problem mi var?"', '"Yine mi bir sorun var?"'], 'Olumsuz ve ön yargılı ifadelerden kaçınılır.'),
        Q('İkram yapma yetkisi kimdedir?', 'Operasyon Müdürü, Şube Müdürü ve Müdür Yardımcıları', ['Tüm baristalar', 'Sadece kasiyer', 'Vardiyadaki en kıdemli personel'], 'İkram yetkisi yalnızca yöneticilerdedir.'),
        TF('İkram edilen ürün, KerzzPOS\'ta indirimli adisyon olarak kapatılabilir.', false, 'İkram sistemde mutlaka İKRAM olarak işlenir; başka işlemle birleştirilmez.')
      ]
    }
  ]
};

/* ------------------------------------------------------------------ */
/* 4. İşletme Standartları                                             */
/* ------------------------------------------------------------------ */

const operations = {
  id: 'isletme-standartlari', title: 'İşletme Standartları', icon: 'store',
  description: 'Açılış, kapanış, ekipman, ürün kabulü, depo ve teşhir — her şubede aynı standart.',
  modules: [
    {
      id: 'acilis-kapanis', title: 'Açılış, Kapanış ve Ekipman', passScore: 80, examSize: 12,
      description: 'Şube açılış ve kapanış prosedürleri, ekipmanların günlük bakımı.',
      lessons: [
        {
          id: 'acilis', title: 'Şube açılış prosedürü', durationMin: 5,
          blocks: [
            P('Açılış işlemleri açılış personeli tarafından yapılır; **Şube Müdürü veya yardımcısı** kontrol edip onaylar.'),
            STEPS(
              '**Güvenlik ve sistem:** Alarm devre dışı bırakılır (şifreyi yalnızca yöneticiler bilir). Elektrik, su, gaz açılır; bilgisayar ve KerzzPOS kontrol edilir; müzik belirlenen listeyle açılır.',
              '**Temizlik:** Salon ve bahçe paspaslanır (sıcak suya bir bardak zemin temizleyici). WC temizlenir, metal aksam parlatılır, sarf malzemeleri tamamlanır. Camlar ve aynalar silinir.',
              '**Oturma alanı:** Sandalye ve koltuklar temizlenir; lekeli minderler yedeğiyle değiştirilir, fermuarlar aşağı bakar.',
              '**Servis hazırlığı:** Masalar silinir, menajlar (küllük, QR menü, çiçek) tamamlanır; bar tezgahı temizlenir.',
              '**Ürün hazırlığı:** Teşhir eksikleri depodan tamamlanır; kruvasanlar pişirilir; filtre kahve demlenir.',
              '**Soğutucular:** Tüm dolapların derecesi termometreyle ölçülüp **Soğutucu Isı Formu**na yazılır; gece elektrik kesintisi olup olmadığı kontrol edilir.',
              '**Onay:** Yönetici Check-List\'i kontrol eder; açılış fotoğrafları **"1401 Standartlar" WhatsApp grubuna** atılır.'
            ),
            H('Kruvasan standardı'),
            SPEC([['Saklama', '-18°C dolap'], ['Pişirme', '180°C, 20 dk'], ['Dinlendirme', '4 dk, sonra teşhire'], ['Serviste ısıtma', 'Mikrodalga 45 sn (200°C)']]),
            H('Filtre kahve'),
            P('Termos sıcak suyla ısıtılır. Filtre kağıdı suyla ıslatılıp hazneye yerleştirilir, ardından ölçüsüne göre demlenir.')
          ]
        },
        {
          id: 'kapanis', title: 'Şube kapanış prosedürü', durationMin: 4,
          blocks: [
            STEPS(
              '**Kasa:** Kasiyer (yoksa sorumlu personel/yönetici) KerzzPOS ve kasa kapanışını eksiksiz yapar.',
              '**Ekipman:** Buzdolapları, derin dondurucular ve soğuk oda **çalışır kalır**; klima, havalandırma gibi çok enerji harcayan cihazlar **mutlaka kapatılır**.',
              '**Hijyen:** Açıkta yiyecek-içecek bırakılmaz; bardaki gıdalar ağzı kapalı kaplara alınır; zemin süpürülüp paspaslanır; paslanmaz yüzeyler dezenfekte edilir.',
              '**Çöp:** Tüm kovalar boşaltılıp temizlenir. SKT\'si dolmuş veya ertesi gün kullanılamayacak ürünler KerzzPOS\'a **zayi kaydı** yapılarak atılır.',
              '**Güvenlik:** Kapılar, pencereler, kepenkler kilitlenir; alarm yönetici tarafından kurulur.',
              '**Onay:** Check-list onaylanır, kapanış fotoğrafları "1401 Standartlar" grubuna gönderilir.'
            ),
            WARN('Zayi kaydı yapılmadan ürün çöpe atılmaz — stok farkı oluşur ve açık olarak raporlanır.')
          ]
        },
        {
          id: 'ekipman', title: 'Ekipman kullanımı ve bakımı', durationMin: 4,
          blocks: [
            P('Şubedeki tüm ekipmanlar personele **zimmetlidir**. Talimata uyulmamasından kaynaklı arızalarda tamir masrafı kullanan personele rücu edilebilir. Arızayı **hemen** Şube Müdürü veya yardımcısına bildir; onarımı yalnızca yetkili servis yapar.'),
            SPEC([
              ['Espresso makinesi', 'Kapanışta musluklar Pullycaf, süt çubukları Pully Milk'],
              ['Kahve öğütücü', 'Haftada bir Pully Grind ile detaylı temizlik'],
              ['Buz makinesi', 'Her gece temizlik; kürek makine dışında temiz kapta'],
              ['Limonata makinesi', 'Azalınca başka kaba aktar, temizlemeden yenisini ekleme'],
              ['Filtre kahve makinesi', 'Demleme öncesi temizlik, haftalık bakım'],
              ['Boiler / çay kazanı', 'Su seviyesi ve kireç kontrolü'],
              ['Türk kahvesi makinesi', 'Su seviyesi; cezvede kararma/kireç kontrolü'],
              ['Bulaşık makinesi', 'Düzenli kireç çözdürme']
            ]),
            CHECK('Limonata makinesinde limonata azaldı. Ne yaparsın?', ['Kalanı başka kaba aktarır, makineyi temizler, sonra yenisini eklerim', 'Üzerine yeni limonata eklerim', 'Bitene kadar beklerim'], 0, 'Makine temizlenmeden yeni limonata eklenmez.')
          ]
        }
      ],
      questions: [
        ...fromAos('operations', [4, 5, 6, 7, 8, 9, 15, 16, 17, 18, 19, 20]),
        Q('Açılışta soğutucuların derecesi nereye kaydedilir?', 'Soğutucu Isı Formu\'na', ['Hiçbir yere, sadece bakılır', 'KerzzPOS\'a', 'WhatsApp grubuna'], 'Dereceler termometreyle ölçülüp Soğutucu Isı Formu\'na işlenir.'),
        Q('Kapanışta hangi cihaz mutlaka kapatılmalıdır?', 'Klima ve havalandırma', ['Derin dondurucu', 'Soğuk oda', 'Buzdolapları'], 'Soğutucular çalışır kalır; çok enerji harcayan cihazlar kapatılır.'),
        TF('Arızalanan bir kahve makinesini, tamirden anlayan bir personel kendisi onarabilir.', false, 'Bakım ve onarım yalnızca yetkili servis tarafından yapılır.'),
        Q('Zemin temizliğinde paspas suyuna ne eklenir?', 'Sıcak suya bir bardak zemin temizleyici', ['Soğuk suya çamaşır suyu', 'Sadece sıcak su', 'Bulaşık deterjanı'], 'Manuel: sıcak suya bir bardak zemin temizleyici kimyasal.')
      ]
    },
    {
      id: 'urun-kabul-depo', title: 'Ürün Kabul, Depo ve Teşhir', passScore: 80, examSize: 12,
      description: 'Teslim alma, soğuk zincir, donuk ürün kuralları, FIFO, depo düzeni ve teşhir.',
      lessons: [
        {
          id: 'teslim-alma', title: 'Ürün teslim alma', durationMin: 4,
          blocks: [
            P('Tedarikçiden veya merkezden gelen her ürün vardiyadaki personel tarafından **sayılarak veya tartılarak, imza karşılığı** teslim alınır.'),
            STEPS('Fatura/irsaliyeyi siparişle karşılaştır.', 'Miktar ve kaliteyi kontrol et.', 'Ambalajda hasar, sızıntı, yırtık var mı bak.', 'Son kullanma tarihini kontrol et.', 'Soğuk zincir ürünlerinin **ısısını ölç**.', 'Uygunsuzluk varsa **tutanak** tut ve Satın Alma\'ya ilet.'),
            WARN('Olması gerekenden farklı ısıda gelen donuk ürün **teslim alınmaz**. Araç içi ısı da kontrol edilir ve tedarikçi bilgilendirilir.'),
            SPEC([['Mal kabul son saati', '17:30'], ['Süt ve süt ürünleri', '0–4°C']])
          ]
        },
        {
          id: 'donuk-urun', title: 'Donuk ürün ve soğuk zincir', durationMin: 3,
          blocks: [
            H('3 gün kuralı'),
            P('Şubeye donuk gelen ürünler **+4 dolapta** tutulur ve **3 gün içinde** tüketilir. SKT geçen ürün KerzzPOS\'a işlenip atılır.'),
            WARN('Hiçbir gıda ürünü **ikinci kez dondurulmaz**. Çözdürme yalnızca **+5°C buzdolabında** yapılır — tezgahta veya sıcak suda değil.'),
            CHECK('Çözülmüş ama kullanılmamış bir pastayı ne yaparsın?', ['+4 dolapta tutup 3 gün içinde tüketilmesini sağlarım', 'Tekrar derin dondurucuya koyarım', 'Oda sıcaklığında teşhirde bırakırım'], 0, 'Çözülen ürün tekrar dondurulmaz.')
          ]
        },
        {
          id: 'depo-fifo', title: 'Depo düzeni ve FIFO', durationMin: 4,
          blocks: [
            P('**FIFO — İlk Giren İlk Çıkar:** Depoya önce giren ürün önce kullanılır. Tarihi yakın olanlar öne, yeni gelenler arkaya.'),
            P('- Ürünleri kategoriye göre ayır: kahve çekirdeği, süt ürünleri, kuru gıda, temizlik, ambalaj.\n- Temizlik malzemeleri gıdayla **asla** aynı rafta durmaz.\n- Her ürün net etiketli olur; açılan ürün açılış tarihiyle etiketlenir.\n- Sık kullanılan malzeme kolay erişilen yere konur.\n- Dökülen malzeme hemen temizlenir.'),
            SPEC([['Kahve çekirdeği', 'Serin, kuru, ışık almayan yer'], ['Süt ürünleri', 'Soğuk zincir korunur'], ['Şurup ve soslar', 'Raf ömrüne uygun'], ['Kuru gıda', 'Nemden uzak, hava almayan kap']]),
            P('Koltuk altı depolarda aşırı stok tutulmaz; esas stok merkez depodadır. Depolar arası her hareket **Transfer Formu** ile, teslim eden ve alanın imzasıyla belgelenir.'),
            TIP('Hiçbir üründe stok tükenmemelidir. Bir ürün azalıyorsa beklemeden Şube Müdürüne haber ver.')
          ]
        },
        {
          id: 'teshir', title: 'Teşhir ve görsel düzen', durationMin: 3,
          blocks: [
            P('- **Göz seviyesi kuralı:** En çok satan ve öne çıkarılmak istenen ürün göz hizasında.\n- **Facing:** Ürünler ön yüzü ve etiketi dışa dönük, raf dolu görünecek şekilde dizilir.\n- **Kategori yerleşimi:** Benzer ürünler bir arada.\n- **Kasa önü:** Küçük, hızlı tüketilen ürünler (atıştırmalık, kahve kartları).\n- Mevsimsel ve kampanyalı ürünler öne çıkarılır.'),
            H('Sık yapılan hatalar'),
            P('- Dağınık veya ulaşılması zor ürünler\n- Kampanya ürünlerinin arkada kalması\n- Eksik veya yanlış etiket'),
            TIP('Teşhire her gün misafir gözüyle bak: temiz mi, dolu mu, etiketler doğru mu, SKT\'si yaklaşan var mı?')
          ]
        },
        {
          id: 'ozel-urun-saklama', title: 'Özel ürünlerin saklama standartları', durationMin: 3,
          blocks: [
            P('Her ürün grubunun kendine ait bir düşmanı var: kahvenin nem ve ışık, sütün sıcaklık, şurubun ısı kaynağı, kuru gıdanın zemin teması. Saklama kuralları bu düşmanlara göre yazıldı.'),
            H('Kahve çekirdekleri'),
            P('- Serin, kuru ve **doğrudan güneş ışığı almayan** ortamda saklanır.\n- Nemden ve yüksek ısıdan korunur.\n- Paket açıldıktan sonra **hava almayan özel valfli kaplarda** tutulur.'),
            H('Süt ve süt ürünleri'),
            P('- Soğuk zincir muhafazası **asla bozulmaz (0–4°C)**.\n- Tezgahtaki sütler kullanım dışı anlarda soğutucuya geri konur.\n- **Bitkisel sütler ve hayvansal sütler ayrı alanlarda** saklanır.'),
            H('Şuruplar ve soslar'),
            P('- Orijinal ambalajında, **direkt ısı kaynağından uzakta** durur.\n- **Pompa uçları her gün** düzenli olarak hijyenik silinir.\n- Raf ömrü ve açılış tarihi etiketle takip edilir.'),
            H('Kuru gıdalar ve unlular'),
            P('- Yerden yüksekte, **havalandırmalı raflarda** muhafaza edilir.\n- Nem almaması için kapaklar her zaman tam kapalı kalır.\n- **Zeminle direkt temas kesinlikle yasaktır** (palet kullanımı).'),
            WARN('Saklama alanlarının günlük ve haftalık temizlik kontrolü **vardiya amiri** sorumluluğundadır.'),
            CHECK('Tezgahta duran açık süt, servis arasında 15 dakika kullanılmayacak. Ne yaparsın?', ['Soğutucuya geri koyarım', 'Tezgahta bırakırım, nasılsa birazdan kullanılacak', 'Üzerini kapatıp tezgahta bırakırım'], 0, 'Soğuk zincir dakikalarla ölçülür; kullanım dışı her an süt soğutucudadır.')
          ]
        },
        {
          id: 'vitrin-kasa-onu', title: 'Vitrin ve kasa önü stratejisi', durationMin: 2,
          blocks: [
            P('Vitrin bir depolama alanı değil, **sessiz bir satış elemanıdır**. Misafir sipariş vermeden önce gözüyle karar verir.'),
            SPEC([
              ['Hızlı tüketim', 'Kasa önünde atıştırmalıklar, kurabiyeler ve kahve kartları konumlandırılır.'],
              ['Aydınlatma ve iştah', 'Vitrin camları lekesiz, aydınlatma ürün rengini canlı gösterecek sıcaklıkta.'],
              ['Facing', 'Raflar ve vitrin her zaman dolu, hizalı ve ön yüzleri etiketiyle öne bakacak şekilde.']
            ]),
            WARN('Dağınık vitrin veya etiketleri eksik ürünler satışı **%40 düşürür**. Bu bir tahmin değil, ölçülmüş bir etkidir.'),
            TIP('**Müşteri gözünden değerlendirme:** Her vardiyada bir kez bar arkasından çıkıp tezgahın önüne geç. Vitrin misafir gözüyle lezzetli ve davetkâr görünüyor mu? Bar arkasından her şey her zaman düzgün görünür — asıl test öndedir.'),
            CHECK('Kasa önüne hangi ürün grubu konumlandırılır?', ['Küçük, hızlı tüketilen atıştırmalıklar ve kahve kartları', 'En pahalı demleme ekipmanları', 'Depodan yeni gelen kutular', 'Günün sonunda kalan tatlılar'], 0, 'Kasa önü, beklerken verilen ani kararların alanıdır; büyük ve pahalı ürünler orada karar verilemeyecek kadar düşündürür.')
          ]
        }
      ],
      questions: [
        ...fromAos('logistics'),
        Q('Açılmış kahve çekirdeği paketi nasıl saklanır?', 'Hava almayan özel valfli kapta, serin ve ışık almayan yerde', ['Orijinal paketinde ağzı katlanarak', 'Buzdolabında kapalı kapta', 'Tezgah üstünde ağzı açık kavanozda'], 'Kahvenin iki düşmanı nem ve oksijendir. Valfli kap, çekirdeğin saldığı karbondioksiti dışarı verirken dışarıdan hava almaz; bu yüzden ağzı katlanmış paket ya da sıradan kavanoz aromayı birkaç günde kaybettirir.'),
        Q('Bitkisel sütler ile hayvansal sütler neden ayrı alanlarda saklanır?', 'Karışma ve çapraz bulaşmayı önlemek için', ['Bitkisel sütler daha soğuk ortam istediği için', 'Raf ömürleri aynı olduğu için', 'Maliyet takibini kolaylaştırmak için'], 'Ayrı saklama hem yanlış sütün yanlışlıkla kullanılmasını hem de alerjen açısından çapraz bulaşmayı önler. Yulaf sütü isteyen bir misafire inek sütü gitmesi sadece tat hatası değil, sağlık riskidir.'),
        Q('Şurup pompalarının uçları ne sıklıkta temizlenir?', 'Her gün', ['Haftada bir', 'Şurup bitince', 'Ayda bir'], 'Pompa ucu, şekerli sıvının havayla buluştuğu yerdir; kuruyan şurup hem bakteri üretir hem dozajı bozar. Günlük temizlik bu yüzden şurup değişimine değil, günün kendisine bağlıdır.'),
        Q('Kuru gıdaların zeminle direkt teması neden yasaktır?', 'Nem ve haşere riski oluşturduğu için — palet kullanılır', ['Zemini çizdiği için', 'Taşımayı zorlaştırdığı için', 'Sayımı zorlaştırdığı için'], 'Zemin hem temizlik suyundan nem hem de haşere geçişi için en riskli yüzeydir. Palet ve havalandırmalı raf, ürünü bu iki riskten aynı anda ayırır.'),
        Q('Dağınık vitrin ve eksik etiketin satışa etkisi nedir?', 'Satışı yaklaşık %40 düşürür', ['Etkisi yoktur, ürün kalitesi belirleyicidir', 'Satışı yaklaşık %5 düşürür', 'Satışı artırır çünkü merak uyandırır'], 'Vitrin sessiz bir satış elemanıdır: misafir sipariş vermeden önce gözüyle karar verir. Görünmeyen ya da fiyatı belirsiz ürün, var olmayan üründür.'),
        TF('Tezgahta duran süt, kullanım dışı anlarda soğutucuya geri konulmalıdır.', true, 'Soğuk zincir dakikalarla ölçülür. "Birazdan kullanacağım" diye tezgahta bırakılan süt, ısındığı her dakikada bozulma süresini kısaltır.'),
        TF('Vitrin düzenini değerlendirmek için bar arkasından bakmak yeterlidir.', false, 'Bar arkasından her şey her zaman düzgün görünür. Asıl test, tezgahın önüne geçip misafirin gördüğü açıyı görmektir.'),
        ...fromAos('operations', [1, 2, 3]),
        Q('Akşam saat kaçtan sonra mal teslim alınmaz?', '17:30', ['20:00', '15:00', 'Saat sınırı yoktur'], 'Manuel: akşam 17:30\'dan sonra mal teslim alınmaz.'),
        Q('Donuk ürünler hangi sıcaklıkta çözdürülür?', '+5°C buzdolabında', ['Tezgahta oda sıcaklığında', 'Sıcak su içinde', 'Mikrodalgada'], 'Çözdürme yalnızca +5°C buzdolabında yapılır.'),
        TF('Çözülmüş bir ürün, kullanılmayacaksa yeniden dondurulabilir.', false, 'Hiçbir gıda ürünü ikinci kez dondurulamaz.'),
        Q('Depolar arası ürün transferi nasıl belgelenir?', 'Teslim eden ve alanın imzasıyla Transfer Formu', ['Sözlü bilgilendirme yeterli', 'WhatsApp mesajı', 'Belgeye gerek yoktur'], 'Transfer formunda iki tarafın ad-soyad ve imzası bulunur.')
      ]
    }
  ]
};

export const CURRICULUM = [orientation, drinks, guest, operations];

/**
 * İç içe müfredatı Firestore koleksiyonlarına birebir karşılık gelen düz
 * listelere çevirir. Hem seed betiği hem de panelin "Müfredatı güncelle"
 * eylemi aynı çıktıyı kullanır — tek doğruluk kaynağı.
 */
export function flattenCurriculum(curriculum = CURRICULUM) {
  const tracks = [], modules = [], lessons = [], questions = [];
  curriculum.forEach((tr, ti) => {
    tracks.push({ id: tr.id, title: tr.title, description: tr.description, icon: tr.icon, order: ti + 1, published: true });
    tr.modules.forEach((m, mi) => {
      modules.push({
        id: m.id, trackId: tr.id, title: m.title, description: m.description, order: mi + 1,
        passScore: m.passScore, examSize: Math.min(m.examSize, m.questions.length),
        prerequisiteId: m.prerequisiteId || null, published: true, questionCount: m.questions.length
      });
      m.lessons.forEach((l, li) => lessons.push({
        id: l.id, moduleId: m.id, title: l.title, order: li + 1, durationMin: l.durationMin, blocks: l.blocks, published: true
      }));
      m.questions.forEach((q, qi) => {
        if (q.answer < 0) throw new Error(`Cevap bulunamadı: ${m.id} #${qi} ${q.prompt}`);
        questions.push({ id: `${m.id}-q${String(qi + 1).padStart(3, '0')}`, moduleId: m.id, imageUrl: '', ...q });
      });
    });
  });
  return { tracks, modules, lessons, questions };
}
