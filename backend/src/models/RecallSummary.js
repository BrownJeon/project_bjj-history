const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// AI 복기 카드 캐시 (task-025).
//
// 🔴 캐시 키가 (user_id, query_norm, class_ids_hash) 3개인 이유:
//   - user_id      : 계정 격리. 없으면 남의 요약을 받는다.
//   - query_norm   : 검색 조건 전체(q + pos + from + to). **q 만 쓰면 조건이 다른 검색이 같은
//                    요약을 받는다** — 포지션만 바꿔 검색했는데 전과 똑같은 카드가 나온다.
//   - class_ids_hash: 실제로 요약에 들어간 수업 id 목록의 sha256. 수업이 하나라도 추가·제외되면
//                    해시가 달라져 **자동으로 무효화**된다. 이게 이 설계의 요점이다 —
//                    별도의 만료 정책이나 수동 무효화 코드가 필요 없다.
//
// 🔴 UNIQUE(user_id, query_norm, class_ids_hash): 같은 조합을 동시에 두 요청이 들어와 둘 다
//   캐시 미스로 판정하고 각자 AI 를 부른 뒤 둘 다 INSERT 하는 경합을 **DB 층에서** 막는다.
//   앱의 SELECT→INSERT 사이에는 언제나 틈이 있다(technique_mastery 와 같은 이유).
//
// 🔴 query_norm 은 VARCHAR(200) + STRICT 모드다. 201자는 잘리는 게 아니라 **에러**다.
//   services/recallSearch.js 의 buildQueryNorm() 이 200자를 넘을 수 없게 만든다(길면 sha256 표기).
//
// prompt_chars 는 QA 관측용이다 — 실제로 보낸 프롬프트가 몇 자였는지를 API 응답 밖에서도
// (DB 를 직접 열어서) 확인할 수 있어야 "20,000자 이내"가 자기 보고가 아닌 사실이 된다.
const RecallSummary = sequelize.define('RecallSummary', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:        { type: DataTypes.INTEGER, allowNull: false },
  query_norm:     { type: DataTypes.STRING(200), allowNull: false },
  class_ids_hash: { type: DataTypes.CHAR(64), allowNull: false },
  content:        { type: DataTypes.TEXT('medium'), allowNull: true },
  prompt_chars:   { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  created_at:     { type: DataTypes.DATE },
}, { tableName: 'recall_summaries' });

module.exports = RecallSummary;
