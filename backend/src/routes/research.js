const express = require('express');
const router  = express.Router();
const { sequelize, Technique, TechniqueMastery } = require('../models');
const { ok, fail, wrap } = require('../utils/respond');
const { toNFC } = require('../utils/nfc');
const lab  = require('../services/labAnalytics');
const tree = require('../services/researchTree');

// ─────────────────────────────────────────────────────────────────────────────
// 연구 화면 API — /api/research/* (task-026 · docs/recall-lab-spec.md §4.4)
//
// 복기가 "찾는 길"이라면 연구는 **"빈 곳을 드러내는 판"**이다.
// 트리를 예쁘게 채우는 API 가 아니라, **대처가 없는 리액션이 눈에 보이게 하는 API** 다.
// 그래서 `coverage.uncoveredReactionNodeIds` 를 서버가 계산해 실어 보낸다 — 프론트가 다시
// 판정하면 두 곳이 어긋날 때 원인 추적이 불가능해진다(task-025 "이중 필터 금지").
//
// 🔴 이 라우터는 routes/index.js 에서 `/research` 접두사로 마운트된다.
//    lab.js·profile.js 의 `/` 최상위 마운트를 흉내내지 마라 — 저 둘은 경로가 최상위여서 그런 것이고
//    (사용자 지시가 정본), 이건 도메인 접두사가 있는 평범한 라우터다.
//
// 🔴 **user_id 격리의 정본은 research_projects.user_id 하나다**(계약 A-2).
//    모든 소유 판별은 아래 `resolveOwned()` **하나**를 거치고, 그 SQL 은 예외 없이
//    research_projects 까지 조인한다. `WHERE node.id = ?` 만 보는 라우트가 하나라도 있으면 IDOR 이다.
//    하위 3테이블의 user_id 는 부모에서 유도해 채우는 **사본**이고 권한 판정에 쓰지 않는다 —
//    QA 가 드리프트를 SQL 한 줄로 재기 위한 관측 장치다.
//
// 🔴 없는 것과 남의 것을 **구분해 알려주지 않는다** — 둘 다 404 다(lab.js:29-38 과 같은 규칙).
//    403 은 "그 id 는 존재하지만 네 것이 아니다"를 알려주는 셈이라 id 범위를 훑어낼 수 있다.
//
// 🔴 날짜는 SQL 의 DATE_FORMAT 으로 'YYYY-MM-DD' 문자열을 만든다. `toISOString()` 금지 —
//    UTC 로 변환되면서 KST 기준 하루가 밀린다. (DB 세션 TZ 는 SYSTEM=KST 로 실측 확인)
// ─────────────────────────────────────────────────────────────────────────────

// STRICT_TRANS_TABLES + utf8mb3: 길이 초과는 잘림이 아니라 **에러**이고 이모지는 500 이다.
// 여기서 400 으로 먼저 걸러 사용자에게 이유를 알려 준다(task-022 spar_causes 와 같은 처리).
const LIMITS = {
  title: 100, startPos: 50, goal: 200,     // research_projects
  versionName: 50,                          // research_versions.name
  label: 100, note: 500,                    // research_nodes
  memo: 200,                                // research_links.memo
};

/** 자유 텍스트 정본화 — NFC 정규화(task-014) + 좌우 공백 제거. */
function clean(raw) {
  return toNFC(String(raw ?? '')).trim();
}
/** VARCHAR(n) 은 문자 수 기준이므로 코드포인트로 센다(JS .length 는 이모지를 2로 세어 어긋난다). */
function textLen(s) {
  return [...s].length;
}
/** 이 DB 는 전 테이블 utf8mb3 — 4바이트 문자는 `Incorrect string value` 500 이 된다. */
function hasNonBMP(s) {
  return [...s].some((ch) => ch.codePointAt(0) > 0xFFFF);
}
/** 통과하면 null, 아니면 400 에 실을 메시지. */
function textError(label, s, max) {
  if (textLen(s) > max) return `${label}은(는) ${max}자 이내로 입력해주세요`;
  if (hasNonBMP(s))     return `${label}에 이모지는 사용할 수 없습니다`;
  return null;
}
/** 본문에 그 키가 실제로 있는가 — 부분 갱신(PATCH)의 정본 판정. undefined 값과 미전송을 구분한다. */
function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}
/** 양의 정수 파싱. 아니면 null. */
function posInt(v) {
  const n = parseInt(v, 10);
  return (Number.isInteger(n) && n > 0) ? n : null;
}

// ── 소유 판별 ────────────────────────────────────────────────────────────────
// 🔴 **딱 하나만 둔다.** 여러 벌 만들면 한 벌만 고쳐진다(계약 A-2).
//    네 SQL 전부 research_projects 까지 조인한다 — 정본이 거기 하나이기 때문이다.
const OWN_SQL = {
  project: `SELECT p.id, p.user_id, p.title, p.start_pos, p.goal,
                   DATE_FORMAT(p.created_at, '%Y-%m-%d') AS created_ymd
              FROM research_projects p
             WHERE p.id = ? AND p.user_id = ? LIMIT 1`,
  version: `SELECT v.*, p.user_id AS owner_id
              FROM research_versions v
              JOIN research_projects p ON p.id = v.project_id
             WHERE v.id = ? AND p.user_id = ? LIMIT 1`,
  node:    `SELECT n.*, v.project_id, p.user_id AS owner_id
              FROM research_nodes n
              JOIN research_versions  v ON v.id = n.version_id
              JOIN research_projects  p ON p.id = v.project_id
             WHERE n.id = ? AND p.user_id = ? LIMIT 1`,
  link:    `SELECT l.*, n.version_id, v.project_id, p.user_id AS owner_id
              FROM research_links l
              JOIN research_nodes    n ON n.id = l.node_id
              JOIN research_versions v ON v.id = n.version_id
              JOIN research_projects p ON p.id = v.project_id
             WHERE l.id = ? AND p.user_id = ? LIMIT 1`,
};

/**
 * 소유가 확인된 행을 돌려준다. 없거나 남의 것이면 **null**(호출부는 404 로 끝낸다).
 * @param entity 'project' | 'version' | 'node' | 'link'
 */
async function resolveOwned(userId, entity, rawId, t = null) {
  const id = posInt(rawId);
  if (id === null) return null;
  const [rows] = await sequelize.query(OWN_SQL[entity], {
    replacements: [id, userId], transaction: t,
  });
  return rows[0] || null;
}

// ── 조회 헬퍼 ────────────────────────────────────────────────────────────────

/** 한 버전의 노드 전체 (DB 행 그대로 — researchTree 순수 함수의 입력 규약). */
async function nodesOfVersion(versionId, t = null) {
  const [rows] = await sequelize.query(
    `SELECT id, user_id, version_id, parent_node_id, kind, label, technique_id, sort_order, note
       FROM research_nodes WHERE version_id = ? ORDER BY sort_order ASC, id ASC`,
    { replacements: [versionId], transaction: t }
  );
  return rows;
}

/** 여러 버전의 노드를 **한 번에** 읽는다 — 목록 API 가 버전마다 부르면 N+1 이다. */
async function nodesOfVersions(versionIds, t = null) {
  if (!versionIds.length) return [];
  const [rows] = await sequelize.query(
    `SELECT id, user_id, version_id, parent_node_id, kind, label, technique_id, sort_order, note
       FROM research_nodes WHERE version_id IN (?) ORDER BY version_id ASC, sort_order ASC, id ASC`,
    { replacements: [versionIds], transaction: t }
  );
  return rows;
}

/**
 * 기술 id → 사다리 `reached` 맵.
 *
 * 🔴 **`loadLabData(userId)` 는 요청당 딱 한 번.** 프로젝트마다·노드마다 부르면 N+1 이다(계약 B-2).
 *    `makeMatcher` 와 technique_mastery 도 한 번만 읽어 재사용한다.
 * 🔴 사다리는 **기술 단위**다 — 이 맵의 키가 노드 id 가 아니라 technique_id 인 것이 그 계약의 표현이다.
 */
async function buildReachedMap(userId, techIds) {
  if (!techIds.length) return new Map();
  const data = await lab.loadLabData(userId);
  const masteryRows = await TechniqueMastery.findAll({ where: { user_id: userId }, raw: true });
  const masteryByTech = new Map(masteryRows.map((r) => [Number(r.technique_id), r]));
  const match = lab.makeMatcher(data.techniques);

  const out = new Map();
  for (const tid of techIds) {
    const m = lab.computeMastery(data, tid, { mastery: masteryByTech.get(tid) || null, match });
    // computeMastery 는 그 사용자의 기술이 아니면 null 을 준다. FK(SET NULL) 덕에 정상 경로에선
    // 안 생기지만, 생기면 0 으로 세고 분모에는 남긴다 — 참조는 실재하기 때문이다.
    out.set(tid, m ? m.reached : 0);
  }
  return out;
}

/** 이 사용자의 기술 id → 이름 맵. 남의 기술 이름이 새어 나갈 수 없게 user_id 로 걸러 읽는다. */
async function techniqueNameMap(userId, t = null) {
  const [rows] = await sequelize.query(
    'SELECT id, name FROM techniques WHERE user_id = ?', { replacements: [userId], transaction: t }
  );
  return new Map(rows.map((r) => [Number(r.id), r.name]));
}

/** 노드 id → 링크 개수. 한 버전 치를 한 번에. */
async function linkCountMap(versionIds, t = null) {
  if (!versionIds.length) return new Map();
  const [rows] = await sequelize.query(
    `SELECT l.node_id, COUNT(*) AS c
       FROM research_links l JOIN research_nodes n ON n.id = l.node_id
      WHERE n.version_id IN (?) GROUP BY l.node_id`,
    { replacements: [versionIds], transaction: t }
  );
  return new Map(rows.map((r) => [Number(r.node_id), Number(r.c)]));
}

// ── 응답 뷰 ──────────────────────────────────────────────────────────────────
// 🔴 계약 B-3 이 정본이다. 여기서 벗어나면 프론트가 **조용히** 어긋난다.

function versionView(v) {
  return {
    id: Number(v.id),
    versionNo: Number(v.version_no),
    name: v.name ?? null,
    isActive: !!Number(v.is_active),
    parentVersionId: v.parent_version_id == null ? null : Number(v.parent_version_id),
  };
}

/**
 * 🔴 `linked` 는 **서버가** 계산해 준다. 프론트가 `techniqueId != null` 을 또 판정하면 두 곳이 갈린다.
 *    미연결은 결함이 아니라 상태다 — 숨기지 않고 상태로 실어 보낸다(/recall 의 `linked:false` 와 같은 문법).
 */
function nodeView(n, { techName = null, linkCount = 0 } = {}) {
  const techniqueId = (n.technique_id == null) ? null : Number(n.technique_id);
  return {
    id: Number(n.id),
    versionId: Number(n.version_id),
    parentNodeId: (n.parent_node_id == null) ? null : Number(n.parent_node_id),
    kind: n.kind,
    label: n.label ?? '',
    techniqueId,
    sortOrder: Number(n.sort_order) || 0,
    note: n.note ?? '',
    linked: techniqueId !== null,
    techniqueName: techniqueId !== null ? (techName ?? null) : null,
    linkCount: Number(linkCount) || 0,
  };
}

function linkView(l) {
  return {
    id: Number(l.id),
    nodeId: Number(l.node_id),
    linkType: l.link_type,
    refId: (l.ref_id == null) ? null : Number(l.ref_id),
    memo: l.memo ?? '',
  };
}

/** 활성 버전 고르기. 활성 표시가 없으면 가장 낮은 version_no 로 폴백한다(화면이 빈 손이 되지 않게). */
function pickActive(versions) {
  return versions.find((v) => Number(v.is_active) === 1) || versions[0] || null;
}

/** GET /projects/:id · POST /projects · PATCH /projects/:id 가 **같은 형태**를 돌려준다. */
async function buildProjectDetail(userId, project) {
  const [versions] = await sequelize.query(
    'SELECT * FROM research_versions WHERE project_id = ? ORDER BY version_no ASC, id ASC',
    { replacements: [project.id] }
  );
  const active = pickActive(versions);
  const nodes  = active ? await nodesOfVersion(active.id) : [];

  const idx      = tree.indexNodes(nodes);
  const coverage = tree.computeCoverage(nodes, idx);
  const techIds  = tree.uniqueTechniqueIds(nodes);
  const ladder   = tree.computeLadder(nodes, await buildReachedMap(userId, techIds));

  const nameMap  = techIds.length ? await techniqueNameMap(userId) : new Map();
  const linkMap  = active ? await linkCountMap([active.id]) : new Map();

  return {
    id: Number(project.id),
    title: project.title,
    startPos: project.start_pos ?? null,
    goal: project.goal ?? null,
    createdAt: project.created_ymd ?? null,
    versions: versions.map(versionView),
    activeVersionId: active ? Number(active.id) : null,
    coverage,
    ladder,
    // 🔴 **평평한 배열**로 준다. 중첩 JSON 으로 주면 깊이 상한·순환 문제가 응답 직렬화로 새어 나온다.
    //    트리 조립은 프론트가 한다(계약 B-3).
    nodes: nodes.map((n) => nodeView(n, {
      techName: nameMap.get(Number(n.technique_id)) ?? null,
      linkCount: linkMap.get(Number(n.id)) || 0,
    })),
  };
}

/** 프로젝트를 다시 읽어 상세를 만든다 — 쓰기 라우트가 갱신 결과를 그대로 돌려주기 위한 것. */
async function detailById(userId, projectId) {
  const p = await resolveOwned(userId, 'project', projectId);
  return p ? buildProjectDetail(userId, p) : null;
}

// ═══ 프로젝트 ════════════════════════════════════════════════════════════════

/**
 * GET /api/research/projects — 목록 + 진척 2축 + 노드 수.
 * 🔴 `loadLabData` 는 전체 프로젝트를 통틀어 **한 번**만 부른다. 프로젝트마다 부르면 N+1 이다.
 */
router.get('/projects', wrap(async (req, res) => {
  const uid = req.user.id;
  const [projects] = await sequelize.query(
    `SELECT p.id, p.title, p.start_pos, p.goal,
            DATE_FORMAT(p.created_at, '%Y-%m-%d') AS created_ymd
       FROM research_projects p WHERE p.user_id = ? ORDER BY p.id ASC`,
    { replacements: [uid] }
  );
  if (!projects.length) return ok(res, { projects: [], warnOverload: false });

  const [versions] = await sequelize.query(
    'SELECT * FROM research_versions WHERE project_id IN (?) ORDER BY project_id ASC, version_no ASC, id ASC',
    { replacements: [projects.map((p) => p.id)] }
  );
  const versionsByProject = new Map();
  for (const v of versions) {
    const k = Number(v.project_id);
    if (!versionsByProject.has(k)) versionsByProject.set(k, []);
    versionsByProject.get(k).push(v);
  }

  const activeByProject = new Map();
  for (const p of projects) {
    activeByProject.set(Number(p.id), pickActive(versionsByProject.get(Number(p.id)) || []));
  }
  const activeIds = [...activeByProject.values()].filter(Boolean).map((v) => Number(v.id));

  const allNodes = await nodesOfVersions(activeIds);
  const nodesByVersion = new Map(activeIds.map((id) => [id, []]));
  for (const n of allNodes) nodesByVersion.get(Number(n.version_id))?.push(n);

  // 🔴 전 프로젝트의 고유 기술을 모아 **한 번에** 사다리를 만든다.
  const reachedMap = await buildReachedMap(uid, tree.uniqueTechniqueIds(allNodes));

  const out = projects.map((p) => {
    const pid    = Number(p.id);
    const vs     = versionsByProject.get(pid) || [];
    const active = activeByProject.get(pid);
    const nodes  = active ? (nodesByVersion.get(Number(active.id)) || []) : [];
    return {
      id: pid,
      title: p.title,
      startPos: p.start_pos ?? null,
      goal: p.goal ?? null,
      createdAt: p.created_ymd ?? null,
      activeVersion: active
        ? { id: Number(active.id), versionNo: Number(active.version_no), name: active.name ?? null }
        : null,
      versionCount: vs.length,
      nodeCount: nodes.length,
      coverage: tree.computeCoverage(nodes),
      ladder: tree.computeLadder(nodes, reachedMap),
    };
  });

  // 동시 진행 3개 이상이면 경고만 — **막지 않는다**(계약 C-2: 에러가 아니라 권고다).
  ok(res, { projects: out, warnOverload: projects.length >= 3 });
}));

/**
 * POST /api/research/projects — 생성. **v1 을 같은 트랜잭션에서 자동 생성**(is_active=1).
 * 응답은 GET /projects/:id 와 **같은 상세 형태**다(프론트가 만들자마자 바로 들어갈 수 있게).
 */
router.post('/projects', wrap(async (req, res) => {
  const uid  = req.user.id;
  const body = req.body || {};

  const title = clean(body.title);
  if (!title) return fail(res, 400, '연구 제목을 입력해주세요');
  const startPos = has(body, 'startPos') ? clean(body.startPos) : '';
  const goal     = has(body, 'goal')     ? clean(body.goal)     : '';
  for (const [label, value, max] of [
    ['제목', title, LIMITS.title], ['시작 포지션', startPos, LIMITS.startPos], ['목표', goal, LIMITS.goal],
  ]) {
    const err = textError(label, value, max);
    if (err) return fail(res, 400, err);
  }

  const projectId = await sequelize.transaction(async (t) => {
    const now = new Date();
    const [r] = await sequelize.query(
      `INSERT INTO research_projects (user_id, title, start_pos, goal, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      { replacements: [uid, title, startPos || null, goal || null, now, now], transaction: t }
    );
    const id = Number(r?.insertId ?? r);
    // 🔴 v1 은 **같은 트랜잭션**이다. 프로젝트만 만들어지고 버전이 없으면 화면이 표현할 수 없는
    //    상태가 된다(그래서 마지막 버전 삭제도 거부한다).
    // 🔴 user_id 는 요청 본문에서 읽지 않고 **부모에서 유도**한다(계약 A-2).
    await sequelize.query(
      `INSERT INTO research_versions (user_id, project_id, version_no, name, is_active, parent_version_id, created_at)
       VALUES (?, ?, 1, NULL, 1, NULL, ?)`,
      { replacements: [uid, id, now], transaction: t }
    );
    return id;
  });

  ok(res, await detailById(uid, projectId));
}));

/** GET /api/research/projects/:id — 상세 = 프로젝트 + versions[] + 활성 버전 트리 전체 + 2축. */
router.get('/projects/:id', wrap(async (req, res) => {
  const p = await resolveOwned(req.user.id, 'project', req.params.id);
  if (!p) return fail(res, 404, '연구 프로젝트를 찾을 수 없습니다');
  ok(res, await buildProjectDetail(req.user.id, p));
}));

/** PATCH /api/research/projects/:id — 부분 수정 (title·startPos·goal). 보낸 필드만 반영한다. */
router.patch('/projects/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const p = await resolveOwned(uid, 'project', req.params.id);
  if (!p) return fail(res, 404, '연구 프로젝트를 찾을 수 없습니다');
  const body = req.body || {};

  const sets = [], vals = [];
  if (has(body, 'title')) {
    const title = clean(body.title);
    if (!title) return fail(res, 400, '연구 제목을 입력해주세요');
    const err = textError('제목', title, LIMITS.title);
    if (err) return fail(res, 400, err);
    sets.push('title = ?'); vals.push(title);
  }
  // 🔴 startPos·goal 은 빈 문자열을 **지우기**로 해석해 NULL 로 넣는다. 값을 안 보내면 그대로 둔다.
  //    (포지션 이름 자체는 서버가 화이트리스트로 막지 않는다 — /api/techniques/positions 는 사용자
  //     데이터에서 파생되는 동적 목록이라, 고정 목록으로 막으면 새 포지션이 조용히 거부된다.
  //     길이·이모지만 STRICT/utf8mb3 때문에 막는다.)
  for (const [key, column, label, max] of [
    ['startPos', 'start_pos', '시작 포지션', LIMITS.startPos],
    ['goal',     'goal',      '목표',        LIMITS.goal],
  ]) {
    if (!has(body, key)) continue;
    const v = clean(body[key]);
    const err = textError(label, v, max);
    if (err) return fail(res, 400, err);
    sets.push(`${column} = ?`); vals.push(v || null);
  }
  if (!sets.length) return fail(res, 400, '수정할 항목이 없습니다');

  await sequelize.query(
    `UPDATE research_projects SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
    { replacements: [...vals, p.id, uid] }
  );
  ok(res, await detailById(uid, p.id));
}));

/**
 * DELETE /api/research/projects/:id — 연쇄 삭제 (계약 A-4). 한 트랜잭션, **자식부터**.
 *
 * 🔴 FK CASCADE 가 이미 깔려 있는데도 앱이 명시적으로 지우는 이유:
 *    FK 만 믿으면 앱이 "무엇을 지웠는지" 모른다. 응답에 개수를 실어야 QA 가 자기 보고가 아니라
 *    **응답으로** 확인할 수 있다. 반대로 트랜잭션만 믿으면 다른 경로(SQL 직접 등)에서 고아가 생긴다.
 *    그래서 둘 다 한다.
 * 🔴 개수는 DELETE 의 affectedRows 가 아니라 **삭제 직전 COUNT** 로 센다 — 드라이버·dialect 에 따라
 *    affectedRows 의 위치가 달라지는데, 그게 틀리면 "0건 지웠다"가 조용히 통과한다.
 */
router.delete('/projects/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const p = await resolveOwned(uid, 'project', req.params.id);
  if (!p) return fail(res, 404, '연구 프로젝트를 찾을 수 없습니다');

  const counts = await sequelize.transaction(async (t) => {
    const one = async (sql) => {
      const [rows] = await sequelize.query(sql, { replacements: [p.id], transaction: t });
      return Number(rows[0]?.c || 0);
    };
    const deletedLinks = await one(
      `SELECT COUNT(*) AS c FROM research_links l
         JOIN research_nodes    n ON n.id = l.node_id
         JOIN research_versions v ON v.id = n.version_id
        WHERE v.project_id = ?`);
    const deletedNodes = await one(
      `SELECT COUNT(*) AS c FROM research_nodes n
         JOIN research_versions v ON v.id = n.version_id
        WHERE v.project_id = ?`);
    const deletedVersions = await one(
      'SELECT COUNT(*) AS c FROM research_versions WHERE project_id = ?');
    // 이번 주 과제 (task-027). FK fk_rt_node 가 CASCADE 로 바닥을 받치지만, **개수를 세어 응답에
    // 싣기 위해** 여기서도 명시적으로 지운다 — FK 만 믿으면 앱이 무엇을 지웠는지 모른다(A-4 원칙).
    const deletedTasks = await one(
      `SELECT COUNT(*) AS c FROM research_tasks rt
         JOIN research_nodes    n ON n.id = rt.node_id
         JOIN research_versions v ON v.id = n.version_id
        WHERE v.project_id = ?`);

    await sequelize.query(
      `DELETE rt FROM research_tasks rt
         JOIN research_nodes    n ON n.id = rt.node_id
         JOIN research_versions v ON v.id = n.version_id
        WHERE v.project_id = ?`, { replacements: [p.id], transaction: t });
    await sequelize.query(
      `DELETE l FROM research_links l
         JOIN research_nodes    n ON n.id = l.node_id
         JOIN research_versions v ON v.id = n.version_id
        WHERE v.project_id = ?`, { replacements: [p.id], transaction: t });
    await sequelize.query(
      `DELETE n FROM research_nodes n
         JOIN research_versions v ON v.id = n.version_id
        WHERE v.project_id = ?`, { replacements: [p.id], transaction: t });
    await sequelize.query(
      'DELETE FROM research_versions WHERE project_id = ?', { replacements: [p.id], transaction: t });
    await sequelize.query(
      'DELETE FROM research_projects WHERE id = ? AND user_id = ?',
      { replacements: [p.id, uid], transaction: t });

    return { deletedVersions, deletedNodes, deletedLinks, deletedTasks };
  });

  ok(res, counts);
}));

/**
 * GET /api/research/projects/:id/reaction-suggestions — 리액션 자동 유입 (task-027 A).
 *
 * 스파링에서 막힌 리액션(`spar_sessions.success[i].reaction`, task-022)이 이 프로젝트의
 * 활성 버전 트리에 **미처리 리액션 제안**으로 올라온다. 사람이 복기에서 손으로 옮기는 단계를 없앤다.
 *
 * 🔴 **이 라우트는 아무것도 만들지 않는다. GET 이고, INSERT 가 한 줄도 없다.**
 *    "승인 전 자동 생성 금지"가 이 프로젝트의 원칙이다(task-007~009 — 기술트리 오염 방지).
 *    채택은 사용자가 `POST /api/research/nodes` 로 한다. 제안과 생성을 **다른 라우트로 갈라 둔 것**이
 *    그 원칙의 구조적 표현이다 — 조회가 실수로 쓰는 일이 일어날 수 없다.
 *
 * 🔴 **출처를 응답에 싣는다** — 어느 스파링에서 며칠에 몇 회 막혔는지(count·lastFailedAt·sources).
 *    근거 없이 나타난 제안은 사용자가 신뢰하지 않는다.
 *
 * 🔴 **미매칭을 집계에서 빼지 않는다** — `unlinked` 로 구분해 전량 내보낸다(/api/holes 와 같은 규약).
 *    실측 기술명 미매칭 33.7% 가 그대로 유입 손실률이라(사양서 §6), 조용히 지우면 사용자는
 *    "리액션을 적었는데 아무 데도 안 나온다"만 겪는다.
 *
 * 🔴 표본 0은 `0/0` 이 아니다 — `empty:true`(적힌 리액션이 아예 없음)와 `nodesWithTechnique:0`
 *    (붙일 자리가 없음)은 **다른 말**이고, 화면이 다르게 말해야 한다.
 */
router.get('/projects/:id/reaction-suggestions', wrap(async (req, res) => {
  const uid = req.user.id;
  const p = await resolveOwned(uid, 'project', req.params.id);
  if (!p) return fail(res, 404, '연구 프로젝트를 찾을 수 없습니다');

  const [versions] = await sequelize.query(
    'SELECT * FROM research_versions WHERE project_id = ? ORDER BY version_no ASC, id ASC',
    { replacements: [p.id] }
  );
  const active = pickActive(versions);
  const nodes  = active ? await nodesOfVersion(active.id) : [];

  // 🔴 loadLabData 는 요청당 한 번. 노드마다·기술마다 부르면 N+1 이다(task-026 B-2 와 같은 규칙).
  const data = await lab.loadLabData(uid);
  const src  = lab.collectReactionItems(data);
  const out  = tree.computeReactionSuggestions(nodes, src.observations);

  ok(res, {
    projectId: Number(p.id),
    versionId: active ? Number(active.id) : null,
    // "리액션을 적은 실패 기록이 하나도 없다" — 0% 가 아니라 기록 없음.
    empty: src.failItemsWithReaction === 0,
    summary: {
      sparSessions: data.sessions.length,
      failItems: src.failItems,
      failItemsWithReaction: src.failItemsWithReaction,
      reactionTexts: out.reactionTexts,
      linkedReactionItems: src.linkedReactionItems,
      unlinkedReactionItems: src.unlinkedReactionItems,
      nodesWithTechnique: out.nodesWithTechnique,
      suggested: out.suggestions.length,
      alreadyInTree: out.skipped.length,
      parseFailures: data.parseFailures,
    },
    suggestions: out.suggestions,
    unlinked: out.unlinked,
    // 이미 트리에 있어 제외한 것 — 조용히 지우지 않고 왜 안 보이는지 드러낸다.
    skipped: out.skipped,
  });
}));

// ═══ 버전 ════════════════════════════════════════════════════════════════════
// 🔴 `POST /api/research/versions`(분기 생성)는 **만들지 않는다.** "+ 분기"는 task-027 이고,
//    화면의 버튼도 비활성이다. 이번 범위는 버전 전환·이름 수정·삭제까지다.

/**
 * PATCH /api/research/versions/:id — name 수정 · isActive 전환.
 * 🔴 활성 전환은 **한 트랜잭션**에서 같은 프로젝트의 다른 버전을 전부 0 으로 만든 뒤 이 버전을 1 로.
 *    두 문장 사이에서 끊기면 활성 버전이 0개가 되고, 그 프로젝트는 화면이 표현할 수 없게 된다.
 */
router.patch('/versions/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const v = await resolveOwned(uid, 'version', req.params.id);
  if (!v) return fail(res, 404, '버전을 찾을 수 없습니다');
  const body = req.body || {};

  let name;
  if (has(body, 'name')) {
    name = clean(body.name);
    const err = textError('버전 이름', name, LIMITS.versionName);
    if (err) return fail(res, 400, err);
  }
  let activate = null;
  if (has(body, 'isActive')) {
    if (typeof body.isActive !== 'boolean') {
      return fail(res, 400, 'isActive 는 true 또는 false 여야 합니다');
    }
    // 🔴 false 는 받지 않는다. 활성 버전이 0개인 프로젝트는 화면이 표현할 수 없다 —
    //    "이 버전을 끈다"가 아니라 "다른 버전을 켠다"가 이 화면의 유일한 전환 방식이다.
    if (body.isActive === false) {
      return fail(res, 400, '버전을 비활성으로 만들 수 없습니다 — 대신 다른 버전을 활성으로 전환하세요');
    }
    activate = true;
  }
  if (name === undefined && activate === null) return fail(res, 400, '수정할 항목이 없습니다');

  await sequelize.transaction(async (t) => {
    if (name !== undefined) {
      await sequelize.query('UPDATE research_versions SET name = ? WHERE id = ?',
        { replacements: [name || null, v.id], transaction: t });
    }
    if (activate) {
      await sequelize.query('UPDATE research_versions SET is_active = 0 WHERE project_id = ?',
        { replacements: [v.project_id], transaction: t });
      await sequelize.query('UPDATE research_versions SET is_active = 1 WHERE id = ?',
        { replacements: [v.id], transaction: t });
    }
  });

  ok(res, await detailById(uid, v.project_id));
}));

/**
 * DELETE /api/research/versions/:id — 연쇄 삭제 (계약 A-4).
 * 🔴 **마지막 남은 버전은 삭제 거부(400)** — 버전 0개 프로젝트는 화면이 표현할 수 없다.
 * 🔴 활성 버전을 지우면 같은 트랜잭션에서 **가장 낮은 version_no 를 활성으로 승격**한다.
 *    안 그러면 활성 0개 상태가 남는다.
 */
router.delete('/versions/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const v = await resolveOwned(uid, 'version', req.params.id);
  if (!v) return fail(res, 404, '버전을 찾을 수 없습니다');

  const [cntRows] = await sequelize.query(
    'SELECT COUNT(*) AS c FROM research_versions WHERE project_id = ?',
    { replacements: [v.project_id] }
  );
  if (Number(cntRows[0]?.c || 0) <= 1) {
    return fail(res, 400, '마지막 버전은 삭제할 수 없습니다');
  }

  const counts = await sequelize.transaction(async (t) => {
    const one = async (sql) => {
      const [rows] = await sequelize.query(sql, { replacements: [v.id], transaction: t });
      return Number(rows[0]?.c || 0);
    };
    const deletedLinks = await one(
      `SELECT COUNT(*) AS c FROM research_links l
         JOIN research_nodes n ON n.id = l.node_id WHERE n.version_id = ?`);
    const deletedNodes = await one('SELECT COUNT(*) AS c FROM research_nodes WHERE version_id = ?');
    const deletedTasks = await one(
      `SELECT COUNT(*) AS c FROM research_tasks rt
         JOIN research_nodes n ON n.id = rt.node_id WHERE n.version_id = ?`);

    await sequelize.query(
      `DELETE rt FROM research_tasks rt JOIN research_nodes n ON n.id = rt.node_id WHERE n.version_id = ?`,
      { replacements: [v.id], transaction: t });
    await sequelize.query(
      `DELETE l FROM research_links l JOIN research_nodes n ON n.id = l.node_id WHERE n.version_id = ?`,
      { replacements: [v.id], transaction: t });
    await sequelize.query('DELETE FROM research_nodes WHERE version_id = ?',
      { replacements: [v.id], transaction: t });
    await sequelize.query('DELETE FROM research_versions WHERE id = ?',
      { replacements: [v.id], transaction: t });

    if (Number(v.is_active) === 1) {
      await sequelize.query(
        `UPDATE research_versions SET is_active = 1
          WHERE project_id = ? ORDER BY version_no ASC, id ASC LIMIT 1`,
        { replacements: [v.project_id], transaction: t });
    }
    return { deletedVersions: 1, deletedNodes, deletedLinks, deletedTasks };
  });

  ok(res, { ...counts, project: await detailById(uid, v.project_id) });
}));

// ═══ 노드 ════════════════════════════════════════════════════════════════════

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

/** 한 노드를 뷰로. 이름·링크수까지 채워 돌려준다(프론트가 만든 직후 그대로 그릴 수 있게). */
async function singleNodeView(uid, nodeId) {
  const row = await resolveOwned(uid, 'node', nodeId);
  if (!row) return null;
  let techName = null;
  if (row.technique_id != null) {
    const t = await Technique.findOne({ where: { id: row.technique_id, user_id: uid }, raw: true });
    techName = t ? t.name : null;
  }
  const [lc] = await sequelize.query(
    'SELECT COUNT(*) AS c FROM research_links WHERE node_id = ?', { replacements: [row.id] });
  return nodeView(row, { techName, linkCount: Number(lc[0]?.c || 0) });
}

/**
 * POST /api/research/nodes — 생성 {versionId, parentNodeId?, kind, label, techniqueId?, note?}
 * sort_order 는 형제 끝에 붙인다(max+1).
 */
router.post('/nodes', wrap(async (req, res) => {
  const uid  = req.user.id;
  const body = req.body || {};

  const version = await resolveOwned(uid, 'version', body.versionId);
  if (!version) return fail(res, 404, '버전을 찾을 수 없습니다');

  const kind = clean(body.kind);
  const kErr = kindError(kind);
  if (kErr) return fail(res, 400, kErr);

  // 🔴 label 은 빈 문자열을 허용한다(컬럼도 NOT NULL DEFAULT ''). "대처 추가" 인라인 버튼처럼
  //    이름 없이 자리부터 만드는 흐름이 실제로 있고, 거기서 400 이 나면 빈 곳을 메울 길이 막힌다.
  const label = has(body, 'label') ? clean(body.label) : '';
  const note  = has(body, 'note')  ? clean(body.note)  : '';
  const tErr = nodeTextError(label, note);
  if (tErr) return fail(res, 400, tErr);

  const techniqueId = await resolveTechniqueId(uid, body.techniqueId);
  if (techniqueId === 'BAD')      return fail(res, 400, 'techniqueId 가 올바르지 않습니다');
  if (techniqueId === 'NOTFOUND') return fail(res, 404, '기술을 찾을 수 없습니다');

  const parentRaw = has(body, 'parentNodeId') ? body.parentNodeId : null;
  const parentId  = (parentRaw === null || parentRaw === undefined || parentRaw === '') ? null : posInt(parentRaw);
  if (parentRaw !== null && parentRaw !== undefined && parentRaw !== '' && parentId === null) {
    return fail(res, 400, 'parentNodeId 가 올바르지 않습니다');
  }

  const nodes = await nodesOfVersion(version.id);
  // 신규 노드는 서브트리 높이가 1 이다 — 옮길 자손이 아직 없다.
  const check = tree.validatePlacement(nodes, null, parentId, {
    versionId: version.id, subtreeHeightOverride: 1,
  });
  if (!check.ok) return fail(res, 400, check.message);

  const siblings = tree.childrenOf(tree.indexNodes(nodes), parentId);
  const sortOrder = siblings.reduce((mx, s) => Math.max(mx, Number(s.sort_order) || 0), -1) + 1;

  const now = new Date();
  const [r] = await sequelize.query(
    `INSERT INTO research_nodes
       (user_id, version_id, parent_node_id, kind, label, technique_id, sort_order, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    // 🔴 user_id 는 요청 본문이 아니라 **부모 버전 행에서 유도**한다(계약 A-2).
    { replacements: [version.user_id, version.id, parentId, kind, label, techniqueId, sortOrder, note || null, now, now] }
  );
  ok(res, await singleNodeView(uid, Number(r?.insertId ?? r)));
}));

/**
 * PATCH /api/research/nodes/:id — **부분 갱신** (계약 C-3).
 *
 * 🔴 본문에 있는 필드만 반영한다. `kind` 만 보내면 label·technique_id·note·sort_order 는 **그대로 남는다.**
 *    task-017 의 "프론트가 안 보낸 필드가 사라진다"(스파링 destroy+reinsert 로 positions 54행 중
 *    36행이 빈 []가 됐다)가 **구조적으로 발생할 수 없게** 하는 것이 이 규칙의 목적이다.
 * 🔴 **어디서도 노드를 지우고 다시 넣지 않는다.** 트리 어느 곳에서도.
 * 🔴 부모 변경은 여기가 아니라 /move 다 — 순환·깊이·버전 검사를 우회할 길을 만들지 않는다.
 */
router.patch('/nodes/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const n = await resolveOwned(uid, 'node', req.params.id);
  if (!n) return fail(res, 404, '노드를 찾을 수 없습니다');
  const body = req.body || {};

  if (has(body, 'parentNodeId')) {
    return fail(res, 400, '부모 변경은 PATCH /api/research/nodes/:id/move 를 사용하세요');
  }

  const sets = [], vals = [];
  if (has(body, 'kind')) {
    const kind = clean(body.kind);
    const err = kindError(kind);
    if (err) return fail(res, 400, err);
    sets.push('kind = ?'); vals.push(kind);
  }
  if (has(body, 'label')) {
    const label = clean(body.label);
    const err = textError('노드 이름', label, LIMITS.label);
    if (err) return fail(res, 400, err);
    sets.push('label = ?'); vals.push(label);
  }
  if (has(body, 'note')) {
    const note = clean(body.note);
    const err = textError('메모', note, LIMITS.note);
    if (err) return fail(res, 400, err);
    sets.push('note = ?'); vals.push(note || null);
  }
  if (has(body, 'techniqueId')) {
    // 🔴 null 을 명시적으로 보내면 **연결 해제**다(미연결 상태로 되돌리기). 안 보내면 그대로 둔다.
    const tid = await resolveTechniqueId(uid, body.techniqueId);
    if (tid === 'BAD')      return fail(res, 400, 'techniqueId 가 올바르지 않습니다');
    if (tid === 'NOTFOUND') return fail(res, 404, '기술을 찾을 수 없습니다');
    sets.push('technique_id = ?'); vals.push(tid);
  }
  if (has(body, 'sortOrder')) {
    const so = parseInt(body.sortOrder, 10);
    if (!Number.isInteger(so) || so < 0) return fail(res, 400, 'sortOrder 는 0 이상의 정수여야 합니다');
    sets.push('sort_order = ?'); vals.push(so);
  }
  if (!sets.length) return fail(res, 400, '수정할 항목이 없습니다');

  await sequelize.query(
    `UPDATE research_nodes SET ${sets.join(', ')} WHERE id = ?`,
    { replacements: [...vals, n.id] }
  );
  ok(res, await singleNodeView(uid, n.id));
}));

/**
 * DELETE /api/research/nodes/:id — **자손 포함** 연쇄 삭제 (계약 A-4).
 *
 * 🔴 `parent_node_id` 에는 FK 가 없다 — DB 가 자손을 지워 주지 않는다. **앱이 수집해야 한다.**
 *    한 단계만 지우면 손자들이 고아가 된다. 이 task 에서 가장 놓치기 쉬운 지점이다.
 *    깊이 상한 12 와 collectSubtreeIds 의 `seen` 집합이 순회 종료를 보장한다.
 */
router.delete('/nodes/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const n = await resolveOwned(uid, 'node', req.params.id);
  if (!n) return fail(res, 404, '노드를 찾을 수 없습니다');

  const counts = await sequelize.transaction(async (t) => {
    const nodes = await nodesOfVersion(n.version_id, t);
    const ids = tree.collectSubtreeIds(nodes, n.id);          // 자기 자신 + 자손 전부
    if (!ids.length) return { deletedNodes: 0, deletedLinks: 0, deletedTasks: 0 };

    const [lr] = await sequelize.query(
      'SELECT COUNT(*) AS c FROM research_links WHERE node_id IN (?)',
      { replacements: [ids], transaction: t });
    const deletedLinks = Number(lr[0]?.c || 0);
    // 🔴 이번 주 과제가 이 서브트리를 가리키고 있으면 함께 사라진다(task-027).
    //    가리키는 노드가 없는 과제는 무엇에 대한 기록인지 화면이 말할 수 없다.
    //    FK CASCADE 도 같은 일을 하지만, 개수를 세어 응답에 실으려면 앱이 직접 지워야 한다.
    const [tr] = await sequelize.query(
      'SELECT COUNT(*) AS c FROM research_tasks WHERE node_id IN (?)',
      { replacements: [ids], transaction: t });
    const deletedTasks = Number(tr[0]?.c || 0);

    await sequelize.query('DELETE FROM research_tasks WHERE node_id IN (?)',
      { replacements: [ids], transaction: t });
    await sequelize.query('DELETE FROM research_links WHERE node_id IN (?)',
      { replacements: [ids], transaction: t });
    await sequelize.query('DELETE FROM research_nodes WHERE id IN (?)',
      { replacements: [ids], transaction: t });

    return { deletedNodes: ids.length, deletedLinks, deletedTasks };
  });

  ok(res, counts);
}));

/**
 * PATCH /api/research/nodes/:id/move — {parentNodeId, sortOrder} 이동·순서 변경 (계약 A-5 검증).
 *
 * 🔴 `sortOrder` 는 **목적지 형제들 사이의 index** 로 해석한다(0 = 맨 앞). 이동 후 목적지 형제의
 *    sort_order 를 0..n-1 로 다시 매긴다. INT 사이에 값을 끼워 넣을 수 없어서 그렇다 —
 *    0,1,2,3 사이 "1번 자리로" 를 raw 값으로 표현할 방법이 없다. index 로 두면 한 번의 호출로 끝난다.
 *    (재번호는 UPDATE 뿐이다 — 행을 지우고 다시 넣지 않는다.)
 * 🔴 부모가 바뀌면 **원래 부모의 형제들도** 다시 매긴다. 빠져나간 자리에 구멍이 남지 않게.
 */
router.patch('/nodes/:id/move', wrap(async (req, res) => {
  const uid = req.user.id;
  const n = await resolveOwned(uid, 'node', req.params.id);
  if (!n) return fail(res, 404, '노드를 찾을 수 없습니다');
  const body = req.body || {};

  const oldParent = (n.parent_node_id == null) ? null : Number(n.parent_node_id);
  let newParent = oldParent;
  if (has(body, 'parentNodeId')) {
    const raw = body.parentNodeId;
    if (raw === null || raw === undefined || raw === '') newParent = null;
    else {
      newParent = posInt(raw);
      if (newParent === null) return fail(res, 400, 'parentNodeId 가 올바르지 않습니다');
    }
  }

  const result = await sequelize.transaction(async (t) => {
    const nodes = await nodesOfVersion(n.version_id, t);
    // 🔴 순환 · 같은 버전 · 깊이 상한 12 — 세 검사를 여기서 한 번에 한다(계약 A-5).
    //    순환 검사가 없으면 이후 모든 트리 순회가 무한 루프가 된다. 화면 버그가 아니라 가용성 문제다.
    const check = tree.validatePlacement(nodes, n.id, newParent, { versionId: n.version_id });
    if (!check.ok) return { error: check.message };

    const idx = tree.indexNodes(nodes);
    const destSiblings = tree.childrenOf(idx, newParent)
      .map((s) => Number(s.id))
      .filter((id) => id !== Number(n.id));

    let index = destSiblings.length;                       // 기본은 끝에 붙이기
    if (has(body, 'sortOrder')) {
      const so = parseInt(body.sortOrder, 10);
      if (!Number.isInteger(so) || so < 0) return { error: 'sortOrder 는 0 이상의 정수여야 합니다' };
      index = Math.min(so, destSiblings.length);
    } else if (newParent === oldParent) {
      // 부모도 순서도 안 바꾼다는 뜻 — 현재 자리를 유지한다.
      index = tree.childrenOf(idx, newParent).findIndex((s) => Number(s.id) === Number(n.id));
      if (index < 0) index = destSiblings.length;
    }

    const ordered = [...destSiblings];
    ordered.splice(index, 0, Number(n.id));

    await sequelize.query('UPDATE research_nodes SET parent_node_id = ? WHERE id = ?',
      { replacements: [newParent, n.id], transaction: t });
    for (let i = 0; i < ordered.length; i++) {
      await sequelize.query('UPDATE research_nodes SET sort_order = ? WHERE id = ?',
        { replacements: [i, ordered[i]], transaction: t });
    }
    if (newParent !== oldParent) {
      const srcRemaining = tree.childrenOf(idx, oldParent)
        .map((s) => Number(s.id))
        .filter((id) => id !== Number(n.id));
      for (let i = 0; i < srcRemaining.length; i++) {
        await sequelize.query('UPDATE research_nodes SET sort_order = ? WHERE id = ?',
          { replacements: [i, srcRemaining[i]], transaction: t });
      }
    }
    return { ok: true };
  });

  if (result.error) return fail(res, 400, result.error);
  ok(res, await singleNodeView(uid, n.id));
}));

/**
 * POST /api/research/nodes/:id/insert-parent — target `T` 의 **위쪽**에 새 노드 `N` 을 끼워 넣는다.
 *
 *   before:  P → [A, T, B]          after:  P → [A, N, B]
 *                                                   └→ [T]
 *   1. N.parent_node_id = T.parent_node_id,  N.sort_order = T.sort_order
 *   2. T.parent_node_id = N.id,              T.sort_order = 0
 *   3. T 의 자손은 그대로 T 에 붙어 따라 내려간다 (건드리지 않는다)
 *   4. A·B 의 sort_order 는 **변하지 않는다**  ← 그래서 여기선 형제 재번호를 하지 않는다
 *
 * 🔴 깊이 검사는 `T` 의 **서브트리 전체 깊이**가 1 늘어나는 것을 기준으로 한다.
 *    `N` 하나만 보고 판정하면 깊은 서브트리를 상한 너머로 밀어 넣을 수 있다.
 */
router.post('/nodes/:id/insert-parent', wrap(async (req, res) => {
  const uid = req.user.id;
  const target = await resolveOwned(uid, 'node', req.params.id);
  if (!target) return fail(res, 404, '노드를 찾을 수 없습니다');
  const body = req.body || {};

  const kind = clean(body.kind);
  const kErr = kindError(kind);
  if (kErr) return fail(res, 400, kErr);
  const label = has(body, 'label') ? clean(body.label) : '';
  const note  = has(body, 'note')  ? clean(body.note)  : '';
  const tErr = nodeTextError(label, note);
  if (tErr) return fail(res, 400, tErr);

  const techniqueId = await resolveTechniqueId(uid, body.techniqueId);
  if (techniqueId === 'BAD')      return fail(res, 400, 'techniqueId 가 올바르지 않습니다');
  if (techniqueId === 'NOTFOUND') return fail(res, 404, '기술을 찾을 수 없습니다');

  const outcome = await sequelize.transaction(async (t) => {
    const nodes = await nodesOfVersion(target.version_id, t);
    const idx = tree.indexNodes(nodes);
    const targetDepth  = tree.depthOf(nodes, target.id, idx);
    const targetHeight = tree.subtreeHeight(nodes, target.id, idx);
    // T 는 한 칸 내려간다 → 이 서브트리의 바닥이 targetDepth + targetHeight 가 된다.
    const newBottom = targetDepth + targetHeight;
    if (newBottom > tree.MAX_DEPTH) {
      return { error: `트리 깊이는 ${tree.MAX_DEPTH}단계까지입니다 (부모를 끼우면 ${newBottom}단계가 됩니다)` };
    }

    const now = new Date();
    const [r] = await sequelize.query(
      `INSERT INTO research_nodes
         (user_id, version_id, parent_node_id, kind, label, technique_id, sort_order, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      { replacements: [
        target.user_id, target.version_id, target.parent_node_id,
        kind, label, techniqueId, Number(target.sort_order) || 0, note || null, now, now,
      ], transaction: t }
    );
    const newId = Number(r?.insertId ?? r);
    // T 를 N 아래로. sort_order = 0 (N 의 유일한 자식이 되므로).
    await sequelize.query(
      'UPDATE research_nodes SET parent_node_id = ?, sort_order = 0 WHERE id = ?',
      { replacements: [newId, target.id], transaction: t });
    return { newId };
  });

  if (outcome.error) return fail(res, 400, outcome.error);
  ok(res, {
    inserted: await singleNodeView(uid, outcome.newId),
    target:   await singleNodeView(uid, target.id),
  });
}));

// ═══ 링크 ════════════════════════════════════════════════════════════════════
// 🔴 "검색해서 가져오기"·"링크 열기" UI 는 task-027/028 이다. 여기는 저장소만 연다.

/** ref_id 소유 확인 — 남의 클립·수업·기술 id 를 매달아 두면 task-027 의 "열기"가 유출 경로가 된다. */
const REF_TABLE = { clip: 'video_clips', class: 'classes', technique: 'techniques' };
async function refIdError(uid, linkType, rawRefId) {
  if (linkType === 'url') {
    // url 은 ref_id 없이 memo 에 주소를 담는다.
    if (rawRefId !== null && rawRefId !== undefined && rawRefId !== '') {
      return { message: 'url 링크에는 refId 를 쓰지 않습니다 (주소는 memo 에 넣어주세요)' };
    }
    return { value: null };
  }
  const refId = posInt(rawRefId);
  if (refId === null) return { message: `${linkType} 링크에는 refId 가 필요합니다` };
  const [rows] = await sequelize.query(
    `SELECT id FROM ${REF_TABLE[linkType]} WHERE id = ? AND user_id = ? LIMIT 1`,
    { replacements: [refId, uid] }
  );
  // 🔴 남의 것이면 404 — 존재 여부를 흘리지 않는다(기술 id 규칙과 같다).
  if (!rows.length) return { message: '연결 대상을 찾을 수 없습니다', status: 404 };
  return { value: refId };
}

/** GET /api/research/nodes/:id/links */
router.get('/nodes/:id/links', wrap(async (req, res) => {
  const n = await resolveOwned(req.user.id, 'node', req.params.id);
  if (!n) return fail(res, 404, '노드를 찾을 수 없습니다');
  const [rows] = await sequelize.query(
    'SELECT * FROM research_links WHERE node_id = ? ORDER BY id ASC', { replacements: [n.id] });
  ok(res, { links: rows.map(linkView) });
}));

/** POST /api/research/links — {nodeId, linkType, refId?, memo?} */
router.post('/links', wrap(async (req, res) => {
  const uid  = req.user.id;
  const body = req.body || {};
  const n = await resolveOwned(uid, 'node', body.nodeId);
  if (!n) return fail(res, 404, '노드를 찾을 수 없습니다');

  const linkType = clean(body.linkType);
  if (!tree.LINK_TYPES.includes(linkType)) {
    return fail(res, 400, `링크 종류는 ${tree.LINK_TYPES.join(' · ')} 중 하나여야 합니다`);
  }
  const memo = has(body, 'memo') ? clean(body.memo) : '';
  const mErr = textError('메모', memo, LIMITS.memo);
  if (mErr) return fail(res, 400, mErr);

  const ref = await refIdError(uid, linkType, body.refId);
  if (ref.message) return fail(res, ref.status || 400, ref.message);

  const [r] = await sequelize.query(
    `INSERT INTO research_links (user_id, node_id, link_type, ref_id, memo, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    // 🔴 user_id 는 본문이 아니라 **부모 노드 행에서 유도**한다(계약 A-2).
    { replacements: [n.user_id, n.id, linkType, ref.value, memo || null, new Date()] }
  );
  const [rows] = await sequelize.query('SELECT * FROM research_links WHERE id = ?',
    { replacements: [Number(r?.insertId ?? r)] });
  ok(res, linkView(rows[0]));
}));

/** PATCH /api/research/links/:id — memo·refId 부분 갱신 (link_type 은 바꾸지 않는다). */
router.patch('/links/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const l = await resolveOwned(uid, 'link', req.params.id);
  if (!l) return fail(res, 404, '링크를 찾을 수 없습니다');
  const body = req.body || {};

  const sets = [], vals = [];
  if (has(body, 'memo')) {
    const memo = clean(body.memo);
    const err = textError('메모', memo, LIMITS.memo);
    if (err) return fail(res, 400, err);
    sets.push('memo = ?'); vals.push(memo || null);
  }
  if (has(body, 'refId')) {
    const ref = await refIdError(uid, l.link_type, body.refId);
    if (ref.message) return fail(res, ref.status || 400, ref.message);
    sets.push('ref_id = ?'); vals.push(ref.value);
  }
  if (!sets.length) return fail(res, 400, '수정할 항목이 없습니다');

  await sequelize.query(`UPDATE research_links SET ${sets.join(', ')} WHERE id = ?`,
    { replacements: [...vals, l.id] });
  const [rows] = await sequelize.query('SELECT * FROM research_links WHERE id = ?',
    { replacements: [l.id] });
  ok(res, linkView(rows[0]));
}));

/** DELETE /api/research/links/:id */
router.delete('/links/:id', wrap(async (req, res) => {
  const l = await resolveOwned(req.user.id, 'link', req.params.id);
  if (!l) return fail(res, 404, '링크를 찾을 수 없습니다');
  await sequelize.query('DELETE FROM research_links WHERE id = ?', { replacements: [l.id] });
  ok(res, { deletedLinks: 1 });
}));

// ═══ 이번 주 과제 ════════════════════════════════════════════════════════════
//
// 🔴 **앱 전체에 열린 과제는 1개다** — 관장 합의 "하나만 파라". 프로젝트가 여러 개여도 과제는 하나다.
//    그래서 경로가 `/task`(단수)이고 `GET` 에 id 가 없다. 목록이 아니라 **상태**이기 때문이다.
//    강제는 두 겹이다: DB 의 UNIQUE(user_id, open_slot) + 아래 트랜잭션의 앱 검사.
//    어느 한쪽만 믿지 않는다 — 앱만 믿으면 동시 요청·SQL 직접 삽입에서 두 개가 열리고,
//    DB 만 믿으면 사용자가 이유를 모르는 500 을 본다. task-026 이 FK 와 트랜잭션 삭제를
//    둘 다 한 것과 같은 이유다.
//
// 🔴 **스파링 저장(PUT /api/classes/:id/spar/:sparDayId)을 건드리지 않았다.**
//    거긴 destroy + reinsert 라(task-017) 새 필드를 실으면 프론트가 안 보낼 때마다 사라진다
//    — `positions` 가 실제로 그렇게 54행 중 36행이 빈 [] 가 됐다. 마감은 아래 전용 라우트를
//    스파링 저장 직후에 한 번 더 부르는 방식이고, 그래서 그 함정이 **구조적으로 발생할 수 없다.**
//
// 🔴 **마감이 사다리를 쓰지 않는다.** 4·5단계는 spar_sessions.success 자동 판정이 원칙이라
//    (사양서 §5.1) 과제 마감이 그 판정을 덮어쓰면 안 된다. `done` 이어도 technique_mastery 에
//    한 줄도 쓰지 않고, 응답의 ladder.applied 는 **항상 false** 다. 과제 결과는 별도 기록이다.

/** 3택 정본. 🔴 값은 ASCII 키, 라벨은 서버가 함께 준다 — 프론트가 라벨을 따로 쓰면 두 곳이 갈린다. */
const TASK_OUTCOMES = [
  { value: 'not_tried',    label: '시도 못 함' },
  { value: 'tried_failed', label: '해봤는데 안 됨' },
  { value: 'done',         label: '됐음' },
];
const OUTCOME_LABEL = new Map(TASK_OUTCOMES.map((o) => [o.value, o.label]));

// 🔴 소유 판별 SQL 은 예외 없이 research_projects 까지 조인한다(계약 A-2).
//    research_tasks.user_id 만 보고 통과시키면 자기 user_id 를 단 **남의 노드 id** 를 심을 수 있다.
//    `WHERE p.user_id = ?` 가 정본이고 t.user_id 는 드리프트 관측용 사본이다.
const TASK_SELECT = `
  SELECT t.id, t.user_id, t.node_id, t.memo, t.outcome, t.closed_at,
         DATE_FORMAT(t.created_at, '%Y-%m-%d') AS created_ymd,
         DATE_FORMAT(t.closed_at,  '%Y-%m-%d') AS closed_ymd,
         n.kind, n.label, n.technique_id, n.version_id,
         v.version_no, v.name AS version_name, v.project_id,
         p.title AS project_title, p.user_id AS owner_id,
         tech.name AS technique_name
    FROM research_tasks    t
    JOIN research_nodes    n ON n.id = t.node_id
    JOIN research_versions v ON v.id = n.version_id
    JOIN research_projects p ON p.id = v.project_id
    LEFT JOIN techniques tech ON tech.id = n.technique_id AND tech.user_id = p.user_id
`;

/**
 * 과제 1건을 뷰로. 🔴 날짜는 SQL 의 DATE_FORMAT 이 만든 'YYYY-MM-DD' 문자열이고,
 * 경과일은 labAnalytics.daysBetween + todayKST 로 잰다 — toISOString() 은 KST 기준 하루를 민다.
 */
function taskView(r) {
  const open = r.closed_at == null;
  const techniqueId = (r.technique_id == null) ? null : Number(r.technique_id);
  return {
    id: Number(r.id),
    nodeId: Number(r.node_id),
    memo: r.memo ?? '',
    createdAt: r.created_ymd ?? null,
    closedAt: r.closed_ymd ?? null,
    open,
    outcome: r.outcome ?? null,
    outcomeLabel: r.outcome ? (OUTCOME_LABEL.get(r.outcome) ?? null) : null,
    // 열린 과제는 오늘까지, 마감된 과제는 마감일까지. 0일도 정상값이다(오늘 정한 과제).
    daysOpen: lab.daysBetween(r.created_ymd, open ? lab.todayKST() : r.closed_ymd),
    node: {
      id: Number(r.node_id),
      kind: r.kind,
      label: r.label ?? '',
      techniqueId,
      techniqueName: techniqueId !== null ? (r.technique_name ?? null) : null,
      linked: techniqueId !== null,
    },
    project: {
      id: Number(r.project_id),
      title: r.project_title,
      versionId: Number(r.version_id),
      versionNo: Number(r.version_no),
      versionName: r.version_name ?? null,
    },
  };
}

/** 열린 과제 1건(없으면 null). 🔴 소유 판별은 p.user_id — t.user_id 사본을 권한에 쓰지 않는다. */
async function openTaskOf(uid, t = null) {
  const [rows] = await sequelize.query(
    `${TASK_SELECT} WHERE p.user_id = ? AND t.closed_at IS NULL ORDER BY t.id DESC LIMIT 1`,
    { replacements: [uid], transaction: t }
  );
  return rows[0] ? taskView(rows[0]) : null;
}

/** 소유가 확인된 과제 행(뷰 아님). 없거나 남의 것이면 null → 호출부가 404 로 끝낸다. */
async function ownedTaskRow(uid, rawId, t = null) {
  const id = posInt(rawId);
  if (id === null) return null;
  const [rows] = await sequelize.query(`${TASK_SELECT} WHERE t.id = ? AND p.user_id = ? LIMIT 1`,
    { replacements: [id, uid], transaction: t });
  return rows[0] || null;
}

/** 마감 이력 최근 5건. "지금 뭘 하고 있나" 옆에 "뭘 해봤나"가 있어야 과제가 흐름으로 읽힌다. */
async function recentClosed(uid, limit = 5) {
  const [rows] = await sequelize.query(
    `${TASK_SELECT} WHERE p.user_id = ? AND t.closed_at IS NOT NULL
      ORDER BY t.closed_at DESC, t.id DESC LIMIT ${Number(limit) || 5}`,
    { replacements: [uid] }
  );
  return rows.map(taskView);
}

/**
 * 마감 결과가 사다리에 무엇을 의미하는지 — **읽기 전용 안내**.
 * 🔴 여기서 technique_mastery 를 쓰지 않는다. 4·5단계는 spar_sessions.success 자동 판정이 원칙이고
 *    (사양서 §5.1) 과제 마감이 그걸 덮어쓰면 같은 기술의 사다리가 두 곳에서 갈린다.
 *    `done` 은 "4단계 후보"라는 **권유**일 뿐이고, applied 는 언제나 false 다.
 */
async function ladderNoteFor(uid, techniqueId, outcome) {
  if (techniqueId == null) {
    return {
      techniqueId: null, reached: null, step4Status: null,
      applied: false, candidateForStep4: false,
      reason: '기술이 연결되지 않아 사다리가 없습니다',
    };
  }
  const data = await lab.loadLabData(uid);
  const mastery = await TechniqueMastery.findOne({
    where: { user_id: uid, technique_id: techniqueId }, raw: true,
  });
  const m = lab.computeMastery(data, techniqueId, { mastery });
  const step4 = m ? (m.steps.find((s) => s.step === 4) || null) : null;
  return {
    techniqueId: Number(techniqueId),
    reached: m ? m.reached : null,
    step4Status: step4 ? step4.status : null,
    applied: false,
    candidateForStep4: outcome === 'done',
    reason: '사다리 4·5단계는 spar_sessions.success 에서 자동 판정합니다 — 과제 결과는 별도 기록입니다',
  };
}

/**
 * GET /api/research/task — 지금 열린 과제 1개 + 마감 이력.
 * 🔴 과제가 없으면 404 가 아니라 `{task: null}` 이다. "아직 정하지 않았다"는 **정상 상태**다.
 */
router.get('/task', wrap(async (req, res) => {
  const uid = req.user.id;
  ok(res, {
    task: await openTaskOf(uid),
    recent: await recentClosed(uid),
    outcomeOptions: TASK_OUTCOMES,
  });
}));

/**
 * POST /api/research/task — {nodeId, memo?} 로 과제 지정.
 * 🔴 이미 열린 과제가 있으면 **409** 이고, 응답에 현재 과제를 동봉한다 — 화면이 "바꾸시겠습니까"를
 *    물을 수 있어야 한다. 그냥 400 만 주면 사용자는 무엇이 막고 있는지 모른다.
 */
router.post('/task', wrap(async (req, res) => {
  const uid  = req.user.id;
  const body = req.body || {};

  const node = await resolveOwned(uid, 'node', body.nodeId);
  if (!node) return fail(res, 404, '노드를 찾을 수 없습니다');

  const memo = has(body, 'memo') ? clean(body.memo) : '';
  const mErr = textError('메모', memo, LIMITS.memo);
  if (mErr) return fail(res, 400, mErr);

  const existing = await openTaskOf(uid);
  if (existing) {
    return fail(res, 409, '이미 진행 중인 과제가 있습니다 — 하나만 파는 것이 규칙입니다', { task: existing });
  }

  try {
    await sequelize.transaction(async (t) => {
      // 🔴 트랜잭션 안에서 한 번 더 본다(위 검사와 INSERT 사이에 다른 요청이 끼어들 수 있다).
      //    FOR UPDATE 로 같은 계정의 열린 행을 잠근다. 최종 방어선은 UNIQUE(user_id, open_slot) 이다.
      const [locked] = await sequelize.query(
        'SELECT id FROM research_tasks WHERE user_id = ? AND closed_at IS NULL FOR UPDATE',
        { replacements: [uid], transaction: t }
      );
      if (locked.length) throw Object.assign(new Error('duplicate_open_task'), { __dup: true });

      await sequelize.query(
        'INSERT INTO research_tasks (user_id, node_id, memo, created_at) VALUES (?, ?, ?, ?)',
        // 🔴 user_id 는 요청 본문이 아니라 **노드의 소유자**에서 유도한다(계약 A-2 와 같은 규칙).
        { replacements: [node.owner_id, node.id, memo || null, new Date()], transaction: t }
      );
    });
  } catch (e) {
    // UNIQUE(user_id, open_slot) 위반도 같은 뜻이다 — 조용히 삼키지 않고 409 로 번역한다.
    if (e.__dup || String(e.name || '').includes('Unique') || /uq_rt_open/.test(String(e.message || ''))) {
      return fail(res, 409, '이미 진행 중인 과제가 있습니다 — 하나만 파는 것이 규칙입니다',
        { task: await openTaskOf(uid) });
    }
    throw e;
  }

  ok(res, { task: await openTaskOf(uid), recent: await recentClosed(uid), outcomeOptions: TASK_OUTCOMES });
}));

/**
 * PATCH /api/research/task/:id — {memo} **부분 갱신**.
 * 🔴 nodeId 변경은 받지 않는다(취소 후 재지정이 정본 흐름이다) — 과제가 도중에 다른 것을 가리키면
 *    "무엇을 며칠 팠는가"가 기록에서 사라진다. outcome 변경도 여기가 아니라 /close 다.
 */
router.patch('/task/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const row = await ownedTaskRow(uid, req.params.id);
  if (!row) return fail(res, 404, '과제를 찾을 수 없습니다');
  const body = req.body || {};

  if (has(body, 'nodeId'))  return fail(res, 400, '과제 대상 변경은 취소 후 다시 지정해주세요');
  if (has(body, 'outcome')) return fail(res, 400, '마감은 POST /api/research/task/:id/close 를 사용하세요');
  if (!has(body, 'memo'))   return fail(res, 400, 'memo 를 보내주세요');

  const memo = clean(body.memo);
  const mErr = textError('메모', memo, LIMITS.memo);
  if (mErr) return fail(res, 400, mErr);

  await sequelize.query('UPDATE research_tasks SET memo = ? WHERE id = ?',
    { replacements: [memo || null, row.id] });

  const fresh = await ownedTaskRow(uid, row.id);
  ok(res, { task: taskView(fresh), outcomeOptions: TASK_OUTCOMES });
}));

/**
 * POST /api/research/task/:id/close — 3택 마감.
 * 🔴 `done` 이어도 technique_mastery 에 한 줄도 쓰지 않는다(위 섹션 주석 참고).
 */
router.post('/task/:id/close', wrap(async (req, res) => {
  const uid = req.user.id;
  const row = await ownedTaskRow(uid, req.params.id);
  if (!row) return fail(res, 404, '과제를 찾을 수 없습니다');
  if (row.closed_at != null) return fail(res, 400, '이미 마감된 과제입니다');

  const outcome = clean((req.body || {}).outcome);
  if (!OUTCOME_LABEL.has(outcome)) {
    return fail(res, 400, `결과는 ${TASK_OUTCOMES.map((o) => `${o.value}(${o.label})`).join(' · ')} 중 하나여야 합니다`);
  }

  await sequelize.query('UPDATE research_tasks SET closed_at = ?, outcome = ? WHERE id = ? AND closed_at IS NULL',
    { replacements: [new Date(), outcome, row.id] });

  const fresh = await ownedTaskRow(uid, row.id);
  ok(res, {
    task: taskView(fresh),
    ladder: await ladderNoteFor(uid, fresh.technique_id, outcome),
    recent: await recentClosed(uid),
    outcomeOptions: TASK_OUTCOMES,
  });
}));

/**
 * DELETE /api/research/task/:id — 지정 취소(잘못 고른 경우).
 * 🔴 **마감된 과제는 지우지 않는다(400).** 마감 이력은 "무엇을 해봤나"의 기록이고,
 *    지울 수 있게 하면 사다리 4단계 후보의 근거가 조용히 사라진다.
 */
router.delete('/task/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const row = await ownedTaskRow(uid, req.params.id);
  if (!row) return fail(res, 404, '과제를 찾을 수 없습니다');
  if (row.closed_at != null) return fail(res, 400, '마감된 과제는 취소할 수 없습니다');

  await sequelize.query('DELETE FROM research_tasks WHERE id = ? AND closed_at IS NULL',
    { replacements: [row.id] });
  ok(res, { deletedTasks: 1, task: await openTaskOf(uid), outcomeOptions: TASK_OUTCOMES });
}));

module.exports = router;
