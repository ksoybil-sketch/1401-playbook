# 1401 Campus — tanıtım videosu

Remotion ile, uygulamanın **gerçek ekranlarından** üretilir (1080×1920, ~62 sn).

1. Emülatör ve geliştirme sunucusu açık olsun (`npm run emulators`, `npm run dev:emu`, `npm run seed:emu`).
2. `npm install` (bu klasörde), sonra `npm run capture` — Playwright telefon boyutunda (390×844, 3x)
   uygulamayı gezer, `public/ekranlar/` altına ekranları ve öğe konumlarını (`meta.json`) yazar.
3. `npm run studio` ile önizle, `npm run render` ile `out/1401-campus-tanitim.mp4`.

Akış ve metinler `src/script.ts`'te; dokunma halkaları ve çerçeveler `meta.json`'daki gerçek
konumlardan çizilir. Ekranlar depoya girmez, her çekimde yeniden üretilir.
