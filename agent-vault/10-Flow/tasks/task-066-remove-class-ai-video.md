---
task_id: task-066
title: 수업 상세 AI 영상 생성 영역 제거
status: doing
stage: release_ready
waiting: none
created: 2026-11-11
updated: 2026-11-12
app_version: "1.3.0"
base_ref: "3949e897e3bbce76d669c3c960d6ffc3eb295d96"
tags: [type/task, domain/classes, domain/video, domain/ui]
aliases: [수업 AI 영상 생성 버튼 제거]
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "사용자 지정 수업 상세 AI 생성 영역만 Codex 직접 제거·검증·선택 commit/push·운영 반영"
  last_event_id: exec-002
demo_gate:
  required: true
  level: "delta"
  status: "approved"
  version: 1
  repo_path: "docs/demo/task-066-remove-class-ai-video-v1.html"
  artifact_url: "/Users/brownjeon/.codex/visualizations/2026/11/10/01a1c45e-9aee-70f0-87bb-409f67e41846/task-066/task-066-remove-class-ai-video-v1.html"
  content_sha256: "35b969a4fdafb742a4784a348a0bcbd8bef7ca6fb0cc5a752c72810fb6e8feae"
  decided_by: "judge"
  rule_id: "JV-ui_change"
  approved_by: "user"
  approved_at: "2026-11-12T10:40:06+09:00"
  approval_quote: "이대로 진행헤주고"
  waived_by: ""
  waived_at: ""
  waiver_quote: ""
  active: true
  approval_source: "codex_contextual"
---

# 수업 상세 AI 영상 생성 영역 제거

## 요청·승인 범위

2026-11-12 사용자 추가 지시: “이대로 진행헤주고 별도의 데모화면없이 구현 후 커밋 및 푸시해서 배포까지 진행해줘”. v1 지정 삭제안 진행 및 추가 데모 없이 직접 구현·검증·선택 commit/push·운영 배포까지 승인. 같은 승인 재요청 없음. 정식 approve-codex-context가 실제 이번 사용자 발화/원문 영수증을 확인해 v1 승인 기록 완료(2026-11-12 10:40 KST).

사용자 원문: “ai영상 생성기능 폐기에 따라서 수업 상세화면에 있는 ai영상 생성 버튼 및 관련 항목 제거하는 작업이 대해서 너가 직접 진행해주고 커밋 및 푸시해서 운영에 반영작업해줘. 다른 영역은 수정하지말고 ai영상 생성 부분만 제거하는 작업만 진행해줘”.

Codex 직접 구현·검증·커밋·푸시·운영 반영을 명시 지정했다. 같은 실행 승인을 다시 묻지 않는다. 변경 대상은 ClassDetailModal의 AI 영상 섹션, 생성/진행/실패/재생/다운로드/재생성 UI와 전용 호출·폴링, 단독 사용 API 모듈이다. 관련 영상 상세 진입, 수업 수정·닫기·기술/메모/스파링, 체인 화면, 백엔드·DB·기존 생성물·M4 환경은 보존한다.

## 관련 과거 이력 요약

- [[task-065-constrained-tripod-two-characters]]: AI 영상 시범 품질 반려·도입 폐기 및 종료. 당시 기존 앱 기능 제거는 범위 밖이어서 미실행. 이번 요청은 앱 UI 제거를 별도 승인한다.
- [[task-056-class-related-video-detail]]: 수업의 일반 관련 영상은 공용 ClipDetailModal로 연다. 이번 제거와 무관하며 최신 origin/main 구현을 그대로 보존한다.
- [[task-058-technique-image-samples]]: 기술 정지 이미지 운영 기능을 보존한다.

## 조사·구현 계획

- 운영 current=20261111-091132-3949e897, root 앱 버전 1.2.0, /health 정상 직접 확인.
- NAS primary HEAD는 과거 버전이고 다수 타작업 미커밋 변경이 있다. 최신 origin/main 3949e897 기준 관리 worktree를 생성 중이며 타작업을 게시하지 않는다.
- 정책 기본 minor 1.2.0→1.3.0 한 번 적용(root package/lock). 순수 웹 변경이므로 APK/Android 번호 변경·재설치·DB 마이그레이션 없음.
- Impeccable context/scoped refinement·distill/craft-floor 적용. 기존 UI를 시각 정본으로 사용하고 생성 영역 제거 외 레이아웃·토큰·문구 변경 없음.
- 실제 앱 소스 기반 빌드·합성 데이터 브라우저 확인: 생성 UI/상태 호출 없음, 관련 영상 상세 열기/복귀, 수정·닫기, 360/390/412px 유지. 운영 인증 데이터 쓰기·유료 영상 생성 테스트 없음.
- 리뷰→QA PASS 후에만 선택 push. push webhook 단일 배포를 관측해 중복 수동 배포를 피하고 RELEASE_RESULT/current/SHA/health/서빙 번들 확인.

## 실행 도구·절차 이력

| 이벤트 | 시각(KST) | 사건 | 담당/절차 | 범위·근거 |
|---|---|---|---|---|
| exec-001 | 2026-11-11 | start | codex / codex_scoped | 현재 사용자 직접 제거·commit/push·운영 반영 지시. 일반 Claude 인계 절차보다 이번 명시 지정 범위 우선. 독립 Reviewer/QA/Deployer는 유지. |

| exec-002 | 2026-11-12 10:40 | resume | codex / codex_scoped | 실제 사용자 v1 그대로 진행·추가 데모 없이 구현/commit/push/배포 지시. 정식 사용자 문맥 증거 승인, 최신운영/원격3949e897/1.2.0 재확인·관리worktree 정상이용. |

## 판단 기록 (judge)

- [2026-11-12] C1/C2 실제 Jev실행 codex_required=false. C1 wanted=false, C2 wanted=true이나실측remaining_limit_pct=null(stale)로 CX-limit-unknown-hold. 외부CodexCLI검토는미호출이며root직접구현/독립Reviewer감사와구분. 원결과 /tmp/judge-task-066-c1.out.json·c2.out.json. 한도/스위치우회없음.

- intake 실제 Jev 실행: local_fix/R1/complexity0.99, needs_info=false, demo=delta/required, next=demo_first, rule=JV-ui_change. 원출력 /tmp/judge-task-066-intake.out.json. 요약·결과 임의 수정 없음.

## Designer 기록

- [19:16] 실행 도구 Codex(designer). 최신 `origin/main`의 ClassDetailModal·Modal·Button·Tag·tokens/app CSS, 전용 classVideo API와 classes 영상 응답을 읽고 사용자 지정 AI 영역 삭제만 delta 데모로 재현. `docs/demo/task-066-remove-class-ai-video-v1.html`(v1), SHA-256 `35b969a4fdafb742a4784a348a0bcbd8bef7ca6fb0cc5a752c72810fb6e8feae`, 토큰 `ad70437353d5`. 현재/제안·미생성/조회중/생성중/오류/완료 비교, 제안은 모든 상태에서 AI 제목·안내·생성·진행·실패·재생·다운로드·재생성 영역 없음. 관련 영상·수업 내용·스파링·수정·닫기 원형 유지. 390px 대표 및 360/412 선택, 합성 콘텐츠·관련 상세는 축약 시연 명시, 외부 요청 없음. `DEMO_LINT_PASSED` 확인. 사용자 검토 등록 전까지 본 역할 직접 브라우저 검증은 미실행; root가 Chrome 제안 화면·AI hidden·lint 확인 완료 회신. 이후 이 HTML 불변 유지. 승인·활성화·구현 가이드 미실행.
- [19:16] 선택 스킬·지침: Impeccable(context·distill·craft-floor) + page-layout-designer·ui-component-builder·ui-design-reviewer·ui-accessibility-reviewer / 기존 모바일 수업 화면의 지정 영역 삭제 / 신규 scaffold·삭제안 범위 자체 점검 P0 0·P1 0·P2 0, a11y 신규 Critical 0·Major 0·Minor 0. 기존 원형의 sm 버튼 터치 높이·대비 제약은 유지되어 전체 화면 접근성 통과를 주장하지 않음. Impeccable detect 실제 1회 실행(exit 2): 기존 텍스트·Tag·primary 대비 3.4~4.2:1 경고, 사용자 금지 범위이므로 미수정. 새 토큰·폰트 다운로드·초기화·훅·앱 소스 변경·네트워크 실행 없음.

- [10:50] 승인 데모: `docs/demo/task-066-remove-class-ai-video-v1.html` (v1). 적용 토큰: 기존 `--surface-up`, `--surface`, `--border`, `--text`, `--text2`, `--accent` 유지. 실행 도구 Codex(designer). task의 사용자 승인(2026-11-12 10:40:06+09:00)과 실제 HTML SHA-256 `35b969a4fdafb742a4784a348a0bcbd8bef7ca6fb0cc5a752c72810fb6e8feae` 일치 직접 확인. 아래는 **승인 v1 최소 구현 가이드**이며 새 설계·추가 데모가 아니다.

  **레이아웃 설계:** 목표는 수업 상세에서 폐기한 AI 영상 생성 영역만 제거하는 것. 기존 수업 정보 → 관련 영상 → 스파링 → 수정·닫기 순서를 유지하고 AI 섹션만 빠진다. 기존 Modal·Section·Button·ClipDetailModal 재사용, 새 컴포넌트·새 CTA·새 상태 없음. 기존 AI none/loading/pending/error/done 모두 UI가 없으며, 일반 상세/수정/닫기 행동은 유지한다. 대표 390px·경계 360/412px와 기존 단일 모달 스크롤 구조를 유지한다.

  1. **화면 개요:** 기존 수업 상세 진입 경로와 데이터는 유지. 데모 `#ai-section`은 실제 앱에서 조건부 숨김으로 남기지 않고 렌더와 전용 로직을 제거한다. `#related-section`·`#class-actions`에 대응하는 기존 관련 영상과 수정·닫기는 그대로 둔다.
  2. **UI 구조:** `Modal(수업 상세) → 기존 헤더/수련일/메모/피드백/포지션/기술/별점 → 기존 관련 영상 → 기존 스파링 → 기존 수정·닫기 → 조건부 ClipDetailModal`. AI 제목·안내·생성·상태조회·진행·오류·재생·다운로드·삭제 후 재생성 모두 제거한다.
  3. **API 호출 계획:** 새 API 없음. `POST /classes/:id/generate-video`, `GET /classes/:id/video-status`, `DELETE /classes/:id/generated-video`의 이 화면 전용 호출과 30초 폴링을 제거한다. 백엔드 라우트·응답·DB·기존 생성물은 변경하지 않는다. 일반 관련 영상은 기존 캐시/공용 상세 흐름을 사용한다.
  4. **상태 관리:** `CacheContext.clips`, `useMemo`, 관련 상세용 `useState(detailClip)` 유지. VideoSection의 vs/generating/confirmDelete/pollRef와 단독 effect/callback/ref만 제거. 새 상태·캐시 무효화·UIContext 변경 없음.
  5. **수정 파일:** `web/src/components/ClassDetailModal.jsx`의 VideoSection·렌더·전용 import·미사용 hooks 제거, 단독 사용 `web/src/api/classVideo.js` 삭제. 릴리스 메타데이터 `package.json`·`package-lock.json`만 1.3.0. 공용 스타일·토큰·모바일·백엔드 파일은 변경하지 않는다.
  6. **구현 순서(승인 기준):** AI 렌더/로직 제거 → 미사용 전용 모듈/import 정리 → 기존 관련 영상·수정·닫기 회귀 확인 → 360/390/412px 및 AI 관련 요청 0 확인. 추가 화면·대체 생성 기능·새 여백을 넣지 않는다.
  7. **주의사항:** AI 삭제는 데이터/생성물 삭제가 아니다. 일반 영상의 빈/로딩/오류·모달 포커스·복귀는 기존 공용 구현을 유지한다. APK/네이티브 변경·재설치 불필요. 기존 소형 버튼·대비·전체 테마 개선은 사용자가 금지한 다른 영역 변경에 해당하므로 이번 구현 범위에 추가하지 않는다.

- [10:50] **승인 v1 대비 구현 후 디자인 확인: 지정 삭제안 일치.** 관리 worktree의 base `3949e897e3bbce76d669c3c960d6ffc3eb295d96` 대비 실제 diff 4파일을 직접 읽었다. AI 전용 전체 삭제와 버전 메타데이터 외 변경 없음; 관련 영상 카드/상세·수업 본문·스파링·수정·닫기·스타일·토큰 변경 없음. 실제 앱 390×844 합성 fixture 캡처를 직접 열어 AI 영역 없음, 관련 영상 2개·스파링·수정·닫기 보존을 확인했다. 데모의 영상 1개와 실제 fixture 2개·문구 차이는 합성 데이터 차이이며 material/defect 차이로 보지 않는다. 이번 삭제로 새로 발생한 P0 0·P1 0·P2 0, 접근성 신규 Critical 0·Major 0·Minor 0. 이 판정은 변경 범위에 한정하며 화면 전체의 44px·대비·모든 테마 접근성 통과를 뜻하지 않는다. 기존 sm 버튼·일부 대비 제약은 v1에 이미 기록된 원형이며 그대로 유지; 전체 터치 측정·테마 조합·실기기 검증은 본 역할 미실행이다.
- [10:50] 선택 스킬·지침: 기존 Impeccable scoped distill/craft-floor 유지, 구현 후 단계의 `ui-design-reviewer`·`ui-accessibility-reviewer` 실제 재독 / 승인 원형과 지정 삭제안 일치 확인 / 소스 diff·승인 해시·제공된 실앱 390px 캡처 직접 점검. Impeccable critique 참고는 읽었으나 별도 전체 critique·하위 에이전트·새 브라우저 세션·새 detector는 실행하지 않았다. 앱 소스·데모·다른 역할 기록 변경 없음. 새 디자인 판단·사용자 추가 질문 없이 승인 v1 기준 가이드와 확인 결과를 Leader(root)에게 인계한다.

## Developer 기록

- [2026-11-12] 추가검증: browser최종15case PASS(11기능/보안·테마 + light/dark×412/1280), 실제토큰배경rgb(28,31,40)/라벨rgb(124,128,152)·XSS문자열비실행 확인. 기존수정/닫기31px는원본스타일과동일한baseline접근성제약이며사용자범위밖수정없이보존. Designer가승인v1가이드/실제앱390캡처/4파일diff일치확인. QA독립최종재실행대기,전체앱접근성PASS주장안함.

- [2026-11-12] production build PASS(229modules/기존chunk-size경고만), local Chrome실제앱8cases PASS·기존Modal8PASS·git diff check PASS. 생성UI/초기상태HTTP0, 일반관련영상2경로/복귀/수정/취소/닫기와360/390/412/1280확인. AI제거외원문전체문자일치계산으로추가변경0확인. 기능코드2파일·버전metadata2파일뿐. QA독립재실행중이며 commit/push/새운영반영은아직없음.

- [2026-11-12] Codex root 직접 구현. 관리worktree `/Users/brownjeon/.codex/worktrees/bjj-t066-remove-class-ai-video/bjj-trainning`는 origin/main3949e897에서 clean 확인 후 사용. ClassDetailModal VideoSection 전체·렌더·전용APIimport·미사용effect/callback/ref hooks 제거, 전용 classVideo.js 단독 사용 확인 후 삭제. root package/lock1.3.0으로minor1회 적용(다른 dependency버전 불변). 공용ClipDetailModal/useState·관련영상카드·수업본문/스파링/수정/닫기는 원본 유지. 백엔드/DB/체인/스타일/모바일 변경 없음.
- [2026-11-12] 정식check.mjs activate/check `DEMO_GATE_PASSED approved v1/hash verified`, Impeccable detect changed JSX 결과`[]`. C1 Jev codex_required=false/CX-limit-unknown-hold,외부코드검토미호출(현재Codex직접구현과별개).
- [2026-11-12] local APFS 작업본에서 기존검증 node_modules를 symlink로재사용, npm prefix가실제web경로인지확인한후 production build. UI는실제앱production번들을localhost:9166으로제공해합성API모킹기반검증예정. 테스트스크립트 /tmp/bjj-t066-browser.cjs, Playwright-core와기존Chrome의격리프로필사용. 운영API쓰기·유료생성0.

## Reviewer 기록

- [10:44] Codex 독립 감사 REV-066: PASS, Critical/High/Medium/Low 0/0/0/0. base 3949e897 대비 4개 파일 diff·버전 1.3.0 root/lock 정합·삭제 모듈 원래 단독 import·관련 영상 상세/수정/닫기 보존 확인; 백엔드·DB·스타일·체인·모바일 변경 없음. UI v1의 AI 전체 제거 요구와 일치, material/defect 차이 미발견. check DEMO_GATE_PASSED, approved v1/hash verified; workspace .claude/state/demo-gate/evidence.jsonl의 task·버전·세션·해시와 연결된 실제 사용자 발화 및 직전 v1 요청 확인. 기록의 직접 변조 여부는 독립 이력 부재로 단정 불가. 빌드/기능 테스트 직접 미실행, NFS 빌드 실행 없음; 운영/배포 경로 자체·기존 백엔드 6영역 전수 감사 범위 밖. QA 중점: ClassDetailModal.jsx:130, 204-212 관련 영상 상세·복귀·수정·닫기, AI 상태 요청 부재 및 360/390/412 회귀. web/node_modules untracked symlink 선택 커밋 제외. 범위 유의: 고아 import 확인 rg를 넓게 실행하여 다른 웹 파일의 일치 줄 일부가 출력·모델 입력됨(파일 변경·외부 전송 없음).

## 개발자 제공 검증 절차

- 앱 checkout=/Users/brownjeon/.codex/worktrees/bjj-t066-remove-class-ai-video/bjj-trainning. localhost:9167은이checkout의production build를Vite preview로서빙중. source JSX의추가수정없음.
- `T066_URL=http://127.0.0.1:9167 T066_OUT=/tmp/bjj-t066-qa-browser node /tmp/bjj-t066-browser.cjs` → 최초8/확장11/최종15 cases PASS 기대(최종은light/dark×412/1280포함). 합성classes/clips/auth·CDN폰트CSS공백fixture·실운영API쓰기0. AI none/pending/error/done모두UI/조회0,360/390/412/1280가로넘침0,저장/외부관련영상2경로모달열기/Esc복귀·수정열기/취소·닫기·다운로드0·pageerror0. 빈관련영상은기존Section동작에따라빈라벨/카드0을유지하며이번에고치지않음.
- `BJJ_MODAL_TEST_DEPS=/Users/brownjeon/.node-local/bjj-task052-validation.CMe1rr BJJ_MODAL_TEST_JSDOM=/Users/brownjeon/.node-local/themeal node --test web/src/components/Modal.test.mjs` → 공용Modal기존회귀8 PASS 기대. root단독실행은deps미설정(jsdom미해결)실패였고기존로컬deps경로지정실행8PASS확인,테스트코드변경없음.
- `git diff --check`,rootpackage/lock1.3.0일치,기능변경4파일한정 확인. 원래dep/tree값변경·DB/API쓰기없음. production빌드root완료(기존chunk크기경고만).
- 시각검증조건: Chromeheadless독립프로필·ko-KR/Asia-Seoul·DSF1·높이844·reducedMotion=reduce·폰트CSS격리fixture. 실제앱번들상세하단스크린샷,실사용자데이터/인증세션은미사용. 실기기Android/실운영인증수업E2E는미확인.

## QA 기록

- [10:48] Codex QA 독립 실행: 지정 browser 명령 8/8 PASS, Modal 명령 8/8 PASS, `git diff --check` PASS, 변경 tracked 4파일 및 package/lock/root 1.3.0 일치. gate check primary에서 `DEMO_GATE_PASSED`, 승인 v1/hash verified. 최초 worktree 상대 gate 경로는 도구 부재로 실패 후 정본 cwd에서 재실행 성공. 390px 캡처 직접 확인: AI 영상 영역 없음, 저장/외부 관련 영상 2개 및 수정·닫기 표시. 하네스는 360/390/412/1280에서 가로넘침 없음, 저장/외부 영상 열기·Esc 복귀, 수정·취소·닫기, AI 관련 호출/다운로드/pageerror 각 0 확인. 관련 영상 빈 상태 1건 통과. 합성 API/폰트 fixture, 운영 데이터 쓰기 없음. 주의: AI 상태 응답은 요청이 없어 실제 소비되지 않았으며 4개 상태 분기는 요청 부재 검증이다.
- [10:48] 시각 검증 재현조건: Chrome 157.0.8103.51 headless, viewport 폭 360/390/412/1280 × 높이 844, DSF 1, ko-KR, Asia/Seoul, document.fonts.ready 대기, reducedMotion=reduce(모든 애니메이션 비활성은 미확인), 합성 API·외부 폰트 CSS fixture, 수업 상세 하단 뷰포트 상태별 캡처. 관찰 화면 다크. 사용자 승인 v1과 동일한 지정 영역 제거·기존 요소 유지 기준; 별도 구현 가이드 버전 명시 여부는 미확인. 라이트/다크 조합 및 토큰 계산값, 44px 터치 측정, XSS 리터럴 주입, 실기기 Android와 실운영 인증 UI는 NOT_VERIFIED. 기존 API/DB 전체 점검은 이번 인계 범위 밖. 따라서 전체 QA PASS 보류, 결함 0건으로 단정하지 않음. 스크린샷 8개 및 보조 evidence 1개는 이 기록 직후 삭제 예정. 실행 산출물은 개발자 제공 경로 `/tmp/bjj-t066-qa-browser`에 생성되었으며 프로젝트 안에는 생성하지 않음.
- [10:48] 산출물 정리 완료: 스크린샷 8개와 보조 evidence 1개 총 9개 삭제, 임시 폴더 제거.
- [10:51] 추가 독립 실행: `T066_URL=http://127.0.0.1:9167 T066_OUT=/tmp/bjj-t066-qa-extended node /tmp/bjj-t066-browser.cjs` → 11/11 PASS. Chrome 157.0.8103.51 headless, DSF1·ko-KR·Asia/Seoul·높이844·reducedMotion=reduce·폰트준비 대기·합성 API/폰트 fixture. 390px light/dark 선호 모두 고정 다크 sheet 배경 rgb(28,31,40), label rgb(124,128,152)이며 CSS 변수 계산값과 일치. 360/390/412/1280 dark 가로넘침 0; light 선호 412/1280 미실행. 390px XSS note/feedback `<img ... onerror>`·`<script>` 문구가 텍스트로 남고 해당 DOM 요소 0·실행 표시 undefined. 사용자 승인 v1=Designer가 명시한 최소 구현 가이드 v1, 실제 앱 390 캡처와 지정 제거 범위는 Designer 확인. 저장/외부 관련 영상, 수정·닫기 동작 및 AI 요청 부재 회귀 PASS. 기존 API/DB 전수·실기기·운영 인증 UI는 미검증.
- [10:51] 터치 기준 FAIL: 390px 닫기 상단 44×44px, 관련 영상 348×50px, 하단 수정 44.77×31px·닫기 46.77×31px으로 두 버튼 높이가 필수 44px 미만. staged 변경은 패키지 2개·ClassDetailModal.jsx·전용 API 삭제 4개이고 스타일 파일 변경 없음. Designer가 기존 sm 제약·원형 보존을 명시해 신규 회귀로 단정하지 않으나 전체 화면의 44px 조건을 충족했다고 표시할 수 없다. 지정 기능 회귀는 PASS, 필수 접근성 조건 FAIL로 전체 QA 통과 보류. 산출물 스크린샷 11개·보조 evidence 1개는 이 기록 직후 삭제 예정.
- [10:51] 추가 산출물 정리 완료: 스크린샷 11개와 보조 evidence 1개 총 12개 삭제, 임시 폴더 제거.
- [10:54] Codex 독립 최종 확장 실행: `T066_URL=http://127.0.0.1:9167 T066_OUT=/tmp/bjj-t066-qa-final node /tmp/bjj-t066-browser.cjs` → 15/15 PASS. 기존 11건에 412·1280 × light/dark 선호 4조합 추가, 모두 가로넘침 0, 배경 rgb(28,31,40)·label rgb(124,128,152)로 기존 고정 다크 CSS 변수 일치, AI 호출 0. Chrome 157.0.8103.51 headless·844 높이·DSF1·ko-KR/Asia-Seoul·reducedMotion·합성 fixture. 승인 데모 v1=Designer 최소 구현 가이드 v1. 지정 AI 영역 제거·관련 영상/수업 기능 보존에 대한 `change_verdict: PASS`, 확인된 신규/회귀 결함 0. 별도로 기존 하단 버튼 높이31px의 `baseline_accessibility: FAIL`은 그대로 유지하며 전체 화면 접근성 PASS를 주장하지 않음. 운영 인증·실기기 미검증. 캡처 15개와 evidence 1개는 직후 삭제 예정.
- [10:54] 최종 산출물 정리 완료: 스크린샷 15개와 보조 evidence 1개 총 16개 삭제, 임시 폴더 제거.

## 배포 기록

## 최종 요약

2026-11-12 사용자 그대로 진행·추가데모없이 구현/commit/push/배포 지시 수신·정식v1승인 확인. 지정AI섹션/전용API제거·앱1.3.0구현완료, production build/독립Reviewer PASS. root최종실제앱15case·기존Modal8PASS, 독립QA change_verdict PASS/새회귀0 확인완료. 기존31px접근성제약은신규회귀와분리·스타일미변경. commit/push/새운영배포준비중, 아직미실행.

## 데모 검토 (demo gate)

> 실행 판정 정본은 frontmatter `demo_gate` 이다. 이 표는 check.mjs 가 함께 기록하는 사람용 이력이다(docs/demo-review-gate.md).

| 버전 | 상태 | 저장소 파일 | Artifact | 사용자 결정 | 일시 |
|---|---|---|---|---|---|
| - | 작성중 | - | - | judge: delta (JV-ui_change) | 11-11 19:08 |
| v1 | 검토요청 | docs/demo/task-066-remove-class-ai-video-v1.html | /Users/brownjeon/.codex/visualizations/2026/11/10/01a1c45e-9aee-70f0-87bb-409f67e41846/task-066/task-066-remove-class-ai-video-v1.html | 사용자 검토 요청 | 11-11 19:16 |
| v1 | 승인 | docs/demo/task-066-remove-class-ai-video-v1.html | /Users/brownjeon/.codex/visualizations/2026/11/10/01a1c45e-9aee-70f0-87bb-409f67e41846/task-066/task-066-remove-class-ai-video-v1.html | "이대로 진행헤주고" | 11-12 10:40 |
