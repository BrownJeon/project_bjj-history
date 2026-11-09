const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

const BASE_KEY = 'bjj-human-adult-7-head';
const PREFIX = 'reference/characters/set-01/';
// Immutable task-055 approval boundary. A modified manifest cannot authorize new bytes.
const APPROVED = [
  ['blue-gi-brown-belt.png', 'character_turnaround', 1434974, 'b53b8055020ae83c23e8926fcf42dc9dddb48ad05d13893bfc5933f34635ce8a'],
  ['blue-gi-brown-belt.prompt.txt', 'generation_prompt', 2458, '3eb3f562244c735669c416b7821ee9dffcaef010a297f8f3e9e12cf7859ddbf9'],
  ['white-gi-brown-belt.png', 'character_turnaround', 1733575, 'ab83010155438952c6a9bb211f35bb283880201553b2f52f090d5e62d0b2d271'],
  ['white-gi-brown-belt.prompt.txt', 'generation_prompt', 3547, 'fc4a5a8671c6b09a3dd71ae9455df4670d527d42f61d2d8498621ed3fc70a867'],
  ['samples/single-x-guard-v1.png', 'pose_sample', 1997310, '346d5bed0ed00e0cbed1d8f6c8780ddaaf08792a8c6fd4c6b9e6ccf41956714e'],
  ['samples/single-x-guard-v1.prompt.txt', 'generation_prompt', 4134, '5002257fd5c5291dafeeb4b11bcd6d67221864df063aff0766a821d0ca69738c'],
].map(([relative, kind, bytes, sha256]) => Object.freeze({ path: PREFIX + relative, kind, bytes, sha256 }));
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const plain = row => row && (row.get ? row.get({ plain: true }) : row);
function fail(message) { const error = new Error(message); error.safeMessage = message; throw error; }
function validateBytes(bytes, expected) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== expected.bytes || digest(bytes) !== expected.sha256) fail(`Original bytes/hash mismatch: ${expected.path}`);
  if (expected.path.endsWith('.png')) {
    if (!bytes.subarray(0, 8).equals(PNG)) fail(`Invalid PNG signature: ${expected.path}`);
    return 'image/png';
  }
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(`Invalid UTF-8 prompt: ${expected.path}`); }
  return 'text/plain; charset=utf-8';
}
async function loadApprovedSet(projectRoot = path.resolve(__dirname, '../../..')) {
  const root = await fs.realpath(projectRoot);
  const manifestPath = path.join(root, PREFIX, 'approved-base-manifest.json');
  const manifestReal = await fs.realpath(manifestPath);
  if (manifestReal !== manifestPath) fail('Manifest symlinks are not accepted');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.schema_version !== 1 || manifest.task_id !== 'task-055' || manifest.project !== 'bjj-trainning' || manifest.set_label !== 'set-01' || manifest.storage_contract?.option !== 'B' || manifest.storage_contract?.status !== 'user_approved' || manifest.storage_contract?.payload_storage !== 'database_blob' || manifest.user_validation?.status !== 'complete') fail('Approved task-055 BLOB contract required');
  if (JSON.stringify(manifest.storage_contract.schema_tables) !== JSON.stringify(['character_bases', 'character_skins', 'character_assets']) || JSON.stringify(manifest.storage_contract.initial_records) !== JSON.stringify({ character_bases: 1, character_skins: 2, character_assets: 6 })) fail('Initial dataset scope mismatch');
  if (manifest.representation?.blender_model_file !== null || manifest.representation?.rig_file !== null) fail('Initial references must not claim completed 3D models');
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== APPROVED.length) fail('Exactly six approved assets required');
  const paths = new Set();
  for (const item of manifest.assets) {
    const expected = APPROVED.find(a => a.path === item.path);
    if (!expected || paths.has(item.path) || expected.bytes !== item.bytes || expected.sha256 !== item.sha256 || expected.kind !== item.kind) fail('Manifest differs from the six approved originals');
    paths.add(item.path);
  }
  if (!Array.isArray(manifest.characters) || manifest.characters.length !== 2 || manifest.characters[0].gi_color !== 'blue' || manifest.characters[1].gi_color !== 'white' || manifest.characters.some(c => c.belt_color !== 'brown')) fail('Approved blue/white brown-belt pair required');
  const approval = JSON.stringify({ task_id: 'task-055', storage: manifest.storage_contract.approval, character_validation: manifest.user_validation });
  const base = { base_key: BASE_KEY, label: '공통 성인 사람형 베이스', body_spec: JSON.stringify({ body_type: 'adult_humanoid', approximate_head_ratio: 7, representation: '2d_reference_sheets_and_pose_sample' }), stage: 'concept_approved', model_path: null, rig_path: null, approval };
  const skins = manifest.characters.map((character, index) => {
    const skin_key = index === 0 ? 'blue-gi-brown-belt' : 'white-gi-brown-belt';
    if (character.turnaround_asset !== PREFIX + skin_key + '.png' || character.prompt_asset !== PREFIX + skin_key + '.prompt.txt') fail('Character sheet/prompt binding mismatch');
    return { skin_key, version_no: 1, label: character.label, appearance: JSON.stringify({ face_reference: character.face_reference, hair_color: character.hair_color, eye_color: character.eye_color, gi_color: character.gi_color, belt_color: character.belt_color }), approval };
  });
  if (manifest.sample?.technique !== 'single_x_guard' || manifest.sample.image_asset !== APPROVED[4].path || manifest.sample.prompt_asset !== APPROVED[5].path) fail('Shared sample binding mismatch');
  const assets = [];
  for (const expected of APPROVED) {
    const filename = path.join(root, expected.path);
    const real = await fs.realpath(filename);
    if (real !== filename) fail(`Original symlinks are not accepted: ${expected.path}`);
    const payload = await fs.readFile(real);
    assets.push({ ...expected, mime_type: validateBytes(payload, expected), payload });
  }
  return { root, base, skins, assets };
}
function summarizePrepared(prepared) {
  return { base_key: prepared.base.base_key, skins: prepared.skins.map(s => ({ skin_key: s.skin_key, version_no: s.version_no })), assets: prepared.assets.map(({ payload, ...a }) => a), total_bytes: prepared.assets.reduce((sum, a) => sum + a.bytes, 0) };
}
function assertSame(row, values, label) {
  const data = plain(row);
  if (!data || Object.entries(values).some(([name, value]) => data[name] !== value)) fail(`Existing ${label} differs; no history overwritten`);
  return data;
}
function assetValues(asset, baseId, skins) {
  const pair = asset.path.startsWith(PREFIX + 'samples/');
  const skin = asset.path.startsWith(PREFIX + 'blue-') ? skins[0] : skins[1];
  const actor = (slot, row) => ({ slot, skin_id: row.id, skin_key: row.skin_key, version_no: row.version_no });
  return {
    base_id: baseId, asset_key: 'set-01/' + asset.path.slice(PREFIX.length),
    binding_kind: pair ? 'pair' : 'skin', skin_id: pair ? null : skin.id,
    actor_a_skin_id: pair ? skins[0].id : null, actor_b_skin_id: pair ? skins[1].id : null,
    kind: asset.kind, mime_type: asset.mime_type, byte_length: asset.bytes, sha256: asset.sha256,
    source_path: asset.path,
    context: JSON.stringify(pair ? { technique: 'single_x_guard', actors: [actor('standing', skins[0]), actor('guard', skins[1])], prompt_asset_key: 'set-01/samples/single-x-guard-v1.prompt.txt' } : { actors: [actor('character', skin)], prompt_asset_key: `set-01/${skin.skin_key}.prompt.txt` }),
  };
}
function assertPayload(row, expected) {
  const data = plain(row);
  validateBytes(data.payload, expected);
  if (!data.payload.equals(expected.payload)) fail('Restored payload does not match the original');
  return data;
}
function assetSummary(row) {
  const { payload, created_at, ...metadata } = plain(row);
  return { ...metadata, context: JSON.parse(metadata.context) };
}
function createCharacterRegistry(dependencies) {
  const { sequelize, CharacterBase: Base, CharacterSkin: Skin, CharacterAsset: Asset } = dependencies || require('../models');
  async function locked(baseKey, work) {
    return sequelize.transaction(async transaction => {
      const [state] = await sequelize.query('SELECT DATABASE() AS db, @@check_constraint_checks AS checks_enabled, @@foreign_key_checks AS fks_enabled, @@max_allowed_packet AS max_allowed_packet', { transaction });
      if (!sequelize.config?.database || state[0].db !== sequelize.config.database || Number(state[0].checks_enabled) !== 1 || Number(state[0].fks_enabled) !== 1 || Number(state[0].max_allowed_packet) < 1997310 * 2 + 65536) fail('Actual write connection database/constraints/packet limit mismatch');
      const name = 'character-registry:' + digest(Buffer.from(baseKey)).slice(0, 40);
      const [rows] = await sequelize.query('SELECT GET_LOCK(?, 10) AS acquired', { replacements: [name], transaction });
      if (Number(rows[0].acquired) !== 1) fail('Character registration is already running');
      try { return await work(transaction); }
      finally {
        // Same pinned connection, before transaction completion. Row locks remain
        // held until commit/rollback, so the next lock holder uses current reads.
        await sequelize.query('SELECT RELEASE_LOCK(?)', { replacements: [name], transaction });
      }
    });
  }
  async function register(prepared) {
    // Re-check held Buffers immediately before ANY connection/transaction/write.
    if (prepared.base.base_key !== BASE_KEY || prepared.skins.length !== 2 || prepared.assets.length !== 6) fail('Prepared dataset scope mismatch');
    for (let i = 0; i < APPROVED.length; i++) {
      if (prepared.assets[i].path !== APPROVED[i].path) fail('Prepared asset order/scope mismatch');
      validateBytes(prepared.assets[i].payload, APPROVED[i]);
    }
    return locked(BASE_KEY, async transaction => {
      const created = { character_bases: 0, character_skins: 0, character_assets: 0 };
      const options = { transaction, lock: transaction.LOCK.UPDATE };
      let base = await Base.findOne({ where: { base_key: BASE_KEY }, ...options });
      if (!base) { base = await Base.create({ ...prepared.base, created_at: new Date() }, { transaction }); created.character_bases++; }
      const baseData = assertSame(base, prepared.base, 'base');
      const skins = [];
      for (const values of prepared.skins) {
        const identity = { base_id: baseData.id, skin_key: values.skin_key, version_no: values.version_no };
        let row = await Skin.findOne({ where: identity, ...options });
        if (!row) { row = await Skin.create({ ...identity, ...values, created_at: new Date() }, { transaction }); created.character_skins++; }
        skins.push(assertSame(row, { ...identity, ...values }, 'skin version'));
      }
      const assets = [];
      for (const original of prepared.assets) {
        const values = assetValues(original, baseData.id, skins);
        let row = await Asset.unscoped().findOne({ where: { base_id: baseData.id, asset_key: values.asset_key }, ...options });
        if (!row) { row = await Asset.create({ ...values, payload: original.payload, created_at: new Date() }, { transaction }); created.character_assets++; }
        assertSame(row, values, 'asset'); assertPayload(row, original);
        assets.push(assetSummary(row));
      }
      return { base_id: baseData.id, skins: skins.map(s => ({ id: s.id, skin_key: s.skin_key, version_no: s.version_no })), assets, created, dataset_counts: { character_bases: 1, character_skins: 2, character_assets: 6 } };
    });
  }
  async function verify(prepared) {
    const base = plain(await Base.findOne({ where: { base_key: BASE_KEY } }));
    assertSame(base, prepared.base, 'base');
    const skins = [];
    for (const values of prepared.skins) skins.push(assertSame(await Skin.findOne({ where: { base_id: base.id, skin_key: values.skin_key, version_no: 1 } }), { ...values, base_id: base.id }, 'skin version'));
    const assets = [];
    for (const original of prepared.assets) {
      const values = assetValues(original, base.id, skins);
      const row = await Asset.unscoped().findOne({ where: { base_id: base.id, asset_key: values.asset_key } });
      assertSame(row, values, 'asset'); assertPayload(row, original);
      assets.push(assetSummary(row));
    }
    const total_counts = { character_bases: await Base.count(), character_skins: await Skin.count(), character_assets: await Asset.count() };
    return { verified: true, base_id: base.id, skins: skins.map(s => ({ id: s.id, skin_key: s.skin_key, version_no: s.version_no })), assets, dataset_counts: { character_bases: 1, character_skins: 2, character_assets: 6 }, total_counts, total_bytes: assets.reduce((sum, a) => sum + a.byte_length, 0) };
  }
  async function readAsset(id) {
    if (!Number.isSafeInteger(id) || id < 1) fail('Positive asset ID required');
    const row = plain(await Asset.unscoped().findByPk(id));
    if (!row) fail('Asset not found');
    validateBytes(row.payload, { path: row.source_path, bytes: row.byte_length, sha256: row.sha256 });
    return { metadata: assetSummary(row), bytes: Buffer.from(row.payload) };
  }
  async function restore(prepared, directory) {
    const verified = await verify(prepared);
    const requested = path.resolve(directory);
    if (requested === prepared.root || requested.startsWith(prepared.root + path.sep)) fail('Restore output must be outside the project/originals');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const output = await fs.realpath(directory);
    if (output === prepared.root || output.startsWith(prepared.root + path.sep)) fail('Restore output must be outside the project/originals');
    const files = [];
    for (const asset of verified.assets) {
      const { bytes } = await readAsset(asset.id);
      const filename = path.join(output, String(asset.id) + '-' + path.basename(asset.source_path));
      await fs.writeFile(filename, bytes, { flag: 'wx', mode: 0o600 }); // Never overwrite.
      if (digest(await fs.readFile(filename)) !== asset.sha256) fail('Restored file verification failed');
      files.push({ id: asset.id, file: filename, bytes: bytes.length, sha256: asset.sha256 });
    }
    return { restored: files };
  }
  async function appendSkinVersion(baseKey, values) {
    if (typeof baseKey !== 'string' || !baseKey || baseKey.length > 80 || !values || typeof values.skin_key !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(values.skin_key) || !Number.isSafeInteger(values.version_no) || values.version_no < 1 || typeof values.label !== 'string' || !values.label || values.label.length > 120 || !values.appearance || typeof values.appearance !== 'object' || !values.approval || typeof values.approval !== 'object') fail('Explicit skin key/version/appearance/approval required');
    return locked(baseKey, async transaction => {
      const base = plain(await Base.findOne({ where: { base_key: baseKey }, transaction, lock: transaction.LOCK.UPDATE }));
      if (!base) fail('Base not found');
      const latest = plain(await Skin.findOne({ where: { base_id: base.id, skin_key: values.skin_key }, order: [['version_no', 'DESC']], transaction, lock: transaction.LOCK.UPDATE }));
      if (values.version_no !== (latest ? latest.version_no + 1 : 1)) fail('Skin versions must be appended sequentially; existing versions are immutable');
      const row = plain(await Skin.create({ base_id: base.id, skin_key: values.skin_key, version_no: values.version_no, label: values.label, appearance: JSON.stringify(values.appearance), approval: JSON.stringify(values.approval), created_at: new Date() }, { transaction }));
      return { id: row.id, base_id: row.base_id, skin_key: row.skin_key, version_no: row.version_no };
    });
  }
  return { register, verify, readAsset, restore, appendSkinVersion };
}
module.exports = { BASE_KEY, PREFIX, APPROVED, digest, validateBytes, loadApprovedSet, summarizePrepared, createCharacterRegistry, assetValues };
