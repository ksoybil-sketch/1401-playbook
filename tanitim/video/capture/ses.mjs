/**
 * Videoların seslendirmesi. Her cümleyi ses dosyasına çevirir ve süresini
 * ölçer:
 *   public/rehber-ses/<kısa-özet>.mp3|wav
 *   public/rehber-ses/sesler.json   { "cümle": { file, sec } }
 * Videolar adım sürelerini bu dosyadan alır. Var olan dosya yeniden
 * üretilmez (Gemini kotası için önemli).
 *
 * Her videonun kendi sesi var (PROFIL):
 *   rehber — ElevenLabs, Daniel (çok dilli model; ücretsiz planda ayda ~10.000 kredi).
 *            Ayar "dengelilik/benzerlik/üslup/hız": 0.5/0.8/0.15/0.95 — sakin, net,
 *            yönlendiren anlatım. Eskisi: edge-tts tr-TR-EmelNeural (MOTOR=edge ile hâlâ kullanılabilir).
 *   kurul  — Gemini TTS, Charon, "sakin, sıcak, güven veren, acelesiz" ton
 *            (anahtar .env.local'de; ücretsiz kota günde 10 istek)
 *
 *   node capture/ses.mjs                     ikisi de, eksik olanlar üretilir
 *   SADECE=kurul node capture/ses.mjs        yalnız kurul
 *   SADECE=rehber SES=tr-TR-AhmetNeural …    seçili profilde ses/motor değiştirilir
 *   GEMINI_MODEL=gemini-3.8-flash-lite-tts   Gemini'de ayrı kotalı model
 *   MOTOR=say SES="Yelda (Enhanced)"         internetsiz yedek (robotik)
 *   MOTOR=eleven SES=<voice_id>              ElevenLabs (anahtar .env.local'de; ücretsiz planda ayda ~10.000 kredi)
 *   ELEVEN_MODEL=eleven_flash_v2_5           ElevenLabs'te yarı krediyle çalışan hızlı model
 *   --hepsi                                  var olanları da yeniden üret
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { REHBERLER, cumleler } from '../src/rehber/senaryo.ts';
import { kurulCumleleri } from '../src/kurul/senaryo.ts';
import { geminiTTS } from './gemini-tts.mjs';
import { elevenTTS, elevenCredits } from './eleven-tts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'rehber-ses');
mkdirSync(OUT, { recursive: true });
const UVX = join(process.env.HOME, '.local', 'bin', 'uvx');
const ALL = process.argv.includes('--hepsi');
const ONLY = process.env.SADECE;

const PROFILLER = {
  rehber: { motor: 'eleven', ses: 'onwK4e9ZLuTAKqWW03F9', ayar: '0.5/0.8/0.15/0.95', model: 'eleven_multilingual_v2', cumleler: () => REHBERLER.flatMap(cumleler) },
  kurul: { motor: 'gemini', ses: 'Charon', ayar: 'Calm, warm and confident; a clear, natural Turkish presentation voice. Unhurried pace.', cumleler: kurulCumleleri }
};

const jsonPath = join(OUT, 'sesler.json');
const out = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : {};
// Tırnak ve kesme işaretleri okunmasın; "PIN" harf harf değil "pin" okunsun.
// Türkçe okunuş: rakamla yazılan marka adı ve İngilizce kelime Türkçe okunsun
// (ElevenLabs'in sesi İngilizce kökenli; "1401"i İngilizce sayı gibi okumasın).
const spokenOf = (text) => text.replace(/[“”"«»]/g, '').replace(/PIN/g, 'pin')
  .replace(/1401/g, 'Bin dört yüz bir').replace(/\bCampus\b/g, 'Kampüs');

for (const [ad, p] of Object.entries(PROFILLER)) {
  if (ONLY && ONLY !== ad) continue;
  // Ortam değişkenleri yalnızca seçili profile uygulanır (SADECE ile).
  const env = (k) => (ONLY === ad ? process.env[k] : undefined);
  const ENGINE = env('MOTOR') || p.motor;
  const VOICE = env('SES') || (ENGINE === p.motor ? p.ses : ENGINE === 'say' ? 'Yelda' : ENGINE === 'edge' ? 'tr-TR-EmelNeural' : 'Charon');
  const RATE = env('HIZ') || env('USLUP') || (ENGINE === p.motor ? p.ayar : ENGINE === 'say' ? '172' : ENGINE === 'edge' ? '-4%' : PROFILLER.kurul.ayar);
  const GMODEL = ENGINE === 'eleven' ? (env('ELEVEN_MODEL') || p.model || 'eleven_multilingual_v2') : (env('GEMINI_MODEL') || '');
  const EXT = ENGINE === 'edge' || ENGINE === 'eleven' ? 'mp3' : 'wav';

  const texts = [...new Set(p.cumleler())];
  const jobs = [];
  for (const text of texts) {
    const h = createHash('sha1').update(`${ENGINE}|${VOICE}|${RATE}|${GMODEL ? GMODEL + '|' : ''}${text}`).digest('hex').slice(0, 12);
    const abs = join(OUT, `${h}.${EXT}`);
    if (ALL || !existsSync(abs)) jobs.push({ spoken: spokenOf(text), abs });
    out[text] = { file: `rehber-ses/${h}.${EXT}`, abs };
  }
  for (const j of jobs) {
    if (ENGINE === 'eleven') {
      const [stability, similarity, style, speed] = String(RATE).split('/').map(Number);
      await elevenTTS(j.spoken, j.abs, { voice: VOICE, model: GMODEL, ...(speed ? { stability, similarity, style, speed } : {}) });
      console.log(`  ✓ ${j.spoken.slice(0, 60)}`);
    } else if (ENGINE === 'gemini') {
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
  let total = 0;
  for (const text of texts) {
    const info = execFileSync('afinfo', [out[text].abs]).toString();
    const sec = Math.round(Number(info.match(/estimated duration: ([\d.]+)/)[1]) * 100) / 100;
    out[text] = { file: out[text].file, sec };
    total += sec;
  }
  console.log(`${ad}: ${texts.length} cümle (${jobs.length} yeni) · ${Math.round(total)} sn · ${ENGINE} · ${VOICE}`);
  if (ENGINE === 'eleven') { const c = await elevenCredits(); console.log(`  ElevenLabs kredi: ${c.used}/${c.limit} kullanıldı`); }
}

// Senaryodan çıkmış cümleler listeden düşer.
const keep = new Set(Object.values(PROFILLER).flatMap((p) => p.cumleler()));
for (const k of Object.keys(out)) if (!keep.has(k)) delete out[k];
writeFileSync(jsonPath, JSON.stringify(out, null, 1));
