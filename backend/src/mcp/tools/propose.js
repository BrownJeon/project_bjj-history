// 관장의 **제안** 도구 4종 (task-030 · 기획서 §7-C).
//
// 🔴 **이 파일이 쓸 수 있는 테이블은 `master_actions` 하나뿐이다.**
//   research_projects · research_nodes · research_links · research_tasks · video_clips 를
//   여기서 열지 않는다. 그 INSERT 는 사용자가 승인 버튼을 눌렀을 때 services/masterActions.js 가 한다.
//   "승인 전에는 아무것도 생기지 않는다"가 주석이 아니라 **구조**로 지켜지는 지점이다.
//   Reviewer 감사 항목 ③(제안 도구가 master_actions 외 어떤 테이블에도 쓰지 않음)이 이걸 잰다.
//
// 🔴 검증은 **여기서** 한다(길이·kind 7종·정본 포지션·소유). 통과 못 하면 도구 에러로 돌려
//   관장이 스스로 고쳐 다시 제안하게 한다. 승인 시점에 또 한 번 재검증한다 —
//   pending 사이에 프로젝트가 지워질 수 있기 때문이다(계약 D).
//
// 🔴 `BJJ_MESSAGE_ID` 가 없으면 제안을 만들지 않는다. 카드가 어느 메시지에 붙는지 모르면
//   화면에 영영 나타나지 않는 유령 행이 된다 — 조용한 실패의 전형이다.
const { z } = require('zod');
const { sequelize } = require('../../config/db');
const tree = require('../../services/researchTree');
const { listPositions } = require('../../services/positions');
const { ctx, respond, toolError, guard } = require('../lib');

const LIMITS = { title: 100, startPos: 50, goal: 200, label: 100, note: 500, memo: 200, url: 200 };

/** VARCHAR(n) 은 문자 수 기준이므로 코드포인트로 센다(JS .length 는 이모지를 2로 센다). */
const cpLen = (s) => [...String(s ?? '')].length;
/** research_* 는 전부 utf8mb3 다 — 4바이트 문자는 STRICT 에서 500 이 된다. */
const hasNonBMP = (s) => [...String(s ?? '')].some((ch) => ch.codePointAt(0) > 0xFFFF);

function textError(label, value, max) {
  const s = String(value ?? '');
  if (cpLen(s) > max) return `${label}은(는) ${max}자 이내여야 합니다`;
  if (hasNonBMP(s))   return `${label}에 이모지는 사용할 수 없습니다 (연구 트리는 이모지를 저장하지 못합니다)`;
  return null;
}

/** 제안 1건을 master_actions 에 넣는다. **이 함수가 이 파일의 유일한 쓰기다.** */
async function insertAction(kind, payload, summary) {
  const { userId, chatId, messageId } = ctx();
  if (!Number.isInteger(messageId) || !Number.isInteger(chatId)) {
    return toolError('지금은 제안을 만들 수 없습니다 — 대화 맥락이 없습니다');
  }
  const [r] = await sequelize.query(
    `INSERT INTO master_actions (user_id, chat_id, message_id, kind, payload, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    { replacements: [userId, chatId, messageId, kind, JSON.stringify(payload), new Date()] }
  );
  const actionId = Number(r?.insertId ?? r);
  console.error(`[mcp][propose] ${kind} action=${actionId} chat=${chatId} msg=${messageId}`);
  return respond({
    actionId, kind, summary,
    note: '제안 카드를 만들었습니다. 훈련생이 승인해야 실제로 만들어집니다 — 본문에 무엇을 제안했는지 한 줄로 적어 주세요.',
  });
}

/** 노드 소유 확인 — research_projects 까지 조인한다(계약 A-2). 남의 것이면 null. */
async function ownedNode(userId, nodeId) {
  const [[row]] = await sequelize.query(
    `SELECT n.id, n.version_id, n.label, v.project_id
       FROM research_nodes n
       JOIN research_versions  v ON v.id = n.version_id
       JOIN research_projects  p ON p.id = v.project_id
      WHERE n.id = ? AND p.user_id = ? LIMIT 1`,
    { replacements: [nodeId, userId] }
  );
  return row || null;
}

function register(server) {
  // ── 1. propose_research_project ────────────────────────────────────────────
  server.registerTool('propose_research_project', {
    description: '연구 프로젝트 생성을 제안합니다. startPos 는 반드시 list_positions 결과 안에서 고르세요(새 이름 금지). 승인 전에는 아무것도 만들어지지 않습니다.',
    inputSchema: {
      title: z.string().min(1).max(100),
      startPos: z.string().max(50).optional(),
      goal: z.string().max(200).optional(),
      seedNodes: z.array(z.object({
        kind: z.string(),
        label: z.string().max(100),
        note: z.string().max(500).optional(),
      })).max(7).optional(),
    },
  }, guard('propose_research_project', async ({ title, startPos, goal, seedNodes }) => {
    const { userId } = ctx();
    for (const [label, value, max] of [
      ['제목', title, LIMITS.title], ['시작 포지션', startPos || '', LIMITS.startPos], ['목표', goal || '', LIMITS.goal],
    ]) {
      const err = textError(label, value, max);
      if (err) return toolError(err);
    }
    if (!String(title).trim()) return toolError('연구 제목이 비었습니다');

    // 🔴 시작 포지션은 **정본 목록 안에서만**(페르소나 원칙 4). 새 이름은 여기서 막는다 —
    //    관장이 지어낸 포지션이 승인 한 번으로 정본 어휘에 섞여 들어가면 되돌리기 어렵다.
    if (startPos && String(startPos).trim()) {
      const names = (await listPositions(userId)).map((p) => p.name);
      if (!names.includes(String(startPos).trim())) {
        return toolError(
          `"${startPos}" 는 정본 포지션 목록에 없습니다. list_positions 로 목록을 보고 그 안에서 고르거나, ` +
          '시작 포지션 없이 제안하세요.'
        );
      }
    }

    const nodes = [];
    for (const n of (seedNodes || [])) {
      const kind = String(n.kind || '').trim();
      if (!tree.KINDS.includes(kind)) {
        return toolError(`노드 종류는 ${tree.KINDS.join(' · ')} 중 하나여야 합니다 (받은 값: ${kind})`);
      }
      const err = textError('노드 이름', n.label || '', LIMITS.label) || textError('메모', n.note || '', LIMITS.note);
      if (err) return toolError(err);
      nodes.push({ kind, label: String(n.label || '').trim(), note: n.note ? String(n.note) : null });
    }

    const payload = {
      title: String(title).trim(),
      startPos: startPos ? String(startPos).trim() : '',
      goal: goal ? String(goal).trim() : '',
      seedNodes: nodes,
    };
    const summary = `연구 프로젝트 "${payload.title}"` +
      (payload.startPos ? ` · 시작 ${payload.startPos}` : '') +
      (nodes.length ? ` · 시드 노드 ${nodes.length}개` : '');
    return insertAction('research_project', payload, summary);
  }));

  // ── 2. propose_research_nodes ──────────────────────────────────────────────
  server.registerTool('propose_research_nodes', {
    description: '기존 연구 프로젝트의 활성 버전에 노드 추가를 제안합니다. parentLabel 은 승인 시 그 이름의 노드를 찾아 붙이고, 못 찾으면 루트에 붙습니다.',
    inputSchema: {
      projectId: z.number().int().positive(),
      nodes: z.array(z.object({
        kind: z.string(),
        label: z.string().max(100),
        note: z.string().max(500).optional(),
        parentLabel: z.string().max(100).optional(),
      })).min(1).max(5),
    },
  }, guard('propose_research_nodes', async ({ projectId, nodes }) => {
    const { userId } = ctx();
    const [[p]] = await sequelize.query(
      'SELECT id, title FROM research_projects WHERE id = ? AND user_id = ? LIMIT 1',
      { replacements: [projectId, userId] }
    );
    if (!p) return toolError('그 연구 프로젝트를 찾을 수 없습니다');

    const out = [];
    for (const n of nodes) {
      const kind = String(n.kind || '').trim();
      if (!tree.KINDS.includes(kind)) {
        return toolError(`노드 종류는 ${tree.KINDS.join(' · ')} 중 하나여야 합니다 (받은 값: ${kind})`);
      }
      const err = textError('노드 이름', n.label || '', LIMITS.label)
        || textError('메모', n.note || '', LIMITS.note)
        || textError('부모 노드 이름', n.parentLabel || '', LIMITS.label);
      if (err) return toolError(err);
      out.push({
        kind, label: String(n.label || '').trim(),
        note: n.note ? String(n.note) : null,
        parentLabel: n.parentLabel ? String(n.parentLabel).trim() : null,
      });
    }
    // 🔴 `projectTitle` 은 **표시용**이다(Leader 결정 2026-09-09 #5). 승인 실행기는 이 필드를
    //    읽지 않는다 — 실행 입력은 `projectId` 하나뿐이고, 소유·존재는 승인 시점에 다시 본다.
    //    여기 넣는 이유: 카드가 "연구 프로젝트 #138" 이 아니라 제목으로 보여야 사람이 무엇을
    //    승인하는지 안다. 제목이 그 사이 바뀌어도 실행 결과는 달라지지 않는다.
    const payload = { projectId: Number(projectId), projectTitle: String(p.title || ''), nodes: out };
    const summary = `"${p.title}" 에 노드 ${out.length}개 추가 — ` +
      out.map((n) => `${n.kind}: ${n.label}`).join(' · ');
    return insertAction('research_nodes', payload, summary);
  }));

  // ── 3. propose_node_links ──────────────────────────────────────────────────
  server.registerTool('propose_node_links', {
    description: '연구 노드에 영상 링크(url) 추가를 제안합니다. url 은 검색 결과의 것을 글자 그대로 쓰세요 — 지어내거나 줄이면 안 됩니다.',
    inputSchema: {
      nodeId: z.number().int().positive(),
      links: z.array(z.object({
        url: z.string().max(200),
        memo: z.string().max(200).optional(),
      })).min(1).max(5),
    },
  }, guard('propose_node_links', async ({ nodeId, links }) => {
    const { userId } = ctx();
    const node = await ownedNode(userId, nodeId);
    if (!node) return toolError('그 노드를 찾을 수 없습니다');

    const out = [];
    for (const l of links) {
      const url = String(l.url || '').trim();
      if (!url) return toolError('url 이 비었습니다');
      // 🔴 research_links 는 link_type='url' 일 때 **memo(≤200)에 주소를 담는다**(task-026 계약).
      //    그래서 200자를 넘는 주소는 저장할 방법 자체가 없다 — 여기서 알려 준다.
      const err = textError('링크 주소', url, LIMITS.url) || textError('메모', l.memo || '', LIMITS.memo);
      if (err) return toolError(err);
      let u;
      try { u = new URL(url); } catch { return toolError(`"${url}" 은 올바른 주소가 아닙니다`); }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        return toolError('http/https 주소만 저장할 수 있습니다');
      }
      out.push({ url, memo: l.memo ? String(l.memo) : null });
    }
    // 🔴 `nodeLabel` 은 **표시용**이다(위 propose_research_nodes 주석과 같은 규약).
    //    승인 실행기의 입력은 `nodeId`·`links` 뿐이다.
    const payload = { nodeId: Number(nodeId), nodeLabel: String(node.label || ''), links: out };
    const summary = `"${node.label || '노드'}" 에 영상 링크 ${out.length}개 추가`;
    return insertAction('node_links', payload, summary);
  }));

  // ── 4. propose_weekly_task ─────────────────────────────────────────────────
  server.registerTool('propose_weekly_task', {
    description: '이번 주 과제 설정을 제안합니다. 열린 과제는 앱 전체에 하나뿐이라, 이미 있으면 승인 화면에서 "바꿀까요?"를 한 번 더 묻습니다.',
    inputSchema: {
      nodeId: z.number().int().positive(),
      memo: z.string().max(200).optional(),
    },
  }, guard('propose_weekly_task', async ({ nodeId, memo }) => {
    const { userId } = ctx();
    const node = await ownedNode(userId, nodeId);
    if (!node) return toolError('그 노드를 찾을 수 없습니다');
    const err = textError('메모', memo || '', LIMITS.memo);
    if (err) return toolError(err);

    // 열린 과제가 있는지는 **알려만 준다** — 제안 자체를 막지 않는다.
    // 바꿀지는 사람이 승인 화면에서 정한다(페르소나 원칙 2 "하나만 팝니다"는 관장의 말로 지킨다).
    const [[open]] = await sequelize.query(
      `SELECT t.id FROM research_tasks t
         JOIN research_nodes    n ON n.id = t.node_id
         JOIN research_versions v ON v.id = n.version_id
         JOIN research_projects p ON p.id = v.project_id
        WHERE p.user_id = ? AND t.closed_at IS NULL LIMIT 1`,
      { replacements: [userId] }
    );
    // 🔴 `nodeLabel` 은 **표시용**이다. 실행 입력은 `nodeId`·`memo` 와 승인 본문의 `replace` 뿐 —
    //    특히 여기서는 payload 에 무엇이 더 들어와도 `replace` 로 읽히지 않는다(계약 D 의 못).
    const payload = { nodeId: Number(nodeId), nodeLabel: String(node.label || ''), memo: memo ? String(memo) : '' };
    const summary = `이번 주 과제: "${node.label || '노드'}"` + (open ? ' (열린 과제를 바꿉니다)' : '');
    const res = await insertAction('weekly_task', payload, summary);
    if (open && !res.isError) {
      res.content[0].text = JSON.stringify({
        ...JSON.parse(res.content[0].text),
        warning: '이미 열린 과제가 있습니다 — 답변에서 "지금 과제를 바꿀까요?" 라고 물어보세요',
      });
    }
    return res;
  }));
}

module.exports = { register };
