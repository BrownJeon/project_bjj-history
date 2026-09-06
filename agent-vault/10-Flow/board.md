---
tags:
  - type/board
---
# 칸반 보드

## Backlog
- **포지션 어휘 병합 실행** — [[task-020-recall-lab-spec-and-name-audit]]이 목록만 제시. **사용자 승인 대기**
- **기술 이름 정규화** — task-020이 안 맞는 목록만 보고. **사용자 승인 대기**
- **`techMatch.js` fuzzy `tokenize()`/`normalize()` 공백 처리 비대칭 버그 수정** — Reviewer가 task-020 감사에서 코드+데이터로 직접 재현(2026-09-06). 증상: 같은 기술을 띄어쓰기만 다르게 적으면 매칭 결과가 갈린다 — `보우 앤 애로우 쵸크`는 fuzzy 매칭 성공(자카드 0.75)하는데 `보우앤애로우 쵸크`는 자카드 0으로 미매칭. 원인: `backend/src/utils/techMatch.js:10-15`의 `normalize()`(exact/alias 단계용)는 공백을 완전히 제거하는데, `backend/src/utils/techMatch.js:24-32`의 `tokenize()`(fuzzy 단계용)는 공백으로만 단어를 쪼갠다 — 두 단계가 서로 다른 공백 처리 기준을 쓴다. **이번 배치(task-020~022)에서 고치지 않는다** — 매칭 로직은 사다리 4·5단계·리액션 자동유입·구멍목록 등 여러 기능의 공통 기반이라 변경 영향 범위가 넓어 회귀 검증이 필요한 별도 task로 분리해야 한다. 수정 방향(§7.3 참고): `tokenize()` 전에 `normalize()`와 같은 기준으로 공백을 정리해 `보우앤애로우 쵸크`가 `보우 앤 애로우 쵸크`와 동일하게 취급되도록.
- task-023~029 (복기·연구 2차 배치 이후) — 구멍 목록 · 사다리 5단계 · 노드 7종 · 리액션 자동 유입 · 스파링 음성 입력

## Todo
- [[task-021-home-today-card-openmat-preset]] — 홈 "오늘 기록" 카드 + 오픈매트 프리셋 (스파링 진입 5탭 → 3탭 이내)
- [[task-022-failure-first-spar-input-and-cause-tags]] — 실패 중심 스파링 입력 + `spar_causes` 태그(id 저장) + 리액션 한 줄

## Doing

## Review

## Done
- [[task-020-recall-lab-spec-and-name-audit]] — 복기·연구 사양 확정 + 기술명 매칭률 실측 + 포지션 병합 목록. `docs/recall-lab-spec.md` 산출. **데이터 변경 0건**(6개 테이블 md5 착수 전후 동일). Reviewer·QA가 핵심 수치를 독립 재집계해 재현 확인, §5.3 벨트 수치 오기 1건(20→0 → 실제 20→10) 정정 (2026-09-07 완료)
- [[task-019-profile-avatar-full-path-recovery]] — 프로필 사진 전체 경로 복구: 업로드 UI 신설 + 저장/서빙 경로 일치 + `/uploads` 위장 200 제거 + `avatar_url` 필드명 수정. 부수로 **업로드 실패가 기존 사진을 파괴하던 버그**와 **확장자 위조 저장형 XSS** 차단 (2026-09-06 완료)
- [[task-018-voice-note-date-label]] — 첫 음성분석에만 날짜 라벨이 빠지던 버그 수정 (2026-09-05 완료)
- [[task-017-spar-recording-friction]] — 스파링 기록 마찰 제거(12→8탭) + `outcome` 저장 경로 연결(미구현이었음) + positions 소실 차단 (2026-09-04 완료)
- [[task-016-position-manager-full-scope]] — 포지션 관리 화면을 4개 저장소 전체로 확장(관리 가능 6종→25종), 삭제 전파 (2026-09-04 완료)
- [[task-015-coach-cron-and-prompt-guard]] — 주간 코치 cron이 5주간 엉뚱한 계정을 보던 버그 + 기간/안내 보강 (2026-09-04 완료)
- [[task-014-nfd-encoding-audit]] — 한글 자모분리(NFD) 인코딩 전수 점검·수정, split-brain 유입경로 차단 (2026-09-04 완료)
- [[task-013-study-backlog-fixes]] — `/study` 백로그 버그 2건: 편집 제목 복제 · 활성 챕터 하이라이트 소실 (2026-09-04 완료)
- [[task-012-position-rename-cascade]] — 포지션 이름 변경(rename) 캐스케이드 + 연결수 표시 (2026-08-28 타 세션 작성 → 2026-09-04 검증·수정·커밋 완료)
- [[task-011-clip-tag-pin-pickmeup-spar-feedback]] — 참고영상 태그/핀·기술트리 편집·픽미업 포지션/이어뽑기·스파링 픽 피드백 (2026-08-25 커밋 `804aa24`, 이력서는 2026-09-04 사후 기록)
- [[task-010-study-ux-improvements]] — `/study` 화면 사용성 개선 (제목입력·검색필터·영상고정) (2026-08-24 완료)
- [[task-009-long-video-study-phase3]] — 긴 영상 분석 `/study` Phase 3: 기술추출 연동+챕터편집 (2026-08-23 완료)
- [[task-008-long-video-study-phase2]] — 긴 영상 분석 `/study` Phase 2: 구간 캡처+요약 (2026-08-23 완료)
- [[task-007-long-video-study-phase1]] — 긴 영상 분석 신규 화면 `/study` Phase 1: 목차까지 (2026-08-23 완료)
- [[task-001-ai-pose-animation]] — AI 기술 시연 영상 포즈 체인 애니메이션 (2026-07-14)
- [[task-002-email-auth-multiuser]] — 이메일 회원가입/로그인 + 계정별 데이터 격리 (2026-08-06 완료)
- [[task-003-profile-training-days-multi-affiliation]] — 프로필 수련일수 표시 + 소속 다중 등록 (2026-08-18 완료)
- [[task-004-profile-avatar-upload]] — 프로필 사진 업로드 연결 — 🔴 **완료 기록 오류. 실제 미구현**(이력서 `status: doing`, 역할 기록 전부 공란, 커밋 diff에 avatar 라인 0줄). [[task-019-profile-avatar-full-path-recovery]]에서 재수행
- [[task-005-avatar-static-path-mismatch-fix]] — 프로필 사진 저장/서빙 경로 불일치 버그 수정 — 🔴 **완료 기록 오류. 실제 미수정**(이력서 스스로 "스텁 — ACTIVE.md 기록만 옮겨 적음"이라 명시, 코드에 반영 없음). [[task-019-profile-avatar-full-path-recovery]]에서 재수행
- [[task-006-ytdlp-403-fix]] — 참고영상 YouTube AI 분석 403 실패 수정 + yt-dlp 주간 자동업데이트 (2026-08-22 완료)
