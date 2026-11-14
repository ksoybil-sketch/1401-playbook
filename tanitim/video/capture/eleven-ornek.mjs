/**
 * ElevenLabs ses adayları: kütüphanedeki Türkçe sesleri listeler ve
 * seçilenlerle aynı kısa cümleyi seslendirir (karşılaştırmak için).
 *
 *   node capture/eleven-ornek.mjs                    listeyi yazar (kredi harcamaz)
 *   node capture/eleven-ornek.mjs <id> <id> …         her ses için örnek üretir
 * Örnekler: public/ses-ornek/<ad>.mp3
 */
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { elevenCredits, elevenTTS, turkishVoices } from './eleven-tts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'ses-ornek');
const ids = process.argv.slice(2);
// Rehber videolarından tipik bir cümle: anlaşılır, sakin, yönlendiren ton.
const SAMPLE = process.env.CUMLE || 'Bir reçeteyi açmak için Reçeteler sekmesine dokun. Bardak boyunu seç; ölçüler ve hazırlanış sırası ekrana gelir.';

const c = await elevenCredits();
console.log(`Kredi: ${c.used}/${c.limit} kullanıldı (${c.tier})`);
const voices = await turkishVoices(40);
if (!ids.length) {
  for (const v of voices) console.log(`${v.id}  ${v.name} · ${v.gender || ''} ${v.age || ''} · ${v.accent || ''} · ${v.use || ''} — ${v.desc}`);
} else {
  mkdirSync(OUT, { recursive: true });
  for (const id of ids) {
    const v = voices.find((x) => x.id === id);
    const name = (v?.name || id).replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 30);
    await elevenTTS(SAMPLE, join(OUT, `${name}.mp3`), { voice: id });
    console.log(`  ✓ ${name}`);
  }
  const after = await elevenCredits();
  console.log(`Kredi: ${after.used}/${after.limit}`);
}
