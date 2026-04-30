require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Run schema if tables don't exist yet (idempotent)
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);

    // Create admin user (idempotent)
    const hash = bcrypt.hashSync('admin123', 10);
    const userResult = await pool.query(
      `INSERT INTO users (email, password, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      ['admin@mycloud.local', hash]
    );
    const adminId = userResult.rows[0].id;

    // Create default namespace for admin
    const nsResult = await pool.query(
      `INSERT INTO namespaces (user_id, name)
       VALUES ($1, 'default')
       ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [adminId]
    );
    const nsId = nsResult.rows[0].id;

    // Sample activity log entries
    const sampleLogs = [
      [adminId, 'auth', 'Admin account initialized', null, {}],
      [adminId, 'networking', 'Default namespace created', nsId, { name: 'default' }],
      [adminId, 'compute', 'Platform ready — create your first instance', null, {}],
    ];
    for (const [uid, svc, action, rid, meta] of sampleLogs) {
      await pool.query(
        `INSERT INTO activity_logs (user_id, service, action, resource_id, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [uid, svc, action, rid, JSON.stringify(meta)]
      );
    }

    console.log('Seed complete. Admin: admin@mycloud.local / admin123');
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
