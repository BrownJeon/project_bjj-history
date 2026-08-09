const jwt = require('jsonwebtoken');
const { fail } = require('../utils/respond');

const JWT_SECRET = process.env.JWT_SECRET || 'bjj-dev-secret-change-in-prod';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return fail(res, 401, '인증이 필요합니다');
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.userId, email: decoded.email };
    next();
  } catch {
    return fail(res, 401, '유효하지 않은 토큰입니다');
  }
}

module.exports = authMiddleware;
