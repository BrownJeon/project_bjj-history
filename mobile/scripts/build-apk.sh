#!/usr/bin/env bash
# 디버그 APK 빌드 — task-039. NFS 에서 호출해도 되고(스크립트 파일은 bash 로 읽힌다), 실제 실행은 미러에서 한다.
#
#   bash /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/mobile/scripts/build-apk.sh
#
# 순서: NFS → 미러 동기화 → (node_modules 없으면 npm ci) → `npx cap sync android` → gradle assembleDebug
#
# 🔴 gradle 출력은 **로그 파일로만** 보낸다. `./gradlew … | head` 처럼 파이프로 자르면 SIGPIPE 로
#    빌드가 중간에 죽는다(TheMeal 에서 실제로 겪음). 결과는 종료 코드와 로그 끝부분으로 판단한다.
# 🔴 JDK 21 을 명시한다 — @capacitor/android 7 이 Java 21(VERSION_21)을 요구한다.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ROOT="${BJJ_MOBILE_LOCAL:-$HOME/.node-local/bjj-mobile}"
export JAVA_HOME="${JAVA_HOME_21:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.node-local/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

LOG_DIR="${BJJ_APK_LOG_DIR:-$LOCAL_ROOT/logs}"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
CAP_LOG="$LOG_DIR/cap-sync-$STAMP.log"
GRADLE_LOG="$LOG_DIR/gradle-$STAMP.log"

bash "$PROJECT_ROOT/scripts/sync-local.sh"

cd "$LOCAL_ROOT"
if [ ! -d node_modules/@capacitor/cli ]; then
  echo "[build-apk] node_modules 없음 → npm ci"
  npm ci --no-audit --no-fund > "$LOG_DIR/npm-ci-$STAMP.log" 2>&1
fi

# local.properties(sdk.dir)는 기계별 값이라 NFS 에 두지 않는다 — 미러에 없으면 만든다.
if [ ! -f android/local.properties ]; then
  echo "sdk.dir=$ANDROID_HOME" > android/local.properties
fi

echo "[build-apk] npx cap sync android → $CAP_LOG"
set +e
npx cap sync android > "$CAP_LOG" 2>&1
CAP_RC=$?
set -e
if [ "$CAP_RC" -ne 0 ]; then
  echo "[build-apk] cap sync 실패 rc=$CAP_RC — 로그: $CAP_LOG"
  exit "$CAP_RC"
fi

echo "[build-apk] gradlew assembleDebug → $GRADLE_LOG (JAVA_HOME=$JAVA_HOME)"
cd "$LOCAL_ROOT/android"
set +e
./gradlew assembleDebug --no-daemon > "$GRADLE_LOG" 2>&1
GRADLE_RC=$?
set -e
echo "[build-apk] gradle rc=$GRADLE_RC"
if [ "$GRADLE_RC" -ne 0 ]; then
  echo "[build-apk] 빌드 실패 — 로그: $GRADLE_LOG"
  exit "$GRADLE_RC"
fi

APK="$LOCAL_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "[build-apk] 빌드는 성공했는데 APK 가 없다: $APK"
  exit 1
fi
echo "[build-apk] APK: $APK"
echo "[build-apk] size: $(stat -c %s "$APK") bytes"
echo "[build-apk] md5:  $(md5sum "$APK" | cut -d' ' -f1)"
