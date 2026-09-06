const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 사다리 2·3단계 수동 체크 저장 (task-024).
//
// 1·4·5단계는 드릴·스파링 기록에서 자동으로 판정되지만, 2단계(드릴로 반복했다)와
// 3단계(포지션 스파링으로 시험했다)는 어느 테이블에도 흔적이 남지 않는다 — 사용자가 직접 체크한다.
//
// 🔴 **행이 없는 것이 정상 상태다.** 아직 아무도 체크하지 않았으면 행이 없고, 그때 2·3단계는
//   false 로 읽는다. spar_causes 처럼 부팅 시 일괄 시드하지 않는다 — 시드하면 "체크 안 함"과
//   "행이 없음"을 구분할 수 없게 되고, 부팅 이후 가입자는 어차피 놓친다.
//
// 🔴 UNIQUE(user_id, technique_id) 는 동시 요청이 같은 기술에 두 행을 만드는 경합을 DB 층에서 막는다.
//   앱 층의 findOne→create 사이에는 언제나 틈이 있다.
const TechniqueMastery = sequelize.define('TechniqueMastery', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:          { type: DataTypes.INTEGER, allowNull: false },
  technique_id:     { type: DataTypes.INTEGER, allowNull: false },
  drilled:          { type: DataTypes.TINYINT, defaultValue: 0 },   // 2단계
  position_spar:    { type: DataTypes.TINYINT, defaultValue: 0 },   // 3단계
  drilled_at:       { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  position_spar_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  created_at:       { type: DataTypes.DATE },
  updated_at:       { type: DataTypes.DATE },
}, { tableName: 'technique_mastery' });

module.exports = TechniqueMastery;
