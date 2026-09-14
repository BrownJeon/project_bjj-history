import client from './client';

export async function login(email, password) {
  const res = await client.post('/auth/login', { email, password });
  return res.data;
}

export async function register(email, password) {
  const res = await client.post('/auth/register', { email, password });
  return res.data;
}

export async function getMe() {
  const res = await client.get('/auth/me');
  return res.data;
}

/**
 * 앱 로그인 코드 → JWT (task-039 A-4). `POST /api/auth/app-exchange {code}` → `{token}`.
 *
 * 🔴 axios `client` 를 쓰지 않는다: 그 응답 인터셉터는 401 이면 `window.location.href = '/login'` 으로
 *    **페이지를 통째로 다시 불러** 방금 띄울 실패 토스트가 사라진다. 만료·재사용 코드는 401 이 정상 응답이라
 *    여기서는 fetch 로 받아 메시지를 그대로 throw 한다(호출부 native/appLogin.js 가 알린다).
 */
export async function appExchange(code) {
  let res;
  try {
    res = await fetch('/api/auth/app-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch {
    throw new Error('네트워크 오류로 로그인하지 못했습니다. 다시 시도해 주세요');
  }
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  const token = body && body.success && body.data && body.data.token;
  if (!res.ok || typeof token !== 'string' || token === '') {
    throw new Error((body && body.message) || `로그인하지 못했습니다 (${res.status})`);
  }
  return token;
}
