const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 긴 영상 챕터(목차) — task-007 Phase 1
// DB 컬럼과 1:1 대조 완료 (models/VideoClip.js의 ai_recommendation 누락 버그 재발 방지 목적)
const LongVideoChapter = sequelize.define('LongVideoChapter', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  long_video_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id:       { type: DataTypes.INTEGER, allowNull: false },
  idx:           { type: DataTypes.INTEGER, defaultValue: 0 },
  start_sec:     { type: DataTypes.INTEGER, defaultValue: 0 },
  end_sec:       { type: DataTypes.INTEGER, defaultValue: 0 },
  title:         { type: DataTypes.STRING(255), defaultValue: '' },
  source:        { type: DataTypes.STRING(10), defaultValue: 'single' },   // youtube|ai|visual|single
  confidence:    { type: DataTypes.TINYINT, defaultValue: 100 },           // 0~100
  summary:       { type: DataTypes.TEXT },                                 // Phase 2+ 전용 (S8)
  details:       { type: DataTypes.TEXT },                                 // Phase 2+ 전용 (S8)
  frames:        { type: DataTypes.TEXT, defaultValue: '[]' },             // JSON [{t,path}] — Phase 2+ 전용 (S7)
  status:        { type: DataTypes.STRING(20), defaultValue: 'pending' },
  error:         { type: DataTypes.TEXT },
  edited:        { type: DataTypes.TINYINT, defaultValue: 0 },
  created_at:    { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at:    { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'long_video_chapters' });

module.exports = LongVideoChapter;
