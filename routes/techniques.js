const express = require('express');
const router = express.Router();
const { pool, safeParse } = require('../db');

async function loadTechClips(techIds) {
  if (!techIds.length) return new Map();
  const [rows] = await pool.query(`
    SELECT tc.tech_id, tc.position, vc.id, vc.title, vc.url, vc.platform, vc.description, vc.starred
    FROM technique_clips tc
    JOIN video_clips vc ON vc.id = tc.clip_id
    WHERE tc.tech_id IN (?)
    ORDER BY tc.tech_id, tc.position, tc.clip_id
  `, [techIds]);
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.tech_id)) m.set(r.tech_id, []);
    m.get(r.tech_id).push({
      id: r.id, title: r.title, url: r.url,
      platform: r.platform, description: r.description, starred: r.starred
    });
  }
  return m;
}

async function setTechniqueClips(techId, clipIds) {
  await pool.query('DELETE FROM technique_clips WHERE tech_id = ?', [techId]);
  const unique = [...new Set((clipIds || []).map(Number).filter(Boolean))];
  for (let i = 0; i < unique.length; i++) {
    await pool.query('INSERT IGNORE INTO technique_clips (tech_id, clip_id, position) VALUES (?,?,?)', [techId, unique[i], i]);
    await pool.query('INSERT IGNORE INTO clip_techniques (clip_id, tech_id) VALUES (?,?)', [unique[i], techId]);
  }
}

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM techniques ORDER BY starred DESC, name ASC');
    const clipsByTech = await loadTechClips(rows.map(r => r.id));
    rows.forEach(r => {
      r.tags  = safeParse(r.tags, []);
      r.clips = clipsByTech.get(r.id) || [];
      r.links = r.clips.map(c => ({ url: c.url, desc: c.title }));
    });
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, pos, category, tags, clip_ids, note, starred } = req.body;
    if(!name || !name.trim()) return res.status(400).json({ error: '기술명을 입력해주세요' });
    const [[dup]] = await pool.query('SELECT id FROM techniques WHERE LOWER(name)=LOWER(?) LIMIT 1', [name.trim()]);
    if(dup) return res.json({ id: dup.id, existing: true });
    const [r] = await pool.query(
      'INSERT INTO techniques (name, pos, category, tags, links, note, starred) VALUES (?,?,?,?,?,?,?)',
      [name.trim(), pos||'', category||'', JSON.stringify(tags||[]), '[]', note||'', starred?1:0]
    );
    await setTechniqueClips(r.insertId, clip_ids);
    res.json({ id: r.insertId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, pos, category, tags, clip_ids, note, starred } = req.body;
    await pool.query(
      'UPDATE techniques SET name=?, pos=?, category=?, tags=?, note=?, starred=? WHERE id=?',
      [name, pos||'', category||'', JSON.stringify(tags||[]), note||'', starred?1:0, req.params.id]
    );
    await setTechniqueClips(req.params.id, clip_ids);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM techniques WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/star', async (req, res) => {
  try {
    await pool.query('UPDATE techniques SET starred = 1 - starred WHERE id=?', [req.params.id]);
    const [[row]] = await pool.query('SELECT starred FROM techniques WHERE id=?', [req.params.id]);
    res.json({ starred: row.starred });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
