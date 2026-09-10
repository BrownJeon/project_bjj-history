const express = require('express');
const router  = express.Router();
const fs      = require('fs/promises');
const fsSync  = require('fs');
const path    = require('path');
const multer  = require('multer');
const { wrap } = require('../utils/respond');
const { getUploadRoot } = require('../services/storage');
const { INSTAGRAM_COOKIE_PATH, hasCookieFile, hasFirefoxSession,
        inspectInstagramCookie, instagramAuthHint } = require('../services/videoAnalysis');

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
    // 🔴 파일이 있다고 "인증됨"이 아니다 — sessionid 가 없거나 만료면 실제로는 로그아웃 상태다.
    //    (2026-09-10: 이 구분이 없어 화면은 "인증됨"인데 분석은 계속 실패했다.)
    const sess = inspectInstagramCookie();
    return res.json({
      configured: true, mode: 'file', updatedAt: stat.mtime,
      sessionValid: sess.ok,
      sessionReason: sess.reason,
      sessionExpiresAt: sess.expiresAt,
      hint: sess.ok ? null : instagramAuthHint(),
    });
  }
  if (hasFirefoxSession()) {
    return res.json({ configured: true, mode: 'browser', updatedAt: null, sessionValid: true, sessionReason: 'browser', sessionExpiresAt: null, hint: null });
  }
  res.json({ configured: false, mode: 'none', updatedAt: null, sessionValid: false, sessionReason: 'none', sessionExpiresAt: null, hint: instagramAuthHint() });
}));

// Instagram 쿠키 파일 업로드
router.post('/instagram-cookie', cookieUpload.single('cookie'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '쿠키 파일이 없습니다 (.txt 파일)' });
  // 저장 전에 로그인 세션이 실제로 들어있는지 확인한다. 세션 없는 파일을 그대로 받으면
  // 화면에는 "✓ 파일 인증"이 뜨는데 분석은 계속 실패해, 원인을 찾기가 매우 어려워진다.
  const check = inspectInstagramCookie(req.file.path);
  if (!check.ok) {
    await fs.unlink(req.file.path).catch(() => {});
    const why = check.reason === 'expired'
      ? `쿠키의 로그인 세션이 이미 만료되었습니다(${check.expiresAt.toLocaleDateString('ko-KR')}).`
      : '이 파일에는 Instagram 로그인 세션(sessionid)이 없습니다 — 로그아웃 상태에서 내보낸 파일입니다.';
    return res.status(400).json({
      error: `${why} Instagram에 로그인한 브라우저에서 쿠키를 다시 내보내 올려주세요.`,
      sessionReason: check.reason,
    });
  }
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
