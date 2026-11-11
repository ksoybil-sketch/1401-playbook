import React, { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './store/session';
import { useContent } from './store/content';
import { FullLoader, ToastHost } from './ui/kit';
import { PairScreen, StoreHome, InviteScreen, StaffLogin, OfflineScreen, BootstrapScreen } from './features/device/DeviceScreens';
import { BaristaLayout } from './features/barista/BaristaLayout';
import { HomePage, ResultsPage, TeamPage } from './features/barista/HomePages';
import { TracksPage, TrackPage, ModulePage, LessonPage } from './features/barista/Academy';
import { RecipesPage } from './features/barista/RecipesPage';
import { ExamPage } from './features/barista/ExamPage';
import { StaffLayout } from './features/staff/StaffLayout';
import { OverviewPage, StoresPage, StoreDetailPage, BaristasPage, BaristaDetailPage, TasksPage } from './features/staff/StaffPages';
import { ContentPage, ModuleEditorPage, LessonEditorPage } from './features/staff/ContentPages';

export const App: React.FC = () => {
  const session = useSession((s) => s.session);
  const boot = useSession((s) => s.boot);
  const subscribeContent = useContent((s) => s.subscribe);
  const contentReady = useContent((s) => s.ready);

  useEffect(() => boot(), [boot]);

  const signedIn = session.kind === 'store' || session.kind === 'barista' || session.kind === 'staff';
  const sessionKey = session.kind === 'barista' ? session.baristaId : session.kind === 'staff' ? session.uid : session.kind;
  useEffect(() => (signedIn ? subscribeContent() : undefined), [signedIn, sessionKey, subscribeContent]);

  return (
    <>
      <Screens session={session} contentReady={contentReady} />
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
            <Route path="akademi" element={<TracksPage />} />
            <Route path="akademi/:trackId" element={<TrackPage />} />
            <Route path="modul/:moduleId" element={<ModulePage />} />
            <Route path="ders/:lessonId" element={<LessonPage />} />
            <Route path="sinav/:moduleId" element={<ExamPage />} />
            <Route path="sonuclarim" element={<ResultsPage />} />
            {session.role === 'lead' && <Route path="ekip" element={<TeamPage />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      );
    case 'staff':
      if (!contentReady) return <FullLoader />;
      return (
        <Routes>
          <Route element={<StaffLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="magazalar" element={<StoresPage />} />
            <Route path="magazalar/:storeId" element={<StoreDetailPage />} />
            <Route path="baristalar" element={<BaristasPage />} />
            <Route path="baristalar/:baristaId" element={<BaristaDetailPage />} />
            <Route path="gorevler" element={<TasksPage />} />
            <Route path="icerik" element={<ContentPage />} />
            <Route path="icerik/modul/:moduleId" element={<ModuleEditorPage />} />
            <Route path="icerik/ders/:lessonId" element={<LessonEditorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      );
  }
};
