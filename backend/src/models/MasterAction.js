const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 관장의 제안 카드 (task-030).
//
// 🔴 **이 테이블이 "승인 전에는 아무것도 생기지 않는다"의 구조적 표현이다.**
//   MCP 의 `propose_*` 도구 4종이 쓸 수 있는 테이블은 **여기 하나뿐**이고, 그 도구들은
//   research_projects·research_nodes·research_links·research_tasks·video_clips 를 열지 않는다.
//   승인(POST /actions/:id/approve)이 있어야 비로소 masterActions.js 가 기존 생성 로직을 부른다.
//   task-009 가 "승인 전 자동 생성 없음"을 행 수 대조로 검증한 것과 같은 방식으로 QA 가 잰다.
//
// 🔴 `kind` 4종: research_project · research_nodes · node_links · weekly_task.
//   ENUM 이 아니라 varchar + 앱 화이트리스트다 — 늘릴 때 ALTER 없이 늘리려는 것(researchTree.KINDS 와 같은 이유).
//
// 🔴 `status` 4종: pending → approved | rejected | failed.
//   `failed` 는 승인은 눌렀는데 실행이 실패한 상태다(사이에 프로젝트가 지워졌다든가).
//   pending 으로 되돌리지 않는다 — 되돌리면 "무엇이 왜 실패했는지"가 사라진다.
//
// 🔴 FK 는 `message_id` → master_messages(CASCADE) 하나다. 대화를 지우면 메시지가 지워지고
//   그 연쇄로 카드도 지워진다. chat_id 는 조회 인덱스용 사본이다.
const MasterAction = sequelize.define('MasterAction', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:    { type: DataTypes.INTEGER, allowNull: false },
  chat_id:    { type: DataTypes.INTEGER, allowNull: false },
  message_id: { type: DataTypes.INTEGER, allowNull: false },
  kind:       { type: DataTypes.STRING(30), allowNull: false },
  payload:    { type: DataTypes.TEXT, allowNull: false },
  status:     { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pending' },
  result:     { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
  created_at:  { type: DataTypes.DATE },
  resolved_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
}, { tableName: 'master_actions' });

module.exports = MasterAction;
