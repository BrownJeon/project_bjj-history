const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Profile = sequelize.define('Profile', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nickname:     { type: DataTypes.STRING(100), defaultValue: '' },
  start_date:   { type: DataTypes.DATEONLY },
  weight_class: { type: DataTypes.STRING(20), defaultValue: '' },
  network:      { type: DataTypes.STRING(100), defaultValue: '' },   // 레거시 단일 소속 (하위호환용 유지)
  networks:     { type: DataTypes.TEXT },                            // 소속 다중 등록 (JSON 배열 문자열)
  avatar:       { type: DataTypes.STRING(255) },
  // 관장 모델 (task-030). 🔴 **NULL 이 기본값 opus 를 뜻한다** — 'opus' 를 채워 넣지 않는다.
  // 채워 두면 나중에 기본값을 바꿀 때 "직접 opus 를 고른 사용자"와 "아무것도 안 고른 사용자"를
  // 구분할 수 없다(technique_mastery 를 시드하지 않은 것과 같은 이유).
  master_model: { type: DataTypes.STRING(10), allowNull: true, defaultValue: null },
  user_id:      { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'profile' });

module.exports = Profile;
