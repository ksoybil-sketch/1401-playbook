import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { reportError } from '../lib/errorLog';
import { FeedbackSheet } from '../features/shared/Feedback';
import { Icon } from './Icon';
import * as t from './tokens';

/**
 * Bir ekran çökerse sayfa boş kalıyordu. Artık hata kaydedilir
 * (src/lib/errorLog.ts) ve kullanıcı "Yeniden yükle" ya da "Bildir"
 * ile devam eder. Başka bir ekrana geçince sınır kendiliğinden sıfırlanır.
 *
 * Yeni sürüm yayınlandıktan sonra eski sekmede tembel yüklenen bir parça
 * bulunamazsa ("dynamically imported module") sayfa bir kez kendiliğinden
 * yenilenir: bu bir hata değil, eski sürüm.
 */
const CHUNK = /dynamically imported module|Importing a module script failed|error loading dynamically imported/i;
const RELOAD_KEY = 'campus.chunkReload';

class Boundary extends React.Component<{ resetKey: string; children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (CHUNK.test(error.message)) {
      let last = 0;
      try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { /* yok */ }
      if (Date.now() - last > 60_000) {
        try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* yok */ }
        location.reload();
        return;
      }
    }
    reportError(error, 'cokme', info.componentStack?.split('\n').slice(0, 8).join('\n'));
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    return this.state.error ? <CrashScreen /> : this.props.children;
  }
}

const CrashScreen: React.FC = () => {
  const [report, setReport] = useState(false);
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-espresso">
      <div className="max-w-sm w-full flex flex-col items-center text-center gap-4">
        <span className={t.iconChip('caution')}><Icon name="alert" size={18} /></span>
        <h1 className="text-[19px] font-bold">Bir şeyler ters gitti</h1>
        <p className="text-[14px] text-fg-2 leading-relaxed">
          Bu ekran açılırken bir hata oldu. Hata kaydedildi, geliştirici ekip görecek. Sayfayı yeniden yüklemek çoğu zaman yeter.
        </p>
        <div className="flex gap-2 w-full">
          <button className={`${t.btn} ${t.btnSecondary} ${t.btnLg} flex-1`} onClick={() => setReport(true)}>Bildir</button>
          <button className={`${t.btn} ${t.btnPrimary} ${t.btnLg} flex-1`} onClick={() => location.reload()}>Yeniden yükle</button>
        </div>
        <button className="text-[13px] text-fg-3 underline underline-offset-2" onClick={() => { location.hash = '#/'; location.reload(); }}>Ana ekrana dön</button>
      </div>
      <FeedbackSheet open={report} onClose={() => setReport(false)} preset="hata" />
    </div>
  );
};

export const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
};
