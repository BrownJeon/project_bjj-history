const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Op }  = require('sequelize');
const User    = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { ok, fail, wrap } = require('../utils/respond');
const { createOAuthRouter } = require('@workspace/auth-oauth/adapters/express');
const { APP_AUTH_PROVIDERS, appAuthCodes, setAppLoginCookie } = require('../services/appAuthCodes');

const JWT_SECRET  = process.env.JWT_SECRET  || 'bjj-dev-secret-change-in-prod';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';

// ─── 이메일/비밀번호 인증 ─────────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) return fail(res, 400, '이메일과 비밀번호를 입력해주세요');
  if (password.length < 6)         return fail(res, 400, '비밀번호는 6자 이상이어야 합니다');
  const norm = email.toLowerCase().trim();
  const exists = await User.findOne({ where: { email: norm } });
  if (exists) return fail(res, 409, '이미 가입된 이메일입니다');
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ email: norm, password: hash });
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return ok(res, { token, user: { id: user.id, email: user.email } });
}));

// POST /api/auth/login
router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) return fail(res, 400, '이메일과 비밀번호를 입력해주세요');
  const norm = email.toLowerCase().trim();
  const user = await User.findOne({ where: { email: norm } });
  if (!user) return fail(res, 401, '이메일 또는 비밀번호가 올바르지 않습니다');
  if (!user.password) return fail(res, 401, 'OAuth로 가입된 계정입니다. Google 또는 GitHub으로 로그인해주세요');
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return fail(res, 401, '이메일 또는 비밀번호가 올바르지 않습니다');
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return ok(res, { token, user: { id: user.id, email: user.email } });
}));

// GET /api/auth/me
router.get('/me', authMiddleware, wrap(async (req, res) => {
  const user = await User.findByPk(req.user.id, { attributes: ['id', 'email', 'name', 'avatar', 'oauth_provider'] });
  return ok(res, user);
}));

// ─── OAuth ───────────────────────────────────────────────────────────────────

async function findOrCreateUser({ provider, providerId, email, name, avatar }) {
  const norm = email.toLowerCase().trim();

  // 1. OAuth 계정으로 기존 사용자 찾기
  let user = await User.findOne({ where: { oauth_provider: provider, oauth_id: providerId } });
  if (user) return user;

  // 2. 같은 이메일로 가입된 계정이 있으면 OAuth 연결
  user = await User.findOne({ where: { email: norm } });
  if (user) {
    if (!user.oauth_provider) {
      await user.update({ oauth_provider: provider, oauth_id: providerId, name: name || user.name, avatar: avatar || user.avatar });
    }
    return user;
  }

  // 3. 신규 생성 (password NULL — OAuth 전용)
  return User.create({ email: norm, name, avatar, oauth_provider: provider, oauth_id: providerId });
}

const OAUTH_ENABLED = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
    : {}),
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? { github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } }
    : {}),
};

// ─── 앱(Android APK) 로그인 — task-039 A-4 ───────────────────────────────────
// 🔴 공유 OAuth 라우터(`router.use('/', oauthRouter)`)보다 **앞**에 둔다. 뒤에 두면
//    `GET /app-start` 가 공유 라우터의 `GET /:provider` 에 먼저 잡혀 "Unknown OAuth provider" 404 가 된다.
// 🔴 공유 패키지(@workspace/auth-oauth, 5개 프로젝트 공용)는 수정하지 않는다 — bjj 전용 라우트로만 붙인다.
// 흐름 전체 설명: routes/appOAuthCallback.js 머리말.

// GET /api/auth/app-start?provider=google|github[&fallback=1]
// 앱이 Custom Tab 으로 여는 주소. "이 로그인은 앱에서 시작됐다"는 표시 쿠키를 Custom Tab 에 심고
// 기존 OAuth 시작점으로 넘긴다. 쿠키는 HttpOnly(JS 에서 못 읽음)·Secure·SameSite=Lax(구글에서 돌아오는
// 최상위 GET 네비게이션에는 실린다)·10분.
router.get('/app-start', (req, res) => {
  const provider = typeof req.query.provider === 'string' ? req.query.provider : '';
  if (!APP_AUTH_PROVIDERS.includes(provider)) {
    return fail(res, 400, '지원하지 않는 로그인 방식입니다');
  }
  setAppLoginCookie(res, req.query.fallback === '1' ? 'fallback' : '1');
  res.set('Cache-Control', 'no-store');
  return res.redirect(302, `/api/auth/${provider}`);
});

// POST /api/auth/app-exchange  { code }  →  { token }
// 딥링크로 받은 60초 1회용 코드를 JWT 로 바꾼다. 코드는 **맞든 틀리든 한 번 보면 지운다**.
// 🔴 코드·토큰 원문을 로그에 남기지 않는다.
router.post('/app-exchange', (req, res) => {
  const code = req.body && req.body.code;
  const result = appAuthCodes.consume(code);
  if (result.status === 'malformed') {
    return fail(res, 400, '로그인 코드 형식이 올바르지 않습니다');
  }
  if (result.status !== 'ok') {
    console.warn(`[app-auth] 코드 교환 실패 (${result.status})`);
    return fail(res, 401, '로그인 코드가 만료되었거나 이미 사용되었습니다. 다시 로그인해 주세요');
  }
  res.set('Cache-Control', 'no-store');
  return ok(res, { token: result.token });
});

// 항상 mount — credentials 미설정 시 /:provider 에서 503 반환
const oauthRouter = createOAuthRouter({
  providers:        OAUTH_ENABLED,
  jwtSecret:        JWT_SECRET,
  jwtExpires:       JWT_EXPIRES,
  callbackBaseUrl:  process.env.OAUTH_CALLBACK_BASE || 'http://localhost:3000',
  frontendUrl:      process.env.OAUTH_CALLBACK_BASE || 'http://localhost:3000',
  findOrCreateUser,
});
router.use('/', oauthRouter);

if (Object.keys(OAUTH_ENABLED).length > 0) {
  console.log(`[auth] OAuth 활성화: ${Object.keys(OAUTH_ENABLED).join(', ')}`);
} else {
  console.log('[auth] OAuth 비활성화 (GOOGLE_CLIENT_ID / GITHUB_CLIENT_ID 미설정)');
}

module.exports = router;
