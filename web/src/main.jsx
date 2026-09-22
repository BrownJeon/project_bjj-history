import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import './styles/tokens.css';
import './styles/app.css';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { UIProvider } from './contexts/UIContext';
import { AuthProvider } from './contexts/AuthContext';
import NativeAppHost from './native/NativeAppHost';
import { isNativeApp } from './native/bridge';

import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import HomePage from './pages/HomePage';
import CalendarPage from './pages/CalendarPage';
import RecallPage from './pages/RecallPage';
import ResearchPage from './pages/ResearchPage';
import PickMeUpPage from './pages/PickMeUpPage';
import TechPlanPage from './pages/TechPlanPage';
import StudyVideoPage from './pages/StudyVideoPage';
import StudyVideoDetailPage from './pages/StudyVideoDetailPage';
import ClipsPage from './pages/ClipsPage';
import CoachPage from './pages/CoachPage';
import ProfilePage from './pages/ProfilePage';
import DemoTechPickerPage from './pages/DemoTechPickerPage';
import NotFoundPage from './pages/NotFoundPage';

// 안드로이드 앱(Capacitor WebView)이면 첫 렌더 전에 `<html data-native>` 를 붙인다 — 상태바 여백
// (styles/tokens.css `--native-top`)이 첫 페인트부터 적용되게. 웹 브라우저에서는 붙지 않는다(task-039 A-6).
if (isNativeApp()) document.documentElement.dataset.native = '';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UIProvider>
          {/* 앱 전용 전역 연결부(딥링크 로그인·뒤로가기·/uploads 저장). 웹에서는 아무것도 하지 않는다. */}
          <NativeAppHost />
          <Routes>
            <Route path="/login"          element={<LoginPage />} />
            <Route path="/signup"         element={<SignupPage />} />
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/"          element={<HomePage />} />
                <Route path="/calendar"  element={<CalendarPage />} />
                <Route path="/recall"    element={<RecallPage />} />
                <Route path="/research"  element={<ResearchPage />} />
                <Route path="/pickmeup"  element={<PickMeUpPage />} />
                <Route path="/techplan"  element={<TechPlanPage />} />
                <Route path="/study"     element={<StudyVideoPage />} />
                <Route path="/study/:id" element={<StudyVideoDetailPage />} />
                <Route path="/clips"     element={<ClipsPage />} />
                <Route path="/coach"     element={<CoachPage />} />
                <Route path="/me"        element={<ProfilePage />} />
                <Route path="/demo/tech-picker" element={<DemoTechPickerPage />} /> {/* task-046 임시 데모 — 메뉴 없음, 저장 안 함 */}
                <Route path="*"          element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </UIProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
