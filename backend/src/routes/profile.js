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
    cb(null, `avatar_${req.user?.id || 'anon'}${ext}`);
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

// ─── 소속(networks) JSON 헬퍼 — techniques.js의 parsePos/posToJson과 동일 패턴 ───
// 공백 제거 + 빈 값 제거 + 중복 제거
function cleanNetworks(list) {
  const out = [];
  for (const n of (Array.isArray(list) ? list : [])) {
    const v = String(n ?? '').trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function parseNetworks(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return cleanNetworks(p);
    return p ? cleanNetworks([p]) : [];
  } catch {
    return cleanNetworks([raw]);   // 손상 JSON·레거시 단일 문자열 흡수
  }
}

function networksToJson(networks, network) {
  const list = Array.isArray(networks)
    ? networks
    : (networks ? [networks] : (network ? [network] : []));
  return JSON.stringify(cleanNetworks(list));
}

// profile row에서 소속 배열 추출 — networks 우선, 없으면 레거시 network 흡수
function rowNetworks(row) {
  const list = parseNetworks(row?.networks);
  if (list.length) return list;
  return cleanNetworks([row?.network]);
}

// ─── 프로필 ───
router.get('/profile', wrap(async (req, res) => {
  const uid = req.user.id;
  const row = await Profile.findOne({ where: { user_id: uid }, raw: true });
  if (!row) return res.json({});
  row.networks = rowNetworks(row);
  row.network  = row.networks[0] || '';   // 하위호환 — 첫 번째 소속
  res.json(row);
}));

router.put('/profile', wrap(async (req, res) => {
  const uid = req.user.id;
  const { nickname, startDate, weightClass, network, networks } = req.body;
  const row = await Profile.findOne({ where: { user_id: uid } });
  // networks/network 둘 다 안 온 경우엔 기존 소속 유지 (레거시 클라이언트 보호)
  const nextNetworks = (networks !== undefined || network !== undefined)
    ? parseNetworks(networksToJson(networks, network))
    : rowNetworks(row);
  const data = {
    nickname:     nickname || '',
    start_date:   startDate || null,
    weight_class: weightClass || '',
    networks:     JSON.stringify(nextNetworks),
    network:      (nextNetworks[0] || '').slice(0, 100),   // 레거시 컬럼 동기화(STRING(100))
  };
  if (row) await row.update(data); else await Profile.create({ ...data, user_id: uid });
  res.json({ ok: true });
}));

router.post('/profile/avatar', upload.single('avatar'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다' });
  const uid = req.user.id;
  const avatarPath = `/uploads/${req.file.filename}`;
  const row = await Profile.findOne({ where: { user_id: uid } });
  if (row) await row.update({ avatar: avatarPath });
  else     await Profile.create({ avatar: avatarPath, user_id: uid });
  res.json({ avatar: avatarPath });
}));

router.delete('/profile/avatar', wrap(async (req, res) => {
  const uid = req.user.id;
  const row = await Profile.findOne({ where: { user_id: uid } });
  if (row && row.avatar) {
    const filePath = path.join(__dirname, '../../../public', row.avatar);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await row.update({ avatar: null });
  }
  res.json({ ok: true });
}));

// ─── 벨트 히스토리 ───
router.get('/belts', wrap(async (req, res) => {
  const uid = req.user.id;
  const rows = await BeltHistory.findAll({ where: { user_id: uid }, order: [['achieved_date', 'DESC']], raw: true });
  res.json(rows);
}));

router.post('/belts', wrap(async (req, res) => {
  const uid = req.user.id;
  const { belt, stripes, achievedDate, note } = req.body;
  const r = await BeltHistory.create({
    belt, stripes: stripes || 0, achieved_date: achievedDate, note: note || '', user_id: uid,
  });
  res.json({ id: r.id });
}));

router.put('/belts/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const { belt, stripes, achievedDate, note } = req.body;
  await BeltHistory.update(
    { belt, stripes: stripes || 0, achieved_date: achievedDate, note: note || '' },
    { where: { id: req.params.id, user_id: uid } }
  );
  res.json({ ok: true });
}));

router.delete('/belts/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  await BeltHistory.destroy({ where: { id: req.params.id, user_id: uid } });
  res.json({ ok: true });
}));

// ─── 회원권 결제이력 ───
router.get('/memberships', wrap(async (req, res) => {
  const uid = req.user.id;
  const rows = await MembershipPayment.findAll({
    where: { user_id: uid },
    order: [['paid_date', 'DESC']],
    raw: true,
  });
  res.json(rows);
}));

router.post('/memberships', wrap(async (req, res) => {
  const uid = req.user.id;
  const { paidDate, duration, sessionType, memo } = req.body;
  if (!paidDate || !duration || !sessionType) {
    return res.status(400).json({ error: '필수 항목 누락' });
  }
  const r = await MembershipPayment.create({
    paid_date: paidDate,
    duration,
    session_type: sessionType,
    memo: memo || '',
    user_id: uid,
  });
  res.json({ id: r.id });
}));

router.delete('/memberships/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  await MembershipPayment.destroy({ where: { id: req.params.id, user_id: uid } });
  res.json({ ok: true });
}));

module.exports = router;
