#!/usr/bin/env node
// task-054 migration DRAFT. Same operator contract as task-051/052 schema scripts:
// - default: offline DDL preview only (no dotenv, no connection, no data access)
// - --verify: metadata-only information_schema inspection with explicit DB_* env
// - --apply: requires explicit DB_* env AND --confirm-database <exact DB_NAME>; creates only when absent,
//   refuses an existing incompatible table (no ALTER/DROP). Shared-DB application needs user approval.
// Not executed against any DB in task-054 implementation.
const TABLE = 'technique_reference_links';
const DDL = `CREATE TABLE technique_reference_links (
 id INT NOT NULL AUTO_INCREMENT,
 user_id INT NOT NULL,
 technique_id INT NOT NULL,
 technique_name_at_link VARCHAR(100) NOT NULL,
 reference_slug VARCHAR(100) NOT NULL,
 status ENUM('confirmed','rejected') NOT NULL,
 decided_at DATETIME NOT NULL,
 note TEXT NULL,
 PRIMARY KEY (id),
 UNIQUE KEY uq_tech_ref_link (user_id, technique_id, reference_slug),
 CONSTRAINT fk_tech_ref_link_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_tech_ref_link_technique FOREIGN KEY (technique_id) REFERENCES techniques(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const COLUMNS = {
  id: ['int', 'NO'], user_id: ['int', 'NO'], technique_id: ['int', 'NO'], technique_name_at_link: ['varchar', 'NO', 100], reference_slug: ['varchar', 'NO', 100],
  status: ['enum', 'NO'], decided_at: ['datetime', 'NO'], note: ['text', 'YES'],
};

async function parentErrors(db, database) {
  const [parents] = await db.query("SELECT c.TABLE_NAME,c.COLUMN_TYPE,t.ENGINE FROM information_schema.COLUMNS c JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME WHERE c.TABLE_SCHEMA=? AND c.TABLE_NAME IN ('users','techniques') AND c.COLUMN_NAME='id'", [database]);
  const errors = [];
  for (const table of ['users', 'techniques']) {
    const rows = parents.filter(row => row.TABLE_NAME === table);
    if (rows.length !== 1 || !/^int(?:\(\d+\))?$/i.test(rows[0].COLUMN_TYPE) || rows[0].ENGINE !== 'InnoDB') errors.push(`${table}.id must be signed INT in InnoDB`);
  }
  return errors;
}

async function inspect(db, database) {
  const [tables] = await db.query('SELECT ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [database, TABLE]);
  if (!tables.length) return { exists: false, errors: [] };
  const errors = [];
  if (tables[0].ENGINE !== 'InnoDB' || !String(tables[0].TABLE_COLLATION).startsWith('utf8mb4_')) errors.push('InnoDB/utf8mb4 required');
  const [columns] = await db.query('SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, CHARACTER_SET_NAME, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [database, TABLE]);
  const byName = new Map(columns.map(c => [c.COLUMN_NAME, c]));
  for (const [name, [type, nullable, length]] of Object.entries(COLUMNS)) {
    const c = byName.get(name);
    if (!c || c.DATA_TYPE !== type || c.IS_NULLABLE !== nullable || (length && Number(c.CHARACTER_MAXIMUM_LENGTH) !== length)
      || (type === 'int' && /unsigned/i.test(c.COLUMN_TYPE))
      || (['text', 'varchar', 'enum'].includes(type) && c.CHARACTER_SET_NAME !== 'utf8mb4')) errors.push(`incompatible column: ${name}`);
  }
  if (byName.get('status') && byName.get('status').COLUMN_TYPE.replace(/\s/g, '') !== "enum('confirmed','rejected')") errors.push("status must be enum('confirmed','rejected')");
  if (!byName.get('id')?.EXTRA.includes('auto_increment')) errors.push('id auto_increment required');
  const [indexes] = await db.query('SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY INDEX_NAME, SEQ_IN_INDEX', [database, TABLE]);
  const indexMap = new Map();
  for (const i of indexes) { if (!indexMap.has(i.INDEX_NAME)) indexMap.set(i.INDEX_NAME, { unique: Number(i.NON_UNIQUE) === 0, cols: [] }); indexMap.get(i.INDEX_NAME).cols.push(i.COLUMN_NAME); }
  if (indexMap.get('PRIMARY')?.cols.join(',') !== 'id') errors.push('primary key id required');
  if (![...indexMap.values()].some(v => v.unique && v.cols.join(',') === 'user_id,technique_id,reference_slug')) errors.push('unique (user_id, technique_id, reference_slug) required');
  const [fks] = await db.query('SELECT k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=? AND k.TABLE_NAME=?', [database, TABLE]);
  if (!fks.some(f => f.COLUMN_NAME === 'user_id' && f.REFERENCED_TABLE_NAME === 'users' && f.REFERENCED_COLUMN_NAME === 'id' && f.DELETE_RULE === 'CASCADE')) errors.push('users(id) owner FK cascade required');
  if (!fks.some(f => f.COLUMN_NAME === 'technique_id' && f.REFERENCED_TABLE_NAME === 'techniques' && f.REFERENCED_COLUMN_NAME === 'id' && f.DELETE_RULE === 'CASCADE')) errors.push('techniques(id) reference FK cascade required');
  errors.push(...await parentErrors(db, database));
  return { exists: true, errors };
}

async function apply(db, database) {
  const before = await inspect(db, database);
  if (before.exists) { if (before.errors.length) throw new Error(before.errors.join('; ')); return 'already-compatible'; }
  const parentProblems = await parentErrors(db, database);
  if (parentProblems.length) throw new Error(`${parentProblems.join('; ')}; no schema changed`);
  await db.query(DDL);
  // CREATE TABLE은 implicit commit이다. 이후 검증 실패를 rollback으로 표시하거나 DROP하지 않는다.
  try {
    const after = await inspect(db, database);
    if (!after.exists || after.errors.length) throw new Error('created schema did not pass metadata checks');
  } catch (cause) {
    const error = new Error('schema created but verification failed; no rollback or DROP was attempted; operator inspection required');
    error.code = 'SCHEMA_CREATED_VERIFICATION_FAILED';
    error.status = 'created_unverified';
    error.created = true;
    error.rolled_back = false;
    throw error;
  }
  return 'created-and-verified';
}

function explicitDbConfig(env) {
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS']) if (!Object.hasOwn(env, key)) throw new Error(`Explicit ${key} required (no dotenv/defaults)`);
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER']) if (typeof env[key] !== 'string' || !env[key].trim() || env[key].trim() !== env[key]) throw new Error(`${key} must be a nonempty string without surrounding whitespace`);
  if (!/^[1-9]\d*$/.test(env.DB_PORT) || Number(env.DB_PORT) > 65535) throw new Error('DB_PORT must be an integer from 1 to 65535');
  if (typeof env.DB_PASS !== 'string') throw new Error('DB_PASS must be explicitly provided as a string');
  return { host: env.DB_HOST, port: Number(env.DB_PORT), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASS };
}

function createSchemaConnection(env, dependencies = {}) {
  const config = explicitDbConfig(env);
  const { Sequelize } = dependencies.sequelize || require('sequelize');
  const sequelize = new Sequelize(config.database, config.user, config.password, {
    host: config.host, port: config.port, dialect: 'mysql',
    dialectModule: dependencies.mysql2 || require('mysql2'), logging: false,
    timezone: '+09:00', pool: { max: 2, min: 0, acquire: 30000, idle: 10000 },
  });
  return {
    query: (sql, replacements) => sequelize.query(sql, { replacements }),
    end: () => sequelize.close(),
  };
}

async function main(args = process.argv.slice(2), env = process.env, out = process.stdout, { createConnection } = {}) {
  const applyMode = args.includes('--apply');
  const verifyMode = args.includes('--verify');
  if (applyMode && verifyMode) throw new Error('Choose --apply or --verify');
  if (!applyMode && !verifyMode) { out.write(`-- DRY RUN: no connection, no data access\n${DDL};\n`); return 'dry-run'; }
  const config = explicitDbConfig(env);
  const confirmAt = args.indexOf('--confirm-database');
  if (applyMode && (confirmAt < 0 || args[confirmAt + 1] !== env.DB_NAME)) throw new Error('--apply requires --confirm-database <exact DB_NAME> and a DDL-capable operator account');
  const db = createConnection ? await createConnection(config) : createSchemaConnection(env);
  try {
    if (applyMode) { const result = await apply(db, env.DB_NAME); out.write(`${result}\n`); return result; }
    const result = await inspect(db, env.DB_NAME);
    if (!result.exists || result.errors.length) throw new Error(`schema not ready: ${result.errors.join('; ') || 'missing table'}`);
    out.write('schema-verified (read-only metadata inspection)\n');
    return 'verified';
  } finally { await db.end(); }
}
if (require.main === module) main().catch(error => {
  if (error.code === 'SCHEMA_CREATED_VERIFICATION_FAILED') console.error(JSON.stringify({ code: error.code, status: error.status, created: error.created, rolled_back: error.rolled_back, message: error.message }));
  else console.error(error.message);
  process.exitCode = 1;
});
module.exports = { TABLE, DDL, COLUMNS, inspect, apply, main, explicitDbConfig, createSchemaConnection };
