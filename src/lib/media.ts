/**
 * Spark (sunucusuz) planda Firebase Storage yok — ders fotoğrafları
 * küçültülüp data URL olarak doğrudan `lessons/{id}.blocks` içine yazılır.
 * Firestore'un belge başına 1 MiB sınırı olduğu için her görsel agresifçe
 * sıkıştırılır (hedef: ~120 KB). Video için bu yöntem uygun değil — video
 * yalnızca dış bağlantı (YouTube vb.) olarak eklenebilir.
 */
const MAX_DIMENSION = 1000;
const TARGET_BYTES = 150 * 1024;
const MIN_QUALITY = 0.35;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Görsel okunamadı.')); };
    img.src = url;
  });
}

/** Görseli yeniden boyutlandırıp JPEG'e çevirir, hedef boyuta sığana kadar kaliteyi düşürür. */
export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Yalnızca görsel dosyaları yüklenebilir.');
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tarayıcı görseli işleyemedi.');
  ctx.fillStyle = '#fff'; // JPEG şeffaflığı desteklemez
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = 0.8;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length * 0.75 > TARGET_BYTES && quality > MIN_QUALITY) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length * 0.75 > 900 * 1024) {
    throw new Error('Görsel çok büyük kaldı, daha küçük bir dosya dene.');
  }
  return dataUrl;
}

export const isDataUrl = (s: string) => s.startsWith('data:');
