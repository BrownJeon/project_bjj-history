---
id: task-049
title: 영상분석 상세 플레이어에 썸네일(poster) 표시 — 목록 썸네일과 같은 이미지
status: done
waiting: device_verify
created: 2026-10-08
base_ref: 96a3c35b9b3a062f7163f91d7bf7b87b1a2c6edb
risk_level: R1
tags:
  - type/task
  - domain/study-video
  - domain/ux
related_tasks:
  - task-048-study-video-local-save
aliases:
  - 영상분석 플레이어 썸네일
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

# task-049 — 영상분석 상세 플레이어 썸네일

## 사용자 요청 (2026-10-08)

> 기존에 있는 영상분석에 대해서 재분석을 통해서 확인했는데, 목록의 썸네일처럼 동양상 플레이어에도 썸네일 처리 해줄수있어?

("동양상" = 동영상으로 해석 — 영상분석 상세 화면의 플레이어에 목록과 같은 썸네일을 보여 달라는 요청.)

## 실측 (Leader, 2026-10-08)

- 운영 DB(읽기 전용): `long_videos` user 3 의 8건 중 **id=74 만** `video_path` 가 생겼다(사용자가 재분석으로 확인 — 상태 done, 오류 없음). 나머지 7건은 저장본이 없어 기존 YouTube iframe 재생(iframe 은 유튜브가 자체 썸네일을 보여 준다).
- 목록(`StudyVideoPage.jsx:296-298`): `v.thumb_url`(YouTube CDN 주소, yt-dlp 메타에서 S1 이 저장) 을 `<img style={{width:84,height:60,objectFit:'cover'}}>` 로 표시.
- 상세(`StudyVideoDetailPage.jsx`): 저장본 `<video controls playsInline preload="metadata">` 에 **poster 가 없다**. `preload="metadata"` 라 모바일 WebView 는 재생 전 첫 프레임을 그리지 않아 검은 칸이 보이기 쉽다. 같은 응답(`GET /api/long-videos/:id` 의 `...video`)에 `thumb_url` 이 이미 실려 온다(백엔드 변경 불필요).
- `thumb_url` 형태 2종: `maxresdefault.webp/jpg`(16:9 — 8건 중 6건) · `hqdefault.jpg`(4:3 에 위아래 검은 띠가 구워진 이미지 — id 38·40). 저장소에 `poster` 사용 선례는 없다(`ClipsPage`·`VideoPlayer` 의 `<video>` 도 poster 없음).

## 설계 (Leader)

`web/src/pages/StudyVideoDetailPage.jsx` 만 수정(백엔드·DB·다른 화면 무변경).

1. 저장본 `<video>` 에 `poster={video.thumb_url}` (값이 비면 속성 생략 → 지금과 동일).
2. **재생 전에만 `object-fit: cover`**, 한 번이라도 재생이 시작되면 `contain`(상태 `started`, `onPlay` 에서 true, 영상 id/src 가 바뀌면 false 로 초기화). 이유: 목록 썸네일처럼 칸을 꽉 채우고(`hqdefault` 의 구워진 위아래 띠가 잘려 나감) 재생이 시작되면 세로 영상 등을 자르지 않기 위해서. 일시정지 후에는 contain 유지.
3. 폴백 없음: `thumb_url` 이 비었거나 이미지가 로드되지 않으면(유튜브에서 삭제되면 CDN 이미지도 사라진다) 지금과 같은 모양 — 에러 없음. iframe 경로(저장본 없음/onError)는 무변경(유튜브가 자체 썸네일을 보여 준다).
4. 챕터 시점 이동·`seekTo`·`pendingSeek`·onError 폴백 로직은 건드리지 않는다.

## 범위 밖 (이번에 하지 않는다)

- **썸네일도 서버에 저장**(유튜브 삭제 후에도 목록·플레이어 썸네일 유지): 지금 `thumb_url` 은 유튜브 CDN 주소라 영상이 삭제되면 목록 썸네일도 같이 사라진다(기존 동작). S3.5 에 썸네일 저장 한 단계 + 기존 8건 백필(영상 백필과 같이)이 필요 — 사용자 결정 사항으로 제안만 한다.
- 저장본 영상의 첫 프레임을 poster 로 쓰는 방식(별도 이미지 추출)은 목록 썸네일과 모양이 달라져서 제외.

## 판단 기록 (judge)

intake (2026-10-08, jev-1.13.0, `judge-result@2`, **Leader 가 판정 도구를 직접 실행** — 입력 `task-049-judge-intake.in.json`, 원본 출력 `task-049-judge-intake.real.json`): task_type=local_fix · complexity=0.45 · risk=**R1** · developer_model=**sonnet** · roles=developer·reviewer·qa · next=assign · demo=none(ui_change=minor_visual, 확신 1.0) → 데모 게이트 `not_required`(`check.mjs init`). R2 보강 영역(runMigrations·백필·destroy+reinsert·다중 테이블 쓰기·user_id 격리) 해당 없음 — 프론트 한 파일. override 없음.
C1 (설계 확정 직후, Leader 직접 실행, `task-049-judge-c1.real.json`): `codex_required=false` · budget_rule=`CX-limit-unknown-hold` · codex_switch=on. C2 (Reviewer 1차 PASS-with-notes 직후, `task-049-judge-c2.real.json`): `codex_required=false`(`wanted_before_budget=true`, focus=error_handling 0.8, reviewer_doubt 0.87 — 한도 미확인 R1 이라 `CX-limit-unknown-hold` 규칙이 호출을 보류). **Codex 호출 안 함**. 대신 Codex 초점이던 '썸네일 로드 실패' 케이스를 developer 가 실제 Chrome 으로 직접 확인했고 그 결과 N-1(깨진 poster 시 칸이 검게 남는 퇴보)을 발견해 선로딩 게이트로 고쳤다. 추가로 N-3(실제 저장본 id 74)·N-6(poster 가 늦게 붙는 순서)도 실제 Chrome 으로 확인 — 코드 변경 불필요. 필요하면 사용자가 Codex 검토를 요청할 수 있다.

## 구현 기록

- [11:25] **Developer** — 데모 게이트: `check.mjs check --task` → `DEMO_GATE_PASSED`(not_required). 편집 훅이 "active task 미지정" 경고를 냈다(warn 단계라 편집은 허용됨 — Leader 가 `check.mjs activate` 를 하지 않은 상태. check 자체는 PASSED 라 그대로 진행).

### 변경 (파일 1개: `web/src/pages/StudyVideoDetailPage.jsx`, +17 −1)

| 줄 | 내용 |
|---|---|
| 58 | `const [startedKey, setStartedKey] = useState(null)` — 재생이 시작된 저장본 `<video>` 의 키 |
| 59 | `useEffect(() => { setStartedKey(null); }, [id])` — 영상 id 가 바뀌면 기록을 지운다(task-048 의 `pendingSeekRef` 초기화 effect 와 같은 id 기반 패턴) |
| 173–175 | `playerKey = localSrc ? \`${id}\|${localSrc}\` : null` · `started = playerKey != null && startedKey === playerKey` · `posterUrl = video.thumb_url \|\| undefined` |
| 216 | `<video poster={posterUrl}>` — 값이 비면 속성 자체가 없다(React 가 `undefined` 는 생략) |
| 217 | `onPlay={() => setStartedKey(playerKey)}` |
| 222 | style 에 `objectFit: posterUrl && !started ? 'cover' : 'contain'` 추가(기존 width/height/display/background 유지) |

- `started` 는 상태가 아니라 파생값이다: 키에 **id + 재생 주소**가 들어 있어 id 나 주소가 바뀌면 자동으로 처음 상태(cover)가 되고, id 변경 effect 가 A→B→A 로 돌아왔을 때 옛 기록이 남는 것을 막는다. 일시정지해도 되돌리지 않는다.
- ⚠ **판단 1건(Leader 확인 요청)**: 지시문은 "재생 전에만 cover" 였으나 **poster 가 없을 때(`thumb_url` 빈 값)는 cover 를 쓰지 않고 contain(기존 기본값)** 으로 뒀다. 설계 3항의 "비었으면 지금과 같은 모양" 을 따른 것 — poster 가 없는데 cover 를 걸면 브라우저가 첫 프레임을 그릴 때(실측: Chrome 은 poster 없으면 첫 프레임을 그린다) 4:3·세로 영상이 재생 전부터 잘려 보이는 회귀가 생긴다. 지시대로 "항상 cover(재생 전)" 로 바꾸려면 222줄의 `posterUrl &&` 한 단어만 지우면 된다.
- 무변경 확인: iframe 경로, `handleLocalError`(폴백), `seekTo`·`pendingSeekRef`·`handleLocalMetadata`, `playerPick`, 목록 화면, 백엔드·DB. `git diff --stat` = 이 파일 1개(17 insertions, 1 deletion).

### 검증 (하네스 `/home/brownjeon/.node-local/bjj-backup/task-049-20261008-110730/harness/` · 전체 로그 `run-all.log` · 실행 `bash run-all.sh`)

task-048 하네스 폴더는 수정하지 않고 필요한 파일만 복사·확장했다. 격리 서버는 **:3149**(운영 :3000·pm2 `bjj`·운영 dist 무관), 쓰기는 user 1 의 `t049` 행 4개(+챕터 2개씩)와 그 중 한 행의 `video_path` 한 줄(e4, 원복)뿐이다. NAS 파일은 만들지 않았다(미디어를 로드하는 쪽은 Chrome 이고 거기선 Blob URL 을 썼다). 실제 yt-dlp/Claude 는 돌리지 않았다.

| 검증 | 결과 | 출력 근거 |
|---|---|---|
| jsdom 화면(작업트리 소스 번들 + mini-server 실제 API) — (a)(b)(c)(d)(e)(f)(g) 전부 | **PASS 55 / FAIL 0** | `fe-render: PASS 55 / FAIL 0` |
| jsdom 부정 대조 12종(poster 제거 · onPlay 제거 · id 초기화 effect 제거 · 주소 키 무시 · 항상 cover · 항상 contain · poster 없을 때 cover · pause 시 되돌림 · 빈 poster="" · 기존 onError 제거 · 기존 seekTo 분기 제거 · onPlay 연결 제거 후 챕터 클릭) | **탐지 12 / 미탐지 0** — 겨냥한 검사가 각각 FAIL 로 바뀜 | `neg-control: 탐지 12 / 미탐지 0` |
| **실제 Chrome 147(Blink) 렌더** — 같은 소스 번들을 `data:` 페이지의 MemoryRouter 에 올리고(axios 어댑터 스텁), 영상·썸네일은 Blob URL(영상은 id 별로 다른 URL): 실제 `play()`·`pause()`·챕터 클릭 | **PASS 16 / FAIL 0** | `real-chrome: PASS 16 / FAIL 0` |
| 실제 Chrome 스크린샷 픽셀 판정(영상 칸 캡처 vs 같은 크기로 cover/contain 한 실제 썸네일) | **PASS 10 / FAIL 0** | `real-analyze: PASS 10 / FAIL 0` |
| 실제 Chrome 부정 대조 4종(항상 contain · 항상 cover · poster 제거 · onPlay 제거) | **탐지 4 / 미탐지 0** | `real-neg: 탐지 4 / 미탐지 0` |
| vite 검증 빌드(하네스 사본 `harness/web`, ext4) | **성공 rc=0**, 산출물에 `objectFit:M&&!Q?"cover":"contain"`·`poster:M` | `PASS  vite build 성공` |

확인한 항목(요청 (a)~(g)):
- (a) 저장본+thumb → `poster` = thumb_url, 재생 전 `objectFit=cover`(jsdom·Chrome 둘 다). B(hqdefault) 도 동일.
- (b) 첫 `play` → `contain`, 이후 `pause`·`ended`·재`play` 에도 `contain` 유지(재생 전 `pause` 이벤트는 상태를 바꾸지 않음). Chrome 은 실제 `play()` 로 확인.
- (c) thumb 빈 값 → `poster` 속성 없음·에러 없음(`objectFit=contain`).
- (d) video_path 없음 → iframe(`<video>`·`[poster]` 없음), seek 은 기존 postMessage 그대로.
- (e) id 변경 초기화: A(재생됨)→B → B `cover`, B→A → A `cover`(A→B→A 에서도 옛 기록 없음), A(재생됨)→D(iframe)→A → `cover`, 같은 id 에서 `video_path` 가 바뀌어 새 미디어가 뜨면 `cover`. Chrome 에서도 B(재생됨)→A → `cover`·정지·poster.
- (f) `error` → iframe 폴백(재생 시작 후 `error` 도 동일), 같은 칸 style, 이후 seek=postMessage — 기존 로직 그대로.
- (g) 챕터 클릭 → `currentTime` 이동 + `play()` 1회, 그 `play` 이벤트로 `contain`; `readyState 0` 이면 지점만 맡겼다가 `loadedmetadata` 에서 1회 적용(task-048 c5 무회귀); `play()` 가 거부돼도 `currentTime` 은 옮겨지고 오류·unhandledRejection 0.
- 이미지 비율(실제 이미지, Chrome): hqdefault(480×360, 위·아래 45px 검은 띠가 구워짐)는 16:9 칸에서 **cover 로 띠가 정확히 잘려 나가** 칸이 이미지 내용으로 꽉 찬다(기대 cover 이미지와 MAE 8.9, contain 이었다면 75.4, 칸 맨 위 3행 밝기 47.8 — contain 이면 0). maxresdefault(16:9)는 MAE 4.7. 재생이 시작되면 4:3 영상이 `contain`(좌우 검은 띠, 영상 폭 = 칸의 75.0%). **Chrome 은 `object-fit` 을 poster 에도 적용한다**는 것을 실측으로 확인.

### 발견 — Leader 판단 필요 (구현은 지시대로 `onPlay` 만, 보강은 하지 않았다) → **Leader 가 보강안 채택 · 아래 '보강 — onSeeked' 로 해결**

🟡 **재생 전에 seek 만 되고 `play()` 가 실패하면, Chrome 은 poster 를 지우고 영상 프레임을 `cover` 로 그린다.** 실측(Chrome 147): 챕터 클릭 시 `play()` 를 거부(NotAllowedError)시키면 `currentTime`=60·정지·`play` 이벤트 없음 → `objectFit=cover` 인데 화면에는 poster 가 아니라 60초 지점 프레임이 칸을 꽉 채워 그려졌다(스크린샷 `probe/real/shots/S1.png` — 4:3 테스트 영상이 16:9 칸에서 위아래가 잘리는 상태). 즉 poster 는 "재생 전"이 아니라 "재생 또는 seek 전"까지만 보인다. 영향: ① 16:9 영상은 cover=contain 이라 무해, ② 4:3·세로 영상은 play 가 막힌 환경(안드로이드 WebView 의 autoplay 정책 등 — 클릭이 사용자 제스처라 흔하진 않다)에서 챕터를 눌렀거나 재생 전에 기본 시크바를 끌었을 때 사용자가 `play` 를 누르기 전까지 잘린 프레임이 보인다. 그 뒤 `play` 에서 `contain` 으로 바뀐다(레이아웃 점프 1회).
- **제안(미적용):** `<video>` 에 `onSeeked={() => setStartedKey(playerKey)}` 한 줄 추가. 실제 Chrome 에서 같은 시나리오로 확인했다(`fe/real-variant.sh`, 판정 제외 참고 실행): S1 이 `objectFit=contain`·영상 폭 75% 로 바뀌고 나머지 15개 검사 전부 PASS(16/16). 부작용 후보는 없음(poster 는 seek 으로 이미 사라져 되돌아오지 않는다). 설계 변경이라 Leader 승인 후 적용.

### 못 한 검증 · 한계
- **안드로이드 WebView·iOS Safari 실기기 미검증.** WebView 는 Chromium 이라 위 Chrome 결과가 가장 가깝지만 같다고 단정할 수 없다. Safari(WebKit)는 poster 에 `object-fit` 을 적용하지 않는 것으로 알려져 있으나(미확인·추측) 이번에 재지 못했다 — 그 경우 poster 는 contain 처럼 보이고 재생 시작 후 동작은 같다.
- 이 서버의 headless Chrome 이 http 내비게이션을 못 열어(task-048 기록) 실제 SPA·서버 URL 의 `<video src>` 로 확인하지 못했고, `data:` 페이지 + Blob 영상으로 대체했다. 실제 NAS 영상 파일·실제 YouTube CDN 이미지 URL 로딩(핫링크·삭제된 영상의 깨진 이미지)은 jsdom/Chrome 어디서도 재지 않았다(이미지는 같은 두 URL 에서 curl 로 받아 Blob 으로 넣었다).
- 목록 화면 무변경은 diff 로만 확인(목록 화면 렌더 검증은 하지 않음).
- 하네스 `fe/real-chrome.js` 의 S1 검사는 **현재 동작(cover 유지)을 특성화**한 것이라 PASS 가 "좋다"는 뜻이 아니다(위 발견 참고).

### 잔여물 정리 확인 (`run-all.log` 마지막)
- user 1: `long_videos(t049)=0` · 전체 0 · 챕터 0·고아 0 · jobs 0 · techniques 0. NAS `users/1` 없음(원래도 없었다). `/tmp/t049-*`·`/tmp/bjj-lv-*` 0. :3149 리슨 0(종료 확인), Chrome 프로필(`.chrome-*`)·`token.admin` 삭제. 임시 파일은 모두 하네스 폴더(`.node-local`) 안.
- user 3: `long_videos`(8행·video_path NULL 7)·`long_video_chapters`(26)·`long_video_jobs`(10) 스냅샷 시작=종료 **동일**(`PASS  user 3 스냅샷 … 시작=종료 동일`, 기준 `harness/u3-before.txt`).
- 운영: pm2 `bjj` online·restart 0, :3000 리슨 중, 운영 dist(`~/.node-local/bjj-web/dist`) 수정 시각 2026-09-19 그대로, commit·push·배포 없음.
- 개발 중 1회, 첫 실행의 격리 서버 프로세스(:3149)가 서브셸 종료 때 남아 있어 수동으로 종료했다(운영 :3000 과 무관, 이후 `run-all.sh` 는 PID 를 직접 추적·`wait`).

### 보강 — onSeeked (Leader 승인 · 2026-10-08 11:3x)

- **변경 1줄**: `web/src/pages/StudyVideoDetailPage.jsx` 218줄 `onSeeked={() => setStartedKey(playerKey)}` 추가(`onPlay` 바로 아래). 다른 변경 없음 — 누적 `git diff --stat` 1 file, +18 −1. (코드 주석 "재생이 시작되면" 문구는 그대로 두었다 — "다른 변경 금지" 지시. 필요하면 Reviewer/Leader 가 문구 보정 여부 판단.)
- **초기 `loadedmetadata` 의 pendingSeek 적용으로 `seeked` 가 오는 경우 근거**: 그 seek 은 사용자가 챕터를 눌러 `seekTo` 가 `play()` 를 같이 부른 경로에서만 생기고(열자마자는 `pendingSeekRef` 가 비어 seek·`seeked` 모두 없음 — 실제 Chrome 에서 첫 로드는 A0·A1·B0 가 cover/poster 로 PASS), `play()` 가 성공하면 `play` 이벤트로 이미 contain 이고, 실패했더라도 seek 이 끝난 시점에는 Chrome 이 poster 를 지우고 영상 프레임을 그리므로(S1 실측) 그 프레임을 contain 으로 보여 주는 것이 맞는 동작이다.
- **하네스 추가(jsdom)**: (g2) play 거부 후 `seeked` → contain · 그 뒤 pause 에도 유지 · 새 화면은 다시 cover(기록이 화면 사이에 남지 않음) · 첫 로드 후 이벤트 없으면 cover 유지, (g3b) readyState 0 + play 거부 → `loadedmetadata` 로 대기 지점 적용(1회, 아직 cover) → `seeked` → contain. **실제 Chrome**: S1 기대값을 contain 으로 바꾸고(`S1_EXPECT` 기본 contain) 픽셀 판정도 "영상 프레임이 좌우 검은 띠 · 폭 75% 로 contain" 으로 바꿈. 보강 전 임시 확인용 `fe/real-variant.sh` 는 `.superseded` 로 치웠다.
- **부정 대조 추가**: jsdom N13(onSeeked 제거)·N14(onSeeked → onSeeking) 둘 다 `(g2) play 실패 + seek 완료` 에서 FAIL, 실제 Chrome R5(onSeeked 제거)는 `[Chrome] 재생 전 seek 만` 에서 FAIL.
- **전체 재실행 결과 (`bash run-all.sh`, 로그 `harness/run-all.log`)**: vite 검증 빌드 성공 · jsdom **PASS 62 / FAIL 0**(이전 55 + 신규 7) · 실제 Chrome **PASS 16 / FAIL 0**(S1 포함, 이번엔 contain 기대) · 픽셀 판정 **PASS 10 / FAIL 0**(S1: 좌/우 띠 밝기 0.1/0.1, 영상 폭 0.75, 중앙색 초록) · jsdom 부정 대조 **탐지 14 / 미탐지 0** · 실제 Chrome 부정 대조 **탐지 5 / 미탐지 0**. 모든 FAIL 0.
- **잔여물·불변 재확인**: user 1 `long_videos(t049)`·전체·챕터·고아·jobs·techniques 모두 0, NAS `users/1` 없음, `/tmp/t049-*`·`/tmp/bjj-lv-*` 0, :3149 리슨 0(Chrome 프로필·token.admin·fe/neg* 삭제), 운영 :3000 리슨 중(pm2·dist·배포·commit·push 없음). user 3 스냅샷(`long_videos` 8행·`chapters` 26·`jobs` 10) 시작=종료 **동일**(`PASS  user 3 스냅샷 … 시작=종료 동일`).

### 후속 검증 (REV-049-1 N-1·N-3) — 관찰만, 코드 변경 없음 (2026-10-08 11:5x)

방식: DB·mini-server·`run-all.sh` 를 쓰지 않고(QA 병행 실행과 충돌 방지) 실제 Chrome 147 `data:` 페이지에 **같은 작업트리 소스(onSeeked 포함) 번들**을 올려 측정(CDP 포트 9361). 파일: `harness/followup/`(`n1.js`·`analyze-n1.py`·`n3.js`·`n3b.js`·`analyze-n3.py`·`analyze-n3b.py`·`probe-http.js`, 스크린샷 `shots/`). 소스 변경 0, user 3 DB 무접근, 종료 후 Chrome·프로필·포트 정리 확인.

**N-1 — poster 로드 실패 시 `<video poster=깨짐 preload=metadata objectFit=cover>`** (합성 mp4 16:9·4:3·9:16, 영상 칸 윗 62% 픽셀 판정 — 하단은 기본 컨트롤이 덮음)
| poster 상태 | 16:9 | 4:3 | 9:16 |
|---|---|---|---|
| 정상(실제 maxres) | 썸네일 표시 | 썸네일 표시 | 썸네일 표시 |
| 디코딩 불가 바이트 / revoke 된 blob / 불량 `data:` / 요청이 끝나지 않음(pending) | **검은 칸**(밝기 0.0) | **검은 칸** | **검은 칸** |
| poster 속성 없음(= task-048 배포본 모양, objectFit contain) | 첫 프레임(MAE 3.8) | 첫 프레임 · 좌우 띠 contain(MAE 6.0) | 첫 프레임 · contain(MAE 2.8) |
- **[확실] 데스크톱 Chrome 147 에서 poster 속성이 있으면 poster 가 깨져도 첫 프레임으로 폴백하지 않고 칸 전체가 검게 남는다**(컨트롤만 보임). 그리려 한 프레임이 없으니 cover 로 잘려 그려지는 일은 없다 — 문제는 "잘림"이 아니라 "빈 칸". 같은 영상에서 poster 속성이 없으면 첫 프레임이 contain 으로 그려진다(스크린샷 `N1-43-garbage.png` vs `N1-43-absent.png`).
- **퇴보 판단**: 데스크톱 Chrome 기준으로는 "poster 실패 = 첫 프레임 → 검은 칸"으로 task-048 배포본보다 나빠진다(poster 가 정상일 때는 개선). 다만 이 task 실측의 전제대로 **안드로이드 WebView 는 poster 가 없어도 `preload=metadata` 에서 첫 프레임을 안 그려 검은 칸이 보이기 쉽다면**(이번에 WebView 로는 재지 못함 — [추측]) 앱에서는 poster 실패가 기존 모양과 같다. 앱이 주 사용처이고 poster 실패(유튜브 CDN 이미지 삭제)는 드물다는 점에서 영향은 작다. 방향은 Leader 판단.
- **한계**: 이 환경에서는 `data:` 페이지의 http(s) 하위 요청이 아예 나가지 않아(`probe-http.js`: 로컬 서버 요청 0건, `img.complete=false`) **진짜 HTTP 404 는 만들지 못했다.** 대신 실패 4종(디코딩 불가 · 요청 실패 · 불량 data: · 끝나지 않는 로딩)으로 대신했고, `new Image()` 로 같은 주소를 불러 3종은 `error`, 1종은 pending 임을 확인했다. Chrome 이 이 넷과 실제 404 를 같은 poster 모드로 다루는지는 코드 근거 없이 [추측]이다.

**N-3 — 실제 yt-dlp 저장본(운영 NAS user 3 · long_videos 74)** — 파일 존재: `.../users/3/long-videos/74/video.mp4`, 57,654,974 B, 1280×720 H.264 High + AAC, 395.8초, moov 앞쪽(faststart). 🔴 읽기 전용(`fs.readFileSync` → Blob, ffmpeg 는 `-i` 입력만) — 측정 뒤 크기·mtime 동일.
- **(1) 자발적 seeked: 없음.** 조작 없이 mount 후 4초: `loadstart → durationchange → loadedmetadata → suspend → loadeddata → canplay → canplaythrough` 만 오고 `seeking`·`seeked` 0회, `readyState` 4, objectFit cover·poster 유지(스크린샷 `N3-idle.png`). 따라서 mount 만으로 poster 가 일찍 contain 으로 바뀌지 않는다(이번 파일 기준).
- **(2) play() ~ playing 사이**(Blob 이라 `play`→`playing` 이 1~2ms): `play` 이벤트와 같은 태스크 안에서 objectFit 이 cover→contain 으로 바뀐다. `Page.startScreencast` 연속 캡처 결과 — 실제 74(16:9): poster(cover) 상태가 play 후 13ms 까지 이어지다 66ms 에 영상 프레임. 합성 4:3(정상 poster)·4:3+hqdefault poster: poster → 9~21ms 에 영상 프레임(**contain**, 좌우 띠 폭 0.75). CPU 6배 느림에서도(`play`→`playing` 7ms) poster → 23~31ms 에 contain 프레임. **어느 경우에도 검은 프레임이나 cover 로 잘린 영상 프레임이 캡처된 적 없다**(콘솔 오류 0).
- **한계**: 로컬 Blob 이라 데이터가 이미 전부 있어 `play`→`playing` 이 극히 짧다 — 실제 서버(Range 요청) 지연으로 play 후 첫 프레임이 늦는 구간에서 poster 가 유지되는지/검은 칸이 되는지는 재현 못 했다. screencast 간격이 약 15ms 라 1프레임(16ms) 미만의 깜빡임은 못 잡는다. 안드로이드 WebView 미검증.
- **코드 변경 필요 여부**: 이번 N-3 은 필요 없어 보인다. N-1 은 poster 실패 시 데스크톱 Chrome 에서 첫 프레임 대신 검은 칸이 되는 퇴보 가능성이 있으나(앱 WebView 에서는 기존과 같을 가능성) 고칠지는 Leader 판단 — 고치려면 `new Image()` 로 poster 를 미리 불러 실패하면 `poster` 를 빼는 방식이 있고(범위 증가).

### 3차 — N-1 선로딩 게이트 (Leader 결정 · 2026-10-08 12:0x)

- **변경(같은 파일 `StudyVideoDetailPage.jsx` 만, 누적 diff +35 −1 · 3차 증분 순증 +17줄)**: ① `posterReady` 상태 + `thumbUrl = video?.thumb_url || null` + effect(`[id, thumbUrl]`) — `new Image()` 로 썸네일을 먼저 불러 **`onload` 성공 때만** `setPosterReady(thumbUrl)`; effect 시작에서 `setPosterReady(null)`(영상·URL 이 바뀌면 옛 기록 초기화), `thumbUrl` 이 없으면 `Image` 를 만들지 않음, `onerror` 는 null, cleanup 에서 `alive=false` + `onload/onerror=null`. 훅은 기존 훅들과 같은 위치(조건부 return 앞, `startedKey` effect 바로 아래), `video` 가 null 인 렌더에서도 안전. ② `posterUrl = thumbUrl && posterReady === thumbUrl ? thumbUrl : undefined`(현재 URL 과 같은 성공 기록일 때만 사용) — `objectFit: posterUrl && !started ? 'cover' : 'contain'` 식과 `startedKey`·`onPlay`·`onSeeked` 는 그대로(posterUrl 이 선로딩 성공값이라 자연히 연동). ③ 주석 보정(N-4): `startedKey` 주석을 "재생이 시작되거나 seek 이 끝나 영상 프레임이 보이면(onPlay·onSeeked)" 로, poster 는 선로딩 성공 때만 붙는다는 점을 새 주석에 반영. iframe 경로·task-048 코드·onPlay→onPlaying(N-2) 무변경.
- **결과 동작**: 썸네일이 정상이면 로드 직후(캐시 덕에 보통 수 ms~수백 ms) poster 가 붙고 cover — 그 전 짧은 순간에는 poster 없는 모양(첫 프레임/WebView 에선 검은 칸)이 보였다가 poster 로 바뀐다. 썸네일이 404·디코딩 불가면 poster 속성이 끝까지 없어 task-048 배포본과 같은 모양(첫 프레임 contain).
- **하네스 변경**: jsdom 은 이미지를 로드하지 않으므로 `window.Image` 를 제어 가능한 목으로 교체(`success` 자동 onload · `fail` 자동 onerror · `hold` 테스트가 수동 발화). 신규 (p) 섹션 — (p-i) 로드 전: poster 속성 없음·contain·Image 1개 요청 / (p-ii) onload 후 poster=thumb_url·cover, 재생 시작 시 contain / (p-iii) onerror: poster 끝까지 없음·contain·video 가 에러 없이 보임(iframe 폴백 아님)·재생·정지 후에도 contain / (p-iv) thumb_url 빈 값: Image 안 만듦 / (p-v) 영상 전환: A(성공)→B(미완료) B 에 poster 없음, B 성공→A 복귀(미완료) A 에 poster 없음 / (p-c) 영상이 바뀌면 이전 Image 핸들러 해제. 기존 (a)~(g) 는 기본 정책이 `success` 라 그대로 통과. 실제 Chrome: 정상 썸네일은 poster 속성을 기다린 뒤 판정, **신규 E**(썸네일 = 디코딩 불가 이미지 바이트 Blob) — poster 속성 없음·contain·`<video>` 보임 + 픽셀 판정(칸이 검게 남지 않고 4:3 첫 프레임이 contain, 영상 폭 0.75, poster 없는 C0 와 MAE 0.98 = 같은 그림).
- **부정 대조(심은 결함 → 겨냥한 검사가 FAIL)**: jsdom N15 게이트 제거(poster 항상 붙임) → (p-i)·(p-iii)×2·(p-v)×2 FAIL(`NEG_VERBOSE` 로 전부 확인), N16 옛 성공 기록 무효화 전부 제거 → (p-v) FAIL, N18 cleanup 핸들러 해제 제거 → (p-c) FAIL, N19 onload 가 게이트를 안 열면 → (p-ii)·(a) FAIL; 실제 Chrome R6 게이트 제거 → `[Chrome] E`·`[Chrome px] E0` FAIL. (참고: id 변경 시 초기화와 URL 일치 비교는 서로를 가려 주므로 N16 은 둘을 함께 제거한 사본이다.)
- **전체 재실행(`bash run-all.sh`, 이번엔 QA 병행 없음) 결과 — 로그 `harness/run-all.log`**: vite 검증 빌드 성공 · jsdom **PASS 78 / FAIL 0**(이전 62 + 신규 16) · 실제 Chrome **PASS 19 / FAIL 0**(이전 16 + 3) · 픽셀 판정 **PASS 12 / FAIL 0**(+2) · jsdom 부정 대조 **탐지 18 / 미탐지 0** · 실제 Chrome 부정 대조 **탐지 6 / 미탐지 0**. 전부 FAIL 0.
- **잔여물·불변**: user 1 `long_videos(t049)`·전체·챕터·고아·jobs·techniques 0, NAS `users/1` 없음, `/tmp/t049-*`·`/tmp/bjj-lv-*` 0, :3149 리슨 0(Chrome 프로필·`token.admin`·`fe/neg*` 삭제), 운영 :3000 리슨 중(pm2·dist·배포·commit·push 없음), user 3 스냅샷(`long_videos`·`chapters`·`jobs`) 시작=종료 동일(`PASS  user 3 스냅샷 … 시작=종료 동일`).
- **미검증·한계**: 안드로이드 WebView·iOS Safari 실기기 미검증. 실제 HTTP 404 는 만들지 못했다(이 서버의 `data:` 페이지는 http 하위 요청이 안 나감) — 실패는 디코딩 불가 바이트로 재현했고, `Image()` 의 `onerror`(요청 실패)와 `<video poster>` 의 로드가 같은 이미지 캐시를 공유한다는 점(이중 다운로드·CORS 모드 차이 없음)은 Leader 지시에 따라 전제로 두었을 뿐 실제 http 로는 재지 않았다. 선로딩 완료 전 짧은 구간의 모양은 jsdom 에선 목으로, Chrome 에선 Blob 이라 로딩이 빨라 직접 관찰하지 못했다.

### 후속 검증 (REV-049-2 N-6) — 관찰만, 코드 변경 없음 (2026-10-08 12:2x)

방식: 실제 Chrome 147 `data:` 페이지에 **현재 작업트리 소스(3차 게이트 포함) 번들**을 올리고(`followup/bundle-n6.js`, CDP 9361, DB·mini-server·`run-all.sh` 무사용), `window.Image` 를 감싸 **실제 이미지는 바로 불러 캐시에 두고 컴포넌트가 받는 onload 콜백만 3초 지연**시켰다 → 3초 동안은 poster 속성이 없어 `<video>` 가 첫 프레임을 그리고, 그 뒤 poster 가 붙는 순간을 `Page.startScreencast` 로 연속 캡처 + 스크린샷(pre 1.2s·2.2s / 부착 +60·+460·+1500ms)으로 픽셀 판정(영상 칸 윗 62%). 합성 영상 16:9(비교 기준)·4:3·9:16, 썸네일은 실제 maxresdefault(16:9), 4:3 에는 hqdefault 도, 그리고 poster 가 붙기 전에 이미 재생을 시작한 경우. 파일: `followup/n6.js`·`analyze-n6.py`·`shots/N6-*`.

| 시나리오 | (a) poster 부착 전(지연 중, objectFit contain) | (b) 부착 직후(+4~8ms 첫 프레임) · +60/+460/+1500ms |
|---|---|---|
| 16:9(기준) + maxres | 첫 프레임이 칸을 채움(cover≡contain) | poster(cover) 로 교체, 이후 유지 |
| 4:3 + maxres | 첫 프레임 **contain**(좌우 검은 띠) | poster(cover) 로 교체, 이후 유지 |
| 9:16 + maxres | 첫 프레임 **contain**(좌우 큰 검은 띠) | poster(cover) 로 교체, 이후 유지 |
| 4:3 + hqdefault | 첫 프레임 contain | poster(cover) 로 교체(구워진 띠 잘림), 이후 유지 |
| 4:3, 부착 전에 이미 재생 시작 | 재생 프레임 contain(폭 0.75) | **poster 가 다시 나타나지 않음** — 재생 프레임 contain 유지(부착 전후 −73·27·126·227ms 프레임 모두 재생 프레임) |
- (a) **[확실] 지연 중에는 첫 프레임이 contain 으로 그려지고, cover 로 잘린 첫 프레임 구간은 없다**(연속 캡처 전 구간에서 "첫 프레임 · cover 로 잘림" 분류 0장; 16:9 는 cover≡contain 이라 구분 불가).
- (b) **[확실] 이미 첫 프레임이 그려진 상태에서 poster 속성이 붙으면 Chrome 은 poster 를 다시 그린다** — 부착 후 4~8ms 에 poster 프레임이 나오고 첫 프레임이 cover 로 늘어나 잘리는 중간 프레임은 캡처되지 않았다(첫 프레임 → poster 로 한 번에 교체). 따라서 정상 경로는 "첫 프레임(contain) → poster(cover)" 의 **내용 교체 1회**이고, 잘린 프레임 노출은 없다. 사용자가 보기에는 로드 직후 짧게 첫 프레임이 보이다 썸네일로 바뀌는 깜빡임 정도(실제 지연은 이미지 로드 시간 — 캐시되면 수 ms~수백 ms).
- 부수 관찰 — 재생을 먼저 시작한 경우 poster 가 늦게 붙어도 재생 중인 영상 위에 poster 가 되돌아오지 않는다(재생 시작 후 poster 모드가 아님).
- **한계**: 이 환경은 `Page.captureScreenshot` 호출 순간 screencast 프레임이 clip 크기(deviceWidth 350)로 따로 한두 장 생겨 분류가 "기타" 로 나오는 가짜 구간이 있다(내 스크린샷 호출 시각과 일치, 영상 문제 아님). screencast 간격이 약 16ms 라 1프레임 미만의 깜빡임은 못 잡는다. 지연 3초는 모사이며 실제 네트워크 지연·안드로이드 WebView 는 미검증.
- **코드 변경 필요 여부**: 필요 없어 보인다(잘림 구간 없음). 첫 프레임→poster 교체 깜빡임이 거슬리면 보완안은 한 줄 — poster 를 붙이기 전까지 `<video>` 를 `visibility:hidden`/검은 배경으로 가리기(범위 증가라 권장하지 않음).

## 리뷰 기록

### 감사(REV-049-1) (2026-10-08 11:37, Reviewer)

- [11:37] **판정: PASS-with-notes** — CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 5. 차단 결함 없음. 코드는 수정하지 않았다(감사 전용). 지시대로 하네스 `run-all.sh` 는 돌리지 않았고(Leader QA 가 :3149·user 1 행을 쓰는 중), DB·네트워크·브라우저 실행 없이 소스·diff·완성된 로그·`git status`·`pm2 jlist`(읽기)만 봤다.
- [11:37] **직접 확인한 것**: ① `git diff -- web`(1 file, +18 −1) 전체와 `StudyVideoDetailPage.jsx` 33-250줄. ② `git status`: 소스 수정은 `web/src/pages/StudyVideoDetailPage.jsx` **한 파일뿐**(백엔드·`StudyVideoPage.jsx` 목록·`index.html` 무변경). `.codex/*`·`CLAUDE.md`·`AGENTS.md` 변경은 task-048 감사 시작 시점 스냅샷에도 있던 것이라 이 task 와 무관, `agent-vault/*` 는 vault 기록. ③ `web/index.html`·`backend/src/index.js` 에서 CSP·Referrer-Policy 검색, 목록 `<img>`(`StudyVideoPage.jsx:296-299`) 마크업. ④ 하네스 `fe/render.js`·`fe/real-chrome.js` 의 시나리오 목록(무엇을 재고 무엇을 안 쟀는지). ⑤ 배경 대조: `git log` 에 task-048 커밋(`7d987fe`)·배포 후 pm2 `bjj` 가 릴리스 `20261008-104159-7d987fee` 에서 `restarts 0` 으로 online — 개발자 보고의 "restart 0" 과 일치.
- (1) **startedKey/playerKey — 통과.** `playerKey = localSrc ? \`${id}|${localSrc}\` : null`, `started = playerKey != null && startedKey === playerKey`(:173-174). 시나리오별: ⓐ **A→B→A**: id 가 바뀐 렌더에서는 `video`/`playerPick` 이 아직 이전 영상 것이라 `playerPick.id !== id` → `localSrc` null → `playerKey` null → `started` false, 그 뒤 effect(:59)가 `startedKey` 를 null 로 비우므로 A 로 돌아와도 옛 `A|src` 가 살아남지 않는다(effect 가 없으면 이 경우만 틀림 — 즉 effect 는 중복이 아니라 A→B→A 전용이고, 나머지 변경은 키가 흡수). B 로드가 끝나기 전에 A 로 되돌아와도 effect 가 이미 비웠으므로 cover. ⓑ **`video_path` 변경/신규**: 같은 문자열이면 키 불변(폴링 재조회·재분석의 rename 교체에서도 `<video>` 가 리마운트되지 않고 상태 유지), 다른 문자열이면 키가 달라져 cover 로 복귀. 운영에서 모드는 id 별 1회 고정(task-048)이라 NULL→생성이 세션 중 `<video>` 를 새로 만들지는 않는다. ⓒ **`handleLocalError` 폴백**: `localSrc` null → `playerKey` null → `started` false, 이후 iframe 분기라 poster/objectFit 은 쓰이지 않는다(`<video>` 가 사라져 `videoRef` null). `startedKey` 에 옛 키가 남지만 같은 id 에서 모드가 local 로 돌아올 길이 없고, 다른 id 로 가면 effect 가 비운다. ⓓ **마운트 직후**: `<video>` 는 `video` 가 로드된 뒤에만 렌더되고 첫 렌더부터 `started=false` 라 cover→contain 깜빡임 없음(`setStartedKey(null)` 은 같은 값이라 리렌더도 없음). ⓔ `onPlay`/`onSeeked` 핸들러는 렌더마다 새 클로저라 항상 현재 `playerKey` 를 잡고, `<video>` 는 `localSrc` 가 truthy 일 때만 렌더되므로 `setStartedKey(null 키)` 는 불가능. 언마운트된 요소의 늦은 이벤트는 React 가 전달하지 않는다. 같은 값 `setState` 는 리렌더 없이 무시(스크럽 중 `seeked` 반복에도 비용 없음).
- (2) **훅 규칙 — 통과.** 새 `useState`(:58)·`useEffect`(:59)는 `if (loading) return`(:165)·`if (!video) return`(:166)보다 앞이고 task-048 의 `pendingSeekRef` effect(:52) 바로 뒤라 훅 순서가 일정하다. 의존성 `[id]` 정확(`setStartedKey` 는 안정). `playerKey`·`started`·`posterUrl` 은 훅이 아닌 파생 상수라 조건부 return 뒤에 있어도 무방.
- (3) **onSeeked 보강 — 의도와 맞는다.** 근거: 재생 전 seek 만 되고 `play()` 가 막히면 브라우저가 poster 를 지우고 영상 프레임을 그리므로(개발자 Chrome 147 실측 S1) 그 프레임은 contain 이어야 한다. 챕터 클릭 경로는 `play()`+`currentTime` 이라 `play`·`seeked` 둘 다 같은 값으로 수렴(멱등). `loadedmetadata` 의 pendingSeek 적용은 `seekTo` 가 `play()` 를 같이 부른 경로에서만 생기고(열자마자는 `pendingSeekRef` 가 비어 seek·`seeked` 없음 — 코드로 확인), 사용자가 컨트롤로 재생 전에 스크럽해도 프레임이 보이므로 contain 이 맞다. 부작용: 없음(poster 는 seek 으로 이미 사라져 되돌아오지 않고, 일시정지·종료는 상태를 건드리지 않는다). 주의점은 LOW N-2·N-3.
- (4) **thumb_url 비었을 때 — 현재와 동일.** `posterUrl = video.thumb_url || undefined` → React 가 속성을 생략하고 `objectFit` 은 `posterUrl && !started` 가 false 라 `contain`(브라우저 기본값과 같음). 개발자의 jsdom (c)·Chrome C 케이스가 `hasAttribute('poster')===false`·contain 을 확인. **로드 실패 시는 "지금과 같은 모양"이 입증되지 않았다 → LOW N-1.** **보안/CSP/개인정보: 목록 `<img>` 와 같은 수준.** `web/index.html` 에 CSP·`<meta name="referrer">` 없음, 백엔드에 helmet 의존성 없고 전역 `Referrer-Policy`/CSP 헤더도 없음(`backend/src`·`package.json` 검색에서 나온 것은 앱 로그인 복귀 라우트 `appOAuthCallback.js:91,117` 의 라우트 한정 헤더뿐이라 상세 화면·SPA 와 무관) → 두 요청 모두 브라우저 기본 정책(`strict-origin-when-cross-origin`)으로 `i.ytimg.com` 에 오리진만 보내고, 새 제3자 호스트도 추가되지 않는다(목록이 이미 같은 호스트 이미지를 매번 전부 불러온다; 상세는 1장 추가). poster 는 `img-src` 지시어 대상이라 CSP 가 생겨도 `<img>` 와 같이 움직인다. `thumb_url` 은 yt-dlp 메타(유튜브만 등록 가능 — `extractYoutubeId`)에서 나오는 신뢰 출처이고 poster 는 이미지로만 해석되어 `javascript:` 등이 실행되지 않는다. [확실: 코드·검색 결과] 단 프록시/CDN 계층의 응답 헤더는 못 봤다.
- (5) **무회귀 — 통과.** diff 는 추가 + `style` 한 객체 교체뿐: iframe 분기·`seekTo`·`pendingSeekRef`·`handleLocalMetadata`·`handleLocalError`·`playerPick`·`onLoadedMetadata/onError` 연결·폴링은 줄 단위로 무변경. 목록 화면 파일 무변경(diff 에 없음). 개발자 보고의 jsdom 62/62·Chrome 16/16·부정 대조 14/5 는 **완성된 로그가 아니라 task 이력서 기재**를 읽었다(현재 `run-all.log` 는 Leader QA 가 쓰는 중이라 건드리지 않음) → 재현은 QA 결과에 맡긴다.
- (6) **범위 — 통과.** 소스 파일 1개(`git diff --stat -- web` = 1 file, 18 insertions, 1 deletion), 백엔드·DB·다른 화면 없음. task-048 하네스 폴더는 마지막 수정 10:29 로 이번 task 가 건드리지 않았다.
- [11:37] **지적 (모두 비차단)**
  - **[LOW] N-1 · `StudyVideoDetailPage.jsx:216,223` · poster 이미지 로드 실패 시 "지금과 같은 모양"이 입증되지 않았다.** 설계 3항 "이미지가 로드되지 않으면 지금과 같은 모양"을 코드가 보장하지 못한다 — `<video>` 에는 poster 의 `onerror` 가 없어 실패를 감지할 수 없고 `objectFit` 은 계속 `cover` 다. 유튜브 영상이 지워지면 CDN 썸네일도 404 가 되므로, **이 task 와 task-048 이 겨냥하는 바로 그 상황**이다. 하네스(jsdom·Chrome) 어디에도 이 케이스가 없다(개발자도 "못 잰 것"에 적음). [추측 — Blink 는 poster URL 이 있으면 재생·seek 전까지 영상 프레임을 그리지 않아 깨진 poster 는 검은 칸이 되는 것으로 알고 있으나 재현하지 못했다] 이 경우 데스크톱 Chrome 은 예전(첫 프레임이 보이던 것)보다 검은 칸으로 퇴보하고, 모바일 WebView 는 예전에도 검었으므로 변화 없음. 권고(QA): 실제 Chrome 하네스에서 `thumb_url` 을 404 로 두고 ① 어떤 모양인지 ② 첫 프레임이 `cover` 로 잘려 그려지는지 측정. 후자면 `new Image()` 로 선로딩 성공 시에만 poster 를 붙이는 방식으로 보완. 전자면 문서에 "poster 실패 = 검은 칸(재생 전)" 로 명시.
  - **[LOW] N-2 · `:217` · `onPlay` 는 재생 "요청" 시점에 발생 — 첫 프레임이 그려지기 전 poster 가 잠깐 contain 으로 보일 수 있다.** `play` 이벤트는 버퍼링 전에 오므로(서버에서 받는 중 수백 ms~수 초) 그 사이 poster 가 아직 화면에 있다면 cover→contain 전환으로 `hqdefault` 의 구워진 위아래 띠가 잠깐 드러난다. 16:9 `maxresdefault` 는 cover=contain 이라 변화 없음(현재 8건 중 6건)이고 개발자 Chrome 시험은 최종 상태만 쟀다. [추측] 보완안: `onPlay` 대신 첫 프레임 시점인 `onPlaying`(+ 이미 있는 `onSeeked`)으로 바꾸면 이 구간이 사라진다 — 단 `play()` 가 막혀 `playing` 이 안 오는 경로는 `onSeeked` 가 이미 덮는다.
  - **[LOW] N-3 · 검증 범위** — 하네스 영상은 ffmpeg 합성(`t049-test.mp4`)이고 실제 yt-dlp 병합 mp4(모바일에서 쓰는 저장본)로는 "열자마자 자발적 `seeked` 가 오지 않는다"를 확인하지 못했다. 편집 리스트(시작 오프셋)가 있는 파일에서 로드 직후 `seeked` 가 오면 poster 가 contain 으로 일찍 바뀐다(열화 방향일 뿐 오류 없음). QA 가 id 74 저장본으로 한 번 확인하면 닫힌다.
  - **[LOW] N-4 · `:54-57` 주석** — "한 번이라도 재생이 시작되면"이라고만 적어 `onSeeked` 보강(스크럽·재생 전 seek 포함)이 반영되지 않았다. 개발자가 "다른 변경 금지"로 남겨 둔 것(구현 기록에 명시). 문구만 보정하면 된다.
  - **[LOW] N-5 · 브라우저별 차이** — 개발자 보고대로 Safari(WebKit)는 poster 에 `object-fit` 을 적용하지 않는 것으로 알려져 있어(미확인) 그 환경의 poster 는 contain 처럼 보이고 재생 후 동작은 같다. 지원 대상은 안드로이드 WebView(Chromium)·웹이라 영향 작음.
- [11:37] **개발자 보고와 다른 것**: 사실 오류 없음 — 변경 규모(+18 −1)·훅 위치·파생 상태 설명·"무변경" 주장·pm2 `restart 0` 모두 대조로 일치. 개발자가 "오프닝에서 판단 1건(poster 없으면 cover 쓰지 않음)"으로 보고한 것은 설계 3항과 일치하는 해석이라 타당하다.
- [11:37] **확인하지 못한 것**: 실제 Chrome/WebView 렌더(poster 실패·`play` 직후 프레임 전 구간·실제 yt-dlp 저장본의 자발적 `seeked`), 하네스 최종 로그(Leader QA 실행 중이라 읽지 않음), 프록시/CDN 계층의 CSP·Referrer 헤더, iOS Safari. **QA 집중**: 위 N-1(404 썸네일)·N-2(재생 직후 구간)·N-3(id 74 실제 저장본) 세 가지.

### 재감사(REV-049-2) (2026-10-08 12:21, Reviewer — 3차 변경분만, 코드 수정 없음)

- [12:21] **판정: PASS-with-notes** — 신규 CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 4. REV-049-1 의 **N-1(깨진 poster 시 칸이 검게 남음)은 코드로 해소**됐고 N-4(주석)도 반영됐다. 지시대로 `run-all.sh`·DB·브라우저는 쓰지 않았다(소스·diff·`git status`·진행 중인 `run-all.log` 읽기만).
- [12:21] **직접 확인한 것**: ① `git diff -- web`(1 file, +35 −1)과 `StudyVideoDetailPage.jsx` 훅·파생 상수·`<video>` 구간. 이번 증분은 `posterReady`/`thumbUrl` 상태·effect, `posterUrl` 계산, 주석 두 곳뿐이고 task-048 줄(`seekTo`·`pendingSeekRef`·`handleLocalMetadata`·`handleLocalError`·`playerPick`)·`onPlay`/`onSeeked` 연결·iframe 분기·목록 화면은 줄 단위로 무변경. ② `git status`: 소스 수정은 이 파일 하나(`backend`·`StudyVideoPage.jsx` 무변경). ③ 하네스 `fe/render.js` 의 (p-*) 단언 목록과 `fe/real-chrome.js` 의 마운트·poster 대기 순서. ④ 진행 중인 `run-all.log`(QA 실행 중, 읽기만): 지금까지 `vite build 성공`·`fe-render PASS 78/0`·`real-chrome PASS 19/0`·`real-analyze PASS 12/0` — 개발자 기재와 일치(부정 대조는 아직 도는 중이라 미확정).
- (1) **훅 위치·규칙 — 통과.** 새 `useState`(`posterReady`)·`useEffect` 는 `startedKey` effect 바로 뒤, `if (loading) return`/`if (!video) return`(≈:188)보다 앞이다. `const thumbUrl = video?.thumb_url || null` 은 훅이 아니라 파생 상수이고 `video` 가 null 인 첫 렌더에서 옵셔널 체이닝으로 안전(null → effect 가 `Image` 를 만들지 않고 return). 의존성 `[id, thumbUrl]`: `thumbUrl` 은 **문자열**이라 5초 폴링의 `setVideo(새 객체)` 로 객체가 바뀌어도 값이 같으면 `Object.is` 동일 → effect 재실행·이미지 재요청 없음. `id` 는 effect 본문에서 쓰이지 않지만 "영상이 바뀌면 초기화"를 위해 의도된 의존성이다(`react-hooks/exhaustive-deps` 는 컴포넌트 범위 값의 불필요 의존성은 경고하지 않고, 이 프로젝트에는 린트 스크립트도 없다).
- (2) **경합 — 옛 성공 기록이 새 영상에 쓰이는 경로 없음.** 이중 방어다: ⓐ cleanup 이 `alive=false` + `onload/onerror=null` 이라 늦은 콜백은 `setPosterReady` 를 부르지 못하고, ⓑ 설령 상태에 옛 값이 남아도 `posterUrl = thumbUrl && posterReady === thumbUrl ? thumbUrl : undefined` 가 **현재** `thumbUrl` 과 같을 때만 쓴다(개발자 주석대로 ⓐⓑ 가 서로를 가려 주므로 하네스 N16 은 둘을 함께 제거한 사본이다). A→B: id 가 바뀐 렌더에서는 `video` 가 아직 A 것이라 `thumbUrl` 이 A 값이고 `<video>` 는 `localSrc` null 로 언마운트 상태 → effect 가 A 를 한 번 더 선로딩(브라우저 캐시, 비용 미미)하지만 B 가 로드되면 `thumbUrl` 변경으로 다시 초기화되며 A 의 요청은 ⓐ 로 무시된다. `setPosterReady(null)` 이 effect 시작·`onerror` 에서 두 번 불리는 부작용: 같은 값이면 React 가 리렌더 없이 건너뛰고, 값이 있던 경우(id/URL 이 바뀐 때)만 한 번 리렌더 — 의도된 초기화다.
- (3) **poster 가 뒤늦게 붙는 순간(started=true 포함) — 코드상 무해, 브라우저 동작은 일부 미검증.** `objectFit` 은 `posterUrl && !started` 라 이미 재생·seek 이 끝났으면(`started`) poster 가 붙어도 `contain` 그대로이고 레이아웃 점프도 없다(cover↔contain 전환은 **재생 전에 poster 가 붙는 순간**과 `onPlay`/`onSeeked` 순간 두 번뿐). 재생 중인 `<video>` 에 `poster` 속성이 붙을 때 Chrome 이 poster 를 다시 그리지 않는다는 점은 코드(Blink 의 "재생 이후 poster 속성이 설정돼도 표시 상태를 바꾸지 않음" 로직)로는 확인하지 못했고 하네스에도 이 케이스(재생 시작 후 `onload`)가 없다 → LOW N-6. 또한 하네스의 Chrome 시험은 Blob 이라 poster 가 거의 즉시 붙어 "첫 프레임이 이미 그려진 뒤에 poster 가 붙는" 순서는 관찰되지 않았다 → LOW N-6.
- (4) **N-1 해소 — 코드로 확인.** `posterUrl` 은 ① `thumb_url` 없음(`thumbUrl` null) ② 로드 실패(`onerror` → null, `posterReady` 가 끝내 null) ③ 로딩 중/끝나지 않는 요청(`posterReady` 가 null 인 채) 모두 `undefined` → `poster` 속성이 렌더되지 않고 `objectFit` 은 `contain` — **task-048 배포본과 같은 `<video>`**(속성 집합·스타일 동일, 추가된 것은 동작 없는 이벤트 핸들러뿐). 정상 로드 후에만 `poster={thumbUrl}` + 재생 전 `cover`. 개발자 후속 측정이 근거: 깨진/끝나지 않는 poster 는 Chrome 147 에서 칸이 검게 남지만 poster 속성이 없으면 첫 프레임이 contain 으로 그려진다 → 이 게이트가 실패를 poster 속성 이전에 걸러 후자만 남긴다. 실제 Chrome E 케이스(디코딩 불가 썸네일)와 jsdom (p-iii) 가 이를 확인했다는 기재가 로그 수치와 일치.
- (5) **무회귀 — 통과**(위 diff 확인). 재생 흐름(`seekTo`·pendingSeek·onError 폴백·playerPick)과 `onPlay`/`onSeeked` 줄은 무변경, 변경 파일 1개.
- (6) **새 위험 — 보안/개인정보는 목록 `<img>` 와 같은 수준, 누수 없음.** `new Image()` 는 `crossOrigin`·`referrerPolicy` 를 지정하지 않아 목록 `<img>`(`StudyVideoPage.jsx:296-299`)와 같은 no-cors·기본 Referrer 정책(`strict-origin-when-cross-origin`, `index.html`/백엔드에 전역 CSP·Referrer-Policy 없음 — REV-049-1 에서 확인)으로 같은 호스트(`i.ytimg.com`)를 요청한다. 새 제3자·새 데이터 없음. 이미지는 `<video poster>` 가 같은 URL 을 다시 요청하지만 HTTP 캐시에 의존(캐시 불가 응답이면 ~100KB 이중 다운로드 정도). 메모리: cleanup 이 핸들러를 null 로 해제하고 `alive` 로 언마운트 후 `setState` 도 막아 클로저·`Image` 가 GC 대상이 된다. 단 진행 중인 요청 자체는 취소하지 않는다(`img.src=''` 없음 — 미미).
- [12:21] **지적 (모두 LOW, 비차단)**
  - **[LOW] N-6 · 미검증 순서 — 영상 첫 프레임이 이미 그려진 뒤(또는 재생·seek 뒤)에 poster 가 붙는 경우.** 이 task 가 겨냥한 일반 경로(목록을 거쳐 캐시된 썸네일 → 수 ms 안에 poster)에서는 문제될 가능성이 낮지만, 썸네일이 느린 네트워크에서 `<video>` 의 첫 프레임보다 늦게 오면 ⓐ Chrome 이 늦게 붙은 poster 를 그리지 않고 첫 프레임을 계속 보여 주면 그 프레임이 `cover` 로 잘려 보일 수 있다(16:9 는 cover=contain 이라 무영향, 4:3·세로 영상만) — 재생·seek 시 `contain` 으로 복귀, ⓑ 반대로 poster 로 되돌아가면 문제없음. 어느 쪽인지는 하네스 Blob 환경에서 재현되지 않았다. [추측 — 브라우저 내부 동작] 권고(QA/개발자): 실제 Chrome 하네스에서 `window.Image` 를 덮어 `onload` 를 3초 지연시켜 4:3 합성 영상으로 캡처 — 잘림이 보이면 `onLoadedData` 로 "poster 보다 첫 프레임이 먼저"를 기록해 그 경우엔 cover·poster 를 붙이지 않는 보완.
  - **[LOW] N-7 · effect 가 `<video>` 를 쓰지 않는 영상에서도 썸네일을 요청한다.** 저장본이 없는 영상(iframe 경로, 현재 8건 중 7건)이나 `onError` 로 iframe 폴백한 영상에서도 상세를 열 때마다 `i.ytimg.com` 으로 `Image` 1건이 나간다. 유튜브 iframe 이 이미 구글 쪽과 통신하므로 새 제3자는 아니고 낭비는 ~100KB 정도. 필요하면 effect 를 `playerPick.mode === 'local'` 일 때만 돌린다(`playerPick` 은 조건부 return 앞에서 이미 접근 가능).
  - **[LOW] N-8 · 열어 둔 상세 화면에서 `thumb_url` 이 바뀌면** (재분석 S1 이 `meta.thumbUrl` 로 갱신하고 5초 폴링이 가져옴) effect 가 `posterReady` 를 null 로 되돌려 이미 마운트된 `<video>` 의 `poster` 속성이 사라졌다가 새 URL 로 다시 붙는다 — 일시적 깜빡임/모양 변화(첫 프레임 contain ↔ poster cover). 재분석 중 상세를 보고 있고 썸네일 URL 이 달라진 드문 경우만.
  - **[LOW] N-9 · 하네스 공백** — jsdom (p-*) 에 "재생 시작 후 `onload`"(poster 가 붙어도 contain 유지)와 "이미지 요청을 취소하지 않음"은 없다. 코드로는 자명(`started` ⇒ contain)하나 단언이 있으면 회귀를 막는다.
- [12:21] **개발자 보고와 다른 것**: 사실 오류 없음 — 변경 범위·훅 위치·`video` null 안전·cleanup/비교 이중 방어·결과 동작 설명이 코드와 일치하고, 로그 수치(78/19/12)도 일치.
- [12:21] **확인하지 못한 것**: 실제 Chrome/WebView 에서 poster 가 첫 프레임 이후·재생 이후에 붙는 순서(N-6), 안드로이드 WebView 의 poster 표시, 진행 중 로그의 부정 대조 최종 수치, 실제 HTTP 404 썸네일(개발자도 못 만듦 — 디코딩 불가 바이트로 대체). **QA 집중**: N-6(썸네일 지연 시 4:3 영상 첫 프레임 모양)과 id 74 저장본에서 목록 → 상세 진입 시 poster 표시.

## QA 기록

**Leader 직접 실행 (2026-10-08, QA 에이전트 미사용 — task-048 과 같은 방식).** 대상: N-1 선로딩 게이트까지 반영한 **최종 코드**(`StudyVideoDetailPage.jsx` +35 −1). 명령: `bash ~/.node-local/bjj-backup/task-049-20261008-110730/harness/run-all.sh` 를 처음부터 끝까지 1회 완주(중단 없음). 로그: 스크래치패드 `leader-049-run-all2.log`. (같은 하네스를 개발 중 한 번 더 — `leader-049-run-all.log`, 게이트 반영 전 코드 — 돌렸고 PASS 90/FAIL 0 이었다.)
- 결과: **PASS 111줄 · FAIL 0줄 · exit 0** (PASS/FAIL 줄 수를 따로 집계).
- 화면: jsdom `fe-render` **78/0**(poster 선로딩 전·후·실패·thumb 없음·영상 전환·재생/seek 후 contain·iframe 폴백·seekTo 무회귀) · 실제 Chrome 147(`data:` 페이지 + 작업트리 소스 번들 + Blob 영상·썸네일) `real-chrome` **19/0**·픽셀 판정 `real-analyze` **12/0** (디코딩 불가 썸네일 → poster 속성 없음 + 첫 프레임 contain = poster 없는 기준과 같은 그림).
- 부정 대조: jsdom **18/0**·실제 Chrome **6/0** 탐지(선로딩 게이트·onPlay·onSeeked·id 초기화·주소 키·poster 속성 등을 하나씩 되돌린 사본이 전부 FAIL).
- 보조 확인(개발자, 코드 변경 없음): N-1 데스크톱 Chrome 에서 깨진 poster 는 칸이 검게 남음(→수정) · N-3 실제 저장본 id 74(57.6MB, 1280×720 H.264+AAC, 읽기 전용)에서 자발적 seeked 0회·잘린 프레임 없음 · N-6 poster 가 첫 프레임 뒤에 붙어도 잘린 중간 프레임 없이 한 번에 교체.
- 정리·불변: user 1 테스트 행·고아·NAS(`users/1`)·/tmp·포트(3149 등) 0, **user 3 스냅샷(long_videos·chapters·jobs) 시작=종료 동일**(8행·저장본 1건), 운영 pm2 `bjj` pid 4045162·restarts 0 그대로.
- 🟡 **미검증**: 안드로이드 WebView·iOS Safari 실기기 화면, 실제 HTTP 404 썸네일(이 서버의 `data:` 페이지는 http 요청이 나가지 않아 디코딩 불가 바이트로 대체), `Image()` 와 `<video poster>` 의 실제 http 캐시 공유, 선로딩 완료 직전 1프레임 미만 구간. → 배포 후 사용자 폰 확인.

## 최종 요약

**요청:** 영상분석 상세 플레이어에도 목록처럼 썸네일을 보여 달라(재분석으로 서버 저장본을 확인한 직후).

**원인:** 저장본 `<video preload="metadata">` 에 poster 가 없어 모바일 WebView 는 재생 전 검은 칸이 보이기 쉬웠다. 목록은 `thumb_url`(유튜브 이미지 주소)을 `object-fit: cover` 로 보여 주고 있었다.

**한 일 (2026-10-08 배포, 프론트 한 파일 `StudyVideoDetailPage.jsx`, 백엔드·DB 무변경)**
- 재생 전: 목록과 같은 썸네일을 poster 로 칸에 꽉 채워(cover) 보인다.
- 재생을 시작하거나 챕터 이동(seek)이 끝나면 영상 본래 비율(contain)로 돌아간다 — 세로·4:3 영상이 잘리지 않는다. 일시정지해도 되돌리지 않는다. 영상이 바뀌면 처음 상태로 초기화.
- **썸네일을 먼저 불러 성공했을 때만 poster 로 붙인다.** 실측으로 확인한 문제: 유튜브에서 영상이 지워져 썸네일이 404 가 되면 깨진 poster 가 붙은 `<video>` 는 첫 프레임 대신 칸 전체가 검게 남는다(데스크톱 Chrome 147). 이 경우 poster 없이 기존(task-048)과 같은 모양(첫 프레임)이 된다.
- 유튜브 iframe 재생(저장본 없는 영상 7건·폴백)은 유튜브가 자체 썸네일을 보여 주므로 변경 없음. 챕터 시점 이동·onError 폴백 로직 무변경.

**배포:** 커밋 `18ce9ef` push → 릴리스 `20261008-122836-18ce9ef0`, `RELEASE_RESULT status=ok`(migrated=false), 서빙 번들 `index-Bvd0LUSn.js`(poster·onSeeked·재생 전 cover 설정 포함 확인), pm2 `bjj` 새 릴리스 경로 online·restarts 0·로그 오류 없음·`/health` 200. 배포 로그상 pm2 재등록(수 초 중단)이 있었다. 이전에 로컬에만 두었던 vault 기록 커밋 2개(`6f56ee1`·`96a3c35`)가 함께 나갔다. 운영 DB 불변(user 3 영상 8건·저장본 1건·진행 중 잡 0). 앱 재설치 불필요(웹만).

**검증:** judge 접수 R1/sonnet·데모 불필요(minor_visual) · C1 Codex 불필요 · C2 Codex 보류(한도 미확인 R1, 대신 초점이던 로드 실패를 실제 Chrome 으로 직접 확인 → 위 퇴보 발견·수정) · Reviewer 감사 2회 PASS-with-notes(HIGH 이상 0) · Leader 직접 QA 완주 PASS 111/FAIL 0(jsdom 78·실제 Chrome 19·픽셀 12·부정 대조 18+6 전부 탐지, 잔여물 0, user 3 불변) · 보조 확인: 실제 저장본 id 74(자발적 seek 없음)·썸네일이 늦게 붙는 순서(잘린 프레임 없음).

**사용자 확인이 필요한 것 (`waiting: device_verify`)**
1. 저장본이 있는 영상(현재 id=74 '바라토플라타 세팅 강의')의 상세 화면에서 재생 전 썸네일이 목록과 같은 그림으로 칸을 채우는지, 재생·챕터 클릭 후 영상이 잘리지 않는지 — **폰 앱(WebView)과 웹 모두**. 안드로이드 WebView·iOS Safari 실기기, 실제 HTTP 404, 선로딩 직전 1프레임 미만 구간은 이 서버에서 검증하지 못했다.
2. 저장본이 없는 나머지 7건은 유튜브 재생이라 달라진 점이 없다(백필 승인 후 저장본이 생기면 같이 적용됨).

**남은 일 / 제안 (사용자 결정)**
- **썸네일도 서버에 저장** — 지금 `thumb_url` 은 유튜브 CDN 주소라 영상이 삭제되면 **목록 썸네일도 같이 사라진다**(기존 동작). 플레이어는 이번 수정으로 첫 프레임이 대신 보이지만, 목록은 빈 칸이 된다. S3.5 에 썸네일 저장 한 단계 + 기존 8건 백필을 **영상 백필과 한 번에** 하는 것이 효율적이다.
- 🔴 기존 8건 영상 파일 백필(task-048)은 여전히 사용자 승인 대기.
- LOW 후속(Reviewer): N-2 `onPlay`→`onPlaying`(첫 프레임 직전 구간, 추측성) · N-7 저장본이 없는 영상에서도 썸네일을 요청(약 100KB) · N-8 열어 둔 화면에서 `thumb_url` 갱신 시 poster 일시 변동 · N-9 jsdom 에 "재생 시작 후 onload" 단언 없음 · N-5 Safari 의 poster object-fit 차이(미확인).

## 데모 검토 (demo gate)

> 실행 판정 정본은 frontmatter `demo_gate` 이다. 이 표는 check.mjs 가 함께 기록하는 사람용 이력이다(docs/demo-review-gate.md).

| 버전 | 상태 | 저장소 파일 | Artifact | 사용자 결정 | 일시 |
|---|---|---|---|---|---|
| - | 해당없음 | - | - | judge: none | 10-08 11:05 |
