/**
 * Yazım hazırlığı kapısı (bkz. kit.tsx sendOrQueue).
 *
 * Bazı kayıtlar yazmadan önce okur (commitChange: sürüm denetimi, öneri).
 * Çevrimdışıyken bu okuma birkaç saniye sürebilir; sendOrQueue 1,5 sn sonra
 * "kaydedildi, bağlantı gelince gönderilecek" deyip pencereyi kapatıyordu,
 * oysa yazım henüz yerel kuyruğa girmemişti: uygulama o arada kapatılırsa
 * kayıt gidiyordu. Hazırlık sürerken sendOrQueue "kuyruğa alındı" demez;
 * yazım gönderilince (yerel kuyruğa girince) ya da iş bitince der.
 */
let preparing = 0;
let waiters: (() => void)[] = [];

/** Yazım öncesi hazırlık başladı; dönen işlev yazım gönderilince (ya da hata olunca) çağrılır. */
export function beginPrepare(): () => void {
  preparing++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    preparing = Math.max(0, preparing - 1);
    if (!preparing) { const w = waiters; waiters = []; w.forEach((f) => f()); }
  };
}

/** Hazırlıktaki yazım kalmayınca biter. */
export function whenPrepared(): Promise<void> {
  return preparing ? new Promise((res) => waiters.push(res)) : Promise.resolve();
}
