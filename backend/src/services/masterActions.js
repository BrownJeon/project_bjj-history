// 제안 카드 **승인 실행기** (task-030 · 계약 D).
//
// 🔴 **여기가 "승인 전에는 아무것도 생기지 않는다"의 반대편이다.** MCP 의 propose_* 는
//   master_actions 한 행만 만들고, 실제 research_* 행은 이 파일이 만든다. 진입점은
//   `POST /api/master/actions/:id/approve` 하나 — 사람이 버튼을 눌러야 여기 온다.
//
// 🔴 **LLM 호출이 없다.** 승인 뒤에 AI 를 다시 부르면 "승인한 것"과 "만들어진 것"이 달라질 수 있다.
//   payload 에 적힌 그대로만 만든다.
//
// 🔴 **실행 전에 재검증한다.** pending 사이에 프로젝트가 지워졌을 수 있고, 노드가 사라졌을 수 있다.
//   소유·존재·길이를 전부 다시 본다 — 제안 시점의 검증을 믿지 않는다.
//
// 🔴 **트랜잭션 1개.** 프로젝트 + 시드 노드가 반쪽만 만들어지면 화면이 표현할 수 없는 상태가 된다.
const { sequelize } = require('../config/db');
const rw = require('./researchWrite');
const { resolveOwned, FieldError } = require('./researchCore');
const { toNFC } = require('../utils/nfc');

/** 소유가 확인된 action 행. 없거나 남의 것이면 null → 라우트가 404. */
async function ownedAction(userId, rawId) {
  const id = parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  // 🔴 소유 판별은 master_chats.user_id 다(정본). master_actions.user_id 는 사본이라
  //    권한에 쓰지 않는다 — 자기 user_id 를 단 남의 chat_id 행이 이론적으로 가능하다.
  const [[row]] = await sequelize.query(
    `SELECT a.*, DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_fmt,
            DATE_FORMAT(a.resolved_at, '%Y-%m-%d %H:%i:%s') AS resolved_fmt
       FROM master_actions a
       JOIN master_chats  c ON c.id = a.chat_id
      WHERE a.id = ? AND c.user_id = ? LIMIT 1`,
    { replacements: [id, userId] }
  );
  return row || null;
}

/** 노드 label 로 부모를 찾는다 — NFC 비교, 첫 매치. 없으면 루트(null). */
function findParentByLabel(nodes, rawLabel) {
  if (!rawLabel) return null;
  const target = toNFC(String(rawLabel)).trim();
  if (!target) return null;
  const hit = nodes.find((n) => toNFC(String(n.label || '')).trim() === target);
  return hit ? Number(hit.id) : null;
}

async function markResolved(actionId, status, result) {
  await sequelize.query(
    `UPDATE master_actions SET status = ?, result = ?, resolved_at = ? WHERE id = ?`,
    { replacements: [status, result == null ? null : JSON.stringify(result), new Date(), actionId] }
  );
}

// ── kind 별 실행 ─────────────────────────────────────────────────────────────

async function execResearchProject(userId, payload) {
  return sequelize.transaction(async (t) => {
    const projectId = await rw.createProject(
      userId,
      { title: payload.title, startPos: payload.startPos || '', goal: payload.goal || '' },
      { transaction: t }
    );
    const version = await rw.activeVersionOf(projectId, t);
    if (!version) throw new FieldError('버전을 만들지 못했습니다', 500);

    const nodeIds = [];
    for (const n of (Array.isArray(payload.seedNodes) ? payload.seedNodes : [])) {
      // 🔴 시드 노드도 **같은 createNode** 를 쓴다 — kind 화이트리스트·깊이·길이 검증이 그대로 적용된다.
      const id = await rw.createNode(
        userId, version,
        { kind: n.kind, label: n.label, note: n.note || '', parentNodeId: null },
        { transaction: t }
      );
      nodeIds.push(id);
    }
    return { projectId, versionId: Number(version.id), nodeIds };
  });
}

async function execResearchNodes(userId, payload) {
  const project = await resolveOwned(userId, 'project', payload.projectId);
  if (!project) throw new FieldError('연구 프로젝트를 찾을 수 없습니다 — 그 사이에 삭제됐을 수 있어요', 404);
  const version = await rw.activeVersionOf(project.id);
  if (!version) throw new FieldError('활성 버전을 찾을 수 없습니다', 404);

  return sequelize.transaction(async (t) => {
    const nodeIds = [];
    for (const n of (Array.isArray(payload.nodes) ? payload.nodes : [])) {
      // 🔴 부모는 **매번 다시 읽는다.** 방금 만든 노드가 다음 노드의 부모가 될 수 있다.
      const current = await rw.nodesOfVersion(version.id, t);
      const parentNodeId = findParentByLabel(current, n.parentLabel);
      const id = await rw.createNode(
        userId, version,
        { kind: n.kind, label: n.label, note: n.note || '', parentNodeId },
        { transaction: t }
      );
      nodeIds.push(id);
    }
    return { projectId: Number(project.id), versionId: Number(version.id), nodeIds };
  });
}

async function execNodeLinks(userId, payload) {
  const node = await resolveOwned(userId, 'node', payload.nodeId);
  if (!node) throw new FieldError('노드를 찾을 수 없습니다 — 그 사이에 삭제됐을 수 있어요', 404);

  return sequelize.transaction(async (t) => {
    const linkIds = [];
    for (const l of (Array.isArray(payload.links) ? payload.links : [])) {
      // 🔴 link_type='url' 은 ref_id 없이 **memo 에 주소**를 담는다(task-026 계약 A-1).
      //    memo 를 관장이 따로 준 경우에도 주소가 정본이라 memo 자리에 url 을 넣는다.
      const id = await rw.createLink(
        userId, node, { linkType: 'url', memo: l.url }, { transaction: t }
      );
      linkIds.push(id);
    }
    return { nodeId: Number(node.id), linkIds };
  });
}

async function execWeeklyTask(userId, payload, opts) {
  const node = await resolveOwned(userId, 'node', payload.nodeId);
  if (!node) throw new FieldError('노드를 찾을 수 없습니다 — 그 사이에 삭제됐을 수 있어요', 404);
  // 🔴 `replace` 는 **승인 요청 본문**에서만 온다 — payload(관장이 만든 것)에서 읽지 않는다.
  //    관장이 payload 에 replace:true 를 심어 열린 과제를 말없이 갈아치우는 길을 막는다.
  const replace = opts.replace === true;
  const { taskId, closedTaskId } = await rw.setWeeklyTask(userId, node, { memo: payload.memo || '', replace });
  return { taskId, closedTaskId, nodeId: Number(node.id) };
}

const EXECUTORS = {
  research_project: execResearchProject,
  research_nodes:   execResearchNodes,
  node_links:       execNodeLinks,
  weekly_task:      execWeeklyTask,
};

/**
 * 승인 실행.
 * @returns {Promise<{action}>} 성공. 실패는 throw — `e.status`·`e.message`·`e.action` 을 라우트가 쓴다.
 */
async function approve(userId, actionId, opts = {}) {
  const row = await ownedAction(userId, actionId);
  if (!row) throw new FieldError('제안을 찾을 수 없습니다', 404);
  if (row.status !== 'pending') {
    const e = new FieldError('이미 처리한 제안입니다', 409);
    e.action = viewOf(row);
    throw e;
  }
  let payload;
  try { payload = JSON.parse(row.payload); } catch { payload = null; }
  if (!payload) {
    await markResolved(row.id, 'failed', { error: '제안 내용을 읽지 못했습니다' });
    throw new FieldError('제안 내용을 읽지 못했습니다', 422);
  }
  const exec = EXECUTORS[row.kind];
  if (!exec) {
    await markResolved(row.id, 'failed', { error: `알 수 없는 제안 종류입니다 (${row.kind})` });
    throw new FieldError(`알 수 없는 제안 종류입니다 (${row.kind})`, 422);
  }

  let result;
  try {
    result = await exec(userId, payload, opts);
  } catch (e) {
    // 🔴 열린 과제 충돌은 **failed 로 마킹하지 않는다.** 사용자가 "바꿀까요?" 에 예라고 답하면
    //    같은 카드를 다시 승인할 수 있어야 한다. pending 으로 남겨 둔다.
    if (e.__dup) {
      const err = new FieldError('이미 열린 과제가 있습니다 — 바꿀지 확인해 주세요', 409);
      err.action = viewOf(row);
      err.needsReplace = true;
      throw err;
    }
    const message = e && e.__field ? e.message : '제안을 실행하지 못했습니다';
    console.error(`[masterActions] action=${row.id} kind=${row.kind} 실행 실패:`, (e && e.message) || e);
    await markResolved(row.id, 'failed', { error: message });
    const err = new FieldError(message, (e && e.status) || 422);
    err.action = viewOf({ ...row, status: 'failed', result: JSON.stringify({ error: message }) });
    throw err;
  }

  await markResolved(row.id, 'approved', result);
  const fresh = await ownedAction(userId, actionId);
  return { action: viewOf(fresh || row) };
}

/** 거절 — 아무것도 만들지 않는다. 카드는 대화에 남고 상태만 바뀐다. */
async function reject(userId, actionId) {
  const row = await ownedAction(userId, actionId);
  if (!row) throw new FieldError('제안을 찾을 수 없습니다', 404);
  if (row.status !== 'pending') {
    const e = new FieldError('이미 처리한 제안입니다', 409);
    e.action = viewOf(row);
    throw e;
  }
  await markResolved(row.id, 'rejected', null);
  const fresh = await ownedAction(userId, actionId);
  return { action: viewOf(fresh || row) };
}

function viewOf(r) {
  const parse = (v) => { if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };
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

module.exports = { approve, reject, ownedAction, viewOf, findParentByLabel };
