import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import './styles/tokens.css';
import './styles/app.css';

import Layout from './components/Layout';
import { UIProvider } from './contexts/UIContext';
import { CacheProvider } from './contexts/CacheContext';

import CalendarPage from './pages/CalendarPage';
import TechniquesPage from './pages/TechniquesPage';
import ChainsPage from './pages/ChainsPage';
import GameplanPage from './pages/GameplanPage';
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
              <Route path="/"           element={<CalendarPage />} />
              <Route path="/techniques" element={<TechniquesPage />} />
              <Route path="/chains"     element={<ChainsPage />} />
              <Route path="/gameplan"   element={<GameplanPage />} />
              <Route path="/clips"      element={<ClipsPage />} />
              <Route path="/coach"      element={<CoachPage />} />
              <Route path="/me"         element={<ProfilePage />} />
              <Route path="*"           element={<NotFoundPage />} />
            </Route>
          </Routes>
        </CacheProvider>
      </UIProvider>
    </BrowserRouter>
  </React.StrictMode>
);
