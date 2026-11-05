'use strict';
// Browser QA only. Reject unsafe configuration BEFORE importing Express/models/DB.
if (process.env.BJJ_FEEDBACK_TEST_DB !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '9002' || process.env.DB_NAME !== 'bjj_task052' || process.env.DB_USER !== 'root' || process.env.DB_PASS !== '') {
  throw new Error('Browser fixture requires the dedicated loopback bjj_task052 DB, port 9002, root/empty password and BJJ_FEEDBACK_TEST_DB=1');
}
if (process.env.BJJ_FEEDBACK_BROWSER_PORT && process.env.BJJ_FEEDBACK_BROWSER_PORT !== '9016') throw new Error('Browser fixture only permits loopback port 9016');
const express = require('express');
const mysql = require('mysql2/promise');
const { Op } = require('sequelize');
const models = require('../src/models');
const { createFeedbackService } = require('../src/services/feedback');
const { createRouter } = require('../src/routes/feedback');
const researchWrite = require('../src/services/researchWrite');
const core = require('../src/services/feedbackCore');
const { safeParse, ok } = require('../src/utils/respond');
const { apply: applyBaseSchema } = require('../scripts/task-051-feedback-schema');
const { apply: applyLibrarySchema } = require('../scripts/task-052-feedback-schema');
const lab = require('../src/services/labAnalytics');
const { listPositions } = require('../src/services/positions');
const { sequelize, User, VideoClip, Technique, Class, Drill, SparDay, SparSession, BeltHistory, SparCause, ResearchProject, ResearchVersion, ResearchNode } = models;

const SYNTHETIC_EMAIL = 'synthetic-browser-task052@test.invalid';
const AI = { failNext: false, delayMs: 700 };
const usage = new Map();
let usageSeq = 0;
function usageFor(clipId) {
  const logs = usage.get(Number(clipId)) || [];
  const count = kind => logs.filter(log => log.kind === kind).length;
  const manual = logs.filter(log => log.kind !== 'view');
  return { view: count('view'), drill: count('drill'), position_spar: count('position_spar'), spar: count('spar'), used: manual.length, last_viewed_on: logs.findLast(log => log.kind === 'view')?.used_on || null, last_used_on: manual.at(-1)?.used_on || null, recent: [...manual].reverse().slice(0, 3), viewCount: count('view'), drillCount: count('drill'), positionSparCount: count('position_spar'), sparCount: count('spar'), totalCount: logs.length, lastViewedAt: logs.findLast(log => log.kind === 'view')?.used_on || null, lastUsedAt: logs.at(-1)?.used_on || null, logs };
}
async function generate(kind, data) {
  await new Promise(resolve => setTimeout(resolve, AI.delayMs));
  if (AI.failNext) { AI.failNext = false; return 'synthetic invalid response'; }
  const answered = data.turns.filter(turn => !turn.skipped && typeof turn.answer === 'string' && turn.answer.trim());
  if (kind === 'ask') {
    // Deliberately deterministic test double, not production question-selection logic.
    const questions = ['가장 먼저 확인하고 싶은 동작은 무엇인가요?', '그 동작을 연습할 때 무엇을 관찰하면 좋을까요?'];
    return { question: questions[data.turns.length] || null, ready: data.turns.length >= questions.length, reason: '합성 AI 브라우저 검증용 응답' };
  }
  const latest = answered.at(-1);
  const quote = (latest ? latest.answer : data.original).slice(0, 1900);
  return {
    title: data.technique || '피드백 정리', overview: quote,
    correctionPoints: [{ title: '입력과 보완한 내용 확인', detail: quote, evidenceTurnIds: latest ? [latest.id] : [], sourceQuotes: [{ source: latest ? 'turn' : 'original', turnId: latest ? latest.id : null, quote }] }],
    practiceMethods: [{ proposal: true, title: '연습 제안 · 교정 동작 확인', steps: [`입력한 동작을 천천히 확인한다: ${quote}`, '확인이 어려운 내용은 멈추고 추가 질문으로 남긴다'], check: '확인 기준 제안: 기록한 교정 동작이 나오는지 관찰한다' }],
    unresolved: ['이 연습을 실제로 해본 뒤 어떤 부분을 더 확인할까요?'],
  };
}
async function ensureTable(model) {
  const [rows] = await sequelize.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', { replacements: [model.getTableName()] });
  if (!rows.length) await model.sync(); // Guarded disposable DB only; never application bootstrap.
}
async function seed() {
  for (const model of [User, VideoClip, Technique, Class, Drill, SparDay, SparSession, BeltHistory, SparCause, ResearchProject, ResearchVersion, ResearchNode]) await ensureTable(model);
  const [taskTables] = await sequelize.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='research_tasks'");
  if (!taskTables.length) await sequelize.query(`CREATE TABLE research_tasks (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL,node_id INT NOT NULL,memo VARCHAR(200),created_at DATETIME,closed_at DATETIME NULL,outcome VARCHAR(20) NULL,
    open_slot TINYINT GENERATED ALWAYS AS (CASE WHEN closed_at IS NULL THEN 1 ELSE NULL END) PERSISTENT,
    UNIQUE KEY uq_test_open(user_id,open_slot),FOREIGN KEY(node_id) REFERENCES research_nodes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  const db = await mysql.createConnection({ host: '127.0.0.1', port: 9002, database: 'bjj_task052', user: 'root', password: '' });
  try {
    await applyBaseSchema(db, 'bjj_task052');
    await applyLibrarySchema(db, 'bjj_task052');
  } finally { await db.end(); }
  const [user] = await User.findOrCreate({ where: { email: SYNTHETIC_EMAIL }, defaults: { name: '합성 검증 훈련생' } });
  const uid = user.id;
  const names = ['보우 앤 애로우', '암바', '트라이앵글', '리어 네이키드 초크', '가드 패스', '시저 스윕', '오모플라타'];
  for (const [index, name] of names.entries()) {
    await Technique.findOrCreate({ where: { user_id: uid, name }, defaults: { pos: JSON.stringify(index % 2 ? ['클로즈가드'] : ['백']), category: index < 4 ? '서브미션' : '기본', tags: '["합성"]', links: '[]', note: '브라우저 검증용 합성 기술' } });
    await VideoClip.findOrCreate({ where: { user_id: uid, title: `합성 영상 ${index + 1} · ${name}` }, defaults: { url: `https://example.invalid/synthetic-clip-${index + 1}`, platform: index % 2 ? 'instagram' : 'youtube', description: `${name} 동작 확인용 합성 참고영상 설명`, tech_name: JSON.stringify([name, ...(index === 0 ? ['백 탈출'] : [])]), position: JSON.stringify(index % 2 ? ['클로즈가드'] : ['백']), tags: JSON.stringify(['합성', index < 4 ? '서브미션' : '연결']), starred: index < 2 ? 1 : 0, pinned: index === 0 ? 1 : 0, frames: '[]', thumb_url: '', video_file: '' } });
  }
  for (const day of ['2026-10-31', '2026-11-04', '2026-11-20', '2026-12-01']) {
    const [cls] = await Class.findOrCreate({ where: { user_id: uid, date: day, theme: '합성 검증 · 백 포지션' }, defaults: { note: '기간 필터 확인용 합성 수업 기록', clip_ids: '[]', trained_dates: JSON.stringify([day]) } });
    await Drill.findOrCreate({ where: { class_id: cls.id, date: day, pos: '백' }, defaults: { tech: '["보우 앤 애로우"]', detail: '["합성 동작 복습"]', links: '[]' } });
    const [sd] = await SparDay.findOrCreate({ where: { class_id: cls.id, date: day }, defaults: { day_note: '합성 스파링 기록' } });
    await SparSession.findOrCreate({ where: { spar_day_id: sd.id, opponent: '합성 상대' }, defaults: { level: '블루', positions: '[{"name":"백","score":1}]', success: '[{"name":"보우 앤 애로우","success":false,"causes":[],"reaction":"합성 확인 기록"}]', weak: '[]', time_min: 5 } });
  }
  await BeltHistory.findOrCreate({ where: { user_id: uid, belt: '화이트', achieved_date: '2025-01-01' }, defaults: { stripes: 1 } });
  const clips = await VideoClip.findAll({ where: { user_id: uid }, raw: true });
  for (const clip of clips) if (!usage.has(clip.id)) usage.set(clip.id, [{ id: ++usageSeq, kind: 'view', used_on: '2026-11-04', clip_id: clip.id }]);
  return user.get({ plain: true });
}
async function classItems(uid) {
  const rows = await Class.findAll({ where: { user_id: uid }, raw: true, order: [['date', 'DESC']] });
  const ids = rows.map(row => row.id);
  const drills = ids.length ? await Drill.findAll({ where: { class_id: { [Op.in]: ids } }, raw: true }) : [];
  const days = ids.length ? await SparDay.findAll({ where: { class_id: { [Op.in]: ids } }, raw: true }) : [];
  const sessions = days.length ? await SparSession.findAll({ where: { spar_day_id: { [Op.in]: days.map(day => day.id) } }, raw: true }) : [];
  return rows.map(row => ({ ...row, clip_ids: safeParse(row.clip_ids, []), trained_dates: safeParse(row.trained_dates, []), drills: drills.filter(d => d.class_id === row.id).map(d => ({ ...d, tech: safeParse(d.tech, []), detail: safeParse(d.detail, []), links: safeParse(d.links, []), chain_ids: safeParse(d.chain_ids, []) })), spar_days: days.filter(d => d.class_id === row.id).map(day => ({ ...day, links: safeParse(day.links, []), sessions: sessions.filter(s => s.spar_day_id === day.id).map(s => ({ ...s, positions: safeParse(s.positions, []), success: safeParse(s.success, []), weak: safeParse(s.weak, []) })) })) }));
}
// Read-only projection matching the existing research taskView DTO, on synthetic owned rows.
function taskView(row) {
  const open = row.closed_at == null;
  const techniqueId = row.technique_id == null ? null : Number(row.technique_id);
  const labels = { not_tried: '시도 못 함', tried_failed: '해봤는데 안 됨', done: '됐음' };
  return {
    id: Number(row.id), nodeId: Number(row.node_id), memo: row.memo ?? '',
    createdAt: row.created_ymd ?? null, closedAt: row.closed_ymd ?? null, open,
    outcome: row.outcome ?? null, outcomeLabel: row.outcome ? labels[row.outcome] ?? null : null,
    daysOpen: lab.daysBetween(row.created_ymd, open ? lab.todayKST() : row.closed_ymd),
    node: { id: Number(row.node_id), kind: row.kind, label: row.label ?? '', techniqueId,
      techniqueName: techniqueId === null ? null : row.technique_name ?? null, linked: techniqueId !== null },
    project: { id: Number(row.project_id), title: row.project_title, versionId: Number(row.version_id),
      versionNo: Number(row.version_no), versionName: row.version_name ?? null },
  };
}
async function taskState(uid) {
  const select = `SELECT t.id,t.node_id,t.memo,t.outcome,t.closed_at,
      DATE_FORMAT(t.created_at,'%Y-%m-%d') AS created_ymd,DATE_FORMAT(t.closed_at,'%Y-%m-%d') AS closed_ymd,
      n.kind,n.label,n.technique_id,n.version_id,v.version_no,v.name AS version_name,v.project_id,
      p.title AS project_title,tech.name AS technique_name
    FROM research_tasks t JOIN research_nodes n ON n.id=t.node_id
    JOIN research_versions v ON v.id=n.version_id JOIN research_projects p ON p.id=v.project_id
    LEFT JOIN techniques tech ON tech.id=n.technique_id AND tech.user_id=p.user_id`;
  const [open] = await sequelize.query(`${select} WHERE p.user_id=? AND t.closed_at IS NULL ORDER BY t.id DESC LIMIT 1`, { replacements: [uid] });
  const [closed] = await sequelize.query(`${select} WHERE p.user_id=? AND t.closed_at IS NOT NULL ORDER BY t.closed_at DESC,t.id DESC LIMIT 5`, { replacements: [uid] });
  return { task: open[0] ? taskView(open[0]) : null, recent: closed.map(taskView), outcomeOptions: [{ value: 'not_tried', label: '시도 못 함' }, { value: 'tried_failed', label: '해봤는데 안 됨' }, { value: 'done', label: '됐음' }] };
}
async function start() {
  const user = await seed();
  const uid = user.id;
  const service = createFeedbackService({ Feedback: models.Feedback, VideoClip, Op, sequelize, researchWrite, generate });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-BJJ-Test-Fixture', 'synthetic-ai-real-feedback-db'); req.user = { id: uid }; next(); });
  const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  app.get('/__fixture/health', (req, res) => res.json({ fixture: true, userId: uid, db: 'bjj_task052', ai: 'synthetic', feedback: 'real-service-real-db', port: 9016, pid: process.pid, clipCount: 7, seedDates: ['2026-10-31', '2026-11-04', '2026-11-20', '2026-12-01'] }));
  app.post('/__fixture/ai', (req, res) => {
    if ('failNext' in req.body && typeof req.body.failNext !== 'boolean') return res.status(400).json({ error: 'failNext must be boolean' });
    if ('delayMs' in req.body && (!Number.isInteger(req.body.delayMs) || req.body.delayMs < 0 || req.body.delayMs > 3000)) return res.status(400).json({ error: 'delayMs must be 0..3000' });
    Object.assign(AI, Object.fromEntries(Object.entries(req.body).filter(([key]) => ['failNext', 'delayMs'].includes(key))));
    res.json({ fixture: true, ...AI });
  });
  app.use('/api/feedback', createRouter(service));
  // Explicit UI-support fixtures below: not real authentication or existing app CRUD coverage.
  app.post('/api/auth/login', (req, res) => {
    if (req.body.email !== SYNTHETIC_EMAIL || req.body.password !== 'synthetic-only-password') return res.status(401).json({ success: false, message: '합성 검증 계정으로만 로그인할 수 있습니다' });
    ok(res, { token: 'synthetic-browser-token', user: { id: uid, email: user.email, name: user.name, avatar: null } });
  });
  app.get('/api/coach/reports', (req, res) => ok(res, []));
  app.get('/api/master/chats', (req, res) => ok(res, []));
  app.get('/api/auth/me', (req, res) => ok(res, { id: uid, email: user.email, name: user.name, avatar: null }));
  app.get('/api/profile', (req, res) => ok(res, { id: uid, nickname: '합성 검증 훈련생', start_date: '2025-01-01', networks: ['합성 체육관'], weight_class: '미들', master_model: null, avatar: null }));
  app.get('/api/belts', wrap(async (req, res) => ok(res, await BeltHistory.findAll({ where: { user_id: uid }, raw: true }))));
  app.get('/api/memberships', (req, res) => ok(res, []));
  app.get('/api/classes', wrap(async (req, res) => ok(res, await classItems(uid))));
  app.get('/api/classes/:id', wrap(async (req, res) => { const item = (await classItems(uid)).find(row => row.id === Number(req.params.id)); if (!item) return res.status(404).json({ success: false, message: '합성 수업 없음' }); ok(res, item); }));
  app.get('/api/clips', wrap(async (req, res) => ok(res, (await VideoClip.findAll({ where: { user_id: uid }, raw: true })).map(clip => ({ ...core.normalizeClip(clip), usage: usageFor(clip.id) })))));
  app.post('/api/clips/:id/recommend', (req, res) => res.status(501).json({ success: false, message: '브라우저 fixture는 기존 AI 영상 추천을 지원하지 않습니다' }));
  app.post('/api/clips/:id/usage', wrap(async (req, res) => {
    const id = core.positive(req.params.id); if (!await VideoClip.findOne({ where: { id, user_id: uid } })) return res.status(404).json({ success: false, message: '합성 영상 없음' });
    if (!['view', 'drill', 'position_spar', 'spar'].includes(req.body.kind)) return res.status(400).json({ success: false, message: '합성 usage kind 오류' });
    const log = { id: ++usageSeq, clip_id: id, kind: req.body.kind, used_on: '2026-11-04' };
    const logs = usage.get(id) || []; logs.push(log); usage.set(id, logs);
    ok(res, { fixture: true, created: true, log, usage: usageFor(id), masteryChecked: [] });
  }));
  app.delete('/api/clips/:id/usage/:logId', (req, res) => { const id = Number(req.params.id); if (!usage.has(id)) return res.status(404).json({ success: false, message: '합성 영상 없음' }); usage.set(id, usage.get(id).filter(log => log.id !== Number(req.params.logId))); ok(res, { fixture: true, usage: usageFor(id), masteryUnchecked: [] }); });
  app.get('/api/techniques/positions', wrap(async (req, res) => ok(res, await listPositions(uid, core.dateRange(req.query)))));
  app.get('/api/techniques', wrap(async (req, res) => ok(res, (await Technique.findAll({ where: { user_id: uid }, raw: true })).map(row => ({ ...row, positions: safeParse(row.pos, []), pos: safeParse(row.pos, [])[0] || '', tags: safeParse(row.tags, []), links: safeParse(row.links, []), clips: [] })))));
  app.get('/api/holes', wrap(async (req, res) => ok(res, lab.computeHoles(await lab.loadLabData(uid, core.dateRange(req.query))))));
  app.get('/api/recall/stale', wrap(async (req, res) => { const data = await lab.loadLabData(uid, core.dateRange(req.query)); ok(res, lab.computeStale(data, { holes: lab.computeHoles(data), today: '2026-11-04' })); }));
  app.get('/api/recall/search', wrap(async (req, res) => { if (String(req.query.q ?? '').trim() || String(req.query.pos ?? '').trim()) return res.status(501).json({ success: false, message: '브라우저 fixture는 기존 키워드·포지션 검색을 지원하지 않습니다' }); const range = core.dateRange(req.query); const items = (await classItems(uid)).filter(row => core.inRange(row.date, range)); ok(res, { fixture: true, query: req.query.q || '', pos: req.query.pos || null, ...range, total: items.length, scannedClasses: items.length, results: items.map(row => ({ id: row.id, classId: row.id, date: row.date, theme: row.theme, note: row.note, drills: row.drills, snippets: [], matches: [] })) }); }));
  app.get('/api/research/task', wrap(async (req, res) => ok(res, await taskState(uid))));
  app.get('/api/research/projects', (req, res) => res.status(501).json({ success: false, message: '브라우저 fixture는 기존 연구 프로젝트 목록 API를 지원하지 않습니다. DB에 생성된 과제가 없다는 뜻이 아닙니다' }));
  app.get('/api/chains', (req, res) => ok(res, []));
  app.get('/api/gameplans', (req, res) => ok(res, []));
  app.use((req, res) => res.status(501).json({ success: false, message: `브라우저 합성 fixture가 지원하지 않는 API: ${req.method} ${req.path}` }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ success: false, message: error.message }));
  const server = await new Promise((resolve, reject) => { const listener = app.listen(9016, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
  console.log(`BJJ_FEEDBACK_BROWSER_FIXTURE_READY http://127.0.0.1:9016 user=${uid} AI=synthetic feedback=real-db`);
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; server.close(); await service.drain(); await sequelize.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return { app, server, service, user };
}
if (require.main === module) start().catch(async error => { console.error(`BROWSER_FIXTURE_FAILED: ${error.message}`); await sequelize.close(); process.exitCode = 1; });
module.exports = { start };
