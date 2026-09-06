const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SparSession = sequelize.define('SparSession', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  spar_day_id:    { type: DataTypes.INTEGER, allowNull: false },
  level:          { type: DataTypes.STRING(20) },
  opponent:       { type: DataTypes.STRING(100), defaultValue: '' },
  tap_got:        { type: DataTypes.TINYINT, defaultValue: 0 },
  tap_gave:       { type: DataTypes.TINYINT, defaultValue: 0 },
  time_min:       { type: DataTypes.TINYINT },
  position_score: { type: DataTypes.TINYINT, defaultValue: 0 },
  positions:      { type: DataTypes.TEXT, defaultValue: '[]' },
  success:        { type: DataTypes.TEXT },
  weak:           { type: DataTypes.TEXT },
  note:           { type: DataTypes.TEXT },
  outcome:        { type: DataTypes.STRING(10), defaultValue: null },
  // cause_ids / reaction (task-022) — 사용자가 명시해 만든 컬럼이지만 **앱은 쓰지 않는다.**
  //   실패 원인 태그와 리액션은 `success` 배열의 각 항목 객체 안에 넣기로 확정됐다
  //   (`{name, success, causes:[id], reaction:'…'}` — docs/recall-lab-spec.md §3.1).
  //   인덱스 대응 배열로 두면 사용자가 success 항목 하나를 지웠을 때 뒤 항목이 앞 항목의
  //   원인을 뒤집어쓴다 — 서버가 검증할 방법이 없어 에러 없이 조용히 어긋난다.
  //   컬럼은 향후 조회 최적화용 비정규화 사본 여지를 남겨 두고 **DROP 하지 않는다.**
  //   지금은 정본이 아니므로 GET /api/classes 응답에서는 제외한다(routes/classes.js 참고).
  cause_ids:      { type: DataTypes.TEXT, defaultValue: '[]' },
  reaction:       { type: DataTypes.TEXT, defaultValue: '[]' },
}, { tableName: 'spar_sessions' });

module.exports = SparSession;
