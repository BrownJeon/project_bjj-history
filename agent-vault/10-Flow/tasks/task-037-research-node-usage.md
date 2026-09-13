---
name: task-037-research-node-usage
aliases: ["기술연구 사용 횟수", "연구 노드 연습 횟수", "research node usage"]
tags:
  - type/task
  - domain/frontend
  - domain/research
related_tasks:
  - "[[task-035-clip-usage-count]]"
  - "[[task-036-pickmeup-shared-clip-detail]]"
  - "[[task-026-research-screen]]"
status: done
created: 2026-09-13
updated: 2026-09-13
---

# task-037 — 기술연구 트리 노드·노드 상세에 기술사용 횟수 표시

## 사용자 지시 (2026-09-13)
> "지금 작업중인 사항 알려주고 없으면 다음 작업할 내용 받아서 진행해보자" → 후보 중 **"기술연구에 사용 횟수 표시"** 선택.
> task-035 에서 예고한 "이것을 토대로 기술연구나 픽미업에서도 활용할 수 있는 방식을 추후에 업데이트" 의 기술연구 편.

## 사용자 결정 (미리보기 보고 선택)
1. **표시 위치 = 트리 노드 + 노드 상세 시트.** 프로젝트 카드 요약은 **하지 않는다.**
   ```
   트리 노드 아래줄:  기술 · 암바 · 🥋 5회 · 최근 9/13
   노드 상세 시트(숙련도 아래):
     🥋 기술사용 횟수  5회 · 최근 9/13
        드릴 3 · 포지션 스파링 1 · 스파링 1
        이 기술이 붙은 참고영상 2개 합계
   ```
2. **0회는 구분 표시.** 참고영상은 있는데 기록 0 → `아직 안 써봄` / 그 기술이 붙은 참고영상 자체가 없음 → `영상 없음`(기록할 방법이 없는 상태). 0 과 "기록 불가"를 섞지 않는다.

## Leader 결정
- **셀 단위 = 기술(technique_id).** 노드가 아니다(`ResearchNode.js:10-12` "숙련도는 기술 단위 — 같은 기술을 쓰는 노드는 같은 값"과 같은 원칙). 노드에 수동으로 붙인 clip 링크(`research_links`)는 합산 대상이 아니다.
- **데이터 출처 = 프론트 `useCache().techniques` 캐시의 `t.clips[].usage` 합산** — 기술트리 카드(`TechPlanPage.jsx:218-219`, `sumUsage`)와 **같은 출처·같은 계산**이라 두 화면 숫자가 항상 같다. `ClipDetailModal` 의 +1/취소/조회가 `reloadTechniques()` 를 부르므로(`ClipDetailModal.jsx:61-65`) 자동으로 최신. **백엔드 변경 없음.**
  - 기각안(서버 `nodeView` 에 붙이기): 기술트리와 다른 계산 경로가 생기고, 노드 시트 스냅샷 갱신 문제가 추가된다. "서버가 판정" 원칙은 대처 없음·미연결 같은 **상태 판정**에 대한 것이고, 이건 표시용 합계다.
- 색: 기술연구 화면에서 **앰버는 "대처 없음" 전용**(`ResearchTree.jsx:183-190`) → 새 표시는 전부 중립(`--text3`/`--text2`). 이름 자르지 않기 규칙 유지.

## Leader 실측 (2026-09-13)
| 확인 | 결과 |
|---|---|
| 트리 노드 렌더 | `web/src/components/ResearchTree.jsx` `NodeRow`(165-289). 아래줄 `기술 · {n.techniqueName} · {n.note}` 232-241 ← 여기에 붙인다 |
| 트리 호출부 | `ResearchPage.jsx:933-943` `<ResearchTree nodes=… />` — **`techniques` prop 미전달**. 페이지는 `useCache()` 로 `techniques` 보유(275) |
| 노드 상세 | `web/src/components/ResearchNodeSheet.jsx` 숙련도 블록 325-350(`RecallLadder` 327-339, 기술 미연결 안내 341-349). `techniques` prop 받음(203-208) |
| 시트 스냅샷 | 시트의 `node` 는 `setNodeSheet({node:n})` 스냅샷 — 사용 횟수는 `node` 가 아니라 **`form.techniqueId` + `techniques` 캐시**에서 읽어야 +1 후에도 최신 |
| 합산 헬퍼 | `web/src/utils/clipUsage.js:44-51` `sumUsage(clips)` → `{view, drill, position_spar, spar, used}` — **최근 사용일 없음**. `fmtMD` 36-41, `USAGE_KIND_LABEL` 5-10 |
| 매칭 기준 | `GET /api/techniques` 가 `JSON_CONTAINS(tech_name, JSON_QUOTE(name))` **정확 일치**로 `t.clips` 를 붙인다(`techniques.js:53-70`) — 퍼지·별칭 없음(task-020b 원칙과 일치) |
| 실데이터 | user 3 연구 프로젝트 1개, 활성 버전 노드 0개 — 실데이터로는 화면 확인 불가, **user 2 픽스처로 검증** |

## 계약 R (dev-037) — 프론트만
1. **`web/src/utils/clipUsage.js`**
   - `sumUsage` 에 `last_used_on`(clip 들의 `usage.last_used_on` 중 최댓값, `YYYY-MM-DD` 문자열 비교, 없으면 `null`) 추가. 기존 필드·호출부(TechPlanPage) 동작 불변.
   - 신규 `techniqueUsage(techniques, techniqueId)` → 
     - 기술을 못 찾음 / `techniqueId` 없음 → `null`(표시 안 함)
     - `t.clips` 가 비었거나 없음 → `{ state: 'no_clips', clipCount: 0 }`
     - 합계 `used === 0` → `{ state: 'unused', clipCount, ...sum }`
     - 그 외 → `{ state: 'used', clipCount, ...sum }`
     - `techniqueId` 비교는 숫자/문자열 혼용에 안전하게(`Number()`).
2. **`web/src/components/ResearchTree.jsx`** — `techniques` prop(기본 `[]`) 받아 `NodeRow` 아래줄에 이어 붙임:
   - `used` → ` · 🥋 {used}회 · 최근 {M/D}`(최근일 없으면 생략)
   - `unused` → ` · 아직 안 써봄` / `no_clips` → ` · 영상 없음`
   - `null` 이거나 `techniqueName` 없는 노드 → 아무것도 안 붙임. 색은 기존 아래줄(`--text3`) 그대로. 줄바꿈 규칙(자르지 않음) 유지.
3. **`web/src/pages/ResearchPage.jsx`** — `<ResearchTree … techniques={techniques} />` 전달만.
4. **`web/src/components/ResearchNodeSheet.jsx`** — 숙련도 박스(`RecallLadder` 있는 쪽, 기술 연결된 경우만) 아래에:
   - `🥋 기술사용 횟수  {used}회 · 최근 {M/D}` / 내역 `드릴 {d} · 포지션 스파링 {p} · 스파링 {s}` / 안내 `이 기술이 붙은 참고영상 {clipCount}개 합계`
   - `unused` → `🥋 기술사용 횟수  아직 안 써봄` + `참고영상 {clipCount}개에서 +1 로 기록` 류 안내
   - `no_clips` → `🥋 기술사용 횟수  영상 없음` + `이 기술이 붙은 참고영상이 없어 기록할 수 없습니다` 류 안내
   - 반드시 `form.techniqueId`(편집 중 값) + `techniques` 캐시로 계산(스냅샷 금지). 기술 미연결 노드는 기존 안내만.
5. 문구 라벨은 기존 `USAGE_KIND_LABEL`·`fmtMD` 재사용. `👁 게시물 조회`는 표시하지 않는다(사용자 선택안에 없음).

### 하지 말 것
- 백엔드·API·DB 변경, `nodeView` 필드 추가
- 노드 수동 clip 링크 합산, 퍼지 매칭
- 앰버 색 사용, 이름 자르기, 프로젝트 카드 변경
- 이 화면 안에서 +1 버튼 새로 만들기(기록은 참고영상 상세에서)
- NFS 위 빌드, 커밋/푸시

## 검증 (Developer 자체 → Reviewer → **Leader 실행 검증**)
> QA 단계는 board "QA 보고 신뢰 문제"(3회 연속 사실과 다른 보고)에 따라 이번엔 **Leader 가 직접 실행**한다. dev 는 재현 가능한 하네스를 남길 것.
1. 단위: `techniqueUsage`/`sumUsage` 4상태·최근일 최댓값·id 문자열/숫자 혼용 — **실제 파일을 import** 해서 실행(함수 복제 금지).
2. 화면(CDP, 412×915, user 2 픽스처): 연구 프로젝트 1개에 노드 4개 — (a) 기록 있는 기술 (b) 영상 있고 기록 0 (c) 영상 없는 기술 (d) 기술 미연결 → 트리 아래줄 4가지 표시 스크린샷 / 노드 상세 3가지 상태 스크린샷.
3. 갱신: 참고영상에서 (b) 기술 영상에 드릴 +1 → 기술연구로 돌아와 (b) 노드가 `🥋 1회 · 최근 M/D` 로 바뀜(페이지 새로고침 없이).
4. 기술트리 카드 숫자와 같은 기술의 연구 노드 숫자가 같다.
5. 회귀: 연구 트리 기존 배지(미연결·대처 없음·자료·끊김)·접기, 기술트리 카드 합계 불변.
6. 정리: user 2 연구 프로젝트·노드·영상·기술·사용 기록 전부 삭제, 기준선(`CHECKSUM technique_mastery`, `clip_usage_logs` 행 수, user 3 연구 프로젝트 수) 시작=끝.

## dev-037 결과
- [21:34] 착수. 기준선(시작) `CHECKSUM technique_mastery=738744930` · `clip_usage_logs=10` · user 3 연구 프로젝트 1(버전 1·노드 0) · user 2 연구/기술/영상/기록/숙련도 전부 0. 하네스 `/home/brownjeon/.node-local/bjj-backup/task-037-20260913-213456/` (원본 소스 `src-before/`, 배포 전 dist `dist-before/`).
- [21:52] **변경 파일(프론트만, 백엔드·API·DB 무변경)** — `git diff --shortstat -- web/src`: 4 files +123/−3
  - `web/src/utils/clipUsage.js` — `sumUsage` 에 `last_used_on`(clip 들의 `usage.last_used_on` 최댓값, `YYYY-MM-DD` 문자열 비교, 모양 어긋난 값은 건너뜀, 없으면 null) 추가. 기존 5필드 계산 줄은 그대로. 신규 `techniqueUsage(techniques, techniqueId)` → `null` / `{state:'no_clips',clipCount:0}` / `{state:'unused'|'used', clipCount, ...sum}`. id 비교 `Number()`, `null·undefined·''·boolean·NaN` 은 null(`Number('')===0` 함정 차단).
  - `web/src/components/ResearchTree.jsx` — `techniques` prop(기본 `[]`) → `usageByNode` useMemo(노드 id→기술 단위 결과) → `NodeRow` 아래줄 `기술 · {이름}` **바로 뒤**에 `<span data-testid="research-tree-usage" data-state>` 로 ` · 🥋 N회 · 최근 M/D` / ` · 아직 안 써봄` / ` · 영상 없음`. `techniqueName` 없거나 결과 null 이면 안 붙임. span 에 style 없음(아래줄 `--text3`·wrap 상속), 파일에 nowrap/ellipsis 추가 0.
  - `web/src/pages/ResearchPage.jsx` — `<ResearchTree … techniques={techniques} />` 한 줄.
  - `web/src/components/ResearchNodeSheet.jsx` — `usage = useMemo(techniqueUsage(techniques, form.techniqueId))`(스냅샷 아님) + `NodeUsageBox`(숙련도 field 안, 사다리 박스 아래, `form.techniqueId != null && usage` 일 때만). 라벨은 `MANUAL_KINDS`·`USAGE_KIND_LABEL`·`fmtMD` 재사용, 색 `--text/--text2/--text3` 만, 버튼 없음, 👁 조회 미표시.
- [21:52] **Leader 확인 필요(내 재량으로 정한 3가지)** ① 트리 조각 위치 = 기술 이름 바로 뒤, 메모는 그 뒤(`기술 · 암바 · 🥋 5회 · 최근 9/12 · 메모`) — 계약 "이어 붙임"을 기술에 붙는 정보로 해석. ② 시트 `unused` 안내 문구 = `이 기술이 붙은 참고영상 N개 — 참고영상 상세에서 🥋 +1 로 기록합니다`(계약 "류 안내"). ③ `sumUsage` 가 형식이 틀린 `last_used_on`(예 `2026-9-1`)을 무시 — 문자열 최댓값 비교가 잘못된 값에 끌려가지 않게.
- [21:45] **빌드·배포** — rsync src → ext4 work(4파일 NFS/work md5 동일 확인) → `npm run build`(ext4) → `rsync dist/ → ~/.node-local/bjj-web/dist --delete`. index.html 소스 변경 없음·pm2 재시작 안 함. `curl -s localhost:3000/` 와 `/research` → `assets/index-yRVVVCex.js`(이전 `index-DoY8nhbZ.js`), 서빙 JS 에 `research-tree-usage`·`research-node-usage` 각 1회 존재. 롤백: `rsync -a --delete <backup>/dist-before/ ~/.node-local/bjj-web/dist/`.
- [21:40] **검증 1 단위 — 실제 파일 import** `node harness/unit-clipUsage.mjs` → `import web/src/utils/clipUsage.js md5=095b1462…` **25 PASS / 0 FAIL** (`unit-clipUsage.log`). sumUsage: 빈 입력·기존 5필드 합계 불변·키 추가 1개·최댓값(순서 무관·연도 경계)·형식 어긋남 무시·usage 없는 clip. techniqueUsage: null 입력 7종·배열 아님·못 찾음·no_clips 3형태(빈 배열/키 없음/객체)·unused(조회만)·used 합계·id 숫자↔문자열 3방향·같은 기술 같은 값·최근일 없음·입력 불변. **민감도 확인**(`unit-mutants.log`): 변경 전 파일 → 크래시/다수 FAIL, 최댓값→최솟값 변이 → 5 FAIL, `Number()` 제거 변이 → 3 FAIL.
- [21:43] **검증 1′ 렌더 — 실제 컴포넌트** `harness/render-037.sh`(NFS↔ext4 md5 동일 확인 후 work 의 esbuild 로 ResearchTree·ResearchNodeSheet 번들 → react-dom/server) **19 PASS / 0 FAIL** (`render-037.log`): 아래줄 정확 문자열 4상태 + 캐시에 없는 기술·최근일 없음·메모 순서·prop 생략, 새 표시 div/span 에 nowrap·ellipsis·amber 없음, 시트 3상태 문구 정확·미연결 박스 없음·+1 버튼 0·👁 미표시. 🔴 SSR 은 매번 새 마운트라 "열린 시트 갱신"은 못 잡음 → 아래 L2 가 담당.
- [21:51] **검증 2~5 화면(CDP, 412×915, 실서버·실번들, user 2)** `shots-037.js` — run1 39/0, **run2(`run-all.sh run2`, 픽스처부터 재생성) 39 PASS / 0 FAIL** (`shots-run2.log`). 픽스처: 기술 3(암바·트라이앵글·오모플라타), 영상 A1·A2(암바)·B1(트라이앵글), 사용 기록(암바 드릴3·포지션1·스파링1, A1 최근 9/10·A2 최근 9/12 / B1 조회만), 연구 프로젝트 1 + 활성 v1 + 노드 4(루트 (d) 포지션 미연결+끊긴 링크 / (a) 피니시 암바+자료 A2 / (b) 리액션 트라이앵글 / (c) 세팅 오모플라타+**수동 링크 A1**).
  - 2 트리: (a) `기술 · 테스트037암바 · 🥋 5회 · 최근 9/12` · (b) `… · 아직 안 써봄` · (c) `… · 영상 없음 · 다리를 어깨 바깥으로`(수동 링크 A1 합산 안 됨) · (d) 조각 없음. 조각·아래줄 computed color = `--text3`(≠ `--amber`), white-space normal, scrollWidth 412.
  - 2 시트: used `5회 · 최근 9/12 / 드릴 3 · 포지션 스파링 1 · 스파링 1 / 참고영상 2개 합계`(사다리 설명 뒤, 시트 뷰 안) · unused · no_clips(자료 T037-A1 붙어 있어도 영상 없음) · 미연결은 박스 없이 기존 안내. 추가: (c) 시트에서 연결 해제→박스 사라짐→암바 선택→**저장 전** `5회 · 최근 9/12` → 저장 없이 닫기 → DB technique_id 143 그대로·연구 쓰기 요청 0.
  - L2(열린 시트 갱신): (a) 시트 연 채 자료 A2 열기 → 스파링 +1(`POST /clips/A2/usage {"kind":"spar"}` + `GET /api/techniques` 완료) → 참고영상 모달만 닫기 → **같은 시트**가 `6회 · 최근 9/13 / 스파링 2`.
  - 3 갱신: 하단 탭 `기술`→참고영상→B1 상세→드릴 +1(toast `숙련도 '드릴' 단계 체크됨 — 테스트037트라이앵글`) → 하단 탭 `연구` → 프로젝트 → (b) `기술 · 테스트037트라이앵글 · 🥋 1회 · 최근 9/13`. `window` 마커·`performance.timeOrigin` 전 구간 유지 = 새로고침 없음.
  - 4 숫자 일치: 기술트리 카드 `👁 2 · 🥋 6`(암바)·`👁 2 · 🥋 1`(트라이앵글)·오모플라타 태그 없음 = 연구 노드 = `GET /api/techniques` 합계. 기술 상세 `👁 2 · 🥋 6` + `드릴 3 · 포지션 스파링 1 · 스파링 2`.
  - 5 회귀: 배지 미연결·자료 1·끊김 1(d)·대처 없음(b)·앰버 점선은 (b)만, 루트 접기 → `하위 3개 접힘`·자식 3 숨김 → 펼치기 후 조각 그대로, console error/exception 0.
- [21:51] **스크린샷**(run2, `…/task-037-20260913-213456/shots/`, 전부 PNG 412×915, md5 12개 모두 다름, mtime KST 21:50:53~21:51:17, `harness/shots-meta.json`): `412-01-tree-4states`(70824B, 449d3d3b…) · `02-sheet-a-used`(57901B, b0ebb73a…) · `03-sheet-b-unused`(67562B, e982df2d…) · `04-sheet-c-no-clips`(59340B, be90123f…) · `05-sheet-c-form-picked-amba-unsaved`(57658B, 9ded85b4…) · `06-sheet-d-unlinked`(52894B, 73ff088a…) · `07-sheet-a-live-after-spar`(60617B, 47f22fef…) · `08-clips-b1-drill-plus1`(50211B, ed59627c…) · `09-tree-after-refresh`(75512B, 2a100bc0…) · `10-techtree-cards`(37630B, 67139e57…) · `11-tech-detail-amba`(35347B, 0c3a6020…) · `12-tree-collapsed`(69299B, 11dea6ea…). 육안 확인함. 참고: headless Chrome 에 컬러 이모지 폰트가 없어 🥋 가 흑백 도복 글리프로 찍힌다(기존 기술트리 카드도 같음 — 코드 문제 아님).
- [21:52] **정리 증명** — 테스트 중 기준선은 실제로 바뀌었다(`baseline-run1-before-cleanup.txt`: CHECKSUM 1673108361·logs 21·user 2 연구 1/1/4/3·tm 1). `cleanup-037.sh` 후 `baseline-before.txt` ↔ `baseline-run1-after-cleanup.txt` diff 0, run2 도 `baseline-run2-start` ↔ `baseline-run2-end` diff 0, 최초 기준선 ↔ run2-end diff 0: CHECKSUM 738744930 · clip_usage_logs 10 · user 3 연구 1/1/0/0/0 · user 3 영상 139·기술 54·기록 10 · user 2 전부 0 · MAX(id) 불변. user 3 은 기준선 SELECT 외 접촉 없음(토큰도 user 2 만 발급).
- [21:52] **Leader 재실행 명령** (한 번에: 기준선→픽스처→단위→렌더→화면→정리→기준선 diff, 실패해도 trap 으로 정리)
  ```bash
  H=/home/brownjeon/.node-local/bjj-backup/task-037-20260913-213456/harness
  $H/run-all.sh leader        # → unit-leader.log · render-leader.log · shots-leader.log · baseline-leader-diff.txt(비어야 정상)
  # 단계별로 돌리려면:
  $H/baseline.sh > /tmp/b0.txt
  NODE_PATH=/home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/backend/node_modules node $H/fixtures-037.js
  node $H/unit-clipUsage.mjs            # 인자로 다른 파일 경로를 주면 그 파일을 import
  $H/render-037.sh                      # ext4 work 사본이 NFS 와 다르면 exit 3 (rsync 먼저)
  NODE_PATH=/home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/backend/node_modules node --experimental-websocket $H/shots-037.js
  $H/cleanup-037.sh && $H/baseline.sh | diff /tmp/b0.txt -
  ```
  주의: shots 는 기대 번들을 `~/.node-local/bjj-web/dist/index.html` 에서 읽고, "최근" 날짜 기대값은 KST 오늘로 계산한다. 화면 검증은 B1 드릴 +1 로 user 2 `테스트037트라이앵글` 숙련도 drilled 를 켠다(task-035 기존 동작) — cleanup 이 지운다.
- [21:52] self_check: unit 25/25 · render 19/19 · CDP 39/39(2회) · build OK · lint/type_check 스크립트 없음(미실행) · 커밋/푸시 안 함. status: DONE, risk LOW.

## Reviewer 결과

**검증 방식**: 코드 감사(diff 전체 + 관련 파일 전체 읽기, 프론트 4파일) + 독립 재실행(수정 없이) + `grep` 전수 소비자 조사. 소스 수정·DB 쓰기·픽스처 생성 없음(읽기 전용).

- **diff 범위**: `git diff --stat` = `web/src/utils/clipUsage.js`·`web/src/components/ResearchTree.jsx`·`web/src/components/ResearchNodeSheet.jsx`·`web/src/pages/ResearchPage.jsx` 4파일 +123/−3 (agent-vault 로그 2줄 별도) — 백엔드·API·DB·`package.json` 변경 0. `web/node_modules` NFS 부재 확인(빌드 규칙 위반 없음).
- **배포 확인**: 서빙 번들 `~/.node-local/bjj-web/dist/assets/index-yRVVVCex.js` 에 `research-tree-usage`·`research-node-usage` 각 정확히 1회(`grep -o` 재확인, dev 보고와 일치).
- **단위 테스트 독립 재실행**: `node harness/unit-clipUsage.mjs`(대상 파일=현재 소스, md5=`095b1462eba4f652e8180dacdcba7f2e` — dev 보고와 동일) → **25 PASS / 0 FAIL** 재현됨.
- **`sumUsage` 하위호환**(계약 R-질문 1): `grep -rn sumUsage web/src` → 소비자는 `TechPlanPage.jsx` 뿐(218-219·280·394·401). 전부 `.view`/`.used`/`.drill`/`.position_spar`/`.spar` 필드를 직접 참조하고 spread·`Object.keys`/`for..in` 순회 없음 → 신규 `last_used_on` 키 추가는 안전. 단위 테스트 S2b(`Object.keys(s)` 정확히 6개)로도 확인.
- **`techniqueUsage` 소비자**: `grep -rn techniqueUsage web/src` → `ResearchTree.jsx`·`ResearchNodeSheet.jsx` 뿐(신규 함수, 회귀 대상 없음).
- **`usageByNode` useMemo**(`ResearchTree.jsx:322-326`) deps `[nodes, techniques]` — `techniques` 캐시 참조가 바뀌면(예: 참고영상 +1 → `reloadTechniques()`) 재계산됨. 값은 "노드id → 기술 단위 결과"라 같은 `technique_id` 를 쓰는 두 노드가 같은 모양을 받는다(계약대로).
- **`ResearchNodeSheet.jsx:261`** `usage = useMemo(() => techniqueUsage(techniques, form.techniqueId), [techniques, form.techniqueId])` — **스냅샷(`node`) 아님**, 편집 중 `form.techniqueId` 를 그대로 따라감을 코드로 확인(dev 스크린샷 05: 연결 해제→기술 재선택→저장 전 반영으로 실측까지 됨).
- **박스 배치**(`ResearchNodeSheet.jsx:376-404`): `NodeUsageBox` 는 "숙련도" `field` 안, `RecallLadder` 박스 바로 아래 형제 요소 — Leader 미리보기 레이아웃과 일치. `form.techniqueId == null`(미연결)이면 그려지지 않음.
- **트리 표시**(`ResearchTree.jsx:246-259`): 기존 배지 블록(미연결/대처없음/자료/끊김, 222-233)은 diff 밖의 별개 블록이라 회귀 없음. 새 `<span data-testid="research-tree-usage">` 는 `기술 · {이름}` 바로 뒤·`note` 앞에 삽입되어 Leader 승인 재량안 ①과 일치. `style` 미지정 → 부모의 `--text3`/`whiteSpace:normal`/`overflowWrap:anywhere` 상속(이름 자르지 않기 규칙 위반 없음). `--amber` 참조 diff 내 0건(grep 확인) — 색 규칙 준수.
- **malformed 날짜 가드**(`YMD_RE`, 승인된 재량안 ③): `^\d{4}-\d{2}-\d{2}$` 미통과 값은 스킵. `last_used_on` 은 'YYYY-MM-DD' 사전순=날짜순이라 파싱 없는 문자열 비교가 안전(연도 경계 S3c 테스트로 확인).
- **id 방어**(`techniqueUsage` 77-80행): `typeof` 가드 → `String(id).trim()===''` 가드 → `Number.isFinite` 가드 3단으로 `Number('')===0` 함정을 정확히 차단(주석·테스트 T1 일치).
- **접기(collapse)**: `collapsed` 는 별개 `useState`라 `usageByNode` 재계산과 무관 — 회귀 없음(코드 확인, 화면 검증은 dev 스크린샷 12로 이미 확인됨).

### 발견 사항
Critical 0 / High 0 / Medium 0 / Low 0 — 결함 없음. 참고용 정보성 메모 2건(수정 불필요):

1. **[정보성]** `ResearchNodeSheet.jsx:403` — 페이지 최초 진입 직후처럼 `techniques` 캐시가 아직 빈 배열인 짧은 순간에는 기술이 연결된 노드라도 `techniqueUsage([], id)` → `null` 이라 박스가 한 프레임 안 보였다가 캐시 도착 후 나타난다. 계약의 "null → 표시 안 함" 정상 동작 범위이고 자동 복구되므로 결함 아님 — Leader 실행 검증 때 참고만 하면 됨.
2. **[정보성]** `🥋`/`👁` 이모지에 별도 `aria-label` 없음 — 그러나 `TechPlanPage.jsx:219,394` 기존 코드도 동일 패턴이라 이번 변경이 새로 만든 격차가 아니다(기존 일관성 유지). 조치 불필요.

### Leader 실행 검증 시 참고
- 이 리뷰에서 이미 read-only 로 재현·확인 완료: 단위 25/25(직접 재실행, md5 일치) · `sumUsage`/`techniqueUsage` 소비자 전수 grep · diff 범위(백엔드·DB 무변경 확인) · 배포 번들 문자열 확인 · 코드 레벨 배치·회귀 점검. **단위 테스트·grep·diff 범위 재확인은 중복이니 생략 가능.**
- Leader 는 `run-all.sh leader`(화면 CDP·정리·기준선 diff)만 재실행하면 된다. 특히 확인 권장: (a) 시트를 연 채 참고영상에서 +1 → 시트가 새로고침 없이 갱신되는지(L2 시나리오, `form.techniqueId`+캐시 조합의 실사용 검증), (b) 트리·시트·기술트리 카드 세 곳 숫자 일치, (c) 정리 후 기준선(`CHECKSUM technique_mastery`·`clip_usage_logs`·user 3 연구 프로젝트 수) 시작=끝.
- Leader 재량 승인 3건(트리 조각 위치 / 시트 unused 문구 / malformed 날짜 스킵)은 코드에 반영되어 있음을 확인 완료 — 재확인 불요.

### 판정
**PASS** — Critical 0 / High 0(+정보성 2). QA 단계는 board "QA 보고 신뢰 문제"에 따라 생략, Leader 실행 검증으로 인계.

## Leader 실행 검증 (2026-09-13 21:59:57~22:01:10)
QA 에이전트 대신 Leader 가 dev 하네스를 직접 실행: `harness/run-all.sh leader` → **exit 0**.
| 단계 | 결과 (로그 mtime 은 전부 실행 구간 안) |
|---|---|
| 기준선(시작) | `CHECKSUM technique_mastery 738744930` · `clip_usage_logs 10` · user 3 연구 프로젝트 1(노드 0) · 영상 139 · 기술 54 · user 2 전부 0 |
| 단위 `unit-leader.log` | **25 PASS / 0 FAIL** |
| 렌더 `render-leader.log` | **19 PASS / 0 FAIL** |
| 화면 `shots-leader.log` | **39 PASS / 0 FAIL** · 스크린샷 12장 22:00:40~22:01:02 재생성 · md5 12개 모두 다름 · 전부 412×915 |
| 정리·기준선 | `BASELINE start=end OK`, `baseline-leader-diff.txt` 0바이트 |
- 핵심 통과 항목: `3 (b) 노드가 "기술 · 테스트037트라이앵글 · 🥋 1회 · 최근 9/13" 로 바뀜`(참고영상 드릴 +1 → 새로고침 없이) · `L2 열어 둔 시트가 6회·최근 9/13 로 갱신` · `4 암바: 기술트리 카드 = 연구 노드 = 서버 합계(6)` · `1f/1g 기존 배지·앰버 점선 회귀 없음` · `5 접기/펼치기 후 조각 유지`.
- Leader 가 `412-09-tree-after-refresh.png`(22:01:00) 직접 열람 — (a) `🥋 6회 · 최근 9/13` · (b) `🥋 1회 · 최근 9/13` · (c) `영상 없음` · 루트는 표시 없음.
- 참고: 픽스처가 사용 기록을 DB 에 직접 넣어 dev 스크린샷 `412-02` 사다리의 드릴 단계가 `미완료`로 보인다 — 앱 경로(+1 → 자동 체크)에서는 생기지 않는 픽스처 산물.

## 최종 요약
**기술연구 트리와 노드 상세에서 그 기술을 얼마나 연습했는지 보입니다.** (배포·커밋·푸시 완료)

- **트리 노드** 아래줄에 기술 이름 뒤로 붙습니다: `기술 · 암바 · 🥋 5회 · 최근 9/13`. 참고영상은 있는데 기록이 없으면 `아직 안 써봄`, 그 기술이 붙은 참고영상이 아예 없으면 `영상 없음`. 기술이 연결되지 않은 노드는 지금처럼 아무것도 안 붙습니다.
- **노드 상세** 숙련도 아래에 `🥋 기술사용 횟수 5회 · 최근 9/13`, `드릴 3 · 포지션 스파링 1 · 스파링 1`, `이 기술이 붙은 참고영상 2개 합계`.
- 숫자는 **기술 단위**라 같은 기술을 쓰는 노드는 같은 값이고, **기술트리 카드 숫자와 항상 같습니다**(같은 데이터·같은 계산). 노드에 수동으로 붙인 영상 링크는 합산하지 않습니다.
- 참고영상에서 +1 하면 기술연구 화면이 새로고침 없이 바로 바뀝니다. 노드 상세를 열어 둔 채여도 갱신됩니다.
- 프론트 4파일만 변경(백엔드·DB 무변경). 단위 25 · 렌더 19 · 화면 39 PASS(개발 2회 + Leader 직접 1회), 테스트 데이터 정리 후 실제 데이터 동일.
