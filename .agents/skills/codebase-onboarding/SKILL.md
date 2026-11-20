---
name: codebase-onboarding
description: 낯선 저장소를 읽어 구조, 주요 진입점, 대표 실행 흐름과 관례를 근거 경로와 함께 설명한다.
metadata:
  origin: ECC 2.2.0
  license: MIT
  source_sha256: ef88873a4b0d0fe155c0a196ffecd5c7b5e28edd00fbbdb5c1fd2ca8fd0eb6f0
  adapted: "2026-11-06"
---
<!-- Generated from .claude/skills/codebase-onboarding/SKILL.md by cc-sync-codex/sync-agent-bridge.py. Edit the Claude source, then run the script. -->

워크스페이스·프로젝트 지침과 사용자 지시가 이 스킬보다 우선한다. 확인되지 않은 항목을 목표·결정으로 올리지 않는다.

1. 프로젝트 루트의 두 지침 파일(파일명은 `CLAUDE`와 `AGENTS`, 확장자는 각각 `.md`)과 `agent-vault/00-Context/ACTIVE.md`를 먼저 읽는다. 없는 파일은 그 사실을 표시한다. 지침 파일은 읽기 전용으로 다룬다.
2. 매니페스트, 빌드·테스트 설정, 상위 디렉터리와 진입점을 확인한다. 대표 흐름 하나를 입력에서 처리, 저장소 또는 외부 경계, 결과까지 따라간다. 코딩·테스트 관례는 실제 사용 예에서 확인한다.
3. 지침과 코드 관찰이 다르면 양쪽 근거를 붙여 **불일치**로만 보고한다. 확인한 사실과 미확인 사항을 구분한다.

구조·진입점·대표 흐름·관례·불일치를 간단히 정리해 대화로 전달하거나 해당 task 문서의 현행 분석 절에 쓴다.
