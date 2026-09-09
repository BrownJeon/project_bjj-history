const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 관장실 메시지 (task-030).
//
// 🔴 `content` 는 MEDIUMTEXT 다. TEXT(64KB)로 두면 긴 관장 답변 + 인용이 잘리는 게 아니라
//   STRICT 모드에서 **에러**가 된다. 사용자가 쓰는 글은 2,000자로 막지만 관장 답변은 상한이 없다.
//
// 🔴 `status` 3종: pending → done | failed.
//   `pending` 은 "지금 관장이 답하는 중"이다. 서버가 재시작되면 그 턴은 영영 끝나지 않으므로
//   기동 시 잔존 pending 을 failed 로 마킹한다(index.js `[mig][task-030]`). 안 하면 화면이
//   영원히 "생각하는 중"으로 남고, 동시 턴 락(409)도 영영 안 풀린다.
//
// 🔴 `tool_log` 는 JSON 문자열이다. 응답에서는 반드시 파싱해 **객체로** 내려준다(계약 B).
//   문자열로 내려주면 프론트가 각자 파싱하고, 파싱 실패가 화면마다 다르게 나타난다.
const MasterMessage = sequelize.define('MasterMessage', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:    { type: DataTypes.INTEGER, allowNull: false },
  chat_id:    { type: DataTypes.INTEGER, allowNull: false },
  role:       { type: DataTypes.STRING(10), allowNull: false },   // user | master
  content:    { type: DataTypes.TEXT('medium'), allowNull: false },
  tool_log:   { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
  status:     { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'done' },
  created_at: { type: DataTypes.DATE },
}, { tableName: 'master_messages' });

module.exports = MasterMessage;
