---
task_id: task-063
title: 업로드 트라이포드 스윕 사진 기반 모션 재제작
status: done
stage: closed
quality_status: rejected
user_quality_approval: rejected
roles_involved: [leader, worker, gym-master]
related_tasks: ["[[task-062-rive-2d-single-x-sample]]", "[[task-061-blender-single-x-sample]]", "[[task-060-rive-class-video-review]]"]
tags: [type/task, domain/video, domain/character, domain/adoption]
aliases: [트라이포드 스윕 모션, ADP-014-C02, ADP-015-C01]
created: 2026-11-10
updated: 2026-11-11
execution_context:
  schema_version: 1
  origin_tool: codex
  current_tool: codex
  current_procedure: codex_scoped
  current_scope: "사용자 AI 영상 생성 도입·개선 폐기 결정에 따른 기록 종료. 추가 생성·설치·제품 통합·운영 변경 없음"
  last_event_id: exec-009
waiting: none
initiative_decision: reject
closed_at: 2026-11-11
previous_stage_at_closure: constrained_rig_feasibility_reviewed
---
# 트라이포드 스윕 모션 재제작

> **현재 결론 (2026-11-11): 사용자 결정으로 AI 영상 생성 도입·개선을 폐기하고 `done / closed / waiting:none`으로 종료했다. 추가 품질 확인·시범·제품 통합 대기는 없다. 아래의 `pending`·`review`·`trial`은 당시 이력이며 이 종료 결정이 최신이다.**

## 사용자 요청·승인 범위
- 사용자: “움직임이 더 부자연스러워졌는데 차라리 트라이포드 스윕 기술에 대한 설명과 업로드한 사진을 바탕으로 다시 만들어줘. 움직임을 자연스업게 모션으로 생성해줘”.
- 직전 [[task-062-rive-2d-single-x-sample]]의 파츠 절단면·관절/가림 표현에 대한 사용자 품질 반려를 수신했다. 기술을 싱글엑스에서 트라이포드로 변경하고 사진처럼 **파랑 guard / 흰 standing**으로 역할을 변경한다.
- 기존 M4 로컬·추가 유료 서비스 없음·원본 보존 조건을 유지한다. 앱/DB/배포·계정/결제·외부 AI 자산 업로드는 수행하지 않는다.
- 업로드 PNG를 새 작업 경로에 복사했고 M4 소유 서버로만 전달했다. 원본·복사본·M4 SHA256은 `a6e99ea8eab51254a3d5f53127904d91c22733ef3f55a22d90752c4b9770435d`, 1,703,597bytes다. 원본과 manifest: `reference/motion/task-063/source/`.

## 실행 도구·절차 이력
| 이벤트 ID | 시각(KST) | 사건 | 담당 / 절차 | 범위·남은 일 | 근거 |
|---|---|---|---|---|---|
| exec-001 | 2026-11-10 18:20 | start | codex / codex_scoped | 사진 관절·접촉점/기술 원리 확인, 실제 Rive image mesh와 기존 M4 영상 모델 가용성 읽기 확인 | 현재 사용자 재제작 요청·사진 |
| exec-002 | 2026-11-10 18:44 | waiting_local_model_decision | codex / codex_scoped | 실제 연속mesh 2차 렌더도 큰 스윕의 도복/가림 시각 품질 미달. 기존 SVD도 첫단계 MPS OOM. 새 로컬 Wan Q4 별도설치/17.14GB 선택다운로드 여부 사용자 답변 대기 | 실제프레임·native inspect·SVD 영수증·공개 model metadata·async 질문 |
| exec-003 | 2026-11-10 19:08 | wan_local_setup | codex / codex_scoped | 사용자 새 로컬 설치/재생성 명시 승인 수신·독립3.12venv 생성·pinned runtime/model 헤더 호환성 감사. 호환 확인 뒤 선택5파일17.14GB다운로드/사진I2V | async 답변 “M4에 별도 설치 후 재생성 (권장)”·preflight |
| exec-004 | 2026-11-10 19:20 | wan_local_generation | codex / codex_scoped | pinned runtime독립설치/pipcheck통과·모델5개17.14GB/LFS SHA전부일치·MLX0.32.4 GPU/로컬tokenizer확인·BF16T5실행시작 | install/download/compatibility영수증·실제importprobe |
| exec-005 | 2026-11-10 19:28 | wan_quality_iteration | codex / codex_scoped | native첫영상81f/384/12step·235.115초/decode0생성성공,시각상제3머리/몸복제로FAIL. 두번째97f/448/40step·단순2D/2인유지/방향prompt로재생성중 | candidate-01 실제contactsheet/MP4/receipt·candidate-02계획 |
| exec-006 | 2026-11-10 19:48 | wan_framing_refinement | codex / codex_scoped | 2차97f/448/40step·964.091초/decode0·큰인물복제개선,부유/착지/가림미달. 원본그대로우측착지공간추가/매트지지prompt·3차512×384/97f/40step실행 | candidate-02실제contactsheet·관장검토·wide-input해시/03plan |
| exec-007 | 2026-11-10 20:13 | local_motion_sample_ready | codex / codex_scoped | 3차97f/512×384/40step·975.753초/decode0·표본24+마지막프레임메인/관장검토. 실험MP4/GIF준비/전달4해시일치. 정밀접촉/사지형상한계·사용자품질미확정 | final-03영수증·검증JSON·실제프레임 |
| exec-008 | 2026-11-11 | constrained_rig_feasibility_reviewed | codex / codex_scoped | 사용자 Wan 인체/그래픽 붕괴 피드백·사전골격/관절+모션설명방식 가능성질문. 기존코드/공식 IK·회전제약·Bones·DataBinding 대조, 제약리그+동작계획 구성 제안. 신규제작/설치/생성 미실행 | 현재 사용자 피드백·공식문서·generate_rive/prepare_motion 직접확인 |

## 제작 방향·확인 항목
- 세 접촉점을 연결해서 골반 push·발목 pull·반대발 hook이 같은 구간에 작용하도록 구성한다. 관절 각도 연속성만으로 자연스러움을 판정하지 않는다.
- [원저자 Stephan Kesting의 트라이포드 설명](https://www.grapplearts.com/the-bjj-self-defense-experiment/)에서 골반 위 발·한쪽 발목 제어·반대 다리 훅을 동시에 밀고 당기는 원리를 확인했다. 자료 영상을 다운로드하거나 재사용하지 않는다.
- 사진에서 가려진 반대 손·관절은 추정과 확인을 구분한다. 사진 한 장에 없는 뒷면·옷감·착지 자세를 원본 증거로 주장하지 않는다.
- Worker는 실제 Rive mesh schema 가능성 조사, Leader는 M4 기존 모델/패키지/메모리 읽기 확인, 관장은 사진 접촉점·기술 단계·큰 오류 검토. 메인은 자산·모션·M4실행·실제 결과 검증과 기록을 맡는다. 조사 지시는 생성/설치/서비스 변경 권한으로 확대하지 않는다.
- 앱/UI 작업이 아니므로 Taste/Impeccable 적용 대상 아님. 사용자 제공 이미지 자산의 로컬 모션 작업으로 기록한다.

## 상태
- **현재: 로컬 모션 실험 샘플 전달 준비·검토 상태**. 3차 영상은 생성·파일검증을 마쳤다. 정밀 그립/훅·생성 사지 형태·교육용 기술 정확도는 미확인/보완 필요이며 사용자 품질 승인은 받지 않았다. 자연스러운 완성 교육 영상으로 통과시키지 않는다.

## 실제 실행·품질 결과
- 사진의 세 접촉점과 원저자 설명을 확인했다. `motion-spec.json`·`tripod-prompt.txt`에 역할/스윕원리/5단계/품질 기준을 준비했다. 가려진 반대 손을 새 그립이라고 표시하지 않는다.
- 실제 RiveCLI 1.9.2 스키마의 Image→Mesh→Vertex/Weight·Skin/Tendon을 사용했다. Worker가 비영점 bind각도를 포함한 최소2본/6정점 예제를 실제 렌더해 CPU예측과 UV/픽셀 경계 일치를 확인했다. 이 최소 예제 통과는 최종 화질 통과가 아니다.
- 메인이 원본 파생 연속 레이어8개/본22개·pose241개(30fps/8초설계)를 작성했다. 보이지 않는 작은 도복 부위는 원본 텍스처로 보충했으며 그 부분은 사진의 실제 자세 증거가 아니다. IK 길이 변화 최대 약2.84e-13px·인접회전 최대0.07610rad였지만 이것으로 자연스러움을 통과시키지 않았다.
- `review-01`, `review-02` 각각 실제 Rive 7프레임을 생성하고 메인이 낙하/마무리 프레임을 직접 확인했다. review-02 inspect는 Mesh8/Skin8/Tendon27/Weight4951/RootBone22, 문제0이다. 그러나 도복/허리의 구멍·떠 있는 텍스처 조각·가려진 다리의 부자연스러운 변형이 남아 **시각 품질 FAIL**이다. 전체 영상 인코딩/최종 전달로 진행하지 않았다.
- 기존 M4 SVD캐시의 격리 추론을 실행했다. 512×512 전체인물 letterbox·14프레임/12step·fp16/MPS sequentialoffload/decode1·offline·600초 제한으로 시작해 **33.306초, 첫 denoise/완료0step에서 MPS OOM**으로 실패했다. 새 다운로드·설치·상한 해제·우회·재시도 없음. 영상/프레임 생성0. 기존 Python/Ollama/Redis PID 유지·프로세스 종료 뒤 메모리여유90%를 읽었지만 운영 응답/성능 무영향을 검증한 것은 아니다.
- 원본과 이전 샘플 보존. 유료API·외부AI 사진업로드·앱/DB/운영 변경 없음.

## 구체적 다음 제안·답변 대기
- 후보: [Wan2.2-TI2V-5B MLX Q4](https://huggingface.co/SceneWorks/wan2.2-ti2v-5b-mlx), 실행기 [Blaizzy/mlx-video](https://github.com/Blaizzy/mlx-video/blob/main/mlx_video/models/wan_2/README.md). 사진+텍스트 입력을 지원하는 무료 로컬 경로를 새 독립 Python3.12 환경에서 시험하는 제안이다. M4에 기존 `/opt/homebrew/bin/python3.12` 3.12.13이 있다.
- 공개 HF 파일 metadata 합계: q4/model 2,945,426,162 + t5_encoder 11,361,845,587 + vae 2,818,778,840 + tokenizer 16,837,417 + config 1,283 = **17,142,889,289bytes(17.14GB)**. repo 전체85GB를 받지 않고 q4/의5개만 선택할 계획이다. Python의존성/임시공간은 별도다. 다운로드 실측이 아닌 metadata 합계다.
- DiT만 Q4이며 T5는11.36GB라 단순히 모델이3GB라고 표시하지 않는다. 변환체의 tensor이름/실행기호환·24GB실제완주/최대메모리·속도/인물보존/기술동작품질은 미확인이다. 설치 전 고정버전/파일 구조를 대조하고 적합하지 않으면 대용량 다운로드 전에 보고할 계획이다.
- 새 모델·실행기 설치와17.14GB다운로드는 기존 Rive범위에 추가되는 수단 변경이므로 프로젝트 AGENTS의 사전판단 규칙에 따라 async로 사용자에게 질문했다. **명시적 답변 전 새 모델/실행기 설치·가중치 다운로드는 하지 않는다.** 사진은 M4에 유지하며 유료API/외부사진업로드는 제안하지 않았다.
- 신규도입 SKILL/절차는 도입경계 참고로 읽었다. 새 모델 설치 권한으로 해석하지 않았고, 새 ADP 번호나 채택 결정을 임의 확정하지 않았다.

## 원자료
- `docs/verification/task-063-motion-remake.json`: 미완료·시각FAIL·SVD실패·새모델결정대기 정본.
- 로컬 `/Users/brownjeon/.codex/artifacts/bjj-t063/`: 실제1/2차낙하/마무리PNG·source ZIP·SVD/native영수증.
- `mesh-study-source.zip` 10,473,084bytes, SHA256 `e57d43684ee665fbf9e0e4bcdfd125449c46bad6fe09a6a3e0ba19c045c8be13`. 시각 품질 실패 실험 소스이며 완성 영상이 아니다.
- SVD영수증 SHA256 `f5cc99b65c11ef9e1722577978531ce430edf3cf410666d4650c51d6217b6b25`.
- M4 `/Users/brownjeon/.local/share/bjj-rive/task-063/`에 원본·mesh-motion·review-01/02·svd-probe 자료를 보존했다.


## 새 로컬 생성 승인 수신 (exec-003)
- 사용자 async 답변 “M4에 별도 설치 후 재생성 (권장)”을 받았다. 앞 절의 답변대기는 과거 상태이며 같은 승인을 다시 요구하지 않는다. 허용범위는 별도M4실행환경/모델17.14GB+실행도구 설치·사진/설명으로 짧은로컬생성이다. 앱/DB/배포·유료API·클라우드사진업로드는 포함하지 않는다.
- M4Pro24GiB·디스크여유261,539,717,120bytes·기존python3.12.13 확인, task063/wan-local/env 독립venv 생성. 운영환경수정없음·원본해시일치.
- 고정 runtime commit87db56a51758fefb748a359b90a5283bb8ba4837, 모델revisionbb1b055249614cf9d7cf4373fbdbc184b77dee88. q4선택5개metadata크기/기대LFS SHA를 확보했고 큰파일수신전실제tensor헤더/loader호환을확인중이다.

- exec-004: ADP-015-C01(D-01) 연결. 원본코드보존·고정commit출처archive SHA174adddb7797125438adbf1996f5c344cfbc6187ac0b49d58615e302302a7a45·의존85개/pipcheck0. Sourceheader DiT1425/T5242/VAE196 이름/shape/dtype불일치0 조건부구조PASS, 실제수치추론별도. 5개17,142,889,289bytes를341.187초수신·기대LFS SHA일치. MLX0.32.4/AppleM4Pro 실제import·tokenizer pad0/eos1 확인.
- T5기본FP32upcast는가중치만21.16GiB여서별도taskwrapper에서원래BF16을유지한다. 원본attention의FP32 QK/softmax는그대로두고생성context finite/std를검사한다. 텍스트단계와video단계를별도프로세스로분리하며로컬캐시/토크나이저·HFoffline·프로세스메모리상한16GiB 적용, 시스템상한해제없음. 이대응의실제수치/품질은추론후판단한다.


## Wan 실제 생성과 품질 반복
- candidate-01:81프레임/384×384/24fps·12step·seed6311, 실제생성235.115초·MLXpeak11,915,158,372bytes·전체decode오류0·nativeMP4 701,687bytes/SHA d64f478375b69cd920416c3fc2968eb1d57e74e404c44d7c28bdf9f3b68b9902. 텍스트단계5.535초/peak11,921,255,538bytes·finite/std검사통과.
- 메인이8단계contactsheet를직접확인했다. 초기에사진외형은보이나중간에흰도복머리/몸이복제되고그립이흐트러져시각품질FAIL. 생성성공을자연스러운트라이포드완성으로처리하지않는다.
- candidate-02:2D삽화/동일2인/흰도복뒤·오른쪽낙하를명시한단순prompt,448×448/97프레임/40step/seed6315로재생성중. 추가가중치/유료API/외부업로드없음.
- 메모리상한표현보충:16GiB는현재MLX프로세스의Metal allocator 범위(실측설정17,162,698,752bytes)이며OS전체/호스트RSS/CPU메모리하드상한을뜻하지않는다. 시스템상한해제없음.

- candidate-02 실제완료:97f/448×448/24fps·40step·seed6315·964.091초·MLXpeak12,047,680,580bytes·decode0·nativeMP4 1,020,551bytes/SHA a0c473f9cf9bc010c9bfff2bfcbfd578c4e3792d8b84e187d6c20400ca44d401. 메인과관장이8프레임접촉시트를독립확인:제3인물/머리복제는보이지않고초반제어/오른쪽낮아짐/따라오기개선. 그러나파랑매트지지없이부유/흰무릎착지에가까움/명확한스윕완료·그립/발접촉과프레임가림미달. 완성교육영상또는사용자품질PASS아님.
- candidate-03:원본몸체/자세재그림없이896×672캔버스왼쪽540×540배치·우측착지공간·바닥shadow만추가. input SHA cbaa4f292320aafdc9346346a3356e6f8872e64bee0f06748318f26658ab0d50.512×384/97f/40step seed6315·뒤로엉덩이낮추기/매트지지/화면안전신유지prompt로재생성.같은모델/설치/오프라인경계유지·추가유료/가중치다운로드없음.


## 최종 로컬 모션 실험 샘플 (exec-007)
- candidate-03:512×384/97프레임/24fps·4.041667초/40step, 실제생성975.753초·MLXpeak12,040,602,692bytes. nativeMP4 719,758bytes·SHA f6f940457204d47093ca772f377e70833a683302be3bdc30cfa6aa04b65d86fc.
- 메인과관장이24표본프레임+native마지막96프레임을직접확인했다. 표본에선큰제3인물/머리복제없이2인프레임유지·흰뒤/오른쪽으로앉음·파랑따라오기흐름개선. 주이동초반약1.2초/후반결과유지. 전체97프레임해부학감사는아니다.
- 먼다리훅/발목그립의연속정밀성,파랑골반뒤살색형상/겹친손발,체중지지/최종탑확보는확인부족이다. **모션실험샘플로전달하며완성교육용기술정확도PASS/사용자품질승인으로표시하지않는다.**
- 전달 /Users/brownjeon/.codex/artifacts/bjj-t063/final-03/: tripod-sweep.mp4 / preview.gif(3,761,275bytes·SHA c3d7481022cbadd350a9b8bc5e7dd4da5f39682817e4f36de70b4eb36d9bbd58)/poster.png/contact-sheet.png/delivery-receipt.json. 4산출물크기·해시원격/로컬일치·로컬전체decode0. MP4는native바이트동일복사, GIF만12fps/512폭팔레트미리보기이며원본모션변형/리타이밍/보간없음.
- Codex패널파일열기는queued만수신했다. 실제재생을메인이관찰했다고표시하지않는다. 원본/M4복사SHA불변·후검사메모리여유90%·새공개API/서비스없음. 운영E2E무영향검증은수행하지않았으나운영설정/서비스변경은하지않았다.
- 독립M4실행환경/모델은유지한다. 유료생성API0/사진·프롬프트외부업로드0·앱/DB/버전/배포변경없음·미커밋/미push. ADP-015는trial/poc,정식채택미결정.
- 재현구성과세후보의실측/한계는 reference/motion/task-063/README.md 및 docs/verification/task-063-motion-remake.json에보존한다.


## 사용자 품질 반려·사전 골격/관절 모션 방식 검토 (2026-11-11, exec-008)
- 사용자: “맞아 멈춰있는 사진보다 인체구조도 틀어지고 그래픽도 깨져보여. Rive의 기능같이 캐릭터에 뼈대와 관절에 대한 구조를 미리 적용해놓고 모션에 대한 설명을 받았을떄 인체구조에 따라서 움직이도록 영상을 만들수는 없어?” 기존 Wan 샘플을 품질 승인으로 처리하지 않는다. 이전 산출물/설치환경은 보존한다.
- 읽기 범위: task063/README/motion-spec/verification, generate_rive.py의 native RootBone/timeline 직렬화와 prepare_motion.py의 임시 IK/pose. 이전 Rive에도 Mesh8/RootBone22가 있었고, 모든 뼈대를 flat RootBone으로 출력해 계산한 x/y/rotation을 키프레임으로 구동했다. 자연어→검증된 인체동작을 해석하는 재사용 제어기나 native IK/RotationConstraint를 포함한 완성형 캐릭터 리그는 아니었다. 단순히 ‘뼈대가 없었다’라고 설명하지 않는다.
- 공식 문서 확인: [Bones](https://rive.app/docs/editor/manipulating-shapes/bones), [IK Constraint](https://rive.app/docs/editor/constraints/ik-constraint), [Rotation Constraint](https://rive.app/docs/editor/constraints/rotation-constraint), [Data Binding](https://rive.app/docs/editor/data-binding/overview), [Character animation](https://rive.app/use-cases/character-animation). IK 목표점·뼈대 체인·회전 min/max·가중 메시·코드/데이터 구동은 공식 기능이다. Rive 자체에 주짓수/인체 역학의 정확성 보장이 있다는 주장은 하지 않는다.
- 검토 구성(제안, 채택 결정 아님): 고정 캐릭터 리그/레이어·뼈길이/계층 → 관절 굽힘 방향/회전 제한 → 손·발 접촉 목표 및 바닥 지지 → 설명을 기술별 검증된 동작 단계/좌우/속도로 변환 → 제약 확인/IK → 로컬 렌더. 제약 불충족을 뼈길이 늘리기나 임의 이미지 생성으로 덮지 않고 오류/수정 대상으로 분리한다.
- 트라이포드 예: 손은 제어하는 발목을 따라가고, 미는 발은 상대 골반을 따라가며, 반대 훅은 적용 구간 동안 반대 다리 뒤 접촉을 유지하도록 목표점을 연결한다. 두 인물의 골반/척추 이동과 접촉 해제 시점은 사전 검증된 키포즈/모션을 사용해야 한다. 뼈길이/각도 제한만으로 접촉·균형·기술 정확도나 메시 찢어짐 방지가 자동 보장되지는 않는다.
- 먼저 캐릭터 원화에 가려진 소매/팔다리·도복 부분과 앞뒤 레이어, 적절한 메시/가중치를 준비해야 한다. 한 장의 합성 자세 그림에 뼈대만 올려 모든 회전 동작을 안정적으로 표현할 수 있다고 약속하지 않는다. 첫 구현 범위는 고정 시점의 검증된 기술 한 개가 적합하다는 검토 의견이다. 새 기술에는 동작 데이터/검증이 필요하고, 임의 자연어에서 어떤 주짓수 동작이든 자동 정확 생성한다고 주장하지 않는다.
- 이번 턴은 가능성/설계 검토와 피드백 기록이다. 새 영상/캐릭터 제작·새 모델 다운로드/설치·기존 모델 제거·앱/DB/배포는 실행하지 않았다. 현재 상태는 review/품질반려·구조 검토 완료이며 실제 구조 구현 완료가 아니다.


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
| exec-009 | 2026-11-11 | codex / codex_scoped | 사용자 샘플 확인 후 AI 영상 생성 폐기 명시 지시 수신·도입 미채택/작업 종료 기록. 기술 검사 이력 보존·추가 생성/앱/DB/배포 없음 |
