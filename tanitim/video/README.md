# 1401 Campus — videolar

Remotion ile, uygulamanın **gerçek ekranlarından** üretilir. Ekranlar ve sesler depoya girmez;
her çekimde yeniden üretilir.

Önce emülatör ve geliştirme sunucusu açık olsun (`npm run emulators`, `npm run dev:emu`), bu
klasörde `npm install`.

| Video | Çekim | İşleme | Çıktı |
|---|---|---|---|
| Tanıtım (dikey, ~82 sn) ve Yönetim (yatay, ~84 sn) | `npm run capture` | `npm run render` | `out/1401-campus-tanitim.mp4`, `out/1401-campus-yonetim.mp4` |
| Kullanım rehberleri (dikey, seslendirmeli) | `npm run capture:rehber` | `npm run render:rehber` | `out/1401-campus-barista-rehberi.mp4`, `out/1401-campus-magaza-muduru-rehberi.mp4` |
| Yönetim kurulu (yatay, ~2 dk 20 sn, seslendirmeli) | iki çekimi de kullanır | `npm run render:kurul` | `out/1401-campus-yonetim-kurulu.mp4` |

`capture` ve `capture:rehber` önce emülatörü bilinen başlangıca döndürür (`capture/reset-emu.mjs`).
`npm run studio` ile önizlenir.

## Kullanım rehberleri

- Anlatım metni: `src/rehber/senaryo.ts`. Her adım bir ekran + bir cümle; cümle hem altyazı hem
  seslendirme. Okunuşu farklı olacak yerler için `ses` alanı (ör. rozet adları, "oz").
- Seslendirme: `npm run ses`. Varsayılan motor Microsoft Edge'in ücretsiz sesli okuma servisi
  (`edge-tts`, `uvx` ile çalışır, internet gerekir; servise yalnızca anlatım metni gider) ve doğal
  Türkçe ses **Emel** (`tr-TR-EmelNeural`). Erkek ses için `SES=tr-TR-AhmetNeural npm run ses`.
  İnternetsiz yedek: `MOTOR=say SES="Yelda (Enhanced)" npm run ses` (macOS sesi, daha robotik).
  Ses ya da cümle değişince yalnızca değişen cümleler üretilir; adım süreleri seslendirmeden gelir.
  Sonra `npm run render:rehber`.
- Ekranlar: `capture/rehber.mjs` (mağaza telefonu, yeni barista davet kodu 246810, Mehmet ve Ayşe
  hesapları). Öğe konumları `public/rehber/rehber.json`'a yazılır; çerçeve ve dokunma halkaları
  buradan çizilir.

## Yönetim kurulu videosu

Metin ve sahneler `src/kurul/senaryo.ts`'te (neden, neyi çözer, ne kazandırır, önerilen adım).
Rakamlar uygulamanın kendisinden: `src/generated/curriculum.json` ve reçete listesi. Ses ve süre
rehberlerle aynı yoldan (`npm run ses`).
