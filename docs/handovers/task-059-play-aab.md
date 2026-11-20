# Google Play AAB 준비·인계 (task-059)

사용자가 승인한 범위는 제출용 설정, 서명된 AAB 생성과 검증이다. **Play Console 등록·내부/비공개 테스트트랙 업로드·운영 배포를 수행하지 않는다.** 실제 출시는 추후 별도 런칭 버전 작업이다.

- 준비 버전: **1.2.0 / Android versionCode 2**. 당시 운영 앱 정본 1.1.0에서 기본 minor를 한 번 증가했다. 마지막 전달 APK 1.0/code1과 과거 전달 기록을 보존했다. 이번 후보의 재빌드는 같은 버전이다. 런칭 버전은 아직 지정하지 않았다.
- 앱 ID: `com.miraclepenguin.bjj` 유지. 원격 HTTPS 웹·현재 기능·로그인 딥링크·minSdk23 유지.
- 정본: 앱 버전은 루트 package/lock, 네이티브는 `mobile/version.json`(Gradle이 읽음); mobile package/lock도 1.2.0으로 일치시킨다. 빌드 스크립트가 정본 불일치를 차단한다.
- Android: compile/target36, build-tools36.0.0, AGP8.10.1, 기존 Gradle8.11.1/JDK21/Capacitor7 유지. API27 전용 테마 속성은 `values-v27`로 분리했다. Android12+ cloud/device-transfer 제외 규칙과 HTTPS 전용 설정을 명시했다. 어두운 앱에서 밝은 상태바 아이콘을 명시했다.

## 빌드 (Ubuntu 로컬 디스크)

정본 소스를 로컬 실행용 미러에 동기화한다. NFS 위에서 npm/Gradle을 실행하지 않는다. task059는 기존 공유 미러를 덮어쓰지 않고 `/home/brownjeon/.node-local/bjj-t059/`에서 검증했다.

```bash
# 최초 한 번만. 기존 키가 있으면 덮어쓰지 않는다.
python3 mobile/scripts/prepare-upload-key.py
# 같은 version.json의 검증·재빌드에는 버전을 다시 증가시키지 않는다.
BJJ_MOBILE_LOCAL="$HOME/.node-local/bjj-t059/build" bash mobile/scripts/build-aab.sh
ANDROID_HOME="$HOME/.node-local/android-sdk" python3 mobile/scripts/verify-aab.py \
  "$HOME/.node-local/bjj-t059/build/artifacts/BJJ-TrainingLog-1.2.0.aab" \
  "$HOME/.node-local/bjj-t059/tools/bundletool-all-1.18.3.jar" \
  --output "$HOME/.node-local/bjj-t059/verification"
```

`build-aab.sh`는 외부 서명/권한/버전 사전검사 → 미러 잠금 → sync → 정확한 package/name·npm prefix 검사 → npm ci → Capacitor sync → bundleRelease+lintRelease → 버전 파일명 AAB 복사 순서다. macOS 메타데이터와 NFS 관리 디렉터리를 제외한다. 생성되는 Cordova 폴더·Gradle build/cache는 동기화 삭제 대상에서 보호한다. 릴리스 서명 설정이 없으면 Gradle의 직접/간접 릴리스 번들 작업도 실패한다. 디버그 빌드는 기존 키를 쓴다.

## 업로드 키와 백업

- Ubuntu: `/home/brownjeon/.config/bjj-mobile/`, 디렉터리0700·파일0600. `upload.properties`는 키·암호파일의 경로와 alias만 포함한다. `BJJ_UPLOAD_PROPERTIES`로 다른 외부 경로를 지정할 수 있다.
- RSA4096/PKCS12 업로드 키·별도 난수 암호를 최초 생성했다. 기존 Android debug.keystore는 보존한다.
- Mac 소유자전용 백업: `/Users/brownjeon/.config/bjj-mobile-t059/upload-identity-backup.tar` (상위0700·파일0600). **개인키/암호/백업을 git이나 공유 산출물 폴더에 넣지 않는다.**
- 복구는 백업의 네 파일을 원래 Ubuntu 경로에 소유자전용 권한으로 복원한다. 다른 경로/기계라면 upload.properties의 절대경로를 수정한다. `prepare-upload-key.py`는 부분 파일이 남으면 덮어쓰지 않고 중단한다.
- 이 키는 Play Console에 아직 등록하지 않았다. 런칭 때 Play App Signing과 업로드 인증서를 연결한다. 로컬 검증 APK는 업로드 키로 서명했으며 향후 Google 배포 APK의 앱 서명 인증서와 구분한다. 기존 debug APK와 서명이 달라 기존 설치본에서의 전환 방식은 런칭 때 확인한다.

## 검증과 추후 런칭 범위

검증 결과/해시/빌드 로그/에뮬레이터 범위는 `docs/verification/task-059-play-aab.json`을 참조한다. AAB 자체는 저장소 밖 사용자 산출물 디렉터리에 전달한다.

- 검증: Gradle release/lint, JAR 무결성·업로드 인증서 일치, bundletool validate, manifest 버전/API/권한/보안설정, 비밀파일/암호 미포함, 기기별 APK 생성·서명/정렬, Android16 에뮬레이터 설치/기동·실운영 로그인 화면.
- 포함한 네이티브 ELF(.so)는0개다. ELF별 16KB 정렬 검사는 적용 대상이 없으며 신규 native plugin 추가 시 다시 확인해야 한다.
- 실기기·실사용자 OAuth/로그인 이후 기록작성·영상저장 전체 E2E나 Play 심사는 이번 검증 범위가 아니다.
- 런칭 시: 최종 기능/버전과 최신 정책 재검증, 개인정보처리방침·Data safety·계정삭제 등 실제 서비스 정책 점검, 스토어 소개/이미지·심사용 접근/테스터 요건·Play App Signing/인증서 등록, 실제 기기 및 로그인/저장 회귀 확인 후 승인된 트랙에 업로드한다. 이는 이번 AAB 준비 완료와 별도다.

근거: [Google target API 요건](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en), [AGP8.10/API36 호환](https://developer.android.com/build/releases/agp-8-10-0-release-notes), [AAB 서명](https://developer.android.com/studio/publish/app-signing), [bundletool](https://developer.android.com/tools/bundletool).
