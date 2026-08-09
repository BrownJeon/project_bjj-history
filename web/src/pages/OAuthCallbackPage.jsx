import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// /oauth/callback?token=xxx  — OAuth 완료 후 백엔드가 리다이렉트하는 착지 페이지
export default function OAuthCallbackPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    const err    = params.get('error');

    if (token) {
      // 토큰을 localStorage에 저장하고 메인으로 이동
      login(token, null); // user는 AuthContext에서 /me로 재조회
      navigate('/', { replace: true });
      return;
    }

    if (err) {
      const msg = params.get('msg') || 'OAuth 로그인에 실패했습니다';
      setError(decodeURIComponent(msg));
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } else {
      navigate('/login', { replace: true });
    }
  }, []);

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={styles.error}>{error}</p>
          <p style={styles.sub}>3초 후 로그인 페이지로 이동합니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.text}>로그인 처리 중...</p>
      </div>
    </div>
  );
}

const styles = {
  page:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' },
  card:  { textAlign: 'center', padding: '2rem', color: 'var(--text)' },
  text:  { color: 'var(--text2)' },
  error: { color: 'var(--red)', marginBottom: '0.5rem' },
  sub:   { color: 'var(--text2)', fontSize: '0.85rem' },
};
