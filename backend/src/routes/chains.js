const express = require('express');
const router = express.Router();
const { sequelize, TechniqueChain, ChainStep, Technique } = require('../models');
const { wrap } = require('../utils/respond');

router.get('/', wrap(async (_req, res) => {
  const chains = await TechniqueChain.findAll({ order: [['id', 'DESC']], raw: true });
  for (const c of chains) {
    const steps = await ChainStep.findAll({
      where: { chain_id: c.id },
      order: [['step_order', 'ASC']],
      raw: true,
    });
    const techIds = [...new Set(steps.map(s => s.technique_id).filter(Boolean))];
    const techs = techIds.length
      ? await Technique.findAll({ where: { id: techIds }, attributes: ['id', 'name', 'pos'], raw: true })
      : [];
    const techMap = new Map(techs.map(t => [t.id, t]));
    c.steps = steps.map(s => ({
      ...s,
      tech_name: techMap.get(s.technique_id)?.name || null,
      tech_pos:  techMap.get(s.technique_id)?.pos  || null,
    }));
  }
  res.json(chains);
}));

router.post('/', wrap(async (req, res) => {
  const { name, note, steps } = req.body;
  const id = await sequelize.transaction(async (t) => {
    const chain = await TechniqueChain.create({ name, note: note || '' }, { transaction: t });
    for (let i = 0; i < (steps || []).length; i++) {
      const s = steps[i];
      await ChainStep.create({
        chain_id: chain.id,
        technique_id: s.techniqueId,
        step_order: i + 1,
        transition_note: s.transitionNote || '',
      }, { transaction: t });
    }
    return chain.id;
  });
  res.json({ id });
}));

router.put('/:id', wrap(async (req, res) => {
  const { name, note, steps } = req.body;
  await sequelize.transaction(async (t) => {
    await TechniqueChain.update({ name, note: note || '' }, { where: { id: req.params.id }, transaction: t });
    await ChainStep.destroy({ where: { chain_id: req.params.id }, transaction: t });
    for (let i = 0; i < (steps || []).length; i++) {
      const s = steps[i];
      await ChainStep.create({
        chain_id: req.params.id,
        technique_id: s.techniqueId,
        step_order: i + 1,
        transition_note: s.transitionNote || '',
      }, { transaction: t });
    }
  });
  res.json({ ok: true });
}));

router.delete('/:id', wrap(async (req, res) => {
  await sequelize.transaction(async (t) => {
    await ChainStep.destroy({ where: { chain_id: req.params.id }, transaction: t });
    await TechniqueChain.destroy({ where: { id: req.params.id }, transaction: t });
  });
  res.json({ ok: true });
}));

module.exports = router;
