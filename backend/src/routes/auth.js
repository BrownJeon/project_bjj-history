const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Op }  = require('sequelize');
const User    = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { ok, fail, wrap } = require('../utils/respond');
const { createOAuthRouter } = require('@workspace/auth-oauth/adapters/express');

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
