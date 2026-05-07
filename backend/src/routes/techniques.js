const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Technique, VideoClip } = require('../models');
const { wrap, safeParse } = require('../utils/respond');

// 기술명(name)과 일치하는 video_clips 자동 연결
async function loadClipsByNames(names) {
  if (!names.length) return new Map();
  const rows = await VideoClip.findAll({
    where: { tech_name: { [Op.in]: names } },
    attributes: ['id', 'title', 'url', 'platform', 'description', 'starred', 'tech_name'],
    order: [['starred', 'DESC'], ['id', 'DESC']],
    raw: true,
  });
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.tech_name)) m.set(r.tech_name, []);
    m.get(r.tech_name).push(r);
  }
  return m;
}

router.get('/', wrap(async (_req, res) => {
  const rows = await Technique.findAll({
    order: [['starred', 'DESC'], ['name', 'ASC']],
    raw: true,
  });
  const clipsByName = await loadClipsByNames(rows.map(r => r.name));
  rows.forEach(r => {
    r.tags  = safeParse(r.tags, []);
    r.clips = clipsByName.get(r.name) || [];
    r.links = r.clips.map(c => ({ url: c.url, desc: c.title }));
  });
  res.json(rows);
}));

router.post('/', wrap(async (req, res) => {
  const { name, pos, category, tags, note, starred } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '기술명을 입력해주세요' });
  const dup = await Technique.findOne({
    where: require('sequelize').where(
      require('sequelize').fn('LOWER', require('sequelize').col('name')),
      name.trim().toLowerCase()
    ),
  });
  if (dup) return res.json({ id: dup.id, existing: true });
  const r = await Technique.create({
    name: name.trim(),
    pos: pos || '',
    category: category || '',
    tags: JSON.stringify(tags || []),
    links: '[]',
    note: note || '',
    starred: starred ? 1 : 0,
  });
  res.json({ id: r.id });
}));

router.put('/:id', wrap(async (req, res) => {
  const { name, pos, category, tags, note, starred } = req.body;
  const old = await Technique.findByPk(req.params.id);
  await Technique.update(
    {
      name,
      pos: pos || '',
      category: category || '',
      tags: JSON.stringify(tags || []),
      note: note || '',
      starred: starred ? 1 : 0,
    },
    { where: { id: req.params.id } }
  );
  // 기술명 변경 시 video_clips.tech_name 동기화
  if (old && old.name && name && old.name !== name) {
    await VideoClip.update({ tech_name: name }, { where: { tech_name: old.name } });
  }
  res.json({ ok: true });
}));

router.delete('/:id', wrap(async (req, res) => {
  await Technique.destroy({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

router.patch('/:id/star', wrap(async (req, res) => {
  const t = await Technique.findByPk(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  const next = t.starred ? 0 : 1;
  await t.update({ starred: next });
  res.json({ starred: next });
}));

module.exports = router;
