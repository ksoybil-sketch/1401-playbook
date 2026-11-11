import type { BaristaRole, StaffRole } from '../../shared/types';

/**
 * Yetki sıralaması — kim neyi yapabilir. Arayüz bu tablodan okur;
 * aynı kurallar firestore.rules'ta da yazılıdır (ikisi birlikte değişmeli).
 *
 *   developer  Kutay Soybil — uygulama geliştiricisi. Dağıtıma çıkana kadar
 *              hiçbir kurala takılmaz, her şeyi görür ve yapar.
 *   director   Cenk Girginol — Kahve Operasyon Müdürü, en üst yetkili.
 *              İçeriği ve bülteni doğrudan yayınlar, önerileri onaylar,
 *              Kahve Operasyonu ekibine kişi ekler/çıkarır.
 *   regional   Uğur Can Gürbüz — Bölge Müdürü. Barista/mağaza/kod işleri
 *              onda. İçerik ve bülten değişiklikleri doğrudan yayına
 *              girmez, Cenk Bey'in "Bekleyen onaylar" listesine düşer.
 *   ops        Kahve Operasyonu ekibi — öneri yapar, görev atar.
 *   admin      Eski sürümden kalan tam yetkili rol (developer gibi davranır).
 */
export type Capability =
  | 'publish'          // içerik ve bülteni doğrudan yayınla
  | 'approve'          // önerileri onayla / reddet
  | 'manageTeam'       // Kahve Operasyonu ekibine ekle / çıkar
  | 'manageBaristas'   // barista, mağaza, telefon ve davet kodları
  | 'publishCurriculum'// hazır müfredatı toplu yükle
  | 'handleRequests'   // mağaza taleplerini yanıtla
  | 'deleteRecords';   // sınav kaydı silmek gibi geri dönüşsüz işler

const TABLE: Record<StaffRole, Capability[]> = {
  developer: ['publish', 'approve', 'manageTeam', 'manageBaristas', 'publishCurriculum', 'handleRequests', 'deleteRecords'],
  admin: ['publish', 'approve', 'manageTeam', 'manageBaristas', 'publishCurriculum', 'handleRequests', 'deleteRecords'],
  director: ['publish', 'approve', 'manageTeam', 'publishCurriculum', 'handleRequests'],
  regional: ['manageBaristas', 'handleRequests'],
  ops: []
};

export function can(role: StaffRole | undefined, cap: Capability): boolean {
  return !!role && (TABLE[role] || []).includes(cap);
}

export const STAFF_ROLES: StaffRole[] = ['developer', 'director', 'regional', 'ops', 'admin'];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  developer: 'Uygulama geliştiricisi',
  director: 'Kahve Operasyon Müdürü',
  regional: 'Bölge Müdürü',
  ops: 'Kahve Operasyonu',
  admin: 'Tam yetkili'
};

/** Ekibe kimin hangi rolle kişi ekleyebileceği. */
export function assignableRoles(me: StaffRole): StaffRole[] {
  if (me === 'developer' || me === 'admin') return ['director', 'regional', 'ops', 'developer'];
  if (me === 'director') return ['regional', 'ops'];
  return [];
}

export const BARISTA_ROLE_LABEL: Record<BaristaRole, string> = {
  lead: 'Mağaza müdürü',
  shift: 'Vardiya müdürü',
  barista: 'Barista'
};

/** Mağaza müdürü ve vardiya müdürü: ekip ekranı, talepler, görev atama. */
export const isManager = (r: BaristaRole | undefined) => r === 'lead' || r === 'shift';

export const BARISTA_ROLES: BaristaRole[] = ['barista', 'shift', 'lead'];
