const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// 참고영상 사용 기록 집계 (task-035) — 👁 봤음 / 🥋 써봤음(드릴·포지션 스파링·스파링)
//
// 🔴 **clip 수만큼 쿼리하지 않는다.** 목록 API(GET /api/clips · GET /api/techniques)가 한 번에
//   부르므로, 몇 개의 clip 이든 GROUP BY 1회 + 최근 수동 기록 1회 = **정확히 2쿼리**다.

const USAGE_KINDS  = ['view', 'drill', 'position_spar', 'spar'];
const MANUAL_KINDS = ['drill', 'position_spar', 'spar'];

// 🔴 toISOString() 금지 — UTC 라서 KST 00~09시 기록이 전날로 들어간다
//    (board 백로그의 coachAnalytics UTC 버그와 같은 함정). sv-SE 로케일이 'YYYY-MM-DD' 를 낸다.
const KST_DATE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** KST 기준 오늘 'YYYY-MM-DD'. */
function kstToday(now = new Date()) {
  return KST_DATE.format(now);
}

function emptyUsage() {
  return {
    view: 0, drill: 0, position_spar: 0, spar: 0,
    used: 0,               // drill + position_spar + spar
    last_used_on: null,    // 수동 3종 중 가장 최근 used_on
    last_viewed_on: null,  // view 의 가장 최근 used_on
    recent: [],            // [{ id, kind, used_on }] 최신순 최대 3건 — 수동 기록만
  };
}

/**
 * video_clips.tech_name(JSON 배열 문자열) → NFC 이름 배열.
 * 🔴 trim·소문자화·별칭·퍼지 없음 — **글자 그대로**. 기술↔영상 연결(techniques.js loadClipsByNames 의
 *   JSON_CONTAINS)이 대소문자 구분 정확 일치이므로 같은 기준을 쓴다("오매칭보다 미매칭", task-020b).
 *   NFC 만은 맞춘다 — 눈에 똑같이 보이는 이름이 정규화 형태 차이로 조용히 어긋나지 않게(task-014).
 */
function clipTechNames(raw) {
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw) {
    try {
      const p = JSON.parse(raw);
      arr = Array.isArray(p) ? p : (p ? [p] : []);
    } catch {
      arr = [raw];
    }
  }
  return arr
    .map((x) => (typeof x === 'string' ? x : (x && typeof x.name === 'string' ? x.name : '')))
    .filter(Boolean)
    .map((s) => s.normalize('NFC'));
}

/**
 * @param {number} userId
 * @param {Array<number|string>} clipIds
 * @param {{transaction?: import('sequelize').Transaction}} [opts]
 * @returns {Promise<Record<number, ReturnType<typeof emptyUsage>>>} 요청한 모든 id 에 대해 값이 있다(기록 없으면 0/null/[])
 */
async function getUsageMap(userId, clipIds, opts = {}) {
  const ids = [...new Set((clipIds || []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
  const map = {};
  for (const id of ids) map[id] = emptyUsage();
  if (!ids.length) return map;
  const { transaction } = opts;

  // 1) 종류별 개수 + 마지막 날짜 — GROUP BY 한 번
  //    DATE_FORMAT 으로 문자열을 받는다: DATE 를 드라이버가 JS Date 로 바꾸면 TZ 가 끼어 하루가 밀릴 수 있다.
  const counts = await sequelize.query(
    `SELECT clip_id, kind, COUNT(*) AS n, DATE_FORMAT(MAX(used_on), '%Y-%m-%d') AS last_on
       FROM clip_usage_logs
      WHERE user_id = ? AND clip_id IN (?)
      GROUP BY clip_id, kind`,
    { replacements: [userId, ids], type: QueryTypes.SELECT, transaction }
  );
  for (const r of counts) {
    const u = map[r.clip_id];
    if (!u || !USAGE_KINDS.includes(r.kind)) continue;
    u[r.kind] = Number(r.n) || 0;
    if (r.kind === 'view') {
      u.last_viewed_on = r.last_on;
    } else if (!u.last_used_on || r.last_on > u.last_used_on) {
      u.last_used_on = r.last_on;
    }
  }
  for (const id of ids) {
    const u = map[id];
    u.used = u.drill + u.position_spar + u.spar;
  }

  // 2) clip 별 최근 수동 기록 최대 3건 — 윈도 함수 한 번(MariaDB 10.2+)
  const recent = await sequelize.query(
    `SELECT id, clip_id, kind, used_on FROM (
        SELECT id, clip_id, kind, DATE_FORMAT(used_on, '%Y-%m-%d') AS used_on,
               ROW_NUMBER() OVER (PARTITION BY clip_id ORDER BY id DESC) AS rn
          FROM clip_usage_logs
         WHERE user_id = ? AND clip_id IN (?) AND kind <> 'view'
      ) t
      WHERE rn <= 3
      ORDER BY clip_id, id DESC`,
    { replacements: [userId, ids], type: QueryTypes.SELECT, transaction }
  );
  for (const r of recent) {
    const u = map[r.clip_id];
    if (u) u.recent.push({ id: r.id, kind: r.kind, used_on: r.used_on });
  }
  return map;
}

/** 각 clip 에 `usage` 필드를 붙인 **새 배열**을 돌려준다(원소 모양은 그대로 + usage). */
async function attachClipUsage(userId, clips, opts = {}) {
  const list = clips || [];
  const map = await getUsageMap(userId, list.map((c) => c && c.id), opts);
  return list.map((c) => (c ? { ...c, usage: map[Number(c.id)] || emptyUsage() } : c));
}

module.exports = {
  USAGE_KINDS,
  MANUAL_KINDS,
  kstToday,
  emptyUsage,
  clipTechNames,
  getUsageMap,
  attachClipUsage,
};
