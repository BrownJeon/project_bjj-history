# IMP-0001 참고 목록 반영 계획 (dry-run)

- 모드: dry-run (DB 접속·쓰기 없음, 오프라인 스냅샷) · 대상 user_id 3
- plan_sha: `4c6666e729b50abe2b371e5c8d03984f6aa1a724dc31ad6f34e6bf8799e9d354`
- snapshot_fingerprint: `a8d2dbec081ffe844482f67c47c36ec198e597aaa4ab76e52a25da789cd2ef06`
- 참고 항목 159개 · 스냅샷 기존 기술 60행

## 집계

- 도구 매칭(exact/alias/none): none 131 · exact 24 · alias 4
- 계획 매칭(관장 후보 반영): none 110 · coach_candidate 21 · exact 24 · alias 4
- 조치: review_new 100 · review_link_existing 25 · keep_existing 24 · hold 10
- **none 분리 집계**: 도구 none 131 = 관장 후보 21 + 남은 none 110 (남은 none 조치: review_new 100 · hold 10)
- tool_none 은 신규 개수가 아니다. 신규 검토 대상은 review_new 뿐이며 그것도 사용자 결정 전이다.
- 이 계획으로 생성될 행 0 · 연결 0 (결정 파일 없이 아무것도 쓰지 않는다)

## 항목

| slug | 이름 | kind | 매칭 | 기존 id/이름 | 조치 | 근거 |
|---|---|---|---|---|---|---|
| `standing` | 스탠딩 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `single-leg-takedown` | 싱글 레그 테이크다운 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `collar-drag` | 칼라 드래그 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `ankle-pick` | 앵클 픽 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `double-leg-takedown` | 더블 레그 테이크다운 | technique | coach_candidate | 30 / 더블렉 | review_link_existing | 관장 후보(id 30, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `inside-trip` | 인사이드 트립 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `outside-trip` | 아웃사이드 트립 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `break-fall` | 낙법 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `takedown` | 테이크다운 | concept | exact | 33 / 테이크다운 | keep_existing | exact 대응 — 기존 행(id 33) 그대로 유지 |
| `open-guard` | 오픈 가드 | position | exact | 39 / 오픈가드 | keep_existing | exact 대응 — 기존 행(id 39) 그대로 유지 |
| `closed-guard` | 클로즈 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `half-guard` | 하프 가드 | position | exact | 40 / 하프가드 | keep_existing | exact 대응 — 기존 행(id 40) 그대로 유지 |
| `de-la-riva-guard` | 델라히바 가드 | position | coach_candidate | 3 / 델라리바 | review_link_existing | 관장 후보(id 3, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `single-leg-x-guard` | 싱글 레그 X 가드 | position | coach_candidate | 28 / 싱글엑스 | review_link_existing | 관장 후보(id 28, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `sweep` | 스윕 | concept | exact | 32 / 스윕 | keep_existing | exact 대응 — 기존 행(id 32) 그대로 유지 |
| `knee-shield` | 니실드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `butterfly-guard` | 버터플라이 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `lasso-guard` | 라쏘 가드 | position | alias | 6 / 라쏘 | review_link_existing | 별칭 사전 대응(id 6) — 자동 확정 금지, 연결 여부 사용자 검토 |
| `k-guard` | K 가드 | position | exact | 34 / k가드 | keep_existing | exact 대응 — 기존 행(id 34) 그대로 유지 |
| `x-guard` | X 가드 | position | alias | 18 / 엑스가드 | review_link_existing | 별칭 사전 대응(id 18) — 자동 확정 금지, 연결 여부 사용자 검토 |
| `tripod-sweep` | 트라이팟 스윕 | technique | coach_candidate | 2 / 트라이포드 | review_link_existing | 관장 후보(id 2, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `deep-half-guard` | 딥 하프 가드 | position | exact | 38 / 딥 하프가드 | keep_existing | exact 대응 — 기존 행(id 38) 그대로 유지 |
| `reverse-de-riva-guard` | 리버스 델라히바 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `spider-guard` | 스파이더 가드 | position | coach_candidate | 7 / 스파이더 | review_link_existing | 관장 후보(id 7, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `worm-guard` | 웜 가드 | position | exact | 103 / 웜가드 | keep_existing | exact 대응 — 기존 행(id 103) 그대로 유지 |
| `balloon-sweep` | 벌룬 스윕 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `coyote-guard` | 코요테 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `kimura-sweep` | 기무라 스윕 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `kiss-of-dragon` | 키스 오브 드래곤 | technique | exact | 382 / 키스 오브 드래곤 | keep_existing | exact 대응 — 기존 행(id 382) 그대로 유지 |
| `scissors-sweep` | 시저스 스윕 | technique | exact | 26 / 시저스 스윕 | keep_existing | exact 대응 — 기존 행(id 26) 그대로 유지 |
| `sit-up-guard` | 싯업 가드 | position | coach_candidate | 46 / 싯팅 가드 | review_link_existing | 관장 후보(id 46, 중간(맥락 필요)) — 사용자 결정 전, 자동 확정 금지 |
| `flower-sweep` | 플라워 스윕 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `matrix` | 매트릭스 | technique | exact | 58 / 매트릭스 | keep_existing | exact 대응 — 기존 행(id 58) 그대로 유지 |
| `rubber-guard` | 러버 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `foot-sweep` | 풋 스윕 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `z-guard` | Z 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `collar-and-sleeve-guard` | 칼라 앤 슬리브 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `deep-de-riva-guard` | 딥 델라히바 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `lapel-guard` | 라펠 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `octopus-guard` | 옥토퍼스 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `waiter-guard` | 웨이터 가드 | position | exact | 44 / 웨이터 가드 | keep_existing | exact 대응 — 기존 행(id 44) 그대로 유지 |
| `wrestle-up` | 레슬업 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `inverted-guard` | 인버티드 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `john-wayne-sweep` | 존 웨인 스윕 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `lumberjack-sweep` | 럼버잭스윕 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `guard-recovery` | 가드 리커버리 | concept | none | - | hold | 대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류 |
| `hip-bump-sweep` | 힙 범프 스윕 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `pendulum-sweep` | 펜듈럼 스윕 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `technical-stand-up` | 테크니컬 스탠드업 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `waiter-sweep` | 웨이터 스윕 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `shin-to-shin-guard` | 신투신 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `squid-guard` | 스퀴드 가드 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `guard` | 가드 | concept | none | - | hold | 대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류 |
| `knee-cut` | 니컷 | technique | exact | 86 / 니컷 | keep_existing | exact 대응 — 기존 행(id 86) 그대로 유지 |
| `leg-drag` | 레그 드래그 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `toreando-pass` | 토레안도 패스 | technique | coach_candidate | 5 / 토레안도 | review_link_existing | 관장 후보(id 5, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `long-step` | 롱스텝 | technique | coach_candidate | 155 / 롱스탭 | review_link_existing | 관장 후보(id 155, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `pressure-pass` | 압박 패스 | concept | none | - | hold | 대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류 |
| `stack-pass` | 스택 패스 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `leg-weave` | 레그 위브 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `over-under` | 오버 언더 | technique | coach_candidate | 55 / 싱글언더 패스 | review_link_existing | 관장 후보(id 55, 중간(맥락 필요)) — 사용자 결정 전, 자동 확정 금지 |
| `smash-pass` | 스매시 패스 | concept | none | - | hold | 대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류 |
| `double-under` | 더블 언더 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `crazy-dog-pass` | 크레이지 독 패스 | technique | exact | 85 / 크레이지독 패스 | keep_existing | exact 대응 — 기존 행(id 85) 그대로 유지 |
| `gator-roll` | 게이터 롤 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `knee-slide` | 니슬라이드 | technique | exact | 4 / 니슬라이드 | keep_existing | exact 대응 — 기존 행(id 4) 그대로 유지 |
| `back-step` | 백 스텝 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `lapel-pass` | 라펠 패스 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `shin-trap` | 신 트랩 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `surfer-pass` | 서퍼 패스 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `duck-under` | 덕 언더 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `wiper` | 와이퍼 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `x-pass` | 엑스 패스 | technique | exact | 84 / 엑스패스 | keep_existing | exact 대응 — 기존 행(id 84) 그대로 유지 |
| `guard-pass` | 가드 패스 | concept | exact | 37 / 가드패스 | keep_existing | exact 대응 — 기존 행(id 37) 그대로 유지 |
| `side-control` | 사이드 컨트롤 | position | coach_candidate | 53 / 사이드 | review_link_existing | 관장 후보(id 53, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `mount` | 마운트 | position | exact | 43 / 마운트 | keep_existing | exact 대응 — 기존 행(id 43) 그대로 유지 |
| `back-take` | 백 테이크 | technique | exact | 25 / 백테이크 | keep_existing | exact 대응 — 기존 행(id 25) 그대로 유지 |
| `back-control` | 백 컨트롤 | position | coach_candidate | 36 / 백포지션 | review_link_existing | 관장 후보(id 36, 중간(맥락 필요)) — 사용자 결정 전, 자동 확정 금지 |
| `turtle` | 터틀 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `knee-on-belly` | 니온밸리 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `berimbolo` | 베림볼로 | technique | coach_candidate | 57 / 베림보로 | review_link_existing | 관장 후보(id 57, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `headquarters-position` | 헤드쿼터 포지션 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `arm-drag` | 암 드래그 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `under-hook` | 언더훅 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `front-headlock` | 프론트 헤드락 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `fifty-fifty-position` | 50 대 50 포지션 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `ashi-garami` | 아시 가라미 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `north-south-position` | 남북 포지션 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `saddle-position` | 새들 포지션 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `s-mount` | S 마운트 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `truck` | 트럭 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `crucifix` | 크루시픽스 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `body-lock` | 바디락 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `cross-collar-control` | 크로스 칼라 컨트롤 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `outside-ashi-garami` | 아웃사이드 아시 가라미 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `two-on-one` | 투 온 원 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `snap-down` | 스냅 다운 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `straight-collar-control` | 스트레이트 칼라 컨트롤 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `crab-ride` | 크랩 라이드 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `sprawl` | 스프롤 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `high-mount` | 하이 마운트 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `back-mount` | 백 마운트 | position | coach_candidate | 36 / 백포지션 | review_link_existing | 관장 후보(id 36, 중간(맥락 필요)) — 사용자 결정 전, 자동 확정 금지 |
| `honey-hole` | 허니 홀 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `backside-fifty-fifty` | 백사이드 50/50 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `inside-ashi-garami` | 인사이드 아시 가라미 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `lockdown` | 락다운 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `seat-belt-grip` | 싯벨트 그립 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `three-quarter-mount` | 3/4 마운트 | position | none | - | review_new | 대응 없음 · position — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `escape` | 이스케이프 | concept | alias | 47 / 탈출 | review_link_existing | 별칭 사전 대응(id 47) — 자동 확정 금지, 연결 여부 사용자 검토 |
| `foot-work` | 풋 워크 | concept | none | - | hold | 대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류 |
| `entry` | 엔트리 | concept | none | - | hold | 대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류 |
| `kimura` | 기무라 | technique | exact | 51 / 기무라 | keep_existing | exact 대응 — 기존 행(id 51) 그대로 유지 |
| `omoplata` | 오모플라타 | technique | exact | 63 / 오모플라타 | keep_existing | exact 대응 — 기존 행(id 63) 그대로 유지 |
| `armbar` | 암바 | technique | exact | 42 / 암바 | keep_existing | exact 대응 — 기존 행(id 42) 그대로 유지 |
| `triangle-choke` | 트라이앵글 초크 | technique | alias | 27 / 트라이앵글 쵸크 | review_link_existing | 별칭 사전 대응(id 27) — 자동 확정 금지, 연결 여부 사용자 검토 |
| `darce-choke` | 다스 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `knee-bar` | 니바 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `guillotine-choke` | 길로틴 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `straight-ankle-lock` | 스트레이트 앵클락 | technique | coach_candidate | 19 / 앵클락 | review_link_existing | 관장 후보(id 19, 높음(가설·조건 있음)) — 사용자 결정 전, 자동 확정 금지 |
| `bow-and-arrow-choke` | 보우앤로우 초크 | technique | coach_candidate | 83 / 보우 앤 애로우 | review_link_existing | 관장 후보(id 83, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `heel-hook` | 힐훅 | concept | none | - | hold | 대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류 |
| `rear-naked-choke` | 리어 네이키드 초크 | technique | exact | 9 / 리어네이키드 초크 | keep_existing | exact 대응 — 기존 행(id 9) 그대로 유지 |
| `toe-hold` | 토홀드 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `loop-choke` | 루프 초크 | technique | coach_candidate | 45 / 루프 쵸크 | review_link_existing | 관장 후보(id 45, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `inside-heel-hook` | 인사이드 힐훅 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `arm-triangle` | 암 트라이앵글 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `cross-collar-choke` | 크로스 칼라 초크 | technique | coach_candidate | 49 / 깃 쵸크 | review_link_existing | 관장 후보(id 49, 보류(낮음·포함 관계)) — 사용자 결정 전, 자동 확정 금지 |
| `foot-lock` | 풋락 | concept | coach_candidate | 19 / 앵클락 | review_link_existing | 관장 후보(id 19, 보류(낮음·포함 관계)) — 사용자 결정 전, 자동 확정 금지 |
| `wrist-lock` | 리스트 락 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `ezekiel-choke` | 이제키엘 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `banana-split` | 바나나 스플릿 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `baseball-bat-choke` | 베이스볼 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `calf-slicer` | 카프 슬라이서 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `americana` | 아메리카나 | technique | coach_candidate | 383 / 키락 | review_link_existing | 관장 후보(id 383, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `flying-armbar` | 플라잉 암바 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `tarikoplata` | 타리코플라타 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `anaconda-choke` | 아나콘다 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `baratoplata` | 바라토플라타 | technique | exact | 54 / 바라토플라타 | keep_existing | exact 대응 — 기존 행(id 54) 그대로 유지 |
| `brabo-choke` | 브라보 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `clock-choke` | 클락 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `gogoplata` | 고고플라타 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `north-south-choke` | 노스 사우스 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `buggy-choke` | 버기 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `canto-choke` | 칸토 초크 | technique | coach_candidate | 48 / 칸토 쵸크 | review_link_existing | 관장 후보(id 48, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `key-lock` | 키락 | technique | exact | 383 / 키락 | keep_existing | exact 대응 — 기존 행(id 383) 그대로 유지 |
| `twister` | 트위스터 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `aoki-lock` | 아오키 락 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `estima-lock` | 에스티마 락 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `paper-cutter-choke` | 페이퍼 커터 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `peruvian-necktie` | 페루비안 넥타이 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `z-lock` | Z 락 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `bicep-slicer` | 바이셉 슬라이서 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `choi-bar` | 초이바 | technique | coach_candidate | 35 / 초이(choi) 바 | review_link_existing | 관장 후보(id 35, 높음(가설)) — 사용자 결정 전, 자동 확정 금지 |
| `outside-heel-hook` | 아웃사이드 힐훅 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `von-flue-choke` | 폰 플루 초크 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `coyote-armbar` | 코요테 암바 | technique | none | - | review_new | 대응 없음 · technique — 신규 추가 여부 사용자 검토(자동 생성 아님) |
| `choke` | 초크 | concept | none | - | hold | 대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류 |
| `counter` | 카운터 | concept | none | - | hold | 대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류 |
| `submission` | 서브미션 | concept | none | - | hold | 대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류 |
