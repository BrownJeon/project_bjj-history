const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 연구 버전 (task-026).
//
// 🔴 컬럼명이 `version_no` 인 이유: `no` 는 쓸 수 있어도 짝인 `order` 가 MariaDB 예약어라
//   research_nodes 에서 `sort_order` 를 써야 했다. 두 테이블이 서로 다른 작명 규칙을 갖지 않도록
//   여기도 `version_no` 로 맞춘다. DB 컬럼·Sequelize 속성·API JSON 필드가 **한 이름**이다.
//
// 🔴 `parent_version_id` 는 task-027 분기용 자리다. 이번 범위에서는 항상 NULL 이고,
//   `POST /api/research/versions`(분기 생성)는 만들지 않는다. 화면의 "+ 분기"도 비활성이다.
//
// 🔴 활성 버전은 프로젝트당 정확히 하나여야 한다. 라우트가 전환·삭제 시 한 트랜잭션 안에서 보장한다
//   (마지막 버전 삭제 거부 + 활성 버전 삭제 시 다른 버전 승격).
const ResearchVersion = sequelize.define('ResearchVersion', {
  id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:           { type: DataTypes.INTEGER, allowNull: false },
  project_id:        { type: DataTypes.INTEGER, allowNull: false },
  version_no:        { type: DataTypes.INTEGER, allowNull: false },
  name:              { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
  is_active:         { type: DataTypes.TINYINT, defaultValue: 0 },
  parent_version_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  created_at:        { type: DataTypes.DATE },
}, { tableName: 'research_versions' });

module.exports = ResearchVersion;
