const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 연구 프로젝트 (task-026 · docs/recall-lab-spec.md §4.4).
//
// 🔴 **user_id 의 정본은 이 테이블 하나다.** 하위 3테이블(versions·nodes·links)에도 user_id 사본이
//   있지만 그것은 권한 판정용이 아니라 **드리프트를 SQL 로 검출하기 위한 관측 장치**다(계약 A-2).
//   모든 라우트의 소유 판별은 반드시 이 테이블까지 조인해서 한다.
//
// 🔴 STRICT_TRANS_TABLES + utf8mb3: title 101자·이모지는 잘림이 아니라 **에러(500)** 다.
//   라우트가 400 으로 먼저 거른다.
const ResearchProject = sequelize.define('ResearchProject', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:    { type: DataTypes.INTEGER, allowNull: false },
  title:      { type: DataTypes.STRING(100), allowNull: false },
  start_pos:  { type: DataTypes.STRING(50),  allowNull: true, defaultValue: null },
  goal:       { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
  created_at: { type: DataTypes.DATE },
  updated_at: { type: DataTypes.DATE },
}, { tableName: 'research_projects' });

module.exports = ResearchProject;
