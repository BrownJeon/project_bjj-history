const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 연구 노드에 붙는 근거 링크 (task-026).
// link_type: clip | class | technique | url (researchTree.LINK_TYPES)
//
// 🔴 `ref_id` 가 가리키는 대상의 소유권도 라우트가 확인한다 — 남의 클립·수업 id 를 노드에
//   매달아 두면 task-027 의 "링크 열기"가 그대로 유출 경로가 된다. 지금 막는 편이 싸다.
//   `url` 타입은 ref_id 없이 memo 에 주소를 담는다.
const ResearchLink = sequelize.define('ResearchLink', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:    { type: DataTypes.INTEGER, allowNull: false },
  node_id:    { type: DataTypes.INTEGER, allowNull: false },
  link_type:  { type: DataTypes.STRING(20), allowNull: false },
  ref_id:     { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  memo:       { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
  created_at: { type: DataTypes.DATE },
}, { tableName: 'research_links' });

module.exports = ResearchLink;
