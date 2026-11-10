# 니컷 앱 배경색 샘플

- 사용자 요청: 첫번째 이미지의 배경을 앱 배경색으로 변경해1장만 검토.
- [이미지](knee-cut-app-bg.png) · [실제 편집 프롬프트](knee-cut-app-bg.prompt.txt) · [메타정보](manifest.json)
- 입력: review-01/knee-cut.png, 캐릭터·자세·구도 유지.
- 배경색 기준: web/src/styles/tokens.css의 --bg #0C0D12.
- 도구: 내장 image_gen 편집, 불투명 PNG1254×1254. CLI/API키 경로 미사용.
- 생성형 이미지의 미세한 배경색 편차와 접지 그림자는 존재하며 측정RGB를manifest에 보관했다.
- 기존 오렌지 니컷·암바·백컨트롤 원본은 보존. 암바/백컨트롤은 이번에 편집하지 않았다.
- 상태: 사용자 배경 샘플 검토 대기. 전체생성·앱반영·DB·배포·앱버전변경 없음.
