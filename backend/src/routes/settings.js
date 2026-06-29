const express = require('express');
const router  = express.Router();
const fs      = require('fs/promises');
const fsSync  = require('fs');
const path    = require('path');
const multer  = require('multer');
const { wrap } = require('../utils/respond');
const { getUploadRoot } = require('../services/storage');
const { INSTAGRAM_COOKIE_PATH, hasCookieFile, hasChromeSession } = require('../services/videoAnalysis');

const cookieUpload = multer({
  dest: '/tmp/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.txt$/i.test(file.originalname) || file.mimetype === 'text/plain';
    cb(null, ok);
  },
});

router.get('/', wrap(async (_req, res) => {
  res.json({ uploadPath: getUploadRoot() });
}));

// Instagram 쿠키 상태 조회 (mode: 'file' | 'browser' | 'none')
router.get('/instagram-cookie', wrap(async (_req, res) => {
  if (hasCookieFile()) {
    const stat = await fs.stat(INSTAGRAM_COOKIE_PATH);
    return res.json({ configured: true, mode: 'file', updatedAt: stat.mtime });
  }
  if (hasChromeSession()) {
    return res.json({ configured: true, mode: 'browser', updatedAt: null });
  }
  res.json({ configured: false, mode: 'none', updatedAt: null });
}));

// Instagram 쿠키 파일 업로드
router.post('/instagram-cookie', cookieUpload.single('cookie'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '쿠키 파일이 없습니다 (.txt 파일)' });
  try {
    const dir = path.dirname(INSTAGRAM_COOKIE_PATH);
    fsSync.mkdirSync(dir, { recursive: true });
    await fs.copyFile(req.file.path, INSTAGRAM_COOKIE_PATH);
    await fs.unlink(req.file.path).catch(() => {});
    res.json({ ok: true, message: 'Instagram 쿠키가 저장되었습니다' });
  } catch (e) {
    await fs.unlink(req.file.path).catch(() => {});
    throw e;
  }
}));

// Instagram 쿠키 삭제
router.delete('/instagram-cookie', wrap(async (_req, res) => {
  try {
    await fs.unlink(INSTAGRAM_COOKIE_PATH);
    res.json({ ok: true, message: '쿠키가 삭제되었습니다' });
  } catch {
    res.json({ ok: true, message: '쿠키 파일이 없습니다' });
  }
}));

module.exports = router;
