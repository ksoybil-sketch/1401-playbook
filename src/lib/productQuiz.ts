import type { CupLayer, Question, QuestionKind } from '../../shared/types';

/**
 * Yeni ürün akışı için 3 soruluk mini sınav taslağı. Sorular reçetenin
 * kendisinden (ölçüler, katman sırası, hazırlanış) üretilir; Kahve
 * Operasyon Direktörü yayınlamadan önce düzeltebilir. Müfredattaki
 * reçete soruları (scripts/question-gen.mjs) ile aynı dili kullanır.
 */
export type QuizDraft = Pick<Question, 'type' | 'prompt' | 'options' | 'answer' | 'explanation' | 'kind'>;

/** Türkçe duyarlı karşılaştırma anahtarı: "SICAK SU" ile "Sıcak su" aynı şıktır (toLowerCase I/ı'yı ayırmıyordu). */
const key = (x: string) => x.trim().toLocaleLowerCase('tr');
const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.map((x) => x.trim()).filter((x) => x && !seen.has(key(x)) && seen.add(key(x)));
};

function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Doğru şık + çeldiriciler → en çok 4 şık, doğrunun yeri karışık. En az iki
 * çeldirici yoksa (tek şıklı ya da apaçık soru olurdu) null: o soru üretilmez.
 */
function options(correct: string, distractors: string[], seed: number): { options: string[]; answer: number } | null {
  const ds = uniq(distractors).filter((d) => key(d) !== key(correct)).slice(0, 3);
  if (ds.length < 2) return null;
  const opts = shuffle([correct.trim(), ...ds], seed);
  return { options: opts, answer: opts.indexOf(correct.trim()) };
}

const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);

/** "20 / 40 ml" gibi bir ölçüye yakın ama yanlış ölçüler. */
function nearAmounts(l: CupLayer): string[] {
  const out: string[] = [];
  if (l.fill === 'ml' && l.small !== null && l.large !== null && l.small !== l.large) {
    out.push(`${round10(l.small * 1.5)} / ${round10(l.large * 1.25)} ml`, `${round10(l.small * 0.75)} / ${round10(l.large * 0.75)} ml`, `${l.large} ml`);
  } else if (l.fill === 'ml' && (l.large || l.small)) {
    const v = (l.large || l.small)!;
    out.push(`${round10(v * 1.5)} ml`, `${round10(v * 0.6)} ml`, `${round10(v + 30)} ml`);
  }
  return out;
}

const GENERIC = ['Süt köpüğü', 'Sıcak su', 'Buz', 'Karamel sos', 'Vanilya şurubu', 'Krema', 'Kakao tozu', 'Soğuk süt'];

export function draftQuiz(name: string, layers: CupLayer[], steps: string[]): QuizDraft[] {
  const n = name.trim() || 'Bu içecek';
  const seed = [...n].reduce((s, c) => s + c.charCodeAt(0), 0);
  const body = layers.filter((l) => l.name.trim() && l.order < 900).sort((a, b) => a.order - b.order);
  const qs: QuizDraft[] = [];

  // 1) Ölçü: en çok hacim kaplayan malzeme.
  const measured = body.filter((l) => l.text.trim()).sort((a, b) => (b.large || 0) - (a.large || 0));
  if (measured.length) {
    const l = measured[0];
    const others = [...nearAmounts(l), ...measured.slice(1).map((x) => x.text)];
    const o = options(l.text, others, seed);
    if (o) qs.push({ type: 'single', kind: 'olcu', prompt: `${n} reçetesinde ${l.name} ölçüsü nedir?`, ...o,
      explanation: `${n}: ${measured.map((x) => `${x.name} ${x.text}`).join(', ')}.` });
  }

  // 2) Katman sırası ya da malzeme.
  if (body.length >= 2) {
    const first = body[0];
    const o = options(first.name, [...body.slice(1).map((x) => x.name), ...GENERIC], seed + 1);
    if (o) qs.push({ type: 'single', kind: 'katman', prompt: `${n} hazırlanırken bardağa ilk giren malzeme hangisidir?`, ...o,
      explanation: `Sıra: ${body.map((x) => x.name).join(' → ')}.` });
  } else if (body.length === 1) {
    const missing = GENERIC.filter((g) => !body.some((b) => key(b.name) === key(g)));
    const o = options(body[0].name, missing, seed + 1);
    if (o) qs.push({ type: 'single', kind: 'malzeme', prompt: `Hangisi ${n} reçetesinde yer alır?`, ...o, explanation: `${n}: ${body[0].name}.` });
  }

  // 3) Hazırlanış: ilk adım (yeterli adım yoksa doğru/yanlış).
  const st = steps.map((s) => s.trim()).filter(Boolean);
  if (st.length >= 4) {
    const o = options(st[0], st.slice(1), seed + 2);
    if (o) qs.push({ type: 'single', kind: 'adim', prompt: `${n} hazırlanışında ilk adım hangisidir?`, ...o, explanation: `Hazırlanış: ${st.join(' → ')}` });
  } else if (st.length) {
    qs.push({ type: 'truefalse', kind: 'adim', prompt: `${n} hazırlanışına şu adımla başlanır: “${st[0]}”`, options: ['Doğru', 'Yanlış'], answer: 0,
      explanation: `Hazırlanış: ${st.join(' → ')}` });
  }

  // Eksik kaldıysa genel servis soruları (birbirinden farklı; eskiden aynı soru iki kez gelebiliyordu).
  const fallback: QuizDraft[] = [
    { type: 'truefalse', kind: 'servis' as QuestionKind, prompt: `${n} misafire sunulmadan önce standarda ve sunuma uygunluğu gözle kontrol edilir.`,
      options: ['Doğru', 'Yanlış'], answer: 0, explanation: 'Standart dışı ürün misafire sunulmaz.' },
    { type: 'truefalse', kind: 'kural' as QuestionKind, prompt: `${n} reçetesindeki ölçüler göz kararıyla uygulanabilir.`,
      options: ['Doğru', 'Yanlış'], answer: 1, explanation: 'Reçetedeki ölçüler standarttır; göz kararı uygulanmaz.' },
    { type: 'truefalse', kind: 'servis' as QuestionKind, prompt: `Standarda uymayan bir ${n} misafire sunulabilir.`,
      options: ['Doğru', 'Yanlış'], answer: 1, explanation: 'Standart dışı ürün misafire sunulmaz; yeniden hazırlanır.' }
  ];
  for (const f of fallback) if (qs.length < 3) qs.push(f);
  return qs.slice(0, 3);
}
