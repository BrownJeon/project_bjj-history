const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 이번 주 과제 (task-027).
//
// 🔴 **앱 전체에 열린 과제는 1개다** — 관장 합의 "하나만 파라". 프로젝트가 여러 개여도 과제는 하나다.
//   강제는 DB 의 UNIQUE(user_id, open_slot) 이 한다(index.js 의 [mig][task-027] 블록).
//   `open_slot` 은 열려 있을 때만 1, 마감되면 NULL 인 PERSISTENT 생성 컬럼이고,
//   UNIQUE 가 NULL 을 서로 충돌로 보지 않으므로 **마감 이력은 몇 건이든 남는다.**
//   여기서는 읽기 전용으로만 노출한다 — 생성 컬럼에 값을 쓰면 DB 가 에러를 낸다.
//
// 🔴 `user_id` 격리는 이 테이블에서 **정본**이다(research_* 하위 3테이블의 "사본"과 다르다).
//   단 노드 소유 판별은 여전히 research_projects 까지 조인해서 한다 —
//   user_id 만 보고 통과시키면 자기 계정의 user_id 를 단 남의 노드 id 를 심을 수 있다.
//
// 🔴 `outcome` 은 ASCII 키다: not_tried · tried_failed · done.
//   한글 라벨(`시도 못 함`·`해봤는데 안 됨`·`됐음`)은 라우트가 응답에 붙인다.
//   비교되는 값과 읽히는 값을 한 컬럼에 섞으면 표기가 바뀔 때 과거 행이 조용히 빠진다
//   (belt_history 에 'white'/'화이트' 가 섞여 5단계 20건이 6건이 된 그 실패 방식).
//
// 🔴 마감이 사다리를 쓰지 않는다. 4·5단계는 spar_sessions.success 자동 판정이 원칙이고
//   (사양서 §5.1) 과제 결과는 **별도 기록**이다. 여기에 사다리 컬럼을 추가하는 순간
//   같은 기술의 사다리가 두 곳에서 갈린다.
const ResearchTask = sequelize.define('ResearchTask', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:    { type: DataTypes.INTEGER, allowNull: false },
  node_id:    { type: DataTypes.INTEGER, allowNull: false },
  memo:       { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
  created_at: { type: DataTypes.DATE },
  closed_at:  { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  outcome:    { type: DataTypes.STRING(20), allowNull: true, defaultValue: null },
}, { tableName: 'research_tasks' });

module.exports = ResearchTask;
