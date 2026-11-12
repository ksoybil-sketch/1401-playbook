/**
 * Videonun akışı. Her bölüm (chapter) bir başlık ve bir dizi "vuruş"tan
 * (beat) oluşur; her vuruş gerçek bir ekranı gösterir, istenirse kaydırır,
 * bir öğeye yakınlaşır ya da dokunur. Öğe adları capture/capture.mjs'nin
 * meta.json'a yazdığı konumlardır.
 */
export type Hue = 'amber' | 'rose' | 'sky' | 'mint' | 'violet' | 'sand' | 'green';

export const HUES: Record<Hue, string> = {
  amber: '#D9A066', rose: '#E07A6E', sky: '#6FA8DC', mint: '#72C094', violet: '#A98BDB', sand: '#E2DAD1', green: '#7FB59A'
};

export interface Beat {
  screen: string;
  dur: number;                 // kare (30 fps)
  caption: string;             // ekranın altında kısa cümle
  /** Tam sayfa ekranda kaydırma: başlangıç → bitiş (CSS piksel). */
  scroll?: [number, number];
  /** Bu öğeye yakınlaş (meta kutusu). */
  focus?: string;
  zoom?: number;
  /** Vuruşun sonunda bu öğeye dokunulur (bir sonraki ekrana geçişi anlatır). */
  tap?: string;
  /** Öğeyi çerçevele ve etiketle. */
  mark?: { box: string; label: string }[];
}

export interface Chapter {
  id: string;
  hue: Hue;
  tag: string;        // "Mağaza telefonu"
  title: string;      // büyük başlık
  where: string;      // "Nerede: Giriş ekranı → Reçeteler"
  beats: Beat[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'lobi', hue: 'sand', tag: 'Mağaza telefonu', title: 'Adına dokun,\nPIN’ini gir.', where: 'Uygulamayı açınca ilk ekran',
    beats: [
      { screen: 'lobi', dur: 66, caption: 'Müdürler üstte, baristalar altta.', mark: [{ box: 'mudurler', label: 'Müdürler' }, { box: 'baristalar', label: 'Baristalar' }] },
      { screen: 'lobi', dur: 54, caption: 'Ölçüye bakmak için PIN bile gerekmez.', mark: [{ box: 'receteler', label: 'PIN’siz reçeteler' }], tap: 'receteler' }
    ]
  },
  {
    id: 'recete', hue: 'amber', tag: 'Reçeteler', title: 'Servis sırasında\nsaniyeler içinde.', where: 'Giriş ekranı → Reçeteler',
    beats: [
      { screen: 'receteler', dur: 48, caption: '67 içecek, kategorilere göre.', mark: [{ box: 'arama', label: 'İçecek ya da malzeme ara' }] },
      { screen: 'receteler-ara', dur: 54, caption: '“ube” yaz: içinde ube olan her içecek.', mark: [{ box: 'sonuc', label: 'Ube Latte' }], tap: 'sonuc' },
      { screen: 'recete', dur: 90, caption: 'Bardak şeması, 8 oz / 12 oz ölçüler, adım adım hazırlanış.', scroll: [0, 300], mark: [{ box: 'bardak', label: 'Bardak şeması' }] }
    ]
  },
  {
    id: 'bugun', hue: 'sand', tag: 'Bugün', title: 'Ne yapacağın\nana ekranda.', where: 'PIN’den sonra ilk ekran',
    beats: [
      { screen: 'pin', dur: 36, caption: '4 haneli kişisel PIN.', tap: 'tus' },
      { screen: 'bugun', dur: 60, caption: 'Önlük rozetin ve bir sonrakine kalan.', mark: [{ box: 'kahraman', label: 'Rozetin ve ilerlemen' }] },
      { screen: 'bugun', dur: 84, caption: 'Reçeteler · girmen gereken sınav · kaldığın ders · bülten.',
        mark: [{ box: 'recete', label: 'Reçeteler' }, { box: 'sinav', label: 'Sınav' }, { box: 'ders', label: 'Kaldığın ders' }, { box: 'bulten', label: 'Bülten' }] },
      { screen: 'bugun', dur: 66, caption: 'Başarımlar, eğitim yolları ve tüm bölümler aşağıda.', scroll: [0, 780] }
    ]
  },
  {
    id: 'akademi', hue: 'sky', tag: 'Akademi', title: 'Kitapçığın tamamı\nders oldu.', where: 'Alt menü → Akademi',
    beats: [
      { screen: 'akademi', dur: 54, caption: '4 eğitim yolu · 13 modül · 96 ders.', mark: [{ box: 'icecek', label: 'Eğitim yolu' }] },
      { screen: 'ders', dur: 60, caption: 'Fotoğraf, bardak şeması, adımlar. Bitince “Tamamladım”.', mark: [{ box: 'tamam', label: 'Sonraki derse geç' }] }
    ]
  },
  {
    id: 'sinav', hue: 'rose', tag: 'Sınav', title: 'Her denemede\nfarklı sorular.', where: 'Modül → Sınava gir',
    beats: [
      { screen: 'sinav-giris', dur: 48, caption: 'Soru sayısı, süre, geçme notu baştan belli.', tap: 'basla' },
      { screen: 'sinav-soru', dur: 66, caption: 'Soru başına 1,5 dakika. Yarım kalırsa kaldığın yerden.', mark: [{ box: 'secenek', label: 'Seçtiğin şık' }] },
      { screen: 'sinav-sonuc', dur: 66, caption: 'Yanlışların, doğrusu ve nedeniyle.', scroll: [0, 120] }
    ]
  },
  {
    id: 'ben', hue: 'violet', tag: 'Ben', title: 'Rookie’den\nPro’ya.', where: 'Alt menü → Ben',
    beats: [
      { screen: 'ben', dur: 66, caption: 'Önlük rozeti: neyi tamamlarsan sıradakini alırsın.', mark: [{ box: 'rozet', label: 'Önlük rozetin' }], scroll: [140, 140] },
      { screen: 'ben', dur: 60, caption: '18 başarım; otomatik hesaplanır, elle verilmez.', scroll: [140, 520] }
    ]
  },
  {
    id: 'mudur', hue: 'rose', tag: 'Mağaza müdürü', title: 'Ekip ve talepler\naynı yerde.', where: 'Ben → Ekibim · Talepler',
    beats: [
      { screen: 'ekip', dur: 54, caption: 'Ekibin ilerlemesi, rozetleri, son sınavları.', mark: [{ box: 'gorev', label: 'Görev ata' }] },
      { screen: 'talep-yeni', dur: 60, caption: 'Arıza, servis, malzeme: fotoğraflı talep, “acil” işaretiyle.', mark: [{ box: 'ariza', label: 'Arıza' }] },
      { screen: 'talepler', dur: 48, caption: 'Yanıt gelince “Yeni yanıt” görünür.', mark: [{ box: 'ilk', label: 'Talebin ve durumu' }] }
    ]
  },
  {
    id: 'panel', hue: 'green', tag: 'Kahve Operasyonu', title: 'Bütün şubeler\ntek ekranda.', where: 'Kahve Operasyonu girişi',
    beats: [
      { screen: 'panel-genel', dur: 72, caption: 'Şube şube ilerleme, sınavlar, en çok yanlış yapılan sorular.', scroll: [0, 520] },
      { screen: 'panel-talepler', dur: 54, caption: 'Kartlara dokun, liste süzülsün: acil, onay bekleyen, çözülen.', mark: [{ box: 'acil', label: 'Acil' }, { box: 'onay', label: 'Onay bekleyen' }] },
      { screen: 'panel-onaylar', dur: 60, caption: 'Bölge müdürünün değişikliği onayınla yayına girer.', mark: [{ box: 'yayinla', label: 'Olduğu gibi yayınla' }, { box: 'duzelt', label: 'Düzelt ve yayınla' }] },
      { screen: 'panel-rozetler', dur: 66, caption: 'Rozet kuralları, teslim ve geri alma Kahve Operasyon Müdürü’nde.', scroll: [0, 260], mark: [{ box: 'teslim', label: 'Teslim edildi' }] },
      { screen: 'panel-bulten', dur: 54, caption: 'Bülteni kim okudu, kim okumadı.', mark: [{ box: 'okuyan', label: 'Okumayanlar' }] }
    ]
  }
];

export const FPS = 30;
export const INTRO = 66;
export const OUTRO = 96;
/** Bölüm başlığı, ilk ekrandan önce tek başına bu kadar görünür. */
export const CHAPTER_LEAD = 30;

export const chapterLength = (c: Chapter) => CHAPTER_LEAD + c.beats.reduce((s, b) => s + b.dur, 0);
export const TOTAL = INTRO + CHAPTERS.reduce((s, c) => s + chapterLength(c), 0) + OUTRO;
