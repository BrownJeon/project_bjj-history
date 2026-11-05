// Loopback browser fixture smoke only; never send these writes to an application server.
if (process.env.BJJ_FEEDBACK_TEST_DB !== '1' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '9002' || process.env.DB_NAME !== 'bjj_task052' || process.env.DB_USER !== 'root' || process.env.DB_PASS !== '') throw new Error('Explicit isolated bjj_task052 fixture settings required');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const base = 'http://127.0.0.1:9016';
async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const envelope = await response.json();
  return { status: response.status, data: envelope.data ?? envelope };
}
async function done(id) {
  for (let count = 0; count < 80; count++) { const result = await request(`/api/feedback/${id}`); if (result.data.ai.status !== 'pending') return result.data; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('synthetic AI polling timeout');
}
(async () => {
  const health = await request('/__fixture/health'); assert.equal(health.status, 200); assert.equal(health.data.fixture, true); assert.equal(health.data.db, 'bjj_task052'); assert.equal(health.data.port, 9016); assert.equal(health.data.feedback, 'real-service-real-db');
  assert.equal((await request('/api/auth/login', { email: 'synthetic-browser-task052@test.invalid', password: 'wrong-synthetic' })).status, 401);
  const login = await request('/api/auth/login', { email: 'synthetic-browser-task052@test.invalid', password: 'synthetic-only-password' }); assert.equal(login.status, 200); assert.equal(login.data.user.id, health.data.userId);
  const clips = (await request('/api/clips')).data; assert.equal(clips.length, 7); assert.ok(Number.isInteger(clips[0].usage.view) && clips[0].usage.view >= 1);
  const techniques = (await request('/api/techniques')).data;
  const technique = techniques.find(item => item.name === '보우 앤 애로우');
  assert.ok(technique);
  const caseId = randomUUID();
  const created = await request('/api/feedback', {
    date: '2026-11-04', techniqueId: technique.id,
    situationOptions: ['video_review', 'other'], situationOther: '합성 HTTP 연동 검증',
    original: `합성 smoke ${caseId}: 왼발로 허벅지를 밟아 높이를 확보하고 옆으로 눕는다`, clipIds: [clips[0].id],
  });
  assert.equal(created.status, 200);
  let card = created.data;
  assert.equal(card.technique, technique.name);
  assert.deepEqual(card.situationOptions, ['video_review', 'other']);
  assert.equal(card.situationOther, '합성 HTTP 연동 검증');
  const id = card.id;
  card = (await request(`/api/feedback/${id}/ask`, { revision: card.revision })).data; assert.equal(card.ai.status, 'pending'); card = await done(id);
  const firstId = card.turns[0].id;
  card = (await request(`/api/feedback/${id}/answer`, { revision: card.revision, turnId: firstId, answer: '옆으로 누워 다리를 어깨 위로 올린다' })).data;
  await request(`/api/feedback/${id}/ask`, { revision: card.revision }); card = await done(id); assert.equal(card.turns.length, 2);
  const secondId = card.turns[1].id;
  card = (await request(`/api/feedback/${id}`, { revision: card.revision, cursor: 1, draftAnswer: '합성 저장 초안' }, 'PATCH')).data;
  assert.equal((await request(`/api/feedback/${id}`)).data.turns[1].draftAnswer, '합성 저장 초안');
  card = (await request(`/api/feedback/${id}/answer`, { revision: card.revision, turnId: firstId, answer: '옆으로 누워 다리를 어깨 위로 올린다' })).data; assert.equal(card.turns[1].id, secondId);
  card = (await request(`/api/feedback/${id}/answer`, { revision: card.revision, turnId: firstId, answer: '정정: 왼쪽 옆으로 누워 어깨 위 다리 위치를 확인한다' })).data; assert.equal(card.turns.length, 1); assert.equal(card.archives.length, 1);
  await request(`/api/feedback/${id}/ask`, { revision: card.revision }); card = await done(id);
  card = (await request(`/api/feedback/${id}/answer`, { revision: card.revision, turnId: card.turns[1].id, answer: '어깨 위로 다리를 올리는지 관찰한다' })).data;
  await request(`/api/feedback/${id}/summarize`, { revision: card.revision }); card = await done(id); assert.ok(card.summary); assert.ok(card.summary.correctionPoints[0].sourceQuotes.length); assert.equal(card.summary.practiceMethods[0].proposal, true);
  assert.equal((await request(`/api/feedback/${id}`, { revision: 1, original: 'stale-write' }, 'PATCH')).status, 409);
  const favorited = await request(`/api/feedback/${id}/star`, { starred: true }, 'PUT');
  assert.equal(favorited.status, 200);
  assert.deepEqual(favorited.data, { id, starred: true });
  const starredCard = (await request(`/api/feedback/${id}`)).data;
  assert.equal(starredCard.revision, card.revision);
  assert.equal(starredCard.summaryStale, false);
  const listQuery = new URLSearchParams({ filter: 'star', search: caseId, technique: technique.name, limit: '1', includeTechniqueOptions: '1' });
  const starredList = (await request(`/api/feedback?${listQuery}`)).data;
  assert.equal(starredList.total, 1);
  assert.deepEqual(starredList.items.map(item => item.id), [id]);
  assert.ok(starredList.techniqueOptions.includes(technique.name));
  card = (await request(`/api/feedback/${id}/results`, { revision: card.revision, date: '2026-11-04', outcome: 'tried_failed', context: 'drill', note: '합성 연습 결과' })).data;
  assert.equal(card.summaryStale, true);
  assert.equal(card.trainingStatus, 'training');
  const resultId = card.results[0].id;
  const edited = await request(`/api/feedback/${id}/results/${resultId}`, { revision: card.revision, date: '2026-11-04', outcome: 'done', context: 'drill', note: '합성 결과 수정' }, 'PATCH');
  assert.equal(edited.status, 200);
  assert.equal(edited.data.trainingStatus, 'completed');
  assert.equal(edited.data.results[0].createdAt, card.results[0].createdAt);
  listQuery.set('filter', 'completed');
  const completedList = (await request(`/api/feedback?${listQuery}`)).data;
  assert.deepEqual(completedList.items.map(item => item.id), [id]);
  assert.equal(completedList.total, 1);
  const deleted = await request(`/api/feedback/${id}/results/${resultId}`, { revision: edited.data.revision }, 'DELETE');
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.trainingStatus, null);
  assert.deepEqual(deleted.data.results, []);
  card = (await request(`/api/feedback/${id}/results`, { revision: deleted.data.revision, date: '2026-11-04', outcome: 'tried_failed', context: 'drill', note: '합성 연습 결과' })).data;
  await request(`/api/feedback/${id}/summarize`, { revision: card.revision }); card = await done(id);
  const current = (await request('/api/research/task')).data.task;
  let assignment = null;
  if (!current) { const response = await request(`/api/feedback/${id}/task`, { revision: card.revision, expectedTaskId: null, replace: false }); assert.equal(response.status, 200); assignment = response.data.task; card = response.data.feedback; }
  const previous = JSON.stringify(card.summary);
  await request('/__fixture/ai', { failNext: true }); await request(`/api/feedback/${id}/summarize`, { revision: card.revision }); card = await done(id); assert.equal(card.ai.status, 'failed'); assert.equal(JSON.stringify(card.summary), previous);
  await request(`/api/feedback/${id}/summarize`, { revision: card.revision }); card = await done(id); assert.equal(card.ai.status, 'idle'); assert.ok(card.summary);
  const recap = (await request('/api/feedback/recap?from=2026-11-01&to=2026-11-30')).data; assert.ok(recap.summary.feedbackCount >= 1); assert.ok(recap.summary.failureCount >= 1);
  assert.equal((await request('/api/not-supported')).status, 501);
  console.log(JSON.stringify({ pass: true, feedbackId: id, task: assignment, clips: clips.length, ai: 'synthetic', storage: 'actual-service-MariaDB', cases: ['login-fixture', 'full-clips-usage', 'structured-situation-and-technique', 'ask-answer', 'draft-reload', 'same-answer-reuse', 'changed-answer-archive', 'source-quotes-summary', 'CAS409', 'star-and-filter', 'result-edit-and-delete', 'practice-result-stale', 'actual-task-if-empty', 'AI-fail-preserves-summary', 'retry', 'recap', 'unsupported501'] }));
})().catch(error => { console.error(error); process.exitCode = 1; });
