const request = require('supertest');
const { app } = require('../server');
const pool = require('../db/pool');

let adminToken;
let createdSecretId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@mycloud.local', password: 'admin123' });
  adminToken = res.body.token;
});

afterAll(async () => {
  if (createdSecretId) {
    await pool.query('DELETE FROM secrets WHERE id=$1', [createdSecretId]);
  }
});

describe('POST /api/secrets', () => {
  it('creates a secret and returns metadata (no value)', async () => {
    const res = await request(app)
      .post('/api/secrets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `test-secret-${Date.now()}`, value: 'super-secret-value', type: 'generic' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toMatch(/^test-secret-/);
    expect(res.body.encrypted_value).toBeUndefined();
    createdSecretId = res.body.id;
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/secrets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'some-value' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when value is missing', async () => {
    const res = await request(app)
      .post('/api/secrets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'no-value-secret' });
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate secret name', async () => {
    const row = await pool.query('SELECT name FROM secrets WHERE id=$1', [createdSecretId]);
    const name = row.rows[0].name;
    const res = await request(app)
      .post('/api/secrets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, value: 'another-value' });
    expect(res.status).toBe(409);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/secrets')
      .send({ name: 'unauthorized-secret', value: 'value' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/secrets', () => {
  it('lists secrets without exposing encrypted values', async () => {
    const res = await request(app)
      .get('/api/secrets')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const secret = res.body.find((s) => s.id === createdSecretId);
    expect(secret).toBeDefined();
    expect(secret.encrypted_value).toBeUndefined();
  });
});

describe('GET /api/secrets/:id/value', () => {
  it('returns a masked value by default', async () => {
    const res = await request(app)
      .get(`/api/secrets/${createdSecretId}/value`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.masked).toBe(true);
    expect(res.body.value).toMatch(/\*{4}/);
  });

  it('returns the plaintext value when reveal=true', async () => {
    const res = await request(app)
      .get(`/api/secrets/${createdSecretId}/value?reveal=true`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.masked).toBe(false);
    expect(res.body.value).toBe('super-secret-value');
  });

  it('returns 404 for unknown secret', async () => {
    const res = await request(app)
      .get('/api/secrets/00000000-0000-0000-0000-000000000000/value')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/secrets/:id', () => {
  it('updates the secret value and records a new version', async () => {
    const res = await request(app)
      .put(`/api/secrets/${createdSecretId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'updated-secret-value', description: 'updated desc' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('updated desc');

    const reveal = await request(app)
      .get(`/api/secrets/${createdSecretId}/value?reveal=true`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(reveal.body.value).toBe('updated-secret-value');
  });

  it('returns 404 for unknown secret', async () => {
    const res = await request(app)
      .put('/api/secrets/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/secrets/:id/versions', () => {
  it('returns version history with at least 2 entries after update', async () => {
    const res = await request(app)
      .get(`/api/secrets/${createdSecretId}/versions`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });
});

describe('DELETE /api/secrets/:id', () => {
  it('deletes the secret', async () => {
    const res = await request(app)
      .delete(`/api/secrets/${createdSecretId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
    createdSecretId = null;
  });

  it('returns 404 for already-deleted secret', async () => {
    const res = await request(app)
      .delete('/api/secrets/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
