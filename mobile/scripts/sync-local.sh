#!/usr/bin/env bash
# NFS(소스 진실) → ext4 미러(~/.node-local/bjj-mobile) 동기화 — task-039.
#
# 왜 필요한가: NFS(project/)는 noexec 이라 npm·Capacitor CLI·gradle 을 NFS 위에서 돌릴 수 없다.
# 그래서 mobile/ 의 소스(설정·app-shell·android 프로젝트)를 미러로 보낸 뒤 미러에서 빌드한다.
# 편집은 항상 NFS 쪽에서 하고, 미러는 실행 전용이다(TheMeal scripts/sync-local.sh 와 같은 구조).
#
# 반대 방향(미러 → NFS)은 이 스크립트가 하지 않는다. `npx cap add android`·`npm install` 처럼
# 미러에서 파일이 생기는 작업 뒤에는 필요한 파일만 손으로 NFS 로 되돌린다(task-039 결과 기록 참고).
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ROOT="${BJJ_MOBILE_LOCAL:-$HOME/.node-local/bjj-mobile}"

mkdir -p "$LOCAL_ROOT"

rsync -a --delete --exclude '._*' --exclude '.DS_Store' --exclude '@eaDir' --exclude '__pycache__' "$PROJECT_ROOT/app-shell/" "$LOCAL_ROOT/app-shell/"
rsync -a --delete --exclude '._*' --exclude '.DS_Store' --exclude '@eaDir' --exclude '__pycache__' "$PROJECT_ROOT/scripts/" "$LOCAL_ROOT/scripts/"

# 안드로이드 프로젝트. NFS 가 소스이고 빌드는 미러에서만 돈다.
#   · build/ · .gradle/ 은 산출물 — 보내지 않는다(매번 수백 MB).
#   · local.properties 는 기계별 값(sdk.dir) — 덮어쓰면 안 된다.
#   · --delete 를 쓰되 위 셋은 --filter 'P'(protect)로 지킨다.
#   · capacitor-cordova-android-plugins/ 와 assets/public 등 `npx cap sync` 가 매번 다시 만드는
#     파일도 NFS 에 있으면 그대로 보낸다(없으면 build-apk.sh 의 cap sync 가 만든다).
if [ -d "$PROJECT_ROOT/android" ]; then
  rsync -a --delete \
    --exclude '._*' --exclude '.DS_Store' --exclude '@eaDir' \
    --exclude 'capacitor-cordova-android-plugins/' --filter 'P capacitor-cordova-android-plugins/' \
    --exclude 'build/' --exclude '.gradle/' --exclude 'local.properties' --exclude '.idea/' \
    --filter 'P build/' --filter 'P .gradle/' --filter 'P local.properties' --filter 'P .idea/' \
    "$PROJECT_ROOT/android/" "$LOCAL_ROOT/android/"
fi

for f in package.json package-lock.json version.json capacitor.config.ts tsconfig.json; do
  if [ -f "$PROJECT_ROOT/$f" ]; then
    cp "$PROJECT_ROOT/$f" "$LOCAL_ROOT/$f"
  fi
done

exit 0
