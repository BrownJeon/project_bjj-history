import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CacheProvider } from '../contexts/CacheContext';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span>로딩 중...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <CacheProvider>
      <Outlet />
    </CacheProvider>
  );
}
