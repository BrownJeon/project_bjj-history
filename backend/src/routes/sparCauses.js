const express = require('express');
const router  = express.Router();
const { sequelize, SparCause } = require('../models');
const { ok, fail, wrap } = require('../utils/respond');
const { toNFC } = require('../utils/nfc');

// 실패 원인 태그 CRUD (task-022 · task-045 · docs/recall-lab-spec.md §4.1)
//
// 왜 별도 파일인가: 경로가 `/api/spar-causes` 로 클래스 하위가 아니다. classes.js 는
// `/api/classes` 에 마운트돼 있어 그 안에서는 이 경로를 낼 수 없고, 이 앱은 도메인 하나당
// 라우터 파일 하나가 관례다(techniques·picks·clips…). 태그는 스파링 기록과 수명이 다른
// 독립 어휘 사전이므로 파일도 분리한다.

// spar_causes.name VARCHAR(40). sql_mode 에 STRICT_TRANS_TABLES 가 있어 초과는 잘림이 아니라
// **에러**다 — 여기서 먼저 막아 사용자에게 이유를 알려 준다. 프론트도 maxLength 로 같이 막는다.
const NAME_MAX = 40;

/** 태그 이름 정본화 — NFC 정규화(task-014) + 좌우 공백 제거. 비교·저장 모두 이 값을 쓴다. */
function cleanName(raw) {
  return toNFC(String(raw ?? '')).trim();
}

// ─── 기본 태그 (task-045, 관장 확정 2026-09-22) ─────────────────────────────
// 🔴 **이 배열이 선택지의 정본이다.** task-022 의 시드(그립·각도·타이밍·연결 없음)는 "처음 한 번
//    넣어 주는 값"이었고 `+` 로 추가한 태그도 `active=1` 로 영구히 선택지에 남았다 — 자유 서술이
//    태그로 쌓이기만 하고 지울 길이 없었다(사용자 보고). 이제 `active` 의 뜻은
//    **"선택지에 뜨는가 = 기본 태그인가"** 이고, 그 값은 사용자가 아니라 syncDefaults() 가 정한다.
//    순서(index)가 곧 화면 순서(sort)다. 뜻·구분 기준: docs/recall-lab-spec.md §4.1.1.
// `·` 는 U+00B7(2바이트) — utf8mb3 에 들어간다(이모지 같은 4바이트 문자가 아니다).
const DEFAULT_CAUSES = ['그립', '세팅', '타이밍', '고정·압박', '대처·연결', '마무리', '모르겠음']
  .map(cleanName);

// 옛 기본 태그 → 새 기본 태그. **행 이름만 바꾸고 id 는 유지한다.** 기록은 `causes:[id]` 로
// 태그를 참조하므로(models/SparCause.js) 기록 데이터는 한 글자도 고치지 않고 과거 기록이 새 이름을
// 따라온다. 되돌릴 땐 같은 id 에 옛 이름을 UPDATE 하면 된다(task-045 이력서에 id 목록).
const RENAMES = { '각도': '세팅', '연결 없음': '대처·연결', '이유 모름': '모르겠음' };

/**
 * 같은 이름(cleanName 기준) 행이 여럿일 때 정본 한 행 — 저장된 글자가 이미 정본형인 행을 먼저,
 * 그다음 id 가 작은 행. (NFC·NFD 두 벌은 DB 의 UNIQUE 를 통과한다 — 바이트가 달라서.)
 */
function pickCanonical(rows, name) {
  if (!rows.length) return null;
  return [...rows].sort((a, b) =>
    ((a.raw === name ? 0 : 1) - (b.raw === name ? 0 : 1)) || (a.id - b.id))[0];
}

/**
 * 순수 함수 — 현재 행으로 "해야 할 쓰기"를 계산한다. 반환: { creates:[{name,sort}], patches:Map<id,patch> }.
 * 둘 다 비면 이미 맞춰진 상태다(= 두 번째 조회부터는 쓰기 0건).
 *   1. rename — 옛 이름 행이 있고 새 이름 행이 **없을 때만.** 둘 다 있으면(예: 이유 모름·모르겠음)
 *      건드리지 않는다 → 옛 이름 행은 아래 3에서 비활성(= 직접 입력 태그)이 된다.
 *   2. 기본 이름 행이 없으면 생성(active=1, sort=index).
 *   3. 모든 행 — 기본 이름의 정본 행이면 active=1·sort=index, 아니면 active=0. 다를 때만 쓴다.
 *      직접 입력 태그의 sort 는 건드리지 않는다(선택지에 안 뜨므로 순서가 의미 없다).
 */
function planSync(rows) {
  const cur = rows.map(r => ({
    id: r.id, raw: r.name, name: cleanName(r.name),
    sort: parseInt(r.sort, 10) || 0, active: r.active ? 1 : 0,
  }));
  const patches = new Map();
  const patch = (id, p) => patches.set(id, { ...(patches.get(id) || {}), ...p });

  for (const [oldName, newName] of Object.entries(RENAMES)) {
    if (cur.some(r => r.name === newName)) continue;
    const target = pickCanonical(cur.filter(r => r.name === oldName), oldName);
    if (!target) continue;
    patch(target.id, { name: newName });
    target.name = newName;
    target.raw  = newName;
  }

  const creates = [];
  const canonicalIds = new Set();
  DEFAULT_CAUSES.forEach((name, sort) => {
    const keep = pickCanonical(cur.filter(r => r.name === name), name);
    if (!keep) { creates.push({ name, sort }); return; }
    canonicalIds.add(keep.id);
    if (keep.raw !== name) patch(keep.id, { name });   // NFD·공백 섞인 저장값을 정본형으로
    if (keep.active !== 1) patch(keep.id, { active: 1 });
    if (keep.sort !== sort) patch(keep.id, { sort });
  });
  for (const r of cur) {
    if (!canonicalIds.has(r.id) && r.active !== 0) patch(r.id, { active: 0 });
  }
  return { creates, patches };
}

// 동시 요청 경합에서 나는 에러 — 다시 읽고 다시 계산하면 풀린다.
function isTransient(e) {
  const code = e?.original?.code || e?.parent?.code;
  return e?.name === 'SequelizeUniqueConstraintError'
      || code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT';
}

/**
 * 기본 태그 7개를 이 사용자의 행에 맞춘다 — **조회마다, 멱등.** (task-022 의 seedIfEmpty 대체)
 *
 * 조회 시점에 하는 이유는 task-022 와 같다: 부팅 이후 가입한 사용자를 놓치지 않는다.
 * 부팅 일괄 처리가 아니라서 운영 사용자는 **자기 화면을 여는 순간** 옮겨진다.
 *
 * 🔴 빠른 길: 잠금 없이 한 번 읽고 할 일이 없으면 끝(평상시 조회는 SELECT 1회, 쓰기 0건).
 * 🔴 느린 길: 트랜잭션 + `SELECT … FOR UPDATE` 로 이 사용자의 행을 잠그고 **다시 읽어** 계산한다.
 *    같은 사용자의 동시 조회는 여기서 줄을 서고, 뒤에 온 쪽은 앞쪽의 결과를 보고 할 일이 0이 된다.
 *    행이 하나도 없는 사용자는 잠글 행이 없어 둘 다 INSERT 로 가다 UNIQUE·데드락에 걸릴 수 있다 —
 *    그때는 트랜잭션이 통째로 롤백되므로(부분 적용 없음) 다시 읽고 다시 계산한다(최대 3회).
 * 🔴 끝내 실패해도 **조회 자체는 실패시키지 않는다.** 목록은 이름 사전이라 옛 상태로라도 보여 주는
 *    편이 태그가 0개인 화면(프론트는 실패 시 빈 배열)보다 낫고, 다음 조회가 다시 맞춘다.
 */
async function syncDefaults(userId) {
  const rows = await SparCause.findAll({ where: { user_id: userId }, raw: true });
  const first = planSync(rows);
  if (!first.creates.length && !first.patches.size) return 0;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await sequelize.transaction(async (t) => {
        const locked = await SparCause.findAll({
          where: { user_id: userId }, raw: true, transaction: t, lock: t.LOCK.UPDATE,
        });
        const { creates, patches } = planSync(locked);
        // 이름 변경을 생성보다 먼저 — 순서를 바꾸면 새 이름 행이 먼저 생겨 rename 이 UNIQUE 에 걸린다.
        for (const [id, p] of patches) {
          await SparCause.update(p, { where: { id, user_id: userId }, transaction: t });
        }
        for (const c of creates) {
          await SparCause.create({ user_id: userId, name: c.name, sort: c.sort, active: 1 }, { transaction: t });
        }
        return creates.length + patches.size;
      });
    } catch (e) {
      if (isTransient(e) && attempt < 3) continue;
      console.error(`[spar-causes] 기본 태그 맞추기 실패 user=${userId} (시도 ${attempt}) — 목록은 현재 상태로 응답:`, e.message);
      return 0;
    }
  }
  return 0;
}

/** 같은 이름(cleanName 기준) 행. 기본 태그와 이름이 겹치면 정본 행을 돌려준다. */
async function findByName(userId, name) {
  const mine = await SparCause.findAll({ where: { user_id: userId }, raw: true });
  const hits = mine.filter(r => cleanName(r.name) === name)
    .map(r => ({ ...r, raw: r.name }));
  const pick = pickCanonical(hits, name);
  return pick ? mine.find(r => r.id === pick.id) : null;
}

/** VARCHAR(40) 은 문자 수 기준이므로 코드포인트로 센다(JS .length 는 이모지를 2로 세어 어긋난다). */
function nameLen(s) {
  return [...s].length;
}

/**
 * 이 DB 는 전 테이블이 utf8mb3 다(classes·techniques·spar_sessions… 전부). 4바이트 문자(이모지)는
 * STRICT 모드에서 잘리는 게 아니라 `Incorrect string value` **에러**로 500 이 된다.
 * 한 테이블만 utf8mb4 로 바꾸는 건 이번 범위가 아니므로, 여기서 먼저 걸러 이유를 알려 준다.
 */
function hasNonBMP(s) {
  return [...s].some(ch => ch.codePointAt(0) > 0xFFFF);
}

function view(row) {
  return { id: row.id, name: row.name, sort: row.sort, active: row.active ? 1 : 0 };
}

// GET /api/spar-causes  — 이 사용자의 태그 전체 (기본 7개 + 직접 입력했던 태그)
//
// 🔴 비활성 포함이다(task-022 결정 유지). 목록은 선택지이자 **이름 사전**이라, 직접 입력 태그
//   (active=0)를 빼면 그 태그를 고른 과거 기록에서 칩이 사라지거나 id 숫자가 노출된다.
//   task-045 부터 active=1 은 정확히 기본 7개다 — 프론트는 그것만 선택지로 깔고, 직접 입력 태그는
//   **그 항목이 고른 경우에만** 보여 준다. `?active=1` 은 기본 7개만(순수 선택지 목록).
//   응답 전에 syncDefaults() 가 기본 7개를 맞춘다(평상시 쓰기 0건).
router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  await syncDefaults(uid);
  const where = { user_id: uid };
  if (String(req.query.active || '') === '1') where.active = 1;
  const rows = await SparCause.findAll({
    where, order: [['sort', 'ASC'], ['id', 'ASC']], raw: true,
  });
  ok(res, rows.map(view));
}));

// POST /api/spar-causes — 직접 입력 태그 (카드의 `+`)
//
// 🔴 **`active=0` 으로 만든다** — 그 기록에만 붙고 다음 기록 선택지에는 뜨지 않는다(task-045).
//   task-022 는 active=1 로 만들어 한 번 적은 문장이 모든 기록의 선택지에 영구히 남았다.
// 🔴 같은 이름 행이 이미 있으면 **새로 만들지 않고 그 행을 그대로 돌려준다**(400·되살리기 없음).
//   기본 태그 이름을 치면 기본 태그 id 가, 전에 다른 기록에서 쳤던 문장이면 그 id 가 온다 —
//   같은 원인이 id 두 개로 갈라지지 않고, 비활성 행을 active=1 로 되살려 선택지를 늘리지도 않는다.
router.post('/', wrap(async (req, res) => {
  const uid  = req.user.id;
  const name = cleanName(req.body?.name);
  if (!name) return fail(res, 400, '태그 이름을 입력해주세요');
  if (nameLen(name) > NAME_MAX) return fail(res, 400, `태그 이름은 ${NAME_MAX}자 이내로 입력해주세요`);
  if (hasNonBMP(name)) return fail(res, 400, '태그 이름에 이모지는 사용할 수 없습니다');

  // 기본 태그를 먼저 맞춘다 — 옛 이름(각도) 행이 아직 rename 전인데 새 이름(세팅)을 쳤을 때
  // 세팅이 직접 입력 태그로 따로 생겨 rename 이 영영 건너뛰어지는 것을 막는다(평상시 쓰기 0건).
  await syncDefaults(uid);

  // 이름 비교는 NFC 정규화 후 (task-014). 자모분리형이 섞이면 눈에는 같은 글자인데
  // 중복 검사만 조용히 통과해 같은 이름 태그가 둘 생긴다.
  const dup = await findByName(uid, name);
  if (dup) return ok(res, view(dup));

  const mine = await SparCause.findAll({ where: { user_id: uid }, attributes: ['sort'], raw: true });
  const maxSort = mine.reduce((m, r) => Math.max(m, parseInt(r.sort) || 0), -1);
  try {
    const created = await SparCause.create({
      user_id: uid, name, sort: maxSort + 1, active: 0,
    });
    ok(res, view(created));
  } catch (e) {
    // UNIQUE(user_id, name) 충돌 — 같은 이름을 동시에 두 번 보냈거나, cleanName 은 다르지만 DB
    // 콜레이션(utf8mb3_general_ci: 영문 대소문자 무시)으로는 같은 이름이다. 둘 다 "이미 있는 행"이
    // 정답이므로 DB 비교로 그 행을 찾아 돌려준다.
    if (e?.name !== 'SequelizeUniqueConstraintError') throw e;
    const row = await SparCause.findOne({ where: { user_id: uid, name }, raw: true });
    if (!row) throw e;
    ok(res, view(row));
  }
}));

// PUT /api/spar-causes/:id — 이름·정렬 수정 (이 라우트를 부르는 화면은 없다)
//
// 🔴 rename 은 태그 행 하나만 바꾼다. 기록은 id 를 들고 있으므로 과거 기록이 자동으로
//   새 이름을 따라온다 — 포지션 rename 처럼 4개 저장소에 전파할 것이 없다(task-012).
// 🔴 task-045 부터 `active`·기본 태그의 `sort` 는 **syncDefaults() 가 다음 조회 때 덮어쓴다.**
//   직접 입력 태그를 active=1 로 올려도, 기본 태그를 active=0 으로 내려도 다음 GET 에서 되돌아간다.
//   기본 태그의 이름을 바꾸면 그 행은 직접 입력 태그(비활성)가 되고 기본 이름 행이 새로 생긴다.
//   선택지를 바꾸려면 routes/sparCauses.js 의 DEFAULT_CAUSES 를 고친다.
router.put('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  // 소유권은 조회 조건 자체에 넣는다 — 남의 id 를 지정하면 404 로 끝나고 UPDATE 까지 가지 않는다
  const row = await SparCause.findOne({ where: { id: req.params.id, user_id: uid } });
  if (!row) return fail(res, 404, '태그를 찾을 수 없습니다');

  const patch = {};
  if (req.body?.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return fail(res, 400, '태그 이름을 입력해주세요');
    if (nameLen(name) > NAME_MAX) return fail(res, 400, `태그 이름은 ${NAME_MAX}자 이내로 입력해주세요`);
    if (hasNonBMP(name)) return fail(res, 400, '태그 이름에 이모지는 사용할 수 없습니다');
    const mine = await SparCause.findAll({ where: { user_id: uid }, raw: true });
    if (mine.some(r => r.id !== row.id && cleanName(r.name) === name)) {
      return fail(res, 400, '이미 있는 태그입니다');
    }
    patch.name = name;
  }
  if (req.body?.sort !== undefined) patch.sort = parseInt(req.body.sort) || 0;
  if (req.body?.active !== undefined) patch.active = req.body.active ? 1 : 0;

  if (Object.keys(patch).length) {
    await SparCause.update(patch, { where: { id: row.id, user_id: uid } });
  }
  const fresh = await SparCause.findOne({ where: { id: row.id, user_id: uid }, raw: true });
  ok(res, view(fresh));
}));

// DELETE /api/spar-causes/:id — 비활성화 (이 라우트를 부르는 화면은 없다)
//
// 🔴 **물리 삭제하지 않는다.** 과거 기록의 `success[i].causes` 가 이 id 를 참조 중이라
//   행을 지우면 끊긴 참조가 되고, 그 기록은 원인을 영영 되찾지 못한다(이름이 아니라 id 로
//   저장하기로 한 결정의 대가다 — docs/recall-lab-spec.md §4.1).
// 🔴 task-045 부터 직접 입력 태그는 원래 active=0 이라 이 호출은 할 일이 없고, 기본 태그를
//   비활성화해도 다음 조회의 syncDefaults() 가 active=1 로 되돌린다(선택지의 정본은 코드 상수).
router.delete('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const row = await SparCause.findOne({ where: { id: req.params.id, user_id: uid } });
  if (!row) return fail(res, 404, '태그를 찾을 수 없습니다');
  await SparCause.update({ active: 0 }, { where: { id: row.id, user_id: uid } });
  const fresh = await SparCause.findOne({ where: { id: row.id, user_id: uid }, raw: true });
  ok(res, view(fresh), '태그를 비활성화했습니다 (과거 기록은 그대로 남습니다)');
}));

module.exports = router;
