CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT        UNIQUE NOT NULL,
    password    TEXT        NOT NULL,
    role        TEXT        NOT NULL DEFAULT 'user',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS namespaces (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name               TEXT        NOT NULL,
    docker_network_id  TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS firewall_rules (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace_id  UUID        NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    direction     TEXT        NOT NULL,
    port          INT         NOT NULL,
    protocol      TEXT        NOT NULL DEFAULT 'tcp',
    action        TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instances (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    namespace_id    UUID        REFERENCES namespaces(id) ON DELETE SET NULL,
    name            TEXT        NOT NULL,
    image           TEXT        NOT NULL,
    instance_type   TEXT        NOT NULL,
    container_id    TEXT,
    status          TEXT        NOT NULL DEFAULT 'stopped',
    cpu_limit       TEXT        NOT NULL,
    memory_limit    TEXT        NOT NULL,
    port_bindings   JSONB       DEFAULT '{}',
    cost_per_hour   NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS buckets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        UNIQUE NOT NULL,
    access      TEXT        NOT NULL DEFAULT 'private',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS objects (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id     UUID        NOT NULL REFERENCES buckets(id) ON DELETE CASCADE,
    key           TEXT        NOT NULL,
    size_bytes    BIGINT      NOT NULL DEFAULT 0,
    content_type  TEXT        NOT NULL DEFAULT 'application/octet-stream',
    storage_path  TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bucket_id, key)
);

CREATE TABLE IF NOT EXISTS managed_databases (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    namespace_id      UUID        REFERENCES namespaces(id) ON DELETE SET NULL,
    name              TEXT        NOT NULL,
    engine            TEXT        NOT NULL,
    version           TEXT        NOT NULL DEFAULT 'latest',
    container_id      TEXT,
    host_port         INT,
    status            TEXT        NOT NULL DEFAULT 'stopped',
    connection_string TEXT,
    cost_per_hour     NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
    service      TEXT        NOT NULL,
    action       TEXT        NOT NULL,
    resource_id  TEXT,
    metadata     JSONB       DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_snapshots (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start    TIMESTAMPTZ NOT NULL,
    period_end      TIMESTAMPTZ NOT NULL,
    compute_cost    NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    storage_cost    NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    database_cost   NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    total_cost      NUMERIC(10,4) NOT NULL DEFAULT 0.0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instances_user_id     ON instances(user_id);
CREATE INDEX IF NOT EXISTS idx_instances_status      ON instances(status);
CREATE INDEX IF NOT EXISTS idx_objects_bucket_id     ON objects(bucket_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_service ON activity_logs(service);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
