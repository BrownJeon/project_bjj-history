---
type: roadmap
project: bjj-trainning
updated: 2026-10-08
phases:
  - { id: 1, name: "기반 앱 (React 이전·기본 기능)", status: done }
  - { id: 2, name: "긴 영상 분석·참고영상",          status: done }
  - { id: 3, name: "데이터 정합·기록 개선",          status: done }
  - { id: 4, name: "복기·연구 루프",                 status: done }
  - { id: 5, name: "관장실·보안·영상 분석 보강",     status: done }
  - { id: 6, name: "모바일 앱·사용성 다듬기",        status: doing }
  - { id: 7, name: "후속 후보",                      status: todo }
tags: [type/roadmap]
---

# BJJ 훈련일지 로드맵

## 공개 화면 · public
### /login | 로그인
- [x] (1) 이메일·비밀번호 로그인 [[task-002-email-auth-multiuser]]
- [x] (1) Google로 계속하기
- [x] (6) 앱에서 외부 브라우저로 Google 로그인 후 앱으로 복귀 [[task-039-android-apk]]

### /signup | 회원가입
- [x] (1) 이메일 회원가입과 계정별 데이터 분리 [[task-002-email-auth-multiuser]]
- [x] (1) Google로 가입

### /oauth/callback | 로그인 복귀 처리
- [x] (1) Google 로그인 결과 받기

## 기록 화면 · login
### / | 홈
- [x] (3) 오늘 훈련 기록 카드와 기록됨 표시 [[task-021-home-today-card-openmat-preset]]
- [x] (3) 오픈매트 프리셋으로 빠른 기록 [[task-021-home-today-card-openmat-preset]]
- [x] (1) 이번 주 요약
- [x] (1) 이번 주 어드바이스 (코치 리포트 요약)
- [x] (4) 이번 주 과제 카드 [[task-027-reaction-inflow-and-weekly-task]]
- [x] (5) 관장실 최근 대화 한 줄 [[task-030-gym-master-chat]]

### /calendar | 수업 기록
- [x] (1) 수업 목록·달력과 검색
- [x] (1) 수업 기록 편집기 (날짜·메모·코치 피드백·주요 포지션·기술·만족도)
- [x] (1) 관련 영상 연결
- [x] (1) 드릴 기록
- [x] (3) 스파링 기록 편집 (상대·라운드·메모) [[task-017-spar-recording-friction]]
- [x] (3) 스파링 결과(outcome) 저장 [[task-017-spar-recording-friction]]
- [x] (3) 실패 중심 스파링 입력 [[task-022-failure-first-spar-input-and-cause-tags]]
- [x] (6) 실패 원인 태그 기본 7개와 직접 입력 [[task-045-spar-cause-default-tags]]
- [x] (6) 성공·실패 기술 선택기 (카테고리·검색·탭 목록) [[task-046-spar-tech-picker-demo]] [[task-047-spar-tech-picker-apply]]
- [x] (3) 음성 기록 분석 (날짜 라벨) [[task-018-voice-note-date-label]]
- [x] (6) 음성 분석이 PATH에 의존하지 않고 동작 [[task-043-whisper-path-resolution]]
- [x] (1) AI 메모 보완

### /recall | 복기
- [x] (4) 숙련도 사다리 (5단계 체크) [[task-024-holes-and-mastery-api]] [[task-025-recall-screen]]
- [x] (4) 구멍 목록 (반복 실패 기술) [[task-024-holes-and-mastery-api]] [[task-025-recall-screen]]
- [x] (4) 기간·포지션으로 수업 검색 [[task-025-recall-screen]] [[task-029-recall-research-ux-fixes]]
- [x] (4) 수업 요약 보기 [[task-025-recall-screen]]
- [x] (4) 오래 안 한 기술 알림 [[task-025-recall-screen]]
- [x] (4) 구멍에서 연구 과제로 이동 [[task-025-recall-screen]]
- [x] (4) 문구·기본 기간 사용자 지적 8건 반영 [[task-029-recall-research-ux-fixes]]
- [-] (4) 기존 스파링 기록 재분류 (사용자가 기록은 그대로 두기로 함)
- [-] (4) `마운트 암바` 별칭 연결 (사용자가 미연결 유지로 결정)
- [ ] (7) 포지션+기술 복합어 이름 매칭 개선

### /research | 연구
- [x] (4) 연구 프로젝트 목록·검색·페이징 [[task-026-research-screen]] [[task-029-recall-research-ux-fixes]]
- [x] (4) 버전별 기술 연구 트리 (노드 7종) [[task-026-research-screen]]
- [x] (4) 노드 상세와 링크 [[task-026-research-screen]]
- [x] (4) 스파링 리액션의 연구 노드 자동 유입 [[task-027-reaction-inflow-and-weekly-task]]
- [x] (4) 이번 주 과제 만들기·마감 [[task-027-reaction-inflow-and-weekly-task]]
- [x] (4) 분기 (부모 버전 트리 복사) [[task-028-branch-import-links]]
- [x] (4) 검색해서 가져오기 (5곳) [[task-028-branch-import-links]]
- [x] (4) 링크 열기와 빈 상태 안내 [[task-028-branch-import-links]]
- [x] (5) 노드에 기술사용 횟수 표시 [[task-037-research-node-usage]]

### /pickmeup | 픽미업
- [x] (1) 카드 스와이프로 영상 뽑기
- [x] (1) 픽 이력
- [x] (2) 포지션 필터와 이어 뽑기 [[task-011-clip-tag-pin-pickmeup-spar-feedback]]
- [x] (2) 스파링 픽 피드백 [[task-011-clip-tag-pin-pickmeup-spar-feedback]]
- [x] (5) 상세를 참고영상 상세와 통합 (조회 미기록·픽하기 고정) [[task-036-pickmeup-shared-clip-detail]]
- [ ] (7) 안 써본 영상 먼저 뽑기

### /techplan | 기술
- [x] (1) 기술트리 (기술 등록·편집)
- [x] (2) 기술트리 편집·태그 [[task-011-clip-tag-pin-pickmeup-spar-feedback]]
- [x] (3) 포지션 이름 변경과 연결 수 표시 [[task-012-position-rename-cascade]]
- [x] (3) 포지션 관리 (기술·드릴·스파링·영상 4곳 전체) [[task-016-position-manager-full-scope]]
- [x] (4) 포지션 어휘 병합과 기술 6종 추가 [[task-020b-position-merge-and-name-fixes]]
- [x] (1) 기술 체인 편집
- [x] (1) 체인 AI 시연 영상 (포즈 애니메이션) [[task-001-ai-pose-animation]]
- [x] (1) 시뮬레이터 (게임 플랜 노드·엣지 편집)
- [x] (6) 기술 관리 카테고리 칸 [[task-047-spar-tech-picker-apply]]
- [x] (5) 기술 카드에 기술사용 횟수 [[task-035-clip-usage-count]]
- [ ] (7) 카테고리 미정 4개 기술 분류 (사용자 입력 대기)

### /study | 영상분석
- [x] (2) 긴 영상 등록 (강의·세미나·스파링)과 목차 만들기 [[task-007-long-video-study-phase1]]
- [x] (2) 구간 캡처와 요약 [[task-008-long-video-study-phase2]]
- [x] (2) 검색·필터와 제목 입력 [[task-010-study-ux-improvements]]
- [x] (2) 진행 상태 자동 갱신 (실행 중일 때만 폴링) [[task-010-study-ux-improvements]]
- [ ] (7) 긴 영상 전사 제한 시간 늘리기 (사용자 판단 대기)

### /study/:id | 영상분석 상세
- [x] (2) 기술 추출과 기술트리 연동 [[task-009-long-video-study-phase3]]
- [x] (2) 챕터 편집 [[task-009-long-video-study-phase3]]
- [x] (2) 전체 요약과 재분석·분석 취소 [[task-009-long-video-study-phase3]]
- [x] (2) 영상 고정과 활성 챕터 표시 [[task-010-study-ux-improvements]] [[task-013-study-backlog-fixes]]
- [x] (6) 영상분석 음성 전사가 PATH에 의존하지 않고 실패가 로그에 보임 [[task-044-video-whisper-path-and-visibility]]
- [x] (6) 분석한 영상을 서버에 저장해 유튜브에서 지워져도 서버 영상으로 재생 (저장 실패 시 경고 카드) [[task-048-study-video-local-save]]
- [x] (6) 서버 저장본 플레이어에 목록과 같은 썸네일 표시 (유튜브에서 지워져 썸네일이 사라지면 첫 프레임) [[task-049-study-video-player-poster]]
- [ ] (7) 이미 분석한 영상 8건의 영상 파일 서버 저장 (사용자 승인 후 별도 작업)
- [ ] (7) 썸네일도 서버에 저장 (유튜브에서 지워져도 목록·플레이어 썸네일 유지, 기존 영상 백필과 함께)
- [ ] (7) 저장본으로 재분석 (유튜브가 사라진 뒤에도 재분석, 재분석이 기존 챕터를 먼저 지우는 문제)

### /clips | 참고영상
- [x] (1) 참고영상 등록·목록·즐겨찾기
- [x] (2) 태그·핀 [[task-011-clip-tag-pin-pickmeup-spar-feedback]]
- [x] (1) AI 영상 분석 (유튜브)
- [x] (2) 유튜브 분석 403 해결 [[task-006-ytdlp-403-fix]]
- [x] (5) 인스타그램 쿠키 로그인 세션 검증 [[task-032-instagram-cookie-session-validation]]
- [x] (5) 영상 분석 실패 원인을 한국어로 안내 [[task-033-ytdlp-error-message-clarity]]
- [x] (5) 영상 없는 게시물은 사진 전 장을 분석 [[task-034-photo-post-analysis]]
- [x] (5) 봤음·써봤음 횟수 기록과 필터 [[task-035-clip-usage-count]]
- [x] (5) 연계 기술 AI 추천 [[task-036-pickmeup-shared-clip-detail]]
- [x] (6) 영상은 음소거로 재생 시작 [[task-041-clip-video-muted-default]]

### /coach | 코치
- [x] (1) 진단 요약과 반복 약점
- [x] (1) 코치 리포트 생성·목록·삭제
- [x] (1) 훈련 플랜과 드릴 제안

### /me | 프로필
- [x] (1) 기본 정보 수정
- [x] (3) 수련일수 표시와 소속 여러 곳 등록 [[task-003-profile-training-days-multi-affiliation]]
- [x] (3) 프로필 사진 올리기·삭제 [[task-019-profile-avatar-full-path-recovery]]
- [x] (1) 벨트 이력
- [x] (1) 회원권 결제 이력
- [x] (1) 파일 저장 위치 (서버·기기)
- [x] (1) Instagram 쿠키 등록·삭제
- [x] (5) 관장 모델 선택 [[task-030-gym-master-chat]]

### master-chat | 관장실 (전 화면 상단 바)
- [x] (5) 관장 페르소나 대화 (복기·연구·자료 추천) [[task-030-gym-master-chat]]
- [x] (5) 도구 17종과 제안 카드 승인 [[task-030-gym-master-chat]]
- [x] (5) SNS 검색 [[task-030-gym-master-chat]]
- [x] (5) 대화 목록·보관·복원 [[task-030-gym-master-chat]]
- [x] (6) 하단 토글 탭 동작 (앞 화면 우선·위치 점·알림 배지) [[task-023-toggle-nav-generalization]] [[task-040-toggle-tab-front-first]] [[task-042-toggle-tab-position-dots]]
- [ ] (7) 관장실 밖 화면 이모지 아이콘 통일

## API · api
### /api/auth | 인증
- [x] (1) 가입·로그인·내 정보 [[task-002-email-auth-multiuser]]
- [x] (6) 앱 로그인 (app-start·1회용 코드 교환) [[task-039-android-apk]]

### /api/classes | 수업·드릴·스파링
- [x] (1) 수업 CRUD
- [x] (1) 드릴·스파링 일자 CRUD
- [x] (5) 소유권 검사 [[task-031-idor-ownership-4-routes]]

### /api/spar-causes | 스파링 원인 태그
- [x] (3) 태그 CRUD [[task-022-failure-first-spar-input-and-cause-tags]]
- [x] (6) 기본 7개 동기화 [[task-045-spar-cause-default-tags]]

### /api/techniques | 기술·포지션·태그
- [x] (1) 기술 CRUD
- [x] (3) 포지션·태그 이름 변경과 삭제 전파 [[task-012-position-rename-cascade]] [[task-016-position-manager-full-scope]]
- [x] (6) 카테고리 저장 [[task-047-spar-tech-picker-apply]]

### /api/chains | 체인
- [x] (1) 체인 CRUD
- [x] (1) AI 체인 생성과 시연 영상 작업 [[task-001-ai-pose-animation]]

### /api/gameplans | 게임 플랜
- [x] (1) 게임 플랜 CRUD

### /api/clips | 참고영상
- [x] (1) 영상 CRUD·검색
- [x] (1) AI 분석 요청과 상태
- [x] (5) 사용 기록 [[task-035-clip-usage-count]]
- [x] (5) 소유권 검사 [[task-031-idor-ownership-4-routes]]

### /api/picks | 픽미업
- [x] (1) 픽 CRUD
- [x] (2) 이어 뽑기 [[task-011-clip-tag-pin-pickmeup-spar-feedback]]

### /api/recommend | AI 추천
- [x] (5) 연계 기술 AI 추천 [[task-036-pickmeup-shared-clip-detail]]

### /api/enhance-memo | 메모 보완
- [x] (1) 메모 AI 보완
- [x] (1) 영상 분석 작업 조회

### /api/voice | 음성 분석
- [x] (3) 음성 업로드와 분석 [[task-018-voice-note-date-label]]
- [x] (5) 작업 목록의 소유자 분리 [[task-031-idor-ownership-4-routes]]

### /api/coach | 코치
- [x] (1) 진단·리포트·플랜
- [x] (1) 코치 대화 (화면에서는 쓰지 않음)

### /api/long-videos | 긴 영상 분석
- [x] (2) 영상 등록·상태·목록 [[task-007-long-video-study-phase1]]
- [x] (2) 챕터 수정·재분석·삭제 [[task-009-long-video-study-phase3]]

### /api/recall | 복기
- [x] (4) 검색·오래된 기술·요약 [[task-025-recall-screen]]

### /api/holes | 구멍·숙련도 집계
- [x] (4) 구멍 목록 [[task-024-holes-and-mastery-api]]
- [x] (4) 숙련도 조회·수정 [[task-024-holes-and-mastery-api]]

### /api/research | 연구
- [x] (4) 프로젝트·버전·노드·링크 CRUD [[task-026-research-screen]]
- [x] (4) 분기·가져오기 검색 [[task-028-branch-import-links]]
- [x] (4) 이번 주 과제 [[task-027-reaction-inflow-and-weekly-task]]

### /api/master | 관장실
- [x] (5) 대화 CRUD와 SSE 턴 [[task-030-gym-master-chat]]
- [x] (5) 제안 승인·거절 [[task-030-gym-master-chat]]
- [x] (5) SNS 검색 [[task-030-gym-master-chat]]

### /api/profile | 프로필·벨트·회원권
- [x] (1) 프로필 조회·수정
- [x] (3) 사진 업로드·삭제 [[task-019-profile-avatar-full-path-recovery]]
- [x] (1) 벨트·회원권 CRUD

### /api/settings | 설정
- [x] (1) Instagram 쿠키 상태·등록·삭제 [[task-032-instagram-cookie-session-validation]]

## 서비스 · service
### bjj | 앱 서버 (pm2, 포트 3000)
- [x] (1) API와 SPA 정적 서빙 한 프로세스
- [x] (5) blue/green 릴리스 배포 (push 자동배포)
- [x] (2) 긴 영상 분석 워커 [[task-007-long-video-study-phase1]]
- [x] (1) AI 호출 직렬 큐와 재시도 (claude CLI)
- [x] (3) 한글 자모분리(NFD) 저장 차단 [[task-014-nfd-encoding-audit]]
- [x] (6) 외부 도구(yt-dlp·whisper)를 PATH에 의존하지 않고 실행 [[task-043-whisper-path-resolution]] [[task-044-video-whisper-path-and-visibility]]

### character-registry | 기술 설명 캐릭터 원본·스킨 버전 (단독 도구)
- [x] (7) 공통베이스1·스킨2·원본6 BLOB 저장과 해시복원·멱등 등록 (앱 API 미연결) [[task-055-character-concept-sheet]]
- [x] (7) 스킨 새버전 추가와 과거 자산·두 역할의 버전 연결 보존 [[task-055-character-concept-sheet]]

## 배치 · batch
### coach-cron | 주간 코치 리포트
- [x] (1) 주간 자동 리포트 생성
- [x] (3) 대상 사용자 오류와 프롬프트 길이 안내 수정 [[task-015-coach-cron-and-prompt-guard]]

### update-ytdlp | yt-dlp 주간 업데이트
- [x] (2) 주간 자동 업데이트 [[task-006-ytdlp-403-fix]]

## 모바일 앱 · app
### mobile-android | Android 앱 (Capacitor)
- [x] (6) 운영 사이트를 불러오는 앱 껍데기 (BJJ 훈련일지) [[task-039-android-apk]]
- [x] (6) 앱 아이콘과 웹 아이콘·og-image [[task-038-app-icon]]
- [x] (6) 파일을 기기 Download 폴더에 저장 [[task-039-android-apk]]
- [x] (6) 뒤로가기·키보드 가림·내비게이션 버튼 겹침 해소 [[task-039-android-apk]]
