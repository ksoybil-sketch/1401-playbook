import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useWebHistoryTracker } from './lib/webHistory';
import { useSession } from './store/session';
import { useContent } from './store/content';
import { can, isBoard, isDevRole, isManager } from './lib/roles';
import { useBoardView } from './lib/boardView';
import { ForcedPasswordScreen } from './features/staff/ChangePasswordSheet';
import { useAllow, usePermStore } from './lib/permissions';
import { PermissionsPage } from './features/staff/PermissionsPage';
import { useBadgeConfig } from './store/badgeConfig';
import { FullLoader, ToastHost } from './ui/kit';
import { PairScreen, StoreHome, InviteScreen, StaffLogin, OfflineScreen, BootstrapScreen, ClosedScreen } from './features/device/DeviceScreens';
import { BaristaLayout } from './features/barista/BaristaLayout';
import { HomePage, ResultsPage, TeamPage } from './features/barista/HomePages';
import { TracksPage, TrackPage, ModulePage, LessonPage } from './features/barista/Academy';
import { RecipesPage, RecipeDetailPage, StoreRecipesLayout } from './features/barista/RecipesPage';
import { BulletinsPage } from './features/barista/BulletinsPage';
import { ExamPage } from './features/barista/ExamPage';
import { RequestsPage as StoreRequestsPage } from './features/barista/RequestsPage';
import { RequestsPage } from './features/staff/RequestsPage';
import { RequestStatsPage } from './features/staff/RequestStatsPage';
import { NewProductPage } from './features/staff/NewProductPage';
import { FeedbackPage } from './features/staff/FeedbackPage';
import { NotificationsPage } from './features/staff/NotificationsPage';
import { QuestionPoolPage } from './features/staff/QuestionPoolPage';
import { ApprovalsPage } from './features/staff/ApprovalsPage';
import { BadgeSettingsPage } from './features/staff/BadgeSettingsPage';
import { StaffLayout } from './features/staff/StaffLayout';
import { OverviewPage, StoresPage, StoreDetailPage, BaristasPage, BaristaDetailPage, TasksPage } from './features/staff/StaffPages';
import { ContentPage, ModuleEditorPage, LessonEditorPage } from './features/staff/ContentPages';
import { BulletinPage } from './features/staff/BulletinPages';
import { ACTIVITY_LOG } from './demo/log';
import { DemoTracker } from './demo/DemoTracker';
import { KullanimSayaci } from './features/shared/KullanimSayaci';
import { DerslikPickScreen } from './features/device/DerslikScreens';
import { DemoLogPage } from './demo/DemoLogPage';
import { BoardLayout } from './features/board/BoardLayout';
import { BoardOverviewPage, BoardStoresPage, BoardWorkPage, BoardReportsPage, BoardPrintReport } from './features/board/BoardPages';
import { BoardQuestionsPage } from './features/board/BoardQuestions';

export const App: React.FC = () => {
  const session = useSession((s) => s.session);
  const boot = useSession((s) => s.boot);
  const subscribeContent = useContent((s) => s.subscribe);
  const contentReady = useContent((s) => s.ready);

  useEffect(() => boot(), [boot]);
  useWebHistoryTracker();

  const signedIn = session.kind === 'store' || session.kind === 'barista' || session.kind === 'staff';
  const sessionKey = session.kind === 'barista' ? session.baristaId : session.kind === 'staff' ? session.uid : session.kind;
  // İçerik (yollar, modüller, ~100 ders, mağazalar) herkes için aynı: barista
  // girişi/çıkışında yeniden kurulmaz. Eskiden her hesap değişiminde
  // ('loading' arası dahil) dinleyiciler kapanıp açılıyor, 30 dakikadan uzun
  // aradan sonraki her girişte bütün dersler yeniden okunuyordu (kota).
  //  - Hesap değişirken gelen 'loading' arasında dinleyiciler açık kalır.
  //  - Oturumsuz bir an olduysa (çıkış, eşleşme kaldırma; kurallar o anda
  //    dinleyicileri reddedip kapatır) bir sonraki girişte authEpoch artar ve
  //    dinleyiciler yeniden kurulur. Barista girişi/çıkışı hesabı doğrudan
  //    değiştirdiği için (bkz. session.ts logout) arada oturumsuz an yoktur.
  const authEpoch = useSession((s) => s.authEpoch);
  const [contentOn, setContentOn] = useState(false);
  useEffect(() => {
    if (signedIn) setContentOn(true);
    else if (session.kind !== 'loading') setContentOn(false);
  }, [signedIn, session.kind]);
  // Mağaza telefonu (telefon, barista) dersleri "fark" yöntemiyle tutar; panel canlı dinler (bkz. store/content.ts, H4).
  useEffect(() => (contentOn ? subscribeContent(useSession.getState().session.kind === 'staff' ? 'live' : 'delta') : undefined), [contentOn, authEpoch, subscribeContent]);
  // Yetki ayarları (Yetkiler ekranı): panel ve kurul oturumlarında dinlenir.
  const subscribePerms = usePermStore((s) => s.subscribe);
  useEffect(() => (session.kind === 'staff' ? subscribePerms() : undefined), [session.kind, sessionKey, subscribePerms]);
  const subscribeBadges = useBadgeConfig((s) => s.subscribe);
  useEffect(() => (signedIn ? subscribeBadges() : undefined), [signedIn, sessionKey, subscribeBadges]);

  return (
    <>
      <Screens session={session} contentReady={contentReady} />
      {ACTIVITY_LOG && <DemoTracker />}
      {/* Mağaza düzeyinde kullanım sayacı (kişiye bağlı değil, yalnızca mağaza
          oturumlarında yazar): src/lib/kullanimKaydi.ts */}
      <KullanimSayaci />
      <ToastHost />
    </>
  );
};

/**
 * Adres parametresi değişince ekran baştan kurulur. Aynı rota kaldığı için
 * (ör. /baristalar/a → geri → /baristalar/b) ekran ve açık pencereleri eski
 * kaydın bilgisini taşıyordu: "Baristayı düzenle" başka baristanın kaydını
 * eziyor, "Görev ata" önceki baristayı hedefliyordu.
 */
const KeyBy: React.FC<{ param: string; children: React.ReactNode }> = ({ param, children }) => {
  const id = useParams()[param];
  return <React.Fragment key={id}>{children}</React.Fragment>;
};

const Screens: React.FC<{ session: ReturnType<typeof useSession.getState>['session']; contentReady: boolean }> = ({ session, contentReady }) => {
  const allow = useAllow();
  const permReady = usePermStore((s) => s.ready);
  const boardView = useBoardView((s) => s.on);
  switch (session.kind) {
    case 'loading':
      return <FullLoader />;
    case 'offline':
      return <OfflineScreen />;
    case 'closed':
      return (
        <Routes>
          <Route path="/yonetici-girisi" element={<StaffLogin />} />
          <Route path="*" element={<ClosedScreen name={session.storeName} />} />
        </Routes>
      );
    case 'unpaired':
      return (
        <Routes>
          <Route path="/yonetici-girisi" element={<StaffLogin />} />
          <Route path="/kurulum" element={<BootstrapScreen />} />
          <Route path="*" element={<PairScreen />} />
        </Routes>
      );
    case 'store':
      return (
        <Routes>
          <Route path="/davet" element={<InviteScreen />} />
          <Route path="/yonetici-girisi" element={<StaffLogin />} />
          <Route path="/kurulum" element={<BootstrapScreen />} />
          {/* PIN'siz reçete: mağaza telefonunun herkese açık tek bölümü. */}
          <Route element={<StoreRecipesLayout />}>
            <Route path="/receteler" element={<RecipesPage />} />
            <Route path="/recete/:lessonId" element={<RecipeDetailPage />} />
          </Route>
          <Route path="*" element={<StoreHome />} />
        </Routes>
      );
    case 'derslik':
      // Mağaza kodu girildi, barista henüz seçilmedi.
      return (
        <Routes>
          <Route path="*" element={<DerslikPickScreen storeId={session.storeId} storeName={session.storeName} />} />
        </Routes>
      );
    case 'barista':
      if (!contentReady) return <FullLoader text="Eğitimler yükleniyor" />;
      // Evden ders çalışma: yalnızca dersler ve reçeteler. Sınav, bülten,
      // ekip ve talepler mağaza telefonunda kalır (sınav bütünlüğü).
      if (session.derslik) return (
        <Routes>
          <Route element={<BaristaLayout derslik />}>
            <Route index element={<Navigate to="/akademi" replace />} />
            <Route path="akademi" element={<TracksPage />} />
            <Route path="akademi/:trackId" element={<TrackPage />} />
            <Route path="modul/:moduleId" element={<ModulePage />} />
            <Route path="ders/:lessonId" element={<LessonPage />} />
            <Route path="receteler" element={<RecipesPage />} />
            <Route path="recete/:lessonId" element={<RecipeDetailPage />} />
            <Route path="*" element={<Navigate to="/akademi" replace />} />
          </Route>
        </Routes>
      );
      return (
        <Routes>
          <Route element={<BaristaLayout />}>
            <Route index element={<HomePage />} />
            <Route path="receteler" element={<RecipesPage />} />
            <Route path="recete/:lessonId" element={<RecipeDetailPage />} />
            <Route path="bulten" element={<BulletinsPage />} />
            <Route path="akademi" element={<TracksPage />} />
            <Route path="akademi/:trackId" element={<TrackPage />} />
            <Route path="modul/:moduleId" element={<ModulePage />} />
            <Route path="ders/:lessonId" element={<LessonPage />} />
            <Route path="sinav/:moduleId" element={<KeyBy param="moduleId"><ExamPage /></KeyBy>} />
            <Route path="sonuclarim" element={<ResultsPage />} />
            {isManager(session.role) && <Route path="ekip" element={<TeamPage />} />}
            {isManager(session.role) && <Route path="talepler" element={<StoreRequestsPage />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      );
    case 'staff':
      // Yetki ayarı gelmeden ekranlar çizilmez (açık bir ekran yanlışlıkla ana sayfaya yönlenmesin).
      if (!contentReady || !permReady) return <FullLoader />;
      // Geçici şifreyle açılan hesap: önce kendi şifresini belirler.
      if (session.mustChangePassword) return <ForcedPasswordScreen />;
      // Yönetim Kurulu: ayrı, salt okunur ekran (src/features/board).
      if (isBoard(session.role) || (isDevRole(session.role) && boardView)) return (
        <Routes>
          <Route element={<BoardLayout />}>
            <Route index element={<BoardOverviewPage />} />
            {allow(session.role, 'kurul.magazalar') && <Route path="magazalar" element={<BoardStoresPage />} />}
            {allow(session.role, 'kurul.isler') && <Route path="isler" element={<BoardWorkPage />} />}
            {allow(session.role, 'kurul.sorular') && <Route path="sorular" element={<BoardQuestionsPage side="board" me={session} />} />}
            {allow(session.role, 'kurul.raporlar') && <Route path="raporlar" element={<BoardReportsPage />} />}
            {allow(session.role, 'kurul.raporlar') && <Route path="rapor" element={<BoardPrintReport />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      );
      return (
        <Routes>
          <Route element={<StaffLayout />}>
            <Route index element={<OverviewPage />} />
            {/* Her ekran Yetkiler ayarına bağlı: kapalıysa menüde de yok, adresle de açılmaz. */}
            {allow(session.role, 'ekran.magazalar') && <Route path="magazalar" element={<StoresPage />} />}
            {allow(session.role, 'ekran.magazalar') && <Route path="magazalar/:storeId" element={<KeyBy param="storeId"><StoreDetailPage /></KeyBy>} />}
            {allow(session.role, 'ekran.baristalar') && <Route path="baristalar" element={<BaristasPage />} />}
            {allow(session.role, 'ekran.baristalar') && <Route path="baristalar/:baristaId" element={<KeyBy param="baristaId"><BaristaDetailPage /></KeyBy>} />}
            {allow(session.role, 'ekran.gorevler') && <Route path="gorevler" element={<TasksPage />} />}
            {allow(session.role, 'ekran.talepler') && <Route path="talepler" element={<RequestsPage />} />}
            {allow(session.role, 'ekran.talepler') && <Route path="talepler/istatistik" element={<RequestStatsPage />} />}
            {allow(session.role, 'ekran.onaylar') && <Route path="onaylar" element={<ApprovalsPage />} />}
            {allow(session.role, 'ekran.rozetler') && <Route path="rozetler" element={<BadgeSettingsPage />} />}
            {allow(session.role, 'ekran.bulten') && <Route path="bulten" element={<BulletinPage />} />}
            {allow(session.role, 'ekran.akademi') && <Route path="icerik" element={<ContentPage />} />}
            {allow(session.role, 'ekran.yeniUrun') && <Route path="yeni-urun" element={<NewProductPage />} />}
            {allow(session.role, 'ekran.geriBildirim') && <Route path="geri-bildirim" element={<FeedbackPage />} />}
            {allow(session.role, 'ekran.soruHavuzu') && <Route path="soru-havuzu" element={<QuestionPoolPage />} />}
            {allow(session.role, 'ekran.kurulSorulari') && <Route path="kurul-sorulari" element={<BoardQuestionsPage side="ops" me={session} />} />}
            {allow(session.role, 'ekran.bildirimler') && <Route path="bildirimler" element={<NotificationsPage />} />}
            {can(session.role, 'manageTeam') && <Route path="yetkiler" element={<PermissionsPage />} />}
            {allow(session.role, 'ekran.akademi') && <Route path="icerik/modul/:moduleId" element={<KeyBy param="moduleId"><ModuleEditorPage /></KeyBy>} />}
            {allow(session.role, 'ekran.akademi') && <Route path="icerik/ders/:lessonId" element={<KeyBy param="lessonId"><LessonEditorPage /></KeyBy>} />}
            {ACTIVITY_LOG && can(session.role, 'manageAi') && <Route path="demo-kaydi" element={<DemoLogPage />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      );
  }
};
