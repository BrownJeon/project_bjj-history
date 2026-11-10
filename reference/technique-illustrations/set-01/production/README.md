# 기술 이미지 set-01

2026-11-11 기준 171종 이미지로 기존 개인 기술 172행을 연결한다. 니어네이키트 쵸크와 리어네이키드 초크는 사용자가 같은 기술로 확정해 이미지 한 장을 공유한다. 개인 기술 DB행은 병합하지 않는다.

- 생성: 내장 `image_gen`, 승인된 두 성인 캐릭터와 동일한 2.5D 스타일.
- 표시: 투명 WebP를 차콜 `#15171E`에 합성. 목록 48px, 상세 최대 224px. 목록 높이는 이미지가 없던 동일 내용의 높이를 보존한다.
- `raw/`: 수정 전후 PNG 원본. `prompts/`: 각 버전에 실제 사용한 프롬프트. `candidates/`: 검토 전 최적화본. 기존 버전을 덮어쓰지 않는다.
- `manifest.json`: 원본·프롬프트·후보·승인본 SHA와 연결 이름. 공유 행의 준비 여부는 연결 대상의 승인본으로 판정한다.
- 앱 자산: `web/public/technique-illustrations/set-01/`의 승인 WebP 171개. 앱 연결표는 `web/src/data/techniqueIllustrations.json`이다.

관장 직접 PNG 검토 및 버전별 수정 결과는 `docs/handovers/task-058-image-review-*.json`, 최종 실제 앱 검증은 `docs/handovers/task-058-final-verification.json`에 보관한다. 대표 정지 자세 검토이며 숨은 손가락 그립 깊이나 실제 피니시 성공을 검증한 결과는 아니다.

전체 이름 172행 연결·자산 해시·HTTP 171건·360/390/412px의 516개 목록 비교와 상세/이동/닫기를 로컬 실제 앱에서 확인했다. 운영 배포 및 APK 전달은 이 검증에 포함되지 않는다.

도구 사용법은 `tools/technique-image-assets/README.md`를 따른다. 실제 승격에는 검토한 원본 PNG의 기대 SHA를 함께 전달한다. 공개 자세 참고 프레임은 로컬 연구 자료이며 이 폴더나 앱 공개 자산으로 복사하지 않는다.
