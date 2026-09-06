import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import './styles/tokens.css';
import './styles/app.css';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { UIProvider } from './contexts/UIContext';
import { AuthProvider } from './contexts/AuthContext';

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
import NotFoundPage from './pages/NotFoundPage';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UIProvider>
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
                <Route path="*"          element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </UIProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
