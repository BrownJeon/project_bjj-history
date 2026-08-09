const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/db');
const PickHistory = require('../models/PickHistory');
const { wrap, ok, fail } = require('../utils/respond');

// JSON 문자열 안전 파싱 헬퍼
function safeParse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// tech_name → tech_names 배열 변환 (clips.js의 normalize 패턴 동일)
function normalizeTechNames(techName) {
  let techs = [];
  try {
    const p = JSON.parse(techName);
    if (Array.isArray(p)) techs = p.filter(Boolean);
    else if (p) techs = [String(p)];
  } catch {
    if (techName) techs = [techName];
  }
  return techs;
}

// GET /api/picks — 픽 이력 전체 조회 (날짜 DESC, 날짜별 그룹핑)
router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const [rows] = await sequelize.query(
    `SELECT ph.id, ph.clip_id, ph.pick_date, ph.created_at,
            vc.title, vc.url, vc.platform, vc.description,
            vc.tech_name, vc.thumb_url, vc.frames, vc.video_file, vc.starred
     FROM pick_history ph
     LEFT JOIN video_clips vc ON ph.clip_id = vc.id
     WHERE ph.user_id = ?
     ORDER BY ph.pick_date DESC, ph.created_at DESC`,
    { replacements: [uid] }
  );

  // 날짜별 그룹핑
  const groupMap = new Map();
  for (const row of rows) {
    const dateKey = row.pick_date
      ? (typeof row.pick_date === 'string' ? row.pick_date.slice(0, 10) : row.pick_date.toISOString().slice(0, 10))
      : 'unknown';

    const techNames = normalizeTechNames(row.tech_name);

    const pick = {
      id:         row.id,
      clip_id:    row.clip_id,
      pick_date:  dateKey,
      created_at: row.created_at,
      clip: {
        id:          row.clip_id,
        title:       row.title       || '',
        url:         row.url         || '',
        platform:    row.platform    || 'other',
        description: row.description || '',
        tech_names:  techNames,
        thumb_url:   row.thumb_url   || '',
        frames:      safeParse(row.frames, []),
        video_file:  row.video_file  || '',
        starred:     row.starred     || 0,
      },
    };

    if (!groupMap.has(dateKey)) groupMap.set(dateKey, []);
    groupMap.get(dateKey).push(pick);
  }

  const grouped = Array.from(groupMap.entries()).map(([date, picks]) => ({ date, picks }));
  return ok(res, grouped);
}));

// POST /api/picks — 픽 저장
router.post('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const { clip_id, pick_date } = req.body;
  if (!clip_id || !pick_date) {
    return fail(res, 400, 'clip_id와 pick_date는 필수입니다');
  }
  const created = await PickHistory.create({ clip_id, pick_date, user_id: uid });
  return res.status(201).json({ success: true, data: created, message: '' });
}));

// DELETE /api/picks/:id — 픽 개별 삭제
router.delete('/:id', wrap(async (req, res) => {
  const { id } = req.params;
  const uid = req.user.id;
  const existing = await PickHistory.findOne({ where: { id, user_id: uid } });
  if (!existing) return fail(res, 404, '픽을 찾을 수 없습니다');
  await PickHistory.destroy({ where: { id, user_id: uid } });
  return ok(res, { id: Number(id) });
}));

module.exports = router;
