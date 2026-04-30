const express = require('express');
const docker = require('../docker/client');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function detectLevel(line) {
  const u = line.toUpperCase();
  if (u.includes('ERROR') || u.includes('ERR ') || u.includes('FATAL') || u.includes('CRITICAL')) return 'ERROR';
  if (u.includes('WARN') || u.includes('WARNING')) return 'WARN';
  if (u.includes('DEBUG')) return 'DEBUG';
  return 'INFO';
}

// GET /api/logs/containers — list containers we can fetch logs from
router.get('/containers', async (req, res) => {
  try {
    const instances = await pool.query(
      "SELECT id, name, container_id, status FROM instances WHERE user_id=$1 AND status='running'",
      [req.user.id]
    );
    const dbs = await pool.query(
      "SELECT id, name, container_id, 'database' as type FROM managed_databases WHERE user_id=$1 AND status='running'",
      [req.user.id]
    );
    res.json({
      instances: instances.rows.filter(r => r.container_id),
      databases: dbs.rows.filter(r => r.container_id),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list containers' });
  }
});

// GET /api/logs/:containerId — fetch logs
router.get('/:containerId', async (req, res) => {
  const { tail = '200', since, level } = req.query;

  try {
    // Verify this container belongs to the user
    const instResult = await pool.query(
      'SELECT * FROM instances WHERE container_id=$1 AND user_id=$2',
      [req.params.containerId, req.user.id]
    );
    const dbResult = await pool.query(
      'SELECT * FROM managed_databases WHERE container_id=$1 AND user_id=$2',
      [req.params.containerId, req.user.id]
    );
    if (!instResult.rows[0] && !dbResult.rows[0]) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const container = docker.getContainer(req.params.containerId);
    const opts = {
      stdout: true, stderr: true,
      tail: parseInt(tail) || 200,
      timestamps: true,
    };
    if (since) opts.since = Math.floor(new Date(since).getTime() / 1000);

    const stream = await container.logs(opts);
    const raw = stream.toString('utf8');

    // Docker log format: 8-byte header + message
    const lines = [];
    const entries = raw.split('\n').filter(Boolean);
    for (const entry of entries) {
      // Strip docker multiplexing header (8 bytes)
      const msg = entry.length > 8 ? entry.slice(8) : entry;
      const parts = msg.split(' ');
      let timestamp = null;
      let text = msg;
      if (parts[0] && parts[0].includes('T')) {
        timestamp = parts[0];
        text = parts.slice(1).join(' ');
      }
      const detectedLevel = detectLevel(text);
      if (level && level !== 'ALL' && detectedLevel !== level) continue;
      lines.push({ timestamp, level: detectedLevel, message: text.trim() });
    }

    res.json({ lines, total: lines.length, container: req.params.containerId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch logs', detail: err.message });
  }
});

// WebSocket log streaming handled in server.js via socket.io
// GET /api/logs/:containerId/stream — SSE stream
router.get('/:containerId/stream', async (req, res) => {
  try {
    const instResult = await pool.query(
      'SELECT * FROM instances WHERE container_id=$1 AND user_id=$2',
      [req.params.containerId, req.user.id]
    );
    if (!instResult.rows[0]) return res.status(403).json({ error: 'Forbidden' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const container = docker.getContainer(req.params.containerId);
    const stream = await container.logs({ stdout: true, stderr: true, follow: true, tail: 50, timestamps: true });

    stream.on('data', (chunk) => {
      const msg = chunk.toString('utf8').slice(8);
      const level = detectLevel(msg);
      res.write(`data: ${JSON.stringify({ message: msg.trim(), level, timestamp: new Date() })}\n\n`);
    });

    req.on('close', () => {
      try { stream.destroy(); } catch {}
    });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
