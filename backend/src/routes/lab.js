const express = require('express');
const router = express.Router();
const { Technique, TechniqueMastery } = require('../models');
const { ok, fail, wrap } = require('../utils/respond');
const lab = require('../services/labAnalytics');
const { dateRange } = require('../services/feedbackCore');
const { setMasterySteps } = require('../services/masteryWrite');

// ─────────────────────────────────────────────────────────────────────────────
// 복기(구멍)·연구(사다리) 집계 API — task-024
//
// 🔴 이 라우터는 routes/index.js 에서 도메인 접두사 없이 `/` 에 마운트된다.
//    경로가 /api/holes · /api/mastery/:techId 로 **최상위**이기 때문이다(사용자 지시가 정본).
//    profile.js 가 이미 같은 방식으로 `/` 에 마운트돼 /profile·/belts·/memberships 를 낸다.
//    다음 사람이 "정리"하려고 /lab 접두사를 붙이고 싶어질 텐데, 그러면 프론트 경로가 조용히
//    404 가 된다 — 바꾸려면 web/src/api 쪽과 함께 바꿔야 한다.
//    ⚠️ profile.js 보다 **앞에** 마운트한다. 두 라우터의 경로 계열이 겹치지 않음은 확인했다
//       (profile 은 profile/belts/memberships 3계열뿐, 여기는 holes/mastery 2계열).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/holes — 실패 항목을 기술명으로 집계, 실패 threshold 이상을 "구멍"으로.
 * ?min= 으로 threshold 조정 (기본 2, 1~99 클램프).
 */
router.get('/holes', wrap(async (req, res) => {
  const data = await lab.loadLabData(req.user.id, dateRange(req.query));
  const result = lab.computeHoles(data, { threshold: req.query.min });
  ok(res, result);
}));

/**
 * 소유권 확인.
 * 🔴 남의 기술이면 403 이 아니라 **404** — 403 은 "그 id 는 존재하지만 네 것이 아니다"를
 *    알려주는 셈이라 남의 기술 id 범위를 훑어낼 수 있다. 존재 여부 자체를 흘리지 않는다.
 */
async function findOwnedTechnique(req) {
  const techId = parseInt(req.params.techId, 10);
  if (!Number.isInteger(techId)) return null;
  return Technique.findOne({ where: { id: techId, user_id: req.user.id }, raw: true });
}

/** 사다리 응답 조립 — GET 과 PATCH 가 **같은 형태**를 돌려준다(프론트가 두 번 부르지 않게). */
async function buildMastery(req, techId) {
  const data = await lab.loadLabData(req.user.id);
  const mastery = await TechniqueMastery.findOne({
    where: { user_id: req.user.id, technique_id: techId }, raw: true,
  });
  return lab.computeMastery(data, techId, { mastery });
}

router.get('/mastery/:techId', wrap(async (req, res) => {
  const tech = await findOwnedTechnique(req);
  if (!tech) return fail(res, 404, '기술을 찾을 수 없습니다');
  ok(res, await buildMastery(req, tech.id));
}));

/**
 * PATCH /api/mastery/:techId — 2·3단계 수동 체크 저장.
 * Body { drilled?: boolean, positionSpar?: boolean } — **준 필드만** 반영(부분 갱신).
 * 타임스탬프는 false → true 로 바뀔 때만 갱신하고, true → false 면 null 로 되돌린다.
 * (체크를 해제했는데 "언제 했는지"가 남아 있으면 화면이 서로 모순된 말을 한다)
 */
router.patch('/mastery/:techId', wrap(async (req, res) => {
  const tech = await findOwnedTechnique(req);
  if (!tech) return fail(res, 404, '기술을 찾을 수 없습니다');

  const body = req.body || {};
  const patch = {};
  for (const [field, column] of [['drilled', 'drilled'], ['positionSpar', 'position_spar']]) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    if (typeof body[field] !== 'boolean') {
      return fail(res, 400, `${field} 는 true 또는 false 여야 합니다`);
    }
    patch[column] = body[field];
  }
  if (!Object.keys(patch).length) {
    return fail(res, 400, 'drilled 또는 positionSpar 중 하나는 보내야 합니다');
  }

  // task-035: upsert 본문은 services/masteryWrite.setMasterySteps 로 옮겼다(동작·응답 무변경).
  //   참고영상 "드릴 +1"·"포지션 스파링 +1" 자동 체크가 같은 규칙으로 같은 행을 쓴다.
  await setMasterySteps(req.user.id, tech.id, patch);

  ok(res, await buildMastery(req, tech.id));
}));

module.exports = router;
