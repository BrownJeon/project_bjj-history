import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import './styles/tokens.css';
import './styles/app.css';

import Layout from './components/Layout';
import { UIProvider } from './contexts/UIContext';
import { CacheProvider } from './contexts/CacheContext';

import HomePage from './pages/HomePage';
import CalendarPage from './pages/CalendarPage';
import TechPlanPage from './pages/TechPlanPage';
import ClipsPage from './pages/ClipsPage';
import CoachPage from './pages/CoachPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <UIProvider>
        <CacheProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/"          element={<HomePage />} />
              <Route path="/calendar"  element={<CalendarPage />} />
              <Route path="/techplan"  element={<TechPlanPage />} />
              <Route path="/clips"     element={<ClipsPage />} />
              <Route path="/coach"     element={<CoachPage />} />
              <Route path="/me"        element={<ProfilePage />} />
              <Route path="*"          element={<NotFoundPage />} />
            </Route>
          </Routes>
        </CacheProvider>
      </UIProvider>
    </BrowserRouter>
  </React.StrictMode>
);
