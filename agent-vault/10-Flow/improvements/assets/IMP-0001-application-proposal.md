# task-054 목록 반영 대상 검토안

상태: 사용자 준비 범위 승인·운영 반영 전. 현재 코드·공개 설명159개는 준비됐으며 기존 기술60개는 모두 보존한다. 이 문서는 승인받은 범위의 실제 DB 적용 대상을 검토하기 위한 목록이다.

## 사용자가 선택한 준비 범위

- 기존 정확/이미 있는 별칭 매칭28개: 기존 ID·이름·메모·영상 그대로 재사용. 재승인 대상이 아니다.
- 기존 매칭이 없는110개: 승인된 통합 범위에 포지션·개념도 포함하여 추가 대상으로 준비. 이전 dry-run의 일반 개념10개 hold는 자동 제외 결정으로 채택하지 않는다.
- 의미 확인이 필요한21개: 자동 병합·중복 생성 없이 사용자 선택 대기. 아래의 국내 표기차이 후보와 포함 관계를 구분한다.
- 위21개를 후속으로 두는 안을 선택할 경우 새 기술110행, 기존60행 보존, 합계170행 예상. 신규110개 각각 source slug 연결110개가 필요하다. 기존28개는 기존 exact/alias 읽기로 재사용하며 추가 링크·기존 행 수정이 필요 없다.
- 동일한 기존 ID에 여러 source slug를 확정 연결하면 현재 API는 모호한 설명으로 판정하여 설명을 비운다. 아메리카나/키락, 백 컨트롤/백 마운트는 우선 대표 설명 선택 또는 별도 변형 여부를 정한 후 처리한다.
- 운영 연결 테이블 DDL·110행 실제 추가·push/배포는 별도 승인 단계다. 아래 명단만으로 실행하지 않는다.

## 의미 확인이 필요한21개

| 참고 이름 | 기존 ID / 이름 | 관장 가설 | 확인할 차이 |
|---|---|---|---|
| 더블 레그 테이크다운 | 30 / 더블렉 | 높음(가설) | 필요 — 기존 상세가 양다리 테이크다운을 뜻하는지 확인 |
| 델라히바 가드 | 3 / 델라리바 | 높음(가설) | 필요 — 기존 기본형 의미 확인. 리버스·딥 변형까지 포함하지 않음 |
| 싱글 레그 X 가드 | 28 / 싱글엑스 | 높음(가설) | 필요 — 기존 포지션이 SLX 기본형인지 확인 |
| 트라이팟 스윕 | 2 / 트라이포드 | 높음(가설) | 필요 — 기존 스윕 동작 확인 |
| 스파이더 가드 | 7 / 스파이더 | 높음(가설) | 필요 — 소매와 다리 프레임을 사용하는 가드 의미인지 확인 |
| 토레안도 패스 | 5 / 토레안도 | 높음(가설) | 필요 — 기존 토레안도 동작 확인 |
| 롱스텝 | 155 / 롱스탭 | 높음(가설) | 필요 — 기존 롱스탭이 해당 패스인지 확인 |
| 사이드 컨트롤 | 53 / 사이드 | 높음(가설) | 필요 — 기존 사이드의 정의 확인 |
| 베림볼로 | 57 / 베림보로 | 높음(가설) | 필요 — 기존 동작이 베림볼로인지 확인 |
| 스트레이트 앵클락 | 19 / 앵클락 | 높음(가설·조건 있음) | 필요 — 기존 값이 직선형인지 확인. 회전형·상위 묶음이면 동일 매칭 금지 |
| 보우앤로우 초크 | 83 / 보우 앤 애로우 | 높음(가설) | 필요 — 기존 도복 백 초크의 동작 확인 |
| 루프 초크 | 45 / 루프 쵸크 | 높음(가설) | 필요 — 기존 도복 루프 초크 의미 확인 |
| 아메리카나 | 383 / 키락 | 높음(가설) | 필요 — 기존 키락 의미 확인. source key-lock도 이미 같은 id에 exact 연결되어 있어 두 source를 한 기존 ID에 대응시킬지는 사용자 결정 |
| 칸토 초크 | 48 / 칸토 쵸크 | 높음(가설) | 필요 — 기존 칸토 초크 동작 확인 |
| 초이바 | 35 / 초이(choi) 바 | 높음(가설) | 필요 — 기존 Choi bar 동작 확인 |
| 싯업 가드 | 46 / 싯팅 가드 | 중간(맥락 필요) | 필요 — 동일 기본 포지션인지 싯팅 가드 하위 변형인지 기존 설명·그립 확인 |
| 백 컨트롤 | 36 / 백포지션 | 중간(맥락 필요) | 필요 — 기존 백포지션의 범위와 훅·싯벨트 조건 확인 |
| 백 마운트 | 36 / 백포지션 | 중간(맥락 필요) | 필요 — 별칭인지 훅을 건 하위 포지션인지 확인. 두 source 자동 동일시 금지 |
| 오버 언더 | 55 / 싱글언더 패스 | 중간(맥락 필요) | 필요 — 기존 싱글언더가 오버언더인지 다른 언더훅 패스인지 그립·통과 경로 확인 |
| 크로스 칼라 초크 | 49 / 깃 쵸크 | 보류(낮음·포함 관계) | 필요 — 교차 양깃 조르기인지 다른 라펠 초크인지 확인 전 동일 매칭 금지 |
| 풋락 | 19 / 앵클락 | 보류(낮음·포함 관계) | 필요 — 양쪽 포괄 범위 확인 전 동일 매칭 금지 |

## 추가 대상110개 (기존 도구 매칭 없음)

| 참고 이름 | 유형 | 제안 분류 | 출처 묶음 | slug |
|---|---|---|---|---|
| 스탠딩 | position | 포지션 | 스탠딩 | standing |
| 싱글 레그 테이크다운 | technique | 테이크다운 | 스탠딩 | single-leg-takedown |
| 칼라 드래그 | technique | 테이크다운 | 스탠딩 | collar-drag |
| 앵클 픽 | technique | 테이크다운 | 스탠딩 | ankle-pick |
| 인사이드 트립 | technique | 테이크다운 | 스탠딩 | inside-trip |
| 아웃사이드 트립 | technique | 테이크다운 | 스탠딩 | outside-trip |
| 낙법 | technique | 기타 | 스탠딩 | break-fall |
| 클로즈 가드 | position | 포지션 | 가드 · 스윕 | closed-guard |
| 니실드 | position | 포지션 | 가드 · 스윕 | knee-shield |
| 버터플라이 가드 | position | 포지션 | 가드 · 스윕 | butterfly-guard |
| 리버스 델라히바 가드 | position | 포지션 | 가드 · 스윕 | reverse-de-riva-guard |
| 벌룬 스윕 | technique | 스윕 | 가드 · 스윕 | balloon-sweep |
| 코요테 가드 | position | 포지션 | 가드 · 스윕 | coyote-guard |
| 기무라 스윕 | technique | 스윕 | 가드 · 스윕 | kimura-sweep |
| 플라워 스윕 | technique | 스윕 | 가드 · 스윕 | flower-sweep |
| 러버 가드 | position | 포지션 | 가드 · 스윕 | rubber-guard |
| 풋 스윕 | technique | 테이크다운 | 가드 · 스윕 | foot-sweep |
| Z 가드 | position | 포지션 | 가드 · 스윕 | z-guard |
| 칼라 앤 슬리브 가드 | position | 포지션 | 가드 · 스윕 | collar-and-sleeve-guard |
| 딥 델라히바 가드 | position | 포지션 | 가드 · 스윕 | deep-de-riva-guard |
| 라펠 가드 | position | 포지션 | 가드 · 스윕 | lapel-guard |
| 옥토퍼스 가드 | position | 포지션 | 가드 · 스윕 | octopus-guard |
| 레슬업 | technique | 스윕 | 가드 · 스윕 | wrestle-up |
| 인버티드 가드 | position | 포지션 | 가드 · 스윕 | inverted-guard |
| 존 웨인 스윕 | technique | 스윕 | 가드 · 스윕 | john-wayne-sweep |
| 럼버잭스윕 | technique | 스윕 | 가드 · 스윕 | lumberjack-sweep |
| 가드 리커버리 | concept | 탈출 | 가드 · 스윕 | guard-recovery |
| 힙 범프 스윕 | technique | 스윕 | 가드 · 스윕 | hip-bump-sweep |
| 펜듈럼 스윕 | technique | 스윕 | 가드 · 스윕 | pendulum-sweep |
| 테크니컬 스탠드업 | technique | 기타 | 가드 · 스윕 | technical-stand-up |
| 웨이터 스윕 | technique | 스윕 | 가드 · 스윕 | waiter-sweep |
| 신투신 가드 | position | 포지션 | 가드 · 스윕 | shin-to-shin-guard |
| 스퀴드 가드 | position | 포지션 | 가드 · 스윕 | squid-guard |
| 가드 | concept | 기타 | 가드 · 스윕 | guard |
| 레그 드래그 | technique | 패스 | 가드 패스 | leg-drag |
| 압박 패스 | concept | 패스 | 가드 패스 | pressure-pass |
| 스택 패스 | technique | 패스 | 가드 패스 | stack-pass |
| 레그 위브 | technique | 패스 | 가드 패스 | leg-weave |
| 스매시 패스 | concept | 패스 | 가드 패스 | smash-pass |
| 더블 언더 | technique | 패스 | 가드 패스 | double-under |
| 게이터 롤 | technique | 컨트롤 | 가드 패스 | gator-roll |
| 백 스텝 | technique | 패스 | 가드 패스 | back-step |
| 라펠 패스 | technique | 패스 | 가드 패스 | lapel-pass |
| 신 트랩 | technique | 컨트롤 | 가드 패스 | shin-trap |
| 서퍼 패스 | technique | 패스 | 가드 패스 | surfer-pass |
| 덕 언더 | technique | 컨트롤 | 가드 패스 | duck-under |
| 와이퍼 | technique | 패스 | 가드 패스 | wiper |
| 터틀 | position | 포지션 | 포지션 · 컨트롤 | turtle |
| 니온밸리 | position | 컨트롤 | 포지션 · 컨트롤 | knee-on-belly |
| 헤드쿼터 포지션 | position | 포지션 | 포지션 · 컨트롤 | headquarters-position |
| 암 드래그 | technique | 컨트롤 | 포지션 · 컨트롤 | arm-drag |
| 언더훅 | position | 컨트롤 | 포지션 · 컨트롤 | under-hook |
| 프론트 헤드락 | position | 컨트롤 | 포지션 · 컨트롤 | front-headlock |
| 50 대 50 포지션 | position | 포지션 | 포지션 · 컨트롤 | fifty-fifty-position |
| 아시 가라미 | position | 포지션 | 포지션 · 컨트롤 | ashi-garami |
| 남북 포지션 | position | 컨트롤 | 포지션 · 컨트롤 | north-south-position |
| 새들 포지션 | position | 포지션 | 포지션 · 컨트롤 | saddle-position |
| S 마운트 | position | 컨트롤 | 포지션 · 컨트롤 | s-mount |
| 트럭 | position | 컨트롤 | 포지션 · 컨트롤 | truck |
| 크루시픽스 | position | 컨트롤 | 포지션 · 컨트롤 | crucifix |
| 바디락 | technique | 컨트롤 | 포지션 · 컨트롤 | body-lock |
| 크로스 칼라 컨트롤 | position | 컨트롤 | 포지션 · 컨트롤 | cross-collar-control |
| 아웃사이드 아시 가라미 | position | 포지션 | 포지션 · 컨트롤 | outside-ashi-garami |
| 투 온 원 | position | 컨트롤 | 포지션 · 컨트롤 | two-on-one |
| 스냅 다운 | technique | 컨트롤 | 포지션 · 컨트롤 | snap-down |
| 스트레이트 칼라 컨트롤 | position | 컨트롤 | 포지션 · 컨트롤 | straight-collar-control |
| 크랩 라이드 | technique | 컨트롤 | 포지션 · 컨트롤 | crab-ride |
| 스프롤 | technique | 탈출 | 포지션 · 컨트롤 | sprawl |
| 하이 마운트 | position | 컨트롤 | 포지션 · 컨트롤 | high-mount |
| 허니 홀 | position | 포지션 | 포지션 · 컨트롤 | honey-hole |
| 백사이드 50/50 | position | 포지션 | 포지션 · 컨트롤 | backside-fifty-fifty |
| 인사이드 아시 가라미 | position | 포지션 | 포지션 · 컨트롤 | inside-ashi-garami |
| 락다운 | position | 포지션 | 포지션 · 컨트롤 | lockdown |
| 싯벨트 그립 | position | 컨트롤 | 포지션 · 컨트롤 | seat-belt-grip |
| 3/4 마운트 | position | 포지션 | 포지션 · 컨트롤 | three-quarter-mount |
| 풋 워크 | concept | 기타 | 포지션 · 컨트롤 | foot-work |
| 엔트리 | concept | 기타 | 포지션 · 컨트롤 | entry |
| 다스 초크 | technique | 서브미션 | 서브미션 | darce-choke |
| 니바 | technique | 서브미션 | 서브미션 | knee-bar |
| 길로틴 초크 | technique | 서브미션 | 서브미션 | guillotine-choke |
| 힐훅 | concept | 서브미션 | 서브미션 | heel-hook |
| 토홀드 | technique | 서브미션 | 서브미션 | toe-hold |
| 인사이드 힐훅 | technique | 서브미션 | 서브미션 | inside-heel-hook |
| 암 트라이앵글 | technique | 서브미션 | 서브미션 | arm-triangle |
| 리스트 락 | technique | 서브미션 | 서브미션 | wrist-lock |
| 이제키엘 초크 | technique | 서브미션 | 서브미션 | ezekiel-choke |
| 바나나 스플릿 | technique | 서브미션 | 서브미션 | banana-split |
| 베이스볼 초크 | technique | 서브미션 | 서브미션 | baseball-bat-choke |
| 카프 슬라이서 | technique | 서브미션 | 서브미션 | calf-slicer |
| 플라잉 암바 | technique | 서브미션 | 서브미션 | flying-armbar |
| 타리코플라타 | technique | 서브미션 | 서브미션 | tarikoplata |
| 아나콘다 초크 | technique | 서브미션 | 서브미션 | anaconda-choke |
| 브라보 초크 | technique | 서브미션 | 서브미션 | brabo-choke |
| 클락 초크 | technique | 서브미션 | 서브미션 | clock-choke |
| 고고플라타 | technique | 서브미션 | 서브미션 | gogoplata |
| 노스 사우스 초크 | technique | 서브미션 | 서브미션 | north-south-choke |
| 버기 초크 | technique | 서브미션 | 서브미션 | buggy-choke |
| 트위스터 | technique | 서브미션 | 서브미션 | twister |
| 아오키 락 | technique | 서브미션 | 서브미션 | aoki-lock |
| 에스티마 락 | technique | 서브미션 | 서브미션 | estima-lock |
| 페이퍼 커터 초크 | technique | 서브미션 | 서브미션 | paper-cutter-choke |
| 페루비안 넥타이 | technique | 서브미션 | 서브미션 | peruvian-necktie |
| Z 락 | technique | 서브미션 | 서브미션 | z-lock |
| 바이셉 슬라이서 | technique | 서브미션 | 서브미션 | bicep-slicer |
| 아웃사이드 힐훅 | technique | 서브미션 | 서브미션 | outside-heel-hook |
| 폰 플루 초크 | technique | 서브미션 | 서브미션 | von-flue-choke |
| 코요테 암바 | technique | 서브미션 | 서브미션 | coyote-armbar |
| 초크 | concept | 기타 | 서브미션 | choke |
| 카운터 | concept | 기타 | 서브미션 | counter |
| 서브미션 | concept | 기타 | 서브미션 | submission |

## 기존 재사용28개

| 참고 이름 | 기존 ID / 이름 | 기존 매칭 방식 |
|---|---|---|
| 테이크다운 | 33 / 테이크다운 | exact |
| 오픈 가드 | 39 / 오픈가드 | exact |
| 하프 가드 | 40 / 하프가드 | exact |
| 스윕 | 32 / 스윕 | exact |
| 라쏘 가드 | 6 / 라쏘 | alias |
| K 가드 | 34 / k가드 | exact |
| X 가드 | 18 / 엑스가드 | alias |
| 딥 하프 가드 | 38 / 딥 하프가드 | exact |
| 웜 가드 | 103 / 웜가드 | exact |
| 키스 오브 드래곤 | 382 / 키스 오브 드래곤 | exact |
| 시저스 스윕 | 26 / 시저스 스윕 | exact |
| 매트릭스 | 58 / 매트릭스 | exact |
| 웨이터 가드 | 44 / 웨이터 가드 | exact |
| 니컷 | 86 / 니컷 | exact |
| 크레이지 독 패스 | 85 / 크레이지독 패스 | exact |
| 니슬라이드 | 4 / 니슬라이드 | exact |
| 엑스 패스 | 84 / 엑스패스 | exact |
| 가드 패스 | 37 / 가드패스 | exact |
| 마운트 | 43 / 마운트 | exact |
| 백 테이크 | 25 / 백테이크 | exact |
| 이스케이프 | 47 / 탈출 | alias |
| 기무라 | 51 / 기무라 | exact |
| 오모플라타 | 63 / 오모플라타 | exact |
| 암바 | 42 / 암바 | exact |
| 트라이앵글 초크 | 27 / 트라이앵글 쵸크 | alias |
| 리어 네이키드 초크 | 9 / 리어네이키드 초크 | exact |
| 바라토플라타 | 54 / 바라토플라타 | exact |
| 키락 | 383 / 키락 | exact |

사용자 선택: “28개 재사용·110개 추가 준비·21개 후속 확정 (권고)”. 운영 DDL/DML·배포 승인과 구분한다.

## 관장 분류 제안 (최종 운영 반영 때 채택 여부 확인)

서브미션30 · 패스10 · 스윕9 · 컨트롤19 · 탈출2 · 테이크다운6 · 포지션26 · 기타8 =110개. 기존앱8개분류를사용하며 기존60행분류를바꾸지않는다. confidence high96·medium14. `IMP-0001-new-category-proposal.json`의 행별근거/불확실15개와 `IMP-0001-decisions-prepared.json`의 실제값을함께검토한다. 이분류는관장권고초안이며 현재운영반영승인으로간주하지않는다.
