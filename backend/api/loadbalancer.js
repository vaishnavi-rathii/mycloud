const express = require('express');
const pool = require('../db/pool');
const logActivity = require('../db/logActivity');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/lb
router.get('/', async (req, res) => {
  try {
    const lbs = await pool.query(
      'SELECT * FROM load_balancers WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]
    );
    for (const lb of lbs.rows) {
      const targets = await pool.query('SELECT * FROM lb_targets WHERE lb_id=$1', [lb.id]);
      lb.targets = targets.rows;
      lb.healthy_count = targets.rows.filter(t => t.status === 'healthy').length;
      lb.unhealthy_count = targets.rows.filter(t => t.status === 'unhealthy').length;
    }
    res.json(lbs.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list load balancers' });
  }
});

// POST /api/lb
router.post('/', async (req, res) => {
  const { name, algorithm = 'round_robin', healthCheckPath = '/health', healthCheckInterval = 30, port = 80 } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = await pool.query(
      `INSERT INTO load_balancers (user_id, name, algorithm, health_check_path, health_check_interval, port)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, name, algorithm, healthCheckPath, healthCheckInterval, port]
    );
    const lb = result.rows[0];
    lb.targets = [];
    await logActivity(req.user.id, 'loadbalancer', `Load balancer created: ${name}`, lb.id);
    res.status(201).json(lb);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create load balancer' });
  }
});

// GET /api/lb/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM load_balancers WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const lb = result.rows[0];
    if (!lb) return res.status(404).json({ error: 'Not found' });
    const targets = await pool.query('SELECT * FROM lb_targets WHERE lb_id=$1', [lb.id]);
    lb.targets = targets.rows;
    res.json(lb);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch load balancer' });
  }
});

// POST /api/lb/:id/targets
router.post('/:id/targets', async (req, res) => {
  const { host, port, instanceId, weight = 1 } = req.body;
  if (!host || !port) return res.status(400).json({ error: 'host and port required' });
  try {
    const lbRes = await pool.query('SELECT * FROM load_balancers WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!lbRes.rows[0]) return res.status(404).json({ error: 'Load balancer not found' });
    const result = await pool.query(
      `INSERT INTO lb_targets (lb_id, host, port, instance_id, weight, last_health_check)
       VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
      [req.params.id, host, port, instanceId || null, weight]
    );
    await logActivity(req.user.id, 'loadbalancer', `Target added: ${host}:${port}`, req.params.id);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add target' });
  }
});

// DELETE /api/lb/:id/targets/:targetId
router.delete('/:id/targets/:targetId', async (req, res) => {
  try {
    const lbRes = await pool.query('SELECT * FROM load_balancers WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!lbRes.rows[0]) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM lb_targets WHERE id=$1 AND lb_id=$2', [req.params.targetId, req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove target' });
  }
});

// POST /api/lb/:id/health-check — simulate health check
router.post('/:id/health-check', async (req, res) => {
  try {
    const lbRes = await pool.query('SELECT * FROM load_balancers WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!lbRes.rows[0]) return res.status(404).json({ error: 'Not found' });
    const targets = await pool.query('SELECT * FROM lb_targets WHERE lb_id=$1', [req.params.id]);
    const results = [];
    for (const target of targets.rows) {
      // Simulate health check result (70% healthy if no real check possible)
      const healthy = Math.random() > 0.3;
      await pool.query(
        'UPDATE lb_targets SET status=$1, last_health_check=NOW() WHERE id=$2',
        [healthy ? 'healthy' : 'unhealthy', target.id]
      );
      results.push({ id: target.id, host: target.host, port: target.port, status: healthy ? 'healthy' : 'unhealthy' });
    }
    res.json({ checked: results.length, results });
  } catch (err) {
    res.status(500).json({ error: 'Health check failed' });
  }
});

// DELETE /api/lb/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM load_balancers WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const lb = result.rows[0];
    if (!lb) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM load_balancers WHERE id=$1', [lb.id]);
    await logActivity(req.user.id, 'loadbalancer', `Load balancer deleted: ${lb.name}`, lb.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete load balancer' });
  }
});

module.exports = router;
