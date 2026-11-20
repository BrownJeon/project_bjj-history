#!/usr/bin/env bash
# Signed preparation bundle only. Does not contact Play Console or deploy the web service.
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ROOT="${BJJ_MOBILE_LOCAL:-$HOME/.node-local/bjj-mobile-aab}"
export JAVA_HOME="${JAVA_HOME_21:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.node-local/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export BJJ_UPLOAD_PROPERTIES="${BJJ_UPLOAD_PROPERTIES:-$HOME/.config/bjj-mobile/upload.properties}"
if [ ! -f "$BJJ_UPLOAD_PROPERTIES" ]; then
  echo 'Upload signing is required. Run signing:prepare or set BJJ_UPLOAD_PROPERTIES.' >&2
  exit 1
fi
python3 - "$PROJECT_ROOT" "$BJJ_UPLOAD_PROPERTIES" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]).resolve(); signing=Path(sys.argv[2]).resolve(); checkout=root.parent
if checkout == signing or checkout in signing.parents: raise SystemExit('Signing must be outside the checkout')
v=json.loads((root/'version.json').read_text())
for name in ['package.json','package-lock.json']:
    if json.loads((root/name).read_text())['version'] != v['versionName']: raise SystemExit('Mobile version mismatch')
if (root.parent/'package.json').exists() and json.loads((root.parent/'package.json').read_text())['version'] != v['versionName']:
    raise SystemExit('Root app version mismatch')
if signing.stat().st_mode & 0o077: raise SystemExit('upload.properties must be owner-only')
props=dict(line.split('=',1) for line in signing.read_text().splitlines() if line and not line.startswith('#'))
for key in ['storeFile','storePasswordFile','keyPasswordFile']:
    p=Path(props[key]).resolve()
    if not p.is_file() or p.stat().st_mode & 0o077: raise SystemExit('Signing files must exist with owner-only permissions')
    if checkout == p or checkout in p.parents: raise SystemExit('Private signing files must be outside the checkout')
PY
mkdir -p "$LOCAL_ROOT"
exec 9> "$LOCAL_ROOT/.build-aab.lock"
flock -n 9 || { echo 'Another AAB build is using this mirror; retry after it finishes.' >&2; exit 1; }
bash "$PROJECT_ROOT/scripts/sync-local.sh"
cd "$LOCAL_ROOT"
# Verify the completed source copy before npm resolves any parent manifest.
test "$(node -p "require('./package.json').name")" = 'bjj-mobile'
test "$(npm prefix)" = "$LOCAL_ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p logs artifacts
npm ci --no-audit --no-fund > "logs/npm-ci-$STAMP.log" 2>&1
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npx --no-install cap sync android > "logs/cap-sync-$STAMP.log" 2>&1
echo "[build-aab] bundleRelease + lintRelease; logs/gradle-aab-$STAMP.log"
cd android
./gradlew :app:bundleRelease :app:lintRelease --no-daemon --max-workers=2 > "../logs/gradle-aab-$STAMP.log" 2>&1
cd ..
VERSION="$(node -p "require('./version.json').versionName")"
BUNDLE="artifacts/BJJ-TrainingLog-$VERSION.aab"
cp android/app/build/outputs/bundle/release/app-release.aab "$BUNDLE"
sha256sum "$BUNDLE"
echo "[build-aab] Signed AAB: $LOCAL_ROOT/$BUNDLE"
