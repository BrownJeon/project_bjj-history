# 기술 이미지 자산 등록 도구

이미지 생성은 내장 `image_gen`으로 수행한다. 이 도구는 생성한 PNG·실제 프롬프트의 보존, 512px WebP 최적화, 검토 후 공개 파일 승격과 정합성 확인만 수행한다. 운영 DB나 이미지 생성 API를 호출하지 않는다.

## 설치

Node 20.9.0 이상으로 저장소의 로컬 디스크 체크아웃에서 도구 의존성을 설치한다. 일반 앱 런타임 의존성에는 추가하지 않았다. `sharp`는 `0.35.4`와 lockfile로 고정되어 있다.

```sh
cd tools/technique-image-assets
npm ci --no-audit --no-fund
cd ../..
```

기본 실행은 이 디렉터리의 `node_modules/sharp`를 사용한다. 검증 환경에서만 `BJJ_ART_SHARP=/absolute/path/to/sharp`로 이미 설치된 동일 버전을 명시할 수 있다. 다른 프로젝트의 설치 경로는 기본 경로가 아니다.

## 생성물 등록과 승인

저장소 루트에서 실행한다.

```sh
node scripts/task-058-image-assets.cjs import knee-cut /absolute/generated.png /absolute/actual-prompt.txt
# PNG·프롬프트·WebP 후보를 육안 검토한 뒤에만 실행한다.
node scripts/task-058-image-assets.cjs approve knee-cut '' '' 'reviewer-and-review-result'
node scripts/task-058-image-assets.cjs status
node scripts/task-058-image-assets.cjs verify
```

- `import`는 `reference/technique-illustrations/set-01/production/raw`, `prompts`, `candidates`에 새 버전을 저장한다. 후보를 `web/public`에 복사하지 않는다.
- 이미 승인된 기술을 다시 생성해도 `approvedAsset`과 기존 공개 이미지는 유지한다. 다른 기술의 승인으로 앱 manifest가 갱신되어도 이전 승인 이미지는 남는다.
- `approve`는 검토 메모를 기록하고 후보 해시·원본/프롬프트 해시를 확인한 뒤, 공개 WebP·registry·앱 manifest를 갱신한다. 잡힌 쓰기 오류는 이전 공개 상태로 복원한다. 원본·후보 버전은 덮어쓰지 않는다.
- 최종 완료 검사: `node scripts/task-058-image-assets.cjs verify --complete`. registry의 모든 기술 행을 사용자 확정 공유 별칭까지 포함해 확인하고 공개 WebP·후보·원본·프롬프트 SHA 및 앱 manifest를 교차 검증한다. 부분 진행 중의 `verify`는 아직 미완료인 행 수를 허용한다.

## 기존 형식 이전

기존 `ready/generated` 파일이 공개 폴더에 직접 기록된 상태라면 새 CLI 설치 후 다음을 한 번 실행한다. 생성 producer와 같은 디렉터리 잠금을 사용한다.

```sh
node scripts/task-058-image-assets.cjs migrate
node scripts/task-058-image-assets.cjs verify
```

승인된 파일은 보존하고 일치하는 후보 사본을 만든다. 미승인 공개 사본은 `unpublished`에 보존한 뒤 공개 경로에서 제거한다. 모호한 과거 승인 이력이나 알 수 없는 공개 바이트는 임의 선택·삭제하지 않고 중단한다.

## 종료·잠금 복구

잠금은 `.registry-lock/owner.json`에 PID·호스트·생성 시각·소유 토큰을 기록한다. 자동으로 오래된 잠금을 삭제하지 않는다.

1. `owner.json`의 호스트와 PID를 확인한다. 실행 중인 PID나 다른 호스트의 잠금은 복구 명령도 거부한다. 소유 정보가 없는 옛 잠금은 실행 주체를 먼저 수동 확인해야 한다.
2. 같은 호스트에서 소유 PID가 종료된 것을 확인한 경우에만 `node scripts/task-058-image-assets.cjs recover-lock`을 실행한다.
3. `node scripts/task-058-image-assets.cjs sync`를 실행한다. registry에 기록된 **승인본**으로 공개 파일과 앱 manifest를 다시 맞추며, 미승인 후보를 승인하지 않는다.
4. `verify`로 복구 결과를 확인한다. SIGKILL이 승인 registry 기록 전 발생했다면 이전 승인본으로 복원되고, 승인 registry 기록 후 발생했다면 해당 승인 상태로 재동기화된다.

## 회귀 검사

```sh
node --test scripts/task-058-image-assets.test.cjs
```

테스트는 별도 로컬 임시 체크아웃에서 import 비공개, 재생성 중 기존 승인 유지, 동시 등록, 쓰기 실패 복원, 소유자 잠금 보호, 기존 형식 이전, SIGKILL 두 시점의 복구, 공개/후보 해시 손상을 확인한다. 실제 프로젝트 registry·이미지·DB를 변경하지 않는다.
