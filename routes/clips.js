const express = require('express');
const router = express.Router();
const { pool, safeParse } = require('../db');

function detectPlatform(url) {
  if (!url) return 'other';
  if (url.includes('youtu')) return 'youtube';
  if (url.includes('instagram')) return 'instagram';
  return 'other';
}

async function loadClips(where = '', params = []) {
  const [rows] = await pool.query(`
    SELECT vc.*
    FROM video_clips vc
    ${where}
    ORDER BY vc.starred DESC, vc.id DESC
  `, params);
  for (const row of rows) {
    row.tags = safeParse(row.tags, []);
    row.tech_name = row.tech_name || '';
  }
  return rows;
}

router.get('/', async (req, res) => {
  try {
    const rows = await loadClips();
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/search', async (req, res) => {
  try {
    const q        = (req.query.q || '').trim();
    const techName = (req.query.tech_name || '').trim();

    let where = 'WHERE 1=1';
    const params = [];
    if (q) {
      where += ' AND (vc.title LIKE ? OR vc.url LIKE ? OR vc.tech_name LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (techName) {
      where += ' AND vc.tech_name = ?';
      params.push(techName);
    }

    const [rows] = await pool.query(`
      SELECT vc.id, vc.title, vc.url, vc.platform, vc.tech_name, vc.starred
      FROM video_clips vc
      ${where}
      ORDER BY vc.starred DESC, vc.id DESC
      LIMIT 10
    `, params);
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { title, url, description, tech_name, tags, starred } = req.body;
    const platform = detectPlatform(url);
    const techNameStr = (tech_name || '').trim();
    const [r] = await pool.query(
      'INSERT INTO video_clips (title, url, platform, description, tech_name, tags, starred) VALUES (?,?,?,?,?,?,?)',
      [title, url, platform, description||'', techNameStr, JSON.stringify(tags||[]), starred ? 1 : 0]
    );
    res.json({ id: r.insertId });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, url, description, tech_name, tags, starred } = req.body;
    const platform = detectPlatform(url);
    const techNameStr = (tech_name || '').trim();
    const params = [title, url, platform, description||'', techNameStr, JSON.stringify(tags||[])];
    let sql = 'UPDATE video_clips SET title=?, url=?, platform=?, description=?, tech_name=?, tags=?';
    if (starred !== undefined) { sql += ', starred=?'; params.push(starred ? 1 : 0); }
    sql += ' WHERE id=?';
    params.push(req.params.id);
    await pool.query(sql, params);
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM video_clips WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.patch('/:id/star', async (req, res) => {
  try {
    const [[clip]] = await pool.query('SELECT starred FROM video_clips WHERE id=?', [req.params.id]);
    if (!clip) return res.status(404).json({ error: 'not found' });
    const next = clip.starred ? 0 : 1;
    await pool.query('UPDATE video_clips SET starred=? WHERE id=?', [next, req.params.id]);
    res.json({ starred: next });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
