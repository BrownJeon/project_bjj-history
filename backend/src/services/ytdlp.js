// yt-dlp 래퍼 — 긴 영상 분석 전용 (task-007 Phase 1)
// 메타(S1) / 자막(S2) / 다운로드(S3, 스톨워치독+디스크체크 포함)
//
// videoAnalysis.js의 runProcess()와 별개 구현이다 — videoAnalysis.js는 이번 작업 범위 밖이라
// 한 줄도 수정하지 않기로 되어 있고, 스톨 워치독처럼 긴 영상 전용으로 필요한 로직이 달라
// 공유 헬퍼로 승격하지 않고 이 파일 안에 자체 구현했다.
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { toNFC } = require('../utils/nfc');

const MIN_FREE_BYTES_DEFAULT = 3 * 1024 * 1024 * 1024; // 3GB

function extractYoutubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// cmd 실행 + 전체 타임아웃(timeoutMs) + 무응답(stallMs) 감시 + 취소(cancelCheck) 지원
function spawnWithWatchdog(cmd, args, opts = {}) {
  const { timeoutMs, stallMs, onData, cancelCheck } = opts;
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let out = '', err = '';
    let settled = false;
    let stallTimer = null;
    let hardTimer = null;
    let cancelTimer = null;

    function cleanup() {
      clearTimeout(stallTimer);
      clearTimeout(hardTimer);
      clearInterval(cancelTimer);
    }
    function finishReject(reason) {
      if (settled) return;
      settled = true;
      cleanup();
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error(reason));
    }
    function resetStall() {
      if (!stallMs) return;
      clearTimeout(stallTimer);
      stallTimer = setTimeout(
        () => finishReject(`${cmd} 진행 정지 감지 (${Math.round(stallMs / 1000)}초간 응답 없음) — 강제 종료`),
        stallMs
      );
    }

    if (timeoutMs) {
      hardTimer = setTimeout(
        () => finishReject(`${cmd} 전체 제한시간(${Math.round(timeoutMs / 1000)}초) 초과 — 강제 종료`),
        timeoutMs
      );
    }
    resetStall();

    if (cancelCheck) {
      cancelTimer = setInterval(async () => {
        try {
          if (await cancelCheck()) finishReject('사용자가 작업을 취소했습니다');
        } catch { /* ignore */ }
      }, 3000);
    }

    proc.stdout.on('data', d => { out += d; resetStall(); onData?.(d.toString()); });
    proc.stderr.on('data', d => { err += d; resetStall(); });
    proc.on('error', e => {
      if (settled) return;
      settled = true;
      cleanup();
      if (e.code === 'ENOENT') reject(new Error(`${cmd} 명령이 설치되어 있지 않습니다`));
      else reject(e);
    });
    proc.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (signal) return reject(new Error(`${cmd} 강제 종료됨 (signal: ${signal})`));
      if (code !== 0) {
        const detail = (err.trim() || out.trim() || `${cmd} 종료 코드: ${code}`).slice(0, 500);
        return reject(new Error(detail));
      }
      resolve({ stdout: out, stderr: err });
    });
  });
}

// S1: 메타데이터 조회 (다운로드 없음) — 60초, 유일한 치명적 단계
async function fetchMeta(url) {
  const { stdout } = await spawnWithWatchdog(
    'yt-dlp',
    ['-J', '--skip-download', '--no-warnings', url],
    { timeoutMs: 60000 }
  );
  let json;
  try {
    json = JSON.parse(stdout.trim());
  } catch (e) {
    throw new Error(`yt-dlp 메타데이터 파싱 실패: ${e.message}`);
  }
  const chapters = Array.isArray(json.chapters)
    ? json.chapters
        .filter(c => c && typeof c.start_time === 'number')
        .map(c => ({
          start_sec: Math.floor(c.start_time),
          end_sec:   Math.floor(c.end_time ?? c.start_time),
          title:     toNFC((c.title || '').trim()),
        }))
        .filter(c => c.end_sec > c.start_sec)
    : [];
  // task-014: yt-dlp가 일부 영상의 한글 제목을 자모분리형(NFD)으로 반환한다 — 2026-09-04에
  // long_videos.id=29("델라히바에서...", 이 URL로 재실행해도 여전히 NFD)로 실측 확인했다.
  // 사용자가 검색창에 치는 글자는 항상 완성형(NFC)이라, NFD로 저장되면 육안상 같은 제목인데도
  // 검색·필터·이름 비교가 전부 조용히 실패한다(에러 없이 "결과 없음"). 이 함수가 앱 전체에서
  // yt-dlp 메타데이터가 들어오는 유일한 입구이므로, 여기서 NFC로 통일해 DB를 정본으로 유지한다.
  // 이미 NFC인 문자열에는 아무 영향이 없다(멱등).
  return {
    videoId:     json.id || extractYoutubeId(url),
    title:       toNFC(json.title || ''),
    channel:     toNFC(json.uploader || json.channel || ''),
    durationSec: Math.floor(json.duration || 0),
    thumbUrl:    json.thumbnail || '',
    chapters,
  };
}

// S2: 자막 조회 (다운로드 없음) — 120초, 실패해도 파이프라인은 계속 진행
async function fetchSubtitleVtt(url, tmpDir) {
  const outTemplate = path.join(tmpDir, 'sub.%(ext)s');
  try {
    await spawnWithWatchdog(
      'yt-dlp',
      [
        '--write-auto-sub', '--write-sub', '--sub-lang', 'ko,en', '--sub-format', 'vtt',
        '--skip-download', '--no-warnings', '-o', outTemplate, url,
      ],
      { timeoutMs: 120000 }
    );
  } catch (e) {
    console.log('[long-video][ytdlp] 자막 조회 실패(무시하고 계속 진행):', e.message);
    return null;
  }
  const files = await fs.readdir(tmpDir).catch(() => []);
  const vttFiles = files.filter(f => f.endsWith('.vtt'));
  if (!vttFiles.length) return null;
  const preferred = vttFiles.find(f => /\.ko\.vtt$/i.test(f))
    || vttFiles.find(f => /\.en\.vtt$/i.test(f))
    || vttFiles[0];
  return path.join(tmpDir, preferred);
}

// 사전 여유공간 체크 (기본 3GB 미만이면 false)
async function checkFreeDiskSpace(dirPath, minBytes = MIN_FREE_BYTES_DEFAULT) {
  try {
    const stat = await fs.statfs(dirPath);
    const freeBytes = stat.bavail * stat.bsize;
    return freeBytes >= minBytes;
  } catch (e) {
    console.error('[long-video][ytdlp] 디스크 여유공간 확인 실패(통과 처리):', e.message);
    return true; // 확인 자체가 실패하면 과도한 차단을 피하기 위해 통과시킨다
  }
}

// S3: 다운로드 — 720p 상한, 1800초 전체 타임아웃 + 180초 스톨 워치독
async function downloadVideo(url, tmpDir, opts = {}) {
  const outTemplate = path.join(tmpDir, 'src.%(ext)s');
  await spawnWithWatchdog(
    'yt-dlp',
    [
      '-f', 'bv*[height<=720]+ba/b[height<=720]/best',
      '--merge-output-format', 'mp4',
      '-N', '4', '--socket-timeout', '30', '--retries', '5', '--fragment-retries', '10',
      '--newline', '--no-warnings',
      '-o', outTemplate, url,
    ],
    {
      timeoutMs: 1800000, // 30분
      stallMs: 180000,    // 3분 무응답 → 강제 종료
      onData: opts.onProgress,
      cancelCheck: opts.cancelCheck,
    }
  );
  const files = await fs.readdir(tmpDir).catch(() => []);
  const videoFile = files.find(f => f.startsWith('src.') && !/\.(part|ytdl)$/i.test(f));
  if (!videoFile) throw new Error('다운로드된 영상 파일을 찾을 수 없습니다');
  return path.join(tmpDir, videoFile);
}

module.exports = {
  extractYoutubeId,
  fetchMeta,
  fetchSubtitleVtt,
  checkFreeDiskSpace,
  downloadVideo,
};
