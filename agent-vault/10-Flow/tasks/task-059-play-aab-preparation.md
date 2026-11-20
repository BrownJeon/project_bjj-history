---
task_id: task-059
title: Google Play 제출용 설정과 AAB 빌드 검증
status: done
stage: prepared_verified
app_version: "1.2.0"
android_version_code: 2
store_registration: deferred_by_user
related_tasks: ["[[task-039-android-apk]]", "[[task-056-class-related-video-detail]]"]
tags: [type/task, domain/mobile, domain/infra]
aliases: [AAB 빌드, Google Play 준비]
created: 2026-11-10
updated: 2026-11-10
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "Android 제출용 설정·서명·AAB 빌드/검증. 스토어 등록/배포는 사용자 지시로 추후 런칭 버전에서 진행"
  last_event_id: exec-003
---
# Google Play 제출용 설정과 AAB 빌드 검증

## 승인과 범위
- 사용자: 필요한 설정 반영, AAB 빌드와 검증까지 진행. 실제 스토어 등록/배포는 추후 런칭용 앱버전으로 별도 진행.
- 현재 앱ID/운영웹연결/기능을 보존한다. 기존 운영 서비스·DB·디버그 서명키를 변경하지 않고 별도 로컬디스크에서 빌드한다. 실제 스토어/테스트트랙 업로드도 하지 않는다.
- [[task-039-android-apk]]의 Capacitor7·원격HTTPS·디버그APK 배포 및 [[task-056-class-related-video-detail]]의 최신 운영1.1.0 이력을 확인했다. 원격 origin/main a8476e10과 현재 작업본 mobile/ 차이 없음.
- 운영앱 정본1.1.0·마지막 네이티브APK versionName1.0/versionCode1을 확인했다. 기본minor1회 증가로 준비용 앱1.2.0/versionCode2를 확정한다. 같은 후보의 검사/재빌드는 증가하지 않는다. 런칭 버전은 미정이며 이 후보를 스토어 출시 완료로 판정하지 않는다.
- 별도작업본: /Users/brownjeon/.codex/worktrees/bjj-t059-play-aab/bjj-trainning (codex/bjj-t059-play-aab, origin/main 기준). T55 미커밋기록/원본NAS의다른변경은 보존.

## 구현·검증 계획
- compile/targetSdk36 및 API36 지원AGP, 기존Capacitor7/Gradle8.11.1/JDK21 유지.
- 외부보관 업로드키·필수서명검사, 버전정본 및 재현가능한 AAB빌드/검증스크립트.
- 실제 bundleRelease/lint, JAR서명·bundletool validate·manifest/설정/민감파일검사·기기별APK생성/서명, Android16 에뮬레이터 설치/기동 확인.
- 키/암호는 저장소 밖 소유자전용파일에 저장하고 비밀값을 출력하지 않는다. 산출물/검증증거·키보관위치만 인계한다.

## 실행 이력
| ID | 시각(KST) | 결과 |
|---|---|---|
| exec-001 | 2026-11-10 15:25 | 승인범위·최신버전/소스·Ubuntu JDK21/SDK35/KVM/공간확인, 별도작업본준비·SDK36도구설치시작 |
| exec-002 | 2026-11-10 15:37 | AAB서명·bundletool검사/83APK생성/서명·서명누락차단·에뮬레이터설치/로그인화면기동확인. 릴리스lint NewApi1건수정, 최초복사메타데이터제거·빌드중복실행에따른중간lint메타데이터실패는재빌드로복구/미러잠금추가. 상태바아이콘설정후최종재검증중 |
| exec-003 | 2026-11-10 15:43:43 | 준비용1.2.0/code2 AAB·lint·bundletool32검사·83APK/서명·Android16설치/로그인렌더·서명누락차단/디버그회귀 검증완료. 최종파일해시 fe0cf62f…cab0460. 키별도보관/백업·다운로드파일/영수증생성·task/ACTIVE/board/log동기화. 스토어/운영배포없음 |

## 구현 결과
- `mobile/android`: compile/target36·build-tools36.0.0·AGP8.10.1, 기존 Gradle8.11.1/JDK21/Capacitor7 유지. root/mobile package·lock1.2.0과 Gradle이 읽는 version.json1.2.0/code2 일치.
- 릴리스 서명은 외부 업로드키만 사용하며 키 누락 시 실제 bundleRelease 작업이 차단된다. 키/암호를 소유자전용 위치에 생성하고 Mac 별도 백업을 남겼다. 기존 debug 인증서와 디버그 빌드 경로를 보존했다.
- API27 전용 테마 속성 분리, Android12+ cloud/device-transfer 백업제외, HTTPS 전용설정 명시. Android16 밝은 OS테마에서도 어두운 앱의 상태바아이콘이 보이도록 기존의도대로 밝은 아이콘설정.
- 재현 가능한 build-aab.sh/verify-aab.py/prepare-upload-key.py 추가. sync에서 macOS/NAS 메타데이터 제외·생성Cordova/build캐시 보호, AAB미러 잠금 적용.

## 검증 결과
- 최종 `bundleRelease + lintRelease`: PASS (`gradle-aab-20261110-153602.log`). lint 오류0·경고16(지원중인툴보다최신버전존재, 기존아이콘/미사용리소스 등), 경고를 숨기거나 baseline으로 제외하지 않았다.
- bundletool1.18.3 공식GitHub 배포의 게시SHA256 확인 후 사용. bundletool validate·JAR무결성/업로드 인증서·manifest 버전/API/권한·비밀파일/암호 미포함·백업/HTTPS·기기별APK생성/서명·zipalign 등 **32개 검사 PASS**.
- 83개 기기별APK 생성, dedicated Android16/API36/x86_64 에뮬레이터에 필요한split을 실제 설치. cold launch 정상·foreground/process확인·crashbuffer0·실운영 로그인화면렌더/밝은상태바/하단바 확인. 검증후 해당에뮬레이터만 종료했다.
- 업로드서명 누락 부정검사: bundleRelease가 requireUploadSigning에서 exit1(실행1task)로 차단. 동일 조건에서 assembleDebug는 exit0, 기존전달APK와새debugAPK 인증서동일.
- 원본해시/다운로드해시일치, AAB 3,032,651bytes·SHA256 `fe0cf62f3e80f2ba56acc2a36f85e1e4a55934733ab6dbf73f31a99cdcab0460`. RSA4096 업로드인증서 SHA256 `fa4a5dd9b9e3aa8ce0dcb81fa356a45a2eaceeb0354c6c5c0bb7bbc9ecb39b68`.
- native ELF(.so)0개로 ELF별16KB 정렬검사는 적용대상없음. 신규네이티브플러그인 추가시 재확인.
- 운영 root version1.1.0·릴리스20261109-221832-a8476e10 유지 확인. 운영서버/DB/웹배포·스토어등록/트랙업로드/배포 미실행. 작업변경은 미커밋/미push, T55/다른세션변경 보존.

## 산출물·후속 경계
- 다운로드 AAB: `/Users/brownjeon/.codex/artifacts/bjj-t059/1.2.0/BJJ-TrainingLog-1.2.0.aab`.
- 검증 영수증: `docs/verification/task-059-play-aab.json`, 재현/키보관/런칭인계: `docs/handovers/task-059-play-aab.md`. 비밀파일은 저장소/전달산출물에 포함하지 않았다.
- 실제사용자 OAuth/로그인후기록작성·영상저장 전체회귀·실기기·Google Play심사는 미검증. 준비용AAB검증완료와 런칭완료를 구분한다.
- 실제 런칭버전·스토어입력/정책/심사용접근·Play AppSigning등록/배포는 사용자의 명시된 후속범위이며 현재버전을 자동출시하지 않는다.
