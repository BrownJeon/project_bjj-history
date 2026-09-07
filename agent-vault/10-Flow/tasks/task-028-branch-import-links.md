---
project: bjj-trainning
task: task-028
title: 분기 · 가져오기 5곳 · 링크 열기 · 빈 상태 안내
status: done
created: 2026-09-07
tags:
  - type/task
  - domain/research
---
# task-028 — 분기 · 가져오기 5곳 · 링크 열기 · 빈 상태 안내

선행: [[task-026-research-screen]] · [[task-027-reaction-inflow-and-weekly-task]]

## 범위
- A. 빈 상태 안내 — "비었다"와 "아직 재료가 없다"를 구분한다(task-027 지시 정정)
- B. 버전 분기 — 무엇이 복제되는지 알리고 원본은 남는다
- C. 가져오기 5곳(수업기록·기술트리·시뮬레이터·참고영상·영상분석)
- D. 링크 열기 + 끊김 표시

### dev-028a
(백엔드 — 이 절은 dev-028a 가 씁니다)

- [13:05] 착수. baseline 실측 — `research_*` 4테이블 + `research_tasks` + `technique_mastery` **전부 0행**, `techniques` **54행**(user1=1 / user3=53), `classes` 32 · `video_clips` 135 · `gameplans` 2 · `technique_chains` 3 · `long_video_chapters` 23. 토큰 `payload.userId=3` 확인.
- [13:20] **DDL 0건으로 끝났다.** `research_versions.parent_version_id` 는 task-026 이 이미 만들어 뒀고, `link_type` 이 ENUM 이 아니라 `varchar(20)` + 앱 화이트리스트라 링크 종류 4→7종을 **ALTER 없이** 늘렸다. `kind`·`link_type` 을 ENUM 으로 만들지 않은 task-026 의 판단이 여기서 값을 했다.
- [13:35] 🔴 **`chain_steps` 에는 이름 컬럼이 없다**(실측: `id·chain_id·technique_id·step_order·transition_note`). 체인 검색을 `cs.name` 으로 짰으면 SQL 에러로 시끄럽게 죽었겠지만, 그 전에 실측해서 `techniques` LEFT JOIN 으로 갔다. LEFT 인 이유: 기술이 지워진 스텝이 있어도 체인 자체를 결과에서 통째로 떨어뜨리지 않기 위해서다.
- [13:40] 🔴 **가장 조용한 실패를 설계 단계에서 막았다** — `long_video_chapters.title` 은 실측상 `"구간 1 (0:00~3:49)"` 같은 자동 생성 문자열이다. 챕터 **제목만** 검색하면 영상분석 출처는 **에러 없이 언제나 0건**이 된다(HTTP 200, 응답 모양 정상). 그래서 `summary` + **부모 영상 제목**까지 본다. 역검증 결함 6번이 정확히 이 결함을 재현해 검사가 잡는 것을 확인했다.
- [14:00] 🔴 **검사가 틀렸지 코드가 틀린 게 아니었던 건 1건.** 1차 실행에서 "원본 v1 불변" md5 가 FAIL 이었는데, 원인은 앞은 `printf '%s' "$VAR"`(끝 개행 없음) / 뒤는 파이프(끝 개행 있음)로 잰 **하네스 버그**였다. 같은 함수로 통일하니 통과. 자기 코드를 의심하기 전에 검사부터 격리한 것이 맞았다.
- [14:05] 🔴 **역검증이 코드에 대한 사실을 하나 알려줬다: NFD 방어는 세 겹이다.** 결함 3번(NFC 정규화 제거)을 `recallSearch.normQuery` + `makeSnippets` **두 겹만** 없앴더니 결함이 **재현되지 않았다**. 라우트의 `clean()`(toNFC)이 덮고 있었다. 세 겹을 다 없애야 NFD 검색이 0건이 된다 — "어디가 막고 있는가"의 실측 증거다.
- [14:10] 역검증 6/6 — 결함 주입판에서 해당 검사가 전부 FAIL 로 뒤집혔다. 주입 실패 2건(원본 조각 불일치·마커 누락)을 하네스가 **스스로 잡아** "안 심어진 결함으로 통과"를 막았다.
- [14:15] 🔴 **dev-028b 요청 반영 — `target.longVideoId` 를 실었다.** `LINK_TARGETS.chapter.extra` 에 `long_video_id`·`idx`·`start_sec` 를 추가하고 `fields` 매핑으로 `target.{longVideoId, idx, startSec}` 로 내려준다. 값이 없으면 **키를 지어내지 않고 null** — `0` 은 유효한 `idx` 다(실측 첫 챕터가 `idx=0`). 대조군으로 `clip` 링크의 `target.longVideoId` 가 `null` 인 것도 검사에 넣었다(모든 링크에 억지로 붙이지 않는다).
- [14:20] **run-all 115/115 PASS · neg-control 6/6 PASS.** 정리 증명: `research_*` 5테이블 전부 0행, `techniques` **54 복귀**, `technique_mastery` 0, `classes`/`video_clips`/`gameplans`/`technique_chains`/`long_video_chapters` 전부 baseline 그대로. 소스에 NUL 0건(`file` 도 전부 `UTF-8 text`).

**계약 (프론트 정본)**

| 메서드 | 경로 | 응답 요점 |
|---|---|---|
| `POST` | `/api/research/versions/:id/branch` | `{branchedFrom, version, copied:{nodes,links,sourceNodes,sourceLinks,complete,maxDepth,detachedNodeIds,skippedNodeIds}, project}`. 새 버전은 **이미 활성**(뒤이어 PATCH 하지 말 것) |
| `GET` | `/api/research/import-search?q=&source=&limit=` | `{q,qNorm,browse,limit,sources:[{source,label,linkType,total,available,truncated,items[]}],summary}`. `q` 없으면 400 이 아니라 `browse:true` |
| `POST` | `/api/research/nodes/:id/links` | `{linkType, refId?, memo?}` → 링크 1건(끊김 판정 포함) |
| `DELETE` | `/api/research/nodes/:id/links/:linkId` | 링크가 **그 노드의 것인지**까지 확인 |
| `GET` | `/api/research/nodes/:id/links` | `{nodeId, links[], total, brokenCount}`. 링크 = `{id,nodeId,linkType,refId,memo,broken,brokenReason,target}` |

- `link_type` 7종: `clip · class · technique · gameplan · chain · chapter · url`
- `import-search` 항목의 `linkType`·`refId` 를 **그대로** POST 본문에 실으면 연결된다(프론트가 매핑표를 다시 만들지 말 것)
- `nodeView` 에 `brokenLinkCount` 추가 — 노드를 열기 **전에** 끊김을 표시할 수 있다
- 🔴 `GET /projects/:id` 는 **활성 버전**의 노드만 준다(task-026 계약 그대로). 분기 직후 원본 노드를 보려면 버전을 되돌려야 한다

**내가 정한 것 (계약이 정하지 않았음)**
1. 경로를 `POST /versions/:id/branch` 로 뒀다(사양서 §4.6 은 `POST /versions` 였다) — 지시서가 이 형태였고, 원본 버전이 경로에 드러나는 편이 `{parentVersionId}` 를 본문에 숨기는 것보다 낫다.
2. `q` 가 비면 400 이 아니라 **둘러보기**(`browse:true`, 출처별 최신 `limit` 건). 시트를 열자마자 빈 손이 되지 않게.
3. 시뮬레이터를 `gameplan`·`chain` **두 갈래**로 나눠 6갈래를 준다(화면은 5묶음). 링크 대상 테이블이 실제로 둘이라 `link_type` 을 합칠 수 없다.
4. 분기 기본 이름 `"v{원본번호} 분기"`. `name` 을 보내면 그것을 쓴다.
5. `research_tasks` 는 복제하지 않는다 — `UNIQUE(user_id, open_slot)` 위반으로 500 이 나고, 과제는 트리의 일부가 아니라 "지금 무엇을 파고 있나"라는 상태다.
6. 끊김 사유를 `brokenReason` 3종(`missing`·`unknown_type`·`no_ref`)으로 구분해 준다. 대상 삭제와 배선 실수를 화면이 같은 말로 하지 않게.

**남은 위험**
- 🟡 **분기가 노드를 한 건씩 INSERT 한다.** 노드 N개면 쿼리 N+링크 M 건이다(한 트랜잭션). 실측 최대 12노드라 지금은 문제 없지만, 큰 트리에서는 느려진다. 벌크 INSERT 로 바꾸려면 부모 id 치환 때문에 **깊이 단위**로 묶어야 한다.
- 🟡 **끊긴 링크를 청소하는 경로가 없다.** 사용자가 손으로 지워야 한다(지울 수는 있다). 일괄 정리는 백로그.
- 🟡 `techniques` 에 **`앵클락` 중복 2행이 남아 있다** — 이번 작업과 무관한 **기존 데이터**다(`techMatch.js` 주석이 이미 이 중복을 전제하고 `pickLowestId` 로 결정적으로 고른다). 내가 만든 것이 아니고 지우지 않았다.
- 🟢 미실행: 프론트 렌더 확인(dev-028b 소관) · 대용량 트리 성능 측정 · `url` 링크의 주소 형식 검증(memo 자유 텍스트 그대로)

**하네스** `/home/brownjeon/.node-local/bjj-backup/task-028/qa/` — `lib.sh`(공통·pm2 lock·토큰) · `run-all.sh`(115검사) · `neg-control.sh`(결함 6종 주입·복원)


### dev-028b

- [14:20] (dev-028b) 프론트 착수. 실서버 baseline 확인 — `research_*` 전부 0행 · `techniques` 54행 · `technique_mastery` 0행. 토큰 payload.userId=3 확인. 서빙 번들 `index-CZ_4BamJ.js`.
- [14:22] (dev-028b) 실계정 실측: `/api/research/projects` = `{projects:[], warnOverload:false}` — **프로젝트 0개**. `/api/research/task` = `{task:null}`. `/api/holes` = 구멍 4종 + 미연결 13종 · `failItemsWithReaction` 계열 재료 없음. → **A(빈 상태 안내)가 실계정에서 유일하게 보이는 화면**이 맞다.
- [14:35] (dev-028b) 🔴 **dev-028a 에게 요청 — 계약 구멍 1건.** `GET /nodes/:id/links` 의 `target` 이 `{title, subtitle, refId, linkType}` 뿐이라 **`chapter` 링크를 `/study/:id` 로 열 수 없습니다.** `long_video_chapters.id` 만으로는 부모 영상 id 를 알 수 없고, 프론트가 `/api/long-videos` 목록을 받아도 챕터가 들어 있지 않아 N+1 없이는 역추적이 불가능합니다(`routes/longVideos.js:39` 목록 응답에 챕터 없음). `import-search` 는 `meta.longVideoId` 를 주므로 **붙이는 순간에는** 알지만, 새로고침 후 링크 목록에는 남지 않습니다.
  → **요청**: `LINK_TARGETS.chapter` 의 `extra` 에 `long_video_id` 를 실어 `target.longVideoId` 로 내려주세요(가능하면 `idx`·`start_sec` 도). 그 값이 오면 프론트는 `/study/{longVideoId}` 로 엽니다.
  → 그때까지 프론트는 **없는 값을 지어내지 않습니다** — `longVideoId` 가 없으면 그 링크는 "열 수 없음"으로 표시하고 눌러도 아무 일이 없게 둡니다(끊김과 구분되는 별도 문구). 계약이 채워지면 자동으로 열립니다.
- [14:45] (dev-028b) **dev-028a 가 요청을 반영했다** — `LINK_TARGETS.chapter` 에 `fields` 매핑이 생겨 `target.{longVideoId, idx, startSec}` 가 내려온다. 실서버 대조로 확인했고, 저장된 챕터 링크가 `/study/{longVideoId}` 로 열린다. 계약 구멍 해소.
- [14:50] (dev-028b) 🔴 **계약 대조에서 내 문구 하나가 거짓말이었다.** 분기 모달에 "비워 두면 이름 없이 v3 로만 표시됩니다"라고 썼는데, 서버는 빈 이름을 받으면 `v{원본번호} 분기` 를 자동으로 붙인다(`routes/research.js:729`). 화면이 서버가 실제로 할 일과 어긋나면 사용자는 자기가 만든 것을 못 찾는다. `branchPreview` 에 `fromVersionNo` 를 추가해 실제 기본 이름을 그대로 말하게 고치고, 그 일치를 검사에 넣었다(`branchopen`).

**만든 것 (web/src 만 — backend 는 한 줄도 안 건드렸다)**

| 파일 | 줄 | 무엇 |
|---|---|---|
| `web/src/utils/researchLinks.js` | 286 (신규) | 순수 함수 — `displayGroups`(6갈래→**5묶음**) · `normalizeLinks` · `openTargetOf` · `branchPreview` · `linkBodyOf` |
| `web/src/components/ResearchBranchModal.jsx` | 115 (신규) | 분기 확인 — 노드 N·자료 M·**원본은 그대로**·서버 기본 이름 |
| `web/src/components/ResearchImportSheet.jsx` | 246 (신규) | 5개 출처 묶음 검색 · 근거(스니펫) · 이미 붙은 것 표시 |
| `web/src/components/ResearchLinkList.jsx` | 146 (신규) | 붙은 자료 목록 · **끊김 표시** · 열기/지우기 |
| `web/src/utils/weeklyTask.js` | +66 (`suggestionEmpty` L215) | 🔴 A — 빈 상태 **세 이유**를 가르는 순수 함수 |
| `web/src/components/ResearchSuggestions.jsx` | +55 (`EmptyNotice` L136) | 재료 없음 안내 + 스파링 기록으로 가는 길 |
| `web/src/pages/ResearchPage.jsx` | +149 (`doBranch` L504 · `openLink` L539) | 분기 연결 · 링크 열기(ClipDetailModal / ClassDetailModal / `/study/:id`) |
| `web/src/components/ResearchNodeSheet.jsx` | +96 (L149·L357·L470) | 자료 구역 + 가져오기 시트 |
| `web/src/components/ResearchTree.jsx` | +5 (L218) | 노드를 **열기 전에** 보이는 `끊김 N` 배지 |
| `web/src/api/research.js` | +62 (L108·L120·L133·L140) | `branchVersion` · `importSearch` · `addNodeLink` · `removeNodeLink` |

**🔴 A — 지시 정정을 어떻게 지켰나**
"제안 없음 → 조용히 아무것도 안 그림"(task-027)은 실계정에서 **기능이 없는 것과 구분되지 않았다**(`failItemsWithReaction:0`). 그렇다고 "제안 0개" 같은 빈 블록을 그리는 것이 답은 아니다 — 숫자 0은 아무것도 알려 주지 않는다. → **왜 비었는지 + 채우는 길**을 말할 수 있을 때만 그린다. 이유는 세 가지이고 **문구가 전부 다르다**:
① 재료 없음(`empty`/`failItemsWithReaction=0`) → "스파링에 '상대가 어떻게 막았나요?'를 한 줄 적으면 여기로 올라옵니다" + `/calendar` 버튼 ② 붙일 자리 없음(`nodesWithTechnique=0`) → 트리에 기술 연결 노드가 없다 ③ 안 겹침 → 매트에서 막힌 기술과 이 트리의 기술이 다르다. 판정은 순수 함수 하나(`suggestionEmpty`)뿐이라 화면이 조건을 다시 쓰지 않는다.
같은 원칙으로 **노드의 "붙은 자료" 빈 상태**도 "비었다"로 끝내지 않고 다섯 출처를 이름으로 말한다. `ResearchEmptyState`(프로젝트 0개)와 `WeeklyTaskCard`(과제 없음)는 이미 재료 유무를 갈라 말하고 있어(스파링 0건 → "기록하러 가기") 손대지 않았다.

**색 언어 — 확정 규약을 깨지 않았다**
5개 출처를 **색으로 가르지 않았다.** 색으로 가르면 앰버("대처 없는 리액션" 전용, task-026)·중립 점선(미연결)·블루 점선(제안, task-027) 중 최소 둘을 뺏는다. 출처 구분은 **묶음 소제목 + 아이콘 + 출처 이름**(구조)으로 했다. 끊김도 앰버가 아니라 **중립 점선 + 중립 배지**다 — 끊김은 오류가 아니라 미연결과 같은 계열의 **상태**다. `tokens.css` 미수정, 새 색 정의 0건. 하네스가 앰버 침범을 세 곳에서 잰다(`nomaterial`·`links`·역검증 A4).

**함정 대응**
`toISOString()` 0건(날짜는 전부 서버 문자열 그대로) · `/api/techniques/positions` 는 안 건드림 · **409 우회 불필요**(분기·링크는 409를 안 쓴다) · 미매칭/끊김을 집계에서 빼지 않음(`linkSummary` 가 총계와 끊김을 함께 센다) · **NUL 0건**(`grep -rlP '\x00' web/src` = 0).

**검증 (직접 실행)**
- `run-ui.sh` **105 PASS / 0 FAIL** (16 시나리오, 검사 부족 0) — 실제 번들을 jsdom 으로 띄워 화면·클릭·나간 요청 본문까지 실측
- `contract.js` **87 PASS / 0 FAIL** — **실서버**로 계약 대조 + 분기/링크 쓰기 왕복 + 정리
- `neg-control.sh` **잡음 19 / 무력 0** — 결함 19종 주입, 전부 기대 문구까지 일치해 뒤집힘
- 회귀: task-025 **63/0** · task-027 **117/0** · task-026 **109/2**(🔴 아래 "의도된 실패")
- 서빙 번들 `index-N3OKR9NG.js` 를 **직접 내려받아** 새 문구 18종 존재·옛 문구 0건 확인, 로컬 dist 와 md5 일치
- 정리 증명: `research_*` 5테이블 전부 **0행** · `techniques` **54** · `technique_mastery` 0 · `classes` 32 · `video_clips` 135 · `gameplans` 2 · `technique_chains` 3 · `long_video_chapters` 23 (전부 baseline)

**🔴 의도된 실패 2건 (task-026 하네스, 회귀 아님)**
`task-026/qa/fe` `detail` 의 `"+ 분기"가 실제로 disabled` · `"+ 분기" 안내 문구` — task-026 이 **자리표시**로 못 박아 둔 상태를 task-028 B 가 지시받아 바꿨다. 하네스는 손대지 않았다(고치면 진짜 회귀를 가린다). `task-027/qa/fe` `nosuggest` 는 통과하지만 그 주석의 의도("구역 자체를 안 그린다")는 A 로 정정됐다.

**하네스 인계**: `/home/brownjeon/.node-local/bjj-backup/task-028/qa/fe/` — `run-ui.sh` · `contract.js` · `neg-control.sh` · `README.md`(실행법·의도된 실패·정리 정책).

**남은 위험 / 미실행**
- 🔴 **브라우저 육안 확인 미실행** — jsdom 은 레이아웃을 그리지 않는다. 두 겹 모달(노드 시트 위 가져오기 시트)의 **실제 겹침·스크롤**, 5묶음 소제목의 **340px 가독성**, 끊김 점선의 **대비**는 사람이 한 번 봐야 한다.
- 🟡 **Esc 가 두 모달을 함께 닫는다.** `Modal.jsx` 가 화면별로 keydown 을 각자 걸어서, 가져오기 시트에서 Esc 를 누르면 노드 시트까지 닫힌다. 데이터 손실은 없다(닫으면 상세를 다시 읽는다). `Modal.jsx` 는 전 화면 공용이라 손대지 않았다 — 고치려면 전역 스택이 필요하다.
- 🟡 **끊김 상태는 실계정에서 재현되지 않는다.** 대상이 지워져야 생기는데 사용자 데이터를 지울 수 없다. 픽스처 + `contract.js` 가 **내 테스트 노드에** SQL 로 심어 실서버로 확인했다(그 뒤 함께 삭제).
- 🟡 `import-search` 는 화면을 열 때마다 6갈래를 전부 읽는다(실측 44건 반환, 체감 문제 없음). 데이터가 커지면 `?source=` 로 좁히는 것이 다음 수순이다.
- 🟡 **`emptyStores` 분기는 실계정에서 안 밟힌다** — 여섯 저장소가 전부 비어 있지 않다. 픽스처(`importzero`)로만 확인했고, 그 사실을 여기 남긴다.
