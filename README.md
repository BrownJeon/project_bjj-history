# BJJ 훈련 일지

주짓수 훈련 기록을 체계적으로 관리하는 개인 웹앱. 수업·드릴·스파링·기술 트리·게임플랜·참고영상을 한 곳에서 기록하고 AI 코치/분석 기능으로 약점 진단·개선 제안을 받는다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 📅 캘린더 | 수업·드릴·스파링 일자별 기록 |
| 🥋 기술 트리 | 포지션·기술·디테일 카드 관리 + 다중 태깅 |
| 🔗 기술 체인 | 기술 간 전환 흐름 정의 (체인 → 단계) |
| 🎯 게임플랜 | 노드·엣지 기반 의사결정 플로우 설계 |
| 🎬 참고영상 | YouTube/Instagram 클립 라이브러리, 기술별 N:M 태깅 |
| 🤖 AI 보완 | 메모·피드백·스파링 기록을 코치 톤으로 자동 보완 |
| 🧠 AI 분석 | 영상 프레임 비전 + 음성 전사 → 기술/포지션 자동 요약 |
| 📊 코치 메뉴 | 기간 진단 리포트 + 다음 주 훈련 포커스 플랜 자동 생성 |
| 🏅 프로필·벨트 이력 | 벨트 승급 이력 관리 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Node.js + Express |
| 프론트엔드 | 바닐라 JS (SPA, ES Modules) |
| 데이터베이스 | MariaDB / MySQL |
| AI | Claude CLI (`claude --print`, sonnet 모델) |
| 영상 처리 | yt-dlp + ffmpeg + Whisper |
| 프로세스 관리 | pm2 |

---

## 디렉토리 구조

```
bjj-trainning/
├── server.js          # Express 진입점, PORT=3000
├── db.js              # MariaDB pool + 자동 테이블 생성/마이그레이션
├── lib/
│   └── claude-cli.js  # Claude CLI 공통 래퍼 (env 정제 + 직렬화 + 재시도)
├── routes/
│   ├── classes.js     # 수업/드릴/스파링 CRUD
│   ├── techniques.js  # 기술 카드
│   ├── chains.js      # 기술 체인
│   ├── gameplans.js   # 게임플랜 노드/엣지
│   ├── clips.js       # 참고영상 + 기술 태깅
│   ├── profile.js     # 프로필/벨트 이력
│   ├── recommend.js   # AI 기반 기술 추천
│   ├── enhance-memo.js# AI 메모 보완 + 영상 분석
│   └── coach.js       # 코치 진단/리포트/플랜
└── public/
    ├── index.html
    ├── js/
    │   ├── main.js
    │   ├── core/      # api, cache, constants
    │   ├── utils/     # utils, clip-picker
    │   └── pages/     # 페이지별 SPA 모듈
    └── css/
```

---

## 빠른 시작

### 1. 사전 준비
- Node.js 18+
- MariaDB / MySQL
- `claude` CLI (Claude Code Max 구독 또는 ANTHROPIC_API_KEY)
- `yt-dlp`, `ffmpeg`, `whisper` (영상 분석 기능 사용 시)

### 2. 설치
```bash
git clone <repo-url>
cd bjj-trainning
npm install
```

### 3. 환경변수 설정 (.env)
```
DB_HOST=192.168.219.154
DB_USER=bjj_user
DB_PASS=<password>
DB_NAME=bjj
PORT=3000
```

### 4. 실행
```bash
# 개발
node server.js

# 운영 (pm2)
pm2 start server.js --name bjj
pm2 save
```
DB 테이블은 `db.js`의 `setupDB()` 가 서버 시작 시 자동 생성/마이그레이션한다.

---

## DB 스키마 (주요)

| 테이블 | 용도 |
|-------|------|
| `classes` | 수업 단위 |
| `drills` | 수업의 드릴 (기술/디테일/포지션) |
| `spar_days` / `spar_sessions` | 스파링 일자/세션별 상세 |
| `techniques` | 기술 카드 |
| `technique_chains` / `chain_steps` | 체인 본문 + 단계 |
| `gameplans` / `gameplan_nodes` / `gameplan_edges` | 게임플랜 그래프 |
| `video_clips` | 참고영상 |
| `clip_techniques` / `technique_clips` / `drill_clips` / `spar_day_clips` | 영상 N:M 태깅 |
| `profile` / `belt_history` | 프로필·벨트 승급 이력 |
| `coach_reports` | AI 코치 리포트 누적 |

---

## AI 호출 구조

모든 AI 질의는 [`lib/claude-cli.js`](./lib/claude-cli.js) 의 `runClaude(prompt, opts)` 를 경유한다.

핵심 처리:
- `ANTHROPIC_API_KEY` + Claude Code 관련 env 17개를 서브프로세스에서 제거 → `~/.claude` 구독 인증 fallback
- `cwd=/tmp` 로 프로젝트 CLAUDE.md 컨텍스트 격리
- `stdio: ['ignore', ...]` 로 stdin 차단 (pm2 hang 방지)
- 전역 큐로 동시 호출 직렬화
- "Execution error" 자동 감지 + 3회 재시도

옵션:
```js
runClaude(prompt, { tools: 'Read', timeoutMs: 180000 })
```

---

## API 엔드포인트 (요약)

| 메서드 | 경로 | 설명 |
|-------|------|------|
| GET | `/api/classes` | 수업 목록 |
| POST/PUT/DELETE | `/api/classes` | 수업 CRUD |
| GET/POST/PUT/DELETE | `/api/techniques` | 기술 카드 |
| GET/POST/PUT/DELETE | `/api/chains` | 기술 체인 |
| GET/POST/PUT/DELETE | `/api/gameplans` | 게임플랜 |
| GET/POST/PUT/DELETE | `/api/clips` | 참고영상 |
| POST | `/api/enhance-memo/enhance` | 메모/피드백 AI 보완 |
| POST | `/api/enhance-memo/videos` | 관련 영상 검색 쿼리 |
| POST | `/api/enhance-memo/analyze-video` | 영상 URL → 비전+음성 분석 |
| GET | `/api/coach/diagnosis` | 기간 진단 |
| POST | `/api/coach/report` | AI 리포트 |
| POST | `/api/coach/plan` | 다음 주 훈련 포커스 플랜 |
| POST | `/api/coach/chat` | 코치 챗 |
| GET/PUT | `/api/profile` | 프로필/벨트 이력 |

---

## 운영 가이드

### pm2로 자동 시작 등록 (서버 재부팅 후 자동 기동)
```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
pm2 save
```

### 로그 확인
```bash
pm2 logs bjj
pm2 logs bjj --lines 100 --nostream
```

### 재시작
```bash
pm2 restart bjj
```

---

## 코딩 규칙

- 민감 정보(`DB_PASS`, API 키)는 반드시 `.env`에 보관, 절대 하드코딩·커밋 금지
- DB 쿼리는 `db.js`의 pool 사용
- 새로운 AI 호출 추가 시 반드시 `lib/claude-cli.js` 의 `runClaude()` 경유
- API 에러는 try/catch + 적절한 HTTP 상태코드 반환
- 프론트엔드 JS는 ES Modules (`import/export`)

---

## 알려진 이슈

- Claude CLI는 동시 호출 시 "Execution error" 가 빈발 → 직렬화 큐로 회피 중
- VSCode Claude 확장 업데이트 시 바이너리 경로가 바뀜 → 시스템 PATH의 `claude` 사용으로 우회
- Whisper는 CPU에서 FP16 미지원 경고 출력하지만 동작에는 무관
