import React, { createContext, useContext, useEffect, useState } from 'react';
import { getMe } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('bjj_token');
    if (!token) { setLoading(false); return; }
    getMe()
      .then(setUser)
      .catch(() => localStorage.removeItem('bjj_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(token, userData) {
    localStorage.setItem('bjj_token', token);
    if (userData) {
      setUser(userData);
    } else {
      // OAuth callback: user data 없이 token만 받은 경우 /me로 조회
      try {
        const me = await getMe();
        setUser(me);
      } catch {
        localStorage.removeItem('bjj_token');
      }
    }
  }

  function logout() {
    localStorage.removeItem('bjj_token');
    setUser(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
