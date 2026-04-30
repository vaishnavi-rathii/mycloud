const request = require('supertest');
const { app } = require('../server');
const pool = require('../db/pool');

// Mock dockerode so tests don't need a real Docker daemon
jest.mock('../docker/client', () => {
  const mockContainer = {
    id: 'mock_container_id_abc123',
    start: jest.fn().mockResolvedValue({}),
    stop: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
    stats: jest.fn().mockResolvedValue({
      cpu_stats: { cpu_usage: { total_usage: 1000000 }, system_cpu_usage: 10000000, online_cpus: 2 },
      precpu_stats: { cpu_usage: { total_usage: 900000 }, system_cpu_usage: 9000000 },
      memory_stats: { usage: 52428800, limit: 268435456 },
    }),
  };
  return {
    createContainer: jest.fn().mockResolvedValue(mockContainer),
    getContainer: jest.fn().mockReturnValue(mockContainer),
    pull: jest.fn((image, cb) => {
      const mockStream = { on: jest.fn() };
      cb(null, mockStream);
    }),
    modem: {
      followProgress: jest.fn((stream, cb) => cb(null)),
    },
  };
});

let adminToken;
let createdInstanceId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@mycloud.local', password: 'admin123' });
  adminToken = res.body.token;
});

afterAll(async () => {
  if (createdInstanceId) {
    await pool.query('DELETE FROM instances WHERE id=$1', [createdInstanceId]);
  }
  // Pool is shared; closed by globalTeardown
});

describe('GET /api/compute/instance-types', () => {
  it('returns 3 instance types', async () => {
    const res = await request(app).get('/api/compute/instance-types');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
    const names = res.body.map((t) => t.name);
    expect(names).toContain('small');
    expect(names).toContain('medium');
    expect(names).toContain('large');
  });
});

describe('GET /api/compute/instances', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/compute/instances');
    expect(res.status).toBe(401);
  });

  it('returns empty array for admin initially', async () => {
    const res = await request(app)
      .get('/api/compute/instances')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/compute/instances', () => {
  it('creates an instance (mocked Docker)', async () => {
    const res = await request(app)
      .post('/api/compute/instances')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'test-instance', image: 'nginx:latest', instanceType: 'small' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('test-instance');
    expect(res.body.status).toBe('running');
    expect(res.body.instance_type).toBe('small');
    createdInstanceId = res.body.id;
  });

  it('returns 400 for missing name', async () => {
    const res = await request(app)
      .post('/api/compute/instances')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ image: 'nginx', instanceType: 'small' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid instanceType', async () => {
    const res = await request(app)
      .post('/api/compute/instances')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'x', image: 'nginx', instanceType: 'gigantic' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/compute/instances/:id/stop', () => {
  it('stops the instance', async () => {
    const res = await request(app)
      .post(`/api/compute/instances/${createdInstanceId}/stop`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/compute/instances/:id', () => {
  it('deletes the instance', async () => {
    const res = await request(app)
      .delete(`/api/compute/instances/${createdInstanceId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
    createdInstanceId = null;
  });

  it('returns 404 for unknown instance', async () => {
    const res = await request(app)
      .delete('/api/compute/instances/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
