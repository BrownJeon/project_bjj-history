const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync, spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const helper = process.env.BJJ_ART_HELPER || path.join(__dirname, 'task-058-image-assets.cjs');
const sharpModule = process.env.BJJ_ART_SHARP || createRequire(path.resolve(__dirname, '../tools/technique-image-assets/package.json')).resolve('sharp');
const sharp = require(sharpModule);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p));
const json = x => JSON.stringify(x, null, 2) + '\n';
async function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bjj-art-regression-')));
  const art = path.join(root, 'reference/technique-illustrations/set-01/production');
  const registry = path.join(art, 'manifest.json');
  const app = path.join(root, 'web/src/data/techniqueIllustrations.json');
  const pub = slug => path.join(root, 'web/public/technique-illustrations/set-01', slug + '.webp');
  fs.mkdirSync(art, { recursive: true }); fs.mkdirSync(path.dirname(app), { recursive: true }); fs.mkdirSync(path.join(root, 'scripts'));
  const cli = path.join(root, 'scripts/task-058-image-assets.cjs'); fs.copyFileSync(helper, cli);
  fs.writeFileSync(registry, json({ version: 1, items: [
    { slug: 'one', name: 'One', names: ['One'], status: 'pending' },
    { slug: 'two', name: 'Two', names: ['Two'], status: 'pending' },
    { slug: 'alias', name: 'Alias', names: ['Alias'], sharedAssetSlug: 'one', status: 'shared_pending' },
  ] }));
  fs.writeFileSync(app, json({ version: 1, background: '#15171E', items: [] }));
  const red = path.join(root, 'red.png'), blue = path.join(root, 'blue.png'), prompt = path.join(root, 'actual-prompt.txt');
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#cc3322' } }).png().toFile(red);
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2244cc' } }).png().toFile(blue);
  fs.writeFileSync(prompt, 'Synthetic regression fixture; no image generation API.\n');
  const env = { ...process.env, BJJ_ART_SHARP: sharpModule };
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const fail = (...args) => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8' });
  const approve = slug => run('approve', slug, '', '', 'synthetic-visual-review');
  const importOne = (slug, input = red) => run('import', slug, input, prompt);
  return { root, art, registry, app, pub, cli, env, red, blue, prompt, run, fail, approve, importOne };
}
function candidate(f, slug) { return path.join(f.root, read(f.registry).items.find(x => x.slug === slug).asset.candidate); }
function fileSHA(file) { return sha(fs.readFileSync(file)); }
function fileTree(directory) {
  const result = {};
  function visit(current, prefix = '') {
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current, name), relative = prefix + name, info = fs.lstatSync(file);
      if (info.isDirectory()) visit(file, relative + '/');
      else result[relative] = info.isSymbolicLink() ? fs.readlinkSync(file) : fileSHA(file);
    }
  }
  visit(directory); return result;
}
function lock(f, owner) { const p = path.join(f.art, '.registry-lock'); fs.mkdirSync(p); fs.writeFileSync(path.join(p, 'owner.json'), json(owner)); return p; }
function killDuring(f, target, slug) {
  const wrapper = path.join(f.root, 'kill-during-approve.cjs');
  fs.writeFileSync(wrapper, `const fs=require('node:fs');const rename=fs.renameSync;fs.renameSync=function(a,b){const r=rename.apply(this,arguments);if(b===${JSON.stringify(target)})process.kill(process.pid,'SIGKILL');return r};require(${JSON.stringify(f.cli)}).main(['approve',${JSON.stringify(slug)},'','','synthetic-review']).catch(e=>{console.error(e.message);process.exitCode=1});`);
  const result = spawnSync(process.execPath, [wrapper], { env: f.env, encoding: 'utf8' });
  assert.equal(result.signal, 'SIGKILL');
}

test('import stages immutable originals, prompts and WebP without publishing', async () => {
  const f = await fixture(), before = fileSHA(f.app);
  const result = f.importOne('one');
  assert.equal(result.candidateOnly, true); assert.equal(fs.existsSync(f.pub('one')), false); assert.equal(fileSHA(f.app), before);
  const a = read(f.registry).items[0].asset;
  assert.equal(fileSHA(path.join(f.root, a.original)), fileSHA(f.red)); assert.equal(fileSHA(path.join(f.root, a.prompt)), fileSHA(f.prompt));
  assert.equal(fileSHA(candidate(f, 'one')), a.optimizedSHA256);
});

const toolDirectory = path.resolve(__dirname, '../tools/technique-image-assets');
test('the isolated tool package resolves sharp without an external project override', { skip: !fs.existsSync(path.join(toolDirectory, 'node_modules/sharp')) }, async () => {
  const f = await fixture(), target = path.join(f.root, 'tools/technique-image-assets');
  fs.mkdirSync(target, { recursive: true }); fs.copyFileSync(path.join(toolDirectory, 'package.json'), path.join(target, 'package.json'));
  fs.symlinkSync(path.join(toolDirectory, 'node_modules'), path.join(target, 'node_modules'), 'dir');
  const env = { ...f.env }; delete env.BJJ_ART_SHARP;
  const result = JSON.parse(execFileSync(process.execPath, [f.cli, 'import', 'one', f.red, f.prompt], { env, encoding: 'utf8' }));
  assert.equal(result.candidateOnly, true); assert.equal(read(f.registry).items[0].asset.optimizer.version, '0.35.4');
});

test('unreviewed replacement and unrelated approval preserve the previous approved image', async () => {
  const f = await fixture(); f.importOne('one'); f.approve('one'); const before = fileSHA(f.pub('one')), beforeApp = fileSHA(f.app);
  f.importOne('one', f.blue); assert.equal(fileSHA(f.pub('one')), before); assert.equal(fileSHA(f.app), beforeApp);
  let row = read(f.registry).items[0]; assert.equal(row.status, 'generated'); assert.equal(row.approvedAsset.version, 1); assert.equal(row.asset.version, 2);
  f.importOne('two'); f.approve('two'); assert.equal(fileSHA(f.pub('one')), before); assert.ok(read(f.app).items.find(x => x.slug === 'one'));
  f.approve('one'); assert.notEqual(fileSHA(f.pub('one')), before); assert.equal(read(f.registry).items[0].versions.length, 2);
  assert.deepEqual(f.run('verify', '--complete'), { verified: true, targetRows: 3, coveredRows: 3, approvedAssets: 2, complete: true });
});

test('a reviewed PNG SHA cannot approve a newer candidate and refusal changes no asset files', async () => {
  const f = await fixture(); f.importOne('one'); f.approve('one');
  const reviewedSHA = read(f.registry).items[0].asset.originalSHA256, previousPublic = fileSHA(f.pub('one'));
  f.importOne('one', f.blue); // Another import completed after the review.
  const before = fileTree(f.root);
  const result = f.fail('approve', 'one', '', '', 'reviewed-old-image', reviewedSHA);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Reviewed original SHA256 mismatch/);
  assert.deepEqual(fileTree(f.root), before);
  assert.equal(fileSHA(f.pub('one')), previousPublic);
  const row = read(f.registry).items[0];
  assert.equal(row.status, 'generated'); assert.equal(row.asset.version, 2); assert.equal(row.approvedAsset.version, 1);
});

test('approval validates the optional review SHA and promotes exactly the matching PNG', async () => {
  const f = await fixture(); f.importOne('one');
  const reviewedSHA = read(f.registry).items[0].asset.originalSHA256, before = fileTree(f.root);
  assert.notEqual(f.fail('approve', 'one', '', '', 'reviewed-image', 'invalid-sha').status, 0);
  assert.deepEqual(fileTree(f.root), before);
  const result = f.run('approve', 'one', '', '', 'reviewed-image', reviewedSHA.toUpperCase());
  assert.equal(result.status, 'ready');
  const row = read(f.registry).items[0];
  assert.equal(row.approvedAsset.originalSHA256, reviewedSHA);
  assert.equal(row.approvedReview.expectedOriginalSHA256, reviewedSHA);
  assert.equal(fileSHA(f.pub('one')), row.approvedAsset.optimizedSHA256);
  assert.equal(f.run('verify').verified, true);
});

test('simultaneous imports retain both rows with no lost update', async () => {
  const f = await fixture();
  const run = slug => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [f.cli, 'import', slug, f.red, f.prompt], { env: f.env }); let err = '';
    child.stderr.on('data', b => err += b); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(err)));
  });
  await Promise.all([run('one'), run('two')]);
  assert.equal(read(f.registry).items.filter(x => x.asset).length, 2); assert.equal(read(f.app).items.length, 0);
  assert.equal(fs.existsSync(path.join(f.art, '.registry-lock')), false);
});

test('caught publish failure restores registry and public bytes', { skip: process.getuid?.() === 0 }, async () => {
  const f = await fixture(); f.importOne('one'); f.approve('one'); f.importOne('one', f.blue);
  const original = [f.registry, f.pub('one'), f.app].map(fileSHA);
  fs.chmodSync(path.dirname(f.app), 0o500);
  try { assert.notEqual(f.fail('approve', 'one', '', '', 'synthetic-review').status, 0); }
  finally { fs.chmodSync(path.dirname(f.app), 0o700); }
  assert.deepEqual([f.registry, f.pub('one'), f.app].map(fileSHA), original);
  assert.equal(f.run('verify').verified, true);
});

test('live or foreign lock ownership is protected and proven dead local owner can be recovered', async () => {
  const f = await fixture(); const p = lock(f, { pid: process.pid, hostname: os.hostname(), token: 'live-test' });
  assert.notEqual(f.fail('recover-lock').status, 0); assert.equal(fs.existsSync(p), true);
  fs.writeFileSync(path.join(p, 'owner.json'), json({ pid: process.pid, hostname: 'different-host', token: 'foreign-test' }));
  assert.notEqual(f.fail('recover-lock').status, 0); assert.equal(fs.existsSync(p), true);
  const dead = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' }).pid;
  fs.writeFileSync(path.join(p, 'owner.json'), json({ pid: dead, hostname: os.hostname(), token: 'dead-test' }));
  assert.equal(f.run('recover-lock').lockRecovered, true); assert.equal(fs.existsSync(p), false); f.importOne('one');
});

test('legacy migrate archives approved and unapproved bytes without promoting candidates', async () => {
  const f = await fixture(); f.importOne('one'); f.approve('one'); f.importOne('two', f.blue);
  const m = read(f.registry); const pending = m.items[1]; fs.mkdirSync(path.dirname(f.pub('two')), { recursive: true }); fs.copyFileSync(candidate(f, 'two'), f.pub('two'));
  const pendingBytes = fs.readFileSync(f.pub('two'));
  for (const row of m.items) {
    delete row.approvedAsset; delete row.approvedReview;
    if (row.asset) delete row.asset.candidate;
    for (const version of row.versions || []) delete version.candidate;
  }
  fs.rmSync(path.join(f.art, 'candidates'), { recursive: true }); fs.writeFileSync(f.registry, json(m));
  const before = fileSHA(f.pub('one')); const result = f.run('migrate');
  assert.equal(result.migratedAssets, 2); assert.equal(fileSHA(f.pub('one')), before); assert.equal(fs.existsSync(f.pub('two')), false);
  assert.equal(read(f.registry).items[1].status, 'generated'); assert.equal(read(f.app).items.length, 1);
  assert.ok(fs.readdirSync(path.join(f.art, 'unpublished')).some(name => fileSHA(path.join(f.art, 'unpublished', name)) === sha(pendingBytes)));
  assert.equal(f.run('verify').coveredRows, 2); assert.notEqual(f.fail('verify', '--complete').status, 0);
});

test('SIGKILL after public rename is recoverable without approving the replacement', async () => {
  const f = await fixture(); f.importOne('one'); f.approve('one'); const old = fileSHA(f.pub('one')); f.importOne('one', f.blue);
  killDuring(f, f.pub('one'), 'one'); assert.notEqual(fileSHA(f.pub('one')), old);
  f.run('recover-lock'); f.run('sync'); assert.equal(fileSHA(f.pub('one')), old);
  assert.equal(read(f.registry).items[0].status, 'generated'); assert.equal(read(f.registry).items[0].approvedAsset.version, 1); assert.equal(f.run('verify').verified, true);
});

test('an approval during legacy transition preserves other unapproved candidates for later review', async () => {
  const f = await fixture(); f.importOne('one'); f.approve('one'); f.importOne('two', f.blue);
  fs.copyFileSync(candidate(f, 'two'), f.pub('two'));
  const m = read(f.registry);
  for (const row of m.items) {
    delete row.approvedAsset; delete row.approvedReview;
    if (row.asset) delete row.asset.candidate;
    for (const version of row.versions || []) delete version.candidate;
  }
  fs.rmSync(path.join(f.art, 'candidates'), { recursive: true }); fs.writeFileSync(f.registry, json(m));
  f.approve('one'); assert.equal(fs.existsSync(f.pub('two')), false); assert.equal(fs.existsSync(candidate(f, 'two')), true);
  f.approve('two'); assert.equal(f.run('verify', '--complete').complete, true);
});

test('SIGKILL after approved registry commit can resynchronize the app manifest', async () => {
  const f = await fixture(); f.importOne('one'); f.approve('one'); f.importOne('two', f.blue);
  killDuring(f, f.registry, 'two'); assert.equal(read(f.app).items.length, 1); assert.equal(read(f.registry).items[1].status, 'ready');
  f.run('recover-lock'); f.run('sync'); assert.equal(read(f.app).items.length, 2); assert.equal(f.run('verify', '--complete').complete, true);
});

test('verification detects corrupted public or candidate bytes', async () => {
  const f = await fixture(); f.importOne('one'); f.approve('one'); fs.writeFileSync(f.pub('one'), 'broken');
  assert.notEqual(f.fail('verify').status, 0); f.run('sync'); assert.equal(f.run('verify').verified, true);
  fs.writeFileSync(candidate(f, 'one'), 'broken'); assert.notEqual(f.fail('verify').status, 0); assert.notEqual(f.fail('sync').status, 0);
});
