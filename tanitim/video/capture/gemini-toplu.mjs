/**
 * Gemini'nin ücretsiz kotası günde 10 istek; rehberlerde ise 82 cümle var.
 * Bu betik cümleleri sırayla ~900 karakterlik parçalara toplar, her parçayı
 * TEK istekte seslendirir, sonra capture/bol.py ile kaydı Whisper'ın kelime
 * zamanlarına göre yeniden cümlelere böler. Çıkan dosyalar ses.mjs'in
 * beklediği adlarla yazılır (gemini|ses|üslup|cümle özeti); ses.mjs sonra
 * yalnızca sürelerini ölçer, istek atmaz.
 *
 *   node capture/gemini-toplu.mjs                 eksik cümleleri üret
 *   PARCA=900 GEMINI_MODEL=… node capture/gemini-toplu.mjs
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { REHBERLER, cumleler } from '../src/rehber/senaryo.ts';
import { geminiTTS } from './gemini-tts.mjs';
import { PROFILLER, spokenOf } from './ses-profil.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'rehber-ses');
const TMP = join(here, '..', '.toplu');
mkdirSync(TMP, { recursive: true });
const p = PROFILLER.rehber;
const LIMIT = Number(process.env.PARCA || 900);
const MODEL = process.env.GEMINI_MODEL || '';

// Rehber sırasıyla (videodaki akış), tekrarlar bir kez.
const order = [];
for (const r of REHBERLER) for (const t of cumleler(r)) if (!order.includes(t)) order.push(t);
const fileOf = (text) => join(OUT, `${createHash('sha1').update(`gemini|${p.ses}|${p.ayar}|${text}`).digest('hex').slice(0, 12)}.wav`);
const todo = order.filter((t) => !existsSync(fileOf(t)));
if (!todo.length) { console.log('Bütün cümleler hazır.'); process.exit(0); }

const parts = [];
let cur = [];
for (const t of todo) {
  const len = cur.reduce((n, x) => n + spokenOf(x).length, 0);
  if (cur.length && len + spokenOf(t).length > LIMIT) { parts.push(cur); cur = []; }
  cur.push(t);
}
if (cur.length) parts.push(cur);
console.log(`${todo.length} cümle → ${parts.length} istek`);

// ILK=1: yalnızca ilk parçayı üret ve böl (deneme).
const N = process.env.ILK ? 1 : parts.length;
for (let i = 0; i < N; i++) {
  const sentences = parts[i];
  // Paragraf arası: Gemini her cümleden sonra kısa bir duraklama verir; bölme kolaylaşır.
  const text = sentences.map(spokenOf).join('\n\n');
  // Ara kayıt içeriğe göre adlanır: kesilip yeniden çalıştırılınca aynı parça yeniden istenmez.
  const tag = createHash('sha1').update(`${p.ses}|${p.ayar}|${MODEL}|${text}`).digest('hex').slice(0, 10);
  const wav = join(TMP, `parca-${tag}.wav`);
  if (!existsSync(wav)) {
    await geminiTTS(text, wav, { voice: p.ses, style: `${p.ayar} Pause briefly between paragraphs.`, model: MODEL || undefined });
    console.log(`  ✓ parça ${i + 1}/${parts.length} (${sentences.length} cümle)`);
  }
  const manifest = join(TMP, `parca-${tag}.json`);
  writeFileSync(manifest, JSON.stringify({ wav, sentences: sentences.map((t) => ({ text: spokenOf(t), out: fileOf(t) })) }));
  execFileSync(join(process.env.HOME, '.local', 'bin', 'uv'), ['run', '--quiet', '--with', 'faster-whisper', '--with', 'av==13.1.0', 'python', join(here, 'bol.py'), manifest],
    { stdio: 'inherit', env: { ...process.env, HF_HUB_OFFLINE: '1' } });
}
console.log('Bitti. Şimdi: SADECE=rehber node capture/ses.mjs (süreleri ölçer, istek atmaz)');
