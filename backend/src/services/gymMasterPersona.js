// 관장 페르소나 로더 (task-030 · 기획서 §6)
//
// `.claude/agents/gym-master.md` **한 파일**이 페르소나의 정본이다. 앱 런타임(`--agents` JSON 주입)과
// Claude Code 세션(서브에이전트 정의)이 같은 파일을 읽는다 — 두 벌로 갈라 두면 한쪽만 고쳐진다.
//
// 🔴 소스 정본은 NFS 위에 있다. NFS 가 잠깐 멎어도 진행 중인 대화가 죽지 않도록 **메모리 캐시**를
//    둔다(mtime 이 같으면 재파싱조차 하지 않는다). 읽기에 실패하면 마지막으로 성공한 캐시를 쓰고,
//    캐시조차 없으면 사용자 언어 에러를 던진다 — 조용히 빈 페르소나로 관장을 띄우지 않는다.
//    (빈 페르소나로 뜨면 "관장이 아닌 일반 챗봇"이 되는데, 그건 에러보다 나쁘다: 사용자가 알 수 없다.)
//
// 🔴 `--agents` 로 넘기는 JSON 에 `model` 을 **싣지 않는다.** 모델은 `--model`(프로필 설정값)이
//    권위다. 둘 다 실으면 어느 쪽이 이기는지가 CLI 버전에 달리게 되고, 그러면 프로필에서 haiku 를
//    골라도 opus 가 답하는 조용한 불일치가 생긴다. frontmatter 의 `model: opus` 는 Claude Code
//    세션에서 이 에이전트를 부를 때 쓰이는 값이고, 앱 런타임의 기본값은 masterChat 이 정한다.
const fs   = require('fs');
const path = require('path');

const PERSONA_PATH = path.resolve(__dirname, '../../../.claude/agents/gym-master.md');
const AGENT_NAME   = 'gym-master';

let cache = null;   // { mtimeMs, size, agent: {description, prompt}, frontmatter }

/**
 * 아주 작은 frontmatter 파서 — `---` 로 감싼 `key: value` 줄만 읽는다.
 * YAML 라이브러리를 넣지 않는 이유: 이 파일의 frontmatter 는 4줄(name·description·model·tools)이고,
 * 의존성을 하나 더 다는 것보다 20줄을 읽는 편이 감사하기 쉽다.
 * 🔴 값에 `:` 가 들어 있어도 **첫 번째** 콜론에서만 자른다(description 에 콜론이 실제로 들어온다).
 */
function parseFrontmatter(raw) {
  const text = String(raw ?? '').replace(/^﻿/, '');
  if (!text.startsWith('---')) return { frontmatter: {}, body: text.trim() };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: text.trim() };

  const head = text.slice(text.indexOf('\n') + 1, end);
  const body = text.slice(end + 4).replace(/^\r?\n/, '');
  const frontmatter = {};
  for (const line of head.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let value  = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) frontmatter[key] = value;
  }
  return { frontmatter, body: body.trim() };
}

/**
 * `--agents` 에 실을 정의 한 벌을 돌려준다.
 * @returns {{ agents: {[name]: {description, prompt}}, name: string, frontmatter: object, cached: boolean }}
 */
function loadPersona() {
  let stat = null;
  try {
    stat = fs.statSync(PERSONA_PATH);
  } catch (e) {
    if (cache) {
      console.error('[gym-master] 페르소나 파일 stat 실패 — 캐시 사용:', e.message);
      return { agents: { [AGENT_NAME]: cache.agent }, name: AGENT_NAME, frontmatter: cache.frontmatter, cached: true };
    }
    throw new Error('관장 정의 파일을 읽지 못했어요 — 잠시 후 다시 시도해 주세요');
  }

  if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) {
    return { agents: { [AGENT_NAME]: cache.agent }, name: AGENT_NAME, frontmatter: cache.frontmatter, cached: true };
  }

  let raw;
  try {
    raw = fs.readFileSync(PERSONA_PATH, 'utf8');
  } catch (e) {
    if (cache) {
      console.error('[gym-master] 페르소나 파일 읽기 실패 — 캐시 사용:', e.message);
      return { agents: { [AGENT_NAME]: cache.agent }, name: AGENT_NAME, frontmatter: cache.frontmatter, cached: true };
    }
    throw new Error('관장 정의 파일을 읽지 못했어요 — 잠시 후 다시 시도해 주세요');
  }

  const { frontmatter, body } = parseFrontmatter(raw);
  if (!body) {
    if (cache) {
      console.error('[gym-master] 페르소나 본문이 비었다 — 캐시 사용');
      return { agents: { [AGENT_NAME]: cache.agent }, name: AGENT_NAME, frontmatter: cache.frontmatter, cached: true };
    }
    throw new Error('관장 정의가 비어 있어요 — 관리자에게 알려주세요');
  }

  // 🔴 model 은 일부러 넣지 않는다(파일 상단 주석 참고).
  const agent = {
    description: frontmatter.description || 'BJJ 훈련일지의 관장 페르소나',
    prompt: body,
  };
  cache = { mtimeMs: stat.mtimeMs, size: stat.size, agent, frontmatter };
  console.log(`[gym-master] 페르소나 로드 — ${body.length}자 (mtime ${new Date(stat.mtimeMs).toISOString()})`);
  return { agents: { [AGENT_NAME]: agent }, name: AGENT_NAME, frontmatter, cached: false };
}

module.exports = { loadPersona, parseFrontmatter, PERSONA_PATH, AGENT_NAME };
