/**
 * Seslendirme profilleri ve okunuş kuralları (ses.mjs ve gemini-toplu.mjs ortak).
 *
 *   rehber — Gemini, Charon; sabırlı bir eğitmen tonu. Kota günde 10 istek olduğu
 *            için cümleler gemini-toplu.mjs ile parça parça üretilip bölünür.
 *            Önceki denemeler: ElevenLabs Daniel (MOTOR=eleven SES=onwK4e9ZLuTAKqWW03F9
 *            HIZ=0.5/0.8/0.15/0.95), edge-tts tr-TR-EmelNeural (MOTOR=edge).
 *   kurul  — Gemini, Charon; sakin, sıcak, güven veren sunum.
 */
import { REHBERLER, cumleler } from '../src/rehber/senaryo.ts';
import { kurulCumleleri } from '../src/kurul/senaryo.ts';

export const PROFILLER = {
  rehber: {
    motor: 'gemini', ses: 'Charon',
    ayar: 'Warm, friendly and clear; a patient trainer explaining an app step by step to a new team member. Natural Turkish, unhurried pace.',
    cumleler: () => REHBERLER.flatMap(cumleler)
  },
  kurul: { motor: 'gemini', ses: 'Charon', ayar: 'Calm, warm and confident; a clear, natural Turkish presentation voice. Unhurried pace.', cumleler: kurulCumleleri }
};

// Tırnak ve kesme işaretleri okunmasın; "PIN" harf harf değil "pin" okunsun.
// Rakamla yazılan marka adı ve İngilizce kelime Türkçe okunsun.
export const spokenOf = (text) => text.replace(/[“”"«»]/g, '').replace(/PIN/g, 'pin')
  .replace(/1401/g, 'Bin dört yüz bir').replace(/\bCampus\b/g, 'Kampüs');
