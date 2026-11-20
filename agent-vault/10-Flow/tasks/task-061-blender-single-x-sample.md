---
task_id: task-061
title: M4 Blender 로컬 싱글엑스 가드 시연 샘플
status: done
stage: closed
user_quality_approval: not_pursued
roles_involved: [leader, worker, gym-master]
related_tasks: ["[[task-060-rive-class-video-review]]", "[[task-055-character-concept-sheet]]"]
tags: [type/task, domain/video, domain/character]
aliases: [Blender 샘플, 싱글엑스 가드 시연]
created: 2026-11-10
updated: 2026-11-11
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "사용자 AI 영상 생성 도입·개선 폐기 결정에 따른 기록 종료. 추가 생성·설치·제품 통합·운영 변경 없음"
  last_event_id: exec-005
waiting: none
initiative_decision: reject
closed_at: 2026-11-11
previous_stage_at_closure: sample_prepared
---
# M4 Blender — 싱글엑스 가드 샘플

> **현재 결론 (2026-11-11): 사용자 결정으로 AI 영상 생성 도입·개선을 폐기하고 `done / closed / waiting:none`으로 종료했다. 추가 품질 확인·시범·제품 통합 대기는 없다. 아래의 `pending`·`review`·`trial`은 당시 이력이며 이 종료 결정이 최신이다.**

## 목표와 승인 범위
- 사용자: “Blender로 기존 파란 도복·흰 도복 캐릭터를 활용해서 짧은 기술 시연 샘플을 만들어줘. M4에서 추가 과금 없이 진행해줘.”
- 추가 질문에서 “싱글엑스 가드 진입·유지”를 사용자 확정했다. 파랑=서 있는 역할, 흰색=아래 가드 역할은 승인된 기존 참고 자세와 동일하게 사용한다.
- 유료 API·유료 자산·외부 AI 생성 서비스 없이 M4 로컬 Blender로 제작한다. 필요한 무료 공식 Blender 환경 준비와 격리된 샘플 스크립트·.blend·영상 산출물을 범위에 포함한다.
- 앱/운영 서버 설정·DB·서비스 재시작·APK·배포는 범위에 없다. 앱 버전 증가는 없다. 기존 캐릭터 원본은 보존하며 기존 승인 DB 등록을 다시 수행하지 않는다.
- 실제 3D 모델이 없으므로 원본 외형을 참고한 샘플 모델·관절 동작을 새로 만든다. 원본 그림과 완전히 같은 완성형 캐릭터 또는 교육용 기술 정확도 검증 완료로 과장하지 않는다.

## 관련 과거 이력 요약
- [[task-055-character-concept-sheet]]: 파랑/흰 도복·갈색 벨트 캐릭터 원본과 싱글엑스 참고 자세가 승인되어 DB에 보존됨. 실제 모델/rig는 없음.
- [[task-060-rive-class-video-review]]: MP4 로컬 무과금 후보로 Blender+동작 템플릿 권고. M4 성능과 실제 출력 품질은 당시 미검증.

## 실행 도구·절차 이력
| 이벤트 ID | 시각(KST) | 사건 | 이전 → 현재 담당 / 현재 절차 | 범위·남은 일 | 근거 |
|---|---|---|---|---|---|
| exec-001 | 2026-11-10 16:54 | start | 없음 → codex / codex_scoped | 원본6개 해시 일치·기술 사용자 확정. Ubuntu 경유 기존 SSH 권한으로 M4 arm64 접속 확인, 격리 제작 준비 | 현재 사용자 제작 지시 및 기술 선택 답변 |
| exec-002 | 2026-11-10 17:01 | resume | codex → codex / codex_scoped | 사용자 한도 초기화 후 재개. Worker가 코드 저장 전 한도로 중단됐음을 확인하고 같은 범위 재개. 무료 공식 Blender4.5.15·시험렌더 완료 보존 | 사용자 “한도 초기화했으니 작업 이어서 진행해줘”, M4 setup/EEVEE 영수증 읽기 |
| exec-003 | 2026-11-10 17:06 | authoring_review | codex → codex / codex_scoped | 초판 M4 EEVEE4프레임2.795초 렌더. 메인/관장 육안에서 분절된도복·원본과다른머리·SLX그립/훅가림 발견, 보완 중 | review-01 PNG4·pose-metadata·render-job, 보조관장 실제프레임보고 |
| exec-004 | 2026-11-10 17:25 | sample_prepared | codex → codex / codex_scoped | 연속mesh/머리·카메라/접촉·진입보완 후 M4 288프레임93.62초·MP4/GIF생성/전체decode/독립파일재열기/전달해시확인. 사용자품질승인전, 앱연결없음 | final-01 영수증·4단계 실제MP4캡처·docs/verification/task-061-blender-sample.json |

## M4 준비·실행 근거 (메인)
- 실제 하드웨어: Apple M4 Pro / 25,769,803,776 bytes(24GiB) / macOS26.3, arm64. 기존 Ubuntu SSH 경유로 접근하며 인증/키를 변경하지 않았다.
- 무료 공식 Blender4.5.15 LTS arm64 DMG 311,921,946bytes를 M4에서 다운로드했다. 공식 SHA256 파일과 `bfbc0bda099d1ab7aef0992a584f872f58bed9bb491210ad45f9ca071aa2e688` 일치, codesign `--verify --deep --strict` 종료0.
- 사용자 전용 설치: `/Users/brownjeon/.local/share/bjj-blender/tools/blender-4.5.15/Blender.app`.
- EEVEE headless 기본장면256px 1프레임 렌더 종료0·PNG존재, 기동포함6.05초. 샘플 캐릭터 장면 성능이나 품질의 증거는 아니다.
- `/opt/homebrew/bin/ffmpeg`와 `ffprobe`가 기존 설치되어 있음을 확인했다. 추가 패키지/플러그인·유료 API/자산 사용은 없다.
- 출력은 M4의 `.local/share/bjj-blender/task-061/`와 로컬 전달 폴더 `.codex/artifacts/bjj-t061/`에 격리한다. 앱/DB/서비스 재시작 없음.
- 관장 보조 사양 수신: 발목 접촉 유지 → 흰색 골반이 파랑 포획다리 아래 진입 → 바깥발뒤꿈치 같은쪽 골반/안쪽발 허벅지뒤 훅 → 두 무릎으로 한 다리 감싸 유지. 원본 그림에서 가려진 안쪽훅/손 위치는 별도 확인 필요, 교육용 정확도 PASS가 아니다.

## 샘플 작성·미리보기 (메인 수신 기록)
- Worker가 `reference/blender/task-061/make_sample.py`·README 초판을 작성하고 구문검사를 보고했다. 메인은 스크립트 전체를 읽어 외부 API/자산/실행 다운로드가 없음을 확인하고 M4에 복사했다.
- 초판 스크립트 22,101bytes / SHA256 `c563705d9ba09432038e7f355b29c1d2f9ae260913599ecf0e9ad0d34b800009`는 로컬 전달폴더 review-01에 보관했다.
- EEVEE60%/16samples의 frame1/72/144/240 실제 렌더 종료0·4PNG 생성, 전체2.795초. 메인이 4장을 직접 확인했다.
- 메인 발견: 분절 구형관절로 인형 같은 도복, 원본과 차이가 큰 머리, 매트 접촉 보완 필요. 보조 관장이 실제 frame1/240을 보고 그립 식별 어려움·한 다리감싸기 불명확·골반/허벅지 훅 가림을 지적했다.
- Worker에게 연속된 웨이트 mesh 소매/바지·머리/얼굴·관절/카메라/접촉 보완을 배정했다. 초판을 품질 통과나 완성품으로 처리하지 않는다.

## 최종 샘플과 작성자 확인
- Worker 수정본에서 두 bone armature와 blended weights의 연속 소매/바지, 긴 앞/옆/뒷머리, 도복 직물 표면과 발목 높이를 적용했다. 메인이 실제 review-02 PNG4를 확인했다.
- 메인은 관장 지적을 받아 바깥발-골반과 안쪽훅 target·무릎·손 위치를 추가 조정하고, 시작 자세를 옆으로 비켜 앉아 몸을 돌린 상태에서 포획다리 아래로 들어가도록 보완했다. review-03/04를 재렌더링했다. 이 사양 보조는 교육용 정확도 검증 PASS가 아니다.
- 최종 소스 SHA256: `6bb9eb1fdf25565acb844f3c63980a3d7c052ccd43108fd4a3c410a9a5557478`.
- M4 EEVEE24samples·960x720 장면, 24fps·288프레임/12초 전체 작업 종료0·93.62초(추가 미리보기4장 포함).
- 같은 M4의 기존 FFmpeg/Pillow로 한글 4단계 자막과 상하 여백을 더해 960x960 H.264/yuv420p·무음 MP4, GIF·poster를 생성했다. 인코딩/미리보기 생성2.032초. 기존FFmpeg에 drawtext/libass가 없어 설치를 바꾸지 않고 기존Pillow PNG overlay를 사용했다.
- 인코더를 전체프레임 완성 전 호출한 최초 시도는 사전 assert에서 차단됐으며, 렌더 종료0/288프레임 완료 후 재실행해 성공했다. 미완성 영상은 전달하지 않았다.
- 실제 전달 MP4의 0.5/3.5/5.5/8.5초를 M4에서 캡처한 4단계 contact sheet와 poster를 메인이 직접 확인했다. 전체 FFmpeg decode 오류0, ffprobe 12초/24fps/288프레임/960x960/H.264 확인.
- `.blend`를 M4에서 자동실행 비활성화로 다시 열어 종료0·armature8·frame1~288·작성된동작·Python frame handler0·상대 렌더 경로를 확인했다. 외부 텍스처나 Python 프레임 handler 없이 저장된 장면이다.
- MP4/.blend/poster/GIF/pose/build-info 6개 전달 파일의 로컬 bytes/SHA256가 M4 영수증과 모두 일치한다. 생성서비스/유료API/유료자산 호출0, 앱/DB/운영 변경0. 앱 버전 증가 없음.
- 검증 정본: `docs/verification/task-061-blender-sample.json`. 실제 원본 캐릭터 PNG와 같은 완성형 외형·정밀 손그립·접촉/압박·충돌 없음·교육용 정확도는 승인/검증하지 않았다.

## 전달 파일
- 로컬 전달 폴더: `/Users/brownjeon/.codex/artifacts/bjj-t061/final-01/`.
- `single-x-guard-sample.mp4`: 634,415bytes, SHA256 `99156fa770e3b41747d17eed1ed919324a5022e29a2dc812ceee60021d5916f0`.
- `single-x-guard-sample.blend`: 8,828,821bytes, SHA256 `fa7bdf685ad84f9db6fea593eeb1748f1e48b43a29582e5bd0c08e7079b75745`.
- `preview.gif`: 1,002,857bytes. `poster.png`, `contact-sheet-stages.png`, `pose-metadata.json`, `delivery-receipt.json`, `blend-reopen.json` 보관.
- 재현 코드: `reference/blender/task-061/make_sample.py`, `m4_bridge.py`, `run_m4_job.py`, `encode_m4_sample.py`, README.
- M4 원본/프레임/장면: `/Users/brownjeon/.local/share/bjj-blender/task-061/final-01/`.

## 최종 요약 (사용자용)
- **상태**: 요청한 짧은 샘플 제작 완료. 사용자 외형·동작 품질 승인 전이다.
- **무엇이 바뀌었나**: 승인된 파랑/흰 도복 원본을 참고한 간소화3D 캐릭터와 싱글엑스 진입·유지 12초 영상, 수정 가능한 Blender 파일을 만들었다.
- **배포**: 없음. 앱/DB/운영·기존 AI 서비스/버전은 변경하지 않았다.
- **AI 확인**: M4 렌더·실제4단계영상캡처·전체decode·프레임수/규격·Blender재열기·전달해시 확인. 정식 앱 QA/외부 Claude 검토는 skipped(이번 산출물은 격리 샘플). 교육용 기술 정확도 PASS 아님.
- **사용자 확인**: MP4·GIF·.blend 전달 준비. 품질 피드백은 아직 받지 않았다. Codex 열기 도구는 queued 응답이며 실제 사용자 시청 완료로 처리하지 않는다.
- **사용자 결정**: Blender/M4 무과금·싱글엑스 진입·유지 선택은 이미 확정. 이후 앱 연결이나 생산용 모델/기술 라이브러리 채택은 이번 범위가 아니다.
- **남은 일**: 이번 샘플 파일 제작 범위에는 없음. 외형·그립/접촉의 정밀 제작과 앱 연결은 별도 후속 범위다.
- **이슈**: 처음 두 프리뷰의 외형/접촉 문제를 수정했으나 단순 모델의 손그립·접촉/압박과 원본 얼굴 재현에는 한계가 남는다. 유료 생성 API/자산은 쓰지 않았다.

## 역할별 범위
- 메인: M4 환경/격리 실행·결과 프레임 육안 점검·전달·문서 상태 관리.
- Worker: 지정된 Blender 샘플 스크립트만 작성. 운영 앱 코드·원본 자산 변경 금지.
- Gym-master: 싱글엑스 가드 진입·유지 사양과 핵심 자세 확인만. 개인 DB/수업 기록 조회 불필요.
- 실제 독립 앱 QA/운영 배포는 이번 샘플의 단계가 아니다.


## 사용자 AI 영상 생성 폐기·작업 종료 (2026-11-11)
- 사용자 원문: “샘플영상을 보니까 AI영상 생성에 대해서는 폐기하고 작업 완료해줘.”
- 최신 결정: AI 영상 생성의 Rive/Wan/Blender 도입·개선 시범을 더 진행하지 않고 관련 task-060~065를 종료한다. 기존 기술 검증/생성 성공 이력은 보존하며 이를 사용자 품질 승인이나 제품 채택으로 바꾸지 않는다.
- 도입건 ADP-014(Rive), ADP-015(Wan)는 `trial → reject`, 적용사례는 `no-go`다. 정식 도입한 제품을 철거한 것이 아니므로 `retire`로 표시하지 않는다.
- 원본 캐릭터·정지 기술 이미지(task-055/058)·업로드 사진·기존 영상/리그/검증 기록과 M4 설치환경은 보존한다. 파일 삭제·모델 제거·기존 서비스 중지·수업/체인 영상 UI/API 삭제는 이번 종료 작업에서 수행하지 않았다.
- 추가 영상 생성·모델 다운로드·품질 재검토·제품 통합 작업은 종료, `waiting: none`. 새 사용자 지시 없이 재개하지 않는다.
- 이번 변경은 작업/도입 기록 정리뿐이다. 앱/백엔드/DB/버전/배포/commit/push 변경 없음. 이전 전달물·검증 JSON·ZIP은 생성 당시 증거로 유지한다.
- 연계 종료 정본: [[task-065-constrained-tripod-two-characters]] · `docs/verification/task-065-ai-video-closure.json`.

| 이벤트 | 날짜(KST) | 담당 / 절차 | 범위·근거 |
|---|---|---|---|
| exec-005 | 2026-11-11 | codex / codex_scoped | 사용자 샘플 확인 후 AI 영상 생성 폐기 명시 지시 수신·도입 미채택/작업 종료 기록. 기술 검사 이력 보존·추가 생성/앱/DB/배포 없음 |
