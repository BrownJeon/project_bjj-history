const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 관장실 대화 (task-030).
//
// 🔴 **소유 정본은 이 테이블의 user_id 하나다.** master_messages·master_actions 에도 user_id 가
//   있지만 그건 부모에서 유도해 채우는 **사본**이고 권한 판정에 쓰지 않는다 —
//   research_* 3테이블과 같은 규약(task-026 계약 A-2). 모든 라우트의 소유 판별 SQL 은
//   예외 없이 master_chats 까지 조인한다. `WHERE m.id = ?` 만 보는 경로가 하나라도 있으면 IDOR 이다.
//
// 🔴 이 테이블은 **utf8mb4** 다. 앱의 나머지 테이블은 utf8mb3 이고 DB 가 STRICT 라, 채팅 본문에
//   이모지가 들어오면 잘림이 아니라 500 이 된다. 채팅은 이모지가 실제로 들어오는 유일한 입력이라
//   신규 3테이블만 utf8mb4 로 만든다(기존 테이블은 한 줄도 안 바꾼다).
//
// 🔴 `users` 에 FK 를 걸지 않는다 — 이 DB 의 FK 21건 중 users 를 참조하는 것이 0건이다(관례).
const MasterChat = sequelize.define('MasterChat', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:         { type: DataTypes.INTEGER, allowNull: false },
  title:           { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
  preview:         { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
  last_message_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  // 보관 (task-030 D-3). NULL = 진행 중, 값 있음 = 보관됨.
  // 🔴 **삭제가 아니다.** 기본 목록·홈 한 줄·배지에서만 빠지고 대화 본문·턴·승인은 그대로 산다
  //   — 사용자가 "보관"을 눌렀을 때 데이터가 사라지지 않는다는 것이 이 컬럼의 존재 이유다.
  //   상태를 boolean 이 아니라 시각으로 두는 이유: "언제 보관했는지"가 나중에 정렬·감사에 쓰인다.
  archived_at:     { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  created_at:      { type: DataTypes.DATE },
  updated_at:      { type: DataTypes.DATE },
}, { tableName: 'master_chats' });

module.exports = MasterChat;
