const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const source = readFileSync(join(__dirname, 'feedback.browser-server.js'), 'utf8');
const valid = { BJJ_FEEDBACK_TEST_DB: '1', DB_HOST: '127.0.0.1', DB_PORT: '9002', DB_NAME: 'bjj_task052', DB_USER: 'root', DB_PASS: '' };
function evaluate(env) {
  let imports = 0;
  try { new Script(source).runInNewContext({ process: { env }, require() { imports++; throw new Error('synthetic import interception'); }, console, module: { exports: {} } }); }
  catch (error) { return { error, imports }; }
  throw new Error('fixture unexpectedly executed without guard or import');
}
test('browser fixture refuses every unsafe DB setting before importing any dependency', () => {
  for (const env of [{}, { ...valid, BJJ_FEEDBACK_TEST_DB: '0' }, { ...valid, DB_HOST: 'localhost' }, { ...valid, DB_HOST: '192.0.2.1' }, { ...valid, DB_PORT: '3306' }, { ...valid, DB_NAME: 'bjj' }, { ...valid, DB_USER: 'bjj_user' }, { ...valid, DB_PASS: 'synthetic-not-empty' }, { ...valid, BJJ_FEEDBACK_BROWSER_PORT: '3001' }]) {
    const result = evaluate(env); assert.equal(result.imports, 0); assert.match(result.error.message, /fixture.*(requires|only permits)/i);
  }
});
test('task-052 fixture rejects the existing task-051 DB and browser port', () => {
  for (const env of [{ ...valid, DB_PORT: '9001', DB_NAME: 'bjj_task051' }, { ...valid, DB_PORT: '9001' }, { ...valid, DB_NAME: 'bjj_task051' }, { ...valid, BJJ_FEEDBACK_BROWSER_PORT: '9015' }]) {
    const result = evaluate(env); assert.equal(result.imports, 0); assert.match(result.error.message, /fixture.*(requires|only permits)/i);
  }
});
test('only the explicitly isolated settings permit the first dependency import', () => {
  for (const env of [valid, { ...valid, BJJ_FEEDBACK_BROWSER_PORT: '9016' }]) {
    const result = evaluate(env); assert.equal(result.imports, 1); assert.match(result.error.message, /synthetic import interception/);
  }
});
