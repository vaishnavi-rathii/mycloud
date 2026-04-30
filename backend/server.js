require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./db/pool');

const app = express();
const server = http.createServer(app);

// ─── Middleware ──────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storagePath = process.env.STORAGE_PATH || path.join(__dirname, 'storage');
fs.mkdirSync(storagePath, { recursive: true });

// ─── Socket.io ──────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', credentials: true },
});
global.io = io;

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const docker = require('./docker/client');

  socket.on('subscribe_metrics', async ({ instanceId }) => {
    try {
      const result = await pool.query('SELECT * FROM instances WHERE id=$1', [instanceId]);
      const instance = result.rows[0];
      if (!instance || !instance.container_id || instance.status !== 'running') return;
      if (instance.user_id !== socket.user.id && socket.user.role !== 'admin') return;

      const container = docker.getContainer(instance.container_id);
      let stream;
      try { stream = await container.stats({ stream: true }); } catch { return; }

      stream.on('data', (chunk) => {
        try {
          const stats = JSON.parse(chunk.toString());
          const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
          const sysDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
          const cpuCount = stats.cpu_stats.online_cpus || 1;
          const cpuPercent = sysDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0;
          socket.emit('metrics', {
            instanceId,
            cpuPercent: Math.min(cpuPercent, 100).toFixed(2),
            memUsed: stats.memory_stats.usage || 0,
            memLimit: stats.memory_stats.limit || 0,
            timestamp: Date.now(),
          });
        } catch {}
      });

      socket.on('disconnect', () => { try { stream.destroy(); } catch {} });
      socket.on('unsubscribe_metrics', () => { try { stream.destroy(); } catch {} });
    } catch {}
  });

  // Subscribe to container log stream
  socket.on('subscribe_logs', async ({ containerId }) => {
    try {
      const result = await pool.query(
        'SELECT * FROM instances WHERE container_id=$1 AND user_id=$2',
        [containerId, socket.user.id]
      );
      if (!result.rows[0]) return;

      const docker = require('./docker/client');
      const container = docker.getContainer(containerId);
      const stream = await container.logs({ stdout: true, stderr: true, follow: true, tail: 50, timestamps: true });

      stream.on('data', (chunk) => {
        const msg = chunk.toString('utf8').slice(8);
        socket.emit('log_line', { containerId, message: msg.trim(), timestamp: new Date() });
      });

      socket.on('disconnect', () => { try { stream.destroy(); } catch {} });
      socket.on('unsubscribe_logs', () => { try { stream.destroy(); } catch {} });
    } catch {}
  });
});

// ─── API Routes ──────────────────────────────────────────────────
const storageRouter = require('./api/storage');
const { router: schedulerRouter, loadActiveJobs } = require('./api/scheduler');

app.use('/api/auth', require('./api/auth'));
app.use('/api/compute', require('./api/compute'));
app.use('/api/storage', storageRouter);
app.use('/storage', storageRouter);
app.use('/api/databases', require('./api/database'));
app.use('/api/networking', require('./api/networking'));
app.use('/api/secrets', require('./api/secrets'));
app.use('/api/lb', require('./api/loadbalancer'));
app.use('/api/scheduler', schedulerRouter);
app.use('/api/logs', require('./api/logs'));
app.use('/api/dns', require('./api/dns'));
app.use('/api/tags', require('./api/tags'));
app.use('/api/iam', require('./api/iam'));

// ─── Dashboard API ───────────────────────────────────────────────
const { authenticate } = require('./middleware/auth');

app.get('/api/dashboard/summary', authenticate, async (req, res) => {
  try {
    const [instances, buckets, dbs, namespaces, secrets, lbs, jobs, activity] = await Promise.all([
      pool.query('SELECT status, COUNT(*) as count FROM instances WHERE user_id=$1 GROUP BY status', [req.user.id]),
      pool.query('SELECT COUNT(*) as count FROM buckets WHERE user_id=$1', [req.user.id]),
      pool.query('SELECT status, COUNT(*) as count FROM managed_databases WHERE user_id=$1 GROUP BY status', [req.user.id]),
      pool.query('SELECT COUNT(*) as count FROM namespaces WHERE user_id=$1', [req.user.id]),
      pool.query('SELECT COUNT(*) as count FROM secrets WHERE user_id=$1', [req.user.id]),
      pool.query('SELECT COUNT(*) as count FROM load_balancers WHERE user_id=$1', [req.user.id]),
      pool.query("SELECT COUNT(*) as count FROM cron_jobs WHERE user_id=$1 AND status='active'", [req.user.id]),
      pool.query('SELECT * FROM activity_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 15', [req.user.id]),
    ]);

    const instanceCounts = { running: 0, stopped: 0 };
    instances.rows.forEach((r) => { instanceCounts[r.status] = parseInt(r.count); });
    const dbCounts = { running: 0, stopped: 0 };
    dbs.rows.forEach((r) => { dbCounts[r.status] = parseInt(r.count); });

    res.json({
      compute: instanceCounts,
      storage: { buckets: parseInt(buckets.rows[0].count) },
      databases: dbCounts,
      networking: { namespaces: parseInt(namespaces.rows[0].count) },
      secrets: { count: parseInt(secrets.rows[0].count) },
      loadBalancers: { count: parseInt(lbs.rows[0].count) },
      scheduler: { active: parseInt(jobs.rows[0].count) },
      recentActivity: activity.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

app.get('/api/dashboard/billing', authenticate, async (req, res) => {
  try {
    const snapshot = await pool.query(
      'SELECT * FROM billing_snapshots WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [req.user.id]
    );
    const [c, d] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(cost_per_hour),0) as cost FROM instances WHERE user_id=$1 AND status='running'`, [req.user.id]),
      pool.query(`SELECT COALESCE(SUM(cost_per_hour),0) as cost FROM managed_databases WHERE user_id=$1 AND status='running'`, [req.user.id]),
    ]);
    const computeCost = parseFloat(c.rows[0].cost);
    const dbCost = parseFloat(d.rows[0].cost);
    res.json({
      snapshot: snapshot.rows[0] || null,
      currentRun: { computeCostPerHour: computeCost, databaseCostPerHour: dbCost, totalCostPerHour: computeCost + dbCost },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch billing' });
  }
});

app.get('/api/dashboard/activity', authenticate, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const { service, search } = req.query;
  try {
    let q = 'SELECT * FROM activity_logs WHERE user_id=$1';
    const params = [req.user.id];
    if (service) { q += ` AND service=$${params.length+1}`; params.push(service); }
    if (search) { q += ` AND action ILIKE $${params.length+1}`; params.push(`%${search}%`); }
    q += ` ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// Global search across all resources
app.get('/api/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const like = `%${q}%`;
  try {
    const [instances, buckets, dbs, secrets] = await Promise.all([
      pool.query("SELECT id,'instance' as type, name as label, status FROM instances WHERE user_id=$1 AND name ILIKE $2 LIMIT 5", [req.user.id, like]),
      pool.query("SELECT id,'bucket' as type, name as label, access as status FROM buckets WHERE user_id=$1 AND name ILIKE $2 LIMIT 5", [req.user.id, like]),
      pool.query("SELECT id,'database' as type, name as label, status FROM managed_databases WHERE user_id=$1 AND name ILIKE $2 LIMIT 5", [req.user.id, like]),
      pool.query("SELECT id,'secret' as type, name as label, type as status FROM secrets WHERE user_id=$1 AND name ILIKE $2 LIMIT 5", [req.user.id, like]),
    ]);
    const results = [
      ...instances.rows,
      ...buckets.rows,
      ...dbs.rows,
      ...secrets.rows,
    ];
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─── Billing Cron ─────────────────────────────────────────────────
cron.schedule('0 * * * *', async () => {
  try {
    const users = await pool.query(
      "SELECT DISTINCT user_id FROM instances WHERE status='running' UNION SELECT DISTINCT user_id FROM managed_databases WHERE status='running'"
    );
    for (const { user_id: uid } of users.rows) {
      const now = new Date();
      const start = new Date(now.getTime() - 3600000);
      const [c, d] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(cost_per_hour),0) as cost FROM instances WHERE user_id=$1 AND status='running'`, [uid]),
        pool.query(`SELECT COALESCE(SUM(cost_per_hour),0) as cost FROM managed_databases WHERE user_id=$1 AND status='running'`, [uid]),
      ]);
      const cc = parseFloat(c.rows[0].cost), dc = parseFloat(d.rows[0].cost);
      await pool.query(
        `INSERT INTO billing_snapshots (user_id, period_start, period_end, compute_cost, database_cost, total_cost)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [uid, start, now, cc, dc, cc + dc]
      );
    }
  } catch (err) {
    console.error('Billing cron error:', err.message);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, async () => {
    console.log(`MyCloud backend running on port ${PORT}`);
    await loadActiveJobs();
  });
}

module.exports = { app, server };
