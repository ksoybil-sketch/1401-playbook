import { z } from 'zod';
import type { LessonBlock } from '../../shared/types';
import type { DraftQuestion, ImportResult } from './importLesson';
import { lessonMinutes } from './pdfLesson';
import { loadChunk } from './chunk';

/**
 * Dosyadan ders + soru üretimi — Claude ile.
 *
 * PDF (metinli ya da taranmış) ve görseller olduğu gibi modele gönderilir;
 * Claude sayfaları görüntü olarak da okuduğu için OCR'a gerek kalmaz ve
 * İngilizce bir makaleden Türkçe ders çıkarabilir. Çıktı yapılandırılmış
 * (JSON şeması) gelir; ders yine taslak olarak kaydedilir, sorular seçilerek
 * eklenir, bölge müdürünün yaptığı her şey onaya düşer.
 *
 * Anahtar (bkz. aiKey.ts): config/ai belgesinde tutulur, kurallar gereği yalnızca
 * geliştirici, Kahve Operasyon Direktörü, Operasyon Müdürü, Bölge Müdürü ve
 * Kahve Operasyonu okuyabilir. Spark
 * planında sunucu (Cloud Functions) olmadığı için çağrı tarayıcıdan yapılır;
 * bu yüzden anahtar bu kişilerin tarayıcısına iner. Anthropic Console'da bu
 * iş için ayrı, harcama sınırı konmuş bir anahtar açılmalı.
 */

const MODEL = 'claude-opus-5-5';
const MAX_BYTES = 20 * 1024 * 1024;

const BlockSchema = z.object({
  type: z.enum(['heading', 'text', 'tip', 'warning', 'steps', 'spec', 'check']),
  text: z.string().nullable().describe('heading/text/tip/warning için metin; diğerlerinde null'),
  items: z.array(z.string()).nullable().describe('steps için sıralı adımlar'),
  rows: z.array(z.object({ label: z.string(), value: z.string() })).nullable().describe('spec için standart tablosu satırları'),
  prompt: z.string().nullable().describe('check (ders içi alıştırma) sorusu'),
  options: z.array(z.string()).nullable(),
  answer: z.number().int().nullable().describe('options içinde doğru şıkkın 0 tabanlı indeksi'),
  explanation: z.string().nullable()
});

const QuestionSchema = z.object({
  type: z.enum(['single', 'truefalse']),
  prompt: z.string(),
  options: z.array(z.string()).describe('single: 4 şık; truefalse: ["Doğru","Yanlış"]'),
  answer: z.number().int().describe('doğru şıkkın 0 tabanlı indeksi'),
  explanation: z.string().describe('Yanlış yapan baristaya gösterilecek kısa açıklama'),
  kind: z.enum(['olcu', 'malzeme', 'adim', 'teknik', 'servis', 'kavram', 'durum', 'kural']),
  lesson: z.number().int().describe('Sorunun dayandığı dersin lessons içindeki 0 tabanlı sırası')
});

const LessonSchema = z.object({
  title: z.string(),
  durationMin: z.number().int(),
  blocks: z.array(BlockSchema)
});

const OutputSchema = z.object({
  lessons: z.array(LessonSchema).describe('Kaynağın bölümlerine göre sıralı dersler'),
  questions: z.array(QuestionSchema),
  notes: z.array(z.string()).describe('Kahve Operasyonu için uyarılar: okunamayan yerler, emin olunmayan çeviriler')
});

const SYSTEM = `Sen 1401 Coffee'nin eğitim içeriği editörüsün. Baristalar için mobil uygulamada okunacak dersler ve sınav soruları hazırlıyorsun.

Dersler:
- Uygulamadaki mevcut dersler kısa: her ders 1-4 dakikalık (en fazla ~700 kelime), 4-12 bloktan oluşur ve tek bir konuyu anlatır. Kaynağı bölümlerine göre bu boyda derslere böl; kısa bir kaynak tek ders olabilir. Ders adları kısa ve cümle düzeninde olsun ("Şube açılış prosedürü", "Süt köpürtme"); bölüm numarası ("1.2.") koyma.
- Kaynağın düz metnini kopyalama: kapak, künye, içindekiler, sayfa üst/alt bilgisi, form doldurma alanları ve tekrar eden kutu başlıkları derse girmez.
- Her zaman Türkçe yaz. Kaynak başka dildeyse çevir; kahve terimlerini (latte art, crema, microfoam, pitcher) baristaların kullandığı biçimde bırak, ilk geçtiği yerde kısaca açıkla.
- Kaynağı özetleme değil, öğretilebilir bir ders yap: kısa bloklar, telefonda okunacak uzunlukta paragraflar (en fazla 3-4 cümle), uygulama adımları "steps", ölçü/sıcaklık/süre gibi standartlar "spec" tablosu, önemli hatalar "warning", püf noktaları "tip".
- Kaynakta olmayan ölçü, sıcaklık, süre uydurma. Emin olmadığın yeri notes'a yaz.
- text bloklarında **kalın** ve satır başında "- " ile madde listesi kullanılabilir. Anahtar kavramı ya da ölçüyü kalın yaz.
- Her derse 1 "check" alıştırması koy (kısa derslerde de).
- durationMin: dersin okunma süresi (dakika).

Mevcut derslerden bir örnek (biçim ve uzunluk için):
{"title":"Hikayemiz ve değerlerimiz","durationMin":3,"blocks":[
 {"type":"text","text":"Port Group, yeme-içme sektörüne **2015** yılında adım attı. Kahvedeki ilk markamız **1401 Coffee Shop**, Nisan 2023'te Viaport Asia AVM ve Ataşehir Golf Kulübü şubeleriyle hizmete başladı."},
 {"type":"heading","text":"Yola çıkış sloganımız"},
 {"type":"spec","rows":[{"label":"Kahve","value":"Nitelikli"},{"label":"Yiyecek","value":"Lezzetli"},{"label":"Hizmet","value":"Güler yüzlü"}]},
 {"type":"tip","text":"Biz kendimize **#teamgoat** diyoruz."},
 {"type":"check","prompt":"1401'in yola çıkış sloganında hizmet nasıl tarif edilir?","options":["Güler yüzlü","Hızlı","Ekonomik"],"answer":0,"explanation":"Slogan: nitelikli kahve, lezzetli yiyecek, güler yüzlü hizmet."}
]}

Sorular:
- Toplam 10-15 soru üret (çok dersli kaynakta her derse en az 2); sınav havuzuna girecekler. Her soru için lesson alanına dayandığı dersin sırasını yaz.
- Türleri karıştır: yalnızca sayı/gramaj sorma. Teknik (nasıl yapılır, neden), kavram, durum (vardiyada karşılaşılacak senaryo), adım sırası, hata ayıklama ("süt köpüğü büyük kabarcıklı, sebep?") gibi farklı beceriler ölç.
- Çeldiriciler makul olsun; "hepsi", "hiçbiri" ve şakalı şık kullanma; doğru şık uzunluğuyla belli olmasın.
- Her sorunun cevabı kaynakta açıkça yer alsın.`;

const toBase64 = (buf: ArrayBuffer) => {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

function toBlock(b: z.infer<typeof BlockSchema>): LessonBlock | null {
  switch (b.type) {
    case 'heading': case 'text': case 'tip': case 'warning':
      return b.text?.trim() ? { type: b.type, text: b.text.trim() } : null;
    case 'steps':
      return b.items?.length ? { type: 'steps', items: b.items } : null;
    case 'spec':
      return b.rows?.length ? { type: 'spec', rows: b.rows } : null;
    case 'check':
      return b.prompt && b.options && b.options.length >= 2 && b.answer !== null && b.answer >= 0 && b.answer < b.options.length
        ? { type: 'check', prompt: b.prompt, options: b.options, answer: b.answer, explanation: b.explanation || '' }
        : null;
  }
}

export async function lessonFromFileWithAI(
  file: File, apiKey: string,
  context: { moduleTitle?: string; existingTitles?: string[]; pages?: { from: number; to: number; total: number } },
  onProgress?: (m: string) => void
): Promise<ImportResult> {
  if (file.size > MAX_BYTES) throw new Error('Dosya 20 MB\'tan büyük. Daha küçük bir PDF ya da sayfa sayfa görsel dene.');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const imageType = (['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const).find((x) => x === file.type);
  if (!isPdf && !imageType) throw new Error('Yapay zekâ ile okuma PDF ve görsel (PNG, JPEG, WEBP) dosyaları içindir.');

  onProgress?.('Dosya hazırlanıyor…');
  const data = toBase64(await file.arrayBuffer());
  const { default: Anthropic } = await loadChunk(() => import('@anthropic-ai/sdk'));
  const { betaZodOutputFormat } = await loadChunk(() => import('@anthropic-ai/sdk/helpers/beta/zod'));
  // Sunucu yok (Spark): çağrı tarayıcıdan. Bkz. dosya başındaki not.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const ask = [
    'Bu dosyadan ders(ler) ve sınav soruları hazırla.',
    context.pages && (context.pages.from > 1 || context.pages.to < context.pages.total)
      ? `Yalnızca ${context.pages.from}-${context.pages.to}. sayfaları kullan (PDF ${context.pages.total} sayfa); diğer sayfaları yok say.` : '',
    context.moduleTitle ? `Dersler "${context.moduleTitle}" modülüne eklenecek.` : '',
    context.existingTitles?.length ? `Modülde zaten olan dersler (tekrar etme): ${context.existingTitles.join('; ')}.` : '',
    `Dosya adı: ${file.name}`
  ].filter(Boolean).join(' ');

  onProgress?.('Claude dosyayı okuyor, dersler ve sorular hazırlanıyor… (1-3 dakika sürebilir)');
  // Birkaç ders + sorular uzun bir çıktı: akışla alınır, istek zaman aşımına düşmez.
  const response = await client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: betaZodOutputFormat(OutputSchema) },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        isPdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
          : { type: 'image', source: { type: 'base64', media_type: imageType!, data } },
        { type: 'text', text: ask }
      ]
    }]
  }).finalMessage();

  if (response.stop_reason === 'refusal') throw new Error('Model bu dosyayı işlemeyi reddetti.');
  if (response.stop_reason === 'max_tokens') throw new Error('Dosya bir seferde işlenemeyecek kadar uzun. Daha dar bir sayfa aralığı seçip tekrar dene.');
  const out = response.parsed_output;
  if (!out) throw new Error('Yanıt okunamadı, tekrar dene.');

  const lessons = out.lessons
    .map((l) => {
      const blocks = l.blocks.map(toBlock).filter((b): b is LessonBlock => !!b);
      return { title: l.title.trim(), blocks, durationMin: Math.max(1, l.durationMin || lessonMinutes(blocks)) };
    })
    .filter((l) => l.blocks.length);
  const questions: DraftQuestion[] = out.questions
    .filter((q) => q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
    .map((q) => ({ ...q, options: q.type === 'truefalse' ? ['Doğru', 'Yanlış'] : q.options, lesson: q.lesson >= 0 && q.lesson < lessons.length ? q.lesson : undefined }));
  return {
    lessons,
    questions,
    source: 'ai',
    warnings: ['Yapay zekâ ile hazırlandı: ölçüleri ve çevirileri yayınlamadan önce kontrol et.', ...out.notes]
  };
}
