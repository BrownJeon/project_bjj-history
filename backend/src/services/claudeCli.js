const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
    agents, agent, mcpConfig, strictMcp, maxTurns, outputFormat, jsonSchema, inputs,
  } = opts;

  const args = ['--print'];
  if (!stdinPrompt) args.push(prompt);
  // 입력 파일을 보내는 호출(cliclaude 1.2.0)은 dontAsk 가 필수다 — runner 가 bypassPermissions 와
  // 입력을 함께 받으면 125(input_requires_dontask)로 거절하고, bypass 는 cwd 밖 Read 를 막지 않는다.
  const permissionMode = hasInputs(inputs) ? 'dontAsk' : 'bypassPermissions';
  args.push('--permission-mode', permissionMode, '--model', model);
  // 배열이면 가변 인자로 펼친다(`--tools WebSearch`). 문자열이면 기존과 완전히 동일한 한 인자.
  if (tools === '') args.push('--tools', '');
  else if (tools) {
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

// ── 실행 파일 결정 (task-004 S-C1, cliclaude 이전) ─────────────────────────
// env CLAUDE_CLI_PATH 가 비어 있으면 항상 기존 'claude'(위 cleanEnv 의 PATH 앞붙임 포함) — 지금과 같다.
// 값이 있어도 아래 둘은 기존 'claude' 로 남긴다. 호출부 목록이 아니라 **인자**로 판정하는 이유는
// 새로 생기거나 목록에서 빠진 호출부(예: chapterPlanner 의 프레임 분석)도 같은 규칙에 걸리게 하기 위해서다.
//  ① 도구가 WebSearch·WebFetch 밖의 것을 하나라도 포함(Read 프레임·사진 분석 등) — cliclaude 계정은
//     앱 저장소 파일을 읽을 수 없고, Read 실패는 종료 코드가 아니라 모델 응답으로 돌아와 조용히 저장된다.
//  ② MCP 서버가 비어 있지 않음(관장 채팅) — 앱 MCP 스크립트·DB 자격을 cliclaude 쪽에 넘길 수 없다.
// 판정이 애매하면(파싱 불가 등) 기존 경로를 택한다. 실패 시 기존 CLI 로 되돌아가는 폴백은 두지 않는다.
// (task-004 S-C2b) ①의 예외: 도구가 Read·Grep·Glob 뿐이고 **입력 파일을 선언한**(inputs) 호출은 shim 으로 간다.
// 파일 내용은 fd 3 manifest 로 shim 이 앱 UID 로 읽어 job 폴더에 놓고, 프롬프트는 상대 이름만 쓴다.
// 입력을 선언하지 않은 Read 호출은 여전히 기존 'claude' 다.
const SHIM_SAFE_TOOLS = new Set(['WebSearch', 'WebFetch']);
const SHIM_FILE_TOOLS = new Set(['Read', 'Grep', 'Glob']);

// cliclaude 1.2.0 policy.py 상한(protocol.md §10-4). 넘으면 runner/shim 이 125 로 거절하므로 spawn 전에 막는다.
const INPUT_FILES_MAX = 5000;
const INPUT_FILE_MAX = 16 * 1024 * 1024;
const INPUT_TOTAL_MAX = 64 * 1024 * 1024;
// runner 이름 규칙(상대·ASCII·`.` 조각 없음)보다 좁게, 이 앱이 만드는 모양만 받는다.
const INPUT_NAME_RE = /^inputs\/[0-9]{2,}\.[a-z0-9]{1,8}$/;

function hasInputs(inputs) {
  return Array.isArray(inputs) && inputs.length > 0;
}

function toolNames(tools) {
  const list = Array.isArray(tools) ? tools : [tools];
  return list
    .flatMap(t => String(t).split(/[\s,]+/))
    .filter(Boolean)
    .map(t => t.replace(/\(.*$/, ''));
}

function hasMcpServers(mcpConfig) {
  if (!mcpConfig) return false;
  let cfg = mcpConfig;
  if (typeof cfg === 'string') {
    try { cfg = JSON.parse(cfg); } catch { return true; }
  }
  const servers = cfg && cfg.mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return true;
  return Object.keys(servers).length > 0;
}

function resolveClaudeExecutable(opts = {}) {
  const shimPath = (process.env.CLAUDE_CLI_PATH || '').trim();
  if (!shimPath) return 'claude';
  if (hasMcpServers(opts.mcpConfig)) return 'claude';
  const names = (opts.tools != null && opts.tools !== '') ? toolNames(opts.tools) : [];
  if (hasInputs(opts.inputs)) {
    return names.length && names.every(t => SHIM_FILE_TOOLS.has(t)) ? shimPath : 'claude';
  }
  if (names.some(t => !SHIM_SAFE_TOOLS.has(t))) return 'claude';
  return shimPath;
}

function mib(n) {
  return `${(n / (1024 * 1024)).toFixed(1)}MiB`;
}

// runClaude 의 inputs 를 검사·정규화한다. 빈 배열은 "입력 없음"(지금과 같은 spawn)이다.
// 오류 문구에 호스트 경로를 싣지 않는다 — 작업 오류로 화면·로그에 남는다.
function normalizeInputs(inputs) {
  if (inputs == null) return undefined;
  if (!Array.isArray(inputs)) throw new Error('AI 입력 파일 목록 형식이 올바르지 않습니다');
  if (!inputs.length) return undefined;
  if (inputs.length > INPUT_FILES_MAX) {
    throw new Error(`AI 분석 입력 파일이 너무 많습니다 (${inputs.length}개, 최대 ${INPUT_FILES_MAX}개)`);
  }
  const seen = new Set();
  let total = 0;
  return inputs.map((x, i) => {
    const n = i + 1;
    if (!x || typeof x.src !== 'string' || !path.isAbsolute(x.src) || x.src.includes('\0')) {
      throw new Error(`AI 입력 파일 ${n}번의 원본 경로가 올바르지 않습니다`);
    }
    if (typeof x.path !== 'string' || !INPUT_NAME_RE.test(x.path)) {
      throw new Error(`AI 입력 파일 ${n}번의 이름이 올바르지 않습니다`);
    }
    if (seen.has(x.path)) throw new Error(`AI 입력 파일 ${n}번의 이름이 중복됩니다`);
    seen.add(x.path);
    const out = { src: x.src, path: x.path };
    if (x.size != null) {
      if (!Number.isSafeInteger(x.size) || x.size < 0) throw new Error(`AI 입력 파일 ${n}번의 크기 값이 올바르지 않습니다`);
      if (x.size > INPUT_FILE_MAX) {
        throw new Error(`AI 분석 이미지 용량 한도 초과 — ${n}번째 ${mib(x.size)} (장당 최대 ${mib(INPUT_FILE_MAX)})`);
      }
      total += x.size;
      out.size = x.size;
    }
    if (x.sha256 != null) {
      if (typeof x.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(x.sha256)) {
        throw new Error(`AI 입력 파일 ${n}번의 sha256 값이 올바르지 않습니다`);
      }
      out.sha256 = x.sha256;
    }
    if (total > INPUT_TOTAL_MAX) {
      throw new Error(`AI 분석 이미지 용량 한도 초과 — 합계 ${mib(total)} 이상 (최대 ${mib(INPUT_TOTAL_MAX)})`);
    }
    return out;
  });
}

/**
 * 파일을 읽히는 호출부(B2)용 준비. 실행 경로를 **한 번** 정하고 그에 맞는 프롬프트 참조를 돌려준다.
 *  - shim 경로(env 설정 + Read 계열 도구 + MCP 없음): refs = `inputs/01.jpg`…(순서 보존), inputs = fd 3 manifest 항목,
 *    hint = 프롬프트 머리에 붙일 "(현재 작업 폴더 기준)". 크기 상한을 넘으면 spawn 전에 던진다.
 *  - 그 밖(env 비어 있음 등): refs = 기존 절대 경로, inputs 없음, hint '' — 프롬프트·argv 가 S-C1(1.4.0)과 바이트 동일.
 *    env 만 지우는 롤백이 곧 지금 동작으로의 복귀가 되게 하려는 것이다.
 * @param {string[]} files 호출부가 이미 만든(검증한) 절대 경로, 프롬프트에 나열할 순서 그대로
 * @param {{tools?:string|string[], mcpConfig?:any}} opts runClaude 에 넘길 것과 같은 도구·MCP 옵션
 */
async function prepareFileInputs(files, opts = {}) {
  const list = Array.isArray(files) ? files.map(String) : [];
  const legacy = { refs: list, inputs: undefined, hint: '' };
  if (!list.length) return legacy;
  const viaShim = resolveClaudeExecutable({ tools: opts.tools, mcpConfig: opts.mcpConfig, inputs: list }) !== 'claude';
  if (!viaShim) return legacy;

  if (list.length > INPUT_FILES_MAX) {
    throw new Error(`AI 분석 입력 파일이 너무 많습니다 (${list.length}개, 최대 ${INPUT_FILES_MAX}개)`);
  }
  const width = Math.max(2, String(list.length).length);
  const inputs = [];
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const n = i + 1;
    const src = list[i];
    if (!path.isAbsolute(src)) throw new Error(`AI 입력 파일 ${n}번의 원본 경로가 올바르지 않습니다`);
    let st;
    try {
      st = await fs.promises.lstat(src);
    } catch {
      throw new Error(`AI 입력 파일 ${n}번을 읽을 수 없습니다`);
    }
    // shim 은 마지막 조각을 O_NOFOLLOW 로 연다 — symlink·폴더는 거기서 125 가 되므로 여기서 먼저 알린다.
    if (!st.isFile()) throw new Error(`AI 입력 파일 ${n}번이 일반 파일이 아닙니다`);
    if (st.size > INPUT_FILE_MAX) {
      throw new Error(`AI 분석 이미지 용량 한도 초과 — ${n}번째 ${mib(st.size)} (장당 최대 ${mib(INPUT_FILE_MAX)})`);
    }
    total += st.size;
    const ext = path.extname(src).toLowerCase();
    if (!/^\.[a-z0-9]{1,8}$/.test(ext)) throw new Error(`AI 입력 파일 ${n}번의 확장자를 알 수 없습니다`);
    inputs.push({ src, path: `inputs/${String(n).padStart(width, '0')}${ext}`, size: st.size });
  }
  if (total > INPUT_TOTAL_MAX) {
    throw new Error(`AI 분석 이미지 용량 한도 초과 — 합계 ${mib(total)}, ${list.length}장 (최대 ${mib(INPUT_TOTAL_MAX)})`);
  }
  return { refs: inputs.map(x => x.path), inputs, hint: '(현재 작업 폴더 기준)' };
}

// stdinPrompt:false(기본값) → 기존과 100% 동일하게 프롬프트를 argv로 전달.
// stdinPrompt:true          → argv에 프롬프트를 넣지 않고 stdin에 write(ARG_MAX 회피, `--print`가 공식 지원).
function runClaudeOnce(prompt, opts) {
  const { timeoutMs, stdinPrompt, outputFormat, onEvent, inputs } = opts;
  return new Promise((resolve, reject) => {
    const args = buildArgs(prompt, opts);
    const file = resolveClaudeExecutable(opts);
    const withInputs = hasInputs(inputs);
    // 상대 이름 프롬프트를 기존 claude 로 보내면 Read 가 조용히 실패한 응답이 저장된다 — 대신 실패시킨다.
    if (withInputs && file === 'claude') {
      return reject(new Error('AI 입력 파일은 cliclaude 실행 경로(CLAUDE_CLI_PATH)에서 Read 계열 도구로만 보낼 수 있습니다'));
    }

    const stdio = stdinPrompt ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'];
    // fd 3 은 입력이 있을 때만 연다 — 입력 없는 호출의 spawn 옵션은 S-C1 과 같다.
    if (withInputs) stdio.push('pipe');
    const proc = spawn(file, args, {
      timeout: timeoutMs,
      cwd: '/tmp',
      env: cleanEnv(),
      stdio,
    });

    if (withInputs) {
      const manifestPipe = proc.stdio && proc.stdio[3];
      if (!manifestPipe) {
        // manifest 없이 돌면 shim 은 입력 없는 요청으로 보고, 모델은 없는 파일을 읽으려다 엉뚱한 답을 낸다.
        proc.on('error', () => {});
        try { proc.kill('SIGTERM'); } catch { /* 이미 끝남 */ }
        return reject(new Error('AI 입력 파일 전달 통로(fd 3)를 열지 못했습니다'));
      }
      // shim 이 manifest 를 다 읽기 전에 끝나면(롤백·기동 실패 등) EPIPE 가 난다. 처리기가 없으면
      // 프로세스 전체가 죽는다. 결과 판정은 close 의 종료 코드가 맡는다.
      manifestPipe.on('error', e => { console.error('[claudeCli] 입력 manifest 전달 실패:', (e && e.code) || 'error'); });
      manifestPipe.end(JSON.stringify({ cliclaude_inputs: 1, files: inputs }));
    }

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
  // 입력이 있을 때만 키를 둔다 — 입력 없는 호출의 옵션 모양은 그대로다.
  const inputs = normalizeInputs(opts.inputs);
  if (inputs) {
    if (resolveClaudeExecutable({ tools, mcpConfig: opts.mcpConfig, inputs }) === 'claude') {
      throw new Error('AI 입력 파일은 cliclaude 실행 경로(CLAUDE_CLI_PATH)에서 Read 계열 도구로만 보낼 수 있습니다');
    }
    once.inputs = inputs;
  }
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
module.exports = { runClaude, buildArgs, resolveClaudeExecutable, prepareFileInputs };
