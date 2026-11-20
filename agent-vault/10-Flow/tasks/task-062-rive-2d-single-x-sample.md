---
task_id: task-062
title: Rive 2D 뼈대·관절 기반 싱글엑스 가드 샘플
status: done
stage: closed
user_quality_approval: rejected
roles_involved: [leader, worker, gym-master]
related_tasks: ["[[task-061-blender-single-x-sample]]", "[[task-060-rive-class-video-review]]", "[[task-055-character-concept-sheet]]"]
tags: [type/task, domain/video, domain/character, domain/adoption]
aliases: [Rive 2D 샘플, 2D 캐릭터 리깅, ADP-014-C01]
created: 2026-11-10
updated: 2026-11-11
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "사용자 AI 영상 생성 도입·개선 폐기 결정에 따른 기록 종료. 추가 생성·설치·제품 통합·운영 변경 없음"
  last_event_id: exec-004
waiting: none
initiative_decision: reject
closed_at: 2026-11-11
previous_stage_at_closure: sample_prepared
---
# Rive 2D 뼈대·관절 시연

> **현재 결론 (2026-11-11): 사용자 결정으로 AI 영상 생성 도입·개선을 폐기하고 `done / closed / waiting:none`으로 종료했다. 추가 품질 확인·시범·제품 통합 대기는 없다. 아래의 `pending`·`review`·`trial`은 당시 이력이며 이 종료 결정이 최신이다.**

## 목표와 승인 범위
- 사용자: “블랜더가 아닌 2D로 Rive뼈대와 관절을 구조화해서 움직임을 구성하면 어떨게 보여질지 샘플링해줘”.
- 기존 승인된 파란/흰 도복 캐릭터를 2D 파츠로 사용한다. 직전 확정한 싱글엑스 가드 진입·유지, 파랑 standing/흰 guard 역할과 추가 유료 API/자산 없이 로컬 제작하는 제약을 유지한다.
- 실제 Rive CLI·RootBone/Bone·타임라인을 우선 사용한다. 편집 프로젝트와 실제 Rive 렌더 미리보기를 구분한다. 도구·기능 차단 시 다른 엔진의 결과를 실제 Rive 제작으로 표시하지 않는다.
- 무료 공식 CLI의 사용자 전용 설치·텍스트 스키마 확인·로컬 빌드/캡처·영상화는 이번 범위다. Rive 로그인·계정 생성·결제·클라우드 업로드/게시·실제 앱/DB 변경·운영 배포는 범위 밖이다. CLI analytics를 비활성화하고 네트워크 스크립트 권한을 주지 않는다.
- 기존 원본 PNG는 보존하고 파생 파츠만 새 경로에 저장한다. 새로운 AI 이미지 생성은 요청하지 않았다.

## 관련 이력
- [[task-055-character-concept-sheet]]: 승인 캐릭터 2D 원본·갈색벨트·역할 배치 유지.
- [[task-060-rive-class-video-review]]: Rive 무료 로컬 작업·runtime·게시/서명과 AI 요금 구분 조사.
- [[task-061-blender-single-x-sample]]: Blender 3D 샘플 전달 완료. 이번 요청은 2D Rive 방식으로 시각 비교하는 새 샘플이며 기존 결과물을 덮어쓰지 않는다.

## 실행 도구·절차 이력
| 이벤트 ID | 시각(KST) | 사건 | 이전 → 현재 담당 / 현재 절차 | 범위·남은 일 | 근거 |
|---|---|---|---|---|---|
| exec-001 | 2026-11-10 17:32 | start | 없음 → codex / codex_scoped | 실제 Rive CLI/뼈대 스키마·2D원본 파츠·같은 동작 샘플 준비 | 현재 사용자 Rive2D 샘플링 요청 |
| exec-002 | 2026-11-10 17:52 | native_rive_review | codex → codex / codex_scoped | 공식CLI1.9.2/28파츠/실제Clean·Rig각6프레임생성·메인육안. IK해전환에따른각도급변24경고 발견·수정중 | review-01 verify/inspect/capture 및 PNG3직접확인 |
| exec-003 | 2026-11-10 18:07 | sample_prepared | codex → codex / codex_scoped | IK branch 연속성 보완·실제 Rive 576프레임/M4 비교 영상·GIF·RML 프로젝트 준비 완료. 사용자 품질 승인 전 | final-01 capture/delivery 영수증·검증 JSON·4단계 contact sheet 직접 확인 |

## 메인 실행·수신 기록
- 공식 installer 15,110bytes 전체를 읽어 설치범위/다운로드/체크섬/추출/부가실행을 확인했다. `RIVE_HOME`·`RIVE_INSTALL_DIR`를 사용자 전용 `.local/share/bjj-rive/tools`로 고정하고 공식 manifest의 1.9.2를 설치했다. installer가 출력하는 추가 skill 설치 명령은 실행하지 않았다.
- 모든CLI실행에 `RIVE_ANALYTICS=off`, `DO_NOT_TRACK=1`, `CI=1` 사용. 계정·로그인·게시/서명·cloud renderer·유료AI·추가skill설치 없음.
- 실제CLI의 RootBone/Bone/Image/ImageAsset/LinearAnimation 스키마와 생성 AGENTS를 읽었다. 해당 생성 지침은 API 참고와 로컬 verify/inspect/capture에만 적용하며 현재 사용자 승인범위를 넓히지 않는다.
- 최소2bone예제 verify0/PNG2장 실제view 확인: Bone 회전과 부모연결 동작을 확인했다. `--commands` 1프로세스 다중캡처도 실제확인했다.
- 승인 blue/white PNG2개 해시를 원본manifest와 대조한 뒤 M4에 복사, 기존Pillow로 원본파츠28개를 분리·관절방향을+X로정규화했다. 얼굴·도복은 실제원본그림이며새AI이미지생성없음. 최초white배경 제거가옷주름을훼손하는문제를atlas육안에서발견, 정확색매칭으로수정후확인했다.
- Worker가 네이티브 RootBone10+Bone18/Artboard·Image28/Artboard, 24fps288프레임 LinearAnimation/StateMachine을작성했다. 초기AnimationState.name오류는실제schema의stateName으로수정했다.
- review-01 실제Rive verify오류0, Clean/Rig각6PNG·총12장2.859초. 메인이Clean시작/유지와Rig유지PNG3장을직접확인했다. 손/무릎 IK도달오차계산0px는영상품질검증과구분했다.
- 실제inspect에서white thigh/forearm 등의인접프레임2rad이상급변24경고를발견했다. pole최근접IK해를매프레임독립선택하며생긴해전환가능성이있어 Worker에게연속branch보존/trajectory검산을배정했다. hold키로경고만덮지않는다.
- Impeccable SKILL.md를참고로읽었으나이번은앱UI설계/변경이아닌2D자산리깅샘플이므로UI런처/훅/엔진은실행하지않았다. 원본외형·실제Rive동작/육안확인범위만수행한다.

## 역할별 범위
- 메인: 공식 installer/무료 로컬 경계·원본 파츠·M4 설치/캡처·실제 결과/한계 검증·문서.
- Worker: 지정된 RML 프로젝트/뼈대/타임라인 생성 스크립트만. 원본 자산·앱·DB 수정 금지.
- 관장: 기존 싱글엑스 역할/동작 사양과 실제 프레임의 큰 오류 확인만.

## 최종 결과와 검증 (2026-11-10)
- Worker가 signed-area 기반 IK branch를 고정하고 발의 이동을 골반 상대 극좌표 경로로 수정했다. 실제 RML 키를 메인이 독립 파싱한 결과 최대 인접 회전 변화는 0.0560663rad(3.212°)/프레임이다. `review-02` 및 최종 `inspect`의 문제 배열은 비었고 `verify` 오류·경고도 0이다. 이는 회전 연속성 확인이며 그립·접촉이나 기술 정확도 통과를 뜻하지 않는다.
- M4 Pro/공식 Rive CLI 1.9.2로 `Clean`·`Rig` 각 288프레임을 실제 렌더했다. 아트보드마다 RootBone 10 + Bone 18 = 28뼈대와 원본 파생 Image 28개다. 캡처·검증 32.153초, 비교 합성·MP4/GIF 인코딩 14.285초. 기존 Pillow는 두 화면 배치·자막에만, 기존 FFmpeg는 인코딩에만 사용했다.
- 최종 영상: 12초·24fps·288프레임·1600×1000·H.264/yuv420p, 전체 decode 오류 0. 메인은 최종 4단계 contact sheet와 원본 Clean/Rig 프레임을 확인했다. 원본 PNG 2개 보존 해시, 파츠 28개 해시, ZIP의 RML/manifest와 로컬 소스 일치, 전달 파일 5개 크기·SHA256 일치를 확인했다.
- 원본 파츠 부착형(종이인형 방식)이다. weighted mesh/옷감 변형은 구현하지 않았다. 관절 절단면·앞뒤 가림·입체 회전·정밀 손잡기/발 접촉이 거칠다. 교육용 정확도·사용자 품질 승인·앱 내 재생/통합은 확인하지 않았다.
- 공식 무료 CLI의 로컬 검증/캡처만 사용했다. 로그인·계정 생성·결제·유료 생성 API·Rive 클라우드 자산 업로드/게시·앱/DB 수정·운영 재시작/배포 없음. 앱 릴리스를 만들지 않았으므로 앱 버전 변경 없음.
- ZIP에는 편집 가능한 `scene.rml`·`rive.yaml`·manifest·PNG 28개가 있다. 게시/서명된 `.riv` 또는 `.rev` 파일은 포함하지 않는다. 실제 Rive 엔진 캡처 결과와 로컬 소스 프로젝트를 구분한다.

## 전달 산출물
- 로컬 폴더: `/Users/brownjeon/.codex/artifacts/bjj-t062/final-01/`.
- `rive-2d-single-x-comparison.mp4`: 1,046,015bytes, SHA256 `a3bab632734343003c919cb76b6111a22fbf986676e62c0a8d99da311edf9e64`.
- `preview.gif`: 2,175,217bytes, SHA256 `cd8c67a55f49033c7c8197d65aa105a97c6fe314a6262dc8e7f1d567b418d9b4`.
- `rive-2d-project.zip`: 596,253bytes, SHA256 `61a90ef639da5a0eb1bf748e7edc0a338b23043f479f79b2199e7c650f6a56c9`.
- `poster.png`·`contact-sheet.png` 및 capture/delivery/verify/inspect 영수증도 같은 폴더에 보존했다.
- 정본 코드/자산: `reference/rive/task-062/`. 결과 검증: `docs/verification/task-062-rive-2d-sample.json`.
- M4 원자료: `/Users/brownjeon/.local/share/bjj-rive/task-062/final-01/`.
- 도입건 ADP-014-C01의 무료 로컬 샘플만 완료했다. 정식 채택·제품 적용 판단은 하지 않았다.

## 후속 사용자 품질 피드백
- 2026-11-10 사용자가 “움직임이 더 부자연스러워졌는데”라고 피드백하고 업로드 트라이포드 스윕 사진·설명 기반 재제작을 요청했다. 본 결과를 품질 승인으로 처리하지 않는다. 기존 산출물은 보존하고 새 범위는 [[task-063-tripod-motion-remake]]에서 수행한다.


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
| exec-004 | 2026-11-11 | codex / codex_scoped | 사용자 샘플 확인 후 AI 영상 생성 폐기 명시 지시 수신·도입 미채택/작업 종료 기록. 기술 검사 이력 보존·추가 생성/앱/DB/배포 없음 |
