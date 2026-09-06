const express = require('express');
const router  = express.Router();
const { SparCause } = require('../models');
const { ok, fail, wrap } = require('../utils/respond');
const { toNFC } = require('../utils/nfc');

// 실패 원인 태그 CRUD (task-022 · docs/recall-lab-spec.md §4.1)
//
// 왜 별도 파일인가: 경로가 `/api/spar-causes` 로 클래스 하위가 아니다. classes.js 는
// `/api/classes` 에 마운트돼 있어 그 안에서는 이 경로를 낼 수 없고, 이 앱은 도메인 하나당
// 라우터 파일 하나가 관례다(techniques·picks·clips…). 태그는 스파링 기록과 수명이 다른
// 독립 어휘 사전이므로 파일도 분리한다.

// spar_causes.name VARCHAR(40). sql_mode 에 STRICT_TRANS_TABLES 가 있어 초과는 잘림이 아니라
// **에러**다 — 여기서 먼저 막아 사용자에게 이유를 알려 준다. 프론트도 maxLength 로 같이 막는다.
const NAME_MAX = 40;

// 최초 4개 시드. 코드 상수가 아니라 "처음 한 번 넣어 주는 값"이다 — 사용자가 화면에서
// 지우거나 이름을 바꾸면 그대로 따라가야 하므로 이 배열을 목록의 정본으로 쓰지 않는다.
const SEED_NAMES = ['그립', '각도', '타이밍', '연결 없음'];

/** 태그 이름 정본화 — NFC 정규화(task-014) + 좌우 공백 제거. 비교·저장 모두 이 값을 쓴다. */
function cleanName(raw) {
  return toNFC(String(raw ?? '')).trim();
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

/**
 * 시드 시점 = "그 사용자의 첫 조회". 부팅 시 일괄 시드로 하지 않은 이유:
 * 이 앱은 회원가입이 열려 있어(task-002) 부팅 이후 가입한 사용자는 다음 재시작까지
 * 태그가 하나도 없는 화면을 보게 된다. 조회 시점 시드는 가입 시점과 무관하게 항상 맞는다.
 *
 * 🔴 중복 삽입 방지는 `active` 를 보지 않고 **행 존재 여부**로 판단한다. active 만 세면
 * 4개를 전부 비활성화한 사용자에게 다음 조회 때 되살아난다 — 사용자가 지운 것이 돌아오는 셈.
 * 동시 요청 경합은 DB 의 UNIQUE(user_id, name) 가 최종 방어선이라 진 쪽만 조용히 실패한다.
 */
async function seedIfEmpty(userId) {
  const existing = await SparCause.count({ where: { user_id: userId } });
  if (existing > 0) return;
  for (let i = 0; i < SEED_NAMES.length; i++) {
    await SparCause.create({
      user_id: userId, name: SEED_NAMES[i], sort: i, active: 1,
    }).catch(() => {});   // UNIQUE 충돌(동시 시드) — 이미 들어갔다는 뜻이므로 넘어간다
  }
}

function view(row) {
  return { id: row.id, name: row.name, sort: row.sort, active: row.active ? 1 : 0 };
}

// GET /api/spar-causes  — 이 사용자의 태그 전체
//
// 🔴 사양서 §4.1 초안은 "active 만"이었으나 **비활성 포함으로 구현하고 사양서를 고쳤다.**
//   과거 기록이 참조하는 태그가 비활성화되면 이름을 받을 곳이 없어져 화면에 id 숫자가
//   그대로 노출되거나 칩이 사라진다(= 기록이 깨져 보인다). 목록은 이름 사전을 겸하므로
//   전부 돌려주고, 고르는 칩은 프론트가 active 로 걸러 쓴다.
//   `?active=1` 을 주면 활성만 — 나중에 순수 선택지 목록이 필요한 호출자를 위해 남겨 둔다.
router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  await seedIfEmpty(uid);
  const where = { user_id: uid };
  if (String(req.query.active || '') === '1') where.active = 1;
  const rows = await SparCause.findAll({
    where, order: [['sort', 'ASC'], ['id', 'ASC']], raw: true,
  });
  ok(res, rows.map(view));
}));

// POST /api/spar-causes — 태그 추가
router.post('/', wrap(async (req, res) => {
  const uid  = req.user.id;
  const name = cleanName(req.body?.name);
  if (!name) return fail(res, 400, '태그 이름을 입력해주세요');
  if (nameLen(name) > NAME_MAX) return fail(res, 400, `태그 이름은 ${NAME_MAX}자 이내로 입력해주세요`);
  if (hasNonBMP(name)) return fail(res, 400, '태그 이름에 이모지는 사용할 수 없습니다');

  // 이름 비교는 NFC 정규화 후 (task-014). 자모분리형이 섞이면 눈에는 같은 글자인데
  // 중복 검사만 조용히 통과해 같은 이름 태그가 둘 생긴다.
  const mine = await SparCause.findAll({ where: { user_id: uid }, raw: true });
  const dup  = mine.find(r => cleanName(r.name) === name);
  if (dup) {
    // 비활성 동명 태그가 있으면 새로 만들지 않고 되살린다. 새로 만들면 UNIQUE 에 걸리고,
    // 무엇보다 과거 기록이 참조하던 id 를 그대로 이어 쓰는 편이 기록이 안 끊긴다.
    if (!dup.active) {
      await SparCause.update({ active: 1 }, { where: { id: dup.id, user_id: uid } });
      const row = await SparCause.findOne({ where: { id: dup.id, user_id: uid }, raw: true });
      return ok(res, view(row), '비활성 태그를 다시 켰습니다');
    }
    return fail(res, 400, '이미 있는 태그입니다');
  }

  const maxSort = mine.reduce((m, r) => Math.max(m, parseInt(r.sort) || 0), -1);
  const created = await SparCause.create({
    user_id: uid, name, sort: maxSort + 1, active: 1,
  });
  ok(res, view(created));
}));

// PUT /api/spar-causes/:id — 이름·정렬 수정
//
// 🔴 rename 은 태그 행 하나만 바꾼다. 기록은 id 를 들고 있으므로 과거 기록이 자동으로
//   새 이름을 따라온다 — 포지션 rename 처럼 4개 저장소에 전파할 것이 없다(task-012).
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

// DELETE /api/spar-causes/:id — 비활성화
//
// 🔴 **물리 삭제하지 않는다.** 과거 기록의 `success[i].causes` 가 이 id 를 참조 중이라
//   행을 지우면 끊긴 참조가 되고, 그 기록은 원인을 영영 되찾지 못한다(이름이 아니라 id 로
//   저장하기로 한 결정의 대가다 — docs/recall-lab-spec.md §4.1).
router.delete('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const row = await SparCause.findOne({ where: { id: req.params.id, user_id: uid } });
  if (!row) return fail(res, 404, '태그를 찾을 수 없습니다');
  await SparCause.update({ active: 0 }, { where: { id: row.id, user_id: uid } });
  const fresh = await SparCause.findOne({ where: { id: row.id, user_id: uid }, raw: true });
  ok(res, view(fresh), '태그를 비활성화했습니다 (과거 기록은 그대로 남습니다)');
}));

module.exports = router;
