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

  // 반환값: 로그인 상태가 됐는가(boolean). 기존 호출부(LoginPage·OAuthCallbackPage)는 반환값을 쓰지 않으므로
  // 동작이 바뀌지 않는다. 앱 딥링크 로그인(native/appLogin.js)은 실패 시 알리기 위해 이 값을 본다(task-039).
  async function login(token, userData) {
    localStorage.setItem('bjj_token', token);
    if (userData) {
      setUser(userData);
      return true;
    }
    // OAuth callback: user data 없이 token만 받은 경우 /me로 조회
    try {
      const me = await getMe();
      setUser(me);
      return true;
    } catch {
      localStorage.removeItem('bjj_token');
      return false;
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
