const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const logActivity = require('../db/logActivity');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/iam/users
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, permissions, api_key IS NOT NULL as has_api_key, active, created_at
       FROM iam_users WHERE owner_id=$1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list IAM users' });
  }
});

// POST /api/iam/users
router.post('/users', async (req, res) => {
  const { email, password, permissions = {} } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO iam_users (owner_id, email, password, permissions)
       VALUES ($1,$2,$3,$4) RETURNING id, email, permissions, active, created_at`,
      [req.user.id, email.toLowerCase(), hash, JSON.stringify(permissions)]
    );
    const user = result.rows[0];
    await logActivity(req.user.id, 'iam', `IAM user created: ${email}`, user.id);
    res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Failed to create IAM user' });
  }
});

// PUT /api/iam/users/:id/permissions
router.put('/users/:id/permissions', async (req, res) => {
  const { permissions } = req.body;
  try {
    const result = await pool.query(
      'UPDATE iam_users SET permissions=$1 WHERE id=$2 AND owner_id=$3 RETURNING id, email, permissions',
      [JSON.stringify(permissions), req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    await logActivity(req.user.id, 'iam', `IAM permissions updated`, req.params.id, { permissions });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// POST /api/iam/users/:id/api-key — generate API key
router.post('/users/:id/api-key', async (req, res) => {
  try {
    const userRes = await pool.query('SELECT * FROM iam_users WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
    if (!userRes.rows[0]) return res.status(404).json({ error: 'User not found' });
    const apiKey = 'mc_' + crypto.randomBytes(24).toString('hex');
    await pool.query('UPDATE iam_users SET api_key=$1 WHERE id=$2', [apiKey, req.params.id]);
    await logActivity(req.user.id, 'iam', `API key generated for: ${userRes.rows[0].email}`, req.params.id);
    res.json({ apiKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

// DELETE /api/iam/users/:id/api-key
router.delete('/users/:id/api-key', async (req, res) => {
  try {
    await pool.query('UPDATE iam_users SET api_key=NULL WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// PATCH /api/iam/users/:id — activate/deactivate
router.patch('/users/:id', async (req, res) => {
  const { active } = req.body;
  try {
    const result = await pool.query(
      'UPDATE iam_users SET active=$1 WHERE id=$2 AND owner_id=$3 RETURNING id, email, active',
      [active, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/iam/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM iam_users WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    await pool.query('DELETE FROM iam_users WHERE id=$1', [req.params.id]);
    await logActivity(req.user.id, 'iam', `IAM user deleted: ${result.rows[0].email}`, req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/iam/sessions — recent login sessions
router.get('/sessions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM iam_sessions WHERE user_id=$1 AND revoked=FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// DELETE /api/iam/sessions/:id — revoke
router.delete('/sessions/:id', async (req, res) => {
  try {
    await pool.query('UPDATE iam_sessions SET revoked=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

module.exports = router;
