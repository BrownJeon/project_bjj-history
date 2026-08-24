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

// stdinPrompt:false(기본값) → 기존과 100% 동일하게 프롬프트를 argv로 전달.
// stdinPrompt:true          → argv에 프롬프트를 넣지 않고 stdin에 write(ARG_MAX 회피, `--print`가 공식 지원).
function runClaudeOnce(prompt, { tools, timeoutMs, stdinPrompt }) {
  return new Promise((resolve, reject) => {
    const args = ['--print'];
    if (!stdinPrompt) args.push(prompt);
    args.push('--permission-mode', 'bypassPermissions', '--model', 'sonnet');
    if (tools) args.push('--tools', tools);

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
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('error', e => {
      if (e.code === 'ENOENT') reject(new Error('claude CLI가 설치되어 있지 않거나 PATH에 없습니다'));
      else reject(e);
    });
    proc.on('close', code => {
      if (code !== 0 && code !== null) return reject(new Error(err.trim() || `claude 종료 코드: ${code}`));
      const trimmed = out.trim();
      if (trimmed === 'Execution error' || trimmed.startsWith('Execution error\n')) {
        return reject(new Error(`claude Execution error: ${err.trim() || 'no stderr'}`));
      }
      resolve(trimmed);
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
  // maxRetries 기본값: interactive=3(기존과 동일한 총 시도 횟수), batch=1(배치가 인터랙티브를
  // 오래 막지 않도록 재시도를 억제 — 개별 호출부가 필요하면 명시적으로 override 가능, 예: S8의 retry 1회 → maxRetries:2)
  const defaultMaxRetries = priority === 'batch' ? 1 : 3;
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : defaultMaxRetries;

  assertPromptSize(prompt);

  const attempt = async () => {
    let lastErr;
    for (let tries = 0; tries < maxRetries; tries++) {
      try {
        return await runClaudeOnce(prompt, { tools, timeoutMs, stdinPrompt });
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

module.exports = { runClaude };
