BJJ 기술 설명용 캐릭터 세트 01
제작일: 2026-11-08
실행 도구: 기본 내장 imagegen

1. blue-gi-brown-belt.png
   기존 고죠 사토루 얼굴 유형 / 흰 머리·푸른 눈 / 파란 도복 / 브라운 벨트
   정면·측면·후면 3방향 전신 시트

2. white-gi-brown-belt.png
   첨부 CLAMP X 카무이 얼굴 유형 / 검은 머리·갈색 눈 / 흰 도복 / 브라운 벨트
   정면·측면·후면 3방향 전신 시트

위 두 이미지를 1세트로 사용한다. 각 파일은 캐릭터별로 독립 저장되었다.
대응하는 .prompt.txt 파일은 실제 생성 프롬프트 원문이다.
공통 체형·시트 배치·표현 스타일을 기준으로 생성한 2D 컨셉 시트이며,
블렌더 3D 모델·공통 뼈대·스파링 애니메이션은 아직 제작하지 않았다.
이전 v1 비교 시트는 상위 디렉터리에 이력으로 보존한다.

기술 자세 샘플:
samples/single-x-guard-v1.png — 첨부 싱글엑스 가드 자세를 두 캐릭터에 적용한 2D 샘플.
samples/single-x-guard-v1.prompt.txt — 실제 생성 프롬프트.

캐릭터 검증: 2026-11-08 사용자 검증 완료 지시 수신.
approved-base-manifest.json — 승인 원본 6파일의 목록·크기·해시와 사용자 검증 기록.
DB 등록: 2026-11-09 B안 원본 BLOB 등록·검증 완료. bjj DB의 신규3테이블에 베이스8, 스킨16/17(v1), 자산11~16(6개).
실제 구현·DB 적용은 사용자 최신 명시 지시로 Codex가 직접 수행했다. 6개 DB/파일복원 bytes·SHA256 일치, 동일 manifest 재실행 추가쓰기0.
작업 범위/경과: docs/handovers/task-055-character-registry.md. 결과: docs/verification/task-055-character-registry.json.
단위14·실DB13·독립읽기 검증 통과. 기존 NAS 원본과 과거파일 보존. 미커밋·미push·앱 미배포.
