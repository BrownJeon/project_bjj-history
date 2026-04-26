# BJJ 훈련 일지 프로젝트

**주짓수 훈련 기록을 체계적으로 관리하는 개인 웹앱**

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Node.js + Express |
| 프론트엔드 | 바닐라 JS (SPA) |
| 데이터베이스 | MySQL (192.168.219.154) |

## 빠른 시작

```bash
cd /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning
node server.js   # PORT=3000
```

- DB: `192.168.219.154`, DB명 `bjj`, 사용자 `bjj_user` (패스워드는 .env)
- .env 없으면 .env.example 참고해서 생성 필요

## 디렉토리 구조

```
bjj-trainning/
├── server.js          # Express 앱 진입점 + PORT=3000
├── db.js              # MySQL pool, setupDB(자동 테이블 생성), fmtDate, safeParse
├── routes/            # classes, techniques, chains, gameplans, clips, recommend, profile
└── public/            # 프론트엔드 (SPA)
    ├── index.html
    ├── js/
    │   ├── pages/     # analysis, calendar, chains, class-modal, clips, gameplan, navigation, profile, techniques
    │   ├── core/      # api.js, cache.js, constants.js
    │   ├── utils/utils.js
    │   └── main.js
    └── css/           # analysis, base, belt, calendar, clips, components, gameplan, techniques
```

## DB 테이블 목록

`classes`, `drills`, `spar_days`, `profile`, `belt_history`, `gameplans`, `gameplan_nodes`, `gameplan_edges`, `techniques`, `video_clips`

- 테이블은 `db.js`의 `setupDB()`가 서버 시작 시 자동 생성/마이그레이션

## 코딩 규칙

- 민감 정보는 반드시 `.env`로 관리 (절대 하드코딩 금지)
- DB 쿼리는 `db.js`의 pool 사용
- API 에러는 try/catch + 적절한 HTTP 상태코드 반환

**현재 상태 및 다음 작업은 memory `project_bjj.md` 참조**
