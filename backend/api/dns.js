const express = require('express');
const pool = require('../db/pool');
const logActivity = require('../db/logActivity');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const VALID_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS'];

// GET /api/dns/zones
router.get('/zones', async (req, res) => {
  try {
    const zones = await pool.query(
      'SELECT * FROM dns_zones WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]
    );
    for (const z of zones.rows) {
      const cnt = await pool.query('SELECT COUNT(*) FROM dns_records WHERE zone_id=$1', [z.id]);
      z.record_count = parseInt(cnt.rows[0].count);
    }
    res.json(zones.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list zones' });
  }
});

// POST /api/dns/zones
router.post('/zones', async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain required' });
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return res.status(400).json({ error: 'Invalid domain format' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO dns_zones (user_id, domain) VALUES ($1,$2) RETURNING *',
      [req.user.id, domain.toLowerCase()]
    );
    const zone = { ...result.rows[0], record_count: 0 };
    await logActivity(req.user.id, 'dns', `DNS zone created: ${domain}`, zone.id);
    res.status(201).json(zone);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Domain already exists' });
    res.status(500).json({ error: 'Failed to create zone' });
  }
});

// DELETE /api/dns/zones/:id
router.delete('/zones/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dns_zones WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const zone = result.rows[0];
    if (!zone) return res.status(404).json({ error: 'Zone not found' });
    await pool.query('DELETE FROM dns_zones WHERE id=$1', [zone.id]);
    await logActivity(req.user.id, 'dns', `DNS zone deleted: ${zone.domain}`, zone.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete zone' });
  }
});

// GET /api/dns/zones/:id/records
router.get('/zones/:id/records', async (req, res) => {
  try {
    const zoneRes = await pool.query('SELECT * FROM dns_zones WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!zoneRes.rows[0]) return res.status(404).json({ error: 'Zone not found' });
    const records = await pool.query(
      'SELECT * FROM dns_records WHERE zone_id=$1 ORDER BY type, name',
      [req.params.id]
    );
    res.json(records.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list records' });
  }
});

// POST /api/dns/zones/:id/records
router.post('/zones/:id/records', async (req, res) => {
  const { type, name, value, ttl = 300 } = req.body;
  if (!type || !name || !value) return res.status(400).json({ error: 'type, name, value required' });
  if (!VALID_TYPES.includes(type.toUpperCase())) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }
  try {
    const zoneRes = await pool.query('SELECT * FROM dns_zones WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!zoneRes.rows[0]) return res.status(404).json({ error: 'Zone not found' });
    const result = await pool.query(
      'INSERT INTO dns_records (zone_id, type, name, value, ttl) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, type.toUpperCase(), name, value, parseInt(ttl)]
    );
    await logActivity(req.user.id, 'dns', `DNS record added: ${type} ${name}`, result.rows[0].id, { zone: zoneRes.rows[0].domain });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create record' });
  }
});

// DELETE /api/dns/zones/:id/records/:recordId
router.delete('/zones/:id/records/:recordId', async (req, res) => {
  try {
    const zoneRes = await pool.query('SELECT * FROM dns_zones WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!zoneRes.rows[0]) return res.status(404).json({ error: 'Zone not found' });
    const deleted = await pool.query(
      'DELETE FROM dns_records WHERE id=$1 AND zone_id=$2 RETURNING *',
      [req.params.recordId, req.params.id]
    );
    if (!deleted.rows[0]) return res.status(404).json({ error: 'Record not found' });
    await logActivity(req.user.id, 'dns', `DNS record deleted: ${deleted.rows[0].type} ${deleted.rows[0].name}`, req.params.recordId);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

module.exports = router;
