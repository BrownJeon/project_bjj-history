---
name: task-033-ytdlp-error-message-clarity
aliases: ["영상분석 실패 메시지", "Python 경고 오해", "사진 캐러셀"]
tags:
  - type/task
  - domain/backend
  - domain/ux
related_tasks:
  - "[[task-032-instagram-cookie-session-validation]]"
  - "[[task-030-gym-master-chat]]"
status: done
created: 2026-09-11
updated: 2026-09-11
---

# task-033 — 영상 분석 실패 메시지가 진짜 원인을 가린다

## 사용자 보고
"영상분석을 했는데 ai분석 실패가 났어. **파이썬 버전 만료 관련된 것 같은데** 로그확인해서 원인 해결해줘"

## 🔴 Leader 실측 — Python 은 원인이 아니다

| 확인 | 결과 |
|---|---|
| 실패 로그 | `[auto-analyze] clip 182 실패: Deprecated Feature: Support for Python version 3.10 has been deprecated. Please update to Python 3.11 or above` **+ 줄바꿈 +** `ERROR: [Instagram] …: No video formats found!` |
| 환경 | python3 **3.10.12** · yt-dlp **2026.08.19**(shebang `/usr/bin/python3`) — 경고일 뿐 yt-dlp 는 **정상 동작한다**(같은 바이너리로 다른 URL 은 성공) |
| clip 182 URL | `https://www.instagram.com/p/Dc94101EyyF/?img_index=5&stkn=…` — **`img_index`** 가 붙은 `/p/` 게시물 |
| **재현** | `yt-dlp --cookies … --dump-json --skip-download --ignore-no-formats-error <URL>` → **항목 7개, 전부 `formats: 0`**(uploader `rolling lab 롤링랩`) = **사진 7장 캐러셀. 영상이 하나도 없다** |
| 쿠키 | 오늘 22:26 갱신, `sessionid` **있음**(task-032 의 검증 통과) — 인증 문제 아님 |

**진짜 원인**: 분석하려는 인스타그램 게시물에 **영상이 없다**(사진만 7장).
**사용자가 Python 을 의심한 이유**: `videoAnalysis.js:116` 이 `err.trim()`(stderr 원문)을 그대로 사용자 메시지로 쓰는데, yt-dlp 의 **Python deprecation 경고가 stderr 첫 줄**이라 메시지가 그것으로 시작한다. 진짜 원인(`No video formats found`)은 뒤에 묻히고, 300자 컷에 잘리기도 한다.

## 계약 L (dev-033 · 백엔드만)

### L-1 stderr 잡음 제거 (`backend/src/services/videoAnalysis.js` `runProcess`, ~116행)
사용자 메시지를 만들 때 stderr 에서 **아래 잡음 줄을 버린다**(서버 로그에는 원문 전체를 남긴다 — 진단에 필요하다):
- `Deprecated Feature: Support for Python version …`
- `please report this issue on …github…` / `filling out the appropriate issue template` / `Confirm you are on the latest version using yt-dlp -U`
- `WARNING:` 로 시작하는 줄(에러가 따로 있을 때만)
잡음을 걷어낸 뒤 남는 첫 `ERROR:` 줄을 기준으로 삼는다. **전부 잡음이면** 기존처럼 종료 코드 문구로 떨어진다.

### L-2 알려진 실패를 한국어로 번역
걷어낸 에러에서 패턴을 인식해 **사용자가 무엇을 해야 하는지 아는 문장**으로 바꾼다. 원문은 서버 로그에만.

| yt-dlp 에러 | 사용자 메시지(안) |
|---|---|
| `No video formats found` | `이 게시물에는 영상이 없습니다 — 사진만 있는 게시물이에요. 영상 게시물이나 릴(reel) 주소를 넣어 주세요.` 🔴 **가능하면 사진 장수를 덧붙인다**(아래 L-3) |
| `Requested content is not available` / `login required` / `rate-limit` | 기존 `instagramAuthHint()` 경로 유지(task-032) |
| `Video unavailable` / `This post is not available` / private | `게시물을 찾을 수 없거나 비공개입니다. 주소가 맞는지, 공개 게시물인지 확인해 주세요.` |
| 그 외 | `영상을 받지 못했습니다 — ` + 걷어낸 에러 첫 줄(200자) |

### L-3 사진 캐러셀은 미리 알려준다 (선택이지만 권장)
`No video formats found` 로 실패했을 때, **같은 URL 을 `--ignore-no-formats-error --dump-json` 로 1회 더 조회**해 항목 수를 세고 `formats:0` 뿐이면 `사진 N장` 을 메시지에 넣는다. 추가 호출은 **실패 경로에서 1회만**(정상 경로 성능 무영향), 타임아웃 30s, 실패하면 장수 없이 기본 문구.

### 하지 말 것
- 🔴 **분석 다운로드 경로에 `--ignore-no-formats-error` 를 넣지 마라** — 거기서 포맷이 없으면 그건 진짜 실패다(D-2 에서 내린 결정). L-3 는 **진단용 별도 호출**이다.
- Python 을 3.11 로 올리는 작업은 이번 범위가 아니다(백로그). yt-dlp 는 3.10 에서 **지금 정상 동작한다**.

## 검증
- 🔴 **재현 URL 로 실제 확인**: `https://www.instagram.com/p/Dc94101EyyF/` → 사용자 메시지에 **Python 문구 0건**, `사진` 이라는 단어와 장수(7)가 들어가는지.
- 정상 경로 회귀: 영상이 있는 인스타 릴 1건(`https://www.instagram.com/reel/DYlojTXODJf/` — 과거 성공 확인분)과 유튜브 1건이 **여전히 성공**하는지(실제 분석은 비용이라 `--dump-json` 단계까지만 확인해도 된다).
- 하네스 `/home/brownjeon/.node-local/bjj-backup/task-033-<ts>/`: 잡음 제거 함수 단위 검사(실제 stderr 원문 3종을 넣어 기대 문장이 나오는지) + 역검증(잡음 필터를 끄면 Python 문구가 다시 새는지).
- `pm2 restart bjj` 후 `[mig]` 정상, `/health` 200.

## dev-033 결과

- [22:32] 실제 stderr 원문 3종 확보(yt-dlp 2026.08.19 / python 3.10.12). **계약서에 없던 중요한 발견**: 버그리포트 상투 문구가 별도 줄이 아니라 `ERROR:` 줄 **안에** 세미콜론으로 붙어 온다 → 줄 단위 필터만으로는 못 걷어낸다. 그래서 필터를 **줄 단위**와 **줄 안 꼬리** 두 목록으로 나눴다.
- [22:33] 정상 릴·유튜브를 `--dump-json` 으로 돌려도 **exit 0 인데 stderr 첫 줄이 Python 경고**임을 확인 — 잡음이라는 판정의 실측 근거.
- [22:36] `backend/src/services/videoAnalysis.js` 구현 (**+176 / -1**, 이 파일만).
  - L-1 `cleanYtDlpStderr()` — `YTDLP_NOISE_LINE_PATTERNS`(6개) · `YTDLP_NOISE_INLINE_PATTERNS`(3개) 목록 + 패턴마다 "왜 잡음인지" 주석. `WARNING:` 은 **에러가 따로 있을 때만** 버린다(경고밖에 없으면 유일한 단서라서).
  - L-2 `translateYtDlpError()` — `YTDLP_ERROR_TRANSLATIONS` 표(no-video / not-found) + 모르는 에러는 `영상을 받지 못했습니다 — ` + 원문 첫 줄 200자. `not-found` 패턴에 **`HTTP Error 4xx` 를 추가**했다 — 인스타는 없는 shortcode 에 `Video info extraction failed: HTTP Error 400` 을 주고 문구에 `unavailable` 이 없다(실측).
  - L-3 `probePhotoCount()` — 실패 경로에서만 1회, 30초 상한, `runProcess(..., {diagnose:false})` 로 자기 재귀 차단. **하나라도 포맷이 있으면 0 을 반환**해 "사진 N장" 오판을 막는다.
  - `runProcess(cmd,args,timeoutMs,opts)` 4번째 인자 추가. 실패 시 `console.error('[yt-dlp] exit=… stderr(원문):…')` 로 **원문 전체를 서버 로그에 남긴다** — 걷어내는 건 사용자 문장뿐.
  - 🔴 다운로드 경로에 `--ignore-no-formats-error` **넣지 않았다**(D-2 준수). `instagramAuthHint()` 인증 분기와 유튜브 분기는 **원문 기준 판정 그대로 무변경**(task-032 경로 보존).
- [22:38] 🔴 **실제 재현 성공** — `analyzeVideo('https://www.instagram.com/p/Dc94101EyyF/')` 최종 사용자 메시지 원문:
  > `이 게시물에는 영상이 없습니다 — 사진 7장만 있는 게시물이에요. 영상 게시물이나 릴(reel) 주소를 넣어 주세요.`
  Python 문구 **0건** · `사진` 포함 · 장수 **7** 포함 · 65자. 같은 실행의 서버 로그에는 stderr 8줄 원문이 그대로 남았다.
- [22:38] 정상 회귀 — 다운로드 인자(`-f mp4/best`) 그대로 `--simulate`: 릴 `DYlojTXODJf mp4 … 30.1s` exit 0, 유튜브 `BSJa1UytM8w mp4 401 248s` exit 0, 양쪽 `No video formats` 0건. `probePhotoCount` 도 릴 0 · 유튜브 0 · 캐러셀 7 로 오판 없음.
- [22:37] 하네스 `/home/brownjeon/.node-local/bjj-backup/task-033-20260911-223151/` — 단위 **21/21 PASS**, 역검증 **4/4 PASS**(필터를 비우면 Python·상투 문구가 다시 샌다). 🔴 역검증은 `sed` 앵커를 2개 검증(각각 정확히 1건) + 치환 전후 md5 비교 + 중성화 후 `node --check` 까지 하고, **앵커를 못 찾으면 exit 9 로 죽는다** — 앵커를 지운 대조군을 실제로 돌려 exit 9 를 확인했다(조용히 통과하지 않는다).
- [22:41] `pm2 restart bjj` **1회만**(delete/start 없음). 사전 확인: status 컬럼이 있는 8개 테이블(`voice_jobs`·`master_messages` 포함) 전부 진행 중 0건, 최근 로그에 진행 중 분석 없음. 재시작 후 `[mig][task-024~030-d3]` 전부 정상, `[bjj-new] listening on :3000`, `/health` **200**(기동에 ~20초 걸린다 — 이전과 동일).
- [22:42] 변경 파일은 `backend/src/services/videoAnalysis.js` 하나. 커밋하지 않았다.

### Reviewer·QA 인계
- 하네스 재실행: `bash /home/brownjeon/.node-local/bjj-backup/task-033-20260911-223151/run.sh` (단위+역검증 한 번에, 종료코드 0 이어야 통과)
- 재현 재실행: `cd backend && node /home/brownjeon/.node-local/bjj-backup/task-033-20260911-223151/repro.js`
- 픽스처(실제 stderr 원문 3종): 같은 디렉토리 `fixtures/{photo-carousel,login-required,not-found}.stderr`
- 🔴 확인해 달라: ① 다운로드 경로에 `--ignore-no-formats-error` 가 없는지(D-2) ② 인증 분기가 **원문** `err` 기준 판정을 유지하는지(잡음 제거된 문자열로 판정하면 task-032 가 깨진다) ③ 실패 경로 추가 호출이 정말 1회뿐이고 정상 경로에는 없는지

## 부수 기록
- Python 3.10 은 yt-dlp 가 **deprecated** 로 경고 중 — 언젠가 지원이 끊긴다. 별도 백로그(오늘 실패와 무관).
- (dev-033 관찰) 로그에 `ERROR: [Instagram] DPqGStSDSZy: Failed to parse JSON (caused by JSONDecodeError…)` 가 남아 있다 — 이번 표에 없는 4번째 실패 유형이라 `영상을 받지 못했습니다 — ` 폴백으로 떨어진다. 재현 빈도를 보고 필요하면 번역 표에 추가(백로그).

## Leader 재확인 (2026-09-11)

Developer 가 지목한 위험 3건을 Leader 가 직접 확인했다:
1. `--ignore-no-formats-error` 는 **`probePhotoCount` 안에만** 있고 다운로드 경로엔 없다(D-2 결정 유지)
2. 인증 분기(`videoAnalysis.js:265`)는 여전히 **원문 `err`** 로 판정한다 — 잡음 제거된 문자열로 판정했으면 task-032 가 깨졌을 자리
3. `probePhotoCount` 호출은 실패 경로 1곳뿐이고 성공 분기엔 0건. `diagnose:false` 로 자기 재귀 차단

하네스 독립 재실행: 단위 21/21 · 역검증 4/4(필터를 끄면 Python 문구·버그리포트 문구가 다시 새고, 번역이 잡음을 문장에 담는 것까지 확인). 재현 실행 결과 사용자 메시지 원문:

> 이 게시물에는 영상이 없습니다 — 사진 7장만 있는 게시물이에요. 영상 게시물이나 릴(reel) 주소를 넣어 주세요.

65자, Python 문구 0건, 장수 7 포함. 같은 실행에서 **서버 로그에는 stderr 원문 8줄이 그대로** 남았다. 정상 회귀: 릴·유튜브 모두 `probePhotoCount=0`(사진 오판 없음), `--simulate` 다운로드 인자로 exit 0.

변경이 한 파일(+176/-1)이고 재현·회귀·역검증이 모두 실행으로 확인돼 **Reviewer·QA 전체 순환 대신 Leader 재확인으로 갈음**한다.

🔴 **Developer 가 계약에 없던 것을 잡았다**: 버그리포트 상투 문구는 별도 줄이 아니라 `ERROR:` 줄 **안에 세미콜론으로 붙어** 온다. 줄 단위 필터만 만들었으면 문구가 그대로 샜을 것이다 — 계약서(내가 쓴 L-1)의 가정이 틀렸고 실측이 바로잡았다.

## 커밋 보류 사유 (2026-09-11)
수정은 dev 의 `pm2 restart` 로 **이미 서버에 반영돼 동작 중**이다. 이 시점에 푸시하면 배포 웹훅이 앱을 또 재시작하는데, ① 사용자가 지금 앱을 쓰는 중이고(클립·기술 추가 요청 관측) ② 9/9 녹음 재업로드가 아직 안 됐다(2026-09-10 11:06 업로드가 배포 재시작으로 죽은 전례). **로컬 커밋만 하고 푸시는 사용자 확인 후.**
