#!/usr/bin/env node
// Explicit additive migration only. No dotenv, bootstrap, connection, or writes in dry-run mode.
const baseSchema = require('./task-051-feedback-schema');
const TABLE = 'feedback_records';
const ADDITIONS = Object.freeze({
  starred: 'TINYINT(1) NOT NULL DEFAULT 0',
  situation_options: 'TEXT NULL',
  situation_other: 'TEXT NULL',
});
const names = Object.keys(ADDITIONS);
const alter = columns => `ALTER TABLE ${TABLE} ${columns.map(name => `ADD COLUMN ${name} ${ADDITIONS[name]}`).join(', ')}`;
const DDL = alter(names);

async function inspect(db, database) {
  const base = await baseSchema.inspect(db, database);
  const errors = [...base.errors];
  if (!base.exists) return { exists: false, missing: names, errors: ['task-051 feedback schema must exist first', ...errors] };
  const [columns] = await db.query('SELECT COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME IN (?,?,?)', [database, TABLE, ...names]);
  const byName = new Map(columns.map(column => [column.COLUMN_NAME, column]));
  for (const name of names) {
    const column = byName.get(name);
    if (!column) continue;
    const compatible = name === 'starred'
      ? column.DATA_TYPE === 'tinyint' && !/unsigned/i.test(column.COLUMN_TYPE) && column.IS_NULLABLE === 'NO' && String(column.COLUMN_DEFAULT) === '0'
      : column.DATA_TYPE === 'text' && column.IS_NULLABLE === 'YES' && column.CHARACTER_SET_NAME === 'utf8mb4' && [null, 'NULL'].includes(column.COLUMN_DEFAULT);
    if (!compatible) errors.push(`incompatible ${name} column: expected ${ADDITIONS[name]}`);
  }
  return { exists: true, missing: names.filter(name => !byName.has(name)), errors };
}

async function apply(db, database) {
  const before = await inspect(db, database);
  if (before.errors.length) throw new Error(before.errors.join('; '));
  if (!before.missing.length) return 'already-compatible';
  await db.query(alter(before.missing));
  const after = await inspect(db, database);
  if (after.missing.length || after.errors.length) throw new Error(`schema validation failed: ${[...after.errors, ...after.missing.map(name => `missing ${name}`)].join('; ')}`);
  return 'added-columns-and-verified';
}

async function main(args = process.argv.slice(2), env = process.env) {
  const applyMode = args.includes('--apply');
  const verifyMode = args.includes('--verify');
  if (applyMode && verifyMode) throw new Error('Choose --apply or --verify');
  if (!applyMode && !verifyMode) { process.stdout.write(`-- DRY RUN: no connection, no data access\n${DDL};\n`); return; }
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS']) if (!Object.hasOwn(env, key)) throw new Error(`Explicit ${key} required (no dotenv/defaults)`);
  const confirmAt = args.indexOf('--confirm-database');
  if (applyMode && (confirmAt < 0 || args[confirmAt + 1] !== env.DB_NAME)) throw new Error('--apply requires --confirm-database <exact DB_NAME> and a DDL-capable operator account');
  const db = await require('mysql2/promise').createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASS });
  try {
    if (applyMode) process.stdout.write(`${await apply(db, env.DB_NAME)}\n`);
    else {
      const result = await inspect(db, env.DB_NAME);
      if (!result.exists || result.missing.length || result.errors.length) throw new Error(`schema not ready: ${[...result.errors, ...result.missing.map(name => `missing ${name}`)].join('; ')}`);
      process.stdout.write('schema-verified (read-only metadata inspection)\n');
    }
  } finally { await db.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { TABLE, DDL, ADDITIONS, inspect, apply, main };
