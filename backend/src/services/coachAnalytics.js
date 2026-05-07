const { Class, Drill, SparDay, SparSession } = require('../models');
const { safeParse } = require('../utils/respond');
const { Op } = require('sequelize');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

async function collectTrainingData(periodStart, periodEnd) {
  const classes = await Class.findAll({
    where: {
      [Op.or]: [
        { date:     { [Op.between]: [periodStart, periodEnd] } },
        { date_end: { [Op.between]: [periodStart, periodEnd] } },
      ],
    },
    order: [['date', 'ASC']],
    raw: true,
  });
  const data = [];
  for (const c of classes) {
    const drill = await Drill.findOne({ where: { class_id: c.id }, order: [['id', 'ASC']], raw: true });
    if (drill) {
      drill.tech      = safeParse(drill.tech, []);
      drill.detail    = safeParse(drill.detail, []);
      drill.links     = safeParse(drill.links, []);
      drill.chain_ids = safeParse(drill.chain_ids, []);
    }
    const sparDays = await SparDay.findAll({
      where: { class_id: c.id, date: { [Op.between]: [periodStart, periodEnd] } },
      order: [['date', 'ASC']],
      raw: true,
    });
    const sparList = [];
    for (const sd of sparDays) {
      const sess = await SparSession.findAll({ where: { spar_day_id: sd.id }, order: [['id', 'ASC']], raw: true });
      const sessions = sess.map(s => {
        const legacyScore = parseInt(s.position_score) || 0;
        return {
          level: s.level || '', opponent: s.opponent || '',
          tapGot: s.tap_got || 0, tapGave: s.tap_gave || 0, timeMin: s.time_min || 0,
          success: safeParse(s.success, []).map(x => typeof x === 'string' ? { name: x, success: true } : x),
          weak: safeParse(s.weak, []),
          positions: safeParse(s.positions, []).map(p =>
            typeof p === 'string' ? { name: p, score: legacyScore }
                                  : { name: p.name || '', score: parseInt(p.score) || 0 }),
          note: s.note || '',
        };
      });
      sparList.push({
        date: (sd.date || '').toString().slice(0, 10),
        dayNote: sd.day_note || '',
        sessions,
      });
    }
    data.push({
      id: c.id,
      date:    (c.date || '').toString().slice(0, 10),
      dateEnd: c.date_end ? c.date_end.toString().slice(0, 10) : null,
      theme: c.theme || '', note: c.note || '', feedback: c.feedback || '',
      trainedDates: safeParse(c.trained_dates, []),
      drill: drill || null,
      sparDays: sparList,
    });
  }
  return data;
}

function computeDiagnosis(data, periodStart, periodEnd) {
  let sessionCount = 0, totalMin = 0, tapGot = 0, tapGave = 0;
  const trainedDays = new Set();
  const weakCount   = {};
  const attemptMap  = {};
  const positionMap = {};
  const beltMap     = {};
  const usedPositions = new Set();
  const inRange = d => d && d >= periodStart && d <= periodEnd;

  for (const c of data) {
    (c.trainedDates || []).filter(inRange).forEach(d => trainedDays.add(d));
    for (const sd of c.sparDays) {
      trainedDays.add(sd.date);
      for (const s of sd.sessions) {
        sessionCount++;
        totalMin += s.timeMin || 0;
        tapGot   += s.tapGot  || 0;
        tapGave  += s.tapGave || 0;
        (s.weak || []).forEach(w => { weakCount[w] = (weakCount[w] || 0) + 1; });
        (s.success || []).forEach(a => {
          if (!a.name) return;
          if (!attemptMap[a.name]) attemptMap[a.name] = { tried: 0, success: 0 };
          attemptMap[a.name].tried++;
          if (a.success) attemptMap[a.name].success++;
        });
        (s.positions || []).forEach(p => {
          if (!p.name) return;
          usedPositions.add(p.name);
          if (!positionMap[p.name]) positionMap[p.name] = { sum: 0, count: 0 };
          const score = parseInt(p.score) || 0;
          if (score > 0) { positionMap[p.name].sum += score; positionMap[p.name].count++; }
        });
        const belt = s.level || '기타';
        if (!beltMap[belt]) beltMap[belt] = { tapGot: 0, tapGave: 0, sessions: 0 };
        beltMap[belt].tapGot  += s.tapGot  || 0;
        beltMap[belt].tapGave += s.tapGave || 0;
        beltMap[belt].sessions++;
      }
    }
  }

  return {
    summary: {
      classes: data.length, sessions: sessionCount, minutes: totalMin,
      trainedDays: trainedDays.size, tapGot, tapGave,
    },
    weakTop: Object.entries(weakCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    failedTechs: Object.entries(attemptMap)
      .map(([name, v]) => ({ name, tried: v.tried, success: v.success, rate: v.tried ? v.success / v.tried : 0 }))
      .filter(t => t.tried >= 1 && t.rate < 0.5)
      .sort((a, b) => a.rate - b.rate || b.tried - a.tried).slice(0, 5),
    positions: Object.entries(positionMap)
      .map(([name, v]) => ({ name, avg: v.count ? +(v.sum / v.count).toFixed(1) : 0, count: v.count }))
      .sort((a, b) => b.count - a.count),
    byOpponentBelt: Object.entries(beltMap).map(([belt, v]) => ({ belt, ...v }))
      .sort((a, b) => b.sessions - a.sessions),
    usedPositions: [...usedPositions],
  };
}

function serializeForPrompt(data) {
  if (!data.length) return '(데이터 없음)';
  const blocks = data.map(c => {
    const lines = [];
    const range = c.dateEnd ? `${c.date} ~ ${c.dateEnd}` : c.date;
    lines.push(`[수업 ${range}]${c.theme ? ' 테마: ' + c.theme : ''}`);
    if (c.drill) {
      const d = c.drill;
      const parts = [];
      if (d.pos) parts.push(`포지션 ${d.pos}`);
      if (d.stars) parts.push(`★${d.stars}`);
      if ((d.tech || []).length) parts.push(`기술: ${d.tech.join(', ')}`);
      if ((d.detail || []).length) parts.push(`디테일: ${d.detail.join(', ')}`);
      if (parts.length) lines.push('  드릴: ' + parts.join(' · '));
    }
    if (c.note) lines.push(`  메모: ${c.note.replace(/\n/g, ' ').slice(0, 300)}`);
    if (c.feedback) lines.push(`  피드백: ${c.feedback.replace(/\n/g, ' ').slice(0, 300)}`);
    for (const sd of c.sparDays) {
      lines.push(`  · 스파링 ${sd.date}`);
      sd.sessions.forEach((s, i) => {
        const header = [`세션${i + 1}`, s.level ? `${s.level}벨트` : null, s.opponent || null,
          `탭 ${s.tapGot}:${s.tapGave}`, s.timeMin ? `${s.timeMin}분` : null].filter(Boolean).join(' · ');
        lines.push(`    [${header}]`);
        if ((s.positions || []).length) {
          lines.push(`      점유 포지션: ${s.positions.map(p => `${p.name}${p.score ? ' ★' + p.score : ''}`).join(', ')}`);
        }
        if ((s.success || []).length) {
          lines.push(`      시도 기술: ${s.success.map(a => `${a.success ? '✓' : '✗'} ${a.name}`).join(', ')}`);
        }
        if ((s.weak || []).length) lines.push(`      부족했던 부분: ${s.weak.join(', ')}`);
        if (s.note) lines.push(`      메모: ${s.note.replace(/\n/g, ' ').slice(0, 200)}`);
      });
      if (sd.dayNote) lines.push(`    전체 메모: ${sd.dayNote.replace(/\n/g, ' ').slice(0, 300)}`);
    }
    return lines.join('\n');
  });
  return blocks.join('\n\n');
}

module.exports = { collectTrainingData, computeDiagnosis, serializeForPrompt, daysAgo, todayStr };
