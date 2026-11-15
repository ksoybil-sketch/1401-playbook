/**
 * Barista ekranlarının renk paleti.
 *
 * Panelin geri kalanı sakin ve tek renkli (kahve tonları). Baristanın ana
 * ekranı ise hızlı tanınmalı: "reçete turuncu, sınav pembe, ders mavi"
 * gibi her bölümün kendi rengi var. Renkler CSS değişkeni (styles.css,
 * --hue-*; sınıflar Tailwind taraması için tam yazılı): koyu temalarda aynı, açık Gün Işığı temasında yazı ve kum rengi
 * koyulaşır (eskiden açık zeminde seçili sekme ve Oryantasyon kartı kayboluyordu).
 */
export type Hue = 'amber' | 'rose' | 'sky' | 'mint' | 'violet' | 'sand';

export const HUE: Record<Hue, {
  /** Kart zemini: hafif degrade. */
  tile: string;
  /** İkon kutusu. */
  chip: string;
  /** Vurgu metni / çizgi rengi. */
  text: string;
  /** Ham renk (SVG, ilerleme çubuğu): CSS değeri. */
  hex: string;
}> = {
  amber: { tile: 'bg-linear-to-br from-(--hue-amber)/25 to-(--hue-amber)/[0.06] border-(--hue-amber)/30', chip: 'bg-(--hue-amber) text-[#1A120C]', text: 'text-(--hue-amber-text)', hex: 'var(--hue-amber)' },
  rose: { tile: 'bg-linear-to-br from-(--hue-rose)/25 to-(--hue-rose)/[0.06] border-(--hue-rose)/30', chip: 'bg-(--hue-rose) text-[#1E0F0D]', text: 'text-(--hue-rose-text)', hex: 'var(--hue-rose)' },
  sky: { tile: 'bg-linear-to-br from-(--hue-sky)/25 to-(--hue-sky)/[0.06] border-(--hue-sky)/30', chip: 'bg-(--hue-sky) text-[#0C1621]', text: 'text-(--hue-sky-text)', hex: 'var(--hue-sky)' },
  mint: { tile: 'bg-linear-to-br from-(--hue-mint)/25 to-(--hue-mint)/[0.06] border-(--hue-mint)/30', chip: 'bg-(--hue-mint) text-[#0C1A12]', text: 'text-(--hue-mint-text)', hex: 'var(--hue-mint)' },
  violet: { tile: 'bg-linear-to-br from-(--hue-violet)/25 to-(--hue-violet)/[0.06] border-(--hue-violet)/30', chip: 'bg-(--hue-violet) text-[#150F20]', text: 'text-(--hue-violet-text)', hex: 'var(--hue-violet)' },
  sand: { tile: 'bg-linear-to-br from-(--hue-sand-from) to-(--hue-sand-to) border-(--hue-sand-line)', chip: 'bg-(--hue-sand) text-(--hue-sand-ink)', text: 'text-(--hue-sand-text)', hex: 'var(--hue-sand)' }
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
