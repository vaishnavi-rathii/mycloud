require('dotenv').config();
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS secrets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'generic',
        encrypted_value TEXT NOT NULL,
        description TEXT,
        rotation_enabled BOOLEAN DEFAULT FALSE,
        last_rotated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, name)
      );

      CREATE TABLE IF NOT EXISTS secret_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        secret_id UUID NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
        encrypted_value TEXT NOT NULL,
        version INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS load_balancers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        algorithm TEXT NOT NULL DEFAULT 'round_robin',
        health_check_path TEXT NOT NULL DEFAULT '/health',
        health_check_interval INT NOT NULL DEFAULT 30,
        port INT NOT NULL DEFAULT 80,
        status TEXT NOT NULL DEFAULT 'active',
        request_count BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS lb_targets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lb_id UUID NOT NULL REFERENCES load_balancers(id) ON DELETE CASCADE,
        instance_id UUID REFERENCES instances(id) ON DELETE SET NULL,
        host TEXT NOT NULL,
        port INT NOT NULL,
        weight INT NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'healthy',
        last_health_check TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cron_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        expression TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'command',
        command TEXT,
        http_url TEXT,
        http_method TEXT DEFAULT 'GET',
        status TEXT NOT NULL DEFAULT 'active',
        last_run_at TIMESTAMPTZ,
        last_run_status TEXT,
        next_run_at TIMESTAMPTZ,
        run_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cron_job_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        output TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS dns_zones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        domain TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dns_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        zone_id UUID NOT NULL REFERENCES dns_zones(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        ttl INT NOT NULL DEFAULT 300,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS resource_tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(resource_id, key)
      );

      CREATE TABLE IF NOT EXISTS iam_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        permissions JSONB NOT NULL DEFAULT '{}',
        api_key TEXT UNIQUE,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS iam_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked BOOLEAN DEFAULT FALSE
      );
    `);
    console.log('Migration complete');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
