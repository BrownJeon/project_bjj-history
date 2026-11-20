---
project: bjj-trainning
start_gate_task: 
has_ui: true
tags:
  - type/context
---
# 개선 작업 백로그 (사용자 점검분)

사용자가 구현된 화면·동작을 직접 점검하다 찾은 개선점을 모아 두는 곳이다. **구현 작업과 독립**이며, 초기 구현이 끝난 뒤(`start_gate_task` 완료 후) 별도 작업으로 착수한다.

- 추가·조회·착수는 워크스페이스 스킬 **`/개선작업`** 으로 한다(어느 세션에서든 가능). 첫 줄에 `프로젝트:<이름> [목록|착수|초기화]`, 다음 줄부터 내용을 자유롭게(Shift+Enter 줄바꿈, 목록 줄마다 1건). 스크린샷은 `@경로` 또는 직접 업로드. `/개선작업` 만 입력하면 사용법·예제가 나온다.
- 표 보기: [[improvements.base]] (Obsidian Bases — 상태별·화면별·접수함)
- 구현팀이 찾은 기술부채는 여기가 아니라 [[board]] 의 "정리 backlog" 에 둔다.

## 1. 구현 중 규칙 (착수 전)

- **추가만 한다.** 구현팀(leader 포함)은 이 백로그 항목을 착수하거나 구현 task 에 끼워 넣지 않는다.
- 항목 추가는 `items/` 와 `assets/` 만 건드린다. 코드·task 이력서·칸반은 바꾸지 않는다.
- 구현 중 우연히 같은 문제가 고쳐져도 항목은 그대로 둔다 — 착수 때 재확인해서 `obsolete` 처리한다.

## 2. 항목 형식 (`items/IMP-NNNN-<slug>.md`, 1건 = 1파일)

| 속성 | 값 |
|---|---|
| `imp_id` | `IMP-0001` 부터 증가. 스킬 스크립트가 동시 추가에도 겹치지 않게 발급 |
| `status` | `inbox`(접수) → `triaged`(분류됨) → `planned`(task 배정) → `done` / `dropped`(안 함) / `obsolete`(이미 해결·재현 안 됨) |
| `screen` | 화면 설계 문서의 절 번호 + 이름(예: `§9 회화방`). 모르면 비움 |
| `area` | `ui` · `ux` · `copy`(문구) · `behavior`(동작) · `perf` · `a11y` 중 하나 |
| `priority` | `P1`(먼저) · `P2` · `P3` — 사용자가 말했을 때만. 아니면 비우고 착수 때 정한다 |
| `found_on` | 발견 환경(예: `app 390px`, `web 412px`, `web desktop`) |
| `observed_ref` | 발견 당시 커밋(짧은 해시) — 착수 때 "그 뒤로 바뀌었는지" 판단 기준 |
| `related_task` | 그 화면을 만든 구현 task 위키링크(예: `"[[task-007-talk-voice-web]]"`) |
| `planned_task` | 착수 때 배정된 개선 task 위키링크 |

본문: **현상 / 기대하는 모습 / 근거**(스크린샷은 `assets/IMP-NNNN-<n>.<ext>` 로 복사 후 `![[…]]`) **/ 분류 메모**(착수 때 Leader).
사용자 원문은 "현상" 또는 "기대하는 모습"에 그대로 남긴다(요약으로 뜻을 바꾸지 않는다).

## 3. 착수 절차 (`start_gate_task` 완료 후, `/개선작업 착수`)

1. **재확인(Leader)** — `inbox` 항목을 전부 현재 코드·화면에서 다시 본다. 이미 해결됐거나 재현되지 않으면 `obsolete`, 유효하면 `triaged`. 중복은 하나로 합치고 나머지는 `dropped`(메모에 합친 번호).
2. **우선순위 확정(사용자)** — Leader 가 화면별 분류표(번호·제목·영역·Leader 의견)를 보여 주고 사용자가 `priority`·순서를 정한다.
3. **task 묶기(Leader)** — 화면(또는 영역) 단위로 개선 task 이력서를 만든다(`tasks/task-<번호>-improve-<화면>.md`, 태그 `domain/improvement`). 항목은 `planned` + `planned_task` 링크, task 이력서에는 포함 항목 `[[IMP-NNNN-…]]` 목록.
4. **검증 순환** — 프로젝트 성격에 따라:
   - **화면이 있는 프로젝트(`has_ui: true`)**: **Designer → Developer → Reviewer → QA** (→ 배포 역할이 있으면 Deployer). 화면 개선 task 는 먼저 judge intake 로 데모 수준을 판정받고, full·delta 면 **데모 검토 게이트**(designer 데모 → 사용자 승인 → 구현, 워크스페이스 `docs/demo-review-gate.md`)를 거친다. 현재 화면은 current 로 캡처해 개선안 데모의 "현재 vs 제안" 비교에 쓴다. Designer 가 화면 설계 문서를 먼저 갱신하고 Developer 는 승인된 데모·설계대로 구현한다.
   - **화면이 없는 프로젝트**: Developer → Reviewer → QA.
   - 프로젝트에 judge·codex 체크포인트가 있으면 그대로 적용한다. QA 결함 → Developer 수정 → Reviewer 부터 재순환(워크스페이스 규칙).
5. **마감** — task 완료 시 포함 항목을 `done` 으로 바꾸고 Leader 가 task 최종 요약에 항목별 결과를 적는다.
