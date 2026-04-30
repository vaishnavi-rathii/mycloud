const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/tags?resourceId=&resourceType=
router.get('/', async (req, res) => {
  const { resourceId, resourceType } = req.query;
  try {
    let q = 'SELECT * FROM resource_tags WHERE user_id=$1';
    const params = [req.user.id];
    if (resourceId) { q += ` AND resource_id=$${params.length+1}`; params.push(resourceId); }
    if (resourceType) { q += ` AND resource_type=$${params.length+1}`; params.push(resourceType); }
    q += ' ORDER BY key';
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list tags' });
  }
});

// POST /api/tags — upsert tags for a resource
router.post('/', async (req, res) => {
  const { resourceId, resourceType, tags } = req.body;
  if (!resourceId || !resourceType || !Array.isArray(tags)) {
    return res.status(400).json({ error: 'resourceId, resourceType, and tags[] required' });
  }
  try {
    for (const { key, value } of tags) {
      if (!key) continue;
      await pool.query(
        `INSERT INTO resource_tags (user_id, resource_type, resource_id, key, value)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (resource_id, key) DO UPDATE SET value=EXCLUDED.value`,
        [req.user.id, resourceType, resourceId, key, value || '']
      );
    }
    const result = await pool.query(
      'SELECT * FROM resource_tags WHERE resource_id=$1 ORDER BY key', [resourceId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save tags' });
  }
});

// DELETE /api/tags/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM resource_tags WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// GET /api/tags/search?q= — global resource search by tag
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT * FROM resource_tags
       WHERE user_id=$1 AND (key ILIKE $2 OR value ILIKE $2 OR resource_id::text ILIKE $2)
       ORDER BY resource_type, resource_id LIMIT 50`,
      [req.user.id, `%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
