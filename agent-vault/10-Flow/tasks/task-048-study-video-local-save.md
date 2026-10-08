---
id: task-048
title: 영상분석 — 분석할 때 영상을 서버에 저장하고 서버 파일로 재생 (유튜브 삭제·비공개 대비)
status: review
waiting: push_confirm
created: 2026-10-07
base_ref: 14eb8509187722db0d17006b37dc305c6ebf1e69
risk_level: R2
tags:
  - type/task
  - domain/study-video
  - domain/storage
related_tasks:
  - task-007-long-video-study-phase1
  - task-008-long-video-study-phase2
aliases:
  - 영상분석 로컬 저장
  - 긴 영상 서버 보관
demo_gate:
  required: true
  level: "delta"
  status: "waived"
  version: 0
  repo_path: ""
  artifact_url: ""
  content_sha256: ""
  decided_by: "judge"
  rule_id: "JV-ui_change"
  approved_by: ""
  approved_at: ""
  approval_quote: ""
  waived_by: "user"
  waived_at: "2026-10-07T23:41:57+09:00"
  waiver_quote: "데모 생략하고 바로 구현해줘"
  active: true
---

# task-048 — 영상분석 영상 서버 저장·서버 재생

## 사용자 요청 (2026-10-07)

> 영상분석 메뉴에서 분석시 동영상은 링크로 플레이하는거야? 방금 '바라토플라타 세팅 강의'라는 제목의 영상분석을 했는데 유튜브 앱에서 플레이가 가능하다고해. 분석시 기술분석처럼 영상을 서버에 다운받은 후에 분석을 해서 나중에 해당 유튜브에서 해당 링크를 끊거나 삭제해도 지장이 될수없도록 해줘

## 실측 (Leader, 2026-10-07 — 코드·DB·NAS 직접 확인)

| 항목 | 현재 |
|---|---|
| 재생 | `StudyVideoDetailPage.jsx:139,160` — `getYtEmbed(video.url)` **YouTube iframe 만**. 챕터 시점 이동은 iframe `postMessage seekTo`(`:89-101`) |
| 영상 파일 | `longVideoPipeline.js:490-522` S3 가 `tmpDir` 에 720p 이하 mp4 를 받아 분석에 쓰고, `finally`(`:689-693`)에서 **폴더째 삭제**. 서버에 남는 건 챕터 프레임(640px, 챕터당 3장 — `users/<uid>/long-video-frames/<vid>/`)뿐 |
| DB | `long_videos.video_path` 컬럼은 **이미 있다**(모델 주석 "Phase 1은 보관 안 함(Phase 3+ S11 전용)") — 8행 전부 NULL. 마이그레이션 불필요 |
| 원래 계획 | task-007 이 S11(완료·보관)을 Phase 4 로 미뤘고 **구현된 적이 없다**(`longVideoPipeline.js:2` 주석). 영상 보관을 하지 않기로 한 결정은 vault·docs 에 없다 — 이번 task 가 S11 의 영상 보관 부분 |
| 기술분석 방식 | `videoAnalysis.js:799-805` 가 분석 후 `getVideoDir(clipId)/video.mp4` 로 복사·`videoWebPath` 저장. 재생은 `ClipsPage.jsx:539`·`VideoPlayer.jsx` 가 `<video>` 우선, 없으면 iframe |
| 규모 | long_videos 8건·합계 1.1시간·최장 15분(운영 user 3). 파이프라인 상한은 3시간(720p ≈ 수 GB 가능). NAS 여유 2.5TB |
| 서빙 | `/uploads` = `express.static`(Range 지원 기본) — 프레임·clip-videos 와 같은 경로 방식 |
| 삭제 | `routes/longVideos.js:283-299` 가 DB 행과 프레임 폴더만 지운다 → 영상 폴더도 같이 지워야 한다 |

결론: **링크(iframe) 재생이 맞다.** 영상은 분석 중에만 서버에 있다가 지워진다. 유튜브에서 지우면 재생이 끊긴다(분석 결과·프레임은 남음).

## 설계 (Leader)

### 백엔드
1. `services/storage.js` — `getLongVideoDir(userId, videoId)` = `users/<uid>/long-videos/<vid>`, `longVideoWebPath(userId, videoId)` = `/uploads/users/<uid>/long-videos/<vid>/video.mp4`. 기존 `getLongVideoFramesDir` 처럼 **userId 필수**(DEFAULT_USER 하드코딩 금지). 기존 함수 무수정.
2. `services/longVideoPipeline.js` — S3(다운로드) 성공 직후·취소 검사 뒤에 **영상 저장 단계**(`S3.5`, "영상 서버에 저장 중") 추가. 분석 단계(S4~S10)가 실패해도 영상은 남도록 다운로드 직후에 둔다.
   - `tmpDir` 의 mp4 를 대상 폴더에 **임시 이름으로 복사 → `rename`**(원자적 교체). 복사·rename 실패 시 임시 파일 삭제, **기존 `video_path`·기존 파일은 그대로**(재분석이 이미 저장된 영상을 망치면 안 된다).
   - 성공하면 `LongVideo.update({ video_path: <웹 경로> })`. **저장 실패는 치명적이지 않다**(로그 + 계속 진행 → `video_path` NULL 이면 iframe 재생으로 폴백).
   - mp4 가 아닌 확장자면 `ffmpeg -c copy` 재포장을 시도하고, 안 되면 저장을 건너뛴다(분석은 계속).
   - 긴 복사 동안 job heartbeat 가 끊겨 stale 로 오인되지 않는지 확인(`updateStage`·워커 stale 기준 확인 후 필요하면 복사 전후로 heartbeat 갱신).
   - 디스크 확인: 기존 `checkFreeDiskSpace(TMP_ROOT)` 는 임시 디렉토리 기준 — 저장 대상(NAS) 여유도 영상 크기 대비 확인(부족하면 저장만 건너뜀).
3. `services/ytdlp.js` `downloadVideo` — **브라우저·안드로이드 WebView 재생 호환**을 위해 H.264(avc1)+AAC 를 우선 선택하고 기존 포맷 지정을 폴백으로 둔다(예: `bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/기존`). 먼저 ffprobe 로 **현재 다운로드의 코덱을 실측**해 필요 여부를 정한다(이미 avc1 이면 변경하지 않는다). 가능하면 `moov` 앞 배치(`faststart`)로 스트리밍 시작 지연을 줄인다 — 효과가 실측되지 않으면 넣지 않는다.
4. `routes/longVideos.js` DELETE — 프레임 폴더와 같은 방식(응답 뒤 베스트에포트)으로 `getLongVideoDir` 도 삭제. `GET /:id` 는 `...video` 로 `video_path` 가 이미 나가므로 무변경(확인만).

### 프론트 (`web/src/pages/StudyVideoDetailPage.jsx` — 레이아웃 무변경)
5. `video.video_path` 가 있으면 같은 sticky 16:9 칸에 `<video controls playsInline preload="metadata" src={video_path}>`. 없거나 `onError` 면 **기존 iframe 그대로**(옛 영상·저장 실패·NAS 장애 폴백).
6. `seekTo(sec, chapterId)` — 로컬 재생이면 `video.currentTime = sec` + `play()`(메타데이터 미로드면 `loadedmetadata` 후 적용). `lastSeekSecRef`·`activeChapterId` 로직 유지. iframe 경로는 무수정.
7. 한 줄 표식(예: "서버 저장본 · 유튜브 없이 재생")은 **넣지 않는다**(화면 변경 최소화) — 필요하면 사용자 결정.

### 데모 수준
같은 칸의 플레이어 교체뿐이라 judge 가 `none`/`delta` 중 판정한다. `full` 이면 designer 데모 + 사용자 승인 후 구현.

## 범위 밖 (이번에 하지 않는다 — 사용자 결정 대기)

- **기존 8건 백필**(영상만 다시 받아 저장): 운영 DB·파일을 건드리는 별도 작업이라 사용자 승인 후. 방금 분석한 `id=74` 는 배포 후 **재분석 1회**로도 저장된다.
- **유튜브가 사라진 뒤의 재분석**: S1(메타 조회)이 치명적 단계라 원본이 없으면 재분석은 실패한다(기존 결과·저장 영상은 보존). 로컬 파일로 재분석하려면 S1·S3 를 건너뛰는 분기가 필요 — 별도 task 후보.
- 다른 플랫폼(인스타 등)은 영상분석 등록 대상이 아니다(`extractYoutubeId` 만 통과).

## 관련 과거 이력·교훈

- task-008 Phase 2: S7 프레임 영구 저장(`getLongVideoFramesDir`, userId 필수 패턴) — 같은 방식으로 간다.
- task-044·043: yt-dlp/whisper PATH 의존 — `YTDLP_BIN`(`resolveYtDlp`)만 쓴다. bare `yt-dlp` 금지.
- 메모리: 푸시가 곧 배포. vault 기록만의 커밋은 로컬에 두고 코드 push 에 같이. `git reset --hard` 금지(미커밋 소실 전례).
- `/이슈기록 관련` 교훈 조회는 이 task 에서 실행하지 않았다(신규 도메인 `study-video`).

## 판단 기록 (judge)

intake (2026-10-07, jev-1.13.0, `judge-result@2`): task_type=feature · complexity=2.43(신뢰 0.57) · risk=**R2**(high 0.92) · developer_model=**opus** · roles=designer·developer·reviewer·qa · demo=delta/designer(JV-ui_change — ui_change=behavior_change 0.60, 신뢰 0.52) · next=demo_first. 출력 JSON 은 스크래치패드 `task-048-judge-intake.out.json`.
데모 게이트: `check.mjs init` → status=drafting. 사용자가 데모 생략을 말하기 전에는 developer 는 대기한다(대리 생략 금지).
Leader 확인: judge 가 R2 로 본 이유는 사용자별 파일 경로·삭제 경로·파이프라인 저장 순서 — `judge.md` 맞춤 절의 "user_id 격리"·"다중 테이블 쓰기" 영역과 겹치므로 R2 를 그대로 따른다(override 없음).
demo=delta/designer — **사용자 생략(2026-10-07)**: 사용자 입력 "데모 생략하고 바로 구현해줘" → `check.mjs waive`(WAIVED)·`activate`(PASSED). 사용자 결정 2건: ① 데모 생략 ② 기존 8건 영상 백필은 **배포 후 별도 승인으로**(이번 task 범위 밖).
Leader 확인(heartbeat): `longVideoWorker.js` 에 실행 중 stale 강제 종료 로직이 없다(부팅 시 복구만) — 긴 복사가 job 을 죽일 위험 없음. 임시 경로 `TMP_ROOT='/tmp'`(ext4 여유 516G).

C1 (설계 확정 직후, jev-1.13.0): `codex_required=false` · `wanted_before_budget=false` · budget_rule=`CX-limit-unknown-r2` · codex_switch=on · design_uncertainty=1.21(신뢰 0.66) · focus=concurrency(0.32). **Leader 직접 재실행으로 확정** — judge 에이전트가 스크래치패드에 저장한 `.out.json` 은 출력이 아니라 입력 echo 였다(codex_required 필드 없음). 실제 출력은 `task-048-judge-c1.real.json`. Codex 개입 없이 진행(override 없음).

C2 (Reviewer 1·2차 PASS-with-notes 직후, jev-1.13.0, Leader 가 도구를 직접 실행 — 입력 `task-048-judge-c2.in.json`, 원본 출력 `task-048-judge-c2.real.json`): **`codex_required=true`** · mode=adversarial-review · focus=concurrency(0.75) · budget_rule=`CX-limit-unknown-r2`(R2 라 한도 미확인이어도 개입 허용) · codex_switch=on · reviewer_doubt=0.81 · 호출 차수 1/4. 판정을 따라 codex 호출(override 없음) → 2건 지적(HIGH 1·MEDIUM 1, `## Codex 검토` 절) → Reviewer REV-048-3 이 판정: HIGH ① '두 프로세스 중복 실행'은 전제 오류(pm2 fork 1개·순차 재기동·부팅 시 `/tmp/bjj-lv-*` 정리) ② 워커 원자적 claim 부재·부팅 시 running→queued 는 **기존 결함(DEFER)** ③ 이번 task 의 `persistVideo` 임시 이름·접두사 일괄 삭제는 **ADOPT**(심각도 MEDIUM) / MEDIUM(reanalyze 경합)은 **DEFER-기존결함**. ADOPT 분은 developer 3차 수정(고유 임시 이름 + mtime 10분 초과만 정리)으로 반영, Reviewer 4차 PASS-with-notes. C2 재판정은 하지 않았다(수정이 `persistVideo` 한정이고 Reviewer 가 부정 대조까지 재현 — 필요하면 사용자가 요청). 호출 차수 총 1/4.
Leader 메모: judge 에이전트가 스크래치패드 출력 파일에 입력을 저장한 사고가 C1 에서 한 번 있어, C2 는 판정 도구를 Leader 가 직접 실행했다. 도구는 결정론적이라 결과는 동일하다.

## 구현 기록

### Developer (2026-10-08, opus)

- [07:25] 구현 완료 · 하네스 `run-all.sh` 2회차 **FAIL 0**(1회차는 기존 결함으로 B4 FAIL — 아래 "발견한 기존 결함"). 커밋·push·pm2·배포·운영 dist 손대지 않음.

**변경 파일·함수** (6파일, +262/−7)
- `backend/src/services/storage.js` — `getLongVideoDir(userId, videoId)`(:70) · `longVideoWebPath(userId, videoId)`(:76) 추가, exports 에만 추가. userId·videoId null 이면 throw(기존 함수 무수정).
- `backend/src/services/longVideoPipeline.js` — `freeBytesNear`(:266) · `copyWithCancel`(:281) · `persistVideo`(:311, export) 추가, `runPipeline` 에 **S3.5**(:663, 다운로드 후 취소 검사 뒤·S4 앞, progress 45 "영상 서버에 저장 중"). finally 주석만 보강.
- `backend/src/services/ytdlp.js` — `downloadVideo` 포맷을 `DOWNLOAD_FORMAT`(:202) 상수로: `bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]` 우선, 옛 지정 그대로 폴백.
- `backend/src/routes/longVideos.js` DELETE(:298) — 프레임 폴더 옆에 `getLongVideoDir` 베스트에포트 삭제 1줄. GET `/:id` 는 `...video` 로 video_path 가 이미 나감(API 실측 확인) → 무변경. reanalyze·cancel 무변경.
- `backend/src/models/LongVideo.js` — video_path **주석만** 갱신("Phase 1은 보관 안 함" → 실제 의미). 컬럼·스키마 무변경.
- `web/src/pages/StudyVideoDetailPage.jsx` — video_path 가 있으면 같은 칸에 `<video controls playsInline preload="metadata">`, onError → iframe. `seekTo` 에 `<video>` 분기(readyState≥1 즉시 currentTime / 0 이면 loadedmetadata 에서 적용 + play()). iframe 경로·레이아웃·문구 무변경, 다른 컴포넌트 무수정.

**코덱 실측과 결정** (근거 파일: 하네스 `probe/`)
- id=73 원본(2:12) 옛 지정 → `398+251` = **AV1(av01) 720p + Opus**, 10.9MB. 새 지정 → `136+140-1` = **H.264 High 720p + AAC LC**, 18.1MB(약 1.7배). 오디오는 둘 다 원어(ko) 트랙.
- moov 위치: 두 파일 모두 `ftyp,moov,free,mdat`(moov offset 32) — yt-dlp 병합이 이미 앞에 둔다 → 다운로드에는 faststart **넣지 않음**.
- 결정: AV1 은 하드웨어 디코더 없는 폰에서 소프트웨어 디코딩, iOS 는 일부 기종만 → avc1+m4a 우선으로 변경. [가능성 높음] 모바일 WebView 호환 이점(실기기 미검증).
- 재포장(mp4 아닐 때)에만 `-movflags +faststart` — ffmpeg 기본 재포장은 `ftyp,free,mdat,moov`(moov 끝)로 실측돼서(unit-persist INFO 줄).

**설계 대비 달라진 점·추가한 것 (Reviewer 판단 요청)**
1. **플레이어 선택을 영상 진입 시 1회로 고정** — 설계 문언은 "video_path 있으면 `<video>`". 첫 분석 도중 상세를 보고 있으면 S3.5 완료 순간 폴링이 video_path 를 받아 iframe 을 `<video>` 로 갈아 끼우며 **보던 유튜브 재생이 끊긴다**. 그래서 iframe→`<video>` 전환은 다음 진입부터, `<video>`→iframe(onError)은 즉시. 상태는 `{id, mode}` 로 id 별 기록(영상 id 가 바뀌면 다시 정함). 되돌리려면 `load()` 의 `prev.id === id ? prev :` 를 지우면 문언대로 된다(neg-control N1 이 이 차이를 잡는다).
2. **분석 중 DELETE 경합 가드** — 기존에 DELETE 는 진행 중 잡을 막지 않고, 잡 행이 지워져 `isJobCanceled` 도 false 라 파이프라인이 끝까지 돈다(기존 동작). 그대로 두면 S3.5 가 지워진 영상의 수 GB 파일을 고아로 남길 수 있어 저장 전·rename 후에 `LongVideo.count` 로 행 존재를 확인(없으면 저장 안 함/폴더 삭제). `affectedRows` 는 같은 값 UPDATE 에서 0 이 될 수 있어 쓰지 않았다.
3. 복사는 `fs.copyFile` 대신 **스트림 복사 + 3초 취소 폴링**(취소 시 중단·임시 파일 삭제 → 기존 cancelCleanup 경로), 복사 후 **크기 일치 검사**, 같은 폴더의 `video.mp4.tmp-*` **죽은 임시 파일 정리**(서버 재시작으로 재개된 잡은 jobId 가 같아 이름이 겹친다), 첫 저장 실패 시 이번 실행이 만든 **빈 폴더 rmdir**.
4. NAS 여유 공간: `영상 크기 + 1GB` 미만이면 저장만 건너뜀. statfs 실패는 통과(기존 `checkFreeDiskSpace` 관례) — 그 함수 시그니처는 건드리지 않고 별도 헬퍼.
5. `persistVideo` 의 `targetDir·marginBytes·copyFn·cancelPollMs` 옵션은 **단위 테스트 주입 전용**(파이프라인은 jobId·cancelCheck 만 넘김).
6. heartbeat: Leader 확인대로 실행 중 stale 종료가 없어 `updateStage` 로 문구만 갱신.

**검증** — 하네스 `/home/brownjeon/.node-local/bjj-backup/task-048-20261007-234656/harness/` · 재실행 `bash run-all.sh`(약 12~15분, 실분석 2회 = Claude 호출 포함) · 통과 로그 `runs/run2-20261008-pass.log`
- (0) `node --check` 5파일 PASS · `vite build`(ext4 하네스 사본 `web/`, node_modules 는 work 심링크 — work·운영 dist 무변경) "built in 1.52s". 프로젝트에 린트 설정 없음(backend·web 모두 lint 스크립트 없음).
- (a) `unit-persist.js` **PASS 45 / FAIL 0** — 경로 규칙·userId/videoId null throw(DEFAULT_USER 폴백 없음)·정상 저장·재저장 rename 교체(inode 변경)·복사 도중 실패/크기 불일치/rename 실패 시 기존 파일 내용·inode 보존 + 임시 0·mkv→mp4 재포장(h264/aac, moov 앞)·깨진 webm 재포장 실패 → 건너뜀·여유 공간 부족 → 건너뜀(폴더 안 만듦)·복사 전 취소/512MB 실제 스트림 복사 도중 취소 → 기존 보존·NAS 실경로 users/1/long-videos/99900001 저장 후 users/3·brownjeon 쪽 동일 id 없음 → 삭제.
- (b) e2e(`e2e.js`, 워커 없이 `runPipeline` 직접, 잡 행은 운영 워커가 못 집도록 `status='running'` 으로 생성):
  B1 실분석(id=73 과 같은 URL) → done · video_path=`/uploads/users/1/long-videos/81/video.mp4` · NAS 18,140,341 bytes · ffprobe h264 High 1280x720 + aac LC · moov 앞 · `/tmp/bjj-lv-<job>` 정리 · 다른 user 폴더 없음.
  B2 같은 행 재분석(실제) → done · video_path 유지 · inode 25093746→25094005(rename 교체).
  B3 재분석인데 저장 실패(임시 이름 자리에 디렉터리 장애물, Claude 스텁) → done · 로그 "영상 저장 건너뜀(S3.5…EISDIR)" · video_path·기존 파일 inode/md5 그대로.
  B4 첫 분석인데 저장 실패(R2=id 74 의 URL, 스텁) → done · video_path NULL · video.mp4 없음.
  API(격리 mini-server :3148, 운영 :3000 미사용): GET 상세에 video_path · `/uploads/...video.mp4` Range → `206 video/mp4 Content-Length 100` · 없는 경로 404 · DELETE 2건 200 → NAS long-videos/·long-video-frames/ 폴더·DB 행·하위 0 · 보관 URL 404.
- (c) 화면: **headless chrome 스크린샷은 못 했다** — 이 환경의 Chrome 147 은 http(s) 내비게이션이 멈춘다(`data:` 는 됨, `https://example.com` 도 멈춤, `ss` 로 보면 소켓을 열지 않음, 샌드박스 밖에서도 동일 — `dry/probe-*.log`). 대신
  `fe/render.js`(jsdom + 작업트리 소스 esbuild IIFE + **실제 mini-server API·DB 행**) **PASS 28 / FAIL 0**: video_path 있음 → `<video>`(src·controls·playsinline·preload=metadata, 상자 style 이 iframe 상자와 글자 그대로 같음) · 시간 라벨/프레임 클릭 → currentTime(0·99)+play · 하이라이트 · readyState 0 → loadedmetadata 에서 1회 적용 · error 이벤트 → iframe(jsapi embed) 폴백 후 seek 은 기존 postMessage · NULL → iframe · 열린 화면 재조회(GET +1 확인) 뒤에도 iframe 유지 → 재진입 시 `<video>`.
  `fe/neg-control.sh` **탐지 6 / 미탐지 0**(고정 제거·onError 제거·`<video>` 분기 제거·대기 지점 미적용·readyState 무시·video_path 무시를 심으면 각각 겨냥 검사가 FAIL).
  `media-check.js`(Chrome `data:` 페이지에 **실제 보관 파일**을 Blob 으로) **PASS 4/4**: loadedmetadata(readyState 4, 1280x720, 131.54s) · seek 60s → seeked · play 2.5s → currentTime 60→62.46, 디코딩 프레임 227.

**못 한 검증·사유**
- 실브라우저 화면 스크린샷·실제 `<video>` 404 → onError 연쇄: Chrome http 내비게이션 불가(위). 404 응답은 curl 로, onError → 폴백은 jsdom 이벤트로 나눠 확인했을 뿐 한 브라우저에서 이어서 보지 못했다.
- 안드로이드 WebView·실기기 재생, 전체화면 버튼 동작: 미검증.
- 파이프라인 수준의 "S3.5 복사 도중 취소"(단위 테스트에서만 실제 스트림 중단 확인), 3시간급 영상 저장 시간, 재저장 rename 순간 재생 중인 사용자의 끊김 여부: 미검증.
- B1·B2 실분석이 이번엔 챕터 1개로 나와 챕터 시간 라벨 seek 대상이 0초였다 — 0 이 아닌 이동은 프레임 썸네일(99초)과 media-check(60초)로 확인.

**발견한 기존 결함 (이번 범위 밖 — Leader 판단 요청, 수정하지 않음)**
- 1회차 B4 가 S3 에서 `SequelizeConnectionAcquireTimeoutError: Operation timeout` 으로 error 종료(스택: 다운로드 직후 `isJobCanceled` :661, S3.5 진입 전 — `runs/run1-b4-pool-timeout.log`). 원인 [가능성 높음]: `runPipeline` S3 의 `onProgress`(2026-08-24 `9ab7f591` 부터)가 yt-dlp 진행 줄마다 `updateJob` 을 await 없이 날려 풀(max 10)을 밀어낸다. 같은 영상 실측 진행 줄: 옛 포맷 111줄 / 새 포맷 90줄(`probe/progress-lines.txt`) → **이번 포맷 변경이 키운 것은 아니다**. 영상이 길수록 줄 수가 늘어 실제 분석이 "Operation timeout" 으로 실패할 수 있고, 운영에선 같은 풀을 API 요청도 쓴다. 제안: 진행 기록을 "진행 중 1건 + 2초 간격"으로 묶기(화면 폴링이 5초라 표시 차이 없음). 2회차는 같은 하네스로 FAIL 0.

**미해결·확인 요청**
- 진행 패널(`StudyProgressPanel.jsx` STAGE_LABEL)에 S3.5 가 없어 저장 단계 동안 우측에 `S3.5` 가 그대로 보인다(기존 S10 도 같은 상태). 새 문구 금지·다른 파일 무수정 지시라 손대지 않음 — 넣을지는 Leader/designer 결정.
- 보관 영상 URL 은 기존 `/uploads`(프레임·clip-videos 와 같은) 정적 경로라 인증 없이 URL 로 받을 수 있다 — 기존 방식 그대로이며 새 위험 종류는 아님.
- 테스트로 long_videos AUTO_INCREMENT 75~82 를 소비(행은 전부 삭제) — 다음 운영 id 는 83 부터.

**잔여물 정리 확인** (run2 출력)
- user 1: t048 행 0 · 고아 jobs/chapters/techniques 0 · NAS `users/1` 폴더 자체 없음(작업 전과 동일) · `/tmp/bjj-lv-*` 0 · `/tmp/t048-*` 0 · 3148·9348 닫힘.
- user 3 long_videos 전/후 = `8 / NULL 8 / md5 0d0f10a2720cd98ddcb79e2e69f57cad`(id·status·video_path·updated_at) **동일** · 운영 pm2 `bjj` pid 45899·restarts 1 그대로.
- 1회차 중단 시 남은 `/tmp/bjj-lv-e2161f00…`(자막 2개)는 확인 후 삭제, 하네스는 이후 잡 id 를 먼저 기록해 중단돼도 정리되게 고침.

**QA 인계**
- 전부: `bash /home/brownjeon/.node-local/bjj-backup/task-048-20261007-234656/harness/run-all.sh` → 마지막 줄 `run-all: FAIL 0`. 단계별: `node unit-persist.js` · `node e2e.js create <url> 't048 …'` / `node e2e.js run <id> [--stub] [--obstacle]` · `node mini-server.js`(:3148) 후 `node fe/render.js <R1> <R2>` · `bash fe/neg-control.sh <R1> <R2>` · `node media-check.js <mp4>` · 끝나면 `bash cleanup.sh`.
- 수동 확인용(mini-server 기동 후, 토큰 `token.admin` = user 1):
  `curl -s -H "Authorization: Bearer $(cat token.admin)" http://127.0.0.1:3148/api/long-videos/<R1> | grep -o '"video_path":"[^"]*"'` → `/uploads/users/1/long-videos/<R1>/video.mp4`
  `curl -s -D - -o /dev/null -H 'Range: bytes=0-99' http://127.0.0.1:3148/uploads/users/1/long-videos/<R1>/video.mp4` → `206` · `video/mp4` · `Content-Length: 100`
  `curl -s -X DELETE -H "Authorization: Bearer $(cat token.admin)" http://127.0.0.1:3148/api/long-videos/<R1>` → `{"success":true,…}` 후 같은 영상 URL → `404`, NAS `users/1/long-videos/<R1>` 없음.

### Developer 후속 수정 (2026-10-08, Leader 검토 요청 2건)

- [07:57] 후속 2건 구현 · `run-all.sh` 3회차 **FAIL 0**(`runs/run3-20261008-followup-pass.log`). 유지 결정(플레이어 진입 시 1회 결정·분석 중 삭제 가드)은 손대지 않음. 커밋·push·pm2·배포 없음.

**변경 (+31/−5, 2파일 추가 수정)**
- `backend/src/services/longVideoPipeline.js` — `makeDownloadProgressReporter(jobId, {write, minIntervalMs, now})`(:93, export) 추가. 규칙: (a) 진행 중 기록이 있으면 새로 안 보냄 (b) 마지막 **성공** 기록 후 2초 미만이면 건너뜀 (c) 실패는 `.catch` 로 무시(실패는 성공이 아니라 다음 줄에서 바로 재시도) (d) 정규식 `/(\d{1,3}\.\d)%/`·문구 `영상 다운로드 중 (NN.N%)`·`updateJob(jobId, { detail })` 호출 형태 그대로 (e) `updateJob`/`updateStage` 시그니처 무변경. `runPipeline` S3 는 `onProgress: downloadProgress`(:660) 로 바꾸고, 다운로드 실패 경로(:667)와 성공 직후(:684)에 `await downloadProgress.idle()` — 늦게 끝난 진행 기록이 "목차만 제공"/S3.5 의 detail 을 덮지 않게(아래 W4 로 확인). `write`·`minIntervalMs`·`now` 는 테스트 주입용, 파이프라인은 기본값.
- `web/src/components/StudyProgressPanel.jsx` — STAGE_LABEL 에 `'S3.5': '영상 서버 저장'` 한 줄(S3 와 S4 사이, 'S2.5' 와 같은 따옴표 키 형식). diff 1줄, 다른 변경 없음.
- 진행 문구 소비처 확인: `StudyProgressPanel.jsx:51`·`StudyVideoPage.jsx:324` 는 `job.detail` 을 그대로 표시만 한다(파싱 없음), `progress` 컬럼은 진행 기록이 건드리지 않는다 → 갱신 간격만 2초로 바뀌고 화면 폴링(5초)과 충돌 없음.

**검증 (하네스 같은 폴더, 전부 `run-all.sh` 에 편입)**
- `unit-throttle.js` **PASS 15 / FAIL 0**: 한 틱 700 chunk → write 1회·동시 1 · 가상 10초 500 chunk(20ms 간격) → 5회·동시 1 · 앞 건 미완료면 가상 50분 동안 1회 · 실패(reject·동기 throw) → unhandledRejection 0, 다음 chunk 즉시 재시도 · 퍼센트 없는 줄 0회 · 문구/jobId/fields 형식 그대로(45.3%·100.0%) · idle() 순서 · 시그니처·배선 소스 대조.
- `wire-throttle.js`(실제 `runPipeline` + 실제 DB user 1 행, yt-dlp 만 가짜 — 10ms 간격 진행 줄 500개 후 다운로드 실패) **PASS 4/4**: "영상 다운로드 중" UPDATE **3건**(5.2초)·동시 최대 **1**·done("다운로드 실패 — 목차만 제공")·최종 detail 덮어쓰기 없음.
- `throttle-neg.sh` **탐지 5 / 미탐지 0** — 되돌린 사본(NR: S3 를 예전 인라인 람다로)에서 같은 500줄이 **UPDATE 500건·동시 최대 485** → 파이프라인 `status=error, detail="Operation timeout"`(1회차 B4 와 같은 증상을 결정적으로 재현). NA(동시 1건 규칙 제거) → T1 calls=500 max=500, NB(2초 규칙 제거) → T1 calls=2·W1 13~15건.
- 396초 영상(qrH7M3O6ZhE, 1회차에 timeout 났던 B4 구성: user 1 새 행·첫 분석·Claude 스텁·S3.5 저장 실패 장애물) `b4-repeat.sh` **2회 연속 통과를 두 번**(단독 실행 `runs/b4-repeat/run1.log·run2.log` — R=86·87, 그리고 3회차 run-all 안에서 R=91·92): 매 회 job done/S10 "구간 분석 완료 (1/1 성공)" · 로그 `Operation timeout`/`AcquireTimeout` 0건 · 진행 UPDATE `{"n":1,"maxConcurrent":1}` · S3.5 건너뜀·video_path NULL · /tmp 정리 · 회차마다 잔여물 0. 대조: `runs/run1-b4-pool-timeout.log` 는 같은 구성에서 `ConnectionAcquireTimeoutError … longVideoPipeline.js:661`(4줄). 3회차 run-all 의 B4 도 done.
  [가능성 높음] 원인 제거 근거는 위 배선·되돌림 대조(500→3건)다 — 실 영상 2회 통과만으로는 간헐 결함의 소멸을 증명하지 못한다(이번 실 다운로드는 2초 안에 끝나 진행 기록이 1건뿐이었다).
- `fe/render.js` c7 추가 → **PASS 32 / FAIL 0**: R2 에 S3.5 running 잡을 잠깐 넣고 상세를 열면 패널 우측 라벨 `영상 서버 저장`(원시 `S3.5` 아님)·상세 `영상 서버에 저장 중` → 그 잡 행 삭제 확인. `fe/neg-control.sh` **탐지 7 / 미탐지 0**(N7 라벨 제거 → c7 이 `["S3.5", …]` 로 FAIL).
- 3회차 나머지: 문법·vite build·unit-persist 45·B1~B4·API·media-check 4/4·DELETE 전부 PASS.

**정리 확인 (3회차 출력)**
- user 1 t048 행·고아 0 · NAS `users/1` 없음(작업 전과 동일) · `/tmp/bjj-lv-*`·`/tmp/t048-*` 0 · 3148·9348 닫힘 · 되돌림 사본 `negbe/` 삭제(로그는 `runs/throttle/`).
- user 3 long_videos 전/후 `8 / NULL 8 / 0d0f10a2720cd98ddcb79e2e69f57cad` **동일** · 운영 `bjj` pid 45899·restarts 1 그대로.
- 정정: 테스트가 소비한 long_videos AUTO_INCREMENT 는 75~94(행은 모두 삭제) — 다음 운영 id 는 **95** 부터(앞 줄의 "83" 은 후속 테스트 전 값).

### Developer 후속 2차 수정 (2026-10-08, REV-048-1 반영 3건 — M-1·L-1·L-5)

- [09:01] 3건 구현 · `run-all.sh` 4회차 **FAIL 0**(`runs/run4-20261008-review-pass.log`, FAIL·MISS 줄 0). 이 3건 외 코드 변경 없음. 프론트 무변경. 커밋·push·pm2·배포 없음.

**변경 (+50/−1, 2파일)**
- A [M-1] `backend/src/services/longVideoPipeline.js` — 순수 함수 `buildVideoSaveWarning({ hadVideoPath, outcome })`(:420, export). 경고는 **이번 실행 시작 때 video_path 가 비어 있고**(`hadVideoPath = !!video.video_path`, :599) S3.5 결과가 "저장 실패" 또는 "파일 저장·video_path 기록 실패"일 때만. 취소·분석 중 삭제·저장 성공·기존 저장본 있음·S3.5 결과 없음 → `null`. 문구 = `영상을 서버에 저장하지 못했습니다(<사유>) — 유튜브에서 영상이 삭제되면 재생할 수 없습니다. 재분석하면 다시 저장을 시도합니다.` 사유는 한 줄로 접고 120자로 자르며, **서버 내부 경로는 마지막 이름만 남긴다**(예: `open 'video.mp4.tmp-…'` — `/home/…` 이 화면에 나가지 않게; 지시 문구 형식은 그대로). S3.5 블록은 각 분기에서 `saveOutcome` 만 기록하고, 최종 완료가 `LongVideo.update({ status: 'done', error: saveWarning })`(:912 — 경고 없으면 예전처럼 null). "S3 다운로드 실패 → 목차만 제공" 경로·문구는 무변경. 상세 화면은 기존 `status==='done' && error` amber 카드로 보여 준다(목록 화면은 error 를 표시하지 않음 — 상태 태그만, 확인).
- C [L-5] 같은 파일 — rename 성공 뒤 `LongVideo.update({ video_path })` 만 별도 `try/catch (pathErr)`(:734): 로그 `video_path 기록 실패(파일은 저장됨: <경로>, 분석은 계속)`, `saveOutcome = { saved:true, recorded:false, reason:'video_path 기록 실패: …' }` → A 의 경고 대상.
- B [L-1] `backend/src/services/storage.js` — `assertLongVideoId`(:73): `getLongVideoDir`·`longVideoWebPath` 의 userId·videoId 가 null 이면 기존 문구로, **정수 숫자(안전 정수·0 이상) 또는 `/^\d+$/` 문자열**이 아니면 throw. 배열 `[5]`(문자열화하면 "5")·`true`·전각 숫자도 거부. `getLongVideoFramesDir` 등 기존 함수 무수정. 호출부 확인: 파이프라인 `job.user_id`·`video.id`(DB INT → number), DELETE `uid`(JWT `userId` = `users.id`)·`video.id`(DB) — 모두 정수라 동작 변화 없음(4회차 B1~B4·DELETE PASS).

**검증 (전부 `run-all.sh` (a3) 에 편입)**
- `unit-warning.js` **PASS 12/12**: 경고 있음(첫 분석 저장 실패·기록 실패·사유 없음 → "알 수 없는 오류") / 없음(성공·취소·삭제·기존 저장본 있음 ×2·outcome 없음) / 경로 축약·120자·공백 정리.
- `unit-persist.js` **PASS 50/50**(+5): 악성·비정수 18종 × (userId, videoId) 위치 = 36건씩 두 함수 모두 throw(`''`·`'../..'`·`'../../..'`·`'1/2'`·`'12/../../x'`·`-1`·`1.5`·`'1e3'`·`'-1'`·`' 1'`·`'1 '`·`'abc'`·`NaN`·`Infinity`·`true`·`[5]`·`{id:5}`·`'１'`) · 정상(1/42·'1'/'42'·0/7·'3'/99900001) 통과 · `persistVideo(…, '../..')` throw·폴더 안 만듦.
- `wire-warning.js`(실제 `runPipeline` + 실제 DB user 1 행, 네트워크·Claude 없이 로컬 20초 h264/aac 픽스처) **PASS 13/13**: W-a 첫 분석·저장 강제 실패 → done·S10·챕터 전부 done·**error = 경고(EISDIR, `/home/` 없음)**·video_path NULL · W-e 같은 행 재분석 성공 → **error NULL**·video_path 기록 · W-b 정상 → error NULL · W-c 재분석·이번 저장 실패·기존 저장본 있음 → **error NULL**·video_path·inode 그대로 · W-d 기록 실패 → 파일 있음·video_path NULL·경고 사유 "video_path 기록 실패"·로그 `video_path 기록 실패(파일은 저장됨`·`영상 저장 실패(S3.5` 없음.
- `warning-neg.sh` **탐지 6 / 미탐지 0**: NW1 경고 함수 항상 null → unit·wire FAIL · NW2 최종 완료를 `error: null` 로 → W-a FAIL · NW3 `hadVideoPath=false` 고정 → W-c FAIL(재분석에 경고) · NW4 `catch (pathErr)` 에서 다시 던짐(L-5 이전) → W-d 로그 FAIL · NS storage 정수 검사 제거 → L-1 FAIL(`[1,""] → …/users/1/long-videos`).
- 실 E2E(4회차 run-all): B1 정상 → `video.error` **null** · B2 재분석 → null · B3 기존 저장본 있는 재분석의 저장 실패 → null · **B4 저장 강제 실패 → `영상을 서버에 저장하지 못했습니다(EISDIR … 'video.mp4.tmp-…')…`·video_path NULL·job S10·챕터 1/1 done**. `b4-repeat`(396초 영상) 2회 연속 통과 + 매 회 경고 기록 확인. 나머지(throttle 15·wire-throttle 4·throttle-neg 5/0·fe-render 32·neg-control 7/0·media-check 4·API·DELETE) 전부 PASS.

**정리 확인 (4회차 출력)**
- user 1 t048 행·고아 0 · NAS `users/1` 없음 · `/tmp/bjj-lv-*`·`/tmp/t048-*` 0 · 3148·9348 닫힘 · 결함 사본 `negbe/<이름>` 삭제(로그만 `runs/review-neg/`).
- user 3 long_videos 시작(`u3-before-rev.txt`)·전·후 `8 / NULL 8 / 0d0f10a2720cd98ddcb79e2e69f57cad` **동일** · 운영 `bjj` pid 45899·restarts 1 그대로.
- 테스트가 소비한 long_videos AUTO_INCREMENT: 지금 **135**(행은 모두 삭제).

### Developer 3차 수정 (2026-10-08, REV-048-3 ADOPT — persistVideo 임시 파일 처리)

- [10:08] 구현 · `run-all.sh` 5회차 **FAIL 0**(`runs/run5-20261008-rev3-pass.log`, FAIL·MISS 줄 0). 변경은 `persistVideo` 와 상수부뿐(워커·라우트·storage·프론트·ytdlp 무변경). 하네스는 중단·kill 없이 끝까지 돌렸다. 커밋·push·pm2·배포 없음.

**변경 (`backend/src/services/longVideoPipeline.js`)**
- 상수 `PERSIST_STALE_TMP_MS = 10 * 60 * 1000`(:288).
- 임시 이름(:352) = `` `${PERSIST_TMP_PREFIX}${jobId}-${process.pid}-${crypto.randomBytes(4).toString('hex')}` `` — 같은 jobId 가 겹쳐 돌아도 서로 다른 파일에 쓴다. 접두사 `video.mp4.tmp-`·`jobId` 옵션 유지.
- 정리(:388-397) = 접두사로 시작하는 항목만 `fs.stat` → `Date.now() - mtimeMs > PERSIST_STALE_TMP_MS` 인 것만 `fs.rm(force)`, stat/rm 실패 무시. 접두사가 다른 파일·`video.mp4` 는 대상이 아니다. 내 jobId 라고 임계를 짧게 두지 않음(지시대로).
- 주석: "전부 죽은 실행의 잔재" 가정 → "같은 잡이 겹쳐 도는 다른 시도의 살아 있는 파일일 수 있어 오래된 것만 지운다. 방금 죽은 잔재는 다음 실행의 정리나 DELETE 가 회수".
- 나머지(finally 의 자기 임시 파일 삭제·`createdDir` rmdir·cancel·크기 검사·rename) 무변경.

**하네스 갱신**
- `unit-persist.js` **PASS 63/63**(+13): 기존 "죽은 잔재 정리"는 `utimes` 로 11분 전으로 만든 뒤 정리 확인. 신규 4b — (a) 11분 된 `video.mp4.tmp-oldjob-…` 삭제 · (b) 1분 된 타 시도 `video.mp4.tmp-otherjob-…` 보존(내용 그대로) · 접두사 다른 60분 된 파일·접두사 디렉터리 보존 · `video.mp4` 는 새 저장으로만 교체 · 이번 시도 임시 파일 0 · (c) **겹친 두 시도**(느린 복사로 창을 넓히고 B 는 A 의 임시 파일이 생긴 뒤 시작) — 같은 jobId·다른 jobId 각각 **둘 다 saved**·최종 `video.mp4` md5 = 한쪽 원본·임시 0.
- 장애물 교체: `e2e.js --obstacle`·`wire-warning.js` 는 이제 **대상 폴더를 `chmod 0555`** 로 만들어 S3.5 복사를 `EACCES` 로 실패시킨다(예측 가능한 임시 이름 자리 디렉터리 방식은 고유 접미사로 무력화). 원래 권한을 기억해 실행 직후·`finally`·`exit`·SIGINT/TERM/HUP 에서 되돌린다. `cleanup.sh` 는 지우기 전에 `chmod -R u+rwx`(안전망). 사전 실측: NAS 마운트에서 0555 폴더에 쓰기 → bash `Permission denied`·node `EACCES`(시험 폴더 99900002 는 즉시 삭제).
- `wire-warning.js` **13/13**(W-a 경고 사유가 `EACCES: permission denied, open 'video.mp4.tmp-…'`, W-c 기존 inode 보존 그대로). `run-all.sh`·`b4-repeat.sh` 에 "장애물 뒤 대상 폴더 쓰기 권한 복원" 검사 추가(B3·B4·b4-repeat 회차마다 PASS, 모드 777 복원).
- `warning-neg.sh` **탐지 8 / 미탐지 0**(+2): **NT1 "접두사 일괄 삭제로 되돌림"** → 4b(b) FAIL + **4b(c) 같은/다른 jobId 모두 FAIL**(A: `ENOENT … stat 'video.mp4.tmp-J1-…'`, B 가 A 의 임시 파일을 지움) · **NT2 "임시 이름을 jobId 만으로 되돌림"** → 4b(c) 같은 jobId FAIL(`복사 크기 불일치`/`ENOENT`). 기존 NW1~4·NS 도 그대로 탐지.
- `overlap-fuzz.sh` + `fuzz-overlap.js`(Reviewer `rev3/fuzz.js` 와 같은 모양 — 40회, 절반 같은 jobId, B 크기 번갈아 +777B, 0~39ms 지연, 128KB 마다 15ms; 실제 모듈을 `/tmp` 대상으로만, NAS·DB 무접촉) — 이번 수정 전으로 되돌린 사본 vs 지금 코드:

  | | 둘 다 저장 | 한쪽만 | 둘 다 실패 | 최종 파일 섞임 | "저장 성공"인데 최종 내용이 남의 것 | 임시 잔여 |
  |---|---|---|---|---|---|---|
  | Reviewer 원본(참고) | 0 | 27 | 13 | 0 | 7 | 0 |
  | 되돌린 사본 (5회차) | 0 | 25 | 15 | 0 | 5 | 0 |
  | **지금 코드 (5회차)** | **40** | 0 | 0 | 0 | 0 | 0 |

  (단독 실행 2회도 0/29/11·0/26/14 → 40/0/0. 되돌린 사본의 실패 사유는 `ENOENT` 40·`복사 크기 불일치` 다수.)
- 5회차 나머지: 문법·vite build·throttle 15·wire-throttle 4·throttle-neg 5/0·b4-repeat 2회 연속(경고·권한 복원 포함)·unit-warning 12·wire-warning 13·B1~B4(B3 기존 inode/md5 보존·경고 없음, B4 경고·S10·챕터 done)·API·fe-render 32·neg-control 7/0·media-check 4·DELETE 전부 PASS.

**새로 생긴 것·남는 것 (Reviewer 3차 (b) 와 같은 판단)**
- 크래시 직후 재개된 같은 jobId 의 이전 부분 파일은 더 이상 즉시 덮어써지지 않고 10분이 지난 뒤 다음 저장 시도나 DELETE 가 회수한다(상한: S3.5 복사 중 크래시 1회당 부분 파일 1개 ≤ 영상 크기). 선택 보완(내 jobId 는 60초)은 지시대로 넣지 않았다.
- 실제 NFS 에서 다른 호스트가 쓰는 파일의 mtime 지연·워커 이중 픽업(`tick`)·reanalyze 경합은 이번 범위 밖(Leader board 기록). 같은 호스트 안의 겹침만 재현했다.

**정리 확인 (5회차 출력)**
- user 1 t048 행·고아 0 · NAS `users/1` 없음 · `/tmp/bjj-lv-*`·`/tmp/t048-*`(퍼즈 `t048-fuzz-*` 포함) 0 · 3148·9348 닫힘 · 남은 harness 프로세스 0 · 결함 사본 `negbe/<이름>` 삭제(로그만 `runs/rev3/`·`negbe/*.log`).
- user 3 long_videos 3차 시작(`u3-before-rev3.txt`)·5회차 전·후 `8 / NULL 8 / 0d0f10a2720cd98ddcb79e2e69f57cad` **동일** · 운영 `bjj` pid 45899·restarts 1 그대로.
- long_videos AUTO_INCREMENT 지금 **194**(테스트 소비, 행은 모두 삭제. 136~155 구간은 이 세션 밖에서 소비된 것으로 보이며 확인하지 못했다).

## 리뷰 기록

### Reviewer (2026-10-08 08:11, REV-048-1)

- [08:11] **판정: PASS-with-notes** — CRITICAL 0 · HIGH 0 · MEDIUM 2 · LOW 9. 차단 결함 없음. 아래 MEDIUM 2건은 코드 결함이 아니라 "의도(유튜브가 사라져도 지장 없게)" 관점의 보증 공백이라 Leader 판단 사항이다. 코드 수정은 하지 않았다(감사 전용).
- [08:11] **데모 게이트**: `check.mjs check` → `DEMO_GATE_PASSED`(status=waived). `evidence.jsonl` 26행 kind=waive 의 `transcript_uuid`(0ec7cb36…)가 현재 세션 transcript 의 `origin.kind=human` 메시지 "데모 생략하고 바로 구현해줘"와 일치 — 에이전트 대리 실행 흔적 없음. 승인 데모가 없어 데모 대비 차이 분류는 해당 없음; 구현은 설계(같은 sticky 16:9 칸 교체, 표식 문구 없음)와 일치. 진행 패널 라벨 `영상 서버 저장`은 waive 범위 밖 사용자 가시 문구 1개(Leader 승인 후속) — implementation 급으로 허용, 기록만.
- [08:11] **직접 확인한 것**: ① 7개 파일 diff 전체 + 주변(longVideoPipeline.js 전체 흐름·worker·routes 전 라우트·index.js `/uploads` 마운트·ytdlp.js 전체·storage.js 전체·StudyVideoDetailPage 전체·StudyProgressPanel). ② `unit-persist.js` **PASS 45/FAIL 0**, `unit-throttle.js` **PASS 15/FAIL 0** 직접 재실행(DB 질의 없음 · NAS `users/1` 임시 폴더는 종료 후 삭제 확인, `/tmp/t048-*` 0, 운영 pm2 `bjj` pid 45899·restarts 1 불변). ③ 내 적대 테스트(스크래치패드 `adv1.js`): 복사 중 폴더 삭제 → `saved:false`·고아 0 / 동시 2실행 → 한쪽 실패·한쪽 저장·최종 크기 일치 / 경로 정규화 시험(아래 L-1). ④ yt-dlp 포맷 체인을 **합성 info.json 으로 오프라인 재현**(`--load-info-json --simulate`): avc1+m4a 있음→`136+140`, avc1 없음→`398+251`(옛 지정), avc1 있고 m4a 없음→옛 지정, avc1 이 1080p 만→옛 지정(`247+140`), 합본 단일→`18` — 폴백 체인 정상. ⑤ 운영 dist(`~/.node-local/bjj-web/dist`, 09-19)·work 사본 무변경. 개발 하네스 로그(`throttle-neg.log`·`wire-throttle.log`·`run1-b4-pool-timeout.log`·`probe/*`)는 개발자 주장과 일치(풀 `max:10, acquire:30000` 확인).
- [08:11] **개발자 보고와 다른 것**: 사실 오류 없음. 사소한 문서 드리프트 1건 — "구현 기록" 의 줄 번호(`freeBytesNear :266`·`copyWithCancel :281`·`persistVideo :311`·S3.5 `:663`)는 후속 수정 전 기준이라 현재 `:291`·`:306`·`:336`·`:688` 이다(동작 무관).

**감사 관점별 결과**
1. user_id 격리·경로 — 통과. 모든 경로가 DB 에서 읽은 `job.user_id`/`video.id`(DELETE 는 `req.user.id` + `findOne({id, user_id})` 로 얻은 `video.id`)로만 만들어지고, 요청 문자열 `req.params.id` 는 경로에 쓰이지 않는다. webPath↔파일 경로 일치(`UPLOADS_ROOT/users/<uid>/long-videos/<vid>/video.mp4` ↔ `/uploads/users/<uid>/…`). 남의 영상 폴더 삭제 불가. 단 함수 자체는 정수성 검증이 없다(L-1).
2. 원자성·보존 — 통과. 임시 이름 복사→크기 일치 검사→취소 재확인→`rename`, 어느 실패 경로에서도 `video.mp4`·`video_path` 불변(단위 45건 + 내 재현). 임시 파일은 `finally` 에서 항상 정리, 빈 폴더는 이번 실행이 만든 경우만 `rmdir`.
3. 경합 — 통과(조건부). DELETE↔S3.5 순서(rename → count → update/rm, DELETE 는 커밋 → rm)가 맞물려 새 고아를 만들지 않는다. 취소는 복사 중 3초 폴링으로 중단. `count`↔`update` 틈은 허용 범위. 실제 NFS 의 열린 파일 unlink(silly-rename) 동작은 확인 못 함(아래).
4. 진행률 스로틀 — 통과. `pending` 이 같은 틱에서 동기 세팅돼 동시 1건이 깨지지 않고, 성공 시각 기준 2초, 실패는 삼키고 다음 줄에서 재시도, `idle()` 은 `finally` 로 `pending=null` 되는 체인 자체를 기다리므로 늦은 기록이 다음 단계 detail 을 못 덮는다. 타이머·리스너 없음 → 취소/예외 시 누수 없음.
5. 파이프라인 무회귀 — 통과. 진행률 S3=35 → S3.5=45 → S4=55 단조. 저장 실패/NULL 이면 S4 이후 코드 경로는 변경 전과 동일(S3.5 는 `try/catch` 로 감싸 분석 계속). S2.5 선저장 챕터·"목차만 제공" 폴백은 건드리지 않고, 폴백 직전 `idle()` 은 오히려 예전의 detail 덮어쓰기 잠재 경합을 없앤다.
6. ytdlp 포맷 — 통과(조건부). 폴백 체인 오프라인 확인(위 ④), `YTDLP_BIN` 만 사용, `downloadVideo` 호출처는 longVideoPipeline 하나뿐(clip 분석 무영향), 프레임 추출(ffmpeg)·전사 무영향. 해상도 저하 경우 존재(L-2).
7. 프론트 — 통과(조건부). hooks 순서 정상(조건부 return 앞에 모두 선언), `<video>`↔iframe 은 서로 다른 분기라 언마운트 시 `videoRef` 가 null 로 정리돼 seekTo 가 iframe 경로로 정상 폴백, `playerPick` 은 id 별 기록이라 id 변경 시 stale 없음(늦은 응답이 이전 id 로 덮는 경우도 다음 load 에서 자가 복구), 폴링 중 `<video>` 리마운트 없음, `lastSeekSecRef`·`activeChapterId` 로직 무변경, `playsInline` 있음. 라벨 1줄 확인. 실브라우저·WebView 는 미확인(아래).
8. 보안 — 새 종류의 위험 없음. `/uploads` 는 인증 없는 정적 서빙(nosniff)이고 `clip-videos`·`long-video-frames` 와 같은 방식. 단 규모가 다르다(L-3). 로그에 민감정보 없음.
9. 범위 준수 — 통과. 백필·유튜브 없는 재분석·스키마 변경 없음. 테스트 주입 옵션(`targetDir`·`marginBytes`·`copyFn`·`cancelPollMs`, 리포터의 `write`·`now`)은 파이프라인 호출에서 전부 기본값. 스로틀(S3 `onProgress`)은 원 설계에 없던 변경이나 Leader 승인 후속이며 근거(풀 고갈 재현)가 로그로 확인됨.

**지적 사항**
- **[MEDIUM] M-1 · longVideoPipeline.js:688-716 · 저장 실패가 사용자에게 보이지 않는다.** 근거: `catch`/`else if (!saved.canceled)` 모두 `console.error` 뿐이고 UI 표식도 없다(설계가 "표식 넣지 않음"+"치명적이지 않음"). 공간 부족·재포장 실패·`video_path` UPDATE 실패 시 사용자는 유튜브에 여전히 의존하는 상태를 모른 채 "서버에 저장했다"고 믿을 수 있다 — 이 task 가 주는 보증이 조용히 깨진다. 설계 준수이므로 결함은 아니다. 권고: 최소한 저장 실패를 `long_videos.error`(done 상태 amber 경고 카드가 이미 있음)나 최종 job detail 에 한 줄로 남기거나, 운영 로그 grep 키(`영상 저장 건너뜀`/`영상 저장 실패`)를 runbook 에 적는다. Leader/사용자 결정.
- **[MEDIUM · 사전 존재·범위 밖] M-2 · longVideoPipeline.js:644 (`saveChapters` at S2.5) · 재분석이 S3 전에 챕터를 전량 교체한다.** 근거: `saveChapters` 가 `LongVideoChapter.destroy` 후 `status:'pending'` 으로 재생성(details·frames 소실)하는데 S3 다운로드보다 앞이다. 유튜브 메타(S1)는 되지만 다운로드만 막힌 경우(yt-dlp 고장·봇 검사·지역 제한) "목차만 제공" 폴백으로 끝나며 기존 S7~S9 분석 결과가 사라진다 — 로컬 저장본이 있어도 쓰지 않는다. 이 task 가 막으려는 시나리오("유튜브 쪽 문제")와 겹친다. Leader 의 "유튜브 없는 재분석 = 별도 task" 범위와 같은 묶음이므로 이번에는 고치지 말고 후속 task 에 "저장본 있으면 S3 를 로컬 파일로 대체 / S2.5 교체를 S3 성공 뒤로" 를 명시할 것을 권고.
- **[LOW] L-1 · storage.js:70-80 · `getLongVideoDir`/`longVideoWebPath` 가 userId·videoId 정수성을 검증하지 않는다.** 재현(내 `adv1.js`): `getLongVideoDir(1,'')`=`…/users/1/long-videos`(상위), `(1,'../../..')`=`UPLOADS_ROOT`, `(1,'12/../../x')`=`users/1/x`. 호출부가 `fs.rm(..., {recursive:true})` 이므로 오용 시 영향이 크다. 현재는 모든 호출부가 DB 정수만 넘겨 악용 불가(기존 `getLongVideoFramesDir` 도 동일 패턴). 권고: `/^\d+$/` 검증 후 throw(두 함수 함께).
- **[LOW] L-2 · ytdlp.js:202 · avc1 우선이 해상도를 낮출 수 있다.** 재현(오프라인 합성 info): avc1 최대 480p·VP9/AV1 720p 인 영상에서 새 지정=`135+140`(480p), 옛 지정=`398+140`(720p). 개발자 실측은 1개 영상(양쪽 720p)뿐. 권고(오프라인 검증함, 실영상 미검증): `-f 'bv*[height<=720]+ba/b[height<=720]/best' -S 'res:720,vcodec:h264,acodec:aac'` — 해상도 우선 후 같은 해상도 안에서 h264/aac 선호(합성 3건에서 136+140 / 247+140 / 247+140). 실영상에서 avc1 이 720p 미만인 비율은 [추측: 드묾].
- **[LOW] L-3 · index.js:29 `/uploads` · 인증 없는 정적 서빙 + 순차 정수 URL.** `/uploads/users/<uid>/long-videos/<vid>/video.mp4` 는 uid·vid 가 작은 정수라 열거가 쉽고, 이제 클립이 아니라 강의 원본 전체(저작권 있는 유튜브 콘텐츠)가 포함된다. DB 의 user_id 격리가 파일 계층에서는 없다. 기존 `clip-videos` 와 같은 종류라 이번 변경이 새 종류를 추가하진 않는다(`<video src>` 는 Authorization 헤더를 못 실어 정적 서빙이 구조적 선택). 권고: 알려진 수용 위험으로 vault 에 기록하고, 필요해지면 쿠키/서명 URL 방식을 별도 task 로.
- **[LOW] L-4 · longVideoPipeline.js:336-428 · 임시 파일 정리는 "워커 단일" 전제.** 폴더의 `video.mp4.tmp-*` 를 전부 죽은 잔재로 보고 지운다. 블루/그린 겹침 구간(구·신 프로세스 워커 동시 실행, 부팅 시 `resumeInterruptedJobs` 가 `running` 을 전부 requeue 하는 사전 존재 동작)에서는 상대의 살아 있는 임시 파일을 지울 수 있다. 내 재현(동시 2실행): 한쪽 `saved:false`(ENOENT), 한쪽 저장, 최종 파일 크기 일치 — 손상 없이 한쪽 저장만 건너뜀. [추측: 실제 겹침 발생 빈도는 낮음]
- **[LOW] L-5 · longVideoPipeline.js:705 · 파일은 저장됐는데 `video_path` UPDATE 가 실패하면** 바깥 `catch` 가 "영상 저장 실패"로 로그만 남겨 사실(파일 있음/경로 없음)과 어긋난다. 다음 재분석이 덮어쓰고 DELETE 가 폴더를 지우므로 영구 고아는 아니다. 권고: 로그 문구 분리 또는 UPDATE 1회 재시도.
- **[LOW · 사전 존재] L-6 · routes/longVideos.js:288-298 · 분석 중 DELETE 는 잡을 멈추지 않는다.** 잡 행이 지워져 `isJobCanceled` 가 false 라 파이프라인이 끝까지 돌아 챕터 행(FK 없음)·`long-video-frames` 를 고아로 남긴다. 개발자 가드는 새 저장소(S3.5)만 보호한다. 권고: DELETE 시 진행 잡을 먼저 취소하거나 파이프라인이 행 존재를 주기적으로 확인(후속).
- **[LOW] L-7 · StudyVideoDetailPage.jsx:167-170 · `onError` 폴백이 영구적이다.** 일시적 네트워크 오류 한 번에도 그 영상은 재진입 전까지 iframe 으로 고정되고, 재분석 중 파일이 교체돼 Range 불일치로 `error` 가 나도 같다(자가 복구 방향이라 허용). 폴백 직후 첫 챕터 클릭은 `pendingSeekRef` 를 비워 유실된다.
- **[LOW] L-8 · StudyVideoDetailPage.jsx:199 · `<video>` 에 `aria-label`/`title` 이 없다**(기존 iframe 도 없음 — 일관성 유지로 보면 허용).
- **[LOW] L-9 · 롤백/NFS 관련.** (a) 직전 릴리스로 롤백하면 구버전 DELETE 가 `long-videos` 폴더를 지우지 않아 고아가 생긴다(코드만 롤백, NAS 파일·`video_path` 는 남음 — 구 프론트는 `video_path` 를 무시해 화면은 안전). (b) S3.5 에는 전체 타임아웃이 없다 — NAS 가 멈추면 단일 워커가 묶인다(S7 도 NAS 의존이라 사전 존재 의존성, [추측]).

**확인하지 못한 것 (PASS 로 쓰지 않음)**
- 실브라우저·안드로이드 WebView 재생, 전체화면, `<video>` 404→onError→iframe 연쇄(개발자도 미검증): **미확인**. jsdom 하네스(`fe/render.js` 32건·neg-control 7건)는 로그만 읽었고 재실행하지 않았다(미니서버·DB 필요).
- `run-all.sh`·`e2e.js`·`wire-throttle.js`·`throttle-neg.sh`·`b4-repeat.sh`(실 yt-dlp·Claude·DB 쓰기): 지시대로 **재실행하지 않음** — 로그로만 대조했다.
- 실제 NFS 위에서 (a) 복사 중 DELETE 의 `rm -rf` 가 만드는 `.nfsXXXX`(silly-rename) 잔재와 `rmdir` 결과, (b) 재생 중인 파일의 `rename` 교체 순간 끊김: **미확인**(내 재현은 로컬 ext4 /tmp).
- 3시간급 영상 저장 시간, 실영상에서 avc1 이 720p 미만인 비율, 모바일 기기 H.264 재생: **미확인**.
- Codex 검토: 이 시점에 task 이력서 `## Codex 검토` 절이 없다(C2 는 이 PASS 직후) → 판정할 지적 없음.

**QA 에 넘기는 high_risk_areas**
1. `backend/src/services/longVideoPipeline.js:688-716` — S3.5 와 DELETE/취소 경합(복사 중 DELETE, 복사 중 취소, rename 직후 DELETE) 후 NAS `users/<uid>/long-videos/<id>` 와 `video_path` 정합. 실 NFS 에서.
2. `backend/src/services/longVideoPipeline.js:336-428` — `persistVideo` 실패 경로(공간 부족·rename 실패)에서 기존 `video.mp4` inode/내용 보존, 임시 파일 0.
3. `backend/src/services/longVideoPipeline.js:93-109,663-684` — 스로틀: 실 DB 지연에서 detail 이 `영상 다운로드 중 (NN.N%)` → `영상 서버에 저장 중` 순으로 끝나는지.
4. `web/src/pages/StudyVideoDetailPage.jsx:48-58,102-118,164-209` — 실브라우저·WebView: 시간 라벨/프레임 클릭 이동, 메타데이터 전 클릭, 404 시 iframe 폴백, 첫 분석 도중 상세 열람 중 재생 끊김 없음, 재진입 시 `<video>`.
5. `backend/src/services/ytdlp.js:202` — 실영상 2~3개(특히 최신 업로드)에서 선택된 포맷·해상도 ≥ 이전 지정과 같은지(L-2).
6. `backend/src/routes/longVideos.js:295-298` — 타 유저 영상 DELETE → 404 이며 타 유저 폴더 불변.
7. 회귀: 저장 실패(NAS 권한/공간)에서도 S4~S10 이 끝까지 가는지, 재분석에서 기존 저장본 보존, DELETE 후 `/uploads/…/video.mp4` 404.

### 재감사(2차) (2026-10-08 09:06, REV-048-2 — REV-048-1 의 M-1·L-1·L-5 반영분만)

- [09:06] **판정: PASS-with-notes** — 신규 CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 4. 요청한 변경분(M-1 경고 · L-1 id 검증 · L-5 기록 실패 분리)은 의도대로 동작하고 REV-048-1 의 해당 3건은 **해소**로 본다. 변경은 `longVideoPipeline.js`(`buildVideoSaveWarning` :420 · `hadVideoPath` :599 · `saveOutcome` :712-752 · 최종 갱신 :912-913)와 `storage.js`(`assertLongVideoId` :73)뿐이고 프론트(`git diff web` 57+2줄)는 1차 감사 때와 같다. 이번 요청 범위 밖이라 **상태가 바뀌지 않은 1차 지적**: M-2(사전 존재·후속 task)·L-2·L-3·L-4·L-6~L-9.
- [09:06] **직접 확인한 것**: ① 변경분 코드 전체 읽음(hunk 목록으로 보고되지 않은 변경 없음 확인 — 파이프라인 hunk 10개 모두 설명 가능, `persistVideo` 본문·S3 폴백 경로 무변경). ② 재실행(전부 DB 질의 없음): `unit-warning.js` **12/0**, `unit-persist.js` **50/0**(1차 45 → +5 L-1), `unit-throttle.js` **15/0** — 종료 후 `/tmp/t048-*` 0·NAS `users/1` 없음. `wire-warning.js`(DB 쓰기)·`warning-neg.sh`·`run-all.sh`·E2E 는 지시대로 **돌리지 않았다**(로그만 읽음). ③ 내 적대 테스트(스크래치패드 `adv2.js`, 순수 함수·문자열만): id 입력 29종 매트릭스 + 경고 사유 11종 + 경고 조합 8종. ④ grep: 목록/상세/타 소비처의 `error` 사용처, `getLongVideoDir`·`longVideoWebPath` 호출부 전부, JWT 서명부.
- (a) **경고 발생 조건 — 통과.** 경고는 `hadVideoPath=false` 이고 outcome 이 "저장 실패" 또는 "저장됐으나 video_path 기록 실패"일 때만 나온다(조합 표 8건 전부 기대와 일치). null 인 경로: 정상 저장+기록 / 취소(`saved.canceled`) / 분석 중 삭제(첫 `count` 0 · 저장 후 `count` 0 두 곳 모두 `deleted:true`) / `hadVideoPath=true` 재분석(저장 실패·기록 실패 둘 다) / outcome 없음(S3.5 미도달 — 그 경로들은 최종 갱신에 닿지도 않는다). 1차에서 빠뜨린 경로 점검: ㉠ 바깥 `catch`(:749) → `{saved:false, reason}` → 경고(첫 `count` 실패 = 실제로 저장 안 됨, 정확) · 저장 후 두 번째 `count` 실패 = 파일은 있으나 `video_path` NULL → 경고가 사실과 맞다(로그 문구만 "저장 실패"로 부정확, 영향 없음). ㉡ 서버 재시작으로 재개된 잡: 이전 실행이 저장+기록까지 했으면 `hadVideoPath=true` → 경고 없음(정확), 기록 전에 죽었으면 false → 다시 저장 시도. ㉢ `{saved:true}`(recorded 누락)는 경고로 간주 — 안전 쪽. ㉣ 경고 이후 단계에서 파이프라인이 예외로 끝나면 바깥 `catch` 의 `status:'error', error: e.message` 가 덮는다(빨강 카드, 정상). 최종 갱신이 유일한 쓰기이고 이전 `error` 는 실행 시작(:595)과 `enqueueJob` 이 이미 null 로 비운다.
- (b) **`done` + `error` 충돌 — 없음.** 소비처 grep: `StudyVideoDetailPage.jsx:241` `!active && status==='done' && error` → amber 카드(기존 "목차만 제공" 경로가 이미 같은 조합을 쓴다)만. `StudyVideoPage.jsx`(목록)는 `v.error` 를 읽지 않고 `STATUS_LABEL`/태그색만 쓴다(:14,:327 — done=accent 그대로). `StudyChapterCard.jsx:100` 은 챕터 `chapter.error`(별개). 백엔드는 `long_videos.error` 를 읽는 다른 코드 없음(`importSearch.js` 는 챕터만 조인, `research.js` 무관). 재분석 시작: `enqueueJob`(`error:null`)·`runPipeline` 시작(`error:null`)이 모두 비우고, 상세 화면은 `active` 동안 카드를 숨긴다. S3 폴백 경고와 S3.5 경고는 같은 실행에서 동시에 날 수 없다(폴백은 `return` 으로 S3.5 앞에서 끝남). 길이는 문구 약 70자 + 사유 ≤120자라 TEXT 컬럼·카드 줄바꿈에 문제없음.
- (c) **사유 경로 노출 — 통과(알려진 한계 1).** 정규식 `/\/(?:[^\s'"/]+\/)+([^\s'"/]+)/g`: 풀 NAS 경로 2개가 든 `rename 'a' -> 'b'` 오류 → `rename 'video.mp4.tmp-abc' -> 'video.mp4'`, `mkdir '/…/95'` → `mkdir '95'`, ffmpeg `/tmp/bjj-lv-1234/src.webm:` → `src.webm:`, 괄호 속 경로·끝이 `/` 인 경로·스택 줄 경로 모두 `/home/`·`/tmp/` 잔존 0. 120자: 300자 입력 → 사유 정확히 120자, 줄바꿈·연속 공백 한 칸. 한계: ① 디렉터리 이름에 공백이 있으면 일부 조각이 남는다(`/mnt/NAS share/…` → `NAS sharevideo.mp4`) — 이 서버의 업로드 루트에는 공백이 없어 실영향 없음. ② 경로가 아닌 내부 정보(예: 오류 메시지의 `ECONNREFUSED 10.1.2.3:3306` DB 주소)는 걸러지지 않는다 — 기존 빨강 카드(`error: e.message`)와 같은 노출 수준이라 새 위험 종류는 아님. ③ `.slice(0,120)` 는 UTF-16 단위라 이모지가 걸리면 반쪽이 될 수 있다(오류 메시지에 이모지는 사실상 없음).
- (d) **`assertLongVideoId` — 정상 호출부를 막지 않는다.** 호출부 전수(grep): `routes/longVideos.js:298`(`uid`=`req.user.id`=JWT `userId`, `auth.js` 의 `jwt.sign({ userId: user.id })` 두 곳뿐 → 숫자; `video.id` = DB 행), `longVideoPipeline.js:343·348·740`(`job.user_id` = `SELECT * FROM long_video_jobs`(INT) · `video.id` = Sequelize 인스턴스(INT)). 입력 매트릭스: 허용 = 숫자 `3`·`0`, 숫자 문자열 `'3'`·`'0'`·`'03'`·30자리 숫자 문자열; 거부 = `''`·`'../../..'`·`'1/2'`·`1.5`·`'1.5'`·`'1e3'`·`-1`·`'-1'`·`' 3'`·`'3 '`·`'3\n'`·데바나가리/아랍 숫자·`NaN`·`Infinity`·`2**53`·`10n`·`true`·`{}`·`[]`·`[5]`·`null`·`undefined` — 1차에서 재현한 `getLongVideoDir(1,'')`=상위 폴더·`(1,'../../..')`=`UPLOADS_ROOT` 는 이제 모두 throw. 실제 DB 가 돌려준 타입으로 통과함은 개발 하네스 4회차 로그로 대조(`e2e.js:65` 가 `SELECT * FROM long_video_jobs` 행을 그대로 `runPipeline` 에 넘김 → B1 "영상 저장 완료(S3.5)"·B2 inode 교체 PASS, mini-server DELETE → NAS 폴더 삭제 PASS) — 이 대조는 개발자 로그 읽기이고 나는 DB 를 질의하지 않았다.
- [09:06] **새 LOW 4건 (모두 비차단)**
  - **[LOW] N-1** `longVideoPipeline.js:735` — L-5 경고 사유가 `video_path 기록 실패: …` 로 사용자 카드에 내부 용어(`video_path`)와 영어 오류문이 그대로 보인다. 문구는 Leader/designer 영역(예: "저장 위치를 기록하지 못했습니다") — 기능 무영향.
  - **[LOW] N-2** `longVideoPipeline.js:599` — `hadVideoPath=true` 인데 실제 파일이 없는 경우(NAS 유실·수동 삭제) 재분석의 저장 실패는 경고 없이 조용하다. `<video>` onError 폴백이 있어 화면은 깨지지 않으나 "저장돼 있다"는 표시와 현실이 어긋난다. 필요하면 후속에서 `fs.stat` 로 파일 존재까지 보고 `hadVideoPath` 를 정한다.
  - **[LOW] N-3** `storage.js:73-78` — `'03'`·30자리 숫자 문자열은 허용돼 `long-videos/03` 같은 별개 폴더를 만든다. 경로 탈출은 불가능하나 정수 정본형이 아니다. 필요하면 `/^(0|[1-9]\d{0,17})$/`.
  - **[LOW] N-4** `longVideoPipeline.js:728` — 저장 후 두 번째 `count` 가 DB 오류로 던지면 파일은 저장됐는데 로그가 "영상 저장 실패(S3.5…)" 로 남는다(경고 자체는 정확). L-5 와 같은 종류의 문구 부정확 — `count` 도 `pathErr` 블록 안으로 넣으면 해소.
- [09:06] **개발자 보고와 다른 것**: 사실 오류 없음. "+50/−1" 변경 규모·"목록 화면은 error 를 표시하지 않음"·"배열 `[5]`·전각 숫자 거부"·호출부 타입 주장 모두 직접 대조로 일치.
- [09:06] **확인하지 못한 것**: `wire-warning.js`·`warning-neg.sh`·`run-all.sh`·E2E(DB 쓰기·실 yt-dlp)는 지시대로 재실행하지 않아 로그(`wire-warning.log` 13/0 · `runs/run4-20261008-review-pass.log` FAIL 0)로만 대조했다. 경고 카드의 실제 화면 모습(줄바꿈·색)·실브라우저/WebView 확인 불가(프론트 무변경이라 1차 한계 그대로). 1차 "확인하지 못한 것"(실 NFS 동작·3시간급 영상·모바일 디코딩)도 그대로 열려 있다.
- [09:06] **QA 추가 집중**: `longVideoPipeline.js:912` 최종 `error` 값 — 첫 분석 저장 강제 실패 시 상세 화면 amber 카드에 경고(경로 없음) 표시, 같은 영상 재분석(저장 성공) 후 카드 소멸, 저장본 있는 영상의 재분석 저장 실패는 카드 없음.

### 3차(Codex C2 지적 판정) (2026-10-08 09:25, REV-048-3 — 판정만, 코드 수정 없음)

- [09:25] **판정 요약**: HIGH → **ADOPT-PARTIAL**(중복 실행 전제는 틀림·워커 결함은 DEFER-기존결함, 단 이번 task 가 새로 넣은 `persistVideo` 임시 파일 처리는 채택 — 심각도는 MEDIUM 으로 하향) · MEDIUM → **DEFER-기존결함**(이번 task 에서 고치지 않아도 됨). Leader 선행 분석 (1)(2)(4)는 코드로 확인돼 맞고, (3) 완화안은 재현으로 효과 확인 + 보완 1건(아래 b).
- [09:25] **직접 확인한 것**: ① `longVideoWorker.js` 전체·`routes/longVideos.js:247-260`·`persistVideo`(:336-410). ② 운영 배포 구조: `pm2 jlist` 로 `bjj` 가 `exec_mode=fork_mode`·`instances=1`, `index.js` 에 SIGINT/SIGTERM 핸들러 없음, 매니페스트는 헬스체크 포트 하나·`pm2 startOrReload`(`docs/dev-deploy-workflow.md:53,164`). ③ 재현(스크래치패드 `rev3/` — `build.js` 가 저장소 소스에서 S3.5 블록만 잘라 원본/완화안 사본을 만들고 `repro.js`·`fuzz.js` 가 /tmp 임시 폴더에서만 돌림; 저장소·NAS·DB 무접촉).
- (HIGH-1) **"blue/green 겹침 → 두 프로세스가 같은 잡 실행" 전제는 이 배포에서 성립하지 않는다 [확실].** blue/green 은 릴리스 디렉터리 + `current` 심볼릭 링크 전환이고 프로세스는 pm2 fork 모드 1개라 `reload` 는 정지 후 기동(순차)이다. 설령 겹쳐도 새 프로세스 부팅의 `cleanupStaleTempDirs`(`longVideoWorker.js:28-37`)가 옛 프로세스의 `/tmp/bjj-lv-*` 작업 폴더를 먼저 지워 옛 실행은 S3.5 이전에 이미 깨진다(사전 존재). 중복 실행이 실제로 생길 수 있는 경로는 ⓐ 같은 DB 를 보는 두 번째 백엔드(개발 서버 `npm run dev`가 `index.js:940` 에서 워커를 무조건 기동) ⓑ `tick()` 의 `if (processing) return` 뒤 `await pickNextJob()` 사이 재확인 없음 — 조회가 4초(`POLL_INTERVAL_MS`)보다 길면 두 틱이 같은 잡을 집는다(코드 읽기, 재현 안 함, [가능성 높음]). 둘 다 이번 변경 이전부터 있던 구조다.
- (HIGH-2) **원자적 claim 없음·부팅 시 `running→queued` 전량 복귀는 사실이나 사전 존재 → DEFER-기존결함.** `pickNextJob` 은 `SELECT … WHERE status='queued'` 뿐(`:41-49`), 부팅 reset 은 `:15-25`. 단일 프로세스 설계에서는 올바른 동작이다. 이번 task 의 diff 가 아니므로 여기서 고치지 않는다 — 후속 후보: 조건부 `UPDATE … SET status='running' WHERE id=? AND status='queued'`(affectedRows 1 확인) · `tick()` 에서 await 뒤 `processing` 재확인 · 부팅 reset 을 heartbeat 만료 행으로 한정.
- (HIGH-3) **그러나 "접두사 일괄 삭제 + jobId 만으로 정한 임시 이름"은 이번 task 의 새 코드(`:350`, `:389`)이고 중복 실행 시 피해를 키운다 → ADOPT.** 원본 사본 재현(`repro.js`/`fuzz.js`): 서로 겹친 두 시도 40회(절반은 같은 jobId·원본 크기 번갈아 다름) — **저장 성공 한쪽만 27 · 둘 다 실패 13 · 둘 다 성공 0**, `video.mp4` 가 섞인 손상 파일은 **0건**(원자 rename·크기 검사는 유효), 다만 "저장 성공"이라 보고한 쪽의 원본이 최종 내용이 아닌 경우 7건(실제 중복 실행은 같은 영상이라 내용이 같아 무해하나, 의미상 부정확). 둘 다 실패하면 이번 분석의 저장본이 없다 — 첫 분석이면 경고 카드가 뜨므로 조용하지는 않다(Leader 판단 (2) 맞음). 의도한 설계 주석(`:385-387` "영상당 진행 잡 1개(reanalyze 409)라 … 전부 죽은 실행의 잔재")은 DB 가 강제하는 불변식이 아니다(MEDIUM 참고) — 코드가 그 가정 하나에 기대고 있다.
- (a) **완화안 (3) 은 교차 삭제를 없앤다 — 재현 확인.** 완화안 사본(임시 이름에 `-<pid>-<4바이트 hex>`, 정리는 `mtime` 10분 초과만): 같은 40회 중 **둘 다 성공 40 · 손상 0 · 임시 파일 잔여 0**. 서로 다른 jobId 겹침(S1)도 원본은 A 가 `stat … ENOENT` 로 실패, 완화안은 A·B 모두 저장. 고유 접미사 때문에 새로 생기는 것: ⓐ **하네스 3곳이 깨진다** — `unit-persist.js:91-96` 은 방금 만든 `video.mp4.tmp-dead-job` 이 정리돼야 통과(이제 mtime 을 11분 전으로 `utimes` 해야 함), `e2e.js:63`·`wire-warning.js:44` 의 "장애물"은 예측 가능한 이름 `video.mp4.tmp-<jobId>` 에 디렉터리를 미리 만드는 방식이라 접미사가 붙으면 장애물이 무력화 → 대상 폴더를 `chmod 0555`(정리 전 `0755` 복원)로 읽기 전용으로 만들어 복사를 실패시키는 방식으로 교체(B3 의 "기존 video.mp4 inode/md5 보존" 검사와도 양립). ⓑ `jobId` 주입 규칙은 접두사(`video.mp4.tmp-<jobId>-…`)로 그대로 유지돼 `tmpLeft`(`startsWith('video.mp4.tmp-')`)·run-all 의 `grep -c '^video.mp4.tmp-'` 는 무영향. ⓒ DELETE 폴더 통삭제와의 상호작용 변화 없음(S5 재현: 복사 중 폴더 삭제 → 원본·완화안 모두 `stat ENOENT` 로 실패하고 폴더·임시 파일 0). ⓓ `finally` 의 자기 임시 파일 삭제·`createdDir` rmdir 은 그대로 동작(남의 신선한 임시 파일이 있으면 rmdir 이 ENOTEMPTY 로 실패하는 것은 안전한 방향).
- (b) **오래된 것만 지워도 재시작 잔재는 결국 정리된다 — 단 즉시는 아니다.** 재현 S3: 12분 된 죽은 잔재는 다음 `persistVideo` 가 삭제, 1분 된 타 시도 파일은 보존. 정리 시점은 ① 그 영상의 다음 저장 시도(임계 시간 경과 후) ② DELETE(폴더 통삭제) 중 먼저 오는 쪽. **새로 생기는 누수 1건**: 같은 jobId 로 재개된 잡은 예전엔 같은 이름이라 즉시 덮어써졌지만 이제 방금 죽은 잔재(`tmp-jobR`)가 임계 전까지 남는다(재현 S4: 원본은 폴더에 `video.mp4` 만, 완화안은 `video.mp4.tmp-jobR` 추가로 남음). 상한은 "S3.5 복사 중 크래시 1회당 부분 파일 1개(≤ 영상 크기)"이고 DELETE 로 회수되므로 수용 가능. 줄이고 싶으면 선택 보완: 이번 잡의 접두사(`video.mp4.tmp-<jobId>-`)와 일치하는 파일은 임계를 60초로 낮춘다(살아 있는 복사는 수 ms 마다 mtime 이 갱신되고, 크래시→재기동→S1~S3 재실행은 통상 60초를 넘는다). 필수는 아님.
- (c) **MEDIUM 을 이번 task 에서 고치지 않아도 되는 근거가 코드로 성립한다 → DEFER-기존결함.** `routes/longVideos.js:252-258` 의 `SELECT … LIMIT 1` 과 `enqueueJob`(INSERT)는 사이에 트랜잭션·잠금·고유 제약이 없다(사실, 라우트는 이번 diff 에 없음). 그러나 ⓐ 두 요청이 겹치려면 서버 처리 창(수 ms) 안에 함께 도착해야 한다 — 클라이언트에 자동 재시도 없음(`api/client.js` grep 0건), 버튼에 진행 가드는 없지만 두 번째 탭은 통상 수백 ms 뒤라 첫 요청의 INSERT 가 끝난 뒤 409. ⓑ 설령 잡 2개가 생겨도 같은 프로세스의 워커는 `processing` 으로 한 번에 하나만 돌리므로(`:54-58`) 두 잡은 순차 실행되고 — 앞 잡의 `persistVideo` 가 `rename` 으로 끝난 뒤 뒤 잡이 시작해 임시 파일 교차 삭제가 일어나지 않는다. 부팅 reset 이후에도 같다(둘 다 `queued` 로 돌아가 `created_at` 순서로 순차 처리). 결과는 중복 다운로드·AI 비용과 뒤 잡이 `saveChapters` 로 앞 결과를 다시 만드는 것 정도(사전 존재). ⓒ 뒤 잡은 `hadVideoPath=true` 로 시작해 경고 카드도 만들지 않는다. 단 ⓑ 는 위 ⓑ(`tick` 재확인 누락) 같은 중복 실행 경로가 없을 때만 성립하므로, 완화안 (3)이 적용돼야 "이번 기능에 대한 영향은 중복 비용 수준"이라는 결론이 닫힌다. 후속 후보: `SELECT … FOR UPDATE` 로 `long_videos` 행을 잠근 트랜잭션 안에서 확인+INSERT.
- [09:25] **ADOPT 최소 변경 사양 (developer 용)**
  - 파일: `backend/src/services/longVideoPipeline.js` 의 `persistVideo` 와 상수부만(워커·라우트·storage·프론트 무변경).
  - 1) `:350` 임시 이름 = `` `${PERSIST_TMP_PREFIX}${jobId}-${process.pid}-${crypto.randomBytes(4).toString('hex')}` ``(`crypto` 는 `:8` 에 이미 있음). `jobId` 옵션·`PERSIST_TMP_PREFIX` 는 유지.
  - 2) `:389` 정리 = `PERSIST_TMP_PREFIX` 로 시작하는 파일을 `fs.stat` 해서 `Date.now() - mtimeMs > PERSIST_STALE_TMP_MS`(새 상수 10분)인 것만 `fs.rm(force)`; stat/rm 실패는 무시. 접두사가 다른 파일·`video.mp4` 는 건드리지 않는다.
  - 3) `:385-387` 주석을 "이 폴더의 임시 파일이 전부 죽은 실행의 잔재" 가정 대신 "다른 시도의 살아 있는 임시 파일일 수 있어 오래된 것만 지운다"로 교체. 나머지(`finally` 의 자기 임시 파일 삭제·`createdDir` rmdir·cancel·크기 검사·rename)는 무변경.
  - 검증(하네스): `unit-persist.js:91-96` 죽은 잔재를 `utimes` 로 11분 전으로 만든 뒤 정리 확인 + 신규 3건(11분 된 잔재 삭제 / 1분 된 타 시도 파일 보존 / 겹친 두 시도 → 둘 다 저장·최종 파일이 한쪽 원본과 md5 일치·임시 0) · `e2e.js:63`·`wire-warning.js:44` 장애물을 대상 폴더 `chmod 0555`(정리 전 복원)로 교체해 B3(기존 inode/md5 보존)·B4/W-a(경고 카드)가 그대로 통과하는지 · `warning-neg.sh` 에 "접두사 일괄 삭제로 되돌림" 사본을 추가해 새 겹침 검사가 FAIL 하는지. 재현 스크립트 `rev3/fuzz.js`(원본 27/0/13 → 완화안 40/0/0)를 참고 기준으로 쓴다.
  - 이 변경은 `persistVideo` 안에 한정되므로 수정 후 **Reviewer 부터 재순환**(변경분 확인으로 충분).
- [09:25] **확인하지 못한 것**: 실제 NFS 위 `mtime` 갱신 지연(같은 호스트 프로세스끼리는 클라이언트 캐시로 즉시 반영, 다른 호스트(맥 개발 서버)가 쓰는 파일은 서버 mtime·속성 캐시 최대 약 60초 지연 가능 — 임계 10분이 이를 흡수한다는 추론 [가능성 높음], 재현 안 함). `tick()` 이중 픽업(ⓑ)은 코드 읽기만. 맥에서 개발 백엔드를 운영 DB 로 실제 기동하는지는 확인하지 못했다([추측]). 두 번째 요청 경합(MEDIUM)은 DB 쓰기를 피하려고 재현하지 않았다.

### 4차(3차 수정 재확인) (2026-10-08 10:13, REV-048-4 — 변경분만, 코드 수정 없음)

- [10:13] **판정: PASS-with-notes** — 신규 CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 2. 3차 ADOPT 사양(임시 이름 고유화 + 오래된 것만 정리)이 사양대로 구현됐고, 새 누수·경로 문제는 없다(알려진 누수 1건은 3차 판정에서 예고한 범위 그대로). 하네스 장애물(chmod 0555)의 복원도 보장된다.
- [10:13] **직접 확인한 것**: ① `git diff -- backend/src/services/longVideoPipeline.js` hunk 목록이 이전 라운드와 같은 10개이고 변경은 `persistVideo`(+7줄: 상수 `PERSIST_STALE_TMP_MS`:288 · 임시 이름 :352 · 정리 :387-397)뿐 — 워커·라우트·storage·프론트 무변경, 소스 트리의 다른 파일 수정 없음(`git status` 7개 그대로). ② `tmp-` 전수 grep(저장소 전체, 볼트 제외): 코드에서 이 형식에 의존하는 곳은 `longVideoPipeline.js:287`(접두사 상수) 하나뿐 — `routes/longVideos.js` DELETE(`fs.rm recursive`)·`storage.js`·워커는 이름 비의존(워커 `cleanupStaleTempDirs` 는 `/tmp/bjj-lv-*` 만). ③ 하네스 파일을 읽음: `unit-persist.js`(mtime 조작·4b 신규), `e2e.js`·`wire-warning.js`(chmod 장애물), `cleanup.sh`·`run-all.sh`·`b4-repeat.sh`(trap·복원 확인), `warning-neg.sh`(NT1/NT2), `overlap-fuzz.sh`·`fuzz-overlap.js`. ④ 재실행(DB·NAS 무접촉): Leader 의 run-all 이 같은 NAS 경로(`unit-persist.js` §9 의 `users/1/long-videos/99900001`)를 쓸 수 있어 §9 를 뺀 스크래치 복사본(`rev4/unit-persist-nonas.js`, 나머지 §1-8 은 /tmp 만 씀)으로 실행 → **PASS 57 / FAIL 0**. 같은 복사본으로 부정 대조를 직접 재현: NT1(stale 판단 제거) → `4b(b)`·`4b(c)` 2건 FAIL, NT2(임시 이름 jobId 만) → `4b(c) 같은 jobId` 2건 FAIL — 심은 결함을 잡는다. `wire-*.js`·E2E·`run-all.sh` 는 돌리지 않았다. ⑤ 부가 측정: 이 NAS(NFS 마운트)의 서버 mtime 과 로컬 시계 차이는 **0.3초 미만**(임시 파일 3개 측정 후 삭제) → 10분 임계에서 시계 차 때문에 살아 있는 파일이 낡아 보일 위험 없음. ⑥ Leader 의 `runs/run5-20261008-rev3-pass.log`(읽기만): `unit-persist 63/0` · `warning-neg 탐지 8/미탐지 0`(NT1·NT2 포함) · `overlap-fuzz` 현재 코드 40/40 둘 다 저장·섞임 0·임시 0(되돌린 사본은 25/15) · B3/B4 통과 · 권한 복원 777 · 잔여물 0 · `run-all: FAIL 0`.
- (a) **사양 일치 — 통과.** 접두사 `video.mp4.tmp-` 유지(`:287`), 이름 = `prefix + jobId + '-' + process.pid + '-' + randomBytes(4).hex(8자)`(`:352`, `crypto` 는 `:8` 기존 import). 정리(`:393-397`)는 접두사로 시작하는 항목만 대상 → `fs.stat` → `Date.now() - mtimeMs > PERSIST_STALE_TMP_MS(10분)` 일 때만 `fs.rm(force)`; `readdir`/`stat`/`rm` 실패는 각각 `.catch` 로 무시. `video.mp4`(접두사 `video.mp4.tmp-` 와 불일치)·다른 파일은 건드리지 않고, 접두사 디렉터리는 비재귀 `rm` 이 실패해 보존(단위 4b 가 확인). "전부 죽은 실행의 잔재" 가정 주석은 교체됐고(`:387-392`) 같은 주장을 하는 문구는 파일에 남아 있지 않다(grep).
- (b) **새 누수·경로 문제 — 없음.** `finally`(`:403-410` 부근)는 `!renamed` 일 때 **이번 시도의 고유 `tmpPath`** 를 지우므로 이름이 달라져도 자기 파일은 항상 회수되고(단위 4b·5·5b 및 fuzz `leftoverTmp 0`), `createdDir` rmdir 은 남의 신선한 임시 파일이 있으면 `ENOTEMPTY` 로 실패해 안전한 쪽이다. 재포장 임시 파일(`persist-remux-<jobId>.mp4`)은 잡별 `/tmp/bjj-lv-<jobId>` 안이라 파이프라인 `finally` 가 폴더째 지운다(이름 규칙 무변경). 취소/실패 경로는 모두 `try` 안 `return` 또는 `catch` → `finally` 를 지나간다. 3차에서 예고한 누수(방금 죽은 같은 jobId 잔재가 10분 전까지 남음)는 그대로이며 상한은 "S3.5 복사 중 크래시 1회당 부분 파일 1개", 회수는 다음 저장 시도(10분 경과 후)나 DELETE(폴더 통삭제 — 이름 비의존이라 고유 접미사와 무관하게 전부 지워짐).
- (c) **이름 형식 의존 — 없음**(위 grep). 파일명 길이는 `video.mp4.tmp-` 14 + UUID 36 + `-pid` + `-8hex` ≈ 67자로 NFS 255바이트 한도 안.
- (d) **하네스 갱신 — 사양대로.** `unit-persist.js`: 기존 죽은 잔재를 `utimes` 11분 전으로 조작해 정리 확인, 4b 신규(11분 된 잔재 삭제 · 1분 된 타 시도 보존 · 접두사 다른 파일/접두사 디렉터리 보존 · 자기 임시 파일 0 · 겹친 두 시도 같은/다른 jobId 각각 "A 복사 도중 B 시작 → 둘 다 저장 → 최종 md5 = 한쪽 원본 → 임시 0") — 4b(c) 는 B 시작 시점을 A 의 임시 파일 출현 후로 맞춰 겹침을 보장한다. `chmod 0555` 장애물의 복원 보장: `e2e.js:44-58`·`wire-warning.js:41-47` 모두 잠그기 전에 원래 모드를 기억하고 `unlockDir` 을 **정상 종료·예외·`process.exit`('exit' 이벤트)·SIGINT/SIGTERM/SIGHUP** 에 걸었으며, `wire-warning` 은 `run()` 안 `finally` 와 바깥 `finally`(`rmSync` 앞)에서도 해제한다. 우회로(SIGKILL)에 대비해 `cleanup.sh` 가 `rm -rf` 앞에 `chmod -R u+rwx`(테스트 id 폴더·`users/1/long-videos` 전체)를 하고 `run-all.sh` 는 `trap finish EXIT` 로 항상 `cleanup.sh` 를 부르며 B3/B4/`b4-repeat` 가 `-w` 로 복원을 단언한다(run5: 777 복원). 남는 극단 경우 — e2e 가 SIGKILL 된 직후 API DELETE 가 DB 행을 먼저 지우면 0555 폴더가 id 목록(DB 기준)에서 빠져 `rm -rf` 대상이 안 되는데, 이때도 `chmod -R u+rwx` 로 권한은 복구되고 `leftover_u1` 의 "NAS users/1/long-videos 하위" 카운트가 FAIL 로 드러난다 — 영구히 숨어 남지는 않는다.
- [10:13] **새 LOW 2건 (비차단)**
  - **[LOW] N-5** — 저장 실패 경고 사유에 이제 고유 임시 파일명이 그대로 노출된다. run5 B4 의 카드 문구: `…(EACCES: permission denied, open 'video.mp4.tmp-034ffeda-27dc-487e-967f-cee64c…`. 경로는 이미 걸러지지만 `video.mp4.tmp-<uuid>-<pid>-<hex>` 는 사용자에게 의미 없는 내부 식별자다(120자 상한 안이라 잘리지는 않음). `buildVideoSaveWarning` 의 정규식에 `video\.mp4\.tmp-\S+` → `임시 파일` 치환 한 줄이면 정리됨 — 문구는 Leader 영역, 기능 무영향.
  - **[LOW] N-6 (테스트 품질)** — `unit-persist.js` 4b "video.mp4 는 정리 대상 아님" 은 같은 호출이 `video.mp4` 를 새 저장으로 교체하므로(md5 가 같은 원본 A 로 우연히 일치) 정리 루프가 `video.mp4` 를 건드려도 통과한다. 접두사 일치 조건(`video.mp4.tmp-`)이 코드로 보장하는 부분이라 위험은 낮다. 필요하면 정리 직후·저장 전의 inode 를 `copyFn` 안에서 비교하거나 다른 내용의 `video.mp4` 를 두고 `saved:false`(예: `copyFn` 실패) 경로로 검사.
- [10:13] **개발자 보고와 다른 것**: 사실 오류 없음(변경 규모·정리 조건·테스트 수치 모두 대조로 일치; 63 = 57(NAS 제외 복사본) + §9 NAS 6건으로 확인).
- [10:13] **확인하지 못한 것**: `unit-persist.js` §9(NAS 6건)·`wire-warning.js`·E2E·`run-all.sh` 는 Leader 실행과 충돌 가능성이 있어 직접 재실행하지 않았고 run5 로그로만 대조했다. 다른 호스트(맥)의 시계와 NAS 서버 시계 차이는 측정할 수 없었다(같은 호스트 기준 0.3초 미만만 확인). 실제 NFS 에서 수십 분 정지한 복사가 다른 시도의 정리에 걸려 삭제되는 경우(NAS 장시간 정지)는 재현하지 않았다 — 그때도 해당 시도가 `stat ENOENT` 로 저장 실패 처리되어 경고/로그가 남는 안전한 방향이다.

## QA 기록

**Leader 직접 실행 (2026-10-08, QA 에이전트 미사용 — 이 프로젝트의 QA 보고 신뢰 문제 이력과 개발자 하네스 재사용 관행에 따름).** 대상: 3차 수정(`persistVideo` 고유 임시 이름·10분 초과 정리)까지 반영한 **최종 코드**. 명령: `bash ~/.node-local/bjj-backup/task-048-20261007-234656/harness/run-all.sh` 를 처음부터 끝까지 1회 완주. 로그: 스크래치패드 `leader-run-all2.log`.

- 결과: **PASS 107줄 · FAIL 0줄 · `run-all: FAIL 0` · exit 0** (요약 줄과 PASS/FAIL 줄 수를 따로 집계해 일치 확인).
- 실제 yt-dlp·Claude 파이프라인: B1 첫 분석(저장·`video_path`·H.264+AAC·moov 앞·임시 디렉토리 정리·다른 user 폴더에 없음) / B2 재분석(저장본 rename 교체·`video_path` 유지) / B3 저장 실패 재분석(기존 저장본 inode·md5 보존·경고 없음) / B4 첫 분석 저장 실패(`video_path` NULL·경고 카드 문구·S10 까지 분석 완료) 전부 PASS.
- API(별도 포트 3148, 운영 3000 무관): `GET /api/long-videos/:id` 의 `video_path` 노출, `/uploads/.../video.mp4` Range 요청 → 206·`video/mp4`, DELETE → 200 후 NAS `long-videos/<id>`·`long-video-frames/<id>`·DB 행·하위 0건·URL 404.
- 단위·모의: unit-persist(63)·unit-throttle(15)·unit-warning(12)·wire-throttle·wire-warning(실제 `runPipeline`+DB)·b4-repeat(396초 영상, 이전 timeout 구성 2회 연속)·vite build.
- 화면: jsdom 렌더(fe-render 전부 PASS, 라벨 `영상 서버 저장`)·neg-control(심은 결함 전부 탐지)·media-check(Chrome/Blink 가 보관 파일을 data: 페이지+Blob 으로 실제 디코딩·seek).
- 부정 대조: warning-neg·throttle-neg·overlap-fuzz(되돌린 사본은 겹침 시 실패, 현재 코드는 40/40 둘 다 저장).
- 정리·불변: user 1 테스트 잔여물 0(행·고아·NAS·/tmp), `users/1` 폴더 원복, **user 3 long_videos 전/후 동일(8행·video_path NULL 8·md5 동일)**, 운영 pm2 `bjj` pid 45899·restarts 1 그대로, 포트 3148·9348 닫힘.
- **첫 실행은 의도적으로 중단**(수정 전 코드로 B2 진행 중, developer 가 같은 소스를 고치기 전): 중단 순간 고아 프로세스(`e2e.js run 155 --stub`)가 정리 뒤에 챕터 1행(id 607, user 1)과 프레임 폴더 `users/1/long-video-frames/155` 를 다시 만들었다 → Leader 가 id·경로를 특정해 수동 삭제하고 `leftover_u1` 전부 0, user 3 불변을 재확인. 교훈: **하네스를 중간에 끊지 말 것**(끊어야 하면 자식 프로세스까지 PID 로 정리한 뒤 cleanup 을 다시 돌릴 것; `pkill -f <패턴>` 은 자기 셸까지 죽인다).
- 🟡 **미검증(그대로 열려 있음)**: 실제 브라우저·안드로이드 WebView 에서의 화면 모양·재생·전체화면(이 서버의 headless Chrome 이 http(s) 내비게이션을 못 열어 jsdom + 디코딩 검사로 대체), 3시간급 영상 저장 시간·용량, 다른 호스트(맥)와 NAS 사이 실제 NFS 경합, 실제 blue/green 겹침. → **배포 후 사용자 폰 확인 필요.**

## Codex 검토

### [2026-10-08 00:09] C2 adversarial-review focus=concurrency — done
- judge 판정: C2(jev-1.13.0, codex_required=true) / 호출 차수: 1/4
- 대상: repo=/home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning base=14eb850(task_file) snapshot=4bf993c
- 지적 2건:
  - [HIGH] longVideoPipeline.js:386 — blue/green 배포 중 두 프로세스가 같은 queued/running 잡을 실행하거나, 복수 잡이 동시에 S3.5에 진입할 때 → persistVideo가 대상 디렉터리의 video.mp4.tmp-*를 jobId 구분 없이 전부 삭제하며, longVideoWorker의 잡 선택은 원자적 claim이 없고, 새 프로세스 시작 시 모든 running 잡을 queued로 되돌림 → 진행 중인 NAS 복사가 ENOENT/크기 검사 실패로 누락되거나, 동일 jobId 두 스트림이 같은 임시 경로를 동시에 써서 마지막 rename 결과가 어느 프로세스의 파일인지 보장 불가 · 배포 시 다운로드·분석도 중복 실행 (권고: DB에서 queued→running을 조건부 UPDATE/SELECT FOR UPDATE SKIP LOCKED로 원자적 claim, 부팅 시 heartbeat 만료 및 소유자 확인 사용, persistVideo에서 현재 잡의 임시 파일만 정리)
  - [MEDIUM] longVideos.js:252 — 같은 영상에 두 reanalyze 요청이 거의 동시에 도착해 두 요청 모두 activeJob 조회를 마친 뒤 enqueueJob을 실행할 때 → 활성 잡 확인 SELECT와 INSERT가 트랜잭션·행 잠금·고유 제약 없어 두 요청 모두 activeJob이 없다고 판단해 서로 다른 UUID의 queued 잡 생성 가능, 이후 두 프로세스가 각 잡 병렬 실행하면 persistVideo의 전체 video.mp4.tmp-* 정리가 상대 잡의 임시 파일까지 삭제 → 명세의 영상당 진행 잡 1개 및 409 보장이 깨지고, 중복 다운로드·AI 비용과 챕터/상태 경쟁 발생, S3.5에서 한 잡이 다른 잡의 복사를 실패시키거나 최종 video.mp4를 마지막 완료 순서대로 덮어씀 (권고: 재분석 등록을 트랜잭션으로 묶어 long_videos 행을 잠근 뒤 활성 잡 확인과 INSERT 수행, 또는 enqueueJob 자체가 중복 여부를 원자적으로 판정하도록 구성)
- 검토하지 못한 범위: 실제 blue/green 프로세스 겹침 및 NFS 파일 경합 재현, 실 브라우저와 Android WebView의 미디어 이벤트 순서, 3시간급 영상의 장시간 취소·재시작 경합
- 원본: /home/brownjeon/NFS/homes/brownjeon/project/.claude/state/codex-review/runs/20261008T000956Z-task-048-C2/raw.txt

## 최종 요약

(Leader — 완료 후)

## 데모 검토 (demo gate)

> 실행 판정 정본은 frontmatter `demo_gate` 이다. 이 표는 check.mjs 가 함께 기록하는 사람용 이력이다(docs/demo-review-gate.md).

| 버전 | 상태 | 저장소 파일 | Artifact | 사용자 결정 | 일시 |
|---|---|---|---|---|---|
| - | 작성중 | - | - | judge: delta (JV-ui_change) | 10-07 23:38 |
| - | 생략 | - | - | "데모 생략하고 바로 구현해줘" | 10-07 23:41 |
