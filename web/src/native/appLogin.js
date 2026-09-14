/**
 * 앱 로그인의 마지막 한 칸 — 딥링크(`bjjapp://auth/callback?code=…`)를 로그인 상태로 바꾼다 (task-039 A-4-5).
 *
 * 흐름: 딥링크 수신 → Custom Tab 닫기 → `POST /api/auth/app-exchange {code}` → JWT →
 *       `login(token)`(AuthContext: localStorage['bjj_token'] + /me) → 홈으로 `replace`.
 *
 * ── 중복 처리 방지(코드는 1회용 — 두 번째 교환은 반드시 401) ────────────────────
 * 같은 주소가 여러 번 온다: 콜드 스타트에서 `appUrlOpen`(보관 이벤트)과 `getLaunchUrl()` 이 같은 주소를 주고,
 * `getLaunchUrl()` 은 **WebView 새로고침(로그아웃·401 이동 포함) 뒤에도** 앱 시작 때의 옛 주소를 계속 준다.
 *  · 한 페이지 안: 메모리 Set 으로 거른다.
 *  · 새로고침 뒤: sessionStorage 에 최근 처리한 코드를 남겨 거른다(코드는 이미 소모돼 저장해도 무해).
 *  · 그래도 옛 launch 코드가 교환에 실패했는데 **이미 로그인돼 있으면** 조용히 넘긴다 —
 *    멀쩡히 쓰는 사람에게 "로그인 코드 만료" 알림을 띄우지 않는다. 사용자가 방금 누른 로그인(`open`)의
 *    실패는 항상 알린다(조용한 실패 금지).
 *
 * 이 파일은 React 를 import 하지 않는다 — 의존성은 전부 주입받는다(Node 단위 테스트가 실제 파일을 읽는다).
 */
import { authCodeFromDeepLink, authErrorFromDeepLink } from './bridge';

export const HANDLED_KEY = 'bjj_app_login_handled';
const HANDLED_MAX = 5;

function readHandled(storage) {
  try {
    const raw = storage && storage.getItem(HANDLED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function writeHandled(storage, key) {
  try {
    if (!storage) return;
    const next = readHandled(storage).filter((s) => s !== key);
    next.push(key);
    storage.setItem(HANDLED_KEY, JSON.stringify(next.slice(-HANDLED_MAX)));
  } catch {
    // 저장소가 막힌 WebView — 메모리 Set 만으로 한 페이지 안 중복은 막힌다.
  }
}

/** 구글에서 취소 등 서버가 실어 보낸 오류를 사용자 문구로. */
export function describeAuthError({ error, msg } = {}) {
  const text = `${error || ''} ${msg || ''}`;
  if (/access_denied|cancel/i.test(text)) return '로그인을 취소했습니다';
  return '로그인에 실패했습니다. 다시 시도해 주세요';
}

/**
 * @param {object} deps
 * @param {(code: string) => Promise<string>} deps.exchange   코드 → JWT (실패 시 throw)
 * @param {(token: string) => Promise<boolean>} deps.login   AuthContext.login — 성공 여부
 * @param {(path: string, opts?: object) => void} deps.navigate
 * @param {(msg: string) => void} deps.notify                토스트
 * @param {() => Promise<void>} [deps.closeExternal]
 * @param {() => boolean} [deps.hasToken]                    이미 로그인돼 있는가
 * @param {Storage|null} [deps.storage]                      sessionStorage
 * @returns {(url: string, meta?: {source?: 'open'|'launch'}) => Promise<'ignored'|'duplicate'|'error-link'|'failed'|'silent'|'ok'>}
 */
export function createAppLoginHandler(deps) {
  const {
    exchange, login, navigate, notify,
    closeExternal = async () => {},
    hasToken = () => false,
    storage = null,
  } = deps;
  const seen = new Set();

  async function safeClose() {
    try { await closeExternal(); } catch { /* 부가 동작 */ }
  }

  return async function handleAuthDeepLink(url, meta = {}) {
    const source = meta.source === 'launch' ? 'launch' : 'open';
    const code = authCodeFromDeepLink(url);
    const err = code ? null : authErrorFromDeepLink(url);
    if (!code && !err) return 'ignored'; // 로그인과 무관한 딥링크

    const key = code ? `code:${code}` : `error:${url}`;
    if (seen.has(key) || readHandled(storage).includes(key)) return 'duplicate';
    seen.add(key);
    writeHandled(storage, key);

    await safeClose();

    if (err) {
      // 옛 launch 오류 링크가 새로고침 뒤 다시 오는 경우는 위 중복 검사에서 걸러진다.
      notify(describeAuthError(err));
      if (!hasToken()) navigate('/login', { replace: true });
      return 'error-link';
    }

    let token;
    try {
      token = await exchange(code);
    } catch (e) {
      if (source === 'launch' && hasToken()) return 'silent';
      notify((e && e.message) || '로그인에 실패했습니다. 다시 시도해 주세요');
      if (!hasToken()) navigate('/login', { replace: true });
      return 'failed';
    }

    let ok = false;
    try {
      ok = (await login(token)) !== false;
    } catch {
      ok = false;
    }
    if (!ok) {
      notify('로그인 정보를 불러오지 못했습니다. 다시 시도해 주세요');
      navigate('/login', { replace: true });
      return 'failed';
    }
    navigate('/', { replace: true });
    return 'ok';
  };
}
