/**
 * 앱 로그인 복귀 핸들러 — `GET /oauth/callback` · `GET /login?error=` (task-039 A-4-3).
 *
 * `backend/src/index.js` 에서 **dist 정적 서빙 뒤 · SPA 폴백 앞**에 붙는다.
 * 🔴 SPA 폴백 정규식(`/^(?!\/api\/).*\/`)은 건드리지 않는다 — 이 핸들러가 처리하지 않는 요청은
 *    전부 `next()` 로 흘려 보내 **웹 로그인 흐름은 한 글자도 바뀌지 않는다.**
 *
 * ── 흐름 ─────────────────────────────────────────────────────────────────────
 * 1. 앱이 Custom Tab 으로 `/api/auth/app-start?provider=google` 을 연다 → 쿠키 `bjj_app_login` 을 심고
 *    공유 OAuth 라우터(`/api/auth/google`)로 302.
 * 2. 공유 라우터(@workspace/auth-oauth, 무수정)가 성공 시 `/oauth/callback?token=<JWT>` 로,
 *    실패 시 `/login?error=oauth_failed&msg=…` 로 302 한다.
 *    🔴 실패는 `/oauth/callback` 이 아니라 **`/login`** 으로 온다(공유 라우터 `redirectOnError` 실측) —
 *    그래서 `/login` 도 여기서 받는다. 받지 않으면 사용자가 구글에서 "취소"했을 때 Custom Tab 안에
 *    웹 로그인 화면이 떠 있고 앱으로는 영영 돌아가지 않는다.
 * 3. 쿠키가 있으면(= 앱에서 시작한 로그인) 여기서 가로챈다:
 *    · 유효 JWT → 60초 1회용 코드 발급 → 쿠키 삭제 → `302 bjjapp://auth/callback?code=…`
 *    · 무효 JWT / 토큰 없음 / error → 쿠키 삭제 → `302 bjjapp://auth/callback?error=…`
 *    쿠키가 없으면 `next()` — 일반 브라우저의 웹 로그인은 기존 `OAuthCallbackPage` 가 그대로 처리한다.
 * 4. 폴백: Custom Tab 이 스킴 302 를 막는 기기를 대비해, 쿠키 값이 `fallback`(app-start 에
 *    `fallback=1`) 이거나 이 요청에 `?fallback=1` 이 있으면 302 대신 "앱으로 돌아가기" 버튼 HTML 을 준다.
 *    웹 배포만으로 앱의 `app-start` 주소에 `&fallback=1` 을 붙여 전환할 수 있다(APK 재빌드 불필요).
 *
 * 🔴 딥링크에는 JWT 를 싣지 않는다. 🔴 코드·토큰 원문을 로그에 남기지 않는다.
 */
const jwt = require('jsonwebtoken');
const {
  APP_LOGIN_COOKIE,
  appAuthCodes,
  buildAppDeepLink,
  clearAppLoginCookie,
  readCookie,
} = require('../services/appAuthCodes');

const JWT_SECRET = process.env.JWT_SECRET || 'bjj-dev-secret-change-in-prod';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstString(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return '';
}

/** 302 가 막히는 기기용 — 사용자가 직접 누르는 스킴 링크(사용자 제스처라 Custom Tab 이 허용한다). */
function renderFallbackPage(deepLink, isError) {
  const href = escapeHtml(deepLink);
  const msg = isError ? '로그인을 완료하지 못했습니다.' : '로그인이 완료되었습니다.';
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>BJJ 훈련일지 — 앱으로 돌아가기</title>
<style>
html,body{margin:0;height:100%;background:#0C0D12;color:#EEEEF2;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Noto Sans KR',sans-serif}
main{height:100%;display:grid;place-items:center;text-align:center;padding:24px;box-sizing:border-box}
p{margin:0 0 18px;color:#7C8098}
a{display:inline-block;min-height:44px;line-height:44px;padding:0 24px;border-radius:10px;background:#1D9E75;color:#fff;font-weight:600;text-decoration:none}
</style></head>
<body><main><div><p>${msg}</p><a href="${href}">앱으로 돌아가기</a></div></main></body></html>`;
}

/**
 * @param {object} [deps] 테스트 주입용
 * @param {string} [deps.jwtSecret]
 * @param {{issue:(token:string)=>string}} [deps.store]
 */
function createAppOAuthCallbackHandler({ jwtSecret = JWT_SECRET, store = appAuthCodes } = {}) {
  return function appOAuthCallback(req, res, next) {
    if (req.method !== 'GET') return next();

    const isCallback = req.path === '/oauth/callback';
    const errorParam = firstString(req.query.error);
    const isLoginError = req.path === '/login' && errorParam !== '';
    if (!isCallback && !isLoginError) return next();

    const mark = readCookie(req, APP_LOGIN_COOKIE);
    if (mark !== '1' && mark !== 'fallback') return next(); // 웹 로그인 — 기존 흐름 그대로

    // 여기부터는 "앱에서 시작한 로그인의 끝". 성공이든 실패든 표시 쿠키는 한 번 쓰고 버린다
    // (남겨 두면 10분 안에 같은 폰 브라우저에서 한 웹 로그인까지 앱으로 끌려간다).
    clearAppLoginCookie(res);
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');

    let deepLink;
    let isError = false;
    const token = isCallback ? firstString(req.query.token) : '';
    if (token !== '') {
      try {
        jwt.verify(token, jwtSecret);
        deepLink = buildAppDeepLink({ code: store.issue(token) });
        console.log('[app-auth] 앱 로그인 코드 발급 (60초·1회용)');
      } catch {
        isError = true;
        deepLink = buildAppDeepLink({ error: 'invalid_token' });
        console.warn('[app-auth] 앱 로그인 콜백 — 토큰 검증 실패');
      }
    } else {
      isError = true;
      deepLink = buildAppDeepLink({
        error: (errorParam || 'no_token').slice(0, 64),
        msg: firstString(req.query.msg).slice(0, 100),
      });
      console.warn(`[app-auth] 앱 로그인 실패 복귀 (${isCallback ? 'callback' : 'login'})`);
    }

    const wantFallback = mark === 'fallback' || firstString(req.query.fallback) === '1';
    if (wantFallback) {
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
      return res.status(200).type('html').send(renderFallbackPage(deepLink, isError));
    }
    return res.redirect(302, deepLink);
  };
}

module.exports = { createAppOAuthCallbackHandler, renderFallbackPage };
