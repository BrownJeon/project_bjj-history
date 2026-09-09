// 관장의 **조회** 도구 11종 (task-030 · 기획서 §7-A).
//
// 🔴 **전부 읽기 전용이다.** 이 파일에는 INSERT·UPDATE·DELETE 가 한 줄도 없다.
//   관장이 훈련생의 기록을 고치거나 지우는 도구는 영구적으로 없다(기획서 §1 Out).
//
// 🔴 **새 검색·매칭 로직을 만들지 않는다.** 전부 기존 서비스를 그대로 부른다 —
//   labAnalytics · recallSearch · researchTree · positions · techMatch · ytdlp.
//   화면이 보는 숫자와 관장이 보는 숫자가 다르면, 관장의 인용은 근거가 아니라 소음이 된다.
//   (importSearch 가 4저장소 검색을 재사용한 것과 같은 원칙.)
//
// 🔴 **스코프는 env 의 BJJ_USER_ID 하나다.** 어떤 도구도 user_id 를 인자로 받지 않는다.
const { z } = require('zod');
const { sequelize } = require('../../config/db');
const { Profile, BeltHistory, VideoClip, Technique, TechniqueMastery } = require('../../models');
const lab    = require('../../services/labAnalytics');
const recall = require('../../services/recallSearch');
const tree   = require('../../services/researchTree');
const { listPositions } = require('../../services/positions');
const { searchVideos } = require('../../services/ytdlp');
const coach  = require('../../services/coachAnalytics');
const { matchTechnique } = require('../../utils/techMatch');
const { ctx, respond, toolError, guard } = require('../lib');

function register(server) {
  // ── 1. get_trainee_profile ─────────────────────────────────────────────────
  server.registerTool('get_trainee_profile', {
    description: '훈련생 프로필 — 닉네임·벨트·스트라이프·수련 시작일·소속과 최근 30일 훈련 요약. 대화 시작 전에 한 번 보면 됩니다.',
    inputSchema: {},
  }, guard('get_trainee_profile', async () => {
    const { userId } = ctx();
    const profile = await Profile.findOne({ where: { user_id: userId }, raw: true });
    const belts = await BeltHistory.findAll({
      where: { user_id: userId }, order: [['achieved_date', 'DESC']], raw: true,
    });
    const current = belts[0] || null;

    // 최근 30일 요약 — 코치 리포트와 **같은 계산**을 쓴다(두 곳이 다른 숫자를 말하지 않게).
    const to   = coach.todayStr();
    const from = coach.daysAgo(30);
    let recent = null;
    try {
      const data = await coach.collectTrainingData(from, to, userId);
      const diag = coach.computeDiagnosis(data, from, to);
      recent = {
        period: `${from} ~ ${to}`,
        ...diag.summary,
        weakTop: diag.weakTop.slice(0, 3),
        failedTechs: diag.failedTechs.slice(0, 3),
      };
    } catch (e) {
      console.error('[mcp][get_trainee_profile] 최근 요약 실패:', e.message);
    }

    return respond({
      nickname: profile?.nickname || null,
      belt: current?.belt || null,
      stripes: current?.stripes ?? null,
      beltSince: current?.achieved_date || null,
      startDate: profile?.start_date || null,
      weightClass: profile?.weight_class || null,
      networks: (() => { try { return JSON.parse(profile?.networks || '[]'); } catch { return []; } })(),
      recent30d: recent,
    }, ['weakTop', 'failedTechs']);
  }));

  // ── 2. get_holes ───────────────────────────────────────────────────────────
  server.registerTool('get_holes', {
    description: '구멍 목록 — 스파링에서 실패가 threshold(기본 2) 이상 쌓인 기술. /api/holes 와 같은 계산입니다. 기술트리에 연결되지 않은 항목은 linked:false 로 그대로 나옵니다(억지로 맞추지 마세요).',
    inputSchema: { threshold: z.number().int().min(1).max(99).optional() },
  }, guard('get_holes', async ({ threshold }) => {
    const { userId } = ctx();
    const data = await lab.loadLabData(userId);
    const result = lab.computeHoles(data, { threshold });
    // 🔴 미연결(linked:false)을 걸러내지 않는다 — 관장이 "어느 걸 말씀하시는 거예요?" 라고
    //    물을 수 있어야 하고, 그러려면 미연결 항목이 보여야 한다(페르소나 원칙 3).
    return respond(result, ['holes', 'items', 'unlinked']);
  }));

  // ── 3. get_mastery ─────────────────────────────────────────────────────────
  server.registerTool('get_mastery', {
    description: '기술 하나의 사다리 5단계와 근거. 기술 이름으로 찾습니다. 기술트리에 없으면 linked:false 와 후보 목록을 돌려주니, 그때는 짐작하지 말고 훈련생에게 물어보세요.',
    inputSchema: { techName: z.string().min(1).max(100) },
  }, guard('get_mastery', async ({ techName }) => {
    const { userId } = ctx();
    const techniques = await Technique.findAll({ where: { user_id: userId }, attributes: ['id', 'name'], raw: true });
    const m = matchTechnique(techName, techniques);
    if (!m.technique_id) {
      // 🔴 자카드 0.5 미만은 **후보로만** 준다(기획서 §7-A). 억지 매칭은 하지 않는다.
      return respond({
        query: techName, linked: false, matchType: m.match_type,
        candidates: techniques.slice(0, 5).map((t) => ({ id: t.id, name: t.name })),
        note: '기술트리에서 찾지 못했습니다 — 어느 기술을 말하는지 훈련생에게 물어보세요',
      }, ['candidates']);
    }
    const data = await lab.loadLabData(userId);
    const mastery = await TechniqueMastery.findOne({
      where: { user_id: userId, technique_id: m.technique_id }, raw: true,
    });
    const result = lab.computeMastery(data, m.technique_id, { mastery });
    return respond({
      query: techName, linked: true, matchType: m.match_type, matchedName: m.matched_name,
      techniqueId: m.technique_id, ...(result || {}),
    }, ['steps', 'evidence']);
  }));

  // ── 4. search_records ──────────────────────────────────────────────────────
  server.registerTool('search_records', {
    description: '수업·스파링 기록 검색. 수업 메모·주제·음성 전사본·드릴을 훑어 ±80자 스니펫을 돌려줍니다. 날짜와 횟수를 인용할 때 쓰세요.',
    inputSchema: {
      q: z.string().min(1).max(200),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    },
  }, guard('search_records', async ({ q, from, to }) => {
    const { userId } = ctx();
    // 🔴 recallSearch 를 그대로 쓴다. 새 검색 로직 금지(task-025 의 스니펫 규칙 ±80자·상한 494자).
    const corpus = await recall.loadRecallCorpus(userId, { from: from || null, to: to || null });
    const { results } = recall.searchCorpus(corpus, { q, pos: null, from: from || null, to: to || null });
    const slim = results.slice(0, 12).map((r) => ({
      classId: r.id ?? r.classId, date: r.date, theme: r.theme,
      snippets: (r.hits || []).flatMap((h) => (h.snippets || []).slice(0, 2)).slice(0, 3),
    }));
    return respond({ query: q, from: from || null, to: to || null, total: results.length, results: slim }, ['results']);
  }));

  // ── 5. list_research_projects ──────────────────────────────────────────────
  server.registerTool('list_research_projects', {
    description: '연구 프로젝트 목록 — 제목·시작 포지션·목표·노드 수·갱신일. 새 프로젝트를 제안하기 전에 이미 있는지 확인하세요.',
    inputSchema: {},
  }, guard('list_research_projects', async () => {
    const { userId } = ctx();
    const [rows] = await sequelize.query(
      `SELECT p.id, p.title, p.start_pos, p.goal,
              DATE_FORMAT(p.updated_at, '%Y-%m-%d') AS updated_ymd,
              (SELECT COUNT(*) FROM research_nodes n
                 JOIN research_versions v ON v.id = n.version_id
                WHERE v.project_id = p.id AND v.is_active = 1) AS node_count
         FROM research_projects p
        WHERE p.user_id = ?
        ORDER BY p.updated_at DESC, p.id DESC`,
      { replacements: [userId] }
    );
    return respond({
      total: rows.length,
      projects: rows.map((r) => ({
        projectId: Number(r.id), title: r.title,
        startPos: r.start_pos || null, goal: r.goal || null,
        nodeCount: Number(r.node_count || 0), updatedAt: r.updated_ymd,
      })),
    }, ['projects']);
  }));

  // ── 6. get_research_project ────────────────────────────────────────────────
  server.registerTool('get_research_project', {
    description: '연구 프로젝트 하나의 활성 버전 트리 전체. 노드를 추가 제안하기 전에 이미 있는지 보세요.',
    inputSchema: { projectId: z.number().int().positive() },
  }, guard('get_research_project', async ({ projectId }) => {
    const { userId } = ctx();
    // 🔴 소유 판별은 research_projects.user_id 다(계약 A-2). 남의 것이면 "없다"고 답한다.
    const [[p]] = await sequelize.query(
      'SELECT id, title, start_pos, goal FROM research_projects WHERE id = ? AND user_id = ? LIMIT 1',
      { replacements: [projectId, userId] }
    );
    if (!p) return toolError('그 연구 프로젝트를 찾을 수 없습니다');
    const [versions] = await sequelize.query(
      'SELECT * FROM research_versions WHERE project_id = ? ORDER BY version_no ASC',
      { replacements: [projectId] }
    );
    const active = versions.find((v) => Number(v.is_active) === 1) || versions[versions.length - 1];
    if (!active) return toolError('활성 버전이 없습니다');
    const [nodes] = await sequelize.query(
      `SELECT id, parent_node_id, kind, label, technique_id, sort_order, note
         FROM research_nodes WHERE version_id = ? ORDER BY sort_order ASC, id ASC`,
      { replacements: [active.id] }
    );
    return respond({
      projectId: Number(p.id), title: p.title, startPos: p.start_pos || null, goal: p.goal || null,
      versionId: Number(active.id), versionNo: Number(active.version_no),
      coverage: tree.computeCoverage(nodes),
      nodes: nodes.map((n) => ({
        nodeId: Number(n.id), parentNodeId: n.parent_node_id == null ? null : Number(n.parent_node_id),
        kind: n.kind, label: n.label || '', note: n.note || null,
        techniqueId: n.technique_id == null ? null : Number(n.technique_id),
      })),
    }, ['nodes']);
  }));

  // ── 7. get_weekly_task ─────────────────────────────────────────────────────
  server.registerTool('get_weekly_task', {
    description: '이번 주 과제 — 열린 과제 1개(없으면 null)와 최근 마감 3건. 열린 과제는 앱 전체에 하나뿐입니다.',
    inputSchema: {},
  }, guard('get_weekly_task', async () => {
    const { userId } = ctx();
    const SELECT = `
      SELECT t.id, t.node_id, t.memo, t.outcome,
             DATE_FORMAT(t.created_at, '%Y-%m-%d') AS created_ymd,
             DATE_FORMAT(t.closed_at,  '%Y-%m-%d') AS closed_ymd,
             n.kind, n.label, v.project_id, p.title AS project_title
        FROM research_tasks t
        JOIN research_nodes    n ON n.id = t.node_id
        JOIN research_versions v ON v.id = n.version_id
        JOIN research_projects p ON p.id = v.project_id`;
    const [openRows] = await sequelize.query(
      `${SELECT} WHERE p.user_id = ? AND t.closed_at IS NULL ORDER BY t.id DESC LIMIT 1`,
      { replacements: [userId] }
    );
    const [closedRows] = await sequelize.query(
      `${SELECT} WHERE p.user_id = ? AND t.closed_at IS NOT NULL ORDER BY t.closed_at DESC, t.id DESC LIMIT 3`,
      { replacements: [userId] }
    );
    const view = (r) => ({
      taskId: Number(r.id), nodeId: Number(r.node_id), memo: r.memo || '',
      kind: r.kind, label: r.label || '', projectId: Number(r.project_id), projectTitle: r.project_title,
      createdAt: r.created_ymd, closedAt: r.closed_ymd, outcome: r.outcome || null,
      daysOpen: lab.daysBetween(r.created_ymd, r.closed_ymd || lab.todayKST()),
    });
    return respond({
      open: openRows[0] ? view(openRows[0]) : null,
      recentClosed: closedRows.map(view),
      note: openRows[0] ? '열린 과제가 있습니다 — 새 과제를 제안하려면 바꿔도 되는지 먼저 물어보세요' : null,
    }, ['recentClosed']);
  }));

  // ── 8. list_positions ──────────────────────────────────────────────────────
  server.registerTool('list_positions', {
    description: '정본 포지션 목록. 새 이름을 지어내지 말고 반드시 이 목록 안에서 고르세요. 연구 프로젝트의 시작 포지션도 여기서 골라야 합니다.',
    inputSchema: {},
  }, guard('list_positions', async () => {
    const { userId } = ctx();
    // 🔴 화면의 `GET /api/techniques/positions` 와 **같은 함수**다(services/positions.js).
    const rows = await listPositions(userId);
    return respond({
      total: rows.length,
      positions: rows.map((p) => ({ name: p.name, techCount: p.techCount, drillCount: p.drillCount, sparCount: p.sparCount })),
    }, ['positions']);
  }));

  // ── 9. search_techniques ───────────────────────────────────────────────────
  server.registerTool('search_techniques', {
    description: '기술트리에서 기술 찾기 (exact → 별칭 → fuzzy). 확실하지 않으면 candidates 로만 나오니, 그때는 짐작하지 말고 훈련생에게 물어보세요.',
    inputSchema: { q: z.string().min(1).max(100) },
  }, guard('search_techniques', async ({ q }) => {
    const { userId } = ctx();
    const techniques = await Technique.findAll({
      where: { user_id: userId }, attributes: ['id', 'name', 'category'], raw: true,
    });
    const m = matchTechnique(q, techniques);
    const { normalize } = require('../../utils/techMatch');
    const nq = normalize(q);
    // 후보 5개 — 정규화한 이름이 서로를 포함하는 것 우선.
    const candidates = techniques
      .map((t) => ({ ...t, __n: normalize(t.name) }))
      .filter((t) => nq && (t.__n.includes(nq) || nq.includes(t.__n)))
      .slice(0, 5)
      .map((t) => ({ id: t.id, name: t.name, category: t.category || null }));
    return respond({
      query: q,
      matched: m.technique_id ? { id: m.technique_id, name: m.matched_name, matchType: m.match_type } : null,
      linked: !!m.technique_id,
      candidates,
      note: m.technique_id ? null : '기술트리에 없습니다 — 제안에도 "기술트리에 없음"으로 표시하세요',
    }, ['candidates']);
  }));

  // ── 10. list_my_clips ──────────────────────────────────────────────────────
  server.registerTool('list_my_clips', {
    description: '이미 저장된 참고영상 목록. 영상을 추천하기 전에 겹치는지 확인하세요 — 이미 있는 걸 다시 추천하면 "이건 이미 저장돼 있어요"라고 말해야 합니다.',
    inputSchema: { q: z.string().max(100).optional() },
  }, guard('list_my_clips', async ({ q }) => {
    const { userId } = ctx();
    const rows = await VideoClip.findAll({
      where: { user_id: userId }, attributes: ['id', 'title', 'url', 'platform', 'tech_name'],
      order: [['id', 'DESC']], limit: 200, raw: true,
    });
    const { normalize } = require('../../utils/techMatch');
    const nq = q ? normalize(q) : '';
    const filtered = nq
      ? rows.filter((r) => normalize(r.title || '').includes(nq)
          || normalize(String(r.tech_name || '')).includes(nq))
      : rows;
    return respond({
      total: filtered.length,
      clips: filtered.slice(0, 20).map((r) => ({
        clipId: Number(r.id), title: r.title, url: r.url, platform: r.platform || null,
        techNames: (() => {
          try {
            const p = JSON.parse(r.tech_name || '[]');
            return Array.isArray(p) ? p.map((x) => (typeof x === 'string' ? x : x?.name || '')).filter(Boolean) : [];
          } catch { return []; }
        })(),
      })),
    }, ['clips']);
  }));

  // ── 11. search_videos ──────────────────────────────────────────────────────
  server.registerTool('search_videos', {
    description: '유튜브 검색. 결과의 url 을 답변에 그대로 옮겨 적으세요(줄이거나 지어내지 말 것). 앱이 그 url 로 "열기" 버튼을 그립니다.',
    inputSchema: {
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(8).optional(),
    },
  }, guard('search_videos', async ({ query, limit }) => {
    const videos = await searchVideos(query, limit || 5);
    // 🔴 videos 배열은 masterChat 이 tool_result 에서 파싱해 tool_log.videos 로 남긴다.
    //    관장 **본문에서 URL 을 긁지 않는다** — 본문 파싱은 깨지기 쉽고 조작 가능하다.
    return respond({ query, total: videos.length, videos }, ['videos']);
  }));
}

module.exports = { register };
