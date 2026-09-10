---
name: task-032-instagram-cookie-session-validation
aliases: ["인스타쿠키", "AI분석실패", "sessionid"]
tags:
  - type/task
  - domain/backend
  - domain/frontend
  - domain/clips
related_tasks:
  - "[[task-006-ytdlp-403-fix]]"
status: done
created: 2026-09-10
updated: 2026-09-10
---

# task-032 — 참고영상 AI 분석 실패: 쿠키 파일은 있는데 로그인 세션이 없었다

## 사용자 보고

> 지금 참고영상 메뉴에서 AI분석시 실패되는데 해당건에 대한 원인 확인해서 수정해줘

## 진단 — 무엇이 아니었나 (먼저 배제한 것들)

로그에 여러 실패 유형이 섞여 있어 하나씩 배제했다.

| 후보 | 실측 결과 | 판정 |
|---|---|---|
| yt-dlp 노후화 | 설치본 `2026.08.19` = **PyPI 최신과 동일** | ❌ 아님 |
| yt-dlp 주간 cron 미동작 | 로그에 `08-23 / 08-30 / 09-06 OK no-change` — 정상 동작 | ❌ 아님 |
| yt-dlp PATH 유실(task-030 D-2) | `YTDLP_BIN` 절대경로 해석 정상 동작 중 | ❌ 아님 |
| claude CLI 장애 | `claude --print` 정상 응답(종료코드 0) | ❌ 아님 |
| Instagram 릴 다운로드 불가 | 릴(clip 174) `--simulate` **성공**(쿠키 유무 무관) | ❌ 아님 |

## 진짜 원인 — 쿠키 파일에 `sessionid`가 없다

실제로 실패한 건 **clip 179**, URL이 `instagram.com/stories/...`(**스토리**)다.

```
$ yt-dlp --simulate --cookies <쿠키파일> "<스토리 URL>"
ERROR: [instagram:story] This content is unreachable.
       Use --cookies-from-browser or --cookies for the authentication.
```

쿠키 파일에 든 항목: `csrftoken, ds_user_id, mid, ig_did, datr, rur, _ga, NID, GeoIP, WMF-Uniq …`
→ **`sessionid` 0건**. 즉 로그아웃 상태에서 내보낸 쿠키다. Instagram 입장에서는 비로그인과 동일하다.

**릴은 로그인 없이도 받아지기 때문에 평소엔 티가 나지 않다가, 로그인이 필수인 스토리에서만 터졌다.** 이것이 원인 파악을 어렵게 만든 구조다.

## 코드 결함 — 화면이 거짓말을 하고 있었다

`hasCookieFile()`은 **파일 존재 여부만** 본다. 그래서:

- `ClipEditor.jsx` → **"✓ Instagram 쿠키 인증됨 — AI 분석 가능"** 표시
- `ProfilePage.jsx` → **"✓ 파일 인증"** 배지
- 실제 분석 → `"Instagram 영상은 로그인 인증이 필요하여 다운로드가 불가합니다"`

사용자는 쿠키를 올렸고 화면도 인증됐다는데 분석은 계속 "인증 필요"로 실패한다. **어디가 잘못됐는지 알 방법이 없었다.**

## 수정

1. **`inspectInstagramCookie(path?)` 신설**(`videoAnalysis.js`) — Netscape 쿠키에서 `instagram.com` 도메인의 `sessionid`를 찾아 만료까지 확인. 결과: `ok / none / no-session / expired / unreadable`.
2. **실패 메시지 구체화** — "인증이 필요합니다"에서 끝내지 않고 **왜**(세션 없음/만료/파일 없음)와 **무엇을 해야 하는지**를 함께 준다. 스토리에서 실제로 오는 문구 `content is unreachable`도 감지 패턴에 명시(문구가 바뀌면 조용히 빠지므로).
3. **`GET /settings/instagram-cookie`** — `sessionValid`·`sessionReason`·`sessionExpiresAt`·`hint` 추가.
4. **`POST /settings/instagram-cookie`** — 세션 없는/만료된 파일은 **저장 전에 400으로 거부**. 저장해봐야 "인증됨"이라는 거짓 상태만 만든다.
5. **화면** — 배지를 세션 유효성 기준으로. 세션이 없으면 "⚠ 세션 없음" + 안내문.

### ⚠️ 일부러 바꾸지 않은 것 — 릴 분석 회귀 방지

`igCookieConfigured`(분석 시도 게이트, `ClipEditor.jsx:74·291`)와 `hasInstagramAuth()`(`clips.js:32·185`)는 **그대로 뒀다.**

이걸 세션 유효성 기준으로 바꾸면 **지금 잘 되는 공개 릴 분석까지 전부 차단된다.** 릴은 로그인 없이도 다운로드되므로 시도를 막을 이유가 없다. 게이트는 유지하고 **표시와 메시지만 정직하게** 만들었다.

## 검증

**쿠키 판정 함수 — 6/6 통과** (합성 파일, 양성 대조 포함):

| 케이스 | 기대 | 결과 |
|---|---|---|
| 유효한 sessionid | ok | ✅ |
| 만료된 sessionid | expired | ✅ |
| sessionid 없음(현재 상황) | no-session | ✅ |
| 세션쿠키(만료 0) | ok | ✅ |
| 다른 도메인의 sessionid | no-session | ✅ |
| 파일 없음 | none | ✅ |

**API 실측** — 세션 없는 파일 업로드 → 400 거부(원본 md5 불변), 만료 파일 → 400 + 만료일, **유효 파일 → 200 수락**(양성 대조), 원본 복원 후 md5 일치.

**실제 분석 경로** — 스토리 URL로 `analyzeVideo()` 직접 호출:
```
Instagram 영상 다운로드에 로그인 인증이 필요합니다.
저장된 Instagram 쿠키에 로그인 세션(sessionid)이 없습니다 — 로그아웃 상태에서 내보낸 파일입니다.
Instagram에 로그인한 브라우저에서 쿠키를 다시 내보내 올려주세요.
```

**회귀** — `hasInstagramAuth()` 여전히 `true`, 앱과 동일한 인자로 릴 `--simulate` 종료코드 0, 배포 번들에 새 문구 반영. 사용자 쿠키 파일은 백업 후 복원(md5 동일).

## 사용자가 해야 할 일 — 코드로는 해결 불가

**스토리·비공개 게시물을 분석하려면 로그인된 Instagram 세션 쿠키가 필요하다.** 이건 자격증명이라 코드가 대신 만들 수 없다.

브라우저에서 Instagram에 **로그인한 상태로** 쿠키를 Netscape 형식으로 내보내 프로필 > Instagram 쿠키 인증에 올리면 된다. 이제 `sessionid`가 없으면 업로드 시점에 즉시 거부되므로, 잘못된 파일을 올리고 나중에 헤매는 일은 없다.

공개 릴은 지금도 정상 분석된다.

## 남은 것

- `FIREFOX_PROFILE_DIR`(`/home/brownjeon/.mozilla/firefox`)가 이 서버에 없어 Firefox 폴백은 사실상 죽은 경로다. 화면에는 여전히 "Firefox 자동" 선택지가 보인다. 이번 범위 밖.
