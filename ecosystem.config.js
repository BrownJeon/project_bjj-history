// pm2 운영 설정 — 신버전 단일화 완료 (Phase 5)
// 신버전 backend는 web/dist 정적 SPA + /api/* 동시 서빙 (포트 3000)
module.exports = {
  apps: [
    {
      name: 'bjj',
      script: './backend/src/index.js',
      cwd: __dirname,
      env: { PORT: 3000 },
      max_memory_restart: '500M',
    },
  ],
};
