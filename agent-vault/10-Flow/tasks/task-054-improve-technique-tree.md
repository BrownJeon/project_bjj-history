---
task_id: task-054
title: 기술트리 목록·상세 개선과 참고영상 백데이터 검토
status: done
phase: completed
waiting: ""
reference_video_followup:
  status: paused
  waiting: user_decision_after_other_work
  procedure_path: "docs/handovers/task-054-reference-video-procedure.md"
roles_involved: [leader, gym-master, judge, designer, developer, reviewer, qa, deployer]
related_tasks:
  - "[[task-009-long-video-study-phase3]]"
  - "[[task-020b-position-merge-and-name-fixes]]"
  - "[[task-035-clip-usage-count]]"
  - "[[task-047-spar-tech-picker-apply]]"
tags:
  - type/task
  - domain/improvement
  - domain/techniques
aliases:
  - 기술트리 사전 확장
  - 기술 설명·연결·챔피언 데이터 검토
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "기존 기술트리/후속21 운영완료 유지. 추가 참고영상 기능·수집은 사용자보류,절차서작성만완료. 다른작업후사용자가실행여부결정"
  last_event_id: exec-054-017
created: 2026-11-08
updated: 2026-11-09
demo_gate:
  required: true
  level: "delta"
  status: "approved"
  version: 1
  repo_path: "docs/demo/task-054-technique-tree-v1.html"
  artifact_url: "http://127.0.0.1:63678/task-054-technique-tree-v1.html"
  content_sha256: "c32e6b4df1b6fc7d8a39be7152e6cd5cc9963699f037929d774ba7ea2e9bb600"
  decided_by: "judge"
  rule_id: "JV-ui_change"
  approved_by: "user"
  approved_at: "2026-11-08T19:58:59+09:00"
  approval_quote: "작업 승인하니 구현작업 진행해줘."
  waived_by: ""
  waived_at: ""
  waiver_quote: ""
  active: true
  approval_source: "codex_contextual"
---

# 기술트리 목록·상세 개선과 챔피언 백데이터 검토

## 실행 도구·절차 이력

| 이벤트 ID | 시각(KST) | 사건 | 이전 → 현재 담당 / 현재 절차 | 범위·남은 일 | 근거 |
|---|---|---|---|---|---|
| exec-054-001 | 2026-11-08 19:10 | start | 없음 → codex / codex_scoped | 3건 함께 접수·조사·설계 준비. 데이터 구조·대상 매칭·레이아웃의 새 판단은 사용자 결정 후 확정. 구현·최종 검증·배포는 Claude 인계 | 본 대화의 3개 요구와 사용자 선택 “개선 백로그 초기화·3건 등록 후 함께 착수 (권고)” |
| exec-054-002 | 2026-11-08 19:27 | scope_confirmed | codex → codex / codex_scoped | 목록은 현재 기술트리에 통합, 상세는 기존 모달 확장의 실제 앱 코드 기반 시안을 준비. 시안 자체의 최종 승인·앱/DB 반영·Claude 인계는 이후 | 사용자 선택 “현재 기술트리에 통합 확장 (권고)”, “현재 상세 모달을 확장하는 시안 (권고)” |
| exec-054-003 | 2026-11-08 19:44 | review_requested | codex → codex / codex_scoped | 실제 React 기반 v1의 소스·시안·브라우저 확인 후 사용자 화면 구성 승인 요청. 구현 인계·운영 DB/배포는 미실행 | 공식 gate review_requested, SHA256 c32e6b4df1b6fc7d8a39be7152e6cd5cc9963699f037929d774ba7ea2e9bb600, 본 대화 native 검토 질문 |
| exec-054-004 | 2026-11-08 20:02 | handoff_requested | codex → codex / codex_scoped | v1 승인과 전후 여러 기술 카드의 목록 표시 요구로 구현·검증 인계 준비. 실제 Claude 수신·담당 전환은 아직 | 사용자 “작업 승인하니 구현작업 진행해줘.” / approve-codex-context 성공 19:58:59 |
| exec-054-005 | 2026-11-08 20:08 | handoff_accepted | codex → claude / claude_standard | 실제 Claude Code Leader가 승인 v1·다중 목록·보존·구현/격리 검증 범위를 수용. 다음 같은 세션에서 구현 실행. 이 시점의 acceptance는 읽기 전용이며 구현·테스트 완료가 아님 | CLI session 6c10309b-e3b7-47ad-81c2-b540b125b7c6, HANDOFF_ACCEPTED, permission_denials=[]; docs/handovers/task-054-claude-receipt.json |
| exec-054-006 | 2026-11-08 (구현 턴) | implementation_executed | claude → claude / claude_standard | 같은 Claude 세션이 실제 구현 지시를 받아 Developer(백엔드·프론트)→Reviewer→QA 실행. 운영 DB apply/DDL·배포·push는 범위 밖 그대로 | 사용자 구현 지시(같은 세션 두 번째 턴), 아래 Leader·Developer·Reviewer·QA 기록 |

| exec-054-007 | 2026-11-08 20:59 | executor_limit | claude → claude / claude_standard (보완 실행 중단) | Claude 추가 턴이 구독 session limit으로 실행 전 종료. Codex의 남은 보완·검증 담당 전환은 사용자 답변 대기. 기존 구현 승인 유지. 독립 준비·조사는 계속 | continuation.stream.jsonl: You've hit your session limit · resets 12:10am (Asia/Seoul), exit1 |

| exec-054-008 | 2026-11-08 21:01 | user_exception_accepted | claude → codex / codex_scoped (남은 구현·검증 예외 승인) | 남은 복원 안전성 보완·재검토·실제 화면 격리 검증을 Codex가 수행. 원래 기능 범위와 운영 DB/배포 보류 유지 | 사용자 답변 “이번 작업의 남은 보완·검증을 Codex에 허용 (권고)” |

| exec-054-009 | 2026-11-08 21:14 | data_preparation_scope | codex → codex / codex_scoped (기존 예외 유지) | 정확/기존별칭28개 재사용·미매칭110개 추가 준비·모호21개 후속 확정을 사용자 선택대로 준비. 운영 DB 반영은 검증 뒤 별도 승인 | 사용자 “28개 재사용·110개 추가 준비·21개 후속 확정 (권고)” |

| exec-054-010 | 2026-11-08 21:51 | code_verified | codex → codex / codex_scoped (승인 예외의 보완·검증 완료) | Reviewer재검토PASS·독립QA49+15PASS·공식C2 done/새지적0·배포후보HEAD+task054만build/CUA PASS. 운영DB/커밋/push/배포는 승인전미실행, 관장분류채택 포함 실제반영검토안 준비 | docs/handovers/task-054-implementation-result.json / operating-plan.md, 본 대화 실제tool 증거 |

| exec-054-011 | 2026-11-08 22:25 | operating_execution_approved | codex → codex / codex_scoped (운영 실행까지 사용자 예외 확대) | 관장분류채택·신규테이블/기술110+연결110·선택커밋/push·웹배포를Codex가실행. 기존60보존·21후속·챔피언구현제외. 자동restore신규기술보존을고지한문맥 | 사용자 “Codex로 DB 반영·커밋/push·웹 배포까지 진행” |

## 목표·승인 범위 (Leader)

- 참고사이트: https://labs.quartz.best/ko-KR/pbb/techniques
- [[IMP-0001-technique-catalog]]: 참고 기술 목록을 추가하고 기존 기술은 그대로 사용한다.
- [[IMP-0002-technique-detail]]: 참고 설명을 관장 에이전트가 재검토하고 같은 문장을 사용하지 않는 설명을 추가한다. 앞뒤 연결 기술과 함께 보는 기술을 상세에 반영한다.
- [[IMP-0003-champion-data-review]]: 기술을 쓰는 챔피언의 공개 동작을 분석하고 백데이터 구성 방법을 검토한다. 실제 기능 구현까지 범위를 확대하지 않는다.
- 사용자는 3건 등록·함께 착수와 개선안 준비를 승인했다. 개별 우선순위 번호는 미지정이다. 앱·DB 변경은 조사 결과 및 시안 확인 이후다.
- 이후 사용자가 **현재 기술트리에 통합 확장**과 **현재 상세 모달 확장의 실제 앱 코드 기반 시안**을 선택했다. 이는 시안 준비 수단·방향의 승인이다. 아직 보지 않은 v1의 승인 또는 생산 앱·DB 반영 승인으로 간주하지 않는다.
- **후속 승인(2026-11-08):** 사용자가 “작업 승인하니 구현작업 진행해줘.”라고 명시했다. 메인이 같은 원문으로 `approve-codex-context`를 실행해 `DEMO_GATE_APPROVED`, v1, 같은 정본 hash, approved_at `2026-11-08T19:58:59+09:00`을 확인했다. 이전의 승인 대기 서술은 과거 상태다. 승인한 기능 코드 구현·필요한 격리 검증을 진행하고 같은 승인을 반복 요청하지 않는다.
- **전후 다중 목록 승인 문맥:** 직전 사용자는 전후 기술이 여러 개일 때 목록 표현을 물었다. 메인은 v1이 한 개씩인 예시임을 밝히고 들어오는 기술 A/B/C → 현재 → 이어지는 기술 D/E의 세로 카드 목록·상세 이동·이전 복귀를 제안했고 그 뒤 위 구현 승인을 받았다. 구현은 특정 이름에 따른 한 개 하드코딩이 아니라 **0·1·N개 배열 렌더링**을 포함한다. 기존 v1 정본은 동결하고 같은 카드 패턴의 반복을 승인 보완 요구로 추적한다.
- 이 구현 승인은 앞서 검토 질문에 구분한 **운영 DB 마이그레이션·데이터 apply·push/webhook 배포의 별도 단계**를 자동 승인한 것으로 확대하지 않는다. 코드·데이터 준비·dry-run·격리 검증을 먼저 완료해 실제 반영 대상을 검토 가능하게 한다. 챔피언은 계속 구조 검토 범위다.
- 개선 백로그는 이번에 초기화했다. 대응하는 단일 초기 구현 task를 특정하지 않아 `start_gate_task`는 비어 있다. `gate=met`은 스크립트의 미지정 처리이며 운영 검증의 증거가 아니다.
- 새 범위·구조·화면·검증 수단의 판단은 실행 전에 사용자에게 선택지·영향을 제시한다. 이미 승인된 조사·접수는 다시 승인받지 않는다.

## 관련 과거 이력 요약 (Leader)

- [[task-009-long-video-study-phase3]]: 사용자별 기술 매칭·명시적 연동. `techMatch.js`와 `techAliases.js`를 기존 기술 식별에 재사용할 수 있으나 fuzzy 결과를 확정 매칭으로 쓰지 않는다.
- [[task-020b-position-merge-and-name-fixes]]: 이름 정리·추가 이력과 별칭. 이름은 영상·스파링 집계의 연결 키이므로 기존 이름을 임의 변경하지 않는다.
- [[task-035-clip-usage-count]]: 기술 상세에 관련 영상의 연습·조회 집계와 스파링 자동 성공 집계가 있다. 새 설명·연결 때문에 이 정보를 잃지 않는다.
- [[task-047-spar-tech-picker-apply]]: 카테고리는 스파링 기술 선택기에 영향을 준다. 과거에는 이름이 모호한 기술을 별도 보류했고 분류 미정 4개가 남았다. 당시 분류·건수를 현재 DB 상태로 단정하지 않는다.

## 현재 구현·직접 확인 (Leader)

- 모델 `backend/src/models/Technique.js`: 개인별 `user_id`, 기존 `id/name/pos/category/tags/links/note/starred` 보유. 설명·챔피언·기술 관계 필드 없음.
- 목록 `GET /api/techniques`는 현재 사용자만 조회한다. 영상은 기술 이름으로 조인한다. `POST`는 동일 사용자의 이름 중복만 검사하며 생성 후 관련 영상 AI 자동 분석을 호출한다. 대량 추가에서 이 부작용을 그대로 실행할지는 승인·설계가 필요하다.
- `web/src/pages/TechPlanPage.jsx`: 기술 탭 및 `TechDetailModal`. 포지션·태그, 개인 메모, 스파링 성공·연습 합계, 관련 영상, 수정·삭제·닫기를 제공한다.
- `TechniqueChain/ChainStep`은 개인의 순서 있는 기술체인이다. 공통 설명용의 방향성 관계 및 함께 보는 관계와 같은 의미로 취급하지 않는다.
- 기존 미커밋 변경이 다수 있다. 현재 조사·기록은 그 변경을 보존하며 기능 소스를 수정하지 않는다.

## 참고사이트 공개 관찰 (Leader)

- 목록 DOM에서 159개: 스탠딩 9, 가드·스윕 44, 가드 패스 21, 포지션·컨트롤 37, 서브미션 48.
- 기술·포지션·일반 개념이 혼재한다. 니컷/니슬라이드 등은 같은 계열의 별도 페이지이므로 무조건 159행 새로 넣는 방식은 기존 기술 보존 요구와 함께 검토해야 한다.
- 기무라 상세에서 들어오는 기술 5개·이어지는 기술 5개와 관련 기술을 확인했다. 4개씩 보이고 펼치면 추가 항목이 나타난다.
- 챔피언 영역은 선수 이름·국가·해당 경기 영상 수·대표 YouTube 링크를 표시한다. 공개 화면에 보이는 수와 앱 내부 전체 수는 다르다. 실제 비공개 DB·집계 기준은 미확인이다.
- 공개 HTML은 서버 렌더링된 콘텐츠를 포함한다. 실제 비공개 API·DB 구조를 확보했다는 의미는 아니다.
- 후속 공개 조사: 목록에 실린 **159개 상세의 공개 HTML**에서 이름·방향/관련 링크만 수집했다(동시 요청 3개, 재시도 없음). 159/159 조회, 알려지지 않은 대상 slug 0, 자기 자신 링크 0. 원문 설명·이미지·영상 본문을 데이터셋에 복사하지 않았다. `improvements/assets/IMP-0002-reference-relations.json`과 로컬 조사 스크립트에 방법·시각·범위가 있다.
- **앞뒤 전환 242건**은 outgoing `(from,to)`와 incoming에서 역산한 쌍이 정확히 일치했다. 자체 구조에서 전환 한 벌로 양쪽 목록을 파생시키는 방식의 근거다. 실제 상대 서비스 내부 테이블을 확인한 것은 아니다.
- **함께 보는 링크 488건** 중 상호 링크 141쌍(282건), 한쪽에만 있는 추천 206건이다. 수행 순서를 뜻하지 않는 관계이지만 **모든 링크를 대칭 복제해도 된다는 뜻은 아니다.** 원본 방향을 보존하고 자체 편집 시 별도 검토하는 안이다. 이 사실은 공개 그래프 일관성 확인이며 연결의 실제 주짓수 성립 조건·전체 설명의 관장 검토 완료가 아니다.

## 결정·미확정 항목

1. **결정 완료:** 현재 개인 기술트리에 통합 확장한다. 별도 전체 사전·내 기술 구분은 선택하지 않았다. 기존 ID·이름·메모·영상·연습 기록은 보존한다.
2. 포지션·일반 개념 포함 범위와 별칭·중복 후보의 확정 매핑.
3. **승인 완료:** 현재 상세 모달 확장의 v1 화면 구성과 전후 여러 기술의 세로 카드 목록 요구로 구현한다. 설명·요약·앞뒤·관련 기술·개인 메모·영상 순서 및 이동·복귀를 유지한다.
4. 챔피언 구조의 권고안 및 데이터 수집·검증·갱신 방식. 이번에는 검토 산출물까지만 준비한다.

## 현재 데이터 대응 조사 (Leader, 2026-11-08)

- Mac에서 직접 DB 접속은 권한 오류였다. 문서에 있는 `home_ubuntu` 접속 경로를 사용해 **현재 운영 릴리스의 설정으로 읽기 전용 트랜잭션**을 실행했고 개인 기술 60행을 확인했다. 조회 컬럼은 `id/name/category`로 한정했다. 메모·훈련 기록·비밀 값은 가져오지 않았다. 서비스 재시작·빌드·환경 변경은 하지 않았다.
- 참고 목록 이름·slug·분류·URL만 `improvements/assets/IMP-0001-reference-index.json`에 보관했다. 원문 설명·이미지를 통째로 복사한 데이터셋이 아니다.
- 현재 60행의 사실 스냅샷: `improvements/assets/IMP-0001-existing-techniques.json`. 반영용 전체 백업이나 수정 승인이 아니다.
- 기존 `backend/src/utils/techMatch.js`의 이름 정규화·별칭 로직을 재사용한 **제안**: exact 24 / alias 4 / fuzzy 0 / none 131. `improvements/assets/IMP-0001-match-proposals.json`은 모두 `review_status: unreviewed`, `import_approved: false`다.
- **미매칭 131은 신규 131이 아니다.** 더블 레그 테이크다운↔더블렉, 델라히바 가드↔델라리바, 트라이팟 스윕↔트라이포드, 스파이더 가드↔스파이더 등 추가 의미 검토가 필요하다. 이 예시는 연결 후보이며 확정 매핑이 아니다.
- 기존 니슬라이드(id 4)와 니컷(id 86)이 모두 있다. 외부가 같은 계열로 다룬다고 기존 두 행을 합치거나 지우지 않는다. 기존 이름을 보존하고 대응표·관계에서 처리하는 안을 검토한다.
- 기존 `POST /api/techniques`의 중복 검사는 이름 기반이므로 표기 차이를 충분히 막지 못한다. 또한 생성 후 영상 자동 분석 부작용이 있어 대량 추가 수단은 별도 검토가 필요하다. 이번에는 실행하지 않았다.

## 목록 확장 선택지 (사용자 A 선택)

| 선택지 | 사용자에게 보이는 결과 | 영향 |
|---|---|---|
| A. 현재 기술트리에 통합 확장 (권고 초안) | 지금 목록에서 기존 기술과 새 기술을 함께 본다. 대응되는 기존 이름·ID·메모·영상·연습 기록은 유지한다 | 현재 요청과 화면 흐름을 유지한다. 추가 기술은 스파링 선택기·관장 검색 등에도 영향을 주므로 분류·별칭·대응표 검토 후 추가한다 |
| B. 전체 기술 사전과 내 기술 구분 | 전체 목록은 공통 사전에서 탐색하고 개인 기술은 별도로 관리한다 | 사전 설명·챔피언 근거 관리에는 유리하지만 목록 구분·등록 흐름·개인 기술과의 연결 구조가 더 필요하다 |

두 안 모두 공개 목록의 포지션·일반 개념을 삭제하거나 특정 별칭을 병합하는 결정은 포함하지 않는다. 출처 분류와 개인 스파링 분류는 같다고 가정하지 않는다.

## 상세화면 검토 방향 (미확정)

- **사용자 결정:** 현재 상세 모달을 확장한 실제 앱 코드 기반 시안을 준비한다. 별도 상세 페이지로 전환하지 않는다. 앱·DB 실제 반영은 시안 확인 이후다.
- 검토할 정보 순서: 기존 이름·포지션·태그 → 관장 검토 설명 → 기존 성공·연습 요약 → 앞뒤 연결 → 함께 보는 기술 → 개인 메모 → 기존 관련 영상 → 기존 수정·삭제·닫기.
- 설명은 새 정보이며 기존 `note`에 덮어쓰지 않는다. 관장 예시처럼 짧은 설명과 펼쳐 보는 핵심 원리·조건·실수·연결을 검토한다.
- 앞뒤 연결은 한 방향 관계의 양쪽 조회로 만들고, 함께 보는 기술은 순서 없는 비교·변형 관계로 구분하는 안이다. 관계에 한 줄 조건을 붙여 모든 상황에서 이어지는 확정 콤비네이션처럼 보이지 않게 한다.
- 공개 그래프에서 함께 보는 추천은 비대칭인 경우가 확인됐다. 따라서 앞뒤 전환의 방향과 학습 추천의 방향을 따로 보존하고 ‘순서 없음’을 ‘모두 양방향’으로 구현하지 않는다. 실제 데이터 반영은 이후 검토 대상이다.
- 현재 앱의 모달·하단 탭·토큰·기존 통계·영상 흐름을 유지한 **실제 앱 코드 기반 읽기 전용 시안**이 승인된 수단이다. 격리 복사본·합성 데이터 경계에서 실행하고 참고사이트를 수작업 HTML로 재구성하는 방식으로 바꾸지 않는다.
- 연결된 기술 열기·이전 상세로 돌아가기·빈 설명·미등록 기술·로딩·실패는 추후 시안에서 결정할 상태다. 챔피언 영역은 이번 3번 검토만으로 구현하지 않는다.

## 챔피언 백데이터 검토 (제안, 구현·스키마 변경 없음)

### 공개 화면에서 알 수 있는 것과 한계

- 공개 HTML에는 기술 slug, 선수 이름·국가, 표시된 영상 수와 대표 링크가 있다. 선수별 공개 목록은 5명으로 잘려 있고 앱을 안내한다. 실제 내부 테이블·API·선정·정렬·집계 기준은 확인하지 못했다.
- 니컷 페이지에서 루카스 레프리 카드의 대표 링크(`3IqCi1GXmOg`)가 기술 영상의 `The Best Knee Cut Pass by Lucas Lepri`와 **같은 URL**이다. 이는 직접 확인한 링크 일치이며 영상 전체를 시청해 분류한 결과는 아니다. 화면에 ‘경기 영상’이라고 적혔다고 실제 경기 사용·성공·빈도 근거로 확정할 수 없다.
- 따라서 reverse engineering 산출물은 **공개 출력에서 추론한 재현 가능한 자체 구조**다. 경쟁 서비스의 비공개 DB를 알아낸 것으로 보고하지 않는다.

### 작은 규모로 시작하는 구조안

| 구성 | 핵심 값 | 목적 |
|---|---|---|
| `athletes` (선수) | 자체 ID, 공개 이름·별칭, 국가 코드, 소개 출처 | 같은 선수의 여러 표기를 한 사람으로 식별 |
| `athlete_techniques` (선수↔기술) | 선수 ID, 안정적인 기술 키, 연결 이유, 검토 상태, 검토자·시각 | 한 선수의 여러 기술·한 기술의 여러 선수를 연결. 기존 개인 기술 이름을 외부 표기로 변경하지 않음 |
| `technique_evidence` (연결 근거) | 위 연결 ID, `competition/instructional/profile`, 출처·영상 URL, 영상 ID, 확인 구간, 알려진 대회·경기·날짜·상대·도복/노기, 주장 유형·검토 상태 | 경기 사용·성공과 강의/소개를 구분. 모르는 값은 비움 |
| 타이틀 근거 (별도 보관안) | 선수 ID, 대회·연도·부문·벨트·체급·순위, 출처·검토 상태 | ‘챔피언’ 호칭의 근거. 기술을 사용했다는 근거와 혼동하지 않음 |

- 간단한 초기 운영은 승인된 선수·기술 연결과 근거를 사람이 관리하는 방식이다. AI는 후보·설명 초안을 보조하고 출처 없는 연결을 확정하지 않는다. 공식 경기 기록·공개 경기 영상·선수의 공식 강의는 서로 다른 근거로 수집하는 안이다.
- 검증 전 출처 주장은 초안 상태로 두고 확인된 근거만 표시하는 안이다. 원본의 수치·순위·라벨을 검증된 결과처럼 복제하지 않는다.
- 같은 영상의 URL 변형과 같은 경기의 재업로드를 구분해야 한다. 영상 건수는 중복 제거한 근거 수로, 경기·사용 횟수는 실제 경기 식별·구간 검토가 된 경우에만 별도 집계하는 안이다. 영상 수를 실력 순위·성공률로 쓰지 않는다.
- 자료가 늘면 대회·경기·영상·기술 관찰을 별도 테이블로 나눌 수 있다. 현재 요청만으로 대형 경기 데이터 수집기를 만들거나 전체 선수 DB를 구축하지 않는다.

### 채택 전 선택할 것

- 이번은 구조 검토이며 선수 기능·운영 데이터·새 테이블 생성은 아직 승인되지 않았다.
- 실제 채택 시 표시 이름을 ‘챔피언’으로 할지 ‘이 기술을 사용하는 선수’로 할지, 타이틀 근거를 어느 수준으로 확인할지, 수동 검토 범위·갱신 주기·추가 출처 범위를 사용자와 정한다.

## 이후 반영·검증 준비 사항 (아직 실행하지 않음)

- 결정된 확장 방식으로 기술 대응표를 완성하고 기존 행 보존/연결/신규/확인 필요를 구분한다. 설명은 예시 2개 이후에도 실제 관장 검토 범위를 추적한다.
- 승인한 화면 방식의 실제 앱 기반 시안을 준비하고 사용자 승인 버전을 인계한다. 현 브라우저는 로그인 화면까지만 접근했으므로 인증된 현재 화면을 확인했다고 보고하지 않는다.
- 구현·스키마 및 데이터 추가가 필요하면 Claude에 인계한다. 운영 데이터 반영용 dry-run·백업·트랜잭션·반복 실행 중복 방지·복원, 기존 ID·이름·메모·영상 연결·사용 집계 보존 검증을 준비한다. DB 마이그레이션 및 배포의 기존 승인 관문은 별도로 유지한다.
- 이번 수행은 조사·기록·관장 예시 검토다. 앱 테스트·기능 QA·외부 Claude 검토·배포·전체 설명 생성 완료로 세지 않는다.

## 실제 앱 기반 시안 v1과 메인 검증

- **정본:** `docs/demo/task-054-technique-tree-v1.html`, SHA256 `c32e6b4df1b6fc7d8a39be7152e6cd5cc9963699f037929d774ba7ea2e9bb600`, 781,030 bytes. 19:44 공식 `check.mjs status --to review_requested --version 1` 성공. 이후 v1은 동결하며 사용자 수정 요청은 새 버전으로 만든다.
- **열기:** http://127.0.0.1:63678/task-054-technique-tree-v1.html . 루프백 서버 PID10533 / exec session33014. 실제 React `Layout/TechPlanPage/Modal/Cache/UI/Auth` 복사본과 합성 기술12개를 사용하며 현재/제안·정상/설명없음/로딩/실패 검토 컨트롤을 제공한다. 기무라·니컷 설명2개만 실제 관장 초안이고 나머지는 설명 미준비 상태다.
- **로컬 재현 자료:** `/Users/brownjeon/.codex/visualizations/2026/11/08/01a1ba5b-a790-7d40-9736-71d169ab396a/task-054-preview/`의 `README.md`, `manifest.json`, `self-review.json`, `bundle-normalization.json`. 실제 소스 재사용, 시안 경계·합성 fixture, 미사용 네트워크 기능 제거, React 식별자의 비밀 탐지 오탐에 대한 AST 정규화를 구분해 기록했다. 보안 검사 도구를 수정하거나 네트워크 호출을 인코딩해 숨기지 않았다.
- 메인이 직접 확인한 원본 5개(`TechPlanPage.jsx`, `Layout.jsx`, `Modal.jsx`, `tokens.css`, `app.css`)는 Designer 복사 기준 hash와 일치해 변경이 없었다. 정본 HTML과 로컬 제공 파일 bytes 일치, 최종 `DEMO_LINT_PASSED`를 재실행해 확인했다. 이것을 전체 141개 파일의 메인 내용 감사로 확대하지 않는다.
- **메인 CUA 직접 실행:** 현재/제안 전환(현재에는 새 설명·관계 없음), 관장 설명 접기/펼치기, 기무라→암바→이전, 니컷→니슬라이드→이전(별도 항목), Esc 닫기, 검색 `니` 유지·목록 카드로 초점 복귀, 2페이지 항목 열고 닫아도 2페이지 유지, 기존 관련영상 상세를 열고 Esc로 기술 상세 복귀, 설명 없음·로딩·실패 텍스트 및 실패 alert를 확인했다.
- 내부 검토 중 모든 설명 항목이 펼쳐져 연결을 밀어내던 시안을 짧은 요약+기본접힘 상세로 보완했다. 기술 이동·이전 시 초점이 BODY로 빠지는 결함을 직접 발견해 Designer가 격리 복사본에서 보완했고, 재실행에서 `activeRole=dialog`, `focusInDialog=true`를 확인했다. 최초 열기·Esc·영상 모달은 기존 Modal 경로를 유지했다.
- **폭 측정:** 360/390/412px에서 document scrollWidth=360/390/412, dialog clientWidth/scrollWidth=358/358·388/388·410/410. 가로 넘침 없음. 자세히 보기 높이44px, 새 관계 버튼 높이64.375px. 임시 viewport를 복원했다. 이는 브라우저 시안 확인이며 Android 실기기 검증이 아니다.
- **격리 경계 확인:** DOM에서 원격 미디어 src 없음. CSP는 `connect-src/frame-src/media-src 'none'`이며 합성 fixture의 쓰기는 거절한다. 네트워크 패킷을 관찰한 검증이나 실제 인증·저장/API/DB 동작 검증으로 세지 않는다.
- **스크린샷·측정:** `/Users/brownjeon/.codex/visualizations/2026/11/08/01a1ba5b-a790-7d40-9736-71d169ab396a/task-054-validation/technique-modal-390.jpg`, `technique-modal-lower-390.jpg`, `viewport-measurements.json`.
- **사용자에게 요청한 승인:** 기술트리 개선 데모 v1의 화면 구성으로 Claude 구현을 인계할지. 운영 DB 마이그레이션·데이터 반영·배포는 이 화면 구성 승인에 포함하지 않았다. 답변 대기이며 승인 기록·Claude 인수·생산 구현 완료로 표시하지 않는다.

## 역할별 지시사항

- 메인/Leader: task 공통 메타데이터·ACTIVE·board·로그, 출처와 선택지 정리. 사용자 승인 전 앱·DB·배포 변경 없음.
- gym-master: 배정받은 이 task와 전달한 공개 출처만 이용해 기술 정의·별칭·방향성 관계·설명 초안과 챔피언 주장 근거의 구분을 검토한다. 코드를 쓰거나 실제 사용자 기록을 수정하지 않는다. 자신의 기록 섹션에만 append한다. 예시 검토와 전체 검토를 구분한다.
- Designer/Developer/Reviewer/QA/Deployer: 아직 배정하지 않았다. 화면 구조·시안 수단 및 데이터 범위 결정 후 적용 절차대로 진행한다. 실제 앱 코드 기반 검토를 별도 재구성 HTML로 임의 전환하지 않는다.

## Leader 기록

- [19:10] 실행 도구 Codex. 공개사이트 브라우저·HTML 및 관련 코드 읽기, 3건 접수·통합 task 생성. 운영 데이터 변경·테스트·배포 없음.
- [19:17] 서버 경유 읽기 전용 조회로 현재 개인 기술 60행 확인. 기존 매칭 로직의 후보28개(exact24/alias4), 미매칭131개를 자료로 보존. 관장 실제 역할이 예시 설명2개와 관계·챔피언 근거 원칙을 검토했다. Leader 하위 역할은 이 task만 읽어 범위·보존·절차를 메시지로 점검했고 파일은 쓰지 않았다. 인증된 운영 UI와 전체159개 상세는 미검증이다.
- [19:17] 사용자에게 두 방향 선택 요청: 현재 기술트리 통합 확장 / 전체 사전·개인 기술 구분, 현재 상세 모달 확장 / 별도 상세 페이지. 이 선택에 의존하는 시안·앱·데이터 변경은 답변 대기. 재승인을 요청한 것은 이미 승인된 3건 접수·조사가 아니라 새 목록·상세 구조 선택이다.
- [19:27] 사용자 A/A 선택 수신 후 시안 준비 재개. 실제 judge intake는 feature/R1·delta·designer, Jev fallback 없음. 운영 데이터 백필은 향후 R2 취급이 필요한 별도 실행 단계이며 현재 시안 판정으로 운영 위험도를 낮추지 않는다. `codex-model-router`는 complexity 2.01 / threshold 1.5에 따라 `gpt-6.1-sol`을 반환했고 그 값을 명시해 Designer를 실제 호출했다. 격리 복사본·합성 데이터의 실제 React 시안만 배정했다. 메인이 gate init(delta/drafting)을 실행했다.
- [19:44] v1의 lint·정본/제공본 hash·선택 원본5개 보존 및 CUA 확인 후 공식 검토 요청 등록. 화면 구성 승인 질문을 native 도구로 보냈다. 생산 앱·DB 반영·실제 관장 CLI·최종 Reviewer/QA·외부 Claude 검토·배포는 미실행이다.
- [20:02] 사용자 구현 승인 원문으로 v1 기계 승인 기록 성공을 확인했다. 전후0/1/N 목록 요구를 인계에 포함하고 Designer에 승인판 구현 가이드를 배정했다. 실제 설치 Claude Code 2.1.288 경로를 확인했으며 task 한정 인수·실행 전달을 준비한다. 읽기 전용 Claude 외부검토 브로커를 구현 실행기로 사용하지 않고, 일반 역할/자동 실행기 자체는 변경하지 않는다. 기존 미커밋 변경 및 병행 task-055를 보존한다.
- [20:08] 실제 Claude Code session 6c10309b-e3b7-47ad-81c2-b540b125b7c6의 read_only_acceptance 응답 HANDOFF_ACCEPTED를 직접 확인했다. provider 결과 성공·permission_denials 없음, 지정 task/인계문/승인판 가이드 읽기·승인 버전·수행 범위와 운영 금기를 명시 수용. 원본 응답은 thread artifact task-054-claude/acceptance.json, 수신 영수증·선택18파일 기준 hash/HEAD는 docs/handovers/task-054-claude-{receipt,selected-snapshot}.json. 현재 담당을 실제 수신 근거로 Claude/claude_standard로 전환했다. 메인은 gate check PASS·activate를 완료했다. 아직 기능 구현·최종 검증·배포가 완료된 것은 아니다.
- [구현 턴 / Claude Leader, session 6c10309b] 실행 도구 Claude Code(Opus 5.5). 설계 확정: 정적 참조 카탈로그(개인정보 없음) + 읽기 전용 서비스 + `GET /api/techniques/:id/reference`(소유 확인), 매칭은 confirmed>exact>alias(fuzzy 제외)·모호하면 연결 안 함·rejected 억제, 확정/거절 링크 테이블은 초안만(DDL 미적용), 일괄 적용 스크립트는 기본 dry-run·트랜잭션·지문 가드·백업/복원·POST/triggerAutoAnalysis 미사용, 프론트는 모달 내 activeId 이동·이전 스택·최신 응답 가드·activeId 변경 시만 초점. 관계 조건은 추론하지 않고 null.
- [구현 턴] 관장 설명 생성: 공개 상세 159쪽을 web-fetch 역할(실제 호출 다수 배치)로 순차 열람해 원문 복사 없이 바꿔 쓴 사실 메모를 `docs/handovers/task-054-source-notes/c0a~c4a.json`(159/159, fetch 실패 0)에 저장. 실제 gym-master 역할 6개 배치가 메모만 근거로 독립 재작성 → `docs/handovers/task-054-descriptions/c0~c4b.json` → Leader가 출처 인덱스 순서로 병합해 `backend/src/data/techniqueReference/descriptions.json`(159개, 이름 불일치 0·누락 0·중복 0). 상태: coach_draft 157 + 기존 관장 초안 유지 2(기무라·니컷). kind: technique 90·position 54·concept 15. 흔한 실수 근거: 출처 1·기존 관장 초안 1·관장 일반 조언 21(UI에 구분 표시)·없음 136. **사용자 검토·승인 전 초안**이며 도장 검증은 아님.
- [구현 턴] 실행 경계: 이 세션은 프로젝트 밖 경로(ext4 `~/.node-local`·`/tmp`·워크스페이스 `.claude/tools`) 접근이 권한상 거부됨(비대화형). 그래서 Vite 빌드·React 렌더·브라우저(360/390/412px·초점) 검증, JSX 파서 검사, judge 도구 실행이 **미실행**이다. 백엔드 `backend/node_modules`(기존)와 Node v25.6.1 내장 테스트로만 검증했다.

## 판단 기록 (judge)

- [2026-11-08 19:25] intake engine=jev → task_type=feature / risk=R1 / developer_model=opus / next=demo_first | demo=delta/designer · actions=prepare_demo,request_demo_approval,assign_developer | overrides=없음 | fallback=- | tokens=1332. 실제 판정 JSON: `/tmp/judge-task-054-intake.out.json`.
- [구현 턴] C1 codex_gate: judge 역할을 실제 호출했으나 판정 도구(`../.claude/tools/jev-judge`, `codex-review.sh limit`)가 프로젝트 밖이라 Bash 권한 거부 → **판정 미실행**(추정 판정 없음). Codex 검토도 미실행. C2: 같은 경계라 호출하지 않음(미실행). 판정 실패는 작업을 막지 않는 규칙에 따라 진행. 사용자 원할 시 권한 있는 세션에서 C1/C2 재판정 가능.
- [2026-11-08 21:01] codex_gate/C1 engine=jev → codex_required=true / mode=adversarial-review / focus=data_integrity / budget_rule=CX-user-requested / codex_switch=on | overrides=CX-user-requested | fallback=- | tokens=922. 실제 판정 JSON: `/tmp/judge-task-054-c1.out.json`.
- [2026-11-08 21:26] codex_gate/C2 engine=jev → codex_required=true / mode=adversarial-review / focus=data_integrity / budget_rule=CX-user-requested / codex_switch=on | overrides=CX-r2-post-review | fallback=- | tokens=989. 실제 판정 JSON: `/tmp/judge-task-054-c2.out.json`.
- [2026-11-08 21:42] codex_gate/C2 engine=jev → codex_required=true / mode=adversarial-review / focus=data_integrity / budget_rule=CX-user-requested / codex_switch=on | overrides=CX-r2-post-review | fallback=- | tokens=998. 실제 재판정 JSON: `/tmp/judge-task-054-c2-rerun.out.json`.

## 관장 기록

- [2026-11-08 / Codex / 사양 검토] 실제 gym-master 역할로 검토했다. 허용된 task와 참고 목록 JSON(159개 이름·slug·출처 분류)을 읽었고 공개 상세 5개(기무라·니컷·니슬라이드·클로즈 가드·델라히바 가드)의 HTML 구조화 설명과 섹션을 직접 확인했다. 웹 열람 도구는 접근 오류였고 공개 HTML 조회로 확인했다. 설명 재생성 초안은 아래 **2개 예시만**이며, 전체 159개 설명 검토·생성 또는 현재 개인 기술과의 매칭 완료가 아니다. 개인 기록·DB·코드는 수정하지 않았다.
- [사전 분류 제안 / 미확정] 항목의 `종류`와 개인 기록용 `카테고리`를 별도로 다루는 안을 권한다. 예를 들어 클로즈드 가드는 포지션, 니컷은 패스, 기무라는 서브미션이고, 가드·스윕·테이크다운·가드 패스·초크·서브미션·엔트리·카운터·풋워크는 개별 수행법보다 상위 개념/행동 묶음에 가까운 후보이다. 일반 개념을 개별 기술과 같은 수준으로 자동 추가하면 사용 횟수와 스파링 선택기의 의미가 섞일 수 있다. 실제 포함 여부와 기존 값 변경은 사용자 결정 사항이다.
- [출처 분류 주의 / 미확정] 참고 목록의 풋 스윕은 `가드·스윕`에 있지만 일반적인 도메인 의미는 스탠딩 테이크다운 계열이고, 덕 언더는 `가드 패스`에 있지만 스탠딩·클린치의 백 진입에도 쓰인다. 게이터 롤은 프론트 헤드락 계열 전환으로도 쓰인다. 따라서 출처의 화면 그룹을 개인 기술의 단일 카테고리로 그대로 대입하지 않는 안을 제안한다. 이 지적은 이름 목록을 보고 한 사양 검토이며 이 3개 상세를 직접 검증한 결과는 아니다.
- [별칭·중복 후보 / 자동 병합 금지] 니컷↔니슬라이드는 일반적으로 같은 패스 계열을 가리키는 강한 별칭 후보다(두 공개 설명은 구분되는 필수 조건을 제시하지 않음). 아메리카나↔키락, 백 컨트롤↔백 마운트, 새들↔허니 홀도 중복/포함 관계 후보이나 도장별 의미 차이를 먼저 확인해야 한다. 다스↔브라보는 도복 라펠 사용 여부 등으로 달라질 수 있고, 플라워↔펜듈럼 스윕은 그립·다리 제어 차이를 가진 변형으로 다룰 수 있다. 니실드↔Z가드, 새들↔인사이드 아시 가라미, 힐훅↔인사이드/아웃사이드 힐훅은 상하위·변형 관계 가능성이 있어 같은 이름처럼 합치지 않는다. 기존 명칭과 ID는 보존하고 외부 slug가 기존 ID를 가리키는 명시적 대응표를 검토한다. 확정·퍼지 매칭은 아직 하지 않았다.
- [표기 후보 / 미확정] 클로즈 가드↔클로즈드 가드, 델라히바↔델라리바, 베림볼로↔베림보로, 초크↔쵸크, 보우앤로우↔보우 앤 애로우는 표기 검토 후보다. 현재 개인 DB를 조회하지 못했으므로 어느 표기가 실제로 존재하는지나 어느 ID를 사용할지는 확정하지 않는다. 특히 `풋락`을 특정 앵클락 하나로, `백 초크`를 리어네이키드 초크 하나로 자동 대응시키지 않는다.
- [관장 설명 초안 1 / 기무라 / 사용자 검토 전] **설명:** 상대 팔을 굽힌 채 손목과 상완의 움직임을 함께 제어하고, 그 고정점을 이용해 어깨에 회전 지렛대를 만드는 관절기예요. **성립 조건:** 손목 그립을 만들 수 있고 상대가 팔꿈치와 몸통을 함께 움직여 빠져나가는 길을 제한할 수 있어야 해요. **핵심 원리:** 손목을 당기는 힘만 키우기보다 팔을 고립시키고 내 몸의 위치를 유지하는 데 초점을 둬요. **흔한 실수:** 손목만 붙잡은 채 상대 어깨와 몸통을 놓쳐 상대가 같이 돌아나가게 되는 거예요. **다음 연결:** 상대가 팔을 빼거나 몸을 돌리는 반응에 따라 암바·스윕·백 진입을 검토할 수 있어요. 이 선택들은 같은 순간에 모두 가능한 것이 아니므로 출발 포지션과 상대 반응을 함께 적어야 해요.
- [관장 설명 초안 2 / 니컷 / 사용자 검토 전] **설명:** 상대의 한쪽 허벅지를 무릎으로 가로질러 지나가면서 다리의 방어선을 통과하는 가드 패스예요. **성립 조건:** 상대 다리 사이에서 지나갈 방향을 만들고, 상대가 옆으로 돌아 무릎 방패를 다시 세우는 움직임에 대응할 상체 제어가 필요해요. **핵심 원리:** 무릎만 움직이는 것이 아니라 골반과 상체의 제어를 함께 유지하고, 마지막에 잡힌 발목까지 빼내야 패스가 끝나요. **흔한 실수:** 상체 공간을 열어 둔 채 무릎만 급하게 빼다가 프레임·니실드에 다시 막히는 거예요. **다음 연결:** 다리가 풀린 뒤 사이드 컨트롤을 안정시키는 연결을 먼저 검토해요. 다른 패스로 방향을 바꾸는 연결은 상대 프레임과 다리 제어 조건을 따로 붙여야 해요. 이것은 대표 원리의 설명 초안이며 모든 니컷 변형의 고정 체크리스트는 아니에요.
- [설명 작성 원칙 제안] 참고문장의 어순·단어만 바꾸지 않고 기술의 목적·성립 조건·제어 원리·대표 실수·조건부 연결을 관장 관점에서 다시 쓴다. 개인 메모와 공통 설명을 별도로 보존한다. 각 설명에는 참조 URL·초안 버전·관장 검토 여부·검토 시각을 추적할 수 있게 하는 안을 권한다. 두 초안은 도메인 검토 예시이며 개인에게 맞는 수행 지시나 원문 전체의 정확성 보증이 아니다.
- [관계 의미 제안] `들어오는 기술`은 현재 노드로 이어질 수 있는 출발 기술/포지션, `이어지는 기술`은 현재 노드에서 갈 수 있는 후속 기술/포지션인 **방향성 전환**이다. `함께 보는 기술`은 같은 계열·비교·변형·대안 학습 관계이며 순서나 실행 가능성을 뜻하지 않는다. 기무라←사이드 컨트롤은 포지션에서 공격으로의 진입이고 기무라→암바는 상대 반응에 따른 공격 전환이므로, 모두를 동일한 수행 단계처럼 표시하면 오해가 생긴다.
- [관계 조건 제안] 방향성 관계에는 가능하면 출발 위치(탑/바텀 포함), 도복/노기, 필요한 그립·상대 반응, 피니시 전/차단 후/자세 안정 후 등 전환 시점, 연결 설명 한 줄, 출처·검토 상태를 둔다. 미확인 값은 비워 두고 AI가 채워 넣지 않는다. 기무라→백 테이크/암바/리스트락이 참고사이트에 있다는 것만으로 모든 포지션에서 연속 수행 가능하다고 승인하지 않는다. 단일 방향 관계에서 incoming과 outgoing을 파생시키고, 관련 관계와 개인 기술체인은 따로 관리하는 안을 제안한다.
- [챔피언 데이터 검토 원칙] 선수의 실제 경기 사용, 경기에서 그 기술로 승리, 그 선수가 보유한 대회 타이틀, 해당 기술 강의 제작은 서로 다른 주장이다. 선수 이름·영상 링크만으로 대표 기술·성공·챔피언 자격을 자동 확정하지 않는다. 참고페이지가 보여 준 순위·영상 수·선수-기술 연결은 `출처 주장`으로 보존할 수 있으나 영상 내용·원 대회 결과를 검토하기 전에는 `검증 완료`로 표시하지 않는 안을 권한다.
- [경기 근거 구조 제안] 선수 식별자·공개 이름·확인된 별칭을 기본 정보로 두고, 선수-기술 연결마다 출처 URL, 실제 시연/경기 사용/성공 등 주장 유형, 영상의 확인 구간, 대회·경기·상대·시기(알려진 경우만), 도복/노기, 검토자·상태·시각을 남기는 안을 검토한다. 타이틀은 별도 근거로 대회·연도·성인/마스터·벨트·체급 등을 확인한다. `영상 5개`가 5경기 또는 5회 성공이라는 뜻인지 현재는 미확인이다. 영상 중복·동일 경기 재업로드를 제거한 집계 단위를 먼저 정하고, 수집량과 기술 빈도/실력 순위를 혼동하지 않아야 한다.
- [검토 범위·출처] 직접 읽은 상세: https://labs.quartz.best/ko-KR/pbb/techniques/kimura · https://labs.quartz.best/ko-KR/pbb/techniques/knee-cut · https://labs.quartz.best/ko-KR/pbb/techniques/knee-slide · https://labs.quartz.best/ko-KR/pbb/techniques/closed-guard · https://labs.quartz.best/ko-KR/pbb/techniques/de-la-riva-guard . 참고 목록은 메인이 수집한 공개 사실 JSON으로 읽었다. 비공개 앱·선수 경기 영상의 실제 장면·선수 타이틀 원문·현재 개인 DB·전체 159개 상세의 정확성은 미검증이며 새 설명 2개와 구조 제안의 사용자 승인은 아직 없다.

- [19:16 / 메인 후속 조사 결과 수신] 메인은 서버 경유 읽기 전용 트랜잭션으로 현재 개인 기술 60개를 조회했다고 전달했다. 니슬라이드(id 4)와 니컷(id 86)이 이미 별도 행으로 존재하므로, 위의 강한 별칭 후보 제안은 **기존 두 행의 자동 병합·삭제·이름 변경 허용이 아니다**. 외부 니컷/니슬라이드가 어느 기존 행에 연결되는지와 설명 공통점·차이의 처리만 사용자 선택지로 제시해야 한다. 델라리바(id 3), 토레안도(id 5), 라쏘(id 6), 스파이더(id 7), 싱글엑스(id 28), k가드(id 34), 키스 오브 드래곤(id 382), 키락(id 383)도 메인이 현재 DB에서 확인했다고 전달한 기존 이름 예다. 앞의 개인 DB 미조회 표기는 본 관장이 직접 DB를 조회하지 않은 범위와 최초 검토 시점의 한계다. 이 후속 사실의 증거 주체는 메인이고 본 관장은 DB·코드를 실행하지 않았다.
- [19:16 / 메인 브라우저 관찰 수신] 메인은 니컷 상세의 루카스 레프리 카드(화면상 경기 영상 6개)가 가리키는 https://www.youtube.com/watch?v=3IqCi1GXmOg 와, 같은 페이지의 기술 영상 `The Best Knee Cut Pass by Lucas Lepri` 링크가 동일함을 직접 확인했다고 전달했다. 따라서 카드의 대표 링크를 실제 경기 장면이라고 단정하지 않는다. 근거 유형을 `competition`(실제 경기 장면 확인), `instructional`(기술 강의), `profile`(선수·타이틀 소개)로 나누고, 출처가 붙인 영상 수와 자체 검증한 경기/사용 횟수는 별도 값으로 취급하는 안을 권한다. 동일 링크 사실만으로 다른 모든 영상도 강의라고 일반화하지 않는다.

- [2026-11-08 / 후속 독립 매칭 검토 / Codex] 허용된 task 및 `IMP-0001-reference-index.json`, `IMP-0001-existing-techniques.json`, `IMP-0001-match-proposals.json`만 읽고 source 159개와 현재 기존 기술 60개의 이름·분류·slug를 대조했다. 도구가 이미 연결한 exact 24개·alias 4개는 재판정하지 않았다. `none` 131개에서 **동일 의미 가능성이 높은 후보 15개, 맥락 확인 후보 4개, 포함 관계로 보류할 2개**를 아래에 정리했다. 나머지 110개는 이 자료만으로 기존 기술과 같은 의미라는 후보를 제시하지 못했으며, 신규 110개로 확정한 것이 아니다. 이 표의 신뢰도는 명칭·도메인 의미에 관한 가설의 강도이며 확정 매칭·사용자 승인·실제 동작 검증을 뜻하지 않는다. 기존 60개 ID·이름·분류와 원본 대응표 JSON은 변경하지 않았다.

| source_name / slug | 기존 id / name 후보 | 근거 | 확신 | 추가 확인 필요 여부 |
|---|---|---|---|---|
| 더블 레그 테이크다운 / `double-leg-takedown` | 30 / 더블렉 | double leg의 국내 축약 표기와 일치하며 기존 분류도 테이크다운 | 높음(가설) | 필요 — 기존 상세가 양다리 테이크다운을 뜻하는지 확인 |
| 델라히바 가드 / `de-la-riva-guard` | 3 / 델라리바 | De La Riva의 히바/리바 음역 차이와 가드 접미사 유무 | 높음(가설) | 필요 — 기존 기본형 의미 확인. 리버스·딥 변형까지 포함하지 않음 |
| 싱글 레그 X 가드 / `single-leg-x-guard` | 28 / 싱글엑스 | SLX를 싱글엑스로 줄여 부르는 관계가 강함 | 높음(가설) | 필요 — 기존 포지션이 SLX 기본형인지 확인 |
| 트라이팟 스윕 / `tripod-sweep` | 2 / 트라이포드 | tripod의 트라이팟/트라이포드 음역 차이이며 기존 분류가 스윕 | 높음(가설) | 필요 — 기존 스윕 동작 확인 |
| 스파이더 가드 / `spider-guard` | 7 / 스파이더 | 가드 접미사를 생략한 관계이며 기존 분류도 포지션 | 높음(가설) | 필요 — 소매와 다리 프레임을 사용하는 가드 의미인지 확인 |
| 토레안도 패스 / `toreando-pass` | 5 / 토레안도 | 패스 접미사를 생략한 관계이며 기존 분류도 패스 | 높음(가설) | 필요 — 기존 토레안도 동작 확인 |
| 롱스텝 / `long-step` | 155 / 롱스탭 | step의 스텝/스탭 음역 차이 | 높음(가설) | 필요 — 기존 롱스탭이 해당 패스인지 확인 |
| 사이드 컨트롤 / `side-control` | 53 / 사이드 | 컨트롤 분류의 사이드는 통상 사이드 컨트롤의 축약 | 높음(가설) | 필요 — 기존 사이드의 정의 확인 |
| 베림볼로 / `berimbolo` | 57 / 베림보로 | 베림볼로/베림보로 음역 차이와 영문 slug | 높음(가설) | 필요 — 기존 동작이 베림볼로인지 확인 |
| 스트레이트 앵클락 / `straight-ankle-lock` | 19 / 앵클락 | 통상 기본 앵클락은 직선형을 가리키는 경우가 많음 | 높음(가설·조건 있음) | **필요** — 기존 값이 직선형인지 확인. 회전형·상위 묶음이면 동일 매칭 금지 |
| 보우앤로우 초크 / `bow-and-arrow-choke` | 83 / 보우 앤 애로우 | source의 영문 slug가 bow-and-arrow이므로 한글은 표기 변형 후보 | 높음(가설) | 필요 — 기존 도복 백 초크의 동작 확인 |
| 루프 초크 / `loop-choke` | 45 / 루프 쵸크 | 초/쵸 음역 표기 차이 | 높음(가설) | 필요 — 기존 도복 루프 초크 의미 확인 |
| 아메리카나 / `americana` | 383 / 키락 | 아메리카나는 통상 키락으로도 불리는 어깨 외회전 관절기 | 높음(가설) | **필요** — 기존 키락 의미 확인. source `key-lock`도 이미 같은 id에 exact 연결되어 있어 두 source를 한 기존 ID에 대응시킬지는 사용자 결정 |
| 칸토 초크 / `canto-choke` | 48 / 칸토 쵸크 | 초/쵸 음역 표기 차이 | 높음(가설) | 필요 — 기존 칸토 초크 동작 확인 |
| 초이바 / `choi-bar` | 35 / 초이(choi) 바 | 한글·영문 병기와 띄어쓰기 차이 | 높음(가설) | 필요 — 기존 Choi bar 동작 확인 |
| 싯업 가드 / `sit-up-guard` | 46 / 싯팅 가드 | 둘 다 앉아 운영하는 가드이지만 싯업은 특정 진입·공격 체계를 뜻할 수 있음 | 중간(맥락 필요) | **필요** — 동일 기본 포지션인지 싯팅 가드 하위 변형인지 기존 설명·그립 확인 |
| 백 컨트롤 / `back-control` | 36 / 백포지션 | 백포지션이 백 컨트롤을 뜻할 가능성이 있으나 훅·그립 조건이 이름에 없음 | 중간(맥락 필요) | **필요** — 기존 백포지션의 범위와 훅·싯벨트 조건 확인 |
| 백 마운트 / `back-mount` | 36 / 백포지션 | 백포지션 계열이지만 source에 백 컨트롤과 별도 항목으로 존재 | 중간(맥락 필요) | **필요** — 별칭인지 훅을 건 하위 포지션인지 확인. 두 source 자동 동일시 금지 |
| 오버 언더 / `over-under` | 55 / 싱글언더 패스 | 한 팔을 다리 아래로 넣는 패스를 싱글언더로 부르는 경우가 있음 | 중간(맥락 필요) | **필요** — 기존 싱글언더가 오버언더인지 다른 언더훅 패스인지 그립·통과 경로 확인 |
| 크로스 칼라 초크 / `cross-collar-choke` | 49 / 깃 쵸크 | 깃 쵸크는 더 넓은 도복 초크 묶음일 수 있음 | 보류(낮음·포함 관계) | **필요** — 교차 양깃 조르기인지 다른 라펠 초크인지 확인 전 동일 매칭 금지 |
| 풋락 / `foot-lock` | 19 / 앵클락 | 풋락은 발·발목 관절기 묶음이고 앵클락은 그 하위 기술일 수 있음 | 보류(낮음·포함 관계) | **필요** — 양쪽 포괄 범위 확인 전 동일 매칭 금지 |

- [후속 검토의 제외·보존 원칙] 버터플라이 가드와 기존 버터플라이 스윕(id 62)은 포지션과 동작이라 같은 기술로 연결하지 않는다. 딥/리버스 델라히바와 기본 델라리바(id 3), 코요테 가드·니실드·Z가드와 하프가드(id 40), 웨이터 스윕과 웨이터 가드(id 44), 플라잉/코요테 암바와 암바(id 42), 스택·압박·스매시 패스와 싱글언더 패스(id 55)도 이름의 상하위·관련 관계만으로 동일 매칭하지 않는다. 키마스터(id 56)·사지오로(id 64)·밸리다운(id 87)·휴고락(id 379)은 현재 이름 자료로 뜻을 확정하지 않았으며 비슷한 문자열에 억지로 연결하지 않는다. 니컷(id 86)과 니슬라이드(id 4)는 현재 두 행과 두 source의 기존 exact 대응을 보존한다. `니어네이키트 쵸크`(id 150)는 오타/별칭 의심만 가능하고 이미 exact 대응된 리어네이키드 초크(id 9)와 병합·삭제하지 않는다.
- [후속 검토의 한계] 이번 추가 작업은 외부 검색·AI CLI·DB 조회·개인 메모·영상·기타 파일 읽기 없이 허용 첨부의 이름·분류·slug만 사용했다. 높은 후보도 실제 동작이 확인되지 않아 승인된 매핑이 아니다. 131개 미매칭은 신규 개수와 같지 않으며 후보 제시 실패도 신규 판정 근거가 아니다. 후보를 채택하더라도 기존 이름·ID를 유지하고 source와 연결하는 방식만 다음 사용자 판단으로 넘긴다.

## Designer 기록

- [19:34] 실행 도구 Codex. 승인된 실제 React 앱 복사본 기반 시안 v1 준비: `docs/demo/task-054-technique-tree-v1.html`. 원본 앱·DB·운영 변경 없음. 격리 복사본은 `/Users/brownjeon/.codex/visualizations/2026/11/08/01a1ba5b-a790-7d40-9736-71d169ab396a/task-054-preview/`, 재사용·시안 변경·fixture 경계는 `manifest.json`, 재현은 `README.md`에 기록. 원본 Layout·Modal·목록·CSS·메모·집계·ClipDetailModal을 재사용하고 설명2개·관계·상태검토 컨트롤만 시안에 추가했다. 니컷/니슬라이드 별도 유지·챔피언 UI 없음. 합성 ID 940001~940012/950001만 사용하고 운영API·원격미디어·DB 쓰기를 차단했다. Vite build 및 `DEMO_LINT_PASSED`; 공용 secret 검사에서 React 긴 내부 property명·일반 token 변수가 오탐해 AST 이름 정규화했고 변환내역을 `bundle-normalization.json`에 공개했다. 게이트나 네트워크 호출 은닉 변경 없음.
- [19:34] 디자인 스킬: page-layout-designer·ui-component-builder·ui-design-reviewer·ui-accessibility-reviewer / 소스 자체 점검 P0 0·P1 0·P2 0, a11y Critical 0·Major 0·Minor 0(변경 영역 코드 검토 한정). 360·390·412px 및 실제 키보드·스크롤 검증은 메인 CUA 대기이며 PASS로 간주하지 않는다. 사용자 데모 승인·생산 구현 가이드·인계는 아직 없다.

- [19:36] 메인 CUA 내부검토 보완 요청에 따라 formal review 전 v1 복사본의 관장 설명을 요약1항목 항상표시 + 나머지4항목 기본접힘 `details/summary`로 보완했다. 관장 원문·기존 모달·메모·성공/연습 요약·영상·관계 이전복귀와 부모 상태 보존 구조는 유지했다. 재빌드 및 `DEMO_LINT_PASSED`, manifest/self-review 갱신. 실제 화면·키보드 재검토는 메인 CUA 대기이며 사용자 승인·생산 구현 반영은 아니다.

- [19:38] 메인 CUA가 기무라→암바→이전복귀에서 이동버튼 unmount 후 activeElement=BODY·activeInsideDialog=false를 직접 확인했다. 격리복사본 TechDetailModal에 activeId 변경 시에만 실행하는 useLayoutEffect를 추가해 기존 aria-labelledby·tabIndex=-1 대화상자에 preventScroll로 초점을 옮기고 모달 내부 스크롤을 상단으로 맞췄다. 원본 Modal·최초열기/닫기/Escape·부모 검색/페이지/스크롤·관련영상 모달 초점 소유는 변경하지 않았다. v1 내부검토 재빌드 및 DEMO_LINT_PASSED, manifest 갱신. Major 포커스 결함 보완의 실제 CUA 재검증은 대기이며 사용자 승인·production QA PASS가 아니다.

- [20:04] 실행 도구 Codex. 메인이 전달한 사용자 “작업 승인하니 구현작업 진행해줘.” 및 DEMO_GATE_APPROVED(v1, 2026-11-08T19:58:59+09:00, sha c32e6b4df1b6fc7d8a39be7152e6cd5cc9963699f037929d774ba7ea2e9bb600)를 근거로 `docs/task-054-technique-tree-implementation.md` 구현 가이드 완성·메인에 인계했다. 사용자의 전후 여러 기술 질문 뒤 세로 다중카드 제안 문맥도 명시하여 incoming/outgoing/related의 0/1/N 배열·출처순서·조건·누락대응·안정 ID 이동·초점·기존통계/영상 보존을 포함했다. 시안의 고정 기술명 조건분기·fixture·AST정규화를 생산 이식하지 않도록 명시했다. 설명/관계의 새 API·DB는 미존재 경계로 구분하고 Designer가 독단 확정하지 않았다. 디자인 스킬: 기존4종 + design-handoff. v1 정본·앱코드·task메타데이터 변경 없음. 실제 Claude CLI 인수·생산 구현·최종검증·전체설명생성·운영 DB 반영·배포 완료로 간주하지 않는다.

## Developer 기록

- [구현 턴 / Developer-A 백엔드·데이터, Claude Code developer 역할] 신규: `backend/scripts/task-054-build-reference-catalog.js`(결정적 빌드·`--check`), `backend/src/data/techniqueReference/catalog.json`(159항목·159 설명, 관계 incoming242/outgoing242/related488, 개인정보 없음), `backend/src/services/techniqueReference.js`, `backend/src/services/techniqueReferenceApply.js`, `backend/scripts/task-054-reference-links-schema.js`(기본 DDL 출력만), `backend/scripts/task-054-reference-apply.js`(기본 오프라인 dry-run), `backend/test/task-054-{reference,reference-apply,route}.test.js`, `agent-vault/10-Flow/improvements/assets/IMP-0001-coach-candidates.json`(21행 pending_user_decision), `IMP-0001-apply-plan-dryrun.{json,md}`. 수정: `backend/src/routes/techniques.js`(+13/−1, `GET /:id/reference`만 추가). 결과: node --test 20/20 통과, catalog --check up to date, dry-run plan_sha `4c6666e7…d354`. DB·서버 기동·DDL·apply 없음.
- [구현 턴 / Developer-B 프론트, Claude Code developer 역할] `web/src/api/techniques.js`(getTechniqueReference), 신규 `web/src/utils/techReferenceModel.js`(+`.test.mjs`), 신규 `web/src/components/TechReferenceSection.jsx`, `web/src/pages/TechPlanPage.jsx`(TechDetailModal 확장 + TechTab onEdit/onDelete 호출부 2줄 — 현재 보는 기술 대상), `web/src/styles/app.css`(.tech-ref-*). 결과: node --test 15/15 통과. Vite 빌드·JSX 파서·브라우저 미실행(권한 경계). Modal.jsx 미변경.

## Reviewer 기록

- [구현 턴 / Reviewer, Claude Code reviewer 역할(Sonnet)] **PASS**, Critical 0·Major 0·Minor 3. 직접 재실행: backend 11/11·8/8·1/1, web 15/15, catalog --check 통과. 프론트-백엔드 응답 계약 코드 대조 불일치 0. JSX 수동 검토(태그·hook·import·토큰) 문제 없음 — 실제 빌드·파서는 미실행. 소유 확인(user_id)·404/400·SQL 바인딩·타 사용자 데이터 미노출 확인. apply 거부 플래그·트랜잭션·지문·보존 diff·restore 범위 확인. 표본 설명이 출처 메모와 일치, 통계·선수 주장 0. Minor: ①요청당 쿼리 4회(링크 테이블 존재 캐시 가능) ②ambiguous일 때 별도 문구 없음 ③restore가 신규 행에 붙은 영상 등 연관 데이터를 보지 않음(운영 적용 전 보강 필요, 이번엔 apply 미실행이라 영향 없음). 데모 게이트 evidence는 감사 범위 밖.

## QA 기록

- [구현 턴 / QA, Claude Code qa 역할(Haiku)] 판정 "✅ 검증 통과"(격리·합성 범위 한정). 직접 실행: backend task-054 테스트 20/20, web 모델 테스트 15/15, schema 스크립트 기본 실행이 DDL만 출력·DB 연결 시도 없음, apply 스크립트 플래그 누락 조합이 DB 접근 전 비영 종료. 엣지 (a)~(j)·보존 diff·늦은 응답 거부는 주로 **기존 테스트 케이스를 근거로 인용**했고 별도 새 픽스처 실행은 확인되지 않음. 결함 0.
- [Leader 판단] QA 보고의 "READY FOR DEPLOYMENT" 문구는 **채택하지 않는다.** Vite 빌드·React 렌더·브라우저(초점·360/390/412px·목록 상태 유지)·실제 서버 응답이 미검증이며, 이는 운영 배포 전 필수 확인이다. 또 QA 보고의 apply 거부 메시지 일부는 플래그 조합 서술과 문구가 어긋나 있어(예: decisions 누락 시 snapshot 메시지 인용) 거부 자체는 확인됐으나 메시지 매핑은 재확인 대상이다.

## 배포·사용자 확인

- 배포 없음. 시안 승인·변경 후 사용자 실기기 확인은 아직 진행하지 않았다.
- [구현 턴] push·webhook 배포·pm2·운영 DB DDL/apply 모두 미실행(범위 밖). 커밋도 하지 않았다(병행 task-051/052/055 미커밋 변경 보존, 파일별 소유권 유지).

## 데모 검토 (demo gate)

> 실행 판정 정본은 frontmatter `demo_gate` 이다. 이 표는 check.mjs 가 함께 기록하는 사람용 이력이다(docs/demo-review-gate.md).

| 버전 | 상태 | 저장소 파일 | Artifact | 사용자 결정 | 일시 |
|---|---|---|---|---|---|
| - | 작성중 | - | - | judge: delta (JV-ui_change) | 11-08 19:26 |
| v1 | 검토요청 | docs/demo/task-054-technique-tree-v1.html | http://127.0.0.1:63678/task-054-technique-tree-v1.html | 사용자 검토 요청 | 11-08 19:44 |
| v1 | 승인 | docs/demo/task-054-technique-tree-v1.html | http://127.0.0.1:63678/task-054-technique-tree-v1.html | "작업 승인하니 구현작업 진행해줘." | 11-08 19:58 |

## 구현 턴 중간 요약 (사용자용, 작업 미완료 — 최종 요약 아님)

### [task-054] 기술 상세에 관장 설명·앞뒤 연결 목록 추가

- **상태:** 🟡 구현·격리 검증 완료 / **사용자 데이터 매핑 결정 필요** + 화면 빌드·브라우저 확인 남음(배포 전 단계)
- **무엇이 바뀌었나:** 기술 상세 창에 ① 관장 설명(요약 + 접힌 자세히 보기) ② 들어오는/이어지는 기술 목록(0·1·여러 개 세로 카드) ③ 함께 보는 기술 목록이 생겼다. 개인 메모는 설명과 분리돼 연결 목록 아래로 옮겨졌다. 목록의 기술을 누르면 같은 창 안에서 그 기술로 넘어가고 "이전 기술로 돌아가기"로 되돌아온다. 내 기술과 아직 연결되지 않은 항목은 "연결할 기술 미확인"으로 눌리지 않는다.
- **관장 설명:** 참고 사이트 159개 항목 전부 새로 작성(기존 초안 2개 유지 + 157개 신규 초안). 모두 "관장 초안" 표시이고, 출처에 없던 실수 조언 21개는 "관장 일반 조언"으로 구분된다. 사용자 검토 전 초안이다.
- **배포:** 미배포 — 화면 빌드·브라우저 확인 미실행이고 사용자 결정 대기. 커밋·push 없음.
- **AI가 검증한 것:** 백엔드 테스트 20개·화면 로직 테스트 15개 통과(Developer·Reviewer·QA가 각각 재실행). 응답 형식 앞뒤 일치, 내 기술만 조회(남의 기술 404), 기존 기술·메모 보존 장치, 일괄 추가 스크립트가 기본적으로 아무것도 쓰지 않음.
- **AI가 검증 못 한 것:** 화면 빌드(Vite), 실제 화면 모양·초점·360/390/412px, 실제 서버 응답, judge C1/C2 판정·Codex 검토(이 세션 권한 밖).
- **👉 사용자가 결정할 것:** ① 관장 후보 21개 연결(예: 더블렉·델라리바·토레안도 등) 확정 여부 — `IMP-0001-coach-candidates.json` ② 이름 별칭으로 자동 연결되는 4개(라쏘·엑스가드·탈출·트라이앵글) 그대로 둘지 ③ 내 기술에 없는 항목 중 새로 추가할 것(검토 후보 100개, 개념 10개는 보류 권고) — `IMP-0001-apply-plan-dryrun.md` ④ 확정/거절 연결을 저장할 새 테이블을 운영 DB에 만들지(초안만 있음, 개발·운영 공용 DB라 승인 사항).
- **남은 일:** ext4 작업본에서 `npm run build` + 브라우저 확인(Claude, 권한 있는 세션) → 결정 반영 → (승인 시) 마이그레이션·적용 → 배포.
- **이슈·위험:** 복원 기능이 새로 추가한 기술에 나중에 붙은 영상 기록은 확인하지 않음(실제 적용 전 보강 필요, Reviewer Minor ③). 지금 연결 테이블이 없어 28개 기술만 설명이 보이고 나머지 32개는 연결 결정 후 보인다.


### Leader 후속 보완 준비 — 2026-11-08 20:59 / Codex

- 실제 Claude 추가 실행이 한도 때문에 시작되지 않았다. 사용자에게 남은 보완·재검토·격리 화면 검증만 Codex 수행을 허용할지 질문했다. 기존 기능 승인·운영 DB/배포 미승인 경계는 유지한다. 답변 전 코드 보완·최종 검증을 완료했다고 표시하지 않는다.
- Codex 보조 빌드: 실제 web 소스152파일을 로컬 artifact `task-054-implementation-build`에 hash와 함께 복사, 기존 node_modules 캐시 재사용, Vite5.4.21 build PASS(224modules). 이는 Claude QA 재실행이 아니다.
- 루프백 합성 API fixture 준비: `http://127.0.0.1:63679/_fixture`; 실제 production build와 실제 buildReference 서비스에 합성 user999999·기술160개를 주입한다. DB import/접속 없음, GET 외 요청405. 승인 v1 정본은 수정하지 않았다.
- 추가 코드 감사: restore가 행 필드만 비교하여 이후 생긴 기술 참조를 보존하지 못할 수 있음. 보완·재검토 필요. 백업은0600·비덮어쓰기 원자적 생성 보완 필요. 운영 DB 복원은 실행하지 않았다.
- 이전 Claude 보고의 별칭4건·설명159건 개별 승인 대기는 필수 완료 조건으로 채택하지 않는다. 기존 별칭 재사용·관장 설명 재작성은 이미 승인된 기능 범위다. source159개 중 concept10개 보류는 권고 분류이며 승인된 목록 범위에서 임의 제외하지 않는다. 의미 모호 매칭과 운영 반영 결정은 별도다.

- [2026-11-08 21:01] 위 담당 선택 질문에 사용자 명시 답변 수신. 보완 작업을 Codex worker에 파일3개 범위로 배정, root는 실제 production build 합성 API 화면 검증 진행. Claude가 하지 않은 검증을 Claude 수행으로 기록하지 않는다.

### Leader 후속 검증 — 2026-11-08 21:14 / Codex

- 실제 production web build + 실제 buildReference 서비스·합성 계정/기술 API를 사용한 CUA 확인:0/1/N 목록(3/2/5 및1/1/3),360/390/412 가로넘침없음, 같은모달 이동·이전복귀·dialog초점·스크롤맨위, 오류/다시시도복구, 미연결대상disabled, 검색검증+즐겨찾기+페이지2 유지, 지연1800ms 응답후 이전기술설명유지, 설명없는상태 개인메모보존. 실제운영/물리Android 검증 아님. artifact `task-054-implementation-build/browser-evidence.json`, screenshot `multi-incoming-390.jpg`/`multi-outgoing-related-390.jpg`. 이후 기존 관장초안2개 라벨과 연속누락 이력복귀 effect 의존성만 root보완, 재빌드예정.
- Codex 독립 Reviewer가 승인v1 공식gate/hash/evidence PASS, 데이터159개 결합/설명/관계순서 불일치0, 인증경로소유격리를 확인했다. 사용자가 명시거부한 연결의 조회실패fallback, 로그경로백업덮어쓰기, 이름변경뒤오래된설명, 연결고아행, 빈DB환경값fallback, 연속누락모달복귀를 발견하여 보완·재검토중이다. 최종PASS를미리주장하지않는다.
- Reviewer는 인증경로확인중 index.js 검색에 무관한SPAfallback/마이그레이션주석3곳(56-59,405-408,614-620)이 함께출력된 범위초과를보고했다. 키·개인데이터없음, 해당3곳본문을넘어선추가열람없음. 이후인증부분으로범위를줄였다.
- 실제Claude 20/15테스트와별도로 Codex복원보완1차 backend31테스트PASS; 후속감사수정후다시검증예정. 신규기술자동삭제능력을제거한보수적복원(신규기술과그연결은보존)과0600·exclusive백업을구현했다. 원복이신규기술전체삭제를뜻하지않는한계를운영검토안에명시한다.


## Reviewer 기록 — Codex 독립 재감사

- [21:24] **PASS (정적 감사, 이번 사용자 승인 28개 재사용·110개 신규 준비 범위).** Critical 0 / High 0 / Medium 0 / Low 2. 기능 실행·실제 DB·DDL·운영 API·배포는 검사하지 않았으며 QA 실행 결과가 아니다.
- [21:24] 초기 차단 지적의 수정 경로를 재확인했다: 연결 SELECT는 테이블 없음 오류만 fallback, 권한·기타 오류는 안전한503; confirmed는 확정 시 기술명 snapshot으로 의미 변경을 차단; 양쪽 CASCADE FK 초안; 빈 DB 접속값·잘못된 port 거부 및 입력 env를 그대로 전용 Sequelize에 전달; 기술 신규 행과 링크는 자동 복원 시 보존; backup과 log는0600·배타 생성 및 경로 충돌 거부; 로그 실패는 커밋 성공과 구분; DDL 생성 후 검증 실패는 created_unverified; schema DB 질의도 sequelize.query. 실제 DB 스키마/드라이버와의 결합은 미검증이다.
- [21:24] 소유권/계약: index.js → routes/index.js의 JWT 미들웨어 → techniques route → 서비스의 user_id 스코프를 읽어 확인. API는 wrap/ok/fail, SQL 사용자 입력은 바인딩, 기존 note/영상 사용과 분리. Sequelize6의 QueryTypes prototype 정의 확인. 서비스·CLI의 변경된 부분에 새 AI 호출 없음. 빌드 경로 변경 없음. 159개 catalog/description/index/관계가 일치하고 관계의 순서·방향이 그대로임을 정적으로 비교했다.
- [21:24] 데모 게이트: check PASS, 승인 v1 및 SHA256 c32e6b4df1b6fc7d8a39be7152e6cd5cc9963699f037929d774ba7ea2e9bb600 일치. 해당 승인 evidence의 사용자 문구 해시와 실제 사용자 승인 문구 해시 일치. 데모 본문은 읽지 않고 task 기록의 승인 요구와 JSX 구조만 대조했으며 픽셀·실기기 검증은 범위 밖이다. C1 judge는 구현 이후 복구 판정이며 구현 전 실행을 주장하지 않는다. C2 Codex 독립 실행 결과는 아직 받지 않았다.
- [21:24] **LOW-1:** 사용자 지정 confirmed 연결의 기술명을 공백/하이픈만 바꾸어도 NFC 문자열이 달라지고, 별칭 자동 일치가 없는 경우 설명 연결이 보류될 수 있다(reference.js:63). 현재는 안전 우선 동작이며 추후 명시된 표기 정규화·재연결 UX 검토. **LOW-2:** 후속21개 결정에서 한 source slug에 복수 확정 대상 입력이 가능하나 현재 서비스는 ambiguous로 안전하게 표시하지 않는다(Apply.js:186, reference.js:79). 이번110개는 각 source당 신규1개이므로 해당하지 않는다. 추후 결정 파일에서 확정 중복 사전 경고 검토.
- [21:24] 감사 경계: 승인된 구현·테스트 소스 및 관련 모델/util, 공개 index/관계, task, demo SHA만 확인했다. 인증 확인은 추가 승인받은 index.js/routes/index.js/middleware/auth.js, DB 기본값·timezone은 승인받은 config/db.js 해당 부분을 확인했다. 단 index.js 검색어를 넓게 잡아 허용 범위 밖 SPA fallback 및 마이그레이션 주석3곳(56-59,405-408,614-620)이 함께 출력·읽혔다. 키·개인 데이터는 포함되지 않았으며 Leader에게 즉시 보고하고 범위를 좁혔다.
- [21:24] QA 집중: 접근 오류→503과 재시도·미설치 fallback, 삭제/이름변경 대응, 롤백과0600 backup 경로 경쟁·로그 실패, 사용자별 DB 가드, 0/1/N 탐색·연속 누락 복귀, 실제 SQL 및 DDL 미실행 한계.
- [Reviewer 정정] 위 LOW-2 표현 정정: 서비스는 복수 확정 대상을 `ambiguous`로 반환하고 화면은 임의 설명을 표시하지 않는다. “안전하게 표시하지 않는다”는 문구는 임의 기술 설명을 표시하지 않는다는 뜻이다.


## QA 기록 — Codex 독립 격리 검증

- [21:33][QA / Codex] Reviewer `REV-054-CODEX` 정적 PASS 뒤 검증. 선택 소스19개를 원본/격리본/manifest SHA256 대조해 불일치0, 빌드본 프론트 변경6개 원본 대조 불일치0. 원본 후보/개인 스냅샷 접근을 피하려고 backend47건은 선택본과 명시적 빈 합성 후보 fixture 사용. 첫 실행에서 express 미탐지로 route 파일 실패했으나(46 통과/1 실패), 기존 backend node_modules 경로와 route의 무관한 모델·서비스를 불가역 외부 작업 금지 스텁으로 격리해 재실행하여 47/47 PASS. 실제 route 요청은 127.0.0.1 임시포트·합성 req.user/service였고 .env·실제 DB에 접근하지 않았다.
- [21:33][QA / Codex] web 모델15/15, catalog check 159/159, 공식 demo gate check PASS(승인v1·hash일치), 로컬 Vite 5.4.21 224모듈 build PASS(1.20s). 실제 소스 기반 CUA Chrome 독립 측정: viewport360/390/412/1280 ×844, document scrollWidth 각각360/390/412/1280, dialog clientWidth와 scrollWidth 일치(358/388/410/458). 배경 토큰 `#0C0D12`, font status loaded, DPR1; 별도 라이트 테마는 확인되지 않았고 브라우저 버전·정확한 locale/timezone·애니메이션 비활성은 미확인. 합성 API, 동적 설명 XSS 문자열은 문자 그대로 표시되고 설명영역 `img` 0개. 390px 닫기44×44·자세히보기 높이44·관계카드 높이68·이전 높이44·재시도 높이약44.09px.
- [21:33][QA / Codex] **QA 결함 #1 / MEDIUM·재검토 대기:** 오류모드에서 ‘싱글 레그 테이크다운’ 상세의 다시 시도를 눌러 정상 복구되면 재시도 버튼이 사라지며 `document.activeElement`가 BODY가 되어 `dialog.contains(activeElement)` false. 다음 Tab은 닫기 버튼으로 돌아온다. 기대는 복구 직후에도 열린 대화상자 내부에 초점 유지. 재현·기대·실제를 Developer와 Leader에 전달했으며 수정 시 Reviewer부터 재순환. 따라서 전체 화면 QA PASS를 선언하지 않는다.
- [21:33][QA / Codex] 권한범위 기록: gate의 가이드 버전 비교 중 허용된 source선택 목록 밖 `docs/task-054-technique-tree-implementation.md`의 v1·승인 관련7줄을 추가 출력·읽었다. 개인데이터/키 없고 그밖의 파일 내용 외부전송 없음. 공통 오류 핸들러의 status/message 부분은 Leader 승인 하에 정적 대조: 서비스 503 status와 정제된 message가 응답에 전달되는 코드 경로; 실제 서버/DB 통합 실행 아님.
- [21:33][QA / Codex] 실 MariaDB SQL/DDL/apply/restore·인증된 운영 API·운영 데이터·물리 Android·배포 미실행. Root의 별도 실제 앱 코드 기반 합성 CUA는 root 수행으로 구분.
- [21:35][Reviewer / Codex 후속 재검토] **정적 PASS 유지**: TechPlanPage.jsx:341-345는 재시도 버튼 제거 전 같은 모달의 role=dialog에 focus한 뒤 기존 reload를 실행한다. anchorRef는 선언보다 앞서 콜백에서 참조하지만 콜백은 렌더 이후 클릭 시 실행되어 useRef 초기화 후다. Modal.jsx:49의 dialog는 tabIndex=-1로 프로그래밍 초점 가능하다. null guard 및 preventScroll을 확인했다. 실제 브라우저 동작은 QA 재검증 대기. 진행 중인 C2 공식 선택 스냅샷에는 이 후속 변경이 포함되지 않는다.

- [21:37][QA / Codex 후속] 위 QA 결함 #1은 root가 `TechPlanPage.jsx`의 재시도 핸들러에서 응답 전 모달에 초점을 돌리는 방식으로 보완했고 Reviewer가 해당 변경을 재검토 PASS한 뒤 Chrome 합성 fixture로 재확인했다. `error-always`: 재시도 후 오류3개 지속·activeElement role=dialog·dialog 내부 true. `error`: 재시도 성공 후 오류0·목록3/2/5·activeElement role=dialog·내부 true. 연결 기술 이동: 대상 dialog 초점·scrollTop0. 세 가지 모두 PASS. 재시도 후 다음 Tab 동작도 이전에 확인했으며, 기존 결함은 수정 확인으로 닫는다.
- [21:37][QA / Codex 후속] 바뀐 페이지 원본과 로컬 빌드본 SHA256 `b29378ecfd8552574b6606174127305aaeaf9d452447c6c4ce91aa7e50f3e4b2` 일치. backend13개 source/test 해시는 직전47건 검증 스냅샷과 그대로 일치하므로 재실행하지 않았다. 독립 최종 Vite 빌드 재실행: 224모듈 PASS, index-BqzTzql4.js, 1.20s.
- [21:37][QA / Codex 판정] **✅ 검증 통과 (실행한 격리 기능·DOM 접근성 범위)**: backend47/47·web15/15·catalog159/159·demo gate·source hash·최종 build·XSS 문자 렌더·모달폭·변경 컴포넌트 터치 면적·재시도와 이동 초점. 범위 밖 실제 MariaDB SQL/DDL/DML/restore, 인증 운영 API, 물리 Android, 배포는 미실행이다. 시각 캡처의 정식 재현 조건 중 브라우저 정확한 버전·locale/timezone·애니메이션 비활성은 측정하지 못해 **정식 스크린샷 비교는 NOT_VERIFIED**다. 이 판정은 운영 배포 승인/준비 판정이 아니다.
- [21:37][QA / Codex] 합성 화면은 앱 실제 source 빌드+실제 reference service에 합성계정/API를 주입했다. 사용자 검토를 위해 앱 프로젝트 밖 `task-054-implementation-build/qa-final-multi-390.jpg`에 별도 복사했으며 이 이미지는 합성 데이터다. QA 소유 임시 preload1개와 임시 스크린샷1개는 기록 후 삭제한다. 사용자 검토용 복사본과 Leader 증거 파일은 보존한다.


### Leader 공식 C2 실행·후속 보완 — Codex

- 공식 C2는 사용자 데이터/비밀을 제외한 선택소스19·관련context22·빈 합성 기본후보 fixture만 담은 별도Git저장소로 실행했다. 공용switch on·task호출1회. 301초 실제실행·parsed finding1건, 최종status=incomplete(reason=snapshot_modified). 원본프로젝트HEAD/index/코드는이검토로변경하지않았다.
- 불일치는 NAS가0644 지정파일도0700으로보고하는 실행비트차이임을합성파일생성→chmod0644→stat0700으로직접재현했다. 모델도선택파일content해시일치를확인했다. 안전검사/공용상태/예산은바꾸지않고, 별도공개소스fixture와baseline의실행비트만관측NAS형식에맞추어재실행준비했다. 증거 task-054-c2-fixture-mode-proof.json. 첫호출을PASS로승격하지않는다.
- C2 finding: 이름이바뀌어무효화된confirmed링크를재확정할때상태만같으면link_exists로성공skip되는문제. 이번110새slug에는해당없으나도구정확성을위해이름snapshot까지같을때만멱등skip, 다르면명시충돌거부·rollback하는작은보완을배정했다. 기존연결덮어쓰기없음.
- 독립QA는기존47backend+15web·catalog159·build·demo해시PASS, XSS리터럴이미지0·360/390/412/1280 overflow0·44px조작요소를확인했다. retry성공후BODY로초점사라지는신규결함을찾아root가stable dialog에먼저focus하는handler보완, Reviewer정적재검토PASS 후 QA가성공/연속실패/이동3케이스재실행PASS했다. 새build index-BqzTzql4.js, screenshot qa-final-multi-390.jpg.
- QA가 가이드의 v1승인관련7줄을허용목록밖에서읽은사실은QA기록에보존. 키/개인데이터없음. 정식스크린샷비교용Chrome정확버전/locale/timezone/animation통제는미측정이지만요청한기능/DOM/반응형실측PASS와구분한다. 이를새필수설정/완료목표로확대하지않는다.
- [21:40][Reviewer / Codex C2 지적 후속] **정적 PASS 유지**. 동일 confirmed 재확정 시 status뿐 아니라 잠긴 현재 기술명과 저장 이름 snapshot을 NFC 기준으로 비교한다(techniqueReferenceApply.js:267-277). 다르거나 누락되면 LINK_NAME_CONFLICT를 트랜잭션 내부에서 throw하여 기존 연결을 덮지 않고 앞선 신규 쓰기도 롤백한다. 이름이 일치하면 기존 link_exists 멱등 동작 유지. 테스트 코드의 기존 링크 불변·앞선 create 롤백·NFC 재확인 사례를 읽었으나 기능 테스트는 실행하지 않았다. 두 동결 파일 SHA256은 Leader가 전달한 615a311c…ef8ebfe1/b544217b…f8ebfe1과 각각 일치했다. 최종 변경분에 대한 별도 C2 결과 및 QA 실제 재실행은 대기한다.

- [21:42][QA / Codex 최종 재검증] C2 중간 finding으로 기존 confirmed 링크 이름 snapshot이 현재 이름과 다르거나 누락된 재확정 처리 보완. Reviewer 정적 재검토 PASS 이후 실제소스19개와 선택본 양쪽 해시 일치(불일치0), 핵심 core SHA256 `615a311cab4153401435b9729c4c31893a2bed9bed04d8a2e8a544a0ef8ebfe1`, 테스트 SHA256 `b544217b09dd700680f55d0e87dbb276a04e2c9bdb0b4e6e86f64a9e2f39c590` 확인. 선택본·빈 합성 후보 fixture·route 비DB 스텁 환경에서 `node --test backend/test/task-054-*.test.js`: **49/49 PASS**. snapshot 변경/누락 시 `LINK_NAME_CONFLICT`와 트랜잭션 롤백, NFC 동일 시 멱등성을 테스트가 직접 확인했다. 실제 DB·환경값·운영 API는 읽지 않았다. 프론트는 변경 없어 이전 web15/15·XSS·반응형·초점·최종 빌드 결과를 유지한다. **✅ 실행한 격리 QA 범위 통과.** 정식 스크린샷 재현 조건의 미측정 부분은 앞 기록대로 NOT_VERIFIED이며 새로운 필수 작업으로 추가하지 않는다.


### Leader 최종 구현 검증·운영 반영 전 — 2026-11-08 21:51 / Codex

- **코드 준비·격리 검증 완료, task 전체완료/운영배포 완료 아님.** 사용자 승인범위:28기존재사용·110추가준비·21후속확정. 전체공개catalog/설명159개, 관장최신분류제안110개(기존8종), 실제create결정JSON110개·unique110·원래60행수정0, offlineplan SHA4c6666e7…d354 일치. 분류제안채택·운영DDL/DML는아직미승인이다.
- Reviewer 최종정적PASS(후속retry초점·confirmed이름충돌 포함 재검토). 독립QA **backend49/49 + web15/15 =64 PASS**, catalog159최신·demo v1해시PASS·최종workingtree Vite224modulesPASS. 원본/선택코드19개hash일치. 소유격리·503/부재구분·name snapshot·backup600/충돌·보수적restore·명시DB가드·생성후검증실패·SQL어댑터는메모리/주입fixture검증이며실제SQL이아니다.
- 공식C2 두번째호출 **status done, 새finding0, files_modified_in_snapshot=[]**,179초, snapshot1f5725a38f8f3bc15897002fcb7254033a2ff5fb. 이전content분석이후변경3파일과41선택hash를대조하고이름재확정문제해결을확인했다. 첫snapshot_modified는이력에남기며PASS로바꾸지않는다. 공용검사·스위치·예산변경없음, 임시fixture실행비트만실측NAS형식에맞춤. read-onlyC2가EPERM으로실행하지못한파일쓰기5테스트는별도독립QA에서실행PASS로구분한다.
- 다른기능의dirty파일이있어 원래HEAD2e3575de…의web소스에이task프론트6파일만overlay한 **별도배포후보150파일**을만들었다. 초기수정대상4파일의시작hash가HEAD와모두같아기존미커밋변경을포함하지않는것을확인. 후보VitePASS(index-XCyKDvfd.js,1.20s), CUA390px실제3/2/5·1/1/3,오류재시도→정상복구/dialog초점,이전복귀/dialog초점/scroll0,360/390/412넘침0. 실제앱소스기반이며새HTML레이아웃으로대체하지않았다.
- 최종검토용후보: http://127.0.0.1:63680/_fixture (합성계정·데이터만). screenshot `task-054-release-candidate/technique-detail-390.jpg`, 증거browser-evidence.json. 실제사용자목록은현재운영에서확장하지않았다.
- 챔피언은공개동작에근거한선수↔기술↔사용/강의/소개근거+별도타이틀근거구조검토까지완료, 실제선수DB/화면생성없음.
- 남은권한/한계: 연결테이블1개DDL,새기술110+연결110실제반영,분류제안채택,선택변경커밋·push/webhook웹배포는미실행/별도승인. 실제MariaDB엔진·인증운영UI·물리Android는미검증. 자동restore는기존기술에추가한미변경연결만되돌리고신규기술/그연결은이후기록보호를위해보존한다.

- 운영 실행 승인 수신. 실제 current=20261106-161122-55f8ad4e, backend node_modules/shared env 존재, releases/shared/auth-oauth 실물 디렉터리 존재를 SSH read-only metadata로 확인했다. 낡은 미해소 표를 현재 blocker로 확대하지 않는다. 로컬 main과 origin/main 분기가 있어 무관한12 local commit/dirty를보존하고 origin 위에 task054패치만선택하여배포한다.

### Leader 운영 DB 반영 완료 — 2026-11-08 22:40 / Codex

- 사용자 명시 승인에 따라 실제MariaDB10.11.11에서 schema created-and-verified, 신규기술110(ID384~493)·연결110 커밋,skip0. 적용대상user3의총170행. 잠금/보존검사원래60행통과,후속대조도메모·이름·분류·링크·즐겨찾기·created_at등기존행전부불변. 다른사용자행수불변,기존영상177행의전체sha256불변.
- actualSQL reference서비스에서개인170개중설명대응138개,공개catalog159개,confirmed110개. 기존기무라5/5/2·니컷2/1/5·신규싱글레그3/2/5·칼라드래그1/1/3·가드0/0/0,모두설명/링크정상. 타사용자로새기술조회404. 임시인증토큰·우회엔드포인트생성없음. 운영HTTP/실화면확인은배포뒤별도다.
- private백업/로그디렉터리 /home/brownjeon/.local/share/bjj-ops/task-054-bf0bc2fa46, pre-write/final/log각0600. 기존비공개메모를로컬도구출력/커밋에복사하지않았다. 안전한요약docs/handovers/task-054-db-result.json. restore는실행하지않았다.
- 원래main은새origin55f8ad4와분기된12localcommit+다른기능dirty가있어보존했다. 관리worktree에서origin55f8ad4위에선택4patch+신규15를적용,reviewed19sourcehash전부일치·충돌0·관련context차이0. 최신origin기반Vite224modules/1.19sPASS(index-C6IJ6MBR.js). 선택커밋/push/웹배포는다음단계다.
- [22:45][Reviewer / Codex 운영 분리본] **기존 코드 정적 감사 PASS 유지**. 배포용 managed worktree HEAD가 선택 manifest 기준 origin 55f8ad4e73db44377b5c60abccbcb988b66179b2와 같고, 감사한 구현 코드19개 및 관련 컨텍스트22개 SHA256이 원본과 전부 일치했다. 선택61개 경로는 중복·누락·선택 내 symlink 0, web/node_modules는 선택 밖. 현재 staged4개는 모두 선택 대상이며 인덱스 내용도 원본과 일치한다. 나머지57개는 아직 stage 전이므로 커밋 직전 staged 전체와 manifest의 정확 일치·선택 외 경로 0 검증이 필요하다. 개인 스냅샷·매칭/결정 파일 및 DB 결과 요약이 선택 경로에 포함됨을 경로 메타데이터로 Leader에 알렸다. DB-result 요약 외 해당 파일 본문·백업·환경값은 읽지 않았다. DB-result는 기존60 보존, 110 기술+110 링크, 총170, video177 보존, FK schema 검증 및 실SQL sample/foreign404 PASS라고 보고한다. 이 감사자는 DB 명령·기능 테스트를 재실행하지 않았고 push/배포 결과를 확인한 것이 아니다.

- [22:48][QA / Codex 운영반영 후 배포 후보 대조] root가 작성한 허용된 안전 요약만 열람: schema created-and-verified, 신규기술110·연결110·사용자3 기술170, 기존60 보존·영상177 보존·다른 사용자 수 변화 없음으로 기재됨. 실제 SQL/API 조회는 root 수행 결과이며 본 QA는 DB·백업·환경값·원자료를 직접 열지 않았다.
- [22:48][QA / Codex 후보 대조] 선택 worktree `codex/technique-tree-054` HEAD `55f8ad4e73db44377b5c60abccbcb988b66179b2`. 직전 독립 QA 원본19개와 후보19개를 동결 manifest 해시에 각각 대조해 불일치0, 허용된 관련 context22개도 불일치0. 기존 격리 backend49/49·web15/15·화면 초점/XSS/반응형 결과는 검증 범위 내에서 유지. 후보 `web/dist/index.html`의 JS `index-C6IJ6MBR.js`와 CSS `index-CHxt3FcU.css`가 모두 존재하고 참조됨을 확인했다. JS SHA256 `e45a3f4d63fc4e704b4498ba0b024c59556f5b5d1ad0878ced5efd41ba6ca44a`. 빌드를 본 QA가 재실행한 것은 아니다.
- [22:48][QA / Codex 후보 대조] 선택 manifest의 경로 메타데이터에 기존 개인 기술 스냅샷 및 매칭·반영 계획 파생자료가 포함된 것을 확인해 Leader에게 비공개 원자료 취급·staging/push 허용 근거 확인을 요청했다. 이 파일들의 내용은 읽지 않았다. `web/node_modules`는 untracked로 보이나 선택 manifest에는 없다. 사용자 운영 반영 승인을 근거로 추가 검토와 실제 전송 범위를 결정할 주체는 Leader/사용자이며 본 QA는 커밋·push·배포하지 않았다.
- [22:55][Reviewer / Codex 최종 전송경계] **정적 PASS 유지**. 선택 manifest 45경로=Git 인덱스 45경로, 선택 외0·기존 개인원자료 제외16경로 중 staged0·web/node_modules staged0. 검토한 구현19개는 원본/작업트리/스테이징 인덱스/안전 구현결과의 SHA256 전부 일치했다. 기본 관장후보 공개 stub은 items 빈 배열임을 인덱스에서 확인했다. 공개용 task/개선3건·결과/운영 요약을 읽었고 비공개 스냅샷·매칭·백업 본문은 읽지 않았다. ACTIVE/board의 변경은 task054 추가행과 빈 줄만이고 일일 로그의 작업 색인은 task054만이다. git diff --cached --check PASS. 공개 원문자료/생성 설명·데모 전체를 개인정보 관점으로 다시 전수검사한 것은 아니다. 커밋/push·배포 자체는 실행하지 않았다.

- [22:56][QA / Codex 전송범위 재확인] 선택 worktree의 staged45개와 확정 manifest45개가 정확히 일치하며 중복·선택외 staging·개인 원본 스냅샷/매칭/결정/dry-run 상세·.env·web/node_modules 경로가 없다. 공개 기본 관장 후보 stub은 staged/작업본 일치·items 빈 배열이며 원본 개인 후보 파일은 열지 않았다. 사용자 데이터 전달 우려는 미필요 원자료를 선택 범위에서 제외해 해소했다. 검증 소스19개는 staging blob·작업본 양쪽 모두 기존 독립 QA manifest 해시와 일치, git diff --cached --check PASS. 공개 DB·구현 요약 JSON에 개인 ID 대응·사설 백업 위치 필드 없음. **기존 격리 QA PASS 유지.** 이 대조는 실제 배포·운영 UI를 본 QA가 실행했다는 뜻이 아니다.

### Leader 선택 커밋·push 완료 — 2026-11-08 23:00 / Codex

- Giteaorigin/main55f8ad4→09b82c2fef81d6d9a354354af01a57abd0bc58a6 fast-forward성공. codex/technique-tree-054관리worktree에서정상gitcommit,선택45개공개경로만포함. 원래main12localcommit과다른dirty는미변경/미포함.
- 커밋선택검토중개인원자료경로16개를발견해commit/push전에제외,원본NAS와privateDBjob에보존. 공개용task/결과/운영안/3개선문서는집계로분리. 공개기본coach후보는items[] stub이며서버런타임참고서비스는이를사용하지않고DB확정링크110을읽는다. 테스트49개도이미empty후보fixture로독립PASS. 기존원본개인21후보/결정/전체이력은이private원본기록에남는다.
- 최종Reviewer/QA가staged45=manifest45,선택외0,개인원자료16/.env/node_modules제외,source19의작업본/인덱스hash동일,whitespacePASS를확인했다. 아직웹배포완료를주장하지않고deployer가webhook진행/RELEASE_RESULT를확인중이다.

## 배포 기록

| 시각 | 릴리스 | 커밋 | 포함 작업 | 결과 | 비고 |
|------|--------|------|-----------|------|------|
| 2026-11-08 23:02 KST | 20261108-225820-09b82c2f | 09b82c2 | task-054 기술트리 목록·상세 개선 | ✅ ok | push webhook 배포를 확인해 중복 `--yes` 실행 안 함; DB DDL은 별도 승인·반영 완료 |
| 2026-11-08 23:15 KST | 20261108-231510-a4c100e4 | a4c100e | task-054 완료상태·공개 집계 문서 | ✅ ok | 문서 전용 후속 push webhook; 기능 소스 19개 변경 없음 |

- `scripts/deploy.sh bjj-trainning --dry-run`: 대상 `brownjeon@125.177.194.26:993`, `/home/brownjeon/apps/bjj`, `origin/main` (`09b82c2`), web build 포함. 작업본의 미커밋 변경 84건과 로컬 미push 커밋 12개는 경고됐으나 배포 대상 ref는 origin/main으로 확인.
- webhook 원본 결과: `RELEASE_RESULT {"status":"ok","release":"20261108-225820-09b82c2f","sha":"09b82c2fef81d6d9a354354af01a57abd0bc58a6","previous":"/home/brownjeon/apps/bjj/releases/20261106-161122-55f8ad4e","migrated":false}`. 이 원문은 root가 해당 SHA에 한정해 webhook 로그에서 확보해 전달했다. DB 반영은 별도 승인된 사전 단계였으며 배포 스크립트 migration은 실행되지 않았다.
- 공식 `scripts/deploy.sh bjj-trainning --status`: current `20261108-225820-09b82c2f`, pm2 `bjj` online (cwd가 해당 release), `/health` HTTP 200. RELEASE_RESULT의 status와 현재 release·헬스가 일치한다.
- [23:08][Leader / Codex 배포 후 운영 확인] current `20261108-225820-09b82c2f`; runtime 구현19개 source hash 불일치0. HTTPS health `200 {success:true,data:{status:ok}}`, HTML 200, `/assets/index-C6IJ6MBR.js` 200 및 SHA256 `e45a3f4d63fc4e704b4498ba0b024c59556f5b5d1ad0878ced5efd41ba6ca44a`가 릴리스 파일과 일치. 배포 API의 기본 getReference는 신규 기술에서 설명과 앞/뒤 3/2/5 및 연결 저장소를 반환했고, 타 계정 404·비인증 경로 401. pm2 `bjj` online, restart 0·불안정 0. 실제 외부 브라우저는 SPA 로그인 화면까지 정상 렌더됐으나 인증 세션이 없어 로그인 후 기술 상세 화면 확인은 미실시; 실제 기기도 미확인. 토큰 발급·우회·새 계정 생성은 하지 않았다. 업로드 이미지/썸네일은 미확인.
- 문서 전용 후속 push 배포 원문: `RELEASE_RESULT {"status":"ok","release":"20261108-231510-a4c100e4","sha":"a4c100e417539e041175a14dc7aa5d002c367b1d","previous":"/home/brownjeon/apps/bjj/releases/20261108-225820-09b82c2f","migrated":false}`. 공식 `--status`에서도 current `20261108-231510-a4c100e4`, pm2 online 및 health 200 확인. root 재확인 결과 HTTPS health/HTML/asset 모두 200, runtime 구현19개 hash 불일치0, 서빙 `index-C6IJ6MBR.js`가 기능 릴리스와 현재 문서 릴리스 파일에서 같은 SHA256 `e45a3f4d63fc4e704b4498ba0b024c59556f5b5d1ad0878ced5efd41ba6ca44a`, 비인증 기술 상세 경로 401, pm2 restart 0·불안정 0. DB 최종 재대조는 기술170/연결110·기존60 보존·영상177 전체 hash 불변·타 사용자 행수 동일·backup0600·schema PASS로 보고됨. 인증 후 실제 기술 상세 화면, 실기기, 업로드 이미지/썸네일은 미확인.

### Leader 최종 운영 검증 — 2026-11-08 23:10 / Codex

- 완료범위=사용자가선택한28재사용·110추가·21후속·챔피언구조검토. 코드커밋09b82c2fef81d6d9a354354af01a57abd0bc58a6, 운영코드릴리스20261108-225820-09b82c2f. 정본webhook RELEASE_RESULT statusok/sha일치,중복수동배포0.
- 현재runtime19source SHA전부검토본과일치,외부HTTPShealth200/JSONstatusok·HTML200,실제서빙index-C6IJ6MBR.js200·release파일SHA동일(e45a3f4d…a6ca44a). 실제배포default getReference의설명/3·2·5/linkStoreavailable·타계정404,외부미인증reference401 확인. pm2bjjonline/restart0/unstable0.
- CUA운영SPA로그인화면렌더확인. IAB인증세션이없어인증후기술상세·물리Android는미확인. 새계정·임시토큰·인증우회경로를만들지않았다. 기존권한밖확인을필수새목표로승격하지않는다.
- 신규기술110/연결110 총170·기존60/영상177전체보존·다른계정행수불변. 비공개backup600·원자료별도보존. 집계기록공개용완료commit만추가예정이며동일코드후속webhook은별도문서릴리스로구분해상태확인한다.

| exec-054-013 | 2026-11-08 23:22 | documentation_release_verified | codex / codex_scoped | 완료기록commit a4c100e의후속릴리스 `20261108-231510-a4c100e4` 정상,기능source/asset이코드릴리스와동일. 최종DB170/기존60·영상177보존 재확인. 새push없음 | RELEASE_RESULT ok,health/HTML/asset200,pm2online0 |

최종문서릴리스는기능commit09b82c2의코드와동일하다. 이관측은추가배포를만들지않도록운영기록에보존하며새commit/push하지않는다.

### Leader 정리·보존

- task054용 합성 API 서버2개를 종료했다. 운영백업/원자료/증거는보존했다.
- 관리worktree archive API를실행했으나 “The task's primary checkout cannot be removed”로거부되어primary보호를우회하지않고체크아웃을유지했다. 기능/기록commit은모두origin/main에push되었고, 마지막문서릴리스관측은로컬기록으로남긴다. 다른원본로컬commit/dirty와primaryworkspace를삭제하거나재설정하지않았다.


## 후속 21개 사용자 확정 반영 (2026-11-08)

- 사용자 지시: “기존 백포지션 -> 백 컨트롤로 변경해주고 백마운트를 신규로 추가”, “앵클락, 싯팅가드,싱글언더패스,깃쵸크은 그대로 사용”, “그외는 권고대로 처리”.
- 범위: 기존 19개 재사용·연결, 백 컨트롤 이름 변경 1건, 백 마운트·풋락 신규 2건, 참고 연결 21건. 기존 ID·메모·영상 내용 보존, 기술명으로 연결된 영상 참조만 정확 대응 변경. 챔피언 구현 제외 유지.
- 결과: 2026-11-09 00:03 운영 반영·검증 완료. 기존170행은 승인된 이름1건 외 모든 필드 보존, 신규2/연결21로 총172개·참고연결131개. 영상177개 유지, 정확 기술명 참조2건 외 영상 필드 보존. 과거 수업·스파링 기록과 숙련도 집계 전후 동일. 0600 백업·커밋 전/후 상태비교·실제 기본서비스 상세21건·타계정404 확인. 이전 110개 반영/배포도 완료된 사실로 보존.

- [2026-11-09 00:02][QA / Codex 사용자 확정 대응 후속] 비공개 운용 도구의 순수 함수와 새 별칭을 합성 fixture만으로 독립 검증했다. 초기에는 이전 기술명 정규화 경쟁 시 다른 기존 기술의 exact 매칭이 우선해 과거 훈련 집계가 이동할 수 있는 결함 1건을 발견해 Leader/운용 담당에 즉시 보고했다. 운용 사전검증 보완 후 Reviewer 정적 재검토 PASS를 받고 동일 합성 테스트를 독립 재실행하여 **11/11 PASS**.
- [2026-11-09 00:02][QA / Codex] 별칭·계정 범위·exact 우선·NFC/공백·별도 포지션·중복 이름의 기존 최저 ID 규칙, 이름 변경 전후 드릴/스파링/상위벨트 숙련도 집계, 합성 기존19+신규2+상세21 확인, 아메리카나의 기존 exact/확정 우선순위, 동영상 JSON 배열 순서/메타 및 손상·scalar·object 보존, 기존·신규 이름 충돌 및 사전/사후 drift 거절 확인. 합성입력 외 실제 개인원자료/DB/환경값에 접근하지 않았다. root가 전달한 별도 실제 preflight 결과와 본 테스트는 구분한다.
- [2026-11-09 00:02][QA / Codex] 테스트 당시 운용 logic SHA256 `1eff92a5526d07793c8761ba5ad6fbff78fe2ba87bc5c0a3dca8a521a63fa2ab`, operator SHA256 `7bd1706fcb459a0200194ff4e9d18559a0c8586c6fd331ca70513272d9781821`, 앱 별칭 소스 SHA256 `9aa06560d710ac5a145d5f8eecb542ba19bc8fa76a458a567dcb94214d55a22a`. 합성 QA 코드는 private 작업 공간에만 둔다. **✅ 검증 통과 (독립 합성 범위).** 실제 DB 반영 및 최종 운영 검증은 실행 주체가 별도 기록한다.

| exec-054-014 | 사용자 후속 지시 수신 | followup_user_confirmed | codex / codex_scoped | 사용자가 보류21개의 이름변경·재사용·신규권고를확정 | 본대화지시 |
| exec-054-015 | 2026-11-09 00:03 | followup_completed | codex / codex_scoped | 단일트랜잭션반영·총172/연결131·기존기록/집계보존·웹호환별칭배포완료 | Reviewer재감사PASS/QA11+기존49PASS/RELEASE_RESULT ok/실제SQL검증 |

후속 기능릴리스 `20261109-000243-78d3ac9c` / commit `78d3ac9c2b2332a0ab6e8d936d61ff62d6946b23`. 과거 이름 호환 별칭을 먼저 배포한 뒤 운영 이름·연결을 반영했다. QA가 발견한 과거이름 경쟁은 적용 전 정규화 충돌 차단으로 보완하고 재감사·재실행을 통과했다. 인증 후 상세화면·실기기 확인은 이번에 수행하지 않았다. 후속 완료기록 push의 자동 문서릴리스는 동일 기능코드로 별도 관측한다.

후속 완료문서릴리스 `20261109-000550-0aef8e11` / commit `0aef8e1159d0dd0b40ec30b6b5f14fdd81ba3da4`도 RELEASE_RESULT ok·공식status current/pm2online/health200,외부HTML/asset200·서빙asset SHA일치·미인증401을 확인했다. 기능별칭은78d3ac9 검토판과동일하며 최종관측은 추가배포를만들지않도록 운영기록에만보존한다.


## 참고영상 명칭 확정·백데이터 검토 (2026-11-09)

- 사용자 지시: “기술을 쓰는 챔피언” 기능의 문구를 “참고영상”으로 변경하고 기존 검토 내용을 제시.
- 운영에는 해당 챔피언 영역이 아직 없어 설계 명칭과 IMP-0003 기록을 변경했다. 기존 개인 관련 영상 영역과 172개 기술 데이터는 그대로 둔다.
- 권고: 공통영상 `reference_videos` + 기술연결 `technique_reference_videos` 신규2개, 기존 개인 `video_clips` 재사용. 안정적인 공개 slug와 사용자별 기존 대응으로 연결하고 유형/구간/관장설명·검토상태를 보관한다. 선수·타이틀은 선택 확장으로 둔다.
- 기존 ClipDetailModal은 개인 ID로 활용 로그를 쓰므로 공유 영상 ID를 그대로 넘기지 않는다. 기존 재생기 재사용, 개인 저장 후 개인 메모/활용 흐름으로 연결한다.
- 구조 제안은 미구현이며 이번에는 새 테이블·수집기·운영데이터·추가배포를 실행하지 않았다. 결과는 [[IMP-0003-champion-data-review]]에 기록.
| exec-054-016 | 2026-11-09 00:14 | reference_video_reviewed | codex / codex_scoped | 사용자 명칭변경 반영·신규2테이블+기존개인영상 재사용 검토안 제시. 실제영상기능은 검토단계 | 코드대조·공개페이지HTML·기존검토기록 |


### 참고영상 수집 방식 후속 질문 (2026-11-09)

사용자가 수집 계획을 질문하여 공개참고링크→공식YouTube검색보완→영상ID중복제거/API메타조회→기술/구간/관장검토→승인공개 및30일이내API정보갱신안을제시했다. 초기10기술·각2~3연결은검토용제안이며승인된실행범위가아니다. 기존개인URL분석은재사용가능요소가있으나공통수집기는별도구현이필요하다. 실제대량수집/DB등록/키설정/추가배포는실행하지않았다. 상세 [[IMP-0003-champion-data-review]].


## 참고영상 추가 작업 사용자 보류·절차서 작성 (2026-11-09)

- 사용자 지시: “해당 작업은 일단 보류로 해서 작업절차서만 일단 작성하고 다른 작업 후에 작업여부 결정하자”
- 기존 기술트리 개선·후속21개 운영 반영은 완료 상태를 유지한다. 추가 참고영상 기능·수집·신규 DB 구현은 사용자 보류로 구분한다.
- [작업 절차서](../../../docs/handovers/task-054-reference-video-procedure.md) 작성 완료. 범위 결정·설계·후보 수집·관장 검토·구현/독립 검증·운영 반영·배포·갱신·복원 경계를 정리했다. 초기10기술·각2~3개는 승인된 목표로 승격하지 않았다.
- 다른 작업 후 사용자가 작업 여부를 결정한다. 재개일/자동 수집은 예약하지 않는다. 이번에는 코드·API 설정·수집·DB·커밋/push·배포를 실행하지 않았다.

| exec-054-017 | 2026-11-09 11:45 | reference_video_paused_by_user | codex / codex_scoped | 추가기능·수집 사용자보류,작업절차서만작성완료. 기존기술트리완료유지 | 사용자보류원문·IMP-0003·절차서·ACTIVE동기화 |
