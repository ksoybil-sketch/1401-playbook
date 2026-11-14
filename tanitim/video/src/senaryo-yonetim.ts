/**
 * Yönetim videosu: Uğur Bey (Bölge Müdürü) ve Cenk Bey (Kahve Operasyon
 * Müdürü) neyi nerede yapar. Masaüstü ekranları (1440×900), yatay video.
 * Akış gerçek iş sırasıyla: Uğur Bey yürütür ve önerir, Cenk Bey onaylar.
 */
import type { Hue } from './script';

export interface DBeat {
  screen: string;
  dur: number;
  caption: string;
  /** Kameranın yaklaşacağı öğe (yonetim.json kutusu); "pano" = açık pencere. */
  focus?: string;
  zoom?: number;
  mark?: { box: string; label: string }[];
  tap?: string;
}

export interface DChapter {
  id: string;
  who: 'ugur' | 'cenk';
  hue: Hue;
  title: string;
  where: string;
  beats: DBeat[];
}

export const PEOPLE = {
  ugur: { name: 'Uğur Can Gürbüz', role: 'Bölge Müdürü', hue: 'sky' as Hue },
  cenk: { name: 'Cenk Girginol', role: 'Kahve Operasyon Direktörü', hue: 'amber' as Hue }
};

export const DCHAPTERS: DChapter[] = [
  {
    id: 'u-kod', who: 'ugur', hue: 'sky', title: 'Barista ve kodlar', where: 'Mağazalar → mağaza → Barista ekle',
    beats: [
      { screen: 'y-u-barista-ekle', dur: 60, caption: 'Yeni barista: ad, mağaza, rol.', focus: 'pano', zoom: 1.25, mark: [{ box: 'ekle', label: 'Ekle ve kod oluştur' }] },
      { screen: 'y-u-davet-kodu', dur: 60, caption: 'Davet kodu 7 gün geçerli. Barista kendi PIN’ini belirler.', focus: 'pano', zoom: 1.35 },
      { screen: 'y-u-telefon-kodu', dur: 54, caption: 'Mağaza telefonu tek kodla şubeye bağlanır.', focus: 'pano', zoom: 1.35 },
      { screen: 'y-u-genel', dur: 54, caption: 'Kodunu kullanmayan herkes Genel bakış’ta “Kod bekleyenler”de.', mark: [{ box: 'menu', label: 'Bölge Müdürü menüsü' }] }
    ]
  },
  {
    id: 'u-talep', who: 'ugur', hue: 'sky', title: 'Talepleri yürütür', where: 'Talepler',
    beats: [
      { screen: 'y-u-talepler', dur: 54, caption: 'Şubelerden arıza, servis, malzeme, personel talepleri.', mark: [{ box: 'liste', label: 'Malzeme talebi' }], tap: 'liste' },
      { screen: 'y-u-talep-yanit', dur: 66, caption: 'Yanıtını yazar, “İşleme al” der; şube anında görür.', focus: 'pano', zoom: 1.15, mark: [{ box: 'isleme', label: 'İşleme al' }] },
      { screen: 'y-u-onaya-gonder', dur: 60, caption: 'Yetkili servis gerekiyorsa teklifiyle Cenk Bey’in onayına gönderir.', focus: 'pano', zoom: 1.15 }
    ]
  },
  {
    id: 'u-icerik', who: 'ugur', hue: 'sky', title: 'Görev ve öneri', where: 'Görevler · Akademi',
    beats: [
      { screen: 'y-u-gorev', dur: 54, caption: 'Mağazaya ya da kişiye ders veya sınav görevi, son tarihle.', focus: 'pano', zoom: 1.15 },
      { screen: 'y-u-ders-duzenle', dur: 60, caption: 'Ders, reçete ölçüsü, soru ya da bülten düzenler…', mark: [{ box: 'kaydet', label: 'Onaya gönder' }], tap: 'kaydet' },
      { screen: 'y-u-ders-onayda', dur: 60, caption: '…ama değişiklik baristalara Cenk Bey onaylayınca gider.', focus: 'not', zoom: 1.6 },
      { screen: 'y-u-onerilerim', dur: 54, caption: 'Önerilerim: bekleyen, yayınlanan, notla geri dönen.', focus: 'ilk', zoom: 1.4 }
    ]
  },
  {
    id: 'c-onay', who: 'cenk', hue: 'amber', title: 'Bekleyen onaylar', where: 'Menü → Bekleyen onaylar',
    beats: [
      { screen: 'y-c-genel', dur: 54, caption: 'Onay bekleyen öneri sayısı menüde.', mark: [{ box: 'onaylar', label: 'Bekleyen onaylar' }], tap: 'onaylar' },
      { screen: 'y-c-onaylar', dur: 60, caption: 'Kim önerdi, ne zaman, ne değişiyor.', mark: [{ box: 'nedegisiyor', label: 'Ne değişiyor' }, { box: 'duzelt', label: 'Düzelt ve yayınla' }, { box: 'yayinla', label: 'Olduğu gibi yayınla' }] },
      { screen: 'y-c-ne-degisiyor', dur: 60, caption: 'Eski → yeni, alan alan. Ders ise baristada nasıl görüneceği de.', mark: [{ box: 'fark', label: 'Eski → yeni' }], focus: 'fark', zoom: 1.2 },
      { screen: 'y-c-yayinlandi', dur: 48, caption: 'Yayınla, düzeltip yayınla ya da notla geri gönder.', mark: [{ box: 'gecmis', label: 'Geçmiş' }] }
    ]
  },
  {
    id: 'c-servis', who: 'cenk', hue: 'amber', title: 'Servis onayı', where: 'Talepler → Onay bekleyen servis',
    beats: [
      { screen: 'y-c-talep-onay', dur: 48, caption: 'Onay bekleyen servisler tek dokunuşla süzülür.', mark: [{ box: 'kart', label: 'Onay bekleyen servis' }] },
      { screen: 'y-c-servis-onayla', dur: 60, caption: 'Teklifi okur, servisi onaylar; şube ve Uğur Bey görür.', focus: 'pano', zoom: 1.15, mark: [{ box: 'onayla', label: 'Servisi onayla' }] }
    ]
  },
  {
    id: 'c-rozet', who: 'cenk', hue: 'amber', title: 'Rozetler ve başarımlar', where: 'Menü → Rozetler',
    beats: [
      { screen: 'y-c-rozetler', dur: 54, caption: 'Kim hangi önlük rozetini hak etti, teslim edildi mi.', mark: [{ box: 'teslim', label: 'Teslim edildi' }] },
      { screen: 'y-c-rozet-kurallari', dur: 60, caption: 'Her rozetin şartı, geçerlilik süresi, nasıl verileceği.', focus: 'mod', zoom: 1.5, mark: [{ box: 'mod', label: 'Otomatik / onayla' }] },
      { screen: 'y-c-basarim-ayar', dur: 48, caption: 'Başarım eşikleri, açık/kapalı, “yalnızca son N gün”.' },
      { screen: 'y-c-barista-istisna', dur: 60, caption: 'Barista bazında: gerekçeyle geri al ya da elle ver.', focus: 'pano', zoom: 1.15, mark: [{ box: 'geri', label: 'Rozeti geri al' }] }
    ]
  },
  {
    id: 'c-ekip', who: 'cenk', hue: 'amber', title: 'Bülten, ekip, içerik', where: 'Bülten · Genel bakış · Akademi',
    beats: [
      { screen: 'y-c-terfi', dur: 54, caption: 'Terfi ve tebrik duyurusu, kişiyi listeden seçerek.', focus: 'pano', zoom: 1.15 },
      { screen: 'y-c-bulten-okuyan', dur: 48, caption: 'Bülteni kim okudu, kim okumadı.', focus: 'okuyan', zoom: 1.5 },
      { screen: 'y-c-ekip', dur: 54, caption: 'Kahve Operasyonu ekibine kişi ekler, rol verir, çıkarır.', focus: 'pano', zoom: 1.25 },
      { screen: 'y-c-dosyadan-ders', dur: 48, caption: 'PDF ya da fotoğraftan ders ve soru taslağı.', focus: 'pano', zoom: 1.15 },
      { screen: 'y-c-gorevler', dur: 48, caption: 'Kimin hangi görevi atadığı, kimin bitirmediği.', mark: [{ box: 'atayan', label: 'Atayan süzgeci' }] }
    ]
  }
];

export const D_INTRO = 84;
export const D_OUTRO = 120;
export const D_LEAD = 36;
export const dChapterLength = (c: DChapter) => D_LEAD + c.beats.reduce((s, b) => s + b.dur, 0);
export const D_TOTAL = D_INTRO + DCHAPTERS.reduce((s, c) => s + dChapterLength(c), 0) + D_OUTRO;
