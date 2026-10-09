---
id: task-050
title: 영상분석 — 썸네일 서버 저장 + 기존 영상 파일·썸네일 백필 (바라토플라타 영상 제외)
status: doing
created: 2026-10-08
base_ref: 8613000955226d4fd7147b132dc60bf1db8415d0
risk_level: R2
tags:
  - type/task
  - domain/study-video
  - domain/storage
related_tasks:
  - task-048-study-video-local-save
  - task-049-study-video-player-poster
aliases:
  - 영상분석 썸네일 서버 저장
  - 영상분석 백필
demo_gate:
  required: false
  level: "none"
  status: "not_required"
  version: 0
  repo_path: ""
  artifact_url: ""
  content_sha256: ""
  decided_by: "judge"
  rule_id: ""
  approved_by: ""
  approved_at: ""
  approval_quote: ""
  waived_by: ""
  waived_at: ""
  waiver_quote: ""
  active: false
---

# task-050 — 썸네일 서버 저장 + 기존 영상 백필

## 사용자 요청 (2026-10-08)

> 썸네일도 서버에 저장해주고 바라토플라타를 제외한 기존의 영상도 저장해서 연결해줘

해석(Leader, 사용자에게 보고함):
1. **썸네일**: 새 분석부터 서버에 저장하고, **기존 8건 전부**(바라토플라타 id=74 포함 — 영상은 이미 저장돼 있으니 썸네일만)의 썸네일도 서버에 저장·연결한다.
2. **영상 파일**: 바라토플라타(id=74)를 **제외한** 기존 7건(29·30·37·38·39·40·73)의 영상 파일을 받아 서버에 저장하고 `video_path` 로 연결한다 (task-048 에서 "배포 후 별도 승인"으로 남겨 둔 백필 — 이 요청이 그 승인).

## 실측 (Leader, 2026-10-08 — 코드·DB 읽기 전용)

- 대상 `long_videos` 전부 user 3, 8건. 영상 길이 132~912초, 백필 대상 7건 합계 **약 61분**(600+912+765+505+310+446+132초). 썸네일 주소는 전부 `i.ytimg.com`(5건 `vi_webp/.../maxresdefault.webp`, 3건 `vi/.../{maxresdefault,hqdefault}.jpg`), 확인한 두 형식 모두 지금 HTTP 200(webp 90KB·jpg 32KB).
- 컬럼: `thumb_url TEXT`, `video_path VARCHAR(500)`, `updated_at DATETIME ... ON UPDATE current_timestamp()` → **값을 직접 UPDATE 하면 `updated_at` 이 바뀐다**(목록 정렬은 `id DESC` 라 순서엔 영향 없으나 기록 보존을 위해 `updated_at = updated_at` 로 고정). `UNIQUE (user_id, video_id)`.
- `thumb_url` 소비처: 목록 `<img src>`(`StudyVideoPage.jsx:296`), 상세 poster(`StudyVideoDetailPage.jsx`, task-049), 기술 적용 시 클립 생성(`routes/longVideos.js:361` — `frames[0]?.path || video.thumb_url`), S1 이 매 분석마다 `thumb_url: meta.thumbUrl || video.thumb_url` 로 덮어씀(`longVideoPipeline.js:637`). `<img src>` 에 쓰이므로 **서버 경로(`/uploads/...`)를 넣어도 화면 변경 없이 동작**한다. `thumbnailExtractor.js` 는 `thumb_url LIKE 'http%'` 인 클립을 로컬 썸네일로 바꾸는 별도 흐름이라 서버 경로와 충돌하지 않는다.
- 저장 위치: 영상과 같은 폴더 `users/<uid>/long-videos/<vid>/` (DELETE 가 폴더째 지움 — 별도 정리 불필요, task-048 에서 정수 id 검증 완료).
- Node v20 (`fetch`·`AbortSignal.timeout` 사용 가능). yt-dlp 호출은 `ytdlp.js` 의 `YTDLP_BIN` 경유.
- 선례 스크립트: `backend/scripts/task-047-backfill-tech-categories.js` (운영 백필 + 백업 JSON + `--restore`) — 같은 규약을 따른다.

## 설계 (Leader)

### 1. 스키마 변경 없음 — `thumb_url` 에 서버 경로를 넣는다
`thumb_url` 이 `/uploads/users/<uid>/long-videos/<vid>/thumb.<ext>` 이면 서버 저장본. 프론트 변경 없음(목록·상세 poster·task-049 선로딩 게이트 모두 같은 `<img>` 경로).

### 2. 썸네일 저장 함수 (신규, 단위 테스트 가능하게 분리·export)
`backend/src/services/longVideoThumb.js`(신규) — `persistThumbnail(remoteUrl, userId, videoId, opts)`:
- 입력 검증: `https:` 만, 호스트 허용목록(`i.ytimg.com`·`*.ytimg.com`·`img.youtube.com`), userId/videoId 는 storage 의 정수 검증 재사용. 허용되지 않으면 `{saved:false, reason}`.
- `fetch`(리다이렉트 금지 또는 재검증), 타임아웃 15초, **크기 상한 5MB**(content-length + 스트림 누적), 응답 바이트의 **매직 바이트로 형식 판별**(JPEG `FFD8FF` · WebP `RIFF....WEBP` · PNG `89504E47`) → 확장자 `jpg|webp|png`. 그 밖이면 거부(content-type 만 믿지 않는다).
- 임시 이름(`thumb.tmp-<pid>-<난수>`)에 쓰고 `rename` 으로 `thumb.<ext>` 교체(원자적). 성공 후에만 다른 확장자의 옛 `thumb.*` 와 오래된(10분 초과) `thumb.tmp-*` 를 지운다. 어떤 실패에서도 기존 `thumb.*` 는 보존, 임시 파일·이번에 만든 빈 폴더 정리. 운영상 실패는 던지지 않고 `{saved:false, reason}`.
- 반환 `{saved:true, webPath, bytes, ext}`; `storage.js` 에 `longVideoThumbWebPath(userId, videoId, ext)`(확장자 화이트리스트, 정수 id 검증) 추가.

### 3. 파이프라인 (`longVideoPipeline.js`)
- **S1 의 덮어쓰기 규칙 수정(필수)**: `thumb_url: meta.thumbUrl || video.thumb_url` → 현재 `video.thumb_url` 이 서버 경로(`/uploads/`로 시작)면 **유지**, 아니면 지금처럼 메타 주소. (재분석이 서버 저장본을 유튜브 주소로 되돌리면 안 된다. 유튜브에서 영상이 사라져 S1 이 실패해도 서버 썸네일은 그대로 남는다.)
- **S1 직후(S2 이전) 썸네일 저장 단계**: `meta.thumbUrl` 이 있으면 `persistThumbnail` → 성공하면 `LongVideo.update({thumb_url: webPath})`. 비치명(실패는 로그만, `thumb_url` 은 S1 이 쓴 주소 그대로). 다운로드(S3)가 실패해 '목차만 제공'으로 끝나도 썸네일은 남는다. 분석 도중 DELETE 된 영상이면 저장 직후 폴더 정리(task-048 의 행 확인 패턴 재사용). 재분석이면 같은 파일을 원자 교체(최신 썸네일).

### 4. 기존 영상 백필 스크립트 (`backend/scripts/task-050-backfill-long-videos.js`) — 🔴 R2: 운영 DB·NAS
- 인자: `--user <id>`(필수) · `--skip-video-ids 74`(영상 파일 건너뛸 id, 썸네일은 처리) · `--only <ids>` · **기본은 dry-run**, `--apply` 로만 쓴다 · `--restore <백업.json> --apply` 로 되돌린다.
- 행마다 독립(한 건 실패가 나머지를 막지 않음, 실패는 목록으로 보고하고 해당 행은 그대로 둠):
  1. 썸네일: `thumb_url` 이 이미 서버 경로면 건너뜀. 아니면 `persistThumbnail` → 성공 시 `thumb_url` 갱신.
  2. 영상: `video_path` 가 비어 있고 id 가 건너뛰기 목록에 없으면 `ytdlp.downloadVideo`(파이프라인과 같은 포맷 지정·`YTDLP_BIN`)로 `/tmp` 임시 폴더에 받고 → 길이 검증(`ffprobe` 길이가 DB `duration_sec` 의 ±5% — 엉뚱한 영상 방지) → 코덱 확인(**H.264+AAC 가 아니면 저장·연결하지 않고 보고** — 폰 재생 문제, `--allow-non-h264` 로만 허용) → `persistVideo` → `video_path` 갱신. 임시 폴더는 반드시 정리.
  3. 모든 UPDATE 는 `updated_at = updated_at` 로 시각 고정, 조건 `WHERE id=? AND user_id=? AND (video_path IS NULL ...)` 로 다른 갱신과 경합 방지. 해당 영상에 진행 중 분석 잡(`long_video_jobs` queued/running)이 있으면 그 행은 건너뜀.
- dry-run: DB 읽기 + 영상 가용성(`fetchMeta`) + 썸네일 가져올 수 있는지만 확인하고 **아무것도 쓰지 않는다**. 계획표(행별로 무엇을 할지·예상 다운로드 길이·NAS 여유)를 출력.
- apply 전 **백업 JSON**(`~/.local/share/bjj-backups/task-050-<ts>-user<id>.json`): 대상 행의 원래 `thumb_url`·`video_path`·`updated_at` 과 스크립트가 만든 파일 목록. `--restore` 는 현재 값이 스크립트가 쓴 값 그대로인 행만 원래 값으로 되돌리고 **스크립트가 만든 파일만** 지운다(id=74 의 기존 `video.mp4` 는 건드리지 않음).
- 실행은 순차(동시성 1), NAS 여유·`/tmp` 여유 확인, 로그를 파일로 남김.

### 5. 데모·순서
화면 변경 없음 → judge 가 데모 수준을 판정. 순서: Developer → Reviewer → (judge C2 → Codex?) → Leader QA(user 1 픽스처로 실제 yt-dlp·파이프라인·백필 dry-run/apply/restore 왕복) → **push 확인(사용자)** → 배포 → **운영 백필 dry-run → 계획 보고 → apply(사용자 요청에 이미 포함)** → 검증.

## 범위 밖

- `video_clips`(참고영상)·다른 화면의 썸네일은 건드리지 않는다.
- 저장본으로 재분석(유튜브가 사라진 뒤에도 재분석)·워커 claim 개선(board 후속) — 별도.
- 유튜브가 이미 삭제·비공개로 바뀐 영상이 있으면 그 행은 실패로 보고만 한다(복구 불가).

## 관련 과거 이력·교훈

- task-048: 임시 이름 복사→rename 원자 저장, 정수 id 검증(재귀 삭제 대상), 저장 실패 비치명, `updated_at`, 하네스를 중간에 끊지 말 것(고아 프로세스), judge 에이전트 출력 파일 사고(→ Leader 가 판정 도구 직접 실행).
- task-049: 깨진 poster 는 칸을 검게 만든다 → 서버 저장본이 생기면 이 위험 자체가 줄어든다. 선로딩 게이트는 그대로 유지.
- 개발·운영이 같은 NAS MariaDB 를 쓴다 → 테스트는 user_id=1 픽스처만, user 3 는 마지막 운영 백필에서만 쓴다.
- task-047: 운영 백필은 백업 JSON + `--restore` + dry-run 기본값 규약.

## 판단 기록 (judge)

intake (2026-10-08, jev-1.13.0, `judge-result@2`, **Leader 가 판정 도구를 직접 실행** — 입력 `task-050-judge-intake.in.json`, 원본 출력 `task-050-judge-intake.real.json`): complexity=2.58(신뢰 0.58) · risk=**R2**(high 0.76) · developer_model=**opus** · next=assign · demo=none(ui_change=none, 확신 1.0) → 데모 게이트 `not_required`. `task_type` 은 ops 0.45 로 신뢰 부족해 비었고 그 경우 규칙 `MD-judge-failed-opus` 가 developer 를 opus 로 고정(override 아님 — 도구 규칙). R2 사유: 운영 DB 백필·NAS 쓰기·user_id 격리·다중 쓰기(`judge.md` 맞춤 절 "백필 스크립트"·"user_id 격리") — 그대로 따른다.
C1 (설계 확정 직후, `task-050-judge-c1.real.json`): `codex_required=false` · `wanted_before_budget=false` · budget_rule=`CX-limit-unknown-r2` · codex_switch=on · design_uncertainty=1.09(신뢰 0.83) · focus=security 0.29. Codex 개입 없이 진행(override 없음).
C2 (Reviewer 1차 감사 직후, Leader 직접 실행, `task-050-judge-c2.real.json`): **`codex_required=true`**(규칙 `CX-r2-post-review` — R2 는 리뷰 후 외부 검토) · mode=adversarial-review · focus=concurrency 0.44 · 호출 **1/4** → codex 호출, 지적 3건(HIGH 2·MEDIUM 1) → Reviewer 가 3건 모두 채택(restore 는 부분 채택) 판정, developer 2차 수정.
C2 재판정 (`task-050-judge-c2b.real.json`): `codex_required=true` · focus=concurrency 0.98 · 호출 **2/4** → codex 2차 호출, 지적 3건(전부 HIGH 표기) → Reviewer 판정: ① 죽은 잠금 동시 회수 = **ADOPT**(재현 5/30) ②③ 기존 파일 덮어쓰기 = **REJECT(id 74 보호는 실행으로 확인)/DEFER-수용위험**(같은 영상·같은 포맷의 동등 파일, 경합해도 DB 는 존재하는 파일을 가리킴). Leader 의 'rename 회수'·'파일 있으면 건너뛰기' 가설은 Reviewer 프로토타입으로 **틀림**이 확인돼 폐기(rename 은 둘 다 보유, 건너뛰기는 크래시 잔재로 영구 미연결) — 대신 `.recover` guard + 재읽기 비교.
C2 재판정 (`task-050-judge-c2c.real.json`, 마지막 수정 라운드 후): `codex_required=true` · focus=concurrency 0.96 · 호출 2/4. **override: Codex 3차 호출 안 함 — 사유:** (1) 변경이 잠금 회수 12줄뿐이고 Reviewer(REV-050-3, PASS)가 이를 독립 재현으로 입증했다 — 결정적 인터리빙 테스트(현재 코드 한 쪽만 보유 / CAS 이전 코드·재읽기 뺀 사본 둘 다 보유)와 실제 2프로세스 경합 30회(옛 코드 6/30 둘 다 보유, 현재 0/30) (2) 2차에서 Codex 가 남긴 나머지 지적은 Reviewer 가 실행으로 수용위험으로 확정한 같은 계열 (3) 호출 예산은 4회 한도 중 2회 사용 — 1회를 비상용으로 남긴다. 필요하면 사용자가 Codex 검토를 요청할 수 있다.

## 구현 기록

- [17:15] Developer 구현·검증 완료 — 하네스 최종 run-all **FAIL 0**(PASS 72줄, 부정 대조 11/11 탐지). 커밋·push·pm2·배포·user 3 apply 는 하지 않았다.

**변경 파일·함수** (스키마·프론트·라우트 무변경)
- `backend/src/services/storage.js` — `longVideoThumbWebPath(userId, videoId, ext)` + `LONG_VIDEO_THUMB_EXTS`(jpg·webp·png). 정수 id 검증은 기존 `assertLongVideoId` 재사용. 기존 함수 무수정.
- `backend/src/services/longVideoThumb.js`(신규) — `persistThumbnail(remoteUrl, userId, videoId, opts)` · `probeThumbnail`(HEAD, dry-run 전용) · `checkThumbUrl` · `sniffImageExt` · `isServerThumbUrl`. https 만 · 허용 호스트 `i.ytimg.com`·`*.ytimg.com`·`img.youtube.com` · 계정/비표준 포트 거부 · `redirect:'manual'` 후 200 이 아니면 거부 · 15초(헤더+본문) · 5MB(content-length + 누적) · 매직 바이트로 확장자 결정 · 임시 이름 → rename · 실패 시 기존 `thumb.*` 보존·임시 파일·이번에 만든 빈 폴더 정리 · 운영상 실패는 `{saved:false, reason}`, 인자 오류만 throw. 기본값(fetch·15초·5MB·10분)이 운영 값이고, 테스트는 opts 로 주입한다.
- `backend/src/services/longVideoPipeline.js` — (a) S1: `thumb_url` 이 `/uploads/` 로 시작하면 유지, 아니면 기존대로 `meta.thumbUrl || video.thumb_url`. (b) `saveThumbnailStep()`(S1.5) 추가, S1 업데이트·취소 검사 직후 호출: 받기 전에 행 확인 → `persistThumbnail` → `commit` 안에서 행 재확인 후 `LongVideo.update({thumb_url}, {where:{id,user_id}})` → 행이 없어졌으면 폴더 삭제(S3.5 와 같은 규칙). 실패는 `console.error` 만, 경고 카드 없음. export 1개 추가. S3.5·경고 로직 무수정.
- `backend/scripts/task-050-backfill-long-videos.js`(신규) — 아래 "설계 대비" 참고.
- `backend/src/routes/longVideos.js` — 무변경으로 충분함을 확인: DELETE 가 `getLongVideoDir` 폴더째 지우고(E3 실측: 썸네일 포함 삭제·URL 404), GET 상세·목록은 `thumb_url` 을 그대로 내려준다(E1).

**설계 대비 달라진 점과 이유**
1. `persistThumbnail` 에 `commit(webPath)` 옵션 추가 — rename 뒤·옛 확장자 정리 **전**에 호출자가 DB 를 기록하고, 기록이 실패하면 옛 `thumb.*` 를 지우지 않는다. 설계의 "성공 후에만 정리"를 "저장 + 기록 성공 후"로 좁혔다. 이유: 재분석에서 확장자가 바뀔 때(webp→jpg) 기록 전에 `thumb.webp` 를 지우면, 기록 실패 시 DB 가 지워진 파일을 가리켜 썸네일이 깨진다(task-049 의 깨진 poster 와 같은 증상). 부정 대조 NP 가 이 순서를 지킨다.
2. 백필 백업 JSON 에 `writes`(UPDATE **전에** 기록, `applied` 상태)·`created_files`(sha256)·`created_dirs` 를 둔다. restore 는 "지금 값 == 스크립트가 쓴 값" **그리고** "파일 sha256 이 그대로"일 때만 되돌리고 그 파일만 지운다. 백필 뒤 앱이 같은 경로에 다시 저장(재분석)했다면 값·파일 모두 두고 충돌로 보고한다. 백업의 파일 경로는 `users/<uid>/long-videos/<id>/(thumb.(jpg|webp|png)|video.mp4)` 꼴만 받는다(변조 백업 거부). 잠금 파일(`task-050-user<id>.lock`)로 apply·restore 동시 실행을 막는다.
3. dry-run 에 yt-dlp `-J --skip-download -f <파이프라인과 같은 DOWNLOAD_FORMAT>` 포맷 확인을 더했다(`fetchMeta` 와 별도, 읽기 전용) — 받게 될 코덱·크기·오디오 언어를 계획표에 보인다.
4. DB 접근은 task-047 의 mysql2 직접 연결 대신 `models` 의 `sequelize.query()`(CLAUDE.md 규칙, `persistVideo` 가 어차피 models 를 불러온다). 실측: 이 연결의 `affectedRows` 는 "바뀐 행 수"다(같은 값 UPDATE → 0). 모든 조건부 UPDATE 는 값이 반드시 바뀌므로 1 = 조건 일치로 판정한다.
5. `--allow-non-h264` 는 영상·오디오 코덱 검사를 **둘 다** 건너뛴다(이름과 달리 AAC 가 아닌 것도 허용). `--restore` 는 `--only`·`--skip-video-ids`·`--allow-non-h264` 와 같이 쓰면 거부.
6. id 74 는 계획표에 `영상:건너뜀(이미 video_path 있음)` 으로 나온다 — `video_path` 검사가 `--skip-video-ids` 보다 먼저다. 두 겹 모두 74 의 `video.mp4` 를 건드리지 않는다.
7. 1차 run-all 에서 찾은 결함 수정: yt-dlp 오류가 stderr 전체(앞에 `Deprecated Feature: … Python 3.10` 경고)라 계획표 한 줄이 여러 줄로 깨지고 진짜 원인이 잘렸다 → `oneLine()`(ERROR 줄 우선, 한 줄화).

**실행한 검증** — `bash /home/brownjeon/.node-local/bjj-backup/task-050-20261008-151136/harness/run-all.sh` 한 번(약 15분, 출력 `logs/run-all.log`, 끝 줄 `run-all: FAIL 0`)
- (0) `node --check` 5파일 · `git status -- web` 비어 있음 · `routes/longVideos.js`·`models` 무변경 · 스크립트/새 서비스에 `yt-dlp` 리터럴 spawn 없음 · `DB_PASS`·`JWT_SECRET` 참조 없음 → 전부 PASS.
- (a) `unit-thumb.js` PASS 146 / FAIL 0 — SSRF 거부 34종(http·127.0.0.1·localhost·10.x·192.168.x·169.254.169.254·[::1]·0x7f000001·2130706433·evil.com·i.ytimg.com.evil.com·ytimg.com·끝 점·계정·포트 8443·`@` 우회·javascript:·data:·file:·ftp:·빈 값·3000자 등, 전부 fetch 호출 0회) · 리다이렉트 301/302/303/307/308 거부(JPEG 본문이 있어도) · 실제 Node fetch 로 302 를 따라가지 않음(대상 접속 0회) · content-length 6MB·거짓 content-length·끝없는 본문(5MB 에서 끊음)·정확히 5MB 통과·5MB+1 거부 · 헤더 무응답/본문 멈춤 시간 초과 · HTML 을 image/jpeg 로 속임·0바이트·3바이트·GIF·RIFF/WAVE 거부, JPEG/PNG/WebP 판별 · 실패 시 기존 파일 inode·md5 보존·임시 0 · ENOSPC/EACCES 주입 · 확장자 교체·commit 실패 시 옛 파일 보존 · 10분 넘은 임시만 정리 · 겹친 저장 20회 섞임 0 · 정수 아닌 id 10종 throw · 실제 NAS 기본 경로 users/1/…, users/3 목록 불변.
- (a2) task-048 회귀 사본 5종 그대로: unit-persist 63/0 · unit-warning 12/0 · unit-throttle 15/0 · wire-warning 13/0 · wire-throttle 4/0.
- (b) `wire-thumb.js` PASS 22 / FAIL 0 — 실제 `runPipeline`+DB, 가짜 yt-dlp·CDN·Claude: 첫 분석 thumb.jpg 저장·`thumb_url` 서버 경로·S3.5 영상도 저장 · 재분석 webp 로 교체·thumb.jpg 정리 · 재분석 썸네일 404 → 서버 경로 유지·파일 inode 그대로·분석 done·경고 없음 · S1 메타 실패 → 서버 썸네일 그대로 · 첫 분석 썸네일이 HTML → 유튜브 주소 유지(예전 동작) · 다운로드 실패 '목차만 제공'에서도 썸네일 저장 · 썸네일 받는 도중 DELETE → 폴더 남지 않음.
- (b2) 실제 e2e(user 1, `hZHdEtG4RvQ` 132초): E1 실제 yt-dlp·CDN·Claude → done, `thumb_url=/uploads/users/1/long-videos/472/thumb.jpg`, 매직 `ffd8ffe0…` 112516B, `/uploads` 200 `Content-Type: image/jpeg` + nosniff + 바이트 동일, API 상세·목록 모두 서버 경로 · E2 재분석(Claude 스텁, yt-dlp·CDN 실제) 후에도 서버 경로 유지·inode 25219003→25219336(원자 교체) · E3 API DELETE 200 → 폴더 삭제·썸네일 URL 404.
- (c) `unit-backfill.js` PASS 69 / FAIL 0 — 인자 거부 19종 · dry-run DB·NAS 트리·/tmp·백업 무변경 + 다운로드·저장·썸네일 GET 0회 · apply: 정상 행 thumb+video, 길이 불일치 거부(20초 vs DB 100초), 비 H.264(mpeg4) 거부, `--skip-video-ids`·`video_path` 있는 행(74 와 같은 상태) 기존 `video.mp4` inode 보존, 진행 중 잡(`running`) 행 미변경, 유튜브 없음 행 실패 보고 후 다른 행 계속, 경합(UPDATE 직전 다른 값) → 덮지 않고 이번에 만든 파일·폴더 삭제 · 🔴 updated_at 7행 전부 픽스처 값 그대로 · 백업 600·sha256 · `--allow-non-h264` · 재실행 멱등 · 잠금 · 변조 백업 7종 거부(user 3 파일·`../` 탈출·.env·칸 이름·user_id·created_dirs·task) · restore: 진행 중 잡 행 건너뜀, 원복 + 스크립트가 만든 파일만 삭제, 백필 뒤 교체된 파일은 충돌 보고·보존, updated_at 보존, 두 번째 restore 는 할 일 없음.
- (c2) `cli-backfill.sh` 실제 CLI(user 1 픽스처 4행, 실제 다운로드 `xbHRaZ3-rNA` 310초 1건): dry-run `strace -ff -e trace=%file,ftruncate` 로 yt-dlp 자식 포함 28프로세스 /tmp·NFS 쓰기 0 · apply → webp 썸네일(RIFF…WEBP)·video.mp4 h264+aac 309.8초 43.2MB, `--skip-video-ids` 행 썸네일만, 없는 영상 행 실패 보고(행 독립), 74 같은 행 기존 파일 보존, updated_at 4행 그대로, `/uploads` 썸네일 200 image/webp·영상 Range 206 video/mp4 · 재실행 멱등 · restore dry-run strace 쓰기 0 · restore apply 원복·폴더 삭제·기존 파일 보존·DB md5 픽스처 시점과 동일.
- (c3) user 3 dry-run(아래 계획표): strace 74프로세스 /tmp·NFS 쓰기 0 · user 3 `long_videos` 스냅샷(행수·NULL 수·값·updated_at md5) 시작=끝 `8 7 2cefae3b32210b8b16e6ab80f877ba62` · 잡 분포 `done:10` 시작=끝 · NAS users/3 트리 시작=끝 · 백업 JSON 안 만듦.
- (d) `neg.sh` 탐지 11 / 미탐지 0 — 허용목록 제거(NA)·매직 바이트 제거(NM)·리다이렉트 follow(NR)·크기 상한 제거(NS)·commit 전 정리(NP)·S1 서버 경로 유지 제거(NK)·DELETE 가드 제거(ND)·백필 `updated_at = updated_at` 제거(NU)·`video_path IS NULL` 조건 제거(NC)·restore sha256 확인 제거(NH)·백업 경로 검사 제거(NG) 사본이 각각 겨냥한 검사에서 FAIL.
- (e) 정리 후 user 1 테스트 행·고아 0 · NAS `users/1` 없음(작업 전 상태로 원복) · `/tmp` 잔여 0 · user 3 `long_videos`·잡·NAS 트리 run 시작=끝 · 운영 `bjj` pid 277664 restarts 0 그대로 · 하네스 로그·백업에 `DB_PASS`·`JWT_SECRET` 값 0건 · :3150 닫힘.

**user 3 dry-run 계획표** (`node backend/scripts/task-050-backfill-long-videos.js --user 3 --skip-video-ids 74 --backup-dir <하네스>/backups/u3`, 2026-10-08 17:0x, 작업트리 코드)
```
# task-050 영상분석 썸네일·영상 백필 — user 3 · 행 8/8 · DB bjj@192.168.219.154
# 모드: DRY-RUN (DB·NAS·/tmp 에 쓰지 않음)
# 옵션: skip-video-ids=[74] only=(전체) allow-non-h264=false
# NAS 여유(/home/brownjeon/NFS/homes/brownjeon/project/files/bjj-trainning/users/3) 2510.3GB · /tmp 여유 490.8GB · 받을 영상 7건 합계 61:10 (3670초)

## 계획표 (id · video_id · DB 길이 · 썸네일 · 영상 · 원격 확인)
  29	IRe3WGF3FUo	10:00	썸네일:저장	영상:받기·저장(10:00)	메타 OK(10:00) · 포맷 136+140 avc1.64001F/mp4a.40.2[ko] 720p 69.6MB · 썸네일 HEAD 200 image/webp 90610B
  	  현재 thumb_url=https://i.ytimg.com/vi_webp/IRe3WGF3FUo/maxresdefault.webp · video_path=(빈 값) · updated_at=2026-09-04 18:53:53
  30	2qSnBLzmL5I	15:12	썸네일:저장	영상:받기·저장(15:12)	메타 OK(15:12) · 포맷 136+140-2 avc1.64001F/mp4a.40.2[ko 원어] 720p 63.2MB · 썸네일 HEAD 200 image/webp 127104B
  	  현재 thumb_url=https://i.ytimg.com/vi_webp/2qSnBLzmL5I/maxresdefault.webp · video_path=(빈 값) · updated_at=2026-08-24 14:09:35
  37	6mYXY4yK7tk	12:45	썸네일:저장	영상:받기·저장(12:45)	메타 OK(12:45) · 포맷 136+140-2 avc1.64001F/mp4a.40.2[ko 원어] 720p 60.2MB · 썸네일 HEAD 200 image/webp 83944B
  	  현재 thumb_url=https://i.ytimg.com/vi_webp/6mYXY4yK7tk/maxresdefault.webp · video_path=(빈 값) · updated_at=2026-08-26 19:03:55
  38	ATu8EYHue1w	8:25	썸네일:저장	영상:받기·저장(8:25)	메타 OK(8:25) · 포맷 298+140 avc1.640020/mp4a.40.2[ko] 720p 81.7MB · 썸네일 HEAD 200 image/jpeg 32427B
  	  현재 thumb_url=https://i.ytimg.com/vi/ATu8EYHue1w/hqdefault.jpg · video_path=(빈 값) · updated_at=2026-08-30 15:57:04
  39	xbHRaZ3-rNA	5:10	썸네일:저장	영상:받기·저장(5:10)	메타 OK(5:10) · 포맷 136+140 avc1.64001F/mp4a.40.2[ko] 720p 41.0MB · 썸네일 HEAD 200 image/webp 60480B
  	  현재 thumb_url=https://i.ytimg.com/vi_webp/xbHRaZ3-rNA/maxresdefault.webp · video_path=(빈 값) · updated_at=2026-08-30 17:08:51
  40	6XL2X5aGXlk	7:26	썸네일:저장	영상:받기·저장(7:26)	메타 OK(7:26) · 포맷 136+140 avc1.64001F/mp4a.40.2[ko] 720p 49.1MB · 썸네일 HEAD 200 image/jpeg 26101B
  	  현재 thumb_url=https://i.ytimg.com/vi/6XL2X5aGXlk/hqdefault.jpg · video_path=(빈 값) · updated_at=2026-09-01 13:17:17
  73	hZHdEtG4RvQ	2:12	썸네일:저장	영상:받기·저장(2:12)	메타 OK(2:12) · 포맷 136+140-1 avc1.64001F/mp4a.40.2[ko 원어] 720p 17.3MB · 썸네일 HEAD 200 image/jpeg 112516B
  	  현재 thumb_url=https://i.ytimg.com/vi/hZHdEtG4RvQ/maxresdefault.jpg · video_path=(빈 값) · updated_at=2026-09-18 11:49:34
  74	qrH7M3O6ZhE	6:36	썸네일:저장	영상:건너뜀(이미 video_path 있음)	썸네일 HEAD 200 image/jpeg 85307B
  	  현재 thumb_url=https://i.ytimg.com/vi/qrH7M3O6ZhE/maxresdefault.jpg · video_path=/uploads/users/3/long-videos/74/video.mp4 · updated_at=2026-10-08 10:58:19

## 요약: 썸네일 저장 8건 · 영상 저장 7건(합계 61:10)
## 예상 영상 크기 합계 382.1MB · NAS 필요(+1GB 여유) 1.4GB / 여유 2510.3GB
## /tmp: 영상 1건씩 받고 지운다 — 건마다 3GB 여유 필요 / 지금 490.8GB

DRY-RUN — DB·NAS·/tmp 에 쓰지 않았습니다. 적용하려면 --apply 를 붙이세요.
```
- 7건 모두 H.264+AAC 로 받게 된다. 30·37·73 은 오디오 트랙이 여럿(영어·인니어 자동 더빙 등)인데 `yt-dlp -F` 로 확인한 결과 선택되는 140-x 는 `Korean original (default)` 트랙이다.

**못 한 검증과 사유**
- 실제 폰·WebView·브라우저에서 목록 `<img>`·상세 poster 표시: 프론트 무변경이라 `/uploads` 응답(200·image/jpeg|webp·nosniff·바이트 동일)과 API 값까지만 확인했다.
- 운영 user 3 `--apply`: 금지 사항(Leader 가 배포 뒤 실행).
- 재분석 두 실행이 겹치면서 썸네일 형식이 서로 다를 때(jpg/webp)의 정리 경합: 한쪽이 다른 쪽의 새 파일을 지울 수 있다는 이론적 경로가 있다. 같은 영상·같은 순간에 형식이 달라야 해서 드물다고 보지만 재현·검증하지 않았다.
- 시간 제한을 뺀 부정 대조: 그 사본은 테스트가 끝나지 않아 판정이 안 되므로 넣지 않았다(시간 초과 자체는 단위 테스트 양성 4건으로만 확인, 주입한 300~500ms 제한 기준).
- 3시간급 영상 백필·실제 blue/green 위 실행: 미검증.

**하네스에서 생긴 일(정직하게)**
- 2차 run-all 의 부정 대조 NS(크기 상한 제거 사본)가 내가 만든 **무한 가짜 본문**을 끝없이 읽어 RSS 15GB 까지 커졌고, 16:17:04 커널 OOM killer 가 그 테스트 프로세스만 죽였다. 이어서 16:36:15 에는 내가 메모리 제한을 시험하려고 손으로 돌린 node 프로세스(25GB 할당 시도)도 OOM 으로 죽었다. 두 번 다 커널 로그상 죽은 것은 그 프로세스 하나뿐이고 `bjj` 는 pid·restarts 그대로였다. 가짜 본문을 64MB 에서 끝나게 고쳤고 최종 run 에서는 OOM 이 없다.
- 이 호스트의 로캘이 `LANG=sd_IN` 이고 GNU grep 3.7 이 C.UTF-8 에서도 계획표 한 줄의 `.*` 를 끝까지 걸지 못해 C1 검사가 거짓 FAIL 했다(파일은 유효한 UTF-8, grep 내부 원인은 못 밝힘) → 하네스를 `LC_ALL=C` 로 고정. 그 탓에 user 3 NAS 스냅샷 해시 값이 실행마다 달라 보였는데(정렬 순서), 같은 트리를 두 로캘로 계산해 e9cbb6…(sd_IN)·67bbaa…(C)로 재현했고 각 실행 안에서는 시작=끝이었다. `users/3` 아래 16:00 이후 바뀐 파일은 없다.

**Leader 결정·참고**
- 운영 백필 명령(배포 뒤): `node /home/brownjeon/apps/bjj/current/backend/scripts/task-050-backfill-long-videos.js --user 3 --skip-video-ids 74`(dry-run) → 같은 명령 + `--apply`(백업·로그는 `~/.local/share/bjj-backups/`, 끝에 되돌리기 명령 출력) → 되돌리기 `--restore <백업.json>`(dry-run) → `+ --apply`. 출력되는 스크립트 경로는 실제 릴리스 폴더(`releases/<ts>`)라, 나중에 그 릴리스가 정리되면 `current/backend/scripts/…` 로 실행하면 된다.
- 관찰(무변경): `routes/longVideos.js:361` 의 기술 적용 클립 썸네일 폴백 `frames[0]?.path || video.thumb_url` 이 이제 서버 경로가 될 수 있어, 긴 영상을 지우면 그 클립 썸네일도 깨진다. 첫 선택지인 프레임 경로가 이미 같은 이유로 깨지는 기존 동작이라 범위 밖으로 두었다.
- 관찰(범위 밖): yt-dlp 가 stderr 앞에 Python 3.10 지원 종료 경고를 붙여, 파이프라인이 사용자에게 보이는 "메타데이터 조회 실패: …" 문구도 그 경고로 시작하고 진짜 원인이 잘릴 수 있다(`ytdlp.js` 기존 동작).
- 하네스: `/home/brownjeon/.node-local/bjj-backup/task-050-20261008-151136/harness/` — `run-all.sh` 한 번으로 전부 재실행(중간에 끊지 말 것), 정리는 `cleanup.sh`.

### 2차 수정(REV-050·Codex C2 반영)

- [18:30] Developer 2차 수정 완료 — `systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=0 bash run-all.sh`(18:04~18:2x, 끊지 않음) → **`run-all: FAIL 0`**, PASS 75줄, 부정 대조 **18/18 탐지**. 워커·라우트·프론트·ytdlp 무변경(`git status -- web` 비어 있음), F8·F9·F10 은 지시대로 하지 않음.

**변경**
1. **[M1·F1] `longVideoThumb.js`** — `pruneThumbDir` → `pruneStaleTmp`: 다른 확장자 `thumb.*` 삭제 분기를 없애고 10분 넘은 `thumb.tmp-*` 정리만 남겼다(안 쓰게 된 `THUMB_FILE_RE` 삭제). 헤더·함수·`commit` 옵션 주석 갱신. 확장자가 바뀌어 남는 옛 `thumb.<ext>` 는 DELETE 의 폴더 통삭제가 회수한다.
2. **[F2·F4] 백필 `--restore`** — (a) 분류 때 `fileIdentity()` 가 sha256 과 함께 stat 서명(`ino:size:mtimeMs`)을 저장(해시를 읽는 동안 서명이 바뀌면 `changed`) (b) apply 에서 **칸마다 직전에** 진행 중 잡 재조회 + 서명 재비교 → 바뀌었으면 값·파일 유지, "분류 뒤 바뀌어 유지 N건"으로 보고(실패 아님, 종료 0) (c) 조건부 UPDATE 직후 **await 없이** 서명을 한 번 더 보고 동기 `rmSync`. 고아 파일도 잡 재조회 → 행 재조회(참조 안 함) → 서명 재비교 뒤에만 삭제 (d) 삭제마다 try/catch, `removed` 를 즉시 `flush()`. 이미 원복된(`already`) 칸의 파일도 고아 후보로 본다(F4: UPDATE 와 rm 사이에서 끊기거나 rm 이 실패해도 다음 restore 가 회수). 해시는 다시 읽지 않는다. 테스트용 `hooks.beforeRestoreRow(id, col)` 추가. Codex 의 "격리 rename 후 해시 재검증"은 지시대로 채택하지 않음.
3. **[F3·F7] 잠금** — `--backup-dir` 와 무관한 고정 위치 `~/.local/share/bjj-backups/.task-050-user<id>.lock`(테스트 격리용으로만 `BJJ_BACKFILL_LOCK_DIR`). 내용 `pid host ISO시각`. EEXIST 때 같은 host 이고 `process.kill(pid,0)` 이 ESRCH 면 지우고 1회 재시도, 아니면 거부. 풀 때는 내용이 내 것일 때만 지운다. 실행 로그 첫 줄에 `# 잠금: <경로>`(회수했으면 `죽은 잠금 회수: <원래 내용>`).
4. **[F5]** `--user` 를 두 번 주면 거부(exit 2). **[F6]** `video_path = ''` 를 NULL 과 같이 '비어 있음'으로: UPDATE 조건 `(video_path IS NULL OR video_path = '')`, 백업의 원래 값으로 `''` 를 기록해 restore 가 `''` 로 되돌린다(계획표는 원래 빈 값을 '받기·저장'으로 보였다).

**테스트·하네스 변경**
- `unit-thumb.js` PASS 147/0 — 확장자 교체 단언 반전(옛 thumb.webp·thumb.png 남음 + DB 가 가리킬 새 파일 있음) · **교차 쓰기 8조합**(Reviewer `scratchpad/rev50/race1.js` 기반: A commit 지연 중 B 가 rename+commit, jpg/webp·webp/jpg·jpg/png·png/webp × 마지막 DB 기록자 A/B) → DB 가 가리키는 파일이 항상 있음. 옛 동작(정리 부활) 사본으로 이 두 검사가 FAIL 하는 것을 먼저 손으로 확인(`DB=…/thumb.jpg files=` 공백 재현).
- `wire-thumb.js` PASS 22/0 — P2 "옛 thumb.jpg 는 남김".
- `unit-backfill.js` PASS 85/0 — 새 픽스처 R9(`video_path ''`)·R10(restore 분류 뒤 재분석이 썸네일을 같은 경로로 원자 교체)·R11(restore 분류 뒤 `running` 잡 생김) · F4(R3 폴더 0555 로 rm 실패 → 종료 1·값 원복·파일 남음 → 0755 후 재실행이 고아로 회수·폴더 삭제·백업 `removed=restore-orphan`) · 잠금(apply 중 고정 위치·내용 형식·`--backup-dir` 에 잠금 없음, 살아 있는 pid/다른 host 거부·다른 `--backup-dir` 로도 거부, 죽은 pid 회수, 기본 위치 경로) · `--user` 중복 exit 2. 결과: R10 thumb_url 서버 경로·교체된 파일 보존 + 영상 칸만 정상 원복, R11 두 칸 유지 → 잡 제거 뒤 재실행에서 원복, R9 저장 후 `''` 로 원복, updated_at 전부 보존.
- `neg.sh` — 결함을 `negbe/specs/<이름>.txt` 에 글자 그대로 적는 방식으로 바꿈. 새로 넣은 결함: **NX**(다른 확장자 정리 부활, 예전 NP 대체) → 교차 쓰기 FAIL · **NT1**(apply 직전 서명 재확인 제거) → R10 FAIL · **NT2**(잡 재확인 제거) → R11 FAIL · **NF4**(already 칸 파일을 고아에서 제외) → F4 FAIL · **NL**(잠금을 backup-dir 아래로) → 잠금 위치 FAIL · **NLS**(죽은 잠금 회수 제거) · **NDU**(`--user` 중복 허용) · **NE**(`IS NULL` 만) → R9 FAIL. 기존 NA·NM·NR·NS·NK·ND·NU·NC·NH·NG 는 바뀐 코드에 맞춰 스펙 갱신 후 모두 탐지. **NS 사본이 64MB 가짜 본문을 `pulled=1025` 에서 끝내고 정상 종료**함을 별도 확인.
- `run-all.sh` 새 검사: 실행 cgroup 의 `memory.max`(=6442450944) 확인 · 운영 기본 backup 폴더(`~/.local/share/bjj-backups`) 내용 시작=끝 · 기본 잠금 위치에 task-050 잠금 없음 · 하네스 잠금 폴더 비어 있음. `common.sh` 에 `BJJ_BACKFILL_LOCK_DIR=$H/locks`(user 1 + 별도 폴더로 격리).
- 최종 run: user 3 `long_videos` 스냅샷 시작=끝 `8 7 2cefae3b32210b8b16e6ab80f877ba62` · 잡 `done:10` · NAS users/3 트리 같음 · user 3 dry-run strace 쓰기 0 · user 1 잔여물 0·NAS `users/1` 없음·`/tmp` 0 · 운영 `bjj` pid 277664 restarts 0 · 비밀 값 0건 · 실행 중 OOM kill 0건(커널 로그, 18:05 이후).

**이번 라운드에서 생긴 일(정직하게)**
- 18:02 4차 run 의 결함 사본 NDU(중복 `--user` 허용)가, 내 테스트가 `--user 3 --user 1 --apply` 를 `--backup-dir` 없이 부른 탓에 **user 1 에 실제 apply** 를 돌렸다. user 1 행이 0건이라 DB·NAS 쓰기는 없었고(로그: "행 0/0 … 할 일이 없어 아무것도 쓰지 않았습니다"), 운영 기본 폴더에 로그 파일 1개(`task-050-20261008-180220-user1-apply.log`)만 남겨 지웠다. 테스트를 dry-run·user 1·없는 id(`--only 999999999`)·하네스 backup-dir 로 바꿨고, 결함 사본에서도 아무것도 쓰지 않는다. 그 뒤 run-all 에 "기본 backup 폴더 불변" 검사를 넣어 최종 run 에서 PASS. 다른 `runMain` 호출은 전부 `--backup-dir` 와 user 1 만 쓴다(`--user x` 1건은 어떤 결함 사본에서도 인자 오류).
- 17:31 커널 로그의 OOM kill 1건은 `MemoryMax` 가 실제로 걸리는지 확인하려고 내가 200MB 상한 scope 에서 512MB 를 할당한 시험(`CONSTRAINT_MEMCG`, 그 scope 안에서만 종료)이다. 하네스 실행 중에는 0건.

**남은 것(미해결)**
- 죽은 잠금을 두 실행이 **같은 순간에** 회수하면 늦게 지운 쪽이 먼저 잡은 새 잠금을 지울 수 있다(사양대로 구현, 충돌 직후 동시 시작에서만).
- 재확인과 UPDATE/rm 사이의 ms 창은 남는다(Reviewer 판정 2 의 운영 규칙 "restore 중 재분석·삭제 금지"로 다룸).
- 확장자가 바뀐 영상의 옛 `thumb.<ext>` 는 DELETE 전까지 남는다(M1 설계상 허용).

### 3차 수정(REV-050-2·Codex 2차 반영)

- [19:10] Developer 3차 수정 완료 — `systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=0 bash run-all.sh`(18:46 시작, 끊지 않음) → **`run-all: FAIL 0`**, PASS 79줄, 부정 대조 **20/20 탐지**. 변경은 백필 스크립트 한 파일뿐(썸네일 서비스·파이프라인·storage·라우트·프론트·ytdlp 무변경). Codex 2차 #2·#3(기존 파일 덮어쓰기)은 지시대로 건드리지 않음.

**변경 (`backend/scripts/task-050-backfill-long-videos.js`)**
1. **[N1 필수] 죽은 잠금 회수 CAS** — `acquireLock(user, hooks)`: 죽은 pid 로 판정한 뒤 (a) `<잠금>.recover` 를 비재귀 `mkdirSync` 로 잡고(EEXIST → "다른 실행이 잠금을 회수 중입니다(<guard 경로>) — … 확인 후 rmdir <guard 경로>") (b) guard 안에서 잠금 파일을 다시 읽어 처음 읽은 holder 와 다르면 "회수하려는 사이 다른 실행이 먼저 잠갔거나 풀었습니다 — 다시 실행" 으로 중단 (c) 같으면 `rmSync` → `take()`(wx, EEXIST 면 같은 오류) (d) `finally` 에서 `rmdirSync(guard)`. 테스트 전용 `hooks.afterLockRead`(holder 를 읽은 직후, 운영에서는 비어 있음). `main` 은 `deps.hooks` 를 넘긴다. `acquireLock` export. `BJJ_BACKFILL_LOCK_DIR` 격리는 그대로.
2. **[선택] 계획표에 대상 폴더 기존 파일** — 각 행 둘째 줄 끝에 `· 기존: video.mp4 55.0MB` / `(폴더 없음)` / `(빈 폴더)`(`folderSummary`: readdir·stat 만, 읽기 전용). user 3 dry-run 결과: id 74 만 `기존: video.mp4 55.0MB`, 나머지 7건 `(폴더 없음)` — Reviewer 가설 (a)(대상 7건 폴더 없음)를 dry-run 출력만으로 apply 직전에 다시 볼 수 있다. dry-run 무쓰기(strace)는 그대로 PASS.
3. **[선택·L1] restore 종료 코드 3** — 끝 줄을 `RESTORE 끝 — 되돌림 X칸 · 분류 뒤 바뀌어 유지 N건 · 실패 M건` 으로 항상 N 을 적고, 실패가 없고 N>0 이면 `— 미완료(종료 코드 3): 잡이 끝난 뒤 같은 백업으로 다시 restore 하세요` + **exit 3**. 실패가 있으면 1 이 우선, 0/1/2 의미는 그대로. 헤더 주석에 종료 코드 표 추가.

**테스트·하네스**
- `unit-backfill.js` PASS 90/0 — 기존 "죽은 pid 회수" 유지 + **결정적 인터리빙**(P2 의 `afterLockRead` 안에서 P1 이 끝까지 회수 → P1 만 보유, P2 는 "먼저 잠갔" 오류, 잠금 내용 = P1, `.recover` 없음) + `.recover` 잔재 시 거부(메시지에 guard 경로·`rmdir`, 잠금 파일 그대로) → 지운 뒤 회수 성공·guard 남지 않음 + 계획표 둘째 줄(R4 `기존: video.mp4 …MB`, R1 `기존: (폴더 없음)`) + restore 분류 뒤 유지 3건 → **exit 3**·끝 줄 N=3, 잡이 끝난 뒤 재실행은 exit 0·`유지 0건`.
- `lock-race.js`(신규, run-all 의 (c1') 단계) — 실제 node 프로세스 둘을 같은 ms 에 출발(바쁜 대기 정렬)시켜 같은 죽은 잠금을 회수, 1.2초 보유. **30회: 둘 다 EXIT 0 = 0건, 매 회 정확히 하나 보유(30/30), 잠금·`.recover` 잔재 0**. 하네스 전용 잠금 폴더 사용.
- `neg.sh` — **NCAS**(guard 안 재읽기 제거) → 인터리빙 검사 FAIL(`p2err=null`, 둘 다 보유) · **NEX3**(exit 3 → 0) → 종료 3 검사 FAIL(`code=0`). 기존 18개 포함 20/20.
- 🔴 **정직하게: 실제 두 프로세스 경합 테스트는 옛 코드도 못 잡았다.** 참고로 돌린 NCAS0(회수 CAS 이전 코드 — guard·재읽기 둘 다 없음) 사본도 이 하네스의 30회에서 `둘다=0 하나=30`. Reviewer 재현(보유 2.5초, 30회 중 5회)과 달리 이 환경·이 출발 정렬로는 창(수 µs)에 걸리지 않았다. 따라서 수정이 맞다는 근거는 **결정적 인터리빙 테스트 + NCAS 부정 대조**이고, lock-race 는 "현재 코드로 이중 보유가 관찰되지 않음" 이상을 증명하지 않는다.
- 최종 run 불변 확인: user 3 `long_videos` 스냅샷 시작=끝 `8 7 2cefae3b32210b8b16e6ab80f877ba62` · 잡 `done:10` · NAS users/3 트리 같음 · user 3 dry-run strace 쓰기 0 · user 1 잔여물 0·NAS `users/1` 없음·`/tmp` 0 · 운영 `bjj` pid 277664 restarts 0 · 기본 backup 폴더(`~/.local/share/bjj-backups/`) 내용 불변(`task-047-…-user3.json` 하나) · 하네스 잠금 폴더 비어 있음 · 실행 중 OOM kill 0건(커널 로그).

**이번 라운드에서 생긴 일**
- 하네스 편집 중 내 셸 명령의 heredoc 구분자(`EOF`)가 그 안에 넣은 스펙 본문의 `EOF` 줄과 겹쳐, 파이썬이 잘린 채 실패하고 나머지 줄을 bash 가 실행했다. `$SPECS` 가 비어 `cat > /NCAS0.txt` 두 번은 Permission denied 로 거부됐고 문법 오류에서 멈춰 아무것도 쓰이지 않았다(neg.sh·run-all.sh·작업트리 변경 0, `/` 에 파일 없음 확인). 이후 편집은 스크래치 파일의 파이썬 스크립트로 했다.

**남은 것(미해결)**
- 실제 두 프로세스 경합 재현은 이 하네스에서 옛 코드로도 나오지 않았다(위 🔴). CAS 의 정당성은 결정적 테스트로만 보였다.
- 회수 중 비정상 종료로 `.recover` 가 남으면 다음 apply 가 거부된다(메시지가 경로와 `rmdir` 를 안내 — L2 수용).
- 재확인과 UPDATE/rm 사이 ms 창·옛 확장자 썸네일 잔재는 2차 기록 그대로.

## 리뷰 기록

- [17:35] Reviewer 1차 감사 + Codex C2 3건 판정 — **판정: PASS-with-notes** (CRITICAL 0 · HIGH 0 · MEDIUM 2 · LOW 8). 차단 결함은 못 찾았다. 다만 Codex 지적 3건 중 2건은 코드 추적과 재현으로 사실로 확인했고 완화가 저렴해 **채택 → Developer 수정 → Reviewer 재검증 → QA** 를 권고한다(QA 가 같은 경로를 두 번 돌지 않도록 수정을 QA 앞에 둔다).

**직접 확인한 것** (순수 함수·로컬 가짜 서버·스크래치패드만 사용, NAS·DB·운영 포트 쓰기 0 — `ls` 로 NAS 에 테스트 폴더가 안 생긴 것도 확인)
- `git diff -- web` 0줄 · 변경은 longVideoPipeline.js(+48)·storage.js(+14)와 신규 2파일뿐. longVideoPipeline.js diff 전체를 읽었다: S1 한 줄 + S1.5(`saveThumbnailStep`) + export 한 줄이고 S3.5·경고 로직은 한 글자도 안 바뀜.
- **SSRF**: `checkThumbUrl` 에 49종 악성·변형 URL(`i.ytimg.com.evil.com`·`evilytimg.com`·`i.ytimg.com@evil.com`·`evil.com@i.ytimg.com`·`i.ytimg.com.`·대문자·`ı.ytimg.com`(punycode)·전각 점/슬래시·`%2f`·`%00`·IPv4 10진/16진·IPv6 `[::1]`·`[::ffff:127.0.0.1]`·`:8443`·`:443`·`http:`·`//host`·`https:host`·`\`) 투입. 허용으로 나온 것은 전부 정규화된 `href` 가 `*.ytimg.com`/`img.youtube.com` 이었고(요청은 raw 가 아니라 `checked.url` 로 나간다), 나머지는 거부. 호스트 우회 없음.
- **받기 안전성(실제 undici fetch ↔ 127.0.0.1 서버, `MemoryMax=3G` scope)**: 압축 408KB → 풀면 400MB 인 gzip 폭탄(content-length 는 작다)을 35ms 에 "5242880 bytes 초과"로 끊음(RSS 증가 없음) · 302 는 따라가지 않음 · 404 거부 · 정상 JPEG 저장 후 폴더에 `thumb.jpg` 만 남음(임시 0). 누적 바이트 상한이 content-length 가 아니라 해제된 스트림 기준으로 동작한다.
- **백필 인자**: `parseArgs` 32종 투입 — `--user` 누락·`3.5`·`-3`·`0`·`3e1`·초과 정수·공백, `--only 74,`·`0`·`1,,2`·값 누락, `--restore` 값 누락/다른 플래그와 병용, 모르는 인자(`--help`·`--user=3` 포함)는 전부 exit 2 거부. `--dry-run`/`--apply` 순서 의존(마지막 승리)은 안전 방향만 확인.
- 코드로 확인(실행 아님): 모든 SELECT/UPDATE 에 `user_id` · 조건부 UPDATE(`thumb_url <=> 백업값`, `video_path IS NULL`)와 `updated_at = updated_at` 4곳 모두 · 백업 JSON 은 첫 쓰기 전 `flush()`(원자 rename, 0600) · restore 는 칸 이름 화이트리스트·경로 `users/<uid>/long-videos/<id>/(thumb.*|video.mp4)` 정확 일치·sha256·`created_files` 만 삭제(id 74 의 `video.mp4` 는 기록 대상이 아님) · 모듈 `require` 시 워커·sync 등 부작용 없음(`models/index.js`, 파이프라인 모두 확인).
- 배포 가정: `apps/bjj/current/backend` 에 `.env`(→ shared) 심볼릭과 `node_modules` 가 있어 릴리스 폴더에서 스크립트가 `.env` 를 읽을 수 있다. 롤백(코드만 되돌림)해도 `/uploads/…/thumb.*` 값은 `<img src>` 로 그대로 동작하고, 구버전 S1 이 덮어써도 고아 파일만 남는다.

**확인하지 못한 것** (개발자 보고를 '주장'으로 취급하고 재현하지 않았다)
- run-all/unit-thumb/unit-backfill/wire/cli/neg 의 PASS 카운트(146·22·69·11/11 등) — 이 스크립트들은 DB·NAS(users/1)에 쓰므로 실행하지 않았다. 코드 읽기에서 모순은 발견하지 못했다.
- 실제 MariaDB 에서 `updated_at = updated_at` 가 값을 보존하는지, 실제 yt-dlp/ffprobe 코덱 판정, dry-run strace 무쓰기, 실제 폰/WebView 표시.
- 개발자 보고에서 **사실과 다른 항목은 없었다.** 개발자가 "못 한 검증"에 적은 jpg/webp 겹침 경합은 아래 F1 과 같은 것이다.

**지적**
- **F1 [MEDIUM] `backend/src/services/longVideoThumb.js:94-107, 208` (= Codex #1)** — `pruneThumbDir` 가 `keepExt` 가 아닌 모든 `thumb.<ext>` 를 DB 참조 확인 없이 지운다. 재현(`/tmp` 폴더, commit 만 주입): A(jpg) commit 이 늦게 반환되는 사이 B(webp) 가 rename+commit → `DB = …/thumb.webp | files = [] | DB 파일 존재 = false`(B 의 prune 이 jpg, A 의 prune 이 webp 를 지움). 권고: 아래 판정 1.
- **F2 [MEDIUM] `backfill:607-677` (= Codex #2)** — restore 가 시작 때 한 번만 진행 중 잡·해시를 보고 `UPDATE`(662)와 `rmSync`(666, 고아 669)는 재확인 없이 한다. 권고: 판정 2.
- **F3 [LOW] `backfill:273-283, 697` (= Codex #3, 내 등급은 LOW)** — 잠금이 `--backup-dir` 아래라 다른 폴더를 주면 같은 user 의 두 실행이 막히지 않는다. 권고: 판정 3.
- **F4 [LOW] `backfill:624, 666`** — restore 가 UPDATE 와 `rmSync` 사이에서 끊기거나 rm 이 예외(EACCES)면, 다시 돌려도 그 칸은 `already`(값이 이미 원복)로 분류되고 `handledFiles` 에 들어가 있어 **만든 파일이 영구히 남는다**(고아 판정 루프가 건너뜀). 파일은 참조되지 않는 잔재일 뿐이고 DELETE 가 폴더째 지운다. 권고: `already` 분기의 `cf` 도 "sha 일치·행이 참조하지 않음"이면 고아 후보에 넣고, 각 rm 직후 `removed` 를 `flush()`.
- **F5 [LOW] `backfill:69`** — `--user 3 --user 4` 가 조용히 마지막 값(4)을 쓴다. 반복 지정은 거부하는 편이 안전(운영 명령 조립 실수 방지).
- **F6 [LOW] `backfill:259 vs 546`** — `video_path` 가 빈 문자열 `''` 인 행은 계획상 '받기·저장'인데 UPDATE 가 `video_path IS NULL` 이라 0행 → 다운로드·복사 후 "경합"으로 파일을 지우고 실패 보고(데이터 손실 없음, 낭비). 코드에서 `''` 를 쓰는 곳은 못 찾았고(현재 user 3 은 dry-run 에서 "(빈 값)" = NULL 로 표시) 가능성은 낮다.
- **F7 [LOW] `backfill:708-720`** — SIGINT/SIGTERM 은 처리하지만 SIGHUP/SIGKILL 이면 `/tmp/bjj-bf050-*`(최대 수백 MB)와 잠금이 남는다. 잠금은 오류 문구가 수동 삭제를 안내하지만 실행 환경(터미널 끊김)이 흔하므로 F3 의 pid 생존 확인을 같이 넣으면 해소.
- **F8 [LOW] `backfill:435-441, longVideoThumb.js:98-101`** — 백필 전부터 같은 이름의 `thumb.*` 가 있으면 덮어쓰기/타 확장자 삭제가 백업에 남지 않는다. 그 파일은 DB(원격 URL)가 가리키지 않는 잔재라 실해는 없다. F1 의 M1 을 채택하면 후자는 사라진다.
- **F9 [LOW] `longVideoPipeline.js:679`** — S1 이 서버 경로를 무조건 유지하므로, 서버 파일이 사라졌고(NAS 정리 등) S1.5 도 실패하면 깨진 경로가 남는다. 재분석 시 S1.5 가 다시 저장하므로 정상 경로에서는 회복. 조치 불필요, 관찰.
- **F10 [LOW, DEFER-기존결함] `ytdlp.js` fetchMeta/downloadVideo · `registerVideo` · 백필 `probeFormat`(:191)** — URL 을 `--` 없이 yt-dlp 인자로 넘기고, 등록은 `v=<11자>` 만 있으면 어떤 문자열이든 받는다(옵션 주입 여지). 파이프라인에서 이미 있던 구조이고 이번 대상 7건은 dry-run 에서 메타 길이가 DB 와 일치해 정상 URL 임이 확인된다. 이번 task 에서 고치지 않고 별도 후속으로.
- **F11 [INFO]** `routes/longVideos.js:361` 클립 썸네일 폴백이 서버 경로가 될 수 있고 긴 영상 DELETE 시 같이 깨진다 — 개발자 관찰에 동의, 범위 밖. dry-run 도 로그 파일과 `--backup-dir` 폴더를 만든다(문서화돼 있음, DB·NAS·/tmp 는 아님).

**Codex C2 지적 판정** (래퍼 확인: Codex 로그의 `git diff --stat 8613000..ed2e1c5` 에 `task-050-backfill-long-videos.js | 723`·`longVideoThumb.js | 258` 이 들어 있고, 인용한 줄 번호(thumb:196, backfill:611·627-632·640-642·662-666·669·697)가 현재 작업트리와 정확히 일치한다 → untracked 신규 2파일이 스냅샷에 **포함됐다**. 같은 스냅샷에 이 task 와 무관한 미커밋 변경 15개(`.codex/*`·`AGENTS.md`·`CLAUDE.md`·vault)도 딸려 갔으나 지적에는 영향 없음)
- **1. [HIGH→내 등급 MEDIUM] ADOPT.** 주장 그대로 사실이다(위 재현). 다만 창이 매우 좁다: 한쪽의 commit→prune 구간, 또는 다른 쪽의 rename→commit 구간(수 ms~수십 ms)에 두 쓰기 주체가 같은 영상에서 겹치고 확장자가 달라야 한다. 확장자 불일치는 우연이 아니다 — 백필은 DB 의 `vi_webp/…webp` 를 받고(5건) 재분석은 yt-dlp 현재 메타를 받는다 [추측: jpg 일 수 있음]. 깨지면 재분석이 회복시키지만 백필은 "이미 서버 경로"라 건너뛰므로 스스로 복구하지 못한다. Leader 가설의 "드문 경합" 부분은 맞고, "결과가 원본 데이터 손실"은 아니다(썸네일·영상은 유튜브에서 다시 받을 수 있는 파생물이고 챕터·분석 데이터는 무관).
  - **최소 변경 사양(M1, 권장)**: `pruneThumbDir` 에서 다른 확장자 `thumb.*` 를 지우는 분기(L98-101)를 없애고 오래된 `thumb.tmp-*` 정리만 남긴다. "남의 파일은 지우지 않는다"로 경합 종류 자체가 사라진다. 프로토타입(스크래치 복사본)으로 같은 재현을 돌려 `DB → thumb.webp, files=[thumb.jpg, thumb.webp], DB 파일 존재 true` 확인. 새로 생기는 것: 확장자가 바뀐 뒤 옛 `thumb.<ext>` 잔재가 남음(수십~수백 KB, DELETE 의 폴더 통삭제가 회수; restore 는 `created_files` 만 지우므로 무관; 백필 `preexisting` 처리가 이미 이를 고려). 프론트가 기대하는 `thumb.<ext>` 이름·`longVideoThumbWebPath`·restore 경로 검사는 불변. 고쳐야 할 것: 헤더 주석(L12-15)·설계 문구, 테스트 3곳의 단언을 "정리됨"→"옛 파일 남음, DB 가 가리키는 파일은 존재"로 반전(`unit-thumb.js` 확장자 교체 블록 L209-215, `wire-thumb.js` P2 "thumb.jpg 정리"), 부정 대조 NP("commit 전 정리")는 "다른 확장자를 지우면 FAIL" 대조로 교체.
  - 대안 M2: 정리 직전에 DB 의 현재 `thumb_url` 을 다시 읽어 그 파일은 안 지움 + **수정 후 60초 미만 파일은 안 지움**(grace). DB 재조회만으로는 부족하다 — 상대 쓰기 주체가 rename 만 하고 commit 전인 파일은 아직 참조되지 않아 지워진다(Leader 완화 후보 1 의 구멍). 프로토타입은 재현을 통과했으나 `currentWebPath` 옵션을 파이프라인·백필 두 호출부에 넣어야 하고(빠뜨리면 보호가 조용히 사라짐) 기존 테스트는 옛 파일을 방금 만들므로 `graceMs:0` 주입이 필요해 M1 보다 크다. 세대별 고유 파일명은 `longVideoThumbWebPath`·`THUMB_FILE_RE`·백필 `FILE_BASENAME_RE`·restore 경로 검사·전 테스트를 건드리고 그래도 참조 인지 정리가 필요해 비추천. 영상별 잠금은 프로세스 내 mutex 로는 백필(별 프로세스)을 못 막고 MySQL `GET_LOCK` 은 전용 커넥션 관리가 필요해 비추천.
- **2. [HIGH→내 등급 MEDIUM] ADOPT-PARTIAL.** 코드상 사실(L611 한 번 조회, L627-632 해시, L662-666 UPDATE→rm, L669 고아 rm 에 재확인 없음). 다만 실제 겹침이 되려면 restore 시작 뒤에 재분석이 큐에 들어와 S1.5(yt-dlp 메타 이후, 수 초) 또는 S3.5(다운로드 이후, 분 단위)에 도달해야 하는데, 가장 긴 구간은 첫 UPDATE 전의 분류 단계(최대 영상 7개의 sha256 을 NFS 에서 읽는 시간)뿐이다. 파일이 지워져도 DB 가 원격 URL/NULL 로 같이 원복되면 상태는 일관(복원의 의도와 같음)이고, 깨진 참조(DB=서버 경로+파일 없음)는 S1.5 commit 이 restore UPDATE 뒤·rm 앞에 끼는 ms 창이다.
  - **최소 변경 사양**: (a) 분류 때 `sha256` 과 함께 `stat` 서명(ino·size·mtimeMs)을 `cf`/고아 항목에 저장 → (b) apply 루프에서 행마다 직전에 `activeJobVideoIds(db,[id])` 재조회(활성이면 건너뜀 보고) + 서명 재비교(불일치면 conflict 로 값·파일 유지) → (c) 조건부 UPDATE 직후 즉시 `rmSync`(그 사이 await 없음), 고아 파일도 서명 재비교 + 행이 참조하지 않는지 재조회 후 삭제 → (d) 각 rm 을 try/catch 하고 `removed` 즉시 `flush()`(F4 와 함께). 해시를 다시 읽지 않고 stat 만 보므로 NFS 읽기 시간은 늘지 않는다. 새 문제 없음(DB 스키마·restore 규약 불변); 테스트는 기존 harness 의 `hooks` 패턴으로 `beforeRestoreRow` 를 추가해 "분류 뒤 재분석이 파일을 교체/잡이 생김" 2건을 더하면 된다. **채택하지 않는 부분**: Codex 의 "고유 이름으로 격리 rename 후 해시 재검증" — ms 창까지 닫지만 중간 상태(격리본 잔재)가 새로 생겨 비용 대비 과함. 대신 운영 규칙으로 "restore 중 재분석·삭제 금지"를 Leader 절차에 적는다.
- **3. [MEDIUM→내 등급 LOW] ADOPT.** 사실(L273 `acquireLock(args.backupDir…)`, L697). 운영자가 같은 user 로 `--backup-dir` 만 바꿔 두 번 apply 하는 실수에만 해당하고 기본 경로로 쓰면 막힌다. 그래도 한 줄 수준 수정이라 채택. **최소 변경 사양**: 잠금 파일을 `--backup-dir` 와 무관한 고정 위치 `~/.local/share/bjj-backups/.task-050-user<id>.lock` 로(테스트 격리용으로만 환경변수 `BJJ_BACKFILL_LOCK_DIR` 허용), 내용은 `pid host ISO시각`, EEXIST 때 같은 host 이고 `process.kill(pid,0)` 가 ESRCH 면 죽은 잠금으로 보고 지운 뒤 한 번 재시도(F7 해소). 새로 생기는 것: `unit-backfill.js` L178·L199-201 이 `BK/task-050-user1.lock` 을 가정하므로 환경변수를 `BK` 로 주입하고 단언 경로를 맞춰야 한다; 고정 위치라 개발자·QA 가 같은 픽스처 user 로 동시에 돌리면 서로 막는다(환경변수로 실행별 분리). 이 잠금은 스크립트끼리만 막으므로 웹 파이프라인과의 겹침은 판정 1·2 가 담당한다. MySQL advisory lock 은 전용 커넥션이 필요해 비추천.

**Leader QA 가 집중할 항목**
1. 수정(M1·restore 재확인·잠금)이 들어온 뒤 Reviewer 재검증 → QA 순서로. run-all/neg 는 Leader 가 돌리되 메모리 제한 scope 아래서.
2. 배포 위생: 신규 2파일(`longVideoThumb.js`·`task-050-backfill-long-videos.js`)은 **git 미추적**이다 — 배포는 origin ref 기준이라 커밋·push 에 반드시 포함해야 한다. 같은 작업트리의 `.codex/*`·`AGENTS.md`·`CLAUDE.md`·vault 변경은 이 task 와 무관하므로 커밋을 분리한다.
3. 운영 백필 직전: id 74 `video.mp4` 의 `sha256sum`·`ls -li` 를 기록해 apply 뒤 같은지 대조(restore 후에도). user 3 `long_videos` 스냅샷(값·updated_at)·`long_video_jobs` 활성 0건 재확인. apply 중에는 사용자가 재분석·삭제하지 않게 안내(판정 2 의 운영 규칙).
4. 릴리스 폴더(`apps/bjj/current/backend/scripts/…`)에서 dry-run 을 먼저: 헤더의 `DB_NAME@DB_HOST`·NAS 경로가 운영 값인지, `.env` 가 읽히는지.
5. apply 뒤: 7건 `Range` 206·`video/mp4`, 8건 썸네일 `/uploads` 200 `image/*`+`nosniff`, `updated_at` 7→8행 전부 그대로, 백업 JSON 600, `--restore` dry-run 출력, `/tmp/bjj-bf050-*` 0, 잠금 파일 없음.
6. 사용자 폰에서 목록 `<img>`·상세 poster 표시(미검증). 유튜브 없이도 표시되는지는 서버 경로로 직접 열어 확인.

### 재확인(REV-050-2)

- [18:40] Reviewer 재확인 + Codex C2 2차(호출 2/4) 3건 판정 — **판정: PASS-with-notes** (CRITICAL 0 · HIGH 0 · MEDIUM 1 · LOW 3). **수정이 필요한 것은 1건뿐이다 — 죽은 잠금 회수의 CAS(N1).** 1차 수정(M1·restore 재확인·--user 중복·`''`)은 사양대로 들어갔다. 코드는 수정하지 않았다.

**직접 확인한 것** (스크래치 샌드박스·가짜 DB·읽기 전용 NAS stat 만 사용 — 운영 DB·NAS 쓰기 0, 하네스 run-all/neg 미실행, 스크립트는 `MemoryMax` scope 아래)
- (1) 사양: `longVideoThumb.js` `pruneStaleTmp` 가 오래된 `thumb.tmp-*` 만 지움(`THUMB_FILE_RE`·`pruneThumbDir` 참조 잔존 0, `node --check` OK). `--user 3 --user 4` → exit 2. `video_path=''` 행: apply 가 연결하고 restore 가 `''` 로 되돌림(가짜 DB 왕복, 백업 `before:""`). 잠금 고정 위치·`pid host ISO`·살아 있는 pid/다른 host/내용 이상은 거부, 죽은 pid 는 회수(실행 확인).
- (2) 재현 `race1.js`(실제 모듈, 이번엔 M1 적용 코드): **`DB = …/thumb.webp | files = [thumb.jpg, thumb.webp] | DB 파일 존재 = true`**(이전: `files = []`). 추가로 3개 쓰기 주체·무작위 확장자·무작위 commit 지연 **300회에서 "DB 가 가리키는 파일 없음" 0건**, 임시 파일 누수 0. `pruneStaleTmp` 범위: 1시간 된 `thumb.tmp-old` 만 삭제, `thumb.tmp-new`·`thumb.jpg/png/webp`·`video.mp4`·1시간 된 `video.mp4.tmp-job-1` 은 보존.
- (3) M1 부작용(샌드박스 7행 restore, 실제 `main()`): 백필이 webp → 그 뒤 재분석이 jpg 로 교체(DB=jpg, 옛 webp 잔재)한 행은 **충돌로 값·파일 둘 다 유지**(잔재를 "스크립트가 만든 파일"로 오인해 지우지 않음 — `created_files` 에 있는 경로+sha 일치+행이 안 가리킴 조건이 모두 맞을 때만 지우고, 이 경우는 `keep` 으로 빠진다). 지난 restore 가 UPDATE 뒤 rm 전에 끊긴 상태(F4)는 고아로 회수되고 빈 폴더도 삭제. id 74형(영상은 원래 있고 썸네일만 스크립트가 만듦)은 원본 `video.mp4` 바이트가 그대로 남고 폴더는 `created_dirs` 에 없어 유지. 전체 되돌림 행은 파일+폴더 삭제. 두 번째 restore 는 잡이 사라진 행만 이어서 처리하고 나머지는 변화 없음. DELETE 라우트·`storage.js` 무변경이라 폴더 통삭제 그대로. 남는 비용: 확장자가 바뀐 영상은 DELETE 전까지 옛 `thumb.<ext>` 가 최대 2개 남음(수십~수백 KB).
- (4) restore 새 로직: **NFS 서명 안정성** — 실제 NAS(`nfs vers=3,hard,relatime`)의 id 74 `video.mp4` 를 읽기 전용으로 stat 25회/10초 + 부분 읽기·디렉터리 나열 사이에 반복 → `ino:size:mtimeMs` 서명 **1종**(false conflict 없음; 서명은 매 실행 분류 때 새로 만들어 실행 간에 남지 않는다). 파일을 rename 으로 교체하면 ino 가 바뀌어 감지(샌드박스 105: 분류 뒤 같은 경로 교체 → "충돌 … 값·파일 유지", 106: 분류 뒤 잡 생성 → 건너뜀 후 재실행에서 원복). 조건부 UPDATE → `statSig` → `rmSync` → `flush` 가 동기 연쇄이고 `removeNow` 가 삭제마다 `removed` 를 즉시 기록(코드 확인). 다만 첫 `statSig` 와 UPDATE 사이(DB 왕복 1회)에 파일이 교체되면 값은 원격 URL 로 원복되고 새 파일은 남는다 — 일관된 상태(고아 파일만). 앱이 실제로 내용을 다시 저장한 파일은 이후에도 영구 충돌(의도).
- (5) 잠금: 환경변수 `BJJ_BACKFILL_LOCK_DIR` 는 repo(스크립트·task 문서 외)·`backend/.env`·`shared/.env`·`ecosystem.config.js`·`.bashrc/.profile`·현재 프로세스 환경·pm2 어디에도 없다(하네스 `common.sh` 가 자기 프로세스 안에서만 설정). 실행 로그 첫머리의 `# 잠금: <경로>` 가 비기본 경로를 드러낸다.
- (6) 무회귀: `longVideoPipeline.js`·`storage.js` 는 1차 감사 때와 같은 diff(+47/-1, +14, 수정 시각 15:05/15:04 — 1차 감사 이전)이고 `git diff -- web` 0. dry-run(샌드박스, 가짜 fetchMeta/HEAD): `--backup-dir` 밖 파일 트리(사용자 폴더·tmp)·잠금 폴더·DB 행 모두 불변, restore dry-run 도 상태 불변.

**새 지적**
- **N1 [MEDIUM] 죽은 잠금 회수에 CAS 없음 (`backfill:~300-317`, = Codex 2차 #1)** — 1차 감사에서 내가 쓴 사양("지운 뒤 한 번 재시도")의 결함이다. 실제 두 프로세스를 동시에 띄워(보유 2.5초로 겹치게) 죽은 잠금을 둘 다 회수: **30회 중 5회 두 실행이 모두 "죽은 잠금 회수"를 출력하고 EXIT 0**. 최악 인터리빙 프로토타입: 현재 코드 **둘 다 보유**, Leader 가설 (c)(1) `rename(lock→lock.dead-*)` 도 **둘 다 보유**(P2 의 rename 이 P1 의 새 잠금을 옮긴다), 삭제 직전 재읽기·회수 mutex 는 하나만 보유. 운영 영향은 "죽은 잠금이 남아 있는 상태에서 apply 두 개가 ms 단위로 동시에 시작"해야 하므로 사람 1명 1회 실행에서는 사실상 0 — 그래도 상호배제 코드가 주장대로 동작하지 않으므로 수정한다.
- **L1 [LOW] restore 종료 코드** — 분류 뒤 잡이 생기거나 파일이 바뀌어 "유지 N건"이 있어도 exit 0 이다(출력의 `분류 뒤 바뀌어 유지 N건` 만이 신호). 미완료 restore 를 성공으로 오인할 수 있으니 Leader 는 출력 마지막 줄을 읽을 것(코드 변경은 선택: late>0 이면 exit 3).
- **L2 [LOW] `.recover` 폴더 잔재(N1 수정의 부작용)** — 회수 중 크래시하면 다음 apply 가 "회수 중"으로 거부한다. 메시지에 경로·`rmdir` 안내를 넣으면 충분.
- (1차 지적 F4·F5·F6·F7·F8 은 해소 확인. F9·F10·F11 은 지시대로 미조치 — 변동 없음.)

**Codex C2 2차 판정** (스냅샷 `829a838`: `git diff --stat` 에 `task-050-backfill-long-videos.js | 814`·`longVideoThumb.js | 256` 포함 → untracked 신규 2파일 포함 확인. 인용 줄 번호 312/478/570/589 가 현재 파일과 일치)
- **#1 [HIGH→MEDIUM] ADOPT.** 위 N1 과 같다. 사실이며 재현했다.
  - **최소 변경 사양(S1)**: 죽은 pid 로 판정한 뒤 (a) 회수 전용 `guard = file + '.recover'` 를 `fs.mkdirSync(guard)` 로 잡는다(EEXIST → "다른 실행이 잠금을 회수 중" 오류) (b) guard 안에서 잠금 파일을 **다시 읽어 `holder` 와 다르면 중단** ("회수하려는 사이 다른 실행이 먼저 잠갔습니다") (c) 같으면 `rmSync` → `take()`(wx, EEXIST 면 같은 오류) (d) `finally` 에서 `rmdirSync(guard)`. 약 12줄, 다른 코드는 불변. 대안 S1'(3줄): guard 없이 삭제 직전 동기 재읽기만 — 프로토타입에서 최악 인터리빙은 통과하지만 읽기~삭제 사이 µs 창이 남는다. S1 을 권장.
  - **새로 생기는 문제**: L2. 회수 시점에 잠금 파일이 이미 풀려 있으면(앞선 실행이 방금 끝남) 이번 실행은 "먼저 잠갔습니다"로 중단하지만 다시 실행하면 정상 획득. 웹 파이프라인과는 무관(스크립트끼리만).
  - **테스트**: 기존 "죽은 pid 회수" 유지 + (i) 결정적 인터리빙 — `acquireLock` 에 테스트 전용 hook(`hooks.afterLockRead`, 비어 있으면 무동작)을 두어 P2 가 holder 를 읽은 뒤 멈추고 P1 이 끝까지 가도록 해 "P1 만 보유, P2 오류" 단언 (ii) 두 프로세스 동시 시작 30회에서 둘 다 EXIT 0 인 경우 0건 (iii) 끝난 뒤 `.recover` 폴더 없음. 부정 대조: 재읽기 제거 사본이 (i)(ii) 에서 FAIL 해야 한다.
- **#2 [HIGH] 부분 사실 → REJECT(id 74 주장) + DEFER-수용위험(동등 파일 교체).**
  - 메커니즘(`fileExisted` 면 `created_files` 에 안 올라가고 `persistVideo` 가 `video.mp4` 를 UPDATE 보다 먼저 원자 교체)은 코드대로 사실이다. 그러나 실행으로 확인한 결과: **id 74형 행(video_path 있음 + 원본 `video.mp4`, `--skip-video-ids` 를 일부러 안 줌)은 `persistVideo` 가 호출되지 않고 원본 바이트가 그대로**다 — `planRow`(video_path 비어 있지 않으면 건너뜀) → `backfillVideo` 의 `fresh` → `again` 3중 검사가 `--skip-video-ids` 보다 먼저/별도로 막는다. "옵션 실수 시 id 74 교체"는 사실이 아니다(74 의 video_path 를 DB 에서 NULL 로 지우지 않는 한).
  - 파이프라인이 마지막 검사 뒤에 저장하는 경합(샌드박스 203): UPDATE 가 0행이 되지만 `now.video_path === saved.webPath`(경로가 영상별로 고정)라 **파일 유지**, DB 는 존재하는 파일을 가리킨다. 이 경우 `created_files` 에는 올라 있고 `applied:false` 라 restore 가 건드리지 않는다(행이 참조하는 파일은 고아 후보에서 제외). **Codex 의 "롤백 필요" 권고는 오히려 틀리다** — 롤백하면 파이프라인이 기록한 DB 가 가리키는 파일을 지운다.
  - 교체되는 내용은 같은 유튜브 영상을 같은 포맷 지정으로 받아 길이 ±5%·H.264+AAC 검증을 통과한 동등 파일이다(Leader 가설 b 동의). 이전 실행이 남긴 고아 `video.mp4`(샌드박스 202)는 오히려 **덮어써서 연결**되어 자가 복구된다.
- **#3 [HIGH] DEFER-수용위험** — #2 와 같은 근거. 샌드박스 204(같은 확장자 경합): 백필의 UPDATE 가 0행 → `now.thumb_url === out.webPath` 라 파일 유지, DB 는 존재하는 파일. 205(다른 확장자 경합): 백필이 만든 webp 만 삭제하고 DB=파이프라인의 jpg 가 존재. 206(같은 확장자 잔재 + DB 는 원격): 동등 이미지로 덮고 연결, restore 는 잔재를 남김(무해).
- **Leader 가설 판정**: (a) **부분만 맞다.** HIGH-1 은 스크립트끼리의 경합이고(웹과 무관), HIGH-2/3 의 "이미 존재" 변형은 동시성 없이도(이전 실행이 크래시하며 남긴 고아) 생긴다. 운영 사실은 확인됨 — 방금 읽기 전용 `ls`: `users/3/long-videos/` 아래 폴더는 **`74` 하나뿐**(대상 7건 폴더 없음). (b) **맞다**(동등 파일) + 74 보호는 위 실행으로 직접 확인. (c)(1) **틀리다** — rename 만으로는 P2 가 P1 의 새 잠금을 옮겨 둘 다 보유(프로토타입 실증); 재읽기 또는 mutex 가 필요. (c)(2) **채택하지 않는다**: ① 경합 창(검사~rename 사이 복사 수 초)을 닫지 못하고 ② 크래시 잔재 때문에 "영원히 건너뛰는" 행이 생겨 자가 복구를 잃으며(202) ③ 썸네일은 M1 이후 "같은 확장자 파일이 있는데 DB 는 안 가리킴"이 **정상 상태**가 되었으므로(206, 확장자 교체 잔재) 존재 검사가 오탐으로 연결을 영구히 막는다. 큰 구조 변경(영상별 잠금·DB 선점 후 저장·교체 전 백업)은 1회 실행 스크립트에 과하다는 판단에 동의한다.

**이번이 마지막 라운드가 되도록 필요한 최소 사양**
1. **(필수) S1** — 위 #1 의 잠금 회수 CAS(+ 테스트 3종 + 부정 대조). 이것만 고치면 된다.
2. (선택·2줄, 읽기 전용) 계획표 행에 대상 폴더의 기존 파일을 보여 준다(`기존: video.mp4 57.6MB` / `(폴더 없음)`). Leader 가 dry-run 출력만으로 가설 (a) 를 apply 직전에 재확인할 수 있다. `unit-backfill` 에 계획표 줄 형식을 단언하는 곳이 있으면 그 줄만 맞춘다.
3. **(코드 변경 없음, 운영 절차)** apply 직전 확인 — `ls users/3/long-videos` 에 `74` 하나뿐 · `env | grep BJJ_BACKFILL` 비어 있음 · 실행 로그 첫머리 `# 잠금:` 이 `~/.local/share/bjj-backups/.task-050-user3.lock` · `long_video_jobs` 활성 0건 · id 74 `video.mp4` 의 `sha256sum`·`ls -li` 기록 · apply/restore 중 재분석·삭제 금지. restore 는 끝 줄의 `분류 뒤 바뀌어 유지 N건` 이 0 인지 읽는다(L1).

**Leader QA 가 집중할 항목(갱신)**: S1 반영 뒤 Reviewer 재검증(잠금만) → QA. 신규 2파일은 여전히 git 미추적이므로 커밋·push 에 포함. 나머지 QA 항목은 1차 기록의 1~6번 그대로.

### 재확인(REV-050-3)

- [19:15] Reviewer 3차 재확인 — **판정: PASS** (CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 2, 둘 다 수용). S1 잠금 회수 CAS·계획표 `기존:` 줄·restore 종료 코드 3 이 사양대로 들어갔고, 이번 라운드에서 다른 것은 바뀌지 않았다. **차단 사항 없음 — QA 진행 가능.** 코드는 수정하지 않았다. 하네스 run-all/neg 는 돌리지 않았다(운영 DB·NAS 쓰기 0, 모든 실행은 스크래치 샌드박스·가짜 DB·`MemoryMax` scope).

**직접 확인한 것**
- **(1) S1 사양 일치** — 코드 읽기: `mkdirSync(guard)` 비재귀(EEXIST → 오류에 guard 경로와 `rmdir <경로>` 안내) → guard 안에서 잠금 파일 재읽기 → `holder` 와 다르면 중단(없음/바뀜 모두) → `rmSync` → `take()`(wx, EEXIST 면 오류) → `finally` 에서 `rmdirSync(guard)`. `afterLockRead` 는 `deps.hooks` 에서만 오고 CLI(`cli()`)는 `{isAborting}` 만 넘기므로 운영 경로에서는 비어 있다.
  - **결정적 인터리빙(P2 가 holder 를 읽은 직후 P1 이 회수·획득을 끝까지 마침)을 실제 코드와 변형 사본 4종으로 직접 실행**(스크래치패드 `det_test.js` + `v3/*.js`, BACKEND 상수만 절대경로로 바꾼 사본): 현재 코드 **P1 보유 / P2 오류("먼저 잠갔거나 풀었습니다") — 하나만**, 잔재 없음. CAS 이전 코드(`old`) **둘 다 보유**, 재읽기만 뺀 사본(개발자 NCAS 와 같은 변형) **둘 다 보유**, guard 만 뺀 사본(S1')은 **하나만**(재읽기가 이 인터리빙을 막기 때문 — guard 는 재읽기~삭제 사이 µs 창용이라 결정적 테스트로는 구분되지 않는다. 수용: 사양에서 S1 을 권장한 이유 그대로).
  - **부정 대조 확인**: 위 결정적 테스트는 옛 코드와 NCAS 사본을 실제로 FAIL 시킨다(개발자 보고 NCAS 탐지에 동의).
  - **개발자 보고 "실제 두 프로세스 30회가 옛 코드도 못 잡았다" — 사실일 수 있으나 테스트 방식 차이다.** 내 방식(두 node 를 `&` 로 거의 동시에 띄우고 보유 시간 2.5초로 겹침; `lock_race2.sh`)으로 같은 30회를 돌리면 **옛 코드: 둘 다 EXIT 0 = 6/30 · 둘 다 "죽은 잠금 회수" 출력 6 · 종료 후 잠금 잔재 1**, **현재 코드: 둘 다 EXIT 0 = 0/30 · 정확히 하나만 EXIT 0 = 30/30 · 잔재 0**. 즉 현재 코드의 실제 경합 무결과는 "관찰되지 않음"이 아니라 옛 코드를 잡는 테스트로 대조된 결과다. 권고(선택): 하네스 `lock-race.js` 의 출발 정렬(busy-wait)이 창을 비껴간 것이므로, 같은 방식(출발 지터 + 겹침 보유)을 추가하면 이 테스트도 옛 코드를 잡는다.
- **(2) 크래시·무회귀** — 시나리오 7종(현재 코드, 가짜 빈 DB `--apply`): ① 잠금 없음 → 획득·해제, 남은 파일 0 ② 살아 있는 pid → 거부, 잠금 그대로·guard 없음 ③ 다른 host → 거부 ④ 죽은 pid+같은 host → 회수 성공·`# 잠금: … (죽은 잠금 회수: …)` 로그·잔재 0 ⑤ 내용 이상 → 거부 ⑥ **`.recover` 잔재 + 죽은 잠금 → 거부("잠금을 회수 중입니다(<경로>.recover) … 확인 후 rmdir <경로>"), 잠금 파일·guard 그대로 → 안내대로 `rmdir` 후 재실행 → 회수 성공·잔재 0** ⑦ `.recover` 만 있고 잠금 파일 없음 → 정상 획득(guard 는 회수 때만 쓰임). L2 로 남는 것: ⑦ 의 잔재 `.recover` 는 이후 그 잠금이 죽었을 때 한 번 거부를 만든다(안내 메시지로 해소, 운영 영향 없음).
  - apply 경로 무회귀: 직전 라운드의 샌드박스 6행 시나리오(`apply_h.js`)를 현재 코드로 다시 실행 → 출력·백업(`created_files`·`writes`) 이전과 **동일**(id 74형 원본 `video.mp4` 바이트 보존 · 파이프라인 경합 3종은 DB 가 가리키는 파일 유지). `args.js` 인자 fuzz 결과도 동일(`--user` 중복 exit 2 포함). 단, 그 샌드박스의 202·203 행 "썸네일 참조 없음" 표시는 내가 만든 **픽스처**(DB 가 서버 경로인데 파일이 없는 행)이며 코드 결함이 아니다(실제 user 3 썸네일은 전부 원격 URL).
- **(3) 계획표 `기존:` 줄** — `folderSummary` 는 `readdirSync`·`statSync` 만 쓴다(코드 확인) — 호출은 계획표 한 곳(`:408`)뿐. 샌드박스 dry-run: `기존: (폴더 없음)` / `(빈 폴더)` / `thumb.jpg 0.0MB, video.mp4 0.0MB` 로 표시, **`--backup-dir` 밖의 파일 트리(사용자 폴더·tmp)·잠금 폴더·DB 행 불변**(dry-run 은 잠금도 잡지 않음). 작은 파일은 `0.0MB` 로 보이나 운영 영상(수십 MB)·썸네일(수십~백 KB, `0.0~0.1MB`)에는 문제 없음.
  - **종료 코드 의미**: apply 경로는 0(완료)/1(실패)/2(인자 오류, `main` 에서)이고, **3 은 `runRestore`(apply) 에서 "실패 0 · 분류 뒤 유지 N>0" 일 때만** 나온다(실패가 있으면 1 우선). 샌드박스 restore: 분류 뒤 파일 교체 1 + 분류 뒤 잡 생성 1 → `… 유지 2건 · 실패 0건 — 미완료(종료 코드 3): 잡이 끝난 뒤 같은 백업으로 다시 restore 하세요` **exit 3** → 잡을 지운 뒤 재실행 `유지 0건` **exit 0**. dry-run restore 는 0. 충돌 없음.
  - L1(수용): 분류 때 이미 "파일이 백필 뒤에 교체됨" 으로 `덮지 않음(충돌)` 에 든 칸(앱이 다시 저장한 파일)은 의도적으로 영구 보존이라 **exit 0** 이다 — Leader 는 끝 줄의 `유지 N건` 과 함께 출력의 `## 덮지 않음(충돌): N칸` 도 읽을 것. 또 "UPDATE 뒤 파일이 바뀜"으로 `late` 가 된 칸은 재실행에서 할 일이 없어 exit 0 으로 끝나지만(값은 이미 원복, 새 파일은 고아로 남음 — 무해) 첫 실행의 exit 3 은 정상 신호다.
- **(4) 변경 범위** — `longVideoThumb.js` 수정 시각 17:32:02, `longVideoPipeline.js` 15:05:51, `storage.js` 15:04:00 로 REV-050-2 기록(18:40) 이전이다. `git diff -- longVideoPipeline.js storage.js` 의 md5 가 REV-050-2 때와 **동일**(`26c3f0de…`), `git diff -- web` 0줄. 백필 스크립트만 18:42 에 바뀌었고 변경 지점은 헤더 주석·`folderSummary`·`acquireLock`(+ `main` 이 hooks 전달)·계획표 줄·restore 끝 줄/반환값·export 뿐이다(apply 루프·`backfillThumb/Video`·restore 분류는 위 재실행에서 이전과 같게 동작). `node --check` OK.

**Leader QA 가 집중할 항목(갱신)**
1. **운영 apply 직전**(코드 변경 없음, 2차 기록 3번 그대로): `ls users/3/long-videos` 에 `74` 하나뿐 · `env | grep BJJ_BACKFILL` 비어 있음 · 로그 첫머리 `# 잠금:` 이 `~/.local/share/bjj-backups/.task-050-user3.lock` · `long_video_jobs` 활성 0건 · id 74 `video.mp4` 의 `sha256sum`·`ls -li` 기록. **dry-run 계획표의 `기존:` 줄이 74 만 `video.mp4`, 나머지 7건 `(폴더 없음)` 인지 눈으로 확인**(개발자 보고와 일치해야 함).
2. restore 를 쓰게 되면 끝 줄 `분류 뒤 바뀌어 유지 N건` 과 `덮지 않음(충돌)` 을 함께 읽고, exit 3 이면 잡이 끝난 뒤 같은 백업으로 한 번 더.
3. 배포 위생: `longVideoThumb.js`·`task-050-backfill-long-videos.js` 는 아직 **git 미추적** — 커밋·push 에 포함(무관한 `.codex/*`·`AGENTS.md`·`CLAUDE.md`·vault 와 커밋 분리).
4. 나머지 QA 항목은 1차 기록 1·4·5·6번 그대로.

## QA 기록

**Leader 직접 실행 (2026-10-08, QA 에이전트 미사용 — task-048·049 와 같은 방식).** 대상: 마지막 수정 라운드(잠금 회수 guard·계획표 기존 파일·restore 종료 코드 3)까지 반영한 **최종 코드**. 명령: `systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=0 bash ~/.node-local/bjj-backup/task-050-20261008-151136/harness/run-all.sh` 1회 완주(중단 없음, **메모리 상한 안에서** — 개발 중 상한 없는 부정 대조 사본이 15GB 로 폭주해 OOM 킬이 두 번 난 전력 때문). 로그: 스크래치패드 `leader-050-run-all.log`.
- 결과: **PASS 79줄 · FAIL 0줄 · `run-all: FAIL 0` · exit 0** (PASS/FAIL 줄 수를 따로 집계). 부정 대조 **20/0** 탐지(SSRF 허용목록·HTML 위장·6MB·확장자 정리 부활·S1 서버 경로 유지·삭제 후 고아·`updated_at` 보존·조건부 UPDATE 경합·`''` video_path·restore 충돌/재확인/F4 회수·잠금 위치/죽은 pid/인터리빙 CAS·중복 `--user`·종료 코드 3).
- 실제 yt-dlp·썸네일 CDN·Claude E2E(user 1 행): 썸네일 저장·서빙, 재분석 후 서버 경로 유지, 백필 왕복(dry-run 무쓰기 → apply → restore) 포함.
- user 3 dry-run(읽기 전용): 행·잡·NAS 트리·/tmp 시작=끝 동일, 계획표 출력.
- 정리·불변(QA 직후 직접 재확인): user 1 테스트 행·고아·NAS(`users/1`)·/tmp·프로세스 0, **user 3 `long_videos` md5 `42864bc6…` 기준과 동일**(8행·서버 썸네일 0·저장본 id 74 하나), NAS `users/3/long-videos` 는 `74` 하나(`video.mp4` 만), 기본 백업 폴더 `~/.local/share/bjj-backups/` 불변(task-047 백업만), 운영 pm2 `bjj` pid 277664·restarts 0, QA 구간 OOM 0건.
- 🟡 **미검증**: 폰/브라우저 화면(프론트 무변경이라 task-049 확인 포함), 3시간급 영상, 실제 blue/green 겹침, 운영 user 3 apply/restore(배포 뒤 Leader 가 실행).

## 운영 백필 기록

(Leader — 배포 후)


## Codex 검토

### [2026-10-08 17:18] C2 adversarial-review focus=concurrency — 완료
- judge 판정: 판단 기록(judge) C2 · 호출 차수: 1/4
- 대상: repo=/home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning base=8613000(task_file) snapshot=ed2e1c5
- **지적 3건**:
  - [high] backend/src/services/longVideoThumb.js:196 — 같은 영상에 백필과 재분석이 동시에 실행되고 다른 확장자(jpg/webp)를 받은 뒤 DB commit과 pruneThumbDir 순서가 교차할 때, 파일 정리가 다른 실행이 방금 DB에 연결한 파일을 삭제(원자성 부재). → `long_videos.thumb_url`이 존재하지 않는 서버 파일을 가리켜 목록과 플레이어 썸네일 깨짐. (권고: 영상별 공용 잠금으로 rename-DB갱신-prune 전체를 직렬화하거나 DB 재조회로 정확한 파일만 보존, 또는 세대별 파일명으로 격리)
  - [high] backend/scripts/task-050-backfill-long-videos.js:611 — --restore 시작 시 활성 잡 조회 후 파일 해시 검사(627~632행)와 DB 복원(662~666행) 사이에 같은 영상의 재분석이 끼어들어 동일 경로 파일 교체, 재검사 없이 기존 파일 삭제 → 복원이 재분석이 방금 만든 정상 썸네일/영상을 삭제, DB는 이전 외부 URL/NULL로 되돌아가 재분석 결과와 파일 소실. (권고: 복원 직전 활성 잡 재확인, DB 갱신과 파일 삭제 사이에도 세대 보호·hash 재검증)
  - [medium] backend/scripts/task-050-backfill-long-videos.js:697 — 잠금 파일이 사용자가 지정할 수 있는 args.backupDir 아래 생성, 같은 user도 backupDir 다르면 다른 lock 획득해 동시 실행 → 사용자별 단일 실행 보증 미성립, 썸네일 교차 prune·파일 덮어쓰기·restore 경합 위험. (권고: 잠금을 고정 로컬 경로로 이동·user ID로 키, 영상별 DB advisory lock 또는 파일 잠금으로 저장·정리를 통합)
- 검토하지 못한 범위: 운영 user 3 --apply/--restore · 실제 blue/green 배포 전환 · 모바일 WebView 파일 소실 후 동작 · 기존 워커 claim 부재 문제
- 원본: /home/brownjeon/NFS/homes/brownjeon/project/.claude/state/codex-review/runs/20261008T081830Z-task-050-C2/raw.txt

**판정요약**: 동시성 안전성 미충족. 썸네일 저장 후 정리·restore 파일 삭제·잠금 메커니즘의 3가지 경로에서 데이터 손실(존재하지 않는 파일 참조·재분석 결과 소실)이 가능. Reviewer와 함께 동시성 보호 추가 후 재검토 필요.

## 최종 요약

(Leader — 완료 후)

## 데모 검토 (demo gate)

> 실행 판정 정본은 frontmatter `demo_gate` 이다. 이 표는 check.mjs 가 함께 기록하는 사람용 이력이다(docs/demo-review-gate.md).

| 버전 | 상태 | 저장소 파일 | Artifact | 사용자 결정 | 일시 |
|---|---|---|---|---|---|
| - | 해당없음 | - | - | judge: none | 10-08 14:58 |

### [2026-10-08 18:29] C2 adversarial-review focus=concurrency — 완료
- judge 판정: 판단 기록(judge) C2 · 호출 차수: 2/4
- 대상: repo=/home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning base=8613000(task_file) snapshot=829a838
- **지적 3건** ([high]): 
  - [high] backend/scripts/task-050-backfill-long-videos.js:303 — 동일 user에 대한 두 프로세스가 기존 죽은 PID 잠금을 거의 동시에 발견하고, 첫 프로세스가 잠금을 삭제·재생성한 뒤 두 번째 프로세스가 312행 rmSync를 실행할 때, 옛 잠금 내용을 두 프로세스 모두 읽고 dead=true로 판정. A가 옛 파일 삭제 후 take()로 새 잠금 생성 사이 B가 무조건적 rmSync로 A의 새 잠금 삭제 → 둘 다 자신이 잠금 보유한다고 믿고 실행. → 동일 사용자의 apply/restore 동시 실행으로 같은 DB 칼럼·NAS 파일 덮어쓰기·삭제, 백업 JSON 판단과 실제 파일 상태 어긋남. (권고: 원자적 rename/link 또는 OS 파일 잠금 사용, 최소한 삭제 직전 파일 재개방하여 inode·내용 확인, 옛 잠금에서 바뀌면 회수 중단)
  - [high] backend/scripts/task-050-backfill-long-videos.js:568 — video_path가 비어 있지만 video.mp4 이미 존재하거나, 마지막 검사(562~571행) 후 웹 파이프라인이 같은 영상의 video.mp4 저장할 때, 백필은 fileExisted 기록 후 persistVideo가 고정 경로를 원자 교체하고 DB 조건부 UPDATE는 그 후 수행. 파이프라인이 먼저 video_path 기록하면 589행 UPDATE 실패하지만 fileExisted=true이면 created_files에 등록 안 됨 → 백필이 파이프라인 파일 또는 기존 파일을 이미 덮어쓴 상태로 남음. → DB는 웹 파이프라인 경로 유지하지만 실제 video.mp4는 백필 다운로드본. 제외 대상 id 74도 옵션 실수·경합 시 복구 불가능하게 교체될 수 있음. (권고: DB 조건부 소유권 파일 교체 전 확보 또는 영상별 파일 잠금, 기존 파일 있으면 별도 백업 후 UPDATE 실패 시 원자적 복구)
  - [high] backend/scripts/task-050-backfill-long-videos.js:478 — 동일 확장자의 thumb 파일 이미 있거나, 잡 검사(474행) 후 웹 파이프라인 S1.5가 같은 확장자 썸네일 저장하는 동안 백필 실행, preexisting은 이름만 기록하고 기존 바이트 보존 안 함. persistThumbnail이 DB 조건부 UPDATE 전에 thumb.<ext> rename으로 교체하고 494행 UPDATE 경합으로 실패해도 해당 이름이 preexisting에 있으면 created_files에 등록 안 됨 → 조용히 롤백 대상 밖. 양쪽 rename과 DB UPDATE 순서 엇갈리면 DB는 같은 경로, 파일 내용은 마지막 rename 주체의 것. → 백필이 웹 파이프라인이 새로 저장한 썸네일이나 기존 서버 썸네일 조용히 덮어씀, 조건부 UPDATE 충돌 감지해도 원본 복구 불가능. (권고: 썸네일도 영상별 잠금 또는 DB 선점 후 저장, 기존 동일 확장자 파일 교체 전에 원자적 백업, commit 실패 시 복원, 교체 직전 파일 identity 검증)
- 검토하지 못한 범위: 실제 MariaDB/NFS 경합 재현(READ-ONLY 제약) · 운영 user 3 apply/restore · 실제 blue/green 동시 실행 · 기존 워커 원자적 claim 부재·reanalyze/tick 이중 픽업
- 원본: /home/brownjeon/NFS/homes/brownjeon/project/.claude/state/codex-review/runs/20261008T092843Z-task-050-C2/raw.txt

**판정요약**: 1차 지적 4개(M1·restore 재확인·잠금·기타)에 대해 Developer가 수정했으나, Codex adversarial-review는 3개 high severity 경합을 새로 발견. 고정 위치 잠금 변경에도 불구하고 unlink TOCTOU 남음. 백필의 파일 교체(영상·썸네일)가 DB 조건부 UPDATE보다 먼저 실행돼 UPDATE 실패 후에도 파일 복구 불가. stat 서명 기반 restore 자체에서는 이보다 확실한 신규 결함 없음. Reviewer·QA·Leader가 이 3경로에 대한 완화·수용 여부 판단 필요.
