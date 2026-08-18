---
name: task-003-profile-training-days-multi-affiliation
aliases: ["profile-training-days", "multi-affiliation", "소속-다중"]
tags:
  - type/task
  - domain/profile
related_tasks:
  - "[[task-002-email-auth-multiuser]]"
status: done
created: 2026-08-18
updated: 2026-08-18
---

# task-003 — 프로필: 수련일수 표시 + 소속 다중 등록

## 목표

프로필 화면에 두 가지 기능을 추가한다.
1. **수련일수**: `profile.start_date`(시작일)로부터 오늘까지 경과한 일수를 계산해 표시한다. 기존 통계 카드 "수련"(출석 기록 기반 unique 수련일)과는 다른 값이므로 혼동 없게 라벨을 구분한다.
2. **소속 다중 등록**: 현재 `network` 단일 문자열 필드를 여러 개 등록 가능하도록 확장한다(칩 형태로 추가/삭제).

## 관련 과거 이력 요약

- [[task-002-email-auth-multiuser]]: `profile` 테이블에 `user_id` 컬럼 추가 완료, 계정별 격리 적용됨. 이번 작업은 그 위에서 `profile` 테이블 컬럼을 추가로 확장하는 것이라 인증/격리 로직은 건드릴 필요 없음.

## 현재 구조 (Leader 사전 조사)

- `backend/src/models/Profile.js` — `network: STRING(100)` 단일 필드
- `backend/src/routes/profile.js` — `GET/PUT /profile` (raw row 그대로 응답, PUT은 `nickname/startDate/weightClass/network` 받음)
- `web/src/pages/ProfilePage.jsx` — 헤더에 `시작 {start_date} · {network}` 표시, "기본 정보" Row에 `소속: {network}`, `ProfileEditor`에 `network` 단일 input
- `web/src/api/profile.js` — `getProfile/updateProfile`은 profile 객체 그대로 통째로 주고받음 (필드 추가 시 API 함수 시그니처 변경 불필요)
- 이 프로젝트는 다중값 필드를 다룰 때 `TEXT` 컬럼에 JSON 배열을 문자열로 저장하는 컨벤션을 이미 쓰고 있다. 참고: `backend/src/routes/techniques.js`의 `pos`(단일, 레거시 호환용 유지) + `positions`(배열, TEXT 컬럼에 JSON.stringify) 패턴 — `parsePos()`/`posToJson()` 헬퍼 형태. 신규 `networks` 필드도 동일한 패턴을 따른다.
- 마이그레이션은 별도 migration 파일 체계 없이 `backend/src/index.js` 서버 시작 시 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` 인라인 실행 방식 (예: `ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS position TEXT DEFAULT '[]'`). 새 컬럼도 이 블록에 같은 방식으로 추가한다.

## 역할별 지시사항

### Developer

**1. 수련일수 (백엔드 변경 불필요, 프론트만)**
- `ProfilePage.jsx`에서 `profile.start_date`가 있으면 오늘까지 경과일수(`Math.floor((today - startDate) / 86400000) + 1` 형태, 시작일 당일을 1일차로 카운트)를 계산.
- 기존 "시작 {date}" 헤더 라인 옆에 자연스럽게 노출 (예: "시작 2024-01-01 · 456일째"). 기존 스타일(폰트 크기 12, `var(--text2)`) 유지, 새 배지 컴포넌트 남발하지 말고 기존 헤더 라인에 자연스럽게 붙일 것.
- `start_date`가 없으면 기존처럼 표시 안 함(현재 로직 유지).
- 기존 통계 카드 4칸("수업/수련/기술/체급")은 그대로 둔다 — "수련"은 출석 기반 값이라 의미가 다르므로 대체하지 않는다.

**2. 소속 다중 등록**
- `backend/src/models/Profile.js`: `network` 필드는 레거시 호환용으로 유지하고, `networks: { type: DataTypes.TEXT }` 필드 추가.
- `backend/src/index.js` 마이그레이션 블록에 `ALTER TABLE profile ADD COLUMN IF NOT EXISTS networks TEXT DEFAULT '[]'` 추가 (기존 패턴과 동일 위치/스타일).
- `backend/src/routes/profile.js`:
  - `techniques.js`의 `parsePos`/`posToJson`과 동일한 형태로 `parseNetworks(raw)` / `networksToJson(networks, network)` 헬퍼 작성 (레거시 `network` 단일값도 배열로 흡수).
  - `GET /profile`: 응답에 `networks` 배열 필드 추가 (파싱해서 내려줌). 기존 `network` 필드도 하위호환을 위해 그대로 유지(첫 번째 항목 또는 기존 값).
  - `PUT /profile`: body에 `networks`(배열) 받아 저장. `network` 단일 필드는 더 이상 프론트에서 보내지 않지만, 레거시 클라이언트 호환을 위해 `network`만 오는 경우도 헬퍼로 흡수.
- `web/src/pages/ProfilePage.jsx`:
  - 헤더 라인과 "기본 정보" Row의 "소속" 표시를 `networks` 배열 join(' · ')로 변경 (없으면 기존처럼 "-" 또는 안내 문구).
  - `ProfileEditor`: 소속 단일 input을 칩 추가/삭제 UI로 교체 — 텍스트 input + "추가" 버튼(또는 Enter 키)으로 `networks` 배열에 추가, 각 칩에 × 삭제 버튼. 기존 `BeltEditor`/`MembershipEditor`의 버튼·칩 스타일 톤(테두리·라운드·색상 변수)을 따라갈 것, 새 디자인 언어 만들지 말 것.
  - 저장 시 `onSave(form)`의 `form.networks`로 배열 전달, `network` 필드는 더 이상 전송하지 않아도 됨(백엔드가 흡수).

**범위 제한**: belt/membership처럼 별도 테이블+CRUD 라우트를 새로 만들지 말 것 — 소속은 이름 외 부가 정보(가입일 등)가 필요하다는 요구가 없으므로 문자열 배열 하나로 충분하다. 과설계 금지.

작업 완료 후 이 파일 "Developer 기록" 섹션에 변경 파일 목록과 실제 사용한 컬럼/응답 스키마를 기록할 것.

### Reviewer

Developer 완료 후:
- 마이그레이션 안전성(기존 `network` 값 데이터 유실 없는지, `ADD COLUMN IF NOT EXISTS` 멱등성 확인)
- `parseNetworks`/`networksToJson` 등 JSON 파싱 헬퍼의 예외 처리(손상된 JSON, null, 빈 문자열)
- `PUT /profile`이 `networks`만 오는 케이스 / `network`만 오는 레거시 케이스 / 둘 다 없는 케이스 모두 안전한지
- 프론트 칩 UI가 중복 입력·빈 문자열 추가를 막는지

### QA

Reviewer PASS 후:
- 기존 `network` 값이 있던 계정(admin)의 GET /profile 응답에 `networks` 배열이 정상 포함되는지 확인
- 프로필 편집에서 소속 2개 이상 추가 → 저장 → 새로고침 후에도 유지되는지
- 소속 칩 삭제 후 저장 → 정상 반영되는지
- start_date 설정/미설정 두 경우 모두 프로필 헤더 렌더링 확인 (수련일수 표시 여부)
- pm2 재시작 후(`pm2 restart bjj`) 마이그레이션이 에러 없이 실행되는지 로그 확인 (`pm2 logs bjj`)

## Developer 기록

- [10:40] 변경 파일 4개
  - `backend/src/models/Profile.js` — `networks: { type: DataTypes.TEXT }` 필드 추가. 레거시 `network: STRING(100)`은 그대로 유지.
  - `backend/src/index.js` — 마이그레이션 블록(technique_chains.video_path 추가 직전)에 `ALTER TABLE profile ADD COLUMN IF NOT EXISTS networks TEXT DEFAULT '[]'` 1줄 추가. 기존 인라인 마이그레이션 스타일 동일(`.catch(() => {})`).
  - `backend/src/routes/profile.js` — 소속 JSON 헬퍼 3종 + GET/PUT 수정.
  - `web/src/pages/ProfilePage.jsx` — 수련일수 계산·헤더 표시, 소속 배열 표시, ProfileEditor 칩 UI.
- [10:45] 컬럼/스키마 — DB `profile.networks` TEXT DEFAULT '[]' (JSON 배열 문자열). 별도 테이블·CRUD 라우트 신설 없음(범위 준수).
- [10:45] 헬퍼(techniques.js `parsePos`/`posToJson` 패턴 준수)
  - `cleanNetworks(list)` — trim + 빈값 제거 + 중복 제거
  - `parseNetworks(raw)` — JSON 배열/단일값/손상 JSON/빈 문자열 모두 흡수해 배열 반환
  - `networksToJson(networks, network)` — 배열 없으면 레거시 단일 `network` 흡수 → JSON 문자열
  - `rowNetworks(row)` — row.networks 우선, 비어 있으면 레거시 row.network 흡수 (기존 데이터 무손실 표시)
- [10:45] `GET /api/profile` 응답 스키마 — 기존 raw row + 아래 2개 필드 가공
  - `networks`: `string[]` (신규, 항상 배열. 값 없으면 `[]`)
  - `network`: `string` (하위호환. `networks[0] || ''`로 정규화해서 내려감)
  - 실제 응답 예: `{"id":1,"nickname":"미라클펭귄","start_date":"2025-06-02","weight_class":"82.3kg","network":"인네이트 불광","networks":["인네이트 불광"],"avatar":"/uploads/avatar.jpg","user_id":3}`
- [10:45] `PUT /api/profile` — body에 `networks`(배열) 수신. 저장 시 `networks`(JSON 문자열) + 레거시 `network`(=`networks[0]`, 100자 slice) 동시 갱신. `networks`/`network` 둘 다 미전송이면 기존 소속 유지(레거시 클라이언트 데이터 보호). 응답은 기존과 동일 `{ ok: true }` (스펙 변경 없음).
- [10:50] 프론트 — `profile.networks` 배열 우선, 없으면 `profile.network` 흡수해 `networks` useMemo 구성. `trainingDays` useMemo는 `start_date` 로컬 자정 기준 `Math.floor(diff/86400000)+1`(시작일=1일째), 미설정·잘못된 날짜·미래 날짜면 `null`로 미표시. 헤더는 기존 12px/`var(--text2)` 한 줄 유지: `시작 2025-06-02 · N일째 · 소속A · 소속B`. 통계 4칸("수업/수련/기술/체급")은 손대지 않음. "기본 정보" Row 소속은 `networks.join(' · ')`.
- [10:50] ProfileEditor — 소속 단일 input → `input + [추가] 버튼(Enter 지원)` + 칩 목록(× 삭제). 칩 스타일은 기존 톤 재사용(`var(--accent-dim)` 배경 / `1px solid var(--accent)` / radius 8 / 12px·600). 빈 문자열·중복 추가 차단, 저장 시 입력창에 남은 값도 함께 반영. 저장 payload는 `{nickname, startDate, weightClass, networks}` — `network` 미전송(백엔드가 흡수).
- [10:55] 백엔드 재기동 — `pm2 restart bjj` 후 마이그레이션 정상 완료(약 30초 소요, MODIFY COLUMN 다수 때문). `pm2 logs bjj` 에러 없음, `[bjj-new] listening on :3000` 확인. `information_schema` 확인 결과 `profile.networks:text` 생성됨.
- [10:55] API 직접 검증(로컬 JWT 발급 후 curl) — ① 기존 `network`만 있던 계정 GET → `networks:["인네이트 불광"]` 정상 흡수 ② PUT `["인네이트 불광","  ","인네이트 불광","테스트지부"]` → 저장 결과 `["인네이트 불광","테스트지부"]`(공백·중복 제거 확인) ③ `networks` 미전송 PUT → 기존 소속 유지 확인 ④ 원상복구 PUT 완료(테스트 잔여 데이터 없음).
- [11:00] 프론트 빌드/배포 — CLAUDE.md 절차대로 `web/src` → `/home/brownjeon/.node-local/bjj-web/work/src` rsync → `npm run build`(vite 5.4.21, 142 modules, 성공) → `dist/` → `/home/brownjeon/.node-local/bjj-web/dist/` rsync → `pm2 restart bjj`. 서빙 번들 `assets/index-D8GGs3tu.js`에 신규 문자열("일째", "여러 개 등록 가능") 포함 확인, `curl -sI http://localhost:3000/` 200 OK.
- [11:00] QA용 테스트 환경 — 서버 http://localhost:3000 (pm2 `bjj` 실행 중). 브라우저 로그인 후 프로필 화면에서 ①헤더 "시작일 · N일째 · 소속" ②소속 2개 이상 추가/삭제 후 저장→새로고침 유지 ③시작일 미설정 계정 렌더링 확인 필요.

## Reviewer 기록

- [11:05] 판정: **PASS** (Critical 0 / High 0 / Medium 0 / Low 3, 의견 수준)
- [11:05] 검토 파일 4개(`backend/src/models/Profile.js`, `backend/src/index.js` 마이그레이션 블록, `backend/src/routes/profile.js`, `web/src/pages/ProfilePage.jsx`) 전부 직접 읽고 검증함.
- [11:05] ① 마이그레이션 안전성 — `ALTER TABLE profile ADD COLUMN IF NOT EXISTS networks TEXT DEFAULT '[]'`, 기존 `video_clips.position` 등과 동일 스타일/위치, `.catch(() => {})` 동일 패턴. 레거시 `network` 컬럼은 MODIFY/DROP 없이 그대로 유지되어 데이터 유실 경로 없음. `ADD COLUMN IF NOT EXISTS`는 이 프로젝트에서 이미 십수 회 검증된 멱등 패턴. 문제 없음.
- [11:05] ② JSON 파싱 헬퍼 예외 처리 — `parseNetworks`가 null/빈문자열('' → `!raw` 가드)/손상 JSON(catch 블록)/배열 아닌 값(JSON.parse 성공 시 `Array.isArray` 분기, 실패 시 catch에서 단일값 흡수) 모두 예외 던지지 않고 안전하게 처리함. `cleanNetworks`는 `Array.isArray` 가드 + `String(n ?? '')`로 null/undefined 원소도 안전 처리. GET/PUT 라우트 모두 `wrap()` 경유라 혹시 모를 예외도 서버 다운으로 이어지지 않음. 문제 없음.
- [11:05] ③ `PUT /profile` 3케이스 — 코드상 `(networks !== undefined || network !== undefined)`로 "필드 생략(기존 값 유지)"과 "명시적 빈 값 전송(초기화)"을 구분하고 있음이 확인됨. `networks:[]` 또는 `network:''`를 명시적으로 보내면 실제로 소속이 빈 배열로 정상 초기화되고, 둘 다 아예 안 보내면 `rowNetworks(row)`로 기존 값 유지됨(레거시 클라이언트 보호). row가 없는 신규 프로필 케이스(`row?.networks`/`row?.network` 옵셔널 체이닝)도 크래시 없이 빈 배열로 안전 처리됨. 과제 지시에서 우려한 "레거시 클라이언트가 소속을 비우고 싶을 때" 시나리오는 막혀있지 않음 — 의도된 설계이자 정상 동작함.
- [11:05] ④ 프론트 칩 UI — `addNetwork()`가 `trim()` 후 빈 문자열/중복을 모두 차단(공백만 입력 시 trim 후 빈 문자열이 되어 차단됨, 요청된 엣지케이스 포함). `submit()` 시 입력창에 남은 값도 동일한 trim/dedup 규칙을 거쳐 반영됨. 문제 없음.
- [11:05] ⑤ `trainingDays` 날짜 경계 — 시작일 당일=1일째, 미래 날짜/파싱 실패(`isNaN` 가드) 시 `null` 처리 모두 스펙대로 동작 확인. **의견(Low)**: `new Date("YYYY-MM-DD")` 형태 파싱은 ECMAScript 스펙상 UTC 자정으로 해석되므로, UTC보다 느린(음수 오프셋) 타임존에서는 `setHours(0,0,0,0)` 적용 후 달력 날짜가 하루 밀릴 수 있는 이론적 여지가 있음. 다만 같은 파일의 기존 `daysRemaining()` 함수가 이미 동일 패턴을 쓰고 있고(이번 작업이 새로 만든 패턴이 아님), 앱 사용자가 KST(UTC+9, UTC보다 빠른 오프셋) 기준이라 실제로는 날짜가 밀리지 않음 — 수정 불필요, 참고만.
- [11:05] ⑥ 기존 컨벤션 일관성 — `parseNetworks`/`networksToJson`은 `techniques.js`의 `parsePos`/`posToJson` 패턴(레거시 단일값+배열 TEXT 컬럼 JSON 저장)을 그대로 따름. 프론트 칩 스타일도 `var(--accent-dim)`/`var(--accent)`/`radius 8` 등 BeltEditor·MembershipEditor와 동일 톤 재사용, 새 디자인 언어 도입 없음. **참고**: `profile.js`는 `respond.js`의 `ok()/fail()` 표준 응답 헬퍼 대신 raw `res.json()`을 쓰는데, 이는 이번 작업이 새로 만든 것이 아니라 이 파일이 원래(task-003 이전부터) 쓰던 기존 패턴 — 이번 변경 범위 밖의 기존 기술부채이므로 이번 리뷰의 FAIL 사유로 삼지 않음.
- [11:05] **참고(Low, 의견)**: `PUT /profile`에서 `networksToJson()`으로 이미 정제된 JSON 문자열을 만든 뒤 곧바로 `parseNetworks()`로 재파싱하는 왕복 호출이 있음 — 기능상 문제는 없으나(항상 유효한 JSON을 즉시 되파싱하는 것이라 catch 분기 진입 불가) 배열을 직접 만드는 것보다 한 단계 우회함. 리팩토링 시 참고할 만한 사소한 스타일 개선 여지.
- [11:05] 종합: 치명적/사용자 영향 버그 없음. QA로 인계 가능.

## QA 기록

- [14:32] **검증 결과: PASS**
  - ① pm2 로그: 마이그레이션 에러 없음, `[db] connected` + `[bjj-new] listening on :3000` 정상
  - ② API 레벨 (curl + JWT):
    - `GET /api/profile`: `networks` 배열 필드 정상 포함, `network` 하위호환 필드도 함께 반환
    - `PUT /api/profile` with `networks:["테스트A","테스트B"]` → `GET` 재확인: 2개 소속 정상 저장·유지
    - `PUT /api/profile` with `networks:["테스트A"]` → `GET` 재확인: 소속 1개 삭제 시뮬레이션 정상 반영
    - `PUT /api/profile` with `networks:["인네이트 불광"]` → `GET` 재확인: 원래 값 완전 복원 (테스트 잔여 데이터 없음)
  - ③ 프론트 번들 (`assets/index-D8GGs3tu.js`):
    - "일째" 문자열 포함 확인 ✓ (수련일수 표시 로직 배포됨)
    - "여러 개 등록" 문자열 포함 확인 ✓ (소속 다중 등록 UI 배포됨)
  - 기술부채/보안 이슈: 0건
  - 발견된 버그: 0건


## 최종 요약 (사용자용)

프로필 화면에 두 가지 기능을 추가했다.

1. **수련일수**: 프로필 헤더의 "시작 YYYY-MM-DD" 문구 옆에 "N일째"가 함께 표시된다(시작일 당일을 1일째로 계산). 시작일을 등록하지 않았다면 기존처럼 표시되지 않는다. 기존 통계 카드의 "수련"(출석 기록 기반)과는 별개 값이라 그대로 두었다.
2. **소속 다중 등록**: "소속"을 하나만 등록하던 것을 여러 개 추가/삭제할 수 있게 바꿨다. 프로필 수정 화면에서 소속을 입력하고 [추가]를 누르면 칩으로 쌓이고, 칩의 ×를 눌러 삭제할 수 있다. 프로필 헤더와 "기본 정보" 목록에는 등록된 소속이 " · "로 이어져 표시된다. 기존에 등록해둔 소속 1개는 자동으로 유지된 채 배열로 전환됐다(데이터 유실 없음).

DB에는 `profile` 테이블에 `networks`(TEXT, JSON 배열) 컬럼을 새로 추가했고, 기존 `network` 컬럼은 하위호환용으로 남겨뒀다. 별도 테이블이나 CRUD 화면은 만들지 않고 프로필 편집 안에서 배열 하나로 처리하는 가벼운 방식을 택했다.

Developer 구현 → Reviewer 감사(PASS, Critical/High 0건) → QA 실행 검증(PASS, API·마이그레이션·배포 번들 확인) 전 단계 통과했고, 이미 pm2 `bjj`에 빌드·배포까지 완료되어 운영 중이다. 사용자 쪽에서 추가로 할 일은 없으며, 다음에 실제 브라우저에서 한 번 훑어보면 좋다.
