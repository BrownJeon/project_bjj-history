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
# 🔴 index.html 은 web/src 밖이라 위 rsync 에 안 딸려온다 — 고쳤다면 반드시 같이 복사할 것.
#    빠뜨리면 소스만 바뀌고 서빙되는 dist/index.html 은 옛 내용 그대로다(2026-09-09 D-8).
cp /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/web/index.html \
   /home/brownjeon/.node-local/bjj-web/work/index.html
# 🔴 web/public(아이콘·favicon·og-image·manifest)도 src 밖이다 — 같이 옮기지 않으면 dist 에 새 아이콘이 안 들어간다(task-038).
rsync -av /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/web/public/ \
      /home/brownjeon/.node-local/bjj-web/work/public/ --quiet
cd /home/brownjeon/.node-local/bjj-web/work
npm run build
rsync -av dist/ /home/brownjeon/.node-local/bjj-web/dist/ --delete --quiet
pm2 restart bjj
```

> NFS에는 dist를 복사하지 않음. `web/dist/`는 더 이상 사용하지 않음.
> `index.html`(정적 파일)만 바꿨다면 `pm2 restart bjj` 는 필요 없다 — backend 가 요청마다 읽는다.
> 앱 아이콘·favicon·og-image 는 `web/scripts/gen-app-icons.mjs` 가 만든다(도안 상수가 단일 진실). 산출물을 손대지 말고
> `node web/scripts/gen-app-icons.mjs` 로 다시 뽑은 뒤 위 빌드를 돌린다. 안드로이드 res 는 `--android <res 경로>`.

### Dev 서버 (선택)

```bash
cd /home/brownjeon/.node-local/bjj-web/work
npm run dev   # http://localhost:5174 (proxy → :3000)
```

## 모바일 앱 (Android APK)

Capacitor 7 **원격 URL 로딩** 껍데기 앱(`com.miraclepenguin.bjj`, `BJJ 훈련일지`) — WebView 가 운영 사이트를 불러온다. 디버그 서명 사이드로드.

- 소스 `mobile/`(`capacitor.config.ts`·`app-shell/`·`android/`·`scripts/`) — 편집은 NFS, 실행은 ext4 미러 `~/.node-local/bjj-mobile/`(NFS noexec).
- 웹 연동 코드: `web/src/native/*`(`window.Capacitor` 전역만, `@capacitor/*` import 금지)·`web/src/utils/download.js`. 앱 로그인 백엔드: `backend/src/routes/appOAuthCallback.js`·`services/appAuthCodes.js`·`routes/auth.js`(app-start·app-exchange).

```bash
bash /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/mobile/scripts/build-apk.sh
# → ~/.node-local/bjj-mobile/android/app/build/outputs/apk/debug/app-debug.apk (로그 ~/.node-local/bjj-mobile/logs/)
```

- **업데이트 규칙**: 화면·기능(웹)·백엔드 변경 = 위 웹 빌드만, **재설치 불필요**. 아이콘·권한·플러그인·`capacitor.config`·테마·`MainActivity`·`AndroidManifest` 변경 = **APK 재빌드 후 덮어쓰기 설치** — 🔴 착수 전에 사용자에게 재설치 필요를 먼저 알린다.
- 🔴 디버그 키 `~/.android/debug.keystore` 를 잃으면 덮어쓰기 설치 불가 — 백업 유지.
- 검사 명령·로그인 흐름·저장·edge-to-edge/키보드 함정: `agent-vault/30-Knowledge/runbooks/android-apk-build.md`

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
- **아이콘 생성기의 sharp 는 TheMeal 것을 빌린다**: `web/scripts/gen-app-icons.mjs` 가 `~/.node-local/themeal` 의 sharp 를 `createRequire` 로 로드 — TheMeal 의 `.node-local` 을 정리·업그레이드하면 이 생성기가 같이 깨진다(프로젝트 package.json 에는 sharp 없음)
- **Android XML 주석에 `--`(하이픈 두 개) 금지**: 주석 안 `--bg` 하나로 `mergeDebugResources` 빌드가 실패했다(2026-09-14)

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
