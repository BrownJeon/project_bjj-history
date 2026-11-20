---
name: architecture-decision-records
description: 중요한 아키텍처 선택의 배경·대안·근거를 결정 기록 초안으로 정리하거나 기존 결정 근거를 찾는다.
metadata:
  origin: ECC 2.2.0
  license: MIT
  source_sha256: 525e51b4ed98222cd49ea7d2e42b51a010ecab391b25022a86164258c14b8bb0
  adapted: "2026-11-06"
---
<!-- Generated from .claude/skills/architecture-decision-records/SKILL.md by cc-sync-codex/sync-agent-bridge.py. Edit the Claude source, then run the script. -->

워크스페이스·프로젝트 지침과 사용자 지시가 이 스킬보다 우선한다. 확인되지 않은 항목을 목표·결정으로 올리지 않는다.

1. 배경과 제약, 선택지, 선택 근거, 영향과 재검토 조건을 짧게 적는다. 결정 근거를 묻는 경우 기존 기록을 읽고 근거를 답한다.
2. 논의 중인 선택은 대화에서 초안으로만 제안한다. 사용자 승인 근거가 확인된 결정만 실제 결정 일자와 함께 기록한다.
3. 프로젝트 아키텍처 결정은 `agent-vault/30-Knowledge/decisions/`에 Agent Vault 규약에 따라 적는다. frontmatter에 `type/decision` 태그와 `aliases`를 두고 관련 task와 결정은 `[[위키링크]]`로 연결한다. 새 결정이 기존 결정을 대체하면 두 기록을 연결한다.
4. 도입 결정은 해당 `adoption/ADP-*/20-결정.md`에 누적한다. 결정 기록에는 기존 경로를 사용한다.
