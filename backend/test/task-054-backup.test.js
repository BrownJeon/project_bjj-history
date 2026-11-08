// Private backup publication uses only temporary synthetic data; no DB or personal snapshots.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writePrivateNewFile, assertNewBackupPaths, createBackupWriter, canonicalOutputPath, validateApplyOutputPaths } = require('../scripts/task-054-reference-apply');

function temporary(testBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task054-private-backup-'));
  try { testBody(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('private backup publication produces a complete 0600 file and leaves no temporary names', () => temporary(dir => {
  const file = path.join(dir, 'new-directory', 'backup.json');
  writePrivateNewFile(file, '{"synthetic":true}\n');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"synthetic":true}\n');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['backup.json']);
}));

test('private backup publication refuses an existing file without modifying its bytes or permissions', () => temporary(dir => {
  const file = path.join(dir, 'backup.json');
  fs.writeFileSync(file, 'existing synthetic backup');
  fs.chmodSync(file, 0o640);
  assert.throws(() => writePrivateNewFile(file, 'replacement'), e => e.code === 'EEXIST');
  assert.equal(fs.readFileSync(file, 'utf8'), 'existing synthetic backup');
  assert.equal(fs.statSync(file).mode & 0o777, 0o640);
  assert.deepEqual(fs.readdirSync(dir), ['backup.json']);
}));

test('existing and dangling destination symlinks are refused and never followed', () => temporary(dir => {
  const target = path.join(dir, 'target.json');
  fs.writeFileSync(target, 'synthetic target');
  for (const [name, dest] of [['backup.json', target], ['dangling.json', path.join(dir, 'missing.json')]]) {
    const file = path.join(dir, name);
    fs.symlinkSync(dest, file);
    assert.throws(() => assertNewBackupPaths(file), /backup file already exists/);
    assert.throws(() => writePrivateNewFile(file, 'replacement'), e => e.code === 'EEXIST');
    assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(file), dest);
  }
  assert.equal(fs.readFileSync(target, 'utf8'), 'synthetic target');
  assert.equal(fs.existsSync(path.join(dir, 'missing.json')), false);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['backup.json', 'dangling.json', 'target.json']);
}));

test('failed exclusive publication cleans its temporary file and preserves the destination directory', () => temporary(dir => {
  const target = path.join(dir, 'directory-at-destination');
  fs.mkdirSync(target);
  assert.throws(() => writePrivateNewFile(target, 'synthetic'), e => e.code === 'EEXIST');
  assert.equal(fs.statSync(target).isDirectory(), true);
  assert.deepEqual(fs.readdirSync(dir), ['directory-at-destination']);
}));

test('exclusive temporary-name collision never deletes or overwrites a file this writer did not create', t => temporary(dir => {
  const fixed = Buffer.alloc(16, 7);
  t.mock.method(require('crypto'), 'randomBytes', () => fixed);
  const file = path.join(dir, 'backup.json');
  const tmp = path.join(dir, `.backup.json.tmp-${fixed.toString('hex')}`);
  fs.writeFileSync(tmp, 'another synthetic temporary file');
  assert.throws(() => writePrivateNewFile(file, 'replacement'), e => e.code === 'EEXIST');
  assert.equal(fs.readFileSync(tmp, 'utf8'), 'another synthetic temporary file');
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(fs.readdirSync(dir), [path.basename(tmp)]);
}));

test('both backup phases remain private and immutable; either existing phase fails the preconnection check', () => temporary(dir => {
  const file = path.join(dir, 'backup.json');
  assertNewBackupPaths(file);
  const writer = createBackupWriter(file);
  writer({ status: 'pre-write', inserted: { techniques: [] } });
  const prewrite = fs.readFileSync(`${file}.pre-write`, 'utf8');
  assert.equal(fs.existsSync(file), false);
  assert.throws(() => assertNewBackupPaths(file), /backup file already exists/);
  writer({ status: 'pre-commit', inserted: { techniques: [{ id: 123 }] } });
  const final = fs.readFileSync(file, 'utf8');
  assert.equal(JSON.parse(prewrite).status, 'pre-write');
  assert.equal(JSON.parse(final).status, 'pre-commit');
  for (const target of [file, `${file}.pre-write`]) assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  assert.throws(() => writer({ status: 'pre-write', replacement: true }), e => e.code === 'EEXIST');
  assert.throws(() => writer({ status: 'pre-commit', replacement: true }), e => e.code === 'EEXIST');
  assert.throws(() => writer({ status: 'unknown' }), /unsupported backup status/);
  assert.equal(fs.readFileSync(`${file}.pre-write`, 'utf8'), prewrite);
  assert.equal(fs.readFileSync(file, 'utf8'), final);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['backup.json', 'backup.json.pre-write']);
}));

test('apply output preflight rejects backup/log aliasing, including normalized paths and parent symlinks', () => temporary(dir => {
  const backup = path.join(dir, 'backup.json');
  const alias = path.join(dir, 'alias');
  fs.symlinkSync(dir, alias, 'dir');
  for (const log of [backup, `${backup}.pre-write`, path.join(dir, '.', 'backup.json'), path.join(alias, 'backup.json'), path.join(alias, 'new', '..', 'backup.json.pre-write')]) {
    assert.throws(() => validateApplyOutputPaths({ backup, log }), /output paths must be distinct/);
  }
  const nested = path.join(dir, 'missing', 'nested', 'backup.json');
  assert.equal(canonicalOutputPath(nested), path.join(fs.realpathSync(dir), 'missing', 'nested', 'backup.json'));
  assert.deepEqual(validateApplyOutputPaths({ backup, log: path.join(dir, 'log.json') }), { backupFile: path.join(fs.realpathSync(dir), 'backup.json'), logFile: path.join(fs.realpathSync(dir), 'log.json') });
}));

test('apply output preflight rejects existing and dangling-symlink logs without touching backups', () => temporary(dir => {
  const backup = path.join(dir, 'backup.json');
  const log = path.join(dir, 'log.json');
  fs.writeFileSync(log, 'prior log');
  assert.throws(() => validateApplyOutputPaths({ backup, log }), /log file already exists/);
  assert.equal(fs.readFileSync(log, 'utf8'), 'prior log');
  fs.unlinkSync(log);
  fs.symlinkSync(path.join(dir, 'not-created'), log);
  assert.throws(() => validateApplyOutputPaths({ backup, log }), /log file already exists/);
  assert.equal(fs.lstatSync(log).isSymbolicLink(), true);
  assert.equal(fs.existsSync(backup), false);
  assert.equal(fs.existsSync(`${backup}.pre-write`), false);
}));
