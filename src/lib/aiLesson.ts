import { z } from 'zod';
import type { LessonBlock } from '../../shared/types';
import type { DraftQuestion, ImportResult } from './importLesson';

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
 * geliştirici, Kahve Operasyon Direktörü ve Bölge Müdürü okuyabilir. Spark
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
  kind: z.enum(['olcu', 'malzeme', 'adim', 'teknik', 'servis', 'kavram', 'durum', 'kural'])
});

const LessonSchema = z.object({
  title: z.string(),
  durationMin: z.number().int(),
  blocks: z.array(BlockSchema),
  questions: z.array(QuestionSchema),
  notes: z.array(z.string()).describe('Kahve Operasyonu için uyarılar: okunamayan yerler, emin olunmayan çeviriler')
});

const SYSTEM = `Sen 1401 Coffee'nin eğitim içeriği editörüsün. Baristalar için mobil uygulamada okunacak dersler ve sınav soruları hazırlıyorsun.

Ders:
- Her zaman Türkçe yaz. Kaynak başka dildeyse çevir; kahve terimlerini (latte art, crema, microfoam, pitcher) baristaların kullandığı biçimde bırak, ilk geçtiği yerde kısaca açıkla.
- Kaynağı özetleme değil, öğretilebilir bir ders yap: kısa bloklar, telefonda okunacak uzunlukta paragraflar (en fazla 3-4 cümle), uygulama adımları "steps", ölçü/sıcaklık/süre gibi standartlar "spec" tablosu, önemli hatalar "warning", püf noktaları "tip".
- Kaynakta olmayan ölçü, sıcaklık, süre uydurma. Emin olmadığın yeri notes'a yaz.
- Ders içine 1-2 "check" alıştırması koy.
- durationMin: dersin okunma süresi (dakika).

Sorular:
- 10-15 soru üret; sınav havuzuna girecekler.
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
  file: File, apiKey: string, context: { moduleTitle?: string }, onProgress?: (m: string) => void
): Promise<ImportResult> {
  if (file.size > MAX_BYTES) throw new Error('Dosya 20 MB\'tan büyük. Daha küçük bir PDF ya da sayfa sayfa görsel dene.');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const imageType = (['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const).find((x) => x === file.type);
  if (!isPdf && !imageType) throw new Error('Yapay zekâ ile okuma PDF ve görsel (PNG, JPEG, WEBP) dosyaları içindir.');

  onProgress?.('Dosya hazırlanıyor…');
  const data = toBase64(await file.arrayBuffer());
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { betaZodOutputFormat } = await import('@anthropic-ai/sdk/helpers/beta/zod');
  // Sunucu yok (Spark): çağrı tarayıcıdan. Bkz. dosya başındaki not.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  onProgress?.('Claude dosyayı okuyor, ders ve sorular hazırlanıyor… (1-2 dakika sürebilir)');
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: betaZodOutputFormat(LessonSchema) },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        isPdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
          : { type: 'image', source: { type: 'base64', media_type: imageType!, data } },
        {
          type: 'text',
          text: `Bu dosyadan bir ders ve sınav soruları hazırla.${context.moduleTitle ? ` Ders "${context.moduleTitle}" modülüne eklenecek.` : ''} Dosya adı: ${file.name}`
        }
      ]
    }]
  });

  if (response.stop_reason === 'refusal') throw new Error('Model bu dosyayı işlemeyi reddetti.');
  if (response.stop_reason === 'max_tokens') throw new Error('Dosya tek derste işlenemeyecek kadar uzun. Bölümlere ayırıp ayrı ayrı yükle.');
  const out = response.parsed_output;
  if (!out) throw new Error('Yanıt okunamadı, tekrar dene.');

  const blocks = out.blocks.map(toBlock).filter((b): b is LessonBlock => !!b);
  const questions: DraftQuestion[] = out.questions
    .filter((q) => q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
    .map((q) => ({ ...q, options: q.type === 'truefalse' ? ['Doğru', 'Yanlış'] : q.options }));
  return {
    title: out.title,
    durationMin: Math.max(1, out.durationMin),
    blocks,
    questions,
    source: 'ai',
    warnings: ['Yapay zekâ ile hazırlandı: ölçüleri ve çevirileri yayınlamadan önce kontrol et.', ...out.notes]
  };
}
