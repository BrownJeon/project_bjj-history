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

// ── Instagram 로그인 세션 실제 유효성 검사 (task-031) ────────────────────────
//
// 🔴 **파일 존재 여부만 보면 안 된다.** 2026-09-10 실측: `sessionid` 가 하나도 없는 쿠키
//   파일이 저장돼 있는데도 화면은 "✓ Instagram 쿠키 인증됨 — AI 분석 가능"을 띄웠고,
//   실제 분석은 "로그인 인증이 필요"로 실패했다. 릴(reel)은 로그인 없이도 받아지기 때문에
//   평소엔 티가 안 나다가, 로그인이 필수인 스토리(stories)에서만 터져 원인 파악이 어려웠다.
//
// Netscape 쿠키 형식: domain \t flag \t path \t secure \t expiry \t name \t value
// cookiePath 는 테스트에서 합성 파일을 넣어보기 위한 주입 지점이다(운영 경로가 기본값).
function inspectInstagramCookie(cookiePath = INSTAGRAM_COOKIE_PATH) {
  if (!fsSync.existsSync(cookiePath)) return { ok: false, reason: 'none', expiresAt: null };
  let text;
  try { text = fsSync.readFileSync(cookiePath, 'utf8'); }
  catch { return { ok: false, reason: 'unreadable', expiresAt: null }; }

  const now = Math.floor(Date.now() / 1000);
  let expiredAt = null; // sessionid 는 있는데 만료된 경우를 구분하기 위해 기억해둔다

  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const f = line.split('\t');
    if (f.length < 7) continue;
    if (f[5] !== 'sessionid') continue;
    if (!/(^|\.)instagram\.com$/.test(String(f[0]).replace(/^\./, '.'))) continue;
    const exp = parseInt(f[4], 10) || 0;
    if (exp && exp <= now) { expiredAt = new Date(exp * 1000); continue; } // 만료 — 다음 줄 계속 확인
    return { ok: true, reason: 'ok', expiresAt: exp ? new Date(exp * 1000) : null }; // exp 0 = 세션 쿠키
  }
  return { ok: false, reason: expiredAt ? 'expired' : 'no-session', expiresAt: expiredAt };
}

// 쿠키 파일이 "로그인된" 상태인지 (존재 여부가 아니라 sessionid 유효성 기준)
function hasInstagramSession() { return inspectInstagramCookie().ok; }

// 실패 메시지에 붙일 구체적 안내 — 사용자가 무엇을 해야 하는지 알 수 있어야 한다
function instagramAuthHint() {
  const { reason, expiresAt } = inspectInstagramCookie();
  if (reason === 'none')       return '저장된 Instagram 쿠키가 없습니다. 프로필 > Instagram 쿠키 인증에서 쿠키 파일을 올려주세요.';
  if (reason === 'unreadable') return '저장된 Instagram 쿠키 파일을 읽을 수 없습니다. 다시 올려주세요.';
  if (reason === 'expired')    return `저장된 Instagram 쿠키의 로그인 세션이 만료되었습니다(${expiresAt.toLocaleDateString('ko-KR')}). 로그인한 상태에서 쿠키를 다시 내보내 올려주세요.`;
  if (reason === 'no-session') return '저장된 Instagram 쿠키에 로그인 세션(sessionid)이 없습니다 — 로그아웃 상태에서 내보낸 파일입니다. Instagram에 로그인한 브라우저에서 쿠키를 다시 내보내 올려주세요.';
  return '로그인 세션은 저장돼 있으나 Instagram이 이 게시물 접근을 거부했습니다. 비공개 계정이거나 세션이 무효화됐을 수 있습니다.';
}

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

// ── yt-dlp stderr 정제 · 번역 (task-033) ────────────────────────────────────
//
// 🔴 **yt-dlp 는 성공할 때도 stderr 에 잡음을 쏟는다.** 2026-09-11 실측: 정상 릴·유튜브를
//    `--dump-json` 으로 조회하면 exit 0 인데도 stderr 첫 줄이 Python deprecation 경고다.
//    그런데 실패 메시지는 stderr **원문을 그대로** 사용자에게 보여줬다(옛 116행 `err.trim()`).
//    그 결과 사용자가 "파이썬 버전 만료" 를 원인으로 오진했고, 진짜 원인
//    (`No video formats found` = 사진만 있는 게시물)은 뒤에 묻혔다.
//
// 🔴 **걷어내는 것은 사용자에게 보이는 문장뿐이다.** 서버 로그(console.error)에는 stderr
//    원문 전체를 남긴다 — 진단에 필요하다.
//
// 패턴을 정규식 한 줄로 뭉뚱그리지 않고 목록으로 둔다. yt-dlp 가 문구를 바꾸면 여기만 고치면 된다.

// (1) 줄 단위 잡음 — 이 줄 자체가 통째로 버려진다.
const YTDLP_NOISE_LINE_PATTERNS = [
  // yt-dlp 2026.08.19 + python 3.10.12 조합에서 **매 실행마다** 나온다(성공·실패 무관).
  // 경고일 뿐이고 yt-dlp 는 정상 동작한다 — 원인이 아니다.
  /^Deprecated Feature:\s*Support for Python version/i,
  // 위 경고가 두 줄로 나뉘는 버전이 있다 — 이어지는 안내 줄.
  /^You will no longer receive updates on this version/i,
  // 문구가 바뀌어도 'Deprecated Feature:' 계열은 전부 안내다.
  /^Deprecated Feature:/i,
  // 아래 3종은 yt-dlp 의 상투적인 버그리포트 안내다. 독립된 줄로 나오는 판본에 대비한다
  // (현재 판본은 ERROR 줄 **안에** 붙여 보내므로 (2) 에서도 같이 지운다).
  /^please report this issue on/i,
  /^filling out the appropriate issue template/i,
  /^Confirm you are on the latest version using/i,
];

// (2) 줄 **안에** 붙어 오는 잡음 꼬리 — 줄은 남기고 꼬리만 잘라낸다.
//     2026-09-11 실측 원문(한 줄):
//       ERROR: [Instagram] Dc94vlzzASW: No video formats found!; please report this issue on
//       https://github.com/yt-dlp/yt-dlp/issues?q= , filling out the appropriate issue template.
//       Confirm you are on the latest version using  yt-dlp -U
//     → 세미콜론 뒤는 전부 상투 문구다. 원인은 세미콜론 앞까지다.
const YTDLP_NOISE_INLINE_PATTERNS = [
  // 버그리포트 유도 꼬리(세미콜론 이후 전체).
  /;\s*please report this issue on[\s\S]*$/i,
  // 위 꼬리가 세미콜론 없이 붙는 판본 대비.
  /\s*Confirm you are on the latest version using\s+yt-dlp -U\.?\s*$/i,
  // 쿠키 FAQ 링크 안내 — 인증 분기에서 이미 한국어 안내를 주므로 사용자에겐 중복이다.
  /\s*See\s+https?:\/\/github\.com\/yt-dlp\/yt-dlp\/wiki\/FAQ\S*\s*for how to manually pass cookies\.?\s*$/i,
];

/**
 * stderr 에서 사용자에게 보일 "의미 있는 줄"만 남긴다.
 * @param {string} raw yt-dlp stderr 원문
 * @param {{dropWarnings?: boolean}} opts
 * @returns {string[]} 잡음을 걷어낸 줄 목록(빈 배열이면 전부 잡음이었다는 뜻)
 */
function cleanYtDlpStderr(raw, { dropWarnings = true } = {}) {
  const lines = String(raw || '')
    .split('\n')
    .map(l => l.replace(/\r$/, '').trim())
    .filter(Boolean)
    .filter(l => !YTDLP_NOISE_LINE_PATTERNS.some(re => re.test(l)))
    .map(l => YTDLP_NOISE_INLINE_PATTERNS.reduce((s, re) => s.replace(re, ''), l).trim())
    .filter(Boolean);

  // WARNING 은 **진짜 에러가 따로 있을 때만** 버린다. 경고밖에 없으면 그게 유일한 단서다.
  const hasError = lines.some(l => /^ERROR:/i.test(l));
  return (dropWarnings && hasError) ? lines.filter(l => !/^WARNING:/i.test(l)) : lines;
}

/** 걷어낸 줄 중 기준으로 삼을 첫 에러 줄(없으면 첫 줄, 그것도 없으면 빈 문자열). */
function firstYtDlpError(lines) {
  return (lines || []).find(l => /^ERROR:/i.test(l)) || (lines || [])[0] || '';
}

// (3) 알려진 실패 → 사용자가 무엇을 해야 하는지 아는 한국어 문장. 원문은 서버 로그에만 남는다.
const YTDLP_ERROR_TRANSLATIONS = [
  {
    kind: 'no-video',
    // 사진만 있는 게시물(캐러셀 포함). 2026-09-11 사용자 실패 건(clip 182)의 진짜 원인이다.
    test: /No video formats found|No video could be found in this|There's no video/i,
    message: '이 게시물에는 영상이 없습니다 — 사진만 있는 게시물이에요. 영상 게시물이나 릴(reel) 주소를 넣어 주세요.',
  },
  {
    kind: 'not-found',
    // 삭제·비공개·오타난 주소. 인스타는 없는 shortcode 에 HTTP 400 을 준다(2026-09-11 실측:
    // `Video info extraction failed: HTTP Error 400: Bad Request`) — 문구에 'unavailable' 이 없다.
    test: /Video unavailable|This post is not available|Post unavailable|no longer available|has been removed|Private video|Video info extraction failed.*HTTP Error 4\d\d|HTTP Error 404/i,
    message: '게시물을 찾을 수 없거나 비공개입니다. 주소가 맞는지, 공개 게시물인지 확인해 주세요.',
  },
];

/**
 * 걷어낸 첫 에러 줄을 한국어 문장으로. 아는 패턴이 없으면 원문 첫 줄을 그대로 붙인다.
 * @param {string} firstError 걷어낸 첫 에러 줄
 * @param {{photoCount?: number}} opts photoCount>0 이면 "사진 N장" 을 넣는다(L-3)
 */
function translateYtDlpError(firstError, { photoCount = 0 } = {}) {
  const line = String(firstError || '').trim();
  if (!line) return '';
  const hit = YTDLP_ERROR_TRANSLATIONS.find(t => t.test.test(line));
  if (!hit) {
    return '영상을 받지 못했습니다 — ' + line.replace(/^ERROR:\s*/i, '').slice(0, 200);
  }
  if (hit.kind === 'no-video' && photoCount > 0) {
    return `이 게시물에는 영상이 없습니다 — 사진 ${photoCount}장만 있는 게시물이에요. `
         + '영상 게시물이나 릴(reel) 주소를 넣어 주세요.';
  }
  return hit.message;
}

/** args 배열에서 대상 URL 을 되찾는다(마지막 http(s) 인자). */
function urlFromArgs(args) {
  for (let i = (args || []).length - 1; i >= 0; i--) {
    if (/^https?:\/\//i.test(String(args[i]))) return String(args[i]);
  }
  return '';
}

/**
 * L-3 — "영상이 없다"로 실패했을 때 **사진이 몇 장인지** 세는 진단 조회.
 *
 * 🔴 `--ignore-no-formats-error` 를 **다운로드 경로에 넣지 마라**(D-2 결정). 거기서 포맷이
 *    없으면 그건 진짜 실패다. 이 플래그는 오직 여기 — 이미 실패한 뒤, 1회만, 30초 상한으로 —
 *    쓰인다. 정상 경로 성능에는 아무 영향이 없다.
 * @returns {Promise<number>} 사진 장수(0이면 "모르겠다" — 장수 없이 기본 문구로 떨어진다)
 */
async function probePhotoCount(url) {
  if (!url) return 0;
  try {
    const out = await runProcess(YTDLP_BIN, [
      '--dump-json', '--skip-download', '--ignore-no-formats-error', '--no-warnings',
      ...getInstagramCookieArgs(url), url,
    ], 30000, { diagnose: false }); // diagnose:false — 진단 호출이 또 진단을 부르지 않게
    const entries = out.split('\n').map(s => s.trim()).filter(Boolean)
      .map(s => { try { return JSON.parse(s); } catch { return null; } })
      .filter(Boolean);
    if (!entries.length) return 0;
    // 하나라도 포맷이 있으면 "사진 N장" 이라고 단정하지 않는다 — 영상이 섞인 캐러셀일 수 있다.
    if (entries.some(e => Array.isArray(e.formats) && e.formats.length > 0)) return 0;
    return entries.length;
  } catch (e) {
    console.error('[yt-dlp][diag] 사진 장수 조회 실패(장수 없이 진행):', e.message);
    return 0;
  }
}

/** yt-dlp 실패 → 사용자에게 보일 최종 문장. 전부 잡음이면 기존처럼 종료 코드 문구로 떨어진다. */
async function buildYtDlpUserMessage({ err, out, code, cmd, args, diagnose }) {
  const lines = cleanYtDlpStderr(err);
  const first = firstYtDlpError(lines);
  if (!first) {
    // 걷어내고 나니 남는 게 없다 = stderr 가 전부 잡음이었다. 옛 동작 그대로.
    return (String(out || '').trim() || `${cmd} 종료 코드: ${code}`).slice(0, 300);
  }
  let photoCount = 0;
  if (diagnose && YTDLP_ERROR_TRANSLATIONS[0].test.test(first)) {
    photoCount = await probePhotoCount(urlFromArgs(args));
  }
  return translateYtDlpError(first, { photoCount });
}

// opts.diagnose=false 로 부르면 실패 시 추가 진단 조회를 하지 않는다(진단 조회 자신이 쓴다).
function runProcess(cmd, args, timeoutMs = 180000, opts = {}) {
  const { diagnose = true } = opts;
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
        // 🔴 서버 로그에는 stderr **원문을 그대로** 남긴다(task-033). 사용자 메시지에서만
        //    잡음을 걷어낸다 — 원문이 없으면 다음 장애 때 원인을 못 찾는다.
        if (isYtDlp && err.trim()) {
          console.error(`[yt-dlp] exit=${code} url=${urlFromArgs(args)} stderr(원문):\n${err.trim()}`);
        }
        // yt-dlp Instagram 인증 에러 감지
        if (isYtDlp && /instagram/i.test(args.join(' ')) &&
            // 'content is unreachable' 는 스토리에서 실제로 돌아오는 문구다(2026-09-10 실측).
            // 기존 패턴만으로도 'authentication' 에 걸리긴 했으나, 문구가 바뀌면 조용히 빠지므로 명시한다.
            /empty media response|login required|authentication|content is unreachable|cookies-from-browser/i.test(err)) {
          const hint = instagramAuthHint();
          return reject(new Error('Instagram 영상 다운로드에 로그인 인증이 필요합니다.' + (hint ? ' ' + hint : '')));
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
        // yt-dlp 는 잡음을 걷어내고 한국어로 번역해서 준다(task-033 L-1·L-2·L-3).
        if (isYtDlp) {
          return buildYtDlpUserMessage({ err, out, code, cmd, args, diagnose })
            .then(msg => reject(new Error(msg)))
            // 번역기 자체가 터져도 실패 사유는 반드시 전달돼야 한다 — 옛 동작으로 떨어진다.
            .catch(() => reject(new Error(
              (err.trim() || out.trim() || `${cmd} 종료 코드: ${code}`).slice(0, 300)
            )));
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
  inspectInstagramCookie, hasInstagramSession, instagramAuthHint,
  // task-030: 관장의 `enrich_sns_links` 가 Instagram 메타를 읽을 때 **같은 인증 경로**를 쓴다.
  // 쿠키 경로·firefox 폴백 판정을 두 벌로 두면 한쪽만 고쳐진다. export 만 추가했고 함수는 무변경.
  getInstagramCookieArgs,
  // task-033: 잡음 제거·번역은 하네스에서 실제 stderr 원문으로 단위 검사한다.
  cleanYtDlpStderr, firstYtDlpError, translateYtDlpError, probePhotoCount,
  YTDLP_NOISE_LINE_PATTERNS, YTDLP_NOISE_INLINE_PATTERNS,
};
