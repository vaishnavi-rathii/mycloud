const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const logActivity = require('../db/logActivity');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const ALGO = 'aes-256-gcm';
const KEY = crypto.scryptSync(process.env.JWT_SECRET || 'fallback_key_32chars_minimum___', 'mycloud-secrets', 32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(data) {
  const [ivHex, tagHex, encHex] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function maskValue(val) {
  if (!val || val.length < 4) return '****';
  return val.slice(0, 4) + '****' + val.slice(-2);
}

// GET /api/secrets
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, type, description, rotation_enabled, last_rotated_at, created_at, updated_at
       FROM secrets WHERE user_id=$1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list secrets' });
  }
});

// POST /api/secrets
router.post('/', async (req, res) => {
  const { name, value, type = 'generic', description, rotationEnabled = false } = req.body;
  if (!name || !value) return res.status(400).json({ error: 'name and value required' });
  try {
    const enc = encrypt(value);
    const result = await pool.query(
      `INSERT INTO secrets (user_id, name, type, encrypted_value, description, rotation_enabled)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, type, description, rotation_enabled, created_at`,
      [req.user.id, name, type, enc, description || null, rotationEnabled]
    );
    const secret = result.rows[0];
    await pool.query(
      `INSERT INTO secret_versions (secret_id, encrypted_value, version) VALUES ($1,$2,1)`,
      [secret.id, enc]
    );
    await logActivity(req.user.id, 'secrets', `Secret created: ${name}`, secret.id, { type });
    res.status(201).json(secret);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Secret name already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create secret' });
  }
});

// GET /api/secrets/:id/value — reveal (masked by default)
router.get('/:id/value', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM secrets WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const secret = result.rows[0];
    if (!secret) return res.status(404).json({ error: 'Not found' });
    const value = decrypt(secret.encrypted_value);
    const reveal = req.query.reveal === 'true';
    await logActivity(req.user.id, 'secrets', `Secret accessed: ${secret.name}`, secret.id);
    res.json({ value: reveal ? value : maskValue(value), masked: !reveal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve secret' });
  }
});

// PUT /api/secrets/:id — update value
router.put('/:id', async (req, res) => {
  const { value, description, rotationEnabled } = req.body;
  try {
    const result = await pool.query('SELECT * FROM secrets WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const secret = result.rows[0];
    if (!secret) return res.status(404).json({ error: 'Not found' });

    const enc = value ? encrypt(value) : secret.encrypted_value;
    if (value) {
      const vCount = await pool.query('SELECT COUNT(*) FROM secret_versions WHERE secret_id=$1', [secret.id]);
      await pool.query(
        `INSERT INTO secret_versions (secret_id, encrypted_value, version) VALUES ($1,$2,$3)`,
        [secret.id, enc, parseInt(vCount.rows[0].count) + 1]
      );
    }

    const updated = await pool.query(
      `UPDATE secrets SET encrypted_value=$1, description=COALESCE($2, description),
       rotation_enabled=COALESCE($3, rotation_enabled), updated_at=NOW(), last_rotated_at=CASE WHEN $4 THEN NOW() ELSE last_rotated_at END
       WHERE id=$5 RETURNING id, name, type, description, rotation_enabled, updated_at`,
      [enc, description, rotationEnabled, !!value, secret.id]
    );
    await logActivity(req.user.id, 'secrets', `Secret updated: ${secret.name}`, secret.id);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update secret' });
  }
});

// GET /api/secrets/:id/versions
router.get('/:id/versions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM secrets WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    const versions = await pool.query(
      'SELECT id, version, created_at FROM secret_versions WHERE secret_id=$1 ORDER BY version DESC',
      [req.params.id]
    );
    res.json(versions.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

// DELETE /api/secrets/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM secrets WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const secret = result.rows[0];
    if (!secret) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM secrets WHERE id=$1', [secret.id]);
    await logActivity(req.user.id, 'secrets', `Secret deleted: ${secret.name}`, secret.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete secret' });
  }
});

module.exports = router;
