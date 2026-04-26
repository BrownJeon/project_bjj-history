# 토큰 비용 절감 가이드

> 공식 문서: https://code.claude.com/docs/ko/costs  
> 에이전트 팀 생성 시 [agent-teams-guide.md](agent-teams-guide.md)와 함께 참고

---

## 1. 비용 현황 파악

### 평균 비용 기준

| 기준 | 비용 |
|------|------|
| 개발자 1인 평균 | $6 / 일 |
| 90% 사용자 상한 | $12 / 일 이하 |
| 팀 평균 (Sonnet 4.6) | $100~200 / 월·인 |

> 자동화나 에이전트 팀 사용 시 위 기준보다 크게 올라갈 수 있음.

### 세션 비용 확인

```
/cost          # 현재 세션 토큰 사용량 및 비용 출력 (API 사용자 전용)
/stats         # Claude Pro/Max 구독자용 사용 패턴 확인
```

출력 예시:
```
Total cost:            $0.55
Total duration (API):  6m 19.7s
Total duration (wall): 6h 33m 10.2s
Total code changes:    0 lines added, 0 lines removed
```

---

## 2. 에이전트 팀 비용 관리 ★

에이전트 팀은 팀원 수만큼 별도의 Claude 인스턴스가 실행되므로 비용이 선형으로 증가한다.  
**plan mode 팀원은 표준 세션 대비 약 7배 더 많은 토큰을 사용한다.**

### 에이전트 팀 비용 절감 핵심 규칙

| 규칙 | 이유 |
|------|------|
| 팀원 모델은 **Sonnet** 사용 | Opus 대비 비용 절감, 성능은 충분 |
| **팀원 3~5명** 이내로 제한 | 토큰 사용량 = 팀원 수에 비례 |
| spawn 프롬프트를 **간결하게** | 프롬프트 전체가 첫 컨텍스트로 들어감 |
| 작업 완료 후 **즉시 팀 정리** | 유휴 팀원도 토큰 계속 소비 |
| 작업을 **작고 독립적**으로 분할 | 팀원당 컨텍스트 크기 제한 |

### 팀원 모델 명시 방법

```text
Create a team with 3 teammates to review this module.
Use Sonnet for each teammate.
```

---

## 3. 컨텍스트 크기 관리

비용은 컨텍스트 크기에 비례한다. 컨텍스트를 줄이는 것이 곧 비용 절감이다.

### 작업 전환 시 컨텍스트 초기화

```
/clear         # 컨텍스트 초기화 (관련 없는 작업으로 전환 시)
/rename        # 초기화 전 세션 이름 저장
/resume        # 저장된 세션으로 복귀
```

### 사용자 정의 compaction 지침

```
/compact Focus on code samples and API usage
```

`CLAUDE.md`에 compaction 지침 추가:
```markdown
# Compact instructions

When you are using compact, please focus on test output and code changes
```

### CLAUDE.md 크기 유지

- **500줄 이하** 권장
- 모든 세션 시작 시 전체 내용이 컨텍스트에 로드됨
- 특정 워크플로우(PR 리뷰, DB 마이그레이션 등) 지침은 Skills로 분리 → 필요할 때만 로드

---

## 4. 모델 선택 전략

| 작업 유형 | 권장 모델 | 이유 |
|-----------|----------|------|
| 일반 코딩 작업 | **Sonnet** | 비용·성능 균형 최적 |
| 복잡한 아키텍처 결정, 다단계 추론 | Opus | 고비용이지만 품질 필요 |
| 간단한 서브에이전트 작업 | **Haiku** | 저비용 |

```
/model         # 세션 중 모델 전환
/config        # 기본 모델 설정
```

서브에이전트 정의 파일에서 모델 지정:
```yaml
---
name: my-agent
model: haiku
---
```

---

## 5. 확장 사고(Extended Thinking) 조정

기본값: **31,999 토큰** 예산으로 활성화 (사고 토큰은 출력 토큰으로 청구)

### 조정 방법

```
/effort        # 노력 수준 변경 (low / medium / high)
```

환경 변수로 예산 직접 지정:
```bash
MAX_THINKING_TOKENS=8000   # 기본 31999보다 낮게 설정
```

> 단순 작업(코드 포맷, 주석 추가 등)에는 사고 예산을 낮추거나 `/config`에서 비활성화

---

## 6. MCP 서버 오버헤드 감소

MCP 서버는 유휴 상태에서도 도구 정의를 컨텍스트에 추가한다.

```
/context       # 컨텍스트 공간 사용 현황 확인
/mcp           # 구성된 MCP 서버 확인 및 비활성화
```

### 도구 검색 임계값 설정

MCP 도구가 컨텍스트의 10%를 초과하면 자동으로 지연 로드(deferred)된다.  
더 낮은 임계값으로 설정하면 유휴 도구 정의가 줄어든다:

```bash
ENABLE_TOOL_SEARCH=auto:5   # 5% 초과 시 자동 지연 로드
```

### MCP 대신 CLI 도구 선호

`gh`, `aws`, `gcloud`, `sentry-cli` 같은 CLI 도구는 도구 정의를 컨텍스트에 추가하지 않으므로 더 효율적이다.

---

## 7. Hooks로 전처리하여 컨텍스트 절약

Claude가 대용량 파일 전체를 읽기 전에 Hook으로 필요한 부분만 추출하면 토큰을 대폭 절감할 수 있다.

### 테스트 출력 필터 Hook 예시

`settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/filter-test-output.sh"
          }
        ]
      }
    ]
  }
}
```

`~/.claude/hooks/filter-test-output.sh`:
```bash
#!/bin/bash
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command')

# 테스트 실행 명령이면 실패 항목만 필터링
if [[ "$cmd" =~ ^(npm test|pytest|go test) ]]; then
  filtered_cmd="$cmd 2>&1 | grep -A 5 -E '(FAIL|ERROR|error:)' | head -100"
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"updatedInput\":{\"command\":\"$filtered_cmd\"}}}"
else
  echo "{}"
fi
```

> 10,000줄 로그 파일 → ERROR 라인만 추출 → 수만 토큰 → 수백 토큰으로 절감

---

## 8. 서브에이전트로 고비용 작업 격리

테스트 실행, 문서 수집, 로그 분석 등 컨텍스트를 많이 소비하는 작업은 서브에이전트에 위임한다.  
→ 상세 출력은 서브에이전트 컨텍스트에 남고, **요약만** 메인 대화로 반환된다.

---

## 9. 프롬프트 작성 습관

### 구체적인 요청 = 적은 파일 탐색 = 낮은 비용

| 나쁜 예 | 좋은 예 |
|--------|--------|
| "이 코드베이스 개선해줘" | "auth.ts의 login 함수에 입력 검증 추가해줘" |
| "버그 찾아줘" | "src/queue/DBX_RIO.ftl의 accept 로직에서 NPE 원인 찾아줘" |

### 복잡한 작업 효율 습관

| 습관 | 방법 |
|------|------|
| 구현 전 계획 검토 | Shift+Tab → plan mode 진입 |
| 잘못된 방향 즉시 중단 | Escape 눌러 중지 |
| 이전 상태로 복원 | `/rewind` 또는 Escape 두 번 |
| 증분 테스트 | 파일 하나 작성 → 테스트 → 다음으로 |

---

## 10. 팀 비용 관리 (API 사용 조직)

### 팀 규모별 권장 속도 제한

| 팀 규모 | 사용자당 TPM | 사용자당 RPM |
|--------|------------|------------|
| 1~5명 | 200k~300k | 5~7 |
| 5~20명 | 100k~150k | 2.5~3.5 |
| 20~50명 | 50k~75k | 1.25~1.75 |
| 50~100명 | 25k~35k | 0.62~0.87 |
| 100~500명 | 15k~20k | 0.37~0.47 |
| 500명+ | 10k~15k | 0.25~0.35 |

> 팀 규모가 클수록 사용자당 TPM이 낮아지는 이유: 동시 사용자 비율이 낮기 때문

---

## 11. 에이전트 팀 생성 시 비용 체크리스트

에이전트 팀을 만들기 전 아래 항목을 확인한다:

- [ ] 팀원 모델을 Sonnet으로 지정했는가?
- [ ] 팀원 수를 3~5명 이내로 제한했는가?
- [ ] spawn 프롬프트가 필요한 정보만 담고 있는가?
- [ ] 각 팀원의 작업이 독립적으로 분리되어 있는가? (파일 충돌 없음)
- [ ] 팀원당 5~6개 이하의 작업을 배정했는가?
- [ ] 작업 완료 후 팀 정리(`Clean up the team`)를 계획했는가?
- [ ] plan mode가 필요한 팀원인지 판단했는가? (plan mode = 7배 비용)
