const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Profile, BeltHistory, MembershipPayment } = require('../models');
const { wrap } = require('../utils/respond');

// 업로드 — 기존 public/uploads 그대로 재사용 (Phase 5에서 정리)
const uploadDir = path.join(__dirname, '../../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('이미지 파일만 업로드 가능합니다'));
    cb(null, true);
  },
});

// ─── 프로필 ───
router.get('/profile', wrap(async (_req, res) => {
  const row = await Profile.findOne({ raw: true });
  res.json(row || {});
}));

router.put('/profile', wrap(async (req, res) => {
  const { nickname, startDate, weightClass, network } = req.body;
  const row = await Profile.findOne();
  const data = {
    nickname:     nickname || '',
    start_date:   startDate || null,
    weight_class: weightClass || '',
    network:      network || '',
  };
  if (row) await row.update(data); else await Profile.create(data);
  res.json({ ok: true });
}));

router.post('/profile/avatar', upload.single('avatar'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다' });
  const avatarPath = `/uploads/${req.file.filename}`;
  const row = await Profile.findOne();
  if (row) await row.update({ avatar: avatarPath });
  else     await Profile.create({ avatar: avatarPath });
  res.json({ avatar: avatarPath });
}));

router.delete('/profile/avatar', wrap(async (_req, res) => {
  const row = await Profile.findOne();
  if (row && row.avatar) {
    const filePath = path.join(__dirname, '../../../public', row.avatar);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await row.update({ avatar: null });
  }
  res.json({ ok: true });
}));

// ─── 벨트 히스토리 ───
router.get('/belts', wrap(async (_req, res) => {
  const rows = await BeltHistory.findAll({ order: [['achieved_date', 'DESC']], raw: true });
  res.json(rows);
}));

router.post('/belts', wrap(async (req, res) => {
  const { belt, stripes, achievedDate, note } = req.body;
  const r = await BeltHistory.create({
    belt, stripes: stripes || 0, achieved_date: achievedDate, note: note || '',
  });
  res.json({ id: r.id });
}));

router.put('/belts/:id', wrap(async (req, res) => {
  const { belt, stripes, achievedDate, note } = req.body;
  await BeltHistory.update(
    { belt, stripes: stripes || 0, achieved_date: achievedDate, note: note || '' },
    { where: { id: req.params.id } }
  );
  res.json({ ok: true });
}));

router.delete('/belts/:id', wrap(async (req, res) => {
  await BeltHistory.destroy({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ─── 회원권 결제이력 ───
router.get('/memberships', wrap(async (_req, res) => {
  const rows = await MembershipPayment.findAll({
    order: [['paid_date', 'DESC']],
    raw: true,
  });
  res.json(rows);
}));

router.post('/memberships', wrap(async (req, res) => {
  const { paidDate, duration, sessionType, memo } = req.body;
  if (!paidDate || !duration || !sessionType) {
    return res.status(400).json({ error: '필수 항목 누락' });
  }
  const r = await MembershipPayment.create({
    paid_date: paidDate,
    duration,
    session_type: sessionType,
    memo: memo || '',
  });
  res.json({ id: r.id });
}));

router.delete('/memberships/:id', wrap(async (req, res) => {
  await MembershipPayment.destroy({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

module.exports = router;
