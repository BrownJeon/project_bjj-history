const express = require('express');
const router = express.Router();
const { pool, safeParse } = require('../db');

// 기술명(techniques.name)과 일치하는 video_clips를 자동 연결
async function loadTechClipsByNames(techNames) {
  if (!techNames.length) return new Map();
  const [rows] = await pool.query(`
    SELECT id, title, url, platform, description, starred, tech_name
    FROM video_clips
    WHERE tech_name IN (?)
    ORDER BY starred DESC, id DESC
  `, [techNames]);
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.tech_name)) m.set(r.tech_name, []);
    m.get(r.tech_name).push({
      id: r.id, title: r.title, url: r.url,
      platform: r.platform, description: r.description, starred: r.starred
    });
  }
  return m;
}

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM techniques ORDER BY starred DESC, name ASC');
    const clipsByName = await loadTechClipsByNames(rows.map(r => r.name));
    rows.forEach(r => {
      r.tags  = safeParse(r.tags, []);
      r.clips = clipsByName.get(r.name) || [];
      r.links = r.clips.map(c => ({ url: c.url, desc: c.title }));
    });
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, pos, category, tags, note, starred } = req.body;
    if(!name || !name.trim()) return res.status(400).json({ error: '기술명을 입력해주세요' });
    const [[dup]] = await pool.query('SELECT id FROM techniques WHERE LOWER(name)=LOWER(?) LIMIT 1', [name.trim()]);
    if(dup) return res.json({ id: dup.id, existing: true });
    const [r] = await pool.query(
      'INSERT INTO techniques (name, pos, category, tags, links, note, starred) VALUES (?,?,?,?,?,?,?)',
      [name.trim(), pos||'', category||'', JSON.stringify(tags||[]), '[]', note||'', starred?1:0]
    );
    res.json({ id: r.insertId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, pos, category, tags, note, starred } = req.body;
    // 기술명 변경 시 기존 video_clips.tech_name 도 동기화 (자동 연결 유지)
    const [[old]] = await pool.query('SELECT name FROM techniques WHERE id=?', [req.params.id]);
    await pool.query(
      'UPDATE techniques SET name=?, pos=?, category=?, tags=?, note=?, starred=? WHERE id=?',
      [name, pos||'', category||'', JSON.stringify(tags||[]), note||'', starred?1:0, req.params.id]
    );
    if (old && old.name && name && old.name !== name) {
      await pool.query('UPDATE video_clips SET tech_name=? WHERE tech_name=?', [name, old.name]);
    }
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
