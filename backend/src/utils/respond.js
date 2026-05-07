// 표준 응답 형식 헬퍼
function ok(res, data = null, message = '') {
  return res.json({ success: true, data, message });
}

function fail(res, status, message, data = null) {
  return res.status(status).json({ success: false, message, data });
}

// 비동기 라우트 핸들러 try/catch 자동 처리
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// JSON 문자열 안전 파싱
function safeParse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

module.exports = { ok, fail, wrap, safeParse };
