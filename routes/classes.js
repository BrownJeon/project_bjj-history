const express = require('express');
const router = express.Router();
const { pool, safeParse } = require('../db');

async function loadClipsFor(table, idCol, ids) {
  if (!ids.length) return new Map();
  const joinTable = table === 'drill' ? 'drill_clips' : 'spar_day_clips';
  const [rows] = await pool.query(`
    SELECT jc.${idCol} AS parent_id, jc.position, vc.id, vc.title, vc.url, vc.platform, vc.description, vc.starred
    FROM ${joinTable} jc
    JOIN video_clips vc ON vc.id = jc.clip_id
    WHERE jc.${idCol} IN (?)
    ORDER BY jc.${idCol}, jc.position, jc.clip_id
  `, [ids]);
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.parent_id)) m.set(r.parent_id, []);
    m.get(r.parent_id).push({
      id: r.id, title: r.title, url: r.url,
      platform: r.platform, description: r.description, starred: r.starred
    });
  }
  return m;
}

async function setDrillClips(drillId, clipIds) {
  await pool.query('DELETE FROM drill_clips WHERE drill_id = ?', [drillId]);
  const unique = [...new Set((clipIds || []).map(Number).filter(Boolean))];
  for (let i = 0; i < unique.length; i++) {
    await pool.query('INSERT IGNORE INTO drill_clips (drill_id, clip_id, position) VALUES (?,?,?)', [drillId, unique[i], i]);
  }
}

async function setSparDayClips(sparDayId, clipIds) {
  await pool.query('DELETE FROM spar_day_clips WHERE spar_day_id = ?', [sparDayId]);
  const unique = [...new Set((clipIds || []).map(Number).filter(Boolean))];
  for (let i = 0; i < unique.length; i++) {
    await pool.query('INSERT IGNORE INTO spar_day_clips (spar_day_id, clip_id, position) VALUES (?,?,?)', [sparDayId, unique[i], i]);
  }
}

router.get('/', async (_req, res) => {
  try {
    const [classes] = await pool.query('SELECT * FROM classes ORDER BY date DESC, id DESC');

    // 전체 drill/spar_day id를 모아서 일괄 clips 조회
    const [allDrills] = await pool.query(
      `SELECT id FROM drills WHERE class_id IN (${classes.map(()=>'?').join(',') || 'NULL'})`,
      classes.map(c => c.id)
    );
    const [allSparDays] = await pool.query(
      `SELECT id FROM spar_days WHERE class_id IN (${classes.map(()=>'?').join(',') || 'NULL'})`,
      classes.map(c => c.id)
    );
    const drillClipsMap   = await loadClipsFor('drill',    'drill_id',    allDrills.map(d => d.id));
    const sparDayClipsMap = await loadClipsFor('spar_day', 'spar_day_id', allSparDays.map(s => s.id));

    for (const c of classes) {
      const [[drill]] = await pool.query(
        'SELECT * FROM drills WHERE class_id=? ORDER BY id ASC LIMIT 1', [c.id]);
      if(drill){
        drill.tech      = safeParse(drill.tech, []);
        drill.detail    = safeParse(drill.detail, []);
        drill.chain_ids = safeParse(drill.chain_ids, []);
        drill.clips     = drillClipsMap.get(drill.id) || [];
        // 하위호환: 프론트가 아직 links를 참조해도 깨지지 않게 동일 구조로 제공
        drill.links     = drill.clips.map(cl => ({ url: cl.url, desc: cl.title }));
        if (drill.note && drill.note.trim()) {
          c.note = c.note ? `${c.note}\n\n${drill.note}` : drill.note;
        }
        drill.note = '';
        c.drill = drill;
      } else { c.drill = null; }
      c.feedback = c.feedback || '';

      const [sparDays] = await pool.query(
        'SELECT * FROM spar_days WHERE class_id=? ORDER BY date ASC, id ASC', [c.id]);
      const allSessions = [];
      for (const sd of sparDays) {
        const [sess] = await pool.query(
          'SELECT * FROM spar_sessions WHERE spar_day_id=? ORDER BY id ASC', [sd.id]);
        sess.forEach(s => {
          s.success = safeParse(s.success, []).map(x =>
            typeof x === 'string' ? { name: x, success: true } : x
          );
          s.weak           = safeParse(s.weak, []);
          s.opponent       = s.opponent || '';
          const legacyScore = parseInt(s.position_score) || 0;
          s.positions      = safeParse(s.positions, []).map(p =>
            typeof p === 'string'
              ? { name: p, score: legacyScore }
              : { name: p.name || '', score: parseInt(p.score) || 0 }
          );
          s.position_score = legacyScore;
        });
        sd.sessions = sess;
        sd.clips    = sparDayClipsMap.get(sd.id) || [];
        sd.links    = sd.clips.map(cl => ({ url: cl.url, desc: cl.title }));
        allSessions.push(...sess);
      }
      c.spar_days   = sparDays;
      c.sessions    = allSessions;
      c.spar_note   = sparDays.length > 0 ? (sparDays[0].day_note || '') : '';
      c.spar_day_id = sparDays.length > 0 ? sparDays[0].id : null;

      c.trained_dates = safeParse(c.trained_dates, []);
    }
    res.json(classes);
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { date, dateEnd, theme, note, feedback, trainedDates, drill } = req.body;
    const [r] = await pool.query(
      'INSERT INTO classes (date, date_end, theme, note, feedback, trained_dates) VALUES (?,?,?,?,?,?)',
      [date, dateEnd || null, theme || '', note || '', feedback || '', JSON.stringify(trainedDates || [])]
    );
    const classId = r.insertId;

    if (drill) {
      const techStr     = JSON.stringify(drill.tech     || []);
      const detailStr   = JSON.stringify(drill.detail   || []);
      const chainIdsStr = JSON.stringify(drill.chainIds || []);
      const [dr] = await pool.query(
        'INSERT INTO drills (class_id, date, date_end, pos, tech, detail, stars, links, note, chain_ids) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [classId, date, dateEnd || null, drill.pos || '', techStr, detailStr, drill.stars || 0, '[]', '', chainIdsStr]
      );
      await setDrillClips(dr.insertId, drill.clipIds);
    }

    res.json({ id: classId });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { date, dateEnd, theme, note, feedback, trainedDates, drill } = req.body;
    const id = req.params.id;

    await pool.query('UPDATE classes SET date=?, date_end=?, theme=?, note=?, feedback=?, trained_dates=? WHERE id=?', [date, dateEnd || null, theme || '', note || '', feedback || '', JSON.stringify(trainedDates || []), id]);

    const [[existDrill]] = await pool.query('SELECT id FROM drills WHERE class_id=?', [id]);
    if (drill) {
      const techStr     = JSON.stringify(drill.tech     || []);
      const detailStr   = JSON.stringify(drill.detail   || []);
      const chainIdsStr = JSON.stringify(drill.chainIds || []);
      let drillId;
      if (existDrill) {
        await pool.query(
          'UPDATE drills SET date=?, date_end=?, pos=?, tech=?, detail=?, stars=?, note=?, chain_ids=? WHERE id=?',
          [date, dateEnd || null, drill.pos || '', techStr, detailStr, drill.stars || 0, '', chainIdsStr, existDrill.id]
        );
        drillId = existDrill.id;
      } else {
        const [dr] = await pool.query(
          'INSERT INTO drills (class_id, date, date_end, pos, tech, detail, stars, links, note, chain_ids) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [id, date, dateEnd || null, drill.pos || '', techStr, detailStr, drill.stars || 0, '[]', '', chainIdsStr]
        );
        drillId = dr.insertId;
      }
      await setDrillClips(drillId, drill.clipIds);
    } else if (existDrill) {
      await pool.query('DELETE FROM drills WHERE class_id=?', [id]);
    }

    res.json({ ok: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/toggle-date', async (req, res) => {
  try {
    const { date } = req.body;
    if(!date) return res.status(400).json({ error: 'date required' });
    const [[c]] = await pool.query('SELECT trained_dates FROM classes WHERE id=?', [req.params.id]);
    if(!c) return res.status(404).json({ error: 'not found' });
    const dates = safeParse(c.trained_dates, []);
    const idx = dates.indexOf(date);
    if(idx === -1) dates.push(date);
    else           dates.splice(idx, 1);
    dates.sort();
    await pool.query('UPDATE classes SET trained_dates=? WHERE id=?',
      [JSON.stringify(dates), req.params.id]);
    res.json({ ok: true, trained_dates: dates });
  } catch(e){ console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [sparDays] = await pool.query('SELECT id FROM spar_days WHERE class_id=?', [id]);
    for (const sd of sparDays) {
      await pool.query('DELETE FROM spar_sessions WHERE spar_day_id=?', [sd.id]);
    }
    await pool.query('DELETE FROM spar_days WHERE class_id=?', [id]);
    await pool.query('DELETE FROM drills WHERE class_id=?', [id]);
    await pool.query('DELETE FROM classes WHERE id=?', [id]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 스파링 CRUD (날짜별 독립 등록) ──
router.post('/:id/spar', async (req, res) => {
  try {
    const classId = req.params.id;
    const [[cls]] = await pool.query('SELECT id FROM classes WHERE id=?', [classId]);
    if(!cls) return res.status(404).json({ error: 'class not found' });

    const { date, dayNote, sessions, clipIds } = req.body;
    if(!date) return res.status(400).json({ error: 'date required' });

    const [sr] = await pool.query(
      'INSERT INTO spar_days (class_id, date, day_note, links) VALUES (?,?,?,?)',
      [classId, date, dayNote || '', '[]']
    );
    const sparDayId = sr.insertId;
    await setSparDayClips(sparDayId, clipIds);

    for (const s of (sessions || [])) {
      await pool.query(
        'INSERT INTO spar_sessions (spar_day_id, level, tap_got, tap_gave, time_min, success, weak, note, opponent, positions, position_score) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [sparDayId, s.level || '', s.tapGot || 0, s.tapGave || 0, s.time || null,
         JSON.stringify(s.success || []), JSON.stringify(s.weak || []), s.note || '', s.opponent || '',
         JSON.stringify(s.positions || []), parseInt(s.positionScore) || 0]
      );
    }
    res.json({ id: sparDayId });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.put('/:id/spar/:sparDayId', async (req, res) => {
  try {
    const { sparDayId } = req.params;
    const [[sd]] = await pool.query('SELECT id FROM spar_days WHERE id=? AND class_id=?', [sparDayId, req.params.id]);
    if(!sd) return res.status(404).json({ error: 'spar_day not found' });

    const { date, dayNote, sessions, clipIds } = req.body;
    await pool.query('UPDATE spar_days SET date=?, day_note=? WHERE id=?',
      [date, dayNote || '', sparDayId]);
    await setSparDayClips(sparDayId, clipIds);

    await pool.query('DELETE FROM spar_sessions WHERE spar_day_id=?', [sparDayId]);
    for (const s of (sessions || [])) {
      await pool.query(
        'INSERT INTO spar_sessions (spar_day_id, level, tap_got, tap_gave, time_min, success, weak, note, opponent, positions, position_score) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [sparDayId, s.level || '', s.tapGot || 0, s.tapGave || 0, s.time || null,
         JSON.stringify(s.success || []), JSON.stringify(s.weak || []), s.note || '', s.opponent || '',
         JSON.stringify(s.positions || []), parseInt(s.positionScore) || 0]
      );
    }
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/:id/spar/:sparDayId', async (req, res) => {
  try {
    const { sparDayId } = req.params;
    const [[sd]] = await pool.query('SELECT id FROM spar_days WHERE id=? AND class_id=?', [sparDayId, req.params.id]);
    if(!sd) return res.status(404).json({ error: 'spar_day not found' });
    await pool.query('DELETE FROM spar_sessions WHERE spar_day_id=?', [sparDayId]);
    await pool.query('DELETE FROM spar_days WHERE id=?', [sparDayId]);
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
