---
id: task-052
title: 피드백 목록·훈련 상태·입력 선택·연습 결과 편집
status: done
base_ref: 3f67d5d703394238996fb05e40c523075d4380ce
created: 2026-11-05
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "피드백 필터·영상 선택 후속의 사용자 실기기 확인을 기록하고 종료"
  last_event_id: exec-052-019
tags:
  - type/task
  - domain/ux
  - domain/recall
aliases:
  - 피드백 전체 목록
related_tasks:
  - task-051-feedback-recall-demo
demo_gate:
  required: true
  level: "delta"
  status: "review_requested"
  version: 2
  repo_path: "docs/demo/task-052-feedback-library-v2.html"
  artifact_url: "http://127.0.0.1:63675/v2.html"
  content_sha256: "b5ca80fb8c0864bd42e7d63722dc02dd6256802ae7bde3dc0771c3f511eb3fa5"
  decided_by: "judge"
  rule_id: "JV-ui_change"
  approved_by: ""
  approved_at: ""
  approval_quote: ""
  waived_by: ""
  waived_at: ""
  waiver_quote: ""
  active: false
---

## 목표

1. 홈 최근 피드백은 최대 3개. 기존 정리 상태와 별도로 과제중/훈련중/훈련완료 표시. 결과 중 done이 하나라도 있으면 훈련완료, 그렇지 않고 결과가 있으면 훈련중, 결과 없이 현재 과제로 지정되어 있으면 과제중.
2. 최근 피드백 제목 우측 전체 보기. 참고영상 구성을 재사용한 새 피드백 목록·조회: 전체/최신순/즐겨찾기/완료 및 기술 조건.
3. 기술트리 등록 기술 검색·선택. 상황은 수업/스파링/영상 복기/개인 연습/기술 토론/기타 선택, 기타일 때만 직접 입력. 사용자의 '양싱복기'는 영상 복기로 해석해 알림.
4. 저장된 연습 결과별 수정/삭제. 수정은 등록과 같은 폼을 해당 내역에서 펼쳐 표시. 마지막 done 결과 수정/삭제 시 상태 재계산.

## 실행 도구·절차 이력

| 이벤트 ID | 시각(KST) | 사건 | 이전 → 현재 담당 / 현재 절차 | 범위·인계 대상·남은 일 | 근거 |
|---|---|---|---|---|---|
| exec-052-001 | 2026-11-05 13:36 | resume | codex → codex / codex_scoped | 사용자 승인 v2의 설계·가이드·구현 인계 준비. 화면/서버/DB를 함께 바꾸는 구현의 실행 주체는 사용자 결정 대기. 실제 Claude 주 작업 인수·앱 코드 변경·최종 테스트·배포 미실행 | 현재 Codex 대화의 task052 최초 요청/작성 및 최신 사용자 원문 '이제 수정했던 데모화면 구현작업 시작해줘'. 현재 AGENTS의 TASK-TOOL-CONTEXT 및 사용자 사전 승인 정책 적용 |
| exec-052-002 | 2026-11-05 13:42 | handoff_prepared | codex → codex / codex_scoped | 승인 v2 UI 가이드·구현 인계문·해시 매니페스트 준비 완료. 실행 주체 질문 답변 대기. 자동 발송·실제 Claude 수신·주 작업 인수는 미실행 | docs/task-052-feedback-implementation.md, docs/handovers/task-052-v2-implementation.md, docs/handovers/task-052-v2-manifest.json. Codex Designer 완료 회신 및 로컬 파일 확인 |
| exec-052-003 | 2026-11-05 13:51 | resume | codex → codex / codex_scoped | 사용자 일회성 예외로 task052 v2의 실제 구현을 Codex가 맡는다. 기존 팀 독립 검토와 운영 승인 경계는 유지. 복수 상황 저장 방식은 별도 질문, UI 승인 기록 정상 처리는 조사 중. 독립 가능한 backend 결과 수정/삭제부터 구현 준비 | 사용자 질문 응답 원문 '이번 작업은 Codex가 구현하도록 예외 허용'. 이 예외를 다른 task·프로젝트나 운영 DB/배포 승인으로 확대하지 않음 |
| exec-052-004 | 2026-11-05 13:58 | resume | codex → codex / codex_scoped | 사용자가 복수 상황 별도 저장·API 규격과 task052 한정 기계 기록 예외를 명시. 승인 v2대로 기존 앱/UI·서버 구현 착수. 공용 승인 도구·gate frontmatter·receipt/trust는 보존 | 사용자 질문 응답 '기존 기록 보존 + 선택 항목 별도 저장', '제안한 규격으로 진행', 'task-052만 기계 기록 예외 허용' |
| exec-052-005 | 2026-11-05 14:44 | resume | codex → codex / codex_scoped | 실제 앱 구현 및 격리 검증, C2 독립 보존/호환 수정까지 완료. 진행 중 관장 정리와 결과 변경 정책 및 새 초안 작성 취소의 사용자 선택 대기. Claude 구현 인수·운영 적용·배포 없음 | 로컬 앱 커밋 aaecade, 후속 2e3575de, REV-052-C2-partial, 격리 SQL/HTTP/CUA 및 사용자 질문 기록 |
| exec-052-006 | 2026-11-05 14:58 | resume | codex → codex / codex_scoped | 정리 진행 중 연습 결과 쓰기 잠금·새 결과 작성 취소 구현, 별도 운영 후보 `00d7a384` 동결 및 독립 정적 재감사. 운영 DB 읽기 전용 사전 확인 완료. 최종 검증·운영 실행 담당 선택 대기, DB 쓰기·push·배포 없음 | 사용자 원문 `운영DB반영 및 배포작업 진행해줘`, 사용자 선택 `정리가 끝날 때까지 결과 저장·수정·삭제를 잠시 잠금`, `docs/handovers/task-052-production-release.md` |
| exec-052-007 | 2026-11-05 14:59 | resume | codex → codex / codex_scoped | task051·052에 한해 최종 독립 QA와 승인된 운영 DB·배포를 Codex가 맡는다. 이전 역할과 작업의 절차는 유지 | 사용자 원문 `이번 task-051·052 최종 검증·운영 DB 반영·배포까지 Codex가 진행` |
| exec-052-008 | 2026-11-05 15:07 | resume | codex → codex / codex_scoped | 최종 독립 QA PASS/0, 운영 DB 051·052 적용과 검증, `00d7a384` 운영 배포 완료 | 아래 배포 기록 및 webhook 결과 |
| exec-052-009 | 2026-11-06 08:58 | resume | codex → codex / codex_scoped | 캘린더 버튼 색·크기, 피드백 추가·상세 하단 팝업, 복기 상세 닫기 초점 복귀를 로컬 후보 `20e33cd`로 동결. 격리 웹 테스트 67/67·빌드 통과, 브라우저에서 복기 카드·연습 결과 초점 복귀 확인. 운영 배포 전 | 사용자 원문 `데모화면확인했어. 이작업에 대해서는 너가 직접하고 결과알려줘` |
| exec-052-010 | 2026-11-06 09:05 | resume | codex → codex / codex_scoped | 메인 Codex가 승인된 운영 배포를 맡음. 독립 Reviewer 1차 지적 2건을 해결한 `e654ac0` 후보 재감사 PASS. 화면 승인 및 task-052 기계 기록 예외와 기계 검사 `DEMO_GATE_BLOCKED`를 구분 | 사용자 원문 `확인했어. 이번 피드백 팝업 수정도 너가 직접 운영에 배포하고 결과 알려줘.`, `REV-052-popup-e654ac` |
| exec-052-011 | 2026-11-06 09:07 | resume | codex → codex / codex_scoped | 독립 QA PASS/결함 0, 메인 Codex가 검증한 `e654ac0`을 운영에 배포 | 아래 배포 기록과 `RELEASE_RESULT` |
| exec-052-012 | 2026-11-06 09:31 | resume | codex → codex / codex_scoped | 사용자 실기기 첨부를 기준으로 피드백 목록의 상태·기술 조회 필터를 참고영상과 공용화. 390px 렌더의 공통 버튼 크기·색·글자 일치, 피드백 최소 44px 터치 높이, 360/390/412px 가로 넘침 0, 기술 검색·선택·해제와 완료 필터 실측. 로컬 후보 `61404c0`, 웹 빌드 및 테스트 68/68, 운영 배포 전 | 사용자 원문 `기술영상의 선택박스의 ui로 맞춰`, 실기기 첨부 2장, `이것도 너가 직접 작업진행하는 절차로 진행해줘` |
| exec-052-013 | 2026-11-06 09:43 | resume | codex → codex / codex_scoped | 등록영상 연결 필터에 같은 컨트롤과 버튼 6px·기술 선택 행 12px 간격 적용. 360/390/412px 모달 가로 넘침 0, 44px 터치 높이, 7개 영상 페이지 이동과 기술·즐겨찾기 조회 및 영상 선택 유지 실측. 로컬 후보 `dbdfc58`, 웹 빌드와 테스트 68/68, 운영 배포 전 | 사용자 원문 `방금 변경한 선택박스의 간격으로 피드백추가 팝업에서 등록영상 연결하는 곳의 조건필터 선택박스도 맞춰줘` |
| exec-052-014 | 2026-11-06 09:56 | resume | codex → codex / codex_scoped | 등록영상 연결에서 `안 써본 것`·`많이 쓴 순` 제거, 상황 체크박스 3열. 360/390/412px 라벨 잘림·가로 넘침 0, 기타 입력과 즐겨찾기 조회 확인. 로컬 후보 `2feb5cc`, 웹 빌드·테스트 68/68, 운영 배포 전 | 사용자 필터 제거 요청 및 후속 응답 `상황 · 선택 항목의 체크박스를 한줄에 3개씩 배치하는걸로 변경해줘` |
| exec-052-015 | 2026-11-06 10:06 | resume | codex → codex / codex_scoped | 영상 선택 행에 참고영상 썸네일 헬퍼 적용, 우측 미리보기와 행 선택 분리, 플러스·영상별 조회·써봤음 제거. 360/390/412px 넘침 0, 미리보기와 선택 독립 확인. 합성 썸네일 URL 및 이미지 실패 대체 표시는 자동 검사. 로컬 후보 `d690e6e`, 웹 빌드·테스트 68/68, 운영 배포 전 | 사용자 원문 `그 위치에 '미리보기'버튼을 배치해주고 ... 영상의 썸네일을 보여주고 조회와 써봤음도 제거` |
| exec-052-016 | 2026-11-06 10:08 | resume | codex → codex / codex_scoped | 사용자 확인 미리보기와 운영 기준 `e654ac0` 위의 후보 `d690e6e` 변경 8파일 일치 확인. 기존 웹 테스트 68/68과 빌드 결과를 동일 후보 증거로 유지. 운영 배포 전 | 사용자 원문 `데모화면 확인했어. 이번에도 너가 직접 작업 후에 결과 보고해줘` |
| exec-052-017 | 2026-11-06 11:31 | resume | codex → codex / codex_scoped | 사용자 승인으로 `d690e6e` 배포 준비. 독립 정적 감사 PASS, 신규 결함 0, 기존 키보드 Escape 동작 LOW 관찰 1. 격리 브라우저에서 합성 썸네일 로드·선택 유지 및 412/1280px 화면 확인 | 사용자 원문 `운영에도 배포해주고 마무리 후에 결과 알려줘`, 독립 Reviewer `task-052-filter-release` |
| exec-052-018 | 2026-11-06 11:34 | resume | codex → codex / codex_scoped | 독립 자동 QA와 메인 브라우저 결과를 통합해 PASS, 신규 결함 0. 메인 Codex가 `d690e6e`를 운영 배포 완료 | 아래 배포 기록과 `RELEASE_RESULT` |
| exec-052-019 | 2026-11-06 12:56 | resume | codex → codex / codex_scoped | 사용자 실기기 확인을 기록하고 종료. 확인 대상 운영 릴리스 `20261106-113448-d690e6e3` (`d690e6e`) | 사용자 원문 `실기기에서 확인했어. 커밋 및 푸시 후에 해당 작업종료해줘` |

## 배포 기록

- 2026-11-05 15:07 KST, 릴리스 `20261105-150544-00d7a384` (`00d7a38406d7b1972f87532e29526bdfed158b92`), `RELEASE_RESULT status=ok`, webhook 종료 0. 이전 릴리스 `20261102-003239-97b5d3f3`.
- 운영 DB `bjj`에서 051 테이블 생성 및 052 컬럼 3개 추가를 먼저 적용했다. 각 스크립트의 `--verify` 통과, 초기 행 0. 배포된 릴리스 코드로 다시 검증했다. `RELEASE_RESULT migrated=false`는 webhook 자체가 DDL을 실행하지 않았다는 뜻이다.
- Deployer의 공식 `--status`에서 pm2 online, `current`와 후보 SHA 일치, 내부 헬스 200. 공개 `/health` 200, 로그인 화면 렌더링, 후보와 동일한 JS/CSS 로딩, 비로그인 피드백 API 401을 확인했다. 운영 로그인 후 사용자 동작, 운영 실제 관장 CLI 및 Android 실기기 검증은 범위에서 제외해 기록한다.
- 2026-11-06 09:07:10 KST, 팝업 후속 릴리스 `20261106-090659-e654ac06` (`e654ac065dcb97577be10159105085abdea78bd6`), `RELEASE_RESULT status=ok`, `migrated=false`. 이전 릴리스 `20261105-150544-00d7a384`. 승인된 5개 웹 변경 파일만 fast-forward push로 배포했다.
- 독립 Reviewer 및 QA PASS/0, 후보 웹 테스트 68/68 및 빌드 성공. 메인 Codex는 360·390·412·1280px에서 두 버튼의 표시 높이 약 39.6px와 터치 높이 약 45.6px를 확인했다. 412·1280px의 복기 상세에서 위쪽 여백, 가로 넘침 0, 닫기 초점 복귀 및 합성 AI HTML 문자열의 텍스트 렌더링을 확인했다.
- 공식 상태에서 대상 릴리스 활성화, pm2 online 및 재시작 0, 운영 헬스 200을 확인했다. 운영 JS·CSS는 QA 빌드와 바이트 단위로 일치했다. 브라우저에서 운영 로그인 화면을 확인했으며 인증 후 팝업은 미확인이다.
- 2026-11-06 11:34:58 KST, 필터·영상 선택 후속 릴리스 `20261106-113448-d690e6e3` (`d690e6e39d5556e8cb18784a9271d7639681470f`), `RELEASE_RESULT status=ok`, `migrated=false`. 이전 릴리스 `20261106-090659-e654ac06`. 승인된 웹 변경 8파일을 fast-forward push로 반영했다.
- 독립 리뷰 PASS 및 통합 release QA PASS, 신규 결함 0. 격리 웹 테스트 68/68, 빌드 222모듈. 메인 브라우저에서 영상 썸네일 합성 이미지 로드, 선택 상태 유지, 필터·페이지, 모바일 화면과 XSS 리터럴 표시를 확인했다. 영상 선택 기술 메뉴가 열린 상태에서 Escape를 누르면 상위 팝업이 닫히는 기존 저위험 동작은 별도 기록했다.
- 운영 `current`, pm2 online·재시작 0, 내부 및 공개 헬스 200을 확인했다. 운영 웹 파일과 QA 빌드는 바이트 단위로 일치하고 로그인 화면을 브라우저에서 확인했다. 운영 인증 후 필터·영상 선택 및 Android 실기기는 미확인이다.

## v2 구현 승인 및 현재 착수 범위

- 사용자 실제 원문: `이제 수정했던 데모화면 구현작업 시작해줘`. 바로 앞에 게시한 수정 데모 v2 기준 구현의 명시적 승인으로 보존한다. 같은 승인을 다시 묻지 않는다.
- 승인 정본: `docs/demo/task-052-feedback-library-v2.html`, SHA256 `b5ca80fb8c0864bd42e7d63722dc02dd6256802ae7bde3dc0771c3f511eb3fa5`. 실제 앱 기준은 기존 63674 React 앱이며 별도 레이아웃으로 대체하지 않는다.
- 공식 `approve-codex-context --version 2`를 최신 사용자 원문으로 1회 실행했으나 `DEMO_GATE_REFUSED: 승인 원문을 사용자 발화 기록과 세션 대화 기록에서 찾지 못했습니다`였다. 유효한 사람 승인과 기계 기록 실패를 구분한다. gate frontmatter/receipt/trust를 수동 수정·대리 생성하지 않고, 사용자에게 같은 승인 문구를 재요구하지 않는다.
- 현재 AGENTS는 Codex의 큰 구현을 Claude에 인계하도록 명시한다. 기존 claude 역할/브로커는 읽기 전용 외부 검토 창구이며 구현 실행기로 사용할 수 없다. 자동 인계 경로는 준비되지 않았으므로 기존 Claude 세션 인계 또는 이번 Codex 구현 예외의 실행 주체 결정을 사용자에게 질문했다. 이 질문은 v2 재승인 요청이 아니다.
- 결정과 독립적으로 승인 v2 구현 가이드 및 파일 범위·API 계약·검증/운영 경계를 담은 인계문을 준비한다. 아직 앱 구현·공유 DB 변경·테스트·push·배포는 하지 않았다.
- 최신 사용자 결정: **이번 작업은 Codex가 구현하도록 예외 허용**. 실행 주체 질문은 해소됐으며 재질문하지 않는다. 앞선 준비/미착수 기록은 해당 시점의 사실로 보존한다.
- 후속 읽기 전용 진단: 현재 세션의 task052 v2 review-request metadata는 존재하지만 `codex-contextual-prompts.jsonl` 수집 파일 자체가 없다. 승인 증거를 사후 조립하거나 상태를 대리 승인하지 않는다. 실제 웹 UI 편집 게이트는 여전히 미완료다. 독립적인 backend API 구현은 승인 v2의 범위에서 진행한다.
- 복수 상황 영속 저장은 기존 원문+선택 항목 별도 저장 또는 기존 문자열 조합 중 사용자에게 확인 중이다. 답변 전에는 해당 저장 구조를 임의 확정하지 않는다.
- 최신 확정 답변: `기존 기록 보존 + 선택 항목 별도 저장`, `제안한 규격으로 진행`. 신규 페이지 `/feedback`, 조회 `search`(기존 준비안 `q` 별칭도 호환), `techniqueId`로 등록 기술 소유권 확인, `trainingStatus` `assigned`/`training`/`completed`/null 계약을 적용한다. 기존 자유입력 문자열은 새 저장 항목을 명시적으로 바꾸기 전까지 보존한다.
- 사용자 원문 **`task-052만 기계 기록 예외 허용`**에 따라 이 작업에 한해 v2의 실제 사람 승인으로 구현한다. 공용 도구와 기계 상태는 수정하지 않으며 `DEMO_GATE_REFUSED`를 PASS라고 표시하거나 영수증을 생성하지 않는다. 원인 확인: 같은 세션의 task051(v5)·task052(v2) 기록이 모두 review_requested로 남아 contextual collector의 단일 대기 조건에 맞지 않으며 contextual 수집 파일 자체가 없다. 이 예외는 다른 task·버전·운영 변경·독립 검토를 포함하지 않는다.

## 관련 과거 이력 요약

[[task-051-feedback-recall-demo]]는 v5 승인에 따른 실제 화면/API를 구현하고 내부 검토 및 격리 SQL·브라우저 검증을 완료했다. 운영 DB 적용·push·배포는 하지 않았다. 수업과 독립된 피드백, 한 질문씩 관장 보완, 등록영상 공용 상세, 월 기본 복기를 보존한다. 기존 v5 승인은 재요청하지 않는다. 이번 신규 목록·입력 구조 변경에 한해 디자이너 데모를 먼저 만들고 새 변경분의 승인을 한 번 받는다. 공용 승인 도구를 변경하거나 승인 기록을 대리 생성하지 않는다.

## 역할별 지시사항

- 모든 역할: 같은 코드베이스에서 병행 작업 중이다. 타인의 변경을 되돌리지 않는다. 운영 DB/.env/운영 프로세스 접근·push·배포 금지. 본문 읽기 허용 범위를 먼저 준수하고 추가 경로는 Leader에게 요청한다. 지정 범위 밖 검토·해시·전송 금지. 역할 정의/공용 절차 읽기는 허용한다.
- Judge: 도구 기반 intake/demo 수준만 판정. 이 task와 역할/판정 도구 문서만 읽고 판단 기록에 append.
- Designer: docs/demo/task-052-feedback-library-vN.html 및 이 task Designer 절만 소유. 본문 허용: task-051 데모 v5·구현 가이드, web/src/{components,pages,contexts,utils,api,styles}/** 및 main.jsx, backend/src/routes/feedback.js·services/feedback.js·feedbackCore.js·feedbackTask.js·models/Feedback.js. 앱 소스 수정 금지. 기존 토큰/참고영상 구성 재사용, 행동 가능한 새 변경분 데모·lint·자체 점검.
- Backend 준비: backend/src/{services/feedback.js,services/feedbackCore.js,services/feedbackTask.js,routes/feedback.js,models/Feedback.js,models/ResearchTask.js,models/index.js}, backend/scripts/task-051-feedback-schema.js, backend/test/feedback* 와 web/src/api/feedback.js 를 읽어 API/데이터 보존 설계만 보고. 실제 코드 착수는 별도 인계 후. 결과 편집/삭제의 소유권·revision·AI stale 처리, 즐겨찾기 영속 저장과 조회 및 현재 과제 상태의 정확성 점검. 운영 스키마 변경 없이 준비.
- Reviewer/QA: 이후 확정한 파일 매니페스트로 독립 검토/격리 검증. 현재 새 기능 PASS 없음.

## Leader 설계

### v2 사용자 수정 (2026-11-05)

- 피드백 추가 닫기: 무조건 홈 이동을 제거하고 진입한 이전 화면으로 복귀한다. 전체 목록의 검색·필터·기술·페이지·스크롤도 보존한다. 홈에서 열었으면 홈, 전체 목록에서 열었으면 해당 목록 상태로 돌아간다. 직접 진입에 이전 앱 화면이 없을 때만 안전한 기본 화면을 사용한다. 미저장 내용은 기존 저장/계속 작성/명시적 취소 보호와 함께 처리한다.
- `63674`는 기존 실제 React 앱 코드+격리 API 검증 환경이고, `63675/v1.html`은 별도 합성 HTML 데모였다. Leader가 디자이너의 홈 단순화/새 목업 스타일을 사용자에게 기존 앱과 같다고 보이게 게시해 차이가 생긴 책임을 설명했다.
- v2는 63674의 실제 HomePage/Layout/FeedbackPanel/참고영상 구성과 스타일을 기준으로 새 변경 부분만 반영한다. 기존 홈 구성·카드 순서·기록 영역·모달 체계·하단 메뉴 아이콘과 여백을 재설계하지 않는다. 실제 앱을 별도 데모로 대체하지 않는다.
- v1 게시본/해시/63674 사용자 미저장 내용은 보존한다. 새 파일 v2로 게시하고 새 수정 사항을 검증한다. 이번 요청을 데모 승인이나 앱 배포 승인으로 간주하지 않는다.
- 실제 코드 확인: `FeedbackContext.requestClose`는 controller.close만 호출하고, `FeedbackPanel`은 fullScreen Modal로 표시한다. 닫기에서 navigate/home 이동을 하지 않는다. v1 `renderInput`의 닫기 버튼이 `data-action="go" data-value="home"`로 잘못 고정되어 있었다. 따라서 원인 수정 대상은 데모이며 실제 앱의 정상 닫기를 새 라우팅으로 바꾸지 않는다.
- 기존 화면 비교용으로 사용자 탭과 별도 63674 탭9를 열어 390×844 viewport에서 홈/빈 입력 모달을 관찰했다. 사용자 탭7의 미저장 내용은 건드리지 않았다. `.app-shell` DOM, tokens/app/feedback CSS 3태그와 screenshot을 로컬 artifact에 저장해 Designer에게 읽기 범위를 명시했다(외부 전송 없음). baseline 스타일은 body bg rgb(12,13,18), app-content padding 0/20/80px, Noto Sans KR/system fallback이다.

- 카드 정리 상태와 훈련 상태는 별개 배지. 훈련완료는 결과 중 done 존재 여부에서 파생하며 편집/삭제 직후 재계산한다.
- 기존 자유입력 기술·상황을 덮어쓰거나 재분류하지 않는다. 미등록 기존 기술/기타 상황도 원문 보존하고 명시적 사용자 변경 시에만 저장한다.
- '완료' 필터는 훈련완료. 즐겨찾기는 사용자 토글 후 저장하는 별도 속성. 최신순은 저장된 날짜/ID의 안정 정렬 기준을 가이드에 명시한다.
- 영상 5개 페이징·기존 ClipDetailModal·질문 이전/답변 보존·수업추가 원래 폼은 유지한다.
- 서버 계약 준비안: 전체 목록 `search/filter/technique/page/limit`, 기본 10개, 필터 적용 후 total과 페이지 계산. 홈 기본 정렬은 date DESC, id DESC 최신 3개. 완료 필터는 결과 중 done이 존재하는 기록이다.
- `starred`는 본문/AI hash와 독립된 boolean 컬럼 및 명시 set API로 계획한다. 목록/상세 응답 경합 시 새 즐겨찾기를 낡은 DTO로 덮지 않도록 캐시 무효화/최신 조회를 인계한다. 실제 스키마 적용은 별도 승인된 운영 절차이며 이번 준비 단계에서 수행하지 않는다.
- 결과 수정은 기존 UUID/createdAt 보존, 삭제는 해당 결과만 제거. 두 작업 모두 user_id 소유권·revision CAS를 확인하고 실행 중 AI 토큰을 무효화해 낡은 요약이 새로 덮이지 않게 한다.
- 후속 구현의 계정 격리 경로 변경은 프로젝트 judge 맞춤 규칙에 따라 R2로 취급한다. intake 원문 R1은 수정하지 않으며 Leader 보강 사유를 별도 기록한다. 현재 단계는 데모·설계 준비이고 새 기능 코드/QA PASS는 없다.

## 판단 기록 (judge)

- [2026-11-05 09:24 KST] intake engine=jev → task_type=feature, complexity=2.03, risk=R1, developer_model=opus, needs_info=false, next=demo_first; demo=delta/designer(JV-ui_change), publish=artifact+repo, actions=prepare_demo/request_demo_approval/assign_developer | overrides=없음 | fallback=- | tokens=1336

## Designer 기록

- [09:32] Judge delta 기준 변경분 데모 `docs/demo/task-052-feedback-library-v1.html` 작성. 앱 소스는 수정하지 않았다. 본문 접근: 허용된 task-052 이력서, task-051 v5 데모 상단, web/src/pages/ClipsPage.jsx, components/FeedbackPanel.jsx·FeedbackSummary.jsx·ClipEditor.jsx·Layout.jsx·Pagination.jsx·Button.jsx·Card.jsx, styles/tokens.css, api/feedback.js, backend/src/routes/feedback.js 및 역할에서 지정한 공용 디자인 스킬만. 범위 밖 본문 읽기/외부 전송 없음.
- [09:32] 레이아웃: 홈 최근 3개+전체 보기 → 검색/필터/기술조건/10개 페이징 목록 → 정리·훈련 두 상태 배지와 상세 → 저장 내역 옆 수정/삭제. 등록 기술 1개 검색선택, 상황 복수 체크·기타만 텍스트. 현재 과제는 1개이며 유지/교체 확인을 거친다. 결과 변경 뒤 훈련 상태 즉시 재계산, 이전 내용 기준 안내와 다시 정리도 보존한다.
- [09:32] 디자인 스킬: page-layout-designer, ui-component-builder, ui-design-reviewer, ui-accessibility-reviewer / 자체 코드 점검 P0 0·P1 0·P2 0, a11y Critical 0·Major 0·Minor 0. 네이티브 dialog의 Esc/초점 복귀, 재렌더 시 활성 컨트롤 초점 보존, 상황 체크 이후 동일 항목/기타 입력 초점, 44px 액션, 상태 텍스트·성공/실패 알림, 삭제 확인/실패/취소/성공 설계. 실제 폭/브라우저 점검은 Leader/QA 별도 근거로 기록한다.
- [09:32] `DEMO_LINT_PASSED` 및 인라인 JS 구문 검사 PASS. 정상/로딩/빈/조회오류, 조건 결과 없음, 수정 저장 실패, 삭제 실패 상태를 데모에서 조작할 수 있다. 기존 등록영상 선택은 5개 페이징, 상세는 외부 재생 없이 공용 팝업의 구성 예시로 표시한다. 데모 데이터는 합성·메모리 전용. 공개 전 Leader/QA 사전 점검 중이며 사용자 승인 및 승인판 구현 가이드는 아직 없음.

- [10:09] 사용자 v1 수정 요청에 따라 새 `docs/demo/task-052-feedback-library-v2.html` 작성. v1 게시본은 변경하지 않았다. 닫기는 source 홈/전체목록을 유지하는 실제 앱과 같은 fullScreen Modal 오버레이로 수정하고 검색·필터·기술·페이지·스크롤 및 CTA 초점을 복원한다. 미저장 내용은 저장/폐기/계속 편집으로 보호한다. 보완중 기록에는 입력·answers·질문index·단계를 저장하고 재열 때 이어가며 정리 시 같은 id를 갱신한다.
- [10:09] v2는 Leader가 명시 허용한 `task-052-baseline-home-dom.json`·홈/입력 390px 캡처를 읽어 `.app-shell`/관장 바/기존 홈 모든 카드/하단 SVG를 복사하고 피드백 영역만 교체했다. 본문 추가 접근은 기존 허용 web/src 범위의 HomePage·MasterBar·WeeklyTaskCard·Modal·ToggleTab·Icon·toggleNav·app.css·feedback.css와 공용 디자인 스킬 재독이다. 합성 텍스트로 치환하고 외부 전송/네트워크 참조는 없앴다. 앱 소스/원본 CSS는 수정하지 않았다.
- [10:09] 초안 사전 점검에서 @import URL의 세미콜론을 잘못 자른 잔재가 CSS reset을 무효화한 문제와 보완 답변 save/close 유실을 Leader/QA가 발견했다. v2 안에서 해당 잔재 완전 삭제 및 입력·보완답변 스냅샷 저장/재개로 교정했다. 이는 실제 앱 결함이 아닌 데모 작성 오류다. `DEMO_LINT_PASSED`·JS 구문 PASS, 현재 후보 SHA256 `b5ca80fb8c0864bd42e7d63722dc02dd6256802ae7bde3dc0771c3f511eb3fa5`. 최종 브라우저/QA 판정과 사용자 승인 대기이며 승인판 구현 가이드는 아직 작성하지 않았다.

- [13:41] 실제 실행 도구: Codex / 범위: 승인 v2 구현 가이드 준비. 사용자 원문 “이제 수정했던 데모화면 구현작업 시작해줘”와 hash `b5ca80fb8c0864bd42e7d63722dc02dd6256802ae7bde3dc0771c3f511eb3fa5`를 기준으로 `docs/task-052-feedback-implementation.md` 작성. 이번 작업에서 해시 일치를 재확인했다. AGENTS의 사전승인/TASK-TOOL-CONTEXT를 읽었고 공통 담당·절차 metadata는 Leader 관리로 남겼다. 공식 approve-codex-context의 REFUSED/기계게이트 미완료는 사람의 구현 승인과 구분해 가이드에 명시했다. 대리 승인·receipt/PASS 생성 없음.
- [13:41] 가이드는 기존 홈/SVG내비/Modal 구조 보존, source 화면·검색·조건·페이지·스크롤 유지, 3개 최근목록/훈련 상태, 전체 조회, 기술·상황 선택, 결과 수정삭제, 대화·영상·기간복기 보존을 인계한다. 새 앱 코드·신규 도구 실행·테스트·운영 DB·push·배포는 하지 않았다. 이번 추가 본문 접근: 현재 AGENTS, task052 이력서/승인 v2, 허용 web/src의 main·FeedbackContext·api/feedback·FeedbackPanel·FeedbackHomeCard·FeedbackClipPicker·TagPicker·feedbackRecordController. 다른 task 본문·backend·범위 밖 파일 읽기/외부 전송 없음.
- [13:41] 새 기술적 선택을 임의 확정하지 않고 §8로 보고: 목록 검색키 search/q 기록 불일치, 신규 목록 실제 경로/파일명, 상황 복수 체크의 영속 metadata 표현, 선택 기술 ID/기존 명칭의 전송키·해제 표현. 이미 확정된 v2 화면·닫기 승인은 반복 요청하지 않는다. 구현 실행 주체는 Leader의 사용자 확인 단계와 구분한다.

## Developer 기록 — backend 준비

- [09:25] 허용 범위의 feedback 서비스/core/task/routes/model·ResearchTask·기존 명시 스키마·feedback 테스트·프론트 API 본문을 확인했다. 추가로 Leader가 허용한 `backend/src/models/Technique.js`, `backend/src/routes/techniques.js` 두 파일을 읽었다. 앱 코드 수정·실행·DB/.env 접근·외부 전송 없음. 테스트는 구조를 읽었으며 새 기능 테스트를 실행하거나 PASS한 것이 아니다.
- [09:25] 결과 항목은 UUID `id`, `date/outcome/context/note/createdAt`; Feedback 행 revision CAS로 동시 변경을 막는다. 제안 API: PATCH `/:id/results/:resultId` `{revision,date,outcome,context,note}`, DELETE 같은 경로 `{revision}`. 소유 Feedback를 먼저 조회하고 배열 내 정확한 id만 수정/삭제, 없으면404, 잘못된 값400, 낡은revision409. 수정은 id/createdAt 유지 및 updatedAt 추가, 삭제는 나머지 결과/원문/대화 보존. 두 동작 모두 기존 추가와 동일하게 AI token을 idle로 무효화한다. results가 snapshotHash 재료이므로 기존 요약은 보존하고 stale이 파생된다. 복기 집계는 수정된 결과 날짜/내용에서 재계산한다.
- [09:25] 상태는 `results.some(outcome==='done')`이면 completed, 그 외 결과가 있으면 training, 결과 없이 실제 열린 ResearchTask와 task_binding.taskId가 일치하면 assigned, 아니면 없음. task_binding은 과거 이력이므로 그 존재만으로 과제중 판정 금지. user_id와 closed_at:null 조건의 현재 과제 조회를 목록당 한 번만 배치하고 get/list/recap에 동일 파생값을 제공한다. 교체/마감 과제에 과제중이 남지 않으며 마지막 done 삭제/수정 후 재계산한다.
- [09:25] 목록 제안: GET `/feedback?filter=all|recent|starred|completed&technique=<name>&q=<text>&page&limit`, 홈은 limit3 유지. 날짜/필터/기술/검색을 먼저 적용하고 total과 page를 구한다. 최신순은 date DESC,id DESC(현재 기본과 호환); 전체도 같은 안정 정렬을 기본으로 둔다. completed의 JSON outcome 조건은 pagination 이전 DB에서 안전하게 적용하며 JSON 비정상/NULL은 완료로 보지 않는다. 임의 문자열 SQL 삽입 금지. 즐겨찾기는 명시 boolean `starred`가 유리하다.
- [09:25] 저장 대안: (A 권고) `starred BOOLEAN NOT NULL DEFAULT false` 1컬럼과 필요 시 owner/star/date/id 인덱스만 추가하는 별도 명시 task052 스크립트. information_schema 사전 검사·오프라인 dry-run·명시 DB 확인을 유지하며 기존 task051 CREATE 스크립트를 ALTER 도구로 바꾸지 않는다. 기존 행 기본false, 텍스트/대화/결과 무변경. 운영 적용은 승인 전 금지. (B 무DDL) dialogue JSON에 starred 메타데이터를 추가할 수 있으나 대화와 목록 저장 책임이 섞이고 JSON 조건 조회/검증이 복잡해 권고하지 않는다. Favorite는 AI 재료에서 제외. 현재 pending 완료가 시작 revision CAS에 묶여 있으므로 즐겨찾기 변경으로 revision만 올리고 pending을 유지하면 응답이 폐기되고 lease까지 잔류할 수 있다. 독립 멱등 metadata set 업데이트 또는 pending 중409 차단 계약이 필요함을 Leader에게 전달했다.
- [09:25] 기술 선택 최소 호환안: 새 선택은 선택된 Technique id의 user_id 소유권을 확인해 기존 technique에 기술명 스냅샷을 저장한다. 새 기술 FK/기존 문자열 자동매칭·일괄 변경은 필요하지 않다. 기존 문자열은 선택을 바꾸기 전 그대로 보존. 기술 조건도 현재 문자열을 조회하므로 과거 기술명이 삭제/변경되어도 기록은 사라지지 않는다. 상황 복수 선택은 현재 TEXT에 사람이 읽는 조합과 기타 원문을 저장하는 최소안이 가능하다. 다만 기존 자유문장을 delimiter로 추정 분해하면 오분류되므로 기존 비정형 문자열은 기타 원문으로 표시하고 untouched 저장에는 patch하지 않아야 한다. 복수 선택 복원 정확성이 필요하면 dialogue에 명시 버전의 입력 metadata를 추가하고 기존 situation은 동일 의미의 문자열로 유지(해시에 이미 포함); UI가 보완 대화와 함께 보존하도록 별도 계약 필요.
- [09:25] 구현 후 필수 검증 계획: 교차 사용자/없는 결과404, 유효하지 않은 outcome/date400, 동시 수정/삭제409, done 여러 개와 마지막 done 제거의 상태, 현재 과제 교체/마감, 3개 limit 및 필터 선적용/total/page, 즐겨찾기 재조회·AI pending 경합, 기술 소유권, 기존 자유문장 untouched 보존, 결과 날짜 이동에 따른 기간 복기, 입력/대화/요약 보존을 격리 DB에서 확인한다. 새 기능 구현/검증 전 단계이며 완료 주장 없음.
- [09:25] Leader 설계 확정 반영: starred 별도 boolean 1컬럼 및 본문 revision/AI hash와 독립적인 명시 set을 채택. 제안 계약 `PUT /feedback/:id/star` `{starred:boolean}` → `{id,starred}`(멱등 set, toggle 아님), 소유권404·비boolean400, 본문/대화/results/revision/AI token 미변경. 전체 DTO에는 starred와 trainingStatus를 추가한다. 생성 기본false, 기존 DTO/API 필드는 호환 유지. 즐겨찾기 응답과 다른 본문 mutation 응답이 경합할 때 클라이언트가 오래된 DTO로 starred를 되돌려 표시하지 않도록 별도 cache invalidation/최신 GET 합의가 필요하다. 신규 명시 마이그레이션은 검증/SQL 계획만 준비하고 아직 작성·적용하지 않는다. 결과 PATCH/DELETE, 소유 기술 id 확인→이름 스냅샷, 현재 task 일치 판정의 앞선 권고는 채택됐다. 구현 지시 전 대기.

- [14:06] Codex로 배정 backend 구현. 실행 기록 exec-052-003의 사용자 일회성 예외와 승인 v2 SHA256 `b5ca80fb8c0864bd42e7d63722dc02dd6256802ae7bde3dc0771c3f511eb3fa5` 인계, AGENTS 사전승인/TASK-TOOL-CONTEXT 확인. Leader가 사용자 원문 '기존 기록 보존 + 선택 항목 별도 저장', '제안한 규격으로 진행'과 상황 선택 enum/목록·기술 계약의 결정을 전달한 뒤 해당 부분을 구현했다. 화면 파일·데모/게이트 설정·공통 실행 metadata 수정 없음.
- [14:06] 변경 범위: `backend/src/services/feedback.js`, `feedbackCore.js`, `backend/src/routes/feedback.js`, `backend/src/models/Feedback.js`, `backend/scripts/task-052-feedback-schema.js`, `backend/test/feedback.library.test.js`, `backend/test/feedback.test.js`. 결과 PATCH/DELETE 정확한 UUID/createdAt 보존·revision CAS·진행 AI 무효화, PUT star 별도 멱등 set, 현재 과제 상태의 계정 단위 일괄조회, 목록 DB 선필터·안정정렬·요청 시 전체 과거 기술옵션, techniqueId 소유 검증과 기술명 snapshot, 별도 상황 메타데이터와 기존 상황 원문 보존. 승인 v2 새 기타 공백 금지·최대200자, 옛 상황 문자열 제한/값은 그대로. body DTO와 별도 starred 응답 경합은 UI cache 갱신 원칙 인계.
- [14:06] 검증: 로컬 의존성을 사용한 `node --test backend/test/feedback.library.test.js backend/test/feedback.test.js` 25/25, 이후 v2 기타 서버 제한 정렬을 반영해 직접 관련 `feedback.library.test.js` 8/8 재통과. 모의 모델·HTTP loopback에서 UUID/내용보존·404/400/409·CAS·늦은AI폐기·favorite pending 독립·상태 우선순위·상황 레거시 hash·기술 소유권 검증. 신규 스크립트 기본 dry-run은 DB 접속 없이 ADD 3컬럼 SQL 출력, 가짜 정보 스키마에서 적용/재실행/비호환 거절 검사. `git diff --check` 통과. SQL 함수/DDL의 실제 MariaDB 동작·브라우저·독립 Reviewer/QA는 이 기록의 검증 범위 밖이며 별도 담당에게 계약만 전달했다. 실제 DB/.env/기존 preview/운영 프로세스 접근·외부 전송·DDL 적용·push 없음.
- [14:16] Codex 수정. 격리 SQL QA가 재현한 NFD 원문/NFC 검색 누락에 대해 `backend/src/services/feedback.js`에 NFC/NFD 검색어의 LOCATE OR 조건과 기술명 두 정규형의 동등 비교를 적용했다. SQL의 필터 선적용과 와일드카드 리터럴 처리를 유지했다. 원문·collation·스키마 변경 없음. 기존 단위/HTTP 25/25 및 `git diff --check` 통과. 새 파일 SHA256 `08b9d8427472b9e33cb2c9bb75ab976a84c6f769e99437397aad8ef3a51f81e1`. 동일 단어 안에 NFC/NFD가 섞인 비정규 문자열까지 보장하지 않는다. 독립 Reviewer와 실SQL 재검사는 Leader에게 인계했다.

- [14:36] Codex C2 ⑤ 호환 보완. 기준 3f67d5d에서 `GET /feedback`의 `limit` 생략 시 20개임을 확인하고 `backend/src/services/feedback.js`에서 기존 API 기본값을 복원했다. 승인 화면의 명시 limit 10과 홈 limit 3은 그대로 적용된다. 기존 `backend/test/feedback.test.js`의 페이징 사례에 합성 21개 기준 기본20/명시10 검사 추가. 로컬 단위/HTTP 25/25 및 `git diff --check` 통과. 실제 DB, .env, 운영 미접근. C2 ① 결과 변경 중 AI 정책은 별도 사용자 결정 범위로 유지한다.

- [14:54] Codex C2 ① 보완. Leader가 전달한 사용자 결정 ‘정리가 끝날 때까지 결과 저장·수정·삭제를 잠시 잠금’에 따라 서버의 결과 추가/PATCH/DELETE 모두에 `pending` + `summarize` 409 가드를 적용했다. 소유권·revision을 먼저 확인하고 잠금 시 토큰, 본문 revision, 결과를 건드리지 않는다. 요청과 정리 시작 경합은 기존 revision CAS로 보호하고 질문 pending 동작은 유지한다. Frontend에 범위와 409 문구를 전달했다. 모의 모델/로컬 HTTP 26/26, `git diff --check` 통과. 새 회귀는 3종 잠금과 교차 사용자 404, 행 상태 보존, 실제 서비스 흐름의 합성 AI 정리 완료, 완료 후 3종 쓰기를 확인했다. 파일 `backend/src/services/feedback.js`, `backend/test/feedback.test.js`, `backend/test/feedback.library.test.js`. 실제 DB/.env/운영 및 git commit/push 미실행.

## Developer 기록 — task-052 격리 검증 fixture

- [14:10] 실제 수행 도구 Codex. 승인 v2의 격리 검증 fixture와 테스트만 준비했다. `backend/test/feedback.browser-server.js`, `feedback.browser-server.test.js`, `feedback.browser-support.test.js`, `feedback.browser-smoke.js`, `feedback.integration.test.js`, `feedback-README.md`에서 접속 조건을 `bjj_task052`, DB `127.0.0.1:9002`, 브라우저 fixture `127.0.0.1:9016`으로 맞췄다. task-051 실행 환경과 교차 설정은 guard에서 거부한다. 격리 DB에서 schema051→052 순서로 적용하는 코드와 synthetic AI가 연결된다.
- [14:10] SQL suite는 구 컬럼만으로 넣은 합성 행의 원문·기술명·정리·revision 보존, schema 재적용, 선택 상황과 등록 기술 소유권, pending 요약 중 즐겨찾기 변경, 결과 수정·삭제와 훈련 상태를 확인하도록 준비했다. 완료·기술·검색·기간 조합 후 total/page, 타 사용자 배제, `%`/`_` 리터럴, 한글 NFC/NFD 검색, 잘못된 결과 JSON을 각각 검증한다. HTTP smoke는 기존 보완 대화에 새 즐겨찾기·구조화 입력·목록 필터·결과 PATCH/DELETE를 추가했다.
- [14:10] 자체 실행 `env -u BJJ_FEEDBACK_TEST_DB node --test backend/test/feedback.browser-server.test.js backend/test/feedback.browser-support.test.js backend/test/feedback.integration.test.js` 종료 0, guard 3 통과, SQL/HTTP 5 건너뜀. 변경 테스트 JS 5개 `node --check`와 6개 파일 `git diff --check` 종료 0. 실제 SQL·fixture 기동·브라우저 검증은 독립 Reviewer 이후 Leader/QA가 수행한다. 실행 절차는 `backend/test/feedback-README.md`에 기록했다.
- [14:10] 본문 확인 범위는 AGENTS, task-052 이력서, 구현 가이드/인계문, 위 테스트 및 문서 6개, `backend/scripts/task-051-feedback-schema.js`, `backend/scripts/task-052-feedback-schema.js`, `backend/src/services/feedback.js`, `backend/src/services/feedbackCore.js`, `backend/src/routes/feedback.js`, `backend/src/models/Feedback.js`다. 시험 중 외부 전송과 실제 DB 접속은 없었다.

## Developer 기록 — Frontend

- [14:15] 실제 실행 도구는 Codex. 사용자 승인 v2와 task-052 한정 기계 기록 예외를 확인했다. 데모 SHA256 `b5ca80fb8c0864bd42e7d63722dc02dd6256802ae7bde3dc0771c3f511eb3fa5` 일치. 검사 첫 두 줄은 `DEMO_GATE_BLOCKED` / `task: task-052`였으며 승인 상태는 `review_requested` 그대로다.
- [14:15] React `Layout` 자식 `/feedback`을 추가하고 홈 최근 3개에 상태·전체 보기 진입을 연결했다. 전체 목록은 검색·필터·과거 저장 기술명·10개 페이지를 서버 결과로 적용한다. 모달 닫기 시 같은 목록과 검색 조건, 페이지 및 초점을 유지한다.
- [14:15] 등록 기술 ID 선택과 구조화 상황 체크를 기존 입력/보완 컨트롤러에 연결했다. 레거시 상황/기술은 사용자가 해당 항목을 바꾸기 전에는 재전송하지 않으며 긴 자유 상황도 별도로 그대로 표시한다. 새 상황 체크와 기타 텍스트는 3-way merge 및 PATCH에서 한 쌍으로 처리한다.
- [14:15] 즐겨찾기 set, 결과 인라인 PATCH/DELETE 및 실패·충돌 초안 보호를 구현했다. 즐겨찾기는 같은 ID의 연속 쓰기를 잠그고 이전 조회·본문 응답이 확정 별 값을 뒤집지 않도록 순서를 확인한다. 결과 변경은 전체 최신 DTO를 사용하며, 수정 또는 삭제 확인 후 같은 결과의 서버 값이 바뀌었으면 다시 확인해야 한다.
- [14:15] 자체 검사 `node --test web/src/utils/feedbackRecordController.test.js web/src/utils/feedbackPeriod.test.js` 41/41, `BJJ_UI_TEST_DEPS=/Users/brownjeon/.node-local/bjj-task052-validation.CMe1rr BJJ_UI_TEST_JSDOM=/Users/brownjeon/.node-local/themeal node --test web/src/components/FeedbackPanel.test.mjs` 11/11. 목록 복귀, 등록 기술/복수 상황, 즐겨찾기 카드 분리, 409 편집 보존과 확인된 결과만 삭제를 React DOM/합성 HTTP로 검사했다. 실제 브라우저·API·DB 통합 확인은 Reviewer/QA 범위다.
- [14:38] Codex C2 ②/④ 수정. 입력·전체 목록·상세·복기에 기존 자유 상황을 구조화 선택과 분리해 줄바꿈을 보존한 원문으로 표시했다. nullable 레코드의 체크 원복은 저장된 상황 스냅샷으로 돌아가며 PATCH와 대화 이력 보관이 발생하지 않는다. 비정상 기술 ID는 선택 및 직렬화에서 제외하고 명시적 null 해제를 유지했다. Controller/기간 43/43, React DOM 12/12, `git diff --check -- web` 통과. DOM 초기 검사는 테스트가 이전 Context 스냅샷을 읽어 실패했고 현재 컨트롤러 스냅샷을 검증하도록 고쳐 재실행했다. 실제 브라우저·API·DB 검사와 구분한다.
- [14:57] Codex C2 ①·⑥ 보완. 사용자 선택과 backend 계약에 맞춰 정리 `pending` + `summarize`에서만 결과 저장·수정·삭제 및 열린 삭제 확인을 잠갔다. 공통 컨트롤러 쓰기 가드와 기존 409 갱신으로 초안을 보존한다. 신규 결과의 작성 취소는 해당 초안만 초기화하고, 미저장 결과가 있을 때 닫기 확인에는 결과 저장을 우회하는 선택을 제공하지 않는다. Controller/기간 44/44, React DOM/합성 HTTP 14/14, `git diff --check` 통과. 실제 브라우저·관장 CLI·운영 접속·commit/push 미실행. 독립 재감사에 인계했다.

## Reviewer 기록

- [14:13] task052 검증 fixture 부분 정적 감사 PASS(전체 앱 판정 아님). 선택 매니페스트 6파일의 SHA256을 본문 검토 전후 대조해 모두 일치했다. import 전 task052 전용 DB 127.0.0.1:9002/bjj_task052 및 HTTP 127.0.0.1:9016 제한, 051→052 순서, 합성 사용자 단위 정리, 실제 feedback 서비스와 합성 인증·AI·보조 API 분리, 완료/복수 필터·결과 수정삭제 SQL 및 HTTP smoke 기대값을 확인했다. 테스트는 실행하거나 DB에 접속하지 않았다. 기존 052 스키마가 있으면 통합 테스트는 already-compatible도 통과하므로, 과거 행을 넣은 뒤 실제 ALTER 검증 주장은 빈 격리 DB의 최초 missing/apply 증거와 구분해야 한다. 선택 6파일 관련 본문과 task 역할 절만 읽었으며 외부 전송 및 코드 수정 없음. task052 한정 기계 기록 예외는 기계 gate PASS가 아니다.
- [14:09] task052 backend 부분 독립 정적 감사 PASS(전체 작업 PASS 아님). 지정 매니페스트의 7개 선택 파일 SHA256을 본문 검토 전후 대조해 모두 일치했다. 사용자 소유 기술·피드백·현재 과제, 기존 상황 원문/요약 해시, 별도 구조화 상황, 결과 UUID 보존·revision CAS 및 오래된 AI 결과 폐기, 즐겨찾기와 본문 revision/AI 독립성, 필터 선적용·안정 정렬·3컬럼 명시 마이그레이션의 코드를 확인했다. 잔여 정적 지적 없음. 실제 MariaDB JSON/문자 검색·조합별 전체 수와 페이지, NFC/NFD 검색, 화면의 즐겨찾기 응답 경합은 독립 QA 확인 대상으로 남긴다. Developer 보고 테스트는 Reviewer가 실행하지 않았다. 본문 검토: 매니페스트 7개 중 관련 구간(Feedback.js, routes/feedback.js, services/feedback.js·feedbackCore.js, task-052-feedback-schema.js, feedback.library.test.js, feedback.test.js); 보조 ResearchTask.js·feedbackTask.js 일부와 task 이력서. 허용 외 본문·외부 전송 없음. task052 한정 사용자 기계 기록 예외는 확인했으나 기계 gate PASS로 표시하지 않는다.
- [14:19] REV-052-final 내부 정적 감사 PASS (제품 전체 QA·배포 PASS 아님). review-final.json 선택 신규 UI 16개 및 backend 검색 1개를 지정 범위에서 검토하고 기존 부분 PASS 12개는 SHA256 동일성으로 결합했다. 전체 29개 기대 해시는 전후 모두 일치. 목록 조건·페이지·모달 복귀, 등록 기술과 상황의 기존 값 보존, 별도 즐겨찾기/DTO 경합, 결과 수정·삭제 revision 및 초안 보존, 통합 카드·과제 연결, NFC/NFD 원문 무변경 SQL 검색을 검토했으며 신규 정적 결함 없음. QA 우선: 실제 MariaDB NFC/NFD와 리터럴·소유권·필터/총수/페이지, 다중 화면 응답 경합 및 실패/409, 실제 브라우저 모달 닫기·스크롤/포커스와 영상·관장 흐름, 360/390/412px. 지원 본문은 구현 가이드 및 매니페스트 허용 기존 UI/API 관련 부분을 참조했다. 이전 052 fixture 감사의 최초 격리 스키마 적용 증거 제한은 유지한다. 테스트 실행·DB 접속·코드 변경·외부 전송 없음. 사용자 task052 한정 기계 기록 예외는 기계 게이트 PASS가 아니다.
- [14:33] C2 공식 Claude status=done, base 3f67d5d / head aaecade, 선택 18파일·7건 판정. ① MEDIUM 채택: 결과 추가/수정/삭제가 pending AI token을 idle로 지워 응답이 무고지 폐기된다. ② MEDIUM 채택: 기존 자유 상황에서 체크 후 해제해도 변경으로 저장되고 대화가 보관되며 기존 상황이 목록/복기/요약에서 보이지 않는다(원문은 DB에 잔존). ③ LOW 오탐: 승인 기준이 전체와 최신순 모두 날짜/ID 내림차순을 명시한다. ④ LOW 조건부 잔여 위험: 비정상 기술 ID가 null로 직렬화돼 해제될 수 있으나 정상 캐시에서 도달은 미확인. ⑤ LOW 범위 밖 호환성 미확인: API 기본 페이지 크기 변경, 선택된 호출자는 limit 명시. ⑥ LOW 채택: 새 결과 초안만 취소할 수 없어 다른 초안 폐기·모달 닫기로 이어질 수 있다. ⑦ LOW 오탐: 과제중은 실제 열린 과제 기준이며 상세 카드는 현재 정리까지 비교하는 별개 의미다. 수정 전 REV-052-final 전체 PASS 보류, 채택 건 최소 수정 후 재감사·QA 필요. 선정 18파일 기대 SHA 일치. 공식 외부 검토는 선택된 18파일에 한정되며 추가 전송·테스트·DB 접속·코드 수정 없음.
- [14:39] REV-052-C2-partial 정적 감사 PASS: C2 ② 자유 상황은 구조 체크와 별도로 목록·복기·카드에 표시하고, 레거시 체크를 전부 되돌리면 기존 null 상태로 회복해 불필요한 PATCH/대화 보관을 막는다. ④ 비정상 기술 ID는 선택 목록과 전송 단계에서 거르고 명시적 null 해제는 유지한다. ⑤ API 기본 limit 20으로 복원하며 목록 화면의 명시적 10은 유지한다. 해당 수정 12파일 본문 관련 부분과 테스트 코드를 검토하고 이전 검토 17파일은 해시만 확인했다. 29파일 기대 SHA는 전후 일치. 새 정적 지적 없음. 실행·DB·외부 전송·코드 수정 없음. ① 진행 중 AI와 결과 처리 및 ⑥ 새 결과 취소는 사용자 선택 대기로 미해결이므로 전체 PASS/QA 판정 아님.
## QA 기록

- [09:33][qa] 데모 v1 최종 후보 SHA-256 `b948a7ce11b733c7ee823fba6fd4a0fcf2669c5684847c46a4ac49bcb7f759af`를 확인하고 Node VM 합성 데이터 검토. done > 결과 존재 > 현재 과제 상태 우선순위, 홈 최신 3개, 완료 필터 및 즐겨찾기+기술 조건, 마지막 done 결과 수정·삭제 시 상태 재계산, 원문·다른 결과·다른 현재 과제 보존, 결과 변경 후 summaryStale과 과제 지정 disabled 표시 PASS. 과제 하나만 유지 및 기존 과제 유지/교체 분기는 게시 전 중간본에서 별도로 확인했다. 기술 선택 포커스의 정적 우려는 Leader 실제 브라우저에서 재현되지 않았다고 전달받았다. 기존 미등록 기술·자유 상황의 과거 레코드 편집 원문 보존은 이번 데모에서 시연하지 못했으며 후속 실제 구현 QA에서 확인한다. 본 결과는 새 앱 코드의 구현이나 실제 웹뷰/Android 검증 PASS가 아니다.

- [10:08] v2 후보 SHA256 `80765e3f73c5322470c6b2a4317cd3883d9ce94589d0308648a775b52908a5cd` 정적·Node VM 합성 확인: 이전 결함의 보완 답변과 대화 단계가 저장 스냅샷에 포함됨을 실행 확인, 기존 ID 재개·정리 경로는 소스로 확인. 닫기 공통 경로의 이전 화면·검색/필터/스크롤 복원을 합성 확인했으며 페이지는 소스상 조건 재계산 후 유효 범위로 유지된다. X/Escape 미저장 확인 경로와 상태 우선순위도 소스로 확인했다. v1 SHA `b948a7ce11b733c7ee823fba6fd4a0fcf2669c5684847c46a4ac49bcb7f759af` 불변, JS 구문 정상. 실제 렌더·브라우저 동작은 Leader 별도 검증이며 신규 앱 구현·API·DB 통과를 뜻하지 않는다.

- [10:10] v2 최종 후보 SHA256 `b5ca80fb8c0864bd42e7d63722dc02dd6256802ae7bde3dc0771c3f511eb3fa5` 재확인. Node VM 합성 실행: JS 구문·보완 답변/대화 단계 저장·목록 2페이지/스크롤 복원·빈 답변 dirty 방지 PASS. X/Esc 확인과 저장/폐기, 동일 기록 재개/정리, 답변 근거 표시는 정적 확인. 이전 후보에서 검색/필터 보존 합성 확인, 최종 동일 경로 확인. v1 b948 해시 불변. 실제 브라우저/실제 앱·API·DB 검증은 이 판정에 포함하지 않는다.

- [14:14] Codex 독립 backend 부분 QA **FAIL**. 격리 container `2a5a354741db220d8f8426a80a00816c9f5dc7490ea56b26255213229746fd34`, label `task=bjj-task052`, `127.0.0.1:9002`, `bjj_task052` 테스트 전 SHOW TABLES 0개, 매니페스트 13파일 원본·격리복사본·기대 SHA 일치를 확인. 지정 환경변수와 `node --test --test-concurrency=1 backend/test/feedback.integration.test.js` 실행 종료1: result edits 하위 테스트 1 통과, structured selection 하위 테스트 164행 실패(원문 NFD 저장 후 NFC `가나다` 검색 기대 [6], 실제 []; 원문 자체 보존은 통과). 이에 따라 그 뒤 pending/star/필터 검사는 미실행. 초기 legacy 051 스키마에 합성기록을 삽입하고 052 적용·재적용·원문/상황/기술/요약/revision 보존, 소유권·CAS·과제 검증은 해당 실패보다 먼저 통과. 테스트 후 세 컬럼 `starred`, `situation_options`, `situation_other` 존재 확인; 테스트가 실행 전 missing 목록을 출력하지 않아 이 기록만으로 각 ADD 실행 여부는 확정하지 않는다. 실제 UI/관장 CLI/운영 DB/배포 검증 아님. 추가 재실행 없이 Leader에게 결함 보고.

- [14:19] Codex backend 부분 재검증: 수정 `feedback.js` SHA `08b9d8427472b9e33cb2c9bb75ab976a84c6f769e99437397aad8ef3a51f81e1` 포함 선택 13파일 repo·Ubuntu 격리복사본·승인 매니페스트 일치. 기존 9002 전용 DB에서 동일 SQL 명령 1회 종료0, 상위 포함 3/3 PASS. 앞선 실패 NFD 원문을 NFC 검색어로 조회하는 경우 통과, NFD 기술명 검색/필터도 통과. 보완 중 즐겨찾기 변경과 revision 유지, 소유권·상황 검색·문자 그대로 10%_ 검색·필터/페이지 결합, 결과 수정/삭제와 상태 검증 통과. 이번은 기존 스키마 재적용 확인이며 앞선 fresh DB 최초 실행과 구분. 실제 UI·실 관장 CLI·운영 DB·배포 PASS 아님.

- [14:26] Codex 격리 HTTP/fixture 부분 QA: 9016 health `fixture=true`, PID4030385, `bjj_task052`, 실제 feedback 서비스/DB와 synthetic AI 확인. 지정 smoke 종료0 feedbackId=25, 실제 서비스 과제 taskId=7/nodeId=9/projectId=9 생성. 구조화 상황/기술·관장 문답/분기(합성 AI)·CAS409·즐겨찾기/필터·결과 수정/삭제·요약 오류 보존/재시도·복기 확인. 지정 server guard/support serial test 7/7 PASS, 기존 미지원 501 확인. 표식 `QA052 페이지` 사전 검색 0 확인 후 2026-10-01~11 합성 11개 ID26~36을 전용 API로 생성, 검색 total11·10개 기준 1페이지 10/2페이지 1 확인. 실제 CLI·운영 DB·배포 및 브라우저 UI는 이 증거에 포함하지 않음. 전체 최종판정은 C2 결과와 별도로 판단.

- [15:01][qa] Codex 독립 후보 `00d7a38406d7b1972f87532e29526bdfed158b92` 실행 확인. Mac 실제 후보 웹 빌드 220모듈 PASS, DOM·상태·기간 66/66 PASS. Ubuntu 후보 backend 단위·HTTP·fixture guard 29/29 및 기존 전용 MariaDB SQL 3/3 PASS. 기존 fixture PID4042224의 cwd·argv 확인 후 해당 프로세스만 종료하고 같은 격리 DB를 보존해 후보 fixture PID4051638을 기동했다. 문서 smoke PASS(합성 feedback 50), 지원 테스트 4/4 PASS. 추가 합성 feedback 52의 실제 HTTP에서 정리 pending 중 결과 추가·수정·삭제 각각 409, revision·결과·AI 진행 보존, 요약 완료 후 최신 revision 수정 200 확인. 첫 추가 검사는 완료 후 구 revision을 사용해 409로 테스트 assertion이 실패했으며 최신 revision으로 재실행해 통과했다. fixture 합성 AI delay 700ms 복원. 실제 관장 CLI·운영 DB·운영 배포·Android는 이 결과 범위 밖. 실제 브라우저는 Leader가 별도로 수행하므로 이 QA 실행 기록만으로 화면 통과를 주장하지 않는다.

- [15:03][qa] 후보 전체 판정 `INCOMPLETE`, 실행 범위 확인 결함 0건. Leader는 실제 React·격리 SQL·합성 AI의 새 결과 작성 취소 및 정리 진행 중 결과 버튼 잠금·완료 후 해제 확인을 전달했다. 해당 화면은 QA가 직접 관찰하지 않았다. QA 역할의 412px/1280px 가로 넘침·터치 대상·XSS 실측은 본 후보에서 미확인으로 Leader에게 전달했다.

- [15:06][qa] Leader의 후속 CUA 실측을 전달받아 미확인 항목을 해소했다. 후보 실제 앱·격리 SQL·합성 AI 화면에서 412×900 및 1280×900의 document scrollWidth는 각각 412·1280이고 dialog clientWidth/scrollWidth는 각각 410/410·458/458이다. 두 폭에서 실제 `--surface:#15171E`, 별도 light 모드는 소스 확인상 없다. 합성 AI summary의 `<img src=x onerror=void(0)>`는 텍스트로 보이고 해당 img 요소는 0개. 모바일 목록 버튼은 각각 44px 이상, 작성 취소·결과 저장은 166×44, 수정·삭제는 48×44. 관장 정리 중 쓰기 잠금·완료 후 해제 및 새 초안 취소도 Leader가 실측했고 뷰포트를 복원했다. 이 항목은 Leader 실행 결과이며 QA가 직접 브라우저를 조작한 것은 아니다. 위 직접 실행한 후보 테스트와 함께 **전체 QA verdict=PASS, 발견 결함 0건**. 운영·실제 CLI·Android는 별도 미검증 범위다.

## 검증 기록

### 실제 앱 구현 1차 검증 및 C2 수정 순환

- 앱/fixture 코드 `aaecade347a6f515bb70e83b64183de816ff6d30`, 선택 29개. `REV-052-final` 1차 내부 정적 감사와 Mac-local Vite build(220모듈) 통과. 소스↔Mac UI16/Ubuntu backend·fixture13 해시 일치. 웹/서버 기존 실제 앱을 확장했으며 별도 HTML로 대체하지 않았다.
- 격리 DB 최초 테스트에서 051 형식 합성 행을 넣은 뒤 052 세 컬럼과 기존 값 보존을 확인했다. 첫 실행에서 기존 NFD 원문의 NFC 검색이 0건으로 실패해 원문을 바꾸지 않고 NFC/NFD 조회 조건을 수정했다. 수정 후 전용 MariaDB 3/3 통과, 리터럴 검색·기술/기간/완료 조합과 소유권·즐겨찾기·CAS 확인. 재실행은 기존 격리 스키마의 멱등 확인이다.
- 실제 라우터 HTTP smoke PASS(피드백25, 과제7/노드9/프로젝트9), guard/support7/7. 인증과 AI는 합성. 현재 사용자 DB/운영 환경·실제 관장 CLI는 실행하지 않았다.
- 1차 CUA 실제 앱 `http://127.0.0.1:63676/`: 홈 최근3, 검색11개→2페이지1개와 닫기 후 검색/페이지/초점 복귀, 상세를 클릭할 때 스크롤 1043→1043 유지, 등록 오모플라타+수업/영상복기/기타 입력 저장·재열기, 미저장 계속 편집, 기존 결과 수정→훈련완료/이전요약 표시, 삭제 확인 취소, 공용 영상 모달과 Esc, 완료/기술/검색 복합조건 복귀, 별 제거/추가·즐겨찾기 목록 반영. 이 증거는 1차 코드에만 적용하며 후속 수정 결과를 대신하지 않는다.
- 공식 Claude C2 `done`(1회, aaecade의 선택 제품 소스18, 스키마/테스트/문서 제외), 지적7(M2/L5). 내부 Reviewer가 ① 진행 중 정리 무안내 중단, ② legacy 상황이 가려지고 선택 원복 후에도 archive 위험, ⑥ 신규 결과 초안만 취소 불가를 채택해 1차 PASS를 보류했다. ③·⑦은 승인 기준과 일치, ④·⑤는 조건부/범위 밖 호환 미확인으로 구분했다.
- ②는 기존 원문 보존과 무변경 저장에 해당하므로 바로 수정 배정했다. ① 정리 중 결과 변경 잠금 또는 중단 안내 후 변경 허용, ⑥ 작성 취소 추가는 사용자에게 하나의 선택으로 질문했다. 선택 전에는 해당 동작을 임의 변경하지 않는다. 기존 서버 기본 limit20 복원은 기존 호출 호환이며 새 목록은 계속 명시 limit10.
- 독립 후속 수정 `2e3575de773927471bdda9b9b03e3dd7be0e9842`: ② 기존 자유입력 원문 별도 표시/체크 원복 무변경, ④ 비정상 등록기술 ID가 null 해제로 전송되지 않도록 차단, ⑤ 기존 기본 limit20 복원. Reviewer `REV-052-C2-partial` PASS, 12변경+17동일 해시. 작성자 Backend 25/25, Controller/기간 43/43, React DOM 12/12, Mac-local Vite build 220모듈 PASS. 이 부분 판정은 ①·⑥을 해소하거나 전체 PASS라는 뜻이 아니다.
- CUA 후속: 기존 자유 상황 레코드에서 수업 체크→해제 시 dirty true→false, 원문 표시와 목록 복귀 확인. 실제로 새 상황 `수업`을 저장한 뒤에도 원문이 목록에 함께 표시됐다. 360/390/412 viewport에서 가로 넘침 없음. 실제 화면 캡처 `task-052-validation/actual-{home,feedback-list}-390.jpg`. 뷰포트 reset, IAB 실제 앱 탭 유지.
- 동일 후속 소스↔격리 복사본 29/29 해시 일치. task052 전용 Ubuntu fixture를 PID4030385의 cwd/argv 확인 후 해당 PID만 교체(PID4042224), 기존 DB 유지. 실제 HTTP 재조회로 합성 피드백25 완료/별, 32 기존 원문+별도 수업 선택, 37 기술/기타 입력이 서버 재시작 후에도 유지됨을 확인했다. 63674/051 서비스 미변경.
- 현재 실제 앱 검증 주소 `http://127.0.0.1:63676/feedback`. 원래 `63674` 사용자 작업과 데이터를 보존하는 격리 앱코드 실행본이다. 052 DB bjj_task052(9002), fixture9016, 로컬 Vite PID62212/SSH PID62211. 정리 중 결과 정책/작성 취소에 답변을 받은 뒤 좁은 구현·재감사·QA가 남아 있다.

- 최종 데모 v1 SHA256 `b948a7ce11b733c7ee823fba6fd4a0fcf2669c5684847c46a4ac49bcb7f759af`. 저장소와 정적 preview 복사본 해시 일치. 공식 lint PASS 및 review_requested 기록 완료. 게시 후 같은 버전은 수정하지 않는다.
- Leader CUA: 별도 탭 `http://127.0.0.1:63675/v1.html`에서 홈 최근 3개/상태 3종, 전체 12개 중 10+2 페이지, 완료 2개와 보우 앤 애로우 기술 조건 조합 1개, 즐겨찾기 3개를 확인했다. 기술 검색/선택 후 체크한 상황 유지, 기타 선택 때만 입력란 노출을 확인했다. 기술 선택 후 포커스는 '기술 다시 선택', 영상 선택 후에는 '등록영상 선택' 버튼으로 복귀했다.
- Leader CUA: 저장 결과를 동일 폼에 펼쳐 done→tried_failed 수정하면 훈련중으로 재계산. 삭제 확인 취소/합성 실패에서 기록 보존, 성공 시 마지막 done 제거→훈련중 및 이전 내용 기준 안내를 확인했다. 삭제·수정 대상은 메모리 안 합성 데모 데이터이며 새로고침으로 초기화된다. 실제 API/운영 DB 검증이 아니다.
- 데모 내부 검토 폭 360/390/412에서 app clientWidth와 scrollWidth가 각각 358/358, 388/388, 410/410으로 가로 넘침 없음을 관찰했다. 실제 좁은 브라우저 viewport/Android WebView 검증과 구분한다.
- QA는 최종 동일 해시의 정적·Node VM 합성 검증을 수행했다(자기 절 참조). 현재 과제 중복 fixture를 공개 전 수정하고 단일 현재 과제의 유지/교체·완료 결과 우선순위·다른 결과/원문 보존을 점검했다. 기존 미등록 기술·상황 편집 호환은 후속 실제 구현 QA에서 확인할 항목이다.
- 사용자 기존 앱 탭에는 미저장 입력이 열려 있어 조작·종료하지 않았다. 새 demo만 별도 탭으로 검증했고 완료 시 탭을 유지했다. 원본 screenshot은 thread artifact의 `task-052-feedback-{home,statuses}-v1.jpg`에 저장했다.
- 미실행: 새 기능 앱 소스 구현, 새 API/DB 테스트, Reviewer 코드 감사, 실제 관장 CLI, 운영 스키마 적용·push·배포. 기존 task051 코드의 검증을 새 변경분 완료로 확대하지 않는다.
- preview는 루프백 63675, PID38724, 소유 기록은 thread artifact `task-052-preview/server.json`. 기존 63673/63674 서비스는 보존한다.

## 사용자 결정

### v2 수정본 검증·게시 (2026-11-05 10:11 KST)

- v2 정본/preview 해시 `b5ca80fb8c0864bd42e7d63722dc02dd6256802ae7bde3dc0771c3f511eb3fa5`, 공식 lint PASS, 새 버전 review_requested. URL `http://127.0.0.1:63675/v2.html`. v1 `b948a7ce...` 해시 불변, 실제 앱 소스 변경 없음.
- 기존 홈 DOM·tokens/app/feedback CSS 및 SVG 내비게이션을 기준으로 복원했다. 공개 전 CUA 비교에서 CSS import 제거 정규식이 URL 내부 세미콜론 뒤를 남겨 reset이 무효화되는 데모 오류를 찾았고, 해당 잔재를 제거했다. 수정 뒤 body margin 0, h3/p margin 0, 배경 rgb(12,13,18), 기존 app-content padding 0/20/80px를 관찰했다. 외부 폰트/CDN은 데모 lint 정책에 따라 참조하지 않는다.
- CUA 직접 확인: 실제 앱 63674에서 수업 → +피드백 → 닫기 후 `/calendar`와 캘린더가 유지됐다. 기존 앱은 정상이며 v1의 홈 고정 이동이 원인이었다.
- CUA v2 직접 확인: 홈 → 피드백 추가 → 닫기 후 홈 유지. 전체 목록에 검색어 보우/즐겨찾기/기술 보우 앤 애로우 → 추가 → 닫기 후 동일 목록, 검색어/필터/기술조건/1개 결과 유지. 2페이지 → 추가 → Esc 후 2/2 페이지와 해당 두 카드 유지.
- CUA v2 직접 확인: 합성 원문 입력 후 닫기 → 미저장 확인, 계속 편집 시 동일 원문 유지, 다시 닫아 로컬 변경 폐기하면 동일 검색·즐겨찾기 목록 복귀. 원본 사용자 탭의 데이터는 조작하지 않았다.
- 독립 QA의 최종 v2 정적·Node VM 검증: 페이지·스크롤 복원, 답변·대화 단계 저장 및 재개, 빈 답변 dirty 방지, v1 불변을 확인했다. CUA에서는 필터·페이지·미저장 보호를 직접 검증했고, 대화 저장/재개·스크롤 수치의 합성 VM 검증을 실제 앱/API/DB PASS로 확대하지 않는다.
- 실제 viewport 360/412에서 document clientWidth=scrollWidth(360/360,412/412), 390 홈을 캡처했다. 임시 viewport는 reset했고 수정본 탭을 유지했다. screenshot: thread artifact `task-052-feedback-home-v2-390.jpg`.
- 아직 새 피드백 기능 앱 구현/운영 DB 적용/push/배포는 하지 않았다. v2는 사용자 수정 요청을 반영한 검토본이며 사용자 승인으로 대리 확정하지 않는다.

- 2026-11-05: 위 4개 기능 변경 요청. 신규 변경분 데모 준비 중이며 기존 v5 재승인은 요청하지 않는다.
- 2026-11-05: 신규 변경분 데모 v1 검토 요청. 이 승인 대상은 홈 상태/전체목록/기술·상황 선택/결과 수정삭제의 새 구조이며, 이미 승인한 task051 v5는 재요청하지 않는다. 사용자 대신 승인하거나 승인 문구·receipt를 생성하지 않는다.

## 데모 검토 (demo gate)

> 실행 판정 정본은 frontmatter `demo_gate` 이다. 이 표는 check.mjs 가 함께 기록하는 사람용 이력이다(docs/demo-review-gate.md).

| 버전 | 상태 | 저장소 파일 | Artifact | 사용자 결정 | 일시 |
|---|---|---|---|---|---|
| - | 작성중 | - | - | judge: delta (JV-ui_change) | 11-05 09:26 |
| v1 | 검토요청 | docs/demo/task-052-feedback-library-v1.html | http://127.0.0.1:63675/v1.html | 사용자 검토 요청 | 11-05 09:33 |
| v1 | 수정요청 | docs/demo/task-052-feedback-library-v1.html | http://127.0.0.1:63675/v1.html | "화면이동에 대하여 피드백추가화면에서 닫기를 누르면 홈화면으로 이동하는데 닫기를 클릭하면 이전화면으로 이동하는 방식으로 처리해줘" | 11-05 09:58 |
| v2 | 검토요청 | docs/demo/task-052-feedback-library-v2.html | http://127.0.0.1:63675/v2.html | 사용자 검토 요청 | 11-05 10:11 |

## Claude 검토
### [2026-11-05 14:01 KST] C1 — skipped
- Leader 요청으로 Claude 전용 공식 gate 1회 판정. v2 승인 기능 범위의 R2이며 백엔드 결과 수정·삭제 부분 착수 뒤 지연된 C1이다. 이 task의 Claude 검토 명시 요청과 Leader의 설계 불확실 표시는 없었다.
- 공식 runner 종료 0. 실제 결과 `claude-result@1` / `skipped` / `checkpoint_not_selected`. 원본 JSON `/tmp/claude-task-052-c1-gate-result.json`.
- 선택 파일 0개, 콘텐츠 검증 플래그 false. task frontmatter와 역할·gate 절차만 로컬 확인했다. 신뢰 SSH에 일반 기능 범위와 판정 인자만 전달했고 Claude provider 호출과 소스·설계·Vault 본문 전송은 발생하지 않았다.
- 외부 검토 범위 없음. 전체 설계·구현은 Claude 미검토.

## Claude 검토
### [2026-11-05 14:33 KST] C2 — done
- 호출 근거: Leader가 REV-052-final 내부 Reviewer PASS(정적 확인 29, 잔여 0) 후 R2 C2를 위임했다. 사용자 승인 task-052 범위의 독립 읽기 전용 검토다. 이전 C1 skipped는 별도 유지했다.
- 실행 도구: Codex Claude 창구 → 공식 Claude 전용 runner → 신뢰 home_ubuntu Linux 격리 Claude. wrapper 1회/종료 0, 공식 `claude-result@1` `done`, provider attempt 1. 모델명은 결과에 없어 미확인이다. 공식 표시 cost_usd 1.93851.
- 대상: bjj-trainning / 기준 3f67d5d703394238996fb05e40c523075d4380ce / 대상 aaecade347a6f515bb70e83b64183de816ff6d30 / 실제 18개 제품 소스의 전후 SHA-256 일치(219,650바이트). 선택 파일: web/src/api/feedback.js, web/src/components/FeedbackHomeCard.jsx, web/src/components/FeedbackPanel.jsx, web/src/components/FeedbackRecap.jsx, web/src/components/FeedbackStarButton.jsx, web/src/components/FeedbackStatus.jsx, web/src/components/FeedbackSummary.jsx, web/src/components/FeedbackTechniquePicker.jsx, web/src/contexts/FeedbackContext.jsx, web/src/main.jsx, web/src/pages/FeedbackPage.jsx, web/src/styles/feedback.css, web/src/utils/feedbackInput.js, web/src/utils/feedbackRecordController.js, backend/src/services/feedback.js, backend/src/models/Feedback.js, backend/src/routes/feedback.js, backend/src/services/feedbackCore.js.
- 읽기·전송 경계: task frontmatter와 실행 문서·gate 규칙은 로컬 절차 확인에만 사용했다. 로컬 본문 보안 확인은 고정 manifest의 18개 선택 소스 전후에 한정했고 공식 민감 패턴 일치는 없었다. 공식 provider 검토도 이 18개 커밋 전후와 일반 기능·검토 질문 인계로 제한됐다. Vault 본문, 마이그레이션, 테스트, 문서, 실데이터, 계정 자료는 provider 입력에서 제외했다.
- 결과: `/home/brownjeon/.local/state/claude-review/runs/84886dabd79144008a4c2f7f3c77d48e/response.json`(Ubuntu 공식 보존 경로) / runner 원본 `/tmp/claude-task-052-c2-result.json`(0600) / 선택 해시 대조 `/tmp/claude-task-052-c2-verified-selection.json`(0600).
- 지적 7건(Medium 2, Low 5). 아래는 공식 출력 요약이며 채택·기각은 내부 Reviewer 담당이다.
  1. Medium — feedback.js 결과 추가·수정·삭제 / FeedbackSummary. AI pending 중 결과를 변경하면 CAS가 lease를 idle로 바꾸고 이전 AI 응답이 폐기된다. 사용자는 취소 안내 없이 작업이 사라진다. 실행 중 쓰기를 막거나 취소를 명시하는 방안을 제안했다.
  2. Medium — feedbackInput.js, FeedbackPanel, feedbackCore.js. 레거시 자유 입력 상황에서 선택 토글을 원복해도 dirty가 남을 수 있다. 저장하면 목록·복기·요약에서 기존 상황이 가려지고 대화가 archive되며 카드가 오래된 상태가 될 수 있다. 데이터는 저장소와 AI 입력에 남는다. 초기 상태 비교와 레거시 표시 보존을 제안했다.
  3. Low — feedback.js 목록 / FeedbackPage. 최신순과 전체가 동일 정렬이라 선택 시 페이지 초기화·재조회만 발생한다. 별도 정렬이나 중복 조건 제거를 제안했다.
  4. Low — FeedbackPanel, feedbackRecordController, feedback.js. 공급된 기술 ID가 비정상인 경우 NaN이 JSON null이 되어 제거로 해석될 수 있다. 선택 밖 캐시 데이터에서 실제 도달하는지는 미확인이다. 양의 정수 ID 검증과 제거 표현 분리를 제안했다.
  5. Low — feedback.js 목록. limit 생략 시 기본값 20→10으로 바뀌어 미선택 소비자의 반환 수가 줄 수 있다. 소비자 확인 또는 기존 기본값 유지와 화면의 명시 limit 사용을 제안했다.
  6. Low — FeedbackSummary, feedbackRecordController. 새 연습 결과 초안은 단독 취소가 없어 포기하려면 패널을 닫고 로컬 변경을 폐기해야 한다. 추가 폼에 취소를 넣거나 초기값과 같으면 미변경으로 취급하길 제안했다.
  7. Low — feedbackCore.js, FeedbackSummary. 열린 과제의 sourceHash가 새 요약과 달라도 목록의 과제중 배지가 남아 상세 안내와 다를 수 있다. 공통 판정 기준 또는 오래된 연결 표시를 제안했다.
- 미검토: 미선택 의존성의 모델 등록·인증, Axios/프록시 DELETE 본문 전달, 캐시 데이터 형태, 공용 UI·AI·과제 서비스, DB SQL 실행·성능, 스키마/테스트/문서/실런타임/실데이터/계정 및 이후·미커밋 변경. 선택 코드 정적 검토만 완료했다.
- 후속: 공식 지적을 Leader에게 전달했다. 기존 공용 게이트의 상태와 task 실행 도구 담당은 그대로이며, 제품 결정과 지적 채택은 별도 절차에서 다룬다.
