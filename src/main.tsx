import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';
import { watchForUpdates } from './lib/updateCheck';
import { installBackButton } from './lib/backButton';
import { installWebHistory } from './lib/webHistory';
import { installErrorLog } from './lib/errorLog';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { reloadForNewVersion, STALE_SAVE_TEXT, STALE_TEXT } from './lib/chunk';
import { toast } from './ui/kit';

// Açık kalan sekmeler yeni sürümü kendiliğinden alsın.
watchForUpdates();

// Yakalanmamış hatalar "hatalar" koleksiyonuna düşer (yalnızca geliştirici okur).
installErrorLog();

// Android geri tuşu: alt sayfa → sınav onayı → önceki ekran → arka plana al.
installBackButton();

// Web: tarayıcının geri/ileri düğmesi önce açık pencereyi kapatır, kaydedilmemiş
// değişikliği sorar, çıkıştan sonra önceki kişinin adresine dönmez. Router'dan
// önce kurulmalı (popstate dinleyici sırası).
installWebHistory();

// Yeni sürümden sonra eski sekmede eksik parça (H5): Vite'ın ön yükleme hatası
// da aynı yoldan Türkçe mesajla bir kez yenilenir (bkz. lib/chunk.ts).
window.addEventListener('vite:preloadError', () => {
  toast(reloadForNewVersion() ? STALE_TEXT : STALE_SAVE_TEXT, 'negative');
});

// Çevrimdışı kabuk (public/sw.js): Wi-Fi gidince de uygulama açılsın.
// Geliştirmede ve Android uygulamasında (dosyalar zaten cihazda) yok.
const native = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
if (!import.meta.env.DEV && !native && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HashRouter>
  </React.StrictMode>
);
