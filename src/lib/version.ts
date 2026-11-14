/**
 * Okunur sürüm etiketi: "1.0.0 · 16.11 14:32". package.json sürümü ve
 * derleme zamanı vite.config.ts'te gömülür. Kullanıcılara gösterilmez;
 * geri bildirim ve hata kayıtlarına eklenir, panelde yalnızca uygulama
 * geliştiricisi görür.
 */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const built = typeof __BUILD_TIME__ === 'string' ? new Date(__BUILD_TIME__) : null;
const pad = (n: number) => String(n).padStart(2, '0');

export const APP_VERSION = built
  ? `${version} · ${pad(built.getDate())}.${pad(built.getMonth() + 1)} ${pad(built.getHours())}:${pad(built.getMinutes())}`
  : version;

/** Paket adı (index-XXXX): yeni sürüm kontrolü ve eski kayıtlarla eşleştirmek için. */
export function bundleName(): string {
  const src = [...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src).find((s) => /assets\/index-/.test(s));
  return src ? src.split('/').pop()!.replace(/\.js$/, '') : 'dev';
}
