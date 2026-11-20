# 승인 디자인 캐릭터 · 고정 리그 스킨 샘플

사용자 추가 요청(2026-11-11): “생성한 골격에 디자인한 캐릭터를 입혀서 표현해서 보여줘.”

기존 task064 16본/16 native RotationConstraint·관절 범위·15초 기본 동작을 유지하며, 승인 `blue-gi-brown-belt.png` 측면 그림의 얼굴/흰 머리/파란 도복/갈색 벨트/맨손·맨발 픽셀 외형을 입혔습니다. 새 이미지를 프레임마다 생성하거나 생성형 영상 모델을 실행하지 않습니다.

## 구조
- 같은 Clean/Rig artboards: 왼쪽은 디자인을 입힌 캐릭터, 오른쪽은 동일 동작의 뼈대·관절 표시.
- 10개 PNG 외형 레이어·4,399 vertices·7,980 triangles(artboard당). 소매와 바지는 각각 상/하 두 본에 연결된 하나의 연속 메시이며 나머지는 해당 본에 연결합니다.
- 계층형 본의 frame0 **global rest** 행렬로 Tendon을 bind합니다. Image/Mesh/Skin은 전역 기준/identity transform을 사용합니다.
- 외형 중 숨겨진 몸통/벨트는 같은 승인 시트 정면 픽셀로, 손에 가려진 바지는 인접 바지 천으로 보강했습니다. 먼 팔다리는 측면 텍스처를 재사용합니다. 원본 파일/DB/v1 샘플은 덮어쓰지 않았습니다.

## 동작과 범위
팔꿈치 굽히기 → 한쪽 무릎 굽히기 → 얕은 스쿼트 → 중립 복귀. 15초24fps입니다. 고정 측면용 2D 스킨 샘플이며, 가려진 면/다른 시점의 완전한 캐릭터나 3D 모델이 아닙니다. 관절 범위는 기본 동작 시연용 프로파일입니다. 두 사람 그립·충돌·전체 동적 균형·모든 주짓수 동작·자연어 자동 모션 생성은 이번 결과에 포함하지 않습니다.

## 실행
ZIP의 `task-064` 폴더 구조를 유지합니다. 기존 Rive CLI1.9.2에서:

```sh
rive skin-v2/project --artboard=Clean --viewport=900x900
rive skin-v2/project --artboard=Rig --viewport=900x900
python3 skin-v2/generate_skin.py
python3 skin-v2/verify_skin.py --output skin-v2/verification-result.json
```

생성기는 부모 폴더의 기존 `generate_character.py`, `rig_profile.json`, `project/timeline.json`을 읽습니다. 준비/캡처/인코딩 스크립트는 기존 M4 설치 경로에 맞춰져 있습니다. 새 Rive 계정/로그인·클라우드 업로드·공식 유료 export·유료 API/모델 설치를 사용하지 않았습니다. `.riv` 바이너리 또는 Rive Editor import는 검증하지 않았으며, RML native 프로젝트를 전달합니다.

## 품질 확인
실제 Rive 렌더·verify/inspect·독립 본/제약/키 불변성 검사·정지포즈 확인·전체 영상 디코딩을 각각 구분해 기록합니다. 초기 스킨에서 원본 손 잔상이 바지에 남는 결함을 발견해 제거했고, 수정본을 별도로 렌더했습니다. 사용자 외형/자연스러움 승인은 대기입니다.
