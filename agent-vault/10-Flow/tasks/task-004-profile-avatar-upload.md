---
name: task-004-profile-avatar-upload
aliases: ["avatar-upload", "프로필사진"]
tags:
  - type/task
  - domain/profile
related_tasks:
  - "[[task-003-profile-training-days-multi-affiliation]]"
status: doing
created: 2026-08-18
---

# task-004 — 프로필: 기본 정보 수정 화면에 프로필 사진 업로드 추가

## 목표

"기본 정보" 수정 모달(`ProfileEditor`)에서 프로필 사진을 업로드/변경/삭제할 수 있게 한다.

## 관련 과거 이력 요약

- [[task-003-profile-training-days-multi-affiliation]]: 같은 화면(ProfilePage/ProfileEditor)에 수련일수 표시 + 소속 다중 등록을 방금 추가함(2026-08-18 완료). 이번 작업은 그 바로 다음 개선으로, 같은 파일들을 다시 건드리게 되므로 **task-003에서 만든 소속 칩 UI·수련일수 표시 로직을 건드리거나 되돌리지 않도록 주의**해야 한다.

## 현재 구조 (Leader 사전 조사) — 중요: 백엔드는 이미 구현돼 있고 프론트만 연결 안 돼 있다

- **백엔드는 이미 완성돼 있음, 변경 불필요**:
  - `backend/src/routes/profile.js`의 `POST /profile/avatar` — multer로 `avatar` 필드(multipart) 받음, 5MB 제한, image mimetype만 허용, 파일명 `avatar_${userId}${ext}`로 저장 후 `Profile.avatar` 컬럼 갱신, 응답 `{ avatar: '/uploads/avatar_3.jpg' }` 형태(서버 루트 기준 상대경로)
  - `DELETE /profile/avatar` — 파일 삭제 + `avatar` 컬럼 null 처리, 응답 `{ ok: true }`
  - `backend/src/models/Profile.js`의 `avatar: STRING(255)` 컬럼 이미 존재
  - `web/src/api/profile.js`에 `uploadAvatar(formData)` / `deleteAvatar()`가 이미 export돼 있음 — **어디서도 호출되지 않고 있는 죽은 코드 상태**
  - 업로드된 파일은 `app.use('/uploads', express.static(...))`로 서빙되므로 `<img src={profile.avatar}>` 처럼 반환된 상대경로를 그대로 써도 된다 (이 앱의 다른 이미지들, 예: `video_clips.thumb_url`도 DB에 저장된 상대경로를 가공 없이 그대로 `<img src>`에 씀 — 별도 base URL 접두사 붙이는 헬퍼 없음).

- **프론트 버그 발견**: `web/src/pages/ProfilePage.jsx` 헤더의 아바타 렌더링 부분이 `profile.avatar_url`을 참조하는데, `GET /profile` 응답에는 그런 필드가 없고 실제 컬럼명은 `avatar`다. 즉 지금까지 아바타 이미지가 등록돼 있어도 절대 표시되지 않는 상태였다(항상 fallback인 닉네임 이니셜만 보임). **이번 작업에서 `profile.avatar_url` → `profile.avatar`로 고쳐야 한다.**

## 역할별 지시사항

### Developer

**범위**: 순수 프론트엔드 작업. 백엔드는 이미 완성돼 있으므로 건드리지 않는다(위 "현재 구조" 참고). 새 API 엔드포인트나 DB 컬럼을 추가하지 말 것 — 과설계 금지.

1. **버그 수정**: `ProfilePage.jsx` 헤더의 `profile.avatar_url` → `profile.avatar`로 수정.

2. **`ProfileEditor` 컴포넌트에 사진 업로드 UI 추가**:
   - 모달 상단(닉네임 필드 위)에 현재 아바타 미리보기(원형, 기존 헤더의 64px 원형 스타일과 톤 맞출 것 — 없으면 닉네임 이니셜 fallback도 동일하게 보여줄 것) + "사진 변경" 버튼 + (아바타가 있을 때만) "삭제" 버튼을 배치한다.
   - `<input type="file" accept="image/*">`는 숨기고 버튼 클릭으로 트리거 (다른 화면의 `cookieInputRef` 패턴처럼 `useRef` 사용).
   - 파일 선택 시 즉시 `FormData`에 담아 `profileApi.uploadAvatar(formData)` 호출 (저장 버튼과 별개 — 백엔드가 별도 멀티파트 엔드포인트이기 때문). 업로드 중에는 `useUI()`의 `setLoading(true)` 사용. 성공 시 미리보기 갱신 + `showToast`로 안내. 실패 시(용량 초과/이미지 아님 등 백엔드 에러 메시지) `showToast`로 에러 표시.
   - "삭제" 버튼 클릭 시 `profileApi.deleteAvatar()` 호출, 성공 시 미리보기를 fallback(이니셜)으로 되돌림.
   - **중요**: 업로드/삭제는 모달을 열어둔 상태에서 즉시 반영돼야 하고, 모달을 닫은 뒤 뒤쪽 프로필 헤더의 아바타도 최신 상태로 보여야 한다. `ProfileEditor`가 독립적인 `form` state를 갖고 있어 부모 `profile` state와 동기화되지 않으므로, 업로드/삭제 성공 시 `ProfileEditor`에 전달할 콜백 prop(예: `onAvatarChange(newAvatarPathOrNull)`)을 하나 추가해 `ProfilePage`의 `profile` state도 함께 갱신할 것 (전체 `loadAll()` 재호출보다 해당 필드만 바로 `setProfile(p => ({...p, avatar: ...}))`로 갱신하는 편이 깜빡임 없고 낫다).
   - 스타일은 기존 `Button`/`Card` 컴포넌트와 CSS 변수(`var(--accent)`, `var(--surface-up)` 등) 톤을 그대로 따를 것, 새 디자인 언어 도입 금지.

3. **선택 사항(간단하면 반영, 아니면 스킵)**: 사용자가 확장자가 다른 이미지로 재업로드하면(예: 처음 .jpg 업로드 후 .png로 재업로드) 서버가 파일명을 `avatar_<uid>.<ext>`로 만들기 때문에 이전 확장자 파일이 서버에 orphan으로 남을 수 있다는 걸 발견하면 Reviewer 기록에 남기되, 백엔드 수정이 필요한 사안이라 이번 프론트 전용 작업 범위에서는 고치지 말고 보고만 해라.

작업 완료 후 이 파일 "## Developer 기록" 섹션에만 변경 파일과 실제 구현 방식(prop 이름, 이벤트 흐름)을 기록하고, task-003 때처럼 pm2 재기동 + 프론트 빌드(CLAUDE.md 절차)까지 마쳐라.

### Reviewer

Developer 완료 후:
- 업로드 실패 케이스(5MB 초과, 이미지 아닌 파일) 시 UI가 깨지거나 무한 로딩에 빠지지 않는지 코드상 확인
- 인증 토큰 없이/만료 시 업로드 시도했을 때의 처리(기존 axios 401 인터셉터가 로그아웃 처리하는 것과 충돌 없는지)
- `onAvatarChange` 콜백이 모달을 닫아도 헤더에 정상 반영되도록 연결됐는지
- 기존 task-003 결과물(소속 칩 UI, 수련일수 표시)이 이번 변경으로 손상되지 않았는지
- 이 프로젝트 기존 파일 업로드 UI(Instagram 쿠키 업로드 부분의 `cookieInputRef` 패턴)와 일관된 방식인지

### QA

Reviewer PASS 후:
- pm2 로그에 에러 없는지, 프론트 번들에 신규 기능 반영됐는지 확인
- API 레벨(curl multipart 업로드)로 실제 이미지 업로드 → GET /profile에서 `avatar` 경로 갱신 확인 → 삭제 → 다시 GET에서 null/빈값 확인 (테스트 후 실사용자 아바타 원상복구 필요 여부 확인 — 기존에 등록된 아바타가 있었다면 복원할 것, 없었다면 그대로 둘 것)
- 5MB 초과 파일이나 비이미지 파일 업로드 시 에러가 사용자에게 적절히 안내되는지(코드 리뷰 기준으로도 충분, 실제 대용량 파일 생성해서 테스트할 필요는 없음 — 백엔드 로직이 이미 검증된 기존 코드이므로 프론트가 에러 메시지를 잘 받아 보여주는지만 확인)

## Developer 기록


## Reviewer 기록


## QA 기록


## 최종 요약 (사용자용)

