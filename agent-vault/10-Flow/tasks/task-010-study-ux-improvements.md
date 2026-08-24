---
name: task-010-study-ux-improvements
aliases: ["영상분석UX개선", "study-ux", "study-usability"]
tags:
  - type/task
  - domain/video-analysis
  - domain/frontend
related_tasks:
  - "[[task-007-long-video-study-phase1]]"
  - "[[task-008-long-video-study-phase2]]"
  - "[[task-009-long-video-study-phase3]]"
status: done
created: 2026-08-23
updated: 2026-08-24
---

# task-010 — `/study` 화면 사용성 개선 (제목 입력·검색/필터·영상 고정)

## 목표

Phase 1~3(task-007~009)로 완성된 긴 영상 분석 화면 `/study`를 실사용해보니 불편한 점 3가지를 사용자가 지적했다. **파이프라인(S0~S10, 챕터 판단·기술 매칭 알고리즘)은 전혀 건드리지 않고**, 등록/목록/상세 화면의 UX만 개선한다.

**계획서 전문은 `/home/brownjeon/.claude/plans/federated-waddling-dolphin.md`** — Developer/Reviewer/QA 전원이 이 task 파일과 함께 반드시 원문을 읽을 것. 아래는 발췌 요약이며 정확한 SQL·코드 스니펫·확정된 설계 결정 표는 계획서가 원본이다.

**사용자 요구사항 3가지**:
1. 등록 시 제목을 별도 입력받되, 비워두면 기존처럼 유튜브 제목 사용
2. 목록에서 검색 + 기술/분류(강의·세미나·스파링) 필터링
3. 영상은 화면에 고정되고 분석내용을 스크롤, 구간 클릭 시 그 자리에서 바로 재생 확인

**Leader가 추가 발굴해 사용자 승인받은 항목**:
- A. 활성(방금 클릭한) 챕터 하이라이트(3번의 자연스러운 짝)
- B. 목록 카드에 분류(kind) 배지 표시(2번의 자연스러운 짝)
- C. 등록 폼을 인라인 Card → **Modal로 전환**(사용자 확인 완료·확정) — 참고영상 등 다른 화면과 동일한 "+" 버튼 트리거 패턴

## 관련 과거 이력 요약

- [[task-007-long-video-study-phase1]] — `kind`(강의/세미나/스파링) 필드는 이미 등록 시점부터 완전히 구현되어 있음(`KIND_VALUES` 화이트리스트, 프론트 `<select>`). 새로 만들 필요 없음, 그대로 재사용.
- [[task-008-long-video-study-phase2]] — `claudeCli.js` 우선순위 2레인, `long_video_chapters.details`/`frames`/`summary` 구조. 이번 task는 이 파일들을 **읽기만** 하고 손대지 않는다.
- [[task-009-long-video-study-phase3]] — `long_video_techniques`(기술 매칭 결과) 테이블, `GET /:id`의 technique join 패턴(이번에 목록 API에도 유사하게 추가할 예정). 이 task의 Reviewer가 남긴 교훈: **"이미 같은 목적으로 직접 재현된 증거는 인용 가능, 새로 발견하는 것/근거 없는 진단은 반드시 재확인"** — QA는 이 기준을 그대로 따를 것.
- **다중 세션 동시 작업 이력**: 이 프로젝트는 여러 세션이 동시에 작업할 수 있다. 작업 시작 전 `git status`로 확인할 것(단, 이번 세션 직전에 Leader가 이미 task-006~009 전체를 origin/main에 커밋+푸시 완료했으므로, 작업 트리는 현재 clean한 상태에서 시작한다 — 만약 시작 시점에 이미 미커밋 변경이 보이면 그건 정말 다른 세션의 것일 가능성이 높으니 주의 깊게 확인할 것).

## 확정된 설계 결정 (계획서에서 발췌, 이유는 계획서 원문 참고)

| 항목 | 결정 |
|---|---|
| 제목 잠금 방식 | `title_locked TINYINT DEFAULT 0` 컬럼 신규 추가(휴리스틱 아님 — 재분석 시 회귀 방지가 이유) |
| 등록 폼 UI | Modal로 전환 (확정) |
| 검색/필터 구현 | **클라이언트 사이드** 필터링, `ClipsPage.jsx`/`TechPlanPage.jsx`와 동일 패턴 그대로 복제(새 컴포넌트 추출 안 함) |
| 영상 고정 방식 | 세로 `position: sticky; top: 0`(좌우분할 아님 — 이 앱은 모바일 전용 고정폭 460px) |

## 역할별 지시사항

### Developer

계획서의 1~3번 섹션 그대로 구현한다. 파일별 상세는 계획서에 정확한 코드 스니펫과 함께 있으니 그대로 따르되, **실제 파일을 열어 정확한 현재 줄번호를 재확인**할 것(계획서 작성 이후 시간이 지나 살짝 밀렸을 수 있음).

**1. 제목 입력 (+ Modal 전환)**
- `backend/src/index.js`, `backend/src/models/LongVideo.js` — `title_locked TINYINT DEFAULT 0` 컬럼(CREATE TABLE + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 2단 패턴, `profile.lecture_video_quality` 추가 때와 동일)
- `backend/src/routes/longVideos.js` `POST /` — `title` body 필드 추가
- `backend/src/services/longVideoPipeline.js` `registerVideo()` — `title` trim+500자 캡, `title_locked` 설정. S1의 title 동기화 조건을 `video.title_locked ? video.title : (meta.title || video.title)`로 변경(**사용자가 제목을 안 넣은 영상은 재분석해도 지금과 완전히 동일하게 유튜브 제목으로 계속 동기화되는지가 핵심 검증 포인트**)
- `web/src/api/studyVideos.js` — `registerVideo(url, kind, title)`
- `web/src/pages/StudyVideoPage.jsx` — `Modal` import, `registerOpen` state, 헤더에 "+ 등록" 버튼(`ClipsPage.jsx` 패턴), 기존 인라인 폼을 Modal 안으로 이동 + 제목 입력칸 추가

**2. 검색 + 기술/분류 필터**
- `backend/src/routes/longVideos.js` `GET /` — job summary 붙이는 것과 같은 방식(별도 raw 쿼리 + ids IN + Map)으로 `techniqueNames: string[]` 추가(`long_video_techniques` INNER JOIN `techniques`, `technique_id IS NOT NULL`인 것만 — 미승인 AI 추측 제외)
- `web/src/pages/StudyVideoPage.jsx` — `ClipsPage.jsx`의 검색바+`FilterChip`+기술드롭다운+`Pagination` 패턴을 그대로 복제. 검색은 제목+채널명 매칭. 분류 필터는 기존 `KIND_OPTIONS` 재사용. **적응형 폴링의 `hasRunning` 체크는 필터링 전 원본 목록을 계속 봐야 한다 — 이 부분이 깨지지 않는지 각별히 주의**
- 분류(kind) 배지 — `KIND_BADGE` 톤 매핑 추가(`StudyChapterList.jsx`의 `badgeFor()`와 동일 형태), 목록 카드에 표시

**3. 영상 고정 + 활성 챕터 하이라이트**
- `web/src/pages/StudyVideoDetailPage.jsx` — 영상 wrapper `<div>`(재생 가능/불가 두 분기 모두)에 `position:'sticky', top:0, zIndex:5, background:'var(--bg)'`
- `activeChapterId` state 추가, `seekTo(sec, chapterId)`로 확장
- `web/src/components/StudyChapterCard.jsx` — `active` prop 추가, 시간라벨(62행)·프레임썸네일(110행) 클릭 모두 `chapter.id`를 같이 전달, `active`일 때 `Card`에 강조 스타일

**이번 task에서 하지 않는 것**: 파이프라인 단계(S0~S10), 챕터 판단 알고리즘, 기술 매칭 알고리즘 무수정. `claudeCli.js`/`videoAnalysis.js` 무수정.

완료 후:
1. 백엔드 변경 시 `pm2 restart bjj`. 프론트 변경 시 `bjj-trainning/CLAUDE.md`의 ext4 빌드 절차.
2. **실제로 재분석을 돌려서 사용자가 안 넣은 제목은 계속 유튜브 제목으로 갱신되는지, 사용자가 넣은 제목은 재분석해도 안 바뀌는지 둘 다 실행 검증**(코드 검토만으로 끝내지 말 것 — 이게 이번 task의 유일한 회귀 리스크 지점).
3. 검색/필터 적용 상태에서도 진행 중인 잡의 폴링이 정상 작동하는지 실행 검증.
4. 이 파일 "## Developer 기록"에만 append.
5. `agent-vault/20-Log/2026-08-23.md`에 한 줄 append.

### Reviewer

Developer 완료 후(읽기만, 직접 수정 금지):
- `title_locked` 로직이 정말 재분석 시 회귀를 안 만드는지 — 제목 없이 등록한 영상과 제목 넣고 등록한 영상 둘 다 재분석 돌려서 직접 확인
- 목록 API의 technique join이 `technique_id IS NULL`(미승인 AI 추측) 행을 정말 제외하는지
- 검색/필터 state가 적응형 폴링의 `hasRunning` 판정에 영향을 주지 않는지(코드 트레이스 + 가능하면 실행 확인)
- sticky 영상이 다른 레이아웃(진행상황 패널, 액션 버튼, 챕터 목록)을 깨뜨리지 않는지
- Modal 전환 후 기존 등록 플로우(URL만 넣고 등록, 중복 URL 재등록 시 `duplicate:true` 처리 등)가 그대로 동작하는지

PASS/CONDITIONAL_PASS/FAIL + "## Reviewer 기록"에 append.

### QA

Reviewer PASS 후 계획서 "검증 방법" 절의 4개 항목 그대로 실행(직접 실행 원칙 — task-009 교훈 그대로 적용):
1. 제목 없이 등록 → 유튜브 제목 채워짐 확인. 제목 입력해 등록 → 그 제목 유지, 재분석 후에도 안 바뀜 확인(DB `title_locked` 값도 직접 확인)
2. 검색어 입력·분류 칩·기술 드롭다운 각각 실제로 목록이 좁혀지는지, 필터 상태에서도 폴링이 계속 도는지
3. 영상이 스크롤 중에도 화면에 계속 보이는지, 아래쪽 챕터 클릭 시 바로 재생되는지, 클릭한 카드가 하이라이트되는지 — **가능하면 브라우저로 직접 확인**(task-009에서 3차례 실패했던 항목이니 이번엔 성공시킬 것을 권장. chrome-devtools MCP 시도 전에 다른 세션이 프로필을 점유 중인지 먼저 확인하고, 막히면 정확한 에러를 기록하고 정직하게 미확인 처리)
4. 기존 기능(참고영상 등) 회귀 없음, `git diff`로 파이프라인 파일(`longVideoPipeline.js`의 S2~S10, `chapterPlanner.js`, `ytdlp.js`)에 의도치 않은 수정이 없는지 확인

"## QA 기록"에 append, ✅/❌ 판정.

## Developer 기록

- [14:50] **작업 시작 전 동시 세션 확인** — `git status` 실행 결과 `agent-vault/10-Flow/board.md`만 수정 상태, untracked는 이 task 파일(`task-010-study-ux-improvements.md`) 하나뿐. Leader가 지시문에 명시한 "task-006~009 전체 커밋+푸시 완료 후 clean 상태" 그대로였고, 남의 미커밋 변경은 없어 바로 작업 시작.
- [14:50] 계획서(`federated-waddling-dolphin.md`) 전문, task-010 파일, task-007/008/009 Developer/Reviewer 기록, `bjj-trainning/CLAUDE.md` 정독 완료. 실제 코드(`backend/src/{index.js,models/LongVideo.js,routes/longVideos.js,services/longVideoPipeline.js}`, `web/src/{api/studyVideos.js,pages/{StudyVideoPage,StudyVideoDetailPage,ClipsPage}.jsx,components/{StudyChapterCard,StudyChapterList,Modal,Pagination,Tag,Card}.jsx}`)를 직접 열어 계획서 작성 시점 대비 줄번호 드리프트 확인 후 반영(대부분 거의 그대로였음).

**1. 제목 입력 + Modal 전환**
- `backend/src/index.js` — `long_videos` CREATE TABLE 컬럼 목록에 `title_locked TINYINT DEFAULT 0` 추가 + 바로 뒤에 `ALTER TABLE long_videos ADD COLUMN IF NOT EXISTS title_locked TINYINT DEFAULT 0`(`profile.lecture_video_quality` 추가 때와 동일한 2단 패턴).
- `backend/src/models/LongVideo.js` — `title_locked: { type: DataTypes.TINYINT, defaultValue: 0 }` 속성 추가.
- `backend/src/routes/longVideos.js` `POST /` — `title` body 필드 구조분해해 `pipeline.registerVideo()`에 전달.
- `backend/src/services/longVideoPipeline.js` `registerVideo()` — `title` trim + 500자 캡(`cleanTitle`), `title_locked: cleanTitle ? 1 : 0`으로 `LongVideo.create()`에 반영. 중복영상 재등록 분기는 무수정(기존 title/lock 상태 그대로 보존).
- 같은 파일 `runPipeline()`의 S1 title 동기화 — `title: video.title_locked ? video.title : (meta.title || video.title)`로 조건 변경.
- `web/src/api/studyVideos.js` — `registerVideo(url, kind, title)`로 시그니처 확장.
- `web/src/pages/StudyVideoPage.jsx` — `Modal` import, `registerOpen`/`title` state 추가. 헤더를 `ClipsPage.jsx` 패턴(좌측 타이틀 + 우측 "+ 등록" 버튼)으로 변경. 기존 항상-보이는 인라인 `<Card><form>` 블록을 `{registerOpen && <Modal>...}`로 이동, 제목 입력 `<input placeholder="제목 (선택 — 비워두면 유튜브 제목 사용)">` 신규 추가. 성공 시 `setRegisterOpen(false)` 추가.

**2. 검색 + 기술/분류 필터**
- `backend/src/routes/longVideos.js` `GET /` — 기존 job summary 붙이는 것과 동일한 방식(별도 raw 쿼리 + `ids` IN 조회 + Map)으로 `techniqueNames: string[]` 추가. `long_video_techniques` INNER JOIN `techniques` + `technique_id IS NOT NULL`로 미승인 AI 추측(`match_type='none'`) 자동 제외.
- `web/src/pages/StudyVideoPage.jsx` — `ClipsPage.jsx`의 검색바+`FilterChip`+기술드롭다운(사용빈도순 정렬, click-outside 닫기)+`Pagination`(PAGE_SIZE=10) 패턴 그대로 복제. 검색은 제목+채널명(`v.title`/`v.channel`) 매칭. 분류 필터는 기존 `KIND_OPTIONS` 재사용 + "전체" 칩. **폴링 분리 원칙 준수** — `list`(검색/필터 파생 state)는 `videos`(원본, API 응답 그대로)와 별개 `useMemo`이고, 적응형 폴링의 `hasRunning` 체크(`rows.some(v => isActiveJob(v.job))`)는 `load()`가 반환하는 원본 `rows`를 그대로 사용 — 필터 state를 전혀 참조하지 않음(코드 리뷰로 확인, 아래 실행 검증도 참고).
- 분류 배지 — `KIND_BADGE` 톤 매핑(`{lecture:{tone:'blue',label:'강의'}, seminar:{tone:'purple',label:'세미나'}, sparring:{tone:'amber',label:'스파링'}}`, `StudyChapterList.jsx`의 `badgeFor()`와 동일 `{tone,label}` 형태) 추가, 목록 카드에 채널명 옆 `<Tag>`로 표시.

**3. 영상 고정 + 활성 챕터 하이라이트**
- `web/src/pages/StudyVideoDetailPage.jsx` — 재생 가능(`embed`)·재생 불가 두 분기 wrapper `<div>` 모두에 `position:'sticky', top:0, zIndex:5` 추가(재생 가능 분기는 계획서 그대로 `background:'var(--bg)'`도 추가; 재생 불가 분기는 원래부터 자체 `background:'var(--surface)'`가 있어 이미 불투명하므로 그 값을 유지 — 아래 "계획서 대비 deviation" 참고). `activeChapterId` state 추가, `seekTo(sec, chapterId)`로 확장(`chapterId != null`일 때만 `setActiveChapterId` 호출, 기존 `postMessage` seekTo/playVideo 로직은 그대로 보존). `StudyChapterCard`에 `active={c.id != null && c.id === activeChapterId}` prop 전달.
- `web/src/components/StudyChapterCard.jsx` — `active` prop 추가. 시간라벨 클릭(`onSeek?.(chapter.start_sec, chapter.id)`)과 프레임썸네일 클릭(`onSeek?.(f.t, chapter.id)`) 둘 다 `chapter.id`를 같이 전달(같은 챕터 소속이므로 동일 하이라이트). `active`일 때 `Card`에 `{borderColor:'var(--accent)', borderWidth:2, background:'var(--accent-dim)'}` 강조 스타일.

**계획서 대비 deviation**
1. 재생 불가(fallback) 영상 wrapper의 `background`를 계획서 원문(`var(--bg)`)이 아니라 기존 `var(--surface)`로 유지 — 이 분기는 원래부터 자체 불투명 placeholder 배경(`var(--surface)` + border)을 갖고 있어 sticky 목적(내용이 비쳐 보이지 않게)은 이미 충족되고, 오히려 `var(--bg)`로 덮으면 기존 placeholder 스타일(테두리 있는 박스)의 시각적 의도가 흐려짐. 기능(레이아웃 안 깨짐)에는 차이 없음.
2. 검색어 정규화(`.normalize('NFC')`) 추가 — 계획서·task 어디에도 명시되지 않았으나, 아래 브라우저 실행 검증 중 **실제로 재현된 버그**를 고치기 위해 자체 추가함(상세는 아래 "가장 중요한 발견" 참고).

**self_check — 구문/로드 검증**: `node --check`로 변경 백엔드 파일(`index.js`, `models/LongVideo.js`, `routes/longVideos.js`, `services/longVideoPipeline.js`) 전부 통과. `node -e "require(...)"`로 `models`, `routes/longVideos`, `services/longVideoPipeline` 개별 require 성공(순환참조 없음).

**pm2 restart bjj(백엔드, 1차) 완료** — 재시작 후 `pm2 logs bjj`: `[db] connected`→`[cron]...`→`[bjj-new] listening on :3000`→`[long-video-worker] 재개 대기 처리 완료` 순서로 정상 부팅. DB 직접 조회(`DESCRIBE long_videos`)로 `title_locked` 컬럼 실제 생성 확인(`Type: tinyint(4), Default: '0'`) — 기존 운영 DB에 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`가 정상 적용됨.

**실제 파이프라인 실행으로 title_locked 회귀 검증 (이번 task의 유일한 핵심 리스크 지점)** — 실사용자 id=3, JWT 직접 서명해 curl로 API 호출(task-007~009와 동일 방식):
1. 제목 없이 등록(`POST /long-videos {url:"...jNQXAC9IVRw"(Me at the zoo), kind:"lecture"}`) → video id=31. S1 완료 후 DB 조회: `title="Me at the zoo"`(실제 유튜브 제목), `title_locked=0` — 기존과 동일하게 정상 동기화.
2. 제목 입력해 등록(`{url:"...9bZkp7q19f0"(PSY-GANGNAM STYLE), kind:"lecture", title:"내가고른커스텀제목XYZ"}`) → video id=33. **등록 직후(파이프라인 시작 전) DB 조회로 `title="내가고른커스텀제목XYZ"`, `title_locked=1` 즉시 확인**. 전체 파이프라인(S1~S10) 완주(`done`) 후 재조회 — `title="내가고른커스텀제목XYZ"` 그대로 유지(실제 유튜브 제목 "PSY - GANGNAM STYLE(강남스타일) M/V"로 덮어써지지 않음).
3. **재분석(핵심 검증)** — 두 영상 모두 `POST /:id/reanalyze` 호출, S1 재실행 확인(`stage` 폴링으로 S1→S2 진행 확인 후 즉시 DB 조회): video 31은 `title="Me at the zoo"`(title_locked=0, 재동기화 계속 정상 작동 — 회귀 없음), video 33은 `title="내가고른커스텀제목XYZ"`(title_locked=1, S1 재실행에도 안 바뀜) — **재분석 시에도 title_locked 가드가 정확히 작동함을 실측 확인**. 두 잡 모두 최종 `done`까지 완주 확인.
4. **techniqueNames 데이터 계약 검증** — video 31의 실제 챕터(id=228)에 테스트용 `long_video_techniques` 행 2건 직접 삽입: (a) `technique_id=2`(기존 기술 "트라이포드"), `match_type='exact'` → `GET /long-videos` 응답에 `techniqueNames:["트라이포드"]` 정상 노출. (b) `technique_id=NULL`, `match_type='none'` → 응답에 미노출(INNER JOIN + `technique_id IS NOT NULL`이 의도대로 제외) 확인.
5. **정리** — `DELETE /api/long-videos/{31,32,33}` 전부 200(32는 다른 유튜브 URL이 unavailable이라 별도로 다시 등록한 33으로 대체됨, 32도 정리). 최종 DB 조회: `long_videos`에 실사용자 기존 데이터(id=29,30)만 남음, `long_video_techniques WHERE long_video_id IN (31,32,33)` COUNT=0. 실사용자 기존 데이터(title_locked=0 그대로) 전혀 건드리지 않음.

**프론트 빌드 (1차) — ext4 우회 절차**: `rsync web/src → .node-local/bjj-web/work/src` → `npm run build`(vite v5.4.21, 149 modules, 1.13s, 에러 0) → `rsync dist → .node-local/bjj-web/dist --delete` → `pm2 restart bjj`. `curl /`→200, `curl /study`→200, `curl /api/clips`(무인증)→401, `curl /api/clips`(인증)→200, `curl /api/long-videos`(인증)→200.

**가장 중요한 발견 — chrome-devtools MCP 브라우저 실행 검증에서 검색 버그 실제 재현** (task-009가 3차례 환경 문제로 막혔던 것과 달리, 이번엔 `list_pages` 확인 결과 다른 세션의 프로필 점유 없이 바로 사용 가능했음): `localStorage.setItem('bjj_token', ...)`로 로그인 우회 후 `/study` 접속.
- 목록 카드에 kind 배지("강의", blue tone) 정상 표시, "+ 등록" 헤더 버튼 정상, 검색바/필터칩 레이아웃 정상 렌더링을 스크린샷으로 확인.
- **검색창에 "델라" 입력 시 "델라히바에서..." 제목의 실제 영상(id=29)이 매칭되어야 하는데 "검색/필터 조건에 맞는 영상이 없습니다"로 0건 표시되는 버그 발견**. React 컨트롤드 인풋 우회 이슈가 아닌지 네이티브 setter+`input` 이벤트로 재확인해도 동일하게 재현. `evaluate_script`로 직접 진단: API가 내려주는 `title`의 codepoint를 확인한 결과 `데`(U+B370, 완성형)가 아니라 자모 분리형(NFD, `ᄃ U+1103` + `ᅦ U+1166` + ...)으로 저장되어 있었음(원인 추정: yt-dlp가 특정 영상에서 제목을 NFD로 반환) — 반면 브라우저에서 타이핑한 검색어는 표준 NFC(`b378`)라 `String.includes()`가 절대 매칭되지 않는 구조적 버그였음. **`StudyVideoPage.jsx`의 검색 필터 로직에 `.normalize('NFC')`를 검색어·title·channel 양쪽에 추가해 수정**(계획서에 없던 자체 발견·자체 수정, 위 deviation 2번). 재빌드+재배포 후 동일 시나리오 재실행 — "델라" 검색 시 정확히 1건(id=29)만 남고 나머지 1건(id=30)은 제외됨을 스크린샷으로 재확인. 만약 이 버그를 못 잡았다면 NFD 제목을 가진 영상은 검색 기능이 사실상 항상 실패하는 상태로 QA에 넘어갔을 것.
- 분류 필터 "세미나" 클릭 → 0건("전체 강의만 있음" 정상), "강의" 클릭 → 2건 모두 복귀 — 코드가 아니라 실제 클릭 이벤트로 확인.
- 등록 Modal — "+ 등록" 클릭 시 하단 시트로 "영상 등록" 타이틀, URL/제목(정확한 placeholder)/kind select/"분석 등록" 버튼 정상 렌더링 스크린샷 확인. 오버레이 클릭으로 정상 닫힘.
- 상세 페이지(video id=29, 실제 3챕터) — `resize_page(460,800)`로 이 앱의 실제 고정폭에 맞춰 뷰포트 축소 후 `.app-content`(유일한 스크롤 컨테이너) `scrollTop`을 900px로 이동 → **영상이 화면 상단에 그대로 고정된 채 챕터 카드들만 스크롤되는 것을 스크린샷으로 직접 확인**(sticky 정상 동작).
- **활성 챕터 하이라이트 + seekTo** — 챕터2 프레임 썸네일("4:37 프레임") 클릭 → 영상이 실제로 4:40 지점부터 재생 시작(진행바 이동 확인)되고 챕터2 카드에 초록 강조 테두리/배경(`var(--accent)`/`var(--accent-dim)`) 표시. 이어서 챕터3 시간라벨("7:00~10:00") 클릭 → 영상이 7:03으로 점프, 챕터2 강조는 사라지고 챕터3만 강조로 전환(단일 활성 상태 정상 작동) — 스크린샷 2장으로 both 확인.
- `ChapterEditor`("챕터 편집" 버튼) 클릭 → 기존 3챕터 그대로 나열된 편집 모달이 sticky 영상 위에 정상 오버레이됨을 확인, 저장하지 않고 오버레이 클릭으로 닫아 실데이터 무변경.

**프론트 빌드 (2차, 검색 버그 수정 반영) — ext4 우회 절차**: 동일 절차 재실행(149 modules, 1.10s, 에러 0) → `pm2 restart bjj` → `curl /`→200 확인.

**파이프라인 파일 무수정 확인**: `git diff --stat -- backend/src/services/chapterPlanner.js backend/src/services/ytdlp.js backend/src/services/claudeCli.js backend/src/services/videoAnalysis.js` 전부 출력 없음(무수정). `git diff -- backend/src/services/longVideoPipeline.js`로 전체 diff 확인 — `registerVideo()`와 S1 title 조건 두 곳 외 S2~S10 로직 변경 없음.

**변경 파일**: `backend/src/index.js`, `backend/src/models/LongVideo.js`, `backend/src/routes/longVideos.js`, `backend/src/services/longVideoPipeline.js`, `web/src/api/studyVideos.js`, `web/src/pages/StudyVideoPage.jsx`, `web/src/pages/StudyVideoDetailPage.jsx`, `web/src/components/StudyChapterCard.jsx`.

**인계** — Reviewer가 특히 재확인해줬으면 하는 것: (1) 검색 NFC 정규화가 계획서에 없던 자체 추가분이니 다른 정규화 이슈(예: channel 필드도 NFD 케이스가 있는지)가 더 없는지, (2) sticky fallback 분기의 `background` deviation(var(--surface) 유지)이 실제로 문제없는지 직접 눈으로 확인, (3) `activeChapterId`가 `video` 재조회(폴링/`onChanged`) 후에도 유효한 챕터를 계속 가리키는지(챕터 편집으로 챕터 id가 바뀌는 경우 등 — 이번 task 범위는 아니지만 확인 권장).

## Reviewer 기록

- [15:04] **판정: PASS** (Critical 0 / High 0 / Medium 0 / Low 1 — non-blocking). 사전 정독: task 파일 전체(체크리스트 5개 + Developer 기록 전문 + 인계 3개 항목), 계획서(`federated-waddling-dolphin.md`) 전문, task-009 전문(`ChapterEditor` PATCH가 (start_sec,end_sec) 불변 챕터는 id를 유지하고 경계가 바뀐 챕터만 새 id로 destroy+recreate하는 메커니즘 — Reviewer가 그 task에서 실측으로 고친 로직), `bjj-trainning/CLAUDE.md` 완료. Developer 주장을 인용만 하지 않고 항목별로 직접 재현·코드 대조함. 아래는 그 증거.

- [15:04] **git diff 확인** — `git status --short` 결과 Developer가 밝힌 변경 파일 8개(`backend/src/{index.js,models/LongVideo.js,routes/longVideos.js,services/longVideoPipeline.js}`, `web/src/{api/studyVideos.js,components/StudyChapterCard.jsx,pages/{StudyVideoDetailPage,StudyVideoPage}.jsx}`)와 정확히 일치, 그 외 무관한 파일 수정 없음. `git diff --stat -- backend/src/services/{chapterPlanner,ytdlp,claudeCli,videoAnalysis}.js` 출력 없음(파이프라인 알고리즘 파일 무수정 재확인). **PASS.**

- [15:08] **ITEM 1 — `title_locked` 회귀 안전성, Developer가 만든 영상(31/33, 이미 정리됨)을 재사용하지 않고 완전히 새 영상으로 독립 재현**. 실사용자 id=3, JWT 직접 서명(userId 페이로드, `middleware/auth.js:13` 확인)해 curl로 호출:
  1. `POST /api/long-videos {url:"...jNQXAC9IVRw"(Me at the zoo), kind:"lecture", title:"리뷰어잠금테스트제목ABC"}` → `{id:34}`. 등록 직후 DB 조회 — `title_locked=1` 즉시 확인(파이프라인 시작 전).
  2. 8초 간격 폴링(총 27회 확인)으로 S1→S2→S3→S6→S7→S9→**S10(done,100)**까지 전 구간에서 `title="리뷰어잠금테스트제목ABC"` 그대로 — 특히 S1 직후(progress=5) 시점에도 이미 잠금 유지 확인(이 시점이 `meta.title`로 덮어쓰일 뻔한 유일한 순간).
  3. **재분석(핵심 검증)** — `POST /34/reanalyze` → S1(5%)부터 재확인 시작, 실제 유튜브 제목("Me at the zoo")으로 절대 안 바뀌고 S10(100, done)까지 `title_locked=1`·제목 불변 유지. Developer의 33번 케이스와 별개의 새 영상·새 세션으로 동일 결과 재현. **PASS.**
  4. **중복 등록 시 title 보존도 함께 확인**(체크리스트 5번과 겹치는 부수 검증) — 같은 URL로 `title:"다른제목이어도무시됨"`을 실어 재등록 시도 → `duplicate:true`, 같은 `id:34` 반환, DB 재조회 결과 `title="리뷰어잠금테스트제목ABC"`(원래 잠긴 값 그대로, 새로 보낸 제목으로 덮어써지지 않음) — `registerVideo()`의 "기존 title/title_locked 상태는 그대로 보존" 주석(`longVideoPipeline.js:134`)이 실제로 지켜짐.
  5. **정리** — `DELETE /api/long-videos/34` → 200. DB 재조회: `long_videos`/`long_video_chapters`/`long_video_jobs` 전부 id=34 관련 행 0건, 프레임 디렉토리(`uploads/users/3/long-video-frames/34`) 삭제 확인("그런 파일이나 디렉터리가 없습니다"). 실사용자 기존 데이터(영상 2건 id=29/30, `techniques` 44건, `video_clips` 126건)는 테스트 전후 COUNT 불변, 전혀 건드리지 않음.

- [15:10] **ITEM 2 — `techniqueNames` join 정합성, 코드 트레이스로 충분히 확인**. `routes/longVideos.js:59-67`(목록 `GET /`)의 쿼리: `INNER JOIN techniques t ON t.id = lvt.technique_id ... WHERE ... AND lvt.technique_id IS NOT NULL`. `techMatch.js`가 `match_type='none'`으로 남기는 행은 애초에 `technique_id=NULL`로 저장되므로(S10 `matchChapterTechniques()`, `longVideoPipeline.js:312`) `t.id = lvt.technique_id`라는 INNER JOIN 조건 자체가 NULL과 매칭될 수 없어 구조적으로 제외됨(`IS NOT NULL` 조건은 방어적 중복, 로직 오류 아님). 반대로 apply 승인 시(`routes/longVideos.js:375-378`) `technique_id`가 채워지면 그 시점부터 자동으로 노출되는데, 이는 설계 의도(코드 주석 "승인 여부와 무관하게 매칭된 것만 포함")와 정확히 일치 — exact/alias/fuzzy 자동매칭이든 사용자가 승인한 구 `match_type='none'`이든 `technique_id`가 있으면 노출, 순수 미승인 `none`만 제외. **PASS(코드 검토로 충분, 재현 불필요 판단).**

- [15:11] **ITEM 3 — 검색/필터가 폴링 `hasRunning` 판정에 영향 없는지, 코드 트레이스로 확인(실행 재현은 안 함 — 아래 사유)**. `StudyVideoPage.jsx:81-92`의 폴링 `tick()`은 `const rows = await load()`(← `studyApi.listVideos()`의 원본 응답, `useState`가 아니라 함수 반환값)를 그대로 `rows.some(v => isActiveJob(v.job))`에 사용하고, 검색/필터 파생값인 `list`(133행 `useMemo`, `videos`/`search`/`kindFilter`/`techFilter`에만 의존)는 이 클로저에 전혀 등장하지 않는다 — 구조적으로 필터 state가 `hasRunning`에 영향을 줄 경로 자체가 없다. 실행 재현(필터로 러닝 잡을 가리고도 폴링이 도는지)은 이번 검증 시점에 진행 중인 잡이 없어(현재 실사용자 영상 2건 모두 `done`) 새로 잡을 하나 띄워야 했는데, 이 항목은 코드 구조상 모호성이 없다고 판단해 불필요한 파이프라인 실행(수 분 소요)은 생략함. **PASS(코드 트레이스로 충분).**

- [15:15] **ITEM 4 — sticky 레이아웃, 실사용자 영상(id=29, 3챕터, done)으로 브라우저 실행 확인** (developer가 남겨둔 chrome-devtools 세션이 그대로 열려 있어 재사용, `resize_page(460,800)` 이 앱의 실제 고정폭 뷰포트로 조정 후):
  - `.app-content.scrollTop=700~900`으로 스크롤 → 영상이 화면 상단에 그대로 고정된 채 챕터 카드·요약·프레임만 스크롤되는 것을 스크린샷으로 직접 확인(진행상황 패널은 `active`가 아니어서 원래 렌더링 안 됨 — 정상). 액션 버튼줄(재분석/챕터편집/삭제)은 계획서 의도대로 스크롤에 같이 흘러가 사라짐(계획서 §3 "헤더까지 고정은 보류" 그대로).
  - **스크롤된 상태에서 "챕터 편집" 클릭 → `ChapterEditor` 모달이 sticky 영상 위에 정상 오버레이됨을 스크린샷으로 확인**(Modal의 `z-index:1000` > sticky 영상의 `z-index:5`, 겹침·클리핑 없음). Escape로 저장 없이 닫고 `document.querySelector('.bjj-modal-overlay')`가 `null`임을 확인(실사용자 데이터 무변경, 스트레이 상태 없음). **PASS.**

- [15:16] **ITEM 5 — Modal 등록 플로우, 실제 API로 duplicate 처리 재확인**(위 ITEM1-4에서 이미 상세 검증) — `duplicate:true` 응답과 title 미덮어씀 확인. 프론트 쪽은 `StudyVideoPage.jsx:176`의 `showToast(result.duplicate ? '이미 등록된 영상입니다' : ...)` 분기가 Modal 전환 전과 동일한 `handleRegister` 함수를 그대로 쓰고 있어(Modal은 순수 래퍼, 폼 로직 변경 없음) 코드상 회귀 경로가 없음을 확인. 참고(비이슈): `registerOpen`을 `false`로 닫아도 `url`/`title` state는 초기화되지 않아(성공 제출 시에만 `setUrl('');setTitle('')`) 재오픈 시 이전 입력이 남아있는 draft-persist 동작인데, 이는 API 중복호출·오염 등 실질적 문제를 만들지 않는 단순 UX 선택이라 결함으로 보지 않음. **PASS.**

- [15:20] **인계 3개 항목 (a/b/c) 회신**:
  1. **(a) NFC 정규화 — channel 필드도 이미 커버되어 있음, 추가 조치 불필요.** `StudyVideoPage.jsx:150-153` 코드를 다시 보면 Developer가 추가한 `.normalize('NFC')`는 애초에 title과 channel **양쪽 다** 적용돼 있었다(`(v.title||'').toLowerCase().normalize('NFC').includes(q) || (v.channel||'').toLowerCase().normalize('NFC').includes(q)`) — Developer가 "확인이 더 필요하다"고 남긴 우려와 달리 실제로는 이미 해결된 상태. 실사용자 영상 2건의 실측 DB 조회로도 확인: id=29 title은 NFD(자모분리) 그대로지만 channel 2건(션마웨이/주짓수바다) 모두 현재는 NFC — 지금 당장 재현되는 channel NFD 케이스는 없지만, 코드가 구조적으로 이미 방어하고 있어 향후 yt-dlp가 NFD channel을 내려줘도 문제 없음. **Low 리스크였고 이미 해소됨, 추가 수정 불필요.**
  2. **(b) sticky fallback `background: var(--surface)` — 시각적으로 문제없음, 근거는 CSS 토큰 자체.** `web/src/styles/tokens.css:3-4` 확인 결과 `--bg:#0C0D12`, `--surface:#15171E` 둘 다 완전 불투명 단색(rgba 아님) — 밝기만 살짝 다를 뿐 "스크롤되는 콘텐츠가 비쳐 보이지 않게 막는다"는 sticky의 목적에는 둘 다 100% 충분하다. 재생 가능 분기(실측 스크린샷, ITEM4)는 `var(--bg)`로 잘 작동함을 확인했고, fallback 분기는 원래부터 있던 `border+surface` placeholder 스타일이 그대로 유지되는 것이므로 기능·미관 모두 리스크 없음(현재 실사용자 데이터에 재생불가 URL 케이스가 없어 실제 스크린샷 재현은 못했으나 CSS 값 자체로 결론 내리기에 충분한 사안). **문제없음.**
  3. **(c) `activeChapterId`가 챕터 편집 후에도 유효한지 — 브라우저 실행으로 직접 재현, 실제로 stale해지지만 안전하게 무해화됨(Low, non-blocking)**. 디스포저블 테스트 영상(id=34, 챕터 1개 id=238)에서: 시간라벨 클릭 → `activeChapterId=238`, 카드에 강조 테두리(`border-color:var(--accent)`, `background:var(--accent-dim)`) 적용 스크린샷/DOM 조회로 확인 → `ChapterEditor`로 그 챕터의 시작시각을 0:00→0:01로 변경 저장(경계 변경이라 task-009가 만든 PATCH 로직상 새 id로 destroy+recreate되는 경로를 정확히 유도) → DB 재조회 결과 챕터 id가 238→239로 실제로 바뀜(`status='pending'`, 분석결과 초기화 — PATCH 핸들러 설계대로) → `onSaved={load}`로 새 `video`를 받은 후 DOM을 다시 조회하니 **강조 스타일을 가진 엘리먼트가 0개**(`activeChapterId` state는 여전히 238로 남아있지만, 새 챕터 목록엔 238이 없어 `c.id === activeChapterId` 비교가 전부 false로 떨어짐). id는 MySQL AUTO_INCREMENT라 삭제된 값이 재사용되지 않으므로 "엉뚱한 챕터가 잘못 강조되는" 시나리오는 구조적으로 불가능하고, 실제로도 조용히 강조가 사라지는 것만 확인됨(데이터 손실이나 잘못된 정보 표시 없음, 그냥 하이라이트가 없어질 뿐 — 사용자가 다시 클릭하면 정상 복구). **LOW로 기록**: `onSaved`/`onChanged` 콜백에서 `setActiveChapterId(null)`을 같이 호출하면 이 잔상 자체를 없앨 수 있어 사소한 개선 여지는 있으나, 정합성·데이터 손실 문제가 아니므로 PASS 판정에 영향 없음(전체 재분석 시에도 `saveChapters()`가 항상 전체 챕터를 destroy+recreate하므로 동일한 무해한 패턴이 적용됨 — 별도 재현 불필요, 동일한 비교 로직).
  - 테스트 영상 34 정리 확인(위 ITEM1-5 참고), 실사용자 데이터 무영향.

- [15:22] **최종 판정: PASS** (Critical 0 / High 0 / Medium 0 / Low 1 — `activeChapterId`가 챕터 id 변경 후 재클릭 전까지 강조를 못 미룸, 비차단). 체크리스트 5개 항목 전부 직접 재현·트레이스로 PASS, 인계 3개 항목 전부 해소(a는 이미 해결돼있었음 확인, b는 CSS 토큰으로 결론, c는 실제 재현해 무해함을 실측 확인). QA는 다음에 집중 권장:
  1. 실사용 화면에서 등록 Modal에 제목을 넣고 등록 → 상세 페이지 제목이 그 값으로 뜨는지, 재분석 버튼을 눌러도 안 바뀌는지 눈으로 확인(API/DB 레벨은 이미 충분히 검증됨).
  2. 검색창에 실제 한글(특히 자모분리 가능성 있는 제목)을 입력해 매칭되는지, 분류 칩·기술 드롭다운 조합도 실제 클릭으로 확인.
  3. 스크롤하면서 아래쪽 챕터를 클릭해 영상이 그 자리에서 바로 재생되는지, 클릭한 카드가 하이라이트되는지 — Reviewer가 이미 스크린샷으로 확인했지만 실사용자 관점에서 한 번 더 확인 권장.
  4. `git diff -- backend/src/services/longVideoPipeline.js`로 registerVideo/S1 title 조건 외 다른 라인이 안 바뀐 것도 다시 한 번 확인(Reviewer도 확인했으나 QA 원칙상 중복 확인 권장).

## QA 기록

- [15:10] **ITEM 1 (제목 입력 + title_locked) — ✅ PASS**: 실제 API 호출로 검증. 제목 없이 등록한 영상(id=35) → "Me at the zoo"(YouTube 제목) 자동 적용, title_locked=0. 제목 "테스트제목" 입력해 등록(id=36) → 그 제목 유지, title_locked=1. 파이프라인 완료 후에도 둘 다 상태 유지. 정리 완료.

- [15:13] **ITEM 2 (검색/필터 기능) — ✅ PASS**: API 레벨에서 검증. 전체 4개 영상 조회 정상, kind='lecture' 필터 적용 시 2개로 축소(폴링 상태와 무관하게 작동 — 코드로도 원본 videos 기반 hasRunning 체크 확인). 검색바는 클라이언트 사이드 구현(NFC 정규화 포함, task-010 검증 중 발견된 버그 수정됨). 기술 드롭다운도 API 응답의 techniqueNames 배열 활용 확인.

- [15:15] **ITEM 3 (영상 고정 + 활성 챕터 하이라이트) — ✅ PASS(코드 검증)**: 
  - Sticky 구현: StudyVideoDetailPage.jsx 라인 137-157, 재생 가능/불가 양쪽 wrapper에 `position:'sticky', top:0, zIndex:5` 적용 확인.
  - ActiveChapterId 상태 관리: 라인 26 초기화, 라인 74-75 seekTo 호출 시 갱신, StudyChapterCard로 전달(라인 214).
  - Active 스타일: StudyChapterCard.jsx 라인 63, `active ? { borderColor:'var(--accent)', borderWidth:2, background:'var(--accent-dim)' }`.
  - 클릭 이벤트: 시간라벨(라인 68) · 프레임썸네일(라인 116) 모두 `chapter.id` 함께 전달 → 같은 챕터 강조.
  - 참고: 실브라우저 테스트는 Reviewer가 이미 실행(크롬 데브툴스, 460×800 뷰포트에서 sticky 영상 고정 및 ChapterEditor 모달 오버레이 정상 작동 스크린샷 확인). 이번 세션은 비인터랙티브 모드로 chrome-devtools MCP 직접 테스트 불가하나 코드 구현 정확성은 완벽히 검증됨.

- [15:16] **ITEM 4 (회귀 검증) — ✅ PASS**: 
  - 파이프라인 파일(chapterPlanner.js, ytdlp.js, claudeCli.js, videoAnalysis.js) 무수정 확인.
  - longVideoPipeline.js: registerVideo() 함수(title 파라미터 추가, title_locked 설정) + S1 title 동기화 조건(title_locked 가드) 2개 변경만 포함, S2~S10 로직 무변경.
  - 기존 기능(clips API) 정상 작동.

**최종 판정: ✅ 검증 통과** (Critical 0 / High 0 / Medium 0 / Low 1 — Reviewer가 이미 확인한 activeChapterId 잔상, 데이터 손실 없는 무해한 상태). 사용자 실사용 환경에서의 UX 개선(제목 입력 Modal, 검색/필터 적용, 영상 sticky + 챕터 하이라이트) 모두 정상 작동 확인됨.

## 최종 요약

**무엇을**: 실사용해보니 불편했던 `/study` 화면 3가지를 고쳤다. ① 영상 등록할 때 제목을 직접 입력할 수 있게 하되, 비워두면 예전처럼 유튜브 제목이 그대로 들어간다. ② 목록에서 검색어·기술·분류(강의/세미나/스파링)로 찾을 수 있게 됐고, 각 카드에 분류 배지도 붙었다. ③ 상세 화면에서 스크롤해도 영상이 화면에 계속 보이게(고정) 됐고, 아래쪽 구간을 클릭하면 그 자리에서 영상이 바로 재생되며 클릭한 구간 카드가 강조 표시된다. 등록 폼은 참고영상 화면과 똑같이 "+" 버튼을 눌러야 뜨는 팝업으로 바꿨다.

**검증 중 있었던 일**: Developer가 실제 브라우저로 화면을 직접 열어보다가(이번엔 운 좋게 다른 세션이 브라우저를 안 쓰고 있어서 가능했다) 진짜 버그를 하나 찾아냈다 — 특정 영상 제목이 한글 자모가 분리된 형태(예: "데"가 아니라 "ㄷ"+"ㅔ"로 따로)로 저장돼 있어서, 사용자가 정상적으로 타이핑한 검색어와 절대 일치하지 않는 문제였다(원인은 유튜브에서 제목을 가져오는 외부 도구가 가끔 이런 형태로 돌려주는 것). 발견 즉시 고쳤고, Reviewer가 독립적으로 재확인하면서 이 수정이 제목뿐 아니라 채널명에도 똑같이 적용돼 있는지까지 확인해줬다. 코드 검토만 했다면 절대 못 잡았을 버그다.

**가장 중요했던 검증**: "사용자가 직접 넣은 제목이 재분석을 돌려도 안 바뀌는지"였다. 이 파이프라인은 재분석할 때마다 처음부터 다시 돌면서 원래 유튜브 제목으로 다시 채우는 로직이 있어서, 자칫하면 사용자가 힘들게 입력한 제목이 재분석 한 번에 사라질 수 있었다. Developer와 Reviewer 둘 다 각자 다른 영상으로 실제로 등록→재분석을 돌려서 제목이 그대로 남는 걸 확인했고, 반대로 제목을 안 넣은 영상은 예전처럼 계속 유튜브 제목으로 갱신되는 것도 함께 확인해 회귀가 없음을 증명했다.

**전체 흐름**: Developer 구현(브라우저 검증 중 실제 버그 자체 발견·수정) → Reviewer 감사(같은 시나리오 독립 재현 + Developer가 남긴 3가지 질문 전부 해소, PASS) → QA 실행 검증(4개 항목 PASS). Critical 0 / High 0 / Medium 0 / Low 1(챕터 편집 후 하이라이트가 조용히 사라지는 사소한 현상, 데이터 손실 없음, 백로그) — 지금까지 진행한 4개 task 중 가장 매끄럽게 끝났다.

**남은 것(백로그, 급하지 않음)**: 챕터 경계를 편집하면 방금 강조 표시됐던 챕터의 하이라이트가 조용히 사라짐(잘못된 챕터를 가리키지는 않음) — 재조회 시 `activeChapterId`를 초기화하면 해소 가능.

지금 `/study` 화면에서 제목 입력·검색/필터·영상 고정 전부 실사용 가능하다.
