---
name: task-027-reaction-inflow-and-weekly-task
aliases: ["리액션 자동 유입", "이번 주 과제", "reaction inflow", "weekly task", "research_tasks"]
tags:
  - type/task
  - domain/backend
  - domain/frontend
  - domain/analytics
related_tasks:
  - "[[task-022-failure-first-spar-input-and-cause-tags]]"
  - "[[task-024-holes-and-mastery-api]]"
  - "[[task-025-recall-screen]]"
  - "[[task-026-research-screen]]"
  - "[[task-017-spar-recording-friction]]"
status: done
created: 2026-09-07
updated: 2026-09-07
---

# task-027 — 리액션 자동 유입 + 이번 주 과제

## 목표

task-026 이 **빈 곳을 드러내는 판**을 만들었다. 이번에는 그 판에 **재료가 저절로 올라오게** 하고,
**한 번에 하나만 파도록** 강제한다.

- **A. 리액션 자동 유입** — 스파링에서 막힌 리액션이 연구 트리에 *미처리 리액션 제안*으로 올라온다.
  사람이 복기에서 손으로 옮기는 단계를 없앤다. 🔴 **DB 에 노드를 자동 생성하지 않는다**(승인 전 자동 생성 금지 — task-007~009 원칙).
- **B. 이번 주 과제** — 연구 노드 하나를 과제로 지정하고 **앱 전체에 1개만** 유지한다. 3택으로 마감한다.

---

## 🔴 백엔드 계약 (dev-027a 가 확정 · dev-027b 는 이걸 보고 병렬로 만든다)

**dev-027a 가 이 계약에서 벗어나면 즉시 이 문서를 갱신하고 Leader 에게 보고한다.**
응답은 이 앱의 표준 `{success, data, message}` 이고 프론트 axios 인터셉터가 `data` 를 벗겨 준다.

### A. 리액션 자동 유입

| 메서드 | 경로 | 용도 |
|---|---|---|
| `GET` | `/api/research/projects/:id/reaction-suggestions` | 활성 버전 기준 **제안 계산**(쓰기 0건) |

🔴 **채택 엔드포인트는 새로 만들지 않았다.** 채택 = 기존 `POST /api/research/nodes`
`{versionId, parentNodeId, kind:'리액션', label}` 그대로다. 그래야 "제안"과 "생성"이
코드 수준에서 갈라져 있고, 조회가 절대 쓰지 않는다는 사실이 구조로 보장된다.

```jsonc
{
  "projectId": 7, "versionId": 12,
  "empty": false,                  // 실패 항목에 적힌 리액션이 하나도 없으면 true → 화면은 "기록 없음"
  "summary": {
    "sparSessions": 54, "failItems": 38,
    "failItemsWithReaction": 6,    // 리액션 한 줄이 실제로 적힌 실패 항목 수
    "reactionTexts": 4,            // 정규화 후 고유 리액션 문구 수
    "linkedReactionItems": 5,      // 기술명 매칭 성공
    "unlinkedReactionItems": 1,    // 🔴 매칭 실패 — 집계에서 빼지 않는다
    "nodesWithTechnique": 2,       // 제안이 붙을 수 있는 노드 수 (0이면 suggestions 는 항상 빈 배열)
    "suggested": 3, "alreadyInTree": 1,
    "parseFailures": []
  },
  "suggestions": [{
    "parentNodeId": 40, "parentLabel": "트라이앵글 쵸크",
    "techniqueId": 27, "techniqueName": "트라이앵글 쵸크",
    "kind": "리액션",
    "label": "팔 숨김",            // 그대로 POST /nodes 의 label 로 쓰면 된다(최빈 원본 표기)
    "normLabel": "팔숨김",
    "count": 3,                     // 🔴 출처 — 몇 회 막혔는지
    "lastFailedAt": "2026-05-25", "firstFailedAt": "2026-04-24",
    "sources": [                    // 최대 5건. 근거 없이 나타나면 사용자가 신뢰하지 않는다
      { "sparSessionId": 128, "date": "2026-05-25", "itemName": "삼각 쵸크",
        "matchType": "alias", "matchedName": "트라이앵글 쵸크", "level": "블루" }
    ],
    "sourceCount": 3
  }],
  "unlinked": [{                    // 🔴 기술명 미매칭 — 붙일 노드를 정할 수 없다. 버리지 않고 드러낸다
    "itemName": "마운트 암바", "label": "팔 빼기", "normLabel": "팔빼기",
    "count": 1, "lastFailedAt": "2026-06-24", "linked": false,
    "sources": [ … ], "sourceCount": 1
  }],
  "skipped": [{                     // 이미 트리에 있어 제외한 것 — 조용히 지우지 않고 드러낸다
    "parentNodeId": 40, "label": "팔 숨김", "normLabel": "팔숨김",
    "existingNodeId": 55, "count": 3, "reason": "already_in_tree"
  }]
}
```

- 🔴 **같은 기술을 참조하는 노드가 여러 개면 각 노드마다 따로 제안**한다(어디에 붙일지는 사람이 정한다).
  중복 판정은 **그 노드의 직계 자식 `리액션`** 만 본다.
- 중복 비교 키는 `techMatch.normalize()`(NFC + 소문자 + 공백·하이픈·중점 제거)다. 신규 매처 없음.
- 정렬(결정적): `count` ↓ → `lastFailedAt` ↓ → `label` ↑ → `parentNodeId` ↑.
- 🔴 **표본 0은 `0/0` 이 아니다.** `empty:true` 면 화면은 "아직 막힌 리액션 기록이 없습니다".
  `nodesWithTechnique:0` 이면 "기술을 연결한 노드가 없어 붙일 자리가 없습니다"(다른 말이다).

### B. 이번 주 과제

| 메서드 | 경로 | 용도 |
|---|---|---|
| `GET` | `/api/research/task` | 열린 과제 1개 + 최근 마감 이력 5건 |
| `POST` | `/api/research/task` | `{nodeId, memo?}` 지정. 이미 열린 게 있으면 **409**(응답에 현재 과제 동봉) |
| `PATCH` | `/api/research/task/:id` | `{memo}` 부분 갱신 |
| `POST` | `/api/research/task/:id/close` | `{outcome}` 3택 마감 |
| `DELETE` | `/api/research/task/:id` | 지정 취소. **마감된 과제는 400**(이력을 지우지 않는다) |

- 🔴 **`outcome` 3택 값은 ASCII 키다**: `not_tried` · `tried_failed` · `done`.
  응답에 `outcomeLabel`(`시도 못 함` · `해봤는데 안 됨` · `됐음`)을 **서버가 함께 준다** —
  프론트가 라벨을 따로 하드코딩하면 두 곳이 갈린다. `GET /api/research/task` 응답의
  `outcomeOptions[]` 가 3택 정본 목록이다(화면은 이걸 그대로 그린다).
- 🔴 **`done` 이어도 `technique_mastery` 를 쓰지 않는다.** 사다리 4·5단계는
  `spar_sessions.success` 자동 판정이 원칙이라 과제 마감이 그걸 덮어쓰면 안 된다.
  마감 응답의 `ladder.applied` 는 **항상 false** 이고 `ladder.reason` 이 이유를 담는다.
  `ladder.candidateForStep4` 가 "4단계 후보"라는 표시다 — 화면은 이걸 *권유*로 그린다(체크로 그리지 마라).
- 🔴 **스파링 저장(`PUT /api/classes/:id/spar/:sparDayId`)은 건드리지 않았다.** 마감은 위 전용
  엔드포인트를 스파링 저장 직후에 한 번 더 부르는 방식이다. 스파링 저장이 destroy+reinsert 라
  (task-017) 거기에 새 필드를 실으면 재저장마다 사라진다 — **구조적으로 그 함정을 피한 것이다.**

```jsonc
// GET /api/research/task
{ "task": {
    "id": 3, "nodeId": 40, "memo": "각도부터",
    "createdAt": "2026-09-07", "daysOpen": 0,
    "closedAt": null, "outcome": null, "outcomeLabel": null, "open": true,
    "node": { "id": 40, "kind": "리액션", "label": "팔 숨김",
              "techniqueId": 27, "techniqueName": "트라이앵글 쵸크", "linked": true },
    "project": { "id": 7, "title": "트라이앵글", "versionId": 12, "versionNo": 1, "versionName": null }
  },
  "recent": [ /* 마감 이력 5건, 같은 모양 + closedAt/outcome 채워짐 */ ],
  "outcomeOptions": [
    { "value": "not_tried",    "label": "시도 못 함" },
    { "value": "tried_failed", "label": "해봤는데 안 됨" },
    { "value": "done",         "label": "됐음" }
  ]
}

// POST /api/research/task/:id/close → 위 task 형태 + ladder
{ "task": { … "open": false, "outcome": "done", "outcomeLabel": "됐음" },
  "ladder": { "techniqueId": 27, "reached": 4, "step4Status": "done",
              "applied": false, "candidateForStep4": true,
              "reason": "사다리 4·5단계는 spar_sessions.success 에서 자동 판정합니다 — 과제 결과는 별도 기록입니다" } }
```

- 과제가 없으면 `{ "task": null, "recent": [...], "outcomeOptions": [...] }` — **404 가 아니다.**
  "아직 정하지 않았다"는 정상 상태다.
- 미연결 노드(`techniqueId` null)도 과제로 지정할 수 있다. 그때 `ladder` 는
  `{ techniqueId: null, reached: null, applied: false, candidateForStep4: false, reason: "기술이 연결되지 않아 사다리가 없습니다" }`.

---

## 역할별 기록

### dev-027a — 백엔드

- [12:5x] **착수 전 실측 — 지시서와 다른 것이 1건 있다. 이게 이번 task 의 전제를 바꾼다.**
  🔴 **운영 DB 에 `reaction` 이 적힌 스파링이 0건이다.** 지시서는 "task-022에서 추가, 실패 항목마다
  한 줄"이라 적었는데, 구조만 들어갔고 사용자가 아직 아무것도 안 적었다.
  ```
  SELECT COUNT(*) total, SUM(success LIKE '%causes%') has_causes,
         SUM(reaction IS NOT NULL AND reaction<>'[]' AND reaction<>'') has_reaction_col
    FROM spar_sessions;                    -->  54 / 0 / 0
  SELECT COUNT(*) FROM spar_sessions WHERE success LIKE '%reaction%';   -->  0
  ```
  → 유입을 검증하려면 리액션이 있어야 하는데 **기존 54행을 UPDATE 하면 사용자의 진짜 기록을 고치는 것**이라,
  하네스가 `__QA027__` 마커가 붙은 **새 수업 1건**을 만들어 거기에만 넣고 끝나면 지운다.
  🔴 **이 기능은 통과했지만 "사용자의 실제 기록으로 도는 것"은 아직 아무도 못 봤다** —
  사용자가 스파링에 리액션을 한 줄 적어야 처음 보인다. 그 전까지 화면은 정상적으로 "기록 없음"이다.
  - 그 밖의 실측은 문서값과 일치: `research_*` 4테이블 존재·**전부 0행** · `technique_mastery` **0행** ·
    `%task%` 테이블 0건(충돌 없음) · tid 27=트라이앵글 쵸크 · 51=기무라 · `삼각 쵸크`→alias→27 ·
    `마운트 암바`→미매칭 · user 3 classes 29 · `token.sh` **`payload.userId = 3`**.

- [13:0x] **DDL 실행 후 무결성 실측** — `SHOW CREATE TABLE research_tasks` 로 확인:
  **`ENGINE=InnoDB`** · **`UNIQUE KEY uq_rt_open (user_id, open_slot)`** ·
  **`open_slot tinyint(4) GENERATED ALWAYS AS (if(closed_at is null,1,NULL)) STORED`** ·
  **`fk_rt_node ... ON DELETE CASCADE`**. 부팅 로그:
  `[mig][task-027] 무결성 확인 — InnoDB · uq_rt_open(user_id,open_slot) · fk_rt_node CASCADE`.
  `backend/src/index.js:591-660` 이 **부팅 때마다** 셋을 재검증해 어긋나면 `console.error` 로 크게 남긴다 —
  MyISAM 폴백이면 FK 도 트랜잭션도 없고, UNIQUE 가 없으면 "앱 전체 1개"가 **에러 없이** 무너진다.

- [13:1x] **파일:라인 — 신규 3, 추가만 5. 기존 줄 수정은 삭제 라우트 3곳뿐.**

  | 파일 | 위치 | 내용 |
  |---|---|---|
  | `backend/src/services/researchTree.js` | `:16-19`(require) · `:288-470`(`computeReactionSuggestions`) · `:512`(export) | 제안 계산 **순수 함수**. DB·HTTP 없음 |
  | `backend/src/services/labAnalytics.js` | `:112`(`normalizeItem` 에 `reaction`) · `:440-476`(`collectReactionItems`) · `:700-710`(export 2개) | 원천 추출. 🔴 `normalizeItem` export 는 **검증 요건** |
  | `backend/src/routes/research.js` | `:484-543`(reaction-suggestions) · `:1089-1358`(과제 6라우트) · `:451-477`(project DELETE) · `:624-645`(version DELETE) · `:823-844`(node DELETE) | 라우트 7개 + `deletedTasks` |
  | `backend/src/models/ResearchTask.js` | 신규 36줄 | 모델 |
  | `backend/src/models/index.js` | `:29`·`:52-54`·`:97-102`·`:110` | 등록·관계·export (기존 줄 수정 0) |
  | `backend/src/index.js` | `:591-665` | `[mig][task-027]` 블록 (ALTER 0건, 신규 테이블 1개) |
  | `docs/recall-lab-spec.md` | §3.4 신설 · §4.5 신설(기존 §4.5 → §4.6) · §6 자동유입 메모 갱신 | |

- [13:2x] 🔴 **계약이 정하지 않아 내가 정한 것 6건.** 프론트가 조용히 어긋날 수 있는 지점이라 그대로 적는다.
  1. **경로가 `/api/research/task`(단수)이고 `GET` 에 id 가 없다.** 앱 전체에 1개이므로 목록이 아니라
     **상태**다. 지시서는 테이블만 정하고 경로를 정하지 않았다.
  2. **채택 엔드포인트를 새로 만들지 않았다.** 채택 = 기존 `POST /api/research/nodes`.
     그래야 "제안"과 "생성"이 코드 수준에서 갈라져 있고, **조회가 절대 쓰지 않는다**는 것이
     주석이 아니라 구조로 보장된다("승인 전 자동 생성 금지"가 이 프로젝트 원칙이라 이게 급소였다).
  3. **`outcome` 은 ASCII 키**(`not_tried`/`tried_failed`/`done`)이고 한글 라벨은 서버가 응답에 붙인다
     (`outcomeOptions[]` 가 정본). `kind` 7종이 한글인 것과 다른데, 이건 **사람이 고르는 어휘가 아니라
     기계가 비교하는 값**이기 때문이다. §5.3 에서 `white`/`화이트` 가 섞여 20건이 6건이 된 그 실패를 피한다.
  4. **이미 열린 과제가 있으면 409** 이고 **응답에 현재 과제를 동봉**한다. 400 만 주면 화면이
     "바꾸시겠습니까"를 물을 수 없다. 강제는 앱 검사 + DB UNIQUE **두 겹**이다.
  5. **마감된 과제 DELETE 는 400**(계약 초안엔 404 로 적었다가 고쳤다 — 위 표도 갱신). 마감 이력은
     "무엇을 해봤나"의 기록이라 지울 수 있게 하면 4단계 후보의 근거가 조용히 사라진다.
  6. **같은 기술을 참조하는 노드가 여럿이면 각 노드마다 제안**한다. 한 곳으로 몰면 사용자가 의도하지
     않은 자리에 붙고, 그건 되돌리기 어렵다. 중복 판정은 **그 노드의 직계 자식 리액션**만 본다.
  - 그 밖에: `PATCH /task/:id` 는 `memo` 만 받는다(`nodeId` 변경 400 — 도중에 대상이 바뀌면
    "무엇을 며칠 팠는가"가 사라진다 / `outcome` 변경 400 — 마감은 `/close`) ·
    `research_tasks.node_id` FK 는 CASCADE(가리키는 노드가 없는 이력은 무엇에 대한 기록인지 화면이
    말할 수 없다. 마감 이력도 함께 사라지는 것은 의도된 절충이다) ·
    세 DELETE 응답에 **`deletedTasks` 추가**(기존 필드는 그대로 — 회귀 검사로 확인).

- [13:3x] 🔴 **스파링 저장(`classes.js`)을 건드리지 않았다 — 함정 7 을 구조적으로 피한 것.**
  지시서는 "스파링 저장 시 3택으로 마감"이라 했지만, 거긴 destroy+reinsert 라(task-017)
  새 필드를 실으면 프론트가 안 보낼 때마다 사라진다(`positions` 가 실제로 54행 중 36행이 빈 `[]` 가 됐다).
  → **전용 라우트를 스파링 저장 직후에 한 번 더 부르는** 방식으로 갈랐다. 초기값·기존값 매핑·payload
  빌더 3곳을 맞출 필요가 아예 없어진다. 프론트 호출 순서만 dev-027b 가 지키면 된다.

- [13:4x] 🔴 **마감이 사다리를 덮어쓰지 않는다.** `done` 이어도 `technique_mastery` 에 한 줄도 안 쓴다.
  `ladder.applied` 는 항상 false, `candidateForStep4` 가 "4단계 후보"라는 **권유**일 뿐이다.
  하네스가 마감 전후 `technique_mastery` 행 수를 재서 확인한다(0 → 0).

- [13:5x] **QA 하네스 인계 — `/home/brownjeon/.node-local/bjj-backup/task-027/qa/`** (저장소 밖).
  `./run-all.sh` 한 줄. **dev-027a 가 직접 실행해 전 단계 통과 확인 — 통과 290 / 실패 0**
  (`env -u TOK3 ./run-all.sh` 로 깨끗한 환경에서 재확인).
  순수 71 · 유입 36 · 과제 67 · IDOR 29 · 드리프트 17 · 회귀 34 · **역검증 27** · 정리 증명 9.
  - `token.sh`/`token-other.sh` 는 task-026 것을 복사(`payload.userId = 3` / `4` 확인).
  - `seed.sh` 가 **리액션이 적힌 스파링 7세션 + 깊이 2 트리**를 심는다. 같은 기술(tid 27) 노드 2개,
    그중 하나엔 **공백 없는** 표기의 리액션 자식을 미리 심어 정규화 중복 판정을 찌른다.
  - `_recount.py` 가 **앱 코드를 전혀 쓰지 않고** 파이썬으로 정규화를 다시 구현해 대조한다.
    앱 함수를 import 해 대조하면 "같은 함수가 같은 답을 낸다"만 확인하는 셈이라 아무것도 증명하지 않는다.
  - `cleanup.sh` 가 지운 뒤 **마커로 SQL 을 다시 돌려 9건이 전부 0** 임을 찍는다.

- [13:5x] 🔴 **역검증이 실제로 값을 했다 — 내 검사 중 4개가 무력했고 전부 여기서 걸렸다.**
  1. **`sort -u` 가 로케일(`sd_IN`) 때문에 서로 다른 한글 키를 합쳤다.** 4종이 **2종**으로 접혀
     그 값이 그대로 기대값이 됐다 → `LC_ALL=C sort -u`.
  2. **`REACTION_KEPT` 결함을 심었는데 검사가 통과했다.** `collectReactionItems` 에 이미 만든 items 를
     넣으면 `normalizeItem` 을 **거치지 않는다** — 가장 조용한 실패 지점을 검사가 안 보고 있었다.
     → `normalizeItem` 을 export 해 **직접** 부르게 고쳤다(이 export 는 편의가 아니라 검증 요건이다).
  3. **결함 주입 2건이 아예 안 심어졌다**(`_inject.py` 가 치환 0건으로 exit 1). 통제가 통제를 통제한 사례다.
  4. **전역 행 수 검사가 dev-027b 의 병렬 작업에 흔들렸다**(통제 도중 7→9). 버전 범위로 좁히고,
     **"제안 라벨이 노드로 물질화되지 않았다"** 는 병렬-내성 검사를 따로 얹었다.
  - `neg-control.sh` 는 "아무 실패나"를 통과로 세지 않는다: ① 결함이 실제로 심어졌는지 ②
    **기대한 그 라벨**이 FAIL 로 바뀌었는지를 요구하고, 함께 무너진 검사는 `⚠️` 로만 표시한다.
  - `SOURCE_CAP` 은 **행동**을 잰다(9건 넣고 `sources.length===5 && sourceCount===9`) —
    `.slice()` 만 지우고 상수 선언을 남긴 결함판이 코드 grep 을 통과한 전례(task-025) 때문이다.
  - 스키마 통제는 운영 테이블의 UNIQUE 를 떼지 않고 **`uq_rt_open` 없는 그림자 테이블**을 만들어
    "결함 스키마에서는 열린 과제가 2건 된다"를 실측한다. pm2 재시작도 안 한다(dev-027b 가 같은 서버).

- [14:0x] 🔴 **내가 직접 만든 결함 1건 — 이력에 남긴다. 다음 사람이 같은 걸 밟는다.**
  주석에 **NUL(0x00) 한 바이트**가 섞여 들어가 `file` 이 `researchTree.js` 를 `data`(바이너리)로 보고
  **`grep` 이 이 파일에 대해 결과를 조용히 빈 채로 돌려줬다.** `node --check` 는 통과하고 서버도 정상이라
  **아무 증상이 없다.** 발견 경위: 이력에 적을 줄 번호를 확인하려고 grep 했는데 아무것도 안 나왔다.
  ```
  $ file backend/src/services/researchTree.js
  backend/src/services/researchTree.js: data          <-- 🔴
  $ grep -n "computeReactionSuggestions" backend/src/services/researchTree.js
  (아무것도 안 나옴 — 함수는 330번 줄에 멀쩡히 있다)
  ```
  🔴 **이 파일을 grep 으로 감사하는 Reviewer·QA 검증이 통째로 무력해진다.**
  아이러니하게도 `labAnalytics.js` 의 `resolveBelts` 주석이 정확히 이 함정을 경고하고 있었는데
  ("소스에 제어문자가 섞이면 grep 이 파일을 binary 로 보고 검색 결과를 조용히 비워 돌려준다") 내가 밟았다.
  - **조치**: NUL 제거 + 손댄 파일 8개 전수 검사(전부 0) + `regression.sh` 에 **상시 검사**로 편입
    (`제어문자 0바이트 — <파일>` 6건). 일회성 수정으로 끝내면 다음에 또 들어온다.

- [13:5x] **못 한 것 — 미실행으로 정직하게 남긴다.**
  - **사용자의 실제 리액션 데이터로는 검증 못 함** — 운영에 0건이라 시드로만 확인했다(위 착수 보고).
  - **화면 확인 0건** — `web/**` 는 dev-027b 소관이라 손대지 않았다. 응답 계약이 실제 화면과 맞는지는
    dev-027b 의 실응답 대조로만 확인된다.
  - **동시 요청 경합 실측 안 함** — `FOR UPDATE` + UNIQUE 두 겹을 걸었고 SQL 직접 INSERT 로
    UNIQUE 가 튕기는 것까지는 봤지만, HTTP 동시 POST 를 실제로 쏴 보지는 않았다.
  - **`/api/holes` 절대 수치 회귀는 미실행** — 시드가 수업 1건을 일시적으로 넣어 절대값이 흔들린다.
    구조·불변식(`linked+unlinked=failItems`, `parseFailures 0`, `sameTechnique 2쌍`)만 잤다.

- [13:5x] **남은 위험 4건.**
  1. 🔴 **유입 손실률 = 기술명 미매칭률.** 실측 33.7% 가 그대로 "제안이 안 뜨는 비율"이다.
     `unlinked` 로 드러내긴 하지만 **붙일 자리를 정할 수 없어 채택이 불가능**하다 — 별칭 4종 추가와
     `techMatch` fuzzy 보완이 백로그로 남아 있는 한 이 손실은 계속된다.
  2. **같은 기술 노드가 많으면 제안이 곱해진다.** tid 하나를 노드 5개가 참조하면 같은 리액션이
     5번 보인다. 의도한 설계지만(사람이 자리를 고른다) 프로젝트가 커지면 화면이 시끄러워질 수 있다.
  3. **`research_tasks` 는 노드 CASCADE 로 마감 이력까지 사라진다.** 사용자가 노드를 정리하면
     "그 주에 무엇을 팠는지"가 함께 없어진다. 이력 보존이 필요해지면 스키마 결정을 되짚어야 한다.
  4. **동시 작업 간섭** — dev-027b 가 같은 계정·같은 서버로 병렬 실행 중이다. 하네스는 범위를 좁혀
     막았지만, QA 는 실패를 보면 **재실행 후에도 재현되는지**부터 확인할 것.

### dev-027b — 프론트엔드

- [11:05] **착수 전 실측** — 서빙 번들 `index-BpzFBz_l.js` · `research_projects` **0건**(dev-026a 시드는 이미 정리됨) ·
  `GET /api/holes` holes 4 / unlinked 13 / `sparSessions 54 · failItems 38 · unlinkedFailItems 13` ·
  `token.sh` **`payload.userId = 3`** 확인. 착수 시점에 dev-027a 의 백엔드는 아직 없었고(`git status` 무변경),
  **계약 문서가 먼저 확정된 뒤** 그 계약만 보고 만들었다. 라우트 경로는 나중에 실서버로 전수 대조했다.

- [11:40] **구현 (수정 5 · 신설 4, web/src 만)**

  | 파일 | 줄 | 핵심 |
  |---|---:|---|
  | `web/src/utils/weeklyTask.js` | 193 | **신설 · 순수 함수만.** `normalizeOutcomeOptions`(:39) `fmtMD`(:50) `taskSummary`(:67) `sourceText`(:113) `dismissKey`(:125) `splitSuggestions`(:174) 전부 export — 하네스가 HTTP 없이 직접 부른다 |
  | `web/src/components/ResearchSuggestions.jsx` | 224 | **신설.** 제안 구역(출처·근거 펼치기·채택/무시·미매칭·이미트리) |
  | `web/src/components/WeeklyTaskCard.jsx` | 125 | **신설.** 홈 과제 카드 |
  | `web/src/components/WeeklyTaskCloseout.jsx` | 114 | **신설.** 스파링 3택 마감 |
  | `web/src/api/research.js` | +53 | `getReactionSuggestions`(:102) `getTask`(:110) `setTask`(:119) `patchTask`(:123) `closeTask`(:131) `clearTask`(:135) |
  | `web/src/pages/ResearchPage.jsx` | +154 | `reloadSuggest`(:315) `reloadTask`(:332) `adoptSuggestion`(:506) `dismissSuggestion`(:520) `restoreDismissed`(:524) `setNodeAsTask`(:539) `clearCurrentTask`(:555) · 렌더(:648·:716) |
  | `web/src/components/ResearchNodeSheet.jsx` | +80 | `emptyForm(draft)`(:39 — draft 가 label·techniqueId 를 실어 온다) · 과제 지정 블록(:296) |
  | `web/src/pages/HomePage.jsx` | +33 | `reloadWeeklyTask`(:55) · 카드(:275) · 저장 후 재조회(:456) |
  | `web/src/pages/SparEditPage.jsx` | +55 | 과제 state(:193·:199) · **스파링 저장 뒤** 마감(:335) · 3택 렌더(:474) |

  **금지 파일 미변경 확인** — `git diff --numstat` 로 `RecallPage.jsx`·`RecallLadder.jsx`·**`tokens.css`**·
  `api/lab.js`·`api/classes.js`·`main.jsx`·`Layout.jsx`·`toggleNav.js`·`CalendarPage.jsx`·`ClassDetailModal.jsx`
  **전부 0줄**. `backend/**`·`docs/**` 도 손대지 않았다(그쪽 변경은 전부 dev-027a).

- [11:45] 🔴 **지시서와 dev-027a 계약이 어긋난 지점 1건 — 계약을 따랐다. Leader 확인 요망.**
  지시서는 *"과제 마감 값을 `EMPTY_SESSION` 초기값 · 기존값 매핑 · `buildPayload()` 3곳 전부에 연결하라"*
  (task-017 함정)고 했다. 그런데 dev-027a 계약 B 는 **"스파링 저장은 건드리지 않았다 — 마감은 전용
  엔드포인트를 저장 직후 한 번 더 부르는 방식"** 으로, 마감 값이 `spar_sessions` 가 아니라
  `research_tasks` 에 산다. 즉 **destroy+reinsert 경로를 아예 지나가지 않아 함정이 구조적으로 소멸**했다.
  → 3곳에 넣으면 백엔드 `insertSessions()`(`classes.js:251-267`)가 그 필드를 읽지 않으므로
  **저장되지 않으면서 "저장된다"는 거짓 신호**만 남는다. 그래서 **넣지 않았고**, 왜 없는지를
  `SparEditPage.jsx:34-40` 주석에 못박았다. 대신 지시서가 요구한 **함정 재현 시도는 그대로 실행**했다(아래).
  ⚠️ 지시서 문구를 그대로 이행하지 않은 유일한 항목이다.

- [11:48] 🔴 **계약에 없던 것 1건 — "무시"는 서버 저장이 없다.**
  지시서는 "채택 / 무시 두 동작"을 요구하는데 계약 A 에는 **무시 저장 엔드포인트가 없다**(채택은 기존
  `POST /nodes` 재사용). → 무시를 **이 브라우저 localStorage** 에만 남기고, 그 사실을 화면이
  **말한다**("무시함 N개 (이 브라우저에만 저장됩니다) · 다시 보기"). 되돌릴 길을 항상 함께 뒀다 —
  서버에 없다는 것을 감추면 다른 기기에서 되살아났을 때 사용자가 버그로 읽는다.
  키는 `parentNodeId:normLabel` 이라 **같은 문구라도 붙을 자리가 다르면 따로 무시**된다.

- [11:52] 🔴 **"채택 전에는 DB 에 안 생긴다"를 구조로 보장했다 (이 task 의 급소)**
  - `ResearchSuggestions.jsx` 에는 **API 모듈 import 가 하나도 없다.** 콜백만 받는다 = 혼자서는 아무것도 못 만든다.
  - `adoptSuggestion`(`ResearchPage.jsx:506`)은 **시트를 열 뿐**이다(task-026 "대처 추가"와 같은 규칙).
    실제 생성 경로는 시트 저장 → `saveNode` → `createNode` **하나뿐**.
  - 실측: 채택 버튼 클릭 시점의 **쓰기 요청 총 0건**, 저장 시에만 `POST /nodes` 1건.
  - 실서버 실측: 제안을 **3번 연속 조회해도 노드 수 불변**(`contract.js`).

- [11:58] 🔴 **색 언어 — 새 색 0개(`tokens.css` 미수정).** 기존 3갈래에 겹치지 않는 조합을 골랐다.
  | 상태 | 표현 |
  |---|---|
  | 대처 없는 리액션 (**앰버 전용**) | `--amber-dim` 배경 + `1px dashed var(--amber)` |
  | 미연결 | `--surface-up` + `1px dashed var(--border-med)` |
  | 일반 노드 | `--surface-up` + `1px solid var(--border)` |
  | **제안(신규)** | `--blue-dim` + `1px dashed var(--blue)` |
  | **붙일 자리 없는 미매칭 제안(신규)** | `transparent` + `1px dashed var(--border-med)` |
  색에만 기대지 않는다 — 제안은 **트리 바깥 별도 구역**에 있고 "제안" 배지와 "아직 트리에 없습니다"를
  항상 함께 그린다. 하네스가 **제안 행에 앰버가 0인지**를 `AMBER_RE`(토큰·hex·rgb 3형태)로 잰다.

- [12:35] **실행한 검증 (전부 직접 실행. 추정 0)**

  | 검사 | 결과 |
  |---|---|
  | `task-027/qa/fe/run-ui.sh` (14 시나리오) | **PASS 112 / FAIL 0** |
  | `task-027/qa/fe/contract.js` (실서버) | **PASS 55 / FAIL 0** |
  | `task-027/qa/fe/neg-control.sh` (역검증) | **결함 13종 탐지 / 미탐지 0** (전부 기대 문구까지 일치) |
  | task-026 `fe/run-ui.sh` (`/research` 회귀) | **111 / 0** |
  | task-025 `fe/run-ui.sh` (`/recall` 회귀) | **63 / 0** |

  ⚠️ task-026 하네스가 **115 → 111** 로 준 것은 회귀가 아니다. `live` 시나리오가 계정의 프로젝트 유무로
  분기하는데(`render.js:530`), dev-026a 시드 프로젝트가 사라져 **빈 상태 분기(검사 10개)** 를 타기 때문이다.
  중간에 **103/8** 이 한 번 나왔으나 `live` 3회 연속 재실행 **10/0** 으로 재현되지 않았고, 그때
  `pm2 ↺` 가 69→73 으로 올라가 있었다 — **dev-027a 의 병렬 재시작 중 프록시 502** 였다. 내 변경과 무관.

- [12:50] 🔴 **하네스가 잡은 것 3건 (셋 다 코드만 읽었으면 못 봤다)**
  1. **`adopt` 검사가 엉뚱한 제안을 채택하고도 통과할 뻔했다.** "채택" 버튼이 제안마다 있는데 행을
     좁히지 않아 두 번째가 눌렸고, 본문 모양은 그럴듯했다. → 행으로 좁히고 **두 제안이 각자
     자기 `parentNodeId`/`techniqueId` 로** 채택되는지까지 재게 바꿨다(하나만 재면 "항상 첫 제안을
     쓴다"는 결함을 통과시킨다).
  2. **픽스처가 실서버와 달랐다.** `positions` 를 문자열 배열로 뒀는데 실제 GET 은 `{name,score}`
     **객체**로 정규화한다(`classes.js:85-90`). `contract.js` 가 잡았다 — 픽스처만 믿으면 못 보는 종류다.
  3. 🔴 **계약 검사가 통째로 건너뛰어지고 있었다.** 이 계정 실데이터는 **`failItemsWithReaction: 0`**
     (task-022 의 "막힌 리액션" 한 줄을 사용자가 **아직 한 번도 안 채웠다**). 그래서 `suggestions` 가
     늘 빈 배열이었고 형태 검사가 조용히 skip 되면서 **PASS 로 보였다.** → `contract.js` 가
     **자기 리액션 씨앗을 먼저 심고** 그 문구가 제안으로 올라오는지까지 확인하게 바꿨다.
     씨앗 없이 돌린 대조 실행(임시 프로젝트 90, 기술 42·27·51·48 노드 4개)에서
     `suggestions: []` · `failItemsWithReaction: 0` 을 직접 받아 **이 검사가 공허하지 않음**을 확인했다.

- [13:05] 🔴 **task-017 함정 재현 시도 — 재현되지 않았다(구조적으로 소멸).** 추정이 아니라 실행 결과다.
  - `contract.js`: 임시 수업·스파링을 만들고 과제를 `done` 으로 마감한 뒤 **같은 스파링을 2번 재저장** →
    마감 레코드가 **재저장 전후 완전히 동일**(`JSON.stringify` 일치), `outcome:'done'` 유지.
  - 같은 재저장에서 `positions`(편집 UI 없는 필드)·`reaction` 도 살아남음 — 기존 회귀 0.
  - jsdom `resave`: 마감된 과제는 **3택을 다시 띄우지 않고** `close` 재호출 **0건**.
  - jsdom `spar`: 스파링 PUT 본문의 세션에 `weeklyTaskOutcome`/`taskOutcome` 류 필드 **0개**.
  - 역검증 결함 L(마감 필드를 스파링 페이로드에 다시 싣기) → 검사가 실제로 FAIL 로 바뀜.

- [13:12] **조용한 실패 2곳을 막았다** (구현 중 자체 발견 — 하네스가 아니라 코드 검토로 잡은 유일한 건)
  - `SparEditPage` 가 `getTask()` 실패를 `.catch(() => {})` 로 삼키고 있었다. 그러면 **열린 과제가 있는데
    3택이 안 뜨는 상황**과 **정말 과제가 없는 상황**이 화면에서 똑같아, 사용자가 마감을 못 하고도 이유를 모른다.
    → `taskErr` 로 한 줄 표시(`SparEditPage.jsx:199`, `WeeklyTaskCloseout.jsx:33-44`).
    **저장은 계속 된다** — 스파링 기록이 과제 때문에 인질이 되면 안 된다. 시나리오 `sparerr` + 역검증 결함 M 추가.
  - `ResearchPage` 의 `errs.task` 가 **어디에도 안 그려지는 죽은 state** 였다 → 시트에 넘겨 표시(`ResearchNodeSheet.jsx:296`).

- [13:20] **409 를 정면으로 다루지 않고 우회한 이유** — `POST /api/research/task` 는 이미 열린 과제가 있으면
  409 이고 **본문에 현재 과제를 동봉**하지만, 이 앱의 axios 인터셉터(`api/client.js:26-31`)가
  **비-2xx 의 본문을 버리고 `Error(message)` 만 남긴다.** 인터셉터는 전 화면 공용이라 건드리지 않았다.
  → 화면이 **이미 가진 `task` 로 먼저 무엇이 내려가는지 이름으로 경고**하고(`"지금 과제는 «X» 입니다"`),
  바꿀 때는 **DELETE 뒤 POST** 순서로 간다. 실서버로 이 경로가 되는 것을 확인했다(`contract.js`).

- [13:28] **빌드·배포** — `index-BpzFBz_l.js` → `index-BOl-svmZ.js` → **`index-ByxxfsmG.js`**.
  🔴 소스가 아니라 **서빙 번들을 직접 내려받아**(584KB) 신규 문자열 12종이 실제로 들어 있는지 확인했다
  (`매트에서 올라온 리액션`·`채택해야 트리에 노드가 만들어집니다`·`이 브라우저에만 저장됩니다`·
  `reaction-suggestions`·`research/task` 등 전부 "있음"). 3택 한글 라벨은 번들에 **각 1회**만 존재 =
  최후 수단 1곳뿐이고 중복 하드코딩 없음. `GET /research` · `GET /` **200**.
  `pm2 restart bjj` 는 `/tmp/bjj-restart.lock` **mkdir 락**으로 직렬화(둘 다 대기 0회에 획득),
  재시작 후 포트 바인딩까지 **22~24초** 걸려 `wait_ready` 루프로 오판을 막았다.

- [13:35] **테스트 데이터 정리 — SQL 로 증명**
  ```
  QA027 프로젝트 잔여 0 · QA027 수업 잔여 0 · QA027 리액션 잔여 0
  research_projects 0 · research_nodes 0 · research_tasks 0
  classes(user3) 29 · spar_days 17 · spar_sessions 54 · technique_mastery 0
  고아 spar_days 0 · 고아 spar_sessions 0
  spar_sessions md5 = 7302c7a38da9a1130a8c869349955208
  ```
  🔴 md5 가 **dev-026d 가 기록한 값과 글자 그대로 동일**하다 = 사용자 스파링 실데이터 **무변경**.
  `technique_mastery` 는 어디서도 건드리지 않았다.

- [13:40] **미실행 — 정직하게 적는다**
  1. 🔴 **브라우저 육안 확인 전부 미실행.** jsdom 은 레이아웃·실제 색을 계산하지 않는다. 특히
     **제안의 블루 점선(`--blue`)이 다크 배경에서 미연결 중립 점선·일반 실선과 실제로 갈라져 보이는지**,
     340px 에서 제안 카드가 접히지 않는지, `--blue` 가 포지션 kind 칩(같은 `--blue`)과 헷갈리지 않는지.
  2. **실데이터로 그린 `/research` 제안 화면 미확인.** 이 계정은 리액션 기록이 0건이라 제안이 안 뜬다.
     계약 층(`contract.js`, 씨앗)과 렌더 층(`run-ui.sh`, 픽스처)을 각각 덮었고 **픽스처 키 ⊆ 실응답 키**로
     이어 붙였지만, "실데이터가 실제로 화면에 뜬 것"을 본 적은 없다.
  3. **eslint 없음** — 이 프로젝트에 eslint/prettier 가 설치돼 있지 않다(`web/package.json`).
     정적 검사는 vite 빌드 통과가 전부다. `lint: true` 라고 쓰지 않는다.

- [13:44] **QA 하네스 인계**: `/home/brownjeon/.node-local/bjj-backup/task-027/qa/fe/`
  (`README.md`·`run-ui.sh`·`render.js`·`fixtures.js`·`bundle.js`·`contract.js`·`neg-control.sh`)
  - `bash run-ui.sh` → 14 시나리오 **112 / 0**
  - `node contract.js` → 실서버 계약 **55 / 0** (임시 데이터 자동 정리 + 잔여 0 재확인)
  - `bash neg-control.sh` → **결함 13종(A~M) 전부 탐지 / 미탐지 0**, 끝에서 **정상 번들 복구**
  - 🔴 `contract.js` 는 **이미 열린 과제가 있으면 아무것도 하지 않고 중단**한다(사용자 과제 보호).

- [13:48] **남은 위험 5건**
  1. 🔴 **이 기능은 지금 실계정에서 아무것도 안 보인다.** `failItemsWithReaction: 0` — task-022 의
     "막힌 리액션" 한 줄이 한 번도 채워진 적이 없다. 리액션 자동 유입은 **사용자가 그 칸을 쓰기 시작해야**
     동작한다. 결함이 아니라 **선행 조건**이지만, 이대로면 사용자는 "만들었는데 아무것도 안 뜬다"고 느낀다.
     → Leader 판단 필요: 빈 구역에 "스파링에서 막힌 리액션을 적으면 여기에 모입니다" 같은 안내를 넣을지.
     현재는 지시 C("제안 없음 → 조용히 아무것도 안 그림")를 그대로 따라 **아무것도 안 그린다.**
  2. **무시는 브라우저 로컬**이라 기기를 바꾸면 되살아난다. 화면이 그 사실을 말하지만 서버 저장은 없다.
  3. **마감 실패는 되돌릴 창구가 없다.** 스파링은 저장됐는데 `close` 가 실패하면 토스트로 알리고 과제는
     열린 채 남는다(값 손실 0). 다만 그날 안에 다시 마감하려면 스파링을 또 저장해야 한다 —
     홈 카드에서 마감하는 길은 만들지 않았다(지시가 3화면 역할을 명시했다).
  4. **`SparEditPage.jsx:147` 의 기존 `new Date().toISOString().slice(0,10)`** — 새 스파링의 기본 날짜다.
     KST 00:00~09:00 에 열면 **하루 전 날짜**가 기본값이 된다(재현 확인: KST 09-08 02:00 → `2026-09-07`).
     🔴 **내 변경이 아니고 이번 범위도 아니라 고치지 않았다.** `coachAnalytics` UTC 건과 같은 계열의 백로그.
  5. `patchTask`(메모 수정)는 API 만 뒀고 **호출하는 화면이 없다.** 메모는 서버가 주면 표시만 한다.

- [13:50] **자체 검증 요약** — `{"taskId":"task-027-b","status":"DONE","risk_level":"LOW",
  "self_check":{"unit_test":true,"lint":"n/a(eslint 미설치)","type_check":"n/a(JS)","build":true,
  "ui_harness":"112/0","contract":"55/0","neg_control":"13/13","regression":"026 111/0 · 025 63/0"}}`

- [14:20] 🔴 **dev-027a 기록이 올라온 뒤 대조해 보완한 것 1건 — 삭제 연쇄가 과제를 데려간다.**
  dev-027a 가 `research_tasks.node_id` FK 를 **CASCADE** 로 두고 세 DELETE 응답에 **`deletedTasks`** 를
  추가했다고 기록했다(계약 문서에는 없던 필드다). 내 화면은 그걸 몰라서 두 곳이 어긋나 있었다:
  1. 노드/버전/프로젝트를 지운 뒤 **과제를 다시 읽지 않아** 홈 카드에 **이미 없는 과제(유령)** 가 남았다.
  2. 삭제 확인 문구가 **"이 노드가 이번 주 과제"라는 사실을 말하지 않았다.** 되돌릴 수 없는 삭제인데
     무엇이 함께 사라지는지 안 말하는 건 이 프로젝트에서 가장 하면 안 되는 종류다.
  → 세 삭제 경로 전부에 `reloadTask()` 추가(`ResearchPage.jsx:447·480·608`), 토스트에 `deletedTasks` 반영,
  확인 문구에 `🔴 이 노드는 지금 이번 주 과제입니다 — 과제와 마감 이력도 함께 사라집니다.` 추가.
  시나리오 `delnode` + 역검증 **결함 N**("지운 뒤 과제를 다시 안 읽는다")을 함께 넣어 검사가 실제로
  FAIL 로 바뀌는 것을 확인했다.
  ⚠️ **계약 문서만 보고 만들었으면 놓쳤을 항목이다** — 지시서의 "계약이 나온 뒤 실서버 응답으로 대조하라"가
  값을 한 지점이라 남긴다.

- [14:25] **최종 수치 (재빌드·재배포 후 전부 재실행)**

  | 검사 | 결과 |
  |---|---|
  | `task-027/qa/fe/run-ui.sh` (**15 시나리오**) | **PASS 117 / FAIL 0** |
  | `task-027/qa/fe/contract.js` (실서버) | **PASS 55 / FAIL 0** |
  | `task-027/qa/fe/neg-control.sh` | **결함 14종(A~N) 탐지 / 미탐지 0** — 전부 기대 문구까지 일치 |
  | task-026 `fe/run-ui.sh` | **111 / 0** |
  | task-025 `fe/run-ui.sh` | **63 / 0** |

  서빙 번들 `index-BpzFBz_l.js` → `index-BOl-svmZ.js` → `index-ByxxfsmG.js` → **`index-CZ_4BamJ.js`**.
  마지막 번들을 직접 내려받아 `이 노드는 지금 이번 주 과제입니다`·`마감 이력도 함께 사라집니다` 등
  신규 문자열이 실제로 들어 있음을 확인했다.

  DB 최종: `QA027 프로젝트/수업/리액션 잔여 전부 0` · `research_projects 0` · `research_tasks 0` ·
  `classes(user3) 29` · `spar_days 17` · `spar_sessions 54` · `technique_mastery 0` · 고아 0 ·
  **`spar_sessions` md5 `7302c7a38da9a1130a8c869349955208`** (dev-026d 기록값과 동일 = 실데이터 무변경).

