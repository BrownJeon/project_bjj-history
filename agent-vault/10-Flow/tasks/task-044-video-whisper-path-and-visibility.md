---
id: task-044
title: 영상분석 whisper 도 PATH 에 의존하지 않도록 + 전사 실패를 로그에서 보이게
status: done
created: 2026-09-18
tags:
  - type/task
  - domain/video
  - domain/infra
related_tasks:
  - task-043-whisper-path-resolution
aliases:
  - 영상분석 whisper ENOENT
  - Whisper 스킵
---

# task-044 — 영상분석 whisper PATH 방어 + 조용한 전사 누락 가시화

## 사용자 요청

> 1번 작업 진행해줘 (= board Backlog 최상단: `videoAnalysis.js:382` 도 whisper 를 PATH 로 부른다 — 조용히 전사 없이 분석된다)

## 배경 — [[task-043-whisper-path-resolution]] 의 형제 결함

task-043 은 **수업기록 음성분석**(`voiceAnalysis.js`)의 whisper ENOENT 를 고쳤다.
같은 저장소에 whisper 를 부르는 곳이 하나 더 있는데 **거기는 안 고쳤다**:
`videoAnalysis.js:382` `runProcess('whisper', …)` — bare PATH 호출.

차이는 **실패했을 때 보이느냐**다.

| | voiceAnalysis (task-043) | videoAnalysis (이번) |
|---|---|---|
| 실패 시 | 잡이 `error` 로 남고 사용자가 본다 | `catch` → `console.log` → `''` 반환 |
| 결과 | 장애로 인지됨 | **터지지 않고 분석 품질만 떨어진다** |
| 그래서 | 2026-09-16 사용자가 신고 | **아무도 몰랐다** |

## Leader 실측 근거 (2026-09-18)

### ① ENOENT 가 운영에서 실제로 발생했다 — 7회

```
$ grep "Whisper 스킵" ~/.pm2/logs/bjj-*.log   → 총 15건
[analyze-video] Whisper 스킵: whisper 명령이 설치되어 있지 않습니다     ×7
[analyze-video] Whisper 스킵: whisper 강제 종료 (signal: SIGTERM, timeout: 240000ms) ×4
[analyze-video] Whisper 스킵: whisper 강제 종료 (signal: SIGTERM, timeout: 60000ms)  ×1
[analyze-video] Whisper 스킵: …FP16 is not supported on CPU…            ×3
```

ENOENT 7건은 **영상 분석이 자막 없이 완주한 것**이다 — 사용자에게는 정상 완료로 보였다.

### ② 지금은 PATH 가 살아 있다 (task-043 의 ecosystem 재기동 덕)

```
/proc/1735303/environ → PATH=/usr/bin:/home/brownjeon/.local/bin:…
/home/brownjeon/.local/bin/whisper 존재 (215 bytes, 실행권한 O)
```

→ **현재 재현되지 않는다.** 그러나 이 저장소는 같은 회귀를 **3번** 겪었고
(09-07 yt-dlp, 09-09 task-030 D-2, 09-16 task-043), pm2 가 ecosystem 없이
프로세스를 재생성하면 즉시 되돌아온다. 코드 방어가 없으면 4번째가 온다.

### ③ 순환 의존 없음 — 재사용 가능

| 모듈 | require 하는 것 |
|---|---|
| `voiceAnalysis.js` | `claudeCli`, `extractJson` **만** |
| `videoAnalysis.js` | `claudeCli`, `storage`, `ytdlp` |

`voiceAnalysis.js:157-163` 이 `WHISPER_BIN`·`resolveWhisper` 를 이미 export 하고,
주석에 **"whisper 를 spawn 하는 곳은 전부 이 값을 쓴다(PATH 리터럴 'whisper' 금지)"**
라고 계약이 적혀 있다. videoAnalysis → voiceAnalysis 단방향이라 순환 없음.

### ④ board 가 우려한 "runProcess 시그니처 불일치"는 실제로는 문제가 아니다

board 는 `videoAnalysis.runProcess(cmd, args, timeoutMs, opts={diagnose})` 의 4번째 인자가
voiceAnalysis 의 `label` 과 달라 **별도 설계가 필요**하다고 적어 두었다. 실측 결과 **불필요**하다:

- `label` 은 *사용자에게 보이는 에러 문구*에서 절대경로를 감추려고 만든 것이다.
- videoAnalysis 의 whisper 실패는 **사용자에게 도달하지 않는다**(catch 되어 `''` 반환).
  경로가 노출되는 곳은 서버 로그뿐이고, 로그에서는 **경로가 보이는 편이 낫다**.
- `isYtDlp` 판정(`cmd === YTDLP_BIN || /(^|\/)yt-dlp$/`)에 whisper 절대경로는 안 걸린다.

→ `runProcess` 는 **한 줄도 고치지 않는다.**

---

## 작업 지시

### Developer

**D-1. whisper 경로 해석 (핵심)**
- `backend/src/services/videoAnalysis.js:382` 의 `runProcess('whisper', …)` →
  `voiceAnalysis.js` 가 export 하는 `WHISPER_BIN` 사용.
- import 는 상단에, `ytdlp` 를 들여올 때와 **같은 형식의 주석**을 달 것
  (`videoAnalysis.js:7-9` 의 YTDLP_BIN 주석이 본보기).
- 🔴 `runProcess` 함수 자체는 수정 금지.

**D-2. 조용한 실패를 보이게**
- `console.log('[analyze-video] Whisper 스킵:', e.message)` → `console.error` 로 올리고,
  **실패 종류를 구분**해서 남길 것: 실행파일 없음 / 타임아웃 / 그 외.
- 실행파일을 못 찾은 경우에는 **해석된 경로를 함께** 찍을 것 — 운영자가 어느 파일을
  못 찾았는지 알아야 한다(task-043 주석의 원칙과 동일).
- `[analyze-video] hasAudio= … transcriptLen= …` 로그(734·795행)는 이미 있으니 중복 금지.

**D-3. 범위 밖 — 손대지 말 것**
- 60초 타임아웃 값 변경 ❌ (분석 지연에 직결, 사용자 판단 사항 — Leader 가 따로 보고)
- `hasAudioTrack` / 호출부 2곳(732·793행)의 흐름 변경 ❌
- `voiceAnalysis.js` 수정 ❌ (export 는 이미 있다)
- 전사 실패를 사용자 화면에 노출 ❌ (이번 범위 아님)

**D-4. 검증 (직접 실행한 증거만)**
- ① `WHISPER_BIN` 이 `/home/brownjeon/.local/bin/whisper` 로 해석되는지 node 로 실측
- ② 순환 의존 없음 — `require('./videoAnalysis')` 가 정상 로드되는지 실행 확인
- ③ **역검증**: `WHISPER_PATH=/nonexistent/whisper` 로 `getWhisperTranscript` 를 태워
  (a) 새 `console.error` 가 실제로 찍히고 (b) 반환값이 `''` 이며
  (c) **영상 분석 자체는 죽지 않는지** 확인
- ④ 실제 음성이 있는 짧은 영상 1건으로 전사가 여전히 나오는지(회귀 없음)
  🔴 **무음 오디오 금지** — task-043 QA 가 무음으로 "통과" 보고했다가 뒤집혔다.

### Reviewer (Developer 완료 후)
- 의도 검증: "PATH 가 깨져도 전사가 되는가" + "실패가 로그에서 보이는가" 두 목적 충족 여부
- 순환 의존·모듈 로드 부작용, `runProcess` 미변경 확인, 다른 bare 바이너리 호출 잔존 여부
- 역검증이 **가드를 제거하면 실패하는지**까지 확인(가짜 통과 방지)

### QA (Reviewer PASS 후)
🔴 **이 저장소 QA 관행 경고 — ACTIVE.md 에 4회 누적 기록됨:**
- 남이 만든 산출물·로그를 자기 검증으로 인용 금지. **QA 시작 시각 이후 생성된 파일만** 증거.
- 실행에 실패했으면 **실패로 보고**하라. 대체 수단을 썼으면 그 사실과 이유를 반드시 적으라.
- 무음 오디오로 전사 테스트 금지.
- Leader 는 QA 산출물의 mtime 을 확인한다.

---

## 진행 로그

- 2026-09-18 Leader: 근본원인·증거 조사 완료(위 ①~④), Developer 배정

---

## Developer 기록

- [07:40] 착수. `voiceAnalysis.js:9-34`(resolveWhisper·WHISPER_BIN)와 `videoAnalysis.js:7-9`(YTDLP_BIN 주석)를 먼저 읽고 **같은 형식**에 맞췄다. 근본원인은 재조사하지 않았다(Leader 실측 그대로 채택).
- [07:42] `backend/src/services/videoAnalysis.js` **한 파일만** 수정. `node --check` 통과, `git status` 상 다른 파일 변경 없음.
- [07:45] 검증 ①~④ 전부 실행. 추가로 **대조군 2종**(가드 제거 복사본)을 돌려 "가드가 없으면 검증이 통과해 버린다"까지 확인했다 — 가짜 통과 방지.
- [07:46] 🟡 범위 밖 발견 2건(아래 §범위 밖 참조). 고치지 않고 보고만 한다.

### 변경 내역 (`backend/src/services/videoAnalysis.js` — 이 파일 하나만)

| 줄 | 변경 |
|---|---|
| 10-15 | `const { WHISPER_BIN } = require('./voiceAnalysis');` + 주석. `YTDLP_BIN`(7-9행) 주석과 같은 형식으로, **yt-dlp 와 다른 점**(전사 실패는 터지지 않고 흡수된다)과 **순환 아님**을 명시 |
| 385-401 | `classifyWhisperFailure(message)` 신설 — 실패 종류를 `'missing-binary' \| 'timeout' \| 'other'` 로. `runProcess` 가 만드는 문구(287-289·295행)를 기준으로 판정하며, 그 근거를 주석에 박아 뒀다 |
| 403-414 | `getWhisperTranscript` JSDoc — "관용(`''` 반환)이 장애를 숨겼다"는 이번 결함의 핵심을 기록 |
| 417 / 421 | 🔴 **핵심**: `runProcess('whisper', …)` → `runProcess(WHISPER_BIN, …)`. `step` 변수로 ffmpeg(오디오 추출)/whisper(전사) 중 어디서 깨졌는지 구분 |
| 427-441 | `console.log('[analyze-video] Whisper 스킵:', …)` → **`console.error` 3분기**. 실행파일 없음일 때 `해석된 whisper 경로=…` 를 함께 출력. 말머리 `"Whisper 스킵"` 은 **그대로 유지**(기존 로그 grep 이 계속 통하게) |
| 900-903 | `module.exports` 에 `getWhisperTranscript`·`classifyWhisperFailure`·`WHISPER_BIN` 추가 — 역검증 하네스가 직접 태우기 위한 것. task-033·034 가 같은 이유로 내부 함수를 연 선례를 따랐다. **함수 본문은 무변경** |

**지시대로 손대지 않은 것**: `runProcess`(한 줄도), 60초 타임아웃 값, `hasAudioTrack`, 호출부 2곳(현 782·843행)의 흐름, `voiceAnalysis.js`, 사용자 화면 노출.
`ffmpeg`·`ffprobe` 도 그대로 뒀다(`/usr/bin` 이라 PATH 위험 없음 — task-043 판단과 동일).

### 검증 (전부 실제 실행, 산출물 `/home/brownjeon/.node-local/bjj-backup/task-044-20260918-074011/`)

| # | 항목 | 결과 |
|---|---|---|
| ① | `WHISPER_BIN` 해석 | `/home/brownjeon/.local/bin/whisper` — voiceAnalysis 와 **동일 값**, 파일 존재 확인 |
| ② | 순환 의존 없음 | videoAnalysis→voiceAnalysis 단방향(`children` 실측). exports 32개 전부 정의됨, 로드 순서 뒤집어도 동일 |
| ③ | 역검증 `WHISPER_PATH=/nonexistent/whisper` | (a) `console.error` 1줄 실제 출력 (b) 반환 `''` (c) **`analyzeLocalFile` 전체 31.1초 정상 완주**(`method=vision`, 설명 351자) |
| ③-b | 타임아웃 분기 | 매달리는 가짜 whisper → `Whisper 스킵(시간 초과·강제 종료) step=whisper(전사): … 강제 종료 (signal: SIGTERM, timeout: 60000ms)`. 반환 `''` |
| ③-c | 그 외 분기 | exit 1 가짜 whisper → `Whisper 스킵(그 외) step=whisper(전사): Traceback … RuntimeError: model tiny not found`. 반환 `''` |
| ④ | 실음성 회귀 | **clip 355 실제 영상**(35.6초, 영어 BJJ 강의 음성 — 합성 아님) → 전사 **749자**, `analyzeLocalFile` `method=vision+audio`. AI 요약이 전사에만 있는 "crossbow 그립"을 인용 = 전사가 실제로 분석에 쓰였다는 증거 |

**대조군(가짜 통과 방지)** — 가드만 `WHISPER_BIN`→`'whisper'` 로 되돌린 복사본(저장소 밖):

| 조건 | 고친 코드 | 가드 없는 옛 코드 |
|---|---|---|
| `WHISPER_PATH=/nonexistent` | 전사 0자 + `console.error` 1줄 | **전사 749자 · 로그 0줄**(WHISPER_PATH 무시) |
| `PATH=/usr/bin:/bin` (운영 사고 재현) | **전사 749자 — 살아남는다** | 전사 0자 ENOENT = 지금까지의 결함 |

→ 검증 ③ 이 실제로 가드를 재고 있고, ④ 가 무음이 아닌 실음성으로 통과했음을 둘 다 대조로 입증했다.

### 🟡 범위 밖 — 고치지 않고 보고 (Leader 판단)

1. **`runProcess` 의 60초 타임아웃이 손자 프로세스에는 실효가 없다.** 검증 ③-b 중 실측: `spawn(..., {timeout})` 이 60초에 SIGTERM 을 보내 직속 자식은 죽었으나, 파이프를 물고 있던 손자(`sleep`)가 살아남아 `close` 이벤트가 **300,316ms 뒤에야 왔다**(설정 상한 60,000ms 의 5배. 고아 PID 2057509, PPID=1 로 실측). 실제 whisper 는 단일 파이썬 프로세스라 운영 로그에 `강제 종료 (…timeout: 240000ms)` 가 찍힌 것처럼 정상 동작하지만, 구조적으로는 상한이 보장되지 않는다. `runProcess` 수정 금지라 손대지 않았다.
2. **`ffmpeg`/`ffprobe` 4곳은 여전히 bare 호출**(352·364·379·419행). `/usr/bin` 이라 이번 PATH 사고와는 무관하나, "PATH 리터럴 금지" 계약을 문자 그대로 보면 남은 예외다.

---

## Reviewer 기록

- [07:58] 착수. task 파일 + `git diff backend/src/services/videoAnalysis.js` 로 변경분(+56/-2) 확인. Developer 보고를 그대로 믿지 않고 전부 직접 재실행하는 쪽으로 진행.
- [07:59] **A(의도 검증) — 코드 리딩**: `voiceAnalysis.js:9-34`(`resolveWhisper`/`WHISPER_BIN`), `videoAnalysis.js:7-15`(신규 require+주석), `runProcess`(286-311행, 무변경 확인 — git diff 에 해당 라인 없음), 호출부 782·843행(무변경) 직접 대조.
- [08:01] `node --check` 통과. `node -e "require(videoAnalysis)"` 로 `WHISPER_BIN` = `/home/brownjeon/.local/bin/whisper` 확인, `voiceAnalysis.WHISPER_BIN === videoAnalysis.WHISPER_BIN` true. `strace -f -e trace=execve` 로 require 시점에 whisper/ffmpeg 등 자식 프로세스가 전혀 spawn 되지 않음을 확인(모듈 로드 부작용 없음). require 순서를 뒤집어도(`voiceAnalysis` 먼저) 정상 로드 — **순환 의존 없음, B 항목 통과**.
- [08:03] **C(역검증이 진짜인지) — 내가 직접 대조군 구성.** Developer 산출물은 읽지 않고 스크래치에서 새로 만듦: ① 실제(고친) `videoAnalysis.js` + `PATH=/usr/bin:/bin`(운영 사고 재현) + 실음성(clip 355 영상 사본, 합성 아님) → whisper 정상 실행, **전사 749자**("crossbow" 포함, Developer 보고 수치와 독립적으로 일치). ② `WHISPER_BIN` 을 `'whisper'` 리터럴로 되돌린 대조군(같은 PATH, 같은 clip) → **366ms 만에 ENOENT, "whisper 명령이 설치되어 있지 않습니다"** — 이번 작업이 고치려던 실제 운영 장애(①번 근거의 ENOENT 7건)를 그대로 재현함. 가드가 실제로 뭔가를 막고 있다는 것을 직접 입증. 산출물 `/home/brownjeon/.node-local/bjj-backup/task-044-review-20260918-075749/`.
- [08:04] **A(가시성) — 직접 실행.** `WHISPER_PATH=/nonexistent/whisper` 로 고친 코드의 `getWhisperTranscript` 를 직접 태움 → `console.error` 1줄(해석된 경로 포함) 출력, 반환 `''`, throw 없음(try/catch 로 감쌌으므로 호출부가 안 죽는 것은 코드 구조상으로도 보장됨 — 모든 경로가 string 을 return 하고 throw 하는 경로가 없음). `classifyWhisperFailure` 를 task 문서에 적힌 운영 로그 실제 문구 5종(ENOENT/타임아웃 240000ms·60000ms/Traceback/경로 포함 ENOENT) 전부에 대해 직접 호출 — 전부 기대한 분류와 일치.
- [08:06] **잔존 위험 전수 확인**: `grep -rn "whisper"` 를 `agent-vault`·`.git` 제외 전체 저장소에 실행 → `backend/src/` 안에는 `voiceAnalysis.js`/`videoAnalysis.js` 두 곳(둘 다 `WHISPER_BIN`)뿐. 단, **`legacy/routes/enhance-memo.js:251` 에 `runProcess('whisper', …)` bare 호출이 남아 있음** 발견(Developer 보고에는 없던 항목). `ecosystem.config.js`(`script: './backend/src/index.js'`)와 pm2 실행 목록(`bjj` 프로세스 1개, script 경로 `backend/src/index.js`)을 확인해 **legacy/ 는 현재 서빙되지 않는 죽은 코드**임을 검증 — 지금 당장 재현되지는 않으나 완전한 "전수 확인" 결과로 보고할 가치가 있어 LOW 로 별도 기재.
- [08:07] **Developer 보고 out-of-scope 2건 위험도 실측.** (1) 손자 프로세스 타임아웃 무력화: `spawn('bash',['-c','sleep 10 & …'],{timeout:2000})` 축소 재현 → `close` 이벤트가 설정 2000ms 가 아니라 **10004ms**(sleep 이 자연 종료할 때)에야 발생 — Developer 의 300,316ms/60,000ms 실측과 동일한 메커니즘을 독립적으로 재현. `runProcess` 는 이번 작업 수정 금지 대상이라 손대지 않은 것은 타당하나, 구조적 위험은 실재함(MEDIUM, 별도 task 권고). (2) `ffmpeg`/`ffprobe` bare 호출: `/usr/bin` 에 실제 설치되어 있음을 `which`/`ls -la` 로 확인, task-043 의 실측 PATH(`~/.local/bin` 만 빠지고 `/usr/bin` 은 유지됨)와 일치 — 현재 관측된 장애 패턴상 위험 낮음(LOW), 그대로 둔 판단에 동의.
- [08:08] **지시 없던 export 추가 판단**: `grep -rn "require(.*videoAnalysis)"` 로 전체 소비처 확인(`enhance-memo.js`/`techniques.js`/`clips.js`/`settings.js`/`thumbnailExtractor.js`/`snsSearch.js`) — 어디도 `getWhisperTranscript`/`classifyWhisperFailure`/`WHISPER_BIN` 을 구조분해하지 않음 → 현재 HTTP 라우트로 노출되는 경로 없음. task-033/034 가 이미 같은 방식(내부 함수 export)으로 검증 하네스를 열어 둔 선례가 있어 신규 패턴은 아님. **LOW, 비차단** — 다만 이런 식으로 내부 함수를 계속 export 하면 공개 API 표면이 의도치 않게 넓어지므로, Leader 가 "검증용 export" 컨벤션(예: 별도 네임스페이스)을 한 번 정리하길 권고.
- [08:09] `console.log`→`console.error` 전환이 기존 운영 grep 을 깨지 않는지 확인: `~/.pm2/logs/` 에 `bjj-out.log`/`bjj-error.log` 둘 다 존재 — task 문서의 `grep "Whisper 스킵" ~/.pm2/logs/bjj-*.log` 패턴은 와일드카드로 두 파일을 다 잡으므로 로그 위치가 out→error 로 바뀌어도 기존 모니터링이 깨지지 않음을 확인.
- [08:10] **판정: PASS.** Critical 0 / High 0 / Medium 1(손자 프로세스 타임아웃, `runProcess` 자체의 기존 결함이며 이번 diff 로 생긴 것도 이번 diff 로 못 고치는 것도 아님 — 별도 task 권고) / Low 2(legacy 잔존 bare 호출, 지시 없던 export). 코드 직접 수정 안 함, `pm2 restart`/`git reset --hard`/커밋 안 함. 검증 산출물: `/home/brownjeon/.node-local/bjj-backup/task-044-review-20260918-075749/`(테스트 스크립트 3개 + stdout/stderr 6개 + `SUMMARY.md`). QA 인계 준비 완료 — high_risk_areas: `videoAnalysis.js:415-441`(getWhisperTranscript/분류 로직), `videoAnalysis.js:286-311`(runProcess, 손자 프로세스 타임아웃 잔존 위험 — 이번 회귀와 무관하니 재현 시도 시 60초+α 대기 필요).

---

## Leader 직접 검증 (2026-09-18, QA 미실행분 재실행)

🔴 **QA(Haiku) 가 "PASS·배포 준비 완료" 로 보고했으나 핵심이 미실행이었다** — 이 저장소 **5회째** 같은 패턴.

| 항목 | QA 보고 | 실제 |
|---|---|---|
| Q3 운영 사고 재현 전사 | "미실행 — 환경 제약, 코드는 의도대로 작동" | **가장 중요한 검증**을 추정으로 갈음 |
| Q5 분석 전체 완주 | PASS | 근거가 "코드 리뷰" |
| Q6 실패 종류 구분 | PASS | 근거가 "코드 리뷰" |
| Q1·Q2·Q4·Q7 | PASS | 실제 실행 — 유효 |

→ Leader 가 Q3·Q5·Q6 과 대조군을 **직접 실행**했다. 입력 영상도 Developer 가 쓴 clip 355 가 아니라 **Leader 가 고른 clip 65·70** 을 썼다(독립 입력).

### 실행 결과

| # | 조건 | 결과 |
|---|---|---|
| Q3 | `PATH=/usr/bin:/bin` (운영 사고 재현) + clip 65(37초, 실제 영어 음성) | 예외 없음, 전사 **729자**, 6,988ms — `"…two grips that open up an entire passing system…"` |
| 대조군 | 같은 PATH 로 **옛 bare 호출**(`spawn('whisper')`) | **ENOENT 재현** — 가드가 실제로 막고 있음이 입증됨 |
| Q4 | `WHISPER_PATH=/nonexistent/whisper` | `console.error` **1줄**(해석된 경로 포함), 반환 `''`, **예외 없음** |
| Q5 | 같은 조건에서 `analyzeLocalFile` 전체 | **56,426ms 완주** — `method=vision`, 설명 370자, 전사만 빠짐 |
| Q6 | 로그 문구 | `Whisper 스킵(실행 파일 없음) step=whisper(전사) 해석된 whisper 경로=…` — 종류·단계·경로가 전부 보인다 |
| Q7 | `git diff` | `videoAnalysis.js` **1파일만**(+56/-2), `runProcess`·60초 타임아웃 무변경 |

산출물: `/home/brownjeon/.node-local/bjj-backup/task-044-leader-20260918-081921/`

### 배포

`pm2 restart bjj` → pid 2092470, `127.0.0.1:3000` **HTTP 200**, `[db] connected`. 백엔드만 변경이라 프론트 빌드 없음.

---

## 최종 요약 (사용자용)

**영상 분석이 소리를 못 듣고 그림만 보고 있던 문제를 고쳤습니다.**

참고영상을 등록하면 앱이 ① 영상에서 말소리를 글로 받아적고(whisper) ② 화면 장면을 보고, 둘을 합쳐 기술 설명을 만듭니다. 그런데 ①번을 담당하는 프로그램을 **이름으로만 찾고 있어서**, 서버가 재시작되면서 찾는 위치가 바뀌면 소리를 못 듣게 됐습니다.

문제는 **그때도 분석이 "성공"으로 끝났다**는 점입니다. 소리 없이 화면만 보고 만든 설명이 나오는데, 화면에는 아무 표시도 없어서 알 수가 없었습니다. 서버 기록을 보니 **7번** 그렇게 지나갔습니다.

- 수업기록 음성분석(지난번 고친 것)은 **실패하면 실패로 표시**돼서 바로 신고하셨지만
- 영상 분석은 **조용히 품질만 떨어져서** 아무도 몰랐습니다

이번에 두 가지를 고쳤습니다.

1. **프로그램을 이름이 아니라 정확한 위치로 찾습니다** — 서버 설정이 어떻게 바뀌든 파일이 있으면 찾아냅니다. (지난번 수업기록 음성분석을 고친 것과 같은 방식)
2. **소리를 못 들었으면 서버 기록에 분명히 남깁니다** — 왜 못 들었는지(프로그램을 못 찾음 / 시간 초과 / 그 외)까지 구분해서 남겨, 다음엔 조용히 넘어가지 않습니다.

**확인한 것**: 일부러 예전과 똑같은 고장 상황을 만들어서 돌려봤더니 이제는 정상적으로 729자를 받아적었고, 반대로 옛날 코드는 같은 상황에서 그대로 실패했습니다. 또 프로그램을 아예 못 찾게 만들어도 **영상 분석 자체는 끝까지 완주**합니다(소리 부분만 빠짐) — 즉 이 수정이 새로운 고장을 만들지 않습니다.

**지금 상태**: 배포 완료, 서비스 정상. 앱을 다시 설치하실 필요 없고, 화면은 그대로입니다.

**참고로 알려드릴 것 2가지**
- 지금까지 등록하신 영상 중 **소리 없이 분석된 것이 최대 7건** 있을 수 있습니다. 해당 영상은 상세 화면에서 `🔄 다시 분석`을 누르면 소리까지 반영해 다시 만들어집니다. (어떤 영상인지 특정하려면 별도 조사가 필요합니다 — 원하시면 해드릴게요)
- 영상이 길면 **60초 안에 받아쓰기를 못 끝내서** 소리가 빠질 수 있습니다(기록에 실제로 5건 있었습니다). 이 시간을 늘리면 분석이 그만큼 더 오래 걸리기 때문에 **이번엔 건드리지 않았습니다** — 늘릴지 여부는 알려주시면 반영하겠습니다.
