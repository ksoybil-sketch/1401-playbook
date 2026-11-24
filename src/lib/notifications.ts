/**
 * E-posta bildirimleri: hangi olay, kime. Sunucu tarafı functions/index.js
 * aynı olay adlarını ve varsayılanları kullanır; ikisi birlikte değişmeli.
 */
export type NotifyEvent =
  | 'talep_yeni' | 'talep_acil' | 'talep_yanit' | 'talep_onay' | 'talep_karar' | 'talep_geciken'
  | 'oneri_yeni' | 'oneri_karar' | 'geri_bildirim' | 'gunluk_ozet' | 'haftalik_rapor'
  | 'kurul_soru' | 'kurul_yanit';

export const NOTIFY_EVENTS: { id: NotifyEvent; label: string; when: string; group: 'Talepler' | 'İçerik' | 'Kurul' | 'Özet' | 'Uygulama' }[] = [
  { id: 'talep_yeni', label: 'Yeni talep açıldı', when: 'Anında', group: 'Talepler' },
  { id: 'talep_acil', label: 'Acil talep açıldı', when: 'Anında', group: 'Talepler' },
  { id: 'talep_yanit', label: 'Mağaza talebe yanıt yazdı', when: 'Anında', group: 'Talepler' },
  { id: 'talep_onay', label: 'Servis talebi direktör onayına geldi', when: 'Anında', group: 'Talepler' },
  { id: 'talep_karar', label: 'Servis talebi onaylandı / reddedildi', when: 'Anında', group: 'Talepler' },
  { id: 'talep_geciken', label: '3 günü geçen açık talepler', when: 'Her sabah 08:30', group: 'Talepler' },
  { id: 'oneri_yeni', label: 'Onay bekleyen içerik / bülten / yeni ürün', when: 'Anında', group: 'İçerik' },
  { id: 'oneri_karar', label: 'Önerim yayınlandı / geri gönderildi', when: 'Anında', group: 'İçerik' },
  { id: 'kurul_soru', label: 'Yönetim Kurulu bana soru sordu', when: 'Anında', group: 'Kurul' },
  { id: 'kurul_yanit', label: 'Kurul sorusuna yanıt geldi', when: 'Anında', group: 'Kurul' },
  { id: 'gunluk_ozet', label: 'Günlük özet (talepler, onaylar, sınavlar)', when: 'Her sabah 08:30', group: 'Özet' },
  { id: 'haftalik_rapor', label: 'Haftalık rapor (talep süreleri, sınavlar)', when: 'Pazartesi 09:00', group: 'Özet' },
  { id: 'geri_bildirim', label: 'Uygulamadan gelen geri bildirim', when: 'Anında', group: 'Uygulama' }
];

/** Rol → varsayılan olaylar. functions/index.js DEFAULTS ile aynı. */
export const NOTIFY_DEFAULTS: Record<string, NotifyEvent[]> = {
  developer: ['geri_bildirim', 'haftalik_rapor'],
  director: ['talep_acil', 'talep_onay', 'oneri_yeni', 'kurul_soru', 'gunluk_ozet', 'haftalik_rapor'],
  opsmanager: ['talep_acil', 'talep_onay', 'kurul_soru', 'gunluk_ozet', 'haftalik_rapor'],
  regional: ['talep_yeni', 'talep_acil', 'talep_yanit', 'talep_karar', 'talep_geciken', 'oneri_karar', 'kurul_soru', 'gunluk_ozet'],
  // Pazarlama & Kreatif yalnızca kendi konularındaki talepler için e-posta alır
  // (konu süzgeci sunucuda: functions/ortak.js → katliRecipients).
  marketing: ['talep_yeni', 'talep_acil', 'talep_yanit', 'talep_geciken'],
  board: ['kurul_yanit', 'haftalik_rapor']
};

export interface NotifyPerson { uid?: string; name: string; email: string; role?: string; active?: boolean; events: NotifyEvent[] }
