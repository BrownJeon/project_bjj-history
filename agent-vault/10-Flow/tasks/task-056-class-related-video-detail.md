---
task_id: task-056
title: 수업 상세·캘린더 관련 영상에서 공용 영상 상세 열기
status: done
phase: calendar_user_confirmed
waiting: ""
app_version: "1.1.0"
version_source: "package.json.version"
user_confirmation:
  status: confirmed
  scope: calendar_video_detail_open
  confirmed_at: "2026-11-09T22:33:28+09:00"
  reported_version_context: "1.1.0"
  device_os: unspecified
created: 2026-11-09
updated: 2026-11-09
related_tasks:
  - "[[task-036-pickmeup-shared-clip-detail]]"
  - "[[task-054-improve-technique-tree]]"
tags:
  - type/task
  - domain/classes
  - domain/video
  - domain/ui
aliases:
  - 수업 상세 영상 다운로드 대신 상세 보기
  - 관련 영상 상세 진입 수정
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "수업상세·캘린더 수동/기술연계 영상 공용상세 직접수정/검증 및 앱1.1.0 운영배포완료. 같은릴리스버전유지·참고영상수집보류"
---

# 수업 상세 관련 영상 상세 진입 수정

## 요청·범위

사용자: 수업 상세의 관련 영상 클릭 시 다운로드 대신 해당 기술영상 상세를 열 것. “데모화면 만들지말고 너가 직접 바로 수정후에 테스트진행해줘”. Codex가 직접 수정·테스트하며 사용자 검토용 데모는 만들지 않는다.

기존 수업 상세 ClassDetailModal의 카드가 video_file 또는 외부url을 직접 여는 anchor였다. 기존 공용 ClipDetailModal(task-036)의 재사용 원칙에 따라 실제 개인 영상 상세를 열고 닫으면 같은 수업으로 돌아오게 한다. 보류한 공통 참고영상 수집/신규DB 기능은 이 수정과 관계없이 보류 유지.

## 구현

- 관련 영상 카드를 type=button으로 전환, 상세 열기 상태 추가.
- 기존 공용 ClipDetailModal을 부모 수업 모달 안에서 열어 원래 수업 내용·스크롤을 보존한다. 닫을 때 영상 모달만 닫는다.
- 캐시의 현재 영상 객체를 전달한다. 수정/삭제 버튼은 전달하지 않으며 공용 상세의 기본 조회/활용 동작을 재사용한다.
- 다운로드로 오인될 카드 아이콘은 기존 SVG chevron으로 교체한다. 명시적 다운로드는 영상 상세의 기존 기능을 따른다.

## 검증

Codex 직접 실제 앱 production build 및 합성 API 브라우저 검증 PASS. 저장영상·외부URL 영상 모두 공용 상세 진입, 다운로드 이벤트0, 명시 다운로드 버튼 유지, 닫기/Esc로 수업 복귀·스크롤82px/초점복원, Enter/Space 진입, 부모화면 inert, 누락 영상 제외·빈목록0카드, 360/390/412 가로넘침0, console error0 확인. 저장 테스트영상 readyState4 확인. 사용자 승인용 데모는 만들지 않았다.

- `npm --prefix web run build` PASS(기존 대형 chunk 경고만 있음).
- Impeccable context의 scoped fix 경로·craft-floor 적용, mechanical detector 결과 `[]`.
- `git diff --check` PASS. 변경 기능코드는 ClassDetailModal.jsx 한 파일.
- 로컬 검증 근거: task-056-tests/browser-evidence.json·source-manifest.json·class-detail-390.png·clip-detail-390.png. 실제 사용자 데이터/운영API를 쓰지 않은 합성 검증이며 실기기 Android/운영 화면은 미확인.

## 상태

2026-11-09 19:01 — 착수 당시 구현·테스트 중. 운영 배포 미실행(아래 최신 결과 참조).

2026-11-09 19:08 — 사용자 지시 범위의 직접 수정·테스트 완료. 운영 배포·커밋/push는 이번 수정에서 실행하지 않았다. 현재 구현 checkout은 `/Users/brownjeon/.codex/worktrees/bjj-technique-tree-054/bjj-trainning`이며 원래 NAS checkout의 기능코드는 덮어쓰지 않았다. 기존 참고영상 수집 보류와 다른 작업 변경은 보존했다.

## 운영 배포 승인·착수

2026-11-09 19:18 — 사용자 “커밋 밒 푸시해서 운영에 배포작업까지 진행해줘” 수신. 이번 수정·작업056 기록만 선택 커밋/push·웹 배포한다. 보류한 참고영상 수집/절차서와 첨부이미지·개인자료는 포함하지 않는다. 최신 운영/원격 기준을 유지하고 테스트한 기능코드와 동일성을 확인했다. 운영DB 수동 변경·마이그레이션은 없다.

## 운영 배포 완료·검증

2026-11-09 19:20 — 기능 commit `bd516afdb021ea4482a8864fe32ddaa38b55671a`, 릴리스 `20261109-191914-bd516afd`. main 선택push와 webhook RELEASE_RESULT status=ok/sha일치,공식status current/pm2online/health200 확인. 중복 수동배포 없음.

운영 ClassDetailModal source SHA가 실제앱 브라우저검증판과 일치한다. 외부 health/HTML/asset200,서빙asset가release파일과동일,JS는 `index-DKo3fQMf.js`/SHA256 `f462e6ef79351b031862637a012b6af22c9a4f4f3edf235f632f4991a1451c2b`,미인증 classes API401 확인. DB마이그레이션/직접데이터변경 없음. 인증후실수업상세/실기기Android는 이번에 확인하지 않았다. 보류한 참고영상 수집·절차서/첨부이미지/다른미커밋변경은 커밋에서 제외했다. 완료기록push의자동문서릴리스는기능코드와분리해관측한다.

최종 완료문서 릴리스 `20261109-192111-10f52e48` / commit `10f52e4836b942c9adc9ca89166b8ad8138e4360`도 RELEASE_RESULT ok·공식current/pm2online·외부health/HTML/asset200 확인. 기능릴리스와 source/서빙JS가 동일하다. 최종 관측은 추가배포를 만들지 않도록 운영기록에 보존한다. 실기기 확인 여부는 미확인으로 유지한다.

## 캘린더 수업 카드 후속 범위

2026-11-09 22:09 — 사용자 “상세화면 외에도 캘린더화면에서의 수업화면에있는 것도 동일하게 변경해줘” 수신. 같은 작업056의 후속 범위로 직접 수정·테스트·선택커밋/push·웹배포까지 이어간다. 앞선 상세모달 수정/배포는 보존하며 참고영상 수집 보류를 유지한다.

- CalendarPage의 수동 연결 관련 영상과 기술명 자동 연결 영상 모두 공용 ClipDetailModal로 연다.
- 부모 수업 카드 onClick으로 전파하지 않도록 stopPropagation을 유지하고 닫기 후 날짜/화면/스크롤/초점 보존을 검증한다.
- 상태: 실제 앱 build와 합성 API 브라우저 검증 준비. 새 데모/DB 변경 없음.

### 새 앱 버전 정책 적용

운영코드정본 root package.json=1.0.0,root lock=1.0.0,마지막운영릴리스10f52e4에서도같음을확인했다. root앱버전을 이번웹배포의단일정본으로사용해기본minor `1.0.0 → 1.1.0`을한번확정하고 root package/lock을맞춘다. 같은릴리스검사·재빌드·문서릴리스는1.1.0을유지한다. backend/web/mobile의패키지메타정보는기존내부컴포넌트버전이며이번에APK를생성/재전달하지않으므로기존Android versionName1.0/versionCode1과과거기록을수정하지않는다. 날짜·커밋릴리스ID는내부폴더/영수증식별자로보존하고사용자배포버전은숫자1.1.0으로표시한다.

캘린더후속 UI검증: 저장/외부/기술연계3경로,다운로드이벤트0,부모수업상세미열림(대화상자1개),닫기후초점/스크롤보존,Enter/Space,360/390/412가로넘침0,이전수업상세→영상상세2중모달회귀PASS,console오류0. 변경기능코드CalendarPage1파일. 버전메타정보변경후동일버전으로최종build확인예정.

2026-11-09 22:14 — 캘린더 후속 최종확인: production build PASS,버전검증1.1.0/root lock일치,정책적용후재빌드JS가브라우저검증JS와byte동일. UI detector[]·diff check PASS. 이번코드/버전·작업056기록만선택push/운영배포진행.

### 캘린더 후속 1.1.0 운영 배포 완료

2026-11-09 22:17 — 사용자배포버전 **1.1.0**, 기능commit `0f8c8e995e08ae683f892cd5ad2180f24c2410a8`, 내부릴리스 `20261109-221605-0f8c8e99`. root package/lock1.1.0일치·RELEASE_RESULT ok/sha일치·공식status current/pm2online/health200,외부HTML/asset200·서빙asset와release파일동일·미인증classes401 확인. CalendarPage source가직접브라우저검증판과동일하고기존ClassDetailModal source도보존했다. JS `index-BWICSII6.js` SHA256 `d8b69d2f052df77b0a44b92dcbc81b48b449e2c99439760b321ad5e964ce5c04`.

버전은minor1회증가로고정했고완료문서배포도동일1.1.0릴리스단위다. APK생성/전달·versionCode변경·DB직접변경·마이그레이션없음. 실기기Android/인증후실수업UI는미확인. 합성API만사용한브라우저검증과실운영source/asset확인을구분한다. 보류한수집/절차서·첨부이미지·다른작업변경제외.

캘린더 후속 완료문서의 내부릴리스 `20261109-221832-a8476e10` / commit `a8476e10a3c83aed8d13a0187972960e247065f1`도 앱버전1.1.0을유지한다. RELEASE_RESULT ok·공식current/pm2online·외부health/HTML/asset200·root/lock1.1.0·검증source/기능asset동일 확인. 같은릴리스단위의최종관측만보존하며추가push로중복빌드를만들지않는다.

## 사용자 정상 동작 확인·종료

2026-11-09 22:33 — 사용자 “확인했어. 캘린더에서도 영상 상세화면이 정상적으로 열려.” 수신. 캘린더 수업 카드에서 영상 상세화면이 정상적으로 열린다는 사용자 확인을 기록하고 작업056을 사용자 확인 완료로 종료한다. 마지막 안내한 배포버전1.1.0 맥락의 확인이며 사용자가 별도로 기기/OS나 버전번호를 명시한 것으로 확대하지 않는다. 기존 상세 진입의 모든 경로/기기별 동작까지 확인했다고 간주하지 않는다. 코드·버전·DB 변경이나 추가 빌드/push/배포는 수행하지 않는다. 참고영상 수집 보류 유지.
