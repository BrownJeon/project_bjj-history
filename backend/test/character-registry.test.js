const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const v8 = require('node:v8');
const { spawnSync } = require('node:child_process');
const core = require('../src/services/characterRegistry');
const schema = require('../scripts/task-055-character-schema');
const clone = value => v8.deserialize(v8.serialize(value));
const root = path.resolve(__dirname, '../..');

function fixture() {
  let state = { bases: [], skins: [], assets: [] };
  let failAt = null;
  const model = key => ({
    unscoped() { return this; },
    async findOne({ where, order }) {
      const rows = state[key].filter(row => Object.entries(where).every(([k, v]) => row[k] === v));
      if (order) rows.sort((a, b) => b.version_no - a.version_no);
      return clone(rows[0] || null);
    },
    async findByPk(id) { return clone(state[key].find(row => row.id === id) || null); },
    async create(values) {
      if (key === 'assets' && state.assets.length === failAt) throw new Error('injected insert failure');
      const row = { id: state[key].length + 1, ...clone(values) }; state[key].push(row); return clone(row);
    },
    async count() { return state[key].length; },
  });
  const deps = {
    CharacterBase: model('bases'), CharacterSkin: model('skins'), CharacterAsset: model('assets'),
    sequelize: {
      config: { database: 'fixture' },
      async query(sql) { return sql.startsWith('SELECT DATABASE') ? [[{ db: 'fixture', checks_enabled: 1, fks_enabled: 1, max_allowed_packet: 16777216 }]] : [[{ acquired: 1 }]]; },
      async transaction(work) {
        const snapshot = clone(state);
        try { return await work({ LOCK: { UPDATE: 'UPDATE' } }); }
        catch (error) { state = snapshot; throw error; }
      },
    },
  };
  return { service: core.createCharacterRegistry(deps), dependencies: deps, state: () => state, failAt: value => { failAt = value; } };
}
async function temporarySet(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'task-055-originals-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const files = [...core.APPROVED.map(a => a.path), core.PREFIX + 'approved-base-manifest.json'];
  for (const filename of files) { const target = path.join(temp, filename); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(path.join(root, filename), target); }
  return temp;
}
test('offline tools do not connect or need credentials, and report six approved originals', async () => {
  const env = { PATH: process.env.PATH };
  for (const filename of ['task-055-character-schema.js', 'task-055-character-register.js']) {
    const result = spawnSync(process.execPath, [path.join(root, 'backend/scripts', filename)], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /"type":"Buffer"/);
    if (filename.includes('register')) { const plan = JSON.parse(result.stdout); assert.equal(plan.writes, 0); assert.equal(plan.assets.length, 6); assert.equal(plan.total_bytes, 5175998); }
    else { assert.match(result.stdout, /LONGBLOB NOT NULL/); assert.equal((result.stdout.match(/CREATE TABLE /g) || []).length, 3); }
  }
});
test('missing, altered, unapproved and symlink originals fail before registration', async t => {
  const temp = await temporarySet(t);
  const filename = path.join(temp, core.APPROVED[0].path);
  const bytes = await fs.readFile(filename);
  await fs.writeFile(filename, bytes.subarray(0, bytes.length - 1));
  await assert.rejects(core.loadApprovedSet(temp), /bytes\/hash mismatch/);
  await fs.rm(filename);
  await assert.rejects(core.loadApprovedSet(temp), { code: 'ENOENT' });
  await fs.symlink(path.join(root, core.APPROVED[0].path), filename);
  await assert.rejects(core.loadApprovedSet(temp), /symlinks/);
  const manifestPath = path.join(temp, core.PREFIX, 'approved-base-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath));
  manifest.assets[0].path = '../../backend/.env';
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(core.loadApprovedSet(temp), /six approved originals/);
});
test('PNG signatures and UTF-8 prompt encodings are checked as bytes', () => {
  for (const [filename, bytes, pattern] of [['a.png', Buffer.from('not a PNG'), /PNG signature/], ['a.txt', Buffer.from([0xff]), /UTF-8/]]) {
    assert.throws(() => core.validateBytes(bytes, { path: filename, bytes: bytes.length, sha256: core.digest(bytes) }), pattern);
  }
});
test('apply rejects absent/wrong confirmation and unknown/repeated flags before connecting', () => {
  const env = { DB_HOST: 'unused', DB_PORT: '3306', DB_NAME: 'expected', DB_USER: 'unused', DB_PASS: '' };
  assert.throws(() => schema.requireEnvironment(env, { '--apply': true }), /confirm-database/);
  assert.throws(() => schema.requireEnvironment(env, { '--apply': true, '--confirm-database': 'other' }), /confirm-database/);
  assert.throws(() => schema.parseArgs(['--apply', '--apply'], { '--apply': false }), /repeated/);
  assert.throws(() => schema.parseArgs(['--confirm-database'], { '--confirm-database': true }), /Value required/);
  assert.throws(() => schema.parseArgs(['--force'], {}), /Unknown/);
});
test('CHECK comparison retains boolean precedence, internal parentheses and literals', () => {
  assert.notEqual(schema.normalizeCheck('(A AND B) OR (C AND D)'), schema.normalizeCheck('A AND (B OR C) AND D'));
  assert.notEqual(schema.normalizeCheck("binding_kind = 'skin'"), schema.normalizeCheck("binding_kind = 's k i n'"));
  assert.equal(schema.normalizeCheck('((`version_no` > 0))'), schema.normalizeCheck('version_no > 0'));
  assert.equal(schema.normalizeCheck('byte_length = OCTET_LENGTH(payload)'), schema.normalizeCheck('`byte_length` = length(`payload`)'));
  assert.equal(schema.normalizeCheck('(A AND B) OR (C AND D)'), schema.normalizeCheck('A AND B OR C AND D'));
  const mariaDbBinding = "`binding_kind` = 'skin' and `skin_id` is not null and `actor_a_skin_id` is null and `actor_b_skin_id` is null or `binding_kind` = 'pair' and `skin_id` is null and `actor_a_skin_id` is not null and `actor_b_skin_id` is not null";
  assert.equal(schema.normalizeCheck(schema.DEFINITIONS.character_assets.checks.ck_ca_binding), schema.normalizeCheck(mariaDbBinding));
  assert.throws(() => schema.assertCompatible({ tables: [], checks_enabled: true, fks_enabled: false }), /FK enforcement/);
});
test('MariaDB CHECK errors require errno/SQLSTATE and the exact constraint, not mysql2 symbolic aliases', () => {
  const { isExpectedRejection } = require('../scripts/task-055-character-check');
  const original = { code: 'ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE', errno: 4025, sqlState: '23000', sqlMessage: 'CONSTRAINT `ck_ca_binding` failed for the new table' };
  const check = error => isExpectedRejection({ original: error }, ['ER_CONSTRAINT_FAILED'], 'ck_ca_binding');
  assert.equal(check(original), true);
  assert.equal(check({ ...original, errno: 1234 }), false);
  assert.equal(check({ ...original, code: 'ER_CONSTRAINT_FAILED', errno: 1234 }), false);
  assert.equal(check({ ...original, sqlState: 'HY000' }), false);
  assert.equal(check({ ...original, sqlMessage: 'CONSTRAINT `ck_ca_length` failed' }), false);
  assert.equal(check({ ...original, sqlMessage: '' }), false);
});
test('same manifest reuses IDs and writes zero; original bytes and shared pair survive', async () => {
  const prepared = await core.loadApprovedSet(); const f = fixture();
  const first = await f.service.register(prepared);
  assert.deepEqual(first.created, { character_bases: 1, character_skins: 2, character_assets: 6 });
  const second = await f.service.register(prepared);
  assert.deepEqual(second.created, { character_bases: 0, character_skins: 0, character_assets: 0 });
  assert.deepEqual(first.assets, second.assets);
  const verified = await f.service.verify(prepared); assert.equal(verified.total_bytes, 5175998);
  for (let i = 0; i < prepared.assets.length; i++) { const result = await f.service.readAsset(first.assets[i].id); assert.ok(result.bytes.equals(prepared.assets[i].payload)); assert.equal(result.metadata.payload, undefined); }
  for (const asset of first.assets.slice(4)) { assert.equal(asset.skin_id, null); assert.equal(asset.binding_kind, 'pair'); assert.deepEqual(asset.context.actors.map(a => [a.slot, a.skin_id, a.version_no]), [['standing', first.skins[0].id, 1], ['guard', first.skins[1].id, 1]]); }
});
test('mutated in-memory payload refuses every write before transaction', async () => {
  const prepared = await core.loadApprovedSet(); const f = fixture(); prepared.assets[0].payload[0] ^= 1;
  await assert.rejects(f.service.register(prepared), /bytes\/hash mismatch/);
  assert.deepEqual(f.state(), { bases: [], skins: [], assets: [] });
});
test('actual write connection rejects another DB, disabled constraints or small packets before any insert', async () => {
  const prepared = await core.loadApprovedSet();
  for (const override of [{ db: 'another-database' }, { checks_enabled: 0 }, { fks_enabled: 0 }, { max_allowed_packet: 1024 }]) {
    const f = fixture();
    f.dependencies.sequelize.query = async () => [[{ db: 'fixture', checks_enabled: 1, fks_enabled: 1, max_allowed_packet: 16777216, ...override }]];
    await assert.rejects(f.service.register(prepared), /write connection/);
    assert.deepEqual(f.state(), { bases: [], skins: [], assets: [] });
  }
});
test('mid-insert failure rolls back base, both skins and inserted assets', async () => {
  const prepared = await core.loadApprovedSet(); const f = fixture(); f.failAt(2);
  await assert.rejects(f.service.register(prepared), /injected insert failure/);
  assert.deepEqual(f.state(), { bases: [], skins: [], assets: [] });
});
test('metadata or persisted payload collision never overwrites history', async () => {
  const prepared = await core.loadApprovedSet(); const f = fixture(); await f.service.register(prepared);
  f.state().assets[0].payload[0] ^= 1; const snapshot = clone(f.state());
  await assert.rejects(f.service.register(prepared), /bytes\/hash mismatch/); assert.deepEqual(f.state(), snapshot);
  f.state().assets[0].payload[0] ^= 1; f.state().skins[0].appearance = '{}';
  await assert.rejects(f.service.register(prepared), /differs; no history overwritten/);
});
test('skin v2 appends with the stable base; v1 assets and bindings remain immutable', async () => {
  const prepared = await core.loadApprovedSet(); const f = fixture(); const first = await f.service.register(prepared);
  const assetsBefore = clone(f.state().assets); const oldSkin = clone(f.state().skins[0]);
  const input = { skin_key: oldSkin.skin_key, version_no: 2, label: '다음 스킨', appearance: { gi_color: 'blue' }, approval: { scope: 'test-only' } };
  const next = await f.service.appendSkinVersion(core.BASE_KEY, input);
  assert.equal(next.base_id, first.base_id); assert.notEqual(next.id, oldSkin.id);
  assert.deepEqual(f.state().assets, assetsBefore); assert.deepEqual(f.state().skins[0], oldSkin);
  await assert.rejects(f.service.appendSkinVersion(core.BASE_KEY, input), /sequentially/);
  assert.equal((await f.service.verify(prepared)).total_counts.character_skins, 3);
});
test('restoration writes exact files outside originals and never replaces existing files', async t => {
  const prepared = await core.loadApprovedSet(); const f = fixture(); await f.service.register(prepared);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'task-055-restored-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const result = await f.service.restore(prepared, directory); assert.equal(result.restored.length, 6);
  for (const file of result.restored) assert.equal(core.digest(await fs.readFile(file.file)), file.sha256);
  await assert.rejects(f.service.restore(prepared, directory), { code: 'EEXIST' });
  await assert.rejects(f.service.restore(prepared, path.join(root, core.PREFIX)), /outside the project/);
});
test('model payload/serialization and DDL deletion contracts agree', () => {
  const models = require('../src/models');
  const asset = models.CharacterAsset.build({ payload: Buffer.from('private bytes'), id: 1 });
  assert.equal(models.CharacterAsset.rawAttributes.payload.type.toSql(), 'LONGBLOB');
  assert.ok(models.CharacterAsset.options.defaultScope.attributes.exclude.includes('payload'));
  assert.equal(asset.toJSON().payload, undefined); assert.doesNotMatch(JSON.stringify(asset), /private bytes|Buffer/);
  assert.equal(models.CharacterSkin.rawAttributes.base_id.onDelete, 'RESTRICT');
  for (const sql of Object.values(schema.DDL)) { assert.doesNotMatch(sql, /CASCADE|DROP|ALTER/i); assert.match(sql, /InnoDB/); }
  assert.match(schema.DDL.character_assets, /FOREIGN KEY \(`base_id`,`actor_a_skin_id`\)/);
});
