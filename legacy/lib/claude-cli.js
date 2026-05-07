const { spawn } = require('child_process');

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

function cleanEnv() {
  const env = { ...process.env };
  for (const k of REMOVE_ENV_KEYS) delete env[k];
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
        if (tries < 2 && msg.includes('Execution error')) {
          await new Promise(r => setTimeout(r, 300 + tries * 500));
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
