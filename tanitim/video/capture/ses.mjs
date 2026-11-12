/**
 * Rehber videolarının seslendirmesi. src/rehber/senaryo.ts'deki her cümleyi
 * macOS'un Türkçe sesiyle (Yelda) WAV dosyasına çevirir ve süresini ölçer:
 *   public/rehber-ses/<kısa-özet>.wav
 *   public/rehber-ses/sesler.json   { "cümle": { file, sec } }
 * Video adım sürelerini bu dosyadan alır. Değişmeyen cümleler yeniden
 * üretilmez.
 *
 *   node capture/ses.mjs                 (Yelda, hız 172)
 *   SES="Yelda (Gelişmiş)" node capture/ses.mjs --hepsi
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
const VOICE = process.env.SES || 'Yelda';
const RATE = process.env.HIZ || '172';
const ALL = process.argv.includes('--hepsi');
const jsonPath = join(OUT, 'sesler.json');
const old = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : {};
const out = {};

const texts = [...new Set(REHBERLER.flatMap(cumleler))];
let made = 0;
for (const text of texts) {
  const h = createHash('sha1').update(`${VOICE}|${RATE}|${text}`).digest('hex').slice(0, 12);
  const file = `rehber-ses/${h}.wav`;
  const abs = join(OUT, `${h}.wav`);
  if (ALL || !existsSync(abs) || !old[text] || old[text].file !== file) {
    // Tırnak ve kesme işaretleri okunmasın; "PIN" harf harf değil "pin" okunsun.
    const spoken = text.replace(/[“”"«»]/g, '').replace(/PIN/g, 'pin');
    execFileSync('say', ['-v', VOICE, '-r', RATE, '--file-format=WAVE', '--data-format=LEI16@24000', '-o', abs, spoken]);
    made++;
  }
  const info = execFileSync('afinfo', [abs]).toString();
  const sec = Number(info.match(/estimated duration: ([\d.]+)/)[1]);
  out[text] = { file, sec: Math.round(sec * 100) / 100 };
}
writeFileSync(jsonPath, JSON.stringify(out, null, 1));
const total = Object.values(out).reduce((s, x) => s + x.sec, 0);
console.log(`${texts.length} cümle (${made} yeni) · toplam ${Math.round(total)} sn seslendirme · ses: ${VOICE}`);
