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

let cliQueue = Promise.resolve();

function runClaudeOnce(prompt, { tools, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const args = ['--print', prompt, '--permission-mode', 'bypassPermissions', '--model', 'sonnet'];
    if (tools) args.push('--tools', tools);

    const proc = spawn('claude', args, {
      timeout: timeoutMs,
      cwd: '/tmp',
      env: cleanEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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

async function runClaude(prompt, opts = {}) {
  const { tools, timeoutMs = 180000 } = opts;
  const attempt = async () => {
    for (let tries = 0; tries < 3; tries++) {
      try {
        return await runClaudeOnce(prompt, { tools, timeoutMs });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Execution error, exit 1, 일시적 실패 → 재시도
        const isRetryable = msg.includes('Execution error')
          || msg.includes('종료 코드: 1')
          || msg.includes('exit 1');
        if (tries < 2 && isRetryable) {
          await new Promise(r => setTimeout(r, 1000 + tries * 1000));
          continue;
        }
        throw e;
      }
    }
    throw new Error('unreachable');
  };
  const prev = cliQueue;
  const next = prev.then(() => attempt(), () => attempt());
  cliQueue = next.catch(() => {});
  return next;
}

module.exports = { runClaude };
