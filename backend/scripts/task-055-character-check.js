#!/usr/bin/env node
// Explicit MariaDB checks, restricted to the three new tables. Every test write
// is rolled back. Default invocation stays offline; this is not a migration.
const schema = require('./task-055-character-schema');
const core = require('../src/services/characterRegistry');
const crypto = require('node:crypto');

function isExpectedRejection(error, codes, constraint = null) {
  const cause = error.original || error;
  const named = codes.includes(cause.code);
  if (!constraint) return named;
  const actualConstraint = /CONSTRAINT\s+[`'"]?([a-zA-Z0-9_]+)/i.exec(cause.sqlMessage || '')?.[1];
  // mysql2's MySQL symbolic name for errno 4025 differs from MariaDB's CHECK
  // violation. Require the server errno, SQLSTATE AND exact constraint name.
  const mariaCheck = Number(cause.errno) === 4025 && cause.sqlState === '23000';
  return mariaCheck && actualConstraint === constraint;
}
async function main(args = process.argv.slice(2), env = process.env) {
  const options = schema.parseArgs(args, { '--run': false, '--confirm-database': true });
  if (!options['--run']) { console.log(JSON.stringify({ mode: 'offline-dry-run', writes: 0, checks: ['DDL contracts', 'DML failure rollback', 'UNIQUE/FK/CHECK/RESTRICT', 'BLOB restoration', 'skin version preservation', 'zero durable test rows'] })); return; }
  schema.requireEnvironment(env, { '--apply': true, '--confirm-database': options['--confirm-database'] });
  if (env !== process.env) throw schema.safeError('Current explicit process environment required');
  const prepared = await core.loadApprovedSet();
  const db = await schema.connect(env);
  try { schema.assertCompatible(await schema.inspect(db, env.DB_NAME)); } finally { await db.end(); }
  const models = require('../src/models');
  const { sequelize, CharacterBase: Base, CharacterSkin: Skin, CharacterAsset: Asset } = models;
  const counts = async () => [await Base.count(), await Skin.count(), await Asset.count()];
  const equal = (a, b, message) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw schema.safeError(message); };
  const results = [];
  const mark = name => results.push({ name, status: 'pass' });
  async function rejects(name, action, codes, constraint = null) {
    try { await action(); } catch (error) {
      if (isExpectedRejection(error, codes, constraint)) { mark(name); return; }
      const cause = error.original || error;
      throw schema.safeError(`Unexpected failure in ${name}: ${cause.code || error.name}, errno=${Number(cause.errno) || 0}`);
    }
    throw schema.safeError(`Constraint did not reject ${name}`);
  }
  try {
    const before = await counts();
    // Exercise the real registration transaction before the initial durable run.
    if (!(await Base.findOne({ where: { base_key: core.BASE_KEY } }))) {
      let attempts = 0;
      const stop = schema.safeError('injected-registration-failure');
      const faulty = {
        unscoped: () => Asset.unscoped(),
        create: async (...parameters) => { if (++attempts === 3) throw stop; return Asset.create(...parameters); },
      };
      try { await core.createCharacterRegistry({ ...models, CharacterAsset: faulty }).register(prepared); throw schema.safeError('Failure injection was not reached'); }
      catch (error) { if (error !== stop) throw error; }
      equal(await counts(), before, 'Registration failure left durable rows'); mark('real-registration-failure-rollback');
    } else results.push({ name: 'real-registration-failure-rollback', status: 'not-run-already-registered' });
    const rollback = new Error('rollback-test-fixtures');
    try {
      await sequelize.transaction(async transaction => {
        const key = 'task-055-check-' + crypto.randomBytes(8).toString('hex');
        const base = await Base.create({ ...prepared.base, base_key: key, created_at: new Date() }, { transaction });
        const otherBase = await Base.create({ ...prepared.base, base_key: key + '-other', created_at: new Date() }, { transaction });
        const skins = [];
        for (const values of prepared.skins) skins.push((await Skin.create({ ...values, base_id: base.id, created_at: new Date() }, { transaction })).get({ plain: true }));
        const otherSkin = await Skin.create({ ...prepared.skins[0], base_id: otherBase.id, created_at: new Date() }, { transaction });
        const original = prepared.assets[4];
        const values = { ...core.assetValues(original, base.id, skins), payload: original.payload, created_at: new Date() };
        const asset = await Asset.create(values, { transaction });
        const restored = await Asset.unscoped().findByPk(asset.id, { transaction });
        if (!restored.payload.equals(original.payload) || core.digest(restored.payload) !== original.sha256) throw schema.safeError('Database BLOB roundtrip failed');
        mark('largest-original-binary-roundtrip');
        if (asset.toJSON().payload !== undefined) throw schema.safeError('JSON exposes payload'); mark('json-omits-binary');
        await rejects('skin-version-unique', () => Skin.create({ ...prepared.skins[0], base_id: base.id, created_at: new Date() }, { transaction }), ['ER_DUP_ENTRY']);
        await rejects('asset-key-unique', () => Asset.create(values, { transaction }), ['ER_DUP_ENTRY']);
        await rejects('cross-base-skin-fk', () => Asset.create({ ...values, asset_key: 'invalid-cross-base', actor_a_skin_id: otherSkin.id }, { transaction }), ['ER_NO_REFERENCED_ROW_2']);
        await rejects('pair-binding-check', () => Asset.create({ ...values, asset_key: 'invalid-pair', skin_id: skins[0].id }, { transaction }), ['ER_CONSTRAINT_FAILED'], 'ck_ca_binding');
        await rejects('payload-length-check', () => Asset.create({ ...values, asset_key: 'invalid-length', byte_length: 1 }, { transaction }), ['ER_CONSTRAINT_FAILED'], 'ck_ca_length');
        await rejects('base-delete-restrict', () => Base.destroy({ where: { id: base.id }, transaction }), ['ER_ROW_IS_REFERENCED_2']);
        await rejects('referenced-skin-delete-restrict', () => Skin.destroy({ where: { id: skins[0].id }, transaction }), ['ER_ROW_IS_REFERENCED_2']);
        const local = core.createCharacterRegistry({ ...models, sequelize: { config: sequelize.config, transaction: work => work(transaction), query: (...parameters) => sequelize.query(...parameters) } });
        const next = await local.appendSkinVersion(key, { skin_key: skins[0].skin_key, version_no: 2, label: 'rollback-only v2', appearance: { ...JSON.parse(skins[0].appearance), test_only: true }, approval: { source: 'rollback-only technical check' } });
        if (next.base_id !== base.id || next.id === skins[0].id || next.version_no !== 2) throw schema.safeError('Version append failed');
        const preserved = await Asset.unscoped().findByPk(asset.id, { transaction });
        equal([preserved.actor_a_skin_id, preserved.actor_b_skin_id, preserved.context], [asset.actor_a_skin_id, asset.actor_b_skin_id, asset.context], 'Old asset bindings changed');
        if (!preserved.payload.equals(original.payload)) throw schema.safeError('Old asset bytes changed'); mark('new-version-preserves-previous-asset-and-role-bindings');
        const previousSkin = await Skin.findByPk(skins[0].id, { transaction });
        equal(previousSkin.appearance, skins[0].appearance, 'Previous skin changed'); mark('previous-skin-preserved');
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    equal(await counts(), before, 'Temporary constraint/version tests left durable rows'); mark('all-test-writes-rolled-back');
    console.log(JSON.stringify({ mode: 'database-check', database: env.DB_NAME, results, durable_test_rows: 0, before_counts: before, after_counts: await counts() }));
  } finally { await sequelize.close(); }
}
if (require.main === module) main().catch(schema.reportError);
module.exports = { main, isExpectedRejection };
