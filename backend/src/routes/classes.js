const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize, Class, Drill, SparDay, SparSession } = require('../models');
const { wrap, safeParse } = require('../utils/respond');

// 기존 drill_clips / spar_day_clips 조인은 더 이상 사용하지 않으므로 빈 배열로 반환
router.get('/', wrap(async (_req, res) => {
  const classes = await Class.findAll({
    order: [['date', 'DESC'], ['id', 'DESC']],
    raw: true,
  });

  for (const c of classes) {
    const drill = await Drill.findOne({
      where: { class_id: c.id },
      order: [['id', 'ASC']],
      raw: true,
    });
    if (drill) {
      drill.tech      = safeParse(drill.tech, []);
      drill.detail    = safeParse(drill.detail, []);
      drill.chain_ids = safeParse(drill.chain_ids, []);
      drill.clips     = [];
      drill.links     = [];
      if (drill.note && drill.note.trim()) {
        c.note = c.note ? `${c.note}\n\n${drill.note}` : drill.note;
      }
      drill.note = '';
      c.drill = drill;
    } else {
      c.drill = null;
    }
    c.feedback = c.feedback || '';

    const sparDays = await SparDay.findAll({
      where: { class_id: c.id },
      order: [['date', 'ASC'], ['id', 'ASC']],
      raw: true,
    });
    const allSessions = [];
    for (const sd of sparDays) {
      const sess = await SparSession.findAll({
        where: { spar_day_id: sd.id },
        order: [['id', 'ASC']],
        raw: true,
      });
      sess.forEach(s => {
        s.success = safeParse(s.success, []).map(x =>
          typeof x === 'string' ? { name: x, success: true } : x
        );
        s.weak     = safeParse(s.weak, []);
        s.opponent = s.opponent || '';
        const legacyScore = parseInt(s.position_score) || 0;
        s.positions = safeParse(s.positions, []).map(p =>
          typeof p === 'string'
            ? { name: p, score: legacyScore }
            : { name: p.name || '', score: parseInt(p.score) || 0 }
        );
        s.position_score = legacyScore;
      });
      sd.sessions = sess;
      sd.clips    = [];
      sd.links    = [];
      allSessions.push(...sess);
    }
    c.spar_days   = sparDays;
    c.sessions    = allSessions;
    c.spar_note   = sparDays.length > 0 ? (sparDays[0].day_note || '') : '';
    c.spar_day_id = sparDays.length > 0 ? sparDays[0].id : null;
    c.trained_dates = safeParse(c.trained_dates, []);
  }
  res.json(classes);
}));

router.post('/', wrap(async (req, res) => {
  const { date, dateEnd, theme, note, feedback, trainedDates, drill } = req.body;
  const id = await sequelize.transaction(async (t) => {
    const cls = await Class.create({
      date, date_end: dateEnd || null,
      theme: theme || '', note: note || '', feedback: feedback || '',
      trained_dates: JSON.stringify(trainedDates || []),
    }, { transaction: t });
    if (drill) {
      await Drill.create({
        class_id: cls.id,
        date, date_end: dateEnd || null,
        pos: drill.pos || '',
        tech:   JSON.stringify(drill.tech   || []),
        detail: JSON.stringify(drill.detail || []),
        stars: drill.stars || 0,
        links: '[]',
        note: '',
        chain_ids: JSON.stringify(drill.chainIds || []),
      }, { transaction: t });
    }
    return cls.id;
  });
  res.json({ id });
}));

router.put('/:id', wrap(async (req, res) => {
  const id = req.params.id;
  const { date, dateEnd, theme, note, feedback, trainedDates, drill } = req.body;
  await sequelize.transaction(async (t) => {
    await Class.update({
      date, date_end: dateEnd || null,
      theme: theme || '', note: note || '', feedback: feedback || '',
      trained_dates: JSON.stringify(trainedDates || []),
    }, { where: { id }, transaction: t });

    const existDrill = await Drill.findOne({ where: { class_id: id }, transaction: t });
    if (drill) {
      const data = {
        date, date_end: dateEnd || null,
        pos: drill.pos || '',
        tech:   JSON.stringify(drill.tech   || []),
        detail: JSON.stringify(drill.detail || []),
        stars: drill.stars || 0,
        note: '',
        chain_ids: JSON.stringify(drill.chainIds || []),
      };
      if (existDrill) await existDrill.update(data, { transaction: t });
      else await Drill.create({ class_id: id, links: '[]', ...data }, { transaction: t });
    } else if (existDrill) {
      await Drill.destroy({ where: { class_id: id }, transaction: t });
    }
  });
  res.json({ ok: true });
}));

router.patch('/:id/toggle-date', wrap(async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  const c = await Class.findByPk(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const dates = safeParse(c.trained_dates, []);
  const idx = dates.indexOf(date);
  if (idx === -1) dates.push(date); else dates.splice(idx, 1);
  dates.sort();
  await c.update({ trained_dates: JSON.stringify(dates) });
  res.json({ ok: true, trained_dates: dates });
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = req.params.id;
  await sequelize.transaction(async (t) => {
    const sparDays = await SparDay.findAll({ where: { class_id: id }, attributes: ['id'], raw: true, transaction: t });
    const sparDayIds = sparDays.map(s => s.id);
    if (sparDayIds.length) {
      await SparSession.destroy({ where: { spar_day_id: { [Op.in]: sparDayIds } }, transaction: t });
    }
    await SparDay.destroy({ where: { class_id: id }, transaction: t });
    await Drill.destroy({ where: { class_id: id }, transaction: t });
    await Class.destroy({ where: { id }, transaction: t });
  });
  res.json({ ok: true });
}));

// ─── 스파링 CRUD ───
async function insertSessions(sparDayId, sessions, transaction) {
  for (const s of sessions || []) {
    await SparSession.create({
      spar_day_id: sparDayId,
      level: s.level || '',
      opponent: s.opponent || '',
      tap_got: s.tapGot || 0,
      tap_gave: s.tapGave || 0,
      time_min: s.time || null,
      success: JSON.stringify(s.success || []),
      weak: JSON.stringify(s.weak || []),
      note: s.note || '',
      positions: JSON.stringify(s.positions || []),
      position_score: parseInt(s.positionScore) || 0,
    }, { transaction });
  }
}

router.post('/:id/spar', wrap(async (req, res) => {
  const classId = req.params.id;
  const cls = await Class.findByPk(classId);
  if (!cls) return res.status(404).json({ error: 'class not found' });
  const { date, dayNote, sessions } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  const sparDayId = await sequelize.transaction(async (t) => {
    const sd = await SparDay.create({ class_id: classId, date, day_note: dayNote || '', links: '[]' }, { transaction: t });
    await insertSessions(sd.id, sessions, t);
    return sd.id;
  });
  res.json({ id: sparDayId });
}));

router.put('/:id/spar/:sparDayId', wrap(async (req, res) => {
  const { id, sparDayId } = req.params;
  const sd = await SparDay.findOne({ where: { id: sparDayId, class_id: id } });
  if (!sd) return res.status(404).json({ error: 'spar_day not found' });
  const { date, dayNote, sessions } = req.body;
  await sequelize.transaction(async (t) => {
    await sd.update({ date, day_note: dayNote || '' }, { transaction: t });
    await SparSession.destroy({ where: { spar_day_id: sparDayId }, transaction: t });
    await insertSessions(sparDayId, sessions, t);
  });
  res.json({ ok: true });
}));

router.delete('/:id/spar/:sparDayId', wrap(async (req, res) => {
  const { id, sparDayId } = req.params;
  const sd = await SparDay.findOne({ where: { id: sparDayId, class_id: id } });
  if (!sd) return res.status(404).json({ error: 'spar_day not found' });
  await sequelize.transaction(async (t) => {
    await SparSession.destroy({ where: { spar_day_id: sparDayId }, transaction: t });
    await SparDay.destroy({ where: { id: sparDayId }, transaction: t });
  });
  res.json({ ok: true });
}));

module.exports = router;
