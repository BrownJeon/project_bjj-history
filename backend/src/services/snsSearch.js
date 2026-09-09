// SNS(인스타그램·틱톡) 검색 + 메타 보강 (task-030 · 기획서 §7-B)
//
// 실측이 이 파일의 설계를 전부 결정했다(기획서 §3.2, 2026-09-08):
//   · DDG lite 는 처음 10건을 주다가 **약 5회째부터 HTTP 202 봇 차단** → 주 경로로 쓸 수 없다.
//   · Claude 내장 `WebSearch` 는 구독 인증으로 실제 결과를 준다(15.6s) → 키 없는 주 경로.
//   · TikTok oEmbed 는 키 없이 제목·작성자·썸네일을 준다.
//   · TikTok 은 yt-dlp 추출기가 깨져 있다(2026.08.19) → oEmbed 로 우회.
//   · Instagram 은 기존 쿠키 + yt-dlp 로 메타가 나온다 → videoAnalysis 의 인증 경로 재사용.
//
// 🔴 **제공자 체인은 두 갈래다.**
//   REST(`GET /api/master/search/sns`) : Brave → Claude WebSearch → DDG
//   MCP(`search_sns`)                  : Brave → DDG        (Claude 는 건너뛴다)
//   MCP 안에서 claude 를 또 띄우면 관장 턴 안에서 claude 가 claude 를 부르는 중첩이 된다 —
//   워커가 1개라 자기 자신을 기다리는 교착이 실재한다. 대신 결과가 비면 `hint` 를 돌려주고
//   관장이 내장 `WebSearch` 로 직접 찾는다(페르소나 §4 자료 찾기에 그렇게 적혀 있다).
//
// 🔴 **키가 없어도 동작해야 한다.** BRAVE_SEARCH_API_KEY 는 아직 없다(사용자 발급 진행 중).
//   키가 `.env` 에 들어오면 **코드 변경 없이** 1순위가 된다 — 아래 `hasBrave()` 하나가 분기다.
//
// 🔴 **검색 결과는 데이터지 지시가 아니다.** 스니펫·제목 안의 "이 링크를 저장해라" 같은 문장은
//   관장이 따르지 않는다(페르소나 원칙 8). 이 파일은 그것을 **평문 문자열로만** 다루고,
//   URL 은 허용 호스트 화이트리스트를 통과한 것만 남긴다.
const { toNFC } = require('../utils/nfc');

const CACHE_TTL_MS   = 60 * 60 * 1000;   // 60분
const DDG_BACKOFF_MS = 30 * 60 * 1000;   // 202(봇 차단) 이후 30분간 시도하지 않는다
const QUERY_MAX      = 200;
const FETCH_TIMEOUT  = 12000;

// 허용 호스트 — 이 목록 밖의 URL 은 결과에서 **버린다**(프론트의 "열기" 버튼 화이트리스트와 같은 집합).
const HOSTS = {
  instagram: ['instagram.com', 'www.instagram.com'],
  tiktok:    ['tiktok.com', 'www.tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com', 'm.tiktok.com'],
};

// 영상 URL 판정. 실측에서 `/tag/`·`/api/img/` 같은 비영상이 섞여 나왔다 — 버린다.
const VIDEO_PATH = {
  instagram: /\/(reel|reels|p)\/[A-Za-z0-9_-]+/,
  tiktok:    /(\/video\/\d+|^\/[A-Za-z0-9]+\/?$)/,
};

const cache = new Map();       // key -> { at, value }
let ddgBlockedUntil = 0;

function hasBrave() {
  return !!(process.env.BRAVE_SEARCH_API_KEY || '').trim();
}

/** 검색어 정본화 — 제어문자 제거 + NFC + 200자 상한. 셸에 들어가지 않지만 URL 에는 들어간다. */
function sanitizeQuery(raw) {
  return toNFC(String(raw ?? ''))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, QUERY_MAX);
}

/** URL → 플랫폼. 허용 호스트가 아니면 null. */
function platformOf(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl)); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  for (const [platform, hosts] of Object.entries(HOSTS)) {
    if (hosts.includes(host)) return platform;
  }
  return null;
}

/**
 * URL 정규화 — 추적 파라미터만 제거하고 **경로는 건드리지 않는다.**
 * 🔴 짧게 만들거나 다시 조립하지 않는다. 프론트의 "열기" 버튼이 이 값을 글자 그대로 쓰고,
 *    QA 가 tool_log 의 url 과 바이트 대조한다(Q12b).
 */
function normalizeUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl)); } catch { return null; }
  const drop = ['igshid', 'igsh', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                '_r', '_t', 'is_from_webapp', 'sender_device', 'refer', 'referer_url', 'referer_video_id'];
  for (const k of drop) u.searchParams.delete(k);
  u.hash = '';
  return u.toString().replace(/\?$/, '');
}

/** 영상 URL 인가 — 플랫폼 + 경로 형태 둘 다 본다. */
function isVideoUrl(rawUrl, platform) {
  const p = platformOf(rawUrl);
  if (!p) return false;
  if (platform && platform !== 'all' && p !== platform) return false;
  let u;
  try { u = new URL(String(rawUrl)); } catch { return false; }
  if (p === 'instagram') return VIDEO_PATH.instagram.test(u.pathname);
  // vt./vm. 단축 링크는 경로가 짧은 코드 하나다 — 그것도 영상이다.
  if (/^(vt|vm)\./.test(u.hostname)) return /^\/[A-Za-z0-9]+\/?$/.test(u.pathname);
  return /\/video\/\d+/.test(u.pathname);
}

/**
 * 틱톡 **주제 페이지**(`/discover/…`) 인가.
 * 🔴 영상이 아니다 — `isVideoUrl` 은 그대로 두고 여기서 따로 판정한다. 실측(2026-09-09)에서
 *   Brave 의 틱톡 색인이 주제 페이지 중심이라 영상이 0건인 질의가 있었다. 그럴 때 "없다"고 하는 것보다
 *   "이 주제 페이지에서 골라 보라"가 낫다 — 단, **영상인 척하면 안 된다**(kind:'topic' 으로 표시).
 */
function isTiktokTopicUrl(rawUrl) {
  if (platformOf(rawUrl) !== 'tiktok') return false;
  let u;
  try { u = new URL(String(rawUrl)); } catch { return false; }
  return /^\/discover\/[^/]+\/?$/.test(u.pathname);
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.value;
}
function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value });
  // 무한 성장 방지 — 개인 앱이라 200개면 충분하고, 넘치면 가장 오래된 것부터 버린다.
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

/** AbortController 로 감싼 fetch — 응답이 없는 외부 서비스가 관장 턴을 잡아먹지 않게. */
async function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

function siteQuery(query, platform) {
  if (platform === 'instagram') return `site:instagram.com ${query}`;
  if (platform === 'tiktok')    return `site:tiktok.com ${query}`;
  return `${query} (site:instagram.com OR site:tiktok.com)`;
}

// ── 제공자 1: Brave Search API ───────────────────────────────────────────────
// 키가 없으면 호출조차 하지 않는다. 키가 들어오면 이 함수가 자동으로 1순위가 된다.

/** Brave 한 번 호출. 실패·비정상 응답이면 null. */
async function braveOnce(siteQ, count) {
  const key = (process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (!key) return null;
  const url = 'https://api.search.brave.com/res/v1/web/search?q='
    + encodeURIComponent(siteQ) + '&count=' + count;
  const res = await fetchWithTimeout(url, {
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': key },
  });
  if (!res.ok) {
    console.error(`[snsSearch] brave ${res.status} q="${siteQ}"`);
    return null;
  }
  const json = await res.json().catch(() => null);
  const items = json?.web?.results || [];
  return items.map((r) => ({ url: r.url, title: r.title || '', snippet: r.description || '' }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Brave 검색.
 *
 * 🔴 **틱톡은 질의를 두 번 던진다**(2026-09-09 실측, task-030 D-2).
 *   `site:tiktok.com 주짓수 니슬라이드 패스` → 15건이 **전부 `/discover/` 주제 페이지**라 영상 0건.
 *   같은 뜻인데 `… 영상` 한 단어를 붙이면 개별 영상이 2건 나온다. 색인 편향이라 질의 하나로는
 *   정당한 결과를 통째로 잃는다. 두 결과를 합쳐서 넘기고, 영상 우선 판정은 호출부가 한다.
 *   무료 플랜은 초당 1회 제한이라 두 번째 호출 전에 첫 호출로부터 1.1초를 채운다(429 회피).
 */
async function searchBrave(query, platform, limit) {
  const key = (process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (!key) return null;
  const count = Math.min(20, limit * 3);
  const t0 = Date.now();
  const first = await braveOnce(siteQuery(query, platform), count);
  if (platform !== 'tiktok') return first;

  await sleep(Math.max(0, 1100 - (Date.now() - t0)));
  let second = null;
  try {
    second = await braveOnce(`${siteQuery(query, platform)} 영상`, count);
  } catch (e) {
    console.error('[snsSearch] brave 2차 질의 실패(1차 결과로 진행):', e.message);
  }
  if (!first && !second) return null;
  // url 로 dedupe — 두 질의는 겹치는 결과가 많다.
  const seen = new Set();
  const merged = [];
  for (const r of [...(first || []), ...(second || [])]) {
    if (!r || !r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    merged.push(r);
  }
  return merged;
}

// ── 제공자 2: Claude 내장 WebSearch 를 구조화 호출 ───────────────────────────
// 🔴 **REST 경로에서만** 쓴다(파일 상단 주석 참고). MCP 는 이걸 건너뛴다.
async function searchViaClaude(query, platform, limit) {
  const { runClaude } = require('./claudeCli');
  const q = siteQuery(query, platform);
  const prompt = [
    '아래 검색어로 웹을 검색해서, 인스타그램 릴스 또는 틱톡 영상 링크만 골라 JSON 으로 주세요.',
    '규칙: 실제 검색 결과에 있는 URL 만 쓰고 링크를 지어내지 마세요. 해시태그 페이지·프로필 페이지는 제외하고 개별 영상만 고르세요.',
    `검색어: ${q}`,
    `최대 ${limit}건.`,
    '형식: {"results":[{"url":"...","title":"...","snippet":"..."}]}',
  ].join('\n');
  const jsonSchema = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: { url: { type: 'string' }, title: { type: 'string' }, snippet: { type: 'string' } },
          required: ['url'],
        },
      },
    },
    required: ['results'],
  };
  const raw = await runClaude(prompt, {
    tools: ['WebSearch'], model: 'haiku', maxTurns: 4, timeoutMs: 90000, jsonSchema,
  });
  const text = typeof raw === 'string' ? raw : (raw && raw.text) || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch { return null; }
  const items = Array.isArray(parsed?.results) ? parsed.results : [];
  return items.map((r) => ({ url: r.url, title: r.title || '', snippet: r.snippet || '' }));
}

// ── 제공자 3: DuckDuckGo lite (최후 폴백) ────────────────────────────────────
// 🔴 실측에서 5회째부터 202(봇 차단)다. **주 경로가 아니다.** 202 를 받으면 30분간 시도하지 않는다 —
//    계속 두드리면 차단이 길어지고, 그동안 다른 경로까지 느려진다.
async function searchDdg(query, platform, limit) {
  if (Date.now() < ddgBlockedUntil) {
    console.error('[snsSearch] ddg 백오프 중 — 건너뜀');
    return null;
  }
  const body = new URLSearchParams({ q: siteQuery(query, platform) }).toString();
  const res = await fetchWithTimeout('https://lite.duckduckgo.com/lite/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
    body,
  });
  if (res.status === 202 || res.status === 403 || res.status === 429) {
    ddgBlockedUntil = Date.now() + DDG_BACKOFF_MS;
    console.error(`[snsSearch] ddg ${res.status} — 30분 백오프`);
    return null;
  }
  if (!res.ok) return null;
  const html = await res.text();
  const out = [];
  // DDG lite 는 결과 링크를 `/l/?uddg=<encoded>` 로 감싼다.
  const re = /uddg=([^"&]+)/g;
  let m;
  while ((m = re.exec(html)) !== null && out.length < limit * 4) {
    let decoded;
    try { decoded = decodeURIComponent(m[1]); } catch { continue; }
    out.push({ url: decoded, title: '', snippet: '' });
  }
  return out;
}

/**
 * SNS 검색.
 * @param opts.allowClaude REST 경로에서만 true(파일 상단 주석 참고)
 * @returns {{provider, results:[{url,platform,title,snippet}], hint?, cached:boolean}}
 */
async function search(rawQuery, opts = {}) {
  const query = sanitizeQuery(rawQuery);
  const platform = ['instagram', 'tiktok'].includes(opts.platform) ? opts.platform : 'all';
  const limit = Math.max(1, Math.min(8, parseInt(opts.limit, 10) || 5));
  const allowClaude = opts.allowClaude === true;
  if (!query) return { provider: 'none', results: [], cached: false, hint: '검색어를 입력해 주세요' };

  const key = `${platform}|${limit}|${allowClaude ? 'c' : 'n'}|${query}`;
  const hit = cacheGet(key);
  if (hit) return { ...hit, cached: true };

  const chain = [['brave', searchBrave]];
  if (allowClaude) chain.push(['claude-websearch', searchViaClaude]);
  chain.push(['ddg-lite', searchDdg]);

  let provider = 'none';
  let raw = [];
  const rawByProvider = [];   // [name, items] — 영상이 0건일 때 주제 페이지 폴백에 다시 쓴다
  for (const [name, fn] of chain) {
    if (name === 'brave' && !hasBrave()) continue;
    let got = null;
    try {
      got = await fn(query, platform, limit);
    } catch (e) {
      console.error(`[snsSearch] ${name} 실패:`, e.message);
      continue;
    }
    if (!got || !got.length) continue;
    rawByProvider.push([name, got]);
    // 허용 호스트 + 영상 경로만 남기고 url 로 dedupe.
    const seen = new Set();
    const filtered = [];
    for (const r of got) {
      const norm = normalizeUrl(r.url);
      if (!norm || !isVideoUrl(norm, platform)) continue;
      if (seen.has(norm)) continue;
      seen.add(norm);
      filtered.push({
        url: norm,
        platform: platformOf(norm),
        // 개별 영상. 아래 폴백이 돌려주는 주제 페이지(kind:'topic')와 구별하려고 명시한다.
        kind: 'video',
        title: toNFC(String(r.title || '')).slice(0, 200),
        snippet: toNFC(String(r.snippet || '')).slice(0, 300),
      });
      if (filtered.length >= limit) break;
    }
    if (filtered.length) { provider = name; raw = filtered; break; }
  }

  // 🔴 틱톡 주제 페이지 폴백 — 영상이 한 건도 안 남았을 때만. **최대 3건.**
  //   영상을 못 찾았는데 빈손으로 돌려주면 관장은 "없다"고 말하고 끝난다. 주제 페이지는 그 안에
  //   실제 영상이 모여 있는 정당한 출발점이라 알려 주는 편이 낫다. 단 `kind:'topic'` 을 붙여
  //   **영상이 아님을 명시**한다 — 페르소나 §4 가 이걸 보고 "주제 페이지"라고 말하게 되어 있다.
  //   author·duration 은 조회하지 않으므로 null 이다(없는 값을 지어내지 않는다).
  if (!raw.length && platform === 'tiktok') {
    for (const [name, got] of rawByProvider) {
      const seen = new Set();
      const topics = [];
      for (const r of got) {
        const norm = normalizeUrl(r.url);
        if (!norm || !isTiktokTopicUrl(norm) || seen.has(norm)) continue;
        seen.add(norm);
        topics.push({
          url: norm,
          platform: 'tiktok',
          kind: 'topic',
          title: toNFC(String(r.title || '')).slice(0, 200),
          snippet: toNFC(String(r.snippet || '')).slice(0, 300),
          author: null,
          duration: null,
        });
        if (topics.length >= 3) break;
      }
      if (topics.length) { provider = name; raw = topics; break; }
    }
  }

  const value = {
    provider,
    results: raw,
    ...(raw.length ? {} : {
      hint: 'WebSearch 에 site:instagram.com 또는 site:tiktok.com 을 붙여 직접 검색해 보세요',
    }),
  };
  // 빈 결과도 캐시한다 — 안 하면 검색이 실패할 때마다 외부 서비스를 계속 두드린다.
  cacheSet(key, value);
  return { ...value, cached: false };
}

// ── 메타 보강 ────────────────────────────────────────────────────────────────

/** TikTok oEmbed — 키 없이 제목·작성자·썸네일. 실측 ✅ */
async function enrichTiktok(url) {
  const res = await fetchWithTimeout('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url));
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  if (!j) return null;
  return {
    title: toNFC(String(j.title || '')).slice(0, 300),
    author: toNFC(String(j.author_name || '')).slice(0, 100),
    thumb: j.thumbnail_url || null,
    duration: null,
  };
}

/**
 * Instagram — 기존 쿠키(videoAnalysis.getInstagramCookieArgs)로 yt-dlp. 실측 ✅ 30.1s
 *
 * 🔴 `--ignore-no-formats-error` 가 있어야 한다(2026-09-09 실측).
 *   증상: 일부 게시물이 `ERROR: [Instagram] <shortcode>: No video formats found!` 로 exit 1 이라
 *   제목·작성자까지 통째로 사라졌다. **인자 문제가 아니었다** — 같은 쿠키·같은 명령을 셸에서 직접
 *   걸어도 그 게시물만 실패한다(DPqGSfGjbqo 실패 / DYlojTXODJf 성공). 즉 yt-dlp 가 그 게시물의
 *   **재생 포맷**을 못 찾은 것이고, 메타데이터(title·uploader·thumbnail)는 정상적으로 나온다.
 *   여기는 **메타만 읽는 경로다** — 다운로드하지 않으므로(`--skip-download`) 포맷은 애초에 필요 없다.
 *   이 플래그로 포맷 부재를 "빈 formats 배열"로 낮추면 exit 0 + info JSON 을 받는다.
 *   `duration` 은 포맷에서 오는 값이라 그런 건에서는 null 이 된다 — 없는 값을 지어내지 않는다.
 *   🔴 videoAnalysis 의 **다운로드** 경로에는 절대 넣지 않는다. 거기서 포맷이 없으면 그건 진짜 실패다.
 */
async function enrichInstagram(url) {
  const { spawn } = require('child_process');
  const { getInstagramCookieArgs } = require('./videoAnalysis');
  const { YTDLP_BIN } = require('./ytdlp');
  const cookieArgs = getInstagramCookieArgs(url) || [];
  const out = await new Promise((resolve) => {
    // 🔴 PATH 가 아니라 해석된 절대경로로 부른다(task-030 D-2). PATH 에서 ~/.local/bin 이 빠진
    //   pm2 프로세스에서 이 spawn 이 ENOENT 로 죽었고, 아래 on('error') 가 그걸 **메시지 없이**
    //   삼켜서 로그에는 `instagram yt-dlp 실패: `(빈 문자열)만 남았다 — 원인을 못 찾은 이유다.
    const proc = spawn(YTDLP_BIN, [
      '--dump-json', '--no-warnings', '--skip-download', '--ignore-no-formats-error',
      ...cookieArgs, url,
    ]);
    let buf = '', err = '';
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } }, 45000);
    proc.stdout.on('data', (d) => { buf += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => {
      clearTimeout(timer);
      // 🔴 code·message 를 반드시 남긴다. ENOENT 면 "yt-dlp 를 못 찾았다"이지 "게시물이 이상하다"가 아니다.
      console.error(`[snsSearch] instagram yt-dlp 실행 실패: code=${e.code || '?'} bin=${YTDLP_BIN} ${e.message}`);
      resolve(null);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { console.error('[snsSearch] instagram yt-dlp 실패:', err.trim().slice(0, 200)); return resolve(null); }
      resolve(buf);
    });
  });
  if (!out) return null;
  let j;
  try { j = JSON.parse(out.trim().split('\n')[0]); } catch { return null; }
  return {
    title: toNFC(String(j.title || j.description || '')).slice(0, 300),
    author: toNFC(String(j.uploader || j.channel || '')).slice(0, 100),
    thumb: j.thumbnail || null,
    duration: Number.isFinite(Number(j.duration)) ? Math.floor(Number(j.duration)) : null,
  };
}

/**
 * SNS 링크 메타 보강 + 이미 저장된 참고영상인지 대조.
 * 🔴 **실패한 건을 버리지 않는다.** `ok:false` 로 남긴다 — 조용히 사라지면 관장이 "왜 3개만
 *    보이지"를 알 수 없고, 사용자는 링크가 잘못된 줄 안다(/api/holes 의 linked:false 와 같은 규약).
 * @param urls 최대 6개
 * @param uid  video_clips 대조용 사용자 id
 */
async function enrichLinks(urls, uid) {
  const { sequelize } = require('../config/db');
  const list = (Array.isArray(urls) ? urls : []).slice(0, 6);

  const normed = [];
  for (const raw of list) {
    const norm = normalizeUrl(raw);
    const platform = norm ? platformOf(norm) : null;
    if (!norm || !platform) {
      normed.push({ url: String(raw).slice(0, 300), platform: null, ok: false, error: '지원하지 않는 주소입니다' });
      continue;
    }
    normed.push({ url: norm, platform, ok: true });
  }

  // 이미 저장된 참고영상인지 — URL 그대로 비교(정규화한 값끼리).
  let savedSet = new Set();
  try {
    const [rows] = await sequelize.query('SELECT url FROM video_clips WHERE user_id = ?', { replacements: [uid] });
    savedSet = new Set(rows.map((r) => normalizeUrl(r.url) || String(r.url)));
  } catch (e) {
    console.error('[snsSearch] video_clips 대조 실패:', e.message);
  }

  const out = [];
  for (const item of normed) {
    if (!item.ok) { out.push({ ...item, alreadySaved: false }); continue; }
    let meta = null;
    try {
      meta = item.platform === 'tiktok' ? await enrichTiktok(item.url) : await enrichInstagram(item.url);
    } catch (e) {
      console.error('[snsSearch] enrich 실패:', item.url, e.message);
    }
    out.push({
      url: item.url,
      platform: item.platform,
      title: meta?.title ?? null,
      author: meta?.author ?? null,
      duration: meta?.duration ?? null,
      thumb: meta?.thumb ?? null,
      alreadySaved: savedSet.has(item.url),
      ok: !!meta,
      ...(meta ? {} : { error: '메타 정보를 읽지 못했습니다 (링크 자체는 열 수 있어요)' }),
    });
  }
  return out;
}

module.exports = {
  search, enrichLinks,
  // 아래는 검증용 export 다 — Reviewer/QA 가 HTTP·외부 서비스 없이 필터를 직접 찌를 수 있어야 한다
  // (허용 호스트 밖 URL 이 결과에 남으면 프론트의 "열기" 버튼 화이트리스트와 어긋난다).
  sanitizeQuery, platformOf, normalizeUrl, isVideoUrl, isTiktokTopicUrl, siteQuery, HOSTS,
};
