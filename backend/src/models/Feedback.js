const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// task-051: 수업·스파링과 독립된 피드백. 스키마는 명시적 스크립트로만 적용한다.
const Feedback = sequelize.define('Feedback', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  situation: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  situation_options: { type: DataTypes.TEXT, allowNull: true },
  situation_other: { type: DataTypes.TEXT, allowNull: true },
  technique: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
  starred: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  original: { type: DataTypes.TEXT('long'), allowNull: false },
  clip_ids: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
  dialogue: { type: DataTypes.TEXT('long'), allowNull: false },
  results: { type: DataTypes.TEXT('long'), allowNull: false, defaultValue: '[]' },
  summary: { type: DataTypes.TEXT('long'), allowNull: true },
  task_binding: { type: DataTypes.TEXT, allowNull: true },
  summary_hash: { type: DataTypes.STRING(64), allowNull: true },
  revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  ai_status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'idle' },
  ai_kind: { type: DataTypes.STRING(16), allowNull: true },
  ai_token: { type: DataTypes.STRING(36), allowNull: true },
  ai_started_at: { type: DataTypes.DATE, allowNull: true },
  ai_error: { type: DataTypes.TEXT, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'feedback_records' });

module.exports = Feedback;
