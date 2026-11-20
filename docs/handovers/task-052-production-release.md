# 피드백 task-051·052 운영 반영 인계

- 사용자가 task-051·052 운영 DB 반영 및 배포를 요청했다. 관장 정리 중에는 연습 결과 저장·수정·삭제를 잠그고 새 결과에 작성 취소를 제공하는 동작도 선택했다.
- 사용자가 이번 task-051·052 최종 검증·운영 DB 반영·배포까지 Codex가 진행하도록 지정했다. Codex 구현 예외 및 task-052 한정 데모 기록 예외도 확인됐다.

## 2026-11-05 사전 확인

- 운영 `current`는 `20261102-003239-97b5d3f3`, pm2 `bjj` online, `/health` 200. 원격 `main`은 `97b5d3f30cf53591d66fcce9a1edbbec0821726c`. 로컬 작업 브랜치는 분기돼 있어 원격을 기준으로 피드백 코드와 테스트만 별도 후보에 준비했다. 무관한 역할·훅·기록 편집은 후보에서 제외한다.
- 운영 DB 읽기 전용 확인 결과는 `bjj`, MariaDB `10.11.11`, `users.id` signed INT/InnoDB, `feedback_records` 미존재다. 현재 앱 계정의 DB 범위 CREATE·ALTER·REFERENCES 권한을 확인했다. 자격 증명과 사용자 데이터는 출력하지 않았다.
- 배포 사전 점검에서 서버 ext4 작업 경로, shared env 경로와 기존 의존성 링크, webhook의 `release.sh` 및 `cd web && npm run build` 경로를 확인했다. 저장소의 `deploy.yml`에는 `migrate.command`가 없다.

## 동결한 후보와 작성자 점검

- 후보 `00d7a38406d7b1972f87532e29526bdfed158b92`, 부모 `97b5d3f30cf53591d66fcce9a1edbbec0821726c`. 후보 체크아웃 `/Users/brownjeon/.node-local/bjj-feedback-release.k6PUpU/bjj-trainning`. 선택 범위는 `backend/`와 `web/`의 58개 파일이다. 원 작업 트리와 운영 브랜치는 그대로 보존했다.
- 스키마 SHA-256은 051 `532f19775f16415d377dd077291fb41fb406c58379887369263eb26667de6d51`, 052 `e3df4a9180fd30aac016a8c04c53eaad1cc4cf8065b9691fcfa4f0561e8649a9`다. 두 기본 실행은 DB 연결 없는 dry-run으로 확인했다.
- 후보에 대한 독립 정적 재감사에서 마지막 변경 8개를 확인하고 잔여 지적 없이 통과했다. 기존 코드 대비 추가 차이는 `RecallPage.jsx` 끝 빈 줄 제거뿐이다.
- 후보로 작성자 웹 빌드 220모듈, 웹 상태·기간 및 React DOM 66/66, Ubuntu 격리 백엔드 단위·HTTP·fixture guard 29/29를 확인했다. 백엔드 격리본 `/home/brownjeon/.node-local/bjj-feedback-release-qa.NowZ6v`. 이 결과와 실제 운영 검증을 구분한다.
- 독립 QA가 같은 후보에 대해 verdict `PASS`, 확인된 결함 0건을 보고했다. QA는 웹 66/66, 빌드 220모듈, backend 29/29, MariaDB 3/3, 실제 서비스 HTTP smoke 및 support 4/4, 정리 중 결과 3종 409와 완료 후 200을 확인했다. Leader의 실제 앱 브라우저 확인은 작성 취소·잠금/해제, 412px/1280px 가로 넘침, 목록/결과 버튼 44px 이상, 합성 AI 출력의 HTML 리터럴 텍스트 표시를 포함했다.

## 운영 적용 진행

- `bjj` 운영에서 task-051 `created-and-verified`, task-052 `added-columns-and-verified`를 확인했다. 각 스크립트의 별도 `--verify` 통과. 신규 `feedback_records` 0행 확인.
- `97b5d3f3` → `00d7a384` 일반 fast-forward push 완료. webhook 로그에서 후보 릴리스 `20261105-150544-00d7a384` 전개를 확인했다.
- 15:07:20 KST webhook `RELEASE_RESULT status=ok`, 종료 0. 공식 `--status`의 active release/pm2 online/internal health 200, 공개 health·SPA·후보 JS/CSS, 운영 로그인 렌더링 확인. 비로그인 피드백 API는 401이다. 운영 환경의 스키마를 배포된 스크립트로 다시 검증했다. 인증 후 실제 기능, 운영 관장 CLI, Android 기기는 미확인이다.

## 실행 순서

1. 운영 기준 위에 구성한 최종 후보를 동결하고 소스·스키마 해시, 독립 Reviewer·QA 결과를 기록한다. QA는 동일 코드로 격리 테스트와 웹 빌드를 실행한다.
2. 실제 `origin/main`과 `current`가 여전히 기준과 일치하는지 확인한다. DB 대상·스키마 상태를 다시 확인한다. 예상 외 기존 피드백 테이블이 있으면 호환성·행 보존을 먼저 검증한다.
3. 리뷰한 `backend/scripts/task-051-feedback-schema.js` 및 `backend/scripts/task-052-feedback-schema.js`를 순서대로 `--apply --confirm-database bjj`로 한 번씩 실행한 후 각 `--verify`를 실행한다. 검증 실패 시 push를 보류한다. 두 단계는 별도 DDL이며 코드 롤백에 포함되지 않는다.
4. 최종 후보만 일반 fast-forward push한다. 운영 webhook의 `RELEASE_RESULT`에서 대상 SHA와 상태를 확인하고, `scripts/deploy.sh bjj-trainning --status`로 동일 릴리스와 헬스를 확인한다. 같은 SHA를 수동으로 다시 배포하지 않는다.
5. 운영 화면·빌드 자산·사용자 권한이 허용하는 실제 동작을 확인한다. 완료된 QA, 운영에서 직접 확인한 항목, 미확인을 따로 기록한다.
