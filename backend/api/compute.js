const express = require('express');
const { v4: uuidv4 } = require('uuid');
const docker = require('../docker/client');
const pool = require('../db/pool');
const logActivity = require('../db/logActivity');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const INSTANCE_TYPES = {
  small:  { NanoCpus: 250000000,  Memory: 268435456,  cost: 0.0058, cpu: '0.25', mem: '256m' },
  medium: { NanoCpus: 500000000,  Memory: 536870912,  cost: 0.0116, cpu: '0.5',  mem: '512m' },
  large:  { NanoCpus: 1000000000, Memory: 1073741824, cost: 0.0232, cpu: '1.0',  mem: '1024m' },
};

// GET /api/compute/instance-types
router.get('/instance-types', (req, res) => {
  const types = Object.entries(INSTANCE_TYPES).map(([name, cfg]) => ({
    name,
    cpu: cfg.cpu,
    memory: cfg.mem,
    costPerHour: cfg.cost,
  }));
  res.json(types);
});

// GET /api/compute/instances
router.get('/instances', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM instances WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list instances' });
  }
});

// POST /api/compute/instances
router.post('/instances', async (req, res) => {
  const { name, image, instanceType, namespaceId } = req.body;
  if (!name || !image || !instanceType) {
    return res.status(400).json({ error: 'name, image, and instanceType are required' });
  }
  if (!INSTANCE_TYPES[instanceType]) {
    return res.status(400).json({ error: `instanceType must be one of: ${Object.keys(INSTANCE_TYPES).join(', ')}` });
  }

  const cfg = INSTANCE_TYPES[instanceType];
  const containerName = `mycloud_${name.replace(/\s+/g, '_')}_${uuidv4().slice(0, 8)}`;

  try {
    // Pull image if not present (best-effort)
    try {
      await new Promise((resolve, reject) => {
        docker.pull(image, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve());
        });
      });
    } catch {
      // Image may already exist locally; proceed
    }

    const container = await docker.createContainer({
      name: containerName,
      Image: image,
      HostConfig: {
        NanoCpus: cfg.NanoCpus,
        Memory: cfg.Memory,
        NetworkMode: 'bridge',
      },
      Labels: { 'mycloud.managed': 'true', 'mycloud.user': req.user.id },
    });
    await container.start();

    const result = await pool.query(
      `INSERT INTO instances
         (user_id, namespace_id, name, image, instance_type, container_id, status, cpu_limit, memory_limit, cost_per_hour)
       VALUES ($1,$2,$3,$4,$5,$6,'running',$7,$8,$9)
       RETURNING *`,
      [req.user.id, namespaceId || null, name, image, instanceType,
       container.id, cfg.cpu, cfg.mem, cfg.cost]
    );

    const instance = result.rows[0];
    await logActivity(req.user.id, 'compute', `Instance created: ${name}`, instance.id, { image, instanceType });
    res.status(201).json(instance);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to create instance' });
  }
});

// GET /api/compute/instances/:id
router.get('/instances/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    const instance = result.rows[0];
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (instance.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(instance);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch instance' });
  }
});

// POST /api/compute/instances/:id/start
router.post('/instances/:id/start', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    const instance = result.rows[0];
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (instance.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!instance.container_id) return res.status(400).json({ error: 'No container associated' });

    const container = docker.getContainer(instance.container_id);
    await container.start();
    await pool.query(
      `UPDATE instances SET status='running', updated_at=NOW() WHERE id=$1`,
      [instance.id]
    );
    await logActivity(req.user.id, 'compute', `Instance started: ${instance.name}`, instance.id);
    res.json({ message: 'Instance started' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to start instance' });
  }
});

// POST /api/compute/instances/:id/stop
router.post('/instances/:id/stop', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    const instance = result.rows[0];
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (instance.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!instance.container_id) return res.status(400).json({ error: 'No container associated' });

    const container = docker.getContainer(instance.container_id);
    try {
      await container.stop({ t: 5 });
    } catch (e) {
      if (e.statusCode !== 304 && e.statusCode !== 404) throw e;
    }
    await pool.query(
      `UPDATE instances SET status='stopped', updated_at=NOW() WHERE id=$1`,
      [instance.id]
    );
    await logActivity(req.user.id, 'compute', `Instance stopped: ${instance.name}`, instance.id);
    res.json({ message: 'Instance stopped' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to stop instance' });
  }
});

// DELETE /api/compute/instances/:id
router.delete('/instances/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    const instance = result.rows[0];
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (instance.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (instance.container_id) {
      const container = docker.getContainer(instance.container_id);
      try {
        await container.stop({ t: 3 });
      } catch (e) {
        if (e.statusCode !== 304 && e.statusCode !== 404) throw e;
      }
      try {
        await container.remove({ force: true });
      } catch (e) {
        if (e.statusCode !== 404) throw e;
      }
    }

    await pool.query('DELETE FROM instances WHERE id = $1', [instance.id]);
    await logActivity(req.user.id, 'compute', `Instance deleted: ${instance.name}`, instance.id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to delete instance' });
  }
});

// GET /api/compute/instances/:id/metrics
router.get('/instances/:id/metrics', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    const instance = result.rows[0];
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (instance.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!instance.container_id || instance.status !== 'running') {
      return res.json({ cpuPercent: 0, memUsed: 0, memLimit: 0, status: instance.status });
    }

    const container = docker.getContainer(instance.container_id);
    const stats = await container.stats({ stream: false });

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

    res.json({
      cpuPercent: Math.min(cpuPercent, 100).toFixed(2),
      memUsed: stats.memory_stats.usage || 0,
      memLimit: stats.memory_stats.limit || 0,
      status: 'running',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

module.exports = router;
