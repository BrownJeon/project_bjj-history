/**
 * 앱(Android APK) 로그인용 **60초 1회용 코드** 저장소 — task-039 A-4.
 *
 * ── 왜 코드인가 ─────────────────────────────────────────────────────────────
 * Google 은 WebView 안 OAuth 를 막는다. 그래서 앱은 Custom Tab(외부 브라우저)으로 로그인하고,
 * 서버가 로그인 끝에 앱 스킴 `bjjapp://auth/callback` 으로 돌려보낸다. 그런데 Custom Tab 과
 * 앱 WebView 는 저장소(localStorage·쿠키)를 공유하지 않으므로 **토큰을 어떻게든 앱에 넘겨야 한다.**
 * 딥링크 URL 에 JWT(30일 유효)를 그대로 실으면 기록·가로채기 한 번에 계정이 넘어간다 —
 * 그래서 딥링크에는 **60초 · 1회용 · 추측 불가(256bit)** 코드만 싣고, 앱 WebView 가
 * `POST /api/auth/app-exchange` 로 코드를 JWT 로 바꾼다.
 *
 * ── 메모리 Map 인 이유 ───────────────────────────────────────────────────────
 * pm2 단일 프로세스(`bjj`)이고 코드 수명이 60초라, 재시작으로 잃는 것은 "진행 중이던 로그인 1건"뿐이다
 * (사용자는 다시 누르면 된다). DB 테이블을 만들 이유가 없다.
 *
 * 🔴 코드·토큰 원문을 로그에 남기지 않는다(호출부 포함).
 */
const crypto = require('crypto');

/** 서버가 만드는 코드 모양 — 소문자 hex 64자(32바이트). 이 밖의 입력은 형식 오류(400). */
const APP_AUTH_CODE_RE = /^[0-9a-f]{64}$/;
/** Custom Tab 에만 심는 "이 로그인은 앱에서 시작됐다" 표시 쿠키. */
const APP_LOGIN_COOKIE = 'bjj_app_login';
const APP_LOGIN_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
/** 앱 intent-filter(`mobile/android/app/src/main/AndroidManifest.xml`)와 같은 값. */
const APP_DEEP_LINK_BASE = 'bjjapp://auth/callback';
const APP_AUTH_PROVIDERS = Object.freeze(['google', 'github']);

/**
 * @param {object} [opts]
 * @param {number} [opts.ttlMs=60000]      코드 수명
 * @param {() => number} [opts.now=Date.now] 시계 — 테스트에서 시간을 주입한다
 * @param {number} [opts.maxEntries=500]   상한(발급 폭주 시 메모리 보호) — 넘으면 가장 오래된 것부터 버린다
 */
function createAppAuthCodeStore({ ttlMs = 60 * 1000, now = Date.now, maxEntries = 500 } = {}) {
  /** code → { token, expiresAt } — Map 은 삽입 순서를 지키므로 첫 항목이 가장 오래된 것이다. */
  const codes = new Map();

  function sweep() {
    const t = now();
    for (const [code, entry] of codes) {
      if (entry.expiresAt <= t) codes.delete(code);
    }
  }

  /** 토큰을 맡기고 1회용 코드를 돌려준다. 토큰 검증(서명·만료)은 호출부 책임이다. */
  function issue(token) {
    if (typeof token !== 'string' || token === '') throw new Error('token required');
    sweep();
    while (codes.size >= maxEntries) {
      const oldest = codes.keys().next().value;
      codes.delete(oldest);
    }
    const code = crypto.randomBytes(32).toString('hex');
    codes.set(code, { token, expiresAt: now() + ttlMs });
    return code;
  }

  /**
   * 코드를 꺼낸다. **맞든 틀리든 만료됐든 그 자리에서 지운다**(1회용).
   * @returns {{status:'ok', token:string} | {status:'malformed'|'unknown'|'expired'}}
   */
  function consume(code) {
    if (typeof code !== 'string' || !APP_AUTH_CODE_RE.test(code)) return { status: 'malformed' };
    const entry = codes.get(code);
    codes.delete(code);
    if (!entry) return { status: 'unknown' };
    if (entry.expiresAt <= now()) return { status: 'expired' };
    return { status: 'ok', token: entry.token };
  }

  return { issue, consume, size: () => codes.size, ttlMs };
}

/** `bjjapp://auth/callback?code=…` / `?error=…&msg=…` */
function buildAppDeepLink(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v !== '') qs.set(k, v);
  }
  return `${APP_DEEP_LINK_BASE}?${qs.toString()}`;
}

/** cookie-parser 없이 한 개 값만 읽는다(이 앱에 쿠키는 이것 하나뿐이다). */
function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (typeof header !== 'string' || header === '') return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

const APP_LOGIN_COOKIE_OPTIONS = Object.freeze({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });

function setAppLoginCookie(res, value) {
  res.cookie(APP_LOGIN_COOKIE, value, { ...APP_LOGIN_COOKIE_OPTIONS, maxAge: APP_LOGIN_COOKIE_MAX_AGE_MS });
}

function clearAppLoginCookie(res) {
  res.clearCookie(APP_LOGIN_COOKIE, { ...APP_LOGIN_COOKIE_OPTIONS });
}

/** 프로세스 공용 저장소 — 라우트(auth.js 교환)와 콜백 핸들러(index.js 발급)가 같은 인스턴스를 쓴다. */
const appAuthCodes = createAppAuthCodeStore();

module.exports = {
  APP_AUTH_CODE_RE,
  APP_AUTH_PROVIDERS,
  APP_DEEP_LINK_BASE,
  APP_LOGIN_COOKIE,
  APP_LOGIN_COOKIE_MAX_AGE_MS,
  appAuthCodes,
  buildAppDeepLink,
  clearAppLoginCookie,
  createAppAuthCodeStore,
  readCookie,
  setAppLoginCookie,
};
