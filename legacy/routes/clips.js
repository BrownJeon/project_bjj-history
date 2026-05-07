const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { pool, safeParse } = require('../db');

function detectPlatform(url) {
  if (!url) return 'other';
  if (url.includes('youtu')) return 'youtube';
  if (url.includes('instagram')) return 'instagram';
  return 'other';
}

// yt-dlp 로 썸네일 URL 한 줄 추출 (timeout 15s, 실패 시 '')
function extractThumbUrl(url) {
  return new Promise(resolve => {
    const proc = spawn('yt-dlp', ['--get-thumbnail', '--no-warnings', url], { timeout: 15000 });
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('error', () => resolve(''));
    proc.on('close', () => resolve(out.trim().split('\n')[0] || ''));
  });
}

// 직렬화 큐 — 동시에 여러 yt-dlp 실행 시 부하 방지
let thumbQueue = Promise.resolve();
function queueThumbUpdate(clipId, url) {
  thumbQueue = thumbQueue.then(async () => {
    try {
      const t = await extractThumbUrl(url);
      if (t) await pool.query('UPDATE video_clips SET thumb_url=? WHERE id=?', [t, clipId]);
    } catch (e) {
      console.error('[clips/thumb]', clipId, e.message);
    }
  });
}

// 시작 시 빈 썸네일 백필 (1회)
async function backfillThumbs() {
  try {
    const [rows] = await pool.query(
      "SELECT id, url FROM video_clips WHERE (thumb_url IS NULL OR thumb_url='') AND url IS NOT NULL AND url<>'' "
    );
    if (rows.length) {
      console.log(`[clips/backfill] ${rows.length}개 영상 썸네일 추출 시작`);
      rows.forEach(r => queueThumbUpdate(r.id, r.url));
    }
  } catch (e) {
    console.error('[clips/backfill]', e.message);
  }
}
setTimeout(backfillThumbs, 5000); // 서버 기동 5초 후 시작

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
    // 응답 후 비동기로 썸네일 추출
    if (url) queueThumbUpdate(r.insertId, url);
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, url, description, tech_name, tags, starred } = req.body;
    const platform = detectPlatform(url);
    const techNameStr = (tech_name || '').trim();
    // URL 변경 시 기존 썸네일 무효화
    const [[old]] = await pool.query('SELECT url FROM video_clips WHERE id=?', [req.params.id]);
    const urlChanged = old && old.url !== url;
    const params = [title, url, platform, description||'', techNameStr, JSON.stringify(tags||[])];
    let sql = 'UPDATE video_clips SET title=?, url=?, platform=?, description=?, tech_name=?, tags=?';
    if (urlChanged) sql += ", thumb_url=''";
    if (starred !== undefined) { sql += ', starred=?'; params.push(starred ? 1 : 0); }
    sql += ' WHERE id=?';
    params.push(req.params.id);
    await pool.query(sql, params);
    res.json({ ok: true });
    if (urlChanged && url) queueThumbUpdate(req.params.id, url);
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/:id/refresh-thumb', async (req, res) => {
  try {
    const [[c]] = await pool.query('SELECT url FROM video_clips WHERE id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'not found' });
    queueThumbUpdate(req.params.id, c.url);
    res.json({ ok: true, queued: true });
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
