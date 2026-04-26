const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (_req, res) => {
  try {
    const [chains] = await pool.query('SELECT * FROM technique_chains ORDER BY id DESC');
    for (const c of chains) {
      const [steps] = await pool.query(
        `SELECT cs.*, t.name AS tech_name, t.pos AS tech_pos
         FROM chain_steps cs LEFT JOIN techniques t ON cs.technique_id = t.id
         WHERE cs.chain_id=? ORDER BY cs.step_order ASC`,
        [c.id]
      );
      c.steps = steps;
    }
    res.json(chains);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, note, steps } = req.body;
    const [r] = await pool.query('INSERT INTO technique_chains (name, note) VALUES (?,?)', [name, note||'']);
    const chainId = r.insertId;
    for (let i = 0; i < (steps||[]).length; i++) {
      const s = steps[i];
      await pool.query(
        'INSERT INTO chain_steps (chain_id, technique_id, step_order, transition_note) VALUES (?,?,?,?)',
        [chainId, s.techniqueId, i+1, s.transitionNote||'']
      );
    }
    res.json({ id: chainId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, note, steps } = req.body;
    await pool.query('UPDATE technique_chains SET name=?, note=? WHERE id=?', [name, note||'', req.params.id]);
    await pool.query('DELETE FROM chain_steps WHERE chain_id=?', [req.params.id]);
    for (let i = 0; i < (steps||[]).length; i++) {
      const s = steps[i];
      await pool.query(
        'INSERT INTO chain_steps (chain_id, technique_id, step_order, transition_note) VALUES (?,?,?,?)',
        [req.params.id, s.techniqueId, i+1, s.transitionNote||'']
      );
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM technique_chains WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
