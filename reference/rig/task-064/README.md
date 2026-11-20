# 고정 골격·관절 제한 캐릭터 기본 동작 샘플

사용자 요청(2026-11-11)에 따라 기존 파란 도복·흰 머리·갈색 벨트 특징으로 만든 **리깅용 2D 벡터 캐릭터 1명**입니다. 원본 일러스트의 완성 외형을 그대로 복원한 자산은 아닙니다.

## 포함 내용
- `project/scene.rml`, `rive.yaml`: 실제 Rive CLI용 Clean/Rig artboards와 Autoplay.
- `rig_profile.json`: 부모·자식 관계, 고정 본 길이, 로컬 관절 제한과 발 접촉 기준.
- `generate_character.py`: 지속되는 벡터 도형/16본/16 native RotationConstraint와 기본 모션 생성기.
- `project/timeline.json`, `model-receipt.json`: 24fps/15초 모션 계획과 생성기 보고.
- `verify_kinematics.py`, `kinematics-verification.json`: 별도 FK 검증 및 위반 주입 결과.
- `test_native_clamp.py`, `native-clamp-proof.json`: Rive 엔진에 범위 초과 각도를 요청한 실제 클램프 검증.

## 재생과 재생성
이 샘플은 기존 M4의 Rive CLI 1.9.2로 만들었습니다. 계정 로그인·클라우드 게시·유료 export 없이 로컬 native screenshot → 기존 FFmpeg로 영상화했습니다. 배포용 `.riv` 바이너리나 Rive Editor 가져오기 파일로 검증한 결과는 아닙니다.

```sh
rive project --artboard=Clean --viewport=900x900
rive project --artboard=Rig --viewport=900x900
python3 generate_character.py
python3 verify_kinematics.py --profile rig_profile.json --timeline project/timeline.json --model-receipt project/model-receipt.json
```

생성기는 Python 표준 라이브러리를 사용합니다. M4 실행/캡처 스크립트의 환경 경로는 해당 M4 설치에 맞춰져 있습니다. 위 재생 명령은 Rive CLI가 PATH에 있고 해당 버전의 로컬 도구가 이미 준비됐다는 전제입니다.

## 동작
0–1초 중립, 1–4초 팔꿈치 굽히기, 4.5–7.5초 한쪽 무릎 굽히기, 8–13초 얕은 스쿼트, 13–15초 중립 복귀. 왼쪽은 캐릭터, 오른쪽은 같은 캐릭터에 뼈대·관절을 표시한 화면입니다. 팔꿈치/무릎은 정해진 굽힘 방향을 유지하고 스쿼트에서는 두 발 접촉을 풀지 않습니다.

## 확인한 범위와 한계
16본 길이·스케일·계층 불변, 설정 각도 제한, 361 원키/2,520 보간 자세와 접지 연속 오차 상한 0.00882px(허용오차 0.05px)를 검산했습니다. Rive native 회전 제한은 범위 초과 요청이 경계 각도와 픽셀상 동일하고 무제한 결과와 다른지 별도로 확인했습니다. 원키프레임의 접지 오차가 수치상 거의 0이라는 사실을 연속시간 완전 고정으로 과장하지 않습니다.

관절 범위는 이번 캐릭터의 보수적인 시연 프로파일입니다. 의학적 정상 가동범위, 몸 전체의 물리 균형/충돌 해결 또는 모든 주짓수 동작의 정확성을 보장하지 않습니다. 현재는 고정 측면·기본 동작을 검토하는 샘플입니다. 두 사람의 그립/접촉·큰 회전·자동 자연어→모션 생성은 구현하지 않았습니다. 사용자 외형·모션 품질 승인은 별도입니다.
