// 연구 트리 **쓰기** 로직 (task-030 — routes/research.js 에서 추출).
//
// 이 파일이 존재하는 이유는 하나다: **관장의 승인 실행기와 화면 라우트가 같은 코드로 만든다.**
// 관장이 제안한 카드를 승인했을 때 만들어지는 프로젝트·노드·링크·과제는, 사용자가 화면에서
// 직접 만든 것과 **글자 하나 다르지 않아야** 한다. 검증도, 트랜잭션 경계도, 에러 메시지도.
// 두 벌로 두면 한 벌만 고쳐지고, 그때부터 관장이 만든 데이터만 조용히 다른 규칙을 따른다.
//
// 🔴 `researchTree.js` 에 넣지 않았다. 그 파일은 첫 줄부터 "DB·HTTP·req/res 가 없다. 전부 순수
//    함수다 — 편의가 아니라 설계 요건이다"라고 못박혀 있고(task-026), 그 순수성이 QA 의
//    네거티브 컨트롤을 가능하게 하는 장치다. DB 를 아는 코드를 거기 넣으면 그 보장이 깨진다.
//    ⇒ 지시서 계약 D 는 `researchTree.createProject` 를 지목했지만, **같은 목적**(추출해 한 벌만
//      두기)을 지키면서 그 불변식을 깨지 않는 자리로 이 파일을 골랐다. 위치만 다르고 계약은 같다.
//      (이 판단은 task 파일의 "dev-030a 실측" 절에 '결정 필요'로 기록했다.)
//
// 🔴 검증 실패는 전부 `FieldError`(researchCore) 다. 라우트는 status·message 를 그대로 쓰고,
//    승인 실행기는 같은 메시지를 `master_actions.result.error` 에 남긴다.
// 🔴 여기에는 LLM 호출이 없다. 승인은 사람의 클릭이고, 클릭 뒤에 다시 AI 를 부르면
//    "승인한 것"과 "만들어진 것"이 달라질 수 있다.
const { sequelize } = require('../config/db');
const { Technique } = require('../models');
const tree = require('./researchTree');
const {
  LIMITS, clean, textError, has, posInt,
  resolveOwned, nodesOfVersion, FieldError,
} = require('./researchCore');

/**
 * kind 검증 — 화이트리스트 7종. 🔴 **kind 와 깊이 사이에 어떤 제약도 걸지 않는다.**
 * `포지션` 도 어느 깊이에나 온다(실제 수업 theme 이 "싱글엑스 가드 -> 50대50" 처럼 중간에 자리를 바꾼다).
 */
function kindError(kind) {
  if (!tree.KINDS.includes(kind)) {
    return `노드 종류는 ${tree.KINDS.join(' · ')} 중 하나여야 합니다`;
  }
  return null;
}

/**
 * technique_id 검증. 🔴 **남의 기술 id 는 403 이 아니라 404** — 존재 여부 자체를 흘리지 않는다
 * (task-024 `routes/lab.js:29-38` 과 **같은 규칙**).
 * @returns {number|null|'BAD'|'NOTFOUND'}
 */
async function resolveTechniqueId(uid, raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const tid = posInt(raw);
  if (tid === null) return 'BAD';
  const t = await Technique.findOne({ where: { id: tid, user_id: uid }, raw: true });
  return t ? tid : 'NOTFOUND';
}

/** 노드 생성·수정이 공유하는 텍스트 검증. 통과하면 null. */
function nodeTextError(label, note) {
  return textError('노드 이름', label, LIMITS.label) || textError('메모', note, LIMITS.note);
}

// ─────────────────────────────────────────────────────────────────────────────
// 프로젝트
// ─────────────────────────────────────────────────────────────────────────────

/** 본문 → 정본화된 필드. 검증 실패는 FieldError. 순서·메시지는 원래 라우트 그대로다. */
function validateProjectInput(body) {
  const title = clean(body.title);
  if (!title) throw new FieldError('연구 제목을 입력해주세요');
  const startPos = has(body, 'startPos') ? clean(body.startPos) : '';
  const goal     = has(body, 'goal')     ? clean(body.goal)     : '';
  for (const [label, value, max] of [
    ['제목', title, LIMITS.title], ['시작 포지션', startPos, LIMITS.startPos], ['목표', goal, LIMITS.goal],
  ]) {
    const err = textError(label, value, max);
    if (err) throw new FieldError(err);
  }
  return { title, startPos, goal };
}

/**
 * 프로젝트 생성. **v1 을 같은 트랜잭션에서 자동 생성**(is_active=1).
 *
 * 🔴 v1 은 같은 트랜잭션이다. 프로젝트만 만들어지고 버전이 없으면 화면이 표현할 수 없는
 *    상태가 된다(그래서 마지막 버전 삭제도 거부한다).
 * 🔴 user_id 는 요청 본문에서 읽지 않고 **호출자가 준 uid**를 쓴다(계약 A-2).
 *
 * @param opts.transaction 바깥 트랜잭션(관장 승인은 프로젝트+시드 노드를 한 트랜잭션으로 묶는다)
 * @returns {Promise<number>} projectId
 */
async function createProject(uid, body, opts = {}) {
  const { title, startPos, goal } = validateProjectInput(body || {});

  const run = async (t) => {
    const now = new Date();
    const [r] = await sequelize.query(
      `INSERT INTO research_projects (user_id, title, start_pos, goal, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      { replacements: [uid, title, startPos || null, goal || null, now, now], transaction: t }
    );
    const id = Number(r?.insertId ?? r);
    await sequelize.query(
      `INSERT INTO research_versions (user_id, project_id, version_no, name, is_active, parent_version_id, created_at)
       VALUES (?, ?, 1, NULL, 1, NULL, ?)`,
      { replacements: [uid, id, now], transaction: t }
    );
    return id;
  };

  return opts.transaction ? run(opts.transaction) : sequelize.transaction(run);
}

/** 프로젝트의 활성 버전 행. 없으면 version_no 가 가장 큰 것(원래 pickActive 와 같은 규칙). */
async function activeVersionOf(projectId, t = null) {
  const [rows] = await sequelize.query(
    `SELECT * FROM research_versions WHERE project_id = ? ORDER BY version_no ASC`,
    { replacements: [projectId], transaction: t }
  );
  if (!rows.length) return null;
  return rows.find((v) => Number(v.is_active) === 1) || rows[rows.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// 노드
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 노드 생성. sort_order 는 형제 끝에 붙인다(max+1).
 * @param version resolveOwned(uid,'version',...) 로 소유가 확인된 **버전 행**
 * @returns {Promise<number>} nodeId
 */
async function createNode(uid, version, body, opts = {}) {
  const t = opts.transaction || null;

  const kind = clean(body.kind);
  const kErr = kindError(kind);
  if (kErr) throw new FieldError(kErr);

  // 🔴 label 은 빈 문자열을 허용한다(컬럼도 NOT NULL DEFAULT ''). "대처 추가" 인라인 버튼처럼
  //    이름 없이 자리부터 만드는 흐름이 실제로 있고, 거기서 400 이 나면 빈 곳을 메울 길이 막힌다.
  const label = has(body, 'label') ? clean(body.label) : '';
  const note  = has(body, 'note')  ? clean(body.note)  : '';
  const tErr = nodeTextError(label, note);
  if (tErr) throw new FieldError(tErr);

  const techniqueId = await resolveTechniqueId(uid, body.techniqueId);
  if (techniqueId === 'BAD')      throw new FieldError('techniqueId 가 올바르지 않습니다');
  if (techniqueId === 'NOTFOUND') throw new FieldError('기술을 찾을 수 없습니다', 404);

  const parentRaw = has(body, 'parentNodeId') ? body.parentNodeId : null;
  const parentId  = (parentRaw === null || parentRaw === undefined || parentRaw === '') ? null : posInt(parentRaw);
  if (parentRaw !== null && parentRaw !== undefined && parentRaw !== '' && parentId === null) {
    throw new FieldError('parentNodeId 가 올바르지 않습니다');
  }

  const nodes = await nodesOfVersion(version.id, t);
  // 신규 노드는 서브트리 높이가 1 이다 — 옮길 자손이 아직 없다.
  const check = tree.validatePlacement(nodes, null, parentId, {
    versionId: version.id, subtreeHeightOverride: 1,
  });
  if (!check.ok) throw new FieldError(check.message);

  const siblings = tree.childrenOf(tree.indexNodes(nodes), parentId);
  const sortOrder = siblings.reduce((mx, s) => Math.max(mx, Number(s.sort_order) || 0), -1) + 1;

  const now = new Date();
  const [r] = await sequelize.query(
    `INSERT INTO research_nodes
       (user_id, version_id, parent_node_id, kind, label, technique_id, sort_order, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    // 🔴 user_id 는 요청 본문이 아니라 **부모 버전 행에서 유도**한다(계약 A-2).
    {
      replacements: [version.user_id, version.id, parentId, kind, label, techniqueId, sortOrder, note || null, now, now],
      transaction: t,
    }
  );
  return Number(r?.insertId ?? r);
}

// ─────────────────────────────────────────────────────────────────────────────
// 링크
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ref_id 소유 확인 — 남의 클립·수업·기술 id 를 매달아 두면 "열기"가 유출 경로가 된다.
 * @param linkTargets routes/research.js 의 LINK_TARGETS (url 외 종류를 쓸 때만 필요)
 */
async function refIdError(uid, linkType, rawRefId, linkTargets, t = null) {
  if (linkType === 'url') {
    // url 은 ref_id 없이 memo 에 주소를 담는다.
    if (rawRefId !== null && rawRefId !== undefined && rawRefId !== '') {
      return { message: 'url 링크에는 refId 를 쓰지 않습니다 (주소는 memo 에 넣어주세요)' };
    }
    return { value: null };
  }
  const spec = linkTargets ? linkTargets[linkType] : null;
  // 화이트리스트(LINK_TYPES)는 통과했는데 대상표에 짝이 없다 = 배선 실수다.
  // 그래도 여기서 500 을 내지 않는다 — 만들어지면 영원히 broken 인 링크가 생기므로 아예 거절한다.
  if (!spec) return { message: `${linkType} 링크는 아직 연결할 수 없습니다` };

  const refId = posInt(rawRefId);
  if (refId === null) return { message: `${linkType} 링크에는 refId 가 필요합니다` };
  const [rows] = await sequelize.query(
    `SELECT id FROM ${spec.table} WHERE id = ? AND user_id = ? LIMIT 1`,
    { replacements: [refId, uid], transaction: t }
  );
  // 🔴 남의 것이면 404 — 존재 여부를 흘리지 않는다(기술 id 규칙과 같다).
  if (!rows.length) return { message: '연결 대상을 찾을 수 없습니다', status: 404 };
  return { value: refId };
}

/**
 * 링크 생성. `POST /links` 와 `POST /nodes/:id/links` 와 관장 승인이 **한 벌**을 쓴다.
 * @param node resolveOwned(uid,'node',...) 로 소유가 확인된 **노드 행**
 * @returns {Promise<number>} linkId
 */
async function createLink(uid, node, body, opts = {}) {
  const t = opts.transaction || null;
  const linkType = clean(body.linkType);
  if (!tree.LINK_TYPES.includes(linkType)) {
    throw new FieldError(`링크 종류는 ${tree.LINK_TYPES.join(' · ')} 중 하나여야 합니다`);
  }
  const memo = has(body, 'memo') ? clean(body.memo) : '';
  const mErr = textError('메모', memo, LIMITS.memo);
  if (mErr) throw new FieldError(mErr);

  const ref = await refIdError(uid, linkType, body.refId, opts.linkTargets, t);
  if (ref.message) throw new FieldError(ref.message, ref.status || 400);

  const [r] = await sequelize.query(
    `INSERT INTO research_links (user_id, node_id, link_type, ref_id, memo, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    // 🔴 user_id 는 본문이 아니라 **소유자(research_projects.user_id)**에서 유도한다(계약 A-2).
    { replacements: [Number(node.owner_id), node.id, linkType, ref.value, memo || null, new Date()], transaction: t }
  );
  return Number(r?.insertId ?? r);
}

// ─────────────────────────────────────────────────────────────────────────────
// 이번 주 과제
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 과제 지정. 열린 과제가 있으면 **409**(`e.__dup === true`) — 호출부가 현재 과제를 동봉해 돌려준다.
 *
 * 🔴 `replace: true` 는 관장 승인 화면 전용이다. 기존 과제를 `outcome='not_tried'` 로 마감하고
 *    새 과제를 연다. 화면의 `POST /task` 는 이 값을 쓰지 않는다(기본 false) — 그래서 라우트
 *    동작은 추출 전과 완전히 같다.
 * 🔴 트랜잭션 안에서 FOR UPDATE 로 한 번 더 본다. 최종 방어선은 UNIQUE(user_id, open_slot) 이다.
 *
 * @returns {Promise<{taskId:number, closedTaskId:number|null}>}
 */
async function setWeeklyTask(uid, node, body = {}, opts = {}) {
  const memo = has(body, 'memo') ? clean(body.memo) : '';
  const mErr = textError('메모', memo, LIMITS.memo);
  if (mErr) throw new FieldError(mErr);
  const replace = body.replace === true;

  const run = async (t) => {
    const [locked] = await sequelize.query(
      'SELECT id FROM research_tasks WHERE user_id = ? AND closed_at IS NULL FOR UPDATE',
      { replacements: [uid], transaction: t }
    );
    let closedTaskId = null;
    if (locked.length) {
      if (!replace) throw Object.assign(new Error('duplicate_open_task'), { __dup: true });
      // 🔴 마감이지 삭제가 아니다. "무엇을 며칠 팠는가"는 남는다.
      closedTaskId = Number(locked[0].id);
      await sequelize.query(
        `UPDATE research_tasks SET closed_at = ?, outcome = 'not_tried'
          WHERE user_id = ? AND closed_at IS NULL`,
        { replacements: [new Date(), uid], transaction: t }
      );
    }
    const [r] = await sequelize.query(
      'INSERT INTO research_tasks (user_id, node_id, memo, created_at) VALUES (?, ?, ?, ?)',
      // 🔴 user_id 는 요청 본문이 아니라 **노드의 소유자**에서 유도한다(계약 A-2 와 같은 규칙).
      { replacements: [node.owner_id, node.id, memo || null, new Date()], transaction: t }
    );
    return { taskId: Number(r?.insertId ?? r), closedTaskId };
  };

  return opts.transaction ? run(opts.transaction) : sequelize.transaction(run);
}

module.exports = {
  kindError, resolveTechniqueId, nodeTextError,
  validateProjectInput, createProject, activeVersionOf,
  createNode, refIdError, createLink, setWeeklyTask,
  // 편의 재수출 — 라우트가 두 모듈을 각각 require 하지 않게.
  resolveOwned, nodesOfVersion, FieldError,
};
