/**
 * Barista ekranlarının renk paleti.
 *
 * Panelin geri kalanı sakin ve tek renkli (kahve tonları). Baristanın ana
 * ekranı ise hızlı tanınmalı: "reçete turuncu, sınav pembe, ders mavi"
 * gibi her bölümün kendi rengi var. Barista ekranları her zaman koyu
 * (Espresso) olduğu için renkler koyu zemine göre seçildi.
 */
export type Hue = 'amber' | 'rose' | 'sky' | 'mint' | 'violet' | 'sand';

export const HUE: Record<Hue, {
  /** Kart zemini: hafif degrade. */
  tile: string;
  /** İkon kutusu. */
  chip: string;
  /** Vurgu metni / çizgi rengi. */
  text: string;
  /** Ham renk (SVG, ilerleme çubuğu). */
  hex: string;
}> = {
  amber: { tile: 'bg-linear-to-br from-[#D9A066]/25 to-[#D9A066]/[0.06] border-[#D9A066]/30', chip: 'bg-[#D9A066] text-[#1A120C]', text: 'text-[#E8B47E]', hex: '#D9A066' },
  rose: { tile: 'bg-linear-to-br from-[#E07A6E]/25 to-[#E07A6E]/[0.06] border-[#E07A6E]/30', chip: 'bg-[#E07A6E] text-[#1E0F0D]', text: 'text-[#EE9C91]', hex: '#E07A6E' },
  sky: { tile: 'bg-linear-to-br from-[#6FA8DC]/25 to-[#6FA8DC]/[0.06] border-[#6FA8DC]/30', chip: 'bg-[#6FA8DC] text-[#0C1621]', text: 'text-[#93BFE6]', hex: '#6FA8DC' },
  mint: { tile: 'bg-linear-to-br from-[#72C094]/25 to-[#72C094]/[0.06] border-[#72C094]/30', chip: 'bg-[#72C094] text-[#0C1A12]', text: 'text-[#95D3AF]', hex: '#72C094' },
  violet: { tile: 'bg-linear-to-br from-[#A98BDB]/25 to-[#A98BDB]/[0.06] border-[#A98BDB]/30', chip: 'bg-[#A98BDB] text-[#150F20]', text: 'text-[#C2ABE8]', hex: '#A98BDB' },
  sand: { tile: 'bg-linear-to-br from-[#E2DAD1]/[0.14] to-[#E2DAD1]/[0.03] border-[#E2DAD1]/20', chip: 'bg-[#E2DAD1] text-[#1A1512]', text: 'text-[#E2DAD1]', hex: '#E2DAD1' }
};

/** Eğitim yollarının sabit renkleri — her ekranda aynı yol aynı renkte. */
const TRACK_HUE: Record<string, Hue> = {
  oryantasyon: 'sand',
  'icecek-standartlari': 'amber',
  'misafir-deneyimi': 'rose',
  'isletme-standartlari': 'sky'
};
const FALLBACK: Hue[] = ['violet', 'mint', 'sky', 'rose', 'amber'];

export function trackHue(trackId: string, index = 0): Hue {
  return TRACK_HUE[trackId] ?? FALLBACK[index % FALLBACK.length];
}
