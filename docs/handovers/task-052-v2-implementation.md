# task-052 — 승인된 피드백 데모 v2 실제 구현 인계

## 사용자 승인과 현재 실행 상태

- 사용자 원문: **이제 수정했던 데모화면 구현작업 시작해줘**.
- 대상: `docs/demo/task-052-feedback-library-v2.html`.
- 데모 SHA256: `b5ca80fb8c0864bd42e7d63722dc02dd6256802ae7bde3dc0771c3f511eb3fa5`.
- 작업 정본: `agent-vault/10-Flow/tasks/task-052-feedback-library-and-results.md`.
- UI 가이드: `docs/task-052-feedback-implementation.md`(Designer 작성 완료; 실제 Codex가 설계·가이드만 수행한 사실을 자기 절에 기록).
- task 최초/현재 담당은 Codex다. 현재 `codex_scoped`이며 구현 실행 주체에 대한 사용자 답변을 기다린다. **이 문서는 인계 준비물이며 실제 Claude 수신·인수 또는 구현 시작 증거가 아니다.**
- 수정 전 앱 기준 HEAD: `160bfb7`(직전 커밋들은 데모/작업 문서 변경). task의 원래 base_ref는 `3f67d5d703394238996fb05e40c523075d4380ce`로 보존한다. 실제 수신 시 HEAD와 선택 diff를 다시 확인한다.
- 현재 승인 기록 명령은 `DEMO_GATE_REFUSED`였다. 이유는 승인 원문을 사용자 발화 기록과 세션 대화 기록에서 찾지 못한 것이다. 유효한 사람 승인과 기계 기록 실패를 구분한다. 같은 정형 승인 문구 재입력 요구·가짜 receipt/trust 생성·게이트 수동 승인·우회는 금지한다. 허용된 정식 절차로 처리하고 실행 불가한 경계는 사실대로 보고한다.

## 확정된 구현 요구사항

1. **기존 실제 앱 유지:** 기존 HomePage/Calendar/ClassEditPage/관장 바/하단 메뉴와 스타일을 기준으로 피드백 영역만 확장한다. 별도 HTML 데모를 실제 앱으로 대체하거나 홈을 재구성하지 않는다.
2. **홈 최근 3개와 상태:** 최근 피드백 최대 3개. 정리 상태와 훈련 상태를 함께 표시한다. 결과 중 done이 하나라도 있으면 훈련완료, 그 외 not_tried/tried_failed 결과가 있으면 훈련중, 결과 없이 실제 현재 과제로 지정된 경우 과제중이다. 과거 task_binding 존재만으로 과제중으로 표시하지 않는다. 결과 수정/삭제 뒤 남은 자료로 다시 계산한다.
3. **전체 목록:** 최근 피드백 우측 전체 보기 → 참고영상 화면을 기준으로 한 새 전체 피드백 목록. 검색, 전체/최신순/즐겨찾기/완료, 기술 조건과 10개 페이징. 필터는 페이징 전에 적용하고 전체 건수를 맞춘다. 완료는 done 결과가 있는 피드백이다.
4. **기술/상황 입력:** 기술트리에 등록된 기술을 검색해 하나 선택한다. 상황은 수업/스파링/영상 복기/개인 연습/기술토론/기타 복수 체크, 기타일 때만 직접 입력한다. 기술·상황은 기존처럼 선택 사항이다. 기존 비정형 문자열은 자동 재분류하거나 덮어쓰지 않는다.
5. **연습 결과 편집:** 각 저장 내역 옆 수정·삭제. 수정 시 등록과 같은 폼을 그 내역에서 펼치고 기존 날짜/결과/상황/메모를 채운다. 수정은 기존 UUID/createdAt을 보존한다. 삭제 확인·취소·실패 보호와 다른 결과/원문/대화 보존을 지킨다.
6. **닫기:** 현재 실제 FeedbackPanel의 fullScreen Modal 구조를 유지한다. 홈 고정 이동/불필요한 navigate(-1)를 추가하지 않는다. 입력창을 열었던 화면과 목록 검색·필터·기술·페이지·스크롤을 보존한다. 미저장 내용은 기존 저장/폐기/계속 편집으로 보호하고 보완 답변도 저장·재개한다.
7. **기존 연계 유지:** 관장은 원문+현재 확정 보완 답변을 통합 정리한다. 영상 선택은 기존 참고영상 필터와 5개 페이징, 선택 유지, 실제 ClipDetailModal을 유지한다. 결과 변경 뒤 기존 summaryStale 안내와 과제지정 보호를 유지한다.

## 읽기·구현 범위

먼저 프로젝트 `AGENTS.md`의 사용자 사전 승인/실행 도구 기록과 본 인계문을 읽는다. 새 판단은 사용자에게 묻고, 이미 승인된 v2는 재승인받지 않는다. 동시 작업 중인 다른 변경은 되돌리지 않는다.

관련 앱 본문 조사 범위:

- `web/src/pages/{HomePage,CalendarPage,ClassEditPage,ClipsPage}.jsx`, 새 피드백 목록 페이지 후보.
- `web/src/components/{FeedbackHomeCard,FeedbackPanel,FeedbackSummary,FeedbackClipPicker,FeedbackRecap,ClipEditor,ClipDetailModal,Modal,Pagination,Button,Icon,Layout}.jsx`.
- `web/src/{main.jsx,api/feedback.js,contexts/FeedbackContext.jsx,contexts/CacheContext.jsx,utils/feedbackRecordController.js,utils/feedbackRecordController.test.js,utils/feedbackPeriod.js,utils/feedbackPeriod.test.js,styles/feedback.css,styles/tokens.css,styles/app.css}` 및 직접 관련 기존 FeedbackPanel 테스트.
- `backend/src/services/{feedback,feedbackCore,feedbackAI,feedbackTask}.js`, `backend/src/routes/feedback.js`, `backend/src/models/{Feedback,Technique,ResearchTask,index}.js`.
- `backend/scripts/task-051-feedback-schema.js`, `backend/test/feedback*`.
- 승인 데모 v2, UI 가이드, task052 자기 역할 기록. 다른 task 전체/사용자 로그/.env/비밀/운영 자료는 자동 포함하지 않는다.

추가 본문/소유 파일이 필요하면 먼저 범위를 확인한다. Reviewer/외부 검토에는 완성 후 선택한 정확한 파일 매니페스트와 해시를 전달한다. 이 목록이 저장소 전체 외부 전송 허가가 되는 것은 아니다.

## 현재 코드와 서버 계약 준비안

기존 API는 GET/POST `/api/feedback`, GET/PATCH `/:id`, POST `/:id/answer`, `ask`, `summarize`, `results`, `task`, GET `/recap`이다. 모든 본문 변경은 user_id 소유권과 revision CAS를 사용한다. results는 UUID id/date/outcome/context/note/createdAt 배열이다. 결과 내용은 AI snapshotHash에 포함되므로 수정·삭제 때 이전 요약을 보존하되 stale과 실행 중 AI 무효화를 일관되게 처리해야 한다.

준비한 서버 방안(아직 앱 구현·운영 적용 없음):

- 결과 PATCH/DELETE `/:id/results/:resultId` + revision. 정확한 결과만 수정·삭제하고 400/404/409를 구분한다.
- 즐겨찾기 별도 boolean 컬럼 및 명시 set API 후보 `PUT /:id/star {starred:boolean}` → `{id,starred}`. 본문 revision/AI hash와 독립 처리하여 pending 작업이 버려지고 남지 않게 한다. 오래된 본문 DTO와 즐겨찾기 응답의 UI 경합도 처리한다.
- 현재 과제는 사용자당 열린 ResearchTask를 목록당 한 번 읽어 task_binding과 비교한다. DTO의 파생 상태를 홈/상세/전체 목록에 일관되게 제공한다.
- 목록 검색·기술·즐겨찾기·완료 조건은 페이지 이전에 적용하고 안정 정렬한다. 홈은 현재 limit3 요청을 유지한다.
- 기술 선택은 소유 Technique ID를 검증해 기존 technique 문자열에 이름 스냅샷을 저장하는 호환안이다. 기존 문자열은 미변경 시 그대로 둔다.
- starred 신규 컬럼은 기존 task051 스크립트를 ALTER 도구로 바꾸지 않고 별도 명시 migration으로 준비하는 방안이다. information_schema 검사/기본 offline dry-run/명시 DB 확인을 유지한다. 운영 실행은 승인 대상이며 현재 허용되지 않았다.

구체 확정이 남은 계약은 가이드의 미확정 항목과 함께 구분한다: 검색 파라미터 `search`/`q`, 새 목록의 라우트/파일명, 복수 상황 metadata의 저장 형태와 기술 선택 ID 전달 키. 준비안을 사용자가 확정한 것으로 주장하지 않는다. 구현 중 새 판단이 필요하면 사용자에게 선택지·영향을 설명한다.

## 실행·데이터 보존 경계

- **운영 DB 변경·push·배포 승인은 없음.** 이번 사용자 지시는 승인 v2 기능 구현이다. 운영 스키마 실행·배포는 기존 절차와 별도 승인 경계를 지킨다.
- `.env`를 읽거나 backend/src/index.js를 실행하지 않는다. 공유 NAS MariaDB로 연결/자동 migration을 실행하지 않는다.
- NFS `web/node_modules`를 만들지 않는다. 기존 Mac-local/Ubuntu ext4 검증 경로만 사용하고 다른 세션의 서버를 종료하지 않는다.
- 기존 코드와 역할/설정 미커밋 변경을 보존한다. 전체 add/stash/reset/clean, 역할/훅 재생성·승인 검증 도구 변경은 이번 구현 범위가 아니다.
- 기존 63674 preview와 그 탭에 있는 사용자 미저장 상태를 보존한다. 서비스 소유권/현재 실행 상태를 확인하기 전에 재시작하지 않는다. 별도 데모 63675의 v1/v2 게시 파일은 불변이다.
- 실제 Claude 수신 시 task.execution_context의 origin_tool은 보존하고 실제 current_tool/current_procedure/범위/수신 근거만 갱신한다. 외부검토용 claude 브로커나 Codex 서브에이전트 호출을 실제 Claude 구현으로 표시하지 않는다.

## 검증 인계

구현 완료 후 독립 Reviewer → QA 순서를 유지한다. 필요한 체크포인트는 프로젝트 절차대로 판정하되, 호출 실패/미실행을 PASS로 바꾸지 않는다.

- 상태: done 여러 개/마지막 done 수정·삭제/결과 없음/현재 과제 교체·마감.
- 목록: 최근 최대3, 필터 선적용·검색/기술/즐겨찾기/완료 조합·건수·페이지·빈/오류 상태.
- 결과: 소유권404·없는 결과404·유효하지 않은 값400·낡은 revision409·다른 결과/원문/답변 보존·요약 stale.
- 즐겨찾기: 재조회 영속 저장, pending AI와 경합, 오래된 DTO에 의해 표시가 되돌아가지 않음.
- 입력: 등록 기술 소유권·기타 입력·기존 미등록 기술/비정형 상황 원문 보존·저장 재개.
- 화면: 홈/목록2페이지/조회조건에서 입력 열고 X/Esc로 복귀, 미저장 저장·폐기·계속 편집, 실제 기존 CSS·Modal/영상 상세 재사용.
- 격리 환경에서 실제 API/SQL/브라우저를 검증하고 합성 AI와 실제 관장 CLI, 실제 앱과 HTML 데모를 구분한다. 운영/Android/실영상 등의 미검증은 사실대로 적는다.

## 인수 시 회신

받은 task ID·승인 v2/해시·실제 checkout·맡은 범위·다음 단계·승인 도구 상태 및 미실행 경계를 먼저 기록한다. 구현/감사/검증 결과는 실제 실행 명령과 대상 버전에 연결한다. 이 문서 생성만으로 수신·구현·최종 검증·배포 완료를 선언하지 않는다.
