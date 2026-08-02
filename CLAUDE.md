# BJJ 훈련 일지 프로젝트

**주짓수 훈련 기록을 체계적으로 관리하는 개인 웹앱** (TheRoute 동일 스택으로 리팩토링)

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Node.js + Express 4 + **Sequelize 6** (MariaDB) |
| 프론트엔드 | **React 18 + Vite 5 + react-router-dom v6** |
| HTTP | axios + 응답 인터셉터 |
| 상태 관리 | Context API (UIContext / CacheContext) |
| AI | Claude CLI (`claude --print`) — `~/.claude` 구독 인증 |
| 영상 | yt-dlp + ffmpeg + Whisper |
| 프로세스 | pm2 (`bjj` 단일, 포트 3000 — backend가 `/api/*` + SPA 정적 서빙) |

## 디렉토리 구조 (리팩토링 후)

```
bjj-trainning/
├── backend/                      # 신규 백엔드 (포트 3001)
│   ├── package.json
│   ├── .env
│   └── src/
│       ├── index.js              # 진입점
│       ├── config/db.js          # Sequelize 인스턴스
│       ├── models/               # 14개 Sequelize 모델
│       ├── routes/               # 8개 도메인 라우터
│       ├── services/             # claudeCli, videoAnalysis, thumbnailExtractor, coachAnalytics
│       ├── middleware/           # errorHandler
│       └── utils/respond.js      # {success,data,message} 헬퍼
├── web/                          # 신규 프론트 (Vite + React)
│   ├── package.json
│   ├── vite.config.js            # /api → :3001 프록시
│   ├── index.html
│   └── src/
│       ├── main.jsx              # 라우터 + Provider 진입
│       ├── api/                  # axios 모듈 (clips, techniques, classes, ...)
│       ├── components/Layout.jsx # 하단 5탭 네비
│       ├── contexts/             # UIContext, CacheContext
│       ├── pages/                # 8개 페이지 (Calendar, Techniques, Chains, Gameplan, Clips, Coach, Profile, NotFound)
│       └── styles/               # tokens.css + app.css
├── legacy/                       # 구버전 보존 (server.js, db.js, routes/, lib/, public/)
└── ecosystem.config.js           # pm2 (`bjj` 단일 프로세스, 포트 3000)
```

## 빠른 시작

운영은 **단일 프로세스** (`bjj`) — backend가 `/api/*` + `web/dist` SPA 동시 서빙, 포트 3000.

```bash
pm2 restart bjj                # 재시작
pm2 logs bjj                   # 로그
```

### 프론트 빌드 (NFS noexec 우회 + dist 로컬 저장)

**중요**: `web/node_modules`는 NFS 위에 두면 안 됨. 빌드는 ext4 작업 디렉토리에서 진행.
**dist는 로컬 ext4에 저장** (`/home/brownjeon/.node-local/bjj-web/dist`) — NFS 장애와 무관하게 서비스 유지.
backend `.env`의 `DIST_PATH=/home/brownjeon/.node-local/bjj-web/dist` 로 서빙 경로 고정.

```bash
# 코드 변경 후 빌드 (NFS → ext4 src 동기화 → 빌드 → 로컬 dist 반영 → 재시작)
rsync -av /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/web/src/ \
      /home/brownjeon/.node-local/bjj-web/work/src/ --quiet
cd /home/brownjeon/.node-local/bjj-web/work
npm run build
rsync -av dist/ /home/brownjeon/.node-local/bjj-web/dist/ --delete --quiet
pm2 restart bjj
```

> NFS에는 dist를 복사하지 않음. `web/dist/`는 더 이상 사용하지 않음.

### Dev 서버 (선택)

```bash
cd /home/brownjeon/.node-local/bjj-web/work
npm run dev   # http://localhost:5174 (proxy → :3000)
```

## DB 매핑 (Sequelize)

| 테이블 | 모델 |
|--------|------|
| classes / drills / spar_days / spar_sessions | Class / Drill / SparDay / SparSession |
| techniques / technique_chains / chain_steps | Technique / TechniqueChain / ChainStep |
| gameplans / gameplan_nodes / gameplan_edges | Gameplan / GameplanNode / GameplanEdge |
| video_clips / profile / belt_history / coach_reports | VideoClip / Profile / BeltHistory / CoachReport |

- 모든 모델은 `backend/src/models/` 에 정의, `models/index.js` 에서 관계 등록
- 기존 테이블 그대로 매핑 (`tableName` 명시), 데이터 무손실

## 응답 형식 표준 (신버전)

```json
{ "success": true,  "data": <result>, "message": "" }
{ "success": false, "message": "error..." }
```
- 프론트 `web/src/api/client.js` 의 axios 인터셉터에서 자동 언래핑
- 기존 라우트와 호환 위해 `data` 가 없는 응답도 처리

## AI 호출

모든 AI 질의는 `backend/src/services/claudeCli.js` 의 `runClaude(prompt, opts)` 경유.
StockInvest와 동일한 17개 env 정제(`ANTHROPIC_API_KEY` 포함) → `~/.claude` 구독 fallback. 직렬화 큐 + 3회 재시도 + "Execution error" 자동 감지.

## 알려진 인프라 이슈

- **NFS noexec**: NFS 위에서는 vite/rollup/esbuild 네이티브 바이너리 실행 불가. **빌드는 항상 ext4 작업 디렉토리에서 한 뒤 `dist`만 NFS로 복사** (위 "프론트 빌드" 섹션 참조)
- 작업 디렉토리: `/home/brownjeon/.node-local/bjj-web/work` (ext4)
- NFS 위 `web/node_modules`는 두지 않음 (혼란 방지)

## 코딩 규칙

- 민감 정보는 `.env` (절대 하드코딩 금지)
- DB 쿼리는 Sequelize 모델 사용 (raw query는 `sequelize.query()` 만)
- API 에러는 미들웨어 자동 처리 (`wrap(handler)` 헬퍼)
- 프론트 페이지는 함수형 컴포넌트 + hooks
- 새 AI 호출은 반드시 `services/claudeCli.js` 경유

## 현재 상태 / 다음 작업

리팩토링 Phase 0~5 + 후속 보완 모두 완료 (2026-05-08).
- 단일 `bjj` pm2 프로세스 (:3000) — backend가 SPA + API 동시 서빙
- 8개 페이지 React 마이그레이션 완료 (Calendar/Techniques/Chains/Gameplan/Clips/Coach/Profile + Class·Spar·Gameplan 풀 편집기)
- AI 보완 / 영상 분석 / 코칭 분석 모두 React UI에서 호출 가능
- 구버전은 `legacy/`에 보존 (필요 시 git history에서 복원, 추후 삭제 결정)

자세한 진행은 memory `project_bjj.md` 참조.

## 에이전트 팀 세션 프로토콜

이 CLAUDE.md 로드 및 현재 상태 요약 완료 후, 아래 팀 소집 문구를 자동 출력한다.

```
---
🚀 에이전트 팀 소집
프로젝트: BJJ 훈련일지
팀 구성:
  - leader    (Opus)   — 요구사항 분석·작업 분배·최종 보고
  - developer (Opus)   — backend(Express·Sequelize) + web(React·Vite) 구현
  - reviewer  (Sonnet) — JSON 직렬화·연쇄 삭제 원자성·아키텍처 독립 감사
  - qa        (Haiku)  — API 동작·JSON 직렬화·보안·데이터 무결성 검증

워크플로우: Leader → Developer → Reviewer → QA → Leader
작업 지시 방법:
  → leader에게 직접 요청하면 팀이 역할별로 분담해서 처리합니다.
  → 팀 정리 시: "팀 정리해줘" 또는 "Clean up the team"
---
```
