const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const logActivity = require('../db/logActivity');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const STORAGE_ROOT = process.env.STORAGE_PATH || path.join(__dirname, '../storage');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, STORAGE_ROOT),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

// ─── Bucket management (requires auth) ──────────────────────────

// GET /api/storage/buckets
router.get('/buckets', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, COUNT(o.id)::int AS object_count
       FROM buckets b
       LEFT JOIN objects o ON o.bucket_id = b.id
       WHERE b.user_id = $1
       GROUP BY b.id
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list buckets' });
  }
});

// POST /api/storage/buckets
router.post('/buckets', authenticate, async (req, res) => {
  const { name, access = 'private' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!/^[a-z0-9-]{3,63}$/.test(name)) {
    return res.status(400).json({ error: 'Bucket name must be 3-63 lowercase letters, numbers, or hyphens' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO buckets (user_id, name, access) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, name, access === 'public' ? 'public' : 'private']
    );
    const bucket = result.rows[0];
    // Create directory for this bucket
    const bucketDir = path.join(STORAGE_ROOT, bucket.id);
    fs.mkdirSync(bucketDir, { recursive: true });
    await logActivity(req.user.id, 'storage', `Bucket created: ${name}`, bucket.id, { access });
    res.status(201).json(bucket);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Bucket name already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create bucket' });
  }
});

// PATCH /api/storage/buckets/:bucket — toggle public/private
router.patch('/buckets/:bucket', authenticate, async (req, res) => {
  const { access } = req.body;
  try {
    const result = await pool.query('SELECT * FROM buckets WHERE name = $1', [req.params.bucket]);
    const bucket = result.rows[0];
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });
    if (bucket.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const updated = await pool.query(
      `UPDATE buckets SET access = $1 WHERE id = $2 RETURNING *`,
      [access === 'public' ? 'public' : 'private', bucket.id]
    );
    await logActivity(req.user.id, 'storage', `Bucket access updated: ${bucket.name} → ${access}`, bucket.id);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update bucket' });
  }
});

// DELETE /api/storage/buckets/:bucket
router.delete('/buckets/:bucket', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM buckets WHERE name = $1', [req.params.bucket]);
    const bucket = result.rows[0];
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });
    if (bucket.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const countResult = await pool.query('SELECT COUNT(*) FROM objects WHERE bucket_id = $1', [bucket.id]);
    if (parseInt(countResult.rows[0].count) > 0) {
      return res.status(409).json({ error: 'Bucket is not empty. Delete all objects first.' });
    }

    // Remove bucket directory
    const bucketDir = path.join(STORAGE_ROOT, bucket.id);
    fs.rmSync(bucketDir, { recursive: true, force: true });

    await pool.query('DELETE FROM buckets WHERE id = $1', [bucket.id]);
    await logActivity(req.user.id, 'storage', `Bucket deleted: ${bucket.name}`, bucket.id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete bucket' });
  }
});

// GET /api/storage/buckets/:bucket/objects
router.get('/buckets/:bucket/objects', authenticate, async (req, res) => {
  try {
    const bucketResult = await pool.query('SELECT * FROM buckets WHERE name = $1', [req.params.bucket]);
    const bucket = bucketResult.rows[0];
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });
    if (bucket.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const objects = await pool.query(
      'SELECT id, key, size_bytes, content_type, created_at FROM objects WHERE bucket_id = $1 ORDER BY key',
      [bucket.id]
    );
    res.json(objects.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list objects' });
  }
});

// ─── S3-style REST endpoints ─────────────────────────────────────

// PUT /storage/:bucket/:key — upload file
router.put('/:bucket/:key(*)', authenticate, upload.single('file'), async (req, res) => {
  try {
    const bucketResult = await pool.query('SELECT * FROM buckets WHERE name = $1', [req.params.bucket]);
    const bucket = bucketResult.rows[0];
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });
    if (bucket.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const key = req.params.key;
    const destDir = path.join(STORAGE_ROOT, bucket.id, path.dirname(key));
    const destPath = path.join(STORAGE_ROOT, bucket.id, key);
    fs.mkdirSync(destDir, { recursive: true });
    fs.renameSync(req.file.path, destPath);

    const result = await pool.query(
      `INSERT INTO objects (bucket_id, key, size_bytes, content_type, storage_path)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (bucket_id, key) DO UPDATE
         SET size_bytes=$3, content_type=$4, storage_path=$5, created_at=NOW()
       RETURNING *`,
      [bucket.id, key, req.file.size, req.file.mimetype, destPath]
    );
    await logActivity(req.user.id, 'storage', `Object uploaded: ${bucket.name}/${key}`, result.rows[0].id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /storage/:bucket/:key — download file
router.get('/:bucket/:key(*)', async (req, res) => {
  try {
    const bucketResult = await pool.query('SELECT * FROM buckets WHERE name = $1', [req.params.bucket]);
    const bucket = bucketResult.rows[0];
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });

    // Private buckets require auth
    if (bucket.access === 'private') {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const jwt = require('jsonwebtoken');
      try {
        const user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        if (bucket.user_id !== user.id && user.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    const objectResult = await pool.query(
      'SELECT * FROM objects WHERE bucket_id = $1 AND key = $2',
      [bucket.id, req.params.key]
    );
    const obj = objectResult.rows[0];
    if (!obj) return res.status(404).json({ error: 'Object not found' });

    if (!fs.existsSync(obj.storage_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', obj.content_type);
    res.setHeader('Content-Length', obj.size_bytes);
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(obj.key)}"`);
    fs.createReadStream(obj.storage_path).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// DELETE /storage/:bucket/:key
router.delete('/:bucket/:key(*)', authenticate, async (req, res) => {
  try {
    const bucketResult = await pool.query('SELECT * FROM buckets WHERE name = $1', [req.params.bucket]);
    const bucket = bucketResult.rows[0];
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });
    if (bucket.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const objectResult = await pool.query(
      'SELECT * FROM objects WHERE bucket_id = $1 AND key = $2',
      [bucket.id, req.params.key]
    );
    const obj = objectResult.rows[0];
    if (!obj) return res.status(404).json({ error: 'Object not found' });

    fs.rmSync(obj.storage_path, { force: true });
    await pool.query('DELETE FROM objects WHERE id = $1', [obj.id]);
    await logActivity(req.user.id, 'storage', `Object deleted: ${bucket.name}/${obj.key}`, obj.id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
