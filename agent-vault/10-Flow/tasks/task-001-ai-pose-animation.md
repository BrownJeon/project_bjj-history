---
task_id: task-001
title: AI 기술 시연 영상 — 포즈 체인 애니메이션
status: done
roles_involved: [leader, developer]
related_tasks: []
tags:
  - type/task
  - domain/ai-video
aliases:
  - pose-animation
  - 포즈애니메이션
  - ai영상생성
created: 2026-07-14
updated: 2026-07-14
---

## 목표 (Leader 작성)

샘플 영상(`ai영상생성_샘플.mp4`, 720×1280, 30fps)의 전반부처럼 **플랫 일러스트 캐릭터가 실제로 자세를 바꾸며** BJJ 기술을 시연하는 AI 생성 영상을 만든다.

기존 파이프라인(SD txt2img → SVD → Ken Burns)은 정적 이미지에 카메라 줌만 적용했기 때문에 캐릭터 자세 변화가 불가능했다. 이를 **멀티 키프레임 img2img 체인 + FFmpeg xfade** 방식으로 전환한다.

## 관련 과거 이력 요약

없음 (task-001, 첫 번째 이력서)

## Leader 지시사항

- **Developer**: 아래 두 파일을 수정해 포즈 체인 파이프라인을 구현한다.
  1. `home-m4-api/app/routes/image.py` — img2img 파라미터 추가
  2. `bjj-trainning/backend/src/services/chainAiVideoGenerator.js` — 포즈 애니메이션 파이프라인 전환

## Developer 기록

- [전 세션] 샘플 영상 분석 완료 — 720×1280, 30fps, 전반부 플랫 일러스트 애니메이션 / 후반부 실제 도장 영상
- [전 세션] SVD 근본 한계 파악: 정적 이미지에 미세 카메라 흔들림만 추가, 자세 변화 불가
- [전 세션] Opus 에이전트 기술 검토: Wan2.1 I2V 14B → M4 OOM 불가 / Kling API → ~$0.5/클립 / 멀티 키프레임 + RIFE → 채택
- [14:xx] `home-m4-api/app/routes/image.py` 수정
  - `ImageRequest`에 `seed: int = -1`, `init_image_b64: Optional[str] = None`, `strength: float = 0.65` 추가 (후방 호환)
  - `_generate_sync`에 img2img 분기 추가: `StableDiffusionImg2ImgPipeline`을 기존 파이프 컴포넌트로 조립 (추가 메모리 없음)
- [14:xx] `bjj-trainning/backend/src/services/chainAiVideoGenerator.js` 전면 개편
  - `STYLE_ANCHOR` / `STYLE_NEGATIVE` 상수 추가 (모든 SD 생성에 적용)
  - `generateStepPrompt` → `generatePoseSequence`: Claude가 6개 자세 JSON 배열 반환
  - `callGenerateImageWithInit`: img2img API 호출 함수 신규
  - `buildPoseAnimClip`: 앵커(txt2img) → 포즈 1~5(img2img 체인, strength=0.60, seed 고정) → FFmpeg xfade → 9초 클립
  - 메인 루프: SVD 블록 → 포즈 애니메이션으로 교체, Ken Burns 폴백 유지
- [14:xx] M4 API 서버 재시작 후 txt2img + img2img 응답 확인 — 사용자 "정상 확인" 완료

## 최종 요약 (사용자용)

**무엇을 했나**: BJJ 체인 영상의 AI 생성 방식을 기존 "정적 이미지 줌인(Ken Burns)"에서 "포즈 체인 애니메이션"으로 업그레이드했다.

**어떻게 동작하나**: 각 기술 스텝마다 Claude가 6개의 핵심 자세(시작 → 중간 → 완료)를 분석해 설명문을 생성하고, SD(dreamlike-anime) txt2img로 첫 번째 포즈 이미지를 만든 뒤 나머지 5개는 img2img 체이닝으로 생성해 스타일 일관성을 유지한다. FFmpeg xfade 전환으로 6개 이미지가 부드럽게 이어지는 9초 클립이 만들어진다.

**결과**: 플랫 일러스트 스타일(하늘색 단색 배경, 흰/파란 도복, 얼굴 없는 미니멀 캐릭터)의 애니메이션 영상. 스텝당 약 4분, 6단계 체인 기준 약 24분 소요(백그라운드 처리). Ken Burns 폴백과 색상 슬라이드 폴백은 기존 그대로 유지.

**변경 파일**: `home-m4-api/app/routes/image.py`, `bjj-trainning/backend/src/services/chainAiVideoGenerator.js`
