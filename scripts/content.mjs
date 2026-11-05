/**
 * 1401 Playbook — başlangıç müfredatı.
 *
 * Kaynaklar (hepsi 1401 Coffee'nin kendi materyalleri):
 *  - 1401 İşletme Manueli (İşletme Standartları Coffee Shop.pdf, 2025)
 *  - PERSONEL EĞİTİM KONULARI.docx
 *  - 1401 AOS reçete kitabı (76 reçete) ve soru bankası (73 soru)
 *
 * Bu dosya yalnızca ilk yükleme içindir; sonrasında içerik uygulamadaki
 * İçerik editöründen yönetilir.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { QUESTION_BANKS } from './source/aos-questions.ts';

const here = dirname(fileURLToPath(import.meta.url));
const RECIPES = JSON.parse(readFileSync(join(here, 'source/aos-recipes.json'), 'utf8'));

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

/** Soru: ilk seçenek doğru cevaptır (sınavda sunucu karıştırır). */
const Q = (prompt, correct, wrong, explanation) => ({ type: 'single', prompt, options: [correct, ...wrong], answer: 0, explanation });
const TF = (prompt, isTrue, explanation) => ({ type: 'truefalse', prompt, options: ['Doğru', 'Yanlış'], answer: isTrue ? 0 : 1, explanation });

const fromAos = (bank, ids) =>
  QUESTION_BANKS[bank]
    .filter((q) => !ids || ids.includes(Number(q.id.split('-')[1])))
    .map((q) => ({ type: 'single', prompt: q.questionText, options: q.options, answer: q.options.indexOf(q.correctAnswer), explanation: '' }));

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

const CATEGORY_MODULES = [
  { id: 'sicak-kahveler', title: 'Sıcak Kahveler', cats: ['Sıcak Kahveler'], description: 'Espresso bazlı sıcak kahvelerin ölçü, bardak ve hazırlanış standartları.' },
  { id: 'demleme-yoresel', title: 'Demleme ve Yöresel Kahveler', cats: ['Demlenmiş Kahveler', 'Yöresel Kahveler'], description: 'Filtre, demleme yöntemleri ve geleneksel kahvelerimiz.' },
  { id: 'soguk-kahveler', title: 'Soğuk Kahveler', cats: ['Soğuk Kahveler'], description: 'Buzlu ve blender\'lı kahvelerin porsiyonlama standartları.' },
  { id: 'soguk-icecekler', title: 'Soğuk İçecekler', cats: ['Soğuk İçecekler'], description: 'Limonata, frozen, milkshake ve diğer soğuk içecekler.' },
  { id: 'sicak-icecekler', title: 'Sıcak İçecekler ve Çaylar', cats: ['Sıcak İçecekler', 'Bitki Çayları'], description: 'Sıcak çikolata, salep, çay ve bitki çayları.' }
];

const titleCase = (s) => s.toLocaleLowerCase('tr').replace(/(^|\s|-)(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr'));
const slug = (s) => s.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function parseRecipe(r) {
  let text = (r.instructions || '').trim();
  const cupMatch = text.match(/^(\d+\s*OZ)\s*(BARDAK|KUPA|FİNCAN|FINCAN)?/i);
  const cup = cupMatch ? `${cupMatch[1].replace(/\s+/, ' ').toUpperCase()} ${cupMatch[2] ? titleCase(cupMatch[2]) : 'Bardak'}` : null;
  if (cupMatch) text = text.slice(cupMatch[0].length).trim();
  let note = null;
  const pi = text.search(/Porsiyonlama\s*:/i);
  if (pi >= 0) {
    note = text.slice(pi).replace(/Porsiyonlama\s*:\s*/i, '').trim();
    text = text.slice(0, pi).trim();
  }
  const steps = text.split(/(?<=[.!])\s*(?=\p{Lu})|\.\s+/u).map((s) => s.replace(/\.$/, '').trim()).filter((s) => s.length > 2);
  return { cup, steps, note };
}

function recipeLesson(r, order) {
  const { cup, steps, note } = parseRecipe(r);
  const name = titleCase(r.name);
  const blocks = [
    SPEC([...(cup ? [['Bardak', cup]] : []), ...r.ingredients.map((i) => [titleCase(i.name), i.amount])]),
    ...(steps.length ? [H('Hazırlanışı'), STEPS(...steps)] : []),
    ...(note ? [TIP(`**Porsiyonlama:** ${note}`)] : []),
    TIP('Ürünü teslim etmeden önce standarda ve sunuma uygunluğunu **gözle kontrol et**. Standart dışı ürün misafire sunulmaz.')
  ];
  return { id: `r-${slug(r.name)}`, title: name, durationMin: 2, order, blocks, _recipe: r, _cup: cup };
}

/** Reçetelerden sınav soruları: malzeme ölçüsü ve bardak boyu. */
function recipeQuestions(lessons, allRecipes) {
  const out = [];
  const amountsByIngredient = new Map();
  allRecipes.forEach((r) => r.ingredients.forEach((i) => {
    const k = i.name.toLocaleLowerCase('tr').trim();
    if (!amountsByIngredient.has(k)) amountsByIngredient.set(k, new Set());
    amountsByIngredient.get(k).add(i.amount.trim());
  }));
  const cups = [...new Set(lessons.map((l) => l._cup).filter(Boolean))];
  const allCups = ['8 OZ Bardak', '12 OZ Bardak', '16 OZ Bardak', '4 OZ Bardak', ...cups];

  const numericVariants = (amount) => {
    const m = amount.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!m) return [];
    const n = parseFloat(m[1].replace(',', '.'));
    const unit = m[2];
    const step = n >= 100 ? 30 : n >= 20 ? 10 : n >= 5 ? 5 : 1;
    return [n - step, n + step, n + 2 * step, n - 2 * step].filter((x) => x > 0).map((x) => `${Math.round(x)} ${unit}`.trim());
  };

  for (const l of lessons) {
    const r = l._recipe;
    const name = titleCase(r.name);
    const measurable = r.ingredients.filter((i) => /\d/.test(i.amount));
    // En belirleyici iki malzeme: önce espresso/süt dışı olanlar (şurup, toz, sos), sonra ana malzemeler.
    const ranked = [...measurable].sort((a, b) => {
      const base = (x) => /espresso|süt|su$|buz/i.test(x.name) ? 1 : 0;
      return base(a) - base(b);
    }).slice(0, 2);
    for (const ing of ranked) {
      const pool = [...(amountsByIngredient.get(ing.name.toLocaleLowerCase('tr').trim()) || [])].filter((a) => a !== ing.amount.trim() && /\d/.test(a));
      const wrong = [...new Set([...pool, ...numericVariants(ing.amount)])].filter((a) => a.replace(/\s/g, '') !== ing.amount.replace(/\s/g, '')).slice(0, 3);
      if (wrong.length < 3) continue;
      out.push(Q(`${name} reçetesinde ${titleCase(ing.name).toLocaleLowerCase('tr')} ölçüsü nedir?`, ing.amount.trim(), wrong,
        `${name}: ${r.ingredients.map((i) => `${titleCase(i.name)} ${i.amount}`).join(', ')}.`));
    }
    if (l._cup) {
      const wrong = [...new Set(allCups)].filter((c) => c !== l._cup).slice(0, 3);
      if (wrong.length === 3) out.push(Q(`${name} hangi bardakta servis edilir?`, l._cup, wrong, `${name} ${l._cup} ile servis edilir.`));
    }
  }
  return out;
}

const drinks = {
  id: 'icecek-standartlari', title: 'İçecek Standartları', icon: 'coffee',
  description: 'Menüdeki her içeceğin ölçüsü, bardağı ve hazırlanışı. Misafire giden her bardak aynı olmalı.',
  modules: CATEGORY_MODULES.map((cm) => {
    const recipes = RECIPES.filter((r) => cm.cats.includes(r.category)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
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
        }
      ],
      questions: [
        ...fromAos('complaints'),
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
        }
      ],
      questions: [
        ...fromAos('logistics'),
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
