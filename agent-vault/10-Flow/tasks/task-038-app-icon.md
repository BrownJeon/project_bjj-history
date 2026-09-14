---
name: task-038-app-icon
aliases: ["앱 아이콘", "BJJ 워드마크 아이콘", "app icon"]
tags:
  - type/task
  - domain/frontend
  - domain/mobile
  - domain/design
related_tasks:
  - "[[task-039-android-apk]]"
status: done
created: 2026-09-13
updated: 2026-09-14
---

# task-038 — 앱 아이콘 (T1 BJJ 워드마크 · 브라운)

작업절차서: [[app-icon-and-apk-procedure]] "절차서 ① 앱 아이콘" (Phase 1~4). 이 파일은 확정 사양·계약·결과만 담는다.

## 사용자 지시·결정 (2026-09-13)
- "앱 아이콘 디자인하기" → 시안 4개(깔끔·화려하지 않게) → D 수정 요청 → **10개 시안** → **T1 "BJJ 워드마크"** 선택 → "띠를 'BJJ' 문구와 비슷한 크기로 키우고 색만 변경, 배경 블루/퍼플/브라운/블랙 비교, 글씨는 배경에 맞춰, 띠는 블랙" → **브라운 배경 확정**.
- 사용자 지시: "나머지 작업들은 한번에 마지막까지 작업해주고 사용자의 조작이 필요할 경우에만 요청" — 확인 대기 없이 진행.

## 확정 사양 (시안 원본 좌표, 100×100 캔버스)
| 요소 | 값 |
|---|---|
| 배경 | `#795548` 전면. 웹 아이콘 스퀴르클 `rx 23` |
| 글자 | `BJJ`, 색 `#F3E9DC`(크림), 굵기 Arial Black 급(900), 가운데 정렬 기준선 y=55, **글자 폭 66**(x 17→83), 시안 font-size 35 |
| 띠 | `#111111` 사각형 x 17, y 62, w 66(=글자 폭), h 11, rx 3 |
| 랭크바 | 띠 오른쪽 끝에서 20 안쪽: x 63, y 62, w 12, h 11, `#F3E9DC` |
| 랭크바 줄 | `#111111` 두 줄: x 66.5·70.5, w 2.2, h 11 |
| 전체 묶음 | x 17~83, y 약 30~73 (글자 캡하이트 상단 ~30) |

## 계약 I (dev-038)
1. **글자 path 화**: 기기 폰트 의존 제거. ext4 임시 도구 디렉터리(예 `~/.node-local/bjj-tools/`)에 `opentype.js` 설치(프로젝트 의존성 아님) → 이 머신의 가장 무거운 산세리프 라틴 글리프(`/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc` 등, 라이선스 OFL 확인)로 `BJJ` outline 추출 → 글자 폭 66 에 맞게 가로 스케일·기준선 정렬 → 경로 문자열을 생성기 상수로 박는다. **시안(Arial Black 렌더)과 나란히 캡처해 가장 가까운 폰트를 고른 근거를 결과에 기록.** ttc 가 opentype.js 로 안 읽히면 다른 굵은 폰트 또는 폰트 파일 추출 방법을 쓰고 기록.
2. **생성기 `web/scripts/gen-app-icons.mjs`** — TheMeal `/home/brownjeon/NFS/homes/brownjeon/project/TheMeal/scripts/gen-app-icons.mjs` 구조를 읽고 재사용. 상단 상수(`BG`·`TEXT`·`BELT`·`GLYPH_BJJ`·띠/랭크바 도형)가 단일 진실. sharp 는 `createRequire('/home/brownjeon/.node-local/themeal/package.json')('sharp')`.
   - 웹 산출: `web/public/icons/icon-192.png`·`icon-512.png`(스퀴르클, 투명 모서리) · `icon-maskable-512.png`(풀블리드 브라운, 묶음은 안전원 r=40%(maskable 규격) 안으로 축소) · `web/public/apple-touch-icon.png`(180, 불투명 풀블리드) · `web/public/favicon.ico`(16/32/48 PNG 멀티) · `web/public/favicon.svg` 교체(path 버전) · `web/public/og-image.png`(1200×630: 배경 `#0C0D12` 또는 브라운 중 조화로운 쪽, 아이콘 + "BJJ 훈련일지" — 한글도 path 로, Noto Sans CJK Bold 등) · `docs/brand/app-icon.svg`(1080 기준본).
   - Android 산출은 `--android <android res 경로>` 옵션으로 **분리**(task-039 가 `mobile/android` 생성 후 실행): 108 그리드, 묶음 반대각선 ≤ 31(안전원 r33 여유), foreground/monochrome vector(`drawable/ic_bjj_foreground.xml`·`ic_bjj_monochrome.xml` — 템플릿 `drawable-v24/ic_launcher_foreground.xml` 이 덮으므로 이름 분리), `mipmap-anydpi-v26/ic_launcher{,_round}.xml`(background `@color/ic_launcher_background` `#795548` + foreground + monochrome), `values/ic_launcher_background.xml`, `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher{,_round,_foreground}.png`, `drawable*/splash.png` 를 같은 크기 단색 `#0C0D12` 로 교체. 이번 task 에서는 옵션 구현 + 임시 디렉터리에 산출 테스트까지만.
   - monochrome: 글자·띠 흰 실루엣, 랭크바 영역은 투명으로 뚫고 랭크바 줄은 흰색으로 남겨 형태가 읽히게.
3. **웹 반영**: `web/public/manifest.webmanifest` icons(192·512 `purpose any`, maskable 512 `purpose maskable`) + `background_color #0C0D12`(theme_color `#1D9E75` 유지) · `web/index.html` 링크 정합(favicon.ico·svg·apple-touch-icon·og:image 절대 URL 유지).
4. **빌드 절차 보완**: CLAUDE.md "프론트 빌드" 에 `web/public/` → ext4 work `public/` rsync 줄 추가. 빌드·배포(ext4 work → dist). index.html 변경 시 work 로 복사.
5. 하지 말 것: 디자인 임의 변경(비율·색·배치), 프로젝트 package.json 에 sharp/opentype 추가, NFS 위 실행, 커밋.

## 검증 (dev 자체 → Reviewer → Leader 실행)
- 운영 URL `curl -sI`: `/apple-touch-icon.png`·`/og-image.png`·`/icons/icon-192.png`·`/icons/icon-512.png`·`/icons/icon-maskable-512.png`·`/favicon.ico`·`/favicon.svg`·`/manifest.webmanifest` 가 올바른 `Content-Type`(지금은 앞 두 개가 `text/html`).
- sharp metadata 로 크기·채널(apple-touch 알파 없음, 스퀴르클 아이콘 모서리 투명).
- 생성기 2회 실행 md5 동일(결정적 산출).
- 합성 비교 캡처(headless, 폭≥500): 시안 원본(텍스트 렌더) vs 생성본(path) · 스퀴르클/원형/단색 · 48/24/16px · og-image. Leader 열람.
- `--android` 옵션을 임시 디렉터리에 실행해 파일 목록·vector XML 유효성(`xmllint --noout` 가능하면) 확인.

## dev-038 결과
- [23:59] **DONE — 웹 아이콘 생성·배포 완료, `--android` 는 임시 디렉터리 테스트까지. 커밋·푸시 안 함.** risk LOW(JS 번들 무변경 `index-yRVVVCex.js`, 백엔드·DB 무변경).

### 변경 파일
| 파일 | 내용 |
|---|---|
| `web/scripts/gen-app-icons.mjs` (신규, md5 `f97f8e02…`) | 생성기. 상단 상수 `BG`·`TEXT`·`BELT`·`DARK`·`GLYPH_BJJ`·`BELT_BOX`·`RANK_BAR`·`RANK_LINES`·`GLYPH_TITLE`·`OG` 가 단일 진실. 옵션 없음 = 웹, `--android <res>` = 안드로이드만, `--out <dir>` = 웹 산출을 다른 루트로(검증용). 빌더 함수 export(미리보기 스크립트가 재사용) |
| `web/scripts/extract-icon-glyphs.mjs` (신규, 계약 외 추가) | `GLYPH_*` path 가 어디서 왔는지 재현하는 추출기(opentype.js·폰트는 ext4 `~/.node-local/bjj-tools`). 평소 실행 불필요. 출력 = 생성기 상수와 문자열 일치 확인함 |
| `web/public/icons/icon-{192,512,maskable-512}.png`·`apple-touch-icon.png`·`favicon.ico`·`og-image.png` (신규), `favicon.svg` (교체), `docs/brand/app-icon.svg` (신규) | 생성 산출 |
| `web/public/manifest.webmanifest` | icons 3개(192·512 `any`, maskable 512 `maskable`), `background_color #0C0D12`, theme `#1D9E75` 유지. 기존 `favicon.svg` 항목은 사양대로 뺌 |
| `web/index.html` | `favicon.ico`(sizes `16x16 32x32 48x48` — "any" 면 Chrome 이 svg 대신 ico 를 고름) 링크 추가, apple-touch `sizes=180x180`, `og:image:type/width/height` 추가, **`og:image:alt` 를 새 이미지에 맞게 수정**(옛 문구 "대시보드 — 캘린더…" 는 존재하지 않던 이미지 설명). og:image 절대 URL 유지 |
| `CLAUDE.md` 프론트 빌드 | `web/public/` → ext4 `work/public/` rsync 줄 + 아이콘 재생성 안내 2줄 |

### 폰트 선택 근거 — Archivo Black Regular 1.006 (SIL OFL 1.1, © 2017 The Archivo Black Project Authors)
- 시안 `<text>` 속성(Leader 확인): `font-size 35 · weight 900 · "Arial Black, Helvetica, sans-serif" · textLength 66 spacingAndGlyphs`. 실제 Arial Black(corefonts `AriBlk.TTF`, **참조 전용**으로 ext4 에만 받음 — Monotype 라이선스라 배포물에 outline 미사용)으로 재면 advance 66 강제 시 잉크 x 19.3→80.7, 캡 상단 29.95. Leader 결정대로 **잉크 66(x 17→83)·기준선 55·캡 25.05** 채택.
- 후보 17종을 같은 상자에 맞춰 Arial Black 대비 픽셀 IoU(800×400 래스터): **Archivo Black 96.65** · Archivo 900 96.67(동일 설계) · Inter Black 94.12 · Source Sans 3 Black 91.46 · Poppins 89.71 · Roboto Black 88.41 · Work Sans 87.62 · **Noto Sans CJK KR Black(사양 예시) 86.84** · FreeSans Bold 80.21 · Ubuntu Bold 78.25 · Montserrat 74.37 · Liberation/Arimo Bold 71.30 · Libre Franklin 70.18 · Public Sans 68.62 · Noto Sans Black 57.68 · DejaVu Sans Bold 53.25. (`~/.node-local/bjj-tools/analyze-fonts.json`)
- Archivo Black 은 'BJJ' 잉크 폭이 1.964em 으로 Arial Black(1.964em)과 사실상 같다 → 비균일 스케일 왜곡 sx/sy 0.92(시안 자체의 textLength 압축 0.893 과 비슷). 시안 원본(advance 66) 대비 IoU 도 77.25 로 Arial Black 잉크66(76.71)보다 높다. 사전 설치 폰트가 아니라 Google Fonts 에서 받은 파일(md5 `0ae1329aa90805a3901ff8929e244a38`)이다.
- NotoSansCJK `.ttc` 는 opentype.js 1.3.4 가 못 읽어 sfnt 재조립(인덱스 1=KR)으로 읽었다 — og 제목 'BJJ 훈련일지' 는 이 방법으로 Noto Sans CJK KR Bold 에서 추출.

### 배치·축소 결정
- 모든 산출은 시안 100 캔버스를 **(50,50) 기준 k 배**(시안 배치 유지 — 묶음 중심은 (50, 51.48)). 묶음 외곽 x 17~83, y 29.95~73, 중심에서 최원점 `REACH` 40.22.
- 웹 any 아이콘·favicon·apple-touch: k=1(시안 그대로). apple-touch 는 풀블리드·알파 없음.
- maskable: 안전원 r40 에 Android 와 같은 여유비(31/33) → k 0.9341, 최원점 37.57.
- Android 적응형: 108 그리드, k 0.7706(소수 4자리 내림), 최원점 30.997 ≤ 31(r33). 전경 PNG 실측 잉크 최대반경 30.13.
- 구형 런처 PNG: 48dp 중 44dp 타일(여백 2dp), round 는 원 r50 에 k=1. og-image: `#0C0D12` 바탕 + 타일 260px + 제목(84, 크림) 세로 중앙 쌓기 — 정사각형 크롭에도 둘 다 남음. 브라운 바탕 대안은 타일 윤곽이 사라져 미채택(캡처 ④).
- 단색: 글자·띠 흰색, 랭크바 자리(x 63~75)는 띠를 좌(17~63, 왼쪽만 둥글게)·우(75~83, 오른쪽만 둥글게)로 잘라 뚫고 줄 2개는 흰색 — evenOdd 불필요.

### 산출물 (repo, 3회 실행 md5 동일)
| 파일 | 크기 | 픽셀·채널 | md5 |
|---|---|---|---|
| web/public/icons/icon-192.png | 3,506 | 192² RGBA, 모서리(0,0) 알파 0 | f3709f4e2e97dbbca75c0d356ee2910b |
| web/public/icons/icon-512.png | 10,945 | 512² RGBA, 모서리 알파 0 | 2bb57c7d5a566da0779b2312df8eb6ce |
| web/public/icons/icon-maskable-512.png | 5,996 | 512² RGB(알파 없음) | baedadab3882412b655deff99ba8ec59 |
| web/public/apple-touch-icon.png | 1,917 | 180² RGB(알파 없음) | 297e1ec2604fd152e1bab2d17d484427 |
| web/public/favicon.ico | 2,272 | PNG 16/32/48 RGBA | 4dacef4cb09f78f069b735326a021240 |
| web/public/favicon.svg | 1,458 | viewBox 100 | bd4d171f09e73eb3d09a0f2ebc713080 |
| web/public/og-image.png | 13,952 | 1200×630 RGB | b00ecd826e77e224fa448486bbfd274d |
| docs/brand/app-icon.svg | 1,591 | 1080 기준본(rx23 타일) | 287ba6b5da159d6c26fdf6ee24de9846 |
| web/public/manifest.webmanifest | 599 | — | 86fa11bbf613dbaca270333c22650d6f |
- 결정성: 스크래치 `run1`==`run2`(8파일). 이후 K 를 소수 4자리 내림으로 고쳐 maskable 만 바뀜 → 수정 후 repo 2회 연속 실행 + 스크래치 `run3` 의 8파일 md5 전부 위 표와 일치.

### 배포·운영 확인 (23:54 빌드, 23:55 curl)
- 절차: rsync `web/src`(NFS==work, 차이 0) → `cp index.html` → rsync `web/public` → `npm run build`(1.39s) → rsync dist `--delete`. **`pm2 restart` 는 하지 않음**(백엔드·JS 번들 무변경, 정적 파일은 express.static 이 즉시 서빙).
- 배포 전 운영: PNG·ICO 6개 경로 모두 `200 text/html` 6,568B(SPA 폴백). 배포 후 `https://bjj.xn--lh0b87pnudm10a4vd.com`:
  `apple-touch-icon.png image/png 1917` · `og-image.png image/png 13952` · `icons/icon-192.png image/png 3506` · `icons/icon-512.png image/png 10945` · `icons/icon-maskable-512.png image/png 5996` · `favicon.ico image/x-icon 2272` · `favicon.svg image/svg+xml 1458` · `manifest.webmanifest application/manifest+json 599` — **받은 바이트 md5 가 repo 산출과 8개 전부 일치**.
- headless Chrome 147 CDP 로 운영 페이지: `Page.getAppManifest` errors `[]`, icons 3개 파싱, background `rgba(12,13,18,1)`, `getInstallabilityErrors` `[]`, head 링크 ico/svg/apple-touch 3개 확인.

### Android `--android` 임시 디렉터리 테스트 (실제 `mobile/android` 에는 실행 안 함 — task-039 몫)
- 대상: TheMeal Capacitor 템플릿 `res` 복사본 2벌(스크래치 `icon038/android-a`, `android-b`) → 두 벌 md5 전부 동일.
- 변경 31: 신규 `drawable/ic_bjj_foreground.xml`·`ic_bjj_monochrome.xml`, 갱신 `mipmap-anydpi-v26/ic_launcher{,_round}.xml`(background·foreground·monochrome), `values/ic_launcher_background.xml`(#795548), `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher{,_round,_foreground}.png`(48·72·96·144·192 / 108·162·216·324·432), `drawable*/splash.png` 11장(원래 크기 그대로, 전 픽셀 RGB 12/13/18). 템플릿 `drawable-v24/ic_launcher_foreground.xml` 은 그대로 둠(이름 분리).
- `xmllint --noout`(libxml 2.9.13, apt download 로 ext4 에만 풀어 씀) 5개 XML 모두 OK. 벡터 XML 을 그대로 SVG 로 옮겨 렌더한 결과가 생성기 SVG 렌더와 **차이 0바이트**(색·단색 둘 다).
- aapt2/Gradle 빌드는 **실행 안 함**(안드로이드 프로젝트 없음 — task-039 에서 확인 필요).

### 캡처 (Leader 열람용, 스크래치 `…/scratchpad/icon038/compare/`)
| 파일 | 크기 | mtime | md5 | 내용 |
|---|---|---|---|---|
| compare-1300.png | 1300×2500 | 09-13 23:58:01 | ee77c2cafc2d224ad1d57a76c91731e9 | ① 시안 `<text>`(Arial Black data-URI) · Arial Black 없는 뷰어 폴백 · Arial Black 잉크66 · **Archivo Black 채택** · Inter · Noto CJK + 겹침 2장 ② 스퀴르클·maskable 원형·안전원·Android 원형·단색 ③ 16/24/32/48 ④ og-image 채택·대안 |
| side-by-side-880.png | 880×560 | 09-13 23:57:16 | b895264c82033039df3146e875b20365 | 시안 원본 vs 생성 icon-512 400px 나란히 |
| android-preview.png | 1778×452 | 09-13 23:57:06 | f4457c5eecaa67187474f2ea886756ea | 적응형 원형(+r33 점선)·단색·구형 ic_launcher·round (xxxhdpi 산출) |
| compare-small-crop.png | 1300×520 | 09-13 23:58:01 | e3fcc8783aa37176a3ac5c2a094e90ac | ③ 소형 구간 확대 |
| compare-og-crop.png | 1300×470 | 09-13 23:57:25 | 27883b420649a9f3e45db0c480e42479 | ④ og 구간(24px 추가 전 캡처에서 자름 — og 내용 동일) |

### 다시 돌리는 법
```bash
node /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/web/scripts/gen-app-icons.mjs                 # 웹
node /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/web/scripts/gen-app-icons.mjs --out /tmp/x    # 비교용
node /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/web/scripts/gen-app-icons.mjs --android <mobile/android/app/src/main/res>  # task-039
# 이후 CLAUDE.md "프론트 빌드"(web/public rsync 포함). 비교 캡처: node ~/.node-local/bjj-tools/build-compare.mjs <out> <web/public> → google-chrome --headless=new --screenshot
```
- 스크립트 파일은 NFS 에 있고 ext4 의 node 가 읽어 실행한다(TheMeal 과 같은 방식). 네이티브 모듈(sharp)·opentype.js·폰트·xmllint 는 모두 ext4. 프로젝트 package.json 무변경.

### 실행 안 했거나 대체한 것
- 커밋·푸시 안 함. `pm2 restart bjj` 안 함(불필요). 실제 안드로이드 res 에 `--android` 안 함, APK·aapt2 검증 안 함.
- 실기기(iOS 홈 화면·안드로이드 런처·카카오톡 링크 미리보기) 확인 안 함. 카카오/페이스북 OG 캐시는 예전 폴백을 기억할 수 있다.
- 사양의 og 제목 문자열 `BJJ 훈련일지`(붙여씀)를 그대로 썼다 — 사이트 메타(`og:site_name`·manifest name)는 `BJJ 훈련 일지`(띄어씀). 바꾸려면 extract 스크립트 `TITLE` 수정 → 재추출 → `GLYPH_TITLE`·`TITLE_BOX` 교체.
- 구형 `ic_launcher_round.png` 는 원 r50 에 k=1 이라 글자·띠 모서리가 원 가장자리에 가깝다(최원점 40.2/50). API 23~25 전용이라 시안 비율을 유지했다.

## Reviewer 결과

- [00:20] **PASS.** Critical 0 · High 0 · Medium 0 · Low 3. 아래는 직접 재현·검증한 근거만 적었다(주장만 있고 재현 안 한 항목은 표시).

### 독립 재검증(직접 실행, read-only, 산출은 전부 `/tmp/claude-1000/.../rev038scratch`)
1. **결정성**: `node web/scripts/gen-app-icons.mjs --out <scratch>/run1`·`run2` 2회 실행 → 웹 산출 8파일 md5 완전 동일, 그리고 **repo 커밋본 8파일과도 전부 일치**(icon-192/512/maskable-512, apple-touch-icon, favicon.ico/svg, og-image.png, docs/brand/app-icon.svg) — task 표의 md5 값을 그대로 재현. `[web] ... maskable K=0.9341 reach=37.5736/40` 로그도 이력서와 일치.
2. **폰트 라이선싱**: `node web/scripts/extract-icon-glyphs.mjs` 를 실제로 다시 돌려 `source.bjj = "Archivo Black Regular Version 1.006"`(SIL OFL) 확인, 추출된 `GLYPH_BJJ` 문자열이 `gen-app-icons.mjs:36` 에 박힌 상수와 **바이트 단위로 일치**함을 확인 — "Archivo Black outline" 이라는 주장이 재현 가능한 사실임을 직접 증명했다. `og:title` 글리프 source 는 `"Noto Sans CJK KR Bold"`(OFL). 저장소 전체를 `grep -rIl "Arial Black\|AriBlk"` 로 훑어도 스크립트/문서 주석 외 매치 없음, `find ... -iname "*.ttf" -o -iname "*.ttc" -o ...` 로도 저장소 안에 폰트 바이너리 0건 — Arial Black outline 미embedding 확인.
3. **생성기 견고성**: `createRequire('~/.node-local/themeal/package.json')('sharp')` 가 실제로 로드됨(sharp 0.35.4) 확인. `--android <scratch>/android-res` 를 더미 `drawable/splash.png` 를 미리 만들어 넣고 실행 → 산출 파일명이 이력서와 완전히 일치(`ic_bjj_foreground.xml`·`ic_bjj_monochrome.xml`·`mipmap-anydpi-v26/ic_launcher{,_round}.xml`·`values/ic_launcher_background.xml`·5 density × 3 PNG·`drawable/splash.png` 교체). `drawable-v24`(splash 없음)는 건너뜀 — 템플릿 `ic_launcher_foreground.xml` 이름 분리 유지 확인. TheMeal 실제 Capacitor 템플릿 구조를 대조해 `drawable*` splash 11개(land×5·port×5·drawable×1) 라는 이력서 숫자가 실제 템플릿과 일치함을 확인. splash 교체 PNG는 sharp metadata 로 `400×800 RGB(alpha 없음) 전 픽셀 (12,13,18)` = `#0C0D12` 균일 확인. `web/public` PNG 들도 직접 sharp metadata 로 재확인: icon-192/512 RGBA 모서리 alpha 0(스퀴르클), maskable-512·apple-touch·og-image 는 alpha 없음(opaque) — 표와 일치.
4. **index.html/manifest**: `git diff` 로 실제 변경분 확인 — manifest 아이콘이 `favicon.svg sizes:any` 1개→PNG 3개(`192/512 any` + `maskable-512 maskable`)로 교체, `background_color #ffffff→#0C0D12`(theme_color 유지). index.html 은 `og:image:type/width/height` 추가, `apple-touch-icon sizes=180x180` 추가, `favicon.ico` 링크(+sizes) 신설 — 계약 3번과 일치.
5. **package.json 오염 없음**: `web/package.json`·루트 `package.json` 확인 — sharp/opentype.js 없음. **커밋 없음**: `git status --porcelain` 에 CLAUDE.md·web/index.html·web/public/*·web/scripts/* 가 전부 unstaged(M/??) — 계약 5번(NFS 실행·package.json 오염·커밋 금지) 위반 없음.
6. **사양 좌표**: `gen-app-icons.mjs:27-41` 상수(BG `#795548`·TEXT `#F3E9DC`·BELT `#111111`·BELT_BOX x17/y62/w66/h11/rx3·RANK_BAR x63/w12·RANK_LINES xs 66.5/70.5 w2.2·TILE_RX 23)가 확정 사양 표와 1:1 일치. Leader 결정(잉크 66, advance 66 아님)도 GLYPH_BJJ 주석(`gen-app-icons.mjs:34`)에 그대로 반영. K_ANDROID(0.7706=floor4(31/40.2244))·K_MASKABLE(0.9341) 계산을 직접 재현해 REACH=40.22(바닥 모서리 `hypot(33,23)`) 기준 안전원 여유식과 일치함을 확인.

### 발견 사항 (severity 낮음 — QA 결함 아님, Leader/후속 참고용)
| # | 심각도 | 위치 | 내용 | 권고 |
|---|---|---|---|---|
| L1 | LOW | `web/index.html:34` (og:image:alt) vs `web/public/manifest.webmanifest:2`·`web/index.html:24` | og-image PNG 안에 래스터로 박힌 제목이 `"BJJ 훈련일지"`(붙여씀, `extract-icon-glyphs.mjs:28` `TITLE`)인데, 사이트 공식 명칭은 어디서나 `"BJJ 훈련 일지"`(띄어씀) — 이미 배포된 og-image.png 를 카카오·페이스북·트위터 공유 시 그대로 노출된다. dev 도 "실행 안 했거나 대체한 것"에 자인지한 항목. 기능 결함은 아니지만 브랜드 문구 불일치가 이미 production 에 나가 있다. | 고치려면 `extract-icon-glyphs.mjs` 의 `TITLE` 을 `'BJJ 훈련 일지'` 로 바꿔 재추출 → `GLYPH_TITLE`/`TITLE_BOX` 교체 → 재생성·재배포. Leader 판단에 맡김(사용자가 이미 승인한 시안 문구일 수도 있어 임의 수정하지 않음). |
| L2 | LOW | `web/scripts/gen-app-icons.mjs:24` | 이 프로젝트(bjj-trainning) 스크립트가 **다른 프로젝트(TheMeal)의 ext4 로컬 산출물**(`~/.node-local/themeal/node_modules/sharp`)을 `createRequire` 로 빌린다. 계약 2번이 명시적으로 지시한 방식이라 사양 위반은 아니나, `CLAUDE.md` "알려진 인프라 이슈" 절에는 이 크로스 프로젝트 결합이 기록돼 있지 않다. TheMeal 쪽에서 `sharp` 를 제거·업그레이드하면 이 스크립트가 조용히 깨진다. | `CLAUDE.md` 알려진 인프라 이슈에 한 줄 추가 권고("아이콘 생성기는 TheMeal 의 ext4 sharp 를 빌린다 — TheMeal `.node-local` 정리 시 같이 깨짐"). 코드 변경 불필요, 문서 보완만. |
| L3 | LOW/정보 | `web/index.html:47-49` | favicon.ico 에 `sizes="16x16 32x32 48x48"` 를 주고 favicon.svg 는 sizes 없이 두어 "ico 가 svg 를 이긴다"는 주석(`web/index.html:47`)을 달았는데, 일반적으로 알려진 브라우저 관례는 반대(svg 에 `sizes="any"` 를 줘야 svg 가 이긴다)다. 실제로 Chrome 이 어느 쪽을 택하는지는 이 세션에서 재검증하지 않았고, 두 파일이 같은 디자인(브라운 배경, 크림 BJJ, 검은 띠)이라 **어느 쪽이 선택돼도 사용자에게 보이는 결과는 동일**해서 리스크는 낮다. | 확신이 필요하면 실제 배포 URL 을 최신 Chrome/Firefox 로 열어 탭 아이콘이 어느 파일인지 Network 탭으로 확인. 기능 리스크 없어 blocking 아님. |

### 실행하지 않은 것 (명시)
- 프로덕션 URL curl·헤드리스 Chrome CDP 재검증 — Leader 가 이미 수행·확인했다고 보고받아 중복 실행하지 않음.
- `compare-*.png`·`side-by-side-880.png`·`android-preview.png` 캡처를 직접 열어보지 않음 — Leader 가 이미 열람·"시안에 충실함" 판정했다고 명시돼 있어, 내 검증은 코드·수치·결정성·라이선싱에 집중했다.
- `xmllint` 재검증 — 이 세션 환경에 `xmllint` 미설치(`which xmllint` 실패). 대신 `--android` 스크래치 산출 XML 5개를 직접 열어 태그 열림/닫힘·중첩을 눈으로 검사했고 구조적으로 온전함을 확인했을 뿐, libxml 스키마 검증은 재실행하지 않았다(dev 가 ext4 에 apt download 해 1회 실행한 결과를 신뢰).
- aapt2/Gradle 빌드, 실기기 설치 확인 — 안드로이드 프로젝트 자체가 없음(task-039 소관), 계약 범위 밖.
- `web/src`·`mobile/`·backend 변경분(dev-039 동시 작업) — 지시대로 검토 대상에서 제외.

### high_risk_areas (QA 인계용)
- `web/public/og-image.png` (L1) — 소셜 공유 시 문구 불일치 노출 여부, 사용자에게 문제로 보이는지 확인 권고(기능 결함 아님).
- `web/index.html:47-49` (L3) — 실제 배포 사이트에서 탭 파비콘이 새 브라운 디자인으로 보이는지만 스팟체크(어느 파일이 선택되든 디자인은 동일하므로 "새 디자인으로 보이는가"만 확인하면 충분).
- Android `--android` 산출물 자체는 `mobile/android` 에 아직 반영되지 않았음(task-039 소관) — QA 이번 task 범위에서는 검증 대상 아님.

## Leader 실행 검증
- 운영 URL 8개(`apple-touch-icon.png`·`og-image.png`·`icons/icon-{192,512,maskable-512}.png`·`favicon.ico`·`favicon.svg`·`manifest.webmanifest`) 직접 받아 봄 → 이미지 경로는 전부 `image/*`(manifest 는 `application/manifest+json`), **받은 바이트 md5 가 repo 산출물과 8개 모두 일치**.
- 캡처 `side-by-side-880.png`(시안 vs 생성 icon-512)·`android-preview.png`(적응형 원형·단색·구형 런처) Leader 직접 열람 — 시안 비율·색·배치 그대로.
- Reviewer PASS(Low 3) 처리:
  - L1 og-image 제목 띄어쓰기 → **`BJJ 훈련일지`(붙여씀) 유지**. 사용자가 정한 앱 이름이 `BJJ 훈련일지` 라서(task-039 appName 과 동일). 수정 없음.
  - L2 생성기가 TheMeal ext4 의 sharp 를 빌림 → CLAUDE.md "알려진 인프라 이슈"에 기록(2026-09-14).
  - L3 favicon 주석의 "ico 가 svg 를 이긴다" 근거는 부정확 — 두 파일이 같은 도안이라 어느 쪽이 골라져도 결과 동일, 무해. 수정 없음.
- 완성 아이콘 이미지를 사용자에게 전달함.
- Android 반영은 [[task-039-android-apk]] 에서 `--android` 로 실제 res 에 적용·APK 로 검사 완료.

## 최종 요약
**앱 아이콘이 브라운 배경 + 크림색 `BJJ` + 검은 띠(랭크바 포함) 도안으로 바뀌었습니다.** (배포 완료)

- 웹: 브라우저 탭 아이콘(favicon), 홈 화면 추가 아이콘(iPhone·Android), 링크 공유 미리보기 이미지(og-image)가 모두 새 도안입니다. 전에는 일부 아이콘 파일이 아예 없어서 공유 미리보기가 비어 있었습니다.
- Android 앱: 런처 아이콘(원형·테마 단색 아이콘 포함)도 같은 도안입니다([[task-039-android-apk]]).
- 글자는 폰트가 아니라 도형으로 박혀 있어 어느 기기에서나 똑같이 보입니다. 도안을 바꾸고 싶으면 `web/scripts/gen-app-icons.mjs` 위쪽 색·좌표만 고치고 다시 실행하면 전부 새로 만들어집니다.
- 참고: 카카오톡 등은 예전 미리보기를 한동안 기억할 수 있습니다.
