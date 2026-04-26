const express = require('express');
const router = express.Router();
const { pool, safeParse } = require('../db');

function detectPlatform(url) {
  if (!url) return 'other';
  if (url.includes('youtu')) return 'youtube';
  if (url.includes('instagram')) return 'instagram';
  return 'other';
}

async function loadClipsWithTechs(where = '', params = []) {
  const [rows] = await pool.query(`
    SELECT vc.*
    FROM video_clips vc
    ${where}
    ORDER BY vc.starred DESC, vc.id DESC
  `, params);
  if (!rows.length) return rows;

  const ids = rows.map(r => r.id);
  const [links] = await pool.query(`
    SELECT ct.clip_id, ct.tech_id, t.name AS tech_name
    FROM clip_techniques ct
    LEFT JOIN techniques t ON t.id = ct.tech_id
    WHERE ct.clip_id IN (?)
    ORDER BY t.name ASC
  `, [ids]);

  const byClip = new Map();
  for (const l of links) {
    if (!byClip.has(l.clip_id)) byClip.set(l.clip_id, { tech_ids: [], tech_names: [] });
    byClip.get(l.clip_id).tech_ids.push(l.tech_id);
    byClip.get(l.clip_id).tech_names.push(l.tech_name);
  }

  for (const row of rows) {
    row.tags = safeParse(row.tags, []);
    const m = byClip.get(row.id);
    row.tech_ids   = m ? m.tech_ids   : [];
    row.tech_names = m ? m.tech_names : [];
    row.tech_name  = row.tech_names[0] || null;
  }
  return rows;
}

async function setClipTechs(clipId, techIds) {
  await pool.query('DELETE FROM clip_techniques WHERE clip_id = ?', [clipId]);
  const unique = [...new Set((techIds || []).map(Number).filter(Boolean))];
  for (const tid of unique) {
    await pool.query('INSERT IGNORE INTO clip_techniques (clip_id, tech_id) VALUES (?,?)', [clipId, tid]);
  }
  // 하위호환: video_clips.tech_id 는 첫 번째로 유지
  await pool.query('UPDATE video_clips SET tech_id = ? WHERE id = ?', [unique[0] || null, clipId]);
  return unique;
}

router.get('/', async (req, res) => {
  try {
    const rows = await loadClipsWithTechs();
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/search', async (req, res) => {
  try {
    const q      = (req.query.q || '').trim();
    const techId = req.query.tech_id ? parseInt(req.query.tech_id) : null;

    let where = 'WHERE 1=1';
    const params = [];
    if (q) {
      where += ' AND (vc.title LIKE ? OR vc.url LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (techId) {
      where += ' AND vc.id IN (SELECT clip_id FROM clip_techniques WHERE tech_id = ?)';
      params.push(techId);
    }

    const [rows] = await pool.query(`
      SELECT vc.id, vc.title, vc.url, vc.platform, vc.starred
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
    const { title, url, description, tech_id, tech_ids, tags, starred } = req.body;
    const platform = detectPlatform(url);
    const techIdsArr = Array.isArray(tech_ids) ? tech_ids : (tech_id ? [tech_id] : []);
    const [r] = await pool.query(
      'INSERT INTO video_clips (title, url, platform, description, tech_id, tags, starred) VALUES (?,?,?,?,?,?,?)',
      [title, url, platform, description||'', techIdsArr[0] || null, JSON.stringify(tags||[]), starred ? 1 : 0]
    );
    await setClipTechs(r.insertId, techIdsArr);
    res.json({ id: r.insertId });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, url, description, tech_id, tech_ids, tags, starred } = req.body;
    const platform = detectPlatform(url);
    const techIdsArr = Array.isArray(tech_ids) ? tech_ids : (tech_id ? [tech_id] : []);
    const params = [title, url, platform, description||'', JSON.stringify(tags||[])];
    let sql = 'UPDATE video_clips SET title=?, url=?, platform=?, description=?, tags=?';
    if (starred !== undefined) { sql += ', starred=?'; params.push(starred ? 1 : 0); }
    sql += ' WHERE id=?';
    params.push(req.params.id);
    await pool.query(sql, params);
    await setClipTechs(req.params.id, techIdsArr);
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
