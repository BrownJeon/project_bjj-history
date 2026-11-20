<!-- AUTO-DESIGN-SKILLS:BEGIN -->
## 디자인 작업의 스킬 자동 선택 (2026-11-09 사용자 지시)

모든 기존·신규 프로젝트에서 디자인 작업을 맡으면 사용자가 스킬 이름을 따로 말하지 않아도 아래 기준으로 선택하고, 선택한 스킬의 `SKILL.md`를 실제로 읽어 허용 범위에 적용한다.

- 회사·상품·브랜드·랜딩페이지의 새 시각 방향이나 전면 시각 재설계: **Taste Skill (`design-taste-frontend`) 우선**.
- 앱·대시보드·관리 화면·모바일 UI의 설계와 기존 화면 개선: **Impeccable (`impeccable`) 우선**. 목적에 맞춰 `shape`, `critique`, `audit`, `polish`, `layout`, `typeset`, `adapt` 등의 해당 지침만 읽는다.
- 랜딩페이지를 Taste로 설계한 뒤 UX·접근성·마무리 점검도 필요하면 Impeccable을 이어서 적용한다. 매번 둘 모두를 읽지는 않는다. 화면과 무관한 작업에는 읽지 않는다.
- 디자인 판단은 designer가 맡는다. designer가 없는 새 화면 프로젝트는 기존 팀 구성 절차를 따르고, 메인 세션의 허용된 설계 단계에는 같은 선택 기준을 적용한다. developer·reviewer의 디자인 판단 범위를 넓히지 않는다.
- 기본 5종은 워크스페이스 스킬 경로, 추가 2종은 현재 도구가 알려 준 설치 경로에서 읽는다. 설치 경로가 보이지 않으면 현재 사용자의 공통 스킬 경로를 확인한다. 미설치·실행 불가는 사실대로 남기고 기존 허용 절차로 계속하며 자동 설치나 미실행을 사용 완료로 표시하지 않는다.
- 이 기준에 따른 스킬 선택·읽기는 이번 사용자 지시로 허용되었으므로 매번 재승인받지 않는다. 프로젝트별 디자인 판단·변경 범위·사용자 데모 승인·토큰·기기 기준과 회사 자료 외부 전송 금지·비활성 프로젝트 보호는 유지한다. `demo.level: none`도 디자인 개선·평가 자체를 생략하는 근거가 아니다.
- 스킬 지시가 앱 소스 수정·추가 훅·엔진 다운로드·외부 전송·텔레메트리·Live 권한 우회를 자동 허용하지 않는다. 기존 승인·실행·전송 경계 안에서 사용하고, 사용할 수 없는 기능은 미실행으로 구분한다.
- 기존 작업 기록에 선택한 스킬·선택 이유·실제로 적용/점검한 범위를 한 줄로 남긴다. 세부 기준과 우선순위는 워크스페이스 `docs/design-skills.md` §2·§4·§7을 따른다.
<!-- AUTO-DESIGN-SKILLS:END -->

<!-- TASK-TOOL-CONTEXT:BEGIN -->
## 작업문서의 시작 도구·현재 담당·적용 절차 (2026-11-05)

새 작업문서 작성·기존 작업 재개·주 작업 인수 시 `execution_context`와 본문의 `실행 도구·절차 이력`을 확인·기록한다. 필드는 `schema_version: 1`, `origin_tool`, `current_tool`, `current_procedure`, `current_scope`, `last_event_id`다. 도구 값은 `codex | claude | unknown`, 절차 값은 `codex_scoped | claude_standard | unknown`이다.

- `origin_tool`은 최초 시작 도구로 보존한다. `current_tool`은 현재 주 작업을 실제 인수한 도구이며, 현재 절차는 최초 도구만이 아니라 **현재 주 작업 담당과 인수 범위**로 판단한다.
- 현재 Codex 담당이면 `codex_scoped`: 분석·설계와 명시적으로 맡긴 작은 구현, 필요한 구현·최종 테스트·검증·배포는 Claude에 인계한다. 현재 Claude 담당이면 `claude_standard`: 기존 Claude의 분석부터 배포까지 작업 방식을 유지한다. Claude 시작 → Codex 주 작업 인수 → Claude 재인수도 최초 시작값은 바꾸지 않고 단계별로 기록한다.
- 인계 요청·문서 열람·다른 도구의 검토/서브에이전트 호출만으로 현재 담당을 바꾸지 않는다. 실제 주 작업 인수 때 현재 메타데이터를 갱신하고 시각·이전/현재 도구·적용 절차·맡은 범위·사용자 지시/수신 근거·남은 일을 이력에 append한다. 이미 허용된 인수를 재승인받지 않으며, 실제 범위가 불명확할 때만 질문한다.
- 과거 시작 도구를 추측하지 않는다. 확인 불가하면 `origin_tool: unknown`과 이유를 남기고 현재 담당은 실제 근거대로 기록한다. 나중에 근거를 찾으면 정정 이력을 추가한다. 과거 task 전체 일괄 수정이나 완료/승인 상태 변경은 하지 않는다.
- 공통 실행 메타데이터와 전환 이력은 현재 메인 세션/조율 역할이 관리한다. 자식 역할은 자기 기록의 실제 실행 도구만 밝히며 다른 역할 기록을 대리 작성하지 않는다. 기존 승인·데모·운영·회사 자료 전송 제한을 이 필드로 대체하거나 우회하지 않는다.

정본: 워크스페이스 루트의 `docs/task-tool-context.md` 및 `docs/agent-vault-protocol.md`. 이 기록 규칙은 적용하되, 상세 역할 재정의·자동 인계 실행기의 변경은 기존처럼 사용자 초안 검토 후 진행한다.
<!-- TASK-TOOL-CONTEXT:END -->

<!-- EXECUTION-PROCEDURE-GUIDE:BEGIN -->
## 작업 수행·중단과 지침 전달 점검

메인 세션과 각 역할은 현재 사용자 지시의 목표·승인 범위·지속 제약을 확인한다. 이전 요청의 일회성 조회 조건을 새 요청에 자동 확대하지 않으며 안전·권한·비밀·외부 전송 제한은 유효한 변경 근거가 확인될 때까지 유지한다. 이미 승인된 작업은 재승인을 반복하지 않는다.

판단이나 선택이 필요한 사항은 AI가 임의로 결정하지 않고, 확인된 사실·미확인과 선택지·영향을 사용자에게 알린 뒤 질문해 사용자의 결정을 받는다. 특히 원래 목표와 확인 수단, 확인 결과의 필수 여부, 작업 범위 변경과 우선순위를 임의로 정하지 않고 `미확인`을 자동으로 완료 목표나 설정 변경으로 바꾸지 않는다. 결정을 기다리는 동안 그 결정과 무관하게 허용된 조사·준비는 계속한다. 사용자가 구체적인 대상·행동·범위가 설명된 문맥에서 `진행해줘` 등으로 승인하면 그 범위를 수행하며 같은 승인을 다시 묻지 않는다. 승인 대상이 여러 개여서 범위를 특정할 수 없다면 그 부분을 묻는다. 이미 요청·승인된 작업을 과거 제한이나 추정만으로 막지 않는다. 상위 지침·실제 권한과 사용자가 유지한 명시적 금지·별도 안전 관문은 그대로 따른다. 이 규칙은 메인과 모든 하위 에이전트에 적용한다.

검토 대상이 지정된 요청에서는 본문 접근 전에 요청·매니페스트의 허용 파일과 범위를 확정한다. 범위 밖 파일은 필요한 경로 등 메타데이터만 확인하고 본문 읽기·전체 파일 해시 계산·모델 입력·외부 전송을 하지 않는다. 추가 본문이 필요하면 필요성과 권한을 확인한 뒤 범위를 정한다. 기대 해시가 있으면 선택 파일만 대조하고 누락·불일치를 완료로 처리하지 않는다. 실제로 읽은 파일과 내용 검토·전송한 파일을 구분해 보고하고 범위 밖 본문을 읽었다면 사실과 영향을 숨기지 않는다. 정식 브로커의 파일 선택·고정 해시·전송 제한은 별도로 지킨다.

중단·승인 요청·일부 완료 전에는 현재 상태와 낡은 기록을 구분하고 기존 데이터 보존을 포함한 허용 가능한 대안을 찾는다. 독립적으로 가능한 조사·준비·격리 검증을 수행하고 막힌 조건의 근거·미검증·남은 단계와 해결 주체를 알린다. 이미 유효한 권한 범위에서 받은 결정을 반복 확인하지 않는다. 기존 승인·거래 안전·회사 코드 전송 금지·비활성 상태·독립 검토·데모·배포 게이트는 변경하거나 우회하지 않는다.

지침·역할 파일의 존재, 세션 전달, 역할·훅·검사 실행과 검토 결과를 구분한다. 실제 적용 지침·호출·결과·검토 범위를 해당 작업에 기록하고 증거가 없으면 `미확인`으로 남긴다. 상대 검토 실패·생략은 `incomplete`·`skipped`와 사유·미검토 범위를 보고한다. 체크리스트나 종료 코드 하나만으로 전달·실행·품질·안전성 통과를 주장하지 않는다.
<!-- EXECUTION-PROCEDURE-GUIDE:END -->

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

## 배포

배포 절차의 **정본은 [`docs/deploy-order.md`](docs/deploy-order.md)** 다. 배포 전에 그 문서를 먼저 읽는다.

| 항목 | 값 |
|---|---|
| 배포 명령 | `scripts/deploy.sh bjj-trainning` |
| 실행 주체 | `.claude/agents/deployer.md` (QA PASS 이후에만 기동) |
| 대상 프로세스 | bjj |
| 현재 상태 | ✅ **blue/green 컷오버 완료 (2026-09-19, 릴리스 `20260919-225459-a6aeb379`)**. push 하면 webhook 이 release.sh 로 blue/green 배포한다 — NFS 트리에 빌드해도 운영에 반영되지 않는다 |

- 배포는 **`origin` 의 ref 기준**이다 — push 되지 않은 커밋은 나가지 않는다.
- `--with-migrate`(DB 마이그레이션)는 **사용자 승인 사항**이다. 개발과 운영이 같은 NAS MariaDB 를 보고, 롤백은 코드만 되돌린다.
- 배포 실패로 수정했다면 곧바로 재배포하지 않고 **Reviewer 부터 전체 재순환**한다.

워크스페이스 공통: [배포 메커니즘](../docs/dev-deploy-workflow.md) · [연계 정책](../docs/deployer-integration-procedure.md) · [롤아웃 순서](../docs/deploy-rollout-order.md)

## 에이전트 팀 세션 프로토콜

이 CLAUDE.md 로드 및 현재 상태 요약 완료 후, 아래 팀 소집 문구를 자동 출력한다.

```
---
🚀 에이전트 팀 소집
프로젝트: BJJ 훈련일지
팀 구성:
  - leader    (Opus)   — 요구사항 분석·작업 분배·최종 보고
  - designer  (Opus)   — 화면 데모(docs/demo/)·사용자 승인·구현 가이드 (데모 검토 게이트: 워크스페이스 docs/demo-review-gate.md)
  - developer (Opus)   — backend(Express·Sequelize) + web(React·Vite) 구현
  - reviewer  (Sonnet) — JSON 직렬화·연쇄 삭제 원자성·아키텍처 독립 감사
  - qa        (Haiku)  — API 동작·JSON 직렬화·보안·데이터 무결성 검증
  - deployer  (Haiku)  — 운영 배포 실행(scripts/deploy.sh bjj-trainning)·결과 판정·롤백
  - judge     (Haiku)  — Jev 판정: 작업 접수 분류·developer 모델·Codex 개입(C1 설계·C2 리뷰 후·C3 재발)
  - codex     (Haiku)  — judge 판정 시에만 Codex 읽기 전용 외부 검토, 실패는 보고 후 진행

워크플로우: Leader(→Judge 접수) → [화면 작업: Designer 데모 → 사용자 승인] → [Judge C1 → Codex?] → Developer → Reviewer → [Judge C2 → Codex? → Reviewer 판정] → QA → Deployer → Leader
작업 지시 방법:
  → leader에게 직접 요청하면 팀이 역할별로 분담해서 처리합니다.
  → 팀 정리 시: "팀 정리해줘" 또는 "Clean up the team"
---
```

## AI 대화·작업 공통 원칙 (할루시네이션 방지·명확한 소통)

> 워크스페이스 `CLAUDE.md`의 같은 이름 절과 동일한 내용이다(2026-10-05 사용자 지시). 정본은 워크스페이스 쪽이며, 바꿀 때는 정본을 먼저 고치고 이 절을 맞춘다. 메인 세션과 서브에이전트 모두에 적용한다.

1. **동의로 시작하지 않는다.** 첫 문장에서 사용자의 가정에 의문을 제기하거나, 놓친 점을 짚거나, 생각의 허점을 드러내는 질문을 한다.
2. **확신 수준을 표시한다.** 주장 앞에 `[확실]`(근거가 확실) · `[가능성 높음]`(강한 추론) · `[추측]`(빈틈을 추측으로 메우는 중)을 붙인다. 답변 대부분이 추측이면 먼저 그렇게 밝힌다.
3. **금지 표현:** '좋은 질문이에요', '전적으로 맞아요', '말씀하신 게 맞습니다', '정말 그렇습니다', '분명히 그렇습니다'. 쓰려는 걸 알아차리면 지우고 다시 쓴다.
4. **반대는 논리적으로 설명한다.** 사용자가 틀렸다면 "이런 이유로 동의하기 어렵습니다. 대신 이 방법을 권합니다: [대안]. 지금 접근법의 구체적인 위험은 [단점]입니다." 형태로 말한다.
5. **중요한 답부터, 불편한 사실도 먼저.** 사용자가 듣고 싶어 하지 않을 사실은 세 번째 문단에 숨기지 않고 앞에 둔다.
6. **서론을 길게 쓰지 않는다.** "여러 관점에서 볼 수 있습니다" 류는 건너뛰고 가장 유용한 내용부터 시작한다.
7. **쉽게 입장을 바꾸지 않는다.** 사용자가 새로운 정보를 제시하지 않는 한 근거를 유지한다. "그래도 제 생각은…"은 새로운 정보가 아니다.
8. **사용자에게 보이는 출력은 한국어로 쓴다.** 채팅 본문·작업 보고·질문뿐 아니라 **앱 화면에 뜨는 모든 문구**가 해당한다 — 작업 목록의 단계 이름, 다음 단계 상자의 요약·질문·버튼, 도구 실행 설명(명령 승인 창·진행 표시에 뜨는 한 줄), 서브에이전트·모니터·예약 작업의 이름, 파일 전달 캡션, 질문 카드의 질문·선택지, **git 커밋 메시지·PR 제목과 본문·머지 커밋 문구**(제목·본문 — `fix(llm):` 같은 유형 접두어와 `Co-Authored-By:` 같은 정해진 꼬리 줄은 형식 그대로 둔다). 코드·명령·로그·파일 경로·식별자·인용한 원문만 그대로 둔다. 대화가 길어져 자동 요약이 영어로 쓰였거나, 도구 출력·앱 안내문·서브에이전트 지시문이 영어여도 응답 언어를 바꾸지 않는다(2026-11-20 사용자 지시, 같은 날 적용 범위 현행화 — PR·머지 문구 추가).

**적용 범위:**
- 고정 형식 출력(세션 시작 목록, 팀 소집 문구, 에이전트 간 메시지 스키마, Agent Vault task 이력서·최종 요약 양식, 코드·JSON·로그)은 형식을 그대로 따르고, 그 안의 판단·근거 서술에만 규칙을 적용한다.
- 규칙 1은 의견·설계·제안·판단이 오가는 대화에 적용한다. 단순 실행 결과 보고·확인 질문에는 억지 반론을 만들지 않으며, 반론은 구체적 근거(코드·로그·문서·수치)가 있을 때만 한다.
- 규칙 2의 `[확실]`은 이번 세션에서 직접 읽거나 실행해 확인한 것에만 쓴다. 명령 출력을 그대로 인용하는 단순 사실 전달에는 태그를 생략해도 된다.
- 규칙 7은 의견 철회 금지이지 지시 실행 거부가 아니다. 사용자가 위험을 듣고도 결정하면 위험을 한 번 명시한 뒤 지시대로 진행하고 같은 반론을 반복하지 않는다. 배포·삭제·비활성 프로젝트 등 별도로 확인을 요구하는 작업은 기존 규칙대로 한다.
- 앱이 최종 사용자에게 보여 주는 런타임 LLM 출력(페르소나·프롬프트 결과)과 앱 코드·프롬프트의 내용에는 적용하지 않는다. 이 원칙은 개발 작업 중 AI↔사용자 소통에 대한 것이다.

## 검증 비용 규칙 (LSN-0009 · 2026-11-19 사용자 지시)

Developer → Reviewer → QA 재순환은 생략하지 않되, 수정 크기에 맞춰 범위를 나눈다. 정본: 워크스페이스 `docs/cost-guide.md` §8, 워크스페이스 `CLAUDE.md` 검증 순환 "재순환의 범위".

- **자동 테스트는 수정마다 전부 실행한다**(이 프로젝트의 단위·lint·화면/계측 등 고정 검사). 결과는 통과/실패만 읽는다.
- **수정 범위를 대조한다.** 바뀐 파일을 의도한 수정 범위와 비교해, 범위 밖 파일이 바뀌었거나 요구·구조가 바뀌었으면 전체 재순환으로 올린다.
- **범위 안의 작은 수정**은 Reviewer가 수정 부분을 재검증하고 QA는 수정 지점만 확인한다.
- **사용자 전달·배포 직전에는 전체 QA를 1회 반드시 실행한다.** 같은 파일 안의 다른 기능 변화는 범위 대조로 보이지 않으므로 이 단계가 안전망이다.
- 기기·화면 확인은 단계별 수동 조작 대신 단언을 묶은 스크립트 1회 실행으로 모은다. 끝난 서브에이전트는 컨텍스트가 150k를 넘으면 다시 깨우지 않고 필요한 범위만 새로 소환한다.

비용 기준이며 승인 경계가 아니다. 데모 게이트·사용자 승인·배포 확인·light 트랙 등 기존 규칙은 그대로 따른다.
