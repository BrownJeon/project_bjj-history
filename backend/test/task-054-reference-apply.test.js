// task-054 반영 도구 코어: dry-run 분류·집계, 적용 경로 가드, fingerprint, 멱등, restore, 보존 diff.
// 합성 픽스처 + 메모리 어댑터만 사용한다(DB·실제 개인 데이터 미사용).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCatalog } = require('../scripts/task-054-build-reference-catalog');
const { loadCatalog } = require('../src/services/techniqueReference');
const core = require('../src/services/techniqueReferenceApply');
const applyCli = require('../scripts/task-054-reference-apply');

const SLUGS = [
  ['x-exact', '합성 하나', 'technique'],
  ['x-alias', 'kimura', 'technique'],
  ['x-coach', '합성 둘 변형', 'technique'],
  ['x-concept', '합성 개념', 'concept'],
  ['x-new-tech', '합성 셋', 'technique'],
  ['x-new-pos', '합성 자리', 'position'],
  ['x-unclassified', '합성 미분류', null],
];
const raw = buildCatalog({
  index: { items: SLUGS.map(([slug, name]) => ({ source_slug: slug, source_name: name, source_category: '합성', source_url: null })) },
  relations: { items: SLUGS.map(([slug]) => ({ source_slug: slug, incoming: [], outgoing: [], related: [] })) },
  descriptions: SLUGS.filter(([, , kind]) => kind).map(([slug, name, kind]) => ({ slug, name, kind, summary: '합성 요약', review: { status: 'coach_draft' } })),
});
const CATALOG = loadCatalog(raw);
const BASE_TECHS = [
  { id: 101, user_id: 7, name: '합성 하나', category: '분류A', note: '개인 메모 A', pos: '["가드"]', tags: '[]', links: '[]', starred: 1 },
  { id: 102, user_id: 7, name: '기무라', category: '', note: '', pos: '[]', tags: '["t"]', links: '[]', starred: 0 },
  { id: 103, user_id: 7, name: '합성 둘', category: '', note: '메모', pos: '[]', tags: '[]', links: '[]', starred: 0 },
];
const SNAPSHOT = { scope_user: 7, techniques: BASE_TECHS.map(({ id, name, category }) => ({ id, name, category })) };
const COACH = { items: [{ source_slug: 'x-coach', candidate_technique_id: 103, confidence: 'medium', confidence_text: '중간(합성)', needs_check: '확인' }] };
const plan = () => core.buildPlan({ catalog: CATALOG, snapshot: SNAPSHOT, userId: 7, coachCandidates: COACH });

function memoryAdapter({ techniques = BASE_TECHS, links = [], linkStore = true } = {}) {
  const state = { techniques: structuredClone(techniques), links: structuredClone(links), nextTech: 500, nextLink: 900 };
  const tx = {
    lockUserTechniques: async uid => structuredClone(state.techniques.filter(t => t.user_id === uid)).sort((a, b) => a.id - b.id),
    linkStoreAvailable: async () => linkStore,
    lockUserLinks: async uid => structuredClone(state.links.filter(l => l.user_id === uid)),
    insertTechnique: async row => { const id = state.nextTech++; state.techniques.push({ id, ...structuredClone(row) }); return id; },
    insertLink: async row => { const id = state.nextLink++; state.links.push({ id, ...structuredClone(row) }); return id; },
    deleteTechnique: async () => { throw new Error('automatic technique deletion must never be called'); },
    deleteLink: async (uid, id) => { state.links = state.links.filter(l => !(l.id === id && l.user_id === uid)); },
  };
  return {
    state,
    hooks: tx,
    async transaction(fn) {
      const saved = structuredClone({ t: state.techniques, l: state.links });
      try { return await fn(tx); } catch (e) { state.techniques = saved.t; state.links = saved.l; throw e; }
    },
  };
}
const flagsFor = p => ({ apply: true, confirmUser: 7, planSha: p.plan_sha });
const decisionsFor = (p, list) => ({ plan_sha: p.plan_sha, user_id: 7, decisions: list });
const NOW = () => new Date('2026-11-08T00:00:00Z');

test('dry-run classifies each item and separates none from new', () => {
  const p = plan();
  const by = Object.fromEntries(p.items.map(i => [i.slug, i]));
  assert.equal(by['x-exact'].match.type, 'exact'); assert.equal(by['x-exact'].action, 'keep_existing');
  assert.equal(by['x-alias'].match.type, 'alias'); assert.equal(by['x-alias'].action, 'review_link_existing');
  assert.equal(by['x-coach'].tool_match, 'none'); assert.equal(by['x-coach'].match.type, 'coach_candidate'); assert.equal(by['x-coach'].action, 'review_link_existing');
  assert.equal(by['x-concept'].action, 'hold');
  assert.equal(by['x-new-tech'].action, 'review_new');
  assert.equal(by['x-new-pos'].action, 'review_new');
  assert.equal(by['x-unclassified'].action, 'hold');
  assert.deepEqual(p.summary.by_action, { keep_existing: 1, review_link_existing: 2, hold: 2, review_new: 2 });
  assert.equal(p.summary.none_breakdown.tool_none, 5);
  assert.equal(p.summary.none_breakdown.coach_candidate, 1);
  assert.equal(p.summary.none_breakdown.remaining_none, 4);
  assert.deepEqual(p.summary.none_breakdown.remaining_none_by_action, { hold: 2, review_new: 2 });
  assert.equal(p.summary.new_rows_planned, 0);
  assert.equal(plan().plan_sha, p.plan_sha, 'deterministic');
  assert.match(core.renderPlanMarkdown(p), /none 분리 집계/);
  assert.throws(() => core.buildPlan({ catalog: CATALOG, snapshot: SNAPSHOT, userId: 8 }), /scope_user/);
});

test('apply refuses when any flag is missing or mismatched', async () => {
  const p = plan();
  const d = decisionsFor(p, [{ slug: 'x-new-tech', decision: 'create' }]);
  const a = memoryAdapter();
  const run = (flags, decisions = d) => core.applyDecisions({ adapter: a, plan: p, decisions, flags, runId: 'r', now: NOW, writeBackup() {} });
  await assert.rejects(run({}, null), e => e.code === 'FLAGS_MISSING' && /--apply/.test(e.message) && /--decisions/.test(e.message) && /--confirm-user/.test(e.message) && /--plan-sha/.test(e.message));
  await assert.rejects(run({ ...flagsFor(p), apply: false }), e => e.code === 'FLAGS_MISSING');
  await assert.rejects(run({ ...flagsFor(p), confirmUser: 8 }), e => e.code === 'CONFIRM_USER_MISMATCH');
  await assert.rejects(run({ ...flagsFor(p), planSha: 'bad' }), e => e.code === 'PLAN_SHA_MISMATCH');
  await assert.rejects(run(flagsFor(p), { ...d, plan_sha: 'other' }), e => e.code === 'DECISIONS_PLAN_MISMATCH');
  await assert.rejects(run(flagsFor(p), decisionsFor(p, [{ slug: 'x-exact', decision: 'create' }])), e => e.code === 'DECISIONS_INVALID');
  await assert.rejects(run(flagsFor(p), decisionsFor(p, [{ slug: 'nope', decision: 'create' }])), e => e.code === 'DECISIONS_INVALID');
  const tampered = { ...p, items: p.items.slice(1) };
  await assert.rejects(core.applyDecisions({ adapter: a, plan: tampered, decisions: d, flags: flagsFor(p), runId: 'r', writeBackup() {} }), e => e.code === 'PLAN_TAMPERED');
  await assert.rejects(core.applyDecisions({ adapter: a, plan: p, decisions: d, flags: flagsFor(p), runId: 'r' }), e => e.code === 'BACKUP_REQUIRED');
  assert.deepEqual(a.state.techniques, BASE_TECHS, 'nothing written');
});

test('apply CLI refuses apply flags before any DB connection', async () => {
  const sink = { write() {} };
  const snapshotFile = require('path').join(require('os').tmpdir(), `task054-snap-${process.pid}.json`);
  require('fs').writeFileSync(snapshotFile, JSON.stringify(SNAPSHOT));
  try {
    await assert.rejects(applyCli.main(['--user-id', '7', '--snapshot', snapshotFile, '--apply'], {}, sink), /missing --decisions, --confirm-user, --plan-sha/);
    await assert.rejects(applyCli.main(['--snapshot', snapshotFile], {}, sink), /--user-id is required/);
  } finally { require('fs').unlinkSync(snapshotFile); }
});

test('fingerprint mismatch aborts before any write', async () => {
  const p = plan();
  const a = memoryAdapter({ techniques: [...BASE_TECHS, { id: 104, user_id: 7, name: '나중에 추가', category: '', note: '', pos: '[]', tags: '[]', links: '[]', starred: 0 }] });
  let backups = 0;
  await assert.rejects(
    core.applyDecisions({ adapter: a, plan: p, decisions: decisionsFor(p, [{ slug: 'x-new-tech', decision: 'create' }]), flags: flagsFor(p), runId: 'r', now: NOW, writeBackup() { backups++; } }),
    e => e.code === 'FINGERPRINT_MISMATCH',
  );
  assert.equal(backups, 0);
  assert.equal(a.state.techniques.length, 4);
});

test('apply creates rows directly, links them, is idempotent by NFC name, and preserves existing rows', async () => {
  const p = plan();
  const a = memoryAdapter();
  const backups = [];
  const d = decisionsFor(p, [
    { slug: 'x-new-tech', decision: 'create', category: '분류B' },
    { slug: 'x-new-pos', decision: 'create', name: '합성 하나' }, // NFC 이름 중복 → skip
    { slug: 'x-coach', decision: 'confirm_link', technique_id: 103 },
    { slug: 'x-alias', decision: 'reject_link', technique_id: 102 },
  ]);
  const result = await core.applyDecisions({ adapter: a, plan: p, decisions: d, flags: flagsFor(p), runId: 'run1', now: NOW, writeBackup: b => backups.push(structuredClone(b)) });
  assert.deepEqual(result.inserted.techniques, [{ id: 500, name: '합성 셋' }]);
  assert.deepEqual(result.skipped, [{ slug: 'x-new-pos', reason: 'duplicate_name', existing_id: 101 }]);
  assert.deepEqual(result.inserted.links.map(l => [l.technique_id, l.reference_slug, l.status]), [[500, 'x-new-tech', 'confirmed'], [103, 'x-coach', 'confirmed'], [102, 'x-alias', 'rejected']]);
  assert.deepEqual(a.state.links.map(l => l.technique_name_at_link), ['합성 셋', '합성 둘', '기무라'], 'new and locked existing technique names are snapshotted');
  const created = a.state.techniques.find(t => t.id === 500);
  assert.equal(created.note, ''); assert.equal(created.category, '분류B'); assert.equal(created.pos, '[]');
  assert.deepEqual(a.state.techniques.filter(t => t.id < 500), BASE_TECHS, 'existing rows untouched');
  assert.deepEqual(backups.map(b => b.status), ['pre-write', 'pre-commit']);
  assert.equal(backups[0].inserted.techniques.length, 0);
  assert.deepEqual(backups[0].before.techniques, BASE_TECHS);

  // 같은 결정 재실행: fingerprint 가 바뀌었으므로 새 스냅샷으로 다시 계획해야 한다 → 그 다음에는 skip 만 발생
  const snap2 = { scope_user: 7, techniques: a.state.techniques.map(({ id, name, category }) => ({ id, name, category })) };
  const p2 = core.buildPlan({ catalog: CATALOG, snapshot: snap2, userId: 7, coachCandidates: COACH });
  const again = await core.applyDecisions({
    adapter: a, plan: p2, flags: flagsFor(p2), runId: 'run2', now: NOW, writeBackup() {},
    decisions: decisionsFor(p2, [{ slug: 'x-new-pos', decision: 'create', name: '합성 셋' }, { slug: 'x-coach', decision: 'confirm_link', technique_id: 103 }]),
  });
  assert.equal(again.inserted.techniques.length, 0);
  assert.deepEqual(again.skipped.map(s => s.reason), ['duplicate_name', 'link_exists']);
  assert.equal(a.state.techniques.length, 4);

  // 다른 상태로 덮어쓰려는 링크는 충돌로 중단(롤백)
  await assert.rejects(core.applyDecisions({
    adapter: a, plan: p2, flags: flagsFor(p2), runId: 'run3', now: NOW, writeBackup() {},
    decisions: decisionsFor(p2, [{ slug: 'x-coach', decision: 'reject_link', technique_id: 103 }]),
  }), e => e.code === 'LINK_CONFLICT');
});

test('link decisions need the link table; foreign technique ids are refused', async () => {
  const p = plan();
  const noStore = memoryAdapter({ linkStore: false });
  await assert.rejects(core.applyDecisions({ adapter: noStore, plan: p, decisions: decisionsFor(p, [{ slug: 'x-coach', decision: 'confirm_link', technique_id: 103 }]), flags: flagsFor(p), runId: 'r', writeBackup() {} }), e => e.code === 'LINK_STORE_UNAVAILABLE');
  await assert.rejects(core.applyDecisions({ adapter: noStore, plan: p, decisions: decisionsFor(p, [{ slug: 'x-new-tech', decision: 'create', name: '이름 다름' }]), flags: flagsFor(p), runId: 'r', writeBackup() {} }), e => e.code === 'LINK_STORE_UNAVAILABLE');
  const ok = await core.applyDecisions({ adapter: noStore, plan: p, decisions: decisionsFor(p, [{ slug: 'x-new-tech', decision: 'create' }]), flags: flagsFor(p), runId: 'r', now: NOW, writeBackup() {} });
  assert.equal(ok.inserted.techniques.length, 1);
  assert.equal(ok.inserted.links.length, 0);
  const a = memoryAdapter();
  await assert.rejects(core.applyDecisions({ adapter: a, plan: p, decisions: decisionsFor(p, [{ slug: 'x-coach', decision: 'confirm_link', technique_id: 999 }]), flags: flagsFor(p), runId: 'r', writeBackup() {} }), e => e.code === 'TECHNIQUE_NOT_OWNED');
});

test('reconfirming a stale or missing name snapshot fails explicitly without overwriting existing links', async () => {
  const p = plan();
  for (const snapshot of ['적용 후 이름 변경 전 값', undefined]) {
    const link = { id: 901, user_id: 7, technique_id: 103, technique_name_at_link: snapshot, reference_slug: 'x-coach', status: 'confirmed', decided_at: NOW(), note: '합성 기존 연결' };
    const adapter = memoryAdapter({ links: [link] });
    let writes = 0;
    for (const method of ['insertTechnique', 'insertLink']) {
      const original = adapter.hooks[method];
      adapter.hooks[method] = async row => { writes++; return original(row); };
    }
    const run = decisions => core.applyDecisions({ adapter, plan: p, flags: flagsFor(p), runId: 'name-conflict', now: NOW, writeBackup() {}, decisions: decisionsFor(p, decisions) });
    await assert.rejects(run([{ slug: 'x-coach', decision: 'confirm_link', technique_id: 103 }]), error => error.code === 'LINK_NAME_CONFLICT');
    assert.equal(writes, 0);
    assert.deepEqual(adapter.state.links, [link]);
    assert.deepEqual(adapter.state.techniques, BASE_TECHS);
    // A preceding decision in the same transaction must also be rolled back on this conflict.
    await assert.rejects(run([{ slug: 'x-new-tech', decision: 'create' }, { slug: 'x-coach', decision: 'confirm_link', technique_id: 103 }]), error => error.code === 'LINK_NAME_CONFLICT');
    assert.deepEqual(adapter.state.links, [link]);
    assert.deepEqual(adapter.state.techniques, BASE_TECHS);
  }
});

test('reconfirming the same NFC name snapshot remains idempotent', async () => {
  const p = plan();
  const link = { id: 901, user_id: 7, technique_id: 103, technique_name_at_link: '합성 둘'.normalize('NFD'), reference_slug: 'x-coach', status: 'confirmed', decided_at: NOW(), note: '합성 기존 연결' };
  const adapter = memoryAdapter({ links: [link] });
  const result = await core.applyDecisions({ adapter, plan: p, flags: flagsFor(p), runId: 'same-nfc-name', now: NOW, writeBackup() {}, decisions: decisionsFor(p, [{ slug: 'x-coach', decision: 'confirm_link', technique_id: 103 }]) });
  assert.deepEqual(result.inserted, { techniques: [], links: [] });
  assert.deepEqual(result.skipped, [{ slug: 'x-coach', technique_id: 103, reason: 'link_exists' }]);
  assert.deepEqual(adapter.state.links, [link]);
  assert.deepEqual(adapter.state.techniques, BASE_TECHS);
});

test('preservation diff detects changes and a violating adapter rolls back', async () => {
  assert.deepEqual(core.preservationDiff(BASE_TECHS, BASE_TECHS), []);
  const changed = structuredClone(BASE_TECHS); changed[0].note = '바뀜'; changed.pop();
  assert.deepEqual(core.preservationDiff(BASE_TECHS, changed), [{ id: 101, problem: 'changed', field: 'note' }, { id: 103, problem: 'missing' }]);

  const p = plan();
  const a = memoryAdapter();
  const original = a.hooks.insertTechnique;
  a.hooks.insertTechnique = async row => { a.state.techniques.find(t => t.id === 101).name = '훼손'; return original(row); };
  await assert.rejects(core.applyDecisions({ adapter: a, plan: p, decisions: decisionsFor(p, [{ slug: 'x-new-tech', decision: 'create' }]), flags: flagsFor(p), runId: 'r', now: NOW, writeBackup() {} }),
    e => e.code === 'PRESERVATION_VIOLATION' && e.violations.some(v => v.id === 101 && v.field === 'name'));
  assert.deepEqual(a.state.techniques, BASE_TECHS, 'rolled back');
});

test('restore retains every new technique and its links, including unchanged rows with later usage', async () => {
  const p = plan();
  const a = memoryAdapter();
  let backup;
  await core.applyDecisions({
    adapter: a, plan: p, flags: flagsFor(p), runId: 'run1', now: NOW, writeBackup: b => { backup = structuredClone(b); },
    decisions: decisionsFor(p, [{ slug: 'x-new-tech', decision: 'create' }, { slug: 'x-new-pos', decision: 'create' }, { slug: 'x-coach', decision: 'confirm_link', technique_id: 103 }]),
  });
  assert.equal(a.state.techniques.length, 5);
  a.state.researchNodes = [{ id: 1, technique_id: 500, content: '적용 후 생성한 합성 연구' }];
  a.state.techniques.find(t => t.name === '합성 자리').note = '적용 후 사용자가 쓴 메모';
  const expectedTechniques = structuredClone(a.state.techniques);
  await assert.rejects(core.restoreRun({ adapter: a, backup, flags: { apply: true, confirmUser: 8 } }), e => e.code === 'CONFIRM_USER_MISMATCH');
  await assert.rejects(core.restoreRun({ adapter: a, backup: { ...backup, status: 'pre-write' }, flags: { apply: true, confirmUser: 7 } }), e => e.code === 'BACKUP_INCOMPLETE');
  const r = await core.restoreRun({ adapter: a, backup, flags: { apply: true, confirmUser: 7 } });
  assert.equal(r.mode, 'mapping-only-techniques-retained');
  assert.deepEqual(r.deleted.techniques, []);
  assert.deepEqual(r.preserved.map(x => [x.table, x.reason]), [['techniques', 'automatic_technique_deletion_disabled'], ['techniques', 'changed_after_apply'], ['links', 'technique_preserved'], ['links', 'technique_preserved']]);
  assert.equal(r.deleted.links.length, 1, 'only the unchanged link attached to an original technique is removed');
  assert.deepEqual(a.state.techniques, expectedTechniques);
  assert.deepEqual(a.state.researchNodes, [{ id: 1, technique_id: 500, content: '적용 후 생성한 합성 연구' }]);
  assert.deepEqual(a.state.links.map(l => l.technique_id), [500, 501]);
  assert.deepEqual(a.state.techniques.filter(t => t.id < 500), BASE_TECHS);
  assert.ok(a.state.techniques.some(t => t.id === 501 && t.note === '적용 후 사용자가 쓴 메모'));
});

async function appliedRestoreFixture() {
  const p = plan();
  const adapter = memoryAdapter();
  let backup;
  await core.applyDecisions({
    adapter, plan: p, flags: flagsFor(p), runId: 'restore-synthetic', now: NOW,
    writeBackup: b => { backup = structuredClone(b); },
    decisions: decisionsFor(p, [{ slug: 'x-new-tech', decision: 'create' }, { slug: 'x-coach', decision: 'confirm_link', technique_id: 103 }]),
  });
  return { adapter, backup };
}

test('restore has no dependency-proof or deletion capability requirement; unknown usage always retains new rows', async () => {
  for (const usage of [undefined, async () => undefined, async () => { throw new Error('usage database unavailable'); }]) {
    const { adapter, backup } = await appliedRestoreFixture();
    delete adapter.hooks.deleteTechnique;
    adapter.hooks.checkTechniqueUsage = usage;
    const expected = structuredClone(adapter.state.techniques);
    const result = await core.restoreRun({ adapter, backup, flags: { apply: true, confirmUser: 7 } });
    assert.deepEqual(result.deleted.techniques, []);
    assert.deepEqual(adapter.state.techniques, expected);
    assert.equal(adapter.state.links.length, 1);
    assert.equal(adapter.state.links[0].technique_id, 500);
  }
});

test('restore preserves unknown link-store state and aborts on lookup errors without deleting any rows', async () => {
  const { adapter, backup } = await appliedRestoreFixture();
  const before = structuredClone({ techniques: adapter.state.techniques, links: adapter.state.links });
  adapter.hooks.linkStoreAvailable = async () => false;
  const r = await core.restoreRun({ adapter, backup, flags: { apply: true, confirmUser: 7 } });
  assert.deepEqual(r.deleted, { techniques: [], links: [] });
  assert.equal(r.preserved.filter(x => x.reason === 'link_store_unavailable').length, 2);
  assert.deepEqual(adapter.state.techniques, before.techniques);
  assert.deepEqual(adapter.state.links, before.links);
  adapter.hooks.linkStoreAvailable = async () => { throw new Error('link store lookup failed'); };
  await assert.rejects(core.restoreRun({ adapter, backup, flags: { apply: true, confirmUser: 7 } }), /link store lookup failed/);
  assert.deepEqual(adapter.state.techniques, before.techniques);
  assert.deepEqual(adapter.state.links, before.links);
});

test('restore preserves edited links and requires the original still-owned technique before removing links', async () => {
  const { adapter, backup } = await appliedRestoreFixture();
  const originalLink = adapter.state.links.find(l => l.technique_id === 103);
  originalLink.decided_at = new Date('2026-11-09T00:00:00Z');
  const r = await core.restoreRun({ adapter, backup: JSON.parse(JSON.stringify(backup)), flags: { apply: true, confirmUser: 7 } });
  assert.deepEqual(r.deleted, { techniques: [], links: [] });
  assert.ok(r.preserved.some(x => x.table === 'links' && x.id === originalLink.id && x.reason === 'changed_after_apply'));
  // The technique no longer belongs to this user: exact matching link fields are insufficient proof.
  originalLink.decided_at = new Date('2026-11-08T00:00:00Z');
  adapter.state.techniques.find(t => t.id === 103).user_id = 8;
  const r2 = await core.restoreRun({ adapter, backup: JSON.parse(JSON.stringify(backup)), flags: { apply: true, confirmUser: 7 } });
  assert.deepEqual(r2.deleted, { techniques: [], links: [] });
  assert.ok(r2.preserved.some(x => x.table === 'links' && x.id === originalLink.id && x.reason === 'original_owned_technique_unconfirmed'));
});

test('unchanged existing-technique links restore across JSON backup with database second precision', async () => {
  const p = plan();
  const adapter = memoryAdapter();
  let backup;
  await core.applyDecisions({
    adapter, plan: p, flags: flagsFor(p), runId: 'json-timestamp', now: () => new Date('2026-11-08T00:00:00.987Z'),
    writeBackup: b => { backup = JSON.parse(JSON.stringify(b)); },
    decisions: decisionsFor(p, [{ slug: 'x-coach', decision: 'confirm_link', technique_id: 103 }]),
  });
  assert.equal(backup.inserted.links[0].decided_at, '2026-11-08T00:00:00.000Z');
  assert.equal(backup.inserted.links[0].technique_name_at_link, '합성 둘');
  const result = await core.restoreRun({ adapter, backup, flags: { apply: true, confirmUser: 7 } });
  assert.deepEqual(result.deleted, { techniques: [], links: [900] });
  assert.deepEqual(adapter.state.techniques, BASE_TECHS);
  assert.deepEqual(adapter.state.links, []);
});

test('a concurrent backup destination prevents overwrite and rolls the entire synthetic apply back', async () => {
  const fs = require('fs');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'task054-backup-race-'));
  const file = path.join(dir, 'backup.json');
  const p = plan();
  const adapter = memoryAdapter();
  const writer = applyCli.createBackupWriter(file);
  try {
    await assert.rejects(core.applyDecisions({
      adapter, plan: p, flags: flagsFor(p), runId: 'backup-race', now: NOW,
      decisions: decisionsFor(p, [{ slug: 'x-new-tech', decision: 'create' }]),
      writeBackup: b => {
        if (b.status === 'pre-commit') fs.writeFileSync(file, 'another operator file', { flag: 'wx', mode: 0o600 });
        writer(b);
      },
    }), e => e.code === 'EEXIST');
    assert.deepEqual(adapter.state.techniques, BASE_TECHS);
    assert.deepEqual(adapter.state.links, []);
    assert.equal(fs.readFileSync(file, 'utf8'), 'another operator file');
    assert.equal(JSON.parse(fs.readFileSync(`${file}.pre-write`, 'utf8')).status, 'pre-write');
    assert.deepEqual(fs.readdirSync(dir).sort(), ['backup.json', 'backup.json.pre-write']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function syntheticCliFiles(dir) {
  const fs = require('fs');
  const path = require('path');
  const snapshot = path.join(dir, 'snapshot.json');
  const catalog = path.join(dir, 'catalog.json');
  const decisions = path.join(dir, 'decisions.json');
  const backup = path.join(dir, 'backup.json');
  fs.writeFileSync(snapshot, JSON.stringify(SNAPSHOT));
  fs.writeFileSync(catalog, JSON.stringify(raw));
  const base = ['--user-id', '7', '--snapshot', snapshot, '--catalog', catalog, '--no-coach-candidates'];
  const cliPlan = applyCli.makePlan(applyCli.parseArgs(base));
  fs.writeFileSync(decisions, JSON.stringify(decisionsFor(cliPlan, [{ slug: 'x-new-tech', decision: 'create' }])));
  return {
    backup,
    args: [...base, '--apply', '--confirm-user', '7', '--plan-sha', cliPlan.plan_sha, '--decisions', decisions, '--backup', backup, '--confirm-database', 'synthetic-only'],
    env: { DB_HOST: 'synthetic.invalid', DB_PORT: '3307', DB_NAME: 'synthetic-only', DB_USER: 'synthetic', DB_PASS: '' },
  };
}

test('CLI rejects conflicting or existing logs before creating any DB adapter or backup', async () => {
  const fs = require('fs');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'task054-cli-paths-'));
  try {
    const fixture = syntheticCliFiles(dir);
    let adapterCalls = 0;
    const createAdapter = () => { adapterCalls++; throw new Error('DB adapter must not be constructed'); };
    const sink = { write() {} };
    for (const log of [fixture.backup, `${fixture.backup}.pre-write`]) {
      await assert.rejects(applyCli.main([...fixture.args, '--log', log], fixture.env, sink, { createAdapter }), /output paths must be distinct/);
    }
    const log = path.join(dir, 'log.json');
    fs.writeFileSync(log, 'prior synthetic log');
    await assert.rejects(applyCli.main([...fixture.args, '--log', log], fixture.env, sink, { createAdapter }), /log file already exists/);
    fs.unlinkSync(log);
    fs.symlinkSync(path.join(dir, 'absent-target'), log);
    await assert.rejects(applyCli.main([...fixture.args, '--log', log], fixture.env, sink, { createAdapter }), /log file already exists/);
    assert.equal(adapterCalls, 0);
    assert.equal(fs.existsSync(fixture.backup), false);
    assert.equal(fs.existsSync(`${fixture.backup}.pre-write`), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a postcommit log race reports committed_log_failed while preserving the successful synthetic commit and backups', async () => {
  const fs = require('fs');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'task054-cli-log-race-'));
  try {
    const fixture = syntheticCliFiles(dir);
    const log = path.join(dir, 'log.json');
    const adapter = memoryAdapter();
    adapter.close = async () => {};
    const originalTransaction = adapter.transaction;
    let committed = false;
    adapter.transaction = async fn => {
      const result = await originalTransaction(fn);
      committed = true;
      fs.writeFileSync(log, 'concurrent synthetic log', { flag: 'wx' });
      return result;
    };
    let stdout = '';
    const receipt = await applyCli.main([...fixture.args, '--log', log], fixture.env, { write: text => { stdout += text; } }, { createAdapter: () => adapter });
    assert.equal(committed, true);
    assert.equal(receipt.status, 'committed_log_failed');
    assert.equal(receipt.log.status, 'failed');
    assert.match(receipt.log.warning, /DB 반영은 커밋됐고 백업은 유지/);
    assert.equal(JSON.parse(stdout).status, 'committed_log_failed');
    assert.equal(adapter.state.techniques.length, BASE_TECHS.length + 1);
    assert.equal(JSON.parse(fs.readFileSync(fixture.backup, 'utf8')).status, 'pre-commit');
    assert.equal(JSON.parse(fs.readFileSync(`${fixture.backup}.pre-write`, 'utf8')).status, 'pre-write');
    assert.equal(fs.readFileSync(log, 'utf8'), 'concurrent synthetic log');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('successful CLI receipt and optional log agree on committed state and the log is private', async () => {
  const fs = require('fs');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'task054-cli-log-success-'));
  try {
    const fixture = syntheticCliFiles(dir);
    const log = path.join(dir, 'log.json');
    const adapter = memoryAdapter();
    adapter.close = async () => {};
    let stdout = '';
    const receipt = await applyCli.main([...fixture.args, '--log', log], fixture.env, { write: text => { stdout += text; } }, { createAdapter: () => adapter });
    assert.equal(receipt.status, 'committed');
    assert.equal(receipt.log.status, 'written');
    assert.deepEqual(JSON.parse(stdout), JSON.parse(fs.readFileSync(log, 'utf8')));
    assert.equal(fs.statSync(log).mode & 0o777, 0o600);
    assert.equal(adapter.state.techniques.length, BASE_TECHS.length + 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
