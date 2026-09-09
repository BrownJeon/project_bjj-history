const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const REMOVE_ENV_KEYS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING',
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_AGENT_SDK_VERSION',
  'VSCODE_IPC_HOOK_CLI',
  'VSCODE_CLI_REQUIRE_TOKEN',
  'VSCODE_HANDLES_UNCAUGHT_ERRORS',
  'VSCODE_HANDLES_SIGPIPE',
  'VSCODE_ESM_ENTRYPOINT',
  'VSCODE_L10N_BUNDLE_LOCATION',
  'VSCODE_NLS_CONFIG',
  'VSCODE_AGENT_FOLDER',
  'VSCODE_CWD',
  'ELECTRON_RUN_AS_NODE',
  'ANTHROPIC_API_KEY',
];

// 사용자 로컬 npm global 경로 (~/.npm-global/bin)를 PATH 앞에 추가해
// 시스템 claude(구버전)보다 최신 사용자 claude가 우선 사용되도록 한다.
// 배경: /usr/bin/claude 2.1.142 에 tools.Read input_schema(oneOf) 버그가 있어
//       API 400 오류("input_schema does not support oneOf/allOf/anyOf")가 발생함.
function cleanEnv() {
  const env = { ...process.env };
  for (const k of REMOVE_ENV_KEYS) delete env[k];
  const npmGlobalBin = `${os.homedir()}/.npm-global/bin`;
  if (fs.existsSync(npmGlobalBin) && env.PATH && !env.PATH.startsWith(npmGlobalBin)) {
    env.PATH = `${npmGlobalBin}:${env.PATH}`;
  }
  return env;
}

// ── ARG_MAX 방어 (task-008, §3-C) ──────────────────────────────────────────
// MAX_ARG_STRLEN(131,072바이트) 단일 argv 인자 한계를 실측했다(설계서 "설계 중 실측한 사실").
// stdinPrompt:false(기존 5개 호출부 전부 이 기본값)일 때는 이 하드캡이 기존과 동일하게 적용되며,
// 기존 5개 기능의 프롬프트는 전부 이 한계에 훨씬 못 미쳐(최대 수천 자) 실질적 동작 변화가 없다.
const PROMPT_CHAR_CAP = 24000;
const PROMPT_BYTE_CAP = 100000;

function assertPromptSize(prompt) {
  if (typeof prompt !== 'string') return;
  if (prompt.length > PROMPT_CHAR_CAP) {
    throw new Error(`프롬프트가 너무 깁니다 (${prompt.length}자) — ${PROMPT_CHAR_CAP}자 이내로 줄여주세요`);
  }
  const bytes = Buffer.byteLength(prompt, 'utf8');
  if (bytes >= PROMPT_BYTE_CAP) {
    throw new Error(`프롬프트가 너무 깁니다 (${bytes}바이트) — ${PROMPT_BYTE_CAP}바이트 미만으로 줄여주세요`);
  }
}

// ── 관장실 확장 옵션 (task-030, 계약 E) ────────────────────────────────────
// 🔴 **미지정 시 argv 는 지금과 바이트 단위로 같다.** 기존 호출부 16곳(AI 5기능)의 회귀를 0으로
//    유지하는 것이 이 확장의 첫 번째 요건이라, 새 인자는 전부 "값이 있을 때만 push" 한다.
//    변경 전후 argv 덤프 대조는 QA 하네스(`05-argv.js`)가 재현한다.
// 🔴 `--tools`·`--agents`·`--mcp-config` 는 **가변/긴 인자**다. 그래서 프롬프트는 지금처럼
//    argv 두 번째(`--print` 바로 뒤)에 둔다 — 뒤에 두면 가변 인자가 프롬프트를 삼킨다(P0-1 실측).
// 🔴 `--model` 은 지금까지 'sonnet' 하드코딩이었다. 옵션화하되 **기본값이 'sonnet'** 이라
//    미지정 호출부의 argv 는 글자 하나 달라지지 않는다.
function buildArgs(prompt, opts) {
  const {
    tools, stdinPrompt,
    model = 'sonnet',
    agents, agent, mcpConfig, strictMcp, maxTurns, outputFormat, jsonSchema,
  } = opts;

  const args = ['--print'];
  if (!stdinPrompt) args.push(prompt);
  args.push('--permission-mode', 'bypassPermissions', '--model', model);
  // 배열이면 가변 인자로 펼친다(`--tools WebSearch`). 문자열이면 기존과 완전히 동일한 한 인자.
  if (tools) {
    if (Array.isArray(tools)) { if (tools.length) args.push('--tools', ...tools.map(String)); }
    else args.push('--tools', tools);
  }
  if (agents)    args.push('--agents', typeof agents === 'string' ? agents : JSON.stringify(agents));
  if (agent)     args.push('--agent', String(agent));
  if (mcpConfig) args.push('--mcp-config', typeof mcpConfig === 'string' ? mcpConfig : JSON.stringify(mcpConfig));
  if (strictMcp) args.push('--strict-mcp-config');
  if (maxTurns != null) args.push('--max-turns', String(maxTurns));
  if (jsonSchema) args.push('--json-schema', typeof jsonSchema === 'string' ? jsonSchema : JSON.stringify(jsonSchema));
  // stream-json 은 `--verbose` 가 없으면 CLI 가 거부한다(P0-3 실측).
  if (outputFormat === 'stream-json') args.push('--output-format', 'stream-json', '--verbose');
  return args;
}

// stdinPrompt:false(기본값) → 기존과 100% 동일하게 프롬프트를 argv로 전달.
// stdinPrompt:true          → argv에 프롬프트를 넣지 않고 stdin에 write(ARG_MAX 회피, `--print`가 공식 지원).
function runClaudeOnce(prompt, opts) {
  const { timeoutMs, stdinPrompt, outputFormat, onEvent } = opts;
  return new Promise((resolve, reject) => {
    const args = buildArgs(prompt, opts);

    const proc = spawn('claude', args, {
      timeout: timeoutMs,
      cwd: '/tmp',
      env: cleanEnv(),
      stdio: stdinPrompt ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });

    if (stdinPrompt) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    let out = '', err = '';
    // stream-json 은 NDJSON 이다 — 청크 경계가 줄 경계와 일치하지 않으므로 **줄 버퍼**가 필수다.
    // 반쪽 줄을 그대로 JSON.parse 하면 이벤트를 조용히 잃는다.
    let lineBuf = '';
    const events = [];
    const streaming = outputFormat === 'stream-json';
    const feed = (chunk) => {
      lineBuf += chunk;
      let nl;
      while ((nl = lineBuf.indexOf('\n')) !== -1) {
        const line = lineBuf.slice(0, nl).trim();
        lineBuf = lineBuf.slice(nl + 1);
        if (!line) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }   // 파싱 실패 줄은 무시(계약 E)
        events.push(obj);
        if (onEvent) { try { onEvent(obj); } catch (e) { console.error('[claudeCli] onEvent 오류:', e.message); } }
      }
    };

    proc.stdout.on('data', d => {
      const s = d.toString();
      out += s;
      if (streaming) feed(s);
    });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('error', e => {
      if (e.code === 'ENOENT') reject(new Error('claude CLI가 설치되어 있지 않거나 PATH에 없습니다'));
      else reject(e);
    });
    proc.on('close', code => {
      if (streaming && lineBuf.trim()) feed('\n');   // 개행 없이 끝난 마지막 줄
      if (code !== 0 && code !== null) return reject(new Error(err.trim() || `claude 종료 코드: ${code}`));
      const trimmed = out.trim();
      if (trimmed === 'Execution error' || trimmed.startsWith('Execution error\n')) {
        return reject(new Error(`claude Execution error: ${err.trim() || 'no stderr'}`));
      }
      if (!streaming) return resolve(trimmed);

      // stream-json 반환값(계약 E): { text, init, result }
      const init   = events.find(e => e && e.type === 'system' && e.subtype === 'init') || null;
      const result = events.find(e => e && e.type === 'result') || null;
      const text = result && typeof result.result === 'string' ? result.result.trim() : '';
      if (result && result.is_error) {
        return reject(new Error(String(result.result || 'claude 실행 오류').slice(0, 500)));
      }
      resolve({ text, init, result, events });
    });
  });
}

// ── 우선순위 2레인 스케줄러 (task-008, §3-A) ────────────────────────────────
// 동시성은 계속 1로 유지(구독 rate limit·CPU 보호) — 바뀌는 건 스케줄링 "순서"뿐이다.
// 호출이 끝날 때마다 interactive 큐를 먼저 비우고, 비었을 때만 batch 큐에서 하나를 집는다.
// priority를 지정하지 않으면(기존 5개 호출부 전부 여기 해당) 'interactive'로 취급되어
// 기존의 단일 FIFO 큐와 스케줄링 결과가 동일하다(레인이 하나뿐이면 batch 레인은 항상 비어있으므로).
const interactiveQueue = [];
const batchQueue = [];
let workerBusy = false;

function schedule(priority, task) {
  return new Promise((resolve, reject) => {
    const item = { task, resolve, reject };
    if (priority === 'batch') batchQueue.push(item);
    else interactiveQueue.push(item);
    pump();
  });
}

function pump() {
  if (workerBusy) return;
  const item = interactiveQueue.shift() || batchQueue.shift();
  if (!item) return;
  workerBusy = true;
  item.task().then(
    (result) => { workerBusy = false; item.resolve(result); pump(); },
    (err)    => { workerBusy = false; item.reject(err);     pump(); }
  );
}

async function runClaude(prompt, opts = {}) {
  const {
    tools,
    timeoutMs = 180000,
    priority = 'interactive',
    stdinPrompt = false,
  } = opts;
  // 계약 E 의 새 옵션들은 그대로 runClaudeOnce 로 흘려보낸다(구조분해로 떨어뜨리지 않는다).
  const once = {
    tools, timeoutMs, stdinPrompt,
    model: opts.model, agents: opts.agents, agent: opts.agent,
    mcpConfig: opts.mcpConfig, strictMcp: opts.strictMcp, maxTurns: opts.maxTurns,
    outputFormat: opts.outputFormat, jsonSchema: opts.jsonSchema, onEvent: opts.onEvent,
  };
  // 🔴 model 미지정이면 buildArgs 의 기본값 'sonnet' 이 그대로 쓰인다 — undefined 를 넘겨도
  //    기본 매개변수가 동작하도록 키를 지우지 않고 그대로 둔다(구조분해 기본값은 undefined 에만 적용).
  // maxRetries 기본값: interactive=3(기존과 동일한 총 시도 횟수), batch=1(배치가 인터랙티브를
  // 오래 막지 않도록 재시도를 억제 — 개별 호출부가 필요하면 명시적으로 override 가능, 예: S8의 retry 1회 → maxRetries:2)
  const defaultMaxRetries = priority === 'batch' ? 1 : 3;
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : defaultMaxRetries;

  assertPromptSize(prompt);

  const attempt = async () => {
    let lastErr;
    for (let tries = 0; tries < maxRetries; tries++) {
      try {
        return await runClaudeOnce(prompt, once);
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        // Execution error, exit 1, 일시적 실패 → 재시도
        const isRetryable = msg.includes('Execution error')
          || msg.includes('종료 코드: 1')
          || msg.includes('exit 1');
        if (tries < maxRetries - 1 && isRetryable) {
          await new Promise(r => setTimeout(r, 1000 + tries * 1000));
          continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error('unreachable');
  };

  return schedule(priority, attempt);
}

// buildArgs 를 export 하는 것은 편의가 아니라 **검증 요건**이다(task-030).
// 기존 16개 호출부의 argv 가 변경 전후로 바이트 동일한지 QA 가 claude 를 실제로 띄우지 않고
// 잴 수 있어야 한다. spawn 을 스텁하는 방식은 큐·재시도까지 얽혀 재현이 어렵다.
module.exports = { runClaude, buildArgs };
