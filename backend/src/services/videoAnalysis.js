const { spawn } = require('child_process');
const fs   = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { runClaude } = require('./claudeCli');
const { getFramesDir, getVideoDir, frameWebPath, videoWebPath, ensureDir } = require('./storage');
// 🔴 yt-dlp 는 PATH 가 아니라 해석된 절대경로로 부른다 — 이유는 services/ytdlp.js 상단 주석 참고
//   (pm2 프로세스가 ecosystem 없이 재생성되면 PATH 에서 ~/.local/bin 이 빠져 전부 죽는다).
const { YTDLP_BIN } = require('./ytdlp');

const INSTAGRAM_COOKIE_PATH  = '/home/brownjeon/.node-local/bjj-data/instagram-cookies.txt';
const FIREFOX_PROFILE_DIR    = '/home/brownjeon/.mozilla/firefox';

function hasCookieFile() { return fsSync.existsSync(INSTAGRAM_COOKIE_PATH); }

// Firefox 프로필에 cookies.sqlite 가 있으면 로그인 이력 있음
function hasFirefoxSession() {
  if (!fsSync.existsSync(FIREFOX_PROFILE_DIR)) return false;
  // profiles.ini 에서 프로필 디렉토리를 찾거나, cookies.sqlite 를 재귀 탐색
  const entries = fsSync.readdirSync(FIREFOX_PROFILE_DIR);
  return entries.some(e => {
    const cookiePath = path.join(FIREFOX_PROFILE_DIR, e, 'cookies.sqlite');
    return fsSync.existsSync(cookiePath);
  });
}

// 파일 > Firefox 브라우저 순으로 인증 수단 확인
function hasInstagramAuth() { return hasCookieFile() || hasFirefoxSession(); }

// yt-dlp에 전달할 쿠키 인수 — Instagram 전용
function getInstagramCookieArgs(url) {
  if (!/instagram\.com/.test(url)) return [];
  if (hasCookieFile())      return ['--cookies', INSTAGRAM_COOKIE_PATH];
  if (hasFirefoxSession())  return ['--cookies-from-browser', 'firefox'];
  return [];
}

function runProcess(cmd, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: timeoutMs });
    let err = '', out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; });
    proc.on('error', e => {
      if (e.code === 'ENOENT') reject(new Error(`${cmd} 명령이 설치되어 있지 않습니다`));
      else reject(e);
    });
    proc.on('close', (code, signal) => {
      // 🔴 cmd 는 이제 절대경로일 수 있다(YTDLP_BIN) — 아래 에러 감지는 경로가 아니라
      //    "이게 yt-dlp 인가"로 판단해야 한다. 문자열 비교만 남겨두면 인증·버전 안내가 조용히 사라진다.
      const isYtDlp = cmd === YTDLP_BIN || /(^|\/)yt-dlp$/.test(cmd);
      if (signal) return reject(new Error(`${cmd} 강제 종료 (signal: ${signal}, timeout: ${timeoutMs}ms)`));
      if (code !== 0) {
        // yt-dlp Instagram 인증 에러 감지
        if (isYtDlp && /instagram/i.test(args.join(' ')) &&
            /empty media response|login required|authentication/i.test(err)) {
          return reject(new Error('Instagram 영상은 로그인 인증이 필요하여 다운로드가 불가합니다'));
        }
        // yt-dlp YouTube 다운로드 실패 감지 — 대부분 yt-dlp 버전 노후화로 추출 방식을 못 따라가서 발생
        if (isYtDlp && /youtube\.com|youtu\.be/i.test(args.join(' ')) &&
            /403|Forbidden|unable to download video data|Requested format is not available|nsig extraction failed|Sign in to confirm|failed to extract any player response/i.test(err)) {
          return reject(new Error(
            'YouTube 영상 다운로드에 실패했습니다. yt-dlp 업데이트가 필요할 수 있습니다 ' +
            '(pip install --user --upgrade yt-dlp). ' +
            '문제가 계속되면 "파일로 분석"으로 영상을 직접 업로드해보세요.'
          ));
        }
        // claude 종료 코드 1: stdout에 실제 에러가 있을 수 있음
        const detail = (err.trim() || out.trim() || `${cmd} 종료 코드: ${code}`).slice(0, 300);
        return reject(new Error(detail));
      }
      resolve(out);
    });
  });
}

async function hasAudioTrack(videoPath) {
  try {
    const out = await runProcess('ffprobe', [
      '-v', 'error', '-select_streams', 'a',
      '-show_entries', 'stream=codec_type', '-of', 'csv=p=0',
      videoPath,
    ], 10000);
    return out.trim() === 'audio';
  } catch { return false; }
}

async function extractFrames(videoPath, framePrefix) {
  let duration = 30;
  try {
    const durOut = await runProcess('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ], 30000);
    duration = parseFloat(durOut.trim()) || 30;
  } catch {}
  // 90초 미만 → 12장, 90초 이상 → 15장 (최대 15장)
  const count    = duration >= 90 ? 15 : 12;
  const interval = (duration * 0.9) / count;
  const start    = duration * 0.05;
  const frames   = [];
  for (let i = 0; i < count; i++) {
    const ts  = (start + interval * i).toFixed(2);
    const out = `${framePrefix}-${i + 1}.jpg`;
    await runProcess('ffmpeg', ['-y', '-ss', ts, '-i', videoPath, '-frames:v', '1', '-q:v', '3', out], 30000);
    frames.push(out);
  }
  return frames;
}

async function getWhisperTranscript(videoPath, audioPath, txtPath) {
  try {
    await runProcess('ffmpeg', ['-y', '-i', videoPath, '-vn', '-q:a', '5', audioPath], 60000);
    await runProcess('whisper', [
      audioPath, '--model', 'tiny',
      '--output_format', 'txt', '--output_dir', '/tmp',
      '--verbose', 'False',
    ], 60000);
    return (await fs.readFile(txtPath, 'utf-8').catch(() => '')).trim();
  } catch (e) {
    console.log('[analyze-video] Whisper 스킵:', e.message);
    return '';
  }
}

async function runCombinedAnalysis(videoPath, framePrefix, url, transcript) {
  const frames = await extractFrames(videoPath, framePrefix);
  const frameList = frames.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const snippet = transcript
    ? (transcript.length > 3500 ? transcript.slice(0, 3500) + '...' : transcript)
    : '';
  const transcriptBlock = snippet
    ? `\n[음성 전사 (참고용, 보조 단서)]\n${snippet}\n`
    : '\n[음성 전사]\n(없음 — 프레임 이미지 기반으로만 분석)\n';

  const prompt = `당신은 주짓수(BJJ) 전문가입니다. 아래 이미지는 한 BJJ 영상에서 시간 순서대로 추출한 프레임이며, 음성 전사가 있을 수도 있습니다.
두 정보를 종합해 영상이 다루는 핵심 내용을 2~4줄로 요약해주세요.

[분석 방향]
- **프레임 이미지(시각 정보)를 주축으로 분석**. 보이는 포지션·자세·기술·전환을 구체적으로 식별
- 음성 전사는 보조 단서로만 사용. 숫자 카운팅·무의미한 발화는 무시하고, 기술명·포인트가 언급된 경우에만 활용
- 음성이 없거나 무의미해도 프레임만으로 충분히 요약 가능해야 함
- 시각과 음성이 상충하면 **시각 정보 우선**
- BJJ 전문 용어 사용 (사이드 컨트롤, 마운트, 가드, 하프가드, 패스, 스윕, 서브미션 등)
- 과장 없이 간결하게 (3~6문장)
- 응답은 평문만 (JSON 래핑·마크다운 헤더 금지)

[응답 형식]
- 주제가 바뀌면 줄바꿈(빈 줄 1개)으로 구분
- 항목 나열 시 각 항목을 새 줄에 배치

[영상 URL]
${url}

[프레임 이미지 파일 경로 — Read 툴로 각 파일을 순서대로 읽어 시각 분석해주세요]
${frameList}
${transcriptBlock}`;

  const out = (await runClaude(prompt, { tools: 'Read' })).trim();
  return { description: out, frames };
}

// clipId 있으면 프레임을 영구 저장, 없으면 임시 파일로 처리 후 삭제
// onProgress(percent 0-100, stage string) — 진행 단계 콜백 (선택)
async function analyzeVideo(url, clipId = null, onProgress = null) {
  const rand    = Math.random().toString(36).slice(2, 8);
  const tmpBase = `/tmp/bjj-video-${Date.now()}-${rand}`;
  const videoPath = `${tmpBase}.mp4`;
  const audioPath = `${tmpBase}.mp3`;
  const txtPath   = `${tmpBase}.txt`;

  // clipId가 있으면 프레임 저장 디렉토리 준비 (UPLOAD_PATH 환경변수 반영)
  const persistDir = clipId ? getFramesDir(clipId) : null;
  if (persistDir) ensureDir(persistDir);

  const framePrefix = persistDir
    ? path.join(persistDir, 'frame')
    : tmpBase;

  const cookieArgs = getInstagramCookieArgs(url);

  let createdFrames = [];
  try {
    onProgress?.(10, '영상 다운로드 중');
    await runProcess(YTDLP_BIN, ['-f', 'mp4/best', '-o', videoPath, '--no-warnings', ...cookieArgs, url], 300000); // 5분
    onProgress?.(35, '오디오 확인 중');
    const hasAudio = await hasAudioTrack(videoPath);
    let transcript = '';
    if (hasAudio) {
      onProgress?.(40, '음성 변환 중');
      transcript = await getWhisperTranscript(videoPath, audioPath, txtPath);
    }
    console.log('[analyze-video] hasAudio=', hasAudio, 'transcriptLen=', transcript.length, 'clipId=', clipId, 'url=', url);

    onProgress?.(65, 'AI 분석 중');
    const { description, frames } = await runCombinedAnalysis(videoPath, framePrefix, url, transcript);
    createdFrames = frames;

    // 영구 저장 경로 계산 (웹 URL)
    const savedFrames = persistDir
      ? frames.map(f => frameWebPath(clipId, path.basename(f)))
      : [];

    // 영상 파일 영구 저장 (clipId 있을 때만)
    onProgress?.(90, '파일 저장 중');
    let savedVideo = null;
    if (clipId) {
      try {
        const videoDir  = getVideoDir(clipId);
        const videoSave = path.join(videoDir, 'video.mp4');
        ensureDir(videoDir);
        await fs.copyFile(videoPath, videoSave);
        savedVideo = videoWebPath(clipId);
        console.log('[analyze-video] 영상 저장 완료:', videoSave);
      } catch (e) {
        console.error('[analyze-video] 영상 저장 실패:', e.message);
      }
    }

    onProgress?.(98, '완료 중');
    return { description, method: transcript ? 'vision+audio' : 'vision', savedFrames, savedVideo };
  } finally {
    for (const ext of ['.mp4', '.mp3', '.txt', '.srt', '.vtt', '.tsv', '.json']) {
      await fs.unlink(tmpBase + ext).catch(() => {});
    }
    // persistDir 없을 때만 프레임 삭제 (있으면 영구 보존)
    if (!persistDir) {
      for (const f of createdFrames) await fs.unlink(f).catch(() => {});
    }
  }
}

// 업로드된 로컬 파일 분석 — yt-dlp 다운로드 없이 바로 분석
// uploadedPath: multer 등이 저장한 임시 파일 경로 (분석 후 자동 삭제)
async function analyzeLocalFile(uploadedPath, clipId = null, onProgress = null) {
  const rand      = Math.random().toString(36).slice(2, 8);
  const tmpBase   = `/tmp/bjj-local-${Date.now()}-${rand}`;
  const audioPath = `${tmpBase}.mp3`;
  const txtPath   = `${tmpBase}.txt`;

  const persistDir = clipId ? getFramesDir(clipId) : null;
  if (persistDir) ensureDir(persistDir);
  const framePrefix = persistDir ? path.join(persistDir, 'frame') : tmpBase;

  let createdFrames = [];
  try {
    onProgress?.(20, '오디오 확인 중');
    const hasAudio = await hasAudioTrack(uploadedPath);
    let transcript = '';
    if (hasAudio) {
      onProgress?.(30, '음성 변환 중');
      transcript = await getWhisperTranscript(uploadedPath, audioPath, txtPath);
    }
    console.log('[analyze-local] hasAudio=', hasAudio, 'transcriptLen=', transcript.length, 'clipId=', clipId);

    onProgress?.(65, 'AI 분석 중');
    const { description, frames } = await runCombinedAnalysis(uploadedPath, framePrefix, '', transcript);
    createdFrames = frames;

    const savedFrames = persistDir
      ? frames.map(f => frameWebPath(clipId, path.basename(f)))
      : [];

    onProgress?.(90, '파일 저장 중');
    let savedVideo = null;
    if (clipId) {
      try {
        const videoDir  = getVideoDir(clipId);
        const videoSave = path.join(videoDir, 'video.mp4');
        ensureDir(videoDir);
        await fs.copyFile(uploadedPath, videoSave);
        savedVideo = videoWebPath(clipId);
        console.log('[analyze-local] 영상 저장 완료:', videoSave);
      } catch (e) {
        console.error('[analyze-local] 영상 저장 실패:', e.message);
      }
    }

    onProgress?.(98, '완료 중');
    return { description, method: transcript ? 'vision+audio' : 'vision', savedFrames, savedVideo };
  } finally {
    await fs.unlink(uploadedPath).catch(() => {});
    await fs.unlink(audioPath).catch(() => {});
    await fs.unlink(txtPath).catch(() => {});
    if (!persistDir) {
      for (const f of createdFrames) await fs.unlink(f).catch(() => {});
    }
  }
}

module.exports = {
  analyzeVideo, analyzeLocalFile,
  INSTAGRAM_COOKIE_PATH,
  hasCookieFile, hasFirefoxSession, hasInstagramAuth,
  // task-030: 관장의 `enrich_sns_links` 가 Instagram 메타를 읽을 때 **같은 인증 경로**를 쓴다.
  // 쿠키 경로·firefox 폴백 판정을 두 벌로 두면 한쪽만 고쳐진다. export 만 추가했고 함수는 무변경.
  getInstagramCookieArgs,
};
