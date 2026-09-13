const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 참고영상 사용 기록 (task-035) — 👁 봤음(view) + 🥋 써봤음(drill / position_spar / spar)
//
// 🔴 카운터 컬럼이 아니라 **기록 1건 = 1행**이다. video_clips 에 숫자를 두면 "방금 누른 것 취소"와
//   "언제 썼는지"를 되살릴 수 없다. 숫자는 services/clipUsage.getUsageMap 이 GROUP BY 로 센다.
//
// 🔴 view 는 **하루 1회**(같은 user·clip·used_on). DB UNIQUE 가 아니라 라우트가 clip 행 잠금
//   (SELECT … FOR UPDATE) 안에서 검사한다 — 수동 3종은 같은 날 여러 번이 정상이라 한 인덱스로 못 묶는다.
//
// 🔴 used_on 은 **KST 날짜**다(services/clipUsage.kstToday). toISOString() 으로 만들면 KST 00~09시
//   기록이 전날로 들어간다(coachAnalytics UTC 버그와 같은 함정).
//
// 🔴 mastery_tech_ids: 이 기록이 **새로 켠** technique_mastery 단계의 기술 id JSON 배열.
//   이미 켜져 있던 기술은 넣지 않는다 — 취소 시 "내가 켠 것만" 되돌리기 위한 근거다.
//   view·spar 는 숙련도를 건드리지 않으므로 NULL.
//
// DB FK fk_cul_clip → video_clips(id) ON DELETE CASCADE (index.js [mig][task-035] 가 부팅마다 실측).
const ClipUsageLog = sequelize.define('ClipUsageLog', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:          { type: DataTypes.INTEGER, allowNull: false },
  clip_id:          { type: DataTypes.INTEGER, allowNull: false },
  kind:             { type: DataTypes.ENUM('view', 'drill', 'position_spar', 'spar'), allowNull: false },
  used_on:          { type: DataTypes.DATEONLY, allowNull: false },
  mastery_tech_ids: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
  created_at:       { type: DataTypes.DATE },
}, { tableName: 'clip_usage_logs' });

module.exports = ClipUsageLog;
