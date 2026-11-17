/**
 * Ekran yollarının okunur adları ve kısa kodları.
 *
 * İki yerden kullanılır: demo kaydı (src/demo/DemoTracker.tsx, okunur ad) ve
 * canlı kullanım sayacı (src/lib/kullanimKaydi.ts, kısa kod). Demo kodu canlı
 * pakete girmediği için ortak tablo burada durur.
 */

/** İlk eşleşen kazanır. */
const PAGES: [RegExp, string, string][] = [
  // desen, okunur ad, sayaç kodu
  [/^\/$/, 'Ana ekran', 'ana'],
  [/^\/receteler$/, 'Reçeteler', 'receteler'],
  [/^\/recete\//, 'Reçete', 'recete'],
  [/^\/bulten$/, 'Bülten', 'bulten'],
  [/^\/akademi$/, 'Akademi', 'akademi'],
  [/^\/akademi\//, 'Eğitim yolu', 'yol'],
  [/^\/modul\//, 'Modül', 'modul'],
  [/^\/ders\//, 'Ders', 'ders'],
  [/^\/sinav\//, 'Sınav', 'sinav'],
  [/^\/sonuclarim$/, 'Ben / sonuçlarım', 'sonuclarim'],
  [/^\/ekip$/, 'Ekibim', 'ekip'],
  [/^\/talepler/, 'Talepler', 'talepler'],
  [/^\/magazalar$/, 'Mağazalar', 'panel'],
  [/^\/magazalar\//, 'Mağaza', 'panel'],
  [/^\/baristalar$/, 'Baristalar', 'panel'],
  [/^\/baristalar\//, 'Barista', 'panel'],
  [/^\/gorevler$/, 'Görevler', 'panel'],
  [/^\/onaylar$/, 'Onaylar / öneriler', 'panel'],
  [/^\/rozetler$/, 'Rozetler', 'panel'],
  [/^\/icerik$/, 'Akademi düzenleme', 'panel'],
  [/^\/icerik\/modul\//, 'Modül düzenleme', 'panel'],
  [/^\/icerik\/ders\//, 'Ders düzenleme', 'panel'],
  [/^\/yonetici-girisi$/, 'Yönetici girişi', 'yonetici-girisi'],
  [/^\/davet$/, 'Davet', 'davet'],
  [/^\/demo-kaydi$/, 'Demo kaydı', 'panel']
];

/** Demo kaydı için okunur ad; eşleşme yoksa yolun kendisi. */
export const pageName = (p: string): string => PAGES.find(([r]) => r.test(p))?.[1] || p;

/**
 * Sayaç kodu. Sayı sınırlı tutulur (firestore.rules `ekran` en çok 20 anahtar):
 * panel ekranlarının hepsi tek "panel" kodunda toplanır, tanınmayan yol "diger".
 */
export const ekranKodu = (p: string): string => PAGES.find(([r]) => r.test(p))?.[2] || 'diger';

/** Reçete yolundan içecek kimliği: /recete/r-latte → r-latte */
export const receteKimligi = (p: string): string | null => {
  const m = p.match(/^\/recete\/([^/?#]{1,60})/);
  return m ? decodeURIComponent(m[1]) : null;
};
