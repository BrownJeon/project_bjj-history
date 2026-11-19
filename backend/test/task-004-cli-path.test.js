// task-004 S-C1 — claudeCli 실행 파일 결정(CLAUDE_CLI_PATH, 호출부별 선택).
// spawn 을 대역으로 바꿔 실행 파일·argv·env 만 본다. 실제 claude·shim·모델 호출 없음.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('child_process');

const calls = [];
function okChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  setImmediate(() => {
    child.stdout.emit('data', Buffer.from('ok'));
    child.emit('close', 0);
  });
  return child;
}
let childImpl = okChild;
const realSpawn = childProcess.spawn;
// claudeCli 는 로드 때 `const { spawn } = require('child_process')` 로 잡는다 — 대역을 먼저 꽂고 새로 로드한다.
childProcess.spawn = (file, args, opts) => {
  calls.push({ file, args, opts });
  return childImpl();
};
const modPath = require.resolve('../src/services/claudeCli');
delete require.cache[modPath];
const { runClaude, resolveClaudeExecutable } = require(modPath);
childProcess.spawn = realSpawn;

const SHIM = '/opt/cliclaude/current/shim.py';
const ORIGINAL = process.env.CLAUDE_CLI_PATH;
function setPath(v) {
  if (v === undefined) delete process.env.CLAUDE_CLI_PATH;
  else process.env.CLAUDE_CLI_PATH = v;
}

const AGENTS = { 'gym-master': { description: '합성 페르소나', prompt: '합성 본문' } };
const SCHEMA = { type: 'object', properties: { results: { type: 'array' } }, required: ['results'] };
const MCP_BJJ = { mcpServers: { bjj: { command: process.execPath, args: ['/app/mcp/gymMasterServer.js'], env: { BJJ_USER_ID: '1' } } } };

// 실제 호출부의 옵션 모양(값은 합성). shim 기대 여부는 사용자 결정 U2·조사서 §2-2 기준.
const CASES = [
  { id: 'B1 기본(코치·추천 등)', opts: {}, shim: true },
  { id: 'B1 batch(longVideo 요약)', opts: { timeoutMs: 300000, priority: 'batch' }, shim: true },
  { id: 'B2 프레임 Read(videoAnalysis)', opts: { tools: 'Read' }, shim: false },
  { id: 'B2 batch Read(longVideo·chapterPlanner)', opts: { tools: 'Read', timeoutMs: 240000, priority: 'batch', maxRetries: 2 }, shim: false },
  { id: 'B3 snsSearch', opts: { tools: ['WebSearch'], model: 'haiku', maxTurns: 4, timeoutMs: 90000, jsonSchema: SCHEMA }, shim: true },
  { id: 'B4 feedbackAI(stdin)', opts: { model: 'opus', agents: AGENTS, agent: 'gym-master', tools: '', mcpConfig: { mcpServers: {} }, strictMcp: true, maxTurns: 1, maxRetries: 1, timeoutMs: 180000, stdinPrompt: true }, shim: true },
  { id: 'B5 masterChat(MCP 서버)', opts: { agents: AGENTS, agent: 'gym-master', model: 'sonnet', mcpConfig: MCP_BJJ, strictMcp: true, tools: ['WebSearch'], maxTurns: 12, outputFormat: 'stream-json', maxRetries: 1 }, shim: false },
];

async function spawnFor(env, opts) {
  setPath(env);
  calls.length = 0;
  childImpl = okChild;
  await runClaude('합성 프롬프트', { ...opts, maxRetries: 1 });
  assert.equal(calls.length, 1);
  return calls[0];
}

test('env 미설정 → 모든 호출부가 기존 claude', async () => {
  try {
    for (const c of CASES) {
      const r = await spawnFor(undefined, c.opts);
      assert.equal(r.file, 'claude', c.id);
    }
  } finally { setPath(ORIGINAL); childImpl = okChild; }
});

test('env 공백 → 기존 claude', async () => {
  try {
    assert.equal((await spawnFor('  ', {})).file, 'claude');
    assert.equal((await spawnFor('', {})).file, 'claude');
  } finally { setPath(ORIGINAL); childImpl = okChild; }
});

test('env 설정 → B1·B3·B4 만 shim, B2·B5 는 기존 claude. argv·cwd·stdio·env 는 env 미설정과 같다', async () => {
  try {
    for (const c of CASES) {
      const base = await spawnFor(undefined, c.opts);
      const withEnv = await spawnFor(SHIM, c.opts);
      assert.equal(withEnv.file, c.shim ? SHIM : 'claude', c.id);
      assert.equal(JSON.stringify(withEnv.args), JSON.stringify(base.args), `${c.id} argv`);
      assert.equal(withEnv.opts.cwd, base.opts.cwd);
      assert.deepEqual(withEnv.opts.stdio, base.opts.stdio);
      // PATH 앞붙임(~/.npm-global/bin)을 포함한 자식 env 는 경로 선택과 무관하게 같다(CLAUDE_CLI_PATH 자체 제외).
      const strip = (e) => { const x = { ...e }; delete x.CLAUDE_CLI_PATH; return x; };
      assert.deepEqual(strip(withEnv.opts.env), strip(base.opts.env), `${c.id} env`);
      assert.equal(withEnv.opts.env.CLAUDECODE, undefined);
    }
  } finally { setPath(ORIGINAL); childImpl = okChild; }
});

test('판정은 호출부 목록이 아니라 인자 기준 — 경계 모양', () => {
  try {
    setPath(SHIM);
    const R = resolveClaudeExecutable;
    assert.equal(R({}), SHIM);
    assert.equal(R({ tools: [] }), SHIM);
    assert.equal(R({ tools: '' }), SHIM);
    assert.equal(R({ tools: 'WebSearch' }), SHIM);
    assert.equal(R({ tools: ['WebSearch', 'WebFetch'] }), SHIM);
    assert.equal(R({ tools: 'Read' }), 'claude');
    assert.equal(R({ tools: ['WebSearch', 'Read'] }), 'claude');
    assert.equal(R({ tools: 'WebSearch,Read' }), 'claude');
    assert.equal(R({ tools: 'Grep' }), 'claude');
    assert.equal(R({ tools: 'Bash(git:*)' }), 'claude');
    assert.equal(R({ mcpConfig: { mcpServers: {} } }), SHIM);
    assert.equal(R({ mcpConfig: '{"mcpServers":{}}' }), SHIM);
    assert.equal(R({ mcpConfig: MCP_BJJ }), 'claude');
    assert.equal(R({ mcpConfig: JSON.stringify(MCP_BJJ) }), 'claude');
    assert.equal(R({ mcpConfig: '{not json' }), 'claude');
    assert.equal(R({ mcpConfig: {} }), 'claude');
    setPath(` ${SHIM}\n`);
    assert.equal(R({}), SHIM);
  } finally { setPath(ORIGINAL); childImpl = okChild; }
});

test('ENOENT 문구는 경로와 무관하게 기존 그대로', async () => {
  try {
    setPath(SHIM);
    childImpl = () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      setImmediate(() => child.emit('error', Object.assign(new Error('spawn'), { code: 'ENOENT' })));
      return child;
    };
    await assert.rejects(runClaude('p', { maxRetries: 1 }), /claude CLI가 설치되어 있지 않거나 PATH에 없습니다/);
  } finally { setPath(ORIGINAL); childImpl = okChild; }
});
