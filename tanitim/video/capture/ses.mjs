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
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { REHBERLER, cumleler } from '../src/rehber/senaryo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'rehber-ses');
mkdirSync(OUT, { recursive: true });
const ENGINE = process.env.MOTOR || 'edge';
const VOICE = process.env.SES || (ENGINE === 'edge' ? 'tr-TR-EmelNeural' : 'Yelda');
const RATE = process.env.HIZ || (ENGINE === 'edge' ? '-4%' : '172');
const EXT = ENGINE === 'edge' ? 'mp3' : 'wav';
const UVX = join(process.env.HOME, '.local', 'bin', 'uvx');
const ALL = process.argv.includes('--hepsi');
const jsonPath = join(OUT, 'sesler.json');
const old = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : {};
const out = {};

const texts = [...new Set(REHBERLER.flatMap(cumleler))];
let made = 0;
for (const text of texts) {
  const h = createHash('sha1').update(`${ENGINE}|${VOICE}|${RATE}|${text}`).digest('hex').slice(0, 12);
  const file = `rehber-ses/${h}.${EXT}`;
  const abs = join(OUT, `${h}.${EXT}`);
  if (ALL || !existsSync(abs) || !old[text] || old[text].file !== file) {
    // Tırnak ve kesme işaretleri okunmasın; "PIN" harf harf değil "pin" okunsun.
    const spoken = text.replace(/[“”"«»]/g, '').replace(/PIN/g, 'pin');
    if (ENGINE === 'edge') {
      // Servis arada bir bağlantıyı düşürebiliyor: üç deneme.
      for (let i = 0; ; i++) {
        try { execFileSync(UVX, ['edge-tts', '--voice', VOICE, `--rate=${RATE}`, '--text', spoken, '--write-media', abs], { stdio: 'pipe' }); break; }
        catch (e) { if (i === 2) throw e; }
      }
    } else {
      execFileSync('say', ['-v', VOICE, '-r', RATE, '--file-format=WAVE', '--data-format=LEI16@24000', '-o', abs, spoken]);
    }
    made++;
  }
  const info = execFileSync('afinfo', [abs]).toString();
  const sec = Number(info.match(/estimated duration: ([\d.]+)/)[1]);
  out[text] = { file, sec: Math.round(sec * 100) / 100 };
}
writeFileSync(jsonPath, JSON.stringify(out, null, 1));
const total = Object.values(out).reduce((s, x) => s + x.sec, 0);
console.log(`${texts.length} cümle (${made} yeni) · toplam ${Math.round(total)} sn seslendirme · ses: ${VOICE}`);
