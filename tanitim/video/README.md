# 1401 Campus — videolar

Remotion ile, uygulamanın **gerçek ekranlarından** üretilir. Ekranlar ve sesler depoya girmez;
her çekimde yeniden üretilir.

Önce emülatör ve geliştirme sunucusu açık olsun (`npm run emulators`, `npm run dev:emu`), bu
klasörde `npm install`.

| Video | Çekim | İşleme | Çıktı |
|---|---|---|---|
| Tanıtım (dikey, ~82 sn) ve Yönetim (yatay, ~84 sn) | `npm run capture` | `npm run render` | `out/1401-campus-tanitim.mp4`, `out/1401-campus-yonetim.mp4` |
| Kullanım rehberleri (dikey, seslendirmeli) | `npm run capture:rehber` | `npm run render:rehber` | `out/1401-campus-barista-rehberi.mp4`, `out/1401-campus-magaza-muduru-rehberi.mp4` |

`capture` ve `capture:rehber` önce emülatörü bilinen başlangıca döndürür (`capture/reset-emu.mjs`).
`npm run studio` ile önizlenir.

## Kullanım rehberleri

- Anlatım metni: `src/rehber/senaryo.ts`. Her adım bir ekran + bir cümle; cümle hem altyazı hem
  seslendirme. Okunuşu farklı olacak yerler için `ses` alanı (ör. rozet adları, "oz").
- Seslendirme: `npm run ses` — macOS'un Türkçe sesi Yelda ile `public/rehber-ses/`'e WAV yazar ve
  sürelerini ölçer. Adım süreleri seslendirmeden gelir; yalnızca değişen cümleler yeniden üretilir.
- Daha doğal ses için Mac'te **Sistem Ayarları → Erişilebilirlik → Seslendirilen İçerik → Sistem
  sesi → Sesleri Yönet → Türkçe → Yelda (Gelişmiş)** indirilir. Sesin tam adı
  `say -v '?' | grep Yelda` ile görülür (ör. `Yelda (Enhanced)`), sonra:
  `SES="Yelda (Enhanced)" node capture/ses.mjs --hepsi && npm run render:rehber`
- Ekranlar: `capture/rehber.mjs` (mağaza telefonu, yeni barista davet kodu 246810, Mehmet ve Ayşe
  hesapları). Öğe konumları `public/rehber/rehber.json`'a yazılır; çerçeve ve dokunma halkaları
  buradan çizilir.
