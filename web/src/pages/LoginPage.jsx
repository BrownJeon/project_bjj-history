import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login as apiLogin } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import OAuthButtons from '../components/OAuthButtons';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await apiLogin(email, password);
      login(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || '로그인에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>BJJ 훈련일지</h1>
        <p style={styles.sub}>로그인</p>
        <OAuthButtons style={{ marginBottom: '1rem' }} />

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>또는 이메일로</span>
          <span style={styles.dividerLine} />
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="이메일" required style={styles.input}
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="비밀번호" required style={styles.input}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? '로그인 중...' : '이메일로 로그인'}
          </button>
        </form>
        <p style={styles.link}>
          계정이 없으신가요? <Link to="/signup" style={styles.a}>회원가입</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' },
  card:  { width: '100%', maxWidth: 360, padding: '2rem', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)' },
  title: { margin: 0, fontSize: '1.4rem', color: 'var(--text)', textAlign: 'center' },
  sub:   { margin: '0.25rem 0 1.5rem', color: 'var(--text2)', textAlign: 'center', fontSize: '0.9rem' },
  form:  { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  input: { padding: '0.7rem 1rem', border: '1px solid var(--border-med)', borderRadius: 'var(--radius)', background: 'var(--surface-up)', color: 'var(--text)', fontSize: '1rem', outline: 'none' },
  error: { margin: 0, color: 'var(--red)', fontSize: '0.85rem' },
  btn:         { padding: '0.75rem', borderRadius: 'var(--radius)', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' },
  link:        { marginTop: '1rem', textAlign: 'center', color: 'var(--text2)', fontSize: '0.85rem' },
  a:           { color: 'var(--accent-lt)', textDecoration: 'none' },
  divider:     { display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0 1rem' },
  dividerLine: { flex: 1, height: '1px', background: 'var(--border)' },
  dividerText: { color: 'var(--text3)', fontSize: '0.75rem', whiteSpace: 'nowrap' },
};
