import type { BaristaRole, StaffRole } from '../../shared/types';
import { allowed, type Perm } from './permissions';

/**
 * Roller ve yetkiler. Her rolün neyi görüp değiştirebildiği artık ayarlanabilir:
 * varsayılanlar ve Yetkiler ekranının ayarı src/lib/permissions.ts'te, aynı
 * kurallar firestore.rules → perm() içinde (ikisi birlikte değişmeli).
 *
 *   developer  Kutay Soybil — uygulama geliştiricisi. Dağıtıma çıkana kadar
 *              hiçbir kurala takılmaz, her şeyi görür ve yapar.
 *   director   Cenk Girginol — Kahve Operasyon Direktörü, uygulamanın yürütücüsü.
 *              İçeriği ve bülteni doğrudan yayınlar, önerileri onaylar.
 *              Ekibe (kurul dahil) kişi ekler/çıkarır, Yetkiler ekranını yönetir.
 *   opsmanager Semih Dizdar — Operasyon Müdürü. Rütbece direktörle eş; alanı
 *              kahve dışı (standartlar, oryantasyon, misafir deneyimi). Talepleri
 *              yanıtlar ve servis onayı verir, her konuda bülten yayınlar.
 *   regional   Uğur Can Gürbüz — Bölge Müdürü. Barista/mağaza/kod işleri
 *              onda. İçerik ve bülten değişiklikleri doğrudan yayına
 *              girmez, Cenk Bey'in "Bekleyen onaylar" listesine düşer.
 *   ops        Kahve Operasyonu ekibi — öneri yapar, görev atar.
 *   board      Yönetim Kurulu üyesi — gidişatı, raporları ve süren işleri
 *              okur; hiçbir şeyi değiştirmez. Kendi ekranı var (src/features/board);
 *              Kahve Operasyonu yöneticilerine soru sorar.
 *   admin      Eski sürümden kalan tam yetkili rol (developer gibi davranır).
 */
export type Capability =
  | 'publish'          // içeriği doğrudan yayınla        → yetki: icerikYayin
  | 'approve'          // önerileri onayla / reddet        → yetki: oneriOnay
  | 'manageTeam'       // ekibe kişi ekle / çıkar, Yetkiler ekranı (sabit: direktör + geliştirici)
  | 'manageBaristas'   // barista, mağaza, telefon, kod    → yetki: baristaYonetim
  | 'publishCurriculum'// hazır müfredatı toplu yükle (sabit: direktör + geliştirici)
  | 'handleRequests'   // mağaza taleplerini yanıtla       → yetki: talepYanit
  | 'deleteRecords'    // geri dönüşsüz işler (yalnız geliştirici)
  | 'manageAi';        // yapay zekâ anahtarı (yalnız geliştirici)

/**
 * Eski yetki adları, ayarlanabilir yetkilere (src/lib/permissions.ts)
 * bağlanır. Sabit olanlar ayarlardan etkilenmez.
 */
const MAP: Partial<Record<Capability, Perm>> = {
  publish: 'icerikYayin', approve: 'oneriOnay', manageBaristas: 'baristaYonetim', handleRequests: 'talepYanit'
};
const FIXED: Partial<Record<Capability, StaffRole[]>> = {
  manageTeam: ['developer', 'admin', 'director'],
  publishCurriculum: ['developer', 'admin', 'director'],
  deleteRecords: ['developer', 'admin'],
  manageAi: ['developer', 'admin']
};

export function can(role: StaffRole | undefined, cap: Capability): boolean {
  if (!role) return false;
  const fixed = FIXED[cap];
  if (fixed) return fixed.includes(role);
  return allowed(role, MAP[cap]!);
}

export const STAFF_ROLES: StaffRole[] = ['developer', 'director', 'opsmanager', 'regional', 'ops', 'admin', 'board'];

/** Yönetim Kurulu: salt okunur, ayrı ekran. */
export const isBoard = (r: StaffRole | undefined) => r === 'board';
/** Kurul sorularını yanıtlayabilenler. */
export const answersBoard = (r: StaffRole | undefined) => allowed(r, 'kurulYanit');

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  developer: 'Uygulama geliştiricisi',
  director: 'Kahve Operasyon Direktörü',
  opsmanager: 'Operasyon Müdürü',
  regional: 'Bölge Müdürü',
  ops: 'Kahve Operasyonu',
  admin: 'Tam yetkili',
  board: 'Yönetim Kurulu Üyesi'
};

/** Ekibe kimin hangi rolle kişi ekleyebileceği. */
export function assignableRoles(me: StaffRole): StaffRole[] {
  if (me === 'developer' || me === 'admin') return ['director', 'opsmanager', 'regional', 'ops', 'board', 'developer'];
  // Cenk Bey uygulamanın yürütücüsü: Yönetim Kurulu dahil ekibi o kurar.
  if (me === 'director') return ['opsmanager', 'regional', 'ops', 'board'];
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
