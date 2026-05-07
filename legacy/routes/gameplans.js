const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const [plans] = await pool.query('SELECT * FROM gameplans ORDER BY starred DESC, id DESC');
    for(const gp of plans){
      const [nodes] = await pool.query(
        `SELECT gn.*, t.name AS tech_name, t.pos AS tech_pos
         FROM gameplan_nodes gn LEFT JOIN techniques t ON gn.technique_id=t.id
         WHERE gn.gameplan_id=? ORDER BY gn.id ASC`, [gp.id]);
      const [edges] = await pool.query(
        'SELECT * FROM gameplan_edges WHERE gameplan_id=? ORDER BY id ASC', [gp.id]);
      gp.nodes = nodes; gp.edges = edges;
    }
    res.json(plans);
  } catch(e){ console.error(e); res.status(500).json({error: e.message}); }
});

router.post('/', async (req, res) => {
  try {
    const { name, startPos, endPos, note, nodes, edges } = req.body;
    const [r] = await pool.query(
      'INSERT INTO gameplans (name, start_pos, end_pos, note) VALUES (?,?,?,?)',
      [name, startPos||'', endPos||'', note||'']);
    const gpId = r.insertId;
    const nodeIdMap = {};
    for(const n of nodes||[]){
      const [nr] = await pool.query(
        'INSERT INTO gameplan_nodes (gameplan_id,technique_id,label,is_finish,note) VALUES(?,?,?,?,?)',
        [gpId, n.techniqueId||null, n.label||'', n.isFinish?1:0, n.note||'']);
      nodeIdMap[n.clientId] = nr.insertId;
    }
    for(const e of edges||[]){
      if(!nodeIdMap[e.fromClientId] || !nodeIdMap[e.toClientId]) continue;
      await pool.query(
        'INSERT INTO gameplan_edges (gameplan_id,from_node_id,to_node_id,`condition`) VALUES(?,?,?,?)',
        [gpId, nodeIdMap[e.fromClientId], nodeIdMap[e.toClientId], e.condition||'']);
    }
    res.json({ id: gpId });
  } catch(e){ console.error(e); res.status(500).json({error: e.message}); }
});

router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { name, startPos, endPos, note, nodes, edges } = req.body;
    await pool.query('UPDATE gameplans SET name=?,start_pos=?,end_pos=?,note=? WHERE id=?',
      [name, startPos||'', endPos||'', note||'', id]);
    await pool.query('DELETE FROM gameplan_edges WHERE gameplan_id=?', [id]);
    await pool.query('DELETE FROM gameplan_nodes WHERE gameplan_id=?', [id]);
    const nodeIdMap = {};
    for(const n of nodes||[]){
      const [nr] = await pool.query(
        'INSERT INTO gameplan_nodes (gameplan_id,technique_id,label,is_finish,note) VALUES(?,?,?,?,?)',
        [id, n.techniqueId||null, n.label||'', n.isFinish?1:0, n.note||'']);
      nodeIdMap[n.clientId] = nr.insertId;
    }
    for(const e of edges||[]){
      if(!nodeIdMap[e.fromClientId] || !nodeIdMap[e.toClientId]) continue;
      await pool.query(
        'INSERT INTO gameplan_edges (gameplan_id,from_node_id,to_node_id,`condition`) VALUES(?,?,?,?)',
        [id, nodeIdMap[e.fromClientId], nodeIdMap[e.toClientId], e.condition||'']);
    }
    res.json({ ok: true });
  } catch(e){ console.error(e); res.status(500).json({error: e.message}); }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM gameplan_edges WHERE gameplan_id=?', [id]);
    await pool.query('DELETE FROM gameplan_nodes WHERE gameplan_id=?', [id]);
    await pool.query('DELETE FROM gameplans WHERE id=?', [id]);
    res.json({ ok: true });
  } catch(e){ console.error(e); res.status(500).json({error: e.message}); }
});

router.patch('/:id/star', async (req, res) => {
  try {
    const id = req.params.id;
    const [[gp]] = await pool.query('SELECT starred FROM gameplans WHERE id=?', [id]);
    if(!gp) return res.status(404).json({error:'not found'});
    const next = gp.starred ? 0 : 1;
    await pool.query('UPDATE gameplans SET starred=? WHERE id=?', [next, id]);
    res.json({ starred: next });
  } catch(e){ console.error(e); res.status(500).json({error: e.message}); }
});

module.exports = router;
