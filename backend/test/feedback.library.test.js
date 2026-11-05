const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFeedbackService } = require('../src/services/feedback');
const core = require('../src/services/feedbackCore');
const { Op } = require('sequelize');

const copy = value => structuredClone(value);
function fixture(options = {}) {
  const rows = [];
  const model = {
    async create(values) { const row = { id: rows.length + 1, summary: null, summary_hash: null, ...copy(values) }; rows.push(row); return copy(row); },
    async findOne({ where }) { return copy(rows.find(row => Object.entries(where).every(([key, value]) => row[key] === value)) || null); },
    async update(values, { where }) { const matching = rows.filter(row => Object.entries(where).every(([key, value]) => row[key] === value)); matching.forEach(row => Object.assign(row, copy(values))); return [matching.length]; },
    async findAll() { return copy(rows); },
    async findAndCountAll() { return { rows: copy(rows), count: rows.length }; },
  };
  return { rows, model, service: createFeedbackService({ Feedback: model, VideoClip: { findAll: async () => [] }, Op, ...options }) };
}
const form = { date: '2026-11-05', original: '합성 피드백', clipIds: [] };
const result = { date: '2026-11-05', outcome: 'done', context: 'drill', note: '합성 결과' };

test('practice result edit preserves identity and unrelated input, then delete removes only selected result', async () => {
  let time = new Date('2026-11-05T01:00:00Z');
  const { service, rows } = fixture({ now: () => time });
  let card = await service.create(1, form);
  card = await service.result(1, card.id, { revision: card.revision, ...result });
  card = await service.result(1, card.id, { revision: card.revision, ...result, outcome: 'not_tried', note: '다른 결과' });
  const [first, second] = card.results;
  rows[0].summary = JSON.stringify({ title: '기존 정리' }); rows[0].summary_hash = core.snapshotHash(rows[0], []);
  assert.equal((await service.get(1, card.id)).summaryStale, false);
  const before = copy(rows[0]); time = new Date('2026-11-05T02:00:00Z');
  card = await service.editResult(1, card.id, first.id, { revision: card.revision, ...result, date: '2026-10-31', outcome: 'tried_failed', context: 'spar', note: '수정' });
  assert.equal(card.revision, before.revision + 1); assert.equal(card.summaryStale, true);
  assert.deepEqual(card.results[0], { ...first, date: '2026-10-31', outcome: 'tried_failed', context: 'spar', note: '수정', updatedAt: time.toISOString() });
  assert.deepEqual(card.results[1], second); assert.equal(rows[0].original, before.original); assert.equal(rows[0].dialogue, before.dialogue); assert.equal(rows[0].summary, before.summary);
  const october = await service.recap(1, { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(october.summary.resultCount, 1); assert.equal(october.summary.failureCount, 1);
  card = await service.deleteResult(1, card.id, first.id, { revision: card.revision });
  assert.deepEqual(card.results, [second]); assert.equal((await service.recap(1, { from: '2026-10-01', to: '2026-10-31' })).summary.resultCount, 0);
});

test('result edits and deletes enforce owner, exact result id, revision and original result validators', async () => {
  const { service } = fixture(); let card = await service.create(1, form);
  card = await service.result(1, card.id, { revision: card.revision, ...result }); const id = card.results[0].id;
  for (const method of ['editResult', 'deleteResult']) {
    await assert.rejects(service[method](2, card.id, id, { revision: card.revision, ...result }), { status: 404 });
    await assert.rejects(service[method](1, card.id, 'missing', { revision: card.revision, ...result }), { status: 404 });
    await assert.rejects(service[method](1, card.id, id, { revision: 1, ...result }), { status: 409 });
  }
  for (const invalid of [{ date: '2026-02-30' }, { outcome: 'other' }, { context: 'bad' }, { note: 'x'.repeat(6001) }]) {
    await assert.rejects(service.editResult(1, card.id, id, { revision: card.revision, ...result, ...invalid }), { status: 400 });
  }
  const raced = await Promise.allSettled([
    service.editResult(1, card.id, id, { revision: card.revision, ...result, note: '경합 수정' }),
    service.deleteResult(1, card.id, id, { revision: card.revision }),
  ]);
  assert.equal(raced.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(raced.find(item => item.status === 'rejected').reason.status, 409);
});

test('editing or deleting a result retains the existing pending-question behavior and previous summary', async () => {
  for (const method of ['editResult', 'deleteResult']) {
    let resolve;
    const { service, rows } = fixture({ generate: () => new Promise(done => { resolve = done; }) });
    let card = await service.create(1, form);
    card = await service.result(1, card.id, { revision: card.revision, ...result });
    const id = card.results[0].id; rows[0].summary = JSON.stringify({ title: '보존할 정리' }); rows[0].summary_hash = core.snapshotHash(rows[0], []);
    card = await service.ask(1, card.id, { revision: card.revision }); assert.equal(card.ai.status, 'pending');
    card = await service[method](1, card.id, id, { revision: card.revision, ...result, outcome: 'not_tried' });
    assert.equal(card.ai.status, 'idle'); assert.equal(rows[0].ai_token, null); assert.equal(card.summary.title, '보존할 정리'); assert.equal(card.summaryStale, true);
    resolve({ question: '폐기할 늦은 질문', ready: false, reason: '합성' }); await service.drain();
    card = await service.get(1, card.id); assert.equal(card.turns.length, 0); assert.equal(card.summary.title, '보존할 정리');
  }
});

test('favorite is an owned idempotent metadata set, independent from content revision and pending AI', async () => {
  let resolve;
  const { service, rows } = fixture({ generate: () => new Promise(done => { resolve = done; }) });
  let card = await service.create(1, form); assert.equal(card.starred, false);
  rows[0].summary = JSON.stringify({ title: '현재 정리' }); rows[0].summary_hash = core.snapshotHash(rows[0], []);
  const hash = core.snapshotHash(rows[0], []);
  card = await service.ask(1, card.id, { revision: card.revision });
  const before = copy(rows[0]);
  for (const invalid of [1, 'true', null, undefined]) await assert.rejects(service.setStarred(1, card.id, { starred: invalid }), { status: 400 });
  await assert.rejects(service.setStarred(2, card.id, { starred: true }), { status: 404 });
  await assert.rejects(service.setStarred(1, 999, { starred: true }), { status: 404 });
  assert.deepEqual(await service.setStarred(1, card.id, { starred: true }), { id: card.id, starred: true });
  assert.deepEqual(await service.setStarred(1, card.id, { starred: true }), { id: card.id, starred: true });
  assert.deepEqual(rows[0], { ...before, starred: true }); assert.equal(core.snapshotHash(rows[0], []), hash);
  card = await service.get(1, card.id); assert.equal(card.starred, true); assert.equal(card.summaryStale, false); assert.equal(card.ai.status, 'pending');
  resolve({ question: '완료되는 질문', ready: false, reason: '합성' }); await service.drain();
  card = await service.get(1, card.id); assert.equal(card.turns.length, 1); assert.equal(card.ai.status, 'idle'); assert.equal(card.starred, true);
  assert.deepEqual(await service.setStarred(1, card.id, { starred: false }), { id: card.id, starred: false });
});

test('explicit feedback migration is additive, checks base schema and is idempotent without rewriting records', async () => {
  const schema = require('../scripts/task-052-feedback-schema');
  const base = require('../scripts/task-051-feedback-schema');
  let added = false; let altered = 0; let incompatible = false;
  const db = { async query(sql, parameters) {
    if (sql === schema.DDL) { added = true; altered++; return [{}]; }
    if (sql.includes('information_schema.TABLES')) return [[{ ENGINE: 'InnoDB', TABLE_COLLATION: 'utf8mb4_unicode_ci' }]];
    if (sql.includes('information_schema.COLUMNS') && parameters[2] === 'starred') return [added ? [
      { COLUMN_NAME: 'starred', DATA_TYPE: incompatible ? 'varchar' : 'tinyint', COLUMN_TYPE: 'tinyint(1)', IS_NULLABLE: 'NO', COLUMN_DEFAULT: '0' },
      ...['situation_options', 'situation_other'].map(COLUMN_NAME => ({ COLUMN_NAME, DATA_TYPE: 'text', IS_NULLABLE: 'YES', COLUMN_DEFAULT: null, CHARACTER_SET_NAME: 'utf8mb4' })),
    ] : []];
    if (sql.includes('information_schema.COLUMNS')) return [Object.entries(base.COLUMNS).map(([COLUMN_NAME, [DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH]]) => ({ COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, COLUMN_TYPE: DATA_TYPE, CHARACTER_SET_NAME: 'utf8mb4', EXTRA: COLUMN_NAME === 'id' ? 'auto_increment' : '' }))];
    if (sql.includes('information_schema.STATISTICS')) return [[{ INDEX_NAME: 'PRIMARY', SEQ_IN_INDEX: 1, COLUMN_NAME: 'id' }, ...['user_id', 'date', 'id'].map((COLUMN_NAME, index) => ({ INDEX_NAME: 'owner_date', SEQ_IN_INDEX: index + 1, COLUMN_NAME }))]];
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) return [[{ COLUMN_NAME: 'user_id', REFERENCED_TABLE_NAME: 'users', REFERENCED_COLUMN_NAME: 'id', DELETE_RULE: 'CASCADE' }]];
    throw new Error(`Unexpected test metadata query: ${sql}`);
  } };
  assert.equal(await schema.apply(db, 'synthetic'), 'added-columns-and-verified');
  assert.equal(await schema.apply(db, 'synthetic'), 'already-compatible'); assert.equal(altered, 1);
  incompatible = true; await assert.rejects(schema.apply(db, 'synthetic'), /incompatible starred/); assert.equal(altered, 1);
  await assert.rejects(schema.main(['--apply'], {}), /Explicit/);
  await assert.rejects(schema.main(['--apply'], { DB_HOST: '127.0.0.1', DB_PORT: '9001', DB_NAME: 'test', DB_USER: 'root', DB_PASS: '' }), /confirm-database/);
  assert.doesNotMatch(schema.DDL, /DROP|DELETE|UPDATE|MODIFY/i);
});

test('training status uses current owned task only, batches list lookup and prioritizes any completed result', async () => {
  let current = 11; let calls = 0;
  const { service, rows } = fixture({ ResearchTask: { async findOne(options) {
    calls++; assert.deepEqual(options.where, { user_id: 1, closed_at: null }); return current === null ? null : { id: current };
  } } });
  let card = await service.create(1, form); const previous = await service.create(1, form);
  rows[0].task_binding = JSON.stringify({ taskId: 11 }); rows[1].task_binding = JSON.stringify({ taskId: 10 });
  assert.equal(card.trainingStatus, null);
  const list = await service.list(1, { limit: 3 }); assert.equal(calls, 1);
  assert.deepEqual(list.items.map(item => item.trainingStatus), ['assigned', null]);
  const recap = await service.recap(1, {}); assert.equal(calls, 2); assert.deepEqual(recap.items.map(item => item.trainingStatus), ['assigned', null]);
  card = await service.result(1, card.id, { revision: card.revision, ...result }); const firstDone = card.results[0].id;
  card = await service.result(1, card.id, { revision: card.revision, ...result }); const lastDone = card.results[1].id;
  card = await service.result(1, card.id, { revision: card.revision, ...result, outcome: 'not_tried' });
  assert.equal(card.trainingStatus, 'completed'); assert.equal(calls, 2);
  card = await service.deleteResult(1, card.id, firstDone, { revision: card.revision }); assert.equal(card.trainingStatus, 'completed');
  card = await service.editResult(1, card.id, lastDone, { revision: card.revision, ...result, outcome: 'tried_failed' }); assert.equal(card.trainingStatus, 'training');
  card = await service.deleteResult(1, card.id, lastDone, { revision: card.revision }); assert.equal(card.trainingStatus, 'training');
  card = await service.deleteResult(1, card.id, card.results[0].id, { revision: card.revision }); assert.equal(card.trainingStatus, 'assigned');
  current = 10; assert.equal((await service.get(1, card.id)).trainingStatus, null); assert.equal((await service.get(1, previous.id)).trainingStatus, 'assigned');
  current = null; assert.equal((await service.get(1, previous.id)).trainingStatus, null);
});

test('owned technique id stores a name snapshot while old unregistered names survive untouched', async () => {
  const techniques = [{ id: 5, user_id: 1, name: '등록 기술' }, { id: 6, user_id: 2, name: '다른 사용자 기술' }];
  const { service } = fixture({ Technique: { async findOne({ where }) { return techniques.find(technique => technique.id === where.id && technique.user_id === where.user_id) || null; } } });
  let card = await service.create(1, { ...form, technique: '기존 자유 입력' });
  card = await service.patch(1, card.id, { revision: card.revision, date: '2026-11-04' }); assert.equal(card.technique, '기존 자유 입력');
  await assert.rejects(service.create(1, { ...form, techniqueId: 6 }), { status: 404 });
  await assert.rejects(service.patch(1, card.id, { revision: card.revision, techniqueId: 6 }), { status: 404 });
  await assert.rejects(service.patch(1, card.id, { revision: card.revision, techniqueId: 'bad' }), { status: 400 });
  card = await service.patch(1, card.id, { revision: card.revision, techniqueId: 5 }); assert.equal(card.technique, '등록 기술');
  techniques[0].name = '나중 이름'; assert.equal((await service.get(1, card.id)).technique, '등록 기술');
  card = await service.patch(1, card.id, { revision: card.revision, techniqueId: null }); assert.equal(card.technique, '');
  const created = await service.create(1, { ...form, techniqueId: 5 }); assert.equal(created.technique, '나중 이름');
});

test('structured situations are atomic and preserve old situation text, hash and archive evidence', async () => {
  const { service, rows } = fixture({ generate: async () => ({ question: '상황 질문', ready: false, reason: '합성' }) });
  const legacy = '예전 원문, 영상 복기 · 그대로 보관';
  let card = await service.create(1, { ...form, situation: legacy }); assert.equal(card.situationOptions, null); assert.equal(card.situationOther, '');
  const oldHash = core.snapshotHash(rows[0], []);
  Object.assign(rows[0], { situation_options: null, situation_other: null });
  assert.equal(core.snapshotHash(rows[0], []), oldHash);
  card = await service.ask(1, card.id, { revision: card.revision }); await service.drain(); card = await service.get(1, card.id);
  rows[0].summary = JSON.stringify({ title: '예전 정리' }); rows[0].summary_hash = core.snapshotHash(rows[0], []);
  const revision = card.revision;
  for (const invalid of [
    { situationOther: '' }, { situationOptions: ['class'] }, { situationOptions: ['unknown'], situationOther: '' },
    { situationOptions: ['class'], situationOther: '미선택 기타' }, { situationOptions: ['other'], situationOther: '  ' },
    { situationOptions: ['other'], situationOther: 'x'.repeat(201) },
  ]) {
    await assert.rejects(service.patch(1, card.id, { revision, ...invalid }), { status: 400 });
  }
  card = await service.patch(1, card.id, { revision, situationOptions: ['other', 'spar', 'video_review'], situationOther: '별도 기타 원문' });
  assert.equal(card.situation, legacy); assert.deepEqual(card.situationOptions, ['spar', 'video_review', 'other']); assert.equal(card.situationOther, '별도 기타 원문');
  assert.equal(card.summaryStale, true); assert.equal(card.summary.title, '예전 정리'); assert.equal(card.turns.length, 0); assert.equal(card.archives[0].turns[0].question, '상황 질문');
  assert.equal(core.snapshot(rows[0], []).situation, `기존 상황: ${legacy}\n선택한 상황: 스파링, 영상 복기, 기타: 별도 기타 원문`);
  card = await service.patch(1, card.id, { revision: card.revision, clipIds: [] }); assert.deepEqual(card.situationOptions, ['spar', 'video_review', 'other']); assert.equal(card.situation, legacy);
  card = await service.patch(1, card.id, { revision: card.revision, situationOptions: [], situationOther: '' }); assert.deepEqual(card.situationOptions, []); assert.equal(card.situation, legacy);
});
