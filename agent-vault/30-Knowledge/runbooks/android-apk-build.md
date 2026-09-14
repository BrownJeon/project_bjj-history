---
name: android-apk-build
aliases: ["APK 빌드", "안드로이드 앱 빌드", "Capacitor 빌드 절차"]
tags:
  - type/runbook
  - domain/mobile
  - domain/infra
related_tasks:
  - "[[task-038-app-icon]]"
  - "[[task-039-android-apk]]"
created: 2026-09-14
updated: 2026-09-14
---

# Android APK 빌드·업데이트 런북

배경·결정 이력: [[task-039-android-apk]] · 아이콘: [[task-038-app-icon]] · 최초 작업절차서: [[app-icon-and-apk-procedure]]

## 1. 구조
- 방식: **Capacitor 7 원격 URL 로딩** — 앱은 껍데기, WebView 가 `https://bjj.xn--lh0b87pnudm10a4vd.com` 을 불러온다(한글 도메인 대신 퓨니코드).
- 앱 ID `com.miraclepenguin.bjj` · 이름 `BJJ 훈련일지` · targetSdk 35 · 디버그 서명 사이드로드(Play 스토어 없음, release 키 없음).

| 경로 | 내용 |
|---|---|
| `mobile/package.json`·`package-lock.json` | Capacitor 7 플러그인: app·browser·filesystem·status-bar·**file-transfer 1.0.12**(2.x 는 Capacitor 8 전용) |
| `mobile/capacitor.config.ts` | `server.url`·`androidScheme https`·`cleartext false`·`errorPath index.html`·`android.adjustMarginsForEdgeToEdge 'auto'` |
| `mobile/app-shell/index.html` | 서버 연결 실패 시에만 뜨는 "연결할 수 없습니다" 안내 |
| `mobile/android/` | Android 프로젝트 소스(빌드 산출물은 gitignore) |
| `mobile/android/app/src/main/AndroidManifest.xml` | singleTask · 딥링크 `bjjapp://auth` · `allowBackup=false` · `windowSoftInputMode=adjustResize` · 저장 권한 `maxSdkVersion=29` |
| `mobile/android/app/src/main/java/com/miraclepenguin/bjj/MainActivity.java` | API 35+ 키보드(IME) 인셋 리스너 |
| `mobile/android/app/src/main/res/values/{styles,bjj_colors}.xml` | 창 배경 `#0C0D12`, 밝은 바 아이콘 |
| `mobile/scripts/sync-local.sh` | NFS → ext4 미러 동기화(build·.gradle·local.properties·.idea 보호) |
| `mobile/scripts/build-apk.sh` | 동기화 → (필요 시 npm ci) → `npx cap sync android` → `gradlew assembleDebug` |
| 웹 쪽 | `web/src/native/{bridge,appLogin,backStack,useBackHandler}.js`·`NativeAppHost.jsx`, `web/src/utils/download.js` — `@capacitor/*` import 금지, `window.Capacitor` 전역만 |

- 🔴 NFS noexec: npm·Capacitor CLI·gradle 은 **미러 `~/.node-local/bjj-mobile/`** 에서만 돈다. 편집은 항상 NFS, 미러는 실행 전용.

## 2. 빌드
```bash
bash /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/mobile/scripts/build-apk.sh
```
- JDK 21(`/usr/lib/jvm/java-21-openjdk-amd64`), SDK `~/.node-local/android-sdk` 를 스크립트가 지정.
- 로그: `~/.node-local/bjj-mobile/logs/{cap-sync,gradle}-<시각>.log`. 🔴 gradle 출력을 `| head` 등 파이프로 자르지 말 것(SIGPIPE 로 빌드가 죽음).
- 산출 APK: `~/.node-local/bjj-mobile/android/app/build/outputs/apk/debug/app-debug.apk` (끝에 크기·md5 출력). 전달은 scratchpad 로 복사 후 `SendUserFile`.

## 3. 검사
```bash
BT=~/.node-local/android-sdk/build-tools/35.0.0
APK=~/.node-local/bjj-mobile/android/app/build/outputs/apk/debug/app-debug.apk
$BT/aapt2 dump badging "$APK"                                              # package·label BJJ 훈련일지·icon·권한
$BT/aapt2 dump xmltree --file AndroidManifest.xml "$APK"                   # singleTask(launchMode=2)·bjjapp/auth·allowBackup·windowSoftInputMode 0x10
$BT/aapt2 dump xmltree --file res/mipmap-anydpi-v26/ic_launcher.xml "$APK" # background·foreground·monochrome 3레이어
$BT/apksigner verify --print-certs "$APK"                                  # Verifies · CN=Android Debug
unzip -p "$APK" assets/capacitor.config.json                               # server.url 퓨니코드·https·adjustMarginsForEdgeToEdge
```
- 전체 자동 검사 묶음: `~/.node-local/bjj-backup/task-039-20260913-235046/harness/apk-checks.sh`(`run-all.sh` 에 포함). ⚠️ 같은 폴더 `e2e-039.cjs` 의 N4·N5·N10 은 옛 기대값(상단 24px)이라 지금 돌리면 실패 — 기대값을 `env()` 0px 로 고쳐야 한다(board 백로그).

## 4. 업데이트 규칙 — 재설치가 필요한가?
| 바뀐 것 | 할 일 | 재설치 |
|---|---|---|
| 화면·기능(웹 `web/src`·`web/public`·`index.html`)·백엔드 | CLAUDE.md "프론트 빌드" 로 웹 배포(백엔드면 `pm2 restart bjj`) | **불필요** — 앱을 완전히 껐다 켜면 반영 |
| 아이콘·권한·플러그인·`capacitor.config.ts`·테마(styles.xml)·`MainActivity`·`AndroidManifest` | `build-apk.sh` → 검사 → APK 전달 → 덮어쓰기 설치 | **필요** |
- 🔴 네이티브 변경은 **착수 전에 사용자에게 "재설치 필요"를 먼저 알린다**(2026-09-14 한 번 누락).
- 웹만으로 되는 방법이 있으면 그쪽을 먼저 검토(예: 로그인 302 폴백 전환은 웹 배포만으로 가능 — §7).

## 5. 아이콘 재생성
```bash
node /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/web/scripts/gen-app-icons.mjs --android \
     /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/mobile/android/app/src/main/res
```
- 이후 APK 재빌드. 도안은 생성기 상단 상수가 단일 진실(산출 PNG/XML 을 손으로 고치지 말 것). 웹 아이콘은 옵션 없이 실행 후 웹 빌드.
- 생성기는 sharp 를 TheMeal ext4(`~/.node-local/themeal`)에서 빌린다 — TheMeal 쪽 정리 시 같이 깨짐.
- 전경 벡터는 `drawable/ic_bjj_foreground.xml`·`ic_bjj_monochrome.xml` — 템플릿 `drawable-v24/ic_launcher_foreground.xml` 이 같은 이름을 덮으므로 이름을 분리해 둔 것.

## 6. 서명 키 — 백업 필수
- 디버그 키 `~/.android/debug.keystore`(인증서 SHA-256 `a4c23dca…9e47`, 유효 2056-09-05).
- 🔴 이 키를 잃거나 다른 키로 빌드하면 **덮어쓰기 설치가 거부**된다 → 앱 삭제 후 재설치(앱 데이터·로그인 초기화). 서버 이전·재설치 전에 키 파일을 안전한 곳에 백업할 것. 키는 git 에 넣지 않는다(`*.keystore`·`*.jks` gitignore).

## 7. 앱 로그인 흐름
1. 앱 OAuth 버튼 → `Browser.open('https://bjj…/api/auth/app-start?provider=google|github')`(Custom Tab — Google 이 WebView 로그인을 막음).
2. `GET /api/auth/app-start` → provider 화이트리스트 → 쿠키 `bjj_app_login=1`(HttpOnly·Secure·Lax·10분) → `302 /api/auth/<provider>`(공유 `@workspace/auth-oauth` 무수정).
3. 공유 OAuth 가 `/oauth/callback?token=` 으로 착지 → `backend/src/routes/appOAuthCallback.js`(static 뒤·SPA 폴백 앞): 쿠키 + 유효 JWT → 60초·1회용 64hex 코드 발급, 쿠키 삭제 → `302 bjjapp://auth/callback?code=…`. 실패(`/login?error=` 착지 포함)면 `bjjapp://auth/callback?error=…`. 쿠키 없으면 `next()`(웹 로그인 그대로).
4. 앱 딥링크(`appUrlOpen` / 콜드스타트 `getLaunchUrl`) → `closeExternal` → `POST /api/auth/app-exchange {code}` → JWT → `login(token)` → 홈. 딥링크에는 JWT 를 싣지 않는다.
- **fallback=1**: 기기에서 302 스킴 이동이 막히면 OAuthButtons 주소에 `&fallback=1` 을 붙여 웹 배포 → 콜백이 "앱으로 돌아가기" 버튼 페이지를 준다(재설치 불필요).
- 함정: `new URL('bjjapp://auth/callback')` 은 host=`auth`·pathname=`/callback` 으로 파싱된다. `getLaunchUrl()` 은 새로고침 뒤에도 옛 주소를 준다 → 중복 교환 방지(Set + sessionStorage).

## 8. 앱 안 저장
- `web/src/utils/download.js` → 앱이면 `bridge.saveToDevice` → `@capacitor/file-transfer@1.0.12` `downloadFile` 로 **스트리밍** 저장(base64 로 메모리에 올리지 않음), 경로 `Download/BJJ/<파일명>`(`Filesystem.getUri` EXTERNAL_STORAGE 기준 절대경로). 같은 이름은 `_(2)`… 로 비킴. 완료/실패 토스트(조용한 실패 금지).
- 파일명은 한글·영문·숫자·`.`·`-`·`_` 만 남긴다(`+`·`%` 가 있으면 플러그인이 경로를 디코드하며 깨짐).
- Android 11+ 는 권한 창 없음, API 29 이하만 READ/WRITE 권한(`maxSdkVersion=29` + `requestLegacyExternalStorage`).
- 같은 도메인 `/uploads/*` 링크는 앱에서만 저장 흐름으로 가로챈다(외부 도메인 링크는 시스템 브라우저).

## 9. 교훈·함정
- **Android 15 edge-to-edge**: WebView 가 시스템 바 밑까지 그려지고, 이 WebView 에서 CSS `env(safe-area-inset-*)` 는 **0** 을 준다 → 웹 CSS 만으로는 하단 탭바 겹침을 못 막는다. 해법 = `capacitor.config` `android.adjustMarginsForEdgeToEdge: 'auto'`(WebView 에 시스템 바·컷아웃만큼 네이티브 margin) + 창 배경색. 웹 상단 여백은 `--native-top: env(safe-area-inset-top,0px)` — 예전 24px 바닥값은 네이티브 margin 과 이중 여백이라 제거.
- **키보드(IME)**: Capacitor 의 edge-to-edge margin 은 IME 를 계산하지 않고, API 35 에서는 `adjustResize` 도 창을 안 줄인다 → `MainActivity` 에서 인셋 리스너를 교체해 하단 margin = max(시스템 바, IME)(API 35+ 만; 34 이하는 `adjustResize` 가 처리하므로 이중 축소 방지). 웹 `NativeAppHost` 는 WebView 가 줄면 포커스 칸을 가운데로 스크롤.
- headless 로는 시스템 바·키보드가 재현되지 않는다 — 이 영역은 **실기기 확인이 유일한 판정**.
- **Android XML 주석에 `--` 금지**: 주석 안 `--bg` 같은 문자열 하나로 `mergeDebugResources` 가 실패했다.
- 뒤로가기 종료 판정은 `history.length` 가 아니라 App `backButton` 의 `canGoBack`(history.length 는 줄지 않아 앱이 안 꺼짐).

## 10. 남은 리스크
- **커스텀 스킴 PKCE 미결속**(Reviewer MEDIUM, 보류): 다른 앱이 `bjjapp://auth` 를 등록하면 60초·1회용 코드를 가로챌 이론적 여지. 다중 사용자로 넓히면 app-start challenge / app-exchange verifier 결속 추가.
- **10분 쿠키 잔존**: 앱 로그인을 시작만 하고 10분 안에 같은 폰 크롬에서 웹 로그인하면 그 1회가 앱 스킴으로 넘어간다(콜백에서 즉시 삭제, UX 엣지케이스).
- 실기기 확인 대기: 키보드·저장 가시성(`Download/BJJ`)·뒤로가기·외부 링크 — 저장이 안 보이면 대안 `Directory.Documents` 의 `BJJ/`(웹 배포만으로 전환).
