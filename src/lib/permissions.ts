import { create } from 'zustand';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../api/firebase';
import type { Module, RequestCategory, StaffRole } from '../../shared/types';

/**
 * Yetki ayarları — kim neyi görür, neyi değiştirir.
 *
 * Her rolün varsayılanı aşağıdaki DEFAULTS tablosundadır. Kahve Operasyon
 * Direktörü "Yetkiler" ekranından bir rol için herhangi bir satırı açıp
 * kapatabilir; değişiklik config/permissions belgesine yazılır ve hem
 * arayüz (menü, sayfalar, düğmeler) hem Firestore kuralları buradan okur.
 * Kurallardaki varsayılan listeler bu tabloyla aynıdır: ikisi birlikte
 * değişmeli (firestore.rules → perm()).
 *
 * Değiştirilemeyenler:
 *   - Uygulama geliştiricisi (Kutay Soybil) her şeyi yapar, ayarlardan etkilenmez.
 *   - Ekibe kişi ekleme/çıkarma ve bu Yetkiler ekranı Kahve Operasyon
 *     Direktörü'nde sabittir (kimse kendini kilitleyemesin).
 *
 * Alan sınırı: bir rolün içerik yetkisi belirli eğitim yollarıyla
 * sınırlanabilir (Operasyon Müdürü: kahve dışı yollar). Sınır yoksa her yerde.
 *
 * Konu sınırı: bir rolün talep ekranı belirli konularla sınırlanabilir
 * (Pazarlama & Kreatif: tabela / pano / baskı). Sınırlı rol yalnızca o
 * konudaki talepleri görür ve yanıtlar; sınır yoksa bütün konular.
 */

export type Perm =
  // Panel ekranları
  | 'ekran.talepler' | 'ekran.onaylar' | 'ekran.baristalar' | 'ekran.magazalar' | 'ekran.gorevler'
  | 'ekran.bulten' | 'ekran.rozetler' | 'ekran.yeniUrun' | 'ekran.akademi' | 'ekran.soruHavuzu'
  | 'ekran.geriBildirim' | 'ekran.kurulSorulari' | 'ekran.bildirimler'
  // Yönetim Kurulu ekranları
  | 'kurul.magazalar' | 'kurul.isler' | 'kurul.sorular' | 'kurul.raporlar'
  // İşlemler
  | 'talepYanit' | 'servisOnay' | 'icerikYayin' | 'oneriOnay' | 'bultenYayin' | 'baristaYonetim'
  | 'gorevAtama' | 'soruDuzelt' | 'rozetAyar' | 'kurulYanit';

export interface PermDef { id: Perm; label: string; hint: string; group: 'Ekranlar' | 'İşlemler' | 'Yönetim Kurulu ekranları'; domain?: boolean }

export const PERMS: PermDef[] = [
  { id: 'ekran.talepler', group: 'Ekranlar', label: 'Talepler', hint: 'Mağaza talepleri ve istatistikleri' },
  { id: 'ekran.onaylar', group: 'Ekranlar', label: 'Onaylar / öneriler', hint: 'Bekleyen içerik ve bülten önerileri' },
  { id: 'ekran.baristalar', group: 'Ekranlar', label: 'Baristalar', hint: 'Barista listesi, ilerleme, sınav geçmişi' },
  { id: 'ekran.magazalar', group: 'Ekranlar', label: 'Mağazalar', hint: 'Mağaza ekipleri ve telefonları' },
  { id: 'ekran.gorevler', group: 'Ekranlar', label: 'Görevler', hint: 'Atanan eğitim görevleri' },
  { id: 'ekran.bulten', group: 'Ekranlar', label: 'Bülten', hint: 'Duyuru, kampanya, liderlik' },
  { id: 'ekran.rozetler', group: 'Ekranlar', label: 'Rozetler', hint: 'Başarım ve önlük rozeti kuralları' },
  { id: 'ekran.yeniUrun', group: 'Ekranlar', label: 'Yeni ürün', hint: 'Reçete + mini sınav + bülten akışı' },
  { id: 'ekran.akademi', group: 'Ekranlar', label: 'Akademi', hint: 'Eğitim yolları, modüller, dersler' },
  { id: 'ekran.soruHavuzu', group: 'Ekranlar', label: 'Soru havuzu', hint: 'Bütün sınav soruları ve istatistikleri' },
  { id: 'ekran.geriBildirim', group: 'Ekranlar', label: 'Geri bildirim', hint: 'Uygulamadan gelen hata ve öneriler' },
  { id: 'ekran.kurulSorulari', group: 'Ekranlar', label: 'Kurul soruları', hint: 'Yönetim Kurulu\'nun soruları' },
  { id: 'ekran.bildirimler', group: 'Ekranlar', label: 'E-posta bildirimleri', hint: 'Kime hangi e-posta gider' },

  { id: 'talepYanit', group: 'İşlemler', label: 'Talepleri yanıtla', hint: 'Mağazaya yazar, durumunu değiştirir' },
  { id: 'servisOnay', group: 'İşlemler', label: 'Servis onayı ver', hint: 'Yetkili servis taleplerini onaylar' },
  { id: 'icerikYayin', group: 'İşlemler', label: 'Eğitim içeriğini yayınla', hint: 'Ders, modül, reçete; kapalıysa öneri onaya düşer', domain: true },
  { id: 'oneriOnay', group: 'İşlemler', label: 'Önerileri onayla', hint: 'Başkalarının önerilerini yayınlar ya da geri gönderir', domain: true },
  { id: 'bultenYayin', group: 'İşlemler', label: 'Bülten yayınla', hint: 'Kapalıysa bülten onaya düşer' },
  { id: 'soruDuzelt', group: 'İşlemler', label: 'Soruları düzelt / iptal et', hint: 'İptalde geçmiş sınavlar yeniden puanlanır', domain: true },
  { id: 'gorevAtama', group: 'İşlemler', label: 'Görev ata', hint: 'Mağazalara ve baristalara eğitim görevi', domain: true },
  { id: 'baristaYonetim', group: 'İşlemler', label: 'Barista ve mağaza yönetimi', hint: 'Barista ekle/çıkar, PIN, davet kodu, telefon' },
  { id: 'rozetAyar', group: 'İşlemler', label: 'Rozet ayarları ve önlük teslimi', hint: 'Başarım kuralları, temalar, istisnalar' },
  { id: 'kurulYanit', group: 'İşlemler', label: 'Kurul sorularını yanıtla', hint: 'Yönetim Kurulu\'na yanıt yazar' },

  { id: 'kurul.magazalar', group: 'Yönetim Kurulu ekranları', label: 'Mağazalar (karne)', hint: 'Mağaza karnesi ve ayrıntısı' },
  { id: 'kurul.isler', group: 'Yönetim Kurulu ekranları', label: 'Süren işler', hint: 'Açık talepler, onaylar, görevler, bültenler' },
  { id: 'kurul.sorular', group: 'Yönetim Kurulu ekranları', label: 'Sorular', hint: 'Kahve Operasyonu\'na soru sorma' },
  { id: 'kurul.raporlar', group: 'Yönetim Kurulu ekranları', label: 'Raporlar', hint: 'Yönetim raporu ve Excel tabloları' }
];

const PANEL_ALL: Perm[] = ['ekran.talepler', 'ekran.onaylar', 'ekran.baristalar', 'ekran.magazalar', 'ekran.gorevler', 'ekran.bulten', 'ekran.rozetler', 'ekran.yeniUrun', 'ekran.akademi', 'ekran.soruHavuzu'];

/** Rol → varsayılan açık yetkiler. firestore.rules perm() varsayılanlarıyla aynı. */
export const DEFAULTS: Record<Exclude<StaffRole, 'developer'>, Perm[]> = {
  director: [...PANEL_ALL, 'ekran.geriBildirim', 'ekran.kurulSorulari', 'ekran.bildirimler',
    'talepYanit', 'servisOnay', 'icerikYayin', 'oneriOnay', 'bultenYayin', 'soruDuzelt', 'gorevAtama', 'rozetAyar', 'kurulYanit'],
  // Semih Dizdar: rütbece Cenk Bey'le eş, alanı kahve dışı (standartlar, oryantasyon, misafir).
  opsmanager: ['ekran.talepler', 'ekran.onaylar', 'ekran.baristalar', 'ekran.magazalar', 'ekran.gorevler', 'ekran.bulten', 'ekran.rozetler',
    'ekran.akademi', 'ekran.soruHavuzu', 'ekran.geriBildirim', 'ekran.kurulSorulari',
    'talepYanit', 'servisOnay', 'icerikYayin', 'oneriOnay', 'bultenYayin', 'soruDuzelt', 'gorevAtama', 'kurulYanit'],
  regional: [...PANEL_ALL, 'ekran.geriBildirim', 'ekran.kurulSorulari', 'talepYanit', 'baristaYonetim', 'gorevAtama', 'kurulYanit'],
  // Pazarlama & Kreatif: bülteni, talepleri ve akademiyi okur. İçerik ve bülten
  // yetkisi yok — akademide hiçbir şeyi değiştirmez, öneri bile açmaz
  // (firestore.rules → isStaff() bu rolü kapsamaz). Talep yanıtı açık ama
  // konu sınırıyla: yalnızca tabela / pano / baskı (DEFAULT_CATS).
  marketing: ['ekran.talepler', 'ekran.bulten', 'ekran.akademi', 'talepYanit'],
  board: ['kurul.magazalar', 'kurul.isler', 'kurul.sorular', 'kurul.raporlar']
};

/** Yönetim Kurulu yalnızca kendi ekranlarını açabilir; işlem yetkisi verilemez. */
export const permsFor = (role: StaffRole): PermDef[] =>
  role === 'board' ? PERMS.filter((p) => p.group === 'Yönetim Kurulu ekranları') : PERMS.filter((p) => p.group !== 'Yönetim Kurulu ekranları');

/** Varsayılan alan sınırları: Operasyon Müdürü kahve (içecek standartları) dışı. firestore.rules ile aynı. */
export const DEFAULT_DOMAINS: Partial<Record<StaffRole, string[]>> = {
  opsmanager: ['oryantasyon', 'misafir-deneyimi', 'isletme-standartlari']
};

/**
 * Varsayılan talep konusu sınırları: Pazarlama & Kreatif yalnızca kendi
 * konularını görür ve yanıtlar. firestore.rules → reqCats() ile aynı.
 * Listede olmayan rol bütün konuları görür.
 */
export const DEFAULT_CATS: Partial<Record<StaffRole, RequestCategory[]>> = {
  marketing: ['tabela', 'pano', 'baski']
};

/** Ayarlanabilir roller (yetki sırasıyla). Geliştirici listede yok. */
export const EDITABLE_ROLES: Exclude<StaffRole, 'developer'>[] = ['director', 'opsmanager', 'regional', 'marketing', 'board'];

export interface PermConfig {
  roles?: Partial<Record<StaffRole, Partial<Record<Perm, boolean>>>>;
  /** Rol → izinli eğitim yolları. Yoksa / null ise sınırsız. */
  domains?: Partial<Record<StaffRole, string[] | null>>;
  /** Rol → görüp yanıtlayabildiği talep konuları. Yoksa / null ise hepsi. */
  cats?: Partial<Record<StaffRole, RequestCategory[] | null>>;
  updatedAt?: number;
  updatedByName?: string;
  log?: { at: number; byName: string; text: string; dev?: boolean }[];
}

interface PermState { config: PermConfig; ready: boolean; subscribe: () => () => void }

export const usePermStore = create<PermState>((set) => ({
  config: {},
  ready: false,
  subscribe: () => onSnapshot(doc(db, 'config', 'permissions'),
    (s) => set({ config: (s.data() as PermConfig) || {}, ready: true }),
    () => set({ config: {}, ready: true }))
}));

const isDev = (r?: StaffRole) => r === 'developer';

export function allowedIn(cfg: PermConfig, role: StaffRole | undefined, p: Perm): boolean {
  if (!role) return false;
  if (isDev(role)) return true;
  const o = cfg.roles?.[role]?.[p];
  if (typeof o === 'boolean') return o;
  return (DEFAULTS[role as keyof typeof DEFAULTS] || []).includes(p);
}

/** Senkron sorgu (React dışı kod için: changes.ts gibi). */
export const allowed = (role: StaffRole | undefined, p: Perm) => allowedIn(usePermStore.getState().config, role, p);

/** Bileşen içinde: ayar değişince yeniden çizilir. */
export function useAllow() {
  const cfg = usePermStore((s) => s.config);
  return (role: StaffRole | undefined, p: Perm) => allowedIn(cfg, role, p);
}

/** Rolün içerik alanı: izinli eğitim yolları (null = her yer). */
export function domainIn(cfg: PermConfig, role: StaffRole | undefined): string[] | null {
  if (!role || isDev(role)) return null;
  const d = cfg.domains?.[role];
  if (d !== undefined) return d;
  return DEFAULT_DOMAINS[role] ?? null;
}
export const domainOf = (role: StaffRole | undefined) => domainIn(usePermStore.getState().config, role);
export function useDomain(role: StaffRole | undefined) {
  const cfg = usePermStore((s) => s.config);
  return domainIn(cfg, role);
}

/**
 * Rolün talep konuları: görüp yanıtlayabildiği konular (null = hepsi).
 * Talepler ekranı, talep istatistikleri, menü rozeti ve "Seni bekleyenler"
 * bu listeye göre süzülür; yanıt yetkisi de konu konu denetlenir.
 */
export function catsIn(cfg: PermConfig, role: StaffRole | undefined): RequestCategory[] | null {
  if (!role || isDev(role)) return null;
  const c = cfg.cats?.[role];
  if (c !== undefined) return c;
  return DEFAULT_CATS[role] ?? null;
}
export const catsOf = (role: StaffRole | undefined) => catsIn(usePermStore.getState().config, role);
export function useCats(role: StaffRole | undefined) {
  const cfg = usePermStore((s) => s.config);
  return catsIn(cfg, role);
}
/** Bu konu rolün kapsamında mı (sınır yoksa her konu). */
export const inCats = (cats: RequestCategory[] | null, cat: RequestCategory) => !cats || cats.includes(cat);

/** Modül bu rolün alanında mı. */
export function moduleInDomain(domain: string[] | null, mod: Pick<Module, 'trackId'> | undefined | null): boolean {
  if (!domain) return true;
  return !!mod && domain.includes(mod.trackId);
}
