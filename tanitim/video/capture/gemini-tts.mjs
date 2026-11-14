/**
 * Google Gemini ile seslendirme (Türkçe destekli, ton yazıyla tarif edilir).
 * Anahtar: tanitim/video/.env.local içinde GEMINI_API_KEY=... (git'e girmez)
 * ya da ortam değişkeni. Anahtar hiçbir yere yazdırılmaz.
 *
 * Önce güncel Interactions API (gemini-3.8-flash-tts) denenir; hesap ya da
 * bölge buna açık değilse eski generateContent yoluna (gemini-2.5-flash-
 * preview-tts) düşer. Çıktı 24 kHz mono 16-bit WAV.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const API = 'https://generativelanguage.googleapis.com/v1beta';

export function geminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const f = join(here, '..', '.env.local');
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\s]+)/m);
    if (m) return m[1];
  }
  throw new Error('GEMINI_API_KEY yok: tanitim/video/.env.local dosyasına GEMINI_API_KEY=... satırını ekleyin.');
}

/** Ham 16-bit PCM'i WAV başlığıyla sarar. */
function wavOf(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Yanıtın içindeki ilk base64 ses verisini bulur (şema sürümden sürüme değişebiliyor). */
function findAudio(o) {
  if (!o || typeof o !== 'object') return null;
  if (typeof o.data === 'string' && o.data.length > 1000) return { data: o.data, mime: o.mimeType || o.mime_type || '' };
  for (const v of Object.values(o)) { const r = findAudio(v); if (r) return r; }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, key, body) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
    if (res.status === 429 || res.status >= 500) {
      // Ücretsiz kotada dakikalık sınır: bekleyip yeniden dene.
      if (i >= 6) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const wait = Number(res.headers.get('retry-after')) * 1000 || 20000 * (i + 1);
      console.log(`  kota/sunucu (${res.status}), ${Math.round(wait / 1000)} sn bekleniyor…`);
      await sleep(wait);
      continue;
    }
    return res;
  }
}

let useLegacy = false;

/**
 * text'i seslendirip outPath'e WAV yazar.
 * voice: Sulafat, Achird, Charon, Kore… · style: "sakin, sıcak…" (İngilizce de olur)
 */
export async function geminiTTS(text, outPath, { voice = 'Sulafat', style = '', model } = {}) {
  const key = geminiKey();
  if (!useLegacy) {
    const body = {
      model: model || 'gemini-3.8-flash-tts',
      input: [{ type: 'user_input', content: [{ type: 'text', text, ...(style ? { annotations: [{ type: 'speech_metadata', style }] } : {}) }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] }
    };
    const res = await post(`${API}/interactions`, key, body);
    if (res.ok) {
      const a = findAudio(await res.json());
      if (!a) throw new Error('Gemini yanıtında ses yok');
      const buf = Buffer.from(a.data, 'base64');
      writeFileSync(outPath, buf.subarray(0, 4).toString() === 'RIFF' ? buf : wavOf(buf));
      return;
    }
    const msg = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error(`Gemini anahtarı kabul edilmedi (${res.status}): ${msg.slice(0, 200)}`);
    console.log(`  Interactions API olmadı (${res.status}); generateContent yoluna geçiliyor.`);
    useLegacy = true;
  }
  const m = model && !model.startsWith('gemini-3.8') ? model : 'gemini-2.5-flash-preview-tts';
  const body = {
    contents: [{ parts: [{ text: style ? `${style}:\n${text}` : text }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
  };
  const res = await post(`${API}/models/${m}:generateContent`, key, body);
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const a = findAudio(await res.json());
  if (!a) throw new Error('Gemini yanıtında ses yok');
  const buf = Buffer.from(a.data, 'base64');
  writeFileSync(outPath, buf.subarray(0, 4).toString() === 'RIFF' ? buf : wavOf(buf));
}

/* Doğrudan çalıştırılırsa: ses örnekleri.
 *   node capture/gemini-tts.mjs "metin" çıktı-klasörü Sulafat,Achird,Charon,Kore */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [text, dir, voices = 'Sulafat,Achird,Charon,Kore'] = process.argv.slice(2);
  const style = process.env.USLUP || '';
  for (const v of voices.split(',')) {
    await geminiTTS(text, join(dir, `gemini-${v.toLowerCase()}.wav`), { voice: v, style });
    console.log('✓', v);
  }
}
