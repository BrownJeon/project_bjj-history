const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 연구 노드 (task-026).
//
// 🔴 `parent_node_id` 에 **FK 를 걸지 않는다**(자기참조 CASCADE 는 다루기 어렵다).
//   그 대가로 **앱이 자손을 수집해 지워야 한다** — 한 단계만 지우면 손자가 고아가 된다.
//   researchTree.collectSubtreeIds() 가 그 일을 하고, 깊이 상한 12 가 무한 루프를 막는다.
//
// 🔴 `technique_id` 는 **참조만** 한다. 사다리 상태를 여기 저장하지 마라 —
//   사다리는 기술 단위(technique_mastery)지 노드 단위가 아니다(task-024 계약).
//   같은 기술을 쓰는 두 노드는 **같은 사다리**를 봐야 한다. 노드에 저장하면 그 순간 갈라진다.
//   삭제 규칙은 video_clips.tech_id 의 선례를 따라 ON DELETE SET NULL — 기술이 지워지면
//   노드는 살아남고 자유 라벨(미연결)이 된다. 노드가 통째로 사라지는 것보다 낫다.
//
// 🔴 `sort_order`: `order` 는 MariaDB 예약어다. 기존 chain_steps.step_order 관례와도 맞는다.
//
// 🔴 `kind` 는 ENUM 이 아니라 VARCHAR(20) + 앱 화이트리스트(researchTree.KINDS 7종)다.
//   task-027 에서 종류가 늘어날 때 ALTER TABLE 이 필요 없게 하려는 것.
//   **kind 와 깊이 사이에 제약은 없다** — `포지션` 도 어느 깊이에나 온다.
const ResearchNode = sequelize.define('ResearchNode', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:        { type: DataTypes.INTEGER, allowNull: false },
  version_id:     { type: DataTypes.INTEGER, allowNull: false },
  parent_node_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  kind:           { type: DataTypes.STRING(20), allowNull: false },
  label:          { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
  technique_id:   { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  sort_order:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  note:           { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
  created_at:     { type: DataTypes.DATE },
  updated_at:     { type: DataTypes.DATE },
}, { tableName: 'research_nodes' });

module.exports = ResearchNode;
