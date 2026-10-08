const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 긴 영상(강의·세미나·스파링) 분석 — task-007 Phase 1
// DB 컬럼과 1:1 대조 완료 (models/VideoClip.js의 ai_recommendation 누락 버그 재발 방지 목적)
const LongVideo = sequelize.define('LongVideo', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:         { type: DataTypes.INTEGER, allowNull: false },
  url:             { type: DataTypes.TEXT, allowNull: false },
  video_id:        { type: DataTypes.STRING(32) },
  title:           { type: DataTypes.STRING(500), defaultValue: '' },
  channel:         { type: DataTypes.STRING(255), defaultValue: '' },
  duration_sec:    { type: DataTypes.INTEGER, defaultValue: 0 },
  thumb_url:       { type: DataTypes.TEXT, defaultValue: '' },
  kind:            { type: DataTypes.STRING(20), defaultValue: 'lecture' },
  status:          { type: DataTypes.STRING(20), defaultValue: 'queued' },   // queued|running|done|error|canceled
  chapter_source:  { type: DataTypes.STRING(20) },                          // youtube|ai|visual|single
  summary:         { type: DataTypes.TEXT },
  key_points:      { type: DataTypes.TEXT },
  transcript_path: { type: DataTypes.STRING(500) },
  video_path:      { type: DataTypes.STRING(500) },                        // task-048 S3.5: 보관 영상 웹 경로(/uploads/users/<uid>/long-videos/<id>/video.mp4), 없으면 NULL → 유튜브 iframe
  video_quality:   { type: DataTypes.STRING(10), defaultValue: '480p' },
  title_locked:    { type: DataTypes.TINYINT, defaultValue: 0 },            // task-010: 사용자가 등록 시 직접 입력한 제목은 S1이 덮어쓰지 않음
  error:           { type: DataTypes.TEXT },
  created_at:      { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at:      { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'long_videos' });

module.exports = LongVideo;
