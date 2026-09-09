// 관장실(task-030) API — 계약 B.
//
// 읽기·CRUD 는 axios(client.js) 를 그대로 쓴다. 인터셉터가 {success,data} 를 언래핑한다.
// 🔴 승인/취소만 fetch 로 친다 — client.js 인터셉터가 에러를 `new Error(message)` 로 바꾸면서
//    **HTTP 상태를 버리기 때문**이다. weekly_task 재승인 흐름은 409 를 구분해야 하고(계약 F),
//    422(실행 실패) 응답에 실린 action 도 그대로 받아야 한다.
// 🔴 턴은 SSE 라 axios 로 읽을 수 없다 — fetch + ReadableStream.

import client from './client';

// ── 읽기 · CRUD ────────────────────────────────────────────────────────────
/**
 * `GET /master/chats` — 기본 목록 · 조회(`q`) · 보관함(`archived`) 셋 다 이 하나로 간다(계약 I).
 *
 * 🔴 인자를 **숫자로도** 받는다. 예전 호출부(`listChats(50)`)를 깨지 않기 위해서다.
 *    `{ q, archived, limit }` 객체가 새 형태다.
 * 🔴 `q`·`archived` 는 **값이 있을 때만** 실어 보낸다 — 백엔드(dev-030-d3a)가 아직
 *    두 파라미터를 모르더라도 기본 목록 요청은 예전과 **바이트 그대로** 나간다.
 * 🔴 `archived: 'all'`(task-030 D-4) 은 그대로 문자열로 실린다 — 백엔드가 `all` 을 모르면
 *    기본 0(진행 중) 으로 떨어질 뿐 오류가 아니다(예전 클라이언트와 같은 무해한 실패 방식).
 */
export const listChats = (opts = {}) => {
  const o = (typeof opts === 'number') ? { limit: opts } : (opts || {});
  const params = { limit: Math.min(Number(o.limit) || 50, 50) };
  const q = (o.q == null ? '' : String(o.q)).trim();
  if (q) params.q = q.slice(0, 100);
  if (o.archived === 'all') params.archived = 'all';
  else if (o.archived) params.archived = 1;
  return client.get('/master/chats', { params }).then(r => r.data);
};

export const createChat  = (body) => client.post('/master/chats', body || {}).then(r => r.data);
export const getChat     = (id)   => client.get(`/master/chats/${id}`).then(r => r.data);
export const deleteChat  = (id)   => client.delete(`/master/chats/${id}`).then(r => r.data);

/** `PATCH /master/chats/:id` — `{title}` · `{archived}` 둘 다 이 하나로(계약 I). */
export const patchChat   = (id, body)   => client.patch(`/master/chats/${id}`, body || {}).then(r => r.data);
export const renameChat  = (id, title)  => patchChat(id, { title });
export const archiveChat = (id, on)     => patchChat(id, { archived: !!on });

export const searchSns = (q, platform = 'all', limit = 8) =>
  client.get('/master/search/sns', { params: { q, platform, limit } }).then(r => r.data);

// 🔴 기존 PUT /profile 은 부분 갱신이 아니다(닉네임을 덮어쓴다) — 전용 엔드포인트만 쓴다.
export const setMasterModel = (masterModel) =>
  client.patch('/profile/master-model', { masterModel }).then(r => r.data);

// ── 토큰 · 401 (client.js 와 같은 규칙) ─────────────────────────────────────
function token() {
  try { return localStorage.getItem('bjj_token'); } catch { return null; }
}

function bounceToLogin() {
  try { localStorage.removeItem('bjj_token'); } catch { /* 저장소가 막힌 브라우저 */ }
  window.location.href = '/login';
}

function headers() {
  const t = token();
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : null) };
}

/** 실패 시 status·action 을 **잃지 않고** 올려 보내는 POST */
async function postJson(path, body) {
  const res = await fetch('/api' + path, {
    method: 'POST', headers: headers(), body: JSON.stringify(body || {}),
  });
  if (res.status === 401) { bounceToLogin(); throw new Error('로그인이 필요합니다'); }

  let json = null;
  try { json = await res.json(); } catch { json = null; }

  if (!res.ok || (json && json.success === false)) {
    const err = new Error((json && (json.message || json.error)) || `요청 실패 (${res.status})`);
    err.status = res.status;
    // 실행 실패(422)는 갱신된 action 을 함께 준다 — 카드가 failed 상태를 그릴 수 있게 실어 보낸다.
    err.action = (json && ((json.data && json.data.action) || json.action)) || null;
    throw err;
  }
  return json && ('data' in json) ? json.data : json;
}

export const approveAction = (id, body) => postJson(`/master/actions/${id}/approve`, body || {});
export const rejectAction  = (id)       => postJson(`/master/actions/${id}/reject`, {});

// ── SSE 턴 ────────────────────────────────────────────────────────────────
// `event: <name>\ndata: <json>\n\n` 프레임. `: ping` 주석 프레임은 무시한다.
function emitFrame(raw, onEvent) {
  let name = 'message';
  const data = [];
  for (const line of raw.split('\n')) {
    if (!line || line[0] === ':') continue;          // 주석(ping)·빈 줄
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (!data.length) return;
  let payload = null;
  try { payload = JSON.parse(data.join('\n')); } catch { return; }  // 깨진 프레임은 버린다
  if (onEvent) onEvent(name, payload);
}

/**
 * POST /api/master/chats/:id/turns — SSE 스트림.
 * body: {text} 또는 {resumePending:true}
 * onEvent(name, data) 로 accepted·status·done·error 를 그대로 넘긴다.
 */
export async function streamTurn(chatId, body, opts = {}) {
  const { onEvent, signal } = opts;
  const res = await fetch(`/api/master/chats/${chatId}/turns`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body || {}), signal,
  });

  // 🔴 status 를 반드시 실어 보낸다 — 호출자(MasterContext)가 "HTTP 오류(status 있음)" 와
  //    "네트워크 끊김(TypeError, status 없음)" 을 이 한 가지로 가른다(계약 G, task-030 D-1).
  if (res.status === 401) {
    bounceToLogin();
    const err401 = new Error('로그인이 필요합니다');
    err401.status = 401;
    throw err401;
  }

  const ctype = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  if (!res.ok || ctype.indexOf('text/event-stream') === -1) {
    // 409(진행 중 턴)·400(길이)·404(타 계정)는 SSE 시작 전 JSON 이다.
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    const err = new Error((json && (json.message || json.error)) || `요청 실패 (${res.status})`);
    err.status = res.status;
    // 🔴 409 의 `data.running` — 오류로 끝내지 않고 **그 턴에 붙어서** 폴링하기 위한 이정표다.
    //    {messageId, label, startedAt, elapsedMs, chatId} (계약 G 백엔드).
    err.running = (json && ((json.data && json.data.running) || json.running)) || null;
    throw err;
  }

  if (!res.body || !res.body.getReader) throw new Error('이 브라우저에서는 대화 스트림을 받을 수 없어요');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      emitFrame(buf.slice(0, i), onEvent);
      buf = buf.slice(i + 2);
    }
  }
  if (buf.trim()) emitFrame(buf, onEvent);   // 마지막 프레임에 빈 줄이 없을 때
}
