---
name: task-041-clip-video-muted-default
aliases: ["참고영상 음소거 기본", "영상 음소거로 재생", "clip video muted default"]
tags:
  - type/task
  - domain/frontend
related_tasks:
  - "[[task-036-pickmeup-shared-clip-detail]]"
  - "[[task-039-android-apk]]"
status: done
created: 2026-09-14
updated: 2026-09-15
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

## 2026-09-15 소실·복구 (developer)

### 무엇이 날아갔나 — **소스만**, 운영은 멀쩡했다
task-042 작업 중 **커밋되지 않은 채 남아 있던 이 task 의 두 파일 변경이 `git reset` 으로 소실**됐다.

```
reflog  74192c7 HEAD@{0}: reset: moving to origin/main      ← 여기서 날아감
        74192c7 HEAD@{1}: commit: …토글 탭 위치 표시 점 2개 (task-042)
```
task-042 를 커밋한 직후 `origin/main` 으로 reset 이 돌면서, 아직 커밋 안 된 task-041 의
`VideoPlayer.jsx`·`videoThumb.js` 변경이 함께 지워졌다. 두 파일의 마지막 커밋은 `ca0c862`(task-039)로
**task-041 은 한 번도 커밋된 적이 없었다.** 백업(`~/.node-local/bjj-backup/`)에도 없었다.

🔴 **다만 "운영에서도 음소거가 되돌아갔다"는 최초 진단은 틀렸다.** 실측:
- 서빙 번들 `index-C66v7MFj.js`(9/15 12:50, task-042 배포분) 안에 음소거 로직이 **그대로 살아 있었다** —
  `h.dataset.bjjMuted===h.getAttribute("src")||(h.defaultMuted=!0,h.muted=!0,h.setAttribute("muted",""),…)`, `"mute","1"`.
- 빌드가 ext4 미러 `~/.node-local/bjj-web/work/src` 에서 돌아가는데, 그 미러에는 reset 전 소스가 남아 있었기 때문이다.
- 즉 **사용자는 계속 음소거로 보고 있었고, 잃은 것은 git/NFS 의 소스뿐**이었다.

### 무엇으로 복구했나 — 배포 번들의 **소스맵**에서 원본 그대로
재작성(reimplement)하지 않았다. 배포된 `index-C66v7MFj.js.map` 의 `sourcesContent` 에
**원본 두 파일이 통째로 들어 있어** 그대로 꺼내 복원했다.

**복구 증명**: 복원한 소스로 다시 빌드하니 배포 중인 번들과 **바이트 단위로 동일** —
해시도 파일명도 같다(`index-C66v7MFj.js`, md5 `e29cc18a032d45aefe551011fca304bf`).
소스가 원본과 한 글자도 다르지 않다는 뜻이다. 배포물 변화 0 이라 `pm2 restart` 도 불필요했다.

### 이력서 기록과 실제 코드가 달랐던 점 (기록 정정)
| 항목 | 이 문서의 기존 서술 | 실제 원본 코드 |
|------|------------------|--------------|
| 재적용 방지 방식 | "새 src 가 붙을 때 한 번만 건다" (방법 미기재) | `el.dataset.bjjMuted === el.getAttribute('src')` **가드**로 같은 src 면 조기 return. ref 콜백 자체는 매 렌더 재부착된다 |
| JSX `muted` | 언급 없음 | `<video … muted ref={muteVideo}>` — JSX 속성도 **함께** 걸려 있다 |
| 배포 번들 | `index-CyzrG7gc.js` | 현재 서빙은 `index-C66v7MFj.js` (task-042 배포분이 task-041 을 이미 포함) |
| `ClipsPage` 죽은 코드 줄번호 | `539/549` | 현재 `549/552` (`_ClipDetail_REMOVED` 는 `:440`) — 여전히 죽은 코드, 범위 밖 |

`dataset` 가드가 **핵심**이다. 이게 없으면 리렌더마다 음소거가 다시 걸려 사용자가 소리를 켤 수 없다.

### 검증 (developer 재실행)
- **`getYtEmbed` 회귀 0 증명**: `ca0c862` 원본과 복원본을 Node 에서 같이 import 해 **기존 호출 형태 42건**
  (인자1개 · `{}` · `{jsapi}` · `{start}` · `{start,jsapi}` · `start:0` · `start:12.7` × URL 6종) 출력 URL 대조 →
  **불일치 0건**. `mute` 를 넘기지 않으면 파라미터가 붙지 않으므로 기존 URL 이 바뀔 수 없다.
  신규: `{mute:true}` → `?rel=0&mute=1`.
- **헤드리스 CDP 6/6 PASS** (`google-chrome --headless=new` + CDP 직결, Node 20 은 `--experimental-websocket`).
  실제 `VideoPlayer.jsx` 컴포넌트를 `UIProvider` 로 감싼 격리 하네스에 마운트 —
  **운영 DB 를 건드리지 않았다**(상세를 열면 `POST /api/clips/:id/usage` 가 기록되므로 의도적으로 회피, 영상 파일만 :3000 에서 GET).
  1. 열자마자 `muted`·`defaultMuted`·`muted` 속성 모두 true
  2. `play()` 후에도 음소거 유지(재생 확인 t=0.56s)
  3. 🔴 **소리 켠 뒤 리렌더 4회에도 `muted=false` 유지** — 회귀 지점 통과
  4. 소리 켠 채 계속 재생해도 유지
  5. 다른 영상(src 변경)으로 바꾸면 다시 음소거
  6. YouTube iframe src = `…?rel=0&mute=1`
- **역검증(negative control)**: `dataset` 가드를 뺀 회귀판을 같은 하네스에 넣으니 **③④ 가 정확히 FAIL**
  (소리 켠 뒤 리렌더하면 `muted=true` 로 되꺼짐) → 테스트 ③ 이 공회전이 아님을 증명.

### 커밋
이번엔 **커밋했다**(소실 재발 방지). 서빙 번들 `index-C66v7MFj.js` (변화 없음).
