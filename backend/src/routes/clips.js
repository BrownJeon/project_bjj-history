const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { VideoClip } = require('../models');
const { wrap, safeParse } = require('../utils/respond');
const { queueThumbUpdate } = require('../services/thumbnailExtractor');

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
  if (urlChanged && url) queueThumbUpdate(req.params.id, url);
}));

router.delete('/:id', wrap(async (req, res) => {
  await VideoClip.destroy({ where: { id: req.params.id } });
  res.json({ ok: true });
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
