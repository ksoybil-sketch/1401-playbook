import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';
import { watchForUpdates } from './lib/updateCheck';
import { installBackButton } from './lib/backButton';

// Açık kalan sekmeler yeni sürümü kendiliğinden alsın.
watchForUpdates();

// Android geri tuşu: alt sayfa → sınav onayı → önceki ekran → arka plana al.
installBackButton();

// Çevrimdışı kabuk (public/sw.js): Wi-Fi gidince de uygulama açılsın.
// Geliştirmede ve Android uygulamasında (dosyalar zaten cihazda) yok.
const native = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
if (!import.meta.env.DEV && !native && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
