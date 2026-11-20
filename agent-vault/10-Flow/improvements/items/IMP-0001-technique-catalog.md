---
imp_id: IMP-0001
title: "참고사이트 기술 목록 확장과 기존 기술 보존"
status: done
screen: ""
area: "behavior"
priority: ""
found_on: ""
created: 2026-11-08
updated: 2026-11-08
observed_ref: 2e3575d
related_task: ""
planned_task: "[[task-054-improve-technique-tree]]"
tags:
  - type/improvement
aliases:
  - IMP-0001
---

## 현상

기술 메뉴의 기술트리 탭 개선 요청. 참고사이트: https://labs.quartz.best/ko-KR/pbb/techniques

## 기대하는 모습

사용자 원문:
> 1. 참고사이트를 통해서 기술목록들을 추가해주는데 기존에 있는 기술은 그대로 사용해줘.

## 근거

- 2026-11-08 사용자 요청 및 개선 백로그 초기화·3건 등록 후 함께 착수 승인.
- 공개 목록 DOM에서 159개 항목 확인: 스탠딩 9 / 가드·스윕 44 / 가드 패스 21 / 포지션·컨트롤 37 / 서브미션 48.
- 현재 모델·API: `backend/src/models/Technique.js`, `backend/src/routes/techniques.js`. 기존 데이터의 현재 건수는 별도 조회 결과로만 판단한다.

## 분류 메모 (착수 때 Leader)

- 사용자 세 항목 동시 준비 승인. 개별 P1/P2/P3는 지정하지 않아 비워 둔다.
- 기존 이름·ID·메모·영상 연결·연습 기록 보존이 사용자 요구다. 비슷한 이름을 자동 병합하거나 기존 기술을 삭제하지 않는다.
- 참고 목록에 포지션·일반 개념·별칭 후보가 포함된다. 추가 대상 및 개인 기술/공통 사전 구조는 조사 후 사용자 결정이 필요하다.

## 구현·검토 진행 근거 (2026-11-08)

159개 catalog·28재사용/110신규준비/21후속확정 사용자선택을반영했다. 적용안·관장분류·결정JSON은 assets/IMP-0001-application-proposal.md, IMP-0001-new-category-proposal.json, IMP-0001-decisions-prepared.json. 실제운영반영/분류채택승인전이며기존60행을바꾸지않았다. 상세 [[task-054-improve-technique-tree]].

완료 근거: [[task-054-improve-technique-tree]], 코드릴리스 `20261108-225820-09b82c2f`.
