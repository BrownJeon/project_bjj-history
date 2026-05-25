const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const fs = require('fs/promises');
const { VideoClip } = require('../models');
const { wrap, safeParse } = require('../utils/respond');
const { queueThumbUpdate } = require('../services/thumbnailExtractor');
const { getFramesDir, getVideoDir } = require('../services/storage');
const { analyzeVideo } = require('../services/videoAnalysis');

const AI_URL_RE = /youtube\.com|youtu\.be|instagram\.com/;

// 클립별 분석 진행 상태 (인메모리) — { progress: 0-100 | -1(오류), stage: string }
const analyzeProgress = new Map();

function autoAnalyzeClip(clipId, url) {
  if (!url || !AI_URL_RE.test(url)) return;
  const id = String(clipId);
  analyzeProgress.set(id, { progress: 5, stage: '분석 준비 중' });

  analyzeVideo(url, clipId, (progress, stage) => {
    analyzeProgress.set(id, { progress, stage });
  })
    .then(async result => {
      const updates = {};
      if (result.savedFrames?.length) updates.frames     = JSON.stringify(result.savedFrames);
      if (result.description)         updates.description = result.description;
      if (result.savedVideo)          updates.video_file  = result.savedVideo;
      if (Object.keys(updates).length)
        await VideoClip.update(updates, { where: { id: clipId } });
      console.log(`[auto-analyze] clip ${clipId} 분석 완료 (${result.method})`);
      analyzeProgress.delete(id);
    })
    .catch(e => {
      console.error(`[auto-analyze] clip ${clipId} 실패:`, e.message);
      analyzeProgress.set(id, { progress: -1, stage: e.message });
      setTimeout(() => analyzeProgress.delete(id), 60000); // 1분 후 오류 상태 제거
    });
}

function detectPlatform(url) {
  if (!url) return 'other';
  if (url.includes('youtu')) return 'youtube';
  if (url.includes('instagram')) return 'instagram';
  return 'other';
}

function normalize(row) {
  if (!row) return row;
  let techs = [];
  try {
    const p = JSON.parse(row.tech_name);
    if (Array.isArray(p)) techs = p.filter(Boolean);
    else if (p) techs = [String(p)];
  } catch {
    if (row.tech_name) techs = [row.tech_name];
  }
  return {
    ...row,
    tech_names: techs,
    tech_name: techs[0] || '',
    tags: safeParse(row.tags, []),
    video_file: row.video_file || '',
  };
}

function techNamesToJson(tech_names, tech_name) {
  const arr = Array.isArray(tech_names)
    ? tech_names.filter(Boolean)
    : (tech_name ? [String(tech_name).trim()] : []);
  return JSON.stringify(arr);
}

router.get('/', wrap(async (_req, res) => {
  const rows = await VideoClip.findAll({
    order: [['starred', 'DESC'], ['id', 'DESC']],
    raw: true,
  });
  res.json(rows.map(normalize));
}));

router.get('/search', wrap(async (req, res) => {
  const q        = (req.query.q || '').trim();
  const techName = (req.query.tech_name || '').trim();
  const where = {};
  if (q) {
    where[Op.or] = [
      { title:     { [Op.like]: `%${q}%` } },
      { url:       { [Op.like]: `%${q}%` } },
      { tech_name: { [Op.like]: `%${q}%` } },
    ];
  }
  if (techName) where.tech_name = techName;
  const rows = await VideoClip.findAll({
    where,
    attributes: ['id', 'title', 'url', 'platform', 'tech_name', 'starred'],
    order: [['starred', 'DESC'], ['id', 'DESC']],
    limit: 10,
    raw: true,
  });
  res.json(rows);
}));

router.post('/', wrap(async (req, res) => {
  const { title, url, description, tech_name, tech_names, tags, starred } = req.body;
  const r = await VideoClip.create({
    title,
    url,
    platform: detectPlatform(url),
    description: description || '',
    tech_name: techNamesToJson(tech_names, tech_name),
    tags: JSON.stringify(tags || []),
    starred: starred ? 1 : 0,
  });
  res.json({ id: r.id });
  if (url) queueThumbUpdate(r.id, url);
  autoAnalyzeClip(r.id, url);
}));

router.put('/:id', wrap(async (req, res) => {
  const { title, url, description, tech_name, tech_names, tags, starred } = req.body;
  const old = await VideoClip.findByPk(req.params.id, { attributes: ['url'], raw: true });
  const urlChanged = old && old.url !== url;
  const data = {
    title,
    url,
    platform: detectPlatform(url),
    description: description || '',
    tech_name: techNamesToJson(tech_names, tech_name),
    tags: JSON.stringify(tags || []),
  };
  if (urlChanged) data.thumb_url = '';
  if (starred !== undefined) data.starred = starred ? 1 : 0;
  await VideoClip.update(data, { where: { id: req.params.id } });
  res.json({ ok: true });
  if (urlChanged && url) {
    queueThumbUpdate(req.params.id, url);
    autoAnalyzeClip(req.params.id, url);
  }
}));

// 수동 AI 분석 트리거 (기존 클립 재분석용)
router.post('/:id/analyze', wrap(async (req, res) => {
  const clip = await VideoClip.findByPk(req.params.id, { attributes: ['id', 'url'], raw: true });
  if (!clip) return res.status(404).json({ error: 'not found' });
  if (!clip.url || !AI_URL_RE.test(clip.url))
    return res.status(400).json({ error: 'YouTube/Instagram URL이 아닙니다' });
  res.json({ ok: true, message: '분석 시작됨 (백그라운드)' });
  autoAnalyzeClip(clip.id, clip.url);
}));

router.get('/analyze-status', wrap(async (_req, res) => {
  const status = {};
  analyzeProgress.forEach((v, k) => { status[k] = v; });
  res.json(status);
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = req.params.id;
  await VideoClip.destroy({ where: { id } });
  res.json({ ok: true });
  // 연관 파일 삭제 (캡처 프레임 + 저장 영상) — 백그라운드
  Promise.all([
    fs.rm(getFramesDir(id), { recursive: true, force: true }).catch(() => {}),
    fs.rm(getVideoDir(id),  { recursive: true, force: true }).catch(() => {}),
  ]).catch(() => {});
}));

router.patch('/:id/star', wrap(async (req, res) => {
  const c = await VideoClip.findByPk(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const next = c.starred ? 0 : 1;
  await c.update({ starred: next });
  res.json({ starred: next });
}));

router.post('/:id/refresh-thumb', wrap(async (req, res) => {
  const c = await VideoClip.findByPk(req.params.id, { attributes: ['url'], raw: true });
  if (!c) return res.status(404).json({ error: 'not found' });
  queueThumbUpdate(req.params.id, c.url);
  res.json({ ok: true, queued: true });
}));

module.exports = router;
