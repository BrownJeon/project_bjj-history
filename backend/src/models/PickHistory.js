const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PickHistory = sequelize.define('PickHistory', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  clip_id:     { type: DataTypes.INTEGER, allowNull: false },
  pick_date:   { type: DataTypes.DATEONLY, allowNull: false },
  created_at:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  user_id:     { type: DataTypes.INTEGER, allowNull: true },
  // 스파링 사용 피드백 — 날짜 단위로 안정적인 spar_day_id를 FK로 사용
  // (spar_session은 저장마다 destroy 후 재생성되어 id가 바뀌므로 FK로 부적합)
  spar_day_id: { type: DataTypes.INTEGER, allowNull: true },
  used:        { type: DataTypes.TINYINT, allowNull: true }, // NULL=미확인, 0=사용 안함, 1=사용함
  situation:   { type: DataTypes.TEXT, allowNull: true },
  problem:     { type: DataTypes.TEXT, allowNull: true },
  improvement: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'pick_history',
  timestamps: false,
});

module.exports = PickHistory;
