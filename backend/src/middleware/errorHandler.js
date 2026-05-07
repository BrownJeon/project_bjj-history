// 전역 에러 핸들러 — 표준 응답 형식
function notFound(req, res) {
  res.status(404).json({ success: false, message: `Not Found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, _next) {
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
}

module.exports = { notFound, errorHandler };
