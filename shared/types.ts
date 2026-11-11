/**
 * 1401 Campus — paylaşılan veri modeli.
 *
 * Firestore koleksiyonları:
 *   stores/{storeId}              Mağaza
 *   baristas/{baristaId}          Barista profili (PIN hash'i burada DEĞİL)
 *   staff/{uid}                   Kahve Operasyonu kullanıcıları
 *   tracks/{trackId}              Eğitim yolu (ör. "İçecek Standartları")
 *   modules/{moduleId}            Yolun içindeki modül; sınavı vardır
 *   lessons/{lessonId}            Modülün dersleri (bloklardan oluşur)
 *   questions/{questionId}        Soru bankası — sadece sunucu ve yönetici okur
 *   attempts/{attemptId}          Sınav denemeleri — sadece sunucu yazar
 *   progress/{baristaId}          Ders tamamlama + geçilen modüller
 *   assignments/{assignmentId}    Görevler
 *
 *   users/{uid}                   Her hesabın rolü (bkz. Profile)
 *   pairingCodes/{code}           Telefon eşleştirme (30 dk, tek kullanım)
 *   invites/{code}                Barista davet kodu (7 gün, tek kullanım)
 *   media/{id}                    Ders fotoğrafları (küçültülmüş JPEG, base64)
 *   config/bootstrap              İlk yönetici oluşturuldu mu
 */

export type StaffRole = 'ops' | 'admin';
export type BaristaRole = 'barista' | 'lead';
export type Role = StaffRole | BaristaRole | 'store';

/**
 * users/{uid} — her Firebase Auth hesabının rolü. Güvenlik kuralları
 * kimin ne olduğunu buradan okur (Spark planında custom claim yok).
 *   admin / ops : Kahve Operasyonu (gerçek e-posta + şifre)
 *   store       : eşleştirilmiş mağaza telefonu (her telefona ayrı hesap)
 *   barista/lead: barista hesabı; şifresi PIN'den türetilir
 */
export interface Profile {
  id: string;
  role: Role;
  active: boolean;
  name?: string;
  email?: string;
  storeId?: string;
  baristaId?: string;
  /** Mağaza telefonu: kod kullanılıp telefon bağlandı mı */
  paired?: boolean;
  label?: string;
  createdAt: number;
  lastSeenAt?: number | null;
}

export interface Store {
  id: string;
  name: string;
  city: string;
  active: boolean;
  createdAt: number;
}

export interface Barista {
  id: string;
  name: string;
  storeId: string;
  role: BaristaRole;
  active: boolean;
  /** Davet kodu kullanılıp PIN belirlenene kadar true. */
  pinPending: boolean;
  phone?: string;
  startedAt?: string;
  createdAt: number;
  deactivatedAt?: number;
  /** Bağlı Firebase Auth hesabı. PIN sıfırlanınca yeni hesap açılır, eskisi pasifleşir. */
  uid: string;
  authEmail: string;
  accountSeq: number;
}

export interface Track {
  id: string;
  title: string;
  description: string;
  order: number;
  /** Icon bileşenindeki ad. */
  icon: string;
  published: boolean;
}

export interface Module {
  id: string;
  trackId: string;
  title: string;
  description: string;
  order: number;
  /** Sınavı geçmek için gereken yüzde. */
  passScore: number;
  /** Sınavda sorulacak soru sayısı (bankadan rastgele). */
  examSize: number;
  /** Bu modül açılmadan önce geçilmesi gereken modül. */
  prerequisiteId?: string | null;
  published: boolean;
  /** Bankadaki soru sayısı (yönetici panelinde gösterim için, sunucu günceller). */
  questionCount?: number;
}

/** Bardak şemasındaki malzemenin görsel sınıfı — renk eşlemesi uygulamada. */
export type CupTone =
  | 'espresso' | 'sut' | 'kopuk' | 'buz' | 'su'
  | 'sos' | 'cikolata' | 'toz' | 'matcha' | 'krema' | 'dekor' | 'doz' | 'diger';

/** Ölçünün nasıl gösterileceği. `ml` dışındakiler hacimsizdir, bant çizilmez. */
export type CupFill = 'ml' | 'silme' | 'dekor' | 'adet' | 'opsiyonel' | 'otomatik' | 'bilinmiyor';

export interface CupLayer {
  name: string;
  tone: CupTone;
  /** Bardaktaki sıra: 0 en altta. Üst dekor için 900+. */
  order: number;
  /** Küçük/büyük bardak için ml. Hacimsiz malzemede null. */
  small: number | null;
  large: number | null;
  /** Ölçünün yazılı hâli: "200/270 ml", "Silme Bardak", "Garniş". */
  text: string;
  fill: CupFill;
}

export type LessonBlock =
  | { type: 'heading'; text: string }
  /**
   * Bardak şeması. Çizim derse gömülmez; blok yalnızca sırayı ve ölçüyü
   * taşır, SVG'yi CupDiagram bileşeni üretir (bkz. scripts/recipe-cup.mjs).
   * `art` doluysa şema yerine dışarıdan verilen çizim gösterilir.
   */
  | {
      type: 'cup';
      /** katman: sırayla dökülür · karisim: blenderda karışır, katman yok. */
      mode: 'katman' | 'karisim';
      vessel: 'hot' | 'cold' | 'demi';
      sizes: { oz: number | null; ml: number }[];
      layers: CupLayer[];
      /** Bardağa girmeyen doz — öğütülmüş kahve. */
      dose?: { name: string; text: string };
      /** Malzeme listesinde olmayan, teknikte geçen köpük notu. */
      foam?: string;
      /** Dışarıdan verilen hazır çizim (SVG kaynağı). */
      art?: string;
      /**
       * Panelden elle düzenlendi. "Müfredatı güncelle" bu bloğu ezmez —
       * aksi hâlde Kahve Operasyonu'nun düzelttiği gramaj, bir sonraki
       * sezon güncellemesinde sessizce geri alınırdı.
       */
      edited?: boolean;
    }
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; caption?: string }
  | { type: 'video'; url: string; caption?: string }
  | { type: 'tip'; text: string }
  | { type: 'warning'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'spec'; rows: { label: string; value: string }[] }
  /** Ders içi alıştırma — puanlanmaz, anında geri bildirim verir. */
  | { type: 'check'; prompt: string; options: string[]; answer: number; explanation?: string };

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  order: number;
  durationMin: number;
  blocks: LessonBlock[];
  published: boolean;
}

export type QuestionType = 'single' | 'truefalse';

export interface Question {
  id: string;
  moduleId: string;
  type: QuestionType;
  prompt: string;
  imageUrl?: string;
  options: string[];
  /** Doğru seçeneğin indeksi. */
  answer: number;
  explanation?: string;
}

/** Sınav sırasında telefona giden soru — doğru cevap içermez. */
export interface ExamQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  imageUrl?: string;
  options: string[];
}

export interface AttemptReviewItem {
  questionId: string;
  prompt: string;
  options: string[];
  given: number | null;
  answer: number;
  explanation?: string;
}

export interface Attempt {
  id: string;
  baristaId: string;
  baristaName: string;
  storeId: string;
  moduleId: string;
  moduleTitle: string;
  startedAt: number;
  submittedAt?: number;
  score?: number;
  passed?: boolean;
  total: number;
  correct?: number;
  /** Sadece yanlış yapılan sorular. */
  mistakes?: AttemptReviewItem[];
}

export interface Progress {
  baristaId: string;
  storeId: string;
  /** lessonId → tamamlanma zamanı (ms) */
  lessons: Record<string, number>;
  /** moduleId → en iyi geçme sonucu */
  modules: Record<string, { score: number; passedAt: number }>;
  /** bulletinId → okunma zamanı (ms). Okunmadı rozeti bunu sayar. */
  bulletins?: Record<string, number>;
  updatedAt: number;
}

export type BulletinKind = 'duyuru' | 'kampanya' | 'liderlik';

/**
 * bulletins/{id} — Kahve Operasyonu'nun tüm mağazalara (ya da seçtiği
 * mağazalara) duyurusu. Yeni kampanya, ayın latte art'ı, satış sıralaması.
 *
 * Ders değildir: sınavı, ilerlemesi, önkoşulu yoktur. Okundu bilgisi
 * progress/{baristaId}.bulletins içinde tutulur.
 */
export interface Bulletin {
  id: string;
  kind: BulletinKind;
  title: string;
  /** **kalın** ve "- " madde işaretlerini destekler (RichText ile aynı). */
  body: string;
  /** Boş ya da yoksa tüm mağazalara gider. */
  storeIds?: string[] | null;
  /** Liderlik bülteni için sıralama satırları. */
  rows?: { label: string; value: string }[];
  /**
   * Bültene eklenen görsel. Ders fotoğrafları gibi küçültülüp data URL
   * olarak belgeye gömülür (Spark'ta Storage yok, bkz. src/lib/media.ts).
   */
  imageUrl?: string;
  /** Kampanya bitiş tarihi; geçince listede arşive düşer. */
  expiresAt?: number | null;
  published: boolean;
  /** Üstte sabitlenmiş bülten. */
  pinned?: boolean;
  createdAt: number;
  createdBy: string;
  createdByName: string;
}

export type AssignmentKind = 'lesson' | 'module';

export interface Assignment {
  id: string;
  kind: AssignmentKind;
  /** lessonId veya moduleId */
  targetId: string;
  title: string;
  note?: string;
  storeId: string;
  /** Boşsa mağazadaki tüm aktif baristalara atanmıştır. */
  baristaId?: string | null;
  dueAt?: number | null;
  createdAt: number;
  createdBy: string;
  createdByName: string;
}

export const MAX_EXAMS_PER_WEEK = 3;
