/**
 * Rehber videolarının seslendirmesi. src/rehber/senaryo.ts'deki her cümleyi
 * ses dosyasına çevirir ve süresini ölçer:
 *   public/rehber-ses/<kısa-özet>.mp3|wav
 *   public/rehber-ses/sesler.json   { "cümle": { file, sec } }
 * Video adım sürelerini bu dosyadan alır. Değişmeyen cümleler yeniden
 * üretilmez.
 *
 * İki motor:
 *   edge (varsayılan) — Microsoft Edge'in sesli okuma servisi (edge-tts,
 *     ücretsiz, internet gerekir). Doğal Türkçe sinirsel sesler:
 *     tr-TR-EmelNeural (kadın, varsayılan), tr-TR-AhmetNeural (erkek).
 *     Servise yalnızca anlatım metni gider.
 *   say — macOS'un yerleşik sesi (Yelda), internetsiz ama robotik.
 *
 *   node capture/ses.mjs
 *   SES=tr-TR-AhmetNeural node capture/ses.mjs
 *   MOTOR=say SES="Yelda (Enhanced)" node capture/ses.mjs
 *   chatterbox — Resemble AI'ın açık kaynak modeli (MIT), internetsiz.
 *     ~/.local/share/chatterbox/.venv içine kurulu. REF_SES=ornek.wav ile
 *     verilen kişinin sesiyle konuşur (izni olan biri!).
 *     MOTOR=chatterbox SADECE=kurul node capture/ses.mjs
 *   gemini — Google Gemini TTS (ücretsiz kota, anahtar .env.local'de).
 *     Ton USLUP ile tarif edilir. MOTOR=gemini SES=Sulafat SADECE=kurul node capture/ses.mjs
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { REHBERLER, cumleler } from '../src/rehber/senaryo.ts';
import { kurulCumleleri } from '../src/kurul/senaryo.ts';
import { geminiTTS } from './gemini-tts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'rehber-ses');
mkdirSync(OUT, { recursive: true });
const ENGINE = process.env.MOTOR || 'edge';
const VOICE = process.env.SES || (ENGINE === 'edge' ? 'tr-TR-EmelNeural' : ENGINE === 'gemini' ? 'Sulafat' : ENGINE === 'chatterbox' ? (process.env.REF_SES ? `ref:${process.env.REF_SES}` : 'varsayilan') : 'Yelda');
// Gemini'de "hız" yerine ton tarifi (USLUP).
const RATE = process.env.HIZ || process.env.USLUP || (ENGINE === 'edge' ? '-4%' : ENGINE === 'gemini' ? 'Calm, warm and confident; a clear, natural Turkish presentation voice. Unhurried pace.' : ENGINE === 'chatterbox' ? (process.env.ABARTI || '0.5') : '172');
const EXT = ENGINE === 'edge' ? 'mp3' : 'wav';
const UVX = join(process.env.HOME, '.local', 'bin', 'uvx');
const CB_PY = join(process.env.HOME, '.local', 'share', 'chatterbox', '.venv', 'bin', 'python');
const ALL = process.argv.includes('--hepsi');
// Gemini'de model seçimi (ücretsiz kota model başına ayrı: günde 10 istek).
const GMODEL = process.env.GEMINI_MODEL || '';
// SADECE=kurul : yalnızca yönetim kurulu videosunun cümleleri (yavaş motorlar için).
const ONLY = process.env.SADECE;
const jsonPath = join(OUT, 'sesler.json');
const old = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : {};
const out = { ...old };

const all = ONLY === 'kurul' ? kurulCumleleri() : [...REHBERLER.flatMap(cumleler), ...kurulCumleleri()];
const texts = [...new Set(all)];
// Tırnak ve kesme işaretleri okunmasın; "PIN" harf harf değil "pin" okunsun.
const spokenOf = (text) => text.replace(/[“”"«»]/g, '').replace(/PIN/g, 'pin');
const jobs = [];
for (const text of texts) {
  const h = createHash('sha1').update(`${ENGINE}|${VOICE}|${RATE}|${GMODEL ? GMODEL + '|' : ''}${text}`).digest('hex').slice(0, 12);
  const file = `rehber-ses/${h}.${EXT}`;
  const abs = join(OUT, `${h}.${EXT}`);
  if (ALL || !existsSync(abs)) jobs.push({ text, spoken: spokenOf(text), abs });
  out[text] = { file, abs };
}

if (ENGINE === 'chatterbox') {
  // Model bir kez yüklenir, bütün cümleler tek seferde üretilir.
  const list = join(OUT, '.isler.json');
  writeFileSync(list, JSON.stringify(jobs.map((j) => ({ text: j.spoken, out: j.abs }))));
  if (jobs.length) execFileSync(CB_PY, [join(here, 'chatterbox_tts.py'), list], { stdio: 'inherit' });
} else {
  for (const j of jobs) {
    if (ENGINE === 'gemini') {
      await geminiTTS(j.spoken, j.abs, { voice: VOICE, style: RATE, model: GMODEL || undefined });
      console.log(`  ✓ ${j.spoken.slice(0, 60)}`);
    } else if (ENGINE === 'edge') {
      // Servis arada bir bağlantıyı düşürebiliyor: üç deneme.
      for (let i = 0; ; i++) {
        try { execFileSync(UVX, ['edge-tts', '--voice', VOICE, `--rate=${RATE}`, '--text', j.spoken, '--write-media', j.abs], { stdio: 'pipe' }); break; }
        catch (e) { if (i === 2) throw e; }
      }
    } else {
      execFileSync('say', ['-v', VOICE, '-r', RATE, '--file-format=WAVE', '--data-format=LEI16@24000', '-o', j.abs, j.spoken]);
    }
  }
}

for (const text of texts) {
  const info = execFileSync('afinfo', [out[text].abs]).toString();
  const sec = Number(info.match(/estimated duration: ([\d.]+)/)[1]);
  out[text] = { file: out[text].file, sec: Math.round(sec * 100) / 100 };
}
// Senaryodan çıkmış cümleler listeden düşer.
const keep = new Set([...REHBERLER.flatMap(cumleler), ...kurulCumleleri()]);
for (const k of Object.keys(out)) if (!keep.has(k)) delete out[k];
writeFileSync(jsonPath, JSON.stringify(out, null, 1));
const total = texts.reduce((s, t) => s + out[t].sec, 0);
console.log(`${texts.length} cümle (${jobs.length} yeni) · toplam ${Math.round(total)} sn seslendirme · motor: ${ENGINE} · ses: ${VOICE}`);
