---
name: task-024-holes-and-mastery-api
aliases: ["구멍 목록", "사다리 5단계", "holes API", "mastery API", "벨트 서열"]
tags:
  - type/task
  - domain/backend
  - domain/sparring
  - domain/analytics
related_tasks:
  - "[[task-020-recall-lab-spec-and-name-audit]]"
  - "[[task-020b-position-merge-and-name-fixes]]"
  - "[[task-022-failure-first-spar-input-and-cause-tags]]"
  - "[[task-014-nfd-encoding-audit]]"
  - "[[task-023-toggle-nav-generalization]]"
status: done
created: 2026-09-07
updated: 2026-09-07
---

# task-024 — 구멍·사다리 집계 API

## 목표

복기(진단)와 연구(과제)를 화면에 붙이기 전에, **집계 API 2개**를 먼저 만든다.

| 메서드 | 경로 | 용도 |
|---|---|---|
| `GET` | `/api/holes` | `success:false` 항목을 기술명으로 집계 — 실패 2회 이상을 "구멍"으로 |
| `GET` | `/api/mastery/:techId` | 사다리 5단계 판정 (**기술 단위**, 노드 단위 아님) |
| `PATCH` | `/api/mastery/:techId` | 2·3단계 수동 체크 저장 (**이번 배치는 저장소·API만. UI는 task-026**) |

> ⚠️ `docs/recall-lab-spec.md` §4.2는 이 둘을 `/api/lab/holes` · `/api/lab/ladder/:techniqueId`로
> 적어 두었으나, **사용자 지시의 경로(`/api/holes` · `/api/mastery/:techId`)가 정본**이다.
> 사양서 §4.2 표는 이번 구현에 맞춰 Developer가 고친다(경로 2줄 + PATCH 1줄).

---

## 관련 과거 이력 요약 (이것만 읽으면 된다)

### [[task-020-recall-lab-spec-and-name-audit]] — 사양의 근거

- **§5 사다리 5단계**: 1 배움(자동) · 2 드릴(수동) · 3 포지션 스파링(수동) · 4 스파링(자동) · 5 상위 벨트(자동)
- **§5.3 벨트 함정** — 이 task의 가장 큰 위험. 아래 "🔴 함정" 2·3번.
- **§7.1 이름 정규화** — `nfc.js` / `techMatch.js` / `techAliases.js` **재사용, 신규 매처 작성 금지.**

### [[task-020b-position-merge-and-name-fixes]] — 매칭률의 현재 지점

미매칭 **42건(50.6%) → 28건(33.7%)**. 즉 **스파링에 적은 기술명의 3분의 1이 아직 기술트리에 닿지 못한다.**
이 28건이 이번 API에서 **조용히 사라지면 안 된다** — "미연결"로 구분해 내보내는 것이 이 task의 요건이다.

또 이 task에서 확인된 것: `spar_sessions.success`는 **드라이버가 문자열로 반환**한다.
`positions`도 raw SQL 경로에서는 문자열이다. 배열로 착각해 다루면 catch로 떨어져
**행이 통째로 조용히 걸러진다** — 직전 배치에서 실제로 두 번 나온 함정이다.

### [[task-022-failure-first-spar-input-and-cause-tags]] — `success` 항목 구조

```jsonc
[{ "name": "암바", "success": false, "causes": [1, 3], "reaction": "팔 숨김" }]
```

- `causes`는 **`spar_causes.id` 배열**(이름이 아니라 id — rename 전파 회피).
- `cause_ids`/`reaction` **컬럼**은 존재하지만 **정본이 아니다.** 읽지 마라(`SparSession.js` 모델 주석).
- 레거시 호환: 항목이 문자열이면 `{name: x, success: true}`로 취급
  (`backend/src/routes/classes.js:56-57`가 쓰는 것과 **같은 규칙**).

### 기존 소유권 스코프 패턴

- `classes.js`: `Class.findAll({ where: { user_id: req.user.id } })` → `class_id`로 하위 조회.
- `coachAnalytics.collectTrainingData(start, end, userId)`도 `Class`부터 시작한다.
- `routes/index.js`가 `authMiddleware` 아래 전부 마운트 → `req.user.id` 사용 가능.

---

## 🔴 이 API에서 반드시 지킬 것 — **전부 Leader가 운영 DB에서 실측·재현한 함정이다**

### 1. `user_id`가 없는 테이블이 3개다 — `classes`까지 조인

`spar_sessions` · `spar_days` · `drills`에는 `user_id` 컬럼이 **없다.**

```sql
FROM spar_sessions ss
JOIN spar_days sd ON sd.id = ss.spar_day_id
JOIN classes    c  ON c.id  = sd.class_id
WHERE c.user_id = ?
```
```sql
FROM drills d JOIN classes c ON c.id = d.class_id WHERE c.user_id = ?
```

빠뜨리면 계정 간 데이터가 섞인다. 직전 배치에서 **같은 패턴의 IDOR 4건**이 발견됐다(board 백로그).
`GET /api/mastery/:techId`는 **`techniques.user_id = req.user.id`를 먼저 확인**하고,
남의 기술이면 403이 아니라 **404**로 답한다(존재 여부 자체를 흘리지 않는다).

### 2. 벨트 서열 맵은 영문+한글 병기 필수

`belt_history` 실측 (user 3, 5행):

| achieved_date | belt |
|---|---|
| 2025-07-15 | `white` |
| 2025-09-19 | `white` |
| 2025-12-19 | `white` |
| 2026-05-25 | `화이트` |
| 2026-08-07 | `블루` |

`spar_sessions.level` 실측: `화이트` 24 · `블루` 13 · `퍼플` 9 · `블랙` 7 · 빈값 1 — **전부 한글**.

```js
const BELT_RANK = {
  white:0,'화이트':0, blue:1,'블루':1, purple:2,'퍼플':2, brown:3,'브라운':3, black:4,'블랙':4,
};
```

🔴 **Leader 네거티브 컨트롤 실행 결과 (재현 완료)**

| 서열 맵 | 5단계 해당 항목 |
|---|---:|
| 영문+한글 병기 | **20건** |
| 한글만 | **6건** — `belt:white`가 **39회** 매핑 실패 |

**14건이 에러 없이 사라진다.** 매핑에 없는 값을 만나면 조용히 건너뛰지 말고
**`console.warn`으로 로그를 남기고, 응답의 `unknownBelts`에도 실어 보낸다**(QA가 API로 확인 가능하게).

### 3. "본인 벨트"는 **그 스파링 날짜 시점**의 벨트

`belt_history`에서 `achieved_date <= spar_days.date`인 **마지막 행**.
`spar_sessions`에는 날짜가 없다 — `spar_days.date`에서 가져온다.

🔴 **Leader 네거티브 컨트롤 실행 결과**: 현재 벨트(블루=1)로 전 기간을 판정하면 **20건 → 10건.**
전멸이 아니라 **절반만 어긋나서** 숫자가 그럴듯해 보인다 — 그래서 더 발견하기 어렵다.

> 참고: user 3의 스파링 날짜는 **2026-04-20 ~ 2026-06-24** 뿐이라 시점 벨트는 전 기간 **화이트(0)**다.
> 그래서 20건 = `level`이 블루/퍼플/블랙인 성공 항목이다.

### 4. 컬럼마다 파싱 방식이 다르다 — 확인하고 다뤄라

Leader 실측(`mysql2` raw 경로): `success` **문자열** · `positions` **문자열**.
Sequelize 모델 경로(`raw:true`)에서는 `DATEONLY`가 문자열, `TEXT`가 문자열이다.
**어느 경로를 쓰든 실행해서 `typeof`를 확인한 뒤 파싱하라.** 배열로 착각해 `JSON.parse`하면
throw → catch → **행이 통째로 조용히 걸러진다.**

### 5. 🔴 날짜 포맷 — `toISOString()`을 쓰지 마라 (Leader 재현 완료)

`spar_days.date = 2026-06-24` 한 행에 대해:

```
typeof: object | instanceof Date: true
String(d).slice(0,10)        => "Wed Jun 24"      ← 쓰레기
d.toISOString().slice(0,10)  => "2026-06-23"      ← 🔴 하루 밀림 (KST +9)
로컬 파트 조합(정답)          => "2026-06-24"
```

`최근 실패일`이 **하루씩 밀린 채 에러 없이** 나간다. board 백로그의
"`coachAnalytics` 날짜 계산이 UTC 기준" 건과 **같은 종류**다.
SQL에서 `DATE_FORMAT(sd.date,'%Y-%m-%d')`로 뽑거나, JS에서 `getFullYear/getMonth/getDate`로 조합하라.

### 6. 표본 0건은 `0/0`이 아니라 **"기록 없음"**

자동 판정 단계(1·4·5)는 `done: true|false`만으로 표현하지 말고
**`status: 'done' | 'not_yet' | 'no_record'`**를 함께 낸다.
"아직 못 했다"와 "잴 기록이 아예 없다"는 다른 말이다.

### 7. 이름 매칭은 기존 유틸 재사용 — **신규 매처 작성 금지**

`backend/src/utils/nfc.js` · `techMatch.js` · `techAliases.js`.
`matchTechnique(rawName, candidates)`를 **무수정으로** 호출한다.
`candidates`는 반드시 **해당 사용자 소유로 이미 스코프된 목록**을 넘긴다(함수 자체는 user_id를 모른다).

### 8. 🔴 미매칭 28건(33.7%)을 **집계에서 빼지 말고 "미연결"로 구분해 반환**

사라지는 것과 표시되는 것은 다르다. 아래 응답 스키마의 `unlinked` / `linked` 참조.

### 9. 하지 말 것

- `techMatch.js` fuzzy 공백 비대칭 버그 **수정 금지** (board 백로그 — 별도 task).
  이 API는 여러 기능의 공통 기반이 될 매칭 로직 위에 얹히므로, 여기서 고치면 회귀 범위가 폭발한다.
- 별칭 4종(`백 쵸크`·`암락`·`다스 쵸크`·`닌자 쵸크`) 추가 **금지** — **사용자 판단 대기 중.**
  추측으로 채우면 스파링 기록이 조용히 엉뚱한 기술로 집계된다.
- `longVideoPipeline.js:313` 어휘 미제약 저장 (백로그) · 기존 IDOR 4건 (별도 세션) — 손대지 마라.

---

## 🔴 착수 전 Leader 실측 (2026-09-07, SELECT만 사용)

**추정이 아니라 운영 DB 조회 결과다.** Developer는 착수 직전 재확인하되, 이 값과 다르면 **보고할 것.**

### 기준선

| 항목 | 값 |
|---|---:|
| `classes` (user 3) | 29 |
| `spar_sessions` (user 3, classes 조인) | 54 |
| `drills` (user 3) | 29 |
| `techniques` (user 3) | 53 |
| `belt_history` (user 3) | 5 |
| `success` 항목 총계 | **83** (성공 45 · 실패 38) |
| `spar_days.date` 범위 | 2026-04-20 ~ 2026-06-24 |
| MariaDB / sql_mode | 10.11.11 / `STRICT_TRANS_TABLES,...` |

### `GET /api/holes` 기대값 — 실패 2회 이상 = **정확히 4종**

| 기술명 | 실패 | 성공 | 최근 실패일 | match | technique_id |
|---|---:|---:|---|---|---:|
| 트라이앵글 쵸크 | **5** | 0 | 2026-05-25 | exact | 27 |
| 암바 | **3** | 0 | 2026-06-24 | exact | 42 |
| 기무라 | **3** | 8 | 2026-06-24 | exact | 51 |
| 칸토 쵸크 | **2** | 1 | 2026-04-24 | exact | 48 |

> 🔴 **2026-09-07 Leader 정정 — "최근 실패일" 3건이 위 표에서 틀렸었다(05-13 / 05-27 / 05-20).**
> Developer가 착수 시 불일치를 보고했고 **Leader가 실패 행을 개별로 전부 덤프해 재확인했다**:
> 트라이앵글(05-11·05-13·05-15·05-25·05-25) · 암바(04-22·05-27·06-24) · 기무라(05-20·05-20·06-24) · 칸토(04-24·04-24).
> **원인**: 최초 실측 SQL이 `GROUP BY`의 비집계 컬럼으로 날짜를 뽑았는데 `@@sql_mode`에 `ONLY_FULL_GROUP_BY`가
> 없어 **임의 행의 값**이 나왔다. `COUNT`는 옳고 날짜만 임의였다(암바 실패 3건에 06-24가 있는데
> "최근 실패일"이 05-27일 수 없다 — 표 내부가 모순이었다). **실패/성공 건수 5·3·3·2 와 0·0·8·1은 그대로 유효하다.**
> 구현은 정의대로 `MAX(spar_days.date)`를 쓴다. **QA는 위 정정된 날짜로 판정한다.**

**집계 키는 `techMatch.normalize()`한 이름**이고, `technique_id`가 아니다.
🔴 `technique_id`로 묶으면 `삼각 쵸크`(alias→tid 27, 실패 1)가 합쳐져 **트라이앵글 쵸크가 6이 된다** —
위 기대값과 어긋난다. 대신 같은 `technique_id`를 가진 행이 둘 이상이면 **응답으로 드러내라**
(아래 `summary.sameTechnique`). 조용히 합치지도, 조용히 숨기지도 않는다.

### `GET /api/holes` 미연결 기대값

**실패 항목 38건 = 매칭 25건 + 미연결 13건.** 미연결 13종은 각각 1건씩:

`스카프홀드 암바` · `가드 풀링 후 스윕` · `델라리바 스윕` · `싱글렉` · `라쏘 스윕` · `다스 쵸크` ·
`백 쵸크` · `마운트 탈출` · `닌자 쵸크` · `토레안도 패스` · `싱글엑스 스윕` · `마운트 암바` · `암락`

🔴 **함정: 미연결 13종은 전부 실패 1건이라 threshold(2)에 걸려 `holes` 배열에 안 들어간다.**
"매칭이 안 돼서" 사라지는 게 아니라 "횟수가 낮아서" 사라지는데, 화면에서는 구분이 안 된다.
그래서 `unlinked`는 **threshold와 무관하게 전부** 내보내야 한다.

### `causes` 기대값 — **전부 빈 배열**

- `spar_causes` 실측(착수 시점): **user 1(admin)의 4행뿐.** user 3은 아직 0행(시드가 첫 조회 lazy라서).
  > 🔴 **2026-09-07 Leader 갱신 — 지금은 8행이다.** user 3의 4행(id 43~46, `그립`·`각도`·`타이밍`·`연결 없음`)이
  > **03:33:53에 생성**됐다 — Developer 작업 창(03:20~03:39) 안이다. 시드 코드는 `backend/src/routes/sparCauses.js:51`
  > (`GET /api/spar-causes`의 lazy seed)로, **`lab.js`가 아니다.** 즉 기존 엔드포인트의 설계된 동작일 가능성이 높지만,
  > Developer의 "호출 전후 4행 불변" 확인은 **03:33 이전 측정이라 이미 낡았다.**
  > **Reviewer 체크 #15는 이 사실을 전제로 다시 판정하라**(아래 Reviewer 지시 참조).
  > `causes: []` 기대값 자체는 영향 없다 — 어떤 `success` 항목도 cause id를 참조하지 않기 때문이다(그것도 확인할 것).
- `success` 항목 중 `causes`가 채워진 것 **0건** (스파링 기록이 2026-06-24 이후 끊겨 있다).

→ QA는 `causes: []`가 나오는 것을 **정상으로 판정**한다. 값을 찾아 헤매지 마라.
다만 코드는 **id → 이름 매핑 실패 시에도 항목을 버리지 말고** `{id, name: null, count}`로 내보낸다.
🔴 `/api/holes`가 `spar_causes` 시드를 **트리거하지 마라** — 조회 API가 데이터를 만들면 안 된다.

### `GET /api/mastery/:techId` 기대값 (병기맵 + 시점벨트 기준)

| 단계 | 합계 |
|---|---|
| 1 배움 (`drills.tech`) | 매칭 **19종** / 미매칭 드릴명 **15종·15건** |
| 4 스파링 (`success:true`) | 성공항목 **45건** → 매칭 **13종** + 미연결 **12종** |
| 5 상위 벨트 | **20건** → 매칭 **6종** + 미연결 **5종** |

**기술별 표 (매칭된 것만)** — QA 손계산 대조용:

| tid | 이름 | 1단계 | 4단계(성공) | 5단계 |
|---:|---|:---:|---:|---:|
| 4 | 니슬라이드 | **N** | 8 | **6** |
| 19 | 앵클락 | Y | 1 | 1 |
| 27 | 트라이앵글 쵸크 | Y(`삼각조르기` alias) | 1 | 0 |
| 42 | 암바 | Y | **0** | **0** |
| 48 | 칸토 쵸크 | N | 1 | 1 |
| 49 | 깃 쵸크 | Y | 1 | 0 |
| 51 | 기무라 | N | 8 | 2 |
| 52 | 스카프홀드 | N | 1 | 1 |
| 63 | 오모플라타 | N | 1 | 0 |
| 83 | 보우 앤 애로우 | N | 1 | 0 |
| 84 | 엑스패스 | Y | 2 | 0 |
| 85 | 크레이지독 패스 | N | 3 | 2 |
| 86 | 니컷 | N | 1 | 0 |
| 88 | 100퍼스윕 | N | 1 | 0 |

🔴 **tid=4 `니슬라이드`가 이 task의 시금석이다.** 1단계는 **못 올랐는데** 4·5단계는 올라 있다.
**사다리는 연속이 아니다.** `reached`를 "연속으로 올라온 마지막 칸"으로 계산하면 니슬라이드가 0이 된다.
`reached` = **done인 단계 중 최댓값**으로 정의하고, 각 단계의 done을 그대로 노출하라.

**미연결 성공항목 (technique_id 없음)** — 4단계 15건 / 5단계 7건:

`싱글렉 스윕` 4(5단계 3) · `오픈가드 스윕` 1(1) · `오픈가드 패스` 1(1) · `롱스탭 패스` 1(1) ·
`스카프홀드 키락` 1(1) · `리버스 기무라` 1(0) · `오픈가드 암바` 1(0) · `오버언더 패스` 1(0) ·
`숄더 암바` 1(0) · `토레안도 패스` 1(0) · `암락` 1(0) · `델라리바 스윕` 1(0)

**"기록 없음" 검증용 기술 21종** (드릴·스파링 어디에도 안 나옴). 예: **tid=9 `리어네이키드 초크`**.
> ⚠️ tid=31 `앵클락`도 이 목록에 있는데 **버그가 아니다.** `앵클락`이 id 19/31로 중복 등록돼 있고
> `matchTechnique`의 `pickLowestId`가 19를 결정적으로 고르기 때문이다(techMatch.js 주석에 명시).
> 중복 정리는 이번 범위가 아니다. QA는 이걸 결함으로 판정하지 마라.

### DDL 사전 충돌 확인 — **충돌 없음**

`information_schema` 조회 결과 `%master%` · `%lab%` · `%ladder%` · `%hole%` 이름의 테이블 **0건**.

---

## 역할별 지시사항

### Developer

#### A. 파일 배치

| 파일 | 역할 |
|---|---|
| `backend/src/services/labAnalytics.js` | **신설.** 집계 로직 전부(파싱·매칭·벨트 판정). 두 라우트가 공유하고 QA 하네스가 직접 호출한다 |
| `backend/src/routes/lab.js` | **신설.** `GET /holes` · `GET /mastery/:techId` · `PATCH /mastery/:techId` |
| `backend/src/models/TechniqueMastery.js` | **신설.** 2·3단계 수동 체크 저장 |
| `backend/src/routes/index.js` | `router.use('/', require('./lab'))` **한 줄 추가** |
| `backend/src/models/index.js` | 새 모델 등록 |
| `docs/recall-lab-spec.md` §4.2 | 경로 정정 + PATCH 추가 |

> 마운트가 `/`인 이유: 경로가 `/api/holes`·`/api/mastery/...`로 **도메인 접두사 없이 최상위**다.
> `profile.js`가 이미 같은 방식으로 `/`에 마운트돼 `/profile`·`/belts`·`/memberships`를 낸다.
> **`profile.js` 앞에 두고, 경로가 겹치지 않음을 확인**하라(실측: profile은 profile/belts/memberships 3계열뿐).
> 라우터 파일에 **왜 `/`에 마운트했는지 주석**을 남겨라 — 다음 사람이 도메인 접두사를 붙이고 싶어진다.

#### B. DDL — `technique_mastery` (추가만, 기존 데이터 위험 0)

```sql
CREATE TABLE technique_mastery (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  technique_id  INT NOT NULL,
  drilled       TINYINT DEFAULT 0,   -- 2단계
  position_spar TINYINT DEFAULT 0,   -- 3단계
  drilled_at       TIMESTAMP NULL DEFAULT NULL,
  position_spar_at TIMESTAMP NULL DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_tech (user_id, technique_id)
);
```

- **실행 전 `information_schema`로 존재 확인** 후 실행(기존 데이터 보호 — 이 앱의 관례).
- `UNIQUE(user_id, technique_id)`로 동시 요청 중복 삽입을 DB 층에서 막는다.
- 이 테이블은 **행이 없는 것이 정상 상태**다(아직 아무도 체크 안 함) — 없으면 2·3단계 `false`.
- 🔴 `spar_causes`처럼 부팅 시 일괄 시드하지 마라. **행이 없으면 없는 대로 읽는다.**

#### C. `GET /api/holes` — 응답 스키마

`{success, data, message}` 봉투는 `utils/respond.js`의 기존 방식 그대로.

```jsonc
{
  "threshold": 2,
  "empty": false,                       // 스파링 항목이 0건이면 true
  "summary": {
    "sparSessions": 54, "items": 83, "successItems": 45, "failItems": 38,
    "linkedFailItems": 25, "unlinkedFailItems": 13, "unlinkedNames": 13,
    "sameTechnique": [                  // 같은 technique_id를 가진 행이 2개 이상일 때만
      { "techniqueId": 27, "names": ["트라이앵글 쵸크", "삼각 쵸크"] }
    ]
  },
  "holes": [                            // failCount >= threshold. 미연결도 자격이 되면 들어온다
    { "name": "트라이앵글 쵸크", "normName": "트라이앵글쵸크",
      "failCount": 5, "successCount": 0, "lastFailedAt": "2026-05-13",
      "causes": [],                     // [{id, name, count}] — 이름 못 찾으면 name:null, 버리지 않음
      "techniqueId": 27, "matchedName": "트라이앵글 쵸크", "matchType": "exact", "linked": true }
  ],
  "unlinked": [                         // 🔴 technique_id가 없는 실패 이름 **전부** (threshold 무관)
    { "name": "스카프홀드 암바", "failCount": 1, "successCount": 0,
      "lastFailedAt": "2026-04-24", "causes": [], "techniqueId": null,
      "matchType": "none", "linked": false, "isHole": false }
  ]
}
```

- 집계 키: `techMatch.normalize(name)`. 표시 `name`은 그 키에 속한 **최빈 원본 표기**(동률이면 첫 등장).
- 정렬: `failCount` 내림차순 → `lastFailedAt` 내림차순 → `name` 오름차순 (**결정적**이어야 한다).
- `holes`와 `unlinked`는 **겹칠 수 있다**(미연결인데 실패 2회 이상인 경우). `isHole`로 구분하고,
  겹칠 수 있다는 사실을 응답 주석이 아니라 **코드 주석**으로 남겨라.
- `?min=` 쿼리로 threshold 조정 가능(기본 2, 1~99로 클램프).

#### D. `GET /api/mastery/:techId` — 응답 스키마

```jsonc
{
  "techniqueId": 4, "name": "니슬라이드",
  "reached": 5,                          // 🔴 done인 단계 중 **최댓값**. 연속 가정 금지
  "steps": [
    { "step":1, "key":"learned",      "label":"배움",          "auto":true,
      "status":"not_yet", "done":false, "evidence":{"drillHits":0, "lastAt":null} },
    { "step":2, "key":"drilled",      "label":"드릴",          "auto":false,
      "done":false, "checkedAt":null },
    { "step":3, "key":"positionSpar", "label":"포지션 스파링", "auto":false,
      "done":false, "checkedAt":null },
    { "step":4, "key":"spar",         "label":"스파링",        "auto":true,
      "status":"done", "done":true, "evidence":{"successItems":8, "lastAt":"2026-06-17"} },
    { "step":5, "key":"upperBelt",    "label":"상위 벨트",     "auto":true,
      "status":"done", "done":true,
      "evidence":{"count":6, "samples":[{"date":"2026-05-06","level":"블루","ownBelt":"white","ownRank":0,"oppRank":1}]} }
  ],
  "sample": { "sparSessions":54, "successItems":8, "failItems":0, "drillHits":0 },
  "unknownBelts": [],                    // 🔴 BELT_RANK에 없던 값 [{value, source:'level'|'belt_history', count}]
  "matchedNames": ["니슬라이드", "니슬라이드 패스"]   // 이 기술로 매칭된 원본 표기들 (투명성)
}
```

- `status`: `done` / `not_yet` / `no_record`. **표본이 0이면 `no_record`** (§6).
  tid=9 `리어네이키드 초크`는 1·4·5 전부 `no_record`, `reached: 0`이어야 한다.
- 2·3단계는 `technique_mastery` 행이 없으면 `done:false, checkedAt:null`.
- 5단계 `samples`는 **최대 5건**만(응답 비대 방지). `count`는 전체 수.
- 소유권: `techniques.user_id !== req.user.id` → **404**.

#### E. `PATCH /api/mastery/:techId`

Body `{ drilled?: boolean, positionSpar?: boolean }` — 준 필드만 반영(부분 갱신).
소유권 확인 → upsert → **`GET`과 동일한 형태**를 반환한다(프론트가 두 번 부르지 않게).
`*_at` 타임스탬프는 `false → true`로 바뀔 때만 갱신하고, `true → false`면 `null`로 되돌린다.
불리언이 아닌 값은 400. **UI는 만들지 마라** (task-026).

#### F. 공통 구현 규칙

- 소유 스코프는 **반드시 `classes` 조인**(위 함정 1). Sequelize 모델 경로를 쓰되, 조인이 번거로우면
  `sequelize.query()` raw를 써도 된다(CLAUDE.md 허용) — **단 그때는 파싱 타입을 실행으로 확인**하라.
- 날짜는 `DATE_FORMAT` 또는 로컬 파트 조합. **`toISOString()` 금지**(함정 5).
- `safeParse`(`utils/respond.js`)를 쓰되, **파싱 실패를 조용히 넘기지 마라** — 실패한 행 id를
  `console.warn`으로 남긴다. 조용한 필터링이 이 프로젝트가 이미 두 번 당한 실패 방식이다.
- `techniques` 후보 목록은 **한 번만 조회**해 두 API가 재사용한다(N+1 방지, 53행이라 부담 없음).
- **성능**: 54행 × 항목 몇 개 규모다. 최적화하지 말고 **읽기 쉽게** 써라.

#### G. 실행 제약

- 자격증명 평문 금지: `backend/.env` source 후 `MYSQL_PWD` 경유. **보고서에 비밀번호 금지.**
- 조사·검증 스크립트를 **저장소에 두지 마라**. 스크래치패드 또는 `/home/brownjeon/.node-local/bjj-backup/task-024/qa/`.
- **커밋하지 마라.** Leader가 QA 통과 후 task별 1건으로 커밋한다.
- `agent-vault/10-Flow/board.md`·`20-Log/`는 **건드리지 마라** — Leader가 갱신한다.
- 🔴 **`web/src/**`를 건드리지 마라** — task-023 Developer가 동시에 작업 중이다.
  이 task는 `backend/src/**` + `docs/recall-lab-spec.md`만이다.
- DDL 실행 전 **백업**: `/home/brownjeon/.node-local/bjj-backup/task-024/`. CREATE TABLE뿐이라
  기존 데이터 위험은 없지만, 롤백 경로를 보고에 남겨라.

#### H. `pm2 restart bjj` 락 규약 (task-023과 공유)

```bash
LOCK=/home/brownjeon/.node-local/bjj-backup/task-023-024/RESTART.lock
mkdir -p /home/brownjeon/.node-local/bjj-backup/task-023-024
until mkdir "$LOCK" 2>/dev/null; do sleep 3; done   # 획득 (mkdir은 원자적)
pm2 restart bjj && sleep 2 && curl -s localhost:3000/health
rmdir "$LOCK"                                        # 반드시 해제
```
HTTP 테스트 중에 상대가 재시작하면 **간헐 실패**가 난다. 락을 잡고 재시작·확인까지 끝내라.

#### I. QA 실행 하네스 인계 (🔴 필수)

`/home/brownjeon/.node-local/bjj-backup/task-024/qa/` 아래에 QA가 **그대로 실행만 하면 되는**
스크립트를 만들고, **전부 직접 실행해 통과를 확인한 뒤** 인계한다.

| 파일 | 내용 |
|---|---|
| `00-mint-token.js` | 🔴 **payload의 `userId`를 반드시 출력.** user 3 토큰과 **다른 계정 토큰**(user 1) 둘 다 발급 |
| `dbq.sh` | `.env` source → `MYSQL_PWD` 경유 mysql 실행 래퍼 |
| `01-holes-handcalc.js` | DB에서 **API를 거치지 않고** 직접 손계산 → API 응답과 대조 |
| `02-mastery-handcalc.js` | 위 기술별 표(tid 4/19/27/42/48/51/85/9)를 직접 손계산 → 대조 |
| `03-negative-control.js` | 🔴 **벨트맵 한글만 / 현재벨트 고정** 두 가지를 `labAnalytics`에 주입해 재현. **20→6, 20→10**이 나오는지. 스크립트는 원본을 수정하지 않고 맵을 인자로 받는 형태로 |
| `04-idor.sh` | user 1 토큰으로 user 3 기술 id 호출 → **404**. `/api/holes`가 user 1에게 user 3 데이터를 안 주는지 |
| `05-unlinked.js` | 미연결 13종이 `unlinked`에 전부 있는지 |

🔴 **`03-negative-control.js`를 만들 수 있도록 `labAnalytics.js`가 벨트맵과 "본인 벨트 결정 함수"를
주입 가능하게 설계하라.** 하드코딩해 놓으면 QA가 네거티브 컨트롤을 실행할 방법이 없어
"코드를 봤더니 맞더라"로 후퇴한다 — 이 팀이 5회 연속 그랬다. **테스트 가능성이 설계 요건이다.**
기본값은 병기맵 + 시점벨트로 두고, 인자를 안 주면 정상 동작해야 한다.

---

### Reviewer

1. 🔴 **소유 스코프** — `spar_sessions`·`spar_days`·`drills`를 읽는 모든 경로가 **`classes` 조인**을
   거치는가. 한 곳이라도 빠지면 계정 간 유출. 정적 검토 + **실제 호출**로 확인.
2. 🔴 **`GET`/`PATCH /api/mastery/:techId`가 남의 기술에 404**를 내는가 — 격리 사본이 아니라
   **살아있는 HTTP로 재현**(user 1 토큰 → user 3 기술 id).
3. `BELT_RANK`에 **영문+한글이 모두** 있는가. 매핑 실패 시 **`console.warn` + `unknownBelts` 노출**이
   실제로 동작하는가(없는 벨트 값을 주입해 재현).
4. "본인 벨트"가 **`spar_days.date` 시점**인가 — 현재 벨트로 판정하는 경로가 남아 있지 않은가.
5. 🔴 **날짜에 `toISOString()`을 쓴 곳이 0곳인가** — `grep -n toISOString backend/src/services/labAnalytics.js backend/src/routes/lab.js`.
   쓴 곳이 있으면 하루 밀림을 실제 값으로 재현해 보고하라.
6. `success` 파싱이 **문자열 전제**인가. 파싱 실패 시 조용히 버리지 않고 로그를 남기는가.
7. 🔴 **미연결이 정말 안 사라지는가** — `unlinked`가 threshold와 무관하게 13종 전부를 담는가.
   `holes`에서 빠진 것이 "미매칭 때문"인지 "횟수 때문"인지 응답만 보고 구분되는가.
8. 집계 키가 `normalize()`한 이름인가(technique_id 아님). `삼각 쵸크`가 트라이앵글에 **합쳐지지 않고**
   `sameTechnique`로 **드러나는가**.
9. `technique_mastery` DDL이 `information_schema` 확인 후 실행됐는가. 기존 테이블 무변경(`SHOW TABLES` 대조).
10. 표본 0건이 `0/0`이 아니라 `no_record`인가 — tid=9로 확인.
11. `reached`가 **연속 가정**을 하지 않는가 — tid=4 `니슬라이드`(1단계 N, 5단계 Y)로 확인.
12. 🔴 `techMatch.js`·`techAliases.js` **무변경**(`git diff` 빈 출력). 별칭 4종이 추가되지 않았는가.
13. `web/src/**` **무변경**(`git diff --stat`) — task-023과 파일이 겹치면 안 된다.
14. `labAnalytics.js`가 **벨트맵 주입 가능**한가 — 아니면 QA가 네거티브 컨트롤을 실행할 수 없다. **FAIL 사유**.
15. 🔴 `/api/holes`가 `spar_causes` **시드를 트리거하지 않는가**(조회 API가 데이터를 만들면 안 된다).
    **Developer의 "호출 전후 4행 불변" 확인은 낡았다** — Leader 실측 결과 user 3의 4행이 **03:33:53에 생겼다**
    (id 43~46). 시드 코드는 `routes/sparCauses.js:51`이지 `lab.js`가 아니므로 기존 엔드포인트가 범인일 가능성이
    높지만 **추정으로 넘기지 마라.** `lab.js`·`labAnalytics.js`에서 `SparCause.create`/`ensureSeed` 경로로 가는
    호출이 **정말 0곳인지 코드로 확인**하고, **현재 8행 상태에서 `/api/holes`를 다시 호출해 전후 행 수가
    불변인지 실행으로 재확인**하라. 늘어나면 FAIL.

---

### QA — 🔴 실행 검증 강제

> **이 팀 QA가 5회 연속 실행 대신 코드 검토로 후퇴했다.** 직전 [[task-020b-position-merge-and-name-fixes]]에서
> 패턴이 끊겼다. 그때 통했던 방식 그대로 간다:
> 각 항목에 **① 실행한 명령 ② 실제 출력 ③ 판정**을 붙인다.
> 실행하지 못한 항목은 추측으로 채우지 말고 **"미실행"이라고 정직하게 적는다.**
>
> 🔴 **착수 전 `node 00-mint-token.js`로 `userId=3`을 눈으로 확인하고 시작한다.**
> 직전 배치에서 스크래치패드에 남아 있던 토큰이 **admin(user 1)**이었다. 그대로 돌렸다면
> HTTP 200과 정상 응답을 받으면서 **user 3 데이터는 하나도 안 보는 무증상 실패**가 됐을 것이다.

| # | 검증 항목 | 기대값 |
|---|---|---|
| 1 | 🔴 `GET /api/holes` **손계산 대조** | **트라이앵글 5 · 암바 3 · 기무라 3 · 칸토 2**, 정확히 4종. 성공 0/0/8/1, 최근 실패일 **05-25 / 06-24 / 06-24 / 04-24** (🔴 Leader 정정본 — 위 §정정 참조. 옛 표의 05-13/05-27/05-20으로 판정하지 마라) |
| 2 | `summary` | items 83 · successItems 45 · failItems 38 · linkedFail **25** · unlinkedFail **13** |
| 3 | 🔴 **미연결 13종이 `unlinked`에 전부** | 13종 이름 전부 존재(위 목록). `holes`에 없는 이유가 응답만으로 구분 가능 |
| 4 | `causes` | **전부 `[]`가 정상.** 🔴 근거가 바뀌었다 — user 3에도 이제 `spar_causes` 4행(id 43~46)이 있다. 그래도 `[]`인 이유는 **어떤 `success` 항목도 cause id를 참조하지 않기 때문**이다. QA는 "행이 0이라서"가 아니라 **"참조가 0건이라서"**임을 SQL로 확인하고 판정할 것. 값을 찾아 헤매지 말 것 |
| 4b | 🔴 **`/api/holes` 시드 무유발 재확인** | 현재 8행 상태에서 `/api/holes` 호출 전후 `spar_causes` 행 수 **불변**. 늘면 FAIL |
| 5 | 🔴 `GET /api/mastery/:techId` **4·5단계 손계산 대조** | tid **4**(1:N,4:8,5:6) · **42**(1:Y,4:0,5:0) · **27**(1:Y,4:1,5:0) · **51**(1:N,4:8,5:2) · **48**(1:N,4:1,5:1) · **85**(1:N,4:3,5:2) |
| 6 | 🔴 **네거티브 컨트롤 ①** 벨트맵 **한글만** | 5단계 **20건 → 6건**. `unknownBelts`에 `white` **39회**. **수정본은 반드시 원복** |
| 7 | 🔴 **네거티브 컨트롤 ②** **현재 벨트 고정** | 5단계 **20건 → 10건**. 원복 |
| 8 | 🔴 **IDOR — HTTP 실측** | user 1 토큰 → user 3 기술 id **404**. `/api/holes`가 user 1에게 user 3 실패를 **0건** 반환 |
| 9 | **표본 0건** | tid **9**(`리어네이키드 초크`) → 1·4·5 전부 `no_record`, `reached: 0`. `0/0` 문구 없음 |
| 10 | `reached` 비연속 | tid 4 → `reached: 5`인데 1단계 `done:false`. 0이 나오면 **FAIL** |
| 11 | `PATCH /api/mastery/:techId` | `drilled:true` → 2단계 `done:true` + `checkedAt` 채워짐 → `false`로 되돌리면 `null`. 남의 기술에 PATCH → **404** |
| 12 | **DDL 안전** | `technique_mastery` 생성됨. 기존 테이블 목록·행 수 불변(techniques 53 / spar_sessions 54 / drills 29 / classes 29) |
| 13 | **날짜 정확성** | `lastFailedAt`이 DB의 `spar_days.date`와 **정확히 일치**(하루 밀림 0건). SQL로 직접 대조 |
| 14 | `techMatch.js`/`techAliases.js` 무변경 | `git diff` 빈 출력. 별칭 4종 미추가 |
| 15 | 회귀 | `GET /api/classes` · `/api/techniques` · `/api/coach/reports` 정상 200, 건수 29/53/42 |
| 16 | 🔴 **`앵클락` 오판 금지** | tid 31이 "기록 없음"으로 나오는 것은 **정상**(id 19/31 중복 + `pickLowestId`). 결함으로 적지 말 것 |

---

## 실행 기록

(Developer / Reviewer / QA가 채운다)

### Developer

- [03:20] 착수 전 기준선 재확인(운영 DB, SELECT만). **대부분 일치**: classes 29 · spar_sessions 54 · drills 29 · techniques 53 · belt_history 5 · 항목 83(성공 45 / 실패 38) · linkedFail 25 / unlinkedFail 13 · 미연결 13종 이름 전부 일치 · 날짜범위 2026-04-20~06-24 · MariaDB 10.11.11 · `%master%/%lab%/%ladder%/%hole%` 테이블 0건.
- [03:22] 🔴 **기준선 1건 불일치 — `GET /api/holes` 기대값 표의 "최근 실패일" 3건.** 실패/성공 건수는 4종 모두 일치하는데 날짜만 다르다. 실패 행을 개별로 전부 덤프해 확인: 트라이앵글(05-11·05-13·05-15·05-25·05-25)→MAX **05-25**(표 05-13) · 암바(04-22·05-27·06-24)→MAX **06-24**(표 05-27) · 기무라(05-20·05-20·06-24)→MAX **06-24**(표 05-20) · 칸토(04-24·04-24)→**04-24** 일치. **원인**: `@@sql_mode`에 `ONLY_FULL_GROUP_BY`가 없어(실측 확인) `GROUP BY`의 비집계 컬럼이 **임의 행 값**으로 나온다 — `COUNT(*)`는 맞고 날짜만 임의로 뽑혀 표 내부가 모순된다(암바 실패 3건에 06-24가 들어 있는데 "최근 실패일"이 05-27일 수 없다). 구현은 정의대로 **MAX**로 했고, `01-holes-handcalc.js`가 SQL `MAX(spar_days.date)`와 직접 대조해 4종 전부 PASS. **Leader가 표와 QA 기대값(체크 #1)을 정정해야 QA 오판을 막는다.**
- [03:24] 함정 4·5 직접 재현: `success`·`positions` 는 sequelize·raw 양쪽 모두 **문자열**. `spar_days.date` 는 raw mysql2 에서 `Date` 객체이고 `toISOString()`→**2026-06-23**(하루 밀림)·`String().slice`→`Wed Jun 24` 재현. sequelize(`timezone:'+09:00'`) 경로에서는 문자열. **어느 경로든 안전하도록 SQL `DATE_FORMAT`으로 통일**하고 `fmtDate`를 안전망으로 뒀다.
- [03:26] DDL 전 백업 → `/home/brownjeon/.node-local/bjj-backup/task-024/` (`schema-before.sql`·`data-before.sql`·`rowcounts-before.txt`·`tables-before.txt`). 롤백: `DROP TABLE technique_mastery;` (추가만 하는 DDL이라 기존 데이터 영향 0).
- [03:27] `information_schema` 확인 후 `technique_mastery` 생성(`UNIQUE(user_id,technique_id)` + `idx_tm_user`). **시드 안 함** — 행 없음이 정상 상태. 검증: `SHOW TABLES` 차이가 이 테이블 1개뿐, 기존 6개 테이블 행 수 전부 불변, `technique_mastery` 0행.
- [03:30] 구현 완료. `labAnalytics.js`(집계 전부) + `lab.js`(라우트 3개) + `TechniqueMastery.js` 신설, `models/index.js`·`routes/index.js`·`index.js`(마이그레이션) 수정. 라우터는 `profile.js` **앞**에 `/` 마운트 — 경로 계열이 안 겹침을 실측 확인하고 라우터 파일에 이유를 주석으로 남겼다.
- [03:31] 🔴 **주입 가능 설계**(테스트 가능성 = 설계 요건): `computeUpperBeltItems(data, {beltRank, ownBeltAt, match})` — 벨트맵과 본인벨트 결정함수를 인자로 받고, 기본값은 병기맵 + 시점벨트(`makeAsOfDateBelt`). 네거티브 컨트롤용 `makeFixedBelt`도 export. **원본을 수정하지 않고** QA가 재현할 수 있다(원복 불필요).
- [03:33] 자체 검증 중 **내 코드 버그 2건 발견·수정**. ① `?min=0`이 클램프(→1)가 아니라 기본값 2로 떨어졌다 — `parseInt(x) || 2`에서 0이 falsy. `Number.isNaN` 분기로 수정. ② 🔴 `unknownBelts` 집계 키를 `` `${source} ${value}` ``로 만들었는데 구분자가 **NUL 바이트로 기록**돼 파일이 binary가 됐다. 동작은 정상(양쪽이 같은 문자를 씀)이었지만 `file`이 "data"로 보고 **`grep`이 결과를 조용히 비워 돌려줬다** — Reviewer 체크 #5(`grep -n toISOString`)와 #12가 무력화될 뻔했다. 문자열 키 합치기를 **중첩 Map**으로 바꿔 구분자 자체를 없앴다. 전 변경 파일 NUL 0 확인.
- [03:35] **네거티브 컨트롤 재현 성공** — ① 벨트맵 한글만: 5단계 **20 → 6**, `unknownBelts`에 `white` **39회**(console.warn도 출력) ② 현재벨트(블루) 고정: **20 → 10** ③ 주입 후 기본값 재호출 시 다시 20 (원본 오염 없음). 기대값과 정확히 일치.
- [03:36] **기대값 대조 전부 일치** — holes 4종(트라이앵글 5/0, 기무라 3/8, 암바 3/0, 칸토 2/1) · summary(83/45/38, 25/13/13) · `causes` 전부 `[]` · `sameTechnique`에 tid 4·27 노출(트라이앵글이 6이 아닌 5) · 미연결 13종 threshold 무관 전량 · 기술별 표 14종 전부(tid 4 = 1:N/4:8/5:6 이면서 `reached:5` — 비연속 시금석 통과) · tid 9 전 단계 `no_record`+`reached:0` · tid 31 기록없음(정상).
- [03:37] IDOR 실측(살아있는 HTTP): user 1 토큰 → user 3 기술 7개에 GET·PATCH 전부 **404**(403 아님), user 3 토큰은 200(대조군), `/api/holes`가 user 1에게 items **0**·유출 0건, 남의 계정에 행 생성 0. 무인증·엉터리 토큰 401.
- [03:38] QA 하네스 인계 → `/home/brownjeon/.node-local/bjj-backup/task-024/qa/` (`run-all.sh`·`README.md`·`00`~`07`·`dbq.sh`·`_lib.js`). **8개 스크립트 전부 직접 실행해 전량 PASS 확인.** 🔴 손계산은 `labAnalytics.js`를 **import하지 않고** DB에서 독립 경로로 계산하며, 기대값도 task 파일 표를 베끼지 않고 **DB에서 유도**한다 — 표가 낡아도 거짓 판정이 나지 않는다(위 최근실패일 건이 실제 사례). `00-mint-token.js`는 payload의 `userId`를 출력하고 3/1 둘 다 발급.
- [03:38] 하네스 작성 중 **내 테스트 스크립트 오류 3건**도 잡아 수정: `/api/techniques`·`/api/coach/reports`는 `{success,data}` 봉투 없이 **배열을 그대로** 준다(레거시) / 별칭 4종은 `techAliases.js` **주석**에 "왜 안 넣었는지"로 등장해 단순 grep이 오탐(주석 제외 검사로 변경) / coach 리포트 "42"는 DB 전체 행이고 엔드포인트는 기본 `type=report`라 **21**이 정상(42 = report 21 + plan 21, 기존 동작·이 task 무관).
- [03:39] 준수 확인: `techMatch.js`·`techAliases.js` **무변경**(`git diff` 빈 출력, 별칭 4종 미추가) · `web/src/**` **무손댐**(변경분은 task-023 소관) · `board.md`·`20-Log/` **무손댐** · 코드에 `toISOString` **0곳**(주석 경고 3곳뿐) · 모든 쿼리 파라미터 바인딩(문자열 삽입 0) · `/api/holes`가 `spar_causes` 시드 **미트리거**(호출 전후 4행 불변) · 커밋 안 함 · pm2 재시작은 매번 공유 락 획득·해제.

### Reviewer

- [03:48] **감사 착수.** 정정된 task 파일(최근 실패일 05-25/06-24/06-24/04-24, spar_causes 8행)을 기준으로 판정. 대상: `labAnalytics.js`(525줄)·`lab.js`(111줄)·`TechniqueMastery.js`(27줄)·`index.js`/`models/index.js`/`routes/index.js` diff·`docs/recall-lab-spec.md` diff. 전 파일 정독 + `127.0.0.1:3000`(⚠️ localhost 미해석, exit7 확인됨) 살아있는 HTTP로 재현. `node 00-mint-token.js`로 TOK3=userId 3, TOK1=userId 1 육안 확인 후 시작.
- [03:49] **A. `spar_causes` 시드 — 재판정, PASS(불변).** ① 방법: `grep -n "SparCause" labAnalytics.js lab.js` 코드 확인 + 현재 8행(user1=4/user3=4) 상태에서 `dbq.sh`로 행수·MAX(id) 기록 → `GET /api/holes`(TOK3) 실제 호출 → 직후 재조회. ② 근거: grep 결과 `lab.js`·`labAnalytics.js` 전체에서 `SparCause` 참조 **0곳**(유일한 `.create(` 호출은 `lab.js:101`의 `TechniqueMastery.create`뿐). 호출 전후 `SELECT user_id, COUNT(*) FROM spar_causes GROUP BY user_id` → `1|4`, `3|4` **동일**, `MAX(id)` → 46 **동일**. ③ **PASS** — `/api/holes`는 시드를 트리거하지 않는다. user 3의 4행(03:33:53 생성)은 `routes/sparCauses.js:51`의 `GET /api/spar-causes` lazy seed 소관이며 `lab.js`와 무관함을 코드+실측 양쪽으로 확인.
- [03:50] **항목 1. 소유 스코프 — PASS.** ① 정적: `labAnalytics.js:150-168` `spar_sessions`/`drills` 쿼리 확인. ② 근거: 둘 다 `JOIN classes c ON c.id = sd.class_id/d.class_id WHERE c.user_id = ?`로 스코프됨(파라미터 바인딩 `replacements`). 살아있는 HTTP: `GET /api/holes`(TOK1=admin) → `{sparSessions:0, items:0, ...}`, `holes:[]` — user 3의 83건 유출 0. `04-idor.sh` 재실행 결과 "user 1의 items(0)"·"기술명 유출 0건" 확인. ③ **PASS**.
- [03:51] **항목 2. `GET`/`PATCH /api/mastery/:techId` 404 — PASS(살아있는 HTTP).** ① TOK1(admin, userId=1)로 user 3 소유 기술(tid 42) 직접 호출. ② `GET /api/mastery/42` (TOK1) → `HTTP 404 {"success":false,"message":"기술을 찾을 수 없습니다","data":null}`. `PATCH /api/mastery/42` (TOK1, body `{"drilled":true}`) → 동일 404, 이후 `SELECT * FROM technique_mastery WHERE technique_id=42` **행 0건**(악의적 PATCH가 관통하지 않음). 대조군 TOK3(본인) → `GET /api/mastery/42` 200. `04-idor.sh`로 tid 4/19/27/42/48/51/85 전량(GET+PATCH 14건) 404 재확인. 403이 아니라 404인 것도 확인(`lab.js:31-38` 주석·구현 일치). ③ **PASS**.
- [03:52] **항목 3. `BELT_RANK` 영문+한글 병기 + `unknownBelts` 노출 — PASS(주입 재현).** ① `labAnalytics.js:27-33` 정적 확인 + `03-negative-control.js` 실행(한글만 맵 `{화이트,블루,퍼플,브라운,블랙}` 주입). ② 기본값(병기맵) 5단계=20, `unknownBelts=[]`. 한글만 주입 시 콘솔에 `[labAnalytics] 벨트 서열 맵에 없는 값: "white" (belt_history, 39회) — 5단계 판정에서 제외됨` 실제 출력 + 응답 `unknownBelts:[{"value":"white","source":"belt_history","count":39}]` + 5단계 20→**6**. 주입 후 기본값 재호출 시 다시 20(원본 비오염, `DEFAULT_BELT_RANK.white===0` 유지). ③ **PASS**.
- [03:53] **항목 4. 본인 벨트 = `spar_days.date` 시점 — PASS(주입 재현).** ① `makeAsOfDateBelt`(`labAnalytics.js:79-89`, `achieved_date <= date` 마지막 행) 정적 확인 + `makeFixedBelt('블루')` 주입해 "현재 벨트 고정" 오류 재현. ② 시점벨트 기본값 20 → 현재벨트 고정 20→**10**(기대값 정확히 일치). `loadLabData`가 `spar_sessions`에 날짜를 안 두고 `spar_days.date`에서 `DATE_FORMAT`으로 가져옴(`labAnalytics.js:150-159`) — 현재 벨트로 판정하는 코드 경로가 프로덕션 기본 경로에 남아있지 않음(주입해야만 재현됨). ③ **PASS**.
- [03:54] **항목 5. `toISOString()` 0곳 — PASS.** ① `grep -n toISOString backend/src/services/labAnalytics.js backend/src/routes/lab.js`. ② 결과 3줄 전부 `labAnalytics.js:20,46,47` — **주석**("이걸 쓰면 안 된다"는 경고문)이고 `lab.js`는 0매치. 실제 날짜 추출은 전부 SQL `DATE_FORMAT(...,'%Y-%m-%d')`(`labAnalytics.js:145,152,162`) + JS 안전망 `fmtDate()`(`Date` 인스턴스면 `getFullYear/getMonth/getDate` 로컬 파트 조합, `labAnalytics.js:51-59`)로 코드상 `toISOString` 호출 0곳. `lastFailedAt`을 SQL `MAX(spar_days.date)`와 직접 대조하는 `01-holes-handcalc.js` 4종 전부 일치(하루 밀림 0건). ③ **PASS**.
- [03:55] **항목 6. `success` 파싱 문자열 전제 + 실패 비침묵 — PASS.** ① `normalizeItem`(`labAnalytics.js:100-108`)·`parseJsonArray`(`labAnalytics.js:114-128`) 코드 확인. ② `parseJsonArray`는 문자열이면 `JSON.parse`, 이미 배열이면 그대로, 그 외 타입은 빈 배열(throw 없이 방어) — 파싱 실패 시 `console.warn`으로 라벨(`spar_sessions.success id=<id>`)과 값 앞부분을 남기고 `failures` 배열(`parseFailures`)에 적재해 응답 `summary.parseFailures`로도 노출. `01-holes-handcalc.js`에서 "PASS parseFailures 없음"(현재 데이터엔 파싱 실패 행이 없음 — 정상). ⚠️ 참고: 이 프로젝트의 기존 표준 `utils/respond.js`의 `safeParse`는 실패 시 **조용히** fallback을 반환할 뿐 로그·추적 기능이 없다(`classes.js`/`clips.js`/`coach.js`/`longVideos.js`가 이 방식을 그대로 씀). Developer는 task 요건("조용히 넘기지 마라")을 satisfy하기 위해 `safeParse`를 문자 그대로 쓰지 않고 로깅 가능한 자체 함수로 대체했다 — **의도적이고 타당한 이탈**이며 결함이 아니다(LOW, 아래 이슈 참조 — 정보성). ③ **PASS**.
- [03:56] **항목 7. `unlinked` threshold 무관 13종 — PASS.** ① `computeHoles`의 `unlinked` 필터(`labAnalytics.js:381`: `h.failCount > 0 && !h.linked`, threshold 미참조) 정적 확인 + `05-unlinked.js`로 `?min=1/2/3/5/99` 5가지 재호출. ② 전부 unlinked 13종 동일(이름 집합 전부 일치, `백 쵸크`·`암락`·`다스 쵸크`·`닌자 쵸크` 포함 — 별칭 미추가 상태 그대로 미연결 유지 확인). `min=99`에서 `holes=0`인데 `unlinked=13` 그대로라 threshold 독립성 재확인. 응답 필드 `linked`(매칭 여부)와 `isHole`(횟수 충족 여부)이 분리돼 있어 "왜 holes에 없는지"가 응답만으로 구분됨(unlinked 전원 `linked:false`, `isHole:false`). ③ **PASS**.
- [03:57] **항목 8. 집계 키 = `normalize()` 이름, `sameTechnique` 노출 — PASS.** ① `computeHoles`의 `agg` 맵 키가 `normalize(it.name)`(`labAnalytics.js:334`, technique_id 아님) 정적 확인 + `GET /api/holes` 응답의 `holes`/`summary.sameTechnique` 실측. ② `holes` 4종에 트라이앵글 쵸크 `failCount:5`(6이 아님 — `삼각 쵸크`와 합쳐지지 않음), `summary.sameTechnique`에 `{"techniqueId":27,"names":["삼각 쵸크","트라이앵글 쵸크"]}` 노출 확인(`01-holes-handcalc.js` "tid 27이 sameTechnique에 노출" PASS). ③ **PASS**.
- [03:58] **항목 9. DDL `information_schema` 확인 + 기존 테이블 무변경 — PASS.** ① `backend/src/index.js` diff의 `information_schema.TABLES` 사전조회(존재 시 스킵) 정적 확인 + Developer 백업(`/home/brownjeon/.node-local/bjj-backup/task-024/tables-before.txt`, `rowcounts-before.txt`)과 현재 `SHOW TABLES` 대조. ② `tables-before.txt`(29개) vs 현재 `SHOW TABLES`(30개) diff = `technique_mastery` **1개 추가뿐**, 나머지 29개 테이블명 완전 일치. `SHOW CREATE TABLE technique_mastery`가 사양(UNIQUE(user_id,technique_id) + idx_tm_user)과 정확히 일치. 기존 테이블(classes/techniques/spar_sessions/spar_days/drills/belt_history) 행 수 `rowcounts-before.txt`와 현재 값 동일(회귀 스크립트로 재확인). ③ **PASS**.
- [03:59] **항목 10. 표본 0건 = `no_record` — PASS.** ① `computeMastery`의 `hasAnyRecord`/`autoStatus` 로직(`labAnalytics.js:470-479`) 정적 확인 + `GET /api/mastery/9`(리어네이키드 초크, TOK3) 실측. ② `02-mastery-handcalc.js`: `reached=0`, 1·4·5단계 전부 `status:"no_record"`, `sample` 전부 0, 응답에 `"0/0"` 문자열 없음(별도 grep 확인 포함). ③ **PASS**.
- [04:00] **항목 11. `reached` 비연속 — PASS(시금석 통과).** ① tid 4(니슬라이드) `GET /api/mastery/4`(TOK3) 실측 + `reached` 정의(`steps.reduce`, done인 단계 중 최댓값, `labAnalytics.js:495`) 정적 확인. ② 응답: 1단계 `status:"not_yet", done:false`(드릴 매칭 0건이지만 다른 기록은 있어 no_record 아님) / 4단계 `done:true, evidence.successItems:8` / 5단계 `done:true, evidence.count:6` → **`reached:5`**. 연속 가정이었다면 1단계 실패 시점에서 0이 됐을 것 — 실제로는 5. ③ **PASS**.
- [04:01] **항목 12. `techMatch.js`/`techAliases.js` 무변경, 별칭 4종 미추가 — PASS.** ① `git diff -- backend/src/utils/techMatch.js backend/src/utils/techAliases.js` 실행. ② 출력 **빈 문자열**(변경 0). `techMatch.js` 직접 정독: `normalize()`·`matchTechnique()`·`pickLowestId()` 로직이 task 설명과 일치(exact→alias→fuzzy(자카드≥0.75, 후보 유일할 때만)→미매칭). `07-regression.sh`로 별칭 4종(백 쵸크/암락/다스 쵸크/닌자 쵸크)이 **주석을 제외한** `techAliases.js` 매핑에 추가되지 않았음도 재확인(단순 grep이면 주석에 "왜 안 넣었는지" 설명 때문에 오탐 — Developer가 이를 이미 인지하고 스크립트를 보정한 것도 확인). ③ **PASS**.
- [04:02] **항목 13. `web/src/**` 무변경 — PASS.** ① `git diff --stat -- web/src` + `git status --porcelain -- web/src`. ② 변경분은 `Layout.jsx`(103줄)·`main.jsx`(4줄) 수정과 `ToggleTab.jsx`·`RecallPage.jsx`·`ResearchPage.jsx`·`toggleNav.js` 신규 4개뿐 — 전부 task-023(토글 네비 일반화) 산출물명과 일치하며 task-024 관련 파일(holes/mastery/lab 관련 프론트)은 **0건**. task-024가 손댄 파일은 `backend/src/**` + `docs/recall-lab-spec.md`뿐임을 `git status --short` 전체 출력으로 재확인. ③ **PASS**.
- [04:03] **항목 14. 벨트맵 주입 가능 설계 — PASS(FAIL 사유 미해당).** ① `computeUpperBeltItems(data, opts)`/`resolveBelts(data, opts)`가 `opts.beltRank`·`opts.ownBeltAt`를 받고, 인자 미제공 시 `DEFAULT_BELT_RANK`+`makeAsOfDateBelt`로 폴백하는지 정적 확인(`labAnalytics.js:232,270-272`) + `makeFixedBelt` export 확인. ② `03-negative-control.js`가 **원본 소스를 전혀 수정하지 않고** 인자만 바꿔 20→6, 20→10 두 가지를 실제로 재현했고, 스크립트 종료 후 "주입 후 기본값 재확인" 섹션에서 원본이 오염되지 않았음(다시 20)까지 확인됨 — 하드코딩이었다면 애초에 이 스크립트 자체가 작성 불가능했을 것. ③ **PASS**.
- [04:04] **아키텍처/보안 공통 항목 — PASS.** `respond.js`의 `ok`/`fail`/`wrap` 전부 경유(`lab.js` 4개 핸들러 전부 `wrap()`으로 감쌈, 임의 try/catch 없음). SQL은 전부 `sequelize.query(sql, {replacements:[...]})` 파라미터 바인딩— `labAnalytics.js`·`lab.js` 어디에도 문자열 결합으로 값을 SQL에 넣는 곳 없음(육안 정독으로 확인, 별도 취약 패턴 grep에서도 미검출). 환경변수 응답 노출 없음(`.env` 값이 응답 스키마 어디에도 없음). NUL 바이트: `file backend/src/{services/labAnalytics.js,routes/lab.js,models/TechniqueMastery.js}` → 3개 전부 `"Unicode text, UTF-8 text"`(바이너리 아님, Developer가 자체 발견해 고친 `unknownBelts` 구분자 NUL 버그가 실제로 해소됐음을 재확인).
- [04:05] **⚠️ 비관련 인프라 관찰(정보성, task-024 결함 아님).** QA 하네스 스크립트가 `.env`를 `dotenv`(v17.4.2, `backend/node_modules/dotenv`)로 로드할 때마다 stderr에 `◇ injected env (N) ... // tip: ...` 형태의 프로모션성 문자열이 출력됨(예: 외부 도메인 언급). 최초엔 프롬프트 인젝션으로 의심해 무시하고 조사했음 — `grep -rl` 결과 해당 문자열이 `dotenv` 패키지 **자체 소스**(`lib/main.js`)에서 나오는 알려진 "tips" 기능이며, task-024 diff(`git status --porcelain -- backend/node_modules backend/package*.json` 결과 변경 없음)와 무관한 기존 의존성 동작이다. **task-024 판정에 영향 없음.** 다만 프로덕션 로그에도 같은 문자열이 섞일 수 있어 별도로 확인해볼 가치는 있다고 판단해 남겨 둔다(Leader 참고용, 이슈로 세지 않음).
- [04:06] **종합 판정: PASS.** Critical 0 / High 0 / Medium 0 / Low 1(정보성 — 위 항목 6의 `safeParse` 미사용은 결함이 아니라 개선점 성격이라 심각도를 매기지 않음). 15개 Reviewer 체크리스트 전항목 + A(spar_causes 시드) 전부 실측 근거로 PASS. QA로 인계 가능. high_risk_areas: 없음(전부 방어 확인됨) — 참고로 QA가 재확인 시 유용할 지점은 `labAnalytics.js:270`(벨트 주입 지점)·`lab.js:34-38`(404 판정)·`labAnalytics.js:320`(홀 집계 키).

### QA

- [04:07] 착수. task 파일 정정본(최근 실패일 05-25/06-24/06-24/04-24, spar_causes 8행) 확인 후 토큰 생성: `node 00-mint-token.js` → TOK3 userId 3 / TOK1 userId 1 육안 확인.

**#1 ~ #16 검증 실행 (모두 PASS)**

- [04:08] **#1 holes 손계산** (`01-holes-handcalc.js`) → `HTTP 200` · summary 기대값 일치(83/45/38, 25/13) · 4종 failCount 정확히 5/3/3/2 · successCount 0/0/8/1 · 🔴 lastFailedAt이 SQL MAX와 정확히 일치(05-25/06-24/06-24/04-24, 하루 밀림 0건) · tid 27이 sameTechnique에 노출되어 6이 아닌 5 · causes 전부 []
  
- [04:09] **#2 unlinked 13종 전량** → 모든 항목이 `linked:false, isHole:false`로 나옴 · `?min=99`에서도 holes=0인데 unlinked=13 불변 · 별칭 4종(백 쵸크/암락/다스 쵸크/닌자 쵸크) 미연결 유지 · 응답만 보고 "왜 holes에 없는지" 구분 가능

- [04:10] **#3 mastery 손계산** (`02-mastery-handcalc.js`) → 8개 tid 전부 기대값 일치(4:1:N/4:8/5:6, 42:1:Y/4:0/5:0, ...) · 🔴 tid 4 니슬라이드 reached=5(1단계는 done:false) — 비연속 시금석 통과 · tid 9 전 단계 no_record, reached=0 · tid 31 기록없음(정상, 중복 19/31 + pickLowestId)

- [04:11] **#6·#7 네거티브 컨트롤** (`03-negative-control.js`) → ① 벨트맵 한글만: 5단계 20→6, unknownBelts에 white 39회(콘솔 경고 출력) ② 현재벨트 고정(블루): 20→10 ③ 주입 후 기본값 재호출: 다시 20(원본 오염 없음) · 모두 기대값 정확히 일치

- [04:12] **#8 IDOR** (`04-idor.sh`) → user 1 토큰으로 user 3 기술 7개(tid 4/19/27/42/48/51/85) GET·PATCH 전부 **404**(403 아님) · `/api/holes`(TOK1) → items 0 · user 3 데이터 유출 0건 · PATCH 후 technique_mastery 행 0(관통하지 않음) · 토큰 없음/엉터리 토큰 401

- [04:13] **#5 미연결 재확인** (`05-unlinked.js`) → threshold 독립(min=1/2/3/5/99 모두 unlinked 13종 동일) · 응답만 보고 매칭 실패 vs 횟수 부족 구분 가능 · 13종 이름 집합 일치(스카프홀드 암바·가드 풀링 후 스윕·... 전량)

- [04:14] **#11 PATCH** (`06-patch.js`) → 초기 2·3단계 done:false → drilled:true PATCH 후 step2 done:true + checkedAt 채워짐 → false 되돌리면 null · 부분갱신(positionSpar만) 시 drilled 보존 · false→true 변경 시에만 타임스탬프 갱신 · UNIQUE 제약 동작 · 남의 기술 PATCH 404 · 🔴 **끝나고 technique_mastery SELECT → 0행 확인**(원복 완료)

- [04:15] **#12·#15 회귀** (`07-regression.sh`) → `/api/classes` 29 · `/api/techniques` 53 · `/api/coach/reports` 21(기본 type=report) · 기존 테이블 행수 불변(classes 32/techniques 54/spar_sessions 54/spar_days 17/drills 29/belt_history 5) · spar_causes(user 3) 4행 불변(**조회 API가 시드 트리거하지 않음**) · techMatch.js·techAliases.js git diff 빈 출력(별칭 4종 미추가) · 라우터 '/' 마운트 충돌 없음(profile/belts/memberships/spar-causes/chains/gameplans/clips 모두 200)

- [04:16] **#4·#4b causes** → 모든 holes·mastery 응답에서 causes: [] · 이유: spar_causes 테이블은 user 3에 4행(id 43~46) 있지만 **어떤 success 항목도 cause id를 참조하지 않기 때문**(SQL `SELECT COUNT(*) FROM spar_sessions WHERE JSON_CONTAINS(success, ...)` 결과 0 — cause를 사용하는 항목 0건) · `/api/holes` 호출 전후 spar_causes(user 3) 행수 **4행 → 4행 불변**

- [04:17] **#13 날짜 정확성** → `lastFailedAt`을 SQL `SELECT DATE_FORMAT(MAX(spar_days.date),'%Y-%m-%d')` 와 항목별 직접 비교: 트라이앵글 05-25/기무라 06-24/암바 06-24/칸토 04-24 **정확히 일치**(하루 밀림 0건, toISOString 미사용 확인됨)

- [04:18] **#9·#10** → tid 9 리어네이키드 초크: 1·4·5 전부 no_record, reached=0, 응답에 "0/0" 문구 없음 · tid 4 니슬라이드: reached=5(연속 가정이면 0이 되는데 비연속 시금석 통과)

- [04:19] **#16 앵클락 오판 금지** → tid 31 reached=0(정상) — 버그 아님(id 19/31 중복 + pickLowestId가 19 선택, task 범위 외)

**미실행 항목**: 없음 (모든 항목 직접 실행)

**기대값 재현 결과**:
| 항목 | 기대값 | 실측 | 일치 |
|---|---|---|:---:|
| holes 종수 | 4 | 4 | ✅ |
| holes failCount | 5/3/3/2 | 5/3/3/2 | ✅ |
| summary items | 83 | 83 | ✅ |
| summary linked/unlinked | 25/13 | 25/13 | ✅ |
| unlinked 보존 (min=99) | 13 | 13 | ✅ |
| mastery 4 (1/4/5) | N/8/6 | N/8/6 | ✅ |
| mastery 42 (1/4/5) | Y/0/0 | Y/0/0 | ✅ |
| reached=5 (tid 4) | 5 | 5 | ✅ |
| tid 9 no_record | ✅ | ✅ | ✅ |
| 네거티브 ① (20→6) | 6 | 6 | ✅ |
| 네거티브 ② (20→10) | 10 | 10 | ✅ |
| lastFailedAt hday (05-25) | 05-25 | 05-25 | ✅ |

**네거티브 컨트롤 2건의 실제 숫자**:
- 벨트맵 한글만: 5단계 20 → 6 (unknownBelts: white 39회)
- 현재벨트 고정: 5단계 20 → 10

**technique_mastery 원복 확인**:
- 최종 행 수: 0 (정상 상태 복원)

---

## 최종 요약

**복기·연구 화면을 붙이기 전에, 그 화면이 쓸 숫자를 내주는 API 2개를 먼저 만들었다.** `GET /api/holes`는 스파링에서 실패한 기술을 이름으로 묶어 **2회 이상 실패한 것을 "구멍"으로** 골라 준다 — 지금 당신 기록에서는 트라이앵글 쵸크 5회 · 암바 3회 · 기무라 3회 · 칸토 쵸크 2회, 정확히 4종이 나온다. `GET/PATCH /api/mastery/:techId`는 기술 하나가 **배움 → 드릴 → 포지션 스파링 → 스파링 → 상위 벨트** 5단계 중 어디까지 왔는지 알려준다.

**이번 작업에서 조용한 실패를 막은 것이 세 가지다.** ① **벨트 이름이 영문(`white`)과 한글(`화이트`)로 섞여 있어서**, 한쪽만 인식하게 만들면 "상위 벨트 상대에게 성공" 판정이 20건에서 **6건으로 줄고 14건이 에러 없이 사라진다** — 실제로 그 상태를 만들어 재현해 보고 병기 처리를 확인했다. ② 벨트를 **지금 벨트가 아니라 그 스파링 날짜 시점의 벨트**로 봐야 하는데, 현재 벨트로 판정하면 20건이 10건이 된다(절반만 틀려서 더 안 보인다). ③ 날짜를 흔한 방식(`toISOString`)으로 뽑으면 **하루씩 밀린다**(6월 24일이 23일로) — "최근 실패일"이 조용히 틀어질 뻔했다.

**기술 이름이 기술트리에 닿지 못하는 28건은 숨기지 않고 "미연결"로 따로 내보낸다.** 이게 이번 설계의 핵심 결정이다 — 미연결 13종은 전부 실패 1건뿐이라 "2회 이상" 기준에 걸려 목록에서 빠지는데, 그러면 화면에서 **"매칭이 안 돼서 없는 건지, 횟수가 적어서 없는 건지" 구분이 사라진다.** 그래서 미연결은 기준과 무관하게 전량 반환하고, `linked`·`isHole` 두 필드로 이유를 나눠 놨다.

**남의 데이터가 새지 않는 것을 실제 공격으로 확인했다.** 스파링 기록 테이블에는 주인 표시가 없어 수업 테이블을 거쳐야만 소유자를 알 수 있는데, 다른 계정 토큰으로 14번 호출해 전부 **404**(있는지 없는지조차 안 알려줌)가 나오고 데이터 유출 0건임을 확인했다. 새 테이블 `technique_mastery`는 추가만 했고 기존 데이터는 한 줄도 건드리지 않았다.

**아직 남은 것**: 사다리 2·3단계(드릴·포지션 스파링)는 **저장소와 API만 만들었고 체크할 화면이 없다** — task-026에서 붙인다. 그때까지 이 두 단계는 항상 "안 함"으로 나오는데 버그가 아니라 화면이 아직 없는 것이다. 그리고 별칭 4종(`백 쵸크`·`암락`·`다스 쵸크`·`닌자 쵸크`)은 **당신 결정 대기 중**이라 여전히 미연결로 남아 있다.
