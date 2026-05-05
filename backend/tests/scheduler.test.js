const request = require('supertest');
const { app } = require('../server');
const pool = require('../db/pool');

// Prevent real HTTP calls and shell commands during tests
jest.mock('child_process', () => ({
  exec: jest.fn((_cmd, _opts, cb) => cb(null, 'mock output', '')),
}));
jest.mock('http', () => {
  const actual = jest.requireActual('http');
  return {
    ...actual,
    request: jest.fn((_url, _opts, cb) => {
      const res = { statusCode: 200, on: jest.fn((ev, fn) => { if (ev === 'end') fn(); }) };
      cb(res);
      return { on: jest.fn(), setTimeout: jest.fn(), end: jest.fn() };
    }),
  };
});

let adminToken;
let createdJobId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@mycloud.local', password: 'admin123' });
  adminToken = res.body.token;
});

afterAll(async () => {
  if (createdJobId) {
    await pool.query('DELETE FROM cron_jobs WHERE id=$1', [createdJobId]);
  }
});

describe('POST /api/scheduler', () => {
  it('creates a command-type cron job', async () => {
    const res = await request(app)
      .post('/api/scheduler')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'test-job', expression: '* * * * *', type: 'command', command: 'echo hello' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('test-job');
    expect(res.body.type).toBe('command');
    expect(res.body.status).toBe('active');
    createdJobId = res.body.id;
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/scheduler')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expression: '* * * * *', type: 'command', command: 'echo hi' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid cron expression', async () => {
    const res = await request(app)
      .post('/api/scheduler')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'bad-cron', expression: 'not-a-cron', type: 'command', command: 'echo hi' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for command type without command field', async () => {
    const res = await request(app)
      .post('/api/scheduler')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'no-cmd', expression: '* * * * *', type: 'command' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for http type without httpUrl field', async () => {
    const res = await request(app)
      .post('/api/scheduler')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'no-url', expression: '* * * * *', type: 'http' });
    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/scheduler')
      .send({ name: 'anon', expression: '* * * * *', type: 'command', command: 'echo' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/scheduler', () => {
  it('lists jobs including the created one', async () => {
    const res = await request(app)
      .get('/api/scheduler')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((j) => j.id === createdJobId)).toBe(true);
  });
});

describe('POST /api/scheduler/:id/run', () => {
  it('triggers the job immediately', async () => {
    const res = await request(app)
      .post(`/api/scheduler/${createdJobId}/run`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/triggered/i);
  });

  it('returns 404 for unknown job', async () => {
    const res = await request(app)
      .post('/api/scheduler/00000000-0000-0000-0000-000000000000/run')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/scheduler/:id/runs', () => {
  it('returns run history after a trigger', async () => {
    // Allow the async executeJob to write to DB before querying
    await new Promise((r) => setTimeout(r, 200));

    const res = await request(app)
      .get(`/api/scheduler/${createdJobId}/runs`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});

describe('PATCH /api/scheduler/:id (pause / resume)', () => {
  it('pauses the job', async () => {
    const res = await request(app)
      .patch(`/api/scheduler/${createdJobId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'paused' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paused');
  });

  it('resumes the job', async () => {
    const res = await request(app)
      .patch(`/api/scheduler/${createdJobId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  it('returns 404 for unknown job', async () => {
    const res = await request(app)
      .patch('/api/scheduler/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'paused' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/scheduler/:id', () => {
  it('deletes the job', async () => {
    const res = await request(app)
      .delete(`/api/scheduler/${createdJobId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
    createdJobId = null;
  });

  it('returns 404 for unknown job', async () => {
    const res = await request(app)
      .delete('/api/scheduler/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
