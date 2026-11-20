---
imp_id: IMP-0002
title: "관장 검토 설명과 앞뒤·관련 기술을 담은 상세화면"
status: done
screen: ""
area: "ui"
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
  - IMP-0002
---

## 현상

현재 `TechDetailModal`은 포지션·태그, 개인 메모, 스파링 성공·영상 연습 합계, 관련 영상, 수정·삭제·닫기로 구성되어 있다. 전용 기술 설명과 기술 간 연결 영역은 없다(코드 확인).

## 기대하는 모습

사용자 원문:
> 2. 상세화면에 대하여 보완작업을 해주는데 참고사이트의 설명을 가지고 관장에이전트가 한번더 검토하여 설명을 동일하게 사용하지말고 재생성해서 설명항목을 추가해줘. 참고사이트의 기술을 선택하면 기술에 대해 '앞뒤로 이어지는 기술'을 차용해서 화면을 구성해줘. '함께보는 기술'도 함께 차용하면 좋을 것같아

## 근거

- 2026-11-08 사용자 요청 및 세 항목 함께 착수 승인.
- 참고: https://labs.quartz.best/ko-KR/pbb/techniques/kimura
- 직접 관찰: 들어오는 기술 / 현재 기술 / 이어지는 기술, 별도 관련 기술 영역. 목록 접기·펼치기 동작 확인.
- 현재 구현: `web/src/pages/TechPlanPage.jsx`의 `TechDetailModal`.

## 분류 메모 (착수 때 Leader)

- 개인 메모를 기술 설명으로 덮어쓰지 않는다. 관장 검토는 실제 역할 호출·응답으로 증명하고, 예시 검토를 전체 목록 검토 완료로 확대하지 않는다.
- 사용자 승인 전 레이아웃·화면 기준·대체 시안 제작 방식을 확정하지 않는다. 기존 실제 앱 문맥을 유지하는 시안을 준비하는 방향을 검토한다.
- 원문 설명의 단어 치환 대신 주짓수 원리·조건·실수·연결을 독립적으로 설명하는 초안을 검토한다.

## 구현·검토 진행 근거 (2026-11-08)

기존모달설명159개·앞뒤/관련0/1/N·같은창이동/이전복귀·메모분리구현. Reviewer/QA49+15/C2추가지적0,실제앱HEAD+task054만배포후보build/CUA PASS. 실제DB/운영반영전이다. 상세 [[task-054-improve-technique-tree]].

완료 근거: [[task-054-improve-technique-tree]], 코드릴리스 `20261108-225820-09b82c2f`.
