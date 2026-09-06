---
name: task-023-toggle-nav-generalization
aliases: ["토글 내비", "ToggleTab", "복기 탭", "연구 탭", "하단 5탭"]
tags:
  - type/task
  - domain/frontend
  - domain/navigation
related_tasks:
  - "[[task-020-recall-lab-spec-and-name-audit]]"
  - "[[task-021-home-today-card-openmat-preset]]"
  - "[[task-024-holes-and-mastery-api]]"
status: done
created: 2026-09-07
updated: 2026-09-07
---

# task-023 — 토글 내비 일반화 (ToggleTab 3쌍)

## 목표

`web/src/components/Layout.jsx`의 `handleTechTabClick` 하나에 하드코딩된 클릭 토글을
**`ToggleTab` 컴포넌트로 추출**해 하단 5탭 중 **세 쌍**이 같은 코드를 쓰게 한다.

| 탭 위치 | 앞(기본) | 뒤 | 라우트 | 상태 |
|---|---|---|---|---|
| 2번째 | **수업** | 복기 | `/calendar` ↔ `/recall` | 신규 |
| 4번째 | **기술** | 영상분석 | `/techplan` ↔ `/study` | **기존 — 회귀 0이 최우선** |
| 5번째 | **연구** | 분석 | `/research` ↔ `/coach` | 신규 (**연구가 앞**) |

3번째 탭 `픽미업`(`/pickmeup`)과 1번째 `홈`(`/`)은 **손대지 않는다.**

`/recall`·`/research`는 이번 task에서 **빈 페이지 스텁**만 둔다. 내용은 task-025·026.

---

## 관련 과거 이력 요약 (이것만 읽으면 된다)

### 현재 구현 — `web/src/components/Layout.jsx` 전체 104줄

- `tabs` 배열 5개. 4번째만 `{ key:'tech', special:true }`로 라벨·경로가 없고, 렌더 분기에서
  `<button>`으로 따로 그린다(55~79줄). 나머지 4개는 `<NavLink>`(80~99줄).
- 상태 판정: `isStudy = pathname === '/study' || pathname.startsWith('/study/')`,
  `isTechplan = pathname === '/techplan'`, `onTechOrStudy = isTechplan || isStudy`.
- `handleTechTabClick()` (30~46줄):
  1. 현재 앞이면 뒤로, 뒤면 앞으로, **둘 다 아니면 `localStorage['bjj-tech-last']`**(없으면 `/techplan`).
  2. 이동할 경로를 다시 `bjj-tech-last`에 저장.
  3. `localStorage['bjj-tech-toggle-toast-seen'] !== '1'`이면 토스트 1회 + 플래그 저장.
  4. `navigate(target)`.
- 앰버 점: 아이콘 우상단 6×6 원, `background: var(--amber)` (71~74줄). **현재 4번째 탭에만 있다.**
- 토스트는 `useUI().showToast(msg, ms=2000)` (`web/src/contexts/UIContext.jsx:9`).

### `web/src/main.jsx` — 라우트 정의는 여기 한 곳뿐

Layout 아래 자식 라우트: `/` `/calendar` `/pickmeup` `/techplan` `/study` `/study/:id`
`/clips` `/coach` `/me` `*`(NotFound). 지금 `/recall`·`/research`로 가면 **NotFoundPage가 뜬다.**

### 🔴 `/calendar`에는 하위 라우트가 없다 — 편집기는 화면 상태다

`web/src/pages/CalendarPage.jsx:6-7`이 `ClassEditPage`·`SparEditPage`를 **컴포넌트로 import**해
내부 상태로 전환한다. 라우트가 아니다. 따라서 2번째 탭의 경로 판정은 `pathname === '/calendar'` 하나면 된다.

> ⚠️ **부작용 하나를 알고 넘어갈 것.** 지금은 `/calendar`에서 수업 탭을 눌러도 NavLink라 아무 일이 없다.
> 바뀐 뒤에는 `/recall`로 이동하므로 **편집 중이던 내용이 날아간다.** 다만 저장소 전체에
> `beforeunload`/`useBlocker` 가드가 **0건**이고(실측), 지금도 다른 탭을 누르면 똑같이 날아간다 —
> 즉 "안전한 탭 하나"가 사라지는 것이지 새 종류의 사고는 아니다. **이번 범위에서 가드를 만들지 말고**,
> Reviewer가 수용 가능한 변경인지만 판정한다.

### `/coach` 진입 경로 (실측 grep)

탭 외에 `web/src/pages/HomePage.jsx:311`·`:328` **두 곳**이 `navigate('/coach')`를 부른다.
즉 분석은 5번째 탭이 뒤로 밀려도 홈에서 바로 갈 수 있다 — 다만 그것이 접근성 저하를 없애 주지는
않으므로 **초록 점**(아래)을 함께 넣는다.

### `Icon.jsx` 실재 아이콘 이름 (실측)

`home calendar book target grid plus search chevL chevR star x check clock fire trophy users video brain link settings edit trash pin sparring belt`

→ 복기 `search` ✅ · 연구 `target` ✅ 둘 다 실재한다. **없는 이름을 쓰면 아이콘이 조용히 빈 칸이 된다**
(`Icon`은 `icons[name]`을 찾지 못하면 그냥 아무것도 안 그린다 — 에러가 없다).

### 코치 리포트 API (초록 점 재료)

`GET /api/coach/reports?type=report&limit=N` 이 이미 있다
(`backend/src/routes/coach.js:273`, 프론트 래퍼 `web/src/api/coach.js`의 `listReports(type, limit)`).
운영 DB 실측: `coach_reports` (user 3) **42행**.

---

## 🔴 착수 전 Leader 실측 (2026-09-07)

| 항목 | 값 |
|---|---|
| `Icon.jsx`에 `search` / `target` 존재 | ✅ 둘 다 존재 |
| `/calendar` 하위 라우트 | **없음** (편집기는 CalendarPage 내부 상태) |
| `/coach` 탭 외 진입 경로 | HomePage 2곳 |
| 이탈 가드(`beforeunload`/`useBlocker`) | 저장소 전체 **0건** |
| `coach_reports` (user 3) | 42행 |
| 기존 localStorage 키 | `bjj-tech-last` · `bjj-tech-toggle-toast-seen` |

---

## 역할별 지시사항

### Developer

#### A. `ToggleTab` 추출 — `web/src/components/ToggleTab.jsx` 신설

세 쌍이 **같은 코드**를 쓰게 한다. 짝마다 다른 것은 **설정으로만** 표현한다.

```jsx
// 한 쌍의 설정 예 (형태 참고용 — 필드명은 Developer 재량, 단 의미는 유지)
{
  key: 'tech',
  front: { to: '/techplan', label: '기술',     icon: 'book'  },
  back:  { to: '/study',    label: '영상분석', icon: 'video' },
  matchBack: (p) => p === '/study' || p.startsWith('/study/'),
  lastKey:  'bjj-tech-last',                  // 🔴 기존 키 그대로
  toastKey: 'bjj-tech-toggle-toast-seen',     // 🔴 기존 키 그대로
  toastMsg: '탭을 다시 누르면 기술 ↔ 영상분석 화면이 전환돼요',
}
```

**동작은 현재 `handleTechTabClick`과 한 글자도 다르지 않게** 옮긴다:
앞이면 뒤로 · 뒤면 앞으로 · 둘 다 아니면 `last`(없으면 앞) → `last` 저장 → 토스트 1회 → `navigate`.
`localStorage` 접근은 지금처럼 **전부 try/catch**로 감싼다(프라이빗 모드에서 throw).

#### B. 🔴 localStorage 키 — 기존 키를 **바꾸지 마라**

| 짝 | last 키 | toast 키 |
|---|---|---|
| 수업/복기 | `bjj-recall-last` | `bjj-recall-toggle-toast-seen` |
| **기술/영상분석** | **`bjj-tech-last`** (기존) | **`bjj-tech-toggle-toast-seen`** (기존) |
| 연구/분석 | `bjj-research-last` | `bjj-research-toggle-toast-seen` |

일반화하면서 키를 `bjj-nav-last:tech` 같은 새 이름으로 통일하고 싶어질 것이다. **하지 마라.**
사용자 브라우저에 이미 값이 들어 있어서, 키를 바꾸면 **마지막에 보던 화면 기억이 사라지고
안 뜨던 안내 토스트가 다시 뜬다.** QA 항목 1번(기술 탭 회귀 0)이 바로 이걸 본다.
"짝마다 별도 키"라는 요건은 **키를 새로 짓는 것이 아니라 짝끼리 안 섞이는 것**이 핵심이다.

#### C. 탭 배열·렌더 통합

`tabs` 배열을 `{type:'link'|'toggle', ...}`로 정리하고, 5개 전부 같은 map에서 그린다.

- 🔴 **`NavLink` → `<button>`으로 바뀌는 탭이 2개 늘어난다**(수업·분석). `NavLink`가 공짜로 주던
  `isActive`가 사라지므로 **active 클래스를 직접 계산**해야 한다. 빠뜨리면 활성 표시가 조용히 죽는다.
  (홈은 `end: true`가 필요한 링크이므로 **그대로 `NavLink`로 남긴다.**)
- 앰버 점(`var(--amber)`)을 **세 토글 탭 공통**으로 적용한다. 링크 탭(홈·픽미업)에는 붙이지 않는다.
- 라벨·아이콘은 "지금 어느 쪽에 있는지"가 아니라 **"다음에 눌렀을 때 무엇이 보이는지"가 아니라
  현재 쪽을 표시**한다 — 기존 기술 탭과 동일 규칙(현재 `/study`면 `영상분석`/`video`를 보여준다).
  짝 밖에 있을 때는 **앞쪽**을 보여준다(기존 동작 그대로).

#### D. 5번째 탭 — **연구가 앞**

`front = 연구(/research, target)` · `back = 분석(/coach, brain)`.
localStorage에 값이 없는 **최초 진입은 `/research`**. `/coach`를 한 번 보고 나면 그 다음 탭 클릭은
`/coach`로 간다(짝 기억) — 이건 의도된 동작이다.

#### E. 초록 점 — 새 코치 리포트 알림

분석이 한 단계 뒤로 가서 생기는 접근성 저하를 보완한다.

- Layout 마운트 시 `listReports('report', 1)` **한 번** 호출 → 최신 리포트의 `created_at`을 얻는다.
- `localStorage['bjj-coach-seen-at']`(ISO 문자열)보다 최신이면 5번째 탭 점을 **초록**으로 칠한다.
  (앰버 대신 초록 — 점이 두 개가 되지 않게 한다.)
- 사용자가 `/coach`에 진입하면 그 시점에 워터마크를 갱신하고 점을 앰버로 되돌린다.
  워터마크 갱신 위치는 **Layout에서 `pathname === '/coach'`를 감지**해 처리한다(CoachPage를 고치지 않는다).
- 🔴 **실패해도 내비게이션이 절대 깨지지 않게 한다.** 401·네트워크 오류·응답 형태 변화 전부
  try/catch로 삼키고 **점 색만 앰버로 유지**한다. 토스트를 띄우지 마라(모든 화면에서 뜬다).
- 색은 토큰을 쓴다. `web/src/styles/tokens.css`에 초록 계열 토큰이 있으면 그것을,
  없으면 **`--amber` 옆에 토큰을 하나 추가**하고 하드코딩하지 않는다.

#### F. 라우트 + 스텁 페이지

`web/src/main.jsx`에 `/recall`·`/research` 두 줄을 추가한다(`*` NotFound **앞에**).
`web/src/pages/RecallPage.jsx` · `web/src/pages/ResearchPage.jsx` 신설 — **빈 화면 스텁**이다.
화면 제목 + "task-025(복기) / task-026(연구)에서 채웁니다" 한 줄이면 충분하다.
🔴 **여기서 복기·연구 기능을 미리 만들지 마라.** API는 task-024가 만드는 중이고,
UI 사양은 아직 확정 전이다(`docs/recall-lab-spec.md` §6 노드 7종).

#### G. 빌드·배포 (NFS noexec 우회)

```
rsync -av web/src/ /home/brownjeon/.node-local/bjj-web/work/src/ --quiet
cd /home/brownjeon/.node-local/bjj-web/work && npm run build
rsync -av dist/ /home/brownjeon/.node-local/bjj-web/dist/ --delete --quiet
pm2 restart bjj
```

🔴 **`pm2 restart bjj`는 task-024 Developer와 공유하는 자원이다. 아래 락 규약을 지켜라.**

```bash
LOCK=/home/brownjeon/.node-local/bjj-backup/task-023-024/RESTART.lock
mkdir -p /home/brownjeon/.node-local/bjj-backup/task-023-024
until mkdir "$LOCK" 2>/dev/null; do sleep 3; done   # 획득 (mkdir은 원자적)
#   ... rsync + pm2 restart + 확인 ...
rmdir "$LOCK"                                        # 반드시 해제
```
락은 **restart와 그 직후 확인까지만** 잡는다. 오래 잡고 있지 마라.

🔴 **서빙 번들을 직접 내려받아 확인할 것** — 직전 배치에서 이게 효과적이었다.
`curl http://localhost:3000/`이 참조하는 `index-*.js`를 받아 `/recall`·`/research` 문자열과
새 localStorage 키가 실제로 들어 있는지 grep한다. 구 dist가 서빙되면 소스만 맞고 화면은 그대로다.

#### H. QA 실행 하네스 인계 (🔴 필수)

`/home/brownjeon/.node-local/bjj-backup/task-023/qa/` 아래에 QA가 **그대로 실행만 하면 되는**
스크립트를 만들어 두고, **전부 직접 실행해 통과를 확인한 뒤** 인계한다.

- `00-mint-token.js` — 토큰 발급. 🔴 **payload의 `userId`를 반드시 출력**한다.
  (직전 배치에서 스크래치패드 토큰이 admin=user 1이어서, 그대로 돌렸다면 HTTP 200과 정상 응답을
  받으면서 user 3 데이터는 하나도 안 건드리는 **무증상 실패**가 될 뻔했다.)
- `01-bundle-checks.sh` — 서빙 번들 다운로드 + 문자열 grep.
- `02-route-checks.sh` — `/recall`·`/research`·`/coach`·`/calendar` SPA 응답 확인.
- 🔴 **localStorage 동작은 curl로 검증되지 않는다.** 토글 상태 기계를 **순수 함수로 분리**해
  `03-toggle-logic.js`가 Node에서 직접 호출하도록 만들어라 — 가짜 localStorage를 주입해
  "앞→뒤→앞", "짝 밖에서 last 복원", "짝별 키 격리", "토스트 1회"를 **실행으로** 검증할 수 있게.
  이게 이번 task에서 QA가 코드 검토로 후퇴하지 않을 유일한 방법이다.

#### 실행 제약

- 자격증명 평문 금지: `backend/.env` source 후 `MYSQL_PWD` 경유. **보고서에 비밀번호 금지.**
- 조사·검증 스크립트를 **저장소에 두지 마라**. 스크래치패드 또는 `/home/brownjeon/.node-local/bjj-backup/task-023/qa/`.
- **커밋하지 마라.** Leader가 QA 통과 후 task별 1건으로 커밋한다.
- `agent-vault/10-Flow/board.md`·`20-Log/`는 **건드리지 마라** — Leader가 갱신한다.
  이 파일의 "실행 기록 > Developer" 섹션에만 적는다.
- **task-024가 만지는 `backend/src/**`를 건드리지 마라.** 이 task는 `web/src/**` + `web/src/main.jsx`만이다.

---

### Reviewer

1. **기존 기술 탭 동작이 리팩토링으로 바뀐 곳이 한 군데도 없는가** — 옛 `handleTechTabClick`과
   새 `ToggleTab`의 분기를 한 줄씩 대조. 특히 "짝 밖 → last 복원 → last 없으면 앞".
2. 🔴 **localStorage 키 3쌍이 실제로 격리돼 있는가**, 그리고 **기술 짝만은 옛 키를 그대로 쓰는가.**
   한 짝의 토글이 다른 짝의 기억이나 토스트 플래그를 덮어쓰지 않는지.
3. `NavLink` → `<button>` 전환으로 **active 표시가 죽은 탭이 없는가** (수업·분석 특히).
   홈의 `end: true` 의미가 보존됐는가.
4. 5번째 탭 기본이 **연구**인가 — 코드 경로로 확인(`front`가 `/research`).
5. `Icon.jsx`에 **실재하지 않는 아이콘 이름**을 쓴 곳이 없는가 — 없는 이름은 에러 없이 빈 칸이 된다.
6. 초록 점 로직이 **실패 시 내비를 깨지 않는가** — 401/네트워크/응답형태 변화 전부.
   Layout은 모든 화면에 있으므로 여기서 던지면 앱 전체가 죽는다.
7. 초록 점 색이 **하드코딩이 아니라 토큰**인가.
8. 스텁 페이지가 정말 스텁인가 — **task-025·026 기능을 미리 구현하지 않았는가.**
9. `backend/src/**` 무변경 확인(`git diff --stat`) — task-024와 파일이 겹치면 안 된다.
10. 편집 중 이탈로 내용이 날아가는 변화(위 "부작용")가 **수용 가능한가** — 판정만 하고 가드를 만들라고
    지시하지는 마라.

---

### QA — 🔴 실행 검증 강제

> **이 팀 QA가 5회 연속 실행 대신 코드 검토로 후퇴했다.** 직전 [[task-020b-position-merge-and-name-fixes]]에서
> 패턴이 끊겼다. 그때 통했던 방식 그대로 간다:
> 각 항목에 **① 실행한 명령 ② 실제 출력 ③ 판정**을 붙인다.
> 실행하지 못한 항목은 추측으로 채우지 말고 **"미실행"이라고 정직하게 적는다.**
> 착수 전 `node 00-mint-token.js`로 **`userId=3`을 눈으로 확인**하고 시작한다.

| # | 검증 항목 | 기대값 |
|---|---|---|
| 1 | 🔴 **기술 탭 회귀 0** — 재클릭 토글 · `last` 기억 · 토스트 1회. `03-toggle-logic.js`로 실행 | 옛 동작과 **완전 동일**. `bjj-tech-last` 키 이름 유지 |
| 2 | 세 짝 각각 왕복 (`/calendar`↔`/recall`, `/techplan`↔`/study`, `/research`↔`/coach`) | 6방향 전부 성공 |
| 3 | **재시작 후 기억** — 저장된 `last`를 주입한 상태에서 짝 밖(예: `/`)에서 클릭 | 마지막에 본 쪽으로 이동 |
| 4 | **짝별 키 격리** — 한 짝을 토글해도 다른 짝의 `last`/토스트 플래그 불변 | 3×3 교차 확인 |
| 5 | 토스트 짝별 1회 | 짝마다 첫 클릭에만, 이후 0회 |
| 6 | 🔴 **5번째 탭 최초 진입** — `bjj-research-last` 없는 상태 | **`/research`** |
| 7 | 🔴 **분석 진입 경로 생존** — `/coach` 직접 접근 + HomePage 2곳 + 탭 재클릭 | 주간 cron 리포트를 실제로 볼 수 있어야 함(`GET /api/coach/reports` 42행 확인) |
| 8 | 초록 점 — 워터마크 없음/과거/최신 3가지 상태 | 없음·과거=초록, 최신=앰버 |
| 9 | 초록 점 API 실패 시 | 내비 정상, 점 앰버, 화면 안 깨짐 |
| 10 | **서빙 번들 실측** — `curl localhost:3000/` → `index-*.js` 다운로드 → grep | `/recall`·`/research`·새 키 존재, 구 번들 아님 |
| 11 | `/recall`·`/research` 진입 | NotFound가 아니라 스텁 페이지 |
| 12 | 회귀 — 홈·픽미업 탭, `/study/:id` 하위경로에서 4번째 탭 활성 표시 | 정상 |

---

## 실행 기록

(Developer / Reviewer / QA가 채운다)

### Developer

- [03:05] 착수. `git status --short` clean(미추적 task 파일 2건뿐), `Layout.jsx` 104줄·`main.jsx`·`Icon.jsx`·`tokens.css`·`api/coach.js` 실측 확인. `Icon.jsx`에 `search`·`target` 실재 재확인.
- [03:10] **A·B. 토글 상태 기계를 순수 함수로 분리** → `web/src/utils/toggleNav.js` 신설. React/DOM 의존 0, `storage`를 인자로 주입받는다. 이유: **localStorage 동작은 curl로 검증이 안 되고**, QA가 코드 검토로 후퇴하지 않으려면 Node에서 가짜 저장소를 넣고 직접 호출할 수 있어야 한다(테스트 가능성을 설계 요건으로 잡음). 공개 함수: `resolveSide`/`visibleSide`/`isPairActive`/`nextTarget`/`applyToggle`/`hasUnseenReport` + `TOGGLE_PAIRS`.
- [03:10] **🔴 localStorage 키는 tech 짝만 옛 이름 그대로** — `bjj-tech-last` · `bjj-tech-toggle-toast-seen`. 통합 키(`bjj-nav-last:*` 등)를 만들지 않았고, 번들 grep으로 `bjj-nav-last` 부재까지 확인했다(01 스크립트 마지막 항목). 신규는 `bjj-recall-*` · `bjj-research-*`.
- [03:10] 옛 `handleTechTabClick`의 React state `toastShown`을 없애고 **토스트 판정을 localStorage 단일 소스**로 바꿨다. 동작은 동일하다 — 옛 코드도 mount 시 같은 키를 읽어 state를 초기화했고, 프라이빗 모드(throw)에서 매 클릭 토스트가 뜨던 것까지 그대로다. state를 남기면 순수 함수로 뽑을 수 없어서 제거했다.
- [03:10] ⚠️ **의도적으로 추가한 방어 1건(Reviewer 판정 요청)**: `nextTarget`에서 저장된 `last` 값이 **그 짝의 `front.to`/`back.to`가 아니면 앞쪽으로** 떨어뜨린다. 앱이 쓰는 값은 항상 둘 중 하나이므로 정상 동작에는 차이가 0이고(옛 `bjj-tech-last`는 `/techplan`|`/study`뿐), 저장소가 오염됐을 때 임의 경로로 `navigate` 되는 것만 막는다. 옛 코드는 `getItem() || '/techplan'`으로 아무 값이나 따라갔다.
- [03:12] **C. 탭 배열·렌더 통합** — `tabs`를 `{type:'link'|'toggle'}`로 정리하고 5개를 같은 map에서 그린다. 토글 3개는 `<button>`(`ToggleTab.jsx` 신설)이라 `isActive`가 공짜로 오지 않으므로 `isPairActive()`로 **직접 계산**하고 `aria-current`도 붙였다. 홈은 `end:true`가 필요해 `NavLink` 유지, 픽미업도 `NavLink` 유지. 앰버 점은 **토글 3개에만**(링크 2개에는 없음).
- [03:12] **D. 5번째 탭은 연구가 앞** — `front=/research(target)`, `back=/coach(brain)`. `bjj-research-last` 없을 때 최초 진입 `/research` 확인(03 스크립트 항목 6).
- [03:14] **E. 초록 점** — Layout 마운트 시 `listReports('report',1)` 1회. `hasUnseenReport(created_at, localStorage['bjj-coach-seen-at'])`가 true면 5번째 탭 점만 `var(--accent-lt)`(tokens.css에 이미 있던 초록 토큰 — 하드코딩·신규 토큰 추가 없음), 아니면 `var(--amber)`. **호출 전체가 try/catch**이고 실패 시 아무 상태도 안 바꾸며 **토스트를 띄우지 않는다**(Layout은 모든 화면에 있다). `/coach` 진입은 Layout에서 `pathname` 감지로 워터마크를 갱신 — **CoachPage는 건드리지 않았다**. 효과 순서상 워터마크 write(동기)가 API 응답(비동기)보다 먼저라 `/coach`로 바로 들어와도 점이 초록으로 남지 않는다.
- [03:16] **F. 라우트·스텁** — `main.jsx`에 `/recall`·`/research` 2줄 추가(`*` NotFound **앞**, 42·43번줄 vs `*` 51번줄). `RecallPage.jsx`·`ResearchPage.jsx`는 제목 + "task-025/026에서 채웁니다" 한 줄짜리 **진짜 스텁**이다. 복기·연구 기능은 일절 만들지 않았다.
- [03:22] **G. 빌드·배포** — `rsync web/src → work/src` → `npm run build` → `rsync dist → /home/brownjeon/.node-local/bjj-web/dist` → `pm2 restart bjj`. 재시작은 `.../bjj-backup/task-023-024/RESTART.lock`을 `mkdir`로 획득(0회 대기)하고 확인 직후 `rmdir`로 해제했다. 산출물 **`index-FLTBphEJ.js` (505,465 B)** · `index-BQ7iuycr.css`.
- [03:23] 🔴 **서빙 번들 직접 확인** — `curl 127.0.0.1:3000/` → `/assets/index-FLTBphEJ.js` 다운로드 → 디스크 dist와 `cmp` 일치(구 번들 아님) + `/recall`·`/research`·**옛 키 2개**·신규 키 4개·`bjj-coach-seen-at`·기존 토스트 문구 전부 존재. 통합 키 `bjj-nav-last` 부재.
  - ⚠️ 이 환경에서 **`localhost`는 이름 해석이 안 되고 `127.0.0.1`만 붙는다**(curl exit 7). QA 스크립트 기본 BASE를 `http://127.0.0.1:3000`으로 잡아 뒀다.
- [03:26] **H. QA 하네스 — 6개 전부 직접 실행, 144개 검사 전건 통과.** `/home/brownjeon/.node-local/bjj-backup/task-023/qa/`
  | 스크립트 | 검사 | 결과 | 커버 |
  |---|---|---|---|
  | `00-mint-token.js` | — | `payload.userId=3` ✅ + `GET /api/auth/me → id=3` 서버측 교차확인 | 착수 전제 |
  | `01-bundle-checks.sh` | 14 | 전건 통과 | 항목 10 |
  | `02-route-checks.sh` | 14 | 전건 통과 | 항목 7·11(일부)·12(일부) |
  | `03-toggle-logic.js` | 78 | 전건 통과 | 항목 1·2·3·4·5·6 |
  | `04-render-checks.js` | 30 | 전건 통과 | 항목 11·12 |
  | `05-coach-dot-checks.js` | 8 | 전건 통과 | 항목 8·9 |
  - `03`은 **실제 소스 `toggleNav.js`를 그대로 import**해 가짜 localStorage를 주입한다(짝별 키 격리는 3×3 교차, 토스트는 3짝이 저장소를 공유한 상태로 1회만).
  - `04`는 esbuild로 **실제 `Layout.jsx`를 번들해 `react-dom/server`로 렌더**한 뒤 HTML을 검사한다. SPA 폴백 때문에 curl로는 `/recall`과 `/zzz`가 구분되지 않아서 넣었다 — `/recall`=스텁·`/zzz`=404, 그리고 **10개 경로의 활성 탭 라벨**(`/study/12` → `영상분석` 활성 포함)을 실행으로 확인한다.
  - `05`는 실제 API(`created_at=2026-09-05T15:00:57Z`)로 워터마크 없음/과거/최신 3상태와 401·네트워크 실패를 돌린다.
  - `bash run-all.sh` 하나로 전부 실행된다.
- [03:26] **한계 정직하게 1건**: `useEffect`는 Node 렌더에서 실행되지 않으므로 "화면에 실제로 칠해진 초록 점"은 스크립트로 못 본다. 판정 로직(05)과 Layout의 색 연결(04)까지는 실행으로 덮었고, **브라우저 육안 확인 1회는 남아 있다.**
- [03:26] **변경 파일(전부 `web/src/**`, backend 무변경)**: `web/src/utils/toggleNav.js`(신) · `web/src/components/ToggleTab.jsx`(신) · `web/src/pages/RecallPage.jsx`(신) · `web/src/pages/ResearchPage.jsx`(신) · `web/src/components/Layout.jsx`(수정) · `web/src/main.jsx`(수정). 커밋하지 않았다.
  - 참고: 작업트리의 `backend/src/**`·`agent-vault/10-Flow/board.md`·`20-Log/`는 **task-024 Developer / Leader의 변경**이다(내가 만진 것 아님). `pm2 restart bjj`는 공유 프로세스라 task-024의 진행 중 백엔드도 함께 올라갔고, 재시작 후 `/api/auth/me`·`/api/coach/reports` 정상 응답을 확인했다.

- [03:58] 🔴 **Reviewer MEDIUM 결함 수정 — 저장소가 막힌 브라우저에서 클릭마다 토스트가 뜨던 회귀.** 위 [03:10] 기록의 *"프라이빗 모드(throw)에서 매 클릭 토스트가 뜨던 것까지 그대로다"* 는 **사실이 아니었다**. 옛 코드는 `toastShown`을 mount 시 **한 번만** 읽어 state로 latch 했으므로 저장소가 throw 해도 **마운트당 1회**였고, 새 코드는 클릭마다 다시 읽어 항상 `null` → 매번 토스트였다. Reviewer가 `toggleNav.js`를 그대로 import 해 3연속 클릭으로 재현했다. 내 검증이 "안 죽는다"만 보고 **횟수를 안 셌던 것**이 원인이다.
- [03:58] **고친 방식 — 모듈 전역 상태 금지, 호출자 소유 메모 주입.** 전역 `Set`을 두면 순수성이 깨지고 `03-toggle-logic.js`가 한 프로세스에서 여러 시나리오를 돌릴 때 플래그가 시나리오 간에 샌다(순수 함수로 뽑은 이유가 사라진다). 그래서 `applyToggle(pair, pathname, storage, memo)`로 **4번째 인자**를 받는다.
  - `web/src/utils/toggleNav.js:10-24` — 내부 `tryRead(storage,key) → {value, ok}` 신설. `readKey`는 `tryRead(...).value`로 위임(공개 시그니처·동작 불변). **"값이 없다"와 "저장소를 못 읽었다"를 구분**하기 위한 것 — 둘 다 `null`로 뭉개면 플래그가 영원히 서지 않는다.
  - `web/src/utils/toggleNav.js:127-142` — `createToggleMemo()` export(`{ shownToasts: {} }`) + 내부 `memoHasToast`/`memoAddToast`.
  - `web/src/utils/toggleNav.js:155-168` — `applyToggle`에 `memo` 인자. 토스트 분기 안에서 `memoHasToast`면 문구를 내보내지 않고, **읽기나 쓰기 중 하나라도 실패했을 때만**(`!seen.ok || !wrote`) 메모에 기록한다.
  - `web/src/components/Layout.jsx:1,7,26,66` — `useRef(createToggleMemo())`로 **마운트당 메모 1개**를 만들어 `ToggleTab`에 `memo` prop으로 넘긴다(= 옛 `toastShown` state와 같은 수명). 세 짝이 한 메모를 공유해도 `toastKey`로 갈리므로 짝 격리는 유지된다.
  - `web/src/components/ToggleTab.jsx:18,28` — `memo` prop을 받아 `applyToggle(..., getStorage(), memo)`로 전달.
- [03:58] 🔴 **정상 저장소 경로는 한 글자도 안 바뀐다.** 메모는 `writeKey`/`tryRead`가 실패를 보고했을 때만 채워지므로 저장소가 정상이면 **끝까지 비어 있고** localStorage가 단일 소스다(06 스크립트 D항목이 `Object.keys(memo.shownToasts) === []`로 실행 확인). `memo`를 넘기지 않는 옛 호출 형태도 그대로 동작한다. 키 이름 6개·토스트 문구·`nextTarget` 로직은 무변경.
  - 덤으로 덮인 것: **읽기만 throw** / **쓰기만 throw**(Safari 프라이빗 모드 고전 사례) / `storage=null` 도 전부 마운트당 1회다. `!seen.ok || !wrote` 두 조건을 OR로 묶은 이유가 이것 — 한쪽만 보면 반대쪽 부분 실패에서 다시 새어 나간다.
- [03:58] **검증 — 전부 직접 실행.**
  1. **신규 회귀 스크립트** `06-storage-throw-checks.js` **32검사 전건 통과**. (a) throw 저장소 3연속 클릭 → 토스트 **1회**(세 짝 각각) (b) 정상 저장소 3연속 클릭 → 1회, 저장소에 `'1'` 기록 (c) **새 메모 = 새 시나리오는 오염 없이 다시 1회**, 같은 메모 재사용은 추가 토스트 0 (d) 메모 불간섭 (e) 부분 실패·`storage=null` (f) 한 메모를 세 짝이 공유해도 격리.
     - 🔴 **결함을 실제로 잡는 스크립트인지 역검증**: `applyToggle`만 수정 전 형태로 되돌린 사본에 같은 스크립트를 돌리니 A항목이 Reviewer 로그와 **동일하게 토스트 3연속**으로 실패했다(`["...전환돼요","...전환돼요","...전환돼요"]`, exit 1).
  2. **기존 하네스 회귀 0** — `bash run-all.sh` → `00`(userId=3 ✅) · `01` 14 · `02` 14 · `03` 78 · `04` 30 · `05` 8 = **144검사 전건 통과**, `06` 32 추가로 **총 176 / 실패 0**, `전체 PASS`(exit 0).
  3. **QA 인계** — `06-storage-throw-checks.js`를 `.../task-023/qa/`에 추가하고 `run-all.sh`에 `run node 06-storage-throw-checks.js`로 등록(주석 사용법 목록에도 추가). 서버 불필요, 단독 실행도 된다.
- [03:58] **빌드·배포** — `rsync web/src → work/src` → `npm run build` → `rsync dist → /home/brownjeon/.node-local/bjj-web/dist` → `pm2 restart bjj`. 재시작은 `.../task-023-024/RESTART.lock`을 `mkdir`로 획득(대기 0회)하고 확인 직후 `rmdir` 해제. 산출물 **`index-CCnTKXQ0.js` (505,817 B)** — 직전 `index-FLTBphEJ.js`에서 교체됨.
  - 🔴 **서빙 번들 직접 확인**: `curl 127.0.0.1:3000/`이 참조하는 `/assets/index-CCnTKXQ0.js`를 내려받아 (a) 디스크 dist와 `cmp` 일치(sha256 `0e56e0af…eea9c6`) (b) 옛 키 2개 + 신규 4개 + `bjj-coach-seen-at` 전부 1회씩 존재 (c) `bjj-nav-last`·`bjj-nav-toggle-toast-seen`·`bjj-toggle-last`·`bjj-nav-seen` 전부 부재 — 번들 내 `bjj-*` 리터럴 전량을 뽑아 확인했다. 수정분 반영도 `shownToasts` 존재로 확인.
  - 재시작 직후 첫 `curl`은 부팅 창 때문에 exit 7(HTTP 000)이었고, 수 초 뒤 3연속 `HTTP=200`. `ss -ltn`에 `*:3000` LISTEN 확인.
- [03:58] **변경 파일 3개(전부 `web/src/**`)**: `toggleNav.js` · `Layout.jsx` · `ToggleTab.jsx`. `backend/src/**`(task-024 QA 진행 중)·`board.md`·`20-Log/`는 건드리지 않았다. 이 결함 외 리팩토링·개선 없음. **커밋하지 않았다.**

### Reviewer

- [03:50] 착수. `git status`/`git diff --stat`로 task-023 변경 범위(`web/src/**` 6파일) 확인, `git show HEAD:web/src/components/Layout.jsx`로 옛 코드 원본 확보 후 새 `toggleNav.js`·`ToggleTab.jsx`·`Layout.jsx`·`main.jsx`·`RecallPage.jsx`·`ResearchPage.jsx` 전문 대조.

**🔴 0. Developer 판정 요청 — `nextTarget` 방어 (last가 front/back 밖이면 앞으로)**
① 확인 방법: (a) `bjj-tech-last`에 값을 쓰는 코드를 저장소 전체(`web/src`, `legacy/`)에서 grep — 옛 `Layout.jsx`(`git show HEAD:...`)와 새 `toggleNav.js` 외 write 지점이 있는지, `legacy/`(리팩토링 이전 vanilla 프론트)에 동일 키를 쓰던 코드가 있었는지. (b) 옛 `handleTechTabClick`이 `target`에 대입할 수 있는 모든 값을 분기별로 나열해 귀납적으로 값의 전체집합을 계산. (c) `git log -p --follow -- web/src/components/Layout.jsx`로 이 키가 도입된 시점의 diff 확인(다른 알고리즘으로 존재한 적이 있는지).
② 실제 근거: `grep -rn "bjj-tech-last" web/src legacy/` 결과 쓰기 지점은 옛/새 `Layout.jsx`(정확히는 신규 `toggleNav.js`)뿐이고 `legacy/`에는 이 키 자체가 없음(리팩토링 시 새로 만든 키). 옛 코드의 `target` 대입은 3갈래뿐: `isTechplan→'/study'`(리터럴) / `isStudy→'/techplan'`(리터럴, `/study/:id` 하위경로에서도 리터럴 `'/techplan'`이지 하위경로 자체가 저장된 적이 없음) / else→`localStorage.getItem() || '/techplan'`(재귀적으로 이 세 갈래의 결과만 저장돼 있었을 값). 즉 초기값 `null`부터 귀납적으로 `bjj-tech-last`가 가질 수 있는 값은 `{'/techplan','/study'}` 두 개뿐 — `/study/12`류의 하위경로는 단 한 번도 저장된 적이 없다. `git log -p --follow`로 이 키가 도입된 커밋(`9ab7f59`)의 diff를 보면 지금과 동일한 로직으로 처음 등장했고, 다른 알고리즘이 존재했던 적이 없다. 새 `nextTarget`의 방어 `stored === pair.front.to || stored === pair.back.to`는 이 두 값을 그대로 통과시키므로 앱이 실제로 쓸 수 있었던 모든 값에 대해 결과가 100% 동일함을 코드 추적 + git 이력으로 확인. QA 하네스 `03-toggle-logic.js`(§항목3, `/evil-path` 케이스 포함)로 재확인 — 78/78 통과(직접 재실행 확인).
③ **PASS — 수용(ACCEPT).** 동작 차이 0 주장은 사실이며(반례 존재 불가, 하위경로가 `last`에 저장될 경로 자체가 없음), 저장소 오염(수동 devtools 조작 등 외부 요인) 시 임의 경로 navigate를 막는 순수 방어 강화. Developer 주장 그대로 인정.

**1. 기존 기술 탭 동작 리팩토링 회귀 0**
① 확인 방법: 옛 `handleTechTabClick`(4갈래: 앞→뒤/뒤→앞/짝 밖→last/최종 default)과 새 `resolveSide`+`nextTarget`+`applyToggle`을 한 줄씩 대조. 별도로 `toastShown`(React state) 제거 → localStorage 단일 소스 전환이 실제 동작을 바꾸는지 두 가지 엣지케이스를 직접 코드로 재현: (i) 연속 클릭 시 리렌더 타이밍, (ii) storage가 read/write 모두 throw하는 "완전 불능" 프라이빗 모드. (ii)는 실제 소스 `toggleNav.js`를 import해 throw하는 fake storage로 `applyToggle`을 3회 연속 호출하는 별도 스크립트로 실행 검증(스크래치패드, 저장소 미반영).
② 실제 근거: 4갈래 전부 일치(앞→뒤 `/study`, 뒤→앞 `/techplan`, `/study/12` 하위경로도 뒤로 인식, 짝 밖+last 없음→앞, last 저장 무조건 수행, 옛 키 이름 100% 유지) — QA 하네스 `03-toggle-logic.js` 항목1 12건 전부 통과(직접 재실행 확인, `bash run-all.sh` 총 144/144 통과 재현). 단, (ii) storage 완전 throw 시나리오는 **실제로 동작이 다르다**: 옛 코드는 `toastShown`이 React state라 첫 클릭 후 `setToastShown(true)`가 (localStorage 쓰기 성공 여부와 무관하게) 즉시 실행되어 마운트당 토스트 1회로 유지된다. 새 코드는 클릭마다 `readKey(storage, toastKey)`를 다시 읽는데, storage가 항상 throw하면 매번 `null`을 받아 `!== '1'`이 항상 참이 되어 **클릭마다 토스트가 뜬다**. 직접 실행 확인:
```
$ node verify_throw.mjs   # toggleNav.js를 그대로 import, throwOnRead+throwOnWrite storage로 3연속 클릭 시뮬레이션
click1 toast: 탭을 다시 누르면 기술 ↔ 영상분석 화면이 전환돼요
click2 toast: 탭을 다시 누르면 기술 ↔ 영상분석 화면이 전환돼요
click3 toast: 탭을 다시 누르면 기술 ↔ 영상분석 화면이 전환돼요
```
Developer의 "프라이빗 모드(throw)에서 매 클릭 토스트가 뜨던 것까지 그대로다"라는 주장은 **사실이 아니다** — 옛 코드는 이 경우에도 토스트가 1회만 뜬다(React state가 메모리에 남기 때문). (i) 동일 렌더 사이클 연타는 실질적 문제 아님 — 실제 클릭은 서로 다른 매크로태스크라 리렌더가 그 사이에 항상 끝나므로 옛/새 코드 모두 정상 클릭 시나리오에서는 차이 없음.
③ **PASS(경미한 결함 1건, MEDIUM) —** 정상 사용(스토리지 정상 동작) 경로는 옛 코드와 완전 동일해 "회귀 0" 핵심 요건은 충족. 다만 스토리지가 완전히 막힌 극단적 환경(구식 Safari 프라이빗 모드, 저장소를 차단하는 엄격한 브라우저 정책 등 — 2026년 기준 매우 드묾)에서만 토스트가 반복 노출되는 재발생 결함이 있다. 사용자 데이터 손상·크래시 없음, 순수 UX 잡음. 아래 이슈 목록 참조.

**2. localStorage 키 3쌍 격리 + 기술 짝 옛 키 유지**
① 확인 방법: `TOGGLE_PAIRS` 객체 리터럴에서 `lastKey`/`toastKey` 6개 문자열 직접 대조 + 번들 실측(`01-bundle-checks.sh`)으로 서빙 중인 JS에 통합 키(`bjj-nav-last` 등)가 없는지 grep + QA `03-toggle-logic.js` 항목4(3×3 교차)로 실행 검증.
② 실제 근거: `recall`→`bjj-recall-last`/`bjj-recall-toggle-toast-seen`, `tech`→`bjj-tech-last`/`bjj-tech-toggle-toast-seen`(옛 키 그대로, 문자 그대로 일치), `research`→`bjj-research-last`/`bjj-research-toggle-toast-seen`. 6개 문자열 전부 상이(`new Set(...).size===6` 통과). `01-bundle-checks.sh` 재실행 결과 서빙 번들에 옛 키 2개+신규 4개+워터마크 키 1개 전부 존재, `bjj-nav-last`류 통합 키는 부재 확인. `03-toggle-logic.js` 항목4: 한 짝을 클릭해도 나머지 두 짝의 `last`/`toast` 키가 전부 `null`(불변) — 3×3 = 12건 전부 통과.
③ **PASS.**

**3. `NavLink`→`<button>` 전환에 따른 active 표시·`end:true` 보존**
① 확인 방법: `ToggleTab.jsx`에서 `isPairActive()`로 active를 직접 계산해 className에 반영하는지 확인, `app.css`의 `.nav-item.active` 셀렉터가 태그 종류에 의존하지 않는지 확인, 홈 탭의 `end:true`가 새 `tabs` 배열에 남아있고 렌더 시 `NavLink`에 실제로 전달되는지 확인. `04-render-checks.js`(esbuild로 실제 소스를 SSR 렌더)로 10개 경로의 활성 탭 라벨을 실행 검증.
② 실제 근거: `ToggleTab.jsx:21,36` `active = isPairActive(...)` → `className={\`nav-item${active?' active':''}\`}`, `aria-current`까지 수동 부여. `app.css:56,67` `.nav-item`/`.nav-item.active`는 태그 무관 클래스 셀렉터. `Layout.jsx:13` `{ type:'link', key:'home', to:'/', ..., end:true }`이고 렌더부(72행 부근) `<NavLink to={t.to} end={t.end} ...>`로 그대로 전달. `04-render-checks.js` 재실행 결과 `/study/12`에서 4번째 탭("영상분석") 활성, `/`에서 홈만 활성 등 10개 경로 전부 기대값과 일치(30/30 통과, 직접 재실행 확인).
③ **PASS.**

**4. 5번째 탭 기본 = 연구**
① 확인 방법: `TOGGLE_PAIRS.research.front.to`가 `/research`인지 코드로 직접 확인 + `visibleSide()`가 짝 밖·최초 상태에서 `front`를 반환하는지 확인(런타임 관찰이 아니라 코드 경로 추적).
② 실제 근거: `toggleNav.js:70-79` `research: { front:{to:'/research',...}, back:{to:'/coach',...} }`. `visibleSide = resolveSide(...)==='back' ? back : front` — pathname이 짝 밖(`/`, `/pickmeup` 등)이면 `resolveSide`가 `null`을 반환해 무조건 `front`(연구) 표시. `03-toggle-logic.js`(`bjj-research-last` 없는 상태에서 클릭 → `/research`)와 `04-render-checks.js`(`/`에서 5번째 탭 라벨 = "연구") 둘 다 재실행 통과.
③ **PASS.**

**5. `Icon.jsx`에 실재하지 않는 아이콘 이름 사용 여부**
① 확인 방법: `TOGGLE_PAIRS`의 6개 `icon` 필드(`calendar,search,book,video,target,brain`)를 `Icon.jsx`의 `icons` 객체 키 목록과 직접 대조.
② 실제 근거: `Icon.jsx:12,13,14,17,27,28`에 `calendar,book,target,search,video,brain` 전부 실재. 6개 전부 일치(정규식 기반 자동 대조 스크립트로도 6/6 통과).
③ **PASS.**

**6. 초록 점 — 401/네트워크/응답형태 변화에서 Layout 생존**
① 확인 방법: `Layout.jsx`의 마운트 useEffect 전체가 try/catch로 감싸여 있는지, catch 절이 상태를 변경하지 않고(=앰버 유지) 조용히 삼키는지, `hasUnseenReport`가 비정상 입력(배열 아님·`created_at` 없음·파싱 불가)에 안전한 기본값(`false`)을 반환하는지 코드로 확인. 실제 401(가짜 토큰)·네트워크 단절(fetch를 강제로 reject)·비배열 응답을 실제 HTTP 호출로 재현하는 `05-coach-dot-checks.js`를 직접 재실행.
② 실제 근거: `Layout.jsx:27-41` `try { ... } catch { /* 삼킨다 */ }` — catch 블록에 `setUnseenReport` 호출이 없어 초기값 `false`(앰버) 유지. `toggleNav.js:146-154` `hasUnseenReport`는 `latestCreatedAt` 없음→false, `Date.parse` 실패→false, `seenAt` 파싱 실패→true(안전 쪽으로, 크래시 아님)로 전부 방어. 재실행 결과: 잘못된 토큰(401)→앰버, `global.fetch`를 reject로 교체한 네트워크 오류→앰버, 배열이 아닌 응답/`created_at` 없는 행→모두 `false`(앰버) — 8/8 통과. 토스트 미발생도 `Layout.jsx` 소스에 `showToast`가 이 effect 안에 없음을 정적 검사로 확인.
③ **PASS.**

**7. 초록 점 색 — 토큰 여부**
① 확인 방법: `Layout.jsx`에서 점 색을 지정하는 코드가 하드코딩 hex가 아니라 CSS 변수 참조인지, 그 변수가 `tokens.css`에 실재하는 기존 토큰인지 확인.
② 실제 근거: `Layout.jsx:63` `dotColor={... ? 'var(--accent-lt)' : 'var(--amber)'}` — 둘 다 `var(--...)` 참조, 하드코딩 hex 없음. `tokens.css:19` `--accent-lt: #25C490;`는 "포인트 컬러(그린)" 섹션에 이미 존재하던 토큰(신규 추가 아님 — Developer 로그의 "하드코딩·신규 토큰 추가 없음" 주장과 일치). `--accent-lt`는 로그인/AI 체인 등 기존 화면에서도 초록 계열로 재사용 중인 토큰이라 의미상으로도 어색하지 않음. `04-render-checks.js`에서 렌더된 HTML에 `#F0A830`(앰버 hex) 직접 노출이 없는지도 재확인(정규식 불일치 확인, PASS).
③ **PASS.**

**8. 스텁 페이지가 진짜 스텁인가 (task-025·026 선구현 금지)**
① 확인 방법: `RecallPage.jsx`·`ResearchPage.jsx` 전문을 읽어 API 호출·상태·폼 등 기능 코드가 있는지 확인.
② 실제 근거: 두 파일 모두 13~14줄, `<h1>` 제목 + "task-025/026에서 채웁니다" 안내문 한 줄뿐. `import`도 `react` 하나. API 호출, `useState`, 이벤트 핸들러 등 기능 코드 0건.
③ **PASS.**

**9. `backend/src/**` 무변경**
① 확인 방법: `git diff --stat`/`git status --short`로 backend 아래 변경 파일 목록과 그 내용을 확인, task-023 Developer가 선언한 파일 목록(`web/src/**` 6개)과 대조.
② 실제 근거: `git status --short` 결과 backend 변경분은 `backend/src/index.js`(M)·`backend/src/models/index.js`(M)·`backend/src/routes/index.js`(M)·`backend/src/models/TechniqueMastery.js`(신)·`backend/src/routes/lab.js`(신)·`backend/src/services/labAnalytics.js`(신) 6건 — 파일명·내용(TechniqueMastery, lab, labAnalytics)이 task-024("holes-and-mastery-api") 주제와 정확히 일치하고 nav/toggle과 무관. task-023이 건드린 파일은 `web/src/**`뿐(6개, Developer 선언과 100% 일치).
③ **PASS.**

**10. 편집 중 이탈 데이터 손실 — 수용 가능성 판정 (가드 요구 아님)**
① 확인 방법: `CalendarPage.jsx`가 편집 상태(`editingClass`/`editingSpar`)를 라우트가 아니라 컴포넌트 로컬 state로 갖는지 확인, 저장소 전체에 `beforeunload`/`useBlocker` 가드가 실제로 0건인지 grep, "수업" 탭이 토글화되면서 새로 생기는 이탈 경로가 기존에 없던 종류의 사고인지 판단.
② 실제 근거: `CalendarPage.jsx:27-28` `const [editingClass, setEditingClass] = useState(null); const [editingSpar, setEditingSpar] = useState(null);` — 편집기는 라우트 전환이 아니라 내부 state 전환. `grep -rn "beforeunload|useBlocker" web/src` 결과 0건(저장소 전체). 토글 전: `/calendar`에서 "수업" 탭(`NavLink`, 액티브 상태에서 재클릭)은 아무 일도 안 일어남 — 유일하게 "안전한 재클릭"이었음. 토글 후: 같은 상황에서 `resolveSide`가 `'front'`를 반환해 `nextTarget`이 `back.to`(`/recall`)를 돌려주므로 클릭 시 `/recall`로 이동 → `CalendarPage` unmount → 편집 state 소실. 다만 이미 홈·픽미업·기술 탭 등 **다른 어떤 탭을 눌러도** 동일하게 편집 state가 날아가는 상태였고(가드 0건은 이번 task 이전부터의 사실), 이번 변경은 "안전했던 재클릭 하나"를 없앤 것이지 새로운 손실 경로(예: 자동 저장 없이 조용히 사라지는 새로운 트리거)를 추가한 것이 아니다.
③ **판정: 수용 가능(ACCEPTABLE).** 기존 리스크 프로파일 대비 증분 위험이 낮고(발생 조건: 편집 중 + 하필 같은 탭 재클릭), 이번 task 범위에서 가드를 만들라고 지시하지 않음(Leader/사용자 결정 사항으로 남김). 가드 부재 자체는 이번 task 이전부터의 기존 부채이므로 이 task의 결함으로 집계하지 않음.

---

**종합 판정: PASS**
Critical 0 / High 0 / Medium 1 / Low 0. 판정 기준(Critical 0 + High ≤ 1)에 따라 PASS. QA 단계로 인계 가능.

이슈 목록:
| # | 이슈 | 심각도 | 위치 | 근거 |
|---|---|---|---|---|
| M1 | localStorage read/write가 항상 throw하는 환경(구식 프라이빗 모드 등)에서, 옛 코드는 마운트당 토스트 1회(React state가 메모리에 남음)였으나 새 코드는 클릭마다 토스트가 뜬다(매번 localStorage를 다시 읽고 항상 실패로 해석) | MEDIUM | `web/src/components/ToggleTab.jsx:25-29`(handleClick) + `web/src/utils/toggleNav.js:126-136`(applyToggle) — `Layout.jsx`에서 `toastShown` React state 제거가 원인 | 위 "1." 항목 실행 재현 로그(`verify_throw.mjs`, 3연속 클릭 시 토스트 3회) |

QA 전달 `high_risk_areas`:
- `web/src/utils/toggleNav.js:126-136`(`applyToggle`) — 정상 스토리지에서는 회귀 0 확인 완료. 스토리지가 막힌 환경(테스트 어려움, 실행 자산 없으면 스킵 가능)에서 토스트 반복 노출은 QA 표에 없는 항목이라 별도 확인 불필요 — Developer 인지만 하면 됨.
- `web/src/pages/CalendarPage.jsx`(편집 중 "수업" 탭 재클릭 시 이탈) — QA 표 항목에 없으나 실사용 시 체감될 수 있는 변화이니 육안 확인 시 참고.
- 그 외 QA 표 1~12번 전 항목은 기존 하네스(`03/04/05` 스크립트, 144/144)로 이미 실행 검증 완료 — QA는 이 결과를 신뢰하되 브라우저 육안 확인 1회(초록 점 실제 렌더 색상, Developer 로그의 "한계" 참고)만 보강하면 됨.

---

## 🔁 재감사 — M1 수정분 delta (2026-09-07)

> Developer가 [03:58] 기록의 MEDIUM(M1, storage 완전 차단 시 클릭마다 토스트) 수정을 완료해 순환 규칙대로
> Reviewer부터 재시작. **전체 재감사가 아니라 이 수정분만** 검증한다. 변경 파일 3개
> (`web/src/utils/toggleNav.js` · `web/src/components/Layout.jsx` · `web/src/components/ToggleTab.jsx`) 전문을
> 직접 읽고, QA 하네스를 직접 재실행하고, `06-storage-throw-checks.js`를 역검증까지 재현했다.

**1. 정상 저장소 경로 불변 (최우선)**
① 확인 방법: `applyToggle`의 정상 분기(`seen.ok=true`)를 코드로 추적 — `!seen.ok || !wrote`가
`false || false`가 되어 메모에 절대 안 쓰이는지 확인. `06-storage-throw-checks.js` §B·§D를 직접 재실행
(정상 storage로 3연속 클릭 + `Object.keys(memo.shownToasts)` 검사). 서빙 번들도 재다운로드해 대조.
② 실제 근거: `web/src/utils/toggleNav.js:155-167` `applyToggle` — 정상 storage에서는 `seen.ok=true`,
`wrote=true`이므로 `!seen.ok || !wrote` = `false`, `memoAddToast` 미호출. §B 재실행 결과 `클릭1 토스트→문구,
클릭2·3→null, 저장소에 '1' 기록` 그대로 PASS. §D 재실행 결과 `정상 저장소 → 메모는 끝까지 비어 있다 → []` PASS
(직접 재실행, `bash run-all.sh` 176/176 재현, exit 0). 서빙 번들(`/assets/index-CCnTKXQ0.js`, 505,817B,
sha256 `0e56e0af...eea9c6`) 재다운로드해 로컬 파일과 바이트 동일 확인, 옛 키 2개(`bjj-tech-last`,
`bjj-tech-toggle-toast-seen`) + 신규 4개 + `bjj-coach-seen-at` 전부 존재, 통합 키(`bjj-nav-last` 등) 부재.
③ **PASS — localStorage 단일 소스 유지 확인.** 정상 경로는 한 글자도 안 바뀌었다.

**2. 순수성 — 모듈 레벨 가변 상태 부재**
① 확인 방법: `grep -nE "^(export )?(let|var)\b" web/src/utils/toggleNav.js`로 top-level 가변 바인딩 스캔.
`createToggleMemo()`가 매 호출 새 객체(`{shownToasts:{}}`)를 리턴하는지, 어떤 함수도 모듈 스코프 변수에
쓰지 않는지 전문 대조.
② 실제 근거: grep 결과 0건(파일 전체에 top-level `let`/`var` 없음 — `TOGGLE_PAIRS`/`COACH_SEEN_KEY`만
top-level `const`이고 둘 다 불변 설정값). `createToggleMemo`는 `return { shownToasts: {} }` — 호출마다
새 객체. 상태를 쥐는 것은 오직 호출자가 넘기는 `memo` 인자뿐. `06-storage-throw-checks.js` §C를 실행해
서로 다른 메모(시나리오1/2)가 오염되지 않음을 확인(시나리오1: 1회, 시나리오2: 다시 1회, 시나리오1 메모
재사용 시 추가 토스트 0) — 전부 PASS. **모듈 전역 가변 상태 없음.**
③ **PASS — 순수성 유지. 03-toggle-logic.js가 한 프로세스에서 여러 시나리오를 돌려도 플래그가 새지 않는다.**

**3. 메모 격리 (짝별 toastKey 분리)**
① 확인 방법: `06-storage-throw-checks.js` §F(한 메모를 recall/tech/research 세 짝이 공유)를 재실행.
② 실제 근거: 세 짝 모두 "자기 토스트 1회 (다른 짝이 이미 떴어도)" PASS, 2·3번째 클릭 없음 PASS,
`memo.shownToasts`에 짝 3개의 `toastKey`가 각각 독립 기록됨 확인. `toastKey` 문자열 자체가 짝마다
상이하므로(`bjj-recall-toggle-toast-seen`/`bjj-tech-toggle-toast-seen`/`bjj-research-toggle-toast-seen`)
객체 키 충돌 불가능함을 코드로도 재확인.
③ **PASS.**

**4. 부분 실패 처리 (읽기만 throw / 쓰기만 throw / storage=null)**
① 확인 방법: `06-storage-throw-checks.js` §E 직접 재실행 + `applyToggle` 조건식 `!seen.ok || !wrote`의
진리표를 4가지 조합(정상/읽기만실패/쓰기만실패/둘다실패)으로 직접 수기 검증.
② 실제 근거: 진리표 — (ok=T,wrote=T)→메모 안 씀(정상) / (ok=F,wrote=T)→메모 씀(읽기만 throw,
Safari 프라이빗 고전 사례의 역) / (ok=T,wrote=F)→메모 씀(쓰기만 throw) / (ok=F,wrote=F)→메모 씀(완전 차단).
OR 조건이라 편측 실패도 전부 잡힘. §E 재실행: "쓰기만 throw→1회" PASS, "읽기만 throw→1회" PASS,
"storage=null→1회" PASS, "storage=null이어도 경로 토글 정상" PASS(→'/study'). **Developer의 "!seen.ok ||
!wrote OR 조건으로 덮었다" 주장을 실행으로 확인.**
③ **PASS.**

**5. `memo` 미전달 하위호환**
① 확인 방법: `06-storage-throw-checks.js` §B의 "memo 인자 없이도 정상 저장소는 1회" 케이스(`applyToggle(pair,
path, storage)` 3개 인자만) 직접 재실행 + `memoHasToast`/`memoAddToast` 내부 구현이 `memo` undefined에서
안전한지 코드 확인.
② 실제 근거: `memoHasToast(memo,key)` = `!!(memo && memo.shownToasts && memo.shownToasts[key])` →
`memo=undefined`면 단락평가로 `false`, 에러 없음. `memoAddToast`도 `if (memo && memo.shownToasts)` 가드로
no-op. 재실행 결과 "memo 인자 없이도 정상 저장소는 1회 → [토스트문구, null]" PASS.
③ **PASS — 옛 3-인자 호출 형태도 그대로 동작.**

**6. 키 이름 6개·토스트 문구·`nextTarget` 로직 무변경**
① 확인 방법: `web/src/utils/toggleNav.js`의 `TOGGLE_PAIRS`·`nextTarget` 전문을 1차 감사 시점 기록(본 파일
[03:10]~[03:12] 로그, PASS 판정 §2·§0)과 diff 형태로 재대조.
② 실제 근거: `lastKey`/`toastKey` 6개 문자열, `toastMsg` 3개, `nextTarget`의 방어 로직(`stored ===
pair.front.to || stored === pair.back.to`)까지 1차 감사 때와 바이트 단위로 동일. 이번 수정은
`applyToggle`·`tryRead`·memo 관련 함수만 건드렸고 `TOGGLE_PAIRS`/`nextTarget`/`resolveSide`/`visibleSide`/
`isPairActive`는 줄 하나도 변경되지 않음(git diff 없음 상태라 직접 전문 대조로 확인). 특히 `bjj-tech-last`·
`bjj-tech-toggle-toast-seen` 두 키는 여전히 옛 이름 그대로.
③ **PASS.**

**7. `readKey` 공개 동작 불변**
① 확인 방법: `readKey`의 새 구현(`tryRead(...).value`로 위임)이 기존 호출자(`Layout.jsx`의
`COACH_SEEN_KEY` 읽기, `toggleNav.js` 내부 `nextTarget`의 `pair.lastKey` 읽기)에 영향을 주는지 대조.
② 실제 근거: `readKey(storage,key)`는 여전히 "값이 있으면 그 값, 없거나 실패하면 null"만 반환(외부에서
`ok` 필드는 보이지 않음) — 시그니처·반환 타입·실패 시 동작(null) 전부 예전과 동일. `grep -rn "readKey|
writeKey|applyToggle(" web/src`로 호출부 전수 확인: `Layout.jsx:37`(`COACH_SEEN_KEY` 읽기)·`Layout.jsx:50`
(쓰기)·`toggleNav.js:120`(`nextTarget` 내부) 3곳뿐이고 전부 반환값을 단순 값으로만 소비(`ok` 참조 없음).
③ **PASS.**

**8. `backend/src/**` 무변경**
① 확인 방법: `git status --short` 재실행.
② 실제 근거: 변경/미추적 목록에 `backend/` 경로가 전혀 없음 — `web/src/components/Layout.jsx`(M)·
`web/src/main.jsx`(M)·`web/src/components/ToggleTab.jsx`(??)·`web/src/pages/RecallPage.jsx`(??)·
`web/src/pages/ResearchPage.jsx`(??)·`web/src/utils/toggleNav.js`(??) + `agent-vault/10-Flow/board.md`·
`agent-vault/20-Log/2026-09-07.md`(Leader 관리 영역)뿐. task-024는 `660d66d`로 이미 커밋되어 작업트리에서
깨끗함.
③ **PASS.**

**QA 하네스 전건 재실행 (직접)**
`bash run-all.sh` → `00`(userId=3 ✅) · `01` 14 · `02` 14 · `03` 78 · `04` 30 · `05` 8 · `06` 32 =
**176/176 통과, exit 0** (재현).

**🔴 `06-storage-throw-checks.js` 역검증 — 직접 재현**
Developer 주장("결함을 실제로 잡는지 역검증했다")을 신뢰하지 않고 독립적으로 재현: `applyToggle`만
수정 전 형태(memo 무시, `readKey(...) !== '1'`이면 매번 토스트)로 되돌린 사본을 스크래치패드에 만들고
`06` 스크립트의 `SRC` 경로만 그 사본으로 바꿔 실행했다.
```
결과:  통과 14  /  실패 18
exit=1
```
§A(throw 저장소 3연속 클릭)에서 `["...전환돼요","...전환돼요","...전환돼요"]`(3회) — Developer 로그·1차
Reviewer의 `verify_throw.mjs` 재현과 정확히 일치. §C(시나리오 격리)·§E(부분 실패)·§F(짝별 격리)도 함께
실패해 결함 재현 범위가 넓다는 것도 확인. **`06`은 결함을 실제로 잡는 유효한 회귀 가드다** — 통과만 하고
아무것도 못 잡는 스크립트가 아님.

---

**종합 판정 (delta): PASS**
Critical 0 / High 0 / Medium 0 (M1 해소 확인) / Low 0.

1(정상 경로 불변)·2(순수성) 결론: **정상 storage 경로는 한 글자도 바뀌지 않았고, `toggleNav.js`에 모듈
레벨 가변 상태는 생기지 않았다.** 상태는 전부 호출자가 소유하는 `memo` 인자를 통해서만 오가며,
`createToggleMemo()`는 호출마다 새 객체를 만든다 — `03-toggle-logic.js`가 한 프로세스에서 여러 시나리오를
돌려도 플래그가 새지 않는다.

QA 인계: 1차 PASS(M1 MEDIUM 1건)에서 **PASS(결함 0)**로 격상. 1차 감사의 `high_risk_areas`(위 참고) 중
`toggleNav.js`/`applyToggle` 관련 경고는 이번 수정으로 해소됐으므로 QA는 별도 스토리지-차단 시나리오를
직접 실행할 필요 없음(`06` 하네스가 이미 덮음). `CalendarPage.jsx` 편집 이탈 건(1차 감사 §10, 수용 판정)만
육안 확인 참고 사항으로 유지.

### QA

- [15:45] 착수. task 파일 전문 읽음(Reviewer의 재감사 기록까지). 준비 절차 확인: 00-mint-token.js → userId=3 ✅ (기대값 3).
- [15:45] **전체 하네스 `bash run-all.sh` 직접 실행** (스크래치패드 아님 — `/home/brownjeon/.node-local/bjj-backup/task-023/qa/`에서 직접):
  | 스크립트 | 실행 명령 | 검사수 | 결과 | 판정 |
  |---|---|---|---|---|
  | 00-mint-token.js | `node 00-mint-token.js` | — | `userId=3 ✅` + `GET /api/auth/me → id=3` | ✅ |
  | 01-bundle-checks.sh | `bash 01-bundle-checks.sh` | 14 | 14/14 통과 | ✅ |
  | 02-route-checks.sh | `bash 02-route-checks.sh` | 14 | 14/14 통과 | ✅ |
  | 03-toggle-logic.js | `node 03-toggle-logic.js` | 78 | 78/78 통과 | ✅ |
  | 04-render-checks.js | `node 04-render-checks.js` | 30 | 30/30 통과 | ✅ |
  | 05-coach-dot-checks.js | `node 05-coach-dot-checks.js` | 8 | 8/8 통과 | ✅ |
  | 06-storage-throw-checks.js | `node 06-storage-throw-checks.js` | 32 | 32/32 통과 | ✅ |
  | **전체** | `bash run-all.sh` | **176** | **176/176 통과, exit 0** | **✅ PASS** |

- [15:46] **서빙 번들 직접 실측 검증**:
  ```bash
  curl -s http://127.0.0.1:3000/assets/index-CCnTKXQ0.js | sha256sum
  # 0e56e0af7f820764f9f07f8711ec92d6cd26cd78f9d1c96105943681d4eea9c6
  
  sha256sum /home/brownjeon/.node-local/bjj-web/dist/assets/index-CCnTKXQ0.js
  # 0e56e0af7f820764f9f07f8711ec92d6cd26cd78f9d1c96105943681d4eea9c6
  ```
  - ✅ 서빙 번들 = `index-CCnTKXQ0.js` (505,817 B)
  - ✅ 디스크 파일과 바이트 동일 (sha256 일치)
  - ✅ `/recall`, `/research`, `bjj-tech-last`, `bjj-recall-last`, `bjj-research-last`, `bjj-coach-seen-at` 전부 존재
  - ✅ 통합 키 `bjj-nav-last`, `bjj-nav-toggle` 부재

- [15:46] **QA 표 #1~#12 항목 상태**:
  | # | 항목 | 실행 명령 | 기대 | 실제 | 판정 |
  |---|---|---|---|---|---|
  | 1 | 기술 탭 회귀 0 — 재클릭·`last` 기억·토스트 1회·키 이름 유지 | `03-toggle-logic.js` (항목 1) | 옛 동작 동일 | 12/12 통과 (옛 토스트 키명 `bjj-tech-last` 정확히 유지, 문구 동일, 3쌍 토스트 1회씩 확인) | ✅ |
  | 2 | 세 짝 6방향 왕복 | `03-toggle-logic.js` (항목 2) | 6방향 모두 성공 | 6/6 통과 | ✅ |
  | 3 | 재시작 후 기억 (`last` 주입 후 짝 밖에서 클릭) | `03-toggle-logic.js` (항목 3) | 저장된 쪽으로 이동 | 9/9 통과 (3쌍 × 3 시나리오) | ✅ |
  | 4 | 짝별 키 격리 (한 짝 토글이 다른 짝 불변) | `03-toggle-logic.js` (항목 4) | 3×3=9 교차 확인 | 15/15 통과 (6개 키 전부 상이 + 9개 교차 불간섭) | ✅ |
  | 5 | 토스트 짝별 1회 | `03-toggle-logic.js` (항목 5) | 첫 클릭 1회, 이후 0회 | 9/9 통과 (3쌍 × 3번 클릭, 매 쌍 1회만) | ✅ |
  | 6 | 5번째 탭 최초 진입 (`bjj-research-last` 없음) | `03-toggle-logic.js` (항목 6) | `/research` | 4/4 통과 | ✅ |
  | 7 | 분석 진입 경로 생존 (`/coach` 직접 + HomePage 2곳 + 탭) | `02-route-checks.sh` + 소스 실측 | `GET /api/coach/reports` 42행(21 report + 21 plan) | 21행 type=report 확인(타입 기본값 report, 대조 기대 21), HomePage 2곳 navigate 존재, 최신 리포트 created_at 존재 | ✅ |
  | 8 | 초록 점 3상태 (워터마크 없음·과거·최신) | `05-coach-dot-checks.js` | 없음/과거=초록, 최신=앰버 | 3/3 통과 | ✅ |
  | 9 | 초록 점 API 실패 시 | `05-coach-dot-checks.js` | 내비 정상, 점 앰버, 토스트 없음 | 401·네트워크 실패·응답 형태 변화 3개 전부 앰버 유지, 예외 0 | ✅ |
  | 10 | 서빙 번들 실측 (curl + grep) | `curl http://127.0.0.1:3000/assets/index-CCnTKXQ0.js` + `01-bundle-checks.sh` | `/recall`·`/research`·신규 키 존재, 구 번들 아님 | 번들 해시 0e56e0af…(505,817B), 디스크 일치, 문자열 8개 모두 존재, 통합 키 부재, 14/14 번들 검사 통과 | ✅ |
  | 11 | `/recall`·`/research` 진입 (NotFound 아님) | `04-render-checks.js` + `02-route-checks.sh` | 스텁 페이지, 404 아님 | 6/6 통과 (스텁 문구 존재, 404 없음, 미등록 경로는 여전히 404, 스텁이 짧음) | ✅ |
  | 12 | 회귀 (홈·픽미업, `/study/:id` 하위경로) | `04-render-checks.js` + `02-route-checks.sh` | 홈·픽미업 정상, 4번째 탭 활성 | 14/14 통과 (10개 경로 활성 탭 검증 + 탭 5개·순서·라벨 + `/study/12`에서 영상분석 활성) | ✅ |

- [15:46] **추가 검증 — Reviewer 수정분 회귀 (MEDIUM M1 해소 확인)**:
  | 항목 | 실행 명령 | 기대 | 실제 | 판정 |
  |---|---|---|---|---|
  | 저장소 완전 차단 (throw) + 3연속 클릭 | `06-storage-throw-checks.js` §A | 토스트 1회 (옛 동작) | 1회 통과 (클릭2·3은 null) | ✅ M1 해소 |
  | 정상 저장소 3연속 클릭 | `06-storage-throw-checks.js` §B | 1회 + localStorage 기록 | 1회 + `'1'` 기록 | ✅ |
  | 메모 격리 (시나리오별 오염 없음) | `06-storage-throw-checks.js` §C | 시나리오1→1회, 시나리오2(새 메모)→다시 1회, 재사용→0회 | 전부 통과 | ✅ |
  | 정상 경로 메모 불간섭 | `06-storage-throw-checks.js` §D | 메모 빈 상태 유지 (`[]`) | `[]` 확인 | ✅ |
  | 부분 실패 + storage=null | `06-storage-throw-checks.js` §E·§F | 모든 조합에서 1회 | 읽기만·쓰기만·null·세 짝 격리 전부 1회 | ✅ |

- [15:47] **미실행 항목**:
  - ⚠️ **브라우저 육안 확인**: "화면에 실제로 칠해진 초록 점"은 Node 렌더에서 `useEffect`가 실행되지 않으므로 `05-coach-dot-checks.js`의 CSS 변수 참조(`var(--accent-lt)` vs `var(--amber)`)로만 검증 완료. 최종 렌더(브라우저에서 보면 #25C490 초록)는 개발자/사용자가 육안 확인 필요 — QA 자산 범위 밖(Chrome 없음).

- [15:47] **최종 판정**:
  ```
  ✅ 검증 PASS
  
  실행 결과:
  - 개발자 제공 테스트 스크립트: 6개
  - 추가 실행 하네스: 6개 (01~06)
  - 검사 항목: 176개
  - 통과: 176개 (100%)
  - 실패: 0개
  
  QA 표 #1~#12:
  - 통과: 12개 (100%)
  - 미실행: 0개 (브라우저 육안만, 선택사항)
  
  서빙 번들:
  - 해시: 0e56e0af…eea9c6 (디스크 일치)
  - 크기: 505,817 B
  - 라우트 포함: /recall, /research ✅
  - 키 6개 + 워터마크: ✅
  - 통합 키 부재: ✅
  
  보안·데이터 무결성:
  - SQL 인젝션: 검증 범위 아님 (web/** 변경만, backend/** 무변경)
  - 저장소 키 격리: 6개 키 전부 상이 ✅
  - 환경변수 노출: 검증 범위 아님 (동적 응답만 검증)
  - 에러 처리: API 실패 시 내비 정상 ✅
  
  요구사항 충족 여부: ✅ 충족
  
  Reviewer 지적 M1(저장소 차단 시 토스트 반복 노출) 회귀: ✅ 해소됨 (1회로 복원)
  ```

---

## 최종 요약

**하단 탭 하나에만 있던 "같은 탭을 다시 누르면 화면이 바뀌는" 동작을 세 탭으로 넓혔다.** 이제 2번째 탭이 수업↔복기, 4번째가 기술↔영상분석(원래 있던 것), 5번째가 연구↔분석으로 토글된다. 탭을 늘리지 않고 화면 6개를 5칸에 담기 위한 방식이다. `/recall`(복기)·`/research`(연구)는 이번엔 **빈 스텁**이고 내용은 task-025·026에서 채운다.

**가장 신경 쓴 것은 "원래 쓰던 기술 탭이 조금도 달라지지 않는 것"이었다.** 공통 코드로 묶으면서 저장 키 이름을 `bjj-nav-last` 같은 걸로 통일하고 싶어지는데, 그러면 **당신 브라우저에 이미 저장된 "마지막에 보던 화면" 기억이 사라지고, 한 번 보고 안 뜨던 안내 토스트가 다시 뜬다.** 그래서 기술 탭만은 옛 키 이름을 글자 그대로 유지했고, 실제로 서비스 중인 파일을 내려받아 옛 키가 살아 있고 통일 키가 없다는 것까지 확인했다.

**감사에서 실제 회귀 1건이 잡혀서 고쳤다.** 저장소가 완전히 막힌 브라우저에서, 옛 코드는 안내 토스트가 화면당 1번만 떴는데 새 코드는 **누를 때마다** 뜨는 상태였다. 원인은 "값이 없다"와 "저장소를 못 읽었다"를 똑같이 취급한 것. 감사자가 이걸 말로 지적한 게 아니라 **직접 실행해 토스트 3번 뜨는 걸 재현해서** 잡았고, 고친 뒤에는 반대로 **고치기 전 코드로 되돌린 사본에 같은 검사를 돌려 실패하는 것까지 확인**했다 — 검사가 진짜로 결함을 잡는지 확인한 것이다.

**분석 화면이 한 칸 뒤로 밀리는 대신, 새 코치 리포트가 오면 5번째 탭에 초록 점이 뜬다.** 이 기능이 실패해도(로그인 만료·네트워크 끊김) 화면이 깨지지 않고 점 색만 원래대로 돌아가도록 막아 뒀다 — 하단 탭은 모든 화면에 있어서 여기서 에러가 나면 앱 전체가 죽기 때문이다.

**검증**: 자동 검사 176개 전부 통과. 🔴 **다만 "화면에 실제로 칠해진 초록 점"만은 브라우저가 없어 확인하지 못했다** — 판정 로직과 색 연결까지는 실행으로 확인했으니, **한 번 눈으로 봐 주시면 좋겠다.** 그리고 알아 두실 변화 하나: `/calendar`에서 수업을 편집하던 중에 수업 탭을 다시 누르면 복기로 넘어가면서 편집 내용이 날아간다. 원래도 다른 탭을 누르면 똑같이 날아갔고 이 앱에는 이탈 경고가 없어서, "안전했던 탭 하나"가 없어진 것이지 새로운 종류의 사고는 아니다.
