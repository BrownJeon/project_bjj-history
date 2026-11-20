---
task_id: task-065
title: 흰 도복 동일 리그·두 캐릭터 트라이포드 스윕 샘플
status: done
stage: closed
quality_status: rig_contact_checks_passed
user_quality_approval: rejected
roles_involved: [main, worker, visual_reviewer, leader]
related_tasks: ["[[task-064-constrained-character-basics]]", "[[task-063-tripod-motion-remake]]", "[[task-055-character-concept-sheet]]"]
tags: [type/task, domain/character, domain/video, domain/adoption]
aliases: [두 캐릭터 제약 리그 트라이포드, ADP-014-C04]
created: 2026-11-11
updated: 2026-11-11
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "사용자 AI 영상 생성 도입·개선 폐기 결정에 따른 기록 종료. 추가 생성·설치·제품 통합·운영 변경 없음"
  last_event_id: exec-004
waiting: none
initiative_decision: reject
closed_at: 2026-11-11
previous_stage_at_closure: sample_prepared
---
# 두 캐릭터 제약 리그 트라이포드 스윕

> **현재 결론 (2026-11-11): 사용자 결정으로 AI 영상 생성 도입·개선을 폐기하고 `done / closed / waiting:none`으로 종료했다. 추가 품질 확인·시범·제품 통합 대기는 없다. 아래의 `pending`·`review`·`trial`은 당시 이력이며 이 종료 결정이 최신이다.**

## 사용자 요청·승인 범위
- “이제 흰 도복 캐릭터에도 같은 골격과 관절 제한을 적용하고, 업로드한 사진을 참고해서 두 캐릭터로 트라이포드 스윕 동작 샘플을 만들어줘. M4에서 추가 과금 없이 진행해줘.”
- task064의 파란 도복 원본 스킨/실제16본/16native제약 구조를 흰 도복에도 적용한다. 파랑 가드·흰색 서있는 상대 역할, 사진의 발목 그립·골반 미는 발·반대 다리 훅을 기준으로 제어/넘어짐/따라오기 샘플을 만든다.
- M4 기존 Rive/Pillow/FFmpeg만 재사용. 새 모델/툴·유료 API·클라우드 업로드·앱/DB/배포/원본 덮어쓰기 없음. 원본 이미지/기존 v1/skin-v2/실패샘플은 보존한다.
- 기존 골격의 각도는 기본 서기/얕은 스쿼트 시연용으로 고관절45..110°, 무릎0..80°, 팔꿈치-90..0°다. 구조/고정길이/관절 방향은 같게 두고 두 인물에 공통 트라이포드용 시연 각도 범위를 추가할지 async 질문했다. 명시 답 전에는 proposed 프로파일을 실제 동작/엔진에 적용하지 않는다. 독립 흰 캐릭터 준비는 기존 승인값으로 계속한다.

## 관련 이력·재사용
- [[task-064-constrained-character-basics]]: 16본 계층/16RotationConstraint·각도/길이/접지 검증, 승인 파란 도복 실픽셀 스킨10메시·원본리그/6498키 불변 PASS. 외형/자연스러움 사용자 승인은 pending이다.
- [[task-063-tripod-motion-remake]]: 사진기반 Rive/로컬 Wan 샘플이 인체/그래픽 품질로 반려됐다. 프레임별 이미지 재생성 대신 고정 리그·스킨·정해진 접촉/모션계획을 사용한다.
- search-first 읽기/현재세션 탐색 완료: task063 motion-spec/사진/메시 스키마·task064 스킨/고정리그/캡처/영상화 경로, 워크스페이스 공용 tools에 관련도구 없음, ADP014/015 trial 이력 대조. 새 의존성/외부 후보 설치는 없다. UI 작업이 아니므로 Taste/Impeccable 미적용.

## 역할·소유
- 메인: task/ACTIVE/board·사진/접촉/동작 계획·동일 리그 합성·M4 실행·영상화·전달.
- Worker: 지정 white-character 파츠/원본 스킨 준비와 baseline project만. 원본/task064 수정 금지.
- 모션 검토: 사진과 실제 프레임의 큰 구조/접촉/낙하 방향·가림 검토. 의학적 가동범위/품질 승인 대리 금지.
- 독립 검증: 두 인물 골격/제약·동작 각도/길이/접촉 수치/파일 해시를 실제 실행 근거와 분리하여 검산.
- 다른 작업자 변경을 되돌리지 않는다. 새 코드/파일은 task065 폴더에 둔다.

## 실행 도구·절차 이력
| 이벤트 | 날짜(KST) | 담당 / 절차 | 범위·근거 |
|---|---|---|---|
| exec-001 | 2026-11-11 | codex / codex_scoped | 사용자 두 캐릭터 트라이포드 명시제작 요청·사진/승인원본/기존리그 직접확인·재사용탐색. 새 시연 범위 결정은 질문하고 기존제약의 흰 캐릭터 준비 착수 |


## 공통 동작용 시연 범위 추가 승인
- 사용자 async 답변 “동작용 범위 추가 (권장)” 수신. 이전 답 대기는 해소이며 같은 승인을 다시 묻지 않는다.
- proposed 초안은 보존하고 실제 `reference/rig/task-065/tripod-profile.json`에 승인 근거를 기록한다. 고정 본 길이/계층·굽힘 부호는 유지, 공통 시연 각도: spine[-105,-50], neck[-25,25], head[-15,15], shoulder[30,210], elbow[-140,0], wrist[-30,30], hip[-30,120], knee[0,145], ankle[-145,-35]도(로컬). pelvis local rotation0; 전체 몸 방향은 별도 부모 Node transform으로 제어한다. 의학적 정상범위 정의가 아니다.
- 흰 캐릭터 준비 완료: 실제 native 기본4포즈/16본/16제약/6498키·원본profile/timeline불변검증. 자세한 파일/결과는 `reference/rig/task-065/white-character/README.md`, `baseline-integrity.json`.
- 사진에서 가려진 먼 손·관절의 정확한 위치는 추정이고, 세 접촉/착지 후 그립 유지·상체 따라오기까지만 짧은 샘플로 구성한다. 완전한 일어서기/패스·의료/교육용 정확도 보장 아님.

| 이벤트 | 날짜(KST) | 담당 / 절차 | 범위·근거 |
|---|---|---|---|
| exec-002 | 2026-11-11 | codex / codex_scoped | 사용자 공통 동작용 범위 추가 명시승인 수신·기존길이/굽힘방향보존·동일프로파일 적용/3접촉 모션 제작 착수. 흰baseline준비완료 |


## 1차 native/수치 검토 (제작 중)
- 승인된 공통 프로파일로 메인이 `plan_tripod.py`에서 양쪽16본/289키·12초24fps·3접촉 IK를 작성했다. 범위 안 pose만 사용하며 load→push/pull→controlled fall→follow로 구성한다. 골반/훅은5.25초 이후 회수하고 발목 제어는 끝까지 유지한다.
- M4 native 실제 review01 Clean/Rig 6포즈를 캡처했고 메인이 setup/push/fall/follow4장을 직접 확인했다. 얼굴/도복/동작이 실제두인물로 재생됐으며 source bone/skin/mirror가 연결됐다. source native/독립FK를 자연스러움 또는 사용자 품질승인으로 승격하지 않는다.
- 독립 FK의 최신중간수치: 32본/원키289+보간표본, 길이오차~1.42e-13px·범위0·접촉보간오차 grip~0.01674/hip~0.00322/hook~0.00590px(허용1.5px). 발 opaque침범0. 당시RML은그이후plan갱신전이라 키비교fail(stale)이며 최종재검증전 PASS로보고하지 않는다.
- wrap/mirror native강제시험 실제PASS: 부모rotation0.8rad/scaleX=-1,30..210°범위에서230°요청이210°기준과픽셀/SHA같음·230°무제한과다름.190°범위내는190°무제한과동일. `native-clamp-proof.json`에보존했다. matrix atan2 signed alias는현런타임결함으로재현되지 않았다.
- 발견·수정 중: blue도복자락 floor850아래~20px →의복 MeshVertex pose correction으로바닥에놓이도록수정중(본·UV·가중치/피부/머리변형없음). white최종머리opaque hull침범을피해최종rooty810→795로상향한계획을작성했다. 새로운프로파일변경아님·본길이/방향/공통각도범위는유지.
- 작업중파일/원본/v1/skin-v2보존,유료API/새모델/외부사진업로드/앱/DB/배포없음.


## 최종 제작·검증·전달 준비 (2026-11-11)
- **실제 결과**: 흰색/파랑 각16본·동일공통16native관절제약, 두캐릭터고정스킨으로사진기반12초24fps 트라이포드 동작을 만들었다. Setup/load/push-pull/controlled fall/follow/hold이며 골반/훅 접촉은5.25초 후 풀고 한 발목 제어를 유지한다. 완전한 일어서기/패스는 이번샘플에 포함하지 않는다.
- **정밀 표현 보완**: 열린손 대신 사진의 실제감싼손을hand_near 단일본에 연결,흰바짓단cloth만8px피팅·발목노출,원본baselinePNG/본/발피부불변. Hookfoot후경·white앞발전경 등3개정적깊이예외와freelegs/whitefarfoot회수경로를조정했다. 새모델/프레임AI생성없음.
- **옷/바닥**: 의복5종레이어만양자화LBS역변환으로world y<=850에놓이게보정(275정점·양artboard317900 xy키). 본/UV/weights/PNG/손발/머리는불변이고불투명매트로가리지않았다. 최대world압축44.453px는투명PNG마진정점까지포함한다. 생성기projection오차2.27e-13px이며동적물리/clothalpha전체연속접촉인증은아니다. Actualnative review02/03에서기존자락침범해소확인.
- **독립 검증 PASS/실패0**:32본/2305표본(289원키+8분할),길이오차1.56e-13px·부모0·각도범위0·mirror굽힘부호정합. 접촉보간최대grip0.015903/hip0.003220/hook0.005847px(1.5px기준)·키접촉2.54e-13px. 손/발/머리opaquealpha 매트침범0. 추상solemarker/실제alpha와cloth보정검사는분리했다. RML본/32제약/10982본·전체변환키 perartboard대조PASS,clothxy키는따로집계·보호부위keys없음. ActualfinalRig FKpoint색상근접 최대white0.707/blue0.787px·미매칭0.
- **Native 강제 제한 PASS**: 반사부모(scaleX=-1/rotation0.8)30..210°에서230°요청은210°기준과픽셀/SHA동일·230°무제한과다름. 범위내190°는190°무제한과동일. 영수증 native-clamp-proof.json. 새양의각도범위의signedalias오류는재현되지않았다.
- **Actual M4전체 렌더**: AppleM4Pro/24GiB·RiveCLI1.9.2, Clean/Rig각288PNG/총576/76.919초. 1280×1010 H264·24fps·12초 MP4 2개/미리보기GIF·PNG3개,합성인코딩15.709초·두영상전체decode오류0. 고정crop/한국어단계·속빈접촉링/루프경계fade만후합성,캐릭터모션변형없음.
- **CLI 검사**: nativeverify종료0. inspect error0/warning56(interpolated-step):착지후hold로들어가는촘촘한선형의복정점키에대한계단형의도시hold를쓰라는안내다. 이번은연속선형변화가의도여서hold키로바꾸거나경고를숨기지않았고문제0으로표시하지않는다. 상세원문은최종검증JSON에보존.
- **실제 시각 검토**: 메인native3차setup/push/follow/Rig와최종6단계영상contact sheet확인. 독립정지4포즈검토에서큰사지분리/역꺾임/제3손발/큰옷구멍없음·감싼그립과4발구분개선. 먼다리훅의정확한발등접촉은고정측면가림한계가남아Rig/3번표시함께제공. 전동영상실시간독립재생·교육용/의학/자연스러움사용자품질승인은미확인이다.
- **전달 무결성**: 7산출물원격/로컬SHA일치·원본ZIP68파일무결성/6핵심소스·20nativePNG/3원본이미지SHA대조PASS. 로컬검산계획과실제M4계획은절대경로문자열만다르고모든숫자pose/contact는동일함을포장때직접대조했다. RML/계획/profile/최종검증기록·README를포장후바이트대조했다.
- 상태 `review / sample_prepared`, 사용자품질확인대기. M4기존도구만사용·추가유료API/계정/새모델/클라우드/앱/DB/버전/운영/배포/commit/push없음. 원본/task063/task064/흰baseline보존·Rive정식채택미결정.

## 최종 산출물
- 로컬 `/Users/brownjeon/.codex/artifacts/bjj-t065/final-01/`.
- `tripod-sweep.mp4`(1,158,223bytes·SHA `96fe29ca29162b2a466dfab144618d511b44a07976331beb1badacc22d04492e`), `tripod-rig.mp4`(1,433,041bytes), `preview.gif`(5,007,180bytes), `poster.png`, `rig-poster.png`, `contact-sheet.png`.
- `tripod-rml-source.zip`(9,119,254bytes·SHA `13fabe5b8e15406faa2819da51e87d5b44f13e8e6929cdd3cd4aca2393dc0d46`,68파일). `.riv` export/Editor import 미검증인RML native원본이다.
- Source scene SHA `c4e6014f51f67a6dd5d8a26ee7cc0ffc88ffe1e96fcda5518df5903bbbcb7494`,검산plan SHA `a9333e8b666b6a3e72836587f7f1a2813156d626948058bbbaf6c8f555dc30be`.
- 정본 `docs/verification/task-065-constrained-tripod.json`; 소스/재현 `reference/rig/task-065/README.md`; 독립검증/런타임/클램프영수증은artifact폴더와ZIP에보존. 기술원리는사용자사진과[Stephan Kesting 설명](https://www.grapplearts.com/the-bjj-self-defense-experiment/)을대조했고외부영상다운로드/재사용없음.

| 이벤트 | 날짜(KST) | 담당 / 절차 | 범위·근거 |
|---|---|---|---|
| exec-003 | 2026-11-11 | codex / codex_scoped | 사용자승인범위의두캐릭터골격/접촉모션·M4native576프레임·MP4/GIF/RML준비완료. 독립FK/RML/실제pixel/clamp/codec/7전달SHA/ZIP검증완료,56선형cloth키warning및측면훅가림을별도명시. 사용자품질승인pending |


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
| exec-004 | 2026-11-11 | codex / codex_scoped | 사용자 샘플 확인 후 AI 영상 생성 폐기 명시 지시 수신·도입 미채택/작업 종료 기록. 기술 검사 이력 보존·추가 생성/앱/DB/배포 없음 |
