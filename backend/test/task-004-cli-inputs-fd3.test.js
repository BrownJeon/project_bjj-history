// task-004 S-C2b — 진짜 자식 프로세스로 fd 3 manifest 전달을 잰다(spawn 대역 없음).
// CLAUDE_CLI_PATH 를 임시 가짜 shim(Node 스크립트)으로 바꾼다. 실제 shim·claude·모델 호출 없음.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runClaude } = require('../src/services/claudeCli');

const ORIGINAL = process.env.CLAUDE_CLI_PATH;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bjj-sc2b-fd3-'));

function fakeShim(name, body) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  return p;
}

// fd 3 을 EOF 까지 읽어 argv 와 함께 stdout 으로 돌려준다(shim 이 manifest 를 소켓 연결 전에 다 읽는 것과 같은 순서).
const ECHO = fakeShim('echo-shim', `
const fs = require('fs');
let manifest = null;
try { manifest = fs.readFileSync(3, 'utf8'); } catch (e) { manifest = 'NO_FD3:' + e.code; }
process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), manifest }));
`);

// fd 3 을 읽지 않고 바로 닫고 끝난다 — 큰 manifest 쓰기는 EPIPE 가 난다(1.1.0 롤백·기동 실패 모양).
const DEAF = fakeShim('deaf-shim', `
try { require('fs').closeSync(3); } catch {}
process.stdout.write('deaf-ok');
`);

test.after(() => {
  if (ORIGINAL === undefined) delete process.env.CLAUDE_CLI_PATH; else process.env.CLAUDE_CLI_PATH = ORIGINAL;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Node 의 4번째 stdio pipe 가 자식의 fd 3 이고 manifest 가 그대로 도착한다', async () => {
  process.env.CLAUDE_CLI_PATH = ECHO;
  const inputs = [
    { src: '/abs/frame-1.jpg', path: 'inputs/01.jpg', size: 3 },
    { src: '/abs/frame-2.jpg', path: 'inputs/02.jpg', size: 4 },
  ];
  const out = JSON.parse(await runClaude('inputs/01.jpg 부터 읽어라', { tools: 'Read', inputs, maxRetries: 1 }));
  assert.deepEqual(JSON.parse(out.manifest), { cliclaude_inputs: 1, files: inputs });
  assert.deepEqual(out.argv, ['--print', 'inputs/01.jpg 부터 읽어라', '--permission-mode', 'dontAsk', '--model', 'sonnet', '--tools', 'Read']);
});

test('입력 없는 호출에는 fd 3 이 없다(입력 없음 = cliclaude/1)', async () => {
  process.env.CLAUDE_CLI_PATH = ECHO;
  const out = JSON.parse(await runClaude('p', { maxRetries: 1 }));
  assert.match(out.manifest, /^NO_FD3:/);
});

test('자식이 fd 3 을 읽지 않고 닫아도(EPIPE) 앱은 죽지 않고 종료 코드로 판정한다', async () => {
  process.env.CLAUDE_CLI_PATH = DEAF;
  // 파이프 버퍼(보통 64KiB)를 넘기는 manifest — 5,000개 × 긴 경로
  const long = 'x'.repeat(200);
  const inputs = Array.from({ length: 5000 }, (_, i) => ({ src: `/abs/${long}/f-${i}.jpg`, path: `inputs/${String(i + 1).padStart(4, '0')}.jpg` }));
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try {
    assert.equal(await runClaude('p', { tools: 'Read', inputs, maxRetries: 1 }), 'deaf-ok');
  } finally { console.error = orig; }
  // EPIPE 가 났다면 경로 없이 코드만 남는다(타이밍에 따라 버퍼가 비워져 안 날 수도 있다).
  for (const l of errs) assert.ok(!l.includes('/abs/'), l);
});
