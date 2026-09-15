---
id: task-042
title: 하단 토글 탭 — 위치 표시 점 2개(TheRoute 방식)로 교체 + 코치 알림 점 분리
status: done
created: 2026-09-15
tags:
  - type/task
  - domain/navigation
  - domain/ui
related_tasks:
  - task-023-toggle-nav-generalization
  - task-040-toggle-tab-front-first
  - task-030-gym-master-chat
aliases:
  - 토글탭 인디케이터
  - 하단바 점
---

# task-042 — 하단 토글 탭 위치 표시 점

## 사용자 요청 (원문)

> 하단바에 메뉴가 두개이면 주황색 점으로 표기하는것같은데 이것보다 사진과같이
> 클라이밍프로젝트에서 사용하는 방식인 메뉴가 바뀌면 표기되는 점을 바뀌도록 변경해줘

첨부 스크린샷은 **TheRoute(클라이밍, climb.미라클펭귄.com)** 이고 **그쪽이 목표 형태**다.
바꿀 대상은 **BJJ**.

스크린샷에서 확인되는 TheRoute 동작: 하단 탭 라벨(`캘린더`/`문제`) **아래**에 작은 점 2개가
가로로 놓이고, 지금 보고 있는 쪽 점만 진하고 나머지는 흐리다.
`/calendar` 일 때 **왼쪽**, `/records` 일 때 **오른쪽**이 진하다.

## 목표

토글 탭의 점이 "이 탭은 토글이다"만 말하는 상태 → **"지금 앞/뒤 중 어디에 있다"**를 말하도록.

---

## Leader 실측 (2026-09-15, 전부 코드에서 확인함)

### BJJ 현재 구현
`web/src/components/ToggleTab.jsx:41-52`
- 아이콘을 `<span style={{position:'relative', display:'inline-flex'}}>` 로 감싸고
  그 안에 `position:absolute; top:-2; right:-2; width:6; height:6; borderRadius:'50%'` 점 **1개**.
- 이 점은 `active` 여부와 **무관하게 항상** 렌더된다 → 위치 정보 없음. 이게 사용자 불만.
- 색은 `dotColor` prop (기본 `var(--amber)`).

### 🔴 요청에 없던 제약 — 점 색이 두 가지 의미를 겸하고 있다
`web/src/components/Layout.jsx:86`
```
dotColor={t.coachDot && unseenReport ? 'var(--accent-lt)' : 'var(--amber)'}
```
- 이 점은 **새 코치 리포트 알림**(초록)도 겸한다. 판정은 `utils/toggleNav.js` 의
  `hasUnseenReport()` · `COACH_SEEN_KEY`(`:172-187`), 워터마크 기록은 `Layout.jsx:58-62`.
- ACTIVE.md 의 **task-023 육안 확인 대기 1건**("5번째 탭 초록 점이 실제로 초록인지")이 바로 이것.
- **점을 위치 인디케이터로만 바꾸면 이 알림 신호가 사라진다 — 회귀다.**

### 참조 구현 (TheRoute)
`/home/brownjeon/NFS/homes/brownjeon/project/TheRoute/web/src/components/BottomNav.jsx:78-90`
```jsx
{onToggle && (
  <span style={{ display:'flex', gap:3, marginTop:-2 }}>
    <span style={{ width:4, height:4, borderRadius:'50%',
      background: onCalendar ? 'var(--ink-1)' : 'var(--ink-4)' }} />
    <span style={{ width:4, height:4, borderRadius:'50%',
      background: onRecords  ? 'var(--ink-1)' : 'var(--ink-4)' }} />
  </span>
)}
```
- 라벨 **아래**, **활성일 때만(`onToggle &&`)** 렌더. 비활성 탭엔 점 없음.
- **첫 점 = `onCalendar` = front**, 둘째 점 = `onRecords` = back. → **front 가 왼쪽**.
- 알림 배지는 **별개**다 — `NavBtn`(`:140-159`)의 `badge` 가 **아이콘 우상단**
  (`top:-2, right:-2, width:7, height:7`, `var(--warn)`)에 따로 있고,
  `passAlert` 일 때만(`{badge && ...}`) 렌더된다.

### BJJ 토글 짝 3개 — `web/src/utils/toggleNav.js:50-87`
| key | front (앞·왼쪽) | back (뒤·오른쪽) | 비고 |
|---|---|---|---|
| `recall` | `/calendar` 수업 | `/recall` 복기 | |
| `tech` | `/techplan` 기술 | `/study` 영상분석 | 🔴 **기존 탭 — 회귀 0 최우선** |
| `research` | `/research` 연구 | `/coach` 분석 | 코치 알림 점이 붙는 짝(`Layout.jsx:21` `coachDot:true`) |

판정 함수는 **이미 있다** — 새로 만들지 마라:
- `resolveSide(pair, pathname)` → `'front'|'back'|null` (`:94-99`)
- `isPairActive(pair, pathname)` → boolean (`:107-109`)
- `visibleSide(pair, pathname)` → front/back 객체 (`:102-104`)

### 레이아웃 실측 — 🔴 브리핑에 없던 제약
`web/src/styles/app.css:47-64` `.nav` 는 **`height: 62px` 고정** + `align-items:center`
+ `padding-bottom: var(--safe-bottom)`.
`:65-75` `.nav-item` 은 `flex-direction:column`, **`gap: 3px`**, `padding: 6px 4px`.

→ 현재 아이템 높이 ≈ 6 + 21(아이콘) + 3(gap) + ~12(라벨) + 6 = **약 48px**.
점 줄(4px) + gap(3px) 을 더하면 **약 55px** — 62px 안에는 들어가나 **여유가 7px 뿐**이다.
`.nav-item` 의 `gap:3px` 때문에 자식을 추가하면 **자동으로 3px 간격이 붙는다**
(TheRoute 는 `marginTop:-2` 로 당겨 붙인다 — 같은 보정이 필요할 수 있다).
**`.nav` 높이를 키우지 마라** — `app-content` 의 `padding-bottom:80px`(`:40`)과
`--safe-bottom`, 그리고 task-039 의 `[data-native]` 앱 여백 계산이 전부 62px 를 전제로 맞춰져 있다.

### 의존성 실측
- `grep -rn "dotColor" web/src/` → `ToggleTab.jsx`(정의·사용) · `Layout.jsx:86`(주입) 뿐.
  `ChainDetail.jsx:129` 의 `dotColor` 는 **같은 이름의 지역 변수로 무관**하다.
- 일반 `NavLink` 탭(`홈`·`픽미업`)에는 점이 **없다** (`Layout.jsx:90-108`) — 건드릴 것 없음.
- 색 토큰(`web/src/styles/tokens.css`): `--accent:#1D9E75` · `--accent-lt:#25C490` ·
  `--text3:#4A4E64` · `--amber:#F0A830`. `.nav-item.active { color: var(--accent) }`.
  TheRoute 의 `--ink-1`/`--ink-4` 대응은 **`--accent` / `--text3`** 이다(BJJ 엔 `--ink-*` 없음).

---

## Leader 설계 방향 — 🔴 **검증 대상이지 정본이 아니다**

두 신호를 **자리로 분리**한다 (TheRoute 와 같은 구조):

1. **위치 점 2개** → 라벨 **아래**. `resolveSide()` 로 front/back 중 어느 쪽이 진한지 결정.
   **활성일 때만 렌더**(`isPairActive`). front 가 왼쪽.
2. **코치 리포트 알림 점** → 아이콘 **우상단 배지로 유지**. 지금의 `dotColor` 점을 없애는 게 아니라
   **"알림이 있을 때만 뜨는 배지"로 의미를 좁힌다**. 알림이 없으면 아무 점도 안 뜬다
   (지금은 앰버가 항상 떠 있었다).

근거: 사용자가 가리킨 TheRoute 자체가 위치 점(라벨 아래)과 알림 배지(아이콘 우상단)를 분리해 뒀다.
색 하나에 두 의미를 겹쳐 싣던 현재 방식이 애초에 문제였다.

🔴 **이 프로젝트는 Leader 지시가 틀리고 Developer 반박이 옳았던 사례가 누적 5건이다**
(task-017 · 019 · 029×2 · 024). **코드를 읽고 내 판단이 틀렸다고 보이면 구현하지 말고 근거와 함께 반박하라.**

---

## 역할별 지시사항

### Developer (dev-042)

**착수 전 실측으로 확인할 것 (틀렸으면 반박):**
1. 앰버 점이 정말 "토글 탭 표시" 용도로만 쓰이는지 (위 grep 결과 재확인)
2. 라벨 아래 점 추가 시 **62px 고정 높이를 넘지 않는지** — 실제 렌더 높이를 재라
3. 점 2개의 좌우 순서가 front(왼쪽) → back(오른쪽) 이 맞는지
4. `--safe-bottom` / `[data-native] --native-top` 기존 여백 계산이 밀리지 않는지

**구현 범위 (웹만 — 네이티브 0):**
- `web/src/components/ToggleTab.jsx` — 위치 점 2개 추가 + 기존 절대배치 점을 알림 배지로 의미 축소
- `web/src/components/Layout.jsx:86` — `dotColor` prop → 알림 여부 boolean prop 으로 전환
- 필요하면 `web/src/styles/app.css` (높이를 키우지 않는 선에서)
- 🔴 `web/src/utils/toggleNav.js` 의 **판정 로직은 이미 충분하다** — 새 함수를 만들지 말고 `resolveSide` 를 써라.
  키(`lastKey`/`toastKey`)·`nextTarget` 동작은 **한 글자도 건드리지 마라**(task-023·040 회귀 0).

**회귀 0 최우선:** `tech` 짝(`/techplan` ↔ `/study`)은 사용자가 매일 쓰는 기존 탭이다.
토글 클릭 동작·토스트·`localStorage` 키가 이번 변경으로 달라지면 안 된다.

**증거 요구:**
- 3개 짝 × front/back = **스크린샷 6장** (`/calendar`·`/recall`·`/techplan`·`/study`·`/research`·`/coach`)
  - `google-chrome --headless=new --screenshot` CLI 를 써라 (MCP `chrome-devtools` 는 이 환경에서 실패한다)
  - 🔴 함정: `--window-size` 폭 **500 미만은 거짓 사진**(headless=new 최소 뷰포트 500) /
    크롬이 http→https 승격해 인증서 경고를 찍어도 md5 는 달라진다 → **찍기 전 curl 로 앱 HTML 확인**
  - 🔴 **6장의 md5 가 서로 다른지 스스로 확인하라** (전부 같으면 촬영 실패다 — 2026-09-09 실제 사고)
- **코치 알림 점이 살아 있음을 증명**: `unseenReport=true` 상태를 실제로 만들어
  (`localStorage` 의 `bjj-coach-seen-at` 조작 등) 5번째 탭에 배지가 뜨는 스크린샷 + 뜨지 않는 스크린샷
- 위치 점 색·좌우가 `resolveSide` 결과와 일치하는지 모듈 단위 검사

**빌드·배포:**
- `web/node_modules` 는 NFS 에 두지 마라. 빌드는 ext4(`/home/brownjeon/.node-local/bjj-web/work`),
  dist 는 `/home/brownjeon/.node-local/bjj-web/dist`. 절차는 프로젝트 `CLAUDE.md` "프론트 빌드" 절 그대로.
- 배포 후 `pm2 restart bjj` + **서빙 번들 해시 기록**.

**🔴 git — 절대 섞지 마라:**
작업트리에 이미 미커밋 변경이 있다 — `web/src/components/VideoPlayer.jsx` · `web/src/utils/videoThumb.js`
는 **task-041(참고영상 음소거 재생)** 의 것으로 배포는 됐고 사용자 확인 후 커밋 대기 중이다.
**건드리지 말고 네 변경과 섞어서 커밋하지 마라.** 커밋은 Leader 가 경로를 명시해 스테이징한다.

### Reviewer (rev-042)
Developer 구현 후 독립 감사:
- 의도 검증: 사용자 요청(TheRoute 방식 위치 점)을 실제로 충족하는가
- **코치 알림 회귀 여부** — 이게 이번 task 의 최대 위험이다. `hasUnseenReport`·`COACH_SEEN_KEY`·
  `/coach` 워터마크 경로가 온전한가. 알림이 **조용히 사라지는** 경로가 없는가
- `tech` 짝 회귀 0 — 토글 동작·키·토스트
- 62px 고정 높이·safe-area 를 밀지 않는가 (실제 렌더 측정으로)
- Developer 가 못 한 것을 숨기지 않고 적었는가

### QA (qa-042) — 🔴 **Sonnet 으로 돌린다**
이 프로젝트는 Haiku QA 허위보고가 **task-036 에서 3회 연속** 사실과 달랐다.
체크리스트는 6개 내외로 좁히고, **항목마다 "실제 출력으로 판정. 못 하면 PASS 대신 미검증으로 적어라"**.
- 실행 실패는 **실패로 보고**하라. 대체 수단을 썼으면 그 사실과 이유를 반드시 적어라.
- 산출물(스크린샷)은 **자기 폴더에만** 만들고, **md5·mtime 이 서로 다른지 스스로 확인**하라.
- dev 가 만든 산출물을 자기 검증으로 올리지 마라 — Leader 가 mtime 으로 확인한다.

---

## 진행 기록

(각 역할이 아래에 추가)

### dev-042 결과 (2026-09-15)

- [12:40] 착수 전 실측 4항목 완료. **Leader 판단 2건이 실측과 달랐다** — 아래 ①②.
- [12:49] 구현: `web/src/components/ToggleTab.jsx` 전면, `web/src/components/Layout.jsx:87`(+주석 3곳).
  `web/src/utils/toggleNav.js` · `web/src/styles/app.css` 는 **한 글자도 안 건드림**.
- [12:50] 빌드 `index-C66v7MFj.js`. [12:53] 실측·스크린샷. [13:02] 운영 배포 + `pm2 restart bjj`.
- [13:05] 산출물 정리: `/home/brownjeon/.node-local/bjj-backup/task-042-20260915-124642/`

#### 실측 4항목 — Leader 판단과 다른 것

| # | Leader 판단 | 실측 결과 | 판정 |
|---|---|---|---|
| ① 앰버 점 용도 | "토글 탭 표시 + 코치 알림 겸용" | 맞음. `dotColor` 주입은 `Layout.jsx:86` 하나뿐, `ChainDetail.jsx:129` 는 동명이인 지역변수 | ✅ 맞음 |
| ② 62px 여유 | "아이템 ≈48px, 점 줄 넣으면 55px, 여유 7px" | 🔴 **틀림**. 토글 탭 아이템은 **이미 56px**(390×844 실측). 흐름에 점 줄을 넣으면 **61px** → 여유 **1px**. 게다가 `.nav{align-items:center}` 라 활성화될 때마다 아이콘이 **2.5px 튄다** | ❌ 틀림 → 설계 변경 |
| ③ front 가 왼쪽 | 맞음 | TheRoute `onCalendar`=front=첫 점. BJJ 도 `pair.front` 가 기본 진입지 | ✅ 맞음 |
| ④ safe-area 여백 | "밀리면 안 됨" | CSS 번들 해시 **배포 전후 동일**(`index-BKA9Lb6r.css`). `--safe-bottom:34px` / `--native-top:48px` 강제 주입 실측에서도 `.nav` 62px 유지·점 잘림 없음 | ✅ 안 밀림 |

##### ② 때문에 바꾼 것 — 점 줄을 **흐름이 아니라 절대 배치**로
Leader 설계(TheRoute 처럼 라벨 아래 흐름에 한 줄 추가)를 그대로 쓰면 62px 안에 61px 이 들어가
여유가 1px 뿐이고, 활성 탭만 5px 높아져 **아이콘이 이웃 탭 대비 2.5px 위로 튄다**.
TheRoute 는 `display:grid`+상단정렬이라 이 문제가 없지만 BJJ `.nav` 는 `align-items:center` 다.
→ 점 줄을 `position:absolute; bottom:0` 으로 깔았다. **아이템 높이가 전혀 변하지 않으므로**
62px·`--safe-bottom`·`app-content{padding-bottom:80px}`·task-039 `[data-native]` 계산이 모두 그대로다.
겉모습(라벨 아래 4px 점 2개, 간격 3px)은 TheRoute 와 같다.

#### 🔴 범위 밖에서 발견한 기존 버그 — **고치지 않고 보고만 한다** (Leader 판단 요청)
`ToggleTab.jsx` 의 `style={{ ..., font: 'inherit' }}` 가 인라인이라 `.nav-item` 의 클래스 규칙을 **이긴다**.
- 토글 탭(수업·기술·연구) 라벨이 **14px**, 일반 탭(홈·픽미업)은 **10px** — 실측 computed 값.
  `before/before-calendar.png` 에서 육안으로도 확연하다.
- 같은 이유로 `.nav-item.active{font-weight:600}` 도 먹지 않아 **활성 토글 탭 라벨만 굵어지지 않는다**.
- 이게 아이템 높이 51px(일반) vs 56px(토글) 차이의 원인이고, ② 의 여유 부족도 여기서 온다.
- 고치는 법은 `font:'inherit'` 한 줄 삭제(=`app.css:15` 의 `button{font-family:inherit}` 가 이미 있다).
  다만 사용자가 매일 보는 라벨 크기가 눈에 띄게 줄어드는 **시각 변경**이라 독단 수정하지 않았다.
- 도입 시점 추정: task-023 에서 `<button>` 으로 뽑을 때. → 새 task 로 분리 권장.

#### 바꾼 파일
- `web/src/components/ToggleTab.jsx` — 전면 개편
  - `dotColor` prop 삭제 → `alert` (boolean) 신설
  - 아이콘 우상단 점: **항상 렌더 → `alert` 일 때만** 렌더, 색은 `var(--accent-lt)` 고정(기존 "안 본 리포트=초록" 의미 유지)
  - 라벨 아래 위치 점 2개 신설(활성일 때만, 왼쪽=front `var(--accent)` / 오른쪽=back, 비활성 쪽은 `var(--text3)`), `aria-hidden`
  - `resolveSide` 를 새로 import (판정 함수는 새로 만들지 않음)
  - `<button>` 인라인 스타일에 `position:'relative'` 추가(위치 점 기준) — `app.css` 는 안 건드림
- `web/src/components/Layout.jsx:87` — `dotColor={...}` → `alert={!!(t.coachDot && unseenReport)}`
  (+ 32·51·57 줄 주석을 새 동작에 맞게 갱신)

#### 검증
- 모듈 단위 36/36 PASS (`tests/RESULT-module-dots.txt`) — 점 좌우·색이 `resolveSide` 와 일치, 짝 밖/타 짝 누수 0, `/study/:id` 도 back, 🔴 `bjj-tech-last`·`bjj-tech-toggle-toast-seen`·`nextTarget`·토스트 1회 전부 기존값
- 실브라우저 상호작용 16/16 PASS (`tests/RESULT-browser-toggle.txt`) — 기술↔영상분석 클릭 왕복, 토스트 1회, task-040 "짝 밖→앞" 유지, 홈에서 점 없음
- 코치 알림 7/7 PASS (`tests/RESULT-browser-coach-badge.txt`) — 안 본 리포트 → 배지 `rgb(37,196,144)`, `/coach` 진입 → 워터마크 기록 → 배지 사라짐
- 렌더 치수 8경로 (`measure/`) — `.nav` 전부 **62px**, 아이템 높이·iconTop **배포 전과 동일**, 점은 y 837.5~841.5(바 바닥까지 2.5px 여유)
- 스크린샷 8장 **md5 전부 다름(8/8)** — `README.md` 표
- 🔴 이 스크린샷은 운영 :3000 이 아니라 **동일 번들을 서빙하는 로컬 스텁 서버**로 찍었다(인증 벽·실데이터 노출·알림 상태 결정성 때문). 세 md5(`work/dist` = 운영 `dist` = 운영이 실제 내려준 바이트) 일치로 같은 번들임을 증명. 사유·한계는 `README.md`.

#### 배포
- 배포 전 `assets/index-CyzrG7gc.js` (md5 `bf67c1b0…`) → 배포 후 **`assets/index-C66v7MFj.js`**
  md5 `e29cc18a032d45aefe551011fca304bf` / sha256 `e8cd4ea351915c88012c6cef4c7fdade63c90d14f66b6eb1a70356f017142f12`
- CSS `index-BKA9Lb6r.css` md5 `41bff1cf…` **배포 전후 동일**
- `pm2 restart bjj` 후 :3000 이 새 번들 서빙 확인. 🔴 재시작 직후 ~10초간 응답 없음(부팅 중) — 메모리의 "pm2 online ≠ 실제 응답" 패턴, 이번엔 정상 부팅이었다
- 롤백본: 산출물 폴더 `rollback/dist/`

#### 🔴 git — 안 건드렸다
`git commit` 하지 않았다. 작업트리의 `VideoPlayer.jsx`·`videoThumb.js`(task-041)는 **읽지도 고치지도 않았다**.
(빌드용 rsync 에는 딸려갔지만 mtime 이 배포된 번들과 같아 내용 변화 없음 — 즉 이번 배포가 task-041 을 새로 내보낸 게 아니다.)

#### 못 한 것 / 확신 없는 것 — 다음 역할의 작업 목록
1. **실기기·실로그인 육안 확인 0건.** 헤드리스 + 스텁 서버 렌더만 봤다. 안드로이드 앱(Capacitor WebView)에서 점이 시스템 내비게이션 바와 겹치지 않는지 **못 봤다**.
2. **`--safe-bottom` 이 실제 0 이 아닌 기기 미검증.** 토큰을 강제 주입해 "잘리지 않는다"까지는 봤지만, iOS Safari PWA 처럼 34px 이 실제로 들어오는 기기는 못 봤다. 그 경우 `.nav` 콘텐츠 박스가 27px 로 줄어 아이템(56px)이 넘치는데 **이건 이번 변경 이전부터 그랬다**(내가 만든 문제 아님, 별건 확인 필요).
3. **알림 배지 색을 초록으로 유지한 것은 내 판단.** 앰버가 놀게 됐으니 TheRoute 처럼 경고색(앰버)이 더 눈에 띈다는 반론이 가능하다. 다만 `/research` 활성 시 초록 아이콘 옆 초록 배지가 대비가 약할 수 있다 — 사용자 취향 확인 필요.
4. **비활성 토글 탭의 "이 탭은 토글이다" 힌트가 완전히 사라졌다.** 사용자 요청(TheRoute 방식)대로지만, 토스트는 1회뿐이라 한 번 넘긴 사용자에게는 앞으로 아무 단서가 없다. 의도대로인지 사용자 확인 권장.
5. **위 "기존 버그"(라벨 14px·미볼드) 미수정** — Leader 결정 필요.
6. `CoachPage` 의 `renderPreview` 는 `content` 없는 리포트 행 하나로 **앱 전체가 죽는다**(하네스에서 실제로 재현). 이번 범위 밖이지만 실제 데이터에 그런 행이 생기면 사고다 — 별건 기록 권장.

### rev-042 결과 (2026-09-15)

- [13:12] 착수. dev 보고를 신뢰하지 않고 처음부터 재현: `git diff` 로 변경 파일 확인(ToggleTab.jsx·Layout.jsx만, `toggleNav.js`·`app.css` diff 0줄 직접 확인), `web/src/components/VideoPlayer.jsx`·`utils/videoThumb.js`는 mtime(09-14 14:11)과 diff 내용(음소거 관련)으로 task-041 것임을 재확인 — task-042 범위 밖 미스매치 없음.
- [13:12~14:00] 독립 CDP 하네스 구축(dev 스크립트 재사용 없이 새로 작성): 내 폴더에 스텁 서버 2대 기동 — after=운영 dist(md5 `e29cc18a…`, 소스와 일치 `diff -rq web/src work/src` 0건으로 확인), before=dev의 `rollback/dist`(pre-task-042, md5 `bf67c1b0…`). **before 스텁으로 회귀 이전 상태를 실제 재현해 내 검사 자체가 결함을 잡아내는지 역검증**했다(아래).
- 산출물: `/home/brownjeon/.node-local/bjj-backup/task-042-rev-20260915-131204/`(dev 폴더 미수정)

#### 감사 초점 1 — 코치 알림 회귀: **PASS, 회귀 없음**
- `Layout.jsx` diff는 주석 3곳 + `dotColor={...}` → `alert={!!(t.coachDot && unseenReport)}` 한 줄뿐 — `listReports` 마운트 조회·`hasUnseenReport`·`COACH_SEEN_KEY` 워터마크 로직은 **한 글자도 안 바뀜**.
- config.json 스왑으로 3가지 상태(리포트 없음/안 봄/이미 봄) 각각에서 `probe.js`(getComputedStyle 기반) 실행 → 안 봄일 때만 **연구 탭에만** 배지(`rgb(37,196,144)`=--accent-lt), 나머지 두 상태·나머지 탭은 배지 0. `recall`·`tech` 탭은 세 시나리오 전부 배지 0(과거엔 앰버가 항상 떴던 자리).
- `interact.js` 로 실제 SPA 클릭(리로드 없이) 재현: `/research`(배지 있음) → 클릭 → `/coach` 진입 즉시 워터마크 기록 + 배지 소멸 → 다시 `/research` 클릭해도 배지 계속 없음. **17/17 PASS.**
- 🔴 **역검증**: 같은 `interact.js`를 before 번들(포트 3468)에도 그대로 실행 → tech 관련 11건은 전부 PASS(무회귀 확인 겸 로직 동일성 확인)이지만 **"배지 소멸" 2건만 의도대로 FAIL**(구코드는 `/coach` 방문 후에도 점이 앰버로 남아 절대 사라지지 않음). 즉 이 검사는 진짜 결함을 잡아낸다 — 통과만 하는 눈속임 검사가 아니다.
- `alert` prop 이 전역 `window.alert` 를 가리는지: `ToggleTab.jsx` 전체를 읽었고 그 파일 안에 `window.alert`/bare `alert()` 호출이 전혀 없음(다른 12개 파일은 쓰지만 무관) → **실제 위험 없음**, DOM 에 스프레드되지도 않아 React 미확인 속성 경고도 0건(`console-check.js`, 8경로 전부 0건).

#### 감사 초점 2 — `tech` 짝 회귀 0: **PASS**
- `toggleNav.js` git diff 0줄 직접 확인(리뷰어 자체 실행). `lastKey`(`bjj-tech-last`)·`toastKey`(`bjj-tech-toggle-toast-seen`) 값 그대로.
- `interact.js` 로 클릭 왕복(techplan→study→techplan) + 토스트 1회 + 문구("기술 ↔ 영상분석") + 짝 밖(`/`)에서 진입 시 `lastKey`(`/study`로 세팅해둠) 무시하고 항상 `/techplan`(front) 이동까지 확인 — **11/11 PASS**, before 번들에서도 동일하게 11/11 PASS(로직 완전 동일성 재확인).

#### 감사 초점 3 — 레이아웃(62px·safe-area): **PASS**
- `probe.js`(CDP getBoundingClientRect)로 8개 경로 전부 `.nav` 높이 정확히 `62px`(`navCssHeight` 포함) 확인.
- 토글탭 아이템 박스(top/bottom/height)가 **before/after 번들 간 byte-identical**(예: `/techplan` 기술탭 `top:785.5, bottom:841.5, height:56` 완전 동일) — 절대 배치가 아이템 높이에 영향 0이라는 dev 주장을 좌표 단위로 직접 재현·확인. 일반 탭(홈·픽미업)도 before/after 완전 동일.
- 픽셀 검증: `pixelcheck.js`+ffmpeg raw crop 으로 `/techplan` 위치 점 두 개의 실제 렌더 픽셀을 16진수로 추출 → 왼쪽 `1d9e75`(=--accent, front 진함) / 오른쪽 `4a4e64`(=--text3, back 흐림) **정확히 일치**. 라벨 하단(835.5)과 점 상단(837.5) 사이 2px 간격으로 겹침 없음(390×844 기준).
- `--safe-bottom:34px` 강제 주입(iOS PWA 시뮬레이션) 재현: 토글 아이템이 `.nav`(62px, border-box라 안전영역 있어도 총높이 불변) 콘텐츠 박스(28px)보다 커서 위로 13.5px 오버플로우 — **before 번들에서도 좌표가 완전히 동일**해 이 오버플로우가 task-042 이전부터 있던 문제임을 직접 확인(더 나빠지지 않음). 단, 위치 점 자체는 `bottom:0` 이라 오버플로우돼도 `.nav`의 실제 페인트 박스(782~844) 안에 남아 점만은 안 잘림 — dev가 "못 한 것 #2"에 적은 내용과 정확히 일치, 과장도 축소도 없음.
- `--native-top` 주입도 확인 — nav 위치·높이에 영향 없음(원래 상단 패딩 문제라 무관한 것이 정상).

#### 감사 초점 4 — 의도 검증: **PASS**
- 3개 짝(recall/tech/research) × front/back 전부 `probe.js`(getComputedStyle 배경색) 로 `resolveSide` 결과와 dot 색상이 일치함을 확인 — front=왼쪽=진함(활성 쪽), back=오른쪽 반대로 스왑되는 것도 recall·research 양쪽 다 확인.
- 스크린샷 4장(rev-01~04) 독립 촬영, md5 4종 전부 다름. 우연히도 `rev-04-research-alertOFF.png` md5(`1330240474682d9aff88517ee9d1ecab`)가 dev README의 `after/05-research.png` md5와 **완전 일치** — 같은 번들·같은 상태를 서로 다른 세션에서 찍어도 재현 가능함을 뜻하는 교차검증(사전 공모 아님, 결정적 렌더라는 방증).

#### 감사 초점 5 — dev 가 못 한 것을 숨겼는가: **정확함, 추가 발견 없음**
- "못 한 것" 6개 항목을 하나씩 대조: ①③ 실기기 미검증·safe-area 34px 미검증 → 나도 헤드리스+강제주입까지만 가능해 **동일하게 미검증**(실기기 검증은 이 세션 툴로는 불가능, 솔직하게 명시). ②④⑤⑥은 코드·의견 기반 사실이라 재현 대상이 아니며 진술이 부정확하지 않음.
- 추가로 내가 찾은 것: 없음(신규 결함 0건).

#### 미검증 (명시)
- **실기기(iOS/Android 실물) 육안** — Xvfb·실기기 부재로 dev와 동일하게 불가능. 헤드리스+CSS 변수 강제주입 시뮬레이션까지가 이 세션의 한계.
- `google-chrome --headless=new --screenshot` 산출 png 를 Read 툴로 직접 열람 시 훅이 반복 타임아웃 → 육안 대신 **ffmpeg raw RGB 픽셀 추출**로 대체(위 초점3). 대체 사유와 결과를 README.md에 명시.

#### 판정: **PASS**
- Critical 0 / High 0 / Medium 0 / Low 1(레이블 폰트 크기·굵기 미적용 — task-023부터의 기존 버그, dev가 이미 발견·보고했고 이번 task 범위 밖. 새 task 분리 권장, 차단 아님)
- high_risk_areas(참고용, QA 불필요 — 이미 자동화 검사로 커버): 없음. 남은 리스크는 전부 "실기기 미검증"으로, 자동화로는 닫을 수 없는 영역.


### qa-042 결과 (2026-09-15)

- [14:43] 착수. dev-042·rev-042 산출물을 검증 결과로 올리지 않기 위해 **처음부터 새로 작성한
  스텁 서버·CDP 하네스**로 독립 재현. 산출물: `/home/brownjeon/.node-local/bjj-backup/task-042-qa-20260915-144343/`
  (dev·rev 폴더는 읽기만 함, 수정 없음).
- 번들 md5: 운영 `:3000` curl 실측 = dist 파일 = 내 스텁(:4501) curl 실측 = **`e29cc18a032d45aefe551011fca304bf`**
  세 곳 모두 QA가 직접 curl로 확인해 일치시켰다(Leader가 알려준 값과도 일치).

#### 🔴 검증 중 QA 자신의 하네스 버그 1건 발견·수정 (은폐하지 않고 기록)
1차 실행에서 Q3(코치 배지)에서 1건 FAIL이 나왔다("안 본 리포트 있음: research 배지 색 got=null want=accent-lt").
dev·rev 결과와 상충해 **앱을 의심하기 전에 내 하네스를 먼저 의심**하고 추적했다:
- `outerHTML`을 직접 찍어보니 배지 `<span>`은 실제로 정상 렌더돼 있었다(`background: var(--accent-lt)`).
- 원인: 배지를 감싸는 아이콘 wrap이 인라인 스타일로 `display:'inline-flex'`지만, 부모 `.nav-item`이
  `display:flex`인 flex 컨테이너의 자식(flex item)이라 CSS 스펙상 **blockification**이 적용돼
  `getComputedStyle().display`가 `'flex'`로 관측된다(저작값 `inline-flex` 그대로가 아니다). 내
  검사 스크립트의 `badgeOf()`가 `display==='inline-flex'`를 조건으로 걸어서 못 찾았을 뿐이다.
  `position==='relative'` 하나로도 라벨(`static`)·점줄(`absolute`)과 구분되므로 그 조건만 남겨 고쳤다.
- 폭 3500ms까지 늘려도, chrome 프로세스를 전부 새로 띄워도 **동일하게 재현**되어 "타이밍 레이스"가
  아니라 순수 셀렉터 로직 오류임을 확인했다. 고친 뒤 재실행: 72/72 PASS로 안정적 재현.
- 1차(버그 있는) 로그는 지우지 않고 `RESULT-qa-interact-FIRST-RUN-with-selfbug.txt`로 남겼다.

#### Q1. 위치 점이 실제 현재 위치를 가리키는가 — **PASS**
6경로(`/calendar`·`/recall`·`/techplan`·`/study`·`/research`·`/coach`) 전부 `getComputedStyle` 기준
front=`rgb(29,158,117)`(`--accent`)·back=`rgb(74,78,100)`(`--text3`)로 활성 쪽만 진하고 좌우가
`resolveSide` 결과와 정확히 일치(`RESULT-qa-interact-final.txt`, 활성 라벨 6건 + 위치점 좌우색 6건 = 12건 전부 PASS).
픽셀 레벨 교차검증(`/research`, 390x844, `screens/pixelcheck-research-alertON.png`): 왼쪽 점
실측 `(29,158,117)` = `#1D9E75`, 오른쪽 `(74,78,100)` = `#4A4E64` — CDP 한 세션에서 좌표측정과
촬영을 같이 해 좌표계 불일치를 없앴다(처음 별도 세션으로 쟀다가 완전히 엉뚱한 배경색만 나와 시행착오 있었음).

#### Q2. 비활성 토글 탭에 점이 없는가 — **PASS**
6경로 각각에서 같은 화면에 있는 다른 토글 탭(비활성)의 위치점을 확인 — 전부 `null`(렌더 안 됨).
12건(6경로 × 비활성 토글 탭 2개씩) 전부 PASS.

#### Q3. 코치 알림 배지 — **PASS** (이번 task 최대 위험 항목)
- 리포트 없음 → research 탭 배지 없음(`null`)
- 안 본 리포트 있음 → research 탭에만 배지 `rgb(37,196,144)`(`--accent-lt`), 나머지 4개 탭은 배지 0
- **실제 클릭**(`nav.children[4].click()`, 페이지 리로드 없음)으로 `/coach` 진입 → 배지 즉시 소멸 +
  `bjj-coach-seen-at` 워터마크 기록 확인 → 다시 `/research`로 클릭 이동해도 배지 계속 없음(워터마크 유지)
- 픽셀 레벨: 배지 위치 (357,793) 실측 `(37,196,144)` = `#25C490` 정확히 일치.
- "예전엔 앰버가 항상 떠 있었다"는 요구사항대로 **리포트 없거나 이미 봤으면 아무 점도 안 뜸**을 확인.

#### Q4. 기술 탭 회귀 0 — **PASS**
`/techplan`↔`/study` 클릭 왕복 정상, 토스트 최초 1회만 노출, `localStorage` 키
(`bjj-tech-last`·`bjj-tech-toggle-toast-seen`) 값 그대로 기록·갱신됨, 짝 밖(`/`)에서 `bjj-tech-last`를
`/study`로 강제해 둔 채 탭 클릭해도 **항상 앞(`/techplan`)**으로 이동(task-040 무회귀). 10건 전부 PASS.

#### Q5. 하단바 높이 — **PASS**
6개 기본 경로 전부 `.nav` computed height 정확히 `62px`(Q3 코치 배지 시나리오는 같은 /research 경로 재방문이라 높이를 중복 검사하지 않았다).
점이 라벨과 겹치거나 잘리는 현상 없음(육안은 스크린샷으로, 수치는 getComputedStyle로 확인).

#### Q6. 일반 탭(홈·픽미업) 불변 — **PASS**
6경로 전부에서 홈(idx0)·픽미업(idx2)에 위치점·배지 모두 `null`(생성 안 됨). 24건 전부 PASS.

#### 스크린샷 — md5 서로 다름 확인
9장 중 서로 다른 md5 **8개**. `research.png`(리포트 없음)와 `alert-OFF-research.png`(리포트는 있으나
이미 봄)만 md5가 같은데, 이는 두 경우 모두 `unseenReport=false`로 귀결되는 **같은 논리적 최종 상태**라
렌더가 결정적으로 동일해서다(2026-09-09 "촬영 실패로 6장 전부 동일"과는 원인이 다름 — 나머지 서로
무관한 상태 8개는 전부 다름). 상세는 `README.md`.
🔴 6개 기본 경로 스크린샷 md5가 dev 산출물과 완전히 일치하는데, 이는 복사가 아니라 **동일 번들+동일
뷰포트+동일 상태의 헤드리스 렌더가 결정적**이기 때문이다(rev-042도 동일 현상 보고). mtime으로 구분
가능(내 파일은 9월 15일 14:57~15:36, dev는 12:56~12:58, rev는 13:12~14:08).

#### 실행하지 못한 것 / 대체 수단
- 실기기(iOS/Android 실물) 육안 확인 — dev·rev와 동일하게 이 세션에서 불가능. **미검증**으로 남긴다.
- PNG를 Read 툴로 직접 열람 — 훅 타임아웃(rev-042와 동일 증상) → **ffmpeg로 원본 RGB 픽셀 직접 추출**로
  대체(사유 명시, README.md).

#### 발견한 결함
없음. dev가 이미 보고한 "라벨 폰트 14px·미볼드"(task-023부터의 기존 버그, 범위 밖)는 재확인만 했고
새 결함은 발견하지 못했다.

#### 실데이터 영향
운영 `:3000`·실 DB·실 브라우저 localStorage는 전혀 건드리지 않았다. 전 과정이 QA 소유 스텁 서버(포트
4501, 검증 후 프로세스 종료함)와 헤드리스 크롬 임시 프로파일에서만 이뤄졌다. pm2 `bjj`는 restarts=32로
검증 전후 변화 없음(재시작 안 됨), `:3000`이 서빙하는 번들도 검증 전후 동일.

#### 판정: **PASS** — Q1~Q6 전부 PASS, Critical/High/Medium/Low 신규 결함 0건

---

### Leader 최종 검증 (2026-09-15)

QA 의 PASS 를 믿지 않고 직접 재실행한 것:
- **운영 서빙 번들 = dist 파일** md5 `e29cc18a032d45aefe551011fca304bf` (`curl :3000` 과 파일 양쪽) — 배포가 실제로 반영됐다
- **서빙 번들 안에 `bjj-coach-seen-at` 존재** — 코치 알림 경로가 살아서 배포됐다
- **서빙 번들 안에 토글 키 4종 전부 존재**(`bjj-tech-last`·`bjj-tech-toggle-toast-seen`·`bjj-recall-last`·`bjj-research-last`) — task-023·040 회귀 0
- **`git diff --stat` 으로 `toggleNav.js`·`app.css` 무변경 확인** — Developer 주장대로였다
- **스크린샷 mtime 대조** — QA 산출물은 14:57~15:36, dev 는 12:54~12:58 로 **서로 다른 시각**이다. QA 가 dev 것을 베끼지 않았다.
  (6장 md5 가 dev 와 같은 것은 **같은 번들·같은 뷰포트의 결정적 렌더**이고 QA 가 그 사실을 스스로 밝혔다 — 과거의 허위보고와 다르다.)
- **하단바 육안 직접 확인** — `/calendar` 왼쪽 점 진함·`/recall` 오른쪽 점 진함·`/research` 알림 배지 초록을 Leader 가 스크린샷으로 직접 봤다

### 🔴 Leader 판단이 틀렸던 것 — 누적 6번째

`.nav` 62px 여유 추정(**"아이템 ≈48px → 55px, 여유 7px"**)이 틀렸다. 실제 토글 아이템은 **이미 56px** 이라
흐름에 점 줄을 넣으면 61px 로 여유가 1px 뿐이고, `.nav{align-items:center}` 탓에 **활성화될 때마다 아이콘이 2.5px 튄다.**
Developer 가 실측으로 반박하고 **절대 배치**(`position:absolute; bottom:0`)로 바꿔 아이템 높이를 **전혀 건드리지 않았다.**
CSS 번들 해시가 배포 전후 동일한 것이 그 증거다.

**패턴이 반복된다** — task-017·019·029(2건)·024 에 이어 여섯 번째로 **지시서의 수치가 정본이 아니었다.**
이번에 통한 것: 지시서에 "착수 전 실측으로 확인할 것" 4항목을 **명시적으로 박아 넣은 것**. Developer 가 그 틀 안에서 반박했다.

### 미해결 — 사용자 판단 대기

🟡 **토글 탭 라벨만 14px 이고 볼드가 안 먹는다(범위 밖 기존 버그, 미수정).**
`ToggleTab.jsx:50` 의 인라인 `font:'inherit'` 가 `.nav-item{font-size:10px}` 를 이겨서
**토글 탭(수업·기술·연구) 라벨만 일반 탭(홈·픽미업)보다 눈에 띄게 크다.** `.nav-item.active{font-weight:600}` 도 안 먹는다.
task-023 때 들어온 것으로 추정. 고치면 1줄(`font:'inherit'` 삭제 — `app.css:15` 에 이미 `button{font-family:inherit}` 있음)이나
**사용자가 매일 보는 라벨 크기가 눈에 띄게 줄어드는 시각 변경**이라 이번 범위에서 의도적으로 제외했다. 백로그에 올렸다.

---

## 최종 요약 (사용자용)

**하단바 토글 탭의 점을 클라이밍 앱(TheRoute)과 같은 방식으로 바꿨습니다.**

전에는 주황색 점 하나가 탭 아이콘 옆에 **항상** 떠 있어서 "이 탭은 두 화면이 토글된다"는 것만 알려주고,
정작 **지금 둘 중 어디에 있는지는 알려주지 않았습니다.** 이제는 라벨 바로 아래에 작은 점 2개가 놓이고
**지금 보고 있는 쪽 점만 초록으로 진하게** 표시됩니다. 왼쪽이 앞 화면, 오른쪽이 뒤 화면입니다.
수업↔복기 · 기술↔영상분석 · 연구↔분석 세 쌍 모두 같은 방식이고, 그 탭에 있지 않을 때는 점이 아예 안 보입니다.

**함께 정리한 것**: 그 주황색 점은 사실 "새 코치 리포트가 왔다"는 알림(초록색)도 **같은 점 하나로 겸하고 있었습니다.**
색 하나에 두 가지 뜻을 싣던 구조라 위치를 표시할 수가 없었습니다. 그래서 알림은 **아이콘 오른쪽 위의 별도 배지**로 옮기고,
**알림이 실제로 있을 때만** 뜨게 했습니다. 평소에는 아무 점도 뜨지 않아 하단바가 더 깔끔합니다.
(덤으로 task-023 때부터 남아 있던 "5번째 탭 초록 점이 진짜 초록인지" 육안 확인 숙제도 이번에 해소됐습니다 — 실제로 초록입니다.)

**안전 확인**: 매일 쓰시는 기술↔영상분석 탭의 동작은 한 군데도 바뀌지 않았고(클릭 토글·안내 문구·마지막 화면 기억),
하단바 높이도 62px 그대로라 화면이 밀리지 않습니다. **웹 변경만이라 앱 재설치는 필요 없습니다.**

**한 가지 남은 것**: 토글 탭(수업·기술·연구)의 글자만 다른 탭보다 커 보이는 문제가 예전부터 있었습니다.
이번 작업 중에 발견했지만 요청 범위 밖이고 글자 크기가 눈에 띄게 달라지는 변경이라 **손대지 않았습니다.**
맞춰서 통일하길 원하시면 말씀해 주세요 — 한 줄이면 됩니다.
