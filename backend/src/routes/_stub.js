// Phase 1 stub — Phase 2에서 각 라우트 파일이 이 모듈을 대체함
const express = require('express');

function stub(name) {
  const router = express.Router();
  router.all('*', (req, res) => {
    res.status(501).json({
      success: false,
      message: `[${name}] not implemented yet (Phase 2 마이그레이션 대기)`,
      path: req.originalUrl,
    });
  });
  return router;
}

module.exports = stub;
