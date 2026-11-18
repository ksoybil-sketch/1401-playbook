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
 *   proposals/{id}                Onay bekleyen içerik/bülten değişiklikleri
 *   requests/{id}                 Mağaza talepleri (arıza, servis, malzeme…)
 *   boardQuestions/{id}           Yönetim Kurulu'nun Kahve Operasyonu'na soruları
 *
 *   users/{uid}                   Her hesabın rolü (bkz. Profile)
 *   pairingCodes/{code}           Telefon eşleştirme (7 gün, tek kullanım)
 *   derslikKodlari/{code}         Evden ders çalışma kodu (mağaza başına, yenilenebilir)
 *   invites/{code}                Barista davet kodu (7 gün, tek kullanım)
 *   media/{id}                    Ders fotoğrafları (küçültülmüş JPEG, base64)
 *   config/bootstrap              İlk yönetici oluşturuldu mu
 *   clock/{uid}                   Sunucu saati ölçümü = o hesabın son etkinliği
 *   kullanim/{storeId}_{gün}      Mağaza düzeyinde kullanım sayacı (kişiye bağlı DEĞİL)
 */

/** Bkz. src/lib/roles.ts — yetki sıralaması ve her rolün yapabildikleri. */
/** board: Yönetim Kurulu üyesi — her şeyi okur, hiçbir şeyi değiştirmez; Kahve Operasyonu'na soru sorar. */
/** opsmanager: Operasyon Müdürü — rütbece direktörle eş, alanı kahve dışı (bkz. src/lib/permissions.ts). */
export type StaffRole = 'developer' | 'director' | 'opsmanager' | 'regional' | 'board';
/** lead: mağaza müdürü · shift: vardiya müdürü. */
export type BaristaRole = 'barista' | 'lead' | 'shift';
/** derslik: evden ders çalışma girişi — yalnızca mağazasının barista listesini ve müfredatı okur. */
export type Role = StaffRole | BaristaRole | 'store' | 'derslik';

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
  /** Ekip: direktörün verdiği geçici şifreyle açıldı; ilk girişte şifresini değiştirir. */
  mustChangePassword?: boolean;
}

/** Önlüğe takılan fiziksel rozet. */
export type ApronBadge = 'rookie' | 'specialist' | 'senior' | 'pro';

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
  /** Son çıkarılma anı. Yeniden etkinleştirilince silinmez (geçmiş; bkz. history). */
  deactivatedAt?: number | null;
  /** Çıkış/dönüş geçmişi (backend.ts setBaristaActive, resetBaristaPin). */
  history?: { kind: 'cikis' | 'donus'; at: number; byName?: string }[];
  /** Bağlı Firebase Auth hesabı. PIN sıfırlanınca yeni hesap açılır, eskisi pasifleşir. */
  uid: string;
  authEmail: string;
  accountSeq: number;
  /** Son verilen davet kodunun geçerlilik sonu — "kod bekleyenler" takibi. */
  inviteExpiresAt?: number;
  /** Kodu kim verdi (Bölge Müdürü). */
  codeIssuedByName?: string;
  /** Teslim edilen son önlük rozeti (rookie/specialist/senior/pro). */
  apronBadge?: ApronBadge | null;
  apronBadgeAt?: number | null;
  apronBadgeByName?: string | null;
  /** Rozet/başarım istisnaları (geri alma, elle verme) — bkz. src/lib/badges.ts BadgeOverrides. */
  badgeOverrides?: {
    revoked?: Record<string, { at: number; byName: string; reason: string }>;
    granted?: Record<string, { at: number; byName: string; reason: string }>;
    titleCap?: { from: 'rookie' | 'specialist' | 'senior' | 'pro'; at: number; byName: string; reason: string; until?: number | null } | null;
  };
}

export interface Track {
  id: string;
  /** Son yazım zamanı: eşzamanlı düzenleme ve eski öneri uyarısı için (changes.ts). */
  updatedAt?: number;
  /** 'panel': panelde açıldı; "Müfredatı güncelle" silmez (publishCurriculum.ts). */
  kaynak?: 'panel';
  title: string;
  description: string;
  order: number;
  /** Icon bileşenindeki ad. */
  icon: string;
  published: boolean;
}

export interface Module {
  id: string;
  /** Son yazım zamanı: eşzamanlı düzenleme ve eski öneri uyarısı için (changes.ts). */
  updatedAt?: number;
  /** 'panel': panelde açıldı; "Müfredatı güncelle" silmez (publishCurriculum.ts). */
  kaynak?: 'panel';
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
  /** Son yazım zamanı: eşzamanlı düzenleme ve eski öneri uyarısı için (changes.ts). */
  updatedAt?: number;
  moduleId: string;
  title: string;
  order: number;
  durationMin: number;
  blocks: LessonBlock[];
  published: boolean;
  /** 'panel': panelde oluşturuldu, müfredat güncellemesi silmez. */
  kaynak?: 'panel';
  /**
   * Bu derse ait mini sınavdaki soru sayısı (Yeni ürün akışı). Sorular
   * modülün bankasında `lessonId` ile işaretli durur; modül sınavına da girer.
   */
  quiz?: number;
}

export type QuestionType = 'single' | 'truefalse';

/**
 * Sorunun neyi ölçtüğü. Sınav seçimi türler arasında dengelenir; aksi hâlde
 * havuzda çok olan tür (ölçü) sınavı tek başına kaplıyordu.
 */
export type QuestionKind =
  | 'olcu' | 'porsiyon' | 'malzeme' | 'adim' | 'teknik' | 'katman' | 'servis'
  | 'kavram' | 'durum' | 'kural' | 'yetki' | 'zaman' | 'genel';

export interface Question {
  id: string;
  /** Son yazım zamanı: eşzamanlı düzenleme ve eski öneri uyarısı için (changes.ts). */
  updatedAt?: number;
  moduleId: string;
  type: QuestionType;
  prompt: string;
  imageUrl?: string;
  options: string[];
  /** Doğru seçeneğin indeksi. */
  answer: number;
  explanation?: string;
  kind?: QuestionKind;
  /** Bir derse (yeni ürün reçetesine) ait mini sınav sorusu. */
  lessonId?: string;
  /** 'panel': panelde oluşturuldu, müfredat güncellemesi silmez. */
  kaynak?: 'panel';
  /**
   * Kahve Operasyon Direktörü soruyu iptal etti (hatalı): sınavlara gelmez,
   * geçmiş sınavlar bu soru olmadan yeniden puanlanır. Müfredat güncellemesi
   * bu işareti korur.
   */
  disabled?: boolean;
  /** Soru havuzunda elle düzeltildi: müfredat güncellemesi ezmez. */
  edited?: boolean;
  disabledReason?: string;
  disabledByName?: string;
  disabledAt?: number;
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
  /** Sorulan sorular (sırasıyla). Puanlama bunlardan yeniden kurulur. */
  questionIds?: string[];
  /** questionId → şıkların gösterildiği sıra (özgün indeksler). */
  orders?: Record<string, number[]>;
  /** questionId → işaretlenen şık (gösterilen sıradaki indeks). Her işaretlemede yazılır. */
  answers?: Record<string, number>;
  /** Son teslim anı (ms): soru sayısı × 1,5 dk. */
  deadline?: number;
  passScore?: number;
  /** Süre dolduğu için o ana kadarki cevaplarla otomatik puanlandı. */
  timedOut?: boolean;
  /** Eski sürümden kalan, puanlanamayan deneme: haftalık haktan sayılmaz. */
  voided?: boolean;
  /** Mini sınav (tek ders) ise o dersin kimliği. */
  lessonId?: string | null;
  /** İptal edilen soru(lar) çıkarılarak yeniden puanlandı. */
  regradedAt?: number;
  regradeNote?: string;
  voidedQuestions?: string[];
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
  /** lessonId → mini sınavın en iyi geçme sonucu (Yeni ürün akışı). */
  quizzes?: Record<string, { score: number; passedAt: number }>;
  /** Baristanın seçtiği tema (src/lib/baristaThemes.ts). */
  theme?: string;
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
  /** Son yazım zamanı: eşzamanlı düzenleme ve eski öneri uyarısı için (changes.ts). */
  updatedAt?: number;
  kind: BulletinKind;
  title: string;
  /** **kalın** ve "- " madde işaretlerini destekler (RichText ile aynı). */
  body: string;
  /** Boş ya da yoksa tüm mağazalara gider. */
  storeIds?: string[] | null;
  /** Liderlik bülteni için sıralama satırları. */
  rows?: { label: string; value: string }[];
  /**
   * Liderlik bülteninin biçimi: satış sıralaması (rows) ya da terfi /
   * başarı duyurusu (people). Eski bültenlerde yok = 'satis'.
   */
  board?: 'satis' | 'terfi';
  /** Terfi/tebrik edilen kişiler: "Vardiya müdürlüğüne terfi etti". */
  people?: { baristaId?: string | null; name: string; storeName?: string; note: string }[];
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

/** feedback/{id}: uygulama içinden gelen geri bildirim (Kutay'a düşer). */
export type FeedbackKind = 'hata' | 'icerik' | 'oneri';
export type FeedbackStatus = 'yeni' | 'inceleniyor' | 'cozuldu';
export interface Feedback {
  id: string;
  kind: FeedbackKind;
  text: string;
  imageUrl?: string;
  lessonId?: string;
  lessonTitle?: string;
  /** Sınav sonucundan "Bu soruda hata var" ile bildirildiyse. */
  questionId?: string;
  questionPrompt?: string;
  /** Gönderildiği ekran, uygulama sürümü, cihaz. */
  path: string;
  version: string;
  device: string;
  by: string;
  byName: string;
  role: string;
  storeName?: string;
  status: FeedbackStatus;
  note?: string;
  createdAt: number;
  updatedAt?: number;
}

/** lesson: dersi tamamla · module: modül sınavını geç · quiz: dersin mini sınavını geç. */
export type AssignmentKind = 'lesson' | 'module' | 'quiz';

export interface Assignment {
  id: string;
  kind: AssignmentKind;
  /** lessonId (lesson, quiz) veya moduleId */
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

/**
 * kullanim/{storeId}_{YYYYAAGG} — mağaza düzeyinde günlük kullanım sayacı.
 * İçinde uid, ad ya da barista kimliği YOKTUR: kişisel veri değil, toplu
 * istatistiktir. Yazan: src/lib/kullanimKaydi.ts (yalnızca mağaza
 * oturumları). Okuyan: yalnızca uygulama geliştiricisi (firestore.rules,
 * npm run kullanim). Anahtar sayıları kuralda sınırlıdır.
 */
export interface KullanimGunu {
  storeId: string;
  /** YYYYAAGG (UTC) — kural request.time ile doğrular. */
  day: string;
  /** Uygulama kaç kez açıldı. */
  acilis?: number;
  /** "08" → o saatte kaç açılış (Türkiye saati). En çok 24 anahtar. */
  saatler?: Record<string, number>;
  /** Ekran kodu → kaç kez açıldı (src/lib/ekranlar.ts). En çok 20 anahtar. */
  ekran?: Record<string, number>;
  /** Reçete kimliği → kaç kez açıldı. En çok 40 anahtar. */
  recete?: Record<string, number>;
  updatedAt: number;
}

/**
 * derslikKodlari/{code} — "evden ders çalış" kodu.
 *
 * Mağaza başına bir kod; müdür dağıtır, panelden yenilenir. Kodu bilen,
 * giriş yapmadan bu belgeyi okuyabilir (eşleştirme kodlarıyla aynı desen:
 * kodu bilmek kanıttır) ve içindeki sınırlı "derslik" hesabıyla yalnızca
 * o mağazanın barista listesini görür. Ders okumak için barista sonra
 * kendi PIN'iyle girer.
 *
 * Belge PIN ya da barista şifresi TAŞIMAZ; yalnızca derslik hesabının
 * kimliği vardır. Kod sızarsa panelden yenilenir (eski hesap pasifleşir).
 */
export interface DerslikKodu {
  code: string;
  storeId: string;
  storeName: string;
  /** Sınırlı derslik hesabı (users/{uid}.role == 'derslik'). */
  uid: string;
  email: string;
  password: string;
  createdAt: number;
  createdByName?: string;
}

export const MAX_EXAMS_PER_WEEK = 3;

/* ------------------------------------------------------------------ */
/* Onay akışı                                                          */
/* ------------------------------------------------------------------ */

/** Bir belgeye yapılacak tek işlem. `set` belgeyi baştan yazar. */
export interface ChangeOp {
  op: 'set' | 'update' | 'delete';
  col: 'lessons' | 'modules' | 'tracks' | 'questions' | 'bulletins' | 'assignments';
  id: string;
  data?: Record<string, unknown>;
}

export type ProposalKind = 'lesson' | 'module' | 'track' | 'question' | 'bulletin' | 'order' | 'product';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/**
 * proposals/{id} — Bölge müdürü ya da operasyon ekibinin yaptığı,
 * Kahve Operasyon Direktörü'nün onayını bekleyen değişiklik. Onaylanınca `ops`
 * olduğu gibi (ya da müdürün düzelttiği hâliyle) uygulanır.
 */
export interface Proposal {
  id: string;
  /** Öneri yazılırken hedef belgelerin updatedAt değerleri (belge kimliği → zaman). */
  baseUpdatedAt?: Record<string, number | null>;
  kind: ProposalKind;
  title: string;
  /** "Ders düzenlendi", "Yeni soru" gibi kısa açıklama. */
  summary: string;
  ops: ChangeOp[];
  status: ProposalStatus;
  createdAt: number;
  createdBy: string;
  createdByName: string;
  updatedAt?: number;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewedByName?: string;
  /** Müdür yayınlamadan önce değiştirdiyse true. */
  editedOnReview?: boolean;
  reviewNote?: string;
}

/* ------------------------------------------------------------------ */
/* Mağaza talepleri                                                    */
/* ------------------------------------------------------------------ */

export type RequestCategory = 'ariza' | 'servis' | 'malzeme' | 'personel' | 'diger';
/**
 * İşletme kitapçığındaki akış: şube talebi açar → Bölge Müdürü görür ve
 * çözümü organize eder → yetkili servis gerekiyorsa Kahve Operasyon
 * Direktörü onaylar (approval) → çözüldü.
 */
export type RequestStatus = 'open' | 'seen' | 'in_progress' | 'approval' | 'done' | 'rejected';
export type RequestPriority = 'normal' | 'urgent';

/**
 * Talep neden hâlâ açık? Operasyon işleme alırken ya da onaya gönderirken
 * seçer, iş ilerledikçe değiştirir. İstatistik sayfası hangi nedenin ne
 * kadar beklettiğini buradan hesaplar (aksayan yeri bulmak için).
 */
export type RequestWaitReason = 'parca' | 'servis' | 'onay' | 'butce' | 'tedarikci' | 'magaza' | 'diger';
/** Talep neden reddedildi. */
export type RequestRejectReason = 'kapsam' | 'tekrar' | 'gereksiz' | 'magaza_cozdu' | 'diger';

export interface RequestNote {
  at: number;
  by: string;
  byName: string;
  /** Kahve Operasyonu mu yazdı, mağaza mı. */
  side: 'ops' | 'store';
  text: string;
  /** Bu notla birlikte durum değiştiyse. */
  status?: RequestStatus;
  /** Bekleme nedeni (işlemde/onayda) ya da red nedeni. */
  reason?: RequestWaitReason | RequestRejectReason;
}

/**
 * requests/{id} — Mağaza müdürü / vardiya müdürünün Kahve Operasyonu'na
 * açtığı iş: arızalı ekipman, teknik servis, malzeme, personel. Operasyon
 * görür, durumunu değiştirir, yanıt yazar; mağaza yanıtlayabilir.
 */
export interface StoreRequest {
  id: string;
  storeId: string;
  storeName: string;
  category: RequestCategory;
  priority: RequestPriority;
  title: string;
  detail: string;
  imageUrl?: string;
  /** Arıza talebinde ekipman: kahve makinesi, değirmen, fırın… */
  equipment?: string;
  status: RequestStatus;
  notes: RequestNote[];
  createdAt: number;
  createdBy: string;
  createdByName: string;
  updatedAt: number;
  /** Son yanıtı kim, hangi taraftan yazdı — okunmamış rozeti için. */
  lastSide: 'ops' | 'store';
  closedAt?: number | null;
  /** Şu an neyi bekliyor (açıkken). */
  waitReason?: RequestWaitReason | null;
  /** Reddedildiyse nedeni. */
  rejectReason?: RequestRejectReason | null;
  /** Kişiye bağlı talep (PIN sıfırlama): kod kullanılınca kendiliğinden kapanır. */
  subjectBaristaId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Yönetim Kurulu soruları                                              */
/* ------------------------------------------------------------------ */

/** Sorunun neyle ilgili olduğu: talep, öneri, mağaza, görev, barista ya da genel. */
export type BoardTopicKind = 'request' | 'proposal' | 'store' | 'assignment' | 'barista' | 'report' | 'general';
export interface BoardTopic { kind: BoardTopicKind; id?: string | null; title: string }
export interface BoardMessage { at: number; by: string; byName: string; side: 'board' | 'ops'; text: string }
/**
 * boardQuestions/{id} — Yönetim Kurulu üyesi "bu konu ne oldu?" diye sorar,
 * Kahve Operasyon Direktörü ya da Bölge Müdürü yanıtlar. Kurulun bütün
 * üyeleri bütün soruları görür (kurul tek bir masadır).
 */
export interface BoardQuestion {
  id: string;
  topic: BoardTopic;
  /** Kime soruldu: tek bir yönetici ya da hepsi ('both' eski kayıtlarda "hepsi" demektir). */
  to: 'director' | 'opsmanager' | 'regional' | 'all' | 'both';
  messages: BoardMessage[];
  status: 'open' | 'answered' | 'closed';
  lastSide: 'board' | 'ops';
  createdAt: number;
  createdBy: string;
  createdByName: string;
  updatedAt: number;
}
