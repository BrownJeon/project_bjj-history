---
name: task-041-clip-video-muted-default
aliases: ["참고영상 음소거 기본", "영상 음소거로 재생", "clip video muted default"]
tags:
  - type/task
  - domain/frontend
related_tasks:
  - "[[task-036-pickmeup-shared-clip-detail]]"
  - "[[task-039-android-apk]]"
status: review
created: 2026-09-14
updated: 2026-09-14
---

# task-041 — 참고영상 영상은 음소거로 재생 시작

## 사용자 요청 (2026-09-14)
> "기술영상의 동영상의 경우 주로 음소거를 하고 보고있어서 기본적으로 영상을 재생할때 음소거로 재생하도록 설정해줘"

## 변경 (웹만, APK 재설치 불필요)
- `web/src/components/VideoPlayer.jsx` — 참고영상 상세 공용 플레이어([[task-036-pickmeup-shared-clip-detail]] 이후 참고영상·기술트리·픽미업·기술연구 노드·추천 섹션이 모두 `ClipDetailModal` → 이 컴포넌트).
  - 저장 영상 `<video … muted ref={muteVideo}>` — React 가 `muted` 를 DOM 속성으로 남기지 않는 문제 때문에 ref 에서 `defaultMuted`·`muted`·`muted` 속성을 함께 건다. **새 src 가 붙을 때 한 번만** 걸어서, 사용자가 컨트롤로 켠 소리는 그 영상을 보는 동안 유지된다.
  - YouTube iframe: `getYtEmbed(c.url, { mute: true })` → `&mute=1`.
- `web/src/utils/videoThumb.js` `getYtEmbed` 에 `mute` 옵션 추가 — 기존 호출(인자 1개, `{ jsapi }`) 결과는 그대로.
- 범위 밖(그대로): 영상분석 상세 `StudyVideoDetailPage`(YouTube jsapi), 수업 상세 `ClassDetailModal`, 체인 `ChainDetail` 영상. `ClipsPage.jsx:539/549` 는 쓰이지 않는 옛 코드(`_ClipDetail_REMOVED`).

## 검증 (Leader 직접 실행)
- `getYtEmbed` node 확인: mute → `?rel=0&mute=1`, 옵션 없음·jsapi/start 는 기존 URL 그대로.
- 운영(:3000, 배포 번들 `index-CyzrG7gc.js`) headless CDP **5/5** — user 2 T036-V1(영상 파일 픽스처), 기술 → 참고영상 → 상세:
  1. `<video>` 표시 2. 열리자마자 `muted`·`defaultMuted`·속성 모두 true 3. `play()` 후에도 음소거 4. 소리 켜면 같은 영상 동안 유지 5. 닫고 다시 열면 다시 음소거
- 스크립트 scratchpad `verify-video-muted.js`(Node 20 은 `--experimental-websocket` 필요). 픽스처 정리 `task-036-…/harness/cleanup.sh` → user 2 행 0, `CHECKSUM TABLE technique_mastery` 738744930 시작=끝.
- 🟡 사용자 실기기 확인 대기(앱 완전 종료 후 재실행).

## 실기기 1차 피드백 (14:19) — "앱에서는 음소거가 적용되지 않았어"
- 원인(코드 아님): **앱이 새 번들을 받지 않은 채 옛 화면을 계속 쓰고 있었다.** nginx `access.log` 실측 — 폰 WebView(`wv)` UA)는 12:37 에 옛 번들 `index-yMEX_KZk.js` 를 받은 뒤, 14:07·14:19 요청에 문서(index.html)·번들 요청이 없음. 새 번들 `index-CyzrG7gc.js`(14:11 배포)는 **어떤 클라이언트도 한 번도 받지 않음**. 14:19:11 `POST /api/clips/181/usage` + `video.mp4` 206 은 옛 JS 로 연 상세.
- 서버 쪽은 정상: `index.html` `Cache-Control: no-store`, 서빙 번들 = 새 번들.
- 조치: 앱을 최근 앱 목록에서 밀어 완전히 종료 후 재실행 → 재확인 요청.
- 진단 요령: 웹 변경이 폰에 반영됐는지는 `grep -a "assets/index-" /var/log/nginx/access.log | grep -a "wv)"` 로 폰이 새 해시를 받았는지 먼저 본다(access.log 는 vhost 구분이 없어 IP·UA·경로로 가린다).
