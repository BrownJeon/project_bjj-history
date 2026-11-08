#!/usr/bin/env node
// task-054: 참고 목록 → 사용자 기술트리 반영 도구. 기본은 오프라인 dry-run.
//
// dry-run (기본, DB 접속 없음):
//   node backend/scripts/task-054-reference-apply.js --user-id 3 --snapshot <snapshot.json> \
//     [--catalog <catalog.json>] [--coach-candidates <file>] [--out-json <file>] [--out-md <file>]
// 적용 (이번 task 에서는 실행하지 않음. 사용자 승인·DB 운영자 절차 필요):
//   ... --decisions <decisions.json> --apply --confirm-user <id> --plan-sha <sha> --backup <new file> [--log <file>]
//   + DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS 명시(dotenv·기본값 없음) + --confirm-database <DB_NAME>
//   백업은 <backup>.pre-write(쓰기 전) + <backup>(커밋 전) 두 파일, 각각0600·원자적 신규 생성.
//   두 경로는 모두 새 경로여야 한다. 기존 파일·심볼릭 링크는 덮어쓰지 않는다.
//   --log도 별도 신규0600 파일이다. 로그 실패는 committed_log_failed로 보고하며
//   이미 성공한 DB 커밋이나 백업을 롤백/실패로 표시하지 않는다.
// 복구:
//   ... --restore <backup.json> --apply --confirm-user <id> --confirm-database <DB_NAME> (+ DB_* 명시)
//   기존 기술에 붙인 미변경 참고 연결만 되돌린다. 신규 기술·그 연결은 이후 기록 보호를 위해
//   항상 보존하며, 기술 자체 정리가 필요하면 운영자가 별도 검토한다(완전 삭제 롤백 아님).
//
// 신규 행은 전용 Sequelize 연결의 바인딩 INSERT로 넣는다(POST·triggerAutoAnalysis 경유 없음).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadCatalog, LINK_TABLE, isMissingLinkTable } = require('../src/services/techniqueReference');
const core = require('../src/services/techniqueReferenceApply');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(REPO_ROOT, 'agent-vault/10-Flow/improvements/assets');
const DEFAULTS = Object.freeze({
  catalog: path.join(REPO_ROOT, 'backend/src/data/techniqueReference/catalog.json'),
  coachCandidates: path.join(ASSETS, 'IMP-0001-coach-candidates.json'),
});

const rel = file => path.relative(REPO_ROOT, file).split(path.sep).join('/');
const fileSha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function parseArgs(args) {
  const o = { catalog: DEFAULTS.catalog, coachCandidates: DEFAULTS.coachCandidates, apply: false };
  const takes = { '--user-id': 'userId', '--snapshot': 'snapshot', '--catalog': 'catalog', '--coach-candidates': 'coachCandidates', '--out-json': 'outJson', '--out-md': 'outMd', '--decisions': 'decisions', '--confirm-user': 'confirmUser', '--plan-sha': 'planSha', '--backup': 'backup', '--log': 'log', '--restore': 'restore', '--confirm-database': 'confirmDatabase' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--no-coach-candidates') o.coachCandidates = null;
    else if (takes[a]) { if (i + 1 >= args.length) throw new Error(`${a} needs a value`); o[takes[a]] = args[++i]; }
    else throw new Error(`unknown argument: ${a}`);
  }
  if (o.userId != null) { if (!/^\d+$/.test(o.userId)) throw new Error('--user-id must be a positive integer'); o.userId = Number(o.userId); }
  if (o.confirmUser != null && !/^\d+$/.test(o.confirmUser)) throw new Error('--confirm-user must be a positive integer');
  return o;
}

function makePlan(o) {
  if (!o.userId) throw new Error('--user-id is required');
  if (!o.snapshot) throw new Error('--snapshot <file> is required (offline input)');
  const catalogFile = path.resolve(o.catalog);
  const snapshotFile = path.resolve(o.snapshot);
  const coachFile = o.coachCandidates ? path.resolve(o.coachCandidates) : null;
  const inputs = {
    catalog: { path: rel(catalogFile), sha256: fileSha(catalogFile) },
    snapshot: { path: rel(snapshotFile), sha256: fileSha(snapshotFile) },
    coach_candidates: coachFile ? { path: rel(coachFile), sha256: fileSha(coachFile) } : null,
  };
  return core.buildPlan({
    catalog: loadCatalog(readJson(catalogFile)),
    snapshot: readJson(snapshotFile),
    userId: o.userId,
    coachCandidates: coachFile ? readJson(coachFile) : null,
    inputs,
  });
}

// ---- DB adapter (dedicated Sequelize, explicit env only). Not used by dry-run. ----
function explicitDbConfig(env) {
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS']) if (!Object.hasOwn(env, key)) throw new Error(`Explicit ${key} required (no dotenv/defaults)`);
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER']) {
    if (typeof env[key] !== 'string' || !env[key].trim() || env[key].trim() !== env[key]) throw new Error(`${key} must be a nonempty string without surrounding whitespace`);
  }
  if (!/^[1-9]\d*$/.test(env.DB_PORT) || Number(env.DB_PORT) > 65535) throw new Error('DB_PORT must be an integer from 1 to 65535');
  if (typeof env.DB_PASS !== 'string') throw new Error('DB_PASS must be explicitly provided as a string');
  return { host: env.DB_HOST, port: Number(env.DB_PORT), database: env.DB_NAME, username: env.DB_USER, password: env.DB_PASS };
}

function requireExplicitDb(o, env) {
  const config = explicitDbConfig(env);
  if (o.confirmDatabase !== config.database) throw new Error('--confirm-database <exact DB_NAME> required for any DB write');
  return config;
}

function createSequelizeAdapter(env, dependencies = {}) {
  const config = explicitDbConfig(env);
  const { Sequelize, QueryTypes } = dependencies.sequelize || require('sequelize');
  // 앱 singleton/config/models를 읽지 않는다. 검증한 env만 전용 연결 생성자에 전달한다.
  const sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host, port: config.port, dialect: 'mysql',
    dialectModule: dependencies.mysql2 || require('mysql2'), logging: false,
    timezone: '+09:00', pool: { max: 2, min: 0, acquire: 30000, idle: 10000 },
  });
  const TECH_FIELDS = ['id', 'user_id', 'name', 'category', 'note', 'pos', 'tags', 'links', 'starred'];
  return {
    close: () => sequelize.close(),
    transaction: fn => sequelize.transaction(async t => fn({
      lockUserTechniques: async userId => (await sequelize.query(`SELECT ${TECH_FIELDS.join(', ')} FROM techniques WHERE user_id = ? ORDER BY id FOR UPDATE`, { replacements: [userId], type: QueryTypes.SELECT, transaction: t }))
        .map(row => ({ ...row, starred: row.starred ? 1 : 0 })),
      linkStoreAvailable: async () => {
        try {
          await sequelize.query(`SELECT id FROM ${LINK_TABLE} LIMIT 0`, { type: QueryTypes.SELECT, transaction: t });
          return true;
        } catch (error) { if (isMissingLinkTable(error)) return false; throw error; }
      },
      lockUserLinks: userId => sequelize.query(`SELECT id, user_id, technique_id, technique_name_at_link, reference_slug, status, decided_at, note FROM ${LINK_TABLE} WHERE user_id = ? ORDER BY id FOR UPDATE`, { replacements: [userId], type: QueryTypes.SELECT, transaction: t }),
      insertTechnique: async row => {
        const fields = ['user_id', 'name', 'category', 'note', 'pos', 'tags', 'links', 'starred'];
        const [id] = await sequelize.query(`INSERT INTO techniques (${fields.join(', ')}, created_at) VALUES (${fields.map(() => '?').join(', ')}, ?)`, { replacements: [...fields.map(field => row[field]), new Date()], type: QueryTypes.INSERT, transaction: t });
        if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('technique insert returned no valid id');
        return Number(id);
      },
      insertLink: async row => {
        const [id] = await sequelize.query(`INSERT INTO ${LINK_TABLE} (user_id, technique_id, technique_name_at_link, reference_slug, status, decided_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)`, { replacements: [row.user_id, row.technique_id, row.technique_name_at_link, row.reference_slug, row.status, row.decided_at, row.note], type: QueryTypes.INSERT, transaction: t });
        if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('reference link insert returned no valid id');
        return Number(id);
      },
      deleteLink: (userId, id) => sequelize.query(`DELETE FROM ${LINK_TABLE} WHERE id = ? AND user_id = ?`, { replacements: [id, userId], type: QueryTypes.DELETE, transaction: t }),
    })),
  };
}

function writeNewFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// 최종 이름으로 rename하면 경쟁 중 생긴 파일을 덮을 수 있다. 같은 디렉터리의0600 임시 파일을
// fsync 후 hardlink로 공개한다. link는 대상 파일/심볼릭 링크가 있으면 EEXIST로 실패한다.
function writePrivateNewFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${crypto.randomBytes(16).toString('hex')}`);
  let fd;
  let created = false;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    created = true;
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, text);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.linkSync(tmp, file);
    // 파일 내용뿐 아니라 새 디렉터리 항목까지 내구성 확인 후 DB 쓰기/커밋으로 진행한다.
    const directory = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (created) try { fs.unlinkSync(tmp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function assertNewBackupPaths(file) {
  for (const candidate of [file, `${file}.pre-write`]) {
    try { fs.lstatSync(candidate); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error(`backup file already exists: ${candidate}`);
  }
}

// 존재하는 부모는 realpath로 고정하고 아직 없는 하위 경로만 덧붙인다.
// 경로의 './'·'../'·부모 심볼릭 링크 때문에 출력 두 개가 같은 파일을 가리키는 것을 막는다.
function canonicalOutputPath(file) {
  const absolute = path.resolve(file);
  let parent = path.dirname(absolute);
  const suffix = [path.basename(absolute)];
  while (true) {
    try { return path.join(fs.realpathSync(parent), ...suffix); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // 끊어진 부모 symlink를 아직 없는 디렉터리로 취급하지 않는다.
      try {
        if (fs.lstatSync(parent).isSymbolicLink()) throw new Error('output parent is a dangling symbolic link');
      } catch (inspection) { if (inspection.code !== 'ENOENT') throw inspection; }
      const next = path.dirname(parent);
      if (next === parent) throw error;
      suffix.unshift(path.basename(parent));
      parent = next;
    }
  }
}

function validateApplyOutputPaths({ backup, log }) {
  if (!backup) throw new Error('--backup <new file> required for apply');
  const backupFile = canonicalOutputPath(backup);
  const logFile = log ? canonicalOutputPath(log) : null;
  const outputs = [['--backup', backupFile], ['--backup pre-write', `${backupFile}.pre-write`]];
  if (logFile) outputs.push(['--log', logFile]);
  const seen = new Map();
  for (const [label, file] of outputs) {
    const normalized = process.platform === 'darwin' ? file.normalize('NFC').toLowerCase() : file;
    if (seen.has(normalized)) throw new Error(`output paths must be distinct: ${label} conflicts with ${seen.get(normalized)}`);
    seen.set(normalized, label);
  }
  assertNewBackupPaths(backupFile);
  if (logFile) {
    try { fs.lstatSync(logFile); }
    catch (error) { if (error.code === 'ENOENT') return { backupFile, logFile }; throw error; }
    throw new Error('log file already exists: choose a new --log path');
  }
  return { backupFile, logFile };
}

function createBackupWriter(file) {
  return backup => {
    const target = backup.status === 'pre-write' ? `${file}.pre-write` : backup.status === 'pre-commit' ? file : null;
    if (!target) throw new Error(`unsupported backup status: ${backup.status}`);
    writePrivateNewFile(target, `${JSON.stringify(backup, null, 2)}\n`);
  };
}

async function main(args = process.argv.slice(2), env = process.env, out = process.stdout, { createAdapter = createSequelizeAdapter } = {}) {
  const o = parseArgs(args);

  if (o.restore) {
    requireExplicitDb(o, env);
    const backup = readJson(path.resolve(o.restore));
    const adapter = createAdapter(env);
    try {
      const result = await core.restoreRun({ adapter, backup, flags: { apply: o.apply, confirmUser: o.confirmUser } });
      out.write(`${JSON.stringify(result, null, 2)}\n`);
      return result;
    } finally { await adapter.close(); }
  }

  const plan = makePlan(o);
  const wantsApply = o.apply || o.decisions || o.planSha || o.confirmUser != null;
  if (!wantsApply) {
    const json = `${JSON.stringify(plan, null, 2)}\n`;
    if (o.outJson) writeNewFile(path.resolve(o.outJson), json);
    if (o.outMd) writeNewFile(path.resolve(o.outMd), core.renderPlanMarkdown(plan));
    out.write(`DRY RUN: no DB connection, no writes. plan_sha ${plan.plan_sha}\n${JSON.stringify(plan.summary, null, 2)}\n`);
    return plan;
  }

  // apply path: every guard is checked before connecting
  const decisions = o.decisions ? readJson(path.resolve(o.decisions)) : null;
  core.checkApplyFlags({ plan, decisions, flags: { apply: o.apply, confirmUser: o.confirmUser, planSha: o.planSha } });
  core.validateDecisions(plan, decisions.decisions);
  const { backupFile, logFile } = validateApplyOutputPaths(o);
  requireExplicitDb(o, env);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '')}-${crypto.randomBytes(4).toString('hex')}`;
  const adapter = createAdapter(env);
  try {
    const result = await core.applyDecisions({
      adapter, plan, decisions, runId,
      flags: { apply: o.apply, confirmUser: o.confirmUser, planSha: o.planSha },
      writeBackup: createBackupWriter(backupFile),
    });
    // 트랜잭션이 정상적으로 반환된 뒤이므로 로그 발행 실패는 DB 롤백이 아니다.
    const receipt = { ...result, status: 'committed', backup: rel(backupFile), pre_write_backup: rel(`${backupFile}.pre-write`), finished_at: new Date().toISOString() };
    if (logFile) {
      receipt.log = { path: rel(logFile), status: 'written' };
      try { writePrivateNewFile(logFile, `${JSON.stringify(receipt, null, 2)}\n`); }
      catch (error) {
        receipt.status = 'committed_log_failed';
        receipt.log.status = 'failed';
        receipt.log.warning = 'DB 반영은 커밋됐고 백업은 유지됩니다. 선택한 로그 파일을 만들지 못했습니다. 재적용하지 말고 결과와 백업을 확인해 주세요.';
      }
    }
    out.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  } finally { await adapter.close(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); if (error.violations) console.error(JSON.stringify(error.violations)); process.exitCode = 1; });
module.exports = { parseArgs, makePlan, main, writePrivateNewFile, assertNewBackupPaths, createBackupWriter, canonicalOutputPath, validateApplyOutputPaths, explicitDbConfig, createSequelizeAdapter };
