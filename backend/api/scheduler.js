const express = require('express');
const cron = require('node-cron');
const { exec } = require('child_process');
const http = require('http');
const https = require('https');
const pool = require('../db/pool');
const logActivity = require('../db/logActivity');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Active cron tasks in memory: jobId -> task
const activeTasks = {};

function calcNextRun(expression) {
  try {
    // Simple estimation — next minute boundary for common patterns
    return new Date(Date.now() + 60000);
  } catch { return null; }
}

function runHttpJob(url, method) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { method }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function runCommandJob(command) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.slice(0, 500));
    });
  });
}

async function executeJob(jobId) {
  const result = await pool.query('SELECT * FROM cron_jobs WHERE id=$1', [jobId]);
  const job = result.rows[0];
  if (!job || job.status !== 'active') return;

  const runId = (await pool.query(
    'INSERT INTO cron_job_runs (job_id, status, output) VALUES ($1,\'running\',\'\') RETURNING id',
    [jobId]
  )).rows[0].id;

  let output = '';
  let status = 'success';
  try {
    if (job.type === 'http') {
      output = await runHttpJob(job.http_url, job.http_method || 'GET');
    } else {
      output = await runCommandJob(job.command);
    }
  } catch (err) {
    output = err.message;
    status = 'failure';
  }

  await pool.query(
    `UPDATE cron_job_runs SET status=$1, output=$2, completed_at=NOW() WHERE id=$3`,
    [status, output, runId]
  );
  await pool.query(
    `UPDATE cron_jobs SET last_run_at=NOW(), last_run_status=$1, run_count=run_count+1,
     next_run_at=$2 WHERE id=$3`,
    [status, calcNextRun(job.expression), jobId]
  );

  if (global.io) {
    global.io.emit('job_run', { jobId, status, output, runId });
  }
}

function scheduleJob(job) {
  if (!cron.validate(job.expression)) return;
  if (activeTasks[job.id]) {
    activeTasks[job.id].stop();
    delete activeTasks[job.id];
  }
  if (job.status !== 'active') return;
  activeTasks[job.id] = cron.schedule(job.expression, () => executeJob(job.id));
}

// Load all active jobs on startup
async function loadActiveJobs() {
  try {
    const result = await pool.query("SELECT * FROM cron_jobs WHERE status='active'");
    result.rows.forEach(scheduleJob);
    console.log(`Loaded ${result.rows.length} scheduled cron jobs`);
  } catch (err) {
    console.error('Failed to load cron jobs:', err.message);
  }
}

// GET /api/scheduler
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cron_jobs WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// POST /api/scheduler
router.post('/', async (req, res) => {
  const { name, expression, type = 'command', command, httpUrl, httpMethod = 'GET' } = req.body;
  if (!name || !expression) return res.status(400).json({ error: 'name and expression required' });
  if (!cron.validate(expression)) return res.status(400).json({ error: 'Invalid cron expression' });
  if (type === 'command' && !command) return res.status(400).json({ error: 'command required for command type' });
  if (type === 'http' && !httpUrl) return res.status(400).json({ error: 'httpUrl required for http type' });

  try {
    const result = await pool.query(
      `INSERT INTO cron_jobs (user_id, name, expression, type, command, http_url, http_method, next_run_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, name, expression, type, command || null, httpUrl || null, httpMethod, calcNextRun(expression)]
    );
    const job = result.rows[0];
    scheduleJob(job);
    await logActivity(req.user.id, 'scheduler', `Job created: ${name}`, job.id, { expression, type });
    res.status(201).json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// POST /api/scheduler/:id/run — trigger now
router.post('/:id/run', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cron_jobs WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    executeJob(req.params.id);
    res.json({ message: 'Job triggered' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger job' });
  }
});

// PATCH /api/scheduler/:id — pause/resume
router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  try {
    const result = await pool.query('SELECT * FROM cron_jobs WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const job = result.rows[0];
    if (!job) return res.status(404).json({ error: 'Not found' });
    await pool.query('UPDATE cron_jobs SET status=$1 WHERE id=$2', [status, job.id]);
    job.status = status;
    scheduleJob(job);
    await logActivity(req.user.id, 'scheduler', `Job ${status}: ${job.name}`, job.id);
    res.json({ ...job, status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// GET /api/scheduler/:id/runs
router.get('/:id/runs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cron_job_runs WHERE job_id=$1 ORDER BY started_at DESC LIMIT 20',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

// DELETE /api/scheduler/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cron_jobs WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const job = result.rows[0];
    if (!job) return res.status(404).json({ error: 'Not found' });
    if (activeTasks[job.id]) { activeTasks[job.id].stop(); delete activeTasks[job.id]; }
    await pool.query('DELETE FROM cron_jobs WHERE id=$1', [job.id]);
    await logActivity(req.user.id, 'scheduler', `Job deleted: ${job.name}`, job.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

module.exports = { router, loadActiveJobs };
