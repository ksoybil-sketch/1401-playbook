import React, { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './store/session';
import { useContent } from './store/content';
import { answersBoard, can, isBoard, isManager } from './lib/roles';
import { useBadgeConfig } from './store/badgeConfig';
import { FullLoader, ToastHost } from './ui/kit';
import { PairScreen, StoreHome, InviteScreen, StaffLogin, OfflineScreen, BootstrapScreen } from './features/device/DeviceScreens';
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

  const signedIn = session.kind === 'store' || session.kind === 'barista' || session.kind === 'staff';
  const sessionKey = session.kind === 'barista' ? session.baristaId : session.kind === 'staff' ? session.uid : session.kind;
  useEffect(() => (signedIn ? subscribeContent() : undefined), [signedIn, sessionKey, subscribeContent]);
  const subscribeBadges = useBadgeConfig((s) => s.subscribe);
  useEffect(() => (signedIn ? subscribeBadges() : undefined), [signedIn, sessionKey, subscribeBadges]);

  return (
    <>
      <Screens session={session} contentReady={contentReady} />
      {ACTIVITY_LOG && <DemoTracker />}
      <ToastHost />
    </>
  );
};

const Screens: React.FC<{ session: ReturnType<typeof useSession.getState>['session']; contentReady: boolean }> = ({ session, contentReady }) => {
  switch (session.kind) {
    case 'loading':
      return <FullLoader />;
    case 'offline':
      return <OfflineScreen />;
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
    case 'barista':
      if (!contentReady) return <FullLoader text="Eğitimler yükleniyor" />;
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
            <Route path="sinav/:moduleId" element={<ExamPage />} />
            <Route path="sonuclarim" element={<ResultsPage />} />
            {isManager(session.role) && <Route path="ekip" element={<TeamPage />} />}
            {isManager(session.role) && <Route path="talepler" element={<StoreRequestsPage />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      );
    case 'staff':
      if (!contentReady) return <FullLoader />;
      // Yönetim Kurulu: ayrı, salt okunur ekran (src/features/board).
      if (isBoard(session.role)) return (
        <Routes>
          <Route element={<BoardLayout />}>
            <Route index element={<BoardOverviewPage />} />
            <Route path="magazalar" element={<BoardStoresPage />} />
            <Route path="isler" element={<BoardWorkPage />} />
            <Route path="sorular" element={<BoardQuestionsPage side="board" me={session} />} />
            <Route path="raporlar" element={<BoardReportsPage />} />
            <Route path="rapor" element={<BoardPrintReport />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      );
      return (
        <Routes>
          <Route element={<StaffLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="magazalar" element={<StoresPage />} />
            <Route path="magazalar/:storeId" element={<StoreDetailPage />} />
            <Route path="baristalar" element={<BaristasPage />} />
            <Route path="baristalar/:baristaId" element={<BaristaDetailPage />} />
            <Route path="gorevler" element={<TasksPage />} />
            <Route path="talepler" element={<RequestsPage />} />
            <Route path="talepler/istatistik" element={<RequestStatsPage />} />
            <Route path="onaylar" element={<ApprovalsPage />} />
            <Route path="rozetler" element={<BadgeSettingsPage />} />
            <Route path="bulten" element={<BulletinPage />} />
            <Route path="icerik" element={<ContentPage />} />
            <Route path="yeni-urun" element={<NewProductPage />} />
            <Route path="geri-bildirim" element={<FeedbackPage />} />
            <Route path="soru-havuzu" element={<QuestionPoolPage />} />
            {answersBoard(session.role) && <Route path="kurul-sorulari" element={<BoardQuestionsPage side="ops" me={session} />} />}
            {can(session.role, 'approve') && <Route path="bildirimler" element={<NotificationsPage />} />}
            <Route path="icerik/modul/:moduleId" element={<ModuleEditorPage />} />
            <Route path="icerik/ders/:lessonId" element={<LessonEditorPage />} />
            {ACTIVITY_LOG && can(session.role, 'manageAi') && <Route path="demo-kaydi" element={<DemoLogPage />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      );
  }
};
