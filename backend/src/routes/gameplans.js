const express = require('express');
const router = express.Router();
const { sequelize, Gameplan, GameplanNode, GameplanEdge, Technique } = require('../models');
const { wrap } = require('../utils/respond');

router.get('/', wrap(async (_req, res) => {
  const plans = await Gameplan.findAll({
    order: [['starred', 'DESC'], ['id', 'DESC']],
    raw: true,
  });
  for (const gp of plans) {
    const nodes = await GameplanNode.findAll({
      where: { gameplan_id: gp.id },
      order: [['id', 'ASC']],
      raw: true,
    });
    const edges = await GameplanEdge.findAll({
      where: { gameplan_id: gp.id },
      order: [['id', 'ASC']],
      raw: true,
    });
    const techIds = [...new Set(nodes.map(n => n.technique_id).filter(Boolean))];
    const techs = techIds.length
      ? await Technique.findAll({ where: { id: techIds }, attributes: ['id', 'name', 'pos'], raw: true })
      : [];
    const techMap = new Map(techs.map(t => [t.id, t]));
    gp.nodes = nodes.map(n => ({
      ...n,
      tech_name: techMap.get(n.technique_id)?.name || null,
      tech_pos:  techMap.get(n.technique_id)?.pos  || null,
    }));
    gp.edges = edges;
  }
  res.json(plans);
}));

router.post('/', wrap(async (req, res) => {
  const { name, startPos, endPos, note, nodes, edges } = req.body;
  const id = await sequelize.transaction(async (t) => {
    const gp = await Gameplan.create(
      { name, start_pos: startPos || '', end_pos: endPos || '', note: note || '' },
      { transaction: t }
    );
    const nodeIdMap = {};
    for (const n of nodes || []) {
      const created = await GameplanNode.create({
        gameplan_id: gp.id,
        technique_id: n.techniqueId || null,
        label: n.label || '',
        is_finish: n.isFinish ? 1 : 0,
        note: n.note || '',
      }, { transaction: t });
      nodeIdMap[n.clientId] = created.id;
    }
    for (const e of edges || []) {
      if (!nodeIdMap[e.fromClientId] || !nodeIdMap[e.toClientId]) continue;
      await GameplanEdge.create({
        gameplan_id: gp.id,
        from_node_id: nodeIdMap[e.fromClientId],
        to_node_id: nodeIdMap[e.toClientId],
        condition: e.condition || '',
      }, { transaction: t });
    }
    return gp.id;
  });
  res.json({ id });
}));

router.put('/:id', wrap(async (req, res) => {
  const id = req.params.id;
  const { name, startPos, endPos, note, nodes, edges } = req.body;
  await sequelize.transaction(async (t) => {
    await Gameplan.update(
      { name, start_pos: startPos || '', end_pos: endPos || '', note: note || '' },
      { where: { id }, transaction: t }
    );
    await GameplanEdge.destroy({ where: { gameplan_id: id }, transaction: t });
    await GameplanNode.destroy({ where: { gameplan_id: id }, transaction: t });
    const nodeIdMap = {};
    for (const n of nodes || []) {
      const created = await GameplanNode.create({
        gameplan_id: id,
        technique_id: n.techniqueId || null,
        label: n.label || '',
        is_finish: n.isFinish ? 1 : 0,
        note: n.note || '',
      }, { transaction: t });
      nodeIdMap[n.clientId] = created.id;
    }
    for (const e of edges || []) {
      if (!nodeIdMap[e.fromClientId] || !nodeIdMap[e.toClientId]) continue;
      await GameplanEdge.create({
        gameplan_id: id,
        from_node_id: nodeIdMap[e.fromClientId],
        to_node_id: nodeIdMap[e.toClientId],
        condition: e.condition || '',
      }, { transaction: t });
    }
  });
  res.json({ ok: true });
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = req.params.id;
  await sequelize.transaction(async (t) => {
    await GameplanEdge.destroy({ where: { gameplan_id: id }, transaction: t });
    await GameplanNode.destroy({ where: { gameplan_id: id }, transaction: t });
    await Gameplan.destroy({ where: { id }, transaction: t });
  });
  res.json({ ok: true });
}));

router.patch('/:id/star', wrap(async (req, res) => {
  const gp = await Gameplan.findByPk(req.params.id);
  if (!gp) return res.status(404).json({ error: 'not found' });
  const next = gp.starred ? 0 : 1;
  await gp.update({ starred: next });
  res.json({ starred: next });
}));

module.exports = router;
