---
name: task-034-photo-post-analysis
aliases: ["사진 게시물 분석", "캐러셀 분석", "photo carousel"]
tags:
  - type/task
  - domain/backend
  - domain/ai
related_tasks:
  - "[[task-033-ytdlp-error-message-clarity]]"
  - "[[task-032-instagram-cookie-session-validation]]"
status: done
created: 2026-09-11
updated: 2026-09-11
---

# task-034 — 영상이 없는 게시물은 사진을 분석한다

## 사용자 지시
1. "영상분석시 업로드한 링크가 영상이 아닌 게시물일 경우 **영상분석이 아닌 게시물 사진을 분석해서 내용을 정리하고 사진을 저장**해줄 수 있어?"
2. "사진 게시물의 경우에는 기존에 영상분석시 **10장으로 제한되어있는것에 구애받지 않고 모든 캐러셀 사진을 다운받아서** 처리해줘"

## Leader 실측 — 필요한 부품이 이미 전부 있다 (2026-09-11)

| 확인 | 결과 |
|---|---|
| 사진 URL 확보 | `yt-dlp --dump-json --skip-download --ignore-no-formats-error <post>` → 항목 7개, 각각 `thumbnails` **14종**. 가장 큰 것을 쓰면 된다 |
| 실제 다운로드 | 그 URL 을 `curl` → **HTTP 200, 804,592 bytes, JPEG** 정상 |
| 캡션(게시물 글) | 같은 JSON 의 `description` = `초보자들 이거만 기억하세요 ✨ #주짓수 #그래플링 #종합격투기 #유에프씨 #롤링랩` — **분석 정확도를 올릴 재료** |
| 🔴 AI 가 이미지를 읽는 방법 | **이미 그렇게 하고 있다** — `runCombinedAnalysis` 가 프레임 **파일 경로**를 프롬프트에 넣고 `runClaude(prompt, { tools: 'Read' })` 로 Claude 가 직접 읽는다. 사진도 같은 방식이면 된다 |
| 저장·표시 | `video_clips.frames`(JSON 경로 배열)에 넣으면 `ClipDetailModal`·`ClipsPage` 가 **이미 그려준다**(영상 프레임과 같은 자리) |
| 재현 대상 | `https://www.instagram.com/p/Dc94101EyyF/` (사진 7장, `rolling lab 롤링랩`) |

## 계약 M (dev-034 · 백엔드만)

### M-1 동작 흐름
`analyzeVideo(url, clipId, onProgress)` 에서 **영상 다운로드가 `No video formats found` 로 실패하면 사진 분석으로 전환**한다(실패로 끝내지 않는다).
```
영상 다운로드 시도
  └ 성공 → 기존 경로(프레임 추출 + 전사 + 분석) 그대로, 무변경
  └ "영상 없음" 실패 → 사진 경로:
       ① 사진 메타 조회(--ignore-no-formats-error --dump-json)
       ② 🔴 **항목 전부** 다운로드 — 장수 상한 없음
       ③ 사진 경로 + 캡션으로 분석
       ④ clipId 있으면 frames 에 전 장 저장
  └ 사진도 0장 → task-033 의 기존 실패 메시지로 떨어진다
```
🔴 **영상 10장 제한(`extractFrames`)은 긴 영상에서 표본을 뽑는 제약이다 — 사진 경로에는 적용하지 않는다.** 캐러셀 전 장을 받는다(인스타 캐러셀 상한이 20장이라 자연히 한정된다).

### M-2 다운로드
- 각 항목의 `thumbnails` 중 **가장 큰 것**(width 기준 최대)을 고른다. 없으면 `url` 폴백.
- 저장은 기존 프레임과 **같은 경로 체계**(`storage.getFramesDir` / `frameWebPath`) — 새 저장소를 만들지 마라. 파일명은 순서를 보존한다(`photo-1.jpg` …).
- 개별 장이 실패해도 **나머지로 진행**하고, 받은 장수와 실패 장수를 결과에 담는다. 전부 실패면 사진 경로 실패.
- 타임아웃: 장당 30s, 동시성은 **3 이하**(인스타 CDN 부담·차단 회피).

### M-3 분석
- 프롬프트에 **사진 경로 전부 + 게시물 캡션**을 넣고 `tools: 'Read'` 로 호출(기존 `runCombinedAnalysis` 와 같은 방식).
- 프롬프트는 "영상"이 아니라 **"사진 N장으로 이루어진 게시물"** 임을 명시하고, 캡션을 별도 블록으로 준다. 출력 형식은 기존 영상 분석 결과와 **같은 모양**(화면이 그대로 쓴다).
- 🔴 **타임아웃**: Claude 가 N장을 `Read` 하므로 기본 180s 로는 부족할 수 있다. 사진 경로는 **장수에 비례**해 잡아라(예: `60s + 20s × 장수`, 상한 600s). 근거를 주석에.
- `onProgress` 로 진행을 알린다: `사진 3/7 내려받는 중` → `사진 7장 분석 중`.

### M-4 결과·저장
- `description` = 분석 결과(기존과 동일 필드).
- `frames` = 저장한 사진 경로 **전부**(기존 필드 — 화면이 이미 그린다).
- 결과 객체에 `mediaKind: 'photo'` 와 `photoCount` 를 담아 호출부가 구분할 수 있게(프론트 변경은 이번 범위 밖 — 다음 단계에서 "사진 7장 분석"을 표시할 때 쓴다).

### 하지 말 것
- 🔴 **영상 다운로드 경로에 `--ignore-no-formats-error` 를 넣지 마라**(D-2·task-033 결정 유지). 사진 경로는 **별도 함수**다.
- task-033 의 실패 메시지·번역 표를 지우지 마라 — 사진도 0장일 때 여전히 쓰인다.
- 인증 분기(task-032)는 **원문 `err` 판정** 그대로 둔다.
- 프론트는 이번 범위 밖(`frames` 를 이미 그리므로 사진은 저절로 보인다).

## 검증
- 🔴 **재현 URL 로 실제 실행**: `https://www.instagram.com/p/Dc94101EyyF/` → 사진 **7장 전부** 저장 · `description` 에 기술 내용 요약이 들어감 · Python 잡음 0건. **결과 원문과 저장된 파일 목록**을 보고에.
- 정상 회귀: 영상 있는 릴(`https://www.instagram.com/reel/DYlojTXODJf/`)·유튜브가 **기존 경로 그대로** 동작(프레임 추출·전사). 사진 경로를 타지 않는지 확인.
- 부분 실패: 사진 URL 하나를 못 받는 상황을 주입해 나머지로 진행하는지.
- 하네스 `/home/brownjeon/.node-local/bjj-backup/task-034-<ts>/` + 역검증(장수 상한을 10으로 되돌리면 7장짜리는 안 걸리니 **20장 픽스처**로 잡거나, "상한 없음" 을 재는 검사를 따로).
- `pm2 restart bjj` 1회. 🔴 사전에 `voice_jobs`·`class_video_jobs` pending 0 확인(사용자 작업 중이면 기다린다).

## dev-034 결과

- [23:00] 🔴 **계약서(M-2)의 가정이 실측과 달랐다 — 그대로 구현했으면 잘린 썸네일을 원본으로 저장했다.**
  계약은 "`thumbnails` 중 **width 기준 최대**"였는데, 인스타 항목의 thumbnails 14개는 **키가 `url`·`id` 뿐**이다(width/height/preference 없음). width 로 정렬하면 값이 전부 `undefined` 라 비교가 항상 거짓 → **0번**이 뽑히는데, 0번은 `stp=…s1080x1080` = **1080x1080 으로 잘린 정사각(71,744 bytes)** 이다. 실제 원본은 **마지막** 항목(`stp=dst-jpg_e35_tt6`, **3274x4096 · 804,592 bytes** — Leader 실측치와 일치). 세 후보를 직접 내려받아 JPEG 헤더로 크기를 재서 확인했다(0번 1080x1080 / 7번 1080x1351 / 13번 3274x4096).
  → `pickBestPhotoUrl` 은 **width 가 있으면 최대 width**(다른 추출기 대비), 없으면 **yt-dlp 규약대로 배열 마지막**(= `entry.thumbnail` 과 동일 URL)을 쓴다. 근거를 함수 주석에 남겼다.
- [23:02] `backend/src/services/videoAnalysis.js` (**+341 / -13**) · `backend/src/routes/enhance-memo.js` (**+6**). 이 두 파일뿐, 커밋하지 않았다.
  - **M-1 전환** — 다운로드 `runProcess` 를 try/catch 로 감싸고 `e.ytdlpKind === 'no-video'` 일 때만 사진 경로로 간다. 🔴 판정을 **한국어 메시지 문자열**로 하면 task-033 문구를 다듬는 순간 조용히 죽으므로, `buildYtDlpUserMessage` 가 `{message, kind, photoCount}` 를 돌려주고 `runProcess` 가 reject 하는 Error 에 `ytdlpKind` 를 붙인다(사용자 문장 자체는 task-033 과 **글자 하나 안 바뀌었다** — 하네스 F1 이 바이트 비교).
  - **M-2 다운로드** — `selectPhotoEntries`(🔴 **자르지 않는다**. 슬그머니 `.slice` 가 들어오면 하네스가 여기서 잡으라고 한 줄짜리 함수로 분리) → 동시 3장 워커 풀 → 장당 30s. 실패는 `failures` 에 담고 **나머지로 진행**, 인덱스 자리에 채워 넣어 **순서를 보존**한다(`photo-1.jpg` …). 저장은 기존 `getFramesDir`/`frameWebPath` 그대로 — 새 저장소 없음. 항목의 `http_headers`(Referer) + UA 를 함께 보낸다.
  - **M-3 분석** — `buildPhotoPrompt` 가 "**영상이 아니라 사진 N장으로 이루어진 게시물**"임을 명시하고 캡션을 별도 블록으로 준다. "보이지 않는 동작을 지어내지 말 것(정지 사진이라 시간 흐름이 없다)"을 넣었다. `runClaude(prompt, {tools:'Read', timeoutMs})`.
  - **🔴 타임아웃 산식** — `60s + 20s × 장수, 상한 600s`(7장=200s, 20장=460s). 근거: Claude 가 `Read` 로 사진을 한 장씩 직접 열고 인스타 원본은 3274x4096·800KB~1.5MB 라, 고정 180s 로는 장수가 늘면 못 넘긴다. 상한을 둔 이유는 claudeCli 실행 큐 동시성이 1이라 한 건이 뒤를 전부 막기 때문. `assertPromptSize` 는 문제없다 — 20장 프롬프트가 2,500자대(상한 24,000자, 하네스 G2 가 잰다).
  - **M-4 결과** — `description`·`frames` 는 기존 필드 그대로라 호출부 4곳(clips 2 · techniques 1 · enhance-memo 1)과 프론트는 **무변경**으로 동작한다. 추가로 `mediaKind:'photo'`·`photoCount`·`photoFailed`. enhance-memo 의 job 응답에도 `mediaKind`·`photoCount` 를 **순수 추가**했다(기존 필드 무변경).
  - 🔴 **`--ignore-no-formats-error` 는 여전히 진단 함수 안에만** 있다(D-2). task-033 의 `probePhotoCount` 와 중복 호출이 생기지 않도록 `fetchPostEntries()` 로 합치고 `probePhotoCount` 가 그것을 쓰게 했다(동작 동일). 인증 분기(task-032)는 **원문 `err` 판정 무변경**.
- [23:07] 🔴 **재현 성공** — `https://www.instagram.com/p/Dc94101EyyF/` 실제 실행, **36초**:
  `{ mediaKind:'photo', photoCount:7, photoFailed:0, method:'photo-vision', savedVideo:null }`, 저장 7장 전부 원본 해상도(`photo-1.jpg` 804,592B **3274x4096** … `photo-7.jpg` 1,542,923B), Python 잡음 **0건**. 분석 결과는 "주짓수 초보자의 가드 포지션에서 흔히 나오는 **실수 5가지**를 정리한 교육용 카드뉴스" — 사진 속 한국어 텍스트를 읽어 실수1~5를 사진 번호와 함께 각각 정리했다(원문은 `repro-run.log`).
- [23:05] 정상 회귀 — 릴 `DYlojTXODJf` · 유튜브 `BSJa1UytM8w` 를 **다운로드 인자 그대로 `--simulate`** → 둘 다 exit 0, `No video formats` 0건(= catch 자체가 안 열리므로 사진 경로를 탈 수 없다). `probePhotoCount` 도 릴 0 · 유튜브 0 · 캐러셀 7 로 오판 없음. 하네스 H6 이 "없는 게시물(not-found) 실패는 사진 경로를 타지 않는다"를 코드로 잰다(fetch 0회 · AI 0회).
- [23:09] 하네스 `/home/brownjeon/.node-local/bjj-backup/task-034-20260911-225859/` — 단위 **28/28 PASS**, 역검증 **6/6 PASS**.
  네트워크·claude 없이 **실제 코드 경로를 끝까지** 돈다: 가짜 yt-dlp 를 `YTDLP_PATH` 로 주입 + `globalThis.fetch` 스텁 + `require.cache` 로 `runClaude` 교체 → `analyzeVideo()` 를 그대로 호출(H1~H7).
  🔴 "상한 없음"은 7장으로는 못 재므로 **20장 픽스처**를 만들어 잰다(H2: 20장 전부 분석 · 타임아웃 460s). 역검증 R1 이 `selectPhotoEntries` 에 `.slice(0,10)` 을 넣어 그 검사가 **실제로 죽는지** 확인한다.
  역검증 6종: R1 장수 상한 삽입 / R2 타임아웃 180s 고정 회귀 / R3 계약서 문자 그대로(잘린 썸네일) / R4 `ytdlpKind` 제거 / R5 부분 실패 시 전체 중단 / R6 다운로드 경로에 `--ignore-no-formats-error` 삽입(D-2 위반). 전부 기대한 검사가 FAIL 했고 원본 md5 복구까지 확인한다. **앵커를 못 찾으면 exit 9 로 죽는다** — 앵커를 지운 대조군을 실제로 돌려 exit 9 를 확인했다(조용히 통과하지 않는다).
- [23:08] `pm2 restart bjj` **1회만**(delete/start 없음). 사전 확인: status 컬럼이 있는 8개 테이블(`voice_jobs`·`class_video_jobs`·`master_messages` 포함) **전부 진행 중 0건**, 최근 로그에도 진행 중 분석 없음. 재시작 후 `[mig][task-024~030-d3]` 전부 정상, `[bjj-new] listening on :3000`, `/health` **200**. 프로세스 기동(23:08:54)이 마지막 파일 수정(23:08:25)보다 뒤 — 새 코드로 떠 있다.

### Reviewer·QA 인계
- 하네스 재실행: `bash /home/brownjeon/.node-local/bjj-backup/task-034-20260911-225859/run.sh` (단위+역검증, 종료 코드 0 이어야 통과)
- 재현 재실행: `cd backend && node /home/brownjeon/.node-local/bjj-backup/task-034-20260911-225859/repro.js` (실제 yt-dlp+claude, ~36초)
- 🔴 **검증용 산출물 — 실사용자 데이터 아님**: `clip-frames/999001/` 사진 7장(DB 행 없는 하네스 전용 번호 **999001**). 확인 끝나면 그 디렉토리만 지우면 된다. 실사용자 클립은 하나도 건드리지 않았다.
- 🔴 확인해 달라: ① `pickBestPhotoUrl` 이 **마지막 썸네일**을 고르는 근거(계약서의 "width 기준"과 다름) ② 사진 경로 전환이 `ytdlpKind==='no-video'` **하나에만** 걸리는지(인증·삭제 게시물이 새지 않는지) ③ `--ignore-no-formats-error` 가 여전히 `fetchPostEntries` 안에만 있는지 ④ 타임아웃 상한 600s 가 분석 큐(동시성 1)를 너무 오래 잡지 않는지

## Leader 재확인 (2026-09-11)

저장 파일과 분석 결과를 직접 확인했다.

**사진 7장 전부 원본 해상도**: `photo-1 804,592B 3274x4096` · `photo-2 661,266B 3277x4096` · `photo-3 949,610B` · `photo-4 858,875B` · `photo-5 938,075B` · `photo-6 1,115,710B` · `photo-7 1,542,923B`. 전부 3274~3277 × 4096. 소요 36초, Python 잡음 0건.

**분석 결과** — 사진 속 한국어 텍스트를 읽어 **실수 5가지를 사진 번호와 함께** 구조화했다("등보다 엉덩이가 먼저 움직여야 한다"·"거리는 다리로, 컨트롤은 손으로"·"얼굴보다 중심을 보자" 등 원문 문구까지 인용). 캡션만으로는 나올 수 없는 내용이라 **실제로 이미지를 읽었다는 증거**다.

서버는 새 코드로 떠 있다(파일 수정 23:08:25 → 프로세스 기동 23:08:55). 진행 중 잡 0건.

🔴 **Developer 가 내 계약의 오류를 잡았다 — 그대로 구현했으면 잘린 사진을 저장했다.** 계약 M-2 에 "`thumbnails` 중 width 기준 최대"라고 썼는데, **인스타 thumbnails 14개에는 width/height 키가 아예 없다**. width 로 정렬하면 전부 `undefined` 라 비교가 항상 거짓이 되어 **0번**이 뽑히는데 그것은 `s1080x1080` 으로 **잘린 정사각 71,744B** 다. 실제 원본은 배열 **마지막**(3274x4096, 804,592B). Developer 가 세 후보를 내려받아 JPEG 헤더로 재 보고 발견했고, 역검증 R3 가 "계약서 문자 그대로 구현"을 주입해 잡는다. **지시서의 기술적 가정은 실측으로 검증되어야 한다**는 사례가 또 하나 늘었다(task-024 의 "최근 실패일" 오류와 같은 종류).

## Leader 결정 (Developer 확인 요청 3건)
| # | 질문 | 결정 |
|---|---|---|
| 1 | 타임아웃 상한 600s 가 분석 큐(동시성 1)를 오래 잡는가 | **현행 유지.** 20장 캐러셀은 드물고, 실측 7장이 36초다. 다만 한 건이 뒤를 전부 막는 구조는 사실이므로, 실사용에서 체감되면 사진 경로를 `priority:'batch'` 레인으로 옮기는 것을 검토(백로그) |
| 2 | `method:'photo-vision'` 이 `ClipEditor.jsx:90` alert 에 노출 | **다음 단계에서 함께 정리.** `mediaKind`·`photoCount` 로 "사진 7장 분석"을 표시할 때 alert 문구도 손본다 |
| 3 | 검증 산출물 `clip-frames/999001/` | 🔴 **삭제 시도했으나 Bash 훅이 `rm` 을 3회 차단해 남아 있다.** DB 행 없는 가짜 번호라 무해(6.8MB). 다음 기회에 정리 |

## 최종 요약
영상이 없는 게시물을 실패시키는 대신 **사진을 전부 내려받아 분석**한다. 사용자 지시대로 영상의 10장 제한을 적용하지 않고 캐러셀 전 장을 받으며(인스타 상한 20장), 사진 경로 + **게시물 캡션**을 함께 넣어 Claude 가 `Read` 로 이미지를 직접 읽는다 — 이 방식은 새로 만든 것이 아니라 기존 영상 프레임 분석이 쓰던 것 그대로다. 저장도 `video_clips.frames` 그대로라 **화면이 이미 그린다**(프론트 변경 0). 실측: 사진 7장 원본 해상도 저장, 36초, 분석이 사진 속 한국어 텍스트를 읽어 실수 5가지를 사진 번호와 함께 정리. 단위 28/28 · 역검증 6/6(장수 상한 삽입 · 타임아웃 회귀 · 잘린 썸네일 · 전환 판정 제거 · 부분 실패 중단 · D-2 위반 주입 전부 탐지). 영상 경로는 `--simulate` 로 회귀 0.
