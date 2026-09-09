// 연구 트리 공용 프리미티브 (task-030 — routes/research.js 에서 **그대로** 옮김).
//
// 왜 옮겼나: 관장의 승인 실행기(services/masterActions.js)가 프로젝트·노드·링크·과제를 만들 때
// 라우트와 **같은 검증·같은 소유 판별**을 써야 한다. 두 벌을 두면 한 벌만 고쳐지고, 그때
// "화면으로 만들면 400 인데 관장이 만들면 통과하는" 구멍이 생긴다.
//
// 🔴 **한 글자도 바꾸지 않았다.** 상수·메시지·SQL·정규화 규칙 전부 원본 그대로다.
//   research.js 는 이 모듈을 require 해 같은 이름으로 쓴다 — 1,700줄의 나머지 호출부는 무변경이다.
//   (Reviewer 대조 항목 ④: 추출 전후 라우트 응답 바이트 동일)
const { sequelize } = require('../config/db');
const { toNFC } = require('../utils/nfc');

// STRICT_TRANS_TABLES + utf8mb3: 길이 초과는 잘림이 아니라 **에러**이고 이모지는 500 이다.
// 여기서 400 으로 먼저 걸러 사용자에게 이유를 알려 준다(task-022 spar_causes 와 같은 처리).
const LIMITS = {
  title: 100, startPos: 50, goal: 200,     // research_projects
  versionName: 50,                          // research_versions.name
  label: 100, note: 500,                    // research_nodes
  memo: 200,                                // research_links.memo
};

/** 자유 텍스트 정본화 — NFC 정규화(task-014) + 좌우 공백 제거. */
function clean(raw) {
  return toNFC(String(raw ?? '')).trim();
}
/** VARCHAR(n) 은 문자 수 기준이므로 코드포인트로 센다(JS .length 는 이모지를 2로 세어 어긋난다). */
function textLen(s) {
  return [...s].length;
}
/** 이 DB 는 전 테이블 utf8mb3 — 4바이트 문자는 `Incorrect string value` 500 이 된다. */
function hasNonBMP(s) {
  return [...s].some((ch) => ch.codePointAt(0) > 0xFFFF);
}
/** 통과하면 null, 아니면 400 에 실을 메시지. */
function textError(label, s, max) {
  if (textLen(s) > max) return `${label}은(는) ${max}자 이내로 입력해주세요`;
  if (hasNonBMP(s))     return `${label}에 이모지는 사용할 수 없습니다`;
  return null;
}
/** 본문에 그 키가 실제로 있는가 — 부분 갱신(PATCH)의 정본 판정. undefined 값과 미전송을 구분한다. */
function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}
/** 양의 정수 파싱. 아니면 null. */
function posInt(v) {
  const n = parseInt(v, 10);
  return (Number.isInteger(n) && n > 0) ? n : null;
}

// ── 소유 판별 ────────────────────────────────────────────────────────────────
// 🔴 **딱 하나만 둔다.** 여러 벌 만들면 한 벌만 고쳐진다(계약 A-2).
//    네 SQL 전부 research_projects 까지 조인한다 — 정본이 거기 하나이기 때문이다.
const OWN_SQL = {
  project: `SELECT p.id, p.user_id, p.title, p.start_pos, p.goal,
                   DATE_FORMAT(p.created_at, '%Y-%m-%d') AS created_ymd
              FROM research_projects p
             WHERE p.id = ? AND p.user_id = ? LIMIT 1`,
  version: `SELECT v.*, p.user_id AS owner_id
              FROM research_versions v
              JOIN research_projects p ON p.id = v.project_id
             WHERE v.id = ? AND p.user_id = ? LIMIT 1`,
  node:    `SELECT n.*, v.project_id, p.user_id AS owner_id
              FROM research_nodes n
              JOIN research_versions  v ON v.id = n.version_id
              JOIN research_projects  p ON p.id = v.project_id
             WHERE n.id = ? AND p.user_id = ? LIMIT 1`,
  link:    `SELECT l.*, n.version_id, v.project_id, p.user_id AS owner_id
              FROM research_links l
              JOIN research_nodes    n ON n.id = l.node_id
              JOIN research_versions v ON v.id = n.version_id
              JOIN research_projects p ON p.id = v.project_id
             WHERE l.id = ? AND p.user_id = ? LIMIT 1`,
};

/**
 * 소유가 확인된 행을 돌려준다. 없거나 남의 것이면 **null**(호출부는 404 로 끝낸다).
 * @param entity 'project' | 'version' | 'node' | 'link'
 */
async function resolveOwned(userId, entity, rawId, t = null) {
  const id = posInt(rawId);
  if (id === null) return null;
  const [rows] = await sequelize.query(OWN_SQL[entity], {
    replacements: [id, userId], transaction: t,
  });
  return rows[0] || null;
}

/** 한 버전의 노드 전체 (DB 행 그대로 — researchTree 순수 함수의 입력 규약). */
async function nodesOfVersion(versionId, t = null) {
  const [rows] = await sequelize.query(
    `SELECT id, user_id, version_id, parent_node_id, kind, label, technique_id, sort_order, note
       FROM research_nodes WHERE version_id = ? ORDER BY sort_order ASC, id ASC`,
    { replacements: [versionId], transaction: t }
  );
  return rows;
}

/** 여러 버전의 노드를 **한 번에** 읽는다 — 목록 API 가 버전마다 부르면 N+1 이다. */
async function nodesOfVersions(versionIds, t = null) {
  if (!versionIds.length) return [];
  const [rows] = await sequelize.query(
    `SELECT id, user_id, version_id, parent_node_id, kind, label, technique_id, sort_order, note
       FROM research_nodes WHERE version_id IN (?) ORDER BY version_id ASC, sort_order ASC, id ASC`,
    { replacements: [versionIds], transaction: t }
  );
  return rows;
}

/**
 * 검증 실패를 나르는 에러. 라우트는 `e.__field` 를 보고 `fail(res, e.status, e.message)` 로 끝내고,
 * 승인 실행기는 같은 메시지를 `master_actions.result.error` 에 남긴다.
 * 🔴 메시지는 **사용자 언어**다 — 관장이 도구 에러로 되돌려 받아 스스로 고칠 수 있어야 한다.
 */
class FieldError extends Error {
  constructor(message, status = 400, extra = null) {
    super(message);
    this.name = 'FieldError';
    this.status = status;
    this.extra = extra;
    this.__field = true;
  }
}

module.exports = {
  LIMITS, clean, textLen, hasNonBMP, textError, has, posInt,
  OWN_SQL, resolveOwned, nodesOfVersion, nodesOfVersions,
  FieldError,
};
