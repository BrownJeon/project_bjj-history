---
name: app-icon-and-apk-procedure
aliases: ["작업절차서 앱 아이콘", "작업절차서 APK", "Authelia 제거"]
tags:
  - type/runbook
  - domain/mobile
  - domain/infra
related_tasks:
  - "[[task-038-app-icon]]"
  - "[[task-039-android-apk]]"
created: 2026-09-13
---

> 사용자 승인된 작업절차서 원본(2026-09-13). 실행 중 확정된 내용·함정은 task-038/039 이력서와 완료 후 android-apk-build.md 에 반영.

# 작업절차서 — ① 앱 아이콘(task-038) → ② Android APK 앱 설치(task-039) + Authelia 완전 제거

## Context
BJJ 훈련일지는 지금 모바일 브라우저로만 쓴다. 식단관리(TheMeal)처럼 **APK 로 설치하는 앱**으로 만들고, 앱에 들어갈 **진짜 아이콘**을 만든다.
실측 현황:
- 아이콘: `web/public/favicon.svg`(초록 사각형 "BJJ" 글자)뿐. `index.html` 이 가리키는 `apple-touch-icon.png`·`og-image.png` 는 파일이 없어 HTML 이 응답됨. manifest `background_color #ffffff`(다크 테마 불일치).
- 앱화 준비도: HTTPS 도메인 `bjj.xn--lh0b87pnudm10a4vd.com`, API 상대경로(`web/src/api/client.js:4`), 토큰은 `localStorage['bjj_token']`(쿠키 아님) → 원격 URL 로딩 방식에 적합.
- 🔴 실사용자(user 3)는 **Google 로그인 전용**(비밀번호 없음) → Google 은 WebView 로그인을 차단 → **외부 브라우저(Custom Tab) 로그인 + 앱 딥링크 복귀** 필수.
- 빌드 도구 준비됨: Android SDK `~/.node-local/android-sdk`(platform 35·build-tools 35), **JDK 21 설치됨** `/usr/lib/jvm/java-21-openjdk-amd64`(버전만 `JAVA_HOME` 으로 지정), 디버그 키 `~/.android/debug.keystore`.
- Authelia: 운영 nginx 에서 Authelia 를 거치는 vhost 는 **0개**(스니펫만 존재). 남은 것은 `auth.미라클펭귄.com` vhost·도커 컨테이너 `authelia`(실행 중, `/opt/authelia`)·fail2ban `[authelia]` jail. 인증서는 전 서비스 공용(`/etc/letsencrypt/live/xn--lh0b87pnudm10a4vd.com`)이라 **건드리지 않는다**. `HOME-SERVER_CONFIG`(git 아님) 사본 vhost 8개에 Authelia include 가 남아 있음(드리프트).
- 참고 원본: TheMeal `capacitor.config.ts`, `scripts/gen-app-icons.mjs`, `scripts/sync-local.sh`, `src/lib/native/bridge.ts`, `agent-vault/10-Flow/tasks/task-012-phase7-share-app.md`·`task-013-app-icon.md`.

## 사용자 결정 (2026-09-13)
1. 순서: **아이콘 먼저 → APK**.
2. 앱 이름: **`BJJ 훈련일지`**.
3. 영상·캡처 저장: **앱 안에서 폰 저장소에 직접 저장**.
4. **아이콘 확정 = T1 "BJJ 워드마크" 브라운안**(시안 4 → D 수정 → 10안 → T1 배경색 비교 끝에 선택):
   - 배경 `#795548`(브라운), 글자 `BJJ` 크림 `#F3E9DC`, 아래 **블랙 띠** `#111111` — 띠 폭 = 글자 폭, 두께를 키움, 띠 오른쪽에 크림 랭크바 + 검정 줄 2개.
   - 깔끔하고 화려하지 않게.
5. **Authelia 완전 제거**(앞으로도 사용 안 함).
6. **한 번에 끝까지 진행**, 사용자 조작이 필요할 때만 요청. 사전 조작은 시작 전에 안내.

## 🔴 긴급 — A 실행 결과 nginx 설정 테스트 실패 (2026-09-13 23:26)
- Leader 실측 오류: `grep -r` 이 `sites-enabled` 심볼릭 링크를 따라가지 않아 **Authelia 를 쓰던 운영 vhost 3개를 놓쳤다** — `api`(home-m4-api, 192.168.219.163:8000) · `git`(Gitea, 192.168.219.154:3000) · `admin`(Portainer :9000 · Grafana :3300). 교훈: nginx 설정 검색은 **`grep -R`**.
- 현재: snippet 삭제로 `nginx -t` 실패 → reload 가 실행되지 않아 **기존 설정으로 서비스 유지 중**. 단 nginx 가 다시 읽히는 순간(재부팅·인증서 갱신 등) **전 사이트 다운**. 외부에서 `git`·`api` 는 500(Authelia 없어서 차단), 나머지 사이트 정상. 프로젝트들은 git·AI API 를 내부 IP 로 쓰므로 push·배포·AI 호출은 영향 없음. 백업 `~/authelia-backup-20260913.tgz` 정상.
- 사용자 결정: **admin → 사이트 비활성화**, **git·api → Authelia 줄만 제거하고 자체 인증(Gitea 로그인·API 키)으로 공개**.
- **A2. 즉시 실행할 복구 명령(sudo)** — 세 파일 모두 `sites-available` 로 가는 심볼릭 링크라 링크를 따라 편집/링크만 제거:
```bash
sudo sed -i --follow-symlinks '\#include /etc/nginx/snippets/authelia-auth.conf;#d' /etc/nginx/sites-enabled/git.미라클펭귄.com.conf /etc/nginx/sites-enabled/api.미라클펭귄.com.conf
sudo rm /etc/nginx/sites-enabled/admin.미라클펭귄.com.conf
sudo grep -R -n -i "authelia" /etc/nginx/ ; sudo nginx -t && sudo systemctl reload nginx
```
- 확인(Leader): `grep -R authelia /etc/nginx` 0건, `nginx -t` OK, `git`·`api` 200/302(자체 로그인), `admin` 은 기본 서버로, 나머지 사이트 전부 이전과 동일 코드.
- ✅ **A2 실행·확인 완료(23:31)**: `nginx -t` 성공·reload, nginx·fail2ban active, 활성 vhost·snippet 의 authelia 참조 0, authelia 컨테이너 0·9091 리슨 0. `git` 200, bjj·app·climb·coin 200, meal·voice·stock·career·thinker·odinue 307(기존과 동일), `admin` 000(비활성 → catchall). 남은 참조는 비활성 `sites-available/admin…conf:9` 1줄(무해, Phase 0 정리 대상).
- ⚠️ **별건(Authelia 무관, 기존 문제)**: `api.미라클펭귄.com` 은 504 — upstream `192.168.219.163:8000` 이 이 서버에서 직접 접속도 안 됨(timeout). 프로젝트들은 AI API 를 `192.168.219.100:8001` 로 쓰고 있어 **vhost 의 upstream 주소가 낡은 것**으로 보인다. 이전엔 Authelia 에서 먼저 막혀 드러나지 않았음 → HOME-SERVER 백로그로 기록, 이번 범위에서 수정하지 않음.

## 시작 전 사용자 사전 조치 (이것만 먼저 해 주시면 끝까지 자동 진행)
**A. Authelia 제거 — ✅ 사용자 실행 완료(23:26), 위 A2 복구 필요.** 실행했던 명령(기록용):
```bash
sudo tar czf ~/authelia-backup-$(date +%Y%m%d).tgz /opt/authelia /etc/nginx/sites-available/auth.미라클펭귄.com.conf /etc/nginx/snippets/authelia-auth.conf /etc/fail2ban/jail.local /etc/fail2ban/filter.d/authelia.conf
sudo docker rm -f authelia && sudo docker network rm authelia_default && sudo docker image rm authelia/authelia:latest
sudo rm -f /etc/nginx/sites-enabled/auth.미라클펭귄.com.conf /etc/nginx/sites-available/auth.미라클펭귄.com.conf /etc/nginx/snippets/authelia-auth.conf
sudo nginx -t && sudo systemctl reload nginx
sudo sed -n '/^\[authelia\]/,$p' /etc/fail2ban/jail.local
sudo sed -i '/^\[authelia\]/,$d' /etc/fail2ban/jail.local && sudo rm -f /etc/fail2ban/filter.d/authelia.conf
sudo fail2ban-client -t && sudo systemctl restart fail2ban
sudo rm -rf /opt/authelia
```
- 5번째 줄은 지울 구간 미리보기(`[authelia]` 가 파일 마지막 섹션 — 36~42줄). 인증서·DNS 는 공용이라 그대로 둔다.

**B. 휴대폰 준비**: 설정 → 앱 설치 권한에서 APK 를 받을 앱(카카오톡/파일/Chrome 등)에 "출처를 알 수 없는 앱 설치" 허용.

**C. 그 외 없음**: Google OAuth 콘솔 변경 불필요(리다이렉트 URI 그대로), JDK·SDK 설치 불필요.

→ 작업 중 사용자 요청은 **마지막 1회**뿐: APK 설치 + 실기기 체크리스트 확인. 이상 없으면 커밋·푸시까지 자동 진행.

## 공통 원칙
- 팀 흐름: Leader(task 이력서·계약) → Developer → Reviewer → **Leader 직접 실행 검증**(QA 에이전트는 허위 보고 3회로 사용 안 함) → 사용자 실기기 확인 → 커밋·푸시.
- **NFS noexec**: npm·Capacitor CLI·gradle·sharp·폰트 변환은 ext4 미러에서. 소스 진실은 NFS, 산출물(build/.gradle/local.properties)은 미러에만.
- 웹 코드는 `@capacitor/*` 를 import 하지 않음 — `window.Capacitor` 전역만 읽는 브리지(웹에서는 no-op). 웹·앱 한 번들.
- 테스트 데이터는 user 2 픽스처만, user 3 무쓰기, 기준선 시작=끝.
- 기록: 이 절차서를 `agent-vault/30-Knowledge/runbooks/app-icon.md`·`android-apk-build.md` 로 저장, task-038·039 이력서, board·ACTIVE 갱신.

---

## 절차서 ① 앱 아이콘 (task-038)

### Phase 1 — 글자를 path 로 고정
- 기기 폰트에 의존하지 않도록 `BJJ` 를 **SVG path 로 변환해 스크립트에 상수로 박는다**. 시안은 Arial Black 계열 굵기 → 이 머신에 있는 가장 가까운 무게(`/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc` 의 라틴 글리프 등, OFL)에서 ext4 임시 도구 디렉터리에 `opentype.js` 를 받아 변환(프로젝트 의존성 아님). 시안과 나란히 렌더해 가장 가까운 폰트 선택.

### Phase 2 — 생성기 `web/scripts/gen-app-icons.mjs`
- TheMeal `scripts/gen-app-icons.mjs` 구조 재사용: 상단 상수 `BG #795548`·`TEXT #F3E9DC`·`BELT #111111`·`GLYPH_BJJ`(path)·띠/랭크바 도형이 **디자인의 단일 진실**. 산출물은 손대지 않고 재실행.
- sharp 는 설치하지 않고 `createRequire('/home/brownjeon/.node-local/themeal/package.json')('sharp')` 로 빌림.
- 배치: 글자+띠 묶음을 중앙 정렬. Android adaptive 는 108 그리드·안전원 r33 → 묶음 반대각선 ≤ 31 이 되도록 축소(시안 비율 유지). 웹 아이콘은 시안과 같은 비율(스퀴르클 안 약 66%).
- 산출(웹): `web/public/icons/icon-192.png`·`icon-512.png`(스퀴르클) · `icon-maskable-512.png`(풀블리드 브라운) · `web/public/apple-touch-icon.png`(180, 불투명) · `web/public/favicon.ico`(16/32/48) · `web/public/favicon.svg` 교체 · `web/public/og-image.png`(1200×630: 브라운 배경 + 아이콘 + "BJJ 훈련일지" path) · `docs/brand/app-icon.svg`(1080 기준본).
- 산출(Android, `--android`; task-039 에서 `mobile/android` 생성 후 실행): `drawable/ic_bjj_foreground.xml`·`ic_bjj_monochrome.xml`(🔴 템플릿 `drawable-v24/ic_launcher_foreground.xml` 가 덮으므로 이름 분리), `mipmap-anydpi-v26/ic_launcher{,_round}.xml`(background `#795548` · foreground · monochrome), `values/ic_launcher_background.xml`, `mipmap-*dpi/ic_launcher{,_round,_foreground}.png`, `drawable*/splash.png` 단색 `#0C0D12`(앱 다크 배경으로 자연스럽게 이어짐, 로고 비트맵 금지).
- monochrome(테마 아이콘): 글자·띠를 흰 실루엣으로, 랭크바는 뚫어 형태가 읽히게.

### Phase 3 — 웹 반영
- `web/public/manifest.webmanifest`: icons 192·512·maskable 등록, `background_color #0C0D12`. `theme_color` 는 앱 UI 기준 `#1D9E75` 유지.
- `web/index.html`: favicon.ico/svg·apple-touch-icon·og:image 링크 정합.
- 🔴 빌드 절차 보완: CLAUDE.md 는 `web/src`·`index.html` 만 옮김 → **`web/public/` 도 ext4 work 로 rsync** 하도록 CLAUDE.md 빌드 섹션 수정 후 빌드·배포.

### Phase 4 — 검증(Leader 실행)
- `curl -sI` 로 `apple-touch-icon.png`·`og-image.png`·`icons/icon-512.png`·`favicon.ico` 가 `image/*`(지금 `text/html`).
- sharp metadata: 크기·알파(apple-touch 알파 없음). 스크립트 2회 실행 md5 동일.
- 합성 미리보기(스퀴르클·원형·단색·48/24/16px + 시안 원본 대비) headless 캡처 → Leader 열람. 완성 이미지는 사용자에게 `SendUserFile` 로 공유(확인 대기 없이 진행).

---

## 절차서 ② Android APK (task-039)

### Phase 0 — 사전 점검·Authelia 정리(Leader)
- 사용자 사전 조치 A 결과 확인: `docker ps -a | grep -c authelia` = 0, `ss -ltn | grep 9091` 없음, `/etc/nginx/sites-enabled` 에 auth 없음, `curl -sI https://bjj…` 200, 다른 vhost 전부 정상(`curl -sI` 일괄), fail2ban active.
- A2 복구 결과 확인(위 긴급 절 체크리스트) — 끝나기 전에는 다음 단계로 가지 않는다.
- `HOME-SERVER_CONFIG` 저장소 정리(단독 작업): `servers/linux/authelia/`·`deploy-authelia.sh`·`nginx/snippets/authelia-auth.conf`·`fail2ban/filter.d/authelia.conf`·`nginx/sites-available/auth.미라클펭귄.com.conf` 삭제, 나머지 사본 vhost(bjj·app·git·stock·compute·coin·admin·climb)의 `include …authelia-auth.conf` 줄 제거, `admin` 사본은 상단에 "비활성화(2026-09-13, sites-enabled 링크 제거)" 표기하고 `deploy-nginx.sh` 가 admin 을 다시 활성화하지 않게 수정, `deploy-nginx.sh`·`deploy-security.sh`·README·CLAUDE.md·docs(security-layers·architecture·network-design·port-map·phases) 의 Authelia 언급을 "제거됨(2026-09-13)"으로 정리. 운영 파일과 저장소 사본의 include 가 일치하는지 diff.
- 툴체인: `$JAVA_HOME/bin/java -version` = 21, SDK `platforms;android-35`·`build-tools;35.0.0`, `keytool -list -v -keystore ~/.android/debug.keystore -storepass android` 만료일.

### Phase 1 — Capacitor 골격(Developer)
- 위치 **`bjj-trainning/mobile/`**(`package.json`, `capacitor.config.ts`, `app-shell/index.html`, `android/`, `scripts/sync-local.sh`), 미러 **`~/.node-local/bjj-mobile/`**.
- 미러에서 설치: `@capacitor/core@^7 app browser filesystem status-bar` + dev `cli android`(+ 대용량 저장용 `@capacitor/file-transfer` — Phase 3-6). `package.json`·lock 은 NFS 로 복사.
- `capacitor.config.ts`: `appId 'com.miraclepenguin.bjj'`, `appName 'BJJ 훈련일지'`, `webDir 'app-shell'`, `server: { url: 'https://bjj.xn--lh0b87pnudm10a4vd.com', androidScheme: 'https', cleartext: false }`(🔴 퓨니코드).
- `npx cap add android` → 미러 `android/local.properties`(`sdk.dir`) → protect 필터 rsync 로 NFS 반영(TheMeal `sync-local.sh:34-43` 방식). `.gitignore`: `mobile/node_modules`, `mobile/android/{build,app/build,.gradle,local.properties}`, `*.keystore`, `*.jks`.

### Phase 2 — 네이티브 설정
- `AndroidManifest.xml`: `launchMode="singleTask"`, 딥링크 `bjjapp://auth/callback`(VIEW·DEFAULT·BROWSABLE), `INTERNET`, 저장 권한은 3-6 방식에 맞춰 최소(API ≤28 만 `WRITE_EXTERNAL_STORAGE maxSdkVersion=28`).
- `strings.xml` 앱 라벨 `BJJ 훈련일지`, `gen-app-icons.mjs --android` 실행.

### Phase 3 — 웹 코드(Developer, 한 번들)
3-1 **브리지** `web/src/native/bridge.js`(TheMeal `bridge.ts` 이식): `isNativeApp`, `openExternal/closeExternal`, `onAuthDeepLink`(`appUrlOpen` + 콜드스타트 `getLaunchUrl`, 커스텀 스킴 host=`auth` 파싱 함정), `onBackButton`, `saveToDevice`. 전역 없으면 no-op.

3-2 **Google/GitHub 로그인(앱)** — 공유 패키지 `@workspace/auth-oauth`(5개 프로젝트 공용) **무수정**, 앱 스킴 이동은 **서버 302 체인**(Custom Tab 은 사용자 탭 없는 JS 스킴 이동을 막을 수 있음):
  1. 앱의 OAuth 버튼(`web/src/components/OAuthButtons.jsx:40`) → `openExternal('https://bjj…/api/auth/app-start?provider=google')`.
  2. `GET /api/auth/app-start`: 쿠키 `bjj_app_login=1`(httpOnly·Secure·SameSite=Lax·10분) → 기존 `/api/auth/{provider}` 로 302.
  3. SPA 폴백보다 앞(`backend/src/index.js:57` 앞)에 `GET /oauth/callback` 핸들러: 쿠키 + 유효 토큰 → 60초·1회용 코드 발급, 쿠키 삭제, `302 bjjapp://auth/callback?code=…` / 쿠키 없음 → `next()`(웹 흐름 그대로).
  4. 앱 딥링크 리스너 → `closeExternal()` → `POST /api/auth/app-exchange {code}` → JWT → `localStorage['bjj_token']` → 홈. 중복 교환 방지.
  - 백엔드 `backend/src/routes/auth.js`(app-start·app-exchange) + `index.js` 분기, 코드 저장소 메모리 Map+TTL. 딥링크에 JWT 금지. 302 차단 시 "앱으로 돌아가기" 버튼 페이지 폴백.

3-3 **뒤로가기**: 모달 열림 → 닫기 / 아니면 `history.back()` / 루트면 종료.
3-4 **상태바**(targetSdk 35 edge-to-edge): 앱이면 `<html data-native>` → `Layout.jsx` 셸 상단 `padding-top: max(env(safe-area-inset-top), 24px)`.
3-5 **링크**: 외부 도메인 `_blank`(인스타·유튜브)는 기본 동작(시스템 브라우저). 같은 도메인 `/uploads/*.mp4` 는 앱에서 저장 흐름으로.
3-6 **앱 안 직접 저장**: 공용 헬퍼 `web/src/utils/download.js` `downloadFile(url, filename)` — 앱이면 `saveToDevice`(스트리밍 다운로드 `@capacitor/file-transfer`, 폰 `Download/BJJ` 폴더 → 파일 앱·갤러리 노출, 진행률·완료/실패 toast, 조용한 실패 금지), 웹이면 기존 `<a download>`. 교체: `web/src/components/VideoPlayer.jsx:45-62`, `web/src/pages/ClipsPage.jsx:482-533`(캡처 여러 장 순차), `web/src/components/ClipDetailModal.jsx:155-163`. `/uploads` 정적 파일 인증 여부 확인 후 필요 시 헤더 첨부. 🔴 Capacitor 7 file-transfer API·Android 15 공개 폴더 노출은 문서·플러그인 소스로 먼저 확인하고, 불확실하면 실기기 체크리스트 5번에서 판정해 1회 수정·재빌드.

### Phase 4 — 빌드(미러, 스크립트화)
```bash
bash /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/mobile/scripts/sync-local.sh
cd ~/.node-local/bjj-mobile && ANDROID_HOME=$HOME/.node-local/android-sdk npx cap sync android
cd ~/.node-local/bjj-mobile/android && JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ANDROID_HOME=$HOME/.node-local/android-sdk ./gradlew assembleDebug > <scratch>/gradle.log 2>&1; echo rc=$?
```
- gradle 출력은 파일로(`| head` 는 SIGPIPE 로 빌드 사망 — TheMeal 사고). 웹 변경분은 CLAUDE.md 웹 빌드로 배포(push 웹훅은 웹을 빌드하지 않음).
- APK 검사: `aapt2 dump badging`(package·label `BJJ 훈련일지`·icon) · `aapt2 dump xmltree … AndroidManifest.xml`(bjjapp·singleTask) · `ic_launcher.xml` 3레이어 · `apksigner verify --print-certs` · `unzip -p app-debug.apk assets/capacitor.config.json`.

### Phase 5 — 검증(Leader 실행)
- 단위: 브리지·download 헬퍼(실제 파일 import). 백엔드: `app-start`(쿠키·302) · `/oauth/callback`(쿠키 있음 → `302 bjjapp://…?code=`, 없음 → SPA HTML) · `app-exchange`(만료·재사용·위조 → 4xx, 정상 → JWT). 웹 회귀: 브라우저에서 앱 경로 no-op, 웹 Google 로그인 그대로, headless 412px `data-native` 모사 상단 여백.
- 기준선 시작=끝, 스크린샷 mtime·md5.

### Phase 6 — 전달·실기기 확인(사용자 요청 1회)
- APK 를 scratchpad 로 복사 → `SendUserFile`(attach) → 사용자 설치.
- 🔴 실기기 체크리스트:
  1. 홈 화면에 브라운 BJJ 아이콘 + `BJJ 훈련일지`
  2. Google 로그인(첫 실행 / 앱 완전 종료 후 재실행 시 로그인 유지)
  3. 상태바가 화면을 가리지 않음, 뒤로가기(모달 닫기 → 이전 → 종료)
  4. 참고영상 상세 +1, 픽미업 카드 탭 정상
  5. 영상 저장·캡처 저장 → 파일 앱/갤러리에 보임, 실패 시 알림
  6. 인스타·유튜브 링크 외부 이동, 음성 파일 업로드 선택창
- 문제 → 웹 수정이면 재설치 없이 반영, 네이티브면 재빌드 후 재전달.

### Phase 7 — 기록·커밋(자동)
- runbook(`android-apk-build.md`: 재빌드·업데이트 규칙·키 백업·함정), CLAUDE.md 에 `mobile/` 구조·빌드 명령·`web/public` rsync, ACTIVE·board.
- 커밋·푸시(`mobile/android` 소스 포함, 빌드 산출물·키 제외). HOME-SERVER_CONFIG 는 git 이 아니므로 파일 정리만.
- 업데이트 규칙: 화면·기능(웹) = 웹 빌드만, 재설치 불필요 / 아이콘·권한·플러그인·config = APK 재빌드 후 덮어쓰기 설치. 디버그 키 분실 시 덮어쓰기 불가 → 백업 경로 기록.

### 리스크와 대응
| 리스크 | 대응 |
|---|---|
| Google 이 WebView 로그인 차단 | Custom Tab + 서버 302 + 1회용 코드 교환 |
| Custom Tab·WebView 저장소 분리 | 앱 로그인 표시는 Custom Tab 쿠키, 토큰은 코드로만 전달 |
| Custom Tab 의 JS 스킴 이동 차단 | 서버 302 체인, 실패 시 버튼 폴백 |
| 공유 OAuth 패키지 수정 시 5개 프로젝트 영향 | bjj 전용 라우트로만 |
| 대용량 영상 저장 시 메모리 | 스트리밍 다운로드(file-transfer) |
| Android 15 edge-to-edge 겹침 | 셸 상단 safe-area + 24px |
| 템플릿 foreground 가 아이콘을 덮음 | `ic_bjj_*` 이름 분리 |
| Authelia 제거가 다른 서비스에 영향 | 🔴 실제로 발생 — 사용처 3개(api·git·admin) 누락(`grep -r` 심볼릭 링크 미추적). A2 로 복구, 이후 설정 검색은 `grep -R`, 전 vhost curl 점검, 공용 인증서 유지 |
| 디버그 키 분실 | 백업 경로 기록 |

## 진행 순서(승인 후)
1. 사용자가 A2 복구 명령 실행 → Leader 가 nginx·전 사이트 상태 확인(Phase 0) → B(휴대폰 설치 허용)는 설치 시점까지 준비.
2. task-038 아이콘(Phase 1~4) → task-039 APK(Phase 0~5) 연속 진행.
3. APK 전달 + 실기기 체크리스트 요청(유일한 중간 요청).
4. 확인 후 기록·커밋·푸시.
