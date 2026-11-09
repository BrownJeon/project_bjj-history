---
task_id: task-056
title: 수업 상세 관련 영상에서 공용 영상 상세 열기
status: doing
phase: deployment_in_progress
waiting: ""
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
  current_scope: "사용자 직접수정·테스트·데모생략 지시 및 이번변경 커밋/push/운영배포 승인. 보류한 참고영상 수집 제외"
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

2026-11-09 19:08 — 사용자 지시 범위의 직접 수정·테스트 완료. 운영 배포·커밋/push는 이번 수정에서 실행하지 않았다. 구현은 선택 checkout에서 검증했고 다른 checkout의 기능코드를 덮어쓰지 않았다. 기존 참고영상 수집 보류와 다른 작업 변경은 보존했다.

## 운영 배포 승인·착수

2026-11-09 19:18 — 사용자 “커밋 밒 푸시해서 운영에 배포작업까지 진행해줘” 수신. 이번 수정·작업056 기록만 선택 커밋/push·웹 배포한다. 보류한 참고영상 수집/절차서와 첨부이미지·개인자료는 포함하지 않는다. 최신 운영/원격 기준을 유지하고 테스트한 기능코드와 동일성을 확인했다. 운영DB 수동 변경·마이그레이션은 없다.
