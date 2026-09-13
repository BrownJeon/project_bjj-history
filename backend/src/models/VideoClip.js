const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const VideoClip = sequelize.define('VideoClip', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title:       { type: DataTypes.STRING(255), allowNull: false },
  url:         { type: DataTypes.TEXT, allowNull: false },
  platform:    { type: DataTypes.STRING(20), defaultValue: 'other' },
  description: { type: DataTypes.TEXT, defaultValue: '' },
  tech_id:     { type: DataTypes.INTEGER },
  tech_name:   { type: DataTypes.TEXT, defaultValue: '[]' },
  thumb_url:   { type: DataTypes.TEXT, defaultValue: '' },
  frames:      { type: DataTypes.TEXT, defaultValue: '[]' },  // AI 분석 캡처 경로 배열
  video_file:  { type: DataTypes.TEXT, defaultValue: '' },    // 오프라인 저장 영상 경로
  tags:        { type: DataTypes.TEXT, defaultValue: '[]' },
  position:    { type: DataTypes.TEXT, defaultValue: '[]' },
  starred:     { type: DataTypes.TINYINT, defaultValue: 0 },
  pinned:      { type: DataTypes.TINYINT, defaultValue: 0 },
  created_at:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  user_id:     { type: DataTypes.INTEGER, allowNull: true },
  // task-036: 연계 기술 AI 추천 캐시(JSON 문자열, 모양은 utils/clipRecommend.js). 컬럼은 index.js 부팅
  // 마이그레이션이 이미 만든다. 🔴 모델에 이 줄이 없으면 Sequelize 가 update 에서 조용히 버려
  // UPDATE 문 자체가 안 나간다(task-035 재현) — 지우지 말 것.
  ai_recommendation: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'video_clips' });

module.exports = VideoClip;
