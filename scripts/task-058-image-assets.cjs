#!/usr/bin/env node
// Asset import/optimization only. Image creation stays in the built-in image_gen tool.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const art = path.join(root, 'reference/technique-illustrations/set-01/production');
const registryPath = path.join(art, 'manifest.json');
const publicDir = path.join(root, 'web/public/technique-illustrations/set-01');
const appPath = path.join(root, 'web/src/data/techniqueIllustrations.json');
const lockDir = path.join(art, '.registry-lock');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const normalize = value => String(value || '').normalize('NFC').trim().replace(/\s+/gu, ' ');
const validSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const relative = file => path.relative(root, file);
function projectFile(value) {
  if (typeof value !== 'string' || path.isAbsolute(value)) throw Error('Expected project-relative asset path');
  const file = path.resolve(root, value);
  if (!file.startsWith(root + path.sep)) throw Error('Asset path escapes project');
  return file;
}
function bytes(file) {
  try { return fs.readFileSync(file); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
function atomic(file, data) {
  if (data === null) { if (fs.existsSync(file)) fs.unlinkSync(file); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + `.tmp-${process.pid}-${crypto.randomUUID()}`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o644);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(tmp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}
function immutable(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = bytes(file);
  if (existing) { if (hash(existing) !== hash(data)) throw Error(`Preserved asset differs: ${relative(file)}`); return; }
  const fd = fs.openSync(file, 'wx', 0o644);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
// Caught write failures roll back every changed published file. After SIGKILL,
// sync uses registry.approvedAsset as authority; no candidate is auto-approved.
function transaction(changes) {
  const snapshots = new Map([...changes.keys()].map(file => [file, bytes(file)]));
  const applied = [];
  try {
    for (const [file, data] of changes) { applied.push(file); atomic(file, data); }
  } catch (error) {
    const failed = [];
    for (const file of applied.reverse()) {
      try {
        const before = snapshots.get(file), now = bytes(file);
        if (before === null ? now === null : now && hash(before) === hash(now)) continue;
        atomic(file, before);
      } catch { failed.push(relative(file)); }
    }
    if (failed.length) throw Error(`Write failed; rollback incomplete for ${failed.join(', ')}. Repair permissions then run sync: ${error.message}`);
    throw error;
  }
}
function candidatePath(slug, version) {
  if (!Number.isSafeInteger(version) || version < 1) throw Error('Invalid asset version');
  return path.join(art, 'candidates', `${slug}-v${version}.webp`);
}
function publicPath(slug) { return path.join(publicDir, `${slug}.webp`); }
function checked(file, expected, label) {
  const b = bytes(file);
  if (!b || hash(b) !== expected) throw Error(`${label} hash mismatch: ${relative(file)}`);
  return b;
}
function cacheCandidate(item, asset) {
  if (!asset) throw Error(`Missing asset: ${item.slug}`);
  const target = candidatePath(item.slug, asset.version);
  if (asset.candidate) {
    checked(projectFile(asset.candidate), asset.optimizedSHA256, 'Candidate');
  } else {
    // Legacy files lived directly in public/. Archive matching bytes before any promotion.
    const sources = [target, projectFile(asset.optimized),
      path.join(art, 'unpublished', `${item.slug}-${asset.optimizedSHA256}.webp`)];
    const matching = sources.map(bytes).find(b => b && hash(b) === asset.optimizedSHA256);
    if (!matching) throw Error(`Legacy optimized asset unavailable: ${item.slug} v${asset.version}`);
    immutable(target, matching);
    asset.candidate = relative(target);
  }
  const version = item.versions?.find(x => x.version === asset.version);
  if (version) version.candidate = asset.candidate;
  return asset;
}
function approved(item) { return item.approvedAsset || (item.status === 'ready' ? item.asset : null); }
function preserveLegacyApproval(item) {
  if (!item.approvedAsset && item.status === 'ready' && item.asset) {
    if (!item.review?.by) throw Error(`Legacy ready asset has no review: ${item.slug}`);
    item.approvedAsset = { ...cacheCandidate(item, item.asset) };
    item.approvedReview = { ...item.review };
  }
}
function appManifest(registry) {
  const items = registry.items.filter(x => approved(x)).map(x => ({
    slug: x.slug, names: [...new Set(x.names)], url: `/technique-illustrations/set-01/${x.slug}.webp`,
    width: 512, height: 512, status: 'ready',
  }));
  const targets = new Map(items.map(x => [x.slug, x]));
  for (const item of registry.items.filter(x => x.sharedAssetSlug)) {
    const target = targets.get(item.sharedAssetSlug);
    if (target) target.names = [...new Set([...target.names, ...item.names])];
  }
  const names = new Map();
  for (const item of items) for (const name of item.names) {
    const key = normalize(name);
    if (!key) throw Error(`Blank illustration name: ${item.slug}`);
    if (names.has(key) && names.get(key) !== item.slug) throw Error(`Ambiguous illustration name: ${name}`);
    names.set(key, item.slug);
  }
  return { version: 1, background: '#15171E', items };
}
function syncChanges(registry) {
  const changes = new Map();
  for (const item of registry.items) {
    const asset = approved(item), target = publicPath(item.slug);
    if (asset) {
      cacheCandidate(item, asset);
      changes.set(target, checked(projectFile(asset.candidate), asset.optimizedSHA256, 'Approved candidate'));
    } else if (fs.existsSync(target)) {
      if (item.asset && !item.asset.candidate) cacheCandidate(item, item.asset);
      const actual = fs.readFileSync(target), known = [item.asset, ...(item.versions || [])].filter(Boolean);
      if (!known.some(x => x.optimizedSHA256 === hash(actual))) throw Error(`Unknown public bytes preserved: ${item.slug}`);
      // Keep even legacy unapproved public bytes; remove only the public copy.
      immutable(path.join(art, 'unpublished', `${item.slug}-${hash(actual)}.webp`), actual);
      changes.set(target, null);
    }
  }
  changes.set(registryPath, json(registry));
  changes.set(appPath, json(appManifest(registry)));
  return changes;
}
function verify(registry, complete) {
  const expected = appManifest(registry), actual = read(appPath);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw Error('App manifest differs from approved registry; run sync');
  for (const item of registry.items) {
    if (item.asset?.candidate) checked(projectFile(item.asset.candidate), item.asset.optimizedSHA256, 'Latest candidate');
    const asset = approved(item);
    if (!asset) continue;
    if (!asset.candidate) throw Error(`Legacy approval requires migrate: ${item.slug}`);
    checked(projectFile(asset.candidate), asset.optimizedSHA256, 'Approved candidate');
    checked(publicPath(item.slug), asset.optimizedSHA256, 'Public image');
    checked(projectFile(asset.original), asset.originalSHA256, 'Preserved PNG');
    checked(projectFile(asset.prompt), asset.promptSHA256, 'Preserved prompt');
  }
  const index = new Map(expected.items.flatMap(x => x.names.map(n => [normalize(n), x.slug])));
  const covered = registry.items.filter(x => index.get(normalize(x.name || x.names[0])) === (x.sharedAssetSlug || x.slug));
  if (complete && covered.length !== registry.items.length) throw Error(`Incomplete coverage: ${covered.length}/${registry.items.length}`);
  if (complete && fs.existsSync(publicDir)) {
    const expectedFiles = new Set(expected.items.map(x => `${x.slug}.webp`));
    const extra = fs.readdirSync(publicDir).filter(name => (name.endsWith('.webp') || name.includes('.tmp-')) && !expectedFiles.has(name));
    if (extra.length) throw Error(`Unexpected public image files: ${extra.join(', ')}`);
  }
  return { verified: true, targetRows: registry.items.length, coveredRows: covered.length,
    approvedAssets: expected.items.length, complete: covered.length === registry.items.length };
}
async function acquire() {
  fs.mkdirSync(art, { recursive: true });
  const deadline = Date.now() + 30000;
  const owner = { pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString(), token: crypto.randomUUID() };
  for (;;) {
    try { fs.mkdirSync(lockDir); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() > deadline) throw Error(`Registry lock timed out. Inspect ${relative(lockDir)}/owner.json; use recover-lock only for a proven dead local owner.`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try { immutable(path.join(lockDir, 'owner.json'), json(owner)); }
  catch (e) { if (!fs.readdirSync(lockDir).length) fs.rmdirSync(lockDir); throw e; }
  return () => {
    if (read(path.join(lockDir, 'owner.json')).token !== owner.token) throw Error('Registry lock ownership changed; lock preserved');
    fs.unlinkSync(path.join(lockDir, 'owner.json')); fs.rmdirSync(lockDir);
  };
}
function recoverLock() {
  if (!fs.existsSync(lockDir)) return { lockRecovered: false, reason: 'not_locked' };
  const ownerPath = path.join(lockDir, 'owner.json'), before = fs.readFileSync(ownerPath), owner = JSON.parse(before);
  if (owner.hostname !== os.hostname()) throw Error('Lock belongs to another host; inspect it there');
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || !owner.token) throw Error('Lock owner is incomplete; manual process audit required');
  try { process.kill(owner.pid, 0); throw Error('Lock owner PID is alive; recovery refused'); }
  catch (e) { if (e.code !== 'ESRCH') throw e; }
  if (hash(fs.readFileSync(ownerPath)) !== hash(before)) throw Error('Lock ownership changed; recovery refused');
  fs.unlinkSync(ownerPath); fs.rmdirSync(lockDir);
  return { lockRecovered: true, ownerPID: owner.pid, hostname: owner.hostname };
}
function validateRegistry(registry) {
  if (registry.version !== 1 || !Array.isArray(registry.items)) throw Error('Unsupported illustration registry');
  const slugs = new Set();
  for (const item of registry.items) {
    if (!validSlug(item.slug) || slugs.has(item.slug) || !Array.isArray(item.names)) throw Error('Invalid or duplicate registry slug/names');
    slugs.add(item.slug);
  }
  for (const item of registry.items) if (item.sharedAssetSlug && (!slugs.has(item.sharedAssetSlug) || item.sharedAssetSlug === item.slug)) throw Error('Unknown/shared-cycle target');
}
async function main(argv = process.argv.slice(2)) {
  const [mode, slug, source, promptPath, review, expectedOriginalSHA256] = argv;
  if (mode === 'recover-lock') return recoverLock();
  const mutating = ['import', 'approve', 'publish', 'migrate', 'sync'].includes(mode);
  const release = mutating ? await acquire() : () => {};
  try {
    const registry = read(registryPath); validateRegistry(registry);
    const item = registry.items.find(x => x.slug === slug);
    if (mode === 'import') {
      if (!item || item.sharedAssetSlug || !source || !promptPath) throw Error('import needs a known non-shared slug, PNG and prompt file');
      preserveLegacyApproval(item);
      const input = fs.readFileSync(source), prompt = fs.readFileSync(promptPath);
      if (input.length < 24 || !input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Expected generated PNG');
      const width = input.readUInt32BE(16), height = input.readUInt32BE(20);
      if (width !== height || width < 512) throw Error('Expected square PNG >=512px');
      let version = Math.max(0, ...(item.versions || []).map(x => x.version)) + 1;
      while (fs.existsSync(path.join(art, 'raw', `${slug}-v${version}.png`))) version++;
      const original = path.join(art, 'raw', `${slug}-v${version}.png`), promptCopy = path.join(art, 'prompts', `${slug}-v${version}.txt`);
      immutable(original, input); immutable(promptCopy, prompt);
      const candidate = candidatePath(slug, version); fs.mkdirSync(path.dirname(candidate), { recursive: true });
      const requireTool = createRequire(path.join(root, 'tools/technique-image-assets/package.json'));
      const sharp = process.env.BJJ_ART_SHARP ? require(process.env.BJJ_ART_SHARP) : requireTool('sharp');
      const tmp = candidate + `.tmp-${process.pid}.webp`;
      try {
        await sharp(original).resize(512, 512, { fit: 'contain' }).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(tmp);
        immutable(candidate, fs.readFileSync(tmp));
      } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
      const optimized = fs.readFileSync(candidate);
      const asset = { version, original: relative(original), prompt: relative(promptCopy), width, height,
        originalSHA256: hash(input), promptSHA256: hash(prompt), candidate: relative(candidate),
        optimized: relative(publicPath(slug)), optimizedSHA256: hash(optimized), bytes: optimized.length,
        generatedOriginal: path.resolve(source), tool: 'built-in image_gen',
        optimizer: { package: 'sharp', version: sharp.versions.sharp, webp: sharp.versions.webp,
          size: 512, quality: 90, alphaQuality: 100, effort: 6 } };
      item.versions = [...(item.versions || []), asset]; item.asset = asset; item.status = 'generated';
      atomic(registryPath, json(registry));
      return { slug, status: item.status, version, bytes: asset.bytes, candidateOnly: true };
    }
    if (mode === 'approve') {
      if (!item?.asset || item.sharedAssetSlug || !review) throw Error('approve needs an imported non-shared asset and actual review note');
      // Compare under the registry lock, before legacy caching or any asset write.
      // Five-argument callers remain compatible; a sixth argument binds the review to its PNG.
      if (expectedOriginalSHA256 !== undefined) {
        if (typeof expectedOriginalSHA256 !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedOriginalSHA256)) {
          throw Error('Expected original SHA256 must be 64 hexadecimal characters');
        }
        if (item.asset.originalSHA256 !== expectedOriginalSHA256.toLowerCase()) {
          throw Error(`Reviewed original SHA256 mismatch for ${slug}; approval refused`);
        }
      }
      preserveLegacyApproval(item);
      const asset = cacheCandidate(item, item.asset);
      checked(projectFile(asset.original), asset.originalSHA256, 'Preserved PNG');
      checked(projectFile(asset.prompt), asset.promptSHA256, 'Preserved prompt');
      item.status = 'ready'; item.review = { by: review, at: new Date().toISOString(),
        ...(expectedOriginalSHA256 === undefined ? {} : { expectedOriginalSHA256: expectedOriginalSHA256.toLowerCase() }) };
      item.approvedAsset = { ...asset }; item.approvedReview = { ...item.review };
      // Other legacy ready rows stay visible when publishing this approval.
      for (const row of registry.items) preserveLegacyApproval(row);
      transaction(syncChanges(registry));
      return { slug, status: 'ready', publishedAssets: appManifest(registry).items.length };
    }
    if (['migrate', 'sync', 'publish'].includes(mode)) {
      let migrated = 0;
      for (const row of registry.items) {
        if (mode === 'migrate' && row.status === 'generated' && row.review && !row.approvedAsset) throw Error(`Ambiguous legacy approval history: ${row.slug}`);
        if (row.asset && !row.asset.candidate) { cacheCandidate(row, row.asset); migrated++; }
        preserveLegacyApproval(row);
      }
      transaction(syncChanges(registry));
      return { publishedAssets: appManifest(registry).items.length, migratedAssets: migrated, ...verify(registry, false) };
    }
    if (mode === 'verify') return verify(registry, argv.includes('--complete'));
    if (mode === 'status') {
      const counts = {}; for (const row of registry.items) counts[row.status] = (counts[row.status] || 0) + 1;
      const m = appManifest(registry), covered = new Set(m.items.flatMap(x => x.names.map(normalize)));
      return { targetRows: registry.items.length, counts, approvedAssets: m.items.length,
        sharedReady: registry.items.filter(x => x.sharedAssetSlug && m.items.some(t => t.slug === x.sharedAssetSlug)).length,
        coveredRows: registry.items.filter(x => covered.has(normalize(x.name || x.names[0]))).length,
        publishedAssets: fs.existsSync(appPath) ? read(appPath).items.length : 0 };
    }
    throw Error('mode: import | approve | publish | status | migrate | sync | verify [--complete] | recover-lock');
  } finally { release(); }
}
if (require.main === module) main().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
