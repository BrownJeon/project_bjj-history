const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const enabled = process.env.BJJ_FEEDBACK_TEST_DB === '1';
if (enabled && (process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '9002' || process.env.DB_NAME !== 'bjj_task052' || process.env.DB_USER !== 'root' || process.env.DB_PASS !== '')) throw new Error('Refusing SQL tests outside the dedicated loopback bjj_task052 container');

test('isolated MariaDB schema, ownership, CAS, task transaction/idempotency and period counts', { skip: !enabled }, async t => {
  const mysql = require('mysql2/promise');
  const database = 'bjj_task052';
  const db = await mysql.createConnection({ host: '127.0.0.1', port: 9002, database, user: 'root', password: '' });
  const models = require('../src/models'); const { Op } = require('sequelize');
  const schema = require('../scripts/task-051-feedback-schema');
  const librarySchema = require('../scripts/task-052-feedback-schema');
  const core = require('../src/services/feedbackCore');
  const { sequelize, User, Feedback, VideoClip, Technique, Class, Drill, SparDay, SparSession, BeltHistory, SparCause, ResearchProject, ResearchVersion, ResearchNode } = models;
  let cleanup = async () => {};
  t.after(async () => { try { await cleanup(); } finally { await db.end(); await sequelize.close(); } });
  for (const model of [User, VideoClip, Technique, Class, Drill, SparDay, SparSession, BeltHistory, SparCause, ResearchProject, ResearchVersion, ResearchNode]) await model.sync();
  await db.query(`CREATE TABLE IF NOT EXISTS research_tasks (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, node_id INT NOT NULL,
    memo VARCHAR(200), created_at DATETIME, closed_at DATETIME NULL, outcome VARCHAR(20) NULL,
    open_slot TINYINT GENERATED ALWAYS AS (CASE WHEN closed_at IS NULL THEN 1 ELSE NULL END) PERSISTENT,
    UNIQUE KEY uq_test_open(user_id,open_slot), FOREIGN KEY(node_id) REFERENCES research_nodes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  assert.ok(['created-and-verified', 'already-compatible'].includes(await schema.apply(db, database)));
  assert.equal(await schema.apply(db, database), 'already-compatible');
  assert.deepEqual((await schema.inspect(db, database)).errors, []);
  const owner = await User.create({ email: `feedback-${randomUUID()}@test.invalid` });
  const other = await User.create({ email: `feedback-${randomUUID()}@test.invalid` });
  const uid = owner.id;
  cleanup = async () => {
    for (const table of ['research_tasks', 'research_nodes', 'research_versions', 'research_projects', 'feedback_records', 'spar_causes', 'belt_history', 'video_clips', 'techniques']) await sequelize.query(`DELETE FROM ${table} WHERE user_id IN (?,?)`, { replacements: [uid, other.id] });
    const [classes] = await sequelize.query('SELECT id FROM classes WHERE user_id IN (?,?)', { replacements: [uid, other.id] });
    if (classes.length) {
      const ids = classes.map(c => c.id);
      await sequelize.query('DELETE ss FROM spar_sessions ss JOIN spar_days sd ON ss.spar_day_id=sd.id WHERE sd.class_id IN (?)', { replacements: [ids] });
      await sequelize.query('DELETE FROM spar_days WHERE class_id IN (?)', { replacements: [ids] });
      await sequelize.query('DELETE FROM drills WHERE class_id IN (?)', { replacements: [ids] });
      await sequelize.query('DELETE FROM classes WHERE id IN (?)', { replacements: [ids] });
    }
    await User.destroy({ where: { id: [uid, other.id] } });
  };
  const legacy = {
    date: '2026-10-01', situation: '  자유 입력 원문\n둘째 줄  ', technique: '이름이 바뀐 기존 기술',
    original: '합성 예전 기록의 원문 10%_ 확인', clip_ids: '[]', dialogue: JSON.stringify(core.emptyDialogue()), results: '[]',
  };
  const legacySummary = { title: '예전 정리', overview: legacy.original };
  // Insert with the task-051 columns only so a fresh DB exercises a populated migration.
  const [legacyInsert] = await db.execute(`INSERT INTO feedback_records
    (user_id, date, situation, technique, original, clip_ids, dialogue, results, summary, summary_hash, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 7, NOW(), NOW())`, [uid, legacy.date, legacy.situation, legacy.technique, legacy.original, legacy.clip_ids, legacy.dialogue, legacy.results, JSON.stringify(legacySummary), core.snapshotHash(legacy, [])]);
  const legacyId = legacyInsert.insertId;
  const beforeLibrarySchema = await librarySchema.inspect(db, database);
  assert.deepEqual(beforeLibrarySchema.errors, []);
  assert.equal(await librarySchema.apply(db, database), beforeLibrarySchema.missing.length ? 'added-columns-and-verified' : 'already-compatible');
  assert.deepEqual(await librarySchema.inspect(db, database), { exists: true, missing: [], errors: [] });
  assert.equal(await librarySchema.apply(db, database), 'already-compatible');
  const ownClip = await VideoClip.create({ user_id: uid, title: '보우 앤 애로우', url: 'https://example.invalid/bow', description: '허벅지를 밟고 옆으로 눕기', tech_name: '["보우 앤 애로우"]', position: '["백"]' });
  const foreignClip = await VideoClip.create({ user_id: other.id, title: '비공개', url: 'https://example.invalid/other' });
  const summary = data => ({ title: '보우 앤 애로우 진입', overview: data.original, correctionPoints: [{ title: '옆으로 눕기', detail: '원문과 문답 통합', evidenceTurnIds: data.turns.filter(t => !t.skipped && typeof t.answer === 'string' && t.answer.trim()).map(t => t.id), sourceQuotes: [{source: 'original', turnId: null, quote: data.original}, ...data.turns.filter(t => !t.skipped && typeof t.answer === 'string' && t.answer.trim()).map(t => ({source: 'turn', turnId: t.id, quote: t.answer}))] }], practiceMethods: [{ title: '어깨 위에 다리 올리기', steps: ['높이 확보', '옆으로 눕기'], check: '뒤가 아닌 옆으로 눕기' }], unresolved: [] });
  const makeService = overrides => require('../src/services/feedback').createFeedbackService({ Feedback, VideoClip, Op, sequelize, researchWrite: require('../src/services/researchWrite'), generate: async (kind, data) => kind === 'ask' ? { question: '옆으로 누웠을 때 다리 위치는?', ready: false, reason: '동작 확인' } : summary(data), ...overrides });
  const service = makeService();
  const migrated = await service.get(uid, legacyId);
  assert.equal(migrated.situation, legacy.situation);
  assert.equal(migrated.technique, legacy.technique);
  assert.equal(migrated.original, legacy.original);
  assert.equal(migrated.revision, 7);
  assert.deepEqual(migrated.summary, legacySummary);
  assert.equal(migrated.summaryStale, false);
  assert.equal(migrated.starred, false);
  assert.equal(migrated.situationOptions, null);
  const input = { date: '2026-11-04', situation: '수업과 별개 대화', original: '왼발로 허벅지를 밟고 옆으로 누운다', clipIds: [ownClip.id] };
  await assert.rejects(service.create(uid, { ...input, clipIds: [foreignClip.id] }), { status: 404 });
  let card = await service.create(uid, input); await assert.rejects(service.get(other.id, card.id), { status: 404 });
  const race = await Promise.allSettled([service.patch(uid, card.id, { revision: card.revision, technique: '보우 앤 애로우' }), service.patch(uid, card.id, { revision: card.revision, technique: '다른 기술' })]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1); assert.equal(race.find(r => r.status === 'rejected').reason.status, 409);
  card = await service.get(uid, card.id); await service.ask(uid, card.id, { revision: card.revision }); await service.drain(); card = await service.get(uid, card.id);
  card = await service.answer(uid, card.id, { revision: card.revision, turnId: card.turns[0].id, answer: '어깨 위로 올렸다' });
  await service.summarize(uid, card.id, { revision: card.revision }); await service.drain(); card = await service.get(uid, card.id); assert.equal(card.summaryStale, false);
  const assigned = await service.assignTask(uid, card.id, { revision: card.revision, expectedTaskId: null, replace: false });
  assert.equal(assigned.reused, false); assert.equal(assigned.feedback.taskBinding.sourceHash.length, 64);
  assert.equal(assigned.feedback.trainingStatus, 'assigned');
  const reused = await service.assignTask(uid, card.id, { revision: assigned.feedback.revision, expectedTaskId: assigned.task.id, replace: false });
  assert.equal(reused.reused, true); assert.equal(reused.task.id, assigned.task.id);
  await assert.rejects(service.assignTask(uid, card.id, { revision: assigned.feedback.revision, expectedTaskId: null, replace: true }), { status: 409 });
  await assert.rejects(service.assignTask(uid, card.id, { revision: card.revision, expectedTaskId: assigned.task.id, replace: true }), { status: 409 });
  // A closed/deleted task is not treated as currently assigned. Explicit reassignment creates a new task.
  await sequelize.query('UPDATE research_tasks SET closed_at=NOW(),outcome=? WHERE id=?', { replacements: ['done', assigned.task.id] });
  assert.equal((await service.get(uid, card.id)).trainingStatus, null);
  const reopened = await service.assignTask(uid, card.id, { revision: assigned.feedback.revision, expectedTaskId: null, replace: false });
  assert.equal(reopened.reused, false); assert.notEqual(reopened.task.id, assigned.task.id);
  // Two simultaneous requests cannot create two projects or tasks; feedback revision fences the loser.
  const replacementCard = await service.create(uid, input); await service.summarize(uid, replacementCard.id, { revision: replacementCard.revision }); await service.drain();
  const currentCard = await service.get(uid, replacementCard.id);
  const replacing = await Promise.allSettled([1, 2].map(() => service.assignTask(uid, replacementCard.id, { revision: currentCard.revision, expectedTaskId: reopened.task.id, replace: true })));
  assert.equal(replacing.filter(r => r.status === 'fulfilled').length, 1); assert.equal(replacing.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal((await service.get(uid, card.id)).trainingStatus, null);
  assert.equal((await service.get(uid, replacementCard.id)).trainingStatus, 'assigned');
  const [[closed]] = await sequelize.query('SELECT closed_at,outcome FROM research_tasks WHERE id=?', { replacements: [reopened.task.id] });
  assert.ok(closed.closed_at); assert.equal(closed.outcome, 'not_tried');
  const [[counts]] = await sequelize.query('SELECT COUNT(*) AS count FROM research_tasks WHERE user_id=? AND closed_at IS NULL', { replacements: [uid] }); assert.equal(Number(counts.count), 1);
  // A helper failure rolls back project, node and old-task replacement together.
  const badWrite = { ...require('../src/services/researchWrite'), setWeeklyTask: async () => { throw new Error('forced rollback'); } };
  const failing = makeService({ researchWrite: badWrite });
  const [[before]] = await sequelize.query('SELECT COUNT(*) AS count FROM research_projects WHERE user_id=?', { replacements: [uid] });
  const activeTask = replacing.find(r => r.status === 'fulfilled').value.task.id;
  await assert.rejects(failing.assignTask(uid, card.id, { revision: reopened.feedback.revision, expectedTaskId: activeTask, replace: true }), /forced rollback/);
  const [[after]] = await sequelize.query('SELECT COUNT(*) AS count FROM research_projects WHERE user_id=?', { replacements: [uid] }); assert.equal(after.count, before.count);
  card = await service.get(uid, card.id); card = await service.result(uid, card.id, { revision: card.revision, date: '2026-12-01', outcome: 'tried_failed', context: 'drill', note: '추가 연습' });
  assert.equal(card.summaryStale, true); await assert.rejects(service.assignTask(uid, card.id, { revision: card.revision, expectedTaskId: activeTask, replace: true }), { status: 409 });
  assert.equal((await service.recap(uid, { from: '2026-12-01', to: '2026-12-31' })).summary.failureCount, 1);
  // Period-boundary analytics retain global reference vocabulary, but restrict activity rows and owner.
  const ownedTechnique = await Technique.create({ user_id: uid, name: '보우 앤 애로우', pos: '["백"]' });
  for (const [userId, day] of [[uid, '2026-10-31'], [uid, '2026-11-01'], [uid, '2026-11-30'], [uid, '2026-12-01'], [other.id, '2026-11-04']]) {
    const cls = await Class.create({ user_id: userId, date: day });
    await Drill.create({ class_id: cls.id, date: day, pos: '백', tech: '["보우 앤 애로우"]' });
    const sd = await SparDay.create({ class_id: cls.id, date: day });
    await SparSession.create({ spar_day_id: sd.id, positions: '[{"name":"백","score":1}]', success: '[{"name":"보우 앤 애로우","success":false}]' });
  }
  const lab = require('../src/services/labAnalytics');
  const period = { from: '2026-11-01', to: '2026-11-30' };
  const data = await lab.loadLabData(uid, period); assert.equal(data.sessions.length, 2); assert.equal(data.drills.length, 2); assert.equal(lab.computeHoles(data).summary.failItems, 2);
  assert.equal((await lab.loadLabData(uid)).sessions.length, 4);
  // Legacy NULL drill dates keep their existing unbounded meaning; bounded periods exclude them.
  const legacyClass = await Class.create({ user_id: uid, date: '2026-11-15' });
  const [[dateColumn]] = await sequelize.query("SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='drills' AND COLUMN_NAME='date'");
  if (dateColumn.IS_NULLABLE === 'NO') await sequelize.query('ALTER TABLE drills MODIFY date DATE NULL'); // isolated synthetic fixture only
  await sequelize.query('INSERT INTO drills (class_id,date,pos,tech) VALUES (?,NULL,?,?)', { replacements: [legacyClass.id, '백', '["보우 앤 애로우"]'] });
  assert.equal((await lab.loadLabData(uid)).drills.find(d => d.date === null)?.date, null);
  assert.equal((await lab.loadLabData(uid, period)).drills.length, 2);
  const { listPositions } = require('../src/services/positions');
  const pos = (await listPositions(uid, period)).find(p => p.name === '백');
  assert.equal(pos.drillCount, 2); assert.equal(pos.sparCount, 2); assert.equal(pos.techCount, 1); assert.equal(pos.clipCount, 1); assert.equal(pos.referenceScope, 'all');
  assert.equal((await listPositions(uid)).find(p => p.name === '백').drillCount, 5);

  await t.test('task-052 structured selection, favorites and filters preserve ownership and legacy text', async () => {
    const foreignTechnique = await Technique.create({ user_id: other.id, name: '다른 사용자 전용 기술', pos: '["백"]' });
    const foreign = await service.create(other.id, { ...input, techniqueId: foreignTechnique.id, clipIds: [] });
    await service.setStarred(other.id, foreign.id, { starred: true });
    await assert.rejects(service.create(uid, { ...input, techniqueId: foreignTechnique.id }), { status: 404 });
    await assert.rejects(service.setStarred(uid, foreign.id, { starred: false }), { status: 404 });
    await assert.rejects(service.setStarred(uid, legacyId, { starred: 1 }), { status: 400 });
    await assert.rejects(service.patch(uid, legacyId, { revision: migrated.revision, situationOptions: ['spar'], situationOther: '기타 미선택' }), { status: 400 });
    const selected = await service.patch(uid, legacyId, {
      revision: migrated.revision, situationOptions: ['spar', 'video_review', 'other'], situationOther: '추가 상황 그대로',
    });
    assert.equal(selected.situation, legacy.situation);
    assert.equal(selected.technique, legacy.technique);
    assert.deepEqual(selected.situationOptions, ['spar', 'video_review', 'other']);
    assert.equal(selected.situationOther, '추가 상황 그대로');
    const untouched = await service.patch(uid, legacyId, { revision: selected.revision, date: legacy.date });
    assert.equal(untouched.situation, legacy.situation);
    assert.deepEqual(untouched.situationOptions, selected.situationOptions);
    assert.equal(untouched.situationOther, selected.situationOther);
    const own = await service.create(uid, { ...input, techniqueId: ownedTechnique.id, situationOptions: ['class'], situationOther: '' });
    assert.equal(own.technique, ownedTechnique.name);
    const cleared = await service.patch(uid, own.id, { revision: own.revision, techniqueId: null });
    assert.equal(cleared.technique, '');
    const restored = await service.patch(uid, own.id, { revision: cleared.revision, techniqueId: ownedTechnique.id });
    assert.equal(restored.technique, ownedTechnique.name);
    const decomposed = '합성 가나다 원문'.normalize('NFD');
    const nfdCard = await service.create(uid, { ...input, original: decomposed });
    assert.equal((await service.get(uid, nfdCard.id)).original, decomposed);
    assert.deepEqual((await service.list(uid, { search: '가나다', limit: '1' })).items.map(item => item.id), [nfdCard.id]);

    let releaseSummary;
    const pendingSummary = new Promise(resolve => { releaseSummary = resolve; });
    const delayed = makeService({ generate: async (_kind, data) => { await pendingSummary; return summary(data); } });
    try {
      const pending = await delayed.summarize(uid, legacyId, { revision: untouched.revision });
      assert.equal(pending.ai.status, 'pending');
      assert.deepEqual(await service.setStarred(uid, legacyId, { starred: true }), { id: legacyId, starred: true });
      const current = await service.get(uid, legacyId);
      assert.equal(current.ai.status, 'pending');
      assert.equal(current.revision, pending.revision);
    } finally {
      releaseSummary();
      await delayed.drain();
    }
    const summarized = await service.get(uid, legacyId);
    assert.equal(summarized.ai.status, 'idle');
    assert.equal(summarized.summaryStale, false);
    assert.equal(summarized.starred, true);
    assert.ok(summarized.summary.correctionPoints.length);

    const query = { filter: 'star', technique: legacy.technique, search: '10%_', includeTechniqueOptions: '1', limit: '1' };
    const page = await service.list(uid, query);
    assert.equal(page.total, 1);
    assert.deepEqual(page.items.map(item => item.id), [legacyId]);
    assert.ok(page.techniqueOptions.includes(legacy.technique));
    assert.ok(page.techniqueOptions.includes(ownedTechnique.name));
    assert.ok(!page.techniqueOptions.includes(foreignTechnique.name));
    assert.deepEqual((await service.list(uid, { filter: 'star', q: '영상 복기', limit: '1' })).items.map(item => item.id), [legacyId]);
    const decomposedTechnique = legacy.technique.normalize('NFD');
    assert.deepEqual((await service.list(uid, { filter: 'star', search: decomposedTechnique, technique: decomposedTechnique, limit: '1' })).items.map(item => item.id), [legacyId]);
    assert.deepEqual((await service.list(uid, { ...query, page: '2' })).items, []);
    assert.equal((await service.list(uid, { ...query, page: '2' })).total, 1);
    const home = await service.list(uid, { limit: '3' });
    assert.equal(home.items.length, 3);
    assert.ok(!home.items.some(item => item.id === legacyId));
  });

  await t.test('task-052 real result edits update completed filtering and preserve all other results', async () => {
    let current = await service.get(uid, legacyId);
    const append = (outcome, note) => service.result(uid, legacyId, { revision: current.revision, date: '2026-11-04', outcome, context: 'drill', note });
    current = await append('tried_failed', '남길 기록');
    const retained = current.results[0];
    assert.equal(current.trainingStatus, 'training');
    current = await append('done', '수정할 기록');
    current = await append('done', '삭제할 기록');
    assert.equal(current.trainingStatus, 'completed');
    const [, editing, deleting] = current.results;
    const nextResult = { revision: current.revision, date: '2026-12-01', outcome: 'not_tried', context: 'spar', note: '수정된 결과' };
    await assert.rejects(service.editResult(other.id, legacyId, editing.id, nextResult), { status: 404 });
    await assert.rejects(service.deleteResult(other.id, legacyId, deleting.id, { revision: current.revision }), { status: 404 });
    await assert.rejects(service.editResult(uid, legacyId, randomUUID(), nextResult), { status: 404 });
    await assert.rejects(service.editResult(uid, legacyId, editing.id, { ...nextResult, outcome: 'unknown' }), { status: 400 });
    current = await service.editResult(uid, legacyId, editing.id, nextResult);
    assert.equal(current.trainingStatus, 'completed');
    assert.deepEqual(current.results[0], retained);
    assert.equal(current.results[1].id, editing.id);
    assert.equal(current.results[1].createdAt, editing.createdAt);
    assert.equal(current.results[1].note, nextResult.note);
    assert.equal(current.summaryStale, true);
    assert.deepEqual(current.results[2], deleting);
    const completed = await service.list(uid, { filter: 'completed', limit: '1' });
    assert.equal(completed.total, 1);
    assert.deepEqual(completed.items.map(item => item.id), [legacyId]);
    // Each decoy fails one predicate in the combined query, and sorts above the legacy card.
    const matchingFields = { ...input, original: legacy.original, technique: legacy.technique, clipIds: [] };
    async function completedCard(userId, overrides) {
      const record = await service.create(userId, { ...matchingFields, ...overrides });
      return service.result(userId, record.id, { revision: record.revision, date: '2026-11-04', outcome: 'done', context: 'drill' });
    }
    await completedCard(uid, { date: '2026-11-01' });
    await completedCard(uid, { date: '2026-10-15', original: '합성 예전 기록의 원문 10AB 확인' });
    await completedCard(uid, { date: '2026-10-20', technique: '다른 기술 조건' });
    await completedCard(other.id, { date: '2026-10-27' });
    const invalidResults = await service.create(uid, { ...matchingFields, date: '2026-10-25' });
    await Feedback.update({ results: '{invalid' }, { where: { user_id: uid, id: invalidResults.id } });
    const combined = { filter: 'completed', search: '10%_', technique: legacy.technique, from: '2026-10-01', to: '2026-10-31', limit: '1' };
    const combinedFirst = await service.list(uid, combined);
    assert.equal(combinedFirst.total, 1);
    assert.deepEqual(combinedFirst.items.map(item => item.id), [legacyId]);
    const combinedSecond = await service.list(uid, { ...combined, page: '2' });
    assert.equal(combinedSecond.total, 1);
    assert.equal(combinedSecond.page, 2);
    assert.deepEqual(combinedSecond.items, []);
    assert.equal((await service.recap(uid, { from: '2026-12-01', to: '2026-12-31' })).results.find(item => item.id === editing.id)?.outcome, 'not_tried');
    await assert.rejects(service.deleteResult(uid, legacyId, deleting.id, { revision: nextResult.revision }), { status: 409 });
    current = await service.deleteResult(uid, legacyId, deleting.id, { revision: current.revision });
    assert.equal(current.trainingStatus, 'training');
    assert.deepEqual(current.results.map(item => item.id), [retained.id, editing.id]);
    assert.equal(current.original, legacy.original);
    assert.equal((await service.list(uid, combined)).total, 0);
  });
  // Actual ON DELETE CASCADE owner cleanup is verified on a separate synthetic user.
  const cascadeCard = await service.create(other.id, { ...input, clipIds: [] });
  await User.destroy({ where: { id: other.id } }); assert.equal(await Feedback.findOne({ where: { id: cascadeCard.id } }), null);
});
