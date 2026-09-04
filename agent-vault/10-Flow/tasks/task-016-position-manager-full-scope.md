---
name: task-016-position-manager-full-scope
aliases: ["포지션관리확장", "포지션삭제전파"]
tags:
  - type/task
  - domain/backend
  - domain/frontend
  - domain/techniques
related_tasks:
  - "[[task-012-position-rename-cascade]]"
  - "[[task-014-nfd-encoding-audit]]"
status: done
created: 2026-09-04
updated: 2026-09-04
---

# task-016 — 포지션 관리 화면을 4개 저장소 전체로 확장 (사용자 승인 완료)

## 배경 — 조사에서 드러난 구조적 공백

[[task-012-position-rename-cascade]] 정리 중, "삭제는 기술에서만 제거되고 rename은 4곳에 전파되는 비대칭"이 비차단 백로그로 남았다. 그런데 실데이터를 보니 **비대칭보다 큰 문제**가 있었다.

포지션 관리 화면은 **`techniques.pos`에 쓰인 이름만** 목록에 띄운다. 그런데 실제 데이터는 이렇다 (2026-09-04 Leader 실측, admin 테스트 행 제거 후):

| 저장소 | 이름 |
|---|---|
| 기술 | 가드 (Guard), 마운트 (Mount), 백 (Back), 사이드 컨트롤, 탑 포지션, 풀가드, 기타 |
| 영상 | ＋ 오픈 가드, **클로즈드 가드**, 패스 (Pass), 하프 가드 |
| 드릴 | ＋ 스탠딩, **클로즈드 가드 (Closed Guard)**, 터틀, 오픈가드 탑, 하프가드 탑 |

**드릴·영상에만 있는 8종은 관리 화면에 아예 나오지 않아 이름을 고칠 수도 지울 수도 없다.** 그리고 `클로즈드 가드` / `클로즈드 가드 (Closed Guard)`, `오픈 가드` / `오픈가드 탑` 처럼 **같은 개념이 다른 이름으로 갈라져 있는데 합칠 방법이 없다**.

## 사용자 결정 (2026-09-04)

선택지 3개를 제시했고 사용자가 **"목록·삭제 모두 4곳으로 확장"**을 선택했다.

> 기술·영상·드릴·스파링에 쓰인 모든 포지션을 목록에 띄우고, 삭제도 4곳에 전파한다.
> 지금 손댈 수 없는 8종을 관리할 수 있게 되고, 갈라진 이름도 rename으로 합칠 수 있다.
> **삭제 범위가 넓어지므로 확인 문구를 강화한다.**

## 할 일

1. **`GET /api/techniques/positions`** — 목록 출처를 `techniques.pos`에서 **4개 저장소 합집합**으로 확장. 카운트 4종(`techCount`/`clipCount`/`drillCount`/`sparCount`)은 [[task-012-position-rename-cascade]]에서 이미 구현돼 있으니 그대로 쓴다.
2. **`DELETE /api/techniques/positions/:name`** — 현재 `techniques.pos`에서만 제거. **4곳 전부에서 제거**하도록 확장한다.
3. **프론트 확인 문구 강화** — 삭제가 무엇을 지우는지 **구체적 숫자로** 보여줄 것(예: "기술 5 · 영상 3 · 드릴 2에서 제거됩니다"). 지금 문구("해당 포지션이 모든 기술에서 제거됩니다")는 확장 후 **거짓이 된다.**

## 반드시 지킬 것 — 앞선 task들의 교훈

- **트랜잭션** ([[task-012-position-rename-cascade]]) — DELETE도 4개 저장소를 건드리게 되므로 rename과 동일하게 `sequelize.transaction()`으로 묶어야 한다. 중간 실패 시 일부만 지워지면 rename보다 더 나쁘다(복구할 원본이 없다).
- **정규화** ([[task-014-nfd-encoding-audit]]) — 이름 비교는 반드시 `utils/nfc.js`의 비교 함수를 쓸 것. 단순 `===`/`includes`로 비교하면 자모분리형 행이 조용히 안 지워져 split-brain이 된다. **트랜잭션은 이걸 못 막는다.**
- **거짓 문구 금지** ([[task-013-study-backlog-fixes]], [[task-015-coach-cron-and-prompt-guard]]) — 동작을 바꾸면 그 동작을 설명하는 주석·UI 문구를 **같이** 고칠 것.
- **스파링 병합** — 삭제 시 `spar_sessions.positions`(`[{name,score}]`)에서 항목을 빼면 빈 배열이 될 수 있다. 그 경우 어떻게 되는지 판단하고 근거를 남길 것.

## Developer 기록

- [18:47] task-016 착수. 지시서·`utils/nfc.js`·`routes/techniques.js`(GET/PUT/DELETE positions)·`PositionManagerModal.jsx`·`coachAnalytics.js` 확인. 작업트리 clean(`92c6184`) 확인.
- [18:51] 검증용 픽스처 생성 — **전량 admin(user_id=1)**. 기술2(NFC/NFD)·영상3·드릴3·스파링4(대상+타포지션 / 대상만 / NFD 대상만 / 스파전용). NFD 행을 일부러 섞어 정규화 비교가 실제로 도는지 보게 했다.
- [18:52] **네거티브 컨트롤 (수정 전)** — 두 결함을 실측 재현:
  - 목록 누락: 기술에 없고 영상·드릴·스파링에만 있는 3종(`T016영상전용`/`T016드릴전용`/`T016스파전용`)이 목록에 **안 나옴** → 이름 수정·삭제 불가.
  - 삭제 미전파: `DELETE 테스트포지션` → `{"ok":true,"updatedCount":2}` 로 성공 응답. 그런데 잔존 확인 결과 **영상2·드릴2·스파링3 = 7행에 이름이 그대로 남음.** 목록이 기술 기준이라 화면에서는 사라져 사용자는 지워진 줄 안다(조용한 거짓).
- [18:55] 구현 — `backend/src/routes/techniques.js`
  - `GET /positions`: 목록 출처를 `techCounter.keys()` → **4개 카운터 키의 합집합**(`allNames`)으로 교체. 각 카운터가 이미 NFC 키를 쓰므로 합집합에서 같은 이름이 두 줄로 갈라지지 않는다. 기존의 "기술에 쓰인 것만 노출한다"는 주석은 사실이 아니게 되어 교체.
  - `DELETE /positions/:name`: 기술 단독 → **4개 저장소 전부**, 전체를 `sequelize.transaction()` 하나로 묶음(rename과 동일 컨벤션). 비교는 전부 `posEq`(=`eqNFC`). 응답에 `removed:{tech,clip,drill,spar}` 추가(`updatedCount`는 4곳 합계로 유지 — 기존 필드 호환).
  - 드릴은 **행을 지우지 않고 `pos=''`만** 비운다 — 포지션 태그 하나 지우자고 그 드릴의 기술·메모·별점까지 날리는 건 요청받지 않은 파괴다. `''`는 `classes.js`의 쓰기 경로(`pos: drill.pos || ''`)와 같은 값이고, 목록 집계 쿼리가 `pos != ''`로 걸러 카운트에서 자연히 빠진다.
- [18:57] 구현 — `web/src/components/PositionManagerModal.jsx`
  - 확인 문구를 저장소별 실제 건수로 교체(0인 저장소는 숨김). 예: `기술 2건 / 참고영상 2건 / 드릴 2건 / 스파링 3건` + `되돌릴 수 없습니다`.
  - 상단 안내의 **"삭제하면 해당 포지션이 모든 기술에서 제거됩니다"는 확장 후 거짓**이라 "수정·삭제 모두 4곳에 함께 적용됩니다 / 목록에는 4곳 중 어디든 쓰인 포지션이 모두 표시됩니다"로 교체.
  - `handleDelete(name, techCount)` → `handleDelete(p)`(카운트 4종 전부 필요).

### 실행 검증 결과

| 항목 | 결과 |
|---|---|
| 네거티브 컨트롤(목록 누락) | 수정 전 3종 누락 → **수정 후 6종 전부 노출** |
| 네거티브 컨트롤(삭제 미전파) | 수정 전 7행 잔존 → **수정 후 `removed:{tech:2,clip:2,drill:2,spar:3}`, 잔존 0행** |
| NFD 케이스 | NFD로 저장한 기술77·영상166·드릴56·스파139 **전부 삭제 대상에 포함**(정규화 비교 실작동) |
| 트랜잭션 롤백 | 4단계 직전 강제 예외 주입 → HTTP 500, **9행 전부 원상복구**(기술·영상·드릴에 부분삭제 흔적 0). 주입 코드는 md5 대조로 원복 확인(`129154870b861bd292c0dd87771a9523`) |
| 회귀 — rename 단순 | `updatedCount:9`, 4곳 전부 갱신(NFD 행 포함) |
| 회귀 — rename 병합 | spar137 `[{테스트,3},{기타,4}]` → `[{기타,4}]` (avg 3.5→4). `mergeSparPositions` 정상 |
| 회귀 — 50자 가드 | 51자 입력 → HTTP 400 유지 |
| 카운트 정합성 | DB 직접 집계 vs API — **admin 6종·실사용자 25종 전부 일치, 누락 이름 0** |

**실사용자 체감 효과(읽기 전용 확인)**: 관리 가능한 포지션이 **6종 → 25종**. 지시서가 지목한 8종을 포함해 19종이 새로 손댈 수 있게 됐고, 갈라진 이름들이 한 화면에 모여 rename 병합이 가능해졌다 — `클로즈드 가드`(영상2·드릴1) / `클로즈드 가드 (Closed Guard)`(드릴3) / `클로즈가드`(스파1), `오픈 가드`(영상2·드릴2) / `오픈가드`(스파5) / `오픈가드 탑`(드릴1), `탑 포지션` / `탑` / `탑 컨트롤`, `사이드 컨트롤` / `사이드 포지션`, `백 (Back)` / `백 포지션`.

### 스파링 빈 배열 처리 — 판단과 근거

**판단: `[]`를 그대로 저장한다(특별 취급·행 삭제 없음).** 근거 3가지:

1. **`[]`는 이미 이 앱의 기본값이다.** 모델 `defaultValue: '[]'`(`models/SparSession.js`)이고, `SparEditPage`가 새 라운드를 저장할 때 **항상** `positions: []`로 쓴다(`web/src/pages/SparEditPage.jsx:126`). 즉 운영 DB의 다수 라운드가 원래부터 `[]`다 — 삭제가 만드는 상태는 새로운 게 아니다.
2. **소비 측이 전부 빈 배열 안전이다.** `coachAnalytics`는 `(s.positions || []).forEach(...)`로 집계해 아무것도 누적하지 않고(:100), AI 프롬프트는 `if ((s.positions||[]).length)`로 '점유 포지션' 줄 자체를 생략한다(:159). `classes.js` 조회도 `safeParse`로 `[]`를 그대로 돌려준다. 실측에서도 삭제 후 spar138·139가 `[]`가 됐고 오류 없음.
3. **대안이 더 파괴적이다.** 라운드(행)를 지우면 탭 수·시간·시도 기술·메모까지 사라진다. 포지션 태그 하나 지웠다고 스파링 기록을 없애는 건 사용자 의도가 아니다.

결과적으로 그 라운드는 "포지션 기록이 없는 라운드"가 되어 포지션 평균 집계에서만 빠진다. 이 부작용을 사용자가 삭제 **전에** 알 수 있도록 확인 문구에 `※ 이 포지션만 기록된 스파링 라운드는 포지션 기록이 비게 됩니다 (라운드 자체는 남고, 포지션 평균 집계에서만 빠집니다)`를 넣었다(sparCount>0일 때만).

### 테스트 데이터 원복 — user_id별

생성 14행 **전량 admin(user_id=1)**, 전량 삭제 완료(id 지정 삭제, 삭제 전 `user_id<>1` 혼입 여부 가드 통과):
`spar_sessions 137~140 / spar_days 36 / drills 55~57 / classes 66 / video_clips 165~167 / techniques 76,77`

| 대상 | 시작 스냅샷 | 현재 | 판정 |
|---|---|---|---|
| user_id=3 clips | 133 (지시서 기준값 132는 **선행값**) | 133 | 무변경 |
| user_id=3 techniques / classes / long_videos | 46 / 29 / 6 | 46 / 29 / 6 | 무변경 |
| coach_reports(전체) | 40 | 40 | 무변경 |
| user_id=1 techniques / clips / classes / drills / spar_days / spar_sessions | 1 / 0 / 3 / 0 / 0 / 0 | 1 / 0 / 3 / 0 / 0 / 0 | 무변경 |
| admin 기술 59 `트라이앵글 초크` pos | `["풀가드"]` | `["풀가드"]` | 무변경 |
| T016·테스트포지션 잔존 전수검사 | — | 5개 패턴 전부 0건 | 잔존 없음 |

> ⚠️ **지시서 기준값 정정** — `clips 132`는 현재 상태와 다르다. 작업 착수 **직후 최초 실측이 이미 133**이었고, 133번째 행은 `video_clips id=164 "델라리바 -> 라펠"`(user_id=3, 실제 instagram reel URL, `created_at 2026-09-04 18:43:51`)로, **내 첫 픽스처 행(18:50:37)보다 7분 앞선다.** 사용자가 직접 추가한 실기록이며 내 생성물이 아니다. 이후 기준값은 **133**으로 봐야 한다.
> `long_videos.id=29`는 조회조차 하지 않았다(무접촉). 현재 NFC인 것은 코디네이터가 18:53 실행한 승인된 마이그레이션 결과다.

### 변경 파일

| 파일 | 변경 이유 |
|---|---|
| `backend/src/routes/techniques.js` | `GET /positions` 목록을 4저장소 합집합으로 확장 / `DELETE /positions/:name`을 4저장소 트랜잭션 삭제로 확장(+`removed` 상세) / 사실이 아니게 된 주석 교체 |
| `web/src/components/PositionManagerModal.jsx` | 확인 문구를 저장소별 실제 건수로 강화(+스파링 빈배열 고지) / 거짓이 된 상단 안내 교체 / `handleDelete` 시그니처 변경 |

프론트는 CLAUDE.md 절차(ext4 빌드 → 로컬 dist rsync → `pm2 restart bjj`)로 배포 완료, dist에 새 문구 반영·옛 문구 0건 확인. **커밋하지 않았다**(지시대로).

### Reviewer 인계 — 테스트 환경

서버: `http://localhost:3000` (pm2 `bjj` 실행 중). 토큰: `jsonwebtoken.sign({userId:<id>}, JWT_SECRET)`.
재현 스크립트 일체는 `scratchpad/t016/`에 있다 — `fixture.js`+`fixture2.js`(픽스처 생성) / `reset.js`(초기화) / `state.js`(4곳 잔존 확인) / `verify_counts.js <uid>`(DB vs API 카운트 대조) / `confirm_msg.js <uid> [이름…]`(확인문구 렌더) / `cleanup.js`(전량 삭제).

```bash
# 목록이 4곳 합집합인지 (읽기 전용, 실사용자로 바로 확인 가능)
curl -s -H "Authorization: Bearer $TOK" http://localhost:3000/api/techniques/positions
# 삭제 전파 — 기대: {"ok":true,"updatedCount":N,"removed":{"tech":..,"clip":..,"drill":..,"spar":..}}
curl -s -X DELETE -H "Authorization: Bearer $TOK"   "http://localhost:3000/api/techniques/positions/$(python3 -c "import urllib.parse;print(urllib.parse.quote('<이름>'))")"
```
> 삭제·rename 검증은 **반드시 admin(user_id=1) 픽스처로만** 할 것 — 실사용자(user_id=3)에 대해서는 GET만 안전하다.

## 검증 순환 로그

- [x] Developer — 구현·실행검증·원복 완료 (2026-09-04 19:05)
- [x] Reviewer — PASS (Critical 0 / High 0 / Medium 0, Low 1건 비차단). 상세는 아래 "Reviewer 기록" 참고.
- [x] QA — 전체 6개 항목 PASS (실측 명령·출력 포함). 상세는 아래 "QA 기록" 참고.
- [x] 커밋 — Leader (2026-09-04)

## Reviewer 기록

- [19:07] **판정: PASS (Critical 0 / High 0 / Medium 0, Low 1건 비차단)**. Developer 보고서는 검증 대상으로만 취급했다. DB는 읽기만 했고(코드 수정·데이터 변경 없음), 가능한 곳은 전부 내가 직접 짠 별도 스크립트로 독립 재계산·재현했다.

  **A. DELETE 원자성 — 최우선 확인, 8개 쿼리 전부 대조**
  `DELETE /positions/:name`(techniques.js) 전체를 offset 읽기로 다시 읽어 트랜잭션 콜백 안의 쿼리 8개를 한 줄씩 대조: `Technique.findAll`/`update`, `VideoClip.findAll`/`update`, drillCandidates `sequelize.query`·`Drill.update`, sparRows `sequelize.query`·`SparSession.update` — **전부 `transaction: t` 확인, 새는 쿼리 없음**. `res.json(...)`도 `const removed = await sequelize.transaction(...)` 완료 후에만 호출됨(코드 순서로 확인) — 커밋 전 응답 없음. task-012 PUT 핸들러와 동일한 컨벤션.

  **B. 정규화 비교 — 전부 `posEq`/`toNFC` 사용, 원시 비교 없음**
  4단계 전부 대상 선정에 `positions.some(p => posEq(p, targetName))` / `entries.some(e => e?.name && posEq(e.name, targetName))`을 쓰고, 생존 원소는 `toNFC`로 정본화 후 `new Set()` 재중복제거. 원시 `===`/`includes`가 남은 곳 없음(diff 전체 재확인).

  **C. 목록 합집합 정확성 — DB 직접 재계산 + 라이브 API 양쪽으로 교차검증**
  1. `information_schema` 대신 **내가 처음부터 새로 짠 Node 스크립트**로 GET /positions와 같은 집계 로직(파싱→NFC→카운터→합집합)을 독립 재구현해 uid=1·uid=3에 대해 직접 재계산 → **uid=1: 1종("풀가드"), uid=3: 25종** — Developer가 보고한 "실사용자 25종"과 정확히 일치, 갈라진 이름 쌍(클로즈드 가드/클로즈드 가드 (Closed Guard)/클로즈가드, 오픈 가드/오픈가드/오픈가드 탑 등)도 실제로 확인됨. (admin이 1종인 건 Developer의 테스트 픽스처가 이미 정리된 뒤라 6종이 아니라 1종인 게 맞음 — 원복 시점 차이일 뿐, 불일치 아님.)
  2. **JWT를 직접 만들어 운영 서버(:3000)에 GET만** 호출해 라이브 API 응답을 받아본 결과 — 내 독립 재계산과 **바이트 단위로 동일**(uid=1·uid=3 둘 다). 소스 코드와 실제 배포본이 일치함을 확인.
  3. 관련 실제 row count도 직접 SQL로 재확인: `clips_u3=133, tech_u3=46, classes_u3=29, longvideos_u3=6, coach_reports=40, tech_u1=1, clips_u1=0, classes_u1=3, drills_u1=0, spardays_u1=0, sparsessions_u1=0` — Developer의 "무변경" 표와 전부 일치. `T016`/`테스트포지션` 패턴 잔존도 5개 테이블 전수 조회로 0건 확인.

  **D. 빈 배열/빈 문자열 처리 — 소비 측 직접 확인, 근거가 보고보다 더 강함**
  - `backend/src/services/coachAnalytics.js`를 직접 읽어 확인: 100행 부근 `(s.positions || []).forEach(...)`은 빈 배열에서 그냥 아무 것도 안 함(에러 없음), 159행 부근 `if ((s.positions||[]).length)`은 빈 배열이면 "점유 포지션" 줄 자체를 생략 — Developer 주장과 정확히 일치.
  - `web/src/pages/SparEditPage.jsx:126`도 직접 확인 — `positions: []`로 하드코딩. 그런데 여기서 **더 나아가 프론트 전체를 grep해보니, `spar_sessions.positions`([{name,score}] 구조)를 읽거나 렌더링하는 코드가 프론트에 이 한 줄 외에는 전혀 없다** — 즉 현재 UI는 새 스파링 라운드에 포지션 점수를 입력하는 기능 자체가 없고 오직 `[]`만 쓴다. Developer의 "이미 기본값이다" 주장이 실제로는 "현재 UI가 쓸 수 있는 유일한 값"이라는 더 강한 사실이었음을 추가로 확인했다(Developer가 언급하지 않은 부분이나 결론을 더 뒷받침함).
  - DB 실측으로 정량 확인: `spar_sessions` 54행 중 **36행(67%)이 이미 `positions='[]'` 또는 NULL** — "다수가 원래 []"라는 주장이 실측 다수(과반)임을 확인.
  - 드릴은 `Drill` 모델(`pos: DataTypes.STRING(50)`)에 `allowNull:false`나 `validate`가 없어 빈 문자열 쓰기가 모델 검증에 걸리지 않음을 확인. `GET /positions`의 드릴 카운터 쿼리가 `d.pos != ''`로 걸러 자연스럽게 카운트에서 빠지는 것도 코드로 재확인.
  - 결론: "빈 값이 이상하게 보이는" 지점을 못 찾았다 — 소비 측 안전 주장은 사실이고 사용자 확인 문구(스파링 부작용 고지)도 적절하다.

  **E. UI 문구 사실성**
  `PositionManagerModal.jsx` diff 전체 대조 — 상단 안내("수정·삭제 모두 4곳에 함께 적용됩니다")가 실제 백엔드 동작과 일치. `handleDelete`의 confirm 문구가 `p.techCount/clipCount/drillCount/sparCount` 중 **0이 아닌 것만** 나열하고(코드로 확인, `rows.filter(([,n])=>n>0)`), `sparCount>0`일 때만 "포지션 기록만 비고 라운드는 남는다"는 부작용 문구를 별도로 붙임 — D에서 확인한 실제 동작과 정확히 일치. "되돌릴 수 없습니다" 경고도 포함. 배포된 dist 번들에서 새 문구("되돌릴 수 없습니다") 존재·옛 문구("모든 기술에서 제거됩니다") 0건을 직접 grep으로 재확인 — 빌드·배포가 실제로 반영됐음을 확인.

  **F. rename 회귀 — 없음**
  `router.put('/positions/:name', ...)` 블록 전체를 offset으로 다시 읽어 task-014 검증 시점 내용과 대조 — **바이트 단위로 완전히 동일**(8쿼리 트랜잭션, `mergeSparPositions` 호출, `POSITION_NAME_MAX=50` 가드, `posEq` 비교 전부 그대로). `git diff`에도 이 구간에 대한 hunk가 아예 없어 손대지 않았음을 이중 확인. 참고로 코디네이터 메시지의 "최다겹침·1회소비"는 task-013 `matchEditedChapters()`(`longVideoPipeline.js`) 용어이고 그 파일은 이번 diff에 등장하지 않아 애초에 대상이 아니다.

  **G. 범위 준수**
  `git status`·`git diff --stat` 재확인 — 코드 변경은 정확히 지시받은 2개 파일(`backend/src/routes/techniques.js`, `web/src/components/PositionManagerModal.jsx`)뿐이고 vault 로그 외 다른 파일 없음. 이번엔 동시 작업 흔적도 없음(코디네이터 안내대로).

  **기타 확인**: `node --check backend/src/routes/techniques.js` 재실행 → 문법 오류 없음. `Drill`/`SparSession` 모델에 `pos=''`·`positions='[]'` 쓰기를 막을 검증 규칙 없음(정상 허용값).

  **잔존 LOW (비차단)**
  - LOW-1: DELETE 응답의 `removed:{tech,clip,drill,spar}` 필드를 프론트가 아직 소비하지 않는다(`PositionManagerModal.jsx`의 `handleDelete` 성공 경로는 `load()`+`onChanged()`만 호출, 응답 상세는 안 씀 — confirm 단계에서 이미 사전 고지하므로 사후 요약이 필수는 아님). 결함이 아니라 향후 UI(예: "삭제 완료: 기술2·영상2 제거됨" 토스트)를 위한 여지로 남겨둔 것으로 보임. 백로그 후보.

  **최종**: Critical 0 / High 0 — **PASS**. QA로 인계.

## QA 기록

- [17:10] 착수. 이번 task는 동시 작업 없음(코디네이터 확인) — `pm2 restart` 허용됐지만 이미 배포된 코드로 충분히 검증 가능해 별도 재기동은 하지 않음(재기동 자체는 Developer가 이미 1회 수행, restart count 22 그대로 유지). admin(user_id=1)으로만 픽스처 생성, 실사용자(user_id=3)는 SELECT만.

**사전 확인 — 기준값 전량 일치**
```
u3 clips=133 (지시서 정정값과 일치, 132 아님) / tech=46 / classes=29 / long_videos=6
u1 clips=0 / tech=1 / classes=3 / drills=0 / spar_days=0 / spar_sessions=0
coach_reports=40
clip id=164: {"title":"델라리바 -> 라펠","user_id":3} — 실기록 확인, 무접촉 예정
long_videos.id=29: title.normalize('NFC')===title → true (마이그레이션 반영 확인, 무접촉 예정)
```

**픽스처 설계**: admin 전용 class 1개(id=67) 아래 5개 세트를 직접 INSERT —
Set A(항목1, NFC 4저장소) / Set B(항목2 네거티브용, NFC 4저장소) / Set C(항목3, **NFD 4저장소 전부**) /
Set D(항목4 중복검사용, 기술=NFD·영상=NFC **다른 저장소 간 혼합 정규화**) / Set E(항목5, rename+스파링병합 겸용).

### 항목1 — [핵심] 삭제가 4곳에 전파되는가 — PASS

```
$ curl -X DELETE .../positions/T016QA삭제전파701811 (인코딩 후)
{"ok":true,"updatedCount":4,"removed":{"tech":1,"clip":1,"drill":1,"spar":1}}

$ SELECT 직접 확인 (techId78/clipId168/drillId58/sparSessionId141)
techA.pos=[]  clipA.position=[]  drillA.pos=""  sparA.positions=[]
```
→ **4곳 전부 DB에서 직접 확인, 잔존 0.**

### 항목2 — [핵심] 네거티브 컨트롤 — PASS

Set B(techId79/clipId169/drillId59/sparSessionId142)에 대해, 코드를 되돌리지 않고 **같은 posEq 비교를 기술 테이블에만** 적용하는 별도 스크립트로 "수정 전 방식"을 재현(영상·드릴·스파링 미접촉).

```
[구방식 재현] techniques.id=79 pos: ["T016QA네거티브701811"] -> [] (기술 테이블만 수정)

$ SELECT 직접 확인
techB.pos=[] (제거됨)
clipB.position=["T016QA네거티브701811"]   ← 잔존
drillB.pos="T016QA네거티브701811"          ← 잔존
sparB.positions=[{"name":"T016QA네거티브701811","score":2}]  ← 잔존
```
→ **구방식이면 기술에서만 사라지고 영상·드릴·스파링 3곳에 그대로 남는 것을 실행으로 재현.** 항목1의 성공이 4곳 확장 덕분임을 확인. (이후 실제 DELETE API로 Set B 잔존분 정리 — `{"removed":{"tech":0,"clip":1,"drill":1,"spar":1}}`로 재확인 겸 정리.)

### 항목3 — [핵심] NFD 케이스 — PASS

Set C는 기술·영상·드릴·스파링 **4곳 전부 NFD**로 직접 INSERT(코드포인트로 확인: `110b 1166 11ab ...`). NFC로 타이핑해 삭제 호출.

```
$ node -e "'T016QA엔에프디701811' === 'T016QA엔에프디701811'.normalize('NFC')" → true (입력은 NFC)
$ curl -X DELETE .../positions/T016QA엔에프디701811(NFC 인코딩)
{"ok":true,"updatedCount":4,"removed":{"tech":1,"clip":1,"drill":1,"spar":1}}

$ SELECT 직접 확인 (techId80/clipId170/drillId60/sparSessionId143)
techC.pos=[]  clipC.position=[]  drillC.pos=""  sparC.positions=[]
```
→ **자모분리형 4곳 전부 완성형 입력으로 정상 삭제됨. task-014에서 발견된 "조용히 안 지워지고 성공 응답" 실패 모드가 재발하지 않음을 확인.**

### 항목4 — 목록 합집합 — PASS

Set D(기술=NFD, 영상=NFC, 같은 개념)로 **서로 다른 저장소 간 정규화 형태 혼합** 시 중복 여부를 확인. 전체 목록도 DB 직접 재계산과 대조.

```
$ GET /api/techniques/positions (admin)
[{"name":"풀가드",...},{"name":"T016QA병합대상701811",...},
 {"name":"T016QA이름변경전701811",...},{"name":"T016QA중복검사701811","techCount":1,"clipCount":1,"drillCount":0,"sparCount":0}]
→ 전체 4건, "T016QA중복검사" 이름 포함 행 1개뿐(중복 없음) — 기술=NFD·영상=NFC였는데 한 줄로 합쳐짐.

$ 독립 재계산 스크립트(별도로 직접 짠 코드, GET 라우트 재사용 아님) — admin uid=1 대상
DB 직접 집계 결과: [풀가드, T016QA병합대상, T016QA이름변경전, T016QA중복검사] — API 응답과 이름·4종 카운트 전부 바이트 단위 일치
```
→ **정규화 형태가 저장소마다 달라도 중복 노출 없음, 카운트 4종이 DB 실제 건수와 정확히 일치.**

### 항목5 — [회귀] 이름변경 — PASS

Set E로 3가지(4곳 전파·스파링 병합·50자 제한)를 한 번에 검증. `PUT /positions/:name` 코드는 Reviewer가 이미 task-014 시점과 바이트 단위 동일함을 확인한 상태 — QA는 실행으로 재확인.

```
$ PUT .../positions/T016QA이름변경전701811 {"newName":"T016QA병합대상701811"}
{"ok":true,"updatedCount":4}

$ SELECT 직접 확인 (techId82/clipId172/drillId61/sparSessionId144)
techE.pos=["T016QA병합대상701811"]  clipE.position=["T016QA병합대상701811"]  drillE.pos="T016QA병합대상701811"
sparE.positions=[{"name":"T016QA병합대상701811","score":4}]   ← [{...,3},{...,5}] 두 항목이 병합 avg=4로 1항목

$ PUT .../positions/아무거나 {"newName":"가"*51}
{"error":"포지션명은 50자 이내로 입력해주세요 (현재 51자)"}  HTTP 400
```
→ **4곳 전파·스파링 병합(avg 반올림)·50자 가드 전부 회귀 없음.**

### 항목6 — [회귀] 기본 동작 — PASS

```
$ GET /api/techniques (admin) → HTTP 200, 정상 목록 반환
$ GET / (SPA 루트) → HTTP 200
$ GET /health → {"success":true,"data":{"status":"ok",...}}
$ 배포된 dist 번들 직접 grep: "되돌릴 수 없습니다" 존재 확인 / "모든 기술에서 제거됩니다"(옛 문구) 0건
```
→ 기술 목록 조회·SPA·확인문구 배포 전부 정상.

### 원복 내역 — user_id별

```
$ 전 테이블 T016QA 패턴 잔존 검사: techniques=0 video_clips=0 drills=0 spar_sessions=0 classes=0
$ u3: clips=133 / tech=46 / classes=29 / long_videos=6  (기준값 전부 일치, 무변경)
$ u1: clips=0 / tech=1 / classes=3 / drills=0 / spar_days=0 / spar_sessions=0  (기준값 전부 일치, 무변경)
$ coach_reports=40 (무변경)
$ clip id=164 {"title":"델라리바 -> 라펠","user_id":3} 무변경 확인
$ long_videos.id=29 여전히 NFC 확인 (무접촉)
$ admin 기술59 pos=["풀가드"] 무변경 (task-016 이전부터 있던 유일한 실 데이터)
$ 최종 GET /positions(admin) → [{"name":"풀가드",...}] 1건만 잔존 (픽스처 전량 삭제 확인)
$ pm2 bjj restart count: 22 그대로 (QA 세션 중 재기동 없음)
```
임시 검증 스크립트(`qa016_fixture.js`, `qa016_negctrl.js`) 전량 삭제 확인.

### 최종 판정

✅ **검증 통과** — 6개 항목 전부 PASS (Critical/High 결함 0건). Reviewer의 Low 1건(DELETE 응답 `removed` 상세를 프론트가 아직 소비하지 않음)은 UI 사전고지로 충분해 차단 사유 아님 — 코드 리딩으로만 재확인, 별도 실행 검증 불필요 판단.
- 항목1(4곳 전파)·항목2(네거티브 컨트롤)·항목3(NFD 4곳 삭제)·항목4(목록 합집합·중복없음·카운트 정합)·항목5(rename 회귀 3종)·항목6(기본 동작) 전부 실행 명령과 실제 출력으로 확인.
- user_id=3(실사용자)·user_id=1(admin 기존 데이터)·coach_reports·clip id=164·long_videos.id=29 전부 기준값 그대로 원복 확인.
- 코드/DB 스키마 미수정, 커밋 없음, QA 세션 중 `pm2 restart` 미실행.

요구사항 충족 여부: ✅ 충족.

## 최종 요약 (Leader, 사용자용)

### 무엇이 문제였나

포지션 관리 화면(`/기술` → 포지션 관리)이 **기술에 쓰인 이름만** 목록에 띄웠다. 그래서 참고영상·수업드릴·스파링에만 남아 있는 이름은 **화면에 나오지 않아 고칠 수도 지울 수도 없었다.**

더 나쁜 건 삭제였다. 삭제하면 기술에서만 지워지는데, **목록도 기술 기준이라 화면에서는 사라진다.** 사용자는 지워진 줄 알지만 영상·드릴·스파링에는 그대로 남는다. 실제로 재현했다:

```
삭제 요청 → {"ok":true, updatedCount:2}   ← 성공했다고 응답
             영상 2 + 드릴 2 + 스파링 3 = 7군데에 이름이 그대로 남음
```

### 어떻게 바뀌었나

- **목록**: 기술·영상·드릴·스파링 **네 곳에 쓰인 모든 포지션**을 보여준다. 관리 가능한 포지션이 **6종 → 25종**이 됐다.
- **삭제**: 네 곳 전부에서 제거한다. 하나의 트랜잭션으로 묶어 중간에 실패하면 전부 되돌아간다(삭제는 이름변경과 달리 **되돌릴 원본이 없어서** 더 중요하다).
- **확인 문구**: 무엇이 몇 개 지워지는지 저장소별 실제 숫자로 보여준다. 기존 문구("모든 기술에서 제거됩니다")는 이제 거짓이라 함께 고쳤다.

### 곁들여 해결된 것 — 갈라진 이름 합치기

목록이 네 곳을 다 보게 되면서, 그동안 **각자 다른 화면에 흩어져 있어 합칠 수 없던 이름들**이 한 화면에 모였다:

- `클로즈드 가드` / `클로즈드 가드 (Closed Guard)` / `클로즈가드`
- `오픈 가드` / `오픈가드` / `오픈가드 탑`
- `탑 포지션` / `탑` / `탑 컨트롤`

이제 이름변경으로 하나로 합칠 수 있다.

### 검증

- **네거티브 컨트롤** — 수정 전 방식으로는 기술에서만 지워지고 3곳에 남는 것을 보인 뒤, 수정 후 4곳에서 사라지는 것을 확인했다.
- **자모분리(NFD) 케이스** — 오늘 [[task-014-nfd-encoding-audit]]에서 이름변경 쪽에 있던 결함(형태가 다르면 **조용히 안 지워지고 성공 응답까지 나감**)이 삭제 쪽에 재현되지 않는지 확인했다. 네 곳에 자모분리형으로 심어두고 완성형 이름으로 삭제 → 전부 지워졌다.
- **목록 중복** — 같은 이름을 기술엔 자모분리형, 영상엔 완성형으로 심어도 **목록에 하나로 합쳐지는지** 확인했다.
- **트랜잭션 롤백** — 마지막 단계 직전에 일부러 실패시켜 9행이 전부 원상복구되는 것을 확인했다.
- Reviewer가 목록 집계를 **처음부터 새로 짠 스크립트로 독립 재계산**하고, 직접 만든 토큰으로 운영 서버 API를 호출해 응답이 일치하는지까지 확인했다(소스와 실제 배포본이 같다는 것까지 검증).
- **실사용 데이터 무손상** — 테스트는 전부 admin 계정으로 하고 삭제했다.

### 판단 기록 — 스파링·드릴에서 포지션만 빼고 행은 남긴다

삭제 시 스파링 라운드의 포지션 목록이 비면 `[]`로 두고 **행 자체는 지우지 않는다.** 근거:
- `[]`는 이미 앱의 기본값이다(새 라운드는 항상 `[]`로 생성되고, 실데이터 54행 중 **36행(67%)이 이미 `[]`**).
- 이 값을 읽는 코드가 화면 한 곳뿐이고 통계 집계는 아무것도 누적하지 않는다.
- 행을 지우면 **탭 수·시간·시도한 기술·메모까지 함께 사라져** 훨씬 파괴적이다.

드릴도 같은 이유로 행을 남기고 포지션만 비운다. 이 부작용은 삭제 확인 문구에 미리 고지한다.

### 남은 것

- 삭제 응답이 저장소별 삭제 건수(`removed`)를 내려주는데 화면이 아직 쓰지 않는다. 결함은 아니고, 나중에 "무엇이 지워졌는지" 보여줄 여지다.
