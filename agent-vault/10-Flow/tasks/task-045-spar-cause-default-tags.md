---
id: task-045
title: 스파링 실패 원인 태그 — 기본 7개(관장 확정) + 직접 입력은 그 기록에만
status: doing
created: 2026-09-22
tags:
  - type/task
  - domain/spar
  - domain/recall
related_tasks:
  - task-022-failure-first-spar-input-and-cause-tags
aliases:
  - 원인 태그 기본 7개
  - 스파링 원인 태그 누적
---

# task-045 — 스파링 실패 원인 태그: 기본 7개 + 직접 입력은 그 기록에만

## 사용자 요청 (2026-09-22)

> 스파링 추가 / 수정 화면에서 실패한 기술의 사유를 기록할 때 태그를 추가하면 다음 기록에도 남아 있어서, 사유를 자유롭게 기록하면 태그가 계속 늘어나기만 하고 제거할 수가 없다. 태그를 추가할 때는 기억하지 않고 기본 태그만 기억하게 해 줘. 기본 태그는 관장 에이전트에게 질의해서 정하고 그것으로 교체.

계획 승인 과정에서 사용자가 확정한 것:
1. 지금 정의된 6개(기본 4개 + 직접 추가 2개) 전부 교체 대상.
2. **직접 입력(`+`) 기능은 남긴다** — 다만 다음 기록 선택지에는 안 남게.
3. 새 태그 중 기존 태그와 비슷한 것은 **문구만 바꿔** 기존 스파링 기록에서 그대로 쓰이게 — **기록 데이터는 고치지 않는다.**

## 원인 (Leader 실측)

- `+` 는 `POST /api/spar-causes` 로 `spar_causes` 에 **`active=1` 행을 영구 생성**한다. 선택지는 `active` 행 전부라 한 번 추가하면 모든 기록에 뜬다. 프론트 상수·localStorage 는 없다.
- 지우는 UI 없음 — 프론트는 `listSparCauses`·`createSparCause` 만 호출한다.
- 실측 `spar_causes`(2026-09-22):

| user | id | name | active | 사용 |
|---|---|---|---|---|
| 1 | 1·2·3·4 | 그립·각도·타이밍·연결 없음 | 1 | 0 |
| 3 | 43 | 그립 | 1 | 5 |
| 3 | 44 | 각도 | 1 | 3 |
| 3 | 45 | 타이밍 | 1 | 7 |
| 3 | 46 | 연결 없음 | 1 | 2 |
| 3 | 47 | 사이드에서 바라토세팅을 위한 그립이 잘못되어서 안걸림 | 1 | 1 (s355, 09-07 바라토플라타, `[43,47]`) |
| 3 | 48 | 이유 모름 | 1 | 1 (s392, 09-21 백포지션 컨트롤) |

> 🔴 **되돌리기용 옛 이름 기록** — 이 task 로 이름이 바뀌는 행: user 1 `#2 각도`·`#4 연결 없음`, user 3 `#44 각도`·`#46 연결 없음`·`#48 이유 모름`. 되돌릴 땐 같은 id 에 옛 이름을 UPDATE 하면 된다(기록은 id 참조라 따라온다).

## 관장(gym-master) 확정안 — 기본 태그 7개

근거: user 3 실패 항목 55개 중 원인·메모가 있는 16건. 원칙 5 "실패는 쪼개서 본다"의 칸 중 **내 쪽 칸**(그립·세팅·엔트리·대처·피니시) + 이 기록에서 큰 패턴(고정·압박) + 훈련생이 직접 만든 "모르겠음". 상대 리액션은 메모 칸이 맡는다(16건 중 14건에 메모).

| # | 태그 | 뜻 | 기존 태그 |
|---|---|---|---|
| 1 | 그립 | 잡을 곳을 못 잡았거나 잘못 잡았거나 놓쳤음 | `그립` 그대로 |
| 2 | 세팅 | 들어가기 전 준비(각도·자세·무너뜨리기) 부족, 단계를 건너뛰고 서두름 | `각도` → 이름만 변경 |
| 3 | 타이밍 | 준비는 됐는데 들어간 순간이 이르거나 늦었음 | `타이밍` 그대로 |
| 4 | 고정·압박 | 눌러 두지 못해 상대가 빠져나가거나 굴러 나감 | 신규 |
| 5 | 대처·연결 | 막힌 뒤 다음 수(전환·연계)가 없거나 늦었음 | `연결 없음` → 이름만 변경 |
| 6 | 마무리 | 자리는 지켰는데 끝(탭·스윕 완성)을 못 냄 | 신규 |
| 7 | 모르겠음 | 어디서 끊겼는지 모르겠음 — 다른 태그와 같이 고르지 않음 | `이유 모름` → 이름만 변경 |

**구분 기준** (화면 안내·관장 복기 공통)
- 세팅 vs 타이밍 — 내 준비가 덜 됐으면 세팅, 준비는 됐는데 순간이 틀렸으면 타이밍. "서둘렀다"는 단계를 건너뛴 것이라 세팅.
- 고정·압박 vs 마무리 — 상대가 빠져나갔으면 고정·압박, 안 빠졌는데 끝을 못 냈으면 마무리.
- 고정·압박 vs 대처·연결 — 빠지기 전에 못 막았으면 고정·압박, 막히거나 빠진 뒤 다음 수가 없었으면 대처·연결.

`#47` 은 비슷한 기본 태그로 이름을 바꿀 수 없다(s355 에 `그립` 이 이미 함께 있음) → **직접 입력 태그로 남는다.** s355 에서는 그대로 보이고 선택지에서만 빠진다.

관장 권고 중 **보류**(사용자가 "기록 그대로" 선택): 타이밍 2건(s383·s385) → 대처·연결 재분류, #47 → 그립 병합 + 문장을 메모로 이동.

## 설계 (스키마 변경·기록 수정 없음 — `--with-migrate` 불필요)

정본 계획: `~/.claude/plans/sorted-zooming-riddle.md`

`active` 의 의미를 **"선택지에 뜨는가 = 기본 태그인가"** 로 재정의한다. DELETE·PUT 을 부르는 UI 가 없어 기존 의미와 충돌하지 않는다. 저장 경로(`classes.js` `ownedCauseIds`)는 비활성 id 도 보존하고, 분석(`labAnalytics.js` → `/api/holes`·관장 MCP `get_holes`·`RecallPage`)은 비활성 포함 id→이름 매핑이라 **변경 불필요**.

### 백엔드 — `backend/src/routes/sparCauses.js`
1. `SEED_NAMES` → `DEFAULT_CAUSES = ['그립','세팅','타이밍','고정·압박','대처·연결','마무리','모르겠음']`. `·`(U+00B7)은 BMP.
2. `RENAMES = { '각도': '세팅', '연결 없음': '대처·연결', '이유 모름': '모르겠음' }`.
3. `seedIfEmpty` → `syncDefaults(userId)` — GET 마다, 멱등, 트랜잭션 하나:
   1. 옛 이름 행이 있고 새 이름 행이 없을 때만 rename(id 유지). 새 이름 행이 이미 있으면 건드리지 않는다.
   2. 기본 이름 행이 없으면 생성(`active=1`, `sort=index`, UNIQUE 충돌 무시).
   3. 모든 행: `cleanName` 기준 기본 목록에 있으면 `active=1`·`sort=index`, 없으면 `active=0`. 다를 때만 UPDATE.
4. `POST /`: 같은 이름 행이 있으면 **그 행을 그대로 반환**(400·비활성 되살리기 제거). 없으면 **`active=0`** 으로 생성.
5. `?active=1`·PUT·DELETE 주석 갱신(sync 가 active 를 덮어씀). `models/SparCause.js`·`index.js:407` 주석 갱신.

### 프론트 — `web/src/pages/SparEditPage.jsx` `FailDetail`
1. 칩 = 기본 태그(`active`, sort 순) + 이 항목이 고른 직접 입력 태그 + 이 카드에서 방금 입력한 태그(로컬 state — 실수로 해제해도 편집 중엔 남게).
2. 직접 입력 태그의 `' (해제됨)'`·`opacity 0.6` 제거.
3. `+` 입력칸 placeholder: `맞는 칸이 없을 때만, 짧게 — 이 기록에만 남아요`. 메모 칸: `상대가 어떻게 막았나요? (예: 자세를 낮게 깔았음)`.
4. `모르겠음` 배타 선택 — 고르면 다른 원인이 풀리고, 다른 원인을 고르면 `모르겠음`이 풀린다.
5. 213~215 주석 갱신.

### 문서
- `docs/recall-lab-spec.md` §4.1.1 — 결정 변경(task-045) + 구분 기준.
- `.claude/agents/gym-master.md` — 26줄 예시 `'각도 부족'` → `'세팅'`, 원인 태그 7개와 구분 기준 짧게 추가(관장실 런타임이 이 파일을 쓴다 — Developer 가 로딩 경로 확인).

## 역할 배정

| 역할 | 담당 파일 |
|---|---|
| Developer | `backend/src/routes/sparCauses.js` · `backend/src/models/SparCause.js` · `backend/src/index.js`(주석만) · `web/src/pages/SparEditPage.jsx` · `docs/recall-lab-spec.md` · `.claude/agents/gym-master.md` |
| Reviewer | 읽기 전용 감사 |
| QA | 읽기 전용 + admin(user 1) API 실행 검증 |

🔴 **주의사항**
- 개발·운영이 **같은 DB** 다. 검증은 **admin(user_id=1) 로만.** user 3 은 배포 후 본인이 화면을 열 때 sync 된다 — 그 전에 user 3 으로 GET 하지 말 것.
- 작업트리에 **권한만 바뀐 파일 6개**(`backend/src/index.js` 등, 644→755)가 있다. 내용 변경 0줄. 커밋에 섞지 말 것 — `index.js` 는 이번에 주석을 고치므로 커밋 시 `git diff` 로 내용 변경만 들어가는지 확인.
- 코드 조각은 이 문서에 없다 — 설계는 **검증 대상**이다. 틀렸다고 판단되면 반박하라(누적 교훈: Leader 지시가 틀리고 Developer 반박이 옳았던 것 5건).

## Reviewer 체크포인트
1. 의도: 선택지 = 7개만, 직접 입력은 그 기록에만, 기존 기록은 id 그대로 새 이름.
2. `syncDefaults` 멱등성 — 두 번째 GET 에서 쓰기 0건인가.
3. 동시 GET 경합 — rename·create 가 UNIQUE 에 걸려도 요청이 실패하지 않는가, 트랜잭션 롤백 시 부분 적용이 남지 않는가.
4. rename 충돌 경로(옛·새 이름이 둘 다 있는 사용자).
5. 직접 입력 태그 id 가 스파링 재저장(destroy+reinsert)에서 보존되는가.
6. NFC — 이름 비교가 전부 `cleanName` 경유인가.

## QA 체크리스트 (6개 — 실제 출력으로 판정, 못 하면 "미검증")
1. user 1 `GET /api/spar-causes` → id 2·4 가 같은 id 로 `세팅`·`대처·연결`, 7개 `active=1` 순서대로, 그 외 `active=0`. 두 번째 GET 행 수·이름 불변.
2. rename 충돌 픽스처(user 1 에 `이유 모름`·`모르겠음` 둘 다) → 에러 없이 `모르겠음` 기본, `이유 모름` 비활성.
3. `POST` 새 이름 → `active=0` / 재POST → 같은 id·비활성 유지 / 기본 태그 이름 POST → 기본 태그 id.
4. 직접 입력 태그 id 로 스파링 저장 → 재조회 유지 → 재수정 저장 후에도 유지 → `/api/holes` 에 이름 표시.
5. 화면(headless chrome 스크린샷): 선택지 7개 + `+` / 입력한 태그는 그 카드에만 / 새 기록엔 안 보임 / `모르겠음` 배타 / `(해제됨)` 없음.
6. 검증용 픽스처·테스트 기록 정리 후 user 1 상태를 user_id 별로 보고.

## 진행 기록

(각 역할이 아래에 추가)

### Developer (2026-09-22)

- [13:05] **구현 완료 — 커밋·푸시·배포 안 함**(Leader 몫). 권한만 바뀐 6개 파일은 손대지 않았다(`index.js` 는 주석 2줄만, 모드 그대로).

**바꾼 파일**

| 파일 | 요지 |
|---|---|
| `backend/src/routes/sparCauses.js` | `DEFAULT_CAUSES`(:30)·`RENAMES`(:36) 상수. `planSync()`(:57, 순수 함수 — 할 쓰기만 계산) + `syncDefaults()`(:111). `seedIfEmpty` 삭제. `GET`(:175) 은 응답 전 sync. `POST`(:193) 는 sync → 같은 이름이면 그 행 반환 → 없으면 **`active=0`** 생성, UNIQUE 충돌이면 DB 비교로 그 행 반환. `PUT`·`DELETE` 는 로직 그대로, 주석만(sync 가 active·기본 sort 를 덮어씀) |
| `backend/src/models/SparCause.js` | `active` 새 의미 주석 |
| `backend/src/index.js` | :407 주석 2줄(seedIfEmpty → syncDefaults) |
| `web/src/pages/SparEditPage.jsx` | `FailDetail`(:590): 칩 = 기본(active) + 이 항목이 고른 직접 입력 + 이 카드에서 방금 입력(`addedIds` 로컬 state). `(해제됨)`·`opacity` 제거. `모르겠음` 배타(`toggle()` :611, `UNKNOWN_CAUSE` :581). prop `onToggleCause` → `onChangeCauses(next)`(:963), `toggleCause()` 삭제. placeholder 2개 교체(:693·:721). `addCause` 가 재조회 실패 시에도 방금 받은 태그를 목록에 넣음(:232) |
| `docs/recall-lab-spec.md` | §3 시드 주석 1줄, §4.1 API 표 4줄, §4.1.1 기존 2행에 🔄 표시 + 표 끝에 「결정 변경(task-045)」 블록(결정 7행·7개 태그 뜻·구분 기준) |
| `.claude/agents/gym-master.md` | :26 예시 `'각도 부족'` → `'세팅'`, 원칙 5 아래 2줄(7개 태그·직접 입력의 뜻·구분 기준) |

**설계에서 달라진 점 (반박·보완)**

1. **sync 를 "빠른 길 + 잠금 재계산"으로 나눴다.** 설계는 "트랜잭션 하나"였다. 평상시 GET 마다 트랜잭션을 여는 대신 잠금 없는 SELECT 로 계획을 세워 할 일이 0이면 끝(**쓰기 0·트랜잭션 0**). 할 일이 있을 때만 트랜잭션 + `SELECT … FOR UPDATE` 로 **다시 읽어** 계산한다. 이유: 설계대로 "읽고 → 판단 → 쓰기"를 잠금 없이 하면, 동시 요청 둘이 같은 옛 상태를 보고 판단해 한쪽의 rename 이 다른 쪽 결과와 엇갈릴 수 있다. 잠근 뒤 다시 읽으면 뒤에 온 쪽은 앞쪽 결과를 보고 할 일이 0이 된다.
2. **UNIQUE 충돌을 "무시"하지 않고 트랜잭션 전체를 롤백한 뒤 다시 계산한다(최대 3회).** 행이 0개인 사용자는 잠글 행이 없어 동시 INSERT 가 UNIQUE·**데드락**(InnoDB 가 트랜잭션을 통째로 롤백한다)에 걸린다. 개별 INSERT 만 catch 하면 데드락에서는 이미 롤백된 트랜잭션 위에서 계속 진행하게 된다. 3회 모두 실패하면 로그만 남기고 **GET 은 실패시키지 않는다**(프론트는 GET 실패 시 태그 0개 화면이 된다. 다음 조회가 다시 맞춘다).
3. **POST 도 먼저 `syncDefaults()` 를 돈다.** rename 전(옛 `각도` 행만 있는 상태)에 `세팅` 을 직접 입력하면 `세팅` 이 비활성 직접 입력 태그로 따로 생긴다. 그러면 rename 규칙("새 이름 행이 있으면 건드리지 않음") 때문에 `각도` → `세팅` rename 이 영원히 건너뛰어지고, 과거 기록은 계속 `각도` 로 남는다. 평상시엔 쓰기 0이라 비용은 SELECT 1회다.
4. **같은 이름 행이 여럿일 때(NFC·NFD 두 벌은 UNIQUE 를 통과한다) 정본 한 행만 기본 태그로 삼는다**(`pickCanonical`: 저장값이 이미 정본형인 행 → 작은 id). 나머지는 비활성. 정본 행의 저장값이 NFD·공백이면 이름을 정본형으로 고친다. 설계 3("cleanName 기준 기본 목록에 있으면 active=1")을 그대로 하면 두 벌이 **둘 다** active=1·같은 sort 가 돼 칩이 두 개 뜬다.
5. **POST 의 UNIQUE 충돌 → 그 행 반환.** `utf8mb3_general_ci` 는 영문 대소문자를 무시한다(`'abc'='ABC'` 실측 1). `cleanName` 이 다르다고 보고 INSERT 했다가 UNIQUE 에 걸리는 경로가 있어, DB 비교로 찾은 행을 돌려준다(500 방지).
6. **`+` 입력칸 줄바꿈(화면 실측으로 발견).** 입력칸과 추가·취소를 한 줄에 두면 390px 폭에서 안내문이 `…짧게 — 이 기록` 에서 잘려, 정작 알려야 할 「이 기록에만 남아요」가 안 보였다(첫 스크린샷). 입력칸이 한 줄을 다 쓰고 버튼은 아랫줄 오른쪽으로 가게 바꿨다(:683). 안내 문구는 설계 그대로다.
- 설계대로 한 것: 스키마·기록 데이터 무수정(`--with-migrate` 불필요). `?active=1` = 기본 7개. 분석 경로(`labAnalytics`·`ownedCauseIds`)는 수정 없음. 정렬은 `sort, id` 그대로다.

**실행한 검증** — 하네스 `/home/brownjeon/.node-local/bjj-backup/task-045-20260922-125117/`(`README.md`에 재실행법). 격리 서버 `127.0.0.1:3145`: 작업트리 `backend/src` 의 `/api` + 하네스가 빌드한 번들만 싣고, `index.js` 는 쓰지 않았다(부팅 시 voice_jobs·longVideoWorker 같은 운영 잡을 건드린다). **user 1 토큰만** 썼다. SQL 로그로 쓰기 문장 수를 셌다.
- **체크 1** (`qa1.log`): 첫 GET 은 200. `1 그립·2 세팅·3 타이밍·49 고정·압박·4 대처·연결·50 마무리·51 모르겠음`, sort 0~6, 전부 active=1이고 id 2·4 가 유지됐다. 쓰기는 UPDATE 2 + INSERT 3을 트랜잭션 1개로 했다. **두 번째 GET 은 쓰기 0**(SELECT 2문장뿐)이고 응답도 같았다. `?active=1` → 7개.
- **체크 2** (`qa2.log`): user 1 에 `이유 모름`·`각도`·NFD `그립` 픽스처를 넣은 뒤 GET → 200, 에러 없음. `모르겠음`(#51)·`세팅`(#2)·`그립`(#1)이 기본으로 남고, 픽스처 3개는 active=0이 됐다(UPDATE 3). 재GET 은 쓰기 0.
- **체크 3** (`qa3.log`): 새 이름 POST → `{id:55, active:0}`. 공백을 붙여 재POST → 같은 id 55, active 0. `세팅` POST → id 2(active 1). NFD `마무리` → id 50. `각도`(비활성 픽스처) → 53. `t045 Abc` 다음 `t045 abc` → 같은 id 56(콜레이션 경로). 빈 값·41자·이모지 → 400 3건. PUT 로 id 55 를 active=1 로 올리면 다음 GET 에 0으로, DELETE 로 #50 을 내리면 다음 GET 에 1로 돌아온다.
- **경합** (`qa-race-a.log`·`qa-race-b.log`): (a) 맞출 일이 있는 상태에서 동시 GET 10개 → 전부 200. 트랜잭션 10개 중 1개만 쓰기 3건을 했고 나머지는 0건. (b) 행 0개 사용자의 동시 첫 GET 10개 → 전부 200, 최종 7행, 중복 없음. ROLLBACK 10·COMMIT 10 이 찍혀 재시도가 실제로 돌았다. 재현을 위해 user 1 행을 `user_id=-45` 로 잠시 옮겼다가 원복했다(스냅샷 md5 `f4885689…` 전후 일치).
- **체크 4** (`qa4.log`): 픽스처 수업·스파링을 만들고 `causes:[55,2]`·`[51]` 을 저장 → 재조회에서 유지. 불러온 값 그대로 PUT(destroy+reinsert) → 유지. `/api/holes?min=1` 은 `causes: 세팅(2)·모르겠음(51)·t045 무게중심(55)` 을 이름으로 돌려줬다. 픽스처는 DELETE 로 연쇄 삭제했다.
- **체크 5** (`qa5-390.log`·`qa5-360.log`·`shots/390`·`shots/360`, headless chrome CDP): 22개 판정 전부 PASS(390·360 둘 다).
  - 새 항목은 칩 7개 + `+`, `(해제됨)`·흐림 없음, 메모 placeholder 교체.
  - `+` 로 입력하면 그 카드에만 칩이 생기고 선택된다.
  - `세팅` 고른 뒤 `모르겠음` → 선택은 `[모르겠음]` 만 남고, 풀린 직접 입력 칩은 편집 중엔 그대로 보인다. 이어서 `그립` → `모르겠음` 이 풀린다.
  - 같은 라운드의 다른 항목, 새 라운드의 항목에는 직접 입력 태그가 없다.
  - 저장 후 다시 열면 그 항목에만 `[그립, t045 화면입력]` 이 남는다.
- **user 3 드라이런**(`plan-dryrun.js 3` — SELECT + 순수 계산, 쓰기·GET 없음): 배포 후 첫 조회 때 #44→세팅, #46→대처·연결(sort 4), #48→모르겠음(sort 6), #47→active 0, 고정·압박·마무리 생성. 이력서의 기대와 같다. user 2(행 0) → 7개 생성.
- 빌드: 하네스 ext4 사본에서 `vite build` 성공(✓ built). `node --check` 3개 통과. 관장 페르소나는 `loadPersona()` 로 로드 확인(본문 3,584자, `--agents` JSON 8,024바이트, 단일 argv 한계 131,072).
- 관장 런타임 로딩 경로: `services/gymMasterPersona.js` 가 `__dirname/../../../.claude/agents/gym-master.md` 를 mtime 캐시로 읽어 `--agents` JSON 으로 넘긴다. 운영은 **릴리스 디렉토리의 사본**을 읽으므로 NFS 수정은 배포 전까지 반영되지 않는다. 길이 캡은 코드에 없고 한계는 argv 하나(131,072바이트)라 여유가 크다.

**정리** (`cleanup.log`, 체크 6): 픽스처 수업 5개는 전부 API 로 삭제했다(`classes` 에 t045 테마 0건). user 1 태그는 **작업 전 상태로 원복**했다 — `1 그립·2 각도·3 타이밍·4 연결 없음`, 전부 active=1, 그 외 행 삭제. QA 가 체크 1 을 처음 상태에서 다시 볼 수 있게 하려는 것이다. user 3 은 `43~48` 이 작업 전과 같다(SELECT 로만 확인). `user_id=-45` 는 0행. :3145 리스너는 종료했고 토큰 파일은 지웠다.

**남은 위험**
- LOW: 360px 폭에서 메모 칸 안내문의 닫는 괄호 `)` 가 1px 정도 잘린다(`shots/360/02a`). 뜻은 다 보인다. 390px 는 정상.
- LOW: `모르겠음` 배타는 **화면에서만** 강제한다. 서버는 `모르겠음`+다른 태그 조합을 거르지 않는다(설계 범위 그대로).
- LOW: `UNKNOWN_CAUSE='모르겠음'` 이 프론트에 이름으로 박혀 있다. 백엔드 `DEFAULT_CAUSES` 이름을 바꾸면 같이 고쳐야 한다(양쪽 주석에 명시). 응답에 플래그를 싣는 편이 더 단단하지만 응답 구조를 바꾸는 일이라 하지 않았다.
- 범위 밖 관찰: `docs/gym-master-chat-plan.md`(기획서) 에 옛 예시 `'각도 부족'` 3곳이 남아 있다(담당 파일 아님). 하네스를 쓰다 본 것: `PUT /api/classes/:id/spar/:sparDayId` 에 본문 없이 보내면 그 일자의 라운드가 전부 지워진다(`sessions` 가 없으면 destroy 만 된다). 프론트는 항상 `sessions` 를 보내 실사용 영향은 없고, 픽스처에서만 일어났다.

### Reviewer (2026-09-22)

**판정: PASS-with-notes** (Critical 0 / High 0 / Medium 2 / Low 4)

읽기 전용 감사 + 하네스(`/home/brownjeon/.node-local/bjj-backup/task-045-20260922-125117/`) 재기동으로 admin(user 1)만 사용해 실행 검증. 작업 전 `SELECT`로 `spar_causes`(user 1: 1그립·2각도·3타이밍·4연결없음 active=1, user 3: 43~48 그대로)를 먼저 확인한 뒤 시작, 끝나고 `cleanup.sh` + 직접 `SELECT`로 두 사용자 모두 원상태 확인 완료(`user_id=1→4행, user_id=3→6행`, 그 외 user_id 0행). `node --check` 로 `sparCauses.js`·`SparCause.js`·`index.js` 문법 확인.

**의도 검증** — PASS. 선택지 7개(`DEFAULT_CAUSES`)만 active=1로 뜨고, `+` 직접입력은 `active=0`으로 그 기록에만 남으며, 옛 이름 3개(각도→세팅·연결 없음→대처·연결·이유 모름→모르겠음)는 같은 id를 유지한 채 이름만 바뀐다. 기록 데이터(`success[i].causes`)는 어디서도 수정되지 않는다.

**체크포인트별 결과**

1. **의도(선택지 7개/직접입력 국소/id 유지)** — PASS. 직접 GET 실행(아래)으로 확인.
2. **syncDefaults 멱등성** — PASS. 내가 직접 재현: 1차 GET에서 `UPDATE 2 + INSERT 3`(id2→세팅, id4→대처·연결, id76/77/78 신규 고정·압박/마무리/모르겠음), `writes_since` 5건. 2차 GET은 `writes_since` 0건, SQL 로그도 SELECT 2줄뿐. 응답도 동일.
3. **동시 GET 경합** — PASS. 코드 리뷰(managed transaction은 콜백 예외 시 자동 롤백 → 부분 적용 없음) + Developer가 남긴 `qa-race-a.log`/`qa-race-b.log` 원문을 직접 열어 확인(재실행은 안 함 — 같은 경합을 운영 DB에 두 번 태울 필요가 없다고 판단). `qa-race-b.log`: 행 0개 사용자 동시 GET 10개 → `COMMIT 10 / ROLLBACK 10`(요청마다 평균 2회 시도, 즉 최초 시도 충돌 후 재시도로 수렴), 최종 7행·중복 없음, 원복 전후 md5 일치. 내 직접 테스트에서도 3회 재시도 로직 자체는 별도로 트리거 안 됐지만(경합 없이 단일 요청), 코드상 `sequelize.transaction` catch 블록이 매 attempt마다 새 트랜잭션을 열므로 이전 attempt의 쓰기가 남을 수 없음을 확인.
4. **rename 충돌 경로(옛·새 이름 공존)** — PASS. 내가 직접 재현: `세팅`(id2, active=1) 이미 있는 상태에서 `각도`(id80, active=1) 행을 SQL로 주입 → GET 호출, 에러 없음(200), `세팅`은 그대로, `각도`(id80)만 active=0으로 전환(`writes_since` 1건), 재GET은 0건. `planSync`의 "새 이름 행이 있으면 rename 건드리지 않음" 분기가 실제로 작동함을 확인.
5. **직접 입력 태그 id 보존(destroy+reinsert)** — PASS. 코드 리뷰로 `backend/src/routes/classes.js`의 `ownedCauseIds`(user_id 필터만, active 무관 — 비활성 id도 소유권 집합에 포함)와 `normalizeSuccessItems`(그 집합에 있으면 causes 보존)가 이번 diff에 포함되지 않고 원래부터 비활성 id를 보존하는 로직임을 확인. `labAnalytics.js:178`의 `SELECT id, name FROM spar_causes WHERE user_id = ?`도 active 필터 없이 전체를 이름 사전으로 읽음(주석 "spar_causes 는 읽기만 한다" 그대로). Developer의 `qa4.log` 원문도 직접 열어 대조: 직접입력 태그 id 55가 저장→재조회→PUT(destroy+reinsert)→재조회까지 유지, `/api/holes`에도 이름으로 표시됨을 실측 로그에서 확인.
6. **NFC — cleanName 경유 여부** — PASS. 코드상 `planSync`·`findByName`·POST/PUT 중복검사 전부 `cleanName()` 경유. 추가로 내가 직접 재현: `그립`의 NFD(자모분리) 버전을 `active=1`로 주입 → GET 후 정본(raw==name, 작은 id인 id1)만 active 유지, NFD 사본(id81)은 active=0으로 전환, 에러 없음, 재GET 0건.

**아키텍처/보안/기술부채**
- 소유권 필터: GET/POST/PUT/DELETE 전부 `user_id` 를 WHERE 절에 직접 포함(라우트 레벨), `ownedCauseIds`도 동일. 누락 없음.
- SQL: 전부 Sequelize ORM 바인딩(`replacements`/모델 메서드) 경유, 직접 문자열 삽입 없음.
- 문서 정합성: `docs/recall-lab-spec.md`·`.claude/agents/gym-master.md` 모두 코드와 대조 확인, 불일치 없음. `gymMasterPersona.js:18`의 페르소나 로딩 경로(`__dirname/../../../.claude/agents/gym-master.md`)도 Developer 서술과 일치 확인.
- 프론트 prop 배선: `grep`으로 `onToggleCause`/`toggleCause` 전 코드베이스에서 완전히 제거됐고 호출부(`GrowthSessionCard`) 1곳만 `onChangeCauses`로 정확히 갱신됐음을 확인. `addedIds`는 `FailDetail`의 로컬 state이고 `key={i-t.name}`로 항목별 인스턴스가 분리돼 항목 간·라운드 간 누수 없음(코드 추적으로 확인, 화면 확인은 Developer의 `qa5` 스크린샷 22건 PASS 기록에 의존).

**MEDIUM**
- M1 — GET의 부작용이 "없으면 추가"에서 "있어도 rename"으로 확장됨(`backend/src/routes/sparCauses.js:175-177`). task-022의 `seedIfEmpty`는 삽입만 했지만 `syncDefaults`는 기존 행의 이름도 바꾼다. 기술적 안전장치(예: 별도 `/sync` 엔드포인트로 분리하거나 dry-run 플래그)는 없고 순전히 "user 3로 GET하지 말라"는 절차적 경고에만 의존한다 — 이번 검증에서도 그 경고가 이력서에 두 번 강조된 이유이기도 하다. 당장 고칠 필요는 없지만(멱등·수렴적이라 데이터 손상은 없음) GET이 읽기 전용이라는 가정을 깨는 패턴이 반복·확장되고 있다는 점은 Leader가 알아둘 만하다.
- M2 — `syncDefaults`의 catch 블록(`sparCauses.js:132-136`)이 `isTransient()` 미매치 에러까지 포함해 3회 실패 후 전부 삼킨다(`console.error`만, 응답은 200으로 옛 상태 반환). 의도된 설계(연락처: 이력서 설계 문단 2)지만, 진짜 버그(예: 향후 `DEFAULT_CAUSES`에 41자 이상 문자열이 들어가는 실수)가 나도 사용자·운영자 모두 겉으로는 "그냥 오래된 목록"으로만 보여 알아채기 어렵다. pm2 로그 확인 외 별도 알림 경로 없음.

**LOW**
- L1 — `모르겠음` 배타는 프론트에서만 강제, 서버(POST/PUT/저장 검증)는 `[모르겠음, 다른태그]` 조합을 막지 않음. Developer도 이미 명시(설계 범위 밖), 실질 위험 낮음.
- L2 — 프론트 `UNKNOWN_CAUSE='모르겠음'`과 백엔드 `DEFAULT_CAUSES`의 문자열이 단일 소스가 아니라 양쪽에 하드코딩(주석으로 상호 참조는 돼 있음). 둘 중 하나만 바뀌면 배타 로직이 조용히 깨짐.
- L3 — 360px 폭에서 메모 placeholder의 닫는 괄호가 살짝 잘림(Developer `shots/360/02a`). 뜻 전달에는 지장 없음.
- L4 — 범위 밖: `docs/gym-master-chat-plan.md`의 옛 예시 `'각도 부족'` 3곳 미수정(Developer 담당 파일 아님, 후속 task로 남기면 됨).

**결론**: Critical/High 없음, 데이터 무결성·동시성 결함 없음(직접 재현으로 확인). Developer가 원 설계를 벗어난 5가지 반박(빠른길+FOR UPDATE, 3회 재시도, POST 선-sync, NFC/NFD 정본화, UNIQUE 충돌 시 행 반환)은 전부 근거가 타당하고 실측으로 뒷받침됨 — 반박하지 않는다. QA로 인계 가능.

### QA (2026-09-22)

**판정: PASS** (6/6, Critical/High 결함 0건)

하네스 `/home/brownjeon/.node-local/bjj-backup/task-045-20260922-125117/` 재기동(`node mini-server.js` :3145) + admin(user 1) 토큰만 사용. 시작 전 운영 DB 를 직접 SELECT 해 기준 상태 확인: `user1: 1그립·2각도·3타이밍·4연결없음(active=1)`, `user3: 43~48 문서와 동일(active=1)`. 항목 3~4번은 Developer 스크립트를 재실행하되 픽스처(직접 입력 태그 `t045 무게중심` 등)는 이번 세션에서 내가 직접 새로 생성했다(과거 실행분은 cleanup 으로 이미 지워진 상태였음).

1. **PASS** — `req GET /api/spar-causes` 2회 직접 실행. 1차: `id2→"세팅"`, `id4→"대처·연결"`, active=1 7개가 `그립(1)·세팅(2)·타이밍(3)·고정·압박(82)·대처·연결(4)·마무리(83)·모르겠음(84)` 순서로 나옴(SQL 로그로 UPDATE 2+INSERT 3 확인). 2차 GET: `writes_since` **0**, 응답 동일(행 수·이름 불변).
2. **PASS** — `INSERT INTO spar_causes (user_id,name,sort,active) VALUES (1,'이유 모름',9,1)` 로 충돌 픽스처 직접 주입 후 GET 실행 → `200`, 에러 없음. 결과: `모르겠음(84)` active=1 유지, `이유 모름(85)` active=0 로 전환(쓰기 1건).
3. **PASS** — `POST {"name":"t045qa 새태그"}` → `{id:86, active:0}`. 트레일링 스페이스로 재POST → 같은 `id:86, active:0`. `POST {"name":"세팅"}` → 기본 태그 id `2`(active:1) 반환.
4. **PASS** — `qa4.py` 를 직접 재실행(사전에 `POST {"name":"t045 무게중심"}`로 커스텀 태그(id 87)를 새로 만들어 스크립트 전제 충족). 결과: `causes:[87,2]` 저장 → 재조회 유지 → PUT(destroy+reinsert) 재저장 후에도 `[87,2]` 유지 → `/api/holes?min=1` 에 `{"id":87,"name":"t045 무게중심","count":1}` 이 이름으로 표시됨. 픽스처 수업은 스크립트가 자체 DELETE.
5. **PASS** (스크린샷을 Read 로 직접 열어 확인, 아래 기재) — `qa5.sh` 를 W=390·W=360 로 재실행.
   - **390**: 22개 판정 전부 PASS(1회 실행으로 재현).
   - **360**: **1차 실행에서 `ERROR Cannot read properties of null (reading 'chips')` 로 5단계(저장→재오픈)에서 중단됨** — Developer 로그(`qa5-360.log`, 전부 PASS)와 다른 결과라 그대로 보고한다. 즉시 재실행한 2차는 Developer 로그와 동일하게 22개 전부 PASS. 원인은 재오픈 직후 카드 탐색이 한 번 null 을 반환하는 타이밍성(harness `waitFor` 통과 직후 짧은 재렌더 구간) 문제로 보이며, 3회 시행 중 실패 시에도 **잘못된 값이 찍힌 적은 없었다**(항상 null 아니면 정답, 오답 없음) — LOW 로 기록.
   - 스크린샷 육안 확인(Read 도구, 총 6장): `01`(390) 새 항목 칩 7개(그립·세팅·타이밍·고정·압박·대처·연결·마무리·모르겠음)+점선 `+`, `(해제됨)`·흐림 없음. `02b`(390) `+`로 입력한 `t045 화면입력`이 초록(선택됨)으로 그 카드에만 추가. `03`(390) `모르겠음` 선택 시 다른 칩 전부 해제되고 `t045 화면입력`은 흐림 없이 그대로 남음. `05`(390) 저장 후에도 `그립`+`t045 화면입력` 선택 유지(초록), `(해제됨)` 없음. `06`(390) 새 라운드(t045기술C) 카드는 기본 7개+`+`만, 커스텀 태그 없음. `02a`(360) `+` 입력칸 안내문 "맞는 칸이 없을 때만, 짧게 — 이 기록에만 남아요"가 잘리지 않고 온전히 보임.
6. **PASS** — 픽스처 정리: 내가 만든 t045 클래스(qa4.py·qa5.sh 픽스처)는 스크립트 자체 DELETE로 이미 0건(SELECT 로 확인, `classes` 에 `t045%` 0행, `spar_sessions` user1 참조 0건). `./cleanup.sh` 실행 후 **내가 직접** 독립 SELECT 로 최종 상태 확인:
   - `user_id=1`: `1 그립·2 각도·3 타이밍·4 연결 없음`, 전부 `active=1`, **4행뿐**(작업 전과 동일).
   - `user_id=3`: `43~48` 이름·순서·active 전부 작업 전과 동일, **6행뿐**(SELECT 만, API 호출 없음).
   - 다른 user_id 행 없음(`GROUP BY user_id` → 1:4, 3:6 뿐).
   - 테스트 서버(:3145) 종료 확인(`ss -ltnp` 재확인, listener 없음), `token.admin` 삭제 확인.

**요구사항 충족 여부**: ✅ 충족 — 선택지 7개 고정·직접 입력은 그 기록에만·기존 기록 id 유지·rename 멱등·POST 충돌 처리·화면 노출 규칙 전부 실행 기반으로 확인됨.

**남은 참고사항**
- LOW(신규): `screen.js` W=360 재오픈 단계(⑤)에서 3회 중 1회 `waitFor` 통과 직후 카드 조회가 일시적으로 null — 화면 로직 결함이 아니라 harness 타이밍 이슈로 판단(오답 없음, 재시도 시 항상 정답). 후속에서 `waitFor` 뒤 짧은 재시도 루프를 추가하면 harness 안정성이 오른다.
- Developer·Reviewer 가 이미 남긴 LOW 4건(360px 메모 칸 괄호 1px 잘림, `모르겠음` 배타 서버 미검증, `UNKNOWN_CAUSE` 이중 하드코딩, `gym-master-chat-plan.md` 옛 예시)은 이번 재검증에서도 동일하게 관찰되며 새로 발견된 결함은 없다.

Leader/Deployer 인계: PASS, 결함 0건, 스키마 변경 없음(`--with-migrate` 불필요). 배포 후 확인할 화면: 스파링 추가/수정의 실패 기술 원인 칩(7개+`+`), `/api/holes` 원인별 이름 표시.

### Leader (2026-09-22)

- [13:25] Developer 보고를 **파일·DB 로 대조**(6개 파일 내용 변경 확인, user 1·3 `spar_causes` 작업 전과 동일) 후 Reviewer 로 넘김. Reviewer·QA 종료 후에도 SELECT 로 재확인 — user 1 `1~4`, user 3 `43~48`, 전부 원래 이름·active=1. 테스트 서버(:3145) 종료 확인.
- QA 스크린샷 `shots/390/02b`(카드에서 `+`로 넣은 태그가 그 카드에만 선택 칩) · `06`(새 라운드는 기본 7개 + `+` 만)을 Leader 가 직접 열어 확인.
- Reviewer M1·M2 는 **수용**(설계상 의도, backlog 기록). M2 의 `console.error` 는 task-044 의 "조용한 실패 가시화" 기준(로그에 남는다)을 충족한다고 판단.
- 배포 경로: 이 프로젝트는 **webhook 이 release.sh 에 위임** — push 가 곧 blue/green 배포다(`~/.local/webhook-deploy/deploy-bjj.sh`, 09-21 `c3f5fd4` 도 push 2분 뒤 릴리스 생성). 그래서 `scripts/deploy.sh` 를 따로 돌리지 않는다(같은 sha 이중 배포). Deployer 역할의 판정(릴리스·`current`·pm2·`/health`·서빙 번들)은 Leader 가 직접 한다.

## 최종 요약 (사용자용)

**무엇을 바꿨나**
- 스파링 기록의 "왜 안 됐나요?" 선택지를 **관장이 정한 기본 7개**로 고정했습니다: 그립 · 세팅 · 타이밍 · 고정·압박 · 대처·연결 · 마무리 · 모르겠음.
- **`+` 직접 입력은 그대로** 쓸 수 있습니다. 다만 입력한 태그는 **그 기록에만** 붙고, 다음 기록 선택지에는 나오지 않습니다. 같은 문장을 다시 입력하면 새로 만들지 않고 예전 것을 다시 씁니다.
- 기존 태그 중 비슷한 3개는 **이름만** 바꿨습니다: 각도 → 세팅, 연결 없음 → 대처·연결, 이유 모름 → 모르겠음. 기록은 태그 번호를 가리키므로 **기존 스파링 기록은 한 줄도 고치지 않고** 새 이름으로 보입니다.
- `사이드에서 바라토세팅을…` 은 09-07 바라토플라타 기록에만 남고 선택지에서는 빠집니다.
- `모르겠음` 은 다른 원인과 같이 고를 수 없습니다(고르면 나머지가 풀림).
- 안내 문구: `+` 입력칸 "맞는 칸이 없을 때만, 짧게 — 이 기록에만 남아요", 메모 칸 예시 "자세를 낮게 깔았음".
- 관장(관장실 채팅)도 같은 7개 태그와 구분 기준으로 복기합니다.

**언제 적용되나** — 배포 후 **스파링 화면을 처음 열 때** 한 번 자동으로 맞춰집니다(이름 변경·새 태그 추가). 그 뒤로는 바뀌는 것이 없습니다.

**검증** — Developer 자체 검증 → Reviewer PASS-with-notes(Critical·High 0) → QA PASS 6/6(Sonnet, 전 항목 직접 실행) → Leader 재확인. 검증은 전부 admin 계정으로만 했고, 쓰시는 계정 데이터는 배포 전까지 건드리지 않았습니다.

**되돌리기** — 코드는 blue/green 롤백. 이름은 같은 번호에 옛 이름을 넣으면 됩니다(위 "되돌리기용 옛 이름 기록").
