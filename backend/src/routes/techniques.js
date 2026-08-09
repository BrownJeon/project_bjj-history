const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const fs = require('fs/promises');
const { Technique, VideoClip } = require('../models');
const { wrap, safeParse } = require('../utils/respond');
const { analyzeVideo } = require('../services/videoAnalysis');
const { getFramesDir, getVideoDir } = require('../services/storage');

// 기술명과 매칭되는 미분석 클립을 백그라운드에서 자동 AI 분석
async function triggerAutoAnalysis(techName, userId) {
  const { sequelize } = require('../config/db');
  // tech_name JSON 배열 안에 techName 포함된 미분석 클립 탐색
  const [clips] = await sequelize.query(
    `SELECT id, url FROM video_clips
     WHERE JSON_CONTAINS(tech_name, JSON_QUOTE(?))
       AND user_id = ?
       AND (description IS NULL OR description = '')
       AND (frames IS NULL OR frames = '[]')
     LIMIT 10`,
    { replacements: [techName, userId] }
  );

  const targets = clips.filter(c =>
    /(youtube\.com|youtu\.be|instagram\.com)/.test(c.url || '')
  );
  if (!targets.length) return;

  console.log(`[auto-analyze] 기술 "${techName}" → 미분석 클립 ${targets.length}개 자동 분석 시작`);

  for (const clip of targets) {
    analyzeVideo(clip.url, clip.id)
      .then(async result => {
        const updates = {};
        if (result.savedFrames?.length)
          updates.frames = JSON.stringify(result.savedFrames);
        if (result.description)
          updates.description = result.description;
        if (Object.keys(updates).length)
          await VideoClip.update(updates, { where: { id: clip.id } });
        console.log(`[auto-analyze] clip ${clip.id} 분석 완료 (${result.method})`);
      })
      .catch(e => console.error(`[auto-analyze] clip ${clip.id} 실패:`, e.message));
  }
}

// 기술명(name)과 일치하는 video_clips 자동 연결 — JSON_CONTAINS로 배열 검색
async function loadClipsByNames(names, userId) {
  if (!names.length) return new Map();
  const { sequelize } = require('../config/db');
  const m = new Map();
  for (const name of names) {
    const [rows] = await sequelize.query(
      `SELECT id, title, url, platform, description, starred,
              tech_name, thumb_url, video_file, frames
       FROM video_clips
       WHERE JSON_CONTAINS(tech_name, JSON_QUOTE(?))
         AND user_id = ?
       ORDER BY starred DESC, id DESC`,
      { replacements: [name, userId] }
    );
    if (rows.length) m.set(name, rows);
  }
  return m;
}

function parsePos(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.filter(Boolean);
    if (p) return [String(p)];
  } catch {
    return raw ? [raw] : [];
  }
  return [];
}

function posToJson(positions, pos) {
  const arr = Array.isArray(positions)
    ? positions.filter(Boolean)
    : (pos ? [String(pos).trim()] : []);
  return JSON.stringify(arr);
}

router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const rows = await Technique.findAll({
    where: { user_id: uid },
    order: [['starred', 'DESC'], ['name', 'ASC']],
    raw: true,
  });
  const clipsByName = await loadClipsByNames(rows.map(r => r.name), uid);
  rows.forEach(r => {
    r.positions = parsePos(r.pos);
    r.pos       = r.positions[0] || '';
    r.tags  = safeParse(r.tags, []);
    r.clips = (clipsByName.get(r.name) || []).map(c => ({
      ...c,
      tech_names: safeParse(c.tech_name, []).map(x => typeof x === 'string' ? x : x.name || ''),
      frames:     safeParse(c.frames, []),
      video_file: c.video_file || '',
    }));
    r.links = r.clips.map(c => ({ url: c.url, desc: c.title }));
  });
  res.json(rows);
}));

router.post('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const { name, pos, positions, category, tags, note, starred } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '기술명을 입력해주세요' });
  const { Op } = require('sequelize');
  const dup = await Technique.findOne({
    where: {
      user_id: uid,
      name: require('sequelize').where(
        require('sequelize').fn('LOWER', require('sequelize').col('name')),
        name.trim().toLowerCase()
      ),
    },
  });
  if (dup) return res.json({ id: dup.id, existing: true });
  const r = await Technique.create({
    name: name.trim(),
    pos: posToJson(positions, pos),
    category: category || '',
    tags: JSON.stringify(tags || []),
    links: '[]',
    note: note || '',
    starred: starred ? 1 : 0,
    user_id: uid,
  });
  res.json({ id: r.id });
  // 응답 후 백그라운드 자동 분석
  triggerAutoAnalysis(name.trim(), uid).catch(() => {});
}));

router.put('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const { name, pos, positions, category, tags, note, starred } = req.body;
  const old = await Technique.findOne({ where: { id: req.params.id, user_id: uid } });
  if (!old) return res.status(404).json({ error: 'not found' });
  await Technique.update(
    {
      name,
      pos: posToJson(positions, pos),
      category: category || '',
      tags: JSON.stringify(tags || []),
      note: note || '',
      starred: starred ? 1 : 0,
    },
    { where: { id: req.params.id, user_id: uid } }
  );
  // 기술명 변경 시 video_clips.tech_name 동기화 (해당 유저 클립만)
  if (old.name && name && old.name !== name) {
    await VideoClip.update({ tech_name: name }, { where: { tech_name: old.name, user_id: uid } });
  }
  res.json({ ok: true });
  // 응답 후 백그라운드 자동 분석 (기술명 기준)
  triggerAutoAnalysis(name.trim(), uid).catch(() => {});
}));

router.delete('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const tech = await Technique.findOne({ where: { id: req.params.id, user_id: uid }, attributes: ['name'], raw: true });
  if (!tech) return res.status(404).json({ error: 'not found' });
  await Technique.destroy({ where: { id: req.params.id, user_id: uid } });
  res.json({ ok: true });

  // 이 기술에 연결된 클립 중 이 기술만 가진 클립은 파일+DB 삭제, 다중 기술 클립은 tech_name에서만 제거
  try {
    const { sequelize } = require('../config/db');
    const [clips] = await sequelize.query(
      `SELECT id, tech_name FROM video_clips WHERE JSON_CONTAINS(tech_name, JSON_QUOTE(?)) AND user_id = ?`,
      { replacements: [tech.name, uid] }
    );
    for (const clip of clips) {
      let names = [];
      try { names = JSON.parse(clip.tech_name || '[]'); } catch { names = []; }
      if (!Array.isArray(names)) names = names ? [names] : [];
      const remaining = names.filter(n => n !== tech.name);
      if (remaining.length === 0) {
        // 이 기술만 연결 → 클립 DB + 파일 전체 삭제
        await VideoClip.destroy({ where: { id: clip.id } });
        Promise.all([
          fs.rm(getFramesDir(clip.id), { recursive: true, force: true }).catch(() => {}),
          fs.rm(getVideoDir(clip.id),  { recursive: true, force: true }).catch(() => {}),
        ]).catch(() => {});
      } else {
        // 다중 기술 → tech_name 배열에서만 제거
        await VideoClip.update(
          { tech_name: JSON.stringify(remaining) },
          { where: { id: clip.id } }
        );
      }
    }
  } catch (e) {
    console.error('[technique delete] 클립 cascade 실패:', e.message);
  }
}));

// 사용 중인 고유 포지션 목록 + 기술 수 반환
router.get('/positions', wrap(async (req, res) => {
  const uid = req.user.id;
  const rows = await Technique.findAll({ where: { user_id: uid }, attributes: ['pos'], raw: true });
  const counter = new Map();
  for (const row of rows) {
    const positions = parsePos(row.pos);
    for (const p of positions) {
      counter.set(p, (counter.get(p) || 0) + 1);
    }
  }
  const result = [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  res.json(result);
}));

// 특정 포지션 값을 모든 기술의 pos 배열에서 제거
router.delete('/positions/:name', wrap(async (req, res) => {
  const uid = req.user.id;
  const targetName = decodeURIComponent(req.params.name);
  const rows = await Technique.findAll({ where: { user_id: uid }, attributes: ['id', 'pos'], raw: true });
  let updatedCount = 0;
  for (const row of rows) {
    const positions = parsePos(row.pos);
    if (!positions.includes(targetName)) continue;
    const next = positions.filter(p => p !== targetName);
    await Technique.update({ pos: JSON.stringify(next) }, { where: { id: row.id, user_id: uid } });
    updatedCount++;
  }
  res.json({ ok: true, updatedCount });
}));

router.patch('/:id/star', wrap(async (req, res) => {
  const t = await Technique.findOne({ where: { id: req.params.id, user_id: req.user.id } });
  if (!t) return res.status(404).json({ error: 'not found' });
  const next = t.starred ? 0 : 1;
  await t.update({ starred: next });
  res.json({ starred: next });
}));

module.exports = router;
