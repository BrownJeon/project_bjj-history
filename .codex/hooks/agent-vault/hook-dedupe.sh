#!/usr/bin/env bash
# 훅 중복 실행 방지 — ISS-0007. 직접 실행하지 않고 훅 스크립트가 `source` 한다.
#
# 왜: 같은 훅 스크립트가 전역 설정(절대경로)과 프로젝트 설정($CLAUDE_PROJECT_DIR/…)에 서로 다른 문자열로 등록되면
# Claude Code 가 한 이벤트에 두 번 실행한다(문자열이 같으면 한 번 — 2026-10-10 TheAdmin 격리 실험). 설정을 건드리지 않고
# (14개 프로젝트·맥 영향) 스크립트가 같은 호출을 한 번만 처리하게 한다.
#
# 사용:  . "$(dirname "${BASH_SOURCE[0]}")/hook-dedupe.sh"; hook_dedupe     # 그 뒤 입력은 $HOOK_INPUT 에 있다
#   · stdin 전체를 HOOK_INPUT 에 읽는다(훅은 입력을 stdin JSON 으로 받는다).
#   · (스크립트 이름 + 입력) 해시로 락 디렉터리를 mkdir(원자적)한다 — 성공하면 첫 호출이라 계속 실행,
#     실패하고 락이 TTL(기본 10초) 안이면 중복이라 아무것도 출력하지 않고 종료 0 한다.
#   · 입력이 비었거나 락을 만들 수 없으면 중복 판단을 하지 않고 그냥 실행한다(훅이 빠지는 것보다 두 번 도는 쪽이 안전).
#   · 환경변수: HOOK_DEDUPE_DIR(락 위치) · HOOK_DEDUPE_TTL(초) · HOOK_DEDUPE_LOG=0(진단 로그 끔)
#   · 진단 로그: <락 위치>/dedupe.log — 시각·스크립트·결정(run|skip)·키 앞 8자·입력 JSON 의 필드 이름 목록만 적는다(값은 적지 않는다).
#
# 알려진 한계: TTL 이 지난 낡은 락을 지우는 순간 두 호출이 겹치면 둘 다 실행될 수 있다(드묾). 같은 입력의 별개 이벤트가 TTL 안에
# 오면 뒤의 것이 건너뛰어진다 — 입력에 에이전트·세션 고유 값이 있어 실제로는 거의 없다(진단 로그로 확인한다).

_hook_dedupe_log() {
  local root="$1" script="$2" decision="$3" key="$4" fields="" f
  f="$root/dedupe.log"
  if [ "${HOOK_DEDUPE_LOG:-1}" = 0 ]; then return 0; fi
  if command -v jq >/dev/null 2>&1; then
    fields="$(printf '%s' "$HOOK_INPUT" | jq -r 'if type=="object" then keys|join(",") else type end' 2>/dev/null || true)"
  fi
  printf '%s %s %s %s pid=%s fields=%s\n' "$(date +%FT%T)" "$script" "$decision" "${key:0:8}" "$$" "$fields" >> "$f" 2>/dev/null || true
  # 로그 상한 — 400줄을 넘으면 뒤 200줄만 남긴다(경쟁 시 일부 유실은 진단용이라 허용)
  if [ "$(wc -l < "$f" 2>/dev/null || echo 0)" -gt 400 ]; then
    tail -n 200 "$f" > "$f.tmp" 2>/dev/null && mv -f "$f.tmp" "$f" 2>/dev/null || true
  fi
  return 0
}

hook_dedupe() {
  HOOK_INPUT="$(cat || true)"
  if [ -z "$HOOK_INPUT" ]; then return 0; fi
  local root ttl key lock now born script
  root="${HOOK_DEDUPE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/claude-hook-dedupe-$(id -u)}"
  ttl="${HOOK_DEDUPE_TTL:-10}"
  script="$(basename "${BASH_SOURCE[1]:-$0}")"
  mkdir -p "$root" 2>/dev/null || return 0
  chmod 700 "$root" 2>/dev/null || true
  key="$(printf '%s\n%s' "$script" "$HOOK_INPUT" | sha256sum | cut -c1-32)"
  lock="$root/$key"
  now="$(date +%s)"
  # 오래된 락(2분 넘음) 정리 — 이름이 해시(16진수)인 디렉터리만
  find "$root" -mindepth 1 -maxdepth 1 -type d -name '[0-9a-f]*' -mmin +2 -exec rm -rf {} + 2>/dev/null || true
  # 같은 키의 락이 TTL 을 넘었으면 새 이벤트를 위해 지운다
  if [ -d "$lock" ]; then
    born="$(stat -c %Y "$lock" 2>/dev/null || echo 0)"
    if [ $((now - born)) -gt "$ttl" ]; then rmdir "$lock" 2>/dev/null || true; fi
  fi
  if mkdir "$lock" 2>/dev/null; then
    _hook_dedupe_log "$root" "$script" run "$key"
    return 0
  fi
  if [ ! -d "$lock" ]; then
    # 락을 만들 수도 없고 있지도 않다 — 쓰기 불가 등. 중복 판단 없이 실행(훅이 빠지지 않게).
    return 0
  fi
  _hook_dedupe_log "$root" "$script" skip "$key"
  exit 0
}
