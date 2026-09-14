---
name: task-039-android-apk
aliases: ["APK", "안드로이드 앱", "Capacitor", "모바일 앱 설치"]
tags:
  - type/task
  - domain/mobile
  - domain/backend
  - domain/frontend
  - domain/infra
related_tasks:
  - "[[task-038-app-icon]]"
status: done
created: 2026-09-13
updated: 2026-09-14
---

# task-039 — Android APK 로 설치하는 앱 (Capacitor 7, 원격 URL 로딩)

작업절차서: [[app-icon-and-apk-procedure]] "절차서 ② Android APK" (Phase 0~7). 이 파일은 계약·결과만 담는다.

## 사용자 지시·결정 (2026-09-13)
> "모바일 앱에서도 동작할 수 있도록 apk빌드하여 앱설치할 수 있도록 구현 (최근 식단관리 프로젝트에서 구현했었음)"
- 앱 이름 **`BJJ 훈련일지`** · 영상/캡처 저장은 **앱 안에서 폰 저장소에 직접** · 아이콘은 [[task-038-app-icon]] 산출물 · **JDK 21 은 설치돼 있음(버전만 맞춰 지정)** · **Authelia 완전 제거**(Phase 0 에서 처리 완료, 아래) · "한번에 마지막까지 작업, 사용자 조작이 필요할 때만 요청".

## Phase 0 결과 (Leader, 2026-09-13 23:3x)
- Authelia: 사용자 sudo 실행 → 🔴 Leader 조사 오류로 사용처 3 vhost(api·git·admin) 누락, `nginx -t` 실패 → 사용자 결정(admin 비활성, git·api 는 자체 인증으로 공개) 복구 명령 A2 실행 → `nginx -t` OK·reload, 컨테이너 0·9091 리슨 0, fail2ban active, 사이트 코드 기존과 동일(git 200, bjj·app·climb·coin 200, 나머지 307), admin 비활성. 별건: `api` 504(upstream 192.168.219.163:8000 무응답 — 기존 문제, HOME-SERVER 백로그). HOME-SERVER_CONFIG 사본 정리는 별도 에이전트가 진행.
- 툴체인: JDK `openjdk 21.0.12`(`/usr/lib/jvm/java-21-openjdk-amd64`), SDK `platforms/android-35`·`build-tools/{34.0.0,35.0.0}`, `~/.android/debug.keystore` 유효 2056-09-05.
- 코드 실측: SPA 폴백 `backend/src/index.js:57-62`(`app.get(/^(?!\/api\/).*/…)` — 🔴 정규식 수정 금지 주석), `/uploads` 는 공개 정적(`index.js:29-40`, 인증 없음), OAuth 라우터 `backend/src/routes/auth.js:82-90`(공유 `@workspace/auth-oauth`, `callbackBaseUrl`/`frontendUrl` = `OAUTH_CALLBACK_BASE`), 웹 버튼 `web/src/components/OAuthButtons.jsx:40`(`window.location.href='/api/auth/${provider}'`), 콜백 페이지 `web/src/pages/OAuthCallbackPage.jsx`(`?token=` → `login(token)`). npm: `@capacitor/core@7.6.9`, `@capacitor/file-transfer` 최신 2.0.5(**Capacitor 7 호환 버전 peerDependencies 로 확인 필요**).

## 계약 A (dev-039)
참조 원본(먼저 읽을 것): TheMeal `capacitor.config.ts`, `scripts/sync-local.sh`, `src/lib/native/bridge.ts`(+`__tests__`), `src/app/(auth)/login/AppDeepLink.tsx`·`GoogleLoginButton.tsx`, `android/app/src/main/AndroidManifest.xml`, `agent-vault/10-Flow/tasks/task-012-phase7-share-app.md`(B 착수분·실기기 피드백·완료), `task-013-app-icon.md`.

### A-1 골격 `mobile/` (미러 `~/.node-local/bjj-mobile/`)
- `mobile/package.json`(name `bjj-mobile`, private), `capacitor.config.ts`: `appId 'com.miraclepenguin.bjj'`, `appName 'BJJ 훈련일지'`, `webDir 'app-shell'`, `server: { url: 'https://bjj.xn--lh0b87pnudm10a4vd.com', androidScheme: 'https', cleartext: false }`(퓨니코드 이유 주석).
- `mobile/app-shell/index.html`: 다크 배경 "서버에 연결 중…/연결할 수 없습니다" 안내.
- 미러에서 설치 `@capacitor/core@^7 @capacitor/app@^7 @capacitor/browser@^7 @capacitor/filesystem@^7 @capacitor/status-bar@^7` + dev `@capacitor/cli@^7 @capacitor/android@^7` + 저장용 플러그인(A-5). `package.json`·lock → NFS.
- `npx cap add android`(미러) → `local.properties`(미러 전용) → NFS 반영. `mobile/scripts/sync-local.sh`(NFS→미러, build/.gradle/local.properties protect). `mobile/scripts/build-apk.sh`(sync → `npx cap sync android` → gradle `assembleDebug`, `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`, 출력은 로그 파일 — 🔴 파이프 금지) · 루트 `.gitignore` 에 `mobile/node_modules/`, `mobile/android/.gradle/`, `mobile/android/build/`, `mobile/android/app/build/`, `mobile/android/local.properties`, `*.keystore`, `*.jks`.

### A-2 네이티브
- `AndroidManifest.xml`: `launchMode="singleTask"`, intent-filter `bjjapp://auth/callback`(VIEW·DEFAULT·BROWSABLE, `android:scheme="bjjapp" android:host="auth"`), `INTERNET`, A-5 에 필요한 최소 권한만.
- `res/values/strings.xml` `app_name`·`title_activity_main` = `BJJ 훈련일지`.
- 아이콘: `node web/scripts/gen-app-icons.mjs --android mobile/android/app/src/main/res`(task-038 산출 생성기, NFS 에서 실행 가능 여부는 task-038 결과 따름).

### A-3 웹 브리지 `web/src/native/bridge.js` (+ 단위 테스트)
- `window.Capacitor` 전역만 사용(`@capacitor/*` import 금지). `isNativeApp()`, `openExternal(url)`/`closeExternal()`(Browser), `onAuthDeepLink(cb)`(`App.addListener('appUrlOpen')` + `App.getLaunchUrl()` 콜드스타트, 커스텀 스킴 `bjjapp://auth/callback?code=` 는 host=`auth`·path=`/callback` 으로 파싱되는 함정 처리), `onBackButton(cb)`, `saveToDevice(...)`(A-5). 플러그인 부재 시 no-op/null.
- 앱 부트스트랩(예 `web/src/main.jsx` 또는 `App` 루트): 앱이면 `document.documentElement.dataset.native = ''`, 딥링크 리스너 등록, 뒤로가기 리스너 등록.

### A-4 앱 로그인 (공유 `@workspace/auth-oauth` 무수정)
1. `OAuthButtons.jsx`: `isNativeApp()` 이면 `openExternal('https://bjj.xn--lh0b87pnudm10a4vd.com/api/auth/app-start?provider=' + p)`, 아니면 기존.
2. `GET /api/auth/app-start?provider=google|github` (`backend/src/routes/auth.js`, **공유 OAuth 라우터 mount 보다 앞**에 등록): provider 화이트리스트 → 쿠키 `bjj_app_login=1; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/` → `302 /api/auth/${provider}`.
3. `GET /oauth/callback` — `backend/src/index.js` **SPA 폴백(57) 앞, static 뒤**: 쿠키 `bjj_app_login` 있음 + `token` 쿼리가 유효 JWT(서명·만료 검증) → 64hex 1회용 코드 발급(메모리 Map, TTL 60s, 값=토큰) → 쿠키 삭제 → `302 bjjapp://auth/callback?code=…`. 쿠키 있음 + `error` 쿼리 → 쿠키 삭제 후 `302 bjjapp://auth/callback?error=…`. 쿠키 없음 → `next()`(웹 흐름 무변경). 🔴 SPA 폴백 정규식은 건드리지 않는다.
4. `POST /api/auth/app-exchange {code}`: 코드 형식 검증 → Map 에서 꺼내고 **즉시 삭제**(1회용) → 만료면 401 → `{token}` 반환(표준 응답 `ok`). 위조/재사용 401, 형식 오류 400. 코드 발급·교환 로그에 코드·토큰 원문 금지.
5. 웹 앱 측(WebView): `onAuthDeepLink` → `closeExternal()` → `POST /api/auth/app-exchange` → `login(token)`(AuthContext) → `navigate('/', {replace:true})`. 중복 교환 방지(ref/flag), 실패 시 toast + 로그인 화면.
6. 폴백: 302 가 기기에서 막히는 경우를 대비해 `/oauth/callback` 핸들러가 `?fallback=1` 이면 "앱으로 돌아가기" 버튼 HTML(스킴 링크) 반환 — 기본 경로는 302.

### A-5 앱 안 직접 저장
- 먼저 확인: Capacitor 7 호환 저장 방법 — `@capacitor/file-transfer`(Capacitor 7 호환 메이저 확인) `downloadFile` 로 **스트리밍**(메모리에 base64 로 올리지 않음) 저장 → 저장 위치를 **파일 앱/갤러리에서 보이게**(Android 10+ `Download/BJJ` 또는 MediaStore; 필요 시 Filesystem `Directory.ExternalStorage`/`Documents` 차이와 권한 조건을 플러그인 소스로 확인). 결정 근거를 결과에 기록.
- `web/src/utils/download.js` `downloadFile(url, filename, {onProgress})`: 앱이면 bridge `saveToDevice`(완료/실패 toast, 조용한 실패 금지), 웹이면 기존 `<a download>` 방식. 교체 지점: `web/src/components/VideoPlayer.jsx:45-62`, `web/src/pages/ClipsPage.jsx:482-533`(캡처 여러 장 순차), `web/src/components/ClipDetailModal.jsx:155-163`. 같은 도메인 `/uploads/*` 링크가 앱 WebView 를 덮지 않게 앱에서는 저장 흐름으로.

### A-6 화면
- 상태바: `[data-native]` 에서 앱 셸(`web/src/components/Layout.jsx` 최상위 컨테이너) `padding-top: max(env(safe-area-inset-top), 24px)` — 스크롤 컨테이너가 아닌 셸에(TheMeal `layout.tsx:34`·`globals.css:128-130` 교훈).
- 뒤로가기: 열린 모달이 있으면 닫기(모달 닫기 이벤트/전역 스택 등 기존 구조에 맞는 최소 방식) → 아니면 `history.length > 1` 이면 `history.back()` → 루트면 `App.exitApp()`.

### A-7 빌드·배포·검사
- 웹: CLAUDE.md 절차(web/src·web/public·index.html → ext4 work, build, dist). 백엔드 변경 → `pm2 restart bjj`.
- APK: `mobile/scripts/build-apk.sh` → `aapt2 dump badging`(package `com.miraclepenguin.bjj`, label `BJJ 훈련일지`, icon) · `aapt2 dump xmltree --file AndroidManifest.xml`(bjjapp/auth, singleTask) · `aapt2 dump xmltree --file res/mipmap-anydpi-v26/ic_launcher.xml`(3레이어) · `apksigner verify --print-certs` · `unzip -p … assets/capacitor.config.json`.

### 하지 말 것
- 공유 `@workspace/auth-oauth` 수정, SPA 폴백 정규식 수정, 딥링크에 JWT 싣기
- 웹 코드에서 `@capacitor/*` import
- NFS 위 npm/gradle 실행, gradle 출력 파이프
- release 키스토어 생성·키 커밋, 커밋/푸시(Leader 가 사용자 실기기 확인 후)

## 검증 (dev 자체 → Reviewer → Leader 실행)
- 단위: `bridge.js`(비앱 no-op, 딥링크 파싱 host/path/쿼리, 콜드스타트, 중복), `download.js`(웹/앱 분기, 실패 toast) — 실제 파일 import.
- 백엔드(실서버, user 2 JWT): `app-start`(provider 화이트리스트 400, 쿠키 속성, 302 Location) · `/oauth/callback`(쿠키+유효토큰 → 302 `bjjapp://auth/callback?code=<64hex>` & 쿠키 삭제 / 쿠키+위조토큰 → 에러 스킴 / 쿠키 없음 → SPA HTML 200) · `app-exchange`(정상 → token, 재사용 401, 61초 후 401(시간 주입 또는 TTL 짧게 테스트), 형식 오류 400).
- 웹 회귀: 일반 브라우저 Google 로그인 버튼이 여전히 `/api/auth/google` 로 이동, `/oauth/callback?token=` 웹 착지 동작 그대로, 다운로드 버튼 웹 동작 그대로, headless 412px 에서 `data-native` 모사 시 상단 여백.
- APK 검사 명령 전부 + APK 크기·md5.
- 기준선(CHECKSUM technique_mastery·clip_usage_logs·users) 시작=끝, user 3 무쓰기.

## dev-039 결과
- [00:22] **완료 — 백엔드·웹 배포(서빙 번들 `index-D7bxEBCG.js` md5 `47c1a0fd…`, css `index-DgfRZBxW.css`)·APK 빌드·검사·기준선 동일. 미커밋.** 하네스 `H=/home/brownjeon/.node-local/bjj-backup/task-039-20260913-235046/harness` (`bash $H/run-all.sh <tag> [--skip-ttl]` → dev 실행 **rc=0**). 배포 전 dist 백업 `…/task-039-20260913-235046/dist-before/`(번들 `index-yRVVVCex.js`).
- [00:22] **파일**
  - 신규 `mobile/`: `package.json`·`package-lock.json`(미러 설치분 복사), `capacitor.config.ts`(appId `com.miraclepenguin.bjj`·appName `BJJ 훈련일지`·webDir `app-shell`·server url 퓨니코드·https·cleartext false·**`errorPath: 'index.html'`**), `app-shell/index.html`(연결할 수 없습니다 + 다시 시도/온라인 복귀 시 자동 재시도, "서버에 연결 중…"), `scripts/sync-local.sh`(NFS→미러, build·.gradle·local.properties·.idea protect), `scripts/build-apk.sh`(sync → 필요 시 npm ci → local.properties 생성 → `npx cap sync android` → `./gradlew assembleDebug --no-daemon` **로그 파일로만**, JDK21), `android/**`(cap add 산출 + 아래 매니페스트 + 아이콘). 루트 `.gitignore` 에 `mobile/node_modules/`·`mobile/android/{.gradle,build,app/build,local.properties}`·`*.keystore`·`*.jks`.
  - `mobile/android/app/src/main/AndroidManifest.xml`: singleTask(템플릿 기본) · intent-filter VIEW/DEFAULT/BROWSABLE `scheme=bjjapp host=auth` · INTERNET · READ/WRITE_EXTERNAL_STORAGE `maxSdkVersion=29` · `requestLegacyExternalStorage=true`. `strings.xml` app_name·title_activity_main = `BJJ 훈련일지`(cap add 가 appName 으로 생성).
  - 아이콘: dev-038 done 후 `node web/scripts/gen-app-icons.mjs --android <NFS>/mobile/android/app/src/main/res` rc=0 — 신규 2(`drawable/ic_bjj_{foreground,monochrome}.xml`)·변경 29(mipmap·splash·values·anydpi) (`$H/gen-icons-android.log`, `res-before/after.md5`).
  - 백엔드 신규 `backend/src/services/appAuthCodes.js`(Map 저장소 60s·1회용·maxEntries 500·시계 주입, 쿠키·딥링크 헬퍼), `backend/src/routes/appOAuthCallback.js`(콜백 핸들러·fallback HTML), 수정 `backend/src/routes/auth.js`(`GET /app-start`·`POST /app-exchange` — 공유 OAuth mount **앞**), `backend/src/index.js`(`app.get(['/oauth/callback','/login'], handler)` — dist static 뒤·SPA 폴백 앞, **정규식 무수정**).
  - 웹 신규 `web/src/native/bridge.js`·`backStack.js`·`useBackHandler.js`·`appLogin.js`·`NativeAppHost.jsx`, `web/src/utils/download.js`. 수정 `main.jsx`(첫 렌더 전 `data-native` + `<NativeAppHost/>`), `components/OAuthButtons.jsx`, `api/auth.js`(`appExchange` — fetch), `contexts/AuthContext.jsx`(`login` 이 boolean 반환, 기존 호출부 무영향), `components/Modal.jsx`·`MasterPanel.jsx`(뒤로=`backToList`, 헤더 ‹ 와 동일)·`MasterListPanel.jsx`(뒤로=`closeList`)·`SparFeedbackCard.jsx`(뒤로가기 스택 등록), `styles/tokens.css`(`--native-top`)·`styles/app.css`(`[data-native] .app-shell` padding-top, `.bjjm-panel/.bjjm-list` margin-top), `pages/ProfilePage.jsx`(fixed 오버레이 `top: var(--native-top,0px)`), `components/VideoPlayer.jsx`·`ClipDetailModal.jsx`(다운로드 교체). `@capacitor/*` import 0(번들 grep 0).
- [00:22] **결정·계약과 다른 점(Reviewer·Leader 확인 요청)**
  1. **저장 플러그인 = `@capacitor/file-transfer@1.0.12`**(dist-tag `latest-7`, peer `@capacitor/core >=7`; 2.0.5 는 `>=8` 이라 불가) + `@capacitor/filesystem@7.1.8`(경로·충돌 확인). 근거(소스 실측): `FileTransferPlugin.kt` — `isStoragePermissionGranted()` 가 `SDK_INT >= R(30)` 이면 권한 없이 진행, 완료 시 공개 폴더면 `MediaScannerConnection.scanFile`; ionfiletransfer-android 1.0.3 AAR 역어셈블 — `prepareForDownload` 가 `createParentDirectories`(mkdirs) 후 HttpURLConnection 스트림을 파일로 씀(메모리 base64 없음), `normalizeFilePath` 가 `file://` 제거 후 `URLDecoder.decode`(→ 파일명 `+`·`%` 금지, `sanitizeFileName` 에서 치움). 경로 = `Filesystem.getUri({directory:'EXTERNAL_STORAGE', path:'Download/BJJ/<이름>'})` → `file://` 떼고 디코드한 절대경로(스캐너가 경로를 기대). 같은 이름은 `stat` 성공 시 `_(2)`… 로 비킴. Filesystem 문서상 ExternalStorage 는 "11+ 접근 불가"로 적혀 있으나 실제로는 Download/ 하위에 앱 소유 파일 생성이 scoped storage 에서 허용되는 경로 — **실기기 5번에서 판정 필요**(안 되면 대안: `Directory.Documents` 의 `BJJ/` — 1줄 수정, APK 재빌드 불필요·웹 배포만).
  2. 권한 `maxSdkVersion` 은 절차서의 28 이 아니라 **29** + `requestLegacyExternalStorage` — 두 플러그인이 API 29 이하에서 READ+WRITE 를 요청하기 때문(위 소스). Android 11+ 에서는 무시되어 권한 창 없음.
  3. **`/login?error=` 도 가로챔**: 공유 라우터 실패 착지가 `/oauth/callback?error=` 가 아니라 `/login?error=oauth_failed&msg=…`(`adapters/express.js redirectOnError` 실측). 쿠키+error 일 때만 `bjjapp://auth/callback?error=…&msg=…`(msg 100자), 쿠키 없으면 next.
  4. fallback: `app-start?…&fallback=1` → 쿠키 값 `fallback` → 콜백이 302 대신 "앱으로 돌아가기" HTML(CSP `default-src 'none'`, 이스케이프). 요청 `?fallback=1` 도 허용(계약 문구). 웹 배포만으로 전환 가능.
  5. 뒤로가기 종료 판정은 `history.length>1` 이 아니라 **App `backButton` 이벤트의 `canGoBack`**(없을 때만 history.length) — history.length 는 줄지 않아 앱이 영원히 안 꺼짐. 모달 닫기는 Escape 흉내가 아니라 전역 스택(`useBackHandler`)로 **맨 위 하나만**.
  6. 딥링크 중복: 메모리 Set + sessionStorage(최근 5개). `getLaunchUrl()` 은 WebView 새로고침 뒤에도 옛 주소를 준다(`Bridge.intentUri` 가 생성 시 1회) → 이미 로그인 상태의 옛 launch 코드 실패는 **조용히**, 방금 누른 로그인(open) 실패는 항상 토스트.
  7. 같은 도메인 `/uploads/…` 링크(달력·수업 상세의 `video_file` target=_blank, 수업 영상 `download`)는 `NativeAppHost` 캡처 단계 클릭 가로채기로 **앱에서만** 기기 저장(계약 A-5 마지막 문장). 외부 도메인 링크는 손대지 않음(Capacitor `launchIntent` 가 시스템 브라우저로).
  8. `ClipsPage.jsx:482-533` 은 **호출처 없는 죽은 코드**(`_ClipDetail_REMOVED`, 번들에서 tree-shake — 배포 전 번들 `.download=` 2건 = VideoPlayer+ClipDetailModal 뿐, 배포 후 1건 = download.js)라 교체하지 않음. 실제 교체 = VideoPlayer(캡처 ↓·영상 ↓)·ClipDetailModal(device 모드 자동 저장).
  9. 상태바: 셸 padding-top 에 더해 **셸 안 절대배치 패널(관장실 대화·대화 관리)** 은 패딩 박스 기준이라 margin-top, **`/me` fixed 오버레이**는 top 을 같은 변수로 — 안 하면 이 셋이 상태바 밑으로 들어감.
- [00:22] **검증(전부 실행)** — `bash $H/run-all.sh dev --skip-ttl` rc=0
  - 백엔드 단위 `node --test unit-backend.cjs` **13/13**(실제 파일 require, 시계 주입 TTL 59.999s ok·60s/61s expired, 형식 10종, 상한 청소, 핸들러를 실제 express 에 붙여 쿠키 없음 next·유효/위조/만료/토큰없음/error·/login?error·fallback HTML 이스케이프).
  - 백엔드 실서버 `node server-backend.cjs` **31/31**(TTL 포함 1회 — `waited 61.1s → 401`; run-all 은 --skip-ttl 30/30): app-start google/github 302 `/api/auth/<p>` · Set-Cookie `bjj_app_login=1; Max-Age=600; Path=/; Expires=…; HttpOnly; Secure; SameSite=Lax`(공개 도메인 nginx 경유 동일) · 화이트리스트 밖 6종 400·쿠키 없음 · 콜백 쿠키+유효 → `302 bjjapp://auth/callback?code=<64hex>` + `bjj_app_login=; Path=/; Expires=Thu, 01 Jan 1970…` + no-store · 교환 200 토큰 동일·/me=user2 · 재사용 401 · 위조 401 · 형식 6종 400 · 위조토큰 → `?error=invalid_token` · `/login?error=` → 에러 스킴 · fallback HTML · **웹 회귀**: 쿠키 없음 `/oauth/callback?token=`·`/login?error=` SPA 200·쿠키 조작 없음, `/api/auth/google` 302 accounts.google.com, `/api/auth/kakao` 404, `/uploads` 없는 파일 404. pm2 로그에 64hex 0건(교환·발급 로그는 원문 없음).
  - 웹 단위 `node --import ./register-loader.mjs --test unit-web.mjs` **28/28**(실제 파일 import: bridge 비앱 no-op·isNativePlatform false·딥링크 파싱 host/path 함정·콜드스타트/웜/해제·backButton·saveToDevice 경로/충돌/진행률/실패·sanitize, backStack 순서·canGoBack 우선, appLogin 중복·새로고침·조용한 실패 조건·오류 링크, download 웹/앱 분기·실패 토스트·순차 요약·uploadsLinkTarget). **변이 7종 전부 FAIL 로 잡힘**(`mutants-web.log`: host 검사 제거 2·pathname includes 8·중복 제거 2·canGoBack 무시 1·실패 토스트 제거 3·옛 launch 조용히 제거 1·+%허용 2).
  - 화면 E2E `node --experimental-websocket e2e-039.cjs` **37/37**(headless Chrome CDP, 실서버 :3000·배포 번들, 412×915, 비-GET /api 는 app-exchange 외 전부 가짜 응답·GET /api/clips 가짜 1건): WEB — data-native 없음, Google → `/api/auth/google` 문서 이동→accounts.google.com, `/oauth/callback?token=` → `/` 로그인, `.app-shell` 0px·/me top 0px, 캡처 ↓ `<a download="테스트039_암바-1.jpg">`, 영상 링크 기본 동작(가로채지 않음), Escape 모달 닫힘, 예외 0. NATIVE(window.Capacitor 모사) — data-native, Google → `Browser.open('https://bjj.xn--lh0b87pnudm10a4vd.com/api/auth/app-start?provider=google')`·WebView 이동 없음, 오류 딥링크 토스트 "로그인을 취소했습니다", **실코드 딥링크 2회 → 교환 1회 → 홈**, 셸 24px·content 0px, 대화 관리 top 78(=24+54)·뒤로 닫힘, 모달 뒤로 → 모달만 닫힘(/clips 유지), 캡처 ↓ → downloadFile(`http://localhost:3000/uploads/test039/f1.jpg` → `/storage/emulated/0/Download/BJJ/테스트039_암바-1.jpg`)+토스트, 영상 ↓ 저장 1회·이동 없음, 404 실패 토스트, `/uploads` target=_blank 링크 저장·인스타 링크 미가로챔, /me top 24px, canGoBack true → history.back(/calendar→/), false → exitApp, **콜드스타트 getLaunchUrl 코드 → 자동 로그인, 새로고침 후 재교환 0·토스트 0**, 예외 0. 스크린샷 `…/task-039-20260913-235046/shots/`(412-web-01-home 61955B `2357a7e5…` · 412-native-01-home-statusbar-gap 63485B `c98fcbde…` · 02-master-list 28185B `9ba8f301…` · 03-frame-saved-toast 70977B `27b54ac8…` · 04-profile 60281B `7b7ce6f1…`, 2026-09-14 00:17 KST) — 육안: 앱 모사에서 상단 24px 띄워짐, 웹은 0.
  - 웹 빌드: CLAUDE.md 절차 그대로(src·index.html·public rsync → `npm run build` rc=0 → dist rsync → `pm2 restart bjj`), 새 index.html 은 이전과 해시 외 동일·public 파일 md5 동일. 서빙 확인 `curl https://bjj…/` → `index-D7bxEBCG.js`, 서빙 md5 = dist md5 `47c1a0fd334db4c8a761fdbb984503b9`.
  - **APK**: `/home/brownjeon/.node-local/bjj-mobile/android/app/build/outputs/apk/debug/app-debug.apk` **4,622,968 B · md5 `818f170d3a4da697f378485ea00d63db`**(2026-09-14 00:01, gradle `BUILD SUCCESSFUL in 8s`, 로그 `~/.node-local/bjj-mobile/logs/gradle-20260914-000117.log`; 아이콘 전 1차 빌드 4,313,122 B `f0077d70…`). 전달용 사본: `…/task-039-20260913-235046/apk/bjj-training-debug-20260914.apk`, scratchpad `bjj-training-debug-20260914.apk`(md5 동일). 검사 전문 `$H/apk-checks.log`:
    - badging: `package: name='com.miraclepenguin.bjj' versionCode='1' versionName='1.0' … compileSdkVersion='35'` · `targetSdkVersion:'35'` · `application: label='BJJ 훈련일지' icon='res/mipmap-anydpi-v26/ic_launcher.xml'` · `launchable-activity: name='com.miraclepenguin.bjj.MainActivity' label='BJJ 훈련일지'` · uses-permission INTERNET, READ/WRITE_EXTERNAL_STORAGE `maxSdkVersion='29'`(+ androidx 자동 `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`).
    - manifest xmltree: MainActivity `launchMode=2`(singleTask) · intent-filter `action.VIEW`·`category.DEFAULT`·`category.BROWSABLE`·`data scheme="bjjapp" host="auth"` · `requestLegacyExternalStorage=true`.
    - `ic_launcher.xml`·`ic_launcher_round.xml`: adaptive-icon **background @0x7f05003c(`color/ic_launcher_background` = `#ff795548`) · foreground @0x7f07005a(`drawable/ic_bjj_foreground`, vector 108dp) · monochrome @0x7f07005b(`drawable/ic_bjj_monochrome`)** — 3레이어.
    - apksigner: `Verifies` · v1 true · v2 true · `CN=Android Debug` · 인증서 SHA-256 `a4c23dca02f56db088b93a310913ffc639ced8a915ee4be3588abf07d9da9e47`(= `~/.android/debug.keystore`, 유효 2056-09-05).
    - `assets/capacitor.config.json`: appId·appName·webDir·server{url `https://bjj.xn--lh0b87pnudm10a4vd.com`, androidScheme https, cleartext false, errorPath index.html}. plugins.json: app·browser·file-transfer·filesystem·status-bar.
  - **기준선**(`$H/baseline.sh`, 읽기 전용): 시작(09-13 23:50) = 끝(09-14 00:18) = run-all dev 시작/끝 — `technique_mastery CHECKSUM 738744930` · `clip_usage_logs 10` · `users 4 (MAX id 4)` · `user3 필드 md5 fc781a67…`. user 3 쓰기 0, user 2 DB 쓰기 0(테스트 토큰 5~10분 JWT 직접 발급, 코드 교환은 메모리).
- [00:22] **다시 돌리는 법**: `bash $H/run-all.sh <tag> [--skip-ttl]`(백엔드 단위·웹 단위·변이·실서버·E2E·APK 검사·기준선) / APK 재빌드 `bash /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/mobile/scripts/build-apk.sh` / 아이콘 `node …/web/scripts/gen-app-icons.mjs --android …/mobile/android/app/src/main/res` 후 APK 재빌드 / 웹은 CLAUDE.md 프론트 빌드. 롤백: 웹 `rsync -a --delete …/task-039-20260913-235046/dist-before/ ~/.node-local/bjj-web/dist/`, 백엔드 git 되돌림 후 `pm2 restart bjj`.
- [00:22] **실행 안 했거나 대체한 것 / 실기기에서만 판정 가능**
  - 실제 안드로이드 기기·에뮬레이터 실행 없음 — 네이티브 동작은 `window.Capacitor` 모사로만 검증. 실기기 체크: ① 런처 아이콘·라벨 ② **Custom Tab 에서 서버 302 → `bjjapp://` 로 앱 복귀**(막히면 OAuthButtons 주소에 `&fallback=1` 추가 웹 배포) · 콜드 스타트 로그인 · 재실행 로그인 유지 ③ 상태바 겹침(24px 바닥값이 기기 상태바보다 작으면 겹칠 수 있음)·**하단 제스처 바와 탭바 겹침**(`--safe-bottom` 이 WebView 에서 0 이면 겹침 — 이번 범위에서 손대지 않음)·뒤로가기(모달→이전→종료) ④ 참고영상 +1·픽미업 ⑤ **`Download/BJJ` 저장이 파일 앱·갤러리에 보이는지**(가장 불확실, 위 결정 1) ⑥ 인스타·유튜브 외부 이동, 음성 파일 업로드 선택창(WebView `<input type=file>` — 이번에 손대지 않음).
  - Google 실제 로그인(OAuth 동의 화면) 미실행 — 서버 쪽은 쿠키+토큰을 직접 넣어 검증.
  - Browser.close 는 Android 구현이 있으나(`BrowserPlugin.close`) singleTask 복귀가 먼저 Custom Tab 을 정리할 수 있어 실패는 무시하도록 함.
  - 커밋·푸시 안 함. CLAUDE.md·web/public·web/scripts 미수정. 공유 `@workspace/auth-oauth`·SPA 폴백 정규식 무수정.
- [00:22] **Reviewer 참고(범위 밖 관찰, 수정 안 함)**: (a) 기존 공유 라우터가 `/oauth/callback?token=<JWT>` 를 URL 로 보내 morgan·nginx 접근 로그에 JWT 가 남는다(웹 로그인 기존 동작, 이번 변경 전부터). (b) 커스텀 스킴은 다른 앱이 같은 `bjjapp://` 를 등록하면 가로챌 수 있다 — 코드가 60초·1회용이라 창은 작지만, 막으려면 PKCE 식 결속(app-start 에 challenge, 교환에 verifier)이 필요(설계 변경이라 미적용). (c) 앱 로그인을 시작만 하고 10분 안에 같은 폰 크롬에서 웹 로그인을 하면 남은 쿠키 때문에 그 로그인이 앱으로 넘어간다(콜백에서 쿠키는 즉시 삭제되므로 1회). (d) 템플릿 기본 `android:allowBackup="true"` — localStorage JWT 가 기기 백업에 포함될 수 있음.

## Reviewer 결과

- [00:33] **판정: PASS.** Critical 0 · High 0 · Medium 1 · Low 1. 코드 직접 수정 없음(읽기 전용 감사). git diff 전체 대조 + 신규/수정 파일 전체 열람(백엔드 4·웹 신규 5+수정 13·mobile 전체) + `node --check` 재통과 + APK 독립 재검사(aapt2·apksigner·unzip)로 dev-039 결과의 수치·주장을 하나씩 실측 검증했다. Leader 의 `run-all.sh leader` 재실행(rc=0, 전 단계 통과, 기준선 start=end)도 근거로 채택했으며 DB 는 건드리지 않았다(read-only, 신규 쓰기 0).

```json
{
  "reviewId": "REV-039",
  "status": "PASS",
  "issues": [
    {
      "issue": "커스텀 스킴(bjjapp://auth) 딥링크는 Android App Links(https autoVerify)가 아니라 다른 앱이 같은 scheme+host를 등록하면 OS 선택 대화상자 경쟁 대상이 되고, app-start↔app-exchange 사이에 PKCE식 결속이 없다",
      "severity": "MEDIUM",
      "component": "mobile/android/app/src/main/AndroidManifest.xml:47-52, backend/src/services/appAuthCodes.js:46-57, backend/src/routes/appOAuthCallback.js:93-113",
      "risk": "이론상 로그인 복귀 시 뜨는 앱 선택 대화상자에서 사용자가 악성 앱을 잘못 고르거나(또는 과거에 그 앱을 기본으로 설정해 둔 경우) 60초·1회용 코드를 가로채 해당 계정으로 app-exchange 할 수 있다. 코드가 이미 완결된 로그인의 결과물이라 탈취 시 계정 탈취로 이어진다.",
      "evidence": "AndroidManifest.xml intent-filter data scheme=\"bjjapp\" host=\"auth\"(autoVerify 없음) · appAuthCodes.issue()가 무작위 32바이트 코드만 발급하고 별도 챌린지 검증이 없음",
      "recommendation": "1인 개인용 앱 범위에서는 60초 TTL·1회용·딥링크에 JWT 비노출로 노출 창이 이미 작아 당장 차단할 필요는 없다(dev-039 결과 [00:22] 참고 (b)에서 동일하게 판단·기록됨 — 동의). 추후 다중 사용자로 확장되면 PKCE(challenge/verifier) 결속을 권고. 이번 범위에서는 보류가 타당 — Developer 재작업 불필요."
    },
    {
      "issue": "AndroidManifest.xml의 allowBackup이 Capacitor 템플릿 기본값 true로 남아 30일 유효 JWT(localStorage)가 Android 자동 백업 대상에 포함될 수 있다",
      "severity": "LOW",
      "component": "mobile/android/app/src/main/AndroidManifest.xml:12",
      "risk": "ADB 백업(개발자 옵션 활성 기기) 또는 동일 구글 계정 새 기기 설정 시 클라우드 백업 복원 경로로 WebView localStorage가 함께 복원되면 오래된 세션 토큰이 다른 기기에 노출될 수 있다.",
      "evidence": "android:allowBackup=\"true\" (cap add 템플릿 기본값, 이번 작업에서 변경 안 함 — dev-039 결과 [00:22] 참고 (d)에서 이미 관찰·기록됨)",
      "recommendation": "cheap fix: android:allowBackup=\"false\" 로 변경(또는 fullBackupContent 룰로 WebView 데이터 제외). 다음 APK 재빌드 때 반영해도 되는 낮은 우선순위 — Leader 판단에 맡김."
    }
  ],
  "summary": { "critical": 0, "high": 0, "medium": 1, "low": 1 },
  "high_risk_areas": [
    "backend/src/routes/appOAuthCallback.js:76-121 (앱 로그인 복귀 분기 — 쿠키 유무·성공/에러·fallback 경로)",
    "backend/src/services/appAuthCodes.js:63-70 (코드 1회용 consume — 재사용·만료·형식오류 경계)",
    "web/src/native/bridge.js:75-95 (커스텀 스킴 host=auth/path=/callback 파싱 함정)",
    "web/src/native/appLogin.js:75-118 (콜드스타트 open+launch 중복 딥링크, 조용한 실패 조건)",
    "web/src/utils/download.js + native/bridge.js saveToDevice (실기기 Download/BJJ 저장 가시성 — dev도 '가장 불확실'로 표시, 실기기 검증 전)"
  ]
}
```

### 1. 앱 로그인 흐름 보안 — 세부 확인
- **`/api/auth/app-start`**(`backend/src/routes/auth.js:92-100`): provider 화이트리스트(`APP_AUTH_PROVIDERS = ['google','github']`, `appAuthCodes.js:27`) 통과 못하면 400, 통과 시에만 `/api/auth/${provider}` 로 302 — provider 값이 화이트리스트를 거쳤으므로 오픈 리다이렉트 불가능. 쿠키 `bjj_app_login`: `{httpOnly:true, secure:true, sameSite:'lax', path:'/'}` + `maxAge:600000`(10분) — `appAuthCodes.js:24,102-106` 확인. Cache-Control: no-store 확인.
- **`/oauth/callback`·`/login?error=`**(`backend/src/routes/appOAuthCallback.js`): `backend/src/index.js:59`에서 `app.use(express.static(distDir))`(정적 서빙) **뒤**, SPA 폴백(`index.js:61`) **앞**에 등록됨을 diff로 확인. GET 외 메서드는 즉시 next(). 쿠키 없으면(`mark !== '1' && mark !== 'fallback'`) 무조건 next() — 웹 로그인 흐름 완전 보존. 쿠키 있을 때만: `token` 유효(jwt.verify, 서명+만료 검증) → `appAuthCodes.issue(token)` 로 64자 hex 코드 발급 후 `302 bjjapp://auth/callback?code=…` / 무효·에러·토큰없음 → `302 bjjapp://auth/callback?error=…&msg=…`(msg 100자 절단). 쿠키는 성공·실패 관계없이 즉시 `clearAppLoginCookie` — 1회 소모.
  - **공유 라우터 실패 착지 실측 확인**: `/home/brownjeon/NFS/homes/brownjeon/project/shared/auth-oauth/adapters/express.js:84-97` 를 직접 읽어 `redirectOnError` 가 `${frontendUrl}/login?error=oauth_failed&msg=…` 로 리다이렉트함을 확인 — dev-039 결과 [00:22] 참고 3 의 주장과 정확히 일치. `/login`을 가로채지 않았다면 사용자가 구글에서 "취소"를 눌렀을 때 앱이 영원히 로그인 화면에 멈추는 실제 버그가 났을 것 — 올바른 대응.
- **JWT 검증 시점**: 코드 발급 전에 `jwt.verify(token, jwtSecret)`(`appOAuthCallback.js:98`)로 서명·만료를 먼저 검증하고, 성공했을 때만 `store.issue(token)` 호출 — 검증 실패 토큰으로는 코드가 발급되지 않는다.
- **코드 엔트로피·TTL·1회성·메모리 상한**: `crypto.randomBytes(32).toString('hex')`(256비트, `appAuthCodes.js:54`) · TTL 60000ms(`ttlMs=60*1000`) · `consume()`이 형식 검사 후 **맞든 틀리든 즉시 `codes.delete(code)`**(`appAuthCodes.js:63-69`, 재사용 방지) · `issue()`가 `sweep()`(만료분 청소) 후 `maxEntries=500` 초과 시 가장 오래된 항목부터 evict(`appAuthCodes.js:39-57`) — 무제한 메모리 증가 불가능. 정리 로직이 issue() 시점에만 도는 구조이지만 500건 상한이 있어 sweep 을 안 타는 경로에서도 메모리 증가는 유계.
- **`/api/auth/app-exchange`**(`auth.js:105-117`): 형식 오류(정규식 `/^[0-9a-f]{64}$/` 불일치) → 400. 위조/재사용/만료 → 401(내부적으로 unknown/expired 를 구분해 계산하지만 응답 메시지는 동일 401로 통일 — 코드 존재 여부를 외부에 흘리지 않는 설계, 적절함). 성공 시 `ok(res,{token})`(표준 응답 형식) + Cache-Control no-store.
- **로그에 코드·토큰 원문 없음**: 신규 3파일(`appAuthCodes.js`·`appOAuthCallback.js`·`auth.js`)의 모든 `console.log/warn` 문을 grep 으로 전수 확인 — 상태 문자열만 찍고 code/token 변수를 문자열 보간한 곳 0건.
- **fallback HTML**(`appOAuthCallback.js:53-68,115-119`): `escapeHtml()` 이 `&<>"'` 5종 이스케이프, href 에만 사용(딥링크 문자열 전체) — 표시 문구는 고정 한국어 텍스트라 사용자 입력 반영 없음. `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` 로 스크립트 실행 자체를 차단. 토큰은 애초에 딥링크에 실리지 않고(코드만) `msg` 도 100자로 절단되므로 페이지에 토큰이 노출될 경로가 없음.
- **dev-noted 리스크 평가**: (b) 커스텀 스킴 가로채기 — 위 issues[0] MEDIUM 으로 기록, 이번 범위 보류 동의. (c) 10분 쿠키가 이후 같은 폰 웹 로그인을 앱으로 끌고 가는 문제 — 콜백에서 쿠키를 성공·실패 관계없이 즉시 삭제하므로 "1회"로 제한되어 있고, 이는 계정 탈취가 아니라 같은 사용자 본인의 웹 로그인이 앱 스킴으로 리다이렉트되는 UX 성격의 엣지케이스 — 별도 수정 없이 현행 유지로 충분하다고 판단(추가 비용 대비 실익 낮음).

### 2. 공유 패키지·SPA 폴백 무수정 — 증거
- `git diff -- backend/src/index.js` 로 SPA 폴백 정규식 라인(`app.get(/^(?!\/api\/).*/, ...)`, `index.js:61-66`)이 diff 에 전혀 나타나지 않음을 확인 — 앞에 새 줄만 추가됨.
- `@workspace/auth-oauth` 는 이 저장소 밖 `shared/auth-oauth`(심볼릭 링크) — `find . -newer CLAUDE.md` 로 해당 디렉토리 안에 이번 세션 기간 중 변경된 파일이 0건임을 확인, 소스도 직접 열람(`adapters/express.js`)해 `router.use('/', oauthRouter)`(`auth.js:128`)로 원본 그대로 마운트됨을 확인.

### 3. 웹 브리지
- `grep -rn "@capacitor" web/src/` → 소스에 **import 0건**, 주석 3건(설명문)뿐. 배포 번들(`index-D7bxEBCG.js`) grep 도 `window.Capacitor` 참조 1건만(`function(){return typeof window>"u"?null:window.Capacitor||null}` — `getBridge()`의 압축형) — `@capacitor/*` 임포트가 번들에 실제로 들어가지 않았음을 산출물 레벨에서 확인.
- 딥링크 파싱 함정(`bridge.js:75-87`): `new URL('bjjapp://auth/callback?code=…')` 에서 host=`auth`, pathname=`/callback` 이 되는 WHATWG 특수스킴 미해당 케이스를 정확히 반영해 `url.host !== 'auth'` 와 `url.pathname !== '/callback'` 을 분리 검사 — TheMeal 에서 겪은 실패 패턴을 재현하지 않음.
- 콜드스타트 dedupe(`appLogin.js:69-84`): 메모리 `Set` + `sessionStorage`(최근 5개, `HANDLED_MAX`) 이중 방어 — 새로고침을 넘나드는 중복까지 처리.
- 뒤로가기(`backStack.js`): 전역 스택 + `canGoBack` 우선 판정(`history.length` 는 값이 없을 때만 폴백) — `history.length` 단독 사용 시 앱이 영원히 안 꺼지는 문제를 정확히 피함. `useBackHandler.js` 는 `enabled`(boolean) 를 effect 의존성으로 써서 매 렌더 재등록을 막았고, 언마운트 시 `pushBackHandler` 가 돌려준 splice 클로저로 정확히 자기 항목만 제거 — Modal·MasterPanel·MasterListPanel·SparFeedbackCard 4곳에 적용된 사용 패턴을 모두 읽고 재등록/중복 push 리스크 없음을 확인.
- 안전영역 pad딩 범위: `Layout.jsx:68` `className="app-shell"`, `MasterPanel.jsx:205` `bjjm-panel`, `MasterListPanel.jsx:251` `bjjm-list` 클래스명이 `app.css`의 `[data-native] .app-shell`/`.bjjm-panel`/`.bjjm-list` 셀렉터와 정확히 일치 — 스크롤 컨테이너가 아닌 셸에 padding-top 을 준 설계가 실제 DOM 구조와 맞음.

### 4. download.js / saveToDevice
- `@capacitor/file-transfer@1.0.12`·`@capacitor/filesystem@7.1.8` 버전 선택 근거(peerDependencies `core>=7` vs 2.x 의 `>=8`)는 `mobile/package.json` 의 실제 고정 버전과 일치. 네이티브 `downloadFile` 이 HttpURLConnection 스트림을 파일로 직접 쓰는 방식이라는 주장은 npm 패키지 소스 역어셈블에 의존하므로 저는 재검증하지 않았으나(시간상 최상위 신뢰), 최소한 `saveToDevice()`(`bridge.js:236-293`) 쪽 로직 — WebView 메모리에 base64 로 올리는 코드 경로가 전혀 없고 `downloadFile({url, path, progress})` 하나만 호출 — 은 코드상 스트리밍 가정과 모순되지 않음을 확인.
- 파일명 정리(`sanitizeFileName`, `bridge.js:198-205`): 한글·영문·숫자·`.`·`-`·`_` 외 전부 `_` 치환, 연속 `_` 압축, 선행 `.`/`_` 제거, 80자 제한 — `+`·`%` 도 이 화이트리스트에 없어 제거됨(경로 traversal 문자 `/`·`..` 도 화이트리스트 밖이라 제거). `mutants-web-leader.log` M7 이 이 로직 제거를 실제로 잡아냄을 확인(재실행 로그 직접 열람).
- 에러 처리: `downloadFile()`(`utils/download.js:41-62`) 이 성공/실패 모두 `notify` 콜백(토스트) 호출, `notify` 없으면 `window.alert` 폴백 — 조용한 실패 없음. `NativeAppHost.jsx`·`VideoPlayer.jsx`·`ClipDetailModal.jsx` 3개 호출부 모두 `showToast` 를 notify 로 넘기는 것을 확인.
- 웹 폴백: `isNativeApp()` false 면 기존 `<a download>` 클릭 방식 그대로(`clickAnchor`) — `VideoPlayer.jsx`/`ClipDetailModal.jsx` diff 에서 동작 분기가 `isNativeApp()` 하나로만 갈리는 것을 확인.
- `ClipsPage.jsx:482-533`(계약에 명시된 교체 지점) 을 실제로 교체하지 않은 이유 — `grep -rn "_ClipDetail_REMOVED" web/src/` 로 해당 함수가 어디서도 호출되지 않는 죽은 코드임을 직접 확인, dev-039 결과 [00:22] 참고 8 의 주장과 일치. 실제 배포 화면(VideoPlayer·ClipDetailModal)은 정상 교체됨.

### 5. 안드로이드 프로젝트
- `AndroidManifest.xml` 직접 열람 + APK 를 aapt2 로 독립 재검사(Leader 재실행과 별도로 제가 직접 실행): `aapt2 dump badging` → `package: com.miraclepenguin.bjj … targetSdkVersion:'35'`, `uses-permission INTERNET / READ·WRITE_EXTERNAL_STORAGE maxSdkVersion='29'` — dev·Leader 수치와 정확히 일치. `aapt2 dump xmltree --file AndroidManifest.xml` → `launchMode=2`(singleTask), intent-filter `scheme="bjjapp" host="auth"` 확인.
- `apksigner verify --print-certs`(제가 직접 실행) → `Verifies` true, v1/v2 true, SHA-256 `a4c23dca02f56db088b93a310913ffc639ced8a915ee4be3588abf07d9da9e47` — dev 보고와 완전 일치. META-INF 라이브러리 버전 파일 미서명 경고는 AGP 표준 산출물(디버그 사이드로드 APK 의 정상 특성)이라 문제 아님.
- `unzip -p assets/capacitor.config.json` 재실행 결과 dev 보고와 완전 일치(appId/appName/webDir/server 블록).
- `.gitignore` 커버리지: `git status --porcelain -uall` 전체를 직접 훑어 `mobile/android/app/build/`·`mobile/android/.gradle/`·`local.properties`·`*.keystore`·`*.jks` 중 어느 것도 untracked/staged 목록에 나타나지 않음을 확인 — 실제로 걸러지고 있음(패턴만 있고 안 걸러지는 거짓 안전 아님).
- `build.gradle`·intent-filter·`sync-local.sh`·`build-apk.sh` 전체 열람: gradle 출력이 전부 `> $LOG_DIR/*.log 2>&1` 로만 가고 파이프(`| head` 등) 없음, `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64` 명시, release 서명 설정 없음(디버그 키스토어만 사용) — 계약대로.

### 6. 기존 웹 기능 회귀
- `OAuthButtons.jsx`: `isNativeApp()` false 경로는 `window.location.href = '/api/auth/${provider}'` 그대로(diff 상 분기 추가만, 기존 줄 보존).
- `AuthContext.jsx`: `login()` 반환값을 boolean 으로 바꿨지만 반환값을 쓰지 않던 기존 호출부(LoginPage 등) 동작에 영향 없음 — 순수 확장.
- `VideoPlayer.jsx`/`ClipDetailModal.jsx`: 다운로드 버튼은 웹에서 `isNativeApp()` false 시 `onClick` 핸들러가 즉시 return 해 기존 `<a href download>` 기본 동작이 그대로 실행됨.
- Leader 의 e2e 헤드리스 재실행(37/37, WEB 스위트 포함: `/api/auth/google` 302, `/oauth/callback?token=` 웹 착지, 캡처 다운로드 `<a download>`, Escape 모달 닫힘)에서도 회귀 없음이 별도로 확인됨 — 저도 코드 레벨에서 같은 결론.

### 실행하지 않은 것 (명시)
- 백엔드 단위·웹 단위·mutation·실서버 통합·e2e 스크립트를 제가 직접 재실행하지는 않았다 — 대신 (1) Leader 가 독립적으로 `run-all.sh leader` 를 재실행해 전 단계 rc=0 을 받은 로그(`harness/*-leader.log`, `apk-checks-leader.log`, `baseline-leader-*.txt`)를 직접 열람했고, (2) `unit-web.mjs`가 실제 파일을 `readFileSync`/`import` 하는 구조임을 소스로 확인했으며, (3) `mutants-web-leader.log` 를 직접 읽어 M1~M7 7종 전부가 재실행에서도 그대로 fail(검출)로 나온 것을 확인했다. 이 조합을 코드 감사 + 산출물 직접 재검사(aapt2·apksigner·unzip·grep·node --check)와 함께 PASS 근거로 삼았다.
- 실제 안드로이드 기기·에뮬레이터 실행, Google 실제 로그인 동의 화면은 실행하지 않음(dev-039 도 동일 — 세션 내 실행 불가 항목).
- DB 에 대해서는 어떤 쓰기·베이스라인 재측정도 하지 않음(사용자 지시 — Leader 하네스가 test-user-2 데이터를 만드는 중이라 병행 DB 점검 금지).

## Leader 실행 검증 (2026-09-14 00:24:40~00:26:54)
`bash …/task-039-20260913-235046/harness/run-all.sh leader`(TTL 61초 실대기 포함) → **RUN-ALL rc=0**. 로그 mtime 전부 실행 구간 안.
| 단계 | 결과 |
|---|---|
| backend unit | 13 pass / 0 fail |
| web unit(실제 파일) | 28 / 0 |
| web mutants | 7종 전부 검출(M1 host 검사 제거 ~ M7 파일명 정리 제거) |
| backend 실서버 | 31 / 0 — `app-exchange 61초 후 → 401(실제로 61초 대기)` 포함 |
| e2e headless(412px, 가짜 Capacitor) | 37 / 0 |
| APK 검사 | package `com.miraclepenguin.bjj` · launchMode singleTask · scheme `bjjapp` host `auth` · background `#ff795548` · v1/v2 서명 검증 |
| 기준선 | start=end |
- APK `~/.node-local/bjj-mobile/android/app/build/outputs/apk/debug/app-debug.apk` 4,622,968B md5 `818f170d3a4da697f378485ea00d63db` = scratchpad 전달본 동일. 서빙 웹 번들 `index-D7bxEBCG.js`. `web/src` 에 `@capacitor/*` import 0(주석 1줄뿐).
- Reviewer 결과 확인 후 APK 를 사용자에게 전달(네이티브 수정이 나오면 재설치를 두 번 시키지 않기 위해).
- [00:36] Reviewer PASS(M1 커스텀 스킴 경쟁 — 개인 앱 범위 보류, L1 `allowBackup=true`) → **L1 반영**: `mobile/android/app/src/main/AndroidManifest.xml` `android:allowBackup="false"`(JWT 가 자동 백업으로 기기 밖에 복사되지 않게) → `mobile/scripts/build-apk.sh` rc=0 → `apk-checks.sh` rc=0, aapt2 `allowBackup=false`·label `BJJ 훈련일지`·scheme `bjjapp`/host `auth`·singleTask, apksigner OK, capacitor.config(server.url 퓨니코드·https·cleartext false·errorPath). 새 APK 4,622,968B md5 `5c0ded1d143fc91e20e4690404d61e51` → `SendUserFile` 로 사용자 전달(`BJJ훈련일지-20260914.apk`).

## 실기기 확인 (사용자)
- [07:31] 🔴 **1차 설치 피드백: 하단 탭바가 안드로이드 내비게이션 버튼(3버튼 바)과 겹침**(스크린샷). 원인: Android 15 edge-to-edge 강제로 WebView 가 시스템 바 밑까지 그려지고, WebView 가 `env(safe-area-inset-bottom)` 을 0 으로 줘 `.nav`(`app.css:47`, `padding-bottom: var(--safe-bottom)`)가 바 밑에 깔림. headless 로는 재현 불가(시스템 바 없음) — A-6 은 상단 24px 바닥값만 다뤘고 하단은 `env` 에 의존했던 계약 공백.
- 수정(Leader 직접): ① `mobile/capacitor.config.ts` `android.adjustMarginsForEdgeToEdge: 'auto'`(Capacitor 7.6.9 `CapacitorWebView.edgeToEdgeHandler` — API 35+ 에서 WebView 에 systemBars·displayCutout 인셋만큼 네이티브 margin) ② `res/values/styles.xml` `AppTheme.NoActionBar` 에 `windowBackground @color/bjj_window_bg`(#0C0D12, 신규 `values/bjj_colors.xml`)·`windowLightStatusBar false`·`windowLightNavigationBar false`(바 뒤 배경·아이콘) ③ `web/src/styles/tokens.css` `[data-native] --native-top: env(safe-area-inset-top, 0px)`(24px 바닥값 제거 — 네이티브 margin 과 이중 여백 방지).
  - 1차 빌드 실패: XML 주석 안 `--`(“--bg”) → `mergeDebugResources` 오류 → 주석 수정 후 rc=0. 교훈: Android XML 주석에 하이픈 두 개 금지.
  - APK 4,580,968B md5 `7498c80345649d401c86afdb16adbfdb`: `capacitor.config.json` `android.adjustMarginsForEdgeToEdge=auto`, 테마 size 6 에 `0x01010054=@color/bjj_window_bg`, color `#ff0c0d12`, `allowBackup=false` 유지, 서명 OK → `SendUserFile`(`BJJ훈련일지-20260914-2.apk`).
  - 웹 배포: CSS `index-BKA9Lb6r.css` 에 `[data-native]{--native-top: env(safe-area-inset-top, 0px)}` 서빙 확인, 아이콘 200 유지.
  - ⚠️ dev 하네스 `e2e-039.cjs` N4·N5·N10 은 옛 기대값(24px)이라 재실행 시 실패한다 — 기대값을 `env` 0px 로 갱신 필요 → **board 백로그로 이관(2026-09-14, 미처리)**.
- [07:47] 사용자 질문 "식단관리는 재빌드 없이 반영했는데 여기는 매번 재설치?" → 답: 원격 URL 방식이라 **화면·기능은 웹 배포만으로 반영**, 재설치는 네이티브(아이콘·권한·플러그인·config·테마·MainActivity) 변경 때만. 이번 탭바 수정은 네이티브 설정을 택해 재설치가 필요했고 **사전 고지를 안 한 것은 Leader 누락** → 앞으로 네이티브 변경은 먼저 고지.
- [07:47] 🔴 **2차 피드백: 앱에서 참고영상 추가 → 기술명 검색 시 입력창·검색 목록이 키보드에 가려짐(웹 크롬은 보임). 모든 입력창에 동일 적용 요청.**
  - 원인(코드 확인): Capacitor `CapacitorWebView.edgeToEdgeHandler`(Bridge.create 시 설치)는 margin 을 `systemBars()|displayCutout()` 만으로 계산 — **IME 미포함**. Android 15 edge-to-edge 에서는 `adjustResize` 가 창을 줄이지 않음 → 키보드가 떠도 WebView 높이 불변. 크롬은 자체적으로 보이는 영역을 줄여 문제 없음.
  - 사용자에게 **재설치 필요를 먼저 고지**(웹만으로는 키보드 높이를 알 수 없음) 후 수정:
    ① `mobile/android/app/src/main/java/com/miraclepenguin/bjj/MainActivity.java` — `onCreate` 에서 API 35+ 일 때 WebView 인셋 리스너를 교체: 좌·상·우 = 시스템 바/컷아웃, **하단 = max(내비게이션 바, IME)**. API 34 이하는 손대지 않음(이중 축소 방지).
    ② `AndroidManifest.xml` `.MainActivity` 에 `android:windowSoftInputMode="adjustResize"`(API 34 이하용).
    ③ `web/src/native/NativeAppHost.jsx` 효과 4(앱 전용, 모든 input·textarea·select·contenteditable): WebView 가 키보드로 줄어들면(`innerHeight < 최대높이×0.85`) 포커스된 칸을 `scrollIntoView({block:'center'})` — 그 아래 검색 목록이 보일 자리 확보. 키보드가 열린 채 칸을 옮길 때(`focusin`)도 동일.
  - 검증: APK 빌드 rc=0(4,580,968B md5 `5f6f7d79194a2e3206aae3fc264aa8f7`), aapt2 `windowSoftInputMode=0x10(adjustResize)`·`allowBackup=false`·config `adjustMarginsForEdgeToEdge=auto`, `classes4.dex` 에 `com/miraclepenguin/bjj/MainActivity` + `setOnApplyWindowInsetsListener`. 웹 번들 `index-BSxKT1D9.js` 배포. headless(가짜 Capacitor, user 2 T036 픽스처) `scratchpad/verify-keyboard-center.js` **7/7**: 참고영상 추가 → 기술명 검색 입력(키보드 전 top 570/915) → 뷰포트 470 으로 축소(키보드 모사) → 입력 top 244·center 264(가운데), 결과 `테스트036암바` top 298–325 화면 안. 캡처 `kb-shots/02-after-keyboard.png`(412×470) Leader 열람. 정리 후 CHECKSUM 738744930 동일. 🔴 IME 인셋 자체는 실기기로만 확인 가능.
  - 전달: `BJJ훈련일지-20260914-3.apk`.
- 사용자 이후 스크린샷에서 **하단 탭바가 내비게이션 버튼 위에 정상 배치**됨을 확인(피드백① 해소).
- 🟡 **사용자 확인 대기(키보드·저장·뒤로가기·링크)** — 3차 APK 기준 ① 키보드가 입력창·검색 목록을 가리지 않는지 ② 영상·캡처 저장이 `Download/BJJ` 에 생기고 파일 앱·갤러리에 보이는지 ③ 뒤로가기(모달 닫기 → 이전 화면 → 앱 종료) ④ 인스타·유튜브 링크 외부 이동. 명시적 확인 전이지만 로그인·일반 사용·탭바는 실사용으로 확인돼 task 는 done 으로 닫고, 이상 보고가 오면 새 task 로 처리.

### 실기기 타임라인 요약 (사용자 폰, Android 15 · 3버튼 내비게이션)
| 차수 | APK md5 | 변경 | 결과 |
|---|---|---|---|
| 1 | `5c0ded1d…` | Reviewer L1 반영 `allowBackup=false` | 설치·Google 로그인·사용 OK / 🔴 하단 탭바가 내비게이션 버튼과 겹침 |
| 2 | `7498c803…` | `adjustMarginsForEdgeToEdge:'auto'` · 창 배경 `#0C0D12`·밝은 바 아이콘 · 웹 `--native-top: env(safe-area-inset-top,0px)`(24px 바닥값 제거) | 탭바 정상(스크린샷 확인) / 🔴 키보드가 입력창·검색 목록을 가림 |
| 3 | `5f6f7d79…` | `MainActivity` 인셋 리스너(API 35+, 하단 = max(시스템 바, IME)) · manifest `adjustResize` · 웹 `NativeAppHost` 효과 4(포커스 칸 가운데 정렬) | headless 7/7, 실기기 확인 대기 |

### 업데이트 규칙 (사용자 질문에 대한 답, 이후 원칙)
- **웹(화면·기능) 변경 = 웹 배포만, 재설치 불필요** — 앱이 운영 URL 을 원격으로 불러오기 때문.
- **네이티브 변경 = APK 재빌드 + 덮어쓰기 설치** — 아이콘·권한·플러그인·`capacitor.config`·테마(styles.xml)·`MainActivity`·`AndroidManifest`.
- 🔴 Leader 는 네이티브 변경을 **착수 전에 "재설치 필요"를 먼저 고지**한다(2차 때 누락 → 3차부터 고지).

### 곁가지 정리
- Authelia 완전 제거(운영 nginx·컨테이너·fail2ban + HOME-SERVER_CONFIG 저장소 사본) 완료.
- 백로그로 남김: `api.미라클펭귄.com` 504(vhost upstream 낡음, HOME-SERVER) · BJJ `backend/.env` `AI_API_BASE` `:8001` 죽은 포트 · `e2e-039.cjs` 24px 기대값 갱신.
- 같은 날 별건 웹 수정(재설치 불필요): 하단 토글 탭 → [[task-040-toggle-tab-front-first]].
- 운영 절차·함정 정리: [[android-apk-build]].

## 최종 요약
**BJJ 훈련일지를 휴대폰에 앱(APK)으로 설치해 쓸 수 있습니다.** (배포·푸시 완료)

- **앱이 하는 일**: 홈 화면의 브라운 `BJJ` 아이콘으로 열리고, 안에서는 웹과 똑같은 BJJ 훈련일지가 뜹니다(앱이 운영 사이트를 불러오는 방식).
- **로그인**: Google/GitHub 버튼을 누르면 외부 브라우저 탭에서 로그인하고 자동으로 앱으로 돌아와 로그인됩니다(Google 이 앱 내부 로그인 화면을 막기 때문).
- **저장**: 영상·캡처 다운로드 버튼을 누르면 폰의 `Download/BJJ` 폴더에 바로 저장되고 완료/실패 알림이 뜹니다.
- **화면**: 상단 상태바·하단 내비게이션 버튼과 겹치지 않고, 뒤로가기는 열린 창 닫기 → 이전 화면 → 앱 종료 순서입니다.
- **업데이트 방법**
  - 화면·기능 수정은 서버에 배포만 하면 앱에도 바로 반영됩니다(재설치 필요 없음). 앱을 완전히 껐다 켜면 새 화면이 뜹니다.
  - 아이콘·권한·키보드 처리 같은 앱 자체 설정이 바뀔 때만 새 APK 를 받아 덮어쓰기 설치합니다. 그런 경우엔 작업 전에 먼저 알려드립니다.
- **확인 부탁(아직 확인 전)**: 3차 APK 에서 ① 키보드가 입력창을 가리지 않는지 ② 저장한 영상·캡처가 파일 앱/갤러리에 보이는지 ③ 뒤로가기 동작 ④ 인스타·유튜브 링크가 외부로 열리는지.
