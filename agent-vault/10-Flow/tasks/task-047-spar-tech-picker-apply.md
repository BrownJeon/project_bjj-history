---
id: task-047
title: 스파링 기술 선택기 실제 적용 — 카테고리 → 검색+탭 목록, 성공·실패 따로 (task-046 2단계)
status: done
created: 2026-09-22
tags:
  - type/task
  - domain/spar
  - domain/ux
related_tasks:
  - task-046-spar-tech-picker-demo
  - task-045-spar-cause-default-tags
aliases:
  - 기술 선택기 적용
  - 기술 카테고리 반영
---

# task-047 — 스파링 기술 선택기 실제 적용 (task-046 2단계)

## 사용자 결정 (2026-09-22, 데모 검토 후)

> 목록방식은 '검색+탭 목록'방식으로 하고 배치의 경우 '성공,실패 따로'로 처리해주고 실제 화면에 작업 후 푸시까지 진행해줘

- 목록 방식 = **검색 + 탭 목록** (네이티브 셀렉트 모드는 버린다)
- 배치 = **성공·실패 선택기 따로** (지금처럼 두 섹션)
- 답하지 않은 항목은 **데모 동작 그대로**(Leader 판단, 사용자에게 보고함): 카테고리 6개 그대로 · 미정 4개(매트릭스·사지오로·키마스터·밸리다운)는 category 비움 → `미분류`(검색으로만) · 포지션·기타 그룹은 검색 결과 맨 뒤에 `〔포지션·제외〕` 로 보이고 선택 가능(M1) · 자모 부분일치 검색 유지(M2).
- 이전 결정 유지: `+` 는 **"이 기록에만 / 기술트리에도 등록"을 매번 고른다**(기본 선택 없음) · 보류 4종(백 쵸크·암락·다스 쵸크·닌자 쵸크) 트리 등록 차단 · 기존 스파링 기록은 고치지 않는다.

원본 사양·분류표·관장 권고: [[task-046-spar-tech-picker-demo]] (데모 코드 `web/src/pages/DemoTechPickerPage.jsx` — Reviewer 가 분류 상수 `TAXONOMY` 를 user 3 트리 56행과 양방향 대조, `normalize` 서버 일치 확인).

## 설계

### 1. 공용 모듈로 추출 (데모 코드 재사용)
- `web/src/utils/techSearch.js` — 데모의 `normalize`(서버 `techMatch.normalize` 와 동일), 자모 분해·부분일치 검색, 비슷한 이름 판정, `HOLD_NAMES`(보류 4종 — 주석으로 `backend/src/utils/techAliases.js:112-118` 사용자 결정 대기와 연결), 사용 횟수 계산(스파링 성공+실패, 정규화 이름 대조), 동명 중복 제거.
- `web/src/utils/baseOptions.js` — `BASE_CATEGORIES` 를 **새 체계 한 벌**로 교체: `TECH_CATEGORIES = ['서브미션','패스','스윕','컨트롤','탈출','테이크다운']`(스파링 선택지) + 제외 `['포지션','기타']`. 옛 값 호환 맵(`관절기`·`초크`→서브미션, `포지셔닝`→포지션) — 다른 사용자·옛 데이터 표시용. `KEY_TECHNIQUES` 는 더 이상 쓰는 곳이 없으면 삭제. `BASE_TECHNIQUES` 는 수업 드릴 화면이 쓰므로 **유지**.
- `web/src/components/TechPicker.jsx` — 데모 `Picker` 의 **검색+탭 목록 모드만**: 카테고리 줄(6, 3×2) · 검색(전 카테고리, 다른 카테고리엔 이름표, 제외 그룹은 맨 뒤) · 사용 횟수순 5~6개 + 더 보기 · `+` 칸(카드 안 인라인 — 스파링 편집기가 이미 Modal 이라 모달 안 모달 금지, `SparEditPage.jsx:585-587` 주석 참고) · 비슷한 이름 제안(묻기만) · 보류 4종 등록 비활성. props 로 `techniques`(카테고리는 **DB `category` 값**을 읽는다 — 데모의 상수 덮어쓰기 아님), `usage`, 선택값, `onPick(name)`, `onRegister(name, category)`, 색(성공 gold / 실패 red).

### 2. 스파링 화면 — `web/src/pages/SparEditPage.jsx`
- ③ 성공한 기술: `ChipSection baseChips={KEY_TECHNIQUES}` → `TechPicker`(성공). 고른 기술은 지금처럼 칩(× 해제), 트리에 없는 이름은 점선.
- ④ 실패한 기술: 빈도 상위 8개 칩 줄 + 직접 입력 → `TechPicker`(실패). **각 실패 항목의 `FailDetail`(원인 태그·메모, task-045)은 그대로** 아래에 렌더.
- `failTechSuggestions`·`successFreqSuggestions` 와 그 props 삭제(이제 쓰는 곳 없음). 사용 횟수는 `SparEditor` 에서 한 번 계산해 카드들에 내려준다.
- 한 라운드(카드) 안에서 마지막 카테고리 유지.
- `+` → `이 기록에만`: 지금 직접 입력과 동일(`newSuccessItem(name, success)`). `기술트리에도 등록`: `techniquesApi.createTechnique({ name, category })` → `reloadTechniques()` → 항목 추가. 실패 시 토스트, 항목은 추가하지 않음(조용히 성공한 척 금지). 동명 기술이 이미 있으면 서버 동작을 확인해 그 기술을 고르게.
- 성장 포인트의 `ChipSection` 은 **무변경**.
- 기존 기록 편집: 저장된 이름(트리에 없는 옛 철자 포함)이 선택 칩으로 그대로 보여야 한다. 저장 payload 구조(`spar_sessions.success` 항목 `{name, success, causes, reaction}`) **무변경** — destroy+reinsert 경로라 필드가 빠지면 삭제된다(메모리 교훈).

### 3. 기술 관리 화면 — `web/src/pages/TechPlanPage.jsx` `TechEditorModal`(:477~)
- **카테고리 선택 칸 추가**: `미분류`(빈 값) + 6개 + `포지션` + `기타`. 옛 값(관절기 등)이 들어 있으면 그 값도 선택지에 보여 준다(몰래 바꾸지 않음). 미정 4개를 사용자가 여기서 분류할 수 있어야 한다.

### 4. 데모 제거
- `web/src/pages/DemoTechPickerPage.jsx` 삭제, `web/src/main.jsx` 의 import·라우트 2줄 삭제, `web/src/pages/ProfilePage.jsx` 임시 카드 21줄 삭제.

### 5. 기술트리 category 채우기 — 1회성 스크립트 `backend/scripts/task-047-backfill-tech-categories.js`
- 매핑 = task-046 분류표(데모 `TAXONOMY` 와 동일): 서브미션 13이름(앵클락 2행 포함 14행) · 패스 7 · 스윕 5 · 컨트롤 6 · 테이크다운 1 · 포지션 15 · 기타 4(스윕·테이크다운·탈출·가드패스). **미정 4개는 건드리지 않는다.**
- `--user <id>` 필수 · 기본 `--dry-run`(행별 전→후 출력) · `--apply` 는 한 트랜잭션 · 적용 전 대상 행 `id,name,category` 를 `~/.local/share/bjj-backups/task-047-<시각>.json` 에 백업 · `--restore <file>`. 이름 비교는 `techMatch.normalize`(또는 NFC+trim) · 같은 값이면 건너뜀 · user_id 조건 필수.
- 스키마 변경 없음(`techniques.category` varchar(50) 기존 칸).
- 🔴 운영 데이터 쓰기 — **Developer·Reviewer·QA 는 admin(user 1) 픽스처로만 실행.** user 3 적용은 QA PASS 후 Leader 가 dry-run 확인 → apply.

## 역할 배정

| 역할 | 담당 파일 |
|---|---|
| Developer | `web/src/utils/techSearch.js`(신규) · `web/src/components/TechPicker.jsx`(신규) · `web/src/utils/baseOptions.js` · `web/src/pages/SparEditPage.jsx` · `web/src/pages/TechPlanPage.jsx` · `web/src/main.jsx` · `web/src/pages/ProfilePage.jsx` · `web/src/pages/DemoTechPickerPage.jsx`(삭제) · `backend/scripts/task-047-backfill-tech-categories.js`(신규) |
| Reviewer | 읽기 전용 감사 |
| QA | 읽기 전용 + admin 실행 검증 |

🔴 주의
- 개발·운영 같은 DB. 검증은 **admin(user 1)** 로만, user 3 은 SELECT 외 금지. 작업 전 user 1 상태 기록(techniques 1·classes 4·spar_sessions 0) → 끝나면 원복.
- 작업트리의 **권한만 바뀐 파일 6개**(`backend/src/index.js`·`routes/techniques.js`·`services/tags.js`·`web/src/api/techniques.js`·`components/TagManagerModal.jsx`·`pages/TechPlanPage.jsx`) — `TechPlanPage.jsx` 는 이번에 내용을 고친다. 커밋은 Leader 가 `core.fileMode=false` 로 한다. 다른 5개는 건드리지 말 것.
- 운영 pm2 `bjj`·운영 dist 금지. 커밋·푸시 금지(Leader 몫).
- 설계는 검증 대상 — 틀렸으면 반박하고 이력서에 적을 것.

## Reviewer 체크포인트
1. 의도: 검색+탭 목록 / 성공·실패 따로 / `+` 매번 선택 / 보류 4종 / 미정 4 미분류.
2. 저장 경로 무변경: payload 구조·`FailDetail`·기존 기록 편집(옛 철자 이름 선택 칩 유지)·재저장 시 필드 소실 없음.
3. 등록 흐름: 실패 시 항목 미추가+토스트, 동명 처리, `reloadTechniques` 후 목록 반영.
4. 스크립트: user_id 조건, 트랜잭션, 백업·복원, dry-run 기본, 미정 4 미변경, 분류 매핑이 task-046 표와 일치.
5. 데모 흔적 0(파일·라우트·카드), `KEY_TECHNIQUES` 참조 0, `BASE_TECHNIQUES`(드릴) 영향 없음, 기술 관리 화면 카테고리 칸이 옛 값을 몰래 바꾸지 않음.

## QA 체크리스트 (6개 — 직접 실행 출력으로만, 못 하면 "미검증")
1. 빌드 + 스파링 편집 화면(390·360px): 성공·실패 두 섹션에 카테고리 줄 → 목록(사용 횟수순) → 선택 칩 / 검색 띄어쓰기 무시·다른 카테고리 이름표 (스크린샷).
2. 실패 기술 선택 → 그 항목의 원인 태그 패널(task-045 7개) 정상 → 저장 → 재조회 시 성공·실패 항목·원인 id 유지 → 재수정 저장 후에도 유지.
3. `+`: 이 기록에만(트리 무변경 SQL 확인) / 기술트리에도 등록(techniques 에 행+category 생성, 목록에 즉시 보임) / 보류 4종 등록 비활성 / 비슷한 이름 제안.
4. 기존 기록 열기: 트리에 없는 옛 이름(예: 픽스처 `바우앤애로우`)이 선택 칩으로 보이고 그대로 저장됨.
5. 기술 관리 화면: 카테고리 칸 선택·저장·옛 값 표시.
6. 백필 스크립트(admin 픽스처): dry-run 무변경 → apply → 기대 category → restore 원복. 끝으로 픽스처 정리 후 user_id 별 SELECT.

## 진행 기록

(각 역할이 아래에 추가)

### Developer (2026-09-22)

- [18:25] **구현 완료. 커밋·푸시·배포는 안 했다(Leader 몫).** 백필 스크립트는 user 1(admin) 픽스처에만 돌렸고 user 3 에는 dry-run 도 돌리지 않았다.
  - **신규** `web/src/utils/techSearch.js`(159줄): 데모 로직을 옮김. `normalize`:11(서버 techMatch 와 같은 규칙) · `jamo`:28 · `similarity`:66 · `HOLD_NAMES`/`holdOf`:77-83(주석으로 techAliases.js 의 task-020b 보류 4종과 연결) · `buildUsage`:87 · `buildPool`:110(그룹 = **DB category** → `categoryGroup`. 동명 행은 id 가 가장 낮은 것 하나) · `countByCategory`:129 · `searchPool`:143 · `similarTo`:155.
  - **신규** `web/src/components/TechPicker.jsx`(317줄): 데모 `Picker` 에서 "검색 + 탭 목록" 부분만. ① 카테고리 줄(3×2):93 · ② 고른 칩(저장된 이름 그대로 · 점선 = 트리에 없음 · × 는 위치 i 로 뺌):113 · ③ 검색:138 · ④ 사용 횟수순 목록 위 6 + 더 보기 / 검색 결과(다른 카테고리·제외·미분류 이름표):169 · ⑤ `+` 칸(카드 안에서 펼침, 둘 중 기본 선택 없음, 보류 4종이면 등록 버튼이 꺼짐, 등록 중 busy):198 · `register`:72. 셀렉트 모드·하나 모드·비교 스위치·분류안 표는 없다.
  - `web/src/utils/baseOptions.js`: `KEY_TECHNIQUES`·`BASE_CATEGORIES` 삭제. 추가(:32-62): `TECH_CATEGORIES`(6) · `TECH_CATEGORY_DESC` · `EXCLUDED_CATEGORIES`(포지션·기타) · `LEGACY_CATEGORY_MAP`(관절기·초크→서브미션, 포지셔닝→포지션, 표시에만 씀) · `categoryGroup()`. `BASE_TECHNIQUES` 는 그대로 둠(ClassEditPage 드릴에서 씀).
  - `web/src/pages/SparEditPage.jsx`
    - `successFreqSuggestions`·`failTechSuggestions`·옛 실패 칩 줄·실패 직접 입력칸·`customFailTech` 삭제.
    - SparEditor 에서 `techUsage/techPool/techCatCounts` 를 한 번만 계산(:117-121).
    - `updateSessionWith`(:236, 함수형 갱신) · `registerTechnique`(:244) 추가.
    - GrowthSessionCard(:758~):
      - 성공·실패 위치 목록 추가.
      - `toggleTech`/`addTech`/`removeTechAt`(:791-810): 같은 기술인지는 정규화한 이름으로 판단하고, 새 항목은 반드시 `newSuccessItem()` 으로 만든다.
      - ③ 성공 `TechPicker`(:908) · ④ 실패 `TechPicker`(:925) + `FailDetail` 은 그대로(:941~).
    - 바뀌지 않은 것: `buildPayload`·기존값 매핑·`FailDetail`·성장 포인트 `ChipSection`.
  - `web/src/pages/TechPlanPage.jsx`: import 교체(:23-25) · `TechEditorModal` 에 `category` state 추가(:492, 초기값 = 저장된 값 그대로) · submit 에서 `category` 사용 · 카테고리 칸(:519-522) · `CategoryField`(:553~). 칩은 미분류 + 6 + 포지션·기타 이고, 옛 값이 있으면 「관절기 (옛 값)」 칩이 선택된 채 추가된다 + 안내 문구.
    - 🔴 이 파일은 원래 mode 777 로 "권한만 바뀐 6개" 중 하나다. 내용 변경은 이번이 처음이고 mode 는 건드리지 않았다. 나머지 5개는 손대지 않음(`git diff --stat` 0줄).
  - 데모 제거: `web/src/pages/DemoTechPickerPage.jsx` 삭제 · `web/src/main.jsx` import·라우트 2줄 삭제 · `web/src/pages/ProfilePage.jsx` 임시 카드 21줄 삭제. `git diff dd8e477^ -- main.jsx ProfilePage.jsx` = 0줄로, 데모 이전과 글자까지 같다. `KEY_TECHNIQUES`·`BASE_CATEGORIES`·`DemoTechPicker`·`/demo/tech-picker`·옛 suggestions 참조 0건(grep).
  - **신규** `backend/scripts/task-047-backfill-tech-categories.js`(257줄)
    - `ALLOWED`:32 · `TAXONOMY`:36 · `UNDECIDED`:48 · `planBackfill`:89 · `runBackfill`:101 · `loadBackup`:168 · `runRestore`:176 · `main`:223 · 하네스용 export:257(`require.main` 일 때만 실행).
    - 사용법:
      ```
      node <NFS>/backend/scripts/task-047-backfill-tech-categories.js --user 3                      # dry-run
      node <NFS>/backend/scripts/task-047-backfill-tech-categories.js --user 3 --apply              # 적용
      node <NFS>/backend/scripts/task-047-backfill-tech-categories.js --user 3 --restore <file>     # 복원 dry-run
      node <NFS>/backend/scripts/task-047-backfill-tech-categories.js --user 3 --restore <file> --apply   # 복원
      ```
    - `<NFS>` = `/home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning`. NFS 트리에서 돌리면 `backend/.env`·`backend/node_modules` 를 쓴다.
- [18:25] **설계와 달라진 점·해석 (검토 요청)**
  1. TechPicker 는 props 로 `techniques`·`usage` 대신 **`pool`·`catCounts`** 를 받는다. SparEditor 가 한 번만 계산하고(라운드 × 2개 선택기가 각자 다시 계산하지 않게) 결과를 내려준다. 데이터는 같다(DB category + 사용 횟수).
  2. **`updateSessionWith`(함수형 setSessions)를 추가했다.** "기술트리에도 등록"은 서버 응답과 `reloadTechniques` 를 기다린 **뒤에** 항목을 넣는다. 기존 `updateSession` 은 렌더 시점의 `sessions` 를 복사하므로, 기다리는 동안 다른 입력(리액션 등)이 생기면 그걸 덮어쓸 수 있다. 선택기 경로(toggle/add/remove)만 이걸 쓰고, FailDetail·벨트 등 기존 경로는 그대로다.
  3. 같은 기술인지는 **정규화한 이름**으로 본다. 트리의 "니슬라이드"를 눌렀는데 옛 기록에 "니 슬라이드"가 있으면 새로 넣지 않고 그걸 뺀다(목록에서도 선택된 것으로 보임). 저장된 이름은 절대 바꾸지 않는다.
  4. 칩 × 는 **위치(i)로** 뺀다. 같은 이름이 두 번 들어 있는 옛 기록에서 이름으로 찾으면 엉뚱한 것이 빠질 수 있어서다.
  5. 서버 동명 처리(확인함): `POST /api/techniques` 는 `LOWER(name)` 이 같은 행이 있으면 새로 만들지 않고 `{id, existing:true}` 를 돌려준다. **category 는 바꾸지 않는다.** 화면에서는 `+` 가 캐시에 정규화 이름이 같은 게 없을 때만 뜨므로, 이 경로는 캐시가 늦은 경우(다른 기기·탭에서 먼저 등록)에만 탄다. 그때는 그 기술을 고르고 토스트 "이미 기술트리에 있어요 — 그 기술로 골랐어요(카테고리는 그대로)". 등록은 됐는데 목록 새로고침만 실패하면 항목은 넣고 그 사실을 토스트로 알린다. 등록 자체가 실패하면 토스트만 띄우고 항목은 넣지 않으며 `+` 칸도 열어 둔다.
  6. 기술 관리 카테고리 칸은 `<select>` 가 아니라 **칩**이다(사용자가 네이티브 셀렉트를 버렸으니 같은 방식으로 맞춤). 옛 값은 자동으로 바꾸지 않고 추가 칩으로 선택된 채 보여 준다.
  7. 백필 스크립트
     - `--restore` 도 **기본이 dry-run** 이고 `--apply` 를 붙여야 쓴다(쓰기는 전부 `--apply` 로만).
     - 백업에는 전·후 값을 둘 다 적는다. restore 는 지금 값이 "후"와 같은 행만 되돌리고, 그 뒤 사용자가 바꾼 행은 **덮지 않고 목록으로만 보여 준다.**
     - UPDATE 에 `category <=> 옛 값` 조건을 걸었고, 트랜잭션 안에서 `FOR UPDATE` 로 다시 읽은 계획이 처음과 다르면 전체 롤백한다.
     - 백업 파일 이름은 `task-047-<시각>-user<id>.json`(user 를 덧붙임, 권한 600). `--backup-dir` 옵션이 있다.
     - 백업 파일 검사는 DB 에 연결하기 **전에** 한다.
  8. 백필의 허용값 `ALLOWED` 는 웹 상수를 CJS 에서 import 할 수 없어 따로 적었다. 대신 하네스 로직 검사가 "`ALLOWED` = 웹 `TECH_CATEGORIES`+`EXCLUDED_CATEGORIES`"와 "`TAXONOMY` = 데모(dd8e477) TAXONOMY − 미정"을 **글자·순서까지** 확인한다.
  9. 🔴 **배포와 백필의 순서(Leader 판단 필요)**: 새 화면은 DB category 를 읽는다. 백필 전 user 3 의 트리를 옛 값 호환만으로 보면 카테고리 버튼이 **서브미션 4·패스 1(가드패스)·스윕 1·나머지 0** 이다. 백필 후에는 13·7·5·6·0·1 이 된다(로직 검사로 user 3 SELECT 파일을 계산한 값). 지금 운영 코드는 category 를 표시용으로만 읽는다(research subtitle·importSearch·mcp). 그래서 **배포 전에 백필해도 깨지는 곳은 없어 보인다.** 배포와 백필 사이의 빈 목록 구간을 없애려면 백필을 먼저 하거나 배포 직후 바로 하는 편이 낫다.
- [18:25] **검증 — 직접 실행 출력** (하네스 `/home/brownjeon/.node-local/bjj-backup/task-047-20260922-175756/`, 격리 서버 :3147 · chrome :9347 · admin 토큰만. 9345·9343·9335 는 다른 세션이 쓰고 있어 피함. `run-all.sh` 로 전 과정을 한 번 더 돌려서 390·360 둘 다 확인)
  - 작업 전 user 1 = techniques 1(id 59, category 빈 값) · classes 4(49·50·51·162) · 스파링 0 · spar_causes 4(1 그립·2 각도·3 타이밍·4 연결 없음)(`snap-00-before.tsv`). 끝난 뒤 `snap-99-final.tsv` 와 **diff 없음**. user 3 트리 id·name·category 도 작업 전 SELECT 파일과 diff 없음 · user 별 techniques `1:1, 3:56` · spar_sessions `3:69`.
  - 빌드 `✓ built in 1.46s`(하네스 `web/`, 번들 676KB로 데모 삭제 후 689KB 에서 줄어듦). 운영 pm2 `bjj` online·restarts 0·릴리스 `20260922-171719-dd8e4775` 그대로. 운영 dist·:3000 은 건드리지 않음.
  - 로직 `logic/check.js` **24/24 PASS**. 실제 `techSearch.js`·`baseOptions.js`(esbuild 번들)와 스크립트 export 로 검사했다.
    - normalize = 서버 결과(7개 샘플) · ALLOWED = 웹 6+2 · TAXONOMY = 데모 − 미정 · HOLD = 데모 · categoryGroup 11건.
    - user 3(SELECT 파일)에 대한 백필 계획 = **바꿈 51 · 같음 1(시저스 스윕) · 안 건드림 4(미정)**. 옛 값이 바뀌는 9행: 리어네이키드 초크·트라이앵글 쵸크·루프 쵸크 초크→서브미션, 암바 관절기→서브미션, 엑스가드·오픈가드·싯팅 가드 포지셔닝→포지션, **가드패스 패스→기타**, **마운트 기타→컨트롤**.
    - 백필 후 그룹 = 서브미션 13·패스 7·스윕 5·컨트롤 6·테이크다운 1·포지션 15·기타 4·미분류 4.
  - QA ①~⑤ `screen.js`: **390px 61/61 PASS, 360px 61/61 PASS**(`qa-390.log`·`qa-360.log`). 주요 값(got):
    - ①
      - 카테고리 줄(성공·실패 둘 다) `["서브미션 11","패스 3","스윕 2","컨트롤 2","탈출 0","테이크다운 1"]`.
      - 서브미션 목록 `["리어네이키드 초크","기무라*","암바","트라이앵글 쵸크","깃 쵸크","바라토플라타"]` + `더 보기 +5` → 펼치면 11개(앵클락 1번, 옛 값 `힐훅(관절기)` 포함).
      - 고르면 칩이 생기고 카테고리 `서브미션 11*` 가 유지된다.
      - 검색: `니슬 라이드` → `니슬라이드〔패스〕*`(옛 기록 "니 슬라이드"도 선택 표시, `+` 없음) · `가드` → `가드패스〔기타 · 제외〕`,`엑스가드〔포지션 · 제외〕`,`하프가드〔포지션 · 제외〕` · `매트` → `매트릭스〔미분류〕` · `김` → `기무라*`.
      - 검색창 안내문 166px ≤ 칸 256(390)/226(360). 옛 성공·실패 직접 입력칸 0개(성장 포인트 "직접 입력…"만 남음).
    - ②
      - 기존 원인 `트라이앵글 쵸크 [그립,타이밍] "자세를 낮게 깔았음"`·`롱스탭 패스 [모르겠음]` 표시. 새 실패 `암바` → 기본 7칩(그립·세팅·타이밍·고정·압박·대처·연결·마무리·모르겠음), 아무것도 선택 안 됨 → 세팅·마무리 + "프레임에 막힘".
      - 저장 → SQL 라운드1 13항목 `{name,success,causes:[id],reaction}` 이 기대값과 JSON 이 **완전히 같음**. 라운드2 그대로. 벨트·시간·탭 1/2·상대·성장 포인트·메모·positions `[{"name":"하프가드","score":2}]`·position_score 3·outcome `win` 유지.
      - 재조회 → 칩·원인·리액션 그대로.
      - 칩 × 로 성공 1·실패 1 을 빼고 재저장 → 뺀 2개만 빠지고 나머지 원인·리액션·옛 철자는 유지(SQL).
    - ③
      - a `힙범프 스윕` → `+` → 선택지 2개(기본 선택 없음) · "이 기록에만" → 점선 칩, techniques 행 수 그대로(SQL).
      - b 탈출 0 → 빈 목록 안내 → `앵클락 탈출` 등록 → 토스트 "기술트리에 「앵클락 탈출」(탈출) 등록" · 칩(tree) · `탈출 1*` · 목록에 바로 뜸 · SQL category `탈출`.
      - c `다스 초크` → `등록 불가` disabled + 보류 안내, "이 기록에만"은 됨.
      - d `옴플라타` → "혹시 이거예요?" `오모플라타〔서브미션〕` → 누르면 트리 기술로 고름.
      - e POST 를 500 으로 막으면 → 토스트 "기술트리 등록 실패: t047 강제 실패" · 칩 변화 없음 · `+` 칸 열린 채 · DB 행 없음.
      - f 캐시에 없는 동명(SQL 로 먼저 넣은 `t047 숨은기술`, 패스) → 스윕으로 등록 시도 → 새 행 없음, category `패스` 그대로, 그 기술로 고름.
    - ④ 옛 철자 `바우앤애로우`(record 점선)·`롱스탭 패스`(record)·`니 슬라이드`(tree)가 선택 칩으로 보이고, 두 번 저장한 뒤에도 글자 그대로(SQL).
    - ⑤
      - `힐훅(관절기)` 편집 → `관절기 (옛 값)` 칩이 선택된 채 + 안내 "옛 값 「관절기」 — 스파링 화면에선 「서브미션」 목록에 보여요…" → 그냥 저장 → SQL `관절기` 그대로.
      - `매트릭스`: 미분류 → 스윕 → SQL `스윕` → 스파링 스윕 목록에 뜸.
      - 새 기술(기본 미분류) + 컨트롤 → SQL `컨트롤` → 스파링 컨트롤 목록에 뜸.
    - 브라우저 쓰기 요청 = `POST /api/techniques ×4`(등록·실패 흉내·동명·기술 추가) · `PUT /api/classes/:id/spar/:id ×2` · `PUT /api/techniques/:id ×2` — 그 밖에는 없음. 가로 넘침 최대 0px · 페이지 오류 `[]`.
  - QA ⑥ 백필(admin 픽스처 25행 — user 3 의 백필 전 모양 흉내, `run-bf-pre-*.log`·`run-bf-post-*.log`)
    - `--user` 없음·`abc` → exit 2.
    - dry-run → **체크섬 무변경**, "바꿈 21 · 같음 1 · 안 건드림 3(id 59·매트릭스 미정·힐훅 분류표 밖)".
    - `--apply` → 백업 21행(600) → 기대 category 전부 일치 → 다시 돌리면 "바꿀 행 0, 백업도 안 만듦".
    - (화면 검사 뒤) 더블렉을 사용자가 스윕으로 바꾼 것처럼 해 두고 restore dry-run → 체크섬 무변경, 충돌 1행 표시 · 다른 user(999999)로 복원하면 DB 연결 전에 거부(exit 1).
    - restore `--apply` → 20행 복원, 픽스처 값과 일치(더블렉 스윕 유지, 백업 밖인 매트릭스·힐훅 그대로) → 다시 돌리면 "되돌릴 행 없음".
  - 격리 서버 쓰기 SQL 은 전부 user 1 픽스처·검사분이다(테이블: classes·drills·spar_days·spar_sessions·spar_causes·techniques). 정리한 뒤 user 1 은 작업 전과 같다(폭마다 "원복: 동일").
- [18:25] **스크린샷**(각각 Read 로 열어 확인): `…/task-047-20260922-175756/shots/390/` · `…/shots/360/`
  - 파일: `01-editor-existing` · `02-category-list-picked` · `03-search-space-other-category` · `04-fail-causes` · `05a-plus-panel` · `05b-register-toast` · `06-plus-hold` · `07-register-fail` · `08-reopen` · `09-editor-legacy` · `10-editor-choose`.
  - 스크린샷을 보고 고친 것: 옛 값 안내 "「서브미션」로 보여요"(조사가 틀림) → "「서브미션」 목록에 보여요 / 검색으로만 보여요(「포지션 · 제외」)".
- [18:25] **남은 위험·미검증**
  1. 한글 IME 가 글자를 조합하는 도중의 검색, 휴대폰 실기기 모양은 확인하지 못했다(headless CDP `insertText` 로만 확인).
  2. 위 9번(배포·백필 순서)을 정하지 않으면 user 3 은 백필 전까지 목록이 거의 빈 상태로 보인다.
  3. 토스트는 UIContext 가 앞 토스트의 타이머로 지운다(기존 동작). 2초 안에 토스트가 연달아 뜨면 뒤엣것이 일찍 사라질 수 있다.
  4. 동명 중복 행(앵클락 2행)은 id 가 가장 낮은 행의 category 를 쓴다. 두 행을 따로 편집해 값이 달라지면 한쪽만 반영된다.
  5. 검색 결과 개수에 상한이 없다(데모와 같음). 한두 글자만 치면 목록이 길어질 수 있다.
- [18:25] **Reviewer·QA 테스트 환경**: `/home/brownjeon/.node-local/bjj-backup/task-047-20260922-175756/README.md`
  - `./run-all.sh` 하나로 로직 → 빌드 → :3147 → 폭마다 [픽스처 → 백필 pre → 화면 → 백필 post → 정리 → 원복 확인] → 서버 종료까지 돈다(약 4분). 단계별 명령도 README 에 있다.
  - 🔴 admin(user 1) 전용. 백필은 `--user 1` 로만.

### Reviewer (2026-09-22)

**판정: PASS** (Critical 0 · High 0 · Medium 0 · Low 3 — 전부 기존에 알려진/의견 수준, Developer 재작업 불필요)

**읽은 것**: `techSearch.js`(159줄 전체) · `TechPicker.jsx`(317줄 전체) · `SparEditPage.jsx` 전체 diff(+`newSuccessItem`/`buildPayload`/`patchItem` 무변경 구간 직접 확인) · `baseOptions.js` diff · `TechPlanPage.jsx` diff(`TechEditorModal`·`CategoryField`) · `backend/scripts/task-047-backfill-tech-categories.js`(258줄 전체) · `backend/src/routes/techniques.js`(POST/PUT 전체) · `backend/src/utils/techAliases.js:100-118` · `backend/src/routes/research.js`·`services/importSearch.js`·`mcp/tools/query.js` 의 category 참조 3곳 · task-046 이력서(관장 분류표 원문·Reviewer/QA 기록) · 하네스 `README.md`.

**직접 실행한 것**(전부 이번 세션에서 재실행, admin/user 1 범위, 읽기 전용 SELECT + 격리 스크립트):
- `git diff --stat` 로 "권한만 바뀐 6개"(`index.js`·`routes/techniques.js`·`services/tags.js`·`api/techniques.js`·`TagManagerModal.jsx`·`TechPlanPage.jsx`) 전부 `0 insertions/0 deletions`·`old mode 100644 → new mode 100755` 만인지 확인 — `TechPlanPage.jsx` 만 내용 diff 있음(주장과 일치).
- `git diff dd8e477^ -- web/src/main.jsx web/src/pages/ProfilePage.jsx` (작업트리 vs 데모 이전 커밋) → 빈 출력, 데모 이전과 완전 동일 확인. `grep -rn "KEY_TECHNIQUES|BASE_CATEGORIES|DemoTechPicker|demo/tech-picker|successFreqSuggestions|failTechSuggestions|customFailTech"` → 0건.
- `logic/check.js` **독립 재실행 → 24/24 PASS 재현**(하네스 값과 완전 일치: TAXONOMY/ALLOWED/HOLD_NAMES 상수 일치, user 3 트리 대조 "바꿈 51·같음 1·안 건드림 4", 백필 후 그룹 13/7/5/6/0/1/15/4/4, 검색·유사도·보류·사용횟수 케이스 전부 PASS).
- **NFS 원본 백필 스크립트**(하네스 사본이 아니라 `backend/scripts/`)를 실제 `.env`(운영과 같은 DB)로 `node backend/scripts/task-047-backfill-tech-categories.js --user 1` **직접 실행**(dry-run, 쓰기 없음) → "바꿈 0·같음 0·안 건드림 1(id 59 트라이앵글 초크 — 분류표의 '트라이앵글 쵸크'와 다른 철자라 정확히 스킵)" 확인.
- 인자 검증 직접 실행: `--user` 없음 / `abc` / `0` / `-1` / 모르는 플래그(`--wat`) 전부 **exit 2, DB 연결 전에 거부**(정상 인자 없이 `--user 1`만으로도 dry-run 정상).
- `mysql` 직접 SELECT(위 백필 실행 전후 2회)로 `techniques(user_id=1)` 행 수·값 불변(1행, id 59, category 빈 값) 확인 — 스크립트가 실제로 아무것도 쓰지 않았음을 DB에서 재확인.
- `mysql` 직접 SELECT로 techniques(u1)=1·classes(u1)=4·spar_days(u1)=0·spar_causes(u1)=4·spar_sessions(u1)=0·techniques(u3)=56·spar_sessions(u3)=69 — 하네스 `snap-00-before.tsv`/`snap-99-final.tsv`(diff 없음)와 독립적으로 일치 확인.
- `ps aux`·`ss -ltn` 으로 포트 3147/9347 리스너·잔존 프로세스 없음 확인(하네스 정상 종료).

**체크포인트별**
1. **의도 충족 — PASS.** `TechPicker.jsx`는 카테고리 줄(①) → 검색(③) → 사용횟수순 탭 목록(④)의 "검색+탭 목록"만 구현하고(셀렉트 모드·비교 스위치 없음), `SparEditPage.jsx`는 성공(:908 부근)·실패(:925 부근)에 각각 별도 `TechPicker` 인스턴스를 둔다(성공·실패 따로). `+`는 "이 기록에만"(`addRecordOnly`)과 "기술트리에도 등록"(`register`) 둘 다 기본 선택 없이 버튼을 눌러야 실행되고(`TechPicker.jsx:226,255-267`), `onKeyDown`의 Enter는 `exact`가 있으면 그 기술을 고르고 없으면 `openAdd()`로 칸만 열 뿐 등록을 바로 실행하지 않는다(:82-87) — "매번 고른다" 우회 경로 없음. `HOLD_NAMES` 4종은 `holdOf()`가 등록 버튼만 비활성화하고 "이 기록에만"은 그대로 허용(:73,231-236) — 사용자 결정과 일치. 미정 4개(매트릭스 등)는 `TAXONOMY`/`buildMap()`에 없어 `categoryGroup`이 항상 `미분류`로 반환(`baseOptions.js:56-60`).
2. **저장 경로 무변경 — PASS.** `buildPayload`(:278-306)·`newSuccessItem`(:50-53)·`FailDetail`·기존값 매핑(`successTried: (s.success||[]).map(...)`)이 git diff에 전혀 나타나지 않음(무변경 확인). 새 `toggleTech`/`addTech`/`removeTechAt`(:791-810)은 전부 `newSuccessItem()`을 거쳐 항목을 만들고 `onUpdateWith`(함수형 `setSessions`)로 갱신 — "기술트리에도 등록"이 서버 응답을 기다리는 동안 다른 입력이 렌더링돼도 `prev` 기반 갱신이라 유실되지 않음(:794-805). 기존 기록의 옛 철자 이름은 `selected` prop에 `t.name`(저장값 그대로) 전달, `toggleTech`/`addTech`의 동일성 판정만 `normalize()`를 쓰고 저장 이름 자체는 바꾸지 않음.
3. **등록 흐름 — PASS.** 서버 `POST /api/techniques`(`routes/techniques.js:122-154`)는 `LOWER(name)` 동일 행이 있으면 `{id, existing:true}`만 돌려주고 category를 바꾸지 않음(코드 확인) — `registerTechnique`의 "카테고리는 그대로" 토스트 문구와 일치. 등록 실패(`catch`/`res.id==null`)는 토스트만 띄우고 `return null` → `TechPicker.register()`가 `if (!r || !r.name) return`으로 `onAdd` 호출 자체를 건너뛰어 항목 미추가 확인(:76-77). `reloadTechniques()` 실패는 별도 토스트 + 항목은 추가(조용히 실패 은폐 안 함, :263-267). `CacheContext.jsx:50`에서 `reloadTechniques`가 실패 시 실제로 throw하는 구조라 이 try/catch가 실제로 의미 있음.
4. **백필 스크립트 — PASS(직접 실행으로 확인, 위 "직접 실행한 것" 참고).** `user_id` 조건이 SELECT·UPDATE(백필·복원) 전부에 있음(코드 라인 102/143/160/180/206-211). 트랜잭션은 `FOR UPDATE` 재조회 → 계획 비교 → 옛 값 조건(`category <=> ?`) UPDATE → `affectedRows !== 1`이면 즉시 rollback(전체 롤백, :140-159/204-219) — 재실행으로 직접 검증하지는 않았으나(운영 데이터라 변경 행이 없는 상태에서만 실행) 코드 경로 자체는 맞물려 있음을 확인. 백업은 `beginTransaction()` **이전**에 `fs.writeFileSync`(:129-138) — 순서 확인. dry-run 기본(`apply:false` 기본값, `--apply` 없으면 쓰지 않음) 직접 실행으로 재확인. 미정 4개는 `buildMap()`이 `UNDECIDED`에 있는 이름이 매핑에 섞이면 즉시 throw(:60)해 방어적으로도 보장. 분류 매핑은 `logic/check.js` 재실행으로 task-046 확정표(관장 원문, 13/7/5/6/0/1/15/4/4)와 한 줄씩 일치 재확인. `--restore`는 "지금 값이 백필 후 값과 같은 행만" 되돌리고(:187-190) 그 외는 `conflict`로만 보여줌(덮지 않음) — 코드·설계 문서 일치.
5. **데모 흔적·부작용 없음 — PASS.** 위 "직접 실행한 것" grep·diff 결과. `BASE_TECHNIQUES`는 `ClassEditPage.jsx`에서만 계속 참조(수업 드릴 화면 무영향). `TechPlanPage.jsx`의 `CategoryField`는 옛 값이 `CATEGORY_CHOICES`에 없으면 "옛 값" 칩으로 추가해 그 값을 유지한 채로 시작하고(`initial?.category || ''`), 사용자가 다른 칩을 누르기 전에는 그대로 저장됨 — 몰래 변경 없음. `routes/research.js:101`·`services/importSearch.js:184`·`mcp/tools/query.js:245-255` 3곳 모두 `category`를 문자열 그대로 표시만 하고 enum 검증이 없어 새 값 체계로도 깨지지 않음(코드 직접 확인).

**Low(정보성 — 기존에 이미 Developer가 밝힌 한계이거나 의견 수준, 조치 불필요)**
- **L1** — 백필/배포 순서(Developer 진행 기록 "🔴 배포와 백필의 순서" 항목): 코드 결함이 아니라 롤아웃 판단 사항. Developer 분석(표시용 read-only 3곳만 category 참조, enum 검증 없음)을 코드로 재확인했고 동의함 — **Leader가 배포 전/직후 백필 여부만 정하면 됨**, 추가 코드 변경 불필요.
- **L2** — 검색 결과 개수 상한 없음(`techSearch.js:searchPool`), 동명 중복 행(앵클락 2행)은 낮은 id 하나의 category만 반영 — 둘 다 Developer가 "남은 위험"으로 이미 명시했고 데모 단계부터 있던 기존 동작. 신규 결함 아님.
- **L3** — 한글 IME 조합 중 검색 미검증(CDP `insertText`는 완성 글자만 입력) — task-046부터 이어진 테스트 도구의 구조적 한계, 코드 문제 아님. 실기기 확인은 사용자 몫으로 남김.

**QA에게**: high_risk_areas 없음(Critical/High 0건). 이력서 QA 체크리스트 1~6 그대로 진행 가능하되, 특히 **⑥ 백필 스크립트는 admin(user 1) 픽스처로만** — 위에서 재확인했듯 운영 DB에 실제로 쓰기 전 최종 관문이다. `--user` 인자 검증(공백·0·음수·비숫자)이 DB 연결 전에 막히는 것도 이미 확인됐으니 QA는 기능 시나리오(dry-run 표시값·apply·restore)에 집중하면 됨.
**검증 후 정리**: 별도 픽스처를 만들지 않음(모든 검증이 기존 user 1 baseline에서 읽기 전용 SELECT + dry-run이라 상태 변화 없음) — 작업 전후 `mysql` SELECT로 techniques(u1)=1(id 59, category 빈 값)·classes(u1)=4·spar_sessions(u1)=0·spar_causes(u1)=4 동일 확인. 테스트 서버·chrome 프로세스 기동 안 함(포트 3147/9347 그대로 닫힌 상태 유지). 운영 pm2·dist 건드리지 않음.

### QA (2026-09-22)

**판정: PASS** (6/6, 전부 이번 세션 직접 실행. Developer 하네스 `/home/brownjeon/.node-local/bjj-backup/task-047-20260922-175756/` 를 처음부터 끝까지 독립 재실행했고 Developer·Reviewer 로그와 별개로 내 명령 출력만으로 판정)

**시작 전 user 1/3 상태(직접 SELECT)**: `techniques u1=1(id 59)·classes u1=4·spar_sessions u1=0·spar_causes u1=4` / `techniques u3=56·classes u3=33·spar_sessions u3=69·spar_causes u3=8` — 이력서 기재값과 일치.

**직접 실행**: `$H/run-all.sh` 전체 재실행(로직→빌드→서버 :3147→[W=390,360] 픽스처→백필 pre→화면→백필 post→정리→원복 확인, `qa-run-all.log` 로 캡처) + 종료 후 `mysql` 로 재확인 SELECT + `ss`/`ps` 로 잔여 프로세스 확인.
- 로직 `logic/check.js`: **24/24 PASS**.
- 빌드: `✓ built in 1.92s`(하네스 `web/`, 운영 dist 무관).
- 화면 `screen.js`: **W=390 61/61 PASS**, **W=360 61/61 PASS**, 두 폭 다 FAIL 0 · 가로 넘침 0px · 페이지 오류 `[]`(`qa-390.log`/`qa-360.log`, run-all.sh 가 직접 생성).
- 백필 pre: 인자 없음/`abc` → exit 2 · dry-run 체크섬 무변경("바꿈 21·같음 1·안 건드림 3") · apply → 백업 21행(권한 600) 생성 후 기대 category 전부 일치 · 재실행 → "바꿈 0" (`run-bf-pre-390.log`/`-360.log`).
- 백필 post: 사용자가 바꾼 행(더블렉→스윕) 흉내 → restore dry-run 체크섬 무변경 + 충돌 1행은 목록으로만 표시(덮지 않음) · 다른 user(999999) 복원 시도 → DB 연결 전 exit 1 거부 · restore apply → 20행 복원, 픽스처 값과 일치, 재실행 시 "되돌릴 행 없음"(`run-bf-post-390.log`/`-360.log`).
- 종료 후: `원복(W=390): 동일` · `원복(W=360): 동일` · `서버·chrome 종료(3147·9347 닫힘)` — run-all.sh 자체 출력.
- 종료 후 내가 독립적으로 재확인한 `mysql` SELECT: `techniques u1=1(id 59, category 빈 값)·classes u1=4·spar_causes u1=4(그립/각도/타이밍/연결 없음, sort·active 원본과 동일)` · `techniques u3=56·classes u3=33·spar_sessions u3=69·spar_causes u3=8` — 시작 전 값과 완전 동일. `ss -ltn`/`ps aux` 로 3147·9347 리스너·프로세스 없음 확인.

**항목별**
1. **PASS** — `screen.js` [1] 블록: 성공·실패 두 섹션 모두 카테고리 줄(`서브미션 11·패스 3·스윕 2·컨트롤 2·탈출 0·테이크다운 1`, 백필 후 DB category 기준) → 사용 횟수순 목록(위 6 + 더 보기 → 11개) → 선택 칩. 검색 `니슬 라이드`(띄어쓰기 무시) → `니슬라이드〔패스〕*`, `가드` → 제외 그룹에 `〔기타 · 제외〕`/`〔포지션 · 제외〕` 이름표. 스크린샷 새로 찍어 Read 로 직접 확인: `qa-shots/390/01-editor-existing.png`(카테고리 줄+선택 칩+검색창), `qa-shots/390/02-category-list-picked.png`(목록+더 보기+선택 강조), `qa-shots/360/02-category-list-picked.png`(360px, 가로 스크롤 없이 동일 레이아웃).
2. **PASS** — [2] 블록: 새 실패 항목(암바)에 원인 태그 7개(task-045) 패널이 아무것도 선택 안 된 채 뜸 → 2개+리액션 선택 → 저장 → SQL 로 라운드1 13항목 JSON이 기대값과 완전 일치(이름·success·causes id·reaction) → 재조회 시 칩·원인·리액션 그대로 → 칩 2개 뺀 뒤 재저장해도 나머지 원인·리액션·옛 철자 유지. 스크린샷 `qa-shots/390/04-fail-causes.png` 직접 확인(원인 칩 그립/타이밍 선택, 세팅/마무리 선택, 리액션 텍스트 입력됨).
3. **PASS** — [3] 블록: a) "이 기록에만" → 점선 칩 + techniques 행 수 SQL 로 무변경 b) "기술트리에도 등록"(탈출 0→앵클락 탈출 등록) → techniques 에 category='탈출' 행 생성 + 목록 즉시 반영 c) 보류 4종(다스 초크 유사) → 등록 버튼 비활성, "이 기록에만"은 허용 d) 비슷한 이름 제안(옴플라타→오모플라타) e) 강제 500 실패 → 토스트만, DB 행 없음, 칸 유지 f) 캐시에 없는 동명 → 새 행 안 만들고 기존 category 유지해 그 기술로 고름. 스크린샷 `qa-shots/390/05a-plus-panel.png`(두 선택지, 기본 선택 없음, 카테고리 칩) 직접 확인.
4. **PASS** — [4]/재조회 블록: 트리에 없는 옛 이름 `바우앤애로우`(record, 점선)·`니 슬라이드`(정규화로 tree 매칭)·`롱스탭 패스`(record)가 선택 칩으로 그대로 보이고, 저장→재조회→재수정 저장 두 번을 거쳐도 SQL 상 글자 그대로 유지. 스크린샷 `qa-shots/390/08-reopen.png` 직접 확인(재조회 후 칩 목록에 옛 철자 그대로).
5. **PASS** — [5] 블록: 기술 관리 모달 카테고리 칸이 `미분류+6+포지션+기타`에 옛 값(`관절기`)을 "관절기 (옛 값)" 칩으로 추가해 선택된 채 보여줌 → 안 건드리고 저장 → SQL `category='관절기'` 그대로 → 매트릭스(미분류)→스윕 선택·저장 → SQL 반영 + 스파링 화면 스윕 목록에 즉시 노출. 스크린샷 `qa-shots/390/09-editor-legacy.png` 직접 확인(칩 "관절기 (옛 값)" 선택 상태 + 안내 문구 "옛 값 「관절기」 — 스파링 화면에선 「서브미션」 목록에 보여요...").
6. **PASS** — 위 "백필 pre/post" 참고. `--user` 없음/비숫자는 DB 연결 전에 exit 2 · dry-run 은 체크섬 무변경으로 부작용 없음 확인 · apply 후 기대 category 전부 일치 · 재실행 시 바꿀 행 0 · restore 로 원복(충돌 1행은 사용자 값 보존) · 최종 `mysql` SELECT 로 user 1 이 시작 전과 동일함을 재확인(위 "시작 전"/"종료 후" 값 비교).

**스크린샷**: `/home/brownjeon/.node-local/bjj-backup/task-047-20260922-175756/qa-shots/{390,360}/`(이번 세션에 직접 재실행해 새로 생성, Developer 원본 `shots/`는 덮어쓰기 전 별도 백업 후 그대로 복원해 보존— `shots/390`·`shots/360` 11개씩 md5 로 원본과 동일 확인). 그 과정에서 만든 임시 백업 `shots-dev-orig/`는 정리 명령이 세이프티 게이트에 계속 막혀 삭제하지 못하고 남아 있음(내용은 `shots/`와 완전 동일한 중복 파일이라 무해).

**미검증/한계** (Developer 기록과 동일, 이번 세션에서 추가로 좁히지 못함): 한글 IME 조합 중 검색·실기기 확인은 headless CDP 한계로 불가. 토스트 연속 발생 시 타이머 충돌, 검색 결과 개수 무제한, 동명 중복 행(앵클락 2행) 낮은 id 우선 — 전부 Developer가 이미 명시한 기존 동작/의견 수준이며 이번 테스트 범위에서 새로 발견된 결함 아님.

**결론**: Critical/High/Medium/Low 결함 0건. 6개 체크리스트 전부 PASS. Deployer 인계 가능.
- post_deploy_checks 제안: 배포 후 `/spar` 기존 기록 편집 화면(390px 모바일)을 열어 카테고리 줄·검색+탭 목록·`+` 등록 흐름이 실제로 뜨는지, 기술 관리 화면 카테고리 칩이 보이는지 눈으로 확인. **user 3 백필은 QA 범위 밖 — Leader 가 dry-run 확인 후 apply 진행.**

### Leader (2026-09-22)

- [18:41] Developer 보고를 파일로 대조(신규 3·수정 5·데모 삭제, `main.jsx`·`ProfilePage.jsx` 는 `dd8e477^` 와 동일, 옛 상수·데모 참조 0, 테스트 포트 닫힘) → Reviewer **PASS**(Critical·High·Medium 0) → QA(Sonnet) **PASS 6/6** → Leader 재확인(user 1 techniques 1·spar 0 / user 3 techniques 56·spar 69, 포트 3147·9347 닫힘). QA 가 게이트 때문에 못 지운 `shots-dev-orig/` 는 `diff -rq` 로 `shots/` 와 동일함을 확인하고 삭제.
- **user 3 카테고리 백필 적용**: dry-run 결과가 분류표와 일치(바꿈 51 · 같음 1(시저스 스윕) · 미정 4 안 건드림, 분포 서브미션 14·패스 7·스윕 5·컨트롤 6·테이크다운 1·포지션 15·기타 4·빈 값 4) → `--apply` → "51행 커밋, 재조회 전부 일치" → 재실행 바꿈 0.
  - 백업 `~/.local/share/bjj-backups/task-047-20260922-184029-user3.json`(51행, 600)
  - 되돌리기: `node backend/scripts/task-047-backfill-tech-categories.js --user 3 --restore ~/.local/share/bjj-backups/task-047-20260922-184029-user3.json --apply`
- 순서: 백필 먼저 → push(=배포). 운영 중인 옛 코드는 category 를 표시용으로만 읽어(research·importSearch·mcp) 백필이 먼저여도 깨지는 곳 없음(Reviewer L1 확인).

- [18:42] **배포 확인** — push `dd8e477..facefe4` → `RELEASE_RESULT {"status":"ok","release":"20260922-184223-facefe4d","migrated":false}`, pm2 `bjj` online(재시작 0), `/health` 200, 서빙 번들 `index-CnpIw8au.js` 에 새 선택기 문구 있음·데모 문구/라우트 0.

## 최종 요약 (사용자용)

**무엇이 바뀌었나**
- **스파링 기록 화면** — 성공한 기술·실패한 기술 모두 **카테고리(서브미션·패스·스윕·컨트롤·탈출·테이크다운) → 검색 + 탭 목록**으로 고릅니다. 성공·실패는 지금처럼 두 칸 따로. 목록은 내가 많이 쓴 순서, 검색은 띄어쓰기 무시·다른 카테고리까지.
- **`+` 직접 추가** — 목록에 없으면 `+` 를 누르고 "이 기록에만 / 기술트리에도 등록(카테고리 선택)" 중 매번 고릅니다. 비슷한 이름이 있으면 "혹시 이거예요?", 보류 4개(백 쵸크·암락·다스 쵸크·닌자 쵸크)는 등록 불가.
- 실패 기술의 "왜 안 됐나요?" 원인 태그, 성장 포인트, 저장 방식은 **그대로**. 예전 기록에 적힌 이름(트리에 없는 철자 포함)도 그대로 보이고 그대로 저장됩니다.
- **기술 관리 화면** — 기술 편집 창에 **카테고리 칸**이 생겼습니다. 아직 비어 있는 4개(매트릭스·사지오로·키마스터·밸리다운)는 여기서 직접 정해 주세요.
- **기술트리 카테고리** — 관장 분류안대로 51개를 채웠습니다(백업·되돌리기 명령 있음). 데모 화면과 프로필의 임시 버튼은 없앴습니다.

**검증** — Developer → Reviewer PASS → QA(Sonnet) PASS 6/6(직접 실행) → Leader 재확인. 휴대폰 한글 입력 중 검색과 실기기 모양은 이 환경에서 확인할 수 없어 사용자 확인이 필요합니다.
