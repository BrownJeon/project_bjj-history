// 관장 턴 오케스트레이터 (task-030 · 계약 B).
//
// 한 턴이 하는 일: 락 → 메시지 2행 INSERT → 프롬프트 조립 → claude(stream-json) → 이벤트 중계 →
// 저장 → 이 메시지의 제안 카드 조회 → `done`.
//
// 🔴 **프롬프트에 넣는 것은 세 가지뿐이다** — 오늘 날짜 · 훈련생 헤더(≤600자) · 최근 12개 메시지(≤8,000자).
//   나머지는 관장이 도구로 본다. 이게 MCP 방식을 고른 이유고(기획서 §4), 24,000자 캡을
//   구조적으로 지키는 방법이다. 여기에 "요약을 미리 넣어 주면 편하겠는데" 를 더하는 순간 캡이 무너진다.
//
// 🔴 **`tool_log.videos` 는 관장 본문이 아니라 tool_result 에서 온다.** 본문에서 URL 을 정규식으로
//   긁으면 (1) 모델이 줄인 링크·오타에 깨지고 (2) 웹 검색 결과에 심어진 URL 을 관장이 본문에
//   복사하도록 유도하는 인젝션이 그대로 "열기" 버튼이 된다. 도구가 실제로 돌려준 URL 만 남긴다.
//
// 🔴 **동시 턴은 사용자당 1개다.** 메모리 락 + DB 의 `status='pending'` 을 **둘 다** 본다.
//   메모리만 보면 재시작 후 잔존 pending 을 못 잡고, DB 만 보면 같은 순간의 두 요청이 둘 다 통과한다.
const path = require('path');
const { sequelize } = require('../config/db');
const { runClaude } = require('./claudeCli');
const { loadPersona, AGENT_NAME } = require('./gymMasterPersona');

const MCP_SERVER_PATH = path.resolve(__dirname, '../mcp/gymMasterServer.js');

const TEXT_MAX      = 2000;    // 사용자 메시지 1건
const WINDOW_MSGS   = 12;      // 재전송하는 최근 메시지 수
const WINDOW_CHARS  = 8000;    // 창 합계 상한
const HEADER_CHARS  = 600;     // 훈련생 헤더 상한
const TURN_TIMEOUT  = 240000;
const MAX_TURNS     = 12;
const MAX_VIDEOS    = 12;
const VALID_MODELS  = ['opus', 'sonnet', 'haiku'];

// 진행 중인 턴 — userId → true. 프로세스 로컬이다(pm2 단일 프로세스라 이걸로 충분하다).
const running = new Map();

// 진행 중인 턴의 **표시용 상태** — chatId → { chatId, userId, messageId, label, startedAt, startedAtMs }.
//
// 🔴 이건 락이 아니다. 동시 턴 차단은 위의 `running`(userId) + DB `status='pending'` 이 맡는다.
//    이 레지스트리는 **끊어진 클라이언트가 다시 붙기 위한 이정표**다(task-030 D-1).
//    SSE 가 끊겨도 턴은 계속 돌지만(라우트의 req.on('close') 는 쓰기만 멈춘다) 클라이언트가
//    "지금도 돌고 있다"를 알 방법이 없어 화면이 "network error" 를 띄웠다. 서버 성공 = 화면 실패.
// 🔴 프로세스 로컬이라 재시작하면 비는데, 그건 결함이 아니라 옳다 — 재시작하면 턴도 죽고,
//    부팅 시 pending→failed 마킹(index.js)이 그 사실을 대신 알려준다. 폴링은 failed 를 보고 멈춘다.
// 🔴 반드시 지워져야 한다. 남으면 화면이 영원히 "답변 중"으로 굳는다 —
//    done/error 직전과 runTurn 의 finally 에서 **두 번** 지운다(타임아웃·예외 경로 포함).
const runningTurns = new Map();

/** 레지스트리 행 → 응답 뷰. 내부 필드(userId·startedAtMs)는 내보내지 않는다. */
function runningView(rec, opts = {}) {
  if (!rec) return null;
  const v = {
    messageId: rec.messageId,
    label: rec.label,
    startedAt: rec.startedAt,           // ISO 8601 (UTC) — 경과시간 계산용
    elapsedMs: Date.now() - rec.startedAtMs,
  };
  // 409 처럼 "어느 대화의 턴인지"가 응답만 봐선 안 정해지는 자리에서만 붙인다.
  if (opts.withChatId) v.chatId = rec.chatId;
  return v;
}

/** 이 대화에 진행 중인 턴 — 없으면 null. */
function getRunningTurn(chatId) {
  return runningView(runningTurns.get(Number(chatId)));
}

/** 이 사용자에게 진행 중인 턴 — **다른 대화의 것일 수 있어** chatId 를 함께 준다. */
function getRunningTurnForUser(userId) {
  const uid = Number(userId);
  for (const rec of runningTurns.values()) {
    if (rec.userId === uid) return runningView(rec, { withChatId: true });
  }
  return null;
}

/** 목록용 boolean. */
function isChatRunning(chatId) {
  return runningTurns.has(Number(chatId));
}

// ── status 라벨 (계약 B) ─────────────────────────────────────────────────────
// 🔴 도구 이름을 그대로 보여주지 않는다. `mcp__bjj__get_holes` 는 사용자에게 아무 뜻이 없다.
const TOOL_LABELS = {
  get_trainee_profile: '기록 살펴보는 중',
  get_holes: '구멍 목록 보는 중',
  get_mastery: '숙련도 보는 중',
  search_records: '기록 검색 중',
  list_research_projects: '연구 트리 보는 중',
  get_research_project: '연구 트리 보는 중',
  get_weekly_task: '이번 주 과제 보는 중',
  list_positions: '포지션 확인 중',
  search_techniques: '기술트리 찾는 중',
  list_my_clips: '저장된 참고영상 확인 중',
  search_videos: '유튜브 찾는 중',
  search_sns: 'SNS 찾는 중',
  WebSearch: 'SNS 찾는 중',
  enrich_sns_links: '링크 확인 중',
  propose_research_project: '제안 만드는 중',
  propose_research_nodes: '제안 만드는 중',
  propose_node_links: '제안 만드는 중',
  propose_weekly_task: '제안 만드는 중',
};

/** `mcp__bjj__get_holes` → `get_holes`. 내장 도구(WebSearch)는 그대로. */
function shortToolName(raw) {
  const s = String(raw || '');
  const m = s.match(/^mcp__[^_]+(?:_[^_]+)*?__(.+)$/) || s.match(/^mcp__.+?__(.+)$/);
  return m ? m[1] : s;
}
function labelFor(tool) {
  return TOOL_LABELS[tool] || '생각하는 중';
}

/** 프로필의 관장 모델 — NULL 이면 기본 opus. 알 수 없는 값도 opus 로 떨어뜨린다(조용히 죽지 않게). */
async function resolveModel(userId) {
  const [[row]] = await sequelize.query(
    'SELECT master_model FROM profile WHERE user_id = ? LIMIT 1', { replacements: [userId] }
  ).catch(() => [[]]);
  const v = row && row.master_model ? String(row.master_model) : null;
  return VALID_MODELS.includes(v) ? v : 'opus';
}

// ── 프롬프트 조립 ────────────────────────────────────────────────────────────

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function todayLine() {
  // KST 기준. toISOString() 은 UTC 로 하루를 민다 — 이 앱이 여러 번 당한 실패다.
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const ymd = now.toISOString().slice(0, 10);
  return `[오늘] ${ymd} (${WEEKDAY[now.getUTCDay()]})`;
}

/** 훈련생 헤더 — 닉네임·벨트·열린 과제·연구 프로젝트 수. 600자 상한. */
async function buildHeader(userId) {
  const parts = [];
  try {
    const [[p]] = await sequelize.query(
      'SELECT nickname FROM profile WHERE user_id = ? LIMIT 1', { replacements: [userId] });
    const [[b]] = await sequelize.query(
      `SELECT belt, stripes FROM belt_history WHERE user_id = ?
        ORDER BY achieved_date DESC, id DESC LIMIT 1`, { replacements: [userId] });
    const [[t]] = await sequelize.query(
      `SELECT n.label FROM research_tasks t
         JOIN research_nodes    n ON n.id = t.node_id
         JOIN research_versions v ON v.id = n.version_id
         JOIN research_projects p ON p.id = v.project_id
        WHERE p.user_id = ? AND t.closed_at IS NULL LIMIT 1`, { replacements: [userId] });
    const [[c]] = await sequelize.query(
      'SELECT COUNT(*) AS n FROM research_projects WHERE user_id = ?', { replacements: [userId] });

    parts.push(`닉네임: ${p && p.nickname ? p.nickname : '(없음)'}`);
    if (b && b.belt) parts.push(`벨트: ${b.belt}${b.stripes ? ` ${b.stripes}줄` : ''}`);
    parts.push(`열린 과제: ${t && t.label ? t.label : '없음'}`);
    parts.push(`연구 프로젝트: ${c ? Number(c.n) : 0}개`);
  } catch (e) {
    console.error('[masterChat] 헤더 조립 실패:', e.message);
  }
  return `[훈련생] ${parts.join(' · ')}`.slice(0, HEADER_CHARS);
}

/**
 * 대화 창 — 최근 12개, 합계 8,000자. **오래된 것부터 자른다.**
 * 🔴 자를 때 최근 것을 남긴다. 앞부분을 남기면 관장이 방금 한 말을 못 보고 같은 질문을 반복한다.
 */
function buildWindow(rows) {
  const recent = rows.slice(-WINDOW_MSGS);
  const lines = recent.map((m) => `${m.role === 'user' ? '훈련생' : '관장'}: ${String(m.content || '').trim()}`);
  let total = lines.reduce((n, l) => n + l.length + 1, 0);
  while (lines.length > 1 && total > WINDOW_CHARS) {
    total -= lines[0].length + 1;
    lines.shift();
  }
  // 한 줄이 통째로 넘치면 그 줄을 자른다(예: 사용자가 2,000자를 썼고 관장이 6,500자를 답한 경우).
  if (lines.length === 1 && lines[0].length > WINDOW_CHARS) lines[0] = lines[0].slice(-WINDOW_CHARS);
  return lines;
}

async function buildPrompt(userId, chatId, upToMessageId) {
  const [rows] = await sequelize.query(
    `SELECT role, content FROM master_messages
      WHERE chat_id = ? AND id <= ? AND status <> 'failed' AND content <> ''
      ORDER BY id ASC`,
    { replacements: [chatId, upToMessageId] }
  );
  const header = await buildHeader(userId);
  return [
    todayLine(),
    header,
    '',
    '[대화]',
    ...buildWindow(rows),
    '',
    '[지시] 위 대화의 마지막 훈련생 말에 답하세요.',
  ].join('\n');
}

// ── 도구 이벤트 수집 ─────────────────────────────────────────────────────────

/**
 * stream-json 이벤트에서 도구 사용·결과를 짝지어 tools[]·videos[] 를 만든다.
 * 🔴 videos 는 **tool_result 의 JSON** 에서만 뽑는다(파일 상단 주석 참고).
 */
function makeCollector(emit) {
  const tools = [];
  const pending = new Map();   // tool_use_id → { name, at }
  const videos = [];
  const seenUrl = new Set();

  const pushVideo = (v) => {
    if (!v || !v.url || seenUrl.has(v.url) || videos.length >= MAX_VIDEOS) return;
    seenUrl.add(v.url);
    videos.push({
      url: String(v.url),
      platform: v.platform || 'youtube',
      title: v.title ? String(v.title).slice(0, 200) : '',
      author: v.channel || v.author || '',
      duration: Number.isFinite(Number(v.duration)) ? Number(v.duration) : null,
    });
  };

  const onEvent = (ev) => {
    if (!ev || typeof ev !== 'object') return;

    if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      for (const block of ev.message.content) {
        if (block && block.type === 'tool_use') {
          const name = shortToolName(block.name);
          pending.set(block.id, { name, at: Date.now() });
          emit('status', { tool: name, label: labelFor(name) });
        }
      }
      return;
    }

    if (ev.type === 'user' && ev.message && Array.isArray(ev.message.content)) {
      for (const block of ev.message.content) {
        if (!block || block.type !== 'tool_result') continue;
        const info = pending.get(block.tool_use_id) || { name: 'unknown', at: Date.now() };
        pending.delete(block.tool_use_id);
        tools.push({ name: info.name, ms: Date.now() - info.at, ok: !block.is_error });
        if (block.is_error) continue;

        // tool_result 의 텍스트를 JSON 으로 읽어 videos 를 뽑는다. 실패하면 그냥 넘어간다 —
        // 영상 카드가 하나 덜 뜨는 것은 사용자에게 보이지만, 틀린 URL 이 뜨는 것보다 낫다.
        const text = Array.isArray(block.content)
          ? block.content.filter((c) => c && c.type === 'text').map((c) => c.text).join('')
          : String(block.content ?? '');
        if (!text) continue;
        let parsed;
        try { parsed = JSON.parse(text); } catch { continue; }
        if (info.name === 'search_videos' && Array.isArray(parsed.videos)) parsed.videos.forEach(pushVideo);
        if (info.name === 'enrich_sns_links' && Array.isArray(parsed.links)) {
          parsed.links.filter((l) => l && l.ok !== false).forEach(pushVideo);
        }
        if (info.name === 'search_sns' && Array.isArray(parsed.results)) parsed.results.forEach(pushVideo);
      }
    }
  };

  return { onEvent, tools, videos };
}

// ── 턴 실행 ──────────────────────────────────────────────────────────────────

/** 진행 중인 턴이 있는가 — 메모리 락 + DB pending 을 **둘 다** 본다. */
async function hasRunningTurn(userId) {
  if (running.get(userId)) return true;
  const [[row]] = await sequelize.query(
    `SELECT m.id FROM master_messages m
       JOIN master_chats c ON c.id = m.chat_id
      WHERE c.user_id = ? AND m.status = 'pending' LIMIT 1`,
    { replacements: [userId] }
  );
  return !!row;
}

/**
 * 한 턴을 실행하고 SSE 이벤트를 `emit` 으로 흘려보낸다.
 * @param emit (event, data) => void — 라우트가 준다. 이 서비스는 res 를 모른다.
 * @returns {Promise<void>} 예외를 던지지 않는다 — 실패도 `error` 이벤트로 나간다.
 */
async function runTurn({ userId, chat, text, resumePending, emit }) {
  const chatId = Number(chat.id);
  running.set(userId, true);
  let masterMessageId = null;

  // 🔴 SSE 이벤트를 라우트로 흘려보내면서 레지스트리를 같이 갱신한다.
  //    라우트의 emit 은 연결이 끊기면 조용히 버리지만, 레지스트리는 res 와 무관하게 갱신돼야
  //    나중에 붙는 폴링이 지금 라벨을 볼 수 있다. done/error 는 **내보내기 전에** 지운다 —
  //    done 을 받은 클라이언트가 곧바로 폴링해도 running 이 null 로 보이도록.
  const track = (event, data) => {
    if (event === 'accepted') {
      const now = Date.now();
      runningTurns.set(chatId, {
        chatId,
        userId: Number(userId),
        messageId: Number(data.masterMessageId),
        label: labelFor(null),          // 도구를 부르기 전 — '생각하는 중'
        startedAt: new Date(now).toISOString(),
        startedAtMs: now,
      });
    } else if (event === 'status') {
      const rec = runningTurns.get(chatId);
      if (rec && data && data.label) rec.label = String(data.label);
    } else if (event === 'done' || event === 'error') {
      runningTurns.delete(chatId);
    }
    emit(event, data);
  };

  try {
    // ── 1. 사용자 메시지 확보 ────────────────────────────────────────────────
    let userMessageId;
    if (resumePending) {
      // 상단 바에서 만든 첫 메시지를 실행하는 경로. 마지막 메시지가 user 이고 그 뒤에 관장 답이
      // 없을 때만 성립한다(라우트가 이미 확인했다).
      const [[last]] = await sequelize.query(
        `SELECT id FROM master_messages WHERE chat_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1`,
        { replacements: [chatId] }
      );
      if (!last) throw new Error('이어서 보낼 메시지가 없습니다');
      userMessageId = Number(last.id);
    } else {
      const [r] = await sequelize.query(
        `INSERT INTO master_messages (user_id, chat_id, role, content, status, created_at)
         VALUES (?, ?, 'user', ?, 'done', ?)`,
        { replacements: [userId, chatId, text, new Date()] }
      );
      userMessageId = Number(r?.insertId ?? r);
    }

    // ── 2. 관장 메시지 자리(pending) ─────────────────────────────────────────
    const [mr] = await sequelize.query(
      `INSERT INTO master_messages (user_id, chat_id, role, content, status, created_at)
       VALUES (?, ?, 'master', '', 'pending', ?)`,
      { replacements: [userId, chatId, new Date()] }
    );
    masterMessageId = Number(mr?.insertId ?? mr);

    const model = await resolveModel(userId);
    track('accepted', { userMessageId, masterMessageId, model });

    // ── 3. 프롬프트 ──────────────────────────────────────────────────────────
    const prompt = await buildPrompt(userId, chatId, userMessageId);

    // ── 4. claude ────────────────────────────────────────────────────────────
    const { agents } = loadPersona();
    // 🔴 mcp-config 의 env 에는 BJJ_* 3개만 넣는다. DB 접속 정보는 **부모 env 상속**으로 들어간다
    //    (실측 2026-09-08: has_DB_PASS true). argv 에 비밀번호를 싣지 않는 이유다 — `ps` 에 뜬다.
    const mcpConfig = {
      mcpServers: {
        bjj: {
          command: process.execPath,
          args: [MCP_SERVER_PATH],
          env: {
            BJJ_USER_ID: String(userId),
            BJJ_CHAT_ID: String(chatId),
            BJJ_MESSAGE_ID: String(masterMessageId),
          },
        },
      },
    };

    const collector = makeCollector(track);
    const t0 = Date.now();
    const out = await runClaude(prompt, {
      agents, agent: AGENT_NAME, model,
      mcpConfig, strictMcp: true,
      tools: ['WebSearch'],
      maxTurns: MAX_TURNS,
      outputFormat: 'stream-json',
      timeoutMs: TURN_TIMEOUT,
      priority: 'interactive',
      // 🔴 재시도 1회 — stream-json 은 onEvent 가 이미 status 를 흘려보낸 뒤라, 재시도하면
      //    같은 라벨이 두 번 뜬다. 화면이 이상해지느니 한 번만 시도하고 실패를 알린다.
      maxRetries: 1,
      onEvent: collector.onEvent,
    });

    const content = String((out && out.text) || '').trim();
    const initModel = out && out.init && out.init.model ? String(out.init.model) : model;
    const toolLog = {
      model: initModel,
      durationMs: (out && out.result && out.result.duration_ms) || (Date.now() - t0),
      numTurns: (out && out.result && out.result.num_turns) || null,
      tools: collector.tools,
      videos: collector.videos,
    };

    if (!content) throw new Error('관장이 답을 만들지 못했습니다');

    // ── 5. 저장 ──────────────────────────────────────────────────────────────
    const now = new Date();
    await sequelize.query(
      `UPDATE master_messages SET content = ?, tool_log = ?, status = 'done' WHERE id = ?`,
      { replacements: [content, JSON.stringify(toolLog), masterMessageId] }
    );
    await sequelize.query(
      `UPDATE master_chats SET last_message_at = ?, preview = ?, updated_at = ? WHERE id = ?`,
      { replacements: [now, content.slice(0, 200), now, chatId] }
    );

    // ── 6. 이 메시지의 제안 카드 ─────────────────────────────────────────────
    const [actions] = await sequelize.query(
      `SELECT id, message_id, kind, payload, status, result,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_fmt
         FROM master_actions WHERE message_id = ? ORDER BY id ASC`,
      { replacements: [masterMessageId] }
    );

    track('done', {
      message: {
        id: masterMessageId, role: 'master', content,
        toolLog, status: 'done',
        createdAt: now.toISOString(),
      },
      actions: actions.map(actionView),
    });
  } catch (e) {
    const raw = (e && e.message) || String(e);
    console.error('[masterChat] 턴 실패:', raw);
    if (masterMessageId) {
      await sequelize.query(
        `UPDATE master_messages SET status = 'failed', content = '' WHERE id = ?`,
        { replacements: [masterMessageId] }
      ).catch(() => {});
    }
    track('error', { message: userFacingError(raw) });
  } finally {
    running.delete(userId);
    // 🔴 track 이 이미 지웠어도 한 번 더. 예외·타임아웃으로 done/error 를 못 낸 경로가 있으면
    //    여기가 마지막 방어선이다 — 남으면 그 대화는 영원히 "답변 중"으로 굳는다.
    runningTurns.delete(chatId);
  }
}

/** 내부 에러 → 사용자 언어. 🔴 원문은 서버 로그에만 남긴다(경로·스택이 새어 나가지 않게). */
function userFacingError(raw) {
  const s = String(raw || '');
  if (s.includes('프롬프트가 너무 깁니다')) return '대화가 길어져서 새 대화를 시작해 주세요';
  if (/제한시간|timeout|ETIMEDOUT|강제 종료/i.test(s)) return '관장님이 답을 못 했어요 — 다시 보내 주세요';
  if (s.includes('관장 정의')) return s;   // 페르소나 로더가 이미 사용자 언어로 만든 메시지
  return '관장님과 연결이 잘 안 됐어요 — 잠시 후 다시 보내 주세요';
}

/** master_actions 행 → 응답 뷰. payload·result 는 **객체로 파싱해서** 내려준다(계약 B). */
function actionView(r) {
  const parse = (v) => {
    if (v == null) return null;
    try { return JSON.parse(v); } catch { return null; }
  };
  return {
    id: Number(r.id),
    messageId: Number(r.message_id),
    kind: r.kind,
    payload: parse(r.payload) || {},
    status: r.status,
    result: parse(r.result),
    createdAt: r.created_fmt || null,
    resolvedAt: r.resolved_fmt || null,
  };
}

module.exports = {
  runTurn, hasRunningTurn, actionView, resolveModel,
  // 진행 중인 턴 조회 (task-030 D-1 · 계약 G) — 라우트가 응답에 실어 준다.
  getRunningTurn, getRunningTurnForUser, isChatRunning,
  // 검증용 export — HTTP·claude 없이 프롬프트 조립·라벨·창 자르기를 직접 찌를 수 있어야 한다.
  buildWindow, buildPrompt, shortToolName, labelFor, makeCollector,
  TEXT_MAX, WINDOW_MSGS, WINDOW_CHARS, VALID_MODELS, MCP_SERVER_PATH,
};
