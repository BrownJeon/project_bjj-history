#!/usr/bin/env node
// Deliberately does not load dotenv, bootstrap the app, sync(), or migrate other tables.
const DEFINITIONS = {
  character_bases: {
    columns: {
      id: 'INT NOT NULL AUTO_INCREMENT', base_key: 'VARCHAR(80) NOT NULL',
      label: 'VARCHAR(120) NOT NULL', body_spec: 'TEXT NOT NULL', stage: 'VARCHAR(32) NOT NULL',
      model_path: 'TEXT NULL', rig_path: 'TEXT NULL', approval: 'TEXT NOT NULL', created_at: 'DATETIME NOT NULL',
    },
    indexes: { PRIMARY: ['id'], uq_cb_key: ['base_key'] },
    fks: {}, checks: {},
  },
  character_skins: {
    columns: {
      id: 'INT NOT NULL AUTO_INCREMENT', base_id: 'INT NOT NULL', skin_key: 'VARCHAR(80) NOT NULL',
      version_no: 'INT NOT NULL', label: 'VARCHAR(120) NOT NULL', appearance: 'TEXT NOT NULL',
      approval: 'TEXT NOT NULL', created_at: 'DATETIME NOT NULL',
    },
    indexes: { PRIMARY: ['id'], uq_cs_version: ['base_id', 'skin_key', 'version_no'], uq_cs_base_id: ['base_id', 'id'] },
    fks: { fk_cs_base: [['base_id'], 'character_bases', ['id']] },
    checks: { ck_cs_version: 'version_no > 0' },
  },
  character_assets: {
    columns: {
      id: 'INT NOT NULL AUTO_INCREMENT', base_id: 'INT NOT NULL', asset_key: 'VARCHAR(255) NOT NULL',
      binding_kind: 'VARCHAR(8) NOT NULL', skin_id: 'INT NULL', actor_a_skin_id: 'INT NULL', actor_b_skin_id: 'INT NULL',
      kind: 'VARCHAR(32) NOT NULL', mime_type: 'VARCHAR(64) NOT NULL', byte_length: 'INT NOT NULL',
      sha256: 'CHAR(64) NOT NULL', payload: 'LONGBLOB NOT NULL', source_path: 'VARCHAR(255) NOT NULL',
      context: 'TEXT NOT NULL', created_at: 'DATETIME NOT NULL',
    },
    indexes: { PRIMARY: ['id'], uq_ca_key: ['base_id', 'asset_key'] },
    fks: {
      fk_ca_base: [['base_id'], 'character_bases', ['id']],
      fk_ca_skin: [['base_id', 'skin_id'], 'character_skins', ['base_id', 'id']],
      fk_ca_actor_a: [['base_id', 'actor_a_skin_id'], 'character_skins', ['base_id', 'id']],
      fk_ca_actor_b: [['base_id', 'actor_b_skin_id'], 'character_skins', ['base_id', 'id']],
    },
    checks: {
      ck_ca_binding: "(binding_kind = 'skin' AND skin_id IS NOT NULL AND actor_a_skin_id IS NULL AND actor_b_skin_id IS NULL) OR (binding_kind = 'pair' AND skin_id IS NULL AND actor_a_skin_id IS NOT NULL AND actor_b_skin_id IS NOT NULL)",
      ck_ca_length: 'byte_length > 0 AND byte_length = OCTET_LENGTH(payload)',
      ck_ca_sha: "sha256 REGEXP '^[0-9a-f]{64}$'",
    },
  },
};
const TABLES = Object.keys(DEFINITIONS);
const quoted = names => names.map(name => '`' + name + '`').join(',');
const DDL = Object.fromEntries(TABLES.map(table => {
  const d = DEFINITIONS[table];
  const clauses = Object.entries(d.columns).map(([name, definition]) => '`' + name + '` ' + definition);
  for (const [name, columns] of Object.entries(d.indexes)) clauses.push(name === 'PRIMARY' ? `PRIMARY KEY (${quoted(columns)})` : `UNIQUE KEY ${name} (${quoted(columns)})`);
  for (const [name, [columns, parent, references]] of Object.entries(d.fks)) clauses.push(`CONSTRAINT ${name} FOREIGN KEY (${quoted(columns)}) REFERENCES ${parent} (${quoted(references)}) ON DELETE RESTRICT ON UPDATE RESTRICT`);
  for (const [name, condition] of Object.entries(d.checks)) clauses.push(`CONSTRAINT ${name} CHECK (${condition})`);
  return [table, `CREATE TABLE ${table} (\n ${clauses.join(',\n ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`];
}));

function safeError(message) { const error = new Error(message); error.safeMessage = message; return error; }
function normalizeCheck(value) {
  // Preserve literal bytes and boolean precedence. MariaDB removes redundant
  // parentheses around AND branches when it renders information_schema CHECKs.
  const lexer = /\s+|'(?:''|\\.|[^'\\])*'|`(?:``|[^`])*`|[a-zA-Z_][a-zA-Z_0-9]*|[0-9]+|<>|!=|<=|>=|[(),=><+*/.\-]/gy;
  const tokens = [];
  let offset = 0;
  while (offset < value.length) {
    lexer.lastIndex = offset;
    const match = lexer.exec(value);
    if (!match) throw safeError('Unsupported existing CHECK expression; no schema changed');
    offset = lexer.lastIndex;
    const token = match[0];
    if (/^\s+$/.test(token)) continue;
    tokens.push(token.startsWith("'") ? token : token.replace(/^`|`$/g, '').toLowerCase().replace(/^octet_length$/, 'length'));
  }
  function expression(parts) {
    while (parts[0] === '(' && parts.at(-1) === ')') {
      let depth = 0; let enclosed = true;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] === '(') depth++;
        if (parts[i] === ')') depth--;
        if (depth === 0 && i !== parts.length - 1) { enclosed = false; break; }
      }
      if (!enclosed || depth !== 0) break;
      parts = parts.slice(1, -1);
    }
    // OR binds less tightly than AND. Split only at depth zero; quoted tokens
    // and function-call parentheses remain intact atoms. Unknown syntax cannot
    // match any expected atom, and consequently fails schema compatibility.
    for (const operator of ['or', 'and']) {
      let depth = 0; let start = 0; const branches = [];
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] === '(') depth++;
        if (parts[i] === ')') depth--;
        if (parts[i] === operator && depth === 0) { branches.push(parts.slice(start, i)); start = i + 1; }
        if (depth < 0) throw safeError('Unbalanced CHECK expression');
      }
      if (depth !== 0) throw safeError('Unbalanced CHECK expression');
      if (branches.length) {
        branches.push(parts.slice(start));
        if (branches.some(branch => !branch.length)) throw safeError('Empty CHECK branch');
        return [operator, ...branches.map(expression)];
      }
    }
    if (!parts.length) throw safeError('Empty CHECK expression');
    return ['atom', ...parts];
  }
  return JSON.stringify(expression(tokens));
}
async function inspect(db, database) {
  const [current] = await db.query('SELECT DATABASE() AS db, @@max_allowed_packet AS max_allowed_packet, @@check_constraint_checks AS checks_enabled, @@foreign_key_checks AS fks_enabled');
  if (current[0].db !== database) throw safeError('Connected database does not match the confirmed target');
  const tables = [];
  for (const table of TABLES) {
    const definition = DEFINITIONS[table];
    const [metadata] = await db.query('SELECT ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [database, table]);
    const errors = [];
    if (!metadata.length) { tables.push({ table, exists: false, errors }); continue; }
    if (metadata[0].ENGINE !== 'InnoDB' || metadata[0].TABLE_COLLATION !== 'utf8mb4_bin') errors.push('InnoDB/utf8mb4_bin required');
    const [columns] = await db.query('SELECT COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,CHARACTER_MAXIMUM_LENGTH,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [database, table]);
    if (columns.length !== Object.keys(definition.columns).length) errors.push('Unexpected column count');
    for (const [name, spec] of Object.entries(definition.columns)) {
      const column = columns.find(c => c.COLUMN_NAME === name);
      const type = spec.split(/[ (]/)[0].toLowerCase();
      const length = /^(?:VAR)?CHAR\((\d+)\)/.exec(spec)?.[1];
      if (!column || column.DATA_TYPE !== type || column.IS_NULLABLE !== (spec.includes('NOT NULL') ? 'NO' : 'YES') || /unsigned/i.test(column.COLUMN_TYPE) || (length && Number(column.CHARACTER_MAXIMUM_LENGTH) !== Number(length)) || (['varchar', 'char', 'text'].includes(type) && (column.CHARACTER_SET_NAME !== 'utf8mb4' || column.COLLATION_NAME !== 'utf8mb4_bin')) || (name === 'id' && !column.EXTRA.includes('auto_increment')) || (name !== 'id' && column.EXTRA)) errors.push(`Incompatible column ${name}`);
    }
    const [indexes] = await db.query('SELECT INDEX_NAME,SEQ_IN_INDEX,COLUMN_NAME,NON_UNIQUE,SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY INDEX_NAME,SEQ_IN_INDEX', [database, table]);
    for (const [name, names] of Object.entries(definition.indexes)) {
      const rows = indexes.filter(i => i.INDEX_NAME === name);
      if (rows.map(i => i.COLUMN_NAME).join(',') !== names.join(',') || rows.some(i => Number(i.NON_UNIQUE) !== 0 || i.SUB_PART != null)) errors.push(`Missing/incompatible unique index ${name}`);
    }
    const [fks] = await db.query('SELECT k.CONSTRAINT_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_SCHEMA,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.DELETE_RULE,r.UPDATE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=? AND k.TABLE_NAME=? ORDER BY k.CONSTRAINT_NAME,k.ORDINAL_POSITION', [database, table]);
    if (new Set(fks.map(f => f.CONSTRAINT_NAME)).size !== Object.keys(definition.fks).length) errors.push('Unexpected FK count');
    for (const [name, [names, parent, references]] of Object.entries(definition.fks)) {
      const rows = fks.filter(f => f.CONSTRAINT_NAME === name);
      if (rows.map(f => f.COLUMN_NAME).join(',') !== names.join(',') || rows.map(f => f.REFERENCED_COLUMN_NAME).join(',') !== references.join(',') || rows.some(f => f.REFERENCED_TABLE_SCHEMA !== database || f.REFERENCED_TABLE_NAME !== parent || f.DELETE_RULE !== 'RESTRICT' || f.UPDATE_RULE !== 'RESTRICT')) errors.push(`Missing/incompatible FK ${name}`);
    }
    const [checks] = await db.query('SELECT CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME=?', [database, table]);
    for (const [name, condition] of Object.entries(definition.checks)) if (!checks.some(c => c.CONSTRAINT_NAME === name && normalizeCheck(c.CHECK_CLAUSE) === normalizeCheck(condition))) errors.push(`Missing/incompatible CHECK ${name}`);
    tables.push({ table, exists: true, errors });
  }
  return { database, max_allowed_packet: Number(current[0].max_allowed_packet), checks_enabled: Number(current[0].checks_enabled) === 1, fks_enabled: Number(current[0].fks_enabled) === 1, tables };
}
function assertCompatible(state, requireAll = true) {
  const errors = state.tables.flatMap(t => [...t.errors.map(e => `${t.table}: ${e}`), ...(requireAll && !t.exists ? [`${t.table}: missing`] : [])]);
  if (!state.checks_enabled) errors.push('CHECK enforcement must be enabled');
  if (!state.fks_enabled) errors.push('FK enforcement must be enabled');
  if (errors.length) throw safeError(errors.join('; '));
}
async function apply(db, database, progress = () => {}) {
  const [lock] = await db.query("SELECT GET_LOCK('task-055-character-schema', 10) AS acquired");
  if (Number(lock[0].acquired) !== 1) throw safeError('Schema operation is already running');
  const created = [];
  try {
    const before = await inspect(db, database);
    assertCompatible(before, false); // Inspect ALL existing tables before the first DDL.
    for (const table of TABLES) if (!before.tables.find(t => t.table === table).exists) {
      await db.query(DDL[table]);
      created.push(table); progress({ created: table }); // DDL is not transactional.
    }
    const after = await inspect(db, database); assertCompatible(after);
    return { created, state: after };
  } catch (error) { error.createdTables = created; throw error; }
  finally { await db.query("SELECT RELEASE_LOCK('task-055-character-schema')"); }
}
function parseArgs(args, allowed) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!Object.hasOwn(allowed, arg) || Object.hasOwn(options, arg)) throw safeError('Unknown or repeated option');
    options[arg] = allowed[arg] ? args[++i] : true;
    if (allowed[arg] && (!options[arg] || options[arg].startsWith('--'))) throw safeError(`Value required for ${arg}`);
  }
  return options;
}
function requireEnvironment(env, options) {
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS']) if (!Object.hasOwn(env, key) || (key !== 'DB_PASS' && !env[key])) throw safeError(`Explicit ${key} required; no dotenv/default target`);
  if (options['--apply'] && options['--confirm-database'] !== env.DB_NAME) throw safeError('--apply requires --confirm-database <exact DB_NAME>');
  if (!Number.isInteger(Number(env.DB_PORT)) || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535) throw safeError('Invalid DB_PORT');
}
async function connect(env) {
  return require('mysql2/promise').createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASS, connectTimeout: 10000, multipleStatements: false });
}
async function main(args = process.argv.slice(2), env = process.env) {
  const options = parseArgs(args, { '--apply': false, '--verify': false, '--confirm-database': true });
  if (options['--apply'] && options['--verify']) throw safeError('Choose --apply or --verify');
  if (!options['--apply'] && !options['--verify']) { console.log('-- OFFLINE DRY RUN: no connection, no writes\n' + Object.values(DDL).join(';\n') + ';'); return; }
  requireEnvironment(env, options);
  const db = await connect(env);
  try {
    if (options['--apply']) console.log(JSON.stringify(await apply(db, env.DB_NAME, value => console.log(JSON.stringify(value)))));
    else { const state = await inspect(db, env.DB_NAME); assertCompatible(state); console.log(JSON.stringify(state)); }
  } finally { await db.end(); }
}
function reportError(error) { console.error(JSON.stringify({ error: error.safeMessage || error.original?.code || error.code || error.name, createdTables: error.createdTables || [] })); process.exitCode = 1; }
if (require.main === module) main().catch(reportError);
module.exports = { DEFINITIONS, TABLES, DDL, normalizeCheck, inspect, assertCompatible, apply, parseArgs, requireEnvironment, connect, safeError, main, reportError };
