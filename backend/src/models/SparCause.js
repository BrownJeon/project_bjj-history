const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 실패 원인 태그 (task-022) — "왜 안 됐는지"를 고르는 어휘 사전.
//
// 🔴 기록은 이름이 아니라 id 를 참조한다(`spar_sessions.success[i].causes = [id...]`).
//   포지션을 이름 문자열로 저장한 탓에 rename 을 4개 저장소로 전파하는 캐스케이드가 필요했고
//   트랜잭션이 빠지면 복구 불가능한 split-brain 이 생겼다(task-012·task-016).
//   id 참조는 이름을 바꿔도 과거 기록이 그대로 따라온다 — 전파할 것이 없다.
//
// 🔴 그 대가로 **행을 지우면 끊긴 참조가 된다.** 행은 물리 삭제하지 않는다.
//   비활성 태그도 이름 조회는 계속 돼야 과거 기록이 깨지지 않으므로 목록 API 는 기본으로
//   비활성까지 함께 돌려준다(routes/sparCauses.js 참고).
//
// 🔴 `active` 의 뜻 (task-045 에서 바뀜): **"선택지에 뜨는가 = 기본 태그인가"** 다.
//   active=1 = 기본 7개(routes/sparCauses.js 의 DEFAULT_CAUSES — 코드 상수가 정본, sort 도 거기서),
//   active=0 = 카드의 `+` 로 직접 입력한 태그(그 기록에만 붙고 다음 기록 선택지에는 안 뜬다)와
//   이름이 바뀌어 기본에서 빠진 옛 태그. 값은 사용자가 아니라 GET 마다 도는 syncDefaults() 가 정한다.
//   기본값(defaultValue: 1)은 DDL 과 맞춘 것일 뿐이다 — 라우트는 active 를 항상 명시해서 넣는다.
const SparCause = sequelize.define('SparCause', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  // NOT NULL — PickHistory.user_id 가 nullable 로 빠져 소유권 필터가 없던 전례를 반복하지 않는다
  user_id:    { type: DataTypes.INTEGER, allowNull: false },
  // VARCHAR(40). sql_mode 에 STRICT_TRANS_TABLES 가 있어 초과는 경고가 아니라 에러다 —
  // 라우트에서 길이를 먼저 막는다(drills.pos varchar(50) 이 정확히 이 이유로 터졌다, task-012)
  name:       { type: DataTypes.STRING(40), allowNull: false },
  sort:       { type: DataTypes.INTEGER, defaultValue: 0 },
  active:     { type: DataTypes.TINYINT, defaultValue: 1 },
  created_at: { type: DataTypes.DATE },
}, { tableName: 'spar_causes' });

module.exports = SparCause;
