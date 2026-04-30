const express = require('express');
const docker = require('../docker/client');
const pool = require('../db/pool');
const logActivity = require('../db/logActivity');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/networking/namespaces
router.get('/namespaces', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM namespaces WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list namespaces' });
  }
});

// POST /api/networking/namespaces
router.post('/namespaces', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    let networkId = null;
    try {
      const network = await docker.createNetwork({
        Name: `mycloud_ns_${req.user.id.slice(0, 8)}_${name}`,
        Driver: 'bridge',
        Labels: { 'mycloud.managed': 'true', 'mycloud.namespace': name },
      });
      networkId = network.id;
    } catch (e) {
      console.warn('Docker network creation failed (Docker may not be available):', e.message);
    }

    const result = await pool.query(
      `INSERT INTO namespaces (user_id, name, docker_network_id) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, name, networkId]
    );
    const ns = result.rows[0];
    await logActivity(req.user.id, 'networking', `Namespace created: ${name}`, ns.id, { networkId });
    res.status(201).json(ns);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Namespace name already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create namespace' });
  }
});

// GET /api/networking/namespaces/:id
router.get('/namespaces/:id', async (req, res) => {
  try {
    const nsResult = await pool.query('SELECT * FROM namespaces WHERE id = $1', [req.params.id]);
    const ns = nsResult.rows[0];
    if (!ns) return res.status(404).json({ error: 'Namespace not found' });
    if (ns.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [instances, databases, rules] = await Promise.all([
      pool.query('SELECT id, name, status FROM instances WHERE namespace_id = $1', [ns.id]),
      pool.query('SELECT id, name, engine, status FROM managed_databases WHERE namespace_id = $1', [ns.id]),
      pool.query('SELECT * FROM firewall_rules WHERE namespace_id = $1 ORDER BY created_at', [ns.id]),
    ]);

    res.json({ ...ns, instances: instances.rows, databases: databases.rows, rules: rules.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch namespace' });
  }
});

// DELETE /api/networking/namespaces/:id
router.delete('/namespaces/:id', async (req, res) => {
  try {
    const nsResult = await pool.query('SELECT * FROM namespaces WHERE id = $1', [req.params.id]);
    const ns = nsResult.rows[0];
    if (!ns) return res.status(404).json({ error: 'Namespace not found' });
    if (ns.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (ns.docker_network_id) {
      try {
        const network = docker.getNetwork(ns.docker_network_id);
        await network.remove();
      } catch (e) {
        console.warn('Docker network removal failed:', e.message);
      }
    }

    await pool.query('DELETE FROM namespaces WHERE id = $1', [ns.id]);
    await logActivity(req.user.id, 'networking', `Namespace deleted: ${ns.name}`, ns.id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete namespace' });
  }
});

// GET /api/networking/namespaces/:id/rules
router.get('/namespaces/:id/rules', async (req, res) => {
  try {
    const nsResult = await pool.query('SELECT * FROM namespaces WHERE id = $1', [req.params.id]);
    const ns = nsResult.rows[0];
    if (!ns) return res.status(404).json({ error: 'Namespace not found' });
    if (ns.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rules = await pool.query(
      'SELECT * FROM firewall_rules WHERE namespace_id = $1 ORDER BY created_at',
      [ns.id]
    );
    res.json(rules.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list rules' });
  }
});

// POST /api/networking/namespaces/:id/rules
router.post('/namespaces/:id/rules', async (req, res) => {
  const { direction, port, protocol = 'tcp', action } = req.body;
  if (!direction || !port || !action) {
    return res.status(400).json({ error: 'direction, port, and action are required' });
  }
  if (!['inbound', 'outbound'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be inbound or outbound' });
  }
  if (!['allow', 'block'].includes(action)) {
    return res.status(400).json({ error: 'action must be allow or block' });
  }

  try {
    const nsResult = await pool.query('SELECT * FROM namespaces WHERE id = $1', [req.params.id]);
    const ns = nsResult.rows[0];
    if (!ns) return res.status(404).json({ error: 'Namespace not found' });
    if (ns.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query(
      `INSERT INTO firewall_rules (namespace_id, direction, port, protocol, action) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ns.id, direction, parseInt(port), protocol, action]
    );
    const rule = result.rows[0];
    await logActivity(req.user.id, 'networking', `Firewall rule added: ${action} ${direction} port ${port}/${protocol}`, rule.id, { namespaceId: ns.id });
    res.status(201).json(rule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// DELETE /api/networking/namespaces/:id/rules/:ruleId
router.delete('/namespaces/:id/rules/:ruleId', async (req, res) => {
  try {
    const nsResult = await pool.query('SELECT * FROM namespaces WHERE id = $1', [req.params.id]);
    const ns = nsResult.rows[0];
    if (!ns) return res.status(404).json({ error: 'Namespace not found' });
    if (ns.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const deleted = await pool.query(
      'DELETE FROM firewall_rules WHERE id = $1 AND namespace_id = $2 RETURNING *',
      [req.params.ruleId, ns.id]
    );
    if (!deleted.rows[0]) return res.status(404).json({ error: 'Rule not found' });
    await logActivity(req.user.id, 'networking', `Firewall rule deleted`, req.params.ruleId, { namespaceId: ns.id });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

module.exports = router;
