const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createFeedbackService } = require('../src/services/feedback');
const core = require('../src/services/feedbackCore');
const ai = require('../src/services/feedbackAI');
const { buildArgs } = require('../src/services/claudeCli');
const schema = require('../scripts/task-051-feedback-schema');
const Op = { in: Symbol('in'), gte: Symbol('gte'), lte: Symbol('lte') };
const copy = value => structuredClone(value);
function matches(row, where) {
  return Reflect.ownKeys(where).every(key => {
    const condition = where[key];
    if (condition && typeof condition === 'object') return Reflect.ownKeys(condition).every(op => op === Op.in ? condition[op].includes(row[key]) : op === Op.gte ? row[key] >= condition[op] : op === Op.lte ? row[key] <= condition[op] : false);
    return row[key] === condition;
  });
}
function fixture(opts = {}) {
  const rows = []; const clips = [{ id: 7, user_id: 1, title: '보우 앤 애로우', description: '등록 영상 설명', tech_name: '["보우 앤 애로우"]', position: '["백"]' }, { id: 8, user_id: 2, title: '다른 사용자 영상' }];
  const model = {
    async create(values) { const row = { id: rows.length + 1, summary: null, summary_hash: null, ...copy(values) }; rows.push(row); return copy(row); },
    async findOne({ where }) { return copy(rows.find(row => matches(row, where)) || null); },
    async findAll({ where }) { return copy(rows.filter(row => matches(row, where))); },
    async findAndCountAll({ where, offset, limit }) { const values = rows.filter(row => matches(row, where)); return { rows: copy(values.slice(offset, offset + limit)), count: values.length }; },
    async update(values, { where }) { const selected = rows.filter(row => matches(row, where)); selected.forEach(row => Object.assign(row, copy(values))); return [selected.length]; },
  };
  const service = createFeedbackService({ Feedback: model, VideoClip: { async findAll({ where }) { return copy(clips.filter(row => matches(row, where))); } }, Op, ...opts });
  return { service, rows, clips, model };
}
const form = { date: '2026-11-04', original: '백에서 왼발로 상대 허벅지를 밟아 높이를 확보하고 옆으로 눕는다', technique: '보우 앤 애로우', clipIds: [7] };
const question = { question: '어느 쪽으로 누웠나요?', ready: false, reason: '진입 방향 확인' };
function summary(data) { return { title: '백에서 진입 높이와 눕는 방향', overview: data.original, correctionPoints: [{ title: '위치', detail: '원문과 보완한 답변을 함께 확인', evidenceTurnIds: data.turns.filter(t => !t.skipped && typeof t.answer === 'string' && t.answer.trim()).map(t => t.id), sourceQuotes: [{source: 'original', turnId: null, quote: data.original}, ...data.turns.filter(t => !t.skipped && typeof t.answer === 'string' && t.answer.trim()).map(t => ({source: 'turn', turnId: t.id, quote: t.answer}))] }], practiceMethods: [{ title: '진입 연습', steps: ['옆으로 눕는 동작 확인'], check: '상대 어깨 위 다리 위치' }], unresolved: [] }; }

test('CLI argv preserves old options and explicitly disables tools for empty string', () => {
  const base = ['--print', 'prompt', '--permission-mode', 'bypassPermissions', '--model', 'sonnet'];
  assert.deepEqual(buildArgs('prompt', {}), base);
  assert.deepEqual(buildArgs('prompt', { tools: 'WebSearch' }), [...base, '--tools', 'WebSearch']);
  assert.deepEqual(buildArgs('prompt', { tools: ['Read', 'WebSearch'] }), [...base, '--tools', 'Read', 'WebSearch']);
  assert.deepEqual(buildArgs('prompt', { tools: [] }), base);
  assert.deepEqual(buildArgs('prompt', { tools: '' }), [...base, '--tools', '']);
});
test('real dates, pagination and owned clips are validated', async () => {
  assert.throws(() => core.dateRange({ from: '2026-02-30' }), { status: 400 });
  assert.throws(() => core.dateRange({ from: '2026-11-05', to: '2026-11-01' }), { status: 400 });
  assert.equal(core.date('2024-02-29'), '2024-02-29');
  const { service } = fixture();
  await assert.rejects(service.create(1, { ...form, clipIds: [8] }), { status: 404 });
  await service.create(1, form); await service.create(1, { ...form, date: '2026-10-31' });
  assert.equal((await service.list(1, { from: '2026-11-01', to: '2026-11-30', limit: 1 })).total, 1);
  assert.equal((await service.list(1, { page: 2, limit: 1 })).items.length, 1);
  await assert.rejects(service.get(2, 1), { status: 404 });
  await assert.rejects(service.list(1, { limit: '101' }), { status: 400 });
  for (let index = 0; index < 19; index++) await service.create(1, form);
  const defaultPage = await service.list(1);
  assert.equal(defaultPage.limit, 20);
  assert.equal(defaultPage.items.length, 20);
  assert.equal((await service.list(1, { limit: 10 })).items.length, 10);
});
test('current answers are integrated; changed answer archives branch and excludes old evidence', async () => {
  const requests = [];
  const { service } = fixture({ generate: async (kind, data) => { requests.push(copy(data)); return kind === 'ask' ? question : summary(data); } });
  let card = await service.create(1, form);
  await service.ask(1, card.id, { revision: card.revision }); await service.drain(); card = await service.get(1, 1);
  card = await service.answer(1, 1, { revision: card.revision, turnId: card.turns[0].id, answer: '왼쪽으로 눕고 싶었지만 뒤로 누웠다' });
  await service.ask(1, 1, { revision: card.revision }); await service.drain(); card = await service.get(1, 1);
  const secondId = card.turns[1].id;
  card = await service.answer(1, 1, { revision: card.revision, turnId: secondId, answer: '버려질 과거 답변' });
  const firstId = card.turns[0].id;
  card = await service.answer(1, 1, { revision: card.revision, turnId: firstId, answer: card.turns[0].answer });
  assert.equal(card.turns.length, 2); assert.equal(card.cursor, 1); assert.equal(card.archives.length, 0);
  card = await service.answer(1, 1, { revision: card.revision, turnId: firstId, answer: '옆으로 누웠다' });
  assert.equal(card.turns.length, 1); assert.equal(card.archives[0].turns[1].answer, '버려질 과거 답변');
  await service.summarize(1, 1, { revision: card.revision }); await service.drain(); card = await service.get(1, 1);
  const prompt = ai.buildPrompt('summarize', requests.at(-1));
  assert.match(prompt, /옆으로 누웠다/); assert.match(prompt, /백에서 왼발/); assert.match(prompt, /등록 영상 설명/); assert.doesNotMatch(prompt, /버려질 과거/);
  assert.equal(card.summaryStale, false);
  card = await service.patch(1, 1, { revision: card.revision, situation: '혼자 영상을 보다가' });
  assert.equal(card.turns.length, 0); assert.equal(card.summaryStale, true); assert.equal(card.archives.length, 2);
});
test('draft answers survive reload, do not become evidence, and previous cursor reuses unanswered question', async () => {
  const { service } = fixture({ generate: async () => question });
  let card = await service.create(1, form);
  await service.ask(1, 1, { revision: card.revision }); await service.drain(); card = await service.get(1, 1);
  card = await service.patch(1, 1, { revision: card.revision, cursor: 0, draftAnswer: '저장된 초안' });
  const reloaded = await service.get(1, 1); assert.equal(reloaded.turns[0].draftAnswer, '저장된 초안');
  assert.equal(core.snapshot((fixture()).rows[0] || { ...form, clip_ids: '[]', dialogue: JSON.stringify({ turns: reloaded.turns, archives: [], cursor: 0 }), results: '[]' }, []).turns.length, 0);
  const reused = await service.ask(1, 1, { revision: card.revision }); assert.equal(reused.turns[0].id, card.turns[0].id); assert.equal(reused.ai.status, 'idle');
});
test('concurrent writes use revision CAS and stale AI result cannot overwrite edits', async () => {
  let resolve; let count = 0;
  const { service } = fixture({ generate: () => { count++; return new Promise(r => { resolve = r; }); } });
  let card = await service.create(1, form);
  const writes = await Promise.allSettled([service.patch(1, 1, { revision: 1, situation: 'A' }), service.patch(1, 1, { revision: 1, situation: 'B' })]);
  assert.equal(writes.filter(v => v.status === 'fulfilled').length, 1); assert.equal(writes.find(v => v.status === 'rejected').reason.status, 409);
  card = await service.get(1, 1); card = await service.ask(1, 1, { revision: card.revision });
  assert.equal(card.ai.status, 'pending');
  await service.ask(1, 1, { revision: card.revision }); assert.equal(count, 1);
  await service.patch(1, 1, { revision: card.revision, original: '수정한 원문' });
  resolve(question); await service.drain(); card = await service.get(1, 1);
  assert.equal(card.original, '수정한 원문'); assert.equal(card.turns.length, 0); assert.equal(card.ai.status, 'idle');
});
test('failed response and expired durable pending lease allow retry after restart', async () => {
  let time = new Date('2026-11-04T00:00:00Z');
  const { service, rows, model, clips } = fixture({ now: () => time, leaseMs: 1000, generate: async () => 'bad json' });
  let card = await service.create(1, form); await service.ask(1, 1, { revision: card.revision }); await service.drain();
  card = await service.get(1, 1); assert.equal(card.ai.status, 'failed'); assert.equal(card.original, form.original);
  Object.assign(rows[0], { ai_status: 'pending', ai_token: 'lost', ai_started_at: time });
  time = new Date(time.getTime() + 1001); card = await service.get(1, 1); assert.equal(card.ai.status, 'failed'); assert.match(card.ai.error, /대기 시간/);
  const restarted = createFeedbackService({ Feedback: model, VideoClip: { findAll: async () => clips.slice(0, 1) }, Op, generate: async () => ({ question: null, ready: true, reason: '충분함' }) });
  await restarted.ask(1, 1, { revision: card.revision }); await restarted.drain(); assert.equal((await restarted.get(1, 1)).ready, true);
});
test('practice outcomes use outcome date without mastery changes and missing clips are reported', async () => {
  const { service, clips } = fixture(); let card = await service.create(1, { ...form, date: '2026-10-20' });
  card = await service.result(1, 1, { revision: card.revision, date: '2026-11-04', outcome: 'tried_failed', context: 'other', note: '연결 동작 막힘' });
  const recap = await service.recap(1, { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(recap.summary.feedbackCount, 0); assert.equal(recap.summary.resultCount, 1); assert.equal(recap.summary.failureCount, 1);
  clips.splice(0, 1); card = await service.get(1, 1); assert.deepEqual(card.unavailableClipIds, [7]); assert.equal(card.clips.length, 0);
});
test('pending summary locks result writes without discarding the summary job', async () => {
  let finishSummary;
  const { service, rows } = fixture({ generate: (_kind, data) => new Promise(resolve => { finishSummary = () => resolve(summary(data)); }) });
  const practice = { date: '2026-11-04', outcome: 'tried_failed', context: 'drill', note: '합성 결과' };
  let card = await service.create(1, form);
  card = await service.result(1, card.id, { revision: card.revision, ...practice });
  const resultId = card.results[0].id;
  card = await service.summarize(1, card.id, { revision: card.revision });
  const before = copy(rows[0]);
  const writes = [
    (uid, input) => service.result(uid, card.id, input),
    (uid, input) => service.editResult(uid, card.id, resultId, input),
    (uid, input) => service.deleteResult(uid, card.id, resultId, input),
  ];
  try {
    assert.deepEqual({ status: card.ai.status, kind: card.ai.kind }, { status: 'pending', kind: 'summarize' });
    const input = { revision: card.revision, ...practice };
    for (const write of writes) {
      await assert.rejects(write(2, input), { status: 404 });
      await assert.rejects(write(1, input), { status: 409, message: '피드백 정리가 끝난 뒤 연습 결과를 변경해주세요' });
    }
    assert.deepEqual(rows[0], before);
  } finally {
    finishSummary();
    await service.drain();
  }
  card = await service.get(1, card.id);
  assert.equal(card.ai.status, 'idle');
  assert.equal(card.summaryStale, false);
  assert.equal(card.summary.title, '백에서 진입 높이와 눕는 방향');
  card = await writes[0](1, { revision: card.revision, ...practice });
  card = await writes[1](1, { revision: card.revision, ...practice, outcome: 'done' });
  assert.equal(card.trainingStatus, 'completed');
  card = await writes[2](1, { revision: card.revision });
  assert.equal(card.results.length, 1);
  assert.equal(card.trainingStatus, 'training');
});
test('AI validates evidence ids and refuses over-budget prompts without truncation', () => {
  const data = { original: 'x', turns: [{id:'active'}] };
  assert.throws(() => ai.buildPrompt('ask', { original: 'x'.repeat(21000) }), { status: 422 });
  assert.throws(() => ai.validateOutput('summarize', { ...summary(data), correctionPoints: [{ title: 'x', detail: 'x', evidenceTurnIds: ['archived'] }] }, data), /근거/);
  assert.throws(() => ai.validateOutput('ask', { question: 'x', ready: true, reason: '' }, data), /형식/);
});
test('HTTP routes enforce ownership, revision errors, and clear schema-unavailable 503', async t => {
  const { service } = fixture();
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = { id: Number(req.headers['x-test-user'] || 1) }; next(); });
  const { createRouter } = require('../src/routes/feedback'); app.use('/api/feedback', createRouter(service));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ success: false, message: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/feedback`;
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post(base, form)).status, 200);
  assert.equal((await fetch(`${base}/1`, { headers: { 'x-test-user': '2' } })).status, 404);
  assert.equal((await post(`${base}/1/answer`, { revision: 999, turnId: 'x', answer: 'x' })).status, 409);
  const practice = { date: '2026-11-04', outcome: 'done', context: 'drill', note: '합성' };
  const createdResult = await (await post(`${base}/1/results`, { revision: 1, ...practice })).json();
  const resultPath = `${base}/1/results/${createdResult.data.results[0].id}`;
  const write = (url, method, body, user = 1) => fetch(url, { method, headers: { 'content-type': 'application/json', 'x-test-user': String(user) }, body: JSON.stringify(body) });
  assert.equal((await write(resultPath, 'PATCH', { revision: 2, ...practice }, 2)).status, 404);
  const edited = await (await write(resultPath, 'PATCH', { revision: 2, ...practice, outcome: 'not_tried' })).json();
  assert.equal(edited.data.trainingStatus, 'training');
  const starred = await (await write(`${base}/1/star`, 'PUT', { starred: true })).json();
  assert.deepEqual(starred.data, { id: 1, starred: true });
  assert.equal((await write(resultPath, 'DELETE', { revision: 2 })).status, 409);
  const deleted = await (await write(resultPath, 'DELETE', { revision: 3 })).json();
  assert.deepEqual(deleted.data.results, []); assert.equal(deleted.data.trainingStatus, null); assert.equal(deleted.data.starred, true);
  assert.equal((await fetch(`${base}/recap?from=2026-02-30`)).status, 400);
  service.list = async () => { throw { original: { code: 'ER_NO_SUCH_TABLE' } }; };
  const unavailable = await fetch(base); assert.equal(unavailable.status, 503); assert.match((await unavailable.json()).message, /저장소/);
});
test('schema default preview has no DB connection, apply needs explicit confirmation', async () => {
  assert.match(schema.DDL, /FOREIGN KEY \(user_id\).*ON DELETE CASCADE/); assert.match(schema.DDL, /utf8mb4/); assert.match(schema.DDL, /user_id, date, id/);
  await assert.rejects(schema.main(['--apply'], {}), /Explicit/);
  await assert.rejects(schema.main(['--apply'], { DB_HOST: '127.0.0.1', DB_PORT: '9001', DB_NAME: 'bjj_task051', DB_USER: 'root', DB_PASS: '' }), /confirm-database/);
});

test('task snapshot intentionally selects one bounded practice and preserves research limits', () => {
  const { taskSnapshot } = require('../src/services/feedbackTask');
  const snapshot = taskSnapshot({ title: '긴 제목'.repeat(100), practiceMethods: [{ title: '연습😀'.repeat(100), check: '체크'.repeat(200) }, { title: '미선택 연습', check: '제외' }] }, 1);
  assert.ok([...snapshot.title].length <= 100); assert.ok([...snapshot.label].length <= 100); assert.ok([...snapshot.note].length <= 500); assert.ok([...snapshot.memo].length <= 200);
  assert.doesNotMatch(snapshot.note, /미선택/); assert.doesNotMatch(snapshot.note, /😀/); assert.match(snapshot.note, /피드백 #1/);
});

test('task source hash changes for a regenerated summary even when evidence is unchanged', () => {
  const row = { summary_hash: 'evidence', summary: JSON.stringify({ title: 'A' }) };
  const first = core.summarySourceHash(row);
  row.summary = JSON.stringify({ title: 'B' });
  assert.notEqual(core.summarySourceHash(row), first);
});

test('empty correction points, practice methods or practice steps never become a final summary', async () => {
  const data = { original: '원문', turns: [] };
  const valid = summary(data);
  for (const invalid of [{ ...valid, correctionPoints: [] }, { ...valid, practiceMethods: [] }, { ...valid, practiceMethods: [{ title: '연습', steps: [], check: '기준' }] }]) {
    assert.throws(() => ai.validateOutput('summarize', invalid, data), /목록 오류/);
    const { service } = fixture({ generate: async () => invalid });
    const card = await service.create(1, form);
    await service.summarize(1, card.id, { revision: card.revision }); await service.drain();
    const failed = await service.get(1, card.id); assert.equal(failed.ai.status, 'failed'); assert.equal(failed.summary, null);
  }
});

test('feedback clips preserve existing JSON scalar, array, legacy and empty technique normalization', () => {
  for (const [raw, expected] of [['"암바"', ['암바']], ['["암바","",null,"쵸크"]', ['암바','쵸크']], ['암바', ['암바']], ['', []], [null, []], ['null', []]]) {
    const clip = core.normalizeClip({ tech_name: raw, frames: '[]' });
    assert.deepEqual(clip.tech_names, expected); assert.equal(clip.tech_name, expected[0] || ''); assert.equal(clip.frames, '[]');
  }
});

test('correction provenance only accepts exact current confirmed source quotes and matching answer ids', () => {
  const data = { original: '백에서 뒤쪽으로 눕는다고 적었다', turns: [{ id: 'active-1', question: '방향 확인', answer: '정정: 옆쪽으로 누워 다리를 어깨 위로 올린다', skipped: false }, { id: 'active-2', question: '발 위치', answer: '왼발을 허벅지에 댄다', skipped: false }, { id: 'skipped', answer: '제출된 사실 아님', skipped: true }, { id: 'draft', answer: null, draftAnswer: '임시 답변' }] };
  const valid = summary(data);
  valid.correctionPoints = [{ title: '눕는 방향', detail: '현재 답변 기준으로 옆쪽으로 눕는다', evidenceTurnIds: ['active-1'], sourceQuotes: [{ source: 'turn', turnId: 'active-1', quote: '옆쪽으로 누워 다리를 어깨 위로 올린다' }] }];
  assert.equal(ai.validateOutput('summarize', valid, data).correctionPoints[0].sourceQuotes[0].turnId, 'active-1');
  const originalOnly = copy(valid); originalOnly.correctionPoints[0].evidenceTurnIds = []; originalOnly.correctionPoints[0].sourceQuotes = [{ source: 'original', turnId: null, quote: '백에서 뒤쪽으로 눕는다고 적었다' }];
  assert.doesNotThrow(() => ai.validateOutput('summarize', originalOnly, data));
  const invalidSources = [
    [{ source: 'turn', turnId: 'active-1', quote: '입력에 없는 인과 설명' }, ['active-1']],
    [{ source: 'turn', turnId: 'active-2', quote: '옆쪽으로 누워 다리를 어깨 위로 올린다' }, ['active-2']],
    [{ source: 'turn', turnId: 'old-branch', quote: '과거 분기 답변' }, ['active-1']],
    [{ source: 'turn', turnId: 'skipped', quote: '제출된 사실 아님' }, ['skipped']],
    [{ source: 'turn', turnId: 'draft', quote: '임시 답변' }, ['draft']],
    [{ source: 'clip', turnId: null, quote: '영상 메타' }, []],
    [{ source: 'original', turnId: 'active-1', quote: data.original }, []],
    [{ source: 'original', turnId: null, quote: data.original }, ['active-1']],
    [{ source: 'turn', turnId: 'active-1', quote: data.turns[0].answer }, ['active-2']],
  ];
  for (const [source, ids] of invalidSources) {
    const invalid = copy(valid); invalid.correctionPoints[0].sourceQuotes = [source]; invalid.correctionPoints[0].evidenceTurnIds = ids;
    assert.throws(() => ai.validateOutput('summarize', invalid, data), /근거|인용/);
  }
  const missing = copy(valid); delete missing.correctionPoints[0].sourceQuotes;
  assert.throws(() => ai.validateOutput('summarize', missing, data), /목록/);
});

test('future practice is visibly marked as a proposal and prompts distinguish facts from unknown causal claims', () => {
  const data = { original: '발 위치만 확인함', turns: [] };
  const output = ai.validateOutput('summarize', summary(data), data);
  assert.match(output.practiceMethods[0].title, /연습 제안/);
  assert.equal(output.practiceMethods[0].proposal, true);
  const modelFlag = summary(data); modelFlag.practiceMethods[0].proposal = false;
  assert.equal(ai.validateOutput('summarize', modelFlag, data).practiceMethods[0].proposal, true);
  assert.equal(ai.validateOutput('summarize', output, data).practiceMethods[0].title, output.practiceMethods[0].title);
  const prompt = ai.buildPrompt('summarize', data);
  for (const requirement of ['원인/결과', '심리/기억', '실제 실행/성과', 'unresolved에서 추가 확인 질문', 'sourceQuotes', '미래의 연습 제안', '질문 문구, skipped 답변, 임시 draft, 과거 archive']) assert.ok(prompt.includes(requirement));
});

test('invalid provenance or insufficient facts fail without replacing an existing valid summary', async () => {
  let invalid = false;
  const { service } = fixture({ generate: async (kind, data) => {
    const value = summary(data);
    if (invalid === 'quote') value.correctionPoints[0].sourceQuotes = [{ source: 'original', turnId: null, quote: '기록에 없는 원인' }];
    if (invalid === 'empty') value.correctionPoints = [];
    return value;
  } });
  let card = await service.create(1, form);
  await service.summarize(1, card.id, { revision: card.revision }); await service.drain(); card = await service.get(1, card.id);
  const saved = copy(card.summary); assert.ok(saved);
  for (const failure of ['quote', 'empty']) {
    invalid = failure;
    await service.summarize(1, card.id, { revision: card.revision }); await service.drain(); card = await service.get(1, card.id);
    assert.equal(card.ai.status, 'failed'); assert.deepEqual(card.summary, saved);
  }
});
