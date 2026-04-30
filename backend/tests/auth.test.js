const request = require('supertest');
const { app } = require('../server');
const pool = require('../db/pool');

let adminToken;
let userId;

beforeAll(async () => {
  // Seed is run at startup via docker-compose; in test env ensure admin exists
  const exists = await pool.query("SELECT id FROM users WHERE email='admin@mycloud.local'");
  if (!exists.rows[0]) {
    const bcrypt = require('bcryptjs');
    await pool.query(
      `INSERT INTO users (email, password, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
      ['admin@mycloud.local', bcrypt.hashSync('admin123', 10)]
    );
  }
});

afterAll(async () => {
  // Pool is shared; closed by globalTeardown
});

describe('POST /api/auth/register', () => {
  const email = `test_${Date.now()}@example.com`;

  it('registers a new user and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'test1234' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(email);
    userId = res.body.user.id;
  });

  it('returns 409 for duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'another' });
    expect(res.status).toBe(409);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'test' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in admin and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@mycloud.local', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('admin');
    adminToken = res.body.token;
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@mycloud.local', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user profile with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('admin@mycloud.local');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer badtoken');
    expect(res.status).toBe(401);
  });
});
