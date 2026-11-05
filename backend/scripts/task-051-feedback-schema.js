#!/usr/bin/env node
// No dotenv and no application bootstrap. Default is offline SQL preview.
const TABLE = 'feedback_records';
const DDL = `CREATE TABLE feedback_records (
 id INT NOT NULL AUTO_INCREMENT,
 user_id INT NOT NULL,
 date DATE NOT NULL,
 situation TEXT NOT NULL,
 technique VARCHAR(200) NOT NULL DEFAULT '',
 original LONGTEXT NOT NULL,
 clip_ids TEXT NOT NULL,
 dialogue LONGTEXT NOT NULL,
 results LONGTEXT NOT NULL,
 summary LONGTEXT NULL,
 task_binding TEXT NULL,
 summary_hash VARCHAR(64) NULL,
 revision INT NOT NULL DEFAULT 1,
 ai_status VARCHAR(16) NOT NULL DEFAULT 'idle',
 ai_kind VARCHAR(16) NULL,
 ai_token VARCHAR(36) NULL,
 ai_started_at DATETIME NULL,
 ai_error TEXT NULL,
 created_at DATETIME NOT NULL,
 updated_at DATETIME NOT NULL,
 PRIMARY KEY (id),
 KEY idx_feedback_user_date (user_id, date, id),
 CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const COLUMNS = {
 id: ['int', 'NO'], user_id: ['int', 'NO'], date: ['date', 'NO'], situation: ['text', 'NO'], technique: ['varchar', 'NO', 200], original: ['longtext', 'NO'], clip_ids: ['text', 'NO'], dialogue: ['longtext', 'NO'], results: ['longtext', 'NO'], summary: ['longtext', 'YES'], task_binding: ['text', 'YES'], summary_hash: ['varchar', 'YES', 64], revision: ['int', 'NO'], ai_status: ['varchar', 'NO', 16], ai_kind: ['varchar', 'YES', 16], ai_token: ['varchar', 'YES', 36], ai_started_at: ['datetime', 'YES'], ai_error: ['text', 'YES'], created_at: ['datetime', 'NO'], updated_at: ['datetime', 'NO'],
};
async function inspect(db, database) {
  const [tables] = await db.query('SELECT ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [database, TABLE]);
  if (!tables.length) return { exists: false, errors: [] };
  const errors = [];
  if (tables[0].ENGINE !== 'InnoDB' || !String(tables[0].TABLE_COLLATION).startsWith('utf8mb4_')) errors.push('InnoDB/utf8mb4 required');
  const [columns] = await db.query('SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, CHARACTER_SET_NAME, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [database, TABLE]);
  const byName = new Map(columns.map(c => [c.COLUMN_NAME, c]));
  for (const [name, [type, nullable, length]] of Object.entries(COLUMNS)) {
    const c = byName.get(name);
    if (!c || c.DATA_TYPE !== type || c.IS_NULLABLE !== nullable || (length && Number(c.CHARACTER_MAXIMUM_LENGTH) !== length) || (type === 'int' && /unsigned/i.test(c.COLUMN_TYPE)) || (['text','longtext','varchar'].includes(type) && c.CHARACTER_SET_NAME !== 'utf8mb4')) errors.push(`incompatible column: ${name}`);
  }
  if (!byName.get('id')?.EXTRA.includes('auto_increment')) errors.push('id auto_increment required');
  const [indexes] = await db.query('SELECT INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY INDEX_NAME, SEQ_IN_INDEX', [database, TABLE]);
  const indexMap = new Map();
  for (const i of indexes) { if (!indexMap.has(i.INDEX_NAME)) indexMap.set(i.INDEX_NAME, []); indexMap.get(i.INDEX_NAME).push(i.COLUMN_NAME); }
  if (String(indexMap.get('PRIMARY')) !== 'id') errors.push('primary key id required');
  if (![...indexMap.values()].some(v => v.join(',') === 'user_id,date,id')) errors.push('owner/date/id index required');
  const [fks] = await db.query('SELECT k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=? AND k.TABLE_NAME=?', [database, TABLE]);
  if (!fks.some(f => f.COLUMN_NAME === 'user_id' && f.REFERENCED_TABLE_NAME === 'users' && f.REFERENCED_COLUMN_NAME === 'id' && f.DELETE_RULE === 'CASCADE')) errors.push('users(id) owner FK cascade required');
  return { exists: true, errors };
}
async function apply(db, database) {
  const before = await inspect(db, database);
  if (before.exists) { if (before.errors.length) throw new Error(before.errors.join('; ')); return 'already-compatible'; }
  const [owners] = await db.query("SELECT c.COLUMN_TYPE,t.ENGINE FROM information_schema.COLUMNS c JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME WHERE c.TABLE_SCHEMA=? AND c.TABLE_NAME='users' AND c.COLUMN_NAME='id'", [database]);
  if (owners.length !== 1 || !/^int(?:\(\d+\))?$/i.test(owners[0].COLUMN_TYPE) || owners[0].ENGINE !== 'InnoDB') throw new Error('users.id must be signed INT in InnoDB; no schema changed');
  await db.query(DDL);
  const after = await inspect(db, database);
  if (!after.exists || after.errors.length) throw new Error(`schema validation failed: ${after.errors.join('; ')}`);
  return 'created-and-verified';
}
async function main(args = process.argv.slice(2), env = process.env) {
  const applyMode = args.includes('--apply');
  const verifyMode = args.includes('--verify');
  if (applyMode && verifyMode) throw new Error('Choose --apply or --verify');
  if (!applyMode && !verifyMode) { process.stdout.write(`-- DRY RUN: no connection, no data access\n${DDL};\n`); return; }
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS']) if (!Object.hasOwn(env, key)) throw new Error(`Explicit ${key} required (no dotenv/defaults)`);
  if (applyMode && args[args.indexOf('--confirm-database') + 1] !== env.DB_NAME) throw new Error('--apply requires --confirm-database <exact DB_NAME> and a DDL-capable operator account');
  const db = await require('mysql2/promise').createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASS });
  try {
    if (applyMode) process.stdout.write(`${await apply(db, env.DB_NAME)}\n`);
    else { const result = await inspect(db, env.DB_NAME); if (!result.exists || result.errors.length) throw new Error(`schema not ready: ${result.errors.join('; ') || 'missing table'}`); process.stdout.write('schema-verified (read-only metadata inspection)\n'); }
  } finally { await db.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { TABLE, DDL, COLUMNS, inspect, apply, main };
