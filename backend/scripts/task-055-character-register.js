#!/usr/bin/env node
const schema = require('./task-055-character-schema');
const registry = require('../src/services/characterRegistry');

async function main(args = process.argv.slice(2), env = process.env) {
  const options = schema.parseArgs(args, { '--apply': false, '--verify': false, '--confirm-database': true, '--restore-dir': true });
  if (options['--apply'] && options['--verify']) throw schema.safeError('Choose --apply or --verify');
  if (options['--restore-dir'] && !options['--verify']) throw schema.safeError('--restore-dir requires --verify');
  const prepared = await registry.loadApprovedSet(); // All six files checked before DB access.
  if (!options['--apply'] && !options['--verify']) { console.log(JSON.stringify({ mode: 'offline-dry-run', writes: 0, ...registry.summarizePrepared(prepared) })); return; }
  schema.requireEnvironment(env, options);
  const db = await schema.connect(env);
  try {
    const state = await schema.inspect(db, env.DB_NAME); schema.assertCompatible(state);
    if (state.max_allowed_packet < Math.max(...prepared.assets.map(a => a.bytes)) * 2 + 65536) throw schema.safeError('Packet limit is insufficient; no server settings changed');
  } finally { await db.end(); }
  // Models read only these explicit, already-validated env vars; no bootstrap/sync.
  if (env !== process.env) throw schema.safeError('Connected execution requires the current explicit process environment');
  const models = require('../src/models');
  const service = registry.createCharacterRegistry(models);
  try {
    if (options['--apply']) console.log(JSON.stringify({ mode: 'applied', ...await service.register(prepared) }));
    const verified = await service.verify(prepared);
    console.log(JSON.stringify({ mode: 'verified', ...verified }));
    if (options['--restore-dir']) console.log(JSON.stringify(await service.restore(prepared, options['--restore-dir'])));
  } finally { await models.sequelize.close(); }
}
if (require.main === module) main().catch(schema.reportError);
module.exports = { main };
