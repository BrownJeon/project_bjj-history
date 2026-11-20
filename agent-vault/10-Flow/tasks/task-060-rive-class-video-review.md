---
task_id: task-060
title: 수업 AI 영상 품질 개선을 위한 Rive·M4 로컬 제작 검토
status: done
stage: closed
roles_involved: [leader]
related_tasks: ["[[task-001-ai-pose-animation]]", "[[task-055-character-concept-sheet]]"]
tags: [type/task, domain/adoption, domain/video]
aliases: [Rive 검토, ADP-014, 수업 AI 영상 품질]
created: 2026-11-10
updated: 2026-11-11
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "사용자 AI 영상 생성 도입·개선 폐기 결정에 따른 기록 종료. 추가 생성·설치·제품 통합·운영 변경 없음"
  last_event_id: exec-003
waiting: none
initiative_decision: reject
closed_at: 2026-11-11
previous_stage_at_closure: research_completed
---
# 수업 AI 영상 — Rive와 M4 로컬 제작 검토

> **현재 결론 (2026-11-11): 사용자 결정으로 AI 영상 생성 도입·개선을 폐기하고 `done / closed / waiting:none`으로 종료했다. 추가 품질 확인·시범·제품 통합 대기는 없다. 아래의 `pending`·`review`·`trial`은 당시 이력이며 이 종료 결정이 최신이다.**

## 목표와 승인 범위
- 사용자가 지난 테스트의 낮은 영상 품질을 설명하며 Rive 적용 가능성과 비용 의견, M4 서버에서 추가 사용료 없는 방법 조사를 요청했다.
- 문서·코드 읽기와 분석만 진행한다. Rive/대안 설치·실행·계정 생성·결제·자료 업로드·모델 다운로드·앱 변경·DB 쓰기·테스트 영상 생성·운영 배포는 이번 범위에 없다.
- 도입 분석 정본: `../adoption/ADP-014-rive/10-분석.md`(워크스페이스 기준 `adoption/ADP-014-rive/`). 사용자 결정 후에만 시범 범위를 구체화한다.

## 관련 과거 이력 요약
- [[task-001-ai-pose-animation]]: 체인 AI 영상은 SD/SVD/이미지 연결 실험 이력이 있다. 이 과거 결과를 현재 수업 영상 구현과 혼동하지 않는다.
- [[task-055-character-concept-sheet]]: 승인된 파랑·흰 도복 2D 캐릭터 원본과 DB 저장 기반만 완료했다. 실제 Blender 모델·리깅·동작 데이터는 미제작이다.
- 현행 수업 경로: `ClassDetailModal.jsx` → `POST /classes/:id/generate-video` → `classVideoService.js`. 개별 이미지를 FFmpeg로 정지 클립화한다.

## Leader 지시사항
- 메인: Rive 최신 공식 가격·CLI·내보내기·런타임·약관과 무료 대안 비교. 조사 사실과 품질/성능 추론을 구분한다.
- 독립 보조 Leader: 지정된 M4 관련 저장소 문서·소스의 읽기 조사만 가능. 비밀파일·운영 기록·DB 접근 없이 현재 확인 가능한 사양·렌더링 재사용 지점과 미확인 사항을 메인에게 보고한다. 본문 범위는 별도 지시로 한정한다.
- Developer/Reviewer/QA/Deployer의 구현·최종 검증·배포는 미배정이다. 읽기 조사만으로 QA PASS나 실제 영상 품질 개선을 주장하지 않는다.

## 실행 도구·절차 이력
| 이벤트 ID | 시각(KST) | 사건 | 이전 → 현재 담당 / 현재 절차 | 범위·남은 일 | 근거 |
|---|---|---|---|---|---|
| exec-001 | 2026-11-10 16:40 | start | 없음 → codex / codex_scoped | 수업 AI 영상 대안 조사; 도입·시범 결정 전 | 이번 대화의 사용자 검토 요청 |
| exec-002 | 2026-11-10 16:47 | research_completed | codex → codex / codex_scoped | 기존 수업/M4 코드·공식 요금/라이선스·무료 대안 분석 완료. 시범·도입 결정은 별도 | ADP-014/10-분석.md 및 원문16개·보조 Leader 읽기 보고 |

## 조사 결과와 실행 범위
- `신규도입` 스킬의 경량 검토를 적용했다. 메인 조사와 보조 Leader 1개의 M4 읽기 조사만 실행했다.
- 현재 수업 경로는 독립 생성 정지 이미지를 4초씩 이어 붙인다. 과거 출력·운영 로그의 재현은 하지 않았으며 당시 개별 실패 원인은 확정하지 않았다.
- Rive 무료 .riv export는 시작 로고를 포함하고 runtime 요금은 없다. Cadet 월 $17/연 $108, 공식 MP4는 유료 Cloud Renderer다. 무료 CLI와 외부 AI 사용료, 로컬 작업과 서명/게시의 외부 요청을 구분했다.
- M4 무과금 MP4 후보는 Blender+검증된 동작 템플릿. 무료 Rive는 인터랙티브 단계별 시연 후보, Three.js는 자체 제작 대안이다. 모델·rig·동작 데이터는 아직 없고 품질/성능은 미검증이다.
- 범위 일탈 보고: 보조 Leader의 M4 docs 검색에서 무관한 배포/n8n 발췌도 일부 읽었다. 결론 근거로 사용하지 않았고 비밀파일·인증·개인 데이터 접근은 없었다. 상세는 분석 §8에 기록했다.
- 앱/DB/운영·설치·결제·외부 자산 업로드·버전 증가·빌드/배포 없음. Developer/Reviewer/QA/Deployer 및 외부 Claude 검토는 skipped(연구만 수행, 실제 구현/품질 PASS 아님).

## 최종 요약 (사용자용)
- **상태**: 요청한 타당성·요금·M4 대안 조사 완료. 실제 도입 결정 전.
- **무엇이 바뀌었나**: ADP-014 분석과 출처·프로젝트 조사 이력만 추가했다.
- **배포**: 없음. 앱·DB·운영 변경과 버전 증가는 없다.
- **AI 검증**: 공식 문서·현재 코드 대조, 보조 Leader M4 읽기 조사. 실제 영상 품질·M4 처리시간·WebView 재생은 미검증.
- **사용자 확인**: 조사 결과 전달 단계. 샘플·도입 승인 기록 없음.
- **사용자 결정**: Rive/Blender 채택과 시범 진행은 미결정. 요청한 조사 완료를 후속 도입 승인 대기로 바꾸지 않는다.
- **남은 일**: 이번 조사 범위에는 없음. 후속 시범을 원할 때 기술·산출물·설치/외부 전송 범위를 정한다.
- **이슈**: 기존 영상이 연속 관절 동작을 제어하지 못하는 구조임을 확인했다. 과거 테스트 원인·샘플 품질·M4 속도는 확정하지 않았다. 일부 공식 페이지 직접 수집 실패와 보조 검색 범위 일탈은 분석 §8에 명시했다.


## 사용자 AI 영상 생성 폐기·작업 종료 (2026-11-11)
- 사용자 원문: “샘플영상을 보니까 AI영상 생성에 대해서는 폐기하고 작업 완료해줘.”
- 최신 결정: AI 영상 생성의 Rive/Wan/Blender 도입·개선 시범을 더 진행하지 않고 관련 task-060~065를 종료한다. 기존 기술 검증/생성 성공 이력은 보존하며 이를 사용자 품질 승인이나 제품 채택으로 바꾸지 않는다.
- 도입건 ADP-014(Rive), ADP-015(Wan)는 `trial → reject`, 적용사례는 `no-go`다. 정식 도입한 제품을 철거한 것이 아니므로 `retire`로 표시하지 않는다.
- 원본 캐릭터·정지 기술 이미지(task-055/058)·업로드 사진·기존 영상/리그/검증 기록과 M4 설치환경은 보존한다. 파일 삭제·모델 제거·기존 서비스 중지·수업/체인 영상 UI/API 삭제는 이번 종료 작업에서 수행하지 않았다.
- 추가 영상 생성·모델 다운로드·품질 재검토·제품 통합 작업은 종료, `waiting: none`. 새 사용자 지시 없이 재개하지 않는다.
- 이번 변경은 작업/도입 기록 정리뿐이다. 앱/백엔드/DB/버전/배포/commit/push 변경 없음. 이전 전달물·검증 JSON·ZIP은 생성 당시 증거로 유지한다.
- 연계 종료 정본: [[task-065-constrained-tripod-two-characters]] · `docs/verification/task-065-ai-video-closure.json`.

| 이벤트 | 날짜(KST) | 담당 / 절차 | 범위·근거 |
|---|---|---|---|
| exec-003 | 2026-11-11 | codex / codex_scoped | 사용자 샘플 확인 후 AI 영상 생성 폐기 명시 지시 수신·도입 미채택/작업 종료 기록. 기술 검사 이력 보존·추가 생성/앱/DB/배포 없음 |
