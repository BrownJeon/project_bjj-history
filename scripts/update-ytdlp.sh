#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# yt-dlp 주간 자동 업데이트 (bjj 참고영상 AI 분석 재발 방지 — task-006)
#
# 배경: YouTube가 주기적으로 추출 방식을 바꾸기 때문에 yt-dlp가 낡으면
#       특정 영상에서 "HTTP Error 403: Forbidden"으로 다운로드가 실패한다.
#       (2026-08-22 실제 발생: yt-dlp 2026.06.09 → 2026.08.19 업그레이드로 해결)
#
# 실행: 사용자 crontab, 매주 일요일 04:00
#       0 4 * * 0 bash /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/scripts/update-ytdlp.sh
#
# 주의: cron 환경은 로그인 셸과 PATH/HOME이 다르므로 모든 경로를 절대경로로 고정한다.
#       실패해도 시스템에 영향이 없도록 항상 exit 0 으로 끝내고 로그만 남긴다.
# ---------------------------------------------------------------------------
set -u

# cron 환경 방어 — PATH·HOME·pip user base 를 명시적으로 고정
export HOME=/home/brownjeon
export PYTHONUSERBASE=/home/brownjeon/.local
export PATH=/home/brownjeon/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

PYTHON_BIN=/usr/bin/python3                     # yt-dlp 는 시스템 python3 의 --user 패키지로 설치돼 있음
YTDLP_BIN=/home/brownjeon/.local/bin/yt-dlp     # (site-packages: ~/.local/lib/python3.10/site-packages)
LOG_DIR=/home/brownjeon/.local/log              # 등록부 관례와 동일한 로그 위치 (ext4 — NFS 장애와 무관)
LOG_FILE="$LOG_DIR/ytdlp-update.log"
MAX_LOG_LINES=200

/bin/mkdir -p "$LOG_DIR" 2>/dev/null

log() { echo "[$(/bin/date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

get_version() {
  if [ -x "$YTDLP_BIN" ]; then
    "$YTDLP_BIN" --version 2>/dev/null || echo "unknown"
  else
    echo "not-installed"
  fi
}

before="$(get_version)"

out="$("$PYTHON_BIN" -m pip install --user --upgrade yt-dlp 2>&1)"
rc=$?

after="$(get_version)"

if [ "$rc" -ne 0 ]; then
  # 실패해도 조용히 넘어가되 원인은 로그에 남긴다
  log "FAIL rc=$rc version=$before | $(echo "$out" | /usr/bin/tail -n 3 | /usr/bin/tr '\n' ' ')"
elif [ "$before" = "$after" ]; then
  log "OK   no-change version=$after"
else
  log "OK   updated $before -> $after"
fi

# 로그 무한 증가 방지 — inode 유지(append 리다이렉트 안전)를 위해 제자리 truncate
if [ -f "$LOG_FILE" ]; then
  trimmed="$(/usr/bin/tail -n "$MAX_LOG_LINES" "$LOG_FILE")"
  printf '%s\n' "$trimmed" > "$LOG_FILE"
fi

exit 0
