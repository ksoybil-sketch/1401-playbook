/**
 * Yönetim kurulu videosu (~2 dk, yatay). İzleyen son kullanıcı değil, karar
 * verecek kurul: neden yapıldı, neyi çözüyor, ne kazandırıyor, sırada ne var.
 *
 * Rakamlar uygulamanın kendisinden: src/generated/curriculum.json (4 yol,
 * 13 modül, 96 ders, 1.290 soru), reçete listesi (67 içecek), başarımlar (18).
 * Her sahne bir cümle seslendirir (capture/ses.mjs); süre sesten gelir.
 */
export type Gorsel =
  | { tur: 'logo' }
  | { tur: 'sorular'; maddeler: string[] }
  | { tur: 'donusum'; once: string; sonra: string }
  | { tur: 'telefon'; ekran: string; kaydir?: [number, number] }
  | { tur: 'masaustu'; ekran: string; yakin?: number; merkez?: string }
  | { tur: 'cihazlar' }
  | { tur: 'kapanis'; hazir: string[]; adim: string[] };

export interface Sahne {
  ust?: string;            // küçük başlık ("Eğitim")
  baslik?: string;         // büyük başlık
  rakamlar?: [string, string][];
  metin: string;           // altyazı + seslendirme
  ses?: string;            // okunuşu farklıysa
  gorsel: Gorsel;
}

export const KURUL: Sahne[] = [
  {
    metin: '1401 Campus: 1401’in eğitim kitapçığını, reçetelerini ve mağaza operasyonunu tek bir uygulamada toplayan yeni sistemimiz.',
    gorsel: { tur: 'logo' }
  },
  {
    metin: 'Her şubede aynı kaliteyi sunmak birkaç sorunun cevabına bağlı. Yeni başlayan bir barista standardı nereden öğreniyor? Bir reçete değişince herkese ulaştı mı? Hangi şube eğitimde nerede? Bir arıza ne zaman bildirildi, ne zaman çözüldü?',
    gorsel: { tur: 'sorular', maddeler: [
      'Yeni başlayan barista standardı nereden öğreniyor?',
      'Bir reçete değişince herkese ulaştı mı?',
      'Hangi şube eğitimde nerede?',
      'Bir arıza ne zaman bildirildi, ne zaman çözüldü?'
    ] }
  },
  {
    metin: 'Bu cevaplar bugüne kadar kitapçıkta ve kişilerin hafızasındaydı; ölçmek ve takip etmek zordu. 1401 Campus bunları ölçülebilir hâle getiriyor.',
    gorsel: { tur: 'donusum', once: 'Kitapçık ve hafıza', sonra: 'Ölçülebilir, takip edilebilir' }
  },
  {
    ust: 'Eğitim', baslik: 'Kitapçığın tamamı\nuygulamada',
    rakamlar: [['96', 'ders'], ['13', 'modül'], ['1.290', 'soru']],
    metin: 'Kitapçığın tamamı 96 derse ve 13 modüle dönüştü. Her modül bir sınavla biter; 1.290 soruluk bankadan her denemede farklı sorular gelir.',
    ses: 'Kitapçığın tamamı doksan altı derse ve on üç modüle dönüştü. Her modül bir sınavla biter; bin iki yüz doksan soruluk bankadan her denemede farklı sorular gelir.',
    gorsel: { tur: 'telefon', ekran: 'akademi' }
  },
  {
    ust: 'Servis', baslik: 'Reçete,\nsaniyeler içinde',
    rakamlar: [['67', 'içecek']],
    metin: 'Servis sırasında 67 içeceğin reçetesi, bardak şemasıyla, PIN bile gerekmeden saniyeler içinde açılır.',
    ses: 'Servis sırasında altmış yedi içeceğin reçetesi, bardak şemasıyla, pin bile gerekmeden saniyeler içinde açılır.',
    gorsel: { tur: 'telefon', ekran: 'recete', kaydir: [0, 260] }
  },
  {
    ust: 'Motivasyon', baslik: 'Önlük rozeti\nkurala bağlı',
    rakamlar: [['4', 'rozet'], ['18', 'başarım']],
    metin: 'Önlük rozetleri artık açık kurallara bağlı. Barista bir sonraki rozet için neyi tamamlaması gerektiğini görür; başarımlar ilerlemeyi teşvik eder.',
    gorsel: { tur: 'telefon', ekran: 'bugun' }
  },
  {
    ust: 'Görünürlük', baslik: 'Bütün şubeler\ntek ekranda',
    metin: 'Yönetim bütün şubeleri tek ekranda görür: kim hangi eğitimde, hangi sorular en çok yanlış yapılıyor, hangi görev gecikti.',
    gorsel: { tur: 'masaustu', ekran: 'y-c-genel' }
  },
  {
    ust: 'Operasyon', baslik: 'Talepler\nkayıt altında',
    metin: 'Arıza, servis ve malzeme talepleri kayıt altında: kim bildirdi, ne zaman yanıtlandı, ne zaman çözüldü. Bir duyuruyu kimin okuduğu bile belli.',
    gorsel: { tur: 'masaustu', ekran: 'y-u-talepler' }
  },
  {
    ust: 'Kontrol', baslik: 'Standart\ntek elden',
    metin: 'İçerikteki her değişiklik Kahve Operasyon Müdürünün onayıyla yayına girer. Standardı tek elden yönetiriz.',
    gorsel: { tur: 'masaustu', ekran: 'y-c-ne-degisiyor', yakin: 1.4, merkez: '50% 30%' }
  },
  {
    ust: 'Maliyet', baslik: 'Ek donanım yok.\nSunucu maliyeti yok.',
    metin: 'Uygulama telefon, tablet ve bilgisayarda çalışır; ek donanım gerekmez. Ücretsiz bulut planında çalıştığı için bugünkü ölçekte sunucu maliyeti yoktur.',
    gorsel: { tur: 'cihazlar' }
  },
  {
    metin: 'Uygulama hazır, kullanım rehberleri hazır, ekip demoda deniyor. Önerimiz: önce bir şubede pilot ile başlamak, ardından bütün şubelere yaymak.',
    gorsel: { tur: 'kapanis', hazir: ['Uygulama', 'Kullanım rehberleri', 'Deneme ortamı (demo)'], adim: ['Pilot şube', 'Bütün şubeler'] }
  }
];

export const kurulCumleleri = () => KURUL.map((s) => s.ses || s.metin);
