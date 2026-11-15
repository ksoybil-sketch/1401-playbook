import { pendingLeaveText } from './unsaved';

/**
 * Tembel yüklenen paket parçası (zorlu senaryo H5).
 *
 * Yeni sürüm yayınlanınca eski sekmedeki parça adları sunucuda artık yok.
 * Hosting eksik dosya için index.html döndürüyor; tarayıcı bunu modül
 * olarak çalıştıramıyor ve ekranda ham İngilizce hata çıkıyordu ("Failed to
 * fetch dynamically imported module…"). Uygulamada React.lazy rota yok;
 * parçalar olay işleyicilerinden (müfredat, PDF/OCR, yapay zekâ dersi)
 * yüklendiği için ErrorBoundary'nin yenilemesi de devreye girmiyordu.
 *
 * loadChunk: parça yüklenemezse kullanıcıya Türkçe söyler ve sayfayı bir kez
 * yeniler (kaydedilmemiş iş varsa yenilemez, kaydetmesini ister). Dakikada
 * en çok bir yenileme: parça yeni sürümde de yoksa döngüye girmez.
 */
export const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS|MIME type/i;
const RELOAD_KEY = 'campus.chunkReload';
export const STALE_TEXT = 'Uygulamanın yeni sürümü yayınlandı; bu işlem eski sürümde açılamıyor. Sayfa yenileniyor…';
export const STALE_SAVE_TEXT = 'Uygulamanın yeni sürümü yayınlandı. Değişikliklerini kaydedip sayfayı yenile; bu işlem eski sürümde açılamıyor.';

export const isChunkError = (e: unknown) => CHUNK_ERROR.test((e as { message?: string })?.message || String(e));

/** Sayfayı yenilemeyi dener; yenilenecekse true. */
let scheduled = false;
export function reloadForNewVersion(): boolean {
  if (scheduled) return true;
  if (pendingLeaveText() !== null) return false;
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { /* yok */ }
  if (Date.now() - last < 60_000) return false;
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* yok */ }
  scheduled = true;
  setTimeout(() => location.reload(), 1500);
  return true;
}

export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (!isChunkError(e)) throw e;
    throw new Error(reloadForNewVersion() ? STALE_TEXT : STALE_SAVE_TEXT);
  }
}
