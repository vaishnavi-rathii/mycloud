const express = require('express');
const path = require('path');
const fs = require('fs');
const docker = require('../docker/client');
const pool = require('../db/pool');
const logActivity = require('../db/logActivity');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const DB_PASSWORD_PREFIX = 'mycloudpw_';
const BASE_PG_PORT = 15432;

async function findFreePort(startPort) {
  const result = await pool.query('SELECT host_port FROM managed_databases WHERE host_port IS NOT NULL');
  const usedPorts = new Set(result.rows.map((r) => r.host_port));
  let port = startPort;
  while (usedPorts.has(port)) port++;
  return port;
}

// GET /api/databases
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM managed_databases WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list databases' });
  }
});

// POST /api/databases
router.post('/', async (req, res) => {
  const { name, engine = 'postgres', version = 'latest', namespaceId } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!['postgres', 'sqlite'].includes(engine)) {
    return res.status(400).json({ error: 'engine must be postgres or sqlite' });
  }

  try {
    let containerId = null;
    let hostPort = null;
    let connectionString = null;
    const dbPassword = DB_PASSWORD_PREFIX + Math.random().toString(36).slice(2, 10);

    if (engine === 'postgres') {
      hostPort = await findFreePort(BASE_PG_PORT);
      const image = `postgres:${version === 'latest' ? '16-alpine' : version}`;

      try {
        await new Promise((resolve, reject) => {
          docker.pull(image, (err, stream) => {
            if (err) return reject(err);
            docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve());
          });
        });
      } catch { /* may already exist */ }

      const container = await docker.createContainer({
        name: `mycloud_db_${name.replace(/\s+/g, '_')}_${Date.now()}`,
        Image: image,
        Env: [
          `POSTGRES_DB=${name}`,
          'POSTGRES_USER=mycloud',
          `POSTGRES_PASSWORD=${dbPassword}`,
        ],
        HostConfig: {
          PortBindings: { '5432/tcp': [{ HostPort: String(hostPort) }] },
          Memory: 268435456,
        },
        Labels: { 'mycloud.managed': 'true', 'mycloud.type': 'database' },
      });
      await container.start();
      containerId = container.id;
      connectionString = `postgres://mycloud:${dbPassword}@localhost:${hostPort}/${name}`;
    } else {
      // SQLite — just a file path in the storage volume
      const dbPath = path.join(process.env.STORAGE_PATH || './storage', `${name}.sqlite`);
      connectionString = `sqlite://${dbPath}`;
    }

    const result = await pool.query(
      `INSERT INTO managed_databases
         (user_id, namespace_id, name, engine, version, container_id, host_port, status, connection_string, cost_per_hour)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [req.user.id, namespaceId || null, name, engine, version,
       containerId, hostPort, engine === 'postgres' ? 'running' : 'running',
       connectionString, engine === 'postgres' ? 0.0116 : 0.001]
    );
    const db = result.rows[0];
    await logActivity(req.user.id, 'database', `Database provisioned: ${name} (${engine})`, db.id, { engine, version });
    res.status(201).json(db);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to provision database' });
  }
});

// GET /api/databases/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM managed_databases WHERE id = $1', [req.params.id]);
    const db = result.rows[0];
    if (!db) return res.status(404).json({ error: 'Database not found' });
    if (db.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(db);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch database' });
  }
});

// POST /api/databases/:id/start
router.post('/:id/start', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM managed_databases WHERE id = $1', [req.params.id]);
    const db = result.rows[0];
    if (!db) return res.status(404).json({ error: 'Database not found' });
    if (db.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!db.container_id) return res.status(400).json({ error: 'No container (SQLite databases are always available)' });

    await docker.getContainer(db.container_id).start();
    await pool.query(`UPDATE managed_databases SET status='running', updated_at=NOW() WHERE id=$1`, [db.id]);
    await logActivity(req.user.id, 'database', `Database started: ${db.name}`, db.id);
    res.json({ message: 'Database started' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to start database' });
  }
});

// POST /api/databases/:id/stop
router.post('/:id/stop', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM managed_databases WHERE id = $1', [req.params.id]);
    const db = result.rows[0];
    if (!db) return res.status(404).json({ error: 'Database not found' });
    if (db.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!db.container_id) return res.status(400).json({ error: 'No container (SQLite databases are always available)' });

    try {
      await docker.getContainer(db.container_id).stop({ t: 5 });
    } catch (e) {
      if (e.statusCode !== 304 && e.statusCode !== 404) throw e;
    }
    await pool.query(`UPDATE managed_databases SET status='stopped', updated_at=NOW() WHERE id=$1`, [db.id]);
    await logActivity(req.user.id, 'database', `Database stopped: ${db.name}`, db.id);
    res.json({ message: 'Database stopped' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to stop database' });
  }
});

// DELETE /api/databases/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM managed_databases WHERE id = $1', [req.params.id]);
    const db = result.rows[0];
    if (!db) return res.status(404).json({ error: 'Database not found' });
    if (db.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (db.container_id) {
      const container = docker.getContainer(db.container_id);
      try { await container.stop({ t: 3 }); } catch { /* ignore */ }
      try { await container.remove({ force: true }); } catch { /* ignore */ }
    } else if (db.engine === 'sqlite') {
      const dbPath = path.join(process.env.STORAGE_PATH || './storage', `${db.name}.sqlite`);
      fs.rmSync(dbPath, { force: true });
    }

    await pool.query('DELETE FROM managed_databases WHERE id = $1', [db.id]);
    await logActivity(req.user.id, 'database', `Database deleted: ${db.name}`, db.id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to delete database' });
  }
});

module.exports = router;
