// 관장실 API — /api/master/* (task-030 · 계약 B)
//
// 🔴 **소유 판별의 정본은 master_chats.user_id 하나다.** 모든 경로가 아래 `ownedChat()` 을 거치고,
//    그 SQL 은 예외 없이 master_chats 까지 조인한다. 메시지·카드도 chat 을 통해서만 닿는다.
// 🔴 **없는 것과 남의 것을 구분해 알려주지 않는다** — 둘 다 404 다(lab.js·research.js 와 같은 규칙).
//    403 은 "그 id 는 존재하지만 네 것이 아니다"를 알려주는 셈이라 id 범위를 훑어낼 수 있다.
// 🔴 SSE 는 이 파일에서만 다룬다. services/masterChat.js 는 `res` 를 모르고 `emit(event, data)` 만 안다 —
//    그래야 QA 가 프롬프트 조립·라벨·창 자르기를 HTTP 밖에서 직접 잴 수 있다(recall.js 와 같은 이유).
const express = require('express');
const router  = express.Router();
const { sequelize } = require('../models');
const { ok, fail, wrap } = require('../utils/respond');
const { toNFC } = require('../utils/nfc');
const masterChat = require('../services/masterChat');
const masterActions = require('../services/masterActions');
const sns = require('../services/snsSearch');
const { makeSnippets } = require('../services/recallSearch');

const TEXT_MAX  = 2000;
const TITLE_MAX = 100;
const LIST_MAX  = 50;

// 대화 조회(task-030 D-3) — 검색어 상한 · 스캔 상한 · 스니펫 반경.
//
// 🔴 **SQL LIKE 로 좁히지 않는다.** DB 에 NFD(자모분리)로 저장된 글자와 사용자가 친 NFC 는
//    LIKE 에서 서로 다른 문자열이다 — 에러 없이 "결과 없음"만 나와서 사용자는 자기가 잘못 친 줄 안다
//    (utils/nfc.js 의 실측 사례). 그래서 SQL 은 **소유·보관 필터로만** 좁히고, 글자 비교는
//    전부 JS 에서 `makeSnippets`(내부에서 양쪽 toNFC + 대소문자 정렬)로 한다.
//    importSearch·recallSearch 와 같은 원칙이고, 여기서 새 검색 로직을 만들지 않는 이유이기도 하다.
// 🔴 스캔 상한이 200 인 이유: 이 앱은 1인용이고 대화는 수십 건 규모다. 상한이 없으면 언젠가
//    전 대화의 MEDIUMTEXT 본문을 통째로 메모리에 올린다 — 지금 안 아프다고 상한을 빼지 않는다.
const Q_MAX          = 100;
const SCAN_MAX       = 200;
const SNIPPET_RADIUS = 40;

/** 코드포인트 기준 길이 — VARCHAR/이모지 계산이 JS .length 와 다르다. */
const cpLen = (s) => [...String(s ?? '')].length;
const clean = (s) => toNFC(String(s ?? '')).trim();
const posInt = (v) => {
  const n = parseInt(v, 10);
  return (Number.isInteger(n) && n > 0) ? n : null;
};

/** 소유가 확인된 대화 행. 없거나 남의 것이면 null → 호출부가 404. */
async function ownedChat(userId, rawId) {
  const id = posInt(rawId);
  if (id === null) return null;
  const [[row]] = await sequelize.query(
    `SELECT id, user_id, title, preview,
            DATE_FORMAT(last_message_at, '%Y-%m-%d %H:%i:%s') AS last_fmt,
            DATE_FORMAT(created_at,      '%Y-%m-%d %H:%i:%s') AS created_fmt,
            DATE_FORMAT(archived_at,     '%Y-%m-%d %H:%i:%s') AS archived_fmt
       FROM master_chats WHERE id = ? AND user_id = ? LIMIT 1`,
    { replacements: [id, userId] }
  );
  return row || null;
}

function chatView(r) {
  return {
    id: Number(r.id),
    title: r.title || '',
    preview: r.preview || '',
    lastMessageAt: r.last_fmt || null,
    createdAt: r.created_fmt || null,
    // 🔴 보관은 **목록에서만** 숨긴다 — 상세·턴·승인은 그대로 동작한다. 그래서 이 필드는
    //    `GET /chats/:id` 응답에도 그대로 실린다(프론트가 "보관됨" 표시를 할 수 있게).
    archivedAt: r.archived_fmt || null,
  };
}

// ── 대화 목록·생성 ───────────────────────────────────────────────────────────

/**
 * GET /api/master/chats?q&archived&limit — 최신순.
 *
 * - `archived` 는 `0`(기본, 진행 중) · `1`(보관됨) · `all`(전부 — task-030 D-4) 셋이다.
 *   🔴 `all` 은 조건을 안 붙이는 것뿐이고 정렬·응답 형태·`match`·`archivedAt` 은 셋 다 같다.
 *   그래서 `all` 의 건수 = `0` 의 건수 + `1` 의 건수 다(limit 안에서).
 * - `pendingActions` 는 미승인 카드 수(상단 바 배지). 🔴 배지는 **비보관 목록만** 합산한다 —
 *   기본이 `archived=0` 이고 프론트(MasterContext)가 그 기본 목록만 합산하므로, `all` 을
 *   새로 만들어도 배지·홈 한 줄은 예전 값 그대로다. 보관한 대화의 카드가 배지를
 *   계속 켜 두면 "보관했는데 왜 아직 알림이 있지"가 된다.
 * - `running` 은 그 대화에 **지금 돌고 있는 턴이 있는가**(task-030 D-1) — 목록에서는 boolean 이면 충분하다.
 * - `q` 가 있으면 제목 + 메시지 본문을 JS NFC 비교로 훑어 `match:{field, snippet}` 을 함께 준다.
 *   🔴 제목이 맞으면 본문은 안 본다(표시할 스니펫은 1건이고, 제목 일치가 사용자에게 더 명확하다).
 *   🔴 본문 조회는 **제목으로 못 맞춘 대화에 대해서만** 한다 — 200개 대화의 MEDIUMTEXT 를
 *      매번 다 읽지 않기 위한 것이고, 결과에도 영향이 없다(제목 매치가 이미 우선이므로).
 */
router.get('/chats', wrap(async (req, res) => {
  const uid = req.user.id;
  const limit = Math.max(1, Math.min(LIST_MAX, parseInt(req.query.limit, 10) || LIST_MAX));
  // 🔴 기본은 비보관이다. `archived` 를 안 보내던 기존 클라이언트가 그대로 동작한다.
  // 🔴 `all`(task-030 D-4) 은 보관 조건을 **아예 붙이지 않는다** — 진행 중 + 보관됨 전부.
  //    그 외 이상값(`2`·`yes`·빈 값)은 예전과 같이 조용히 기본 0 으로 떨어진다(400 을 새로 만들지 않는다 —
  //    기존 클라이언트가 보내던 요청의 의미를 바꾸지 않는 편이 안전하다).
  const archParam = String(req.query.archived == null ? '' : req.query.archived);
  const archived = (archParam === 'all') ? 'all'
    : (archParam === '1' || archParam === 'true') ? 1 : 0;
  // 🔴 이 조각은 **상수 3개 중 하나**다(사용자 입력이 문자열로 들어가지 않는다). `all` 이면 빈 문자열.
  const archWhere = (archived === 'all') ? '' : ` AND c.archived_at IS ${archived ? 'NOT NULL' : 'NULL'}`;
  const q = clean(req.query.q);
  if (cpLen(q) > Q_MAX) return fail(res, 400, `검색어는 ${Q_MAX}자 이내로 입력해주세요`);

  // 검색 중에는 상한까지 훑고 **필터 뒤에** limit 을 적용한다. SQL 에서 limit 을 먼저 걸면
  // "최근 5건 안에 일치가 없다"가 "일치가 없다"로 둔갑한다.
  // 🔴 `scan` 은 아래에서 `LIMIT ?` 로 **바인딩**한다(문자열 보간 금지 — 프로젝트 규칙).
  //    위 `Math.max/min(parseInt(...))` 클램프는 그대로 둔다: 바인딩은 주입을 막고,
  //    클램프는 값이 정수·범위 안임을 보장한다. 둘 다 필요하다.
  //    (sequelize replacements 는 숫자를 숫자 리터럴로 넣는다 — 문자열이면 `LIMIT '5'` 문법 오류가 난다.)
  const scan = q ? SCAN_MAX : limit;
  const [rows] = await sequelize.query(
    `SELECT c.id, c.title, c.preview,
            DATE_FORMAT(c.last_message_at, '%Y-%m-%d %H:%i:%s') AS last_fmt,
            DATE_FORMAT(c.created_at,      '%Y-%m-%d %H:%i:%s') AS created_fmt,
            DATE_FORMAT(c.archived_at,     '%Y-%m-%d %H:%i:%s') AS archived_fmt,
            (SELECT COUNT(*) FROM master_actions a
               WHERE a.chat_id = c.id AND a.status = 'pending') AS pending_actions
       FROM master_chats c
      WHERE c.user_id = ?${archWhere}
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
      LIMIT ?`,
    { replacements: [uid, scan] }
  );

  const base = rows.map((r) => ({
    ...chatView(r),
    pendingActions: Number(r.pending_actions || 0),
    running: masterChat.isChatRunning(r.id),
  }));

  if (!q) return ok(res, base);

  // ① 제목 매치
  const hits = [];
  const rest = [];
  for (const it of base) {
    const s = makeSnippets(it.title, q, { radius: SNIPPET_RADIUS, max: 1 });
    if (s.count > 0) hits.push({ ...it, match: { field: 'title', snippet: s.snippet } });
    else rest.push(it);
  }

  // ② 본문 매치 — 제목으로 못 맞춘 대화만.
  //    🔴 실패한 관장 행(content='')은 애초에 매치되지 않지만, 읽지 않는 편이 싸다.
  if (rest.length) {
    const ids = rest.map((it) => it.id);
    const [msgs] = await sequelize.query(
      `SELECT chat_id, content FROM master_messages
        WHERE chat_id IN (${ids.map(() => '?').join(',')})
          AND content <> ''
        ORDER BY chat_id ASC, id ASC`,
      { replacements: ids }
    );
    const snippetByChat = new Map();
    for (const m of msgs) {
      const cid = Number(m.chat_id);
      if (snippetByChat.has(cid)) continue;          // 대화당 1건이면 충분하다
      const s = makeSnippets(m.content, q, { radius: SNIPPET_RADIUS, max: 1 });
      if (s.count > 0) snippetByChat.set(cid, s.snippet);
    }
    for (const it of rest) {
      const sn = snippetByChat.get(it.id);
      if (sn) hits.push({ ...it, match: { field: 'message', snippet: sn } });
    }
  }

  // 원래 순서(최신순)를 복원한다 — 위에서 제목/본문으로 두 번 나눠 담느라 섞였다.
  const order = new Map(base.map((it, i) => [it.id, i]));
  hits.sort((a, b) => order.get(a.id) - order.get(b.id));
  ok(res, hits.slice(0, limit));
}));

/**
 * POST /api/master/chats — {firstMessage?}
 * 🔴 `firstMessage` 가 있으면 사용자 메시지 **1행만** 저장하고 턴은 시작하지 않는다.
 *    상단 바에서 보낸 글이 패널이 열리기 전에 사라지지 않게 하는 장치다. 실행은 `/turns {resumePending:true}`.
 */
router.post('/chats', wrap(async (req, res) => {
  const uid = req.user.id;
  const body = req.body || {};
  const first = Object.prototype.hasOwnProperty.call(body, 'firstMessage') ? clean(body.firstMessage) : '';
  if (first && cpLen(first) > TEXT_MAX) {
    return fail(res, 400, `메시지는 ${TEXT_MAX}자 이내로 보내주세요`);
  }

  const now = new Date();
  const title = (first ? [...first].slice(0, 40).join('') : '새 대화').trim() || '새 대화';
  const result = await sequelize.transaction(async (t) => {
    const [cr] = await sequelize.query(
      `INSERT INTO master_chats (user_id, title, preview, last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
      { replacements: [uid, title, first.slice(0, 200), now, now], transaction: t }
    );
    const chatId = Number(cr?.insertId ?? cr);
    let pendingMessageId = null;
    if (first) {
      const [mr] = await sequelize.query(
        `INSERT INTO master_messages (user_id, chat_id, role, content, status, created_at)
         VALUES (?, ?, 'user', ?, 'done', ?)`,
        { replacements: [uid, chatId, first, now], transaction: t }
      );
      pendingMessageId = Number(mr?.insertId ?? mr);
    }
    return { chatId, pendingMessageId };
  });

  const chat = await ownedChat(uid, result.chatId);
  ok(res, { chat: chatView(chat), pendingMessageId: result.pendingMessageId });
}));

/**
 * GET /api/master/chats/:id — 대화 + 메시지 + 카드. toolLog·payload·result 는 **객체로** 내려간다.
 *
 * 🔴 `running` 이 이 경로의 두 번째 역할이다(task-030 D-1). SSE 가 끊겨도 턴은 계속 도는데,
 *    클라이언트가 그 사실을 알 방법이 없어 "network error" 를 띄웠다. 이제 이 응답 하나로
 *    **폴링만으로도 결과를 받을 수 있다** — 진행 중이면 `{messageId,label,startedAt,elapsedMs}`,
 *    끝났으면 `null` + 아래 `messages` 에 `done`(또는 `failed`) 메시지가 들어 있다.
 *    그래서 이 경로는 SSE 없이도 완결이다: 폴링 클라이언트는 `running===null` 을 보고 멈추면 된다.
 */
router.get('/chats/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const chat = await ownedChat(uid, req.params.id);
  if (!chat) return fail(res, 404, '대화를 찾을 수 없습니다');

  const [msgs] = await sequelize.query(
    `SELECT id, role, content, tool_log, status,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_fmt
       FROM master_messages WHERE chat_id = ? ORDER BY id ASC`,
    { replacements: [chat.id] }
  );
  const [actions] = await sequelize.query(
    `SELECT id, message_id, kind, payload, status, result,
            DATE_FORMAT(created_at,  '%Y-%m-%d %H:%i:%s') AS created_fmt,
            DATE_FORMAT(resolved_at, '%Y-%m-%d %H:%i:%s') AS resolved_fmt
       FROM master_actions WHERE chat_id = ? ORDER BY id ASC`,
    { replacements: [chat.id] }
  );
  const parse = (v) => { if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };

  ok(res, {
    chat: chatView(chat),
    running: masterChat.getRunningTurn(chat.id),
    messages: msgs.map((m) => ({
      id: Number(m.id), role: m.role, content: m.content || '',
      toolLog: parse(m.tool_log), status: m.status, createdAt: m.created_fmt,
    })),
    actions: actions.map(masterActions.viewOf),
  });
}));

/**
 * PATCH /api/master/chats/:id — `{title?, archived?}` (task-030 D-3 로 `archived` 추가)
 *
 * 🔴 **둘 다 없으면 400.** 빈 PATCH 를 200 으로 받으면 프론트 버그(필드명 오타 등)가
 *    "저장됐다"로 보이고 아무도 모른다. 무엇을 바꿀지 말하지 않은 요청은 성공이 아니다.
 * 🔴 `archived` 는 boolean 만 받는다. `'true'`·`1` 을 관대하게 해석하면 `'false'`(문자열)가
 *    참으로 읽히는 고전적 함정이 생긴다 — 여기서는 잘못 읽히면 대화가 목록에서 사라진다.
 * 🔴 보관/복원은 `archived_at` **하나만** 건드린다. 메시지·카드는 그대로 살아 있고,
 *    상세·턴·승인 경로는 이 컬럼을 보지 않는다(보관은 목록의 사정이지 대화의 사정이 아니다).
 */
router.patch('/chats/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const chat = await ownedChat(uid, req.params.id);
  if (!chat) return fail(res, 404, '대화를 찾을 수 없습니다');

  const body = req.body || {};
  const hasTitle    = Object.prototype.hasOwnProperty.call(body, 'title');
  const hasArchived = Object.prototype.hasOwnProperty.call(body, 'archived');
  if (!hasTitle && !hasArchived) return fail(res, 400, '변경할 내용이 없습니다');

  const sets = [];
  const vals = [];
  if (hasTitle) {
    const title = clean(body.title);
    if (!title) return fail(res, 400, '제목을 입력해주세요');
    if (cpLen(title) > TITLE_MAX) return fail(res, 400, `제목은 ${TITLE_MAX}자 이내로 입력해주세요`);
    sets.push('title = ?'); vals.push(title);
  }
  if (hasArchived) {
    if (typeof body.archived !== 'boolean') return fail(res, 400, 'archived 는 true 또는 false 여야 합니다');
    sets.push('archived_at = ?'); vals.push(body.archived ? new Date() : null);
  }

  sets.push('updated_at = ?'); vals.push(new Date());
  await sequelize.query(`UPDATE master_chats SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
    { replacements: [...vals, chat.id, uid] });
  ok(res, { chat: chatView(await ownedChat(uid, chat.id)) });
}));

/**
 * DELETE /api/master/chats/:id — CASCADE(메시지 → 카드).
 * 🔴 FK 가 지워 주지만 **무엇을 지웠는지 세어서 응답에 싣는다**(task-026 A-4 와 같은 원칙).
 *    FK 만 믿으면 앱이 무엇을 지웠는지 모르고, 그러면 QA 가 연쇄 삭제를 잴 수 없다.
 */
router.delete('/chats/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const chat = await ownedChat(uid, req.params.id);
  if (!chat) return fail(res, 404, '대화를 찾을 수 없습니다');
  const counted = await sequelize.transaction(async (t) => {
    const [[m]] = await sequelize.query('SELECT COUNT(*) AS n FROM master_messages WHERE chat_id = ?',
      { replacements: [chat.id], transaction: t });
    const [[a]] = await sequelize.query('SELECT COUNT(*) AS n FROM master_actions WHERE chat_id = ?',
      { replacements: [chat.id], transaction: t });
    await sequelize.query('DELETE FROM master_chats WHERE id = ? AND user_id = ?',
      { replacements: [chat.id, uid], transaction: t });
    return { deletedMessages: Number(m.n), deletedActions: Number(a.n) };
  });
  ok(res, { chatId: Number(chat.id), ...counted });
}));

// ── 턴 (SSE) ────────────────────────────────────────────────────────────────

/**
 * POST /api/master/chats/:id/turns — {text} 또는 {resumePending:true} → text/event-stream
 *
 * 🔴 SSE 를 시작하기 **전에** 모든 거절 사유를 JSON 으로 끝낸다(400·404·409). 스트림을 연 뒤에
 *    에러를 내면 프론트가 상태 코드를 볼 수 없어 "왜 안 되는지"를 화면에 쓸 수 없다.
 * 🔴 15초마다 주석 프레임(`: ping`)을 보낸다. opus 턴은 60초를 넘기는데, 그 사이 아무것도
 *    흐르지 않으면 프록시가 연결을 끊는다.
 */
router.post('/chats/:id/turns', wrap(async (req, res) => {
  const uid = req.user.id;
  const chat = await ownedChat(uid, req.params.id);
  if (!chat) return fail(res, 404, '대화를 찾을 수 없습니다');

  const body = req.body || {};
  const resumePending = body.resumePending === true;
  let text = '';
  if (!resumePending) {
    text = clean(body.text);
    if (!text) return fail(res, 400, '보낼 내용을 입력해주세요');
    if (cpLen(text) > TEXT_MAX) return fail(res, 400, `메시지는 ${TEXT_MAX}자 이내로 보내주세요`);
  } else {
    // resumePending 은 "마지막 메시지가 user 이고 그 뒤에 **살아 있는** 관장 메시지가 없을 때" 성립한다.
    //
    // 🔴 `status='failed'` 인 관장 행은 **건너뛴다**(task-030 D-1 후속 · Leader 결정 2026-09-09).
    //    턴이 실패하면 빈 관장 행이 `failed, content=''` 로 뒤에 남는다(masterChat.js 의 실패 처리).
    //    그 행을 "마지막 메시지"로 세면 재시도가 400 으로 막히고, 프론트는 같은 질문을 `{text}` 새 턴으로
    //    다시 보낼 수밖에 없어 **질문 말풍선이 중복**된다. 실패한 행은 이력이므로 지우지도 재사용하지도
    //    않는다 — 건너뛰고 그 앞의 user 메시지를 재개 대상으로 삼으면, runTurn 이 **새 관장 행**을
    //    만들어 붙인다(실패 기록 보존 + 질문 중복 없음).
    //
    //    프롬프트에도 영향이 없다: buildPrompt 는 `id <= userMessageId` 이자 `status <> 'failed'` 라
    //    실패 행을 애초에 읽지 않는다.
    const [[last]] = await sequelize.query(
      `SELECT role, status FROM master_messages
        WHERE chat_id = ? AND NOT (role = 'master' AND status = 'failed')
        ORDER BY id DESC LIMIT 1`,
      { replacements: [chat.id] }
    );
    // 🔴 마지막이 **pending 관장 행**이면 400 이 아니라 아래 409(진행 중)로 내려보낸다.
    //    그 대화는 지금 답하는 중이지 "이어서 보낼 메시지가 없는" 상태가 아니다 —
    //    409 의 `running` 을 받아야 프론트가 오류 대신 그 턴에 붙어서 기다린다(계약 G).
    if (!last || (last.role !== 'user' && last.status !== 'pending')) {
      return fail(res, 400, '이어서 보낼 메시지가 없습니다');
    }
  }

  if (await masterChat.hasRunningTurn(uid)) {
    // 🔴 409 에 `running` 을 실어 준다 — 클라이언트가 이걸 "오류"로 끝내지 않고 **그 턴에 붙어서**
    //    기다릴 수 있게(task-030 D-1). 진행 중인 턴이 **다른 대화**의 것일 수 있어 chatId 도 함께 준다.
    //    락이 DB pending 으로만 잡힌 경우(레지스트리에 없음)에는 null 이고, 그때는 진짜 오류로 보여야 맞다.
    const runningTurn = masterChat.getRunningTurnForUser(uid);
    return fail(res, 409, '관장님이 아직 답하는 중이에요',
      runningTurn ? { running: runningTurn } : null);
  }

  // ── SSE 시작 ──────────────────────────────────────────────────────────────
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    'Connection': 'keep-alive',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let closed = false;
  const emit = (event, data) => {
    if (closed || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };
  const ping = setInterval(() => {
    if (closed || res.writableEnded) return;
    res.write(': ping\n\n');
    if (typeof res.flush === 'function') res.flush();
  }, 15000);
  // 🔴 클라이언트가 끊어도 턴은 계속 돈다(관장 답변은 DB 에 남는다) — 여기서는 쓰기만 멈춘다.
  //    중간에 죽이면 master 메시지가 영원히 pending 으로 남는다.
  req.on('close', () => { closed = true; });

  try {
    await masterChat.runTurn({ userId: uid, chat, text, resumePending, emit });
  } finally {
    clearInterval(ping);
    if (!res.writableEnded) res.end();
  }
}));

// ── 제안 카드 승인·거절 ──────────────────────────────────────────────────────

/**
 * POST /api/master/actions/:id/approve — `{replace?:true}`
 * 🔴 `replace` 는 **요청 본문**에서만 읽는다. 관장이 만든 payload 에서 읽지 않는다 —
 *    열린 과제를 말없이 갈아치우는 길을 만들지 않는다(masterActions 주석 참고).
 */
router.post('/actions/:id/approve', wrap(async (req, res) => {
  try {
    const out = await masterActions.approve(req.user.id, req.params.id, {
      replace: (req.body || {}).replace === true,
    });
    ok(res, out);
  } catch (e) {
    if (e.__field) {
      return fail(res, e.status || 422, e.message,
        e.action ? { action: e.action, ...(e.needsReplace ? { needsReplace: true } : {}) } : null);
    }
    throw e;
  }
}));

router.post('/actions/:id/reject', wrap(async (req, res) => {
  try {
    ok(res, await masterActions.reject(req.user.id, req.params.id));
  } catch (e) {
    if (e.__field) return fail(res, e.status || 422, e.message, e.action ? { action: e.action } : null);
    throw e;
  }
}));

// ── SNS 검색 (관장 턴 밖에서도 쓸 수 있는 REST 경로) ─────────────────────────

/**
 * GET /api/master/search/sns?q&platform&limit
 * 🔴 REST 경로는 제공자 체인 **1→2→3 전부** 쓴다(Claude WebSearch 포함).
 *    MCP 도구는 2를 건너뛴다 — 관장 턴 안에서 claude 가 claude 를 기다리는 교착을 피하기 위해서다.
 */
router.get('/search/sns', wrap(async (req, res) => {
  const q = clean(req.query.q);
  if (!q) return fail(res, 400, '검색어를 입력해주세요');
  if (cpLen(q) > 200) return fail(res, 400, '검색어는 200자 이내로 입력해주세요');
  const platform = ['instagram', 'tiktok', 'all'].includes(req.query.platform) ? req.query.platform : 'all';
  const limit = Math.max(1, Math.min(8, parseInt(req.query.limit, 10) || 5));

  const out = await sns.search(q, { platform, limit, allowClaude: true });
  // 메타 보강 — 실패한 건은 ok:false 로 남는다(버리지 않는다).
  // 🔴 `kind:'topic'`(틱톡 주제 페이지)은 보강하지 않는다. 영상이 아니라서 oEmbed 가 실패하고,
  //    그 결과로 아래 병합이 Brave 가 준 제목을 null 로 덮어써 "제목 없는 실패 항목"으로 보인다.
  const toEnrich = out.results.filter((r) => r.kind !== 'topic');
  const enriched = toEnrich.length
    ? await sns.enrichLinks(toEnrich.map((r) => r.url), req.user.id)
    : [];
  const byUrl = new Map(enriched.map((e) => [e.url, e]));
  ok(res, {
    query: q, platform,
    provider: out.provider, cached: !!out.cached,
    results: out.results.map((r) => ({ ...r, ...(byUrl.get(r.url) || {}) })),
    ...(out.hint ? { hint: out.hint } : {}),
  });
}));

module.exports = router;
