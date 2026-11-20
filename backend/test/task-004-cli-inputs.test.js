// task-004 S-C2b — B2(tools:'Read' 4곳)를 cliclaude 1.2.0 입력 파일(fd 3 manifest)로 보내는 경로.
// spawn 을 대역으로 바꿔 실행 파일·argv·stdio·manifest 만 본다. 실제 claude·shim·ffmpeg·yt-dlp·모델·네트워크 호출 없음.
// 이 파일은 node --test 의 별도 프로세스에서 돈다 — spawn·fetch 대역은 이 프로세스 안에서만 유효하다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHIM = '/opt/cliclaude/current/shim.py';
const MiB = 1024 * 1024;

// ── spawn 대역 ────────────────────────────────────────────────────────────
// claudeCli·videoAnalysis 는 로드 때 `const { spawn } = require('child_process')` 로 잡으므로 로드 전에 꽂는다.
const calls = [];
let claudeReply = 'ok';
let ytdlpEntries = [];
let fd3Error = null;
function emitter() { return new EventEmitter(); }
function finish(child, out, code = 0) {
  setImmediate(() => {
    if (out) child.stdout.emit('data', Buffer.from(out));
    child.emit('close', code, null);
  });
}
childProcess.spawn = (file, args, opts = {}) => {
  const child = emitter();
  child.stdout = emitter();
  child.stderr = emitter();
  child.stdin = { write() {}, end() {} };
  child.kill = () => true;
  const base = path.basename(String(file));
  if (base === 'ffprobe') {
    finish(child, args.includes('format=duration') ? '20.0\n' : '');
    return child;
  }
  if (base === 'ffmpeg') {
    fs.writeFileSync(args[args.length - 1], Buffer.from('synthetic-jpeg'));
    finish(child, '');
    return child;
  }
  if (/yt-dlp/.test(base)) {
    finish(child, ytdlpEntries.map(e => JSON.stringify(e)).join('\n') + '\n');
    return child;
  }
  // claude 또는 shim
  const rec = { file, args, opts, manifest: null, fd3: null };
  child.stdio = [child.stdin, child.stdout, child.stderr];
  if (Array.isArray(opts.stdio) && opts.stdio.length > 3) {
    const fd3 = emitter();
    let buf = '';
    fd3.write = (d) => { buf += d; return true; };
    fd3.end = (d) => { if (d != null) buf += d; rec.manifest = buf; };
    child.stdio.push(fd3);
    rec.fd3 = fd3;
  }
  calls.push(rec);
  setImmediate(() => {
    if (fd3Error && rec.fd3) rec.fd3.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    child.stdout.emit('data', Buffer.from(claudeReply));
    child.emit('close', 0, null);
  });
  return child;
};

const svc = (m) => require.resolve(`../src/services/${m}`);
const cli = require(svc('claudeCli'));
const { runClaude, buildArgs, resolveClaudeExecutable, prepareFileInputs } = cli;
const chapterPlanner = require(svc('chapterPlanner'));
const videoAnalysis = require(svc('videoAnalysis'));

const ORIGINAL = process.env.CLAUDE_CLI_PATH;
function setPath(v) {
  if (v === undefined) delete process.env.CLAUDE_CLI_PATH;
  else process.env.CLAUDE_CLI_PATH = v;
}
function reset() { calls.length = 0; claudeReply = 'ok'; fd3Error = null; setPath(ORIGINAL); }

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'bjj-sc2b-')); }
function writeFiles(dir, names, bytes = 'x') {
  return names.map(n => { const p = path.join(dir, n); fs.writeFileSync(p, bytes); return p; });
}
function sparse(p, size) { fs.writeFileSync(p, ''); fs.truncateSync(p, size); return p; }
const INPUT = (n, ext = 'jpg') => ({ src: `/abs/frame-${n}.${ext}`, path: `inputs/${String(n).padStart(2, '0')}.${ext}` });
const MCP_BJJ = { mcpServers: { bjj: { command: process.execPath, args: ['/app/mcp/gymMasterServer.js'] } } };

// ── 1. 실행 파일 결정 ────────────────────────────────────────────────────
test('결정표: 입력이 선언된 Read 계열만 shim, 나머지 규칙은 S-C1 그대로', () => {
  try {
    const R = resolveClaudeExecutable;
    const IN = [INPUT(1)];
    setPath(undefined);
    assert.equal(R({ tools: 'Read', inputs: IN }), 'claude', 'env 없음 → 언제나 claude');
    assert.equal(R({}), 'claude');
    setPath(SHIM);
    // 새 규칙
    assert.equal(R({ tools: 'Read', inputs: IN }), SHIM);
    assert.equal(R({ tools: ['Read', 'Grep', 'Glob'], inputs: IN }), SHIM);
    assert.equal(R({ tools: 'Read,Glob', inputs: IN }), SHIM);
    assert.equal(R({ tools: 'Read', inputs: IN, mcpConfig: { mcpServers: {} } }), SHIM);
    // 입력이 있어도 claude 로 남는 것(→ runClaude 가 spawn 전에 거절)
    assert.equal(R({ tools: 'Read', inputs: IN, mcpConfig: MCP_BJJ }), 'claude', 'MCP 서버(B5 모양)');
    assert.equal(R({ tools: ['Read', 'WebSearch'], inputs: IN }), 'claude', 'Read 계열 밖 도구 섞임');
    assert.equal(R({ tools: 'WebSearch', inputs: IN }), 'claude');
    assert.equal(R({ tools: 'Bash', inputs: IN }), 'claude');
    assert.equal(R({ inputs: IN }), 'claude', '도구 없음');
    assert.equal(R({ tools: '', inputs: IN }), 'claude', '도구 비활성');
    // 입력 없는 Read 는 S-C1 그대로 claude
    assert.equal(R({ tools: 'Read' }), 'claude');
    assert.equal(R({ tools: 'Read', inputs: [] }), 'claude', '빈 입력 = 입력 없음');
    // S-C1 의 텍스트 규칙 그대로
    assert.equal(R({}), SHIM);
    assert.equal(R({ tools: '' }), SHIM);
    assert.equal(R({ tools: ['WebSearch'] }), SHIM);
    assert.equal(R({ mcpConfig: MCP_BJJ, tools: ['WebSearch'] }), 'claude');
  } finally { reset(); }
});

// ── 2. argv 권한 모드 ────────────────────────────────────────────────────
test('buildArgs: 입력이 있을 때만 dontAsk, 없으면 S-C1 과 같은 argv', () => {
  assert.deepEqual(buildArgs('P', { tools: 'Read' }),
    ['--print', 'P', '--permission-mode', 'bypassPermissions', '--model', 'sonnet', '--tools', 'Read']);
  assert.deepEqual(buildArgs('P', { tools: 'Read', inputs: [] }),
    ['--print', 'P', '--permission-mode', 'bypassPermissions', '--model', 'sonnet', '--tools', 'Read']);
  assert.deepEqual(buildArgs('P', { tools: 'Read', inputs: [INPUT(1)] }),
    ['--print', 'P', '--permission-mode', 'dontAsk', '--model', 'sonnet', '--tools', 'Read']);
  assert.deepEqual(buildArgs('P', {}),
    ['--print', 'P', '--permission-mode', 'bypassPermissions', '--model', 'sonnet']);
});

// ── 3. spawn·manifest ────────────────────────────────────────────────────
test('입력 있음: shim + 4번째 pipe + manifest(JSON 1개, 닫힘) + dontAsk', async () => {
  try {
    setPath(SHIM);
    const inputs = [INPUT(1), INPUT(2), { ...INPUT(3, 'png'), size: 10, sha256: 'a'.repeat(64) }];
    await runClaude('inputs/01.jpg 부터 읽어라', { tools: 'Read', inputs, maxRetries: 1 });
    assert.equal(calls.length, 1);
    const c = calls[0];
    assert.equal(c.file, SHIM);
    assert.deepEqual(c.opts.stdio, ['ignore', 'pipe', 'pipe', 'pipe']);
    assert.equal(c.opts.cwd, '/tmp');
    assert.ok(c.args.includes('dontAsk') && !c.args.includes('bypassPermissions'));
    assert.equal(c.manifest, JSON.stringify({ cliclaude_inputs: 1, files: inputs }));
    assert.deepEqual(Object.keys(JSON.parse(c.manifest)), ['cliclaude_inputs', 'files']);
    assert.ok(c.fd3.listenerCount('error') >= 1, 'stdio[3] error 처리기');
  } finally { reset(); }
});

test('입력 + stdinPrompt: stdio 4개 모두 pipe', async () => {
  try {
    setPath(SHIM);
    await runClaude('p', { tools: 'Read', inputs: [INPUT(1)], stdinPrompt: true, maxRetries: 1 });
    assert.deepEqual(calls[0].opts.stdio, ['pipe', 'pipe', 'pipe', 'pipe']);
  } finally { reset(); }
});

test('stdio[3] EPIPE 는 프로세스를 죽이지 않고 결과는 종료 코드로 판정', async () => {
  try {
    setPath(SHIM);
    fd3Error = true;
    claudeReply = 'done';
    const errs = [];
    const orig = console.error;
    console.error = (...a) => errs.push(a.join(' '));
    try {
      assert.equal(await runClaude('p', { tools: 'Read', inputs: [INPUT(1)], maxRetries: 1 }), 'done');
    } finally { console.error = orig; }
    assert.ok(errs.some(l => l.includes('입력 manifest 전달 실패') && l.includes('EPIPE')));
    assert.ok(!errs.some(l => l.includes('/abs/')), '경로를 로그에 싣지 않는다');
  } finally { reset(); }
});

test('입력 없음: spawn 옵션·argv 가 S-C1 과 같다(env 유무 무관)', async () => {
  try {
    for (const env of [undefined, SHIM]) {
      setPath(env);
      calls.length = 0;
      await runClaude('p', { tools: 'Read', maxRetries: 1 });
      await runClaude('p', { tools: 'Read', inputs: [], maxRetries: 1 });
      await runClaude('p', { maxRetries: 1 });
      for (const c of calls) {
        assert.deepEqual(Object.keys(c.opts).sort(), ['cwd', 'env', 'stdio', 'timeout']);
        assert.deepEqual(c.opts.stdio, ['ignore', 'pipe', 'pipe']);
        assert.equal(c.manifest, null);
        assert.ok(c.args.includes('bypassPermissions'));
      }
      assert.equal(calls[0].file, 'claude', 'Read 무입력 → claude');
      assert.equal(calls[1].file, 'claude', 'Read 빈 입력 → claude');
      assert.equal(calls[2].file, env ? SHIM : 'claude');
    }
  } finally { reset(); }
});

test('입력이 있는데 shim 으로 못 가면 spawn 없이 거절(폴백 없음)', async () => {
  try {
    setPath(undefined);
    await assert.rejects(runClaude('p', { tools: 'Read', inputs: [INPUT(1)], maxRetries: 1 }), /cliclaude 실행 경로/);
    setPath(SHIM);
    await assert.rejects(runClaude('p', { tools: 'Read', inputs: [INPUT(1)], mcpConfig: MCP_BJJ, maxRetries: 1 }), /cliclaude 실행 경로/);
    await assert.rejects(runClaude('p', { tools: ['WebSearch'], inputs: [INPUT(1)], maxRetries: 1 }), /cliclaude 실행 경로/);
    assert.equal(calls.length, 0);
  } finally { reset(); }
});

test('inputs 형식 검사: 이름·원본 경로·중복·크기·sha256 위반은 spawn 전에 거절', async () => {
  try {
    setPath(SHIM);
    const bad = [
      [{ src: 'rel/frame.jpg', path: 'inputs/01.jpg' }],
      [{ src: '/abs/a.jpg', path: '../01.jpg' }],
      [{ src: '/abs/a.jpg', path: '.claude/settings.json' }],
      [{ src: '/abs/a.jpg', path: 'CLAUDE.md' }],
      [{ src: '/abs/a.jpg', path: 'inputs/a.jpg' }],
      [{ src: '/abs/a.jpg', path: '/inputs/01.jpg' }],
      [{ src: '/abs/a.jpg', path: 'inputs/01.JPG' }],
      [INPUT(1), { ...INPUT(1), src: '/abs/other.jpg' }],
      [{ ...INPUT(1), size: 16 * MiB + 1 }],
      [{ ...INPUT(1), size: -1 }],
      [1, 2, 3, 4, 5].map(n => ({ ...INPUT(n), size: 13 * MiB })),
      [{ ...INPUT(1), sha256: 'XYZ' }],
      'inputs/01.jpg',
    ];
    for (const inputs of bad) {
      await assert.rejects(runClaude('p', { tools: 'Read', inputs, maxRetries: 1 }), /AI 입력|AI 분석/, JSON.stringify(inputs).slice(0, 80));
    }
    assert.equal(calls.length, 0);
    // 경계값은 통과: 장당 16MiB 정확히, 합계 64MiB 정확히
    await runClaude('p', { tools: 'Read', inputs: [1, 2, 3, 4].map(n => ({ ...INPUT(n), size: 16 * MiB })), maxRetries: 1 });
    assert.equal(calls.length, 1);
  } finally { reset(); }
});

// ── 4. prepareFileInputs ─────────────────────────────────────────────────
test('prepareFileInputs: env 없음 → 기존 절대 경로·입력 없음(롤백 = 지금 동작)', async () => {
  const dir = tmpDir();
  try {
    setPath(undefined);
    const files = writeFiles(dir, ['frame-1.jpg', 'frame-2.jpg']);
    const r = await prepareFileInputs(files, { tools: 'Read' });
    assert.deepEqual(r, { refs: files, inputs: undefined, hint: '' });
    setPath(SHIM);
    // MCP 가 있는 모양이면 shim 이 아니므로 역시 기존 그대로
    assert.deepEqual(await prepareFileInputs(files, { tools: 'Read', mcpConfig: MCP_BJJ }), { refs: files, inputs: undefined, hint: '' });
    assert.deepEqual(await prepareFileInputs([], { tools: 'Read' }), { refs: [], inputs: undefined, hint: '' });
  } finally { reset(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('prepareFileInputs: shim → inputs/NN.<ext> 순서 보존·크기 기록·확장자 소문자', async () => {
  const dir = tmpDir();
  try {
    setPath(SHIM);
    const files = writeFiles(dir, ['photo-1.jpg', 'photo-2.PNG', 'photo-3.webp'], 'abcd');
    const r = await prepareFileInputs(files, { tools: 'Read' });
    assert.deepEqual(r.refs, ['inputs/01.jpg', 'inputs/02.png', 'inputs/03.webp']);
    assert.deepEqual(r.inputs, files.map((src, i) => ({ src, path: r.refs[i], size: 4 })));
    assert.equal(r.hint, '(현재 작업 폴더 기준)');
    // 100장 이상이면 자릿수를 늘려 사전순 = 원래 순서
    const many = writeFiles(dir, Array.from({ length: 101 }, (_, i) => `m-${i + 1}.jpg`));
    const m = await prepareFileInputs(many, { tools: 'Read' });
    assert.equal(m.refs[0], 'inputs/001.jpg');
    assert.equal(m.refs[100], 'inputs/101.jpg');
    assert.deepEqual([...m.refs].sort(), m.refs);
  } finally { reset(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('prepareFileInputs: 장당 16MiB·합계 64MiB 초과, symlink·없는 파일은 spawn 전에 던지고 경로를 싣지 않는다', async () => {
  const dir = tmpDir();
  try {
    setPath(SHIM);
    const ok = writeFiles(dir, ['a.jpg']);
    const cases = [
      [[ok[0], sparse(path.join(dir, 'big.jpg'), 16 * MiB + 1)], /2번째 16\.0MiB.*장당 최대 16\.0MiB/],
      [[1, 2, 3, 4, 5].map(n => sparse(path.join(dir, `t${n}.jpg`), 13 * MiB)), /합계 65\.0MiB, 5장/],
      [[path.join(dir, 'missing.jpg')], /1번을 읽을 수 없습니다/],
      [[path.join(dir, 'link.jpg')], /일반 파일이 아닙니다/],
      [[dir], /일반 파일이 아닙니다/],
      [['relative.jpg'], /원본 경로가 올바르지 않습니다/],
      [[path.join(dir, 'noext')], /확장자/],
    ];
    fs.symlinkSync(ok[0], path.join(dir, 'link.jpg'));
    fs.writeFileSync(path.join(dir, 'noext'), 'x');
    for (const [files, re] of cases) {
      await assert.rejects(prepareFileInputs(files, { tools: 'Read' }), (e) => {
        assert.match(e.message, re);
        assert.ok(!e.message.includes(dir), '오류 문구에 경로 없음');
        return true;
      });
    }
    // 경계: 16MiB 정확히 4장 = 64MiB 는 통과
    const edge = [1, 2, 3, 4].map(n => sparse(path.join(dir, `e${n}.jpg`), 16 * MiB));
    assert.equal((await prepareFileInputs(edge, { tools: 'Read' })).inputs.length, 4);
  } finally { reset(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── 5. 호출부 ────────────────────────────────────────────────────────────
test('chapterPlanner.planFromVisualFrames(실제 runClaude): shim 이면 상대 이름·manifest·dontAsk', async () => {
  const dir = tmpDir();
  try {
    setPath(SHIM);
    claudeReply = '{"chapters":[{"start":"00:00","end":"02:00","title":"합성","confidence":0.9}]}';
    const paths = writeFiles(dir, ['visual-frame-1.jpg', 'visual-frame-2.jpg', 'visual-frame-3.jpg']);
    const frames = paths.map((p, i) => ({ t: i * 40, path: p }));
    const r = await chapterPlanner.planFromVisualFrames(frames, 120);
    assert.equal(r.callsUsed, 1);
    assert.equal(calls.length, 1);
    const c = calls[0];
    assert.equal(c.file, SHIM);
    assert.ok(c.args.includes('dontAsk'));
    const prompt = c.args[1];
    assert.match(prompt, /\[프레임 이미지 파일 경로\(현재 작업 폴더 기준\) — Read 툴로/);
    assert.match(prompt, /1\. inputs\/01\.jpg \(약 0:00 지점\)\n2\. inputs\/02\.jpg \(약 0:40 지점\)\n3\. inputs\/03\.jpg \(약 1:20 지점\)/);
    assert.ok(!prompt.includes(dir), '프롬프트에 호스트 경로 없음');
    assert.deepEqual(JSON.parse(c.manifest).files.map(f => [f.src, f.path]),
      paths.map((p, i) => [p, `inputs/0${i + 1}.jpg`]));
  } finally { reset(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('chapterPlanner.planFromVisualFrames: env 없음 → 기존 프롬프트(절대 경로)·bypass·fd 3 없음', async () => {
  const dir = tmpDir();
  try {
    setPath(undefined);
    const paths = writeFiles(dir, ['visual-frame-1.jpg']);
    await chapterPlanner.planFromVisualFrames([{ t: 5, path: paths[0] }], 60);
    const c = calls[0];
    assert.equal(c.file, 'claude');
    assert.deepEqual(c.opts.stdio, ['ignore', 'pipe', 'pipe']);
    assert.ok(c.args.includes('bypassPermissions'));
    assert.ok(c.args[1].includes(`[프레임 이미지 파일 경로 — Read 툴로 순서대로 읽어 시각 분석해주세요]\n1. ${paths[0]} (약 0:05 지점)`));
  } finally { reset(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('videoAnalysis.analyzeLocalFile → runCombinedAnalysis: 프레임 12장을 순서대로 inputs/01..12.jpg 로', async () => {
  try {
    setPath(SHIM);
    claudeReply = '합성 요약';
    const upDir = tmpDir();
    const up = path.join(upDir, 'upload.mp4');
    fs.writeFileSync(up, 'synthetic');
    const r = await videoAnalysis.analyzeLocalFile(up, null);
    assert.equal(r.description, '합성 요약');
    assert.equal(calls.length, 1);
    const c = calls[0];
    assert.equal(c.file, SHIM);
    assert.ok(c.args.includes('dontAsk'));
    const files = JSON.parse(c.manifest).files;
    assert.equal(files.length, 12);
    files.forEach((f, i) => {
      assert.equal(f.path, `inputs/${String(i + 1).padStart(2, '0')}.jpg`);
      assert.ok(f.src.endsWith(`-${i + 1}.jpg`), '프레임 순서 보존');
    });
    const prompt = c.args[1];
    assert.match(prompt, /\[프레임 이미지 파일 경로\(현재 작업 폴더 기준\) — Read 툴로/);
    assert.match(prompt, /1\. inputs\/01\.jpg\n2\. inputs\/02\.jpg/);
    assert.ok(!prompt.includes(os.tmpdir()) && !prompt.includes('/tmp/'));
    fs.rmSync(upDir, { recursive: true, force: true });
  } finally { reset(); }
});

function fakeFetch(bodies) {
  let i = 0;
  return async () => {
    const { buf, mime } = bodies[Math.min(i++, bodies.length - 1)];
    return { ok: true, status: 200, headers: { get: () => mime }, arrayBuffer: async () => buf };
  };
}

test('videoAnalysis.analyzePhotoPost: 사진 3장(jpg·png 섞임)을 게시물 순서대로 보낸다', async () => {
  const dir = tmpDir();
  const origFetch = globalThis.fetch;
  try {
    setPath(SHIM);
    claudeReply = '사진 요약';
    ytdlpEntries = [1, 2, 3].map(n => ({ thumbnails: [{ url: `https://example.invalid/${n}` }], description: '합성 캡션' }));
    globalThis.fetch = fakeFetch([
      { buf: Buffer.from('a'), mime: 'image/jpeg' },
      { buf: Buffer.from('bb'), mime: 'image/png' },
      { buf: Buffer.from('ccc'), mime: 'image/jpeg' },
    ]);
    const r = await videoAnalysis.analyzePhotoPost('https://example.invalid/p/1', null, null,
      { persistDir: null, photoPrefix: path.join(dir, 'photo'), sink: [] });
    assert.equal(r.description, '사진 요약');
    assert.equal(r.photoCount, 3);
    const shimCalls = calls.filter(c => c.file === SHIM);
    assert.equal(shimCalls.length, 1);
    const files = JSON.parse(shimCalls[0].manifest).files;
    // 다운로드는 동시 3장이라 끝나는 순서가 섞여도 이름은 photo-N 순서를 따른다.
    assert.deepEqual(files.map(f => path.basename(f.src)), ['photo-1.jpg', 'photo-2.png', 'photo-3.jpg']);
    assert.deepEqual(files.map(f => f.path), ['inputs/01.jpg', 'inputs/02.png', 'inputs/03.jpg']);
    assert.deepEqual(files.map(f => f.size), [1, 2, 3]);
    assert.match(shimCalls[0].args[1], /\[사진 파일 경로\(현재 작업 폴더 기준\) — Read 툴로/);
    assert.ok(!shimCalls[0].args[1].includes(dir));
  } finally { reset(); globalThis.fetch = origFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('videoAnalysis.analyzePhotoPost: 한 장이 16MiB 를 넘으면 사진을 빼지 않고 spawn 전에 실패', async () => {
  const dir = tmpDir();
  const origFetch = globalThis.fetch;
  try {
    setPath(SHIM);
    ytdlpEntries = [1, 2].map(n => ({ thumbnails: [{ url: `https://example.invalid/${n}` }] }));
    globalThis.fetch = fakeFetch([
      { buf: Buffer.from('a'), mime: 'image/jpeg' },
      { buf: Buffer.alloc(16 * MiB + 1), mime: 'image/jpeg' },
    ]);
    await assert.rejects(
      videoAnalysis.analyzePhotoPost('https://example.invalid/p/2', null, null,
        { persistDir: null, photoPrefix: path.join(dir, 'photo'), sink: [] }),
      /AI 분석 이미지 용량 한도 초과 — 2번째/);
    assert.equal(calls.filter(c => c.file === SHIM || c.file === 'claude').length, 0);
  } finally { reset(); globalThis.fetch = origFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('videoAnalysis.analyzePhotoPost: env 없음 → 기존 절대 경로 프롬프트·claude·fd 3 없음', async () => {
  const dir = tmpDir();
  const origFetch = globalThis.fetch;
  try {
    setPath(undefined);
    ytdlpEntries = [{ thumbnails: [{ url: 'https://example.invalid/1' }] }];
    globalThis.fetch = fakeFetch([{ buf: Buffer.from('a'), mime: 'image/jpeg' }]);
    await videoAnalysis.analyzePhotoPost('https://example.invalid/p/3', null, null,
      { persistDir: null, photoPrefix: path.join(dir, 'photo'), sink: [] });
    const c = calls.find(x => x.file === 'claude');
    assert.ok(c);
    assert.deepEqual(c.opts.stdio, ['ignore', 'pipe', 'pipe']);
    assert.ok(c.args.includes('bypassPermissions'));
    assert.ok(c.args[1].includes(`[사진 파일 경로 — Read 툴로 각 파일을 순서대로 읽어 시각 분석해주세요]\n1. ${path.join(dir, 'photo-1.jpg')}`));
  } finally { reset(); globalThis.fetch = origFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

// longVideoPipeline 은 로드 때 DB 모델(sequelize)을 요구해 이 하네스에서 띄우지 않는다 — 소스로 고정한다.
test('소스 고정: B2 4곳은 inputs 를 넘기고, B5 masterChat 은 입력 경로를 쓰지 않는다', () => {
  const read = (m) => fs.readFileSync(svc(m), 'utf8');
  const count = (s, needle) => s.split(needle).length - 1;
  const va = read('videoAnalysis');
  const lv = read('longVideoPipeline');
  const cp = read('chapterPlanner');
  assert.equal(count(va, 'inputs: fileIn.inputs'), 2, 'videoAnalysis 2곳');
  assert.equal(count(lv, 'inputs: fileIn.inputs'), 1, 'longVideoPipeline 1곳');
  assert.equal(count(cp, 'inputs: fileIn.inputs'), 1, 'chapterPlanner 1곳');
  assert.ok(lv.includes("prepareFileInputs(frames.map(f => f.path), { tools: 'Read' })"));
  assert.ok(lv.includes('buildSegmentPrompt(video.title, chapterRow, promptFrames, subtitleText, fileIn.hint)'));
  assert.ok(lv.includes('[프레임 이미지 파일 경로${pathHint} — Read 툴로 순서대로 읽어주세요]'));
  // 예전 모양(입력 없이 Read)이 남아 있지 않다
  for (const s of [va, lv, cp]) {
    assert.ok(!/runClaude(Fn)?\([^)]*\{\s*tools:\s*'Read'\s*[,}](?![^}]*inputs)/.test(s.replace(/\n/g, ' ')));
  }
  const mc = read('masterChat');
  assert.ok(!mc.includes('prepareFileInputs') && !/\binputs\s*:/.test(mc), 'B5 무변경');
});
