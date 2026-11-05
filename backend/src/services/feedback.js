const { randomUUID } = require('crypto');
const { col, fn, literal, where: sqlWhere } = require('sequelize');
const core = require('./feedbackCore');
const { safeParse } = require('../utils/respond');
const ai = require('./feedbackAI');
const LEASE_MS = 30 * 60 * 1000;

function canonicalForms(value) {
  return [...new Set([value.normalize('NFC'), value.normalize('NFD')])];
}

function createFeedbackService({ Feedback, VideoClip, Op, generate = ai.generate, sequelize, ResearchTask = sequelize?.models?.ResearchTask, Technique = sequelize?.models?.Technique, researchWrite, now = () => new Date(), leaseMs = LEASE_MS }) {
  const jobs = new Set();
  const idle = { ai_status: 'idle', ai_kind: null, ai_token: null, ai_started_at: null, ai_error: null };
  const revision = input => core.positive(input.revision, 'revision');
  async function clipsFor(rows, uid) {
    const ids = [...new Set(rows.flatMap(row => safeParse(row.clip_ids, [])))];
    if (!ids.length) return [];
    return (await VideoClip.findAll({ where: { user_id: uid, id: { [Op.in]: ids } }, raw: true })).map(core.normalizeClip);
  }
  function orderedClips(row, clips) {
    const byId = new Map(clips.map(c => [Number(c.id), c]));
    return safeParse(row.clip_ids, []).map(id => byId.get(id)).filter(Boolean);
  }
  async function currentTaskIdFor(rows, uid) {
    if (!ResearchTask || !rows.some(row => row.task_binding && !core.practiceResults(row).length)) return null;
    const task = await ResearchTask.findOne({ where: { user_id: uid, closed_at: null }, attributes: ['id'], raw: true, order: [['id', 'DESC']] });
    return task ? Number(task.id) : null;
  }
  async function shapeMany(rows, uid) {
    const [clips, currentTaskId] = await Promise.all([clipsFor(rows, uid), currentTaskIdFor(rows, uid)]);
    return rows.map(row => core.dto(row, orderedClips(row, clips), currentTaskId));
  }
  async function shape(row) { return (await shapeMany([row], row.user_id))[0]; }
  async function cas(row, changes, extra = {}) {
    const patch = { ...changes, revision: row.revision + 1, updated_at: now() };
    const [count] = await Feedback.update(patch, { where: { id: row.id, user_id: row.user_id, revision: row.revision, ...extra } });
    if (count !== 1) throw new core.FeedbackError(409, '다른 화면에서 변경되었습니다. 최신 내용을 불러온 뒤 다시 시도해주세요');
    return { ...row, ...patch };
  }
  async function getRow(uid, id) {
    const row = await Feedback.findOne({ where: { user_id: uid, id: core.positive(id) }, raw: true });
    if (!row) throw new core.FeedbackError(404, '피드백을 찾을 수 없습니다');
    if (row.ai_status === 'pending' && (!row.ai_started_at || now().getTime() - new Date(row.ai_started_at).getTime() >= leaseMs)) {
      try { return await cas(row, { ...idle, ai_status: 'failed', ai_kind: row.ai_kind, ai_error: '관장 처리 대기 시간이 지났습니다. 다시 시도해주세요' }, { ai_token: row.ai_token }); }
      catch (error) { if (error.status !== 409) throw error; return getRow(uid, id); }
    }
    return row;
  }
  function checkRevision(row, input) { if (revision(input) !== row.revision) throw new core.FeedbackError(409, '다른 화면에서 변경되었습니다. 최신 내용을 불러온 뒤 다시 시도해주세요'); }
  async function validateClips(ids, uid) {
    const rows = await clipsFor([{ clip_ids: JSON.stringify(ids) }], uid);
    if (rows.length !== ids.length) throw new core.FeedbackError(404, '선택한 영상을 찾을 수 없습니다. 연결할 영상을 다시 선택해주세요');
  }
  async function resolveTechnique(uid, value) {
    if (value === null) return '';
    const id = core.positive(value, '기술 id');
    const technique = await Technique?.findOne({ where: { user_id: uid, id }, attributes: ['name'], raw: true });
    if (!technique) throw new core.FeedbackError(404, '선택한 기술을 찾을 수 없습니다');
    return core.text(technique.name, '기술', 200, true);
  }
  async function create(uid, input) {
    const values = core.form(input);
    const situation = core.situationForm(input);
    if (Object.hasOwn(input, 'techniqueId')) values.technique = await resolveTechnique(uid, input.techniqueId);
    await validateClips(values.clipIds, uid);
    const created = await Feedback.create({ user_id: uid, date: values.date, situation: values.situation, ...situation, technique: values.technique, original: values.original, clip_ids: JSON.stringify(values.clipIds), dialogue: JSON.stringify(core.emptyDialogue()), results: '[]', revision: 1, ...idle, created_at: now(), updated_at: now() });
    return shape(created.get ? created.get({ plain: true }) : created);
  }
  async function get(uid, id) { return shape(await getRow(uid, id)); }
  async function setStarred(uid, id, input) {
    const feedbackId = core.positive(id);
    if (typeof input.starred !== 'boolean') core.invalid('즐겨찾기 값을 확인해주세요');
    // A separate metadata set: neither content revision nor an in-flight AI lease changes.
    const where = { user_id: uid, id: feedbackId };
    const exists = await Feedback.findOne({ where, attributes: ['id'], raw: true });
    if (!exists) throw new core.FeedbackError(404, '피드백을 찾을 수 없습니다');
    await Feedback.update({ starred: input.starred }, { where });
    const saved = await Feedback.findOne({ where, attributes: ['id', 'starred'], raw: true });
    if (!saved) throw new core.FeedbackError(404, '피드백을 찾을 수 없습니다');
    return { id: Number(saved.id), starred: saved.starred === true || saved.starred === 1 };
  }
  async function list(uid, query = {}) {
    const range = core.dateRange(query);
    const page = query.page == null ? 1 : core.positive(query.page, 'page');
    const limit = query.limit == null ? 20 : core.positive(query.limit, 'limit');
    if (limit > 100 || page > 1000000) core.invalid('목록 범위를 확인해주세요');
    const where = { user_id: uid };
    if (range.from || range.to) where.date = { ...(range.from ? { [Op.gte]: range.from } : {}), ...(range.to ? { [Op.lte]: range.to } : {}) };
    const filter = query.filter == null || query.filter === '' ? 'all' : query.filter;
    if (!['all', 'recent', 'star', 'starred', 'completed'].includes(filter)) core.invalid('피드백 조회 조건을 확인해주세요');
    if (filter === 'star' || filter === 'starred') where.starred = true;
    if (filter === 'completed') {
      // Fixed SQL, no request interpolation. Malformed/non-array legacy JSON is not a completed result.
      where[Op.and] = [literal("JSON_CONTAINS(CASE WHEN JSON_VALID(`results`) THEN CASE WHEN JSON_TYPE(`results`) = 'ARRAY' THEN `results` ELSE '[]' END ELSE '[]' END, '{\"outcome\":\"done\"}') = 1")];
    }
    const normalizeSearch = value => core.text(value, '검색어', 200).normalize('NFC').trim();
    const search = query.search == null ? null : normalizeSearch(query.search);
    const alias = query.q == null ? null : normalizeSearch(query.q);
    if (search !== null && alias !== null && search !== alias) core.invalid('검색어 조건이 서로 다릅니다');
    const needle = (search ?? alias ?? '').toLowerCase();
    if (needle) {
      const summaryJson = fn('IF', fn('JSON_VALID', col('summary')), col('summary'), '{}');
      const summaryText = key => fn('JSON_UNQUOTE', fn('JSON_EXTRACT', summaryJson, `$.${key}`));
      const columns = [col('technique'), col('situation'), col('situation_other'), col('original'), summaryText('title'), summaryText('overview')];
      // Legacy text can be stored in either canonical form. Match both without rewriting it.
      where[Op.or] = canonicalForms(needle).flatMap(form => columns.map(column => sqlWhere(fn('LOCATE', form, fn('LOWER', column)), { [Op.gt]: 0 })));
      // Include the visible localized names of structured situation choices, not just their ASCII storage keys.
      for (const [option, label] of Object.entries(core.situationLabels)) {
        if (label.includes(needle)) where[Op.or].push(sqlWhere(fn('JSON_CONTAINS', fn('IF', fn('JSON_VALID', col('situation_options')), col('situation_options'), '[]'), JSON.stringify(option)), 1));
      }
    }
    if (query.technique != null && query.technique !== '') {
      const technique = core.text(query.technique, '기술', 200);
      where.technique = { [Op.in]: canonicalForms(technique) };
    }
    const includeTechniqueOptions = query.includeTechniqueOptions === '1' || query.includeTechniqueOptions === 1;
    const [{ rows, count }, techniqueRows] = await Promise.all([
      Feedback.findAndCountAll({ where, raw: true, order: [['date', 'DESC'], ['id', 'DESC']], offset: (page - 1) * limit, limit }),
      includeTechniqueOptions ? Feedback.findAll({ where: { user_id: uid, technique: { [Op.ne]: '' } }, attributes: ['technique'], group: ['technique'], order: [['technique', 'ASC']], raw: true }) : [],
    ]);
    const techniqueOptions = includeTechniqueOptions ? { techniqueOptions: techniqueRows.map(row => row.technique).filter(name => typeof name === 'string' && name.trim()) } : {};
    return { items: await shapeMany(rows, uid), total: count, page, limit, ...techniqueOptions };
  }
  async function patch(uid, id, input) {
    const row = await getRow(uid, id); checkRevision(row, input);
    const values = core.form(input, true);
    const state = core.dialogue(row);
    const changes = { ...core.situationForm(input) };
    if (Object.hasOwn(input, 'techniqueId')) values.technique = await resolveTechnique(uid, input.techniqueId);
    if (values.clipIds) { await validateClips(values.clipIds, uid); changes.clip_ids = JSON.stringify(values.clipIds); }
    for (const key of ['date', 'situation', 'technique', 'original']) if (key in values) changes[key] = values[key];
    const contextChanged = ['original', 'situation', 'situation_options', 'situation_other', 'technique'].some(key => key in changes && changes[key] !== row[key]);
    if (contextChanged) {
      core.archive(state, state.turns, '피드백 입력 수정 전 대화', now());
      Object.assign(state, { turns: [], cursor: 0, ready: false });
    }
    if ('cursor' in input) {
      if (!Number.isInteger(input.cursor) || input.cursor < 0 || input.cursor >= Math.max(1, state.turns.length)) core.invalid('질문 위치를 확인해주세요');
      state.cursor = input.cursor;
    }
    if ('draftAnswer' in input) {
      if (!state.turns[state.cursor]) core.invalid('작성 중인 질문이 없습니다');
      state.turns[state.cursor].draftAnswer = core.text(input.draftAnswer, '임시 답변', 6000);
    }
    changes.dialogue = JSON.stringify(state);
    return shape(await cas(row, { ...idle, ...changes }));
  }
  async function answer(uid, id, input) {
    const row = await getRow(uid, id); checkRevision(row, input);
    const state = core.editAnswer(core.dialogue(row), input, now());
    return shape(await cas(row, { ...idle, dialogue: JSON.stringify(state) }));
  }
  async function resultRowForWrite(uid, id, input) {
    const row = await getRow(uid, id);
    checkRevision(row, input);
    if (row.ai_status === 'pending' && row.ai_kind === 'summarize') {
      throw new core.FeedbackError(409, '피드백 정리가 끝난 뒤 연습 결과를 변경해주세요');
    }
    return row;
  }
  async function result(uid, id, input) {
    const row = await resultRowForWrite(uid, id, input);
    const entry = { id: randomUUID(), ...core.resultForm(input), createdAt: now().toISOString() };
    const results = core.practiceResults(row); results.push(entry);
    return shape(await cas(row, { ...idle, results: JSON.stringify(results) }));
  }
  async function editResult(uid, id, resultId, input) {
    const row = await resultRowForWrite(uid, id, input);
    const results = core.practiceResults(row);
    const index = results.findIndex(entry => entry?.id === resultId);
    if (index < 0) throw new core.FeedbackError(404, '연습 결과를 찾을 수 없습니다');
    results[index] = { ...results[index], ...core.resultForm(input), updatedAt: now().toISOString() };
    return shape(await cas(row, { ...idle, results: JSON.stringify(results) }));
  }
  async function deleteResult(uid, id, resultId, input) {
    const row = await resultRowForWrite(uid, id, input);
    const results = core.practiceResults(row);
    const index = results.findIndex(entry => entry?.id === resultId);
    if (index < 0) throw new core.FeedbackError(404, '연습 결과를 찾을 수 없습니다');
    results.splice(index, 1);
    return shape(await cas(row, { ...idle, results: JSON.stringify(results) }));
  }
  async function start(uid, id, input, kind) {
    let row = await getRow(uid, id); checkRevision(row, input);
    if (row.ai_status === 'pending') return shape(row);
    const state = core.dialogue(row);
    if (kind === 'ask') {
      if (input.more != null && typeof input.more !== 'boolean') core.invalid('more 값을 확인해주세요');
      const unanswered = state.turns.findIndex(turn => turn.answer === null);
      if (unanswered !== -1) {
        if (state.cursor !== unanswered) row = await cas(row, { ...idle, dialogue: JSON.stringify({ ...state, cursor: unanswered }) });
        return shape(row);
      }
      if (state.ready && !input.more) return shape(row);
    }
    const [availableClips, currentTaskId] = await Promise.all([clipsFor([row], uid), currentTaskIdFor([row], uid)]);
    const clips = orderedClips(row, availableClips);
    const snapshot = core.snapshot(row, clips);
    ai.buildPrompt(kind, snapshot, input.more); // Length failures are synchronous; preserve the draft unchanged.
    const token = randomUUID();
    row = await cas(row, { ai_status: 'pending', ai_kind: kind, ai_token: token, ai_started_at: now(), ai_error: null });
    const started = core.dto(row, clips, currentTaskId);
    const task = Promise.resolve().then(async () => {
      try {
        const out = ai.validateOutput(kind, await generate(kind, snapshot, uid, input.more), snapshot);
        let changes;
        if (kind === 'ask') {
          const next = core.dialogue(row); next.ready = out.ready;
          if (out.question) { next.turns.push({ id: randomUUID(), question: out.question, answer: null, draftAnswer: '', skipped: false }); next.cursor = next.turns.length - 1; }
          changes = { dialogue: JSON.stringify(next) };
        } else changes = { summary: JSON.stringify(out), summary_hash: core.snapshotHash(row, clips) };
        await cas(row, { ...idle, ...changes }, { ai_token: token, ai_status: 'pending' });
      } catch (error) {
        if (error.status === 409) return; // User edited or a newer generation won the fence.
        try { await cas(row, { ...idle, ai_status: 'failed', ai_kind: kind, ai_error: '관장 응답을 완료하지 못했습니다. 기록은 보존되어 있습니다. 다시 시도해주세요' }, { ai_token: token, ai_status: 'pending' }); }
        catch (saveError) { if (saveError.status !== 409) console.error('[feedback] AI 상태 저장 실패'); }
      }
    }).finally(() => jobs.delete(task));
    jobs.add(task);
    return started;
  }
  async function recap(uid, query) {
    const range = core.dateRange(query);
    // Results use their own occurrence date, so an old feedback card may contribute a new practice result.
    const rows = await Feedback.findAll({ where: { user_id: uid }, raw: true, order: [['date', 'DESC'], ['id', 'DESC']] });
    const selected = rows.filter(row => core.inRange(row.date, range));
    const results = rows.flatMap(row => core.practiceResults(row).filter(r => r?.date && core.inRange(r.date, range)).map(r => ({ feedbackId: row.id, feedbackDate: row.date, ...r })));
    const failures = results.filter(r => r.outcome === 'tried_failed');
    return { ...range, items: await shapeMany(selected, uid), results, failures, summary: { feedbackCount: selected.length, failureCount: failures.length, resultCount: results.length } };
  }
  const assignTask = sequelize && researchWrite ? require('./feedbackTask').createTaskAssigner({ sequelize, Feedback, write: researchWrite, shape, clipsFor, orderedClips, now }) : null;
  return { create, get, list, setStarred, patch, answer, result, editResult, deleteResult, assignTask, ask: (uid, id, input) => start(uid, id, input, 'ask'), summarize: (uid, id, input) => start(uid, id, input, 'summarize'), recap, drain: () => Promise.all([...jobs]) };
}
function defaultService() {
  const { Feedback, VideoClip, sequelize } = require('../models');
  return createFeedbackService({ Feedback, VideoClip, sequelize, researchWrite: require('./researchWrite'), Op: require('sequelize').Op });
}
module.exports = { createFeedbackService, defaultService, LEASE_MS };
