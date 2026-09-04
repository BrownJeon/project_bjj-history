---
project: bjj-trainning
updated: 2026-09-04
tags:
  - type/context
---
# 현재 상태

## 지금 상태

**운영 중** — pm2 `bjj`, 포트 3000 (backend가 `/api/*` + SPA 서빙). 작업트리 clean, task-012까지 전부 커밋 완료.

### 2026-09-04 완료 — 미커밋 변경분 정리
- [[task-012-position-rename-cascade]] — **2026-08-28 다른 세션이 작성하다 커밋 없이 중단한 코드**(포지션 이름 일괄 변경)를 검증 순환에 태워 정리. Reviewer가 **커밋 차단 결함(CRITICAL)** 발견 — 4개 저장소를 트랜잭션 없이 순차 갱신해, `drills.pos`(varchar(50)+STRICT 모드)에서 실패하면 기술·영상만 새 이름으로 바뀐 채 **복구 불가능하게 갈라짐**. Developer가 트랜잭션+길이검증(400)+스파링 병합 중복제거로 수정, **일부러 실패시켜 롤백을 실측하고 수정 전 코드로 split-brain을 재현(네거티브 컨트롤)**. Reviewer 재검증 PASS(쿼리 8개 트랜잭션 전달 라인 대조 + 관련 테이블 InnoDB 확인), QA 7항목 검증. 실데이터 무손상 확인(기술47/영상132/스파링54/드릴24 작업 전후 동일).
- [[task-011-clip-tag-pin-pickmeup-spar-feedback]] — 2026-08-25 커밋 `804aa24`가 vault 이력 없이 남아 있어 **사후 기록**으로 복원. 이 범위는 팀 검증을 거친 증거가 없으니 이상 발생 시 여기부터 의심할 것. DB 컬럼 반영은 실측 확인됨.
- [[task-005-avatar-static-path-mismatch-fix]] — board·ACTIVE가 링크하는데 파일이 없던 **끊어진 위키링크**를 스텁으로 복구.

### 2026-08-24 완료
- [[task-010-study-ux-improvements]] — `/study` 화면 사용성 개선: **제목 입력**(`title_locked` 컬럼, 재분석해도 회귀 없음 실측), **검색+기술/분류 필터+분류배지**(목록 API에 `techniqueNames` 조인 추가, `ClipsPage.jsx` 패턴 재사용), **영상 sticky 고정+활성 챕터 하이라이트**(구간 클릭 시 그 자리에서 재생 확인). 등록 폼은 참고영상 화면과 동일하게 Modal로 전환. **Developer가 브라우저 실행 검증 중 실제 버그 발견·수정**(일부 영상 제목이 한글 자모분리형(NFD)으로 저장돼 검색이 안 되던 문제 — NFC 정규화로 해결, Reviewer가 channel 필드까지 커버되는지 재확인). 파이프라인(S0~S10) 무수정. Developer→Reviewer→QA 전 단계 통과(Critical 0/High 0/Medium 0/Low 1 비차단) — 지금까지 진행한 task 중 가장 깔끔하게 끝남. 상세: [[task-010-study-ux-improvements]]

### 2026-08-23 완료
- [[task-009-long-video-study-phase3]] — 긴 영상 분석 `/study` **Phase 3(기술추출 연동+챕터편집)**. 기술명 결정적 매칭(exact→별칭→유사도, AI 재호출 없음, S10) + `/apply` 승인형 연동(`VideoClip.create()` 직접 호출로 구 파이프라인 오발동 우회) + `ChapterEditor.jsx`. **핵심 안전장치 실측**: 전체 파이프라인을 두 번(등록+재분석) 완주해도 승인 전까지 기술트리(`techniques` 테이블) 행 수가 전혀 안 늘어남을 확인. Reviewer가 실사용 시나리오(챕터 1개만 편집) 재현 중 **HIGH 데이터손실 버그 발견**(편집 저장 시 안 건드린 챕터까지 전부 초기화) → Developer 수정 → Reviewer 2가지 시나리오로 독립 재검증 PASS. Developer→Reviewer→QA 전 단계 통과(Critical 0/High 0/Medium 1 비차단). 이걸로 설계서의 핵심 산출물 3가지(목차·구간요약·기술연동) 전부 완성 — Phase 4(운영보강)는 선택사항으로 남음. 상세: [[task-009-long-video-study-phase3]]
- [[task-008-long-video-study-phase2]] — 긴 영상 분석 `/study` **Phase 2(구간 캡처+요약)**. S7(챕터당 프레임3장)~S9(구간분석+종합) 추가, `claudeCli.js`에 interactive/batch 우선순위 2레인 도입(기존 5개 AI기능 호출부 무수정 유지). **가장 중요한 검증**: 긴 영상 분석이 도는 도중 실제로 메모보완 API를 호출해 35.6초 만에 응답하는 것까지 실측(우선순위 큐 존재 이유 증명). 5챕터 실제 강의 영상으로 S7~S9 전체 완주(전부 done, 종합요약 468자)도 실측. task-007 QA가 남긴 `ai_calls` 카운팅 버그 원인 확정·수정, 영상삭제 시 프레임파일 미정리 버그도 자체 발견·수정. QA가 두 차례 핵심 항목을 대리 검증으로 넘어가려 해 Leader가 반려·재지시 후 최종 6/6 PASS. 상세: [[task-008-long-video-study-phase2]]
- [[task-007-long-video-study-phase1]] — 긴 영상(5분~1시간 강의·세미나·스파링) 분석 신규 화면 `/study` **Phase 1(목차까지만)**. 신규 도메인 4테이블+워커+파이프라인(S0~S6)+API 9개+프론트+기술탭 토글. **챕터 판단 4단계 우선순위(유튜브 메타→자막 AI→15장 시각 AI→단일챕터) 전부 실제 영상으로 runtime 검증 완료** — 자막 기반은 김규민 선수 스파이더가드 강의로 5개 구간, 시각판단은 무자막 영상으로 1개 구간, 둘 다 저confidence는 중립 라벨 규칙 준수 확인. 구현 중 버그 2건 발견·수정(편집 챕터 제목이 재분석 시 사라지던 순서버그, 다운로드 중 취소가 "실패"로 오표시되던 버그). Developer→Reviewer(PASS)→QA(9/9 PASS) 전 단계 통과. 상세: [[task-007-long-video-study-phase1]]

### 2026-08-22 완료
- [[task-006-ytdlp-403-fix]] — 참고영상 YouTube AI 분석이 403으로 실패하던 버그 수정. 원인은 앱 코드가 아니라 **yt-dlp 구버전**(2026.06.09)이 YouTube 변경을 못 따라간 것. 2026.08.19로 업그레이드 + 주간 자동업데이트 cron(`0 4 * * 0`, `scripts/update-ytdlp.sh`) 등록 + 실패 시 한국어 안내 추가

### 2026-08-18 완료 (프로필 3건)
- [[task-003-profile-training-days-multi-affiliation]] — 수련일수 표시 + 소속 다중등록(`networks` TEXT/JSON)
- [[task-004-profile-avatar-upload]] — 프로필 사진 업로드를 화면에 연결(백엔드 API는 이미 존재했으나 미연결 상태였음)
- [[task-005-avatar-static-path-mismatch-fix]] — avatar 저장 경로와 `/uploads` 정적 서빙 경로 불일치로 사진이 항상 깨지던 근본 버그 수정. 실사용자 사진 복구. SPA 폴백이 없는 `/uploads/*`도 200으로 위장하던 구조적 원인도 함께 제거

## 다음 할 일 — 긴 영상 분석 Phase 4 (선택사항, 급하지 않음)

Phase 1~3 + UX개선(task-010) 완료돼 `/study`에서 영상 등록(제목 지정 가능) → 검색/필터로 찾기 → 챕터 목차 → 챕터별 요약 → 기술트리 승인 연동 → 챕터 편집까지 전부 실사용 가능하다. **Phase 4**(화질 프로필 설정 UI, Whisper 폴백, `resume_from` 진짜 단계별 재개, 프레임 GC 크론)는 운영 보강용 선택 항목이라 사용자가 필요하다고 판단할 때만 착수하면 됨 — 설계서 §7 Phase 4 절 참고.

### 백로그
- **챕터 편집 여러 번 + 재분석 시 제목 중복 표시 가능** (task-009 Reviewer 발견, Medium, 데이터 손실 아님) — `longVideoPipeline.js`의 `existingEdited.find()`가 새 챕터마다 독립적으로 첫 겹침만 채택하는 구조적 한계(task-007 Reviewer가 최초 예견했던 리스크). 최다-겹침 매칭으로 개선하면 해소 가능.
- **활성 챕터 하이라이트가 챕터 편집 후 조용히 사라짐** (task-010 Reviewer 발견, Low, 데이터 손실·오작동 없음) — `ChapterEditor`로 챕터 경계를 바꾸면 챕터 id가 바뀌어 `activeChapterId`가 더 이상 유효한 챕터를 안 가리키게 됨(잘못된 챕터를 가리키진 않고 그냥 강조가 사라짐). 재조회 시 `activeChapterId`를 null로 초기화하면 해소.
- **한글 NFD(자모분리) 인코딩 이슈 — task-010에서 발견, 검색은 수정 완료, 다른 곳은 미점검** — yt-dlp가 일부 영상 제목을 자모분리형으로 반환하는 경우가 있음. `/study` 검색은 NFC 정규화로 수정됐으나, 이 앱의 다른 텍스트 검색/비교 로직(참고영상 검색 등)에도 같은 문제가 잠재할 수 있음 — 실사용 중 이상 느끼면 이것부터 의심할 것.
- **`assertPromptSize`(24,000자 하드캡) 잠재 리스크** — Phase 2에서 `claudeCli.js`에 전 AI 기능 공통으로 추가된 프롬프트 길이 상한. 지금은 전부 여유 있으나 코치리포트(90일 훈련데이터 요약)처럼 컨텍스트가 큰 기능은 사용자가 훈련을 오래 쌓으면 나중에 이 캡에 걸릴 수 있음 — 코치리포트가 실패하면 이것부터 의심할 것.
- ~~**별건 버그**: `ai_recommendation` 모델 속성 누락~~ → **해소됨**. 커밋 `804aa24`의 `models/VideoClip.js +1`이 이미 고쳤고 DB 컬럼도 존재함을 2026-09-04 실측 확인.
- **포지션 삭제는 전파되지 않음**(task-012 Reviewer LOW-1) — rename은 기술·영상·드릴·스파링 4곳에 퍼지는데 `DELETE /positions/:name`은 여전히 techniques에서만 제거한다. 모달 경고문이 이 동작을 정확히 고지하고 있어 비차단이나, 나중에 통일할지 결정 필요.
- **`PickHistory.user_id`가 nullable**(task-011) — 다른 테이블은 계정별 격리(task-002)가 적용됐는데 이 컬럼만 모델·DB 모두 nullable. 격리 누수 여부 미점검.
- **스파링 기록의 레거시 문자열 포지션 항목**(task-012 범위 밖) — `positions`에 객체가 아닌 문자열이 섞이면 rename 대상에서 빠진다. 현재 실데이터 18행은 전부 객체라 영향 없음.
- AnalysisPage (월별 훈련량·승률·약점 통계) — 미착수
- M4 API 서버(`192.168.219.163:8001`) launchd 영구 기동 — 현재 nohup 수동, 이미지 생성 미응답 상태라 Pollinations 폴백으로 운영 중

## 열린 결정

- **긴 영상 챕터 판단 품질** — task-007 QA에서 자막기반·시각판단 두 경로 모두 실제 영상으로 확인, 결과가 합리적(저confidence는 중립 라벨)이라 §8이 우려한 "품질이 나쁘면 후퇴" 상황까지는 아니었음.
- **Claude 우선순위 2레인** — Phase 2에서 `claudeCli.js`에 interactive/batch 큐 도입 완료. 실제로 긴 영상 분석 도중 메모보완 호출이 35.6초 만에 응답하는 것까지 실측 확인해 "다른 AI 기능이 안 막힌다"는 목적이 실증됨.
- **기술트리 자동오염 방지** — Phase 3에서 "승인 전까지 자동 생성 없음" 원칙을 파이프라인 2회 완주로 실측 검증. 이 프로젝트의 기술트리 무결성에 가장 중요한 안전장치.
- **QA 검증 관행** — Phase 1·2·3 세 번 모두 QA가 가장 중요한 항목을 코드 검토나 남의 테스트 재인용으로 넘어가려다 Leader가 반려·재지시하는 패턴이 반복됨(Phase 3는 지시문에 처음부터 명시했음에도 재발). 다만 Phase 3에서는 Reviewer가 해당 항목을 **같은 목적으로 직접 재현한 증거**였기 때문에 Phase 1·2와 달리 그 부분은 그대로 인정하고, QA 고유의 새 결함("pm2 인증 이슈"라는 부정확한 진단)만 Leader가 직접 코드를 읽어 원인(JWT payload 필드명 오류)을 규명·정정함. **다음 세션 참고**: QA(Haiku)는 매번 반려 없이 한 번에 제대로 하지 못하는 경향이 있으니, 처음부터 "이미 같은 목적으로 실행된 증거는 인용 가능하나 새로 발견하는 것/근거 없는 진단은 반드시 재확인"이라고 구분해서 지시하면 반려 왕복을 줄일 수 있음.
- **다중 세션 동시 작업 환경** — 이 워크스페이스는 여러 세션이 bjj-trainning을 동시에 건드릴 수 있음(Phase 2~3 진행 중 여러 차례 확인됨). 작업 시작 전 `git status`+board.md 확인이 필수. Edit/Write 도구가 "PreToolUse hook ... host client may be unreachable"로 일시 실패하는 환경 이슈도 여러 세션(Developer 에이전트, 메인 세션 모두)에서 관측됨 — 재시도하면 대체로 해소됨, 지속되면 사용자에게 알릴 것.
