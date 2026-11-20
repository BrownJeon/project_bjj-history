---
task_id: task-064
title: 고정 골격·관절 제한 캐릭터와 기본 동작 샘플
status: done
stage: closed
quality_status: character_skin_checks_passed
user_quality_approval: not_pursued
roles_involved: [leader, worker, visual_reviewer]
related_tasks: ["[[task-063-tripod-motion-remake]]", "[[task-062-rive-2d-single-x-sample]]", "[[task-055-character-concept-sheet]]"]
tags: [type/task, domain/character, domain/video, domain/adoption]
aliases: [기본 골격 캐릭터, 관절 제한 기본 동작, ADP-014-C03]
created: 2026-11-11
updated: 2026-11-11
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "사용자 AI 영상 생성 도입·개선 폐기 결정에 따른 기록 종료. 추가 생성·설치·제품 통합·운영 변경 없음"
  last_event_id: exec-005
waiting: none
initiative_decision: reject
closed_at: 2026-11-11
previous_stage_at_closure: character_skin_prepared
---
# 고정 골격·관절 제한 캐릭터

> **현재 결론 (2026-11-11): 사용자 결정으로 AI 영상 생성 도입·개선을 폐기하고 `done / closed / waiting:none`으로 종료했다. 추가 품질 확인·시범·제품 통합 대기는 없다. 아래의 `pending`·`review`·`trial`은 당시 이력이며 이 종료 결정이 최신이다.**

## 사용자 요청과 승인 범위
- 사용자: “주짓수의 움직임 특성상 … 이미 캐릭터에 관절과 뼈대를 구축해놓고 그 범위 안에서만 움직이게 … 기본 골격과 뼈대를 적용한 캐릭터를 먼저 생성하고 기본 동작에 대한 샘플을 생성해줘”.
- 기존 파란 도복/흰 머리/갈색 벨트 특징을 유지한 리깅용 2D 캐릭터 1명을 우선 만든다. 고정 측면 시점의 깨끗한 코드 벡터 아트이며, 원본 그림·DB자산을 대체하지 않는다. 반복 프레임에서 새 이미지를 그리지 않는다.
- 실제 Rive RootBone→Bone 부모·자식 계층/고정 길이·native 회전 제한·일관된 관절 방향을 적용한다. Clean/Rig 뷰와 중립 자세·팔꿈치 굽히기·한쪽 무릎 굽히기·얕은 스쿼트를 만든다.
- 동작 범위는 이번 캐릭터의 보수적 시연 프로파일이다. 의학적인 정상 가동 범위나 모든 주짓수 동작의 안전성/정확도를 보장한다고 표시하지 않는다.
- 기존 M4 로컬·추가 유료 서비스 없음·원본/이전 실패샘플 보존 조건 유지. 새 모델·툴 설치/계정/결제/클라우드 업로드·앱/DB/버전/배포 변경은 수행하지 않는다.

## 관련 이력과 이번 차이
- [[task-063-tripod-motion-remake]]: Wan 사진 I2V는 인체/그림 붕괴로 사용자 반려. Rive 임시 추출 파츠/flat22roots 역시 큰 변형 시 품질 실패. 사전 골격·관절·접촉 제어의 필요성을 사용자와 검토했다.
- [[task-062-rive-2d-single-x-sample]]: 실제 Rive 실행/M4 캡처·영상화 경로는 검증됐지만 그 시안의 외형/모션은 사용자 반려됐다.
- 이번은 복잡한 두 사람 기술을 먼저 만들지 않고, 재사용 가능한 1인 골격/제약과 기본 동작에서 구조를 확인하는 사용자 승인 범위다.

## 실행 도구·절차 이력
| 이벤트 | 날짜(KST) | 담당 / 절차 | 범위·근거 |
|---|---|---|---|
| exec-001 | 2026-11-11 | codex / codex_scoped | 사용자 명시 제작 요청 수신·기존 Rive/M4/코드 재사용 탐색 완료·native RotationConstraint/Bone 스키마 확인·1인 리그/기본 동작 구현 착수 |

## 역할과 파일 소유
- 메인: 요구/기록·M4 native 제한 강제실험·캡처/영상화/실제 육안검증·최종 전달. task/ACTIVE/board는 메인만 수정.
- Worker: `reference/rig/task-064/generate_character.py`, `rig_profile.json` 및 지정 프로젝트 생성물. true hierarchy/고정 길이·native constraint·캐릭터 벡터 아트/동작 타임라인.
- Leader 검증: `reference/rig/task-064/verify_kinematics.py`만. 각 프레임의 독립 FK·길이/각도/발 고정·계층을 검산.
- 독립 시각검토(single_x_motion): 실제 중립/기본 동작 프레임 4장의 큰 구조/지지 오류 검토. 관장 페르소나 또는 의학적 정상범위 판정으로 대신 표시하지 않으며 모든 BJJ 기술 통과를 대리하지 않음.
- 서로 다른 작업자의 파일/변경은 되돌리지 않는다. 기존 프로젝트/기존 설치환경은 보존한다.

## 스킬/재사용·근거
- search-first 실제 읽기/적용: 기존 native Rive CLI1.9.2·task062/063의 RML/SSH bridge·M4 Pillow/FFmpeg 경로 확인. 공용 `.claude/tools`의 관련 도구 없음·ADP014/015 이력 대조. 새 의존성 없이 기존 경로를 확장한다. 탐색 단계에서는 메인이 수행했고, 완료 후 사용자 팀 위임 범위에서 구현·독립검증을 분담했다.
- UI 화면 작업이 아니므로 Taste/Impeccable은 적용하지 않았다. 코드로 구성하는 리깅용 2D 자산이며 새 이미지 AI/API를 호출하지 않는다.
- 실제 CLI schema: RotationConstraint=min/max/minValue/maxValue/minMaxSpaceValue/strength/doesCopy. 공식 [Rive C++ 구현](https://raw.githubusercontent.com/rive-app/rive-cpp/master/src/constraints/rotation_constraint.cpp)에서 radians/local minmax·target 없는 제한 지원 확인. 실제 설치 엔진에서도 별도 픽셀 비교로 검증한다.

## 확인 항목
- 초과 각도 요청+native 제한 결과가 정확한 경계 자세와 일치하고 무제한 결과와는 달라야 한다. 단순히 항상 범위 안 숫자를 넣고 제한 기능이 동작했다고 주장하지 않는다.
- 본 길이/스케일·부위/계층 불변, 모든 프레임 각도 범위, 정해진 굽힘 방향, 스쿼트 두 발바닥 고정, 지지발 고정·실제 캐릭터/관절 프레임 확인.
- 생성/범위 검사와 자연스러움·사용자 품질 승인을 구분한다. 기본 리그 검사와 샘플 준비는 완료했으며 사용자 외형/자연스러움 승인은 대기다.


## 실행·검증 결과 (2026-11-11)
- M4 Pro 24GiB의 기존 native Rive CLI1.9.2를 재사용했다. 각 artboard는 RootBone1+Bone15의 실제 계층과 RotationConstraint16개를 가지며 본 길이/스케일 애니메이션 없이 local rotation과 골반 위치만 바꾼다.
- **제한 강제 실험**: 부모 회전0.8rad 아래에서 자식 -2.5rad 요청/최소 -1.4rad로 제한. 실제 native 결과는 경계 -1.4rad 기준 그림과 SHA/픽셀이 같고, 무제한 -2.5rad 그림과는 달랐다. 단순히 범위 안 숫자만 입력한 시험이 아니다. 영수증 `~/.codex/artifacts/bjj-t064/native-clamp-proof.json`.
- review01에서 자동재생 기본 state machine 연결 누락·LayoutComponentStyle 경고·그리기 순서로 얼굴/벨트/리그가 가려진 결함을 확인하고 수정했다. review02에서 Clean 재생/전경 도형/관절 표시를 실제 재확인했고 native verify 종료0/inspect 문제0이다.
- **별도 FK 검증 PASS**: 16본/361원키+2,520보간 자세. 범위 위반0·scale변경0·부모관계불일치0, 길이 오차 최대8.53e-14px. 접지 키프레임 오차5.68e-13px, 보간 중 연속 상한0.00881948px(명시 허용오차0.05px)다. 연속시간 완전0 drift로 주장하지 않는다. 위반 주입6종 모두 검출·검증기 자기테스트3종 PASS/원본 불변.
- **독립 정지포즈 검토**: 중립/팔꿈치/무릎/스쿼트4장에 명백한 관절 역꺾임·사지 분리·잘림·큰 지지 모순 없음. 메인이 최종 contact sheet를 실제 열어 확인했다. 전 동영상 실시간 독립 재생 검토는 하지 않았고 사용자 품질 승인은 아직 없다.
- **실제 전체 렌더**: Clean/Rig 각360프레임, 총720PNG/16.116초. 최종1600×1160/H264/24fps/15초, 합성·인코딩14.468초, 전체 decode오류0. MP4/GIF/포스터/contact sheet/원본ZIP 5개 모두 다운로드 SHA 일치.
- ZIP 초기 검사에서 타임라인/생성영수증 누락을 발견해 두 파일과 음성 대조 영수증을 추가한 뒤 다시 포장했다. 최종ZIP14파일/212,775bytes이며 핵심 scene/profile/timeline/model-receipt 4개는 로컬 정본과 바이트 일치, 독립 검증 입력 해시·캡처 scene SHA도 일치한다. 재렌더/영상 내용 변경은 없다.
- 실제 native scene SHA256 `f510f92ba11b23d2bceaa036dffa02b1378db55489d887183f8361bf7d1b0bd4`. 검증 정본: `docs/verification/task-064-constrained-character-basics.json`.

## 산출물과 재현 경로
- 로컬 전달 폴더: `/Users/brownjeon/.codex/artifacts/bjj-t064/final-01/`.
- `basic-motions.mp4`(682,315bytes/SHA `d1364a5644521f428b8dc66a0ad3ab98acd5d2fa144916335bf97e43988adbc0`), `preview.gif`, `character-rig.png`, `contact-sheet.png`, `constrained-character-rml.zip`, `delivery-receipt.json`.
- 수정 가능한 원본: `reference/rig/task-064/project/scene.rml`, `rive.yaml`, `timeline.json`, `model-receipt.json`; 생성기·관절 프로파일·독립 검증기·M4 캡처/영상화/포장 보조 스크립트와 README는 같은 task-064 폴더에 있다.
- M4 작업 폴더: `/Users/brownjeon/.local/share/bjj-rive/task-064/`(기존 task061/062/063와 분리). Rive 로그인/클라우드 게시/analytics/유료 API/새 설치/앱/DB/버전/운영/배포/commit/push 없음.

## 범위와 다음 판단
- 이번은 **고정 측면의 기본 리깅/동작 샘플**이다. 원본 일러스트와 동일한 완성 외형은 아니며 blue gi/white hair/brown belt 특징을 보존한 단순 벡터 캐릭터다.
- 관절 범위는 보수적인 캐릭터 시연 설정이며 의학적 정상범위 인증이 아니다. 두 사람의 그립·충돌·동적 무게중심/큰 회전·주짓수 교육 정확도·자연어→검증 모션 자동생성은 구현/보장하지 않았다.
- 상태: `review / sample_prepared`, 외형·자연스러움 사용자 확인 대기. 이미 승인된 제작/검증 범위는 수행했고 제품 통합·큰 기술 동작 추가는 아직 실행하지 않았다.

## 실행 도구·절차 이력 추가
| 이벤트 | 날짜(KST) | 담당 / 절차 | 범위·근거 |
|---|---|---|---|
| exec-002 | 2026-11-11 | codex / codex_scoped | 사용자 명시 샘플 범위의 제작·native 강제 제한·독립 FK/포즈 검토·720프레임 로컬 캡처/MP4·GIF·RML 원본 준비. 사용자 품질 승인은 pending, 운영 변경 없음 |


## 승인 캐릭터 외형 적용 재개 (2026-11-11)
- 사용자: “생성한 골격에 디자인한 캐릭터를 입혀서 표현해서 보여줘.” 기존16본/16관절 제한·15초 기본 동작에 승인 파란 도복 캐릭터 시트의 실제 측면 픽셀 외형을 입혀 표시하는 범위로 재개한다.
- 원본 디자인 시트/DB·task064 v1 프로젝트와 전달물은 보존한다. `reference/rig/task-064/skin-v2/` 및 M4 task064/skin-v2에 별도 생성한다. M4 기존 로컬 도구만 사용하며 유료 API·새 모델·클라우드·앱·DB·배포는 실행하지 않는다.
- 메인 소유: 원본 픽셀→외형 텍스처/메시 준비, M4 실행·기록·최종검증/전달. 기존 Worker 소유: skin-v2/generate_skin.py와 그 프로젝트RML 생성물만. 기존 profile/timeline/제약과 원본PNG 수정 금지.
- search-first 재사용: task055 원본manifest·task062 파츠 경로·task063 native Mesh/Skin/Tendon·task064 Drawing/검증/영상화 경로 대조. 이번은 Rive 자산/리깅 작업이며 UI 디자인 스킬·새 이미지 생성 API는 사용하지 않는다.

| 이벤트 | 날짜(KST) | 담당 / 절차 | 범위·근거 |
|---|---|---|---|
| exec-003 | 2026-11-11 | codex / codex_scoped | 승인 캐릭터를 기존 리그에 입혀 보여달라는 사용자 명시 요청으로 외형 적용 재개. 리그·모션·원본/운영을 보존하고 로컬 skin-v2 샘플 준비 |


## skin-v2 실제 결과·전달 (2026-11-11)
- 승인 파란 도복 시트 SHA `b53b8055020ae83c23e8926fcf42dc9dddb48ad05d13893bfc5933f34635ce8a`의 실제 측면 얼굴/머리/도복/벨트/손발 픽셀을 기존 골격에 적용했다. 숨겨진 몸통/벨트/바지 영역은 같은 승인 시트 정면/인접 천 픽셀로 보강했고 먼 팔다리는 측면 텍스처를 재사용한다.
- artboard당 Image/Mesh/Skin10개·vertices4,399/triangles7,980·Tendon14개. 소매/바지는 각각 두 본 가중치를 갖는 연속 메시다. frame0 global rest bind를 사용하며 골격16본/제약16개·동작별6,498키/전체 state machine/animation·profile/timeline/v1scene 해시 불변을 별도 검증했다.
- 독립 구조검사 PASS: 양쪽20meshes/8,798vertices/15,960triangles/28tendons, UV범위이탈0·퇴화삼각형0·가중치합오차0·rest행렬오차0. 원본 고정 골격/접지 검산의 동일 입력을 유지한다. 의학적/모든 BJJ/외형 승인을 뜻하지 않는다.
- review02 정지포즈4장 검토에서 원본 손에 가려진 바지 텍스처에 제3손 잔상이 남는 결함을 발견했다. 인접 원본 바지 천으로 보강한 뒤 review03 실제3장에서 메인·독립 검토자가 잔상 제거/새 큰 구멍·사지 분리 없음 확인. v2 final-01은 superseded로 보존하고 수정본 final-02를 전달한다.
- 최종 native verify 종료0/inspect문제0, Clean/Rig각360프레임/총720PNG/24.785초. 1600×1160·H264·24fps·15초·인코딩15.208초·전체decode오류0. 최종contact sheet 메인 실확인. 전체 영상 실시간 독립 재생/사용자 자연스러움 승인은 미확인이다.
- 다운로드6산출물 모두SHA일치, ZIP29파일무결성·README/7개핵심소스/최종독립검증영수증 바이트대조 PASS. 포장 중 README/검증JSON 최신성 불일치를 발견해 최신 정본으로 다시 포장하고 최종 대조했다. 영상 재인코딩은 하지 않았다.
- 로컬 폴더 `/Users/brownjeon/.codex/artifacts/bjj-t064/skin-v2/final-02/`: `designed-character-motions.mp4`(910,611bytes/SHA `22e0cbd1f017e6fd0f0a091bf068393f3219c70f0a0b930f34f99d8e13330a71`), `preview.gif`, `designed-character.png`, `character-rig.png`, `contact-sheet.png`, `designed-character-rml.zip`(2,343,076bytes/SHA `fd92661801b343eea76d61bd5285f7edb57289fd5761ea8cc51b3855a56e1775`), `delivery-receipt.json`.
- 실제 native RML SHA `4e69c0832ab97cc11ca9092c1c5f65d87a5319af7f57f0420e2a8d411ebdaf22`, 최종 skin-assets SHA `62d8a763a697209c62b780db0d080ae05506906f8ef94a4e11b34d85d4a98224`. RML 텍스트만으로 PNG 변경을 구분할 수 없으므로 최종 PNG/manifest·독립 입력 해시도 함께 보존한다.
- 검증 정본: `docs/verification/task-064-character-skin.json`; 원본 프로젝트/생성·준비·검증 스크립트: `reference/rig/task-064/skin-v2/`. ZIP은 부모 task064의 원래 generator/profile/timeline/검증용v1scene과 skin-v2 원본PNG·RML·PNG텍스처·검증 영수증을 함께 포함한다. native `.riv` export/Editor import 미검증.
- 최종 상태 `review / character_skin_prepared`, 사용자 외형/자연스러움 확인 대기. 고정 측면2D/기본동작 범위이며 원본/v1·DB를 보존했다. M4 기존 도구 재사용·추가 유료 API/모델설치/클라우드/앱/버전/배포/commit/push 없음.

| 이벤트 | 날짜(KST) | 담당 / 절차 | 범위·근거 |
|---|---|---|---|
| exec-004 | 2026-11-11 | codex / codex_scoped | 사용자 요청 캐릭터 디자인의 실제 픽셀 외형을 기존16본/16제약에 적용·제3손 잔상 수정·독립 불변성/메시검증/native720프레임·MP4/GIF/RML전달준비. 외형/자연스러움 사용자 승인 pending |


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
| exec-005 | 2026-11-11 | codex / codex_scoped | 사용자 샘플 확인 후 AI 영상 생성 폐기 명시 지시 수신·도입 미채택/작업 종료 기록. 기술 검사 이력 보존·추가 생성/앱/DB/배포 없음 |
