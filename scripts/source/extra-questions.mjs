/**
 * Elle yazılmış ek sorular — üreteçlerin çıkaramadığı karşılaştırmalar.
 *
 * İtalyan Klasikler'de dört içecek de aynı 18 gr dozdan, neredeyse
 * yalnızca espresso ve sütle yapılıyor; malzemeye dayalı üreteçler bu
 * yüzden az soru çıkarıyordu (banka 26). Buradaki her bilgi 2026 menü
 * reçetelerinde yazılıdır (süre, miktar, oran) — kaynakta olmayan bir
 * standart eklenmedi.
 *
 * Biçim: ilk seçenek doğru cevaptır (sınavda şıklar karıştırılır).
 */
const Q = (prompt, options, explanation, kind) => ({ type: 'single', prompt, options, answer: 0, explanation, kind });
const TF = (prompt, isTrue, explanation, kind) =>
  ({ type: 'truefalse', prompt, options: ['Doğru', 'Yanlış'], answer: isTrue ? 0 : 1, explanation, kind });

export const EXTRA_QUESTIONS = {
  'italyan-klasikler': [
    Q('Ristretto ile espresso arasındaki temel fark nedir?',
      ['Aynı 18 gr kahveden daha kısa sürede (15–17 sn) daha az kahve (20 ml) alınır',
        'Ristretto için daha fazla kahve (25 gr) kullanılır',
        'Ristretto süt köpüğüyle servis edilir',
        'Ristretto daha uzun sürede (35 sn) alınır'],
      'Doz aynı (18 gr); ristretto 15–17 saniyede 20 ml, espresso 24–27 saniyede 40 ml.', 'fark'),
    Q('40 ml espresso kaç saniyede alınmalıdır?', ['24–27 saniye', '15–17 saniye', '30–35 saniye', '18–20 saniye'],
      'Espresso: 24–27 saniyede 40 ml.', 'teknik'),
    Q('Ristretto kaç saniyede alınmalıdır?', ['15–17 saniye', '24–27 saniye', '8–10 saniye', '30–35 saniye'],
      'Ristretto: 15–17 saniyede 20 ml.', 'teknik'),
    Q('Espresso Cortado’da espresso / süt oranı nedir?', ['1:1', '1:2', '1:3', '2:1'],
      'Cortado: espresso miktarı kadar (40 ml) ısıtılmış süt eklenir — oran 1:1.', 'olcu'),
    Q('Espresso Cortado’ya ne kadar süt eklenir?', ['40 ml', '20 ml', '80 ml', '1 tatlı kaşığı'],
      'Cortado: demlenen espresso kadar, yani 40 ml süt.', 'olcu'),
    Q('Espresso Macchiato’yu espressodan ayıran nedir?',
      ['Üzerine yalnızca 1 tatlı kaşığı süt köpüğü eklenmesi', '40 ml ısıtılmış süt eklenmesi', 'Daha kısa sürede alınması', 'Sıcak su eklenmesi'],
      'Macchiato: 40 ml espresso + üzerine 1 tatlı kaşığı süt köpüğü.', 'fark'),
    Q('Hangi içecekte süt yalnızca 1 tatlı kaşığı köpük olarak kullanılır?',
      ['Espresso Macchiato', 'Espresso Cortado', 'Ristretto', 'Espresso'],
      'Macchiato’da süt, 1 tatlı kaşığı köpükten ibarettir; Cortado’da 40 ml süt vardır.', 'eslestir'),
    Q('Ristretto, Espresso, Macchiato ve Cortado’da ortak olan nedir?',
      ['18 gr öğütülmüş kahve dozu', '40 ml espresso miktarı', '15–17 saniyelik akış', 'Süt köpüğü'],
      'Dördünde de doz 18 gr; değişen akış süresi, miktar ve süttür.', 'kavram'),
    Q('Hangi içecekte espresso miktarı 20 ml’dir?', ['Ristretto', 'Espresso', 'Espresso Macchiato', 'Espresso Cortado'],
      'Ristretto 20 ml; diğerlerinde 40 ml espresso.', 'eslestir'),
    Q('Cortado’ya eklenen süt nasıl hazırlanır?',
      ['Isıtılıp krema kıvamına getirilir', 'Soğuk olarak eklenir', 'Yalnızca köpüğü kaşıkla alınır', 'Buzla çalkalanır'],
      'Cortado: ısıtıp krema kıvamına getirdiğin sütü (40 ml) ekle.', 'teknik'),
    TF('Portafiltredeki kahve, öğütülmüş kahve portafiltreye alınmadan önce tamplenir.', false,
      'Sıra: kahveyi portafiltreye al → tamper ile tample → demle.', 'adim'),
    TF('Ristretto, espressodan daha fazla kahve dozuyla hazırlanır.', false,
      'İkisinde de doz 18 gr; ristretto daha kısa akıştır.', 'kavram'),
    TF('Espresso Macchiato’ya bir bardak dolusu süt eklenir.', false,
      'Macchiato’da yalnızca 1 tatlı kaşığı süt köpüğü vardır.', 'malzeme'),
    TF('Cortado’da süt miktarı espresso miktarına eşittir.', true,
      'Cortado oranı 1:1 — 40 ml espresso, 40 ml süt.', 'olcu')
  ]
};
