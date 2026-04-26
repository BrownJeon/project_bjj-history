# 에이전트 팀(Agent Teams) 활용 가이드

> 공식 문서: https://code.claude.com/docs/ko/agent-teams  
> Claude Code v2.1.32 이상 필요 (`claude --version` 으로 확인)

---

## 1. 활성화

`settings.local.json` (개인 환경) 또는 `settings.json` (팀 공유)에 아래 항목 추가:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

이 프로젝트는 [`.claude/settings.local.json`](../.claude/settings.local.json)에 이미 설정되어 있음.

---

## 2. 에이전트 팀 vs 서브에이전트 — 선택 기준

| 항목 | 서브에이전트(Sub-agents) | 에이전트 팀(Agent Teams) |
|------|----------------------|----------------------|
| 컨텍스트 | 각자 독립, 결과만 호출자에게 반환 | 각자 독립, 완전히 별개 |
| 통신 | 메인 에이전트에게만 보고 | 팀원끼리 직접 메시지 |
| 조율 | 메인 에이전트가 전담 | 공유 작업 목록으로 자율 조율 |
| 최적 용도 | 결과만 중요한 집중 작업 | 논의·협업이 필요한 복잡한 작업 |
| 토큰 비용 | 낮음 | 높음 (팀원 수에 비례) |

**팀원끼리 서로 소통할 필요가 있으면 → 에이전트 팀**  
**독립적인 결과를 취합하는 것만 필요하면 → 서브에이전트**

---

## 3. 팀 시작 방법

Claude에게 자연어로 요청한다. Claude는 직접 팀을 만들거나, 팀이 유리하다고 판단하면 먼저 제안한다. 어떤 경우든 사용자 승인 없이는 생성하지 않는다.

```text
I'm designing a CLI tool that helps developers track TODO comments across
their codebase. Create an agent team to explore this from different angles: one
teammate on UX, one on technical architecture, one playing devil's advocate.
```

```text
Create a team with 4 teammates to refactor these modules in parallel.
Use Sonnet for each teammate.
```

---

## 4. 팀원 제어

### 화면 표시 모드

| 모드 | 설명 | 요구사항 |
|------|------|---------|
| `in-process` (기본) | 메인 터미널 안에서 팀원 순환 (Shift+Down) | 없음 |
| `tmux` / `iterm2` | 팀원마다 별도 창 분할 | tmux 또는 it2 CLI + iTerm2 |

`~/.claude.json`에서 전역 설정:
```json
{ "teammateMode": "in-process" }
```

단일 세션에만 적용하려면:
```bash
claude --teammate-mode in-process
```

### In-process 모드 키 단축키

| 키 | 동작 |
|----|------|
| Shift+Down | 다음 팀원으로 이동 (마지막 이후엔 리더로) |
| Enter | 해당 팀원 세션 진입 |
| Escape | 현재 턴 중단 |
| Ctrl+T | 작업 목록 토글 |

### 서브에이전트 정의를 팀원에 재사용

`.claude/agents/` 에 정의된 에이전트를 팀원으로 불러올 수 있다. 팀원은 해당 에이전트의 시스템 프롬프트·도구·모델을 그대로 상속한다.

```text
Spawn a teammate using the security-reviewer agent type to audit the auth module.
```

---

## 5. 작업(Task) 관리

### 작업 상태
`대기 중` → `진행 중` → `완료됨`

종속 관계 설정 가능 — 선행 작업이 완료되어야 다음 작업 요청 가능.

### 작업 할당 방식
- **리더 지정**: 리더에게 "어느 팀원에게 어느 작업" 직접 지시
- **자율 요청**: 팀원이 자신의 작업 완료 후 대기 중인 다음 작업을 스스로 선택

> 팀원당 5~6개 작업 유지 권장. 15개 작업이면 팀원 3명이 적당.

---

## 6. 계획 승인 요구 (위험 작업 시)

```text
Spawn an architect teammate to refactor the authentication module.
Require plan approval before they make any changes.
```

1. 팀원이 읽기 전용 계획 모드에서 계획 수립
2. 리더에게 계획 승인 요청 전송
3. 리더가 승인 → 팀원이 구현 시작
4. 리더가 거부 → 팀원이 피드백 반영 후 재제출

승인 기준을 프롬프트에 명시할 수 있다:
```text
Only approve plans that include test coverage.
Reject plans that modify the database schema.
```

---

## 7. 팀원과 직접 소통

```text
Ask the researcher teammate to shut down   ← 팀원 우아하게 종료
```

팀원이 완료되기 전에 리더가 앞서 나갈 때:
```text
Wait for your teammates to complete their tasks before proceeding
```

---

## 8. 팀 정리

**반드시 리더에게** 정리를 요청한다. 팀원이 직접 실행하면 리소스가 불일치 상태가 된다.

```text
Clean up the team
```

공유 리소스 저장 위치:
- 팀 구성: `~/.claude/teams/{team-name}/config.json`
- 작업 목록: `~/.claude/tasks/{team-name}/`

> `config.json`은 런타임 상태(세션 ID, tmux 창 ID 등)를 포함하므로 수동 편집 금지.

---

## 9. Hooks로 품질 게이트 적용

| 훅 이벤트 | 발생 시점 | exit 2 효과 |
|-----------|---------|------------|
| `TeammateIdle` | 팀원이 유휴 전환 시 | 피드백 전송 후 팀원 계속 작동 |
| `TaskCreated` | 작업 생성 시 | 작업 생성 차단 |
| `TaskCompleted` | 작업 완료 표시 시 | 완료 표시 차단 |

`settings.json` 예시:
```json
{
  "hooks": {
    "TaskCompleted": [{
      "hooks": [{
        "type": "command",
        "command": "echo '작업 완료 검증 로직'"
      }]
    }]
  }
}
```

---

## 10. 사용 사례 예시

### 병렬 코드 리뷰
```text
Create an agent team to review PR #142. Spawn three reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

### 경쟁 가설로 버그 조사
```text
Users report the app exits after one message instead of staying connected.
Spawn 5 agent teammates to investigate different hypotheses. Have them talk to
each other to try to disprove each other's theories, like a scientific debate.
Update the findings doc with whatever consensus emerges.
```

### 모듈 병렬 리팩토링
```text
Create a team with 4 teammates to refactor the distributor modules in parallel.
Each teammate owns a different module and must not touch others' files.
```

---

## 11. 모범 사례

### 팀원 생성 시 충분한 컨텍스트 제공
팀원은 CLAUDE.md와 프로젝트 컨텍스트를 자동 로드하지만 리더의 대화 기록은 상속하지 않는다.

```text
Spawn a security reviewer teammate with the prompt:
"Review the authentication module at src/auth/ for security vulnerabilities.
Focus on token handling and input validation."
```

### 적정 팀 규모
- **시작**: 3~5명
- **기준**: 독립적으로 작업 가능한 단위로 나눌 수 있을 때만 확장
- **경고**: 팀원 추가는 토큰 비용 선형 증가 + 조율 오버헤드 증가

### 파일 충돌 방지
두 팀원이 같은 파일을 동시에 편집하면 덮어쓰기 발생.  
→ 팀원마다 담당 파일 집합을 명시적으로 구분한다.

### 순차 작업에는 팀 사용 금지
종속성이 많거나 같은 파일을 순서대로 편집해야 하는 작업은 단일 세션이나 서브에이전트가 더 효율적이다.

---

## 12. 알려진 제한 사항

| 제한 | 내용 |
|------|------|
| 세션 재개 불가 | `/resume`, `/rewind` 시 in-process 팀원 복원 안 됨 → 새 팀원 재생성 필요 |
| 작업 상태 지연 | 팀원이 완료 표시를 못 할 수 있음 → 수동으로 상태 업데이트 |
| 세션당 1팀 | 리더는 동시에 하나의 팀만 관리 가능 |
| 중첩 팀 불가 | 팀원은 하위 팀 생성 불가 |
| 리더 고정 | 팀 생성 세션이 수명 동안 리더. 리더십 이전 불가 |
| 분할 창 제한 | VS Code 통합 터미널, Windows Terminal, Ghostty 미지원 |
