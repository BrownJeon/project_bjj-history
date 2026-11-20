# task-055 작업인계서 — B안 캐릭터 원본 DB 저장·스킨 버전 등록

- 최종 갱신: 2026-11-09T11:43:43+09:00.
- **B안 확정. 신규 테이블 3개 생성과 초기 등록까지 사용자 승인 완료.**
- **2026-11-08 인계 작성 세션은 문서만 완료했다. 2026-11-09 본 Codex 세션이 사용자 명시 지시로 직접 구현·검증·DB 등록을 완료했다(§8).**
- 인계 자동 발송·새 채팅 생성·Claude 호출 없음. 실제 인수·실행 도구는 Codex이며 최신 직접 실행 승인과 결과는 §8에 기록한다.
- 정본 이력: `agent-vault/10-Flow/tasks/task-055-character-concept-sheet.md`.
- 승인 원본 목록: `reference/characters/set-01/approved-base-manifest.json`.
- Windows 프로젝트: `Z:\\project\\bjj-trainning`.
- Ubuntu/NAS 프로젝트: `/home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning`.

## 1. 사용자 승인과 범위

최신 사용자 원문:
> B안으로 결정하고 신규 테이블 3개 생성과 초기 등록까지 승인할게. 실제작업은 다른 세션에서 진행할 예정이니 작업인계서작성해서 알려주면 이어서 진행하도록 할께

이미 확정된 사항:
- 캐릭터 검증 완료. 외형·브라운 벨트·2인 구성 승인을 다시 요구하지 않는다.
- **B안: PNG 원본 바이트를 DB에 직접 저장한다. NAS 파일 경로만 DB에 기록하는 A안으로 대체하지 않는다.**
- `character_bases`, `character_skins`, `character_assets` **신규 3테이블 생성과 초기 등록 승인 완료**.
- 공통 사람형 베이스 1종 + 현재 스킨 2종의 논리 구조. 새 스킨은 버전으로 추가하고 기존 베이스 ID와 과거 스킨/제작물을 보존한다.
- 현재는 제작 과정에서 외형을 교체하여 이미지·영상 출력. 추후 앱은 미리 제작한 캐릭터별 결과물을 선택한다.
- 실제 작업은 다른 세션에서 한다. 이 문서는 사용자가 다음 세션에 전달한다.

B안·3테이블 생성·초기 등록과 캐릭터 외형의 기존 승인은 반복 요청하지 않는다. 구현 중 새 판단이나 범위 변경이 필요하면 실행 전에 확인한다.

이번 승인에 포함되지 않은 별도 범위:
- 기존 훈련 기록·프로필 아바타·무관한 테이블 변경/삭제 및 기존 자산 덮어쓰기.
- 전체 자동 마이그레이션, DB 계정·권한·글로벌 설정 변경.
- 외부 공개 URL, 신규 화면/API 배포, commit·push·운영 재기동.
- Blender 설치와 실제 모델·리깅·영상의 제작 완료. 미래의 대형 .blend/영상 파일 저장 정책까지 이번 PNG 결정으로 확정하지 않는다.

## 2. 현재 결과물과 원본

- 파란 도복: 고죠 사토루 얼굴 유형, 흰 머리·푸른 눈, 브라운 벨트. 정면·측면·후면 시트와 생성 프롬프트.
- 흰 도복: 사용자 첨부 CLAMP X 카무이 얼굴 유형, 검은 머리·갈색 눈, 브라운 벨트. 정면·측면·후면 시트와 생성 프롬프트.
- 싱글엑스 샘플: 파란 도복은 서 있는 역할, 흰 도복은 아래 가드 역할. PNG와 생성 프롬프트.
- 현재는 2D 원본이다. 실제 Blender 모델·공통 뼈대는 없고 manifest의 관련 값은 NULL이다. 사용자 캐릭터 검증 완료를 소프트웨어 QA나 실제 3D 동작 검증 PASS로 표시하지 않는다.

### 초기 등록 대상 6파일

경로 기준은 프로젝트의 `reference/characters/set-01/`이다. 먼저 manifest와 파일의 크기·해시를 대조한다.

| 파일 | 원본 bytes | SHA256 |
|---|---|---|
| `blue-gi-brown-belt.png` | 1,434,974 | `b53b8055020ae83c23e8926fcf42dc9dddb48ad05d13893bfc5933f34635ce8a` |
| `blue-gi-brown-belt.prompt.txt` | 2,458 | `3eb3f562244c735669c416b7821ee9dffcaef010a297f8f3e9e12cf7859ddbf9` |
| `white-gi-brown-belt.png` | 1,733,575 | `ab83010155438952c6a9bb211f35bb283880201553b2f52f090d5e62d0b2d271` |
| `white-gi-brown-belt.prompt.txt` | 3,547 | `fc4a5a8671c6b09a3dd71ae9455df4670d527d42f61d2d8498621ed3fc70a867` |
| `samples/single-x-guard-v1.png` | 1,997,310 | `346d5bed0ed00e0cbed1d8f6c8780ddaaf08792a8c6fd4c6b9e6ccf41956714e` |
| `samples/single-x-guard-v1.prompt.txt` | 4,134 | `5002257fd5c5291dafeeb4b11bcd6d67221864df063aff0766a821d0ca69738c` |

- 합계 **5,175,998 bytes**. PNG 3개 + 프롬프트 TXT 3개.
- 이전 v1 비교 시트, README, manifest, 인계서는 초기 자산 6개에 추가하지 않는다.
- 기존 NAS 원본은 보존한다. PNG는 원본 binary payload로 DB에 넣고, 프롬프트도 원문 바이트를 손실 없이 보존한다.

## 3. B안 데이터 계약

| 테이블 | 초기 등록 | 계약 |
|---|---|---|
| character_bases | 공통 사람형 베이스 1행 | 안정 ID·base_key, 성인 약 7등신 사양, 현재 concept 승인 단계, 사용자 승인 근거. 없는 모델·리깅을 완료로 채우지 않음 |
| character_skins | 파란/흰 스킨 2행 | base_id, skin_key, version_no, 얼굴·머리·눈·도복·벨트 정보, 승인 근거. 교체 시 새 버전 추가 |
| character_assets | 위 6개 원본 payload | 베이스/스킨 연결, 자산 유형, MIME, 원본 bytes, SHA256, 출처·프롬프트·샘플 문맥 |

필수 동작:
- 최대 원본 1,997,310 bytes를 저장 가능한 binary 필드를 사용한다. `DataTypes.BLOB('long')` 등 호환 타입은 구현 시 검토하고 실제 DDL·모델·직렬화를 일치시킨다.
- 세부 컬럼/DDL은 아직 구현되지 않았다. 필요한 새 판단은 실행 전 확인하되 이미 승인된 B안·3테이블 자체를 다시 미승인으로 돌리지 않는다.
- Buffer/바인딩으로 binary를 전달한다. 경로나 base64 문자열만 저장하고 BLOB 원본 등록 완료라고 보고하지 않는다.
- 두 시트/각 프롬프트는 해당 스킨에 연결한다. 공동 샘플/프롬프트에는 사용한 두 스킨의 버전 문맥을 보존하며 한 캐릭터의 원본 시트로 잘못 연결하지 않는다.
- 한 베이스의 두 인스턴스에 서로 다른 스킨을 동시에 지정할 수 있어야 한다. 전역 active_skin 하나로 두 역할을 같은 외형으로 만들지 않는다.
- FK/UNIQUE/삭제 제한 및 트랜잭션으로 다른 베이스의 스킨 연결·중복 등록·과거 자산 연쇄 삭제를 막는다.
- 예전 제작물은 생성 당시의 skin ID/version을 유지한다. 새 스킨이 과거 이미지·영상을 덮어쓰지 않는다.
- 이 데이터셋의 베이스 1개·스킨 2개·자산 6개의 실제 ID와 쓰기 건수를 보고한다. 전체 DB 행 수와 이번 데이터셋 행 수를 구분한다.

## 4. 재사용할 코드와 인수 시 확인

- `backend/src/config/db.js`: Sequelize 6 + mysql2. 비밀은 기존 환경에서만 읽고 출력하지 않는다.
- `backend/src/models/index.js`: 캐릭터 모델은 현재 없음. 실제 DB 테이블 존재 여부는 아직 미확인이다.
- `backend/src/models/ResearchVersion.js`: 부모 ID·version_no 버전 보존 패턴.
- `backend/scripts/task-051-feedback-schema.js`, `task-052-feedback-schema.js`: 기본 offline dry-run, 명시 적용과 스키마 검증 분리.
- `storage.js`, `VideoClip.js`, `LongVideo.js`는 기존 파일 경로 저장 사례다. 이를 B안 원본 BLOB을 경로 저장으로 대체하는 근거로 쓰지 않는다.
- profile.avatar는 실제 사용자 사진이다. 기술 시연 캐릭터 슬롯으로 재사용하지 않는다.
- 추가 의존성·외부 검색·도구 설치는 하지 않았다.

## 5. 다음 세션의 작업 순서

1. **실제 인수**
   - 이 문서, 프로젝트/상위 AGENTS.md, 작업 이력서의 execution_context·이력, 승인 manifest를 읽는다.
   - origin_tool=codex는 보존한다. 실제 Claude가 주 작업을 인수하면 current_tool=claude / current_procedure=claude_standard로 바꾸고 실제 수신 시각·세션 근거·범위를 append한다.
   - 문서 열람이나 다른 Codex 세션을 Claude 인수로 표시하지 않는다. Codex가 인수한 경우 실제 적용 절차를 따르고 필요한 구현/최종 검증은 실제 Claude가 맡는다.
2. **원본·병행 변경 확인**
   - 지정 6파일의 경로·크기·SHA256 대조. 누락·불일치면 DB 쓰기 전 중단하고 해당 파일만 보고한다.
   - 현재 HEAD·git status와 task-054 등 병행 변경을 확인한다. 기존 base_ref=2e3575d는 과거 시작 기준이며 새 구현 버전으로 자동 간주하지 않는다.
   - 자기 소유 파일 범위를 선언하고 기존 데이터·다른 세션 변경을 보존한다. 전체 staging·stash·reset 금지.
3. **DB 사전 검사**
   - 인수 환경의 기존 인증으로 정확한 대상 DB, 기존 테이블/컬럼/인덱스/FK, payload 필드·패킷 한도를 확인한다.
   - 이미 존재하는 테이블은 호환성을 먼저 검증한다. 이름만 같다고 정상으로 간주하거나 무관한 구조를 덮어쓰지 않는다.
   - 권한/글로벌 설정을 자동 변경하거나 앱 startup·sync({alter:true})로 전체 마이그레이션을 실행하지 않는다.
4. **구현·독립 검토**
   - Sequelize 모델 3개와 관계, BLOB 등록/복원 서비스, 단독 스키마 도구와 명시 등록 도구를 구현한다.
   - 기본은 offline dry-run. 실제 적용은 기존 패턴의 명시 --apply --confirm-database 등으로 구분한다.
   - 실제 담당 절차의 Reviewer → QA를 수행한다. 외형 승인을 코드 검증 PASS로 재사용하지 않는다.
5. **승인된 테이블 생성·초기 등록**
   - 신규 3테이블 DDL과 위 6파일 초기 등록은 이미 승인됐다. 준비·검토 후 이 범위에서 실행한다.
   - DDL과 초기 DML 트랜잭션을 구분한다. DDL 부분 성공 후 실패 시 상태를 기록·검증하고 재개한다. 전체 DDL이 자동 롤백됐다고 가정하지 않는다.
   - DML은 트랜잭션으로 묶고 같은 manifest 재실행 시 레코드를 재사용한다. 기존 스킨/자산을 지워 재등록하지 않는다.
6. **완료 검증**
   - DB에서 6개 payload를 다시 읽어 byte length·SHA256이 각 원본과 일치하는지 확인한다.
   - PNG MIME/시그니처와 프롬프트 원문 보존을 확인한다.
   - 재실행 중복 방지, 누락/해시 불일치 시 쓰기 0건, 등록 실패 시 DML 롤백, 스킨 버전 추가 후 기존 자산 보존을 검증한다.
   - 실제 base/skin/asset ID와 등록·읽기 검증 결과를 기록한다. JSON 준비만으로 DB 저장 완료를 선언하지 않는다.
7. **보고·후속**
   - 도구·버전·명령·결과와 실행/미실행 범위를 task 및 ACTIVE에 함께 갱신한다.
   - 성공 후 블렌더 공통 모델·리깅으로 이어갈 기반을 정리한다. 이 단계에서 3D 모델을 이미 만들었다고 표시하지 않는다.
   - 앱/배포는 이번 DB 승인과 구분한다. push는 webhook 배포를 유발하므로 요청 범위 밖 push를 하지 않는다.

## 6. 현재 세션 실행 결과·한계

- 이번 지시 후 수행: B안 승인 반영, 인계서·manifest·task/ACTIVE/board·README 문서 갱신과 원본 대조.
- DB 연결·DDL·DML·앱 코드·Claude 호출·다른 채팅 메시지·commit·push·배포: 미실행.
- 이전 이 환경의 Windows DB SELECT는 ER_ACCESS_DENIED_ERROR, home_ubuntu SSH는 Permission denied로 실패했다. 이번 지시 후 재시도하지 않았다.
- 이를 다른 인수 환경의 권한 부족으로 단정하지 않는다. 다음 세션의 기존 허용 인증 환경에서 다시 확인한다.
- 비밀 값·전체 .env·인증 토큰·DB payload를 인계문/로그에 출력하지 않는다.
- 실제 인수 전이므로 current_tool=codex / codex_scoped 유지. 사용자가 문서를 전달하며 자동 발송은 없다.

## 7. 승인·문서 이력

| 시각(KST) | 내용 |
|---|---|
| 2026-11-08 20:17 | 최초 저장안 초안·원본 6파일 manifest 준비. 당시 A/B·신규 스키마 미결 |
| 2026-11-08 20:26 | 사용자 B안·신규 3테이블 생성·초기 등록 승인. 실제 작업은 별도 세션으로 지정 |
| 2026-11-08 20:33 | 이 인계서를 B안과 실제 다른 세션의 실행 순서로 갱신 |

**현재 저장 계약의 미결 사용자 선택은 없다.** 기존 승인 재요구 없이 인수 범위에서 진행하고 새 판단/범위 변경만 실행 전 확인한다.


## 8. 실제 인수·구현·DB 등록 완료 (2026-11-09 09:54:05 KST)

- 최신 사용자 지시: “T-55 작업인계서 읽고 이어서 진행해줘. B안과 신규 3개 테이블 생성 및 초기 등록은 승인 완료했어. 인계서의 범위와 원본해시 확인하고 구현,검증,DB 등록까지 너가 직접 진행해줘.”
- 이 지시로 Codex가 직접 구현·검증·DDL/DML을 수행했다. origin/current_tool=codex, current_procedure=codex_scoped 유지. 기존 일반 인계 방향을 실제 Claude 인수/실행으로 표시하지 않는다.
- 사전 대조: 지정6파일 모두 bytes/SHA256 일치(5,175,998 bytes). 이후 DB Buffer·물리복원6파일도 각각 원본과 일치. 기존 NAS 원본 보존.
- 접속: Mac 기존인증 거부 후 기존 home_ubuntu SSH/Ubuntu backend/.env로 bjj 접속. MariaDB10.11.11, Node24.22.2. DB_PORT는 기존 db.js 기본3306을 호출프로세스에 명시했다(.env/계정/권한/글로벌설정 변경 없음).
- 구현: CharacterBase/Skin/Asset 모델·관계, characterRegistry 등록/복원/순차버전추가 서비스, 단독 schema/register/check 도구, 전용 테스트. 신규 API/화면·startup 마이그레이션 없음.
- 신규3테이블 실제 CREATE 완료. 후검증의 MariaDB CHECK 표현/드라이버 오류심볼 차이를 수정하고 Reviewer부터 재순환. 기존테이블 DROP/재생성 없이 명시 재개(created=[])와 전체스키마 검증 exit0.
- **실제 영구등록**: character_bases id8(1행), character_skins id16 blue v1/id17 white v1(2행), character_assets id11~16(6행). 최초쓰기1/2/6, 같은manifest재실행0/0/0. 전체DB행수(이3테이블)와 이데이터셋행수 모두1/2/6. 시험롤백으로 auto_increment에 빈번호가 생겼으며 reset하지 않았다.
- 공유 샘플2개는 skin_id=NULL, actor_a=16 standing/actor_b=17 guard, 모두v1을 고정한다. 새스킨버전 추가 시 기존 베이스/스킨/자산/역할 문맥 보존을 실DB에서 확인했다(시험행은 전부rollback).
- 검증: Reviewer 최신PASS issues0, 단위14 PASS, 실DB13 PASS(중간등록실패롤백·최대BLOB·UNIQUE/FK/CHECK/RESTRICT·버전보존), 최종 독립 읽기PASS. 실DB시험 전후counts=[0,0,0], durable_test_rows=0.
- 물리복원: /tmp/task-055-db-restored-aSzUOB의6파일(0600), 전부 원본bytes/SHA256 일치. 이 경로는 Ubuntu 검증용 복원본이며 NAS 원본이나 DB 원본을 대체하지 않는다.
- 상세 증거/실제ID·해시/선택9코드파일SHA256: `docs/verification/task-055-character-registry.json`.
- 외부 Claude C1/C2는 skipped: 선택 구현파일 미커밋으로 정식 broker 요건 불충족. 임의commit/우회/외부내용전송 없음. 내부 Reviewer/QA와 구분한다.
- **이번 승인 범위 완료**. commit/push/배포/운영재기동 없음. Blender 모델·리깅·영상 제작·앱 선택 화면/API는 별도 후속 범위이며 완료한 것으로 표시하지 않는다.

### 전용 도구 실행

기본 실행은 연결/쓰기 없는 오프라인 검사다. 연결 실행 시 기존 환경에서 DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS를 명시하고 비밀은 출력하지 않는다. 전체 앱 bootstrap·sync·자동마이그레이션을 실행하지 않는다.

```sh
node backend/scripts/task-055-character-schema.js
node backend/scripts/task-055-character-register.js
node backend/scripts/task-055-character-check.js
node --test backend/test/character-registry.test.js
# 기존 환경의 명시적 DB 설정 후에만:
node backend/scripts/task-055-character-schema.js --verify
node backend/scripts/task-055-character-schema.js --apply --confirm-database bjj
node backend/scripts/task-055-character-register.js --verify
node backend/scripts/task-055-character-register.js --apply --confirm-database bjj
# 검사도구는 이3테이블 안에만 시험행을 만들고 모두rollback한다.
node backend/scripts/task-055-character-check.js --run --confirm-database bjj
# 프로젝트 밖 새 디렉터리로만 복원하며 기존 파일을 덮어쓰지 않는다.
node backend/scripts/task-055-character-register.js --verify --restore-dir /tmp/새로운-복원-디렉터리
```

## 9. 사용자 추가 승인·커밋·운영 배포 완료 (2026-11-09 10:18:20 KST)

- 사용자 “커밋 및 푸시해서 운영에 배포해줘” 승인으로 기존 배포 제외 범위를 확장했다.
- 원본 체크아웃의 병행99변경·분기12커밋은 보존하고 origin/main0aef8e1 기반 격리 작업본에서 T55 선택24파일만 커밋했다. 코드9/원본6 SHA는 승인·검증본과 동일.
- **커밋 08a596e7f1178dec7e8fa7973a6d5a2c23f55abe**, origin/main push 완료. 포함작업은 task-055만, 부모0aef8e1159d0dd0b40ec30b6b5f14fdd81ba3da4.
- push webhook 단일 blue/green 배포: **20261109-101020-08a596e7**, RELEASE_RESULT status=ok, 이전20261109-000550-0aef8e11. 수동 deploy 재호출0·--with-migrate 없음.
- 배포 전 Reviewer REV-055-05 PASS issues0·격리본 단위14 PASS·기본오프라인3도구PASS. 실제 운영 코드9/원본6 파일hash 일치, 전용 CLI --verify의1/2/6·6BLOB원본bytes/hash 일치.
- 운영 health/HTML/JS/CSS200, CUA 인앱 reload 후 로그인화면AX/스크린샷 정상, startup 체인완료/worker재개완료·실패0·기동후 error log 갱신없음, pm2 online·동일PID·restart0/unstable0 확인. 인증후실사용/실기기/3D는 별도범위이며 미검증.
- 기존 startup의 ALTER/조건부UPDATE는 현재운영과 동일 코드로 유지되므로 전체DB쓰기0은 주장하지 않는다. T55 전용 스키마/초기등록 apply는 배포때 재실행하지 않았다.
- 외부Claude는 정식 broker의 shared-Git/worktree 경계로 skipped/미호출, 내부 Reviewer/QA와 구분한다.
- 상세 운영 증거: docs/verification/task-055-release.json. 배포 이후 결과기록은 로컬 갱신이며 코드/승인원본24파일 커밋·push와 구분한다.

## 10. 본 세션 종료·후속 시작점

T-55는 완료·세션종료(done/closed)다. 화면/API 변경 없이 캐릭터 원본 저장·스킨 버전 기반까지 구현/DB등록/배포했고, Blender 모델·리깅·앱 화면 연결은 후속 범위다.

다음 세션은 `docs/handovers/task-055-follow-up.md`를 먼저 읽는다. 완료된 DB등록/외형 승인을 반복하지 않고 새 요청의 구체 산출물·범위부터 정한다. 다음 task나 구현은 이번 종료 지시로 자동 시작하지 않았다. 배포 후 및 종료 기록은 로컬 변경으로 보존한다.
