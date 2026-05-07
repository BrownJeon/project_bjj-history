const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('이미지 파일만 업로드 가능합니다'));
    cb(null, true);
  }
});

/* ── 프로필 ── */
router.post('/profile/avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다' });
    const avatarPath = `/uploads/${req.file.filename}`;
    const [[row]] = await pool.query('SELECT id FROM profile LIMIT 1');
    if (row) {
      await pool.query('UPDATE profile SET avatar=? WHERE id=?', [avatarPath, row.id]);
    } else {
      await pool.query('INSERT INTO profile (avatar) VALUES (?)', [avatarPath]);
    }
    res.json({ avatar: avatarPath });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/profile/avatar', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT id, avatar FROM profile LIMIT 1');
    if (row && row.avatar) {
      const filePath = path.join(__dirname, '../public', row.avatar);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await pool.query('UPDATE profile SET avatar=NULL WHERE id=?', [row.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/profile', async (_req, res) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM profile LIMIT 1');
    res.json(row || {});
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const { nickname, startDate, weightClass, network } = req.body;
    const [[row]] = await pool.query('SELECT id FROM profile LIMIT 1');
    if (row) {
      await pool.query(
        'UPDATE profile SET nickname=?,start_date=?,weight_class=?,network=? WHERE id=?',
        [nickname||'', startDate||null, weightClass||'', network||'', row.id]
      );
    } else {
      await pool.query(
        'INSERT INTO profile (nickname,start_date,weight_class,network) VALUES (?,?,?,?)',
        [nickname||'', startDate||null, weightClass||'', network||'']
      );
    }
    res.json({ ok: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/* ── 벨트 히스토리 ── */
router.get('/belts', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM belt_history ORDER BY achieved_date DESC');
    res.json(rows);
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/belts', async (req, res) => {
  try {
    const { belt, stripes, achievedDate, note } = req.body;
    const [r] = await pool.query(
      'INSERT INTO belt_history (belt,stripes,achieved_date,note) VALUES (?,?,?,?)',
      [belt, stripes||0, achievedDate, note||'']
    );
    res.json({ id: r.insertId });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/belts/:id', async (req, res) => {
  try {
    const { belt, stripes, achievedDate, note } = req.body;
    await pool.query(
      'UPDATE belt_history SET belt=?,stripes=?,achieved_date=?,note=? WHERE id=?',
      [belt, stripes||0, achievedDate, note||'', req.params.id]
    );
    res.json({ ok: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/belts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM belt_history WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
