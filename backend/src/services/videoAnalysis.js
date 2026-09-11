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
 * 걷어낸 첫 에러 줄이 **어떤 종류의 실패인지** 기계가 읽는 이름으로 돌려준다(task-034).
 *
 * 🔴 호출부가 사진 경로로 전환할지 판단할 때 **한국어 번역 문장으로 판정하면 안 된다.**
 *    번역 문구는 UX 개선으로 언제든 다듬어지고, 그 순간 전환 조건이 조용히 죽는다.
 *    판정은 항상 이 `kind`(번역 표의 키) 로 한다.
 * @returns {string} 'no-video' | 'not-found' | ''(모르는 에러)
 */
function classifyYtDlpError(firstError) {
  const line = String(firstError || '').trim();
  if (!line) return '';
  const hit = YTDLP_ERROR_TRANSLATIONS.find(t => t.test.test(line));
  return hit ? hit.kind : '';
}

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
/**
 * 게시물 항목(캐러셀이면 장마다 1개)을 JSON 으로 읽어 온다.
 *
 * 🔴 `--ignore-no-formats-error` 가 쓰이는 곳은 **이 함수 하나뿐**이다. 다운로드 경로에는
 *    절대 넣지 않는다(D-2·task-033 결정) — 거기서 포맷이 없으면 그건 진짜 실패다.
 *    task-033 은 이 응답을 "사진 장수 세기"에만 썼고, task-034 는 같은 응답에서 **사진 URL 과
 *    캡션까지** 가져다 쓴다. 호출을 두 벌로 두면 한쪽만 고쳐지므로 여기로 합쳤다.
 * @returns {Promise<object[]>} 파싱된 항목 배열(빈 배열이면 읽지 못했다는 뜻)
 */
async function fetchPostEntries(url, timeoutMs = 30000) {
  if (!url) return [];
  const out = await runProcess(YTDLP_BIN, [
    '--dump-json', '--skip-download', '--ignore-no-formats-error', '--no-warnings',
    ...getInstagramCookieArgs(url), url,
  ], timeoutMs, { diagnose: false }); // diagnose:false — 진단 호출이 또 진단을 부르지 않게
  return out.split('\n').map(s => s.trim()).filter(Boolean)
    .map(s => { try { return JSON.parse(s); } catch { return null; } })
    .filter(Boolean);
}

async function probePhotoCount(url) {
  if (!url) return 0;
  try {
    const entries = await fetchPostEntries(url);
    if (!entries.length) return 0;
    // 하나라도 포맷이 있으면 "사진 N장" 이라고 단정하지 않는다 — 영상이 섞인 캐러셀일 수 있다.
    if (entries.some(e => Array.isArray(e.formats) && e.formats.length > 0)) return 0;
    return entries.length;
  } catch (e) {
    console.error('[yt-dlp][diag] 사진 장수 조회 실패(장수 없이 진행):', e.message);
    return 0;
  }
}

/**
 * yt-dlp 실패 → 사용자에게 보일 최종 문장 **+ 실패 종류**.
 * 전부 잡음이면 기존처럼 종료 코드 문구로 떨어진다(kind 는 빈 문자열).
 *
 * 🔴 반환이 문자열에서 객체로 바뀌었다(task-034). 호출부(runProcess)가 `kind` 를 Error 에
 *    붙여야 `analyzeVideo` 가 "영상 없음"을 사진 분석으로 전환할 수 있다. 사용자 문장 자체는
 *    task-033 과 **글자 하나 다르지 않다**.
 */
async function buildYtDlpUserMessage({ err, out, code, cmd, args, diagnose }) {
  const lines = cleanYtDlpStderr(err);
  const first = firstYtDlpError(lines);
  if (!first) {
    // 걷어내고 나니 남는 게 없다 = stderr 가 전부 잡음이었다. 옛 동작 그대로.
    return {
      message: (String(out || '').trim() || `${cmd} 종료 코드: ${code}`).slice(0, 300),
      kind: '', photoCount: 0,
    };
  }
  const kind = classifyYtDlpError(first);
  let photoCount = 0;
  // 표의 첫 항목을 인덱스로 집던 것을 kind 비교로 바꿨다 — 표 순서가 바뀌어도 안 깨진다.
  if (diagnose && kind === 'no-video') {
    photoCount = await probePhotoCount(urlFromArgs(args));
  }
  return { message: translateYtDlpError(first, { photoCount }), kind, photoCount };
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
            .then(({ message, kind, photoCount }) => {
              const e = new Error(message);
              // 🔴 실패 **종류**를 Error 에 표시로 붙인다(task-034). 호출부가 한국어 메시지를
              //    문자열 매칭해 분기하면, 문구를 다듬는 순간 그 분기가 조용히 죽는다.
              e.ytdlpKind = kind;
              if (photoCount) e.ytdlpPhotoCount = photoCount;
              reject(e);
            })
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

// ── 사진 게시물 분석 (task-034) ─────────────────────────────────────────────
//
// 영상이 하나도 없는 게시물(인스타 사진 캐러셀)은 지금까지 그냥 실패했다 — task-033 이 실패
// **이유**를 한국어로 알려주는 데까지 했고, 여기서부터는 **실패 대신 사진을 분석**한다.
//
// 🔴 **장수 상한을 두지 않는다.** 사용자 지시 원문:
//    "사진 게시물의 경우에는 기존에 영상분석시 10장으로 제한되어있는것에 구애받지 않고
//     모든 캐러셀 사진을 다운받아서 처리해줘"
//    영상 쪽 장수 제한(extractFrames 의 12/15장)은 **긴 영상에서 표본을 뽑기 위한** 제약이다.
//    사진은 그 자체가 전부라 표본을 뽑을 이유가 없고, 캐러셀은 인스타 자체 상한(20장)으로
//    이미 유한하다. 아래 selectPhotoEntries 가 "자르지 않는다"는 것을 지키는 자리다.

const PHOTO_DOWNLOAD_CONCURRENCY = 3;      // 인스타 CDN 부담·차단 회피 (계약 M-2)
const PHOTO_DOWNLOAD_TIMEOUT_MS  = 30000;  // 장당 상한
const PHOTO_META_TIMEOUT_MS      = 30000;  // 사진 목록(JSON) 조회 상한
// 일부 CDN 은 UA 없는 요청을 막는다. 항목이 주는 http_headers(Referer 등)와 함께 보낸다.
const PHOTO_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 🔴 **사진 분석 타임아웃은 장수에 비례한다.**
//    근거: 이 분석은 Claude 가 `Read` 툴로 사진을 **한 장씩 직접 연다**. 영상 프레임은 ffmpeg 이
//    만든 작은 JPEG(12~15장)이지만, 인스타 원본은 3274x4096 · 약 800KB 다(2026-09-11 실측).
//    장수만큼 Read 왕복이 선형으로 늘어나므로 runClaude 기본값 180s 로는 20장짜리를 못 넘긴다.
//    산식: 60s(기동·프롬프트 처리) + 20s × 장수, 상한 600s.
//    상한을 두는 이유: claudeCli 의 실행 큐 동시성이 1이라, 한 건이 오래 잡으면 뒤가 전부 밀린다.
const PHOTO_ANALYSIS_BASE_MS      = 60000;
const PHOTO_ANALYSIS_PER_PHOTO_MS = 20000;
const PHOTO_ANALYSIS_MAX_MS       = 600000;

function photoAnalysisTimeoutMs(count) {
  const n = Math.max(1, Number(count) || 1);
  return Math.min(PHOTO_ANALYSIS_MAX_MS, PHOTO_ANALYSIS_BASE_MS + PHOTO_ANALYSIS_PER_PHOTO_MS * n);
}

/**
 * 내려받을 캐러셀 항목 목록.
 *
 * 🔴 **여기서 자르지 않는다.** 사용자 지시가 "모든 캐러셀 사진"이다. 한 줄짜리 함수로 따로
 *    빼 둔 이유는 단 하나 — 나중에 누가 `.slice(0, N)` 을 슬그머니 넣으면 하네스가 **여기서**
 *    잡기 위해서다(역검증이 이 함수를 중성화해 검사가 실제로 죽는지 확인한다).
 */
function selectPhotoEntries(entries) {
  return Array.isArray(entries) ? entries.filter(Boolean) : [];
}

/**
 * 한 캐러셀 항목에서 **가장 큰 이미지 URL** 을 고른다.
 *
 * 🔴 계약서(M-2)는 "thumbnails 중 width 기준 최대"였는데 **인스타 항목에는 width 가 없다**
 *    (2026-09-11 실측: thumbnails 14개 전부 키가 `url`·`id` 뿐, width/height/preference 없음).
 *    width 로 정렬하면 값이 전부 undefined 라 비교가 항상 거짓 → **0번**이 뽑히는데,
 *    0번은 `stp=...s1080x1080` = **1080x1080 으로 잘린 정사각(71KB)** 이다. 원본은 **마지막**
 *    항목(`stp=dst-jpg_e35_tt6`, **3274x4096 · 804,592 bytes** — Leader 실측치와 일치)이다.
 *    yt-dlp 규약이 "thumbnails 는 나쁜 것 → 좋은 것 순서"이고 `entry.thumbnail` 도 마지막과
 *    같은 URL 이었다. 그래서 width 가 **있으면** 그것을 쓰고(다른 추출기 대비),
 *    없으면 **배열 순서**를 믿는다. 계약서의 "width 기준"만 그대로 구현했으면 잘린 썸네일을
 *    원본으로 착각해 저장했을 자리다.
 */
function pickBestPhotoUrl(entry) {
  const thumbs = Array.isArray(entry && entry.thumbnails)
    ? entry.thumbnails.filter(t => t && t.url)
    : [];
  if (thumbs.length) {
    const sized = thumbs.filter(t => Number.isFinite(Number(t.width)));
    if (sized.length) return sized.reduce((a, b) => (Number(b.width) > Number(a.width) ? b : a)).url;
    return thumbs[thumbs.length - 1].url;
  }
  return (entry && (entry.thumbnail || entry.url)) || '';
}

// content-type 으로 확장자를 정한다(모르면 .jpg — 인스타는 전부 jpeg 를 준다).
const PHOTO_EXT_BY_MIME = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
  'image/webp': '.webp', 'image/gif': '.gif',
};

/** 사진 1장 다운로드. 장당 상한 30초. 실패는 던진다(호출부가 나머지로 진행한다). */
async function downloadOnePhoto(imgUrl, basePath, headers, fetchImpl = fetch) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PHOTO_DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetchImpl(imgUrl, {
      signal: ac.signal,
      headers: { 'User-Agent': PHOTO_USER_AGENT, ...(headers || {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('빈 응답(0바이트)');
    const mime = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const finalPath = basePath + (PHOTO_EXT_BY_MIME[mime] || '.jpg');
    await fs.writeFile(finalPath, buf);
    return { path: finalPath, bytes: buf.length };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 캐러셀 사진을 **전부** 내려받는다(상한 없음). 동시 3장.
 *
 * 🔴 개별 장이 실패해도 **나머지로 진행**한다(계약 M-2). 한 장의 CDN 오류로 게시물 전체
 *    분석을 잃는 게 더 나쁘다. 실패 장수는 결과에 담아 호출부가 알 수 있게 한다.
 * 파일명은 **게시물 순서를 보존**한다(`photo-1`, `photo-2` …) — 화면이 이 순서로 넘긴다.
 * @param {object[]} entries 항목 배열
 * @param {string}   basePrefix 예: `<framesDir>/photo`
 * @param {{onProgress?:Function, sink?:string[], fetchImpl?:Function}} opts
 *        sink: 만들어진 파일 경로를 즉시 넣어 둘 배열(중간에 터져도 호출부가 지울 수 있게)
 */
async function downloadPhotos(entries, basePrefix, opts = {}) {
  const { onProgress, sink, fetchImpl } = opts;
  const jobs = selectPhotoEntries(entries);
  const files = new Array(jobs.length).fill(null);
  const failures = [];
  let cursor = 0, done = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const idx = cursor++;
      const entry = jobs[idx];
      try {
        const imgUrl = pickBestPhotoUrl(entry);
        if (!imgUrl) throw new Error('이미지 URL을 찾지 못했습니다');
        const r = await downloadOnePhoto(
          imgUrl, `${basePrefix}-${idx + 1}`, entry && entry.http_headers, fetchImpl || fetch
        );
        files[idx] = r.path;
        if (sink) sink.push(r.path);
      } catch (e) {
        failures.push({ index: idx + 1, reason: e.message });
        console.error(`[photo] ${idx + 1}번째 사진 실패(나머지로 진행):`, e.message);
      } finally {
        done++;
        onProgress?.(done, jobs.length);
      }
    }
  }

  const workers = Math.min(PHOTO_DOWNLOAD_CONCURRENCY, jobs.length);
  await Promise.all(Array.from({ length: workers }, worker));
  // files 는 인덱스 자리에 채워 넣었으므로 실패분만 빠지고 **순서는 그대로**다.
  return { files: files.filter(Boolean), failures };
}

/**
 * 사진 분석 프롬프트. 출력 모양은 기존 영상 분석과 **같다**(화면이 그대로 쓴다).
 * 🔴 "영상"이 아니라 "사진 N장으로 이루어진 게시물"임을 명시한다 — 그러지 않으면 모델이
 *    없는 동작·전환을 지어낸다(정지 사진이라 시간축이 없다).
 */
function buildPhotoPrompt(photoPaths, url, caption) {
  const list = photoPaths.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const cap = String(caption || '').trim();
  const capBlock = cap
    ? `\n[게시물 캡션 (작성자가 직접 쓴 글 — 기술명·의도의 단서)]\n${cap.length > 1200 ? cap.slice(0, 1200) + '...' : cap}\n`
    : '\n[게시물 캡션]\n(없음 — 사진만으로 분석)\n';

  return `당신은 주짓수(BJJ) 전문가입니다. 아래는 **영상이 아니라 사진 ${photoPaths.length}장으로 이루어진 게시물**이며, 사진은 게시물에 실린 순서대로 나열되어 있습니다.
사진을 순서대로 모두 읽고, 게시물이 다루는 핵심 내용을 요약해주세요.

[분석 방향]
- **사진 ${photoPaths.length}장을 전부 순서대로 확인**한 뒤 요약. 일부만 보고 단정하지 말 것
- 연속 사진이면 동작의 진행 순서(그립 → 체중 이동 → 마무리)로 읽고, 독립된 장면이면 각각의 포인트를 정리
- 사진에 글자(자막·설명 텍스트)가 있으면 그 내용을 적극 활용
- 캡션은 보조 단서. 해시태그·홍보 문구는 무시하고 기술명·의도가 담긴 부분만 활용
- 사진과 캡션이 상충하면 **사진 우선**
- BJJ 전문 용어 사용 (사이드 컨트롤, 마운트, 가드, 하프가드, 패스, 스윕, 서브미션 등)
- 보이지 않는 동작을 지어내지 말 것 (정지 사진이라 시간 흐름이 없다)
- 과장 없이 간결하게 (3~6문장)
- 응답은 평문만 (JSON 래핑·마크다운 헤더 금지)

[응답 형식]
- 주제가 바뀌면 줄바꿈(빈 줄 1개)으로 구분
- 항목 나열 시 각 항목을 새 줄에 배치

[게시물 URL]
${url}

[사진 파일 경로 — Read 툴로 각 파일을 순서대로 읽어 시각 분석해주세요]
${list}
${capBlock}`;
}

/**
 * 사진 게시물 분석 본체.
 *
 * @returns {Promise<object|null>} 분석 결과. **사진을 한 장도 확보 못하면 null** —
 *          호출부가 원래의 yt-dlp 실패(task-033 메시지)로 되돌린다.
 */
async function analyzePhotoPost(url, clipId, onProgress, ctx) {
  const { persistDir, photoPrefix, sink } = ctx;

  onProgress?.(15, '사진 목록 확인 중');
  let entries = [];
  try {
    entries = await fetchPostEntries(url, PHOTO_META_TIMEOUT_MS);
  } catch (e) {
    console.error('[photo] 사진 목록 조회 실패:', e.message);
    return null;
  }
  const targets = selectPhotoEntries(entries);
  if (!targets.length) return null;

  console.log(`[photo] 사진 게시물로 전환 — ${targets.length}장 (상한 없음) url=${url}`);
  onProgress?.(20, `사진 0/${targets.length} 내려받는 중`);
  const { files, failures } = await downloadPhotos(targets, photoPrefix, {
    sink,
    onProgress: (done, total) => {
      // 20% → 60% 구간을 다운로드에 배분한다(그 뒤가 AI 분석).
      const pct = 20 + Math.round((done / total) * 40);
      onProgress?.(pct, `사진 ${done}/${total} 내려받는 중`);
    },
  });
  if (!files.length) {
    console.error('[photo] 사진을 한 장도 받지 못했다 — 원래 실패로 되돌린다');
    return null;
  }

  // 캡션은 항목마다 같은 값이 들어온다(게시물 글 하나) — 비어 있지 않은 첫 값을 쓴다.
  const caption = (targets.find(e => String(e && e.description || '').trim()) || {}).description || '';

  onProgress?.(65, `사진 ${files.length}장 분석 중`);
  const prompt = buildPhotoPrompt(files, url, caption);
  const description = (await runClaude(prompt, {
    tools: 'Read',
    timeoutMs: photoAnalysisTimeoutMs(files.length),
  })).trim();

  onProgress?.(90, '파일 저장 중');
  const savedFrames = persistDir
    ? files.map(f => frameWebPath(clipId, path.basename(f)))
    : [];

  if (failures.length) {
    console.error(`[photo] ${failures.length}장 실패, ${files.length}장으로 진행:`,
      failures.map(f => `${f.index}(${f.reason})`).join(', '));
  }
  onProgress?.(98, '완료 중');
  return {
    description,
    // 기존 필드는 모양을 그대로 유지한다 — 호출부 4곳(clips 2·techniques 1·enhance-memo 1)이
    // savedFrames/description/savedVideo 를 그대로 쓰고 있어 분기를 하나도 안 건드려도 된다.
    method: 'photo-vision',
    savedFrames,
    savedVideo: null,
    // 계약 M-4 — 호출부가 "사진 게시물이었다"를 구분할 수 있게(프론트 표시는 다음 단계).
    mediaKind: 'photo',
    photoCount: files.length,
    photoFailed: failures.length,
  };
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
  // 사진은 프레임과 **같은 저장소**를 쓰되 파일명만 구분한다(계약 M-2: 새 저장소를 만들지 않는다).
  // clipId 가 없으면 /tmp 에 떨어뜨리고 finally 에서 지운다.
  const photoPrefix = persistDir
    ? path.join(persistDir, 'photo')
    : `${tmpBase}-photo`;

  const cookieArgs = getInstagramCookieArgs(url);

  let createdFrames = [];
  try {
    onProgress?.(10, '영상 다운로드 중');
    try {
      // 🔴 여기에는 `--ignore-no-formats-error` 를 넣지 않는다(D-2·task-033 결정 유지).
      //    다운로드 경로에서 포맷이 없으면 그건 진짜 실패이고, 그 실패를 **아래에서** 받아
      //    사진 경로로 전환한다. 플래그로 덮으면 실패 자체가 사라져 분기할 근거를 잃는다.
      await runProcess(YTDLP_BIN, ['-f', 'mp4/best', '-o', videoPath, '--no-warnings', ...cookieArgs, url], 300000); // 5분
    } catch (e) {
      // 영상이 없는 게시물(사진 캐러셀)만 전환 대상이다. 인증 실패·삭제된 게시물 등은 그대로 던진다.
      // 🔴 판정은 한국어 메시지가 아니라 runProcess 가 붙인 기계용 표시(`ytdlpKind`)로 한다.
      if (!e || e.ytdlpKind !== 'no-video') throw e;
      console.log('[analyze-video] 영상 없음 → 사진 게시물 분석으로 전환:', url);
      const photoResult = await analyzePhotoPost(url, clipId, onProgress, {
        persistDir, photoPrefix,
        // sink: 사진 경로를 createdFrames 에 바로 넣어 두면, persistDir 이 없을 때
        //       아래 finally 가 기존 프레임과 똑같이 청소한다(임시 파일이 남지 않는다).
        sink: createdFrames,
      });
      // 사진도 0장이면 전환할 게 없다 — task-033 이 만든 원래 실패 메시지를 그대로 돌려준다.
      if (!photoResult) throw e;
      return photoResult;
    }
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
  // task-034: 사진 경로. 하네스가 네트워크 없이(fetchImpl 주입) 장수 상한·순서·부분 실패·
  // 타임아웃 산식을 직접 잰다.
  classifyYtDlpError, fetchPostEntries, analyzePhotoPost,
  selectPhotoEntries, pickBestPhotoUrl, downloadPhotos, downloadOnePhoto,
  buildPhotoPrompt, photoAnalysisTimeoutMs,
  PHOTO_DOWNLOAD_CONCURRENCY, PHOTO_ANALYSIS_BASE_MS, PHOTO_ANALYSIS_PER_PHOTO_MS,
  PHOTO_ANALYSIS_MAX_MS,
};
