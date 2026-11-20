# 고정 리그 두 캐릭터 · 트라이포드 스윕 모션 샘플

사용자 요청: 흰 도복에도 같은 골격/관절 제한을 적용하고 업로드 사진을 참고한 두 캐릭터 트라이포드 샘플을 M4에서 추가 과금 없이 제작. 사용자가 별도 질문에 “동작용 범위 추가 (권장)”을 승인해 공통 트라이포드 시연 프로파일을 추가했습니다.

## 샘플
- 12초24fps. 세 접촉 만들기 → 자세 압축 → 골반 밀기와 발목/훅 당기기 → 뒤로 넘어짐 → 접촉 회수와 상체 따라오기. 완전한 일어서기/패스는 포함하지 않습니다.
- 두 캐릭터에 동일한 16본 부모·자식 계층/고정 길이와 16 native RotationConstraint를 적용합니다(artboard당32본/32제약). RootBone pelvis local rotation0, 전체 몸의 위치/방향은 별도 부모 Node로 표현하며 white mirror=-1입니다.
- 관절 범위는 `tripod-profile.json`의 공통 시연 설정입니다. 의학적 정상 가동범위 인증이나 모든 주짓수 동작을 정확히 생성하는 시스템은 아닙니다.
- 파란 도복/흰 도복 시트의 실제 2D 스킨을 재사용합니다. 감싼 손은 업로드 사진의 실제 그립을 별도 고정 손 포즈로 추출해 hand_near 본에 연결했습니다. 흰 바짓단만8px 피팅해 맨발목을 드러냈으며, 본과 발 피부는 바꾸지 않았습니다.
- 이미지/얼굴/손발을 매 프레임 AI로 다시 생성하지 않습니다. 소매/바지는 연속 메시, 나머지는 해당 본에 연결된 피부/의복 파츠입니다.
- 원본 시트·사진·task064·흰 baseline은 보존했습니다. 복원한 숨은 천, 먼 팔다리 재사용, 측면 가림은 제작상 추정입니다.

## 영상 구성과 검증
Clean 영상과 Rig 골격 영상은 같은 native 프레임입니다. ① 발목 제어 ② 골반 밀기 ③ 반대 다리 훅 표시·한국어 자막·고정 crop·루프 경계의 짧은 fade만 기존 M4 Pillow/FFmpeg에서 합성합니다. 골반/훅은5.25초 이후 풀고 발목 제어는 유지합니다.

독립 FK/RML 검증은 32본의 고정 길이·부모·관절 범위·미러 굽힘 방향·2305표본의 접촉·Rigid alpha 손발/머리 바닥 침범·RML 본/제약/키 일치를 검사했습니다. Native 반사 부모의30..210도 제한에서230도 요청이210도 경계 자세와 같고 무제한230도와 다른지, 범위 안190도가190도 기준과 같은지 실제 픽셀 대조로 확인했습니다.

의복 정점은 양자화 LBS의 역변환으로 바닥에 닿도록 보정했습니다. 뼈·UV·weights·얼굴·손발을 바꾸거나 매트를 위에 덮어 숨기지 않습니다. 생성기의 미실행 플래그와 별도 actual native 검증은 구분합니다. 선형 키 사이 접촉·정지포즈/시퀀스 검토·인코딩 검사를 물리 시뮬레이션 또는 사용자 자연스러움 승인으로 표시하지 않습니다.

먼 다리 훅의 정확한 발등 접촉은 고정 측면에서 일부 가려집니다. 골격 영상과3번 표시를 함께 참고하세요. 손가락 개별 관절/3D 충돌/동적 균형·교육용 완성 정확도는 검증 범위 밖이며 사용자 품질 승인은 대기입니다.

## RML 원본 실행
ZIP의 task-064/task-065 상대 폴더 구조를 유지합니다. 기존 Rive CLI1.9.2와 Python을 사용합니다.

```sh
rive task-065/project --artboard=Clean --viewport=1600x950
rive task-065/project --artboard=Rig --viewport=1600x950
python3 task-065/plan_tripod.py
python3 task-065/generate_dual_rive.py --plan /ABSOLUTE/task-065/tripod-plan.json --output /ABSOLUTE/task-065/project
python3 task-065/verify_tripod.py --output /ABSOLUTE/task-065/verification-result.json
```

`plan_tripod.py`를 새 위치에서 실행하면 현재 폴더에 맞는 absolute asset/bind 경로를 다시 씁니다. 검산 입력과 바이트가 같은 로컬 계획은 `tripod-plan.json`, 실제 M4 실행에 사용한 경로만 다른 사본은 `tripod-plan.m4.json`으로 함께 전달합니다. 후자는 동일 pose/contact 수치를 가지며 경로 문자열만 다릅니다. `project/`에는 독립 재생 가능한 RML/YAML/20PNG가 있습니다. `.riv` 바이너리 또는 Rive Editor import는 검증하지 않았습니다.

M4 준비/캡처/인코딩 보조 스크립트는 기존 M4 설치 경로에 맞춰져 있습니다. 새 모델·도구 설치, 유료 API/공식 유료 export, Rive 로그인/클라우드 게시/사진 외부 업로드, 앱/DB/버전/배포 변경은 수행하지 않았습니다.

## 기술 원리 참고
사용자 사진과 Stephan Kesting의 네 단계(골반의 발/한 발목 제어/반대 다리 발등 훅/밀고 당기기)를 대조했습니다. 공개 페이지 읽기만 했으며 외부 영상은 다운로드하거나 재사용하지 않았습니다.
https://www.grapplearts.com/the-bjj-self-defense-experiment/ (Tripod Sweep 절,2026-11-11 확인)


## CLI 검사 경고 기록
최종 native verify는 종료0이며 inspect는 error0/warning56(`interpolated-step`)입니다. 의복 정점의 촘촘한 선형 키가 착지 후 hold 값에 도달할 때 CLI가 “계단형 변화가 의도라면 hold 키를 쓰라”고 안내합니다. 이 보정은 선형으로 매끄럽게 이어지는 것이 의도이므로 hold로 바꾸지 않았습니다. 이를 문제0 또는 경고0으로 보고하지 않습니다. 이 경고는 본/관절 제한/이미지 복제 판정과 구분하며 실제 시각 검토와 디코딩 결과를 함께 제공합니다.
