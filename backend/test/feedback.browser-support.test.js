const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const enabled = process.env.BJJ_FEEDBACK_TEST_DB === '1';
if (enabled && (process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '9002' || process.env.DB_NAME !== 'bjj_task052' || process.env.DB_USER !== 'root' || process.env.DB_PASS !== '')) throw new Error('Refusing browser support tests outside explicit bjj_task052 fixture settings');
const base = 'http://127.0.0.1:9016';
async function request(path, method = 'GET') {
  const response = await fetch(base + path, { method });
  return { status: response.status, envelope: await response.json() };
}
before(async () => {
  if (!enabled) return;
  const health = await request('/__fixture/health');
  assert.equal(health.status, 200); assert.equal(health.envelope.fixture, true); assert.equal(health.envelope.db, 'bjj_task052'); assert.equal(health.envelope.port, 9016); assert.equal(health.envelope.feedback, 'real-service-real-db');
});
test('unsupported existing AI recommendation is explicit 501, never normal empty recommendations', { skip: !enabled }, async () => {
  const clips = (await request('/api/clips')).envelope.data; assert.equal(clips.length, 7);
  const response = await request(`/api/clips/${clips[0].id}/recommend`, 'POST');
  assert.equal(response.status, 501); assert.equal(response.envelope.success, false); assert.match(response.envelope.message, /지원하지 않습니다/); assert.equal(response.envelope.data, undefined);
});
test('date-only synthetic recall is marked but text or position search never reports unfiltered matches', { skip: !enabled }, async () => {
  const dates = (await request('/api/recall/search?from=2026-11-01&to=2026-11-30')).envelope.data;
  assert.equal(dates.fixture, true); assert.ok(dates.results.every(row => row.date >= '2026-11-01' && row.date <= '2026-11-30'));
  for (const query of ['q=synthetic-no-match', 'pos=synthetic-no-position', 'q=%EB%B0%B1&pos=%EB%B0%B1']) {
    const result = await request(`/api/recall/search?${query}`); assert.equal(result.status, 501); assert.equal(result.envelope.success, false); assert.equal(result.envelope.data, undefined);
  }
});
test('unsupported research project browsing is 501 even though the real feedback task may have created projects', { skip: !enabled }, async () => {
  const result = await request('/api/research/projects'); assert.equal(result.status, 501); assert.equal(result.envelope.success, false); assert.equal(result.envelope.data, undefined); assert.match(result.envelope.message, /없다는 뜻이 아닙니다/);
  assert.equal((await request('/api/research/task')).status, 200);
});

test('current weekly task uses the owned nested node/project DTO and matches the real feedback binding', { skip: !enabled }, async () => {
  const state = (await request('/api/research/task')).envelope.data;
  const task = state.task;
  assert.ok(task && Number.isInteger(task.id) && task.id > 0, 'run the browser smoke first to create a synthetic feedback task');
  assert.equal(task.open, true); assert.equal(task.nodeId, task.node.id);
  assert.ok(task.node.label.trim()); assert.ok(task.node.kind);
  assert.ok(task.project.title.trim()); assert.ok(Number.isInteger(task.project.id) && task.project.id > 0);
  assert.ok(Number.isInteger(task.project.versionId) && task.project.versionId > 0); assert.equal(task.project.versionNo, 1);
  assert.match(task.createdAt, /^\d{4}-\d{2}-\d{2}$/); assert.equal(task.closedAt, null);
  const items = (await request('/api/feedback?limit=100')).envelope.data.items;
  const linked = items.find(card => card.taskBinding?.taskId === task.id);
  assert.ok(linked); assert.equal(linked.taskBinding.nodeId, task.node.id); assert.equal(linked.taskBinding.projectId, task.project.id);
  assert.ok(Array.isArray(state.recent));
});
