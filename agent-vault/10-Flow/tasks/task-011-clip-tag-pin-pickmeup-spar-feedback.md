---
name: task-011-clip-tag-pin-pickmeup-spar-feedback
aliases: ["참고영상핀", "픽미업포지션", "스파링픽피드백", "804aa24"]
tags:
  - type/task
  - domain/frontend
  - domain/clips
  - domain/pickmeup
related_tasks:
  - "[[task-010-study-ux-improvements]]"
  - "[[task-012-position-rename-cascade]]"
status: done
created: 2026-08-25
updated: 2026-09-04
---

# task-011 — 참고영상 태그/핀 · 기술트리 편집 · 픽미업 포지션/이어뽑기 · 스파링 픽 피드백

> ⚠️ **사후 기록(post-hoc)**. 이 작업은 2026-08-25 세션에서 수행·커밋(`804aa24`)됐으나 당시 agent-vault 이력서가 남지 않았다.
> 아래 내용은 2026-09-04 세션에서 **커밋 diff를 읽고 재구성**한 것이며, 당시의 Developer/Reviewer/QA 검증 로그는 존재하지 않는다.
> 즉 **이 기능들은 팀 검증 순환(Developer→Reviewer→QA)을 거쳤다는 증거가 없다** — 실사용 중 이상이 보이면 이 범위부터 의심할 것.

## 커밋

- `804aa244a9a63d158c36fb88f45c29f72024580d` (2026-08-25 17:52 KST), `origin/main` 푸시 완료
- 16개 파일, +925 / -349

## 실제 변경 내용 (diff 기준)

### 1. 참고영상 핀 고정 + 편집기 분리
- `video_clips.pinned`(TINYINT, default 0) 컬럼 추가 — `models/VideoClip.js`
- `PATCH /api/clips/:id/pin` 신규 (`routes/clips.js`), 프론트 `togglePin()` (`api/clips.js`)
- `ClipsPage.jsx`(-335)에 인라인으로 있던 등록/수정 폼을 **`components/ClipEditor.jsx`(신규 334줄)로 분리** — 다른 화면에서도 재사용 가능해짐
- `Icon.jsx` 아이콘 1개 추가, `utils/suggestions.js` 추천 로직 보강

### 2. 기술트리 팝업에서 관련영상 직접 편집 (`TechPlanPage.jsx` +56)
- 기술 상세 팝업 안에서 분리된 `ClipEditor`를 띄워 관련영상 수정/삭제 가능
- **캐시 동기화 처리 2건**(이 커밋의 실질적 난점):
  - 팝업이 열려 있는 동안 `techniques` 캐시가 갱신되면 팝업 안 `t.clips`도 최신으로 동기화하는 `useEffect`
  - 영상 삭제 시 `t.clips`가 서버에서 기술명으로 조인돼 내려오므로 `reloadClips()` + `reloadTechniques()` **둘 다** 호출

### 3. 픽미업 포지션 지정 + 이어뽑기 (`PickMeUpPage.jsx` +272, `routes/picks.js` +35)
- `pick_history`에 `spar_day_id`, `used`(NULL=미확인/0=사용안함/1=사용함), `situation`, `problem`, `improvement` 컬럼 추가 — `models/PickHistory.js`
- `SparDay ↔ PickHistory` 연관관계 추가 (`models/index.js`)

### 4. 스파링 픽 피드백 (`SparFeedbackCard.jsx` +166, `SparEditPage.jsx` +23)
- `PATCH /api/picks/:id/feedback` 신규 — 뽑은 기술을 실제 스파링에서 썼는지(`used`)와 상황·문제·개선점을 기록

## 남은 위험 / 후속 확인 필요

- **검증 이력 없음** — 위 4개 기능 모두 Reviewer·QA 검증 기록이 없다. 실사용 중 이상이 보이면 이 범위부터 의심할 것.
- **DB 컬럼 반영은 확인됨 (2026-09-04 Leader 실측)** — `information_schema` 조회 결과 `pick_history.{spar_day_id,used,situation,problem,improvement}`, `video_clips.pinned`가 모두 실제로 존재. 마이그레이션 누락은 아님.
- **`video_clips.ai_recommendation`은 DB에 존재(TEXT)** — 즉 [[task-010-study-ux-improvements]] 백로그에 있던 "모델 속성 누락" 버그는 이 커밋의 `models/VideoClip.js +1`로 **이미 해소됐다**. 백로그에서 지워도 된다.
- `PickHistory.user_id`가 모델·DB 모두 nullable(`int(11) YES`) — 다른 테이블은 계정별 격리(task-002)가 적용돼 있는데 이 컬럼만 nullable이라 격리 누수 가능성 점검 필요. **미해결, 후속 과제.**
