---
tags:
  - type/board
---
# 칸반 보드

## Backlog

## Todo

## Doing

## Review

## Done
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
