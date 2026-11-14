/**
 * ElevenLabs ile seslendirme (Türkçe, çok dilli model).
 * Anahtar: tanitim/video/.env.local içinde ELEVENLABS_API_KEY=... (git'e girmez)
 * ya da ortam değişkeni. Anahtar hiçbir yere yazdırılmaz.
 *
 * Ücretsiz planda ayda yaklaşık 10.000 kredi var; çok dilli modelde bir
 * karakter bir kredi, flash modelde yarım kredi. ses.mjs var olan dosyayı
 * yeniden üretmediği için yalnızca değişen cümleler kredi harcar.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.elevenlabs.io/v1';

export function elevenKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const f = join(here, '..', '.env.local');
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^\s*ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m);
    if (m) return m[1];
  }
  throw new Error('ELEVENLABS_API_KEY yok: tanitim/video/.env.local dosyasına ELEVENLABS_API_KEY=... satırını ekleyin.');
}

const H = () => ({ 'xi-api-key': elevenKey(), 'Content-Type': 'application/json' });

/** Kalan kredi: { used, limit, resetAt }. */
export async function elevenCredits() {
  const r = await fetch(`${API}/user/subscription`, { headers: H() });
  // Anahtarda "User" okuma yetkisi yoksa kredi gösterilmez; seslendirme yine çalışır.
  if (!r.ok) return { used: '?', limit: '?', resetAt: null, tier: r.status === 401 ? 'anahtarda User okuma yetkisi yok' : `hata ${r.status}` };
  const j = await r.json();
  return { used: j.character_count, limit: j.character_limit, resetAt: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000) : null, tier: j.tier };
}

/**
 * Metni MP3'e çevirir.
 * voice: ses kimliği (voice_id). model: eleven_multilingual_v2 (varsayılan) ya da eleven_flash_v2_5.
 * stability düşükse daha canlı, yüksekse daha düz okur.
 */
export async function elevenTTS(text, outPath, { voice, model = 'eleven_multilingual_v2', stability = 0.5, similarity = 0.8, style = 0.15, speed = 0.95 } = {}) {
  if (!voice) throw new Error('ElevenLabs ses kimliği (voice) verilmedi.');
  const body = {
    text, model_id: model,
    ...(model.includes('flash') || model.includes('turbo') ? { language_code: 'tr' } : {}),
    voice_settings: { stability, similarity_boost: similarity, style, use_speaker_boost: true, speed }
  };
  for (let i = 0; ; i++) {
    const r = await fetch(`${API}/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: H(), body: JSON.stringify(body) });
    if (r.ok) { writeFileSync(outPath, Buffer.from(await r.arrayBuffer())); return; }
    const msg = (await r.text()).slice(0, 300);
    // 429: eşzamanlı istek sınırı; kısa bekleyip yeniden dene. Kota bitince (401/quota) dur.
    if (r.status === 429 && i < 4) { await new Promise((ok) => setTimeout(ok, 2000 * (i + 1))); continue; }
    throw new Error(`ElevenLabs ${r.status}: ${msg}`);
  }
}

/** Kütüphanedeki Türkçe sesler (ana dili Türkçe olanlar önce). */
export async function turkishVoices(limit = 30) {
  const r = await fetch(`${API}/shared-voices?page_size=${limit}&language=tr&sort=usage_character_count_1y`, { headers: H() });
  if (!r.ok) throw new Error(`Ses kütüphanesi okunamadı: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.voices || []).map((v) => ({ id: v.voice_id, owner: v.public_owner_id, name: v.name, gender: v.gender, age: v.age, accent: v.accent, use: v.use_case, desc: (v.description || '').slice(0, 120), preview: v.preview_url }));
}
