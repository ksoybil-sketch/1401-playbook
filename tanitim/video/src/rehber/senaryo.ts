/**
 * Kullanım rehberi videolarının anlatımı. Her adım bir gerçek ekranı
 * gösterir ve bir cümle seslendirilir; adımın süresi seslendirmenin
 * uzunluğundan gelir (capture/ses.mjs). Ekran adları capture/rehber.mjs'nin
 * public/rehber/rehber.json'a yazdığı adlardır.
 *
 * `metin` hem altyazı hem seslendirmedir. Okunuşu farklı olması gereken
 * yerlerde (İngilizce rozet adları, "oz") `ses` ayrıca verilir.
 */
export interface Adim {
  ekran: string;
  metin: string;
  ses?: string;
  /** Çerçevelenecek öğeler (ikiden fazlaysa sırayla). */
  isaret?: { kutu: string; etiket: string }[];
  /** Adımın sonunda bu öğeye dokunulur. */
  dokun?: string;
  /** Tam sayfa ekranda bu öğeye (ya da piksele) kaydır. */
  kaydir?: string | number;
  odak?: string;
  yakin?: number;
}

export interface Bolum { baslik: string; ses?: string; adimlar: Adim[] }

export interface Rehber {
  id: 'barista' | 'mudur';
  ad: string;               // "Barista rehberi"
  renk: string;
  giris: { baslik: string; alt: string; metin: string };
  bolumler: Bolum[];
  kapanis: { baslik: string; maddeler: string[]; metin: string };
}

export const BARISTA: Rehber = {
  id: 'barista',
  ad: 'Barista rehberi',
  renk: '#D9A066',
  giris: {
    baslik: '1401 Campus\nnasıl kullanılır?',
    alt: 'Barista rehberi',
    metin: 'Merhaba! Bu videoda 1401 Campus uygulamasını adım adım nasıl kullanacağını göreceksin. Uygulama, mağazadaki ortak telefonda açık durur.'
  },
  bolumler: [
    {
      baslik: 'Uygulamayı açınca',
      adimlar: [
        { ekran: 'lobi', metin: 'Uygulamayı açınca ilk bu ekranı görürsün: Kim çalışıyor? Mağazandaki herkes burada listelenir.' },
        { ekran: 'lobi', metin: 'Müdürler üstte, baristalar altta durur. Kendi adını bulup ona dokunacaksın.', isaret: [{ kutu: 'mudurler', etiket: 'Müdürler' }, { kutu: 'baristalar', etiket: 'Baristalar' }] },
        { ekran: 'lobi', metin: 'En üstteki Reçeteler’e PIN girmeden bakabilirsin. Servis sırasında bir ölçüyü hızlıca kontrol etmek için bunu kullan.', isaret: [{ kutu: 'receteler', etiket: 'PIN’siz reçeteler' }] }
      ]
    },
    {
      baslik: 'İlk giriş: PIN belirleme',
      adimlar: [
        { ekran: 'lobi', metin: 'Uygulamayı ilk kez kullanıyorsan adın henüz listede olmaz. En alttaki “Yeni misin?” kartına dokun.', isaret: [{ kutu: 'yeni', etiket: 'İlk kez giriyorsan' }], dokun: 'yeni' },
        { ekran: 'davet-kod', metin: 'Müdürün sana altı haneli bir davet kodu verecek. Kodu tuşlarla gir.', isaret: [{ kutu: 'tuslar', etiket: 'Davet kodu' }] },
        { ekran: 'davet-pin', metin: 'Şimdi kendine dört haneli bir PIN belirle. Bundan sonra her girişte bu PIN’i kullanacaksın.', isaret: [{ kutu: 'baslik', etiket: 'Kendi PIN’in' }] },
        { ekran: 'davet-pin', metin: '1111 ya da 1234 gibi kolay tahmin edilen PIN’ler kabul edilmez. PIN’ini kimseyle paylaşma.', ses: 'Bir bir bir bir ya da bir iki üç dört gibi kolay tahmin edilen PIN’ler kabul edilmez. PIN’ini kimseyle paylaşma.' },
        { ekran: 'davet-tekrar', metin: 'Doğrulamak için aynı PIN’i bir kez daha gir.', isaret: [{ kutu: 'baslik', etiket: 'Aynı PIN’i tekrar' }] },
        { ekran: 'ilk-bugun', metin: 'Bu kadar, içeridesin! Adın ekranın üstünde görünür. Bir dahaki sefere adın “Kim çalışıyor?” listesinde olacak.', isaret: [{ kutu: 'ad', etiket: 'Senin hesabın' }] }
      ]
    },
    {
      baslik: 'Her gün: giriş ve çıkış',
      adimlar: [
        { ekran: 'lobi', metin: 'Sonraki girişlerde “Kim çalışıyor?” ekranında adına dokun.', isaret: [{ kutu: 'mehmet', etiket: 'Adın' }], dokun: 'mehmet' },
        { ekran: 'pin', metin: 'PIN’ini gir, o kadar. Yanlış kişiye dokunduysan “Başka barista” ile geri dön.', isaret: [{ kutu: 'tuslar', etiket: '4 haneli PIN' }, { kutu: 'baska', etiket: 'Geri dön' }] },
        { ekran: 'menu', metin: 'İşin bitince sağ üstteki Çıkış’a mutlaka dokun. Telefon ortak; çıkmazsan senden sonraki kişi senin adınla işlem yapar.', isaret: [{ kutu: 'cikis', etiket: 'Çıkış' }], odak: 'cikis', yakin: 1.5 },
        { ekran: 'menu', metin: 'Unutursan da sorun değil: on dakika boyunca ekrana dokunulmazsa uygulama seni kendiliğinden çıkarır.' },
        { ekran: 'lobi', metin: 'PIN’ini unutursan müdürüne söyle. Bölge Müdürü PIN’ini sıfırlar ve sana yeni bir davet kodu verir; “Yeni misin?” kartından yeniden belirlersin.', isaret: [{ kutu: 'yeni', etiket: 'Yeni kodla' }] }
      ]
    },
    {
      baslik: 'Bugün ekranı',
      adimlar: [
        { ekran: 'bugun', metin: 'Giriş yapınca Bugün ekranı açılır. En üstte önlük rozetin ve bir sonraki rozete ne kadar kaldığı görünür.', isaret: [{ kutu: 'kahraman', etiket: 'Rozetin ve ilerlemen' }] },
        { ekran: 'bugun', metin: 'Altındaki dört kutu en çok kullanacağın yerler: reçeteler, girmen gereken sınav, kaldığın ders ve okunmamış duyurular.', kaydir: 260,
          isaret: [{ kutu: 'recete', etiket: 'Reçeteler' }, { kutu: 'sinav', etiket: 'Sınavın' }, { kutu: 'ders', etiket: 'Kaldığın ders' }, { kutu: 'bulten', etiket: 'Duyurular' }] },
        { ekran: 'bugun', metin: 'Müdürün sana bir görev verdiyse “Görevlerin” başlığı altında, son tarihiyle görünür.', kaydir: 'gorevler', isaret: [{ kutu: 'gorevler', etiket: 'Görevlerin' }] },
        { ekran: 'bugun', metin: 'Daha aşağıda başarımların, eğitim yolların ve uygulamanın bütün bölümleri var.', kaydir: 'bolumler' },
        { ekran: 'menu', metin: 'Alttaki menüyle her yere tek dokunuşla gidersin: Bugün, Reçeteler, Akademi, Bülten ve Ben.',
          isaret: [{ kutu: 'n-bugun', etiket: 'Bugün' }, { kutu: 'n-recete', etiket: 'Reçeteler' }, { kutu: 'n-akademi', etiket: 'Akademi' }, { kutu: 'n-bulten', etiket: 'Bülten' }, { kutu: 'n-ben', etiket: 'Ben' }] }
      ]
    },
    {
      baslik: 'Reçeteler',
      adimlar: [
        { ekran: 'receteler', metin: 'Reçeteler’de bütün içecekler var. Üstteki kutuya içecek ya da malzeme adı yazabilirsin.', isaret: [{ kutu: 'arama', etiket: 'Ara' }] },
        { ekran: 'receteler', metin: 'Ya da bir kategoriye dokunarak listeyi daraltabilirsin.', isaret: [{ kutu: 'kategoriler', etiket: 'Kategoriler' }] },
        { ekran: 'receteler-ara', metin: 'Örneğin “latte” yaz; içinde latte geçen içecekler listelenir. Birine dokun.', isaret: [{ kutu: 'sonuc', etiket: 'Caffè Latte' }], dokun: 'sonuc' },
        { ekran: 'recete', metin: 'Reçetede içeceğin fotoğrafı, bardak şeması ve 8 oz ile 12 oz ölçüleri yer alır.', ses: 'Reçetede içeceğin fotoğrafı, bardak şeması ve sekiz ons ile on iki ons ölçüleri yer alır.', kaydir: 'bardak', isaret: [{ kutu: 'bardak', etiket: 'Bardak şeması' }] },
        { ekran: 'recete', metin: 'Aşağı kaydırınca hazırlanışı adım adım okursun.', kaydir: 'adimlar', isaret: [{ kutu: 'adimlar', etiket: 'Hazırlanışı' }] }
      ]
    },
    {
      baslik: 'Akademi: dersler',
      adimlar: [
        { ekran: 'akademi', metin: 'Akademi’de eğitimin eğitim yollarına ayrılmıştır. Bir yola dokun.', isaret: [{ kutu: 'icecek', etiket: 'Eğitim yolu' }], dokun: 'icecek' },
        { ekran: 'yol', metin: 'Her yolda modüller var. Bir modüle dokunarak derslerini açarsın.', isaret: [{ kutu: 'sicak', etiket: 'Modül' }], dokun: 'sicak' },
        { ekran: 'modul', metin: 'Modülde dersler sırayla listelenir. Bitirdiğin dersler işaretlenir.', isaret: [{ kutu: 'dersler', etiket: 'Dersler' }] },
        { ekran: 'ders', metin: 'Dersi baştan sona oku: fotoğraflar, bardak şemaları ve adımlar burada.', kaydir: 600 },
        { ekran: 'ders', metin: 'Dersi bitirince alttaki “Tamamladım” düğmesine dokun.', isaret: [{ kutu: 'tamam', etiket: 'Tamamladım' }], dokun: 'tamam' },
        { ekran: 'ders-sonra', metin: 'Sıradaki ders açılır ve kaldığın yer kaydedilir. Bir dahaki girişte Bugün ekranındaki “Kaldığın ders” kutusundan devam edersin.' }
      ]
    },
    {
      baslik: 'Sınav',
      adimlar: [
        { ekran: 'modul', metin: 'Bir modülün derslerini bitirince o modülün sınavına girersin. Sınavın Bugün ekranında da çıkar.', kaydir: 'sinav', isaret: [{ kutu: 'sinav', etiket: 'Sınav' }] },
        { ekran: 'sinav-giris', metin: 'Başlamadan önce soru sayısını, süreyi ve geçme notunu görürsün. Hazırsan Başla’ya dokun.', isaret: [{ kutu: 'bilgi', etiket: 'Sınav bilgisi' }], dokun: 'basla' },
        { ekran: 'sinav-soru', metin: 'Soruyu oku ve doğru olduğunu düşündüğün şıkka dokun. Üstte kaçıncı soruda olduğun ve kalan süre yazar.', isaret: [{ kutu: 'sayac', etiket: 'Kaçıncı soru' }, { kutu: 'sure', etiket: 'Kalan süre' }] },
        { ekran: 'sinav-secili', metin: 'Seçtiğin şık işaretlenir. “Sonraki” ile diğer soruya geç.', isaret: [{ kutu: 'secenek', etiket: 'Seçtiğin şık' }], dokun: 'ilerle' },
        { ekran: 'sinav-bitir', metin: 'Son soruda “Sınavı bitir”e dokun.', isaret: [{ kutu: 'bitir', etiket: 'Sınavı bitir' }], dokun: 'bitir' },
        { ekran: 'sinav-sonuc', metin: 'Sonuç hemen gelir. Yanlış yaptığın soruların doğru cevabını ve nedenini burada görürsün.', kaydir: 'yanlis' },
        { ekran: 'sinav-sonuc', metin: 'Geçemezsen dersleri gözden geçirip yeniden dene; her modül için haftada üç deneme hakkın var. Sınav yarıda kalırsa kaldığın yerden devam edersin.' }
      ]
    },
    {
      baslik: 'Ben: rozet ve başarımlar',
      adimlar: [
        { ekran: 'ben', metin: 'Ben sekmesinde önlük rozetini görürsün: Rookie, Specialist, Senior ve Pro.', ses: 'Ben sekmesinde önlük rozetini görürsün: Ruki, Spesiyalist, Sinyır ve Pro.', isaret: [{ kutu: 'rozet', etiket: 'Önlük rozetin' }] },
        { ekran: 'ben', metin: 'Sıradaki rozet için neleri tamamlaman gerektiği burada yazar. Hak ettiğinde, önlüğüne takacağın rozet sana teslim edilir.' },
        { ekran: 'ben', metin: 'Başarımlar, dersleri ve sınavları tamamladıkça kendiliğinden açılır. Sınav sonuçların da bu sekmede.', kaydir: 'basarimlar', isaret: [{ kutu: 'basarimlar', etiket: 'Başarımlar' }] }
      ]
    },
    {
      baslik: 'Bülten',
      adimlar: [
        { ekran: 'bulten-acik', metin: 'Bülten’de kampanyalar, yeni ürünler ve duyurular yer alır. Okunmamış duyuru sayısı alt menüde görünür.', isaret: [{ kutu: 'ilk', etiket: 'Duyuru' }], dokun: 'ilk' },
        { ekran: 'bulten', metin: 'Duyuruya dokunup oku; okundu olarak işaretlenir.' }
      ]
    }
  ],
  kapanis: {
    baslik: 'Özetle',
    maddeler: ['Adına dokun, PIN’ini gir', 'Bugün ekranından devam et', 'Reçeteye PIN’siz bak', 'İşin bitince Çıkış'],
    metin: 'Özetle: adına dokun, PIN’ini gir, Bugün ekranından devam et ve işin bitince çıkış yap. Takıldığın bir yer olursa müdürüne sor. Kolay gelsin!'
  }
};

export const MUDUR: Rehber = {
  id: 'mudur',
  ad: 'Mağaza müdürü rehberi',
  renk: '#E07A6E',
  giris: {
    baslik: 'Mağaza müdürü\nrehberi',
    alt: 'Ekibim · Görevler · Talepler',
    metin: 'Bu videoda mağaza müdürlerinin ve vardiya sorumlularının kullandığı bölümleri anlatıyoruz. Barista rehberindeki her şey senin için de geçerli.'
  },
  bolumler: [
    {
      baslik: 'Giriş',
      adimlar: [
        { ekran: 'lobi', metin: 'Sen de aynı şekilde girersin: Müdürler listesinde adına dokun ve PIN’ini gir.', isaret: [{ kutu: 'ayse', etiket: 'Adın' }] },
        { ekran: 'm-bugun', metin: 'Ekranın üstünde, adının altında görevin yazar. Senin için iki bölüm daha açılır: Ekibim ve Talepler.', isaret: [{ kutu: 'rol', etiket: 'Mağaza müdürü' }] },
        { ekran: 'm-ben', metin: 'İkisine de alt menüdeki Ben sekmesinden ulaşırsın.', kaydir: 'ekip', isaret: [{ kutu: 'ekip', etiket: 'Ekibim' }, { kutu: 'talepler', etiket: 'Talepler' }] }
      ]
    },
    {
      baslik: 'Ekibim',
      adimlar: [
        { ekran: 'ekip', metin: 'Ekibim’de mağazandaki her baristanın eğitim ilerlemesini ve rozetini görürsün.', isaret: [{ kutu: 'liste', etiket: 'Ekibin' }] },
        { ekran: 'ekip', metin: 'Altta son sınavlar listelenir: kim hangi sınava girdi, kaç aldı, geçti mi.', kaydir: 'sinavlar', isaret: [{ kutu: 'sinavlar', etiket: 'Son sınavlar' }] }
      ]
    },
    {
      baslik: 'Görev verme',
      adimlar: [
        { ekran: 'ekip', metin: 'Bir baristaya ya da bütün ekibe görev vermek için Görev düğmesine dokun.', isaret: [{ kutu: 'gorev', etiket: 'Görev' }], dokun: 'gorev' },
        { ekran: 'gorev-ata', metin: 'Önce görevin türünü seç: bir modülün sınavını geçmek ya da tek bir dersi okumak.', isaret: [{ kutu: 'tur', etiket: 'Görev türü' }] },
        { ekran: 'gorev-ata', metin: 'Sonra modülü, kime verileceğini ve son tarihi seç. İstersen kısa bir not ekle.',
          isaret: [{ kutu: 'modul', etiket: 'Modül' }, { kutu: 'kime', etiket: 'Kime' }, { kutu: 'tarih', etiket: 'Son tarih' }] },
        { ekran: 'gorev-dolu', metin: 'Ata’ya dokun. Görev baristanın Bugün ekranında son tarihiyle görünür ve tamamladığında kendiliğinden kapanır.', isaret: [{ kutu: 'ata', etiket: 'Ata' }], dokun: 'ata' }
      ]
    },
    {
      baslik: 'Talepler',
      adimlar: [
        { ekran: 'talepler', metin: 'Talepler, Kahve Operasyonu’ndan bir şey istemenin yolu: arıza, teknik servis, malzeme ya da personel ihtiyacı.', isaret: [{ kutu: 'acik', etiket: 'Açık talepler' }] },
        { ekran: 'talepler', metin: 'Yeni bir talep açmak için Yeni’ye dokun.', isaret: [{ kutu: 'yeni', etiket: 'Yeni talep' }], dokun: 'yeni' },
        { ekran: 'talep-yeni', metin: 'Önce konuyu seç. Arızada hangi ekipmanın arızalı olduğunu da seçersin.', isaret: [{ kutu: 'konu', etiket: 'Konu' }] },
        { ekran: 'talep-dolu', metin: 'Kısa bir başlık yaz, ne olduğunu açıkla ve varsa fotoğraf ekle.', isaret: [{ kutu: 'baslik', etiket: 'Başlık' }, { kutu: 'foto', etiket: 'Fotoğraf' }] },
        { ekran: 'talep-dolu', metin: 'Sorun misafiri etkiliyorsa Acil’i seç. Sonra Gönder’e dokun.', isaret: [{ kutu: 'acil', etiket: 'Acil' }], dokun: 'gonder' },
        { ekran: 'talepler-sonra', metin: 'Talebin listenin başında, durumuyla birlikte görünür.', isaret: [{ kutu: 'ilk', etiket: 'Talebin' }] },
        { ekran: 'talep-detay', metin: 'Kahve Operasyonu yanıt verince Ben sekmesinde bir işaret çıkar. Talebe dokunup yazışmayı görür, buradan yanıt yazarsın.', isaret: [{ kutu: 'yanit', etiket: 'Yanıtın' }] }
      ]
    },
    {
      baslik: 'Yeni çalışan ve unutulan PIN',
      adimlar: [
        { ekran: 'lobi', metin: 'Yeni bir barista başladığında Bölge Müdürüne haber ver. Bölge Müdürü hesabı açar ve altı haneli bir davet kodu verir.', isaret: [{ kutu: 'yeni', etiket: 'Yeni misin?' }] },
        { ekran: 'davet-kod', metin: 'Barista “Yeni misin?” kartından bu kodu girer ve kendi PIN’ini belirler. PIN’ini unutan olursa yine Bölge Müdürü sıfırlar ve yeni kod verir.', isaret: [{ kutu: 'tuslar', etiket: 'Davet kodu' }] }
      ]
    },
    {
      baslik: 'Mağaza telefonu',
      adimlar: [
        { ekran: 'eslestir', metin: 'Mağaza telefonu ilk kurulurken bu ekran açılır. Bölge Müdürünün verdiği altı haneli eşleştirme koduyla telefon mağazana bağlanır.', isaret: [{ kutu: 'tuslar', etiket: 'Eşleştirme kodu' }] },
        { ekran: 'lobi', metin: 'Telefonun ayarları sağ üstteki düğmede.', isaret: [{ kutu: 'ayar', etiket: 'Cihaz ayarları' }], dokun: 'ayar' },
        { ekran: 'cihaz', metin: 'Buradan Kahve Operasyonu girişi yapılır. “Mağaza bağlantısını kaldır”a dokunma; telefon yeniden eşleştirme kodu ister.', isaret: [{ kutu: 'kaldir', etiket: 'Dokunma' }] }
      ]
    }
  ],
  kapanis: {
    baslik: 'Özetle',
    maddeler: ['Ekibini Ekibim’den izle', 'Görevleri oradan ver', 'İhtiyaçları Talepler’den ilet', 'Yeni çalışan: Bölge Müdürü'],
    metin: 'Özetle: ekibini Ekibim’den izle, görevleri oradan ver, ihtiyaçlarını Talepler’den ilet. Yeni çalışan ve unutulan PIN için Bölge Müdürüne haber ver. Kolay gelsin!'
  }
};

export const REHBERLER = [BARISTA, MUDUR];

/** Bölüm kartında okunan cümle. */
export const SIRA = ['Birinci', 'İkinci', 'Üçüncü', 'Dördüncü', 'Beşinci', 'Altıncı', 'Yedinci', 'Sekizinci', 'Dokuzuncu', 'Onuncu'];
export const bolumSesi = (i: number, b: Bolum) => b.ses || `${SIRA[i]} bölüm: ${b.baslik.replace(':', ',')}.`;

/** Seslendirilecek bütün cümleler (sıra önemli değil). */
export function cumleler(r: Rehber): string[] {
  const out = [r.giris.metin, r.kapanis.metin];
  r.bolumler.forEach((b, i) => { out.push(bolumSesi(i, b)); b.adimlar.forEach((a) => out.push(a.ses || a.metin)); });
  return out;
}
