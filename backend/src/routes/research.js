const express = require('express');
const router  = express.Router();
const { sequelize, Technique, TechniqueMastery } = require('../models');
const { ok, fail, wrap } = require('../utils/respond');
const { toNFC } = require('../utils/nfc');
const lab  = require('../services/labAnalytics');
const tree = require('../services/researchTree');
const importSearch = require('../services/importSearch');

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

// task-030: 검증 프리미티브·소유 판별·노드 조회는 services/researchCore.js 로 **그대로 옮겼다.**
// 관장의 승인 실행기(services/masterActions.js)가 라우트와 **같은 검증·같은 소유 SQL** 을 써야 하기
// 때문이다. 두 벌이면 한 벌만 고쳐지고, "화면으로 만들면 400 인데 관장이 만들면 통과"하는 구멍이 생긴다.
// 🔴 이름·동작은 옮기기 전과 같다 — 아래 1,700줄의 호출부는 한 줄도 바뀌지 않았다.
const {
  LIMITS, clean, textLen, hasNonBMP, textError, has, posInt,
  OWN_SQL, resolveOwned, nodesOfVersion, nodesOfVersions,
} = require('../services/researchCore');
const rw = require('../services/researchWrite');

// ── 조회 헬퍼 ────────────────────────────────────────────────────────────────

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

// ── 링크 대상 해석 ───────────────────────────────────────────────────────────
//
// 🔴 **`research_links.ref_id` 에는 FK 가 없다 — 일부러 없다.** 6개 서로 다른 테이블을 한 컬럼이
//    가리키기 때문에 FK 를 걸 방법 자체가 없다(다형 참조). 그래서 대상이 지워지면 DB 는
//    아무것도 해 주지 않고 **끊긴 링크가 남는다.**
//
// 🔴 그때 **500 을 내지 않는다.** 대상 삭제는 사용자가 정상적으로 하는 일이고, 그 결과가
//    서버 에러면 노드 하나가 통째로 안 열린다. 조회할 때마다 대상 존재를 확인해
//    `broken: true` 로 **상태로 실어 보낸다** — /api/holes 의 `linked:false`,
//    nodeView 의 `linked` 와 같은 문법이다. 숨기지도, 터지지도 않는다.
//
// 🔴 `AND user_id = ?` 가 붙어 있는 것이 중요하다. 계정 이전·데이터 이동으로 남의 행을 가리키게
//    된 링크는 "있다"가 아니라 **끊김**이다. 남의 클립 제목이 이 응답으로 새어 나갈 길이 없다.
//
// 🔴 `fields` 는 **화면이 그 링크를 열기 위해 꼭 필요한 값**을 추가로 싣는 자리다(모든 컬럼이 아니다).
//    `chapter` 가 그 이유의 전부다: `long_video_chapters.id` 만으로는 **부모 영상 id 를 알 수 없어**
//    프론트가 `/study/:longVideoId` 를 열 수 없다. 목록 API(`/api/long-videos`)에 챕터가 없어
//    역추적도 N+1 없이는 불가능하다. `import-search` 는 붙이는 순간에만 알려주므로, 새로고침하면
//    그 정보가 사라진다 — **조회 시점에 서버가 줘야** 링크가 계속 열린다(dev-028b 요청, 2026-09-07).
const LINK_TARGETS = {
  clip:      { table: 'video_clips',         title: 'title', extra: "'' AS subtitle" },
  class:     { table: 'classes',             title: 'theme', extra: "DATE_FORMAT(`date`, '%Y-%m-%d') AS subtitle" },
  technique: { table: 'techniques',          title: 'name',  extra: "COALESCE(category, '') AS subtitle" },
  gameplan:  { table: 'gameplans',           title: 'name',  extra: "COALESCE(start_pos, '') AS subtitle" },
  chain:     { table: 'technique_chains',    title: 'name',  extra: "'' AS subtitle" },
  chapter:   {
    table: 'long_video_chapters', title: 'title',
    extra: "COALESCE(`summary`, '') AS subtitle, long_video_id, idx, start_sec",
    fields: { long_video_id: 'longVideoId', idx: 'idx', start_sec: 'startSec' },
  },
};

// 🔴 자기점검 — `researchTree.LINK_TYPES` 와 `LINK_TARGETS` 의 짝이 어긋나면 링크는 **만들어지는데**
//    조회에서 영원히 `broken:true` 가 된다. 에러가 안 나는 종류의 실패라 부팅 때 크게 남긴다.
{
  const missing = tree.LINK_TYPES.filter((k) => k !== 'url' && !LINK_TARGETS[k]);
  const extra   = Object.keys(LINK_TARGETS).filter((k) => !tree.LINK_TYPES.includes(k));
  if (missing.length || extra.length) {
    console.error(`[research] 🔴 LINK_TYPES ↔ LINK_TARGETS 불일치 — 대상표 없음: [${missing}] / 종류에 없음: [${extra}]`);
  }
}

/**
 * 링크 배열에 대상 정보를 붙인다 → `{...linkView, broken, brokenReason, target}`.
 * 🔴 쿼리는 **등장하는 link_type 종류 수만큼**이다(최대 6). 링크 수와 무관 — N+1 이 아니다.
 */
async function attachLinkTargets(uid, links, t = null) {
  const byType = new Map();
  for (const l of links) {
    const type = String(l.link_type ?? '');
    const refId = (l.ref_id == null) ? null : Number(l.ref_id);
    if (!LINK_TARGETS[type] || refId === null) continue;
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type).add(refId);
  }

  const found = new Map();   // `${type}:${id}` -> { title, subtitle }
  for (const [type, ids] of byType) {
    const spec = LINK_TARGETS[type];
    const [rows] = await sequelize.query(
      `SELECT id, ${spec.title} AS title, ${spec.extra}
         FROM ${spec.table} WHERE id IN (?) AND user_id = ?`,
      { replacements: [[...ids], uid], transaction: t }
    );
    for (const r of rows) {
      const t = {
        title: toNFC(String(r.title ?? '')).trim(),
        subtitle: toNFC(String(r.subtitle ?? '')).trim().slice(0, 120),
      };
      // 🔴 값이 없으면 **키를 지어내지 않고 null 을 준다.** 프론트가 "열 수 없음"과 "0번 챕터"를
      //    구분할 수 있어야 한다(0 은 유효한 idx 다 — 실측 첫 챕터가 idx=0 이다).
      for (const [col, key] of Object.entries(spec.fields || {})) {
        t[key] = (r[col] == null || r[col] === '') ? null : Number(r[col]);
      }
      found.set(`${type}:${Number(r.id)}`, t);
    }
  }

  return links.map((l) => {
    const view = linkView(l);
    const type = view.linkType;
    // url 링크는 가리키는 행이 없다 — 끊길 수가 없다(주소는 memo 에 있다).
    if (type === 'url') return { ...view, broken: false, brokenReason: null, target: null };
    if (!LINK_TARGETS[type]) {
      // 화이트리스트에 없는 종류가 저장돼 있다(옛 데이터·수동 삽입). 터뜨리지 않고 끊김으로 표시.
      return { ...view, broken: true, brokenReason: 'unknown_type', target: null };
    }
    if (view.refId === null) {
      return { ...view, broken: true, brokenReason: 'no_ref', target: null };
    }
    const hit = found.get(`${type}:${view.refId}`);
    if (!hit) {
      // 대상이 지워졌거나 더 이상 이 계정의 것이 아니다. **둘을 구분해 알려주지 않는다**
      // (남의 id 존재 여부를 흘리지 않는 404 규칙과 같은 정신).
      return { ...view, broken: true, brokenReason: 'missing', target: null };
    }
    return { ...view, broken: false, brokenReason: null, target: { ...hit, refId: view.refId, linkType: type } };
  });
}

/**
 * 노드 id → `{ total, broken }` 링크 통계. 한 버전 치를 한 번에.
 * 🔴 끊김 수를 트리 응답에 실어야 화면이 노드를 열어 보기 **전에** 끊김을 표시할 수 있다.
 *    프론트가 노드마다 /links 를 부르면 N+1 이고, 안 부르면 끊김이 영영 안 보인다.
 */
async function linkStatsMap(versionIds, uid, t = null) {
  if (!versionIds.length) return new Map();
  const [rows] = await sequelize.query(
    `SELECT l.* FROM research_links l JOIN research_nodes n ON n.id = l.node_id
      WHERE n.version_id IN (?) ORDER BY l.id ASC`,
    { replacements: [versionIds], transaction: t }
  );
  if (!rows.length) return new Map();
  const resolved = await attachLinkTargets(uid, rows, t);
  const out = new Map();
  for (const r of resolved) {
    const k = Number(r.nodeId);
    if (!out.has(k)) out.set(k, { total: 0, broken: 0 });
    const s = out.get(k);
    s.total++;
    if (r.broken) s.broken++;
  }
  return out;
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
function nodeView(n, { techName = null, linkCount = 0, brokenLinkCount = 0 } = {}) {
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
    // 🔴 대상이 지워진 링크 수. 0 이 아니면 화면이 노드를 열기 **전에** 끊김을 표시할 수 있다.
    //    이 값이 없으면 프론트는 노드마다 /links 를 부르거나(N+1) 끊김을 영영 못 본다.
    brokenLinkCount: Number(brokenLinkCount) || 0,
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
  const linkMap  = active ? await linkStatsMap([active.id], userId) : new Map();

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
      linkCount: linkMap.get(Number(n.id))?.total || 0,
      brokenLinkCount: linkMap.get(Number(n.id))?.broken || 0,
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
  const uid = req.user.id;
  // task-030: 검증 + (프로젝트 + v1) 트랜잭션은 services/researchWrite.createProject 로 옮겼다.
  // 관장의 승인 실행기가 **같은 함수**를 부른다 — 화면으로 만든 것과 관장이 만든 것이
  // 글자 하나 다르지 않아야 하기 때문이다. 검증 순서·메시지·트랜잭션 경계는 옮기기 전 그대로다.
  let projectId;
  try {
    projectId = await rw.createProject(uid, req.body || {});
  } catch (e) {
    if (e.__field) return fail(res, e.status || 400, e.message);
    throw e;
  }
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

/**
 * POST /api/research/versions/:id/branch — **분기**. 이 버전의 트리를 통째로 복제해 새 버전을 만든다.
 * 본문 `{ name? }`.
 *
 * 🔴 **원본은 노드·링크 한 바이트도 바뀌지 않는다.** 이 라우트가 원본 트리에 실행하는 문장은
 *    `SELECT` 뿐이다 — 원본 `research_nodes`/`research_links` 에 대한 UPDATE·DELETE 가 **0건**이다.
 *    분기는 "지금까지의 판을 남겨 두고 다른 길을 시험해 보는 것"이라, 원본이 조금이라도 달라지면
 *    분기 자체의 존재 이유가 사라진다. 유일하게 바뀌는 원본 값은 `research_versions.is_active`
 *    1→0 이고, 그건 아래 "활성은 정확히 1개" 규칙이 요구하는 것이다(노드·링크가 아니다).
 *
 * 🔴 **활성 버전은 언제나 정확히 1개다.** 새 버전을 활성으로 만들기 전에 같은 프로젝트의 전부를
 *    0 으로 내린다 — **한 트랜잭션 안에서**. 두 문장 사이에서 끊기면 활성 0개(화면이 표현 못 함)
 *    또는 2개(어느 것이 정본인지 모름)가 된다. PATCH /versions/:id 의 전환과 같은 순서다.
 *
 * 🔴 **부모-자식·sort_order·kind·technique_id·note·링크까지 전부 복제한다.** 링크는 `link_type` +
 *    `ref_id` 로 **id 참조만** 하므로 원본이 가리키던 대상을 그대로 가리킨다(대상 테이블은 안 건드린다).
 *
 * 🔴 **`research_tasks`(이번 주 과제)는 복제하지 않는다.** 과제는 앱 전체에 1개이고
 *    `UNIQUE(user_id, open_slot)` 이 걸려 있어 복제하면 500 이 난다. 그보다, 과제는 "지금 무엇을
 *    파고 있나"라는 **상태**지 트리의 일부가 아니다. 복제하면 같은 과제가 두 버전에 생긴다.
 *
 * 🔴 깊이 상한·순환 방어는 `researchTree` 의 것을 그대로 쓴다(`planBranchCopy`·`maxDepthOf`).
 *    구조를 그대로 베끼므로 깊이는 변하지 않지만, **이미 상한을 넘은 원본**을 복제해 퍼뜨리지
 *    않도록 복제 전에 한 번 잰다.
 */
router.post('/versions/:id/branch', wrap(async (req, res) => {
  const uid = req.user.id;
  const src = await resolveOwned(uid, 'version', req.params.id);
  if (!src) return fail(res, 404, '버전을 찾을 수 없습니다');

  const body = req.body || {};
  let name = has(body, 'name') ? clean(body.name) : '';
  if (name) {
    const err = textError('버전 이름', name, LIMITS.versionName);
    if (err) return fail(res, 400, err);
  }

  const outcome = await sequelize.transaction(async (t) => {
    // ── 1. 원본 읽기 (SELECT 뿐) ────────────────────────────────────────────
    const nodes = await nodesOfVersion(src.id, t);
    const idx   = tree.indexNodes(nodes);
    // 🔴 새 행의 user_id 는 `research_projects.user_id`(= owner_id, **정본**)에서 유도한다.
    //    원본 버전 행의 user_id 는 부모에서 유도해 채운 **사본**이라, 그게 드리프트해 있으면
    //    분기가 드리프트를 그대로 퍼뜨린다. 사본이 아니라 정본을 베낀다(계약 A-2).
    const ownerId = Number(src.owner_id);

    const srcDepth = tree.maxDepthOf(nodes, idx);
    if (srcDepth > tree.MAX_DEPTH) {
      return { error: `원본 트리가 이미 깊이 상한(${tree.MAX_DEPTH})을 넘었습니다 — ${srcDepth}단계` };
    }

    const [linkRows] = await sequelize.query(
      `SELECT l.* FROM research_links l JOIN research_nodes n ON n.id = l.node_id
        WHERE n.version_id = ? ORDER BY l.id ASC`,
      { replacements: [src.id], transaction: t }
    );

    // ── 2. 새 버전 행 ───────────────────────────────────────────────────────
    // version_no 는 이 프로젝트의 최대값 + 1. UNIQUE(project_id, version_no) 가 바닥을 받친다.
    const [maxRows] = await sequelize.query(
      'SELECT COALESCE(MAX(version_no), 0) AS mx FROM research_versions WHERE project_id = ? FOR UPDATE',
      { replacements: [src.project_id], transaction: t }
    );
    const nextNo = Number(maxRows[0]?.mx || 0) + 1;
    if (!name) name = `v${src.version_no} 분기`;

    const now = new Date();
    const [vr] = await sequelize.query(
      `INSERT INTO research_versions (user_id, project_id, version_no, name, is_active, parent_version_id, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      // 🔴 user_id 는 본문이 아니라 **원본 버전 행에서 유도**한다(계약 A-2).
      //    parent_version_id 가 "어디서 갈라졌는가"의 기록이다.
      { replacements: [ownerId, src.project_id, nextNo, name, src.id, now], transaction: t }
    );
    const newVersionId = Number(vr?.insertId ?? vr);

    // ── 3. 노드 복제 — 부모가 반드시 먼저 들어간다 ──────────────────────────
    const plan = tree.planBranchCopy(nodes, idx);
    const idMap = new Map();            // 원본 노드 id -> 새 노드 id
    for (const step of plan.order) {
      const n = step.node;
      const newParent = (step.parentId === null) ? null : (idMap.get(step.parentId) ?? null);
      const [nr] = await sequelize.query(
        `INSERT INTO research_nodes
           (user_id, version_id, parent_node_id, kind, label, technique_id, sort_order, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        { replacements: [
          ownerId, newVersionId, newParent,
          n.kind, n.label ?? '', (n.technique_id == null ? null : Number(n.technique_id)),
          Number(n.sort_order) || 0, n.note ?? null, now, now,
        ], transaction: t }
      );
      idMap.set(Number(n.id), Number(nr?.insertId ?? nr));
    }

    // ── 4. 링크 복제 — link_type + ref_id 는 그대로. 대상 테이블은 건드리지 않는다. ──
    let copiedLinks = 0;
    for (const l of linkRows) {
      const newNodeId = idMap.get(Number(l.node_id));
      if (!newNodeId) continue;         // 위 3에서 복제 못 한 노드의 링크(정상 경로에선 0건)
      await sequelize.query(
        `INSERT INTO research_links (user_id, node_id, link_type, ref_id, memo, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        { replacements: [ownerId, newNodeId, l.link_type, l.ref_id, l.memo, now], transaction: t }
      );
      copiedLinks++;
    }

    // ── 5. 활성 전환 — 같은 트랜잭션. 활성은 언제나 정확히 1개다. ────────────
    await sequelize.query('UPDATE research_versions SET is_active = 0 WHERE project_id = ?',
      { replacements: [src.project_id], transaction: t });
    await sequelize.query('UPDATE research_versions SET is_active = 1 WHERE id = ?',
      { replacements: [newVersionId], transaction: t });

    return {
      newVersionId, nextNo, name,
      sourceNodeCount: nodes.length,
      copiedNodes: idMap.size,
      sourceLinkCount: linkRows.length,
      copiedLinks,
      maxDepth: srcDepth,
      // 🔴 정상 데이터면 둘 다 빈 배열이다. 비어 있지 않으면 원본이 이미 깨져 있었다는 뜻이고,
      //    복제가 그걸 **조용히 고치거나 버리지 않았음**을 응답으로 알린다.
      detachedNodeIds: plan.detachedNodeIds,
      skippedNodeIds: plan.skippedNodeIds,
    };
  });

  if (outcome.error) return fail(res, 400, outcome.error);

  ok(res, {
    branchedFrom: { versionId: Number(src.id), versionNo: Number(src.version_no) },
    version: {
      id: outcome.newVersionId, versionNo: outcome.nextNo, name: outcome.name,
      isActive: true, parentVersionId: Number(src.id),
    },
    copied: {
      nodes: outcome.copiedNodes, links: outcome.copiedLinks,
      // 🔴 원본 개수를 나란히 싣는다. 하나라도 덜 복제되면 응답만 보고 알 수 있게.
      sourceNodes: outcome.sourceNodeCount, sourceLinks: outcome.sourceLinkCount,
      complete: outcome.copiedNodes === outcome.sourceNodeCount
             && outcome.copiedLinks === outcome.sourceLinkCount,
      maxDepth: outcome.maxDepth,
      detachedNodeIds: outcome.detachedNodeIds,
      skippedNodeIds: outcome.skippedNodeIds,
    },
    project: await detailById(uid, src.project_id),
  });
}));

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

// task-030: kind·technique_id·텍스트 검증은 services/researchWrite.js 로 옮겼다 —
// 관장 승인 실행기가 **같은 검증**을 쓰기 위해서다. 이름과 동작은 그대로다.
const { kindError, resolveTechniqueId, nodeTextError } = rw;

/** 한 노드를 뷰로. 이름·링크수까지 채워 돌려준다(프론트가 만든 직후 그대로 그릴 수 있게). */
async function singleNodeView(uid, nodeId) {
  const row = await resolveOwned(uid, 'node', nodeId);
  if (!row) return null;
  let techName = null;
  if (row.technique_id != null) {
    const t = await Technique.findOne({ where: { id: row.technique_id, user_id: uid }, raw: true });
    techName = t ? t.name : null;
  }
  const [lrows] = await sequelize.query(
    'SELECT * FROM research_links WHERE node_id = ? ORDER BY id ASC', { replacements: [row.id] });
  const resolved = await attachLinkTargets(uid, lrows);
  return nodeView(row, {
    techName,
    linkCount: resolved.length,
    brokenLinkCount: resolved.filter((l) => l.broken).length,
  });
}

/**
 * POST /api/research/nodes — 생성 {versionId, parentNodeId?, kind, label, techniqueId?, note?}
 * sort_order 는 형제 끝에 붙인다(max+1).
 */
router.post('/nodes', wrap(async (req, res) => {
  const uid = req.user.id;
  const version = await resolveOwned(uid, 'version', (req.body || {}).versionId);
  if (!version) return fail(res, 404, '버전을 찾을 수 없습니다');
  // task-030: 검증 + INSERT 는 services/researchWrite.createNode 로 옮겼다(관장 승인과 한 벌).
  let nodeId;
  try {
    nodeId = await rw.createNode(uid, version, req.body || {});
  } catch (e) {
    if (e.__field) return fail(res, e.status || 400, e.message);
    throw e;
  }
  ok(res, await singleNodeView(uid, nodeId));
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

// ═══ 가져오기 검색 ════════════════════════════════════════════════════════════

/**
 * GET /api/research/import-search?q=&source=&limit= — 5개 저장소(6갈래) 통합 검색 (task-028 B).
 *
 * 노드에 매달 후보를 한 번에 찾는다. 응답 항목의 `linkType`·`refId` 를 그대로
 * `POST /api/research/nodes/:id/links` 에 실으면 연결된다 — 화면이 매핑을 재조립하지 않는다.
 *
 * 🔴 **검색 로직은 `services/importSearch.js` → `services/recallSearch.js` 로 내려간다.**
 *    수업기록 갈래는 task-025 의 `searchCorpus` 를 통째로 재사용하고, 나머지도 같은
 *    `makeSnippets`/`normQuery` 를 쓴다. 여기에 새 매처가 없다(계약: 신규 검색 로직 금지).
 * 🔴 NFC 정규화는 그 두 함수 안에 있다 — 자모분리(NFD)로 친 검색어도 걸린다(task-014).
 * 🔴 `q` 가 비면 400 이 아니라 **둘러보기**다(`browse: true`). 화면을 열자마자 빈 손이 되지 않게.
 */
router.get('/import-search', wrap(async (req, res) => {
  const uid = req.user.id;
  const q = clean(req.query.q ?? '');
  // 이 DB 는 utf8mb3 라 이모지는 저장 경로에서 500 이 된다. 검색은 저장하지 않으므로 막지 않되,
  // 길이는 막는다 — 스니펫 윈도우가 검색어 길이에 비례해 커진다.
  if (textLen(q) > 200) return fail(res, 400, '검색어는 200자 이내로 입력해주세요');

  const rawSource = clean(req.query.source ?? '');
  let sources = null;
  if (rawSource) {
    sources = rawSource.split(',').map((s) => s.trim()).filter(Boolean);
    const bad = sources.filter((s) => !importSearch.SOURCE_KEYS.includes(s));
    if (bad.length) {
      return fail(res, 400, `출처는 ${importSearch.SOURCE_KEYS.join(' · ')} 중에서 골라주세요`);
    }
  }

  const limit = has(req.query, 'limit') ? posInt(req.query.limit) : null;
  if (has(req.query, 'limit') && limit === null) {
    return fail(res, 400, 'limit 은 1 이상의 정수여야 합니다');
  }

  ok(res, await importSearch.importSearch(uid, {
    q, sources, limit: limit ?? importSearch.DEFAULT_LIMIT,
  }));
}));

// ═══ 링크 ════════════════════════════════════════════════════════════════════
//
// 🔴 **기존 테이블 스키마를 한 줄도 바꾸지 않는다.** `link_type` + `ref_id` 로 **id 참조만** 한다.
//    6개 저장소를 한 컬럼이 가리키는 다형 참조라 FK 를 걸 수단이 없고, 그래서 **끊김이 실재한다.**
//    끊긴 링크는 500 이 아니라 `broken: true` 다 — 위 `attachLinkTargets` 주석 참고.

/**
 * ref_id 소유 확인 — 남의 클립·수업·기술 id 를 매달아 두면 "열기"가 유출 경로가 된다.
 * task-030: 구현은 services/researchWrite.refIdError 한 벌이고, 여기서는 이 라우터가 소유한
 * `LINK_TARGETS` 표만 주입한다 — 두 벌을 두면 한 벌만 고쳐진다.
 */
async function refIdError(uid, linkType, rawRefId) {
  return rw.refIdError(uid, linkType, rawRefId, LINK_TARGETS);
}

/**
 * GET /api/research/nodes/:id/links — 링크 목록 + **끊김 판정**.
 * 🔴 대상이 지워진 링크는 목록에서 사라지지 않는다. `broken: true` 로 남는다 —
 *    사라지면 사용자는 "내가 연결했던 게 뭐였지"를 영영 알 수 없고, 지울 수도 없다.
 */
router.get('/nodes/:id/links', wrap(async (req, res) => {
  const uid = req.user.id;
  const n = await resolveOwned(uid, 'node', req.params.id);
  if (!n) return fail(res, 404, '노드를 찾을 수 없습니다');
  const [rows] = await sequelize.query(
    'SELECT * FROM research_links WHERE node_id = ? ORDER BY id ASC', { replacements: [n.id] });
  const links = await attachLinkTargets(uid, rows);
  ok(res, {
    nodeId: Number(n.id),
    links,
    total: links.length,
    brokenCount: links.filter((l) => l.broken).length,
  });
}));

/** 링크 생성 본문 검증 + INSERT. `POST /links` 와 `POST /nodes/:id/links` 가 **한 벌**을 쓴다. */
async function createLink(res, uid, node, body) {
  // task-030: 검증 + INSERT 는 services/researchWrite.createLink 로 옮겼다(관장 승인과 한 벌).
  // LINK_TARGETS 는 이 라우터가 소유한 표라 **주입**한다 — 서비스가 화면 전용 표를 알 필요가 없다.
  let linkId;
  try {
    linkId = await rw.createLink(uid, node, body, { linkTargets: LINK_TARGETS });
  } catch (e) {
    if (e.__field) return fail(res, e.status || 400, e.message);
    throw e;
  }
  const [rows] = await sequelize.query('SELECT * FROM research_links WHERE id = ?',
    { replacements: [linkId] });
  const [view] = await attachLinkTargets(uid, rows);
  return ok(res, view);
}

/**
 * POST /api/research/nodes/:id/links — {linkType, refId?, memo?} (task-028 C).
 * 노드 스코프 경로. 가져오기 검색 결과의 `linkType`·`refId` 를 그대로 실으면 된다.
 */
router.post('/nodes/:id/links', wrap(async (req, res) => {
  const uid = req.user.id;
  const n = await resolveOwned(uid, 'node', req.params.id);
  if (!n) return fail(res, 404, '노드를 찾을 수 없습니다');
  return createLink(res, uid, n, req.body || {});
}));

/**
 * DELETE /api/research/nodes/:id/links/:linkId (task-028 C).
 * 🔴 링크가 **그 노드의 것**인지까지 확인한다. 노드만 소유 확인하고 linkId 를 그대로 지우면
 *    자기 노드 id + 남의 링크 id 조합으로 남의 링크를 지울 수 있다.
 */
router.delete('/nodes/:id/links/:linkId', wrap(async (req, res) => {
  const uid = req.user.id;
  const n = await resolveOwned(uid, 'node', req.params.id);
  if (!n) return fail(res, 404, '노드를 찾을 수 없습니다');
  const l = await resolveOwned(uid, 'link', req.params.linkId);
  if (!l || Number(l.node_id) !== Number(n.id)) return fail(res, 404, '링크를 찾을 수 없습니다');

  await sequelize.query('DELETE FROM research_links WHERE id = ? AND node_id = ?',
    { replacements: [l.id, n.id] });
  ok(res, { deletedLinks: 1, nodeId: Number(n.id) });
}));

/** POST /api/research/links — {nodeId, linkType, refId?, memo?} (기존 경로 — 유지). */
router.post('/links', wrap(async (req, res) => {
  const uid  = req.user.id;
  const body = req.body || {};
  const n = await resolveOwned(uid, 'node', body.nodeId);
  if (!n) return fail(res, 404, '노드를 찾을 수 없습니다');
  return createLink(res, uid, n, body);
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
  const [view] = await attachLinkTargets(uid, rows);
  ok(res, view);
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
    // task-030: 트랜잭션·FOR UPDATE·INSERT 는 services/researchWrite.setWeeklyTask 로 옮겼다.
    // 🔴 `replace` 를 넘기지 않으므로(기본 false) 이 라우트의 동작은 추출 전과 완전히 같다 —
    //    열린 과제가 있으면 만들지 않고 409 다. `replace:true` 는 관장 승인 화면 전용이다.
    await rw.setWeeklyTask(uid, node, { memo });
  } catch (e) {
    if (e.__field) return fail(res, e.status || 400, e.message);
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
