const { TechniqueMastery } = require('../models');

// 사다리 2·3단계(technique_mastery) 쓰기 — 한 곳에서만 한다.
//
// task-035 에서 routes/lab.js PATCH /mastery/:techId 의 upsert 본문을 **그대로** 옮겼다.
// 호출처 2곳:
//   - routes/lab.js   PATCH /api/mastery/:techId        (사용자가 /recall 사다리에서 직접 체크)
//   - routes/clips.js POST/DELETE /api/clips/:id/usage (참고영상 "드릴 +1"·"포지션 스파링 +1" 자동 체크·취소)
// 🔴 두 경로가 같은 행을 같은 규칙으로 쓰게 하려고 분리했다. 한쪽만 고치면 타임스탬프 규칙이 갈라진다.
//
// 규칙(lab.js 원문 주석 그대로):
//   - patch 에 **준 필드만** 반영(부분 갱신). 입력 검증은 호출자 책임이다.
//   - 타임스탬프는 false → true 로 바뀔 때만 now, true → false 면 null
//     (체크를 해제했는데 "언제 했는지"가 남아 있으면 화면이 서로 모순된 말을 한다).
//   - UNIQUE(user_id, technique_id) 경합에서 진 쪽은 update 로 이어간다(조용히 삼키지 않고 반영).

/**
 * @param {number} userId
 * @param {number} techId   소유 확인이 끝난 technique id
 * @param {{drilled?: boolean, position_spar?: boolean}} patch  컬럼명 키
 * @param {{transaction?: import('sequelize').Transaction}} [opts]
 * @returns {Promise<{drilled:boolean, position_spar:boolean, drilled_at:Date|null, position_spar_at:Date|null}>}
 */
async function setMasterySteps(userId, techId, patch, opts = {}) {
  const { transaction } = opts;
  const where = { user_id: userId, technique_id: techId };
  const existing = await TechniqueMastery.findOne({ where, raw: true, transaction });
  const now = new Date();

  const next = {
    drilled:       existing ? !!existing.drilled       : false,
    position_spar: existing ? !!existing.position_spar : false,
    drilled_at:       existing ? existing.drilled_at       : null,
    position_spar_at: existing ? existing.position_spar_at : null,
  };
  for (const column of ['drilled', 'position_spar']) {
    if (!Object.prototype.hasOwnProperty.call(patch, column)) continue;
    const before = next[column];
    const after  = patch[column];
    next[column] = after;
    if (before !== after) next[`${column}_at`] = after ? now : null;
  }

  if (existing) {
    await TechniqueMastery.update(next, { where, transaction });
  } else {
    // UNIQUE(user_id, technique_id) 가 있으므로 동시 요청 중 진 쪽은 충돌한다 —
    // 그때는 상대가 이미 넣었다는 뜻이라 update 로 이어간다(조용히 삼키지 않고 반영).
    // (InnoDB 는 중복키 에러를 **문장 단위**로 되돌리므로 트랜잭션 안에서도 이어서 update 할 수 있다.)
    await TechniqueMastery.create({ ...where, ...next, created_at: now, updated_at: now }, { transaction })
      .catch(async (e) => {
        if (String(e.name || '').includes('Unique')) return TechniqueMastery.update(next, { where, transaction });
        throw e;
      });
  }
  return next;
}

module.exports = { setMasterySteps };
