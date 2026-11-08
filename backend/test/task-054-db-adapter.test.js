// Explicit-DB constructor/SQL and schema metadata fixtures only. No connection or real environment values.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cli = require('../scripts/task-054-reference-apply');
const schema = require('../scripts/task-054-reference-links-schema');

const ENV = { DB_HOST: 'fixture.invalid', DB_PORT: '3307', DB_NAME: 'synthetic_only', DB_USER: 'synthetic_user', DB_PASS: '' };

test('both DB entry points reject blank/invalid configuration before constructing or connecting', async () => {
  const bad = [{}, ...['DB_HOST', 'DB_NAME', 'DB_USER'].flatMap(key => ['', ' ', ' padded '].map(value => ({ ...ENV, [key]: value }))), ...['', ' ', '0', '-1', '65536', '1.5', '3306tail'].map(value => ({ ...ENV, DB_PORT: value })), { ...ENV, DB_PASS: undefined }];
  let constructors = 0;
  for (const env of bad) {
    assert.throws(() => cli.createSequelizeAdapter(env, { sequelize: { Sequelize: class { constructor() { constructors++; } } } }));
    await assert.rejects(schema.main(['--apply', '--confirm-database', env.DB_NAME || ''], env, { write() {} }, { createConnection: async () => { constructors++; } }));
  }
  assert.equal(constructors, 0);
  assert.equal(cli.explicitDbConfig(ENV).password, '');
  assert.equal(schema.explicitDbConfig(ENV).password, '');
});

test('dedicated Sequelize receives exactly the validated injected env and uses tenant-bound transactional SQL', async () => {
  const constructors = [];
  const queries = [];
  const transaction = {};
  const driver = { syntheticDriver: true };
  let probeError = null;
  class FakeSequelize {
    constructor(...args) { constructors.push(args); }
    async close() {}
    async transaction(fn) { return fn(transaction); }
    async query(sql, options) {
      queries.push({ sql, options });
      if (sql.endsWith('LIMIT 0') && probeError) throw probeError;
      if (sql.startsWith('INSERT INTO techniques')) return [501, 1];
      if (sql.startsWith('INSERT INTO technique_reference_links')) return [901, 1];
      return [];
    }
  }
  const adapter = cli.createSequelizeAdapter(ENV, { sequelize: { Sequelize: FakeSequelize, QueryTypes: { SELECT: 'SELECT', INSERT: 'INSERT', DELETE: 'DELETE' } }, mysql2: driver });
  const [database, username, password, options] = constructors[0];
  assert.equal(database, ENV.DB_NAME); assert.equal(username, ENV.DB_USER); assert.equal(password, ENV.DB_PASS);
  assert.equal(options.host, ENV.DB_HOST); assert.equal(options.port, 3307);
  assert.equal(options.dialect, 'mysql'); assert.equal(options.dialectModule, driver);
  assert.equal(options.timezone, '+09:00'); assert.equal(options.logging, false);
  assert.ok(!Object.keys(require.cache).some(file => file.endsWith('/src/config/db.js') || file.endsWith('/src/models/index.js')));
  await adapter.transaction(async tx => {
    assert.equal('deleteTechnique' in tx, false);
    await tx.lockUserTechniques(7);
    assert.equal(await tx.linkStoreAvailable(), true);
    await tx.lockUserLinks(7);
    assert.equal(await tx.insertTechnique({ user_id: 7, name: '합성', category: '', note: '', pos: '[]', tags: '[]', links: '[]', starred: 0 }), 501);
    await tx.insertLink({ user_id: 7, technique_id: 501, technique_name_at_link: '합성', reference_slug: 's-a', status: 'confirmed', decided_at: new Date('2026-11-08T00:00:00Z'), note: '' });
    await tx.deleteLink(7, 901);
  });
  assert.ok(queries.every(q => q.options.transaction === transaction));
  assert.deepEqual(queries[0].options.replacements, [7]);
  assert.match(queries[0].sql, /WHERE user_id = \? ORDER BY id FOR UPDATE$/);
  const inserted = queries.find(q => q.sql.startsWith('INSERT INTO techniques'));
  assert.match(inserted.sql, /created_at/);
  assert.ok(inserted.options.replacements.at(-1) instanceof Date);
  assert.ok(queries.find(q => q.sql.startsWith('INSERT INTO technique_reference_links')).options.replacements.includes('합성'));
  assert.deepEqual(queries.at(-1).options.replacements, [901, 7]);
  for (const error of [{ code: 'ER_NO_SUCH_TABLE' }, { original: { errno: 1146 } }]) {
    probeError = error;
    assert.equal(await adapter.transaction(tx => tx.linkStoreAvailable()), false);
  }
  for (const error of [new Error('generic fixture failure'), { code: 'ER_TABLEACCESS_DENIED_ERROR' }]) {
    probeError = error;
    await assert.rejects(adapter.transaction(tx => tx.linkStoreAvailable()), e => e === error);
  }
  await adapter.close();
});

function fakeSchemaDb({ exists = false, missingSnapshot = false, missingTechniqueFk = false, parents, failAfterCreate = false } = {}) {
  const state = { exists, created: 0, calls: [], ended: false };
  const columns = Object.entries(schema.COLUMNS).map(([name, [type, nullable, length]]) => ({
    COLUMN_NAME: name, DATA_TYPE: type, COLUMN_TYPE: type === 'enum' ? "enum('confirmed','rejected')" : type,
    IS_NULLABLE: nullable, CHARACTER_MAXIMUM_LENGTH: length || null,
    CHARACTER_SET_NAME: ['text', 'varchar', 'enum'].includes(type) ? 'utf8mb4' : null, EXTRA: name === 'id' ? 'auto_increment' : '',
  })).filter(column => !(missingSnapshot && column.COLUMN_NAME === 'technique_name_at_link'));
  const indexes = [{ INDEX_NAME: 'PRIMARY', NON_UNIQUE: 0, SEQ_IN_INDEX: 1, COLUMN_NAME: 'id' }, ...['user_id', 'technique_id', 'reference_slug'].map((name, i) => ({ INDEX_NAME: 'uq_tech_ref_link', NON_UNIQUE: 0, SEQ_IN_INDEX: i + 1, COLUMN_NAME: name }))];
  const fks = [{ COLUMN_NAME: 'user_id', REFERENCED_TABLE_NAME: 'users', REFERENCED_COLUMN_NAME: 'id', DELETE_RULE: 'CASCADE' }, ...(missingTechniqueFk ? [] : [{ COLUMN_NAME: 'technique_id', REFERENCED_TABLE_NAME: 'techniques', REFERENCED_COLUMN_NAME: 'id', DELETE_RULE: 'CASCADE' }])];
  return {
    state,
    async end() { state.ended = true; },
    async query(sql, params) {
      state.calls.push({ sql, params });
      if (sql === schema.DDL) { state.exists = true; state.created++; return []; }
      if (sql.startsWith('SELECT ENGINE')) {
        if (state.created && failAfterCreate) throw new Error('synthetic private metadata error');
        return [state.exists ? [{ ENGINE: 'InnoDB', TABLE_COLLATION: 'utf8mb4_unicode_ci' }] : []];
      }
      if (sql.startsWith('SELECT c.TABLE_NAME')) return [parents || ['users', 'techniques'].map(table => ({ TABLE_NAME: table, COLUMN_TYPE: 'int(11)', ENGINE: 'InnoDB' }))];
      if (sql.startsWith('SELECT COLUMN_NAME')) return [columns];
      if (sql.includes('information_schema.STATISTICS')) return [indexes];
      if (sql.includes('information_schema.KEY_COLUMN_USAGE')) return [fks];
      throw new Error('unexpected synthetic schema query');
    },
  };
}

test('draft schema requires the name snapshot and both cascade FKs, without altering parent tables', async () => {
  assert.match(schema.DDL, /technique_name_at_link VARCHAR\(100\) NOT NULL/);
  assert.match(schema.DDL, /FOREIGN KEY \(technique_id\) REFERENCES techniques\(id\) ON DELETE CASCADE/);
  for (const options of [{ exists: true, missingSnapshot: true }, { exists: true, missingTechniqueFk: true }]) {
    const db = fakeSchemaDb(options);
    await assert.rejects(schema.apply(db, 'synthetic_only'), /technique_name_at_link|reference FK/);
    assert.equal(db.state.created, 0);
    assert.ok(db.state.calls.every(call => !/ALTER|DROP/.test(call.sql)));
  }
  const db = fakeSchemaDb();
  assert.equal(await schema.apply(db, 'synthetic_only'), 'created-and-verified');
  assert.equal(db.state.created, 1);
  assert.equal(await schema.apply(db, 'synthetic_only'), 'already-compatible');
  assert.equal(db.state.created, 1);
});

test('both parent ids must be signed INT/InnoDB before CREATE and during metadata verification', async () => {
  for (const [table, type, engine] of [['users', 'int unsigned', 'InnoDB'], ['techniques', 'int unsigned', 'InnoDB'], ['techniques', 'int', 'MyISAM']]) {
    const parents = ['users', 'techniques'].map(name => ({ TABLE_NAME: name, COLUMN_TYPE: name === table ? type : 'int', ENGINE: name === table ? engine : 'InnoDB' }));
    const db = fakeSchemaDb({ parents });
    await assert.rejects(schema.apply(db, 'synthetic_only'), /must be signed INT in InnoDB; no schema changed/);
    assert.equal(db.state.created, 0);
    assert.ok((await schema.inspect(fakeSchemaDb({ exists: true, parents }), 'synthetic_only')).errors.some(e => e.includes(`${table}.id`)));
  }
});

test('successful CREATE followed by verification failure reports created_unverified and never claims rollback', async () => {
  const db = fakeSchemaDb({ failAfterCreate: true });
  await assert.rejects(schema.apply(db, 'synthetic_only'), error => {
    assert.equal(error.code, 'SCHEMA_CREATED_VERIFICATION_FAILED');
    assert.equal(error.status, 'created_unverified');
    assert.equal(error.created, true); assert.equal(error.rolled_back, false);
    assert.match(error.message, /no rollback or DROP was attempted/);
    assert.ok(!error.message.includes('synthetic private metadata error'));
    return true;
  });
  assert.equal(db.state.created, 1);
  assert.ok(db.state.calls.every(call => !/ALTER|DROP/.test(call.sql)));
});

test('schema connection factory receives validated env directly and closes after read-only verification', async () => {
  const db = fakeSchemaDb({ exists: true });
  let seen;
  let stdout = '';
  assert.equal(await schema.main(['--verify'], ENV, { write: text => { stdout += text; } }, { createConnection: async config => { seen = config; return db; } }), 'verified');
  assert.deepEqual(seen, { host: ENV.DB_HOST, port: 3307, database: ENV.DB_NAME, user: ENV.DB_USER, password: '' });
  assert.equal(db.state.created, 0); assert.equal(db.state.ended, true);
  assert.match(stdout, /read-only metadata inspection/);
});

test('schema execution wrapper routes metadata and DDL only through a dedicated Sequelize instance', async () => {
  const driver = {};
  let args;
  let closed = false;
  const queries = [];
  class FakeSequelize {
    constructor(...received) { args = received; }
    async query(sql, options) { queries.push({ sql, options }); return [[], {}]; }
    async close() { closed = true; }
  }
  const db = schema.createSchemaConnection(ENV, { sequelize: { Sequelize: FakeSequelize }, mysql2: driver });
  assert.equal(args[0], ENV.DB_NAME); assert.equal(args[1], ENV.DB_USER); assert.equal(args[2], ENV.DB_PASS);
  assert.equal(args[3].host, ENV.DB_HOST); assert.equal(args[3].port, 3307);
  assert.equal(args[3].dialectModule, driver); assert.equal(args[3].timezone, '+09:00');
  await db.query('SELECT synthetic WHERE owner = ?', [7]);
  await db.query(schema.DDL);
  assert.deepEqual(queries[0], { sql: 'SELECT synthetic WHERE owner = ?', options: { replacements: [7] } });
  assert.equal(queries[1].sql, schema.DDL);
  await db.end(); assert.equal(closed, true);
});
