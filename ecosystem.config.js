// pm2 운영 설정 — 신버전 단일화 완료 (Phase 5)
// 신버전 backend는 web/dist 정적 SPA + /api/* 동시 서빙 (포트 3000)
module.exports = {
  apps: [
    {
      name: 'bjj',
      script: './backend/src/index.js',
      cwd: __dirname,
      env: {
        PORT: 3000,
        // 🔴 PATH 를 여기서 고정한다. 지정하지 않으면 pm2 는 **재시작한 셸의 PATH** 를 물려받는다.
        //    yt-dlp 는 ~/.local/bin 에 있는데(pip --user 설치), 그 경로가 없는 환경에서
        //    `pm2 restart bjj` 한 번만 나도 영상분석이 "yt-dlp 명령이 설치되어 있지 않습니다"로
        //    죽는다 — 코드가 execFile('yt-dlp') 로 PATH 에 의존하기 때문이다(services/ytdlp.js:74).
        //    2026-09-07 task-020~028 검증 중 재시작이 122회 반복되며 실제로 이 회귀가 발생했다.
        PATH: `/home/brownjeon/.local/bin:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
      },
      max_memory_restart: '500M',
    },
  ],
};
