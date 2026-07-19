---
project: bjj-trainning
updated: 2026-07-14
tags:
  - type/context
---
# 현재 상태

## 지금 상태

**운영 중** — pm2 `bjj`, 포트 3000 (backend가 `/api/*` + SPA 서빙)

**AI 영상 생성 파이프라인 v2 적용 완료 (2026-07-14)**
- 기존: SD txt2img → Ken Burns (정적 줌인)
- 현재: SD txt2img(앵커) + img2img 체인(포즈 1~5) → FFmpeg xfade → 9초 포즈 애니메이션
- 폴백: Ken Burns → 색상 슬라이드 (기존 유지)
- M4 API `/v1/image/generate`에 `seed`, `init_image_b64`, `strength` 파라미터 추가됨

**M4 API 서버**: `http://192.168.219.163:8001` — nohup 수동 실행 중 (재부팅 시 재실행 필요)
- 모델: `dreamlike-art/dreamlike-anime-1.0` ✅
- SVD: 캐시 있음, 현재 미사용 (포즈 애니메이션으로 대체)

## 다음 할 일

1. **영상 품질 검증** — 브라우저에서 실제 체인 영상 생성 후 결과물 확인
   - 자세 전환 자연스러운지 (xfade 0.5초)
   - 플랫 일러스트 스타일 유지되는지
   - strength 튜닝 필요 시: 0.55~0.65 범위 조정

2. **M4 launchd 영구 기동 설정** — 현재 nohup 수동 실행, 재부팅 시 끊김
   ```bash
   # M4에서 재기동 시 임시 명령
   cd ~/NFS/homes/brownjeon/project/home-m4-api
   nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001 > logs/stdout.log 2> logs/stderr.log &
   ```

3. **백로그**: AnalysisPage 구현 (월별 훈련량·승률·약점 통계)

## 열린 결정

- img2img `strength=0.60` 적정값 여부 — 실제 영상 보고 조정 필요
- SVD 엔드포인트 유지 여부 (현재 미사용 상태)
