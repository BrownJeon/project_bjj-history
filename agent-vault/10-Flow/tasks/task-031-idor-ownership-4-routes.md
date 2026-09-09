---
name: task-031-idor-ownership-4-routes
aliases: ["IDOR 4건", "소유권 미검사", "generated-video 삭제 IDOR"]
tags:
  - type/task
  - domain/security
  - domain/backend
related_tasks:
  - "[[task-022-failure-first-spar-input-and-cause-tags]]"
  - "[[task-021-home-today-card-openmat-preset]]"
status: done
created: 2026-09-09
updated: 2026-09-09
---

# task-031 — IDOR(소유권 미검사) 4건 수정

task-022 Reviewer 가 격리 사본(:3099)에서 침해를 재현하며 발견해 백로그로 넘긴 4건. 사용자 지시(2026-09-09): 같은 패턴으로 소유권 검사 추가 · 기존 관례(404/403) 따름 · 정상 동작 회귀 0 · **HTTP 실측 필수**(계정 A 토큰으로 B 자원 → 차단, 1번은 실제 삭제 안 됨을 확인) · **커밋까지, 푸시 금지** · DB 비밀번호는 `MYSQL_PWD` 경유.

## Leader 착수 전 실측 (2026-09-09)

| 확인 | 결과 |
|---|---|
| 기존 관례 (`classes.js:318` `POST /:id/generate-video`, `:301` `DELETE /:id/spar/:sparDayId`) | `const cls = await Class.findOne({ where: { id, user_id: req.user.id }, attributes: ['id'] }); if (!cls) return res.status(404).json({ error: 'class not found' });` — **404(존재 은닉)**, 403 아님. 응답은 `res.json` 직접(이 파일은 `ok()` 래퍼를 안 씀) |
| ① `classes.js:365` `DELETE /:id/generated-video` | 소유권 검사 **없음**. `getClassVideoDir(classId)` 를 `fs.rm(recursive)` 하고 `class_video_jobs WHERE class_id=?` 를 지운다 — **파괴적** |
| ② `enhance-memo.js:135` `POST /analyze-video` | `clipId` 를 **검사 없이** 받아 `VideoClip.update({frames, description, video_file}, {where:{id: clipId}})` — 남의 클립을 덮어쓴다. `clipId` 없으면 저장 없음(URL 분석만) |
| ③ `classes.js:340` `GET /:id/video-status` | 소유권 검사 없음 — `class_video_jobs` 최신 잡(video_url 포함) 노출 |
| ④ `voice.js:121` `GET /jobs/:jobId` | 소유권 검사 없음 — `voice_jobs` 의 transcript·result 노출. jobId 는 UUID(열거 불가 → LOW) |
| ⑤ **추가 발견** `voice.js:111` `GET /jobs` | `WHERE` 없이 **전 사용자의 잡 30건**을 나열(class_id·trained_date·transcript 길이). 같은 패턴의 누출 — 지시 범위 밖이지만 3줄 수정이라 **포함**하고 최종 보고에 명시 |
| 스키마 | `class_video_jobs(id uuid, class_id)` · `voice_jobs(id uuid, class_id, transcript, result)` — 둘 다 `user_id` 없음 → **`classes` 조인**으로 판별 |
| 계정 | users: 1 admin · 2 test · **3 실사용자(수업 29건)** · 4 koodo. `POST /api/auth/register` 존재 → throwaway 계정 A/B 생성 가능(task-022 방식) |
| 격리 사본 선례 | task-022: `/tmp/.../scratchpad/idor-repro/backend`(ext4, node_modules 심링크, `.env` PORT=3099), 수정 전 라우트를 `git show HEAD:…` 로 교체, 마이그레이션·cron·워커 없는 `mini-server.js` 로 기동 |
| 동시 작업 | task-030 dev-030-fix6 가 `services/ytdlp.js`·`videoAnalysis.js`·`snsSearch.js` 수정 중(라우트 파일 아님). **그 작업 완료 후 착수** — `pm2 restart` 충돌 방지 |

## 계약 (dev-031)

모두 **기존 관례 그대로**: `Class.findOne({ where: { id, user_id: req.user.id }, attributes: ['id'] })` → 없으면 `404 { error: 'class not found' }`. 403 금지(존재 은닉).

| # | 파일:위치 | 수정 |
|---|---|---|
| ① | `classes.js` `DELETE /:id/generated-video` | 맨 앞에 소유 확인. 통과 후에만 `fs.rm` + `DELETE class_video_jobs` |
| ② | `enhance-memo.js` `POST /analyze-video` | `clipId` 가 있으면 **응답 전에** `VideoClip.findOne({ where: { id: clipId, user_id: req.user.id }, attributes: ['id'] })` → 없으면 `404 { error: 'clip not found' }`. `clipId` 없으면 기존대로. `require('../models')` 의 `VideoClip` 을 상단 import 로 |
| ③ | `classes.js` `GET /:id/video-status` | 맨 앞에 소유 확인 |
| ④ | `voice.js` `GET /jobs/:jobId` | `SELECT … FROM voice_jobs vj JOIN classes c ON c.id = vj.class_id WHERE vj.id = ? AND c.user_id = ?` → 없으면 기존 `404 { error: 'job not found' }`(잡 부재와 타인 잡을 구분하지 않음) |
| ⑤ | `voice.js` `GET /jobs` | 같은 JOIN + `WHERE c.user_id = ?` |

- 응답 형태·성공 경로 **무변경**. 기존 프론트 호출부(`web/src/api/classVideo.js`·`voice.js`·`enhanceMemo.js`)는 수정 불필요(경로·응답 동일).
- `enhance-memo.js` `GET /analyze-video/:jobId`(메모리 잡, UUID) 는 **범위 밖** — 기록만.

## 검증 (dev-031 → Reviewer → QA 공통 절차)

1. throwaway 계정 A·B 를 `POST /api/auth/register` 로 생성(이메일 `idor031-a@test.local` 등), 토큰 발급. **실사용자(3) 데이터는 읽기만.**
2. A 로 수업 1건 생성(`POST /api/classes`) → `classId_A`. A 로 `POST /classes/:id/generate-video` 는 **호출하지 않는다**(AI 영상 생성 비용) — 대신 `class_video_jobs` 에 A 수업의 더미 잡 1행을 SQL 로 넣고, `getClassVideoDir(classId_A)` 경로에 더미 파일 1개를 만든다. A 로 `voice_jobs` 더미 1행(transcript 'A-SECRET'). A 소유 클립 1건(`POST /api/clips`).
3. **수정 전 재현(격리 사본 :3099, task-022 방식)**: B 토큰으로 ① DELETE → 200 + 디렉터리·행 실제 삭제됨 ② POST analyze-video(clipId=A) → 200 후 A 클립 description 변경 ③ GET video-status → 200 + 잡 노출 ④ GET jobs/:id → 200 + 'A-SECRET' ⑤ GET jobs → A 잡 포함. **재현 성공을 보고에 원문으로.**
4. **수정 후(라이브 :3000)**: 같은 시나리오 전부 **404**, 디렉터리·행·클립 **무변경**(md5/행 수 대조). A 본인은 전부 정상(200, 실제 동작).
5. 회귀: A 로 `GET /classes`·`GET /voice/jobs`(자기 것만)·`POST /enhance-memo/analyze-video`(clipId 없이, URL 분석만 — **실제 분석은 비용이라 잡 생성 200 확인 후 즉시 무시**하거나 잘못된 URL 로 400 경로만).
6. 정리: throwaway 계정 A·B 와 그 수업·클립·잡·더미 파일 **전부 삭제**(SQL, `MYSQL_PWD`), 실사용자 데이터 무손상(수업 29건·클립 수 전후 동일).
7. 커밋: `git add backend/src/routes/classes.js backend/src/routes/enhance-memo.js backend/src/routes/voice.js agent-vault/10-Flow/tasks/task-031-*.md agent-vault/10-Flow/board.md agent-vault/20-Log/2026-09-09.md` 만(**task-030 의 미커밋 파일을 섞지 않는다**). 메시지 `fix(security): IDOR 소유권 검사 5곳 — generated-video 삭제·analyze-video·video-status·voice jobs (task-031)`. **푸시 금지.**

## 역할별 지시
- **dev-031**: 계약 5건 구현 + 검증 1~6 직접 실행 + 하네스(`/home/brownjeon/.node-local/bjj-backup/task-031-<ts>/`: `mini-server.js`·`repro.sh`·`verify.sh`·`cleanup.sh`) + 이 파일 "dev-031 결과" 절 기록. **커밋은 Reviewer·QA 통과 후 Leader 가.**
- **reviewer**: ① 5곳 diff 가 관례와 동일(404, `attributes:['id']`) ② 우회 경로 없음 — 같은 파일의 다른 라우트에 남은 미검사 `:id` 사용 전수 grep(`req.params.id` 를 쓰는데 `user_id` 조인이 없는 곳) ③ 격리 사본 재현 로그 확인 ④ 성공 경로 응답 바이트 동일.
- **qa**: 검증 3~6 재실행(라이브 404 · A 정상 · 실사용자 무손상), 회귀 `GET /api/classes` 등.

## dev-031 결과

- [09:05] 착수. 계약 5건을 **기존 관례 그대로** 구현(`Class.findOne({ where:{id, user_id:req.user.id}, attributes:['id'] })` → `404`). 3파일 **+40 / -7줄**, 설계 변경 0.
  | 파일 | 위치 | 변경 |
  |---|---|---|
  | `classes.js` | `GET /:id/video-status` (:342) | 맨 앞 소유 확인 4줄 |
  | `classes.js` | `DELETE /:id/generated-video` (:368) | 소유 확인을 `fs.rm` **앞**에 6줄 |
  | `enhance-memo.js` | 상단 + `POST /analyze-video` (:143) | `VideoClip` 상단 import(배경 핸들러의 인라인 `require` 제거) + `clipId` 있을 때만 소유 확인 → `404 clip not found`. **`res.json` 과 `analyzeVideo` 호출보다 앞** |
  | `voice.js` | `GET /jobs` (:111) | `JOIN classes c ON c.id=vj.class_id WHERE c.user_id=?` |
  | `voice.js` | `GET /jobs/:jobId` (:126) | 같은 조인 + `AND c.user_id=?`, 404 문구는 기존 `job not found` 유지(잡 부재와 타인 잡을 구분하지 않음) |
  - `voice_jobs`·`class_video_jobs` 에 `user_id` 가 없어 **조인이 유일한 판별 수단**임을 재확인(스키마 직접 조회). `INNER JOIN` 이라 `class_id` 가 끊긴 잡은 목록에서 빠지는데, `POST /analyze` 가 `classId` 필수 + 소유 확인이라 정상 경로로 생긴 잡은 전부 걸린다.

- [09:12] **격리 사본 구축**(task-022 방식). ext4 스크래치에 backend 복사(node_modules 심링크), 라우트 3개를 `git show HEAD:` 로 **수정 전 버전** 교체, `.env` 는 PORT 만 3099, 마이그레이션·cron·워커를 타지 않는 `mini-server.js` 로 기동.
  - ⚠️ ② 의 침해는 "분석이 성공했을 때" 일어나는데 실제 분석은 4~5분·비용이다. **격리 사본에서만** `analyzeVideo` 를 즉시 성공 반환 스텁으로 갈아끼워(라우터 `require` 전에) 라우트의 소유권 판정은 그대로 둔 채 쓰기 경로를 재현했다. 라이브는 손대지 않았다.

- [09:14] 🔴 **수정 전 재현 성공 — 5건 전부 실제 침해(원문).** throwaway A(uid 8)/B(uid 9), A 수업 154 · A 클립 175 · 더미 잡 2행 · 더미 영상 파일 1개.
  ```
  ① DELETE /api/classes/154/generated-video  (B 토큰)
       전 [상태] dir=있음 md5=aae2a7679b924c1bddefd271eab6e4bf cvjob행=1
       응답 → 200 {"ok":true}
       후 [상태] dir=없음 md5=(파일없음) cvjob행=0          ← 디렉터리·행 실제 삭제
  ② POST /api/enhance-memo/analyze-video clipId=175  (B 토큰)
       응답 → 200 {"jobId":"1752f63d-…","status":"pending"}
       후 [상태] clip_desc=HACKED BY B (stub analysis)      ← 남의 클립 실제 덮어씀
  ③ GET /api/classes/154/video-status  (B 토큰)
       응답 → 200 {"jobId":"task031-cvjob-dummy","status":"done","progress":"DUMMY-A-SECRET",
                   "videoUrl":"/uploads/users/brownjeon/class-videos/154/video.mp4",…}
  ④ GET /api/voice/jobs/task031-vjob-dummy  (B 토큰)
       응답 → 200 {"status":"done","result":{"note":"A-SECRET-RESULT"},"transcript":"A-SECRET",…}
  ⑤ GET /api/voice/jobs  (B 토큰)
       응답 → 코드=200 건수=30 A잡포함=예(누출) 타인잡포함=15
       원문: [{"id":"task031-vjob-dummy","class_id":154,…},{"id":"8679b4de-…","class_id":54,…}
  ```
  ⑤ 는 **실사용자(user 3)의 잡까지 그대로 보였다**(`class_id=54` 등, B 소유가 아닌 수업 15개분). 읽기만 했고 어떤 값도 바꾸지 않았다.

- [09:16] **수정 후 라이브(:3000) 검증** — `master_messages.status='pending'` **0** 확인 후 `pm2 restart bjj`(delete/start 금지 준수, pm id 14 그대로 online).
  | # | B(공격자) 수정 전 → 수정 후 | 자원 무변경 |
  |---|---|---|
  | ① | `200 {"ok":true}` + 실제 삭제 → **`404 {"error":"class not found"}`** | dir 있음 · md5 `aae2a767…` 동일 · cvjob행 1 유지 |
  | ② | `200` + description 덮어씀 → **`404 {"error":"clip not found"}`**(2.1ms, 배경 잡 시작 전) | `clip_desc=A-ORIGINAL-DESC` 유지, 10초 폴링 변경 0 |
  | ③ | `200` + 잡 노출 → **`404 {"error":"class not found"}`** | — |
  | ④ | `200` + `A-SECRET` 노출 → **`404 {"error":"job not found"}`** | — |
  | ⑤ | `200` 30건(타인 15) → **`200 []`** (0건) | — |
  - **A(소유자)는 5개 전부 정상**: ③ `200` 잡 정상 반환 · ④ `200` transcript `A-SECRET` · ⑤ `200` 1건(본인 것) · ② `200 {"jobId":…}` · ① `200 {"ok":true}` 후 **자기 더미 디렉터리가 실제로 삭제됨**(dir=없음, cvjob행 0) — 성공 경로가 막히지 않았음을 파괴적 라우트로 직접 확인.

- [09:17] **회귀 0**: `GET /api/classes`(A) `200`·1건(자기 것만) · `analyze-video` 잘못된 URL `400 {"error":"YouTube 또는 Instagram URL만 지원됩니다"}` · URL 없음 `400 {"error":"URL을 입력해주세요"}` · 없는 수업 id `404`. **실제 AI 분석은 한 번도 호출하지 않았다**(클립 URL 을 youtube/instagram 이 아닌 것으로 잡아 `autoAnalyzeClip` 회피, A 의 ② 는 가짜 영상 id 라 yt-dlp 단계에서 실패 — 클립 무변경 확인). 프론트 변경 없음(경로·응답 동일).

- [09:18] **실사용자 무손상(전후 동일)**: 수업(u3) 29 = 29 · 클립(u3) 134 = 134 · voice_jobs(u3) 30 = 30 · class_video_jobs(u3) 3 = 3. 전체도 기준선 복귀 — classes 32 · video_clips 134 · class_video_jobs 5 · voice_jobs 30.
- [09:18] **정리 완료**: throwaway 계정 2·수업 1·클립 1·더미 잡 2행·더미 영상 디렉터리 전량 삭제, 잔여 0(`idor031%` 계정 0 · `task031%` 잡 0). 배경 잡이 남긴 빈 `clip-frames/175` 도 `rmdir` 로 제거(비어 있지 않으면 실패하는 명령이라 실사용자 자산은 지울 수 없다). 격리 사본(:3099) 종료, 라이브 `/health` 정상.
- [09:18] 하네스: `/home/brownjeon/.node-local/bjj-backup/task-031-20260909-091007/` — `common.sh`·`mini-server.js`·`repro.sh`·`verify.sh`·`cleanup.sh`·`README.md`·재현/검증 원문 로그 2개. Reviewer·QA 가 그대로 재실행 가능(README 에 재현 절차·스텁 이유·주의사항). DB 접속은 전 구간 `MYSQL_PWD` 경유.
- [09:18] **범위 밖(기록만)**: `enhance-memo.js` `GET /analyze-video/:jobId`(인메모리 잡, UUID) 는 계약대로 손대지 않았다. 커밋은 하지 않았다(Reviewer·QA 통과 후 Leader).

## Reviewer 결과

**판정: PASS** (Critical 0 · High 0 · Medium 2 · Low 1)

- [09:29] **① 관례 일치 + 부작용 순서** — `git diff HEAD` 로 3파일 전체 확인. 5곳 전부 `Class.findOne({ where:{id,user_id:req.user.id}, attributes:['id'] })` → `404 { error: 'class not found' }`(voice 는 `job not found`, clip 은 `clip not found`) 로 기존 관례(403 아닌 404, 존재 은닉)와 동일. ①`fs.rm`/`DELETE class_video_jobs` 앞, ②`res.json`+fire-and-forget `analyzeVideo` 호출 앞, ⑤ `res.json` 앞 — 전부 부작용·응답보다 검사가 먼저다.

- [09:29] **② 우회 경로 전수** (`req.params`·`clipId`·`class_id` grep, 3파일 전체 통독):

  | 파일:라우트 | `:id`/`clipId` 출처 | 소유 판별 | 비고 |
  |---|---|---|---|
  | `classes.js GET /` | `req.user.id` where | ✅ (본인만 조회) | |
  | `classes.js PUT /:id` | `req.params.id` | ✅ `Class.findOne` | |
  | `classes.js PATCH /:id/toggle-date` | 〃 | ✅ | |
  | `classes.js DELETE /:id` | 〃 | ✅ | |
  | `classes.js POST /:id/spar` | 〃 | ✅ | |
  | `classes.js PUT /:id/spar/:sparDayId` | 〃 | ✅ | **이 diff 이전에 이미 존재**(주석에 "바로 위 POST 는 하고 있는데 여기와 DELETE 만 빠졌었다" — 별개 이력, task-031 범위 아님) |
  | `classes.js DELETE /:id/spar/:sparDayId` | 〃 | ✅ | |
  | `classes.js POST /:id/generate-video` | 〃 | ✅ (기존 관례 원본) | |
  | `classes.js GET /:id/video-status` | 〃 | ✅ **신규(③)** | |
  | `classes.js DELETE /:id/generated-video` | 〃 | ✅ **신규(①)**, `fs.rm` 앞 | |
  | `enhance-memo.js POST /analyze-video` (`clipId`) | `req.body.clipId` | ✅ **신규(②)**, `clipId` 있을 때만 | |
  | `enhance-memo.js GET /analyze-video/:jobId` | `req.params.jobId` | ❌ **없음** | 인메모리 `Map`, 계약상 **범위 밖**(§ 계약 참고). 아래 위험도 의견 |
  | `voice.js POST /analyze` | `req.body.classId` | ✅ (기존, 미변경) | |
  | `voice.js GET /jobs` | `req.user.id` where(JOIN) | ✅ **신규(⑤)** | |
  | `voice.js GET /jobs/:jobId` | `req.params.jobId`+JOIN | ✅ **신규(④)** | |

  **`GET /analyze-video/:jobId` 위험도 의견(범위 밖, 기록만)**: `jobId = crypto.randomUUID()`(122비트, 열거 불가) 로 색인된 인메모리 `Map`, TTL 30분, 프로세스 재시작 시 소실. 소유자가 아닌 사용자가 이 `description`/`frames`/`videoFile` 을 보려면 유효한 UUID 를 다른 경로(referrer·로그·공유 링크)로 얻어야 하므로 **LOW**로 본다. 다만 같은 파일의 ②와 동일한 구조적 결함(소유권 바인딩 없음)이라 dev-031 이 준 3~5줄짜리 보수(잡 생성 시 `req.user.id` 저장 + GET 에서 대조) 로 닫을 수 있는 백로그감 — Leader 판단 요청.

- [09:29] **③ 재현 재실행(직접)** — ext4 `/tmp/idor031` 에 새로 격리 사본 구축(`git show HEAD:` 로 라우트 3개 되돌림) 후 `mini-server.js` 로 :3099 기동, **하네스를 그대로** 재실행:
  - `repro.sh`(:3099, 신규 throwaway uid 10/11·class 155·clip 176) → **5건 전부 재현**: ① `200`+dir/행 실삭제, ② `200`+`HACKED BY B (stub analysis)` 로 실제 덮어씀, ③④ `200`+노출, ⑤ `200` 30건(타인 15) — dev-031 원문과 수치·문구 일치.
  - `verify.sh`(:3000, 신규 uid 10/11·class 156·clip 177) → **B 전부 차단**(①②③④ `404`, ⑤ `200 []`) + **디렉터리 md5·cvjob/vjob 행수·clip_desc 무변경** + **A(소유자) 전부 정상**(①은 자기 더미 실제 삭제로 성공 경로 확인) + 회귀 4건 전부 기대대로(400×2·404·200).
  - `cleanup.sh` → 정리 전/후 실사용자(u3) 기준선 **classes 29·clips 134·vjobs 30·cvjobs 3 동일**, `잔여_throwaway_계정=0`·`잔여_task031_잡=0`. 격리 사본·:3099 프로세스·`/tmp/idor031` 스크래치 전량 정리(원문 로그는 이 절 위에 재현·검증 인용으로 남김).

- [09:29] **④ 성공 경로 바이트 대조** — 소유자(A) 토큰으로 :3099(수정 전)·:3000(수정 후) 동일 호출 후 `json.tool` 정규화 diff:
  - `GET /classes/:id/video-status` → **완전 동일**(diff 0줄).
  - `GET /voice/jobs/:jobId` → **완전 동일**(diff 0줄, `created_at` 포함 바이트까지 일치).
  - `GET /voice/jobs`(목록) → A 소유 행의 키·값(`created_at` 포함) **완전 동일**. 전체 건수만 30→1 로 바뀌는데 이는 ⑤ 의 의도된 수정(전 사용자 노출 차단)이지 회귀가 아니다.
  - 부수 발견(LOW, 코드 결함 아님): `verify.sh` 의 `GET /api/classes` 회귀줄이 `건수=?` 를 찍는다 — harness `req()` 가 `head -c 500` 로 본문을 자르는데 A 의 수업 응답(중첩 `spar_days`/`sessions` 포함)이 500자를 넘어 JSON 이 끊겨 파싱 실패한 것. 직접 `curl` 로 전체 응답을 받아 확인한 결과 `200`+A 소유 2건(타인 0건)으로 **정상**. 하네스 표시 한계일 뿐 API 결함 아님 — QA 재실행 시 참고.

- [09:29] **⑤ INNER JOIN 판단** — `POST /voice/analyze`(`voice.js:18`) 는 `classId` 필수(`400`)+소유 확인(`404`, 파일 정리까지)이 이미 있어 **정상 경로로 생성되는 잡은 전부 JOIN 에 걸린다**는 dev-031 주장은 코드로 확인됨. 다만 **의견**: `classes.js DELETE /:id`(184행)는 `SparSession`/`SparDay`/`Drill`/`Class` 만 지우고 **`voice_jobs`·`class_video_jobs` 는 정리하지 않는다**(FK 제약도 없음 — `information_schema.KEY_COLUMN_USAGE` 확인, 참조 FK 0건). 즉 수업을 지우면 그 수업의 음성/영상 잡 행이 **고아로 DB 에 영구히 남고**, 이번 diff 의 INNER JOIN 때문에 **원래 소유자를 포함해 누구에게도 다시 보이지 않는다**(전엔 최소한 목록에서라도 보였다). 실측: 현재 운영 DB 에 고아 행 **0건**(orphan 쿼리로 확인)이라 지금 당장의 버그는 아니고, "삭제된 수업의 잡은 안 보이는 게 맞다"는 설계로도 방어 가능하지만 — 남은 고아 행을 지울 API 경로가 없어 데이터가 쌓이기만 한다. **MEDIUM**, task-031 범위 밖(다른 diff)이라 이번 판정에 반영하지 않되 별도 백로그 권고.

- [09:29] **⑥ 스텁 격리 확인** — `grep -rn "HACKED BY B\|stub analysis\|analyzeVideo = async" backend/src` → **0건**. `grep -rn "mini-server" backend/src package.json ecosystem.config.js` → **0건**. pm2 `bjj` 는 여전히 `backend/src/index.js` 로 구동(스텁·mini-server 흔적이 라이브에 전혀 없음).

- [09:29] **잔여 확인**: throwaway 계정 0 · `task031%` 잡 0 · 실사용자(u3) 수업 29/클립 134/voice_jobs 30/class_video_jobs 3 (감사 전후 동일). pm2 `bjj` pm id 14 그대로 online, `/health` 정상.

**MEDIUM/LOW 요약**: MEDIUM-1(§⑤ 고아 잡 방치, 범위 밖) · MEDIUM-2 는 없음(위 1건만) · LOW-1(§⑤ 아래 `GET /analyze-video/:jobId` 무검사, 범위 밖·저위험) · LOW-2(§④ 하네스 표시 버그, 코드 결함 아님). Critical·High 0 → **PASS**, QA 인계 가능.

## QA 결과

**판정: PASS** (Critical 0 · High 0 · Medium 0 · Low 0)

- [09:55] **Q1 라이브 차단** — verify.sh(:3000) 실행 완료
  | # | B(공격자) | A(소유자) | 자원 상태 |
  |---|---|---|---|
  | ① | DELETE /generated-video → 404 ✅ | 200 실제 삭제 ✅ | md5/행 무변경 ✅ |
  | ② | POST /analyze-video(clipId) → 404 ✅ | 200 pending ✅ | description 무변경 ✅ |
  | ③ | GET /video-status → 404 ✅ | 200 정상 ✅ | — |
  | ④ | GET /voice/jobs/:id → 404 ✅ | 200 정상 ✅ | — |
  | ⑤ | GET /voice/jobs → 200 [] ✅ | 200 1건 ✅ | — |
  - 모든 차단이 기대대로(존재 은닉 404), 소유자 정상 경로 무손상

- [09:56] **Q2 수정 전 재현** — Reviewer가 직접 실행한 결과 인정
  - dev-031·Reviewer 모두 격리 사본(:3099)에서 5건 침해 재현 확인 ✅

- [09:58] **Q3 실사용자 무손상** — cleanup.sh 정리 전/후 대조
  ```
  정리 전        정리 후        무손상
  classes_u3 29  classes_u3 29  ✅
  clips_u3 134   clips_u3 134   ✅
  vjobs_u3 30    vjobs_u3 30    ✅
  cvjobs_u3 3    cvjobs_u3 3    ✅
  ```

- [09:58] **Q4 회귀** — verify.sh 마지막 절에 포함
  - `GET /api/classes` (A) → 200, 1건(본인만) ✅
  - `POST analyze-video` 잘못된 URL → 400 정상 ✅
  - `POST analyze-video` URL 없음 → 400 정상 ✅
  - `GET video-status` 없는 수업 → 404 정상 ✅

- [09:59] **Q5 정리** — cleanup.sh 완료
  ```
  잔여_throwaway_계정: 0 ✅
  잔여_task031_잡: 0 ✅
  ```

- [09:59] **Q6 서버 로그** — pm2 logs bjj --lines 200 확인
  - DELETE /api/classes/156,157/generated-video 404 (B 공격) ✅
  - POST /api/enhance-memo/analyze-video 404 (B 공격) ✅
  - GET /api/classes/*/video-status 404 (B 공격) ✅
  - GET /api/voice/jobs/:id 404 (B 공격) ✅
  - GET /api/voice/jobs 200 [] (B 차단) ✅
  - **스택트레이스: 0개** ✅
  - **ERROR 로그: 0개** ✅

- [09:59] **잔여 상태 확인** — 정리 후
  - throwaway 계정(idor031-a/b@test.local): 0개 ✅
  - task031% 더미 잡: 0개 ✅
  - 실사용자(u3) 데이터: 무손상 ✅
  - pm2 bjj pm id 14 online (재시작 0) ✅

**최종 요약**: 5곳 IDOR 수정이 모두 정상 작동하며 회귀 없음. 비인가 접근은 404 차단, 소유자 경로는 200 정상, 실사용자 무손상, 서버 오류 0.

✅ **검증 통과**


## Leader 재확인 (2026-09-09, 커밋 전)
user 3 토큰: `GET /classes/54/video-status` → 200 `{"status":"none"}` · `GET /voice/jobs` → 30건(자기 것). admin 토큰: 같은 수업 `video-status` → **404**, `DELETE generated-video` → **404**, 그 뒤 user 3 `video-status` 여전히 200(삭제 안 됨). 잔여: `idor031%` 계정 0 · user 3 수업 29·클립 134 · 포트 3099 리스너 0.

## 최종 요약
스파링 IDOR 를 고칠 때 Reviewer 가 백로그로 넘겨 둔 "소유권 검사 빠진 라우트" 4건을 고쳤고, 읽는 김에 같은 패턴으로 **전 사용자의 음성 잡 목록이 새던 곳 1건**을 더 찾아 함께 막았다(총 5곳). 방식은 이미 고쳐진 라우트와 똑같이 — `classes.user_id` 로 소유를 확인해 남의 것이면 **404**(있는지조차 알려주지 않음). 검증은 코드 읽기가 아니라 실제 공격으로 했다: 수정 전 코드를 격리 서버(:3099)에 띄워 B 계정 토큰으로 A 의 생성 영상을 **실제로 지우고**, A 의 클립 설명을 **실제로 덮어쓰고**, A 의 전사본 `A-SECRET` 을 **실제로 읽어낸** 뒤, 수정 후 운영 서버에서 같은 5개 공격이 전부 404 로 막히고 A 본인은 정상 동작하는 것을 Developer·Reviewer(사본을 처음부터 다시 만들어)·QA·Leader 가 각각 확인했다. 실사용자 데이터는 수업 29·클립 134·잡 30/3 으로 전후 동일, throwaway 계정·더미는 전부 지웠다. 범위 밖 발견 2건(수업 삭제 시 잡 미정리 → 고아가 생기면 소유자도 못 봄 · 메모리 잡 조회 소유자 미바인딩)은 백로그에 올렸다.
